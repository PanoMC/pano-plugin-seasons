// Decorated Christmas trees (Frostpane's fp-trees): planting with growth, click to style (topper, trims, height),
// drag to move with a tilt spring, falling to the next surface, snow piling on the branches and shaking off as clumps,
// felling by the yeti, per-visitor persistence. Art is drawn procedurally (fp-trees art.rs) in Y-up tree units with the
// origin at the foot; one tree unit is TREE_SCALE CSS px (the desktop trees are far too big for a page).

const TREE_SCALE = 0.5;
const GRAVITY = 2500;
const SNOW_EVERY = 3;
const FULL_IN = 600;
const MELT_IN = 900;
const REMEMBER_EVERY = 6;
const BLINK_EVERY = 0.8;
const RESTORE_EVERY = 0.25;
const MISSING_WAIT = 3;
const DRAG_THRESHOLD = 4;
const EDGE = 8;
const GROWTH_RATE = 2.6;
const SNOW_REDRAW = 1 / 14;
const MAX_CLUMPS = 90;
const CLUMP_GRAVITY = 1500;
const CARD_W = 292;

export const TOPPERS = /** @type {const} */ (['Star', 'Snowflake', 'Bow', 'Bell', 'Heart', 'Spire']);
export const TRIMS = /** @type {const} */ (['Baubles', 'Lights', 'Tinsel', 'Candy', 'Bells', 'Gingerbread', 'Bows', 'Stars']);
const MAX_LEVEL = 5;

const TOPPER_TEXT = { Star: 'Star', Snowflake: 'Snowflake', Bow: 'Bow', Bell: 'Bell', Heart: 'Heart', Spire: 'Spire' };
const TRIM_TEXT = {
  Baubles: 'Baubles',
  Lights: 'Lights',
  Tinsel: 'Garland',
  Candy: 'Candy canes',
  Bells: 'Bells',
  Gingerbread: 'Gingerbread',
  Bows: 'Bows',
  Stars: 'Stars',
};
const SIZE_TEXT = ['Bonsai', 'Shrub', 'Tree', 'Big tree', 'Too big', 'Send help'];

// ---- small helpers ---------------------------------------------------------------------------------------------------

/** Seeded PRNG (mulberry32). */
class Rng {
  constructor(seed) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  unit() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.unit();
  }
  below(n) {
    return Math.floor(this.unit() * n);
  }
  coin() {
    return this.unit() < 0.5;
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** CSS colour from 0..1 channels. */
function col(t, a = 1) {
  const c = (v) => Math.round(clamp(v, 0, 1) * 255);
  return `rgba(${c(t[0])},${c(t[1])},${c(t[2])},${a})`;
}

function fill(g, p, color) {
  g.fillStyle = color;
  g.fill(p);
}

function stroke(g, p, color, w) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke(p);
}

