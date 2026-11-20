// Starfall (Frostpane's fp-sky `StarfallField`): small twinkling four-pointed stars that drift down, rest a few
// seconds on the tops of page elements (or the bottom of the window) and fade, plus shooting stars. About 40 % of the
// shooting stars strike a page element or the ground and burst into sparks; bright ones shed sparks along the way.
//
// Dark pages: additive light (the shader's look). Light pages: the same shapes in deeper gold / indigo / rose, drawn
// normally, so they stay visible without glaring.

const STARS_PER_MEGAPIXEL = 28;
const MAX_STARS = 220;
const MAX_METEORS = 12;
const MAX_SPARKS = 500;
const TRAIL_SPARK_CAP = 400;
const WAKE_RADIUS = 90;
const STRIKE_SHARE = 0.4;
const GROUND_LIFT = 3;
const FADE_TIME = 1;
const LEAVE_TIME = 4;
const INSET = 6;
/** Surfaces whose top is this close to the top of the window (a sticky navbar) are not ledges. */
const CEILING = 12;
/** Star sprite covers local [-Q, Q] (the shader's quad reaches size + 2 px). */
const Q = 1.25;
/** Body sprite of a trail: its length in sprite px and its half height for width 2. */
const TRAIL_LEN = 256;
const TRAIL_W = 2;
const TRAIL_G = TRAIL_W * 5 + 2;

const rnd = (a, b) => a + Math.random() * (b - a);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Star tints for hue 0 / 0.5 / 1 (sky.wgsl), and their light-page counterparts. */
const STAR_DARK = [
  [1, 1, 1],
  [1, 0.9, 0.62],
  [0.75, 0.86, 1],
];
const STAR_LIGHT = [
  [0.3, 0.33, 0.52],
  [0.74, 0.54, 0.08],
  [0.24, 0.36, 0.74],
];
/** Trail tints for hue 0 / ~0.6 / 1. */
const TRAIL_DARK = [
  [0.88, 0.9, 1],
  [0.92, 0.66, 0.94],
  [1, 0.52, 0.72],
];
const TRAIL_LIGHT = [
  [0.24, 0.27, 0.6],
  [0.45, 0.24, 0.62],
  [0.66, 0.2, 0.42],
];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Write one pixel: on dark pages the colour brightens towards white with the core, alpha = light; on light pages
 * the tint stays deep.
 */
function put(d, o, tint, light, whiten, isLight) {
  const k = isLight ? whiten * 0.25 : whiten;
  d[o] = Math.round((tint[0] + (1 - tint[0]) * k) * 255);
  d[o + 1] = Math.round((tint[1] + (1 - tint[1]) * k) * 255);
  d[o + 2] = Math.round((tint[2] + (1 - tint[2]) * k) * 255);
  d[o + 3] = Math.round(sat(light) * 255);
}

