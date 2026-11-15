import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import paletteJson from '../../vfx-format/palette/palette.json';
import { WORD_LETTERS, newBurstLayer, newEffect, newProjectileLayer, newShapeLayer, newSpriteLayer, newWordLayer, parseHex, resolveRole, srgbToLinear } from '@shamble/vfx-format';
import type { BedShape, EffectFile, FlamesShape, Palette, ShapeLayer, Vec3 } from '@shamble/vfx-format';
import { BLEND_GROUPS, DrawSink, applyControls, evaluate, resolveTimeline } from '../src/core/index';
import type { CameraBasis, EvalContext } from '../src/core/index';
import { LETTERS } from '../src/core/letters';
import { flightPoint } from '../src/core/timeline';
import { tongueLayout } from '../src/core/fire';
import { Painter } from '../src/core/painter';
import { random01 } from '../src/core/random';

const palette = paletteJson as Palette;

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
    imageRect: () => ({ u0: 0, v0: 0, u1: 0.5, v1: 0.5 }),
    white: [0.9, 0.9],
    ...over,
  };
}

/** Everything one evaluate() call wrote, as one string per buffer (positions, pull, colours). */
function picture(fx: EffectFile, c: EvalContext): string {
  const sink = new DrawSink(64);
  evaluate(fx, c, sink);
  return BLEND_GROUPS.map((g) => {
    const b = sink.groups[g];
    return `${g}:${Array.from(b.pos.slice(0, b.vcount * 4)).map((v) => v.toFixed(4)).join(',')}|${Array.from(b.col.slice(0, b.vcount * 4)).map((v) => v.toFixed(3)).join(',')}`;
  }).join('\n');
}

function drawn(fx: EffectFile, c: EvalContext) {
  const sink = new DrawSink(64);
  const r = evaluate(fx, c, sink);
  return { r, sink };
}

function oneShape(kind: Parameters<typeof newShapeLayer>[2], edit?: (l: ShapeLayer) => void): EffectFile {
  const fx = newEffect('t', 'T');
  const l = newShapeLayer('s', 'S', kind);
  edit?.(l);
  fx.layers = [l];
  return fx;
}

/** How many vertices carry a colour (sRGB hex, written linear). */
function verticesOf(sink: DrawSink, hex: string): number {
  const want = parseHex(hex).map((v) => Math.fround(srgbToLinear(v / 255)));
  let n = 0;
  for (const g of BLEND_GROUPS) {
    const b = sink.groups[g];
    for (let i = 0; i < b.vcount; i++) {
      if (Math.abs(b.col[i * 4]! - want[0]!) < 1e-5 && Math.abs(b.col[i * 4 + 1]! - want[1]!) < 1e-5 && Math.abs(b.col[i * 4 + 2]! - want[2]!) < 1e-5) n++;
    }
  }
  return n;
}

describe('seed', () => {
  it('changes the picture of a shape that varies per play, and keeps it for the same seed', () => {
    const fx = oneShape('shards');
    expect(picture(fx, ctx(10, { seed: 1 }))).toBe(picture(fx, ctx(10, { seed: 1 })));
    expect(picture(fx, ctx(10, { seed: 1 }))).not.toBe(picture(fx, ctx(10, { seed: 2 })));
  });

  it('keeps the same picture for every play when the layer is set not to vary', () => {
    const fx = oneShape('shards', (l) => { l.perPlay = false; });
    expect(picture(fx, ctx(10, { seed: 1 }))).toBe(picture(fx, ctx(10, { seed: 2 })));
  });

  it("changes the picture when the layer's own seed changes", () => {
    const a = oneShape('shards', (l) => { l.perPlay = false; });
    const b = oneShape('shards', (l) => { l.perPlay = false; l.seed = 2; });
    expect(picture(a, ctx(10))).not.toBe(picture(b, ctx(10)));
  });

  it('gives a burst the same pieces for the same seed, in any order of moments', () => {
    const fx = newEffect('b', 'B');
    fx.layers = [newBurstLayer('b', 'B')];
    const a = picture(fx, ctx(250));
    picture(fx, ctx(500));
    expect(picture(fx, ctx(250))).toBe(a);
    expect(picture(fx, ctx(250, { seed: 8 }))).not.toBe(a);
  });
});

