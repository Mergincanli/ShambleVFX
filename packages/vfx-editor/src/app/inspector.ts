/**
 * The right panel shows what is selected: the effect's settings, or, with a layer selected, that layer's settings only.
 * Each starts with the panel's 40 px header, which stays at the top while the panel scrolls: the effect's (a dot in its main
 * colour, its name with its folder muted before it, "Effect" and More), or the layer's, which leads back to the effect (its
 * name, or Esc), with More. The More menus do what the lists' row menus do. Under the header, only while the checker finds
 * problems, the problems banner. Cost sits at the bottom of the effect's settings, never under a layer. Fields are built once
 * per selection and refreshed in place, so a slider keeps working while you drag it.
 */
import { MAIN_ROLE, PHASE_NAMES, TIER_NAMES, isArrivalStart, isInputAnchor, resolveRole, roleNames } from '@shamble/vfx-format';
import type { InputAnchor, Layer, PhaseName, ProjectileLayer, SpriteLayer, TierName, Vec3, VisibleLayer } from '@shamble/vfx-format';
import type { Problem } from '@shamble/vfx-format/validate';
import { FOLDER_SEP, NAME_MAX, folderOf, splitName } from '../doc/folders';
import { riderLine, ridersOf, whatDraws } from '../doc/layer-info';
import type { WhatDraws } from '../doc/layer-info';
import type { AppApi } from './api';
import { colourList } from './colourlist';
import type { ColourListView } from './colourlist';
import { costCard } from './costcard';
import type { SegmentOption } from './dom';
import { checkField, fold, h, icon, iconButton, menu, numberBox, numberField, numberGroup, segmented, selectField, slider, textField, tip } from './dom';
import { NEW_THIS_ROUND } from './help';
import { layerGlyph, layerGlyphKey } from './layer-icons';
import { LookView } from './look';
import { roleHex, specForm, structureOf } from './specform';

interface Refresher { refresh(): void }

/** The inspector rebuilds when the effect, the layer or the layer's structure (a part switched on, a tone added) changes. */
function keyOf(fxId: string | undefined, layer: Layer | undefined): string {
  return `${fxId}|${layer?.id}|${layer?.type}|${layer ? structureOf(layer) : ''}`;
}

const PHASE_LABEL: Record<PhaseName, string> = { windup: 'Wind-up', peak: 'Peak', fade: 'Fade' };

/** A sprite's Faces: the camera, or along the path (what that means is in its tooltip). */
const FACES_SPRITE: SegmentOption<string>[] = [
  { value: 'camera', label: 'The camera', short: 'Camera' },
  { value: 'path', label: 'Along the path', short: 'Path', title: 'The image\'s x axis lies along the motion, or along the shot' },
];

export interface InspectorView {
  el: HTMLElement;
  rebuild(): void;
  refresh(): void;
  backToEffect(): void;
  /**
   * The status bar's checks: open the problems banner's list where the panel shows it (scrolled to the top, the focus on
   * the banner). False when there are no problems (there is no banner then).
   */
  openProblems(): boolean;
  /** The live picture at the top of a layer's settings (the app draws it in its frames). */
  look: LookView;
}

/** The problems banner's list: open or closed. Kept from one view to the next while the editor runs; closed at first. */
interface BannerState { open: boolean }

export function buildInspector(app: AppApi): InspectorView {
  // data-help-*: where the help texts in the tooltips look for the layer type and shape kind shown (src/app/helptips.ts).
  const el = h('aside', { class: 'inspector', attrs: { 'aria-label': 'Effect and layer settings', 'data-help-panel': '' } });
  // One colour list for the panel: each view puts it in its place, so the colours can move from one selection to the next.
  const colours = colourList(app);
  // One Look too: a layer's view puts it at its top, and its renderer lives while a layer's view shows it.
  const look = new LookView();
  // The headers' More menus: made once (on body), opened below the More button of the header shown.
  const menus = headerMenus(app);
  const banner: BannerState = { open: false };
  let parts: Refresher[] = [];
  let builtFor = '';
  let shownSelection = '';

  /** Leave the layer: the effect's settings show again (its name in the header, or Esc). */
  const backToEffect = () => app.selectLayer(null);

  const rebuild = () => {
    const fx = app.effect();
    const layer = app.layer();
    builtFor = keyOf(fx?.id, layer);
    parts = [];
    if (layer) el.dataset.helpLayer = layer.type; else delete el.dataset.helpLayer;
    if (layer?.type === 'shape') el.dataset.helpKind = layer.shape.kind; else delete el.dataset.helpKind;
    const hadFocus = el.contains(document.activeElement);
    // Another effect or layer starts at the top of the panel (a part switched on rebuilds too, and keeps its place).
    const selection = `${fx?.id}|${layer?.id}`;
    const another = selection !== shownSelection;
    // The same selection built again (a tier switched on, a part added): the control that had the focus is found again by
    // its name for screen readers (the first, second… of that name), so the keyboard carries on from it.
    const focusName = hadFocus && !another ? document.activeElement?.getAttribute('aria-label') ?? null : null;
    const focusAt = focusName ? [...el.querySelectorAll('[aria-label]')].filter((x) => x.getAttribute('aria-label') === focusName).indexOf(document.activeElement!) : -1;
    el.replaceChildren();
    if (another) { shownSelection = selection; if (el.parentElement) el.parentElement.scrollTop = 0; }
    look.setShown(!!(fx && layer));
    if (!fx) { el.append(h('p', { class: 'empty', text: 'Open or make an effect.' })); return; }
    const head = layer ? layerHeader(app, parts, backToEffect, menus) : effectHeader(app, parts, menus);
    if (layer) el.append(head, layerDetails(app, layer, parts, colours, look));
    else {
      // Cost ends the effect's settings, closed at first, and never shows under a layer (docs/ui-redesign.md 6.6).
      const cost = costCard(app);
      parts.push(cost);
      el.append(head, effectSections(app, parts, colours), cost.el);
    }
    // The problems banner goes in right under the header, and only while there are problems.
    parts.push(problemsBanner(app, banner, head));
    colours.refresh();
    // The control that had the focus (the way back, a rider) went with the old view: the new view's title takes it, so the
    // keyboard carries on from the top of what is now selected.
    if (another && hadFocus) (el.querySelector('.insp-title') as HTMLElement | null)?.focus({ preventScroll: true });
    else if (focusName && focusAt >= 0) ([...el.querySelectorAll<HTMLElement>('[aria-label]')].filter((x) => x.getAttribute('aria-label') === focusName)[focusAt])?.focus({ preventScroll: true });
  };
  const refresh = () => {
    const fx = app.effect();
    const layer = app.layer();
    if (keyOf(fx?.id, layer) !== builtFor) { rebuild(); return; }
    for (const p of parts) p.refresh();
    colours.refresh();
  };
  const openProblems = () => {
    if (!app.effect() || !app.problems().length) return false;
    banner.open = true;
    refresh();
    if (el.parentElement) el.parentElement.scrollTop = 0;
    el.querySelector<HTMLElement>(':scope > .problems-banner .banner-head')?.focus({ preventScroll: true });
    return true;
  };
  rebuild();
  return { el, rebuild, refresh, backToEffect, openProblems, look };
}

// ---------------------------------------------------------------- the headers' More menus

interface HeaderMenus {
  /** Open the effect's menu (Duplicate effect, Move to folder…, Delete effect) below the header's More button. */
  effect(button: HTMLElement, id: string): void;
  /** Open a layer's menu (Rename, Duplicate, Move up, Move down, Delete) below the header's More button. */
  layer(button: HTMLElement, id: string): void;
}

