/**
 * The palette: role name -> hex, per faction for faction roles (team, glow, ...), shared for the rest.
 * No dependencies, so the runtime can use it.
 */

export type FactionId = 'soviets' | 'allies' | 'empire';
export const FACTION_IDS: readonly FactionId[] = ['soviets', 'allies', 'empire'];

export type PaletteSource = 'mustafa' | 'art-lead' | 'board-v7' | 'derived' | 'assumed';

export interface PaletteEntry {
  hex: string;
  from: PaletteSource;
  note?: string;
}

/** One colour of a gradient: where it sits (0 = the middle or start, 1 = the rim or end), a role or a hex, and how solid it is. */
export interface GradientStop {
  at: number;
  role?: string;
  hex?: string;
  /** 0 = see-through, 1 = solid (the default). */
  alpha?: number;
}

/**
 * A gradient: colours along one line, from 0 to 1. "smooth" blends from stop to stop; "banded" holds each stop's colour
 * until the next one (hard steps, as comic shading does). What the line is depends on the layer: a glow and a fire's bed
 * run it from the middle to the rim; smoke and bursts over each puff's or piece's life. Stops naming a role follow the
 * faction, as the role does.
 */
export interface Gradient {
  kind: 'smooth' | 'banded';
  stops: GradientStop[];
  from: PaletteSource;
  note?: string;
}

/** The palette file's own version. 2 added gradients. */
export const PALETTE_VERSION = 2 as const;

