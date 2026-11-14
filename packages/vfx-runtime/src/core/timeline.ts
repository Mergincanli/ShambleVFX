/**
 * When each layer starts and ends, for one effect, one set of inputs and one set of controls.
 * Flight time depends on distance, so an effect's length is only known once the inputs are.
 */
import { DEFAULT_STEPS_PER_SECOND, isArrivalStart, isInputAnchor } from '@shamble/vfx-format';
import type { EffectFile, InputAnchor, Layer, Timing, Vec3 } from '@shamble/vfx-format';
import type { ResolvedControls } from './controls';
import { add, frameOffset, length, normalize, scale, shotFrame, sub } from './math';
import type { ShotFrame } from './math';

export interface EffectInputs {
  /** Where the effect starts: a muzzle, the centre of a blast. World metres, y up. */
  origin: Vec3;
  /** Where it goes: the hit point. Same as origin for an effect that stays in one place. */
  target: Vec3;
}

export interface LayerSpan {
  index: number;
  id: string;
  type: Layer['type'];
  /** Effect time in ms when the layer starts. */
  startMs: number;
  /** Effect time in ms when the layer ends (exclusive). */
  endMs: number;
  /** Projectiles only. */
  flight?: { from: Vec3; to: Vec3; ms: number; dir: Vec3 | undefined };
}

export interface Timeline {
  frame: ShotFrame;
  layers: LayerSpan[];
  byId: Map<string, LayerSpan>;
  /** When the last layer ends. */
  lengthMs: number;
}

/** ms per step for a layer's timing (a smooth layer counts flipbook frames at the comic default). */
export function stepMs(t: Timing): number {
  return 1000 / (t.mode === 'steps' ? t.perSecond : DEFAULT_STEPS_PER_SECOND);
}

/** How many steps each flipbook frame holds: the duration control slows a flipbook without changing the step rate. */
export function holdSteps(time: number): number {
  return Math.max(1, Math.round(time));
}

export function inputPoint(inputs: EffectInputs, frame: ShotFrame, a: InputAnchor, size: number): Vec3 {
  const base = a.input === 'origin' ? inputs.origin : inputs.target;
  return add(base, frameOffset(frame, scale(a.offset, size)));
}

export function resolveTimeline(fx: EffectFile, inputs: EffectInputs, c: ResolvedControls): Timeline {
  const frame = shotFrame(inputs.origin, inputs.target);
  const byIdLayer = new Map<string, Layer>(fx.layers.map((l) => [l.id, l]));
  const flights = new Map<string, NonNullable<LayerSpan['flight']>>();
  for (const l of fx.layers) {
    if (l.type !== 'projectile') continue;
    const from = inputPoint(inputs, frame, l.from, c.size);
    const to = inputPoint(inputs, frame, l.to, c.size);
    const d = sub(to, from);
    flights.set(l.id, { from, to, ms: (length(d) / l.speedMps) * 1000, dir: normalize(d) });
  }

  const starts = new Map<string, number>();
  const startOf = (l: Layer, depth: number): number => {
    const known = starts.get(l.id);
    if (known !== undefined) return known;
    let s = l.start.ms * c.time;
    if (isArrivalStart(l.start) && depth < 64) {
      const p = byIdLayer.get(l.start.arrivalOf);
      const f = flights.get(l.start.arrivalOf);
      if (p && f) s += startOf(p, depth + 1) + f.ms;
    }
    starts.set(l.id, s);
    return s;
  };

  const layers: LayerSpan[] = fx.layers.map((l, index) => {
    const startMs = startOf(l, 0);
    let endMs = startMs;
    let flight: LayerSpan['flight'];
    if (l.type === 'projectile') {
      flight = flights.get(l.id)!;
      endMs = startMs + flight.ms;
    } else if (l.durationMs !== undefined) {
      endMs = startMs + l.durationMs * c.time;
    } else if (!isInputAnchor(l.at)) {
      const p = byIdLayer.get(l.at.layer);
      const f = flights.get(l.at.layer);
      if (p && f) endMs = Math.max(startMs, startOf(p, 0) + f.ms);
    } else if (l.flipbook && !l.flipbook.loop) {
      endMs = startMs + l.flipbook.frames * holdSteps(c.time) * stepMs(l.timing);
    }
    return { index, id: l.id, type: l.type, startMs, endMs, ...(flight ? { flight } : {}) };
  });

  const lengthMs = layers.reduce((m, s) => Math.max(m, s.endMs), 0);
  return { frame, layers, byId: new Map(layers.map((s) => [s.id, s])), lengthMs };
}
