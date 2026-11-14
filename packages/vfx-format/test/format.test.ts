import { describe, expect, it } from 'vitest';
import paletteJson from '../palette/palette.json';
import { FACTION_IDS, FORMAT_VERSION, checkPalette, newEffect, newProjectileLayer, newSpriteLayer, resolveRole, roleNames } from '../src/index';
import type { EffectFile, Palette } from '../src/index';
import { checkEffect, migrate, problemLines } from '../src/validate/index';

const palette = paletteJson as Palette;
const images = ['flash.png', 'streak.png'];

function goodEffect(): EffectFile {
  const fx = newEffect('test_shot', 'Test shot');
  const shell = newProjectileLayer('shell', 'Shell');
  const streak = { ...newSpriteLayer('streak', 'Streak', 'streak.png'), at: { layer: 'shell' }, facing: 'path' as const };
  delete (streak as { durationMs?: number }).durationMs;
  const flash = { ...newSpriteLayer('flash', 'Flash', 'flash.png'), flipbook: { cols: 2, rows: 2, frames: 4, loop: false } };
  delete (flash as { durationMs?: number }).durationMs;
  const land = { ...newSpriteLayer('land', 'Landing', 'flash.png'), start: { arrivalOf: 'shell', ms: 0 }, tint: { mode: 'multiply' as const, role: 'main' } };
  fx.layers = [shell, streak, flash, land];
  return fx;
}

function messages(input: unknown, opts = { palette, images }): string[] {
  const r = checkEffect(input, opts);
  return r.ok ? [] : problemLines(r.problems);
}

describe('palette', () => {
  it('is consistent', () => {
    expect(checkPalette(palette)).toEqual([]);
  });
  it("holds Mustafa's team colours and the Art lead's glow colours", () => {
    expect(resolveRole(palette, 'team', 'soviets')).toBe('#D41414');
    expect(resolveRole(palette, 'team', 'allies')).toBe('#1F6FF0');
    expect(resolveRole(palette, 'team', 'empire')).toBe('#890089');
    expect(resolveRole(palette, 'glow', 'soviets')).toBe('#FF2E63');
    expect(resolveRole(palette, 'glow', 'allies')).toBe('#8AE0FF');
    expect(resolveRole(palette, 'glow', 'empire')).toBe('#C24BFF');
  });
  it('keeps heat the same for every faction, and fire is never red', () => {
    for (const f of FACTION_IDS) expect(resolveRole(palette, 'heat.1', f)).toBe('#F47A1C');
    expect(roleNames(palette)).toEqual(expect.arrayContaining(['heat.1', 'heat.2', 'heat.3', 'heat.4', 'ink', 'team', 'glow']));
    expect(resolveRole(palette, 'nope', 'soviets')).toBeUndefined();
  });
  it('tags every value with whose it is', () => {
    const all = [...Object.values(palette.roles), ...FACTION_IDS.flatMap((f) => Object.values(palette.factions[f].roles))];
    for (const e of all) expect(['mustafa', 'art-lead', 'board-v7', 'derived', 'assumed']).toContain(e.from);
  });
});

