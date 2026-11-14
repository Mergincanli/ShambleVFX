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

export interface Palette {
  version: 1;
  about?: string;
  factions: Record<FactionId, { name: string; roles: Record<string, PaletteEntry> }>;
  roles: Record<string, PaletteEntry>;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Every role an effect file may name (shared roles and faction roles), sorted. */
export function roleNames(palette: Palette): string[] {
  const names = new Set<string>(Object.keys(palette.roles));
  for (const f of FACTION_IDS) for (const r of Object.keys(palette.factions[f].roles)) names.add(r);
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

/** Problems with the palette itself, in plain words. Empty when it is fine. */
export function checkPalette(palette: Palette): string[] {
  const out: string[] = [];
  if (palette.version !== 1) out.push(`palette version ${String(palette.version)} is not 1`);
  const first = FACTION_IDS[0]!;
  const want = Object.keys(palette.factions[first]?.roles ?? {}).sort().join(',');
  for (const f of FACTION_IDS) {
    const fac = palette.factions[f];
    if (!fac) { out.push(`faction ${f} is missing`); continue; }
    const have = Object.keys(fac.roles).sort().join(',');
    if (have !== want) out.push(`faction ${f} has roles [${have}], but ${first} has [${want}]: every faction needs the same roles`);
    for (const [r, e] of Object.entries(fac.roles)) {
      if (!HEX.test(e.hex)) out.push(`${f}.${r}: "${e.hex}" is not a #RRGGBB colour`);
      if (palette.roles[r]) out.push(`role ${r} is both a faction role and a shared role`);
    }
  }
  for (const [r, e] of Object.entries(palette.roles)) {
    if (!HEX.test(e.hex)) out.push(`${r}: "${e.hex}" is not a #RRGGBB colour`);
  }
  return out;
}
