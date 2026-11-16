# Colours and gradients

Effect files name colour **roles** (`heat.1`, `team`, `glow`, …), never hexes. The hexes live in one palette per project.

## Where the colours live

- A project without its own colours uses the **built-in palette** (`packages/vfx-format/palette/palette.json`). The examples do.
- When you change a colour, add one, or make a gradient, **Save** writes the project's own **`palette.json`**, next to its
  effects. The built-in palette is never written, so another project keeps its colours.
- Save as copies `palette.json`. Export carries it in the export folder, and the game uses it. Import gives it back.
- Assumed (tell us if wrong): one palette per project. Changing the built-in palette for every project is a separate step.
- To take the same colours from one project to another, keep them as a **palette profile** (below).

## Palette profiles

A palette profile is a named set of colours: a whole palette, with its team colours, its shared colours and its gradients.
Profiles live on this computer, not in a project, so one set of colours can go into many projects.

- **Where they live**: the folder `palettes/` in the repo, one file each (the environment variable `VFX_PALETTES_DIR` picks
  another folder). Git ignores it, as it ignores `projects/`: your colours stay on your computer. The game never sees a
  profile: a project keeps its colours in its own `palette.json`, and an export carries that.
- **The two defaults**: the first time the editor needs the folder, it makes it with two profiles:
  - **Built-in**: the built-in palette, as it is.
  - **Built-in with gradients**: the same colours, plus gradients made only of built-in colours (no new hexes): the nine
    ready-made ones, and three for smoke, the fire's bed and bursts. **fire.bed** is the Molotov bed's four tones from the
    middle out (`heat.3` in the middle, then `heat.2`, `heat.1` and `heat.dark` at the rim), with the band edges where its
    bands are without a gradient, so it draws today's bed. **sparks.cool**: a spark goes from white-hot to yellow, orange and
    burnt orange as it fades out. **smoke.lighten**: a fire's smoke puff, dark at first, then lighter as it thins out, up to
    the colour of its lit top. It uses colours only, no see-through: a see-through puff shows its rounds where they overlap.
    All proposals.

  They are ordinary profiles: change them, rename them, delete them. A deleted default does not come back by itself:
  **Restore the default profiles** adds back the ones whose name is missing, never twice, and leaves one that is there as
  it is.
