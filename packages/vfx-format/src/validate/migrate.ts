/**
 * Upgrades: each step turns an effect file of version n into version n + 1.
 * Rule: whenever the format changes, FORMAT_VERSION goes up by one and a step is added here, with a test.
 */
import { FORMAT_ID, FORMAT_VERSION } from '../types';

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** Version n -> n + 1. Empty while version 1 is the only version. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

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
