/**
 * The layers the runtime could not draw at the moment shown, and why, in plain words. The runtime notes every layer it
 * skips because the atlas does not have its image (VfxRenderer's stats.notDrawn, for the last frame); the project's image
 * files tell why: the file is there but did not load, or there is no such file. A layer the tier leaves out is not a
 * fault: the runtime never notes it, so it gets no note. A layer that is not on at that moment is not noted either.
 */
import type { EffectFile } from '@shamble/vfx-format';
import type { NotDrawn } from '@shamble/vfx-runtime';

export interface NotDrawnNote {
  /** The layer's id and its name. */
  layer: string;
  name: string;
  /** The image it needs. */
  image: string;
  /** not-loaded: the project has the image file, but it did not load (the atlas does not have it). missing: the project has no such file. */
  why: 'not-loaded' | 'missing';
  /** In plain words, for the editor to show. */
  text: string;
}

/** The notes for one effect, in its layer order, one per layer. */
export function notDrawnNotes(fx: EffectFile, notDrawn: readonly NotDrawn[], projectImages: Iterable<string>): NotDrawnNote[] {
  const files = new Set(projectImages);
  const out: { index: number; note: NotDrawnNote }[] = [];
  for (const m of notDrawn) {
    if (m.effect !== fx.id || out.some((o) => o.note.layer === m.layer)) continue;
    const index = fx.layers.findIndex((l) => l.id === m.layer);
    if (index < 0) continue;
    const why = files.has(m.image) ? 'not-loaded' : 'missing';
    const text = why === 'not-loaded' ? `the image ${m.image} did not load` : `the image ${m.image} is not in the project`;
    out.push({ index, note: { layer: m.layer, name: fx.layers[index]!.name, image: m.image, why, text } });
  }
  return out.sort((a, b) => a.index - b.index).map((o) => o.note);
}
