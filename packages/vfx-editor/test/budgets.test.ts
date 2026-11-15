import { describe, expect, it } from 'vitest';
import { TIER_NAMES } from '@shamble/vfx-format';
import { idSchema } from '@shamble/vfx-format/validate';
import {
  BUDGET_TIERS, DEFAULT_CLASSES, EFFECT_ID, addClass, budgetOf, budgetThatCounts, budgetsFromVersion1, budgetsJson, defaultBudgets, deleteClass,
  dropMissingEffects, forgetEffect, isDefaultBudgets, readBudgets, renameClass, setEffectClass, setLevelOn, setLimit,
} from '../src/cost/budgets';
import type { Budgets } from '../src/cost/budgets';

/** Freeze a value all the way down: an edit that changed what it was given would throw. */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') { for (const x of Object.values(v)) deepFreeze(x); Object.freeze(v); }
  return v;
}

/** Unwrap an addClass or renameClass result that must have worked. */
function ok<T extends object>(r: T | { error: string }): T {
  if ('error' in r) throw new Error(`expected it to work: ${r.error}`);
  return r;
}

/** A project with something set at every level. */
function rich(): Budgets {
  let b = defaultBudgets();
  b = setLevelOn(b, 'project', true);
  b = setLimit(b, 'project', 'high', 'triangles', 5000);
  b = setLevelOn(b, 'classes', true);
  b = ok(renameClass(b, 'big', 'Huge')).budgets;
  b = setLimit(b, { class: 'big' }, 'high', 'triangles', 9000);
  b = ok(addClass(b, 'Tiny')).budgets;
  b = setEffectClass(b, 'board_shell', 'big');
  b = setEffectClass(b, 'board_beam', 'small');
  b = setLevelOn(b, { effect: 'board_muzzle' }, true);
  b = setLimit(b, { effect: 'board_muzzle' }, 'low', 'draws', 2);
  b = setLimit(b, { effect: 'rifle_shot' }, 'medium', 'ms', 0.5); // its own numbers, but off
  return b;
}

describe('the budgets model', () => {
  it('repeats the tiers and the effect id rule of the format exactly', () => {
    expect(BUDGET_TIERS).toEqual(TIER_NAMES);
    for (const id of ['a', 'board_shell', 'x9', 'a'.repeat(48), 'a'.repeat(49), '_x', '9a', 'Aa', 'a-b', 'a.b', '', '__proto__', 'constructor']) {
      expect(EFFECT_ID.test(id), id).toBe(idSchema.safeParse(id).success);
    }
  });

  it('starts with every level off and three classes, Small, Normal and Big, with no numbers', () => {
    const b = defaultBudgets();
    expect(b).toEqual({
      project: { on: false, limits: {} },
      classes: { on: false, list: [{ id: 'small', name: 'Small', limits: {} }, { id: 'normal', name: 'Normal', limits: {} }, { id: 'big', name: 'Big', limits: {} }] },
      effects: {},
    });
    expect(DEFAULT_CLASSES.map((c) => c.name)).toEqual(['Small', 'Normal', 'Big']);
    for (const raw of [undefined, null, {}, 'budgets', [1, 2]]) expect(readBudgets(raw), JSON.stringify(raw)).toEqual(b);
    expect(budgetsJson(b)).toEqual({});
    expect(isDefaultBudgets(b)).toBe(true);
    expect(budgetThatCounts(b, 'board_shell')).toEqual({ level: 'none', limits: {} });
    // Each call gives its own object: changing one never changes the defaults.
    b.classes.list[0]!.name = 'Changed';
    expect(defaultBudgets().classes.list[0]!.name).toBe('Small');
  });

  it('reads version 1 budgets (one set for the whole project) as the project level, switched off, numbers kept', () => {
    const b = budgetsFromVersion1({ high: { triangles: 5000 }, low: { draws: 2, ms: 'fast' } });
    expect(b).toEqual({ ...defaultBudgets(), project: { on: false, limits: { low: { draws: 2 }, high: { triangles: 5000 } } } });
    expect(budgetThatCounts(b, 'board_shell').level).toBe('none');
    expect(budgetsJson(b)).toEqual({ project: { limits: { low: { draws: 2 }, high: { triangles: 5000 } } } });
  });
});