function circle(g, x, y, r, color) {
  if (!(r > 0)) return;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

function oval(g, cx, cy, rx, ry, color) {
  if (!(rx > 0 && ry > 0)) return;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

function line(g, x0, y0, x1, y1, color, w) {
  polyline(g, [[x0, y0], [x1, y1]], color, w);
}

function polyline(g, pts, color, w) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  stroke(g, p, color, w);
}

function polyPath(pts) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

function polygon(g, pts, color) {
  fill(g, polyPath(pts), color);
}

function grad(gr, colors, stops) {
  colors.forEach((c, i) => gr.addColorStop(stops ? stops[i] : colors.length > 1 ? i / (colors.length - 1) : 0, c));
  return gr;
}

/** Linear gradient fill of `p`. */
function across(g, p, colors, stops, from, to) {
  g.fillStyle = grad(g.createLinearGradient(from[0], from[1], to[0], to[1]), colors, stops);
  g.fill(p);
}

/** Radial gradient with a highlight origin `light`. */
function round(g, p, colors, stops, light, center, r) {
  g.fillStyle = grad(g.createRadialGradient(light[0], light[1], 0, center[0], center[1], r), colors, stops);
  g.fill(p);
}

function halo(g, x, y, r, t, a) {
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  round(g, p, [col(t, a), col(t, 0)], null, [x, y], [x, y], r);
}

function at(g, x, y, turn, scale, fn) {
  g.save();
  g.translate(x, y);
  if (turn) g.rotate(turn);
  if (scale !== 1) g.scale(scale, scale);
  fn();
  g.restore();
}

function inside(g, p, fn) {
  g.save();
  g.clip(p);
  fn();
  g.restore();
}

function rrectPath(x, y, w, h, r) {
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  p.closePath();
  return p;
}

// ---- look and shape (look.rs, shape.rs) --------------------------------------------------------------------------------

/** @typedef {{level: number, topper: string|null, trims: string[]}} TreeLook */

/** @returns {TreeLook} */
function defaultLook() {
  return { level: 2, topper: 'Star', trims: ['Baubles', 'Lights'] };
}

/** @param {any} raw @returns {TreeLook} */
function cleanLook(raw) {
  const d = defaultLook();
  if (!raw || typeof raw !== 'object') return d;
  const level = Number.isFinite(Number(raw.level)) ? clamp(Math.round(Number(raw.level)), 0, MAX_LEVEL) : d.level;
  const topper = raw.topper === null ? null : TOPPERS.includes(raw.topper) ? raw.topper : d.topper;
  const trims = Array.isArray(raw.trims) ? TRIMS.filter((t) => raw.trims.includes(t)) : d.trims;
  return { level, topper, trims };
}

const hangs = (t) => t !== 'Lights' && t !== 'Tinsel';

const TABLE = [
  [96, 42, 2],
  [150, 64, 3],
  [230, 94, 4],
  [320, 124, 5],
  [430, 152, 6],
  [560, 180, 8],
];

function makeShape(level) {
  const [height, half, tiers] = TABLE[clamp(level, 0, 5)];
  const s = {
    level,
    height,
    half,
    tiers,
    trunkTop: height * 0.08 + 4,
    trunkHalf: Math.max(half * 0.13, 5),
    unit: 8.5 + level * 1.6,
    topperSize: 15 + level * 5,
    /** @type {{hem: number, apex: number, half: number}[]} */
    list: [],
    pad: 0,
    w: 0,
    h: 0,
    topperOrigin: 0,
  };
  const step = (height - s.trunkTop) / (1 + (tiers - 1) * 0.56);
  for (let i = 0; i < tiers; i++) {
    const hem = s.trunkTop + i * 0.56 * step;
    s.list.push({ hem, apex: hem + step, half: half * (1 - (0.62 * i) / (tiers - 1)) });
  }
  s.pad = half + height * 0.16 + 26;
  s.w = 2 * s.pad;
  s.h = 8 + height + s.topperSize * 2.4 + 18;
  s.topperOrigin = s.list[tiers - 1].apex - 0.15 * s.topperSize;
  return s;
}

const tierHeight = (t) => t.apex - t.hem;
const widthAt = (t, y) => t.half * clamp((t.apex - y) / (t.apex - t.hem), 0, 1);

/** Hit test relative to the foot, Y up, tree units (12 unit slop). */
function contains(s, x, y, hasTopper) {
  const top = s.trunkTop;
  if (y >= -12 && y <= top) {
    return Math.abs(x) <= s.trunkHalf + 12 || (Math.abs(x) <= s.half && y >= top - 2 * s.unit);
  }
  if (s.list.some((t) => y >= t.hem - 12 && y <= t.apex + 12 && Math.abs(x) <= widthAt(t, y) + 12)) return true;
  const ts = s.topperSize;
  return hasTopper && Math.abs(x) <= ts * 1.4 + 12 && y > s.height - 12 && y <= s.height + 2 * ts + 12;
}

/** Deterministic snow patches for (shape, seed) (shape.rs generate_patches). */
function makePatches(shape, seed) {
  const rng = new Rng(seed + 311);
  const out = [];
  const add = (x, y, angle, widest, cling) => {
    const weight = rng.range(0.55, 1.35);
    const fullest = rng.range(0.3, 0.62);
    const noise = rng.range(-0.22, 0.22);
    out.push({ x, y, angle, widest, weight, fullest, cling: clamp(cling + noise, 0, 1), depth: 0 });
  };
  const u = shape.unit * 0.42;
  const tiers = shape.list;
  tiers.forEach((t, i) => {
    const h = tierHeight(t);
    const limit = tiers[i + 1] ? tiers[i + 1].hem + 0.05 * h : t.apex;
    const slope = Math.atan2(h, t.half);
    for (let y = t.hem + 2; y < limit; y += u * 1.7) {
      const w = widthAt(t, y);
      const tt = (y - t.hem) / Math.max(limit - t.hem, 1);
      const base = 0.28 + 0.4 * tt;
      for (const s of [-1, 1]) add(s * w * 0.94, y, -s * slope, u * rng.range(0.8, 1.15), base);
      const k = Math.floor(w / (u * 2.6));
      for (let j = 1; j <= k; j++) {
        for (const s of [-1, 1]) {
          if (rng.unit() < 0.35) {
            const x = s * w * (0.94 - (j / (k + 1)) * 0.9);
            const yy = y + rng.range(-u, u) * 0.4;
            const angle = rng.range(-0.25, 0.25);
            const wide = u * rng.range(0.6, 1.0);
            add(x, yy, angle, wide, base + 0.34 * (1 - Math.abs(x) / Math.max(w, 1)));
          }
        }
      }
    }
    const n = Math.max(Math.floor(t.half / (u * 1.5)), 4);
    for (let l = 0; l <= n; l++) {
      const x = -0.9 * t.half + (1.8 * t.half * l) / n;
      add(x, t.hem + 0.06 * h, rng.range(-0.12, 0.12), u * rng.range(0.8, 1.2), 0.14);
    }
  });
  return out;
}

const patchRadius = (p) => p.widest * (0.1 + 0.9 * Math.pow(p.depth, 0.7));

/** Perch of the snow cap on the topper: [x, y, wide] for topper size s. */
function perch(topper, s) {
  const t = {
    Star: [0, 1.55, 0.14],
    Snowflake: [0, 1.68, 0.12],
    Bow: [0, 1.3, 0.2],
    Bell: [0, 1.48, 0.12],
    Heart: [0.42, 1.32, 0.16],
    Spire: [0, 1.92, 0.08],
  }[topper] ?? [0, 0.1, 0.16];
  return [t[0] * s, t[1] * s, t[2] * s];
}

// ---- layouts (art.rs) ----------------------------------------------------------------------------------------------

const BULB_TONES = [
  [1.0, 0.86, 0.55],
  [1.0, 0.62, 0.42],
  [1.0, 0.93, 0.72],
  [0.98, 0.5, 0.48],
  [1.0, 0.8, 0.4],
];
const GOLD_A = [0.98, 0.8, 0.38];
const GOLD_B = [0.93, 0.68, 0.26];
const RED = [0.89, 0.24, 0.3];
const BAUBLE_TINTS = [
  [0.87, 0.2, 0.27],
  [0.98, 0.76, 0.3],
  [0.6, 0.8, 0.97],
  [0.97, 0.56, 0.65],
];
const SNOW_SHADE = [0.78, 0.85, 0.95];
const SNOW_WHITE = [0.99, 0.995, 1.0];

function swag(shape, i, share, dip, spacing) {
  const t = shape.list[i];
  const nextHem = i + 1 < shape.tiers ? shape.list[i + 1].hem : t.apex - 0.4 * tierHeight(t);
  const span = nextHem - t.hem;
  const y0 = t.hem + span * share;
  const hw = 0.9 * widthAt(t, y0);
  const count = Math.max(Math.floor((2 * hw) / spacing), 3);
  const out = [];
  for (let j = 0; j <= count; j++) {
    const u = j / count;
    out.push([-hw + 2 * hw * u, y0 - span * dip * (1 - (2 * u - 1) ** 2)]);
  }
  return out;
}

function bulbs(shape) {
  const out = [];
  for (let i = 0; i < shape.tiers; i++) {
    for (const [x, y] of swag(shape, i, 0.42, 0.3, shape.unit * 1.7)) {
      out.push({ x, y, tone: (i + out.length) % 5, group: i % 2 });
    }
  }
  return out;
}

function garland(shape) {
  const out = [];
  for (let i = 0; i < shape.tiers; i++) out.push(...swag(shape, i, 0.74, 0.28, 1.7 * 0.17 * shape.unit));
  return out;
}

function slots(shape) {
  const u = shape.unit;
  const out = [];
  for (let i = 0; i < shape.tiers; i++) {
    const t = shape.list[i];
    const nextHem = i + 1 < shape.tiers ? shape.list[i + 1].hem : t.apex - 0.35 * tierHeight(t);
    const span = nextHem - t.hem;
    [0.12, 0.62].forEach((share, r) => {
      const y = t.hem + span * share + 1.2 * u;
      const hw = 0.74 * widthAt(t, y - u);
      const count = Math.max(Math.floor((2 * hw) / (3.6 * u)), r === 0 ? 1 : 0);
      if (count === 0) {
        if (hw > u) out.push([0, y]);
        return;
      }
      const step = (2 * hw) / count;
      const offset = r === 1 ? step / 2 : 0;
      for (let k = 0; k <= count; k++) {
        const x = -hw + step * k + offset;
        if (Math.abs(x) <= hw + 0.1) out.push([x, y]);
      }
    });
  }
  return out;
}

function hung(shape, look) {
  const types = look.trims.filter(hangs);
  if (!types.length) return [];
  const d = Math.min(0.55 + 0.15 * (types.length - 1), 1);
  const out = [];
  slots(shape).forEach(([x, y], j) => {
    if (Math.floor((j + 1) * d) > Math.floor(j * d)) {
      const n = out.length;
      const trim = types[n % types.length];
      const turn = trim === 'Candy' ? (n % 2 === 0 ? 0.14 : -0.14) : 0;
      out.push({ trim, x, y, turn, tint: n % 4 });
    }
  });
  return out;
}

// ---- art (Y up, origin at the foot) --------------------------------------------------------------------------------

function starPath(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return polyPath(pts);
}

function drawStar(g, cx, cy, outer, inner) {
  const p = starPath(cx, cy, outer, inner);
  stroke(g, p, col([1, 0.8, 0.3]), 0.22 * outer);
  across(g, p, [col([1, 0.94, 0.58]), col([1, 0.75, 0.24])], null, [cx - 0.4 * outer, cy + outer], [cx + 0.4 * outer, cy - outer]);
}

function arcPoints(cx, cy, r, from, to, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function drawBauble(g, u, tint) {
  const base = BAUBLE_TINTS[tint % 4];
  const lighter = base.map((v) => v + 0.2);
  const dark = [base[0] * 0.7, base[1] * 0.68, base[2] * 0.72];
  fill(g, rrectPath(-0.2 * u, -0.34 * u, 0.4 * u, 0.3 * u, 0.07 * u), col([0.95, 0.8, 0.42]));
  const r = 0.78 * u;
  const cy = -0.28 * u - r;
  const p = new Path2D();
  p.arc(0, cy, r, 0, Math.PI * 2);
  round(g, p, [col(lighter), col(base), col(dark)], [0, 0.55, 1], [-0.3 * r, cy + 0.35 * r], [0, cy], 1.15 * r);
  oval(g, -0.37 * r, cy + 0.33 * r, 0.21 * r, 0.15 * r, 'rgba(255,255,255,0.85)');
}

function drawCandy(g, u) {
  const w = 0.36 * u;
  const pts = [
    [0.42 * u, -1.9 * u],
    [0.42 * u, -0.5 * u],
    ...arcPoints(0, -0.5 * u, 0.42 * u, 0, Math.PI, 10),
  ];
  polyline(g, pts, col([0.99, 0.97, 0.95]), w);
  const period = 1.667 * w;
  let walked = 0;
  let next = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next < walked + len) {
      const t = (next - walked) / len;
      circle(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.45 * w, col(RED));
      next += period;
    }
    walked += len;
  }
}

