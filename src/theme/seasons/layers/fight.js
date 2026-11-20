// The grumpy snowmen fight: a port of Frostpane's `fp-fight` (story generator, bout runtime, panel art) with the
// fighter rig of `fp-snowman/puppet.rs`. Two snowmen pop out of the snow, notice each other and play out a generated
// story (snowball volleys, dodges, shoves, a snow wall, a chase, a taunt, a white flag and a backstab) until one of
// them crumbles into a mound; the winner leaves with one of four endings (flee, dance, steal the hat, mourn).
//
// Cut down from the Rust: one floor line per bout, no plough panic (one visitor at a time on the web), randomness
// from Math.random (no seeded replay).
//
// Coordinates inside a bout are Y-up points above the floor line (as in the Rust); `draw` flips them onto the
// viewport.

const PI = Math.PI;
const TAU = PI * 2;
const RIG_HEIGHT = 58;
const MAX_SPECKS = 56;
const LINGER = 1.3;
const FADE = 0.6;
const EDGE = 24;
const TOSS_TIME = 0.7;

const rand = (a, b) => a + Math.random() * (b - a);
const below = (n) => Math.floor(Math.random() * n);
const coin = () => Math.random() < 0.5;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** Smoothstep. */
const ease = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Sine arc 0 -> 1 -> 0. */
const arc = (x) => Math.sin(PI * clamp(x, 0, 1));
const mix = (a, b, p) => a + (b - a) * clamp(p, 0, 1);

// ---- story (snowman-fight 3) ---------------------------------------------------------------------------------------

export const VARIANTS = /** @type {const} */ (['quick', 'long', 'both', 'backstab']);
const GAIT = { waddle: 78, trot: 140, run: 240, tiptoe: 105, backward: 130 };
/** pull_back, through, wind_lean, follow_lean, speed, hand, arc */
const STYLE = {
  overhand: [0.8, -1.2, -0.22, 0.28, 1.0, 42, 0.22],
  sidearm: [1.7, -1.75, -0.14, 0.32, 1.25, 30, 0.08],
  lob: [2.7, -0.7, 0.12, 0.05, 0.72, 24, 0.5],
  hopping: [0.9, -1.2, -0.2, 0.28, 1.0, 54, 0.22],
  spin: [0.8, -1.3, -0.22, 0.28, 1.1, 42, 0.16],
};
const STYLES = Object.keys(STYLE);
const style = (name) => {
  const [pullBack, through, windLean, followLean, speed, hand, arcK] = STYLE[name];
  return { pullBack, through, windLean, followLean, speed, hand, arc: arcK };
};

// Moves are plain objects `{k, ...}`; shared between both lists where the Rust clones them (they are never mutated).
const M = {
  offstage: (t) => ({ k: 'offstage', t }),
  rise: { k: 'rise' },
  walk: (to, gait, look = null, sign = null) => ({ k: 'walk', to, gait, look, sign }),
  wait: (t, look = null, sign = null, tremble = false) => ({ k: 'wait', t, look, sign, tremble }),
  jump: (look = null, sign = null) => ({ k: 'jump', look, sign }),
  turn: (away) => ({ k: 'turn', away }),
  scoop: { k: 'scoop' },
  windUp: (face) => ({ k: 'windup', face }),
  release: (aim) => ({ k: 'release', aim }),
  brace: (react) => ({ k: 'brace', react }),
  dropBall: { k: 'dropball' },
  shove: { k: 'shove' },
  stumble: (to) => ({ k: 'stumble', to }),
  getUp: { k: 'getup' },
  crumble: { k: 'crumble' },
  flagOut: { k: 'flagout' },
  flagAway: { k: 'flagaway' },
  build: (at, t) => ({ k: 'build', at, t }),
  grabHat: { k: 'grabhat' },
  dive: { k: 'dive' },
  /** Moves that only run for a time: lie, stagger, cheer, dance, taunt, mourn, wave, handshake, hide, peek, pant. */
  timed: (k, t) => ({ k, t }),
};
const T = M.timed;
const SHOCK = 'shock';
const ALERT = 'alert';

/**
 * Generate a story for one variant.
 *
 * @param {string} variant
 * @param {{min: number, max: number, scale: number, avoid: string|null}} p
 */
