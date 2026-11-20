// The visitor menu: a round snowflake button and, above it, a small card in the host's own Bootstrap look (the same
// card as the snowman and tree cards): a header with a close button, the actions as a list, the decorations as an
// icon grid (names in tooltips) and "Clear everything" in the footer. Shared by the site (src/theme/views/Seasons.svelte)
// and the admin panel (src/panel/panelSeasons.js), so both look alike and follow their theme.

import { DECOR_KINDS, decorIcon } from './layers/decor.js';

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function el(tag, className = '', text = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/**
 * @param {{
 *   side: 'left'|'right',
 *   t: (key: string, fallback: string) => string,
 *   trees: boolean,
 *   decorations: boolean,
 *   paused: () => boolean,
 *   running: () => boolean,
 *   onPause: (paused: boolean) => void,
 *   send: (cmd: any) => void,
 * }} o
 */
export function createMenu(o) {
  const root = el('div', 'seasons-menu d-flex flex-column gap-2');
  root.setAttribute('data-seasons-ui', '');
  Object.assign(root.style, {
    position: 'fixed',
    bottom: '1rem',
    [o.side]: '1rem',
    zIndex: '1036',
    alignItems: o.side === 'right' ? 'flex-end' : 'flex-start',
  });

  const card = el('div', 'seasons-menu__card card shadow-lg');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', o.t('controls.title', 'Weather'));
  card.style.width = 'min(17.5rem, calc(100vw - 2rem))';
  card.hidden = true;

  const notice = el('div', 'seasons-menu__notice card shadow-sm small px-3 py-2');
  notice.setAttribute('role', 'status');
  notice.style.maxWidth = 'min(17.5rem, calc(100vw - 2rem))';
  notice.hidden = true;
  let noticeTimer = 0;

  const toggle = el('button', 'seasons-menu__toggle btn btn-primary rounded-circle shadow');
  toggle.type = 'button';
  Object.assign(toggle.style, { width: '2.75rem', height: '2.75rem', padding: '0', display: 'grid', placeItems: 'center' });
  toggle.title = o.t('controls.title', 'Weather');
  toggle.setAttribute('aria-label', o.t('controls.title', 'Weather'));
  toggle.setAttribute('aria-expanded', 'false');
  toggle.append(el('i', 'fa-regular fa-snowflake'));

  /** @type {Map<string, HTMLCanvasElement>} */
  const icons = new Map();

  function close() {
    card.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  function action(icon, label, onClick) {
    const b = el('button', 'list-group-item list-group-item-action fw-normal d-flex align-items-center gap-2 border-0');
    b.type = 'button';
    const i = el('i', `fa-solid ${icon} fa-fw text-body-secondary`);
    const span = el('span', 'text-body', label);
    b.append(i, span);
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const paused = o.paused();
    const live = !paused && o.running();

    const head = el('div', 'card-header d-flex align-items-center justify-content-between gap-2');
    const title = el('span', 'fw-semibold', o.t('controls.title', 'Weather'));
    const x = el('button', 'btn-close');
    x.type = 'button';
    x.setAttribute('aria-label', o.t('controls.close', 'Close'));
    x.addEventListener('click', close);
    head.append(title, x);

    const list = el('div', 'list-group list-group-flush');
    list.append(
      action(paused ? 'fa-play' : 'fa-pause', paused ? o.t('controls.resume', 'Turn the weather on') : o.t('controls.pause', 'Turn the weather off'), () => {
        o.onPause(!paused);
        close();
      }),
    );
    if (live && o.trees) {
      list.append(
        action('fa-tree', o.t('controls.plant-tree', 'Plant a tree'), () => {
          o.send({ type: 'plant-tree' });
          close();
        }),
      );
    }

    const parts = [head, list];

    if (live && o.decorations) {
      const body = el('div', 'card-body p-2 border-top');
      body.append(el('div', 'small text-body-secondary mb-2 px-1', o.t('controls.decorate', 'Decorate')));
      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(4, 1fr);gap:6px';
      for (const kind of DECOR_KINDS) {
        const name = o.t(kind.key, kind.label);
        const b = el('button', 'btn btn-outline-secondary p-1 d-flex align-items-center justify-content-center');
        b.type = 'button';
        b.title = name;
        b.setAttribute('aria-label', name);
        let icon = icons.get(kind.id);
        if (!icon) {
          icon = decorIcon(kind.id, 34);
          icon.style.pointerEvents = 'none';
          icons.set(kind.id, icon);
        }
        b.append(icon);
        b.addEventListener('click', () => {
          o.send({ type: 'add-decor', kind: kind.id });
          close();
        });
        grid.append(b);
      }
      body.append(grid);
      parts.push(body);
    }

    if (live) {
      const foot = el('div', 'card-footer d-flex justify-content-end py-2');
      const clear = el('button', 'btn btn-sm btn-link text-danger text-decoration-none');
      clear.type = 'button';
      clear.append(el('i', 'fa-solid fa-broom me-1'), document.createTextNode(o.t('controls.clear', 'Clear everything')));
      clear.addEventListener('click', () => {
        o.send({ type: 'clear' });
        close();
      });
      foot.append(clear);
      parts.push(foot);
    }

    card.replaceChildren(...parts);
  }

  toggle.addEventListener('click', () => {
    if (card.hidden) {
      render();
      card.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
    } else close();
  });
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const onDown = (e) => {
    if (!card.hidden && !(e.target instanceof Element && root.contains(e.target))) close();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onDown, true);

  root.append(card, notice, toggle);

  return {
    el: root,
    close,
    /** @param {string} text */
    notice(text) {
      notice.textContent = text;
      notice.hidden = false;
      clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => (notice.hidden = true), 4000);
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      clearTimeout(noticeTimer);
      root.remove();
    },
  };
}
