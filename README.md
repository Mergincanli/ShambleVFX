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
5. The timeline's header (**Play**, the steps, **Loop**, **New shot each loop**, the **speed** buttons and the time) and the
   **timeline** work like a video player. With **New shot each loop** on (as at first), each loop is a new shot: everything
   random (sparks, smoke shapes) changes, as in the game; off, every loop shows the same shot, to compare while you change
   a setting. Fire makes a new shot either way. Click the time ("89 / 299 ms") to type one: Enter goes there, paused, and
   Esc leaves it. The strip under the ruler shows the phases: wind-up, peak, fade. The ← and → keys step 1/12 of a second.
   On the timeline, press on the ruler, the phase strip or an empty part of a lane to go to that moment, and drag to
   scrub; drag the playhead's head (on the ruler) to move the time from where it is. Click a bar or a name to select its
   layer (the time stays); a drag that starts on a bar scrubs. A bar's label sits inside the bar, or beside it when the bar
   is too short. The ruler and the phase strip stay at the top while the rows scroll.
6. The right panel shows what is selected. No layer: the effect's settings, under a header with a dot in its main colour,
   its name and "Effect", in sections that fold: **Effect** (its name, its **Folder** and its game events), **Scale** (the
   three **big controls**: Size, Intensity, Duration), **Phases** (a bar of the three **phase** lengths, then the lengths),
   **Colour** (the **Main colour** and the effect's colours) and **Cost**, closed at first. The Folder select moves the
   effect to another folder, out of one (No folder) or into a new one (New folder… asks for its name). Click a
   **layer** (in the Layers list, or its name or its bar on the timeline) and the panel shows that layer's settings, under
   a header with the effect's name, "›" and the layer's name: click the effect's name, or press Esc, to go back to the
   effect's settings. Each header has a **More** button (three dots) at its right end: the effect's has Duplicate effect,
   Move to folder… and Delete effect; a layer's has Rename, Duplicate, Move up, Move down and Delete, as in the lists. While
   the checker finds problems, a red strip under the header says how many: click it for the list, and click a problem's
   path to select the layer it is in.
   Each setting is a row: its name on the left, its control on the right. **Drag a number's name sideways** to change it
   (a step for every 4 px, ten with Shift), or click the number and type it ("0,5" works as well as "0.5"); ↑ and ↓ step
   it, and Esc puts back what you typed. Two or three numbers share a row, each with a short word or letter inside ("R",
   "U", "F" for right, up and forward; "Min" and "Max"): drag it to change that number, and rest the pointer on a box for
   its full name. A colour setting shows a swatch of its colour, for the faction shown.
   They start with **Look**: a live picture of the layer alone, drawn by the game's code on the ground colour, framed on it
   and playing its own time in a loop at the speed the speed buttons set (a layer that rides a projectile flies along its
   path; a projectile shows the layers riding it). Fold it to put it away. Then **Layer**, with the layer's kind on the
   right of its title: what draws it, its name and **Shows in**, three chips (Low, Medium, High) that switch its tiers. A
   sprite shows its image under **Image**, as wide as the panel allows: click the picture to put the pivot there. Each
   layer says what draws it: an image ("Image: muzzle_flash.png") or code ("Drawn in code, no image"). A projectile is an
   invisible path: its panel lists the layers riding it (click one to select it), and those say "rides Bullet" in the
   Layers list. When the preview does not draw a layer, a red line under what draws it says why ("Not drawn: the image
   muzzle_flash.png did not load.", "Not drawn: the Low tier leaves it out: it shows in High."), and so does the preview
   itself, in its lower left corner ("Muzzle flash is not drawn: …"); while an effect's errors stop the preview, the preview
   says so. Shapes, bursts and words show the settings the file has, with optional parts behind a switch, except an image
   burst's image, which comes later. A word layer lists its **words**, one row each, in capitals: the word, its chance in a
   **%** box and Remove (the bin), and **Add word** under them. An empty box shares what is left with the other empty
   ones (its faint number says how much); all empty, every word has the same chance. Under 100 %, a line says how often no
   word shows ("No word: 40 %"); over 100 %, a red note says they still play, scaled down to 100 %. A last line counts
   1,000 shots with the game's own pick ("In 1,000 shots: BOOM 498, BANG 502"). Smoke, the fire's bed and bursts have a
   **gradient** choice, as a glow has (see 12).
7. The **+** in the Layers header adds a layer of any kind, just above the selected one: Sprite, Projectile, one of the 14
   shapes by its plain name ("Beam", "Flame tongues"; the name in the file, "band", "flames", is in its tooltip), Burst or
   Word. Shapes show these plain names everywhere: in the Layers list's tags and in the right panel ("Shape: beam"). The
   **+** in the Effects header makes a **New effect**, or copies one of the ready-made effects into your project (**From
   preset…**). Each layer has an icon for its kind, in the Layers list, on the timeline and in its panel's header: a shape
   by its kind (a ring, a smoke cloud, flames…), a burst by the look of its pieces (sparks, chips, puffs…), a word, a
   projectile; a sprite shows its own image (the first frame of a flipbook). See 20 and 21 for the two lists.
8. The **Tier** chip (Low, Medium, High) in the bar above the preview draws one quality tier. Layers left out fade in the
   list and on the timeline. A layer's **Shows in** chips set its tiers (a layer keeps at least one).
9. **Game events**, in the effect's Effect section: the names the game starts it by, such as `rifle.shot`. A name another
   effect already answers is named as you type.
10. **Cost**, the last section of the effect's settings, closed at first (the triangles and the cost in the status bar open
    it): its header says how it stands, as the status bar does, and has **Measure**, for draws, sprites alive, triangles,
    screen area and CPU ms, per tier. Switch on **Budgets** under the table for a budget box under each number, and the
    place for the budgets' three levels: **Boxes show** says whose numbers the boxes show and edit (the project's, the
    effect's class's or its own); **Project budgets**, **Class budgets** and **Its own budgets** switch each level on or
    off; **Class** puts the effect in a class (Small, Normal, Big, or one you make with New class…; the pencil renames it,
    the bin deletes it). Typing a number switches its level on. The closest level that is on counts, and the line under
    them says which. Every change is one undo step, and the budgets are saved in project.json. See
    [docs/cost.md](docs/cost.md).
11. **Export…**, in the top bar and the main menu, writes the folder the game loads into `exports/`; **Import an export…** in the
    main menu (Projects, at its list of exports) makes a project from one (and keeps its colours as a palette profile).
12. **The colour picker**: click a colour in the list under **Colour** in the right panel, or the pencil next to **Main
    colour** in the effect's settings: the picker opens on that colour at its **Colour** tab, left of the right panel and
    level with what you clicked. **Edit palette…** opens it at its **Palette** tab, and the pencil next to a gradient
    choice at its **Gradients** tab, with that gradient open in the editor. The tabs: **Colour** (the faction switch, the
    wheel, the hex value with Copy and the exact values, Darker, Lighter, Goes with it, how a worked-out colour is made,
    the main colour, Revert and whose value it is), **Palette** (every colour as a chip, the palette profiles (see 22),
    and New colour at the bottom) and **Gradients** (ready-made gradients, the project's own, and the gradient editor).
    With the keyboard focus on a tab, ← and → move between the tabs (on the wheel, where the Colour tab starts, they turn
    the hue); Esc or Close puts the picker away, and it stays open while the effect plays.
    The list under Colour shows the colours of what is selected: the effect's, or one layer's (with the ones it draws
    without naming them, such as the black ink outline); a projectile has none of its own and shows those of the layers
    riding it. **Show all** shows every colour, the selection's in bold. A glow, smoke, the fire's bed and bursts can use
    a gradient: pick it in the layer's own gradient choice ("Gradient, middle to rim" for a glow and a bed, "Gradient over
    life" for smoke and bursts), or with **Use on the selected …** in the gradient editor. See
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
18. **The status bar**, at the bottom: the checks ("All good", or how many problems: click to open their list at the top
    of the right panel), this frame's triangles and draw calls, and the cost against the budgets (click either for Cost);
    in the middle, the hint for what is under the pointer; on the right, the renderer and **?** for the keyboard shortcuts.
19. **Resize the zones**: drag the lines between them (the left sidebar, the right panel, the effects and the layers, the
    preview and the timeline). Each size is remembered; a double-click puts the default back. With the keyboard focus on a
    line, the arrow keys move it 16 px.
20. **The effects list** (top left). A name such as "Weapons / Rifle shot" puts the effect in the folder Weapons, and
    "Vehicles / Tank / Shell" puts it in Tank, inside Vehicles. The file keeps the whole name: folders are only in the list.
    Folders come first, then effects, each A to Z, and a folder shows how many effects are in it. Click a folder to close or
    open it; each project remembers it. **Search effects** (or the / key) shows only the effects whose name, folder, file or
    game events hold the words you type; the count then says "3 of 16", and Esc clears the search. Each row has a dot in the
    effect's main colour. Rest the pointer on a row, or select it, for its **More** button (three dots): **Rename** (F2),
    **Duplicate** (Ctrl+D), **Move to folder…** and **Delete**. A right-click on a row opens the same menu, and a
    double-click on its name renames it in place: Enter keeps the new name, Esc keeps the old one. Duplicate makes "… copy",
    with the same scene and its own budgets, but no game events (one event plays one effect). Deleting an effect you have
    not selected keeps your selection.
21. **The layers list** (bottom left), the top of the drawing order first. Rest the pointer on a row, or select it: **Move
    up**, **Move down** and **More** take the place of its tag. More, or a right-click on the row, has **Rename** (F2),
    **Duplicate** (Ctrl+D), **Move up** (Ctrl+]), **Move down** (Ctrl+[) and **Delete** (Del). Drag a row up or down to move
    the layer: a line shows where it lands, Esc stops the drag, and one Ctrl+Z puts it back. A double-click on a name renames
    the layer in place. The row under the mouse is highlighted on the timeline too, and the other way round; a layer you
    select scrolls into view in both. An effect with no layers offers **Add a layer**.
22. **Palette profiles**, on the colour picker's Palette tab: named sets of colours on this computer, for any project. The
    line over the list says which profile this project's colours came from. **Load** copies a profile's colours into the
    project, as one undo step; first it lists the colours and gradients the profile lacks that the effects use, and keeps
    them, so no effect breaks, and the ones it takes out (this project has them, no effect uses them, the profile lacks
    them). **Save as profile…** keeps the project's colours as a new profile. A row's **More** (three
    dots) saves the project's colours over that profile (it asks first), renames it, duplicates it, saves it as a file to
    send, or deletes it (it asks first). **Import profile…** reads such a file; a taken name gets " (1)", " (2)" and so on.
    The two defaults, **Built-in** and **Built-in with gradients**, have a lock: load them or duplicate them, but they
    cannot change; **Restore the default profiles** shows while one is missing. Loading or saving a profile names it in the
    project, and Save writes the name into `project.json`. Profiles live in `palettes/`, kept out of git.

Keys: press **?** (or the ? at the right end of the status bar, or **Keyboard shortcuts** in the main menu). **Esc** does one
thing at a time: it cancels a rename or a drag, clears the search, or closes a menu or the colour picker; only when none of
these is going on does it leave the layer.

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

The unit tests (590): the format, the checker and the upgrades from versions 1, 2, 3, 4 and 5 (5 to 6 changes only the
number: a bed keeps its gradient name); every example effect byte for byte as the editor saves it; word chances (the
four rules, the checker's warnings, a total just over 100 % shown with the decimals that say so, and the word each play
shows: what is drawn, and the same as version 4 for every seed when no word has a chance); the word odds over 1,000
plays, near the four rules' shares; the words box keeping chances; the words' rows saying a share, a total over 100 % and
the 1,000-shot line;
a space in a word drawn as a gap; the colours each layer can use, checked against the real runtime (every example drawn
at 60 frames a second for every made-by and faction, each layer in a tier it shows in, and made-up layers of every kind,
edge and gradient: the list holds every colour the runtime asks the palette for; a test holds the runtime to drawing a
layer the same in each tier it shows in), and the checker naming one the palette lacks; the layers the runtime cannot
draw, and why; palettes with gradients and their upgrade, and palettes with a part missing or empty named in plain
words, never a crash; every reason a layer is not drawn in the preview now (an image the atlas lacks, at any moment; the
runtime's note on the frame; the tier shown, with the tiers it shows in; an effect's errors, first; a projectile none);
colour edits and their undo; glows drawn from gradients; gradients on smoke, the fire's bed and
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
undo and redo; duplicating an effect ("… copy", its id from its own id and never from its name, within the 48 characters an
id may have, one undo step); the effects list's folders from the names (" / ", nested, A to Z with numbers in order, the
counts) and its search (name, folder, file and game events, every word typed); the rename and Move to folder rules the
Effects list and the right panel share (the folder kept, an empty name, the 80 characters); the project file server; `project.json` version 2 and its upgrade from version 1 (the examples written
back byte for byte; the tests' own version 1 files written as today's examples; a newer version refused); budgets at
three levels (which one counts, every edit, only what differs written); `editor.json` version 2 and the older one; the
export checker; export, import and export again giving the same files, byte for byte, on both examples, on a version 1
project with budgets and on a version 2 project with budgets at all three levels and a palette profile (an export of a
project with no palette profile names the one an import makes, after the project); palette profiles (names, the very
same colours, the two defaults, the folder made on first use, every route and store function, a profile file with a part
missing or empty listed with why and deleted like any other, import adding or finding a profile, an import refusing an
export whose palette.json has such a part, loading a profile keeping what the effects use, and the default bed gradient
drawing the Molotov's bed as today); the palette profiles in the editor (the defaults known by their names whatever the
capitals, a free name with " (1)", " (2)" for an import or a duplicate, within 64 characters, the file Save as file names,
the list a load shows first, what a load takes out, and a load naming the profile in the same undo step as its colours); the status bar's cost (not measured, measuring, out of date, measured with no budget
on, within budget, how many numbers over, compared with the budgets that count), and the same words in Cost's header; the
line saying which budgets count, and with none on how to switch on the level the boxes show or that its numbers are kept;
the window's grid (the sidebars within
their limits, both giving way so the centre keeps 640 px, the effects list's and the timeline's limits, the sizes
remembered); numbers typed with a decimal point or a comma, a drag in whole steps, a value kept within its limits and
shown with its decimals or only those it needs (the Distance popover's and the right panel's number boxes), and the
prefixes and full names of a right-panel row of two or three numbers; the runtime's loader and its version guard; the screen-area count and the cost
measurement.

