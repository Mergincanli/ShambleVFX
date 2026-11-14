# The effect file, version 1

One effect is one JSON file: `effects/<id>.vfx.json` in a project folder, next to `images/` (PNG files) and `project.json`.
The exact schema is `packages/vfx-format/schema/effect.v1.schema.json`; the types are `packages/vfx-format/src/types.ts`.

## Rules for every file

- **Times in milliseconds, sizes in metres.**
- **Colours are role names**, such as `heat.2`, `team` or `glow`. A hex colour is never stored in an effect file; the checker refuses one anywhere, even in a name. The hexes live in the palette (`packages/vfx-format/palette/palette.json`). `team`, `team.dark` and `glow` follow the faction that made the effect; the others are the same for everyone.
- **Everything random comes from the seed** the game passes in. Same seed and same time give the same picture.
- **Layers draw in list order**: the first layer is at the bottom.
- **The file carries a version number.** When the format changes, the number goes up and an upgrade step is added, so old files keep opening.

## An example

```json
{
  "format": "shamble-vfx",
  "version": 1,
  "id": "shell_flight",
  "name": "Tank shell flight (demo)",
  "controls": { "size": 1, "intensity": 1, "duration": 1, "colour": "team" },
  "layers": [
    { "id": "shell", "name": "Shell", "type": "projectile",
      "start": { "ms": 0 }, "timing": { "mode": "steps", "perSecond": 12 },
      "from": { "input": "origin", "offset": [0, 0, 0] }, "to": { "input": "target", "offset": [0, 0, 0] },
      "speedMps": 12, "stretch": 1, "spinDegPerS": 0 },
    { "id": "trail", "name": "Shell trail", "type": "sprite",
      "start": { "ms": 0 }, "timing": { "mode": "steps", "perSecond": 12 },
      "at": { "layer": "shell" }, "image": "shell_trail.png",
      "pivot": [1, 0.5], "sizeM": [1.3, 0.16], "tint": { "mode": "multiply", "role": "main" }, "facing": "path" },
    { "id": "landing", "name": "Landing burst", "type": "sprite",
      "start": { "arrivalOf": "shell", "ms": 0 }, "timing": { "mode": "steps", "perSecond": 12 },
      "at": { "input": "target", "offset": [0, 0, 0] }, "image": "burst.png",
      "flipbook": { "cols": 2, "rows": 2, "frames": 4, "loop": false },
      "pivot": [0.5, 0.62], "sizeM": [2.6, 2.6], "tint": { "mode": "keep" }, "facing": "camera", "durationMs": 490 }
  ]
}
```

## The parts

**controls**: the four big controls. `size`, `intensity` and `duration` are multipliers (1 = as authored); `colour` is the main role, used by layers whose tint role is `"main"`. What each one changes is decided in one place, the runtime's `applyControls()`.

**Inputs**: the game gives every effect an `origin` (a muzzle, the centre of a blast) and a `target` (the hit point), and the faction that made it.

**Common to every layer**
- `id` (lowercase letters, digits, `_`) and `name` (shown in the editor).
- `start`: `{ "ms": 120 }` (120 ms after the effect starts) or `{ "arrivalOf": "shell", "ms": 0 }` (when the projectile `shell` lands).
- `timing`: `{ "mode": "steps", "perSecond": 12 }` moves in whole steps, like drawn animation; `{ "mode": "smooth" }` moves every frame. Each layer counts its steps from its own start.

**Sprite layer** (`"type": "sprite"`)
- `at`: `{ "input": "origin" | "target", "offset": [right, up, forward] }`, or `{ "layer": "<projectile id>" }` to ride a projectile.
- `image`: a PNG in `images/`. `flipbook` (optional): `{ cols, rows, frames, loop }`, frames read left to right, top to bottom, one frame per step.
- `pivot`: the point of the image that sits on the anchor: `[0, 0]` top-left, `[1, 1]` bottom-right.
- `sizeM`: `[width, height]` in metres.
- `tint`: `{ "mode": "keep" }` keeps the image's colours; `{ "mode": "multiply", "role": "glow" }` multiplies them by a role (draw tinted images in white and greys).
- `facing`: `"camera"`, or `"path"` (the image's x axis lies along the motion, or along the shot from origin to target).
- `durationMs` (optional): absent means "as long as the projectile it rides is in the air", or, for a flipbook that does not loop, one step per frame.

**Projectile layer** (`"type": "projectile"`)
- `from`, `to`: input anchors as above.
- `speedMps`: metres per second. The flight time is distance ÷ speed, so it depends on where the game puts origin and target.
- `stretch`: length factor for the sprites that ride it and face along the path (1 = no stretch).
- `spinDegPerS`: how fast the riding sprites turn in their own plane.

## Planned changes (each with an upgrade step)

- Milestone 2: shape, burst and word layers; phases (wind-up, peak, fade); a fixed flight time and a trail time for projectiles, as the drawing board draws them; an arc for shells.
- Milestone 3: which quality tiers each layer shows in; the export manifest with the game events each effect answers.
- Later: sound, camera shake and hit-stop as their own layer types, on the same timeline.
