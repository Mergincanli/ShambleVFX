import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { BLEND_GROUPS, VfxRenderer, applyControls, resolveTimeline } from '@shamble/vfx-runtime';
import { LOOK_MARGIN, aloneEffect, frameBox, loopMoment, loopSpan, measureBox, stillMoment } from '../src/app/look';
import { makeGameCamera } from '../src/preview/camera';

const palette = paletteJson as Palette;
const repo = resolve(import.meta.dirname, '..', '..', '..');
const effect = (id: string) => JSON.parse(readFileSync(join(repo, 'examples', 'demo-project', 'effects', `${id}.vfx.json`), 'utf8')) as EffectFile;
const inputs = { origin: [-3, 1.2, 1] as [number, number, number], target: [2, 1.1, -0.5] as [number, number, number] };
/** The runtime's own blocks, and a place for every image the demo's sprites use (the pixels do not matter here). */
const images = ['tracer_body.png', 'tracer_core.png', 'muzzle_flash.png', 'hit_star.png', 'dust_puff.png'];
const atlas = {
  image: {} as ImageBitmap, width: 256, height: 64,
  rects: { __white: { x: 2, y: 2, w: 8, h: 8 }, __dot: { x: 14, y: 2, w: 16, h: 16 }, ...Object.fromEntries(images.map((n, i) => [n, { x: 32 + i * 40, y: 2, w: 36, h: 36 }])) },
};
const params = { seed: 7, inputs, faction: 'soviets' as const };
const timeline = (fx: EffectFile) => resolveTimeline(fx, inputs, applyControls(fx.controls));

/** Every vertex drawn at one moment, as text: position, pull, uv, colour and layer, in drawing order per blend group. */
function vertices(fx: EffectFile, ms: number, tier: 'low' | 'medium' | 'high' = 'high', only?: Set<number>): string[] {
  const vfx = new VfxRenderer(palette);
  vfx.setAtlas(atlas);
  vfx.tier = tier;
  vfx.begin(makeGameCamera());
  vfx.draw(fx, { ...params, timeMs: ms });
  const out: string[] = [];
  for (const g of BLEND_GROUPS) {
    const b = vfx.sink.groups[g];
    for (let v = 0; v < b.vcount; v++) {
      if (only && !only.has(b.layer[v]!)) continue;
      out.push(`${g} ${b.layer[v]} ${[...b.pos.subarray(v * 4, v * 4 + 4), ...b.uv.subarray(v * 2, v * 2 + 2), ...b.col.subarray(v * 4, v * 4 + 4)].join(',')}`);
    }
  }
  return out;
}
const at = (fx: EffectFile, id: string) => fx.layers.findIndex((l) => l.id === id);

describe('the Look: the layer alone', () => {
  it('draws exactly the layer\'s own triangles, as the whole effect draws them', () => {
    for (const [id, layer, ms] of [['board_shell', 'burst', 1300], ['board_shell', 'word', 1300], ['board_beam', 'beam_glow', 1000], ['rifle_shot', 'flash', 20]] as const) {
      const fx = effect(id);
      const i = at(fx, layer);
      const own = vertices(fx, ms, 'high', new Set([i]));
      expect(own.length, `${id} ${layer}`).toBeGreaterThan(0);
      expect(vertices(aloneEffect(fx, fx.layers[i]!), ms)).toEqual(own);
    }
  });

  it('draws a rider riding its projectile, and a projectile\'s riders flying', () => {
    const fx = effect('rifle_shot');
    const tracer = at(fx, 'tracer'), core = at(fx, 'tracer_core');
    expect(vertices(aloneEffect(fx, fx.layers[tracer]!), 5)).toEqual(vertices(fx, 5, 'high', new Set([tracer])));
    const riders = vertices(fx, 5, 'high', new Set([tracer, core]));
    expect(riders.length).toBeGreaterThan(0);
    expect(vertices(aloneEffect(fx, fx.layers[at(fx, 'bullet')]!), 5)).toEqual(riders);
  });

  it('shows a layer the preview\'s tier leaves out, as it draws in its own tier', () => {
    const fx = effect('board_molotov');
    const i = at(fx, 'flames_low');
    expect(fx.layers[i]!.type !== 'projectile' && fx.layers[i]!.tiers).toEqual(['low']);
    const own = vertices(fx, 1200, 'low', new Set([i]));
    expect(own.length).toBeGreaterThan(0);
    expect(vertices(aloneEffect(fx, fx.layers[i]!), 1200, 'high')).toEqual(own);
  });

  it('keeps every layer, so the times and the landings stay the same', () => {
    const fx = effect('rifle_shot');
    const alone = aloneEffect(fx, fx.layers[at(fx, 'hit')]!);
    expect(alone.layers.map((l) => l.id)).toEqual(fx.layers.map((l) => l.id));
    expect(timeline(alone).layers).toEqual(timeline(fx).layers);
  });
});

