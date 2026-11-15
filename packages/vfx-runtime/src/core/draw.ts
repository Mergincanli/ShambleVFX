/**
 * What a shape, word or burst gets when it draws one moment: the painter, its clock, its random numbers, its colours,
 * friend or foe, and unit helpers. Shared by shapes.ts, words.ts and particles.ts.
 */
import type { BreakUp, Curve, Edge, Range } from '@shamble/vfx-format';
import type { Painter, RGBA } from './painter';
import type { Flight, Timeline } from './timeline';

/** Who made the effect, seen from the player looking at it. */
export type Relation = 'enemy' | 'team' | 'self';

export interface DrawCtx {
  p: Painter;
  /** Local time in ms as the layer shows it: the start of its current step, or the time itself when smooth. */
  tau: number;
  /** Step index, or -1 when the layer moves smoothly. */
  n: number;
  /** 0 or 1, flipping every step (every 1/12 s when smooth). */
  parity: number;
  lifeMs: number;
  /** tau / lifeMs, 0..1 */
  t: number;
  /** The effect time this moment shows (on the layer's steps). */
  effT: number;
  /** Local time and effect time as they really are, not held on steps: break-ups and phase shares follow these. */
  tauRaw: number;
  effTRaw: number;
  /** ms per step of the layer's clock. */
  stepMs: number;
  tl: Timeline;
  /** A number in [0, 1) from the seed and up to two integers. */
  rnd: (a: number, b?: number) => number;
  rgba: (role: string, alpha?: number) => RGBA;
  relation: Relation;
  /** px on a 1080p screen, in metres at the game camera. */
  px: (v: number) => number;
  /** The layer's size factor (size control and size animation). */
  s: number;
  intensity: number;
  /** For a layer riding a projectile: the flight and how far along it is (0..1, on the projectile's steps). */
  ride?: { flight: Flight; k: number };
  /** World points of the shot, for bands and beads. */
  point: (input: 'origin' | 'target', offset: [number, number, number]) => [number, number, number];
  /** Where an image sits in the atlas (undefined when the atlas does not have it). */
  image?: (name: string) => { u0: number; v0: number; u1: number; v1: number } | undefined;
  /** A gradient from the palette, its stops in the renderer's colours (undefined when the palette does not have it). */
  gradient?: (name: string) => GradientRamp | undefined;
}

/** A palette gradient ready to draw: stops sorted by place, colours as the renderer wants them. */
export interface GradientRamp {
  banded: boolean;
  stops: { at: number; c: RGBA }[];
}

/**
 * A gradient's colour at place t (a new array each call): smooth blends from stop to stop; banded holds each stop's
 * colour until the next stop. Before the first stop it is the first colour, after the last the last (as rampDisc draws).
 */
export function rampAt(g: GradientRamp, t: number): RGBA {
  const s = g.stops;
  let i = 0;
  while (i + 1 < s.length && s[i + 1]!.at <= t) i++;
  const a = s[i]!.c, b = s[i + 1];
  if (g.banded || !b || t <= s[i]!.at) return [a[0], a[1], a[2], a[3]];
  const k = (t - s[i]!.at) / (b.at - s[i]!.at);
  return [a[0] + (b.c[0] - a[0]) * k, a[1] + (b.c[1] - a[1]) * k, a[2] + (b.c[2] - a[2]) * k, a[3] + (b.c[3] - a[3]) * k];
}

export type EdgeLook = 'ink' | 'broken' | 'none';

/** Friend or foe: what an edge setting means for the player looking at it. */
export function edgeLook(e: Edge, r: Relation): EdgeLook {
  if (e === 'auto') return r === 'enemy' ? 'ink' : 'broken';
  if (e === 'enemy') return r === 'enemy' ? 'ink' : 'none';
  return e;
}

/**
 * How far a break-up has got: 0 before it starts, 1 when done. It follows real time, not the layer's steps (as on the
 * drawing board: a shape holds its drawing for a step, but shrinks and loses its tones on time).
 */
export function breakProgress(ctx: DrawCtx, b: BreakUp | undefined): number {
  if (!b) return 0;
  if ('phase' in b) {
    const p = ctx.tl.phases[b.phase];
    const len = p.endMs - p.startMs;
    if (len <= 0) return ctx.effTRaw >= p.startMs ? 1 : 0;
    return clamp01((ctx.effTRaw - p.startMs) / len);
  }
  const from = ctx.lifeMs - b.lastMs;
  return clamp01((ctx.tauRaw - from) / b.lastMs);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** The value of a curve at x (straight lines between points; flat before the first and after the last). */
export function curveAt(c: Curve | readonly (readonly [number, number])[], x: number): number {
  if (!c.length) return 1;
  if (x <= c[0]![0]) return c[0]![1];
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!, b = c[i]!;
    if (x <= b[0]) return b[0] === a[0] ? b[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return c[c.length - 1]![1];
}

export function pick(r: Range, u: number): number {
  return r[0] + (r[1] - r[0]) * u;
}

export function ease(k: number): number {
  return 1 - (1 - k) * (1 - k);
}
