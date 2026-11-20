// The wallpaper behind the page (Frostpane's generated wallpaper packs, app/frostpane/src/packs.rs): a sky tinted per
// time-of-day slot, two rolling hills and the weather's marks (snow dots, rain streaks, petals, leaves, firefly glows,
// stars). Drawn on the background canvas only. The picture is rendered once into an offscreen canvas and redrawn only
// when the weather, the slot or the size changes; `drawBack` is a single drawImage.

/** Day slots with their start minute (fp-sources daynight). */
export const SLOTS = /** @type {const} */ ([
  ['dawn', 360],
  ['sunrise', 420],
  ['morning', 540],
  ['midday', 720],
  ['golden', 930],
  ['sunset', 1020],
  ['dusk', 1080],
  ['night', 1170],
]);

/** `[brightness, warm mix, warm colour]` per slot. */
const SLOT_TONE = {
  dawn: [0.62, 0.35, 0xe79bb8],
  sunrise: [0.85, 0.4, 0xffb070],
  morning: [1.0, 0.08, 0xffe3b0],
  midday: [1.0, 0.0, 0xffffff],
  golden: [0.95, 0.3, 0xffc060],
  sunset: [0.78, 0.45, 0xf2704a],
  dusk: [0.5, 0.35, 0x8a5cb0],
  night: [0.34, 0.2, 0x203060],
};

/** Sky `[top, bottom]` per weather (fp-ui art.rs tile_sky). */
const SKY = {
  snow: [0x7fa8e8, 0xdcebff],
  rain: [0x34425f, 0x7b8fb0],
  sakura: [0xffd6e5, 0xf5a3c0],
  leaves: [0xf2b66b, 0xb5542a],
  fireflies: [0x0b1b2e, 0x1d3b33],
  starfall: [0x090b2b, 0x2a1b5e],
};

/** Slot for minutes since local midnight (before 06:00: night). */
export function slotAt(minutes) {
  let slot = 'night';
  for (const [name, start] of SLOTS) if (start <= minutes) slot = name;
  return slot;
}

function tint(color, slot) {
  const [bright, mix, warm] = SLOT_TONE[slot];
  const ch = (shift) => {
    const base = (color >> shift) & 0xff;
    const w = (warm >> shift) & 0xff;
    return Math.max(0, Math.min(255, Math.floor((base * (1 - mix) + w * mix) * bright)));
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

/** Deterministic pseudo-random in 0..1 (packs.rs noise; f64 sin hash). */
function noise(i, k) {
  const v = (13 * i + k) * 12.9898;
  const s = Math.sin(v) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Draw one still of `weather` for `slot` into `g` (`w` x `h` device px, Y down).
 *
 * @param {CanvasRenderingContext2D} g
 * @param {string} weather
 * @param {string} slot
 * @param {number} w
 * @param {number} h
 */
export function renderWallpaper(g, weather, slot, w, h) {
  const unit = h / 1200;
  const [skyTop, skyBottom] = SKY[weather] ?? SKY.snow;
  const top = tint(skyTop, slot);
  const bottom = tint(skyBottom, slot);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, hex(top));
  sky.addColorStop(1, hex(bottom));
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // Ground silhouette: two rolling hills in a darker shade of the sky.
  for (const [layer, base, shade] of [
    [0, 0.22, 0.55],
    [1, 0.14, 0.35],
  ]) {
    g.beginPath();
    g.moveTo(0, h);
    for (let step = 0; step <= 24; step++) {
      const x = (w * step) / 24;
      const y = h * base + h * 0.05 * (noise(step + 40 * layer, 7) - 0.5) * 2;
      g.lineTo(x, h - y);
    }
    g.lineTo(w, h);
    g.closePath();
    const dark = (sh) => Math.floor(((bottom >> sh) & 0xff) * shade);
    g.fillStyle = `rgb(${dark(16)},${dark(8)},${dark(0)})`;
    g.fill();
  }

  const night = slot === 'night' || slot === 'dusk';
  for (let i = 0; i < 520; i++) {
    const x = noise(i, 1) * w;
    const y = h - noise(i, 2) * h;
    const r = (1 + noise(i, 3) * 3) * unit;
    switch (weather) {
      case 'rain':
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 8 * unit, y + 30 * unit);
        g.strokeStyle = 'rgba(209,230,255,0.45)';
        g.lineWidth = unit * 1.5;
        g.lineCap = 'round';
        g.stroke();
        break;
      case 'sakura':
        ellipse(g, x, y, (8 + r * 2) * unit, (5 + r) * unit, 'rgba(255,230,240,0.85)');
        break;
      case 'leaves':
        ellipse(g, x, y, (9 + r * 2) * unit, (5 + r) * unit, 'rgba(242,128,38,0.9)');
        break;
      case 'fireflies': {
        const rad = (6 + r * 4) * unit;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(245,219,77,${night ? 0.9 : 0.5})`);
        gr.addColorStop(1, 'rgba(245,219,77,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'starfall':
        if (i % 9 === 0) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - 40 * unit, y - 26 * unit);
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = unit * 2;
          g.lineCap = 'round';
          g.stroke();
        }
        dot(g, x, y, r * 0.8, 'rgba(255,255,255,0.9)');
        break;
      default:
        dot(g, x, y, r * 1.6, 'rgba(255,255,255,0.85)');
    }
  }
}

function dot(g, x, y, r, color) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

/** Bounding-box ellipse with its corner at (x, y) in Y-up art; here the box grows upward from (x, y). */
function ellipse(g, x, y, w, h, color) {
  g.beginPath();
  g.ellipse(x + w / 2, y - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

/**
 * @param {import('../host.js').Host} host
 * @returns {import('../host.js').Layer}
 */
export function createWallpaper(host) {
  /** @type {HTMLCanvasElement|null} */
  let cache = null;
  let key = '';

  function currentSlot() {
    if (!host.config.wallpaperDayNight) return 'midday';
    const d = new Date();
    return slotAt(d.getHours() * 60 + d.getMinutes());
  }

  function weather() {
    const w = host.shown.weather ?? host.config.weather;
    return w in SKY ? w : 'snow';
  }

  function ensure() {
    const w = Math.max(1, Math.round(host.W * host.dpr));
    const h = Math.max(1, Math.round(host.H * host.dpr));
    const k = `${weather()}|${currentSlot()}|${w}x${h}`;
    if (cache && k === key) return;
    key = k;
    if (!cache) cache = document.createElement('canvas');
    cache.width = w;
    cache.height = h;
    const g = /** @type {CanvasRenderingContext2D} */ (cache.getContext('2d'));
    renderWallpaper(g, weather(), currentSlot(), w, h);
  }

  return {
    name: 'wallpaper',
    z: 0,

    drawBack(g) {
      ensure();
      if (!cache) return;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(cache, 0, 0);
      g.restore();
    },

    resize() {
      key = '';
      host.invalidateBack?.();
    },

    weatherChanged() {
      host.invalidateBack?.();
    },

    destroy() {
      cache = null;
    },
  };
}
