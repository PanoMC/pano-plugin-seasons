// Which weather shows (Frostpane's weather sources: manual, outside, random, season).

import { WEATHERS } from './config.js';

/** Northern-hemisphere season table, index = month (0 = January). */
const NORTH = ['snow', 'snow', 'sakura', 'sakura', 'sakura', 'rain', 'fireflies', 'starfall', 'leaves', 'leaves', 'leaves', 'snow'];

/** Random and season picks change every 3 h (Frostpane's mode period). */
export const MODE_PERIOD_MS = 3 * 3600 * 1000;

/**
 * Season pick for a date; the south is six months off.
 *
 * @param {Date} date
 * @param {boolean} south
 */
export function seasonWeather(date, south) {
  return NORTH[(date.getMonth() + (south ? 6 : 0)) % 12];
}

/** Guess the hemisphere from the visitor's time zone when no city is set. */
export function southFromTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return /^(Australia|Antarctica|America\/Argentina)\/|^(America\/(Sao_Paulo|Santiago|Montevideo|Asuncion|La_Paz|Lima|Buenos_Aires)|Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate|Port_Moresby)|Africa\/(Johannesburg|Maseru|Mbabane|Windhoek|Gaborone|Harare|Lusaka|Maputo|Blantyre|Luanda|Dar_es_Salaam)|Indian\/(Mauritius|Reunion|Antananarivo))$/.test(
      tz,
    );
  } catch {
    return false;
  }
}

/** A stable 32-bit hash, so every visitor gets the same random pick in the same 3 h window. */
function hash(n) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Random pick for the 3 h window that holds `now`: uniform over the pool, never the previous window's pick (when the
 * pool has more than one weather).
 *
 * @param {string[]} pool
 * @param {number} now
 */
export function randomWeather(pool, now = Date.now()) {
  const list = pool.length ? pool : [...WEATHERS];
  const slot = Math.floor(now / MODE_PERIOD_MS);
  const pick = (s) => list[hash(s) % list.length];
  if (list.length < 2) return list[0];
  const prev = pick(slot - 1);
  let cur = pick(slot);
  if (cur === prev) cur = list[(list.indexOf(cur) + 1 + (hash(slot * 7 + 3) % (list.length - 1))) % list.length];
  return cur;
}

/**
 * @typedef {{weather: string|null, heavy: boolean, lightning: boolean}} Shown
 */

/**
 * The weather to show now.
 *
 * @param {import('./config.js').SeasonsConfig} c
 * @param {{weather: string|null, heavy: boolean, lightning: boolean}|null} outside the backend's answer for OUTSIDE
 * @param {Date} [date]
 * @returns {Shown}
 */
export function shownWeather(c, outside, date = new Date()) {
  const south = c.city ? c.city.latitude < 0 : southFromTimeZone();
  switch (c.source) {
    case 'OUTSIDE':
      if (!outside) return { weather: seasonWeather(date, south), heavy: false, lightning: false };
      return { weather: outside.weather, heavy: !!outside.heavy, lightning: !!outside.lightning };
    case 'RANDOM':
      return { weather: randomWeather(c.randomPool, date.getTime()), heavy: c.heavySnow, lightning: c.lightning };
    case 'SEASON':
      return { weather: seasonWeather(date, south), heavy: c.heavySnow, lightning: c.lightning };
    default:
      return { weather: c.weather, heavy: c.heavySnow, lightning: c.lightning };
  }
}
