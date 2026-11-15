/**
 * The cost card: an effect's cost per quality tier, next to budgets Mustafa types. No budget is decided yet, so the boxes
 * start empty and nothing is coloured until a number is typed.
 */
import { TIER_NAMES } from '@shamble/vfx-format';
import type { TierName } from '@shamble/vfx-format';
import { budgetOf, COST_METRICS, FRAMES_PER_SECOND, measuredOf } from '../cost/measure';
import type { CostMetric, CostReport, TierCost } from '../cost/measure';
import type { AppApi } from './api';
import { h, icon } from './dom';

const TIER_LABEL: Record<TierName, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const METRIC_LABEL: Record<CostMetric, string> = { draws: 'Draws', sprites: 'Sprites alive', triangles: 'Triangles', area: 'Screen area', ms: 'CPU ms a frame' };
const METRIC_TITLE: Record<CostMetric, string> = {
  draws: 'The most draw calls at any moment: one per blend group in use. Effects playing together share them (at most 4 in all).',
  sprites: 'The most items alive at any moment: each sprite, particle, dot, letter, flame tongue, smoke puff, line and shape counts once, however many outlines it has.',
  triangles: 'The most triangles at any moment.',
  area: 'The largest share of the 1920 × 1080 game screen the effect covers at any moment. See-through parts count: the GPU fills them too. Under it: the same with overlaps counted.',
  ms: 'CPU time to build one frame of the effect on this computer: the 95th percentile frame. Under it: the average and the worst. The GPU\'s share shows in triangles and screen area.',
};

const int = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (f: number) => `${(f * 100).toFixed(1)} %`;

function valueText(c: TierCost, m: CostMetric): { main: string; sub: string } {
  switch (m) {
    case 'draws': return { main: int(c.draws), sub: '' };
    case 'sprites': return { main: int(c.sprites), sub: '' };
    case 'triangles': return { main: int(c.triangles), sub: '' };
    case 'area': return { main: pct(c.area), sub: `${pct(c.areaWithOverlap)} with overlaps` };
    case 'ms': return { main: c.ms.p95.toFixed(2), sub: `avg ${c.ms.avg.toFixed(2)} · worst ${c.ms.worst.toFixed(2)}` };
  }
}

export function costCard(app: AppApi): { el: HTMLElement; refresh(): void } {
  const status = h('p', { class: 'hint cost-status' });
  const measureLabel = h('span', { text: 'Measure' });
  const measure = h('button', { class: 'tb', attrs: { type: 'button' }, title: 'Play the effect through at 60 frames a second in each tier, at the game camera, and count', on: { click: () => app.measureCost() } },
    icon('gauge'), measureLabel);
  const cells = new Map<string, { main: HTMLElement; sub: HTMLElement; cell: HTMLElement; box: HTMLInputElement }>();
  const rows = COST_METRICS.map((m) => h('tr', {},
    h('th', { attrs: { scope: 'row' }, title: METRIC_TITLE[m], text: METRIC_LABEL[m] }),
    ...TIER_NAMES.map((t) => {
      const main = h('div', { class: 'cv' }), sub = h('div', { class: 'cs' });
      const box = h('input', { class: 'budget', attrs: { type: 'number', min: '0', step: m === 'ms' ? '0.1' : m === 'area' ? '0.5' : '1', placeholder: 'budget',
        'aria-label': `Budget: ${METRIC_LABEL[m]}, ${TIER_LABEL[t]}` } });
      box.addEventListener('change', () => {
        const s = box.value.trim();
        const v = s === '' ? undefined : Number(s);
        if (v !== undefined && !(Number.isFinite(v) && v >= 0)) { box.value = String(budgetOf(app.budgets(), t, m) ?? ''); return; }
        app.setBudget(t, m, v);
      });
      const cell = h('td', {}, main, sub, box);
      cells.set(`${m}:${t}`, { main, sub, cell, box });
      return cell;
    })));
  const table = h('table', { class: 'cost' },
    h('thead', {}, h('tr', {}, h('th', {}), ...TIER_NAMES.map((t) => h('th', { attrs: { scope: 'col' }, text: TIER_LABEL[t] })))),
    h('tbody', {}, ...rows));
  const heavy = h('p', { class: 'hint' });
  const cond = h('p', { class: 'hint cost-cond' });
  const el = h('section', { class: 'card costcard' },
    h('div', { class: 'card-head' }, h('h2', { text: 'Cost' }), measure),
    status, table, heavy, cond,
    h('p', { class: 'hint', text: `Each number is the most at any moment of the effect (${FRAMES_PER_SECOND} frames a second, fixed seed); hover a row name for what it counts. Budgets: none is decided yet, so type your own; red is over, green within. ` +
      'They are shared by every effect in this project and saved in project.json (an assumption: say if budgets should be per effect).' }));

  const refresh = () => {
    const r: CostReport | undefined = app.costReport();
    const busy = app.costProgress();
    const stale = !!r && app.costStale();
    measure.disabled = !!busy || !app.effect();
    measureLabel.textContent = r ? 'Measure again' : 'Measure';
    status.textContent = busy ?? (!r ? 'Not measured yet. Measure plays the effect through in each tier; the preview waits meanwhile.'
      : stale ? 'The effect, its colours or the scene changed after measuring: these numbers are out of date. Measure again.'
        : `Measured over ${int(r.lengthMs)} ms (${int(r.frames)} frames).`);
    status.classList.toggle('bad', stale);
    table.classList.toggle('stale', stale || !r);
    const budgets = app.budgets();
    for (const m of COST_METRICS) {
      for (const t of TIER_NAMES) {
        const c = cells.get(`${m}:${t}`)!;
        const cost = r?.tiers[t];
        const v = cost ? valueText(cost, m) : { main: '–', sub: '' };
        c.main.textContent = v.main;
        c.sub.textContent = v.sub;
        const b = budgetOf(budgets, t, m);
        if (document.activeElement !== c.box) c.box.value = b === undefined ? '' : String(b);
        const over = cost && b !== undefined && !stale ? measuredOf(cost, m) > b : undefined;
        c.cell.classList.toggle('over', over === true);
        c.cell.classList.toggle('within', over === false);
        c.cell.title = over === undefined ? '' : over ? `Over the budget of ${b}` : `Within the budget of ${b}`;
      }
    }
    heavy.textContent = r && r.heaviest.length ? `Most triangles in High: ${r.heaviest.map((x) => `${x.name} ${Math.round(x.share * 100)} %`).join(', ')}.` : '';
    if (r) {
      const k = r.conditions;
      cond.textContent = `Measured at a fresh game camera on the 1920 × 1080 screen; scene "${k.sceneName}", target at ${k.target[0].toFixed(1)}, ${(-k.target[2]).toFixed(1)} m; ` +
        `seed ${k.seed}; fired by ${k.faction}; made by ${k.relation === 'self' ? 'you' : k.relation === 'team' ? 'your team' : 'an enemy'}; ${k.viewerDistanceM.toFixed(1)} m from you. ` +
        `Browser clock step ${r.clockStepMs < 0.01 ? '< 0.01' : r.clockStepMs.toFixed(2)} ms; each timed moment runs at least 20 ms.`;
    } else cond.textContent = '';
  };
  refresh();
  return { el, refresh };
}
