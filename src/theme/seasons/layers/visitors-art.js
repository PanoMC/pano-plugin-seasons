// Art of the visitors: Santa's team (reindeer + sleigh, after Frostpane's `fp-characters/art.rs`), the snowplough
// and the yeti (after the website's snow overlay). Every pose is drawn once into a small offscreen canvas, so a frame
// only copies bitmaps. All frames face right; the layer mirrors them.

const TAU = Math.PI * 2;

/** @param {number} w @param {number} h */
function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const ctx = (c) => /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));

// ---- Santa (Y-up, as in the Rust) ----------------------------------------------------------------------------------

/** Team space width and the height the frame needs above the runners. */
export const TEAM_W = 266;
export const TEAM_H = 104;
const HIPS = [13, 19, 33, 39];
const DEER_AT = [96, 152, 208];
const FUR = '#8c5c36';
const FUR_DARK = '#6b4529';

function at(g, x, y, turn, fn) {
  g.save();
  g.translate(x, y);
  if (turn) g.rotate(turn);
  fn();
  g.restore();
}

function rrect(g, x, y, w, h, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  g.fill();
}

function ellipseBox(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU);
  g.fill();
}

function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function path(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
}

function polygon(g, pts, color) {
  path(g, pts);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function polyline(g, pts, color, width) {
  path(g, pts);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

/** One reindeer in a 58 x 66 box, feet at the bottom. */
function deer(g, legs, bob, hat) {
  legs.forEach((angle, i) => {
    at(g, HIPS[i] + 2.25, 28, angle, () => {
      rrect(g, -2.25, -22, 4.5, 22, 2, i % 2 === 0 ? FUR_DARK : FUR);
      rrect(g, -2.25, -22, 4.5, 4, 1.5, '#291f1a');
    });
  });
  at(g, 0, bob, 0, () => {
    ellipseBox(g, 3, 26, 38, 20, FUR);
    ellipseBox(g, 9, 26, 26, 9, '#d1a878');
    circle(g, 4, 39, 3.5, '#ffffff');
    polygon(g, [[33, 38], [45, 34], [50, 54], [40, 54]], FUR);
    rrect(g, 34, 40, 13, 4, 2, '#cc2129');
    circle(g, 41, 40, 2.4, '#f2bd40');
    at(g, 41, 44, 0, () => {
      ellipseBox(g, -2, 6, 20, 13, FUR);
      circle(g, 17, 11, 3.2, '#cc2129');
      circle(g, 9, 14, 1.4, '#171c3d');
      polyline(g, [[3, 18], [1, 26], [-3, 30]], '#dbbf8f', 1.8);
      polyline(g, [[1, 24], [5, 28]], '#dbbf8f', 1.8);
      polyline(g, [[9, 18], [11, 26], [15, 30]], '#dbbf8f', 1.8);
      if (hat) {
        polygon(g, [[0, 17], [14, 17], [5, 30]], '#cc2129');
        rrect(g, -1, 15.5, 16, 3.5, 1.5, '#ffffff');
        circle(g, 5, 31, 2.6, '#ffffff');
      }
    });
  });
}

/** The sleigh with Santa (runner bottom at y = 0, nose to the right). */
function sleigh(g, arm) {
  polyline(g, [[2, 6], [76, 6], [88, 8], [94, 18]], '#f2bd40', 2.6);
  polyline(g, [[22, 6], [22, 16]], '#f2bd40', 2.6);
  polyline(g, [[60, 6], [60, 16]], '#f2bd40', 2.6);
  const body = [[8, 16], [78, 16], [92, 34], [94, 48], [80, 40], [8, 40]];
  polygon(g, body, '#cc2129');
  g.save();
  path(g, body);
  g.closePath();
  g.clip();
  g.fillStyle = '#94121c';
  g.fillRect(0, 12, 100, 6);
  g.restore();
  path(g, body);
  g.closePath();
  g.strokeStyle = '#f2bd40';
  g.lineWidth = 1.6;
  g.stroke();
  // sack with gifts peeking out
  ellipseBox(g, 8, 38, 30, 26, '#edf2ff');
  rrect(g, 13, 56, 8, 8, 1, '#2f8a4f');
  rrect(g, 22, 57, 7, 7, 1, '#3d6fe0');
  circle(g, 16, 58, 4, '#ffffff');
  circle(g, 28, 56, 3, '#ffffff');
  // Santa
  ellipseBox(g, 40, 34, 28, 30, '#cc2129');
  rrect(g, 40, 46, 28, 3.5, 1, '#261f21');
  circle(g, 54, 72, 8, '#f5d5b8');
  polygon(g, [[46, 70], [62, 70], [54, 52]], '#ffffff');
  circle(g, 54, 70, 2, '#e8a0a0');
  polygon(g, [[45, 76], [63, 76], [52, 94]], '#cc2129');
  rrect(g, 44, 74, 20, 4, 2, '#ffffff');
  circle(g, 52, 95, 3, '#ffffff');
  at(g, 50, 56, arm, () => {
    rrect(g, 0, -3.5, 15, 7, 3, '#e02b33');
    rrect(g, 11, -4, 4, 8, 1.5, '#ffffff');
    circle(g, 18, 0, 4, '#21854c');
  });
  polyline(g, [[80, 42], [134, 34], [190, 34], [246, 34]], '#b88533', 1.2);
}

/** Number of pre-rendered Santa frames over one bob cycle. */
export const SANTA_FRAMES = 16;
/** Duration of one Santa frame cycle (s): the reindeer bob period (legs run twice in it). */
export const SANTA_CYCLE = TAU / 6.5;

/**
 * Santa's team, facing right, runners at the bottom edge. Frame size `TEAM_W x TEAM_H` units times `scale`.
 *
 * @param {number} scale device px per unit
 */
export function santaFrames(scale) {
  const frames = [];
  for (let k = 0; k < SANTA_FRAMES; k++) {
    const t = (k / SANTA_FRAMES) * SANTA_CYCLE;
    const c = offscreen(TEAM_W * scale, TEAM_H * scale);
    const g = ctx(c);
    g.scale(scale, -scale);
    g.translate(0, -TEAM_H);
    DEER_AT.forEach((x, i) => {
      const legs = [0, 1, 2, 3].map((j) => {
        const n = i * 4 + j;
        return 0.6 * Math.sin(t * 13 + (n % 4) * 1.4 + Math.floor(n / 4) * 0.9);
      });
      const bob = 2 + 3 * Math.abs(Math.sin(t * 6.5 + i * 0.9));
      at(g, x, 4, 0, () => deer(g, legs, bob, i === 2));
    });
    // Santa waves now and then (arm up and down over the cycle).
    sleigh(g, -1.72 + 0.5 * Math.max(0, Math.sin((k / SANTA_FRAMES) * TAU)));
    frames.push(c);
  }
  return frames;
}

// ---- snowplough (Y-down) -------------------------------------------------------------------------------------------

export const PLOUGH_W = 104;
export const PLOUGH_H = 58;
/** Blade front, from the sprite centre. */
export const PLOUGH_FRONT = 44;

/** The snowplough, facing right. Two poses (beacon on / off, wheel spokes turned). */
export function ploughFrames(scale) {
  return [0, 1].map((pose) => {
    const c = offscreen(PLOUGH_W * scale, PLOUGH_H * scale);
    const g = ctx(c);
    g.scale(scale, scale);
    g.lineJoin = 'round';

    // Beacon.
    g.fillStyle = pose ? '#ffb21e' : '#a86d00';
    g.beginPath();
    g.arc(36, 8, 4, Math.PI, 0);
    g.fill();
    if (pose) {
      g.fillStyle = 'rgba(255,178,30,0.35)';
      g.beginPath();
      g.arc(36, 7, 9, 0, TAU);
      g.fill();
    }
    // Cab.
    rrect(g, 18, 10, 34, 24, 4, '#f2a516');
    rrect(g, 30, 14, 18, 12, 2, '#bfe3ff');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(32, 15, 4, 10);
    // Body.
    rrect(g, 6, 28, 76, 16, 4, '#f7b733');
    g.fillStyle = '#2b2f38';
    g.fillRect(6, 36, 76, 3);
    // Exhaust pipe.
    g.fillStyle = '#5c6673';
    g.fillRect(10, 14, 4, 14);
    // Blade.
    g.fillStyle = '#8f9aa8';
    g.beginPath();
    g.moveTo(84, 22);
    g.quadraticCurveTo(98, 34, 96, 52);
    g.lineTo(84, 52);
    g.closePath();
    g.fill();
    g.strokeStyle = '#5c6673';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(78, 38);
    g.lineTo(88, 38);
    g.stroke();
    // Warning stripes on the blade.
    g.strokeStyle = '#e8463a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(88, 30);
    g.lineTo(93, 35);
    g.moveTo(87, 40);
    g.lineTo(95, 46);
    g.stroke();
    // Wheels.
    for (const wx of [22, 66]) {
      circle(g, wx, 46, 9, '#23262d');
      circle(g, wx, 46, 3.5, '#9aa3ad');
      g.strokeStyle = '#9aa3ad';
      g.lineWidth = 1.3;
      const a = pose ? 0.6 : 0;
      g.beginPath();
      g.moveTo(wx + Math.cos(a) * 3, 46 + Math.sin(a) * 3);
      g.lineTo(wx + Math.cos(a) * 7, 46 + Math.sin(a) * 7);
      g.moveTo(wx - Math.cos(a) * 3, 46 - Math.sin(a) * 3);
      g.lineTo(wx - Math.cos(a) * 7, 46 - Math.sin(a) * 7);
      g.stroke();
    }
    return c;
  });
}

// ---- yeti (Y-down) -------------------------------------------------------------------------------------------------

/** Yeti frame size (the body is 64 x 78 inside a margin that leaves room for the axe). */
export const YETI_W = 128;
export const YETI_H = 100;
const YX = 32;
const YY = 22;

/** Pose names, index = frame. */
export const YETI = /** @type {const} */ ({
  walk0: 0,
  walk1: 1,
  up: 2,
  axeWalk0: 3,
  axeWalk1: 4,
  axeUp: 5,
  axeDown: 6,
  sad: 7,
});

function axe(g, x0, y0, x1, y1) {
  g.strokeStyle = '#7a4b26';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  // Head at (x1, y1), across the handle.
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.save();
  g.translate(x1, y1);
  g.rotate(a);
  g.fillStyle = '#9aa6b5';
  g.beginPath();
  g.moveTo(-6, -2);
  g.lineTo(2, -2);
  g.quadraticCurveTo(8, -12, 4, -14);
  g.lineTo(-6, -6);
  g.closePath();
  g.fill();
  g.fillStyle = '#dfe6ef';
  g.fillRect(1, -13, 3, 9);
  g.restore();
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {{step: number, arms: 'down'|'up'|'forward'|'limp', axe: false|'carry'|'up'|'down', mouth: boolean}} o
 */
function yeti(g, o) {
  const fur = '#eef2f8';
  const shade = '#c9d3e2';
  const skin = '#7b8fb3';
  const step = o.step;

  g.fillStyle = shade;
  g.beginPath();
  g.roundRect(20 + step, 56, 10, 20, 4);
  g.roundRect(34 - step, 56, 10, 20, 4);
  g.fill();

  // Back arm.
  g.fillStyle = shade;
  g.beginPath();
  if (o.arms === 'up') g.roundRect(8, 4, 10, 30, 5);
  else if (o.arms === 'limp') g.roundRect(9, 32, 10, 30, 5);
  else g.roundRect(8 - step / 2, 28, 10, 30, 5);
  g.fill();

  // Shaggy body.
  g.fillStyle = fur;
  g.beginPath();
  g.ellipse(32, 42, 19, 22, 0, 0, TAU);
  g.fill();
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7;
    g.beginPath();
    g.arc(32 + Math.cos(a) * 18, 42 + Math.sin(a) * 21, 4, 0, TAU);
    g.fill();
  }
  // Head.
  g.beginPath();
  g.arc(34, 20, 14, 0, TAU);
  g.fill();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 1.1 + (i / 5) * Math.PI * 0.8;
    g.beginPath();
    g.arc(34 + Math.cos(a) * 13, 20 + Math.sin(a) * 13, 3.5, 0, TAU);
    g.fill();
  }
  // Face.
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(38, 23, 9, 8, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#14161c';
  g.beginPath();
  g.arc(35, 20, 1.6, 0, TAU);
  g.arc(42, 20, 1.6, 0, TAU);
  g.fill();
  if (o.mouth) {
    g.fillStyle = '#3b1d2a';
    g.beginPath();
    g.ellipse(39, 27, 4, 3, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(36, 24.5, 2, 2);
    g.fillRect(41, 24.5, 2, 2);
  } else if (o.arms === 'limp') {
    g.strokeStyle = '#14161c';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(36, 28.5);
    g.quadraticCurveTo(39, 26, 42, 28.5);
    g.stroke();
  } else {
    g.strokeStyle = '#14161c';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(36, 27);
    g.quadraticCurveTo(39, 29, 42, 27);
    g.stroke();
  }

  // Axe behind the front arm.
  if (o.axe === 'carry') axe(g, 50 + step / 2, 56, 62 + step / 2, 34);
  else if (o.axe === 'up') axe(g, 51, 6, 40, -16);
  else if (o.axe === 'down') axe(g, 68, 40, 84, 58);

  // Front arm.
  g.fillStyle = shade;
  g.beginPath();
  if (o.arms === 'up') g.roundRect(46, 4, 10, 30, 5);
  else if (o.arms === 'forward') g.roundRect(44, 32, 28, 10, 5);
  else if (o.arms === 'limp') g.roundRect(45, 32, 10, 30, 5);
  else g.roundRect(46 + step / 2, 28, 10, 30, 5);
  g.fill();
}

/** The yeti, facing right, feet near the bottom edge. Frames in `YETI` order. */
export function yetiFrames(scale) {
  const poses = [
    { step: -4, arms: 'down', axe: false, mouth: false },
    { step: 4, arms: 'down', axe: false, mouth: false },
    { step: 0, arms: 'up', axe: false, mouth: true },
    { step: -4, arms: 'down', axe: 'carry', mouth: false },
    { step: 4, arms: 'down', axe: 'carry', mouth: false },
    { step: 0, arms: 'up', axe: 'up', mouth: false },
    { step: 0, arms: 'forward', axe: 'down', mouth: true },
    { step: 0, arms: 'limp', axe: false, mouth: false },
  ];
  return poses.map((o) => {
    const c = offscreen(YETI_W * scale, YETI_H * scale);
    const g = ctx(c);
    g.scale(scale, scale);
    g.translate(YX, YY);
    yeti(g, /** @type {any} */ (o));
    return c;
  });
}

/** A soft white puff sprite (snow dust), radius 8 units. */
export function puffSprite(scale, color = '255,255,255') {
  const r = 8 * scale;
  const c = offscreen(2 * r, 2 * r);
  const g = ctx(c);
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${color},1)`);
  grad.addColorStop(0.5, `rgba(${color},0.75)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2 * r, 2 * r);
  return c;
}
