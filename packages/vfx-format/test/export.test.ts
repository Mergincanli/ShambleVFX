import { describe, expect, it } from 'vitest';
import paletteJson from '../palette/palette.json';
import { EXPORT_FORMAT, EXPORT_VERSION, FORMAT_VERSION, newEffect, newSpriteLayer } from '../src/index';
import type { AtlasMap, EffectFile, ExportManifest, Palette } from '../src/index';
import { checkEvents, checkExport, problemLines } from '../src/validate/index';

const palette = paletteJson as Palette;

function effect(id: string, image = 'flash.png'): EffectFile {
  const fx = newEffect(id, `Effect ${id}`);
  fx.layers = [{ ...newSpriteLayer('flash', 'Flash', image), tint: { mode: 'multiply', role: 'heat.1' } }];
  return fx;
}

/** A small, valid export: two effects, three events, an atlas with one image and the runtime's two blocks. */
function goodExport() {
  const a = effect('shot_a'), b = effect('shot_b');
  const atlas: AtlasMap = { width: 64, height: 32, rects: { 'flash.png': { x: 2, y: 2, w: 28, h: 28 }, __white: { x: 34, y: 2, w: 8, h: 8 }, __dot: { x: 46, y: 2, w: 16, h: 16 } } };
  const manifest: ExportManifest = {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, name: 'Test', effectVersion: FORMAT_VERSION, palette: 'palette.json',
    atlas: { image: 'atlas.png', map: 'atlas.json', width: 64, height: 32 },
    effects: [
      { id: 'shot_a', name: a.name, version: FORMAT_VERSION, file: 'effects/shot_a.vfx.json', events: ['rifle.shot', 'rifle.shot.silenced'] },
      { id: 'shot_b', name: b.name, version: FORMAT_VERSION, file: 'effects/shot_b.vfx.json', events: ['tank.shot'] },
    ],
    events: { 'rifle.shot': 'shot_a', 'rifle.shot.silenced': 'shot_a', 'tank.shot': 'shot_b' },
  };
  const files: Record<string, unknown> = { 'effects/shot_a.vfx.json': a, 'effects/shot_b.vfx.json': b };
  return { manifest, atlas, files, palette };
}

const lines = (input: Parameters<typeof checkExport>[0]) => problemLines(checkExport(input).problems);

