/**
 * Plain facts about layers for the right panel and the Layers list (src/doc/layer-info.ts): what draws a layer, which
 * projectile it rides and which layers ride a projectile, and the colours of what is selected (the effect, one layer, or a
 * projectile's riders), from the checker's own colour list.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import { newBurstLayer, newEffect, newProjectileLayer, newShapeLayer, newSpriteLayer, newWordLayer, roleNames } from '@shamble/vfx-format';
import type { EffectFile, Layer, Palette, ShapeLayer } from '@shamble/vfx-format';
import { colourRoles, effectColours, layerColours } from '@shamble/vfx-format/validate';
import { SHAPE_KINDS, SHAPE_TEXT, layerKind, riderLine, ridersOf, ridingOn, selectionColours, whatDraws } from '../src/doc/layer-info';

const palette = paletteJson as Palette;
const example = (project: string, id: string): EffectFile =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'examples', project, 'effects', `${id}.vfx.json`), 'utf8')) as EffectFile;
const layer = (fx: EffectFile, id: string): Layer => fx.layers.find((l) => l.id === id)!;

describe('what draws a layer', () => {
  it('names the image of a sprite and of an image burst; shapes, bursts and words are drawn in code; a projectile draws nothing', () => {
    const rifle = example('demo-project', 'rifle_shot');
    expect(whatDraws(layer(rifle, 'flash'))).toEqual({ text: 'Image:', image: 'muzzle_flash.png' });
    expect(whatDraws(layer(rifle, 'bullet'))).toEqual({ text: 'An invisible path: it draws nothing itself' });
    expect(whatDraws(newShapeLayer('s', 'Star', 'shards'))).toEqual({ text: 'Drawn in code, no image' });
    expect(whatDraws(newWordLayer('w', 'Word'))).toEqual({ text: 'Drawn in code, no image' });
    expect(whatDraws(newBurstLayer('b', 'Sparks'))).toEqual({ text: 'Drawn in code, no image' });
    const chips = { ...newBurstLayer('c', 'Chips'), look: { kind: 'image' as const, image: 'chip.png', tint: { mode: 'keep' as const } } };
    expect(whatDraws(chips)).toEqual({ text: 'Image:', image: 'chip.png' });
  });

  it('says what kind of layer it is in the add menu\'s words, and a rider\'s line in one go', () => {
    expect(SHAPE_KINDS).toHaveLength(14);
    expect(SHAPE_KINDS.every((k) => SHAPE_TEXT[k])).toBe(true);
    const shell = example('demo-project', 'board_shell');
    expect(layerKind(layer(shell, 'trail'))).toBe('Shape: trail behind a projectile');
    expect(riderLine(layer(shell, 'trail'))).toEqual({ text: 'Shape: trail behind a projectile, drawn in code, no image' });
    expect(layerKind(layer(shell, 'sparks'))).toBe(`Burst: ${(layer(shell, 'sparks') as { count: number }).count} × diamond`);
    expect(layerKind(newWordLayer('w', 'Word'))).toBe('Word: BOOM');
    const rifle = example('demo-project', 'rifle_shot');
    expect(riderLine(layer(rifle, 'tracer'))).toEqual({ text: 'Sprite, image:', image: 'tracer_body.png' });
  });
});

describe('riders', () => {
  it('finds the projectile a layer rides, and the layers riding a projectile, top of the list first', () => {
    const rifle = example('demo-project', 'rifle_shot');
    expect(ridingOn(rifle, layer(rifle, 'tracer'))?.name).toBe('Bullet');
    expect(ridingOn(rifle, layer(rifle, 'flash'))).toBeUndefined();
    expect(ridingOn(rifle, layer(rifle, 'bullet'))).toBeUndefined();
    // The file lists the tracer, then its core; the Layers list shows the file upside down.
    expect(ridersOf(rifle, 'bullet').map((l) => l.id)).toEqual(['tracer_core', 'tracer']);
    expect(ridersOf(rifle, 'flash')).toEqual([]);
    const shell = example('demo-project', 'board_shell');
    expect(ridersOf(shell, 'shell').map((l) => l.id)).toEqual(['trail']);
    expect(ridingOn(shell, layer(shell, 'trail'))?.name).toBe('Shell');
  });

  it('a layer naming a layer that is not a projectile, or is gone, rides nothing', () => {
    const fx = newEffect('fx', 'Fx');
    const star = newShapeLayer('star', 'Star', 'shards');
    fx.layers = [star, { ...newSpriteLayer('s', 'S', 'a.png'), at: { layer: 'star' } }, { ...newSpriteLayer('t', 'T', 'a.png'), at: { layer: 'gone' } }];
    expect(ridingOn(fx, fx.layers[1]!)).toBeUndefined();
    expect(ridingOn(fx, fx.layers[2]!)).toBeUndefined();
  });
});

describe('the colours of the selection', () => {
  it('no layer: the effect\'s main colour and every layer\'s, as the checker lists them, in the palette\'s order', () => {
    for (const [project, id] of [['demo-project', 'board_shell'], ['demo-project', 'rifle_shot'], ['hits-collection', 'hit_burst_star']] as const) {
      const fx = example(project, id);
      const s = selectionColours(fx, undefined, palette);
      expect(s.of).toBe('effect');
      expect(s.roles).toEqual(colourRoles(effectColours(fx, palette)));
      expect(s.roles).toContain(fx.controls.colour);
      expect(s.roles).toEqual(roleNames(palette).filter((r) => s.roles.includes(r)));
      expect(s.missing).toEqual([]);
    }
  });

  it('a layer: the colours it names (main as the effect\'s main colour) and the ones it draws without naming them', () => {
    const rifle = example('demo-project', 'rifle_shot');
    // The tracer is multiplied by "main": the effect's main colour, glow. The muzzle flash keeps its image's colours.
    expect(selectionColours(rifle, layer(rifle, 'tracer'), palette)).toEqual({ of: 'layer', roles: ['glow'], missing: [], hexes: [] });
    expect(selectionColours(rifle, layer(rifle, 'flash'), palette).roles).toEqual([]);
    expect(selectionColours(rifle, layer(rifle, 'dust'), palette).roles).toEqual(['dust']);
    // A star with your own team's broken edge and the ink outline, which its fields do not name.
    const shell = example('demo-project', 'board_shell');
    const burst = layer(shell, 'burst');
    expect(selectionColours(shell, burst, palette).roles).toEqual(colourRoles(layerColours(burst, { main: shell.controls.colour, palette })));
    expect(selectionColours(shell, burst, palette).roles).toEqual(expect.arrayContaining(['ink', 'heat.rim', 'white']));
    // A word's ink outlines.
    expect(selectionColours(shell, layer(shell, 'word'), palette).roles).toContain('ink');
  });

  it('a projectile has none of its own: the colours of the layers riding it', () => {
    const rifle = example('demo-project', 'rifle_shot');
    expect(selectionColours(rifle, layer(rifle, 'bullet'), palette)).toEqual({ of: 'riders', roles: ['glow'], missing: [], hexes: [] });
    const shell = example('demo-project', 'board_shell');
    expect(selectionColours(shell, layer(shell, 'shell'), palette).roles).toEqual(['heat.3', 'ink', 'team']);
    const lone = newEffect('fx', 'Fx');
    lone.layers = [newProjectileLayer('p', 'P')];
    expect(selectionColours(lone, lone.layers[0], palette)).toEqual({ of: 'riders', roles: [], missing: [], hexes: [] });
  });

  it('names a colour the palette lacks apart, and lists a gradient stop given as a hex', () => {
    const fx = newEffect('fx', 'Fx');
    const glow = newShapeLayer('g', 'Glow', 'glow') as ShapeLayer;
    fx.layers = [{ ...glow, shape: { ...glow.shape, role: 'no.such', gradient: 'test.ramp' } as ShapeLayer['shape'] }];
    const pal: Palette = { ...palette, gradients: { 'test.ramp': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'white' }, { at: 1, hex: '#ffe8a0' }] } } };
    const s = selectionColours(fx, fx.layers[0], pal);
    expect(s.roles).toEqual(['white']);
    expect(s.missing).toEqual(['no.such']);
    expect(s.hexes).toEqual([{ hex: '#FFE8A0', gradient: 'test.ramp' }]);
  });
});
