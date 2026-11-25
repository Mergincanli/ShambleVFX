import { icon } from './icons';
import type { IconName } from './icons';

/**
 * A few small DOM helpers and the editor's controls: sliders with a number box, segmented buttons, number and text fields,
 * selects and folding sections; the tooltip; icon buttons, menus (also at a point, for a right-click), chips, and numbers
 * you drag or type. Plain DOM and the Popover API, no framework.
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

// ---------------------------------------------------------------- the right panel's rows (docs/ui-redesign.md 6.6)
//
// A property row is a grid: the label on the left (12 px, muted, an ellipsis when it is too long, the whole label in its
// tooltip), the control on the right. The classes stay what the help texts, the settings inventory (tools/ui-shots.mjs)
// and the browser check read: label.field (or div.field) with its label in .flab, label.check for a checkbox; .prop marks
// the row. A hint under a row spans both columns.

/**
 * A number as a box shows it: `digits` decimals; with `trim`, at most that many and no zeros at the end ("0.5", "350"),
 * as the panel's number boxes always showed them. Never "-0".
 */
export function formatNumber(v: number, digits: number, trim = false): string {
  const s = v.toFixed(digits);
  const t = trim && s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return /^-0(\.0*)?$/.test(t) ? t.slice(1) : t;
}

/**
 * A row's label. `help`: the name help.ts knows it by, when the label shows other words. `glyph`: an icon before the words
 * (the effect's Scale: size, intensity, duration); the label's text stays its words alone.
 */
function rowLabel(text: string, help?: string, glyph?: IconName): HTMLSpanElement {
  const attrs: Record<string, string> = help ? { 'data-help-label': help } : {};
  if (!glyph) return h('span', { class: 'flab', text, attrs });
  return h('span', { class: 'flab with-icon', attrs }, icon(glyph), h('span', { class: 'flab-text', text }));
}

/** What a number box needs. */
export interface NumberOptions {
  /** The full name: the row's label, and the box's name for screen readers. */
  label: string;
  value: number;
  /** One press of ↑ or ↓, and one step of a drag (4 px; Shift: ten steps). */
  step?: number;
  /** The decimals kept: a typed or dragged number is rounded to them. Shown without the zeros at the end, unless `fixed`. */
  digits?: number;
  fixed?: boolean;
  min?: number;
  max?: number;
  unit?: string;
  /** The label the row shows, when it is shorter than the full name. */
  shown?: string;
  /** The name help.ts knows it by, when it is not the label. */
  help?: string;
  /** Each change: a step of a drag, a key, a typed number. */
  onInput(v: number): void;
  /** A drag, a key press or a typed number ends: the end of one undo step. */
  onCommit?(): void;
}

/**
 * A number in a row: drag its label sideways, or type it (scrubNumber). The input keeps the num class. Each box keeps the
 * step, the decimals (3 unless given, shown without the zeros at the end) and the limits it had.
 */
export function numberField(o: NumberOptions): Control<number> & { input: HTMLInputElement } {
  const s = scrubNumber({ label: o.label, value: o.value, step: o.step ?? 0.01, digits: o.digits ?? 3, trim: !o.fixed, min: o.min, max: o.max, unit: o.unit,
    onInput: o.onInput, onCommit: o.onCommit });
  const lab = rowLabel(o.shown ?? o.label, o.help);
  s.dragFrom(lab);
  return { el: h('label', { class: 'field prop' }, lab, s.el), set: s.set, input: s.input };
}

export interface NumberBox {
  el: HTMLElement;
  input: HTMLInputElement;
  set(v: number): void;
}

/**
 * One box of a group of numbers (numberGroup): a short muted prefix inside it ("R", "X", "Cols"), dragged sideways like a
 * label. Its full name is its name for screen readers and its tooltip, followed by the help text for `help` (or for the
 * full name). Its unit is the group's, unless it has its own (`unit`: inside the box, as a single number's).
 */
export function numberBox(o: Omit<NumberOptions, 'shown'> & { prefix: string }): NumberBox {
  const s = scrubNumber({ label: o.label, value: o.value, step: o.step ?? 0.01, digits: o.digits ?? 3, trim: !o.fixed, min: o.min, max: o.max,
    prefix: o.prefix, unit: o.unit, onInput: o.onInput, onCommit: o.onCommit });
  s.el.setAttribute('data-tip', o.label);
  s.el.setAttribute('data-help-label', o.help ?? o.label);
  return { el: s.el, input: s.input, set: s.set };
}

/**
 * Two or three numbers on one row (offset, pivot, a flipbook's grid, a nudge, a range), under one label. Their unit shows
 * once, muted, after the last box: three boxes with a unit each do not fit in the 296 px panel. `bare`: no label column, the
 * boxes across the whole row (the effect's three phase lengths, each box with its unit); the label is the group's name for
 * screen readers only.
 */
export function numberGroup(o: { label: string; help?: string; boxes: NumberBox[]; unit?: string; bare?: boolean }): HTMLElement {
  const boxes = h('span', { class: 'prop-boxes' }, ...o.boxes.map((b) => b.el), o.unit ? h('span', { class: 'unit', attrs: { 'aria-hidden': 'true' }, text: o.unit }) : null);
  if (o.bare) return h('div', { class: 'prop-group bare', attrs: { role: 'group', 'aria-label': o.label } }, boxes);
  return h('div', { class: 'field prop prop-group', attrs: { role: 'group', 'aria-label': o.label } }, rowLabel(o.label, o.help), boxes);
}

/**
 * A slider and its number on one row: a 2 px track and a 12 px thumb, then the number box (56 px, wider for a long
 * number and unit). onInput fires while dragging; onCommit when the drag or typing ends. Typing keeps no limits, as
 * before (a value past the slider's ends is the file's to have); dragging the label stays within the slider's ends, as
 * the slider does. The classes row, big and input.num stay.
 */
export function slider(o: {
  label: string; min: number; max: number; step: number; value: number; unit?: string; digits?: number; hint?: string; big?: boolean;
  help?: string; icon?: IconName; onInput(v: number): void; onCommit?(): void;
}): Control<number> {
  const digits = o.digits ?? 2;
  const range = h('input', { attrs: { type: 'range', min: String(o.min), max: String(o.max), step: String(o.step), 'aria-label': o.label } });
  const num = scrubNumber({ label: `${o.label} value`, value: o.value, step: o.step, digits, unit: o.unit, dragMin: o.min, dragMax: o.max,
    onInput: (v) => { range.value = String(v); o.onInput(v); }, onCommit: o.onCommit });
  // A long number and unit ("1200 m/s", "-1440 °/s") gets the wider box.
  if (Math.max(formatNumber(o.min, digits).length, formatNumber(o.max, digits).length) + (o.unit?.length ?? 0) > 6) num.el.classList.add('wide');
  const set = (v: number) => { range.value = String(v); num.set(v); };
  range.addEventListener('input', () => { num.set(+range.value); o.onInput(+range.value); });
  range.addEventListener('change', () => o.onCommit?.());
  const lab = rowLabel(o.label, o.help, o.icon);
  num.dragFrom(lab);
  set(o.value);
  const el = h('div', { class: o.big ? 'row field prop slide big' : 'row field prop slide' },
    lab, h('span', { class: 'slide-ctl' }, range, num.el),
    o.hint ? h('p', { class: 'hint', text: o.hint }) : null);
  return { el, set };
}

/**
 * A segment of a segmented control. `short`: the words it shows when its own do not fit on one line in the 296 px panel;
 * its full words are then its tooltip and its name (aria-label, and data-help-label for its help text). `title` says
 * more in the tooltip.
 */
export interface SegmentOption<T> { value: T; label: string; short?: string; title?: string; icon?: IconName; style?: string }

/**
 * A row of buttons, one pressed. With a label, a property row of the right panel; with `inline`, the label and the buttons
 * side by side in a bar (the timeline header's Speed).
 */
export function segmented<T extends string | number>(o: {
  label?: string; help?: string; options: SegmentOption<T>[]; value: T; onChange(v: T): void; small?: boolean; inline?: boolean;
}): Control<T> {
  const buttons = o.options.map((opt) => {
    const tipText = opt.short ? (opt.title ? `${opt.label}: ${opt.title.charAt(0).toLowerCase()}${opt.title.slice(1)}` : opt.label) : opt.title;
    return h('button', {
      class: opt.icon ? 'seg with-icon' : 'seg', title: tipText, style: opt.style,
      attrs: { type: 'button', 'aria-pressed': 'false', ...(opt.short ? { 'aria-label': opt.label, 'data-help-label': opt.label } : {}) },
      on: { click: () => o.onChange(opt.value) },
    }, opt.icon ? icon(opt.icon) : null, h('span', { text: opt.short ?? opt.label }));
  });
  const set = (v: T) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(o.options[i]!.value === v)));
  set(o.value);
  const group = h('div', { class: o.small ? 'seggroup small' : 'seggroup', attrs: { role: 'group', 'aria-label': o.label ?? '' } }, ...buttons);
  const el = !o.label ? group
    : o.inline ? h('div', { class: 'row' }, h('div', { class: 'lab' }, h('span', { text: o.label })), group)
      : h('div', { class: 'field prop seg-row' }, rowLabel(o.label, o.help), group);
  return { el, set };
}

export function textField(o: { label: string; value: string; help?: string; onChange(v: string): void }): Control<string> & { input: HTMLInputElement } {
  const box = h('input', { class: 'text', attrs: { type: 'text', 'aria-label': o.label, maxlength: '80' } });
  box.addEventListener('change', () => o.onChange(box.value));
  const set = (v: string) => { if (document.activeElement !== box) box.value = v; };
  set(o.value);
  return { el: h('label', { class: 'field prop' }, rowLabel(o.label, o.help), box), set, input: box };
}