function drawBell(g, top, s) {
  const rim = top - 1.05 * s;
  circle(g, 0, top - 1.1 * s, 0.12 * s, col([0.84, 0.56, 0.2]));
  const p = new Path2D();
  p.moveTo(-0.1 * s, top);
  p.bezierCurveTo(-0.5 * s, top - 0.1 * s, -0.42 * s, top - 0.7 * s, -0.56 * s, rim);
  p.lineTo(0.56 * s, rim);
  p.bezierCurveTo(0.42 * s, top - 0.7 * s, 0.5 * s, top - 0.1 * s, 0.1 * s, top);
  p.closePath();
  across(g, p, [col([1, 0.88, 0.5]), col([0.95, 0.68, 0.26])], null, [-0.56 * s, 0], [0.56 * s, 0]);
  circle(g, 0, top + 0.02 * s, 0.14 * s, col(RED));
}

function drawGinger(g, u) {
  const body = col([0.74, 0.47, 0.27]);
  circle(g, 0, -0.55 * u, 0.5 * u, body);
  const w = 0.42 * u;
  line(g, -0.62 * u, -1.05 * u, 0.62 * u, -1.05 * u, body, w);
  line(g, 0, -0.95 * u, 0, -1.5 * u, body, w);
  line(g, 0, -1.5 * u, -0.38 * u, -2.0 * u, body, w);
  line(g, 0, -1.5 * u, 0.38 * u, -2.0 * u, body, w);
  const ink = col([0.2, 0.12, 0.08]);
  circle(g, -0.17 * u, -0.5 * u, 0.065 * u, ink);
  circle(g, 0.17 * u, -0.5 * u, 0.065 * u, ink);
  polyline(g, arcPoints(0, -0.62 * u, 0.18 * u, (207 * Math.PI) / 180, (333 * Math.PI) / 180, 6), ink, 0.07 * u);
  circle(g, 0, -1.02 * u, 0.08 * u, col([1, 0.98, 0.94]));
  circle(g, 0, -1.3 * u, 0.08 * u, col([1, 0.98, 0.94]));
}

function drawBow(g, y, s) {
  const dark = col([0.72, 0.14, 0.22]);
  for (const side of [-1, 1]) {
    polygon(
      g,
      [
        [0, y],
        [0.12 * s * side, y - 0.1 * s],
        [0.5 * s * side, y - 0.75 * s],
        [0.28 * s * side, y - 0.75 * s],
      ],
      dark,
    );
    const p = new Path2D();
    p.moveTo(0, y);
    p.bezierCurveTo(0.95 * s * side, y + 0.62 * s, 0.95 * s * side, y - 0.62 * s, 0, y);
    p.closePath();
    fill(g, p, col([0.88, 0.22, 0.28]));
  }
  circle(g, 0, y, 0.17 * s, dark);
}

function drawHanging(g, trim, u, tint) {
  switch (trim) {
    case 'Baubles':
      return drawBauble(g, u, tint);
    case 'Candy':
      return drawCandy(g, u);
    case 'Bells':
      return drawBell(g, -0.1 * u, 1.5 * u);
    case 'Gingerbread':
      return drawGinger(g, u);
    case 'Bows':
      return drawBow(g, -0.75 * u, 1.25 * u);
    default:
      return drawStar(g, 0, -0.95 * u, 0.95 * u, 0.475 * u);
  }
}

function drawTopper(g, topper, s) {
  switch (topper) {
    case 'Star':
      halo(g, 0, 0.82 * s, 0.9 * s, [1, 0.84, 0.4], 0.7);
      drawStar(g, 0, 0.82 * s, 0.78 * s, 0.39 * s);
      break;
    case 'Snowflake': {
      const arm = 0.8 * s;
      const pale = col([0.82, 0.92, 1]);
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 3;
        const tip = [arm * Math.cos(a), 0.9 * s + arm * Math.sin(a)];
        line(g, 0, 0.9 * s, tip[0], tip[1], pale, 0.13 * s);
        const from = [0.62 * tip[0], 0.9 * s + 0.62 * arm * Math.sin(a)];
        for (const d of [-0.75, 0.75]) {
          const b = a + d;
          line(g, from[0], from[1], from[0] + 0.3 * arm * Math.cos(b), from[1] + 0.3 * arm * Math.sin(b), pale, 0.13 * s);
        }
      }
      break;
    }
    case 'Bow':
      drawBow(g, 0.75 * s, 0.95 * s);
      break;
    case 'Bell':
      at(g, 0, 1.5 * s, 0, 1, () => drawBell(g, 0, 1.25 * s));
      break;
    case 'Heart': {
      const p = new Path2D();
      p.moveTo(0, 0.1 * s);
      p.bezierCurveTo(-1.2 * s, 0.8 * s, -0.55 * s, 1.62 * s, 0, 1.15 * s);
      p.bezierCurveTo(0.55 * s, 1.62 * s, 1.2 * s, 0.8 * s, 0, 0.1 * s);
      p.closePath();
      across(g, p, [col([0.98, 0.42, 0.5]), col([0.84, 0.16, 0.28])], null, [0, 1.5 * s], [0, 0]);
      break;
    }
    case 'Spire':
      polygon(
        g,
        [
          [-0.1 * s, 1.05 * s],
          [0, 1.95 * s],
          [0.1 * s, 1.05 * s],
        ],
        col(GOLD_A),
      );
      at(g, 0, 1.15 * s, 0, 1, () => drawBauble(g, 0.72 * s, 0));
      break;
  }
}

function tierPath(t) {
  const { half, hem, apex } = t;
  const h = apex - hem;
  const cc = 0.12 * half;
  const yb = hem + 0.05 * h;
  const p = new Path2D();
  p.moveTo(-0.7 * cc, apex - 0.5 * cc);
  p.quadraticCurveTo(0, apex + 0.25 * cc, 0.7 * cc, apex - 0.5 * cc);
  p.bezierCurveTo(0.42 * half, apex - 0.42 * h, 0.98 * half, hem + 0.32 * h, half, yb);
  const n = Math.max(Math.floor(half / 17), 3);
  for (let k = 0; k < n; k++) {
    const xPrev = half - (2 * half * k) / n;
    const xNext = half - (2 * half * (k + 1)) / n;
    const d = xPrev - xNext;
    p.bezierCurveTo(xPrev + 0.04 * d, yb - 0.46 * d, xNext - 0.04 * d, yb - 0.46 * d, xNext, yb);
  }
  p.bezierCurveTo(-0.98 * half, hem + 0.32 * h, -0.42 * half, apex - 0.42 * h, -0.7 * cc, apex - 0.5 * cc);
  p.closePath();
  return p;
}

function drawBody(g, shape) {
  const th = shape.trunkHalf;
  across(g, rrectPath(-th, -3, 2 * th, shape.trunkTop + 14, 0.4 * th), [col([0.68, 0.46, 0.29]), col([0.54, 0.34, 0.2])], null, [-th, 0], [th, 0]);
  shape.list.forEach((t, i) => {
    const p = tierPath(t);
    const { half, hem, apex } = t;
    const h = apex - hem;
    if (i > 0) at(g, 0, -2.5, 0, 1, () => fill(g, p, col([0.03, 0.22, 0.17], 0.35)));
    fill(g, p, col([0.16, 0.52, 0.38]));
    inside(g, p, () => {
      across(g, p, [col([0.5, 0.84, 0.56]), col([0.26, 0.67, 0.45]), col([0.15, 0.5, 0.38])], [0, 0.55, 1], [0, apex], [0, hem - 0.05 * h]);
      const spot = [-0.3 * half, hem + 0.62 * h];
      round(g, p, [col([1, 1, 0.9], 0.3), col([1, 1, 0.9], 0)], null, spot, spot, 0.75 * half);
    });
  });
}

