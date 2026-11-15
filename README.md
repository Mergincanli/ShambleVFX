# Shamble VFX

The effects editor for **Shamble Frontlines**, and the small runtime that plays its effects in the game.

You make an effect, see it exactly as the game will show it (same camera, same code, same data), and save files the game loads unchanged.

Status: **milestone 3**: cost per effect, quality tiers, and the export folder the game loads, with a test page that plays
it using only the runtime. Milestones 1 and 2 built the editor, the comic shapes and words, the drawing board's four effects
and a collection of comic hits. See [What works now](#what-works-now).

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
12. The examples cannot change. **Save as…** makes your own copy in `projects/`. That folder is kept out of git, so your art
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
[docs/export.md](docs/export.md), and the cost numbers in [docs/cost.md](docs/cost.md).

## Checks

```bash
npm test
```

The unit tests (210): the format, the checker and the upgrades from versions 1 and 2; the palette; same-seed playback;
steps, phases, flights and arcs; every shape kind, bursts and words; friend or foe; quality tiers; the item count behind
"sprites alive"; the letters; the fire's layout; every example effect drawn all through; undo and redo; the project file
server; the export checker; export, import and export again giving the same files on both examples; the runtime's loader and
its version guard; the screen-area count and the cost measurement.

```bash
npm run check:browser
```

A headless browser check on WebGPU and WebGL 2 (125 checks): palette colours read back exactly; the ground and walls cut
what they should; the board presets look the same on WebGPU as on WebGL 2; the editor's transport, undo, Fire, dragging,
the generated forms, the add menu, phase starts, New from preset, tiers, game events (unsaved ones are asked about before
leaving), the cost panel and budgets, Save as, Export and Import; the test page on both backends (exact palette colours, every event plays, Low draws less, the version
guard) and its bundle (no checker, no editor code). It saves screenshots to `out/screenshots/`.
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
- `npm run export`, `npm run check:export` and `npm run import`: see [docs/export.md](docs/export.md).
- `node tools/shoot.mjs <effect> <scene> <ms,ms>` takes the game screen of one effect at chosen moments.
- `tools/presets/*.py` wrote the preset files (Python 3, optional: the JSON files are what counts, and the editor edits them).

## What works now

- **Effect files, version 3** ([docs/format.md](docs/format.md)), with upgrades from versions 1 and 2.
  - **Quality tiers**: every visible layer says in which tiers it shows (Low, Medium, High). The game picks one tier; the
    timing stays the same in every tier. All examples have tiers (proposals, see below).
  - Five layer types: **sprite**, **projectile** (by speed, a fixed time or one phase; with an arc), **shape** (14 comic
    shapes made in code), **burst** (pieces thrown out) and **word** (sound words in our own letters).
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
- **The export** ([docs/export.md](docs/export.md)): one folder with a manifest (effect names, versions and the game events
  each answers), one JSON file per effect, one packed atlas with its map. A checker names missing images, unknown roles and
  schema errors. Importing an export gives back the same effects.
- **The test page**: loads only the runtime and an export folder and plays an effect by event name, on WebGPU or WebGL 2.

Not yet: sound, camera shake and hit-stop; a shade input so smoke darkens in shadow; a way for tiers to drop parts of one
layer (such as tones in a star), not only whole layers.

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

## Folders kept out of git

- `style-guide/`: Mustafa's style files (the drawing board, the sheets).
- `projects/`: your effect projects.
- `out/`: screenshots and other output of the checks.
- `exports/`: export folders (they hold the project's images).
