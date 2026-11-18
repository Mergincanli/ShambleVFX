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

// ---------------------------------------------------------------- tooltips (docs/ui-redesign.md 6.9)

/**
 * One tooltip for the whole page. It shows after TIP_DELAY_MS of hover (TIP_QUICK_MS when another tooltip was just
 * open), and at once when Tab moves the keyboard focus onto an element that has one. It hides when the pointer leaves,
 * on a press, on scroll and on Esc, and then stays away until the pointer moves on (a row built again under a still
 * pointer stays quiet). Esc is not taken from the editor: it still does what it did (closes the picker, leaves the layer).
 *
 * What it says for an element:
 *   - its own words: data-tip. Every title turns into data-tip the first time the pointer or the focus comes to it (or as
 *     soon as code sets it again), so the browser's own tooltip never shows as well; a shortcut at the end of a title,
 *     "(Ctrl+Z)", goes into the kbd. Code can set the words with tip(). An icon-only button with no words of its own is
 *     named by its aria-label;
 *   - the help text for its label where it is shown, from the lookup given to installTooltips (src/app/helptips.ts),
 *     asked for each time it shows, so a label that changes or comes later gets its text;
 *   - its full text first, when it is cut short with an ellipsis;
 *   - a shortcut (data-tip-key, or the lookup's) in a muted kbd.
 * The element is a manual popover appended to document.body: it draws over the colour picker and dialogs too, and never
 * takes the pointer. Nothing here changes an element's name for screen readers; a tooltip shown for the keyboard focus
 * describes the focused element (aria-describedby) while it shows.
 */
export const TIP_DELAY_MS = 500;
export const TIP_QUICK_MS = 150;
/** "Another tooltip was just open": one is open, or one closed less than this long ago. */
const TIP_QUICK_WINDOW_MS = 600;
/** Focus counts as the keyboard's when Tab was pressed less than this long before. */
const TAB_WINDOW_MS = 1000;
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
/** The focused element that the shown tooltip describes. */
let described: Element | null = null;
let timer = 0;
let watch = 0;
let hiddenAt = -Infinity;
let tabAt = -Infinity;
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
  if (el === shown) showTip(el, shownByFocus);
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
  return el.hasAttribute('data-tip') || el.hasAttribute('title') || (el.matches('.icon-only') && el.hasAttribute('aria-label')) || !!helpOf(el);
}

/** The nearest element round the pointer's target that has a tooltip. */
function tipAt(target: Element | null): Element | null {
  for (let n = target; n && n !== document.body && n !== document.documentElement; n = n.parentElement) if (hasTip(n)) return n;
  return null;
}

/** The focused element's own tooltip: its own, or for a checkbox, its label's. Never a neighbour's. */
function tipOfFocus(el: Element): Element | null {
  if (hasTip(el)) return el;
  const check = el.matches('input') ? el.closest('label.check') : null;
  return check && hasTip(check) ? check : null;
}

const flat = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** What the tooltip says for an element: its lines, and its shortcut. Null when it has nothing to say. */
export function tipContent(el: Element): { lines: string[]; key?: string } | null {
  takeTitle(el);
  const own = flat(ownWords(el));
  const help = helpOf(el);
  const lines: string[] = [];
  const he = el as HTMLElement;
  // Cut short with an ellipsis: the whole text first.
  const full = he.scrollWidth > he.clientWidth + 1 && getComputedStyle(he).textOverflow === 'ellipsis' ? flat(he.textContent) : '';
  if (full && !own.includes(full)) lines.push(full);
  if (own) lines.push(own);
  if (help?.text && flat(help.text) !== own) lines.push(help.text);
  const key = el.getAttribute('data-tip-key') ?? help?.key;
  if (!lines.length && key) lines.push(flat(he.textContent) || flat(el.getAttribute('aria-label')));
  return lines.length ? { lines, ...(key ? { key } : {}) } : null;
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
    ...more.map((line) => h('p', { text: line })));
  // Shown again each time, so it is on top of a picker or a dialog opened since.
  if (isOpen(el)) el.hidePopover();
  el.showPopover();
  placeTip(el, anchor);
  if (described && described !== focused) unlinkTip();
  shown = anchor;
  shownByFocus = byFocus;
  if (byFocus && focused && !focused.hasAttribute('aria-describedby')) { focused.setAttribute('aria-describedby', TIP_ID); described = focused; }
  clearInterval(watch);
  // What it was for went away (the panel was built again): so does the tooltip.
  watch = window.setInterval(() => { if (shown && !shown.isConnected) hideTip(); }, 250);
}

