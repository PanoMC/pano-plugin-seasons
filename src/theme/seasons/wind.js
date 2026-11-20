// Wind (Frostpane's fp-core wind.rs). Units: CSS px per second, negative = to the left.

/**
 * Target speed of a wind setting at time `t` (seconds).
 *
 * @param {string} wind
 * @param {number} t
 */
export function windSpeed(wind, t) {
  switch (wind) {
    case 'gentleLeft':
      return -45;
    case 'strongLeft':
      return -120;
    case 'gentleRight':
      return 45;
    case 'strongRight':
      return 120;
    case 'changing': {
      const v = 0.55 * Math.sin(0.019 * t) + 0.35 * Math.sin(0.0071 * t + 2.1) + 0.25 * Math.sin(0.043 * t + 0.7);
      return Math.max(-1, Math.min(1, v)) * 130;
    }
    default:
      return 0;
  }
}

/** Natural breeze, always present (snow-sim 3.4). */
export function breezeSpeed(t) {
  return 10 * Math.sin(0.07 * t) + 6 * Math.sin(0.19 * t + 1.7) + 3 * Math.sin(0.43 * t + 4.1);
}

/** Gust factor at clock `c`. */
export function gust(c) {
  return 0.3 * Math.sin(0.31 * c) + 0.2 * Math.sin(0.83 * c + 1.4) + 0.5 * Math.max(0, Math.sin(0.12 * c + 0.5)) ** 4;
}

/** Low-passed user wind with gusts (Frostpane's `Blow`). */
export class Blow {
  constructor(strength = 1) {
    this.strength = strength;
    this.steady = 0;
    this.speed = 0;
    this.carried = 0;
  }

  /**
   * @param {number} dt
   * @param {number} clock
   * @param {string} wind
   */
  step(dt, clock, wind) {
    this.steady += (windSpeed(wind, clock) * this.strength - this.steady) * Math.min(dt * 0.6, 1);
    this.speed = this.steady * (0.85 + gust(clock));
    this.carried += this.speed * dt;
  }
}
