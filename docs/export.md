# The export: what the game loads

An export is one folder made from a project. The game loads it with `vfx-runtime` only: no editor, no checker.

```
exports/demo-project/
  manifest.json            the effects, their versions, and the game events each answers
  palette.json             the colours: roles (team colours per faction) and gradients; the project's own, or the built-in one
  atlas.png                every image the effects use, packed on one page (plus two small blocks of the runtime's own)
  atlas.json               where each image sits on the page
  effects/<id>.vfx.json    one effect file each, in the current effect format (version 4)
  editor.json              the editor's own notes (preview scenes, budgets): the game ignores it
```

`exports/` is kept out of git: an export holds the project's images.

## Make one

- In the editor: **Export…** in the top bar. It exports the project **as saved on disk**: with unsaved changes it asks first
  (Save, then export; or export what is saved). An example cannot be saved, so Save as first to export your changes.
  A report says what went where, or what stopped it.
- From the command line, the same code:

```bash
npm run export -- examples/demo-project
```

That writes `exports/demo-project/`. A second argument picks another folder.

Export **checks first and writes nothing when something is wrong**: schema errors, unknown colour roles, missing images,
an event written badly, or one event answered by two effects. It warns (and still exports) when an effect answers no event,
and when an image is in the project but no effect uses it (it is left out of the atlas).

The folder is replaced as a whole, never merged into, so an effect deleted from the project does not stay in the export.
It only ever replaces an earlier export: a folder that holds other files, or one inside the project, is refused.

## Check one

```bash
npm run check:export -- exports/demo-project
```

It names missing images, unknown roles, schema errors, effects of another version, and anything in the manifest that does
not match the files. The game's build can run the same checker (`checkExport` in `@shamble/vfx-format/validate`).

## Import one

- In the editor: **Projects…**, then a name under **Import an export**.
- From the command line: `npm run import -- exports/demo-project projects/demo-back "Demo back"`.

Import makes a **new** project (it never writes into a folder that has files): the effect files exactly as they are in the
export, each image cut back out of the atlas pixel for pixel, the game events, and the preview scenes and budgets from
`editor.json`. Exporting that project again gives the same files, byte for byte (the tests check this on both examples).

## The manifest

```json
{
  "format": "shamble-vfx-export",
  "version": 1,
  "name": "Demo project",
  "effectVersion": 4,
  "palette": "palette.json",
  "atlas": { "image": "atlas.png", "map": "atlas.json", "width": 2048, "height": 892 },
  "effects": [
    { "id": "board_muzzle", "name": "Rifle shot (board)", "version": 4, "file": "effects/board_muzzle.vfx.json", "events": ["rifle.shot"] }
  ],
  "events": { "rifle.shot": "board_muzzle" }
}
```

- `version` is the export folder's own version; `effectVersion` is the version every effect file is in.
- `events` is the lookup the game uses: event name → effect id. **One event plays one effect.** An effect can answer
  several events.
- An event name is lowercase words joined by dots, such as `rifle.shot` or `tank.shell.land`.
- The event names in the example projects (`rifle.shot`, `tank.shot`, `hammer.leech`, `molotov.land`, `hit.bullet.metal`, …)
  are **proposals**. The game's real event names are not decided yet.

## In the game

```ts
import { EffectPlayer, loadExport, VfxRenderer } from '@shamble/vfx-runtime';

const fx = await loadExport('/vfx/');                 // the export folder's URL
const vfx = new VfxRenderer(fx.palette);
vfx.setAtlas(fx.atlas);
vfx.tier = 'medium';                                   // the player's quality setting
scene.add(vfx.object);
const player = new EffectPlayer();

// When something happens:
player.start(fx.effectFor('rifle.shot')!.id, {
  seed, nowMs, faction: 'soviets', relation: 'enemy', viewerDistanceM: 6,
  inputs: { origin: [x, y, z], target: [x, y, z] },    // world metres, y up
});

// Every frame, before rendering:
vfx.begin(camera);
vfx.drawPlaying(player, nowMs, fx.lookup);
vfx.end();
```

`loadExport` reads the folder with plain checks and plain-word errors (a `VfxLoadError`):

- not an export: "… is not a Shamble VFX export: export the project again with the editor";
- a newer export or newer effects: "… update the runtime";
- older effects: "the effects in this export are version 3, and this runtime plays version 4: export them again with the
  editor, which upgrades old effects";
- a missing file, an atlas of the wrong size, or an event that points at an effect not in the folder.

It loads `atlas.png` with its exact pixels (no premultiplying, no colour conversion).

## The test page

```bash
npm run testpage
```

It opens http://127.0.0.1:5174: a page that loads **only** `vfx-runtime` (and three.js) and an export folder from
`exports/`, and plays effects by game event name. Pick the export and the event; set the tier, the faction that fired, who made
it, where the target is and how far you are. The line at the bottom shows the backend, the triangles, the draw calls and the
milliseconds a frame. Add `?backend=webgl` to the address to try the WebGL 2 fallback.

It proves the game can use the files without the editor. The browser check runs it on WebGPU and on WebGL 2, and checks that
its bundle holds no checker (zod) and no editor code.

What it assumes (the game brings its own):

- **The camera**: the drawing board's game camera numbers (35.3° above the ground, 15° lens, turned 45°, 100.7 px per metre at
  1080p), repeated in `packages/vfx-testpage/src/main.ts`.
- **Where shots come from and go to**: the board's rifle scene (a shooter at the left, a target at the right). In the game, the
  event brings these.
- **Colour**: three.js's default setup, the same as the editor: colour management on, blending in linear light, sRGB on
  screen. The runtime follows `ColorManagement.enabled`, so a game that turns colour management off gets the palette hexes
  too (this is milestone 2's open question).
