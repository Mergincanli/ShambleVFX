# The effect file, version 3

One effect is one JSON file: `effects/<id>.vfx.json` in a project folder, next to `images/` (PNG files) and `project.json`.
The exact schema is `packages/vfx-format/schema/effect.v3.schema.json`; the types are `packages/vfx-format/src/types.ts`.
Files of versions 1 and 2 open unchanged: the checker upgrades them (see the end).

What the game loads is an **export folder** made from a project: see [export.md](export.md).

## Rules for every file

- **Times in milliseconds, sizes in metres.** Line widths and letter heights are in px on a 1080p screen (names end in `Px`).
- **Colours are role names**, such as `heat.2`, `team` or `glow`. A hex colour is never stored in an effect file; the checker
  refuses one anywhere. The hexes live in the palette (`packages/vfx-format/palette/palette.json`). `team`, `team.dark`, `glow`
  and `glow.hot` follow the faction that made the effect; the others are the same for everyone. `main` means the effect's
  main colour (its colour control).
- **Everything random comes from the seed** the game passes in. Same seed and same time give the same picture.
- **Layers draw in list order**: the first layer is at the bottom.
- **Friend or foe** is set per layer by its `edge` (see below), never by a fixed colour.
- **The file carries a version number.** When the format changes, the number goes up and an upgrade step is added.

## The parts of an effect

- `controls`: the four big controls. `size`, `intensity` and `duration` are multipliers (1 = as authored); `colour` is the
  main role. What each changes is decided in one place, the runtime's `applyControls()`.
- `phases`: `{ "windupMs", "peakMs", "fadeMs" }`. Wind-up, then peak, then fade, one after the other from 0 ms. Layers can
  start when a phase starts, last until one ends, fly for one, or break up during one. All zeros: the effect has no phases.
- `layers`: the list, bottom first.

**Inputs from the game**: an `origin` (a muzzle, the centre of a fire), a `target` (the hit point), the faction that made the
effect, who made it seen from the player looking (`enemy`, `team` or `self`), and how far that player is from the event.

## Every layer

- `id` (lowercase letters, digits, `_`) and `name` (shown in the editor).
- `start`: `{ "ms": 120 }` (120 ms after the effect starts), `{ "phase": "peak", "ms": 0 }` (when the peak starts), or
  `{ "arrivalOf": "shell", "ms": 0 }` (when the projectile `shell` lands).
- `timing`: `{ "mode": "steps", "perSecond": 12 }` moves in whole steps, like drawn animation; `{ "mode": "smooth" }` moves
  every frame. Each layer counts its steps from its own start. A shape holds its drawing for a step, but break-ups follow
  real time.

## Every visible layer (sprite, shape, burst, word)

- `at`: `{ "input": "origin" | "target", "offset": [right, up, forward] }` (metres, in the shot's frame: forward is towards
  the target), or `{ "layer": "<projectile id>" }` to ride a projectile.
- `facing`: `camera` (faces the screen), `path` (along the motion or the shot; drawn shapes lie in the screen's plane and stay
  upright), `ground` (flat on the ground under its anchor), `upright` (stands up like a sign: true heights).
- `blend`: `normal`, `add` (adds light), `screen` (lightens the ground; ground only), `multiply` (darkens the ground, for
  scorch marks; ground only). Normal and added light share one draw call, in layer order.
- `tiers`: the quality tiers it shows in, any of `low`, `medium` and `high` (at least one). The game picks one tier for all
  effects; layers not in it are left out, and the timing of everything else stays the same. Low drops extras but must stay
  readable (decided principle 7). A projectile has no tiers: it is invisible, and other layers ride it in every tier.
- How long it lasts, one of: `durationMs`; `untilPhaseEnd` (`windup`, `peak` or `fade`); or nothing, which means
  automatic: as long as the projectile it rides flies, one step per frame for a flipbook, the longest piece life for a burst.
