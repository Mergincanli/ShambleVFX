/**
 * The colours a layer can use, and the colours of a whole effect. Editor side only: the checker uses this list, and the
 * editor can show it or keep the colours it names. The runtime never imports it.
 *
 * The list holds every colour the runtime may ask the palette for when it draws the layer, for any made-by (an enemy,
 * your team, you), any quality tier and any faction:
 * - the roles named in the layer's fields ("main" stands for the effect's main colour);
 * - the roles its kind draws without naming them: the black ink outline (ink), white (a star's white first step) and
 *   the broken edge your own team's effects get (heat.rim);
 * - the stops of every gradient it names. A stop given as a hex is listed as that hex: it is not a palette colour.
 * The runtime looks a few of these up even when nothing shows them (a burst's ink when its pieces have no ink edge, a
 * dashed or closing ring's ink), so the list holds those too. A test draws every example effect with the real runtime and
 * checks that the list holds every colour the runtime asked for.
 */
import { MAIN_ROLE } from '../types';
import type { Edge, EffectFile, Layer } from '../types';
import type { Palette } from '../palette';

/** The black ink outline (and the ink line of rings, trails, words and pieces). */
export const INK_ROLE = 'ink';
/** What a star's white first step is drawn in. */
export const WHITE_ROLE = 'white';
/** The broken edge your own team's effects get, on stars, flashes and clouds. */
export const BROKEN_EDGE_ROLE = 'heat.rim';

/**
 * Why a layer can use a colour:
 * field: a field of the layer names it. main: a field (or a gradient stop) says "main", the effect's main colour.
 * ink, white, broken-edge: the layer's kind draws it without naming it. gradient-stop: a stop of a gradient it names.
 */
export type ColourReason = 'field' | 'main' | 'ink' | 'white' | 'broken-edge' | 'gradient-stop';

export interface ColourUse {
  /** The palette role. Absent only for a gradient stop given as a hex. */
  role?: string;
  /** A gradient stop given as a hex ("#FFE8A0"). */
  hex?: string;
  why: ColourReason;
  /**
   * Where in the file: the field that names it, the setting that draws it (an edge, whiteFirstStep, double, the shape or
   * the layer itself), or the field that names the gradient. Paths start with layers[i] when the layer's place is known.
   */
  path: string;
  /** What the layer draws with it, in plain words (for every reason but field). */
  note?: string;
  /** For a gradient stop: the gradient's name and the stop's number, from 1, in the palette's order. */
  gradient?: string;
  stop?: number;
  /** The layer's id, and its place in the effect's list when known. Both absent for the effect's own main colour. */
  layer?: string;
  index?: number;
}

/** A palette gradient a layer names, with where. Listed whether or not the palette has it. */
export interface GradientUse {
  name: string;
  path: string;
  /** The layer's id, and its place in the effect's list when known. */
  layer: string;
  index?: number;
}

export interface ColourList {
  colours: ColourUse[];
  gradients: GradientUse[];
}

export interface ColourOptions {
  /** The layer's place in the effect's list: paths then start with layers[i]. */
  index?: number;
  /** The role "main" stands for: the effect's main colour (controls.colour). Without it, "main" is listed as it is. */
  main?: string;
  /** With a palette, the stops of every gradient the layer names are listed too. */
  palette?: Palette;
}

type Path = (string | number)[];

/** A path as the checker writes it: layers[2].shape.tones[1].role. */
function pathOf(path: Path): string {
  let s = '';
  for (const p of path) s += typeof p === 'number' ? `[${p}]` : s ? `.${p}` : p;
  return s || '(layer)';
}

/** Every role named in a field, with where: keys named "role" or ending in "Role", tone lists, word colours, separation. */
function namedRoles(v: unknown, path: Path, out: { path: Path; role: string }[]): void {
  if (Array.isArray(v)) {
    const last = path[path.length - 1];
    v.forEach((x, i) => {
      if (typeof x === 'string' && last === 'tones') out.push({ path: [...path, i], role: x });
      else namedRoles(x, [...path, i], out);
    });
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const inColours = path[path.length - 1] === 'colours';
      if (typeof x === 'string' && (k === 'role' || k.endsWith('Role') || k === 'separation' || inColours)) out.push({ path: [...path, k], role: x });
      else namedRoles(x, [...path, k], out);
    }
  }
}

/**
 * What an edge setting can look like, over every made-by: an ink outline (for an enemy's at least), your own team's
 * broken edge. The same reading as the runtime's edgeLook.
 */
function edgeLooks(e: Edge): { ink: boolean; broken: boolean } {
  return { ink: e === 'auto' || e === 'enemy' || e === 'ink', broken: e === 'auto' || e === 'broken' };
}

