/**
 * Edits as pure functions: each takes a document and returns a new one. Nothing is changed in place.
 */
import { FACTION_IDS, newProjectileLayer, newSpriteLayer, parseHex } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Gradient, Layer, Palette, PaletteEntry } from '@shamble/vfx-format';
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
  return { ...doc, effects: doc.effects.map((e) => (e.id === id ? next : e)) };
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
  return { ...doc, effects: [...doc.effects, fx] };
}

export function removeEffect(doc: EditorDoc, effectId: string): EditorDoc {
  return { ...doc, effects: doc.effects.filter((e) => e.id !== effectId) };
}

// ---------------------------------------------------------------- colours

/** A colour role's name: lowercase words joined by dots, such as heat.2 or fire.blue. */
export const ROLE_NAME = /^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/;
const HEX = /^#[0-9A-F]{6}$/;

/** Is the role one that changes with the faction (team, glow, ...)? */
export function isFactionRole(p: Palette, role: string): boolean {
  return !!p.factions[FACTION_IDS[0]!].roles[role];
}

/** The palette entry a role uses for a faction. */
export function roleEntry(p: Palette, role: string, faction: FactionId): PaletteEntry | undefined {
  return p.factions[faction]?.roles[role] ?? p.roles[role];
}

function withEntry(p: Palette, role: string, faction: FactionId, entry: PaletteEntry): Palette {
  if (isFactionRole(p, role)) {
    const f = p.factions[faction];
    return { ...p, factions: { ...p.factions, [faction]: { ...f, roles: { ...f.roles, [role]: entry } } } };
  }
  return { ...p, roles: { ...p.roles, [role]: entry } };
}

/**
 * Set a role's colour: for one faction when the role changes with the faction, for everyone when it is shared.
 * The value becomes Mustafa's ("from": "mustafa"): he chose it in the editor.
 */
export function setRoleColour(doc: EditorDoc, role: string, faction: FactionId, hex: string): EditorDoc {
  const up = hex.toUpperCase();
  const e = roleEntry(doc.palette, role, faction);
  if (!e || !HEX.test(up) || (e.hex === up && e.from === 'mustafa')) return doc;
  return { ...doc, palette: withEntry(doc.palette, role, faction, { ...e, hex: up, from: 'mustafa' }) };
}

/** Add a gradient to the palette, or change one. It becomes Mustafa's. */
export function setGradient(doc: EditorDoc, name: string, g: Gradient): EditorDoc {
  const p = doc.palette;
  const next: Gradient = { ...g, from: 'mustafa' };
  if (JSON.stringify(p.gradients?.[name]) === JSON.stringify(next)) return doc;
  return { ...doc, palette: { ...p, gradients: { ...(p.gradients ?? {}), [name]: next } } };
}

/** Put a role's entry back as it was (its colour, whose value it is, its note): the picker's Revert. */
export function restoreRoleEntry(doc: EditorDoc, role: string, faction: FactionId, entry: PaletteEntry): EditorDoc {
  const e = roleEntry(doc.palette, role, faction);
  if (!e || (e.hex === entry.hex && e.from === entry.from && e.note === entry.note)) return doc;
  return { ...doc, palette: withEntry(doc.palette, role, faction, { ...entry }) };
}

/**
 * Add a colour role, shared (one colour for everyone) or per faction (one colour each, all starting the same).
 * Nothing is renamed or removed: effects name roles, so a role, once used, has to stay.
 */
export function addRole(doc: EditorDoc, role: string, perFaction: boolean, hex: string, note?: string): EditorDoc {
  const up = hex.toUpperCase();
  const p = doc.palette;
  if (!ROLE_NAME.test(role) || !HEX.test(up) || p.roles[role] || isFactionRole(p, role)) return doc;
  const entry: PaletteEntry = { hex: up, from: 'mustafa', ...(note ? { note } : {}) };
  if (!perFaction) return { ...doc, palette: { ...p, roles: { ...p.roles, [role]: entry } } };
  const factions = { ...p.factions };
  for (const f of FACTION_IDS) factions[f] = { ...p.factions[f], roles: { ...p.factions[f].roles, [role]: { ...entry } } };
  return { ...doc, palette: { ...p, factions } };
}

/** The two roles worked out from another one by a formula (drawing board v7): team.dark and glow.hot. */
export const DERIVED_ROLES: Readonly<Record<string, { from: string; text: string; make(base: string): string }>> = {
  'team.dark': { from: 'team', text: 'team × 0.7', make: (b) => scaleHex(b, 0.7) },
  'glow.hot': { from: 'glow', text: 'glow mixed with 25 % white', make: (b) => mixHex(b, '#FFFFFF', 0.25) },
};

/** Work a derived role out again from its base, for one faction (only when asked: never on its own). */
export function deriveAgain(doc: EditorDoc, role: string, faction: FactionId): EditorDoc {
  const d = DERIVED_ROLES[role];
  const base = d && roleEntry(doc.palette, d.from, faction);
  const e = roleEntry(doc.palette, role, faction);
  if (!d || !base || !e) return doc;
  const hex = d.make(base.hex);
  if (e.hex === hex && e.from === 'derived') return doc;
  return { ...doc, palette: withEntry(doc.palette, role, faction, { ...e, hex, from: 'derived' }) };
}

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0').toUpperCase();
export function scaleHex(hex: string, k: number): string {
  const [r, g, b] = parseHex(hex);
  return `#${hex2(r * k)}${hex2(g * k)}${hex2(b * k)}`;
}
export function mixHex(a: string, b: string, share: number): string {
  const x = parseHex(a), y = parseHex(b);
  return `#${hex2(x[0] + (y[0] - x[0]) * share)}${hex2(x[1] + (y[1] - x[1]) * share)}${hex2(x[2] + (y[2] - x[2]) * share)}`;
}
