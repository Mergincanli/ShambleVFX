import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { Coverage } from '../src/cost/area';
import { budgetOf, budgetsFromVersion1, readLimits } from '../src/cost/budgets';
import { measureCost, measuredOf } from '../src/cost/measure';
import { makeGameCamera } from '../src/preview/camera';

const palette = paletteJson as Palette;
const repo = resolve(import.meta.dirname, '..', '..', '..');
const effect = (project: string, id: string) => JSON.parse(readFileSync(join(repo, 'examples', project, 'effects', `${id}.vfx.json`), 'utf8')) as EffectFile;
/** An atlas with only the runtime's own blocks (the hits collection draws no images). */
const atlas = { image: {} as ImageBitmap, width: 64, height: 32, rects: { __white: { x: 2, y: 2, w: 8, h: 8 }, __dot: { x: 14, y: 2, w: 16, h: 16 } } };

describe('screen area', () => {
  it('counts a full-screen square as the whole screen, once', () => {
    const c = new Coverage(1920, 1080, 4);
    c.tri(0, 0, 1920, 0, 1920, 1080);
    c.tri(0, 0, 1920, 1080, 0, 1080);
    expect(c.union).toBeCloseTo(1, 3);
    expect(c.withOverlap).toBeCloseTo(1, 2);
  });

  it('counts overlaps once in the union and twice in the fill', () => {
    const c = new Coverage(1920, 1080, 4);
    for (let k = 0; k < 2; k++) { c.tri(100, 100, 500, 100, 500, 500); c.tri(100, 100, 500, 500, 100, 500); }
    const share = (400 * 400) / (1920 * 1080);
    expect(c.union).toBeCloseTo(share, 3);
    expect(c.withOverlap).toBeCloseTo(2 * share, 3);
  });

  it('leaves out what is off screen, and either winding counts', () => {
    const c = new Coverage(1920, 1080, 4);
    c.tri(-1000, -1000, -10, -1000, -10, -10);
    expect(c.covered).toBe(0);
    c.tri(1900, 1000, 2400, 1000, 1900, 1600); // only its corner is on screen
    const corner = c.covered;
    expect(corner).toBeGreaterThan(0);
    c.clear();
    c.tri(1900, 1000, 1900, 1600, 2400, 1000);
    expect(c.covered).toBe(corner);
  });
});

describe('measuring an effect', () => {
  it('gives the same counts and area on every run, per tier', async () => {
    const fx = effect('hits-collection', 'hit_burst_star');
    const run = () => measureCost({
      effect: fx, palette, atlas, camera: makeGameCamera(), scene: 'hit-unit', sceneName: 'Hit on a soldier', origin: [-3, 1.2, 1], target: [2, 1.1, -0.5],
      seed: 1, faction: 'allies', relation: 'enemy', viewerDistanceM: 4,
    });
    const a = await run(), b = await run();
    for (const tier of ['low', 'medium', 'high'] as const) {
      const { ms: msA, ...countsA } = a.tiers[tier];
      const { ms: msB, ...countsB } = b.tiers[tier];
      expect(countsA).toEqual(countsB);
      expect(countsA.triangles).toBeGreaterThan(0);
      expect(countsA.draws).toBeGreaterThanOrEqual(1);
      expect(countsA.draws).toBeLessThanOrEqual(4);
      expect(countsA.area).toBeGreaterThan(0);
      expect(countsA.area).toBeLessThan(1);
      expect(countsA.areaWithOverlap).toBeGreaterThanOrEqual(countsA.area);
      for (const m of [msA, msB]) {
        expect(Number.isFinite(m.avg) && m.avg > 0).toBe(true);
        expect(m.p95).toBeGreaterThanOrEqual(m.avg * 0.5);
        expect(m.worst).toBeGreaterThanOrEqual(m.p95);
      }
    }
    expect(a.frames).toBe(Math.ceil(a.lengthMs / (1000 / 60)));
    // Low drops extras: fewer sprites than High for this hit (not a rule for every effect).
    expect(a.tiers.low.sprites).toBeLessThan(a.tiers.high.sprites);
    expect(a.heaviest.length).toBeGreaterThan(0);
    expect(a.heaviest.map((x) => x.id)).toEqual(b.heaviest.map((x) => x.id));
    expect(a.heaviest.reduce((n, x) => n + x.share, 0)).toBeLessThanOrEqual(1.000001);
  }, 60000);
});

describe('budgets', () => {
  it('keeps only numbers from project.json, and compares area in percent and ms at the 95th percentile', () => {
    // One level's numbers (a version 1 project.json kept one such set for the whole project).
    const raw = { low: { draws: 3, ms: 'fast', area: -1 }, high: { sprites: 200, area: 5 }, ultra: { draws: 1 } };
    const b = readLimits(raw);
    expect(b).toEqual({ low: { draws: 3 }, high: { sprites: 200, area: 5 } });
    // From a version 1 project.json, the same numbers become the project level, switched off.
    expect(budgetsFromVersion1(raw).project).toEqual({ on: false, limits: { low: { draws: 3 }, high: { sprites: 200, area: 5 } } });
    expect(budgetOf(b, 'low', 'draws')).toBe(3);
    expect(budgetOf(b, 'medium', 'draws')).toBeUndefined();
    const c = { draws: 2, sprites: 10, triangles: 300, area: 0.042, areaWithOverlap: 0.08, ms: { avg: 0.3, p95: 0.5, worst: 0.9 } };
    expect(measuredOf(c, 'area')).toBeCloseTo(4.2);
    expect(measuredOf(c, 'ms')).toBe(0.5);
  });
});
