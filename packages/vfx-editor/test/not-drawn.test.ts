import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import { newBurstLayer, newEffect, newSpriteLayer } from '@shamble/vfx-format';
import type { EffectFile, Palette, Vec3 } from '@shamble/vfx-format';
import { VfxRenderer } from '@shamble/vfx-runtime';
import { notDrawnNotes, notDrawnReasons } from '../src/doc/not-drawn';

const palette = paletteJson as Palette;

/** A flash that loads; a puff whose file did not load; chips whose image is not in the project; a glint only in High. */
function effect(): EffectFile {
  const fx = newEffect('shot', 'Shot');
  fx.layers = [
    newSpriteLayer('flash', 'Flash', 'flash.png'),
    newSpriteLayer('puff', 'Dust puff', 'puff.png'),
    { ...newBurstLayer('chips', 'Chips'), look: { kind: 'image', image: 'chip.png', tint: { mode: 'keep' } } },
    { ...newSpriteLayer('glint', 'Glint', 'glint.png'), tiers: ['high'] },
  ];
  return fx;
}
const projectImages = ['flash.png', 'puff.png', 'glint.png'];

describe('the layers that cannot draw, in plain words', () => {
  it('says whether the image did not load or is not in the project', () => {
    const fx = effect();
    const notes = notDrawnNotes(fx, [
      { effect: 'shot', layer: 'chips', index: 2, image: 'chip.png' },
      { effect: 'shot', layer: 'puff', index: 1, image: 'puff.png' },
      { effect: 'shot', layer: 'puff', index: 1, image: 'puff.png' },
      { effect: 'other', layer: 'flash', index: 0, image: 'flash.png' },
      { effect: 'shot', layer: 'gone', index: 9, image: 'gone.png' },
    ], projectImages);
    expect(notes).toEqual([
      { layer: 'puff', name: 'Dust puff', image: 'puff.png', why: 'not-loaded', text: 'the image puff.png did not load' },
      { layer: 'chips', name: 'Chips', image: 'chip.png', why: 'missing', text: 'the image chip.png is not in the project' },
    ]);
    expect(notDrawnNotes(fx, [], projectImages)).toEqual([]);
  });

  it('takes what the runtime noted on the frame, and gives a layer the tier leaves out no note', () => {
    const fx = effect();
    const vfx = new VfxRenderer(palette);
    // The atlas holds the images that loaded: the flash only (glint.png is in the project, but did not load either).
    vfx.setAtlas({ image: {} as ImageBitmap, width: 64, height: 32, rects: { 'flash.png': { x: 0, y: 0, w: 16, h: 16 }, __white: { x: 20, y: 2, w: 8, h: 8 } } });
    const camera = new PerspectiveCamera(15, 16 / 9, 1, 400);
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    const inputs = { origin: [0, 1.3, 0] as Vec3, target: [8, 0, 0] as Vec3 };
    const frame = (tier: 'medium' | 'high', timeMs: number) => {
      vfx.tier = tier;
      vfx.begin(camera);
      vfx.draw(fx, { seed: 1, timeMs, inputs, faction: 'soviets' });
      vfx.end();
      return notDrawnNotes(fx, vfx.stats.notDrawn, projectImages).map((n) => `${n.name}: ${n.text}`);
    };
    expect(frame('medium', 50)).toEqual(['Dust puff: the image puff.png did not load', 'Chips: the image chip.png is not in the project']);
    expect(frame('high', 50)).toEqual(['Dust puff: the image puff.png did not load', 'Chips: the image chip.png is not in the project', 'Glint: the image glint.png did not load']);
    // At 400 ms the sprites are over; the chips still fly.
    expect(frame('high', 400)).toEqual(['Chips: the image chip.png is not in the project']);
    vfx.dispose();
  });
});

describe('why each layer is not drawn in the preview now (the "not drawn" warning)', () => {
  const words = (rs: ReturnType<typeof notDrawnReasons>) => rs.map((r) => `${r.name} (${r.why}): ${r.text}`);
  const atlas = new Set(['flash.png', 'glint.png', '__white']);

  it('names an image the atlas does not have at any moment, as notDrawnNotes words it', () => {
    const fx = effect();
    expect(words(notDrawnReasons(fx, { atlasImages: atlas, projectImages, notDrawn: [], tier: 'high', waits: false }))).toEqual([
      'Dust puff (not-loaded): the image puff.png did not load',
      'Chips (missing): the image chip.png is not in the project',
    ]);
    // No atlas yet (the images are still loading): nothing is said about them.
    expect(notDrawnReasons(fx, { atlasImages: null, projectImages, notDrawn: [], tier: 'high', waits: false })).toEqual([]);
  });

  it('takes what the runtime noted on the frame too, once per layer', () => {
    const fx = effect();
    const noted = [{ effect: 'shot', layer: 'flash', index: 0, image: 'flash.png' }, { effect: 'shot', layer: 'puff', index: 1, image: 'puff.png' }];
    expect(words(notDrawnReasons(fx, { atlasImages: atlas, projectImages, notDrawn: noted, tier: 'high', waits: false }))).toEqual([
      'Flash (not-loaded): the image flash.png did not load',
      'Dust puff (not-loaded): the image puff.png did not load',
      'Chips (missing): the image chip.png is not in the project',
    ]);
  });

  it('names a layer the tier leaves out, with the tiers it shows in, before its image', () => {
    const fx = effect();
    fx.layers[1] = { ...fx.layers[1]!, tiers: ['medium', 'high'] } as typeof fx.layers[1];
    expect(words(notDrawnReasons(fx, { atlasImages: new Set(['flash.png', 'puff.png', 'glint.png', 'chip.png']), projectImages, notDrawn: [], tier: 'low', waits: false }))).toEqual([
      'Dust puff (tier): the Low tier leaves it out: it shows in Medium and High',
      'Glint (tier): the Low tier leaves it out: it shows in High',
    ]);
    expect(words(notDrawnReasons(fx, { atlasImages: atlas, projectImages, notDrawn: [], tier: 'low', waits: false }))).toEqual([
      'Dust puff (tier): the Low tier leaves it out: it shows in Medium and High',
      'Dust puff (not-loaded): the image puff.png did not load',
      'Chips (missing): the image chip.png is not in the project',
      'Glint (tier): the Low tier leaves it out: it shows in High',
    ]);
  });

  it('says every layer waits while the effect has errors that stop the preview, first; a projectile gets nothing', () => {
    const fx = effect();
    fx.layers.push({ ...fx.layers[0]!, id: 'p', name: 'Path', type: 'projectile' } as unknown as typeof fx.layers[0]);
    const r = notDrawnReasons(fx, { atlasImages: atlas, projectImages, notDrawn: [], tier: 'high', waits: true });
    expect(words(r).slice(0, 4)).toEqual(['Flash', 'Dust puff', 'Chips', 'Glint'].map((n) => `${n} (errors): its effect has errors that stop the preview`));
    expect(r.some((x) => x.layer === 'p')).toBe(false);
  });
});
