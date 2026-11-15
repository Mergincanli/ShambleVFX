import { describe, expect, it } from 'vitest';
import paletteJson from '../palette/palette.json';
import { newBurstLayer, newEffect, newShapeLayer, newSpriteLayer, newWordLayer } from '../src/index';
import type { BurstLayer, Palette, ShardsShape } from '../src/index';
import { checkEffect, colourRoles, effectColours, layerColours, problemLines } from '../src/validate/index';
import type { ColourUse } from '../src/validate/index';

const palette = paletteJson as Palette;

/** The colours as short lines: role (or hex), why, where. */
function lines(list: readonly ColourUse[]): string[] {
  return list.map((c) => `${c.role ?? c.hex} ${c.why} ${c.path}`);
}

function star(edit: Partial<ShardsShape> = {}) {
  const l = newShapeLayer('star', 'Star', 'shards');
  Object.assign(l.shape, { edge: 'auto', inkPx: 3 }, edit);
  return l;
}

describe('the colours a layer can use', () => {
  it('lists the roles its fields name, then the ones its kind draws without naming them, each with why and where', () => {
    const l = star({ whiteFirstStep: true, double: true, halftone: { role: 'fire.light', stepPx: 9, dotPx: 4, towardDeg: 45 } });
    const list = layerColours(l, { index: 4, main: 'heat.1' });
    expect(lines(list.colours)).toEqual([
      'heat.1 field layers[4].shape.tones[0].role',
      'heat.2 field layers[4].shape.tones[1].role',
      'heat.3 field layers[4].shape.tones[2].role',
      'heat.4 field layers[4].shape.tones[3].role',
      'fire.light field layers[4].shape.halftone.role',
      'ink ink layers[4].shape.edge',
      'ink ink layers[4].shape.double',
      'heat.rim broken-edge layers[4].shape.edge',
      'white white layers[4].shape.whiteFirstStep',
    ]);
    expect(list.colours.map((c) => c.note)).toEqual([
      undefined, undefined, undefined, undefined, undefined,
      'the black ink outline', 'the second, jagged edge inside it', 'the broken edge your own team\'s effects get', 'the white first step',
    ]);
    for (const c of list.colours) expect([c.layer, c.index]).toEqual(['star', 4]);
    expect(list.gradients).toEqual([]);
  });

  it('follows friend or foe: ink where an ink edge can show, the broken edge where your team\'s can', () => {
    const implicit = (edit: Partial<ShardsShape>) => lines(layerColours(star(edit)).colours.filter((c) => c.why !== 'field'));
    expect(implicit({ edge: 'auto' })).toEqual(['ink ink shape.edge', 'heat.rim broken-edge shape.edge']);
    expect(implicit({ edge: 'enemy' })).toEqual(['ink ink shape.edge']);
    expect(implicit({ edge: 'ink' })).toEqual(['ink ink shape.edge']);
    expect(implicit({ edge: 'broken' })).toEqual(['heat.rim broken-edge shape.edge']);
    expect(implicit({ edge: 'none' })).toEqual([]);
    // No ink line of 0 px; the double edge is drawn in ink all the same.
    expect(implicit({ edge: 'ink', inkPx: 0 })).toEqual([]);
    expect(implicit({ edge: 'none', inkPx: 0, double: true })).toEqual(['ink ink shape.double']);
  });

  it('lists white only when the star moves in steps (a smooth one has no first step)', () => {
    const l = star({ edge: 'none', whiteFirstStep: true });
    expect(lines(layerColours(l).colours.filter((c) => c.why === 'white'))).toEqual(['white white shape.whiteFirstStep']);
    l.timing = { mode: 'smooth' };
    expect(layerColours(l).colours.filter((c) => c.why === 'white')).toEqual([]);
  });

  it('lists the ink of rings, trails, fires, bursts and words', () => {
    const ink = (l: Parameters<typeof layerColours>[0]) => lines(layerColours(l).colours.filter((c) => c.why === 'ink'));
    expect(ink(newShapeLayer('r', 'Ring', 'ring'))).toEqual(['ink ink shape']);
    expect(ink(newShapeLayer('t', 'Trail', 'trail'))).toEqual(['ink ink shape.edge']);
    const bed = newShapeLayer('b', 'Bed', 'bed');
    expect(ink(bed)).toEqual(['ink ink shape.edge']);
    if (bed.shape.kind === 'bed') bed.shape.edge = 'broken';
    // A broken fire line is drawn in the bed's own detail colour: a field.
    expect(ink(bed)).toEqual([]);
    expect(ink(newBurstLayer('p', 'Pieces'))).toEqual(['ink ink look.edge']);
    // Pieces with their own ink colour name it in a field; image pieces still have ink looked up.
    expect(ink({ ...newBurstLayer('p', 'Pieces'), look: { kind: 'chip', role: 'stone', inkPx: 1, edge: 'ink', inkRole: 'stone.rim' } })).toEqual([]);
    expect(ink({ ...newBurstLayer('p', 'Pieces'), look: { kind: 'image', image: 'hit.png', tint: { mode: 'keep' } } })).toEqual(['ink ink look']);
    expect(ink(newWordLayer('w', 'Word'))).toEqual(['ink ink (layer)']);
    expect(ink(newSpriteLayer('s', 'Sprite', 'flash.png'))).toEqual([]);
    expect(ink(newShapeLayer('g', 'Glow', 'glow'))).toEqual([]);
  });

  it('turns "main" into the effect\'s main colour, in a field or in a gradient stop', () => {
    const w = newWordLayer('w', 'Word');
    w.colours.top = 'main';
    expect(lines(layerColours(w, { main: 'team' }).colours).slice(0, 1)).toEqual(['team main colours.top']);
    // Without the main colour, "main" is listed as it is.
    expect(lines(layerColours(w).colours).slice(0, 1)).toEqual(['main main colours.top']);
  });

  it('lists a gradient and its stops: roles, a hex as a hex, "main" as the main colour', () => {
    const p: Palette = { ...palette, gradients: { 'sparks.cool': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, hex: '#FFF4D6' }, { at: 0.4, role: 'main' }, { at: 1, role: 'heat.dark', alpha: 0 }] } } };
    const b: BurstLayer = { ...newBurstLayer('sparks', 'Sparks'), gradient: 'sparks.cool' };
    const list = layerColours(b, { index: 2, main: 'heat.2', palette: p });
    expect(list.gradients).toEqual([{ name: 'sparks.cool', path: 'layers[2].gradient', layer: 'sparks', index: 2 }]);
    expect(list.colours.filter((c) => c.gradient).map((c) => [c.role ?? c.hex, c.why, c.path, c.stop, c.note])).toEqual([
      ['#FFF4D6', 'gradient-stop', 'layers[2].gradient', 1, 'stop 1 of the gradient "sparks.cool"'],
      ['heat.2', 'main', 'layers[2].gradient', 2, 'stop 2 of the gradient "sparks.cool": the effect\'s main colour'],
      ['heat.dark', 'gradient-stop', 'layers[2].gradient', 3, 'stop 3 of the gradient "sparks.cool"'],
    ]);
    // Without the palette (or with one that lacks it), the gradient is still listed, without stops.
    expect(layerColours(b).gradients.map((g) => g.name)).toEqual(['sparks.cool']);
    expect(layerColours(b).colours.some((c) => c.gradient)).toBe(false);
  });

  it('lists the gradients of a glow, smoke, a fire\'s bed and a burst', () => {
    const named = (kind: 'glow' | 'smoke' | 'bed') => {
      const l = newShapeLayer('s', 'S', kind);
      (l.shape as { gradient?: string }).gradient = 'some.ramp';
      return layerColours(l, { index: 0 }).gradients.map((g) => g.path);
    };
    expect(named('glow')).toEqual(['layers[0].shape.gradient']);
    expect(named('smoke')).toEqual(['layers[0].shape.gradient']);
    expect(named('bed')).toEqual(['layers[0].shape.gradient']);
    expect(layerColours({ ...newBurstLayer('b', 'B'), gradient: 'some.ramp' }, { index: 1 }).gradients.map((g) => g.path)).toEqual(['layers[1].gradient']);
  });

  it('lists a whole effect: its main colour first, then every layer\'s colours', () => {
    const fx = newEffect('fx', 'Effect');
    fx.controls.colour = 'glow';
    fx.layers = [{ ...newSpriteLayer('flash', 'Flash', 'flash.png'), tint: { mode: 'multiply', role: 'main' } }, newWordLayer('word', 'Word')];
    const list = effectColours(fx, palette);
    expect(lines(list.colours)).toEqual([
      'glow main controls.colour',
      'glow main layers[0].tint.role',
      'white field layers[1].colours.top',
      'glow field layers[1].colours.bottom',
      'team.dark field layers[1].colours.back',
      'ink ink layers[1]',
    ]);
    expect([list.colours[0]!.layer, list.colours[0]!.index]).toEqual([undefined, undefined]);
    expect([list.colours[1]!.layer, list.colours[1]!.index]).toEqual(['flash', 0]);
    expect(colourRoles(list)).toEqual(['glow', 'ink', 'team.dark', 'white']);
  });
});

