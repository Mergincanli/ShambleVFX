/**
 * The big controls (size, intensity, duration, colour), turned into the factors the runtime uses.
 * This is the ONE place that decides what each control changes. The editor only edits the numbers.
 *
 * Marked as assumptions (Shamble VFX's reading, not Mustafa's decision):
 * - size scales every sprite's size and every offset. It does not move the points the game gives
 *   (origin, target) and does not change speeds.
 * - intensity scales the sprites that sit on a point the game gives (flashes, hits, landings) and the
 *   stretch of streaks that ride a projectile. It never changes see-through-ness: the look is flat colour.
 *   From milestone 2 it will also change how many pieces a burst throws.
 * - duration stretches the effect's own times (start delays, durations). Not a projectile's flight time,
 *   which comes from distance and speed, and not the step rate (12 a second stays 12 a second).
 * - colour is the main colour role: layers whose tint role is "main" use it.
 */
import type { Controls } from '@shamble/vfx-format';

export interface ResolvedControls {
  /** Multiplies sprite sizes and offsets. */
  size: number;
  /** Multiplies flash-like sprite sizes and streak stretch. */
  intensity: number;
  /** Multiplies the effect's own times. */
  time: number;
  /** The role "main" stands for. */
  mainRole: string;
}

export function applyControls(c: Controls): ResolvedControls {
  return { size: c.size, intensity: c.intensity, time: c.duration, mainRole: c.colour };
}
