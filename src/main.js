import { PanoPlugin, viewComponent } from '@panomc/sdk';
import { derived } from 'svelte/store';
import { _ as i18n } from '@panomc/sdk/utils/language';
import { api } from '@panomc/sdk/plugin-api';
import { showToast } from '@panomc/sdk/toasts';
import { get } from 'svelte/store';
import { mountPanelSeasons } from './panel/panelSeasons.js';

const pluginId = 'pano-plugin-seasons';

/** Texts of this plugin: `$_('settings.title')` reads `plugins.pano-plugin-seasons.settings.title`. */
export const _ = derived(i18n, ($_fn) => {
  return (key, options) => $_fn(`plugins.${pluginId}.${key}`, options);
});

export function showSuccessToast(text, params = {}) {
  return showToast(text, params, undefined, { variant: 'success' });
}

export function showErrorToast(text, params = {}) {
  return showToast(text, params, undefined, { variant: 'danger' });
}

export default class SeasonsPlugin extends PanoPlugin {
  onLoad() {
    const pano = this.pano;

    if (pano.isPanel) {
      // The settings live on the plugin's detail page.
      pano.ui.addon.onLoad(async (data, event) => {
        if (data.addon.id !== pluginId) return;

        try {
          data.addon.config = await api.panel.get({ path: '/config', request: event });
        } catch (e) {
          console.error(`[${pluginId}] Failed to load config`, e);
        }
      });

      // The weather in the panel too (when "Show in the panel" is on).
      if (typeof window !== 'undefined') {
        mountPanelSeasons({
          translate: (key) => {
            const full = `plugins.${pluginId}.engine.${key}`;
            const text = get(i18n)(full);
            return text && text !== full ? text : null;
          },
        });
      }

      pano.ui.hook.register({
        name: `panel:plugin-detail:content:${pluginId}`,
        component: viewComponent(() => import('./panel/SeasonsSettings.svelte')),
        permission: `pano.plugin.${pluginId}.manage.seasons`,
      });
    } else {
      // Every site page gets the settings; the overlay (src/theme/views/Seasons.svelte) mounts on `theme:top`.
      pano.ui.app.onLoad(async (data, event) => {
        try {
          data.seasonsConfig = await api.get({ path: '/config', request: event });
        } catch (e) {
          console.error(`[${pluginId}] Failed to load config`, e);
        }
      });
    }
  }

  onContextUpdate(ctx) {}

  onUnload() {}
}
