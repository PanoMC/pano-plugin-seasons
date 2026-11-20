// Free-placed decorations (Frostpane's fp-decor): string lights, candles, baubles and the rest of the catalogue, with
// their procedural art (art.rs), ambient animation (sway, blinking bulbs, candle flicker, glow, steam; motion.rs), pop
// in / out, and the hover chrome: drag to move, the corner grip resizes, the ends and middle of the lights stretch them,
// the x takes one down. Positions are viewport fractions (saved per visitor with host.save('decor')).
//
// Art is in Y-up art units with the origin at the bottom-left of the art box; one unit is DECOR_SCALE CSS px times the
// item's zoom.

const DECOR_SCALE = 0.75;
const PAD = 12;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const POP_IN_SECS = 0.55;
const POP_OUT_SECS = 0.2;
const HOVER_SECS = 0.15;
const SWAY_FPS = 24;
const SCREEN_INSET = 30;
const LIGHTS = { length: 260, dip: 18 };

/** The catalogue in picker order: `id` is the saved kind, `label` the English name (`key` its t9n key). */
export const DECOR_KINDS = [
  { id: 'lights', label: 'String lights' },
  { id: 'candle', label: 'Candle' },
  { id: 'redBauble', label: 'Red bauble' },
  { id: 'goldBauble', label: 'Gold bauble' },
  { id: 'star', label: 'Star' },
  { id: 'wreath', label: 'Wreath' },
  { id: 'stocking', label: 'Stocking' },
  { id: 'candyCane', label: 'Candy cane' },
  { id: 'gift', label: 'Gift' },
  { id: 'bells', label: 'Bells' },
  { id: 'gingerbread', label: 'Gingerbread man' },
  { id: 'holly', label: 'Holly' },
  { id: 'santaHat', label: 'Santa hat' },
  { id: 'snowGlobe', label: 'Snow globe' },
  { id: 'cocoa', label: 'Cocoa mug' },
  { id: 'boat', label: 'Toy boat' },
].map((k) => ({ ...k, key: `decor.kind.${k.id}` }));

const KIND_IDS = DECOR_KINDS.map((k) => k.id);

const SIZES = {
  candle: [52, 112],
  redBauble: [60, 128],
  goldBauble: [60, 128],
  star: [72, 72],
  wreath: [100, 100],
  stocking: [70, 98],
  candyCane: [52, 100],
  gift: [80, 82],
  bells: [86, 82],
  gingerbread: [72, 86],
  holly: [86, 62],
  santaHat: [94, 76],
  snowGlobe: [76, 94],
  cocoa: [82, 88],
  boat: [96, 96],
};

const artSize = (kind, strand) => (kind === 'lights' ? [(strand ?? LIGHTS).length, (strand ?? LIGHTS).dip + 46] : SIZES[kind]);

function pivot(kind, strand) {
  const [w, h] = artSize(kind, strand);
  switch (kind) {
    case 'lights':
      return [w / 2, h - 8];
    case 'redBauble':
    case 'goldBauble':
      return [30, 125];
    case 'star':
      return [36, 36];
    case 'wreath':
      return [50, 92];
    case 'stocking':
      return [12, 94];
    case 'candyCane':
      return [23, 80];
    case 'bells':
      return [43, 76];
    case 'boat':
      return [48, 4];
    default:
      return [w / 2, 2];
  }
}

function swayAngle(kind) {
  switch (kind) {
    case 'lights':
      return 0;
    case 'redBauble':
    case 'goldBauble':
      return 0.045;
    case 'star':
    case 'candyCane':
      return 0.035;
    case 'wreath':
      return 0.02;
    case 'stocking':
      return 0.03;
    case 'bells':
    case 'boat':
      return 0.04;
    default:
      return 0.018;
  }
}

/** Animated parts per kind: art, behind the base, anchor, motion, value (blink delay / glow period), solid for hits. */
function parts(kind) {
  switch (kind) {
    case 'lights':
      return [
        { art: 'lit0', behind: false, anchor: [0, 0], motion: 'blink', value: 0, solid: true },
        { art: 'lit1', behind: false, anchor: [0, 0], motion: 'blink', value: 0.9, solid: true },
      ];
    case 'candle':
      return [
        { art: 'candleHalo', behind: true, anchor: [26, 92], motion: 'glow', value: 1.7, solid: false },
        { art: 'candleFlame', behind: false, anchor: [26, 79], motion: 'flicker', value: 0, solid: true },
      ];
    case 'star':
      return [{ art: 'starHalo', behind: true, anchor: [36, 36], motion: 'glow', value: 2.4, solid: false }];
    case 'cocoa':
      return [{ art: 'steam', behind: false, anchor: [0, 0], motion: 'steam', value: 0, solid: false }];
    default:
      return [];
  }
}

// ---- strand (fp-paint Strand) ----------------------------------------------------------------------------------------

const BULB_TONES = [
  [1.0, 0.25, 0.3],
  [1.0, 0.78, 0.22],
  [0.3, 0.85, 0.45],
  [0.35, 0.62, 1.0],
  [1.0, 0.5, 0.82],
];

function fitted(s) {
  const pick = (v, d, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return { length: pick(Number(s.length), LIGHTS.length, 110, 4000), dip: pick(Number(s.dip), LIGHTS.dip, 0, 260) };
}

function anchors(s) {
  return [
    [6, s.dip + 38],
    [s.length / 2, 38 - s.dip],
    [s.length - 6, s.dip + 38],
  ];
}

function strandPoint(s, t) {
  const [p0, c, p2] = anchors(s);
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]];
}

function strandTangent(s, t) {
  const [p0, c, p2] = anchors(s);
  const u = 1 - t;
  const dx = 2 * u * (c[0] - p0[0]) + 2 * t * (p2[0] - c[0]);
  const dy = 2 * u * (c[1] - p0[1]) + 2 * t * (p2[1] - c[1]);
  return Math.atan2(dy, dx);
}

const bulbCount = (s) => Math.max(3, Math.round((s.length - 12) / 25));

function bulb(s, i) {
  const t = (i + 0.5) / bulbCount(s);
  return [strandPoint(s, t), 0.6 * strandTangent(s, t)];
}

// ---- drawing helpers (Y up) ------------------------------------------------------------------------------------------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function col(t, a = 1) {
  const c = (v) => Math.round(clamp(v, 0, 1) * 255);
  return `rgba(${c(t[0])},${c(t[1])},${c(t[2])},${t.length > 3 ? t[3] : a})`;
}

const RED = [0.86, 0.15, 0.2];
const DARK_RED = [0.55, 0.05, 0.1];
const LIGHT_RED = [0.98, 0.42, 0.42];
const GOLD = [0.98, 0.78, 0.3];
const DARK_GOLD = [0.74, 0.5, 0.12];
const LIGHT_GOLD = [1.0, 0.94, 0.66];
const CREAM = [1.0, 0.98, 0.95];
const WIRE = [0.1, 0.24, 0.14];
const HOLLY = [col([0.25, 0.65, 0.34]), col([0.08, 0.38, 0.19])];

function fillP(g, p, c) {
  g.fillStyle = typeof c === 'string' ? c : col(c);
  g.fill(p);
}

function strokeP(g, p, c, w) {
  g.strokeStyle = typeof c === 'string' ? c : col(c);
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke(p);
}

function circle(g, x, y, r, c) {
  if (!(r > 0)) return;
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  fillP(g, p, c);
}