/**
 * The headers' More menus (docs/ui-redesign.md 6.6): the effect's and a layer's. They do what the lists' row menus do
 * (src/app/effects-list.ts, layers-list.ts), through the same functions of the app, each one undo step; Move to folder…
 * opens the Effects list's folder menu below the same button. Their rows keep the lists' help texts (data-help-section).
 */
function headerMenus(app: AppApi): HeaderMenus {
  let fxId: string | null = null, layerId: string | null = null, button: HTMLElement | null = null;
  const canMove = (delta: number) => {
    const layers = app.effect()?.layers ?? [];
    const i = layers.findIndex((l) => l.id === layerId);
    return i >= 0 && i + delta >= 0 && i + delta < layers.length;
  };
  const effectMenu = menu({ id: 'insp-effect-menu', label: 'Effect', helpSection: 'Effects', items: [
    { label: 'Duplicate effect', icon: 'copy', shortcut: 'Ctrl+D', ariaKeys: 'Control+D', helpLabel: 'Duplicate', action: () => { if (fxId) app.duplicateEffect(fxId); } },
    { label: 'Move to folder…', icon: 'folder', action: () => { if (fxId && button?.isConnected) app.openFolderMenu(fxId, button); } },
    'divider',
    { label: 'Delete effect', icon: 'trash', action: () => { if (fxId) app.deleteEffect(fxId); } },
  ] });
  const layerMenu = menu({ id: 'insp-layer-menu', label: 'Layer', helpSection: 'Layers', items: [
    { label: 'Rename', icon: 'edit', shortcut: 'F2', ariaKeys: 'F2', action: () => { if (layerId) app.renameLayerInPlace(layerId); } },
    { label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D', ariaKeys: 'Control+D', action: () => { if (layerId) app.duplicateLayer(layerId); } },
    { label: 'Move up', icon: 'up', shortcut: 'Ctrl+]', ariaKeys: 'Control+]', disabled: () => !canMove(1), action: () => { if (layerId && canMove(1)) app.moveLayer(layerId, 1); } },
    { label: 'Move down', icon: 'down', shortcut: 'Ctrl+[', ariaKeys: 'Control+[', disabled: () => !canMove(-1), action: () => { if (layerId && canMove(-1)) app.moveLayer(layerId, -1); } },
    'divider',
    { label: 'Delete', icon: 'trash', shortcut: 'Del', ariaKeys: 'Delete', helpLabel: 'Delete layer', action: () => { if (layerId) app.deleteLayer(layerId); } },
  ] });
  return {
    effect: (b, id) => { fxId = id; button = b; effectMenu.openBelow(b); },
    layer: (b, id) => { layerId = id; button = b; layerMenu.openBelow(b); },
  };
}

/** A header's More button: a 24 px icon button whose name says what it is for; its menu opens below it. */
function moreButton(open: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b: HTMLButtonElement = iconButton({ icon: 'more', label: 'More', className: 'mini more insp-more', onClick: () => open(b) });
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-expanded', 'false');
  tip(b, 'More');
  return b;
}

// ---------------------------------------------------------------- the problems banner

/** The layer a problem's path points at ("layers[2].tint.role"), if any. */
function layerOfPath(app: AppApi, path: string): Layer | undefined {
  const m = /^layers\[(\d+)\]/.exec(path);
  return m ? app.effect()?.layers[Number(m[1])] : undefined;
}

/**
 * The problems banner (docs/ui-redesign.md 6.6), in both views, right under the header, and only while the checker finds
 * problems: on --bad-bg, the warning icon, how many, and a chevron that opens the list. Each problem: its path in Plex Mono
 * (a button that selects its layer when it points at one) and its message. When the problems stop the preview (schema,
 * format or version), it says so. Its tooltip is the help text for Checks (what the checker looks at). It puts itself in
 * after the header, or takes itself out, on every refresh: problems come and go without the panel being built again.
 */
function problemsBanner(app: AppApi, state: BannerState, head: HTMLElement): Refresher {
  const count = h('span', { class: 'banner-count' });
  const chev = icon('chevron-down');
  chev.classList.add('banner-chev');
  const toggle = h('button', {
    class: 'banner-head', attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'insp-problems', 'data-help-label': 'Checks' },
    on: { click: () => { state.open = !state.open; draw(); } },
  }, icon('warning'), count, chev);
  const wait = h('p', { class: 'banner-wait', text: 'The preview waits until these are fixed.' });
  const list = h('ul', { class: 'banner-list', attrs: { id: 'insp-problems' } });
  const el = h('section', { class: 'problems-banner', attrs: { 'aria-label': 'Problems' } }, toggle, wait, list);
  let shown = '';
  const item = (p: Problem) => {
    const layer = layerOfPath(app, p.path);
    const path = layer
      ? h('button', { class: 'banner-path', title: `Select ${layer.name}`, attrs: { type: 'button' }, on: { click: () => app.selectLayer(layer.id) } }, h('code', { text: p.path }))
      : h('code', { class: 'banner-path', text: p.path });
    return h('li', {}, path, ' ', h('span', { class: 'banner-msg', text: p.message }));
  };
  const draw = () => {
    const probs = app.problems();
    if (!probs.length) { el.remove(); return; }
    if (!el.isConnected && head.isConnected) head.after(el);
    count.textContent = `${probs.length} problem${probs.length === 1 ? '' : 's'}`;
    toggle.setAttribute('aria-expanded', String(state.open));
    list.hidden = !state.open;
    wait.hidden = !app.previewWaits();
    const key = JSON.stringify([probs.map((p) => [p.path, p.message]), app.effect()?.layers.map((l) => l.name)]);
    if (key !== shown) { shown = key; list.replaceChildren(...probs.map(item)); }
  };
  draw();
  return { refresh: draw };
}

// ---------------------------------------------------------------- the headers

/**
 * The header of the effect's own settings: a dot in its main colour (for the faction shown), its name (its folder, if any,
 * muted before it: "Weapons / " then "Rifle shot"), "Effect", and More (Duplicate effect, Move to folder…, Delete effect).
 * Its title takes the focus when you come back from a layer with the keyboard (see rebuild).
 */
function effectHeader(app: AppApi, parts: Refresher[], menus: HeaderMenus): HTMLElement {
  const dot = h('span', { class: 'fx-dot' });
  const folder = h('span', { class: 'insp-folder' });
  const name = h('span', { class: 'insp-name' });
  const title = h('h2', { class: 'insp-title', attrs: { tabindex: '-1' } }, folder, name);
  const more = moreButton((b) => menus.effect(b, app.effect()!.id));
  const head = h('header', { class: 'insp-head effect-head' }, dot, title, h('span', { class: 'insp-kind', text: 'Effect' }), more);
  const draw = () => {
    const fx = app.effect()!;
    const path = folderOf(fx.name);
    folder.textContent = path ? `${path}${FOLDER_SEP}` : '';
    name.textContent = path ? splitName(fx.name).base : fx.name;
    title.title = fx.name;
    more.setAttribute('aria-label', `More: ${fx.name}`);
    const role = fx.controls.colour;
    dot.style.backgroundColor = resolveRole(app.palette, role, app.faction) ?? 'transparent';
    tip(dot, `Main colour: ${role}`);
  };
  draw();
  parts.push({ refresh: draw });
  return head;
}