- Optional: `scale` and `alpha` (`{ "steps": [1.18, 1.06] }` one factor per step from the start, and/or `{ "life": [[0, 1], [1, 0]] }`
  a curve over the layer's life); `shiftM` (`[right, up]` in its own flat frame); `liftM` (height above the ground for a layer
  flat on the ground).

**Edges, friend or foe** (Mustafa, 2026-11-14). `auto`: an enemy's gets a solid ink edge, your own team's a thin broken one
(a dashed rim, a hollow spark, a dashed ring or beam). `enemy`: an ink edge for an enemy's, none (or not drawn, for a band)
for your own team's. `ink`, `broken`, `none`: always that look.

## Sprite layer (`"type": "sprite"`)

- `image`: a PNG in `images/`. `flipbook` (optional): `{ cols, rows, frames, loop }`, one frame per step.
- `pivot`: the point of the image on the anchor: `[0, 0]` top-left, `[1, 1]` bottom-right. `sizeM`: `[width, height]`.
- `tint`: `{ "mode": "keep" }`, or `{ "mode": "multiply", "role": "glow" }` (draw tinted images in white and greys).

## Projectile layer (`"type": "projectile"`)

Invisible: a path that other layers ride.
- `from`, `to`: input anchors.
- `flight`: `{ "mode": "speed", "mps": 40 }` (time = distance ÷ speed), `{ "mode": "time", "ms": 500 }`, or
  `{ "mode": "phase", "phase": "windup" }` (flies for exactly that phase).
- `arcM`: height of the arc above the straight line at the middle (0 = straight). `stretch`, `spinDegPerS`: for riding sprites.

## Shape layer (`"type": "shape"`)

A comic shape drawn in code: `shape` holds its kind and settings, `seed` its own seed, `perPlay` whether it changes every play.

| kind | What it is | Main settings |
|---|---|---|
| `shards` | A star of uneven spikes in layered tones (bursts, glints, hit stars) | `radiusM`, `points`, `inner`, `jitter` (0 = regular), `squash`, `tones` (each `role`, `scale`, optional `points`, `vanishAt`), `inkPx`, `edge`, `whiteFirstStep`, `boilDeg`, `double` (a second jagged edge), optional `halftone` fill, `breakUp` |
| `flash` | A muzzle flash along the shot | `lengthM`, `tones`, `inkPx`, `edge`, `alternate` (every other step smaller and jittered) |
| `cloud` | A scalloped cloud blast in layered tones | `radiusM`, `squash`, `lobes`, `lobeDepth`, `tones`, `inkPx`, `edge`, `boilDeg`, optional `halftone`, `breakUp` |
| `smoke` | A puff, or a lumpy billow lit from above with halftone under | `style`, `radiusM`, `role`, `lightRole`, `rimRole`, `inkPx`, `grow` [start, peak, end], `riseM`, `driftM` [right, forward], optional `loop` |
| `ring` | A circle on the ground, or rings closing in | `radiusM`, `widthPx`, `inkPx`, `role`, `style` (`auto-zigzag`, `auto-teeth`, `solid`, `dashed`, `zigzag`, `teeth`), `teeth`, `teethM`, `growFrom`, `growMs`, optional `dashAt`, `breakUp`, `closing`, `squash` |
| `dots` | A field of halftone dots (light, soft edges) | `radiusM`, `innerM`, `edgeM`, `stepPx`, `dotPx`, `role`, `alpha`, `growFrom`, `growMs`, `flickerM`, optional `squash`, `breakUp` |
| `scorch` | A stain (multiply it) | `style` (`oval`, `splat`), `radiusM`, `role`, `coreScale`, `coreRole`, `lobes`, `growMs` |
| `lines` | Thin radial lines (speed lines, ticks) | `count`, `innerM`, `lengthM`, `widthPx`, `role`, `until`, `spread` |
| `glow` | A soft round glow or a flat disc of light | `radiusM`, `role`, `alpha`, `soft`, `grow`, `flicker` |
| `trail` | The last part of a projectile's path behind it | `length` (share of the path), `widthPx`, `role`, `head`, `core`, `inkPx`, `edge`, `breakUp`, `dashes` |
| `band` | A beam from one point to another | `from`, `to`, `widthM`, `role`, `alpha`, `soft`, `edge`, `flicker`, optional `find` and `letGo` phases |
| `beads` | Bright beads running along a beam | `from`, `to`, `count`, `periodMs`, `sizeM`, `role`, `glowRole` |
| `flames` | Flame tongues in rows, back to front | `radiusM`, `count`, `depth`, `tallM`, `widthM`, `lean`, `sway`, `cycleSteps`, `tones`, `shadeRole`, `inkPx`, `edge`, `licks`, `growMs`, `breakUp` |
| `bed` | The boiling bed of a fire, or its detail on top | `radiusM`, `tones` (rim to middle), `lumps`, `part` (`lumps`, `detail`), `detailRole`, `inkPx`, `edge`, `boilSteps`, `growMs`, `breakUp` |

