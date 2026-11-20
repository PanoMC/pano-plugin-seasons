// Rain and thunderstorm (Frostpane's fp-rain): streaks leaning in the wind, splashes and ripples on the tops of page
// elements and the bottom of the window, water that gathers on a ledge and drips off its corners, and (only with
// `host.shown.lightning`) a rare, gentle lightning strike.
//
// Lightning is kept safe for photosensitive visitors: one soft pulse per strike (no flicker), a faint screen tint
// (at most ~7 % on dark pages, none on light pages) and at least 9 s between strikes.
//
// Cheap: particles live in preallocated typed arrays (no per-frame allocations), streaks are batched into a few paths
// by alpha and width.

const DROPS_PER_MEGAPIXEL = 300;
const MAX_DROPS = 1400;
const MAX_DROPLETS = 700;
const MAX_RIPPLES = 260;
const GRAVITY = 2200;
const FASTEST_DRIP = 1300;
const WRAP = 60;
const WATER_CAP = 40;
const SPAWN_BURST = 30;
const POINTER_RADIUS = 9;
const WAKE_RADIUS = 80;
const GROUND_LIFT = 2;
const INSET = 4;
/** Surfaces whose top is this close to the top of the window (a sticky navbar) are not ledges. */
const CEILING = 12;

const A_BUCKETS = 4;
const W_BUCKETS = 3;
const BOLT_LEVELS = 6;
const BOLT_POINTS = (1 << BOLT_LEVELS) + 1;
const BRANCH_LEVELS = 4;
const BRANCH_POINTS = (1 << BRANCH_LEVELS) + 1;
const MAX_BRANCHES = 4;
const STRIKE_LIFE = 0.55;
const STRIKE_GAP_MIN = 9;
const STRIKE_GAP_MAX = 26;

const rnd = (a, b) => a + Math.random() * (b - a);

/** Ambient left-leaning wind of the storm (fp-rain `ambient_wind`, Y-down px/s). */
function ambientWind(t) {
  return -70 + 45 * Math.sin(0.05 * t) + 25 * Math.sin(0.17 * t + 1.3) + 12 * Math.sin(0.9 * t + 0.4) * Math.max(0, Math.sin(0.11 * t + 2.2));
}

/**
 * Midpoint displacement into `out` (x, y pairs), endpoints fixed, `2^levels + 1` points.
 *
 * @param {Float32Array} out
 * @param {number} levels
 */
function jagged(out, ax, ay, bx, by, levels, roughness) {
  const n = (1 << levels) + 1;
  out[0] = ax;
  out[1] = ay;
  out[(n - 1) * 2] = bx;
  out[(n - 1) * 2 + 1] = by;
  for (let step = n - 1; step > 1; step >>= 1) {
    const half = step >> 1;
    for (let i = 0; i + step < n; i += step) {
      const x0 = out[i * 2];
      const y0 = out[i * 2 + 1];
      const x1 = out[(i + step) * 2];
      const y1 = out[(i + step) * 2 + 1];
      const r = rnd(-1, 1) * roughness;
      out[(i + half) * 2] = (x0 + x1) / 2 - (y1 - y0) * r;
      out[(i + half) * 2 + 1] = (y0 + y1) / 2 + (x1 - x0) * r;
    }
  }
}

