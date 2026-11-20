// Falling snow and settled snow (Frostpane's fp-snow, cut down for one canvas).
//
// Flakes: soft round flakes of several sizes and a few big out-of-focus "bokeh" flakes (2 %), each with its own
// fall speed, sway and wind coupling. Heavy snow multiplies the amount by 2.5.
// Settled snow: a 1-D height field per surface (one column every COL px) that grows where flakes land, slides down
// steep steps (angle of repose) and has rounded ends. Other layers read and change it through the API below.

import { bokehSprite, pileColors, speckSprite } from './snow-art.js';

const TAU = Math.PI * 2;

// Settled snow.
const COL = 4;
const LEDGE_DEPTH = 12;
const GROUND_DEPTH = 22;
/** Height (px) one flake of radius 1 leaves at the centre column. */
const DEPOSIT = 1.0;
const REPOSE = 0.7;
const RELAX_EVERY = 0.1;
const SPREAD = [0.1, 0.3, 0.6, 0.8, 0.6, 0.3, 0.1];
const SPREAD_SUM = 2.8;
/** Thaw speed while another weather shows (fraction per second, plus a constant px/s). */
const THAW = 0.9;

// Falling snow.
const FLAKES_PER_MEGAPIXEL = 120;
const MIN_FLAKES = 24;
const MAX_FLAKES = 260;
const HARD_CAP = 900;
const HEAVY = 2.5;
// Snow is light and slow at the default settings: about a third of the flakes, slower fall. The piles still grow
// fast, see the deposit below.
const SNOW_AMOUNT = 0.3;
const SNOW_SPEED = 0.6;
const BOKEH_SHARE = 0.02;

// Flake kinds.
const SPECK = 0;
const BOKEH = 3;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * @typedef {Object} Pile
 * @property {import('../surfaces.js').Surface} s
 * @property {number} cols
 * @property {number} cw column width
 * @property {Float32Array} h heights (px)
 * @property {Float32Array} cap max height per column (rounded ends)
 * @property {number} depth
 * @property {boolean} dirty
 * @property {number} max
 */

/**
 * @typedef {Object} Flake
 * @property {number} x
 * @property {number} y
 * @property {number} r draw radius
 * @property {number} fall px/s
 * @property {number} drift wind coupling
 * @property {number} sway px/s
 * @property {number} rate sway rate (rad/s)
 * @property {number} ph
 * @property {number} a alpha
 * @property {number} kind
 * @property {number} sprite index into the sprite list of its kind
 * @property {number} rot
 * @property {number} spin rad/s
 * @property {number} wobble flutter depth
 * @property {boolean} settles
 * @property {boolean} on still falling (false = waits for respawn / is out)
 */

