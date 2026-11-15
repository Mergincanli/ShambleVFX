/**
 * Export and import, in Node. The editor's local server loads this file through Vite (ssrLoadModule), and so do the
 * command-line tools, so it can use the format package and the atlas packer as they are.
 *
 * An export folder holds manifest.json, palette.json, atlas.png, atlas.json, effects/<id>.vfx.json and editor.json
 * (see packages/vfx-format/src/validate/export.ts). Pixels are copied exactly (pngjs), not through a canvas.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import paletteJson from '@shamble/vfx-format/palette.json';
import { FORMAT_VERSION } from '@shamble/vfx-format';
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { checkEffect, checkEvents, checkExport, EXPORT_FORMAT, EXPORT_VERSION, problemLines } from '@shamble/vfx-format/validate';
import type { AtlasMap, ExportManifest } from '@shamble/vfx-format/validate';
import { atlasLayout, composeAtlas, cutFromAtlas, DOT_BLOCK, WHITE_BLOCK } from '../src/atlas/pack';
import type { Pixels } from '../src/atlas/pack';

const palette = paletteJson as Palette;
/** The project's own way of writing JSON (the editor writes the same). */
export const toJson = (v: unknown): string => JSON.stringify(v, null, 2) + '\n';

export interface ExportReport {
  ok: boolean;
  /** Errors: nothing was written. */
  errors: string[];
  warnings: string[];
  /** Files written, relative to the export folder. */
  files: string[];
  effects: number;
  events: number;
}

interface ProjectMeta {
  name?: string;
  events?: Record<string, string[]>;
  preview?: Record<string, unknown>;
  budgets?: Record<string, unknown>;
  [k: string]: unknown;
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function listFiles(dir: string, suffix: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(suffix)).sort();
  } catch {
    return [];
  }
}

/** Every image an effect names: sprite images and image pieces of bursts. */
export function imagesUsed(fx: EffectFile): string[] {
  const out = new Set<string>();
  for (const l of fx.layers) {
    if (l.type === 'sprite') out.add(l.image);
    if (l.type === 'burst' && l.look.kind === 'image') out.add(l.look.image);
  }
  return [...out];
}

/**
 * Export a project folder into `outDir`. Checks first: on any error nothing is written. The folder is replaced, never
 * merged into, so an effect deleted from the project does not stay in the export.
 */
export async function exportProject(projectDir: string, outDir: string): Promise<ExportReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = ((await readJsonFile(join(projectDir, 'project.json')).catch(() => ({}))) ?? {}) as ProjectMeta;
  const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : 'Shamble VFX export';
  const imageFiles = await listFiles(join(projectDir, 'images'), '.png');

  // Read and check every effect (upgraded to the current version).
  const effects: { file: string; fx: EffectFile; text: string }[] = [];
  for (const file of await listFiles(join(projectDir, 'effects'), '.vfx.json')) {
    let raw: unknown;
    try {
      raw = await readJsonFile(join(projectDir, 'effects', file));
    } catch (e) {
      errors.push(`effects/${file}: is not readable JSON (${(e as Error).message})`);
      continue;
    }
    const r = checkEffect(raw, { palette, images: imageFiles });
    for (const line of problemLines(r.problems.filter((p) => p.level === 'error'))) errors.push(`effects/${file}: ${line}`);
    for (const line of problemLines(r.problems.filter((p) => p.level === 'warning'))) warnings.push(`effects/${file}: ${line}`);
    if (!r.ok || !r.effect) continue;
    if (`${r.effect.id}.vfx.json` !== file) errors.push(`effects/${file}: the file name must be the effect's id ("${r.effect.id}.vfx.json")`);
    // A current file is exported as the project holds it; an older one as its upgraded copy.
    const data = r.upgradedFrom === undefined ? raw : r.upgraded;
    effects.push({ file, fx: r.effect, text: toJson(data) });
  }
  if (!effects.length && !errors.length) errors.push('the project has no effects to export');

  // Events: one effect each; every effect should answer at least one.
  const events: Record<string, string[]> = {};
  for (const { fx } of effects) events[fx.id] = (meta.events?.[fx.id] ?? []).filter((e) => typeof e === 'string');
  errors.push(...checkEvents(events));
  for (const { fx } of effects) if (!events[fx.id]!.length) warnings.push(`${fx.id}: answers no game event, so the game cannot start it by name`);
  if (errors.length) return { ok: false, errors, warnings, files: [], effects: 0, events: 0 };

  // The atlas: only the images the effects use, packed as the editor packs them, plus the white block and the dot.
  const used = [...new Set(effects.flatMap(({ fx }) => imagesUsed(fx)))].sort();
  for (const im of imageFiles) if (!used.includes(im)) warnings.push(`images/${im}: no effect uses it, so it is left out of the atlas`);
  const pixels = new Map<string, Pixels>();
  for (const im of used) {
    const png = PNG.sync.read(await fs.readFile(join(projectDir, 'images', im)));
    pixels.set(im, { width: png.width, height: png.height, data: png.data });
  }
  const layout = atlasLayout([...pixels].map(([n, p]) => ({ name: n, width: p.width, height: p.height })));
  const page = composeAtlas(layout, pixels);
  const atlasPng = new PNG({ width: layout.width, height: layout.height, colorType: 6 });
  atlasPng.data = Buffer.from(page.buffer, page.byteOffset, page.byteLength);
  const atlasMap: AtlasMap = { width: layout.width, height: layout.height, rects: layout.rects };

  const manifest: ExportManifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    name,
    effectVersion: FORMAT_VERSION,
    palette: 'palette.json',
    atlas: { image: 'atlas.png', map: 'atlas.json', width: layout.width, height: layout.height },
    effects: effects.map(({ fx }) => ({ id: fx.id, name: fx.name, version: fx.version, file: `effects/${fx.id}.vfx.json`, events: events[fx.id]! })),
    events: Object.fromEntries(effects.flatMap(({ fx }) => events[fx.id]!.map((ev) => [ev, fx.id] as const)).sort(([a], [b]) => a.localeCompare(b))),
  };
  const editor = { note: 'For the Shamble VFX editor only (preview scenes, budgets). The game ignores this file.', preview: meta.preview ?? {}, budgets: meta.budgets ?? {} };

  // Write: a fresh folder every time.
  const files: [string, string | Buffer][] = [
    ['manifest.json', toJson(manifest)],
    ['palette.json', toJson(paletteJson)],
    ['atlas.json', toJson(atlasMap)],
    ['atlas.png', PNG.sync.write(atlasPng, { colorType: 6 })],
    ['editor.json', toJson(editor)],
    ...effects.map(({ fx, text }) => [`effects/${fx.id}.vfx.json`, text] as [string, string]),
  ];
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(join(outDir, 'effects'), { recursive: true });
  for (const [path, body] of files) await fs.writeFile(join(outDir, path), body);

  // Read it back through the export checker: what the game will get must pass it.
  const back = await readExport(outDir);
  for (const line of problemLines(back.check.problems)) (line.startsWith('warning: ') ? warnings : errors).push(line.replace(/^warning: /, ''));
  return { ok: errors.length === 0, errors, warnings: [...new Set(warnings)], files: files.map(([p]) => p), effects: effects.length, events: Object.keys(manifest.events).length };
}

