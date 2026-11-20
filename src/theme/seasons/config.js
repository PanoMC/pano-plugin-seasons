// The settings of the plugin: one flat object, stored by the backend (SeasonsConfig.kt) and edited on the plugin's
// panel page. Every feature has its own switch. Keep this file, SeasonsConfig.kt and the panel form in step.

/** The six weathers, in Frostpane's menu order. */
export const WEATHERS = /** @type {const} */ (['snow', 'rain', 'sakura', 'leaves', 'fireflies', 'starfall']);

/** Wind settings (Frostpane's `Wind`). */
export const WINDS = /** @type {const} */ (['none', 'gentleLeft', 'strongLeft', 'gentleRight', 'strongRight', 'changing']);

/** Visitors that come by while it snows. */
export const VISITORS = /** @type {const} */ (['santa', 'snowmen', 'yeti', 'plough']);

export const DEFAULTS = {
  /** Master switch. */
  enabled: true,
  /** When it shows: ALWAYS, WINTER (15 November – 31 January) or DATES (startDate – endDate, "MM-DD", may wrap the year). */
  schedule: 'ALWAYS',
  startDate: '12-01',
  endDate: '01-15',

  /** Which weather: MANUAL (`weather`), OUTSIDE (the weather in `city` now), RANDOM (from `randomPool`, changes every 3 h), SEASON (by month). */
  source: 'MANUAL',
  weather: 'snow',
  randomPool: [...WEATHERS],
  /** City for OUTSIDE (Open-Meteo geocoding result); its latitude also picks the hemisphere for SEASON. */
  city: /** @type {null | {name: string, admin: string, country: string, latitude: number, longitude: number}} */ (null),

  heavySnow: false,
  lightning: true,
  wind: 'none',
  /** Amount of falling particles (multiplier, 0.2 – 3). */
  density: 1,
  /** Falling speed (multiplier, 0.3 – 2). */
  speed: 1,

  /** Snow settles on page elements (cards, navbar, footer, `[data-snow]`). */
  settle: true,
  /** Snow piles up along the bottom edge of the window. */
  groundSnow: true,
  /** How fast snow piles up (multiplier, 0.2 – 3). Little falls, a lot piles up. */
  pileSpeed: 1.5,
  /** Extra CSS selector of elements snow settles on (added to the defaults). */
  surfaces: '',
  /** Extra CSS selector of elements snow never settles on. */
  excludeSurfaces: '',

  /** Visitors may roll, grab and throw snowballs. */
  snowballs: true,
  /** Three stacked balls become a snowman. */
  snowmen: true,
  /** Visitors may dress snowmen up (hats, scarves, faces...). */
  dressUp: true,
  /** Visitors may plant decorated Christmas trees. */
  trees: true,
  /** Visitors may place decorations (string lights, candles, baubles...). */
  decorations: true,
  /** Max trees and max decorations a visitor may place (each). */
  maxPlaced: 20,

  /** Visitors (characters) come by while it snows. */
  visitors: true,
  santa: true,
  snowmenFight: true,
  yeti: true,
  plough: true,
  /** Visits come more often. */
  oftenVisits: false,

  /** Draw the matching wallpaper behind the page (replaces the theme's page background). */
  wallpaper: false,
  /** The wallpaper follows the time of day (dawn, day, dusk, night). */
  wallpaperDayNight: true,

  /** FRONT = the weather falls over the page, BEHIND = behind the page content. */
  layer: 'FRONT',
  /** Show in the admin panel too. */
  panel: true,
  /** How much of it the panel gets (0.1 – 1): less falls and less piles up there, an admin works in it. */
  panelAmount: 0.3,
  /** Show on phones and tablets. */
  mobile: true,
  /** Show nothing to visitors who ask their system for reduced motion. */
  reducedMotion: true,
  /** A small button lets each visitor pause the weather and open the snow toolbox (trees, decorations). */
  visitorControls: true,
  /** Path prefixes (one per line) where nothing shows, e.g. /store/checkout. */
  excludedPaths: '',
};

/** @typedef {typeof DEFAULTS} SeasonsConfig */

const RANGES = { density: [0.2, 3], speed: [0.3, 2], pileSpeed: [0.2, 3], maxPlaced: [1, 200], panelAmount: [0.1, 1] };
const ENUMS = {
  schedule: ['ALWAYS', 'WINTER', 'DATES'],
  source: ['MANUAL', 'OUTSIDE', 'RANDOM', 'SEASON'],
  weather: WEATHERS,
  wind: WINDS,
  layer: ['FRONT', 'BEHIND'],
};
const DATE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Fill missing or invalid values with the defaults (lenient, like Frostpane's settings load).
 *
 * @param {any} raw
 * @returns {SeasonsConfig}
 */
export function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  /** @type {any} */
  const out = { ...DEFAULTS, randomPool: [...DEFAULTS.randomPool] };
  for (const [key, def] of Object.entries(DEFAULTS)) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
    } else if (typeof def === 'number') {
      const n = Number(v);
      if (Number.isFinite(n)) {
        const [lo, hi] = RANGES[/** @type {keyof RANGES} */ (key)] ?? [-Infinity, Infinity];
        out[key] = Math.min(hi, Math.max(lo, n));
      }
    } else if (key in ENUMS) {
      if (ENUMS[/** @type {keyof ENUMS} */ (key)].includes(v)) out[key] = v;
    } else if (key === 'randomPool') {
      if (Array.isArray(v)) out.randomPool = WEATHERS.filter((w) => v.includes(w));
    } else if (key === 'city') {
      const lat = Number(v.latitude);
      const lon = Number(v.longitude);
      if (typeof v.name === 'string' && v.name && Number.isFinite(lat) && Number.isFinite(lon)) {
        out.city = { name: v.name, admin: String(v.admin ?? ''), country: String(v.country ?? ''), latitude: lat, longitude: lon };
      }
    } else if (key === 'startDate' || key === 'endDate') {
      if (typeof v === 'string' && DATE.test(v)) out[key] = v;
    } else if (typeof def === 'string' && typeof v === 'string') {
      out[key] = v;
    }
  }
  if (!out.randomPool.length) out.randomPool = [...WEATHERS];
  return out;
}

/** Is a "MM-DD" date inside [start, end] (the range may wrap the new year)? */
function inRange(md, start, end) {
  return start <= end ? md >= start && md <= end : md >= start || md <= end;
}

/**
 * Does the schedule allow showing now?
 *
 * @param {SeasonsConfig} c
 * @param {Date} [date]
 */
export function scheduled(c, date = new Date()) {
  if (c.schedule === 'ALWAYS') return true;
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (c.schedule === 'WINTER') return inRange(md, '11-15', '01-31');
  return inRange(md, c.startDate, c.endDate);
}

/**
 * Does `path` match one pattern of "Pages without effects"? A pattern without `*` matches that page and every page
 * under it (`/store` matches `/store` and `/store/cart`). A star matches any run of characters, also slashes:
 * "/store/" + star = every page under /store, star + "/checkout" = every checkout page, "/panel" + star = the panel.
 *
 * @param {string} pattern
 * @param {string} path
 */
export function pathMatches(pattern, path) {
  const p = pattern.trim();
  if (!p) return false;
  if (!p.includes('*')) return path === p || path.startsWith(p.endsWith('/') ? p : p + '/');
  const re = new RegExp('^' + p.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(path);
}

/**
 * Is the path one of the excluded pages?
 *
 * @param {SeasonsConfig} c
 * @param {string} path
 */
export function excluded(c, path) {
  return c.excludedPaths.split(/\r?\n/).some((p) => pathMatches(p, path));
}