describe('the export checker', () => {
  it('passes a good export and reads every effect', () => {
    const r = checkExport(goodExport());
    expect(problemLines(r.problems)).toEqual([]);
    expect(r.ok).toBe(true);
    expect([...r.effects.keys()]).toEqual(['shot_a', 'shot_b']);
  });

  it('names a missing image, with the file it is in', () => {
    const ex = goodExport();
    ex.files['effects/shot_b.vfx.json'] = effect('shot_b', 'smoke.png');
    expect(lines(ex)).toContain('effects/shot_b.vfx.json: layers[0].image: "smoke.png" is missing from the images folder');
    expect(checkExport(ex).ok).toBe(false);
  });

  it('names an unknown colour role', () => {
    const ex = goodExport();
    const fx = effect('shot_a');
    fx.layers[0] = { ...fx.layers[0]!, tint: { mode: 'multiply', role: 'team.purple' } } as EffectFile['layers'][number];
    ex.files['effects/shot_a.vfx.json'] = fx;
    expect(lines(ex)).toContain('effects/shot_a.vfx.json: layers[0].tint.role: "team.purple" is not a role in the palette');
  });

  it('names schema errors', () => {
    const ex = goodExport();
    const fx = effect('shot_a') as unknown as { layers: Record<string, unknown>[] };
    fx.layers[0]!.durationMs = -5;
    delete fx.layers[0]!.sizeM;
    ex.files['effects/shot_a.vfx.json'] = fx;
    const r = checkExport(ex);
    expect(r.ok).toBe(false);
    expect(r.problems.filter((p) => p.kind === 'schema').map((p) => p.path)).toEqual(
      expect.arrayContaining(['effects/shot_a.vfx.json: layers[0].durationMs', 'effects/shot_a.vfx.json: layers[0].sizeM']),
    );
  });

  it('names a file the manifest lists but the folder lacks', () => {
    const ex = goodExport();
    delete ex.files['effects/shot_b.vfx.json'];
    expect(lines(ex)).toContain('manifest.effects[1].file: "effects/shot_b.vfx.json" is missing from the export');
  });

  it('refuses an effect in an older version: the export must hold the current one', () => {
    const ex = goodExport();
    const old = { ...effect('shot_a'), version: 2 } as Record<string, unknown>;
    (old.layers as Record<string, unknown>[]).forEach((l) => delete l.tiers);
    ex.files['effects/shot_a.vfx.json'] = old;
    expect(lines(ex)).toContain(`manifest.effects[0].file: "effects/shot_a.vfx.json" is version 2, not ${FORMAT_VERSION}: export it again`);
  });

  it('refuses an export of another effect version', () => {
    const ex = goodExport();
    ex.manifest.effectVersion = FORMAT_VERSION + 1;
    expect(lines(ex)[0]).toMatch(/the effects are version 4; this Shamble VFX reads version 3/);
  });

  it('checks the manifest against the effect files', () => {
    const ex = goodExport();
    ex.manifest.effects[1]!.name = 'Another name';
    ex.manifest.effects[1]!.id = 'shot_c';
    ex.manifest.events['tank.shot'] = 'shot_c';
    const l = lines(ex);
    expect(l).toContain('manifest.effects[1].id: the manifest says "shot_c", the file says "shot_b"');
    expect(l).toContain('manifest.effects[1].name: the manifest says "Another name", the file says "Effect shot_b"');
  });

  it('one event plays one effect', () => {
    const ex = goodExport();
    ex.manifest.effects[1]!.events.push('rifle.shot');
    expect(lines(ex)).toContain('manifest.effects[1].events: "rifle.shot" is answered by both "shot_a" and "shot_b": one event plays one effect');
  });

  it('keeps the event lookup and the effect lists in step', () => {
    const ex = goodExport();
    ex.manifest.events['grenade.land'] = 'shot_b';
    delete ex.manifest.events['tank.shot'];
    const l = lines(ex);
    expect(l).toContain('manifest.events.grenade.land: points at "shot_b", but that effect does not list "grenade.land"');
    expect(l).toContain('manifest.events: "tank.shot" (answered by "shot_b") is missing from the event list');
  });

  it('names a badly written event', () => {
    const ex = goodExport();
    ex.manifest.effects[0]!.events = ['Rifle Shot'];
    ex.manifest.events = { 'Rifle Shot': 'shot_a', 'tank.shot': 'shot_b' };
    expect(lines(ex)).toContain('manifest.effects[0].events: "Rifle Shot" is not an event name: lowercase words joined by dots, such as "rifle.shot"');
  });

  it('warns about an effect that answers no event', () => {
    const ex = goodExport();
    ex.manifest.effects[1]!.events = [];
    delete ex.manifest.events['tank.shot'];
    const r = checkExport(ex);
    expect(r.ok).toBe(true);
    expect(problemLines(r.problems)).toEqual(['warning: manifest.effects[1].events: "Effect shot_b" answers no game event, so the game cannot start it by name']);
  });

  it('checks the atlas map', () => {
    const ex = goodExport();
    ex.atlas = { ...ex.atlas, height: 16, rects: { ...ex.atlas.rects } };
    const l = lines(ex);
    expect(l).toContain('atlas: the map says 64 x 16, the manifest 64 x 32');
    expect(l).toContain('atlas.rects.flash.png: lies outside the atlas page');
  });

  it('names a broken manifest instead of failing', () => {
    expect(lines({ ...goodExport(), manifest: { format: 'something-else' } })[0]).toMatch(/^manifest\.format: /);
    expect(lines({ ...goodExport(), manifest: undefined })[0]).toMatch(/^manifest\.\(file\): /);
  });
});

describe('event lists before exporting', () => {
  it('passes good lists', () => {
    expect(checkEvents({ a: ['rifle.shot'], b: ['tank.shot', 'tank.shell.land'] })).toEqual([]);
  });
  it('names doubles and bad names', () => {
    expect(checkEvents({ a: ['rifle.shot'], b: ['rifle.shot', 'Tank-Shot'] })).toEqual([
      '"rifle.shot" is answered by both "a" and "b": one event plays one effect',
      'b: "Tank-Shot" is not an event name: lowercase words joined by dots, such as "rifle.shot"',
    ]);
  });
});