export type SelectView = Control<string> & { setOptions(opts: { value: string; label: string }[]): void; select: HTMLSelectElement };

/**
 * A select in a row. A colour role's select (`swatch` gives the hex of a role, for the faction shown) keeps its select,
 * with a 14 px swatch of the chosen role's colour at its left edge, painted again by set() (the inspector calls it on
 * every refresh: a faction change, a colour changed in the picker). Role names are typed into files: Plex Mono.
 */
export function selectField(o: {
  label: string; options: { value: string; label: string }[]; value: string; help?: string; swatch?: (role: string) => string | null | undefined;
  /** A button after the select, in the control column (an edit button that opens the colour picker). */
  extra?: HTMLElement;
  onChange(v: string): void;
}): SelectView {
  const sel = h('select', { attrs: { 'aria-label': o.label } });
  const chip = o.swatch ? h('span', { class: 'role-swatch', attrs: { 'aria-hidden': 'true' } }) : null;
  /** The swatch in the chosen role's colour, or the look of a missing colour. */
  const paint = () => {
    if (!chip) return;
    const hex = (sel.value && o.swatch!(sel.value)) || '';
    if (chip.dataset.hex !== hex) { chip.dataset.hex = hex; chip.style.background = hex; chip.classList.toggle('none', !hex); }
  };
  const setOptions = (opts: { value: string; label: string }[]) => {
    const keep = sel.value;
    sel.replaceChildren(...opts.map((x) => h('option', { attrs: { value: x.value }, text: x.label })));
    sel.value = keep;
    paint();
  };
  setOptions(o.options);
  sel.addEventListener('change', () => { paint(); o.onChange(sel.value); });
  const set = (v: string) => { sel.value = v; paint(); };
  set(o.value);
  const pick = chip ? h('span', { class: 'role-select' }, chip, sel) : sel;
  const control = o.extra ? h('span', { class: 'select-row' }, pick, o.extra) : pick;
  return { el: h('label', { class: 'field prop' }, rowLabel(o.label, o.help), control), set, setOptions, select: sel };
}

/**
 * A checkbox in a row: its label on the left, the 14 px box on the right (checked in --accent-ink). `help`: the name help.ts
 * knows it by, when its words are shorter.
 */
export function checkField(o: { label: string; value: boolean; help?: string; onChange(v: boolean): void }): Control<boolean> & { box: HTMLInputElement } {
  const box = h('input', { attrs: { type: 'checkbox' } });
  box.addEventListener('change', () => o.onChange(box.checked));
  const set = (v: boolean) => { box.checked = v; };
  set(o.value);
  return { el: h('label', { class: 'check prop', attrs: o.help ? { 'data-help-label': o.help } : {} }, box, h('span', { class: 'check-text', text: o.label })), set, box };
}

/**
 * A folding section (<details>): a chevron, its title (.fold-title, 13 px semibold), and its actions on the right. Its
 * open or closed state is remembered per title. `actions` sit on the right of its header row, outside the summary (a
 * control inside a summary would fold the section too), and show while it is open. `meta`: muted words at the right end of
 * the summary, which show open or closed (no control: a layer's kind). The title is the summary's .fold-title (the help
 * texts and the settings inventory read it). `remember: false`: open or closed is not remembered (the colour picker's
 * sections start as they did each time the page opens).
 */
export function fold(title: string, children: Child[], openByDefault = false, actions: Child[] = [], o: { meta?: HTMLElement; className?: string; remember?: boolean } = {}): HTMLDetailsElement {
  const key = `vfx-fold:${title}`;
  const remember = o.remember !== false;
  let open = openByDefault;
  if (remember) try { const s = localStorage.getItem(key); if (s !== null) open = s === '1'; } catch { /* storage may be blocked */ }
  const chev = icon('chevron-right');
  chev.classList.add('fold-chev');
  const cls = ['fold', actions.length ? 'has-actions' : '', o.className ?? ''].filter(Boolean).join(' ');
  const d = h('details', { class: cls }, h('summary', {}, chev, h('span', { class: 'fold-title', text: title }), o.meta ?? null),
    actions.length ? h('div', { class: 'fold-actions' }, ...actions) : null, h('div', { class: 'foldbody' }, ...children));
  d.open = open;
  if (remember) d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch { /* ignore */ } });
  return d;
}

// ---------------------------------------------------------------- tooltips (docs/ui-redesign.md 6.9)

/**
 * One tooltip for the whole page. It shows after TIP_DELAY_MS of hover (TIP_QUICK_MS when another tooltip was just
 * open), and at once when the keyboard moves the focus onto an element that has one (Tab, Shift+Tab, or an arrow key in a
 * menu or a group): a button, a section's title, a checkbox, and a text box, number box, select or slider, which get the
 * tooltip of their label. Focus that a click or the editor moves shows none. It hides when the pointer leaves, on a press,
 * on scroll and on Esc, and then stays away until the pointer moves on (a row built again under a still pointer stays
 * quiet). Esc is not taken from the editor: it still does what it did (closes the picker, leaves the layer).
 *
 * What it says for an element:
 *   - its own words: data-tip. Every title turns into data-tip the first time the pointer or the focus comes to it (or as
 *     soon as code sets it again), so the browser's own tooltip never shows as well; a shortcut at the end of a title,
 *     "(Ctrl+Z)", goes into the kbd. Code can set the words with tip(). An icon-only button with no words of its own is
 *     named by its aria-label. A line break in the words starts a line of its own;
 *   - the help text for its label where it is shown, from the lookup given to installTooltips (src/app/helptips.ts),
 *     asked for each time it shows, so a label that changes or comes later gets its text;
 *   - its full text first, when it is cut short with an ellipsis (or a chip's value is);
 *   - a shortcut (data-tip-key, or the lookup's) in a muted kbd;
 *   - last, the name a file uses for it (data-tip-file, set with tipFile()): "In the file: band", the name in Plex Mono, as
 *     what is typed into files is (a shape shows its plain name everywhere else: Mustafa's decision of 2026-11-25).
 * The element is a manual popover appended to document.body: it draws over the colour picker and dialogs too, and never
 * takes the pointer. Nothing here changes an element's name for screen readers; a tooltip shown for the keyboard focus
 * describes the focused element (aria-describedby) while it shows.
 */
export const TIP_DELAY_MS = 500;
export const TIP_QUICK_MS = 150;
/** "Another tooltip was just open": one is open, or one closed less than this long ago. */
const TIP_QUICK_WINDOW_MS = 600;
/** Focus counts as the keyboard's when a key that moves the focus was pressed less than this long before. */
const KEY_FOCUS_MS = 1000;
/** The keys that move the focus: Tab and Shift+Tab, and the arrows, Home and End in a menu or a group of radio buttons. */
const FOCUS_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);
/** Where the keyboard types: a tooltip for these goes above them, so it never covers the rows under them. */
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), select, textarea';
const TIP_ID = 'vfx-tooltip';

/** What the help lookup gives for an element: the help text for its label, and its shortcut. */
export interface TipHelp { text?: string; key?: string }
export type TipHelpLookup = (el: Element) => TipHelp | null;

/**
 * A shortcut at the end of a title: "Undo Size (Ctrl+Z)", "Close (Esc)". Only a combination or a named key: a title that
 * holds a name ("Smoke (2)", a layer's row) keeps its brackets.
 */
const KEY_IN_TITLE = /\s+\(((?:(?:Ctrl|Shift|Alt|Cmd)\+)+[^()\s]+|Esc|Del|Delete|Backspace|Space|Enter|Tab|F\d{1,2}|[←→↑↓])\)$/;
const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role], [tabindex]';

let helpOf: TipHelpLookup = () => null;
let installed = false;
let tipEl: HTMLElement | null = null;
/** The element under the pointer that has a tooltip (shown or waiting), the one shown, and the one pressed. */
let hovered: Element | null = null;
let shown: Element | null = null;
let pressed: Element | null = null;
let shownByFocus = false;
/** The focused element that the shown tooltip describes, and the one it shows for (the same, unless that one has a description of its own). */
let described: Element | null = null;
let focusedFor: Element | null = null;
let timer = 0;
let watch = 0;
let hiddenAt = -Infinity;
/** When a key that moves the focus was pressed. A pointer press, or any other key, ends it: the next focus is not the keyboard's. */
let focusKeyAt = -Infinity;
/** Where the pointer is, and where it was when a press, a scroll or Esc hid the tooltip: until it moves from there, none shows. */
let pointerX = NaN, pointerY = NaN, stillX = NaN, stillY = NaN;
const holdStill = () => { stillX = pointerX; stillY = pointerY; };

/**
 * Give an element a tooltip in code: its own words (null: none) and an optional shortcut. It takes the place of a title,
 * so no browser tooltip shows; an open tooltip for the element follows at once.
 */
export function tip(el: Element, text: string | null, key?: string): void {
  el.removeAttribute('title');
  if (text) el.setAttribute('data-tip', text); else el.removeAttribute('data-tip');
  if (key) el.setAttribute('data-tip-key', key); else el.removeAttribute('data-tip-key');
  el.removeAttribute('data-tip-key-from-title');
  if (el === shown) showTip(el, shownByFocus, focusedFor ?? undefined);
}

/**
 * Give an element's tooltip a last line with the name a file uses for it ("In the file: band"), or take it away (null). The
 * element needs a tooltip of its own as well (its words or a help text): the line only ends it.
 */
