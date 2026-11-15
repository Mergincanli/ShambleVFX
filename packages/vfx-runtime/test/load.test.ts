import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import { EXPORT_FORMAT, EXPORT_VERSION, FORMAT_VERSION, newEffect, newSpriteLayer } from '@shamble/vfx-format';
import type { ExportManifest } from '@shamble/vfx-format';
import { loadExport, VfxLoadError } from '../src/index';

/** An export folder in memory, served by a fake fetch. The atlas "image" is a fake bitmap of the given size. */
function folder(edit: (files: Record<string, unknown>) => void = () => {}, bitmap = { width: 64, height: 32 }) {
  const shot = newEffect('shot', 'Shot');
  shot.layers = [newSpriteLayer('flash', 'Flash', 'flash.png')];
  const manifest: ExportManifest = {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, name: 'Test', effectVersion: FORMAT_VERSION, palette: 'palette.json',
    atlas: { image: 'atlas.png', map: 'atlas.json', width: 64, height: 32 },
    effects: [{ id: 'shot', name: 'Shot', version: FORMAT_VERSION, file: 'effects/shot.vfx.json', events: ['rifle.shot', 'rifle.shot.far'] }],
    events: { 'rifle.shot': 'shot', 'rifle.shot.far': 'shot' },
  };
  const files: Record<string, unknown> = {
    'manifest.json': manifest,
    'palette.json': paletteJson,
    'atlas.json': { width: 64, height: 32, rects: { 'flash.png': { x: 2, y: 2, w: 28, h: 28 }, __white: { x: 34, y: 2, w: 8, h: 8 } } },
    'atlas.png': 'PNG',
    'effects/shot.vfx.json': shot,
  };
  edit(files);
  const fetch = async (url: string) => {
    const path = url.replace('https://game.test/vfx/', '');
    if (!(path in files)) return new Response('missing', { status: 404 });
    const body = files[path];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body));
  };
  return { fetch, decodeImage: async () => bitmap as unknown as ImageBitmap };
}

const URL_ = 'https://game.test/vfx';
const manifestOf = (f: Record<string, unknown>) => f['manifest.json'] as Record<string, unknown>;

describe('loading an export folder', () => {
  it('reads the effects and finds them by game event', async () => {
    const fx = await loadExport(URL_, folder());
    expect(fx.events).toEqual(['rifle.shot', 'rifle.shot.far']);
    expect(fx.effectFor('rifle.shot')?.id).toBe('shot');
    expect(fx.effectFor('tank.shot')).toBeUndefined();
    expect(fx.lookup('shot')?.name).toBe('Shot');
    expect(fx.atlas.rects['flash.png']).toEqual({ x: 2, y: 2, w: 28, h: 28 });
    expect(fx.palette.factions.allies.roles.team!.hex).toBe('#1F6FF0');
  });

  it('says in plain words when the folder is not an export', async () => {
    await expect(loadExport(URL_, folder((f) => { f['manifest.json'] = { hello: 1 }; }))).rejects.toThrow(
      'https://game.test/vfx/manifest.json is not a Shamble VFX export: export the project again with the editor',
    );
  });

  it('asks for a newer runtime for a newer export or newer effects', async () => {
    await expect(loadExport(URL_, folder((f) => { manifestOf(f).version = 2; }))).rejects.toThrow(
      'this export is version 2, and this runtime reads export version 1: update the runtime',
    );
    await expect(loadExport(URL_, folder((f) => { manifestOf(f).effectVersion = FORMAT_VERSION + 1; }))).rejects.toThrow(
      `the effects in this export are version ${FORMAT_VERSION + 1}, and this runtime plays version ${FORMAT_VERSION}: update the runtime`,
    );
  });

  it('asks for a new export for older effects', async () => {
    await expect(loadExport(URL_, folder((f) => { manifestOf(f).effectVersion = 2; }))).rejects.toThrow(
      `the effects in this export are version 2, and this runtime plays version ${FORMAT_VERSION}: export them again with the editor, which upgrades old effects`,
    );
    await expect(loadExport(URL_, folder((f) => { (f['effects/shot.vfx.json'] as Record<string, unknown>).version = 2; }))).rejects.toThrow(
      `https://game.test/vfx/effects/shot.vfx.json is version 2, not ${FORMAT_VERSION}: export it again`,
    );
  });

  it('plays version 5, and refuses an export made with version 4 effects in plain words', async () => {
    expect(FORMAT_VERSION).toBe(5);
    expect((await loadExport(URL_, folder())).manifest.effectVersion).toBe(5);
    await expect(loadExport(URL_, folder((f) => { manifestOf(f).effectVersion = 4; }))).rejects.toThrow(
      'the effects in this export are version 4, and this runtime plays version 5: export them again with the editor, which upgrades old effects',
    );
    await expect(loadExport(URL_, folder((f) => { (f['effects/shot.vfx.json'] as Record<string, unknown>).version = 4; }))).rejects.toThrow(
      'https://game.test/vfx/effects/shot.vfx.json is version 4, not 5: export it again',
    );
  });

  it('names a missing file, a wrong atlas and an event with no effect', async () => {
    await expect(loadExport(URL_, folder((f) => { delete f['effects/shot.vfx.json']; }))).rejects.toThrow(
      'could not read https://game.test/vfx/effects/shot.vfx.json (the server said 404)',
    );
    await expect(loadExport(URL_, folder(undefined, { width: 32, height: 32 }))).rejects.toThrow(
      'https://game.test/vfx/atlas.png is 32 x 32, but the atlas map says 64 x 32',
    );
    await expect(loadExport(URL_, folder((f) => { (manifestOf(f).events as Record<string, string>)['tank.shot'] = 'tank'; }))).rejects.toThrow(
      'the event "tank.shot" plays "tank", which is not in the export',
    );
  });

  it('throws VfxLoadError, so the game can tell a bad export from other failures', async () => {
    await expect(loadExport(URL_, folder((f) => { delete f['palette.json']; }))).rejects.toBeInstanceOf(VfxLoadError);
  });
});
