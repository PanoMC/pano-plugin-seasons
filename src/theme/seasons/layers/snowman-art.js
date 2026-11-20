// Snowman looks and art: a port of Frostpane's fp-snowman (look model F3, dress-up card chips F4, item art F5).
// Everything is drawn in Y-up units of the ball radius, relative to the ball centre, like the Rust code; the public
// helpers set up that frame. Decorated balls are drawn once into sprites (they rarely change), plain balls use a
// cached sphere sprite plus a few specks that turn as the ball rolls.

import { offscreen } from './snow-art.js';

const TAU = Math.PI * 2;
const PI = Math.PI;

// ---- look model ------------------------------------------------------------------------------------------------------

export const HATS = ['topHat', 'bobble', 'crown', 'cowboy', 'party', 'earmuffs', 'viking', 'santa'];
export const FACES = ['classic', 'happy', 'wink', 'cool', 'surprised', 'sleepy', 'grumpy', 'love'];
export const ARMS = ['sticks', 'waving', 'mittens', 'broom', 'candyCane', 'cocoa', 'gift', 'flowers'];
export const OUTFITS = ['scarf', 'stripedScarf', 'bowTie', 'tie', 'sweater', 'puffer', 'tuxedo', 'goldChain'];
const NECK = new Set(['scarf', 'stripedScarf', 'bowTie', 'tie']);

/** English names (the dress-up card's fallback texts). */
export const ITEM_NAMES = {
  hat: ['Top hat', 'Bobble hat', 'Crown', 'Cowboy hat', 'Party hat', 'Earmuffs', 'Viking helmet', 'Santa hat'],
  face: ['Classic', 'Happy', 'Wink', 'Cool', 'Surprised', 'Sleepy', 'Grumpy', 'In love'],
  arms: ['Sticks', 'Waving', 'Mittens', 'Broom', 'Candy cane', 'Hot cocoa', 'Gift', 'Flowers'],
  outfit: ['Scarf', 'Striped scarf', 'Bow tie', 'Tie', 'Sweater', 'Puffer jacket', 'Tuxedo', 'Gold chain'],
};

/** Card tabs in UI order: [tab id, item list, look field]. */
export const TABS = /** @type {const} */ ([
  ['hat', HATS, 'hat'],
  ['face', FACES, 'face'],
  ['arms', ARMS, 'arms'],
  ['outfit', OUTFITS, 'outfit'],
]);

/**
 * @typedef {{hat: string|null, face: string, arms: string, outfit: string|null}} Look
 */

/** @returns {Look} */
export function classicLook() {
  // Every new snowman wears the red Santa hat.
  return { hat: 'santa', face: 'classic', arms: 'sticks', outfit: 'scarf' };
}

/** @param {Look} l */
export function isClassic(l) {
  return l.hat === 'santa' && l.face === 'classic' && l.arms === 'sticks' && l.outfit === 'scarf';
}

/**
 * Lenient read of a stored look (Frostpane's look JSON): unknown ids fall back to the slot default, `bare` wins.
 *
 * @param {any} v
 * @returns {Look}
 */
export function readLook(v) {
  if (!v || typeof v !== 'object') return classicLook();
  const pick = (list, id, def) => (list.includes(id) ? id : def);
  return {
    hat: v.hat === 'none' ? null : pick(HATS, v.hat, 'santa'),
    face: pick(FACES, v.face, 'classic'),
    arms: pick(ARMS, v.arms, 'sticks'),
    outfit: v.bare === true ? null : pick(OUTFITS, v.outfit, 'scarf'),
  };
}

/** Look JSON: `hat: "none"` when bare-headed, `bare: true` when there is no outfit; `null` for the classic look. @param {Look} l */
export function writeLook(l) {
  if (isClassic(l)) return null;
  /** @type {any} */
  const o = {};
  o.hat = l.hat ?? 'none';
  o.face = l.face;
  o.arms = l.arms;
  if (l.outfit) o.outfit = l.outfit;
  else o.bare = true;
  return o;
}

/** @param {Look} l */
export function lookKey(l) {
  return `${l.hat ?? '-'}/${l.face}/${l.arms}/${l.outfit ?? '-'}`;
}

/**
 * A chip click with Frostpane's toggle rules: hat and outfit toggle off when picked again; face and arms only replace.
 *
 * @param {Look} look
 * @param {string} tab
 * @param {number} index
 * @returns {Look}
 */
export function applyChip(look, tab, index) {
  const l = { ...look };
  if (tab === 'hat') l.hat = l.hat === HATS[index] ? null : HATS[index];
  else if (tab === 'face') l.face = FACES[index] ?? l.face;
  else if (tab === 'arms') l.arms = ARMS[index] ?? l.arms;
  else if (tab === 'outfit') l.outfit = l.outfit === OUTFITS[index] ? null : OUTFITS[index];
  return l;
}