function ovalPath(x, y, w, h) {
  const p = new Path2D();
  p.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.01), Math.max(h / 2, 0.01), 0, 0, Math.PI * 2);
  return p;
}

const ellipse = (g, x, y, w, h, c) => fillP(g, ovalPath(x, y, w, h), c);
const ring = (g, x, y, w, h, c, lw) => strokeP(g, ovalPath(x, y, w, h), c, lw);

function rrect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
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

const rect = (g, x, y, w, h, r, c) => fillP(g, rrect(x, y, w, h, r), c);

function poly(pts, close = true) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (close) p.closePath();
  return p;
}

const polygon = (g, pts, c) => fillP(g, poly(pts), c);
const polyline = (g, pts, c, w) => strokeP(g, poly(pts, false), c, w);
const line = (g, x0, y0, x1, y1, c, w) => polyline(g, [[x0, y0], [x1, y1]], c, w);

function grad(gr, colors, stops) {
  colors.forEach((c, i) => gr.addColorStop(stops ? stops[i] : colors.length > 1 ? i / (colors.length - 1) : 0, typeof c === 'string' ? c : col(c)));
  return gr;
}

function across(g, p, colors, stops, from, to) {
  g.fillStyle = grad(g.createLinearGradient(from[0], from[1], to[0], to[1]), colors, stops);
  g.fill(p);
}

function round(g, p, colors, stops, light, center, r) {
  g.fillStyle = grad(g.createRadialGradient(light[0], light[1], 0, center[0], center[1], r), colors, stops);
  g.fill(p);
}

/** Two-colour vertical gradient over the path's box (`top` at the higher Y). */
function vertical(g, p, y0, y1, top, bottom) {
  across(g, p, [top, bottom], null, [0, y1], [0, y0]);
}

function halo(g, x, y, r, t) {
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  round(g, p, [col(t), col([t[0], t[1], t[2], 0])], null, [x, y], [x, y], r);
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

function cloth(g, p, x0, x1) {
  across(g, p, [DARK_RED, RED, LIGHT_RED, RED, DARK_RED], [0, 0.3, 0.45, 0.72, 1], [x0, 0], [x1, 0]);
}

function metal(g, p, x0, x1) {
  across(g, p, [DARK_GOLD, GOLD, LIGHT_GOLD, GOLD, DARK_GOLD], null, [x0, 0], [x1, 0]);
}

function berry(g, x, y, r) {
  round(g, ovalPath(x - r, y - r, 2 * r, 2 * r), [[1, 0.45, 0.45], [0.88, 0.1, 0.16], [0.55, 0.02, 0.08]], [0, 0.5, 1], [x - r * 0.3, y + r * 0.3], [x, y], r);
  circle(g, x - r * 0.35, y + r * 0.4, r * 0.25, [1, 1, 1, 0.8]);
}

function leaf(g, x, y, turn, len, tones) {
  at(g, x, y, turn, 1, () => {
    const w = len * 0.3;
    const p = new Path2D();
    p.moveTo(0, 0);
    p.quadraticCurveTo(len * 0.5, w, len, 0);
    p.quadraticCurveTo(len * 0.5, -w, 0, 0);
    p.closePath();
    across(g, p, tones, null, [0, 0], [len, 0]);
    line(g, len * 0.08, 0, len * 0.85, 0, [0.8, 0.95, 0.8, 0.55], 0.8);
  });
}

function sprig(g, x, y) {
  leaf(g, x, y, 0.4, 16, HOLLY);
  leaf(g, x, y, 2.74, 16, HOLLY);
  berry(g, x - 2, y + 1, 3);
  berry(g, x + 2.5, y + 1.5, 3);
  berry(g, x, y + 4, 3);
}

function bow(g, x, y, scale, fill, edge) {
  at(g, x, y, 0, scale, () => {
    ellipse(g, -9, -6.5, 18, 4, [0, 0, 0, 0.12]);
    polygon(g, [[-2, -1], [-9, -15], [-3, -13], [0, -4]], fill);
    polygon(g, [[2, -1], [9, -15], [3, -13], [0, -4]], fill);
    polyline(g, [[-9, -15], [-3, -13]], edge, 0.8);
    polyline(g, [[9, -15], [3, -13]], edge, 0.8);
    for (const sign of [-1, 1]) {
      at(g, 9 * sign, 2.5, -0.35 * sign, 1, () => {
        ellipse(g, -8, -5, 16, 10, fill);
        ring(g, -8, -5, 16, 10, edge, 0.8);
      });
    }
    circle(g, 0, 0, 3.6, fill);
    circle(g, -0.8, 0.8, 1.2, [1, 1, 1, 0.35]);
  });
}

const redBow = (g, x, y, s) => bow(g, x, y, s, RED, DARK_RED);

function starPoints(cx, cy, outer, inner) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function fir(g, x, y, scale) {
  at(g, x, y, 0, scale, () => {
    polygon(g, [[-14, 0], [14, 0], [0, 14]], [0.1, 0.42, 0.22]);
    polygon(g, [[-11, 9], [11, 9], [0, 23]], [0.14, 0.5, 0.27]);
    polygon(g, [[-8, 18], [8, 18], [0, 32]], [0.2, 0.58, 0.32]);
  });
}

// ---- art per kind ----------------------------------------------------------------------------------------------------

function drawLights(g, st) {
  const [p0, c, p2] = anchors(st);
  const rope = new Path2D();
  rope.moveTo(p0[0], p0[1]);
  rope.quadraticCurveTo(c[0], c[1], p2[0], p2[1]);
  strokeP(g, rope, WIRE, 2.2);
  ring(g, p0[0] - 5, p0[1] - 2, 6, 6, WIRE, 1.8);
  ring(g, p2[0] - 1, p2[1] - 2, 6, 6, WIRE, 1.8);
  for (let i = 0; i < bulbCount(st); i++) {
    const [[x, y], turn] = bulb(st, i);
    const [r, gg, b] = BULB_TONES[i % 5];
    at(g, x, y, turn, 1, () => {
      rect(g, -3.4, -7, 6.8, 7.5, 1.6, [0.12, 0.3, 0.17]);
      round(g, ovalPath(-4.8, -21, 9.6, 15), [[r * 0.75 + 0.2, gg * 0.75 + 0.2, b * 0.75 + 0.2], [r * 0.55, gg * 0.55, b * 0.55]], null, [-1.5, -11], [0, -13.5], 9);
      ellipse(g, -3, -12, 2.2, 4.5, [1, 1, 1, 0.4]);
    });
  }
}

function drawLit(g, st, group) {
  for (let i = group; i < bulbCount(st); i += 2) {
    const [[x, y], turn] = bulb(st, i);
    const [r, gg, b] = BULB_TONES[i % 5];
    at(g, x, y, turn, 1, () => {
      halo(g, 0, -13.5, 16, [r, gg, b, 0.55]);
      round(g, ovalPath(-4.8, -21, 9.6, 15), [[1, 1, 0.95], [r + 0.3, gg + 0.3, b + 0.3], [r, gg, b]], [0, 0.35, 1], [-1, -12], [0, -13.5], 9);
    });
  }
}

function drawCandle(g) {
  ring(g, 40, 3, 10, 8, DARK_GOLD, 1.8);
  metal(g, rrect(6, 2, 40, 10, 5), 6, 46);
  cloth(g, rrect(16, 10, 20, 66, 3), 16, 36);
  ellipse(g, 16, 72, 20, 8, LIGHT_RED);
  ellipse(g, 23, 74, 6, 3, DARK_RED);
  rect(g, 18, 62, 3.2, 12, 1.6, [1, 0.98, 0.95, 0.55]);
  rect(g, 31, 58, 3.2, 16, 1.6, [1, 0.98, 0.95, 0.55]);
  line(g, 26, 77, 26, 80, [0.25, 0.12, 0.08], 1.4);
  sprig(g, 14, 12);
}

function drawFlame(g) {
  const outer = new Path2D();
  outer.moveTo(26, 78);
  outer.bezierCurveTo(17, 88, 24, 97, 26, 105);
  outer.bezierCurveTo(28, 97, 35, 88, 26, 78);
  outer.closePath();
  across(g, outer, [[1, 0.5, 0.1], [1, 0.8, 0.28], [1, 0.95, 0.7, 0.9]], [0, 0.45, 1], [26, 78], [26, 105]);
  const core = new Path2D();
  core.moveTo(26, 80);
  core.bezierCurveTo(22.5, 85, 24.5, 89, 26, 93);
  core.bezierCurveTo(27.5, 89, 29.5, 85, 26, 80);
  core.closePath();
  fillP(g, core, [1, 1, 0.92]);
  ellipse(g, 23.5, 79, 5, 4, [0.45, 0.6, 1, 0.55]);
}

function drawBauble(g, base, band) {
  const [r, gg, b] = base;
  const cord = poly([[28.6, 73], [30, 124.5], [31.4, 73]], false);
  strokeP(g, cord, [0.78, 0.1, 0.16], 1.4);
  circle(g, 30, 124.5, 2, [0.78, 0.1, 0.16]);
  ring(g, 26, 67, 8, 8, GOLD, 1.6);
  metal(g, rrect(23, 57, 14, 11, 2.5), 23, 37);
  for (const x of [27, 30, 33]) line(g, x, 58, x, 67, DARK_GOLD, 0.8);
  const ball = ovalPath(3, 5, 54, 54);
  round(g, ball, [[r + 0.25, gg + 0.25, b + 0.25], [r, gg, b], [r * 0.55, gg * 0.5, b * 0.55]], [0, 0.5, 1], [20, 44], [30, 32], 31);
  inside(g, ball, () => {
    for (const y of [27, 38]) {
      const p = new Path2D();
      p.moveTo(0, y + 3);
      p.quadraticCurveTo(30, y - 4, 60, y + 3);
      strokeP(g, p, band, 2);
    }
    for (let i = 0; i < 7; i++) {
      const x = 6 + 8 * i;
      const n = (x - 30) / 30;
      circle(g, x, 32.5 + 3.5 * n * n, 2, band);
    }
  });
  at(g, 18, 46, 0.6, 1, () => ellipse(g, -6, -3.2, 12, 6.4, [1, 1, 1, 0.8]));
}

function drawStar(g) {
  const pts = starPoints(36, 36, 32, 14);
  const body = poly(pts);
  round(g, body, [[1, 0.96, 0.7], [1, 0.8, 0.26], [0.86, 0.56, 0.1]], null, [30, 44], [36, 36], 34);
  for (let i = 0; i < 10; i += 2) polygon(g, [[36, 36], pts[i], pts[(i + 1) % 10]], [0.6, 0.35, 0, 0.14]);
  strokeP(g, body, [0.74, 0.46, 0.06], 1.2);
  circle(g, 30, 46, 3, [1, 1, 1, 0.75]);
}

function drawWreath(g) {
  const greens = [[0.07, 0.36, 0.18], [0.13, 0.5, 0.26], [0.22, 0.62, 0.32]];
  const leafP = new Path2D();
  leafP.moveTo(-9.5, 0);
  leafP.quadraticCurveTo(0, 4.6, 9.5, 0);
  leafP.quadraticCurveTo(0, -4.6, -9.5, 0);
  leafP.closePath();
  let n = 0;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 36; i++) {
      const a = ((i + row * 0.5) * Math.PI * 2) / 36;
      const rad = 31 + [-7, 0, 7][n % 3];
      const wob = (i + row) % 2 === 0 ? 0.5 : -0.5;
      const tone = greens[n % 3];
      at(g, 50 + rad * Math.cos(a), 54 + rad * Math.sin(a), a + Math.PI / 2 + wob, 1, () => fillP(g, leafP, tone));
      n++;
    }
  }
  for (const a of [0.25, 1.1, 1.95, 2.8, 3.6, 5.85]) {
    const x = 50 + 31 * Math.cos(a);
    const y = 54 + 31 * Math.sin(a);
    berry(g, x - 3, y, 3.4);
    berry(g, x + 3, y, 3.4);
    berry(g, x, y + 4.5, 3.4);
  }
  redBow(g, 50, 22, 1.3);
}

