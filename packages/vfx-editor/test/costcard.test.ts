/**
 * The cost card's level line (src/app/costcard.ts): which level of budgets counts, in one short hint line, with where they
 * are set and what the boxes show in its tooltip. The browser check measures the line as drawn.
 */
import { describe, expect, it } from 'vitest';
import { LEVEL_CLASS_SHOWN, costSummary, levelText } from '../src/app/costcard';
import { budgetThatCounts, readBudgets } from '../src/cost/budgets';
import type { CostReport, TierCost } from '../src/cost/measure';

/** Budgets as a project.json holds them. */
const budgets = (json: unknown) => readBudgets(json);
const LONG = 'Big explosions that fill most of the screen and last a long time';

describe('the level line', () => {
  it('names a long class cut short, and the whole name and the rest in its tooltip', () => {
    expect([...LONG]).toHaveLength(64);
    const b = budgets({ classes: { on: true, list: [{ id: 'big', name: LONG }] }, effects: { board_shell: { class: 'big' } } });
    const line = levelText(budgetThatCounts(b, 'board_shell'), b);
    expect(line.text).toBe('The budgets of its class "Big explosions that…" count.');
    expect([...line.text.split('"')[1]!]).toHaveLength(LEVEL_CLASS_SHOWN);
    expect(line.title).toContain(`"${LONG}"`);
    expect(line.title).toContain('project.json');
    // A short name is shown whole.
    const short = budgets({ classes: { on: true, list: [{ id: 'big', name: 'Big' }] }, effects: { board_shell: { class: 'big' } } });
    expect(levelText(budgetThatCounts(short, 'board_shell'), short).text).toBe('The budgets of its class "Big" count.');
  });

  it('says it short for every level; the longest line, with the longest class name, stays under 60 characters', () => {
    const own = budgets({ effects: { rifle_shot: { on: true, limits: { high: { draws: 1 } } } } });
    expect(levelText(budgetThatCounts(own, 'rifle_shot'), own)).toEqual({
      text: 'This effect\'s own budgets count.',
      title: 'This effect\'s own budgets are on, so they count for it. They are set in project.json for now; the boxes show and edit the project\'s budgets.',
    });
    const project = budgets({ project: { on: true, limits: { high: { draws: 1 } } } });
    expect(levelText(budgetThatCounts(project, 'rifle_shot'), project).text).toBe('The project\'s budgets count for this effect.');
    const none = budgets({});
    expect(levelText(budgetThatCounts(none, 'rifle_shot'), none).text).toBe('No budgets are on. Type a number to switch on the project\'s budgets.');
    const kept = budgets({ project: { limits: { high: { draws: 1 } } } });
    expect(levelText(budgetThatCounts(kept, 'rifle_shot'), kept).text).toBe('No budgets are on. The project\'s numbers are kept but off: change one to switch them on.');
    const longest = budgets({ classes: { on: true, list: [{ id: 'big', name: 'W'.repeat(64) }] }, effects: { board_shell: { class: 'big' } } });
    expect([...levelText(budgetThatCounts(longest, 'board_shell'), longest).text].length).toBeLessThan(60);
  });
});

/** A measured report with the same numbers in every tier, but the given draws in High. */
function report(highDraws: number): CostReport {
  const tier = (draws: number): TierCost => ({ draws, sprites: 10, triangles: 400, area: 0.05, areaWithOverlap: 0.07, ms: { avg: 0.1, p95: 0.2, worst: 0.3 } });
  return { tiers: { low: tier(1), medium: tier(1), high: tier(highDraws) } } as unknown as CostReport;
}

describe('the cost summary in the status bar and the Cost section\'s header', () => {
  it('says not measured, measuring and out of date, in that order of weight', () => {
    expect(costSummary(undefined, { stale: false, busy: null })).toMatchObject({ text: 'Cost: not measured', state: 'none' });
    expect(costSummary(report(2), { stale: true, busy: 'Measuring High…' })).toMatchObject({ text: 'Measuring…', state: 'none', detail: 'Measuring High…' });
    expect(costSummary(report(2), { stale: true, busy: null })).toMatchObject({ text: 'Out of date', state: 'warn' });
  });

  it('gives the header the same words, without "Cost:" where the header says it already', () => {
    expect(costSummary(undefined, { stale: false, busy: null }).heading).toBe('Not measured');
    expect(costSummary(report(2), { stale: true, busy: 'Measuring High…' }).heading).toBe('Measuring…');
    expect(costSummary(report(2), { stale: true, busy: null }).heading).toBe('Out of date');
    const tight = budgets({ project: { on: true, limits: { high: { draws: 1 } } } });
    const over = costSummary(report(2), { stale: false, busy: null, counting: budgetThatCounts(tight, 'rifle_shot') });
    expect(over.heading).toBe('1 over budget');
    expect(over.heading).toBe(over.text);
  });

  it('compares with the budgets that count, as the card\'s cells do: within, or how many numbers are over', () => {
    const none = budgets({});
    expect(costSummary(report(2), { stale: false, busy: null, counting: budgetThatCounts(none, 'rifle_shot') })).toMatchObject({ text: 'Measured, no budgets', state: 'none' });
    const loose = budgets({ project: { on: true, limits: { high: { draws: 4, triangles: 1000 } } } });
    expect(costSummary(report(2), { stale: false, busy: null, counting: budgetThatCounts(loose, 'rifle_shot') })).toMatchObject({ text: 'Within budget', state: 'good' });
    const tight = budgets({ project: { on: true, limits: { low: { triangles: 100 }, high: { draws: 1, triangles: 100 } } } });
    const s = costSummary(report(2), { stale: false, busy: null, counting: budgetThatCounts(tight, 'rifle_shot') });
    expect(s).toMatchObject({ text: '3 over budget', state: 'bad' });
    expect(s.detail).toBe('Over budget: Draws in High, Triangles in Low, Triangles in High.');
    // Numbers kept but switched off do not count.
    const off = budgets({ project: { limits: { high: { draws: 1 } } } });
    expect(costSummary(report(2), { stale: false, busy: null, counting: budgetThatCounts(off, 'rifle_shot') }).text).toBe('Measured, no budgets');
  });
});
