import { describe, expect, it } from 'vitest';
import paletteJson from '../palette/palette.json';
import { FACTION_IDS, FORMAT_VERSION, PALETTE_VERSION, checkPalette, newEffect, newProjectileLayer, newSpriteLayer, resolveGradient, resolveRole, roleNames, upgradePalette } from '../src/index';
import type { BedShape, EffectFile, Layer, Palette, ShapeLayer, SmokeShape, SoundWord, WordLayer } from '../src/index';
import { BED_BAND_STOPS_WARN, MIGRATIONS, checkEffect, migrate, problemLines } from '../src/validate/index';
import { newBurstLayer, newShapeLayer, newWordLayer } from '../src/index';

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
  return problemLines(checkEffect(input, opts).problems);
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
    expect(m).toContain('layers[4]: "Lonely" needs a length: durationMs, or untilPhaseEnd, or it must ride a projectile');
    expect(m).toContain('layers[5]: "Looping" needs a length: durationMs, or untilPhaseEnd, or it must ride a projectile');
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

describe('version 1 -> current', () => {
  const v1 = {
    format: 'shamble-vfx', version: 1, id: 'old_shot', name: 'Old shot', controls: { size: 1, intensity: 1, duration: 1, colour: 'glow' },
    layers: [
      { id: 'bullet', name: 'Bullet', type: 'projectile', start: { ms: 0 }, timing: { mode: 'smooth' }, from: { input: 'origin', offset: [0, 0, 0] }, to: { input: 'target', offset: [0, 0, 0] }, speedMps: 800, stretch: 1, spinDegPerS: 0 },
      { id: 'flash', name: 'Flash', type: 'sprite', start: { ms: 0 }, timing: { mode: 'steps', perSecond: 24 }, at: { input: 'origin', offset: [0, 0, 0] }, image: 'flash.png', pivot: [0.16, 0.5], sizeM: [1.2, 1.2], tint: { mode: 'keep' }, facing: 'path', durationMs: 160 },
    ],
  };
  it('upgrades speedMps to a flight by speed, adds a straight arc, normal blend, empty phases and all tiers', () => {
    const r = checkEffect(v1, { palette, images });
    expect(problemLines(r.problems)).toEqual([]);
    expect(r.upgradedFrom).toBe(1);
    const fx = r.effect!;
    expect(fx.version).toBe(FORMAT_VERSION);
    expect(fx.phases).toEqual({ windupMs: 0, peakMs: 0, fadeMs: 0 });
    expect(fx.layers[0]).toMatchObject({ type: 'projectile', flight: { mode: 'speed', mps: 800 }, arcM: 0 });
    expect('speedMps' in fx.layers[0]!).toBe(false);
    expect(fx.layers[1]).toMatchObject({ type: 'sprite', blend: 'normal', facing: 'path', tiers: ['low', 'medium', 'high'] });
    expect('tiers' in fx.layers[0]!).toBe(false);
  });
  it('gives back the upgraded file even when it has problems, so an old file never reaches the runtime as it was', () => {
    const r = checkEffect(v1, { palette, images: ['other.png'] });
    expect(r.ok).toBe(false);
    expect((r.upgraded as { version: number }).version).toBe(FORMAT_VERSION);
    expect(r.effect?.version).toBe(FORMAT_VERSION);
  });
});

