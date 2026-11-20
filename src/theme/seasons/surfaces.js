// Page elements things can rest on ("ledges"): the top edge of cards, the navbar, the footer and anything marked
// `data-snow`, plus the bottom edge of the window ("ground"). Shared by every layer: snow piles on them, snowballs
// roll on them, trees and decorations stand on them.
//
// Themes differ, so the default selector is broad (Bootstrap classes and plain landmarks) and admins add their own
// with the `surfaces` setting. `data-no-snow` on an element (or an ancestor) keeps it free.

export const DEFAULT_SELECTOR =
  'footer, .card, .navbar, header, [data-snow], [data-seasons-surface], .list-group, .alert, .jumbotron, table';
export const DEFAULT_SKIP =
  '.modal, .offcanvas, .dropdown-menu, .toast, .tooltip, .popover, [data-no-snow], [data-seasons-ui]';
const MAX_TARGETS = 40;
const MIN_WIDTH = 140;
const MIN_HEIGHT = 30;

/**
 * @typedef {Object} Surface
 * @property {number} id stable id of this surface (per page view)
 * @property {Element|null} el `null` for the ground
 * @property {number} left viewport px
 * @property {number} top viewport px (the line things rest on)
 * @property {number} width
 * @property {number} bottom
 * @property {boolean} fixed `position: fixed|sticky` (does not scroll with the page)
 * @property {boolean} shown on screen
 * @property {boolean} occluded hidden under a fixed element (a sticky navbar)
 * @property {boolean} ground
 */

/** A colour with some opacity ("rgba(0, 0, 0, 0)" and "transparent" are not). */
function opaque(color) {
  if (!color || color === 'transparent') return false;
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return true;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length < 4 || Number(parts[3]) > 0.05;
}

/**
 * Does the element draw a visible box (background, top border or shadow)? A transparent, borderless box (an empty
 * state, a layout wrapper) has no edge to see, so snow resting on it would float in the air.
 *
 * @param {Element} el
 */
function drawnBox(el) {
  const cs = getComputedStyle(el);
  if (Number(cs.opacity) < 0.2 || cs.visibility === 'hidden') return false;
  if (opaque(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== 'none')) return true;
  if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && opaque(cs.borderTopColor)) return true;
  return !!cs.boxShadow && cs.boxShadow !== 'none';
}

/**
 * @param {{selector?: string, skip?: string, ground?: boolean}} opts
 */
export function createSurfaces(opts = {}) {
  const selector = [DEFAULT_SELECTOR, opts.selector].filter(Boolean).join(', ');
  const skip = [DEFAULT_SKIP, opts.skip].filter(Boolean).join(', ');
  let nextId = 1;
  /** @type {WeakMap<Element, Surface>} */
  const byEl = new WeakMap();
  /** @type {Surface[]} */
  let targets = [];
  /** @type {Surface[]} */
  let live = [];
  /** Extra surfaces kept measured although no longer a scan target (something rests on them). @type {Set<Surface>} */
  const pinned = new Set();
  /** @type {Map<Surface, number>} */
  const pins = new Map();

  /** @type {Surface} */
  const ground = { id: 0, el: null, left: 0, top: 0, width: 0, bottom: 0, fixed: true, shown: opts.ground !== false, occluded: false, ground: true };

  function safeQuery() {
    try {
      return document.querySelectorAll(selector);
    } catch {
      // An invalid admin selector: fall back to the defaults.
      return document.querySelectorAll(DEFAULT_SELECTOR);
    }
  }

  function safeClosest(el) {
    try {
      return el.closest(skip);
    } catch {
      return el.closest(DEFAULT_SKIP);
    }
  }

  /** Find candidate elements (cheap enough every ~1.5 s). */
  function scan(H) {
    const found = [];
    for (const el of safeQuery()) {
      if (safeClosest(el)) continue;
      // Nothing inside a card (a list, a table, a click-to-copy row) is a ledge of its own: snow sits on the card.
      // `data-snow` marks an exception on purpose.
      if (!el.matches('[data-snow], [data-seasons-surface]') && el.parentElement?.closest('.card')) continue;
      if (!el.matches('[data-snow], [data-seasons-surface]') && !drawnBox(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < MIN_WIDTH || r.height < MIN_HEIGHT) continue;
      if (r.bottom < -400 || r.top > H + 400) continue;
      found.push({ el, d: Math.abs(r.top - H / 2) });
    }
    found.sort((a, b) => a.d - b.d);
    targets = found.slice(0, MAX_TARGETS).map(({ el }) => {
      let s = byEl.get(el);
      if (!s) {
        const pos = getComputedStyle(el).position;
        s = { id: nextId++, el, left: 0, top: 0, width: 0, bottom: 0, fixed: pos === 'fixed' || pos === 'sticky', shown: false, occluded: false, ground: false };
        byEl.set(el, s);
      }
      return s;
    });
  }

  /** Read positions (every frame; layout reads only). */
  function measure(W, H) {
    ground.left = 0;
    ground.top = H;
    ground.bottom = H;
    ground.width = W;
    const set = new Set([...targets, ...pinned]);
    for (const s of set) {
      if (!s.el || !s.el.isConnected) {
        s.shown = false;
        continue;
      }
      const r = s.el.getBoundingClientRect();
      s.left = r.left;
      s.top = r.top;
      s.bottom = r.bottom;
      s.width = r.width;
      s.shown = r.width > 0 && r.top > -30 && r.top < H + 30;
    }
    const occluders = targets.filter((s) => s.fixed && s.shown);
    live = [];
    for (const s of set) {
      if (!s.shown) continue;
      s.occluded =
        !s.fixed &&
        occluders.some((o) => o !== s && s.top >= o.top - 1 && s.top <= o.bottom + 2 && s.left < o.left + o.width && s.left + s.width > o.left);
      if (!s.occluded) live.push(s);
    }
    if (ground.shown) live.push(ground);
  }

  return {
    ground,
    scan,
    measure,
    /** Surfaces things can rest on right now (ground last). */
    get live() {
      return live;
    },
    /** Keep measuring `s` while something rests on it, even when the scan drops it. Counted: every pin needs an unpin. */
    pin(s) {
      if (!s || s.ground) return;
      pins.set(s, (pins.get(s) ?? 0) + 1);
      pinned.add(s);
    },
    unpin(s) {
      if (!s || s.ground) return;
      const n = (pins.get(s) ?? 0) - 1;
      if (n > 0) {
        pins.set(s, n);
        return;
      }
      pins.delete(s);
      pinned.delete(s);
    },
    /** The surface whose top line is under (x, y) within `slack` px above it. */
    at(x, y, slack = 0) {
      for (const s of live) {
        if (x < s.left || x >= s.left + s.width) continue;
        if (y >= s.top - slack && y <= s.top + 2) return s;
      }
      return null;
    },
    /** The highest surface below `y` at `x` (where something falling at x would land). */
    below(x, y) {
      let best = null;
      for (const s of live) {
        if (x < s.left || x >= s.left + s.width || s.top < y) continue;
        if (!best || s.top < best.top) best = s;
      }
      return best;
    },
    /** Find a surface by its element (for restoring saved things), or the ground. */
    ofElement(el) {
      return el ? byEl.get(el) ?? null : ground;
    },
  };
}