export function tipFile(el: Element, file: string | null): void {
  if (file) el.setAttribute('data-tip-file', file); else el.removeAttribute('data-tip-file');
  if (el === shown) showTip(el, shownByFocus, focusedFor ?? undefined);
}

/** Turn an element's title into its tooltip's own words, so the browser never shows its own tooltip as well. */
function takeTitle(el: Element): void {
  const t = el.getAttribute('title');
  if (t === null) return;
  el.removeAttribute('title');
  const m = KEY_IN_TITLE.exec(t);
  const words = (m ? t.slice(0, m.index) : t).trim();
  if (words) el.setAttribute('data-tip', words); else el.removeAttribute('data-tip');
  if (m) { el.setAttribute('data-tip-key', m[1]!); el.setAttribute('data-tip-key-from-title', ''); }
  else if (el.hasAttribute('data-tip-key-from-title')) { el.removeAttribute('data-tip-key'); el.removeAttribute('data-tip-key-from-title'); }
  // A control named only by its title keeps that name.
  if (words && el.matches(INTERACTIVE) && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !(el.textContent ?? '').trim()) el.setAttribute('aria-label', words);
}

function takeTitles(from: Element | null): void {
  for (let n = from; n; n = n.parentElement) if (n.hasAttribute('title')) takeTitle(n);
}

function ownWords(el: Element): string {
  return el.getAttribute('data-tip') ?? (el.matches('.icon-only') ? el.getAttribute('aria-label') ?? '' : '');
}

function hasTip(el: Element): boolean {
  return el.hasAttribute('data-tip') || el.hasAttribute('title') || (el.matches('.icon-only') && el.hasAttribute('aria-label')) || !!helpOf(el)
    || (cuttable(el) && cutText(el) !== null);
}

/** Room a closed select keeps for its arrow, in px (Chromium's, on Linux and Windows). */
const SELECT_ARROW = 20;
let measurer: CanvasRenderingContext2D | null = null;

/** A select, or a text box (input.text), whose words can be cut short. */
function cuttable(el: Element): el is HTMLSelectElement | HTMLInputElement {
  return el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.matches('input.text'));
}

/**
 * The words a select or a text box shows cut short, whole: a select's chosen option ("fire.smoke.lig…": the browser draws
 * no ellipsis in a closed select), or a text box's words (it ends in an ellipsis while it does not have the focus). The
 * tooltip gives them. Null when they fit (or it is not shown).
 */
export function cutText(el: HTMLSelectElement | HTMLInputElement): string | null {
  const text = (el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent ?? '' : el.value).trim();
  if (!text || !el.getClientRects().length) return null;
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return null;
  const s = getComputedStyle(el);
  measurer.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  const room = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - (el instanceof HTMLSelectElement ? SELECT_ARROW : 0);
  return measurer.measureText(text).width > room ? text : null;
}

/** The nearest element round the pointer's target that has a tooltip. */
function tipAt(target: Element | null): Element | null {
  for (let n = target; n && n !== document.body && n !== document.documentElement; n = n.parentElement) if (hasTip(n)) return n;
  return null;
}

/**
 * The focused element's own tooltip: its own; for a checkbox, its label's; for a text box, a number box, a select or a
 * slider in a field or a row, its label's (the words the pointer gets on the label). Never a neighbour's.
 */
function tipOfFocus(el: Element): Element | null {
  if (hasTip(el)) return el;
  if (!el.matches('input, select, textarea')) return null;
  const check = el.closest('label.check');
  if (check) return hasTip(check) ? check : null;
  // A box of a group of numbers: its own tooltip (its full name), not the row's.
  const box = el.closest('.prop-group .scrub');
  if (box) return hasTip(box) ? box : null;
  const field = el.closest('label.field, .field');
  const row = el.closest('.row');
  const label = field?.querySelector(':scope > .flab') ?? row?.querySelector(':scope > .lab > label, :scope > .lab > span:first-child:not(.hint):not(.val)');
  return label && hasTip(label) ? label : null;
}

const flat = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * What the tooltip says for an element: its lines, its shortcut, and the name in the file (its last line). Null when it has
 * nothing to say.
 */
export function tipContent(el: Element): { lines: string[]; key?: string; file?: string } | null {
  takeTitle(el);
  // Its own words: a line each where they hold a line break.
  const ownLines = ownWords(el).split('\n').map(flat).filter(Boolean);
  const own = ownLines.join(' ');
  const help = helpOf(el);
  const lines: string[] = [];
  const he = el as HTMLElement;
  // Cut short with an ellipsis (the element, or a chip's value): the whole text first.
  const cut = (x: HTMLElement | null) => !!x && x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).textOverflow === 'ellipsis';
  // A chip's value, and a checkbox row's words, can be cut short inside the element the tooltip is for.
  const value = he.querySelector<HTMLElement>(':scope > .chip-value, :scope > .check-text');
  const full = cut(he) ? flat(he.textContent) : cut(value) ? flat(value!.textContent) : '';
  if (full && !own.includes(full)) lines.push(full);
  lines.push(...ownLines);
  if (help?.text && flat(help.text) !== own) lines.push(help.text);
  // A select or a text box too narrow for its words: those words, then the help text of its row's label (what the label's
  // own tooltip says), so the keyboard's focus on it still explains the setting.
  if (cuttable(el) && !lines.length) {
    const words = cutText(el);
    if (words) {
      lines.push(words);
      const lab = el.closest('label.field, .field')?.querySelector(':scope > .flab');
      const labHelp = lab ? helpOf(lab) : null;
      if (labHelp?.text) lines.push(labHelp.text);
    }
  }
  const key = el.getAttribute('data-tip-key') ?? help?.key;
  if (!lines.length && key) lines.push(flat(he.textContent) || flat(el.getAttribute('aria-label')));
  const file = el.getAttribute('data-tip-file');
  return lines.length ? { lines, ...(key ? { key } : {}), ...(file ? { file } : {}) } : null;
}

function tipElement(): HTMLElement {
  if (tipEl?.isConnected) return tipEl;
  tipEl = h('div', { class: 'tooltip', attrs: { id: TIP_ID, role: 'tooltip', popover: 'manual' } });
  document.body.append(tipEl);
  return tipEl;
}

const isOpen = (el: HTMLElement) => el.matches(':popover-open');

function showTip(anchor: Element, byFocus: boolean, focused?: Element): void {
  const c = tipContent(anchor);
  if (!c) { hideTip(); return; }
  const el = tipElement();
  const [first, ...more] = c.lines;
  el.replaceChildren(
    h('div', { class: more.length ? 'tip-first lead' : 'tip-first' }, h('span', { text: first ?? '' }), c.key ? h('kbd', { text: c.key }) : null),
    ...more.map((line) => h('p', { text: line })),
    // The name in the file, last: in Plex Mono, as what is typed into files. A footnote: it does not make the first line
    // semibold (a help text stays in its own weight).
    ...(c.file ? [h('p', { class: 'tip-file' }, 'In the file: ', h('code', { text: c.file }))] : []));
  // Shown again each time, so it is on top of a picker or a dialog opened since.
  if (isOpen(el)) el.hidePopover();
  el.showPopover();
  // A box the keyboard types in: above it, so the rows under it stay in sight while you type.
  if (byFocus && focused?.matches(TYPING)) placeTip(el, focused, true);
  else placeTip(el, anchor);
  if (described && described !== focused) unlinkTip();
  shown = anchor;
  shownByFocus = byFocus;
  focusedFor = byFocus ? focused ?? anchor : null;
  if (byFocus && focused && !focused.hasAttribute('aria-describedby')) { focused.setAttribute('aria-describedby', TIP_ID); described = focused; }
  clearInterval(watch);
  // What it was for went away (the panel was built again): so does the tooltip.
  watch = window.setInterval(() => { if (shown && !shown.isConnected) hideTip(); }, 250);
}

/**
 * Below what it is for, or above when there is no room below (above first: `above`); always inside the window. A row of a
 * menu (inside [data-tip-beside]) gets it beside the menu instead, level with the row, so it never covers the rows under it.
 */