/** @param {import('../host.js').Host} host */
export function createRain(host) {
  // ---- drops (falling streaks and drips) ----
  const dx = new Float32Array(MAX_DROPS);
  const dy = new Float32Array(MAX_DROPS);
  const dvx = new Float32Array(MAX_DROPS);
  const dvy = new Float32Array(MAX_DROPS);
  const dw = new Float32Array(MAX_DROPS);
  const da = new Float32Array(MAX_DROPS);
  const ddrift = new Float32Array(MAX_DROPS);
  /** bit 1 = lands, bit 2 = dripping */
  const dflags = new Uint8Array(MAX_DROPS);
  const dbucket = new Uint8Array(MAX_DROPS);
  let nd = 0;

  // ---- droplets (splash spray) ----
  const px = new Float32Array(MAX_DROPLETS);
  const py = new Float32Array(MAX_DROPLETS);
  const pvx = new Float32Array(MAX_DROPLETS);
  const pvy = new Float32Array(MAX_DROPLETS);
  const pw = new Float32Array(MAX_DROPLETS);
  const pa = new Float32Array(MAX_DROPLETS);
  const pfloor = new Float32Array(MAX_DROPLETS);
  const pglow = new Uint8Array(MAX_DROPLETS);
  const page = new Float32Array(MAX_DROPLETS);
  let np = 0;

  // ---- ripples ----
  const rx = new Float32Array(MAX_RIPPLES);
  const ry = new Float32Array(MAX_RIPPLES);
  const rreach = new Float32Array(MAX_RIPPLES);
  const ralpha = new Float32Array(MAX_RIPPLES);
  const rlife = new Float32Array(MAX_RIPPLES);
  const rage = new Float32Array(MAX_RIPPLES);
  let nr = 0;

  // ---- ledge water (per surface id) ----
  /** @type {Map<number, {water: number, dripAt: number}>} */
  const ledges = new Map();

  // ---- lightning ----
  const bolt = new Float32Array(BOLT_POINTS * 2);
  const branches = new Float32Array(MAX_BRANCHES * BRANCH_POINTS * 2);
  let branchCount = 0;
  let strikeAge = -1;
  let strikeStrength = 0;
  let strikeVisible = false;
  let nextStrike = rnd(5, 11);
  let clock = 0;

  // ---- colors (rebuilt on theme change) ----
  /** @type {string[]} */
  let strokeStyles = [];
  /** @type {string[]} */
  let rippleStyles = [];
  let glowStyle = '';
  let boltGlow = '';
  let boltCore = '';
  /** @type {CanvasGradient|null} */
  let flashGradient = null;

  let wasActive = false;
  let idle = true;

  const speed = () => host.config.speed;
  const active = () => host.shown.weather === 'rain';

  function target() {
    return Math.min(MAX_DROPS - 40, Math.floor((DROPS_PER_MEGAPIXEL * host.config.density * host.W * host.H) / 1e6));
  }

  function wind() {
    return ambientWind(clock) + host.wind * 2.5;
  }

  function alphaBucket(a) {
    return Math.min(A_BUCKETS - 1, Math.floor(a * A_BUCKETS * 1.4));
  }

  function widthBucket(w) {
    return w < 1.1 ? 0 : w < 1.8 ? 1 : 2;
  }

  function bucketOf(a, w) {
    return alphaBucket(a) * W_BUCKETS + widthBucket(w);
  }

  function spawnDrop(y) {
    if (nd >= MAX_DROPS) return;
    const i = nd++;
    const far = Math.random() < 0.03;
    const n = far ? 1 : Math.random() ** 1.4;
    const s = (far ? rnd(1500, 1800) : 650 + 650 * n + rnd(0, 120)) * speed();
    const drift = far ? 1.2 : 0.4 + 0.6 * n;
    dx[i] = rnd(-WRAP, host.W + WRAP);
    dy[i] = y;
    dvx[i] = wind() * drift;
    dvy[i] = s;
    dw[i] = far ? rnd(2.2, 3) : 0.7 + 0.9 * n;
    da[i] = far ? 0.16 : 0.16 + 0.36 * n;
    ddrift[i] = drift;
    dflags[i] = far ? 0 : 1;
    dbucket[i] = bucketOf(da[i], dw[i]);
  }

  function addDrip(x, y, vx, vy, w) {
    if (nd >= MAX_DROPS) return;
    const i = nd++;
    dx[i] = x;
    dy[i] = y;
    dvx[i] = vx;
    dvy[i] = vy;
    dw[i] = w;
    da[i] = 0.5;
    ddrift[i] = 0.6;
    dflags[i] = 3;
    dbucket[i] = bucketOf(0.5, w);
  }

  function removeDrop(i) {
    const j = --nd;
    dx[i] = dx[j];
    dy[i] = dy[j];
    dvx[i] = dvx[j];
    dvy[i] = dvy[j];
    dw[i] = dw[j];
    da[i] = da[j];
    ddrift[i] = ddrift[j];
    dflags[i] = dflags[j];
    dbucket[i] = dbucket[j];
  }

  function addDroplet(x, y, vx, vy, w, a, floor, glow) {
    if (np >= MAX_DROPLETS) return;
    const i = np++;
    px[i] = x;
    py[i] = y;
    pvx[i] = vx;
    pvy[i] = vy;
    pw[i] = w;
    pa[i] = a;
    pfloor[i] = floor;
    pglow[i] = glow;
    page[i] = 0;
  }

  function addRipple(x, y, reach, alpha, life) {
    if (nr >= MAX_RIPPLES) return;
    const i = nr++;
    rx[i] = x;
    ry[i] = y;
    rreach[i] = reach;
    ralpha[i] = alpha;
    rlife[i] = life;
    rage[i] = 0;
  }

  /** Spray, ripple and ledge water for a drop `i` landing at (x, y). */
  function splash(i, x, y, surface, onPointer) {
    const v = Math.hypot(dvx[i], dvy[i]);
    const power = Math.min(v / 1300, 1.3) * (0.4 + dw[i] * 0.45);
    const per = onPointer ? 3.5 : 2.5;
    const count = Math.floor(Math.random() + power * per);
    for (let k = 0; k < count; k++) {
      // Up and sideways: angle in (0.35, π − 0.35), Y down so up is −sin.
      const a = onPointer ? rnd(0.2, 2.9416) : rnd(0.35, 2.7916);
      const s = rnd(70, 200) * power * speed();
      addDroplet(x, y - 1, Math.cos(a) * s + dvx[i] * 0.15, -Math.sin(a) * s * 1.1, Math.max(0.8, dw[i] * rnd(0.7, 1.1)), Math.min(0.7, da[i] * 1.4), y + (onPointer ? 30 : 2), 0);
    }
    if (!onPointer && (dw[i] > 1 || Math.random() < 0.4)) {
      addRipple(x, y, 3 + dw[i] * 3.5 + rnd(0, 2), da[i] * 1.1, rnd(0.25, 0.45));
    }
    if (!surface || surface.ground) return;
    let l = ledges.get(surface.id);
    if (!l) {
      l = { water: 0, dripAt: rnd(3, 9) };
      ledges.set(surface.id, l);
    }
    l.water += dw[i] * 0.35;
    if (l.water > l.dripAt) {
      const amount = l.water * 0.5;
      const left = x < surface.left + surface.width / 2;
      l.water *= 0.5;
      l.dripAt = rnd(3, 9);
      const ex = left ? surface.left - 0.5 : surface.left + surface.width + 0.5;
      addDrip(ex, surface.top + 3, (left ? -1 : 1) * rnd(4, 14), rnd(0, 30), Math.min(2.6, 1.3 + amount * 0.12));
    }
    l.water = Math.min(l.water, WATER_CAP);
  }

  /**
   * Where the move (x0, y0) → (x1, y1) of a falling thing first meets a surface top (the highest one crossed), or
   * the bottom of the window. Writes the hit into `hit` and returns true.
   */
  const hit = { x: 0, y: 0, /** @type {any} */ surface: null, pointer: false };
  function land(x0, y0, x1, y1, pointer) {
    if (pointer) {
      const cx = host.pointer.x + 5;
      const cy = host.pointer.y + 8;
      const ddx = x1 - cx;
      if (Math.abs(ddx) < POINTER_RADIUS && y0 <= cy && y1 >= cy - POINTER_RADIUS) {
        const top = cy - Math.sqrt(POINTER_RADIUS * POINTER_RADIUS - ddx * ddx);
        if (y0 <= top && y1 >= top) {
          hit.x = x1;
          hit.y = top;
          hit.surface = null;
          hit.pointer = true;
          return true;
        }
      }
    }
    let best = null;
    let bx = 0;
    const live = host.surfaces.live;
    for (let k = 0; k < live.length; k++) {
      const s = live[k];
      // A navbar glued to the top of the window is the ceiling, not a ledge.
      if (s.ground || s.top < CEILING) continue;
      const t = s.top;
      if (!(y0 <= t && y1 >= t) || (best && best.top <= t)) continue;
      const dyy = y1 - y0;
      const x = dyy > 0 ? x0 + (x1 - x0) * ((t - y0) / dyy) : x1;
      if (x > s.left + INSET && x < s.left + s.width - INSET) {
        best = s;
        bx = x;
      }
    }
    if (best) {
      hit.x = bx;
      hit.y = best.top;
      hit.surface = best;
      hit.pointer = false;
      return true;
    }
    const ground = host.H - GROUND_LIFT;
    if (y1 >= ground) {
      hit.x = x1;
      hit.y = ground;
      hit.surface = host.surfaces.ground;
      hit.pointer = false;
      return true;
    }
    return false;
  }

  function pointerLive() {
    const p = host.pointer;
    return !p.touch && p.t >= 0 && host.t - p.t < 8 && p.x > -100;
  }

  function stepDrops(dt, on) {
    const w = wind();
    const tgt = on ? target() : 0;
    const usePointer = pointerLive();
    const p = host.pointer;
    const wake = usePointer && host.t - p.t < 0.3 && Math.hypot(p.vx, p.vy) > 20;
    const span = host.W + 2 * WRAP;
    for (let i = 0; i < nd; ) {
      const x0 = dx[i];
      const y0 = dy[i];
      if (dflags[i] & 2) {
        dvy[i] = Math.min(dvy[i] + GRAVITY * dt, FASTEST_DRIP * speed());
        dvx[i] += (w * ddrift[i] * 0.3 - dvx[i]) * Math.min(2 * dt, 1);
      } else {
        dvx[i] += (w * ddrift[i] - dvx[i]) * Math.min(1.5 * dt, 1);
      }
      if (wake) {
        const dist = Math.hypot(x0 - p.x, y0 - p.y);
        if (dist < WAKE_RADIUS) {
          const k = (1 - dist / WAKE_RADIUS) * 0.5 * dt;
          dx[i] += p.vx * k;
          dy[i] += p.vy * k;
        }
      }
      dx[i] += dvx[i] * dt;
      dy[i] += dvy[i] * dt;
      let gone = false;
      if (dflags[i] & 1 && land(x0, y0, dx[i], dy[i], usePointer)) {
        splash(i, hit.x, hit.y, hit.surface, hit.pointer);
        gone = true;
      }
      if (!gone) {
        if (dx[i] < -WRAP) dx[i] += span;
        else if (dx[i] > host.W + WRAP) dx[i] -= span;
        gone = dy[i] > host.H + 40;
      }
      if (gone) {
        const dripping = dflags[i] & 2;
        removeDrop(i);
        if (!dripping && nd < tgt) spawnDrop(-rnd(0, 60));
        continue;
      }
      i++;
    }
    // Top up from above the window (also after a resize or a density change).
    const missing = Math.min(SPAWN_BURST, tgt - nd);
    for (let k = 0; k < missing; k++) spawnDrop(-rnd(0, 0.2 * host.H) - 10);
  }

  function stepParticles(dt) {
    for (let i = 0; i < np; ) {
      pvy[i] += GRAVITY * dt;
      px[i] += pvx[i] * dt;
      py[i] += pvy[i] * dt;
      page[i] += dt;
      if ((pvy[i] > 0 && py[i] > pfloor[i]) || page[i] > 0.9 || py[i] > host.H + 10) {
        const j = --np;
        px[i] = px[j];
        py[i] = py[j];
        pvx[i] = pvx[j];
        pvy[i] = pvy[j];
        pw[i] = pw[j];
        pa[i] = pa[j];
        pfloor[i] = pfloor[j];
        pglow[i] = pglow[j];
        page[i] = page[j];
        continue;
      }
      i++;
    }
    for (let i = 0; i < nr; ) {
      rage[i] += dt;
      if (rage[i] >= rlife[i]) {
        const j = --nr;
        rx[i] = rx[j];
        ry[i] = ry[j];
        rreach[i] = rreach[j];
        ralpha[i] = ralpha[j];
        rlife[i] = rlife[j];
        rage[i] = rage[j];
        continue;
      }
      i++;
    }
  }

  // ---- lightning ----

  /** One soft pulse: 60 ms rise, then a smooth decay. */
  function brightness() {
    if (strikeAge < 0) return 0;
    if (strikeAge < 0.06) return strikeAge / 0.06;
    return Math.exp(-(strikeAge - 0.06) * 8);
  }

  function strike() {
    strikeAge = 0;
    strikeVisible = Math.random() < 0.75;
    strikeStrength = strikeVisible ? 0.07 : 0.045;
    branchCount = 0;
    if (!strikeVisible) return;
    const W = host.W;
    const sx = rnd(0.1 * W, 0.9 * W);
    const ex = Math.max(10, Math.min(W - 10, sx + rnd(-220, 220)));
    const s = host.surfaces.below(ex, CEILING);
    const ey = s && !s.ground ? s.top : host.H - GROUND_LIFT;
    jagged(bolt, sx, -10, ex, ey, BOLT_LEVELS, 0.2);
    const n = 2 + Math.floor(Math.random() * (MAX_BRANCHES - 1));
    for (let b = 0; b < n; b++) {
      const k = 1 + Math.floor(Math.random() * (BOLT_POINTS - 20));
      const ax = bolt[k * 2];
      const ay = bolt[k * 2 + 1];
      let vx = bolt[k * 2 + 2] - ax;
      let vy = bolt[k * 2 + 3] - ay;
      const len = Math.hypot(vx, vy) || 1;
      vx /= len;
      vy /= len;
      const ang = rnd(0.35, 0.9) * (Math.random() < 0.5 ? 1 : -1);
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const reach = rnd(70, 240);
      const tx = ax + (vx * c - vy * sn) * reach;
      const ty = ay + (vx * sn + vy * c) * reach;
      jagged(branches.subarray(b * BRANCH_POINTS * 2, (b + 1) * BRANCH_POINTS * 2), ax, ay, tx, ty, BRANCH_LEVELS, 0.25);
    }
    branchCount = n;
    // A burst of glowing spray and a big ripple where it hits.
    for (let k = 0; k < 18; k++) {
      const a = rnd(0.2, 2.9416);
      const sp = rnd(150, 480) * speed();
      addDroplet(ex, ey - 1, Math.cos(a) * sp, -Math.sin(a) * sp, rnd(1, 1.8), 0.9, ey + 40, 1);
    }
    addRipple(ex, ey, 26, 0.6, 0.6);
  }

  function stepLightning(dt, on) {
    if (strikeAge >= 0) {
      strikeAge += dt;
      if (strikeAge > STRIKE_LIFE) strikeAge = -1;
    }
    if (on && host.shown.lightning) {
      if (clock >= nextStrike) {
        nextStrike = clock + rnd(STRIKE_GAP_MIN, STRIKE_GAP_MAX);
        strike();
      }
    } else if (nextStrike - clock < 4) {
      // Lightning off or not raining: the first strike after it comes back waits a little.
      nextStrike = clock + rnd(4, 10);
    }
  }

  // ---- theme ----

  function buildColors() {
    const light = host.light;
    strokeStyles = [];
    for (let a = 0; a < A_BUCKETS; a++) {
      const alpha = ((a + 0.5) / (A_BUCKETS * 1.4)) * (light ? 1.25 : 1);
      strokeStyles.push(light ? `rgba(58,78,112,${alpha.toFixed(3)})` : `rgba(222,232,250,${alpha.toFixed(3)})`);
    }
    rippleStyles = [];
    for (let a = 0; a < 3; a++) {
      const alpha = ((a + 0.5) / 3) * 0.6 * (light ? 1.2 : 1);
      rippleStyles.push(light ? `rgba(62,82,118,${alpha.toFixed(3)})` : `rgba(209,224,247,${alpha.toFixed(3)})`);
    }
    glowStyle = light ? 'rgba(96,104,200,0.85)' : 'rgba(235,238,255,0.9)';
    boltGlow = light ? 'rgba(110,100,220,0.22)' : 'rgba(173,184,255,0.22)';
    boltCore = light ? 'rgba(70,60,170,1)' : 'rgba(255,255,255,1)';
    const g = host.canvas.getContext('2d');
    if (g && !light && host.H > 0) {
      flashGradient = g.createLinearGradient(0, 0, 0, host.H);
      flashGradient.addColorStop(0, 'rgba(219,230,255,1)');
      flashGradient.addColorStop(1, 'rgba(219,230,255,0.4)');
    } else {
      flashGradient = null;
    }
  }

  // ---- draw ----

  /** @param {CanvasRenderingContext2D} g */
  function drawStreaks(g) {
    g.lineCap = 'butt';
    for (let b = 0; b < A_BUCKETS * W_BUCKETS; b++) {
      const wb = b % W_BUCKETS;
      let any = false;
      g.beginPath();
      for (let i = 0; i < nd; i++) {
        if (dbucket[i] !== b) continue;
        const vx = dvx[i];
        const vy = dvy[i];
        const s = Math.hypot(vx, vy) || 1;
        const len = Math.max(s * 0.022, dw[i] * 1.5);
        g.moveTo(dx[i], dy[i]);
        g.lineTo(dx[i] - (vx / s) * len, dy[i] - (vy / s) * len);
        any = true;
      }
      // Spray droplets fade with age: bucket them on the fly.
      for (let i = 0; i < np; i++) {
        if (pglow[i]) continue;
        const a = pa[i] * (1 - Math.min(page[i] / 0.9, 1));
        if (alphaBucket(a) * W_BUCKETS + widthBucket(pw[i]) !== b) continue;
        const bx = pvx[i] * 0.016;
        const by = pvy[i] * 0.016;
        g.moveTo(px[i], py[i]);
        if (bx * bx + by * by > pw[i] * pw[i]) g.lineTo(px[i] - bx, py[i] - by);
        else g.lineTo(px[i] + 0.6, py[i] + 0.6);
        any = true;
      }
      if (!any) continue;
      g.strokeStyle = strokeStyles[Math.floor(b / W_BUCKETS)];
      g.lineWidth = wb === 0 ? 0.9 : wb === 1 ? 1.4 : 2.2;
      g.stroke();
    }
    // Lightning spray glows.
    let glow = false;
    g.beginPath();
    for (let i = 0; i < np; i++) {
      if (!pglow[i]) continue;
      g.moveTo(px[i], py[i]);
      g.lineTo(px[i] - pvx[i] * 0.016, py[i] - pvy[i] * 0.016);
      glow = true;
    }
    if (glow) {
      g.strokeStyle = glowStyle;
      g.lineWidth = 1.4;
      g.stroke();
    }
  }

  /** @param {CanvasRenderingContext2D} g */
  function drawRipples(g) {
    if (!nr) return;
    g.lineWidth = 0.9;
    for (let b = 0; b < 3; b++) {
      let any = false;
      g.beginPath();
      for (let i = 0; i < nr; i++) {
        const p = rage[i] / rlife[i];
        const a = ralpha[i] * (1 - p) * (1 - p);
        if (Math.min(2, Math.floor((a / 0.6) * 3)) !== b) continue;
        const r = rreach[i] * (0.25 + 0.75 * Math.sqrt(p));
        g.moveTo(rx[i] + r, ry[i]);
        g.ellipse(rx[i], ry[i], r, r * 0.28 + 0.3, 0, 0, Math.PI * 2);
        any = true;
      }
      if (!any) continue;
      g.strokeStyle = rippleStyles[b];
      g.stroke();
    }
  }

  /** @param {CanvasRenderingContext2D} g */
  function drawBolt(g, b) {
    if (!strikeVisible || b < 0.01) return;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // Wide soft glow, then the core.
    for (let pass = 0; pass < 2; pass++) {
      g.globalAlpha = b * (pass === 0 ? 1 : 0.95);
      g.strokeStyle = pass === 0 ? boltGlow : boltCore;
      g.lineWidth = pass === 0 ? 14 : 2.2;
      g.beginPath();
      g.moveTo(bolt[0], bolt[1]);
      for (let i = 1; i < BOLT_POINTS; i++) g.lineTo(bolt[i * 2], bolt[i * 2 + 1]);
      g.stroke();
      g.lineWidth = pass === 0 ? 7 : 1;
      g.globalAlpha = b * (pass === 0 ? 0.8 : 0.5);
      g.beginPath();
      for (let k = 0; k < branchCount; k++) {
        const o = k * BRANCH_POINTS * 2;
        g.moveTo(branches[o], branches[o + 1]);
        for (let i = 1; i < BRANCH_POINTS; i++) g.lineTo(branches[o + i * 2], branches[o + i * 2 + 1]);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  buildColors();

  return {
    name: 'rain',
    z: 40,

    step(dt) {
      const on = active();
      if (on && !wasActive && nd === 0 && host.t < 1) {
        // First frame of the page: start with rain already in the air.
        const n = target();
        for (let k = 0; k < n; k++) spawnDrop(rnd(-0.2 * host.H, host.H));
      }
      wasActive = on;
      idle = !on && nd === 0 && np === 0 && nr === 0 && strikeAge < 0;
      if (idle) return;
      clock += dt;
      stepDrops(dt, on);
      stepParticles(dt);
      stepLightning(dt, on);
    },

    draw(g) {
      if (idle) return;
      const b = brightness();
      const flash = b * strikeStrength;
      if (flashGradient && flash > 0.002) {
        g.globalAlpha = flash;
        g.fillStyle = flashGradient;
        g.fillRect(0, 0, host.W, host.H);
        g.globalAlpha = 1;
      }
      drawRipples(g);
      drawStreaks(g);
      drawBolt(g, b);
    },

    resize() {
      buildColors();
    },

    themeChanged() {
      buildColors();
    },

    weatherChanged() {
      // Leaving rain: existing drops fall out, no new ones spawn (handled in step).
    },

    /** Is a lightning flash showing (0..1)? Other layers may brighten with it. */
    flash() {
      return idle ? 0 : brightness() * (strikeVisible ? 1 : 0.6);
    },

    destroy() {
      nd = np = nr = 0;
      ledges.clear();
    },
  };
}
