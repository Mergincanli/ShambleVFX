/**
 * The cost card's level line (src/app/costcard.ts): which level of budgets counts, in one short hint line, with where they
 * are set and what the boxes show in its tooltip. The browser check measures the line as drawn.
 */
import { describe, expect, it } from 'vitest';
import { LEVEL_CLASS_SHOWN, levelText } from '../src/app/costcard';
import { budgetThatCounts, readBudgets } from '../src/cost/budgets';

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
