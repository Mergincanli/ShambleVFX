/**
 * When each layer starts and ends, and where the phases sit, for one effect, one set of inputs and one set of controls.
 * Flight time can depend on distance, so an effect's length is only known once the inputs are.
 */
import { DEFAULT_STEPS_PER_SECOND, isArrivalStart, isInputAnchor, isPhaseStart } from '@shamble/vfx-format';
import type { EffectFile, InputAnchor, Layer, PhaseName, Timing, Vec3 } from '@shamble/vfx-format';
import type { ResolvedControls } from './controls';
import { add, frameOffset, length, lerp, normalize, scale, shotFrame, sub } from './math';
import type { ShotFrame } from './math';

export interface EffectInputs {
  /** Where the effect starts: a muzzle, the centre of a blast. World metres, y up. */
  origin: Vec3;
  /** Where it goes: the hit point. Same as origin for an effect that stays in one place. */
  target: Vec3;
}

export interface Flight {
  from: Vec3;
  to: Vec3;
  ms: number;
  /** Apex height above the straight line, metres. */
  arcM: number;
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
  flight?: Flight;
}

export interface PhaseSpan {
  name: PhaseName;
  startMs: number;
  endMs: number;
}

export interface Timeline {
  frame: ShotFrame;
  layers: LayerSpan[];
  byId: Map<string, LayerSpan>;
  phases: Record<PhaseName, PhaseSpan>;
  /** When the last layer (or the last phase) ends. */
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

/** Where a projectile is at a share k (0..1) of its flight: on the straight line, lifted by the arc. */
export function flightPoint(f: Flight, k: number): Vec3 {
  const p = lerp(f.from, f.to, k);
  if (f.arcM !== 0) p[1] += f.arcM * 4 * k * (1 - k);
  return p;
}

/** The direction of motion at a share k of the flight (the tangent of the arc). */
export function flightDirection(f: Flight, k: number): Vec3 | undefined {
  const d = sub(f.to, f.from);
  if (f.arcM !== 0) d[1] += f.arcM * 4 * (1 - 2 * k);
  return normalize(d);
}

/** How far into a phase a moment is: 0 at its start, 1 at its end; below 0 before it, above 1 after it. */
export function phaseProgress(tl: Timeline, name: PhaseName, t: number): number {
  const p = tl.phases[name];
  const len = p.endMs - p.startMs;
  if (len <= 0) return t < p.startMs ? -1 : 2;
  return (t - p.startMs) / len;
}

export function resolveTimeline(fx: EffectFile, inputs: EffectInputs, c: ResolvedControls): Timeline {
  const frame = shotFrame(inputs.origin, inputs.target);
  const w = fx.phases.windupMs * c.time, pk = fx.phases.peakMs * c.time, fd = fx.phases.fadeMs * c.time;
  const phases: Record<PhaseName, PhaseSpan> = {
    windup: { name: 'windup', startMs: 0, endMs: w },
    peak: { name: 'peak', startMs: w, endMs: w + pk },
    fade: { name: 'fade', startMs: w + pk, endMs: w + pk + fd },
  };
  const byIdLayer = new Map<string, Layer>(fx.layers.map((l) => [l.id, l]));
  const flights = new Map<string, Flight>();
  for (const l of fx.layers) {
    if (l.type !== 'projectile') continue;
    const from = inputPoint(inputs, frame, l.from, c.size);
    const to = inputPoint(inputs, frame, l.to, c.size);
    let ms: number;
    if (l.flight.mode === 'speed') ms = (length(sub(to, from)) / l.flight.mps) * 1000;
    else if (l.flight.mode === 'time') ms = l.flight.ms * c.time;
    else ms = phases[l.flight.phase].endMs - phases[l.flight.phase].startMs;
    flights.set(l.id, { from, to, ms, arcM: l.arcM * c.size });
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
    } else if (isPhaseStart(l.start)) {
      s += phases[l.start.phase].startMs;
    }
    starts.set(l.id, s);
    return s;
  };

  const layers: LayerSpan[] = fx.layers.map((l, index) => {
    const startMs = startOf(l, 0);
    let endMs = startMs;
    let flight: Flight | undefined;
    if (l.type === 'projectile') {
      flight = flights.get(l.id)!;
      endMs = startMs + flight.ms;
    } else if (l.durationMs !== undefined) {
      endMs = startMs + l.durationMs * c.time;
    } else if (l.untilPhaseEnd !== undefined) {
      endMs = Math.max(startMs, phases[l.untilPhaseEnd].endMs);
    } else if (!isInputAnchor(l.at)) {
      const p = byIdLayer.get(l.at.layer);
      const f = flights.get(l.at.layer);
      if (p && f) endMs = Math.max(startMs, startOf(p, 0) + f.ms);
    } else if (l.type === 'sprite' && l.flipbook && !l.flipbook.loop) {
      endMs = startMs + l.flipbook.frames * holdSteps(c.time) * stepMs(l.timing);
    } else if (l.type === 'burst' && !l.loop) {
      endMs = startMs + l.lifeMs[1] * c.time;
    }
    return { index, id: l.id, type: l.type, startMs, endMs, ...(flight ? { flight } : {}) };
  });

  const lengthMs = layers.reduce((m, s) => Math.max(m, s.endMs), phases.fade.endMs);
  return { frame, layers, byId: new Map(layers.map((s) => [s.id, s])), phases, lengthMs };
}
