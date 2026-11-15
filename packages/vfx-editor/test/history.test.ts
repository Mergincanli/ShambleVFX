import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { checkEffect, problemLines } from '@shamble/vfx-format/validate';
import { History } from '../src/doc/history';
import type { EditorDoc } from '../src/doc/history';
import { addLayer, addRole, deriveAgain, duplicateLayer, mixHex, moveLayer, newProjectile, newSprite, removeLayer, scaleHex, setEffectValue, setIn, setLayerValue, setRoleColour, wordsFromText } from '../src/doc/edits';

const here = dirname(fileURLToPath(import.meta.url));
const load = (f: string) => JSON.parse(readFileSync(join(here, '../../../examples/demo-project/effects', f), 'utf8')) as EffectFile;
const start = (): EditorDoc => ({ palette: paletteJson as Palette, effects: [load('rifle_shot.vfx.json'), load('shell_flight.vfx.json')] });
const images = ['tracer_body.png', 'tracer_core.png', 'muzzle_flash.png', 'hit_star.png', 'dust_puff.png', 'gun_blast.png', 'shell_trail.png', 'shell_head.png', 'burst.png', 'white.png'];

describe('setIn', () => {
  it('copies along the path and shares the rest', () => {
    const a = { x: { y: [1, 2, 3] }, z: { w: 1 } };
    const b = setIn(a, ['x', 'y', 1], 9);
    expect(b.x.y).toEqual([1, 9, 3]);
    expect(a.x.y).toEqual([1, 2, 3]);
    expect(b.z).toBe(a.z);
  });
  it('removes a key when the value is undefined', () => {
    expect(setIn({ a: 1, b: 2 }, ['b'], undefined)).toEqual({ a: 1 });
  });
});

describe('History', () => {
  it('undoes and redoes edits, and knows when the document is saved', () => {
    const h = new History(start());
    expect(h.dirty).toBe(false);
    h.apply('Size', setEffectValue(h.doc, 'rifle_shot', ['controls', 'size'], 2));
    expect(h.doc.effects[0]!.controls.size).toBe(2);
    expect(h.dirty).toBe(true);
    h.undo();
    expect(h.doc.effects[0]!.controls.size).toBe(1);
    expect(h.dirty).toBe(false);
    h.redo();
    expect(h.doc.effects[0]!.controls.size).toBe(2);
    h.markSaved();
    expect(h.dirty).toBe(false);
  });

  it('merges one slider drag into one undo step', () => {
    const h = new History(start());
    for (const v of [1.1, 1.2, 1.3, 1.4]) h.apply('Size', setEffectValue(h.doc, 'rifle_shot', ['controls', 'size'], v), { mergeKey: 'size' });
    h.endGesture();
    h.apply('Size', setEffectValue(h.doc, 'rifle_shot', ['controls', 'size'], 2), { mergeKey: 'size' });
    expect(h.doc.effects[0]!.controls.size).toBe(2);
    h.undo();
    expect(h.doc.effects[0]!.controls.size).toBe(1.4);
    h.undo();
    expect(h.doc.effects[0]!.controls.size).toBe(1);
    expect(h.canUndo).toBe(false);
  });

  it('keeps at most `limit` steps', () => {
    const h = new History(start(), 5);
    for (let i = 0; i < 12; i++) h.apply('n', setEffectValue(h.doc, 'rifle_shot', ['controls', 'size'], 1 + i / 10));
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(5);
  });

  it('gives back the exact same document after 1000 random edits undone, and again when redone', () => {
    const h = new History(start(), 2000);
    const first = JSON.stringify(h.doc);
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 1000; i++) {
      const fx = h.doc.effects[Math.floor(rnd() * h.doc.effects.length)]!;
      const r = rnd();
      const layer = fx.layers[Math.floor(rnd() * fx.layers.length)];
      let next = h.doc;
      if (r < 0.3) next = setEffectValue(h.doc, fx.id, ['controls', 'size'], Math.round(rnd() * 300) / 100 + 0.1);
      else if (r < 0.45 && layer) next = setLayerValue(h.doc, fx.id, layer.id, ['name'], `Layer ${i}`);
      else if (r < 0.6) next = addLayer(h.doc, fx.id, rnd() < 0.5 ? newSprite(fx, 'white.png') : newProjectile(fx));
      else if (r < 0.7 && layer && fx.layers.length > 1) next = removeLayer(h.doc, fx.id, layer.id);
      else if (r < 0.85 && layer) next = moveLayer(h.doc, fx.id, layer.id, rnd() < 0.5 ? -1 : 1);
      else if (layer) next = duplicateLayer(h.doc, fx.id, layer.id).doc;
      h.apply(`edit ${i}`, next);
    }
    const last = JSON.stringify(h.doc);
    while (h.undo());
    expect(JSON.stringify(h.doc)).toBe(first);
    while (h.redo());
    expect(JSON.stringify(h.doc)).toBe(last);
  });
});