function placeTip(el: HTMLElement, anchor: Element, above = false): void {
  const r = anchor.getBoundingClientRect();
  const t = el.getBoundingClientRect();
  const m = 8, gap = 6;
  const beside = anchor.closest('[data-tip-beside]');
  if (beside) {
    const b = beside.getBoundingClientRect();
    let left = b.right + gap;
    if (left + t.width > window.innerWidth - m) left = b.left - gap - t.width;
    el.style.left = `${Math.round(Math.max(m, left))}px`;
    el.style.top = `${Math.round(Math.max(m, Math.min(r.top, window.innerHeight - m - t.height)))}px`;
    return;
  }
  let top = r.bottom + gap;
  if (above && r.top - gap - t.height >= m) top = r.top - gap - t.height;
  else if (top + t.height > window.innerHeight - m && r.top - gap - t.height >= m) top = r.top - gap - t.height;
  top = Math.max(m, Math.min(top, window.innerHeight - m - t.height));
  const left = Math.max(m, Math.min(r.left, window.innerWidth - m - t.width));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function unlinkTip(): void {
  if (described?.getAttribute('aria-describedby') === TIP_ID) described.removeAttribute('aria-describedby');
  described = null;
}

function hideTip(): void {
  clearTimeout(timer);
  timer = 0;
  clearInterval(watch);
  if (tipEl && isOpen(tipEl)) tipEl.hidePopover();
  if (shown) hiddenAt = performance.now();
  shown = null;
  shownByFocus = false;
  focusedFor = null;
  unlinkTip();
}

/** Start the page's tooltips (once), with the lookup for help texts. */
export function installTooltips(lookup: TipHelpLookup): void {
  helpOf = lookup;
  if (installed) return;
  installed = true;
  document.addEventListener('pointermove', (e) => { pointerX = e.clientX; pointerY = e.clientY; }, { capture: true, passive: true });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    pointerX = e.clientX;
    pointerY = e.clientY;
    const target = e.target as Element;
    takeTitles(target);
    const a = tipAt(target);
    if (a === hovered) return;
    hovered = a;
    clearTimeout(timer);
    timer = 0;
    // The pointer has not moved since a press, a scroll or Esc: what is under it now (a row built again after the click)
    // stays quiet as what was pressed did.
    if (Math.abs(pointerX - stillX) < 2 && Math.abs(pointerY - stillY) < 2) { pressed = a; return; }
    stillX = stillY = NaN;
    if (pressed && pressed !== a) pressed = null;
    if (shown && !shownByFocus && shown !== a) hideTip();
    if (!a || a === pressed || a === shown) return;
    const quick = !!shown || performance.now() - hiddenAt < TIP_QUICK_WINDOW_MS;
    timer = window.setTimeout(() => { timer = 0; if (hovered === a && a.isConnected) showTip(a, false); }, quick ? TIP_QUICK_MS : TIP_DELAY_MS);
  }, true);
  document.addEventListener('pointerout', (e) => {
    // Out of the window.
    if (e.relatedTarget !== null) return;
    hovered = null;
    pressed = null;
    clearTimeout(timer);
    timer = 0;
    if (shown && !shownByFocus) hideTip();
  }, true);
  document.addEventListener('pointerdown', (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    holdStill();
    pressed = hovered ?? tipAt(e.target as Element);
    // A press moves the focus as the pointer's, never the keyboard's (a text box matches :focus-visible after a click too).
    focusKeyAt = -Infinity;
    hideTip();
  }, true);
  document.addEventListener('focusin', (e) => {
    const target = e.target as Element;
    takeTitles(target);
    // Only for the keyboard: a key that moves the focus moved it here. Not when a click or the editor moved it (also not
    // the editor moving it just after: one key, one move).
    if (performance.now() - focusKeyAt > KEY_FOCUS_MS) return;
    focusKeyAt = -Infinity;
    const a = tipOfFocus(target);
    if (a) { clearTimeout(timer); timer = 0; showTip(a, true, target); }
  }, true);
  document.addEventListener('focusout', (e) => {
    if (shown && shownByFocus && (e.target === focusedFor || shown.contains(e.target as Node))) hideTip();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (FOCUS_KEYS.has(e.key)) focusKeyAt = performance.now();
    else if (!MODIFIER_KEYS.has(e.key)) focusKeyAt = -Infinity;
    // Esc hides it, and is not taken: the editor still gets it.
    if (e.key === 'Escape' && (shown || timer)) { holdStill(); pressed = hovered; hideTip(); }
  }, true);
  document.addEventListener('scroll', () => { if (shown || timer) { holdStill(); pressed = hovered; hideTip(); } }, true);
  window.addEventListener('blur', () => { hovered = null; hideTip(); });
  // A title set again by code (the Undo button names the next step) never shows on its own: it turns into the tooltip's
  // words at once on elements that had a tooltip already, and on the one under the pointer.
  new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target as Element;
      if (!el.hasAttribute('title')) continue;
      if (el === hovered || el === shown || el.hasAttribute('data-tip') || el.hasAttribute('data-tip-key')) {
        takeTitle(el);
        if (el === shown) showTip(el, shownByFocus, focusedFor ?? undefined);
      }
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['title'] });
}

// ---------------------------------------------------------------- icon buttons (docs/ui-redesign.md 4.3, 4.5, 4.6)

/**
 * A 24 x 24 button with a 16 px icon and no words. Its name (aria-label) is the first line of its tooltip; its shortcut
 * goes into the tooltip's kbd (`key`, or the one help.ts has for its name). A toggle (`pressed` given) says on or off with
 * aria-pressed and looks on as 4.6 says: the field colour, the icon in --accent-ink. `className` holds its other classes
 * (tb, theme-toggle…); more than one icon is for a toggle that shows one of them (the stylesheet picks it).
 */
export function iconButton(o: { icon: IconName | IconName[]; label: string; className?: string; pressed?: boolean; key?: string; onClick(e: Event): void }): HTMLButtonElement {
  const icons = Array.isArray(o.icon) ? o.icon : [o.icon];
  return h('button', {
    class: o.className ? `${o.className} icon-only` : 'icon-only',
    attrs: { type: 'button', 'aria-label': o.label, ...(o.pressed !== undefined ? { 'aria-pressed': String(o.pressed) } : {}), ...(o.key ? { 'data-tip-key': o.key } : {}) },
    on: { click: o.onClick },
  }, ...icons.map((n) => icon(n)));
}

// ---------------------------------------------------------------- placing what drops from a button

const EDGE = 4;
const DROP_GAP = 4;

/** The size an element has when it shows, measured while it is hidden (a closed popover lays out for a moment, unseen). */
function sizeOf(el: HTMLElement): { w: number; h: number } {
  if (el.matches(':popover-open')) return { w: el.offsetWidth, h: el.offsetHeight };
  el.style.display = 'block';
  el.style.visibility = 'hidden';
  const s = { w: el.offsetWidth, h: el.offsetHeight };
  el.style.removeProperty('display');
  el.style.removeProperty('visibility');
  return s;
}

/**
 * Put a menu or a popover below the button that opens it, their left edges lined up; their right edges lined up when it
 * would go past the window's right edge; above the button when there is no room below; always inside the window.
 */
export function placeBelow(el: HTMLElement, opener: Element): void {
  const r = opener.getBoundingClientRect(), { w, h: hh } = sizeOf(el);
  let top = r.bottom + DROP_GAP;
  if (top + hh > window.innerHeight - EDGE && r.top - DROP_GAP - hh >= EDGE) top = r.top - DROP_GAP - hh;
  let left = r.left;
  if (left + w > window.innerWidth - EDGE) left = r.right - w;
  el.style.left = `${Math.round(Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - w)))}px`;
  el.style.top = `${Math.round(Math.max(EDGE, Math.min(top, window.innerHeight - EDGE - hh)))}px`;
}

/** Put a menu at a point (a right-click): its corner on the point, turned left or up where it would leave the window. */
function placeAt(el: HTMLElement, x: number, y: number): void {
  const { w, h: hh } = sizeOf(el);
  const left = x + w > window.innerWidth - EDGE ? x - w : x;
  const top = y + hh > window.innerHeight - EDGE ? y - hh : y;
  el.style.left = `${Math.round(Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - w)))}px`;
  el.style.top = `${Math.round(Math.max(EDGE, Math.min(top, window.innerHeight - EDGE - hh)))}px`;
}

// ---------------------------------------------------------------- menus (docs/ui-redesign.md 6.10)

/** A row of a menu: a command, a setting that is on or off, or one of a set of choices. */
export interface MenuItem {
  label: string;
  /** A 16 px icon from icons.ts, or an element of its own (a faction's marking). */
  icon?: IconName | (() => Element);
  /** Muted on the right: what the choice changes, or an element of its own (a team colour's dot). */
  description?: string | (() => Element);
  /** The key as the row shows it ("Ctrl+S"), and as aria-keyshortcuts says it ("Control+S"). */
  shortcut?: string;
  ariaKeys?: string;
  /** A setting that is on or off: a menuitemcheckbox, with a check in place of its icon while it is on. */
  checked?: () => boolean;
  /** One of a set of choices: a menuitemradio, with a dot before the chosen one. */
  chosen?: () => boolean;
  disabled?: () => boolean;
  /** The name help.ts knows the row by, when it is not its label. */
  helpLabel?: string;
  /** The name the file uses for this choice, when it is not its label: the last line of the row's tooltip ("In the file: band"). */
  file?: string;
  action(): void;
}
/** A 1 px line between rows; or a heading over the rows after it (up to the next line or heading), which make a group. */
export type MenuEntry = MenuItem | 'divider' | { heading: string; helpLabel?: string };

export interface MenuView {
  el: HTMLElement;
  isOpen(): boolean;
  /** Open it below its button (or, with none, where it was last opened at a point). */
  open(): void;
  /** Open it at a point, such as where the pointer was right-clicked, inside the window; the focus goes back on Esc. */
  openAt(x: number, y: number): void;
  /**
   * Open it below another button, such as a row's More button (one menu serves every row): the button says it is open
   * (aria-expanded), the focus goes back to it, and its second click closes the menu again.
   */
  openBelow(button: HTMLElement): void;
  /** Close it; with returnFocus, the keyboard focus goes back to the button that opens it (or to where it was). */
  close(returnFocus?: boolean): void;
}

/** How long typed letters count as one word for type-ahead. */
const TYPE_AHEAD_MS = 700;

/**
 * A menu: the main menu, a chip's choices and, from a point, a right-click menu (openAt, or contextMenu below). It is a
 * popover (auto), appended to document.body, so no bar clips it; its button is the declared invoker, so a second click
 * closes it and a click outside it closes it too. It opens below the button (placeBelow), with the focus on its chosen row
 * or else its first.
 * Rows: a 16 px icon, the label, and on the right a muted description or shortcut. A check marks a setting that is on, a
 * dot the chosen one of a set; 1 px lines and headings divide them. An optional header over the rows names the setting;
 * an optional footer line under them says more.
 * Keys: ↑ and ↓ move between the rows (round from the last to the first), Home and End go to the ends, Enter and Space
 * choose, a letter goes to the next row whose label starts with it (letters typed quickly spell a word), Esc and Tab close
 * it and give the focus back. With rowKeys, a row whose shortcut is one key (View's 1, 2 and 3) is chosen by that key. Keys
 * pressed in it are its own (the editor's shortcuts skip a .menu, and wait while one is open).
 * Each row has data-help-label (its words without the shortcut, or helpLabel), so its tooltip, beside the menu, gives its
 * help text; the header and the headings have one too.
 */