describe('phases', () => {
  it('starts a layer at a phase, ends one with a phase, and counts phases in the length', () => {
    const fx = newEffect('p', 'P');
    fx.phases = { windupMs: 560, peakMs: 490, fadeMs: 300 };
    const a = { ...newShapeLayer('a', 'A', 'flash'), start: { phase: 'peak' as const, ms: 20 } };
    const b = { ...newShapeLayer('b', 'B', 'glow'), untilPhaseEnd: 'fade' as const };
    delete (b as Partial<ShapeLayer>).durationMs;
    fx.layers = [a, b];
    const tl = resolveTimeline(fx, ctx(0).inputs, applyControls(fx.controls));
    expect(tl.byId.get('a')!.startMs).toBe(580);
    expect(tl.byId.get('b')!.endMs).toBe(1350);
    expect(tl.lengthMs).toBe(1350);
    fx.controls.duration = 2;
    const tl2 = resolveTimeline(fx, ctx(0).inputs, applyControls(fx.controls));
    expect(tl2.byId.get('a')!.startMs).toBe(1160);
    expect(tl2.phases.fade.endMs).toBe(2700);
  });

  it('flies a shell for exactly its phase, along an arc', () => {
    const fx = newEffect('s', 'S');
    fx.phases = { windupMs: 560, peakMs: 490, fadeMs: 0 };
    const shell = newProjectileLayer('shell', 'Shell');
    shell.flight = { mode: 'phase', phase: 'windup' };
    shell.arcM = 2;
    fx.layers = [shell];
    const tl = resolveTimeline(fx, { origin: [0, 0, 0], target: [10, 0, 0] }, applyControls(fx.controls));
    const f = tl.byId.get('shell')!.flight!;
    expect(f.ms).toBe(560);
    expect(flightPoint(f, 0.5)).toEqual([5, 2, 0]);
    expect(flightPoint(f, 0)).toEqual([0, 0, 0]);
    expect(flightPoint(f, 1)).toEqual([10, 0, 0]);
  });
});

describe('blend groups and depth', () => {
  it('sends each layer to the buffer of its blend, and never needs more than four draws', () => {
    const fx = newEffect('g', 'G');
    fx.layers = [
      newShapeLayer('scorch', 'Scorch', 'scorch'),
      newShapeLayer('glow', 'Glow', 'glow'),
      { ...newShapeLayer('light', 'Light', 'glow'), facing: 'ground', blend: 'screen' },
      { ...newShapeLayer('ring', 'Ring', 'ring'), facing: 'ground' },
      newShapeLayer('star', 'Star', 'shards'),
    ];
    const { sink } = drawn(fx, ctx(10));
    for (const g of BLEND_GROUPS) expect(sink.groups[g].icount, g).toBeGreaterThan(0);
    expect(sink.drawCalls).toBe(4);
  });

  it('lifts ground layers just off the ground, and pulls standing ones by how far they reach down', () => {
    const fx = newEffect('d', 'D');
    fx.layers = [newShapeLayer('scorch', 'Scorch', 'scorch'), newShapeLayer('star', 'Star', 'shards')];
    const { sink } = drawn(fx, ctx(10));
    const g = sink.groups['ground-multiply'];
    for (let i = 0; i < g.vcount; i++) expect(g.pos[i * 4 + 3]).toBeCloseTo(0.05, 6);
    const t = sink.groups['top'];
    // A star of radius 1.1 m reaches about 1.1 m below its centre on screen.
    const cot = 1 / Math.tan((35.3 * Math.PI) / 180);
    expect(t.pos[3]).toBeGreaterThan(0.8 * cot);
    expect(t.pos[3]).toBeLessThan(1.4 * cot + 0.4);
  });

  it('lays a ground shape flat on the ground', () => {
    const fx = oneShape('scorch');
    const { sink } = drawn(fx, ctx(10, { inputs: { origin: [3, 0, 2], target: [3, 0, 2] } }));
    const g = sink.groups['ground-multiply'];
    expect(g.vcount).toBeGreaterThan(8);
    for (let i = 0; i < g.vcount; i++) expect(g.pos[i * 4 + 1]).toBeCloseTo(0, 6);
  });
});

