/**
 * The right panel shows what is selected: the effect's settings, or, with a layer selected, that layer's settings first.
 * Each starts with the panel's 40 px header, which stays at the top while the panel scrolls: the effect's (a dot in its main
 * colour, its name and "Effect"), or the layer's, which leads back to the effect (its name, or Esc). Cost and Checks stay at
 * the bottom of both. Fields are built once per selection and refreshed in place, so a slider keeps working while you drag it.
 */
import { MAIN_ROLE, PHASE_NAMES, TIER_NAMES, isArrivalStart, isInputAnchor, resolveRole, roleNames } from '@shamble/vfx-format';
import type { InputAnchor, Layer, PhaseName, ProjectileLayer, SpriteLayer, TierName, Vec3, VisibleLayer } from '@shamble/vfx-format';
import { riderLine, ridersOf, whatDraws } from '../doc/layer-info';
import type { WhatDraws } from '../doc/layer-info';
import type { AppApi } from './api';
import { colourList } from './colourlist';
import type { ColourListView } from './colourlist';
import { costCard } from './costcard';
import { checkField, fold, h, numberField, segmented, selectField, slider, textField, tip } from './dom';
import { NEW_THIS_ROUND } from './help';
import { layerGlyph, layerGlyphKey } from './layer-icons';
import { LookView } from './look';
import { specForm, structureOf } from './specform';

interface Refresher { refresh(): void }

/** The inspector rebuilds when the effect, the layer or the layer's structure (a part switched on, a tone added) changes. */
function keyOf(fxId: string | undefined, layer: Layer | undefined): string {
  return `${fxId}|${layer?.id}|${layer?.type}|${layer ? structureOf(layer) : ''}`;
}

const PHASE_LABEL: Record<PhaseName, string> = { windup: 'Wind-up', peak: 'Peak', fade: 'Fade' };

export interface InspectorView {
  el: HTMLElement;
  rebuild(): void;
  refresh(): void;
  backToEffect(): void;
  /** The live picture at the top of a layer's settings (the app draws it in its frames). */
  look: LookView;
}

export function buildInspector(app: AppApi): InspectorView {
  // data-help-*: where the help texts in the tooltips look for the layer type and shape kind shown (src/app/helptips.ts).
  const el = h('aside', { class: 'inspector', attrs: { 'aria-label': 'Effect and layer settings', 'data-help-panel': '' } });
  // One colour list for the panel: each view puts it in its place, so the colours can move from one selection to the next.
  const colours = colourList(app);
  // One Look too: a layer's view puts it at its top, and its renderer lives while a layer's view shows it.
  const look = new LookView();
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
    el.replaceChildren();
    // Another effect or layer starts at the top of the panel (a part switched on rebuilds too, and keeps its place).
    const selection = `${fx?.id}|${layer?.id}`;
    const another = selection !== shownSelection;
    if (another) { shownSelection = selection; if (el.parentElement) el.parentElement.scrollTop = 0; }
    look.setShown(!!(fx && layer));
    if (!fx) { el.append(h('p', { class: 'empty', text: 'Open or make an effect.' })); return; }
    if (layer) el.append(layerHeader(app, parts, backToEffect), layerDetails(app, layer, parts, colours, look));
    else el.append(effectHeader(app, parts), bigControls(app, parts, colours), h('p', { class: 'empty', text: 'Pick a layer on the left to see its details.' }));
    const cost = costCard(app);
    parts.push(cost);
    el.append(cost.el, checks(app, parts));
    colours.refresh();
    // The control that had the focus (the way back, a rider) went with the old view: the new view's title takes it, so the
    // keyboard carries on from the top of what is now selected.
    if (another && hadFocus) (el.querySelector('.insp-title, .bigcontrols > h2') as HTMLElement | null)?.focus({ preventScroll: true });
  };
  const refresh = () => {
    const fx = app.effect();
    const layer = app.layer();
    if (keyOf(fx?.id, layer) !== builtFor) { rebuild(); return; }
    for (const p of parts) p.refresh();
    colours.refresh();
  };
  rebuild();
  return { el, rebuild, refresh, backToEffect, look };
}

// ---------------------------------------------------------------- the headers

