/**
 * One form for every shape, burst and word: it reads the layer's own fields and builds the matching control for each
 * (a number with its unit, a colour role, a choice, a pair of numbers, a list of tones, a curve, a list of words), and
 * folds optional parts behind an on/off switch. Field names carry their units (radiusM, widthPx, growMs, tiltDeg).
 */
import { MAIN_ROLE, PHASE_NAMES, resolveRole, roleNames } from '@shamble/vfx-format';
import type { AppApi } from './api';
import type { Path } from '../doc/edits';
import { checkField, fold, h, iconButton, numberBox, numberField, numberGroup, selectField, textField } from './dom';
import { wordList } from './wordlist';

interface Refresher { refresh(): void }

/** Plain words for field names. Anything missing falls back to the name split into words. */
const LABEL: Record<string, string> = {
  radiusM: 'Radius', points: 'Points', inner: 'Inner corners', jitter: 'Unevenness', squash: 'Height (share of width)', rotationDeg: 'Turn',
  tones: 'Tones', inkPx: 'Ink line', edge: 'Edge (friend or foe)', whiteFirstStep: 'First step white', boilDeg: 'Boil (turn every other step)',
  breakUp: 'Breaks up', double: 'Second jagged edge', halftone: 'Halftone fill', lengthM: 'Length', alternate: 'Every other step',
  lobes: 'Lobes', lobeDepth: 'Lobe depth', style: 'Style', role: 'Colour', lightRole: 'Light colour', rimRole: 'Rim colour', grow: 'Size over life (start, peak, end)',
  riseM: 'Rise', driftM: 'Drift (right, forward)', loop: 'Keeps coming', widthPx: 'Width', teeth: 'Teeth', teethM: 'Teeth reach', growFrom: 'Grows from',
  growMs: 'Grow time', dashAt: 'Dashed after', closing: 'Rings closing in', innerM: 'Inner radius', edgeM: 'Soft edge', stepPx: 'Dot spacing', dotPx: 'Dot size',
  alpha: 'Solid (0 to 1)', flickerM: 'Flicker', coreScale: 'Dark middle', coreRole: 'Middle colour', count: 'How many', until: 'Gone after (share of life)',
  spread: 'Spread', soft: 'Soft', flicker: 'Flicker', length: 'Length (share of path)', head: 'Hot head', core: 'Core line', dashes: 'Dashes', widthM: 'Width (start, end)',
  find: 'Finds the target during', letGo: 'Lets go during', periodMs: 'Period', sizeM: 'Size', glowRole: 'Glow colour', depth: 'Depth', tallM: 'Height', lean: 'Lean',
  sway: 'Sway', cycleSteps: 'Steps per sway', shadeRole: 'Shade colour', licks: 'Licks let go', lumps: 'Lumps', part: 'Part', detailRole: 'Detail colour',
  boilSteps: 'Boil every (steps)', lifeMs: 'Life', speedMps: 'Speed', direction: 'Direction', spreadDeg: 'Spread', startRadiusM: 'Starts at radius',
  areaM: 'Start area (half width, half height)', gravityMps2: 'Gravity', drag: 'Drag', sizeOverLife: 'Size over life', spinDegPerS: 'Spin', look: 'Look',
  streak: 'Speed streak', groundStop: 'Stops on the ground', seed: 'Seed', perPlay: 'Changes every play', words: 'Words (one picked per play)',
  letterPx: 'Letter height', colours: 'Colours', separation: 'Line between outlines', tiltDeg: 'Tilt', sizeJitter: 'Size varies by', ramp: 'Letters grow along',
  bounce: 'Bounce', turnDeg: 'Letter turn', pop: 'Pops in', breakSteps: 'Shrinks in steps', distance: 'Size by distance', visibleTo: 'Seen by', inkRole: 'Edge colour',
  top: 'Top', bottom: 'Bottom', back: 'Pushed-back copy', scale: 'Scale', steps: 'Steps', share: 'Share', px: 'Width (px)', kind: 'Kind', fromM: 'From radius',
  toM: 'To radius', towardDeg: 'Fades towards', curve: 'Curve (metres: share)', minPx: 'Not drawn under (px)', vanishAt: 'Goes at', from: 'From', to: 'To',
};