describe('which budget counts', () => {
  it('is the closest level that is on, as a whole set: the effect\'s own, else its class, else the project\'s', () => {
    const b = rich();
    // The class level is on, and board_shell is in Huge (id big).
    expect(budgetThatCounts(b, 'board_shell')).toEqual({ level: 'class', class: { id: 'big', name: 'Huge' }, limits: { high: { triangles: 9000 } } });
    // A class with no numbers counts as a whole: no limits at all (not the project's 5000).
    const small = budgetThatCounts(b, 'board_beam');
    expect(small).toEqual({ level: 'class', class: { id: 'small', name: 'Small' }, limits: {} });
    expect(budgetOf(small.limits, 'high', 'triangles')).toBeUndefined();
    // board_muzzle's own set is on: only its own numbers count.
    const own = budgetThatCounts(b, 'board_muzzle');
    expect(own).toEqual({ level: 'effect', limits: { low: { draws: 2 } } });
    expect(budgetOf(own.limits, 'high', 'triangles')).toBeUndefined();
    // rifle_shot has its own numbers but they are off, and it has no class: the project's count.
    expect(budgetThatCounts(b, 'rifle_shot')).toEqual({ level: 'project', limits: { high: { triangles: 5000 } } });
    // An effect with no entry at all, and one whose name is also an object's own word.
    expect(budgetThatCounts(b, 'shell_flight').level).toBe('project');
    expect(budgetThatCounts(b, 'constructor').level).toBe('project');
  });

  it('skips the class level when it is off, and every level that is off', () => {
    let b = setLevelOn(rich(), 'classes', false);
    expect(budgetThatCounts(b, 'board_shell').level).toBe('project');
    expect(budgetThatCounts(b, 'board_muzzle').level).toBe('effect');
    b = setLevelOn(b, 'project', false);
    expect(budgetThatCounts(b, 'board_shell')).toEqual({ level: 'none', limits: {} });
    // An effect's own set that is on but empty: it counts, and limits nothing.
    b = setLevelOn(b, { effect: 'shell_flight' }, true);
    expect(budgetThatCounts(b, 'shell_flight')).toEqual({ level: 'effect', limits: {} });
  });
});

