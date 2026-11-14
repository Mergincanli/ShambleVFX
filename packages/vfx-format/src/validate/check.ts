/**
 * The checker. It names every problem in plain words, with where it is:
 * schema errors, unknown colour roles, missing images, hex colours, broken links between layers, missing durations.
 */
import type { core } from 'zod';
import { roleNames } from '../palette';
import type { Palette } from '../palette';
import { LAYER_TYPES, MAIN_ROLE, isArrivalStart, isInputAnchor } from '../types';
import type { EffectFile, Layer } from '../types';
import { migrate } from './migrate';
import type { Migration } from './migrate';
import { effectSchema } from './schema';

export type ProblemKind = 'format' | 'version' | 'schema' | 'colour' | 'role' | 'image' | 'link' | 'duration' | 'id';

export interface Problem {
  kind: ProblemKind;
  /** Where in the file, e.g. layers[2].tint.role */
  path: string;
  message: string;
}

export interface CheckOptions {
  /** With a palette, every role is checked. */
  palette?: Palette;
  /** With the list of image files the project has, every image is checked. */
  images?: Iterable<string>;
  /** For tests only: a different list of upgrades. */
  migrations?: Readonly<Record<number, Migration>>;
}

export type CheckResult =
  | { ok: true; effect: EffectFile; problems: []; upgradedFrom?: number }
  | { ok: false; problems: Problem[]; effect?: undefined; upgradedFrom?: number };

export function pathText(path: readonly PropertyKey[]): string {
  let s = '';
  for (const p of path) s += typeof p === 'number' ? `[${p}]` : s ? `.${String(p)}` : String(p);
  return s || '(file)';
}

const HEX_COLOUR = /#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?(?![0-9A-Za-z])/;
const CSS_COLOUR = /\b(?:rgba?|hsla?)\s*\(/i;

/** Colours are role names. A hex or CSS colour anywhere in an effect file is refused, even in a name. */
function findColourStrings(v: unknown, path: (string | number)[], out: Problem[]): void {
  if (typeof v === 'string') {
    if (HEX_COLOUR.test(v) || CSS_COLOUR.test(v)) {
      out.push({ kind: 'colour', path: pathText(path), message: `holds a fixed colour ("${v}"). Effect files name colour roles only; hexes live in the palette` });
    }
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => findColourStrings(x, [...path, i], out));
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) findColourStrings(x, [...path, k], out);
  }
}

function issueText(iss: core.$ZodIssue): string {
  const input = (iss as { input?: unknown }).input;
  switch (iss.code) {
    case 'invalid_type':
      if (input === undefined) return 'is missing';
      return `should be ${iss.expected === 'array' ? 'a list' : iss.expected === 'object' ? 'an object' : `a ${iss.expected}`}`;
    case 'unrecognized_keys':
      return `has unknown field${iss.keys.length > 1 ? 's' : ''}: ${iss.keys.map((k) => `"${k}"`).join(', ')}`;
    case 'invalid_value':
      return `must be ${iss.values.map((x) => JSON.stringify(x)).join(' or ')}`;
    case 'invalid_union': {
      const disc = (iss as { discriminator?: string }).discriminator;
      if (disc === 'type') return `must be ${LAYER_TYPES.map((t) => `"${t}"`).join(' or ')}`;
      if (disc) return `is not a known ${disc}`;
      return 'does not match any allowed form';
    }
    case 'too_small':
      if (iss.origin === 'array' || iss.origin === 'string') return iss.message;
      return iss.message.startsWith('Too small') ? `must be at least ${String(iss.minimum)}` : iss.message;
    case 'too_big':
      if (iss.origin === 'array' || iss.origin === 'string') return iss.message;
      return iss.message.startsWith('Too big') ? `must be at most ${String(iss.maximum)}` : iss.message;
    default:
      return iss.message;
  }
}

function layerDurationProblem(l: Layer): string | null {
  if (l.type !== 'sprite' || l.durationMs !== undefined) return null;
  if (!isInputAnchor(l.at)) return null; // rides a projectile: shows while it flies
  if (l.flipbook && !l.flipbook.loop) return null; // one step per frame
  return l.flipbook ? 'loops its flipbook, so it needs a duration (durationMs)' : 'needs a duration (durationMs), or must ride a projectile';
}

