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

Type a number in a box under a measured value. A budget is per tier and per row; the milliseconds budget is compared with the
95th percentile frame, the area budget with the screen share in percent.

Assumed (tell us if wrong): **one set of budgets per project**, shown on every effect's card, saved in `project.json` as
`budgets` (and copied into an export's `editor.json`). If budgets should be per effect, or per size class (small, big), that
is a small change.

For reference only, not used anywhere: the game's research notes (the ADR 0003 draft) suggest ≤ 2 ms at the 99th percentile
in Low and ≤ 1 ms in High, for **all effects together**. The panel measures one effect at a time, on this computer.
