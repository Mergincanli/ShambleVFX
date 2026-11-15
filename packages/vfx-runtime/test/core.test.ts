import { describe, expect, it } from 'vitest';
import paletteJson from '../../vfx-format/palette/palette.json';
import { newEffect, newProjectileLayer, newSpriteLayer, parseHex, srgbToLinear } from '@shamble/vfx-format';
import type { EffectFile, Palette, SpriteLayer, Vec3 } from '@shamble/vfx-format';
import { DrawSink, applyControls, evaluate, hash32, random01, readQuads, resolveTimeline, stepIndex } from '../src/core/index';
import type { CameraBasis, EvalContext } from '../src/core/index';

const palette = paletteJson as Palette;

// The game camera (VFX drawing board v7): 35.3 degrees above the ground, turned 45 degrees.
function gameCamera(): CameraBasis {
  const p = (35.3 * Math.PI) / 180, y = (45 * Math.PI) / 180;
  const back: Vec3 = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  const forward: Vec3 = [-back[0], -back[1], -back[2]];
  const right: Vec3 = [Math.cos(y), 0, -Math.sin(y)];
  const up: Vec3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  return { right, up, forward };
}
const cam = gameCamera();

function ctx(timeMs: number, over: Partial<EvalContext> = {}): EvalContext {
  return {
    seed: 7,
    timeMs,
    inputs: { origin: [0, 1.3, 0], target: [20, 0, 0] },
    faction: 'soviets',
    palette,
    camera: cam,
    imageRect: (name) => (name === 'missing.png' ? undefined : { u0: 0, v0: 0, u1: 0.5, v1: 0.5 }),
    ...over,
  };
}

/** A shell (40 m/s), a streak riding it, a 4-frame flash at the muzzle, a landing that starts on arrival. */
function demo(): EffectFile {
  const fx = newEffect('demo', 'Demo');
  const shell = newProjectileLayer('shell', 'Shell');
  shell.flight = { mode: 'speed', mps: 40 };
  shell.stretch = 2;
  const streak: SpriteLayer = { ...newSpriteLayer('streak', 'Streak', 'streak.png'), at: { layer: 'shell' }, facing: 'path', pivot: [1, 0.5], sizeM: [1, 0.2] };
  delete streak.durationMs;
  const flash: SpriteLayer = { ...newSpriteLayer('flash', 'Flash', 'flash.png'), flipbook: { cols: 2, rows: 2, frames: 4, loop: false } };
  delete flash.durationMs;
  const land: SpriteLayer = { ...newSpriteLayer('land', 'Landing', 'land.png'), start: { arrivalOf: 'shell', ms: 50 }, at: { input: 'target', offset: [0, 0, 0] }, durationMs: 300, tint: { mode: 'multiply', role: 'team' } };
  fx.layers = [shell, streak, flash, land];
  return fx;
}

function run(fx: EffectFile, c: EvalContext) {
  const sink = new DrawSink(16);
  const r = evaluate(fx, c, sink);
  return { r, sink, quads: readQuads(sink.groups['top-normal']) };
}

describe('steps', () => {
  it('counts whole steps, and lands exactly on step boundaries', () => {
    expect(stepIndex(0, 12)).toBe(0);
    expect(stepIndex(83.3, 12)).toBe(0);
    expect(stepIndex(1000 / 12, 12)).toBe(1);
    expect(stepIndex(2000 / 12, 12)).toBe(2);
    expect(stepIndex(999.99, 12)).toBe(11);
    expect(stepIndex(1000, 12)).toBe(12);
    expect(stepIndex(41.67, 24)).toBe(1);
  });
});

describe('timeline', () => {
  it('works out flight time from distance and speed, and starts the landing on arrival', () => {
    const fx = demo();
    const tl = resolveTimeline(fx, ctx(0).inputs, applyControls(fx.controls));
    const dist = Math.hypot(20, -1.3, 0);
    expect(tl.byId.get('shell')!.endMs).toBeCloseTo((dist / 40) * 1000, 6);
    expect(tl.byId.get('streak')!.endMs).toBeCloseTo(tl.byId.get('shell')!.endMs, 6);
    expect(tl.byId.get('flash')!.endMs).toBeCloseTo(4 * (1000 / 12), 6);
    expect(tl.byId.get('land')!.startMs).toBeCloseTo(tl.byId.get('shell')!.endMs + 50, 6);
    expect(tl.lengthMs).toBeCloseTo(tl.byId.get('land')!.startMs + 300, 6);
  });

  it('lets the duration control stretch authored times but not flight time', () => {
    const fx = demo();
    fx.controls.duration = 2;
    const tl = resolveTimeline(fx, ctx(0).inputs, applyControls(fx.controls));
    const flight = (Math.hypot(20, -1.3, 0) / 40) * 1000;
    expect(tl.byId.get('shell')!.endMs).toBeCloseTo(flight, 6);
    expect(tl.byId.get('land')!.startMs).toBeCloseTo(flight + 100, 6);
    expect(tl.byId.get('land')!.endMs - tl.byId.get('land')!.startMs).toBeCloseTo(600, 6);
    // A flipbook keeps 12 steps a second; each frame holds two steps.
    expect(tl.byId.get('flash')!.endMs).toBeCloseTo(8 * (1000 / 12), 6);
  });

  it('lets the size control scale offsets but not the points the game gives', () => {
    const fx = demo();
    fx.layers[0] = { ...(fx.layers[0] as any), from: { input: 'origin', offset: [0, 0, 1] } };
    fx.controls.size = 3;
    const tl = resolveTimeline(fx, ctx(0).inputs, applyControls(fx.controls));
    const f = tl.byId.get('shell')!.flight!;
    expect(f.to).toEqual([20, 0, 0]);
    expect(f.from[0]).toBeCloseTo(3, 9); // 1 m forward (towards the target) x size 3
    expect(f.from[1]).toBeCloseTo(1.3, 9);
  });
});