export function story(variant, p) {
  const { min, max, scale } = p;
  const width = max - min;
  const gap = Math.min(width * 0.55, rand(170, 230));
  const slack = width / 2 - gap / 2 - 44;
  const centre = (min + max) / 2 + (slack > 0 ? rand(-slack, slack) : 0);
  const at = [centre - gap / 2, centre + gap / 2];
  const spawn = [Math.max(at[0] - rand(90, 170), min + 24), Math.min(at[1] + rand(90, 170), max - 24)];
  /** @type {any[][][]} */
  const acts = [];
  let ending = null;

  const act = (a, b) => acts.push([a, b]);
  const duo = (who, mine, theirs) => (who === 0 ? act(mine, theirs) : act(theirs, mine));
  const bothDo = (list) => act(list, list);
  const toward = (i) => (at[1 - i] > at[i] ? 1 : -1);
  const fit = (x) => Math.max(min + 24, Math.min(max - 24, x));
  const mood = () => ['happy', 'angry', 'sly'][below(3)];
  const miss = () =>
    [
      ['over', 'duck'],
      ['over', 'spin'],
      ['under', 'hop'],
      ['low', 'lean'],
      ['wide', 'watch'],
      ['shy', 'flinch'],
    ][below(6)];

  function arrive() {
    const late = below(2);
    const delay = rand(0.3, 1.0);
    const r = below(4);
    const list = (i) => [M.offstage(i === late ? delay : 0), M.rise, M.walk(at[i], r === i ? 'trot' : 'waddle')];
    act(list(0), list(1));
  }

  function notice(a) {
    if (coin()) bothDo([M.jump(SHOCK, ALERT), M.wait(0.45)]);
    else duo(a, [M.jump(SHOCK, ALERT), M.wait(0.4, 'angry')], [M.wait(0.55, null, 'question'), M.jump(SHOCK, ALERT)]);
  }

  function dodged(a) {
    const [aim, react] = miss();
    duo(a, [M.scoop, M.windUp(mood()), M.release(aim)], [M.brace(react)]);
    switch (below(4)) {
      case 0:
        duo(a, [M.wait(0.4, 'angry', null, true)], [T('cheer', 0.5)]);
        break;
      case 1:
        duo(a, [M.wait(0.45, 'sad', 'question')], [M.jump('happy')]);
        break;
      case 2:
        duo(a, [M.jump('angry')], [M.wait(0.35, 'sly')]);
        break;
    }
  }

  function volley(a) {
    if (below(4) === 0) {
      duo(
        a,
        [M.scoop, M.windUp('angry'), M.release('short'), M.wait(0.55, 'sad', 'question')],
        [M.wait(1.1), T('cheer', 0.7)],
      );
    } else {
      dodged(a);
    }
    dodged(1 - a);
  }

  function shove(a) {
    const b = 1 - a;
    const dir = toward(a);
    const home = at[a];
    const goal = at[b] - dir * 30 * scale;
    duo(a, [M.walk(goal, 'trot', 'angry')], [M.wait(0.5, null, 'question'), M.wait(0.2, SHOCK, ALERT)]);
    const stumble = fit(at[b] + dir * 46);
    duo(a, [M.shove], [M.wait(0.14), M.stumble(stumble)]);
    duo(a, [T('cheer', 0.8)], [T('lie', 1.0)]);
    duo(b, [M.getUp, M.jump('angry')], [M.wait(0.6, SHOCK, ALERT)]);
    duo(a, [M.walk(home, 'backward', SHOCK)], [M.scoop]);
    const [aim, react] = miss();
    duo(b, [M.windUp('angry'), M.release(aim)], [M.brace(react)]);
    at[b] = stumble;
  }

  function hide(a) {
    const dir = toward(a);
    const wall = at[a] + dir * 26 * scale;
    duo(
      a,
      [M.jump(SHOCK, ALERT), M.build(wall, 0.9), T('hide', 0.5)],
      [M.wait(0.9, null, 'question'), M.wait(0.5, 'angry')],
    );
    duo(1 - a, [M.scoop, M.windUp(mood()), M.release('wall')], [M.brace('crouch')]);
    duo(a, [T('peek', 0.95)], [M.wait(0.95, 'angry', null, true)]);
    duo(1 - a, [M.scoop, M.windUp('angry'), M.release('wall')], [M.brace('crouch')]);
    duo(a, [M.wait(0.5, SHOCK, ALERT)], [T('cheer', 0.5)]);
  }

  function chase(a) {
    const b = 1 - a;
    const dir = toward(a);
    const [homeA, homeB] = [at[a], at[b]];
    const far = fit(homeB + dir * 120);
    duo(a, [M.jump('angry')], [M.wait(0.35, SHOCK, ALERT)]);
    duo(a, [M.walk(far - dir * 58, 'run', 'angry')], [M.walk(far, 'run', SHOCK, ALERT)]);
    duo(a, [M.wait(0.3), M.wait(0.35, SHOCK, ALERT)], [M.wait(0.3), M.jump('angry')]);
    duo(a, [M.walk(homeA, 'run', SHOCK, ALERT)], [M.walk(homeB, 'run', 'angry')]);
  }

  function taunt(a) {
    duo(a, [M.turn(true), T('taunt', 1.2)], [M.wait(0.6, null, 'question'), M.wait(0.65, 'angry', null, true)]);
    duo(
      1 - a,
      [M.scoop, M.windUp('angry'), M.release('under')],
      [M.brace('hop'), M.turn(false), M.wait(0.4, SHOCK, ALERT)],
    );
  }

  function finish(w) {
    const l = 1 - w;
    const to = at[l] < at[w] ? max - 24 : min + 24;
    const to2 = at[w] - min < max - at[w] ? min + 24 : max - 24;
    const options = ['flee', 'dance', 'stealHat', 'mourn'].filter((e) => e !== p.avoid);
    ending = options[below(options.length)];
    const side = at[w] < at[l] ? -1 : 1;
    let list;
    if (ending === 'flee') list = [T('cheer', 0.5), M.wait(0.75, SHOCK, ALERT, true), M.walk(to, 'run', SHOCK, ALERT)];
    else if (ending === 'dance') list = [T('dance', 1.4), M.walk(to2, 'trot', 'happy')];
    else if (ending === 'stealHat') {
      list = [
        T('cheer', 0.5),
        M.wait(0.55, 'sly'),
        M.walk(at[l] + side * 15 * scale, 'waddle', 'sly'),
        M.grabHat,
        T('cheer', 0.5),
        M.walk(to2, 'trot', 'happy'),
      ];
    } else list = [M.wait(0.8, SHOCK, ALERT), T('mourn', 1.5), M.walk(to2, 'trot', 'sad')];
    list.push(M.dive);
    duo(w, list, [M.crumble]);
  }

  function kill(a) {
    duo(a, [M.scoop, M.windUp('angry'), M.release('head')], [M.brace('take')]);
    finish(a);
  }

  arrive();
  const a = below(2);
  if (variant === 'quick') {
    if (coin()) {
      bothDo([M.wait(1.0, 'angry')]);
      duo(a, [M.scoop, M.windUp('angry'), M.release('head')], [M.scoop, M.brace('take')]);
      finish(a);
    } else {
      duo(a, [M.wait(0.5, 'sly')], [T('handshake', 0.7)]);
      kill(a);
    }
  } else if (variant === 'long') {
    notice(a);
    const order = [0, 1, 2, 3, 4];
    for (let i = order.length - 1; i > 0; i--) {
      const j = below(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const used = order.slice(0, below(3) === 0 ? 3 : 2);
    if (!used.includes(0)) used[0] = 0;
    let actor = a;
    for (const which of used) {
      [volley, shove, hide, chase, taunt][which](actor);
      if (coin()) actor = 1 - actor;
    }
    if (below(3) === 0) bothDo([T('pant', 1.1)]);
    kill(below(2));
  } else if (variant === 'both') {
    notice(a);
    if (coin()) dodged(a);
    const shot = (end) => [M.scoop, M.windUp('angry'), M.release('head'), M.brace('take'), end];
    if (coin()) {
      bothDo([M.wait(0.8, 'angry')]);
      bothDo(shot(M.crumble));
    } else {
      duo(
        a,
        [M.scoop, M.windUp('angry'), M.release('head'), M.brace('cheer'), M.crumble],
        [M.brace('take'), T('stagger', 0.8), M.windUp('dizzy'), M.release('head'), M.crumble],
      );
    }
  } else {
    // backstab: a white flag, a handshake, a snowball in the back.
    const b = 1 - a;
    const dir = toward(a);
    notice(a);
    duo(
      a,
      [M.scoop, M.wait(0.35, 'angry'), M.dropBall, M.flagOut, T('wave', 1.5)],
      [M.scoop, M.wait(0.6, 'angry'), M.wait(1.5, null, 'question')],
    );
    duo(b, [M.dropBall, M.jump('happy', 'heart')], [T('wave', 0.75)]);
    const mid = (at[0] + at[1]) / 2;
    const [ga, gb] = [mid - dir * 15 * scale, mid + dir * 15 * scale];
    duo(a, [M.walk(ga, 'waddle', 'sad')], [M.walk(gb, 'waddle', 'happy')]);
    at[a] = ga;
    at[b] = gb;
    bothDo([T('handshake', 1.3)]);
    const away = fit(at[b] + dir * 72);
    duo(
      b,
      [M.turn(true), M.walk(away, 'waddle', 'happy'), M.brace('take')],
      [M.wait(0.55, 'sly'), M.flagAway, M.wait(0.2, 'sly'), M.scoop, M.windUp('sly'), M.release('head')],
    );
    at[b] = away;
    const edge = at[a] - min < max - at[a] ? min + 24 : max - 24;
    duo(a, [T('cheer', 0.6), M.wait(0.5, 'sly'), M.walk(edge, 'tiptoe', 'sly'), M.dive], [M.crumble]);
  }
  return { acts, spawn, stand: at, ending };
}

// ---- bout (snowman-fight 4, 5.1) -----------------------------------------------------------------------------------

/** Fixed duration of the moves that run for a set time. */
function span(r, mv) {
  switch (mv.k) {
    case 'rise':
      return 0.45;
    case 'jump':
      return 0.3;
    case 'release':
      return 0.26;
    case 'dropball':
    case 'shove':
      return 0.3;
    case 'getup':
    case 'dive':
      return 0.38;
    case 'flagout':
    case 'flagaway':
      return 0.25;
    case 'windup':
      return r.windTime;
    default:
      return mv.t ?? 0;
  }
}

function flightPos(fl) {
  const p = clamp(fl.age / fl.time, 0, 1);
  const [a, b, c] = [fl.start, fl.through, fl.end];
  const x = a.x + (c.x - a.x) * p;
  const d0 = (a.x - b.x) * (a.x - c.x);
  const d1 = (b.x - a.x) * (b.x - c.x);
  const d2 = (c.x - a.x) * (c.x - b.x);
  let y;
  if (Math.abs(d0) < 1e-6 || Math.abs(d1) < 1e-6 || Math.abs(d2) < 1e-6) y = a.y + (c.y - a.y) * p;
  else y = (a.y * (x - b.x) * (x - c.x)) / d0 + (b.y * (x - a.x) * (x - c.x)) / d1 + (c.y * (x - a.x) * (x - b.x)) / d2;
  return { x, y };
}

function flightApex(fl) {
  const d = fl.end.x - fl.start.x;
  return Math.abs(d) < 1e-9 ? 0.5 : (fl.through.x - fl.start.x) / d;
}

function tossPos(t) {
  const k = t.age / TOSS_TIME;
  return { x: t.x + t.dir * 55 * k, y: t.y * (1 - k) + arc(k) * 55 };
}

/**
 * Start a bout.
 *
 * @param {{min: number, max: number, scale: number, variant?: string|null, prevVariant?: string|null, avoid?: string|null}} o
 *   `min`/`max` the range in viewport x, `scale` fighter height / 58.
 */
export function createBout(o) {
  let variant = o.variant;
  if (!variant || !VARIANTS.includes(/** @type {any} */ (variant))) {
    const options = VARIANTS.filter((v) => v !== o.prevVariant);
    variant = options[below(options.length)];
  }
  const { min, max, scale } = o;
  const plan = story(variant, { min, max, scale, avoid: o.avoid ?? null });
  const rig = (i, moves) => ({
    x: plan.spawn[i],
    size: rand(0.9, 1.08) * scale,
    pace: rand(0.9, 1.12),
    lastWay: i === 0 ? 1 : -1,
    moves,
    idx: 0,
    clock: 0,
    begun: false,
    gone: false,
    turned: false,
    holding: false,
    flag: false,
    targeted: false,
    hatFrom: null,
    pileAt: null,
    wornBy: null,
    walked: 0,
    scoopTime: 0.42,
    windTime: 0.34,
    flair: 1,
    style: 'overhand',
    from: plan.spawn[i],
    sweatAt: -1,
  });
  const b = {
    variant,
    ending: plan.ending,
    acts: plan.acts,
    act: 0,
    age: 0,
    endedAt: /** @type {number|null} */ (null),
    f: [rig(0, plan.acts[0][0]), rig(1, plan.acts[0][1])],
    flights: /** @type {any[]} */ ([]),
    specks: /** @type {any[]} */ (new Array(MAX_SPECKS).fill(null)),
    nextSpeck: 0,
    toss: /** @type {any} */ (null),
    wallX: 0,
    wallHeight: 0,
    scale,
    min,
    max,
    /** Mounds left behind (viewport x, size), for the caller to turn into ground snow. */
    deaths: /** @type {{x: number, size: number}[]} */ ([]),
  };
  return b;
}

const current = (r) => r.moves[r.idx] ?? null;
const offstage = (r) => current(r)?.k === 'offstage';
const visible = (r) => !r.gone && !offstage(r);

export function fading(b) {
  return b.endedAt == null ? 0 : ease((b.age - b.endedAt - LINGER) / FADE);
}

export function finished(b) {
  return b.endedAt != null && b.age > b.endedAt + LINGER + FADE;
}

function pushSpeck(b, s) {
  b.specks[b.nextSpeck] = s;
  b.nextSpeck = (b.nextSpeck + 1) % MAX_SPECKS;
}

/** Upward fan of white specks. */
function puff(b, x, y, count, speed) {
  for (let n = 0; n < count; n++) {
    const angle = rand(0.15, PI - 0.15);
    const v = rand(0.3, 1) * speed;
    const life = rand(0.3, 0.65);
    pushSpeck(b, { x, y, dx: Math.cos(angle) * v, dy: Math.sin(angle) * v, size: rand(2, 4.5), life, total: life, sweat: false });
  }
}

function sweat(b, i) {
  const r = b.f[i];
  if (b.age - r.sweatAt < 0.1) return;
  r.sweatAt = b.age;
  const way = -pose(b, i).way;
  pushSpeck(b, {
    x: r.x + way * 7 * r.size,
    y: 46 * r.size,
    dx: way * rand(30, 80),
    dy: rand(50, 110),
    size: rand(2, 3),
    life: 0.35,
    total: 0.35,
    sweat: true,
  });
}

function land(b, fl) {
  const { x, y } = fl.end;
  if (fl.land === 'head') puff(b, x, y, 14, 110);
  else if (fl.land === 'wall') {
    b.wallHeight = b.wallHeight > 0.6 ? 0.5 : 0;
    if (b.wallHeight > 0) puff(b, x, y, 10, 80);
    else puff(b, x, y, 20, 130);
  } else if (fl.land === 'drop') puff(b, x, 1, 4, 40);
  else puff(b, x, y, 8, 70);
}

function launch(b, i, aim) {
  const me = b.f[i];
  const op = b.f[1 - i];
  const dir = op.x >= me.x ? 1 : -1;
  const st = style(me.style);
  const [size, osz, ox, mx] = [me.size, op.size, op.x, me.x];
  const start = { x: mx + dir * 14 * size, y: st.hand * size };
  const mid = (x) => (start.x + x) / 2;
  const dx = Math.abs(ox - start.x);
  let target = 1 - i;
  let through;
  let end;
  let kind = 'plain';
  if (aim === 'head') {
    end = { x: ox - dir * 7 * osz, y: 40 * osz };
    through = { x: mid(end.x), y: 40 * size + dx * st.arc };
    kind = 'head';
  } else if (aim === 'over') {
    end = { x: ox + dir * rand(35, 75), y: 0 };
    through = { x: ox, y: rand(44, 54) * osz };
  } else if (aim === 'under') {
    end = { x: ox + dir * rand(24, 50), y: 0 };
    through = { x: ox, y: rand(8, 13) * osz };
  } else if (aim === 'low') {
    end = { x: ox + dir * rand(40, 70), y: 0 };
    through = { x: ox, y: rand(34, 40) * osz };
  } else if (aim === 'wide') {
    end = { x: ox + dir * rand(70, 110), y: 0 };
    through = { x: ox, y: rand(76, 92) * osz };
  } else if (aim === 'shy') {
    end = { x: ox - dir * rand(16, 30), y: 0 };
    through = { x: mid(end.x), y: 42 * size + dx * st.arc * 0.7 };
  } else if (aim === 'short') {
    target = -1;
    end = { x: mx + dir * Math.abs(ox - mx) * 0.5, y: 0 };
    through = { x: mid(end.x), y: 42 * size + 16 };
  } else {
    end = { x: b.wallX, y: 20 * b.scale };
    through = { x: mid(end.x), y: 40 * size + Math.abs(b.wallX - start.x) * 0.2 };
    kind = 'wall';
  }
  const time = Math.max(0.05, Math.abs(end.x - start.x) / (430 * st.speed * rand(0.92, 1.08)));
  b.flights.push({ start, through, end, age: 0, time, target, land: kind, size: b.scale * rand(0.9, 1.2) });
  if (target >= 0) b.f[target].targeted = true;
}

function dropBall(b, i) {
  const r = b.f[i];
  const way = pose(b, i).way;
  const start = { x: r.x + way * 15 * r.size, y: 24 * r.size };
  b.flights.push({
    start,
    through: { x: start.x + way * 3, y: start.y - 8 * r.size },
    end: { x: start.x + way * 8, y: 0 },
    age: 0,
    time: 0.24,
    target: -1,
    land: 'drop',
    size: b.scale,
  });
}

function die(b, i) {
  const r = b.f[i];
  r.pileAt = b.age;
  r.gone = true;
  r.holding = false;
  r.flag = false;
  puff(b, r.x, 22 * r.size, 26, 150);
  b.deaths.push({ x: r.x, size: r.size });
}

function beginMove(b, i, mv) {
  const r = b.f[i];
  const x = r.x;
  switch (mv.k) {
    case 'rise':
      puff(b, x, 3, 8, 60);
      break;
    case 'scoop':
      r.scoopTime = rand(0.36, 0.5);
      break;
    case 'windup':
      r.windTime = rand(0.26, 0.42);
      r.holding = true;
      r.style = STYLES[below(STYLES.length)];
      break;
    case 'release':
      r.holding = false;
      launch(b, i, mv.aim);
      break;
    case 'brace':
      r.flair = rand(0.85, 1.15);
      break;
    case 'dropball':
      r.holding = false;
      dropBall(b, i);
      break;
    case 'stumble':
      r.from = x;
      puff(b, x, 8, 8, 70);
      break;
    case 'turn':
      r.turned = mv.away;
      break;
    case 'build':
      b.wallX = mv.at;
      b.wallHeight = 0;
      break;
    case 'crumble':
      r.hatFrom = b.age;
      break;
    case 'dive':
      puff(b, x, 3, 10, 80);
      break;
    case 'flagout':
      r.flag = true;
      break;
    case 'flagaway': {
      r.flag = false;
      const way = pose(b, i).way;
      b.toss = { x: x + way * 14 * r.size, y: 40 * r.size, dir: -way, age: 0 };
      break;
    }
  }
}

/** One frame of the current move; true when it ended. */
function updateMove(b, i, mv, dt) {
  const r = b.f[i];
  const c = r.clock;
  switch (mv.k) {
    case 'walk': {
      const dist = mv.to - r.x;
      const step = Math.min(Math.abs(dist), GAIT[mv.gait] * r.pace * dt);
      r.x += Math.sign(dist) * step;
      r.walked += step;
      if (mv.gait === 'run') sweat(b, i);
      return Math.abs(mv.to - r.x) < 0.5;
    }
    case 'brace': {
      const free = !b.flights.some((fl) => fl.target === i);
      const over = r.targeted && free;
      if (over) r.targeted = false;
      return over;
    }
    case 'scoop':
      if (c > 0.52 * r.scoopTime) r.holding = true;
      return c >= r.scoopTime;
    case 'stumble':
      r.x = mix(r.from, mv.to, ease(c / 0.38));
      return c >= 0.42;
    case 'pant':
      sweat(b, i);
      return c >= mv.t;
    case 'build':
      b.wallHeight = clamp(c / mv.t, 0, 1);
      if (c % 0.25 < dt) puff(b, b.wallX, 4, 3, 50);
      return c >= mv.t;
    case 'grabhat':
      if (c > 0.25) {
        const j = b.f.findIndex((f) => f.pileAt != null);
        if (j >= 0) b.f[j].wornBy = i;
      }
      return c >= 0.5;
    case 'crumble':
      if (c >= 0.5) {
        die(b, i);
        return true;
      }
      return false;
    default:
      return c >= span(r, mv);
  }
}

function run(b, i, dt) {
  const r = b.f[i];
  const mv = current(r);
  if (!mv) return;
  if (!r.begun) {
    r.begun = true;
    r.clock = 0;
    beginMove(b, i, mv);
  }
  r.clock += dt;
  if (updateMove(b, i, mv, dt)) {
    if (mv.k === 'dive') r.gone = true;
    r.idx += 1;
    r.clock = 0;
    r.begun = false;
  }
}

/** One frame. */
export function stepBout(b, dt) {
  dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
  b.age += dt;
  for (const s of b.specks) {
    if (!s) continue;
    s.life -= dt;
    s.dy -= 420 * dt;
    s.x += s.dx * dt;
    s.y = Math.max(1, s.y + s.dy * dt);
  }
  for (let k = 0; k < b.specks.length; k++) if (b.specks[k] && b.specks[k].life <= 0) b.specks[k] = null;
  if (b.toss) {
    b.toss.age += dt;
    if (b.toss.age >= TOSS_TIME) b.toss = null;
  }
  const done = [];
  for (const fl of b.flights) fl.age += dt;
  b.flights = b.flights.filter((fl) => (fl.age >= fl.time ? (done.push(fl), false) : true));
  for (const fl of done) land(b, fl);
  run(b, 0, dt);
  run(b, 1, dt);
  if (b.endedAt == null && b.f.every((r) => r.idx >= r.moves.length)) {
    b.act += 1;
    const next = b.acts[b.act];
    if (next) {
      for (let i = 0; i < 2; i++) {
        const r = b.f[i];
        r.moves = next[i];
        r.idx = 0;
        r.clock = 0;
        r.begun = false;
      }
    } else {
      b.endedAt = b.age;
    }
  }
  for (let i = 0; i < 2; i++) {
    const dx = b.f[1 - i].x - b.f[i].x;
    if (Math.abs(dx) > 1) b.f[i].lastWay = Math.sign(dx);
  }
}

const arms = (p, front) => {
  p.front = front;
  p.back = -front;
};

function cheerPose(p, c, s) {
  p.face = 'happy';
  p.lift = Math.abs(Math.sin(14 * c)) * 10 * s;
  arms(p, -0.6 + 0.25 * Math.sin(24 * c));
}

function crouchPose(p) {
  p.squash = 0.5;
  p.wide = 1.04;
  arms(p, -0.9);
  p.face = SHOCK;
}

/** What fighter `i` looks like this frame. */
function pose(b, i) {
  const f = b.f[i];
  const phase = b.age + 0.37 * i;
  const s = f.size;
  const p = {
    x: f.x,
    way: f.turned ? -f.lastWay : f.lastWay,
    lift: 0,
    lean: 0,
    squash: 1 + 0.015 * Math.sin(3 * phase),
    wide: /** @type {number|null} */ (null),
    front: -2.15,
    back: 2.15,
    face: phase % 2.7 < 0.11 ? 'blink' : 'normal',
    emote: /** @type {string|null} */ (null),
    bubble: 0,
    holding: f.holding,
    flag: f.flag,
    hat: f.hatFrom == null,
    visible: visible(f),
  };
  const mv = current(f);
  if (!mv || (!f.begun && mv.k !== 'rise')) return p;
  const c = f.clock;
  switch (mv.k) {
    case 'rise':
      p.lift = -70 * s * (1 - ease(c / 0.45)) + arc(c / 0.45) * 6 * s;
      break;
    case 'walk':
      if (Math.abs(mv.to - f.x) > 0.5) {
        p.way = Math.sign(mv.to - f.x);
        if (mv.look) p.face = mv.look;
        p.emote = mv.sign;
        if (mv.gait === 'run') {
          const a = f.walked / (7 * s);
          p.lift = Math.abs(Math.sin(a)) * 6 * s;
          p.lean = 0.2 + 0.14 * Math.sin(a);
          arms(p, -0.45 + 0.45 * Math.sin(26 * phase));
        } else if (mv.gait === 'tiptoe') {
          const a = f.walked / (11 * s);
          p.lift = Math.abs(Math.sin(a)) * 5 * s;
          p.lean = -0.05;
          arms(p, -0.9);
        } else {
          const a = f.walked / ((mv.gait === 'waddle' ? 8 : 10) * s);
          p.lift = Math.abs(Math.sin(a)) * 3.5 * s;
          p.lean = Math.sin(a) * 0.14;
          p.front = -2.15 + 0.35 * Math.sin(a);
          p.back = 2.15 + 0.35 * Math.sin(a);
          if (mv.gait === 'backward') {
            p.lean -= 0.12;
            p.way = -p.way;
          }
        }
      }
      break;
    case 'wait':
      if (mv.look) p.face = mv.look;
      p.emote = mv.sign;
      if (mv.tremble) p.lean = 0.03 * Math.sin(55 * c);
      break;
    case 'jump':
      if (mv.look) p.face = mv.look;
      p.emote = mv.sign;
      p.lift = arc(c / 0.3) * 11 * s;
      break;
    case 'scoop': {
      const third = f.scoopTime / 3;
      const k = ease(c / third) * (1 - ease((c - 2 * third) / third));
      p.lean = 0.55 * k;
      p.squash = 1 - 0.08 * k;
      p.front = mix(-2.15, -2.9, k);
      break;
    }
    case 'windup': {
      const st = style(f.style);
      const k = ease(c / f.windTime);
      p.face = mv.face;
      p.lean = st.windLean * k;
      p.front = mix(-2.15, st.pullBack, k);
      if (f.style === 'hopping') p.squash = 1 - 0.14 * k;
      else if (f.style === 'lob') p.squash = 1 - 0.06 * k;
      else if (f.style === 'spin' && k < 0.85 && Math.sin(19 * k) < 0) p.way = -p.way;
      break;
    }
    case 'release': {
      const st = style(f.style);
      if (c < 0.12) {
        const k = c / 0.12;
        p.lean = mix(st.windLean, st.followLean, k);
        p.front = mix(st.pullBack, st.through, k);
      } else {
        const k = (c - 0.12) / 0.14;
        p.lean = mix(st.followLean, 0, k);
        p.front = mix(st.through, -2.15, k);
      }
      if (f.style === 'hopping') p.lift = arc(c / 0.26) * 13 * s;
      p.face = 'happy';
      break;
    }
    case 'brace':
      bracePose(b, p, i, mv.react, phase);
      break;
    case 'dropball': {
      const k = c / 0.12;
      p.front = mix(-2.15, -1.5, k);
      p.back = mix(2.15, 1.5, k);
      p.face = 'normal';
      break;
    }
    case 'shove':
      if (c < 0.12) {
        p.lean = mix(0, -0.2, c / 0.12);
        arms(p, mix(-2.15, 0.4, c / 0.12));
      } else {
        p.lean = mix(-0.2, 0.42, (c - 0.12) / 0.08);
        arms(p, -1.5);
      }
      p.face = 'angry';
      break;
    case 'stumble':
      p.lean = -1.5 * ease(c / 0.3);
      p.lift = Math.abs(Math.sin(p.lean)) * 11 * s + arc(c / 0.42) * 14 * s;
      arms(p, -0.8 + 0.5 * Math.sin(40 * c));
      p.face = SHOCK;
      break;
    case 'lie':
      p.lean = -1.5;
      p.lift = 11 * s;
      arms(p, -1.2 + 0.2 * Math.sin(18 * c));
      p.face = 'dizzy';
      break;
    case 'getup':
      p.lean = -1.5 * (1 - ease(c / 0.38));
      p.lift = Math.abs(Math.sin(p.lean)) * 11 * s + arc(c / 0.38) * 4 * s;
      p.face = 'dizzy';
      break;
    case 'crumble':
      p.face = 'dizzy';
      p.lean = -0.28 * (1 - ease(c / 0.2)) + 0.2 * Math.sin(38 * c) * (1 - c / 0.5);
      p.squash = 1 - 0.22 * (1 - ease(c / 0.16));
      arms(p, -0.9 + 0.5 * Math.sin(40 * c));
      break;
    case 'stagger':
      p.face = 'dizzy';
      p.lean = 0.24 * Math.sin(9 * c);
      p.lift = Math.abs(Math.sin(9 * c)) * 2 * s;
      break;
    case 'cheer':
      cheerPose(p, c, s);
      break;
    case 'dance':
      p.way = Math.sin(11 * c) >= 0 ? 1 : -1;
      p.lift = Math.abs(Math.sin(11 * c)) * 9 * s;
      arms(p, -0.5 + 0.3 * Math.sin(22 * c));
      p.face = 'happy';
      break;
    case 'taunt':
      p.lean = 0.2 * Math.sin(20 * c);
      p.lift = Math.abs(Math.sin(10 * c)) * 2 * s;
      p.squash = 1 + 0.05 * Math.sin(20 * c);
      p.face = 'happy';
      arms(p, -0.6);
      break;
    case 'mourn':
      p.lean = 0.24;
      p.face = 'sad';
      arms(p, -2.6);
      break;
    case 'pant':
      p.lean = 0.24 + 0.06 * Math.sin(14 * c);
      p.squash = 1 + 0.03 * Math.sin(14 * c);
      p.face = 'sad';
      arms(p, -2.7);
      break;
    case 'flagout':
      p.front = mix(-2.15, -0.5, c / 0.25);
      p.face = 'sad';
      break;
    case 'flagaway':
      p.front = mix(-0.5, 0.8, c / 0.25);
      p.face = 'sly';
      break;
    case 'wave':
      p.front = -0.5 + 0.35 * Math.sin(9 * c);
      p.lift = Math.abs(Math.sin(4.5 * c)) * 2 * s;
      p.face = 'sad';
      p.bubble = c < 0.1 ? mix(0, 1.25, c / 0.1) : mix(1.25, 1, (c - 0.1) / 0.1);
      break;
    case 'handshake':
      p.front = -1.35 + 0.2 * Math.sin(14 * c);
      p.lift = Math.abs(Math.sin(14 * c)) * 1.5 * s;
      p.face = 'happy';
      p.emote = 'heart';
      break;
    case 'build':
      p.lean = Math.abs(Math.sin(9 * c)) * 0.45;
      p.front = -2.75;
      p.face = SHOCK;
      break;
    case 'hide':
      crouchPose(p);
      break;
    case 'peek': {
      const k = ease(c / 0.2) * (1 - ease((c - 0.75) / 0.2));
      p.squash = mix(0.5, 0.92, k);
      p.wide = 1.04;
      p.lean = 0.08 * Math.sin(16 * c) * k;
      p.face = 'happy';
      break;
    }
    case 'grabhat':
      p.lean = arc(c / 0.5) * 0.55;
      p.front = -2.8;
      p.face = 'sly';
      break;
    case 'dive': {
      const u = c / 0.38;
      p.lift = arc(2 * u) * 14 * s - 70 * s * clamp(2 * u - 1, 0, 1);
      p.face = SHOCK;
      arms(p, -0.5);
      break;
    }
  }
  return p;
}

function bracePose(b, p, i, react, t) {
  const f = b.f[i];
  const [c, s, flair] = [f.clock, f.size, f.flair];
  const fl = b.flights.find((x) => x.target === i);
  const pr = fl ? clamp(fl.age / fl.time, 0, 1) : 0;
  const q = fl ? flightApex(fl) : 0.5;
  const k = ease((pr - q + 0.4) / 0.2) * (1 - ease((pr - q - 0.05) / 0.15));
  if (react === 'cheer') {
    cheerPose(p, c, s);
    if (fl && pr > 0.55) p.face = SHOCK;
    return;
  }
  if (react === 'crouch') {
    crouchPose(p);
    return;
  }
  p.lean = 0.07 * Math.sin(9 * t);
  p.lift = Math.abs(Math.sin(9 * t)) * 1.6 * s;
  if (!fl) return;
  const shock = () => {
    p.face = SHOCK;
    p.lean = 0;
    p.lift = 0;
  };
  switch (react) {
    case 'take':
      if (pr > 0.6) p.face = SHOCK;
      break;
    case 'duck':
      shock();
      p.squash = 1 - 0.42 * k * flair;
      arms(p, mix(-2.15, -0.6, k));
      break;
    case 'hop':
      shock();
      p.lift = arc((pr - q + 0.34) / 0.68) * 38 * s * flair;
      arms(p, -1.4);
      break;
    case 'lean':
      shock();
      p.lean = -0.78 * k * flair;
      arms(p, mix(-2.15, -1.1, k));
      break;
    case 'spin':
      shock();
      if (k > 0.05 && Math.sin(46 * pr) < 0) p.way = -p.way;
      p.squash = 1 - 0.22 * k * flair;
      p.lift = 5 * s * k;
      break;
    case 'watch':
      shock();
      p.lean = -0.2 * flair * ease(pr / 0.5);
      p.face = pr > 0.75 ? 'happy' : 'normal';
      if (pr > 0.45) p.emote = 'question';
      break;
    case 'flinch': {
      shock();
      const j = ease((pr - 0.55) / 0.2);
      p.squash = 1 - 0.14 * j * flair;
      p.lean = -0.14 * j;
      arms(p, mix(-2.15, -0.5, j));
      break;
    }
  }
}

// ---- art (snowman-fight 5) -----------------------------------------------------------------------------------------
// Drawn in Y-up points: the caller has flipped the context (`scale(1, -1)`), so `rotate(a)` turns counter-clockwise
// as in the Rust `Sketch`.

const TEAMS = [
  ['#1f70e0', '#144fad'],
  ['#de3340', '#a31c2b'],
];
const OUTLINE = '#adc4e6';
const INK = '#1f212e';
const BROWN = '#6b472e';
const ORANGE = '#ff8c26';

function at(g, x, y, turn, scale, fn) {
  g.save();
  g.translate(x, y);
  if (turn) g.rotate(turn);
  if (scale !== 1) g.scale(scale, scale);
  fn();
  g.restore();
}

function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, TAU);
  g.fill();
}

