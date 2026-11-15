/**
 * Gradients drawn on smoke (over each puff's life), the fire's bed (from the rim to the middle) and bursts (over each
 * piece's life): the colours at given ages and places, banded edges at the stops, alpha, faction roles, and both bed
 * parts sharing one set of band edges. Colours are read back in sRGB (colour management off), so a hex reads as hex / 255.
 */
import { describe, expect, it } from 'vitest';
import paletteJson from '../../vfx-format/palette/palette.json';
import { newBurstLayer, newEffect, newShapeLayer, parseHex, resolveRole } from '@shamble/vfx-format';
import type { BedShape, BurstLayer, EffectFile, FactionId, Gradient, Palette, ShapeLayer, SmokeShape, Vec3 } from '@shamble/vfx-format';
import { BLEND_GROUPS, DrawSink, evaluate } from '../src/core/index';
import type { CameraBasis, EvalContext } from '../src/core/index';
import { rampAt } from '../src/core/draw';
import type { GradientRamp } from '../src/core/draw';
import { bedBands } from '../src/core/fire';
import { layerSeed, random01 } from '../src/core/random';

const base = paletteJson as Palette;
const hexStop = (at: number, hex: string, alpha?: number) => ({ at, hex, ...(alpha === undefined ? {} : { alpha }) });
const smooth = (...stops: Gradient['stops']): Gradient => ({ kind: 'smooth', from: 'assumed', stops });
const banded = (...stops: Gradient['stops']): Gradient => ({ kind: 'banded', from: 'assumed', stops });
/** Where the bed's bands sit without a gradient, as places from the rim (0) to the middle (1): 0.58 k / (K - 1) + 0.03 k. */
const tonePlaces = (K: number) => Array.from({ length: K }, (_, k) => (K > 1 ? 0.58 * (k / (K - 1)) + 0.03 * k : 0));
const MOLOTOV_TONES = ['heat.dark', 'heat.1', 'heat.2', 'heat.3'];

const palette: Palette = {
  ...base,
  gradients: {
    'test.smooth': smooth(hexStop(0, '#FF00FF'), hexStop(1, '#00FF00')),
    'test.bands': banded(hexStop(0, '#FF0000'), hexStop(0.4, '#00FF00'), hexStop(0.7, '#0000FF')),
    'test.half': smooth(hexStop(0, '#00FF00', 0.5), hexStop(1, '#00FF00', 0.5)),
    'test.gone': smooth(hexStop(0, '#00FF00'), hexStop(0.5, '#00FF00', 0), hexStop(1, '#00FF00', 0)),
    'test.team': banded({ at: 0, role: 'team' }, hexStop(0.5, '#00FF00')),
    'test.opaque': smooth(hexStop(0, '#FF00FF'), hexStop(1, '#00FFFF')),
    'test.tones': banded(...tonePlaces(4).map((at, k) => ({ at, role: MOLOTOV_TONES[k]! }))),
    'test.ramp': smooth(hexStop(0, '#0000FF'), hexStop(0.5, '#008080'), hexStop(1, '#00FF00')),
    'test.layered': smooth(hexStop(0, '#0000FF'), hexStop(1, '#00FF00')),
  },
};

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
    seed: 7, timeMs, inputs: { origin: [0, 1.3, 0], target: [20, 0, 0] }, faction: 'soviets', palette, camera: cam,
    imageRect: () => ({ u0: 0, v0: 0, u1: 0.5, v1: 0.5 }), white: [0.9, 0.9], colourSpace: 'srgb', ...over,
  };
}

function drawn(fx: EffectFile, c: EvalContext): DrawSink {
  const sink = new DrawSink(64);
  evaluate(fx, c, sink);
  return sink;
}

