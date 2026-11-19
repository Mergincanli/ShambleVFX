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

- It uses the **WebGPU** renderer when your browser has it, and the **WebGL 2** fallback otherwise. The right end of the status bar, at the bottom, says which. To try the fallback on purpose, open http://127.0.0.1:5173/?backend=webgl.
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
   **Projects…** in the main menu (the logo at the top left), or a click on the project's name, opens the other example,
   **Comic hits**: ten hit effects in four sets.
2. Press **Fire** (or the F key) to play the effect from the stand-in to the target, or **Play**, in the timeline's header, to
   loop it on the timeline.
3. The bar above the preview: **Fire**, then chips that show the current value. Click a chip (or press Enter on it) for a
   menu of the choices: the arrow keys move in it, a letter jumps to the choice that starts with it, Enter chooses, Esc
   closes it. Rest the pointer on a chip for its name and what it does.
   - **Scene**: who fires and what stands around. Each board effect opens in the board's own set-up; each effect remembers
     its scene (in `project.json`).
   - **Faction that fired**: Soviets, Allies or Empire; the chip shows the faction's marking in its team colour. Team and
     glow colours follow it.
   - **Made by**: an **enemy**, **your team** or **you**. An enemy's effects get solid ink edges; your team's get thin
     broken ones; a gun's sound word shows only to the one who fired.
   - **Distance from you** ("4.0 m"): drag the chip sideways to change it (0.1 m for every 4 px, 1 m with Shift), or click
     it for a slider and a box to type in ("0,5" works as well as "0.5"). Comic words shrink with it, each by its own curve
     (a new word: full size to 2 m, 60 % from 5 to 8 m, gone at 11 m). In the tank shell's scene it moves the landing point
     away from you.
   - **Tier**: see 8.
   - **View**, on the right: whole screen, game size or a close-up (the keys 1, 2 and 3 too), and in the same menu what the
     close-up centres on, the muzzle or the target. The chip also shows the scale ("59 %"): how large the preview shows the
     game screen; the 1920 × 1080 frame is outlined, and the scene outside it dimmed.
   - **Fade other layers**, the striped square left of View: on at first. While a layer is selected, or its row is under
     the mouse in the Layers list or on the timeline, the other layers fade in the preview, so you see which part of the
     effect it is; a projectile keeps the layers riding it. Off, the preview shows the game's look. It is remembered.
4. **Drag the ground** to move the target. **Shift + drag** moves the stand-in. The status bar says so while the pointer is
   over the preview.
5. The timeline's header (**Play**, the steps, **Loop**, the **speed** buttons and the time) and the **timeline** work like a
   video player. Click the time ("89 / 299 ms") to type one: Enter goes there, paused, and Esc leaves it. The strip under
   the ruler shows the phases: wind-up, peak, fade. The ← and → keys step 1/12 of a second.
6. The right panel shows what is selected. No layer: the effect's settings, under a header with a dot in its main colour,
   its name and "Effect" (its name, the four **big controls**, the three **phase** lengths and its colours). Click a
   **layer** (in the Layers list or on the timeline) and the panel shows that layer's settings, under a header with the
   effect's name, "›" and the layer's name: click the effect's name, or press Esc, to go back to the effect's settings.
   They start with **Look**: a live picture of the layer alone, drawn by the game's code on the ground colour, framed on it
   and playing its own time in a loop at the speed the speed buttons set (a layer that rides a projectile flies along its
   path; a projectile shows the layers riding it). Fold it to put it away. A sprite still shows its image under Image. Each
   layer says what draws it: an image ("Image: muzzle_flash.png") or code ("Drawn in code, no image"). A projectile is an
   invisible path: its panel lists the layers riding it (click one to select it), and those say "rides Bullet" in the
   Layers list. Shapes, bursts and words show the settings the file has, with optional parts behind a switch, except two
   that come with the new UI: a word's chance (the words box keeps it when you type the words again) and an image burst's
   image.
7. **＋ Add…** adds a layer of any kind. **From preset…** copies one of the ready-made effects into your project. Each layer
   has an icon for its kind, in the Layers list, on the timeline and in its panel's header: a shape by its kind (a ring, a
   smoke cloud, flames…), a burst by the look of its pieces (sparks, chips, puffs…), a word, a projectile; a sprite shows
   its own image (the first frame of a flipbook).
8. The **Tier** chip (Low, Medium, High) in the bar above the preview draws one quality tier. Layers left out fade in the
   list and on the timeline. A layer's **Shows in** boxes set its tiers.
9. **Game events it answers**, under the effect's name: the names the game starts it by, such as `rifle.shot`. A name another
   effect already answers is named as you type.
10. **Cost** (lower in the right panel; the triangles and the cost in the status bar jump there): press **Measure** for
    draws, sprites alive, triangles, screen area and CPU ms, per tier. Type budgets under the numbers: they are the
    project's budgets, and typing one switches them on. See [docs/cost.md](docs/cost.md).
11. **Export…**, in the top bar and the main menu, writes the folder the game loads into `exports/`; **Import an export…** in the
    main menu (Projects, at its list of exports) makes a project from one (and keeps its colours as a palette profile).
12. **Click a colour swatch** (under Colour in the right panel): a colour picker opens. The list under Colour shows the
    colours of what is selected: the effect's, or one layer's (with the ones it draws without naming them, such as the
    black ink outline); a projectile has none of its own and shows those of the layers riding it. **Show all** shows every
    colour, the selection's in bold. Change the colour, add colours, and under **Gradients** start from a ready-made
    gradient or make your own; a glow can use one, and smoke, the fire's bed and bursts draw one named in their file. See
    [docs/colours.md](docs/colours.md).
13. **Night mode**, the sun or moon button in the top bar, or in the main menu: dark panels (the preview keeps the game's
    colours). It is remembered.
14. **Show hints**, the light bulb left of Night mode, or in the main menu: the one-line hints under the settings, and the
    drag hint over the preview. Off hides them (their full words are in the tooltips); counts, folders and lines that say
    how things stand keep showing, and so does the drag hint in the status bar. It is remembered.
15. The examples cannot change: a lock after the project's name says so. **Save as…** (the top bar's Save button on an
    example, or the main menu) makes your own copy in `projects/`. That folder is kept out of git, so your art never goes to
    this public repo. On your own project the button says **Save**, or **Saved** when there is nothing to save.
