/**
 * Cost budgets at three levels, as project.json (version 2) and an export's editor.json keep them under "budgets":
 *
 *   project   one set of numbers for every effect in the project
 *   classes   named classes (Small, Normal and Big to start with), each with its own set; an effect can be in one
 *   effects   an effect's own set
 *
 * Each level is off until it is switched on (Mustafa: "optional for all three, and toggled off"). The closest level that
 * is on counts, as a whole set: the effect's own, else its class (when the class level is on and the effect has a class),
 * else the project's. An empty box in that set means no limit for that number.
 *
 * A file holds only what differs from the defaults (everything off, the three starting classes with no numbers, no
 * entries for effects), so files stay small and reading then writing gives the same file.
 *
 * Plain functions with no imports but types: the editor, the local server (whose file Vite's config loader also loads,
 * and that loader cannot load the workspace packages) and the command line all use this file. Every edit returns a new
 * object and leaves the one it was given as it was.
 */
import type { TierName } from '@shamble/vfx-format';

/** What a budget can be set for. "ms" is compared with the 95th percentile frame, "area" with the screen share in percent. */
export const COST_METRICS = ['draws', 'sprites', 'triangles', 'area', 'ms'] as const;
export type CostMetric = (typeof COST_METRICS)[number];

/** The quality tiers, in order: the same as TIER_NAMES in @shamble/vfx-format (a test compares them). */
export const BUDGET_TIERS: readonly TierName[] = ['low', 'medium', 'high'];

/** The rule for effect ids (the checker's, repeated here; a test compares them). */
export const EFFECT_ID = /^[a-z][a-z0-9_]{0,47}$/;
/** A class's id: what an effect's entry names. Made from the class's first name, and kept when it is renamed. */
export const CLASS_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
/** The longest class name. */
export const CLASS_NAME_MAX = 64;

/** The numbers at one level: per tier, per metric. A missing number means no limit. */
export type Limits = Partial<Record<TierName, Partial<Record<CostMetric, number>>>>;

export interface BudgetClass {
  id: string;
  name: string;
  limits: Limits;
}

export interface EffectBudget {
  /** The class the effect is in (a class id), or none. */
  class?: string;
  on: boolean;
  limits: Limits;
}

/** The budgets of one project, every part filled in (defaults where the file says nothing). */
export interface Budgets {
  project: { on: boolean; limits: Limits };
  classes: { on: boolean; list: BudgetClass[] };
  /** By effect id. Only effects with something set have an entry. */
  effects: Record<string, EffectBudget>;
}

/** The level whose numbers count for an effect. "none": no level is on, so nothing is compared. */
export type BudgetLevel = 'effect' | 'class' | 'project' | 'none';

export interface CountingBudget {
  level: BudgetLevel;
  /** The effect's class, when the class level is what counts. */
  class?: { id: string; name: string };
  /** The numbers that count (empty for "none"). An empty box means no limit for that number. */
  limits: Limits;
}

/** The classes a project starts with: no numbers, so they limit nothing until some are typed. */
export const DEFAULT_CLASSES: readonly Readonly<BudgetClass>[] = [
  { id: 'small', name: 'Small', limits: {} },
  { id: 'normal', name: 'Normal', limits: {} },
  { id: 'big', name: 'Big', limits: {} },
];

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const own = <T>(o: Record<string, T>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);
const isLimit = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function defaultBudgets(): Budgets {
  return { project: { on: false, limits: {} }, classes: { on: false, list: DEFAULT_CLASSES.map((c) => ({ id: c.id, name: c.name, limits: {} })) }, effects: {} };
}

// ---------------------------------------------------------------- reading

/** One level's numbers, keeping only the three tiers and the five metrics, with numbers of 0 or more. */
export function readLimits(v: unknown): Limits {
  const out: Limits = {};
  if (!isObject(v)) return out;
  for (const tier of BUDGET_TIERS) {
    const t = v[tier];
    if (!isObject(t)) continue;
    for (const m of COST_METRICS) if (isLimit(t[m])) (out[tier] ??= {})[m] = t[m];
  }
  return out;
}

/** True when some tier has some number. */
export function hasLimits(l: Limits): boolean {
  return BUDGET_TIERS.some((t) => COST_METRICS.some((m) => isLimit(l[t]?.[m])));
}

/** A budget as typed, or undefined for an empty or unusable box. */
export function budgetOf(l: Limits, tier: TierName, metric: CostMetric): number | undefined {
  const v = l[tier]?.[metric];
  return isLimit(v) ? v : undefined;
}

/**
 * "budgets" from project.json version 2 or editor.json version 2. Parts it does not have, or cannot read, are the
 * defaults; an effect's class that is not in the list is left out (the effect has none).
 */