/** @param {import('../host.js').Host} host */
export function createSnow(host) {
  const config = host.config;
  /** @type {WeakMap<object, Pile>} */
  const pileBySurface = new WeakMap();
  /** @type {Set<Pile>} */
  const piles = new Set();
  /** @type {Flake[]} */
  const flakes = [];
  let alive = 0;
  let relaxAt = 0;
  let pruneAt = 0;
  let now = 0;
  let colors = pileColors(host.light);
  let thawing = false;

  /** @type {{speck: HTMLCanvasElement[], bokeh: HTMLCanvasElement}} */
  let sprites;
  let spritesFor = '';

  const active = () => host.shown.weather === 'snow';

  function buildSprites() {
    const key = `${host.dpr}|${host.light}`;
    if (key === spritesFor) return;
    spritesFor = key;
    const { dpr, light } = host;
    sprites = {
      speck: [speckSprite(3, dpr, light)],
      bokeh: bokehSprite(8, dpr, light),
    };
    colors = pileColors(light);
  }

  // ---- piles -------------------------------------------------------------------------------------------------------

  /** @param {any} s */
  function pileOf(s) {
    let p = pileBySurface.get(s);
    if (!p) {
      p = { s, cols: 0, cw: COL, h: new Float32Array(0), cap: new Float32Array(0), depth: s.ground ? GROUND_DEPTH : LEDGE_DEPTH, dirty: false, max: 0 };
      pileBySurface.set(s, p);
      piles.add(p);
    }
    if (s.width > 0) fit(p, s.width);
    return p;
  }

  /** Resize a pile's columns to the surface width, keeping its snow. @param {Pile} p */
  function fit(p, width) {
    const cols = Math.max(1, Math.round(width / COL));
    p.cw = width / cols;
    if (cols === p.cols) return;
    const old = p.h;
    const h = new Float32Array(cols);
    const cap = new Float32Array(cols);
    for (let i = 0; i < cols; i++) {
      // Rounded ends: snow can't stand tall right at an edge.
      cap[i] = Math.min(p.depth, (Math.min(i, cols - 1 - i) + 0.6) * COL * 0.8);
      const o = old.length ? old[Math.min(old.length - 1, Math.floor((i * old.length) / cols))] : 0;
      h[i] = Math.min(o, cap[i]);
    }
    p.h = h;
    p.cap = cap;
    p.cols = cols;
    p.dirty = true;
  }

  /** @param {Pile} p */
  function colOf(p, x) {
    return clamp(Math.floor((x - p.s.left) / p.cw), 0, p.cols - 1);
  }

  /** Add `amount` px of height at the centre column, spread over ±3 columns. @param {Pile} p */
  function depositHeight(p, x, amount) {
    if (!p.cols) return;
    const i = colOf(p, x);
    for (let k = -3; k <= 3; k++) {
      const j = i + k;
      if (j < 0 || j >= p.cols) continue;
      const v = Math.min(p.cap[j], p.h[j] + amount * SPREAD[k + 3]);
      p.h[j] = v;
      if (v > p.max) p.max = v;
    }
    p.dirty = true;
  }

  /** Let steep steps slide down (angle of repose); recomputes the pile's max. @param {Pile} p */
  function relax(p) {
    const h = p.h;
    let moved = false;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < p.cols - 1; i++) {
        const d = h[i] - h[i + 1];
        if (d > REPOSE) {
          const m = (d - REPOSE) * 0.4;
          h[i] -= m;
          h[i + 1] += m;
          moved = true;
        } else if (d < -REPOSE) {
          const m = (-d - REPOSE) * 0.4;
          h[i] += m;
          h[i + 1] -= m;
          moved = true;
        }
      }
    }
    let max = 0;
    for (let i = 0; i < p.cols; i++) {
      if (h[i] > p.cap[i]) h[i] = p.cap[i];
      if (h[i] < 0) h[i] = 0;
      if (h[i] > max) max = h[i];
    }
    p.max = max;
    p.dirty = moved;
  }

  /** May flakes land on this surface? */
  function settlesOn(s) {
    return s.ground ? config.groundSnow : config.settle;
  }

  // ---- flakes ------------------------------------------------------------------------------------------------------

  /** @param {Flake} f @param {boolean} anywhere */
  function spawn(f, anywhere) {
    const big = Math.random() < BOKEH_SHARE;
    const speed = config.speed * SNOW_SPEED * (host.shown.heavy ? 1.15 : 1);
    f.ph = rand(0, TAU);
    f.rate = rand(0.5, 1.4);
    f.rot = rand(0, TAU);
    if (big) {
      f.kind = BOKEH;
      f.r = rand(4, 6.5);
      f.fall = rand(75, 100) * speed;
      f.drift = 1.3;
      f.sway = rand(10, 20);
      f.a = 0.28;
      f.settles = false;
      f.spin = 0;
      f.wobble = 0;
      f.sprite = 0;
    } else {
      const n = Math.random() ** 1.6;
      f.r = 0.75 + 2.3 * n + rand(0, 0.5);
      f.fall = (18 + 52 * n + rand(0, 10)) * speed;
      f.drift = 0.35 + 0.65 * n;
      f.sway = rand(4, 9) + 10 * n;
      f.a = 0.45 + 0.5 * n;
      f.settles = true;
      // Round soft flakes only: tumbling crystals and clumps read as flying crosses and shards at page scale.
      f.kind = SPECK;
      f.spin = 0;
      f.wobble = 0;
      f.sprite = 0;
    }
    f.x = rand(-40, host.W + 40);
    f.y = anywhere ? rand(-20, host.H) : rand(-60, -8);
    f.on = true;
    return f;
  }

  function wanted() {
    if (!active()) return 0;
    const heavy = host.shown.heavy ? HEAVY : 1;
    const base = ((host.W * host.H) / 1e6) * FLAKES_PER_MEGAPIXEL * (host.touch ? 0.6 : 1) * config.density * SNOW_AMOUNT * heavy;
    return Math.round(clamp(base, MIN_FLAKES * config.density, Math.min(HARD_CAP, MAX_FLAKES * Math.max(1, config.density) * heavy)));
  }

  /** Grow / shrink the pool to the wanted count; `anywhere` fills the screen at once (first start). */
  function refill(anywhere) {
    const want = wanted();
    if (!want) return;
    while (flakes.length < want) flakes.push(spawn(/** @type {Flake} */ ({}), anywhere));
    if (flakes.length > want) flakes.length = want;
    for (const f of flakes) if (!f.on) spawn(f, anywhere);
  }

  /** Every live surface a flake may land on now (allocation free iteration). */
  function landOn(f, py) {
    const live = host.surfaces.live;
    for (let k = 0; k < live.length; k++) {
      const s = live[k];
      if (f.x < s.left || f.x >= s.left + s.width) continue;
      if (!settlesOn(s)) continue;
      const p = pileOf(s);
      const sy = s.top - p.h[colOf(p, f.x)];
      if (py <= sy && f.y >= sy) {
        // Light, slow snowfall (the default) lands fewer flakes, so each one leaves more snow: the piles grow at the
        // same pace whatever the amount and speed, scaled only by pileSpeed. `densityRef` (set by the panel) keeps the
        // site's amount as the reference, so a toned-down panel also piles up less.
        depositHeight(p, f.x, (f.r * DEPOSIT * config.pileSpeed) / Math.max(0.1, (config.densityRef ?? config.density) * SNOW_AMOUNT * config.speed * SNOW_SPEED));
        return true;
      }
    }
    return false;
  }

  // ---- layer -------------------------------------------------------------------------------------------------------

  function step(dt) {
    now += dt;
    const on = active();
    const W = host.W;
    const H = host.H;

    if (on || alive > 0) {
      const wind = host.wind;
      alive = 0;
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        if (!f.on) continue;
        const py = f.y;
        f.y += f.fall * dt;
        f.x += (wind * f.drift + Math.cos(now * f.rate + f.ph) * f.sway) * dt;
        f.rot += f.spin * dt;
        const landed = f.settles && landOn(f, py);
        if (landed || f.y > H + 12) {
          if (on) spawn(f, false);
          else f.on = false;
        } else if (f.x < -60) f.x += W + 120;
        else if (f.x > W + 60) f.x -= W + 120;
        if (f.on) alive++;
      }
      if (!on && alive === 0) flakes.length = 0;
    }

    // Another weather: the settled snow thaws away, then nothing runs.
    if (!on && thawing) {
      let left = false;
      const k = Math.exp(-THAW * dt);
      for (const p of piles) {
        if (p.max <= 0) continue;
        let max = 0;
        for (let i = 0; i < p.cols; i++) {
          const v = Math.max(0, p.h[i] * k - 2 * dt);
          p.h[i] = v;
          if (v > max) max = v;
        }
        p.max = max;
        if (max > 0) left = true;
      }
      if (!left) thawing = false;
    }

    if (now >= relaxAt) {
      relaxAt = now + RELAX_EVERY;
      const live = host.surfaces.live;
      for (let k = 0; k < live.length; k++) {
        const p = pileBySurface.get(live[k]);
        if (p) {
          if (live[k].width > 0) fit(p, live[k].width);
          if (p.dirty) relax(p);
        }
      }
    }

    // Forget piles of elements that left the page.
    if (now >= pruneAt) {
      pruneAt = now + 5;
      for (const p of piles) {
        if (p.s.el && !p.s.el.isConnected) {
          piles.delete(p);
          pileBySurface.delete(p.s);
        }
      }
    }
  }

  /** @param {CanvasRenderingContext2D} g @param {Pile} p */
  function pilePath(g, p, dy) {
    // Smooth outline: a quadratic curve through the midpoints between columns.
    const h = p.h;
    const s = p.s;
    const x0 = s.left + p.cw / 2;
    g.beginPath();
    g.moveTo(s.left, s.top + dy);
    g.lineTo(x0, s.top - h[0] + dy);
    for (let i = 1; i < p.cols; i++) {
      const xm = x0 + (i - 0.5) * p.cw;
      g.quadraticCurveTo(xm - p.cw / 2, s.top - h[i - 1] + dy, xm, s.top - (h[i - 1] + h[i]) / 2 + dy);
    }
    g.lineTo(s.left + s.width - p.cw / 2, s.top - h[p.cols - 1] + dy);
    g.lineTo(s.left + s.width, s.top + dy);
    g.closePath();
  }

  /** @param {CanvasRenderingContext2D} g */
  function draw(g) {
    const live = host.surfaces.live;
    for (let k = 0; k < live.length; k++) {
      const p = pileBySurface.get(live[k]);
      if (!p || p.max < 0.3 || !p.cols) continue;
      g.fillStyle = colors.edge;
      pilePath(g, p, colors.edgeDy);
      g.fill();
      g.fillStyle = colors.fill;
      pilePath(g, p, 0);
      g.fill();
    }

    if (!flakes.length || !sprites) return;
    let alpha = -1;
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      if (!f.on) continue;
      if (f.a !== alpha) {
        alpha = f.a;
        g.globalAlpha = alpha;
      }
      const r = f.r + 1;
      g.drawImage(f.kind === BOKEH ? sprites.bokeh : sprites.speck[0], f.x - r, f.y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }

  // ---- API for other layers ----------------------------------------------------------------------------------------

  const api = {
    name: 'snow',
    z: 50,
    step,
    draw,
    resize() {
      buildSprites();
      if (active()) refill(flakes.length === 0);
    },
    themeChanged() {
      buildSprites();
    },
    weatherChanged() {
      if (active()) {
        thawing = false;
        refill(false);
      } else {
        thawing = true;
      }
    },
    busy() {
      return false;
    },
    /** @param {any} cmd */
    command(cmd) {
      if (cmd?.type === 'clear') api.clear();
      else if (cmd?.type === 'fill' && active()) api.fill();
    },
    destroy() {
      flakes.length = 0;
      piles.clear();
    },

    /**
     * Snow height (px) on `surface` at viewport x.
     *
     * @param {import('../surfaces.js').Surface} surface
     * @param {number} x
     */
    height(surface, x) {
      const p = pileBySurface.get(surface);
      if (!p || !p.cols || x < surface.left || x >= surface.left + surface.width) return 0;
      return p.h[colOf(p, x)];
    },

    /** Y of the snow top on `surface` at x (the surface top when bare). */
    pileTop(surface, x) {
      return surface.top - api.height(surface, x);
    },

    /**
     * Remove snow around x and return the area taken (px²). Columns within `radius` px are lowered down to `keep` px
     * (never below), until `amount` px² are gathered (`Infinity` = all of it).
     *
     * @param {import('../surfaces.js').Surface} surface
     * @param {number} x
     * @param {number} amount px² at most
     * @param {number} [radius] px around x (0 = the column under x)
     * @param {number} [keep] height left in the columns (px)
     */
    take(surface, x, amount, radius = 0, keep = 0) {
      const p = pileBySurface.get(surface);
      if (!p || !p.cols || amount <= 0) return 0;
      if (x + radius < surface.left || x - radius >= surface.left + surface.width) return 0;
      let left = amount;
      let area = 0;
      const i0 = colOf(p, x - radius);
      const i1 = colOf(p, x + radius);
      for (let i = i0; i <= i1 && left > 0; i++) {
        const avail = p.h[i] - keep;
        if (avail <= 0) continue;
        const dh = Math.min(avail, left / p.cw);
        p.h[i] -= dh;
        area += dh * p.cw;
        left -= dh * p.cw;
      }
      if (area > 0) p.dirty = true;
      return area;
    },

    /**
     * Drop `amount` px² of snow on `surface` around x (spread over a few columns, capped by the rounded ends).
     *
     * @param {import('../surfaces.js').Surface} surface
     * @param {number} x
     * @param {number} amount px²
     */
    deposit(surface, x, amount) {
      if (!surface || amount <= 0 || x < surface.left || x >= surface.left + surface.width) return;
      const p = pileOf(surface);
      depositHeight(p, x, amount / (p.cw * SPREAD_SUM));
    },

    /** Deep snow on every surface snow may settle on. */
    fill() {
      for (const s of host.surfaces.live) {
        if (!settlesOn(s)) continue;
        const p = pileOf(s);
        p.h.set(p.cap);
        p.max = p.depth;
        p.dirty = true;
      }
    },

    /** Remove all settled snow. */
    clear() {
      for (const p of piles) {
        p.h.fill(0);
        p.max = 0;
        p.dirty = false;
      }
    },
  };

  buildSprites();
  if (!active()) thawing = false;
  return api;
}