export function menu(o: {
  id: string; label: string; items: MenuEntry[];
  /** The button that opens it. Without one, it opens at a point (openAt). */
  opener?: HTMLButtonElement;
  /** A header over the rows, naming the setting. */
  title?: string;
  /** A muted line under the rows. */
  footer?: string;
  helpSection?: string;
  rowKeys?: boolean;
}): MenuView {
  const el = h('div', { class: 'menu', attrs: { id: o.id, popover: 'auto', role: 'menu', 'aria-label': o.label, 'data-tip-beside': '', ...(o.helpSection ? { 'data-help-section': o.helpSection } : {}) } });
  const items = o.items.filter((e): e is MenuItem => typeof e === 'object' && 'action' in e);
  const marks = items.some((i) => !!i.chosen);
  const icons = items.some((i) => !!i.icon || !!i.checked);
  if (marks) el.classList.add('has-marks');
  // The header names the setting for the eye; the menu's own name (aria-label) says it to a screen reader.
  if (o.title) el.append(h('div', { class: 'menu-title', attrs: { 'aria-hidden': 'true', 'data-help-label': o.title }, text: o.title }));
  const rows: { item: MenuItem; btn: HTMLButtonElement }[] = [];
  let group: HTMLElement = el;
  let headings = 0;
  for (const entry of o.items) {
    if (entry === 'divider') { el.append(h('div', { class: 'menu-divider', attrs: { role: 'separator' } })); group = el; continue; }
    if ('heading' in entry) {
      const id = `${o.id}-heading-${++headings}`;
      group = h('div', { class: 'menu-group', attrs: { role: 'group', 'aria-labelledby': id } },
        h('div', { class: 'menu-heading', attrs: { id, 'data-help-label': entry.helpLabel ?? entry.heading }, text: entry.heading }));
      el.append(group);
      continue;
    }
    const item = entry;
    const role = item.checked ? 'menuitemcheckbox' : item.chosen ? 'menuitemradio' : 'menuitem';
    const glyph = item.checked ? icon('check') : typeof item.icon === 'function' ? item.icon() : item.icon ? icon(item.icon) : null;
    const desc = typeof item.description === 'function' ? item.description() : item.description ? h('span', { class: 'menu-desc', text: item.description }) : null;
    const btn = h('button', {
      class: 'menu-item',
      attrs: { type: 'button', role, tabindex: '-1', 'data-help-label': item.helpLabel ?? item.label, ...(item.ariaKeys ? { 'aria-keyshortcuts': item.ariaKeys } : {}), ...(item.file ? { 'data-tip-file': item.file } : {}) },
      on: { click: () => { close(true); item.action(); } },
    },
    marks ? h('span', { class: 'menu-mark', attrs: { 'aria-hidden': 'true' } }) : null,
    icons ? h('span', { class: 'menu-icon' }, glyph) : null,
    h('span', { class: 'menu-label', text: item.label }),
    desc ? h('span', { class: 'menu-right' }, desc) : null,
    item.shortcut ? h('kbd', { class: 'menu-key', attrs: { 'aria-hidden': 'true' }, text: item.shortcut }) : null);
    rows.push({ item, btn });
    group.append(btn);
  }
  if (o.footer) {
    el.append(h('div', { class: 'menu-foot', attrs: { id: `${o.id}-foot` }, text: o.footer }));
    el.setAttribute('aria-describedby', `${o.id}-foot`);
  }
  const enabled = () => rows.map((r) => r.btn).filter((b) => !b.disabled);
  const states = () => {
    for (const { item, btn } of rows) {
      btn.disabled = item.disabled?.() ?? false;
      if (item.checked) btn.setAttribute('aria-checked', String(item.checked()));
      if (item.chosen) btn.setAttribute('aria-checked', String(item.chosen()));
    }
  };
  /** The row the focus starts on: the chosen one of a set, or the first. */
  const first = () => { const list = enabled(); return list.find((b) => b.getAttribute('role') === 'menuitemradio' && b.getAttribute('aria-checked') === 'true') ?? list[0]; };
  const isOpen = () => el.matches(':popover-open');
  /** Where it was opened at a point (and where the focus was then), or null when its button opened it. */
  let at: { x: number; y: number; back: HTMLElement | null } | null = null;
  /** The caller's button it was opened below (openBelow), or null. */
  let below: HTMLElement | null = null;
  /** The letters typed for type-ahead, and when the last came: a word while they come quickly, from the menu's opening. */
  let typed = '', typedAt = -Infinity;
  const back = () => (at ? at.back : below ?? o.opener ?? null);
  /**
   * A button of openBelow pressed while the menu was open below it: the press closes the menu (a click outside closes a
   * popover), so the click that follows must not open it again. When the browser closed it (on the press or on its
   * release), and the button and time of the last such close, tell it.
   */
  const wired = new WeakSet<HTMLElement>();
  let pressedOpen: { button: HTMLElement; at: number } | null = null;
  let shut: { button: HTMLElement; at: number } | null = null;
  // The focus goes back before the menu hides. Hidden with the focus still in it, the browser gives the focus back itself,
  // in the middle of hiding, where no popover can open: the tooltip that Tab shows at once threw there.
  // With nowhere to give the focus back to (a right-click menu opened while nothing had the focus), it leaves the menu all
  // the same: kept on a hidden row until the next frame, a key pressed at once still reached that row (Space renamed).
  const close = (returnFocus = false) => {
    const to = back();
    if (returnFocus && to?.isConnected) to.focus({ preventScroll: true });
    if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
    if (isOpen()) el.hidePopover();
  };
  const open = () => { if (!isOpen()) el.showPopover(); };
  const openAt = (x: number, y: number) => {
    if (isOpen()) el.hidePopover();
    below = null;
    at = { x, y, back: document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null };
    el.showPopover();
  };
  const openBelow = (button: HTMLElement) => {
    if (!wired.has(button)) {
      wired.add(button);
      button.addEventListener('pointerdown', () => {
        const now = performance.now();
        const open = (isOpen() && below === button) || (shut?.button === button && now - shut.at < 100);
        pressedOpen = open ? { button, at: now } : null;
      }, true);
      // As for the menu's own button: a key pressed here while the menu is open below it, before the focus went in, is the
      // menu's.
      button.addEventListener('keydown', (e) => {
        if (!isOpen() || below !== button || e.key === 'Enter' || e.key === ' ' || MODIFIER_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
        const from = first();
        if (!from) return;
        from.focus({ preventScroll: true });
        onKey(e);
      });
    }
    // Its second click: the press closed the menu already, so it stays closed.
    if (pressedOpen?.button === button && performance.now() - pressedOpen.at < 1500) { pressedOpen = null; return; }
    pressedOpen = null;
    if (isOpen()) el.hidePopover();
    at = null;
    below = button;
    el.showPopover();
  };
  if (o.opener) {
    o.opener.setAttribute('aria-haspopup', 'menu');
    o.opener.setAttribute('aria-expanded', 'false');
    o.opener.setAttribute('aria-controls', o.id);
    o.opener.popoverTargetElement = el;
  }
  // beforetoggle comes at once (toggle comes later, as a task): the button says open or closed as soon as it is, and the
  // menu is in its place before it is first drawn.
  /** The focus into the menu, once it shows (not again if it is in already: a key may have moved it on). */
  const focusIn = () => { if (isOpen() && !el.contains(document.activeElement)) first()?.focus({ preventScroll: true }); };
  el.addEventListener('beforetoggle', (e) => {
    const opening = (e as ToggleEvent).newState === 'open';
    o.opener?.setAttribute('aria-expanded', String(opening && !at && !below));
    below?.setAttribute('aria-expanded', String(opening));
    typed = '';
    if (!opening) {
      if (below) shut = { button: below, at: performance.now() };
      return;
    }
    states();
    if (at) placeAt(el, at.x, at.y);
    else if (below) placeBelow(el, below);
    else if (o.opener) placeBelow(el, o.opener);
    // It shows once this event is over; the toggle event comes only with the next frame.
    setTimeout(focusIn);
  });
  el.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState === 'open') focusIn();
    else {
      // Closed with the focus still in it (it went away under the focus): the button takes it back.
      if (el.contains(document.activeElement)) back()?.focus({ preventScroll: true });
      at = null;
      below = null;
    }
  });
  // A key pressed on the button while its menu is open, before the focus went into the menu, is the menu's: from its
  // chosen (or first) row. Enter and Space stay the button's (Enter closes the menu again, Space plays or pauses).
  o.opener?.addEventListener('keydown', (e) => {
    if (!isOpen() || e.key === 'Enter' || e.key === ' ' || MODIFIER_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    const from = first();
    if (!from) return;
    from.focus({ preventScroll: true });
    onKey(e);
  });
  const labelOf = (b: HTMLButtonElement) => (b.querySelector('.menu-label')?.textContent ?? '').toLowerCase();
  const onKey = (e: KeyboardEvent) => {
    const list = enabled();
    const now = list.indexOf(document.activeElement as HTMLButtonElement);
    // A move by the keys starts the type-ahead's word afresh.
    const go = (i: number) => { typed = ''; const n = list.length; if (n) list[((i % n) + n) % n]!.focus({ preventScroll: true }); };
    let handled = true;
    if (e.key === 'ArrowDown') go(now + 1);
    else if (e.key === 'ArrowUp') go(now < 0 ? -1 : now - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Escape' || e.key === 'Tab') close(true);
    else if (e.key === 'Enter' || e.key === ' ') { if (now >= 0) list[now]!.click(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const keyed = o.rowKeys ? rows.find((r) => r.item.shortcut === e.key && !r.btn.disabled) : undefined;
      if (keyed) keyed.btn.click();
      else {
        // Type-ahead: the next row whose label starts with the letter (pressed again: the one after); letters typed
        // quickly spell the start of a label.
        const t = performance.now();
        typed = t - typedAt > TYPE_AHEAD_MS ? e.key.toLowerCase() : typed + e.key.toLowerCase();
        typedAt = t;
        const one = [...typed].every((c) => c === typed[0]);
        const n = list.length;
        for (let k = one ? 1 : 0; k <= n; k++) {
          const b = list[(((one ? now : Math.max(now, 0)) + k) % n + n) % n];
          if (b && labelOf(b).startsWith(one ? typed[0]! : typed)) { b.focus({ preventScroll: true }); break; }
        }
      }
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };
  el.addEventListener('keydown', onKey);
  // A menu taller than the window scrolls (style.css), and every move of the focus above prevents scrolling: the row that
  // takes the focus is scrolled into view, as little as needed.
  el.addEventListener('focusin', (e) => {
    const row = (e.target as Element).closest?.('.menu-item');
    if (row && el.scrollHeight > el.clientHeight) scrollNearest(el, row);
  });
  // The row under the pointer takes the focus, so the keys carry on from where the mouse is.
  el.addEventListener('pointermove', (e) => {
    const b = (e.target as Element).closest?.('.menu-item') as HTMLButtonElement | null;
    if (b && !b.disabled && document.activeElement !== b) b.focus({ preventScroll: true });
  });
  document.body.append(el);
  return { el, isOpen, open, openAt, openBelow, close };
}

/**
 * A right-click on `target` (or its context-menu key) opens the menu at the pointer, inside the window. The rows of the
 * lists share one menu each: `prepare` says which row was right-clicked (and gets the menu ready for it), or null where
 * there is no row, which leaves the browser's own menu.
 */
export function contextMenu(target: HTMLElement, view: MenuView, prepare?: (e: MouseEvent) => HTMLElement | null): void {
  target.addEventListener('contextmenu', (e) => {
    const row = prepare ? prepare(e) : target;
    if (!row) return;
    e.preventDefault();
    // From the keyboard there is no pointer: at the row's lower left corner.
    if (e.clientX === 0 && e.clientY === 0) { const r = row.getBoundingClientRect(); view.openAt(r.left + 8, r.bottom); return; }
    const x = e.clientX, y = e.clientY;
    // The button still down (Linux and macOS ask for the menu on the press): open it once the button is let go. Opened on the
    // press, the browser closes it again at once when the pointer is not over it (it is, moved in near a corner).
    if (e.buttons & 2) document.addEventListener('pointerup', () => setTimeout(() => view.openAt(x, y)), { capture: true, once: true });
    else view.openAt(x, y);
  });
}

// ---------------------------------------------------------------- chips (docs/ui-redesign.md 6.3)

export interface ChipView {
  el: HTMLButtonElement;
  /** Show another value (and icon). */
  set(value: string, glyph?: IconName | Element): void;
}

/**
 * A chip: a 24 px button on the field colour with an icon, the current value and a chevron. It opens a menu or a small
 * popover (the caller declares it: menu() sets aria-haspopup and aria-expanded). Its tooltip is the setting's name (the
 * label) and that name's help text; a value cut short shows whole first. Its name for screen readers is "label: value".
 * `extra` sits between the value and the chevron (the View chip's scale).
 */
export function chip(o: { label: string; icon: IconName | Element; value: string; className?: string; extra?: HTMLElement }): ChipView {
  const glyphBox = h('span', { class: 'chip-icon' });
  const value = h('span', { class: 'chip-value' });
  const chev = icon('chevron-down');
  chev.classList.add('chip-chev');
  const el = h('button', { class: o.className ? `chip-btn ${o.className}` : 'chip-btn', attrs: { type: 'button', 'data-tip': o.label, 'data-help-label': o.label } },
    glyphBox, value, o.extra ?? null, chev);
  const set = (v: string, glyph?: IconName | Element) => {
    if (value.textContent !== v) value.textContent = v;
    el.setAttribute('aria-label', `${o.label}: ${v}`);
    if (glyph !== undefined) glyphBox.replaceChildren(typeof glyph === 'string' ? icon(glyph) : glyph);
  };
  set(o.value, o.icon);
  return { el, set };
}

// ---------------------------------------------------------------- numbers you drag or type (docs/ui-redesign.md 6.6, 8)

/** A number as typed: a decimal point or a comma ("0.5", "0,5"); null when it is not a number. */
export function parseDecimal(text: string): number | null {
  const s = text.trim().replace(/\s+/g, '');
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return null;
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/** How far a drag goes: px moved (each px with Shift held counts 10 times) in steps of `step` per `pxPerStep`. */
export function dragSteps(px: number, pxPerStep: number): number {
  return Math.trunc(px / pxPerStep);
}

/** A value kept within its limits and rounded to its decimals (no 4.300000000000001). */
export function fitValue(v: number, o: { min?: number; max?: number; digits: number }): number {
  const lo = o.min ?? -Infinity, hi = o.max ?? Infinity;
  const k = 10 ** o.digits;
  return Math.min(hi, Math.max(lo, Math.round(v * k) / k));
}

/**
 * Drag sideways to change a number: `step` for every `pxPerStep` px the pointer moves, ten times that while Shift is held.
 * A press that does not move is a click, and is left alone (its click goes on); after a drag, the click that follows
 * does nothing. onInput follows the drag; onCommit comes when it ends.
 * The drag follows the pointer on the window, so it goes on when its handle goes away under it: a change that adds or
 * takes away a part of the layer builds the right panel again (a first nudge adds shiftM), and the drag still ends with
 * its commit. While it lasts, the page shows the drag's cursor (the class scrubbing on the root).
 */
export function scrubDrag(handle: HTMLElement, o: {
  step: number; pxPerStep?: number; get(): number; set(v: number): void; onCommit?(): void;
}): void {
  const per = o.pxPerStep ?? 4;
  let from: { x: number; value: number; units: number; last: number; id: number; moved: boolean } | null = null;
  let dragged = false;
  const move = (e: PointerEvent) => {
    if (!from || e.pointerId !== from.id) return;
    from.units += (e.clientX - from.last) * (e.shiftKey ? 10 : 1);
    from.last = e.clientX;
    if (!from.moved && Math.abs(e.clientX - from.x) < 3) return;
    if (!from.moved) { from.moved = true; handle.classList.add('scrubbing'); document.documentElement.classList.add('scrubbing'); }
    o.set(from.value + dragSteps(from.units, per) * o.step);
  };
  const end = (e: PointerEvent) => {
    if (!from || e.pointerId !== from.id) return;
    const moved = from.moved;
    from = null;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    handle.classList.remove('scrubbing');
    document.documentElement.classList.remove('scrubbing');
    if (moved) { dragged = true; o.onCommit?.(); }
  };
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragged = false;
    from = { x: e.clientX, value: o.get(), units: 0, last: e.clientX, id: e.pointerId, moved: false };
    handle.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  });
  // The click after a drag: not a click (it would open the chip's popover, or focus a label's box).
  handle.addEventListener('click', (e) => { if (dragged) { dragged = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}

/**
 * A number field you drag or type: drag its prefix (or the handles given) sideways to change the number, or type it; a
 * typed comma works as the decimal point ("0,5" or "0.5"). The value sits right, the unit inside the field as a muted
 * suffix. ↑ and ↓ step it (Shift: ten steps). Enter or leaving the box sets what was typed; Esc puts the number back.
 * onInput comes with each change; onCommit when a drag, a press of ↑ or ↓, or typing ends. The input keeps the num class.
 * `digits` decimals are shown and kept (a typed or dragged number is rounded to them); with `trim`, the zeros at the end are
 * left out. A drag stays within dragMin and dragMax as well as min and max (a slider's ends). Nothing is told when the
 * number does not change: Tab through the box, or Enter on what it shows, changes nothing, so a value in the file with
 * more decimals than the box shows is kept as it is.
 * A number set from outside past a limit (the target dragged further than the Distance slider goes) shows as it is, so the
 * box says what the chip says; the keys, a drag and typing still start from the number within the limits, as before.
 */
export function scrubNumber(o: {
  label: string; value: number; step: number; digits: number; trim?: boolean; min?: number; max?: number; dragMin?: number; dragMax?: number;
  unit?: string; prefix?: string; pxPerStep?: number; onInput(v: number): void; onCommit?(): void;
}): Control<number> & { input: HTMLInputElement; dragFrom(handle: HTMLElement): void } {
  /** The number within the limits, which the keys, a drag and typing start from. */
  let value = fitValue(o.value, o);
  /** The number the box shows: the value, or what was set from outside past a limit. */
  let shown = fitValue(o.value, { digits: o.digits });
  // A spin button for screen readers, as the number boxes were: ↑ and ↓ step it; its number and limits are said with it.
  const input = h('input', { class: 'num scrub-input', attrs: { type: 'text', role: 'spinbutton', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off', 'aria-label': o.label,
    ...(o.min !== undefined ? { 'aria-valuemin': String(o.min) } : {}), ...(o.max !== undefined ? { 'aria-valuemax': String(o.max) } : {}) } });
  const text = () => formatNumber(shown, o.digits, o.trim);
  /** What code last wrote in the box. While the box still holds it, nothing was typed since. */
  let written = '';
  const write = () => {
    const all = document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value !== '';
    input.value = written = text();
    input.setAttribute('aria-valuenow', String(shown));
    if (all) input.select();
  };
  /**
   * The number shown again: always while the box does not have the focus, and while it has it as long as nothing was typed
   * in it. So an undo pressed in the box shows at once, and leaving the box afterwards writes nothing back.
   */
  const show = () => { if (document.activeElement !== input || input.value === written) write(); };
  const change = (v: number, limits: { min?: number; max?: number } = o) => {
    const next = fitValue(v, { min: limits.min, max: limits.max, digits: o.digits });
    if (next === value) return;
    value = shown = next;
    show();
    o.onInput(value);
  };
  /** A drag also stays within dragMin and dragMax (inside min and max, which always count). */
  const dragLimits = { min: Math.max(o.dragMin ?? -Infinity, o.min ?? -Infinity), max: Math.min(o.dragMax ?? Infinity, o.max ?? Infinity) };
  /** The number typed; while the box still holds the number it shows (nothing typed), the number within the limits. */
  const typed = () => (input.value === written || input.value === text() ? value : parseDecimal(input.value));
  const prefix = o.prefix ? h('span', { class: 'scrub-prefix', attrs: { 'aria-hidden': 'true' }, text: o.prefix }) : null;
  const el = h('span', { class: 'scrub' }, prefix, input, o.unit ? h('span', { class: 'unit', attrs: { 'aria-hidden': 'true' }, text: o.unit }) : null);
  const dragFrom = (handle: HTMLElement) => {
    handle.classList.add('scrub-handle');
    scrubDrag(handle, { step: o.step, pxPerStep: o.pxPerStep, get: () => value, set: (v) => change(v, dragLimits), onCommit: () => o.onCommit?.() });
  };
  if (prefix) dragFrom(prefix);
  const typedValue = () => {
    const v = typed();
    if (v === null) { write(); return; }
    change(v);
    write();
    o.onCommit?.();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); typedValue(); input.select(); }
    else if (e.key === 'Escape' && input.value !== written) { e.preventDefault(); e.stopPropagation(); write(); input.select(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      change((typed() ?? value) + (e.key === 'ArrowUp' ? 1 : -1) * o.step * (e.shiftKey ? 10 : 1));
      write();
      input.select();
      // Each press is one step to undo, as a number box's arrow keys were.
      o.onCommit?.();
    }
  });
  input.addEventListener('change', typedValue);
  input.addEventListener('focus', () => input.select());
  const set = (v: number) => { value = fitValue(v, o); shown = fitValue(v, { digits: o.digits }); show(); };
  show();
  return { el, set, input, dragFrom };
}

/**
 * A number that may be left empty (a word's chance: an empty box shares what is left). Type it ("12,5" or "12.5"), or step
 * it with ↑ and ↓ (Shift: ten steps; from an empty box, from the number its placeholder shows); Enter or leaving the box sets
 * what was typed, an empty box clears the number, Esc puts back what it was. Each change is told once (`onChange`): Tab
 * through the box, or Enter on what it shows, tells nothing, so a number with more decimals than the box shows is kept.
 * Rounded to `digits` (shown without the zeros at the end) and kept within min and max. The input keeps the num class;
 * the unit sits inside the box, muted, as a number box's does. An undo while the box has the focus shows in it at once,
 * unless something was typed in it.
 */
export function optionalNumber(o: {
  label: string; value: number | undefined; step: number; digits: number; min?: number; max?: number; unit?: string; onChange(v: number | undefined): void;
}): { el: HTMLElement; input: HTMLInputElement; set(v: number | undefined, placeholder?: string): void } {
  const input = h('input', { class: 'num', attrs: { type: 'text', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off', 'aria-label': o.label,
    ...(o.min !== undefined ? { 'aria-valuemin': String(o.min) } : {}), ...(o.max !== undefined ? { 'aria-valuemax': String(o.max) } : {}) } });
  let value = o.value;
  /** What code last wrote in the box. While the box still holds it, nothing was typed since. */
  let written = '';
  const text = () => (value === undefined ? '' : formatNumber(value, o.digits, true));
  const write = () => {
    input.value = written = text();
    if (value === undefined) input.removeAttribute('aria-valuenow'); else input.setAttribute('aria-valuenow', String(value));
  };
  const show = () => { if (document.activeElement !== input || input.value === written) write(); };
  /** What was typed: the number (undefined for an empty box), the number as it is when nothing was typed, or null for words. */
  const typed = (): { v: number | undefined } | null => {
    if (input.value === written) return { v: value };
    const s = input.value.trim();
    if (!s) return { v: undefined };
    const n = parseDecimal(s);
    return n === null ? null : { v: n };
  };
  const commit = (v: number | undefined) => {
    const next = v === undefined ? undefined : fitValue(v, { min: o.min, max: o.max, digits: o.digits });
    if (next === value) { write(); return; }
    value = next;
    write();
    o.onChange(value);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const t = typed(); if (t) commit(t.v); else write(); input.select(); }
    else if (e.key === 'Escape' && input.value !== written) { e.preventDefault(); e.stopPropagation(); write(); input.select(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const from = typed()?.v ?? value ?? parseDecimal(input.placeholder) ?? 0;
      commit(from + (e.key === 'ArrowUp' ? 1 : -1) * o.step * (e.shiftKey ? 10 : 1));
      input.select();
    }
  });
  input.addEventListener('change', () => { const t = typed(); if (t) commit(t.v); else write(); });
  input.addEventListener('focus', () => input.select());
  const set = (v: number | undefined, placeholder?: string) => {
    value = v;
    if (placeholder !== undefined && input.placeholder !== placeholder) input.placeholder = placeholder;
    show();
  };
  write();
  const el = h('span', { class: 'scrub optional-num' }, input, o.unit ? h('span', { class: 'unit', attrs: { 'aria-hidden': 'true' }, text: o.unit }) : null);
  return { el, input, set };
}

// ---------------------------------------------------------------- the lists' parts (docs/ui-redesign.md 6.2)

/**
 * A search box: the search icon inside, a placeholder, no edge at rest. onInput comes with each change. Esc clears it (and
 * says so with onInput); Esc in an empty box gives the keyboard back to the editor (the box lets go of the focus). Keys
 * typed in it are its own: the editor's shortcuts wait while you type.
 */
export function searchField(o: { label: string; placeholder: string; className?: string; onInput(q: string): void }): { el: HTMLElement; input: HTMLInputElement; set(q: string): void } {
  const input = h('input', {
    class: 'search-input',
    attrs: { type: 'search', placeholder: o.placeholder, 'aria-label': o.label, 'data-help-label': o.label, spellcheck: 'false', autocomplete: 'off', enterkeyhint: 'search' },
  });
  input.addEventListener('input', () => o.onInput(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Only the innermost thing: clear the search, or else let go of the box. Never also the editor's Esc (leave the layer).
    e.preventDefault();
    e.stopPropagation();
    if (input.value) { input.value = ''; o.onInput(''); } else input.blur();
  });
  const el = h('label', { class: o.className ? `search ${o.className}` : 'search' }, icon('search'), input);
  const set = (q: string) => { if (input.value !== q) input.value = q; };
  return { el, input, set };
}

/** The pointer is pressed now (a rename box that loses the focus to a press waits for its click). */
let pointerIsDown = false;
let pointerWatch = false;
function watchPointer(): void {
  if (pointerWatch) return;
  pointerWatch = true;
  document.addEventListener('pointerdown', () => { pointerIsDown = true; }, true);
  for (const t of ['pointerup', 'pointercancel'] as const) document.addEventListener(t, () => { pointerIsDown = false; }, true);
}

export interface RenameBox {
  el: HTMLInputElement;
  /** Forget it without an answer (its row is being built again; the new row gets a new box). */
  dispose(): void;
}

/**
 * A box to rename something in place, in its row: Enter keeps the name typed, Esc keeps the old one. A click elsewhere
 * keeps the name typed too: it is kept when that click comes, before the click does what it does (the row clicked is
 * selected, even though the list is built again for the new name). Tab keeps it as well; the window losing the focus does
 * not end it. onEnd gets the text (or null for Esc) and how it ended ('key': Enter or Esc, so the focus can go back to the
 * row; 'elsewhere': the focus went where the user put it). Space, Delete, Backspace and the arrow keys only type in it.
 */
export function renameBox(o: { value: string; label: string; maxLength: number; onEnd(text: string | null, how: 'key' | 'elsewhere'): void }): RenameBox {
  watchPointer();
  const input = h('input', { class: 'text rename', attrs: { type: 'text', 'aria-label': o.label, spellcheck: 'false', autocomplete: 'off', maxlength: String(Math.max(1, o.maxLength)) } });
  input.value = o.value;
  let done = false;
  /** A press elsewhere took the focus: the name is kept when its click comes, even when the row is built again before. */
  let waiting = false;
  const end = (text: string | null, how: 'key' | 'elsewhere') => {
    if (done) return;
    done = true;
    o.onEnd(text, how);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); end(input.value, 'key'); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(null, 'key'); }
  });
  input.addEventListener('blur', () => {
    // The window lost the focus (another program): the box keeps it, and gets it back with the window.
    if (done || !document.hasFocus()) return;
    if (!pointerIsDown) { end(input.value, 'elsewhere'); return; }
    // A press elsewhere: keep the name when its click comes (before the click's own work), or once it is let go.
    waiting = true;
    const keep = () => { waiting = false; end(input.value, 'elsewhere'); };
    document.addEventListener('click', keep, { capture: true, once: true });
    document.addEventListener('pointerup', () => setTimeout(() => { document.removeEventListener('click', keep, true); keep(); }), { capture: true, once: true });
  });
  return { el: input, dispose: () => { if (!waiting) done = true; } };
}

