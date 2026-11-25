/**
 * The Layers section of the left sidebar (docs/ui-redesign.md 6.2): a header with the count and a + menu that adds a layer
 * (Sprite, Projectile, the 14 shapes, Burst, Word), then the selected effect's layers, top of the drawing order first.
 *
 * A row: the layer's icon (a sprite: its own image), its name, and a muted tag on the right (its image, its flight, its
 * shape's plain name, its pieces or words; "rides Bullet" for a layer riding a projectile; "not in Low" for one the tier
 * leaves out). A shape's row tooltip says its plain name whole and, last, the name in the file (Mustafa's decision of
 * 2026-11-25: plain names everywhere). On
 * hover, on the selected row and while it has the keyboard focus, Move up, Move down and More take the tag's place; More
 * and a right-click open the row's menu (Rename, Duplicate, Move up, Move down, Delete). A double-click renames it in place.
 * A drag moves a layer: a 2 px line shows where it lands, and the move is one undo step. One menu serves every row.
 *
 * The row keeps the classes and the children the browser check reads: div.item.layer-item.type-<type> (.sel, .off) with
 * data-layer, its icon (svg or img), a span with the name (the name's button inside it), and its tag (code), each a child
 * of the row. The app keeps the layers and does the edits (the actions).
 */
import type { EffectFile, Layer, TierName } from '@shamble/vfx-format';
import { SHAPE_KINDS, SHAPE_TEXT, layerKind, ridingOn, shapeLabel } from '../doc/layer-info';
import { contextMenu, h, iconButton, menu, renameBox, reorderDrag, scrollNearest, tip, tipFile } from './dom';
import type { RenameBox } from './dom';
import { NEW_THIS_ROUND } from './help';
import { SHAPE_ICON, layerGlyph } from './layer-icons';

/** What the list asks of the app. */
export interface LayersListActions {
  effect(): EffectFile | undefined;
  /** The selected layer's id. */
  selected(): string | null;
  select(id: string): void;
  /** The tier the preview draws: rows left out of it fade. */
  tier(): TierName;
  imageUrl(name: string): string | undefined;
  /** Add a layer ('sprite', 'projectile', 'shape:<kind>', 'burst' or 'word') above the selected one, and select it. */
  add(kind: string): void;
  /** Move a layer by delta places in the file (+1: up the list, over more): one undo step, any delta. */
  move(id: string, delta: number): void;
  duplicate(id: string): void;
  rename(id: string, name: string): void;
  remove(id: string): void;
  /** The row under the pointer (the preview fades the others; the timeline highlights the same row), or none. */
  hover(id: string | null): void;
  hovered(): string | null;
}

export interface LayersListView {
  el: HTMLElement;
  list: HTMLElement;
  render(): void;
  /** Rename a layer in place (F2, the menu, a double-click). */
  startRename(id: string): void;
  renaming(): boolean;
  /** A row is being dragged: the hover stays on it. */
  dragging(): boolean;
}

/** A tier's name, as the Tier chip and the Shows in boxes say it. */
export const TIER_LABEL: Record<TierName, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/**
 * A layer row's tooltip, in the Layers list and on the timeline's names column: the full name (a long one ends in an
 * ellipsis in the row), and whether the tier leaves it out or it rides a projectile.
 */
export function layerRowTip(fx: EffectFile, l: Layer, tier: TierName): string {
  const hidden = l.type !== 'projectile' && !l.tiers.includes(tier);
  const rides = ridingOn(fx, l);
  return `${l.name}${hidden ? `: not drawn in the ${TIER_LABEL[tier]} tier` : ''}${rides ? `${hidden ? ';' : ':'} rides ${rides.name}` : ''}`;
}

/**
 * A few words after a layer's name in the list: its image, its flight, its shape's plain name ("beam", in lower case as the
 * other tags), its word.
 */
