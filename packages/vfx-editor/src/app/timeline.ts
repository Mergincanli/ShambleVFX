/**
 * The timeline under the preview (docs/ui-redesign.md 6.5). On the left the names column: each layer's icon and name, in
 * the Layers list's order, with its selection and its hover. On the right the ruler (a label every 100, 200 or 500 ms, a
 * mark every 1/12 s step), the phase strip, and one lane per layer with its bar from its start to its end (the layer's own
 * steps marked inside). The ruler and the phase strip stay at the top while the rows scroll. Times follow the current
 * origin and target (flight time depends on them); the span fits the effect.
 *
 * A bar's label ("250 ms", "9 ms in the air") sits inside the bar when it fits; else just right of it, or left of it when
 * the lane ends first: never cut. A phase's name shows inside it when it fits (its times are in its tooltip). Whether a
 * label fits is measured on every refresh, and again when the timeline changes size (the splitters, the window) and when
 * the fonts come in: bars are as wide as a share of the lane.
 *
 * The playhead: a 2 px line through the ruler, the phase strip and the lanes, in two parts (one in the header that stays at
 * the top, one over the rows), with its head on the ruler. Every label is drawn over the line, with a 1 px edge in the
 * colour behind it (style.css), so the line stops short of its letters and neither hides the other. While firing it is
 * hidden.
 *
 * The mouse: a press on the ruler, the phase strip or an empty part of a lane scrubs (the time follows the pointer until the
 * button is let go). A click on a name or on a bar (its label too) selects that layer and leaves the time as it is; a press
 * on a bar that moves 4 px or more scrubs instead. The head drags the time from where it is. The row under the mouse is
 * highlighted in the Layers list too.
 *
 * The browser check reads: .timeline, .tl-top with .tl-ruler (.tl-tick and its label), .tl-phases and .tl-phase
 * (data-fit), .tl-head with its .tl-knob; .tl-rows with .tl-row[data-layer] (.tl-name: its icon, and a span with the name;
 * .tl-lane; .tl-bar with data-fit and its .tl-label) and .tl-line.
 */
import type { AppApi } from './api';
import { h } from './dom';
import { layerGlyph } from './layer-icons';
import { TIER_LABEL, layerRowTip } from './layers-list';

const PHASE_TEXT = { windup: 'wind-up', peak: 'peak', fade: 'fade' } as const;
/** A press on a bar that moves less than this is a click, which selects its layer; more, and it scrubs (the Layers list's rows start a drag at the same distance). */
const DRAG_PX = 4;

export interface TimelineView {
  el: HTMLElement;
  refresh(): void;
  setPlayhead(ms: number): void;
}

