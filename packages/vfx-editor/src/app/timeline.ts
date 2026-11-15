/**
 * The timeline under the preview: one bar per layer from its start to its end, with the 1/12 s steps marked,
 * and a playhead you drag to scrub. Times follow the current origin and target (flight time depends on them).
 */
import type { AppApi } from './api';
import { h, icon } from './dom';

const PHASE_TEXT = { windup: 'wind-up', peak: 'peak', fade: 'fade' } as const;

export interface TimelineView {
  el: HTMLElement;
  refresh(): void;
  setPlayhead(ms: number): void;
}

export function buildTimeline(app: AppApi, onScrub: (ms: number, done: boolean) => void): TimelineView {
  const ruler = h('div', { class: 'tl-ruler' });
  const phases = h('div', { class: 'tl-phases' });
  const rows = h('div', { class: 'tl-rows' });
  const head = h('div', { class: 'tl-head' });
  const track = h('div', { class: 'tl-track' }, ruler, phases, rows, head);
  const el = h('div', { class: 'timeline', attrs: { 'aria-label': 'Timeline' } }, track);
  let span = 1000;

  const msAt = (clientX: number) => {
    const r = ruler.getBoundingClientRect();
    return Math.max(0, Math.min(span, ((clientX - r.left) / r.width) * span));
  };
  let dragging = false;
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.tl-name')) return;
    dragging = true;
    track.setPointerCapture(e.pointerId);
    onScrub(msAt(e.clientX), false);
  };
  track.addEventListener('pointerdown', down);
  track.addEventListener('pointermove', (e) => { if (dragging) onScrub(msAt(e.clientX), false); });
  const up = () => { if (dragging) { dragging = false; onScrub(-1, true); } };
  track.addEventListener('pointerup', up);
  track.addEventListener('pointercancel', up);

  const refresh = () => {
    const fx = app.effect();
    const tl = app.timeline();
    rows.replaceChildren();
    ruler.replaceChildren();
    phases.replaceChildren();
    if (!fx || !tl) return;
    span = Math.max(400, Math.ceil((tl.lengthMs * 1.08) / 100) * 100);
    // Ruler: a label every 100 ms (every 200 when long), a small mark every 1/12 s step.
    const every = span > 2400 ? 500 : span > 1200 ? 200 : 100;
    for (let t = 0; t <= span; t += every) {
      ruler.append(h('div', { class: 'tl-tick', style: `left:${(t / span) * 100}%` }, h('span', { text: `${t}` })));
    }
    for (let n = 0, t = 0; t <= span; n++, t = (n * 1000) / 12) {
      ruler.append(h('div', { class: 'tl-step', style: `left:${(t / span) * 100}%` }));
    }
    ruler.append(h('div', { class: 'tl-unit', text: 'ms' }));
    // The phases: wind-up, peak, fade, as one strip under the ruler.
    const total = tl.phases.fade.endMs;
    phases.style.display = total > 0 ? '' : 'none';
    for (const p of [tl.phases.windup, tl.phases.peak, tl.phases.fade]) {
      const len = p.endMs - p.startMs;
      if (len <= 0) continue;
      phases.append(h('div', { class: `tl-phase ${p.name}`, style: `left:${(p.startMs / span) * 100}%;width:${(len / span) * 100}%`,
        title: `${PHASE_TEXT[p.name]}: ${p.startMs.toFixed(0)}–${p.endMs.toFixed(0)} ms` }, h('span', { text: PHASE_TEXT[p.name] })));
    }
    const sel = app.layer()?.id;
    // Top of the drawing order first, as in the layers list.
    [...fx.layers].reverse().forEach((l) => {
      const s = tl.byId.get(l.id);
      if (!s) return;
      const left = (s.startMs / span) * 100, width = Math.max(0.4, ((s.endMs - s.startMs) / span) * 100);
      const label = l.type === 'projectile' ? `${(s.endMs - s.startMs).toFixed(0)} ms in the air` : `${(s.endMs - s.startMs).toFixed(0)} ms`;
      const bar = h('div', { class: `tl-bar ${l.type}`, style: `left:${left}%;width:${width}%`, title: `${l.name}: ${s.startMs.toFixed(0)}–${s.endMs.toFixed(0)} ms` }, h('span', { text: label }));
      if (l.timing.mode === 'steps') {
        bar.classList.add('steps');
        // Step marks inside the bar: the layer counts its steps from its own start.
        bar.style.setProperty('--step', `${(1000 / l.timing.perSecond / Math.max(1, s.endMs - s.startMs)) * 100}%`);
        bar.title += ` · ${l.timing.perSecond} steps a second`;
      } else bar.title += ' · smooth';
      const name = h('button', { class: 'tl-name', attrs: { type: 'button', 'aria-pressed': String(l.id === sel) }, on: { click: () => app.selectLayer(l.id) } },
        icon(l.type), h('span', { text: l.name }));
      // A layer the preview's tier leaves out is shown faded.
      const off = l.type !== 'projectile' && !l.tiers.includes(app.previewTier());
      if (off) bar.title += ` · not drawn in the ${app.previewTier()} tier`;
      rows.append(h('div', { class: `tl-row${l.id === sel ? ' sel' : ''}${off ? ' off' : ''}` }, name, h('div', { class: 'tl-lane' }, bar)));
    });
  };

  const setPlayhead = (ms: number) => {
    head.style.left = `calc(var(--tl-name) + (100% - var(--tl-name)) * ${Math.max(0, Math.min(1, ms / span))})`;
    head.style.display = ms < 0 ? 'none' : '';
  };
  refresh();
  return { el, refresh, setPlayhead };
}