describe('evaluate', () => {
  it('gives the same picture for the same seed and time, in any order', () => {
    const fx = demo();
    const sink = new DrawSink(8);
    const snap = (t: number) => {
      sink.clear();
      evaluate(fx, ctx(t), sink);
      const b = sink.groups['top-normal'];
      return Buffer.from(b.pos.buffer.slice(0, b.vcount * 16)).toString('hex') + Buffer.from(b.uv.buffer.slice(0, b.vcount * 8)).toString('hex') + Buffer.from(b.idx.buffer.slice(0, b.icount * 4)).toString('hex');
    };
    const a = snap(300);
    snap(100);
    snap(700);
    expect(snap(300)).toBe(a);
    expect(a.length).toBeGreaterThan(0);
  });

  it('moves a stepped projectile in steps, so its rider holds still within a step', () => {
    const fx = demo();
    const at = (t: number) => run(fx, ctx(t)).quads.find((q) => q.layer === 1)!.centre;
    expect(at(90)).toEqual(at(160)); // both in step 1 (83.3 .. 166.7 ms)
    expect(at(170)).not.toEqual(at(160));
  });

  it('moves a smooth projectile every moment', () => {
    const fx = demo();
    fx.layers[0]!.timing = { mode: 'smooth' };
    const at = (t: number) => run(fx, ctx(t)).quads.find((q) => q.layer === 1)!.centre;
    expect(at(100)).not.toEqual(at(110));
  });

  it('lays a riding streak along the path and never past its start', () => {
    const fx = demo();
    // Step 0: the shell is still at the muzzle, so the streak (head at the shell, tail behind) has no length.
    expect(run(fx, ctx(10)).quads.some((q) => q.layer === 1)).toBe(false);
    // Later, the streak is 1 m x stretch 2 long, pointing along the path.
    const q = run(fx, ctx(250)).quads.find((x) => x.layer === 1)!;
    const len = Math.hypot(...q.axisX);
    expect(len).toBeCloseTo(2, 5);
    const path = [20, -1.3, 0];
    const pl = Math.hypot(...path);
    const cosAngle = (q.axisX[0] * path[0]! + q.axisX[1] * path[1]! + q.axisX[2] * path[2]!) / (len * pl);
    expect(cosAngle).toBeCloseTo(1, 6);
  });

  it('shows one flipbook frame per step, read left to right, top to bottom', () => {
    const fx = demo();
    const uvAt = (t: number) => run(fx, ctx(t)).quads.find((q) => q.layer === 2)!.uv;
    expect(uvAt(10)).toEqual([0, 0, 0.25, 0.25]);
    expect(uvAt(100)).toEqual([0.25, 0, 0.5, 0.25]);
    expect(uvAt(200)).toEqual([0, 0.25, 0.25, 0.5]);
    expect(uvAt(300)).toEqual([0.25, 0.25, 0.5, 0.5]);
    expect(run(fx, ctx(340)).quads.some((q) => q.layer === 2)).toBe(false); // 4 steps = 333 ms
  });

  it('puts the pivot on the anchor', () => {
    const fx = newEffect('p', 'P');
    const s: SpriteLayer = { ...newSpriteLayer('s', 'S', 'a.png'), pivot: [0.5, 1], sizeM: [1, 2] };
    fx.layers = [s];
    const q = run(fx, ctx(0)).quads[0]!;
    // Bottom-centre pivot: the centre is one metre (half the height) up the camera's up from the origin.
    for (let k = 0; k < 3; k++) expect(q.centre[k]).toBeCloseTo([0, 1.3, 0][k]! + cam.up[k]!, 6);
  });

  it('pulls a sprite towards the camera by as much as it reaches below its anchor', () => {
    const fx = newEffect('p', 'P');
    const centred: SpriteLayer = { ...newSpriteLayer('a', 'A', 'a.png'), at: { input: 'target', offset: [0, 0, 0] }, sizeM: [1, 1] };
    const standing: SpriteLayer = { ...centred, id: 'b', pivot: [0.5, 1] };
    fx.layers = [centred, standing];
    const [a, b] = run(fx, ctx(0)).quads;
    const cot = 1 / Math.tan((35.3 * Math.PI) / 180);
    expect(a!.pull).toBeCloseTo(0.5 * cot + 0.02, 5);
    expect(b!.pull).toBeCloseTo(0.02, 5);
  });

  it("tints by role, with team colours following the faction that fired, and 'main' following the colour control", () => {
    const fx = demo();
    const lin = (hex: string) => parseHex(hex).map((v) => srgbToLinear(v / 255));
    const tl = resolveTimeline(fx, ctx(0).inputs, applyControls(fx.controls));
    const tLand = tl.byId.get('land')!.startMs + 10;
    const land = (f: EvalContext['faction']) => run(fx, ctx(tLand, { faction: f })).quads.find((q) => q.layer === 3)!.colour;
    expect(land('allies').slice(0, 3)).toEqual(lin('#1F6FF0').map((v) => Math.fround(v)));
    expect(land('empire').slice(0, 3)).toEqual(lin('#890089').map((v) => Math.fround(v)));
    (fx.layers[3] as SpriteLayer).tint = { mode: 'multiply', role: 'main' };
    fx.controls.colour = 'heat.1';
    expect(land('allies').slice(0, 3)).toEqual(lin('#F47A1C').map((v) => Math.fround(v)));
  });

  it('skips a layer whose image is missing, and names it', () => {
    const fx = demo();
    (fx.layers[2] as SpriteLayer).image = 'missing.png';
    const { r, quads } = run(fx, ctx(10));
    expect(r.missingImages).toEqual(['missing.png']);
    expect(quads.some((q) => q.layer === 2)).toBe(false);
  });

  it('grows flash-like sprites with intensity, and all sprites with size', () => {
    const fx = demo();
    const flashWidth = () => Math.hypot(...run(fx, ctx(10)).quads.find((q) => q.layer === 2)!.axisX);
    expect(flashWidth()).toBeCloseTo(1, 6);
    fx.controls.intensity = 1.5;
    expect(flashWidth()).toBeCloseTo(1.5, 6);
    fx.controls.size = 2;
    expect(flashWidth()).toBeCloseTo(3, 6);
  });

  it('turns a riding sprite by the projectile\'s spin, in the view plane', () => {
    const fx = newEffect('spin', 'Spin');
    const p = newProjectileLayer('p', 'P');
    p.spinDegPerS = 90;
    const r: SpriteLayer = { ...newSpriteLayer('r', 'R', 'a.png'), at: { layer: 'p' }, sizeM: [1, 1], durationMs: 2000 };
    fx.layers = [p, r];
    const still = ctx(500, { inputs: { origin: [0, 0, 0], target: [0, 0, 0] } });
    const q = run(fx, still).quads[0]!;
    // 500 ms at 90 degrees a second: a quarter turn of a quarter turn, 45 degrees. x axis = right cos45 + up sin45.
    const c = Math.SQRT1_2;
    for (let k = 0; k < 3; k++) expect(q.axisX[k]).toBeCloseTo(cam.right[k]! * c + cam.up[k]! * c, 5);
    for (let k = 0; k < 3; k++) expect(q.axisY[k]).toBeCloseTo(cam.up[k]! * c - cam.right[k]! * c, 5);
    // At 0 ms it has not turned.
    const q0 = run(fx, ctx(0, { inputs: { origin: [0, 0, 0], target: [0, 0, 0] } })).quads[0]!;
    for (let k = 0; k < 3; k++) expect(q0.axisX[k]).toBeCloseTo(cam.right[k]!, 6);
  });

  it('grows the sink when it runs out of room', () => {
    const fx = newEffect('many', 'Many');
    fx.layers = Array.from({ length: 40 }, (_, i) => newSpriteLayer(`s${i}`, `S${i}`, 'a.png'));
    const sink = new DrawSink(4);
    expect(evaluate(fx, ctx(0), sink).triangles).toBe(80);
    expect(sink.groups['top-normal'].vcount).toBe(160);
    expect(sink.groups['top-normal'].generation).toBeGreaterThan(0);
  });
});

describe('random from the seed', () => {
  it('is the same for the same numbers, and different for a different seed', () => {
    expect(hash32(1, 2, 3, 4)).toBe(hash32(1, 2, 3, 4));
    expect(hash32(1, 2, 3, 4)).not.toBe(hash32(2, 2, 3, 4));
    expect(random01(5, 1)).not.toBe(random01(5, 2));
  });
  it('is spread evenly between 0 and 1', () => {
    let sum = 0;
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const r = random01(42, i, 3);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      sum += r;
      buckets[Math.floor(r * 10)]++;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
    for (const b of buckets) expect(b).toBeGreaterThan(1700);
  });
});