/** How far the pointer must move, in px, before a press on a row becomes a drag (less is a click). */
export const DRAG_START_PX = 4;

export interface ReorderView {
  /** A row is being dragged now. */
  dragging(): boolean;
}

/**
 * Drag a list's rows to put them in another order (docs/ui-redesign.md 6.2). A press on a row that moves DRAG_START_PX or
 * more becomes a drag (less stays a click, which goes on as a click); a 2 px line in --accent-ink shows where the row will
 * land (none where it would land in its own place), and near the list's top or bottom edge the list scrolls. Letting go
 * moves the row there (onDrop, once); Esc cancels the drag and nothing moves, and the Esc goes no further (the editor's Esc
 * would leave the layer); letting go of the button after that is not a click on a row. The list takes the pointer only once
 * the press is a drag, so a click still lands on its row. Rows are found again at each step by their keys: the list may be
 * built again meanwhile.
 */
export function reorderDrag(list: HTMLElement, o: {
  /** The row a press there may drag, or null (the row's buttons, a box). */
  rowOf(target: Element): HTMLElement | null;
  /** The rows, in the order shown. */
  rows(): HTMLElement[];
  keyOf(row: HTMLElement): string;
  onStart?(key: string): void;
  /** The row moved from one place to another, in the order shown (0 is the top). */
  onDrop(key: string, from: number, to: number): void;
  onEnd?(): void;
}): ReorderView {
  let press: { key: string; x: number; y: number; id: number } | null = null;
  let drag: { key: string; id: number; gap: number } | null = null;
  let pointerY = 0, frame = 0;
  const line = h('div', { class: 'drop-line', attrs: { 'aria-hidden': 'true' } });
  /** The gap the pointer is over: before row i (i from 0), or after the last row. */
  const gapAt = (y: number) => {
    const rows = o.rows();
    for (let i = 0; i < rows.length; i++) { const r = rows[i]!.getBoundingClientRect(); if (y < r.top + r.height / 2) return i; }
    return rows.length;
  };
  const showLine = () => {
    if (!drag) return;
    const rows = o.rows(), from = rows.findIndex((r) => o.keyOf(r) === drag!.key), g = drag.gap;
    if (from < 0 || g === from || g === from + 1 || !rows.length) { line.remove(); return; }
    const top = g < rows.length ? rows[g]!.offsetTop : rows[rows.length - 1]!.offsetTop + rows[rows.length - 1]!.offsetHeight;
    line.style.top = `${top - 1}px`;
    if (line.parentElement !== list) list.append(line);
  };
  /** Near the list's top or bottom edge, the list scrolls (and the landing place follows) while the pointer stays there. */
  const scrollNearEdge = () => {
    cancelAnimationFrame(frame);
    const step = () => {
      if (!drag) return;
      const r = list.getBoundingClientRect(), edge = 24;
      const v = pointerY < r.top + edge ? -6 : pointerY > r.bottom - edge ? 6 : 0;
      const was = list.scrollTop;
      if (v) list.scrollTop += v;
      if (list.scrollTop === was) return;
      drag.gap = gapAt(pointerY);
      showLine();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  /** Esc cancelled a drag with the button still down: the click that letting it go makes is not a click on a row. */
  let cancelled = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    cancelled = true;
    // That click comes with the pointerup, before anything set up then runs; a new press starts afresh too.
    window.addEventListener('pointerup', () => setTimeout(() => { cancelled = false; }), { capture: true, once: true });
    finish(false);
  };
  list.addEventListener('click', (e) => { if (cancelled) { cancelled = false; e.stopPropagation(); } }, true);
  const finish = (drop: boolean) => {
    const d = drag;
    press = null;
    if (!d) return;
    drag = null;
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKey, true);
    line.remove();
    list.classList.remove('reordering');
    if (list.hasPointerCapture(d.id)) list.releasePointerCapture(d.id);
    o.onEnd?.();
    if (!drop) return;
    const from = o.rows().findIndex((r) => o.keyOf(r) === d.key);
    if (from < 0 || d.gap < 0) return;
    const to = d.gap > from ? d.gap - 1 : d.gap;
    if (to !== from) o.onDrop(d.key, from, to);
  };
  list.addEventListener('pointerdown', (e) => {
    cancelled = false;
    if (e.button !== 0 || !e.isPrimary || drag) return;
    const row = o.rowOf(e.target as Element);
    press = row ? { key: o.keyOf(row), x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  });
  list.addEventListener('pointermove', (e) => {
    if (press && !drag && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_START_PX) {
      drag = { key: press.key, id: press.id, gap: -1 };
      press = null;
      list.setPointerCapture(e.pointerId);
      list.classList.add('reordering');
      window.addEventListener('keydown', onKey, true);
      o.onStart?.(drag.key);
    }
    if (!drag || e.pointerId !== drag.id) return;
    pointerY = e.clientY;
    drag.gap = gapAt(e.clientY);
    showLine();
    scrollNearEdge();
  });
  list.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) finish(true); else press = null; });
  list.addEventListener('pointercancel', () => finish(false));
  list.addEventListener('lostpointercapture', () => { if (drag) finish(false); });
  return { dragging: () => !!drag };
}

