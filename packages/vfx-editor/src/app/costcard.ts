/**
 * The cost card: an effect's cost per quality tier, next to budgets Mustafa types. No budget is decided yet, so the boxes
 * start empty and nothing is coloured until a number is typed.
 *
 * Budgets come at three levels (the project's, a class's, the effect's own: see ../cost/budgets.ts). For now (until the
 * Budgets place of UI phase 6's Part B), the boxes show and edit the project's budgets, a number typed switches them on, the
 * colours compare with the level that counts for the effect, and one short line says which level that is (more in its
 * tooltip). The card's lines that carry its state are not hints: Show hints off keeps them (the class state-line).
 */
import { TIER_NAMES } from '@shamble/vfx-format';
import type { TierName } from '@shamble/vfx-format';
import { budgetOf, budgetThatCounts, COST_METRICS, hasLimits } from '../cost/budgets';
import type { Budgets, CostMetric, CountingBudget } from '../cost/budgets';
import { FRAMES_PER_SECOND, measuredOf } from '../cost/measure';
import type { CostReport, TierCost } from '../cost/measure';
import type { AppApi } from './api';
import { checkField, fold, h, icon, tip } from './dom';

const TIER_LABEL: Record<TierName, string> = { low: 'Low', medium: 'Medium', high: 'High' };
/** The rows' names. What each counts is its tooltip: the help text for the name (help.ts), as for every label. */
const METRIC_LABEL: Record<CostMetric, string> = { draws: 'Draws', sprites: 'Sprites alive', triangles: 'Triangles', area: 'Screen area', ms: 'CPU ms a frame' };

const int = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (f: number) => `${(f * 100).toFixed(1)} %`;

/** How much of a class's name the level line shows (64 characters are allowed); the whole name is in its tooltip. */
export const LEVEL_CLASS_SHOWN = 20;

/** A class name for the level line: cut to LEVEL_CLASS_SHOWN characters, with "…" when cut. */
function shownName(name: string): string {
  const chars = [...name];
  return chars.length > LEVEL_CLASS_SHOWN ? `${chars.slice(0, LEVEL_CLASS_SHOWN - 1).join('').trimEnd()}…` : name;
}

/**
 * The level line: whose budgets the colours compare with, in one short line (`text`), and the rest in its tooltip
 * (`title`): where those budgets are set, and what the boxes show.
 */
export function levelText(c: CountingBudget, b: Budgets): { text: string; title: string } {
  const elsewhere = 'They are set in project.json for now; the boxes show and edit the project\'s budgets.';
  switch (c.level) {
    case 'effect': return { text: 'This effect\'s own budgets count.', title: `This effect's own budgets are on, so they count for it. ${elsewhere}` };
    case 'class': {
      const name = c.class?.name ?? '';
      return { text: `The budgets of its class "${shownName(name)}" count.`, title: `The effect is in the class "${name}", and the class level is on, so the class's budgets count for it. ${elsewhere}` };
    }
    case 'project': return { text: 'The project\'s budgets count for this effect.', title: '' };
    case 'none': return {
      text: hasLimits(b.project.limits)
        ? 'No budgets are on. The project\'s numbers are kept but off: change one to switch them on.'
        : 'No budgets are on. Type a number to switch on the project\'s budgets.',
      title: '',
    };
  }
}

/** The cost card's state in a few words, for the status bar and the Cost section's header (docs/ui-redesign.md 6.6 and 6.8). */
export interface CostSummary {
  /** The status bar's words. */
  text: string;
  /** The same in the Cost section's header, where "Cost" is said already: "Not measured" for "Cost: not measured". */
  heading: string;
  /** none: muted; good: within budget; bad: over budget; warn: out of date. */
  state: 'none' | 'good' | 'bad' | 'warn';
  /** More, for its tooltip: which numbers are over, or what is being measured. */
  detail: string;
}

/**
 * What the card shows, said short: not measured, measuring, out of date, measured with no budget on, within budget, or how
 * many numbers are over budget. Over and within compare each measured number with the budget that counts, as the card's
 * cells do; out of date numbers are not compared. One function for the status bar and the section's header.
 */
export function costSummary(r: CostReport | undefined, o: { stale: boolean; busy: string | null; counting?: CountingBudget }): CostSummary {
  const s = summaryOf(r, o);
  return { ...s, heading: s.text === 'Cost: not measured' ? 'Not measured' : s.text };
}

