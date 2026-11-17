/**
 * The icon of a layer, for the Layers list, the timeline's names column and the layer panel's header. A sprite, a
 * projectile and a word go by their type, a shape by its kind and a burst by the look of its pieces. An image burst
 * shows the image icon, as a sprite does.
 *
 * Where it is shown, a sprite whose image is loaded shows a small picture of that image instead (layerGlyph): its first
 * frame, on the preview's ground colour.
 */
import type { Layer, ParticleLook, ShapeKind } from '@shamble/vfx-format';
import { icon } from './icons';
import type { IconName } from './icons';

/** One icon per shape kind. A new kind in the format fails the type check here until it has its icon. */
export const SHAPE_ICON: Record<ShapeKind, IconName> = {
  shards: 'shape-shards', flash: 'shape-flash', cloud: 'shape-cloud', smoke: 'shape-smoke', ring: 'shape-ring', dots: 'shape-dots', scorch: 'shape-scorch',
  lines: 'shape-lines', glow: 'shape-glow', trail: 'shape-trail', band: 'shape-band', beads: 'shape-beads', flames: 'shape-flames', bed: 'shape-bed',
};

/** One icon per burst look. */
export const LOOK_ICON: Record<ParticleLook['kind'], IconName> = {
  diamond: 'burst-diamond', chip: 'burst-chip', spark: 'burst-spark', dot: 'burst-dot', shard: 'burst-shard', speck: 'burst-speck', puff: 'burst-puff',
  streak: 'burst-streak', spike: 'burst-spike', image: 'sprite',
};

export function layerIcon(l: Layer): IconName {
  switch (l.type) {
    case 'sprite': return 'sprite';
    case 'projectile': return 'projectile';
    case 'shape': return SHAPE_ICON[l.shape.kind];
    case 'burst': return LOOK_ICON[l.look.kind];
    case 'word': return 'word';
  }
}

/** Where a layer's image is, when it is loaded (App.imageUrl): undefined for an image that is missing or did not load. */
export type ImageUrlOf = (image: string) => string | undefined;

/** What layerGlyph draws for a layer: the same key, the same element. A panel redraws its glyph when this changes. */
export function layerGlyphKey(l: Layer, urlOf?: ImageUrlOf): string {
  const url = l.type === 'sprite' ? urlOf?.(l.image) : undefined;
  return url && l.type === 'sprite' ? `img|${url}|${l.flipbook ? `${l.flipbook.cols}x${l.flipbook.rows}` : ''}` : layerIcon(l);
}

/** A frame more than this many times as wide as it is tall (or as tall as it is wide) shows a slice from its middle. */
const SLICE_RATIO = 4;

/**
 * The layer's icon as an element (16 px). A sprite whose image is loaded shows that image instead of the image icon:
 * its first frame (the top left cell of a flipbook), whole, on the preview's ground colour, so a white image still
 * shows. A sprite whose image is missing, and every other layer, shows its icon.
 *
 * A long thin frame, such as a tracer's streak (512 x 48), would be a line about a pixel thick fitted in whole, and the
 * tile would look empty: it fills the tile with a slice from its middle instead (data-fit="slice", read by style.css).
 */
export function layerGlyph(l: Layer, urlOf?: ImageUrlOf): Element {
  const url = l.type === 'sprite' ? urlOf?.(l.image) : undefined;
  if (!url || l.type !== 'sprite') return icon(layerIcon(l));
  const img = document.createElement('img');
  img.className = 'icon layer-thumb';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  // The first frame: the rest of the sheet is cut away (Chromium; elsewhere the whole sheet shows, shrunk).
  const cols = l.flipbook?.cols ?? 1, rows = l.flipbook?.rows ?? 1;
  if (cols > 1 || rows > 1) img.style.setProperty('object-view-box', `inset(0 ${pct(1 - 1 / cols)} ${pct(1 - 1 / rows)} 0)`);
  // The frame's shape is known once the image is: at once for an image this page has shown already, else when it loads.
  const fit = () => {
    const w = img.naturalWidth / cols, ht = img.naturalHeight / rows;
    img.dataset.fit = w > SLICE_RATIO * ht || ht > SLICE_RATIO * w ? 'slice' : 'whole';
  };
  img.addEventListener('load', fit, { once: true });
  img.src = url;
  if (img.complete && img.naturalWidth) fit();
  return img;
}

const pct = (f: number) => `${+(f * 100).toFixed(3)}%`;
