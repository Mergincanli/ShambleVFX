# Editor UI redesign

A brief for Claude Code, written with Mustafa on 2026-11-15. It covers `packages/vfx-editor` only.

## 0. How to work with this brief

- Read the whole brief before you change anything. Then do the phases in section 8, one at a time, in order.
- After every phase, follow 8.0: run the checks, take the UI screenshots and compare them with this brief, commit, report. Start the next phase only when Mustafa says so, unless he asked for several in one go.
- The app must work after every phase. Nothing half-moved.
- If this brief and the code disagree about what something does, the code is right: keep the behaviour, change the look and the place. If a choice isn't covered here, pick the option that keeps every feature within one click, and add it to README → Assumptions.
- Section 7 (guardrails) is not optional.

## 1. What Mustafa wants

In his words: improve readability, create distinct parts that look distinct, make use of icons, make good use of space. Compact and minimal like Figma, but not hidden: options are easy to reach and don't clutter the screen. The timeline stays at the bottom. Whatever is selected, an effect or a layer, shows its settings on the right.

He likes the number of options, that every part can have its own image, and the live preview with the stand-in. Keep all of it.

Decisions already made:

| Topic | Decision |
|---|---|
| Themes | Two. **Night**: neutral dark grey, like Figma. **Day**: light and warm (today's paper look, refined). |
| Layers | A Figma-style layers panel stays on the left, in sync with the timeline (selection, hover, order). |
| Fire and Play | The same playback. Fire plays the effect as the game does (no pause); Play is the editor's transport (pause, step, loop). Both stay: Fire belongs to the viewport, Play to the timeline. |
| Help text | Teammates use the editor too, so there's a **Show hints** switch. Full explanations are always in tooltips. |
| Screen sizes | Designed for 2560 × 1440. Must work well at 1920 × 1080 (the browser check runs at that size). |
| Effects | There will be many (weapons, vehicles, movement…), so the effects list needs search and folders. |

## 2. What's wrong now

| Now | Instead |
|---|---|
| Panels, cards, buttons, inputs and selected rows all have the same 2–3 px black outline, so nothing stands out. | Zones are told apart by background and one 1 px line. Inputs have no border at rest. |
| All-caps condensed headings (EFFECTS, SIZE, DURATION…), the display face on headings, folds and table heads. | Sentence case, one UI typeface. |
| The right panel stacks the effect's settings, the whole palette as a grid, the layer's settings, Cost and Checks in one scroll. A sprite's settings start about 1200 px down. | The panel shows only what's selected. |
| A help paragraph under most controls. | One-line hints when Show hints is on; full text in tooltips. |
| Segmented buttons for everything, so the viewport bar needs two rows. | Chips that show the current value and open a small menu. |
| Yellow on Fire, Play and every timeline bar, so it means nothing. | Yellow means "the action, or the active thing" (4.1). |
| Stats truncated in a corner, a scale label and a drag hint over the scene, the renderer badge in the top bar. Labels clipped inside narrow bars: the Bullet's "9 ms in the air" reads "9 m". | A status bar. Labels are never clipped. |
| A large empty block in the left sidebar above the move, duplicate and delete buttons, plus a trash button on every effect. | Actions sit on the rows themselves. |

## 3. Principles

1. The viewport and the timeline are the work. Everything around them is quieter: lower contrast, smaller type, no decoration.
2. One look per kind of thing. A section looks like a section everywhere, a field like a field.
3. Show the value, not the label. Chips and rows show the current value. The label and its explanation go into the tooltip, the menu header or the hint.
4. Everything is one click or one hover away. Settings fold or move into menus. Nothing is removed.
5. Yellow is reserved (4.1).
6. Plain words, as in the rest of the repo: sentence case, plain verbs, the same name for a thing everywhere.
7. Numbers line up: tabular figures, units inside the field.

## 4. Visual system

All values live in `src/style.css` as custom properties under `:root[data-theme="light"]` (Day) and `:root[data-theme="dark"]` (Night). Components use tokens only: no hex values in component rules. The exceptions are the faction colours and anything the preview draws.

### 4.1 Colour tokens

| Token | Night | Day | Used for |
|---|---|---|---|
| `--bg-app` | `#1E1E1E` | `#E2DED6` | Behind the viewport, between zones |
| `--bg-panel` | `#2C2C2C` | `#F5F3EE` | Top bar, sidebars, toolbar, timeline header and names, status bar |
| `--bg-field` | `#383838` | `#EAE6DE` | Inputs, selects, chips, segmented tracks |
| `--bg-hover` | `rgba(255,255,255,.06)` | `rgba(70,52,26,.06)` | Row and ghost-button hover |
| `--bg-selected` | `rgba(255,176,46,.16)` | `rgba(255,176,46,.30)` | Selected rows (always with the bar from 4.6) |
| `--bg-menu` | `#1E1E1E` | `#FFFEFB` | Menus and context menus |
| `--bg-popover` | `#2C2C2C` | `#FBFAF7` | Colour picker, dialogs |
| `--bg-tooltip` | `#1E1E1E` | `#2A2A2A` | Tooltips (dark in both themes) |
| `--line` | `#3D3D3D` | `#DFD9CE` | 1 px lines between zones and sections |
| `--line-strong` | `#5C5C5C` | `#9E9686` | Field edge on hover, menu and popover edge |
| `--text` | `#EDEDED` | `#23201B` | Main text |
| `--text-muted` | `#A6A6A6` | `#665F54` | Labels, secondary text |
| `--text-faint` | `#8C8C8C` | `#8A8273` | Placeholders, disabled, ruler labels. Never body text |
| `--text-tooltip` | `#F2F2F2` | `#F2F2F2` | Tooltip text |
| `--accent` | `#FFB02E` | `#FFB02E` | Accent fills |
| `--accent-hover` | `#FFC45C` | `#FFC45C` | Accent fill on hover |
| `--on-accent` | `#1E1E1E` | `#23201B` | Text and icons on an accent fill |
| `--accent-ink` | `#FFB02E` | `#9A5800` | Accent as a line or text: selection bar, playhead, checked boxes, active toggles |
| `--focus` | `#FFB02E` | `#9A5800` | Focus ring |
| `--good`, `--good-bg` | `#7BCB86`, `#1F3A26` | `#2F6B33`, `#DDEBD9` | Checks all good, within budget |
| `--bad`, `--bad-bg` | `#FF8C7C`, `#4A2420` | `#A3281C`, `#F6DAD5` | Problems, over budget, errors |
| `--warn` | `#F2C14E` | `#8A6100` | Out-of-date cost numbers |
| `--frame-dim` | `rgba(0,0,0,.55)` | `rgba(40,32,20,.32)` | The scene outside the 1920 × 1080 frame |
| `--frame-edge` | `rgba(0,0,0,.5)` | `rgba(0,0,0,.5)` | The frame's 1 px outline |
| `--shadow-raised` | `0 8px 24px rgba(0,0,0,.45)` | `0 8px 24px rgba(60,45,20,.18)` | Menus, popovers, tooltips, dialogs |

Timeline tokens:

| Token | Night | Day |
|---|---|---|
| `--tl-lane` | `#1E1E1E` | `#ECE9E3` |
| `--tl-sprite` | `#D4B37A` | `#D9AE63` |
| `--tl-projectile` | `#8EB4D6` | `#7FA8CC` |
| `--tl-shape` | `#9FC98F` | `#8DBB7E` |
| `--tl-burst` | `#E6A0A0` | `#E39191` |
| `--tl-word` | `#E8E2D4` | `#FFFFFF` |
| `--tl-bar-text` | `#1E1E1E` | `#23201B` |
| `--tl-bar-edge` | `transparent` | `rgba(35,32,27,.5)` |
| `--tl-windup`, `--tl-peak`, `--tl-fade` | `#3A3F47`, `#5A4721`, `#3E3A35` | `#D9E0E7`, `#FFD98A`, `#E1D9CA` |
| `--tl-phase-text` | `#D6D6D6` | `#3F3A32` |

These were checked: text on panel, field and selected rows is 4.5:1 or more; `--accent-ink` and `--focus` are 3:1 or more on panel, field and lane, in both themes; bar labels are 6:1 or more. Day bars need their 1 px edge to stand out from the lane (3:1). If you change a value, check it again.

**The yellow rule.** `--accent` and `--accent-ink` appear only on: the Fire button, the main button of an open dialog, the logo's VFX tag, selection (bar and tint), the playhead, focus rings, checked boxes, and active toggles. Timeline bars, headings, Play and everything else are never yellow.

The preview's ground (`#B8A683`) and everything the runtime draws are game colours. They are never themed.

### 4.2 Type

- UI typeface: IBM Plex Sans (already loaded in 400, 500 and 600).
- Sizes: 11 px for hints, tags, the ruler and the status bar. 12 px for labels, inputs, rows, menus and buttons. 13 px semibold for section and panel titles. 14 px medium for the project name. 15 px semibold for dialog titles. Line height 16 px for 11–12 px text, 18 px for 13–15 px.
- Sentence case everywhere. No `text-transform: uppercase` and no letter-spacing on UI text.
- Big Shoulders Display appears in exactly two places: the logo and the Fire button.
- IBM Plex Mono only for what gets typed into files: event names, image and file names, colour role names, hex values. Everything else, numbers included, is Plex Sans with `font-variant-numeric: tabular-nums`.
- Text that doesn't fit ends in an ellipsis and shows in full in its tooltip.

### 4.3 Sizes and spacing

4 px grid. Panels have 12 px padding left and right.

| Thing | Size |
|---|---|
| Top bar | 40 px |
| Viewport toolbar | 36 px |
| Inspector header | 40 px |
| Section header | 32 px |
| List row, property row | 28 px |
| Controls (input, select, chip, icon button) | 24 px tall. Icon buttons are 24 × 24 with a 16 px icon |
| Timeline header | 32 px |
| Ruler, phase strip, track row | 24 px, 16 px, 24 px |
| Status bar | 24 px |
| Splitter | 1 px line, 6 px grab area |

Corner radius: 4 px on controls, chips and swatches; 3 px on timeline bars; 8 px on menus, popovers and dialogs; none on panels.

### 4.4 Lines and surfaces

- Zones (top bar, sidebars, toolbar, viewport, timeline, inspector, status bar) differ by background and are separated by one 1 px `--line`. No outer borders, no shadows on panels.
- Inside a panel, each section has a 1 px `--line` above its header. No cards, no boxes inside boxes.
- Inputs, selects and chips: `--bg-field` with no border at rest; a 1 px `--line-strong` edge on hover. Focus: a 1 px `--focus` edge plus a 2 px outer ring of `--focus` at 35 %.
- Menus, popovers, tooltips and dialogs: their own background, a 1 px `--line` edge, `--shadow-raised`, 8 px radius.

### 4.5 Icons

- Use and extend `src/app/icons.ts` (24 px grid, 1.75 px stroke, round ends), shown at 16 px. Don't add an icon library. Keep the three faction markings exactly as they are.
- New icons needed: `chevron-right`, `folder`, `search`, `more` (three dots), `grip` (drag handle), `lock`, `hint` (light bulb), `warning` (triangle), `edit` (pencil), `size` (two diagonal arrows), `intensity` (lightning), `duration` (clock).
- Every icon-only button has an `aria-label` and a tooltip with its name and shortcut.
- Where the word is the value, the icon goes next to it, never instead of it (chips show icon and value).

### 4.6 States

| State | Look |
|---|---|
| Hover (rows, ghost buttons) | `--bg-hover` |
| Selected (list rows, timeline rows) | `--bg-selected`, a 2 px `--accent-ink` bar on the left edge, text weight 500 |
| A toggle that is on (Loop, Show hints, Night mode), a chip with its menu open | `--bg-field`, icon in `--accent-ink` |
| Segmented control | `--bg-field` track. The chosen segment is a raised pill (`--bg-panel` with a 1 px `--line` edge) in `--text`; the others are `--text-muted` |
| Keyboard focus | As in 4.4. Always visible |
| Disabled | 40 % opacity, no hover |
| Left out of the current tier | 40 % opacity and a tag "not in Low" (as now) |

Motion: colour changes take 120 ms ease-out. Menus and popovers fade in over 100 ms with a 2 px move. Nothing else animates. Respect `prefers-reduced-motion`.

## 5. Layout

### 5.1 The window

Schematic, not to scale. `====` is a splitter you can drag; `o` is an effect's main-colour dot; `|` before a name marks the selected row; `^v.` are a row's Move up, Move down and More buttons; a lone `.` is a More button.

```
+------------------------------------------------------------------------------------------------------------+
| SHAMBLE VFX v | Demo project (lock) *                          undo redo | hints night |  Saved  Export... |
+--------------------+-----------------------------------------------------------------+---------------------+
| Effects 16       + | FIRE  Street v  Soviets v  Enemy v  4.0 m  High v  Whole 61% v  | Rifle shot (demo) > |
| [ Search effects ] +-----------------------------------------------------------------+ [img] Muzzle flash .|
| v Weapons        4 |                                                                 +---------------------+
|     o Rifle shot   |                                                                 | v Layer             |
|     o Tank shell   |                                                                 |   Name    [......]  |
| > Vehicles       9 |                                                                 |   Shows in  L M H   |
|   o Rifle (demo)   |                             VIEWPORT                            | v Image             |
|====================|                    game frame, dimmed outside                   |   Image  [......v]  |
| Layers 6         + |                                                                 |   [  thumbnail  ]   |
|   Dust at the hit  |                                                                 |   Pivot  [X] [Y]    |
|   Hit spark        |                                                                 | v Size and place    |
| | Muzzle flash ^v. |                                                                 |   ...               |
|   Tracer core      +=================================================================+ v Colour            |
|   Tracer           | |< > >|  loop  [1x|1/2|1/4|1/10]   89 / 299 ms  step 1          |   ...               |
|   Bullet           +-----------------+-----------------------------------------------+ v Time              |
|                    |                 | 0        100       200       300    ms        |   ...               |
|                    |                 | wind-up |       peak        |   fade          |                     |
|                    | Dust at the hit |        [####### 250 ms ##########]            |                     |
|                    | Hit spark       |  [## 120 ms ##]                               |                     |
|                    | | Muzzle flash  | [##### 167 ms #####]                          |                     |
|                    | Bullet          | [] 9 ms in the air                            |                     |
+--------------------+-----------------+-----------------------------------------------+---------------------+
| ok All good   8 triangles  1 draw call   Cost: not measured   Drag the ground: move the target   WebGPU  ? |
+------------------------------------------------------------------------------------------------------------+
```

The inspector, with the effect selected and with a sprite layer selected:

```
+----------------------------------------+   +----------------------------------------+
| o Rifle shot (demo)         Effect ... |   | Rifle shot (demo) >                    |
+----------------------------------------+   | [img] Muzzle flash                 ... |
| v Effect                               |   +----------------------------------------+
|   Name         [Rifle shot (demo)    ] |   | v Layer                                |
|   Folder       [No folder          v ] |   |   Name         [Muzzle flash         ] |
|   Game events  [demo.rifle.shot      ] |   |   Shows in     [Low] [Medium] [High]   |
+----------------------------------------+   +----------------------------------------+
| v Scale                                |   | v Image                                |
|   Size        ---o------   [ 1.00 x ]  |   |   Image        [muzzle_flash.png   v ] |
|   Intensity   ---o------   [ 1.00 x ]  |   |   +----------------------------------+ |
|   Duration    --o-------   [ 1.00 x ]  |   |   | thumbnail, pivot dot, frame grid | |
+----------------------------------------+   |   +----------------------------------+ |
| v Phases                               |   |   Pivot        [X 0.16]  [Y 0.50]      |
|   [==|===============|====]            |   |   Flipbook     [on]                    |
|   [ 350 ms ]  [ 2500 ms ]  [ 300 ms ]  |   |   Grid    [Cols 2] [Rows 2] [Frames 4] |
+----------------------------------------+   |   Loop the frames  [ ]                 |
| v Colour                               |   |   [import] Add PNG images...           |
|   Main colour  [# glow          v] [e] |   +----------------------------------------+
|   [palette] Edit palette...            |   | v Size and place                       |
+----------------------------------------+   |   Width       ---o------   [ 1.2 m  ]  |
| > Cost       Not measured  [Measure]   |   |   ...                                  |
+----------------------------------------+   +----------------------------------------+
```

The colour picker:

```
+------------------------------------+
| [#] glow                       [x] |
|     Changes with the faction:      |
|     Soviets                        |
| [ Colour  |  Palette  | Gradients ]|
+------------------------------------+
| [* Soviets o] [^ Allies o] [@ E. o]|
|            .---------.             |
|           (   wheel   )            |
|            '---------'             |
| [#FF2E63          ]  [copy] [=]    |
| Darker   [][][][][][][][]          |
| Lighter  [][][][][][][][]          |
| Goes with it        [Neighbours v] |
|          [][][][][]                |
| [This effect's main colour]        |
| [Revert]                           |
| The Art lead's working value.      |
+------------------------------------+
```

### 5.2 Grid and sizes

- `#app`: rows `40px minmax(0, 1fr) 24px` (top bar, workspace, status bar). Minimum width 1280 px.
- `.workspace`: columns `var(--left-w) minmax(640px, 1fr) var(--right-w)`.
- Left column: the Effects section (`--effects-h`), a splitter, the Layers section (the rest).
- Centre column: the viewport toolbar (36 px), the viewport (the rest), a splitter, the timeline (`--timeline-h`).
- Right column: the inspector (a 40 px header and a scrolling body).

| | Window 2200 px wide or more (2560 × 1440) | Narrower (1920 × 1080) |
|---|---|---|
| `--left-w` | 280 px | 248 px |
| `--right-w` | 320 px | 296 px |
| `--effects-h` | 40 % of the left column | 40 % |
| `--timeline-h` | 34 % of the centre column | 30 % |

- All four can be dragged. Limits: left 200–420 px, right 260–480 px, effects from 120 px to the column height minus 160 px, timeline from 140 px to 60 %. The centre is never narrower than 640 px.
- A dragged size is remembered (`localStorage`: `vfx-size:left`, `vfx-size:right`, `vfx-size:effects`, `vfx-size:timeline`). Double-clicking a splitter resets it.
- Splitters work from the keyboard: they take focus, and the arrow keys move them 16 px.
- At 1920 × 1080 with the default sizes, the timeline shows at least 8 track rows and the Layers section at least 14 rows without scrolling.

## 6. Zone by zone

### 6.1 Top bar

From left to right:

1. **Logo menu.** "SHAMBLE VFX" (Big Shoulders 800, 18 px, the VFX tag in `--accent`) and a chevron. It opens the main menu: Projects… · New project… · Save (Ctrl+S) · Save as… · Export… · Import an export… (opens the Projects dialog, where that list is) · divider · Show hints (check) · Night mode (check) · Keyboard shortcuts (?).
2. **Project.** The name (14 px medium) and the unsaved dot as now. Keep the text format of `.project-name`: the browser check reads it. On an example, a `lock` icon with the tooltip "An example: it can't change. Save as makes your own copy." Clicking the name opens the Projects dialog.
3. Space.
4. **Undo, Redo.** Icon buttons whose tooltips name the step, as now.
5. **Show hints** (icon toggle, `hint`) and **Night mode** (icon toggle, sun or moon). Keep `button.theme-toggle` with `aria-pressed`.
6. **Save**, showing the state: "Saved" (check icon, muted, disabled), "Save" (enabled), or "Save as…" on an example. Keep that last text: the browser check clicks "Save as…" in the top bar.
7. **Export…**: a secondary button with the `export` icon.

The separate Save as button, the WebGPU badge and Keys leave the top bar. They're in the main menu and the status bar.

Menus are appended to `document.body`, never inside the bar, so they aren't clipped and their items don't clash with the bar's own text.

### 6.2 Left sidebar

#### Effects (top section)

- **Header** (32 px): "Effects", the count in `--text-muted`, and a `+` icon button with a menu: New effect · From preset…
- **Search** (24 px, `search` icon inside, placeholder "Search effects"): filters by name, folder, file id and game event names. Matching effects keep their folders open. Esc clears it; `/` focuses it from anywhere.
- **Folders.** An effect's folder is the part of its name before " / ", Figma's convention: "Weapons / Rifle shot" sits in Weapons, and "Vehicles / Tank / Shell" nests. The file format doesn't change. A folder row has a chevron, the `folder` icon, the name and a count. Clicking it opens or closes it; that state is remembered per project in `localStorage`.
- **Order**: folders first, then effects, each A–Z (`localeCompare` with `numeric: true`).
- **Effect row** (28 px): a 10 px dot in the effect's main colour (for the faction shown), and the name without its folder. On hover, and on the selected row, a `more` button appears with a menu: Rename (F2) · Duplicate (Ctrl+D) · Move to folder… · Delete. Right-clicking opens the same menu. Double-clicking the name renames it in place (Enter keeps, Esc cancels).
- **Move to folder…** opens a menu of the existing folders, "No folder" and "New folder…" (which asks for a name with the existing `ask` dialog). It rewrites the name in one undo step (`setEffectValue` takes any effect's id, so the effect doesn't need to be selected).
- **Duplicate** is new: add `duplicateEffect` to `src/doc/edits.ts`. It copies the effect with `freeEffectId`, names it "<name> copy", keeps its scene and drops its game events (one event plays one effect). Add a unit test.
- Delete keeps its confirmation and its undo.
- Goes: the trash button on every row, and the New and From preset… buttons in the header.
- Keep `.effects-list` and `.item` on the rows (the browser check uses them).

#### Layers (bottom section)

- **Header**: "Layers", the count, and `+` with the add menu, which replaces the `<select>`. Grouped: Sprite (an image) · Projectile (a path in flight), then under "Shapes" the 14 kinds (shape icon and the plain name from `SHAPE_TEXT`), then Burst (pieces thrown out) · Word (a comic sound). It behaves as now: the new layer goes above the selected one and gets selected.
- The title's tooltip: "Top of the list draws on top." (the old hint).
- **Row** (28 px): type icon, name, and a muted tag on the right (from `layerTag()`, as now; Plex Mono only when it's an image name). Rows left out of the current tier fade, and their tag says "not in Low". Keep `.layer-item` and `.off`.
- On hover, and on the selected row, the tag gives way to three buttons: Move up (`up`), Move down (`down`), and `more`, with Rename (F2) · Duplicate (Ctrl+D) · Move up (Ctrl+]) · Move down (Ctrl+[) · Delete (Del). Right-clicking opens the same menu. Double-clicking renames in place.
- **Drag to reorder**: a 2 px `--accent-ink` line shows where the row will land. It's one `moveLayer` call (it takes any delta), so one undo step. The list shows the layers array reversed: +1 in `moveLayer` means up in the list, which draws over more.
- Goes: the button row at the bottom (up, down, duplicate, delete).
- **Empty**: "No layers yet." and an "Add a layer" button that opens the add menu.
- **Sync with the timeline**: hovering a row highlights the same timeline row and the other way round. Selection is shared already (`selectLayer`). When the selection changes, scroll it into view in both places (`block: 'nearest'`).
- Keep `.layers-list` on the list.

### 6.3 Viewport toolbar

One row, 36 px, on `--bg-panel` with a 1 px line under it:

`[FIRE]  [Scene v]  [Faction v]  [Made by v]  [Distance]  [Tier v]  ……  [View v]`

- **Fire** is the only accent-filled control in the main window, the logo's tag aside. 28 px tall: the starburst icon and "FIRE" in Big Shoulders 700 at 16 px, `--accent` fill, `--on-accent` text. Tooltip: "Fire from the stand-in to the target, as the game does (F)". Keep `.fire`.
- **Chips** are 24 px, `--bg-field`: icon, current value, chevron. Their tooltip is the old label and its explanation. Each opens a menu of choices with a header naming the setting:
  - **Scene** (`scene` icon): the scenes. The name truncates at 200 px. Menu footer: "Each effect remembers its scene."
  - **Faction that fired**: the faction's marking filled with its team colour, and its name. Items: marking, name, team-colour dot.
  - **Made by**: the `enemy`, `team` or `self` icon and Enemy, Your team or You. Each item says what it changes, in muted text: "solid ink edges", "thin broken edges", "your own words show".
  - **Distance from you** (`distance` icon): "4.0 m". Drag sideways on the chip to change it (0.1 m per 4 px, Shift for 10 times that), or click it for a small popover with the slider (0–14 m), a number field and the hint about word sizes.
  - **Tier** (the `tier-*` icon of the current tier): Low, Medium or High. Each item: "draws only the layers in this tier".
- **View**, on the right: the view's icon, "Whole screen", and the scale in muted text ("61 %", from the preview, see 6.4). Menu: Whole screen (1) · Game size (2) · Close-up (3), then under "Close-up on": Muzzle · Target. The 1, 2 and 3 keys stay.
- Goes: the stats text (it moves to the status bar) and the second row.

### 6.4 Viewport

- It fills its area edge to edge: remove the border and the margin of `.viewport-wrap`.
- The scene outside the 1920 × 1080 frame is dimmed with `--frame-dim` (the `.frame-guide` box-shadow), so the frame is the brightest thing on screen. The frame's outline is 1 px `--frame-edge`.
- The frame label reads "1920 × 1080": 11 px, on `--bg-panel` at 85 %, inside the frame's top-left corner, no border.
- The scale label at the top right goes; its text moves into the View chip. `Preview` already computes the scale: expose it with a small read-only getter or callback. Don't change how anything is drawn.
- The drag hint (`.vhint`) shows only when Show hints is on: 11 px, no border. The status bar shows the same hint while the pointer is over the viewport, whether hints are on or off.
- `?frame=1` still shows only the game screen: hide every new element there too.

### 6.5 Timeline

- **Header** (32 px, `--bg-panel`): the transport moves here from under the viewport. Step back · Play/Pause · Step forward (24 px icon buttons; Play/Pause has a `--bg-field` fill so it reads as the main one, and it's never yellow) · Loop (toggle) · Speed as a small segmented control (1×, ½×, ¼×, ⅒×) · the time readout. Keep the `.transport` and `.play` classes on these.
- **Time readout**: "89 / 299 ms" in tabular figures, then "step 1" in muted text with the tooltip "Steps of 1/12 s, the comic step rate". While firing: "Firing: 1 playing". Click the current time to type one; Enter jumps there, paused.
- **Names column** (`--tl-name`: 200 px at 2560, 176 px at 1920, on `--bg-panel`): type icon and name, 12 px. Same order, selection and hover as the Layers panel.
- **Ruler** (24 px): labels 11 px in `--text-faint`, major ticks as now, step ticks (1/12 s) shorter and fainter.
- **Phase strip** (16 px): it exists already; keep it. `--tl-windup`, `--tl-peak`, `--tl-fade`, labels 11 px inside when they fit, the times in the tooltip.
- **Lanes** on `--tl-lane`, rows 24 px, a 1 px `--line` at 50 % between rows.
- **Bars**: 16 px tall, 3 px radius, filled with their type's colour (`--tl-sprite`, `--tl-projectile`, `--tl-shape`, `--tl-burst`, `--tl-word`), a 1 px `--tl-bar-edge`, and the label ("250 ms") in 11 px `--tl-bar-text`. If the label doesn't fit, it goes just right of the bar in `--text-muted`. Never clip it. The step marks inside the bar stay, at 15 % ink.
- **Selected layer**: its row gets `--bg-selected` across names and lane, and its bar a 2 px `--accent-ink` outline.
- **Left out of this tier**: the bar at 35 % opacity, the name muted (as now).
- **Mouse**: pressing on the ruler, the phase strip or an empty part of a lane scrubs (as now). Clicking a bar or a name selects that layer. Hovering a row highlights it in the Layers panel too.
- **Playhead**: a 2 px `--accent-ink` line through the ruler and the lanes, with a 10 px head on the ruler that you can drag.
- The time span keeps fitting the effect automatically, as now.

### 6.6 Inspector (right panel)

The panel shows what's selected. Never everything at once.

- **Header** (40 px):
  - Effect selected, no layer: a dot in the main colour, the effect's name (13 px semibold; its folder, if any, as a muted prefix), "Effect" in muted text, and `more` (Duplicate effect, Move to folder…, Delete effect).
  - Layer selected: the effect's name as a muted link, "›", the type icon and the layer's name (13 px semibold), and `more` (Rename, Duplicate, Move up, Move down, Delete). Clicking the effect's name, or Esc (when no menu or picker is open and you're not typing), selects the effect and deselects the layer.
- **Problems banner**, only when `problems()` isn't empty: `--bad-bg`, the `warning` icon, "2 problems" and a chevron that opens the list. Each problem shows its path in Plex Mono and its message; if the path points at a layer, clicking it selects that layer. When the problems stop the preview from drawing (schema, format or version), the banner says "The preview waits until these are fixed."
- **Sections** fold: a chevron, the title (13 px semibold, sentence case), optional actions on the right. Open or closed is remembered per title, as `fold()` does now. Restyle `fold()` and keep `<details>`.
- **Property rows** use a CSS grid: the label column is `minmax(84px, 38%)`, the control takes the rest. Rows are 28 px with 4 px between them. Labels are 12 px `--text-muted`, sentence case, with an ellipsis and a tooltip when too long.
  - Number fields use `scrubNumber` from phase 3: drag the label or the prefix sideways to change the value, or type it. The value is right-aligned, the unit sits inside the field as a muted suffix ("1.2 m", "120 ms", "1.00 ×"), numbers show a decimal point and a typed comma works too. Keep the `num` class on the input.
  - Sliders: a 2 px track and a 12 px thumb, then the number field (56 px) on the same row.
  - Groups of two or three numbers (offset right/up/forward, pivot x/y, flipbook columns/rows/frames, nudge right/up, ranges) share one row. Each field has a short muted prefix inside ("R", "U", "F"; "X", "Y"; "Cols", "Rows", "Frames") and the full name in its tooltip.
  - Choices with two or three short options are segmented controls; longer ones are selects. If a segment's words don't fit on one line at 296 px, shorten them to one or two words and keep the full wording in the segment's tooltip: "Keep" and "Multiply", with the tooltips "Keep the image's colours" and "Multiply by a colour role".
  - Colour role fields (every `role` select that `specForm` builds, and the sprite's Role) keep their `<select>`, with a 14 px swatch of the role's colour (for the faction shown) at the left edge.
  - Checkboxes are 14 px; checked uses `--accent-ink`.
- **Effect view** (no layer selected). Sections, in this order:
  1. **Effect**: Name (shown without its folder; editing it keeps the folder) · Folder (a select: No folder, the existing folders, New folder…; it rewrites the name as in 6.2; name and folder together stay within 80 characters) · Game events (a Plex Mono input; problems under it in `--bad` as now; keep `.events` and `.event-problems`).
  2. **Scale**: Size · Intensity · Duration as slider rows, with the `size`, `intensity` and `duration` icons before the labels. Keep the `bigcontrols`, `row big` and `input.num` classes, or update the browser check.
  3. **Phases**: a 6 px bar showing the three lengths in proportion, in the timeline's phase colours, then Wind-up · Peak · Fade as one row of three ms fields.
  4. **Colour**: Main colour is the role's swatch, the role `<select>` and an `edit` icon button that opens the colour picker on that role. Under it, a ghost button "Edit palette…" with the `palette` icon opens the picker on its Palette tab. The two-column grid of every swatch goes; the picker holds the whole palette.
  5. **Cost**, closed by default. Its header shows a summary: "Not measured" (muted), "Within budget" (`--good`), "2 over budget" (`--bad`) or "Out of date" (`--warn`), and the Measure button (`gauge` icon). The body is the table as now (Draws, Sprites alive, Triangles, Screen area, CPU ms; Low, Medium, High), compact. The budget inputs show when the section's small "Budgets" toggle is on, or when any budget is set. The "most triangles" line stays, muted. The long explanation and the measuring conditions move into tooltips (on the title and on an `info` icon); the hint is a short version. Keep `.costcard`, `table.cost` and `input.budget`.
- **Layer view**:
  1. **Layer**: Name · Shows in, as three toggle chips with the tier icons (Low, Medium, High). Keep the real checkboxes in the DOM, transparent over each chip, so the keyboard and `.tier-boxes input` still work. The last tier still can't be switched off.
  2. The type's own sections, as now. Sprite: Image, Size and place, Colour. Projectile: Path, Motion. Shape, burst and word: Place, then Shape, Pieces or Word, then Animation (closed) and Seed (closed).
  3. **Time**.
  - The Image section: the image select; the thumbnail as wide as the panel allows and at most 160 px tall, on the checkerboard, with the pivot dot (clicking still moves the pivot); the pivot row; the Flipbook switch and its grid row; Loop the frames; "Add PNG images…" as a ghost button with the `import` icon.
  - Readouts ("Now: 9 ms in the air over 7.2 m.", "Shows from 0 to 167 ms…") are 11 px muted, at the end of their section.
  - The glow's "Gradient, middle to rim" select gets an `edit` button that opens the picker on its Gradients tab.
- Cost and Checks no longer sit under the layer.

### 6.7 Colour picker

Keep every feature. It stays a popover (`.cpick`) and keeps its keys: keys pressed inside stay inside, Esc closes it, it stays open while the effect plays.

- 272 px wide. It opens to the left of the inspector, its top level with the row that opened it, inside the window (`place()`).
- **Header**: the swatch, the role's name (Plex Mono 13 px), the scope ("Changes with the faction: Soviets" or "One colour for every faction"), the close button.
- **Three tabs** under the header, as a full-width segmented control: Colour · Palette · Gradients. The last tab used is remembered while the page is open.
  - **Colour**: the faction switch (only for per-faction roles: markings and colour dots), the wheel at 200 px, the hex row (hex, copy, exact values), the exact values (hidden until asked for), Darker and Lighter as two 16 px strips with a short label on the left, Goes with it (with its scheme select), the "worked out from" box, then [Use as this effect's main colour / This effect's main colour] and [Revert], then the source line (11 px, muted).
  - **Palette**: Team colours (for the faction) and Shared colours as 22 px chips. The main colour keeps its dot; names are in the tooltips. New colour sits at the bottom, folded.
  - **Gradients**: the `GradientPanel` as it is (ready-made, in this project, the editor), restyled.
- **Ways in**: the main colour's `edit` button (Colour tab), "Edit palette…" (Palette tab), a gradient field's `edit` button (Gradients tab, with that gradient open in the editor if one is set).
- The browser check opens the picker by clicking a `.swatch`, which goes. Update it to the new ways in. Keep the `.cp-*` and `.gr-*` classes it uses, or update those lines too.

### 6.8 Status bar

24 px, `--bg-panel`, a 1 px line above it, 11 px text. Items are separated by 16 px of space, not by dots.

- **Left**: Checks ("All good" with `check` in `--good`, or "2 problems" with `warning` in `--bad`; clicking opens the inspector's problems list) · this frame's triangles and draw calls (clicking selects the effect and opens Cost) · the Cost summary from 6.6.
- **Middle**: the hint for what's under the pointer. Over the viewport: "Drag the ground to move the target. Shift + drag moves the stand-in." Otherwise empty.
- **Right**: the renderer ("WebGPU" or "WebGL 2", with the tooltip it has now) · `?` (keyboard shortcuts).
- Messages stay as toasts (`.status`), raised above the status bar. Don't give the status bar the class `status`: the toast uses it and the browser check reads it.

### 6.9 Hints and tooltips

- **Tooltips**: one shared element. It shows after 500 ms of hover (150 ms if another tooltip was just open) and at once on keyboard focus; it hides on leave, scroll and Esc. Dark in both themes (`--bg-tooltip`), 12 px, at most 280 px wide, with an optional shortcut in a muted `kbd`. Every existing `title` becomes a tooltip. The simplest way: a delegated handler that moves `title` into `data-tip` on first hover, so no native tooltip shows as well.
- **Show hints** switch: in the top bar and the main menu, plus `?hints=on|off` for screenshots. Remembered as `vfx-hints`; on by default in a browser that never chose. When on, `.hint` lines show under their control; when off they're hidden (`:root[data-hints="off"] .hint { display: none }`). Either way the full text is in the tooltip.
- Rewrite each inline hint to one line, two at most at the default panel width (about 90 characters). The long versions go into tooltips. For example:
  - Game events. Inline: "Names the game plays this effect by, separated by commas." Tooltip: the full current text.
  - Size. Inline: "Sprites and offsets. Not the start, the target or speeds."
  - Cost. Inline: "Most at any moment, 60 frames a second. Budgets are shared by the project."
- The Layers header's "top draws on top" becomes the header's tooltip and a hint.

### 6.10 Menus, dialogs and empty states

- **Menus** (main, chips, `+`, `more`, right-click): `--bg-menu`, 8 px radius, 4 px padding. Rows are 28 px: a 16 px icon, the label in 12 px, and optionally a muted description or shortcut on the right. A check or a dot marks the chosen item; dividers are 1 px. Keyboard: arrows, Home and End, Enter and Space, Esc, type-ahead. Use the Popover API, append to `document.body`, open below the opener and flip to stay inside the window. Roles: `menu`, with `menuitem`, `menuitemradio` or `menuitemcheckbox`. Right-click opens a row's menu at the pointer.
- **Dialogs** (`.dlg`: projects, presets, export report, import, keys, ask, choose): `--bg-popover`, 8 px radius, 480 px wide, the title 15 px semibold in sentence case, rows instead of underlined links, one main button in `--accent` per dialog and the others secondary. The Keys dialog groups its keys (Playback, Editing, View, Panels), with each `kbd` on `--bg-field`.
- **Empty states** say what to do and offer the button: no project ("Open a project", "New project"), no effect ("Make an effect"), no layers ("Add a layer").

### 6.11 Keys

Every key stays as it is: Space, F, ← and →, L, 1 2 3, Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, Ctrl+S, Delete or Backspace. New:

| Key | Does |
|---|---|
| `?` | Keyboard shortcuts |
| `/` | Focus the effects search |
| `F2` | Rename the selected layer, or the effect if no layer is selected, in place |
| `Ctrl+D` | Duplicate the selected layer, or the effect if no layer is selected |
| `Ctrl+]`, `Ctrl+[` | Move the selected layer up, down |
| `Esc` | Close the open menu or the picker; otherwise leave the layer and go back to the effect |

Update the Keys dialog. As now, nothing fires while you type in a field.

## 7. Guardrails

**Don't change**

- `packages/vfx-runtime`, `packages/vfx-format` (types, schema, palette), `packages/vfx-testpage`, `packages/vfx-editor/server`, the export format, effect files, the examples.
- How the preview draws: rendering, camera, scenes and dragging in `src/preview/`. Its two DOM labels may be restyled or moved, and it may expose the scale it already computes.
- What any control does, its undo behaviour (one drag is one undo step), and which settings exist. Every field `specForm` builds stays.
- Existing keys.

**Don't add**

- npm dependencies, UI libraries included, even if a skill suggests installing one. Build what's needed in `src/app/dom.ts` with plain DOM, `<dialog>`, the Popover API and `<details>`.
- Hex colours in component CSS (tokens only), or inline styles for states (use classes, `aria-*` and `data-*`).

**Keep**

- `npm test`, `npm run typecheck` and `npm run check:browser` passing after every phase. When the UI changes, update `tools/browser-check.mjs` in the same commit so it checks the same behaviour in its new place. Never delete or weaken a check to make it pass.
- Class names on elements whose role doesn't change, so the browser check needs fewer edits: `.transport`, `.play`, `.fire`, `.timeline`, `.tl-ruler`, `.events`, `.event-problems`, `.tier-boxes`, `.costcard`, `.bigcontrols`, `.cpick`, `.cp-*`, `.gr-*`, `.theme-toggle`, `.effects-list`, `.layers-list`, `.layer-item`, `.project-name`, `.viewport`, `.status`.
- The repo's voice: plain words, sentence case. README's "What to click" and `docs/colours.md` must stay true.
- `?frame=1` (only the game screen) and `?backend=webgl`.

## 8. Phases

### 8.0 After every phase

1. Run `npm test`, `npm run typecheck` and `npm run check:browser` (it needs Playwright's Chromium: `npx playwright install chromium`). If the browser can't run where you are, say so and ask Mustafa to run it.
2. Run `node tools/ui-shots.mjs` (made in phase 0) and look at every picture against this brief: alignment, overflow, clipped text, contrast, both themes, both sizes. Fix what you see before you commit.
3. Commit: "UI phase N: <what changed>".
4. Report: what changed, the screenshot paths, what you weren't sure about, and anything you added to README → Assumptions.

### Phase 0: baseline

- Run the three checks and note their counts.
- Add `tools/ui-shots.mjs`. It starts the dev server the way the browser check does, opens the editor with `?backend=webgl` at 2560 × 1440 and 1920 × 1080, in Day and Night (`?theme=`), pauses with `app.showAt(…)` so the pictures are stable, and saves `out/ui/<state>-<theme>-<width>.png` for: (a) Rifle shot (demo) with no layer selected; (b) the same with its first sprite layer selected; (c) Hammer leech beam (board), many layers, with a layer selected; (d) the colour picker open; (e) a menu open, from phase 3 on. Use `window.__vfx.app` (`pickEffect`, `selectLayer`, `openColourPicker`, `setupForChecks`, `showAt`).
- Also write a settings inventory to `out/ui/fields-before.json`: for every layer of every effect in both example projects, select it and record its section titles and field labels. Phase 6 compares against it.
- Create `CLAUDE.md` at the repo root with the text in section 9.
- Done when: the checks pass as before, and the screenshots of today's UI are saved as `out/ui/before-*` for comparison.

### Phase 1: the visual system

- The tokens (4.1) for Day and Night, type (4.2), sizes and radii (4.3), lines and surfaces (4.4), states (4.6). Restyle every existing control with the DOM as it is: buttons (primary, secondary, ghost), inputs, selects, checkboxes, segmented controls, sliders, folds, lists, the timeline bars' colours, dialogs, toasts, the colour picker's colours.
- Remove all-caps and the display face everywhere except the logo and Fire. Flatten the `.card`s into sections. Replace the 2–3 px ink borders with the 1 px lines from 4.4.
- The Night mode button becomes an icon toggle (sun or moon) with a tooltip. Keep `.theme-toggle` and `aria-pressed`.
- Done when: both themes match section 4 in the screenshots; no `text-transform: uppercase` is left outside the logo and Fire; component rules hold no hex values; the checks pass.

### Phase 2: the shell

- The grid with the status bar (5.2, 6.8), and splitters with remembered sizes and defaults per window width.
- The top bar (6.1) with the main menu. A first, simple version of the menu part is fine; phase 3 finishes it.
- The viewport's framing (6.4) and the scale getter.
- The transport moves into the timeline header (the header part of 6.5).
- Done when: the numbers in 5.2 hold at both sizes; the status bar shows the checks, triangles, draw calls and the renderer; the checks pass.

### Phase 3: parts, toolbar, hints

- In `dom.ts`: `iconButton`, `menu` (with right-click menus), `chip`, the tooltip system, and `scrubNumber` (drag to change, type to set; it accepts both "0,5" and "0.5").
- The viewport toolbar (6.3) with Fire and the chips. The View chip shows the scale.
- Hints and tooltips (6.9): the switch, `?hints=`, the rewritten one-line hints, titles turned into tooltips.
- Done when: the toolbar fits one row at 1920 px; every chip's menu works by mouse and by keyboard; Show hints works and is remembered; the checks pass.

### Phase 4: effects and layers

- Everything in 6.2: `duplicateEffect` with its test, folders, search, row actions, the add menu, drag to reorder, renaming in place, empty states, the sync with the timeline, and the new keys from 6.11.
- Done when: with 40 or more effects in folders, search and folders keep the list easy to use (try it with a throwaway project in `projects/`, which git ignores, and delete it after); reordering by drag is one undo step; the checks pass.

### Phase 5: timeline

- The rest of 6.5.
- Done when: no bar label is clipped (look at the Rifle shot's Bullet); hover and selection match the Layers panel both ways; scrubbing and the playhead work as before; the checks pass.

### Phase 6: inspector

- Everything in 6.6.
- Done when: at 1920 × 1080, a sprite layer's Layer, Image and Size and place sections show without scrolling, and the effect view shows Effect, Scale, Phases and Colour without scrolling; the settings inventory (`out/ui/fields-after.json`) holds every setting from `fields-before.json` (labels may be shorter: list the renames in your report); the checks pass.

### Phase 7: colour picker

- Everything in 6.7.
- Done when: every feature the picker had is still there (wheel, hex, copy, exact values, darker, lighter, goes with it, worked out from, main colour, revert, source, palette, new colour, gradients, gradient editor, use on the selected glow); the Colour tab is under 640 px tall with the exact values closed (the other tabs may scroll inside the popover); the checks pass.

### Phase 8: polish and docs

- Dialogs, menus and empty states (6.10). A keyboard-only pass: every control reachable, focus always visible. A contrast pass in both themes. Reduced motion.
- README: update "What to click", and add to Assumptions: folders from " / " in effect names, hints on by default, the panel sizes, the yellow rule, the Day and Night names. Update `docs/colours.md` (how to open the picker).
- Final screenshots: both sizes, both themes, every state.

## 9. CLAUDE.md

Create this file at the repo root in phase 0:

```markdown
# Notes for Claude

Shamble VFX is the effects editor for Shamble Frontlines (see README.md). Mustafa makes the decisions: put your own
guesses in README → Assumptions.

## Writing
- Plain words and sentence case, in the UI, the docs and commit messages. One name for one thing, everywhere.

## Packages
- vfx-runtime ships in the game and imports only three.js. No editor code in it.
- vfx-format is the file format. Changing it needs a version bump and an upgrade (docs/format.md). UI work never changes it.

## The editor's UI (packages/vfx-editor)
These rules come from docs/ui-redesign.md and stay after the redesign.
- Tokens only: colours, sizes and radii come from the custom properties at the top of src/style.css. There are two
  themes, Day (light, warm) and Night (neutral dark grey). Check both.
- Zones differ by background and one 1 px line. No boxes inside boxes, no borders on inputs at rest.
- IBM Plex Sans: 12 px for controls and rows, 11 px for hints and meta, 13 px semibold for section titles. Sentence
  case, no all-caps. Big Shoulders Display only in the logo and the Fire button. IBM Plex Mono only for what's typed
  into files (event names, file and image names, colour roles, hex). Tabular figures; units inside their field.
- Yellow (--accent, --accent-ink) means the action or the active thing: Fire, a dialog's main button, the logo's tag,
  selection, the playhead, focus, checked boxes, active toggles. Nothing else is yellow.
- Icons come from src/app/icons.ts (24 px grid, 1.75 px stroke, shown at 16 px). Every icon-only button has an
  aria-label and a tooltip with its shortcut.
- The right panel shows only what's selected: the effect, or one layer.
- Explanations live in tooltips. A .hint line is one or two lines and shows only with Show hints on.
- Never remove a setting to save space: fold it or move it into a menu, one click away.
- No new npm dependencies for the UI. Build small parts in src/app/dom.ts.
- Keep npm test, npm run typecheck and npm run check:browser passing. When the UI changes, move the browser check
  with it. Never delete a check to make it pass.
- Before calling UI work done, run node tools/ui-shots.mjs and look at the pictures: both themes, 2560 × 1440 and
  1920 × 1080.
```