/**
 * Scroll a list so that one of its rows shows, as little as needed (block: 'nearest'), and nothing round the list. The
 * list's scroll padding counts, as it does for scrollIntoView: a row stops below what stays at the top of the list (the
 * timeline's ruler and phase strip).
 */
export function scrollNearest(list: HTMLElement, row: Element): void {
  const c = list.getBoundingClientRect(), r = row.getBoundingClientRect(), s = getComputedStyle(list);
  const top = c.top + (parseFloat(s.scrollPaddingTop) || 0), bottom = c.bottom - (parseFloat(s.scrollPaddingBottom) || 0);
  if (r.top < top) list.scrollTop -= top - r.top;
  else if (r.bottom > bottom) list.scrollTop += Math.min(r.bottom - bottom, r.top - top);
}

// ---------------------------------------------------------------- splitters (docs/ui-redesign.md 5.2)

export interface SplitterView {
  el: HTMLElement;
  /** The size it sets now, and the sizes it can set, in px (for screen readers). */
  setValue(now: number, min: number, max: number): void;
}

/**
 * A splitter: a 6 px grab strip over the 1 px line between two zones (the line is the zone's own; while the splitter has
 * the focus or is dragged, its own line in the focus colour covers it). Drag it, or move it with the arrow keys (16 px a
 * press; Home and End: its limits); a double-click puts the size back to its default. The sizes themselves are the caller's.
 * orientation is the line's: 'vertical' between columns (left, right), 'horizontal' between rows.
 */
