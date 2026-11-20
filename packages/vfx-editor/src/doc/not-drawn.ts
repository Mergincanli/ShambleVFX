/**
 * The layers the runtime could not draw at the moment shown, and why, in plain words. The runtime notes every layer it
 * skips because the atlas does not have its image (VfxRenderer's stats.notDrawn, for the last frame); the project's image
 * files tell why: the file is there but did not load, or there is no such file. A layer the tier leaves out is not a
 * fault: the runtime never notes it, so it gets no note. A layer that is not on at that moment is not noted either.
 */
import type { EffectFile, Layer, TierName } from '@shamble/vfx-format';
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

/** Why one layer is not drawn in the preview now: one reason, in plain words. */
export interface NotDrawnReason {
  /** The layer's id and its name. */
  layer: string;
  name: string;
  /**
   * errors: the effect has problems that stop the preview (schema, format or version), so nothing of it draws; tier: the
   * tier the preview draws leaves the layer out; not-loaded, missing: its image is not in the atlas (see NotDrawnNote).
   */
  why: 'errors' | 'tier' | 'not-loaded' | 'missing';
  /** In plain words, to follow "<name> is not drawn: " or "Not drawn: ". */
  text: string;
}

const TIER_WORD: Record<TierName, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** The image a layer draws: a sprite's, or an image burst's pieces'. */
function imageOf(l: Layer): string | undefined {
  if (l.type === 'sprite') return l.image;
  if (l.type === 'burst' && l.look.kind === 'image') return l.look.image;
  return undefined;
}

/** "Medium and High", "Low, Medium and High". */
function listWords(words: string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/**
 * Why each layer of an effect is not drawn in the preview now (UI phase 6, Part B: the "not drawn" warning), in the
 * effect's layer order, errors first. A projectile draws nothing of its own, so it gets none.
 *   - errors: the problems stop the preview (`waits`): every layer, "its effect has errors that stop the preview".
 *   - tier: the tier shown leaves the layer out: "the Low tier leaves it out: it shows in Medium and High". The runtime does
 *     not note it (it is not a fault), but the preview does not draw it either.
 *   - not-loaded and missing: the atlas (`atlasImages`, null while there is none yet) does not have its image, so the runtime
 *     skips it whenever it is on; or the runtime noted it on the last frame (`notDrawn`). The words are notDrawnNotes': "the
 *     image muzzle_flash.png did not load", "the image … is not in the project". Known from the atlas, the reason shows at
 *     every moment, not only while the layer is on.
 */
export function notDrawnReasons(fx: EffectFile, o: {
  atlasImages: ReadonlySet<string> | null; projectImages: Iterable<string>; notDrawn: readonly NotDrawn[]; tier: TierName; waits: boolean;
}): NotDrawnReason[] {
  const out: NotDrawnReason[] = [];
  const visible = fx.layers.filter((l) => l.type !== 'projectile');
  if (o.waits) for (const l of visible) out.push({ layer: l.id, name: l.name, why: 'errors', text: 'its effect has errors that stop the preview' });
  for (const l of visible) {
    if (!l.tiers.includes(o.tier)) {
      out.push({ layer: l.id, name: l.name, why: 'tier', text: `the ${TIER_WORD[o.tier]} tier leaves it out: it shows in ${listWords(l.tiers.map((t) => TIER_WORD[t]))}` });
    }
  }
  // The images: what the atlas lacks, and what the runtime noted, in the words notDrawnNotes gives them.
  const seen: NotDrawn[] = [...o.notDrawn];
  fx.layers.forEach((l, index) => {
    const image = imageOf(l);
    if (image && o.atlasImages && !o.atlasImages.has(image)) seen.push({ effect: fx.id, layer: l.id, index, image });
  });
  for (const n of notDrawnNotes(fx, seen, o.projectImages)) out.push({ layer: n.layer, name: n.name, why: n.why, text: n.text });
  // Errors first, then each layer's own reasons in the effect's order.
  const order = new Map(fx.layers.map((l, i) => [l.id, i]));
  return out.sort((a, b) => (a.why === 'errors' ? -1 : 0) - (b.why === 'errors' ? -1 : 0) || order.get(a.layer)! - order.get(b.layer)!);
}
