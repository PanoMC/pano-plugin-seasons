// Pre-rendered sprites of the falling snow (Frostpane's fp-snow flake looks: round flakes, bokeh) and the
// colours of settled snow. Drawn once per device pixel ratio and theme, so a frame only copies bitmaps.

const TAU = Math.PI * 2;

/** @param {number} w @param {number} h */
export function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Ink of flakes: white on dark pages, a cool blue-grey on light ones (white would vanish). */
function ink(light, a) {
  return light ? `rgba(128,156,204,${a})` : `rgba(255,255,255,${a})`;
}

/**
 * Soft round dot (specks, puffs).
 *
 * @param {number} r radius in CSS px
 * @param {number} dpr
 * @param {boolean} light
 */
export function speckSprite(r, dpr, light) {
  const size = Math.ceil((r * 2 + 2) * dpr);
  const c = offscreen(size, size);
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const m = size / 2;
  const grad = g.createRadialGradient(m, m, 0, m, m, m);
  grad.addColorStop(0, ink(light, 1));
  grad.addColorStop(0.5, ink(light, 0.85));
  grad.addColorStop(1, ink(light, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * Bokeh: a big, out-of-focus flake close to the viewer (soft disc with a faint rim).
 *
 * @param {number} r
 * @param {number} dpr
 * @param {boolean} light
 */
export function bokehSprite(r, dpr, light) {
  const size = Math.ceil((r * 2 + 2) * dpr);
  const c = offscreen(size, size);
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const m = size / 2;
  const R = r * dpr;
  const grad = g.createRadialGradient(m, m, 0, m, m, R);
  grad.addColorStop(0, ink(light, 0.55));
  grad.addColorStop(0.75, ink(light, 0.4));
  grad.addColorStop(0.92, ink(light, 0.6));
  grad.addColorStop(1, ink(light, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(m, m, R, 0, TAU);
  g.fill();
  return c;
}

/** Colours of settled snow: fill and the edge that makes it read on the page. */
export function pileColors(light) {
  return light
    ? { fill: '#ffffff', edge: 'rgba(120,145,190,0.75)', edgeDy: -1.2 }
    : { fill: '#f3f7ff', edge: 'rgba(140,165,205,0.85)', edgeDy: 1.4 };
}