describe('version 2 rules', () => {
  it('accepts the new layer kinds with their defaults', () => {
    const fx = newEffect('kinds', 'Kinds');
    fx.phases = { windupMs: 100, peakMs: 400, fadeMs: 600 };
    for (const k of ['shards', 'flash', 'cloud', 'smoke', 'ring', 'dots', 'scorch', 'lines', 'glow', 'band', 'beads', 'flames', 'bed'] as const) fx.layers.push(newShapeLayer(`s_${k}`, k, k));
    fx.layers.push(newBurstLayer('b', 'Bits'), newWordLayer('w', 'Word'));
    expect(messages(fx)).toEqual([]);
  });
  it('warns about characters we have not drawn yet, and still accepts the file', () => {
    const fx = newEffect('w', 'W');
    const w = newWordLayer('w', 'Word');
    // Every letter from A to Z is drawn now (J, Q, V, X and Y too): YAY and quake get no warning.
    w.words = [{ text: 'KA-BLAM' }, { text: 'YAY' }, { text: 'BAM #2' }, { text: 'quake' }];
    fx.layers.push(w);
    const r = checkEffect(fx, { palette, images });
    expect(r.ok).toBe(true);
    expect(problemLines(r.problems)).toEqual([
      'warning: layers[0].words[0].text: "KA-BLAM": "-" is not drawn yet and will be left out (drawn: ABCDEFGHIJKLMNOPQRSTUVWXYZ!)',
      'warning: layers[0].words[2].text: "BAM #2": "#", "2" are not drawn yet and will be left out (drawn: ABCDEFGHIJKLMNOPQRSTUVWXYZ!)',
    ]);
  });
  it('checks places and lengths: multiply lies on the ground, words face the screen, a trail rides a projectile, one length only', () => {
    const fx = newEffect('p', 'P');
    const scorch = newShapeLayer('scorch', 'Scorch', 'scorch');
    scorch.facing = 'camera';
    const word = { ...newWordLayer('word', 'Word'), facing: 'upright' as const };
    const trail = newShapeLayer('trail', 'Trail', 'trail');
    const both = { ...newShapeLayer('both', 'Both', 'shards'), untilPhaseEnd: 'fade' as const };
    fx.layers.push(scorch, word, trail, both);
    const m = messages(fx);
    expect(m).toContain('layers[0].blend: "Scorch": multiply works on what lies under it, so the layer must lie on the ground (facing "ground")');
    expect(m).toContain('layers[1].facing: "Word": a word always faces the screen (facing "camera")');
    expect(m).toContain('layers[2].at: "Trail": a trail follows a projectile, so it must ride one');
    expect(m).toContain('layers[3]: "Both" has both durationMs and untilPhaseEnd: keep one');
  });
  it('checks every colour role inside shapes, bursts and words', () => {
    const fx = newEffect('r', 'R');
    const sh = newShapeLayer('s', 'S', 'shards');
    (sh.shape as { tones: { role: string; scale: number }[] }).tones[1]!.role = 'heat.9';
    const w = newWordLayer('w', 'W');
    w.colours.back = 'nope';
    fx.layers.push(sh, w);
    const m = messages(fx);
    expect(m).toContain('layers[0].shape.tones[1].role: "heat.9" is not a role in the palette');
    expect(m).toContain('layers[1].colours.back: "nope" is not a role in the palette');
  });
  it('warns when a projectile flies for a phase that has no length', () => {
    const fx = newEffect('f', 'F');
    const p = newProjectileLayer('p', 'P');
    p.flight = { mode: 'phase', phase: 'windup' };
    fx.layers.push(p);
    expect(messages(fx)).toEqual(['warning: layers[0].flight: "P" flies for the windup phase, which has no length, so it lands at once']);
  });
});

describe('version 2 -> 3: quality tiers', () => {
  it('gives every visible layer all three tiers and leaves projectiles alone', () => {
    const v2 = { ...goodEffect(), version: 2 } as Record<string, unknown>;
    v2.layers = (v2.layers as Record<string, unknown>[]).map((l) => { const { tiers, ...rest } = l as Record<string, unknown>; void tiers; return rest; });
    const r = checkEffect(v2, { palette, images });
    expect(problemLines(r.problems)).toEqual([]);
    expect(r.upgradedFrom).toBe(2);
    for (const l of r.effect!.layers) {
      if (l.type === 'projectile') expect('tiers' in l).toBe(false);
      else expect(l.tiers).toEqual(['low', 'medium', 'high']);
    }
  });
  it('refuses an empty or doubled tier list', () => {
    const fx = newEffect('t', 'T');
    fx.layers.push({ ...newShapeLayer('a', 'A', 'glow'), tiers: [] }, { ...newShapeLayer('b', 'B', 'glow'), tiers: ['low', 'low'] });
    const m = messages(fx);
    expect(m).toContain('layers[0].tiers: needs at least one tier');
    expect(m).toContain('layers[1].tiers: names a tier twice');
  });
  it('warns when nothing shows in the Low tier', () => {
    const fx = newEffect('t', 'T');
    fx.layers.push({ ...newShapeLayer('a', 'A', 'glow'), tiers: ['medium', 'high'] });
    const r = checkEffect(fx, { palette, images });
    expect(r.ok).toBe(true);
    expect(problemLines(r.problems)).toEqual(['warning: layers: nothing shows in the Low tier: Low drops extras, but the effect should still read']);
  });
});