/** The effect's name (back to the effect's settings), "›", the layer's type icon, its name, and More. */
function layerHeader(app: AppApi, parts: Refresher[], back: () => void, menus: HeaderMenus): HTMLElement {
  const link = h('button', { class: 'crumb', attrs: { type: 'button' }, on: { click: back } });
  const title = h('h2', { class: 'insp-title', attrs: { tabindex: '-1' } });
  // The layer's icon (a sprite: its image). A new kind, look or image does not rebuild the panel, so draw() swaps it.
  const urlOf = (n: string) => app.imageUrl(n);
  let glyphKey = layerGlyphKey(app.layer()!, urlOf);
  let glyph = layerGlyph(app.layer()!, urlOf);
  const more = moreButton((b) => menus.layer(b, app.layer()!.id));
  const head = h('header', { class: 'insp-head' }, link, h('span', { class: 'crumb-sep', attrs: { 'aria-hidden': 'true' }, text: '›' }), glyph, title, more);
  const draw = () => {
    const fx = app.effect()!, l = app.layer()!;
    link.textContent = fx.name;
    link.title = `Back to the effect's settings: ${fx.name} (Esc)`;
    link.setAttribute('aria-label', `Back to the effect: ${fx.name}`);
    title.textContent = l.name;
    title.title = l.name;
    more.setAttribute('aria-label', `More: ${l.name}`);
    const k = layerGlyphKey(l, urlOf);
    if (k !== glyphKey) { const g = layerGlyph(l, urlOf); glyph.replaceWith(g); glyph = g; glyphKey = k; }
  };
  draw();
  parts.push({ refresh: draw });
  return head;
}

// ---------------------------------------------------------------- the effect's settings

/** The Folder select's last choice: a value no folder can have (a folder's parts are trimmed, so none starts with a space). */
const NEW_FOLDER = ' new folder';

/**
 * The effect's own settings (docs/ui-redesign.md 6.6), as sections that fold: Effect (its name without its folder, the
 * folder, the game events), Scale (the three big controls), Phases (a bar of the three lengths, then the lengths), Colour
 * (the main colour, the colours of the effect, Edit palette…). One section element holds them (.bigcontrols: the effect's
 * settings, as the browser check and the settings inventory know them). Cost follows it, closed at first.
 */
function effectSections(app: AppApi, parts: Refresher[], colours: ColourListView): HTMLElement {
  return h('section', { class: 'card bigcontrols sections' },
    effectFold(app, parts), scaleFold(app, parts), phasesFold(app, parts), effectColourFold(app, parts, colours));
}

/** The Effect section: Name (without its folder), Folder, Game events. */
function effectFold(app: AppApi, parts: Refresher[]): HTMLElement {
  const fx = () => app.effect()!;
  const base = () => splitName(fx().name).base;
  /** The longest name the box takes: the 80 characters less its folder and " / ", as the list's rename box. */
  const room = () => { const f = folderOf(fx().name); return String(Math.max(1, NAME_MAX - (f ? f.length + FOLDER_SEP.length : 0))); };
  // The name is renamed by the Effects list's rules (one function): its folder stays, an empty name keeps the old one, a
  // name too long is refused. The box then shows the name as it is, also while it has the focus.
  const name = textField({ label: 'Name', value: base(), onChange: (v) => {
    app.renameEffectTo(fx().id, v);
    name.input.value = base();
  } });
  name.input.maxLength = Number(room());
  // Folder: No folder, the folders there are, New folder… (the question dialog). It rewrites the name as Move to folder…
  // does, in one undo step; a choice that does not move it (cancelled, too long) puts the select back.
  const options = () => [{ value: '', label: 'No folder' }, ...app.folders().map((f) => ({ value: f, label: f })), { value: NEW_FOLDER, label: 'New folder…' }];
  const current = () => folderOf(fx().name);
  const folder = selectField({ label: 'Folder', options: options(), value: current(), onChange: (v) => {
    const id = fx().id;
    if (v === NEW_FOLDER) void app.newFolder(id).finally(() => { if (app.effect()?.id === id) folder.set(current()); });
    else app.moveToFolder(id, v);
    folder.set(current());
  } });
  parts.push({ refresh: () => {
    name.set(base());
    name.input.maxLength = Number(room());
    folder.setOptions(options());
    folder.set(current());
  } });
  return fold('Effect', [name.el, folder.el, eventsField(app, parts)], true);
}

/** The Scale section: Size, Intensity, Duration, each a slider with its icon before its name. */
function scaleFold(app: AppApi, parts: Refresher[]): HTMLElement {
  const c = () => app.effect()!.controls;
  const size = slider({ label: 'Size', icon: 'size', min: 0.25, max: 3, step: 0.01, value: c().size, unit: '×', big: true, hint: 'Sprites, shapes, words, pieces and offsets. Not the start, the target or speeds.',
    onInput: (v) => app.editEffect(['controls', 'size'], v, { mergeKey: 'size', label: 'Size' }), onCommit: () => app.commit() });
  const intensity = slider({ label: 'Intensity', icon: 'intensity', min: 0, max: 3, step: 0.01, value: c().intensity, unit: '×', big: true, hint: 'Flashes, hits and landings grow; streaks get longer. Never see-through.',
    onInput: (v) => app.editEffect(['controls', 'intensity'], v, { mergeKey: 'intensity', label: 'Intensity' }), onCommit: () => app.commit() });
  const duration = slider({ label: 'Duration', icon: 'duration', min: 0.25, max: 4, step: 0.01, value: c().duration, unit: '×', big: true, hint: 'The effect\'s own times. A flight by speed still takes distance ÷ speed.',
    onInput: (v) => app.editEffect(['controls', 'duration'], v, { mergeKey: 'duration', label: 'Duration' }), onCommit: () => app.commit() });
  parts.push({ refresh: () => { size.set(c().size); intensity.set(c().intensity); duration.set(c().duration); } });
  return fold('Scale', [size.el, intensity.el, duration.el], true);
}

const PHASE_KEYS: readonly { key: 'windupMs' | 'peakMs' | 'fadeMs'; name: PhaseName; prefix: string }[] = [
  { key: 'windupMs', name: 'windup', prefix: 'W' }, { key: 'peakMs', name: 'peak', prefix: 'P' }, { key: 'fadeMs', name: 'fade', prefix: 'F' }];

/**
 * The Phases section: a 6 px bar of the three lengths in proportion, in the timeline's phase colours (empty when all three
 * are 0), then the three lengths on one row, each box with its prefix (W, P, F) and its unit; their full names are their
 * tooltips and their names for screen readers.
 */
function phasesFold(app: AppApi, parts: Refresher[]): HTMLElement {
  const ph = () => app.effect()!.phases;
  const segs = PHASE_KEYS.map((p) => h('span', { class: `phase-seg ${p.name}` }));
  const bar = h('div', { class: 'phase-bar', attrs: { role: 'img' } }, ...segs);
  const boxes = PHASE_KEYS.map((p) => numberBox({ label: PHASE_LABEL[p.name], prefix: p.prefix, value: ph()[p.key], step: 10, min: 0, unit: 'ms',
    onInput: (v) => app.editEffect(['phases', p.key], Math.max(0, Math.round(v)), { mergeKey: p.key, label: `${PHASE_LABEL[p.name]} length` }), onCommit: () => app.commit() }));
  const drawBar = () => {
    const ms = PHASE_KEYS.map((p) => ph()[p.key]);
    segs.forEach((s, i) => { s.style.flexGrow = String(ms[i]); s.hidden = ms[i]! <= 0; });
    const total = ms.reduce((a, b) => a + b, 0);
    bar.classList.toggle('none', total <= 0);
    const words = total > 0 ? PHASE_KEYS.map((p, i) => `${PHASE_LABEL[p.name]} ${ms[i]} ms`).join(', ') : 'No phases: all three lengths are 0 ms';
    bar.setAttribute('aria-label', words);
    tip(bar, words);
  };
  drawBar();
  parts.push({ refresh: () => { boxes.forEach((b, i) => b.set(ph()[PHASE_KEYS[i]!.key])); drawBar(); } });
  return fold('Phases', [bar, numberGroup({ label: 'Phase lengths', boxes, bare: true }),
    h('p', { class: 'hint', text: 'Layers can start with a phase or last until one ends.' })], true);
}