/**
 * The header of the effect's own settings: a dot in its main colour (for the faction shown), its name and "Effect". Its
 * title takes the focus when you come back from a layer with the keyboard (see rebuild).
 */
function effectHeader(app: AppApi, parts: Refresher[]): HTMLElement {
  const dot = h('span', { class: 'fx-dot' });
  const title = h('h2', { class: 'insp-title', attrs: { tabindex: '-1' } });
  const head = h('header', { class: 'insp-head effect-head' }, dot, title, h('span', { class: 'insp-kind', text: 'Effect' }));
  const draw = () => {
    const fx = app.effect()!;
    title.textContent = fx.name;
    title.title = fx.name;
    const role = fx.controls.colour;
    dot.style.backgroundColor = resolveRole(app.palette, role, app.faction) ?? 'transparent';
    tip(dot, `Main colour: ${role}`);
  };
  draw();
  parts.push({ refresh: draw });
  return head;
}

/** The effect's name (back to the effect's settings), "›", the layer's type icon and its name. */
function layerHeader(app: AppApi, parts: Refresher[], back: () => void): HTMLElement {
  const link = h('button', { class: 'crumb', attrs: { type: 'button' }, on: { click: back } });
  const title = h('h2', { class: 'insp-title', attrs: { tabindex: '-1' } });
  // The layer's icon (a sprite: its image). A new kind, look or image does not rebuild the panel, so draw() swaps it.
  const urlOf = (n: string) => app.imageUrl(n);
  let glyphKey = layerGlyphKey(app.layer()!, urlOf);
  let glyph = layerGlyph(app.layer()!, urlOf);
  const head = h('header', { class: 'insp-head' }, link, h('span', { class: 'crumb-sep', attrs: { 'aria-hidden': 'true' }, text: '›' }), glyph, title);
  const draw = () => {
    const fx = app.effect()!, l = app.layer()!;
    link.textContent = fx.name;
    link.title = `Back to the effect's settings: ${fx.name} (Esc)`;
    link.setAttribute('aria-label', `Back to the effect: ${fx.name}`);
    title.textContent = l.name;
    title.title = l.name;
    const k = layerGlyphKey(l, urlOf);
    if (k !== glyphKey) { const g = layerGlyph(l, urlOf); glyph.replaceWith(g); glyph = g; glyphKey = k; }
  };
  draw();
  parts.push({ refresh: draw });
  return head;
}

// ---------------------------------------------------------------- the big controls