/** Choices for fields that take one of a few words. */
const CHOICES: Record<string, string[]> = {
  edge: ['auto', 'enemy', 'ink', 'broken', 'none'],
  direction: ['up', 'out', 'path'],
  part: ['lumps', 'detail'],
  depth: ['all', 'back', 'middle', 'front'],
  visibleTo: ['everyone', 'shooter'],
  input: ['origin', 'target'],
};
const STYLE_CHOICES: Record<string, string[]> = {
  smoke: ['puff', 'billow'],
  ring: ['auto-zigzag', 'auto-teeth', 'solid', 'dashed', 'zigzag', 'teeth'],
  scorch: ['oval', 'splat'],
};
const LOOK_KINDS = ['diamond', 'chip', 'spark', 'dot', 'shard', 'speck', 'puff', 'streak', 'spike'];

/** What an optional part looks like when it is switched on. */
const DEFAULTS: Record<string, unknown> = {
  breakUp: { phase: 'fade' }, halftone: { role: 'heat.dark', stepPx: 8, dotPx: 3.5, towardDeg: 45 }, head: { role: 'heat.3', share: 0.4 },
  core: { role: 'white', px: 3, edge: 'enemy' }, loop: { count: 3, lifeMs: 1600 }, closing: { count: 3, periodMs: 900, fromM: 3, toM: 1 },
  streak: { role: 'white', lengthM: 0.5, widthPx: 3 }, separation: 'heat.3', inkRole: 'ink', squash: 1, areaM: [0.5, 0.5], dashAt: 0.5,
  lightRole: 'smoke.light', find: 'windup', letGo: 'fade',
  scale: { steps: [1], life: [[0, 1], [1, 1]] }, alpha: { life: [[0, 1], [1, 1]] },
};
const OPTIONAL = new Set(Object.keys(DEFAULTS));

function labelOf(key: string): string {
  return LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function unitOf(key: string): string | undefined {
  if (/DegPerS$/.test(key)) return '°/s';
  if (/Mps2$/.test(key)) return 'm/s²';
  if (/Mps$/.test(key)) return 'm/s';
  if (/Ms$/.test(key)) return 'ms';
  if (/Px$/.test(key) || key === 'px') return 'px';
  if (/Deg$/.test(key)) return '°';
  if (/M$/.test(key)) return 'm';
  return undefined;
}

function stepOf(key: string): number {
  const u = unitOf(key);
  if (u === 'ms') return 10;
  if (u === '°' || u === '°/s') return 1;
  if (u === 'px') return 0.1;
  if (u === 'm/s' || u === 'm/s²') return 0.1;
  return 0.01;
}

const isRoleKey = (key: string, parent: string) => key === 'role' || key.endsWith('Role') || key === 'separation' || parent === 'colours';

/** A colour role's hex for the faction shown, for a role select's swatch; "main" is the effect's main colour. */
export function roleHex(app: AppApi): (role: string) => string | undefined {
  return (role) => resolveRole(app.palette, role === MAIN_ROLE ? app.effect()?.controls.colour ?? role : role, app.faction);
}

/**
 * The boxes of a pair or a group of three numbers on one row: each box's short prefix, and the word its full name ends
 * with ("Life, min", "Width, start"; the label without its words in brackets, a comma and the word). Keyed by field name,
 * or by "kind:field" where the meaning changes with the kind. A range is picked between its two numbers. A pair or three
 * not listed gets "1", "2", "3" and the names the settings inventory always gave them ("Steps", "Steps (2)").
 */
const RANGE: readonly (readonly [string, string])[] = [['Min', 'min'], ['Max', 'max']];
const PARTS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  lifeMs: RANGE, speedMps: RANGE, startRadiusM: RANGE, tiltDeg: RANGE, tallM: RANGE, cycleSteps: RANGE,
  'burst:sizeM': RANGE, 'burst:spinDegPerS': RANGE, 'flames:widthM': RANGE, 'lines:innerM': RANGE, 'lines:lengthM': RANGE, 'lines:widthPx': RANGE,
  'glow:grow': [['Start', 'start'], ['End', 'end']], 'smoke:grow': [['S', 'start'], ['P', 'peak'], ['E', 'end']],
  'trail:widthPx': [['Tail', 'tail'], ['Head', 'head']], 'band:widthM': [['Start', 'start'], ['End', 'end']],
  driftM: [['R', 'right'], ['F', 'forward']], areaM: [['W', 'half width'], ['H', 'half height']],
};
/** An end's offset (a band's or a bead string's From and To): right, up and forward, named as every offset is. */
const OFFSET_PARTS: readonly (readonly [string, string])[] = [['R', 'Right'], ['U', 'Up'], ['F', 'Forward']];