/**
 * The effect's Colour section: Main colour (its swatch, the role and an edit button that opens the colour picker on it),
 * the colours of the effect (the list shared with the layers' views; Show all next to the title), and "Edit palette…",
 * which opens the picker at the whole palette.
 */
function effectColourFold(app: AppApi, parts: Refresher[], colours: ColourListView): HTMLElement {
  const role = () => app.effect()!.controls.colour;
  const roles = () => roleNames(app.palette).map((r) => ({ value: r, label: r }));
  const edit: HTMLButtonElement = iconButton({ icon: 'edit', label: 'Edit the main colour', className: 'mini edit-colour', onClick: () => app.openColourPicker(role(), edit) });
  edit.setAttribute('aria-haspopup', 'dialog');
  const main = selectField({ label: 'Main colour', options: roles(), value: role(), swatch: roleHex(app), extra: edit, onChange: (v) => app.setMainColour(v) });
  main.el.classList.add('main-colour');
  const palette: HTMLButtonElement = h('button', { class: 'plain edit-palette', attrs: { type: 'button', 'aria-haspopup': 'dialog' }, on: { click: () => app.openPalette(role(), palette) } },
    icon('palette'), h('span', { text: 'Edit palette…' }));
  // The list of roles follows the palette (a colour added in the picker), and the swatch a faction change or an edit.
  parts.push({ refresh: () => { main.setOptions(roles()); main.set(role()); } });
  return fold('Colour', [main.el, colours.note, colours.el, colours.hint, h('div', { class: 'fold-foot' }, palette)], true, [colours.toggle]);
}

/** What draws the layer, in one line: its image, or code (a projectile draws nothing). Not a hint: it always shows. */
function drawsLine(app: AppApi, parts: Refresher[]): HTMLElement {
  const p = h('p', { class: 'draws' });
  let shown = '';
  const draw = () => {
    const l = app.layer() as Layer;
    const d = whatDraws(l);
    if (`${d.text}|${d.image}` === shown) return;
    shown = `${d.text}|${d.image}`;
    p.replaceChildren(...drawsParts(d));
    // What that means, in its tooltip (help.ts's texts for these lines).
    tip(p, d.image ? NEW_THIS_ROUND.drawnFromImage(d.image) : l.type === 'projectile' ? NEW_THIS_ROUND.invisiblePath : NEW_THIS_ROUND.drawnInCode);
  };
  draw();
  parts.push({ refresh: draw });
  return p;
}

/** "Image:" and the file name in Plex Mono (it is typed into files), or the words alone. */
function drawsParts(d: WhatDraws): (string | HTMLElement)[] {
  return d.image ? [`${d.text} `, h('code', { text: d.image })] : [d.text];
}

/** A projectile's riders: a button for each, which selects it, and a line saying what draws it. */
function ridersFold(app: AppApi, parts: Refresher[]): HTMLElement {
  const list = h('div', { class: 'riders' });
  const none = h('p', { class: 'readout' });
  let shown = '';
  const draw = () => {
    const fx = app.effect()!, p = app.layer()!;
    const riders = ridersOf(fx, p.id);
    const urlOf = (n: string) => app.imageUrl(n);
    const key = JSON.stringify([p.name, riders.map((r) => [r.id, r.name, layerGlyphKey(r, urlOf), riderLine(r)])]);
    if (key === shown) return;
    shown = key;
    list.replaceChildren(...riders.map((r) => h('button', { class: 'rider', title: `Select ${r.name}`, attrs: { type: 'button' }, on: { click: () => app.selectLayer(r.id) } },
      layerGlyph(r, urlOf), h('span', { class: 'rider-name', text: r.name }), h('span', { class: 'rider-what' }, ...drawsParts(riderLine(r))))));
    none.textContent = riders.length ? '' : `No layer rides it yet. A layer rides it when its Sits on is Rides "${p.name}".`;
    none.hidden = riders.length > 0;
  };
  draw();
  parts.push({ refresh: draw });
  return fold('Layers riding it', [list, none], true);
}

/** The Look: the layer alone, live. Folded, it stops and lets go of its renderer. */
function lookFold(look: LookView): HTMLElement {
  const d = fold('Look', [look.el], true);
  d.classList.add('look-fold');
  // Its title's tooltip is the help text for "Look" (help.ts), as for every section.
  d.addEventListener('toggle', () => look.setOpen(d.open));
  look.setOpen(d.open);
  return d;
}

/** The layer's Colour section: its colours (the list shared with the effect's view), Show all next to the title. */
function colourFold(colours: ColourListView, before: HTMLElement[] = []): HTMLElement {
  return fold('Colour', [...before, colours.note, colours.el, colours.hint], true, [colours.toggle]);
}

/** The game events the effect answers: names the game starts it by, such as rifle.shot. Checked as you type. */
function eventsField(app: AppApi, parts: Refresher[]): HTMLElement {
  const box = h('input', { class: 'text', attrs: { type: 'text', 'aria-label': 'Game events', placeholder: 'such as rifle.shot', spellcheck: 'false' } });
  const problems = h('ul', { class: 'problems event-problems' });
  const parse = (v: string) => v.split(/[\s,]+/).filter(Boolean);
  box.addEventListener('input', () => app.setEvents(parse(box.value)));
  box.addEventListener('change', () => { box.value = app.events().join(', '); });
  const draw = () => {
    if (document.activeElement !== box) box.value = app.events().join(', ');
    problems.replaceChildren(...app.eventProblems().map((p) => h('li', { text: p })));
  };
  draw();
  parts.push({ refresh: draw });
  // A property row: the label, the box; its problems and its hint under them, across the row.
  return h('div', { class: 'field prop events' },
    h('span', { class: 'flab', text: 'Game events' }), box, problems,
    // The game "starts" an effect by its names, as the tooltip (help.ts) and README say: one name for one thing.
    h('span', { class: 'hint', text: 'Names the game starts this effect by, separated by commas.' }));
}

const TIER_TEXT: Record<TierName, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/**
 * In which quality tiers the layer shows: three toggle chips, each with its tier's icon and word (on: the field colour, the
 * icon in --accent-ink). Each chip is a label round its real checkbox, which lies over the whole chip, see-through, so the
 * keyboard and a click work as on any checkbox. The last tier cannot be switched off: the layer would never draw.
 */