function polyline(g, pts, color, width) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
  g.stroke();
}

const line = (g, x0, y0, x1, y1, color, width) => polyline(g, [[x0, y0], [x1, y1]], color, width);

function polygon(g, pts, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
  g.closePath();
  g.fill();
}

function rrect(g, x, y, w, h, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  g.fill();
}

function ellipseBox(g, x, y, w, h, color, stroke = 0) {
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU);
  if (stroke) {
    g.strokeStyle = color;
    g.lineWidth = stroke;
    g.stroke();
  } else {
    g.fillStyle = color;
    g.fill();
  }
}

/**
 * Pre-rendered snowball (white with a soft highlight up-left once drawn in the flipped frame).
 *
 * @param {number} px radius in device px
 */
export function ballSprite(px) {
  const r = Math.max(4, Math.ceil(px));
  const c = document.createElement('canvas');
  c.width = c.height = 2 * r + 2;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const cx = r + 1;
  // Highlight at canvas-down: the sprite is drawn into a Y-flipped frame.
  const grad = g.createRadialGradient(cx - 0.3 * r, cx + 0.4 * r, 0, cx, cx, 1.25 * r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#f7faff');
  grad.addColorStop(1, '#ccdef7');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cx, r - 0.5, 0, TAU);
  g.fill();
  g.strokeStyle = OUTLINE;
  g.lineWidth = Math.max(1, r * 0.06);
  g.stroke();
  return c;
}

