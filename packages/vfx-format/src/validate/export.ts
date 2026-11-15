/**
 * The checker for an export folder (its layout is described in ../export.ts).
 *
 * The checker names schema errors, unknown roles, missing images and problems in the manifest. The editor runs it after
 * writing an export and before importing one; the game's build can run it too.
 */
import { z } from 'zod';
import { FORMAT_VERSION } from '../types';
import type { EffectFile } from '../types';
import { EVENT_NAME, EXPORT_FORMAT, EXPORT_VERSION } from '../export';
import type { AtlasMap, ExportManifest } from '../export';
import type { Palette } from '../palette';
import { checkEffect } from './check';
import type { Problem } from './check';

export { EXPORT_FORMAT, EXPORT_VERSION, EVENT_NAME } from '../export';
export type { AtlasMap, ExportManifest, ManifestEffect } from '../export';

const manifestSchema = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  name: z.string().min(1),
  effectVersion: z.int(),
  palette: z.string().min(1),
  atlas: z.strictObject({ image: z.string().min(1), map: z.string().min(1), width: z.int().min(1), height: z.int().min(1) }),
  effects: z.array(z.strictObject({ id: z.string().min(1), name: z.string(), version: z.int(), file: z.string().min(1), events: z.array(z.string()) })),
  events: z.record(z.string(), z.string()),
});

const atlasSchema = z.strictObject({
  width: z.int().min(1),
  height: z.int().min(1),
  rects: z.record(z.string(), z.strictObject({ x: z.int().min(0), y: z.int().min(0), w: z.int().min(1), h: z.int().min(1) })),
});

export interface ExportCheck {
  ok: boolean;
  problems: Problem[];
  manifest?: ExportManifest;
  /** The effects as read (current version), by id. */
  effects: Map<string, EffectFile>;
}

/**
 * Check an export: the manifest, the atlas map, and every effect against the palette and the atlas's images.
 * `files` maps paths inside the folder to their parsed JSON (missing paths are reported).
 */
export function checkExport(input: { manifest: unknown; atlas: unknown; files: Record<string, unknown>; palette: Palette }): ExportCheck {
  const problems: Problem[] = [];
  const effects = new Map<string, EffectFile>();
  const err = (path: string, message: string) => problems.push({ kind: 'export', level: 'error', path, message });
  const warn = (path: string, message: string) => problems.push({ kind: 'export', level: 'warning', path, message });

  const m = manifestSchema.safeParse(input.manifest);
  if (!m.success) {
    for (const iss of m.error.issues) err(`manifest.${iss.path.join('.') || '(file)'}`, iss.message);
    return { ok: false, problems, effects };
  }
  const manifest = m.data as ExportManifest;
  if (manifest.effectVersion !== FORMAT_VERSION) {
    err('manifest.effectVersion', `the effects are version ${manifest.effectVersion}; this Shamble VFX reads version ${FORMAT_VERSION}`);
  }
  const a = atlasSchema.safeParse(input.atlas);
  if (!a.success) {
    for (const iss of a.error.issues) err(`atlas.${iss.path.join('.') || '(file)'}`, iss.message);
    return { ok: false, problems, effects, manifest };
  }
  const atlas = a.data as AtlasMap;
  if (atlas.width !== manifest.atlas.width || atlas.height !== manifest.atlas.height) {
    err('atlas', `the map says ${atlas.width} x ${atlas.height}, the manifest ${manifest.atlas.width} x ${manifest.atlas.height}`);
  }
  for (const [name, r] of Object.entries(atlas.rects)) {
    if (r.x + r.w > atlas.width || r.y + r.h > atlas.height) err(`atlas.rects.${name}`, 'lies outside the atlas page');
  }
  const images = Object.keys(atlas.rects);

  // Effects: each file present, valid, and matching its manifest entry.
  const seenIds = new Set<string>();
  manifest.effects.forEach((e, i) => {
    const at = `manifest.effects[${i}]`;
    if (seenIds.has(e.id)) err(`${at}.id`, `"${e.id}" is listed twice`);
    seenIds.add(e.id);
    const raw = input.files[e.file];
    if (raw === undefined) { err(`${at}.file`, `"${e.file}" is missing from the export`); return; }
    const r = checkEffect(raw, { palette: input.palette, images });
    for (const p of r.problems) problems.push({ ...p, path: `${e.file}: ${p.path}` });
    if (r.upgradedFrom !== undefined) err(`${at}.file`, `"${e.file}" is version ${r.upgradedFrom}, not ${FORMAT_VERSION}: export it again`);
    if (!r.effect) return;
    if (r.effect.id !== e.id) err(`${at}.id`, `the manifest says "${e.id}", the file says "${r.effect.id}"`);
    if (r.effect.name !== e.name) err(`${at}.name`, `the manifest says "${e.name}", the file says "${r.effect.name}"`);
    if (e.version !== r.effect.version) err(`${at}.version`, `the manifest says ${e.version}, the file is version ${r.effect.version}`);
    if (!e.events.length) warn(`${at}.events`, `"${e.name}" answers no game event, so the game cannot start it by name`);
    effects.set(e.id, r.effect);
  });

  // Events: well formed, one effect each, and the lookup agrees with the effects' own lists.
  const owner = new Map<string, string>();
  manifest.effects.forEach((e, i) => {
    for (const ev of e.events) {
      if (!EVENT_NAME.test(ev)) err(`manifest.effects[${i}].events`, `"${ev}" is not an event name: lowercase words joined by dots, such as "rifle.shot"`);
      const before = owner.get(ev);
      if (before && before !== e.id) err(`manifest.effects[${i}].events`, `"${ev}" is answered by both "${before}" and "${e.id}": one event plays one effect`);
      owner.set(ev, e.id);
    }
  });
  for (const [ev, id] of Object.entries(manifest.events)) {
    if (owner.get(ev) !== id) err(`manifest.events.${ev}`, `points at "${id}", but that effect does not list "${ev}"`);
  }
  for (const [ev, id] of owner) if (manifest.events[ev] !== id) err('manifest.events', `"${ev}" (answered by "${id}") is missing from the event list`);

  return { ok: !problems.some((p) => p.level === 'error'), problems, manifest, effects };
}

/** Event lists per effect, checked: names well formed, and one effect per event. Used by the editor before exporting. */
export function checkEvents(events: Record<string, readonly string[]>): string[] {
  const out: string[] = [];
  const owner = new Map<string, string>();
  for (const [id, list] of Object.entries(events)) {
    for (const ev of list) {
      if (!EVENT_NAME.test(ev)) out.push(`${id}: "${ev}" is not an event name: lowercase words joined by dots, such as "rifle.shot"`);
      const before = owner.get(ev);
      if (before && before !== id) out.push(`"${ev}" is answered by both "${before}" and "${id}": one event plays one effect`);
      owner.set(ev, id);
    }
  }
  return out;
}