describe('edits keep effects valid', () => {
  const palette = paletteJson as Palette;
  it('removing a projectile frees the sprites that rode it and the layers that waited for it', () => {
    const doc = removeLayer(start(), 'shell_flight', 'shell');
    const fx = doc.effects[1]!;
    expect(fx.layers.find((l) => l.id === 'shell')).toBeUndefined();
    const r = checkEffect(fx, { palette, images });
    expect(problemLines(r.problems)).toEqual([]);
  });
  it('duplicating a layer gives it a new id right above the original', () => {
    const { doc, id } = duplicateLayer(start(), 'rifle_shot', 'flash');
    const ids = doc.effects[0]!.layers.map((l) => l.id);
    expect(id).toBe('flash_2');
    expect(ids.indexOf('flash_2')).toBe(ids.indexOf('flash') + 1);
    expect(checkEffect(doc.effects[0], { palette, images }).ok).toBe(true);
  });
});

describe('colour edits', () => {
  it('set a shared colour for everyone, and a team colour for one faction, as Mustafa\'s', () => {
    const d0 = start();
    const d1 = setRoleColour(d0, 'heat.1', 'allies', '#ff8800');
    expect(d1.palette.roles['heat.1']).toEqual({ hex: '#FF8800', from: 'mustafa', note: d0.palette.roles['heat.1']!.note });
    expect(d1.effects).toBe(d0.effects);
    const d2 = setRoleColour(d1, 'team', 'empire', '#AA00AA');
    expect(d2.palette.factions.empire.roles.team!.hex).toBe('#AA00AA');
    expect(d2.palette.factions.soviets.roles.team).toBe(d0.palette.factions.soviets.roles.team);
    expect(setRoleColour(d2, 'no.such', 'allies', '#000000')).toBe(d2);
    expect(setRoleColour(d2, 'ink', 'allies', 'red')).toBe(d2);
  });

  it('add a colour, shared or per faction, and never twice', () => {
    const d0 = start();
    const shared = addRole(d0, 'fire.blue', false, '#3a7bff');
    expect(shared.palette.roles['fire.blue']).toEqual({ hex: '#3A7BFF', from: 'mustafa' });
    const each = addRole(d0, 'team.light', true, '#ffffff');
    for (const f of ['soviets', 'allies', 'empire'] as const) expect(each.palette.factions[f].roles['team.light']!.hex).toBe('#FFFFFF');
    expect(addRole(shared, 'fire.blue', false, '#000000')).toBe(shared);
    expect(addRole(d0, 'team', false, '#000000')).toBe(d0);
    expect(addRole(d0, 'Bad Name', false, '#000000')).toBe(d0);
  });

  it('works team.dark and glow.hot out again only when asked, with the board\'s formulas', () => {
    const d0 = start();
    expect(scaleHex('#D41414', 0.7)).toBe(d0.palette.factions.soviets.roles['team.dark']!.hex);
    expect(mixHex('#FF2E63', '#FFFFFF', 0.25)).toBe(d0.palette.factions.soviets.roles['glow.hot']!.hex);
    const d1 = setRoleColour(d0, 'team', 'soviets', '#FF0000');
    expect(d1.palette.factions.soviets.roles['team.dark']!.hex).toBe('#940E0E');
    const d2 = deriveAgain(d1, 'team.dark', 'soviets');
    expect(d2.palette.factions.soviets.roles['team.dark']).toEqual({ ...d0.palette.factions.soviets.roles['team.dark'], hex: '#B30000', from: 'derived' });
  });

  it('undo puts a colour back', () => {
    const h = new History(start());
    const before = h.doc.palette.roles['dust']!.hex;
    h.apply('Colour', setRoleColour(h.doc, 'dust', 'soviets', '#123456'));
    expect(h.dirty).toBe(true);
    h.undo();
    expect(h.doc.palette.roles['dust']!.hex).toBe(before);
    expect(h.dirty).toBe(false);
  });
});

