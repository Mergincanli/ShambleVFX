/**
 * Palette profiles, the rules with no disk: names, the file, the very same colours, swatches, the two default profiles
 * (with the bed gradient drawn by the real runtime against the Molotov's own bed), and which profile an import's colours
 * become.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import { FACTION_IDS, checkPalette, roleNames } from '@shamble/vfx-format';
import type { EffectFile, Palette, PaletteEntry, ShapeLayer, Vec3 } from '@shamble/vfx-format';
import { checkEffect } from '@shamble/vfx-format/validate';
import { BLEND_GROUPS, DrawSink, evaluate } from '@shamble/vfx-runtime';
import type { CameraBasis, EvalContext } from '@shamble/vfx-runtime';
import { GRADIENT_PRESETS } from '../src/doc/gradient-presets';
import {
  BUILT_IN_GRADIENTS_PROFILE, BUILT_IN_PROFILE, MOLOTOV_BED_TONES, PROFILE_FORMAT, bedToneStops, chooseImportProfile, defaultProfiles,
  importProfileName, nameBase, numberedName, profileName, profileNameProblem, profileSummary, profileSwatches, readProfileFile, sameColours,
  sameName, toProfileJson,
} from '../src/io/palette-profile';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const builtIn = paletteJson as Palette;
const fresh = (): Palette => structuredClone(builtIn);
const ch = String.fromCharCode;
const NAME_RULE = 'A palette profile name needs 1 to 64 characters, with no tabs or line breaks.';

describe('palette profile names', () => {
  it('are trimmed, and have 1 to 64 characters (characters, not code units)', () => {
    expect(profileName('  Soviets dark  ')).toBe('Soviets dark');
    expect(profileNameProblem('  Soviets dark  ')).toBeUndefined();
    expect(profileNameProblem('x'.repeat(64))).toBeUndefined();
    expect(profileNameProblem('x'.repeat(65))).toBe(NAME_RULE);
    // 64 smiling faces: 128 code units, 64 characters.
    expect(profileNameProblem(String.fromCodePoint(0x1f600).repeat(64))).toBeUndefined();
    expect(profileNameProblem('')).toBe(NAME_RULE);
    expect(profileNameProblem('   ')).toBe(NAME_RULE);
  });

  it('have no tabs, line breaks or other control characters', () => {
    for (const c of [9, 10, 13, 0, 0x1b, 0x7f, 0x85, 0x2028, 0x2029]) expect(profileNameProblem(`Soviets${ch(c)}dark`), `character ${c}`).toBe(NAME_RULE);
  });

  it('are unique without regard to upper and lower case, or to how an accent is written', () => {
    expect(profileNameProblem('soviets DARK', ['Built-in', 'Soviets dark'])).toBe('There is already a palette profile named "Soviets dark": pick another name.');
    expect(profileNameProblem('Soviets darker', ['Soviets dark'])).toBeUndefined();
    const composed = `Caf${ch(0xe9)}`, decomposed = `Cafe${ch(0x301)}`;
    expect(sameName(composed, decomposed)).toBe(true);
    expect(profileNameProblem(decomposed, [composed])).toBe(`There is already a palette profile named "${composed}": pick another name.`);
    // Kept in one form, so a name read back compares the same.
    expect(profileName(decomposed)).toBe(composed);
  });

  it('have a base and a number: "Soviets dark (2)", with room for the number within 64 characters', () => {
    expect(nameBase('Soviets dark (2)')).toBe('Soviets dark');
    expect(nameBase('Soviets dark')).toBe('Soviets dark');
    expect(nameBase('Soviets dark (0)')).toBe('Soviets dark (0)');
    expect(nameBase('Soviets dark (02)')).toBe('Soviets dark (02)');
    expect(nameBase('(2)')).toBe('(2)');
    expect(numberedName('Soviets dark', 3)).toBe('Soviets dark (3)');
    const long = numberedName('x'.repeat(64), 12);
    expect([...long].length).toBe(64);
    expect(long.endsWith('x (12)')).toBe(true);
    // The base is cut without leaving a space before the number.
    expect(numberedName(`${'y'.repeat(59)} zzzz`, 1)).toBe(`${'y'.repeat(59)} (1)`);
  });

  it('come from an export\'s free text: control characters become spaces, then it is trimmed and cut; nothing left is "Imported colours"', () => {
    expect(importProfileName(`  Soviets${ch(9)}dark${ch(10)} `)).toBe('Soviets dark');
    expect([...importProfileName('n'.repeat(80))].length).toBe(64);
    expect(importProfileName(` ${ch(10)} `)).toBe('Imported colours');
  });
});

describe('the profile file', () => {
  const v1Palette = () => { const p = fresh() as unknown as Record<string, unknown>; p.version = 1; delete p.gradients; return p; };

  it('reads a profile; an older palette inside is read as version 2', () => {
    const r = readProfileFile({ format: PROFILE_FORMAT, version: 1, name: '  Soviets dark ', palette: v1Palette() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe('Soviets dark');
    expect(r.palette.version).toBe(2);
    expect(r.palette.gradients).toEqual({});
    expect(checkPalette(r.palette)).toEqual([]);
  });

  it('reads a file with no version as version 1', () => {
    expect(readProfileFile({ format: PROFILE_FORMAT, name: 'Old', palette: fresh() }).ok).toBe(true);
  });

  it('names in plain words what is wrong: not a profile, a newer version (keeping its name), a bad version, the name, the colours', () => {
    const good = { format: PROFILE_FORMAT, version: 1, name: 'Soviets dark', palette: fresh() };
    expect(readProfileFile([1, 2])).toEqual({ ok: false, kind: 'not-a-profile', error: 'it is not a palette profile (it needs "format": "shamble-vfx-palette-profile")' });
    expect(readProfileFile({ ...good, format: 'shamble-vfx-project' }).ok).toBe(false);
    expect(readProfileFile({ ...good, version: 2 })).toEqual({ ok: false, kind: 'version', error: 'it is version 2, and this Shamble VFX reads version 1: update Shamble VFX to use it', name: 'Soviets dark' });
    expect(readProfileFile({ ...good, version: '1' })).toEqual({ ok: false, kind: 'broken', error: 'it says "version": "1", which is not a version number (write 1)', name: 'Soviets dark' });
    expect(readProfileFile({ ...good, name: undefined })).toEqual({ ok: false, kind: 'broken', error: 'it has no "name"' });
    expect(readProfileFile({ ...good, name: `a${ch(9)}b` })).toMatchObject({ ok: false, kind: 'broken', error: `its name: ${NAME_RULE}` });
    const bad = fresh();
    bad.roles.ink = { hex: 'black', from: 'mustafa' };
    expect(readProfileFile({ ...good, palette: bad })).toEqual({ ok: false, kind: 'broken', error: 'its colours: ink: "black" is not a #RRGGBB colour', name: 'Soviets dark' });
    expect(readProfileFile({ ...good, palette: 'none' })).toMatchObject({ ok: false, kind: 'broken', error: 'its colours: not a palette: it needs "factions" and "roles"' });
  });

  it('is written as format, version, name and palette, in that order', () => {
    const j = toProfileJson(' Soviets dark ', fresh());
    expect(Object.keys(j)).toEqual(['format', 'version', 'name', 'palette']);
    expect(j).toMatchObject({ format: PROFILE_FORMAT, version: 1, name: 'Soviets dark' });
  });
});

describe('the very same colours', () => {
  it('leave out "from", notes and "about", and compare hexes without regard to case', () => {
    const b = fresh();
    b.about = 'Another text';
    for (const e of [...Object.values(b.roles), ...FACTION_IDS.flatMap((f) => Object.values(b.factions[f].roles))] as PaletteEntry[]) { e.from = 'mustafa'; e.note = 'changed'; }
    b.roles['heat.1']!.hex = b.roles['heat.1']!.hex.toLowerCase();
    expect(sameColours(fresh(), b)).toBe(true);
  });

  it('differ when a hex, a faction (its name or its colours), a role or a gradient differs', () => {
    const a = fresh();
    a.gradients = { 'g.one': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'white' }, { at: 1, role: 'ink', alpha: 0.5 }] } };
    const changed = (edit: (p: Palette) => void) => { const p = structuredClone(a); edit(p); return sameColours(a, p); };
    expect(changed(() => undefined)).toBe(true);
    expect(changed((p) => { p.roles['heat.1']!.hex = '#F47A1D'; })).toBe(false);
    expect(changed((p) => { p.factions.allies.roles.team!.hex = '#000000'; })).toBe(false);
    expect(changed((p) => { p.factions.allies.name = 'Allied'; })).toBe(false);
    expect(changed((p) => { p.roles['heat.9'] = { hex: '#000000', from: 'mustafa' }; })).toBe(false);
    expect(changed((p) => { delete p.roles.dust; })).toBe(false);
    expect(changed((p) => { p.gradients['g.one']!.kind = 'banded'; })).toBe(false);
    expect(changed((p) => { p.gradients['g.one']!.stops[1]!.at = 0.9; })).toBe(false);
    expect(changed((p) => { p.gradients['g.one']!.stops[1]!.alpha = 0.6; })).toBe(false);
    expect(changed((p) => { p.gradients['g.one']!.stops[0] = { at: 0, hex: '#FFFFFF' }; })).toBe(false);
    expect(changed((p) => { p.gradients['g.two'] = structuredClone(p.gradients['g.one']!); })).toBe(false);
    // A stop with no alpha is solid; its gradient's from and note do not count.
    expect(changed((p) => { p.gradients['g.one']!.stops[0]!.alpha = 1; p.gradients['g.one']!.from = 'assumed'; p.gradients['g.one']!.note = 'x'; })).toBe(true);
  });
});

describe('swatches and the summary', () => {
  it('are each faction\'s team colour, then the first shared colours, eight in all', () => {
    expect(profileSwatches(builtIn)).toEqual([
      { role: 'team', hex: '#D41414', faction: 'soviets' }, { role: 'team', hex: '#1F6FF0', faction: 'allies' }, { role: 'team', hex: '#890089', faction: 'empire' },
      { role: 'heat.1', hex: '#F47A1C' }, { role: 'heat.2', hex: '#FFB02E' }, { role: 'heat.3', hex: '#FFE27A' }, { role: 'heat.4', hex: '#FFF4D6' }, { role: 'heat.dark', hex: '#B85207' },
    ]);
  });

  it('take a faction\'s first colour when it has no team colour, and show what there is', () => {
    const p = fresh();
    for (const f of FACTION_IDS) p.factions[f].roles = { glow: { hex: '#123456', from: 'mustafa' } };
    p.roles = { ink: { hex: '#000000', from: 'mustafa' } };
    expect(profileSwatches(p)).toEqual([
      { role: 'glow', hex: '#123456', faction: 'soviets' }, { role: 'glow', hex: '#123456', faction: 'allies' }, { role: 'glow', hex: '#123456', faction: 'empire' },
      { role: 'ink', hex: '#000000' },
    ]);
  });

  it('a summary has the id, the name, when it changed, the swatches and how many gradients', () => {
    const s = profileSummary('soviets-dark', 'Soviets dark', new Date(Date.UTC(2026, 10, 15, 21, 54, 19)), defaultProfiles(builtIn)[1]!.palette);
    expect(s).toEqual({ id: 'soviets-dark', name: 'Soviets dark', changed: '2026-11-15T21:54:19.000Z', swatches: profileSwatches(builtIn), gradientCount: GRADIENT_PRESETS.length + 3 });
  });
});

describe('the default profiles', () => {
  const [plain, withGradients] = defaultProfiles(builtIn);
  const onDisk = JSON.parse(readFileSync(join(repo, 'packages', 'vfx-format', 'palette', 'palette.json'), 'utf8')) as Palette;

  it('"Built-in" is the built-in palette as it is', () => {
    expect(plain!.name).toBe(BUILT_IN_PROFILE);
    expect(plain!.palette).toEqual(onDisk);
    expect(JSON.stringify(plain!.palette)).toBe(JSON.stringify(onDisk));
  });

  it('"Built-in with gradients" has the very same colours, and gradients made only of built-in roles (no hex values)', () => {
    expect(withGradients!.name).toBe(BUILT_IN_GRADIENTS_PROFILE);
    const p = withGradients!.palette;
    expect({ ...p, gradients: {} }).toEqual({ ...onDisk, gradients: {} });
    expect(checkPalette(p)).toEqual([]);
    const roles = new Set(roleNames(onDisk));
    for (const [name, g] of Object.entries(p.gradients)) {
      expect(g.from, name).toBe('assumed');
      for (const s of g.stops) {
        expect(s.hex, `${name} has a hex stop`).toBeUndefined();
        expect(roles.has(s.role!), `${name}: ${s.role}`).toBe(true);
      }
    }
    // Making the defaults never changes the palette they come from.
    expect(builtIn).toEqual(onDisk);
  });

  it('holds the colour picker\'s ready-made gradients as they are, then the fire\'s bed, cooling sparks and lightening smoke', () => {
    const p = withGradients!.palette;
    expect(Object.keys(p.gradients)).toEqual([...GRADIENT_PRESETS.map((x) => x.name), 'fire.bed', 'sparks.cool', 'smoke.lighten']);
    for (const pr of GRADIENT_PRESETS) {
      const { from, note, ...g } = p.gradients[pr.name]!;
      expect(g, pr.name).toEqual(pr.gradient);
      expect(note).toBe(`The ready-made gradient "${pr.label}".`);
      expect(from).toBe('assumed');
    }
    expect(p.gradients['sparks.cool']).toMatchObject({ kind: 'smooth', stops: [{ at: 0, role: 'heat.4' }, { at: 0.3, role: 'heat.3' }, { at: 0.65, role: 'heat.1' }, { at: 1, role: 'heat.dark', alpha: 0 }] });
    // The smoke gradient is colours only: a see-through puff would show its rounds where they overlap.
    expect(p.gradients['smoke.lighten']).toEqual({
      kind: 'smooth', from: 'assumed', note: expect.stringContaining('Colours only'),
      stops: [{ at: 0, role: 'fire.smoke' }, { at: 0.4, role: 'fire.smoke' }, { at: 1, role: 'fire.smoke.light' }],
    });
  });

  const molotov = JSON.parse(readFileSync(join(repo, 'examples', 'demo-project', 'effects', 'board_molotov.vfx.json'), 'utf8')) as EffectFile;
  const bedLayers = molotov.layers.filter((l): l is ShapeLayer => l.type === 'shape' && l.shape.kind === 'bed');

  it('the bed gradient has the Molotov bed\'s tones from the middle out, with band edges where its bands are without a gradient', () => {
    expect(bedLayers.map((l) => l.id)).toEqual(['bed', 'bed_detail']);
    // The bed lists its tones from the rim to the middle; the gradient runs from the middle (0) to the rim (1), as a glow's.
    for (const l of bedLayers) expect(l.shape.kind === 'bed' && l.shape.tones).toEqual([...MOLOTOV_BED_TONES]);
    const g = withGradients!.palette.gradients['fire.bed']!;
    expect(g.kind).toBe('banded');
    expect(g.stops.map((s) => s.role)).toEqual(['heat.3', 'heat.2', 'heat.1', 'heat.dark']);
    expect(g.stops.map((s) => s.at)).toEqual([0, 0.33, 0.5533, 0.7767]);
    // The runtime's band edges, unrounded: band k of 4 (from the rim) reaches out to 1 - 0.58 k / 3 - 0.03 k.
    [3, 2, 1].forEach((k, j) => expect(Math.abs(g.stops[j + 1]!.at - (1 - 0.58 * (k / 3) - 0.03 * k))).toBeLessThan(5e-5));
    expect(bedToneStops(['heat.1'])).toEqual([{ at: 0, role: 'heat.1' }]);
    expect(bedToneStops(['heat.dark', 'heat.3'])).toEqual([{ at: 0, role: 'heat.3' }, { at: 0.39, role: 'heat.dark' }]); // the inner band reaches out to 1 - 0.58 - 0.03
  });

  it('draws the Molotov\'s bed as today, both parts, with the real runtime (the places are rounded: under a millimetre apart)', () => {
    const cam = ((): CameraBasis => {
      const p = (35.3 * Math.PI) / 180, y = (45 * Math.PI) / 180;
      const back: Vec3 = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
      const forward: Vec3 = [-back[0], -back[1], -back[2]];
      const right: Vec3 = [Math.cos(y), 0, -Math.sin(y)];
      const up: Vec3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
      return { right, up, forward };
    })();
    const only = (gradient?: string): EffectFile => ({
      ...molotov,
      layers: bedLayers.map((l) => ({ ...l, shape: { ...l.shape, ...(gradient ? { gradient } : {}) } }) as ShapeLayer),
    });
    const tones = only(), graded = only('fire.bed');
    const drawn = (fx: EffectFile, timeMs: number, relation: 'enemy' | 'team') => {
      const sink = new DrawSink(64);
      const ctx: EvalContext = {
        seed: 7, timeMs, inputs: { origin: [-4, 1.5, 3], target: [3, 0, -2] }, faction: 'soviets', relation, palette: withGradients!.palette, camera: cam,
        imageRect: () => ({ u0: 0, v0: 0, u1: 0.5, v1: 0.5 }), white: [0.9, 0.9], dot: { u0: 0.5, v0: 0.5, u1: 0.6, v1: 0.6 }, tier: 'high',
      };
      evaluate(fx, ctx, sink);
      return sink;
    };
    let worstPos = 0, compared = 0;
    for (const t of [120, 600, 1500, 2300, 3200, 3800]) for (const relation of ['enemy', 'team'] as const) {
      const a = drawn(tones, t, relation), b = drawn(graded, t, relation);
      expect(b.triangles, `${t} ms`).toBe(a.triangles);
      expect(b.items).toBe(a.items);
      for (const grp of BLEND_GROUPS) {
        const A = a.groups[grp], B = b.groups[grp];
        expect(B.vcount).toBe(A.vcount);
        for (let i = 0; i < A.vcount * 4; i++) {
          expect(Math.abs(A.col[i]! - B.col[i]!)).toBeLessThan(1e-6);
          worstPos = Math.max(worstPos, Math.abs(A.pos[i]! - B.pos[i]!));
        }
        expect(Array.from(B.idx.slice(0, B.icount))).toEqual(Array.from(A.idx.slice(0, A.icount)));
        compared += A.vcount;
      }
    }
    expect(compared).toBeGreaterThan(1000);
    expect(worstPos).toBeLessThan(0.001);
    // The gradient was drawn: its rounded places move a band by a hair (without it, the picture would be the same to the bit).
    expect(worstPos).toBeGreaterThan(0);
  });

  it('its bed, sparks and smoke gradients pass the checker on the Molotov\'s own layers', () => {
    const fx = structuredClone(molotov);
    for (const l of fx.layers) {
      if (l.type === 'shape' && l.shape.kind === 'bed') l.shape.gradient = 'fire.bed';
      if (l.type === 'shape' && l.shape.kind === 'smoke') l.shape.gradient = 'smoke.lighten';
      if (l.type === 'burst' && l.id.startsWith('sparks')) l.gradient = 'sparks.cool';
    }
    const r = checkEffect(fx, { palette: withGradients!.palette });
    expect(r.problems.filter((x) => x.level === 'error')).toEqual([]);
    // Without the gradients (the built-in palette), the checker names them.
    expect(checkEffect(fx, { palette: builtIn }).problems.filter((x) => x.kind === 'gradient' || /gradient/.test(x.message)).length).toBeGreaterThan(0);
  });
});

describe('which profile an import\'s colours become', () => {
  const other = (() => { const p = fresh(); p.roles['heat.1']!.hex = '#000001'; return p; })();
  const third = (() => { const p = fresh(); p.roles['heat.1']!.hex = '#000002'; return p; })();
  const mine = fresh();
  let n = 0;
  const profile = (name: string, palette: Palette) => ({ id: `p${++n}`, name, palette });
  const choose = (profiles: ReturnType<typeof profile>[], wanted: string, taken: string[] = []) => {
    const c = chooseImportProfile(profiles, taken, wanted, mine);
    return 'use' in c ? { use: c.use.name } : c;
  };

  it('adds the colours under the name when it is free', () => {
    expect(choose([], 'Soviets dark')).toEqual({ add: 'Soviets dark' });
    expect(choose([profile('Soviets dark', other)], 'Allies light')).toEqual({ add: 'Allies light' });
  });

  it('uses a profile of that name that holds the very same colours, without regard to case', () => {
    expect(choose([profile('Soviets dark', other), profile('soviets DARK (1)', mine)], 'Soviets dark')).toEqual({ use: 'soviets DARK (1)' });
    expect(choose([profile('SOVIETS DARK', mine)], 'Soviets dark')).toEqual({ use: 'SOVIETS DARK' });
  });

  it('gives the new one " (1)", then " (2)": the first free number', () => {
    expect(choose([profile('Soviets dark', other)], 'Soviets dark')).toEqual({ add: 'Soviets dark (1)' });
    expect(choose([profile('Soviets dark', other), profile('Soviets dark (1)', third)], 'Soviets dark')).toEqual({ add: 'Soviets dark (2)' });
    expect(choose([profile('Soviets dark', other), profile('Soviets dark (2)', third)], 'Soviets dark')).toEqual({ add: 'Soviets dark (1)' });
  });

  it('counts from the base when the name already ends in " (n)"', () => {
    expect(choose([profile('Soviets dark', other), profile('Soviets dark (1)', third)], 'Soviets dark (1)')).toEqual({ add: 'Soviets dark (2)' });
    // The name itself, when free, is kept as it is.
    expect(choose([profile('Soviets dark', other)], 'Soviets dark (4)')).toEqual({ add: 'Soviets dark (4)' });
  });

  it('finds the very same colours anywhere in the family: the name first, then the base, then by number', () => {
    expect(choose([profile('Soviets dark (3)', mine), profile('Soviets dark (1)', mine)], 'Soviets dark')).toEqual({ use: 'Soviets dark (1)' });
    expect(choose([profile('Soviets dark (3)', mine), profile('Soviets dark', mine)], 'Soviets dark (2)')).toEqual({ use: 'Soviets dark' });
    expect(choose([profile('Soviets dark', mine), profile('Soviets dark (2)', mine)], 'Soviets dark (2)')).toEqual({ use: 'Soviets dark (2)' });
  });

  it('looks only inside the name\'s family', () => {
    expect(choose([profile('Built-in', mine), profile('Soviets darker', mine), profile('Soviets dark copy (1)', mine)], 'Soviets dark')).toEqual({ add: 'Soviets dark' });
  });

  it('counts the name of a file it cannot read as taken', () => {
    expect(choose([], 'Soviets dark', ['Soviets dark'])).toEqual({ add: 'Soviets dark (1)' });
  });

  it('keeps a long name within 64 characters, the number included; a name with nothing usable becomes "Imported colours"', () => {
    const long = 'L'.repeat(80);
    expect(choose([], long)).toEqual({ add: 'L'.repeat(64) });
    expect(choose([profile('L'.repeat(64), other)], long)).toEqual({ add: `${'L'.repeat(60)} (1)` });
    expect(choose([profile('L'.repeat(64), other), profile(`${'L'.repeat(60)} (1)`, mine)], long)).toEqual({ use: `${'L'.repeat(60)} (1)` });
    expect(choose([], '   ')).toEqual({ add: 'Imported colours' });
  });
});