/**
 * A pair's or three's row: the label it shows (without its words in brackets when the boxes' prefixes say them: "Size over
 * life (start, peak, end)" shows "Size over life", its boxes S, P and E), and each box's prefix and full name. The help
 * text stays keyed by the full label.
 */
export function groupParts(kind: string, key: string, label: string, n: number): { shown: string; boxes: { prefix: string; name: string }[] } {
  if (key === 'offset' && n === 3) return { shown: label, boxes: OFFSET_PARTS.map(([prefix, name]) => ({ prefix, name })) };
  const parts = PARTS[`${kind}:${key}`] ?? PARTS[key];
  const base = label.replace(/\s*\([^()]*\)$/, '');
  if (parts && parts.length === n) return { shown: base, boxes: parts.map(([prefix, word]) => ({ prefix, name: `${base}, ${word}` })) };
  return { shown: label, boxes: Array.from({ length: n }, (_, i) => ({ prefix: String(i + 1), name: i === 0 ? label : `${label} (${i + 1})` })) };
}

/**
 * Build the form for the object at basePath inside the selected layer. `kind` is the shape kind, for style choices.
 * Each control refreshes itself from the document; structural changes (a part switched on or off, a tone added) rebuild
 * the inspector, as the inspector watches the layer's structure.
 */