describe('versions and upgrades', () => {
  it('refuses a file from a newer version and says so', () => {
    const fx = { ...goodEffect(), version: FORMAT_VERSION + 1 };
    expect(messages(fx)[0]).toMatch(new RegExp(`newer Shamble VFX \\(file version ${FORMAT_VERSION + 1}\\); this one reads up to version ${FORMAT_VERSION}`));
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
    const fake = { 0: (d: Record<string, unknown>) => { const { title, ...rest } = d; return { ...rest, name: title, version: 1 }; }, 1: MIGRATIONS[1]!, 2: MIGRATIONS[2]!, 3: MIGRATIONS[3]!, 4: MIGRATIONS[4]! };
    const r = checkEffect(v0, { palette, images, migrations: fake });
    expect(problemLines(r.problems)).toEqual([]);
    expect(r.upgradedFrom).toBe(0);
    expect(r.effect?.name).toBe('Old effect');
    expect(messages(v0)[0]).toMatch(/there is no upgrade from version 0 to 1/);
  });
});

describe('version 3 -> 4, and gradients', () => {
  it('upgrades a version 3 file by its number only', () => {
    const v3 = { ...goodEffect(), version: 3 };
    expect(MIGRATIONS[3]!(structuredClone(v3))).toEqual({ ...goodEffect(), version: 4 });
    const r = checkEffect(v3, { palette, images });
    expect(r.upgradedFrom).toBe(3);
    // It has no word layer, so the step to version 5 changes its number only too.
    expect(r.effect).toEqual({ ...goodEffect(), version: FORMAT_VERSION });
  });

  it('reads a version 1 palette as version 2, with no gradients', () => {
    const v1 = { ...palette, version: 1 } as Record<string, unknown>;
    delete v1.gradients;
    const up = upgradePalette(v1);
    expect(up.version).toBe(PALETTE_VERSION);
    expect(up.gradients).toEqual({});
    expect(checkPalette(up)).toEqual([]);
  });

  it('checks gradients in the palette', () => {
    const p: Palette = { ...palette, gradients: {
      'glow.ramp': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'glow.hot' }, { at: 0.5, role: 'glow' }, { at: 1, role: 'glow', alpha: 0 }] },
      'Bad Name': { kind: 'banded', from: 'mustafa', stops: [{ at: 0, hex: '#FFFFFF' }] },
      'two.ways': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'ink', hex: '#000000' }, { at: 2, role: 'no.such', alpha: 3 }] },
    } };
    expect(checkPalette(p)).toEqual([
      'gradient Bad Name: the name must be lowercase words joined by dots, such as glow.ramp',
      'gradient Bad Name: needs at least two stops',
      'gradient two.ways, stop 1: give either a role or a hex',
      'gradient two.ways, stop 2: "at" must be between 0 and 1',
      'gradient two.ways, stop 2: alpha must be between 0 and 1',
      'gradient two.ways, stop 2: "no.such" is not a role in the palette',
    ]);
    expect(resolveGradient(p, 'glow.ramp', 'allies')).toEqual({ kind: 'smooth', stops: [
      { at: 0, hex: resolveRole(palette, 'glow.hot', 'allies'), alpha: 1 }, { at: 0.5, hex: resolveRole(palette, 'glow', 'allies'), alpha: 1 },
      { at: 1, hex: resolveRole(palette, 'glow', 'allies'), alpha: 0 }] });
    expect(resolveGradient(p, 'nothing', 'allies')).toBeUndefined();
  });

  it('names a palette part that is missing, empty or not an object, and never throws on one', () => {
    /** The built-in palette with one part changed. */
    const broken = (edit: (p: Record<string, any>) => void) => {
      const p = structuredClone(palette) as unknown as Record<string, any>;
      edit(p);
      return checkPalette(p as unknown as Palette);
    };
    expect(broken((p) => { delete p.factions.allies.roles; })).toEqual(['faction allies has no "roles"']);
    expect(broken((p) => { p.factions.allies.roles = null; })).toEqual(['faction allies has no "roles"']);
    expect(broken((p) => { p.factions.allies = 5; })).toEqual(['faction allies is not a faction: it needs "name" and "roles"']);
    expect(broken((p) => { delete p.factions.empire; })).toEqual(['faction empire is missing']);
    expect(broken((p) => { p.factions.soviets.roles.team = null; })).toEqual(['soviets.team: is not a colour (it needs "hex")']);
    expect(broken((p) => { p.roles['heat.1'] = null; })).toEqual(['heat.1: is not a colour (it needs "hex")']);
    expect(broken((p) => { p.roles.ink = 'black'; })).toEqual(['ink: is not a colour (it needs "hex")']);
    expect(broken((p) => { p.gradients = { 'glow.ramp': null }; })).toEqual(['gradient glow.ramp: is not a gradient (it needs "kind" and "stops")']);
    expect(broken((p) => { p.gradients = { 'glow.ramp': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'glow' }, null] } }; }))
      .toEqual(['gradient glow.ramp, stop 2: is not a stop (it needs "at" and a role or a hex)']);
    expect(broken((p) => { p.gradients = 'glow.ramp'; })).toEqual(['"gradients" must hold named gradients (an object)']);
    expect(broken((p) => { p.factions = []; })).toEqual(['not a palette: it needs "factions" and "roles"']);
    expect(broken((p) => { p.roles = 'ink'; })).toEqual(['not a palette: it needs "factions" and "roles"']);
    expect(checkPalette(null as unknown as Palette)).toEqual(['not a palette: it needs "factions" and "roles"']);
  });

  it('checks an effect against a broken palette without throwing: its roles are unknown, a stop that is not a stop is skipped', () => {
    const fx = goodEffect();
    const glow = newShapeLayer('glow', 'Glow', 'glow');
    fx.layers = [...fx.layers, { ...glow, shape: { ...glow.shape, gradient: 'glow.ramp' } } as Layer];
    const p = structuredClone(palette) as unknown as Record<string, any>;
    delete p.roles;
    p.factions = null;
    p.gradients = { 'glow.ramp': { kind: 'smooth', from: 'mustafa', stops: [null, { at: 1, role: 'glow' }] } };
    const m = messages(fx, { palette: p as unknown as Palette, images });
    expect(m).toContain('controls.colour: "heat.2" is not a role in the palette');
    expect(m.some((x) => x.includes('"glow" is not a role in the palette'))).toBe(true);
    expect(roleNames(p as unknown as Palette)).toEqual([]);
  });

  it('names a glow gradient the palette does not have', () => {
    const fx = newEffect('g', 'G');
    const glow = newShapeLayer('glow', 'Glow', 'glow');
    fx.layers = [{ ...glow, shape: { ...(glow.shape as object), gradient: 'glow.ramp' } } as typeof glow];
    expect(messages(fx)).toContain('layers[0].shape.gradient: "glow.ramp" is not a gradient in the palette');
    const p: Palette = { ...palette, gradients: { 'glow.ramp': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'glow' }, { at: 1, role: 'glow', alpha: 0 }] } } };
    expect(checkEffect(fx, { palette: p, images }).problems.filter((x) => x.kind === 'gradient')).toEqual([]);
  });
});

