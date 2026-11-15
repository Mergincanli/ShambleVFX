/**
 * One form for every shape, burst and word: it reads the layer's own fields and builds the matching control for each
 * (a number with its unit, a colour role, a choice, a pair of numbers, a list of tones, a curve, a list of words), and
 * folds optional parts behind an on/off switch. Field names carry their units (radiusM, widthPx, growMs, tiltDeg).
 */
import { PHASE_NAMES, roleNames } from '@shamble/vfx-format';
import type { AppApi } from './api';
import type { Path } from '../doc/edits';
import { checkField, fold, h, numberField, selectField, textField } from './dom';

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
      const c = numberField({ label, value: v, step: stepOf(key), unit: unitOf(key), onChange: (x) => edit(p, x, label) });
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
        const c = selectField({ label, options, value: v, onChange: (x) => edit(p, x, label) });
        // Colour lists follow the palette: a colour added in the picker shows up at once.
        const roleList = isRoleKey(key, parent);
        parts.push({ refresh: () => { if (roleList) c.setOptions(roles()); c.set(get(p) as string); } });
        return c.el;
      }
      const c = textField({ label, value: v, onChange: (x) => edit(p, x, label) });
      parts.push({ refresh: () => c.set(get(p) as string) });
      return c.el;
    }
    if (Array.isArray(v)) {
      // A pair of numbers: a range or a 2D vector.
      if (v.length === 2 && v.every((x) => typeof x === 'number')) {
        const a = numberField({ label: `${label}`, value: v[0] as number, step: stepOf(key), unit: unitOf(key), onChange: (x) => edit([...p, 0], x, label) });
        const b = numberField({ label: '…', value: v[1] as number, step: stepOf(key), unit: unitOf(key), onChange: (x) => edit([...p, 1], x, label) });
        parts.push({ refresh: () => { const x = get(p) as number[]; if (Array.isArray(x)) { a.set(x[0]!); b.set(x[1]!); } } });
        return h('div', { class: 'fieldrow' }, a.el, b.el);
      }
      if (v.length === 3 && v.every((x) => typeof x === 'number')) {
        const fs = [0, 1, 2].map((i) => numberField({ label: i === 0 ? label : '', value: v[i] as number, step: 0.05, onChange: (x) => edit([...p, i], x, label) }));
        parts.push({ refresh: () => { const x = get(p) as number[]; fs.forEach((f, i) => f.set(x[i]!)); } });
        return h('div', { class: 'fieldrow' }, ...fs.map((f) => f.el));
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
        const rows = (v as Record<string, unknown>[]).map((t, i) => {
          const role = selectField({ label: `Tone ${i + 1}`, options: roles(), value: t.role as string, onChange: (x) => edit([...p, i, 'role'], x, 'Tone colour') });
          const sc = numberField({ label: 'Scale', value: t.scale as number, step: 0.01, onChange: (x) => edit([...p, i, 'scale'], x, 'Tone scale') });
          parts.push({ refresh: () => { const q = (get(p) as Record<string, unknown>[])[i]; if (q) { role.setOptions(roles()); role.set(q.role as string); sc.set(q.scale as number); } } });
          const del = h('button', { class: 'mini', attrs: { type: 'button' }, text: 'Remove', on: { click: () => {
            const list = (get(p) as unknown[]).filter((_, k) => k !== i);
            if (list.length) edit(p, list, 'Remove tone');
          } } });
          return h('div', { class: 'tone-row' }, role.el, sc.el, del);
        });
        const add = h('button', { class: 'mini', attrs: { type: 'button' }, text: 'Add a tone', on: { click: () => {
          const list = get(p) as Record<string, unknown>[];
          const last = list[list.length - 1] ?? { role: 'heat.4', scale: 1 };
          edit(p, [...list, { role: last.role, scale: Math.max(0.1, ((last.scale as number) ?? 1) * 0.6) }], 'Add tone');
        } } });
        return fold(label, [...rows, add], true);
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

  // A glow's gradient: a choice of the palette's gradients (made in the colour picker's Gradients section).
  const gradientField = (): HTMLElement => {
    const current = () => (get(['gradient']) as string | undefined) ?? '';
    const opts = () => {
      const names = Object.keys(app.palette.gradients ?? {}).sort();
      const list = [{ value: '', label: 'None: one colour (the Colour above)' }, ...names.map((g) => ({ value: g, label: g }))];
      if (current() && !names.includes(current())) list.push({ value: current(), label: `${current()} (not in the palette)` });
      return list;
    };
    const c = selectField({ label: 'Gradient, middle to rim', options: opts(), value: current(), onChange: (x) => edit(['gradient'], x || undefined, 'Gradient') });
    parts.push({ refresh: () => { c.setOptions(opts()); c.set(current()); } });
    return h('div', { class: 'gradient-field' }, c.el,
      h('p', { class: 'hint', text: 'Gradients live in the palette: click a colour swatch, then Gradients, to make or change one. With a gradient, the glow takes its colours from it.' }));
  };

  const obj = get([]) as Record<string, unknown> | undefined;
  if (!obj) return [];
  const keys = Object.keys(obj).filter((k) => !skip.includes(k) && !(kind === 'glow' && k === 'gradient'));
  // Optional parts the object does not have yet still get their switch, so they can be added.
  const optional = optionalKeysFor(kind).filter((k) => !keys.includes(k) && !skip.includes(k));
  const out = [...keys, ...optional].map((k) => row(k, [k], '')).filter(Boolean) as HTMLElement[];
  if (kind === 'glow' && !skip.includes('gradient')) out.push(gradientField());
  return out;
}

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