/** Every vertex: colour as "r,g,b,a" (3 decimals), position and atlas u. */
function vertices(sink: DrawSink): { c: string; rgba: number[]; pos: number[]; u: number }[] {
  const out: { c: string; rgba: number[]; pos: number[]; u: number }[] = [];
  for (const g of BLEND_GROUPS) {
    const b = sink.groups[g];
    for (let i = 0; i < b.vcount; i++) {
      const rgba = Array.from(b.col.slice(i * 4, i * 4 + 4));
      out.push({ c: rgba.map((v) => v.toFixed(3)).join(','), rgba, pos: Array.from(b.pos.slice(i * 4, i * 4 + 3)), u: b.uv[i * 2]! });
    }
  }
  return out;
}
const colours = (sink: DrawSink) => new Set(vertices(sink).map((v) => v.c));
/** The atlas u of the plain white point (ctx white), as the vertex buffer holds it. */
const WHITE_U = Math.fround(0.9);
const positions = (sink: DrawSink) => vertices(sink).map((v) => v.pos.map((x) => x.toFixed(5)).join(',')).join(';');
/** A palette colour or a hex as "r,g,b,a" read back in sRGB. */
const rgb = (hexOrRole: string, alpha = 1, faction: FactionId = 'soviets') => {
  const hex = hexOrRole.startsWith('#') ? hexOrRole : resolveRole(base, hexOrRole, faction)!;
  return [...parseHex(hex).map((v) => (v / 255).toFixed(3)), alpha.toFixed(3)].join(',');
};
const mix = (a: number[], b: number[], k: number, alpha = 1) => [...a.map((v, i) => (v + (b[i]! - v) * k).toFixed(3)), alpha.toFixed(3)].join(',');

describe('rampAt: a gradient at one place', () => {
  const s = (at: number, r: number, a = 1) => ({ at, c: [r, 0, 0, a] as [number, number, number, number] });
  const sm: GradientRamp = { banded: false, stops: [s(0.2, 0), s(0.6, 1, 0.5)] };
  const bd: GradientRamp = { banded: true, stops: [s(0.2, 0), s(0.6, 1)] };

  it('blends between stops when smooth, colour and alpha alike', () => {
    rampAt(sm, 0.4).forEach((v, i) => expect(v).toBeCloseTo([0.5, 0, 0, 0.75][i]!, 12));
    expect(rampAt(sm, 0.5)[0]).toBeCloseTo(0.75, 12);
  });

  it('holds the first colour before the first stop and the last after the last stop', () => {
    expect(rampAt(sm, 0)).toEqual([0, 0, 0, 1]);
    expect(rampAt(sm, 1)).toEqual([1, 0, 0, 0.5]);
    expect(rampAt(bd, 0)).toEqual([0, 0, 0, 1]);
  });

  it('holds each colour until the next stop when banded, with the edge at the stop', () => {
    expect(rampAt(bd, 0.5999)).toEqual([0, 0, 0, 1]);
    expect(rampAt(bd, 0.6)).toEqual([1, 0, 0, 1]);
  });

  it('gives a hard edge where two stops share a place, even when smooth', () => {
    const two: GradientRamp = { banded: false, stops: [s(0, 0), s(0.5, 0.2), s(0.5, 0.8), s(1, 1)] };
    expect(rampAt(two, 0.4999)[0]).toBeCloseTo(0.2, 3);
    expect(rampAt(two, 0.5)[0]).toBe(0.8);
  });

  it('returns a new array, so a caller can change it without changing the gradient', () => {
    const c = rampAt(bd, 0.9);
    c[3] = 0;
    expect(bd.stops[1]!.c[3]).toBe(1);
  });
});