function drawSnow(g, patches) {
  const on = patches.filter((p) => p.depth > 0.03);
  if (!on.length) return;
  const passes = [
    [[0.08, 0.14, 0.3], 0, -1, 1, 0.2],
    [SNOW_SHADE, 0, 0, 1, 1],
    [SNOW_WHITE, 0.22, 0, 0.84, 1],
  ];
  for (const [color, lift, drop, shrink, alpha] of passes) {
    const c = col(color, alpha);
    for (const p of on) {
      const r = patchRadius(p);
      const dy0 = lift * r + drop;
      at(g, p.x, p.y, p.angle, 1, () => {
        for (const [dx, dy, k] of [
          [-0.82, -0.08, 0.64],
          [0, 0.08, 0.86],
          [0.8, -0.1, 0.6],
        ]) {
          circle(g, dx * r, dy * r + dy0, k * r * shrink, c);
        }
      });
    }
  }
}

function drawCap(g, shape, topper, cap) {
  if (cap <= 0.04) return;
  const [px, py0, wide] = perch(topper, shape.topperSize);
  const py = py0 + shape.topperOrigin;
  const rx = wide * (0.35 + 0.65 * cap);
  const ry = rx / 2;
  const w = col(SNOW_WHITE);
  oval(g, px, py + 0.6 * ry, rx, ry, w);
  oval(g, px - 0.1 * rx, py + 0.9 * ry, 0.6 * rx, ry, w);
}

function drawDecor(g, shape, look) {
  const u = shape.unit;
  if (look.trims.includes('Tinsel')) {
    garland(shape).forEach(([x, y], i) => {
      circle(g, x, y, 0.17 * u, col(i % 2 === 0 ? GOLD_A : GOLD_B));
      circle(g, x - 0.3 * 0.17 * u, y + 0.3 * 0.17 * u, 0.3 * 0.17 * u, col([1, 0.96, 0.8], 0.8));
    });
  }
  if (look.trims.includes('Lights')) {
    for (const b of bulbs(shape)) {
      const t = BULB_TONES[b.tone];
      circle(g, b.x, b.y, 0.2 * u, col([t[0] * 0.82, t[1] * 0.74, t[2] * 0.6]));
    }
  }
  for (const h of hung(shape, look)) at(g, h.x, h.y, h.turn, 1, () => drawHanging(g, h.trim, u, h.tint));
  if (look.topper) at(g, 0, shape.topperOrigin, 0, 1, () => drawTopper(g, look.topper, shape.topperSize));
}

function drawLit(g, shape, lit) {
  const u = shape.unit;
  for (const b of bulbs(shape)) {
    if (b.group !== lit) continue;
    const t = BULB_TONES[b.tone];
    halo(g, b.x, b.y, 4 * 0.27 * u, t, 0.65);
    circle(g, b.x, b.y, 0.27 * u, col(t.map((v) => v + 0.3)));
  }
}

/** Offscreen canvas holding the art in Y-up tree units with the foot at (pad, 8) from the bottom-left. */
function spriteCanvas(shape, ratio) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(shape.w * ratio));
  c.height = Math.max(1, Math.ceil(shape.h * ratio));
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.setTransform(ratio, 0, 0, -ratio, shape.pad * ratio, (shape.h - 8) * ratio);
  return { c, g };
}

/** A 34 x 34 chip icon (Y up, like art.rs topper_icon / trim_icon). */
function chipIcon(draw) {
  const r = 2;
  const c = document.createElement('canvas');
  c.width = 34 * r;
  c.height = 34 * r;
  c.style.cssText = 'display:block;position:static;width:30px;height:30px;pointer-events:none';
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.setTransform(r, 0, 0, -r, 0, 34 * r);
  draw(g);
  return c;
}

function topperIcon(t) {
  return chipIcon((g) => at(g, 17, 4, 0, 1, () => drawTopper(g, t, 15)));
}

function trimIcon(trim) {
  return chipIcon((g) => {
    if (trim === 'Lights') {
      [
        [0.15, 0.62],
        [0.38, 0.42],
        [0.62, 0.42],
        [0.85, 0.62],
      ].forEach(([x, y], i) => {
        const t = BULB_TONES[i];
        halo(g, 34 * x, 34 * y, 9, t, 0.7);
        circle(g, 34 * x, 34 * y, 3.2, col(t.map((v) => v + 0.3)));
      });
    } else if (trim === 'Tinsel') {
      for (let i = 0; i < 17; i++) {
        const t = i / 16;
        circle(g, 34 * (0.1 + 0.8 * t), 34 * (0.62 - 0.3 * (1 - (2 * t - 1) ** 2)), 2.1, col(i % 2 === 0 ? GOLD_A : GOLD_B));
      }
    } else if (trim === 'Candy') {
      at(g, 17, 26, 0.1, 1, () => drawHanging(g, trim, 10, 0));
    } else {
      at(g, 17, 30, 0.1, 1, () => drawHanging(g, trim, 12, 0));
    }
  });
}

// ---- persistence helpers ---------------------------------------------------------------------------------------------

function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(text) {
  try {
    return Array.from(atob(String(text || '')), (ch) => ch.charCodeAt(0));
  } catch {
    return [];
  }
}

const toByte = (v) => Math.round(clamp(v, 0, 1) * 255);

/** A CSS path that finds `el` again on the next page load (id, else nth-of-type chain up to an id or body). */
function elementPath(el) {
  try {
    const parts = [];
    let e = el;
    for (let depth = 0; e && e !== document.body && e !== document.documentElement && depth < 14; depth++) {
      if (e.id && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) {
        parts.unshift('#' + CSS.escape(e.id));
        return parts.join('>');
      }
      const tag = e.tagName.toLowerCase();
      let n = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) n++;
      parts.unshift(`${tag}:nth-of-type(${n})`);
      e = e.parentElement;
    }
    if (e !== document.body) return null;
    parts.unshift('body');
    return parts.join('>');
  } catch {
    return null;
  }
}

function findPath(path) {
  try {
    return path ? document.querySelector(path) : null;
  } catch {
    return null;
  }
}

// ---- the layer -------------------------------------------------------------------------------------------------------

/**
 * @param {import('../host.js').Host} host
 * @returns {import('../host.js').Layer & {trees: () => {id: number, x: number, y: number, surface: any}[], fell: (id: number, fromX?: number) => void}}
 */
