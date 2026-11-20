// Snowballs and snowmen (Frostpane's fp-snowballs + fp-snowman, cut down for one canvas).
//
// Sweeping the mouse slowly through settled snow gathers it into a seed that becomes a snowball; pushing a ball rolls
// it (and it picks up snow). Balls can be grabbed, dragged and thrown; a hard hit shatters them. A ball dropped on
// another one stacks; three or more stacked make a snowman, which can be dressed up (hat, face, arms, clothes) with a
// small card. Standing snowmen and their looks are kept per visitor (best effort) and come back on the next visit.

import { speckSprite } from './snow-art.js';
import {
  ITEM_NAMES,
  TABS,
  applyChip,
  ballSprite,
  chipIcon,
  classicLook,
  isClassic,
  lookKey,
  readLook,
  selectedChip,
  sphereSprite,
  spriteHalf,
  writeLook,
} from './snowman-art.js';

const TAU = Math.PI * 2;

// Values from Frostpane's fp-snowballs (sizes in CSS px).
const MAX_BALLS = 18;
const MIN_RADIUS = 6;
const MAX_RADIUS = 48;
const GRAVITY = 1800;
const FRICTION = 3;
const STACK_SPACING = 0.82;
const SEED_AREA = 90;
const SEED_WINDOW = 0.5;
const SEED_NEAR = 60;
const TO_BALL = 0.75;
const TO_SEED = 0.4;
const GROW = 1.5;
const REACH = 14;
const SLOWEST_GATHER = 350;
const CARVE_RADIUS = 10;
const THROWN_AT = 500;
const THROW_MAX = 1500;
const SHATTER_AT = 750;
const PRESS_MOVE = 4;
const MAX_PUFFS = 300;
const PUFF_SIZES = [1.1, 1.7, 2.4];
const REMEMBER_EVERY = 3;
const MAX_SAVED = 24;
const MAX_STACK = 12;
const RESTORE_PATIENCE = 5;
const FADE_TIME = 1.5;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const grown = (r, area) => Math.min(MAX_RADIUS, Math.sqrt(r * r + (area * GROW) / Math.PI));

/**
 * @typedef {Object} Ball
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} r
 * @property {number} vx
 * @property {number} vy
 * @property {number} rot
 * @property {'ledge'|'ball'|'air'|'drag'} kind ledge = resting on a surface, ball = stacked on `on`
 * @property {any} surface
 * @property {number} off x offset from `surface.left`
 * @property {number} on id of the ball it stands on
 * @property {boolean} thrown
 * @property {'plain'|'head'|'body'} decor
 * @property {number} seed
 * @property {import('./snowman-art.js').Look|null} look (a stack's base keeps the snowman's look)
 * @property {import('./snowman-art.js').Look|null} wear look drawn on this ball (head / body)
 * @property {HTMLCanvasElement|null} spr
 * @property {string} sprKey
 */