function drawStocking(g) {
  const body = new Path2D();
  body.moveTo(16, 74);
  body.lineTo(16, 32);
  body.bezierCurveTo(16, 20, 17, 13, 24, 10);
  body.bezierCurveTo(34, 6, 48, 6, 54, 10);
  body.bezierCurveTo(62, 12, 64, 18, 62, 22);
  body.bezierCurveTo(60, 28, 50, 30, 46, 32);
  body.lineTo(46, 74);
  body.closePath();
  cloth(g, body, 8, 64);
  inside(g, body, () => {
    line(g, 14, 52, 48, 52, CREAM, 4);
    line(g, 14, 42, 48, 42, CREAM, 4);
    ellipse(g, 18, 58, 12, 9, [0.1, 0.45, 0.22]);
    ellipse(g, 30, 22, 12, 9, [0.1, 0.45, 0.22]);
  });
  strokeP(g, body, DARK_RED, 1.2);
  rect(g, 12, 72, 40, 20, 7, CREAM);
  for (let i = 0; i < 5; i++) circle(g, 16 + 8 * i, 72, 3.5, CREAM);
  ellipse(g, 16, 82, 22, 3, [0.7, 0.8, 1, 0.35]);
  ring(g, 3.5, 78, 9, 12, DARK_RED, 1.8);
}

function drawCandyCane(g) {
  const centre = new Path2D();
  centre.moveTo(34, 6);
  centre.lineTo(34, 70);
  centre.bezierCurveTo(34, 76, 29, 81, 23, 81);
  centre.bezierCurveTo(17, 81, 12, 76, 12, 70);
  centre.lineTo(12, 60);
  // The body is the stroke of the centre line: paint it, then stripe only its pixels (the canvas holds nothing else
  // yet), then put the outline behind.
  strokeP(g, centre, CREAM, 12);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  at(g, 23, 40, -0.6, 1, () => {
    for (let i = -9; i < 9; i++) rect(g, i * 10 - 2.3, -80, 4.6, 160, 0, RED);
  });
  line(g, 31, 10, 31, 66, [1, 1, 1, 0.45], 2.2);
  g.globalCompositeOperation = 'destination-over';
  strokeP(g, centre, DARK_RED, 14);
  g.restore();
  bow(g, 34, 46, 0.6, [0.1, 0.5, 0.25], [0.05, 0.28, 0.14]);
}

