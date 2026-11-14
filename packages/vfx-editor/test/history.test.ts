import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { checkEffect, problemLines } from '@shamble/vfx-format/validate';
import { History } from '../src/doc/history';
import type { EditorDoc } from '../src/doc/history';
import { addLayer, duplicateLayer, moveLayer, newProjectile, newSprite, removeLayer, setEffectValue, setIn, setLayerValue } from '../src/doc/edits';

const here = dirname(fileURLToPath(import.meta.url));
const load = (f: string) => JSON.parse(readFileSync(join(here, '../../../examples/demo-project/effects', f), 'utf8')) as EffectFile;
const start = (): EditorDoc => ({ effects: [load('rifle_shot.vfx.json'), load('shell_flight.vfx.json')] });
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