/** @param {Look} look @param {string} tab */
export function selectedChip(look, tab) {
  if (tab === 'hat') return HATS.indexOf(/** @type {string} */ (look.hat));
  if (tab === 'face') return FACES.indexOf(look.face);
  if (tab === 'arms') return ARMS.indexOf(look.arms);
  return OUTFITS.indexOf(/** @type {string} */ (look.outfit));
}

// ---- drawing primitives (Y-up unit space) ----------------------------------------------------------------------------

/** @param {number} h @param {number} [a] */
function c(h, a = 1) {
  return `rgba(${(h >> 16) & 255},${(h >> 8) & 255},${h & 255},${a})`;
}

/** Stroke width in ball units for a width of `max(min, k * r)` px. */
function sw(r, min, k) {
  return Math.max(min, k * r) / r;
}

/** @typedef {CanvasRenderingContext2D} G */

/** Path tracer: same argument order as Frostpane's `Trace` (end point first, then controls). @param {G} g */
function tracer(g) {
  const t = {
    m(x, y) {
      g.moveTo(x, y);
      return t;
    },
    l(x, y) {
      g.lineTo(x, y);
      return t;
    },
    q(x, y, cx, cy) {
      g.quadraticCurveTo(cx, cy, x, y);
      return t;
    },
    c(x, y, c1x, c1y, c2x, c2y) {
      g.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
      return t;
    },
    lines(pts) {
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      return t;
    },
    arc(cx, cy, r, a0, a1) {
      g.arc(cx, cy, r, a0, a1, a1 < a0);
      return t;
    },
    z() {
      g.closePath();
      return t;
    },
  };
  return t;
}

/** @param {G} g @param {(t: ReturnType<typeof tracer>) => void} build @param {string} col */
function fillPath(g, build, col) {
  g.beginPath();
  build(tracer(g));
  g.fillStyle = col;
  g.fill();
}

/** @param {G} g @param {(t: ReturnType<typeof tracer>) => void} build @param {string} col @param {number} w */
function strokePath(g, build, col, w) {
  g.beginPath();
  build(tracer(g));
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

/** Draw `fn` clipped to the path. @param {G} g */
function inside(g, build, fn) {
  g.save();
  g.beginPath();
  build(tracer(g));
  g.clip();
  fn();
  g.restore();
}

/** @param {G} g */
function at(g, x, y, turn, scale, fn) {
  g.save();
  g.translate(x, y);
  if (turn) g.rotate(turn);
  if (scale !== 1) g.scale(scale, scale);
  fn();
  g.restore();
}

/** @param {G} g */
function circle(g, x, y, r, col) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = col;
  g.fill();
}

/** Bounding-box ellipse. @param {G} g */
function ellipse(g, x, y, w, h, col) {
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, TAU);
  g.fillStyle = col;
  g.fill();
}

/** Bounding-box ellipse outline. @param {G} g */
function ring(g, x, y, w, h, col, lw) {
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, TAU);
  g.strokeStyle = col;
  g.lineWidth = lw;
  g.stroke();
}

/** Rounded rectangle; the radius is clamped to half the short side. @param {G} g */
function rect(g, x, y, w, h, rad, col) {
  g.beginPath();
  const r = Math.min(rad, Math.abs(w) / 2, Math.abs(h) / 2);
  if (r > 0 && g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
  g.fillStyle = col;
  g.fill();
}

/** @param {G} g */
function polyline(g, pts, col, w) {
  strokePath(g, (t) => t.lines(pts), col, w);
}

/** @param {G} g */
function line(g, x0, y0, x1, y1, col, w) {
  polyline(
    g,
    [
      [x0, y0],
      [x1, y1],
    ],
    col,
    w,
  );
}

/** @param {G} g */
function polygon(g, pts, col) {
  fillPath(g, (t) => t.lines(pts).z(), col);
}

/** Flat-capped dashes along a polyline. @param {G} g */
function dash(g, pts, on, off, col, w) {
  g.save();
  g.setLineDash([on, off]);
  g.beginPath();
  tracer(g).lines(pts);
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = 'butt';
  g.lineJoin = 'round';
  g.stroke();
  g.restore();
}

function cubicPoints(p, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    out.push([k[0] * p[0][0] + k[1] * p[1][0] + k[2] * p[2][0] + k[3] * p[3][0], k[0] * p[0][1] + k[1] * p[1][1] + k[2] * p[2][1] + k[3] * p[3][1]]);
  }
  return out;
}