describe('version 4 -> 5: words with chances, gradients on smoke, the bed and bursts', () => {
  /** A version 4 file as it was saved: words as plain texts. */
  const v4 = () => {
    const fx = newEffect('w4', 'Words, version 4') as unknown as Record<string, unknown>;
    const w = { ...newWordLayer('word', 'Sound word'), words: ['BOOM', 'BANG'] } as unknown as Record<string, unknown>;
    fx.version = 4;
    fx.layers = [newShapeLayer('star', 'Star', 'shards'), w];
    return fx;
  };

  it('turns each word into an object with its text, and changes nothing else', () => {
    const old = v4();
    const r = checkEffect(old, { palette, images });
    expect(problemLines(r.problems)).toEqual([]);
    expect(r.upgradedFrom).toBe(4);
    expect((r.effect!.layers[1] as WordLayer).words).toEqual([{ text: 'BOOM' }, { text: 'BANG' }]);
    // The upgraded file is the old one, field for field and in the same order, with the new number and word objects.
    const want = JSON.parse(JSON.stringify(old));
    want.version = 5;
    want.layers[1].words = [{ text: 'BOOM' }, { text: 'BANG' }];
    expect(JSON.stringify(r.upgraded)).toBe(JSON.stringify(want));
    expect(JSON.stringify(old)).toBe(JSON.stringify(v4())); // the input is not changed
  });

  it('upgrades the words of a version 2 file all the way', () => {
    const v2 = { ...v4(), version: 2 } as Record<string, unknown>;
    v2.layers = (v2.layers as Record<string, unknown>[]).map((l) => { const { tiers, ...rest } = l; void tiers; return rest; });
    const r = checkEffect(v2, { palette, images });
    expect(problemLines(r.problems)).toEqual([]);
    expect((r.effect!.layers[1] as WordLayer).words).toEqual([{ text: 'BOOM' }, { text: 'BANG' }]);
  });

  it('leaves what is not a word as it was, for the checker to name', () => {
    const old = v4();
    ((old.layers as Record<string, unknown>[])[1]!).words = ['BOOM', 7];
    const r = checkEffect(old, { palette, images });
    expect(r.ok).toBe(false);
    expect(problemLines(r.problems)).toEqual(['layers[1].words[1]: should be an object']);
    const m = migrate({ format: 'shamble-vfx', version: 4, layers: 'none' });
    expect(m.ok && m.doc.layers).toBe('none');
  });

  it('takes a chance from 0 to 100 %, and nothing else in a word', () => {
    const fx = newEffect('c', 'C');
    fx.layers = [{ ...newWordLayer('w', 'W'), words: [{ text: 'BOOM', chance: 0 }, { text: 'BAM', chance: 12.5 }, { text: 'POW', chance: 87.5 }] }];
    expect(messages(fx)).toEqual(['warning: layers[0].words[0].chance: "BOOM" has a 0 % chance, so it never shows']);
    const bad = structuredClone(fx) as unknown as { layers: { words: Record<string, unknown>[] }[] };
    bad.layers[0]!.words = [{ text: 'BOOM', chance: 101 }, { text: 'BAM', chance: -1 }, { text: 'POW', odds: 3 }, { chance: 5 }];
    expect(messages(bad)).toEqual([
      'layers[0].words[0].chance: must be 100 % or less',
      'layers[0].words[1].chance: must be 0 % or more',
      'layers[0].words[2]: has unknown field: "odds"',
      'layers[0].words[3].text: is missing',
    ]);
  });

  const withWords = (words: SoundWord[]) => {
    const fx = newEffect('c', 'C');
    fx.layers = [{ ...newWordLayer('w', 'Sound word'), words }];
    return messages(fx);
  };

  it('warns when the chances add up to more than 100 %, and names the words left with nothing', () => {
    expect(withWords([{ text: 'BOOM', chance: 70 }, { text: 'BAM', chance: 50 }, { text: 'POW' }])).toEqual([
      'warning: layers[0].words: "Sound word": the chances add up to 120 %: they are scaled down to 100 %',
      'warning: layers[0].words[2]: "POW" has no chance of its own, and the other words\' chances already reach 100 %, so it never shows',
    ]);
  });

  it('never says that chances over 100 % add up to 100 %: a total over by a hair gets the decimals that show it', () => {
    const over = (total: string) => `warning: layers[0].words: "Sound word": the chances add up to ${total} %: they are scaled down to 100 %`;
    // Thirds typed with three decimals, and other totals that two decimals would round to 100.
    expect(withWords([{ text: 'BOOM', chance: 33.334 }, { text: 'BAM', chance: 33.334 }, { text: 'POW', chance: 33.334 }])).toEqual([over('100.002')]);
    expect(withWords([{ text: 'BOOM', chance: 50.004 }, { text: 'BAM', chance: 50 }])).toEqual([over('100.004')]);
    expect(withWords([{ text: 'BOOM', chance: 50.001 }, { text: 'BAM', chance: 50 }, { text: 'POW' }])).toEqual([
      over('100.001'),
      'warning: layers[0].words[2]: "POW" has no chance of its own, and the other words\' chances already reach 100 %, so it never shows',
    ]);
    // Just past the rounding allowed (a billionth): still more than 100.
    const hair = withWords([{ text: 'BOOM', chance: 50.000000002 }, { text: 'BAM', chance: 50 }]);
    expect(hair).toHaveLength(1);
    expect(Number(/add up to ([\d.]+) %/.exec(hair[0]!)![1])).toBeGreaterThan(100);
    // Ordinary totals keep two decimals at most.
    expect(withWords([{ text: 'BOOM', chance: 50.01 }, { text: 'BAM', chance: 50 }])).toEqual([over('100.01')]);
    expect(withWords([{ text: 'BOOM', chance: 50.35 }, { text: 'BAM', chance: 49.67 }])).toEqual([over('100.02')]);
    expect(withWords([{ text: 'BOOM', chance: 66.666 }, { text: 'BAM', chance: 66.666 }])).toEqual([over('133.33')]);
  });

  it('names a word left with nothing when the others reach exactly 100 %', () => {
    expect(withWords([{ text: 'BOOM', chance: 60 }, { text: 'BAM', chance: 40 }, { text: 'POW' }])).toEqual([
      'warning: layers[0].words[2]: "POW" has no chance of its own, and the other words\' chances already reach 100 %, so it never shows',
    ]);
  });

  it('says nothing when the chances work as typed', () => {
    expect(withWords([{ text: 'BOOM' }, { text: 'BAM' }])).toEqual([]); // equal shares
    expect(withWords([{ text: 'BOOM', chance: 50 }, { text: 'BAM' }, { text: 'POW' }])).toEqual([]); // the rest shared
    expect(withWords([{ text: 'BOOM', chance: 30 }, { text: 'BAM', chance: 20 }])).toEqual([]); // half the plays show no word
    expect(withWords([{ text: 'BOOM', chance: 33.3 }, { text: 'BAM', chance: 33.3 }, { text: 'POW', chance: 33.4 }])).toEqual([]); // 100 %, rounded
  });

  it('names a gradient the palette does not have, on smoke, on the bed and on a burst', () => {
    const fx = newEffect('g', 'G');
    const smoke = newShapeLayer('smoke', 'Smoke', 'smoke');
    const bed = newShapeLayer('bed', 'Bed', 'bed');
    const burst = newBurstLayer('sparks', 'Sparks');
    fx.layers = [
      { ...smoke, shape: { ...(smoke.shape as SmokeShape), gradient: 'smoke.thin' } },
      { ...bed, shape: { ...(bed.shape as BedShape), gradient: 'fire.bed' } },
      { ...burst, gradient: 'sparks.cool' },
    ];
    expect(messages(fx)).toEqual([
      'layers[0].shape.gradient: "smoke.thin" is not a gradient in the palette',
      'layers[1].shape.gradient: "fire.bed" is not a gradient in the palette',
      'layers[2].gradient: "sparks.cool" is not a gradient in the palette',
    ]);
    const stops = [{ at: 0, role: 'heat.1' }, { at: 1, role: 'heat.dark', alpha: 0 }];
    const p: Palette = { ...palette, gradients: { 'smoke.thin': { kind: 'smooth', from: 'mustafa', stops }, 'fire.bed': { kind: 'banded', from: 'mustafa', stops }, 'sparks.cool': { kind: 'smooth', from: 'mustafa', stops } } };
    expect(problemLines(checkEffect(fx, { palette: p, images }).problems)).toEqual([]);
  });

  it('refuses a badly written gradient name', () => {
    const fx = newEffect('g', 'G');
    fx.layers = [{ ...newBurstLayer('sparks', 'Sparks'), gradient: 'Sparks Cool' }];
    expect(messages(fx)).toEqual(['layers[0].gradient: must be a gradient name such as glow.ramp']);
  });

  it("warns when a fire's bed layers use different gradients", () => {
    const stops = [{ at: 0, role: 'heat.dark' }, { at: 1, role: 'heat.3' }];
    const p: Palette = { ...palette, gradients: { 'fire.bed': { kind: 'banded', from: 'mustafa', stops }, 'fire.blue': { kind: 'banded', from: 'mustafa', stops } } };
    const fire = (lumps?: string, detail?: string, withDetail = true) => {
      const fx = newEffect('f', 'F');
      const bed = newShapeLayer('bed', 'Bed', 'bed');
      const sp = bed.shape as BedShape;
      fx.layers = [{ ...bed, shape: { ...sp, ...(lumps ? { gradient: lumps } : {}) } }];
      if (withDetail) fx.layers.push({ ...bed, id: 'bed_detail', name: 'Bed detail', shape: { ...sp, part: 'detail', ...(detail ? { gradient: detail } : {}) } });
      return problemLines(checkEffect(fx, { palette: p, images }).problems);
    };
    const why = 'the detail\'s halftone would not match the bands (their colours, or where they meet). Give both bed layers the same gradient';
    expect(fire('fire.bed', undefined)).toEqual([`warning: layers[1].shape.gradient: "Bed detail" and "Bed" use different gradients (none and "fire.bed"): ${why}`]);
    expect(fire(undefined, 'fire.bed')).toEqual([`warning: layers[1].shape.gradient: "Bed detail" and "Bed" use different gradients ("fire.bed" and none): ${why}`]);
    expect(fire('fire.bed', 'fire.blue')).toEqual([`warning: layers[1].shape.gradient: "Bed detail" and "Bed" use different gradients ("fire.blue" and "fire.bed"): ${why}`]);
    expect(fire('fire.bed', 'fire.bed')).toEqual([]);
    expect(fire(undefined, undefined)).toEqual([]);
    expect(fire('fire.bed', undefined, false)).toEqual([]); // no detail: nothing to sit where the bands meet
  });

  it("warns when a fire's bed uses a banded gradient with more than 8 stops: each stop is a band of lumps", () => {
    expect(BED_BAND_STOPS_WARN).toBe(8);
    const gradient = (n: number, kind: 'banded' | 'smooth') => ({ kind, from: 'mustafa' as const, stops: Array.from({ length: n }, (_, k) => ({ at: k / n, role: 'heat.1' })) });
    const lines = (g: ReturnType<typeof gradient>, layers: Layer[]) => {
      const fx = newEffect('f', 'F');
      fx.layers = layers;
      return problemLines(checkEffect(fx, { palette: { ...palette, gradients: { 'fire.many': g } }, images }).problems);
    };
    const bed = newShapeLayer('bed', 'Bed', 'bed');
    const lumps: Layer = { ...bed, shape: { ...(bed.shape as BedShape), gradient: 'fire.many' } };
    const detail: Layer = { ...bed, id: 'bed_detail', name: 'Bed detail', shape: { ...(bed.shape as BedShape), part: 'detail', gradient: 'fire.many' } };
    const many = (name: string, i: number, n: number) => `warning: layers[${i}].shape.gradient: "${name}": the gradient "fire.many" is banded and has ${n} stops. On a fire's bed, each stop is a band of lumps, so the triangles grow with every stop. Keep it to 8 stops or fewer`;
    expect(lines(gradient(8, 'banded'), [lumps])).toEqual([]);
    expect(lines(gradient(9, 'banded'), [lumps])).toEqual([many('Bed', 0, 9)]);
    // Both parts draw one band per stop, so both are named.
    expect(lines(gradient(16, 'banded'), [lumps, detail])).toEqual([many('Bed', 0, 16), many('Bed detail', 1, 16)]);
    // A smooth gradient keeps the tones' bands, whatever its stops; a glow draws rings, not bands of lumps.
    expect(lines(gradient(16, 'smooth'), [lumps, detail])).toEqual([]);
    const glow = newShapeLayer('glow', 'Glow', 'glow');
    expect(lines(gradient(16, 'banded'), [{ ...glow, shape: { ...glow.shape, gradient: 'fire.many' } as ShapeLayer['shape'] }])).toEqual([]);
  });
});
