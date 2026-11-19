/**
 * Gradients, in the colour picker: ready-made ones to start from, the project's own, and a folding editor to make and
 * change them (stops, smooth or banded, and a ramp worked out between two colours, evenly to the eye). Gradients live in
 * the project's palette.json. A glow uses one from its middle to its rim. Only ramps the game can draw are offered: the
 * runtime draws rings of colour, so blurred, mesh and image gradients are not here.
 */
import { resolveGradient, resolveRole, roleNames } from '@shamble/vfx-format';
import type { Gradient, GradientStop } from '@shamble/vfx-format';
import { GRADIENT_PRESETS } from '../doc/gradient-presets';
import type { GradientPreset as Preset } from '../doc/gradient-presets';
import type { AppApi } from './api';
import { ramp as makeRamp } from './colour';
import { h, icon } from './dom';

/** Ready-made gradients (src/doc/gradient-presets.ts, shared with the default palette profiles). */
export { GRADIENT_PRESETS };

const cssColour = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** A CSS gradient showing the stops (hard edges for bands). */
function cssStops(stops: { at: number; hex: string; alpha: number }[], banded: boolean): string {
  if (!stops.length) return 'transparent';
  if (!banded) return stops.map((s) => `${cssColour(s.hex, s.alpha)} ${(s.at * 100).toFixed(1)}%`).join(', ');
  return stops.map((s, i) => {
    const a = i === 0 ? 0 : s.at, b = i + 1 < stops.length ? stops[i + 1]!.at : 1;
    return `${cssColour(s.hex, s.alpha)} ${(a * 100).toFixed(1)}% ${(b * 100).toFixed(1)}%`;
  }).join(', ');
}

export class GradientPanel {
  readonly el: HTMLElement;
  private editing: string | null = null;
  private parts!: {
    presets: HTMLElement; mine: HTMLElement; editor: HTMLDetailsElement; title: HTMLElement; newName: HTMLInputElement; createRow: HTMLElement;
    kind: HTMLElement; bar: HTMLElement; disc: HTMLElement; stops: HTMLElement; use: HTMLButtonElement; error: HTMLElement;
    rampFrom: HTMLSelectElement; rampTo: HTMLSelectElement; rampSteps: HTMLInputElement; body: HTMLElement;
  };
  private gesture = 0;

  constructor(private readonly app: AppApi) {
    this.el = this.build();
  }

  /** Edit a gradient (after making one from a preset, or picking one of the project's). */
  edit(name: string): void {
    this.editing = name;
    this.parts.editor.open = true;
    this.refresh();
  }