16. **Tooltips**: rest the pointer for half a second on a label in the right panel (such as **Place**, **Shape: ring** or
    **Width**), a section's title, or a button or setting in the bars: a short tooltip says what it does and how to use it,
    in plain words, for the layer shown (a ring's Width is its line's thickness). Buttons show their shortcut, and Undo and
    Redo name the step. **Tab** to a button, a box or a list shows its tooltip at once (a box shows its label's, above it);
    **Esc**, a click or scrolling hides it.
17. **The main menu**: click the logo (SHAMBLE VFX) for Projects…, New project…, Save, Save as…, Export…, Import an export…,
    Show hints, Night mode and Keyboard shortcuts. The arrow keys move in it, a letter jumps to the row that starts with it, Enter
    chooses, Esc closes it.
18. **The status bar**, at the bottom: the checks ("All good", or how many problems: click to see them under Checks), this
    frame's triangles and draw calls, and the cost against the budgets (click either for Cost); in the middle, the hint for
    what is under the pointer; on the right, the renderer and **?** for the keyboard shortcuts.
19. **Resize the zones**: drag the lines between them (the left sidebar, the right panel, the effects and the layers, the
    preview and the timeline). Each size is remembered; a double-click puts the default back. With the keyboard focus on a
    line, the arrow keys move it 16 px.

Keys: press **?** (or the ? at the right end of the status bar, or **Keyboard shortcuts** in the main menu).

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

The unit tests (547): the format, the checker and the upgrades from versions 1, 2, 3, 4 and 5 (5 to 6 changes only the
number: a bed keeps its gradient name); every example effect byte for byte as the editor saves it; word chances (the
four rules, the checker's warnings, a total just over 100 % shown with the decimals that say so, and the word each play
shows: what is drawn, and the same as version 4 for every seed when no word has a chance); the word odds over 1,000
plays, near the four rules' shares; the words box keeping chances;
a space in a word drawn as a gap; the colours each layer can use, checked against the real runtime (every example drawn
at 60 frames a second for every made-by and faction, each layer in a tier it shows in, and made-up layers of every kind,
edge and gradient: the list holds every colour the runtime asks the palette for; a test holds the runtime to drawing a
layer the same in each tier it shows in), and the checker naming one the palette lacks; the layers the runtime cannot
draw, and why; palettes with gradients and their upgrade, and palettes with a part missing or empty named in plain
words, never a crash; colour edits and their undo; glows drawn from gradients; gradients on smoke, the fire's bed and
bursts (colours at given ages and places, each burst piece over its own life, banded edges at the stops, a smooth
gradient keeping the bed's own bands, alpha, a banded stop's alpha in its band and in the detail, faction roles, both
bed parts on the same band edges, every band still reaching past the bed's middle, the white-hot spots on the middle
band, and a banded gradient with the tones' band edges drawing today's bed exactly); what the right panel says about
layers (what draws each one, the projectile a layer rides and the layers riding a projectile, the colours of the effect,
a layer or a projectile's riders, from the checker's own list); fading the other layers in the preview (each blend group
as its material reads it, a projectile's riders kept, nothing drawn before the draw changed); the Look's layer alone
(exactly the layer's own triangles in the whole effect, a rider riding, a projectile's riders, a layer the tier leaves
out, the same times), its loop, the moment it holds for a picture and its framing (every moment of three riders inside the
picture, the board rifle's tracer, which crosses the screen in 22 ms, also at Duration 2× and 4×); the checker's warning for a bed's banded gradient with more than 8 stops; the palette; same-seed playback; steps, phases, flights and arcs; every shape
kind, bursts and words; friend or foe; quality tiers; the item count behind "sprites alive"; the letters (A to Z and !,
built from their data, no stroke thinner than the board's); the fire's layout; every example effect drawn all through;
undo and redo; the project file server; `project.json` version 2 and its upgrade from version 1 (the examples written
back byte for byte; the tests' own version 1 files written as today's examples; a newer version refused); budgets at
three levels (which one counts, every edit, only what differs written); `editor.json` version 2 and the older one; the
export checker; export, import and export again giving the same files, byte for byte, on both examples, on a version 1
project with budgets and on a version 2 project with budgets at all three levels and a palette profile (an export of a
project with no palette profile names the one an import makes, after the project); palette profiles (names, the very
same colours, the two defaults, the folder made on first use, every route and store function, a profile file with a part
missing or empty listed with why and deleted like any other, import adding or finding a profile, an import refusing an
export whose palette.json has such a part, loading a profile keeping what the effects use, and the default bed gradient
drawing the Molotov's bed as today); the status bar's cost (not measured, measuring, out of date, measured with no budget
on, within budget, how many numbers over, compared with the budgets that count); the window's grid (the sidebars within
their limits, both giving way so the centre keeps 640 px, the effects list's and the timeline's limits, the sizes
remembered); the runtime's loader and its version guard; the screen-area count and the cost measurement.

```bash
npm run check:browser
```

A headless browser check on WebGPU and WebGL 2 (246 checks): palette colours read back exactly; the ground and walls cut
what they should; the board presets look the same on WebGPU as on WebGL 2; the editor's transport, undo, Fire, dragging,
the generated forms, the words box (a word typed again keeps its chance), the layers that cannot draw (an image that did
not load, one not in the project), the right panel (a layer's settings first, under a header whose effect name, like
Esc, leads back to the effect's settings, but Esc not while typing; what draws each layer; a projectile's riders and the
"rides" tag in the Layers list; the colours of the selection, Show all, and their short animation, none with reduced
motion; the hint about clicking a colour only when there is one to click; one icon per kind of layer in the Layers list,
on the timeline and in the header, a ring showing the ring, a sprite its own image (a long thin one, such as a tracer, as
a slice from its middle) or, when the image is missing, the image icon, and an image burst's tag in Plex Sans), Fade
other layers (the
toggle; the other layers at a quarter by blend group, read in the runtime's own buffers and, on both backends, in the
picture; a projectile's riders kept; a row hovered in the Layers list or on the timeline, but not a scrub that starts on a
lane; effects playing from Fire, a fired copy of the effect shown and one of another effect; the game's look, pixel for
pixel, when it is off; the cost measurement unchanged), the Look (each kind of layer drawn, held at the moment shown, drawn
only while its panel shows it and the page is visible, its renderer and WebGL context let go when it is folded or no layer
is selected, and playing in a loop while the editor runs), the tooltips (after the 500 ms hover delay and not before,
150 ms when one was just open, at once on Tab and not on focus the editor moves; the help text for a label where it is,
such as a ring's Width; a title moving into the tooltip; a name in brackets, "Smoke (2)", kept whole; Undo naming the step;
hidden by a press, a scroll and Esc, which still leaves the layer; no tooltip after a click on a row built again under the
pointer; drawn over the colour picker, 12 px, at most 280 px, dark in both themes; names of controls unchanged; the "rides"
tag and the line saying what draws a layer explaining themselves; and every
label and section title of every layer of both examples, and every control of the bars, with a help text), the add menu,
phase starts, New from preset, tiers, game events (unsaved ones are asked about before leaving), the cost panel and budgets (a typed number switches on the project's budgets, and the card
says which level counts, in one or two lines even for a class with a long name), saving after deleting an effect (its
budgets leave project.json, and come back with undo and the next save), the preview drawn once per screen frame, the
shell (the window's grid at 1920 × 1080 and 2560 × 1440, with at least 8 track rows and 14 layer rows showing at 1920; the four
splitters: a drag, their limits (the Layers section's buttons staying in the column with the effects list at its largest),
the sizes remembered after a reload, a double-click putting the default back, the arrow keys, the preview drawn at its new
size while one is dragged, the Look following; the status bar: the checks and a click
to them, the triangles and draw calls, the cost's states, the renderer, the hint over the preview, messages above it; the
main menu: below the logo, its keys, Esc giving the focus back, Tab too (with no error), a second click and a click outside
closing it, every row; the ? key, not while typing; the scale in the View chip; typing a time in the timeline's
header, and the time's focus ring clear of the text after it; `?frame=1` showing nothing of the editor round the game
screen, every menu and popover too), the viewport toolbar (one 36 px row at 1920 and 2560 px with its widest values, and
two rows at 1280; Fire's and the chips' tooltips; each chip's menu by mouse and by keyboard, choosing what the old control
chose, a scene remembered for its effect; the arrows, Home, End, type-ahead, Enter and Esc in a menu; the editor's keys
waiting while a menu is open, so L in the Tier menu goes to Low and Loop stays; the View menu's 1, 2 and 3; F firing from
a closed chip and Space playing; Distance dragged in 0.1 m steps for 4 px, ten times that with Shift, its popover's slider
keys and a typed "0,5"; a right-click menu staying inside the window; tooltips at once when Tab brings the focus to a number
box or a select, and none after a click into a box), Show hints (on at first; the light bulb and the main menu's row hiding
and showing the hints and the drag hint over the preview, remembered after a reload; `?hints=off` and `?hints=on` for their
page only; counts, ids and the cost card's lines staying, and the status bar's drag hint too), Save as, Export and Import
(`project.json` and `editor.json` version 2
with the budgets), the palette profile Import keeps (in a temporary palettes folder: the real `palettes/` is not touched), Save as and Export keeping its name, a project
whose `project.json` is version 1 (it opens, with its scenes, and nothing is written) and one of a newer version (not
opened, and the editor says why, also when it is the project the editor starts with); the test page on both backends
(exact palette colours, every event plays, Low draws less, the version guard, a glow drawn from an exported gradient in
its exact colours) and its bundle (no checker, no editor code); the colour picker (a typed colour, a drag and Revert, a
new colour, and the focus back on the swatch that opened it when it closes, also in a layer's list that hides the main
colour), a ready-made gradient on a glow, night mode, the faction markings in the Faction chip's menu, and Save as, Export and Import carrying
the project's palette.json. It saves screenshots to `out/screenshots/`.
It needs Playwright's Chromium (`npx playwright install chromium` once on a new machine). This headless browser draws in
software, so an editor page opened while another one draws waits for it: the check notes how long its second editor page
took to start (5 to 10 s in this round's runs, whether or not the first page also draws a layer's Look).

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
  the comic layout, J, Q, V, X and Y close up between the board's letters, words that use them, the same words at game size,
  and words with a space in them, close up and at game size. It writes `out/letters/letters.png`, and
  `out/letters/game-size.png` and `game-size-spaces.png` (the game-size rows 3 times larger, pixel for pixel), from a
  throwaway project in `out/letters/project/`.
- `npm run export`, `npm run check:export` and `npm run import`: see [docs/export.md](docs/export.md).
- `node tools/shoot.mjs <effect> <scene> <ms,ms>` takes the game screen of one effect at chosen moments.
- `tools/presets/*.py` wrote the preset files (Python 3, optional: the JSON files are what counts, and the editor edits them).
  They write each effect byte for byte as the editor saves it, its fields in the editor's order (read from the JSON Schema
  in `packages/vfx-format/schema/`); a test holds every example effect to that.

## What works now

- **Effect files, version 6** ([docs/format.md](docs/format.md)), with upgrades from versions 1, 2, 3, 4 and 5.
  - **Colours per project**: the project's own `palette.json` (version 2, with gradients), edited with the colour picker;
    the built-in palette for projects without one ([docs/colours.md](docs/colours.md)).
  - **Gradients**: smooth or banded ramps in the palette. A glow and the fire's bed run one from the middle to the rim (on
    the bed, banded: one band of lumps per stop; smooth: the bed's own bands, the colours blended), smoke over each puff's
    life, and a burst over each piece's life.
  - **Quality tiers**: every visible layer says in which tiers it shows (Low, Medium, High). The game picks one tier; the
    timing stays the same in every tier. All examples have tiers (proposals, see below).
  - Five layer types: **sprite**, **projectile** (by speed, a fixed time or one phase; with an arc), **shape** (14 comic
    shapes made in code), **burst** (pieces thrown out) and **word** (sound words in our own letters, A to Z and !; a space
    draws as a gap, so one layer can show two words, such as KA BOOM).
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
  - **Budgets at three levels**: the project's, classes (Small, Normal and Big to start with) and an effect's own, each off
    until it is switched on. The closest level that is on counts, as a whole set. The card shows which one; today it edits
    the project's.
  - **`project.json` version 2** (with `paletteProfile` and the new budgets), read and written by one reader shared by the
    local server, the command line and the editor. Version 1 projects still open; an export's `editor.json` is version 2,
    and import reads the older one too.
- **Palette profiles** ([docs/colours.md](docs/colours.md)): named sets of colours in `palettes/` on this computer, made
  with two defaults (**Built-in**, and **Built-in with gradients**: the ready-made gradients and three for the fire's bed,
  sparks and smoke). The local server and the editor's store list, read, make, save over, rename and delete them, and
  restore the defaults; import keeps an export's colours as one (or finds one with the very same colours). Loading one into
  a project keeps every colour and gradient the project's effects use that the profile lacks.
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

- **The editor's look** ([docs/ui-redesign.md](docs/ui-redesign.md), section 4): two themes, Day and Night, from one set
  of colour tokens; one typeface in sentence case; icons drawn in code for every button. Most buttons keep their words next
  to the icon; those with only an icon, such as Undo, Redo, Night mode, Delete layer and Delete effect, give their names in
  their tooltips. The Faction chip shows each faction's marking from sheet 16. Every kind of layer has its own icon: the 14
  shapes, the nine looks of a burst's pieces, the word, the projectile and the sprite.
- **Tooltips that explain** (docs/ui-redesign.md 6.9): one tooltip for the whole editor, dark in both themes. Every label
  and section title of the right panel, for the effect and every layer type, and the controls of the bars and lists explain
  what they do and how to use them, in plain words written against the code (`src/app/help.ts`), true for what is shown.
  The browser's own tooltips are gone: every title shows in the same tooltip. **Show hints** (the light bulb in the top bar)
  shows or hides the one-line hints; their full words are always in the tooltips.
- **The right panel shows what is selected**: the effect's settings, or one layer's, first, under a header that leads back
  to the effect (its name, or Esc). Every layer says what draws it; a projectile lists the layers riding it, and they say
  so in the Layers list. The colour list shows the colours of the selection (Show all: every colour, the selection's in
  bold).
- **Seeing what is selected**: a layer's settings start with its **Look**, a live picture of the layer alone drawn by the
  runtime, and the other layers fade in the preview while a layer is selected or its row is under the mouse (**Fade other
  layers**, in the bar above the preview).
- **The window** (UI phase 2, docs/ui-redesign.md 5 and 6): a top bar with the logo's main menu, the project's name, Undo,
  Redo, Show hints, Night mode, Save and Export…; the effects and layers on the left, the preview in the middle (edge to edge, the game
  frame outlined and the scene outside it dimmed) over the timeline, whose header holds the transport; the right panel with
  a header for the effect or the layer; a status bar. Four splitters resize the zones, within limits, and remember the sizes;
  each zone has default sizes for windows 2200 px wide or more and for narrower ones.
- **The viewport toolbar** (UI phase 3, docs/ui-redesign.md 6.3): one row over the preview, Fire and chips that show the
  value (Scene, Faction that fired, Made by, Distance from you, Tier, and View with the scale), each opening a small menu
  that works by mouse and by keyboard; Distance is dragged sideways or typed. The parts it is made of (icon buttons, menus,
  also at a right-click, chips and numbers you drag or type) are in `src/app/dom.ts`, ready for the next phases.

Not yet: sound, camera shake and hit-stop; a shade input so smoke darkens in shadow; a way for tiers to drop parts of one
layer (such as tones in a star), not only whole layers; a gradient choice for smoke, the bed and bursts in the editor's form
(the runtime draws them; the choice comes with the new UI); renaming or removing colours and gradients; showing the word odds
and the layers that cannot draw (the functions are there; the new UI shows them); setting classes and
an effect's own budgets in the editor (the files hold them, and the functions are there; the new Cost card comes with the new
UI); the buttons for palette profiles (load, save, save as new, rename, delete, restore the defaults: the local server, the
store and the load function are there; the buttons, and naming the profile in the project when one is loaded or saved, come
with the new UI; today only an import names it).

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
  `molotov.land`, `hit.bullet.metal`, …); `palette.json` travelling inside each export.
- **"Sprites alive"** counts items (each sprite, particle, dot, letter, flame tongue and shape once), since the runtime draws
  triangles, not sprites. A halftone field counts each dot.
- **The test page** repeats the board's camera numbers and the rifle scene's positions; the game brings its own.
- **Board data in the repo**: the tank blockout, scene positions, preset sizes and timings, layouts and formulas stay in this
  public repo (Mustafa's yes, 2026-11-15).
- **Colours after milestone 3** (proposals): one palette per project; the nine ready-made gradients; `team.dark` and
  `glow.hot` worked out again only when asked; the icons.
- **Word chances** (the rules themselves are the approved plan, and "the rest shows no word" is Mustafa's choice): a chance may
  have decimals (12.5 %); chances that add up to 100 within a billionth (33.3 + 33.3 + 33.4) count as exactly 100. In the
  words box, a word typed again keeps its chance when its text is the same, capitals or not (words are drawn in capitals)
  and with or without spaces at either end (they add nothing to the drawing); a word typed twice is matched in order (the
  first BOOM takes the first old BOOM's chance).
- **The colours a layer can use** (the plan says which ones; how far the list reaches is ours):
  - The list holds every colour the runtime looks up for the layer, which is a little more than it can show: a burst's ink
    when its pieces have no ink edge (and an image burst's), a dashed or closing ring's ink, a burst's own colour when a
    gradient colours its pieces. The checker asks the palette for all of them, so it can name a colour the palette lacks
    even where nothing would show it. The built-in palette has them all.
  - A colour a field names is always listed, even where nothing draws it (a scorch core of size 0, the tones a bed's
    gradient replaces, a fifth flame tone): the checker checks every named colour, so a palette must keep it.
  - The test that compares the list with the runtime draws each example at 60 frames a second for every made-by and
    faction, each layer in the first tier it shows in (a tier only leaves whole layers out; another test checks that a layer
    draws the same in each tier it shows in). In the examples the runtime asks for every colour on the list. The made-up
    layers name the roles it never asks for, and why.
- **Layers that cannot draw**: a note is about the moment shown (the runtime's note on the last frame), so a layer that is
  not on at that moment gets none. Both notes name the image ("the image dust_puff.png is not in the project").
- **Budgets at three levels and `project.json` version 2** (the levels, "off until switched on", which one counts, the three
  starting classes and "old budgets become the project's, switched off" are the approved plan; these details are ours):
  - A class has an `id`, made from its first name and kept when it is renamed; an effect's entry names that `id`. A class
    name has 1 to 64 letters, no tabs or line breaks, and is unique without regard to upper and lower case (the rule planned
    for palette profile names). A file's class that an effect names but the list lacks is read as no class.
  - Until the new Cost card: the boxes show and edit the project's budgets, and the colours compare with the level that
    counts. Changing a number switches the project's budgets on; clearing one does not switch them off.
  - Saving leaves out of `project.json` the budgets of effects the project no longer has. The editor keeps them until you
    leave, so undoing a delete brings the effect back with its budgets, and the next save writes them again: `project.json`
    is written whenever the effects differ from the ones it was last read or written with, even with nothing else changed.
    A new effect that takes a deleted one's id starts without them. An export leaves out those of effects not in it.
  - Saving a version 1 project writes its `project.json` as version 2, as saving does with old effect files. A
    `project.json` with no `version` is read as version 1. One of a newer version, or whose `version` is not a whole number,
    is not opened, exported or written over; the same goes for importing an `editor.json` like that.
- **A fire's bed and its gradient**: the checker treats all the bed layers of one effect as one fire, so it compares every
  detail layer with every lumps layer. An effect with two separate fires may get a warning it does not need.
- **How the runtime draws gradients on the bed** (the direction, from the middle to the rim, one band per stop when banded
  and the bed's own bands when smooth, are decided; these details are ours):
  - A place on a band is its distance from that band's own middle, divided by the bed's radius. A band's edge is where its
    lumps reach on average. The first stop's colour holds from the middle of its band, wherever the stop is (as a glow
    draws it).
  - Each band in sits a tenth of the radius nearer the camera than the one round it, as the tones' bands always have,
    but never by more than 0.92 of its own reach, so every band still reaches past the bed's middle. Beds of up to four
    tones (the Molotov's) and the default `fire.bed` draw exactly as before, and so does a smooth gradient over up to
    four tones. A banded gradient changes where an inner band sat further forward than that: with five or more stops,
    and with four even stops (the ready-made Banding); the inner bands move back towards the middle (before, a bed of
    eight stops put its first stop's band at the front rim). Five to eight tones change the same way. With many stops
    the inner bands have few, small lumps, so the next band can still show at the very middle between them (with eight
    even stops, the second band shows there).
  - The white-hot spots stay on the middle band: a spot's centre at most 0.85 of the band's reach from the band's
    middle, a spot at most half that reach across. The spots of up to four tones are inside both already, so they do not
    move.
  - On a smooth gradient each point takes the colour of its place, kept inside its band, so the middle still cools first.
    The detail's halftone takes the next band's colour (smooth: halfway into it). The white-hot spots are more of the middle
    band (smooth: coloured by place).
  - Lumps are never more than 0.6 of a band, and bands close together shift towards the camera less, so each stays inside
    the last.
  - A stop's alpha makes only its band's fill see-through: the lines round its lumps, and the detail's halftone and
    brush strokes on it (in the next band's colour and alpha), stay solid, so a band at alpha 0 shows outlined, empty
    lumps rather than fading as a glow does. Open question for Mustafa: should the lines and the detail fade with the
    stop too, or should a bed's bands stay solid whatever the stop's alpha (as the tones are)? Part B freezes the
    runtime, so the answer is needed before then.
  - The checker warns when a bed's banded gradient has more than 8 stops (each stop is a band of lumps): 8 is our guess,
    twice the four tones a bed starts with.
- **Effect format 6** (making version 6, with an upgrade, is Mustafa's decision of 2026-11-18; what the upgrade does, and
  why, is ours):
  - Version 5 as first pushed (15 November) read a bed's gradient from the rim (0) to the middle (1). The push of 16
    November turned it round, from the middle (0) to the rim (1), as a glow's, but kept the number 5. Version 6 is the
    number that says "middle to rim".
  - The upgrade from 5 to 6 changes only the version number: a bed keeps its gradient name, and nothing is turned round.
    Why: the editor never offered a gradient on a bed (`optionalKeysFor` in `src/app/specform.ts`: a bed's only optional
    part is `breakUp`); no example effect has one; every version 5 file written since 16 November means "middle to rim";
    and turning old beds round would need a new setting in the format, for files that almost certainly do not exist.
  - The upgrade cannot change palette files. A palettes folder made by the editor as pushed on 15 November keeps the old
    `fire.bed` in its default profile "Built-in with gradients", with its stops from the rim (and so does a `palette.json`
    filled from it); a bed uses it only if someone typed its name into the effect file. To get the new `fire.bed`, delete
    the palettes folder: the editor makes it again, with the two default profiles, the next time it needs it (the
    profiles you made in it go too).
- **Alpha in smoke and burst gradients** fades every part of the puff or piece: rim, light top and halftone; ink edge and
  speed streak (they keep their colours). Each part is see-through on its own, so the rounds of a puff show where they
  overlap (darker overlaps, edges showing through), as with a layer's alpha. A puff or piece at alpha 0 is not drawn, and
  not counted in "sprites alive".
- **A space in a word** is 2.4 of the letters' 7 units wide, on top of the 0.5 after every letter: at 30 px and up the ground
  between the two words is then about as wide as an I (1.9), after the black outline and the pushed-back copy. An I's width
  alone left too little ground at 16 px. Spaces at either end add nothing.
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
- **Palette profiles** (where they live, the defaults, the name rule, import's numbering and "the very same colours" are the
  approved plan; these details are ours):
  - The folder is made, with the two defaults, the first time something needs it (a list, a new profile, an import), not
    when the editor starts. Restoring the defaults adds back the ones whose name is missing, without regard to case; a
    profile with that name stays as it is, even with other colours.
  - A profile's file is named after it (`soviets-dark.json`, `soviets-dark-2.json` when taken; `profile.json` for a name
    with no Latin letters or digits). Renaming moves the file to fit the new name, so the id can change; the answer gives
    the new one.
  - A name counts characters (so 64 letters of any alphabet fit), and is kept in one Unicode form, so an accent typed two
    ways is one name. Control characters are tabs, line breaks and the like; other invisible characters are allowed.
  - "The very same colours" compares the faction names too (they are part of the factions), and a stop with no alpha is
    solid. An import's name from free text has its control characters turned into spaces and is cut to 64 characters
    (nothing left: "Imported colours"); a numbered name cuts the base to keep the number.
  - An export whose `palette.json` is not a usable palette is refused at import (it used to import, and the project then
    fell back to the built-in palette when opened): its colours cannot be kept as a profile. A palette with a part missing
    or empty (a faction without colours, a colour, gradient or stop that is empty) is named in plain words, as any other
    problem; so is a profile file like that, which the list names and which can be deleted like any other.
  - An export of a project with no palette profile names in `editor.json` the profile an import will make of its colours:
    the project's name, cleaned as import cleans it. Without it, the import names that profile in the new `project.json`,
    so the second export's `editor.json` had one more line, and "export, import, export stays byte for byte the same"
    failed for every version 1 project and for both examples. Open question for Mustafa: is that the reading you want, or
    should an export never name a profile the project does not have (and the two `editor.json` files differ by that line)?
  - A list shows each faction's team colour, then the first shared colours, eight in all, as swatches.
  - "Built-in with gradients" holds all nine ready-made gradients (they all use roles), then `fire.bed`, `sparks.cool` and
    `smoke.lighten`, all marked `"from": "assumed"`. The ready-made gradients now live in `src/doc/gradient-presets.ts`,
    shared by the colour picker and the default profile, so a change to them changes what a fresh palettes folder gets.
  - The sparks and smoke gradients are our proposals, and so is the name `smoke.lighten` (it uses colours only, as decided):
    a fire's smoke stays `fire.smoke` until 40 % of each puff's life, then lightens to `fire.smoke.light`, the colour of the
    puff's lit top, which at the very end merges with the body.
  - `VFX_PALETTES_DIR` picks another palettes folder (the browser check uses a temporary one).
- **The editor's visual system** (UI phase 1 of [docs/ui-redesign.md](docs/ui-redesign.md); the tokens, type, sizes and
  states are the brief's, these details are ours):
  - What the brief's colour table has no token for gets a token of its own per theme, at the top of `src/style.css`: the
    focus ring's outer 2 px (`--focus` at 35 %), the tick on a checked box, the labels over the scene (`--bg-panel` at 85 %),
    the backdrop behind a dialog, the checkerboard, the edge round a colour (so a white or a dark colour still shows), the
    ruler's ticks, the lines between timeline rows (`--line` at 50 %), the step marks inside a bar (its ink at 15 %), a
    flipbook's frame lines, the pivot (a light dot with a dark ring, the same in both themes, so it shows on any image) and
    the slider's track and thumb. The message at the bottom takes the tooltip colours, dark in both themes (a bad one
    `--bad-bg` with `--bad` text). Sizes, corners and type sizes are tokens too.
  - Popovers and dialogs have a 1 px `--line-strong` edge, as section 4.1 says; section 4.4 says `--line`, which hardly shows
    in Day against `--bg-popover`.
  - Letter-spacing is 0 everywhere, the logo and Fire included: the brief keeps only their typeface and capitals.
  - Night mode shows the sun in Day and the moon in Night; when it is on, the moon is `--accent-ink` on `--bg-field`, as for
    every toggle that is on.
  - Checkboxes are drawn by the editor, so a checked box is `--accent-ink` in both themes and one that cannot change (a
    layer's last tier) is the same box at 40 %; the browser's own box would turn pale grey.
  - The picker's two yellow buttons (Add colour, Use on the selected glow) are plain buttons now: only a dialog's main button
    is yellow, and the picker is a popover.
  - The timeline keeps its row, ruler and bar heights until phase 5; only its colours, lines, corners and type change now.
  - A timeline bar's 1 px `--tl-bar-edge` is drawn just outside the bar, over the lane, so in Day it stands out from the
    lane (3:1) even on the white word bars. A Day bar looks 1 px longer at each end.
  - A layer's "not in Low" tag stays in `--bad`, as before, and its name on the timeline stays muted, except on the selected
    row: there both take `--text`, because `--bad` and `--text-muted` on the selected tint are under 4.5:1 in Night
    (section 6.5 asks for the name muted).
  - In the Layers list a long tag stops at half the row, so the layer's name always shows.
  - The effect's main colour in the palette grid (the grid goes in phase 6) is marked with `--bg-field`, a 1 px
    `--line-strong` edge and weight 500, not the yellow selected look: it is a stored choice, not a selection.
  - In the colour picker the chosen colour's chip already has a 2 px outline in the focus colour, so keyboard focus on it
    draws a 1 px `--focus` line inside the chip, 2 px in from its edge, instead of the usual ring.
- **The right panel after UI phase 1** (Mustafa's feedback of 2026-11-16: a layer's settings first, the colours of the
  selection with Show all, what draws each layer and what a projectile carries; these details are ours):
  - With a layer selected the panel shows only that layer's settings. Its header (the brief's 40 px inspector header) stays
    at the top while the panel scrolls, so the way back always shows. Since UI phase 2 the effect's view has a header too (see
    the shell, below), with its Effect section under it. Cost and Checks stay at the bottom of both views until phase 6.
  - Another selection starts the panel at the top; a part switched on or off keeps its place. When the control you used
    goes with the old view (the effect's name, a rider, Esc pressed in the panel), the keyboard focus moves to the new
    view's title.
  - Esc leaves the layer only when the colour picker and dialogs are closed and you are not typing: not in a text or
    number field or a select (as for every other key there). A checkbox or a slider that keeps the focus after a click is
    not typing, so Esc works from there.
  - Where the colour list sits: in the effect's view it stays the Colour row of the Effect section, with Show all next to
    its label. In a layer's view it is the layer's Colour section, with Show all on the section's title row (open by
    default; one open or closed state for every layer, as sections remember it by title). A sprite keeps its one Colour
    section: its tint first, then its colours, after Image and Size and place as before. A shape, a burst or a word gets
    the section right after its name and tiers, before Place, so it shows without scrolling (their own settings can be
    long); a projectile, after its riders.
  - The list holds the selection's palette colours in the palette's order. A colour a layer names that the palette lacks
    (in red) and a gradient stop given as a hex come after them; they cannot be clicked, since the picker edits palette
    colours, and their tooltips say what to do. The effect's main colour keeps its mark in every view, and the hint names
    the mark only when it shows. The hint ("Click a colour…") shows only when there is a colour to click.
  - Closing the colour picker puts the keyboard focus back on the swatch that opened it (or else on the main colour's), so
    Tab and Esc carry on from there: a layer's list may hide the main colour's swatch, where the focus used to go.
  - Show all is one setting for every view, off at first, remembered as `vfx-colours-all`. The selection's colours are
    Plex Mono 600 (now loaded; 400 and 500 were), the others muted.
  - The animation: colours that leave fade and shrink where they were, those that stay slide to their new places, those
    that come back fade in, and the list's height follows, all in 150 ms; none with reduced motion, and none when the list
    is first drawn. Section 4.6 of the brief says nothing else animates; this is the one Mustafa asked for.
  - What draws a layer: "Image: <file>" for a sprite and a burst of image pieces, "Drawn in code, no image" for shapes,
    words and other bursts, and "An invisible path: it draws nothing itself" for a projectile. A rider's line in its
    projectile's panel names its kind in the add menu's words ("Shape: trail behind a projectile, drawn in code, no
    image"). Riders are listed as in the Layers list, top of the drawing order first.
  - In the Layers list "rides Bullet" takes the place of a rider's usual tag (its image, shape or words), in Plex Sans; the
    row's tooltip says it too. A rider the tier leaves out says "not in Low" instead, like every row the tier leaves out.
- **Seeing what is selected** (Mustafa's feedback of 2026-11-16: the other layers fade in the preview, and a live picture
  of the selected layer; these details are ours):
  - The other layers fade to a quarter of their strength. The runtime writes each draw's triangles into its buffers; before
    they go to the GPU, the editor scales the colours of the other layers' vertices by what each blend group's material
    does with them: normal drawing by its alpha, added light by its colour, stains (multiply) by their alpha, which moves
    them towards white (for an image too, where moving the colour towards white would not), and light on the ground
    (screen, which the plan does not name) by its alpha, which weakens it. Every triangle stays, so the triangles and draw
    calls in the status bar do not change; the cost measurement has its own renderer and never sees the fade.
  - A row under the mouse, in the Layers list or on the timeline, counts before the selection while the mouse is there;
    a scrub that starts on a row's lane is not a hover, so the selection counts while you drag. Fade other layers off
    stops both. Effects still playing from an earlier Fire of another effect fade as a whole. The game
    screen alone (`?frame=1`) never fades.
  - The toggle sits in the toolbar just left of the View chip (see "The toolbar and hints"), with the icon of the colour
    picker's Gradients (a striped square). The icons
    round drew one icon per kind of layer, and each of those means a kind of layer, so none was taken for the toggle; it
    keeps the striped square until it gets an icon of its own. It has no key. Its tooltip is its name and the help text
    for "Fade other layers" (`help.ts`).
  - The Look is a section of its own, first in the layer's settings (inside the layer's card, so the settings inventory
    lists it, with no settings), open at first; folded, it stops and lets go of its renderer. The picture is 144 px tall
    and as wide as the panel, on the preview's ground colour (a game colour, the same in both themes, so it needs no edge).
  - Framing: the layer's box on the 1920 × 1080 game screen over its time, found by drawing it 120 times a second of that
    time (6 to 48 times, the first and last moments among them; at 24 a second the board rifle's tracer, which crosses the
    screen in 22 ms, was cut at the picture's edge), with a tenth of the box as margin on each side, and never less than
    32 px of the game screen across (in the 144 px picture a speck shows at most 3.75 times game size). A sprite counts as its whole picture, see-through parts
    included. While a value is dragged, the box is worked out again at most five times a second. The line under the
    picture says how large it shows the layer and which time it loops over.
  - Time: the layer's own time (a projectile's: its flight together with its riders' times), then the same 300 ms rest as
    Loop, at the speed the speed buttons set, whether the timeline plays or not. It uses the preview's seed (so it changes
    with Fire), faction, made-by and distance. A layer the preview's tier leaves out still shows in the Look (a layer draws
    the same in every tier it shows in); the preview shows the tier.
  - The Look draws in the editor's own frames, only while the page is visible. Its renderer (WebGL 2, also next to a
    WebGPU preview) is made on the next task after a layer's panel opens, so selections made one after another in one go
    make none, and is disposed with its WebGL context when no layer is selected or the Look is folded. Paused by showAt
    (the browser check and the picture tools), it holds the moment shown when that is in its time, else the middle of its
    time, so pictures repeat.
- **Layer icons** (one icon per kind of layer is Mustafa's ask; these details are ours):
  - A shape goes by its kind, a burst by the look of its pieces, and an image burst by the image icon (as the plan says).
    The word icon is now the letters POW, in place of the speech bubble; the projectile and sprite icons stay.
  - A sprite shows its own image in place of the image icon, in the Layers list, on the timeline, in its panel's header and
    among its projectile's riders: 16 px, the whole image fitted in, on the preview's ground colour (the same in both
    themes, so a white image still shows), with the faint edge of a colour swatch. A flipbook shows its first frame (the top left
    cell). The image is shown as it is in the file, before any tint. A sprite whose image is missing or did not load shows
    the image icon. The picture uses the copy the editor already loaded for the atlas.
  - A frame more than four times as wide as it is tall (or as tall as it is wide), such as a tracer's streak (512 × 48),
    would be a line about a pixel thick fitted in whole, and its tile looked empty: it fills the 16 px with a slice from its
    middle instead.
  - Only a sprite's tag (its image name) is Plex Mono in the Layers list; the rule goes by the layer's type, so an image
    burst's tag ("9 × image") stays Plex Sans.
- **Tooltips** (the timing, the look, "every title becomes a tooltip" and plain explanations are the brief's and Mustafa's
  ask; these details are ours):
  - A tooltip says, in order: the element's own words (what its title said, such as a row's full name or "Undo Size"; an
    icon-only button with none is named by its aria-label), then the help text for its label, then its shortcut in a muted
    kbd on the first line. A label cut short with an ellipsis shows its whole text first. With more than one line, the first
    is semibold. A shortcut written at the end of a title, "(Esc)", moves into the kbd: only a key combination or a named key
    (Esc, Del, Space, F2, an arrow…), so a name in a title keeps its brackets ("Smoke (2)" is not "Smoke" with the key 2).
  - The help text is looked up when the tooltip is about to show, by the label's words and where they are: the sections
    round it (as the settings inventory names them), the layer type and the shape kind; in the bars, the bar. So "Save as…"
    and "Pause" get their texts when the button changes, and a label added later gets its text as soon as `help.ts` has
    one. Only the editor's own words are looked up, never names people give (an effect called "Fire" does not get Fire's
    text), and not in the colour picker or dialogs, whose titles show as they are.
  - Where a help text says what a title said, the title went (Save, Export…, Fire, Play, Loop, New, From preset…,
    Night mode, the tier buttons (now the Tier menu's rows), Move up and the other layer buttons, Measure, the cost rows'
    names, Show all, Fade other layers, the Look's title). The Look's help text took in what its title added (the
    preview's faction and made-by; a rider flying along its path, a projectile showing its riders). The other titles stay
    and show first (rows' full names, the renderer, the picker's buttons…). A text box, a number box, a select and a slider
    have no tooltip on hover (their label has it); with the keyboard focus they show their label's (below).
  - What draws a layer ("Drawn in code, no image", "Image: …", "An invisible path…") and the "rides Bullet" tag in the
    Layers list explain themselves in their tooltips, with the texts `help.ts` has for those lines. A rider's row in its
    projectile's panel keeps its own tooltip ("Select Tracer core"), and a Layers row keeps the full name and what it
    rides ("Tracer: rides Bullet").
  - Hover: 500 ms; 150 ms when another tooltip is open or closed less than 0.6 s ago. A press, a scroll or Esc hides it
    until the pointer moves on: what comes up under a pointer that has not moved (the row built again after a click, the
    label scrolled under it) stays quiet, so a click never leaves a tooltip on screen.
  - Keyboard: it shows at once when a key that moves the focus brings it to an element with a tooltip: Tab or Shift+Tab,
    or an arrow key, Home or End in a menu. A button, a section's title and a checkbox show their own; a text box, a number
    box, a select and a slider show their label's, above the box (below when there is no room above), so the rows under
    it stay in sight while you type. Not when a click or the editor moves the focus (to the panel's title after Esc or a
    rider), and not for a second move just after the key: one key, one move. A press always counts as the pointer's: a
    text box matches `:focus-visible` after a click too, so that is not what decides. While it shows it describes the
    focused control for screen readers (aria-describedby); it never changes a control's name.
  - Esc hides the tooltip and still does what Esc did (closes the picker, leaves the layer): the brief keeps every key as it
    was.
  - It is a popover in the browser's top layer, so it shows over the colour picker and dialogs; below what it is for, above
    when there is no room, 8 px inside the window. It fades in over 100 ms with a 2 px move, as the picker and dialogs do (none
    with reduced motion); none on touch.
  - Its edge is `--line`, as the message at the bottom has; the shortcut is `--text-tooltip-muted` (#A6A6A6, 5.9:1 on the Day
    tooltip, 6.8:1 on Night's) with a faint light edge, the same in both themes as the tooltip is.
- **The shell** (UI phase 2 of [docs/ui-redesign.md](docs/ui-redesign.md): the grid, the default sizes and limits, the top bar,
  the main menu's rows, the status bar's contents and the timeline's header are the brief's; these choices are ours, not
  Mustafa's or the brief's):
  - Show hints is in the top bar (a light bulb, left of Night mode) and in the main menu since phase 3, with `?hints=` (see
    "The toolbar and hints").
  - The scale is muted text in the View chip, after the view's name ("59 %"). It keeps its own tooltip there, "The preview
    shows the game screen at 59 % of its size.", and follows the view and the preview's size.
  - The ? key opens Keyboard shortcuts now, since the main menu names it; not while typing in a field, nor in the colour
    picker or a menu. The Keys dialog is called Keyboard shortcuts, as the menu names it, and lists ? and the arrow keys on a
    splitter.
  - The effect's header is plain: a dot in its main colour (for the faction shown; its tooltip names the role), its name and
    "Effect". No More menu until phase 6. The Effect section stays under it, as it was.
  - Typing a time in the readout comes now, with the header: Enter goes to the typed time, paused; a comma works as the
    decimal point; a time past the end stops at the end; Esc, or a click elsewhere, leaves it as it was.
  - The ruler, the phase strip and the track rows keep their sizes (26, 16 and 26 px): at 1920 × 1080 with the default sizes
    the tracks get 272 px, and 8 rows with the ruler and the phases take 250, so 4.3's sizes wait for phase 5.
  - A click on Checks in the status bar shows the effect's settings at its Checks section (its title takes the focus), until
    phase 6's problems banner.
  - New project… in the main menu asks for the new project's name at once: the question the Projects dialog's New project…
    button asks (one function now), then makes the project and opens it. Import an export… opens Projects with the focus on
    the first export.
  - One wording for the drag hint, everywhere: "Drag the ground to move the target. Shift + drag moves the stand-in." Over
    the preview, in the status bar, in the Keys dialog's two rows ("Drag the ground", "Shift + drag") and in What to click.
  - The status bar's cost has two states 6.6 does not name: "Measuring…", and "Measured, no budgets" when no budget is on (so
    nothing is within or over). "2 over budget" counts the measured numbers over the budgets that count, as the card colours
    its cells (out of date numbers are not compared); its tooltip names them. A click on it does what a click on the
    triangles does: the effect's settings at Cost.
  - The toolbar is one 36 px row at 1920 and at 2560 px since phase 3's chips; a narrower window wraps it (see "The toolbar
    and hints").
  - Splitters: at rest only the zone's own 1 px line shows; on hover a `--line-strong` line (hover is not focus, so not
    yellow); with the keyboard focus or while dragged, `--focus`. A press that does not move remembers nothing. Home and End
    take a focused splitter to its limits. Sizes are remembered in whole px. When the window is too narrow for both
    remembered sidebar widths, both give way, each in proportion to its room above its narrowest, and the remembered widths
    come back when the window grows.
  - With the effects list at its largest (the column less 160 px, as 5.2 says), the Layers section is 160 px tall: its list
    gives way, down to one row, so the add menu and the buttons under the list stay in the column. Phase 4 takes those two
    rows away, and the list gets the room.
  - The preview's own observer clears its canvas when it gives it a new size, after the frame was drawn; the editor then
    draws the moment again at once (also while paused), so the preview follows a splitter while it is dragged.
  - The project's name is a button that opens Projects; an example's lock sits between the name and the unsaved dot, so the
    name's text stays "Demo project •". Its tooltip gives the project's folder.
  - Save: "Saved" is muted at full strength, with its check (a state, not a command you cannot use); "Save" has the save icon;
    "Save as…" on an example has the save-as icon.
  - The main menu: rows with the icons of icons.ts, a check for Show hints and for Night mode in `--accent-ink` when it is on
    (an active toggle),
    each row's tooltip (its help text) beside the menu, so it never covers the rows under it. Tab closes it as Esc does. While
    it is open the logo looks like a chip with its menu open (4.6): the field colour, the chevron in `--accent-ink`. The logo's
    name for screen readers is "Shamble VFX main menu".
  - The timeline's header keeps Speed's label and Loop's word, as today; Play is a 24 px icon button.
  - The time in the readout is a button whose focus ring is drawn inside it, as on the status bar's items, and whose box
    reaches 2 px past the time on the right (4 px on the left) and gives those 2 px back with its margin: the text keeps
    its spacing ("89 / 299 ms"), and the ring ends before the slash.
  - The frame's label reads "1920 × 1080" (it said "1920 × 1080 game screen").
  - In the 296 px panel the cost table's budget boxes have no spin arrows (Chrome keeps their room even while they are
    hidden, and "budget" did not fit; the arrow keys still step the number). The row names that do not fit (Sprites alive,
    CPU ms a frame) end in an ellipsis, with the full name in their tooltip, until phase 6 remakes the card.
  - A message (the toast) shows 12 px above the status bar.
  - The right panel stays the column that scrolls, with the cards straight inside it: its 40 px header is sticky at the top
    of that scroll, not a row of its own over a scrolling body (the browser check and the settings inventory read the cards
    there). Where scrollbars take room, the right panel's runs beside the header too.
  - The splitters are 6 px strips laid over the zones' own 1 px lines (each placed in the grid on that line), not rows or
    columns of their own: the workspace keeps its three columns, and the left sidebar and the centre their rows.
  - The rule for windows under 1400 px went (the grid has its own defaults now), so the timeline's names column is 180 px
    at every width until phase 5 makes it 200 and 176 px.
  - The Effects header's New and From preset… fit the 248 px sidebar with nothing to spare; in a narrower one (it can be
    dragged to 200 px) their words end in an ellipsis rather than being cut off, until phase 4's + menu takes their place.
- **The toolbar and hints** (UI phase 3 of [docs/ui-redesign.md](docs/ui-redesign.md): the toolbar's order, the chips and
  their menus, the parts in `src/app/dom.ts`, Show hints and the one-line hints are the brief's; these choices are ours, not
  Mustafa's or the brief's):
  - **Fade other layers** sits in the toolbar as an icon toggle just left of the View chip: the brief came before it, and
    6.3 does not place it. Its icon and what it does are as before.
  - **Narrow windows**: the toolbar is one 36 px row at 2560 and at 1920 px. With the default sidebars it stays one row down
    to a window 1469 px wide, with its widest values shown (the longest scene name, Your team, 14.0 m, Medium, Close-up at
    200 %). In a narrower window it wraps onto a second row (65 px): nothing is cut, and the controls keep their order.
  - **Right-click** is built into the menu part now (`menu()` opens at a point, `contextMenu()` wires an element to it), and
    the browser check tries it; phase 4 gives the lists' rows their menus. While the button is still down (Linux and macOS
    ask for the menu on the press), the menu opens when it is let go: the browser closes a menu opened on the press when
    the pointer is not over it. Near the window's edges it turns left or up, so it stays inside the window.
  - **`scrubNumber`** (a number you drag sideways or type) is used by Distance only for now: its popover's number box, and
    its title, which drags the number too. Phase 6 brings it to the right panel's numbers.
  - Menus: a dot in `--accent-ink` marks the chosen one of a set (a menuitemradio); a check marks a setting that is on (a
    menuitemcheckbox, as Night mode's was). The header naming the setting, and a heading over a group of rows ("Close-up
    on"), are 12 px, semibold and muted. A menu opens with the focus on its chosen row, else on its first. Letters typed
    less than 0.7 s apart spell a word for type-ahead; one letter pressed again goes on to the next row that starts with
    it. The menu takes the focus as soon as it shows, and a key pressed on the chip before that is the menu's.
  - Keys: Enter on a chip whose menu is open closes it again (the chip toggles its menu); Space on a chip plays or pauses,
    as on every button. **1, 2 and 3 in the View menu** choose that view and close the menu, as clicking the row would:
    the rows show those keys. In the other menus the editor's keys wait: F, L, 1, 2, 3, ← → and Space do nothing while a
    menu or the Distance popover is open (a letter goes to type-ahead). In the main menu ? and the letters do what they did,
    apart from type-ahead.
  - **Distance**: dragging the chip and typing a number both stay within the slider's 0 to 14 m (dragging the target in the
    tank shell's scene can still take it further, as before). A press that moves less than 3 px is a click. The popover
    opens with the focus on the slider, whose keys do what they did on the old slider: ← and → (and ↑ ↓) step 0.1 m,
    PageUp and PageDown 1.4 m, Home and End go to 0 and 14 m. Tab goes on to the number box; Tab from there, or Shift+Tab
    from the slider, closes the popover and gives the focus back to the chip, as Esc does. Enter in the box sets the number
    and keeps the popover open; ↑ and ↓ in the box step 0.1 m (1 m with Shift).
  - Words checked against the code: Made by's "You" also gives broken edges (the runtime draws your own effect's edges as
    your team's: `core/draw.ts`), so its row says "broken edges, your own words show" (the brief: "your own words show").
    Each Tier row says "draws only the layers in this tier", as the brief does (a projectile has no tiers; the layers riding
    it follow theirs). The Scene menu's footer, "Each effect remembers its scene.", holds while the editor runs, and in
    project.json once the project is saved.
  - The Faction chip's marking is filled with the team colour of the built-in palette, as the faction buttons were.
  - Fire's tooltip is the brief's line, "Fire from the stand-in to the target, as the game does", with F; the help text under
    it adds "Each press is a new play, and several can overlap."
  - The rows of the chips' menus have help texts of their own (Whole screen, Game size, Close-up; the close-up on the muzzle
    or the target; made by an enemy, your team or you). They are looked up under names that never meet a label of the right
    panel ("Target" is one there); scene and faction names get none.
  - The scale keeps its own tooltip inside the View chip; the rest of the chip has View's.
  - The chips' menus and the Distance popover hide with the rest of the editor under `?frame=1`.
  - **`?hints=on` or `off`** works as `?theme=` does: it counts for that page and is not remembered. A choice made with the
    light bulb or the menu's row is remembered as `vfx-hints` (`on` or `off`); a browser that never chose shows the hints.
  - Show hints is an icon toggle like Night mode: on, the field colour and the bulb in `--accent-ink` (an active toggle);
    off, a ghost button. Its light bulb is our drawing, in the style of icons.ts. It has no key.
  - Off hides every `.hint` and the drag hint over the preview (`.vhint`); the status bar keeps showing the drag hint while
    the pointer is over the preview. Lines that look like hints but are not keep showing, with classes of their own and the
    same look: meta text (`.meta`: a project's folder and "example, read-only", an export's folder and counts, a preset's
    layer count in the dialogs) and lines that carry a state (`.state-line`: the cost card's state, its "Most triangles in
    High" line, its measuring conditions and the line saying which budgets count; "No exports yet…" in Projects; "None
    yet…" under Gradients). The Look's line and the panel's readouts were never hints. The colour list's hint stays a hint:
    its words and when it shows still come from the list (only when there is a colour to click), and Show hints off hides
    it too.

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
- `palettes/`: your palette profiles.
- `out/`: screenshots and other output of the checks.
- `exports/`: export folders (they hold the project's images).