function bigControls(app: AppApi, parts: Refresher[], colours: ColourListView): HTMLElement {
  const c = () => app.effect()!.controls;
  const name = textField({ label: 'Effect name', value: app.effect()!.name, onChange: (v) => app.editEffect(['name'], v.trim() || 'Effect', { label: 'Rename effect' }) });
  const size = slider({ label: 'Size', min: 0.25, max: 3, step: 0.01, value: c().size, unit: '×', big: true, hint: 'Sprites, shapes, words, pieces and offsets. Not the start, the target or speeds.',
    onInput: (v) => app.editEffect(['controls', 'size'], v, { mergeKey: 'size', label: 'Size' }), onCommit: () => app.commit() });
  const intensity = slider({ label: 'Intensity', min: 0, max: 3, step: 0.01, value: c().intensity, unit: '×', big: true, hint: 'Flashes, hits and landings grow; streaks get longer. Never see-through.',
    onInput: (v) => app.editEffect(['controls', 'intensity'], v, { mergeKey: 'intensity', label: 'Intensity' }), onCommit: () => app.commit() });
  const duration = slider({ label: 'Duration', min: 0.25, max: 4, step: 0.01, value: c().duration, unit: '×', big: true, hint: 'The effect\'s own times. A flight by speed still takes distance ÷ speed.',
    onInput: (v) => app.editEffect(['controls', 'duration'], v, { mergeKey: 'duration', label: 'Duration' }), onCommit: () => app.commit() });
  const ph = () => app.effect()!.phases;
  const phase = (key: 'windupMs' | 'peakMs' | 'fadeMs', label: string) => numberField({ label, value: ph()[key], step: 10, min: 0, unit: 'ms',
    onChange: (v) => { app.editEffect(['phases', key], Math.max(0, Math.round(v)), { label: `${label} length` }); app.commit(); } });
  const windup = phase('windupMs', 'Wind-up'), peak = phase('peakMs', 'Peak'), fadeF = phase('fadeMs', 'Fade');
  parts.push({ refresh: () => {
    name.set(app.effect()!.name); size.set(c().size); intensity.set(c().intensity); duration.set(c().duration);
    windup.set(ph().windupMs); peak.set(ph().peakMs); fadeF.set(ph().fadeMs);
  } });
  const events = eventsField(app, parts);
  // Its title takes the focus when you come back from a layer with the keyboard (see rebuild).
  return h('section', { class: 'card bigcontrols' },
    h('h2', { text: 'Effect', attrs: { tabindex: '-1' } }), name.el, events, size.el, intensity.el, duration.el,
    h('div', { class: 'row' }, h('div', { class: 'lab' }, h('span', { text: 'Phases' }), h('span', { class: 'hint', text: 'layers can start with a phase or last until one ends' })),
      h('div', { class: 'fieldrow' }, windup.el, peak.el, fadeF.el)),
    // The effect's colours: its main colour (marked) and every layer's. Show all shows the whole palette.
    h('div', { class: 'row colour-row' }, h('div', { class: 'lab' }, h('span', { text: 'Colour' }), colours.toggle), colours.note, colours.el, colours.hint));
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
  return h('div', { class: 'field wide events' },
    h('span', { class: 'flab', text: 'Game events it answers' }), box, problems,
    // The game "starts" an effect by its names, as the tooltip (help.ts) and README say: one name for one thing.
    h('span', { class: 'hint', text: 'Names the game starts this effect by, separated by commas.' }));
}

const TIER_TEXT: Record<TierName, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** In which quality tiers the layer shows. The last tier cannot be unticked: the layer would never draw. */
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
    return { t, box, el: h('label', { class: 'check tier' }, box, h('span', { text: TIER_TEXT[t] })) };
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
  return h('div', { class: 'row tiers' }, h('div', { class: 'lab' }, h('span', { text: 'Shows in' }), h('span', { class: 'hint', text: 'Low drops extras but must stay readable' })),
    h('div', { class: 'tier-boxes' }, ...boxes.map((b) => b.el)));
}

// ---------------------------------------------------------------- the layer's details

/**
 * Everything of the layer, in one card (the settings inventory of tools/ui-shots.mjs reads a layer from it): the Look (a
 * live picture of the layer); its kind, what draws it, its name and tiers; a projectile's riders; the type's own sections
 * with its colours; then Time. The Colour section comes before the long lists of settings, so it shows without scrolling:
 * right after the name and tiers of a shape, a burst or a word, after a projectile's riders, and after a sprite's Image and
 * Size and place (it holds the tint).
 */