describe('friend or foe', () => {
  it('marks added light with a negative alpha, in the same buffer and order as ordinary drawing', () => {
    const fx = newEffect('a', 'A');
    fx.layers = [newShapeLayer('glow', 'Glow', 'glow'), newShapeLayer('star', 'Star', 'shards')];
    const { sink } = drawn(fx, ctx(10));
    const t = sink.groups.top;
    const first = t.layer[0], last = t.layer[t.vcount - 1];
    expect([first, last]).toEqual([0, 1]);
    for (let i = 0; i < t.vcount; i++) {
      if (t.layer[i] === 0) expect(t.col[i * 4 + 3]!).toBeLessThanOrEqual(0);
      else expect(t.col[i * 4 + 3]!).toBeGreaterThan(0);
    }
  });

  it('outlines an enemy shard star in ink, and your own team with a thin broken rim', () => {
    const fx = oneShape('shards');
    const enemy = drawn(fx, ctx(10, { relation: 'enemy' })).sink;
    const team = drawn(fx, ctx(10, { relation: 'team' })).sink;
    const ink = resolveRole(palette, 'ink', 'soviets')!;
    const rim = resolveRole(palette, 'heat.rim', 'soviets')!;
    expect(verticesOf(enemy, ink)).toBeGreaterThan(0);
    expect(verticesOf(enemy, rim)).toBe(0);
    expect(verticesOf(team, ink)).toBe(0);
    expect(verticesOf(team, rim)).toBeGreaterThan(0);
  });
});

describe('words', () => {
  const word = () => {
    const fx = newEffect('w', 'W');
    const w = newWordLayer('w', 'W');
    w.words = ['KABOOM'];
    fx.layers = [w];
    return { fx, w };
  };

  it('draws a word, and draws nothing past the distance where words vanish', () => {
    const { fx } = word();
    expect(drawn(fx, ctx(100, { viewerDistanceM: 0 })).r.triangles).toBeGreaterThan(200);
    expect(drawn(fx, ctx(100, { viewerDistanceM: 12 })).r.triangles).toBe(0);
  });

  it("shows a shooter's word only to the shooter", () => {
    const { fx, w } = word();
    w.visibleTo = 'shooter';
    expect(drawn(fx, ctx(100, { relation: 'enemy' })).r.triangles).toBe(0);
    expect(drawn(fx, ctx(100, { relation: 'team' })).r.triangles).toBe(0);
    expect(drawn(fx, ctx(100, { relation: 'self' })).r.triangles).toBeGreaterThan(0);
  });

  it('pops bigger for its first steps, then settles', () => {
    const { fx, w } = word();
    w.sizeJitter = 0;
    const width = (t: number) => {
      const { sink } = drawn(fx, ctx(t));
      const b = sink.groups['top'];
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < b.vcount; i++) {
        const d = b.pos[i * 4]! * cam.right[0] + b.pos[i * 4 + 1]! * cam.right[1] + b.pos[i * 4 + 2]! * cam.right[2];
        lo = Math.min(lo, d); hi = Math.max(hi, d);
      }
      return hi - lo;
    };
    expect(width(10) / width(300)).toBeCloseTo(1.15, 1);
  });

  it('has every letter the checker allows', () => {
    for (const ch of WORD_LETTERS) expect(LETTERS[ch], ch).toBeDefined();
  });

  it("fills each letter exactly: its triangles cover its outline's area, holes left open", () => {
    const signed = (c: number[]) => {
      let a = 0;
      for (let i = 0; i < c.length; i += 2) {
        const j = (i + 2) % c.length;
        a += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
      }
      return a / 2;
    };
    for (const [ch, g] of Object.entries(LETTERS)) {
      const outline = g.contours.reduce((s, c) => s + signed(c), 0);
      let tris = 0;
      for (let i = 0; i < g.tris.length; i += 3) {
        const a = g.tris[i]! * 2, b = g.tris[i + 1]! * 2, c = g.tris[i + 2]! * 2;
        const p = g.points;
        tris += Math.abs((p[b]! - p[a]!) * (p[c + 1]! - p[a + 1]!) - (p[c]! - p[a]!) * (p[b + 1]! - p[a + 1]!)) / 2;
      }
      expect(outline, ch).toBeGreaterThan(0);
      expect(tris / outline, ch).toBeCloseTo(1, 4);
    }
  });
});

