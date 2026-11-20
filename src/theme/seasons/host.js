// The Seasons engine host: one click-through canvas over the page (or behind it), one frame loop, and the shared
// state every layer reads (size, theme brightness, wind, the weather shown, surfaces, pointer). Effects are layers
// (`layers/*.js`); see ENGINE.md for the contract.
//
// Cheap on purpose: ~30 fps while nothing needs more, no work while the tab is hidden, a hard cap on the device
// pixel ratio.

import { Blow, breezeSpeed } from './wind.js';
import { createSurfaces } from './surfaces.js';

const IDLE_FPS = 30;
const SCAN_EVERY = 1.5;
const STORE_PREFIX = 'pano-seasons:';

/**
 * @typedef {Object} PointerState
 * @property {number} x viewport px
 * @property {number} y
 * @property {number} vx px/s (smoothed)
 * @property {number} vy
 * @property {boolean} down
 * @property {boolean} touch
 * @property {number} t time of the last move (host clock, s)
 */

/**
 * @typedef {Object} Layer
 * @property {string} name
 * @property {number} z draw order (lower first)
 * @property {(dt: number) => void} [step] advance by dt seconds (always called, also when the layer has nothing to do)
 * @property {(g: CanvasRenderingContext2D) => void} [draw] draw in CSS px (the host already scaled by dpr)
 * @property {(g: CanvasRenderingContext2D) => void} [drawBack] draw on the background canvas (wallpaper)
 * @property {() => void} [resize]
 * @property {() => void} [themeChanged] light/dark flipped
 * @property {(shown: import('./weather.js').Shown) => void} [weatherChanged]
 * @property {(p: PointerState) => boolean} [pointerDown] true = this layer takes the gesture (move/up go to it)
 * @property {(p: PointerState) => void} [pointerMove] only while it holds the gesture
 * @property {(p: PointerState) => void} [pointerUp]
 * @property {(p: PointerState) => string|null} [hover] cursor to show over something of this layer, or null
 * @property {() => boolean} [busy] true while it needs the full frame rate (drag, thrown ball, visitor)
 * @property {(cmd: any) => void} [command] one-shot commands (from the toolbox, a debug panel)
 * @property {() => void} [destroy]
 */

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   back?: HTMLCanvasElement|null,
 *   config: import('./config.js').SeasonsConfig,
 *   shown: import('./weather.js').Shown,
 *   touch?: boolean,
 *   debug?: boolean,
 *   translate?: (key: string) => string|null,
 * }} opts
 */
