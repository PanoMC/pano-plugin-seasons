// Seasons in the admin panel. The panel has no hook that sits on every page, so the plugin mounts its canvas and its
// small menu (bottom right) on the document itself, once, and follows the panel's own navigation (a client-side app)
// by watching the address.
// The settings are the site's, toned down by "Amount in the panel" (less falls, less piles up: an admin works here);
// "Show in the panel" and "Pages without effects" (e.g. /panel/addons*) decide where it shows. Turning the weather off
// from the menu holds for the panel only, the site keeps its own choice.

import { normalize, scheduled, excluded } from '../theme/seasons/config.js';
import { shownWeather, MODE_PERIOD_MS } from '../theme/seasons/weather.js';

const pluginId = 'pano-plugin-seasons';
const PAUSED_KEY = 'pano-seasons:panel-paused';

async function getJson(path) {
  const res = await fetch(`/api/plugins/${pluginId}${path}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function readPaused() {
  try {
    return localStorage.getItem(PAUSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writePaused(on) {
  try {
    if (on) localStorage.setItem(PAUSED_KEY, '1');
    else localStorage.removeItem(PAUSED_KEY);
  } catch {
    // Storage blocked: the choice holds until the page reloads.
  }
}

/**
 * @param {{translate?: (key: string) => string|null}} [opts]
 */
export async function mountPanelSeasons(opts = {}) {
  if (typeof window === 'undefined' || /** @type {any} */ (window).__seasonsPanelMounted) return;
  /** @type {any} */ (window).__seasonsPanelMounted = true;

  /** @type {any} */
  let config;
  try {
    config = normalize(await getJson('/config'));
  } catch {
    return;
  }
  if (!config.enabled || !config.panel || !scheduled(config)) return;
  if (config.reducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && !config.mobile) return;
  // The panel keeps its own background; less falls and less piles up than on the site.
  const k = config.panelAmount;
  config = {
    ...config,
    wallpaper: false,
    densityRef: config.density,
    density: Math.max(0.05, config.density * k),
    pileSpeed: Math.max(0.05, config.pileSpeed * k),
  };

  const t = (key, fallback) => opts.translate?.(`controls.${key}`) ?? fallback;

  let outside = null;
  const loadOutside = async () => {
    if (config.source !== 'OUTSIDE') return null;
    try {
      const data = await getJson('/weather');
      return data?.weather ? data : null;
    } catch {
      return null;
    }
  };
  outside = await loadOutside();

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-seasons-ui', '');
  canvas.className = 'seasons-panel__canvas';
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: config.layer === 'BEHIND' ? '-1' : '1031',
  });

  const { startSeasons } = await import('../theme/seasons/start.js');
  /** @type {any} */
  let host = null;
  let paused = readPaused();

  // ---- menu (bottom right; the same card as on the site, in the panel's own Bootstrap look) ------------------------

  const { createMenu } = await import('../theme/seasons/menu.js');
  const menu = createMenu({
    side: 'right',
    t: (key, fallback) => opts.translate?.(key) ?? fallback,
    trees: config.trees,
    decorations: config.decorations,
    paused: () => paused,
    running: () => !!host,
    onPause: (on) => {
      paused = on;
      writePaused(on);
      sync();
    },
    send: (cmd) => host?.command(cmd),
  });
  const controls = menu.el;

  // ---- run ---------------------------------------------------------------------------------------------------------

  function sync() {
    const here = !excluded(config, location.pathname);
    if (config.visitorControls && here && !controls.isConnected) document.body.append(controls);
    if (!here && controls.isConnected) controls.remove();

    const want = here && !paused;
    if (want && !host) {
      if (!canvas.isConnected) document.body.append(canvas);
      host = startSeasons({
        canvas,
        back: null,
        config,
        shown: shownWeather(config, outside),
        touch,
        translate: opts.translate,
        debug: location.hash === '#seasons-debug',
      });
      host.on('trees-full', () => menu.notice(t('trees-full', 'That is enough trees for this page.')));
      host.on('decor-full', () => menu.notice(t('decor-full', 'That is enough decorations for this page.')));
    } else if (!want && host) {
      host.stop();
      host = null;
      canvas.remove();
    }
  }

  sync();
  // The panel navigates without reloading: check the address now and then (cheap), and on back / forward.
  window.setInterval(sync, 1000);
  window.addEventListener('popstate', sync);
  window.setInterval(
    async () => {
      if (config.source === 'OUTSIDE') outside = (await loadOutside()) ?? outside;
      host?.setShown(shownWeather(config, outside));
    },
    config.source === 'OUTSIDE' ? 15 * 60 * 1000 : Math.min(MODE_PERIOD_MS, 10 * 60 * 1000),
  );
}