describe('bursts', () => {
  it('throws as many pieces as asked, times intensity, and lets them fall', () => {
    const fx = newEffect('b', 'B');
    const b = newBurstLayer('b', 'B');
    b.look = { kind: 'dot', role: 'team', inkPx: 0, edge: 'none' };
    b.count = 10;
    b.direction = 'up';
    b.spreadDeg = 0;
    b.drag = 0;
    b.speedMps = [2, 2];
    b.startRadiusM = [0, 0];
    b.sizeOverLife = [[0, 1], [1, 1]];
    fx.layers = [b];
    const tris = (t: number) => drawn(fx, ctx(t)).r.triangles;
    expect(tris(100)).toBe(10 * 10); // a dot is a fan of 10 triangles
    fx.controls.intensity = 1.5;
    expect(tris(100)).toBe(15 * 10);
    fx.controls.intensity = 1;
    // Straight up at 2 m/s against 9.8 m/s²: highest near 0.2 s, back down by 0.4 s.
    const height = (t: number) => {
      const s = drawn(fx, ctx(t)).sink.groups['top'];
      let y = 0;
      for (let i = 0; i < s.vcount; i++) y += s.pos[i * 4 + 1]!;
      return y / s.vcount;
    };
    expect(height(200)).toBeGreaterThan(height(0) + 0.1);
    expect(height(400)).toBeLessThan(height(200));
  });

  it('keeps throwing pieces when it loops', () => {
    const fx = newEffect('b', 'B');
    const b = { ...newBurstLayer('b', 'B'), loop: true, durationMs: 5000 };
    fx.layers = [b];
    expect(drawn(fx, ctx(3000)).r.triangles).toBeGreaterThan(0);
    const once = { ...b, loop: false };
    fx.layers = [once];
    expect(drawn(fx, ctx(3000)).r.triangles).toBe(0);
  });
});

describe('every shape kind', () => {
  const kinds = ['shards', 'flash', 'cloud', 'smoke', 'ring', 'dots', 'scorch', 'lines', 'glow', 'band', 'beads', 'flames', 'bed'] as const;
  for (const kind of kinds) {
    it(`draws ${kind} with finite numbers`, () => {
      const fx = oneShape(kind);
      const { r, sink } = drawn(fx, ctx(40));
      expect(r.triangles, kind).toBeGreaterThan(0);
      for (const g of BLEND_GROUPS) {
        const b = sink.groups[g];
        for (let i = 0; i < b.vcount * 4; i++) expect(Number.isFinite(b.pos[i]!), `${kind} pos`).toBe(true);
        for (let i = 0; i < b.icount; i++) expect(b.idx[i]!).toBeLessThan(b.vcount);
      }
    });
  }

  it('draws a trail behind the projectile it rides', () => {
    const fx = newEffect('t', 'T');
    const shell = newProjectileLayer('shell', 'Shell');
    shell.flight = { mode: 'time', ms: 500 };
    const trail = { ...newShapeLayer('trail', 'Trail', 'trail'), at: { layer: 'shell' } };
    delete (trail as Partial<ShapeLayer>).durationMs;
    fx.layers = [shell, trail];
    const { r } = drawn(fx, ctx(250));
    expect(r.triangles).toBeGreaterThan(0);
  });
});