function layerDetails(app: AppApi, layer: Layer, parts: Refresher[], colours: ColourListView, look: LookView): HTMLElement {
  const L = () => app.layer() as Layer;
  const box = h('section', { class: 'card layer' });
  const name = textField({ label: 'Layer name', value: layer.name, onChange: (v) => app.editLayer(['name'], v.trim() || 'Layer', { label: 'Rename layer' }) });
  parts.push({ refresh: () => name.set(L().name) });
  const title = { sprite: 'Sprite layer', projectile: 'Projectile layer', shape: 'Shape layer', burst: 'Burst layer', word: 'Word layer' }[layer.type];
  box.append(lookFold(look), h('h2', { text: title }), drawsLine(app, parts), name.el);
  if (layer.type !== 'projectile') box.append(tierFields(app, parts));
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
  // Image, with the pivot shown as a dot: click the picture to move the pivot.
  const image = selectField({ label: 'Image', options: app.imageNames().map((n) => ({ value: n, label: n })), value: S().image,
    onChange: (v) => { app.editLayer(['image'], v, { label: 'Image' }); app.commit(); } });
  const thumb = h('div', { class: 'thumb', title: 'Click to put the pivot here' });
  const img = h('img', { attrs: { alt: '' } });
  const grid = h('div', { class: 'thumbgrid' });
  const dot = h('div', { class: 'pivot' });
  thumb.append(img, grid, dot);
  thumb.addEventListener('click', (e) => {
    const r = img.getBoundingClientRect();
    const fb = S().flipbook;
    const fw = r.width / (fb?.cols ?? 1), fh = r.height / (fb?.rows ?? 1);
    const u = Math.min(1, Math.max(0, ((e.clientX - r.left) % fw) / fw)), v = Math.min(1, Math.max(0, ((e.clientY - r.top) % fh) / fh));
    app.editLayer(['pivot'], [Math.round(u * 100) / 100, Math.round(v * 100) / 100], { label: 'Pivot' });
    app.commit();
  });
  const pivotU = numberField({ label: 'Pivot x', value: S().pivot[0], step: 0.01, min: 0, max: 1, onChange: (v) => { app.editLayer(['pivot', 0], clamp01(v), { label: 'Pivot' }); app.commit(); } });
  const pivotV = numberField({ label: 'Pivot y', value: S().pivot[1], step: 0.01, min: 0, max: 1, onChange: (v) => { app.editLayer(['pivot', 1], clamp01(v), { label: 'Pivot' }); app.commit(); } });
  const flip = checkField({ label: 'Flipbook (a grid of frames)', value: !!S().flipbook, onChange: (v) => { app.editLayer(['flipbook'], v ? { cols: 2, rows: 2, frames: 4, loop: false } : undefined, { label: 'Flipbook' }); app.commit(); } });
  const cols = numberField({ label: 'Columns', value: S().flipbook?.cols ?? 1, step: 1, min: 1, max: 64, onChange: (v) => fb('cols', v) });
  const rows = numberField({ label: 'Rows', value: S().flipbook?.rows ?? 1, step: 1, min: 1, max: 64, onChange: (v) => fb('rows', v) });
  const frames = numberField({ label: 'Frames', value: S().flipbook?.frames ?? 1, step: 1, min: 1, onChange: (v) => fb('frames', v) });
  const loop = checkField({ label: 'Loop the frames', value: S().flipbook?.loop ?? false, onChange: (v) => { app.editLayer(['flipbook', 'loop'], v, { label: 'Loop frames' }); app.commit(); } });
  const fb = (k: 'cols' | 'rows' | 'frames', v: number) => {
    const f = S().flipbook; if (!f) return;
    const next = { ...f, [k]: Math.max(1, Math.round(v)) };
    if (k !== 'frames') next.frames = Math.min(next.frames, next.cols * next.rows) || next.cols * next.rows;
    next.frames = Math.min(next.frames, next.cols * next.rows);
    app.editLayer(['flipbook'], next, { label: 'Flipbook grid' }); app.commit();
  };
  const fbBox = h('div', { class: 'fieldrow' }, cols.el, rows.el, frames.el);
  const drawThumb = () => {
    const s = S();
    img.src = app.imageUrl(s.image) ?? '';
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
  const facing = segmented({ label: 'Faces', options: [{ value: 'camera', label: 'The camera' }, { value: 'path', label: 'Along the path', title: 'The image\'s x axis lies along the motion, or along the shot' }],
    value: S().facing, onChange: (v) => { app.editLayer(['facing'], v, { label: 'Facing' }); app.commit(); } });

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
  const offset = offsetFields(app, () => (isInputAnchor(S().at) ? (S().at as InputAnchor).offset : null), (o) => app.editLayer(['at', 'offset'], o, { label: 'Offset' }));

  // Colour.
  const roleOpts = () => [{ value: MAIN_ROLE, label: 'main (the effect\'s colour)' }, ...roleNames(app.palette).map((r) => ({ value: r, label: r }))];
  const tintMode = segmented({ label: 'Colour', options: [{ value: 'keep', label: 'Keep the image\'s colours' }, { value: 'multiply', label: 'Multiply by a role' }],
    value: S().tint.mode, onChange: (v) => { app.editLayer(['tint'], v === 'keep' ? { mode: 'keep' } : { mode: 'multiply', role: MAIN_ROLE }, { label: 'Colour' }); app.commit(); } });
  const role = selectField({ label: 'Role', options: roleOpts(), value: S().tint.mode === 'multiply' ? (S().tint as { role: string }).role : MAIN_ROLE,
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
    fold('Image', [image.el, thumb, h('div', { class: 'fieldrow' }, pivotU.el, pivotV.el), flip.el, fbBox, loop.el,
      h('div', { class: 'row' }, h('button', { class: 'plain', attrs: { type: 'button' }, text: 'Add PNG images to the project…', on: { click: () => app.importImages() } }))], true),
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
    const off = offsetFields(app, () => P()[key].offset, (o) => app.editLayer([key, 'offset'], o, { label: `${label} offset` }));
    parts.push({ refresh: () => { sel.set(P()[key].input); off.refresh(); } });
    return [sel.el, off.el];
  };
  const fl = () => P().flight;
  const flightMode = segmented({ label: 'Flight', small: true, value: fl().mode,
    options: [{ value: 'speed', label: 'By speed' }, { value: 'time', label: 'Fixed time' }, { value: 'phase', label: 'One phase' }],
    onChange: (v) => {
      const next = v === 'speed' ? { mode: 'speed', mps: 40 } : v === 'time' ? { mode: 'time', ms: 500 } : { mode: 'phase', phase: 'windup' };
      app.editLayer(['flight'], next, { label: 'Flight' }); app.commit();
    } });
  const speed = slider({ label: 'Speed', min: 1, max: 1200, step: 1, value: fl().mode === 'speed' ? (fl() as { mps: number }).mps : 40, unit: 'm/s', digits: 0,
    hint: 'Flight time = distance ÷ speed. A rifle at real speed lands within one 1/12 s step.',
    onInput: (v) => app.editLayer(['flight', 'mps'], v, { mergeKey: 'speed', label: 'Speed' }), onCommit: () => app.commit() });
  const flightMs = numberField({ label: 'Flight time', value: fl().mode === 'time' ? (fl() as { ms: number }).ms : 500, step: 10, min: 1, unit: 'ms',
    onChange: (v) => { app.editLayer(['flight', 'ms'], Math.max(1, v), { label: 'Flight time' }); app.commit(); } });
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
    fold('Motion', [flightMode.el, speed.el, flightMs.el, flightPhase.el, flight, arc.el, stretch.el, spin.el], true),
  ];
}

function timeFields(app: AppApi, parts: Refresher[]): HTMLElement {
  const L = () => app.layer() as Layer;
  const mode = segmented({ label: 'Moves', options: [{ value: 'steps', label: 'In steps' }, { value: 'smooth', label: 'Smoothly' }], value: L().timing.mode,
    onChange: (v) => { app.editLayer(['timing'], v === 'steps' ? { mode: 'steps', perSecond: 12 } : { mode: 'smooth' }, { label: 'Moves' }); app.commit(); } });
  const rate = numberField({ label: 'Steps a second', value: L().timing.mode === 'steps' ? (L().timing as { perSecond: number }).perSecond : 12, step: 1, min: 1, max: 60,
    onChange: (v) => { app.editLayer(['timing', 'perSecond'], Math.max(1, Math.min(60, Math.round(v))), { label: 'Steps a second' }); app.commit(); } });
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
  const delay = numberField({ label: 'Delay', value: L().start.ms, step: 10, min: 0, unit: 'ms', onChange: (v) => { app.editLayer(['start', 'ms'], Math.max(0, v), { label: 'Delay' }); app.commit(); } });
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
    onChange: (v) => { app.editLayer(['durationMs'], Math.max(1, v), { label: 'Length' }); app.commit(); } });
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
  const offset = offsetFields(app, () => (isInputAnchor(V().at) ? (V().at as InputAnchor).offset : null), (o) => app.editLayer(['at', 'offset'], o, { label: 'Offset' }));
  const facing = selectField({ label: 'Faces', value: V().facing, options: [{ value: 'camera', label: 'The camera' }, { value: 'path', label: 'Along the path' },
    { value: 'ground', label: 'Flat on the ground' }, { value: 'upright', label: 'Upright (true heights)' }],
    onChange: (v) => { app.editLayer(['facing'], v, { label: 'Faces' }); app.commit(); } });
  const blend = selectField({ label: 'Mixes', value: V().blend, options: [{ value: 'normal', label: 'Normal' }, { value: 'add', label: 'Adds light' },
    { value: 'screen', label: 'Lightens the ground (screen)' }, { value: 'multiply', label: 'Darkens the ground (multiply)' }],
    onChange: (v) => { app.editLayer(['blend'], v, { label: 'Mixes' }); app.commit(); } });
  const sx = numberField({ label: 'Nudge right', value: V().shiftM?.[0] ?? 0, step: 0.05, unit: 'm', onChange: (v) => { app.editLayer(['shiftM'], [v, V().shiftM?.[1] ?? 0], { label: 'Nudge' }); app.commit(); } });
  const sy = numberField({ label: 'Nudge up', value: V().shiftM?.[1] ?? 0, step: 0.05, unit: 'm', onChange: (v) => { app.editLayer(['shiftM'], [V().shiftM?.[0] ?? 0, v], { label: 'Nudge' }); app.commit(); } });
  const lift = numberField({ label: 'Lift off the ground', value: V().liftM ?? 0, step: 0.05, min: 0, unit: 'm',
    onChange: (v) => { app.editLayer(['liftM'], v > 0 ? v : undefined, { label: 'Lift' }); app.commit(); } });
  parts.push({ refresh: () => {
    const l = V();
    anchor.setOptions(anchorOptions()); anchor.set(anchorValue()); offset.refresh(); facing.set(l.facing); blend.set(l.blend);
    sx.set(l.shiftM?.[0] ?? 0); sy.set(l.shiftM?.[1] ?? 0); lift.set(l.liftM ?? 0); lift.el.hidden = l.facing !== 'ground';
  } });
  lift.el.hidden = V().facing !== 'ground';
  return fold('Place', [anchor.el, offset.el, facing.el, blend.el, h('div', { class: 'fieldrow' }, sx.el, sy.el), lift.el], true);
}

