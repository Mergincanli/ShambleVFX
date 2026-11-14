# Shamble VFX

The effects editor for **Shamble Frontlines**, and the small runtime that plays its effects in the game.

You make an effect, see it exactly as the game will show it (same camera, same code, same data), and save files the game loads unchanged.

Status: **milestone 1** (the core, with sprites and one projectile). Milestones 2 and 3 are not built yet. See [What works now](#what-works-now).

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

## What to click

1. The **demo project** opens by itself. Pick **Rifle shot (demo)** or **Tank shell flight (demo)** on the left.
2. Press **Fire** (or the F key): the effect plays from the soldier's muzzle to the target ring.
3. **Drag on the ground** to move the target. Hold Shift and drag to move the soldier.
4. **Play**, **Loop**, the **speed** buttons (1×, ½×, ¼×, ⅒×) and the **timeline** work like a video player. Drag on the timeline to scrub. The ← and → keys step 1/12 of a second.
5. The right panel opens with the four **big controls**: size, intensity, duration and the main colour role. Click a **layer** on the left to see its details, folded into Image, Size and place, Colour and Time.
6. **Faction that fired** switches Soviets, Allies and Empire. The team and glow roles follow it, and so does the soldier.
7. **View**:
   - **Whole screen** shows one 1080p game screen, with its scale written in the corner.
   - **Game size** shows the real game size.
   - **Close-up** shows twice the game size.
8. The demo is an example and cannot change. **Save as…** makes your own copy in `projects/`. That folder is kept out of git, so your art never goes to this public repo.

Keys: press **Keys** in the top bar.

## The packages

| Package | What it is |
|---|---|
| `packages/vfx-format` | The effect file: its types, the version number and the palette. In `/validate`: the schema, the checker and the upgrades between versions. |
| `packages/vfx-runtime` | Plays effect files on three.js. It has no editor code: this is what ships in the game. It is 15 kB and imports only three.js. |
| `packages/vfx-editor` | The editor web app, and the small local server that saves and opens project folders. |

How the runtime works, in one line: give it an effect, a seed, a time and the inputs (origin, target, faction), and it draws that moment. It keeps no hidden state, so the same seed and time always give the same picture.

The effect file format is described in plain words in [docs/format.md](docs/format.md).

## Checks

```bash
npm test
```

This runs the unit tests:
- the format, the checker and the upgrades;
- the palette;
- same-seed playback, also when the time jumps around;
- steps, flight time and the big controls;
- the camera against the drawing board's own projection;
- undo and redo, including 1000 random edits undone and redone;
- the project file server and the atlas packer.

```bash
npm run check:browser
```

This runs a headless browser check. It works on WebGPU and on WebGL 2:
- every palette role must read back as its exact hex;
- the ground must not cut a sprite, and a wall must hide one;
- the editor must draw;
- it tries the transport (play, pause, Space, steps, scrubbing, ¼ speed), undo and redo, Fire, dragging the target in every view, and Save as (then opens the saved project again);
- it saves 1920 × 1080 screenshots to `out/screenshots/`;
- it checks that the runtime holds no editor code.

It needs Playwright's Chromium (`npx playwright install chromium` once on a new machine).

```bash
npm run typecheck
```

## What works now

- **Effect files, version 1.**
  - Two layer types: **sprite** (one image or a flipbook) and **projectile** (start, end, speed, stretch along the path, spin).
  - A layer starts with the effect or when a projectile lands.
  - Each layer moves in whole steps (12 a second by default) or smoothly.
- **The checker.** It names schema errors, unknown colour roles, missing images, hex colours, broken links between layers and missing lengths, live in the editor.
- **Colours are role names only.** The hexes live in one palette file, `packages/vfx-format/palette/palette.json`, and each value says whose it is.
- **The preview** shows:
  - the game camera, checked to within half a pixel of the drawing board's projection;
  - the palette A street, with a band of shade;
  - the Conscript stand-in (Sheet 16), the wall for cover (Sheet 17), flat shadows and ink lines.
- **Editing:**
  - undo and redo for every edit (one slider drag is one step);
  - save, open and "save as" of project folders;
  - PNG images packed into one atlas, as the export will do.

Not yet (later milestones):
- shapes, bursts, comic words, phases, the "made by" switch and the distance slider (milestone 2);
- the cost panel, quality tiers, the export folder and the game test page (milestone 3).

## Assumptions

These are Shamble VFX's own guesses, not Mustafa's decisions. Tell us if one is wrong.

- **What the big controls change** (all in one place: `vfx-runtime/src/core/controls.ts`):
  - Size scales sprites and offsets.
  - Intensity scales flashes, hits and landings, and the stretch of streaks. It never makes anything see-through.
  - Duration stretches the effect's own times, not flight time and not the step rate.
  - Colour picks the main role.
  - On a flipbook, duration holds each frame for whole steps (2× holds each frame two steps), so the comic step rate stays 12 a second. Below 1.5× it does not change a flipbook, and it never makes one shorter.
- **Depth pull.** A sprite is pulled towards the camera by as much as it reaches below its anchor, so the ground (or the wall it sits on) never cuts it. A sprite less than about its own size behind a wall can show through.
- **"Stretch along the path"** is a length factor. A riding streak never reaches back past the start of the path or past its end.
- **Projectile offsets** are given in the "shot frame": right, up, and forward towards the target.
- **The stand-in's pose** (rifle aimed forward) and its few sizes the sheet does not give are under `standIn.assumed` in `packages/vfx-editor/src/preview/scene-data.json`.
- **Blending of soft edges.** three.js blends half-transparent pixels in linear light, while the drawing board (Canvas 2D) blends in sRGB. Solid colours match exactly. A half-transparent edge differs by about 18 levels (out of 255). The game's renderer setup decides, and the runtime follows whatever colour setup the game uses.

## Folders kept out of git

- `style-guide/`: Mustafa's style files (the drawing board, the sheets).
- `projects/`: your effect projects.
- `out/`: screenshots and other output of the checks.