export function specForm(app: AppApi, parts: Refresher[], basePath: Path, kind: string, skip: string[] = []): HTMLElement[] {
  const get = (p: Path): unknown => {
    let v: unknown = app.layer();
    for (const k of [...basePath, ...p]) v = (v as Record<string | number, unknown> | undefined)?.[k];
    return v;
  };
  const edit = (p: Path, value: unknown, label: string, merge = false) => {
    app.editLayer([...basePath, ...p], value, merge ? { mergeKey: [...basePath, ...p].join('.'), label } : { label });
    if (!merge) app.commit();
  };
  const roles = () => roleNames(app.palette).map((r) => ({ value: r, label: r }));

  const field = (key: string, p: Path, parent: string): HTMLElement | null => {
    const v = get(p);
    const label = labelOf(key);
    if (v === undefined) return null;
    if (typeof v === 'boolean') {
      const c = checkField({ label, value: v, onChange: (x) => edit(p, x, label) });
      parts.push({ refresh: () => c.set(get(p) as boolean) });
      return c.el;
    }
    if (typeof v === 'number') {
      // A drag on its label is one undo step: the edits merge by path until the commit.
      const c = numberField({ label, value: v, step: stepOf(key), unit: unitOf(key), onInput: (x) => edit(p, x, label, true), onCommit: () => app.commit() });
      parts.push({ refresh: () => { const x = get(p); if (typeof x === 'number') c.set(x); } });
      return c.el;
    }
    if (typeof v === 'string') {
      let options: { value: string; label: string }[] | null = null;
      if (isRoleKey(key, parent)) options = roles();
      else if (key === 'style' && STYLE_CHOICES[kind]) options = STYLE_CHOICES[kind]!.map((x) => ({ value: x, label: x }));
      else if (key === 'kind' && parent === 'look') options = LOOK_KINDS.map((x) => ({ value: x, label: x }));
      else if (CHOICES[key]) options = CHOICES[key]!.map((x) => ({ value: x, label: x }));
      else if (key === 'phase' || key === 'find' || key === 'letGo') options = PHASE_NAMES.map((x) => ({ value: x, label: x }));
      if (options) {
        // A colour role's select has a swatch of the role's colour (for the faction shown) at its left edge.
        const roleList = isRoleKey(key, parent);
        const c = selectField({ label, options, value: v, swatch: roleList ? roleHex(app) : undefined, onChange: (x) => edit(p, x, label) });
        // Colour lists follow the palette: a colour added in the picker shows up at once (and set() paints the swatch again,
        // for a faction changed or a colour edited in the picker).
        parts.push({ refresh: () => { if (roleList) c.setOptions(roles()); c.set(get(p) as string); } });
        return c.el;
      }
      const c = textField({ label, value: v, onChange: (x) => edit(p, x, label) });
      parts.push({ refresh: () => c.set(get(p) as string) });
      return c.el;
    }
    if (Array.isArray(v)) {
      // A pair of numbers (a range or a 2D vector), or three: one row, a short prefix in each box ("Min", "Max"; "R", "U",
      // "F"), its full name in its tooltip and as its name for screen readers (groupParts). Each box keeps the step and the
      // unit it had: a pair its field's (shown once, after the last box), three 0.05 and none.
      if ((v.length === 2 || v.length === 3) && v.every((x) => typeof x === 'number')) {
        const three = v.length === 3;
        const g = groupParts(kind, key, label, v.length);
        const boxes = g.boxes.map((part, i) => numberBox({
          label: part.name, prefix: part.prefix, help: label, value: v[i] as number, step: three ? 0.05 : stepOf(key),
          onInput: (x) => edit([...p, i], x, label, true), onCommit: () => app.commit(),
        }));
        parts.push({ refresh: () => { const x = get(p) as number[]; if (Array.isArray(x)) boxes.forEach((b, i) => { if (typeof x[i] === 'number') b.set(x[i]!); }); } });
        return numberGroup({ label: g.shown, help: g.shown !== label ? label : undefined, boxes, unit: three ? undefined : unitOf(key) });
      }
      // Any other list of numbers (per-step factors), typed as "1.18, 1.06".
      if (v.every((x) => typeof x === 'number')) {
        const c = textField({ label, value: (v as number[]).join(', '), onChange: (txt) => {
          const nums = txt.split(',').map((q) => Number(q.trim())).filter((q) => Number.isFinite(q));
          if (nums.length) edit(p, nums, label);
        } });
        parts.push({ refresh: () => c.set((get(p) as number[]).join(', ')) });
        return c.el;
      }
      // A curve: [x, y] pairs, typed as "x:y, x:y".
      if (v.every((x) => Array.isArray(x) && x.length === 2)) {
        const text = (c: unknown) => (c as number[][]).map(([x, y]) => `${x}:${y}`).join(', ');
        const c = textField({ label, value: text(v), onChange: (s) => {
          const pts = s.split(',').map((q) => q.split(':').map(Number)).filter((q) => q.length === 2 && q.every(Number.isFinite));
          if (pts.length) edit(p, pts.sort((m, n) => m[0]! - n[0]!), label);
        } });
        parts.push({ refresh: () => c.set(text(get(p))) });
        return c.el;
      }
      // A word layer's words: one row per word with its chance in %, Remove, Add word, and what the chances give (UI phase
      // 6, Part B: wordlist.ts). It replaces the comma list, under the same label.
      if (key === 'words' && v.every((x) => !!x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string')) {
        return wordList(app, parts, label);
      }
      // Words, or a fire's list of tone roles.
      if (v.every((x) => typeof x === 'string')) {
        if (key === 'tones') {
          const rows = (v as string[]).map((_, i) => field(`${i + 1}`, [...p, i], 'tones-roles'));
          return fold(label, rows.filter(Boolean) as HTMLElement[], true);
        }
        const c = textField({ label, value: (v as string[]).join(', '), onChange: (s) => {
          const words = s.split(',').map((w) => w.trim().toUpperCase()).filter(Boolean);
          if (words.length) edit(p, words, label);
        } });
        parts.push({ refresh: () => c.set((get(p) as string[]).join(', ')) });
        return c.el;
      }
      // Tones: role and scale each; add or remove.
      if (key === 'tones') {
        // Each tone: its colour (a role, with its swatch) and its scale, each a row, and Remove under them.
        const rows = (v as Record<string, unknown>[]).map((t, i) => {
          const role = selectField({ label: `Tone ${i + 1}`, options: roles(), value: t.role as string, swatch: roleHex(app), onChange: (x) => edit([...p, i, 'role'], x, 'Tone colour') });
          const sc = numberField({ label: 'Scale', value: t.scale as number, step: 0.01, onInput: (x) => edit([...p, i, 'scale'], x, 'Tone scale', true), onCommit: () => app.commit() });
          parts.push({ refresh: () => { const q = (get(p) as Record<string, unknown>[])[i]; if (q) { role.setOptions(roles()); role.set(q.role as string); sc.set(q.scale as number); } } });
          const del = h('button', { class: 'mini', attrs: { type: 'button' }, text: 'Remove', on: { click: () => {
            const list = (get(p) as unknown[]).filter((_, k) => k !== i);
            if (list.length) edit(p, list, 'Remove tone');
          } } });
          return h('div', { class: 'tone-row' }, role.el, sc.el, h('div', { class: 'prop-actions' }, del));
        });
        const add = h('button', { class: 'mini', attrs: { type: 'button' }, text: 'Add a tone', on: { click: () => {
          const list = get(p) as Record<string, unknown>[];
          const last = list[list.length - 1] ?? { role: 'heat.4', scale: 1 };
          edit(p, [...list, { role: last.role, scale: Math.max(0.1, ((last.scale as number) ?? 1) * 0.6) }], 'Add tone');
        } } });
        return fold(label, [...rows, h('div', { class: 'prop-actions' }, add)], true);
      }
      return null;
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      // Breaking up: over a phase or over the last ms of the layer's life.
      if (key === 'breakUp') {
        const mode = 'phase' in o ? 'phase' : 'lastMs';
        const sel = selectField({ label: 'Breaks up over', options: [{ value: 'phase', label: 'a phase' }, { value: 'lastMs', label: 'its last ms' }], value: mode,
          onChange: (x) => edit(p, x === 'phase' ? { phase: 'fade' } : { lastMs: 200 }, 'Breaks up') });
        const inner = field(mode, [...p, mode], key);
        return h('div', { class: 'sub' }, sel.el, inner ?? '');
      }
      const keys = Object.keys(o).filter((k) => !(key === 'look' && k === 'image'));
      if (key === 'look' && !keys.includes('inkRole') && 'edge' in o) keys.push('inkRole');
      const kids = keys.map((k) => row(k, [...p, k], key)).filter(Boolean) as HTMLElement[];
      return fold(label, kids, false);
    }
    return null;
  };

  // A field, or for an optional part a switch with the field under it. Which parts are optional depends on the kind.
  const optionalHere = new Set(optionalKeysFor(kind));
  const isOptional = (key: string, parent: string) => (parent === '' ? optionalHere.has(key) : parent === 'look' && key === 'inkRole');
  const row = (key: string, p: Path, parent: string): HTMLElement | null => {
    const v = get(p);
    if (OPTIONAL.has(key) && isOptional(key, parent)) {
      const on = v !== undefined;
      const sw = checkField({ label: labelOf(key), value: on, onChange: (x) => edit(p, x ? structuredClone(DEFAULTS[key]) : undefined, labelOf(key)) });
      parts.push({ refresh: () => sw.set(get(p) !== undefined) });
      if (!on) return sw.el;
      const inner = field(key, p, parent);
      return h('div', { class: 'optional' }, sw.el, inner ?? '');
    }
    return field(key, p, parent);
  };

  // A gradient from the palette (a glow's, smoke's, a bed's, a burst's: GRADIENTS): a choice of the palette's gradients, or
  // none (the layer's own colours), and an edit button that opens the colour picker at its gradients (on a colour of the
  // layer), with the gradient chosen open in the gradient editor. The runtime draws them all; the field picks one by name.
  const gradientField = (g: GradientSpot): HTMLElement => {
    const current = () => (get(['gradient']) as string | undefined) ?? '';
    const opts = () => {
      const names = Object.keys(app.palette.gradients ?? {}).sort();
      const list = [{ value: '', label: g.none }, ...names.map((n) => ({ value: n, label: n }))];
      if (current() && !names.includes(current())) list.push({ value: current(), label: `${current()} (not in the palette)` });
      return list;
    };
    // The colour the picker opens on: the one the gradient takes the place of ("main": the effect's main colour).
    const role = () => { const r = g.role((k) => get(k)) ?? MAIN_ROLE; return r === MAIN_ROLE ? app.effect()?.controls.colour ?? r : r; };
    const editBtn: HTMLButtonElement = iconButton({ icon: 'edit', label: 'Edit the gradients', className: 'mini edit-gradient', onClick: () => app.openGradients(role(), editBtn, current() || undefined) });
    editBtn.setAttribute('aria-haspopup', 'dialog');
    const c = selectField({ label: g.label, options: opts(), value: current(), extra: editBtn, onChange: (x) => edit(['gradient'], x || undefined, 'Gradient') });
    parts.push({ refresh: () => { c.setOptions(opts()); c.set(current()); } });
    return h('div', { class: 'gradient-field' }, c.el, h('p', { class: 'hint', text: g.hint }));
  };

  const obj = get([]) as Record<string, unknown> | undefined;
  if (!obj) return [];
  const spot = skip.includes('gradient') ? undefined : GRADIENTS[kind];
  const keys = Object.keys(obj).filter((k) => !skip.includes(k) && !(spot && k === 'gradient'));
  // Optional parts the object does not have yet still get their switch, so they can be added.
  const optional = optionalKeysFor(kind).filter((k) => !keys.includes(k) && !skip.includes(k));
  const out: HTMLElement[] = [];
  let placed = false;
  for (const k of [...keys, ...optional]) {
    if (spot && !placed && spot.before === k) { out.push(gradientField(spot)); placed = true; }
    const r = row(k, [k], '');
    if (r) out.push(r);
    if (spot && !placed && spot.after === k) { out.push(gradientField(spot)); placed = true; }
  }
  // At the end of its section (a glow's), or where its neighbour would be when the layer lacks it.
  if (spot && !placed) out.push(gradientField(spot));
  return out;
}

/**
 * Where a kind's gradient goes in its section, next to the colour it takes the place of, and its words: smoke's after its
 * Colour (each puff's body over its life), a bed's before its Tones (from the middle to the rim, in their place), a burst's
 * after its pieces' Look (each piece over its life), a glow's at the end of its section, where it always was. `role`: the
 * colour the edit button opens the colour picker on.
 */
interface GradientSpot {
  label: string;
  none: string;
  hint: string;
  before?: string;
  after?: string;
  role(get: (p: Path) => unknown): string | undefined;
}
const EDIT_HINT = 'The edit button opens the colour picker at its gradients, to make or change one.';
const GRADIENTS: Readonly<Record<string, GradientSpot>> = {
  glow: { label: 'Gradient, middle to rim', none: 'None: its Colour', hint: EDIT_HINT, role: (get) => get(['role']) as string | undefined },
  smoke: { label: 'Gradient over life', none: 'None: its Colour', after: 'role', hint: EDIT_HINT, role: (get) => get(['role']) as string | undefined },
  bed: { label: 'Gradient, middle to rim', none: 'None: the tones', before: 'tones', hint: 'In place of the tones. Give the lumps and the detail the same one.', role: (get) => (get(['tones']) as string[] | undefined)?.at(-1) },
  burst: { label: 'Gradient over life', none: 'None: its Look', after: 'look', hint: EDIT_HINT, role: (get) => get(['look', 'role']) as string | undefined },
};

/** The optional parts each kind of thing may have (shown as switches even when off). */
function optionalKeysFor(kind: string): string[] {
  switch (kind) {
    case 'shards': return ['breakUp', 'halftone'];
    case 'cloud': return ['breakUp', 'halftone'];
    case 'smoke': return ['lightRole', 'loop'];
    case 'ring': return ['dashAt', 'breakUp', 'closing', 'squash'];
    case 'dots': return ['squash', 'breakUp'];
    case 'trail': return ['head', 'core', 'breakUp'];
    case 'band': return ['find', 'letGo'];
    case 'flames': case 'bed': return ['breakUp'];
    case 'burst': return ['areaM', 'streak'];
    case 'word': return ['separation', 'breakUp'];
    case 'anim': return ['scale', 'alpha'];
    default: return [];
  }
}

/** A rough fingerprint of a layer's structure (keys and list lengths), so the inspector knows when to rebuild. */
export function structureOf(v: unknown): string {
  if (Array.isArray(v)) return `[${v.length}${v.length && typeof v[0] === 'object' ? v.map(structureOf).join('') : ''}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${k}${structureOf((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return typeof v === 'string' ? `s` : '';
}
