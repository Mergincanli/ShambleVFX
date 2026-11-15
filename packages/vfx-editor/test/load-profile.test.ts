/**
 * Loading a palette profile into a project: the profile's colours, plus every colour and gradient the project's effects
 * use that the profile lacks, kept from the current palette, so no effect breaks.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import { FACTION_IDS, checkPalette, newEffect, newShapeLayer, newSpriteLayer } from '@shamble/vfx-format';
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { checkEffect } from '@shamble/vfx-format/validate';
import { loadProfile } from '../src/doc/load-profile';
import { defaultProfiles } from '../src/io/palette-profile';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const builtIn = paletteJson as Palette;
const fresh = (): Palette => structuredClone(builtIn);
const examples = (project: string): EffectFile[] => readdirSync(join(repo, 'examples', project, 'effects')).sort()
  .map((f) => checkEffect(JSON.parse(readFileSync(join(repo, 'examples', project, 'effects', f), 'utf8')), { palette: builtIn }).effect!);

/** A deep freeze, so a change to what was given would throw. */
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') { for (const x of Object.values(v)) frozen(x); Object.freeze(v); }
  return v;
}

/** An effect whose main colour is `main`, with a glow coloured by `gradient` and a sprite tinted `tint`. */
function effect(id: string, o: { main?: string; gradient?: string; tint?: string } = {}): EffectFile {
  const fx = newEffect(id, id);
  if (o.main) fx.controls.colour = o.main;
  const glow = newShapeLayer('glow', 'Glow', 'glow');
  if (o.gradient && glow.shape.kind === 'glow') glow.shape.gradient = o.gradient;
  fx.layers = [glow, ...(o.tint ? [{ ...newSpriteLayer('flash', 'Flash', 'flash.png'), tint: { mode: 'multiply' as const, role: o.tint } }] : [])];
  return fx;
}

