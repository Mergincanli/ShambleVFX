# Colours and gradients

Effect files name colour **roles** (`heat.1`, `team`, `glow`, …), never hexes. The hexes live in one palette per project.

## Where the colours live

- A project without its own colours uses the **built-in palette** (`packages/vfx-format/palette/palette.json`). The examples do.
- When you change a colour, add one, or make a gradient, **Save** writes the project's own **`palette.json`**, next to its
  effects. The built-in palette is never written, so another project keeps its colours.
- Save as copies `palette.json`. Export carries it in the export folder, and the game uses it. Import gives it back.
- Assumed (tell us if wrong): one palette per project. Changing the built-in palette for every project is a separate step.

## Changing a colour

Click a swatch under **Colour** in the right panel. The picker opens next to it:

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

What the game can draw: a gradient is rings of colour from the middle out, smooth or banded. Blurred, mesh and image
gradients (as in some colour tools) are not offered, because the runtime cannot draw them.

Only **glows** use gradients so far. Where else should they apply (smoke, the fire's bed, bursts over their life)? Tell us.
