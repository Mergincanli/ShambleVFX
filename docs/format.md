# The effect file, version 5

One effect is one JSON file: `effects/<id>.vfx.json` in a project folder, next to `images/` (PNG files), `project.json` and,
when the project has its own colours, `palette.json`.
The exact schema is `packages/vfx-format/schema/effect.v5.schema.json`; the types are `packages/vfx-format/src/types.ts`.
Files of versions 1, 2, 3 and 4 open unchanged: the checker upgrades them (see the end).

What the game loads is an **export folder** made from a project: see [export.md](export.md).

## Rules for every file

- **Times in milliseconds, sizes in metres.** Line widths and letter heights are in px on a 1080p screen (names end in `Px`).
- **Colours are role names**, such as `heat.2`, `team` or `glow`. A hex colour is never stored in an effect file; the checker
  refuses one anywhere. The hexes live in the palette: the project's own `palette.json`, or the built-in one
  (`packages/vfx-format/palette/palette.json`) for a project without one (see [colours.md](colours.md)). `team`, `team.dark`, `glow`
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
| `smoke` | A puff, or a lumpy billow lit from above with halftone under | `style`, `radiusM`, `role`, `lightRole`, `rimRole`, `inkPx`, `grow` [start, peak, end], `riseM`, `driftM` [right, forward], optional `loop`, optional `gradient` (see below) |
| `ring` | A circle on the ground, or rings closing in | `radiusM`, `widthPx`, `inkPx`, `role`, `style` (`auto-zigzag`, `auto-teeth`, `solid`, `dashed`, `zigzag`, `teeth`), `teeth`, `teethM`, `growFrom`, `growMs`, optional `dashAt`, `breakUp`, `closing`, `squash` |
| `dots` | A field of halftone dots (light, soft edges) | `radiusM`, `innerM`, `edgeM`, `stepPx`, `dotPx`, `role`, `alpha`, `growFrom`, `growMs`, `flickerM`, optional `squash`, `breakUp` |
| `scorch` | A stain (multiply it) | `style` (`oval`, `splat`), `radiusM`, `role`, `coreScale`, `coreRole`, `lobes`, `growMs` |
| `lines` | Thin radial lines (speed lines, ticks) | `count`, `innerM`, `lengthM`, `widthPx`, `role`, `until`, `spread` |
| `glow` | A soft round glow or a flat disc of light | `radiusM`, `role`, `alpha`, `soft`, `grow`, `flicker`, optional `gradient` (a gradient in the palette, from the middle to the rim; with it, the glow's colours come from the gradient, times `alpha`) |
| `trail` | The last part of a projectile's path behind it | `length` (share of the path), `widthPx`, `role`, `head`, `core`, `inkPx`, `edge`, `breakUp`, `dashes` |
| `band` | A beam from one point to another | `from`, `to`, `widthM`, `role`, `alpha`, `soft`, `edge`, `flicker`, optional `find` and `letGo` phases |
| `beads` | Bright beads running along a beam | `from`, `to`, `count`, `periodMs`, `sizeM`, `role`, `glowRole` |
| `flames` | Flame tongues in rows, back to front | `radiusM`, `count`, `depth`, `tallM`, `widthM`, `lean`, `sway`, `cycleSteps`, `tones`, `shadeRole`, `inkPx`, `edge`, `licks`, `growMs`, `breakUp` |
| `bed` | The boiling bed of a fire, or its detail on top | `radiusM`, `tones` (rim to middle), `lumps`, `part` (`lumps`, `detail`), `detailRole`, `inkPx`, `edge`, `boilSteps`, `growMs`, `breakUp`, optional `gradient` (see below) |

`breakUp` is `{ "phase": "fade" }` or `{ "lastMs": 200 }`: how a shape shrinks, loses tones or falls apart at the end.

**Gradients** (version 5 for smoke, the bed and bursts; version 4 for glows). A `gradient` names a gradient in the palette
(see [colours.md](colours.md)). The checker refuses a name the palette does not have; the runtime then draws the layer as
if it had no gradient. What the gradient runs along:

- **glow**: from its middle (0) to its rim (1). Its colours come from the gradient, times `alpha`.
- **smoke**: the body colour over each puff's life, from its start (0) to its end (1). A looping billow has its own life,
  so billows of different ages show different colours at once. It replaces `role`. The light top (`lightRole`) and the rim
  (`rimRole`) keep their colours. The gradient's alpha makes the whole puff more see-through: rim, body, light top and
  halftone. Each round of the puff is see-through on its own, so where rounds overlap the puff looks denser (as with a
  layer's `alpha`). Where the alpha is 0 the puff is not drawn at all.
- **bed**: from the rim (0) to the very middle (1). A place on the bed is 1 minus its distance from the middle, divided by
  the bed's radius, so a stop at 0.5 is halfway in. The gradient replaces `tones` (`tones` stay, and count when there is
  no gradient).
  - One band of lumps per stop. A band's lumps reach out to its stop's place (on average; the first band's to the rim),
    and the band lasts until the next stop. So the band edges sit at the stops. A band with no room is left out (two
    stops at one place, or a stop at 1).
  - Banded: each band is its stop's colour. Smooth: the same bands, but each point takes the gradient's colour at its
    place, kept between its band's place and the next band's. So the colour blends from band to band, and the middle still
    cools when the inner bands go out.
  - The detail's halftone and brush strokes take the next band's colour (smooth: the next band's colour halfway in). Both
    parts read the gradient, so the halftone sits where the bands meet: give a fire's lumps and its detail the same
    gradient (the checker warns when they differ).
  - Without a gradient, the tones sit where a banded gradient with stops at 0.58 k / (K − 1) + 0.03 k would put them (k
    counts from 0, K tones). For 4 tones that is 0, 0.2233…, 0.4467… and 0.67. A banded gradient with the same tones at
    exactly those stops draws today's bed; with the stops rounded to four decimals, the bands of the Molotov's bed move by
    less than a millimetre.
  - A stop's alpha makes its band see-through. A ready-made gradient made for a glow runs from the middle: on a bed it
    runs from the rim, so a hot-first gradient gives a hot rim.
- **burst**: each piece's colour over its own life, from its birth (0) to its end (1) (see the burst layer below).

## Burst layer (`"type": "burst"`)

A set number of pieces thrown out at once (or again and again with `loop`). Every piece comes from the seed and the time.
`count`, `lifeMs`, `speedMps` (ranges `[low, high]`), `direction` (`up`, `out`, `path`), `spreadDeg`, `startRadiusM`, optional
`areaM` (start anywhere in a box), `gravityMps2`, `drag`, `sizeM`, `sizeOverLife` (curve), `spinDegPerS`, `look`, `loop`,
`groundStop`, optional `streak` (a speed streak behind each piece), optional `gradient`, `seed`, `perPlay`.
`look` is `{ "kind", "role", "inkPx", "edge", "inkRole"? }` with kind `diamond`, `chip`, `spark`, `dot`, `shard`, `speck`,
`puff`, `streak` or `spike`; or `{ "kind": "image", "image": "chip.png", "tint": … }`.
`gradient` (a gradient in the palette): each piece's colour over its own life, from its birth (0) to its end (1), so pieces
of different ages show different colours at once. It replaces the look's `role` (your own team's broken edge, drawn in the
piece's colour, takes it too); an image piece is multiplied by the gradient's colour (in place of its tint). The gradient's
alpha makes the whole piece more see-through, its ink edge and speed streak too. The speed streak keeps its own colour, and
ink edges stay. Where the alpha is 0 the piece is not drawn at all.

## Word layer (`"type": "word"`)

A comic sound word in our own block letters. It always faces the screen. The letters are A to Z and !, and words are drawn in
capitals. J, Q, V, X and Y are Shamble VFX's own drawing in the drawing board's style, waiting for the Art lead's review; the
others are the board's. Other characters are left out, and the checker warns about them.
`words` (one picked per play, see below), `letterPx`, `colours` (`top`, `bottom`, `back`: two flat tones and the pushed-back copy),
optional `separation` (a thin line between two black outlines), `tiltDeg` (range), `sizeJitter`, `ramp`, `bounce`, `turnDeg`,
`slantDeg`, `pop` (`scale`, `steps`), optional `breakUp` and `breakSteps`, `riseM`, `distance` (`curve` of [metres, size share]
from the player looking, and `minPx` under which it is not drawn), `visibleTo` (`everyone`, or `shooter` for a gun's word),
`seed`, `perPlay`.

**Words and their chances** (version 5). Each word is `{ "text": "BOOM", "chance": 50 }`. `chance` is optional: how often the
word shows, in percent, from 0 to 100. Each play picks one word from the seed, with one random number:

1. No word has a chance: every word is as likely as the others, and every play shows a word.
2. The chances add up to more than 100: they are scaled down to 100. A word without a chance never shows.
3. Some words have no chance: they share what is left (100 minus the chances given) equally.
4. Every word has a chance, and they add up to less than 100: the rest of the plays show no word (Mustafa's choice).
   For example BOOM 30 and BANG 20: half the plays show no word.

The checker warns when the chances add up to more than 100 %, when a word is left with nothing because the others already
reach 100 %, and when a word has a 0 % chance (it never shows).

## The palette (`palette.json`, version 2)

`factions` (per faction: its `name` and the roles that change with it: `team`, `team.dark`, `glow`, `glow.hot`, and any added
per faction), `roles` (shared by everyone), and `gradients`. Each role is `{ "hex", "from", "note"? }`: `from` says whose value
it is (`mustafa`, `art-lead`, `board-v7`, `derived`, `assumed`). A gradient is `{ "kind": "smooth" | "banded", "stops", "from" }`;
each stop is `{ "at": 0..1, "role" or "hex", "alpha"? }`. Version 1 palettes (no gradients) are read as version 2.
Besides the roles an effect names, the checker asks the palette for the ones its layers draw without naming them: `ink`, `white`
(a star's white first step), `heat.rim` (your own team's broken edge) and the roles of their gradients' stops (see
[colours.md](colours.md)).

## The project file (`project.json`, version 2)

Not part of an effect, but the editor keeps these next to the effects:

```json
{
  "format": "shamble-vfx-project",
  "version": 2,
  "name": "Demo project",
  "paletteProfile": "Soviets dark",
  "events": { "board_muzzle": ["rifle.shot"] },
  "preview": { "board_muzzle": { "scene": "board-muzzle" } },
  "budgets": { "project": { "on": true, "limits": { "high": { "triangles": 5000 } } } }
}
```

- `name`: the project's name.
- `paletteProfile` (optional): the name of the palette profile the project's colours came from.
- `events`: effect id → the game events it answers.
- `preview`: the scene each effect is shown in.
- `budgets`: the cost budgets at three levels (the project's, classes, an effect's own), each off until switched on. Only
  what differs from the defaults is written. See [cost.md](cost.md).
- Anything else in the file (such as `about`) is kept as it is when the editor saves.

The export copies the events into its manifest and the rest into `editor.json` ([export.md](export.md)).

The local server, the command line and the editor read `project.json` with the same code (one reader, with the upgrade). New
projects are written as version 2.

- **Version 1 → 2**: `paletteProfile` is new, and `budgets` changes shape. Version 1 had one set of budgets for the whole
  project (per tier, per row); it becomes the project's budgets, **switched off**, numbers kept. Nothing else changes. A
  version 1 project opens as it is, and its `project.json` is written as version 2 the next time the project is saved.
  The example projects keep their version 1 `project.json`.
- A `project.json` of a newer version (or one whose `version` is not a whole number) is not opened, exported or written
  over: the editor says so in plain words.

## From older versions

The checker upgrades an old file when it reads it, one version at a time. Save the file (or export it) to keep the upgraded copy.

- **1 → 2**: it adds empty phases, gives every sprite `"blend": "normal"`, and turns `"speedMps": 40` into
  `"flight": { "mode": "speed", "mps": 40 }, "arcM": 0`.
- **2 → 3**: every visible layer gets `"tiers": ["low", "medium", "high"]`, so an old effect looks the same in every tier
  until someone decides what Low drops.
- **3 → 4**: nothing in the file changes but its number. Version 4 lets a glow name a gradient; the new number makes an older
  runtime refuse an effect it could not draw.
- **4 → 5**: each word of a word layer becomes an object: `["BOOM", "BANG"]` turns into `[{ "text": "BOOM" }, { "text": "BANG" }]`.
  With no chances, every play shows the same word as before, for every seed. Version 5 also lets smoke, the fire's bed and
  bursts name a gradient (nothing to change in an old file); the new number makes an older runtime refuse an effect it could
  not draw.

Note: a few optional fields were added to version 2 after its first push, before anyone used it (`alpha`, `liftM`, `areaM`,
`streak`, `inkRole`, the `spike` piece, `squash` on rings and dots). They are optional, so every version 2 file stays valid;
no version number was spent on them.

## Planned (each with an upgrade step)

- Later: sound, camera shake and hit-stop as their own layer types, on the same timeline; a shade input from the game, so
  smoke and dust darken in shadow.