export function createTrees(host) {
  const T = (key, en) => host.t9n('trees.' + key, en);
  /** @type {any[]} */
  let trees = [];
  /** @type {any[]} */
  let waiting = [];
  /** @type {any[]} */
  let clumps = [];
  let nextId = 1;
  let rng = new Rng((Date.now() ^ 0x7265) >>> 0);
  let snowAt = SNOW_EVERY;
  let blinkAt = 0;
  let blink = 0;
  let restoreAt = 0;
  let restoredAt = 0;
  let rememberAt = REMEMBER_EVERY;
  let dirty = false;
  let lastSaved = '';
  /** @type {any} */
  let held = null;
  let refusals = 0;

  const S = () => TREE_SCALE * host.scale;
  const ground = () => host.surfaces.ground;
  const snowing = () => host.shown.weather === 'snow';
  const maxPlaced = () => host.config.maxPlaced;

  function newTree(look, seed, x, y) {
    look = cleanLook(look);
    const shape = makeShape(look.level);
    return {
      id: nextId++,
      look,
      shape,
      seed,
      patches: makePatches(shape, seed),
      cap: 0,
      x,
      y,
      vx: 0,
      vy: 0,
      /** @type {any} */
      support: null,
      off: 0,
      growth: 1,
      tilt: 0,
      tiltSpeed: 0,
      hidden: false,
      lifted: false,
      felling: false,
      vanishing: false,
      fallWay: 0,
      fell: 0,
      shed: 0,
      shedLimit: 0,
      shakenAt: -1e9,
      rev: 1,
      snowDirty: false,
      snowDrawn: -1e9,
      /** @type {any} */
      sprite: null,
      /** @type {any} */
      lit: null,
      offscreen: false,
    };
  }

  function visualScale(t) {
    if (t.felling || t.growth >= 1) return t.growth;
    const g = t.growth - 1;
    return Math.max(1 + 2.6 * g * g * g + 1.6 * g * g, 0.01);
  }

  // ---- surfaces ------------------------------------------------------------------------------------------------------

  function setSupport(t, s) {
    const old = t.support;
    t.support = s;
    if (s) {
      t.off = t.x - s.left;
      host.surfaces.pin(s);
    }
    if (old && old !== s && !old.ground && !trees.some((o) => o.support === old)) host.surfaces.unpin(old);
  }

  /** Surfaces something falling may land on: the live ones plus the bottom of the window. */
  function landables() {
    const g = ground();
    const list = host.surfaces.live.filter((s) => !s.ground);
    list.push(g);
    return list;
  }

  function follow(t) {
    const s = t.support;
    if (s.ground) {
      t.x = clamp(s.left + t.off, EDGE, Math.max(EDGE, host.W - EDGE));
      t.off = t.x - s.left;
      t.y = s.top;
      t.hidden = false;
      return;
    }
    if (!s.el || !s.el.isConnected || s.width <= 0) {
      setSupport(t, null);
      return;
    }
    t.x = s.left + t.off;
    t.y = s.top;
    t.hidden = !s.shown || s.occluded;
    if (t.x < s.left - 1 || t.x > s.left + s.width + 1) setSupport(t, null);
  }

  function fall(t, dt) {
    t.vy += GRAVITY * dt;
    const oldY = t.y;
    t.x = clamp(t.x + t.vx * dt, EDGE, Math.max(EDGE, host.W - EDGE));
    t.y += t.vy * dt;
    t.hidden = false;
    let best = null;
    for (const s of landables()) {
      if (s.ground) continue;
      if (s.occluded || !s.shown || t.x < s.left || t.x > s.left + s.width) continue;
      if (oldY <= s.top + 1.5 && t.y >= s.top && (!best || s.top < best.top)) best = s;
    }
    if (!best && t.y >= ground().top) best = ground();
    if (!best) return;
    const impact = t.vy;
    t.y = best.top;
    t.vx = 0;
    t.vy = 0;
    setSupport(t, best);
    t.tiltSpeed += rng.range(-1, 1) * Math.min(impact / 900, 2);
    if (impact > 700) shakeOff(t, Math.min(impact / 8000, 0.3));
    dirty = true;
  }

  // ---- snow ----------------------------------------------------------------------------------------------------------

  function snowTotal(t) {
    let n = 0;
    for (const p of t.patches) n += p.depth;
    return n;
  }

  function addSnow(t, strength) {
    const inc = (strength * SNOW_EVERY) / FULL_IN;
    for (const p of t.patches) if (p.depth < p.fullest) p.depth = Math.min(p.fullest, p.depth + inc * p.weight);
    t.cap = Math.min(t.cap + inc, 1);
    t.snowDirty = true;
  }

  function melt(t) {
    if (t.cap <= 0 && !t.patches.some((p) => p.depth > 0)) return;
    const dec = SNOW_EVERY / MELT_IN;
    for (const p of t.patches) p.depth = Math.max(0, p.depth - dec * p.weight);
    t.cap = Math.max(0, t.cap - dec);
    t.snowDirty = true;
  }

  /** Tree-local Y-up point to viewport. */
  function toView(t, lx, ly) {
    const k = S() * visualScale(t);
    const c = Math.cos(t.tilt);
    const s = Math.sin(t.tilt);
    const rx = lx * c - ly * s;
    const ry = lx * s + ly * c;
    return [t.x + rx * k, t.y - ry * k];
  }

  /** fp-trees 3.7 ShakeOff: clumps of snow fall from the branches. */
  function shakeOff(t, share) {
    const total = snowTotal(t);
    if (total <= 0.5) return;
    if (t.shed === 0) t.shedLimit = total * rng.range(0.4, 0.62);
    let amount = Math.min(total * share, t.shedLimit - t.shed);
    if (amount <= 0) return;
    const reach = t.shape.unit * 2.4;
    for (let attempts = 0; amount > 0 && attempts < 30; attempts++) {
      const pick = t.patches[rng.below(t.patches.length)];
      if (!(pick.depth > 0.08 && rng.range(0, 0.82) > pick.cling)) continue;
      let taken = 0;
      let cx = 0;
      let cy = 0;
      let q = 0;
      for (const p of t.patches) {
        if (Math.hypot(p.x - pick.x, p.y - pick.y) <= reach && p.depth > 0.05 && rng.unit() > p.cling * 0.9 + 0.1) {
          const take = p.depth * rng.range(0.6, 1.0);
          p.depth -= take;
          taken += take;
          cx += p.x * take;
          cy += p.y * take;
          q += p.widest * p.widest * (0.3 + take);
        }
      }
      if (taken > 0) {
        amount -= taken;
        t.shed += taken;
        const [x, y] = toView(t, cx / taken, cy / taken);
        const radius = Math.min(t.shape.unit * 1.2, Math.max(2.5, Math.sqrt(q) * 0.72)) * S();
        spawnClump(x, y, t.vx, t.vy, radius);
      }
    }
    if (t.cap > 0.2 && rng.unit() < share * 6) {
      t.cap *= 0.5;
      const [x, y] = toView(t, 0, t.shape.height + t.shape.topperSize);
      spawnClump(x, y, t.vx, t.vy, 4 * S());
    }
    t.snowDirty = true;
    dirty = true;
  }

  function spawnClump(x, y, vx, vy, radius) {
    if (clumps.length >= MAX_CLUMPS) return;
    clumps.push({
      x,
      y,
      vx: vx * rng.range(0.28, 0.62) + rng.range(-60, 60),
      vy: vy * rng.range(0.15, 0.4) - rng.range(-30, 70),
      r: radius,
      angle: rng.range(0, Math.PI * 2),
      spin: rng.range(-5, 5),
      age: 0,
      breaksAt: radius > 6 * S() ? rng.range(0.12, 0.38) : null,
      look: rng.below(4),
    });
  }

  function stepClumps(dt) {
    if (!clumps.length) return;
    const born = [];
    const snow = host.layer('snow');
    clumps = clumps.filter((c) => {
      c.age += dt;
      c.vy += CLUMP_GRAVITY * dt;
      const oldY = c.y;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.angle += c.spin * dt;
      if (c.breaksAt != null && c.age >= c.breaksAt) {
        const n = 2 + rng.below(3);
        for (let i = 0; i < n; i++) {
          const r = c.r * rng.range(0.5, 0.72);
          born.push({
            x: c.x,
            y: c.y,
            vx: c.vx + rng.range(-80, 80),
            vy: c.vy - rng.range(-20, 40),
            r,
            angle: rng.range(0, Math.PI * 2),
            spin: rng.range(-8, 8),
            age: 0,
            breaksAt: r > 8 * S() ? rng.range(0.15, 0.4) : null,
            look: rng.below(4),
          });
        }
        return false;
      }
      for (const s of landables()) {
        if (!s.ground && (s.occluded || !s.shown)) continue;
        if (c.x < s.left || c.x > s.left + s.width) continue;
        if (oldY <= s.top && c.y >= s.top) {
          try {
            snow?.deposit?.(s, c.x, Math.PI * c.r * c.r * 0.6);
          } catch {
            // the snow layer is optional
          }
          return false;
        }
      }
      return c.y < host.H + 60 && c.x > -60 && c.x < host.W + 60;
    });
    for (const b of born) if (clumps.length < MAX_CLUMPS) clumps.push(b);
  }

  // ---- motion ----------------------------------------------------------------------------------------------------------

  function swing(t, dt) {
    if (t.felling) {
      t.fell += dt;
      t.tilt = t.fallWay * Math.min((t.fell / 0.35) ** 2 * 0.55, 0.55);
      if (t.fell > 0.3) t.growth = Math.max(t.growth - 5 * dt, 0);
      return;
    }
    if (t.vanishing) {
      t.growth = Math.max(t.growth - 6 * dt, 0);
      return;
    }
    if (t.growth < 1) t.growth = Math.min(t.growth + GROWTH_RATE * dt, 1);
    const target = t.lifted ? clamp(-t.vx / 9000, -0.17, 0.17) : 0;
    if (t.lifted || Math.abs(t.tilt) > 0.0008 || Math.abs(t.tiltSpeed) > 0.004) {
      t.tiltSpeed += (-170 * (t.tilt - target) - 11 * t.tiltSpeed) * dt;
      t.tilt += t.tiltSpeed * dt;
    } else {
      t.tilt = 0;
      t.tiltSpeed = 0;
    }
  }

  // ---- planting ------------------------------------------------------------------------------------------------------

  function standingCount() {
    return trees.filter((t) => !t.felling && !t.vanishing).length + waiting.length;
  }

  function plant() {
    if (standingCount() >= maxPlaced()) {
      refusals++;
      const last = [...trees].reverse().find((t) => !t.felling && !t.vanishing && !t.hidden);
      if (last) openCard(last, T('full', 'That is enough trees for this page. Take one down to plant another.'));
      host.emit('trees-full', { max: maxPlaced(), refusals });
      return false;
    }
    refusals = 0;
    const k = S();
    const m = (makeShape(2).half + 30) * k;
    const H = host.H;
    const W = host.W;
    const spans = [];
    const g = ground();
    spans.push({ s: g, lo: m, hi: W - m });
    for (const s of host.surfaces.live) {
      if (s.ground || s.occluded || !s.shown) continue;
      if (s.top < H * 0.2 || s.top > H - 10) continue;
      if (s.top - makeShape(2).height * k < 4) continue;
      const lo = Math.max(s.left + m, m);
      const hi = Math.min(s.left + s.width - m, W - m);
      if (hi > lo) spans.push({ s, lo, hi });
    }
    let best = null;
    for (let i = 0; i < 24; i++) {
      const sp = spans[rng.below(spans.length)];
      const lo = sp.lo;
      const hi = Math.max(sp.lo, sp.hi);
      const x = rng.range(lo, hi);
      let far = 400;
      for (const t of trees) if (!t.felling && Math.abs(t.y - sp.s.top) < 6) far = Math.min(far, Math.abs(t.x - x));
      const score = Math.min(far, 260) - 0.35 * Math.abs(x - W / 2) - (sp.s.ground ? 0 : 0.1 * Math.abs(sp.s.top - H * 0.6));
      if (!best || score > best.score) best = { x, s: sp.s, score };
    }
    if (!best) return false;
    const seed = (rng.unit() * 0xffffffff) >>> 0;
    const t = newTree(defaultLook(), seed, best.x, best.s.top);
    t.growth = 0.01;
    setSupport(t, best.s);
    trees.push(t);
    openCard(t);
    dirty = true;
    save(true);
    return true;
  }

  function vanish(t) {
    if (t.felling || t.vanishing) return;
    t.vanishing = true;
    if (card?.tree === t) closeCard();
    dirty = true;
  }

  // ---- persistence ---------------------------------------------------------------------------------------------------

  function entry(t) {
    const s = t.support;
    const base = {
      look: t.look,
      seed: t.seed,
      depths: b64(t.patches.map((p) => toByte(p.depth))),
      cap: toByte(t.cap),
      fx: host.W > 0 ? clamp(t.x / host.W, 0, 1) : 0.5,
    };
    if (s && !s.ground && s.el) {
      const path = elementPath(s.el);
      if (path) return { ...base, place: 'el', path, fo: s.width > 0 ? clamp(t.off / s.width, 0, 1) : 0.5 };
    }
    return { ...base, place: 'ground' };
  }

  function save(force = false) {
    if (held) return;
    if (trees.some((t) => !t.support && !t.felling && !t.vanishing)) return;
    const list = [...waiting.map((w) => w.saved), ...trees.filter((t) => !t.felling && !t.vanishing).map(entry)];
    const text = JSON.stringify(list);
    if (!force && text === lastSaved) return;
    lastSaved = text;
    host.save('trees', list.length ? list : null);
    dirty = false;
  }

  function restoreAll() {
    const raw = host.load('trees', null);
    if (!Array.isArray(raw)) return;
    waiting = raw.slice(0, Math.max(maxPlaced(), 0)).filter((e) => e && typeof e === 'object').map((saved) => ({ saved, since: host.t }));
  }

  function tryRestore() {
    const still = [];
    for (const w of waiting) {
      const e = w.saved;
      let s = null;
      let x = 0;
      if (e.place === 'el') {
        const el = findPath(e.path);
        if (el) {
          const sf = host.surfaces.ofElement(el);
          if (sf && sf.width > 0) {
            s = sf;
            x = sf.left + clamp(Number(e.fo) || 0, 0, 1) * sf.width;
          } else {
            still.push(w);
            continue;
          }
        } else if (host.t - w.since < MISSING_WAIT) {
          still.push(w);
          continue;
        }
      }
      if (!s) {
        s = ground();
        x = clamp((Number(e.fx) || 0.5) * host.W, EDGE, host.W - EDGE);
      }
      const t = newTree(e.look, Number(e.seed) >>> 0, x, s.top);
      const bytes = unb64(e.depths);
      if (bytes.length === t.patches.length) t.patches.forEach((p, i) => (p.depth = bytes[i] / 255));
      else if (bytes.length) {
        const mean = bytes.reduce((a, b) => a + b, 0) / bytes.length / 255;
        for (const p of t.patches) p.depth = Math.min(mean * p.weight, p.fullest);
      }
      t.cap = clamp(Number(e.cap) || 0, 0, 255) / 255;
      setSupport(t, s);
      if (!s.ground) host.surfaces.pin(s);
      trees.push(t);
    }
    waiting = still;
  }

  // ---- sprites -------------------------------------------------------------------------------------------------------

  function ensureSprites(t) {
    const ratio = S() * host.dpr;
    if (!t.sprite || t.sprite.rev !== t.rev || t.sprite.ratio !== ratio) {
      const { c, g } = spriteCanvas(t.shape, ratio);
      drawBody(g, t.shape);
      drawSnow(g, t.patches);
      drawDecor(g, t.shape, t.look);
      drawCap(g, t.shape, t.look.topper, t.cap);
      t.sprite = { c, rev: t.rev, ratio };
    }
    if (!t.look.trims.includes('Lights')) {
      t.lit = null;
    } else if (!t.lit || t.lit.ratio !== ratio || t.lit.level !== t.shape.level) {
      const pair = [0, 1].map((group) => {
        const { c, g } = spriteCanvas(t.shape, ratio);
        drawLit(g, t.shape, group);
        return c;
      });
      t.lit = { pair, ratio, level: t.shape.level };
    }
  }

  function inRemoveZone(p) {
    return p.x <= 6 || p.x >= host.W - 6 || p.y <= 6;
  }

  // ---- hit test --------------------------------------------------------------------------------------------------------

  function hits(t, px, py) {
    if (t.hidden || t.felling || t.vanishing) return false;
    const k = S() * visualScale(t);
    if (k <= 0.05) return false;
    const sh = t.shape;
    // cheap box first
    const reach = (sh.height + sh.topperSize * 2.4 + 20) * k;
    if (Math.abs(px - t.x) > (sh.half + 40) * k + 10 || py > t.y + 14 * k || py < t.y - reach) return false;
    const dx = (px - t.x) / k;
    const dy = (t.y - py) / k;
    const c = Math.cos(-t.tilt);
    const s = Math.sin(-t.tilt);
    return contains(sh, dx * c - dy * s, dx * s + dy * c, !!t.look.topper);
  }

  function treeAt(x, y) {
    for (let i = trees.length - 1; i >= 0; i--) if (hits(trees[i], x, y)) return trees[i];
    return null;
  }

  function raise(t) {
    trees = trees.filter((o) => o !== t);
    trees.push(t);
  }

  // ---- style card (DOM) ----------------------------------------------------------------------------------------------

  /** @type {null | {tree: any, el: HTMLElement, quip: HTMLElement, title: HTMLElement, sizeName: HTMLElement, topperBtns: Map<string, HTMLButtonElement>, trimBtns: Map<string, HTMLButtonElement>, lastPos: string}} */
  let card = null;


  function button(text, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (title) {
      b.title = title;
      b.setAttribute('aria-label', title);
    }
    // The theme draws it (Bootstrap classes), so the card looks like the rest of the site.
    b.className = 'btn btn-sm btn-outline-secondary';
    return b;
  }

  function chip(icon, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.className = 'btn btn-outline-secondary p-1 d-inline-flex align-items-center justify-content-center';
    b.style.cssText = 'width:42px;height:42px';
    b.appendChild(icon);
    return b;
  }

  function section(label) {
    const wrap = document.createElement('div');
    wrap.className = 'mb-2';
    const l = document.createElement('div');
    l.textContent = label;
    l.className = 'small text-body-secondary mb-1';
    const row = document.createElement('div');
    row.className = 'd-flex flex-wrap gap-1';
    wrap.append(l, row);
    return { wrap, row };
  }

  function openCard(t, quip = '') {
    if (card && card.tree !== t) closeCard();
    if (!card) buildCard(t);
    card.quip.textContent = quip;
    card.quip.style.display = quip ? 'block' : 'none';
    refreshCard();
    placeCard();
  }

  function buildCard(t) {
    const el = document.createElement('div');
    el.setAttribute('data-seasons-ui', 'tree-card');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', T('title', 'Christmas tree'));
    // The look is the theme's own card; only the placement is set here.
    el.className = 'seasons-tree-card card shadow-lg';
    el.style.cssText = `position:fixed;left:0;top:0;z-index:1040;width:${CARD_W}px;max-width:calc(100vw - 16px);user-select:none`;

    const head = document.createElement('div');
    head.className = 'card-header d-flex align-items-center justify-content-between gap-2';
    const title = document.createElement('span');
    title.className = 'fw-semibold';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-close';
    close.setAttribute('aria-label', T('close', 'Close'));
    close.onclick = () => closeCard();
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'card-body p-2';

    const quip = document.createElement('div');
    quip.className = 'small text-body-secondary mb-2';
    quip.style.display = 'none';

    const hs = section(T('height', 'Height'));
    hs.row.style.alignItems = 'center';
    const minus = button('−', T('smaller', 'Smaller'));
    const plus = button('+', T('bigger', 'Bigger'));
    const sizeName = document.createElement('span');
    sizeName.className = 'small text-center';
    sizeName.style.minWidth = '72px';
    minus.onclick = () => restyle(card.tree, { ...card.tree.look, level: clamp(card.tree.look.level - 1, 0, MAX_LEVEL) });
    plus.onclick = () => restyle(card.tree, { ...card.tree.look, level: clamp(card.tree.look.level + 1, 0, MAX_LEVEL) });
    hs.row.append(minus, sizeName, plus);

    const ts = section(T('toppers', 'Topper'));
    const topperBtns = new Map();
    for (const tp of TOPPERS) {
      const b = chip(topperIcon(tp), T('topper.' + tp.toLowerCase(), TOPPER_TEXT[tp]));
      b.onclick = () => {
        const look = card.tree.look;
        restyle(card.tree, { ...look, topper: look.topper === tp ? null : tp });
      };
      topperBtns.set(tp, b);
      ts.row.appendChild(b);
    }

    const rs = section(T('trims', 'Trims'));
    const trimBtns = new Map();
    for (const tr of TRIMS) {
      const b = chip(trimIcon(tr), T('trim.' + tr.toLowerCase(), TRIM_TEXT[tr]));
      b.onclick = () => {
        const look = card.tree.look;
        const trims = look.trims.includes(tr) ? look.trims.filter((x) => x !== tr) : TRIMS.filter((x) => x === tr || look.trims.includes(x));
        restyle(card.tree, { ...look, trims });
      };
      trimBtns.set(tr, b);
      rs.row.appendChild(b);
    }

    const foot = document.createElement('div');
    foot.className = 'card-footer d-flex gap-2 justify-content-between py-2';
    const surprise = button(T('randomise', 'Surprise me'));
    surprise.className = 'btn btn-sm btn-primary';
    surprise.onclick = () => {
      const look = card.tree.look;
      restyle(card.tree, { level: look.level, topper: TOPPERS[rng.below(TOPPERS.length)], trims: TRIMS.filter(() => rng.coin()) });
    };
    const remove = button(T('remove', 'Take down'));
    remove.className = 'btn btn-sm btn-outline-danger';
    remove.onclick = () => {
      const tree = card.tree;
      closeCard();
      vanish(tree);
    };
    foot.append(surprise, remove);

    body.append(quip, hs.wrap, ts.wrap, rs.wrap);
    el.append(head, body, foot);
    document.body.appendChild(el);
    card = { tree: t, el, quip, title, sizeName, topperBtns, trimBtns, lastPos: '' };
  }

  function refreshCard() {
    if (!card) return;
    const look = card.tree.look;
    const name = T('size' + look.level, SIZE_TEXT[look.level]);
    card.title.textContent = name;
    card.sizeName.textContent = `${look.level + 1} / ${MAX_LEVEL + 1}`;
    for (const [tp, b] of card.topperBtns) {
      const on = look.topper === tp;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    for (const [tr, b] of card.trimBtns) {
      const on = look.trims.includes(tr);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  function placeCard() {
    if (!card) return;
    const t = card.tree;
    const k = S();
    const w = card.el.offsetWidth || CARD_W;
    const h = card.el.offsetHeight || 300;
    const right = t.x + t.shape.half * k + 18;
    const x = right + w <= host.W - 8 ? right : Math.max(8, t.x - t.shape.half * k - 18 - w);
    const y = clamp(t.y - t.shape.height * k * 0.25 - h, 8, Math.max(8, host.H - h - 8));
    const pos = `${Math.round(x)},${Math.round(y)},${t.hidden ? 0 : 1}`;
    if (pos === card.lastPos) return;
    card.lastPos = pos;
    card.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    card.el.style.visibility = t.hidden ? 'hidden' : 'visible';
  }

  function closeCard() {
    if (!card) return;
    card.el.remove();
    card = null;
  }

  function restyle(t, look) {
    if (!t) return;
    look = cleanLook(look);
    if (look.level !== t.look.level) {
      const avg = t.patches.length ? snowTotal(t) / t.patches.length : 0;
      t.shape = makeShape(look.level);
      t.patches = makePatches(t.shape, t.seed);
      for (const p of t.patches) p.depth = Math.min(p.fullest, avg * p.weight);
      t.tiltSpeed += 1.4;
    }
    t.look = look;
    t.rev++;
    t.lit = null;
    refreshCard();
    dirty = true;
    save();
  }

  function onKey(e) {
    if (e.key === 'Escape' && card) closeCard();
  }

  function onOutside(e) {
    if (!card) return;
    const target = /** @type {any} */ (e.target);
    if (target instanceof Element && card.el.contains(target)) return;
    if (treeAt(e.clientX, e.clientY)) return;
    closeCard();
  }

  document.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onOutside, true);

  // ---- layer -----------------------------------------------------------------------------------------------------------

  restoreAll();

  return {
    name: 'trees',
    z: 60,

    step(dt) {
      const now = host.t;
      if (waiting.length && now >= restoreAt) {
        restoreAt = now + RESTORE_EVERY;
        tryRestore();
      }
      const snowFire = now >= snowAt;
      if (snowFire) snowAt = now + SNOW_EVERY;
      const toggled = now >= blinkAt;
      if (toggled) {
        blink ^= 1;
        blinkAt = now + BLINK_EVERY;
      }
      const strength = (host.shown.heavy ? 2.5 : 1) * (host.config.pileSpeed || 1);
      for (const t of trees) {
        if (t === held?.tree && t.lifted) {
          // position set in pointerMove; velocity decays when the pointer rests
          if (now - host.pointer.t > 0.05) {
            t.vx *= 0.8;
            t.vy *= 0.8;
          }
        } else if (t.support) {
          follow(t);
          t.vx = 0;
          t.vy = 0;
        } else if (!t.felling && !t.vanishing) {
          fall(t, dt);
        }
        if (t.lifted || t.support) {
          const speed = Math.hypot(t.vx, t.vy);
          if (speed >= 850) {
            t.shakenAt = now;
            const k = Math.min((speed - 850) / 1550, 1);
            shakeOff(t, dt * (0.5 + 1.8 * k));
          } else if (now - t.shakenAt > 0.7) {
            t.shed = 0;
          }
        }
        swing(t, dt);
        if (snowFire && !t.hidden && t !== held?.tree) {
          if (snowing()) addSnow(t, strength);
          else melt(t);
        }
        if (t.snowDirty && now - t.snowDrawn >= SNOW_REDRAW) {
          t.snowDirty = false;
          t.snowDrawn = now;
          t.rev++;
        }
      }
      const before = trees.length;
      trees = trees.filter((t) => {
        const gone = (t.felling || t.vanishing) && t.growth <= 0;
        if (gone && t.support && !t.support.ground && !trees.some((o) => o !== t && o.support === t.support)) host.surfaces.unpin(t.support);
        return !gone;
      });
      if (trees.length !== before) dirty = true;
      if (card && !trees.includes(card.tree)) closeCard();
      stepClumps(dt);
      if (dirty || now >= rememberAt) {
        rememberAt = now + REMEMBER_EVERY;
        if (now - restoredAt > 0.5) save();
      }
      if (card) placeCard();
    },

    draw(g) {
      const k0 = S();
      for (const t of trees) {
        if (t.hidden) continue;
        const vis = visualScale(t);
        if (vis <= 0.01) continue;
        const k = k0 * vis;
        const sh = t.shape;
        if (t.x + sh.pad * k < 0 || t.x - sh.pad * k > host.W || t.y - sh.h * k > host.H || t.y + 8 * k < 0) continue;
        ensureSprites(t);
        g.save();
        if (held?.tree === t && t.lifted && inRemoveZone(host.pointer)) g.globalAlpha = 0.4;
        g.translate(t.x, t.y);
        if (t.tilt) g.rotate(-t.tilt);
        g.scale(vis, vis);
        const w = sh.w * k0;
        const h = sh.h * k0;
        const left = -sh.pad * k0;
        const top = -(sh.h - 8) * k0;
        g.drawImage(t.sprite.c, left, top, w, h);
        if (t.lit) g.drawImage(t.lit.pair[(blink + (t.seed & 1)) % 2], left, top, w, h);
        g.restore();
      }
      if (clumps.length) {
        const shade = 'rgba(199,217,242,1)';
        const white = 'rgba(253,254,255,1)';
        for (const c of clumps) {
          at(g, c.x, c.y, c.angle, 1, () => {
            const r = c.r;
            circle(g, 0, r * 0.15, r, shade);
            circle(g, -r * 0.1, -r * 0.05, r * 0.82, white);
            if (c.look > 1) circle(g, r * 0.55, r * 0.1, r * 0.5, white);
          });
        }
      }
    },

    resize() {
      for (const t of trees) {
        t.sprite = null;
        t.lit = null;
      }
      if (card) card.lastPos = '';
    },

    pointerDown(p) {
      const t = treeAt(p.x, p.y);
      if (!t) return false;
      held = { tree: t, ox: t.x - p.x, oy: t.y - p.y, sx: p.x, sy: p.y, at: host.t };
      t.lifted = false;
      return true;
    },

    pointerMove(p) {
      if (!held) return;
      const t = held.tree;
      if (!t.lifted && Math.hypot(p.x - held.sx, p.y - held.sy) > DRAG_THRESHOLD) {
        t.lifted = true;
        setSupport(t, null);
        if (card?.tree === t) closeCard();
        raise(t);
      }
      if (t.lifted) {
        const nx = p.x + held.ox;
        const ny = p.y + held.oy;
        const dt = Math.max(1e-3, host.t - held.at);
        held.at = host.t;
        t.vx = t.vx * 0.6 + ((nx - t.x) / dt) * 0.4;
        t.vy = t.vy * 0.6 + ((ny - t.y) / dt) * 0.4;
        t.x = nx;
        t.y = ny;
        t.hidden = false;
      }
    },

    pointerUp(p) {
      if (!held) return;
      const t = held.tree;
      held = null;
      if (t.lifted) {
        t.lifted = false;
        if (inRemoveZone(p)) {
          vanish(t);
          save(true);
          return;
        }
        t.vx *= 0.2;
        t.vy = Math.max(t.vy, 0) * 0.3;
      } else if (card?.tree === t) {
        closeCard();
      } else {
        openCard(t);
      }
    },

    hover(p) {
      return treeAt(p.x, p.y) ? 'grab' : null;
    },

    busy() {
      return !!held || clumps.length > 0 || trees.some((t) => t.growth < 1 || t.felling || t.vanishing || !t.support || t.tiltSpeed !== 0);
    },

    command(cmd) {
      if (!cmd || typeof cmd !== 'object') return;
      if (cmd.type === 'plant-tree') plant();
      else if (cmd.type === 'clear') {
        for (const t of trees) vanish(t);
        waiting = [];
        closeCard();
        dirty = true;
      }
    },

    destroy() {
      save();
      closeCard();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onOutside, true);
      for (const t of trees) if (t.support && !t.support.ground) host.surfaces.unpin(t.support);
      trees = [];
      clumps = [];
    },

    /** Standing, visible, grown trees (for the yeti). */
    trees() {
      return trees
        .filter((t) => !t.felling && !t.vanishing && !t.hidden && t.support && t.growth >= 1)
        .map((t) => ({ id: t.id, x: t.x, y: t.y, surface: t.support, height: t.shape.height * S() }));
    },

    /** Fell tree `id` (the yeti): it topples away from `fromX` (default: to the right), sheds its snow and is gone. */
    fell(id, fromX = -Infinity) {
      const t = trees.find((o) => o.id === id && !o.felling && !o.vanishing);
      if (!t) return;
      if (held?.tree === t) held = null;
      t.fallWay = fromX < t.x ? -1 : 1;
      t.tiltSpeed += t.fallWay * 1.8;
      t.shed = 0;
      shakeOff(t, 0.25);
      t.felling = true;
      t.fell = 0;
      if (card?.tree === t) closeCard();
      if (!t.hidden && snowing()) {
        try {
          const snow = host.layer('snow');
          if (snow?.deposit && t.support) snow.deposit(t.support, t.x, Math.min(snowTotal(t), 60) * 40 * S() * S());
        } catch {
          // optional
        }
      }
      host.emit('tree-felled', { id });
      dirty = true;
    },
  };
}
