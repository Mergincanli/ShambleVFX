/**
 * Upgrades: each step turns an effect file of version n into version n + 1.
 * Rule: whenever the format changes, FORMAT_VERSION goes up by one and a step is added here, with a test.
 */
import { FORMAT_ID, FORMAT_VERSION } from '../types';

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

type Obj = Record<string, unknown>;

/**
 * Version 1 -> 2 (milestone 2):
 * - the effect gets phases (wind-up, peak, fade), all 0 = "not set", so nothing moves;
 * - a sprite gets blend "normal" (as version 1 drew it);
 * - a projectile's speedMps becomes flight { mode: "speed", mps }, and it gets arcM 0 (straight, as before).
 */
function v1to2(doc: Obj): Obj {
  const layers = Array.isArray(doc.layers) ? (doc.layers as Obj[]) : [];
  return {
    ...doc,
    version: 2,
    phases: { windupMs: 0, peakMs: 0, fadeMs: 0 },
    layers: layers.map((l) => {
      if (l && l.type === 'sprite') return { ...l, blend: 'normal' };
      if (l && l.type === 'projectile') {
        const { speedMps, ...rest } = l;
        return { ...rest, flight: { mode: 'speed', mps: speedMps }, arcM: 0 };
      }
      return l;
    }),
  };
}

/**
 * Version 2 -> 3 (milestone 3): every visible layer gets the quality tiers it shows in, all three, so an old effect
 * looks the same at every tier until someone decides what Low drops.
 */
function v2to3(doc: Obj): Obj {
  const layers = Array.isArray(doc.layers) ? (doc.layers as Obj[]) : [];
  return {
    ...doc,
    version: 3,
    layers: layers.map((l) => (l && l.type !== 'projectile' && !('tiers' in l) ? { ...l, tiers: ['low', 'medium', 'high'] } : l)),
  };
}

/** Version n -> n + 1. */
/**
 * Version 3 -> 4: a glow may take its colours from a gradient in the palette ("gradient", optional). Nothing in a
 * version 3 file changes; the number goes up so an older runtime refuses an effect it could not draw.
 */
function v3to4(doc: Obj): Obj {
  return { ...doc, version: 4 };
}

export const MIGRATIONS: Readonly<Record<number, Migration>> = { 1: v1to2, 2: v2to3, 3: v3to4 };

export type MigrateResult =
  | { ok: true; doc: Record<string, unknown>; from: number; steps: number }
  | { ok: false; problem: string };

export function migrate(
  input: unknown,
  registry: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = FORMAT_VERSION,
): MigrateResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, problem: 'is not an effect file: expected a JSON object' };
  }
  const doc = input as Record<string, unknown>;
  if (doc.format !== FORMAT_ID) {
    return { ok: false, problem: `is not a Shamble VFX effect file: "format" must be "${FORMAT_ID}"` };
  }
  const from = doc.version;
  if (typeof from !== 'number' || !Number.isInteger(from)) {
    return { ok: false, problem: '"version" must be a whole number' };
  }
  if (from > target) {
    return { ok: false, problem: `was made by a newer Shamble VFX (file version ${from}); this one reads up to version ${target}` };
  }
  let cur: Record<string, unknown> = structuredClone(doc);
  let steps = 0;
  for (let v = from; v < target; v++) {
    const step = registry[v];
    if (!step) return { ok: false, problem: `has version ${from}, and there is no upgrade from version ${v} to ${v + 1}` };
    cur = step(cur);
    if (cur.version !== v + 1) return { ok: false, problem: `the upgrade from version ${v} did not produce version ${v + 1}` };
    steps++;
  }
  return { ok: true, doc: cur, from, steps };
}
