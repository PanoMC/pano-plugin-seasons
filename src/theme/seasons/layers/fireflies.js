// Fireflies (Frostpane's fp-sky `FireflyField`): soft lights that wander around a home spot, blink slowly, gather in
// a ring around a pointer that stays still and scatter from a fast one.
//
// Dark pages: additive glow (the shader's look). Light pages: an additive glow vanishes on white, so the sprite is a
// saturated amber-green glow drawn normally, plus a tiny dark body that stays visible between blinks.

const PER_MEGAPIXEL = 42;
const MAX_FLIES = 160;
const GATHER_AFTER = 1.2;
const GATHER_REACH = 420;
const SCATTER_REACH = 160;
const SCATTER_SPEED = 450;
const HUES = 4;
/** Sprite radius in px for size 1 (fireflies.wgsl draws a 36 × size quad). */
const R = 36;
const FADE = 1.5;

const rnd = (a, b) => a + Math.random() * (b - a);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => {
  const t = sat((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Blink curve (other-weather 2.4.3): 0.12 base, a 2.2 s swell. */
function blink(clock, at) {
  const u = clock - at;
  if (u < 0 || u >= 2.2) return 0.12;
  const p = u / 2.2;
  const shape = p < 0.3 ? (p / 0.3) ** 1.5 : (1 - (p - 0.3) / 0.7) ** 1.6;
  return 0.12 + 0.88 * shape;
}

/**
 * @param {number} hue 0..1
 * @param {number} dpr
 * @param {boolean} light
 */
function glowSprite(hue, dpr, light) {
  const half = Math.ceil(R * 1.6 * dpr);
  const size = half * 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(size, size);
  const d = img.data;
  // Sprite drawn for size 1.6 (the largest fly); smaller flies are scaled down.
  const unit = 1.6 * dpr;
  const hr = 1 + (0.78 - 1) * hue;
  const hg = 0.92 + (1 - 0.92) * hue;
  const hb = 0.45 + (0.38 - 0.45) * hue;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dd = Math.hypot(i + 0.5 - half, j + 0.5 - half) / unit;
      const core = Math.exp((-dd * dd) / 4.5);
      const halo = (0.5 * Math.exp(-dd / 9) + 0.35 * Math.exp((-dd * dd) / 60)) * (1 - smooth(19.8, 36, dd));
      const o = (j * size + i) * 4;
      if (light) {
        // Deeper amber / olive glow with a bright yellow heart.
        const k = core * 0.7;
        d[o] = Math.round((0.62 + (1 - 0.62) * k) * hr * 255);
        d[o + 1] = Math.round((0.55 + (0.85 - 0.55) * k) * hg * 255);
        d[o + 2] = Math.round((0.02 + (0.15 - 0.02) * k) * 255);
        d[o + 3] = Math.round(sat(core * 0.95 + halo * 0.75) * 255);
      } else {
        const k = core * 0.6;
        d[o] = Math.round((hr + (1 - hr) * k) * 255);
        d[o + 1] = Math.round((hg + (1 - hg) * k) * 255);
        d[o + 2] = Math.round((hb + (0.9 - hb) * k) * 255);
        d[o + 3] = Math.round(sat(core + halo) * 255);
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** @param {import('../host.js').Host} host */
export function createFireflies(host) {
  const homeX = new Float32Array(MAX_FLIES);
  const homeY = new Float32Array(MAX_FLIES);
  const x = new Float32Array(MAX_FLIES);
  const y = new Float32Array(MAX_FLIES);
  const vx = new Float32Array(MAX_FLIES);
  const vy = new Float32Array(MAX_FLIES);
  const ph0 = new Float32Array(MAX_FLIES);
  const ph1 = new Float32Array(MAX_FLIES);
  const rate0 = new Float32Array(MAX_FLIES);
  const rate1 = new Float32Array(MAX_FLIES);
  const speed = new Float32Array(MAX_FLIES);
  const blinkAt = new Float32Array(MAX_FLIES);
  const period = new Float32Array(MAX_FLIES);
  const hue = new Float32Array(MAX_FLIES);
  const size = new Float32Array(MAX_FLIES);
  const orbit = new Float32Array(MAX_FLIES);
  const orbitR = new Float32Array(MAX_FLIES);
  const lit = new Float32Array(MAX_FLIES);
  let n = 0;

  /** @type {HTMLCanvasElement[]} */
  let sprites = [];
  let builtDpr = 0;
  let builtLight = false;

  let clock = 0;
  let vis = 0;
  let idle = true;
  let lastX = -1e4;
  let lastY = -1e4;
  let stillSince = 0;
  let wanted = 0;

  const active = () => host.shown.weather === 'fireflies';

  function count() {
    return Math.min(MAX_FLIES, Math.max(8, Math.floor((PER_MEGAPIXEL * host.config.density * host.W * host.H) / 1e6)));
  }

  function newFly(i) {
    const k = host.config.speed;
    homeX[i] = rnd(0, host.W);
    // Mostly low on the screen, like fireflies over grass.
    homeY[i] = host.H - (host.H * Math.random() ** 1.8 * 0.85 + 20);
    x[i] = homeX[i] + rnd(-60, 60);
    y[i] = homeY[i] + rnd(-40, 40);
    vx[i] = 0;
    vy[i] = 0;
    ph0[i] = rnd(0, Math.PI * 2);
    ph1[i] = rnd(0, Math.PI * 2);
    rate0[i] = rnd(0.25, 0.7) * k;
    rate1[i] = rnd(0.2, 0.6) * k;
    speed[i] = rnd(12, 26) * k;
    blinkAt[i] = clock + rnd(0, 5);
    period[i] = rnd(2.5, 5);
    hue[i] = Math.random();
    size[i] = rnd(1, 1.6);
    orbit[i] = rnd(0, Math.PI * 2);
    orbitR[i] = rnd(28, 80);
    lit[i] = 0.12;
  }

  function fit() {
    wanted = count();
    if (n > wanted) n = wanted;
    while (n < wanted) newFly(n++);
  }

  function build() {
    if (builtDpr === host.dpr && builtLight === host.light) return;
    builtDpr = host.dpr;
    builtLight = host.light;
    sprites = [];
    for (let h = 0; h < HUES; h++) sprites.push(glowSprite((h + 0.5) / HUES, host.dpr, host.light));
  }

  function step(dt) {
    const on = active();
    if (on) vis = Math.min(1, vis + dt / FADE);
    else vis = Math.max(0, vis - dt / FADE);
    idle = vis <= 0;
    if (idle) {
      n = 0;
      return;
    }
    if (on && (n === 0 || wanted !== count())) fit();
    build();
    clock += dt;

    const p = host.pointer;
    const pointerOn = !p.touch && p.t >= 0 && p.x >= 0 && p.y >= 0 && p.x <= host.W && p.y <= host.H;
    const pspeed = pointerOn && lastX > -1e3 ? Math.hypot(p.x - lastX, p.y - lastY) / dt : 0;
    lastX = pointerOn ? p.x : -1e4;
    lastY = pointerOn ? p.y : -1e4;
    if (!pointerOn || pspeed > 15) stillSince = clock;
    const gather = pointerOn && clock - stillSince > GATHER_AFTER;
    const k = host.config.speed;
    const blend = Math.min(1.6 * dt, 1);
    const W = host.W;
    const H = host.H;

    for (let i = 0; i < n; i++) {
      ph0[i] += rate0[i] * dt;
      ph1[i] += rate1[i] * dt;
      const a = ph0[i];
      const b = ph1[i];
      const wx = (Math.sin(a) + 0.5 * Math.sin(2.3 * a + 1.1)) * speed[i] + (homeX[i] - x[i]) * 0.02;
      const wy = (Math.cos(b) + 0.5 * Math.sin(1.7 * b + 2)) * speed[i] + (homeY[i] - y[i]) * 0.02;
      let tx = wx;
      let ty = wy;
      if (pointerOn) {
        const ddx = x[i] - p.x;
        const ddy = y[i] - p.y;
        const dist = Math.hypot(ddx, ddy);
        if (gather && dist < GATHER_REACH) {
          orbit[i] += dt * 0.5 * k * (hue[i] > 0.5 ? 1 : -1);
          const ringX = p.x + Math.cos(orbit[i]) * orbitR[i];
          const ringY = p.y + Math.sin(orbit[i]) * orbitR[i];
          tx = (ringX - x[i]) * 0.9 + wx * 0.3;
          ty = (ringY - y[i]) * 0.9 + wy * 0.3;
        } else if (pspeed > SCATTER_SPEED && dist > 0.1 && dist < SCATTER_REACH) {
          const f = ((1 - dist / SCATTER_REACH) * 240 * k) / dist;
          vx[i] += ddx * f;
          vy[i] += ddy * f;
        }
      }
      vx[i] += (tx - vx[i]) * blend;
      vy[i] += (ty - vy[i]) * blend;
      x[i] = Math.max(-20, Math.min(W + 20, x[i] + vx[i] * dt));
      y[i] = Math.max(-20, Math.min(H + 20, y[i] + vy[i] * dt));
      lit[i] = blink(clock, blinkAt[i]);
      if (clock >= blinkAt[i] + period[i]) blinkAt[i] += period[i] * rnd(0.8, 1.25);
    }
  }

  /** @param {CanvasRenderingContext2D} g */
  function draw(g) {
    if (idle || !sprites.length) return;
    const light = host.light;
    if (!light) g.globalCompositeOperation = 'lighter';
    const unit = R * 1.6;
    for (let i = 0; i < n; i++) {
      const a = lit[i] * vis * (light ? 0.95 : 1);
      if (a < 0.01) continue;
      const img = sprites[Math.min(HUES - 1, Math.floor(hue[i] * HUES))];
      const half = unit * (size[i] / 1.6);
      g.globalAlpha = a;
      g.drawImage(img, x[i] - half, y[i] - half, half * 2, half * 2);
    }
    if (light) {
      // The insects themselves: tiny dark bodies.
      g.globalAlpha = 0.5 * vis;
      g.fillStyle = 'rgb(58,48,18)';
      g.beginPath();
      for (let i = 0; i < n; i++) {
        g.moveTo(x[i] + 1.4 * size[i], y[i]);
        g.arc(x[i], y[i], 1.4 * size[i], 0, Math.PI * 2);
      }
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  return {
    name: 'fireflies',
    z: 20,
    step,
    draw,
    resize() {
      if (!idle) {
        // Keep the flies, move homes that fell off a smaller window.
        for (let i = 0; i < n; i++) {
          if (homeX[i] > host.W) homeX[i] = rnd(0, host.W);
          if (homeY[i] > host.H) homeY[i] = host.H - rnd(20, host.H * 0.6);
        }
        if (active()) fit();
      }
    },
    themeChanged() {
      if (!idle) build();
    },
    destroy() {
      n = 0;
    },
  };
}