function tierFields(app: AppApi, parts: Refresher[]): HTMLElement {
  const V = () => app.layer() as VisibleLayer;
  const boxes = TIER_NAMES.map((t) => {
    const box = h('input', { attrs: { type: 'checkbox', 'aria-label': `Shows in ${TIER_TEXT[t]}` } });
    box.addEventListener('change', () => {
      const now = new Set(V().tiers);
      if (box.checked) now.add(t); else now.delete(t);
      if (!now.size) { box.checked = true; return; }
      app.editLayer(['tiers'], TIER_NAMES.filter((x) => now.has(x)), { label: 'Tiers' });
      app.commit();
    });
    return { t, box, el: h('label', { class: 'check tier tier-chip', attrs: { 'data-tier': t } }, box, icon(`tier-${t}`), h('span', { text: TIER_TEXT[t] })) };
  });
  const draw = () => {
    const on = V().tiers;
    for (const b of boxes) {
      b.box.checked = on.includes(b.t);
      // The only tier left stays: a layer in no tier would never be drawn.
      b.box.disabled = on.length === 1 && b.box.checked;
      b.el.title = b.box.disabled ? 'A layer must show in at least one tier' : '';
    }
  };
  draw();
  parts.push({ refresh: draw });
  // The label on the left, the chips on the right: three chips with their words need more room than the control column has
  // (about 190 px against 161 at 1920), so the row lets them start left of it, and in a panel too narrow for that they go
  // under the label.
  return h('div', { class: 'field prop tiers-row', attrs: { role: 'group', 'aria-label': 'Shows in' } }, h('span', { class: 'flab', text: 'Shows in' }),
    h('div', { class: 'tier-boxes' }, ...boxes.map((b) => b.el)),
    h('p', { class: 'hint', text: 'Low drops extras but must stay readable.' }));
}

// ---------------------------------------------------------------- the layer's details

/** A layer's kind, in its Layer section's header. */
const KIND: Record<Layer['type'], string> = { sprite: 'Sprite', projectile: 'Projectile', shape: 'Shape', burst: 'Burst', word: 'Word' };

/**
 * Everything of the layer, in one section element (the settings inventory of tools/ui-shots.mjs reads a layer from it), as
 * sections that fold: the Look (a live picture of the layer); Layer (what draws it, its name, its tiers; its kind in the
 * header); a projectile's riders; the type's own sections with its colours; then Time. The Colour section comes before the
 * long lists of settings, so it shows without scrolling: right after Layer for a shape, a burst or a word, after a
 * projectile's riders, and after a sprite's Image and Size and place (it holds the tint).
 */
function layerDetails(app: AppApi, layer: Layer, parts: Refresher[], colours: ColourListView, look: LookView): HTMLElement {
  const L = () => app.layer() as Layer;
  const box = h('section', { class: 'card layer sections' });
  // An empty name keeps "Layer"; the box then shows the name as it is, also while it has the focus.
  const name = textField({ label: 'Name', value: layer.name, onChange: (v) => {
    app.editLayer(['name'], v.trim() || 'Layer', { label: 'Rename layer' });
    name.input.value = L().name;
  } });
  parts.push({ refresh: () => name.set(L().name) });
  const rows: HTMLElement[] = [drawsLine(app, parts), name.el];
  if (layer.type !== 'projectile') rows.push(tierFields(app, parts));
  box.append(lookFold(look), fold('Layer', rows, true, [], { meta: h('span', { class: 'fold-meta', text: KIND[layer.type] }) }));
  if (layer.type === 'sprite') box.append(...spriteFields(app, parts, colours));
  else if (layer.type === 'projectile') box.append(ridersFold(app, parts), colourFold(colours), ...projectileFields(app, parts));
  else {
    box.append(colourFold(colours), placeFields(app, parts));
    if (layer.type === 'shape') box.append(fold(`Shape: ${layer.shape.kind}`, specForm(app, parts, ['shape'], layer.shape.kind, ['kind']), true));
    else box.append(fold(layer.type === 'burst' ? 'Pieces' : 'Word', specForm(app, parts, [], layer.type, COMMON_KEYS), true));
    box.append(fold('Animation', specForm(app, parts, [], 'anim', Object.keys(layer).filter((k) => k !== 'scale' && k !== 'alpha')), false));
    box.append(fold('Seed', specForm(app, parts, [], 'seed', ALL_BUT_SEED(layer)), false));
  }
  box.append(timeFields(app, parts));
  return box;
}

