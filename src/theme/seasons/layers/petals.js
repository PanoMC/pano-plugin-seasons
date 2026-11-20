// Sakura petals and autumn leaves (Frostpane's fp-petals): tumbling, swaying sprites carried by the wind that may land
// on the tops of page elements or the bottom of the window, lie there for a while and fade. A fast pointer stirs the
// falling ones and lifts the resting ones.
//
// The look comes from Frostpane's petals.wgsl, rasterised once into small sprites (rebuilt on resize / theme change);
// the 3-D flutter is the sprite squashed horizontally by cos(tumble) and mirrored when its back faces the viewer.

const FADE_TIME = 1.5;
const LEAVE_TIME = 4;
const GROUND_LIFT = 2;
const LIFT_SPEED = 120;
const WAKE_RADIUS = 90;
const EDGE = 40;
const INSET = 6;
/** Surfaces whose top is this close to the top of the window (a sticky navbar) are not ledges. */
const CEILING = 12;
const MAX_SPRITES = 900;
const MAX_FALLING = 520;
/** Sprite canvas covers local [-M, M] (the shape is [-1, 1] plus room for soft edges). */
const M = 1.35;

const SAKURA_TINTS = 3;
const LEAF_TINTS = 5;

const KINDS = {
  sakura: { perMegapixel: 90, mostResting: 160, restingRoom: 45, groundRoom: 45, liftRadius: 24, restLo: 6, restHi: 16 },
  leaves: { perMegapixel: 55, mostResting: 260, restingRoom: 32, groundRoom: 9, liftRadius: 34, restLo: 14, restHi: 30 },
};