function arcPoints(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** @param {G} g */
function heart(g, x, y, size, col) {
  const k = (a, b) => [x + a * size, y + b * size];
  fillPath(
    g,
    (t) => {
      const tip = k(0, -0.5);
      t.m(tip[0], tip[1]);
      const steps = [
        [k(-0.5, 0.15), k(-0.2, -0.25), k(-0.5, -0.1)],
        [k(0, 0.2), k(-0.5, 0.55), k(-0.1, 0.58)],
        [k(0.5, 0.15), k(0.1, 0.58), k(0.5, 0.55)],
        [tip, k(0.5, -0.1), k(0.2, -0.25)],
      ];
      for (const [e, c1, c2] of steps) t.c(e[0], e[1], c1[0], c1[1], c2[0], c2[1]);
      t.z();
    },
    col,
  );
}

/** Small seeded generator for the specks (stable per ball). */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the snow ball ---------------------------------------------------------------------------------------------------

/** Sphere shading + rim (unit space). @param {G} g */
function sphere(g, r) {
  const rr = (r - 0.5) / r;
  const grad = g.createRadialGradient(-0.3, 0.35, 0, 0, 0, 1.05);
  grad.addColorStop(0, c(0xffffff));
  grad.addColorStop(0.4, c(0xf5f9ff));
  grad.addColorStop(0.82, c(0xd6e0f2));
  grad.addColorStop(1, c(0xb8c7e3));
  g.beginPath();
  g.arc(0, 0, rr, 0, TAU);
  g.fillStyle = grad;
  g.fill();
  const lin = g.createLinearGradient(0, -1, 0, 0);
  lin.addColorStop(0, c(0x8094b8, 0.28));
  lin.addColorStop(1, c(0x8094b8, 0));
  g.fillStyle = lin;
  g.fill();
  const rim = (r - 0.8) / r;
  ring(g, -rim, -rim, rim * 2, rim * 2, c(0x7387a8, 0.35), 1 / r);
}

/** Snow sphere with shading, rim and specks. @param {G} g */
function snowBall(g, r, angle, seed) {
  sphere(g, r);
  const next = rng(seed);
  const count = 8 + Math.floor(r / 5);
  inside(
    g,
    (t) => t.arc(0, 0, (r - 1) / r, 0, TAU),
    () =>
      at(g, 0, 0, angle, 1, () => {
        for (let i = 0; i < count; i++) {
          const a = next() * TAU;
          const d = Math.sqrt(next()) * 0.8;
          const size = 0.07 + next() * 0.11;
          const alpha = 0.1 + next() * 0.12;
          const col = i % 3 === 0 ? c(0xffffff, 0.7) : c(0x99aecc, alpha);
          ellipse(g, d * Math.cos(a) - size, d * Math.sin(a) - size * 0.8, size * 2, size * 1.6, col);
        }
      }),
  );
}

const COAL = c(0x212129);
const EYE_L = [-0.3, 0.22];
const EYE_R = [0.16, 0.25];

function smile(g) {
  for (let i = 0; i < 5; i++) {
    const a = -2.35 + (i / 4) * 1.6;
    circle(g, Math.cos(a) * 0.45 - 0.05, Math.sin(a) * 0.42 + 0.02, 0.045, COAL);
  }
}

function frown(g) {
  for (let i = 0; i < 5; i++) {
    const a = 0.75 + (i / 4) * 1.6;
    circle(g, Math.cos(a) * 0.45 - 0.05, -0.62 + Math.sin(a) * 0.3, 0.045, COAL);
  }
}

function cheeks(g) {
  ellipse(g, -0.66, -0.16, 0.28, 0.18, c(0xff738c, 0.45));
  ellipse(g, 0.34, -0.12, 0.26, 0.17, c(0xff738c, 0.45));
}

/** Brow arc around (x, y): `up` is a bump, otherwise a bowl. */
function brow(g, x, y, rad, up, w) {
  const [a0, a1] = up ? [0.2, PI - 0.2] : [PI + 0.2, TAU - 0.2];
  polyline(g, arcPoints(x, y, rad, a0, a1, 12), COAL, w);
}

function eye(g, [x, y], rad, w) {
  circle(g, x, y, rad, COAL);
}

function face(g, r, kind) {
  const thin = sw(r, 1, 0.065);
  switch (kind) {
    case 'happy': {
      brow(g, EYE_L[0], EYE_L[1] - 0.04, 0.1, true, thin);
      brow(g, EYE_R[0], EYE_R[1] - 0.04, 0.1, true, thin);
      cheeks(g);
      const mouth = (t) => t.m(-0.42, -0.2).c(0.24, -0.2, -0.36, -0.62, 0.18, -0.62).z();
      fillPath(g, mouth, COAL);
      inside(g, mouth, () => ellipse(g, -0.2, -0.47, 0.24, 0.11, c(0xf26b73)));
      break;
    }
    case 'wink': {
      eye(g, EYE_L, 0.085, thin);
      const [rx, ry] = EYE_R;
      polyline(
        g,
        [
          [rx - 0.11, ry + 0.06],
          [rx + 0.04, ry],
          [rx - 0.11, ry - 0.06],
        ],
        COAL,
        thin,
      );
      smile(g);
      cheeks(g);
      break;
    }
    case 'cool': {
      const lens = c(0x14141c);
      for (const [ex, ey] of [EYE_L, EYE_R]) rect(g, ex - 0.19, ey - 0.13, 0.38, 0.25, 0.08, lens);
      const fw = sw(r, 1, 0.05);
      line(g, EYE_L[0] + 0.18, EYE_L[1] + 0.06, EYE_R[0] - 0.18, EYE_R[1] + 0.06, lens, fw);
      line(g, EYE_L[0] - 0.18, EYE_L[1] + 0.06, -0.82, 0.32, lens, fw);
      for (const [ex, ey] of [EYE_L, EYE_R]) line(g, ex - 0.11, ey + 0.05, ex - 0.03, ey - 0.04, c(0xffffff, 0.55), sw(r, 0.6, 0.03));
      strokePath(g, (t) => t.m(-0.36, -0.3).q(0.18, -0.2, -0.05, -0.42), COAL, sw(r, 1, 0.06));
      break;
    }
    case 'surprised': {
      for (const [ex, ey] of [EYE_L, EYE_R]) {
        eye(g, [ex, ey], 0.11, thin);
        circle(g, ex + 0.035, ey + 0.04, 0.035, c(0xffffff));
        brow(g, ex, ey + 0.08, 0.17, true, sw(r, 1, 0.045));
      }
      ring(g, -0.2, -0.5, 0.2, 0.26, COAL, sw(r, 1.2, 0.07));
      break;
    }
    case 'sleepy': {
      brow(g, EYE_L[0], EYE_L[1] + 0.03, 0.1, false, thin);
      brow(g, EYE_R[0], EYE_R[1] + 0.03, 0.1, false, thin);
      strokePath(g, (t) => t.m(-0.2, -0.34).q(0.02, -0.34, -0.09, -0.4), COAL, sw(r, 1, 0.055));
      for (const [x, y, z] of [
        [0.5, 0.62, 0.16],
        [0.78, 0.9, 0.22],
      ]) {
        polyline(
          g,
          [
            [x, y + z],
            [x + z, y + z],
            [x, y],
            [x + z, y],
          ],
          c(0x5980d9),
          sw(r, 1, 0.05),
        );
      }
      break;
    }
    case 'grumpy': {
      eye(g, EYE_L, 0.085, thin);
      eye(g, EYE_R, 0.085, thin);
      const w = sw(r, 1, 0.07);
      line(g, EYE_L[0] - 0.15, EYE_L[1] + 0.24, EYE_L[0] + 0.12, EYE_L[1] + 0.12, COAL, w);
      line(g, EYE_R[0] + 0.15, EYE_R[1] + 0.24, EYE_R[0] - 0.12, EYE_R[1] + 0.12, COAL, w);
      frown(g);
      break;
    }
    case 'love': {
      for (const [ex, ey] of [EYE_L, EYE_R]) heart(g, ex, ey - 0.02, 0.22, c(0xe61f40));
      smile(g);
      cheeks(g);
      break;
    }
    default:
      eye(g, EYE_L, 0.085, thin);
      eye(g, EYE_R, 0.085, thin);
      smile(g);
  }
  // Carrot nose, always last.
  polygon(
    g,
    [
      [-0.02, 0.07],
      [0.82, -0.08],
      [-0.02, -0.1],
    ],
    c(0xf5801f),
  );
  for (let i = 1; i <= 2; i++) line(g, 0.2 * i, 0.05 - 0.03 * i, 0.2 * i - 0.03, -0.02 - 0.02 * i, c(0xb8540f, 0.8), sw(r, 0.8, 0.025));
}

function hat(g, r, kind) {
  switch (kind) {
    case 'topHat': {
      const ink = c(0x1a1a21);
      rect(g, -0.5, 0.8, 1, 0.92, 0, ink);
      ellipse(g, -0.5, 1.64, 1, 0.16, ink);
      ellipse(g, -0.82, 0.66, 1.64, 0.26, ink);
      rect(g, -0.5, 0.9, 1, 0.16, 0, c(0xd62933));
      rect(g, -0.4, 1.1, 0.1, 0.56, 0, c(0xffffff, 0.14));
      break;
    }
    case 'bobble': {
      const dome = (t) => t.m(-0.9, 0.55).c(0.9, 0.55, -0.92, 1.62, 0.92, 1.62).z();
      fillPath(g, dome, c(0x3373db));
      inside(g, dome, () => {
        rect(g, -1, 0.92, 2, 0.12, 0, c(0xffffff));
        for (let i = 0; i < 6; i++) circle(g, -0.62 + i * 0.25, 1.16, 0.045, c(0xf24c59));
      });
      rect(g, -0.96, 0.42, 1.92, 0.28, 0.12, c(0x2457b2));
      for (let i = 0; i < 9; i++) {
        const x = -0.8 + i * 0.2;
        line(g, x, 0.46, x, 0.66, c(0xffffff, 0.25), sw(r, 0.6, 0.03));
      }
      circle(g, 0, 1.42, 0.22, c(0xffffff));
      break;
    }
    case 'santa': {
      fillPath(g, (t) => t.m(-0.84, 0.62).c(1.0, 1.14, -0.6, 1.72, 0.5, 1.78).c(0.84, 0.62, 0.76, 1.3, 0.8, 1.0).z(), c(0xd62933));
      rect(g, -0.96, 0.46, 1.92, 0.3, 0.15, c(0xffffff));
      circle(g, 1.02, 1.12, 0.2, c(0xffffff));
      break;
    }
    case 'crown': {
      const gold = c(0xfac233);
      polygon(
        g,
        [
          [-0.62, 0.72],
          [-0.66, 1.42],
          [-0.33, 1.08],
          [0, 1.52],
          [0.33, 1.08],
          [0.66, 1.42],
          [0.62, 0.72],
        ],
        gold,
      );
      rect(g, -0.63, 0.72, 1.26, 0.14, 0, c(0xd9941a));
      for (const [x, y] of [
        [-0.66, 1.44],
        [0, 1.54],
        [0.66, 1.44],
      ])
        circle(g, x, y, 0.07, c(0xd9941a));
      circle(g, 0, 0.98, 0.09, c(0xd62933));
      for (const x of [-0.36, 0.36]) circle(g, x, 0.95, 0.065, c(0x3373e6));
      break;
    }
    case 'cowboy': {
      fillPath(g, (t) => t.m(-0.52, 0.76).c(-0.08, 1.4, -0.6, 1.2, -0.4, 1.46).q(0.08, 1.4, 0, 1.3).c(0.52, 0.76, 0.4, 1.46, 0.6, 1.2).z(), c(0x996133));
      rect(g, -0.54, 0.8, 1.08, 0.14, 0, c(0x4c2b14));
      fillPath(g, (t) => t.m(-1.18, 0.98).c(1.18, 0.98, -0.7, 0.5, 0.7, 0.5).c(-1.18, 0.98, 0.7, 0.76, -0.7, 0.76).z(), c(0x855229));
      break;
    }
    case 'party':
      // Leans slightly back (left, away from the nose).
      at(g, 0.05, 0.82, 0.18, 1, () => {
        const cone = (t) =>
          t
            .lines([
              [-0.45, 0],
              [0, 0.9],
              [0.45, 0],
            ])
            .z();
        fillPath(g, cone, c(0x9e4ce0));
        inside(g, cone, () => {
          for (const [x, y] of [
            [-0.2, 0.15],
            [0.15, 0.3],
            [-0.05, 0.5],
            [0.2, 0.08],
            [0.02, 0.72],
          ])
            circle(g, x, y, 0.06, c(0xffd640));
        });
        circle(g, 0, 0.93, 0.13, c(0xff7399));
      });
      break;
    case 'earmuffs': {
      strokePath(g, (t) => t.arc(0, 0.28, 0.96, 0.08, 3.06), c(0x4c4c5c), sw(r, 1.5, 0.1));
      circle(g, -0.97, 0.26, 0.27, c(0xff8cb8));
      circle(g, 0.95, 0.32, 0.27, c(0xff8cb8));
      circle(g, -1.03, 0.34, 0.09, c(0xffffff, 0.35));
      circle(g, 0.89, 0.4, 0.09, c(0xffffff, 0.35));
      break;
    }
    case 'viking': {
      for (const sd of [-1, 1]) {
        fillPath(g, (t) => t.m(sd * 0.62, 0.92).c(sd * 1.32, 1.62, sd * 1.15, 0.92, sd * 1.3, 1.2).c(sd * 0.7, 1.18, sd * 1.1, 1.3, sd * 0.95, 1.18).z(), c(0xf5ebcc));
      }
      fillPath(g, (t) => t.m(-0.84, 0.66).c(0.84, 0.66, -0.86, 1.6, 0.86, 1.6).z(), c(0x9ea8b8));
      ellipse(g, -0.5, 1.05, 0.3, 0.25, c(0xffffff, 0.25));
      rect(g, -0.9, 0.56, 1.8, 0.22, 0.08, c(0x8c6133));
      for (let i = 0; i < 5; i++) circle(g, -0.64 + i * 0.32, 0.67, 0.045, c(0xd9bf73));
      break;
    }
  }
}

function scarf(g, r, main, stripe, thick, band, tail) {
  const px = 1 / r;
  inside(
    g,
    (t) => t.arc(0, 0, 1 + px, 0, TAU),
    () => {
      rect(g, -1 - 2 * px, -0.94, 2 + 4 * px, 0.3, 0, c(main));
      for (const y of band) rect(g, -1 - 2 * px, y, 2 + 4 * px, thick, 0, c(stripe));
    },
  );
  at(g, 0.32, -0.68, 0.16, 1, () => {
    rect(g, -0.13, -0.82, 0.26, 0.82, 0.05, c(main));
    for (const up of tail) rect(g, -0.13, -0.82 + up, 0.26, thick, 0, c(stripe));
    for (let k = 0; k < 4; k++) {
      const x = -0.13 + (0.26 * (k + 0.5)) / 4;
      line(g, x, -0.82 + px, x, -0.92, c(main), sw(r, 1, 0.04));
    }
  });
}

function neck(g, r, outfit) {
  if (outfit === 'scarf') scarf(g, r, 0xd62933, 0xfadbdb, sw(r, 1, 0.05), [-0.82], [0.2]);
  else if (outfit === 'stripedScarf') scarf(g, r, 0x1f8c52, 0xfafaff, sw(r, 0.6, 0.05), [-0.89, -0.8, -0.71], [0.2, 0.38, 0.56]);
  else if (outfit === 'bowTie') {
    for (const sd of [-1, 1]) fillPath(g, (t) => t.m(0, -0.93).l(sd * 0.36, -0.78).q(sd * 0.36, -1.1, sd * 0.42, -0.94).z(), c(0xd11a2e));
    for (const [x, y] of [
      [-0.22, -0.88],
      [-0.24, -1.0],
      [0.2, -0.86],
      [0.25, -0.99],
    ])
      circle(g, x, y, 0.035, c(0xffffff, 0.75));
    rect(g, -0.09, -1.02, 0.18, 0.18, 0.05, c(0x990d1f));
  } else {
    const blue = c(0x294cb8);
    polygon(
      g,
      [
        [-0.12, -0.86],
        [0.12, -0.86],
        [0.08, -1.04],
        [-0.08, -1.04],
      ],
      blue,
    );
    const blade = (t) =>
      t
        .lines([
          [-0.08, -1.04],
          [0.08, -1.04],
          [0.2, -1.72],
          [0, -1.88],
          [-0.2, -1.72],
        ])
        .z();
    fillPath(g, blade, blue);
    inside(g, blade, () => {
      for (let i = 0; i < 5; i++) {
        const y = -1.08 - 0.18 * i;
        line(g, -0.25, y, 0.25, y - 0.14, c(0xfac233), sw(r, 1, 0.06));
      }
    });
  }
}

function sweater(g, r) {
  rect(g, -1.1, -0.72, 2.2, 1.82, 0, c(0xc71f2b));
  rect(g, -1.1, -0.72, 2.2, 0.16, 0, c(0x990f1f));
  const w = sw(r, 1, 0.07);
  const zig = (base, peak) => Array.from({ length: 11 }, (_, i) => [-1 + 0.2 * i, i % 2 === 0 ? base : peak]);
  polyline(g, zig(0.3, 0.42), c(0xffffff), w);
  polyline(g, zig(-0.1, -0.22), c(0xffffff), w);
  for (let i = 0; i < 5; i++) circle(g, -0.8 + 0.4 * i, 0.1, 0.04, c(0xffffff));
  for (let i = 0; i < 4; i++) circle(g, -0.6 + 0.4 * i, -0.38, 0.05, c(0x339959));
}

function puffer(g, r) {
  rect(g, -1.1, -0.8, 2.2, 1.9, 0, c(0x298fdb));
  for (const y of [0.5, 0.12, -0.26, -0.62]) strokePath(g, (t) => t.m(-1.1, y).q(1.1, y, 0, y - 0.12), c(0x145c9e, 0.8), sw(r, 1, 0.045));
  line(g, 0.05, 0.9, 0.05, -0.8, c(0xd9e0eb), sw(r, 1, 0.05));
  rect(g, 0.02, 0.38, 0.12, 0.18, 0, c(0xd9e0eb));
}

function tuxedo(g, r) {
  rect(g, -1.1, -1.1, 2.2, 2.2, 0, c(0x1a1a21));
  polygon(
    g,
    [
      [-0.36, 1],
      [0.36, 1],
      [0, -0.3],
    ],
    c(0xffffff),
  );
  const lapel = sw(r, 1, 0.045);
  line(g, -0.44, 0.9, -0.04, -0.34, c(0x4c4c5c), lapel);
  line(g, 0.44, 0.9, 0.04, -0.34, c(0x4c4c5c), lapel);
  for (const y of [0.3, 0.06]) circle(g, 0, y, 0.045, COAL);
  circle(g, -0.52, 0.34, 0.09, c(0xd91a33));
  for (const sd of [-1, 1])
    polygon(
      g,
      [
        [0, 0.62],
        [sd * 0.26, 0.74],
        [sd * 0.26, 0.5],
      ],
      COAL,
    );
  circle(g, 0, 0.62, 0.06, COAL);
  for (const y of [-0.5, -0.74]) circle(g, -0.18, y, 0.05, COAL);
}

function goldChain(g, r) {
  const pts = cubicPoints(
    [
      [-0.5, 0.72],
      [-0.4, 0],
      [0.4, 0],
      [0.5, 0.72],
    ],
    48,
  );
  dash(g, pts, sw(r, 1.5, 0.07), sw(r, 0.8, 0.035), c(0xfac233), sw(r, 1.2, 0.07));
  circle(g, 0, 0.2, 0.17, c(0xfac233));
  circle(g, 0, 0.2, 0.1, c(0xd9941a));
  circle(g, -0.06, 0.27, 0.035, c(0xffffff, 0.6));
  for (const y of [-0.22, -0.54]) circle(g, 0, y, 0.075, COAL);
}

/** Jackets: cloth ones are clipped to the ball and shaded; the gold chain is neither. */
function jacket(g, r, outfit) {
  if (outfit === 'goldChain') {
    goldChain(g, r);
    return;
  }
  const body = (t) => t.arc(0, 0, (r - 0.5) / r, 0, TAU);
  inside(g, body, () => {
    if (outfit === 'sweater') sweater(g, r);
    else if (outfit === 'puffer') puffer(g, r);
    else tuxedo(g, r);
    const grad = g.createRadialGradient(-0.3, 0.35, 0, 0, 0, 1.05);
    grad.addColorStop(0, c(0xffffff, 0.22));
    grad.addColorStop(0.5, c(0xffffff, 0));
    grad.addColorStop(1, c(0x00001a, 0.32));
    g.fillStyle = grad;
    g.fillRect(-1.2, -1.2, 2.4, 2.4);
  });
}

function twig(g, r, from, to, fork) {
  const wood = c(0x6b4526);
  const w = sw(r, 1.5, 0.06);
  line(g, from[0], from[1], to[0], to[1], wood, w);
  const p = [from[0] + (to[0] - from[0]) * 0.72, from[1] + (to[1] - from[1]) * 0.72];
  line(g, p[0], p[1], p[0] + fork[0], p[1] + fork[1], wood, w);
}

/** Twig arms behind the body ball (waving raises the right one). */
function armsBack(g, r, arms) {
  twig(g, r, [-0.55, 0.1], [-1.6, 0.55], [-0.12, 0.3]);
  if (arms === 'waving') {
    twig(g, r, [0.55, 0.25], [1.28, 1.42], [0.28, 0.08]);
    const wood = c(0x6b4526);
    const w = sw(r, 1.5, 0.06);
    line(g, 1.28, 1.42, 1.14, 1.56, wood, w);
    line(g, 1.28, 1.42, 1.44, 1.5, wood, w);
  } else {
    twig(g, r, [0.55, 0.1], [1.6, 0.55], [0.12, 0.3]);
  }
}

function handItem(g, r, arms) {
  switch (arms) {
    case 'mittens':
      for (const sd of [-1, 1]) {
        const x = 1.58 * sd;
        ellipse(g, x - 0.16, 0.43, 0.32, 0.36, c(0xd62933));
        ellipse(g, sd > 0 ? x - 0.26 : x + 0.06, 0.53, 0.2, 0.16, c(0xd62933));
        rect(g, x - 0.17, 0.35, 0.34, 0.14, 0.05, c(0xffffff));
      }
      break;
    case 'broom':
      line(g, 1.55, 1.35, 1.55, -0.5, c(0xb8854c), sw(r, 1.5, 0.07));
      polygon(
        g,
        [
          [1.45, -0.5],
          [1.65, -0.5],
          [1.74, -1.05],
          [1.36, -1.05],
        ],
        c(0xebc25c),
      );
      for (let i = 0; i < 4; i++) line(g, 1.47 + i * 0.055, -0.6, 1.4 + i * 0.1, -1.02, c(0xb88c33, 0.8), sw(r, 0.6, 0.025));
      rect(g, 1.44, -0.6, 0.22, 0.1, 0, c(0xd62933));
      break;
    case 'candyCane': {
      const pts = [
        [1.6, -0.45],
        [1.6, 1.08],
        ...arcPoints(1.42, 1.08, 0.18, 0, PI, 16),
        [1.24, 0.95],
      ];
      const w = sw(r, 2, 0.13);
      polyline(g, pts, c(0xffffff), w);
      const d = sw(r, 1.5, 0.1);
      dash(g, pts, d, d, c(0xd62933), w);
      break;
    }
    case 'cocoa':
      for (const x of [1.42, 1.56]) strokePath(g, (t) => t.m(x, 0.84).c(x, 1.24, x + 0.08, 0.96, x - 0.08, 1.1), c(0xffffff, 0.75), sw(r, 0.8, 0.035));
      ring(g, 1.22, 0.5, 0.16, 0.2, c(0xd93340), sw(r, 1, 0.05));
      rect(g, 1.3, 0.4, 0.36, 0.4, 0.05, c(0xd93340));
      ellipse(g, 1.32, 0.74, 0.32, 0.1, c(0x6b3d1f));
      rect(g, 1.3, 0.52, 0.36, 0.06, 0, c(0xffffff));
      break;
    case 'gift':
      rect(g, 1.26, 0.38, 0.44, 0.42, 0, c(0x29995c));
      rect(g, 1.44, 0.38, 0.08, 0.42, 0, c(0xd62933));
      rect(g, 1.26, 0.55, 0.44, 0.08, 0, c(0xd62933));
      ring(g, 1.3, 0.8, 0.18, 0.14, c(0xd62933), sw(r, 1, 0.06));
      ring(g, 1.48, 0.8, 0.18, 0.14, c(0xd62933), sw(r, 1, 0.06));
      break;
    case 'flowers': {
      const heads = [
        [1.42, 1.02, 0xff73a6],
        [1.62, 0.94, 0xffd140],
        [1.52, 1.22, 0xe6334c],
      ];
      for (const [x, y] of heads) line(g, 1.58, 0.5, x, y, c(0x338c40), sw(r, 1, 0.04));
      for (const [x, y, tone] of heads) {
        for (let k = 0; k < 5; k++) {
          const a = (k * TAU) / 5;
          circle(g, x + 0.07 * Math.cos(a), y + 0.07 * Math.sin(a), 0.06, c(tone));
        }
        circle(g, x, y, 0.04, c(0xfff299));
      }
      polygon(
        g,
        [
          [1.42, 0.72],
          [1.74, 0.72],
          [1.6, 0.36],
        ],
        c(0xfad9e6),
      );
      break;
    }
  }
}

function headFront(g, r, look) {
  face(g, r, look.face);
  if (look.outfit && NECK.has(look.outfit)) neck(g, r, look.outfit);
  if (look.hat) hat(g, r, look.hat);
}

function bodyFront(g, r, look, hand) {
  if (look.outfit && !NECK.has(look.outfit)) jacket(g, r, look.outfit);
  else for (const y of [0.1, -0.22, -0.54]) circle(g, 0, y, 0.075, COAL);
  if (hand) handItem(g, r, look.arms);
}

/**
 * One ball in Y-up px space at the ball centre (`decor`: 'plain' | 'head' | 'body').
 *
 * @param {G} g
 * @param {number} r
 * @param {string} decor
 * @param {Look} look
 * @param {number} seed
 * @param {number} [angle]
 */
function drawBallUp(g, r, decor, look, seed, angle = 0) {
  r = Math.max(1, Math.min(256, r || 1));
  g.save();
  g.scale(r, r);
  if (decor === 'body') armsBack(g, r, look.arms);
  snowBall(g, r, decor === 'plain' ? angle : 0, seed);
  if (decor === 'head') headFront(g, r, look);
  else if (decor === 'body') bodyFront(g, r, look, true);
  g.restore();
}

/** Half the side of a ball sprite in CSS px (room for hats, arms and the tie). */
export function spriteHalf(r, decor) {
  return decor === 'plain' ? r + 2 : r * 2.05 + 2;
}

/**
 * A decorated ball drawn once into a sprite; draw it centred on the ball.
 *
 * @param {number} r
 * @param {string} decor
 * @param {Look} look
 * @param {number} seed
 * @param {number} dpr
 */
export function ballSprite(r, decor, look, seed, dpr) {
  const half = spriteHalf(r, decor);
  const cv = offscreen(half * 2 * dpr, half * 2 * dpr);
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  g.scale(dpr, dpr);
  g.translate(half, half);
  g.scale(1, -1);
  drawBallUp(g, r, decor, look, seed);
  return cv;
}

/**
 * The plain sphere (no specks) for rolling balls; the caller adds specks that turn.
 *
 * @param {number} r
 * @param {number} dpr
 */
export function sphereSprite(r, dpr) {
  const half = r + 2;
  const cv = offscreen(half * 2 * dpr, half * 2 * dpr);
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  g.scale(dpr, dpr);
  g.translate(half, half);
  g.scale(r, -r);
  sphere(g, r);
  return cv;
}

/** Chip icon side in CSS px. */
export const ICON = 44;

/**
 * Dress-up chip icon (44 x 44 px): the normal ball art framed per tab like Frostpane's card.
 *
 * @param {string} tab
 * @param {number} index
 * @param {number} dpr
 */
export function chipIcon(tab, index, dpr) {
  const base = { hat: null, face: 'classic', arms: 'sticks', outfit: null };
  /** @type {Look} */
  const look =
    tab === 'hat' ? { ...base, hat: HATS[index] } : tab === 'face' ? { ...base, face: FACES[index] } : tab === 'arms' ? { ...base, arms: ARMS[index] } : { ...base, outfit: OUTFITS[index] };
  const cv = offscreen(ICON * dpr, ICON * dpr);
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  g.scale(dpr, dpr);
  g.beginPath();
  g.rect(0, 0, ICON, ICON);
  g.clip();
  // Y-up box like the Rust card.
  g.translate(0, ICON);
  g.scale(1, -1);
  const put = (x, y, fn) => at(g, x, y, 0, 1, fn);
  if (tab === 'hat') put(22, -3, () => drawBallUp(g, 15, 'head', look, 7));
  else if (tab === 'face') put(19, 20, () => drawBallUp(g, 16, 'head', look, 7));
  else if (tab === 'arms') put(20, 17, () => drawBallUp(g, 11, 'body', look, 7));
  else {
    put(21, 12, () => {
      g.save();
      g.scale(15, 15);
      snowBall(g, 15, 0, 7);
      bodyFront(g, 15, look, false);
      g.restore();
    });
    put(21, 32.5, () => drawBallUp(g, 10, 'head', look, 9));
  }
  return cv;
}