function drawGift(g) {
  const top = [0.86, 0.16, 0.22];
  const bottom = [0.62, 0.06, 0.12];
  vertical(g, rrect(12, 4, 56, 42, 3), 4, 46, top, bottom);
  for (let row = 0; row < 5; row++) {
    for (let c = 0; c < 7; c++) circle(g, 17 + c * 8 + (row % 2 ? 4 : 0), 10 + row * 8, 1.6, [1, 1, 1, 0.35]);
  }
  metal(g, rrect(35, 4, 10, 42, 0.5), 35, 45);
  rect(g, 12, 40, 56, 5, 0, [0, 0, 0.1, 0.18]);
  vertical(g, rrect(8, 44, 64, 14, 3), 44, 58, top, bottom);
  metal(g, rrect(35, 44, 10, 14, 0.5), 35, 45);
  strokeP(g, rrect(8, 44, 64, 14, 3), DARK_RED, 1);
  bow(g, 40, 64, 0.9, GOLD, DARK_GOLD);
}

function drawBells(g) {
  for (const [x, turn] of [[35, -0.35], [51, 0.35]]) {
    at(g, x, 64, turn, 1, () => {
      circle(g, 0, -35, 4.2, DARK_GOLD);
      const body = new Path2D();
      body.moveTo(-12, 0);
      body.bezierCurveTo(-12, -16, -17, -22, -17, -32);
      body.quadraticCurveTo(0, -36.5, 17, -32);
      body.bezierCurveTo(17, -22, 12, -16, 12, 0);
      body.closePath();
      metal(g, body, -17, 17);
      const rim = new Path2D();
      rim.moveTo(-17, -32);
      rim.quadraticCurveTo(0, -36.5, 17, -32);
      strokeP(g, rim, DARK_GOLD, 1.4);
      strokeP(g, body, [0.6, 0.38, 0.06], 1);
      ellipse(g, -8, -20, 3, 13, [1, 1, 1, 0.55]);
    });
  }
  redBow(g, 43, 68, 0.75);
}

function drawGingerbread(g) {
  const edge = [0.55, 0.3, 0.12];
  const fill = [0.82, 0.52, 0.26];
  const limbs = [
    [[27, 52], [10, 44], 14],
    [[45, 52], [62, 44], 14],
    [[31, 34], [23, 10], 15],
    [[41, 34], [49, 10], 15],
  ];
  for (const [a, b, w] of limbs) line(g, a[0], a[1], b[0], b[1], edge, w + 3);
  rect(g, 20.5, 26.5, 31, 33, 13.5, edge);
  circle(g, 36, 68, 15.5, edge);
  for (const [a, b, w] of limbs) line(g, a[0], a[1], b[0], b[1], fill, w);
  rect(g, 22, 28, 28, 30, 12, fill);
  circle(g, 36, 68, 14, fill);
  polyline(g, [[5, 50], [8, 46], [11, 50], [14, 46]], CREAM, 1.4);
  polyline(g, [[58, 46], [61, 50], [64, 46], [67, 50]], CREAM, 1.4);
  polyline(g, [[20, 14], [23, 18], [26, 14]], CREAM, 1.4);
  polyline(g, [[46, 14], [49, 18], [52, 14]], CREAM, 1.4);
  const smile = new Path2D();
  smile.moveTo(31, 64);
  smile.quadraticCurveTo(36, 59, 41, 64);
  strokeP(g, smile, edge, 1.4);
  circle(g, 31, 71, 2, edge);
  circle(g, 41, 71, 2, edge);
  circle(g, 27, 66, 2.6, [1, 0.55, 0.6, 0.7]);
  circle(g, 45, 66, 2.6, [1, 0.55, 0.6, 0.7]);
  for (const [y, c] of [[52, RED], [45, [0.1, 0.5, 0.25]], [38, RED]]) {
    circle(g, 36, y, 2.8, c);
    circle(g, 35.2, y + 0.9, 0.9, [1, 1, 1, 0.7]);
  }
}

function drawHolly(g) {
  for (const [turn, len] of [[2.79, 37], [0.35, 37], [-2.07, 28], [-1.07, 28]]) leaf(g, 43, 32, turn, len, HOLLY);
  berry(g, 38.5, 36, 5.6);
  berry(g, 47.5, 36, 5.6);
  berry(g, 43, 42.5, 5.6);
}

function drawSantaHat(g) {
  const cone = new Path2D();
  cone.moveTo(12, 24);
  cone.bezierCurveTo(10, 52, 50, 62, 76, 47);
  cone.bezierCurveTo(82, 40, 83, 32, 82, 24);
  cone.closePath();
  round(g, cone, [LIGHT_RED, RED, DARK_RED], null, [40, 46], [46, 38], 46);
  const fold = new Path2D();
  fold.moveTo(30, 26);
  fold.quadraticCurveTo(40, 48, 66, 56);
  strokeP(g, fold, [0.4, 0, 0.05, 0.35], 3);
  rect(g, 8, 6, 74, 20, 9, CREAM);
  for (let i = 0; i < 8; i++) circle(g, 14 + 9 * i, 8, 4.5, CREAM);
  ellipse(g, 14, 18, 60, 3, [0.7, 0.8, 1, 0.3]);
  circle(g, 78, 47, 8.5, CREAM);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8;
    circle(g, 78 + 7.5 * Math.cos(a), 47 + 7.5 * Math.sin(a), 4, CREAM);
  }
  circle(g, 75, 44, 3, [0.8, 0.88, 1, 0.5]);
}

/** Flakes inside the snow globe (art.rs LCG, u64 arithmetic). */
const GLOBE_FLAKES = (() => {
  const out = [];
  let seed = 7n;
  const M = (1n << 64n) - 1n;
  for (let i = 0; i < 26; i++) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & M;
    const x = 10 + (Number((seed >> 40n) & 255n) / 255) * 56;
    const y = 40 + (Number((seed >> 24n) & 255n) / 255) * 42;
    const r = 0.8 + Number((seed >> 16n) & 15n) / 15;
    out.push([x, y, r]);
  }
  return out;
})();

function drawSnowGlobe(g) {
  const sphere = ovalPath(8, 24, 60, 60);
  vertical(g, sphere, 24, 84, [0.82, 0.92, 1], [0.5, 0.72, 0.98]);
  inside(g, sphere, () => {
    ellipse(g, 12, 26, 52, 18, [1, 1, 1, 0.92]);
    rect(g, 35.5, 36, 5, 9, 0, [0.4, 0.24, 0.12]);
    polygon(g, [[26, 42], [50, 42], [38, 56]], [0.1, 0.42, 0.22]);
    polygon(g, [[28, 50], [48, 50], [38, 64]], [0.14, 0.5, 0.27]);
    polygon(g, [[30, 58], [46, 58], [38, 72]], [0.2, 0.58, 0.32]);
    polygon(g, starPoints(38, 74, 6, 2.6), GOLD);
    for (const [x, y, r] of GLOBE_FLAKES) circle(g, x, y, r, [1, 1, 1, 0.9]);
  });
  strokeP(g, sphere, [0.3, 0.5, 0.8, 0.5], 1);
  const glint = new Path2D();
  glint.moveTo(18, 64);
  glint.quadraticCurveTo(16, 72, 26, 76);
  strokeP(g, glint, [1, 1, 1, 0.7], 2.5);
  cloth(g, poly([[8, 4], [68, 4], [60, 26], [16, 26]]), 8, 68);
  metal(g, rrect(13, 12, 50, 4, 1), 13, 63);
  line(g, 16, 26, 60, 26, DARK_RED, 2);
}

