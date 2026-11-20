# Seasons engine (web)

A port of the Frostpane desktop app (Rust, `github.com/duruer/frostpane`) to one HTML canvas. Plain JavaScript with
JSDoc, no dependencies, no TypeScript.

## Files

| File | What |
|---|---|
| `config.js` | the settings (`DEFAULTS`, `normalize`, `scheduled`, `excluded`); mirrors `SeasonsConfig.kt` |
| `weather.js` | which weather shows (manual, outside, random, season) |
| `wind.js` | wind setting, breeze, gusts (`Blow`) |
| `surfaces.js` | page elements things rest on (cards, navbar, footer, `[data-snow]`) + the ground |
| `host.js` | canvas, frame loop, shared state, pointer routing, storage, events |
| `start.js` | builds the host and the layers the settings switch on |
| `layers/*.js` | one effect each |

## Layer contract

A layer file exports `create<Name>(host)` returning a `Layer` (typedef in `host.js`):
`{ name, z, step?(dt), draw?(g), drawBack?(g), resize?(), themeChanged?(), weatherChanged?(shown), pointerDown?(p),
pointerMove?(p), pointerUp?(p), hover?(p), busy?(), command?(cmd), destroy?() }`.

- Coordinates are **viewport CSS px, Y down**. The host sets the dpr transform before `draw`; sprites you pre-render
  go through `host.dpr` and are rebuilt in `resize()` / `themeChanged()`.
- `step` runs every frame for every layer. A layer whose weather is not shown (`host.shown.weather`) lets its particles
  fall out / fade and then does nothing (no allocations, no draws).
- Read the settings from `host.config` (all switches are there; never assume a feature is on).
- Wind: `host.wind` (px/s, setting + breeze), `host.userWind` (setting only).
- Theme: `host.light` (true on light pages). Draw art that reads well on both.
- Surfaces: `host.surfaces.live` (array of `Surface`, ground last), `.at(x, y, slack)`, `.below(x, y)`, `.pin(s)`.
  A thing resting on a surface stores `{surface, off}` (x offset from `surface.left`) and follows it every frame.
- Pointer: return `true` from `pointerDown` only when the press hits something of yours; then the host routes
  `pointerMove` / `pointerUp` to you, stops the page from seeing that press and swallows the click after it. `hover`
  returns a CSS cursor (`grab`, `pointer`) or null.
- `busy()` true asks for the full frame rate; otherwise the loop runs at ~30 fps.
- Persistence per visitor: `host.load(key, fallback)` / `host.save(key, value)` (localStorage, may fail silently).
  Keys: `balls`, `snowmen`, `trees`, `decor`.
- Events: `host.on(type, fn)` / `host.emit(type, data)`. `host.command(cmd)` broadcasts a one-shot command.
- Light DOM UI (dress-up card, tree style card, decoration picker): plain DOM elements created by the layer, marked
  `data-seasons-ui` (the host then ignores presses on them), styled inline with the theme tokens
  (`var(--pano-color-surface, var(--bs-body-bg, #fff))`, `--pano-color-text`, `--pano-color-border`,
  `--pano-color-primary`, `--pano-radius`, `--pano-shadow-lg`, `--pano-font-body`) so they match any theme. Remove
  them in `destroy`. Texts come from `host.t9n(key)` (falls back to the key's English text you pass:
  `host.t9n('dress.hats', 'Hats')`).

## Layers and the APIs they offer each other

| name | z | file | offers (via `host.layer(name)`) |
|---|---|---|---|
| `wallpaper` | 0 | `wallpaper.js` | draws on the background canvas only (`drawBack`) |
| `starfall` | 10 | `starfall.js` | |
| `fireflies` | 20 | `fireflies.js` | |
| `petals` | 30 | `petals.js` | sakura and autumn leaves |
| `rain` | 40 | `rain.js` | lightning flash |
| `snow` | 50 | `snow.js` | `height(surface, x)`, `take(surface, x, amount)`, `deposit(surface, x, amount)`, `fill()`, `clear()`, `pileTop(surface, x)` |
| `trees` | 60 | `trees.js` | `trees()` list of `{id, x, y, surface}`, `fell(id)` (yeti) |
| `decor` | 65 | `decor.js` | |
| `snowballs` | 70 | `snowballs.js` | `snowmen()` list of `{id, x, y, height}`, `smash(id)` (yeti), `ballsOn(surface)` |
| `visitors` | 80 | `visitors.js` | `summon(kind)` |

Commands: `{type: 'summon', visitor: 'santa'|'snowmen'|'yeti'|'plough'}`, `{type: 'plant-tree'}`,
`{type: 'add-decor', kind}`, `{type: 'clear'}` (remove snow, balls, placed things), `{type: 'fill'}` (deep snow).

## Rules from the settings

- Snow world (piles, balls, snowmen, visitors) only while `host.shown.weather === 'snow'`; trees and decorations
  stay with every weather (as in Frostpane).
- `settle` off: flakes do not land on page elements (only the ground, if `groundSnow`). `groundSnow` off: no ground.
- `snowballs` off: no rolling / throwing; `snowmen` off: stacks do not become snowmen; `dressUp` off: no card.
- `trees` / `decorations` off: the layer is not created at all. `maxPlaced` caps each.
- `visitors` off: no visitor layer; `santa` / `snowmenFight` / `yeti` / `plough` switch each; `oftenVisits` halves
  the gaps.
- `heavySnow` (via `host.shown.heavy`) multiplies the snow amount by 2.5; `lightning` (`host.shown.lightning`) adds
  flashes to rain; `density` / `speed` scale every falling layer.