```bash
npm run check:browser
```

A headless browser check on WebGPU and WebGL 2 (438 checks): palette colours read back exactly; the ground and walls cut
what they should; the board presets look the same on WebGPU as on WebGL 2; the editor's transport (and New shot each loop: right after Loop,
on at first, a new seed each loop, the same shot with it off, a new one from Fire either way; "New shot" in the narrowest
centre, the header still one row), undo, Fire, dragging,
the generated forms, the words' rows (a word typed again keeps its chance), the layers that cannot draw (an image that did
not load, one not in the project), the right panel (a layer's settings first, under a header whose effect name, like
Esc, leads back to the effect's settings, but Esc not while typing; what draws each layer; a projectile's riders and the
"rides" tag in the Layers list; the colours of the selection, Show all, and their short animation, none with reduced
motion; the hint about clicking a colour only when there is one to click; one icon per kind of layer in the Layers list,
on the timeline and in the header, a ring showing the ring, a sprite its own image (a long thin one, such as a tracer, as
a slice from its middle) or, when the image is missing, the image icon, and an image burst's tag in Plex Sans; its rows:
a grid of label and control, 28 px rows 4 px apart; a number dragged by its name (one undo step), typed with a comma
("0,45", Enter: one step), put back by Esc (none) and stepped by ↑ (one a press); a whole number (How many, Points)
going in whole steps, so the checker never refuses it; an undo pressed in a box showing there at once, with nothing
written back on leaving it; two or three numbers on a row with their prefixes, full names, tooltips and
one unit; a flipbook's Grid with its numbers whole at 1920 and in the narrowest panel, where Cost's title stays whole
too; a drag on a prefix going on while the panel is built again under it; the shortened choices with their full
words; a colour role's swatch following the faction and the picker; Tab through every number box of every layer of both
examples changing nothing; every segmented choice on one line at 1920, and in the narrowest panel too, where it starts
left of the column if it needs the room; the timeline header's Speed buttons on one row;
the headers' More menus, each row doing what the
lists' menus do in one undo step, Move to folder… below the button and an effect's folder muted before its name; the
problems banner only with problems, in both views, its count, its list, a path selecting its layer, "The preview waits until
these are fixed." only for problems that stop the preview, the status bar's Checks opening it and "All good" saying so;
no Cost or Checks under a layer; the effect's sections in order, Cost closed at first; the Folder select (New folder… with
the dialog's OK, and cancelled; a move past 80 characters refused) and the Name field keeping the folder; the Phases bar in
proportion, in the phase colours, and empty at 0, 0, 0; Main colour's swatch, one undo step and its edit button (the
picker at its Colour tab); Edit palette… opening the picker at its Palette tab; Cost's header words and Measure working while it is closed, the Budgets
toggle, the conditions in the info icon, the row names whole; a select or a text box too narrow for its value giving it
in its tooltip; a layer's Layer section with its kind, what draws it, its name and Shows in as three chips with the tier icons,
their see-through checkboxes over them taking Tab and Space (one undo step each) and the last tier kept; the Image section's
rows in the brief's order, its picture as wide as the panel allows and at most 160 px tall, a click on it moving the pivot
(one undo step); readouts at the end of their sections; a glow's gradient's edit button opening the picker at its
Gradients tab, with the gradient chosen in the editor; and phase 6's done-when at 1920 × 1080: a sprite's Look, Layer, Image
and Size and place, and the effect's Effect, Scale, Phases and Colour, without scrolling; and Part B: a word layer's words
with their chances, a % box per word, Remove, Add word, "No word: 40 %", the red note over 100 %, the 1,000-shot line as the
game's own pick counts it, capitals, one undo step per change, Tab through an empty box changing nothing, the focus kept
in a renamed word's box through its first chance and moved to the next bin after Remove; a gradient
picked on smoke, a fire's bed and a burst, drawn in the runtime's buffers and one undo step each, with a glow's edit button;
the "not drawn" warning over the preview and under what draws a layer, for a layer the tier leaves out, an effect whose
errors stop the preview and, on a throwaway project, an image that does not decode, also with Show hints off), the
colour picker (UI phase 7: 272 px wide, left of the right panel, its top level with the row that opened it and inside the
window; its header and its three tabs as a segmented control; each way in opening its tab, the tab used last remembered
until a reload, the keys on the tabs staying in the picker and Esc closing it; the Colour tab under 640 px for every
colour, and for the two worked out from others once set by hand, its parts in order, the faction switch, Copy, the
exact values, Darker, Lighter, Goes with it and its scheme, Revert and whose value it is, the main colour and the
worked-out colour, each change one undo step, a click right after a colour typed with Enter doing what it says, and the
status line's words ("Copied #…") going when another colour, faction or value shows and when the picker closes, and taking
the source line's place, so glow.hot keeps its height after Copy and after a value that is not a colour; the Palette tab's 22 px chips, the main colour's dot, names in the
tooltips, New colour folded and saying what it did under Add colour; the palette profiles there, in the
temporary palettes folder and a throwaway project: the list with the defaults locked, the rows of a profile's menu with no
tooltip of the lists' rows (its Duplicate is not a layer's), Save as profile… with a taken name
asked again, Save over and Delete asking first, Load listing what a profile lacks and keeping it in one undo step, Load
listing what it takes out (a colour and gradients no effect uses) with Cancel keeping them and one Ctrl+Z putting them
back, a profile that lacks nothing loading at once, the project naming its profile in project.json after Save, Rename, Duplicate, Save
as file, Import profile… numbering a taken name, Restore the default profiles, Esc in a name box cancelling with
the panel working on, Enter in a name box giving the name once and, after it, Enter on a later question's focused main
button (Save over…, Delete…, Load) confirming it, each question opening with the focus on its main button (the Load
question too, with a list long enough to scroll), Enter on its Cancel and Esc cancelling, the line under the list starting empty each time the tab shows (a list that could not be read
saying so in red until it is listed again), the folder left as found; the
Gradients tab, its editor and ramp folding as the right panel's sections do, and Use on the selected … putting a gradient
on smoke, a fire bed and a burst, one undo step each, its words following the selection), Fade
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
tag and the line saying what draws a layer explaining themselves; every
label and section title of every layer of both examples, and every control of the bars, with a help text; every hint in
the right panel one line, two at most, at the default width; the full words of each rewritten hint in the tooltip of what
it explains; the Game events hint in its tooltip's words), the add menu,
phase starts, New from preset, tiers, game events (unsaved ones are asked about before leaving), the cost panel and budgets (a typed number switches on its level, and the card
says which level counts, in one or two lines even for a class with a long name), the Budgets place on a throwaway project
(each level on and off, numbers at each level, a class picked, made with New class… (OK, and Enter in its box), renamed
and deleted, which level
counts, every change one undo step, saved in project.json; a budget box taking "0,5" as a half and ↑ stepping it; in
the narrowest panel an empty budget box's word ending in an ellipsis), saving after deleting an effect (its
budgets leave project.json, and come back with undo and the next save), the preview drawn once per screen frame, the
shell (the window's grid at 1920 × 1080 and 2560 × 1440, with at least 8 track rows and 14 layer rows showing at 1920; the four
splitters: a drag, their limits (with the effects list at its largest, the Layers header and its + staying in the column, and a
row showing, with its buttons on hover),
the sizes remembered after a reload, a double-click putting the default back, the arrow keys, the preview drawn at its new
size while one is dragged, the Look following; the status bar: the checks and a click
opening the problems banner, the triangles and draw calls, the cost's states, the renderer, the hint over the preview, messages above it; the
main menu: below the logo, its keys, Esc giving the focus back, Tab too (with no error), a second click and a click outside
closing it, every row; a question such as New project… or Save as… running its command once for OK or Enter in its box,
nothing else opening, and nothing after Esc or for Enter on Cancel; the ? key, not while typing; the scale in the View chip; typing a time in the timeline's
header, and the time's focus ring clear of the text after it; `?frame=1` showing nothing of the editor round the game
screen, every menu and popover too), the viewport toolbar (one 36 px row at 1920 and 2560 px with long values, and
two rows at 1280, with Fade other layers and View side by side; Fire's and the chips' tooltips; each chip's menu by mouse and by keyboard, choosing what the old control
chose, a scene remembered for its effect; the arrows, Home, End, type-ahead, Enter and Esc in a menu; the editor's keys
waiting while a menu is open, so L in the Tier menu goes to Low and Loop stays; the View menu's 1, 2 and 3; F firing from
a closed chip and Space playing; Distance dragged in 0.1 m steps for 4 px, ten times that with Shift, up to 50 m, its
popover's slider keys and a typed "0,5", and past 14 m (the target dragged in the tank shell's scene) its box and slider
showing what the chip shows, ↑ and ↓ stepping from there, PageUp and PageDown 5 m, End 50 m and Home 0, past 50 m the box
showing what the chip shows with ↓ going to 49.9 m, a typed 20 m taken and the chip's drag going on from it; a right-click menu staying inside the window, and a menu taller than the window
scrolling inside it, with the row that takes the focus in view; a right-click menu opened while nothing had the focus
letting go of it as Esc closes it, so Space right after opens no rename box; tooltips at once when Tab brings the focus to a number
box or a select, and none after a click into a box), Show hints (on at first; the light bulb and the main menu's row hiding
and showing the hints and the drag hint over the preview, remembered after a reload; `?hints=off` and `?hints=on` for their
page only; counts, ids and the cost card's lines staying, and the status bar's drag hint too), the effects list (on a
throwaway project with folders, deleted after: folders from " / " in the names, nested, folders first, each A to Z with
numbers in order, the counts, the indent of each level; a folder closed and opened, remembered per project after a reload and
after another project; the search by name, folder, file and game event, the "1 of 9" count, the folders it opens closing
again but the selected effect's staying open, Esc and a second Esc, / and not while typing, no match and Clear the search; the More button on hover and on the
selected row, its menu and a second click closing it, the button staying and looking open while its menu is, a right-click;
renaming in place by a double-click and F2, Enter, Esc,
an empty name and a click elsewhere, and another row's More clicked meanwhile, whose menu opens below it; Move to folder (a
folder, No folder, New folder… with the dialog's OK and with Enter in its box), Duplicate (its name, folder, scene, own budgets and no events; one
undo with nothing unsaved left, redo, project.json after saving) and Delete with its question, each one undo step;
deleting an effect that is not selected, from its More or a right-click, keeping the selected effect and layer, the time
and the panel's scroll, also after undo, and deleting the selected one selecting the first effect; the
main-colour dot and its edge, following the faction; a project with no effects, its "No effects yet." and Make an
effect), the layers list (the add menu's groups and the 14 shapes by their plain names, each row's tooltip ending with
the name in the file in Plex Mono, a new layer above the selected one and selected; the tags with the shapes' plain names
in Plex Sans, a row's tooltip saying its shape whole, and in the narrowest sidebar "beads along a beam" cut with an
ellipsis inside its 28 px row; each of the 14 shapes' section titles in the right panel with its plain name, its tooltip
keeping its help text and ending with the name in the file; a row's buttons in its tag's place on hover and on the selected row, their tooltips and keys, its menu by
More and by a right-click, the buttons staying while it is open, and Esc closing only the menu; Move up, Move down,
Duplicate and Delete, each one undo step; renaming in place, and another row's More clicked meanwhile, whose menu
opens below it; a press of less than 4 px a click, a drag with its 2 px line in one undo step, and Esc cancelling it
(letting go after that is not a click); the empty state; the hover highlight both ways with the timeline; a new
selection scrolled into view in both, nothing round them moving, and a layer moved by Ctrl+[ from the last row that shows
staying in view in both), the timeline (its sizes at 1920 and 2560: the names column
176 and 200 px, the ruler 24, the phase strip 16, rows 24 and bars 16 px with 3 px corners; every bar's label whole in its
lane, inside its bar when it fits, else beside it in the muted colour, the Rifle shot's Bullet and a short bar near the end
of the span too, and after the splitters make the lanes narrower, then wider again; the phases' names inside when they fit,
their times in their tooltips, and measured also when the effect has no layers; the playhead's line through the ruler and
the lanes, its 10 px head clear of the tick labels and dragging the time from where it is; no label hidden by the playhead,
on the Hammer leech beam and the Rifle shot at 20 ms; the ruler and the phase strip at the top while the rows scroll, and a
selected row scrolled into view below them; a
click on a bar, on a label beside its bar or on a name selecting and keeping the time, a drag from a bar and a press on the
ruler, the phase strip or an empty part of a lane scrubbing; the selected row's tint across the name and the lane and its
bar's outline, the hovered and selected lanes' colours in Day and Night, a row left out of the tier at 35 %, and the edge
round a label keeping the colour round it while a hover fades in or out and when the theme changes), the keys
/, F2, Ctrl+D, Ctrl+] and Ctrl+[ (and none while typing or with a menu open; inside the rename and search boxes Space,
Delete, Backspace, ← and → only type, and Esc does only
the nearest thing; Keyboard shortcuts listing them), Save as, Export and Import
(`project.json` and `editor.json` version 2
with the budgets), the palette profile Import keeps (in a temporary palettes folder: the real `palettes/` is not touched), Save as and Export keeping its name, a project
whose `project.json` is version 1 (it opens, with its scenes, and nothing is written) and one of a newer version (not
opened, and the editor says why, also when it is the project the editor starts with); the test page on both backends
(exact palette colours, every event plays, Low draws less, the version guard, a glow drawn from an exported gradient in
its exact colours) and its bundle (no checker, no editor code); the colour picker (a typed colour, a drag and Revert, a
new colour, and the focus back on the swatch that opened it when it closes, also in a layer's list that hides the main
colour), a ready-made gradient on a glow, night mode, the faction markings in the Faction chip's menu and the edge round their team colours' dots in Day and Night, and Save as, Export and Import carrying
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
    with no chances shows the same word for every seed as before. In the editor (UI phase 6, Part B) each word is a row with
    its chance in %; the panel says what is left for no word, warns over 100 %, and counts 1,000 shots with the runtime's
    own pick.
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
    until it is switched on. The closest level that is on counts, as a whole set. Cost shows which one, and its Budgets
    place (under its Budgets toggle) switches each level on or off, edits each level's numbers, makes, renames and deletes
    classes and picks each effect's class.
  - **`project.json` version 2** (with `paletteProfile` and the new budgets), read and written by one reader shared by the
    local server, the command line and the editor. Version 1 projects still open; an export's `editor.json` is version 2,
    and import reads the older one too.
- **Palette profiles** ([docs/colours.md](docs/colours.md)): named sets of colours in `palettes/` on this computer, made
  with two defaults (**Built-in**, and **Built-in with gradients**: the ready-made gradients and three for the fire's bed,
  sparks and smoke). The local server and the editor's store list, read, make, save over, rename and delete them, and
  restore the defaults; import keeps an export's colours as one (or finds one with the very same colours). Loading one into
  a project keeps every colour and gradient the project's effects use that the profile lacks. Since UI phase 7 they are on
  screen, on the colour picker's Palette tab: load one (one undo step), save the project's colours as a new one or over
  one, rename, duplicate, delete, save one as a file and import it, and restore the defaults; the project names the profile
  its colours came from.
- **The colours each layer uses**: the checker knows every colour a layer can use, named or not: the roles its fields name,
  the black ink outline, a star's white first step, your own team's broken edge (`heat.rim`) and its gradient's stops. It
  names any the palette lacks, and what the layer needs it for ([docs/colours.md](docs/colours.md)).
- **Layers that cannot draw**: the runtime notes, frame by frame, each layer it skips because its image is not in the atlas.
  The editor turns that into plain words ("the image muzzle_flash.png did not load", "the image … is not in the
  project"). A layer the tier leaves out is not a fault and gets no note. Since UI phase 6's Part B the preview and the
  layer's panel say when a layer is not drawn and why: its image, the tier shown, or errors in its effect.
- **The export** ([docs/export.md](docs/export.md)): one folder with a manifest (effect names, versions and the game events
  each answers), one JSON file per effect, one packed atlas with its map. A checker names missing images, unknown roles and
  schema errors. Importing an export gives back the same effects.
- **The test page**: loads only the runtime and an export folder and plays an effect by event name, on WebGPU or WebGL 2.

- **The editor's look** ([docs/ui-redesign.md](docs/ui-redesign.md), section 4): two themes, Day and Night, from one set
  of colour tokens; one typeface in sentence case; icons drawn in code for every button. Most buttons keep their words next
  to the icon; those with only an icon, such as Undo, Redo, Night mode and a row's More, give their names in
  their tooltips. The Faction chip shows each faction's marking from sheet 16. Every kind of layer has its own icon: the 14
  shapes, the nine looks of a burst's pieces, the word, the projectile and the sprite.
- **Tooltips that explain** (docs/ui-redesign.md 6.9): one tooltip for the whole editor, dark in both themes. Every label
  and section title of the right panel, for the effect and every layer type, and the controls of the bars and lists explain
  what they do and how to use them, in plain words written against the code (`src/app/help.ts`), true for what is shown.
  The browser's own tooltips are gone: every title shows in the same tooltip. **Show hints** (the light bulb in the top bar)
  shows or hides the one-line hints; their full words are always in the tooltips.
- **The right panel shows what is selected**: the effect's settings, or one layer's only, under a header that leads back
  to the effect (its name, or Esc) and has a More menu. Every layer says what draws it; a projectile lists the layers riding
  it, and they say so in the Layers list. The colour list shows the colours of the selection (Show all: every colour, the
  selection's in bold). Since UI phase 6 (docs/ui-redesign.md 6.6), each setting is a row, numbers are
  dragged or typed, two or three numbers share a row, a colour setting shows its swatch, and while the checker finds
  problems a strip under the header lists them. The effect's settings are sections that fold (Effect with a Folder select,
  Scale, Phases with a bar of the three lengths, Colour with the main colour, and Cost, closed at first, with the Budgets
  place); a layer's start with the Look and its Layer section (Shows in as three chips; a line when the preview does not
  draw it, and why), and a sprite's picture fills the panel's width. Phase 6's Part B, the on-screen part of what Mustafa
  approved on 2026-11-15: a word's chances, gradients on smoke, the fire's bed and bursts, budgets at three levels, the
  "not drawn" warning.
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
- **The lists** (UI phase 4, docs/ui-redesign.md 6.2): the effects in folders made from their names, with a search and each
  row's menu (Rename, Duplicate, Move to folder…, Delete); the layers with an add menu, each row's buttons and menu,
  renaming in place and drag to reorder; the row under the mouse highlighted in the Layers list and on the timeline. Their
  parts (a search box, a box to rename in place, a menu one list shares, drag to reorder) are in `src/app/dom.ts`.
- **The timeline** (UI phase 5, docs/ui-redesign.md 6.5): a names column in the Layers list's order, with its selection and
  hover; the ruler and the phase strip, which stay at the top while the rows scroll; bars whose labels are never cut (inside
  the bar, or beside it); a click on a bar selects its layer; a playhead whose head drags, drawn under every label. Since
  UI phase 6's Part B, New shot each loop next to Loop: each loop a new shot, as in the game.
- **The colour picker** (UI phase 7, docs/ui-redesign.md 6.7): 272 px wide, left of the right panel and level with what
  opened it, with three tabs: Colour (the faction switch, the wheel, the hex value, the exact values, Darker, Lighter, Goes
  with it, the main colour, Revert, whose value it is), Palette (every colour as a chip, the palette profiles, New colour)
  and Gradients (ready-made gradients, the project's, the gradient editor with Use on the selected …, which works on a
  glow, smoke, a fire bed and a burst). Each way in opens its own tab.

Not yet: sound, camera shake and hit-stop; a shade input so smoke darkens in shadow; a way for tiers to drop parts of one
layer (such as tones in a star), not only whole layers; renaming or removing colours and gradients; an image burst's
image in the editor's form. What Mustafa approved on 2026-11-15 is on screen: since UI phase 6 (Part B), and the palette
profiles' buttons since UI phase 7 (the colour picker's Palette tab).

