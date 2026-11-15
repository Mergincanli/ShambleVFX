/**
 * Loads an export folder (what the editor's Export button writes) for the game: the manifest, the palette, the atlas and
 * every effect file, with plain checks and plain-word errors. The full checker (with the schema) is in
 * "@shamble/vfx-format/validate" for the game's build; it stays out of the game itself.
 *
 *   const fx = await loadExport('/vfx/');            // the folder's URL
 *   vfx.palette = fx.palette;  vfx.setAtlas(fx.atlas);
 *   player.start(fx.effectFor('rifle.shot')!.id, { ... });   // then vfx.drawPlaying(player, now, fx.lookup)
 */
import { EXPORT_FORMAT, EXPORT_VERSION, FORMAT_ID, FORMAT_VERSION } from '@shamble/vfx-format';
import type { AtlasMap, EffectFile, ExportManifest, Palette } from '@shamble/vfx-format';
import type { Atlas } from './three/atlas';

/** A load that failed. The message says what is wrong in plain words. */
export class VfxLoadError extends Error {
  override name = 'VfxLoadError';
}

export interface LoadedExport {
  manifest: ExportManifest;
  palette: Palette;
  /** Give this to VfxRenderer.setAtlas. Its image keeps the file's exact pixels. */
  atlas: Atlas;
  /** The effects by id. */
  effects: ReadonlyMap<string, EffectFile>;
  /** The game event names, sorted. */
  events: readonly string[];
  /** The effect a game event plays, or undefined for an event no effect answers. */
  effectFor(event: string): EffectFile | undefined;
  /** Effects by id, for EffectPlayer and VfxRenderer.drawPlaying. */
  lookup(id: string): EffectFile | undefined;
}

export interface LoadOptions {
  /** Defaults to the browser's fetch. */
  fetch?: (url: string) => Promise<Response>;
  /** Turns the atlas file into an image. The default keeps the exact pixels: no premultiplying, no colour conversion. */
  decodeImage?: (blob: Blob) => Promise<ImageBitmap>;
}

const decodeExact = (blob: Blob) => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });

/** Load an export folder from its URL (relative URLs are read from the page's address). */
export async function loadExport(folderUrl: string | URL, opts: LoadOptions = {}): Promise<LoadedExport> {
  const get = opts.fetch ?? ((u: string) => fetch(u));
  const page = typeof location === 'undefined' ? undefined : location.href;
  const base = new URL(String(folderUrl).replace(/\/*$/, '/'), page);
  const url = (path: string) => new URL(path, base).href;
  const fetchOk = async (path: string): Promise<Response> => {
    let res: Response;
    try {
      res = await get(url(path));
    } catch (e) {
      throw new VfxLoadError(`could not read ${url(path)}: ${(e as Error).message}`);
    }
    if (!res.ok) throw new VfxLoadError(`could not read ${url(path)} (the server said ${res.status})`);
    return res;
  };
  const json = async (path: string): Promise<unknown> => {
    const res = await fetchOk(path);
    try {
      return await res.json();
    } catch {
      throw new VfxLoadError(`${url(path)} is not readable JSON`);
    }
  };

  // The manifest, and the version guard.
  const m = (await json('manifest.json')) as Partial<ExportManifest> | null;
  if (!m || typeof m !== 'object' || m.format !== EXPORT_FORMAT) {
    throw new VfxLoadError(`${url('manifest.json')} is not a Shamble VFX export: export the project again with the editor`);
  }
  if (typeof m.version !== 'number' || m.version > EXPORT_VERSION) {
    throw new VfxLoadError(`this export is version ${String(m.version)}, and this runtime reads export version ${EXPORT_VERSION}: update the runtime`);
  }
  if (typeof m.effectVersion !== 'number' || m.effectVersion !== FORMAT_VERSION) {
    const newer = typeof m.effectVersion === 'number' && m.effectVersion > FORMAT_VERSION;
    throw new VfxLoadError(
      `the effects in this export are version ${String(m.effectVersion)}, and this runtime plays version ${FORMAT_VERSION}: ` +
        (newer ? 'update the runtime' : 'export them again with the editor, which upgrades old effects'),
    );
  }
  if (!Array.isArray(m.effects) || !m.atlas || !m.events || typeof m.palette !== 'string') {
    throw new VfxLoadError(`${url('manifest.json')} is incomplete: run the export checker on this folder`);
  }
  const manifest = m as ExportManifest;

  // The palette, the effects and the atlas map, all at once.
  const [palette, map, ...files] = await Promise.all([
    json(manifest.palette) as Promise<Palette>,
    json(manifest.atlas.map) as Promise<AtlasMap>,
    ...manifest.effects.map((e) => json(e.file)),
  ]);
  const effects = new Map<string, EffectFile>();
  manifest.effects.forEach((e, i) => {
    const fx = files[i] as Partial<EffectFile> | null;
    if (!fx || fx.format !== FORMAT_ID) throw new VfxLoadError(`${url(e.file)} is not a Shamble VFX effect file`);
    if (fx.version !== FORMAT_VERSION) throw new VfxLoadError(`${url(e.file)} is version ${String(fx.version)}, not ${FORMAT_VERSION}: export it again`);
    if (fx.id !== e.id) throw new VfxLoadError(`${url(e.file)} holds the effect "${String(fx.id)}", but the manifest says "${e.id}"`);
    effects.set(e.id, fx as EffectFile);
  });
  if (!palette || typeof palette !== 'object' || !('roles' in palette)) throw new VfxLoadError(`${url(manifest.palette)} is not a palette`);
  if (!map || map.width !== manifest.atlas.width || map.height !== manifest.atlas.height || !map.rects) {
    throw new VfxLoadError(`${url(manifest.atlas.map)} does not match the manifest's atlas size`);
  }

  // The atlas page: exact pixels.
  const blob = await (await fetchOk(manifest.atlas.image)).blob();
  let image: ImageBitmap;
  try {
    image = await (opts.decodeImage ?? decodeExact)(blob);
  } catch (e) {
    throw new VfxLoadError(`${url(manifest.atlas.image)} is not a readable image: ${(e as Error).message}`);
  }
  if (image.width !== map.width || image.height !== map.height) {
    throw new VfxLoadError(`${url(manifest.atlas.image)} is ${image.width} x ${image.height}, but the atlas map says ${map.width} x ${map.height}`);
  }

  // Events: each must point at an effect in the export.
  for (const [event, id] of Object.entries(manifest.events)) {
    if (!effects.has(id)) throw new VfxLoadError(`the event "${event}" plays "${id}", which is not in the export`);
  }
  const events = Object.keys(manifest.events).sort();
  return {
    manifest,
    palette,
    atlas: { image, width: map.width, height: map.height, rects: map.rects },
    effects,
    events,
    effectFor: (event) => {
      const id = manifest.events[event];
      return id === undefined ? undefined : effects.get(id);
    },
    lookup: (id) => effects.get(id),
  };
}