/**
 * Below what it is for, or above when there is no room below; always inside the window. A row of a menu (inside
 * [data-tip-beside]) gets it beside the menu instead, level with the row, so it never covers the rows under it.
 */
function placeTip(el: HTMLElement, anchor: Element): void {
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
  if (top + t.height > window.innerHeight - m && r.top - gap - t.height >= m) top = r.top - gap - t.height;
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
    hideTip();
  }, true);
  document.addEventListener('focusin', (e) => {
    const target = e.target as Element;
    takeTitles(target);
    // Only for the keyboard: Tab moved the focus here. Not when a click or the editor moved it.
    if (performance.now() - tabAt > TAB_WINDOW_MS || !target.matches(':focus-visible')) return;
    const a = tipOfFocus(target);
    if (a) { clearTimeout(timer); timer = 0; showTip(a, true, target); }
  }, true);
  document.addEventListener('focusout', (e) => {
    if (shown && shownByFocus && (e.target === described || shown.contains(e.target as Node))) hideTip();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') tabAt = performance.now();
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
        if (el === shown) showTip(el, shownByFocus, described ?? undefined);
      }
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['title'] });
}

// ---------------------------------------------------------------- menus (docs/ui-redesign.md 6.10)

/** A row of a menu: a command, or a setting that is on or off (checked). A shortcut shows muted on the right. */
export interface MenuItem {
  label: string;
  icon?: IconName;
  /** The key as the row shows it ("Ctrl+S"), and as aria-keyshortcuts says it ("Control+S"). */
  shortcut?: string;
  ariaKeys?: string;
  /** A setting that is on or off: the row is a menuitemcheckbox with a check while it is on. */
  checked?: () => boolean;
  disabled?: () => boolean;
  action(): void;
}
export type MenuEntry = MenuItem | 'divider';

export interface MenuView {
  el: HTMLElement;
  isOpen(): boolean;
  /** Close it; with returnFocus, the keyboard focus goes back to the button that opens it. */
  close(returnFocus?: boolean): void;
}

/**
 * A menu that drops from a button: the main menu now; phase 3 grows it for the chips, + and More. It is a popover (auto),
 * appended to document.body, so no bar clips it; the button is its declared invoker, so a second click closes it and a click
 * outside it closes it too. It opens below the button, inside the window, with the focus on its first row.
 * Keys: ↑ and ↓ move between the rows, Home and End go to the first and last, Enter and Space choose, Esc and Tab close it
 * and give the focus back to the button. Keys pressed in it are its own (the editor's shortcuts skip a .menu).
 * Each row has data-help-label (its words without the shortcut), so its tooltip, beside the menu, gives its help text.
 */