const rnd = (a, b) => a + Math.random() * (b - a);
const sign = () => (Math.random() < 0.5 ? -1 : 1);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = sat((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const fract = (x) => x - Math.floor(x);
const tri = (x) => Math.abs(fract(x) * 2 - 1);

function hash12(x, y) {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
}

// ---- sprite rasterising (ports of petals.wgsl) ------------------------------------------------------------------

function autumn(t) {
  const red = [0.78, 0.17, 0.1];
  const orange = [0.94, 0.45, 0.12];
  const gold = [0.96, 0.72, 0.2];
  const brown = [0.58, 0.33, 0.16];
  let a;
  let b;
  let k;
  if (t < 0.33) [a, b, k] = [red, orange, t / 0.33];
  else if (t < 0.7) [a, b, k] = [orange, gold, (t - 0.33) / 0.37];
  else [a, b, k] = [gold, brown, sat((t - 0.7) / 0.3)];
  return [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
}

/**
 * Colour and coverage of a sprite at local point (x, y) (Y up, shape in [-1, 1]).
 *
 * @param {number} shape 0 sakura, 1 maple, 2 oval leaf
 * @param {number} fw local units per pixel (anti-aliasing width)
 * @param {Float32Array} out r, g, b, a
 */
function shade(x, y, shape, tint, back, soft, fw, out) {
  const edge = (f) => sat(0.5 - f / (fw * (1 + soft * 9)));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  if (shape === 0) {
    const w = 0.3 + 0.7 * smooth(-1.2, 0.4, y);
    const f = Math.hypot(x / w, y) - 1;
    const cut = edge(y - 0.8 - 1.05 * Math.abs(x));
    a = edge(f) * cut;
    const t = smooth(-1, 0.75, y);
    const base = [mix(0.96, 0.91, tint), mix(0.56, 0.46, tint), mix(0.7, 0.63, tint)];
    const mid = [mix(1, 0.99, tint), mix(0.8, 0.73, tint), mix(0.87, 0.82, tint)];
    const tip = [1, 0.95, 0.97];
    let c;
    if (t <= 0.5) {
      const k = sat(t / 0.5);
      c = [mix(base[0], mid[0], k), mix(base[1], mid[1], k), mix(base[2], mid[2], k)];
    } else {
      const k = (t - 0.5) / 0.5;
      c = [mix(mid[0], tip[0], k), mix(mid[1], tip[1], k), mix(mid[2], tip[2], k)];
    }
    const fan = Math.atan2(x, y + 1.15);
    let m = 1 - 0.06 * Math.abs(Math.cos(15 * fan)) ** 8 * (1 - smooth(-0.6, 0.95, y));
    m *= 0.95 + 0.08 * Math.max(-1, Math.min(1, -x / w));
    m *= mix(1, 0.9, smooth(-0.3, 0, f) * 0.7);
    r = c[0] * m;
    g = c[1] * m;
    b = c[2] * m;
    if (back) {
      r = mix(r, 1, 0.3);
      g = mix(g, 0.93, 0.3);
      b = mix(b, 0.95, 0.3);
    }
    r *= 0.92;
    g *= 0.92;
    b *= 0.92;
  } else {
    const base = autumn(tint);
    let vein = 0;
    let rim = 0;
    if (shape === 1) {
      const qx = x;
      const qy = y + 0.08;
      const rr = Math.hypot(qx, qy);
      const theta = Math.atan2(qx, qy);
      const sector = (Math.PI * 2) / 5;
      const s = theta / sector;
      const lobe = tri(s);
      const tooth = tri(s * 3);
      const grow = 0.6 + 0.4 * smooth(-0.9, 0.3, Math.cos(theta));
      const reach = (0.38 + 0.6 * lobe ** 0.7) * grow * (0.9 + 0.1 * tooth);
      const body = edge(rr - reach);
      const stem = qy > -0.95 && qy < -0.05 ? edge(Math.abs(qx) - 0.035) : 0;
      a = Math.max(body, stem);
      const off = (fract(s + 0.5) - 0.5) * sector;
      if (rr <= 0.92 * reach) vein = 1 - smooth(0.012, 0.035, rr * Math.abs(Math.sin(off)));
      rim = smooth(0.35, 1, rr / Math.max(reach, 0.01));
    } else {
      const yy = ((y + 0.72) / 1.72) * 2 - 1;
      const w = Math.max(1 - yy * yy, 0) ** 0.75 * (1 - 0.22 * yy);
      const body = yy >= -1 && yy <= 1 ? edge(Math.abs(x) - w) : 0;
      const stem = y > -1 && y < -0.7 ? edge(Math.abs(x) - 0.04) : 0;
      a = Math.max(body, stem);
      const midrib = 1 - smooth(0.015, 0.04, Math.abs(x));
      const side = 0.6 * (1 - smooth(0.03, 0.08, Math.abs(fract((yy - 1.3 * Math.abs(x)) * 3.5) - 0.5)));
      if (Math.abs(x) <= 0.85 * w) vein = Math.max(midrib, side);
      rim = smooth(0.4, 1, Math.abs(x) / Math.max(w, 0.01));
    }
    const k = rim * 0.55;
    r = mix(base[0], base[0] * 0.68 + 0.08, k);
    g = mix(base[1], base[1] * 0.68 + 0.02, k);
    b = mix(base[2], base[2] * 0.68, k);
    const n = 0.92 + 0.12 * hash12(Math.floor(x * 9) + tint * 17, Math.floor(y * 9) + tint * 17);
    r *= n;
    g *= n;
    b *= n;
    r = mix(r, Math.min(r * 1.25 + 0.05, 1), vein * 0.5);
    g = mix(g, Math.min(g * 1.25 + 0.05, 1), vein * 0.5);
    b = mix(b, Math.min(b * 1.25 + 0.05, 1), vein * 0.5);
    if (back) {
      r = mix(r, r * 0.75 + 0.1, 0.4);
      g = mix(g, g * 0.75 + 0.08, 0.4);
      b = mix(b, b * 0.75 + 0.05, 0.4);
    }
    r *= 0.9;
    g *= 0.9;
    b *= 0.9;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
  out[3] = a;
}

/**
 * @param {number} shape
 * @param {number} S pixels per local unit (vertically)
 * @param {number} wide horizontal reach factor
 * @param {boolean} light darken a little so pale petals read on white pages
 */
function rasterise(shape, tint, back, soft, S, wide, light) {
  const w = Math.max(4, Math.ceil(2 * M * wide * S));
  const h = Math.max(4, Math.ceil(2 * M * S));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(w, h);
  const d = img.data;
  const px = new Float32Array(4);
  const fw = 1.2 / S;
  const dim = light ? (shape === 0 ? 0.84 : 0.9) : 1;
  for (let j = 0; j < h; j++) {
    const y = -((j + 0.5) / h - 0.5) * 2 * M;
    for (let i = 0; i < w; i++) {
      const x = ((i + 0.5) / w - 0.5) * 2 * M;
      shade(x, y, shape, tint, back, soft, fw, px);
      const o = (j * w + i) * 4;
      d[o] = Math.round(sat(px[0] * dim) * 255);
      d[o + 1] = Math.round(sat(px[1] * dim) * 255);
      d[o + 2] = Math.round(sat(px[2] * dim) * 255);
      d[o + 3] = Math.round(sat(px[3]) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** @param {import('../host.js').Host} host */
export function createPetals(host) {
  // ---- sprites (struct of arrays) ----
  const x = new Float32Array(MAX_SPRITES);
  const y = new Float32Array(MAX_SPRITES);
  const vx = new Float32Array(MAX_SPRITES);
  const vy = new Float32Array(MAX_SPRITES);
  const size = new Float32Array(MAX_SPRITES);
  const angle = new Float32Array(MAX_SPRITES);
  const spin = new Float32Array(MAX_SPRITES);
  const tumble = new Float32Array(MAX_SPRITES);
  const tumbleRate = new Float32Array(MAX_SPRITES);
  const swayPhase = new Float32Array(MAX_SPRITES);
  const sway = new Float32Array(MAX_SPRITES);
  const swayRate = new Float32Array(MAX_SPRITES);
  const fall = new Float32Array(MAX_SPRITES);
  const drift = new Float32Array(MAX_SPRITES);
  const alpha = new Float32Array(MAX_SPRITES);
  /** 0 sakura, 1 maple, 2 oval leaf */
  const shape = new Uint8Array(MAX_SPRITES);
  const tintIx = new Uint8Array(MAX_SPRITES);
  const soft = new Uint8Array(MAX_SPRITES);
  const lands = new Uint8Array(MAX_SPRITES);
  /** @type {any[]} surface a sprite rests on (null = falling) */
  const restOn = new Array(MAX_SPRITES).fill(null);
  const restOff = new Float32Array(MAX_SPRITES);
  const restFlip = new Float32Array(MAX_SPRITES);
  const restUntil = new Float32Array(MAX_SPRITES);
  let n = 0;
  let resting = 0;

  /** @type {Map<any, number>} sprites resting per surface */
  const onSurface = new Map();

  /** sakura [tint][back][soft], leaves [shape-1][tint][back][soft] */
  /** @type {HTMLCanvasElement[]} */
  let sakuraSprites = [];
  /** @type {HTMLCanvasElement[]} */
  let leafSprites = [];
  let builtDpr = 0;
  let builtLight = false;

  let clock = rnd(0, 1000);
  /** 1 while the weather shows; after it leaves, the sprites still in the air fade out over LEAVE_TIME. */
  let stay = 1;
  let idle = true;
  let started = false;

  const kindName = () => (host.shown.weather === 'sakura' || host.shown.weather === 'leaves' ? host.shown.weather : null);

  function target(kind) {
    return Math.min(MAX_FALLING, Math.floor((KINDS[kind].perMegapixel * host.config.density * host.W * host.H) / 1e6));
  }

  function buildSprites() {
    if (builtDpr === host.dpr && builtLight === host.light) return;
    builtDpr = host.dpr;
    builtLight = host.light;
    const dpr = host.dpr;
    sakuraSprites = [];
    for (let t = 0; t < SAKURA_TINTS; t++) {
      for (let back = 0; back < 2; back++) {
        for (let s = 0; s < 2; s++) {
          sakuraSprites.push(rasterise(0, (t + 0.5) / SAKURA_TINTS, !!back, s ? 0.35 : 0, Math.round(15 * dpr), 0.72, host.light));
        }
      }
    }
    leafSprites = [];
    for (let sh = 1; sh <= 2; sh++) {
      const wide = sh === 1 ? 1 : 0.56;
      for (let t = 0; t < LEAF_TINTS; t++) {
        for (let back = 0; back < 2; back++) {
          for (let s = 0; s < 2; s++) {
            leafSprites.push(rasterise(sh, (t + 0.5) / LEAF_TINTS, !!back, s ? 0.3 : 0, Math.round(26 * dpr), wide, host.light));
          }
        }
      }
    }
  }

  function spawn(kind, atY) {
    if (n >= MAX_SPRITES) return;
    const i = n++;
    const k = host.config.speed;
    const near = Math.random() < 0.03;
    const d = near ? 1 : Math.random() ** 1.3;
    x[i] = rnd(-EDGE, host.W + EDGE);
    y[i] = atY;
    angle[i] = rnd(0, Math.PI * 2);
    tumble[i] = rnd(0, Math.PI * 2);
    swayPhase[i] = rnd(0, Math.PI * 2);
    soft[i] = near ? 1 : 0;
    lands[i] = near ? 0 : 1;
    drift[i] = near ? 1.3 : 0.4 + 0.6 * d;
    restOn[i] = null;
    vx[i] = 0;
    if (kind === 'sakura') {
      vy[i] = 40;
      size[i] = near ? rnd(12, 15) : 4 + 4 * d + rnd(0, 1);
      spin[i] = rnd(-1.6, 1.6) * k;
      tumbleRate[i] = rnd(1.2, 3.4) * sign() * k;
      sway[i] = (rnd(14, 30) + 16 * d) * k;
      swayRate[i] = rnd(0.7, 1.6) * k;
      fall[i] = (near ? rnd(90, 120) : 26 + 38 * d + rnd(0, 10)) * k;
      alpha[i] = near ? 0.6 : 0.75 + 0.25 * d;
      shape[i] = 0;
      tintIx[i] = Math.floor(Math.random() * SAKURA_TINTS);
    } else {
      vy[i] = 50;
      size[i] = near ? rnd(22, 28) : 8.5 + 6 * d + rnd(0, 2);
      spin[i] = rnd(-1.2, 1.2) * k;
      tumbleRate[i] = rnd(0.8, 2.2) * sign() * k;
      sway[i] = (rnd(22, 40) + 20 * d) * k;
      swayRate[i] = rnd(0.5, 1.1) * k;
      fall[i] = (near ? rnd(110, 140) : 38 + 46 * d + rnd(0, 12)) * k;
      alpha[i] = near ? 0.7 : 0.88 + 0.12 * d;
      shape[i] = Math.random() < 0.65 ? 1 : 2;
      tintIx[i] = Math.floor(Math.random() * LEAF_TINTS);
    }
  }

  function remove(i) {
    if (restOn[i]) unrest(i);
    const j = --n;
    if (i === j) return;
    x[i] = x[j];
    y[i] = y[j];
    vx[i] = vx[j];
    vy[i] = vy[j];
    size[i] = size[j];
    angle[i] = angle[j];
    spin[i] = spin[j];
    tumble[i] = tumble[j];
    tumbleRate[i] = tumbleRate[j];
    swayPhase[i] = swayPhase[j];
    sway[i] = sway[j];
    swayRate[i] = swayRate[j];
    fall[i] = fall[j];
    drift[i] = drift[j];
    alpha[i] = alpha[j];
    shape[i] = shape[j];
    tintIx[i] = tintIx[j];
    soft[i] = soft[j];
    lands[i] = lands[j];
    restOn[i] = restOn[j];
    restOff[i] = restOff[j];
    restFlip[i] = restFlip[j];
    restUntil[i] = restUntil[j];
    restOn[j] = null;
  }

  function unrest(i) {
    const s = restOn[i];
    restOn[i] = null;
    resting--;
    const c = (onSurface.get(s) ?? 1) - 1;
    if (c <= 0) {
      onSurface.delete(s);
      host.surfaces.unpin(s);
    } else onSurface.set(s, c);
  }

  function roomOn(s, p) {
    const cap = s.ground ? host.W / p.groundRoom : s.width / p.restingRoom;
    return (onSurface.get(s) ?? 0) < cap;
  }

  const lieHeight = (sz, flip) => sz * 0.72 * Math.abs(flip) * 0.8;

  function settle(i, s, hx, p) {
    const flip = rnd(0.28, 0.5) * sign();
    restOn[i] = s;
    restOff[i] = hx - s.left;
    restFlip[i] = flip;
    angle[i] = sign() * (Math.PI / 2) + rnd(-0.2, 0.2);
    restUntil[i] = clock + rnd(p.restLo, p.restHi) + FADE_TIME;
    resting++;
    onSurface.set(s, (onSurface.get(s) ?? 0) + 1);
    host.surfaces.pin(s);
    placeResting(i);
  }

  function placeResting(i) {
    const s = restOn[i];
    x[i] = s.left + restOff[i];
    y[i] = (s.ground ? host.H - GROUND_LIFT : s.top) - lieHeight(size[i], restFlip[i]);
  }

  function loosen(i, nvx, nvy) {
    unrest(i);
    vx[i] = nvx;
    vy[i] = nvy;
    spin[i] = rnd(-5, 5) * host.config.speed;
    tumble[i] = rnd(0, Math.PI * 2);
  }

  /** First surface top crossed by the move (x0, y0) → (x1, y1) with room to rest, else the bottom of the window. */
  function findHit(i, x0, y0, x1, y1, roomToRest, p) {
    let best = null;
    let bx = 0;
    if (roomToRest) {
      const live = host.surfaces.live;
      for (let k = 0; k < live.length; k++) {
        const s = live[k];
        if (s.ground || s.top < CEILING) continue;
        const top = s.top;
        if (y0 > top || y1 <= top) continue;
        const hx = x0 + ((top - y0) / (y1 - y0)) * (x1 - x0);
        if (hx < s.left + INSET || hx > s.left + s.width - INSET) continue;
        if (best && best.top <= top) continue;
        if (!roomOn(s, p)) continue;
        best = s;
        bx = hx;
      }
    }
    if (best) {
      settle(i, best, bx, p);
      return 1;
    }
    if (y1 >= host.H - GROUND_LIFT) {
      const ground = host.surfaces.ground;
      if (roomToRest && roomOn(ground, p)) {
        settle(i, ground, x1, p);
        return 1;
      }
      return -1;
    }
    return 0;
  }

  function step(dt) {
    const kind = kindName();
    if (kind && !started) {
      // First frame of the page: the air is already full.
      started = true;
      if (host.t < 1) {
        buildSprites();
        const t = target(kind);
        for (let k = 0; k < t; k++) spawn(kind, rnd(-0.1 * host.H, host.H));
      }
    }
    if (kind) started = true;
    idle = !kind && n === 0;
    if (idle) return;
    if (kind) buildSprites();
    clock += dt;
    stay = kind ? 1 : Math.max(0, stay - dt / LEAVE_TIME);
    const sp = host.config.speed;
    const c = clock;
    const gusts = 18 + 14 * Math.sin(0.06 * c) + 8 * Math.sin(0.21 * c + 1.9) + 70 * Math.max(0, Math.sin(0.09 * c + 0.7)) ** 6;
    const wind = gusts * sp + host.wind;
    const p = host.pointer;
    const pointerOn = !p.touch && p.t >= 0 && host.t - p.t < 0.3;
    const pspeed = pointerOn ? Math.hypot(p.vx, p.vy) : 0;
    const span = host.W + 2 * EDGE;
    let falling = 0;

    for (let i = n - 1; i >= 0; i--) {
      const P = shape[i] === 0 ? KINDS.sakura : KINDS.leaves;
      if (restOn[i]) {
        // Leaving this weather: cut long rests short.
        if (!kind && restUntil[i] - clock > FADE_TIME + 2) restUntil[i] = clock + FADE_TIME + rnd(0, 2);
        if (clock >= restUntil[i]) {
          remove(i);
          continue;
        }
        const s = restOn[i];
        const gone = !s.ground && (!s.el || !s.el.isConnected);
        if (!gone) placeResting(i);
        if (!gone && pspeed > LIFT_SPEED && Math.hypot(p.x - x[i], p.y - y[i]) < P.liftRadius) {
          const k = rnd(0.25, 0.5);
          loosen(i, p.vx * k, p.vy * k - rnd(80, 200));
        }
        continue;
      }
      if (stay <= 0) {
        remove(i);
        continue;
      }
      falling++;
      tumble[i] += tumbleRate[i] * dt;
      swayPhase[i] += swayRate[i] * dt;
      angle[i] += spin[i] * dt;
      const a = Math.abs(Math.cos(tumble[i]));
      const side = Math.sin(2 * tumble[i]) * sway[i] * 0.35;
      const tx = wind * drift[i] + sway[i] * Math.cos(swayPhase[i]) + side;
      const ty = fall[i] * (0.6 + 0.7 * (1 - a));
      const k = Math.min(2.2 * dt, 1);
      vx[i] += (tx - vx[i]) * k;
      vy[i] += (ty - vy[i]) * k;
      if (pspeed > 20) {
        const dist = Math.hypot(p.x - x[i], p.y - y[i]);
        if (dist < WAKE_RADIUS) {
          const f = (1 - dist / WAKE_RADIUS) * 2.5 * dt;
          vx[i] += p.vx * f;
          vy[i] += p.vy * f;
          spin[i] += (f / 2.5) * rnd(-4, 4);
        }
      }
      const x0 = x[i];
      const y0 = y[i];
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      if (lands[i] && vy[i] > 0) {
        const h = findHit(i, x0, y0, x[i], y[i], resting < P.mostResting, P);
        if (h === 1) continue;
        if (h === -1) {
          remove(i);
          continue;
        }
      }
      if (x[i] < -EDGE) x[i] += span;
      else if (x[i] > host.W + EDGE) x[i] -= span;
      if (y[i] > host.H + 30) remove(i);
    }

    if (kind) {
      const missing = Math.min(4, target(kind) - falling);
      for (let k = 0; k < missing; k++) spawn(kind, -rnd(10, 80));
    }
  }

  /** @param {CanvasRenderingContext2D} g */
  function draw(g) {
    if (idle || !sakuraSprites.length) return;
    const dpr = host.dpr;
    for (let i = 0; i < n; i++) {
      let flip;
      let a = alpha[i];
      const s = restOn[i];
      if (s) {
        flip = restFlip[i];
        a *= Math.min(1, Math.max(0, (restUntil[i] - clock) / FADE_TIME));
        if (!s.ground && (s.occluded || !s.shown)) a = 0;
      } else {
        flip = Math.cos(tumble[i]);
        a *= stay;
      }
      if (a < 0.01) continue;
      const sh = shape[i];
      const back = flip < 0 ? 1 : 0;
      let img;
      let wide;
      if (sh === 0) {
        img = sakuraSprites[(tintIx[i] * 2 + back) * 2 + soft[i]];
        wide = 0.72;
      } else {
        img = leafSprites[(((sh - 1) * LEAF_TINTS + tintIx[i]) * 2 + back) * 2 + soft[i]];
        wide = sh === 1 ? 1 : 0.56;
      }
      const fx = Math.max(Math.abs(flip), 0.12);
      const co = Math.cos(angle[i]) * dpr;
      const si = Math.sin(angle[i]) * dpr;
      g.setTransform(co * fx, si * fx, -si, co, x[i] * dpr, y[i] * dpr);
      g.globalAlpha = a;
      const hw = M * wide * size[i];
      const hh = M * size[i];
      g.drawImage(img, -hw, -hh, hw * 2, hh * 2);
    }
    g.globalAlpha = 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return {
    name: 'petals',
    z: 30,
    step,
    draw,
    resize() {
      if (kindName() || n) buildSprites();
    },
    themeChanged() {
      if (kindName() || n) buildSprites();
    },
    destroy() {
      for (const s of onSurface.keys()) host.surfaces.unpin(s);
      onSurface.clear();
      restOn.fill(null);
      n = 0;
      resting = 0;
    },
  };
}
