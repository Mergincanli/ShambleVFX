/**
 * The big controls (size, intensity, duration, colour), turned into the factors the runtime uses.
 * This is the ONE place that decides what each control changes. The editor only edits the numbers.
 *
 * Marked as assumptions (Shamble VFX's reading, not Mustafa's decision):
 * - size scales every sprite, shape, word and piece, and every offset. It does not move the points the game gives
 *   (origin, target) and does not change speeds.
 * - intensity scales the sprites that sit on a point the game gives (flashes, hits, landings), the stretch of streaks
 *   that ride a projectile, and how many pieces a burst throws. It never changes see-through-ness: the look is flat.
 * - duration stretches the effect's own times: start delays, lengths, the three phases, and fixed flight times
 *   (a flight "for a time" or "for a phase"). It does not change a flight by speed (that comes from distance), nor the
 *   step rate: 12 a second stays 12 a second, and a flipbook holds each frame for whole steps instead.
 * - colour is the main colour role: layers whose role is "main" use it.
 */
import type { Controls } from '@shamble/vfx-format';

export interface ResolvedControls {
  /** Multiplies sizes and offsets. */
  size: number;
  /** Multiplies flash-like sprite sizes, streak stretch and burst counts. */
  intensity: number;
  /** Multiplies the effect's own times, phases and fixed flight times. */
  time: number;
  /** The role "main" stands for. */
  mainRole: string;
}

export function applyControls(c: Controls): ResolvedControls {
  return { size: c.size, intensity: c.intensity, time: c.duration, mainRole: c.colour };
}
