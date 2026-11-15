import { describe, expect, it } from 'vitest';
import paletteJson from '../../vfx-format/palette/palette.json';
import { WORD_LETTERS, newBurstLayer, newEffect, newProjectileLayer, newShapeLayer, newWordLayer, parseHex, resolveRole, srgbToLinear } from '@shamble/vfx-format';
import type { EffectFile, Palette, ShapeLayer, Vec3 } from '@shamble/vfx-format';
import { BLEND_GROUPS, DrawSink, applyControls, evaluate, resolveTimeline } from '../src/core/index';
import type { CameraBasis, EvalContext } from '../src/core/index';
import { LETTERS } from '../src/core/letters';
import { flightPoint } from '../src/core/timeline';

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
  it('sends each layer to the buffer of its blend, and never needs more than five draws', () => {
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
    expect(sink.drawCalls).toBe(5);
  });

  it('lifts ground layers just off the ground, and pulls standing ones by how far they reach down', () => {
    const fx = newEffect('d', 'D');
    fx.layers = [newShapeLayer('scorch', 'Scorch', 'scorch'), newShapeLayer('star', 'Star', 'shards')];
    const { sink } = drawn(fx, ctx(10));
    const g = sink.groups['ground-multiply'];
    for (let i = 0; i < g.vcount; i++) expect(g.pos[i * 4 + 3]).toBeCloseTo(0.02, 6);
    const t = sink.groups['top-normal'];
    // A star of radius 1.1 m reaches about 1.1 m below its centre on screen.
    const cot = 1 / Math.tan((35.3 * Math.PI) / 180);
    expect(t.pos[3]).toBeGreaterThan(0.8 * cot);
    expect(t.pos[3]).toBeLessThan(1.4 * cot + 0.02);
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
      const b = sink.groups['top-normal'];
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
      const s = drawn(fx, ctx(t)).sink.groups['top-normal'];
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