function drawCocoa(g) {
  ring(g, 52, 22, 20, 26, RED, 7);
  cloth(g, rrect(14, 8, 48, 50, 8), 14, 62);
  rect(g, 14, 26, 48, 12, 0, CREAM);
  for (let i = 0; i < 7; i++) circle(g, 20 + 6 * i, 32, 1.8, RED);
  ellipse(g, 14, 52, 48, 12, CREAM);
  ellipse(g, 17, 54, 42, 8, [0.42, 0.22, 0.1]);
  for (const [x, y, a] of [[26, 60, 0.3], [38, 61, -0.25], [47, 59, 0.5]]) {
    at(g, x, y, a, 1, () => {
      rect(g, -6, -4, 12, 8, 3, CREAM);
      ellipse(g, -4, 0, 6, 2, [0.7, 0.8, 1, 0.4]);
    });
  }
}

function drawSteam(g) {
  for (const x of [26, 36, 46]) {
    const curl = new Path2D();
    curl.moveTo(x, 66);
    curl.bezierCurveTo(x - 6, 70, x + 6, 75, x, 80);
    strokeP(g, curl, [1, 1, 1, 0.6], 2.6);
  }
}

function drawBoat(g) {
  const hull = new Path2D();
  hull.moveTo(6, 38);
  hull.lineTo(90, 38);
  hull.bezierCurveTo(89, 26, 86, 20, 84, 16);
  hull.lineTo(18, 12);
  hull.bezierCurveTo(10, 18, 6, 28, 6, 38);
  hull.closePath();
  across(g, hull, [[0.62, 0.06, 0.12], RED, LIGHT_RED], null, [0, 12], [0, 38]);
  inside(g, hull, () => rect(g, 0, 29, 96, 4, 0, CREAM));
  line(g, 6, 38, 90, 38, GOLD, 2.5);
  for (const x of [30, 48, 66]) {
    circle(g, x, 22, 4.2, GOLD);
    circle(g, x, 22, 3, [0.35, 0.6, 1]);
  }
  line(g, 48, 38, 48, 90, [0.45, 0.28, 0.12], 3);
  polygon(g, [[49.5, 90], [49.5, 82], [62, 86]], [0.1, 0.5, 0.25]);
  const sail = poly([[52, 50], [52, 86], [84, 50]]);
  fillP(g, sail, CREAM);
  inside(g, sail, () => {
    line(g, 50, 56, 84, 56, RED, 3);
    line(g, 50, 64, 84, 64, RED, 3);
  });
  fir(g, 20, 39, 0.9);
  for (const [x, y, c] of [[15, 44, RED], [24, 50, GOLD], [20, 58, RED]]) circle(g, x, y, 1.8, c);
  rect(g, 32, 39, 10, 9, 0.5, [0.1, 0.5, 0.25]);
  rect(g, 35.5, 39, 3, 9, 0, RED);
  rect(g, 41, 39, 6, 6, 0.5, RED);
  rect(g, 43.5, 39, 1.5, 6, 0, GOLD);
  polyline(g, [[54, 39], [54, 44], [88, 44], [88, 39]], GOLD, 1);
  for (const x of [62, 70, 78]) line(g, x, 39, x, 44, GOLD, 1);
}

function drawBase(g, kind, strand) {
  switch (kind) {
    case 'lights':
      return drawLights(g, strand ?? LIGHTS);
    case 'candle':
      return drawCandle(g);
    case 'redBauble':
      return drawBauble(g, [0.86, 0.14, 0.2], [0.98, 0.78, 0.3]);
    case 'goldBauble':
      return drawBauble(g, [0.96, 0.72, 0.22], [1, 0.98, 0.95]);
    case 'star':
      return drawStar(g);
    case 'wreath':
      return drawWreath(g);
    case 'stocking':
      return drawStocking(g);
    case 'candyCane':
      return drawCandyCane(g);
    case 'gift':
      return drawGift(g);
    case 'bells':
      return drawBells(g);
    case 'gingerbread':
      return drawGingerbread(g);
    case 'holly':
      return drawHolly(g);
    case 'santaHat':
      return drawSantaHat(g);
    case 'snowGlobe':
      return drawSnowGlobe(g);
    case 'cocoa':
      return drawCocoa(g);
    case 'boat':
      return drawBoat(g);
  }
}

function drawPart(g, art, strand) {
  switch (art) {
    case 'candleHalo':
      return halo(g, 26, 92, 26, [1, 0.78, 0.38, 0.45]);
    case 'candleFlame':
      return drawFlame(g);
    case 'starHalo':
      return halo(g, 36, 36, 44, [1, 0.85, 0.35, 0.55]);
    case 'steam':
      return drawSteam(g);
    case 'lit0':
      return drawLit(g, strand ?? LIGHTS, 0);
    case 'lit1':
      return drawLit(g, strand ?? LIGHTS, 1);
  }
}

// ---- motion (motion.rs) ----------------------------------------------------------------------------------------------

function evenly(vals, u) {
  const span = vals.length - 1;
  const x = clamp(u, 0, 1) * span;
  const i = Math.min(Math.floor(x), vals.length - 2);
  return vals[i] + (vals[i + 1] - vals[i]) * (x - i);
}

function keyed(times, vals, u) {
  let i = 1;
  while (i < times.length - 1 && u > times[i]) i++;
  const f = clamp((u - times[i - 1]) / (times[i] - times[i - 1]), 0, 1);
  return vals[i - 1] + (vals[i] - vals[i - 1]) * f;
}

const wrap = (t, period) => (((t % period) + period) % period) / period;

function sway(angle, u) {
  const TIMES = [0, 0.08, 0.17, 0.26, 0.34, 0.42, 1];
  const VALS = [0, 1, -0.75, 0.45, -0.2, 0, 0];
  let i = 1;
  while (i < TIMES.length - 1 && u > TIMES[i]) i++;
  const f = clamp((u - TIMES[i - 1]) / (TIMES[i] - TIMES[i - 1]), 0, 1);
  const eased = (1 - Math.cos(Math.PI * f)) / 2;
  return angle * (VALS[i - 1] + (VALS[i] - VALS[i - 1]) * eased);
}

function partState(motion, value, now, phase) {
  const fps = { blink: 20, flicker: 24, glow: 12, steam: 15 }[motion];
  const t = Math.floor(now * fps) / fps;
  const atp = (period, delay) => wrap(t + phase * period + delay, period);
  const s = { opacity: 1, sx: 1, sy: 1, rot: 0, ty: 0 };
  if (motion === 'blink') {
    s.opacity = keyed([0, 0.42, 0.5, 0.92, 1], [1, 1, 0.12, 0.12, 1], atp(1.8, value));
  } else if (motion === 'flicker') {
    s.sy = evenly([1, 1.1, 0.93, 1.06, 0.96, 1], atp(1.1, 0));
    s.sx = evenly([1, 0.93, 1.04, 0.97, 1], atp(0.9, 0));
    s.rot = evenly([0, -0.05, 0.04, -0.03, 0.02, 0], atp(1.7, 0));
  } else if (motion === 'glow') {
    s.opacity = evenly([0.65, 1, 0.75, 0.95, 0.65], atp(value, 0));
  } else {
    const u = atp(2.8, 0);
    s.opacity = evenly([0, 0.9, 0], u);
    s.ty = evenly([-2, 5], u);
  }
  return s;
}