- **Load a profile** into a project: the project takes the profile's colours. No effect breaks: every colour and gradient
  the project's effects use that the profile lacks is kept from the project's own colours (a gradient's stops count too), and
  the editor can say what it kept and which effect and layer needs it. Then the project names the profile in `project.json`
  (`paletteProfile`), and Save writes the colours into its `palette.json`, as any colour change does.
- **Save** the project's colours over a profile (its name stays), or **save them as a new profile** under a new name.
- **Rename** and **delete** a profile.
- **Names**: 1 to 64 characters, no tabs or line breaks, and each name only once, without regard to upper and lower case
  ("Soviets dark" and "soviets DARK" are the same name). When a name is taken, the editor asks for another.
- **Import**: importing an export keeps the export's colours as a profile, named after the export's palette profile (in its
  `editor.json`), else after the export's project. If a profile of that name holds other colours, the new one gets
  " (1)", then " (2)", and so on. If that profile, or one of its numbered ones, holds the very same colours (the same hexes,
  factions and gradients; who chose them and the notes do not count), nothing is added and that one is used. The new
  project's `project.json` names the profile it ended up with. `npm run import` does the same.
- **Save as** keeps the project's palette profile name, and **Export** writes it into `editor.json`. A project with no
  profile gets the name an import gives its colours (the project's name), so export, import and export give the same files.
- A profile file with a part missing or empty (a faction without colours, a colour, gradient or stop that is empty) is
  listed with why, as any file the editor cannot use, and can be deleted; it never stops the other profiles or an import.

The buttons for profiles come with the new editor UI. The editor's local server, its store (`src/io/store.ts`) and the load
function (`loadProfile` in `src/doc/load-profile.ts`) already do the work behind them. One step comes with the buttons:
naming the profile in the project (`paletteProfile`) when a profile is loaded, or when the project's colours are saved as
one. Today only an import names it.

A profile file looks like this. The editor makes the file names itself (`soviets-dark.json`, then `soviets-dark-2.json`
when that is taken):

```json
{ "format": "shamble-vfx-palette-profile", "version": 1, "name": "Soviets dark", "palette": { "version": 2, "factions": { … }, "roles": { … }, "gradients": { … } } }
```

A file in the folder that cannot be used (not a profile, broken, or of a newer version) is named in the list, with why. A file
of a newer version is never written over.

## Changing a colour

Click a swatch under **Colour** in the right panel. The picker opens next to it, and stays open while you play the effect or
fire (Escape or Close puts it away). Keys pressed in it are its own; Ctrl+Z still undoes.

- **The wheel**: drag the ring for the hue, the triangle for brightness and saturation. The arrow keys work too (←/→ hue,
  ↑/↓ brightness, Page Up/Down saturation).
- **The hex value**: type it (`#F47A1C`, or `F47A1C`), copy it, or open the exact sliders (hue, saturation, brightness, red,
  green, blue).
- **Darker** and **Lighter**: eight steps each. **Goes with it**: five colours by a classic scheme (neighbours, opposite, split
  opposite, three apart, four apart, one hue). All are worked out in OKLCH, so they step evenly to the eye. Click one to use it.
- **Team colours** change per faction: the three buttons pick which faction's colour you change, and the preview switches to
  that faction.
- `team.dark` and `glow.hot` are **worked out** from `team` and `glow` (team × 0.7; glow mixed with 25 % white, as the drawing
  board does). Changing `team` does not change `team.dark` by itself: **Work it out again** does, when you ask.
- **Use as this effect's main colour**: what a click on a swatch did before. Layers tinted `main` use it.
- **Revert**: back to the colour, and whose value it was, when the picker opened.
- **Palette**: every colour; click one to change it. **New colour**: a new role, one colour for every faction or one per
  faction. A role cannot be renamed or removed: effects name it.

A colour you change becomes **yours** (`"from": "mustafa"` in `palette.json`). Every change can be undone; a whole drag is one
undo step. Unsaved colours count as unsaved changes.

## Gradients

In the picker, **Gradients**:

- **Ready-made**: nine ramps to start from (radial ramp, soft fade, hot core, banding, duotone, tricolor, landscape, ember,
  smoke). They are made of roles, so they follow the faction. Proposals.
- **In this project**: the project's gradients. Click one to change it.
- **Gradient editor** (it folds): **smooth** (blends from colour to colour) or **banded** (each colour holds to the next stop,
  hard edges, as comic shading does); the **stops**, each a role or a fixed colour, its place (0 = the middle, 100 = the rim)
  and how solid it is; **Make a ramp between two colours** (even steps to the eye; the ends stay roles); and **Use on the
  selected glow**.
- A glow's form has **Gradient, middle to rim**: pick one, or none for one flat colour.

What the game can draw: a gradient is colours along one line, smooth or banded: rings from the middle out on a glow, bands
from the middle out on the fire's bed, and colours over time on smoke and bursts. Blurred, mesh and image gradients (as in some
colour tools) are not offered, because the runtime cannot draw them.

### What a gradient runs along

A gradient goes from 0 to 1. The layer decides what that line is (the picker's stops say "middle" and "rim": a glow and the
fire's bed read it that way):

- **A glow**: from its middle (0) to its rim (1). Its colours come from the gradient, times the glow's alpha.
- **Smoke**: over each puff's life, from its start (0) to its end (1). It colours the body of the puff; the light top and
  the rim keep their own colours. Billows that keep coming each have their own age, so young and old ones differ. The
  gradient's alpha makes the whole puff see-through, but each round of the puff on its own: where rounds overlap they
  show (darker overlaps, the rounds' edges and the billows behind showing through). For smoke that thins without those
  marks, change its colours instead, as **smoke.lighten** does.
- **The fire's bed**: from the middle (0) to the rim (1), as a glow. Banded: one band of lumps per stop, each band its
  stop's colour, with the band edges at the stops; each stop adds a band of lumps, so the checker warns above 8 stops.
  Smooth: the bed keeps its own bands (one per tone, where they always are), and the colours blend over them from the
  middle out. Give the bed's lumps and its detail the same gradient, so the halftone sits where the bands meet. As the
  fire cools, the middle goes first, as before.
- **Bursts**: over each piece's life, from its birth (0) to its end (1). It colours the piece; an image piece is tinted by
  it. The speed streak and the ink edge keep their colours. The gradient's alpha fades the whole piece. Sparks that cool
  from white to dark red, then vanish, are one gradient.

A glow and the fire's bed read a gradient the same way round, from the middle out, and the picker's round preview shows
that order: the ready-made **Banding** starts hot, so on a bed it gives a hot middle and a darker rim, as on a glow. The bed
does not draw it as rings round one point, though: its bands of lumps sit a little nearer the camera the further in they
are (the hot middle sits low, in front, as before), and a stop's alpha fades only its band's fill, while the lines round the
lumps and the halftone stay solid. So a gradient that fades out at the rim, such as **Soft fade**, fades on a glow but
leaves outlined, empty lumps on a bed: for a bed, a darker rim works better than a see-through one
([format.md](format.md) has the details).

In the editor, only a glow has a gradient choice so far. For smoke, the bed and bursts, a gradient already named in the file
shows as a plain text box; the choice comes with the new UI. Without a gradient each layer uses its own colours, as before.
The exact rules are in [format.md](format.md).

## The colours an effect uses

A layer uses the colours its fields name, and a few it draws without naming them:

- the black ink outline, `ink`: on stars, flashes, clouds and fires with an ink edge, and on rings, trails, words and the pieces
  of a burst;
- `white`, for a star's white first step;
- `heat.rim`, for the broken edge your own team's stars, flashes and clouds get;
- the stops of the gradient it names. A stop given as a fixed colour is not a palette colour: it is listed as that hex.

The checker knows this list, for every made-by, tier and faction, so it names a colour the palette lacks and what needs it,
for example: `"ink" is not a role in the palette: "Burst" needs it for the black ink outline`. A test checks the list against
the runtime itself: every colour the runtime asks the palette for is on it. The list is `layerColours` and `effectColours`
in `@shamble/vfx-format/validate`.
