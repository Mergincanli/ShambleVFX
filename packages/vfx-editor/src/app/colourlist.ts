/**
 * The colour list in the right panel: the colours of what is selected. No layer: the effect's (its main colour and every
 * layer's). A layer: its own, including the ones it draws without naming them (the ink outline, a star's white first step,
 * your own team's broken edge, its gradient's stops). A projectile has none of its own: the colours of the layers riding
 * it. "Show all" (remembered as vfx-colours-all) shows every colour of the palette, the selection's in bold. Colours that
 * leave or come back move in a short animation (none with reduced motion). Click a colour to change it in the picker.
 *
 * One list for the whole panel: the inspector puts the same elements into the view it builds, so a change of selection
 * can move the colours from what was shown before to what is shown now.
 */
import { resolveRole, roleNames } from '@shamble/vfx-format';
import { ridersOf, selectionColours } from '../doc/layer-info';
import type { SelectionColours } from '../doc/layer-info';
import type { AppApi } from './api';
import { h } from './dom';

export const SHOW_ALL_KEY = 'vfx-colours-all';
/** How long a colour takes to leave or come back, in ms. */
export const MOVE_MS = 150;

export interface ColourListView {
  /** The colours (.swatches, with a .swatch button per palette colour: the picker and the browser check use them). */
  el: HTMLElement;
  /** The Show all switch, for the heading it sits next to. */
  toggle: HTMLElement;
  /** A line before the list, when the list needs one: a projectile has no colours of its own, a layer uses none. */
  note: HTMLElement;
  /** The hint under the list (how to use it; it names the marked colour only when one is shown). */
  hint: HTMLElement;
  refresh(): void;
}

const WHOSE: Record<SelectionColours['of'], string> = { effect: 'this effect', layer: 'this layer', riders: 'the layers riding it' };
const GROUP: Record<SelectionColours['of'], string> = { effect: 'The effect\'s colours', layer: 'Colours this layer uses', riders: 'Colours of the layers riding it' };

function readShowAll(): boolean {
  try { return localStorage.getItem(SHOW_ALL_KEY) === '1'; } catch { return false; }
}

function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Set an attribute only when it changes, so a refresh that changes nothing costs nothing. */
function setAttr(e: Element, name: string, value: string): void {
  if (e.getAttribute(name) !== value) e.setAttribute(name, value);
}