function spriteFields(app: AppApi, parts: Refresher[], colours: ColourListView): HTMLElement[] {
  const S = () => app.layer() as SpriteLayer;
  // Image, with the pivot shown as a dot: click the picture to move the pivot. The picture is as wide as the panel allows
  // and at most 160 px tall (--h-thumb), on the checkerboard, in a well as wide as the panel; --ar is its width over its
  // height, from the image once it has loaded.
  const image = selectField({ label: 'Image', options: app.imageNames().map((n) => ({ value: n, label: n })), value: S().image,
    onChange: (v) => { app.editLayer(['image'], v, { label: 'Image' }); app.commit(); } });
  const pic = h('div', { class: 'thumb-pic', title: 'Click to put the pivot here' });
  const thumb = h('div', { class: 'thumb' }, pic);
  const img = h('img', { attrs: { alt: '' } });
  const grid = h('div', { class: 'thumbgrid' });
  const dot = h('div', { class: 'pivot' });
  pic.append(img, grid, dot);
  const fit = () => { if (img.naturalWidth && img.naturalHeight) pic.style.setProperty('--ar', String(img.naturalWidth / img.naturalHeight)); };
  img.addEventListener('load', fit);
  img.addEventListener('error', () => { thumb.hidden = true; });
  pic.addEventListener('click', (e) => {
    const r = img.getBoundingClientRect();
    const fb = S().flipbook;
    const fw = r.width / (fb?.cols ?? 1), fh = r.height / (fb?.rows ?? 1);
    const u = Math.min(1, Math.max(0, ((e.clientX - r.left) % fw) / fw)), v = Math.min(1, Math.max(0, ((e.clientY - r.top) % fh) / fh));
    app.editLayer(['pivot'], [Math.round(u * 100) / 100, Math.round(v * 100) / 100], { label: 'Pivot' });
    app.commit();
  });
  // The pivot and the flipbook's grid: groups of numbers on one row, each box with a short prefix (its full name is its
  // tooltip). A drag on a prefix is one undo step (merged by key until the commit).
  const commit = () => app.commit();
  const pivotU = numberBox({ label: 'Pivot x', prefix: 'X', value: S().pivot[0], step: 0.01, min: 0, max: 1,
    onInput: (v) => app.editLayer(['pivot', 0], clamp01(v), { mergeKey: 'pivot0', label: 'Pivot' }), onCommit: commit });
  const pivotV = numberBox({ label: 'Pivot y', prefix: 'Y', value: S().pivot[1], step: 0.01, min: 0, max: 1,
    onInput: (v) => app.editLayer(['pivot', 1], clamp01(v), { mergeKey: 'pivot1', label: 'Pivot' }), onCommit: commit });
  const flip = checkField({ label: 'Flipbook', value: !!S().flipbook, onChange: (v) => { app.editLayer(['flipbook'], v ? { cols: 2, rows: 2, frames: 4, loop: false } : undefined, { label: 'Flipbook' }); app.commit(); } });
  const cols = numberBox({ label: 'Columns', prefix: 'Cols', value: S().flipbook?.cols ?? 1, step: 1, min: 1, max: 64, onInput: (v) => fb('cols', v), onCommit: commit });
  const rows = numberBox({ label: 'Rows', prefix: 'Rows', value: S().flipbook?.rows ?? 1, step: 1, min: 1, max: 64, onInput: (v) => fb('rows', v), onCommit: commit });
  const frames = numberBox({ label: 'Frames', prefix: 'Frames', value: S().flipbook?.frames ?? 1, step: 1, min: 1, onInput: (v) => fb('frames', v), onCommit: commit });
  const loop = checkField({ label: 'Loop the frames', value: S().flipbook?.loop ?? false, onChange: (v) => { app.editLayer(['flipbook', 'loop'], v, { label: 'Loop frames' }); app.commit(); } });
  const fb = (k: 'cols' | 'rows' | 'frames', v: number) => {
    const f = S().flipbook; if (!f) return;
    const next = { ...f, [k]: Math.max(1, Math.round(v)) };
    if (k !== 'frames') next.frames = Math.min(next.frames, next.cols * next.rows) || next.cols * next.rows;
    next.frames = Math.min(next.frames, next.cols * next.rows);
    // A number that rounds to the grid as it is (2.4 columns) changes nothing: no undo step, nothing unsaved.
    if (next.cols === f.cols && next.rows === f.rows && next.frames === f.frames) return;
    app.editLayer(['flipbook'], next, { mergeKey: `flipbook-${k}`, label: 'Flipbook grid' });
  };
  const fbBox = numberGroup({ label: 'Grid', boxes: [cols, rows, frames] });
  const drawThumb = () => {
    const s = S();
    const url = app.imageUrl(s.image) ?? '';
    if (img.getAttribute('src') !== url) { img.src = url; thumb.hidden = !url; }
    fit();
    grid.style.backgroundSize = s.flipbook ? `${100 / s.flipbook.cols}% ${100 / s.flipbook.rows}%` : '100% 100%';
    grid.classList.toggle('on', !!s.flipbook);
    const cw = 100 / (s.flipbook?.cols ?? 1), ch = 100 / (s.flipbook?.rows ?? 1);
    dot.style.left = `${s.pivot[0] * cw}%`;
    dot.style.top = `${s.pivot[1] * ch}%`;
    fbBox.hidden = !s.flipbook;
    loop.el.hidden = !s.flipbook;
  };
  drawThumb();

  // Size and facing.
  const w = slider({ label: 'Width', min: 0.05, max: 12, step: 0.01, value: S().sizeM[0], unit: 'm', onInput: (v) => app.editLayer(['sizeM', 0], v, { mergeKey: 'w', label: 'Width' }), onCommit: () => app.commit() });
  const hh = slider({ label: 'Height', min: 0.05, max: 12, step: 0.01, value: S().sizeM[1], unit: 'm', onInput: (v) => app.editLayer(['sizeM', 1], v, { mergeKey: 'h', label: 'Height' }), onCommit: () => app.commit() });
  const facing = segmented({ label: 'Faces', options: FACES_SPRITE, value: S().facing, onChange: (v) => { app.editLayer(['facing'], v, { label: 'Facing' }); app.commit(); } });

  // Where it sits.
  const anchorOptions = () => [
    { value: 'input:origin', label: 'The origin (muzzle)' },
    { value: 'input:target', label: 'The target' },
    ...app.effect()!.layers.filter((l) => l.type === 'projectile').map((l) => ({ value: `layer:${l.id}`, label: `Rides "${l.name}"` })),
  ];
  const anchorValue = () => { const a = S().at; return isInputAnchor(a) ? `input:${a.input}` : `layer:${a.layer}`; };
  const anchor = selectField({ label: 'Sits on', options: anchorOptions(), value: anchorValue(), onChange: (v) => {
    const [kind, id] = v.split(':') as [string, string];
    const s = S();
    let next: SpriteLayer = { ...s, at: kind === 'input' ? { input: id as 'origin' | 'target', offset: isInputAnchor(s.at) ? s.at.offset : [0, 0, 0] } : { layer: id } };
    // A sprite that no longer rides a projectile needs its own duration.
    if (kind === 'input' && next.durationMs === undefined && !(next.flipbook && !next.flipbook.loop)) next = { ...next, durationMs: 250 };
    app.replaceLayer(next, 'Sits on'); app.commit();
  } });
  const offset = offsetFields(app, 'offset', () => (isInputAnchor(S().at) ? (S().at as InputAnchor).offset : null), (o, mergeKey) => app.editLayer(['at', 'offset'], o, { mergeKey, label: 'Offset' }));

  // Colour. The two choices' words do not fit on one line in the 296 px panel: "Keep" and "Multiply", the full words in
  // their tooltips (docs/ui-redesign.md 6.6).
  const roleOpts = () => [{ value: MAIN_ROLE, label: 'main (the effect\'s colour)' }, ...roleNames(app.palette).map((r) => ({ value: r, label: r }))];
  const tintMode = segmented({ label: 'Colour', options: [{ value: 'keep', label: 'Keep the image\'s colours', short: 'Keep' }, { value: 'multiply', label: 'Multiply by a colour role', short: 'Multiply' }],
    value: S().tint.mode, onChange: (v) => { app.editLayer(['tint'], v === 'keep' ? { mode: 'keep' } : { mode: 'multiply', role: MAIN_ROLE }, { label: 'Colour' }); app.commit(); } });
  const role = selectField({ label: 'Role', options: roleOpts(), value: S().tint.mode === 'multiply' ? (S().tint as { role: string }).role : MAIN_ROLE, swatch: roleHex(app),
    onChange: (v) => { app.editLayer(['tint', 'role'], v, { label: 'Colour role' }); app.commit(); } });

  parts.push({ refresh: () => {
    const s = S();
    image.setOptions(app.imageNames().map((n) => ({ value: n, label: n })));
    image.set(s.image); pivotU.set(s.pivot[0]); pivotV.set(s.pivot[1]); flip.set(!!s.flipbook);
    cols.set(s.flipbook?.cols ?? 1); rows.set(s.flipbook?.rows ?? 1); frames.set(s.flipbook?.frames ?? 1); loop.set(s.flipbook?.loop ?? false);
    drawThumb(); w.set(s.sizeM[0]); hh.set(s.sizeM[1]); facing.set(s.facing);
    anchor.setOptions(anchorOptions()); anchor.set(anchorValue()); offset.refresh();
    tintMode.set(s.tint.mode); role.setOptions(roleOpts()); role.set(s.tint.mode === 'multiply' ? s.tint.role : MAIN_ROLE);
    role.el.hidden = s.tint.mode !== 'multiply';
  } });
  role.el.hidden = S().tint.mode !== 'multiply';

  return [
    fold('Image', [image.el, thumb, numberGroup({ label: 'Pivot', boxes: [pivotU, pivotV] }), flip.el, fbBox, loop.el,
      h('div', { class: 'fold-foot' }, h('button', { class: 'plain add-images', attrs: { type: 'button' }, on: { click: () => app.importImages() } }, icon('import'), h('span', { text: 'Add PNG images…' })))], true),
    fold('Size and place', [w.el, hh.el, facing.el, anchor.el, offset.el], true),
    // One Colour section: how the image is tinted, then the colours that gives the sprite.
    colourFold(colours, [tintMode.el, role.el]),
  ];
}