describe('newer fields', () => {
  it('fades a layer by its alpha over life', () => {
    const fx = oneShape('shards', (l) => { l.durationMs = 1000; l.timing = { mode: 'smooth' }; l.alpha = { life: [[0, 1], [1, 0]] }; });
    const at = (t: number) => { const b = drawn(fx, ctx(t)).sink.groups.top; return b.col[3]!; };
    expect(at(0)).toBeCloseTo(1, 5);
    expect(at(500)).toBeCloseTo(0.5, 2);
  });

  it('lifts a flat layer off the ground', () => {
    const fx = oneShape('ring', (l) => { l.facing = 'ground'; l.liftM = 1.2; });
    const g = drawn(fx, ctx(100, { inputs: { origin: [0, 0, 0], target: [0, 0, 0] } })).sink.groups.ground;
    expect(g.vcount).toBeGreaterThan(10);
    for (let i = 0; i < g.vcount; i++) expect(g.pos[i * 4 + 1]).toBeCloseTo(1.2, 5);
  });

  it('squashes a ring and a dot field to a ground shape', () => {
    const height = (fx: EffectFile) => {
      const b = drawn(fx, ctx(200, { inputs: { origin: [0, 0, 0], target: [0, 0, 0] } })).sink.groups.top;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < b.vcount; i++) { const d = b.pos[i * 4]! * cam.up[0] + b.pos[i * 4 + 1]! * cam.up[1] + b.pos[i * 4 + 2]! * cam.up[2]; lo = Math.min(lo, d); hi = Math.max(hi, d); }
      return hi - lo;
    };
    for (const kind of ['ring', 'dots'] as const) {
      const round = height(oneShape(kind, (l) => { l.facing = 'camera'; }));
      const flat = height(oneShape(kind, (l) => { l.facing = 'camera'; (l.shape as { squash?: number }).squash = 0.5; }));
      expect(flat / round, kind).toBeLessThan(0.62);
    }
  });

  it('colours a piece edge by its own role when given', () => {
    const fx = newEffect('b', 'B');
    fx.layers = [{ ...newBurstLayer('b', 'B'), look: { kind: 'chip', role: 'stone', inkPx: 1.5, edge: 'ink', inkRole: 'stone.rim' } }];
    const { sink } = drawn(fx, ctx(100));
    expect(verticesOf(sink, resolveRole(palette, 'stone.rim', 'soviets')!)).toBeGreaterThan(0);
    expect(verticesOf(sink, resolveRole(palette, 'ink', 'soviets')!)).toBe(0);
  });

  it('draws a speed streak behind each piece', () => {
    const base = { ...newBurstLayer('b', 'B'), gravityMps2: 0, look: { kind: 'dot' as const, role: 'team', inkPx: 0, edge: 'none' as const } };
    const fx = newEffect('b', 'B');
    fx.layers = [base];
    const without = drawn(fx, ctx(200)).r.triangles;
    fx.layers = [{ ...base, streak: { role: 'white', lengthM: 0.5, widthPx: 3 } }];
    expect(drawn(fx, ctx(200)).r.triangles).toBeGreaterThan(without);
  });

  it('stops pieces on the ground', () => {
    const fx = newEffect('b', 'B');
    const b = { ...newBurstLayer('b', 'B'), gravityMps2: 30, speedMps: [1, 1] as [number, number], direction: 'up' as const, spreadDeg: 0, drag: 0, startRadiusM: [0, 0] as [number, number],
      sizeM: [0.05, 0.05] as [number, number], sizeOverLife: [[0, 1], [1, 1]] as [number, number][], lifeMs: [900, 900] as [number, number],
      look: { kind: 'dot' as const, role: 'team', inkPx: 0, edge: 'none' as const } };
    const lowest = (groundStop: boolean) => {
      fx.layers = [{ ...b, groundStop }];
      const t = drawn(fx, ctx(800, { inputs: { origin: [0, 0.3, 0], target: [0, 0.3, 0] } })).sink.groups.top;
      let lo = Infinity;
      for (let i = 0; i < t.vcount; i++) lo = Math.min(lo, t.pos[i * 4 + 1]!);
      return lo;
    };
    expect(lowest(false)).toBeLessThan(-1);
    expect(lowest(true)).toBeGreaterThan(-0.1);
  });

  it('spreads pieces over a start area', () => {
    const fx = newEffect('b', 'B');
    const b = { ...newBurstLayer('b', 'B'), speedMps: [0, 0] as [number, number], gravityMps2: 0, startRadiusM: [0, 0] as [number, number], count: 20,
      look: { kind: 'dot' as const, role: 'team', inkPx: 0, edge: 'none' as const } };
    const width = (area?: [number, number]) => {
      fx.layers = [area ? { ...b, areaM: area } : b];
      const t = drawn(fx, ctx(10)).sink.groups.top;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < t.vcount; i++) { const d = t.pos[i * 4]! * cam.right[0] + t.pos[i * 4 + 2]! * cam.right[2]; lo = Math.min(lo, d); hi = Math.max(hi, d); }
      return hi - lo;
    };
    expect(width()).toBeLessThan(0.3);
    expect(width([1.5, 0.2])).toBeGreaterThan(2);
  });

  it('draws image pieces from the atlas, and names a missing image', () => {
    const fx = newEffect('b', 'B');
    fx.layers = [{ ...newBurstLayer('b', 'B'), look: { kind: 'image', image: 'chip.png', tint: { mode: 'keep' } } }];
    const atlas = (name: string) => (name === 'chip.png' ? { u0: 0.25, v0: 0.25, u1: 0.5, v1: 0.5 } : undefined);
    const { sink, r } = drawn(fx, ctx(100, { imageRect: atlas }));
    const t = sink.groups.top;
    expect(r.triangles).toBe(2 * 9);
    for (let i = 0; i < t.vcount; i++) { expect(t.uv[i * 2]!).toBeGreaterThanOrEqual(0.25); expect(t.uv[i * 2]!).toBeLessThanOrEqual(0.5); }
    const miss = drawn(fx, ctx(100, { imageRect: () => undefined }));
    expect(miss.r.missingImages).toEqual(['chip.png']);
    expect(miss.r.triangles).toBe(0);
  });
});