export function buildTimeline(app: AppApi, onScrub: (ms: number, done: boolean) => void): TimelineView {
  const ruler = h('div', { class: 'tl-ruler' });
  const phases = h('div', { class: 'tl-phases' });
  // The playhead: in the header its head (for the mouse: the keyboard has ← and → and the time readout) and its line
  // through the ruler and the phases; over the rows its line through the lanes.
  const knob = h('div', { class: 'tl-knob', attrs: { 'aria-hidden': 'true' } });
  const head = h('div', { class: 'tl-head' }, knob);
  const line = h('div', { class: 'tl-line' });
  const top = h('div', { class: 'tl-top' }, ruler, phases, head);
  const rows = h('div', { class: 'tl-rows' });
  const track = h('div', { class: 'tl-track' }, top, rows);
  const el = h('div', { class: 'timeline', attrs: { 'aria-label': 'Timeline' } }, track);
  let span = 1000;
  /** The moment the playhead shows; below 0 while firing (it is hidden then). */
  let shownMs = -1;

  // ------------------------------------------------ the mouse: scrub, select, drag the head
  const clamp = (ms: number) => Math.max(0, Math.min(span, ms));
  /** The time under the pointer: the ruler is exactly as wide as the lanes. */
  const msAt = (clientX: number) => {
    const r = ruler.getBoundingClientRect();
    return clamp(((clientX - r.left) / r.width) * span);
  };
  /**
   * The press under way: where it started; the layer whose bar it started on (let go without moving, and it selects it);
   * for a drag on the head, the time the head showed; and whether it scrubs yet.
   */
  let press: { pointer: number; x: number; y: number; layer: string | null; fromMs: number | null; scrubbing: boolean } | null = null;
  const scrubTo = (ms: number) => {
    if (!press) return;
    if (!press.scrubbing) {
      press.scrubbing = true;
      // A scrub is not a hover: the layer whose lane it starts on does not take the preview's focus while you drag.
      app.hoverLayer(null);
    }
    onScrub(ms, false);
  };
  track.addEventListener('pointerdown', (e) => {
    const t = e.target as Element;
    if (press || t.closest('.tl-name')) return;
    const bar = e.button === 0 ? t.closest<HTMLElement>('.tl-bar') : null;
    const onHead = e.button === 0 && !!t.closest('.tl-knob');
    press = { pointer: e.pointerId, x: e.clientX, y: e.clientY, layer: bar?.closest<HTMLElement>('.tl-row')?.dataset.layer ?? null, fromMs: null, scrubbing: false };
    track.setPointerCapture(e.pointerId);
    if (onHead) {
      // The head drags the time from where it is, wherever on it the press was. Read from its place on the page, so it is
      // right after a step or a change of span.
      const k = knob.getBoundingClientRect();
      press.fromMs = msAt(k.left + k.width / 2);
      scrubTo(press.fromMs);
    } else if (!bar) scrubTo(msAt(e.clientX));
    // On a bar: wait. Let go without moving, and it selects the layer; move, and it scrubs.
  });
  track.addEventListener('pointermove', (e) => {
    const p = press;
    if (!p || e.pointerId !== p.pointer) return;
    if (p.fromMs !== null) {
      const r = ruler.getBoundingClientRect();
      scrubTo(clamp(p.fromMs + ((e.clientX - p.x) / r.width) * span));
      return;
    }
    if (!p.scrubbing && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
    scrubTo(msAt(e.clientX));
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || e.pointerId !== p.pointer) return;
    press = null;
    if (p.scrubbing) onScrub(-1, true);
    else if (!cancelled && p.layer && app.effect()?.layers.some((l) => l.id === p.layer)) app.selectLayer(p.layer);
  };
  track.addEventListener('pointerup', (e) => end(e, false));
  track.addEventListener('pointercancel', (e) => end(e, true));
  // The row under the mouse: the preview fades the other layers while it is there (rows are made again on every refresh,
  // so this listens on what holds them).
  rows.addEventListener('pointermove', (e) => { if (!press) app.hoverLayer(((e.target as Element).closest?.('.tl-row') as HTMLElement | null)?.dataset.layer ?? null); });
  rows.addEventListener('pointerleave', () => app.hoverLayer(null));

  // ------------------------------------------------ labels: inside when they fit, else beside, never cut
  /** The label sizes in style.css (--tl-label-pad, --tl-label-gap), read once the page has its styles. */
  let sizes: { pad: number; gap: number } | null = null;
  const fit = () => {
    const lane = rows.querySelector<HTMLElement>('.tl-lane');
    const L = lane?.getBoundingClientRect();
    // Not shown (?frame=1 hides the timeline): nothing to measure.
    if (!L || L.width <= 0) return;
    if (!sizes) {
      const s = getComputedStyle(el);
      sizes = { pad: parseFloat(s.getPropertyValue('--tl-label-pad')) || 4, gap: parseFloat(s.getPropertyValue('--tl-label-gap')) || 6 };
    }
    const { pad, gap } = sizes;
    // Everything is read first, then written: one layout.
    const bars = [...rows.querySelectorAll<HTMLElement>('.tl-bar')].map((bar) => {
      const b = bar.getBoundingClientRect();
      return { bar, left: b.left - L.left, right: b.right - L.left, width: b.width, label: bar.querySelector<HTMLElement>('.tl-label')!.getBoundingClientRect().width };
    });
    const names = [...phases.querySelectorAll<HTMLElement>('.tl-phase')].map((p) => {
      const cs = getComputedStyle(p);
      return { p, room: p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), label: p.querySelector('span')!.getBoundingClientRect().width };
    });
    for (const b of bars) {
      // Inside: the label and its padding on both sides, within the bar's 1 px border. Beside: the gap from the bar's edge,
      // and the lane's own edge (the label's padding) kept free. (With the editor's narrowest centre, 640 px, one side
      // always has room: a bar too short for its label leaves the rest of the lane free.)
      const right = b.right + gap + b.label <= L.width - pad, left = b.left - gap - b.label >= pad;
      const where = b.label + 2 * (pad + 1) <= b.width ? 'inside' : right ? 'right' : left ? 'left' : L.width - b.right >= b.left ? 'right' : 'left';
      if (b.bar.dataset.fit !== where) b.bar.dataset.fit = where;
    }
    for (const n of names) {
      const v = n.label <= n.room ? 'yes' : 'no';
      if (n.p.dataset.fit !== v) n.p.dataset.fit = v;
    }
  };
  // The lanes' width changes with the splitters and the window, and a label's with the fonts.
  let width = -1;
  new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } }).observe(el);
  void document.fonts?.ready.then(fit);
  document.fonts?.addEventListener?.('loadingdone', fit);

  // ------------------------------------------------ the playhead
  let placed = '';
  const place = () => {
    const hide = shownMs < 0;
    if (head.hidden !== hide) { head.hidden = hide; line.hidden = hide; }
    if (hide) return;
    const left = `calc(var(--tl-name) + (100% - var(--tl-name)) * ${Math.max(0, Math.min(1, shownMs / span))})`;
    if (left === placed) return;
    placed = left;
    head.style.left = left;
    line.style.left = left;
  };
  const setPlayhead = (ms: number) => {
    shownMs = ms;
    place();
  };

  // ------------------------------------------------ building it again
  const refresh = () => {
    const fx = app.effect();
    const tl = app.timeline();
    ruler.replaceChildren();
    phases.replaceChildren();
    if (!fx || !tl) {
      rows.replaceChildren(line);
      phases.hidden = true;
      return;
    }
    span = Math.max(400, Math.ceil((tl.lengthMs * 1.08) / 100) * 100);
    // Ruler: a label every 100 ms (every 200 or 500 when long), a small mark every 1/12 s step.
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
    phases.hidden = !(total > 0);
    for (const p of [tl.phases.windup, tl.phases.peak, tl.phases.fade]) {
      const len = p.endMs - p.startMs;
      if (len <= 0) continue;
      phases.append(h('div', { class: `tl-phase ${p.name}`, style: `left:${(p.startMs / span) * 100}%;width:${(len / span) * 100}%`,
        title: `${PHASE_TEXT[p.name]}: ${p.startMs.toFixed(0)}–${p.endMs.toFixed(0)} ms` }, h('span', { text: PHASE_TEXT[p.name] })));
    }
    const sel = app.layer()?.id;
    const tier = app.previewTier();
    // Top of the drawing order first, as in the layers list.
    const list = [...fx.layers].reverse().flatMap((l) => {
      const s = tl.byId.get(l.id);
      if (!s) return [];
      const left = (s.startMs / span) * 100, width = Math.max(0.4, ((s.endMs - s.startMs) / span) * 100);
      const label = l.type === 'projectile' ? `${(s.endMs - s.startMs).toFixed(0)} ms in the air` : `${(s.endMs - s.startMs).toFixed(0)} ms`;
      const bar = h('div', { class: `tl-bar ${l.type}`, style: `left:${left}%;width:${width}%`, title: `${l.name}: ${s.startMs.toFixed(0)}–${s.endMs.toFixed(0)} ms` },
        h('span', { class: 'tl-label', text: label }));
      if (l.timing.mode === 'steps') {
        bar.classList.add('steps');
        // Step marks inside the bar: the layer counts its steps from its own start.
        bar.style.setProperty('--step', `${(1000 / l.timing.perSecond / Math.max(1, s.endMs - s.startMs)) * 100}%`);
        bar.title += ` · ${l.timing.perSecond} steps a second`;
      } else bar.title += ' · smooth';
      // The name and the icon; the tooltip has the full name (a long one ends in an ellipsis), as in the Layers list.
      const name = h('button', { class: 'tl-name', title: layerRowTip(fx, l, tier), attrs: { type: 'button', 'aria-pressed': String(l.id === sel) }, on: { click: () => app.selectLayer(l.id) } },
        layerGlyph(l, (n) => app.imageUrl(n)), h('span', { text: l.name }));
      // A layer the preview's tier leaves out is shown faded.
      const off = l.type !== 'projectile' && !l.tiers.includes(tier);
      if (off) bar.title += ` · not drawn in the ${TIER_LABEL[tier]} tier`;
      // The row under the mouse in the Layers list is highlighted here too.
      return [h('div', { class: `tl-row${l.id === sel ? ' sel' : ''}${off ? ' off' : ''}${l.id === app.hoveredLayer() ? ' hovered' : ''}`, attrs: { 'data-layer': l.id } }, name, h('div', { class: 'tl-lane' }, bar))];
    });
    rows.replaceChildren(...list, line);
    // The span may have changed: the playhead keeps its moment.
    placed = '';
    place();
    fit();
  };

  refresh();
  return { el, refresh, setPlayhead };
}
