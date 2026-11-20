// Visitors: now and then, while it snows, someone comes by (Frostpane's `fp-characters` and `fp-fight`).
//
// - Santa's sleigh with three reindeer flies across; half the time it swoops down, skims the ground snow and climbs
//   away again (the Rust flight profile).
// - The snowplough drives along the ground: its blade scrapes the ground snow into a pile it pushes ahead and drops
//   at the far edge; balls in its way are shoved (or smashed), snowmen in its way are flattened.
// - The yeti walks in, peeks, then smashes a snowman (jumping onto a ledge when needed) or fells a tree with three
//   axe chops, roars and leaves. With nothing to smash it just stomps across.
// - Two grumpy snowmen pop out of the snow and fight it out (`fight.js`).
//
// One visitor at a time; first visit 35–70 s after the snow starts, then every 70–150 s (halved with `oftenVisits`).
// Visitors are not clickable.

import { santaFrames, ploughFrames, yetiFrames, puffSprite, TEAM_W, SANTA_FRAMES, SANTA_CYCLE, PLOUGH_FRONT, YETI } from './visitors-art.js';
import { createBout, stepBout, drawBout, finished, ballSprite } from './fight.js';

const FIRST_VISIT = [35, 70];
const NEXT_VISIT = [70, 150];
const MAX_SPECKS = 220;
const GRAVITY = 1500;

const SANTA_SCALE = 0.8;
const SANTA_SPEED = 140;
const STEEPEST = 0.55;
const HIGHEST = 0.45;
const TOUCHDOWN = 0.3;

const PLOUGH_SPEED = 120;

const YETI_SCALE = 0.9;
const YETI_WALK = 150;
const YETI_DASH = 300;
const PEEK_IN = 46;
const PEEK_TIME = 0.7;
const WIND_UP_TIME = 0.5;
const REST_TIME = 0.7;
const REACT_TIME = 0.9;
const CHOPS = 3;

const KINDS = /** @type {const} */ (['santa', 'snowmen', 'yeti', 'plough']);

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * @param {import('../host.js').Host} host
 * @returns {import('../host.js').Layer & {summon: (kind: string) => boolean}}
 */
