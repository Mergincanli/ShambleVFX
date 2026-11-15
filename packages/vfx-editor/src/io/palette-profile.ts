/**
 * Palette profiles: named sets of colours (a whole palette, gradients included), kept on this computer in the palettes
 * folder (palettes/ at the repo root; git ignores it). A project can load one, or keep its colours as one, so the same
 * colours travel between projects. The runtime never sees profiles: a project keeps its colours in its own palette.json,
 * and an export carries that.
 *
 * A profile file, palettes/<id>.json:
 *   { "format": "shamble-vfx-palette-profile", "version": 1, "name": "Soviets dark", "palette": { a palette, version 2 } }
 * The id is the file's name without ".json". The local server makes it from the name (a safe slug, plus a number when
 * taken) and never uses a name or a path it reads as a path.
 *
 * This file holds the rules, with no disk: the file's reader and writer, the name rule, when two palettes hold the very
 * same colours, the swatches a list shows, the two default profiles, and which profile an import's colours become. The
 * local server (server/palette-profiles.ts, which Vite loads, so this file may use the format package), the command line
 * (through it) and the editor (src/io/store.ts) share it.
 */
import { FACTION_IDS, checkPalette, upgradePalette } from '@shamble/vfx-format';
import type { FactionId, Gradient, GradientStop, Palette, PaletteEntry } from '@shamble/vfx-format';
import { GRADIENT_PRESETS } from '../doc/gradient-presets';

export const PROFILE_FORMAT = 'shamble-vfx-palette-profile';
/** The version profile files are written in. */
export const PROFILE_VERSION = 1;
/** The longest profile name, in characters. */
export const PROFILE_NAME_MAX = 64;
/** A profile's id: its file name without ".json" (lowercase letters, digits, - and _). */
export const PROFILE_ID = /^[a-z0-9][a-z0-9_-]{0,71}$/;
/** The default profiles a fresh palettes folder gets. */
export const BUILT_IN_PROFILE = 'Built-in';
export const BUILT_IN_GRADIENTS_PROFILE = 'Built-in with gradients';
/** The name an import's colours get when the export names nothing usable. */
export const IMPORTED_PROFILE = 'Imported colours';
/** How many swatches a list shows of each profile, at most. */
export const SWATCH_COUNT = 8;

export interface ProfileSwatch {
  role: string;
  hex: string;
  /** For a team colour (one per faction): whose it is. */
  faction?: FactionId;
}

/** A profile as a list shows it. */
export interface ProfileSummary {
  /** The profile's file name without ".json", made by the local server. Read, save, rename and delete it by this. */
  id: string;
  name: string;
  /** When its file last changed (ISO 8601, such as "2026-11-15T21:54:19.000Z"). */
  changed: string;
  /** A few of its colours, to show as swatches: each faction's team colour, then its first shared colours (eight at most). */
  swatches: ProfileSwatch[];
  /** How many gradients it has. */
  gradientCount: number;
}

/** A whole profile: its summary and its palette (version 2). */
export interface Profile extends ProfileSummary {
  palette: Palette;
}

/** A .json file in the palettes folder that cannot be used as a profile, and why (in plain words). */
export interface ProfileFileProblem {
  /** The file's name as found in the folder. */
  file: string;
  error: string;
}

export interface ProfileListing {
  /** Sorted by name. */
  profiles: ProfileSummary[];
  problems: ProfileFileProblem[];
}

