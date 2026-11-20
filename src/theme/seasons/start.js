// Entry point of the engine: builds the host and the layers the settings switch on.

import { createHost } from './host.js';
import { createWallpaper } from './layers/wallpaper.js';
import { createRain } from './layers/rain.js';
import { createPetals } from './layers/petals.js';
import { createFireflies } from './layers/fireflies.js';
import { createStarfall } from './layers/starfall.js';
import { createSnow } from './layers/snow.js';
import { createTrees } from './layers/trees.js';
import { createDecor } from './layers/decor.js';
import { createSnowballs } from './layers/snowballs.js';
import { createVisitors } from './layers/visitors.js';

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   back?: HTMLCanvasElement|null,
 *   config: import('./config.js').SeasonsConfig,
 *   shown: import('./weather.js').Shown,
 *   touch?: boolean,
 *   debug?: boolean,
 * }} opts
 */
export function startSeasons(opts) {
  const { config } = opts;
  const host = createHost(opts);

  if (config.wallpaper && opts.back) host.add(createWallpaper(host));
  host.add(createStarfall(host));
  host.add(createFireflies(host));
  host.add(createPetals(host));
  host.add(createRain(host));
  host.add(createSnow(host));
  if (config.trees) host.add(createTrees(host));
  if (config.decorations) host.add(createDecor(host));
  if (config.snowballs) host.add(createSnowballs(host));
  if (config.visitors) host.add(createVisitors(host));

  if (host.debug) /** @type {any} */ (window).__seasons = host;
  return host;
}