describe('smoke coloured by a gradient over each puff life', () => {
  const smoke = (edit: (s: SmokeShape) => void, layer?: (l: ShapeLayer) => void): EffectFile => {
    const fx = newEffect('t', 'T');
    const l = newShapeLayer('s', 'S', 'smoke');
    l.timing = { mode: 'smooth' };
    l.durationMs = 1000;
    if (l.shape.kind === 'smoke') { l.shape.grow = [1, 1, 1]; edit(l.shape); }
    layer?.(l);
    fx.layers = [l];
    return fx;
  };

  it('takes the body colour from the gradient at the puff age; the rim keeps its role', () => {
    const fx = smoke((s) => { s.gradient = 'test.smooth'; });
    const from = parseHex('#FF00FF').map((v) => v / 255), to = parseHex('#00FF00').map((v) => v / 255);
    for (const t of [0, 250, 500, 900]) {
      expect(colours(drawn(fx, ctx(t)))).toEqual(new Set([rgb('ink'), mix(from, to, t / 1000)]));
    }
  });

  it('switches with a hard edge at a banded stop', () => {
    const fx = smoke((s) => { s.gradient = 'test.bands'; });
    expect(colours(drawn(fx, ctx(399)))).toContain(rgb('#FF0000'));
    expect(colours(drawn(fx, ctx(400)))).toContain(rgb('#00FF00'));
    expect(colours(drawn(fx, ctx(699)))).toContain(rgb('#00FF00'));
    expect(colours(drawn(fx, ctx(700)))).toContain(rgb('#0000FF'));
  });

  it('gives each looping billow its own age', () => {
    const fx = smoke((s) => { s.gradient = 'test.smooth'; s.loop = { count: 3, lifeMs: 300 }; });
    const from = parseHex('#FF00FF').map((v) => v / 255), to = parseHex('#00FF00').map((v) => v / 255);
    // At 500 ms the three puffs started at 0, 100 and 200 ms are 200, 100 and 0 ms into their 300 ms lives.
    const c = colours(drawn(fx, ctx(500)));
    for (const age of [2 / 3, 1 / 3, 0]) expect(c).toContain(mix(from, to, age));
  });

  it('fades the whole puff with the gradient alpha: rim, body, light top and halftone', () => {
    const billow = (gradient?: string) => smoke((s) => { s.style = 'billow'; s.lightRole = 'smoke.dark'; s.gradient = gradient; });
    const alphas = (fx: EffectFile) => new Set(vertices(drawn(fx, ctx(300))).map((v) => v.rgba[3]!.toFixed(3)));
    expect(alphas(billow())).toEqual(new Set(['1.000', '0.550']));
    expect(alphas(billow('test.half'))).toEqual(new Set(['0.500', '0.275']));
    const c = colours(drawn(billow('test.half'), ctx(300)));
    expect(c).toContain(rgb('ink', 0.5));
    expect(c).toContain(rgb('smoke.dark', 0.5));
  });

  it('draws nothing, and counts no puff, where the gradient alpha is 0', () => {
    const fx = smoke((s) => { s.gradient = 'test.gone'; });
    expect(drawn(fx, ctx(200)).triangles).toBeGreaterThan(0);
    const late = drawn(fx, ctx(600));
    expect(late.triangles).toBe(0);
    expect(late.items).toBe(0);
  });

  it('follows the faction for a team stop', () => {
    const fx = smoke((s) => { s.gradient = 'test.team'; });
    for (const faction of ['soviets', 'allies', 'empire'] as const) expect(colours(drawn(fx, ctx(100, { faction })))).toContain(rgb('team', 1, faction));
  });

  it('moves nothing: the same puffs in the same places with or without a gradient', () => {
    const plain = smoke((s) => { s.style = 'billow'; s.loop = { count: 4, lifeMs: 400 }; });
    const coloured = smoke((s) => { s.style = 'billow'; s.loop = { count: 4, lifeMs: 400 }; s.gradient = 'test.opaque'; });
    for (const t of [120, 450, 800]) expect(positions(drawn(coloured, ctx(t)))).toBe(positions(drawn(plain, ctx(t))));
  });

  it('draws its own role when the palette has no such gradient (the checker names it)', () => {
    const plain = smoke(() => undefined), missing = smoke((s) => { s.gradient = 'no.such'; });
    expect(vertices(drawn(missing, ctx(300)))).toEqual(vertices(drawn(plain, ctx(300))));
  });
});