function elasticOut(t) {
  t = clamp(t, 0, 1);
  const u = 1 - t;
  const expo = (Math.exp(4 * u) - 1) / (Math.exp(4) - 1);
  return 1 - expo * Math.sin((2 * Math.PI + Math.PI / 2) * u);
}

const popIn = (t) => 0.2 + 0.8 * elasticOut(t / POP_IN_SECS);
const popOut = (t) => 1 - 0.9 * clamp(t / POP_OUT_SECS, 0, 1);

// ---- canvases ----------------------------------------------------------------------------------------------------------

/** Canvas of the padded box at `ratio` px per art unit, Y up with the art origin at (PAD, PAD) from the bottom-left. */
function boxCanvas(kind, strand, ratio) {
  const [aw, ah] = artSize(kind, strand);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil((aw + 2 * PAD) * ratio));
  c.height = Math.max(1, Math.ceil((ah + 2 * PAD) * ratio));
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: false }));
  g.setTransform(ratio, 0, 0, -ratio, PAD * ratio, c.height - PAD * ratio);
  return { c, g };
}

/** Picker icon: the decoration at rest, fitted into a `size` x `size` canvas (CSS px; drawn at 2x). */
export function decorIcon(kind, size = 48) {
  const c = document.createElement('canvas');
  const r = 2;
  c.width = size * r;
  c.height = size * r;
  c.style.cssText = `display:block;position:static;width:${size}px;height:${size}px`;
  if (!KIND_IDS.includes(kind)) return c;
  const [w, h] = artSize(kind, null);
  const k = Math.min(size / w, size / h) * r;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.setTransform(k, 0, 0, -k, (c.width - w * k) / 2, c.height - (c.height - h * k) / 2);
  const list = parts(kind);
  for (const p of list) if (p.behind) drawPart(g, p.art, null);
  drawBase(g, kind, null);
  for (const p of list) if (!p.behind) drawPart(g, p.art, null);
  return c;
}

// ---- the layer -------------------------------------------------------------------------------------------------------

/**
 * @param {import('../host.js').Host} host
 * @returns {import('../host.js').Layer & {items: () => {id: number, kind: string, x: number, y: number}[], count: () => number}}
 */
