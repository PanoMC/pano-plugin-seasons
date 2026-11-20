{#if active}
  <div class="seasons-seasons {config.layer === 'BEHIND' ? 'seasons-seasons--behind' : ''}" data-seasons-ui aria-hidden="true">
    {#if config.wallpaper}
      <canvas class="seasons-seasons__back" bind:this={back}></canvas>
    {/if}
    <canvas class="seasons-seasons__canvas" bind:this={canvas}></canvas>
  </div>
{/if}

<script module>
  // Mounted on every page of the site (the theme's top hook). The data comes with the page (src/main.js), so the
  // view needs no load of its own. The visitor menu (bottom left) is built by ../seasons/menu.js, shared with the panel.
  export const view = { hook: 'theme:top', skipLoad: true };
</script>

<script>
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { page } from '@panomc/sdk/svelte';
  import { api } from '@panomc/sdk/plugin-api';
  import { normalize, scheduled, excluded } from '../seasons/config.js';
  import { shownWeather, MODE_PERIOD_MS } from '../seasons/weather.js';

  const pluginId = 'pano-plugin-seasons';
  const PAUSED_KEY = 'pano-seasons:paused';

  // The settings come from the page data (set in src/main.js); the optional prop lets the view catalogue pass its own.
  let { config: configProp = null } = $props();
  let config = $derived(normalize(configProp ?? $page.data?.seasonsConfig));

  let mounted = $state(false);
  let paused = $state(false);
  let allowedHere = $state(false);
  /** @type {HTMLCanvasElement|undefined} */
  let canvas = $state();
  /** @type {HTMLCanvasElement|undefined} */
  let back = $state();

  let path = $derived($page.url?.pathname ?? '/');
  /** Seasons runs on this page (the menu shows even while the visitor paused it). */
  let visible = $derived(mounted && config.enabled && allowedHere && scheduled(config) && !excluded(config, path));
  let active = $derived(visible && !paused);

  /** @type {any} */
  let host = null;
  /** @type {any} */
  let menu = null;
  let outside = null;
  let refreshTimer = 0;

  function t(key, fallback) {
    const full = `plugins.${pluginId}.engine.${key}`;
    const text = get(_)(full);
    return text && text !== full ? text : fallback;
  }

  function translate(key) {
    const full = `plugins.${pluginId}.engine.${key}`;
    const text = get(_)(full);
    return text && text !== full ? text : null;
  }

  function setPaused(on) {
    paused = on;
    try {
      if (on) localStorage.setItem(PAUSED_KEY, '1');
      else localStorage.removeItem(PAUSED_KEY);
    } catch {
      // Storage blocked: the choice holds for this page view.
    }
  }

  async function loadOutside() {
    if (config.source !== 'OUTSIDE') return null;
    try {
      const data = await api.get({ path: '/weather' });
      return data?.weather ? data : null;
    } catch {
      return null;
    }
  }

  async function start() {
    stop();
    await tick();
    if (!canvas) return;
    outside = await loadOutside();
    if (!active || !canvas) return;
    const { startSeasons } = await import('../seasons/start.js');
    if (!active || !canvas) return;
    host = startSeasons({
      canvas,
      back: back ?? null,
      config,
      shown: shownWeather(config, outside),
      touch: matchMedia('(pointer: coarse)').matches,
      // `#seasons-debug` in the address exposes the engine as window.__seasons (screenshots, bug reports).
      debug: location.hash === '#seasons-debug',
      translate,
    });
    host.on('trees-full', () => menu?.notice(t('controls.trees-full', 'That is enough trees for this page.')));
    host.on('decor-full', () => menu?.notice(t('controls.decor-full', 'That is enough decorations for this page.')));
    // Random and season picks change with the clock, the weather outside with the forecast (cached 15 min).
    refreshTimer = window.setInterval(
      async () => {
        if (config.source === 'OUTSIDE') outside = (await loadOutside()) ?? outside;
        host?.setShown(shownWeather(config, outside));
      },
      config.source === 'OUTSIDE' ? 15 * 60 * 1000 : Math.min(MODE_PERIOD_MS, 10 * 60 * 1000),
    );
  }

  function stop() {
    clearInterval(refreshTimer);
    host?.stop();
    host = null;
  }

  async function showMenu() {
    if (menu) return;
    const { createMenu } = await import('../seasons/menu.js');
    if (menu || !visible || !config.visitorControls) return;
    menu = createMenu({
      side: 'left',
      t,
      trees: config.trees,
      decorations: config.decorations,
      paused: () => paused,
      running: () => !!host,
      onPause: setPaused,
      send: (cmd) => host?.command(cmd),
    });
    document.body.append(menu.el);
  }

  function hideMenu() {
    menu?.destroy();
    menu = null;
  }

  onMount(() => {
    try {
      paused = localStorage.getItem(PAUSED_KEY) === '1';
    } catch {
      paused = false;
    }
    const coarse = matchMedia('(pointer: coarse)').matches;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    allowedHere = (config.mobile || !coarse) && !(config.reducedMotion && reduce);
    mounted = true;
    return () => {
      hideMenu();
      stop();
    };
  });

  // (Re)start when it turns on, the settings change or the visitor resumes; stop when it turns off.
  $effect(() => {
    void config;
    if (active) start();
    else stop();
  });

  // The menu stays while the visitor paused the weather (it turns it back on).
  $effect(() => {
    if (visible && config.visitorControls) showMenu();
    else hideMenu();
  });
</script>

<style>
  .seasons-seasons__canvas,
  .seasons-seasons__back {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    /* Above a sticky navbar (1030), below offcanvas (1045) and modals (1050). */
    z-index: 1031;
  }

  .seasons-seasons__back {
    z-index: -2;
  }

  .seasons-seasons--behind .seasons-seasons__canvas {
    z-index: -1;
  }
</style>