describe('the words box: words typed again', () => {
  const old = [{ text: 'BOOM', chance: 50 }, { text: 'BAM' }, { text: 'POW', chance: 0 }];

  it('keeps each word\'s chance when its text stays the same, in any order; new words get no chance', () => {
    expect(wordsFromText(old, 'POW, BOOM, ZAP')).toEqual([{ text: 'POW', chance: 0 }, { text: 'BOOM', chance: 50 }, { text: 'ZAP' }]);
    expect(wordsFromText(old, 'BOOM, BAM, POW')).toEqual(old);
  });

  it('reads the comma list as the box always did: trimmed, in capitals, empty ones left out', () => {
    expect(wordsFromText(old, '  boom ,, bam,  ')).toEqual([{ text: 'BOOM', chance: 50 }, { text: 'BAM' }]);
    expect(wordsFromText(old, ' , ')).toEqual([]);
  });

  it('matches a word typed twice in order: the first takes the first old one, the next the next', () => {
    const twice = [{ text: 'BOOM', chance: 50 }, { text: 'BOOM', chance: 20 }];
    expect(wordsFromText(twice, 'BOOM, BOOM, BOOM')).toEqual([{ text: 'BOOM', chance: 50 }, { text: 'BOOM', chance: 20 }, { text: 'BOOM' }]);
    expect(wordsFromText(twice, 'BOOM')).toEqual([{ text: 'BOOM', chance: 50 }]);
  });

  it('matches capitals or not, since words are drawn in capitals', () => {
    expect(wordsFromText([{ text: 'boom', chance: 30 }], 'BOOM')).toEqual([{ text: 'BOOM', chance: 30 }]);
  });

  it('is one undo step in the document, and the result passes the checker', () => {
    const h = new History({ palette: paletteJson as Palette, effects: [load('board_shell.vfx.json')] });
    const fx = h.doc.effects[0]!;
    const i = fx.layers.findIndex((l) => l.id === 'word');
    h.apply('Chance', setLayerValue(h.doc, fx.id, 'word', ['words', 1, 'chance'], 30));
    const before = (h.doc.effects[0]!.layers[i] as { words: unknown[] }).words;
    h.apply('Words', setLayerValue(h.doc, fx.id, 'word', ['words'], wordsFromText(before as { text: string; chance?: number }[], 'WHAM, krakoom, ZAP')));
    expect((h.doc.effects[0]!.layers[i] as { words: unknown[] }).words).toEqual([{ text: 'WHAM' }, { text: 'KRAKOOM', chance: 30 }, { text: 'ZAP' }]);
    expect(problemLines(checkEffect(h.doc.effects[0], { palette: paletteJson as Palette }).problems)).toEqual([]);
    h.undo();
    expect((h.doc.effects[0]!.layers[i] as { words: unknown[] }).words).toEqual(before);
  });
});
