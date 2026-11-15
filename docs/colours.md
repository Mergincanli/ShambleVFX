# Colours and gradients

Effect files name colour **roles** (`heat.1`, `team`, `glow`, …), never hexes. The hexes live in one palette per project.

## Where the colours live

- A project without its own colours uses the **built-in palette** (`packages/vfx-format/palette/palette.json`). The examples do.
- When you change a colour, add one, or make a gradient, **Save** writes the project's own **`palette.json`**, next to its
  effects. The built-in palette is never written, so another project keeps its colours.
- Save as copies `palette.json`. Export carries it in the export folder, and the game uses it. Import gives it back.
- Assumed (tell us if wrong): one palette per project. Changing the built-in palette for every project is a separate step.

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
from the rim in on the fire's bed, and colours over time on smoke and bursts. Blurred, mesh and image gradients (as in some
colour tools) are not offered, because the runtime cannot draw them.

### What a gradient runs along

A gradient goes from 0 to 1. The layer decides what that line is (the picker's stops say "middle" and "rim", as for a glow):

- **A glow**: from its middle (0) to its rim (1). Its colours come from the gradient, times the glow's alpha.
- **Smoke**: over each puff's life, from its start (0) to its end (1). It colours the body of the puff; the light top and
  the rim keep their own colours. Billows that keep coming each have their own age, so young and old ones differ. The
  gradient's alpha makes the whole puff see-through (where its rounds overlap, it looks denser).
- **The fire's bed**: from the rim (0) to the very middle (1). One band of lumps per stop, its edge at the stop. Banded:
  each band is its stop's colour. Smooth: the colour blends from band to band. Give the bed's lumps and its detail the same
  gradient, so the halftone sits where the bands meet. As the fire cools, the middle goes first, as before.
- **Bursts**: over each piece's life, from its birth (0) to its end (1). It colours the piece; an image piece is tinted by
  it. The speed streak and the ink edge keep their colours. The gradient's alpha fades the whole piece. Sparks that cool
  from white to dark red, then vanish, are one gradient.

Mind the direction: 0 is the middle of a glow but the rim of a bed. The ready-made **Banding** starts hot, so on a bed it
gives a hot rim and a dark middle.

In the editor, only a glow has a gradient choice so far. For smoke, the bed and bursts, a gradient already named in the file
shows as a plain text box; the choice comes with the new UI. Without a gradient each layer uses its own colours, as before.
The exact rules are in [format.md](format.md).