  refresh(): void {
    const p = this.parts, pal = this.app.palette;
    p.presets.replaceChildren(...GRADIENT_PRESETS.map((pr) => this.tile(pr.label, { ...pr.gradient, from: 'assumed' }, `Start a gradient from "${pr.label}"`, () => this.fromPreset(pr))));
    const names = Object.keys(pal.gradients ?? {}).sort();
    p.mine.replaceChildren(...(names.length ? names.map((n) => this.tile(n, pal.gradients[n]!, `Change ${n}`, () => this.edit(n), n === this.editing))
      : [h('p', { class: 'state-line', text: 'None yet: start one from the ready-made ones above, or make one below.' })]));
    const g = this.editing ? pal.gradients?.[this.editing] : undefined;
    if (this.editing && !g) this.editing = null;
    p.createRow.hidden = !!g;
    p.body.hidden = !g;
    p.title.textContent = g ? this.editing! : 'A new gradient';
    if (!g) return;
    const r = resolveGradient(pal, this.editing!, this.app.faction)!;
    const css = cssStops(r.stops, g.kind === 'banded');
    p.bar.style.backgroundImage = `linear-gradient(90deg, ${css}), repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%)`;
    p.disc.style.backgroundImage = `radial-gradient(circle closest-side, ${css}), repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%)`;
    for (const b of p.kind.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.kind === g.kind));
    this.drawStops(g);
    const layer = this.app.layer();
    const isGlow = layer?.type === 'shape' && layer.shape.kind === 'glow';
    p.use.disabled = !isGlow;
    p.use.title = isGlow ? `Colour the selected glow ("${layer!.name}") with ${this.editing}` : 'Select a glow layer first';
    const roleOpts = roleNames(pal);
    for (const sel of [p.rampFrom, p.rampTo]) {
      const keep = sel.value;
      sel.replaceChildren(...roleOpts.map((x) => h('option', { attrs: { value: x }, text: `${x} ${resolveRole(pal, x, this.app.faction)}` })));
      if (roleOpts.includes(keep)) sel.value = keep;
    }
  }

  // ---------------------------------------------------------------- building

  private build(): HTMLElement {
    const presets = h('div', { class: 'gr-tiles' });
    const mine = h('div', { class: 'gr-tiles' });
    const title = h('code', { class: 'gr-title' });
    const newName = h('input', { class: 'text', attrs: { type: 'text', placeholder: 'such as glow.blue', 'aria-label': 'New gradient name', spellcheck: 'false', autocomplete: 'off' } }) as HTMLInputElement;
    const error = h('p', { class: 'cp-error', attrs: { role: 'alert' } });
    const create = h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Make it', on: { click: () => this.create() } });
    const createRow = h('div', { class: 'gr-create' }, newName, create);
    const kind = h('div', { class: 'seggroup small', attrs: { role: 'group', 'aria-label': 'Smooth or banded' } },
      ...(['smooth', 'banded'] as const).map((k) => h('button', { class: 'seg', attrs: { type: 'button', 'data-kind': k, 'aria-pressed': 'false' }, text: k === 'smooth' ? 'Smooth' : 'Banded',
        title: k === 'smooth' ? 'Blends from colour to colour' : 'Holds each colour to the next stop: hard steps, as comic shading does',
        on: { click: () => this.change((g) => ({ ...g, kind: k })) } })));
    const bar = h('div', { class: 'gr-bar', attrs: { role: 'img', 'aria-label': 'The gradient, start to end' } });
    const disc = h('div', { class: 'gr-disc', attrs: { role: 'img', 'aria-label': 'The gradient as a glow draws it, middle to rim' } });
    const stops = h('div', { class: 'gr-stops' });
    const add = h('button', { class: 'mini', attrs: { type: 'button' }, on: { click: () => this.addStop() } }, icon('plus'), 'Add a stop');
    const use = h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Use on the selected glow', on: { click: () => this.useOnGlow() } }) as HTMLButtonElement;
    const rampFrom = h('select', { attrs: { 'aria-label': 'Ramp from' } }) as HTMLSelectElement;
    const rampTo = h('select', { attrs: { 'aria-label': 'Ramp to' } }) as HTMLSelectElement;
    const rampSteps = h('input', { class: 'num', attrs: { type: 'number', min: '2', max: '8', step: '1', value: '5', 'aria-label': 'Steps' } }) as HTMLInputElement;
    const body = h('div', { class: 'gr-body' },
      h('div', { class: 'gr-preview' }, disc, h('div', { class: 'gr-side' }, kind, bar)),
      h('div', { class: 'cp-label', text: 'Stops (0 = the middle, 100 = the rim)' }), stops, add,
      h('details', { class: 'gr-ramp' }, h('summary', { text: 'Make a ramp between two colours', attrs: { 'data-tip': 'Even steps to the eye (OKLCH). The ends stay roles, so they follow the faction; the steps between are fixed colours, worked out for the faction shown.' } }),
        h('p', { class: 'hint', text: 'Even steps to the eye. The ends follow the faction; the steps between are fixed colours.' }),
        h('div', { class: 'gr-ramprow' }, h('label', {}, h('span', { text: 'From' }), rampFrom), h('label', {}, h('span', { text: 'To' }), rampTo), h('label', {}, h('span', { text: 'Steps' }), rampSteps)),
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Make the ramp', on: { click: () => this.makeRampStops() } })),
      h('div', { class: 'cp-actions' }, use),
      h('p', { class: 'hint', text: 'A gradient cannot be renamed or removed this round: effects use it by name.' }));
    const editor = h('details', { class: 'gr-editor' }, h('summary', { attrs: { 'data-tip': 'A gradient cannot be renamed or removed this round: effects use it by name.' } }, icon('gradient'), h('span', { text: 'Gradient editor' })),
      h('div', { class: 'gr-head' }, title), createRow, error, body) as HTMLDetailsElement;
    const el = h('details', { class: 'cp-section gr' }, h('summary', { text: 'Gradients', attrs: { 'data-tip': 'Only ramps the game can draw: smooth or banded, from the middle out. Blurred, mesh and image gradients are not in.' } }),
      h('p', { class: 'hint', text: 'Only ramps the game can draw: smooth or banded, from the middle out.' }),
      h('div', { class: 'cp-label', text: 'Ready-made' }), presets,
      h('div', { class: 'cp-label', text: 'In this project' }), mine,
      editor);
    this.parts = { presets, mine, editor, title, newName, createRow, kind, bar, disc, stops, use, error, rampFrom, rampTo, rampSteps, body };
    return el;
  }

  private tile(label: string, g: Gradient, title: string, onClick: () => void, selected = false): HTMLElement {
    const pal = this.app.palette;
    const stops = g.stops.map((s) => ({ at: s.at, hex: (s.role ? resolveRole(pal, s.role, this.app.faction) : s.hex) ?? '#FFFFFF', alpha: s.alpha ?? 1 })).sort((a, b) => a.at - b.at);
    const disc = h('span', { class: 'gr-tile-disc', style: `background-image: radial-gradient(circle closest-side, ${cssStops(stops, g.kind === 'banded')}), repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%)` });
    return h('button', { class: `gr-tile${selected ? ' sel' : ''}`, attrs: { type: 'button', 'aria-label': title, 'aria-current': String(selected) }, title, on: { click: onClick } }, disc, h('span', { class: 'gr-tile-name', text: label }));
  }

  private drawStops(g: Gradient): void {
    const pal = this.app.palette, roles = roleNames(pal);
    const head = h('div', { class: 'gr-stop gr-stop-head', attrs: { 'aria-hidden': 'true' } },
      h('span', {}), h('span', { text: 'Colour' }), h('span', { text: 'Place %' }), h('span', { text: 'Solid %' }), h('span', {}));
    this.parts.stops.replaceChildren(head, ...g.stops.map((s, i) => {
      const hex = (s.role ? resolveRole(pal, s.role, this.app.faction) : s.hex) ?? '#FFFFFF';
      const sel = h('select', { attrs: { 'aria-label': `Stop ${i + 1} colour` } },
        ...roles.map((r) => h('option', { attrs: { value: r }, text: r })), h('option', { attrs: { value: '#' }, text: 'a fixed colour (hex)…' })) as HTMLSelectElement;
      sel.value = s.role ?? '#';
      const hexBox = h('input', { class: 'text gr-hex', attrs: { type: 'text', value: s.hex ?? hex, maxlength: '7', 'aria-label': `Stop ${i + 1} hex` } }) as HTMLInputElement;
      hexBox.hidden = !!s.role;
      const at = h('input', { class: 'num', attrs: { type: 'number', min: '0', max: '100', step: '1', value: String(Math.round(s.at * 100)), 'aria-label': `Stop ${i + 1} place, 0 to 100` } }) as HTMLInputElement;
      const alpha = h('input', { class: 'num', attrs: { type: 'number', min: '0', max: '100', step: '5', value: String(Math.round((s.alpha ?? 1) * 100)), 'aria-label': `Stop ${i + 1} solid, 0 to 100 %` } }) as HTMLInputElement;
      const del = h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': `Remove stop ${i + 1}` }, title: 'Remove this stop', on: { click: () => this.change((x) => ({ ...x, stops: x.stops.filter((_, k) => k !== i) })) } }, icon('close')) as HTMLButtonElement;
      del.disabled = g.stops.length <= 2;
      const setStop = (patch: Partial<GradientStop>, drop: (keyof GradientStop)[] = [], merge = false) => this.change((x) => ({
        ...x, stops: x.stops.map((st, k) => {
          if (k !== i) return st;
          const out: GradientStop = { ...st, ...patch };
          for (const d of drop) delete out[d];
          return out;
        }),
      }), merge ? `stop${i}` : undefined);
      sel.addEventListener('change', () => (sel.value === '#' ? setStop({ hex }, ['role']) : setStop({ role: sel.value }, ['hex'])));
      hexBox.addEventListener('change', () => { if (/^#?[0-9a-f]{6}$/i.test(hexBox.value.trim())) setStop({ hex: ('#' + hexBox.value.trim().replace(/^#/, '')).toUpperCase() }, ['role']); });
      at.addEventListener('change', () => setStop({ at: Math.min(1, Math.max(0, Number(at.value) / 100)) }));
      alpha.addEventListener('change', () => { const v = Math.min(1, Math.max(0, Number(alpha.value) / 100)); setStop(v === 1 ? {} : { alpha: v }, v === 1 ? ['alpha'] : []); });
      return h('div', { class: 'gr-stop' }, h('span', { class: 'gr-chip', style: `background:${cssColour(hex, s.alpha ?? 1)}` }),
        h('div', { class: 'gr-colour' }, sel, hexBox), at, h('span', { class: 'gr-alpha', title: 'How solid: 100 = solid, 0 = see-through' }, alpha), del);
    }));
  }

  // ---------------------------------------------------------------- changing

  private change(fn: (g: Gradient) => Gradient, mergeKey?: string): void {
    if (!this.editing) return;
    const g = this.app.palette.gradients?.[this.editing];
    if (!g) return;
    const next = fn(g);
    next.stops = [...next.stops].sort((a, b) => a.at - b.at);
    this.app.setGradient(this.editing, next, mergeKey ? { mergeKey: `${mergeKey}:${this.gesture}` } : {});
    if (!mergeKey) this.app.commit();
  }

  private freeName(base: string): string {
    const used = new Set(Object.keys(this.app.palette.gradients ?? {}));
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) if (!used.has(`${base}.${n}`)) return `${base}.${n}`;
  }

  private fromPreset(pr: Preset): void {
    const name = this.freeName(pr.name);
    this.app.setGradient(name, { ...structuredClone(pr.gradient), from: 'mustafa', note: `Started from the "${pr.label}" preset` });
    this.app.commit();
    this.edit(name);
  }

  private create(): void {
    const name = this.parts.newName.value.trim();
    const err = !name ? 'Give the gradient a name first.' : !/^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/.test(name) ? 'Use lowercase words joined by dots, such as glow.blue.'
      : this.app.palette.gradients?.[name] ? `"${name}" is a gradient already.` : '';
    this.parts.error.textContent = err;
    if (err) return;
    this.app.setGradient(name, { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'white' }, { at: 1, role: 'glow', alpha: 0 }] });
    this.app.commit();
    this.parts.newName.value = '';
    this.edit(name);
  }

  private addStop(): void {
    this.change((g) => {
      const s = [...g.stops].sort((a, b) => a.at - b.at);
      // In the middle of the widest gap, with the colour of the stop before it.
      let at = 0.5, base = s[0]!;
      let best = -1;
      for (let i = 0; i + 1 < s.length; i++) { const gap = s[i + 1]!.at - s[i]!.at; if (gap > best) { best = gap; at = (s[i]!.at + s[i + 1]!.at) / 2; base = s[i]!; } }
      return { ...g, stops: [...s, { ...base, at: Math.round(at * 100) / 100 }] };
    });
  }

  private makeRampStops(): void {
    const pal = this.app.palette, f = this.app.faction;
    const from = this.parts.rampFrom.value, to = this.parts.rampTo.value;
    const n = Math.min(8, Math.max(2, Math.round(Number(this.parts.rampSteps.value) || 5)));
    const a = resolveRole(pal, from, f), b = resolveRole(pal, to, f);
    if (!a || !b) return;
    const hexes = makeRamp(a, b, n);
    this.change((g) => ({ ...g, stops: hexes.map((hex, i) => (i === 0 ? { at: 0, role: from } : i === n - 1 ? { at: 1, role: to } : { at: Math.round((i / (n - 1)) * 100) / 100, hex })) }));
  }

  private useOnGlow(): void {
    const l = this.app.layer();
    if (!this.editing || l?.type !== 'shape' || l.shape.kind !== 'glow') return;
    this.app.editLayer(['shape', 'gradient'], this.editing, { label: 'Gradient' });
    this.app.commit();
  }
}