describe('the Look: its time and its frame', () => {
  it('loops over the layer\'s own time; a projectile\'s with its riders\'', () => {
    const fx = effect('rifle_shot'), tl = timeline(fx);
    const span = (id: string) => loopSpan(fx, tl, fx.layers[at(fx, id)]!);
    const flight = tl.byId.get('bullet')!;
    expect(flight.endMs).toBeLessThan(20); // 800 m/s over a few metres
    expect(span('bullet')).toEqual({ start: 0, end: 110 }); // the Tracer lasts 110 ms
    expect(span('flash')).toEqual({ start: tl.byId.get('flash')!.startMs, end: tl.byId.get('flash')!.endMs });
    const bare = { ...fx, layers: fx.layers.filter((l) => l.id !== 'tracer' && l.id !== 'tracer_core') };
    expect(loopSpan(bare, timeline(bare), bare.layers[0]!)).toEqual({ start: flight.startMs, end: flight.endMs });
  });

  it('plays the span, then rests as Loop does; a picture holds the moment shown, or the middle', () => {
    const span = { start: 40, end: 140 };
    expect(loopMoment(span, 0, 300)).toBe(40);
    expect(loopMoment(span, 99, 300)).toBe(139);
    expect(loopMoment(span, 100, 300)).toBeUndefined();
    expect(loopMoment(span, 399, 300)).toBeUndefined();
    expect(loopMoment(span, 410, 300)).toBe(50);
    expect(stillMoment(span, 60)).toBe(60);
    expect(stillMoment(span, 20)).toBe(90);
    expect(stillMoment(span, 140)).toBe(90);
  });

  it('frames the layer\'s box with a margin, to the picture\'s shape, never closer than the smallest box', () => {
    // A wide box in a 2:1 picture: the width decides.
    expect(frameBox({ x0: 100, y0: 200, x1: 500, y1: 260 }, 2, 0.1, 32)).toEqual({ x: 60, y: 110, w: 480, h: 240 });
    // A tall one: the height decides.
    const tall = frameBox({ x0: 0, y0: 0, x1: 50, y1: 200 }, 2, 0.1, 32);
    expect(tall.h).toBeCloseTo(240);
    expect(tall.w).toBeCloseTo(480);
    expect(tall.x + tall.w / 2).toBeCloseTo(25);
    // A speck: at least 32 px of the game screen, with the margin.
    const speck = frameBox({ x0: 10, y0: 10, x1: 10, y1: 10 }, 1, 0.1, 32);
    expect(speck.w).toBeCloseTo(38.4);
    expect(speck.h).toBeCloseTo(38.4);
  });

  it('finds where the layer draws on the game screen over its time, or nothing', () => {
    const fx = effect('board_shell'), tl = timeline(fx);
    const vfx = new VfxRenderer(palette);
    vfx.setAtlas(atlas);
    const burst = fx.layers[at(fx, 'burst')]!;
    const box = measureBox(vfx, makeGameCamera(), aloneEffect(fx, burst), loopSpan(fx, tl, burst)!, params);
    expect(box).toBeDefined();
    // Round the target: the burst is centred on it.
    const cam = makeGameCamera();
    const v = cam.position.clone().set(...inputs.target).project(cam);
    const tx = ((v.x + 1) / 2) * 1920, ty = ((1 - v.y) / 2) * 1080;
    expect(box!.x0).toBeLessThan(tx);
    expect(box!.x1).toBeGreaterThan(tx);
    expect(box!.y0).toBeLessThan(ty);
    expect(box!.y1).toBeGreaterThan(ty);
    // A projectile no layer rides draws nothing.
    const rifle = effect('rifle_shot');
    const bare = { ...rifle, layers: rifle.layers.filter((l) => l.id !== 'tracer' && l.id !== 'tracer_core') };
    const bullet = bare.layers[0]!;
    expect(measureBox(vfx, makeGameCamera(), aloneEffect(bare, bullet), loopSpan(bare, timeline(bare), bullet)!, params)).toBeUndefined();
  });

  it('keeps every moment of the layer\'s time inside its box and margin: a fast streak leaving the muzzle, a landing', () => {
    // The Rifle shot (board)'s tracer is a streak riding a projectile that crosses the screen in 22 ms: its tail stays at
    // the muzzle for a few ms only. Every moment, 1 ms apart, must be inside the box with the Look's margin, or the Look
    // cuts the layer at its edge. The demo's rifle and tank shell fly too.
    for (const [file, ids] of [['board_muzzle', ['tracer_flight', 'tracer']], ['rifle_shot', ['bullet', 'tracer']], ['board_shell', ['shell', 'trail']]] as const) {
      const fx = effect(file), tl = timeline(fx);
      const vfx = new VfxRenderer(palette);
      vfx.setAtlas(atlas);
      for (const id of ids) {
        const layer = fx.layers[at(fx, id)]!;
        const alone = aloneEffect(fx, layer);
        const span = loopSpan(fx, tl, layer)!;
        const box = measureBox(vfx, makeGameCamera(), alone, span, params)!;
        expect(box, `${file} ${id}`).toBeDefined();
        const mx = (box.x1 - box.x0) * LOOK_MARGIN, my = (box.y1 - box.y0) * LOOK_MARGIN;
        let drawn = 0;
        for (let ms = span.start; ms < span.end; ms++) {
          // Where it draws at this moment (a span too short to hold two moments).
          const b = measureBox(vfx, makeGameCamera(), alone, { start: ms, end: ms + 0.01 }, params);
          if (!b) continue;
          drawn++;
          const where = `${file} ${id} at ${ms} ms`;
          expect(b.x0, where).toBeGreaterThanOrEqual(box.x0 - mx);
          expect(b.x1, where).toBeLessThanOrEqual(box.x1 + mx);
          expect(b.y0, where).toBeGreaterThanOrEqual(box.y0 - my);
          expect(b.y1, where).toBeLessThanOrEqual(box.y1 + my);
        }
        expect(drawn, `${file} ${id}`).toBeGreaterThan(5);
      }
    }
  });
});