function summaryOf(r: CostReport | undefined, o: { stale: boolean; busy: string | null; counting?: CountingBudget }): Omit<CostSummary, 'heading'> {
  if (o.busy) return { text: 'Measuring…', state: 'none', detail: o.busy };
  if (!r) return { text: 'Cost: not measured', state: 'none', detail: '' };
  if (o.stale) return { text: 'Out of date', state: 'warn', detail: 'The effect, its colours or the scene changed after measuring.' };
  const over: string[] = [];
  let budgets = 0;
  for (const m of COST_METRICS) {
    for (const t of TIER_NAMES) {
      const b = o.counting ? budgetOf(o.counting.limits, t, m) : undefined;
      if (b === undefined) continue;
      budgets++;
      if (measuredOf(r.tiers[t], m) > b) over.push(`${METRIC_LABEL[m]} in ${TIER_LABEL[t]}`);
    }
  }
  if (!budgets) return { text: 'Measured, no budgets', state: 'none', detail: 'No budgets are on, so nothing is over or within.' };
  return over.length ? { text: `${over.length} over budget`, state: 'bad', detail: `Over budget: ${over.join(', ')}.` } : { text: 'Within budget', state: 'good', detail: '' };
}

function valueText(c: TierCost, m: CostMetric): { main: string; sub: string } {
  switch (m) {
    case 'draws': return { main: int(c.draws), sub: '' };
    case 'sprites': return { main: int(c.sprites), sub: '' };
    case 'triangles': return { main: int(c.triangles), sub: '' };
    case 'area': return { main: pct(c.area), sub: `${pct(c.areaWithOverlap)} with overlaps` };
    case 'ms': return { main: c.ms.p95.toFixed(2), sub: `avg ${c.ms.avg.toFixed(2)} · worst ${c.ms.worst.toFixed(2)}` };
  }
}

/** The Budgets toggle under the cost table: remembered in this browser (the boxes show while it is on or a budget is set). */
export const BUDGETS_KEY = 'vfx-budgets';

function readBudgetsOn(): boolean {
  try { return localStorage.getItem(BUDGETS_KEY) === '1'; } catch { return false; }
}

/**
 * The Cost section (docs/ui-redesign.md 6.6): a fold, closed at first, at the end of the effect's settings. Its header says
 * the state in a few words (costSummary: the status bar's words) and has the Measure button, which shows open or closed:
 * it sits outside the fold's summary, over its right end, as a control inside a summary would fold the section. The body:
 * the measuring state (an info icon gives the conditions), the table, the layers with the most triangles, a short hint,
 * and the Budgets toggle that shows the budget boxes under the numbers, with the line that says whose budgets count.
 */
