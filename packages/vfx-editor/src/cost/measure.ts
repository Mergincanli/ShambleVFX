/**
 * The cost of one effect, per quality tier, measured through VfxRenderer (the code the game ships) at a fresh game
 * camera on the 1920 x 1080 screen. Each number is its own most over the effect's whole length, on a fixed grid of
 * 60 frames a second, with a fixed seed: the counts and the area are the same on every press and on both backends.
 * Only the milliseconds depend on the computer.
 *
 * No budget is decided yet: the panel shows these numbers next to numbers Mustafa types, and invents no limits.
 */
import { Matrix4 } from 'three';
import type { PerspectiveCamera } from 'three';
import { TIER_NAMES } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Palette, TierName } from '@shamble/vfx-format';
import { BLEND_GROUPS, VfxRenderer, applyControls, resolveTimeline } from '@shamble/vfx-runtime';
import type { Atlas, EffectInputs, Relation } from '@shamble/vfx-runtime';
import { Coverage } from './area';

/** What a budget can be set for. "ms" is compared with the 95th percentile frame. */
export const COST_METRICS = ['draws', 'sprites', 'triangles', 'area', 'ms'] as const;
export type CostMetric = (typeof COST_METRICS)[number];
/** Budgets typed in the editor: per tier, per metric. Empty means no budget. Kept in project.json as "budgets". */
export type Budgets = Partial<Record<TierName, Partial<Record<CostMetric, number>>>>;

export const FRAMES_PER_SECOND = 60;
/** Each timed batch runs at least this long, so a coarse browser clock still gives a usable number. */
const BATCH_MS = 20;
/** Moments timed per tier, spread over the effect's length. */
const TIMED_MOMENTS = 24;

export interface TierCost {
  /** The most draw calls at any moment (one per blend group in use; effects playing together share them). */
  draws: number;
  /** The most items alive at any moment: each sprite, particle, dot, letter, flame tongue and shape counts once. */
  sprites: number;
  /** The most triangles at any moment. */
  triangles: number;
  /** The largest share of the screen covered at any moment (0..1). */
  area: number;
  /** The largest share filled with overlaps counted (0..n). */
  areaWithOverlap: number;
  /** CPU milliseconds to build one frame's triangles: average, 95th percentile and worst of the timed moments. */
  ms: { avg: number; p95: number; worst: number };
}

export interface CostConditions {
  scene: string;
  sceneName: string;
  origin: [number, number, number];
  target: [number, number, number];
  seed: number;
  faction: FactionId;
  relation: Relation;
  viewerDistanceM: number;
}

export interface CostReport {
  /** The effect object measured: when the editor's effect is another object, the numbers are out of date. */
  effect: EffectFile;
  /** The palette it was measured with (a gradient changes a glow's triangles). */
  palette: Palette;
  conditions: CostConditions;
  lengthMs: number;
  frames: number;
  tiers: Record<TierName, TierCost>;
  /** The layers with the most triangles in High, at its moment with the most triangles (top three). */
  heaviest: { id: string; name: string; share: number }[];
  /** The smallest step the browser's clock showed, ms. */
  clockStepMs: number;
}

export interface MeasureInput extends CostConditions {
  effect: EffectFile;
  palette: Palette;
  atlas: Atlas | null;
  camera: PerspectiveCamera;
  /** Called now and then with what is being measured. */
  onProgress?: (text: string) => void;
}

const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

/** The browser clock's step: the smallest change performance.now() shows. */
export function clockStep(): number {
  let best = Infinity;
  for (let k = 0; k < 5; k++) {
    const a = performance.now();
    let b = a;
    while (b === a) b = performance.now();
    best = Math.min(best, b - a);
  }
  return best;
}