describe('loading a palette profile into a project', () => {
  it('takes the profile\'s colours, and keeps nothing when the profile has everything the effects use', () => {
    const profile = fresh();
    profile.roles['heat.1']!.hex = '#000001';
    profile.factions.allies.roles.team!.hex = '#000002';
    const r = loadProfile(profile, fresh(), [...examples('demo-project'), ...examples('hits-collection')]);
    expect(r.colours).toEqual([]);
    expect(r.gradients).toEqual([]);
    expect(r.palette).toEqual(profile);
    expect(r.palette.roles['heat.1']!.hex).toBe('#000001');
  });

  it('keeps a shared colour the effects use that the profile lacks, from the current palette, and says who uses it', () => {
    const current = fresh();
    current.roles['heat.blue'] = { hex: '#3A7BFF', from: 'mustafa', note: 'a blue fire' };
    const fx = [effect('shot', { main: 'heat.blue' }), effect('flash', { tint: 'heat.blue' })];
    const r = loadProfile(fresh(), current, fx);
    expect(r.palette.roles['heat.blue']).toEqual({ hex: '#3A7BFF', from: 'mustafa', note: 'a blue fire' });
    expect(r.colours.map((c) => [c.role, c.kept, c.perFaction])).toEqual([['heat.blue', true, false]]);
    expect(r.colours[0]!.uses.map((u) => [u.effect, u.why, u.path])).toEqual([
      ['shot', 'main', 'controls.colour'], ['flash', 'field', 'layers[1].tint.role'],
    ]);
    expect(checkPalette(r.palette)).toEqual([]);
  });

  it('keeps a team colour in all three factions, each with its own colour', () => {
    const current = fresh();
    const hexes = { soviets: '#AA0000', allies: '#0000AA', empire: '#AA00AA' } as const;
    for (const f of FACTION_IDS) current.factions[f].roles['team.light'] = { hex: hexes[f], from: 'mustafa' };
    const r = loadProfile(fresh(), current, [effect('shot', { tint: 'team.light' })]);
    for (const f of FACTION_IDS) expect(r.palette.factions[f].roles['team.light']!.hex).toBe(hexes[f]);
    expect(r.palette.roles['team.light']).toBeUndefined();
    expect(r.colours.map((c) => [c.role, c.kept, c.perFaction])).toEqual([['team.light', true, true]]);
    expect(checkPalette(r.palette)).toEqual([]);
  });

  it('keeps a gradient the effects use that the profile lacks, and the colours of its stops (a hex stop is no colour to keep)', () => {
    const current = fresh();
    current.roles['heat.blue'] = { hex: '#3A7BFF', from: 'mustafa' };
    current.gradients['glow.blue'] = { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, hex: '#FFFFFF' }, { at: 0.5, role: 'heat.blue' }, { at: 1, role: 'white', alpha: 0 }] };
    const r = loadProfile(fresh(), current, [effect('pulse', { gradient: 'glow.blue', main: 'heat.2' })]);
    expect(r.palette.gradients['glow.blue']).toEqual(current.gradients['glow.blue']);
    expect(r.gradients.map((g) => [g.name, g.kept, g.uses.map((u) => `${u.effect} ${u.path}`)])).toEqual([['glow.blue', true, ['pulse layers[0].shape.gradient']]]);
    expect(r.colours.map((c) => [c.role, c.kept])).toEqual([['heat.blue', true]]);
    expect(r.colours[0]!.uses.map((u) => [u.why, u.gradient, u.stop])).toEqual([['gradient-stop', 'glow.blue', 2]]);
    expect(r.palette.roles['heat.blue']).toEqual(current.roles['heat.blue']);
    expect(checkPalette(r.palette)).toEqual([]);
  });

  it('uses the profile\'s own gradient of that name, so the current one\'s stop colours are not needed', () => {
    const current = fresh();
    current.roles['heat.blue'] = { hex: '#3A7BFF', from: 'mustafa' };
    current.gradients['glow.blue'] = { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'heat.blue' }, { at: 1, role: 'heat.blue', alpha: 0 }] };
    const profile = fresh();
    profile.gradients['glow.blue'] = { kind: 'banded', from: 'mustafa', stops: [{ at: 0, role: 'white' }, { at: 0.5, role: 'heat.1' }] };
    const r = loadProfile(profile, current, [effect('pulse', { gradient: 'glow.blue' })]);
    expect(r.palette.gradients['glow.blue']).toEqual(profile.gradients['glow.blue']);
    expect(r.gradients).toEqual([]);
    expect(r.colours).toEqual([]);
    expect(r.palette.roles['heat.blue']).toBeUndefined();
  });

  it('lists what both palettes lack and keeps nothing for it (those effects were broken before too)', () => {
    const r = loadProfile(fresh(), fresh(), [effect('odd', { tint: 'heat.nowhere', gradient: 'none.such' })]);
    expect(r.colours.map((c) => [c.role, c.kept, c.perFaction])).toEqual([['heat.nowhere', false, false]]);
    expect(r.gradients.map((g) => [g.name, g.kept])).toEqual([['none.such', false]]);
    expect(r.palette).toEqual(fresh());
  });

  it('keeps every colour the examples use when the profile has few, and then every example checks clean', () => {
    const profile = fresh();
    profile.roles = { ink: { hex: '#000000', from: 'mustafa' }, white: { hex: '#FFFFFF', from: 'mustafa' }, 'heat.1': { hex: '#FF7700', from: 'mustafa' } };
    for (const project of ['demo-project', 'hits-collection']) {
      const effects = examples(project);
      const r = loadProfile(profile, fresh(), effects);
      expect(checkPalette(r.palette)).toEqual([]);
      for (const fx of effects) expect(checkEffect(fx, { palette: r.palette }).problems.filter((p) => p.level === 'error'), `${project}: ${fx.id}`).toEqual([]);
      // The profile's own colours stay; everything kept is the current palette's, and is said so.
      expect(r.palette.roles.ink!.hex).toBe('#000000');
      expect(r.palette.roles['heat.1']!.hex).toBe('#FF7700');
      expect(r.colours.length).toBeGreaterThan(5);
      for (const c of r.colours) {
        expect(c.kept, c.role).toBe(true);
        expect(r.palette.roles[c.role]).toEqual(builtIn.roles[c.role]);
        expect(['ink', 'white', 'heat.1']).not.toContain(c.role);
      }
      // Only what the effects use is kept.
      const used = new Set(r.colours.map((c) => c.role));
      for (const role of Object.keys(builtIn.roles)) expect(Object.hasOwn(r.palette.roles, role)).toBe(used.has(role) || role in profile.roles);
    }
  });

  it('works with the default profile "Built-in with gradients" on the examples, keeping nothing', () => {
    const profile = defaultProfiles(builtIn)[1]!.palette;
    const r = loadProfile(profile, fresh(), examples('demo-project'));
    expect(r.colours).toEqual([]);
    expect(r.gradients).toEqual([]);
    expect(r.palette).toEqual(profile);
  });

  it('never changes the palettes or effects it is given, and gives a palette of its own', () => {
    const current = fresh();
    current.roles['heat.blue'] = { hex: '#3A7BFF', from: 'mustafa' };
    current.gradients['glow.blue'] = { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'heat.blue' }, { at: 1, role: 'white' }] };
    const profile = frozen(fresh()), cur = frozen(current), fx = frozen([effect('pulse', { gradient: 'glow.blue', tint: 'heat.blue' })]);
    const r = loadProfile(profile, cur, fx);
    expect(r.palette).not.toBe(profile);
    expect(r.palette.roles['heat.blue']).not.toBe(cur.roles['heat.blue']);
    expect(r.palette.gradients['glow.blue']).not.toBe(cur.gradients['glow.blue']);
    expect(Object.isFrozen(r.palette)).toBe(false);
  });

  it('copies nothing under a name that is not a role, such as __proto__', () => {
    const fx = effect('odd');
    (fx.layers[0] as unknown as { shape: Record<string, unknown> }).shape.role = '__proto__';
    const r = loadProfile(fresh(), fresh(), [fx]);
    expect(r.colours.map((c) => c.role)).not.toContain('__proto__');
    expect(Object.getPrototypeOf(r.palette.roles)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).hex).toBeUndefined();
  });
});