export function costCard(app: AppApi): { el: HTMLElement; refresh(): void } {
  // Lines that carry the card's state (not hints: Show hints off keeps them).
  const statusText = h('span');
  // The measuring conditions: the tooltip of an info icon after the state, once measured. Focusable, so the keyboard gets
  // the tooltip too (it then describes the icon for a screen reader).
  const info = h('span', { class: 'cost-info', attrs: { tabindex: '0', role: 'img', 'aria-label': 'How it was measured' } }, icon('info'));
  const status = h('p', { class: 'state-line cost-status' }, statusText, info);
  const heading = h('span', { class: 'cost-sum' });
  const measure = h('button', { class: 'tb cost-measure', attrs: { type: 'button', 'data-help-label': 'Measure' }, on: { click: () => app.measureCost() } },
    icon('gauge'), h('span', { text: 'Measure' }));
  const cells = new Map<string, { main: HTMLElement; sub: HTMLElement; cell: HTMLElement; box: HTMLInputElement }>();
  const rows = COST_METRICS.map((m) => h('tr', {},
    h('th', { attrs: { scope: 'row' }, text: METRIC_LABEL[m] }),
    ...TIER_NAMES.map((t) => {
      const main = h('div', { class: 'cv' }), sub = h('div', { class: 'cs' });
      const box = h('input', { class: 'budget', attrs: { type: 'number', min: '0', step: m === 'ms' ? '0.1' : m === 'area' ? '0.5' : '1', placeholder: 'budget',
        'aria-label': `Budget: ${METRIC_LABEL[m]}, ${TIER_LABEL[t]}` } });
      box.addEventListener('change', () => {
        const s = box.value.trim();
        const v = s === '' ? undefined : Number(s);
        if (v !== undefined && !(Number.isFinite(v) && v >= 0)) { box.value = String(budgetOf(app.budgets().project.limits, t, m) ?? ''); return; }
        app.setBudget(t, m, v);
      });
      const cell = h('td', {}, main, sub, box);
      cells.set(`${m}:${t}`, { main, sub, cell, box });
      return cell;
    })));
  const table = h('table', { class: 'cost' },
    h('thead', {}, h('tr', {}, h('th', {}), ...TIER_NAMES.map((t) => h('th', { attrs: { scope: 'col' }, text: TIER_LABEL[t] })))),
    h('tbody', {}, ...rows));
  const heavy = h('p', { class: 'state-line cost-heavy' });
  const level = h('p', { class: 'state-line cost-level' });
  // The Budgets toggle: the budget boxes under the numbers show while it is on, or while a budget is set (then it stays on).
  let budgetsOn = readBudgetsOn();
  const budgetsBox = checkField({ label: 'Budgets', value: budgetsOn, onChange: (v) => {
    budgetsOn = v;
    try { localStorage.setItem(BUDGETS_KEY, v ? '1' : '0'); } catch { /* storage may be blocked */ }
    refresh();
  } });
  budgetsBox.el.classList.add('cost-budgets');
  const body = [status, table, heavy,
    // One line; the full words are the tooltip of the section's title (help.ts, "Cost").
    h('p', { class: 'hint', text: `Most at any moment, ${FRAMES_PER_SECOND} frames a second. The budgets are the project's.` }),
    budgetsBox.el, level];
  const details = fold('Cost', body, false, [], { meta: heading, className: 'cost-fold' });
  const el = h('section', { class: 'card costcard' }, details, h('div', { class: 'cost-tools' }, measure));

  const refresh = () => {
    const r: CostReport | undefined = app.costReport();
    const busy = app.costProgress();
    const stale = !!r && app.costStale();
    measure.disabled = !!busy || !app.effect();
    statusText.textContent = busy ?? (!r ? 'Not measured yet. Measure plays the effect through in each tier; the preview waits meanwhile.'
      : stale ? 'The effect, its colours or the scene changed after measuring: these numbers are out of date. Measure again.'
        : `Measured over ${int(r.lengthMs)} ms (${int(r.frames)} frames).`);
    status.classList.toggle('stale', stale);
    table.classList.toggle('stale', stale);
    table.classList.toggle('unmeasured', !r);
    const budgets = app.budgets();
    const fx = app.effect();
    const counting = fx ? budgetThatCounts(budgets, fx.id) : undefined;
    // The header's words: the status bar's (one function), coloured by the state.
    const sum = costSummary(r, { stale, busy, counting });
    if (heading.textContent !== sum.heading) heading.textContent = sum.heading;
    heading.dataset.state = sum.state;
    tip(heading, sum.detail || null);
    // The boxes show while Budgets is on, or while one of the project's budgets is set: then the toggle stays on.
    const set = hasLimits(budgets.project.limits);
    const showBoxes = budgetsOn || set;
    budgetsBox.set(showBoxes);
    budgetsBox.box.disabled = set;
    tip(budgetsBox.el, set ? 'A budget is set, so the boxes stay. Clear the numbers to hide them.' : null);
    table.classList.toggle('with-budgets', showBoxes);
    const line = counting ? levelText(counting, budgets) : { text: '', title: '' };
    level.textContent = line.text;
    level.title = line.title;
    // With no budget on and no boxes, the line has nothing to say (it would ask for a number where no box shows).
    level.hidden = !showBoxes && counting?.level === 'none';
    for (const m of COST_METRICS) {
      for (const t of TIER_NAMES) {
        const c = cells.get(`${m}:${t}`)!;
        const cost = r?.tiers[t];
        const v = cost ? valueText(cost, m) : { main: '–', sub: '' };
        c.main.textContent = v.main;
        c.sub.textContent = v.sub;
        // The box shows the project's budget; the colour compares with the budget that counts.
        const shown = budgetOf(budgets.project.limits, t, m);
        if (document.activeElement !== c.box) c.box.value = shown === undefined ? '' : String(shown);
        const b = counting ? budgetOf(counting.limits, t, m) : undefined;
        const over = cost && b !== undefined && !stale ? measuredOf(cost, m) > b : undefined;
        c.cell.classList.toggle('over', over === true);
        c.cell.classList.toggle('within', over === false);
        c.cell.title = over === undefined ? '' : over ? `Over the budget of ${b}` : `Within the budget of ${b}`;
      }
    }
    heavy.textContent = r && r.heaviest.length ? `Most triangles in High: ${r.heaviest.map((x) => `${x.name} ${Math.round(x.share * 100)} %`).join(', ')}.` : '';
    heavy.hidden = !heavy.textContent;
    // The measuring conditions: in the info icon's tooltip, once measured.
    info.hidden = !r || !!busy;
    tip(info, r ? conditionsText(r) : null);
  };
  refresh();
  return { el, refresh };
}

/** How a report was measured, in a few sentences: the info icon's tooltip. */
export function conditionsText(r: CostReport): string {
  const k = r.conditions;
  return `Measured at a fresh game camera on the 1920 × 1080 screen; scene "${k.sceneName}", target at ${k.target[0].toFixed(1)}, ${(-k.target[2]).toFixed(1)} m; ` +
    `seed ${k.seed}; fired by ${k.faction}; made by ${k.relation === 'self' ? 'you' : k.relation === 'team' ? 'your team' : 'an enemy'}; ${k.viewerDistanceM.toFixed(1)} m from you. ` +
    `Browser clock step ${r.clockStepMs < 0.01 ? '< 0.01' : r.clockStepMs.toFixed(2)} ms; each timed moment runs at least 20 ms.`;
}