describe('fire', () => {
  it('spreads each row of tongues across the fire, back ones taller than front ones', () => {
    const sp = { ...(newShapeLayer('f', 'F', 'flames').shape as FlamesShape), count: 22 };
    const p = new Painter();
    const sink = new DrawSink(16);
    p.begin(sink.groups.top, { o: [0, 0, 0], u: [...cam.right], v: [...cam.up] }, 0, [0.5, 0.5]);
    const c = { p, rnd: (a: number, b = 0) => random01(9, a, b), s: 1 } as unknown as Parameters<typeof tongueLayout>[1];
    const ts = tongueLayout(sp, c);
    expect(ts.length).toBe(22);
    const rowOf = (d: number) => ts.filter((t) => t.depth === d && Math.abs(t.x) < sp.radiusM * 0.75).map((t) => t.x).sort((a, b) => a - b);
    for (const d of [0, 1]) {
      const xs = rowOf(d);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!, `row ${d}`).toBeLessThan(sp.radiusM * 0.75);
    }
    const mean = (d: number) => { const h = ts.filter((t) => t.depth === d).map((t) => t.h); return h.reduce((a, b) => a + b, 0) / h.length; };
    expect(mean(0)).toBeGreaterThan(mean(2));
    expect(mean(1)).toBeGreaterThan(mean(2));
    expect(Math.max(...ts.filter((t) => t.depth === 0).map((t) => t.h))).toBeGreaterThan(Math.max(...ts.filter((t) => t.depth === 2).map((t) => t.h)));
  });

  it('cools the bed from the middle out', () => {
    const fx = newEffect('m', 'M');
    fx.phases = { windupMs: 0, peakMs: 1000, fadeMs: 1000 };
    const bed = { ...newShapeLayer('bed', 'Bed', 'bed'), untilPhaseEnd: 'fade' as const };
    (bed.shape as BedShape).breakUp = { phase: 'fade' };
    (bed.shape as BedShape).growMs = 0;
    delete (bed as Partial<ShapeLayer>).durationMs;
    fx.layers = [bed];
    const tris = (t: number) => drawn(fx, ctx(t)).r.triangles;
    expect(tris(500)).toBeGreaterThan(tris(1500));
    expect(tris(1500)).toBeGreaterThan(tris(1950));
    expect(tris(1950)).toBeGreaterThan(0);
  });
});