export function createHost(opts) {
  const { canvas, back = null, config } = opts;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const gb = back ? back.getContext('2d') : null;
  const root = document.documentElement;
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  /** @type {Layer[]} */
  let layers = [];

  const blow = new Blow(1);
  let raf = 0;
  let last = 0;
  let acc = 0;
  let scanAt = 0;
  let stopped = false;
  /** @type {Layer|null} */
  let holder = null;
  let downX = 0;
  let downY = 0;
  let moved = false;
  let suppressClickUntil = 0;
  let cursor = '';

  const host = {
    canvas,
    back,
    config,
    /** What shows now. */
    shown: opts.shown,
    /** Viewport size in CSS px. */
    W: 0,
    H: 0,
    dpr: 1,
    /** The theme is light (dark flakes need more contrast there). */
    light: false,
    touch: !!opts.touch,
    /** Host clock in seconds since start. */
    t: 0,
    /** Horizontal wind in px/s: the setting (low-passed, with gusts) plus the natural breeze. */
    wind: 0,
    /** Only the setting part of the wind (no breeze). */
    userWind: 0,
    surfaces: createSurfaces({ selector: config.surfaces, skip: config.excludeSurfaces, ground: config.groundSnow }),
    /** @type {PointerState} */
    pointer: { x: -1e4, y: -1e4, vx: 0, vy: 0, down: false, touch: false, t: -1 },
    /** Small view scale for narrow screens (visitors and objects draw smaller). */
    scale: 1,
    debug: !!opts.debug,

    /**
     * Text for UI the engine draws (dress-up card, toolbox). Keys live under `engine.` in the plugin's locale files.
     *
     * @param {string} key
     * @param {string} fallback English text
     */
    t9n(key, fallback) {
      return opts.translate?.(key) ?? fallback;
    },

    /** @param {string} name */
    layer(name) {
      return layers.find((l) => l.name === name) ?? null;
    },

    /** @param {Layer} l */
    add(l) {
      layers.push(l);
      layers.sort((a, b) => a.z - b.z);
      l.resize?.();
      return l;
    },

    /** @param {string} type @param {Function} fn */
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },

    /** @param {string} type @param {any} [data] */
    emit(type, data) {
      for (const fn of listeners.get(type) ?? []) {
        try {
          fn(data);
        } catch (e) {
          console.error('[seasons]', e);
        }
      }
    },

    /** Per-visitor storage (localStorage, may be blocked). */
    load(key, fallback = null) {
      try {
        const v = localStorage.getItem(STORE_PREFIX + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    save(key, value) {
      try {
        if (value == null) localStorage.removeItem(STORE_PREFIX + key);
        else localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
      } catch {
        // Storage blocked: the things placed stay for this page view only.
      }
    },

    /** Send a one-shot command to every layer (e.g. `{type: 'summon', visitor: 'santa'}`). */
    command(cmd) {
      for (const l of layers) l.command?.(cmd);
      host.emit('command', cmd);
    },

    /** @param {import('./weather.js').Shown} shown */
    setShown(shown) {
      const same = shown.weather === host.shown.weather && shown.heavy === host.shown.heavy && shown.lightning === host.shown.lightning;
      host.shown = shown;
      if (!same) for (const l of layers) l.weatherChanged?.(shown);
    },

    /** Stop and remove every listener. */
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('click', onClick, true);
      themeObserver.disconnect();
      setCursor('');
      for (const l of layers) l.destroy?.();
      layers = [];
      g.clearRect(0, 0, canvas.width, canvas.height);
      gb?.clearRect(0, 0, back.width, back.height);
    },
  };

  // ---- size and theme ----------------------------------------------------------------------------------------------

  function readLight() {
    const attr = root.getAttribute('data-bs-theme') ?? document.body?.getAttribute('data-bs-theme');
    if (attr === 'light') return true;
    if (attr === 'dark') return false;
    // No Bootstrap attribute: judge the page background.
    const bg = getComputedStyle(document.body).backgroundColor || getComputedStyle(root).backgroundColor;
    const m = bg.match(/\d+(\.\d+)?/g);
    if (!m || (m.length > 3 && Number(m[3]) === 0)) return !matchMedia('(prefers-color-scheme: dark)').matches;
    const [r, gg, b] = m.map(Number);
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b > 140;
  }

  function resize() {
    host.W = window.innerWidth;
    host.H = window.innerHeight;
    host.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    host.scale = host.W < 700 ? 0.75 : 1;
    for (const c of [canvas, back]) {
      if (!c) continue;
      c.width = Math.round(host.W * host.dpr);
      c.height = Math.round(host.H * host.dpr);
    }
    scanAt = 0;
    for (const l of layers) l.resize?.();
    backDirty = true;
  }

  const themeObserver = new MutationObserver(() => {
    const light = readLight();
    if (light !== host.light) {
      host.light = light;
      for (const l of layers) l.themeChanged?.();
      backDirty = true;
    }
  });

  // ---- pointer -----------------------------------------------------------------------------------------------------

  /** @param {PointerEvent} e */
  function track(e) {
    const p = host.pointer;
    const dt = Math.max(1e-3, host.t - p.t);
    if (p.t >= 0 && dt < 0.25) {
      const k = Math.min(1, dt * 12);
      p.vx += ((e.clientX - p.x) / dt - p.vx) * k;
      p.vy += ((e.clientY - p.y) / dt - p.vy) * k;
    } else {
      p.vx = 0;
      p.vy = 0;
    }
    p.x = e.clientX;
    p.y = e.clientY;
    p.t = host.t;
    p.touch = e.pointerType !== 'mouse';
  }

  function setCursor(c) {
    if (c === cursor) return;
    cursor = c;
    root.style.cursor = c;
  }

  /** Pointer over UI of the page that must stay usable (links, buttons, inputs) unless a layer claims it on purpose. */
  function onDown(e) {
    if (e.button !== 0) return;
    track(e);
    host.pointer.down = true;
    if (!config.snowballs && !config.trees && !config.decorations && !config.dressUp) return;
    if (e.target instanceof Element && e.target.closest('[data-seasons-ui]')) return;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.pointerDown?.(host.pointer)) {
        holder = l;
        downX = e.clientX;
        downY = e.clientY;
        moved = false;
        e.preventDefault();
        e.stopPropagation();
        try {
          /** @type {Element} */ (e.target).releasePointerCapture?.(e.pointerId);
        } catch {
          // nothing captured
        }
        wake();
        return;
      }
    }
  }

  function onMove(e) {
    track(e);
    if (holder) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
      holder.pointerMove?.(host.pointer);
      e.preventDefault();
      return;
    }
    if (e.pointerType !== 'mouse') return;
    let c = null;
    for (let i = layers.length - 1; i >= 0 && !c; i--) c = layers[i].hover?.(host.pointer) ?? null;
    setCursor(c ?? '');
  }

  function onUp(e) {
    track(e);
    host.pointer.down = false;
    if (!holder) return;
    holder.pointerUp?.(host.pointer);
    holder = null;
    // A click follows pointerup: do not let it reach a link under a thrown ball.
    suppressClickUntil = performance.now() + 350;
    e.preventDefault();
  }

  function onClick(e) {
    if (performance.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ---- loop --------------------------------------------------------------------------------------------------------

  let backDirty = true;
  let backAt = 0;

  function busy() {
    if (holder) return true;
    for (const l of layers) if (l.busy?.()) return true;
    return false;
  }

  function frame(ts) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const rawDt = last ? (ts - last) / 1000 : 1 / 60;
    last = ts;
    acc += rawDt;
    if (!busy() && acc < 1 / IDLE_FPS - 0.002) return;
    const dt = Math.min(0.05, acc);
    acc = 0;
    host.t += dt;

    // A pointer that stopped moving has no speed (moves only arrive while it moves).
    if (host.t - host.pointer.t > 0.08) {
      const k = Math.exp(-12 * dt);
      host.pointer.vx *= k;
      host.pointer.vy *= k;
    }

    blow.step(dt, host.t, config.wind);
    host.userWind = blow.speed;
    host.wind = blow.speed + breezeSpeed(host.t);

    if (host.t >= scanAt) {
      host.surfaces.scan(host.H);
      scanAt = host.t + SCAN_EVERY;
    }
    host.surfaces.measure(host.W, host.H);

    for (const l of layers) {
      try {
        l.step?.(dt);
      } catch (e) {
        console.error(`[seasons] ${l.name}.step`, e);
      }
    }

    g.setTransform(host.dpr, 0, 0, host.dpr, 0, 0);
    g.clearRect(0, 0, host.W, host.H);
    for (const l of layers) {
      if (!l.draw) continue;
      g.save();
      try {
        l.draw(g);
      } catch (e) {
        console.error(`[seasons] ${l.name}.draw`, e);
      }
      g.restore();
    }

    // The background (wallpaper) changes slowly: redraw on demand and once a second.
    if (gb && (backDirty || host.t >= backAt)) {
      backDirty = false;
      backAt = host.t + 1;
      gb.setTransform(host.dpr, 0, 0, host.dpr, 0, 0);
      for (const l of layers) l.drawBack?.(gb);
    }
  }

  function wake() {
    acc = 1;
  }

  function visibility() {
    last = 0;
  }

  // ---- start -------------------------------------------------------------------------------------------------------

  host.light = readLight();
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  window.addEventListener('click', onClick, true);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-bs-theme', 'class'] });
  if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-bs-theme', 'class'] });
  /** Redraw the background on the next frame. */
  host.invalidateBack = () => {
    backDirty = true;
  };
  host.wake = wake;
  raf = requestAnimationFrame(frame);

  return host;
}

/** @typedef {ReturnType<typeof createHost>} Host */
