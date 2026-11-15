/**
 * Export and import, in Node. The editor's local server loads this file through Vite (ssrLoadModule), and so do the
 * command-line tools, so it can use the format package and the atlas packer as they are.
 *
 * An export folder holds manifest.json, palette.json, atlas.png, atlas.json, effects/<id>.vfx.json and editor.json
 * (see packages/vfx-format/src/validate/export.ts). Pixels are copied exactly (pngjs), not through a canvas.
 * project.json and editor.json are read and written by the one reader and writer in ../src/io/project-file.ts.
 */
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';
import paletteJson from '@shamble/vfx-format/palette.json';
import { FORMAT_VERSION, checkPalette, upgradePalette } from '@shamble/vfx-format';
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { checkEffect, checkEvents, checkExport, EXPORT_FORMAT, EXPORT_VERSION, problemLines } from '@shamble/vfx-format/validate';
import type { AtlasMap, ExportManifest } from '@shamble/vfx-format/validate';
import { atlasLayout, composeAtlas, cutFromAtlas, DOT_BLOCK, WHITE_BLOCK } from '../src/atlas/pack';
import type { Pixels } from '../src/atlas/pack';
import { defaultBudgets } from '../src/cost/budgets';
import { toEditorJson, toProjectJson, readEditorJson, readProjectJson } from '../src/io/project-file';
import type { ProjectFile } from '../src/io/project-file';

/** The built-in palette, for a project without its own palette.json. */
const builtInPalette = paletteJson as Palette;
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

/** The real path of a folder that may not exist yet: its nearest existing parent's real path, plus the rest. */
async function realPath(p: string): Promise<string> {
  const abs = resolve(p);
  try {
    return await fs.realpath(abs);
  } catch {
    const parent = dirname(abs);
    return parent === abs ? abs : join(await realPath(parent), basename(abs));
  }
}

const within = (child: string, parent: string) => {
  const r = relative(parent, child);
  return r === '' || (!isAbsolute(r) && r.split(/[\\/]/)[0] !== '..');
};

/**
 * Why `outDir` may not take an export, or undefined when it may: it must be outside the project, and be missing, empty,
 * or an earlier export (so a wrong path never deletes a project or other files).
 */
export async function exportFolderProblem(projectDir: string, outDir: string): Promise<string | undefined> {
  const [proj, out] = await Promise.all([realPath(projectDir), realPath(outDir)]);
  if (within(out, proj) || within(proj, out)) return `the export folder (${out}) must be outside the project folder (${proj})`;
  let entries: string[];
  try {
    entries = await fs.readdir(out);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return `${out} cannot be used: ${(e as Error).message}`;
  }
  if (!entries.length) return undefined;
  const m = (await readJsonFile(join(out, 'manifest.json')).catch(() => null)) as { format?: unknown } | null;
  if (!m || m.format !== EXPORT_FORMAT) return `${out} already holds files and is not an earlier export: pick a new or empty folder`;
  return undefined;
}

/**
 * Export a project folder into `outDir`. Checks first: on any error nothing is written. An earlier export there is
 * replaced as a whole, never merged into, so an effect deleted from the project does not stay in the export; the new
 * export is written next to it first and swapped in, so a failed export keeps the old one.
 */