describe('the example effects', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples');
  for (const project of readdirSync(root)) {
    for (const file of readdirSync(join(root, project, 'effects'))) {
      it(`${project}/${file} draws finite triangles all through`, () => {
        const fx = JSON.parse(readFileSync(join(root, project, 'effects', file), 'utf8')) as EffectFile;
        const inputs = { origin: [-4, 1.5, 3] as Vec3, target: [3, 0.8, -2] as Vec3 };
        const len = resolveTimeline(fx, inputs, applyControls(fx.controls)).lengthMs;
        const sink = new DrawSink(256);
        for (let t = 0; t < len; t += 37) {
          for (const relation of ['enemy', 'team'] as const) {
            sink.clear();
            evaluate(fx, ctx(t, { inputs, relation }), sink);
            for (const g of BLEND_GROUPS) {
              const b = sink.groups[g];
              for (let i = 0; i < b.vcount * 4; i++) if (!Number.isFinite(b.pos[i]!)) throw new Error(`${g} position not finite at ${t} ms`);
              for (let i = 0; i < b.icount; i++) if (b.idx[i]! >= b.vcount) throw new Error(`${g} index out of range at ${t} ms`);
            }
          }
        }
      });
    }
  }
});

describe('quality tiers', () => {
  it('draws only the layers of the chosen tier, and keeps every time the same', () => {
    const fx = newEffect('t', 'T');
    fx.phases = { windupMs: 0, peakMs: 300, fadeMs: 300 };
    const all = newShapeLayer('all', 'All', 'shards');
    const highOnly = { ...newShapeLayer('extra', 'Extra', 'dots'), tiers: ['medium', 'high'] as ('low' | 'medium' | 'high')[] };
    fx.layers = [all, highOnly];
    const layersAt = (tier: 'low' | 'medium' | 'high') => {
      const { sink } = drawn(fx, ctx(100, { tier }));
      const out = new Set<number>();
      for (const g of BLEND_GROUPS) for (const v of sink.groups[g].layer.slice(0, sink.groups[g].vcount)) out.add(v);
      return out;
    };
    expect([...layersAt('high')].sort()).toEqual([0, 1]);
    expect([...layersAt('medium')].sort()).toEqual([0, 1]);
    expect([...layersAt('low')]).toEqual([0]);
    // The timeline does not depend on the tier.
    const lowLen = drawn(fx, ctx(100, { tier: 'low' })).r.lengthMs, highLen = drawn(fx, ctx(100, { tier: 'high' })).r.lengthMs;
    expect(lowLen).toBe(highLen);
  });
});

describe('items drawn (the cost panel\'s "sprites alive")', () => {
  it('counts a burst of 10 pieces with ink edges and streaks as 10', () => {
    const fx = newEffect('t', 'T');
    const b = newBurstLayer('b', 'B');
    b.count = 10;
    b.lifeMs = [400, 400];
    b.look = { kind: 'diamond', role: 'heat.1', inkPx: 3, edge: 'ink' };
    b.streak = { role: 'glow', lengthM: 0.5, widthPx: 3 };
    fx.layers = [b];
    const { sink } = drawn(fx, ctx(150));
    expect(sink.triangles).toBeGreaterThan(30);
    expect(sink.items).toBe(10);
  });

  it('counts a word by its letters, a sprite as one, and a star with its halftone dots', () => {
    const word = newEffect('w', 'W');
    word.layers = [{ ...newWordLayer('w', 'W'), words: ['BOOM'] }];
    expect(drawn(word, ctx(40, { relation: 'self' })).sink.items).toBe(4);

    const sprite = newEffect('s', 'S');
    sprite.layers = [{ ...newSpriteLayer('s', 'S', 'flash.png'), durationMs: 500 }];
    expect(drawn(sprite, ctx(10)).sink.items).toBe(1);

    const star = oneShape('shards');
    expect(drawn(star, ctx(10)).sink.items).toBe(1);
  });

  it('counts each dot of a halftone field, each puff, line and flame tongue', () => {
    // With the atlas's round dot, every dot is one square of two triangles.
    const dots = oneShape('dots');
    const { sink } = drawn(dots, ctx(200, { dot: { u0: 0.6, v0: 0.6, u1: 0.7, v1: 0.7 } }));
    expect(sink.items).toBeGreaterThan(100);
    expect(sink.items).toBe(sink.triangles / 2);
    const lines = oneShape('lines', (l) => { if (l.shape.kind === 'lines') l.shape.count = 9; });
    expect(drawn(lines, ctx(10)).sink.items).toBe(9);
  });

  it('starts from nothing every frame', () => {
    const fx = oneShape('shards');
    const sink = new DrawSink(64);
    evaluate(fx, ctx(10), sink);
    sink.clear();
    expect(sink.items).toBe(0);
  });
});
