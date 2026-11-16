import { icon } from './icons';
import type { IconName } from './icons';

/**
 * A few small DOM helpers and the editor's controls: sliders with a number box, segmented buttons,
 * number and text fields, selects and folding sections. Plain DOM, no framework.
 */

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; title?: string; style?: string; attrs?: Record<string, string>; on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>; text?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.title) el.title = props.title;
  if (props.style) el.setAttribute('style', props.style);
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const [k, fn] of Object.entries(props.on ?? {})) if (fn) el.addEventListener(k, fn as EventListener);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

export interface Control<T> {
  el: HTMLElement;
  set(v: T): void;
}

const fmt = (v: number, digits: number) => (Number.isInteger(v) && digits === 0 ? String(v) : v.toFixed(digits).replace(/\.?0+$/, '') || '0');

/** A slider with its number. onInput fires while dragging; onCommit when the drag or typing ends. */
export function slider(o: {
  label: string; min: number; max: number; step: number; value: number; unit?: string; digits?: number; hint?: string; big?: boolean;
  onInput(v: number): void; onCommit?(): void;
}): Control<number> {
  const digits = o.digits ?? 2;
  const range = h('input', { attrs: { type: 'range', min: String(o.min), max: String(o.max), step: String(o.step), 'aria-label': o.label } });
  const box = h('input', { class: 'num', attrs: { type: 'number', step: String(o.step), 'aria-label': `${o.label} value` } });
  const set = (v: number) => {
    range.value = String(v);
    if (document.activeElement !== box) box.value = fmt(v, digits);
  };
  range.addEventListener('input', () => { box.value = fmt(+range.value, digits); o.onInput(+range.value); });
  range.addEventListener('change', () => o.onCommit?.());
  box.addEventListener('change', () => {
    if (box.value.trim() === '') return;
    const v = Number(box.value);
    if (Number.isFinite(v)) { o.onInput(v); o.onCommit?.(); }
  });
  set(o.value);
  const el = h('div', { class: o.big ? 'row big' : 'row' },
    h('div', { class: 'lab' }, h('label', { text: o.label }), h('span', { class: 'val' }, box, o.unit ? h('span', { class: 'unit', text: o.unit }) : null)),
    range,
    o.hint ? h('p', { class: 'hint', text: o.hint }) : null);
  return { el, set };
}

/** A row of buttons, one pressed. */
export function segmented<T extends string | number>(o: {
  label?: string; options: { value: T; label: string; title?: string; icon?: IconName; style?: string }[]; value: T; onChange(v: T): void; small?: boolean;
}): Control<T> {
  const buttons = o.options.map((opt) =>
    h('button', { class: opt.icon ? 'seg with-icon' : 'seg', title: opt.title, style: opt.style, attrs: { type: 'button', 'aria-pressed': 'false' }, on: { click: () => o.onChange(opt.value) } },
      opt.icon ? icon(opt.icon) : null, h('span', { text: opt.label })));
  const set = (v: T) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(o.options[i]!.value === v)));
  set(o.value);
  const group = h('div', { class: o.small ? 'seggroup small' : 'seggroup', attrs: { role: 'group', 'aria-label': o.label ?? '' } }, ...buttons);
  const el = o.label ? h('div', { class: 'row' }, h('div', { class: 'lab' }, h('span', { text: o.label })), group) : group;
  return { el, set };
}

export function numberField(o: { label: string; value: number; step?: number; min?: number; max?: number; unit?: string; onChange(v: number): void }): Control<number> {
  const box = h('input', { class: 'num', attrs: { type: 'number', step: String(o.step ?? 0.01), 'aria-label': o.label } });
  if (o.min !== undefined) box.min = String(o.min);
  if (o.max !== undefined) box.max = String(o.max);
  // An emptied box changes nothing (Number('') would be 0).
  box.addEventListener('change', () => { if (box.value.trim() === '') return; const v = Number(box.value); if (Number.isFinite(v)) o.onChange(v); });
  const set = (v: number) => { if (document.activeElement !== box) box.value = fmt(v, 3); };
  set(o.value);
  const el = h('label', { class: 'field' }, h('span', { class: 'flab', text: o.label }), box, o.unit ? h('span', { class: 'unit', text: o.unit }) : null);
  return { el, set };
}

export function textField(o: { label: string; value: string; onChange(v: string): void }): Control<string> {
  const box = h('input', { class: 'text', attrs: { type: 'text', 'aria-label': o.label, maxlength: '80' } });
  box.addEventListener('change', () => o.onChange(box.value));
  const set = (v: string) => { if (document.activeElement !== box) box.value = v; };
  set(o.value);
  return { el: h('label', { class: 'field wide' }, h('span', { class: 'flab', text: o.label }), box), set };
}

export function selectField(o: { label: string; options: { value: string; label: string }[]; value: string; onChange(v: string): void }): Control<string> & { setOptions(opts: { value: string; label: string }[]): void } {
  const sel = h('select', { attrs: { 'aria-label': o.label } });
  const setOptions = (opts: { value: string; label: string }[]) => {
    const keep = sel.value;
    sel.replaceChildren(...opts.map((x) => h('option', { attrs: { value: x.value }, text: x.label })));
    sel.value = keep;
  };
  setOptions(o.options);
  sel.addEventListener('change', () => o.onChange(sel.value));
  const set = (v: string) => { sel.value = v; };
  set(o.value);
  return { el: h('label', { class: 'field wide' }, h('span', { class: 'flab', text: o.label }), sel), set, setOptions };
}

export function checkField(o: { label: string; value: boolean; onChange(v: boolean): void }): Control<boolean> {
  const box = h('input', { attrs: { type: 'checkbox' } });
  box.addEventListener('change', () => o.onChange(box.checked));
  const set = (v: boolean) => { box.checked = v; };
  set(o.value);
  return { el: h('label', { class: 'check' }, box, h('span', { text: o.label })), set };
}

/**
 * A folding section. Its open/closed state is remembered per title. `actions` sit on the right of its header row, outside
 * the summary (a control inside a summary would fold the section too), and show while it is open.
 */
export function fold(title: string, children: Child[], openByDefault = false, actions: Child[] = []): HTMLDetailsElement {
  const key = `vfx-fold:${title}`;
  let open = openByDefault;
  try { const s = localStorage.getItem(key); if (s !== null) open = s === '1'; } catch { /* storage may be blocked */ }
  const d = h('details', { class: actions.length ? 'fold has-actions' : 'fold' }, h('summary', { text: title }),
    actions.length ? h('div', { class: 'fold-actions' }, ...actions) : null, h('div', { class: 'foldbody' }, ...children));
  d.open = open;
  d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch { /* ignore */ } });
  return d;
}

export { icon, ICON_NAMES } from './icons';
export type { IconName } from './icons';