/** Read an export folder and check it. */
export async function readExport(dir: string) {
  const manifest = (await readJsonFile(join(dir, 'manifest.json')).catch(() => undefined)) as ExportManifest | undefined;
  const files: Record<string, unknown> = {};
  const texts: Record<string, string> = {};
  for (const e of manifest?.effects ?? []) {
    try {
      texts[e.file] = await fs.readFile(join(dir, e.file), 'utf8');
      files[e.file] = JSON.parse(texts[e.file]!);
    } catch { /* reported as missing */ }
  }
  const atlas = await readJsonFile(join(dir, manifest?.atlas?.map ?? 'atlas.json')).catch(() => undefined);
  const pal = (await readJsonFile(join(dir, manifest?.palette ?? 'palette.json')).catch(() => palette)) as Palette;
  const check = checkExport({ manifest, atlas, files, palette: pal });
  return { manifest, atlas: atlas as AtlasMap | undefined, files, texts, check };
}

export interface ImportReport {
  ok: boolean;
  errors: string[];
  effects: number;
  images: number;
}

/**
 * Import an export folder into an empty project folder: the effect files as they are, each image cut back out of the
 * atlas, the events, and (from editor.json) the preview scenes and budgets. The white block and the dot are not images.
 */
export async function importExport(exportDir: string, projectDir: string, name?: string): Promise<ImportReport> {
  const there = await fs.readdir(projectDir).catch(() => [] as string[]);
  if (there.length) return { ok: false, errors: [`${projectDir} is not empty: import into a new folder, so no project is overwritten`], effects: 0, images: 0 };
  const ex = await readExport(exportDir);
  const errors = problemLines(ex.check.problems.filter((p) => p.level === 'error'));
  if (!ex.check.ok || !ex.manifest || !ex.atlas) return { ok: false, errors: errors.length ? errors : ['the export could not be read'], effects: 0, images: 0 };
  const page = PNG.sync.read(await fs.readFile(join(exportDir, ex.manifest.atlas.image)));
  if (page.width !== ex.atlas.width || page.height !== ex.atlas.height) {
    return { ok: false, errors: [`atlas.png is ${page.width} x ${page.height}, the map says ${ex.atlas.width} x ${ex.atlas.height}`], effects: 0, images: 0 };
  }
  const editor = (await readJsonFile(join(exportDir, 'editor.json')).catch(() => ({}))) as { preview?: unknown; budgets?: unknown };
  await fs.mkdir(join(projectDir, 'effects'), { recursive: true });
  await fs.mkdir(join(projectDir, 'images'), { recursive: true });
  for (const e of ex.manifest.effects) await fs.writeFile(join(projectDir, 'effects', `${e.id}.vfx.json`), ex.texts[e.file]!);
  let images = 0;
  for (const [img, r] of Object.entries(ex.atlas.rects)) {
    if (img === WHITE_BLOCK || img === DOT_BLOCK) continue;
    const out = new PNG({ width: r.w, height: r.h, colorType: 6 });
    out.data = Buffer.from(cutFromAtlas({ width: page.width, height: page.height, data: page.data }, r));
    await fs.writeFile(join(projectDir, 'images', img), PNG.sync.write(out, { colorType: 6 }));
    images++;
  }
  const project = {
    format: 'shamble-vfx-project',
    version: 1,
    name: name ?? ex.manifest.name,
    events: Object.fromEntries(ex.manifest.effects.map((e) => [e.id, e.events])),
    ...(editor.preview && typeof editor.preview === 'object' ? { preview: editor.preview } : {}),
    ...(editor.budgets && typeof editor.budgets === 'object' ? { budgets: editor.budgets } : {}),
  };
  await fs.writeFile(join(projectDir, 'project.json'), toJson(project));
  return { ok: true, errors: [], effects: ex.manifest.effects.length, images };
}