function snowBall(g, art, x, y, r) {
  g.drawImage(art.ball, x - r, y - r, 2 * r, 2 * r);
}

function arm(g, mitten) {
  line(g, 0, 1, 0, 16, BROWN, 1.7);
  circle(g, 0, 18, 3.3, mitten);
}

function flag(g, alpha) {
  g.globalAlpha *= alpha;
  line(g, 10, 0, 10, 23, '#8c633d', 1.4);
  polygon(g, [[10.5, 23], [26, 18.5], [10.5, 14]], '#ffffff');
  g.strokeStyle = OUTLINE;
  g.lineWidth = 0.6;
  g.stroke();
}

function hat(g, team) {
  const [main, deep] = TEAMS[team];
  g.fillStyle = main;
  g.beginPath();
  g.moveTo(3.5, 3);
  g.quadraticCurveTo(12, 21, 20.5, 3);
  g.closePath();
  g.fill();
  rrect(g, 2, 0.5, 20, 4.5, 2.2, deep);
  circle(g, 12, 12.6, 3, '#ffffff');
}

function hatAt(g, x, y, turn, scale, team) {
  at(g, x, y, turn, scale, () => {
    g.translate(-12, -8);
    hat(g, team);
  });
}

function mound(g) {
  const pts = [];
  for (let i = 0; i <= 61; i++) {
    const u = i / 61;
    const base = Math.max(0, Math.sin(PI * u));
    pts.push([i, 17 * base ** 0.8 + 2 * Math.sin(9 * PI * u) * base]);
  }
  const grad = g.createLinearGradient(0, 19, 0, 0);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#ccdef7');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) g.lineTo(x, y);
  g.closePath();
  g.fill();
  g.strokeStyle = OUTLINE;
  g.lineWidth = 0.6;
  g.stroke();
  circle(g, 22, 7, 1.5, '#292b38');
  circle(g, 29, 9, 1.5, '#292b38');
  polygon(g, [[35, 5], [47, 7.4], [35, 10.5]], ORANGE);
}