export async function measureCost(o: MeasureInput): Promise<CostReport> {
  const fx = o.effect;
  const inputs: EffectInputs = { origin: o.origin, target: o.target };
  const lengthMs = resolveTimeline(fx, inputs, applyControls(fx.controls)).lengthMs;
  const step = 1000 / FRAMES_PER_SECOND;
  const frames = Math.max(1, Math.ceil(lengthMs / step));
  const camera = o.camera;
  camera.updateMatrixWorld();
  const vp = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const vfx = new VfxRenderer(o.palette);
  if (o.atlas) vfx.setAtlas(o.atlas);
  const cover = new Coverage();
  const params = (timeMs: number) => ({ seed: o.seed, timeMs, inputs, faction: o.faction, relation: o.relation, viewerDistanceM: o.viewerDistanceM });
  const tiers = {} as Record<TierName, TierCost>;
  let heaviest: CostReport['heaviest'] = [];
  try {
    // 1. Counts and area, every frame, per tier.
    for (const tier of TIER_NAMES) {
      vfx.tier = tier;
      const cost: TierCost = { draws: 0, sprites: 0, triangles: 0, area: 0, areaWithOverlap: 0, ms: { avg: 0, p95: 0, worst: 0 } };
      let since = performance.now();
      for (let f = 0; f < frames; f++) {
        vfx.begin(camera);
        vfx.draw(fx, params(f * step));
        const s = vfx.stats;
        cost.draws = Math.max(cost.draws, s.drawCalls);
        cost.sprites = Math.max(cost.sprites, s.items);
        if (s.triangles > cost.triangles) {
          cost.triangles = s.triangles;
          if (tier === 'high') heaviest = heaviestLayers(fx, vfx);
        }
        cover.clear();
        cover.sink(vfx.sink, vp);
        cost.area = Math.max(cost.area, cover.union);
        cost.areaWithOverlap = Math.max(cost.areaWithOverlap, cover.withOverlap);
        if (performance.now() - since > 30) {
          o.onProgress?.(`Counting ${tier}: frame ${f + 1} of ${frames}…`);
          await nextTask();
          since = performance.now();
        }
      }
      tiers[tier] = cost;
    }
    // 2. Time: moments spread over the effect, each a batch of at least BATCH_MS after a warm-up. The tiers take turns
    // at each moment, so a computer that speeds up or slows down meanwhile touches them alike.
    const moments = Math.min(frames, TIMED_MOMENTS);
    const times: Record<TierName, number[]> = { low: [], medium: [], high: [] };
    for (let k = 0; k < moments; k++) {
      const t = Math.floor(((k + 0.5) * frames) / moments) * step;
      for (const tier of TIER_NAMES) {
        vfx.tier = tier;
        const frame = () => { vfx.begin(camera); vfx.draw(fx, params(t)); vfx.end(); };
        frame(); frame();
        let n = 0, el = 0;
        const t0 = performance.now();
        do { frame(); n++; el = performance.now() - t0; } while (el < BATCH_MS || n < 3);
        times[tier].push(el / n);
      }
      o.onProgress?.(`Timing: moment ${k + 1} of ${moments}…`);
      await nextTask();
    }
    for (const tier of TIER_NAMES) {
      const list = times[tier].sort((a, b) => a - b);
      tiers[tier].ms = {
        avg: list.reduce((a, b) => a + b, 0) / list.length,
        p95: list[Math.min(list.length - 1, Math.ceil(list.length * 0.95) - 1)]!,
        worst: list[list.length - 1]!,
      };
    }
  } finally {
    vfx.dispose();
  }
  return {
    effect: fx,
    palette: o.palette,
    conditions: { scene: o.scene, sceneName: o.sceneName, origin: o.origin, target: o.target, seed: o.seed, faction: o.faction, relation: o.relation, viewerDistanceM: o.viewerDistanceM },
    lengthMs, frames, tiers, heaviest, clockStepMs: clockStep(),
  };
}

/** The three layers with the most triangles in what the renderer holds now, with their share of all its triangles. */
function heaviestLayers(fx: EffectFile, vfx: VfxRenderer): CostReport['heaviest'] {
  const per = new Map<number, number>();
  let all = 0;
  for (const g of BLEND_GROUPS) {
    const b = vfx.sink.groups[g];
    for (let t = 0; t < b.icount; t += 3) {
      const l = b.layer[b.idx[t]!]!;
      per.set(l, (per.get(l) ?? 0) + 1);
      all++;
    }
  }
  return [...per].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([i, n]) => ({ id: fx.layers[i]?.id ?? String(i), name: fx.layers[i]?.name ?? `layer ${i}`, share: n / Math.max(1, all) }));
}

/** A budget value as typed, or undefined for an empty or unusable box. */
export function budgetOf(b: Budgets, tier: TierName, metric: CostMetric): number | undefined {
  const v = b[tier]?.[metric];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** The measured number a budget is compared with (area in percent of the screen, ms the 95th percentile). */
export function measuredOf(c: TierCost, metric: CostMetric): number {
  switch (metric) {
    case 'draws': return c.draws;
    case 'sprites': return c.sprites;
    case 'triangles': return c.triangles;
    case 'area': return c.area * 100;
    case 'ms': return c.ms.p95;
  }
}

/** Budgets from project.json, keeping only well-formed numbers. */
export function readBudgets(v: unknown): Budgets {
  const out: Budgets = {};
  if (!v || typeof v !== 'object') return out;
  for (const tier of TIER_NAMES) {
    const t = (v as Record<string, unknown>)[tier];
    if (!t || typeof t !== 'object') continue;
    for (const m of COST_METRICS) {
      const n = (t as Record<string, unknown>)[m];
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) (out[tier] ??= {})[m] = n;
    }
  }
  return out;
}
