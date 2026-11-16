/**
 * Fade other layers: while a layer is selected (or its row hovered), the other layers fade in the main preview, so the one
 * in focus stands out. Editor only: after the runtime has written one draw's triangles into its buffers and before they go
 * to the GPU, the colours of the other layers' vertices are scaled. The runtime does not change, and the cost measurement
 * (its own renderer) never sees it. The fade only changes colours: every triangle stays, so the counts stay too.
 */
import { BLEND_GROUPS } from '@shamble/vfx-runtime';
import type { DrawSink } from '@shamble/vfx-runtime';
import type { EffectFile } from '@shamble/vfx-format';
import { ridersOf } from '../doc/layer-info';

/** How strong the other layers stay: about a quarter. */
export const FADE_TO = 0.25;

/** Fade other layers on or off, remembered in the browser. On until switched off. */
export const FADE_KEY = 'vfx-fade';

/** Where each blend group's buffer ends now, in BLEND_GROUPS order: a draw's vertices are the ones it adds after this. */
export function sinkMarks(sink: DrawSink): number[] {
  return BLEND_GROUPS.map((g) => sink.groups[g].vcount);
}

/**
 * The layers (by their place in the effect) that keep their full strength while the layer `id` is in focus: the layer
 * itself, or for a projectile, which draws nothing, the layers riding it. Undefined when the effect has no such layer.
 */
export function keptLayers(fx: EffectFile, id: string): Set<number> | undefined {
  const index = fx.layers.findIndex((l) => l.id === id);
  if (index < 0) return undefined;
  const keep = new Set([index]);
  if (fx.layers[index]!.type === 'projectile') for (const r of ridersOf(fx, id)) keep.add(fx.layers.indexOf(r));
  return keep;
}

/**
 * Fade every vertex written since `from` (sinkMarks before the draw) whose layer is not kept, to `k` of its strength. Each
 * blend group's material (vfx-runtime's tsl.ts) reads the vertex colour its own way:
 *   - normal drawing (in "ground" and "top"): out = colour x a + under x (1 - a), so its alpha is scaled;
 *   - added light (the same groups, marked by a negative alpha): out = under + colour x |a|, so its colour is scaled and
 *     the sign stays;
 *   - multiply (stains): out = under x mix(1, colour, a), so scaling a moves the stain towards white, for an image too;
 *   - screen (light on the ground): out = 1 - (1 - under)(1 - colour x a), so scaling a weakens the light.
 */
export function fadeOthers(sink: DrawSink, from: readonly number[], keep: ReadonlySet<number>, k = FADE_TO): void {
  BLEND_GROUPS.forEach((g, gi) => {
    const b = sink.groups[g];
    const col = b.col, layer = b.layer;
    const shared = g === 'ground' || g === 'top';
    for (let v = from[gi] ?? 0; v < b.vcount; v++) {
      if (keep.has(layer[v]!)) continue;
      const i = v * 4;
      if (shared && col[i + 3]! < 0) {
        col[i] = col[i]! * k;
        col[i + 1] = col[i + 1]! * k;
        col[i + 2] = col[i + 2]! * k;
      } else col[i + 3] = col[i + 3]! * k;
    }
  });
}