describe('bursts coloured by a gradient over each piece life', () => {
  const burst = (edit: (l: BurstLayer) => void): EffectFile => {
    const fx = newEffect('t', 'T');
    const l = newBurstLayer('b', 'B');
    l.timing = { mode: 'smooth' };
    l.lifeMs = [400, 400];
    l.count = 6;
    edit(l);
    fx.layers = [l];
    return fx;
  };

  it('replaces the look colour with the gradient at the piece age; ink edges stay ink', () => {
    const fx = burst((l) => { l.gradient = 'test.smooth'; });
    const from = parseHex('#FF00FF').map((v) => v / 255), to = parseHex('#00FF00').map((v) => v / 255);
    for (const t of [0, 100, 200, 399]) expect(colours(drawn(fx, ctx(t)))).toEqual(new Set([rgb('ink'), mix(from, to, t / 400)]));
  });

  it('switches with a hard edge at a banded stop', () => {
    const fx = burst((l) => { l.gradient = 'test.bands'; });
    expect(colours(drawn(fx, ctx(159)))).toEqual(new Set([rgb('ink'), rgb('#FF0000')]));
    expect(colours(drawn(fx, ctx(160)))).toEqual(new Set([rgb('ink'), rgb('#00FF00')]));
    expect(colours(drawn(fx, ctx(280)))).toEqual(new Set([rgb('ink'), rgb('#0000FF')]));
  });

  it('gives each looping piece its own age', () => {
    const fx = burst((l) => { l.gradient = 'test.smooth'; l.loop = true; l.durationMs = 1000; });
    const l = fx.layers[0] as BurstLayer;
    const from = parseHex('#FF00FF').map((v) => v / 255), to = parseHex('#00FF00').map((v) => v / 255);
    // The burst's own clock: each piece starts at a random share of its life (random stream 62).
    const mixSeed = layerSeed(l, 7);
    const want = new Set([rgb('ink')]);
    for (let i = 0; i < l.count; i++) {
      const t = 250 + random01(mixSeed, 62, i) * 400;
      want.add(mix(from, to, (t - Math.floor(t / 400) * 400) / 400));
    }
    expect(colours(drawn(fx, ctx(250)))).toEqual(want);
    expect(want.size).toBeGreaterThan(3);
  });

  it('fades the whole piece with the gradient alpha: fill, ink edge and speed streak', () => {
    const fx = burst((l) => { l.gradient = 'test.half'; l.streak = { role: 'heat.3', lengthM: 0.4, widthPx: 4 }; });
    const c = colours(drawn(fx, ctx(150)));
    expect(c).toEqual(new Set([rgb('#00FF00', 0.5), rgb('ink', 0.5), rgb('heat.3', 0.5)]));
  });

  it('draws nothing, and counts no piece, where the gradient alpha is 0', () => {
    const fx = burst((l) => { l.gradient = 'test.gone'; });
    expect(drawn(fx, ctx(100)).items).toBe(6);
    const late = drawn(fx, ctx(250));
    expect(late.triangles).toBe(0);
    expect(late.items).toBe(0);
  });

  it('multiplies an image piece by the gradient colour, in place of its tint', () => {
    const fx = burst((l) => { l.look = { kind: 'image', image: 'chip.png', tint: { mode: 'multiply', role: 'heat.1' } }; l.gradient = 'test.bands'; });
    expect(colours(drawn(fx, ctx(300)))).toEqual(new Set([rgb('#0000FF')]));
  });

  it("draws your own team's broken edge in the gradient colour", () => {
    const fx = burst((l) => { l.gradient = 'test.bands'; });
    expect(colours(drawn(fx, ctx(300, { relation: 'team' })))).toEqual(new Set([rgb('#0000FF')]));
  });

  it('follows the faction for a team stop', () => {
    const fx = burst((l) => { l.gradient = 'test.team'; l.look = { kind: 'chip', role: 'debris', inkPx: 0, edge: 'none' }; });
    for (const faction of ['soviets', 'allies', 'empire'] as const) expect(colours(drawn(fx, ctx(50, { faction })))).toEqual(new Set([rgb('team', 1, faction)]));
  });

  it('moves nothing: the same pieces in the same places with or without a gradient', () => {
    const plain = burst((l) => { l.loop = true; l.durationMs = 1000; l.streak = { role: 'heat.3', lengthM: 0.4, widthPx: 4 }; });
    const coloured = burst((l) => { l.loop = true; l.durationMs = 1000; l.streak = { role: 'heat.3', lengthM: 0.4, widthPx: 4 }; l.gradient = 'test.opaque'; });
    for (const t of [30, 260, 390]) expect(positions(drawn(coloured, ctx(t)))).toBe(positions(drawn(plain, ctx(t))));
  });

  it('draws its look colour when the palette has no such gradient (the checker names it)', () => {
    const plain = burst(() => undefined), missing = burst((l) => { l.gradient = 'no.such'; });
    expect(vertices(drawn(missing, ctx(200)))).toEqual(vertices(drawn(plain, ctx(200))));
  });
});

