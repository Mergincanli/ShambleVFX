/**
 * The checker. It names every problem in plain words, with where it is:
 * schema errors, unknown colour roles (the ones a layer names, and the ones it draws without naming them: see colours.ts)
 * and gradients, missing images, hex colours, broken links between layers, missing lengths, and, as warnings, characters
 * we have not drawn yet, word chances that do not work as typed, a fire's bed layers with different gradients, a bed
 * gradient with very many bands, and phases with no length.
 */
import type { core } from 'zod';
import { WORD_LETTERS } from '../defaults';
import { roleNames } from '../palette';
import type { Palette } from '../palette';
import { LAYER_TYPES, isArrivalStart, isInputAnchor, isPhaseStart } from '../types';
import type { BedShape, EffectFile, Layer, PhaseName, VisibleLayer, WordLayer } from '../types';
import { chanceTotal, wordShares } from '../words';
import { layerColours } from './colours';
import { migrate } from './migrate';
import type { Migration } from './migrate';
import { effectSchema } from './schema';

export type ProblemKind = 'format' | 'version' | 'schema' | 'colour' | 'role' | 'gradient' | 'image' | 'link' | 'duration' | 'id' | 'letters' | 'chance' | 'phase' | 'place' | 'tier' | 'export';

export interface Problem {
  kind: ProblemKind;
  /** error: the file cannot be used as it is. warning: it works, but probably not as meant. */
  level: 'error' | 'warning';
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

export interface CheckResult {
  /** No errors (warnings allowed). */
  ok: boolean;
  /** The effect, upgraded to the current version, when it passed the schema (even with other problems). */
  effect?: EffectFile;
  /** The upgraded file as plain data, whenever the upgrade itself worked. Use this, never the raw old file. */
  upgraded?: Record<string, unknown>;
  problems: Problem[];
  upgradedFrom?: number;
}

/**
 * A fire's bed draws one band of lumps per stop of a banded gradient, so its triangles grow with every stop. Above this
 * many stops the checker warns. Assumed (not yet decided by the Art lead): 8, twice the four tones a bed has by default.
 */
export const BED_BAND_STOPS_WARN = 8;

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
      out.push({ kind: 'colour', level: 'error', path: pathText(path), message: `holds a fixed colour ("${v}"). Effect files name colour roles only; hexes live in the palette` });
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

/**
 * A percent for a message: whole numbers as they are, others to two decimals at most (120, 33.33). A total that is `over`
 * 100 gets as many decimals as it takes to show that (100.002), so a message never calls such a total 100.
 */
function percent(v: number, over = false): string {
  for (let d = 2; d <= 12; d++) {
    const s = String(Math.round(v * 10 ** d) / 10 ** d);
    if (!over || Number(s) > 100) return s;
  }
  return String(v);
}

/**
 * Word chances that will not work as typed (warnings): chances that add up to more than 100 % (scaled down), a word
 * without a chance left with nothing because the others already reach 100 %, a word with a 0 % chance. The rules are
 * wordShares' own (words.ts), so a warning never says something the pick does not do.
 */
function chanceWarnings(l: WordLayer, at: string, warn: (path: string, message: string) => void): void {
  const t = chanceTotal(l.words);
  if (t.over) warn(`${at}.words`, `"${l.name}": the chances add up to ${percent(t.total, true)} %: they are scaled down to 100 %`);
  const shares = wordShares(l.words);
  l.words.forEach((w, j) => {
    if (w.chance === 0) warn(`${at}.words[${j}].chance`, `"${w.text}" has a 0 % chance, so it never shows`);
    else if (w.chance === undefined && shares.words[j] === 0) {
      warn(`${at}.words[${j}]`, `"${w.text}" has no chance of its own, and the other words' chances already reach 100 %, so it never shows`);
    }
  });
}

/** Why a visible layer has no length, or null when its length can be worked out. */
function durationProblem(l: Layer): string | null {
  if (l.type === 'projectile') return null;
  if (l.durationMs !== undefined || l.untilPhaseEnd !== undefined) return null;
  if (!isInputAnchor(l.at)) return null; // rides a projectile: shows while it flies
  if (l.type === 'sprite' && l.flipbook && !l.flipbook.loop) return null; // one step per frame
  if (l.type === 'burst' && !l.loop) return null; // as long as its longest piece lives
  return 'needs a length: durationMs, or untilPhaseEnd, or it must ride a projectile';
}

/** Check an effect file. Older versions are upgraded first. */
export function checkEffect(input: unknown, opts: CheckOptions = {}): CheckResult {
  const problems: Problem[] = [];
  const err = (kind: ProblemKind, path: string, message: string) => problems.push({ kind, level: 'error', path, message });
  const warn = (kind: ProblemKind, path: string, message: string) => problems.push({ kind, level: 'warning', path, message });
  const up = migrate(input, opts.migrations);
  if (!up.ok) {
    err(input && typeof input === 'object' && 'format' in input ? 'version' : 'format', '(file)', up.problem);
    return { ok: false, problems };
  }
  const upgradedFrom = up.steps > 0 ? up.from : undefined;
  const doc = up.doc;

  findColourStrings(doc, [], problems);

  const parsed = effectSchema.safeParse(doc, { reportInput: true });
  if (!parsed.success) {
    for (const iss of parsed.error.issues) err('schema', pathText(iss.path), issueText(iss));
    return { ok: false, upgraded: doc, problems, upgradedFrom };
  }
  const fx = parsed.data as EffectFile;
  const phaseLen: Record<PhaseName, number> = { windup: fx.phases.windupMs, peak: fx.phases.peakMs, fade: fx.phases.fadeMs };
  const phasesSet = phaseLen.windup + phaseLen.peak + phaseLen.fade > 0;

  // Layer ids and links between layers.
  const byId = new Map<string, { layer: Layer; index: number }>();
  fx.layers.forEach((l, i) => {
    if (byId.has(l.id)) err('id', `layers[${i}].id`, `"${l.id}" is used by more than one layer`);
    else byId.set(l.id, { layer: l, index: i });
  });
  fx.layers.forEach((l, i) => {
    const at = `layers[${i}]`;
    if (l.type !== 'projectile') {
      if (!isInputAnchor(l.at)) {
        const t = byId.get(l.at.layer);
        if (!t) err('link', `${at}.at.layer`, `rides "${l.at.layer}", but there is no such layer`);
        else if (t.layer.type !== 'projectile') err('link', `${at}.at.layer`, `rides "${l.at.layer}", which is not a projectile. Only projectiles can be ridden`);
      }
      if (l.durationMs !== undefined && l.untilPhaseEnd !== undefined) err('duration', at, `"${l.name}" has both durationMs and untilPhaseEnd: keep one`);
      if ((l.blend === 'multiply' || l.blend === 'screen') && l.facing !== 'ground') err('place', `${at}.blend`, `"${l.name}": ${l.blend} works on what lies under it, so the layer must lie on the ground (facing "ground")`);
      if (l.type === 'word' && l.facing !== 'camera') err('place', `${at}.facing`, `"${l.name}": a word always faces the screen (facing "camera")`);
      if (l.type === 'shape' && l.shape.kind === 'trail' && isInputAnchor(l.at)) err('link', `${at}.at`, `"${l.name}": a trail follows a projectile, so it must ride one`);
      if (l.untilPhaseEnd && !phasesSet) warn('phase', `${at}.untilPhaseEnd`, `"${l.name}" ends with a phase, but the effect has no phases set`);
    } else if (l.flight.mode === 'phase' && phaseLen[l.flight.phase] <= 0) {
      warn('phase', `${at}.flight`, `"${l.name}" flies for the ${l.flight.phase} phase, which has no length, so it lands at once`);
    }
    if (isArrivalStart(l.start)) {
      const t = byId.get(l.start.arrivalOf);
      if (!t) err('link', `${at}.start.arrivalOf`, `starts when "${l.start.arrivalOf}" lands, but there is no such layer`);
      else if (t.layer.type !== 'projectile') err('link', `${at}.start.arrivalOf`, `starts when "${l.start.arrivalOf}" lands, but that layer is not a projectile`);
      else if (l.start.arrivalOf === l.id) err('link', `${at}.start.arrivalOf`, 'starts when it lands itself');
    }
    if (isPhaseStart(l.start) && !phasesSet) warn('phase', `${at}.start`, `"${l.name}" starts with a phase, but the effect has no phases set`);
    const d = durationProblem(l);
    if (d) err('duration', at, `"${l.name}" ${d}`);
    if (l.type === 'word') {
      l.words.forEach((w, j) => {
        const missing = [...new Set([...w.text.toUpperCase()].filter((ch) => ch !== ' ' && !WORD_LETTERS.includes(ch)))];
        if (missing.length) warn('letters', `${at}.words[${j}].text`, `"${w.text}": ${missing.map((m) => `"${m}"`).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not drawn yet and will be left out (drawn: ${WORD_LETTERS})`);
      });
      chanceWarnings(l, at, (path, message) => warn('chance', path, message));
    }
  });

  // A fire's bed: the detail's halftone matches the bands (their colours, and with a banded gradient where they meet) only
  // when the detail and the lumps share one gradient (or both have none). Assumption, marked: the effect's bed layers
  // belong to one fire, so every detail layer is compared with every lumps layer of the effect.
  const beds = fx.layers.flatMap((l, i) => (l.type === 'shape' && l.shape.kind === 'bed' ? [{ l, i, sp: l.shape as BedShape }] : []));
  for (const d of beds.filter((b) => b.sp.part === 'detail')) {
    const other = beds.find((b) => b.sp.part === 'lumps' && b.sp.gradient !== d.sp.gradient);
    if (!other) continue;
    const name = (g: string | undefined) => (g ? `"${g}"` : 'none');
    warn('gradient', `layers[${d.i}].shape.gradient`,
      `"${d.l.name}" and "${other.l.name}" use different gradients (${name(d.sp.gradient)} and ${name(other.sp.gradient)}): the detail's halftone would not match the bands (their colours, or where they meet). Give both bed layers the same gradient`);
  }

  // Quality tiers: Low drops extras but must stay readable, so it must show something.
  const visibleLayers = fx.layers.filter((l) => l.type !== 'projectile') as VisibleLayer[];
  if (visibleLayers.length && !visibleLayers.some((l) => l.tiers.includes('low'))) {
    warn('tier', 'layers', 'nothing shows in the Low tier: Low drops extras, but the effect should still read');
  }

  // Start times must not wait on each other in a circle.
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string, trail: string[]): void => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      const cycle = [...trail.slice(trail.indexOf(id)), id].join(' -> ');
      err('link', `layers[${byId.get(id)!.index}].start`, `start times wait on each other in a circle: ${cycle}`);
      return;
    }
    state.set(id, 1);
    const l = byId.get(id)?.layer;
    if (l && isArrivalStart(l.start) && byId.has(l.start.arrivalOf) && l.start.arrivalOf !== id) visit(l.start.arrivalOf, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);

  // Colour roles: every colour each layer can use (layerColours): the roles its fields name, the ones its kind draws
  // without naming them (the ink outline, a white first step, the broken edge) and its gradient's stops. A glow, smoke, a
  // fire's bed or a burst may take its colours from a gradient: the gradient must be in the palette.
  if (opts.palette) {
    const palette = opts.palette;
    const known = new Set(roleNames(palette));
    if (!known.has(fx.controls.colour)) err('role', 'controls.colour', `"${fx.controls.colour}" is not a role in the palette`);
    fx.layers.forEach((l, i) => {
      const used = layerColours(l, { index: i, main: fx.controls.colour, palette });
      for (const c of used.colours) {
        // "main" is the main colour, checked once above. A stop given as a hex is no palette colour.
        if (c.role === undefined || c.why === 'main' || known.has(c.role)) continue;
        err('role', c.path, c.why === 'field' ? `"${c.role}" is not a role in the palette` : `"${c.role}" is not a role in the palette: "${l.name}" needs it for ${c.note}`);
      }
      for (const g of used.gradients) if (!palette.gradients?.[g.name]) err('gradient', g.path, `"${g.name}" is not a gradient in the palette`);
    });
    // A banded gradient on a fire's bed: one band of lumps per stop.
    for (const { l, i, sp } of beds) {
      const g = sp.gradient ? palette.gradients?.[sp.gradient] : undefined;
      if (g?.kind !== 'banded' || !Array.isArray(g.stops) || g.stops.length <= BED_BAND_STOPS_WARN) continue;
      warn('gradient', `layers[${i}].shape.gradient`,
        `"${l.name}": the gradient "${sp.gradient}" is banded and has ${g.stops.length} stops. On a fire's bed, each stop is a band of lumps, so the triangles grow with every stop. Keep it to ${BED_BAND_STOPS_WARN} stops or fewer`);
    }
  }

  // Images.
  if (opts.images) {
    const have = new Set(opts.images);
    fx.layers.forEach((l, i) => {
      if (l.type === 'sprite' && !have.has(l.image)) err('image', `layers[${i}].image`, `"${l.image}" is missing from the images folder`);
      if (l.type === 'burst' && l.look.kind === 'image' && !have.has(l.look.image)) err('image', `layers[${i}].look.image`, `"${l.look.image}" is missing from the images folder`);
    });
  }

  const ok = !problems.some((p) => p.level === 'error');
  return { ok, effect: fx, upgraded: doc, problems, upgradedFrom };
}

/** One line per problem, for logs and the editor. Warnings say so. */
export function problemLines(problems: readonly Problem[]): string[] {
  return problems.map((p) => `${p.level === 'warning' ? 'warning: ' : ''}${p.path}: ${p.message}`);
}