function wall(g) {
  const rows = [
    [[1, 12.5], [14.5, 12.5]],
    [[0, 7], [7.5, 13], [21, 7]],
    [[2, 11.5], [14.5, 11.5]],
  ];
  rows.forEach((bricks, row) => {
    for (const [x, w] of bricks) {
      const y = row * 9.6;
      rrect(g, x, y, w, 9.2, 2.8, '#f2f7ff');
      g.strokeStyle = OUTLINE;
      g.lineWidth = 0.6;
      g.stroke();
    }
  });
}

function face(g, f) {
  const lw = 0.9;
  const e = [
    [14, 15],
    [19.5, 15],
  ];
  const smile = [[13, 6.6], [14.6, 5.4], [16.5, 5], [18.4, 5.4], [20, 6.6]];
  const frown = [[13, 5], [16.5, 6.8], [20, 5]];
  circle(g, 12, 9, 2.4, 'rgba(255,140,158,0.55)');
  polygon(g, [[20.5, 11.5], [30.5, 9.4], [20.5, 7.6]], ORANGE);
  const eyes = () => {
    circle(g, e[0][0], e[0][1], 1.1, INK);
    circle(g, e[1][0], e[1][1], 1.1, INK);
  };
  switch (f) {
    case 'blink':
      line(g, 12.8, 15, 15.2, 15, INK, lw);
      line(g, 18.3, 15, 20.7, 15, INK, lw);
      polyline(g, smile, INK, lw);
      break;
    case 'happy':
      polyline(g, [[12.6, 14], [14, 16], [15.4, 14]], INK, lw);
      polyline(g, [[18.1, 14], [19.5, 16], [20.9, 14]], INK, lw);
      ellipseBox(g, 13, 3.6, 7, 4.6, '#b83342');
      break;
    case 'shock':
      for (const [x, y] of e) {
        circle(g, x, y, 2.4, '#ffffff');
        ellipseBox(g, x - 2.4, y - 2.4, 4.8, 4.8, INK, 0.5);
        circle(g, x + 0.4, y, 1.1, INK);
      }
      circle(g, 16.5, 5.6, 1.7, INK);
      break;
    case 'dizzy':
      for (const [x, y] of e) {
        line(g, x - 1.4, y - 1.4, x + 1.4, y + 1.4, INK, lw);
        line(g, x - 1.4, y + 1.4, x + 1.4, y - 1.4, INK, lw);
      }
      polyline(g, [[12.6, 6], [14.5, 7.2], [16.5, 5.4], [18.5, 7.2], [20.4, 6]], INK, lw);
      break;
    case 'angry':
      eyes();
      line(g, 12.2, 18, 15.4, 16.6, INK, 1.1);
      line(g, 18.2, 16.6, 21.4, 18, INK, 1.1);
      polyline(g, frown, INK, lw);
      break;
    case 'sly':
      line(g, 12.6, 15, 15.4, 14.6, INK, lw);
      line(g, 18.2, 14.6, 21, 15, INK, lw);
      line(g, 18.4, 17, 21.2, 17.6, INK, 0.7);
      polyline(g, [[13, 6], [17, 5.6], [20.5, 7.4]], INK, lw);
      break;
    case 'sad':
      for (const [x, y] of e) {
        circle(g, x, y, 1.5, INK);
        circle(g, x + 0.5, y + 0.5, 0.5, '#ffffff');
      }
      line(g, 12.2, 17.2, 15.4, 18.2, INK, 1.1);
      line(g, 18.2, 18.2, 21.4, 17.2, INK, 1.1);
      polyline(g, frown, INK, lw);
      break;
    default:
      eyes();
      polyline(g, smile, INK, lw);
  }
}