describe('the checker and the colours a layer draws without naming them', () => {
  const without = (...roles: string[]): Palette => ({ ...palette, roles: Object.fromEntries(Object.entries(palette.roles).filter(([r]) => !roles.includes(r))) });
  const messages = (fx: ReturnType<typeof newEffect>, p: Palette) => problemLines(checkEffect(fx, { palette: p }).problems);

  it('names a missing ink, white or broken-edge colour, and what the layer needs it for', () => {
    const fx = newEffect('fx', 'Effect');
    fx.layers = [star({ whiteFirstStep: true })];
    expect(messages(fx, palette)).toEqual([]);
    expect(messages(fx, without('ink', 'white', 'heat.rim'))).toEqual([
      'layers[0].shape.edge: "ink" is not a role in the palette: "Star" needs it for the black ink outline',
      'layers[0].shape.edge: "heat.rim" is not a role in the palette: "Star" needs it for the broken edge your own team\'s effects get',
      'layers[0].shape.whiteFirstStep: "white" is not a role in the palette: "Star" needs it for the white first step',
    ]);
    const r = checkEffect(fx, { palette: without('ink') });
    expect(r.ok).toBe(false);
    expect(r.problems.map((x) => x.kind)).toEqual(['role']);
  });

  it('names a word\'s missing ink, and a role a field names in plain words as before', () => {
    const fx = newEffect('fx', 'Effect');
    fx.layers = [{ ...newWordLayer('word', 'Word'), colours: { top: 'nope', bottom: 'glow', back: 'team.dark' } }];
    expect(messages(fx, without('ink'))).toEqual([
      'layers[0].colours.top: "nope" is not a role in the palette',
      'layers[0]: "ink" is not a role in the palette: "Word" needs it for the black outlines of the letters',
    ]);
  });

  it('names a gradient stop whose role the palette lacks', () => {
    const fx = newEffect('fx', 'Effect');
    const glow = newShapeLayer('glow', 'Glow', 'glow');
    if (glow.shape.kind === 'glow') glow.shape.gradient = 'glow.ramp';
    fx.layers = [glow];
    const p: Palette = { ...palette, gradients: { 'glow.ramp': { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'glow.hot' }, { at: 1, role: 'no.such' }] } } };
    expect(messages(fx, p)).toEqual(['layers[0].shape.gradient: "no.such" is not a role in the palette: "Glow" needs it for stop 2 of the gradient "glow.ramp"']);
  });

  it('checks "main" once, as the effect\'s main colour', () => {
    const fx = newEffect('fx', 'Effect');
    fx.controls.colour = 'nope';
    fx.layers = [{ ...newSpriteLayer('flash', 'Flash', 'flash.png'), tint: { mode: 'multiply', role: 'main' } }];
    expect(messages(fx, palette)).toEqual(['controls.colour: "nope" is not a role in the palette']);
  });
});