export function splitter(o: {
  label: string; orientation: 'vertical' | 'horizontal'; className: string; tip: string;
  /** The pointer moved by delta px since the press (x for a vertical line, y for a horizontal one); done at the release. */
  onDrag(delta: number, done: boolean): void;
  onStart(): void;
  /** The arrow keys: +16 or -16 px along the axis (right or down is +), or 'min' and 'max' (Home, End). */
  onKey(step: number | 'min' | 'max'): void;
  onReset(): void;
}): SplitterView {
  const el = h('div', {
    class: `splitter ${o.className}`, title: o.tip,
    attrs: { role: 'separator', tabindex: '0', 'aria-orientation': o.orientation, 'aria-label': o.label, 'data-help-label': o.label },
  });
  const vertical = o.orientation === 'vertical';
  let from: number | null = null;
  let pointer = -1;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    el.setPointerCapture(e.pointerId);
    pointer = e.pointerId;
    from = vertical ? e.clientX : e.clientY;
    el.classList.add('dragging');
    o.onStart();
  });
  el.addEventListener('pointermove', (e) => { if (from !== null && e.pointerId === pointer) o.onDrag((vertical ? e.clientX : e.clientY) - from, false); });
  const end = (e: PointerEvent) => {
    if (from === null || e.pointerId !== pointer) return;
    const d = (vertical ? e.clientX : e.clientY) - from;
    from = null;
    el.classList.remove('dragging');
    o.onDrag(d, true);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', (e) => { e.preventDefault(); o.onReset(); });
  el.addEventListener('keydown', (e) => {
    const plus = vertical ? 'ArrowRight' : 'ArrowDown', minus = vertical ? 'ArrowLeft' : 'ArrowUp';
    let step: number | 'min' | 'max' | null = null;
    if (e.key === plus) step = 16;
    else if (e.key === minus) step = -16;
    else if (e.key === 'Home') step = 'min';
    else if (e.key === 'End') step = 'max';
    if (step === null) return;
    // The splitter's keys, not the editor's (the arrows would step the timeline).
    e.preventDefault();
    e.stopPropagation();
    o.onKey(step);
  });
  const setValue = (now: number, min: number, max: number) => {
    el.setAttribute('aria-valuenow', String(Math.round(now)));
    el.setAttribute('aria-valuemin', String(Math.round(min)));
    el.setAttribute('aria-valuemax', String(Math.round(max)));
  };
  return { el, setValue };
}

export { icon, ICON_NAMES } from './icons';
export type { IconName } from './icons';