function projectileFields(app: AppApi, parts: Refresher[]): HTMLElement[] {
  const P = () => app.layer() as ProjectileLayer;
  const endSel = (key: 'from' | 'to', label: string) => {
    const sel = segmented({ label, options: [{ value: 'origin', label: 'Origin (muzzle)' }, { value: 'target', label: 'Target' }], value: P()[key].input,
      onChange: (v) => { app.editLayer([key, 'input'], v, { label }); app.commit(); }, small: true });
    const off = offsetFields(app, `${key}-offset`, () => P()[key].offset, (o, mergeKey) => app.editLayer([key, 'offset'], o, { mergeKey, label: `${label} offset` }));
    parts.push({ refresh: () => { sel.set(P()[key].input); off.refresh(); } });
    return [sel.el, off.el];
  };
  const fl = () => P().flight;
  const flightMode = segmented({ label: 'Flight', small: true, value: fl().mode,
    options: [{ value: 'speed', label: 'By speed', short: 'Speed' }, { value: 'time', label: 'Fixed time', short: 'Time' }, { value: 'phase', label: 'One phase', short: 'Phase' }],
    onChange: (v) => {
      const next = v === 'speed' ? { mode: 'speed', mps: 40 } : v === 'time' ? { mode: 'time', ms: 500 } : { mode: 'phase', phase: 'windup' };
      app.editLayer(['flight'], next, { label: 'Flight' }); app.commit();
    } });
  const speed = slider({ label: 'Speed', min: 1, max: 1200, step: 1, value: fl().mode === 'speed' ? (fl() as { mps: number }).mps : 40, unit: 'm/s', digits: 0,
    hint: 'Flight time = distance ÷ speed. A rifle at real speed lands within one 1/12 s step.',
    onInput: (v) => app.editLayer(['flight', 'mps'], v, { mergeKey: 'speed', label: 'Speed' }), onCommit: () => app.commit() });
  const flightMs = numberField({ label: 'Flight time', value: fl().mode === 'time' ? (fl() as { ms: number }).ms : 500, step: 10, min: 1, unit: 'ms',
    onInput: (v) => app.editLayer(['flight', 'ms'], Math.max(1, v), { mergeKey: 'flight-ms', label: 'Flight time' }), onCommit: () => app.commit() });
  const flightPhase = selectField({ label: 'Flies during', options: PHASE_NAMES.map((n) => ({ value: n, label: PHASE_LABEL[n] })),
    value: fl().mode === 'phase' ? (fl() as { phase: PhaseName }).phase : 'windup',
    onChange: (v) => { app.editLayer(['flight', 'phase'], v, { label: 'Flies during' }); app.commit(); } });
  const arc = slider({ label: 'Arc height', min: 0, max: 30, step: 0.1, value: P().arcM, unit: 'm',
    hint: 'How high the path rises above the straight line, at the middle. 0 flies straight.',
    onInput: (v) => app.editLayer(['arcM'], v, { mergeKey: 'arc', label: 'Arc height' }), onCommit: () => app.commit() });
  const showMode = () => {
    const m = fl().mode;
    speed.el.hidden = m !== 'speed';
    flightMs.el.hidden = m !== 'time';
    flightPhase.el.hidden = m !== 'phase';
  };
  showMode();
  const stretch = slider({ label: 'Stretch along the path', min: 0.1, max: 20, step: 0.05, value: P().stretch, unit: '×',
    hint: 'How much longer the sprites that ride it and face along the path get.',
    onInput: (v) => app.editLayer(['stretch'], v, { mergeKey: 'stretch', label: 'Stretch' }), onCommit: () => app.commit() });
  const spin = slider({ label: 'Spin', min: -1440, max: 1440, step: 10, value: P().spinDegPerS, unit: '°/s', digits: 0,
    hint: 'How fast the sprites that ride it turn in their own plane.',
    onInput: (v) => app.editLayer(['spinDegPerS'], v, { mergeKey: 'spin', label: 'Spin' }), onCommit: () => app.commit() });
  const flight = h('p', { class: 'readout' });
  const showFlight = () => {
    const span = app.timeline()?.byId.get(P().id);
    flight.textContent = span?.flight ? `Now: ${span.flight.ms.toFixed(0)} ms in the air over ${dist(span.flight.from, span.flight.to).toFixed(1)} m.` : '';
  };
  showFlight();
  parts.push({ refresh: () => {
    const f = fl();
    flightMode.set(f.mode);
    if (f.mode === 'speed') speed.set(f.mps);
    else if (f.mode === 'time') flightMs.set(f.ms);
    else flightPhase.set(f.phase);
    arc.set(P().arcM); stretch.set(P().stretch); spin.set(P().spinDegPerS); showMode(); showFlight();
  } });
  return [
    fold('Path', [...endSel('from', 'From'), ...endSel('to', 'To')], true),
    // Its readout ("Now: 9 ms in the air over 7.2 m.") at the end of the section, as every readout.
    fold('Motion', [flightMode.el, speed.el, flightMs.el, flightPhase.el, arc.el, stretch.el, spin.el, flight], true),
  ];
}

function timeFields(app: AppApi, parts: Refresher[]): HTMLElement {
  const L = () => app.layer() as Layer;
  const mode = segmented({ label: 'Moves', options: [{ value: 'steps', label: 'In steps' }, { value: 'smooth', label: 'Smoothly' }], value: L().timing.mode,
    onChange: (v) => { app.editLayer(['timing'], v === 'steps' ? { mode: 'steps', perSecond: 12 } : { mode: 'smooth' }, { label: 'Moves' }); app.commit(); } });
  const rate = numberField({ label: 'Steps a second', value: L().timing.mode === 'steps' ? (L().timing as { perSecond: number }).perSecond : 12, step: 1, min: 1, max: 60,
    onInput: (v) => app.editLayer(['timing', 'perSecond'], Math.max(1, Math.min(60, Math.round(v))), { mergeKey: 'per-second', label: 'Steps a second' }), onCommit: () => app.commit() });
  // Starts: with the effect, with a phase, or when a projectile lands. The delay is kept when the choice changes.
  const startOptions = () => [
    { value: 'effect', label: 'With the effect' },
    ...PHASE_NAMES.map((n) => ({ value: `phase:${n}`, label: `When the ${PHASE_LABEL[n].toLowerCase()} starts` })),
    ...app.effect()!.layers.filter((l) => l.type === 'projectile' && l.id !== L().id).map((l) => ({ value: `land:${l.id}`, label: `When "${l.name}" lands` })),
  ];
  const startOf = () => { const st = L().start; return isArrivalStart(st) ? `land:${st.arrivalOf}` : 'phase' in st ? `phase:${st.phase}` : 'effect'; };
  const startSel = selectField({ label: 'Starts', options: startOptions(), value: startOf(), onChange: (v) => {
    const ms = L().start.ms;
    const [k, id] = v.split(':') as [string, string | undefined];
    const next = k === 'land' ? { arrivalOf: id!, ms } : k === 'phase' ? { phase: id as PhaseName, ms } : { ms };
    app.editLayer(['start'], next, { label: 'Starts' }); app.commit();
  } });
  const delay = numberField({ label: 'Delay', value: L().start.ms, step: 10, min: 0, unit: 'ms',
    onInput: (v) => app.editLayer(['start', 'ms'], Math.max(0, v), { mergeKey: 'delay', label: 'Delay' }), onCommit: () => app.commit() });
  // Lasts: automatically, a fixed time, or until a phase ends (visible layers; a projectile lasts its flight).
  const lastOptions = [{ value: 'auto', label: 'Automatically' }, { value: 'fixed', label: 'A fixed time' },
    ...PHASE_NAMES.map((n) => ({ value: `until:${n}`, label: `Until the ${PHASE_LABEL[n].toLowerCase()} ends` }))];
  const lastOf = () => { const l = L() as VisibleLayer; return l.durationMs !== undefined ? 'fixed' : l.untilPhaseEnd ? `until:${l.untilPhaseEnd}` : 'auto'; };
  const lastSel = selectField({ label: 'Lasts', options: lastOptions, value: lastOf(), onChange: (v) => {
    const l = L() as VisibleLayer;
    const next: VisibleLayer = { ...l };
    delete next.durationMs;
    delete next.untilPhaseEnd;
    if (v === 'fixed') next.durationMs = Math.round(spanMs(app) || 250);
    else if (v.startsWith('until:')) next.untilPhaseEnd = v.slice(6) as PhaseName;
    app.replaceLayer(next, 'Lasts'); app.commit();
  } });
  const dur = numberField({ label: 'Length', value: (L() as SpriteLayer).durationMs ?? 0, step: 10, min: 1, unit: 'ms',
    onInput: (v) => app.editLayer(['durationMs'], Math.max(1, v), { mergeKey: 'length', label: 'Length' }), onCommit: () => app.commit() });
  const span = h('p', { class: 'readout' });
  const show = () => {
    const l = L();
    rate.el.hidden = l.timing.mode !== 'steps';
    const visible = l.type !== 'projectile';
    lastSel.el.hidden = !visible;
    dur.el.hidden = !(visible && (l as VisibleLayer).durationMs !== undefined);
    const s = app.timeline()?.byId.get(l.id);
    span.textContent = s ? `Shows from ${s.startMs.toFixed(0)} to ${s.endMs.toFixed(0)} ms (with the current target).` : '';
  };
  show();
  parts.push({ refresh: () => {
    const l = L();
    mode.set(l.timing.mode); rate.set(l.timing.mode === 'steps' ? l.timing.perSecond : 12);
    startSel.setOptions(startOptions()); startSel.set(startOf()); delay.set(l.start.ms);
    if (l.type !== 'projectile') { lastSel.set(lastOf()); dur.set(l.durationMs ?? 0); }
    show();
  } });
  return fold('Time', [mode.el, rate.el, startSel.el, delay.el, lastSel.el, dur.el, span], true);
}