describe('editing the budgets', () => {
  it('switches each level on and off, and never changes what it was given', () => {
    const b = deepFreeze(defaultBudgets());
    expect(setLevelOn(b, 'project', true).project.on).toBe(true);
    expect(setLevelOn(b, 'classes', true).classes.on).toBe(true);
    const on = setLevelOn(b, { effect: 'board_shell' }, true);
    expect(on.effects).toEqual({ board_shell: { on: true, limits: {} } });
    // Switched off again with nothing else set, the entry goes.
    expect(setLevelOn(on, { effect: 'board_shell' }, false).effects).toEqual({});
    // Not an effect id: nothing changes.
    expect(setLevelOn(b, { effect: 'Not An Id' }, true)).toBe(b);
    expect(b).toEqual(defaultBudgets());
  });

  it('sets and clears numbers at each level', () => {
    const b = deepFreeze(defaultBudgets());
    const p = setLimit(b, 'project', 'high', 'triangles', 5000);
    expect(p.project).toEqual({ on: false, limits: { high: { triangles: 5000 } } });
    expect(setLimit(p, 'project', 'high', 'triangles', undefined).project.limits).toEqual({});
    const c = setLimit(b, { class: 'big' }, 'low', 'ms', 0.5);
    expect(c.classes.list.find((x) => x.id === 'big')!.limits).toEqual({ low: { ms: 0.5 } });
    expect(setLimit(b, { class: 'nope' }, 'low', 'ms', 0.5)).toBe(b);
    const e = setLimit(b, { effect: 'board_shell' }, 'medium', 'area', 2.5);
    expect(e.effects).toEqual({ board_shell: { on: false, limits: { medium: { area: 2.5 } } } });
    // Cleared, the entry has nothing left and goes.
    expect(setLimit(e, { effect: 'board_shell' }, 'medium', 'area', undefined).effects).toEqual({});
    // 0 is a budget (nothing allowed), not an empty box.
    expect(budgetOf(setLimit(b, 'project', 'low', 'sprites', 0).project.limits, 'low', 'sprites')).toBe(0);
    // Numbers below 0, not numbers, and unknown tiers or rows change nothing.
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(setLimit(b, 'project', 'high', 'draws', bad)).toBe(b);
    expect(setLimit(b, 'project', 'ultra' as never, 'draws', 1)).toBe(b);
    expect(setLimit(b, 'project', 'high', 'fps' as never, 1)).toBe(b);
  });

  it('puts an effect in a class, or in none', () => {
    const b = deepFreeze(defaultBudgets());
    const inBig = setEffectClass(b, 'board_shell', 'big');
    expect(inBig.effects).toEqual({ board_shell: { class: 'big', on: false, limits: {} } });
    expect(setEffectClass(inBig, 'board_shell', undefined).effects).toEqual({});
    expect(setEffectClass(b, 'board_shell', 'nope')).toBe(b);
  });

  it('adds a class with an id made from its name, and refuses a name that is empty, too long or taken', () => {
    const b = deepFreeze(defaultBudgets());
    const huge = ok(addClass(b, 'Huge'));
    expect(huge.id).toBe('huge');
    expect(huge.budgets.classes.list.at(-1)).toEqual({ id: 'huge', name: 'Huge', limits: {} });
    expect(ok(addClass(b, '  Very big  ')).budgets.classes.list.at(-1)).toEqual({ id: 'very-big', name: 'Very big', limits: {} });
    expect(ok(addClass(b, 'Ärger')).id).toBe('arger');
    const sym = ok(addClass(b, '!!!'));
    expect(sym.id).toBe('class');
    expect(ok(addClass(sym.budgets, '???')).id).toBe('class-2');
    // A new name whose id is taken gets a number.
    expect(ok(addClass(b, 'Big!')).id).toBe('big-2');
    expect(ok(addClass(b, 'x'.repeat(64))).budgets.classes.list.at(-1)!.name).toBe('x'.repeat(64));
    expect(addClass(b, 'big')).toEqual({ error: 'There is already a class named "Big".' });
    for (const bad of ['', '   ', 'x'.repeat(65), 'Two\tparts', 'Two\nlines']) {
      expect(addClass(b, bad), JSON.stringify(bad)).toEqual({ error: 'A class name needs 1 to 64 letters, with no tabs or line breaks.' });
    }
  });

  it('renames a class and keeps its id, so its effects stay in it', () => {
    const b = deepFreeze(setEffectClass(setLevelOn(defaultBudgets(), 'classes', true), 'board_shell', 'big'));
    const r = ok(renameClass(b, 'big', 'Large')).budgets;
    expect(r.classes.list.map((c) => [c.id, c.name])).toEqual([['small', 'Small'], ['normal', 'Normal'], ['big', 'Large']]);
    expect(budgetThatCounts(r, 'board_shell').class).toEqual({ id: 'big', name: 'Large' });
    expect(renameClass(b, 'big', 'small')).toEqual({ error: 'There is already a class named "Small".' });
    expect(ok(renameClass(b, 'big', 'BIG')).budgets.classes.list[2]!.name).toBe('BIG');
    expect(renameClass(b, 'nope', 'X')).toEqual({ error: 'There is no such class.' });
    expect(renameClass(b, 'big', '')).toEqual({ error: 'A class name needs 1 to 64 letters, with no tabs or line breaks.' });
  });

  it('deletes a class: the effects that were in it are in none', () => {
    let b = setEffectClass(defaultBudgets(), 'board_shell', 'big');
    b = setEffectClass(b, 'board_muzzle', 'big');
    b = deepFreeze(setLevelOn(b, { effect: 'board_muzzle' }, true));
    const d = deleteClass(b, 'big');
    expect(d.classes.list.map((c) => c.id)).toEqual(['small', 'normal']);
    // board_shell had nothing else set: its entry goes. board_muzzle keeps its own switch.
    expect(d.effects).toEqual({ board_muzzle: { on: true, limits: {} } });
    expect(deleteClass(b, 'nope')).toBe(b);
  });

  it('drops the entries of effects that no longer exist (for saving), and forgets one effect\'s entry', () => {
    const b = deepFreeze(rich());
    const kept = dropMissingEffects(b, ['board_muzzle', 'board_shell', 'shell_flight']);
    expect(Object.keys(kept.effects)).toEqual(['board_shell', 'board_muzzle']);
    expect(Object.keys(b.effects)).toEqual(['board_shell', 'board_beam', 'board_muzzle', 'rifle_shot']);
    expect(Object.keys(forgetEffect(b, 'board_beam').effects)).toEqual(['board_shell', 'board_muzzle', 'rifle_shot']);
    expect(forgetEffect(b, 'shell_flight')).toBe(b);
  });
});