describe('checkEffect', () => {
  it('accepts a good effect', () => {
    const r = checkEffect(goodEffect(), { palette, images });
    expect(problemLines(r.problems)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('names missing fields, unknown fields and wrong types', () => {
    const fx = goodEffect() as unknown as Record<string, any>;
    delete fx.layers[1].pivot;
    fx.layers[2].sizem = [1, 1];
    fx.controls.size = 'big';
    const m = messages(fx);
    expect(m).toContain('layers[1].pivot: is missing');
    expect(m).toContain('layers[2]: has unknown field: "sizem"');
    expect(m).toContain('controls.size: should be a number');
  });

  it('refuses an unknown layer type and bad ids', () => {
    const fx = goodEffect() as unknown as Record<string, any>;
    fx.layers[0].type = 'laser';
    fx.id = 'Bad Id';
    const m = messages(fx).join('\n');
    expect(m).toMatch(/layers\[0\]\.type: must be "sprite" or "projectile"|layers\[0\]: has an unknown "type"/);
    expect(m).toMatch(/^id: use lowercase letters/m);
  });

  it('refuses sizes of 0 and flipbooks with more frames than cells', () => {
    const fx = goodEffect() as unknown as Record<string, any>;
    fx.layers[2].sizeM = [0, 1];
    fx.layers[2].flipbook.frames = 5;
    const m = messages(fx);
    expect(m).toContain('layers[2].sizeM[0]: must be more than 0');
    expect(m).toContain('layers[2].flipbook.frames: has more frames than cells in its grid');
  });

  it('refuses hex colours anywhere, even in a name', () => {
    const fx = goodEffect() as unknown as Record<string, any>;
    fx.layers[1].name = 'Streak #D41414';
    fx.layers[3].tint.role = '#1F6FF0';
    const r = checkEffect(fx, { palette, images });
    expect(r.ok).toBe(false);
    const kinds = r.problems.map((p) => `${p.kind} ${p.path}`);
    expect(kinds).toContain('colour layers[1].name');
    expect(kinds).toContain('colour layers[3].tint.role');
  });

  it('names unknown roles, and allows "main" only in a tint', () => {
    const fx = goodEffect();
    (fx.layers[3] as any).tint = { mode: 'multiply', role: 'heat.9' };
    fx.controls.colour = 'main';
    const m = messages(fx);
    expect(m).toContain('layers[3].tint.role: "heat.9" is not a role in the palette');
    expect(m).toContain('controls.colour: "main" is not a role in the palette');
  });

  it('names missing images', () => {
    expect(messages(goodEffect(), { palette, images: ['streak.png'] })).toEqual([
      'layers[2].image: "flash.png" is missing from the images folder',
      'layers[3].image: "flash.png" is missing from the images folder',
    ]);
  });

  it('checks links between layers', () => {
    const fx = goodEffect();
    (fx.layers[1] as any).at = { layer: 'flash' };
    (fx.layers[3] as any).start = { arrivalOf: 'ghost', ms: 0 };
    const m = messages(fx);
    expect(m).toContain('layers[1].at.layer: rides "flash", which is not a projectile. Only projectiles can be ridden');
    expect(m).toContain('layers[3].start.arrivalOf: starts when "ghost" lands, but there is no such layer');
  });

  it('finds start times that wait on each other in a circle', () => {
    const fx = goodEffect();
    const a = newProjectileLayer('a', 'A');
    const b = newProjectileLayer('b', 'B');
    a.start = { arrivalOf: 'b', ms: 0 };
    b.start = { arrivalOf: 'a', ms: 0 };
    fx.layers.push(a, b);
    expect(messages(fx).join('\n')).toMatch(/start times wait on each other in a circle: (a -> b -> a|b -> a -> b)/);
  });

  it('asks for a duration where none can be worked out', () => {
    const fx = goodEffect();
    const s = newSpriteLayer('lonely', 'Lonely', 'flash.png');
    delete s.durationMs;
    const loop = { ...newSpriteLayer('looping', 'Looping', 'flash.png'), flipbook: { cols: 2, rows: 1, frames: 2, loop: true } };
    delete (loop as { durationMs?: number }).durationMs;
    fx.layers.push(s, loop);
    const m = messages(fx);
    expect(m).toContain('layers[4]: "Lonely" needs a duration (durationMs), or must ride a projectile');
    expect(m).toContain('layers[5]: "Looping" loops its flipbook, so it needs a duration (durationMs)');
  });

  it('finds duplicate layer ids', () => {
    const fx = goodEffect();
    fx.layers[2]!.id = 'streak';
    expect(messages(fx)).toContain('layers[2].id: "streak" is used by more than one layer');
  });

  it('refuses things that are not effect files', () => {
    expect(messages(null)[0]).toMatch(/expected a JSON object/);
    expect(messages({ format: 'other' })[0]).toMatch(/is not a Shamble VFX effect file/);
  });
});

describe('versions and upgrades', () => {
  it('refuses a file from a newer version and says so', () => {
    const fx = { ...goodEffect(), version: FORMAT_VERSION + 1 };
    expect(messages(fx)[0]).toMatch(/newer Shamble VFX \(file version 2\); this one reads up to version 1/);
  });

  it('leaves a current file unchanged and does not touch the input', () => {
    const fx = goodEffect();
    const before = JSON.stringify(fx);
    const r = migrate(fx);
    expect(r.ok && r.steps).toBe(0);
    expect(r.ok && JSON.stringify(r.doc)).toBe(before);
    expect(JSON.stringify(fx)).toBe(before);
  });

  it('runs upgrade steps in order (tested with a made-up version 0)', () => {
    const v0 = { format: 'shamble-vfx', version: 0, id: 'old', title: 'Old effect', controls: { size: 1, intensity: 1, duration: 1, colour: 'heat.2' }, layers: [] };
    const fake = { 0: (d: Record<string, unknown>) => { const { title, ...rest } = d; return { ...rest, name: title, version: 1 }; } };
    const r = checkEffect(v0, { palette, images, migrations: fake });
    expect(r.ok).toBe(true);
    expect(r.upgradedFrom).toBe(0);
    expect(r.ok && r.effect.name).toBe('Old effect');
    expect(messages(v0)[0]).toMatch(/there is no upgrade from version 0 to 1/);
  });
});