/** Every colour one layer can use, and the gradients it names. */
export function layerColours(layer: Layer, opts: ColourOptions = {}): ColourList {
  const base: Path = opts.index === undefined ? [] : ['layers', opts.index];
  const main = opts.main ?? MAIN_ROLE;
  const tag = { layer: layer.id, ...(opts.index === undefined ? {} : { index: opts.index }) };
  const out: ColourList = { colours: [], gradients: [] };
  const add = (u: ColourUse) => out.colours.push({ ...u, ...tag });

  // 1. Named in a field.
  const found: { path: Path; role: string }[] = [];
  namedRoles(layer, base, found);
  for (const f of found) {
    if (f.role === MAIN_ROLE) add({ role: main, why: 'main', path: pathOf(f.path), note: 'the effect\'s main colour' });
    else add({ role: f.role, why: 'field', path: pathOf(f.path) });
  }

  // 2. Drawn without being named.
  const drawn = (role: string, why: ColourReason, rest: Path, note: string) => add({ role, why, path: pathOf([...base, ...rest]), note });
  if (layer.type === 'shape') {
    const sp = layer.shape;
    switch (sp.kind) {
      case 'shards':
      case 'flash':
      case 'cloud': {
        const e = edgeLooks(sp.edge);
        if (e.ink && sp.inkPx > 0) drawn(INK_ROLE, 'ink', ['shape', 'edge'], 'the black ink outline');
        if (sp.kind === 'shards' && sp.double) drawn(INK_ROLE, 'ink', ['shape', 'double'], 'the second, jagged edge inside it');
        if (e.broken) drawn(BROKEN_EDGE_ROLE, 'broken-edge', ['shape', 'edge'], 'the broken edge your own team\'s effects get');
        // Only a layer that moves in steps has a first step (a smooth one never draws it white).
        if (sp.kind === 'shards' && sp.whiteFirstStep && layer.timing.mode === 'steps') drawn(WHITE_ROLE, 'white', ['shape', 'whiteFirstStep'], 'the white first step');
        break;
      }
      case 'ring':
        drawn(INK_ROLE, 'ink', ['shape'], 'the ink line under the ring and round its teeth');
        break;
      case 'trail':
        drawn(INK_ROLE, 'ink', ['shape', 'edge'], 'the ink edge along the trail');
        break;
      case 'flames':
      case 'bed':
        if (edgeLooks(sp.edge).ink) drawn(INK_ROLE, 'ink', ['shape', 'edge'], 'the heavy ink line round the fire');
        break;
      default:
        break;
    }
  } else if (layer.type === 'burst') {
    // The pieces' ink edge: in their own inkRole when they name one (a field, above), else in ink.
    if (layer.look.kind === 'image') drawn(INK_ROLE, 'ink', ['look'], 'the ink edge of the pieces');
    else if (!layer.look.inkRole) drawn(INK_ROLE, 'ink', ['look', 'edge'], 'the ink edge of the pieces');
  } else if (layer.type === 'word') {
    drawn(INK_ROLE, 'ink', [], 'the black outlines of the letters');
  }

  // 3. The gradient it names, and that gradient's stops.
  const named = layer.type === 'burst' ? { name: layer.gradient, rest: ['gradient'] }
    : layer.type === 'shape' && (layer.shape.kind === 'glow' || layer.shape.kind === 'smoke' || layer.shape.kind === 'bed') ? { name: layer.shape.gradient, rest: ['shape', 'gradient'] }
      : undefined;
  if (named?.name) {
    const gname = named.name;
    const path = pathOf([...base, ...named.rest]);
    out.gradients.push({ name: gname, path, ...tag });
    const g = opts.palette?.gradients?.[gname];
    if (g && Array.isArray(g.stops)) {
      g.stops.forEach((s, k) => {
        if (!s || typeof s !== 'object') return; // not a stop: checkPalette names it
        const note = `stop ${k + 1} of the gradient "${gname}"`;
        const at = { path, gradient: gname, stop: k + 1 };
        if (s.role === MAIN_ROLE) add({ role: main, why: 'main', note: `${note}: the effect's main colour`, ...at });
        else if (s.role) add({ role: s.role, why: 'gradient-stop', note, ...at });
        else if (s.hex) add({ hex: s.hex, why: 'gradient-stop', note, ...at });
      });
    }
  }
  return out;
}

/** Every colour of a whole effect: its main colour, then every layer's colours, in list order. */
export function effectColours(fx: EffectFile, palette?: Palette): ColourList {
  const out: ColourList = { colours: [{ role: fx.controls.colour, why: 'main', path: 'controls.colour', note: 'the effect\'s main colour' }], gradients: [] };
  fx.layers.forEach((l, i) => {
    const c = layerColours(l, { index: i, main: fx.controls.colour, ...(palette ? { palette } : {}) });
    out.colours.push(...c.colours);
    out.gradients.push(...c.gradients);
  });
  return out;
}

/** The palette roles in a list, once each, sorted (hex stops left out). */
export function colourRoles(list: ColourList): string[] {
  return [...new Set(list.colours.flatMap((c) => (c.role === undefined ? [] : [c.role])))].sort();
}
