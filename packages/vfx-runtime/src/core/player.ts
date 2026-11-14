/**
 * Keeps track of effects that are playing: the game (or the editor's Fire button) starts one, and each frame
 * asks which ones are alive. Pure bookkeeping; drawing is the three.js side's job.
 */
import type { EffectFile, FactionId } from '@shamble/vfx-format';
import { applyControls } from './controls';
import { resolveTimeline } from './timeline';
import type { EffectInputs } from './timeline';

export interface PlayingEffect {
  /** Unique per started effect. */
  id: number;
  effectId: string;
  seed: number;
  inputs: EffectInputs;
  faction: FactionId;
  /** The clock time (ms) the effect started at. */
  startMs: number;
}

export type EffectLookup = (effectId: string) => EffectFile | undefined;

export class EffectPlayer {
  private playing: PlayingEffect[] = [];
  private nextId = 1;

  start(effectId: string, opts: { seed: number; inputs: EffectInputs; faction: FactionId; nowMs: number }): PlayingEffect {
    const p: PlayingEffect = { id: this.nextId++, effectId, seed: opts.seed >>> 0, inputs: opts.inputs, faction: opts.faction, startMs: opts.nowMs };
    this.playing.push(p);
    return p;
  }

  /** The effects still playing at nowMs, oldest first. Finished ones are dropped. */
  alive(nowMs: number, lookup: EffectLookup): PlayingEffect[] {
    this.playing = this.playing.filter((p) => {
      const fx = lookup(p.effectId);
      if (!fx) return false;
      const len = resolveTimeline(fx, p.inputs, applyControls(fx.controls)).lengthMs;
      return nowMs - p.startMs < len;
    });
    return this.playing;
  }

  clear(): void {
    this.playing = [];
  }

  get count(): number {
    return this.playing.length;
  }
}