export function readBudgets(v: unknown): Budgets {
  const b = defaultBudgets();
  if (!isObject(v)) return b;
  if (isObject(v.project)) b.project = { on: v.project.on === true, limits: readLimits(v.project.limits) };
  if (isObject(v.classes)) {
    b.classes.on = v.classes.on === true;
    if (Array.isArray(v.classes.list)) b.classes.list = readClassList(v.classes.list);
  }
  if (isObject(v.effects)) {
    for (const [id, e] of Object.entries(v.effects)) {
      if (!EFFECT_ID.test(id) || !isObject(e)) continue;
      const cls = typeof e.class === 'string' && b.classes.list.some((c) => c.id === e.class) ? e.class : undefined;
      const entry: EffectBudget = { ...(cls ? { class: cls } : {}), on: e.on === true, limits: readLimits(e.limits) };
      if (!isDefaultEntry(entry)) b.effects[id] = entry;
    }
  }
  return b;
}

/** Version 1 kept one set of numbers for the whole project: it becomes the project level, switched off, numbers kept. */
export function budgetsFromVersion1(v: unknown): Budgets {
  const b = defaultBudgets();
  b.project.limits = readLimits(v);
  return b;
}

function readClassList(list: unknown[]): BudgetClass[] {
  const out: BudgetClass[] = [];
  for (const c of list) {
    if (!isObject(c) || typeof c.id !== 'string' || !CLASS_ID.test(c.id) || out.some((x) => x.id === c.id)) continue;
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    out.push({ id: c.id, name: name || c.id, limits: readLimits(c.limits) });
  }
  return out;
}

// ---------------------------------------------------------------- writing

/** What a file holds under "budgets": only what differs from the defaults (an empty object when nothing does). */
export function budgetsJson(b: Budgets): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const project = levelJson(b.project.on, b.project.limits);
  if (project) out.project = project;
  const classes: Record<string, unknown> = {};
  if (b.classes.on) classes.on = true;
  // A changed list is written whole, an empty one too: without "list" the three starting classes come back.
  if (!isDefaultClassList(b.classes.list)) {
    classes.list = b.classes.list.map((c) => ({ id: c.id, name: c.name, ...(hasLimits(c.limits) ? { limits: limitsJson(c.limits) } : {}) }));
  }
  if (Object.keys(classes).length) out.classes = classes;
  const effects: Record<string, unknown> = {};
  for (const [id, e] of Object.entries(b.effects)) {
    if (!EFFECT_ID.test(id) || isDefaultEntry(e)) continue;
    effects[id] = { ...(e.class ? { class: e.class } : {}), ...(e.on ? { on: true } : {}), ...(hasLimits(e.limits) ? { limits: limitsJson(e.limits) } : {}) };
  }
  if (Object.keys(effects).length) out.effects = effects;
  return out;
}

/** True when nothing differs from the defaults. */
export function isDefaultBudgets(b: Budgets): boolean {
  return Object.keys(budgetsJson(b)).length === 0;
}

function levelJson(on: boolean, limits: Limits): Record<string, unknown> | undefined {
  if (!on && !hasLimits(limits)) return undefined;
  return { ...(on ? { on: true } : {}), ...(hasLimits(limits) ? { limits: limitsJson(limits) } : {}) };
}

/** Limits in a fixed order (tiers low to high, metrics as on the card), empty tiers left out. */
function limitsJson(l: Limits): Limits {
  const out: Limits = {};
  for (const t of BUDGET_TIERS) for (const m of COST_METRICS) { const v = budgetOf(l, t, m); if (v !== undefined) (out[t] ??= {})[m] = v; }
  return out;
}

function isDefaultClassList(list: BudgetClass[]): boolean {
  return list.length === DEFAULT_CLASSES.length && list.every((c, i) => c.id === DEFAULT_CLASSES[i]!.id && c.name === DEFAULT_CLASSES[i]!.name && !hasLimits(c.limits));
}

function isDefaultEntry(e: EffectBudget): boolean {
  return !e.class && !e.on && !hasLimits(e.limits);
}

// ---------------------------------------------------------------- which budget counts

/** The level whose numbers count for an effect, with its numbers (and the class, when it is the class's). */
export function budgetThatCounts(b: Budgets, effectId: string): CountingBudget {
  const e = own(b.effects, effectId);
  if (e?.on) return { level: 'effect', limits: e.limits };
  if (b.classes.on && e?.class) {
    const c = b.classes.list.find((x) => x.id === e.class);
    if (c) return { level: 'class', class: { id: c.id, name: c.name }, limits: c.limits };
  }
  if (b.project.on) return { level: 'project', limits: b.project.limits };
  return { level: 'none', limits: {} };
}

// ---------------------------------------------------------------- edits

/** A level to switch on or off: the project's, the class level as a whole, or one effect's own. */
export type LevelRef = 'project' | 'classes' | { effect: string };
/** Where a number goes: the project's set, a class's, or an effect's own. */
export type LimitsRef = 'project' | { class: string } | { effect: string };

/** Switch a level on or off. */
export function setLevelOn(b: Budgets, level: LevelRef, on: boolean): Budgets {
  if (level === 'project') { const n = structuredClone(b); n.project.on = on; return n; }
  if (level === 'classes') { const n = structuredClone(b); n.classes.on = on; return n; }
  return editEffect(b, level.effect, (e) => { e.on = on; });
}