/** Check an effect file. Older versions are upgraded first. */
export function checkEffect(input: unknown, opts: CheckOptions = {}): CheckResult {
  const problems: Problem[] = [];
  const up = migrate(input, opts.migrations);
  if (!up.ok) return { ok: false, problems: [{ kind: input && typeof input === 'object' && 'format' in input ? 'version' : 'format', path: '(file)', message: up.problem }] };
  const upgradedFrom = up.steps > 0 ? up.from : undefined;
  const doc = up.doc;

  findColourStrings(doc, [], problems);

  const parsed = effectSchema.safeParse(doc, { reportInput: true });
  if (!parsed.success) {
    for (const iss of parsed.error.issues) problems.push({ kind: 'schema', path: pathText(iss.path), message: issueText(iss) });
    return { ok: false, problems, upgradedFrom };
  }
  const fx = parsed.data as EffectFile;

  // Layer ids and links between layers.
  const byId = new Map<string, { layer: Layer; index: number }>();
  fx.layers.forEach((l, i) => {
    if (byId.has(l.id)) problems.push({ kind: 'id', path: `layers[${i}].id`, message: `"${l.id}" is used by more than one layer` });
    else byId.set(l.id, { layer: l, index: i });
  });
  fx.layers.forEach((l, i) => {
    if (l.type === 'sprite' && !isInputAnchor(l.at)) {
      const t = byId.get(l.at.layer);
      if (!t) problems.push({ kind: 'link', path: `layers[${i}].at.layer`, message: `rides "${l.at.layer}", but there is no such layer` });
      else if (t.layer.type !== 'projectile') problems.push({ kind: 'link', path: `layers[${i}].at.layer`, message: `rides "${l.at.layer}", which is not a projectile. Only projectiles can be ridden` });
    }
    if (isArrivalStart(l.start)) {
      const t = byId.get(l.start.arrivalOf);
      if (!t) problems.push({ kind: 'link', path: `layers[${i}].start.arrivalOf`, message: `starts when "${l.start.arrivalOf}" lands, but there is no such layer` });
      else if (t.layer.type !== 'projectile') problems.push({ kind: 'link', path: `layers[${i}].start.arrivalOf`, message: `starts when "${l.start.arrivalOf}" lands, but that layer is not a projectile` });
      else if (l.start.arrivalOf === l.id) problems.push({ kind: 'link', path: `layers[${i}].start.arrivalOf`, message: 'starts when it lands itself' });
    }
    const d = layerDurationProblem(l);
    if (d) problems.push({ kind: 'duration', path: `layers[${i}]`, message: `"${l.name}" ${d}` });
  });

  // Start times must not wait on each other in a circle.
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string, trail: string[]): void => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      const cycle = [...trail.slice(trail.indexOf(id)), id].join(' -> ');
      problems.push({ kind: 'link', path: `layers[${byId.get(id)!.index}].start`, message: `start times wait on each other in a circle: ${cycle}` });
      return;
    }
    state.set(id, 1);
    const l = byId.get(id)?.layer;
    if (l && isArrivalStart(l.start) && byId.has(l.start.arrivalOf) && l.start.arrivalOf !== id) visit(l.start.arrivalOf, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);

  // Colour roles.
  if (opts.palette) {
    const known = new Set(roleNames(opts.palette));
    if (!known.has(fx.controls.colour)) {
      problems.push({ kind: 'role', path: 'controls.colour', message: `"${fx.controls.colour}" is not a role in the palette` });
    }
    fx.layers.forEach((l, i) => {
      if (l.type === 'sprite' && l.tint.mode === 'multiply' && l.tint.role !== MAIN_ROLE && !known.has(l.tint.role)) {
        problems.push({ kind: 'role', path: `layers[${i}].tint.role`, message: `"${l.tint.role}" is not a role in the palette` });
      }
    });
  }

  // Images.
  if (opts.images) {
    const have = new Set(opts.images);
    fx.layers.forEach((l, i) => {
      if (l.type === 'sprite' && !have.has(l.image)) {
        problems.push({ kind: 'image', path: `layers[${i}].image`, message: `"${l.image}" is missing from the images folder` });
      }
    });
  }

  if (problems.length) return { ok: false, problems, upgradedFrom };
  return { ok: true, effect: fx, problems: [], upgradedFrom };
}

/** One line per problem, for logs and the editor. */
export function problemLines(problems: readonly Problem[]): string[] {
  return problems.map((p) => `${p.path}: ${p.message}`);
}