describe('budgets in a file', () => {
  it('hold only what differs from the defaults, in a fixed order, and read back the same', () => {
    const b = rich();
    const json = budgetsJson(b);
    // The exact text, so the order of the keys is checked too.
    expect(JSON.stringify(json)).toBe(JSON.stringify({
      project: { on: true, limits: { high: { triangles: 5000 } } },
      classes: { on: true, list: [{ id: 'small', name: 'Small' }, { id: 'normal', name: 'Normal' }, { id: 'big', name: 'Huge', limits: { high: { triangles: 9000 } } }, { id: 'tiny', name: 'Tiny' }] },
      effects: {
        board_shell: { class: 'big' },
        board_beam: { class: 'small' },
        board_muzzle: { on: true, limits: { low: { draws: 2 } } },
        rifle_shot: { limits: { medium: { ms: 0.5 } } },
      },
    }));
    expect(readBudgets(json)).toEqual(b);
    const text = JSON.stringify(json);
    expect(JSON.stringify(budgetsJson(readBudgets(JSON.parse(text))))).toBe(text);
  });

  it('writes an empty list when every class is deleted, so the three starting ones do not come back', () => {
    let b = defaultBudgets();
    for (const id of ['small', 'normal', 'big']) b = deleteClass(b, id);
    expect(budgetsJson(b)).toEqual({ classes: { list: [] } });
    expect(readBudgets(budgetsJson(b)).classes.list).toEqual([]);
    // The starting list, renamed back to itself, is the default again.
    const same = ok(renameClass(ok(renameClass(defaultBudgets(), 'big', 'Large')).budgets, 'big', 'Big')).budgets;
    expect(budgetsJson(same)).toEqual({});
  });

  it('are read leniently: bad numbers, broken classes, unknown ids and classes not in the list are left out', () => {
    const raw = JSON.parse(`{
      "project": { "on": "yes", "limits": { "high": { "triangles": -5, "draws": 2 }, "ultra": { "draws": 1 } } },
      "classes": { "on": true, "list": [
        { "id": "big", "name": " Big " }, { "id": "big", "name": "Twice" }, { "id": "Bad Id", "name": "X" }, "nope", { "id": "tiny" } ] },
      "effects": {
        "board_shell": { "class": "gone", "on": true },
        "rifle_shot": { "class": "big", "limits": { "low": { "ms": 1 } } },
        "__proto__": { "on": true },
        "Bad": { "on": true },
        "empty": {},
        "not_an_object": 5
      }
    }`);
    expect(readBudgets(raw)).toEqual({
      project: { on: false, limits: { high: { draws: 2 } } },
      classes: { on: true, list: [{ id: 'big', name: 'Big', limits: {} }, { id: 'tiny', name: 'tiny', limits: {} }] },
      effects: { board_shell: { on: true, limits: {} }, rifle_shot: { class: 'big', on: false, limits: { low: { ms: 1 } } } },
    });
    expect(Object.getPrototypeOf(readBudgets(raw).effects)).toBe(Object.prototype);
  });
});
