/**
 * The right panel: the effect's big controls on top, the selected layer's details folded below.
 * Fields are built once per selection and refreshed in place, so a slider keeps working while you drag it.
 */
import { MAIN_ROLE, PHASE_NAMES, isArrivalStart, isInputAnchor, resolveRole, roleNames } from '@shamble/vfx-format';
import type { InputAnchor, Layer, PhaseName, ProjectileLayer, SpriteLayer, Vec3, VisibleLayer } from '@shamble/vfx-format';
import type { AppApi } from './api';
import { checkField, fold, h, numberField, segmented, selectField, slider, textField } from './dom';
import { specForm, structureOf } from './specform';

interface Refresher { refresh(): void }

/** The inspector rebuilds when the effect, the layer or the layer's structure (a part switched on, a tone added) changes. */
function keyOf(fxId: string | undefined, layer: Layer | undefined): string {
  return `${fxId}|${layer?.id}|${layer?.type}|${layer ? structureOf(layer) : ''}`;
}

const PHASE_LABEL: Record<PhaseName, string> = { windup: 'Wind-up', peak: 'Peak', fade: 'Fade' };

export function buildInspector(app: AppApi): { el: HTMLElement; rebuild(): void; refresh(): void } {
  const el = h('aside', { class: 'inspector', attrs: { 'aria-label': 'Effect and layer settings' } });
  let parts: Refresher[] = [];
  let builtFor = '';

  const rebuild = () => {
    const fx = app.effect();
    const layer = app.layer();
    builtFor = keyOf(fx?.id, layer);
    parts = [];
    el.replaceChildren();
    if (!fx) { el.append(h('p', { class: 'empty', text: 'Open or make an effect.' })); return; }
    el.append(bigControls(app, parts));
    if (layer) el.append(layerDetails(app, layer, parts));
    else el.append(h('p', { class: 'empty', text: 'Pick a layer on the left to see its details.' }));
    el.append(checks(app, parts));
  };
  const refresh = () => {
    const fx = app.effect();
    const layer = app.layer();
    if (keyOf(fx?.id, layer) !== builtFor) { rebuild(); return; }
    for (const p of parts) p.refresh();
  };
  rebuild();
  return { el, rebuild, refresh };
}

// ---------------------------------------------------------------- the big controls

function bigControls(app: AppApi, parts: Refresher[]): HTMLElement {
  const c = () => app.effect()!.controls;
  const name = textField({ label: 'Effect name', value: app.effect()!.name, onChange: (v) => app.editEffect(['name'], v.trim() || 'Effect', { label: 'Rename effect' }) });
  const size = slider({ label: 'Size', min: 0.25, max: 3, step: 0.01, value: c().size, unit: '×', big: true, hint: 'Every sprite and offset. Not the start and target points, not speeds.',
    onInput: (v) => app.editEffect(['controls', 'size'], v, { mergeKey: 'size', label: 'Size' }), onCommit: () => app.commit() });
  const intensity = slider({ label: 'Intensity', min: 0, max: 3, step: 0.01, value: c().intensity, unit: '×', big: true, hint: 'Flashes, hits and landings grow; streaks get longer. Never see-through.',
    onInput: (v) => app.editEffect(['controls', 'intensity'], v, { mergeKey: 'intensity', label: 'Intensity' }), onCommit: () => app.commit() });
  const duration = slider({ label: 'Duration', min: 0.25, max: 4, step: 0.01, value: c().duration, unit: '×', big: true, hint: 'The effect\'s own times. Flight time still comes from distance and speed.',
    onInput: (v) => app.editEffect(['controls', 'duration'], v, { mergeKey: 'duration', label: 'Duration' }), onCommit: () => app.commit() });
  const swatches = h('div', { class: 'swatches', attrs: { role: 'radiogroup', 'aria-label': 'Main colour role' } });
  const drawSwatches = () => {
    swatches.replaceChildren(...roleNames(app.palette).map((r) => {
      const hex = resolveRole(app.palette, r, app.faction)!;
      const b = h('button', { class: 'swatch', title: `${r} (${hex} for ${app.faction})`, attrs: { type: 'button', role: 'radio', 'aria-checked': String(c().colour === r) },
        on: { click: () => { app.editEffect(['controls', 'colour'], r, { label: 'Main colour' }); app.commit(); } } },
      h('span', { class: 'chip', style: `background:${hex}` }), h('span', { class: 'rname', text: r }));
      return b;
    }));
  };
  drawSwatches();
  const ph = () => app.effect()!.phases;
  const phase = (key: 'windupMs' | 'peakMs' | 'fadeMs', label: string) => numberField({ label, value: ph()[key], step: 10, min: 0, unit: 'ms',
    onChange: (v) => { app.editEffect(['phases', key], Math.max(0, Math.round(v)), { label: `${label} length` }); app.commit(); } });
  const windup = phase('windupMs', 'Wind-up'), peak = phase('peakMs', 'Peak'), fadeF = phase('fadeMs', 'Fade');
  parts.push({ refresh: () => {
    name.set(app.effect()!.name); size.set(c().size); intensity.set(c().intensity); duration.set(c().duration); drawSwatches();
    windup.set(ph().windupMs); peak.set(ph().peakMs); fadeF.set(ph().fadeMs);
  } });
  return h('section', { class: 'card bigcontrols' },
    h('h2', { text: 'Effect' }), name.el, size.el, intensity.el, duration.el,
    h('div', { class: 'row' }, h('div', { class: 'lab' }, h('span', { text: 'Phases' }), h('span', { class: 'hint', text: 'layers can start with a phase or last until one ends' })),
      h('div', { class: 'fieldrow' }, windup.el, peak.el, fadeF.el)),
    h('div', { class: 'row' }, h('div', { class: 'lab' }, h('span', { text: 'Colour' }), h('span', { class: 'hint', text: 'the main role; layers tinted "main" use it' })), swatches));
}