/** The profile an import's colours became: added, or one that already held the very same colours (added false). */
export interface ImportedProfile {
  id: string;
  name: string;
  added: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- names

/** Tabs, line breaks and every other control character. */
const CONTROL = /[\p{Cc}\u2028\u2029]/u;
const CONTROLS = /[\p{Cc}\u2028\u2029]+/gu;
/** "Soviets dark (3)": a name and its number. */
const NUMBERED = /^(.*\S) \(([1-9]\d{0,8})\)$/su;

/** Characters, not UTF-16 units. */
const length = (s: string) => [...s].length;
/** The first `max` characters, without spaces at the end. */
const cut = (s: string, max: number) => [...s].slice(0, max).join('').trimEnd();

/** A name as a profile keeps it: trimmed, in one Unicode form (so the same letters always compare equal). */
export function profileName(name: string): string {
  return name.normalize('NFC').trim();
}

/** Two names are the same name without regard to upper and lower case. */
export function sameName(a: string, b: string): boolean {
  return profileName(a).toLowerCase() === profileName(b).toLowerCase();
}

/**
 * Why a profile cannot have this name, or undefined when it can: trimmed, 1 to 64 characters, no control characters
 * (tabs, line breaks), and not one of `taken` without regard to upper and lower case.
 */
export function profileNameProblem(name: string, taken: Iterable<string> = []): string | undefined {
  const n = profileName(name);
  if (!n || length(n) > PROFILE_NAME_MAX || CONTROL.test(n)) return `A palette profile name needs 1 to ${PROFILE_NAME_MAX} characters, with no tabs or line breaks.`;
  for (const t of taken) if (sameName(t, n)) return `There is already a palette profile named "${profileName(t)}": pick another name.`;
  return undefined;
}

/**
 * A usable profile name from free text (an export's names): control characters become spaces, then it is trimmed and cut
 * to 64 characters. Nothing left gives "Imported colours".
 */
export function importProfileName(text: string): string {
  return cut(profileName(text.replace(CONTROLS, ' ')), PROFILE_NAME_MAX) || IMPORTED_PROFILE;
}

/** The name without a number at its end: "Soviets dark (2)" -> "Soviets dark". */
export function nameBase(name: string): string {
  return NUMBERED.exec(name)?.[1] ?? name;
}

/** The base name with a number: "Soviets dark (2)". The base is cut so the whole stays within 64 characters. */
export function numberedName(base: string, n: number): string {
  const suffix = ` (${n})`;
  return cut(base, PROFILE_NAME_MAX - suffix.length) + suffix;
}

// ---------------------------------------------------------------- the file

export type ProfileRead =
  | { ok: true; name: string; palette: Palette }
  /** not-a-profile: no profile format. version: a newer version (never written over). broken: something in it is wrong. */
  | { ok: false; kind: 'not-a-profile' | 'version' | 'broken'; error: string; name?: string };

/**
 * Read a profile file. An older palette inside is read as the current version (upgradePalette) and must then pass
 * checkPalette. A file with no version is read as version 1. Errors are in plain words, about the file ("it ...").
 */
export function readProfileFile(raw: unknown): ProfileRead {
  if (!isObject(raw) || raw.format !== PROFILE_FORMAT) return { ok: false, kind: 'not-a-profile', error: `it is not a palette profile (it needs "format": "${PROFILE_FORMAT}")` };
  const rawName = typeof raw.name === 'string' ? raw.name : undefined;
  const named = rawName !== undefined && profileName(rawName) ? { name: profileName(rawName) } : {};
  const v = Object.hasOwn(raw, 'version') ? raw.version : 1;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return { ok: false, kind: 'broken', error: `it says "version": ${JSON.stringify(v)}, which is not a version number (write ${PROFILE_VERSION})`, ...named };
  }
  if (v > PROFILE_VERSION) return { ok: false, kind: 'version', error: `it is version ${v}, and this Shamble VFX reads version ${PROFILE_VERSION}: update Shamble VFX to use it`, ...named };
  if (rawName === undefined) return { ok: false, kind: 'broken', error: 'it has no "name"' };
  const wrongName = profileNameProblem(rawName);
  if (wrongName) return { ok: false, kind: 'broken', error: `its name: ${wrongName}`, ...named };
  const palette = upgradePalette(raw.palette);
  const wrong = checkPalette(palette);
  if (wrong.length) return { ok: false, kind: 'broken', error: `its colours: ${wrong[0]}${wrong.length > 1 ? ` (and ${wrong.length - 1} more)` : ''}`, ...named };
  return { ok: true, name: profileName(rawName), palette };
}