export interface Palette {
  version: typeof PALETTE_VERSION;
  about?: string;
  factions: Record<FactionId, { name: string; roles: Record<string, PaletteEntry> }>;
  roles: Record<string, PaletteEntry>;
  /** Named gradients (palette version 2). */
  gradients: Record<string, Gradient>;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
/** A gradient's name, like a role's: lowercase words joined by dots, such as glow.ramp. */
export const GRADIENT_NAME = /^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/;

/**
 * Any palette file as the current version: version 1 had no gradients, so it gets an empty list. Anything that is not
 * a palette comes back unchanged, for checkPalette to name.
 */
export function upgradePalette(raw: unknown): Palette {
  if (!raw || typeof raw !== 'object') return raw as Palette;
  const p = raw as Record<string, unknown>;
  if (p.version === 1) return { ...(p as object), version: PALETTE_VERSION, gradients: {} } as Palette;
  if (p.version === PALETTE_VERSION && !p.gradients) return { ...(p as object), gradients: {} } as Palette;
  return raw as Palette;
}

/** A gradient's stops as hex colours for a faction, sorted by place. Undefined for an unknown gradient. */
export function resolveGradient(palette: Palette, name: string, faction: FactionId): { kind: Gradient['kind']; stops: { at: number; hex: string; alpha: number }[] } | undefined {
  const g = palette.gradients?.[name];
  if (!g) return undefined;
  const stops = g.stops
    .map((s) => ({ at: s.at, hex: (s.role ? resolveRole(palette, s.role, faction) : s.hex) ?? '#FFFFFF', alpha: s.alpha ?? 1 }))
    .sort((a, b) => a.at - b.at);
  return { kind: g.kind, stops };
}

/** Every role an effect file may name (shared roles and faction roles), sorted. A part the palette lacks gives none. */
export function roleNames(palette: Palette): string[] {
  const names = new Set<string>(Object.keys(palette?.roles ?? {}));
  for (const f of FACTION_IDS) for (const r of Object.keys(palette?.factions?.[f]?.roles ?? {})) names.add(r);
  return [...names].sort();
}

/** The roles that change with the faction (team, glow, ...). */
export function factionRoleNames(palette: Palette): string[] {
  return Object.keys(palette.factions[FACTION_IDS[0]!].roles).sort();
}

/** The hex for a role, for the faction that made the effect. Undefined if the role is unknown. */
export function resolveRole(palette: Palette, role: string, faction: FactionId): string | undefined {
  const own = palette.factions[faction]?.roles[role];
  if (own) return own.hex;
  return palette.roles[role]?.hex;
}

/** "#RRGGBB" -> [r, g, b] in 0..255. */
export function parseHex(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** sRGB (0..1) to linear light (0..1), the standard sRGB curve. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Problems with the palette itself, in plain words. Empty when it is fine. It reads anything (a palette file can be written
 * by hand): a part that is missing, empty or not an object is named, never a reason to throw.
 */
export function checkPalette(palette: Palette): string[] {
  const out: string[] = [];
  const raw = palette as unknown;
  if (!isObject(raw) || !isObject(raw.factions) || !isObject(raw.roles)) return ['not a palette: it needs "factions" and "roles"'];
  if (palette.version !== PALETTE_VERSION) out.push(`palette version ${String(palette.version)} is not ${PALETTE_VERSION} (read it with upgradePalette first)`);
  const rolesOf = (f: FactionId): Record<string, unknown> | undefined => {
    const fac = palette.factions[f] as unknown;
    return isObject(fac) && isObject(fac.roles) ? fac.roles : undefined;
  };
  const first = FACTION_IDS[0]!;
  const want = Object.keys(rolesOf(first) ?? {}).sort().join(',');
  for (const f of FACTION_IDS) {
    const fac = palette.factions[f] as unknown;
    if (!fac) { out.push(`faction ${f} is missing`); continue; }
    if (!isObject(fac)) { out.push(`faction ${f} is not a faction: it needs "name" and "roles"`); continue; }
    const own = rolesOf(f);
    if (!own) { out.push(`faction ${f} has no "roles"`); continue; }
    const have = Object.keys(own).sort().join(',');
    if (have !== want) out.push(`faction ${f} has roles [${have}], but ${first} has [${want}]: every faction needs the same roles`);
    for (const [r, e] of Object.entries(own)) {
      if (!isObject(e)) { out.push(`${f}.${r}: is not a colour (it needs "hex")`); continue; }
      if (!HEX.test(e.hex as string)) out.push(`${f}.${r}: "${e.hex}" is not a #RRGGBB colour`);
      if (palette.roles[r]) out.push(`role ${r} is both a faction role and a shared role`);
    }
  }
  for (const [r, e] of Object.entries(palette.roles as Record<string, unknown>)) {
    if (!isObject(e)) { out.push(`${r}: is not a colour (it needs "hex")`); continue; }
    if (!HEX.test(e.hex as string)) out.push(`${r}: "${e.hex}" is not a #RRGGBB colour`);
  }
  const gradients = palette.gradients as unknown;
  if (gradients !== undefined && gradients !== null && !isObject(gradients)) out.push('"gradients" must hold named gradients (an object)');
  const roles = new Set(roleNames(palette));
  for (const [name, g] of Object.entries(isObject(gradients) ? gradients : {})) {
    const at = `gradient ${name}`;
    if (!GRADIENT_NAME.test(name)) out.push(`${at}: the name must be lowercase words joined by dots, such as glow.ramp`);
    if (!isObject(g)) { out.push(`${at}: is not a gradient (it needs "kind" and "stops")`); continue; }
    if (g.kind !== 'smooth' && g.kind !== 'banded') out.push(`${at}: kind must be "smooth" or "banded"`);
    if (!Array.isArray(g.stops) || g.stops.length < 2) { out.push(`${at}: needs at least two stops`); continue; }
    if (g.stops.length > 16) out.push(`${at}: has more than 16 stops`);
    (g.stops as unknown[]).forEach((s, i) => {
      const where = `${at}, stop ${i + 1}`;
      if (!isObject(s)) { out.push(`${where}: is not a stop (it needs "at" and a role or a hex)`); return; }
      if (typeof s.at !== 'number' || !(s.at >= 0 && s.at <= 1)) out.push(`${where}: "at" must be between 0 and 1`);
      if (s.alpha !== undefined && !(typeof s.alpha === 'number' && s.alpha >= 0 && s.alpha <= 1)) out.push(`${where}: alpha must be between 0 and 1`);
      if ((s.role === undefined) === (s.hex === undefined)) out.push(`${where}: give either a role or a hex`);
      if (s.role !== undefined && !roles.has(s.role as string)) out.push(`${where}: "${s.role}" is not a role in the palette`);
      if (s.hex !== undefined && !HEX.test(s.hex as string)) out.push(`${where}: "${s.hex}" is not a #RRGGBB colour`);
    });
  }
  return out;
}