export function createDecor(host) {
  /** @type {any[]} */
  let items = [];
  let nextId = 1;
  let rnd = (Date.now() >>> 0) || 1;
  const random = () => {
    rnd ^= rnd << 13;
    rnd ^= rnd >>> 17;
    rnd ^= rnd << 5;
    return (rnd >>> 0) / 4294967296;
  };
  const range = (a, b) => a + (b - a) * random();
  /** @type {any} */
  let hover = null;
  /** @type {any} */
  let gesture = null;
  /** @type {any} */
  let armed = null;
  let touchSelected = false;

  const S = () => DECOR_SCALE * host.scale;
  const live = () => items.filter((i) => i.dying == null);

  function makeItem(kind, fx, fy, zoom = 1, strand = null) {
    const id = nextId++;
    let s = (Math.imul(id, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
    const r = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    const swayDur = 11 + r() * 6;
    return {
      id,
      kind,
      fx,
      fy,
      zoom: kind === 'lights' ? 1 : zoom,
      strand: kind === 'lights' ? strand : null,
      phase: r() * 2,
      swayDur,
      swayOff: r(),
      born: null,
      dying: null,
      hoverT: 0,
      growT: 0,
      /** @type {any} */
      sprite: null,
      /** @type {any} */
      lit: null,
      /** @type {any} */
      mask: null,
    };
  }

  // geometry in CSS px ------------------------------------------------------------------------------------------------

  const z = (it) => it.zoom * S();
  const boxSize = (it) => {
    const [aw, ah] = artSize(it.kind, it.strand);
    return [aw + 2 * PAD, ah + 2 * PAD];
  };
  const outer = (it) => {
    const [bw, bh] = boxSize(it);
    return [bw * z(it), bh * z(it)];
  };
  const centre = (it) => [it.fx * host.W, it.fy * host.H];
  function frame(it) {
    const [cx, cy] = centre(it);
    const [w, h] = outer(it);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  const inFrame = (f, x, y) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;

  /** Remove button centre in viewport px (fp-decor render.rs button_center, Y flipped). */
  function buttonAt(it) {
    const [aw, ah] = artSize(it.kind, it.strand);
    const f = frame(it);
    const k = z(it);
    let bx;
    let by;
    if (it.kind === 'lights') {
      bx = f.w / 2;
      by = (PAD + ah - 2) * k;
    } else {
      bx = Math.min((PAD + aw - 2) * k, f.w - 10);
      by = Math.min((PAD + ah - 2) * k, f.h - 10);
    }
    return [f.x + bx, f.y + f.h - by];
  }

  /** Grips `[index, x, y]` in viewport px: lights 0/1/2 (left, right, middle), else 3 (resize corner). */
  function gripsOf(it) {
    const [aw, ah] = artSize(it.kind, it.strand);
    const f = frame(it);
    const p = z(it);
    const up = (x, y) => [f.x + x, f.y + f.h - y];
    if (it.kind === 'lights') {
      const gy = ah - 8;
      const len = (it.strand ?? LIGHTS).length;
      return [
        [0, ...up(16 * p, (PAD + gy + 1) * p)],
        [1, ...up((PAD + aw - 4) * p, (PAD + gy + 1) * p)],
        [2, ...up((PAD + len / 2) * p, (PAD + 38) * p)],
      ];
    }
    return [[3, ...up(Math.min((PAD + aw) * p, f.w - 7), Math.max(PAD * p, 7))]];
  }

  function onScreen(it) {
    const [cx, cy] = centre(it);
    if (cx >= 0 && cx <= host.W && cy >= 0 && cy <= host.H) return;
    const x = clamp(cx, SCREEN_INSET, Math.max(SCREEN_INSET, host.W - SCREEN_INSET));
    const y = clamp(cy, SCREEN_INSET, Math.max(SCREEN_INSET, host.H - SCREEN_INSET));
    it.fx = host.W ? x / host.W : 0.5;
    it.fy = host.H ? y / host.H : 0.5;
  }

  // hit test ----------------------------------------------------------------------------------------------------------

  function maskOf(it) {
    const key = it.kind === 'lights' ? `${(it.strand ?? LIGHTS).length}:${(it.strand ?? LIGHTS).dip}` : it.kind;
    if (it.mask?.key === key) return it.mask;
    const { c, g } = boxCanvas(it.kind, it.strand, 1);
    drawBase(g, it.kind, it.strand);
    for (const p of parts(it.kind)) if (p.solid) drawPart(g, p.art, it.strand);
    let data = null;
    try {
      data = g.getImageData(0, 0, c.width, c.height).data;
    } catch {
      data = null;
    }
    it.mask = { key, w: c.width, h: c.height, data };
    return it.mask;
  }

  function solid(it, x, y) {
    const f = frame(it);
    if (!inFrame(f, x, y)) return false;
    const m = maskOf(it);
    if (!m.data) return true;
    const k = z(it);
    const bx = Math.trunc((x - f.x) / k);
    const by = Math.trunc((y - f.y) / k);
    for (const dy of [-3, 0, 3]) {
      for (const dx of [-3, 0, 3]) {
        const sx = bx + dx;
        const sy = by + dy;
        if (sx >= 0 && sy >= 0 && sx < m.w && sy < m.h && m.data[(sy * m.w + sx) * 4 + 3] > 60) return true;
      }
    }
    return false;
  }

  function itemAt(x, y) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.dying != null) continue;
      if (it === hover ? inFrame(frame(it), x, y) : solid(it, x, y)) return it;
    }
    return null;
  }

  const onButton = (it, x, y) => {
    const [bx, by] = buttonAt(it);
    return Math.abs(x - bx) <= 13 && Math.abs(y - by) <= 13;
  };

  const gripAt = (it, x, y) => gripsOf(it).find(([, gx, gy]) => Math.abs(x - gx) < 14 && Math.abs(y - gy) < 16) ?? null;

  // persistence -------------------------------------------------------------------------------------------------------

  function save() {
    const r4 = (v) => Math.round(v * 10000) / 10000;
    const list = live().map((it) => {
      const e = { kind: it.kind, fx: r4(it.fx), fy: r4(it.fy) };
      if (it.kind === 'lights' && it.strand) Object.assign(e, { length: it.strand.length, dip: it.strand.dip });
      if (it.zoom !== 1) e.size = r4(it.zoom);
      return e;
    });
    host.save('decor', list.length ? list : null);
  }

  function load() {
    const raw = host.load('decor', null);
    if (!Array.isArray(raw)) return;
    for (const e of raw.slice(0, host.config.maxPlaced)) {
      if (!e || !KIND_IDS.includes(e.kind)) continue;
      const fx = Number(e.fx);
      const fy = Number(e.fy);
      if (!Number.isFinite(fx) || !Number.isFinite(fy)) continue;
      const lights = e.kind === 'lights';
      const strand = lights && e.length != null ? fitted({ length: Number(e.length), dip: e.dip == null ? 18 : Number(e.dip) }) : null;
      const zoom = lights ? 1 : clamp(Number(e.size) || 1, ZOOM_MIN, ZOOM_MAX);
      const it = makeItem(e.kind, clamp(fx, 0, 1), clamp(fy, 0, 1), zoom, strand);
      items.push(it);
    }
  }

  // add / remove ------------------------------------------------------------------------------------------------------

  function overlap(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w <= 0 || h <= 0 ? 0 : w * h;
  }

  function add(kind) {
    if (!KIND_IDS.includes(kind)) return null;
    if (live().length >= host.config.maxPlaced) {
      host.emit('decor-full', { max: host.config.maxPlaced });
      return null;
    }
    const W = host.W;
    const H = host.H;
    const it = makeItem(kind, 0.5, 0.5);
    const [w, h] = outer(it);
    const existing = live().map(frame);
    let best = null;
    for (let i = 0; i < 40; i++) {
      const cx = clamp(W / 2 + range(-0.3, 0.3) * W, w / 2 + 16, Math.max(w / 2 + 16, W - w / 2 - 16));
      const cy =
        kind === 'lights'
          ? clamp(range(0.1, 0.3) * H, h / 2 + 4, Math.max(h / 2 + 4, H - h / 2 - 4))
          : clamp(H / 2 + range(-0.25, 0.25) * H, h / 2 + 16, Math.max(h / 2 + 16, H - h / 2 - 16));
      const r = { x: cx - w / 2, y: cy - h / 2, w, h };
      const cost = existing.reduce((a, o) => a + overlap(r, o), 0) + 0.5 * Math.hypot(cx - W / 2, cy - H / 2);
      if (!best || cost < best.cost) best = { cx, cy, cost };
    }
    it.fx = W ? best.cx / W : 0.5;
    it.fy = H ? best.cy / H : 0.5;
    it.born = 0;
    items.push(it);
    save();
    return it.id;
  }

  function remove(it) {
    if (!it || it.dying != null) return;
    it.dying = 0;
    it.born = null;
    if (hover === it) hover = null;
    if (armed === it) armed = null;
    if (gesture?.it === it) gesture = null;
    save();
  }

  // sprites -----------------------------------------------------------------------------------------------------------

  function spriteKey(it) {
    return `${it.zoom}:${it.strand ? it.strand.length + ',' + it.strand.dip : ''}:${S()}:${host.dpr}`;
  }

  function ensure(it) {
    const key = spriteKey(it);
    if (it.sprite?.key === key) return;
    // a resize drag redraws at the end (the old sprite scales meanwhile)
    if (it.sprite && gesture?.it === it && gesture.type === 'resize') return;
    const ratio = Math.max(z(it) * host.dpr, 0.05);
    const art = boxCanvas(it.kind, it.strand, ratio);
    drawBase(art.g, it.kind, it.strand);
    const out = document.createElement('canvas');
    out.width = art.c.width;
    out.height = art.c.height;
    const o = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
    o.shadowColor = 'rgba(0,0,13,0.38)';
    o.shadowBlur = 5 * ratio;
    o.shadowOffsetY = 2 * ratio;
    o.drawImage(art.c, 0, 0);
    it.sprite = { key, c: out };
    it.lit = null;
    if (it.kind === 'lights') {
      it.lit = [0, 1].map((group) => {
        const l = boxCanvas(it.kind, it.strand, ratio);
        drawLit(l.g, it.strand ?? LIGHTS, group);
        return l.c;
      });
    }
  }

  function drawItem(g, it, now) {
    ensure(it);
    const [cx, cy] = centre(it);
    const [aw, ah] = artSize(it.kind, it.strand);
    const [bw, bh] = boxSize(it);
    const angle = swayAngle(it.kind);
    let sw = 0;
    if (angle > 0) {
      const q = Math.floor(now * SWAY_FPS) / SWAY_FPS;
      sw = sway(angle, wrap(q + it.swayOff * it.swayDur, it.swayDur));
    }
    const pop = it.dying != null ? popOut(it.dying) : it.born != null ? popIn(it.born) : 1;
    const grow = 1 + 0.04 * it.growT;
    const k = z(it) * grow * pop;
    if (k <= 0.01) return;
    const [px, py] = pivot(it.kind, it.strand);
    g.save();
    if (it.dying != null) g.globalAlpha = clamp(1 - it.dying / POP_OUT_SECS, 0, 1);
    g.translate(cx, cy);
    g.scale(k, -k);
    g.translate(-aw / 2, -ah / 2);
    // now in Y-up art units
    g.translate(px, py);
    if (sw) g.rotate(sw);
    g.translate(-px, -py);
    const list = parts(it.kind);
    const base = g.globalAlpha;
    const part = (p) => {
      const st = partState(p.motion, p.value, now, it.phase);
      if (st.opacity <= 0.01) return;
      g.save();
      g.globalAlpha = base * st.opacity;
      if (p.art === 'lit0' || p.art === 'lit1') {
        g.translate(-PAD, ah + PAD);
        g.scale(1, -1);
        g.drawImage(it.lit[p.art === 'lit0' ? 0 : 1], 0, 0, bw, bh);
      } else {
        g.translate(p.anchor[0], p.anchor[1] + st.ty);
        if (st.rot) g.rotate(st.rot);
        g.scale(st.sx, st.sy);
        g.translate(-p.anchor[0], -p.anchor[1]);
        drawPart(g, p.art, it.strand);
      }
      g.restore();
    };
    for (const p of list) if (p.behind) part(p);
    g.save();
    g.translate(-PAD, ah + PAD);
    g.scale(1, -1);
    g.drawImage(it.sprite.c, 0, 0, bw, bh);
    g.restore();
    for (const p of list) if (!p.behind) part(p);
    g.restore();

    if (it.hoverT > 0 && it.dying == null) {
      g.save();
      g.globalAlpha = Math.min(it.hoverT, 1);
      const [bx, by] = buttonAt(it);
      g.beginPath();
      g.arc(bx, by, 9, 0, Math.PI * 2);
      g.fillStyle = 'rgba(26,26,36,0.82)';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.stroke();
      g.beginPath();
      g.moveTo(bx - 3, by - 3);
      g.lineTo(bx + 3, by + 3);
      g.moveTo(bx - 3, by + 3);
      g.lineTo(bx + 3, by - 3);
      g.lineWidth = 1.8;
      g.lineCap = 'round';
      g.strokeStyle = '#fff';
      g.stroke();
      for (const [, gx, gy] of gripsOf(it)) {
        g.beginPath();
        g.arc(gx, gy, 6, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = 'rgb(26,61,36)';
        g.stroke();
      }
      g.restore();
    }
  }

  // layer ---------------------------------------------------------------------------------------------------------------

  load();

  return {
    name: 'decor',
    z: 65,

    step(dt) {
      for (const it of items) {
        if (it.born != null) it.born = it.born + dt < POP_IN_SECS ? it.born + dt : null;
        if (it.dying != null) it.dying += dt;
      }
      items = items.filter((i) => i.dying == null || i.dying < POP_OUT_SECS);
      const fade = dt / HOVER_SECS;
      for (const it of items) {
        const on = it === hover || gesture?.it === it || armed === it;
        it.hoverT = on ? Math.min(it.hoverT + fade, 1) : Math.max(it.hoverT - fade, 0);
        const resizing = gesture?.it === it && gesture.type === 'resize';
        it.growT = resizing ? 0 : on && it.kind !== 'lights' ? Math.min(it.growT + fade, 1) : Math.max(it.growT - fade, 0);
      }
    },

    draw(g) {
      const now = host.t;
      for (const it of items) {
        const f = frame(it);
        if (f.x > host.W || f.y > host.H || f.x + f.w < 0 || f.y + f.h < 0) continue;
        drawItem(g, it, now);
      }
    },

    resize() {
      for (const it of items) it.sprite = null;
    },

    hover(p) {
      if (gesture || armed) return null;
      const it = itemAt(p.x, p.y);
      hover = it;
      if (!it) return null;
      if (onButton(it, p.x, p.y)) return 'pointer';
      const grip = gripAt(it, p.x, p.y);
      if (grip) return grip[0] === 3 ? 'nwse-resize' : grip[0] === 2 ? 'ns-resize' : 'ew-resize';
      return 'grab';
    },

    pointerDown(p) {
      const it = itemAt(p.x, p.y);
      if (!it) {
        if (touchSelected) {
          hover = null;
          touchSelected = false;
        }
        return false;
      }
      // Touch has no hover: the first tap selects (shows the chrome), the next ones act on it.
      if (p.touch && hover !== it) {
        hover = it;
        touchSelected = true;
        gesture = { type: 'move', it, sx: p.x, sy: p.y, fx: it.fx, fy: it.fy, moved: false };
        items = items.filter((o) => o !== it);
        items.push(it);
        return true;
      }
      hover = it;
      if (onButton(it, p.x, p.y)) {
        armed = it;
        return true;
      }
      items = items.filter((o) => o !== it);
      items.push(it);
      const grip = gripAt(it, p.x, p.y);
      const f = frame(it);
      if (grip && grip[0] === 3) {
        gesture = { type: 'resize', it, sx: p.x, sy: p.y, zoom0: it.zoom, left: f.x, top: f.y };
      } else if (grip) {
        const s0 = it.strand ?? { ...LIGHTS };
        gesture = { type: 'stretch', it, grip: grip[0], sx: p.x, sy: p.y, s0, last: s0, left: f.x, right: f.x + f.w, top: f.y };
      } else {
        gesture = { type: 'move', it, sx: p.x, sy: p.y, fx: it.fx, fy: it.fy, moved: false };
      }
      return true;
    },

    pointerMove(p) {
      if (!gesture) return;
      const it = gesture.it;
      const W = host.W || 1;
      const H = host.H || 1;
      const dx = p.x - gesture.sx;
      const dy = p.y - gesture.sy;
      if (gesture.type === 'move') {
        if (gesture.moved || Math.hypot(dx, dy) > 2) {
          gesture.moved = true;
          it.fx = gesture.fx + dx / W;
          it.fy = gesture.fy + dy / H;
        }
      } else if (gesture.type === 'resize') {
        const [bw, bh] = boxSize(it);
        const k = S();
        const zoom = clamp(gesture.zoom0 * (1 + (dx + dy) / ((bw + bh) * k)), ZOOM_MIN, ZOOM_MAX);
        if (Math.abs(zoom - it.zoom) > 0.004) {
          it.zoom = zoom;
          const [w, h] = outer(it);
          it.fx = (gesture.left + w / 2) / W;
          it.fy = (gesture.top + h / 2) / H;
        }
      } else {
        const k = S();
        const next = { ...gesture.s0 };
        if (gesture.grip === 0) next.length -= dx / k;
        else if (gesture.grip === 1) next.length += dx / k;
        else next.dip += dy / k;
        next.length = Math.round(clamp(next.length, 110, 4000));
        next.dip = Math.round(clamp(next.dip, 0, 260));
        const last = gesture.last;
        const change = Math.max(Math.abs(next.length - last.length), Math.abs(next.dip - last.dip));
        if (change >= 2 || (change > 0 && (next.dip === 0 || next.length === 110))) {
          it.strand = next;
          gesture.last = next;
          const [w, h] = outer(it);
          const x = gesture.grip === 0 ? gesture.right - w : gesture.left;
          it.fx = (x + w / 2) / W;
          it.fy = (gesture.top + h / 2) / H;
        }
      }
    },

    pointerUp(p) {
      if (armed) {
        const it = armed;
        armed = null;
        if (onButton(it, p.x, p.y)) remove(it);
        return;
      }
      const g = gesture;
      gesture = null;
      if (!g) return;
      if (g.type === 'move' && g.moved) {
        onScreen(g.it);
        save();
      } else if (g.type === 'resize' && g.it.zoom !== g.zoom0) {
        g.it.sprite = null;
        save();
      } else if (g.type === 'stretch') {
        save();
      }
      if (!p.touch) hover = itemAt(p.x, p.y);
    },

    busy() {
      return !!gesture || !!armed || items.some((i) => i.born != null || i.dying != null || (i.hoverT > 0 && i.hoverT < 1));
    },

    command(cmd) {
      if (!cmd || typeof cmd !== 'object') return;
      if (cmd.type === 'add-decor') add(cmd.kind);
      else if (cmd.type === 'clear') {
        for (const it of live()) {
          it.dying = 0;
          it.born = null;
        }
        hover = null;
        armed = null;
        gesture = null;
        save();
      } else if (cmd.type === 'remove-decor') {
        remove(items.find((i) => i.id === cmd.id));
      }
    },

    destroy() {
      items = [];
      hover = null;
      gesture = null;
      armed = null;
    },

    /** Placed decorations (viewport px). */
    items() {
      return live().map((it) => {
        const [x, y] = centre(it);
        return { id: it.id, kind: it.kind, x, y };
      });
    },

    count() {
      return live().length;
    },
  };
}
