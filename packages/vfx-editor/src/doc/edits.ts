/**
 * Edits as pure functions: each takes a document and returns a new one. Nothing is changed in place.
 */
import { newProjectileLayer, newSpriteLayer } from '@shamble/vfx-format';
import type { EffectFile, Layer } from '@shamble/vfx-format';
import type { EditorDoc } from './history';

export type Path = readonly (string | number)[];

/** A copy of `obj` with the value at `path` replaced (or removed when value is undefined). */
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [k, ...rest] = path as [string | number, ...(string | number)[]];
  const src = obj as unknown as Record<string | number, unknown>;
  const copy: Record<string | number, unknown> = Array.isArray(obj) ? ([...(obj as unknown[])] as unknown as Record<number, unknown>) : { ...src };
  if (rest.length === 0 && value === undefined && !Array.isArray(obj)) delete copy[k];
  else copy[k] = setIn(src?.[k], rest, value);
  return copy as unknown as T;
}

export function getIn(obj: unknown, path: Path): unknown {
  let v: unknown = obj;
  for (const k of path) v = (v as Record<string | number, unknown> | undefined)?.[k];
  return v;
}

export function effectById(doc: EditorDoc, id: string): EffectFile | undefined {
  return doc.effects.find((e) => e.id === id);
}

export function replaceEffect(doc: EditorDoc, id: string, next: EffectFile): EditorDoc {
  return { effects: doc.effects.map((e) => (e.id === id ? next : e)) };
}

/** Set one value inside one effect. */
export function setEffectValue(doc: EditorDoc, effectId: string, path: Path, value: unknown): EditorDoc {
  const fx = effectById(doc, effectId);
  if (!fx) return doc;
  if (Object.is(getIn(fx, path), value)) return doc;
  return replaceEffect(doc, effectId, setIn(fx, path, value));
}

/** Set one value inside one layer of one effect. */
export function setLayerValue(doc: EditorDoc, effectId: string, layerId: string, path: Path, value: unknown): EditorDoc {
  const fx = effectById(doc, effectId);
  const i = fx?.layers.findIndex((l) => l.id === layerId) ?? -1;
  if (!fx || i < 0) return doc;
  return setEffectValue(doc, effectId, ['layers', i, ...path], value);
}

export function replaceLayer(doc: EditorDoc, effectId: string, layer: Layer): EditorDoc {
  const fx = effectById(doc, effectId);
  if (!fx) return doc;
  return replaceEffect(doc, effectId, { ...fx, layers: fx.layers.map((l) => (l.id === layer.id ? layer : l)) });
}

/** A layer id not used in the effect yet: base, base_2, base_3, ... */
export function freeLayerId(fx: EffectFile, base: string): string {
  const used = new Set(fx.layers.map((l) => l.id));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

export function freeEffectId(doc: EditorDoc, base: string): string {
  const used = new Set(doc.effects.map((e) => e.id));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** Add a layer on top (end of the list), or right above `after`. */
export function addLayer(doc: EditorDoc, effectId: string, layer: Layer, after?: string): EditorDoc {
  const fx = effectById(doc, effectId);
  if (!fx) return doc;
  const layers = [...fx.layers];
  const at = after ? layers.findIndex((l) => l.id === after) + 1 : layers.length;
  layers.splice(at <= 0 ? layers.length : at, 0, layer);
  return replaceEffect(doc, effectId, { ...fx, layers });
}

export function newSprite(fx: EffectFile, image: string): Layer {
  const id = freeLayerId(fx, 'sprite');
  return newSpriteLayer(id, `Sprite ${id.split('_')[1] ?? ''}`.trim(), image);
}

export function newProjectile(fx: EffectFile): Layer {
  const id = freeLayerId(fx, 'projectile');
  return newProjectileLayer(id, `Projectile ${id.split('_')[1] ?? ''}`.trim());
}

/**
 * Remove a layer. Sprites that rode it go back to the origin; layers that started when it landed start with the effect.
 * (So the effect stays valid; undo brings everything back.)
 */
export function removeLayer(doc: EditorDoc, effectId: string, layerId: string): EditorDoc {
  const fx = effectById(doc, effectId);
  if (!fx) return doc;
  const layers = fx.layers
    .filter((l) => l.id !== layerId)
    .map((l) => {
      let out = l;
      if (out.type === 'sprite' && 'layer' in out.at && out.at.layer === layerId) {
        out = { ...out, at: { input: 'origin', offset: [0, 0, 0] } };
        if (out.type === 'sprite' && out.durationMs === undefined && !(out.flipbook && !out.flipbook.loop)) out = { ...out, durationMs: 250 };
      }
      if ('arrivalOf' in out.start && out.start.arrivalOf === layerId) out = { ...out, start: { ms: out.start.ms } };
      return out;
    });
  return replaceEffect(doc, effectId, { ...fx, layers });
}

/** Move a layer up (towards the top of the drawing order, the end of the list) or down. */
export function moveLayer(doc: EditorDoc, effectId: string, layerId: string, delta: number): EditorDoc {
  const fx = effectById(doc, effectId);
  if (!fx) return doc;
  const i = fx.layers.findIndex((l) => l.id === layerId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= fx.layers.length) return doc;
  const layers = [...fx.layers];
  const [l] = layers.splice(i, 1);
  layers.splice(j, 0, l!);
  return replaceEffect(doc, effectId, { ...fx, layers });
}

export function duplicateLayer(doc: EditorDoc, effectId: string, layerId: string): { doc: EditorDoc; id?: string } {
  const fx = effectById(doc, effectId);
  const l = fx?.layers.find((x) => x.id === layerId);
  if (!fx || !l) return { doc };
  const id = freeLayerId(fx, l.id.replace(/_\d+$/, ''));
  const copy = { ...structuredClone(l), id, name: `${l.name} copy`.slice(0, 80) };
  return { doc: addLayer(doc, effectId, copy, layerId), id };
}

export function addEffect(doc: EditorDoc, fx: EffectFile): EditorDoc {
  return { effects: [...doc.effects, fx] };
}

export function removeEffect(doc: EditorDoc, effectId: string): EditorDoc {
  return { effects: doc.effects.filter((e) => e.id !== effectId) };
}
