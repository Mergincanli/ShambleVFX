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