/** CSS path of an element, stable across visits of the same page (id, else nth-of-type chain). @param {Element} el */
function pathOf(el) {
  const esc = (s) => (window.CSS?.escape ? CSS.escape(s) : s);
  if (el.id) return '#' + esc(el.id);
  const parts = [];
  let e = el;
  while (e && e !== document.body && parts.length < 16) {
    if (e.id) {
      parts.unshift('#' + esc(e.id));
      return parts.join('>');
    }
    let i = 1;
    for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++;
    parts.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${i})`);
    e = e.parentElement;
  }
  return e === document.body ? 'body>' + parts.join('>') : null;
}

/** @param {import('../host.js').Host} host */
export function createSnowballs(host) {
  const config = host.config;
  /** @type {Ball[]} */
  const balls = [];
  /** @type {Ball[]} reused draw order */
  const order = [];
  /** @type {{x:number,y:number,vx:number,vy:number,life:number,max:number,s:number}[]} */
  const puffs = [];
  let nextId = 1;
  let now = 0;
  let seed = null;
  let fade = 1;
  let wasActive = false;

  // Pointer.
  /** @type {null | {id:number, x:number, y:number, dx:number, dy:number, dragging:boolean}} */
  let press = null;
  let lastPt = -1;
  let lastX = 0;
  let lastY = 0;

  // Sprites.
  /** @type {HTMLCanvasElement[]} */
  let puffSprites = [];
  /** @type {Map<number, HTMLCanvasElement>} */
  const spheres = new Map();
  let spriteFor = '';

  // Persistence.
  /** @type {any[]} records not standing here (other pages, not found yet) */
  let kept = [];
  /** @type {any[]} records to put back on this page */
  let pending = [];
  let restoreStart = 0;
  let restoreTry = 0;
  let rememberAt = REMEMBER_EVERY;
  let lastSaved = '';

  const snow = () => /** @type {any} */ (host.layer('snow'));
  const active = () => host.shown.weather === 'snow' && config.snowballs;

  function buildSprites() {
    const key = `${host.dpr}|${host.light}`;
    if (key === spriteFor) return;
    spriteFor = key;
    puffSprites = PUFF_SIZES.map((r) => speckSprite(r, host.dpr, host.light));
    spheres.clear();
    for (const b of balls) b.sprKey = '';
  }

  // ---- stacks ------------------------------------------------------------------------------------------------------

  const byId = (id) => {
    for (const b of balls) if (b.id === id) return b;
    return null;
  };
  const riderOf = (b) => {
    for (const o of balls) if (o.kind === 'ball' && o.on === b.id) return o;
    return null;
  };

  /** The bottom ball of b's stack. */
  function baseOf(b) {
    let cur = b;
    for (let i = 0; i < 60 && cur && cur.kind === 'ball'; i++) {
      const next = byId(cur.on);
      if (!next) break;
      cur = next;
    }
    return cur;
  }

  function stackSize(base) {
    let n = 0;
    for (let cur = base; cur && n < 60; cur = riderOf(cur)) n++;
    return n;
  }

  /** True when `b` stands (directly or higher up) on `base`. */
  function restsOn(b, base) {
    let cur = b;
    for (let i = 0; i < 60 && cur && cur.on; i++) {
      if (cur.on === base.id) return true;
      cur = byId(cur.on);
    }
    return false;
  }

  function isSnowman(base) {
    return !!base && config.snowmen && base.kind === 'ledge' && stackSize(base) >= 3;
  }

  /** The top two balls of a stack of 3+ wear the snowman (when snowmen are on). */
  function dress() {
    for (const b of balls) {
      b.decor = 'plain';
      b.wear = null;
    }
    if (!config.snowmen) return;
    for (const b of balls) {
      if (b.kind === 'ball') continue;
      let n = 1;
      let top = b;
      for (let cur = riderOf(b); cur && n < 60; cur = riderOf(cur)) {
        n++;
        top = cur;
      }
      if (n < 3) continue;
      const look = b.look ?? classicLook();
      top.decor = 'head';
      top.wear = look;
      const body = byId(top.on);
      if (body) {
        body.decor = 'body';
        body.wear = look;
      }
    }
  }

  // ---- balls -------------------------------------------------------------------------------------------------------

  /** @returns {Ball} */
  function makeBall(x, y, r) {
    return {
      id: nextId++,
      x,
      y,
      r,
      vx: 0,
      vy: 0,
      rot: 0,
      kind: 'air',
      surface: null,
      off: 0,
      on: 0,
      thrown: false,
      decor: 'plain',
      seed: (Math.random() * 1e9) | 0,
      look: null,
      wear: null,
      spr: null,
      sprKey: '',
    };
  }

  function rest(b, s) {
    b.kind = 'ledge';
    b.surface = s;
    b.off = b.x - s.left;
    if (!s.ground) host.surfaces.pin(s);
  }

  function spawnBall(s, x, area) {
    if (balls.length >= MAX_BALLS) return;
    const r = clamp(Math.sqrt((area * GROW) / Math.PI), MIN_RADIUS, MAX_RADIUS);
    const b = makeBall(x, s.top - r + 1, r);
    rest(b, s);
    balls.push(b);
    host.wake?.();
  }

  function puff(x, y, vx, vy) {
    if (puffs.length >= MAX_PUFFS) return;
    const life = rand(0.5, 1);
    puffs.push({ x, y, vx, vy, life, max: life, s: Math.floor(rand(0, PUFF_SIZES.length)) });
  }

  function remove(b) {
    const i = balls.indexOf(b);
    if (i >= 0) balls.splice(i, 1);
  }

  /** Its rider (if any) now falls on its own. */
  function release(b) {
    const rider = riderOf(b);
    if (rider) {
      rider.kind = 'air';
      rider.on = 0;
      rider.vx = b.vx * 0.5;
      rider.vy = -40;
      if (b.look && !rider.look) rider.look = b.look;
    }
  }

  function shatter(b, s) {
    const n = Math.min(26, Math.round(b.r * 1.1));
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI, TAU);
      const sp = rand(80, 260);
      puff(b.x + rand(-b.r, b.r) * 0.5, b.y, Math.cos(a) * sp + b.vx * 0.15, Math.sin(a) * sp);
    }
    const sl = snow();
    if (s && sl) {
      const area = Math.PI * b.r * b.r * 0.3;
      const k = Math.max(1, Math.round(b.r / 6));
      for (let i = 0; i < k; i++) sl.deposit(s, b.x - b.r + ((i + 0.5) * 2 * b.r) / k, area / k);
    }
    release(b);
    remove(b);
  }

  /** Smash a whole stack, top down (yeti). */
  function smashStack(base) {
    const chain = [];
    for (let cur = base; cur && chain.length < 60; cur = riderOf(cur)) chain.push(cur);
    for (let i = chain.length - 1; i >= 0; i--) shatter(chain[i], chain[i].kind === 'ledge' ? chain[i].surface : null);
  }

  function land(b, s) {
    if (b.thrown && Math.hypot(b.vx, b.vy) > SHATTER_AT) {
      shatter(b, s);
      return;
    }
    rest(b, s);
    b.vx *= 0.5;
    b.vy = 0;
    b.thrown = false;
  }

  function stepBall(b, dt) {
    if (b.kind === 'drag') return;

    if (b.kind === 'ball') {
      const base = byId(b.on);
      if (!base) {
        b.kind = 'air';
        b.on = 0;
      } else {
        b.x = base.x;
        b.y = base.y - (base.r + b.r) * STACK_SPACING;
        b.vx = base.vx;
        b.vy = base.vy;
        return;
      }
    }

    if (b.kind === 'ledge') {
      const s = b.surface;
      if (!s || (!s.ground && (!s.el || !s.el.isConnected))) {
        b.kind = 'air';
        b.surface = null;
      } else {
        b.off += b.vx * dt;
        b.vx *= Math.exp(-FRICTION * dt);
        if (Math.abs(b.vx) < 3) b.vx = 0;
        b.rot += (b.vx * dt) / b.r;
        b.x = s.left + b.off;
        b.y = s.top - b.r + 1;
        // Rolling through snow picks it up.
        if (Math.abs(b.vx) > 15 && !riderOf(b)) {
          const got = snow()?.take(s, b.x, Math.abs(b.vx) * dt * 0.24, 0, 0) ?? 0;
          if (got > 0) b.r = grown(b.r, got * 3);
        }
        if (b.off < -b.r * 0.3 || b.off > s.width + b.r * 0.3) {
          b.kind = 'air';
          b.surface = null;
          b.vy = 0;
        }
        return;
      }
    }

    // In the air.
    const prevBottom = b.y + b.r;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += (b.vx * dt) / b.r / 2;
    const bottom = b.y + b.r;

    if (b.vy > 0) {
      for (const o of balls) {
        if (o === b || o.kind === 'drag' || o.kind === 'air' || restsOn(o, b)) continue;
        const dx = b.x - o.x;
        const dy = b.y - o.y;
        if (dy >= 0 || dx * dx + dy * dy > (b.r + o.r) ** 2) continue;
        if (b.thrown && Math.hypot(b.vx, b.vy) > SHATTER_AT) {
          shatter(b, null);
          return;
        }
        if (riderOf(o) || stackSize(baseOf(o)) >= MAX_STACK) {
          b.vx += (dx >= 0 ? 1 : -1) * 120;
          continue;
        }
        b.kind = 'ball';
        b.on = o.id;
        b.vx = 0;
        b.vy = 0;
        b.thrown = false;
        return;
      }
      const live = host.surfaces.live;
      for (let k = 0; k < live.length; k++) {
        const s = live[k];
        if (b.x < s.left || b.x >= s.left + s.width) continue;
        if (prevBottom <= s.top + 1 && bottom >= s.top) {
          land(b, s);
          return;
        }
      }
    }
    if (b.y - b.r > host.H + 60 || b.x < -300 || b.x > host.W + 300) {
      release(b);
      remove(b);
    }
  }

  /** Keeps balls resting on the same surface from overlapping. */
  function separate() {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.kind !== 'ledge') continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.kind !== 'ledge' || b.surface !== a.surface) continue;
        const dx = b.off - a.off;
        const min = (a.r + b.r) * 0.92;
        if (Math.abs(dx) >= min) continue;
        const push = (min - Math.abs(dx)) / 2;
        const s = dx >= 0 ? 1 : -1;
        a.off -= s * push;
        b.off += s * push;
        const v = (a.vx + b.vx) / 2;
        a.vx = v;
        b.vx = v;
      }
    }
  }

  // ---- pointer -----------------------------------------------------------------------------------------------------

  function sortOrder() {
    order.length = 0;
    for (const b of balls) order.push(b);
    const dragged = press?.dragging ? byId(press.id) : null;
    order.sort((a, b) => {
      const da = dragged && (a === dragged || restsOn(a, dragged)) ? 1 : 0;
      const db = dragged && (b === dragged || restsOn(b, dragged)) ? 1 : 0;
      return da - db || b.y - a.y;
    });
  }

  function hitBall(x, y) {
    for (let i = order.length - 1; i >= 0; i--) {
      const b = order[i];
      if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (b.r + 2) ** 2) return b;
    }
    return null;
  }

  /** The surface whose snow is under (x, y). */
  function pileAt(x, y, slack) {
    const sl = snow();
    if (!sl) return null;
    for (const s of host.surfaces.live) {
      if (x < s.left || x >= s.left + s.width) continue;
      if (y >= sl.pileTop(s, x) - slack && y <= s.top + 2) return s;
    }
    return null;
  }

  function carve(x, y, speed, pvx) {
    const s = pileAt(x, y, 1);
    if (!s) return;
    const area = snow().take(s, x, Infinity, CARVE_RADIUS, Math.max(0, s.top - y));
    if (area <= 0) return;

    if (speed > SLOWEST_GATHER) {
      // Too fast to gather: the snow flies up.
      const n = Math.min(8, Math.ceil(area / 15));
      for (let i = 0; i < n; i++) puff(x, y, pvx * 0.3 + rand(-60, 60), rand(-220, -60));
      return;
    }
    for (const b of balls) {
      if (b.kind === 'ledge' && !riderOf(b) && Math.hypot(b.x - x, b.y - y) < b.r + REACH) {
        b.r = grown(b.r, area * TO_BALL);
        return;
      }
    }
    const share = area * TO_SEED;
    if (seed && now - seed.t < SEED_WINDOW && Math.hypot(seed.x - x, seed.y - y) < SEED_NEAR) {
      seed.area += share;
      seed.x = x;
      seed.y = y;
      seed.t = now;
    } else {
      seed = { area: share, x, y, t: now };
    }
    if (seed.area >= SEED_AREA && !press) {
      spawnBall(s, x, seed.area);
      seed = null;
    }
  }

  /** Mouse moving over the page (not pressed): gather snow, push balls. */
  function sweep() {
    const p = host.pointer;
    if (p.t === lastPt) return;
    const fresh = lastPt >= 0 && host.t - lastPt < 0.25;
    lastPt = p.t;
    const fromX = lastX;
    const fromY = lastY;
    lastX = p.x;
    lastY = p.y;
    if (p.touch || p.down || press || !fresh) return;
    const speed = Math.hypot(p.vx, p.vy);
    const dist = Math.hypot(p.x - fromX, p.y - fromY);
    const n = Math.min(6, Math.max(1, Math.ceil(dist / 8)));
    for (let i = 1; i <= n; i++) carve(fromX + ((p.x - fromX) * i) / n, fromY + ((p.y - fromY) * i) / n, speed, p.vx);
    const over = hitBall(p.x, p.y);
    if (over && over.kind === 'ledge' && !riderOf(over) && Math.abs(p.vx) > 30) {
      // A slow push rolls the ball along.
      over.vx = clamp(p.vx, -500, 500) * 0.9;
    }
  }

  /** @param {Ball} b */
  function startDrag(b) {
    if (b.kind === 'ball') b.on = 0;
    b.kind = 'drag';
    b.surface = null;
    b.thrown = false;
    b.vx = 0;
    b.vy = 0;
  }

  function endDrag(b) {
    const p = host.pointer;
    // A pointer that stopped before letting go throws nothing.
    if (host.t - p.t > 0.08) {
      b.vx = 0;
      b.vy = 0;
    }
    let speed = Math.hypot(b.vx, b.vy);
    if (speed > THROW_MAX) {
      b.vx *= THROW_MAX / speed;
      b.vy *= THROW_MAX / speed;
      speed = THROW_MAX;
    }
    b.kind = 'air';
    if (speed > THROWN_AT) {
      b.thrown = true;
      return;
    }
    // Stack assist: dropped near the top of another ball, it sits on it.
    let base = null;
    for (const o of balls) {
      if (o === b || o.y <= b.y || Math.abs(o.x - b.x) >= o.r + 0.4 * b.r) continue;
      if (o.kind === 'drag' || o.kind === 'air' || riderOf(o) || restsOn(o, b)) continue;
      if (stackSize(baseOf(o)) >= MAX_STACK) continue;
      if (!base || o.y < base.y) base = o;
    }
    if (base) {
      b.kind = 'ball';
      b.on = base.id;
      b.vx = 0;
      b.vy = 0;
    }
  }

  // ---- dress-up card -----------------------------------------------------------------------------------------------

  /** @type {null | {el: HTMLElement, base: number, tab: string, grid: HTMLElement, tabs: HTMLButtonElement[], reset: HTMLButtonElement, x: number, y: number}} */
  let card = null;
  /** @type {Map<string, HTMLCanvasElement[]>} */
  const icons = new Map();

  const t = (key, fallback) => host.t9n(key, fallback);

  function iconsOf(tab) {
    const key = `${tab}|${host.dpr}`;
    let list = icons.get(key);
    if (!list) {
      list = Array.from({ length: 8 }, (_, i) => {
        const c = chipIcon(tab, i, host.dpr);
        c.style.cssText = 'position:static;inset:auto;width:44px;height:44px;max-width:none;display:block;pointer-events:none;z-index:auto';
        return c;
      });
      icons.set(key, list);
    }
    return list;
  }

  /**
   * A button drawn by the theme (Bootstrap classes), so the card looks like the rest of the site.
   *
   * @param {string} label
   * @param {string} classes
   */
  function button(label, classes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classes;
    b.textContent = label;
    return b;
  }

  function closeCard() {
    if (!card) return;
    card.el.remove();
    card = null;
    window.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  }

  function onOutside(e) {
    if (card && e.target instanceof Node && !card.el.contains(e.target)) closeCard();
  }

  function onKey(e) {
    if (card && e.key === 'Escape') {
      e.stopPropagation();
      closeCard();
    }
  }

  function renderCard() {
    if (!card) return;
    const base = byId(card.base);
    if (!base) return;
    const look = base.look ?? classicLook();
    const entry = TABS.find((x) => x[0] === card.tab) ?? TABS[0];
    const [tab] = entry;
    card.tabs.forEach((b, i) => {
      const on = TABS[i][0] === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const sel = selectedChip(look, tab);
    const list = iconsOf(tab);
    card.grid.replaceChildren(
      ...list.map((icon, i) => {
        const name = t(`dress.${tab}.${entry[1][i]}`, ITEM_NAMES[tab][i]);
        const b = button('', `btn btn-outline-secondary p-1 d-flex align-items-center justify-content-center${i === sel ? ' active' : ''}`);
        b.title = name;
        b.setAttribute('aria-label', name);
        b.setAttribute('aria-pressed', String(i === sel));
        b.appendChild(icon);
        b.addEventListener('click', () => {
          const bb = byId(card?.base ?? -1);
          if (!bb) return;
          bb.look = applyChip(bb.look ?? classicLook(), tab, i);
          if (isClassic(bb.look)) bb.look = null;
          rememberAt = Math.min(rememberAt, now + 0.5);
          renderCard();
          /** @type {HTMLElement|null} */ (card?.grid.children[i] ?? null)?.focus();
        });
        return b;
      }),
    );
    card.reset.disabled = isClassic(look);
  }

  /** @param {Ball} base */
  function openCard(base) {
    closeCard();
    const el = document.createElement('div');
    el.setAttribute('data-seasons-ui', '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', t('dress.title', 'Dress up the snowman'));
    // The look is the theme's own card; only the placement is set here.
    el.className = 'seasons-dress card shadow-lg';
    el.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:1040;width:292px;max-width:calc(100vw - 16px);';

    const head = document.createElement('div');
    head.className = 'card-header d-flex align-items-center justify-content-between gap-2';
    const title = document.createElement('span');
    title.className = 'fw-semibold';
    title.textContent = t('dress.title', 'Dress up the snowman');
    const close = button('', 'btn-close');
    close.setAttribute('aria-label', t('dress.close', 'Close'));
    close.addEventListener('click', closeCard);
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'card-body p-2';

    const tabRow = document.createElement('div');
    tabRow.setAttribute('role', 'tablist');
    tabRow.className = 'nav nav-pills nav-fill small mb-2';
    const tabNames = { hat: 'Hats', face: 'Faces', arms: 'Arms', outfit: 'Clothes' };
    const tabs = TABS.map(([id], i) => {
      const b = button(t(`dress.tab.${id}`, tabNames[id]), 'nav-link py-1 px-2');
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => {
        if (!card) return;
        card.tab = id;
        renderCard();
      });
      b.addEventListener('keydown', (e) => {
        if (!card || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        const j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
        card.tab = TABS[j][0];
        renderCard();
        card.tabs[j].focus();
      });
      return b;
    });
    tabRow.append(...tabs);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4, 1fr);gap:6px';

    const foot = document.createElement('div');
    foot.className = 'card-footer d-flex justify-content-end py-2';
    const reset = button(t('dress.reset', 'Start over'), 'btn btn-sm btn-link');
    reset.addEventListener('click', () => {
      const bb = byId(card?.base ?? -1);
      if (!bb) return;
      bb.look = null;
      rememberAt = Math.min(rememberAt, now + 0.5);
      renderCard();
    });
    foot.append(reset);

    body.append(tabRow, grid);
    el.append(head, body, foot);
    document.body.appendChild(el);
    card = { el, base: base.id, tab: 'hat', grid, tabs, reset, x: -1e9, y: -1e9 };
    renderCard();
    placeCard();
    window.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    tabs[0].focus({ preventScroll: true });
  }

  /** Beside the snowman: right when it fits, else left; bottom 20 px above its feet, kept on screen. */
  function placeCard() {
    if (!card) return;
    const base = byId(card.base);
    if (!base || !isSnowman(base)) {
      closeCard();
      return;
    }
    let wide = base.r;
    for (let cur = riderOf(base); cur; cur = riderOf(cur)) wide = Math.max(wide, cur.r * 1.8);
    const bottom = base.y + base.r;
    const w = card.el.offsetWidth;
    const h = card.el.offsetHeight;
    const right = base.x + wide + 10;
    const x = right + w <= host.W - 8 ? right : Math.max(8, base.x - wide - 10 - w);
    const y = clamp(bottom - 20 - h, 8, Math.max(8, host.H - h - 8));
    if (Math.abs(x - card.x) > 0.5 || Math.abs(y - card.y) > 0.5) {
      card.x = x;
      card.y = y;
      card.el.style.left = `${Math.round(x)}px`;
      card.el.style.top = `${Math.round(y)}px`;
    }
  }

  // ---- persistence -------------------------------------------------------------------------------------------------

  function loadSaved() {
    const data = host.load('snowmen', null);
    const list = Array.isArray(data?.list) ? data.list : [];
    const here = location.pathname;
    kept = [];
    pending = [];
    for (const rec of list) {
      if (!rec || !Array.isArray(rec.radii) || rec.radii.length < 2) continue;
      if (rec.place === 'ground' || (rec.place === 'surface' && rec.path === here && typeof rec.sel === 'string')) pending.push(rec);
      else kept.push(rec);
    }
    restoreStart = now;
    restoreTry = 0;
  }

  /** Put a saved stack back on surface `s`. */
  function build(rec, s) {
    const radii = rec.radii.slice(0, MAX_STACK).map((r) => clamp(Number(r) || MIN_RADIUS, MIN_RADIUS, MAX_RADIUS));
    if (balls.length + radii.length > MAX_BALLS) return false;
    const fx = clamp(Number(rec.fx) || 0.5, 0, 1);
    const off = clamp(fx * s.width, radii[0], Math.max(radii[0], s.width - radii[0]));
    const seeds = Array.isArray(rec.seeds) ? rec.seeds : [];
    let below = null;
    radii.forEach((r, i) => {
      const b = makeBall(s.left + off, s.top - r + 1, r);
      b.seed = Number(seeds[i]) | 0 || b.seed;
      if (below) {
        b.kind = 'ball';
        b.on = below.id;
        b.y = below.y - (below.r + r) * STACK_SPACING;
      } else {
        rest(b, s);
        b.off = off;
        b.look = rec.look ? readLook(rec.look) : null;
        if (b.look && isClassic(b.look)) b.look = null;
      }
      balls.push(b);
      below = b;
    });
    return true;
  }

  function tryRestore() {
    if (!pending.length || now < restoreTry) return;
    restoreTry = now + 0.3;
    const late = now - restoreStart > RESTORE_PATIENCE;
    for (let i = pending.length - 1; i >= 0; i--) {
      const rec = pending[i];
      let s = null;
      if (rec.place === 'ground') {
        s = host.surfaces.live.includes(host.surfaces.ground) ? host.surfaces.ground : null;
        if (!s) {
          kept.push(rec);
          pending.splice(i, 1);
          continue;
        }
      } else {
        let el = null;
        try {
          el = document.querySelector(rec.sel);
        } catch {
          el = null;
        }
        const cand = el ? host.surfaces.ofElement(el) : null;
        if (cand && host.surfaces.live.includes(cand)) s = cand;
      }
      if (s) {
        if (!build(rec, s)) kept.push(rec);
        pending.splice(i, 1);
      } else if (late) {
        kept.push(rec);
        pending.splice(i, 1);
      }
    }
  }

  /** Records of the snowmen standing on this page now. */
  function currentRecords() {
    const out = [];
    for (const b of balls) {
      if (!isSnowman(b)) continue;
      const s = b.surface;
      const radii = [];
      const seeds = [];
      for (let cur = b; cur && radii.length < MAX_STACK; cur = riderOf(cur)) {
        radii.push(Math.round(cur.r * 10) / 10);
        seeds.push(cur.seed);
      }
      const look = b.look ? writeLook(b.look) : null;
      const fx = s.width > 0 ? Math.round((b.off / s.width) * 1000) / 1000 : 0.5;
      if (s.ground) out.push({ place: 'ground', fx, radii, seeds, look });
      else {
        const sel = s.el ? pathOf(s.el) : null;
        if (sel) out.push({ place: 'surface', path: location.pathname, sel, fx, radii, seeds, look });
      }
    }
    return out;
  }

  function remember(force = false) {
    if (!active() || pending.length || fade < 1) return;
    if (!force && now < rememberAt) return;
    rememberAt = now + REMEMBER_EVERY;
    const cur = currentRecords();
    const list = kept.concat(cur).slice(-MAX_SAVED);
    const sig = JSON.stringify(list);
    if (sig === lastSaved) return;
    lastSaved = sig;
    host.save('snowmen', list.length ? { v: 1, list } : null);
  }

  // ---- layer -------------------------------------------------------------------------------------------------------

  function stepPuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const q = puffs[i];
      q.life -= dt;
      if (q.life <= 0) {
        puffs[i] = puffs[puffs.length - 1];
        puffs.pop();
        continue;
      }
      q.vy += 900 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
  }

  function step(dt) {
    now += dt;
    const on = active();
    if (on !== wasActive) {
      wasActive = on;
      if (on) {
        fade = 1;
        loadSaved();
      } else {
        // Another weather: the balls melt (the saved snowmen stay for the next snowfall).
        press = null;
        closeCard();
      }
    }
    if (!on) {
      if (balls.length || puffs.length) {
        fade = Math.max(0, fade - dt / FADE_TIME);
        stepPuffs(dt);
        if (fade <= 0) {
          balls.length = 0;
          puffs.length = 0;
        }
      }
      return;
    }

    tryRestore();
    sortOrder();
    sweep();

    // Free balls first, then stacked ones bottom-up.
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b && b.kind !== 'ball') stepBall(b, dt);
    }
    for (let pass = 0; pass < 4; pass++) {
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (b && b.kind === 'ball') stepBall(b, dt);
      }
    }
    separate();
    dress();
    stepPuffs(dt);
    if (card) placeCard();
    remember();
  }

  /** @param {CanvasRenderingContext2D} g @param {Ball} b */
  function drawBall(g, b) {
    if (b.surface?.occluded) return;
    const dpr = host.dpr;
    if (b.decor === 'plain') {
      const key = Math.max(MIN_RADIUS, Math.round(b.r));
      let img = spheres.get(key);
      if (!img) {
        if (spheres.size > 64) spheres.clear();
        img = sphereSprite(key, dpr);
        spheres.set(key, img);
      }
      const half = b.r + 2;
      g.drawImage(img, b.x - half, b.y - half, half * 2, half * 2);
      // A few specks so a rolling ball visibly turns.
      g.fillStyle = 'rgba(150,170,200,0.55)';
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = b.rot + (i * TAU) / 3;
        const d = b.r * (0.35 + 0.18 * i);
        const sx = b.x + Math.cos(a) * d;
        const sy = b.y + Math.sin(a) * d;
        const sr = Math.max(0.8, b.r * 0.07);
        g.moveTo(sx + sr, sy);
        g.arc(sx, sy, sr, 0, TAU);
      }
      g.fill();
      return;
    }
    const look = b.wear ?? classicLook();
    const key = `${b.decor}|${Math.round(b.r * 2)}|${lookKey(look)}|${b.seed}|${dpr}`;
    if (key !== b.sprKey) {
      b.spr = ballSprite(Math.round(b.r * 2) / 2, b.decor, look, b.seed, dpr);
      b.sprKey = key;
    }
    const half = spriteHalf(Math.round(b.r * 2) / 2, b.decor);
    g.drawImage(/** @type {HTMLCanvasElement} */ (b.spr), b.x - half, b.y - half, half * 2, half * 2);
  }

  /** @param {CanvasRenderingContext2D} g */
  function draw(g) {
    if (!balls.length && !puffs.length) return;
    if (fade < 1) g.globalAlpha = fade;
    if (!active()) sortOrder();
    for (const b of order) if (balls.includes(b)) drawBall(g, b);
    for (const q of puffs) {
      g.globalAlpha = Math.max(0, q.life / q.max) * fade;
      const r = PUFF_SIZES[q.s];
      g.drawImage(puffSprites[q.s], q.x - r - 1, q.y - r - 1, r * 2 + 2, r * 2 + 2);
    }
    g.globalAlpha = 1;
  }

  const layer = {
    name: 'snowballs',
    z: 70,
    step,
    draw,
    resize() {
      buildSprites();
      // Keep balls on the ground inside a narrower window.
      for (const b of balls) if (b.kind === 'ledge' && b.surface?.ground) b.off = Math.min(b.off, Math.max(b.r, host.W - b.r));
    },
    themeChanged() {
      buildSprites();
    },
    /** @param {import('../host.js').PointerState} p */
    pointerDown(p) {
      if (!active()) return false;
      sortOrder();
      const b = hitBall(p.x, p.y);
      if (!b) return false;
      press = { id: b.id, x: p.x, y: p.y, dx: b.x - p.x, dy: b.y - p.y, dragging: false };
      return true;
    },
    /** @param {import('../host.js').PointerState} p */
    pointerMove(p) {
      if (!press) return;
      const b = byId(press.id);
      if (!b) {
        press = null;
        return;
      }
      if (!press.dragging) {
        if (Math.hypot(p.x - press.x, p.y - press.y) <= PRESS_MOVE) return;
        press.dragging = true;
        startDrag(b);
      }
      b.x = p.x + press.dx;
      b.y = p.y + press.dy;
      b.vx = p.vx;
      b.vy = p.vy;
    },
    /** @param {import('../host.js').PointerState} p */
    pointerUp(p) {
      if (!press) return;
      const b = byId(press.id);
      const dragging = press.dragging;
      press = null;
      lastPt = p.t;
      if (!b) return;
      if (dragging) {
        endDrag(b);
        return;
      }
      // A click: a snowman opens its dress-up card.
      const base = baseOf(b);
      if (config.dressUp && isSnowman(base)) openCard(base);
    },
    /** @param {import('../host.js').PointerState} p */
    hover(p) {
      if (!active() || !balls.length) return null;
      const b = hitBall(p.x, p.y);
      if (!b) return null;
      return config.dressUp && isSnowman(baseOf(b)) && b.decor !== 'plain' ? 'pointer' : 'grab';
    },
    busy() {
      if (press?.dragging || puffs.length) return true;
      if (!active()) return balls.length > 0;
      for (const b of balls) if (b.kind === 'air' || b.kind === 'drag' || b.vx !== 0) return true;
      return false;
    },
    /** @param {any} cmd */
    command(cmd) {
      if (cmd?.type !== 'clear') return;
      balls.length = 0;
      puffs.length = 0;
      press = null;
      closeCard();
      pending = [];
      // Clear removes the snowmen of this page and the ground; other pages keep theirs.
      kept = kept.filter((r) => r.place === 'surface' && r.path !== location.pathname);
      lastSaved = '';
      if (active()) remember(true);
      else host.save('snowmen', kept.length ? { v: 1, list: kept } : null);
    },
    destroy() {
      remember(true);
      closeCard();
      balls.length = 0;
      puffs.length = 0;
    },

    /** Snowmen standing now: `{id, x, y, height, surface}` (y = the feet). */
    snowmen() {
      const out = [];
      for (const b of balls) {
        if (!isSnowman(b) || !host.surfaces.live.includes(b.surface)) continue;
        let top = b.y - b.r;
        for (let cur = riderOf(b); cur; cur = riderOf(cur)) top = cur.y - cur.r;
        const feet = b.y + b.r - 1;
        out.push({ id: b.id, x: b.x, y: feet, height: feet - top, surface: b.surface });
      }
      return out;
    },

    /** Smash the stack holding ball `id` (a snowman's id is its bottom ball). */
    smash(id) {
      const b = byId(id);
      if (b) smashStack(baseOf(b));
    },

    /**
     * Balls resting directly on `surface` (the bottom ball of each stack): `[{id, x, off, r}]`, `off` = x offset from
     * `surface.left`.
     */
    ballsOn(surface) {
      const out = [];
      for (const b of balls) if (b.kind === 'ledge' && b.surface === surface) out.push({ id: b.id, x: b.x, off: b.off, r: b.r });
      return out;
    },

    /**
     * Move the resting stack holding ball `id` to viewport x with speed vx (px/s), e.g. shoved by the plough. A stack
     * pushed past the end of its surface falls off.
     */
    push(id, x, vx) {
      const b = byId(id);
      if (!b) return;
      const base = baseOf(b);
      if (base.kind !== 'ledge' || !base.surface) return;
      base.off = x - base.surface.left;
      base.x = x;
      base.vx = vx;
    },
  };

  buildSprites();
  return layer;
}