// ---------------------------------------------------------------- the layer's details

function layerDetails(app: AppApi, layer: Layer, parts: Refresher[]): HTMLElement {
  const L = () => app.layer() as Layer;
  const box = h('section', { class: 'card layer' });
  const name = textField({ label: 'Layer name', value: layer.name, onChange: (v) => app.editLayer(['name'], v.trim() || 'Layer', { label: 'Rename layer' }) });
  parts.push({ refresh: () => name.set(L().name) });
  const title = { sprite: 'Sprite layer', projectile: 'Projectile layer', shape: 'Shape layer', burst: 'Burst layer', word: 'Word layer' }[layer.type];
  box.append(h('h2', { text: title }), name.el);
  if (layer.type === 'sprite') box.append(...spriteFields(app, parts));
  else if (layer.type === 'projectile') box.append(...projectileFields(app, parts));
  else {
    box.append(placeFields(app, parts));
    if (layer.type === 'shape') box.append(fold(`Shape: ${layer.shape.kind}`, specForm(app, parts, ['shape'], layer.shape.kind, ['kind']), true));
    else box.append(fold(layer.type === 'burst' ? 'Pieces' : 'Word', specForm(app, parts, [], layer.type, COMMON_KEYS), true));
    box.append(fold('Seed', specForm(app, parts, [], 'seed', ALL_BUT_SEED(layer)), false));
  }
  box.append(timeFields(app, parts));
  return box;
}

function spriteFields(app: AppApi, parts: Refresher[]): HTMLElement[] {
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
    fbBox.style.display = s.flipbook ? '' : 'none';
    loop.el.style.display = s.flipbook ? '' : 'none';
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
    role.el.style.display = s.tint.mode === 'multiply' ? '' : 'none';
  } });
  role.el.style.display = S().tint.mode === 'multiply' ? '' : 'none';

  return [
    fold('Image', [image.el, thumb, h('div', { class: 'fieldrow' }, pivotU.el, pivotV.el), flip.el, fbBox, loop.el,
      h('div', { class: 'row' }, h('button', { class: 'plain', attrs: { type: 'button' }, text: 'Add PNG images to the project…', on: { click: () => app.importImages() } }))], true),
    fold('Size and place', [w.el, hh.el, facing.el, anchor.el, offset.el], true),
    fold('Colour', [tintMode.el, role.el], true),
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
    speed.el.style.display = m === 'speed' ? '' : 'none';
    flightMs.el.style.display = m === 'time' ? '' : 'none';
    flightPhase.el.style.display = m === 'phase' ? '' : 'none';
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
    rate.el.style.display = l.timing.mode === 'steps' ? '' : 'none';
    const visible = l.type !== 'projectile';
    lastSel.el.style.display = visible ? '' : 'none';
    dur.el.style.display = visible && (l as VisibleLayer).durationMs !== undefined ? '' : 'none';
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
    sx.set(l.shiftM?.[0] ?? 0); sy.set(l.shiftM?.[1] ?? 0); lift.set(l.liftM ?? 0); lift.el.style.display = l.facing === 'ground' ? '' : 'none';
  } });
  lift.el.style.display = V().facing === 'ground' ? '' : 'none';
  return fold('Place', [anchor.el, offset.el, facing.el, blend.el, h('div', { class: 'fieldrow' }, sx.el, sy.el), lift.el], true);
}

/** Fields every visible layer has, edited elsewhere (Place, Time), so the generated form leaves them out. */
const COMMON_KEYS = ['id', 'name', 'type', 'start', 'timing', 'at', 'facing', 'blend', 'durationMs', 'untilPhaseEnd', 'scale', 'alpha', 'shiftM', 'liftM', 'seed', 'perPlay'];
const ALL_BUT_SEED = (l: Layer) => Object.keys(l).filter((k) => k !== 'seed' && k !== 'perPlay');

function offsetFields(app: AppApi, get: () => Vec3 | null, set: (o: Vec3) => void): { el: HTMLElement; refresh(): void } {
  const axis = (i: 0 | 1 | 2, label: string) => numberField({ label, value: get()?.[i] ?? 0, step: 0.05, unit: 'm', onChange: (v) => {
    const o = [...(get() ?? [0, 0, 0])] as Vec3; o[i] = v; set(o); app.commit();
  } });
  const x = axis(0, 'Right'), y = axis(1, 'Up'), z = axis(2, 'Forward');
  const el = h('div', { class: 'fieldrow', title: 'Offset in metres: right, up, and forward (towards the target)' }, x.el, y.el, z.el);
  const refresh = () => { const o = get(); el.style.display = o ? '' : 'none'; if (o) { x.set(o[0]); y.set(o[1]); z.set(o[2]); } };
  refresh();
  return { el, refresh };
}

// ---------------------------------------------------------------- live checks

function checks(app: AppApi, parts: Refresher[]): HTMLElement {
  const list = h('ul', { class: 'problems' });
  const head = h('h2', {});
  const draw = () => {
    const probs = app.problems();
    head.textContent = probs.length ? `Checks: ${probs.length} problem${probs.length > 1 ? 's' : ''}` : 'Checks: all good';
    head.className = probs.length ? 'bad' : 'good';
    list.replaceChildren(...probs.map((p) => h('li', {}, h('code', { text: p.path }), ` ${p.message}`)));
  };
  draw();
  parts.push({ refresh: draw });
  return h('section', { class: 'card checks' }, head, list,
    h('p', { class: 'hint', text: 'The same checker the export will use: schema, colour roles, images, links between layers, lengths.' }));
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
