/**
 * Plain facts about layers, for the panels: what draws a layer (an image, or code), which projectile it rides, which
 * layers ride a projectile, and the colours of what is selected. No DOM here, so the unit tests and the browser check can
 * use it as the panels do.
 */
import { isInputAnchor, roleNames } from '@shamble/vfx-format';
import type { EffectFile, Layer, Palette, ProjectileLayer, ShapeKind, VisibleLayer } from '@shamble/vfx-format';
import { effectColours, layerColours } from '@shamble/vfx-format/validate';
import type { ColourUse } from '@shamble/vfx-format/validate';

/** The 14 shape kinds, in the order of the add menu. */
export const SHAPE_KINDS: ShapeKind[] = ['shards', 'flash', 'cloud', 'smoke', 'ring', 'dots', 'scorch', 'lines', 'glow', 'trail', 'band', 'beads', 'flames', 'bed'];

/**
 * Each shape kind in plain words: the names the editor shows everywhere (Mustafa's decision of 2026-11-25). The files keep
 * the kinds ("band"); the tooltips say them.
 */
export const SHAPE_TEXT: Record<ShapeKind, string> = {
  shards: 'star of shards', flash: 'muzzle flash', cloud: 'cloud blast', smoke: 'smoke', ring: 'ring', dots: 'halftone dots', scorch: 'scorch mark',
  lines: 'speed lines', glow: 'glow', trail: 'trail behind a projectile', band: 'beam', beads: 'beads along a beam', flames: 'flame tongues', bed: 'fire bed',
};

/** A shape's plain name where it starts a label, in sentence case: "Beam", "Star of shards" (the add menu, a new layer). */
export function shapeLabel(kind: ShapeKind): string {
  const t = SHAPE_TEXT[kind];
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A shape's section title in the right panel, worded as layerKind words it: "Shape: beam". */
export function shapeTitle(kind: ShapeKind): string {
  return `Shape: ${SHAPE_TEXT[kind]}`;
}

/** What draws a layer: its image (the file name, for Plex Mono), or code. A projectile draws nothing. */
export interface WhatDraws {
  /** "Image:", "Drawn in code, no image" or "An invisible path: it draws nothing itself". */
  text: string;
  /** The image file, after "Image:". */
  image?: string;
}

export function whatDraws(l: Layer): WhatDraws {
  if (l.type === 'projectile') return { text: 'An invisible path: it draws nothing itself' };
  if (l.type === 'sprite') return { text: 'Image:', image: l.image };
  if (l.type === 'burst' && l.look.kind === 'image') return { text: 'Image:', image: l.look.image };
  return { text: 'Drawn in code, no image' };
}

/** What kind of layer it is, in a few words: "Sprite", "Shape: trail behind a projectile", "Burst: 30 × spark". */
export function layerKind(l: Layer): string {
  switch (l.type) {
    case 'sprite': return 'Sprite';
    case 'projectile': return 'Projectile';
    case 'shape': return shapeTitle(l.shape.kind);
    case 'burst': return `Burst: ${l.count} × ${l.look.kind === 'image' ? 'image piece' : l.look.kind}`;
    case 'word': return `Word: ${l.words.map((w) => w.text).join(' / ')}`;
  }
}

/** A rider's line under its name: "Shape: trail behind a projectile, drawn in code, no image" or "Sprite, image:" + the file. */
export function riderLine(l: Layer): WhatDraws {
  const d = whatDraws(l);
  return { text: `${layerKind(l)}, ${d.text.charAt(0).toLowerCase()}${d.text.slice(1)}`, ...(d.image ? { image: d.image } : {}) };
}

/** The projectile a layer rides, if it rides one. */
export function ridingOn(fx: EffectFile, l: Layer): ProjectileLayer | undefined {
  if (l.type === 'projectile' || isInputAnchor(l.at)) return undefined;
  const id = l.at.layer;
  return fx.layers.find((p): p is ProjectileLayer => p.type === 'projectile' && p.id === id);
}

/** The layers that ride a projectile, top of the drawing order first (as the Layers list shows them). */
export function ridersOf(fx: EffectFile, projectileId: string): VisibleLayer[] {
  return [...fx.layers].reverse().filter((l): l is VisibleLayer => l.type !== 'projectile' && !isInputAnchor(l.at) && l.at.layer === projectileId);
}

/** The colours of what is selected, for the colour list in the right panel. */
export interface SelectionColours {
  /** What the list is of: the whole effect, one layer, or (for a projectile, which has none) the layers riding it. */
  of: 'effect' | 'layer' | 'riders';
  /** The palette's colours it uses, once each, in the palette's order. */
  roles: string[];
  /** Colours it names that the palette does not have (the checker names them too). */
  missing: string[];
  /** Gradient stops given as a hex (not palette colours), once each, with the gradient that has them. */
  hexes: { hex: string; gradient: string }[];
}

/**
 * The colours of the selection, from the checker's own list (vfx-format's layerColours and effectColours): the colours a
 * layer names, "main" as the effect's main colour, the ones it draws without naming them (the ink outline, a star's white
 * first step, your own team's broken edge) and its gradient's stops. No layer: the effect's (its main colour and every
 * layer's). A projectile has no colours of its own: the colours of the layers riding it.
 */
export function selectionColours(fx: EffectFile, layer: Layer | undefined, palette: Palette): SelectionColours {
  let uses: ColourUse[];
  let of: SelectionColours['of'];
  const opts = { main: fx.controls.colour, palette };
  if (!layer) { uses = effectColours(fx, palette).colours; of = 'effect'; }
  else if (layer.type === 'projectile') { uses = ridersOf(fx, layer.id).flatMap((r) => layerColours(r, opts).colours); of = 'riders'; }
  else { uses = layerColours(layer, opts).colours; of = 'layer'; }
  const known = new Set(roleNames(palette));
  const roles = new Set<string>(), missing = new Set<string>();
  const hexes = new Map<string, string>();
  for (const u of uses) {
    if (u.role !== undefined) (known.has(u.role) ? roles : missing).add(u.role);
    else if (u.hex && !hexes.has(u.hex.toUpperCase())) hexes.set(u.hex.toUpperCase(), u.gradient ?? '');
  }
  return {
    of,
    roles: roleNames(palette).filter((r) => roles.has(r)),
    missing: [...missing].sort(),
    hexes: [...hexes].sort(([a], [b]) => a.localeCompare(b)).map(([hex, gradient]) => ({ hex, gradient })),
  };
}