/** What to write as a profile file (version 1). */
export function toProfileJson(name: string, palette: Palette): Record<string, unknown> {
  return { format: PROFILE_FORMAT, version: PROFILE_VERSION, name: profileName(name), palette };
}

/** A palette's problems when it is to be kept as a profile (after reading it as the current version), or none. */
export function profilePaletteProblems(palette: unknown): { palette: Palette; problems: string[] } {
  const p = upgradePalette(palette);
  return { palette: p, problems: checkPalette(p) };
}

// ---------------------------------------------------------------- the colours

/**
 * What decides whether two palettes hold the very same colours: the factions (their names, roles and hexes), the shared
 * roles and hexes, and the gradients (kind and stops). "from", notes and "about" are left out; hexes compare without
 * regard to case, and a stop with no alpha is solid.
 */
function coloursKey(p: Palette): string {
  const up = (h: unknown) => (typeof h === 'string' ? h.toUpperCase() : null);
  const roles = (r: Record<string, PaletteEntry> | undefined) => Object.keys(r ?? {}).sort().map((k) => [k, up(r![k]?.hex)]);
  const factions = FACTION_IDS.map((f) => [f, p.factions?.[f]?.name ?? null, roles(p.factions?.[f]?.roles)]);
  const gradients = Object.keys(p.gradients ?? {}).sort().map((n) => {
    const g = p.gradients[n]!;
    const stops: GradientStop[] = Array.isArray(g?.stops) ? g.stops : [];
    return [n, g?.kind ?? null, stops.map((s) => [s.at, s.role ?? null, up(s.hex), s.alpha ?? 1])];
  });
  return JSON.stringify({ factions, roles: roles(p.roles), gradients });
}

/** True when two palettes hold the very same colours (see coloursKey). */
export function sameColours(a: Palette, b: Palette): boolean {
  return coloursKey(a) === coloursKey(b);
}

/** A few colours to show for a profile: each faction's team colour (else its first faction colour), then the shared colours in the palette's order, eight at most. */
export function profileSwatches(p: Palette): ProfileSwatch[] {
  const out: ProfileSwatch[] = [];
  for (const f of FACTION_IDS) {
    const roles = p.factions?.[f]?.roles ?? {};
    const role = Object.hasOwn(roles, 'team') ? 'team' : Object.keys(roles)[0];
    if (role !== undefined && roles[role]) out.push({ role, hex: roles[role]!.hex, faction: f });
  }
  for (const [role, e] of Object.entries(p.roles ?? {})) {
    if (out.length >= SWATCH_COUNT) break;
    out.push({ role, hex: e.hex });
  }
  return out.slice(0, SWATCH_COUNT);
}

/** A profile's summary, from what its file holds. */
export function profileSummary(id: string, name: string, changed: Date, palette: Palette): ProfileSummary {
  return { id, name, changed: changed.toISOString(), swatches: profileSwatches(palette), gradientCount: Object.keys(palette.gradients ?? {}).length };
}

// ---------------------------------------------------------------- the default profiles

/** The Molotov bed's tones, from the rim to the middle (the bed layers of examples/demo-project's Molotov; a test compares them). */
export const MOLOTOV_BED_TONES = ['heat.dark', 'heat.1', 'heat.2', 'heat.3'] as const;

/**
 * Where band k of K sits on a fire's bed without a gradient, from the rim (0) to the middle (1): the runtime's
 * 0.58 k / (K - 1) + 0.03 k, to four decimals (a band moves less than a tenth of a millimetre on the Molotov's bed).
 */
export function bedTonePlace(k: number, K: number): number {
  return K > 1 ? Math.round((0.58 * (k / (K - 1)) + 0.03 * k) * 1e4) / 1e4 : 0;
}

const stop = (at: number, role: string, alpha?: number): GradientStop => ({ at, role, ...(alpha === undefined ? {} : { alpha }) });

