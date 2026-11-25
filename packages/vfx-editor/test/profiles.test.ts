/**
 * Palette profiles in the editor (UI phase 7, src/doc/profiles.ts): the defaults can be loaded or copied, not changed; an
 * import or a duplicate takes a free name (" (1)", " (2)"…); the list a load shows first; and a load, colours and name
 * together, is one undo step.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import type { EffectFile, Gradient, Palette } from '@shamble/vfx-format';
import { checkEffect } from '@shamble/vfx-format/validate';
import { History } from '../src/doc/history';
import { loadProfile } from '../src/doc/load-profile';
import { copyName, freeProfileName, goingLines, isDefaultProfile, lackingLines, missingDefaults, profileFileName, withLoadedProfile, withProfileName } from '../src/doc/profiles';
import { PROFILE_NAME_MAX, defaultProfiles, profileNameProblem } from '../src/io/palette-profile';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const builtIn = paletteJson as Palette;
const examples = (project: string): EffectFile[] => readdirSync(join(repo, 'examples', project, 'effects')).sort()
  .map((f) => checkEffect(JSON.parse(readFileSync(join(repo, 'examples', project, 'effects', f), 'utf8')), { palette: builtIn }).effect!);

describe('the default profiles', () => {
  it('are the two the store makes, known by name whatever the capitals', () => {
    for (const d of defaultProfiles(builtIn)) expect(isDefaultProfile(d.name)).toBe(true);
    expect(isDefaultProfile('built-in')).toBe(true);
    expect(isDefaultProfile('  BUILT-IN WITH GRADIENTS ')).toBe(true);
    expect(isDefaultProfile('Built-in copy')).toBe(false);
    expect(isDefaultProfile('Built-in (1)')).toBe(false);
  });

  it('are missing when no profile has their name', () => {
    expect(missingDefaults(['Built-in', 'Built-in with gradients', 'Mine'])).toEqual([]);
    expect(missingDefaults(['built-in', 'Mine'])).toEqual(['Built-in with gradients']);
    expect(missingDefaults([])).toEqual(['Built-in', 'Built-in with gradients']);
  });
});

describe('a free name for an import or a duplicate', () => {
  it('keeps a free name, and gives a taken one " (1)", " (2)" and so on, whatever the capitals', () => {
    expect(freeProfileName('Soviets dark', ['Built-in'])).toBe('Soviets dark');
    expect(freeProfileName('Soviets dark', ['soviets DARK'])).toBe('Soviets dark (1)');
    expect(freeProfileName('Soviets dark', ['Soviets dark', 'Soviets dark (1)'])).toBe('Soviets dark (2)');
    // A numbered name counts from its base.
    expect(freeProfileName('Soviets dark (1)', ['Soviets dark (1)'])).toBe('Soviets dark (2)');
    expect(freeProfileName(' Night raid ', [])).toBe('Night raid');
  });

  it('stays within 64 characters, so the store takes it', () => {
    const long = 'A'.repeat(PROFILE_NAME_MAX);
    const free = freeProfileName(long, [long]);
    expect(free).toBe(`${'A'.repeat(PROFILE_NAME_MAX - 4)} (1)`);
    expect(profileNameProblem(free, [long])).toBeUndefined();
  });

  it('names a duplicate "<name> copy", numbered when taken', () => {
    expect(copyName('Built-in', ['Built-in'])).toBe('Built-in copy');
    expect(copyName('Built-in', ['Built-in', 'Built-in copy'])).toBe('Built-in copy (1)');
    const long = 'B'.repeat(PROFILE_NAME_MAX);
    expect([...copyName(long, [long])]).toHaveLength(PROFILE_NAME_MAX);
    expect(profileNameProblem(copyName(long, [long]), [long])).toBeUndefined();
  });
});

describe('the file "Save as file" makes', () => {
  it('is named after the profile, in lowercase letters, digits and dashes', () => {
    expect(profileFileName('Soviets dark')).toBe('soviets-dark.json');
    expect(profileFileName('Built-in with gradients')).toBe('built-in-with-gradients.json');
    expect(profileFileName('Café  crème (2)')).toBe('cafe-creme-2.json');
    expect(profileFileName('夜')).toBe('palette-profile.json');
  });
});

describe('the list a load shows first', () => {
  it('names what the profile lacks that the effects use, whether it is kept, and where it is used', () => {
    const effects = examples('demo-project');
    const profile = structuredClone(builtIn);
    delete profile.roles['heat.rim'];
    delete profile.roles.ink;
    delete profile.factions.soviets.roles['glow.hot'];
    delete profile.factions.allies.roles['glow.hot'];
    delete profile.factions.empire.roles['glow.hot'];
    const current: Palette = { ...structuredClone(builtIn), gradients: { 'glow.ramp': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'white' }, { at: 1, role: 'glow' }] } } };
    const fx = structuredClone(effects);
    const beam = fx.find((e) => e.id === 'board_beam')!;
    const glow = beam.layers.find((l) => l.id === 'emitter_glow')!;
    if (glow.type === 'shape' && glow.shape.kind === 'glow') glow.shape.gradient = 'glow.ramp';
    const lines = lackingLines(loadProfile(profile, current, fx), fx);
    expect(lines[0]).toEqual({ name: 'glow.ramp', kind: 'gradient', kept: true, where: 'Hammer leech beam (board): Emitter glow' });
    expect(lines.slice(1).map((l) => `${l.kind}:${l.name}:${l.kept}`).sort()).toEqual(['colour:glow.hot:true', 'colour:heat.rim:true', 'colour:ink:true']);
    // Three places or fewer are named whole; a colour used in more names three, then how many more.
    expect(lines.find((l) => l.name === 'glow.hot')!.where).toBe('Hammer leech beam (board): Rings closing on the target, Beam, hot core, Emitter, hot');
    expect(lines.find((l) => l.name === 'ink')!.where).toMatch(/, and \d+ more$/);
  });

  it('says when the project lacks it too, and names an effect\'s own main colour', () => {
    const fx = structuredClone(examples('demo-project')).slice(0, 1);
    fx[0]!.controls.colour = 'no.such';
    const lines = lackingLines(loadProfile(structuredClone(builtIn), structuredClone(builtIn), fx), fx);
    expect(lines).toEqual([{ name: 'no.such', kind: 'colour', kept: false, where: `${fx[0]!.name}: its main colour` }]);
  });

  it('is empty when the profile has everything the effects use', () => {
    const effects = examples('hits-collection');
    expect(lackingLines(loadProfile(structuredClone(builtIn), structuredClone(builtIn), effects), effects)).toEqual([]);
  });
});

describe('what a load takes out, listed in its question too', () => {
  const ramp = (role: string): Gradient => ({ kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'white' }, { at: 1, role }] });

  it('names the colours and gradients this project has that no effect uses and the profile lacks: gradients first, each A to Z', () => {
    const effects = examples('demo-project');
    const current: Palette = structuredClone(builtIn);
    current.roles['zz.unused'] = { hex: '#123456', from: 'mustafa' };
    current.roles['aa.unused'] = { hex: '#654321', from: 'mustafa' };
    for (const f of ['soviets', 'allies', 'empire'] as const) current.factions[f].roles['team.spare'] = { hex: '#336699', from: 'mustafa' };
    current.gradients = { 'smoke.spare': ramp('glow'), 'glow.spare': ramp('team') };
    const result = loadProfile(structuredClone(builtIn), current, effects);
    expect(goingLines(current, result.palette)).toEqual([
      { name: 'glow.spare', kind: 'gradient' }, { name: 'smoke.spare', kind: 'gradient' },
      { name: 'aa.unused', kind: 'colour' }, { name: 'team.spare', kind: 'colour' }, { name: 'zz.unused', kind: 'colour' },
    ]);
    // The load really takes them out, as the list says.
    expect(result.palette.roles['aa.unused']).toBeUndefined();
    expect(result.palette.gradients['glow.spare']).toBeUndefined();
  });

  it('leaves out what the load keeps (an effect uses it) and what both have, even with another value', () => {
    const effects = structuredClone(examples('demo-project'));
    const glow = effects.find((e) => e.id === 'board_beam')!.layers.find((l) => l.id === 'emitter_glow')!;
    if (glow.type === 'shape' && glow.shape.kind === 'glow') glow.shape.gradient = 'glow.ramp';
    const current: Palette = { ...structuredClone(builtIn), gradients: { 'glow.ramp': ramp('glow') } };
    const profile = structuredClone(builtIn);
    profile.roles.ink = { hex: '#202020', from: 'mustafa' };
    const result = loadProfile(profile, current, effects);
    expect(lackingLines(result, effects).map((l) => l.name)).toEqual(['glow.ramp']);
    expect(goingLines(current, result.palette)).toEqual([]);
  });

  it('is empty for either default loaded into either example project (their colours are the built-in ones)', () => {
    for (const project of ['demo-project', 'hits-collection']) {
      const effects = examples(project);
      for (const d of defaultProfiles(builtIn)) expect(goingLines(builtIn, loadProfile(d.palette, builtIn, effects).palette)).toEqual([]);
    }
  });

  it('names the unused gradients of "Built-in with gradients" when "Built-in" is loaded after it', () => {
    const [plain, withGradients] = defaultProfiles(builtIn);
    const effects = examples('hits-collection');
    const going = goingLines(withGradients!.palette, loadProfile(plain!.palette, withGradients!.palette, effects).palette);
    expect(going.length).toBe(Object.keys(withGradients!.palette.gradients).length);
    expect(going.every((g) => g.kind === 'gradient')).toBe(true);
  });
});

describe('the project\'s profile in the document', () => {
  it('a load is one undo step: the colours and the name, both back with one undo', () => {
    const before = { effects: [], palette: builtIn, paletteProfile: 'Mine' };
    const h = new History(before);
    const other: Palette = { ...structuredClone(builtIn), roles: { ...structuredClone(builtIn.roles), ink: { hex: '#010101', from: 'mustafa' } } };
    h.apply('Load palette profile', withLoadedProfile(h.doc, other, ' Night raid '));
    h.endGesture();
    expect(h.doc.palette.roles.ink!.hex).toBe('#010101');
    expect(h.doc.paletteProfile).toBe('Night raid');
    expect(h.undo()).toBe(true);
    expect(h.doc).toBe(before);
    expect(h.canUndo).toBe(false);
  });

  it('naming the profile (Save as profile, Save over) is one undo step, and none when it is named so already', () => {
    const h = new History({ effects: [], palette: builtIn });
    const doc0 = h.doc;
    expect(withProfileName(doc0, 'Mine')).not.toBe(doc0);
    h.apply('Palette profile', withProfileName(h.doc, 'Mine'));
    expect(h.doc.paletteProfile).toBe('Mine');
    expect(h.doc.palette).toBe(builtIn);
    expect(withProfileName(h.doc, 'Mine')).toBe(h.doc);
    expect(h.dirty).toBe(true);
  });
});