/** Set a number at a level, or clear it (undefined). A number must be 0 or more; anything else changes nothing. */
export function setLimit(b: Budgets, where: LimitsRef, tier: TierName, metric: CostMetric, value: number | undefined): Budgets {
  if (value !== undefined && !isLimit(value)) return b;
  if (!BUDGET_TIERS.includes(tier) || !COST_METRICS.includes(metric)) return b;
  const put = (l: Limits) => {
    if (value === undefined) {
      delete l[tier]?.[metric];
      if (l[tier] && !Object.keys(l[tier]!).length) delete l[tier];
    } else (l[tier] ??= {})[metric] = value;
  };
  if (where === 'project') { const n = structuredClone(b); put(n.project.limits); return n; }
  if ('class' in where) {
    const i = b.classes.list.findIndex((c) => c.id === where.class);
    if (i < 0) return b;
    const n = structuredClone(b);
    put(n.classes.list[i]!.limits);
    return n;
  }
  return editEffect(b, where.effect, (e) => put(e.limits));
}

/** Put an effect in a class (a class id), or in none (undefined). A class that is not in the list changes nothing. */
export function setEffectClass(b: Budgets, effectId: string, classId: string | undefined): Budgets {
  if (classId !== undefined && !b.classes.list.some((c) => c.id === classId)) return b;
  return editEffect(b, effectId, (e) => { if (classId === undefined) delete e.class; else e.class = classId; });
}

/** Why a class cannot have this name (empty, too long, a tab or line break, or taken), or undefined when it can. */
export function classNameProblem(b: Budgets, name: string, exceptId?: string): string | undefined {
  const n = name.trim();
  if (!n || n.length > CLASS_NAME_MAX || /[\u0000-\u001f\u007f]/.test(n)) return `A class name needs 1 to ${CLASS_NAME_MAX} letters, with no tabs or line breaks.`;
  const taken = b.classes.list.find((c) => c.id !== exceptId && c.name.toLowerCase() === n.toLowerCase());
  return taken ? `There is already a class named "${taken.name}".` : undefined;
}

/** Add a class at the end of the list, with no numbers. Its id is made from its name. */
export function addClass(b: Budgets, name: string): { budgets: Budgets; id: string } | { error: string } {
  const problem = classNameProblem(b, name);
  if (problem) return { error: problem };
  const base = name.trim().normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'class';
  let id = base;
  for (let k = 2; b.classes.list.some((c) => c.id === id); k++) id = `${base}-${k}`;
  const n = structuredClone(b);
  n.classes.list.push({ id, name: name.trim(), limits: {} });
  return { budgets: n, id };
}

/** Rename a class. Its id stays, so the effects in it stay in it. */
export function renameClass(b: Budgets, id: string, name: string): { budgets: Budgets } | { error: string } {
  const i = b.classes.list.findIndex((c) => c.id === id);
  if (i < 0) return { error: 'There is no such class.' };
  const problem = classNameProblem(b, name, id);
  if (problem) return { error: problem };
  const n = structuredClone(b);
  n.classes.list[i]!.name = name.trim();
  return { budgets: n };
}

/** Delete a class. The effects that were in it are in none. */
export function deleteClass(b: Budgets, id: string): Budgets {
  if (!b.classes.list.some((c) => c.id === id)) return b;
  const n = structuredClone(b);
  n.classes.list = n.classes.list.filter((c) => c.id !== id);
  for (const [effectId, e] of Object.entries(n.effects)) {
    if (e.class !== id) continue;
    delete e.class;
    if (isDefaultEntry(e)) delete n.effects[effectId];
  }
  return n;
}

/** Leave out the entries of effects that are not in the list (for saving: the effects a project still has). */
export function dropMissingEffects(b: Budgets, effectIds: Iterable<string>): Budgets {
  const keep = new Set(effectIds);
  const n = structuredClone(b);
  for (const id of Object.keys(n.effects)) if (!keep.has(id)) delete n.effects[id];
  return n;
}

/** Forget one effect's entry (for an effect id used again by a new effect). */
export function forgetEffect(b: Budgets, effectId: string): Budgets {
  if (!Object.hasOwn(b.effects, effectId)) return b;
  const n = structuredClone(b);
  delete n.effects[effectId];
  return n;
}

/** Change one effect's entry (made when missing), and drop it when nothing is left set. An id that is not an effect id changes nothing. */
function editEffect(b: Budgets, effectId: string, change: (e: EffectBudget) => void): Budgets {
  if (!EFFECT_ID.test(effectId)) return b;
  const n = structuredClone(b);
  const e: EffectBudget = own(n.effects, effectId) ?? { on: false, limits: {} };
  change(e);
  if (isDefaultEntry(e)) delete n.effects[effectId];
  else n.effects[effectId] = { ...(e.class ? { class: e.class } : {}), on: e.on, limits: e.limits };
  return n;
}