export function menu(o: { opener: HTMLButtonElement; id: string; label: string; items: MenuEntry[]; helpSection?: string }): MenuView {
  const el = h('div', { class: 'menu', attrs: { id: o.id, popover: 'auto', role: 'menu', 'aria-label': o.label, 'data-tip-beside': '', ...(o.helpSection ? { 'data-help-section': o.helpSection } : {}) } });
  const rows: { item: MenuItem; btn: HTMLButtonElement }[] = [];
  for (const entry of o.items) {
    if (entry === 'divider') { el.append(h('div', { class: 'menu-divider', attrs: { role: 'separator' } })); continue; }
    const item = entry;
    const btn = h('button', {
      class: 'menu-item',
      attrs: { type: 'button', role: item.checked ? 'menuitemcheckbox' : 'menuitem', tabindex: '-1', 'data-help-label': item.label, ...(item.ariaKeys ? { 'aria-keyshortcuts': item.ariaKeys } : {}) },
      on: { click: () => { close(true); item.action(); } },
    }, h('span', { class: 'menu-icon' }, item.checked ? icon('check') : item.icon ? icon(item.icon) : null), h('span', { class: 'menu-label', text: item.label }),
    item.shortcut ? h('kbd', { class: 'menu-key', attrs: { 'aria-hidden': 'true' }, text: item.shortcut }) : null);
    rows.push({ item, btn });
    el.append(btn);
  }
  const enabled = () => rows.map((r) => r.btn).filter((b) => !b.disabled);
  const states = () => {
    for (const { item, btn } of rows) {
      btn.disabled = item.disabled?.() ?? false;
      if (item.checked) btn.setAttribute('aria-checked', String(item.checked()));
    }
  };
  const isOpen = () => el.matches(':popover-open');
  // The focus goes back to the button before the menu hides. Hidden with the focus still in it, the browser gives the focus
  // back itself, in the middle of hiding, where no popover can open: the tooltip that Tab shows at once threw there.
  const close = (returnFocus = false) => {
    if (returnFocus) o.opener.focus();
    if (isOpen()) el.hidePopover();
  };
  /**
   * Below the button, their left edges lined up; moved in to stay inside the window, or above when there is no room below.
   * Before it shows, its size is not known yet: it goes below the button, and is moved in, if need be, once it shows.
   */
  const place = (measured: boolean) => {
    const r = o.opener.getBoundingClientRect(), m = 4, gap = 4;
    const w = measured ? el.offsetWidth : 0, hh = measured ? el.offsetHeight : 0;
    let top = r.bottom + gap;
    if (top + hh > window.innerHeight - m && r.top - gap - hh >= m) top = r.top - gap - hh;
    el.style.left = `${Math.round(Math.max(m, Math.min(r.left, window.innerWidth - m - w)))}px`;
    el.style.top = `${Math.round(Math.max(m, Math.min(top, window.innerHeight - m - hh)))}px`;
  };
  o.opener.setAttribute('aria-haspopup', 'menu');
  o.opener.setAttribute('aria-expanded', 'false');
  o.opener.setAttribute('aria-controls', o.id);
  o.opener.popoverTargetElement = el;
  // beforetoggle comes at once (toggle comes later, as a task): the button says open or closed as soon as it is.
  el.addEventListener('beforetoggle', (e) => {
    const open = (e as ToggleEvent).newState === 'open';
    o.opener.setAttribute('aria-expanded', String(open));
    if (open) { states(); place(false); }
  });
  el.addEventListener('toggle', (e) => {
    const open = (e as ToggleEvent).newState === 'open';
    if (open) { place(true); enabled()[0]?.focus({ preventScroll: true }); }
    // Closed with the focus still in it (it went away under the focus): the button takes it back.
    else if (el.contains(document.activeElement)) o.opener.focus();
  });
  // An arrow pressed on the button while its menu is open, before the focus went into the menu, goes into it.
  o.opener.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    const list = enabled();
    const to = e.key === 'ArrowDown' || e.key === 'Home' ? list[0] : e.key === 'ArrowUp' || e.key === 'End' ? list[list.length - 1] : undefined;
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    to.focus({ preventScroll: true });
  });
  el.addEventListener('keydown', (e) => {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => { const n = list.length; if (n) list[((i % n) + n) % n]!.focus({ preventScroll: true }); };
    let handled = true;
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Escape' || e.key === 'Tab') close(true);
    else if (e.key === 'Enter' || e.key === ' ') { if (at >= 0) list[at]!.click(); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  });
  // The row under the pointer takes the focus, so the keys carry on from where the mouse is.
  el.addEventListener('pointermove', (e) => {
    const b = (e.target as Element).closest?.('.menu-item') as HTMLButtonElement | null;
    if (b && !b.disabled && document.activeElement !== b) b.focus({ preventScroll: true });
  });
  document.body.append(el);
  return { el, isOpen, close };
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