/** Fields every visible layer has, edited elsewhere (Place, Time), so the generated form leaves them out. */
const COMMON_KEYS = ['id', 'name', 'type', 'start', 'timing', 'tiers', 'at', 'facing', 'blend', 'durationMs', 'untilPhaseEnd', 'scale', 'alpha', 'shiftM', 'liftM', 'seed', 'perPlay'];
const ALL_BUT_SEED = (l: Layer) => Object.keys(l).filter((k) => k !== 'seed' && k !== 'perPlay');

function offsetFields(app: AppApi, get: () => Vec3 | null, set: (o: Vec3) => void): { el: HTMLElement; refresh(): void } {
  const axis = (i: 0 | 1 | 2, label: string) => numberField({ label, value: get()?.[i] ?? 0, step: 0.05, unit: 'm', onChange: (v) => {
    const o = [...(get() ?? [0, 0, 0])] as Vec3; o[i] = v; set(o); app.commit();
  } });
  const x = axis(0, 'Right'), y = axis(1, 'Up'), z = axis(2, 'Forward');
  const el = h('div', { class: 'fieldrow', title: 'Offset in metres: right, up, and forward (towards the target)' }, x.el, y.el, z.el);
  const refresh = () => { const o = get(); el.hidden = !o; if (o) { x.set(o[0]); y.set(o[1]); z.set(o[2]); } };
  refresh();
  return { el, refresh };
}

// ---------------------------------------------------------------- live checks

function checks(app: AppApi, parts: Refresher[]): HTMLElement {
  const list = h('ul', { class: 'problems' });
  // It takes the focus when the status bar's checks are clicked.
  const head = h('h2', { attrs: { tabindex: '-1' } });
  const draw = () => {
    const probs = app.problems();
    head.textContent = probs.length ? `Checks: ${probs.length} problem${probs.length > 1 ? 's' : ''}` : 'Checks: all good';
    head.className = probs.length ? 'bad' : 'good';
    list.replaceChildren(...probs.map((p) => h('li', {}, h('code', { text: p.path }), ` ${p.message}`)));
  };
  draw();
  parts.push({ refresh: draw });
  return h('section', { class: 'card checks' }, head, list,
    h('p', { class: 'hint', text: 'The same checker the export uses.' }));
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