function starSprite(tint, dpr, isLight) {
  const half = Math.ceil(10 * dpr);
  const size = half * 2;
  const c = canvas(size, size);
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const qx = Math.abs(((i + 0.5) / half - 1) * Q);
      const qy = Math.abs(((j + 0.5) / half - 1) * Q);
      const rays = Math.exp(-14 * qy) * sat(1 - qx) + Math.exp(-14 * qx) * sat(1 - qy);
      const core = Math.exp(-(qx * qx + qy * qy) * 10);
      const glow = 0.25 * Math.exp(-4 * Math.hypot(qx, qy));
      const light = (0.85 * rays + core + glow) * (isLight ? 1.15 : 1);
      put(d, (j * size + i) * 4, tint, light, core * 0.7, isLight);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The trail body for width 2 and length TRAIL_LEN (sky.wgsl `trail_fs` without the head). */
function trailSprite(tint, dpr, isLight) {
  const w = Math.ceil(TRAIL_LEN * dpr);
  const h = Math.ceil(TRAIL_G * 2 * dpr);
  const c = canvas(w, h);
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++) {
    const across = ((j + 0.5) / h - 0.5) * 2 * TRAIL_G;
    for (let i = 0; i < w; i++) {
      const t = (i + 0.5) / w;
      const ww = TRAIL_W * 0.5 * (0.5 + 0.5 * t);
      const dd = Math.abs(across);
      const core = Math.exp((-dd * dd) / Math.max(ww * ww, 0.15)) * Math.max(t, 1e-4) ** 1.4;
      const halo = Math.exp(-dd / (TRAIL_W * 1.6)) * 0.3 * t * t;
      put(d, (j * w + i) * 4, tint, (core + halo) * (isLight ? 1.2 : 1), 0, isLight);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The bright head of a trail, for width 2. */
function headSprite(tint, dpr, isLight) {
  const half = Math.ceil(TRAIL_G * dpr);
  const size = half * 2;
  const c = canvas(size, size);
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(size, size);
  const d = img.data;
  const w2 = TRAIL_W * TRAIL_W;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const px = ((i + 0.5) / half - 1) * TRAIL_G;
      const py = ((j + 0.5) / half - 1) * TRAIL_G;
      const rr = px * px + py * py;
      const head = 1.6 * Math.exp(-rr / (2.4 * w2)) + 0.55 * Math.exp(-rr / (7 * w2));
      put(d, (j * size + i) * 4, tint, head * (isLight ? 0.8 : 1), sat(head), isLight);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** @param {import('../host.js').Host} host */
export function createStarfall(host) {
  // ---- stars ----
  const sx = new Float32Array(MAX_STARS);
  const sy = new Float32Array(MAX_STARS);
  const svx = new Float32Array(MAX_STARS);
  const svy = new Float32Array(MAX_STARS);
  const sfall = new Float32Array(MAX_STARS);
  const ssize = new Float32Array(MAX_STARS);
  const sangle = new Float32Array(MAX_STARS);
  const sspin = new Float32Array(MAX_STARS);
  const stw = new Float32Array(MAX_STARS);
  const srate = new Float32Array(MAX_STARS);
  const salpha = new Float32Array(MAX_STARS);
  const shue = new Uint8Array(MAX_STARS);
  /** @type {any[]} */
  const restOn = new Array(MAX_STARS).fill(null);
  const restOff = new Float32Array(MAX_STARS);
  const restUntil = new Float32Array(MAX_STARS);
  let ns = 0;
  /** @type {Map<any, number>} */
  const onSurface = new Map();

  // ---- meteors ----
  const mx = new Float32Array(MAX_METEORS);
  const my = new Float32Array(MAX_METEORS);
  const mvx = new Float32Array(MAX_METEORS);
  const mvy = new Float32Array(MAX_METEORS);
  const mdx = new Float32Array(MAX_METEORS);
  const mdy = new Float32Array(MAX_METEORS);
  const mage = new Float32Array(MAX_METEORS);
  const mlife = new Float32Array(MAX_METEORS);
  const mlen = new Float32Array(MAX_METEORS);
  const mwidth = new Float32Array(MAX_METEORS);
  const mbright = new Float32Array(MAX_METEORS);
  const mhue = new Uint8Array(MAX_METEORS);
  const mbig = new Uint8Array(MAX_METEORS);
  const mhit = new Float32Array(MAX_METEORS);
  const mspark = new Float32Array(MAX_METEORS);
  let nm = 0;

  // ---- sparks ----
  const px = new Float32Array(MAX_SPARKS);
  const py = new Float32Array(MAX_SPARKS);
  const pvx = new Float32Array(MAX_SPARKS);
  const pvy = new Float32Array(MAX_SPARKS);
  const page = new Float32Array(MAX_SPARKS);
  const plife = new Float32Array(MAX_SPARKS);
  const psize = new Float32Array(MAX_SPARKS);
  const pgrav = new Float32Array(MAX_SPARKS);
  const phue = new Uint8Array(MAX_SPARKS);
  const pflash = new Uint8Array(MAX_SPARKS);
  let np = 0;

  /** @type {HTMLCanvasElement[]} */
  let stars = [];
  /** @type {HTMLCanvasElement[]} */
  let trails = [];
  /** @type {HTMLCanvasElement[]} */
  let heads = [];
  let builtDpr = 0;
  let builtLight = false;

  let clock = 0;
  /** 1 while the weather shows; after it leaves, the stars still in the air fade out over LEAVE_TIME. */
  let stay = 1;
  let idle = true;
  let started = false;
  const radiant = Math.random() < 0.5 ? -2.55 : -0.6;
  let nextMeteor = rnd(0.5, 2);

  const active = () => host.shown.weather === 'starfall';

  function target() {
    return Math.min(MAX_STARS - 20, Math.floor((STARS_PER_MEGAPIXEL * host.config.density * host.W * host.H) / 1e6));
  }

  function build() {
    if (builtDpr === host.dpr && builtLight === host.light) return;
    builtDpr = host.dpr;
    builtLight = host.light;
    const L = host.light;
    stars = (L ? STAR_LIGHT : STAR_DARK).map((t) => starSprite(t, host.dpr, L));
    trails = (L ? TRAIL_LIGHT : TRAIL_DARK).map((t) => trailSprite(t, host.dpr, L));
    heads = (L ? TRAIL_LIGHT : TRAIL_DARK).map((t) => headSprite(t, host.dpr, L));
  }

  // ---- stars ----

  function spawnStar(atY) {
    if (ns >= MAX_STARS) return;
    const i = ns++;
    const k = host.config.speed;
    const q = Math.random() ** 1.4;
    sx[i] = rnd(0, host.W);
    sy[i] = atY;
    sfall[i] = (14 + 26 * q) * k;
    svx[i] = 0;
    svy[i] = sfall[i];
    ssize[i] = 3 + 5 * q;
    sangle[i] = rnd(0, Math.PI / 2);
    sspin[i] = rnd(-0.4, 0.4) * k;
    stw[i] = rnd(0, Math.PI * 2);
    srate[i] = rnd(1.5, 4);
    salpha[i] = 0.45 + 0.5 * q;
    // HUES = [0, 0, 0.5, 1]: half white, a quarter gold, a quarter blue.
    const h = Math.floor(Math.random() * 4);
    shue[i] = h < 2 ? 0 : h - 1;
    restOn[i] = null;
  }

  function unrest(i) {
    const s = restOn[i];
    restOn[i] = null;
    const c = (onSurface.get(s) ?? 1) - 1;
    if (c <= 0) {
      onSurface.delete(s);
      host.surfaces.unpin(s);
    } else onSurface.set(s, c);
  }

  function removeStar(i) {
    if (restOn[i]) unrest(i);
    const j = --ns;
    if (i === j) return;
    sx[i] = sx[j];
    sy[i] = sy[j];
    svx[i] = svx[j];
    svy[i] = svy[j];
    sfall[i] = sfall[j];
    ssize[i] = ssize[j];
    sangle[i] = sangle[j];
    sspin[i] = sspin[j];
    stw[i] = stw[j];
    srate[i] = srate[j];
    salpha[i] = salpha[j];
    shue[i] = shue[j];
    restOn[i] = restOn[j];
    restOff[i] = restOff[j];
    restUntil[i] = restUntil[j];
    restOn[j] = null;
  }

  /** Shared hit test: the highest surface top crossed by (x0, y0) → (x1, y1), else the ground line. */
  const hit = { x: 0, y: 0, /** @type {any} */ surface: null };
  function hitTest(x0, y0, x1, y1) {
    if (y1 <= y0) return false;
    let best = null;
    let bx = 0;
    const live = host.surfaces.live;
    for (let k = 0; k < live.length; k++) {
      const s = live[k];
      if (s.ground || s.top < CEILING) continue;
      const top = s.top;
      if (!(y0 <= top && y1 >= top)) continue;
      const hx = x0 + ((top - y0) / (y1 - y0)) * (x1 - x0);
      if (hx < s.left + INSET || hx > s.left + s.width - INSET) continue;
      if (best && best.top <= top) continue;
      best = s;
      bx = hx;
    }
    if (best) {
      hit.x = bx;
      hit.y = best.top;
      hit.surface = best;
      return true;
    }
    const ground = host.H - GROUND_LIFT;
    if (y0 <= ground && y1 >= ground) {
      hit.x = x0 + ((ground - y0) / (y1 - y0)) * (x1 - x0);
      hit.y = ground;
      hit.surface = host.surfaces.ground;
      return true;
    }
    return false;
  }

  function stepStars(dt, on) {
    const p = host.pointer;
    const wake = !p.touch && p.t >= 0 && host.t - p.t < 0.3 && Math.hypot(p.vx, p.vy) > 20;
    const k = host.config.speed;
    const blend = Math.min(1.5 * dt, 1);
    let falling = 0;
    for (let i = ns - 1; i >= 0; i--) {
      const s = restOn[i];
      if (s) {
        stw[i] += srate[i] * dt * 2;
        if (!on && restUntil[i] - clock > FADE_TIME + 1.5) restUntil[i] = clock + FADE_TIME + rnd(0, 1.5);
        if (clock >= restUntil[i]) {
          removeStar(i);
          continue;
        }
        if (s.ground || (s.el && s.el.isConnected)) {
          sx[i] = s.left + restOff[i];
          sy[i] = (s.ground ? host.H - GROUND_LIFT : s.top) - ssize[i] * 0.35;
        }
        continue;
      }
      if (stay <= 0) {
        removeStar(i);
        continue;
      }
      falling++;
      stw[i] += srate[i] * dt;
      sangle[i] += sspin[i] * dt;
      const tx = Math.sin(0.3 * stw[i]) * 6 + (host.wind * sfall[i]) / (40 * k);
      svx[i] += (tx - svx[i]) * blend;
      svy[i] += (sfall[i] - svy[i]) * blend;
      if (wake) {
        const d = Math.hypot(sx[i] - p.x, sy[i] - p.y);
        if (d < WAKE_RADIUS) {
          const f = 1 - d / WAKE_RADIUS;
          svx[i] += p.vx * f * 2 * dt;
          svy[i] += p.vy * f * 2 * dt;
          sspin[i] += f * rnd(-3, 3) * dt;
        }
      }
      const x0 = sx[i];
      const y0 = sy[i];
      sx[i] += svx[i] * dt;
      sy[i] += svy[i] * dt;
      if (svy[i] > 0 && hitTest(x0, y0, sx[i], sy[i])) {
        const surf = hit.surface;
        restOn[i] = surf;
        restOff[i] = hit.x - surf.left;
        restUntil[i] = clock + rnd(3, 8) + FADE_TIME;
        onSurface.set(surf, (onSurface.get(surf) ?? 0) + 1);
        host.surfaces.pin(surf);
        sx[i] = hit.x;
        sy[i] = hit.y - ssize[i] * 0.35;
        continue;
      }
      if (sx[i] < -40) sx[i] += host.W + 80;
      else if (sx[i] > host.W + 40) sx[i] -= host.W + 80;
      if (sy[i] > host.H + 10) removeStar(i);
    }
    if (on) {
      const fill = Math.min(3, target() - falling);
      for (let j = 0; j < fill; j++) spawnStar(-rnd(5, 40));
    }
  }

  // ---- meteors and sparks ----

  function spark(x, y, vx, vy, life, size, gravity, hue, flash) {
    if (np >= MAX_SPARKS) return;
    const i = np++;
    px[i] = x;
    py[i] = y;
    pvx[i] = vx;
    pvy[i] = vy;
    page[i] = 0;
    plife[i] = life;
    psize[i] = size;
    pgrav[i] = gravity;
    phue[i] = hue;
    pflash[i] = flash ? 1 : 0;
  }

  function burst(x, y, bright, dirX) {
    const k = host.config.speed;
    spark(x, y - 2, 0, 0, 0.45, bright ? 34 : 24, 0, 0, true);
    const want = bright ? 30 : 18;
    for (let j = 0; j < want; j++) {
      const a = rnd(0.15, 2.9916);
      const s = rnd(90, 380) * k;
      spark(x, y - 1, Math.cos(a) * s + dirX * rnd(40, 160), -Math.sin(a) * s, rnd(0.5, 1.1), rnd(2.2, 4), 700, Math.random() < 0.5 ? 1 : 0, false);
    }
  }

  const huePick = () => (Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : 2);

  function addMeteor(x, y, ang, speed, life, length, width, brightness, big) {
    if (nm >= MAX_METEORS) return;
    const i = nm++;
    const dx = Math.cos(ang);
    const dy = -Math.sin(ang);
    mx[i] = x;
    my[i] = y;
    mdx[i] = dx;
    mdy[i] = dy;
    mvx[i] = dx * speed;
    mvy[i] = dy * speed;
    mage[i] = 0;
    mlife[i] = life;
    mlen[i] = length;
    mwidth[i] = width;
    mbright[i] = brightness;
    mhue[i] = huePick();
    mbig[i] = big ? 1 : 0;
    mhit[i] = -1;
    mspark[i] = 0;
  }

  function freeMeteor() {
    const ang = radiant + rnd(-0.22, 0.22);
    const big = Math.random() < 0.15;
    const speed = rnd(900, 1700) * host.config.speed;
    const life = rnd(0.5, 1) * (big ? 1.3 : 1);
    const travel = speed * life;
    const W = host.W;
    const H = host.H;
    const x = Math.cos(ang) < 0 ? rnd(0.25 * W, W + 0.3 * travel) : rnd(-0.3 * travel, 0.75 * W);
    const y = H - rnd(0.45 * H, 1.02 * H);
    addMeteor(x, y, ang, speed, life, rnd(200, 420) * (big ? 1.4 : 1), big ? rnd(2.2, 3) : rnd(1.1, 2), big ? 1 : rnd(0.5, 0.9), big);
  }

  function strike() {
    // A target: the ground or a random spot on a wide enough surface.
    let tx = rnd(0.1 * host.W, 0.9 * host.W);
    let ty = host.H - GROUND_LIFT;
    const live = host.surfaces.live;
    let seen = 1;
    for (let k = 0; k < live.length; k++) {
      const s = live[k];
      if (s.ground || s.top < CEILING || s.width <= 120) continue;
      seen++;
      if (Math.random() * seen < 1) {
        tx = rnd(s.left + 30, s.left + s.width - 30);
        ty = s.top;
      }
    }
    const ang = (radiant < -1.57 ? -2.15 : -0.99) + rnd(-0.15, 0.15);
    const speed = rnd(1100, 1700) * host.config.speed;
    const life = rnd(0.7, 1);
    const back = speed * life * 0.65;
    const big = Math.random() < 0.35;
    addMeteor(tx - Math.cos(ang) * back, ty + Math.sin(ang) * back, ang, speed, life, rnd(200, 380), big ? rnd(2.2, 3) : rnd(1.5, 2.2), big ? 1 : rnd(0.7, 0.95), big);
  }

  function removeMeteor(i) {
    const j = --nm;
    mx[i] = mx[j];
    my[i] = my[j];
    mvx[i] = mvx[j];
    mvy[i] = mvy[j];
    mdx[i] = mdx[j];
    mdy[i] = mdy[j];
    mage[i] = mage[j];
    mlife[i] = mlife[j];
    mlen[i] = mlen[j];
    mwidth[i] = mwidth[j];
    mbright[i] = mbright[j];
    mhue[i] = mhue[j];
    mbig[i] = mbig[j];
    mhit[i] = mhit[j];
    mspark[i] = mspark[j];
  }

  function stepMeteors(dt, on) {
    if (on && clock >= nextMeteor) {
      if (Math.random() < STRIKE_SHARE) strike();
      else freeMeteor();
      const gap = Math.random() < 0.18 ? rnd(0.3, 0.8) : rnd(1.8, 4.5);
      nextMeteor = clock + gap / (host.config.speed * Math.max(0.5, host.config.density));
    } else if (!on) {
      nextMeteor = clock + rnd(0.5, 2);
    }
    for (let i = nm - 1; i >= 0; i--) {
      mage[i] += dt;
      if (mhit[i] >= 0) {
        if (mage[i] - mhit[i] > 0.16) removeMeteor(i);
        continue;
      }
      const x0 = mx[i];
      const y0 = my[i];
      mx[i] += mvx[i] * dt;
      my[i] += mvy[i] * dt;
      if (hitTest(x0, y0, mx[i], my[i])) {
        mx[i] = hit.x;
        my[i] = hit.y;
        mhit[i] = mage[i];
        burst(hit.x, hit.y, mbig[i], mdx[i]);
        continue;
      }
      if (mbig[i] && mage[i] - mspark[i] > 0.02 && np < TRAIL_SPARK_CAP) {
        mspark[i] = mage[i];
        for (let j = 0; j < 2; j++) {
          const back = rnd(0, 20);
          const k = rnd(20, 80);
          spark(mx[i] - mdx[i] * back, my[i] - mdy[i] * back, -mdx[i] * k + rnd(-30, 30), -mdy[i] * k + rnd(-30, 30), rnd(0.3, 0.7), rnd(2, 3.5), 60, 1, false);
        }
      }
      if (mage[i] >= mlife[i]) {
        if (mbig[i]) spark(mx[i], my[i], 0, 0, 0.7, 22, 0, 0, true);
        removeMeteor(i);
      }
    }
  }

  function stepSparks(dt) {
    for (let i = np - 1; i >= 0; i--) {
      const damp = Math.exp(-dt * (pgrav[i] > 100 ? 0.8 : 2));
      pvx[i] *= damp;
      pvy[i] = pvy[i] * damp + pgrav[i] * dt;
      px[i] += pvx[i] * dt;
      py[i] += pvy[i] * dt;
      page[i] += dt;
      if (page[i] >= plife[i]) {
        const j = --np;
        px[i] = px[j];
        py[i] = py[j];
        pvx[i] = pvx[j];
        pvy[i] = pvy[j];
        page[i] = page[j];
        plife[i] = plife[j];
        psize[i] = psize[j];
        pgrav[i] = pgrav[j];
        phue[i] = phue[j];
        pflash[i] = pflash[j];
      }
    }
  }

  // ---- draw ----

  /** @param {CanvasRenderingContext2D} g */
  function drawStar(g, img, x, y, size, angle, a, dpr) {
    const half = size * Q;
    if (angle) {
      const c = Math.cos(angle) * dpr;
      const s = Math.sin(angle) * dpr;
      g.setTransform(c, s, -s, c, x * dpr, y * dpr);
      g.globalAlpha = a;
      g.drawImage(img, -half, -half, half * 2, half * 2);
    } else {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = a;
      g.drawImage(img, x - half, y - half, half * 2, half * 2);
    }
  }

  /** @param {CanvasRenderingContext2D} g */
  function draw(g) {
    if (idle || !stars.length) return;
    const dpr = host.dpr;
    const light = host.light;
    const boost = light ? 1.1 : 1;
    if (!light) g.globalCompositeOperation = 'lighter';

    // Meteor trails: the body sprite stretched from tail to head, then the head glow.
    for (let i = 0; i < nm; i++) {
      const t = mage[i] / mlife[i];
      let x = Math.min(t / 0.12, 1) * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      let len = mlen[i] * Math.min(mage[i] * 6, 1);
      if (mhit[i] >= 0) {
        const k = Math.min((mage[i] - mhit[i]) / 0.16, 1);
        len *= 1 - k;
        x = 1 - 0.5 * k;
      }
      const a = sat(mbright[i] * Math.max(0, x) * boost);
      if (a < 0.01 || len < 1) continue;
      const ws = mwidth[i] / TRAIL_W;
      const c = mdx[i] * dpr;
      const s = mdy[i] * dpr;
      // Origin at the tail, x along the flight.
      g.setTransform(c, s, -s, c, (mx[i] - mdx[i] * len) * dpr, (my[i] - mdy[i] * len) * dpr);
      g.globalAlpha = a;
      g.drawImage(trails[mhue[i]], 0, -TRAIL_G * ws, len, TRAIL_G * 2 * ws);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hs = TRAIL_G * ws;
      g.drawImage(heads[mhue[i]], mx[i] - hs, my[i] - hs, hs * 2, hs * 2);
    }

    for (let i = 0; i < ns; i++) {
      const tf = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(stw[i])) ** 3;
      let fade;
      const s = restOn[i];
      if (s) {
        fade = !s.ground && (s.occluded || !s.shown) ? 0 : sat((restUntil[i] - clock) / FADE_TIME);
      } else {
        fade = sat((host.H - sy[i]) / 60) * sat((sy[i] + 40) / 40) * stay;
      }
      const a = sat(salpha[i] * tf * fade * boost);
      if (a < 0.01) continue;
      drawStar(g, stars[shue[i]], sx[i], sy[i], ssize[i] * (0.8 + 0.3 * tf), sangle[i], a, dpr);
    }

    for (let i = 0; i < np; i++) {
      const t = page[i] / plife[i];
      if (pflash[i]) {
        drawStar(g, stars[0], px[i], py[i], psize[i] * (0.6 + 0.8 * t), 0.4, sat((1 - t) * (1 - t) * boost), dpr);
      } else {
        drawStar(g, stars[phue[i]], px[i], py[i], psize[i], 0, sat(0.85 * (1 - t) * boost), dpr);
      }
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  return {
    name: 'starfall',
    z: 10,

    step(dt) {
      const on = active();
      if (on && !started) {
        started = true;
        if (host.t < 1) {
          const n = target();
          for (let k = 0; k < n; k++) spawnStar(rnd(0, host.H));
        }
      }
      if (on) started = true;
      idle = !on && ns === 0 && nm === 0 && np === 0;
      if (idle) return;
      build();
      clock += dt;
      stay = on ? 1 : Math.max(0, stay - dt / LEAVE_TIME);
      stepMeteors(dt, on);
      stepStars(dt, on);
      stepSparks(dt);
    },

    draw,

    resize() {
      if (!idle) build();
    },

    themeChanged() {
      if (!idle) build();
    },

    destroy() {
      for (const s of onSurface.keys()) host.surfaces.unpin(s);
      onSurface.clear();
      restOn.fill(null);
      ns = nm = np = 0;
    },
  };
}