/**
 * The gradients the default profile "Built-in with gradients" adds to the built-in colours: the ready-made ones the colour
 * picker offers, then one each for the fire's bed, sparks and smoke. Built-in roles only, no hex values. Proposals
 * ("from": "assumed").
 */
export function defaultProfileGradients(): Record<string, Gradient> {
  const out: Record<string, Gradient> = {};
  for (const p of GRADIENT_PRESETS) out[p.name] = { ...structuredClone(p.gradient), from: 'assumed', note: `The ready-made gradient "${p.label}".` };
  out['fire.bed'] = {
    kind: 'banded', from: 'assumed',
    note: 'A fire\'s bed, from the rim to the middle: the Molotov bed\'s four tones at the places its bands take without a gradient, so it draws today\'s bed.',
    stops: MOLOTOV_BED_TONES.map((role, k) => stop(bedTonePlace(k, MOLOTOV_BED_TONES.length), role)),
  };
  out['sparks.cool'] = {
    kind: 'smooth', from: 'assumed',
    note: 'A spark over its life: white-hot, then yellow, orange and burnt orange as it fades out.',
    stops: [stop(0, 'heat.4'), stop(0.3, 'heat.3'), stop(0.65, 'heat.1'), stop(1, 'heat.dark', 0)],
  };
  out['smoke.thin'] = {
    kind: 'smooth', from: 'assumed',
    note: 'A fire\'s smoke over each puff\'s life: solid until 60 %, then thinning to nothing.',
    stops: [stop(0, 'fire.smoke'), stop(0.6, 'fire.smoke'), stop(1, 'fire.smoke', 0)],
  };
  return out;
}

/** The two profiles a fresh palettes folder gets: the built-in colours as they are, and the same colours with gradients. */
export function defaultProfiles(builtIn: Palette): { name: string; palette: Palette }[] {
  const withGradients: Palette = { ...structuredClone(builtIn), gradients: { ...structuredClone(builtIn.gradients ?? {}), ...defaultProfileGradients() } };
  return [
    { name: BUILT_IN_PROFILE, palette: structuredClone(builtIn) },
    { name: BUILT_IN_GRADIENTS_PROFILE, palette: withGradients },
  ];
}

// ---------------------------------------------------------------- an import's colours

/**
 * Which profile an import's colours become. `wanted` is editor.json's profile name, else the export's project name.
 * - The name's family is the name, its base and the base's numbered names ("Soviets dark", "Soviets dark (1)", ...; a
 *   name that ends in " (n)" counts from its base). If one of them holds the very same colours, that one is used (the
 *   name first, then the base, then by number).
 * - Else the colours are added: under the name when it is free, else under the base with the first free number.
 * `profiles` are the readable profiles; `taken` every name in the folder (unreadable files' names too).
 */
export function chooseImportProfile<P extends { id: string; name: string; palette: Palette }>(
  profiles: readonly P[], taken: readonly string[], wanted: string, palette: Palette,
): { use: P } | { add: string } {
  const name = importProfileName(wanted);
  const base = nameBase(name);
  const key = (s: string) => profileName(s).toLowerCase();
  const rank = (p: P): number => {
    const k = key(p.name);
    if (k === key(name)) return 0;
    if (k === key(base)) return 1;
    const m = NUMBERED.exec(profileName(p.name));
    return m && k === key(numberedName(base, Number(m[2]))) ? 1 + Number(m[2]) : -1;
  };
  const family = profiles.map((p) => ({ p, r: rank(p) })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r || a.p.id.localeCompare(b.p.id));
  const same = family.find((x) => sameColours(x.p.palette, palette));
  if (same) return { use: same.p };
  const used = new Set([...taken, ...profiles.map((p) => p.name)].map(key));
  if (!used.has(key(name))) return { add: name };
  for (let n = 1; ; n++) {
    const candidate = numberedName(base, n);
    if (!used.has(key(candidate))) return { add: candidate };
  }
}
