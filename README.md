# Shamble VFX

The effects editor for **Shamble Frontlines**, and the small runtime that plays its effects in the game.

You make an effect, see it exactly as the game will show it (same camera, same code, same data), and save files the game loads unchanged.

Status: **milestone 3**, and a round of editor work after it: a colour picker that edits the project's palette, gradients,
night mode and a new set of icons. Milestone 3 brought cost per effect, quality tiers, and the export folder the game loads,
with a test page that plays it using only the runtime. See [What works now](#what-works-now).

## Run it

You need [Node.js 22](https://nodejs.org) (the same version as the game repo). In this folder:

```bash
npm install
```

```bash
npm run dev
```

The editor opens in your browser at http://127.0.0.1:5173. Stop it with Ctrl+C in the terminal.

- It uses the **WebGPU** renderer when your browser has it, and the **WebGL 2** fallback otherwise. The badge at the top right says which. To try the fallback on purpose, open http://127.0.0.1:5173/?backend=webgl.
- Saving goes through the editor's own local server, not the browser's folder picker (which Brave blocks by default). Brave on Windows is not tested yet; if the preview stays empty, use the address with `?backend=webgl`.

The game-side **test page** (it loads only the runtime and an export folder):

```bash
npm run export -- examples/demo-project
```

```bash
npm run testpage
```

It opens at http://127.0.0.1:5174. See [docs/export.md](docs/export.md).

## What to click

1. The **demo project** opens by itself. On the left: the drawing board's four effects rebuilt (**Tank shell (board)**,
   **Rifle shot (board)**, **Hammer leech beam (board)**, **Molotov flame pit (board)**) and the two milestone 1 demos.
   **Projects…** opens the other example, **Comic hits**: ten hit effects in four sets.
2. Press **Fire** (or the F key) to play the effect from the shooter to the target, or **Play** to loop it on the timeline.
3. The bar above the preview:
   - **Scene**: who fires and what stands around. Each board effect opens in the board's own set-up; each effect remembers
     its scene (in `project.json`).
   - **Faction that fired**: Soviets, Allies or Empire. Team and glow colours follow it.
   - **Made by**: an **enemy**, **your team** or **you**. An enemy's effects get solid ink edges; your team's get thin
     broken ones; a gun's sound word shows only to the one who fired.
   - **Distance from you**: comic words shrink with it (full size to 2 m, 60 % from 5 to 8 m, gone at 11 m). In the tank
     shell's scene it moves the landing point away from you.
   - **View**: whole screen, game size, or a close-up on the muzzle or the target.
4. **Drag on the ground** to move the target. Hold Shift and drag to move the shooter.
5. **Play**, **Loop**, the **speed** buttons and the **timeline** work like a video player. The strip under the ruler shows
   the phases: wind-up, peak, fade. The ← and → keys step 1/12 of a second.
6. The right panel: the four **big controls**, the three **phase** lengths, then the selected **layer**. Shapes, bursts and
   words show every setting the file has, with optional parts behind a switch.
7. **＋ Add…** adds a layer of any kind. **From preset…** copies one of the ready-made effects into your project.
8. **Tier** (Low, Medium, High) in the bar above the preview draws one quality tier. Layers left out fade in the list and on
   the timeline. A layer's **Shows in** boxes set its tiers.
9. **Game events it answers**, under the effect's name: the names the game starts it by, such as `rifle.shot`. A name another
   effect already answers is named as you type.
10. **Cost** (lower in the right panel; the triangle count above the preview jumps there): press **Measure** for draws, sprites
    alive, triangles, screen area and CPU ms, per tier. Type budgets under the numbers. See [docs/cost.md](docs/cost.md).
11. **Export…** writes the folder the game loads into `exports/`; **Projects…** → **Import an export** makes a project from one.
12. **Click a colour swatch** (under Colour in the right panel): a colour picker opens. Change the colour, add colours, and
    under **Gradients** start from a ready-made gradient or make your own; a glow can use one, and smoke, the fire's bed and
    bursts draw one named in their file. See [docs/colours.md](docs/colours.md).
13. **Night mode** in the top bar: dark panels (the preview keeps the game's colours). It is remembered.
14. The examples cannot change. **Save as…** makes your own copy in `projects/`. That folder is kept out of git, so your art
    never goes to this public repo.

Keys: press **Keys** in the top bar.

## The packages

| Package | What it is |
|---|---|
| `packages/vfx-format` | The effect file: its types, the version number and the palette. In `/validate`: the schema, the checker and the upgrades between versions. |
| `packages/vfx-runtime` | Plays effect files on three.js. It has no editor code: this is what ships in the game. It imports only three.js. |
| `packages/vfx-editor` | The editor web app, and the small local server that saves, opens, exports and imports project folders. |
| `packages/vfx-testpage` | The game-side test page: loads only `vfx-runtime` and an export folder, and plays effects by event name. |

How the runtime works, in one line: give it an effect, a seed, a time and the inputs (origin, target, faction), and it draws that moment. It keeps no hidden state, so the same seed and time always give the same picture.

The effect file format is described in plain words in [docs/format.md](docs/format.md), the export folder in
[docs/export.md](docs/export.md), the cost numbers in [docs/cost.md](docs/cost.md), and colours and gradients in
[docs/colours.md](docs/colours.md).

## Checks

```bash
npm test
```

The unit tests (379): the format, the checker and the upgrades from versions 1, 2, 3 and 4; word chances (the four rules,
the checker's warnings, and the word each play shows: what is drawn, and the same as version 4 for every seed when no word
has a chance); the word odds over 1,000 plays, near the four rules' shares; the words box keeping chances; the colours each
layer can use, checked against the real runtime (every example drawn at 60 frames a second for every made-by, tier and
faction, and made-up layers of every kind, edge and gradient: the list holds every colour the runtime asks the palette
for), and the checker naming one the palette lacks; the layers the runtime cannot draw, and why; palettes with gradients
and their upgrade; colour edits and their undo; glows drawn from gradients; gradients on smoke, the fire's bed and bursts
(colours at given ages and places, banded edges at the stops, alpha, faction roles, both bed parts on the same band edges,
and a banded gradient at the tones' places drawing today's bed exactly); the palette; same-seed playback; steps, phases,
flights and arcs; every shape kind, bursts and words; friend or foe; quality tiers; the item count behind "sprites alive";
the letters (A to Z and !, built from their data, no stroke thinner than the board's); the fire's layout; every example
effect drawn all through; undo and redo; the project file server; the export checker; export, import and export again
giving the same files on both examples; the runtime's loader and its version guard; the screen-area count and the cost
measurement.

```bash
npm run check:browser
```

A headless browser check on WebGPU and WebGL 2 (141 checks): palette colours read back exactly; the ground and walls cut
what they should; the board presets look the same on WebGPU as on WebGL 2; the editor's transport, undo, Fire, dragging,
the generated forms, the words box (a word typed again keeps its chance), the layers that cannot draw (an image that did
not load, one not in the project), the add menu, phase starts, New from preset, tiers, game events (unsaved ones are asked
about before leaving), the cost panel and budgets, Save as, Export and Import; the test page on both backends (exact
palette colours, every event plays, Low draws less, the version guard, a glow drawn from an exported gradient in its exact
colours) and its bundle (no checker, no editor code); the colour picker (a typed colour, a drag and Revert, a new colour),
a ready-made gradient on a glow, night mode, the faction markings, and Save as, Export and Import carrying the project's
palette.json. It saves screenshots to `out/screenshots/`.
It needs Playwright's Chromium (`npx playwright install chromium` once on a new machine).

```bash
npm run typecheck
```

## Looking closely

These write pictures to `out/` (kept out of git):

- `npm run compare` puts the drawing board (left) and Shamble VFX (right) side by side, at the board's key moments. Add an
  effect name to do one (`npm run compare -- shell`), and `--both-sides`, `--all-factions` or `--low` (the board's Low
  setting next to our Low tier). It needs the board file in `style-guide/`.
- `node tools/contact-sheet.mjs --project=examples/hits-collection` shows every effect of a project at four moments on one
  picture (`--relation=team`, `--zoom=1` for big effects, `--tier=low`).
- `node tools/tier-sheet.mjs` puts Low, Medium and High side by side at the game camera, at the game's real size: the four
  board presets, or `--project=… --effects=… --times=…` for others. For judging whether Low stays readable.
- `node tools/gradient-sheets.mjs` draws test gradients on smoke, the fire's bed, sparks and image pieces, one sheet each, in
  `out/gradients/` (`--faction=allies` for another faction). It makes a throwaway project in `out/gradients/project/`.
- `node tools/letter-sheet.mjs` draws our letters with the real runtime, in the comic word style: the alphabet upright and in
  the comic layout, J, Q, V, X and Y close up between the board's letters, words that use them, and the same words at game
  size. It writes `out/letters/letters.png`, and `out/letters/game-size.png` (the game-size row 3 times larger, pixel for
  pixel), from a throwaway project in `out/letters/project/`.
- `npm run export`, `npm run check:export` and `npm run import`: see [docs/export.md](docs/export.md).
- `node tools/shoot.mjs <effect> <scene> <ms,ms>` takes the game screen of one effect at chosen moments.
- `tools/presets/*.py` wrote the preset files (Python 3, optional: the JSON files are what counts, and the editor edits them).

## What works now

- **Effect files, version 5** ([docs/format.md](docs/format.md)), with upgrades from versions 1, 2, 3 and 4.
  - **Colours per project**: the project's own `palette.json` (version 2, with gradients), edited with the colour picker;
    the built-in palette for projects without one ([docs/colours.md](docs/colours.md)).
  - **Gradients**: smooth or banded ramps in the palette. A glow runs one from its middle to its rim, smoke over each
    puff's life, the fire's bed from its rim to its middle (one band per stop), and a burst over each piece's life.
  - **Quality tiers**: every visible layer says in which tiers it shows (Low, Medium, High). The game picks one tier; the
    timing stays the same in every tier. All examples have tiers (proposals, see below).
  - Five layer types: **sprite**, **projectile** (by speed, a fixed time or one phase; with an arc), **shape** (14 comic
    shapes made in code), **burst** (pieces thrown out) and **word** (sound words in our own letters, A to Z and !).
  - **Words with chances** (version 5): each word of a word layer can have a chance in percent; words without one share what
    is left, and when every word has one and they add up to less than 100, the rest of the plays show no word. A word layer
    with no chances shows the same word for every seed as before. Setting chances in the editor comes with the new UI; the
    words box keeps them when you type the list again. The odds are counted over 1,000 plays with the runtime's own pick,
    ready for the new UI to show.
  - **The letters J, Q, V, X and Y**: drawn by Shamble VFX in the drawing board's style, so a word can use every letter from A
    to Z. They wait for the Art lead's review (see Assumptions).
  - **Phases**: wind-up, peak and fade. Layers start with a phase, last until one ends, or break up during one.
  - **Friend or foe** per layer, by edge: solid ink for an enemy's, thin and broken for your own team's.
- **The drawing board's four effects** as presets, compared side by side with the board at its key moments, both sides and
  all factions: the tank shell with its word, the rifle shot with its tracer, the Hammer's leech beam, the Molotov flame pit.
- **Comic hits**, an example project of ten hit effects in four sets: small arms (spark, dust, ricochet), impact bursts
  (layered star, cloud blast, jagged double burst), heavy (big blast, puff cluster) and energy (zap, pulse).
- **The preview**: scenes from data (the street and the board's set-ups, with a tank blockout), the faction, made-by and
  distance switches, the game camera checked against the board's projection.
- **The editor**: forms for every layer type, phase lengths and a phase strip, the add menu, New from preset, undo and redo
  for every edit, save and open of project folders.
- **Drawing**: everything is triangles in at most four draw calls per frame (stains, light on the ground, the rest on the
  ground, everything over the scene), in strict layer order.
- **Cost** per effect and tier ([docs/cost.md](docs/cost.md)): draws, sprites alive, triangles, screen area and CPU ms,
  against budgets you type. None is decided, so none is made up.
- **The colours each layer uses**: the checker knows every colour a layer can use, named or not: the roles its fields name,
  the black ink outline, a star's white first step, your own team's broken edge (`heat.rim`) and its gradient's stops. It
  names any the palette lacks, and what the layer needs it for ([docs/colours.md](docs/colours.md)).
- **Layers that cannot draw**: the runtime notes, frame by frame, each layer it skips because its image is not in the atlas.
  The editor turns that into plain words ("the image muzzle_flash.png did not load", "the image … is not in the
  project"), ready for the new UI. A layer the tier leaves out is not a fault and gets no note.
- **The export** ([docs/export.md](docs/export.md)): one folder with a manifest (effect names, versions and the game events
  each answers), one JSON file per effect, one packed atlas with its map. A checker names missing images, unknown roles and
  schema errors. Importing an export gives back the same effects.
- **The test page**: loads only the runtime and an export folder and plays an effect by event name, on WebGPU or WebGL 2.

- **The editor's look**: night mode, and icons drawn in code for every button (with the words kept); the faction buttons
  show each faction's marking from sheet 16.

Not yet: sound, camera shake and hit-stop; a shade input so smoke darkens in shadow; a way for tiers to drop parts of one
layer (such as tones in a star), not only whole layers; a gradient choice for smoke, the bed and bursts in the editor's form
(the runtime draws them; the choice comes with the new UI); renaming or removing colours and gradients; showing the word odds,
the colours a layer uses and the layers that cannot draw (the functions are there; the new UI shows them).

## Assumptions

These are Shamble VFX's own guesses, not Mustafa's decisions. Tell us if one is wrong.

- **What the big controls change** (all in one place: `vfx-runtime/src/core/controls.ts`):
  - Size scales sprites and offsets.
  - Intensity scales flashes, hits and landings, and the stretch of streaks. It never makes anything see-through.
  - Duration stretches the effect's own times, not flight time and not the step rate.
  - Colour picks the main role.
  - On a flipbook, duration holds each frame for whole steps (2× holds each frame two steps), so the comic step rate stays 12 a second. Below 1.5× it does not change a flipbook, and it never makes one shorter.
- **Depth pull.** A layer standing up is pulled towards the camera by as much as it reaches below its anchor, plus 0.4 m,
  so the ground never cuts it and it draws over its own unit (as the board draws effects). Something less than about its
  own size plus 0.4 m behind a wall can show through. Layers flat on the ground sit 5 cm above it.
- **The ground is flat, at height 0.** Layers that face the ground lie on it under their anchor.
- **Drawn shapes along a path stay upright**: a flash for a shot to the left is mirrored, not turned upside down, so smoke
  still rises.
- **"Stretch along the path"** is a length factor. A riding streak never reaches back past the start of the path or past its end.
- **Projectile offsets** are given in the "shot frame": right, up, and forward towards the target.
- **The stand-in's pose** (rifle aimed forward) and its few sizes the sheet does not give are under `standIn.assumed` in `packages/vfx-editor/src/preview/scene-data.json`.
- **Blending in linear light.** three.js blends half-transparent pixels and added light in linear light; the drawing board
  (Canvas 2D) blends in sRGB. Solid colours match exactly. A half-transparent edge differs by about 18 levels (out of 255),
  and glows look a little weaker than on the board. The game's renderer setup decides; the runtime follows it.
- **Light on the ground uses screen, not add**, so it always sits under the shapes drawn on top of it.
- **Smoke, dust and chips do not darken in shade.** The board shades them inside its band of shadow; the runtime has no
  shade input yet (a question for milestone 3).
- **Scenes and the tank blockout** use the drawing board's positions and sizes, so the side-by-side pictures line up.
- **Milestone 3 proposals**: what each example drops in Low and Medium (Low follows the drawing board's own Low setting
  where it has one); the Medium tier itself; the game event names (`rifle.shot`, `tank.shot`, `hammer.leech`,
  `molotov.land`, `hit.bullet.metal`, …); `palette.json` travelling inside each export; one set of budgets per project.
- **"Sprites alive"** counts items (each sprite, particle, dot, letter, flame tongue and shape once), since the runtime draws
  triangles, not sprites. A halftone field counts each dot.
- **The test page** repeats the board's camera numbers and the rifle scene's positions; the game brings its own.
- **Board data in the repo**: the tank blockout, scene positions, preset sizes and timings, layouts and formulas stay in this
  public repo (Mustafa's yes, 2026-11-15).
- **Colours after milestone 3** (proposals): one palette per project; the nine ready-made gradients; `team.dark` and
  `glow.hot` worked out again only when asked; the night mode's greys; the icons.
- **Word chances** (the rules themselves are the approved plan, and "the rest shows no word" is Mustafa's choice): a chance may
  have decimals (12.5 %); chances that add up to 100 within a billionth (33.3 + 33.3 + 33.4) count as exactly 100. In the
  words box, a word typed again keeps its chance when its text is the same, capitals or not (words are drawn in capitals); a
  word typed twice is matched in order (the first BOOM takes the first old BOOM's chance).
- **The colours a layer can use** (the plan says which ones; how far the list reaches is ours):
  - The list holds every colour the runtime looks up for the layer, which is a little more than it can show: a burst's ink
    when its pieces have no ink edge (and an image burst's), a dashed or closing ring's ink, a burst's own colour when a
    gradient colours its pieces. The checker asks the palette for all of them, so it can name a colour the palette lacks
    even where nothing would show it. The built-in palette has them all.
  - A colour a field names is always listed, even where nothing draws it (a scorch core of size 0, the tones a bed's
    gradient replaces, a fifth flame tone): the checker checks every named colour, so a palette must keep it.
  - The test that compares the list with the runtime draws each example at 60 frames a second for every made-by, tier and
    faction. In the examples the runtime asks for every colour on the list. The made-up layers name the roles it never asks
    for, and why.
- **Layers that cannot draw**: a note is about the moment shown (the runtime's note on the last frame), so a layer that is
  not on at that moment gets none. Both notes name the image ("the image dust_puff.png is not in the project").
- **A fire's bed and its gradient**: the checker treats all the bed layers of one effect as one fire, so it compares every
  detail layer with every lumps layer. An effect with two separate fires may get a warning it does not need.
- **How the runtime draws gradients on the bed** (the plan says only "band edges at the stops" and "a smooth one blends"):
  - A place on the bed is 1 minus its distance from the middle, divided by the bed's radius. A band's edge is where its lumps
    reach on average. Without a gradient the tones keep their places (0.58 k / (K − 1) + 0.03 k), so a banded gradient at
    those places draws exactly today's bed.
  - A smooth gradient gets the same bands as a banded one (one per stop; a stop at the very middle gives none). Each point
    takes the colour of its place, kept inside its band, so the middle still cools first. The detail's halftone takes the
    next band's colour (smooth: halfway into it). The white-hot spots are more of the middle band (smooth: coloured by place).
  - Lumps are never more than 0.6 of a band, and bands close together shift towards the camera less, so each stays inside
    the last. A stop's alpha makes its band see-through.
- **Alpha in smoke and burst gradients** fades every part of the puff or piece: rim, light top and halftone; ink edge and
  speed streak (they keep their colours). Each part is see-through on its own, so overlapping rounds look denser, as with a
  layer's alpha. A puff or piece at alpha 0 is not drawn, and not counted in "sprites alive".
- **The letters J, Q, V, X and Y** are our own drawing in the board's style: proposals that wait for the Art lead's review
  (marked in `letters.json` and in the header of `letters.ts`). Each is built from the board's own letters:
  - J is the U's right half with a short hook (up to 2.9 of 7). Q is the O with a tail, cut flat 1 unit under the line.
    V is the A upside down, without its bar. X crosses a little above the middle (its top is 0.15 narrower on each side).
    Y has arms 25° from upright and a stem 1.8 wide. Their strokes are 1.45 to 1.8 units thick, inside the board's own range
    (1.1 for the A's bar to 1.9 for the I).
  - The Q's tail is the only part of any letter below the line. It also reaches 0.4 past the Q's width, under the next
    letter, so the gap after the Q's round part stays near the others: 0.9 units (most letters leave 0.5, the R 0.7).
  - No new format version: the files keep their shape. A word with these letters used to leave them out (the checker
    warned); now it draws them.

## Claude skills

`.claude/skills/ui-sdk` is Vercel Labs' UI SDK skill (Apache 2.0), copied unchanged from github.com/vercel-labs/ui. It guides
building interfaces with the `@ui-sdk` library. The library itself is not installed: installing it was blocked in the cloud
session. To add it on your computer:

```bash
npm install --workspace=@shamble/vfx-editor @ui-sdk/web @ui-sdk/core
```

## Folders kept out of git

- `style-guide/`: Mustafa's style files (the drawing board, the sheets).
- `projects/`: your effect projects.
- `out/`: screenshots and other output of the checks.
- `exports/`: export folders (they hold the project's images).