export function layerTag(l: Layer): string {
  switch (l.type) {
    case 'sprite': return l.image.replace(/\.png$/, '');
    case 'projectile': return l.flight.mode === 'speed' ? `${l.flight.mps} m/s` : l.flight.mode === 'time' ? `${l.flight.ms} ms` : `${l.flight.phase}`;
    case 'shape': return SHAPE_TEXT[l.shape.kind];
    case 'burst': return `${l.count} × ${l.look.kind}`;
    case 'word': return l.words.map((w) => w.text).join(' / ');
  }
}

export function buildLayersList(act: LayersListActions): LayersListView {
  // ------------------------------------------------ the header: "Layers" (top of the list draws on top), the count, +
  const count = h('span', { class: 'list-count' });
  const add = iconButton({ icon: 'plus', label: 'Add a layer', className: 'mini add-layer', onClick: () => { /* the menu opens itself: its button is its invoker */ } });
  // The add menu: each kind with its icon. A shape shows its plain name; its tooltip gives, last, the name in the file
  // ("In the file: band"). The help texts know a shape by its kind.
  const addMenu = menu({ opener: add, id: 'add-layer-menu', label: 'Add a layer', helpSection: 'Layers', items: [
    { label: 'Sprite', icon: 'sprite', description: 'an image', helpLabel: 'Sprite layer', action: () => act.add('sprite') },
    { label: 'Projectile', icon: 'projectile', description: 'a path in flight', helpLabel: 'Projectile layer', action: () => act.add('projectile') },
    'divider',
    { heading: 'Shapes', helpLabel: 'Shape layer' },
    ...SHAPE_KINDS.map((k) => ({ label: shapeLabel(k), icon: SHAPE_ICON[k], helpLabel: `Shape: ${k}`, file: k, action: () => act.add(`shape:${k}`) })),
    'divider',
    { label: 'Burst', icon: 'burst', description: 'pieces thrown out', helpLabel: 'Burst layer', action: () => act.add('burst') },
    { label: 'Word', icon: 'word', description: 'a comic sound', helpLabel: 'Word layer', action: () => act.add('word') },
  ] });
  const list = h('div', { class: 'list layers-list', attrs: { 'aria-label': 'Layers' } });
  // The title's tooltip starts with what its hint says (help.ts adds the rest).
  const el = h('section', { class: 'card grow layers-section', attrs: { 'data-help-section': 'Layers' } },
    h('div', { class: 'card-head' }, h('h2', { text: 'Layers', attrs: { 'data-tip': 'Top of the list draws on top.' } }), count, h('span', { class: 'hint', text: 'top draws on top' }), add),
    list);

  const layerOf = (id: string | null) => (id ? act.effect()?.layers.find((l) => l.id === id) : undefined);
  /** Can the layer move by delta (+1 up the list, -1 down)? */
  const canMove = (id: string | null, delta: number) => {
    const layers = act.effect()?.layers ?? [];
    const i = layers.findIndex((l) => l.id === id);
    return i >= 0 && i + delta >= 0 && i + delta < layers.length;
  };

  // ------------------------------------------------ renaming in place
  let renaming: { id: string; text: string; box: RenameBox | null; fresh: boolean } | null = null;
  const rowFor = (id: string) => list.querySelector<HTMLElement>(`.layer-item[data-layer="${CSS.escape(id)}"]`);
  const startRename = (id: string) => {
    const l = layerOf(id);
    if (!l) return;
    renaming?.box?.dispose();
    renaming = { id, text: l.name, box: null, fresh: true };
    render();
  };
  const endRename = (text: string | null, how: 'key' | 'elsewhere') => {
    const r = renaming;
    if (!r) return;
    renaming = null;
    const l = layerOf(r.id);
    const name = text?.trim() ?? '';
    // An empty name, or Esc: the name stays as it was.
    if (l && name && name !== l.name) act.rename(l.id, name);
    else render();
    if (how === 'key') (rowFor(r.id)?.querySelector('.item-main') as HTMLElement | null)?.focus({ preventScroll: true });
  };

  // ------------------------------------------------ one menu for every row
  let menuFor: string | null = null;
  const target = () => layerOf(menuFor);
  const rowMenu = menu({ id: 'layer-menu', label: 'Layer', helpSection: 'Layers', items: [
    { label: 'Rename', icon: 'edit', shortcut: 'F2', ariaKeys: 'F2', disabled: () => !target(), action: () => { if (target()) startRename(menuFor!); } },
    { label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D', ariaKeys: 'Control+D', disabled: () => !target(), action: () => { if (target()) act.duplicate(menuFor!); } },
    { label: 'Move up', icon: 'up', shortcut: 'Ctrl+]', ariaKeys: 'Control+]', disabled: () => !canMove(menuFor, 1), action: () => { if (canMove(menuFor, 1)) act.move(menuFor!, 1); } },
    { label: 'Move down', icon: 'down', shortcut: 'Ctrl+[', ariaKeys: 'Control+[', disabled: () => !canMove(menuFor, -1), action: () => { if (canMove(menuFor, -1)) act.move(menuFor!, -1); } },
    'divider',
    { label: 'Delete', icon: 'trash', shortcut: 'Del', ariaKeys: 'Delete', helpLabel: 'Delete layer', disabled: () => !target(), action: () => { if (target()) act.remove(menuFor!); } },
  ] });
  contextMenu(list, rowMenu, (e) => {
    const row = (e.target as Element).closest?.<HTMLElement>('.layer-item');
    if (!row || row.classList.contains('renaming')) return null;
    menuFor = row.dataset.layer ?? null;
    return row;
  });

  // ------------------------------------------------ clicks: a row selects, a double-click renames
  list.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('.item-tools, input, .list-empty')) return;
    const id = t.closest<HTMLElement>('.layer-item')?.dataset.layer;
    if (!id || !layerOf(id)) return;
    // The second click of a double-click (the first selected it, and the list was built again under the pointer).
    if (e.detail === 2 && id === act.selected()) { startRename(id); return; }
    if (id !== act.selected()) act.select(id);
  });
  // The row under the mouse: the preview fades the other layers while it is there, and the timeline highlights the same
  // row. Listened to on the list, which stays when its rows are made again (a row taken away under the mouse never says it
  // was left). While a row is dragged, the dragged one stays the one.
  list.addEventListener('pointermove', (e) => { if (!drag.dragging()) act.hover(((e.target as Element).closest?.('.layer-item') as HTMLElement | null)?.dataset.layer ?? null); });
  list.addEventListener('pointerleave', () => { if (!drag.dragging()) act.hover(null); });

  // ------------------------------------------------ drag to reorder: one move, one undo step
  const drag = reorderDrag(list, {
    rowOf: (t) => (t.closest('.item-tools, input, .list-empty') ? null : t.closest<HTMLElement>('.layer-item')),
    rows: () => [...list.querySelectorAll<HTMLElement>('.layer-item')],
    keyOf: (row) => row.dataset.layer ?? '',
    onStart: (id) => act.hover(id),
    // The list shows the file's layers upside down: a row moved up the list goes further along in the file (+ up).
    onDrop: (id, from, to) => act.move(id, from - to),
    onEnd: () => act.hover(null),
  });

  // ------------------------------------------------ the rows
  const layerRow = (fx: EffectFile, l: Layer, index: number, last: number): HTMLElement => {
    const sel = l.id === act.selected();
    const tier = act.tier();
    const hidden = l.type !== 'projectile' && !l.tiers.includes(tier);
    // A layer that rides a projectile says so in its tag ("rides Bullet"); left out of the tier, the tag says that instead.
    const rides = ridingOn(fx, l);
    const tag = hidden ? `not in ${TIER_LABEL[tier]}` : rides ? `rides ${rides.name}` : layerTag(l);
    const code = h('code', { class: rides && !hidden ? 'rides' : undefined, text: tag });
    // "rides Bullet" says what that means in its own tooltip (help.ts).
    if (rides && !hidden) tip(code, NEW_THIS_ROUND.ridesTag(rides.name));
    const row = h('div', {
      class: `item layer-item type-${l.type}${sel ? ' sel' : ''}${hidden ? ' off' : ''}${act.hovered() === l.id ? ' hovered' : ''}`, attrs: { 'data-layer': l.id },
      // The full name, since a long one ends in an ellipsis in the row. A shape's plain name follows whole on a line of its
      // own ("Shape: beads along a beam"): its tag may cut it, and hides on hover.
      title: `${layerRowTip(fx, l, tier)}${l.type === 'shape' ? `\n${layerKind(l)}` : ''}`,
    });
    if (l.type === 'shape') tipFile(row, l.shape.kind);
    const glyph = layerGlyph(l, (n) => act.imageUrl(n));
    if (renaming?.id === l.id) {
      renaming.box?.dispose();
      const box = renameBox({ value: renaming.text, label: `New name for ${l.name}`, maxLength: 80, onEnd: endRename });
      box.el.addEventListener('input', () => { if (renaming) renaming.text = box.el.value; });
      renaming.box = box;
      row.classList.add('renaming');
      row.append(glyph, h('span', {}, box.el), code);
      return row;
    }
    // The name is the row's button (for the keyboard and screen readers); a click anywhere on the row selects it.
    const name = h('button', { class: 'item-main', attrs: { type: 'button', ...(sel ? { 'aria-current': 'true' } : {}) }, text: l.name });
    // Its buttons: Move up, Move down and More, for this row's layer. The keyboard reaches them on the selected row.
    const btn = (icon: 'up' | 'down' | 'more', label: string, onClick: (b: HTMLButtonElement) => void, key?: string) => {
      const b: HTMLButtonElement = iconButton({ icon, label: `${label}: ${l.name}`, className: icon === 'more' ? 'mini more' : 'mini', onClick: () => onClick(b) });
      tip(b, label, key);
      if (!sel) b.tabIndex = -1;
      return b;
    };
    const up = btn('up', 'Move up', () => act.move(l.id, 1), 'Ctrl+]');
    const down = btn('down', 'Move down', () => act.move(l.id, -1), 'Ctrl+[');
    up.disabled = index === 0;
    down.disabled = index === last;
    // A click that ends a rename builds the list again before it gets here: the menu then opens below this row's new More.
    const more = btn('more', 'More', (b) => {
      const at = b.isConnected ? b : rowFor(l.id)?.querySelector<HTMLElement>('.item-tools .more');
      if (!at) return;
      menuFor = l.id;
      rowMenu.openBelow(at);
    });
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    row.append(glyph, h('span', {}, name), code, h('div', { class: 'item-tools' }, up, down, more));
    return row;
  };

  const render = () => {
    const fx = act.effect();
    if (renaming && !layerOf(renaming.id)) { renaming.box?.dispose(); renaming = null; }
    const hadFocus = !!renaming && renaming.box?.el === document.activeElement;
    if (!fx) {
      count.textContent = '';
      list.replaceChildren(h('p', { class: 'empty', text: 'No effect.' }));
      return;
    }
    count.textContent = String(fx.layers.length);
    // Shown top of the drawing order first.
    const shown = [...fx.layers].reverse();
    const rows = shown.map((l, i) => layerRow(fx, l, i, shown.length - 1));
    if (!shown.length) {
      const addOne: HTMLButtonElement = h('button', { class: 'tb', attrs: { type: 'button', 'aria-haspopup': 'menu' }, text: 'Add a layer', on: { click: () => addMenu.openBelow(addOne) } });
      rows.push(h('div', { class: 'list-empty' }, h('p', { class: 'empty', text: 'No layers yet.' }), addOne));
    }
    list.replaceChildren(...rows);
    if (renaming?.box) {
      const input = renaming.box.el;
      if (renaming.fresh || hadFocus || !document.activeElement || document.activeElement === document.body) {
        input.focus({ preventScroll: true });
        if (renaming.fresh) input.select(); else input.setSelectionRange(input.value.length, input.value.length);
      }
      renaming.fresh = false;
      scrollNearest(list, input.closest('.layer-item')!);
    }
  };

  return { el, list, render, startRename, renaming: () => !!renaming, dragging: () => drag.dragging() };
}