/** Where a shape, burst or word sits, which way it faces, how it mixes, and a nudge in its own plane. */
function placeFields(app: AppApi, parts: Refresher[]): HTMLElement {
  const V = () => app.layer() as VisibleLayer;
  const anchorOptions = () => [
    { value: 'input:origin', label: 'The origin (muzzle)' },
    { value: 'input:target', label: 'The target' },
    ...app.effect()!.layers.filter((l) => l.type === 'projectile').map((l) => ({ value: `layer:${l.id}`, label: `Rides "${l.name}"` })),
  ];
  const anchorValue = () => { const a = V().at; return isInputAnchor(a) ? `input:${a.input}` : `layer:${a.layer}`; };
  const anchor = selectField({ label: 'Sits on', options: anchorOptions(), value: anchorValue(), onChange: (v) => {
    const [kind, id] = v.split(':') as [string, string];
    const l = V();
    app.editLayer(['at'], kind === 'input' ? { input: id, offset: isInputAnchor(l.at) ? l.at.offset : [0, 0, 0] } : { layer: id }, { label: 'Sits on' }); app.commit();
  } });
  const offset = offsetFields(app, 'offset', () => (isInputAnchor(V().at) ? (V().at as InputAnchor).offset : null), (o, mergeKey) => app.editLayer(['at', 'offset'], o, { mergeKey, label: 'Offset' }));
  const facing = selectField({ label: 'Faces', value: V().facing, options: [{ value: 'camera', label: 'The camera' }, { value: 'path', label: 'Along the path' },
    { value: 'ground', label: 'Flat on the ground' }, { value: 'upright', label: 'Upright (true heights)' }],
    onChange: (v) => { app.editLayer(['facing'], v, { label: 'Faces' }); app.commit(); } });
  const blend = selectField({ label: 'Mixes', value: V().blend, options: [{ value: 'normal', label: 'Normal' }, { value: 'add', label: 'Adds light' },
    { value: 'screen', label: 'Lightens the ground (screen)' }, { value: 'multiply', label: 'Darkens the ground (multiply)' }],
    onChange: (v) => { app.editLayer(['blend'], v, { label: 'Mixes' }); app.commit(); } });
  // The nudge: right and up on one row ("R", "U"). Its first change adds shiftM, which builds the panel again: the drag goes on
  // (scrubDrag follows the pointer on the window) and stays one undo step.
  const sx = numberBox({ label: 'Nudge right', prefix: 'R', value: V().shiftM?.[0] ?? 0, step: 0.05,
    onInput: (v) => app.editLayer(['shiftM'], [v, V().shiftM?.[1] ?? 0], { mergeKey: 'nudge-right', label: 'Nudge' }), onCommit: () => app.commit() });
  const sy = numberBox({ label: 'Nudge up', prefix: 'U', value: V().shiftM?.[1] ?? 0, step: 0.05,
    onInput: (v) => app.editLayer(['shiftM'], [V().shiftM?.[0] ?? 0, v], { mergeKey: 'nudge-up', label: 'Nudge' }), onCommit: () => app.commit() });
  const lift = numberField({ label: 'Lift off the ground', value: V().liftM ?? 0, step: 0.05, min: 0, unit: 'm',
    onInput: (v) => app.editLayer(['liftM'], v > 0 ? v : undefined, { mergeKey: 'lift', label: 'Lift' }), onCommit: () => app.commit() });
  parts.push({ refresh: () => {
    const l = V();
    anchor.setOptions(anchorOptions()); anchor.set(anchorValue()); offset.refresh(); facing.set(l.facing); blend.set(l.blend);
    sx.set(l.shiftM?.[0] ?? 0); sy.set(l.shiftM?.[1] ?? 0); lift.set(l.liftM ?? 0); lift.el.hidden = l.facing !== 'ground';
  } });
  lift.el.hidden = V().facing !== 'ground';
  return fold('Place', [anchor.el, offset.el, facing.el, blend.el, numberGroup({ label: 'Nudge', boxes: [sx, sy], unit: 'm' }), lift.el], true);
}

/** Fields every visible layer has, edited elsewhere (Place, Time), so the generated form leaves them out. */
const COMMON_KEYS = ['id', 'name', 'type', 'start', 'timing', 'tiers', 'at', 'facing', 'blend', 'durationMs', 'untilPhaseEnd', 'scale', 'alpha', 'shiftM', 'liftM', 'seed', 'perPlay'];
const ALL_BUT_SEED = (l: Layer) => Object.keys(l).filter((k) => k !== 'seed' && k !== 'perPlay');

/**
 * An offset: right, up and forward (towards the target) on one row, "R", "U" and "F" in the boxes, their full names (Right,
 * Up, Forward) in the tooltips. `key` keeps each box's drag one undo step.
 */
function offsetFields(app: AppApi, key: string, get: () => Vec3 | null, set: (o: Vec3, mergeKey: string) => void): { el: HTMLElement; refresh(): void } {
  const axis = (i: 0 | 1 | 2, label: string, prefix: string) => numberBox({ label, prefix, value: get()?.[i] ?? 0, step: 0.05,
    onInput: (v) => { const o = [...(get() ?? [0, 0, 0])] as Vec3; o[i] = v; set(o, `${key}-${i}`); }, onCommit: () => app.commit() });
  const x = axis(0, 'Right', 'R'), y = axis(1, 'Up', 'U'), z = axis(2, 'Forward', 'F');
  const el = numberGroup({ label: 'Offset', boxes: [x, y, z], unit: 'm' });
  const refresh = () => { const o = get(); el.hidden = !o; if (o) { x.set(o[0]); y.set(o[1]); z.set(o[2]); } };
  refresh();
  return { el, refresh };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function spanMs(app: AppApi): number {
  const l = app.layer();
  const s = l ? app.timeline()?.byId.get(l.id) : undefined;
  return s ? s.endMs - s.startMs : 0;
}