export async function exportProject(projectDir: string, outDir: string): Promise<ExportReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const where = await exportFolderProblem(projectDir, outDir);
  if (where) return { ok: false, errors: [where], warnings, files: [], effects: 0, events: 0 };
  // project.json through the one reader (version 1 reads as version 2). A missing or broken one gives the defaults, as
  // before; a newer one stops the export.
  const read = readProjectJson(await readJsonFile(join(projectDir, 'project.json')).catch(() => undefined));
  if (!read.ok && read.kind === 'version') return { ok: false, errors: [read.error], warnings, files: [], effects: 0, events: 0 };
  const meta: ProjectFile = read.ok ? read.project : { budgets: defaultBudgets(), other: {} };
  const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : 'Shamble VFX export';
  const imageFiles = await listFiles(join(projectDir, 'images'), '.png');
  // The project's own colours when it has them, else the built-in palette. The export carries the one it used.
  let palette = builtInPalette;
  const own = await readJsonFile(join(projectDir, 'palette.json')).catch((e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? undefined : e));
  if (own instanceof Error) errors.push(`palette.json: is not readable JSON (${own.message})`);
  else if (own !== undefined) {
    const upgraded = upgradePalette(own);
    const wrong = checkPalette(upgraded);
    if (wrong.length) errors.push(...wrong.map((w) => `palette.json: ${w}`));
    else palette = upgraded;
  }

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
  for (const { fx } of effects) events[fx.id] = meta.events && Object.hasOwn(meta.events, fx.id) ? [...meta.events[fx.id]!] : [];
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
  // editor.json, version 2: the palette profile's name, the preview scenes and the budgets (of the exported effects).
  const editor = toEditorJson(meta, effects.map(({ fx }) => fx.id));

  // Write: a fresh folder every time.
  const files: [string, string | Buffer][] = [
    ['manifest.json', toJson(manifest)],
    ['palette.json', toJson(palette)],
    ['atlas.json', toJson(atlasMap)],
    ['atlas.png', PNG.sync.write(atlasPng, { colorType: 6 })],
    ['editor.json', toJson(editor)],
    ...effects.map(({ fx, text }) => [`effects/${fx.id}.vfx.json`, text] as [string, string]),
  ];
  const out = resolve(outDir);
  const tag = randomBytes(6).toString('hex');
  const fresh = join(dirname(out), `.${basename(out)}.new-${tag}`);
  const old = join(dirname(out), `.${basename(out)}.old-${tag}`);
  try {
    await fs.mkdir(join(fresh, 'effects'), { recursive: true });
    for (const [path, body] of files) await fs.writeFile(join(fresh, path), body);
    const hadOne = await fs.stat(out).then(() => true, () => false);
    if (hadOne) await fs.rename(out, old);
    await fs.rename(fresh, out);
    if (hadOne) await fs.rm(old, { recursive: true, force: true });
  } catch (e) {
    await fs.rm(fresh, { recursive: true, force: true });
    return { ok: false, errors: [`could not write the export: ${(e as Error).message}`], warnings, files: [], effects: 0, events: 0 };
  }

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
  const pal = upgradePalette(await readJsonFile(join(dir, manifest?.palette ?? 'palette.json')).catch(() => builtInPalette));
  const check = checkExport({ manifest, atlas, files, palette: pal });
  return { manifest, atlas: atlas as AtlasMap | undefined, files, texts, check, palette: pal };
}

export interface ImportReport {
  ok: boolean;
  errors: string[];
  effects: number;
  images: number;
}

/**
 * Import an export folder into an empty project folder: the effect files as they are, each image cut back out of the
 * atlas, the events, and (from editor.json) the preview scenes, the budgets and the palette profile's name. editor.json
 * may be version 2 or the older one with no version (its budgets become the project level, switched off). The new
 * project's project.json is version 2. The white block and the dot are not images.
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
  const read = readEditorJson(await readJsonFile(join(exportDir, 'editor.json')).catch(() => undefined));
  if (!read.ok) return { ok: false, errors: [read.error], effects: 0, images: 0 };
  const notes = read.notes;
  await fs.mkdir(join(projectDir, 'effects'), { recursive: true });
  await fs.mkdir(join(projectDir, 'images'), { recursive: true });
  for (const e of ex.manifest.effects) await fs.writeFile(join(projectDir, 'effects', `${e.id}.vfx.json`), ex.texts[e.file]!);
  let images = 0;
  for (const [img, r] of Object.entries(ex.atlas.rects)) {
    if (img === WHITE_BLOCK || img === DOT_BLOCK) continue;
    // The checker refuses other names already; never write outside images/ all the same.
    if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}\.png$/.test(img) || img.includes('..')) continue;
    const out = new PNG({ width: r.w, height: r.h, colorType: 6 });
    out.data = Buffer.from(cutFromAtlas({ width: page.width, height: page.height, data: page.data }, r));
    await fs.writeFile(join(projectDir, 'images', img), PNG.sync.write(out, { colorType: 6 }));
    images++;
  }
  const project: ProjectFile = {
    name: name ?? ex.manifest.name,
    ...(notes.paletteProfile !== undefined ? { paletteProfile: notes.paletteProfile } : {}),
    events: Object.fromEntries(ex.manifest.effects.map((e) => [e.id, e.events])),
    ...(notes.preview ? { preview: notes.preview } : {}),
    budgets: notes.budgets,
    other: {},
  };
  await fs.writeFile(join(projectDir, 'project.json'), toJson(toProjectJson(project)));
  // The export's colours become the project's own palette.json.
  await fs.writeFile(join(projectDir, 'palette.json'), toJson(ex.palette));
  return { ok: true, errors: [], effects: ex.manifest.effects.length, images };
}
