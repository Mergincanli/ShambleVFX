/**
 * Colours with a part missing or empty, for the tests of palette profiles and of import: the ways a palette written by
 * hand once made the checks throw (so one such profile file stopped every profile route and every import, and an export
 * with such a palette.json crashed the command-line import). Each comes with the first problem the checks name.
 */
import paletteJson from '@shamble/vfx-format/palette.json';
import type { Palette } from '@shamble/vfx-format';

export const BROKEN: [string, (p: Record<string, any>) => void, string][] = [
  ['the first faction without roles', (p) => { delete p.factions.soviets.roles; }, 'faction soviets has no "roles"'],
  ['a faction without roles', (p) => { delete p.factions.allies.roles; }, 'faction allies has no "roles"'],
  ['a faction that is a number', (p) => { p.factions.empire = 5; }, 'faction empire is not a faction: it needs "name" and "roles"'],
  ['an empty faction colour', (p) => { p.factions.soviets.roles.team = null; }, 'soviets.team: is not a colour (it needs "hex")'],
  ['an empty shared colour', (p) => { p.roles['heat.1'] = null; }, 'heat.1: is not a colour (it needs "hex")'],
  ['an empty gradient', (p) => { p.gradients = { 'fire.bed': null }; }, 'gradient fire.bed: is not a gradient (it needs "kind" and "stops")'],
  ['an empty stop', (p) => { p.gradients = { 'fire.bed': { kind: 'banded', from: 'assumed', stops: [{ at: 0, role: 'heat.3' }, null] } }; },
    'gradient fire.bed, stop 2: is not a stop (it needs "at" and a role or a hex)'],
];

/** The built-in palette (or `base`) with one part broken. */
export function brokenCopy(edit: (p: Record<string, any>) => void, base: Palette = paletteJson as Palette): Palette {
  const p = structuredClone(base) as unknown as Record<string, any>;
  edit(p);
  return p as unknown as Palette;
}