describe("the fire's bed coloured by a gradient from the rim to the middle", () => {
  /** A bed layer lying flat on the ground, so its drawing's x and y are the ground's x and z (no tilt, no lift). */
  const bed = (edit: (s: BedShape) => void, id = 'bed'): EffectFile => {
    const fx = newEffect('t', 'T');
    const l = newShapeLayer(id, 'Bed', 'bed');
    l.facing = 'ground';
    l.durationMs = 3000;
    if (l.shape.kind === 'bed') { l.shape.lumps = 14; l.shape.breakUp = { lastMs: 1000 }; edit(l.shape); }
    fx.layers = [l];
    return fx;
  };
  const shapeOf = (fx: EffectFile) => (fx.layers[0] as ShapeLayer).shape as BedShape;
  const FULL = 1000, COOL = 2550;
  /** The ground-plane drawing coordinates of a ground layer at the origin (as frameFor lays it). */
  const u = (() => { const l = Math.hypot(cam.right[0], cam.right[2]); return [cam.right[0] / l, cam.right[2] / l]; })();
  const v = (() => { const l = Math.hypot(cam.forward[0], cam.forward[2]); return [cam.forward[0] / l, cam.forward[2] / l]; })();
  const flat = (p: number[]) => [p[0]! * u[0]! + p[2]! * u[1]!, p[0]! * v[0]! + p[2]! * v[1]!] as const;
  /** The discs of one colour, in drawing order: each is a centre vertex and 20 round it. */
  const discsOf = (sink: DrawSink, c: string) => {
    const vs = vertices(sink).filter((x) => x.c === c && x.u === WHITE_U);
    const out: { x: number; y: number; rx: number; ry: number }[] = [];
    for (let i = 0; i + 21 <= vs.length; i += 21) {
      const [x, y] = flat(vs[i]!.pos), [x0] = flat(vs[i + 1]!.pos), [, y5] = flat(vs[i + 6]!.pos);
      out.push({ x, y, rx: x0 - x, ry: y5 - y });
    }
    return out;
  };

  it('puts the band edges at the stops, the first band at the rim', () => {
    const fx = bed((s) => { s.gradient = 'test.bands'; });
    const bands = bedBands(shapeOf(fx), { gradient: () => ({ banded: true, stops: [0, 0.4, 0.7].map((at) => ({ at, c: [1, 1, 1, 1] })) }), rgba: () => [1, 1, 1, 1] } as never);
    expect(bands.map((b) => 1 - b.rho - b.r0).map((p) => +p.toFixed(12))).toEqual([0, 0.4, 0.7]);
    // As drawn: each band's lumps (one flat colour per band) reach out, on average, to the band's place.
    const sink = drawn(fx, ctx(FULL));
    const R = shapeOf(fx).radiusM;
    ['#FF0000', '#00FF00', '#0000FF'].forEach((hex, k) => {
      // The band's base oval, then its lumps (as many as bandLumps makes); the white-hot spots come after.
      const n = Math.max(4, Math.round(14 * (bands[k]!.rho / 0.76)));
      const [oval, ...lumps] = discsOf(sink, rgb(hex)).slice(0, n + 1);
      expect(lumps).toHaveLength(n);
      const reach = lumps.reduce((m, q) => m + Math.hypot(q.x - oval!.x, q.y - oval!.y) + q.rx, 0) / lumps.length;
      expect(Math.abs(reach / R - (1 - [0, 0.4, 0.7][k]!))).toBeLessThan(0.05);
    });
  });

  it("draws exactly today's tones picture from a banded gradient at the tones' places, both parts", () => {
    for (const part of ['lumps', 'detail'] as const) {
      const tones = bed((s) => { s.part = part; s.tones = [...MOLOTOV_TONES]; });
      const grad = bed((s) => { s.part = part; s.tones = ['white']; s.gradient = 'test.tones'; });
      for (const t of [100, FULL, 2200, COOL, 2800]) for (const relation of ['enemy', 'team'] as const) {
        const a = drawn(tones, ctx(t, { relation, colourSpace: 'linear' })), b = drawn(grad, ctx(t, { relation, colourSpace: 'linear' }));
        expect(b.triangles).toBe(a.triangles);
        expect(b.items).toBe(a.items);
        for (const g of BLEND_GROUPS) {
          const A = a.groups[g], B = b.groups[g];
          let worst = 0;
          for (let i = 0; i < A.vcount * 4; i++) worst = Math.max(worst, Math.abs(A.pos[i]! - B.pos[i]!), Math.abs(A.col[i]! - B.col[i]!));
          expect(worst).toBeLessThan(1e-9);
          expect(Array.from(B.idx.slice(0, B.icount))).toEqual(Array.from(A.idx.slice(0, A.icount)));
        }
      }
    }
  });

  it('holds one flat colour per band when banded', () => {
    const c = colours(drawn(bed((s) => { s.gradient = 'test.bands'; }), ctx(FULL)));
    for (const hex of ['#FF0000', '#00FF00', '#0000FF']) expect(c).toContain(rgb(hex));
    expect([...c].filter((x) => x !== rgb('ink') && x !== rgb('heat.deep'))).toHaveLength(3);
  });

  it('blends from band to band when smooth, and the middle cools when the inner band goes', () => {
    const fx = bed((s) => { s.gradient = 'test.ramp'; });
    const greens = (t: number) => vertices(drawn(fx, ctx(t))).filter((x) => x.rgba[0] === 0 && x.u === WHITE_U).map((x) => x.rgba[1]!);
    const full = greens(FULL);
    // Many shades between the rim's blue and the middle's green, all on the gradient.
    expect(new Set(full.map((g) => g.toFixed(2))).size).toBeGreaterThan(20);
    expect(Math.min(...full)).toBeLessThan(0.05);
    expect(Math.max(...full)).toBeCloseTo(1, 6);
    // Half cooled: the inner band (0.5 to the middle) is gone, so nothing is greener than the place 0.5 (#008080).
    expect(Math.max(...greens(COOL))).toBeLessThanOrEqual(128 / 255 + 1e-6);
  });

  it("puts the detail's halftone in the next band's colour: its middle colour when smooth", () => {
    const dots = (gradient: string) => {
      const sink = drawn(bed((s) => { s.part = 'detail'; s.gradient = gradient; }), ctx(FULL, { dot: { u0: 0.6, v0: 0.6, u1: 0.7, v1: 0.7 } }));
      return new Set(vertices(sink).filter((x) => x.u >= 0.6 && x.u <= 0.7).map((x) => x.c));
    };
    expect(dots('test.bands')).toEqual(new Set([rgb('#00FF00'), rgb('#0000FF')]));
    // Smooth, two bands: the outer band's halftone is the inner band's colour halfway in (place 0.75).
    expect(dots('test.ramp')).toEqual(new Set([mix([0, 128 / 255, 128 / 255], [0, 1, 0], 0.5)]));
  });

  it("puts both parts' bands in the same places: each halftone dot lies on its band's lumps", () => {
    // Same layer id and seed, so both parts draw the very same lumps.
    const lumps = drawn(bed((s) => { s.gradient = 'test.bands'; }), ctx(FULL));
    const detail = drawn(bed((s) => { s.gradient = 'test.bands'; s.part = 'detail'; }), ctx(FULL, { dot: { u0: 0.6, v0: 0.6, u1: 0.7, v1: 0.7 } }));
    const bands = ['#FF0000', '#00FF00', '#0000FF'].map((hex) => discsOf(lumps, rgb(hex)));
    let n = 0;
    ['#00FF00', '#0000FF'].forEach((hex, k) => {
      const vs = vertices(detail).filter((x) => x.u >= 0.6 && x.u <= 0.7 && x.c === rgb(hex));
      for (let i = 0; i + 4 <= vs.length; i += 4) {
        const [x, y] = flat([0, 1, 2].map((j) => (vs[i]!.pos[j]! + vs[i + 2]!.pos[j]!) / 2));
        // Dots of band k + 1's colour sit on band k's lumps (or its base oval), where band k meets band k + 1.
        expect(bands[k]!.some((q) => ((x - q.x) / q.rx) ** 2 + ((y - q.y) / q.ry) ** 2 < 1 + 1e-6)).toBe(true);
        n++;
      }
    });
    expect(n).toBeGreaterThan(20);
  });

  it("takes the stops' alpha into the band fills", () => {
    const fx = bed((s) => { s.gradient = 'test.half'; });
    const fills = vertices(drawn(fx, ctx(FULL))).filter((x) => x.c.startsWith(rgb('#00FF00').slice(0, 17)));
    expect(fills.length).toBeGreaterThan(100);
    expect(new Set(fills.map((x) => x.rgba[3]!.toFixed(3)))).toEqual(new Set(['0.500']));
  });

  it('follows the faction for a team stop', () => {
    const fx = bed((s) => { s.gradient = 'test.team'; });
    for (const faction of ['soviets', 'allies', 'empire'] as const) expect(colours(drawn(fx, ctx(FULL, { faction })))).toContain(rgb('team', 1, faction));
  });

  it('keeps every band inside the last one, whatever the stops', () => {
    const cases: GradientRamp['stops'][] = [
      [0, 1], [0, 0.5, 0.5, 1], [0, 0.03, 0.06, 0.09, 0.12], [0, 0.97], [0.3, 0.6, 1],
      Array.from({ length: 16 }, (_, k) => k / 16), Array.from({ length: 16 }, (_, k) => k / 15),
    ].map((ats) => ats.map((at) => ({ at, c: [1, 1, 1, 1] as [number, number, number, number] })));
    for (const stops of cases) for (const isBanded of [true, false]) {
      const bands = bedBands(shapeOf(bed((s) => { s.gradient = 'x'; })), { gradient: () => ({ banded: isBanded, stops }), rgba: () => [1, 1, 1, 1] } as never);
      expect(bands.length).toBeGreaterThan(0);
      bands.forEach((b, j) => {
        expect(b.rho).toBeGreaterThan(0);
        expect(b.r0).toBeGreaterThan(0);
        expect(Number.isFinite(b.z)).toBe(true);
        if (j) expect(0.1 * (b.z - bands[j - 1]!.z) + b.rho + b.r0).toBeLessThanOrEqual(bands[j - 1]!.rho + bands[j - 1]!.r0 + 1e-12);
      });
    }
  });

  it('leaves out a band with no room: two stops at one place, or a stop at the very middle', () => {
    const g = (ats: number[]) => ({ gradient: () => ({ banded: true, stops: ats.map((at) => ({ at, c: [1, 1, 1, 1] })) }), rgba: () => [1, 1, 1, 1] }) as never;
    const sp = shapeOf(bed((s) => { s.gradient = 'x'; }));
    expect(bedBands(sp, g([0, 0.5, 0.5, 1])).map((b) => [b.lo, b.hi])).toEqual([[0, 0.5], [0.5, 1]]);
    expect(bedBands(sp, g([0, 1]))).toHaveLength(1);
  });

  it('draws its tones when the palette has no such gradient (the checker names it)', () => {
    const plain = bed(() => undefined), missing = bed((s) => { s.gradient = 'no.such'; });
    expect(vertices(drawn(missing, ctx(FULL)))).toEqual(vertices(drawn(plain, ctx(FULL))));
  });
});