## Assumptions

These are Shamble VFX's own guesses, not Mustafa's decisions. Tell us if one is wrong.

- **What the big controls change** (all in one place: `vfx-runtime/src/core/controls.ts`):
  - Size scales every sprite, shape, word and piece, and every offset. Not the points the game gives (origin, target), and
    not speeds.
  - Intensity scales flashes, hits and landings, the stretch of streaks, and how many pieces a burst throws. It never makes
    anything see-through.
  - Duration stretches the effect's own times: start delays, lengths, the three phases and fixed flight times (a flight for
    a time or for a phase). Not a flight by speed (that comes from distance), and not the step rate.
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
  have decimals (12.5 %); chances that add up to 100 within a billionth (33.3 + 33.3 + 33.4) count as exactly 100. A list of
  words typed again (`wordsFromText`, which the words box used until UI phase 6 made each word a row) keeps a word's chance
  when its text is the same, capitals or not (words are drawn in capitals) and with or without spaces at either end (they
  add nothing to the drawing); a word typed twice is matched in order (the first BOOM takes the first old BOOM's chance).
  The rows keep a chance with its row (see "The inspector", Part B).
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
  not on at that moment gets none. Both notes name the image ("the image dust_puff.png is not in the project"). The "not
  drawn" warning of UI phase 6 does not wait for that moment: the atlas already says the layer cannot draw, so the warning
  shows at any moment (see "The inspector", Part B).
- **Budgets at three levels and `project.json` version 2** (the levels, "off until switched on", which one counts, the three
  starting classes and "old budgets become the project's, switched off" are the approved plan; these details are ours):
  - A class has an `id`, made from its first name and kept when it is renamed; an effect's entry names that `id`. A class
    name has 1 to 64 letters, no tabs or line breaks, and is unique without regard to upper and lower case (the rule planned
    for palette profile names). A file's class that an effect names but the list lacks is read as no class.
  - In Cost's Budgets place (UI phase 6, Part B), a number typed switches its level on (the project's, class budgets for the
    whole project, or the effect's own), as the boxes did for the project's before; clearing one does not switch it off.
    The colours compare with the level that counts.
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
  - The picker's two yellow buttons (Add colour, and Use on the selected glow, now Use on the selected …) are plain buttons
    now: only a dialog's main button is yellow, and the picker is a popover.
  - In phase 1 only the timeline's colours, lines, corners and type changed; phase 5 gave it 4.3's sizes (see "The
    timeline").
  - A timeline bar's 1 px `--tl-bar-edge` is drawn just outside the bar, over the lane, so in Day it stands out from the
    lane (3:1) even on the white word bars. A Day bar looks 1 px longer at each end.
  - A layer's "not in Low" tag stays in `--bad`, as before, and its name on the timeline stays muted, except on the selected
    row: there the name takes `--text`, because `--text-muted` on the selected tint is under 4.5:1 in Night (section 6.5
    asks for the name muted). Since phase 4 the Layers list's selected row shows its buttons in the tag's place (see "The
    lists").
  - In the Layers list a long tag stops at half the row, so the layer's name always shows.
  - The effect's main colour in the colour list (it took the palette grid's place after phase 1) is marked with
    `--bg-field`, a 1 px `--line-strong` edge and weight 500, not the yellow selected look: it is a stored choice, not a
    selection.
  - In the colour picker the chosen colour's chip already has a 2 px outline in the focus colour, so keyboard focus on it
    draws a 1 px `--focus` line inside the chip, 2 px in from its edge, instead of the usual ring.
- **The right panel after UI phase 1** (Mustafa's feedback of 2026-11-16: a layer's settings first, the colours of the
  selection with Show all, what draws each layer and what a projectile carries; these details are ours):
  - With a layer selected the panel shows only that layer's settings. Its header (the brief's 40 px inspector header) stays
    at the top while the panel scrolls, so the way back always shows. Since UI phase 2 the effect's view has a header too (see
    the shell, below), with its Effect section under it. Cost and Checks stayed at the bottom of both views until phase 6;
    since then Cost is the last section of the effect's settings, closed at first, and the problems banner took the place
    of Checks (see "The inspector").
  - Another selection starts the panel at the top; a part switched on or off keeps its place. When the control you used
    goes with the old view (the effect's name, a rider, Esc pressed in the panel), the keyboard focus moves to the new
    view's title; since UI phase 6, when the same view is built again (a tier switched on or off), the control you used
    keeps the focus.
  - Esc leaves the layer only when the colour picker and dialogs are closed and you are not typing: not in a text or
    number field or a select (as for every other key there). A checkbox or a slider that keeps the focus after a click is
    not typing, so Esc works from there.
  - Where the colour list sits: in the effect's view, the Colour section (since UI phase 6; it was a row of the Effect
    section), under Main colour. In a layer's view it is the layer's Colour section. Either way Show all is on the section's
    title row (open by default; one open or closed state for every Colour section, the effect's too, as sections remember
    it by title). A sprite keeps its one Colour section: its tint first, then its colours, after Image and Size and place as
    before. A shape, a burst or a word gets the section right after its Layer section (its name and tiers), before Place,
    so it shows without scrolling (their own settings can be long); a projectile, after its riders.
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
    projectile's panel names its kind by its plain name, as everywhere ("Shape: trail behind a projectile, drawn in code,
    no image"). Riders are listed as in the Layers list, top of the drawing order first.
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
  - The toggle sits in the toolbar just left of the View chip (see "The toolbar and hints"), with the striped square of
    icons.ts (drawn for the colour picker's gradient editor, whose title lost it in UI phase 7). The icons
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
    kbd on the first line, and last, where the editor shows a plain name for what a file names otherwise, the name in the
    file ("In the file: band", the name in Plex Mono; see "Shape names" under "The lists"). Own words may hold more than one
    line (a shape's row in the Layers list). A label cut short with an ellipsis shows its whole text first. With more than
    one line, the first is semibold; the name in the file is a footnote and does not count, so a help text above it keeps
    its own weight. A shortcut written at the end of a title, "(Esc)", moves into the kbd: only a key combination or a named key
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
  - The effect's header: a dot in its main colour (for the faction shown; its tooltip names the role), its name and
    "Effect"; since phase 6 also its folder before its name and a More menu (see "The inspector"). The Effect section stays
    under it.
  - Typing a time in the readout comes now, with the header: Enter goes to the typed time, paused; a comma works as the
    decimal point; a time past the end stops at the end; Esc, or a click elsewhere, leaves it as it was.
  - The ruler, the phase strip and the track rows kept their sizes (26, 16 and 26 px) until phase 5 gave them 4.3's (24, 16
    and 24 px): at 1920 × 1080 with the default sizes the tracks get 272 px, which hold the ruler, the phases and 9 rows.
  - A click on Checks in the status bar showed the effect's settings at its Checks section until phase 6; since then it opens
    the problems banner (see "The inspector").
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
    gives way, down to one row, so its header with the + stays in the column. Since phase 4 nothing sits under the list:
    the add menu is the header's +, and the buttons are on the rows.
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
  - In the 296 px panel the cost table's budget boxes have no spin arrows. Since UI phase 6 they are text boxes, as the
    panel's other number boxes: "0,5" and "0.5" are both a half (as number boxes they read the comma as a thousands mark,
    so "0,5" became 5), and ↑ and ↓ still step the number (Shift: 10 steps), each press one undo step. The row names that do not fit (Sprites alive,
    CPU ms a frame) end in an ellipsis, with the full name in their tooltip, until phase 6 remakes the card.
  - A message (the toast) shows 12 px above the status bar.
  - The right panel stays the column that scrolls, with the cards straight inside it: its 40 px header is sticky at the top
    of that scroll, not a row of its own over a scrolling body (the browser check and the settings inventory read the cards
    there). Where scrollbars take room, the right panel's runs beside the header too.
  - The splitters are 6 px strips laid over the zones' own 1 px lines (each placed in the grid on that line), not rows or
    columns of their own: the workspace keeps its three columns, and the left sidebar and the centre their rows.
  - The rule for windows under 1400 px went (the grid has its own defaults now). Since phase 5 the timeline's names column is
    200 px in a window 2200 px wide or more and 176 px below (`--tl-name`, set with the grid's other defaults).
  - Since phase 4 the Effects header holds the title, the count and a + menu (New effect, From preset…): it fits the
    narrowest sidebar (200 px) with room to spare.
- **The toolbar and hints** (UI phase 3 of [docs/ui-redesign.md](docs/ui-redesign.md): the toolbar's order, the chips and
  their menus, the parts in `src/app/dom.ts`, Show hints and the one-line hints are the brief's; these choices are ours, not
  Mustafa's or the brief's):
  - **Fade other layers** sits in the toolbar as an icon toggle just left of the View chip: the brief came before it, and
    6.3 does not place it. Its icon and what it does are as before.
  - **Narrow windows**: the toolbar is one 36 px row at 2560 and at 1920 px. With the default sidebars and its longest
    values (the longest scene name, Your team, 50.0 m, Medium) it stays one row down to a window 1486 px wide in Whole
    screen, 1476 px in Game size and 1469 px in Close-up. In a narrower window it wraps onto a second row (65 px): nothing
    is cut, the controls keep their order, and Fade other layers and View wrap together, side by side.
  - **Right-click** is built into the menu part now (`menu()` opens at a point, `contextMenu()` wires an element to it), and
    the browser check tries it; since phase 4 the lists' rows have their menus there. While the button is still down (Linux and macOS
    ask for the menu on the press), the menu opens when it is let go: the browser closes a menu opened on the press when
    the pointer is not over it. Near the window's edges it turns left or up, so it stays inside the window.
  - **`scrubNumber`** (a number you drag sideways or type) is used by Distance (its popover's number box, and its title,
    which drags the number too) and, since phase 6, by every number box of the right panel (see "The inspector").
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
  - **Distance**: the box, the chip's drag, the keys and the slider take 0 to 50 m. Going past 14 m, the old slider's end,
    is Mustafa's decision of 2026-11-25 ("The box takes any distance the target drag can give"): before, you could drag the
    target further (the chip then said, say, 15.8 m), but typing 14 or more did nothing and a drag on the chip jumped back
    to 14 m. The 50 m is ours: the target drag has no limit of its own. Measured in the tank shell's scene, a drag to the
    preview's far corner in Whole screen gives 24 m at 1920 × 1080 and 25 m at 2560 × 1440 with the default sizes, and 36
    to 37 m with the sidebars at their narrowest and the timeline at its tallest (48 m in a 3440 px wide window). The game
    screen's far corner is about 21.4 m from you. Game size and Close-up centre again after each drag, so drags one after
    another go further (14, 24, then 32 m at 1920). 50.0 m is also as wide as 14.0 m in the chip. Past 50 m it is as it was past 14 m: the box shows what the chip shows and the slider stays at its
    end; ↓ goes to 49.9 m, ↑ or Enter in the untouched box and typing 50 or more change nothing, and a drag on the chip goes
    to 50 m at once. Whether the target drag should stop at 50 m is a question for Mustafa. A press that
    moves less than 3 px is a click. The popover opens with the focus on the slider, whose keys do what they did: ← and →
    (and ↑ ↓) step 0.1 m, PageUp and PageDown 5 m (a tenth of the slider, as before), Home and End go to 0 and 50 m. Tab
    goes on to the number box; Tab from there, or Shift+Tab from the slider, closes the popover and gives the focus back to
    the chip, as Esc does. Enter in the box sets the number and keeps the popover open; ↑ and ↓ in the box step 0.1 m (1 m
    with Shift).
  - Words checked against the code: Made by's "You" also gives broken edges (the runtime draws your own effect's edges as
    your team's: `core/draw.ts`), so its row says "thin broken edges, your own words show", the same words as Your team's row (the brief: "your own words
    show").
    Each Tier row says "draws only the layers in this tier", as the brief does (a projectile has no tiers; the layers riding
    it follow theirs). The Scene menu's footer, "Each effect remembers its scene.", holds while the editor runs, and in
    project.json once the project is saved.
  - The Faction chip's marking is filled with the team colour of the built-in palette, as the faction buttons were. In its
    menu, each team colour's dot has a 1 px edge round it in `--text-faint`, as an unchecked box has: the edge stands out
    from the menu by 3:1 or more in both themes, so Empire's dark purple shows in Night. The dots in Day have it too.
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
  - **One-line hints**: each explanation longer than two lines at the panel's default width (about 90 characters) is one
    line now, and its full words are in the tooltip of the setting or section it explains: Game events; the Cost and
    Checks titles; a glow's gradient; the colour list (the Colour titles, and each colour's own tooltip); in the colour
    picker, the titles of New colour, the ramp and the gradient editor, and since UI phase 7 the Gradients tab, which took
    the Gradients title's words (the picker's tooltips have no help texts, so these carry the words themselves). The
    shorter hints stay as they were, and their words are in their labels' tooltips too (Intensity's tooltip now also says it never makes anything see-through). Where a short line did
    not quite say what the code does, it does now: Size also scales shapes, words and pieces (the brief's example named
    sprites and offsets only); Duration stretches a flight with a fixed time and leaves a flight by speed to distance ÷
    speed; the cost card's budgets come at three levels, so its line says "Budgets: the project's, a class's or its own."
    (UI phase 6, Part B; before, when the boxes were the project's only, "The budgets are the project's"; the brief's
    example: "Budgets are shared by the project").
  - Game events' line says the game **starts** an effect by its names ("Names the game starts this effect by, separated by
    commas."), as its tooltip and What to click say. The brief's example says "plays"; one name for one thing.
  - The Layers title's tooltip starts with "Top of the list draws on top." (6.2); its hint, "top draws on top", stays.
  - Dialogs: the line in New from preset and the one under Import an export in Projects explain the whole dialog, so they
    are the dialogs' own text, always shown and kept short. The second one's full words ("each image cut back out of the
    atlas") are the tooltip of the title Import an export.
- **The lists** (UI phase 4 of [docs/ui-redesign.md](docs/ui-redesign.md): folders from " / " in effect names, the search,
  the rows' menus, the add menu, renaming in place, drag to reorder, the empty states, the sync with the timeline and the
  keys are the brief's; these choices are ours, not Mustafa's or the brief's):
  - **Shape names: plain names everywhere** (Mustafa's decision of 2026-11-25: "'Beam', 'Flame tongues' everywhere; the
    file's name stays in the tooltip"; the details here are ours). Each shape shows its plain name (`SHAPE_TEXT`): the add
    menu's rows ("Beam", "Star of shards"; the name in the file no longer shows on their right), the Layers list's tags
    ("beam", "star of shards"), the right panel's section title ("Shape: beam") and a rider's line. The name in the file
    ("band", "shards") is the last line of the tooltips of the add menu's row, the section title and the Layers list's
    row: "In the file: band", the words muted and the name in Plex Mono, as what is typed into files. Effect files, the
    examples and the format keep the kinds; only what is shown changed.
    - Case: a plain name that starts a label is in sentence case ("Beam"); after "Shape: " it is in lower case ("Shape:
      beam"), as `layerKind` words it; a tag is in lower case, as the other tags are ("rides Bullet", "9 × spark").
    - A long tag ("beads along a beam", "trail behind a projectile") is cut with an ellipsis, as the other tags are. Since
      the tag hides on hover, the row's tooltip says the shape whole, on its second line ("Shape: beads along a beam"),
      after the layer's name. The timeline's names column shows no tag, so its tooltip stays the name. The longest
      section title, "Shape: trail behind a projectile", fits whole even in the narrowest right panel (260 px).
    - Help texts are looked up by the shape's kind, which the panel gives, so each title's tooltip says what it said
      before; the add menu still names its rows by the kind for the help texts ("Shape: band", not shown).
    - A section remembers open or closed by its title. So a renamed shape section forgets that you had closed it, and
      starts open, as a shape section does at first.
    - The settings inventory shows the renamed section titles, and the sections inside them with them ("Shape: beam >
      From"): Shape: shards is **Shape: star of shards**, Shape: flash **Shape: muzzle flash**, Shape: cloud **Shape:
      cloud blast**, Shape: dots **Shape: halftone dots**, Shape: scorch **Shape: scorch mark**, Shape: lines **Shape:
      speed lines**, Shape: trail **Shape: trail behind a projectile**, Shape: band **Shape: beam**, Shape: beads
      **Shape: beads along a beam**, Shape: flames **Shape: flame tongues** and Shape: bed **Shape: fire bed**. Shape:
      glow, Shape: ring and Shape: smoke stay as they were. Nothing else in the inventory changed.
  - **Folders.** Each level is indented 20 px (a folder's chevron and the gap after it), so an effect's dot sits under its
    folder's icon and its name under the folder's name. A folder's count is every effect inside it, those in its folders
    too; while a search is on, the effects in it that match. Folder names are exact: "Weapons" and "weapons" are two folders.
  - **Open or closed.** Remembered per project in `localStorage`, as `vfx-folders:<project>`, the list of closed folders, so
    a folder never seen before starts open. When an effect is selected another way than a click on its row (Duplicate, New
    effect, From preset…, undo, deleting the selected effect, the right panel's name), or moves to another folder (Move to
    folder, or a rename that adds a folder), its folders open and its row scrolls into view; a moved effect does so even
    when it is not selected. Opening a project leaves its folders as they were left: its first effect may sit in a closed
    folder, whose name then shows in the selected row's weight (not in yellow: the folder is not the selection).
  - **Search.** Every word typed must be found, in any case, in the effect's name (its folder is part of it), its file
    (`rifle_shot.vfx.json`) or one of its game events. While a search is on, the header's count says "3 of 16"; folders with
    matches show open, and a click opens or closes them for that search only; when the search is cleared, the folders it
    opened close again, as they were, except the selected effect's own folders, which stay open so its row still shows and
    scrolls into view. While the selected effect does not
    match, its row is not in the list (the right panel and the Layers list still show it). Something that selects an effect
    the search hides (New effect, Duplicate, F2 on it) clears the search, so its row shows. Esc in the box clears it; Esc in
    the empty box gives the keys back to the editor (the box lets go of the focus); neither leaves the layer. Opening
    another project clears the search.
  - **Rename in place.** The box holds the name without its folder, all of it selected. A " / " typed in it makes folders
    inside the effect's own folder; to move an effect to another folder, use Move to folder (or the right panel's name,
    which holds the whole name). Enter or a click elsewhere keeps the name typed, and the click still does what it does
    (another row clicked is selected); Tab keeps it too; Esc keeps the old name; the window losing the focus does not end
    it. An empty name keeps the old one (the right panel's name field makes an empty name "Effect" or "Layer"). A name
    longer than 80 characters with its folder is refused, with a message. Undo, redo or Ctrl+S while the box is open leave
    the box as it is, with what was typed.
  - **Duplicate.** The copy takes the source's own budgets (its class and numbers) as well as its scene, and no game events.
    It goes just after the source in the project, and is selected. Its id is freeEffectId's, from the source's id without a
    number at its end (`rifle_shot_2` gives `rifle_shot_3`; as for layers, a free id without a number is taken), within
    the 48 characters an id may have; its name is "<name> copy", within 80 characters (a long name gives way at its end).
    One undo takes away the copy, its scene and its budgets, and leaves nothing unsaved that was saved before; redo brings
    them all back. A copy deleted later keeps them, as every deleted effect does, until you leave.
  - **Move to folder…** lists every folder in use, nested ones by their path ("Vehicles / Tank"), A to Z, with a dot at the
    effect's own. New folder… asks for a name with the question dialog (default "New folder"); a " / " in it makes a folder
    inside a folder. It opens where the effect's menu was. Folder names are names people give: no help text is looked up for
    them. With so many folders that the menu is taller than the window (more than 34 at 1920 × 1080), it stays 4 px inside the
    window and scrolls, and the row that takes the focus scrolls into view. Every menu does so.
  - **Drag to reorder.** A press becomes a drag once the pointer moves 4 px; less is a click, which selects the row. A drag
    does not select the row. While it lasts, the dragged row stays highlighted, in the list and on the timeline, and near
    the list's top or bottom edge the list scrolls. Esc cancels it: nothing moves, and the layer stays selected; letting go
    of the button after that is not a click, even over the row the drag started on. The whole row is the handle: there is no
    grip icon (4.5 lists one; 6.2 does not put one on the row).
  - **The row's buttons** show on hover, on the selected row and while the keyboard focus is in the row. The keyboard
    reaches them on the selected row (Tab); on other rows the menu is a right-click or the context-menu key away. They act on
    their own row's layer, which need not be the selected one: Move up and Move down keep the selection; Delete in a row's
    menu asks nothing, as the Delete key never did, and when it deletes the selected layer, the next one takes its place.
    While a row's menu is open, its buttons stay, and More looks as a chip with its menu open (4.6 names only chips): the
    field colour, the icon in `--accent-ink`. So does a header's + while its menu is open.
  - **A row's menu acts on its own row**, in both lists: More or a right-click on a row that is not selected leaves the
    selection as it is. While the menu is open, only More's open look shows which row it is for; a right-clicked row is not
    marked. Deleting an effect that is not selected keeps the selection, as the Layers list does: Mustafa's decision of
    2026-11-25 (before, the selection jumped to the first effect of the project). The selected effect, its selected layer,
    the time and the right panel's scroll stay, and undo brings the deleted effect back without changing the selection.
    Deleting the selected effect still selects the first effect, with no layer.
  - **The tag on hover.** On hover, and on the selected row, the buttons take the tag's place (the tag stays in the page,
    hidden). So a rider's "rides Bullet" is said in the row's own tooltip ("Tracer: rides Bullet") rather than in the tag's.
    A row both selected and left out of the tier shows its buttons in place of "not in Low": its icon and name stay faded,
    and its tooltip still says it is not drawn in that tier.
  - **Empty states.** "No effects yet." with **Make an effect** (New effect); "Nothing matches "…"." with **Clear the
    search**; "No layers yet." with **Add a layer**, which opens the add menu below it. With no effect, the Layers list
    still says "No effect.".
  - **The hover highlight** is `--bg-hover`, as on a row under the mouse; a selected row keeps its own look. A new selection
    scrolls only the Layers list and the timeline's rows, as little as needed. A moved layer (Ctrl+], Ctrl+[, its row's
    buttons or menu, or a drag) does so too, so it never ends under the timeline's ruler or out of the list.
  - **Keys.** / puts the focus in the search without typing the /. Ctrl+D, Ctrl+] and Ctrl+[ go by the character typed, so
    they follow the keyboard's layout; Ctrl+D stops the browser's bookmark only when it duplicates something, and does
    nothing while you type in a field. All of them, and F2, wait while a menu, the colour picker or a dialog is open, or
    while you type. Ctrl+D duplicates the selected layer since the first part of phase 4, as the old Duplicate button's
    tooltip already named it.
  - **Effect rows** keep the shape the browser check reads (`div.item` with `button.item-main`), and layer rows theirs
    (`div.item.layer-item` with the icon, the name's `span` and the tag's `code` as its own children): the name is a button
    inside its span, for the keyboard and screen readers, and a click anywhere on the row selects it.
  - **Trying 40 effects.** The throwaway project `projects/phase-4-forty` (44 effects in 12 folders, made and deleted again by
    a script) was used to try the list with many effects; its pictures are `out/ui/phase-4-forty-*.png`.
- **The timeline** (UI phase 5 of [docs/ui-redesign.md](docs/ui-redesign.md): the sizes, the names column, the ruler, the
  phase strip, the lanes, the bars and their labels, the selection, the tier, the mouse and the playhead are the brief's;
  these choices are ours, not Mustafa's or the brief's):
  - **A click on a bar** selects its layer and leaves the time as it is. A press that moves 4 px or more (as on a row of
    the Layers list) scrubs instead, from where the pointer is then, and selects nothing. Before, any press on a bar
    scrubbed: the time jumped there and nothing was selected. The Hammer leech beam's bars fill most of their lanes: to go
    to a moment there, press on the ruler, the phase strip or an empty part of a lane, or drag. A click on a bar also
    leaves playback as it is; before, the press paused it, as every scrub does. A press with another mouse button scrubs,
    as before.
  - **A bar's label** goes inside the bar when it fits there with 4 px on each side. Else it goes just right of the bar,
    6 px from its edge; when it would come closer than 4 px to the lane's end (a short bar near the end of the span), it
    goes left of the bar instead, 6 px from it. Beside the bar it is `--text-muted`. A bar is one to a row, so a label
    never meets another bar, and with the editor's narrowest centre (640 px) one side always has room. Whether it fits is
    measured on every refresh, when the timeline changes size (the splitters, the window) and when the fonts come in.
  - A label beside its bar belongs to the bar: its tooltip is the bar's, a click on it selects the layer and a drag from it
    scrubs. In `--text-muted` it is 6.9:1 on the lane in Night and 5.2:1 in Day; on a hovered row 5.8:1 and 4.7:1; on the
    selected row 4.9:1 and 4.6:1.
  - **Left out of the tier**: the bar and its label, inside or beside it, at 35 %, mixed with what is behind them rather
    than made see-through (CSS opacity would take the label under the playhead's line). The outline of a selected bar left
    out of the tier now stays whole; before, it faded with the bar. The name stays muted, and keeps `--text` on the
    selected row (see "The editor's visual system").
  - **The playhead and the labels**: every label (the ruler's, the phases' and the bars') is drawn over the playhead's line,
    with a 1 px edge in the colour behind it (a 2 px stroke under its letters), so the line stops just short of the letters
    and shows everywhere else: neither hides the other. For a label beside its bar on a hovered or the selected row, that
    edge takes two new tokens per theme, `--tl-lane-hover` and `--tl-lane-selected`: the lane under `--bg-hover` and
    under `--bg-selected`, as the browser draws them (the browser check holds them to it). While a hover comes or goes,
    the row's colour fades in 120 ms and so does that edge: a registered number (`--tl-hover-in`) mixes the lane's two
    colours. A theme change switches the lane, the edge and the selected row's tint at once (the selected row's tint
    faded in 120 ms before, and the edge round its label did not follow). The stroke goes under the letters with
    `paint-order`: the browser check's Chromium draws it so on text, and checks that no letter changes under the playhead
    (a browser that drew it over the letters would make them thinner).
  - **The playhead's head** is a 10 px shape pointing down, in the ruler's lower half, its point on the ruler's line. The
    tick labels sit in the upper half, 3 px from the top, so the head never covers one, not even the 0 at 0 ms. It can be
    grabbed 2 px either side of it and 4 px above it (where a tick label reaches into those 4 px, a press on the label
    goes to the ruler), and drags the time from where it is (a press on it does not jump); like a press on the ruler, it
    pauses. The keyboard has ← and → and the time readout, so the head takes no focus. The line is two parts that meet:
    one in the header, which stays at the top, and one over the rows.
  - **The ruler and the phase strip stay at the top** while the rows scroll, with the playhead's head. A row scrolled into
    view (a new selection) stops below them: the rows' scroll padding is 40 px, or 24 px when the effect has no phases (as
    in Rifle shot (demo)), and `scrollNearest` reads it.
  - **The names column**: the icon and the name, 12 px, spaced as in the Layers list (12 px from the left, 8 px between). A
    long name ends in an ellipsis; its tooltip gives the full name and the same words as the Layers list's row ("not drawn
    in the Low tier", "rides Bullet"). Before, only the bar had a tooltip. The column runs to the bottom of the timeline,
    with its 1 px line.
  - **The phase strip**: a phase's name that does not fit is hidden, not cut; its times stay in the tooltip. On the ruler,
    a label that would run into the "ms" at its right end is hidden too (in narrow lanes, or when the last label sits close
    to the end). Both are measured from the ruler, so also when the effect has no layers.
  - **Rows**: a 24 px row with its 1 px line leaves 23 px, so the 16 px bar sits 4 px from the top, with 3 px and the line
    under it.
  - The bar's tooltip names the tier as the Tier chip does ("not drawn in the Low tier"; it said "low").
  - A press on the empty corner over the names column scrubs to 0, as before: it is the ruler's row.
  - While firing, the playhead stays hidden, as before. A name on the timeline has no rename and no menu: the Layers list
    has them.
- **The inspector** (UI phase 6 of [docs/ui-redesign.md](docs/ui-redesign.md): the property rows, numbers you drag or type,
  rows of two or three numbers with prefixes, sliders, segmented choices, the colour roles' swatches and the folds are the
  brief's; these choices are ours, not Mustafa's or the brief's). Phase 6 came in six slices: the rows and fields; the
  header's More menus, the problems banner, and Cost and Checks out of a layer's view; the effect's sections; a layer's
  view; then Part B on screen (the last items):
  - **Rows**: 28 px, with 4 px between them, as the brief's words say (a row 32 px from the next). The label column is at
    least 84 px and at most 38 % of the row, so 103 px at 1920 and 112 px at 2560. Every control fills its column, number
    boxes too, so the numbers, right-aligned, line up at the panel's right edge. A checkbox's words sit in the label column
    and its box in the control column, as the brief draws "Flipbook [on]". A hint under a row spans both columns.
  - **Numbers**: a slider's box shows all its decimals ("1.00 ×", "40 m/s"); every other box shows at most 3 decimals and no
    zeros at the end, as the boxes always did ("0.5", "350 ms"). A number typed or dragged is rounded to those decimals:
    before, a typed 0.12345 was kept whole while the box showed 0.123. A number in the file with more decimals than its box
    shows is kept as it is until you change it: Tab through the box, or Enter on what it shows, changes nothing.
  - Each box keeps the step and the limits it had, but one: a setting the file keeps as a whole number (the checker's whole
    numbers: How many, Points, Teeth, Lobes, Dashes, Lumps, Boil every, Shrinks in steps, a pop's Steps and a Seed) goes
    in steps of 1 and shows no decimals, and a typed 7,5 is kept as 8. Their step was 0.01, as for any number with no unit,
    so a drag on the name, or ↑, gave 6.04, which the checker refuses, and the preview stopped until it was undone (found
    in the check after phase 6). A slider's box still takes any number typed, as before (the file may go
    past the slider's ends: Size up to 20, Speed up to 10000 m/s); a drag on the slider's name stays within the slider's
    ends, as the slider does. A drag is a step for every 4 px, ten with Shift, as Distance's. A press on a number's own name
    that does not move is a click, which puts the focus in its box; a slider's name and a prefix ("R") take no focus. Each
    press of ↑ or ↓ is one undo step, as before.
  - An undo (or anything else) that changes a number while its box has the focus shows in the box at once, unless you are
    typing in it; leaving the box then writes nothing back. Before, the box kept the old number until you left it.
  - A change that adds or takes away a part of the layer (the first nudge adds one) builds the panel again; a drag goes on
    through that to its end, and stays one undo step.
  - A slider's box is 56 px, and 72 px for Speed and Spin, whose numbers and units are longer ("1200 m/s", "-1440 °/s").
  - Number boxes are spin buttons for screen readers, as the old boxes were: their number and limits are said with them.
  - **Two or three numbers on a row**: the prefixes are R, U, F (an offset: right, up, forward); X, Y (the pivot); Cols,
    Rows, Frames (a flipbook's grid); R, U (a nudge); Min, Max (a range picked between two numbers: a piece's life, speed,
    start radius, size and spin, a word's tilt, a flame's height, width and steps per sway, the lines' inner radius, length
    and width); Start, End (a glow's size over life, a beam's width); Tail, Head (a streak's width); S, P, E (smoke's size
    over life: start, peak, end); R, F (smoke's drift); W, H (a burst's start area: half width, half height); and 1, 2 for a
    pair the list does not know (two steps of a scale). A box's full name is its name for screen readers and the first line
    of its tooltip ("Right", "Pivot x", "Life, min"); the help text under it is the row's (or the full name's).
  - Their unit shows once, after the last box ("[R 0] [U 1.2] [F 0] m"): three boxes with a unit each do not fit in the
    296 px panel. A typed number with three decimals and a minus (-0.125) in a row of three can still be cut by a pixel or
    two at 1920.
  - A flipbook's **Grid** has long prefixes (Cols, Rows, Frames): with a frame count of three digits its boxes need about
    172 px (with 2 px inside their ends, where other boxes have 3), more than the control column has at 1920 (161 px) or in
    the narrowest panel (138 px). So, as the tier chips do, its boxes start left of the column where they need to (11 px
    at 1920), right of the word "Grid"; where the column has the room (175 px at 2560) they keep to it, and they always end
    where the other controls end. Frames has room for three digits (999 frames, a sheet of up to 31 × 32); a count of four
    digits is still cut. Before, 120 frames showed "12", and in the narrowest panel the numbers ran under the next box
    (found in the check after phase 6).
  - New row labels: **Offset**, **Pivot**, **Grid** and **Nudge**, each with a help text. A generated row leaves out the words
    in brackets that its prefixes now say: "Size over life (start, peak, end)" shows "Size over life", as do "Drift (right,
    forward)", "Start area (half width, half height)" and "Width (start, end)"; their help texts stay keyed by the full
    words. So a glow's "Size over life" no longer says "peak" over its two boxes, and its stray "…" is gone.
  - **Shortened choices** (the words did not fit on one line in the 296 px panel; the full words are the tooltip and the
    name a screen reader says): a sprite's Colour, **Keep** and **Multiply** (the brief's words; the tooltip says "Multiply
    by a colour role", where the button said "Multiply by a role"); a sprite's Faces, **Camera** and **Path**; a projectile's
    Flight, **Speed**, **Time** and **Phase**. The others fit and keep their words.
  - **Choices in the narrowest panel**: with the right panel dragged to its narrowest (260 px), four choices need more room
    than the control column has there (138 px): Boxes show, a projectile's From and To, and its Flight. Their buttons broke
    onto two lines, with "Own" or "Phase" alone on the second (found in the second check after phase 6). Now, as a
    flipbook's Grid does, their buttons start left of the column there (15 to 19 px), right of the label's words, and they
    always end where the column ends. Where the column has the room (1920, 2560) they keep to it, so nothing moves there.
  - **Colour roles**: every colour select of the generated forms (a star's tones too) and a sprite's Role show a 14 px
    swatch of the chosen colour for the faction shown; "main" shows the effect's main colour; a colour the palette lacks
    shows an empty swatch with a red edge. Role names in these selects are Plex Mono now (typed into files, 4.2). A fire's
    tones (flames, the bed) stay boxes where you type a colour's name, as before: they have no swatch.
  - A value longer than its select's column ("fire.smoke.light") is cut short: the browser draws no ellipsis in a select.
    The open list shows it whole, and so does the select's tooltip (see "A select or a text box too narrow for its value"
    below).
  - A star's tone: its colour and its scale, each a row, then Remove; Add a tone under the last. Remove and Add a tone line
    up with the controls.
  - **Folds**: the chevron is the icons' chevron (turned down when open), the title 13 px semibold and cut with an ellipsis.
    Since UI phase 7 the colour picker's sections fold the same way (see "The colour picker").
  - The Phases hint starts with a capital letter now: "Layers can start with a phase or last until one ends."
  - **The headers' More**: the lists' More button (three dots, 24 px) at the header's right end; its menus run the lists'
    own actions, each one undo step, with their help texts. The effect's menu has no Rename (the Name field, F2 and the list
    rename it); its Duplicate effect shows Ctrl+D, since Ctrl+D duplicates the effect while no layer is selected. A layer's
    Rename renames it in place in the Layers list, as F2 does. Move to folder… opens the Effects list's folder menu below the
    same button.
  - **An effect's folder** shows before its name in the header ("Weapons / Rifle shot"): muted, in the title's size, not
    bold; the name stays semibold.
  - **The problems banner**: in both views, right under the header, only while there are problems. Its list is closed at
    first, and stays open or closed as you leave it while the editor runs (not after a reload); the status bar's Checks
    opens it. A path that points at a layer ("layers[3].image") is a button that selects the layer; another path
    ("controls.size") is plain. "The preview waits until these are fixed." shows while the problems stop the preview,
    whether the list is open or not. While the schema refuses a value, the checker names only that problem: it checks the
    rest once the file reads.
  - **The status bar's Checks**: with problems, a click opens the banner's list in the view shown (a selected layer stays
    selected; the panel scrolls to the top; the focus goes to the banner). With none, a click on "All good" says so in a
    message that names what the checker looks at.
  - **The checker's five things** (the schema, colour roles, images, links between layers, lengths) are in the tooltips of
    the banner and of the status bar's Checks: the Checks section that held them in its title is gone.
  - **Cost** never shows under a layer: it is the last section of the effect's settings (see "Cost" below), and the status
    bar's triangles and cost open it there.
  - **The effect's sections** (slice 3): Effect, Scale, Phases and Colour are open at first, Cost closed. Each section
    remembers open or closed by its title, as every fold does, so the effect's Colour and a layer's Colour open and close
    together. The line "Pick a layer on the left to see its details." that sat under the effect's settings is gone: the
    effect's view ends with Cost, as the brief draws it.
  - **Labels renamed** in the effect's view: "Effect name" is **Name** and "Game events it answers" is **Game events** (the
    brief's words); the colour row's "Colour" is **Main colour**, and the colour list has its own name for screen readers,
    "The effect's colours" (a layer's is "Colours this layer uses"); "Phases" is the section's title. In a layer's view:
    the section the layer's kind headed ("Sprite layer", "Projectile layer", "Shape layer", "Burst layer", "Word layer") is
    **Layer**, "Layer name" is **Name**, "Flipbook (a grid of frames)" is **Flipbook**, and the button "Add PNG images to
    the project…" says **Add PNG images…** (the brief's words). The help texts follow.
  - **Name and Folder**: the Name field shows the name without its folder and renames by the Effects list's rename rules,
    through one function: the folder stays, " / " typed makes a folder inside it, an empty name keeps the old one (the box
    shows it again), and its box takes at most the 80 characters less its folder. The Folder select lists No folder, the
    folders in use (A to Z, a folder inside a folder as "Vehicles / Tank") and New folder…, which asks for a name in the
    question dialog, as Move to folder… does. A move is one undo step; one that would pass 80 characters is refused with
    the list's message, and the select goes back, as it does when New folder… is cancelled.
  - **Scale**: the icons for Size, Intensity and Duration are new in icons.ts (two arrows out to the corners, a lightning
    bolt, a clock), muted, before the label's words; the hints are as before.
  - **Phases**: the bar is 6 px, its parts 2 px apart in the timeline's phase colours; a phase of 0 ms leaves the bar, and
    with all three at 0 (Rifle shot (demo)) the bar is the field colour alone, its tooltip saying "No phases: all three
    lengths are 0 ms" (otherwise its tooltip gives the three lengths). The three lengths share the whole row, with no label
    column, each box with a prefix (W, P, F: their full names Wind-up, Peak, Fade are their tooltips and their names for
    screen readers) and its unit inside, as the brief draws "[ 350 ms ]": three boxes with their units do not fit in the
    control column.
  - **Main colour**: a select of the palette's colours with the chosen one's swatch; choosing one is one undo step, as "Use
    as this effect's main colour" in the picker is. Its edit button (the pencil) opens the colour picker on the main colour.
  - **Edit palette…** opens the picker on the main colour at its Palette tab, with the keyboard focus on the tab (until UI
    phase 7 it scrolled the picker to its Palette section).
  - **Cost**: closed at first. Its header gives the status bar's words (one function; the header leaves out "Cost:", so
    "Cost: not measured" there is "Not measured" here), coloured as in the status bar, and the Measure button, which always
    says "Measure" (it said "Measure again" after a measurement: the header has no room for both). The button sits over the
    right end of the header, outside the fold's summary: a control inside a summary would fold the section, and outside the
    fold it shows while the section is closed. The long explanation is the title's tooltip; the measuring conditions are the
    tooltip of an info icon after "Measured over …" (shown once measured). The hint is "Most at any moment, 60 frames a
    second. Budgets: the project's, a class's or its own." The table is the same, with 3 px above and under each number. The row names
    have 37 % of the table, 100 px at 1920, wide enough for "CPU ms a frame", so they show whole: before, a table that takes
    its column widths from its first row gave them a quarter of the table (about 68 px at 1920), and they ended in an
    ellipsis. In a narrower panel (the right panel dragged to its 260 px) a long name wraps, and "Medium" over its column
    ends in an ellipsis rather than running into "High". There the header's words also end in an ellipsis before its title
    does, so "Measured, no budgets" is cut and "Cost" stays whole; before, the title was cut to "C…" (found in the check
    after phase 6). An empty budget box's word ends in an ellipsis there too ("bud…"; it was cut to "budge", found in the
    second check). A budget of five digits there (six at 1920) does not fit its box either: it is cut, as numbers are in
    the panel's other number boxes.
  - **The Budgets toggle**: a checkbox row under the table, off at first and remembered in this browser (vfx-budgets). On,
    a budget box shows under each number, and the Budgets place under the toggle (Part B, below). While a budget is set
    for the effect at any of its three levels (the project's, its class's, its own), the boxes stay: the toggle shows on
    and cannot be switched off, and its tooltip says why. The line saying which budgets count shows with the boxes, or
    whenever a level of budgets counts; with none on and no boxes it would ask for a number where no box shows (it is then
    emptied, not hidden with words in it).
  - **A select or a text box too narrow for its value** (the browser draws no ellipsis in a closed select; a text box now
    ends in one while it does not have the focus, as a long effect name does at 1920): its tooltip gives the value whole,
    then the help text of its row's label, by the pointer and, at once, by the keyboard's focus. One whose value fits has no
    tooltip of its own; the keyboard's focus on it shows its label's, as before.
  - **A layer's view** (slice 4): the Look, then **Layer**, a section that folds like the others, with the layer's kind
    muted on the right of its title ("Sprite", "Shape"…): what draws the layer, its Name and Shows in. Folding Layer hides
    the line that says what draws the layer with the name and the tiers, as folding the Look hides the Look; Part B's "not
    drawn" warning sits under that line, in the same element. A projectile's Layer has its name only (it has no tiers).
  - **Shows in, as chips**: three chips, each its tier's icon (tier-low, tier-medium, tier-high) and word; on: the field
    colour with the icon in --accent-ink (a toggle that is on); off: only a 1 px edge. The chips with their words need about
    190 px and the control column has 161 at 1920, so this row lets them start left of the column, on the right of its
    label; in a panel too narrow even for that, they go under the label. The real checkbox of each chip lies over the whole
    chip, see-through, so a click and the keyboard work as on any checkbox, and its focus ring is the chip's. The last tier
    is on and cannot be switched off; its tooltip says why. The hint "Low drops extras but must stay readable." is a line
    under the row now (it sat beside the label).
  - **The focus after the panel is built again**: switching a tier on or off (or adding a part) changes the layer's
    structure, and the panel is built again. The control that had the focus gets it back, found by its name for screen
    readers, so the keyboard goes on from the same chip or box; before, the focus was lost, and Space then played the effect.
  - **Image**: the picture is as wide as the panel allows and at most 160 px tall, smaller images grown to fit too, on the
    checkerboard, in a well of the field colour as wide as the panel (a square image is 160 × 160 in its middle). It is
    hidden while the layer's image is missing or does not load (the problems banner says so). A click on the picture puts
    the pivot there, in its frame of a flipbook, as before; the order is the brief's: the image, the picture, Pivot,
    Flipbook, Grid, Loop the frames, Add PNG images… (a ghost button with the import icon).
  - **Readouts** end their sections, 11 px and muted: a projectile's "Now: … in the air over … m." moved from under the
    flight's choice to the end of Motion; "Shows from … ms" already ended Time.
  - **A glow's gradient** has an edit button (the pencil) after its select: it opens the picker on the glow's colour at its
    Gradients tab, with the keyboard focus on the tab, and the gradient chosen open in the gradient editor (none chosen:
    the editor as it was). Its hint says so. (Until UI phase 7 it scrolled the picker to its Gradients section.)
  - **Part B on screen** (slices 5 and 6: the plan Mustafa approved on 2026-11-15 says what each part does; these details
    are ours):
  - **Budgets are undone like any edit.** Before, a budget typed in Cost was not an undo step (game events and a scene
    still are not: they live in project.json too). This round's brief asks for one undo step per budget change, so every
    budget change is now one at every level, the project's boxes too, which had none: the budgets are part of the editor's
    document. A save writes
    project.json whenever they differ from the ones it last read or wrote; undoing past a save marks the project unsaved
    again, as for any edit. A duplicate's own budgets, and a new effect forgetting the budgets of a deleted effect with its
    id, are in the same undo step as the effect.
  - **A word's chance**: the words are rows, one per word: the word (Plex Mono, typed into the file, in capitals as you
    type), its chance in a % box, and Remove (the bin). They keep the label "Words (one picked per play)", so the settings
    inventory lists them as before. A row keeps its chance when its word is typed again or spelled another way (the words
    box kept a chance only when the text stayed the same). Add word adds BOOM (a new word layer's word) with no chance under
    the last one; its box takes the focus with its text chosen, to type over. An empty word puts the old one back; a comma
    stays in a word (the checker warns that it is not drawn). The file's limits hold in the rows: 1 to 16 words, 24
    characters each, a chance from 0 to 100 % with up to three decimals; the last word has no Remove and the 16th no Add
    word, their tooltips say why. A % box and a bin are named after the word shown ("Chance of BOOM"), so the panel built
    again (a first chance, a word added) gives the focus back to the same box; after Remove the focus goes to the bin of
    the row that takes its place (Add word when one word is left). ↑ and ↓ step a chance by 1 (an empty box starts from
    the share it shows). The faint number in an empty box is the share it gets now (one decimal). "No word: 40 %", the red note over 100 % and the 1,000-shot line
    carry a state: Show hints off keeps them. The note's total has two decimals at most, more only when it takes them to
    show it passes 100, as the checker's warning. The line counts seeds 1 to 1,000 with the runtime's own pick
    (src/doc/odds.ts), "no word" last; with Changes every play off every shot shows the same word, and its tooltip says so.
  - **Gradients on smoke, the fire's bed and bursts**: each next to the colour it takes the place of: smoke's after its
    Colour, the bed's before its Tones, a burst's after its pieces' Look (a glow's stays at the end of its section, where it
    was). Smoke and a burst say "Gradient over life", a bed "Gradient, middle to rim", as a glow; no gradient is "None: its
    Colour", "None: the tones" or "None: its Look" (a glow's said "None: one colour (the Colour above)", which its narrow
    select cut short: it says "None: its Colour" now, as smoke's). The pencil opens the colour picker at its gradients, on
    smoke's Colour, the bed's middle tone (its last) or the pieces' colour (the effect's main colour for image pieces), with
    the gradient chosen open in the editor. Since UI phase 7 the gradient editor's "Use on the selected …" puts a gradient
    on these layers too (see "The colour picker").
  - **The Budgets place**, under Cost's Budgets toggle: Boxes show (Project, Class, Own; the full words in their tooltips),
    Project budgets, Class budgets (class budgets for the whole project), Class (No class, the classes in their order, New
    class…), and Its own budgets. The boxes show the numbers of the level that counts at first (the project's when none
    does); a choice made in Boxes show is kept for that effect while the editor runs, not after a reload. Class is off in
    Boxes show while the effect has no class. The pencil after Class renames the effect's class and the bin deletes it
    (after asking; undo brings it back); New class… asks for a name in the question dialog, as New folder… does (OK, or
    Enter in its box: see "The question dialog" under "The colour picker"), and puts the effect in the new class. A class name is 1
    to 64 characters, unique whatever its capitals; the dialog takes 60. With no level on, the line under the place says how
    to switch on the level the boxes show ("Type a number to switch on class budgets.") or that its numbers are kept but
    off.
  - **"Not drawn"**: over the preview, in its lower left corner above the drag hint, on the labels' background with the
    warning icon in --bad; a state, so Show hints off keeps it. It names every layer of the effect shown whose image is not
    there and that the tier shown draws; the selected layer, for any reason (a layer the tier leaves out is named only when
    it is selected: the Layers list fades those already); and the effect once, while its errors stop the preview. At most
    three lines ("And 2 more layers are not drawn."). In a layer's panel, a red line under what draws it, one per reason.
    The words are the runtime's notes' ("the image muzzle_flash.png did not load", "… is not in the project"), "the Low
    tier leaves it out: it shows in Medium and High" and "its effect has errors that stop the preview". Known from the
    atlas, it shows at any moment (and before the images have loaded, never); a projectile, which draws nothing, gets none.
  - **New shot each loop** (slice 6), in the timeline's header right after Loop: a toggle as Loop is, with a die icon and
    the plan's words; on at first and not remembered (Loop is not either). Each loop takes the next seed at its start, by
    the same step Fire takes. It has no key. In a header narrower than 760 px (the sidebars dragged wide in a small window)
    it says "New shot", its full name staying its name for screen readers and in its tooltip, and below 700 px Speed's
    label steps aside, so the header keeps one row down to the narrowest centre (640 px). The Look takes the preview's
    seed at the start of each of its own plays (a picture at once), so a new shot never changes a play half-way; before, a
    Fire changed the Look's play at once.
