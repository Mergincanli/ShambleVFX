# The cost panel

Every effect shows what it costs, per quality tier, next to budgets you type (decided principle 7). No budget is decided yet,
so the editor invents no limits: the boxes start empty, and a number turns red (over) or green (within) only once you type a
budget.

Press **Measure** on the **Cost** card in the right panel (the triangle count above the preview jumps there). The editor plays
the effect through **once per tier**, through `VfxRenderer` (the code the game ships), at a **fresh game camera** on the
1920 × 1080 screen, at **60 frames a second**, with **seed 1**, in the scene, faction, "made by" and distance the preview has
now. The preview waits while it measures. The card prints these conditions under the table; when the effect or any of them
changes, the numbers go grey and say so.

**Each number is the most at any moment of the effect**, on its own: the most draws may come at another moment than the most
triangles.

| Row | What it counts |
|---|---|
| **Draws** | Draw calls: one per blend group in use (stains, light on the ground, the rest on the ground, everything over the scene). Effects playing together share them, so the whole game's effects cost at most 4. |
| **Sprites alive** | Items alive at once: each sprite, particle, dot, letter, flame tongue, smoke puff, line, bead and shape counts **once**, however many outlines and triangles it takes. A burst of 10 inked, streaked pieces counts 10. A halftone field counts each dot, so fires and glows reach the thousands. |
| **Triangles** | Triangles drawn. |
| **Screen area** | The largest share of the game screen the effect covers, see-through parts included (the GPU fills those too). Under it: the same with overlaps counted, which is how much the GPU fills. |
| **CPU ms a frame** | Time to build one frame of the effect's triangles **on this computer**: the 95th percentile frame, with the average and the worst under it. 24 moments spread over the effect, each timed for at least 20 ms after a warm-up (the browser's clock is coarse). The GPU's share shows in triangles and screen area. |

Under the table: the three layers with the most triangles in High, at its busiest moment. They are where to look first when
deciding what Low drops.

The counts and areas are the same on every press (the browser check measures twice and compares). They never touch the GPU
(they are counted from the triangles the runtime builds), so the backend does not change them. Only the milliseconds depend
on the computer.

## Budgets

A budget is a number per tier and per row, like the boxes under the measured values. The milliseconds budget is compared with
the 95th percentile frame, the area budget with the screen share in percent.

### Three levels

Budgets come at three levels. **Each level is off until you switch it on** (Mustafa: "optional for all three, and toggled
off").

- **The project's**: one set for every effect in the project.
- **Classes**: named classes of effects, each with its own set. A project starts with three, **Small**, **Normal** and **Big**,
  with no numbers ("Medium" is already a tier name). You can rename them, add more and delete them. An effect is in one
  class, or in none; when its class is deleted, it is in none. The class level is switched on or off as a whole.
- **The effect's own**: one set for one effect, switched on or off for that effect.

### Which one counts

**The closest level that is on counts, as a whole set**: the effect's own; else its class (when the class level is on and the
effect has a class); else the project's. Nothing is mixed: an empty box in the set that counts means no limit for that
number, even when another level has one. When no level is on, nothing is compared and nothing turns red or green.

### On the card today

Until the editor's new Cost card comes (in the UI redesign), the card shows and edits **the project's budgets**: typing a
number switches them on. A line under the card says which level counts for the effect shown, and the colours compare with
that level's numbers. Classes and an effect's own budgets can be set only in `project.json` for now.

### In the files

`project.json` keeps them under `budgets`, and an export copies them into `editor.json`. A file holds **only what differs from
the defaults**: a level that is off and has no numbers is left out, the three starting classes are left out while they are
unchanged, and so is an effect with nothing set. A changed class list is written whole (an empty list too, so deleted classes
do not come back). An effect names its class by the class's `id`, which stays when the class is renamed.

```json
"budgets": {
  "project": { "on": true, "limits": { "high": { "triangles": 5000 } } },
  "classes": { "on": true, "list": [ { "id": "small", "name": "Small" }, { "id": "normal", "name": "Normal" },
                                     { "id": "big", "name": "Big", "limits": { "high": { "triangles": 9000 } } } ] },
  "effects": { "board_shell": { "class": "big" }, "board_muzzle": { "on": true, "limits": { "low": { "draws": 2 } } } }
}
```

Here the tank shell (in Big, with the class level on) is compared with 9000 triangles in High, the rifle shot with its own
2 draws in Low and nothing else, and every other effect with the project's 5000 triangles in High.

A project made before (`project.json` version 1) had one set of budgets for the whole project. It becomes the project's
budgets, **switched off**, with its numbers kept (the approved plan). On today's card, change one of them to switch them on.

When the project is saved, the budgets of effects it no longer has are left out (until then, undo can bring an effect back
with its budgets). An export leaves out those of effects that are not in it.

For reference only, not used anywhere: the game's research notes (the ADR 0003 draft) suggest ≤ 2 ms at the 99th percentile
in Low and ≤ 1 ms in High, for **all effects together**. The panel measures one effect at a time, on this computer.