`breakUp` is `{ "phase": "fade" }` or `{ "lastMs": 200 }`: how a shape shrinks, loses tones or falls apart at the end.

## Burst layer (`"type": "burst"`)

A set number of pieces thrown out at once (or again and again with `loop`). Every piece comes from the seed and the time.
`count`, `lifeMs`, `speedMps` (ranges `[low, high]`), `direction` (`up`, `out`, `path`), `spreadDeg`, `startRadiusM`, optional
`areaM` (start anywhere in a box), `gravityMps2`, `drag`, `sizeM`, `sizeOverLife` (curve), `spinDegPerS`, `look`, `loop`,
`groundStop`, optional `streak` (a speed streak behind each piece), `seed`, `perPlay`.
`look` is `{ "kind", "role", "inkPx", "edge", "inkRole"? }` with kind `diamond`, `chip`, `spark`, `dot`, `shard`, `speck`,
`puff`, `streak` or `spike`; or `{ "kind": "image", "image": "chip.png", "tint": … }`.

## Word layer (`"type": "word"`)

A comic sound word in our own block letters (A B C D E F G H I K L M N O P R S T U W Z and !; the checker warns about others).
It always faces the screen.
`words` (one picked per play), `letterPx`, `colours` (`top`, `bottom`, `back`: two flat tones and the pushed-back copy),
optional `separation` (a thin line between two black outlines), `tiltDeg` (range), `sizeJitter`, `ramp`, `bounce`, `turnDeg`,
`slantDeg`, `pop` (`scale`, `steps`), optional `breakUp` and `breakSteps`, `riseM`, `distance` (`curve` of [metres, size share]
from the player looking, and `minPx` under which it is not drawn), `visibleTo` (`everyone`, or `shooter` for a gun's word),
`seed`, `perPlay`.

## The project file (`project.json`)

Not part of an effect, but the editor keeps these next to the effects: `name`; `events` (effect id → the game events it
answers, such as `"board_muzzle": ["rifle.shot"]`); `preview` (the scene each effect is shown in); `budgets` (the cost budgets
typed in the editor, per tier). The export copies the events into its manifest and the rest into `editor.json`.

## From older versions

The checker upgrades an old file when it reads it, one version at a time. Save the file (or export it) to keep the upgraded copy.

- **1 → 2**: it adds empty phases, gives every sprite `"blend": "normal"`, and turns `"speedMps": 40` into
  `"flight": { "mode": "speed", "mps": 40 }, "arcM": 0`.
- **2 → 3**: every visible layer gets `"tiers": ["low", "medium", "high"]`, so an old effect looks the same in every tier
  until someone decides what Low drops.

Note: a few optional fields were added to version 2 after its first push, before anyone used it (`alpha`, `liftM`, `areaM`,
`streak`, `inkRole`, the `spike` piece, `squash` on rings and dots). They are optional, so every version 2 file stays valid;
no version number was spent on them.

## Planned (each with an upgrade step)

- Later: sound, camera shake and hit-stop as their own layer types, on the same timeline; a shade input from the game, so
  smoke and dust darken in shadow.