- **The colour picker** (UI phase 7 of [docs/ui-redesign.md](docs/ui-redesign.md): the 272 px width, the place, the
  header, the three tabs as a segmented control and what each holds are the brief's; the palette profiles' actions are
  the plan Mustafa approved on 2026-11-15; these choices are ours, not Mustafa's or the brief's). Phase 7 came in three
  slices: the frame and the tabs; the Palette tab with the profiles; the Gradients tab and "Use on the selected …"; then
  a fix (Esc in a name box):
  - **Tabs**: the chosen tab is the raised pill of every segmented control (4.6), not yellow: the brief calls the tabs a
    segmented control. ← and → (Home, End) move between them and show each at once, as in any group of tabs. Each tab's
    tooltip says what it holds; the Gradients tab's has the long words the Gradients title had.
  - **The tab used last** is kept while the page is open (not in the browser's storage: a reload starts at Colour). Each
    of the four ways in names its tab, so it only shows for an opening that names none (the picture tool's).
  - **Ways in**: a colour in the colour list stays one (Mustafa's request of 2026-11-16), to the Colour tab, though the
    brief said the swatch way in goes. A chip clicked on the Palette tab shows that colour on the Colour tab, the
    keyboard focus on the wheel (its name says "Change …"). On the Colour tab the focus starts on the wheel, as before;
    on the other two, on the tab.
  - **The place**: its top is level with the top of the row that opened it (the Main colour row, a gradient choice's
    row), or of the colour clicked in the list, or of Edit palette…. Where it would pass the window's bottom, it moves
    up as far as it must: inside the window comes first. It is 8 px from the right panel and from the window's edges,
    and placed again when it grows or shrinks (another tab, the exact values). A tab taller than the window scrolls
    under the header and the tabs, which stay.
  - **The header**: the colour (28 px), the role in Plex Mono 13 px, the scope in 11 px muted ("Changes with the
    faction: Soviets", the brief's words; it said "Changes with the faction: this is the Soviets colour"), and Close.
  - **The Colour tab**: the role's note from palette.json (what the colour is for) stays at its top, 11 px and muted.
    The faction switch shows each faction's marking and colour dot (the brief's "markings and colour dots"), its name in
    the tooltip and for screen readers: the names did not fit in 272 px. Darker, Lighter and Goes with it are 16 px
    strips, their labels in a 48 px column; Goes with it's scheme select sits on its label's row, its five colours under
    the strips. "Use as this effect's main colour" and Revert share a row (both fit with either of the first one's
    words, with 6 px inside the buttons, so the row keeps its height). The parts are 8 px apart. The tallest Colour tab
    is a colour worked out from another, with the faction switch and a note of two lines: glow.hot, 629 px (the brief's
    limit: 640), also once set by hand: its box then says "Set by hand. Usually glow mixed with 25 % white." in as
    many lines as "Worked out from glow: …" (it said "Usually worked out from glow (glow mixed with 25 % white); now set by
    hand.", five lines beside Work it out again, and the tab was 661 px). A message ("Copied #FF2E63.", or "Not a colour:
    type #RRGGBB, such as #F47A1C." in red) takes the source line's place while it shows, in its 11 px and on one line,
    so the tab keeps its height (it added a line under the source line, and glow.hot was then 653 or 669 px; the
    message for a value that is not a colour said "That is not a colour: use #RRGGBB, such as #F47A1C.", two lines, and
    was green). Its words are about the colour they were said for: another colour, another faction's colour or
    a new value takes them away, and so does closing the picker (they used to stay for good, under every colour shown
    after).
  - **The Palette tab**: the chips are 22 px, ten a row. The palette profiles sit between the colours and New colour, so
    New colour stays at the bottom, folded. Both are sections that fold, as the right panel's do, but not remembered:
    each time the page opens, the profiles start open and New colour closed. Add colour says what it did under itself
    ("Added fire.blue. …"), in green; the next name typed, or closing the picker, takes the words away (they went to
    the Colour tab's status line, which does not show on the Palette tab).
  - **The Gradients tab**: the gradient editor and its ramp fold as the right panel's sections do (the editor lost its
    striped-square icon: a fold's title has none), the editor closed when the page opens. The ready-made gradients are
    four a row.
  - **"Use on the selected …"** (the brief: "use on the selected glow"): phase 6 gave smoke, a fire's bed and bursts
    their own gradient choice, and the button puts the gradient into that same choice, in one undo step, so it works on
    a glow, on smoke, on a fire bed or on a burst, its words naming the kind ("Use on the selected fire bed", the add
    menu's names). With none of those selected it says "Use on the selected layer" and is off; its tooltip says what to
    select. It follows the selection while the picker is open.
  - **The palette profiles' list**: A to Z, as the store sorts them. A row: the name (a lock on a default), eight of its
    colours as dots (each faction's team colour, then the first shared ones), how many gradients, **Load**, and
    **More**. The profile this project's colours came from is marked as a stored choice (the field colour and a 1 px
    edge, as the main colour in the colour list), not yellow; the line over the list says it in words, or that none is
    named.
  - **Where each action sits**: Load on every row; Save as profile… and Import profile… under the list; a row's More:
    Load into this project, Save over…, Rename…, Duplicate, Save as file…, Delete…. Restore the default profiles shows
    under the list only while a default is missing, with which one. A file in the folder that cannot be used is listed
    under them, its name in Plex Mono, with why, and Delete when the editor named it.
  - **The defaults** ("Built-in", "Built-in with gradients", known by name, whatever the capitals): Save over, Rename
    and Delete are off in their menu, and a lock with a tooltip says why. This is the editor only: the local server,
    which this phase does not change, still lets them change (docs/colours.md said they were ordinary profiles: it says
    this now).
  - **Load**: when the profile lacks colours or gradients the project's effects use, a question lists them first: each
    one (Plex Mono), "kept" or "missing here too: it stays missing" (the project lacks it as well), and up to three
    places it is used ("and 2 more"); Load or Cancel. A colour or gradient the project has that no effect uses and the
    profile lacks goes with the load (undo brings it back, until the project is saved and opened again): the
    same question lists those too, under their own words, each "taken out", and asks even when the profile lacks
    nothing the effects use. Saying so first is our choice; whether a load should keep them instead is Mustafa's. A
    profile that lacks nothing and takes nothing out loads at once. When the colour the picker shows is not in the new
    colours, it shows the effect's main colour.
  - **Save over** asks first, since a profile's old colours cannot come back (the plan asks it only for Delete).
  - **Names**: Save as profile… and Rename… ask in the question dialog. Save as profile… starts from a free name: the
    project's profile name, else the project's name, numbered when taken ("Built-in with gradients (1)" right after that
    profile was loaded). A name the store's rule refuses, or one taken, asks again with the store's words. The dialog
    takes 60 characters (the store, 64), as for classes.
  - **Duplicate** makes "<name> copy" ("Built-in copy (1)" when taken) without asking. **Import profile…** keeps the
    file's own name and adds a profile even when one with the very same colours is there (open question for Mustafa:
    importing an export uses that profile instead; should a profile file do the same?). **Save as file** names the file
    after the profile (`soviets-dark.json`); the browser puts it in its downloads.
  - **The project's profile name** is part of the editor's document, as the budgets are: a load names it in the same
    undo step as its colours; Save as profile… and Save over name it in an undo step of their own ("Palette profile");
    Save writes `project.json` when it changed. Rename and Delete change no project: its line keeps the name it had.
  - **One action at a time**: while one runs (a question open, the store answering), a click on Load, on a row's More or
    on a button under the list does nothing, so a double click on Load is one load.
  - **The line under the list** says what the last action did ("Saved this project's colours as …", in red what went
    wrong). It starts empty each time the Palette tab shows: its words were about an action of before, perhaps in another
    project (a "Ctrl+Z puts the old colours back" stayed after another project opened, and a red "could not be listed"
    under a list that was there again).
  - **The question dialog** (`ask`) has two more ways in, Save as profile… and Rename…. Its Enter is Mustafa's decision
    of 2026-11-25: in a name box Enter gives the name once, and anywhere else in the dialog it presses the button that has
    the focus. So after a name dialog, Enter on the main button of a later question (Save over…, Delete…, the Load
    question) confirms it, and Enter on Cancel cancels. Before, the name dialog's Enter handler stayed on the shared dialog:
    it closed such a question as Cancel, and the same Enter in a name box also reached the button the focus went back to
    (Save as profile…, a row's More, the main menu). Every name box works so: New project…, Save as…, the name for an
    import, New folder…, New class…, Rename class, Save as profile… and Rename…. Esc closes the dialog with no answer of its
    own (for New project… and the others too): here the closed dialog counts as Cancel, so nothing is made and the panel
    goes on working. The browser check presses Enter in the box, on a later question's main button and on its Cancel,
    clicks OK and Cancel, and tries Esc.
  - **The question before a load** is the shared question dialog with the list under its words; its main button is Load.
    Every question opens with the focus on its main button (ours), so here Enter loads at once. By the browser's own rule a
    list long enough to scroll (often the one of what a load takes out) took the focus first, and Enter did nothing until
    Tab.

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