function emote(g, e) {
  if (e === 'alert') {
    line(g, 0, 6.5, 0, -1.5, '#ffffff', 5.6);
    circle(g, 0, -5.5, 2.8, '#ffffff');
    line(g, 0, 6.5, 0, -1.5, '#f24545', 3.2);
    circle(g, 0, -5.5, 1.7, '#f24545');
  } else if (e === 'question') {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = 2.9 - i * 0.36;
      pts.push([3.4 * Math.cos(a), 3.6 + 3.4 * Math.sin(a)]);
    }
    pts.push([0, -0.6]);
    polyline(g, pts, '#ffffff', 5.2);
    circle(g, 0, -5.5, 2.6, '#ffffff');
    polyline(g, pts, '#3380f2', 2.6);
    circle(g, 0, -5.5, 1.5, '#3380f2');
  } else if (e === 'heart') {
    const heart = (k, color) => {
      circle(g, -3, 2.5, 3.4 + k, color);
      circle(g, 3, 2.5, 3.4 + k, color);
      polygon(g, [[-6.4 - k, 1.2], [6.4 + k, 1.2], [0, -6.4 - 1.6 * k]], color);
    };
    heart(1.4, '#ffffff');
    heart(0, '#f54d75');
  }
}

/** The white-flag peace bubble. */
function bubble(g) {
  g.beginPath();
  for (let i = 0; i < 30; i++) {
    const [rx, ry] = i === 0 ? [43, 28] : i % 2 === 0 ? [43, 20] : [36, 15];
    const a = PI / 2 + (TAU * i) / 30;
    const x = 44 + rx * Math.cos(a);
    const y = 29 + ry * Math.sin(a);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.strokeStyle = '#141419';
  g.lineWidth = 1.5;
  g.stroke();
  const red = '#e01a24';
  ellipseBox(g, 37, 22, 14, 14, red, 2);
  line(g, 44, 22, 44, 36, red, 2);
  line(g, 44, 29, 39, 24, red, 2);
  line(g, 44, 29, 49, 24, red, 2);
}

/** One snowman rig in rig-local units (anchor (35, 0)), facing +x. */
function rig(g, art, p, team) {
  const [main, deep] = TEAMS[team];
  g.translate(-35, 0);
  at(g, 29, 28, p.back, 1, () => arm(g, main));
  snowBall(g, art, 35, 11.5, 11.5);
  snowBall(g, art, 35, 26, 8.5);
  circle(g, 37.5, 28, 1.05, '#292b38');
  circle(g, 38, 23.5, 1.05, '#292b38');
  at(g, 23, 22.5, 0, 1, () => {
    rrect(g, 5, 0.5, 5, 9, 2, deep);
    rrect(g, 2.5, 6, 19, 5.2, 2.6, main);
  });
  snowBall(g, art, 35, 38, 9);
  at(g, 23, 25, 0, 1, () => face(g, p.face));
  if (p.hat) hatAt(g, 35, 50.5, -0.1, 1, team);
  at(g, 41, 28, p.front, 1, () => {
    arm(g, main);
    if (p.holding) snowBall(g, art, 0, 22, 4);
    if (p.flag) {
      g.translate(-8, 10);
      flag(g, 1);
    }
  });
  if (p.emote) {
    at(g, 38, 69, 0, 1, () => {
      g.scale(p.way, 1);
      emote(g, p.emote);
    });
  }
  if (p.bubble > 0) {
    at(g, 35, 60, 0, 1, () => {
      g.scale(p.way * p.bubble, p.bubble);
      g.translate(-44, 0);
      bubble(g);
    });
  }
}

/**
 * Draw the bout. `floor` = viewport y of the floor line.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {any} b
 * @param {{ball: HTMLCanvasElement}} art
 * @param {number} floor
 */
export function drawBout(g, b, art, floor) {
  const fade = fading(b);
  g.save();
  // Things rise out of and dive into the snow: nothing shows below the floor.
  g.beginPath();
  g.rect(b.min - 80, floor - 400, b.max - b.min + 160, 401);
  g.clip();
  g.translate(0, floor);
  g.scale(1, -1);

  for (const r of b.f) {
    if (r.pileAt == null) continue;
    const k = ease((b.age - r.pileAt) / 0.25) * (1 - fade);
    if (k <= 0) continue;
    at(g, r.x, 0, 0, r.size * k, () => {
      g.translate(-31, 0);
      mound(g);
    });
  }
  const poses = [pose(b, 0), pose(b, 1)];
  b.f.forEach((r, i) => {
    const p = poses[i];
    if (!p.visible) return;
    g.save();
    g.translate(p.x, p.lift);
    g.rotate(-p.lean * p.way);
    const wide = p.wide ?? 1 / Math.sqrt(Math.max(0.5, p.squash));
    g.scale(p.way * r.size * wide, r.size * p.squash);
    rig(g, art, p, i);
    g.restore();
  });
  if (b.wallHeight > 0) {
    at(g, b.wallX, 0, 0, 1, () => {
      g.scale(b.scale, b.scale * Math.max(0.01, b.wallHeight));
      g.translate(-14, 0);
      wall(g);
    });
  }
  b.f.forEach((r, i) => {
    if (r.hatFrom == null) return;
    if (r.wornBy != null) {
      const tp = poses[r.wornBy];
      const t = b.f[r.wornBy];
      if (!tp.visible) return;
      const h = RIG_HEIGHT * t.size * tp.squash;
      const rot = -tp.lean * tp.way;
      hatAt(g, tp.x - Math.sin(rot) * h, tp.lift + Math.cos(tp.lean) * h, rot + 0.2, t.size, i);
    } else if (fade < 1) {
      const t = clamp((b.age - r.hatFrom) / 0.95, 0, 1);
      const side = r.lastWay > 0 ? -1 : 1;
      const rot = t < 1 ? t * 9 * side : 0.22 * side;
      const x = r.x + side * 18 * r.size * t;
      const y = (mix(50 * r.size, 22 * r.size, t) + arc(t) * 62 * r.size) * (1 - fade);
      hatAt(g, x, y, rot, r.size * (1 - fade), i);
    }
  });
  if (b.toss) {
    const pos = tossPos(b.toss);
    const k = b.toss.age / TOSS_TIME;
    at(g, pos.x, pos.y, k * 7 * b.toss.dir, b.scale, () => {
      g.translate(-10, -12);
      flag(g, 1 - k * k);
    });
  }
  for (const fl of b.flights.slice(0, 4)) {
    const pos = flightPos(fl);
    at(g, pos.x, pos.y, 0, fl.size, () => snowBall(g, art, 0, 0, 4));
  }
  for (const k of b.specks) {
    if (!k) continue;
    const o = Math.max(0, k.life / k.total);
    g.globalAlpha = o;
    circle(g, k.x, k.y, (k.size * (0.5 + o / 2)) / 2, k.sweat ? '#8cd1ff' : '#ffffff');
  }
  g.globalAlpha = 1;
  g.restore();
}