export function createVisitors(host) {
  const config = host.config;
  /** @type {any} */
  let visitor = null;
  let visitAt = host.t + rand(...FIRST_VISIT) * gapScale();
  let wasSnow = host.shown.weather === 'snow';
  /** @type {any} */
  let art = null;
  let artKey = '';
  /** @type {any[]} */
  let specks = [];
  // The fight remembers the last story and ending, so two bouts in a row differ (as in the Rust).
  let lastVariant = null;
  let lastEnding = null;

  function gapScale() {
    return config.oftenVisits ? 0.5 : 1;
  }

  function snowing() {
    return host.shown.weather === 'snow';
  }

  function enabled(kind) {
    if (!config.visitors) return false;
    if (kind === 'santa') return !!config.santa;
    if (kind === 'snowmen') return !!config.snowmenFight;
    if (kind === 'yeti') return !!config.yeti;
    if (kind === 'plough') return !!config.plough;
    return false;
  }

  function ensureArt() {
    const key = `${host.dpr}|${host.scale}`;
    if (art && key === artKey) return art;
    const s = host.dpr * host.scale;
    artKey = key;
    art = {
      santa: santaFrames(s * SANTA_SCALE),
      plough: ploughFrames(s),
      yeti: yetiFrames(s * YETI_SCALE),
      ball: ballSprite(16 * host.dpr * host.scale),
      puff: puffSprite(s),
      gold: puffSprite(s, '255,214,120'),
    };
    return art;
  }

  // ---- shared helpers ----------------------------------------------------------------------------------------------

  const snow = () => /** @type {any} */ (host.layer('snow'));
  const balls = () => /** @type {any} */ (host.layer('snowballs'));
  const ground = () => host.surfaces.ground;

  /** Ground snow depth at x (0 without the snow layer or the ground). */
  function depth(x) {
    const g = ground();
    if (!g.shown) return 0;
    const h = snow()?.height?.(g, clamp(x, 0, host.W - 1));
    return Number.isFinite(h) ? Math.max(0, h) : 0;
  }

  function groundDepth() {
    let sum = 0;
    const n = 12;
    for (let i = 0; i < n; i++) sum += depth(((i + 0.5) / n) * host.W);
    return sum / n;
  }

  /** Viewport y of the snow top on the ground at x. */
  const floorAt = (x) => host.H - depth(x);

  function speck(x, y, vx, vy, o = {}) {
    if (specks.length >= MAX_SPECKS) specks.shift();
    const life = o.life ?? rand(0.4, 0.9);
    specks.push({ x, y, vx, vy, life, total: life, size: (o.size ?? rand(1.5, 3.2)) * host.scale, gold: !!o.gold, g: o.g ?? 1 });
  }

  function puff(x, y, n, speed = 140) {
    for (let k = 0; k < n; k++) speck(x, y, rand(-speed, speed), rand(-speed * 1.6, -speed * 0.3));
  }

  function drawSprite(g, img, x, bottom, dir, tilt = 0) {
    const w = img.width / host.dpr;
    const h = img.height / host.dpr;
    g.save();
    g.translate(x, bottom);
    if (dir < 0) g.scale(-1, 1);
    if (tilt) g.rotate(-tilt);
    g.drawImage(img, -w / 2, -h, w, h);
    g.restore();
  }

  // ---- scheduling --------------------------------------------------------------------------------------------------

  function pick() {
    const options = [];
    if (enabled('santa')) options.push('santa');
    if (enabled('yeti')) options.push('yeti');
    if (enabled('snowmen') && host.W >= 360) options.push('snowmen');
    if (enabled('plough') && ground().shown && (!snow()?.height || groundDepth() > 2)) options.push('plough');
    return options.length ? options[Math.floor(Math.random() * options.length)] : null;
  }

  /** Start a visitor now. False when it is switched off, it is not snowing or someone is already here. */
  function summon(kind) {
    if (visitor || !snowing() || !KINDS.includes(/** @type {any} */ (kind)) || !enabled(kind)) return false;
    ensureArt();
    if (kind === 'santa') visitor = startSanta();
    else if (kind === 'plough') visitor = startPlough();
    else if (kind === 'yeti') visitor = startYeti();
    else visitor = startFight();
    if (!visitor) return false;
    host.wake?.();
    return true;
  }

  function leave() {
    visitor = null;
    visitAt = host.t + rand(...NEXT_VISIT) * gapScale();
  }

  // ---- Santa -------------------------------------------------------------------------------------------------------

  function startSanta() {
    const W = host.W;
    const H = host.H;
    const way = Math.random() < 0.5 ? 1 : -1;
    const k = SANTA_SCALE * host.scale;
    const half = (TEAM_W * k) / 2;
    const swoop = H > 320 && Math.random() < 0.6;
    const touch = [TOUCHDOWN * W, W - TOUCHDOWN * W];
    const reach = [Math.max(1, touch[0] + half), Math.max(1, W + half - touch[1])];
    const cap = (r) => Math.min(HIGHEST * H, (2 * r * Math.tan(STEEPEST)) / Math.PI);
    return {
      kind: 'santa',
      t: 0,
      way,
      k,
      half,
      swoop,
      touch,
      reach,
      rise: [cap(reach[0]), cap(reach[1])],
      base: rand(70, Math.max(90, H * 0.35)),
      center: way > 0 ? -half : W + half,
      floor: floorAt(W / 2) - 2,
      bottom: 0,
      tilt: 0,
    };
  }

  /** Runner height above the floor at x (the Rust swoop profile). */
  function santaProfile(v, x) {
    const swoop = (d, reach, rise) => (rise * (1 - Math.cos((Math.PI * Math.min(d, reach)) / reach))) / 2;
    if (x < v.touch[0]) return swoop(v.touch[0] - x, v.reach[0], v.rise[0]);
    if (x > v.touch[1]) return swoop(x - v.touch[1], v.reach[1], v.rise[1]);
    return 0;
  }

  function stepSanta(v, dt) {
    v.center += v.way * SANTA_SPEED * host.scale * dt;
    const target = floorAt(v.center) - 2;
    v.floor += (target - v.floor) * Math.min(1, dt * 6);
    let low = false;
    if (v.swoop) {
      const h = santaProfile(v, v.center);
      v.bottom = v.floor - h;
      const slope = (santaProfile(v, v.center + v.way) - santaProfile(v, v.center - v.way)) / 2;
      v.tilt = clamp(Math.atan(slope), -STEEPEST, STEEPEST);
      low = h < 3;
    } else {
      v.bottom = v.base + Math.sin(v.t * 2.2) * 9;
      v.tilt = 0.06 * Math.cos(v.t * 2.2);
    }
    // Gold sparkles behind the sleigh, a spray of snow while the runners skim the ground.
    const back = v.center - v.way * v.half;
    if (Math.random() < dt * 16) speck(back, v.bottom - rand(10, 50) * v.k, -v.way * rand(10, 50), rand(-20, 20), { gold: true, g: 0.05, life: rand(0.6, 1.2) });
    if (low) {
      const runners = v.center - v.way * 85 * v.k;
      for (let n = 0; n < 2; n++) speck(runners, v.bottom, -v.way * rand(30, 140), rand(-180, -60));
    }
    const end = v.way > 0 ? host.W + v.half + 10 : -v.half - 10;
    if ((v.center - end) * v.way > 0) leave();
  }

  function drawSanta(g, v) {
    const f = art.santa[Math.floor((v.t / SANTA_CYCLE) * SANTA_FRAMES) % SANTA_FRAMES];
    drawSprite(g, f, v.center, v.bottom, v.way, v.tilt);
  }

  // ---- snowplough --------------------------------------------------------------------------------------------------

  function startPlough() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    return { kind: 'plough', t: 0, dir, x: dir > 0 ? -60 * host.scale : host.W + 60 * host.scale, carried: 0, dropped: false, hit: new Set() };
  }

  function bladeFront(v) {
    return v.x + v.dir * PLOUGH_FRONT * host.scale;
  }

  function stepPlough(v, dt) {
    const s = host.scale;
    const W = host.W;
    const speed = PLOUGH_SPEED * s;
    const prev = bladeFront(v);
    v.x += v.dir * speed * dt;
    const front = bladeFront(v);
    const g = ground();
    const sl = snow();

    // Scrape the ground snow under the blade down to a thin layer.
    if (!v.dropped && g.shown && sl?.take) {
      const a = clamp(Math.min(prev, front), 0, W - 1);
      const b = clamp(Math.max(prev, front), 0, W - 1);
      if (b > a) {
        // `take` answers the area removed (px²); columns keep a thin 1 px layer.
        const got = sl.take(g, (a + b) / 2, 1e9, (b - a) / 2 + 2, 1);
        if (Number.isFinite(got)) v.carried += got;
      }
    }

    // At the far edge the pile is dropped (a heap against the window edge).
    const atEdge = v.dir > 0 ? front >= W - 4 : front <= 4;
    if (atEdge && !v.dropped) {
      v.dropped = true;
      if (v.carried > 0 && g.shown && sl?.deposit) {
        // `deposit` takes an area (px²): most of the pile right at the edge, less further in.
        const width = 64 * s;
        const n = Math.max(1, Math.floor(width / 4));
        let weight = 0;
        for (let i = 0; i < n; i++) weight += 1 - (i / n) * 0.6;
        for (let i = 0; i < n; i++) {
          const x = v.dir > 0 ? W - 2 - i * 4 : 2 + i * 4;
          sl.deposit(g, x, (v.carried * (1 - (i / n) * 0.6)) / weight);
        }
      }
      puff(v.dir > 0 ? W - 10 : 10, host.H - 10, 24, 160);
      v.carried = 0;
    }

    // Shove balls standing on the ground in front of the blade; flatten snowmen in the way.
    const sb = balls();
    if (sb) {
      for (const ball of sb.ballsOn?.(g) ?? []) {
        const bx = ball.x ?? g.left + (ball.off ?? 0);
        const r = ball.r ?? 10;
        const ahead = (bx - front) * v.dir;
        if (ahead < r && ahead > -30 * s) {
          if (sb.push) sb.push(ball.id, front + v.dir * r, v.dir * speed);
          else if (!v.hit.has(ball.id)) {
            v.hit.add(ball.id);
            sb.smash?.(ball.id);
            puff(bx, host.H - r, 10);
          }
        }
      }
      for (const man of sb.snowmen?.() ?? []) {
        if (v.hit.has(man.id) || man.y < host.H - 60) continue;
        const ahead = (man.x - front) * v.dir;
        if (ahead < 14 * s && ahead > -30 * s) {
          v.hit.add(man.id);
          sb.smash?.(man.id);
          puff(man.x, man.y - 20 * s, 16);
        }
      }
    }

    if (v.carried > 0 && !v.dropped && Math.random() < dt * 12) speck(front, host.H - 8, v.dir * rand(40, 120), rand(-160, -60));
    if (v.x < -160 * s || v.x > W + 160 * s) leave();
  }

  function drawPlough(g, v) {
    const s = host.scale;
    if (v.carried > 0 && !v.dropped) {
      const front = v.x + v.dir * 50 * s;
      const r = Math.min(20 * s, Math.sqrt(v.carried) * 0.4) + depth(front + v.dir * 10 * s) * 0.5;
      g.fillStyle = host.light ? '#ffffff' : '#f3f7ff';
      g.strokeStyle = 'rgba(130,155,200,0.8)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(front, host.H, r * 1.3, r, 0, Math.PI, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    drawSprite(g, art.plough[Math.floor(v.t / 0.35) % 2], v.x, host.H - 1, v.dir);
  }

  // ---- yeti --------------------------------------------------------------------------------------------------------

  /** Snowmen and trees on screen the yeti could go for. */
  function preys() {
    const out = [];
    const H = host.H;
    for (const m of balls()?.snowmen?.() ?? []) out.push({ kind: 'snowman', id: m.id, x: m.x, y: m.y, ground: m.y >= H - 60 });
    for (const t of /** @type {any} */ (host.layer('trees'))?.trees?.() ?? []) {
      out.push({ kind: 'tree', id: t.id, x: t.x, y: t.y, ground: t.surface ? !!t.surface.ground : t.y >= H - 60 });
    }
    return out.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 20 && p.x < host.W - 20 && p.y > 60 && p.y < H + 10);
  }

  /** Fresh position of the prey (things on ledges move with the page), null when it is gone. */
  function findPrey(p) {
    if (!p) return null;
    return preys().find((q) => q.kind === p.kind && q.id === p.id) ?? null;
  }

  function startYeti() {
    const list = preys();
    const prey = list.length ? list[Math.floor(Math.random() * list.length)] : null;
    const from = prey ? (prey.x < host.W / 2 ? -1 : 1) : Math.random() < 0.5 ? -1 : 1;
    const x = from < 0 ? -50 * host.scale : host.W + 50 * host.scale;
    return { kind: 'yeti', t: 0, dir: -from, x, y: floorAt(x), prey, state: 'enter', timer: 0, chops: 0, axe: prey?.kind === 'tree', roar: 0, hop: 0, vy: 0, stride: 0 };
  }

  function yetiGo(v, state) {
    v.state = state;
    v.timer = 0;
  }

  function walk(v, to, speed, dt) {
    const d = to - v.x;
    const step = Math.min(Math.abs(d), speed * dt);
    v.x += Math.sign(d) * step;
    v.stride += step;
    if (Math.abs(d) > 0.5) v.dir = Math.sign(d);
    return Math.abs(to - v.x) < 0.5;
  }

  function stepYeti(v, dt) {
    const s = host.scale;
    const W = host.W;
    v.timer += dt;
    if (v.roar > 0) v.roar -= dt;
    const floor = floorAt(v.x) + 1;
    const prey = v.prey ? findPrey(v.prey) : null;
    if (v.prey && !prey && ['go', 'jump'].includes(v.state)) {
      v.prey = null;
      yetiGo(v, v.y < floor - 2 ? 'fall' : 'leave');
    }
    v.hop = 0;

    switch (v.state) {
      case 'enter': {
        const edge = v.dir > 0 ? PEEK_IN * s : W - PEEK_IN * s;
        v.y = floor;
        if (walk(v, edge, YETI_DASH * s, dt)) yetiGo(v, 'peek');
        break;
      }
      case 'peek':
        v.y = floor;
        if (v.timer < 0.3) v.hop = Math.abs(Math.sin(v.timer * 10.5)) * 8 * s;
        if (v.timer >= PEEK_TIME) {
          if (!v.prey) {
            v.roar = 1.2;
            yetiGo(v, 'cross');
          } else yetiGo(v, 'go');
        }
        break;
      case 'cross':
        v.y = floor;
        walk(v, v.dir > 0 ? W + 120 * s : -120 * s, YETI_WALK * s, dt);
        if (v.x < -110 * s || v.x > W + 110 * s) leave();
        break;
      case 'go': {
        const near = (prey.kind === 'tree' ? 26 : 18) * s;
        const stand = prey.x - Math.sign(prey.x - v.x || v.dir) * near;
        v.y = floor;
        if (Math.abs(prey.x - v.x) <= near + 1 || walk(v, stand, YETI_DASH * s, dt)) {
          v.dir = Math.sign(prey.x - v.x) || v.dir;
          if (!prey.ground) {
            v.from = { x: v.x, y: v.y };
            yetiGo(v, 'jump');
          } else yetiGo(v, prey.kind === 'tree' ? 'windup' : 'smash');
        }
        break;
      }
      case 'jump': {
        const k = Math.min(1, v.timer / 0.7);
        const tx = prey.x - v.dir * 16 * s;
        v.x = v.from.x + (tx - v.from.x) * k;
        v.y = v.from.y + (prey.y - v.from.y) * k - Math.sin(k * Math.PI) * 80 * s;
        if (k >= 1) yetiGo(v, prey.kind === 'tree' ? 'windup' : 'smash');
        break;
      }
      case 'smash':
        if (prey) v.y = prey.ground ? floor : prey.y;
        if (v.timer > 0.35 && v.prey) {
          if (prey) {
            balls()?.smash?.(prey.id);
            puff(prey.x, prey.y - 20 * s, 24, 170);
          }
          v.prey = null;
          v.roar = 1.2;
        }
        if (v.timer > 0.6) yetiGo(v, 'react');
        break;
      case 'windup':
        if (prey) v.y = prey.ground ? floor : prey.y;
        if (v.timer >= WIND_UP_TIME) {
          v.chops += 1;
          v.chopAt = host.t;
          const tx = prey?.x ?? v.x + v.dir * 26 * s;
          const ty = prey?.y ?? v.y;
          puff(tx - v.dir * 6 * s, ty - 10 * s, 10, 110);
          if (v.chops >= CHOPS) {
            if (prey) /** @type {any} */ (host.layer('trees'))?.fell?.(prey.id, v.x);
            v.prey = null;
            v.roar = 1.2;
            yetiGo(v, 'react');
          } else yetiGo(v, 'rest');
        }
        break;
      case 'rest':
        if (prey) v.y = prey.ground ? floor : prey.y;
        if (!v.prey) yetiGo(v, 'react');
        else if (v.timer >= REST_TIME) yetiGo(v, 'windup');
        break;
      case 'react':
        v.hop = 9 * Math.abs(Math.sin(9 * v.timer)) * s;
        if (v.timer >= REACT_TIME) yetiGo(v, v.y < floor - 2 ? 'fall' : 'leave');
        break;
      case 'fall':
        v.vy += GRAVITY * 0.8 * dt;
        v.y += v.vy * dt;
        if (v.y >= floor) {
          v.y = floor;
          v.vy = 0;
          yetiGo(v, 'leave');
        }
        break;
      default: {
        // leave: to the nearer edge.
        v.y = floor;
        const to = v.x < W / 2 ? -120 * s : W + 120 * s;
        walk(v, to, YETI_WALK * s, dt);
        if (v.x < -110 * s || v.x > W + 110 * s) leave();
      }
    }
  }

  function yetiPose(v) {
    const step = Math.floor(v.stride / (14 * host.scale)) % 2;
    switch (v.state) {
      case 'peek':
      case 'smash':
      case 'jump':
        return v.axe ? YETI.axeUp : YETI.up;
      case 'react':
      case 'fall':
        return YETI.up;
      case 'windup':
        return v.timer < 0.12 && v.chops > 0 ? YETI.axeDown : YETI.axeUp;
      case 'rest':
        return v.timer < 0.25 ? YETI.axeDown : YETI.axeWalk0;
      default:
        if (v.axe) return step ? YETI.axeWalk1 : YETI.axeWalk0;
        return step ? YETI.walk1 : YETI.walk0;
    }
  }

  function drawYeti(g, v) {
    const s = host.scale;
    drawSprite(g, art.yeti[yetiPose(v)], v.x, v.y - v.hop + 2 * s * YETI_SCALE, v.dir);
    if (v.roar > 0) {
      g.font = `700 ${Math.round(14 * s)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(20,24,35,0.85)';
      g.fillStyle = '#ffffff';
      const ty = v.y - v.hop - 92 * s * YETI_SCALE;
      g.globalAlpha = Math.min(1, v.roar * 3);
      g.strokeText('RAWR!', v.x, ty);
      g.fillText('RAWR!', v.x, ty);
      g.globalAlpha = 1;
    }
  }

  // ---- snowmen fight -----------------------------------------------------------------------------------------------

  function startFight() {
    const W = host.W;
    if (W < 300) return null;
    const margin = 30;
    const bout = createBout({ min: margin, max: W - margin, scale: (52 / 58) * host.scale, prevVariant: lastVariant, avoid: lastEnding });
    lastVariant = bout.variant;
    if (bout.ending) lastEnding = bout.ending;
    return { kind: 'snowmen', t: 0, bout, floor: fightFloor(bout) };
  }

  function fightFloor(b) {
    const mid = (b.f[0].x + b.f[1].x) / 2;
    return host.H - Math.min(14, depth(mid)) * 0.8;
  }

  function stepFight(v, dt) {
    v.floor += (fightFloor(v.bout) - v.floor) * Math.min(1, dt * 3);
    stepBout(v.bout, dt);
    if (finished(v.bout)) {
      // The mounds melt into the ground snow.
      const sl = snow();
      const g = ground();
      if (sl?.deposit && g.shown) {
        for (const d of v.bout.deaths) {
          const w = 28 * d.size;
          for (let x = d.x - w; x <= d.x + w; x += 4) {
            if (x >= 0 && x < host.W) sl.deposit(g, x, 4 * 14 * d.size * (1 - Math.abs(x - d.x) / (w + 1)));
          }
        }
      }
      leave();
    }
  }

  // ---- layer -------------------------------------------------------------------------------------------------------

  function stepSpecks(dt) {
    if (!specks.length) return;
    for (const p of specks) {
      p.life -= dt;
      p.vy += 500 * p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    specks = specks.filter((p) => p.life > 0);
  }

  return {
    name: 'visitors',
    z: 80,
    summon,

    step(dt) {
      const isSnow = snowing();
      if (isSnow && !wasSnow && !visitor) visitAt = host.t + rand(...FIRST_VISIT) * gapScale();
      wasSnow = isSnow;
      stepSpecks(dt);
      if (visitor) {
        const v = visitor;
        v.t += dt;
        if (v.kind === 'santa') stepSanta(v, dt);
        else if (v.kind === 'plough') stepPlough(v, dt);
        else if (v.kind === 'yeti') stepYeti(v, dt);
        else stepFight(v, dt);
        return;
      }
      if (!isSnow || host.t < visitAt) return;
      const kind = pick();
      if (!kind || !summon(kind)) visitAt = host.t + rand(...NEXT_VISIT) * gapScale();
    },

    draw(g) {
      if (!visitor && !specks.length) return;
      ensureArt();
      const v = visitor;
      if (v) {
        if (v.kind === 'santa') drawSanta(g, v);
        else if (v.kind === 'plough') drawPlough(g, v);
        else if (v.kind === 'yeti') drawYeti(g, v);
        else drawBout(g, v.bout, art, v.floor);
      }
      for (const p of specks) {
        const img = p.gold ? art.gold : art.puff;
        const r = p.size * (p.gold ? 1.3 : 1);
        g.globalAlpha = Math.max(0, Math.min(1, p.life / p.total));
        g.drawImage(img, p.x - r, p.y - r, 2 * r, 2 * r);
      }
      g.globalAlpha = 1;
    },

    resize() {
      // Rebuilt on the next draw if the device pixel ratio or the view scale changed.
      if (art && artKey !== `${host.dpr}|${host.scale}`) art = null;
    },

    weatherChanged(shown) {
      // A visitor already on screen finishes its walk; new ones wait for the snow.
      if (shown.weather === 'snow' && !wasSnow && !visitor) visitAt = host.t + rand(...FIRST_VISIT) * gapScale();
      wasSnow = shown.weather === 'snow';
    },

    busy() {
      return !!visitor || specks.length > 0;
    },

    command(cmd) {
      if (cmd?.type === 'summon') summon(cmd.visitor);
    },

    destroy() {
      visitor = null;
      specks = [];
      art = null;
    },
  };
}