export function colourList(app: AppApi): ColourListView {
  let showAll = readShowAll();
  const box = h('input', { attrs: { type: 'checkbox' } });
  box.checked = showAll;
  // Its tooltip is the help text for "Show all" (help.ts).
  const toggle = h('label', { class: 'check show-all' }, box, h('span', { text: 'Show all' }));
  box.addEventListener('change', () => {
    showAll = box.checked;
    try { localStorage.setItem(SHOW_ALL_KEY, showAll ? '1' : '0'); } catch { /* storage may be blocked */ }
    refresh();
  });
  const el = h('div', { class: 'swatches', attrs: { role: 'group' } });
  const note = h('p', { class: 'readout colour-note' });
  const hint = h('p', { class: 'hint' });
  /** Every item the list can show, by key: "role:<name>" (a palette colour), "missing:<name>", "hex:<#RRGGBB>". */
  const items = new Map<string, HTMLElement>();
  let shownFor: unknown[] = [];
  /** Height animations running on the list: while one runs, colours that leave are clipped to it. */
  let moving = 0;

  const swatch = (role: string) => {
    const b = h('button', { class: 'swatch', attrs: { type: 'button', 'aria-haspopup': 'dialog', 'data-key': `role:${role}` },
      on: { click: (e) => app.openColourPicker(role, e.currentTarget as HTMLElement) } },
    h('span', { class: 'chip' }), h('span', { class: 'rname', text: role }));
    return b;
  };
  const extra = (key: string, label: string, hex: string | null, title: string) =>
    h('span', { class: hex ? 'swatch-extra' : 'swatch-extra missing', title, attrs: { 'data-key': key } },
      h('span', { class: hex ? 'chip' : 'chip none', style: hex ? `background:${hex}` : undefined }), h('span', { class: 'rname', text: label }));

  function refresh(): void {
    const fx = app.effect();
    const layer = app.layer();
    const palette = app.palette;
    const key = [fx, layer, palette, app.faction, showAll];
    if (key.length === shownFor.length && key.every((k, i) => k === shownFor[i])) return;
    shownFor = key;
    box.checked = showAll;
    if (!fx) return;
    const sel = selectionColours(fx, layer, palette);
    const uses = new Set(sel.roles);
    const main = fx.controls.colour;
    const whose = WHOSE[sel.of];
    setAttr(el, 'aria-label', GROUP[sel.of]);
    el.classList.toggle('all', showAll);

    // What the list holds now, in order: the palette's colours, then colours it lacks, then hex stops.
    const order: { key: string; show: boolean; make(): HTMLElement; update?(e: HTMLElement): void }[] = [];
    for (const role of roleNames(palette)) {
      order.push({ key: `role:${role}`, show: showAll || uses.has(role), make: () => swatch(role), update: (b) => {
        const hex = resolveRole(palette, role, app.faction) ?? '';
        const isMain = role === main, used = uses.has(role);
        const chip = b.firstElementChild as HTMLElement;
        if (chip.dataset.hex !== hex) { chip.dataset.hex = hex; chip.style.background = hex; }
        if (b.classList.contains('uses') !== used) b.classList.toggle('uses', used);
        setAttr(b, 'aria-current', String(isMain));
        setAttr(b, 'title', `${role} (${hex} for ${app.faction})${showAll ? (used ? `: ${whose} uses it` : `: ${whose} does not use it`) : ''}. Click to change the colour, or to make it the main colour`);
        setAttr(b, 'aria-label', `${role}, ${hex}${isMain ? ', the main colour' : ''}${showAll && used ? `, used by ${whose}` : ''}. Change the colour`);
      } });
    }
    for (const role of sel.missing) {
      order.push({ key: `missing:${role}`, show: true, make: () => extra(`missing:${role}`, role, null,
        `${role}: not in the palette. Add it under New colour in the colour picker, or pick another colour (see the problems at the top of the right panel).`) });
    }
    for (const s of sel.hexes) {
      order.push({ key: `hex:${s.hex}`, show: true, make: () => extra(`hex:${s.hex}`, s.hex, s.hex,
        `${s.hex}: a stop of the gradient "${s.gradient}", given as a hex, not a palette colour. Change it in the colour picker, under Gradients.`) });
    }

    // Does anything move: an item made or taken out, the order changed, an item shown or hidden? Most refreshes (a slider
    // dragged, a colour changed) move nothing: they only update the swatches, and nothing is measured.
    const current = [...el.children].filter((c) => !c.classList.contains('swatch-ghost')) as HTMLElement[];
    const moves = current.length !== order.length || order.some((o, i) => current[i]!.dataset.key !== o.key || current[i]!.hidden === o.show);
    // Where each item is now, before the change (relative to the list, so a list that moved does not slide as a whole).
    // The first time, nothing was shown before: nothing moves.
    const animate = moves && items.size > 0 && !reducedMotion() && el.isConnected && el.getClientRects().length > 0;
    const box0 = animate ? el.getBoundingClientRect() : null;
    const before = new Map<HTMLElement, DOMRect>();
    if (animate) for (const e of items.values()) if (!e.hidden) before.set(e, e.getBoundingClientRect());

    // The change: new items made, items in order, the ones that are gone taken out, each shown or hidden.
    const keep = new Set(order.map((o) => o.key));
    for (const [k, e] of items) if (!keep.has(k)) { e.remove(); items.delete(k); }
    let prev: HTMLElement | null = null;
    for (const o of order) {
      let e = items.get(o.key);
      if (!e) { e = o.make(); items.set(o.key, e); }
      o.update?.(e);
      if (e.hidden !== !o.show) e.hidden = !o.show;
      if (prev ? prev.nextElementSibling !== e : el.firstElementChild !== e) {
        if (prev) prev.after(e); else el.prepend(e);
      }
      prev = e;
    }

    const empty = ![...items.values()].some((e) => !e.hidden);
    const noteText = sel.of === 'riders'
      ? (layer && ridersOf(fx, layer.id).length
        ? 'A projectile has no colours of its own. These are the colours of the layers riding it.'
        : 'A projectile has no colours of its own, and no layer rides it.')
      : sel.of === 'layer' && !sel.roles.length && !sel.missing.length && !sel.hexes.length
        ? (layer?.type === 'sprite' && layer.tint.mode === 'keep' ? 'It uses no palette colours: the image keeps its own colours.' : 'It uses no palette colours.')
        : '';
    if (note.textContent !== noteText) note.textContent = noteText;
    note.hidden = noteText === '';
    el.classList.toggle('empty', empty);
    const mainShown = items.get(`role:${main}`)?.hidden === false;
    // One line; the full words are in the Colour title's and the colours' own tooltips (help.ts, and each colour's).
    const hintText = sel.of === 'effect'
      ? 'Click a colour to change it. The marked one is the effect\'s main colour.'
      : `Click a colour to change it everywhere it is used.${mainShown ? ' The marked one is the main colour.' : ''}`;
    if (hint.textContent !== hintText) hint.textContent = hintText;
    // Only when there is a colour to click: not under "It uses no palette colours" (a colour the palette lacks and a hex
    // stop cannot be clicked either).
    const clickable = [...items].some(([k, e]) => k.startsWith('role:') && !e.hidden);
    if (hint.hidden === clickable) hint.hidden = !clickable;

    if (!animate || !box0) return;
    const box1 = el.getBoundingClientRect();
    if (box1.width === 0) return;
    const opts: KeyframeAnimationOptions = { duration: MOVE_MS, easing: 'ease-out' };
    for (const e of items.values()) {
      if (e.hidden) continue;
      const r1 = e.getBoundingClientRect(), r0 = before.get(e);
      if (!r0) { e.animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }], opts); continue; }
      const dx = (r0.left - box0.left) - (r1.left - box1.left), dy = (r0.top - box0.top) - (r1.top - box1.top);
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], opts);
    }
    // Colours that leave fade where they were: a copy that is not a swatch (nothing can click it, and no check finds it).
    for (const [e, r0] of before) {
      if (!e.hidden && e.isConnected) continue;
      const ghost = h('span', { class: 'swatch-ghost', attrs: { 'aria-hidden': 'true' } }, ...[...e.childNodes].map((n) => n.cloneNode(true)));
      ghost.style.left = `${r0.left - box0.left}px`;
      ghost.style.top = `${r0.top - box0.top}px`;
      ghost.style.width = `${r0.width}px`;
      el.append(ghost);
      const a = ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.9)' }], { ...opts, fill: 'forwards' });
      const done = () => ghost.remove();
      a.finished.then(done, done);
    }
    // The list's height follows, so what is under it moves smoothly too.
    if (Math.abs(box0.height - box1.height) > 0.5) {
      moving++;
      el.classList.add('moving');
      const a = el.animate([{ height: `${box0.height}px` }, { height: `${box1.height}px` }], opts);
      const done = () => { if (--moving === 0) el.classList.remove('moving'); };
      a.finished.then(done, done);
    }
  }

  return { el, toggle, note, hint, refresh };
}
