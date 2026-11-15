/**
 * project.json, the file a project folder keeps next to its effects, and editor.json, the part of it an export carries.
 * One reader (with the upgrade from version 1) and one writer for each, shared by the local server
 * (server/project-files.ts, server/export.ts), the command line (tools/export.mjs, through server/export.ts) and the
 * editor (src/io/store.ts, App).
 *
 * project.json, version 2:
 *   format          "shamble-vfx-project"
 *   version         2
 *   name            the project's name
 *   paletteProfile  optional: the name of the palette profile the project's colours came from
 *   events          effect id -> the game events it answers
 *   preview         effect id -> { "scene": ... }, the scene the editor shows it in
 *   budgets         the cost budgets at three levels, only what differs from the defaults (../cost/budgets.ts)
 * Anything else in the file (such as "about") is kept as it is when the editor writes the file again.
 *
 * Version 1 had no paletteProfile, and its "budgets" were one set of numbers for the whole project (per tier, per
 * metric). Reading one gives version 2: those numbers become the project level, switched off.
 *
 * No imports but types and ../cost/budgets.ts: Vite's config loader loads the local server's file too, and it cannot
 * load the workspace packages. The file extension is written out, as that loader will need in a later Vite.
 */
import { EFFECT_ID, budgetsFromVersion1, budgetsJson, defaultBudgets, dropMissingEffects, readBudgets } from '../cost/budgets.ts';
import type { Budgets } from '../cost/budgets.ts';

export const PROJECT_FORMAT = 'shamble-vfx-project';
/** The version project.json is written in. */
export const PROJECT_VERSION = 2;
/** The version editor.json is written in (the same budgets as project.json version 2). */
export const EDITOR_NOTES_VERSION = 2;
/** The first line of editor.json. */
export const EDITOR_NOTE = 'For the Shamble VFX editor only (preview scenes, budgets, the palette profile\'s name). The game ignores this file.';

/** project.json as the editor holds it: always version 2, every part of the budgets filled in. */
export interface ProjectFile {
  /** The project's name as the file has it. A file without one shows the folder's name. */
  name?: string;
  /** The name of the palette profile the project's colours came from. */
  paletteProfile?: string;
  /** Effect id -> its game events, every string as the file has it (the checks name badly written ones). */
  events?: Record<string, string[]>;
  /** Effect id -> { scene }, as the file has it. */
  preview?: Record<string, unknown>;
  budgets: Budgets;
  /** Whatever else the file holds (such as "about"), kept as it is, in its order. */
  other: Record<string, unknown>;
}

/**
 * What reading gave. Not ok:
 * - "not-a-project": the file is not a JSON object. The editor opens the project without it, as before.
 * - "version": the file is a newer version, or its version is not a whole number. It is never written over.
 */
export type ProjectRead =
  | { ok: true; project: ProjectFile; upgradedFrom?: number }
  | { ok: false; kind: 'not-a-project' | 'version'; error: string; name?: string };

/** What editor.json held. An export without one gives the defaults. */
export interface EditorNotes {
  paletteProfile?: string;
  preview?: Record<string, unknown>;
  budgets: Budgets;
}

export type EditorNotesRead = { ok: true; notes: EditorNotes; upgradedFrom?: number } | { ok: false; error: string };

const KNOWN = new Set(['format', 'version', 'name', 'paletteProfile', 'events', 'preview', 'budgets']);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A new project's file: its name only (and the default budgets). */
export function newProjectFile(name: string): ProjectFile {
  return { name, budgets: defaultBudgets(), other: {} };
}

/**
 * The version a file says it is. A missing one is 1 (an editor.json from before version 2 has none). A newer version, or
 * one that is not a whole number, is refused in plain words.
 */
function versionOf(raw: Record<string, unknown>, file: string, newest: number, toUse: string): { version: number } | { error: string } {
  const v = Object.hasOwn(raw, 'version') ? raw.version : 1;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return { error: `${file} says "version": ${JSON.stringify(v)}, which is not a version number: open it in a text editor and write a whole number such as ${newest}` };
  }
  if (v > newest) return { error: `${file} is version ${v}, and this Shamble VFX reads version ${newest} and older: update Shamble VFX ${toUse}` };
  return { version: v };
}

/** Read project.json (version 1 or 2) as version 2. */
export function readProjectJson(raw: unknown): ProjectRead {
  if (!isObject(raw)) return { ok: false, kind: 'not-a-project', error: 'project.json is not a JSON object' };
  const name = typeof raw.name === 'string' ? raw.name : undefined;
  const v = versionOf(raw, 'project.json', PROJECT_VERSION, 'to open this project');
  if ('error' in v) return { ok: false, kind: 'version', error: v.error, ...(name !== undefined ? { name } : {}) };
  const other: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(raw)) if (!KNOWN.has(k) && k !== '__proto__') other[k] = val;
  const events = readEvents(raw.events);
  const profile = readProfileName(raw.paletteProfile);
  const project: ProjectFile = {
    ...(name !== undefined ? { name } : {}),
    ...(profile !== undefined ? { paletteProfile: profile } : {}),
    ...(events ? { events } : {}),
    ...(isObject(raw.preview) ? { preview: raw.preview } : {}),
    budgets: v.version === 1 ? budgetsFromVersion1(raw.budgets) : readBudgets(raw.budgets),
    other,
  };
  return { ok: true, project, ...(v.version < PROJECT_VERSION ? { upgradedFrom: v.version } : {}) };
}

/**
 * What to write as project.json: version 2, in a fixed order (format, version, name, paletteProfile, whatever else the
 * file held, events, preview, budgets). Budgets hold only what differs from the defaults, and are left out when nothing does.
 */
export function toProjectJson(p: ProjectFile): Record<string, unknown> {
  const out: Record<string, unknown> = { format: PROJECT_FORMAT, version: PROJECT_VERSION };
  if (p.name !== undefined) out.name = p.name;
  if (p.paletteProfile !== undefined) out.paletteProfile = p.paletteProfile;
  for (const [k, v] of Object.entries(p.other)) if (!KNOWN.has(k) && k !== '__proto__') out[k] = v;
  if (p.events !== undefined) out.events = p.events;
  if (p.preview !== undefined) out.preview = p.preview;
  const budgets = budgetsJson(p.budgets);
  if (Object.keys(budgets).length) out.budgets = budgets;
  return out;
}

/**
 * editor.json for an export: version 2, the palette profile's name (when the project has one), the preview scenes and
 * the budgets. Budget entries of effects that are not in the export are left out.
 */
export function toEditorJson(p: ProjectFile, effectIds: Iterable<string>): Record<string, unknown> {
  return {
    note: EDITOR_NOTE,
    version: EDITOR_NOTES_VERSION,
    ...(p.paletteProfile !== undefined ? { paletteProfile: p.paletteProfile } : {}),
    preview: p.preview ?? {},
    budgets: budgetsJson(dropMissingEffects(p.budgets, effectIds)),
  };
}

/**
 * Read an export's editor.json: version 2, or the older one with no version (its budgets were one set of numbers for the
 * whole project: they become the project level, switched off). A missing or unreadable file gives the defaults.
 */
export function readEditorJson(raw: unknown): EditorNotesRead {
  if (!isObject(raw)) return { ok: true, notes: { budgets: defaultBudgets() } };
  const v = versionOf(raw, 'editor.json', EDITOR_NOTES_VERSION, 'to import this export');
  if ('error' in v) return { ok: false, error: v.error };
  const profile = readProfileName(raw.paletteProfile);
  const notes: EditorNotes = {
    ...(profile !== undefined ? { paletteProfile: profile } : {}),
    ...(isObject(raw.preview) ? { preview: raw.preview } : {}),
    budgets: v.version === 1 ? budgetsFromVersion1(raw.budgets) : readBudgets(raw.budgets),
  };
  return { ok: true, notes, ...(v.version < EDITOR_NOTES_VERSION ? { upgradedFrom: v.version } : {}) };
}

/** The game events: lists of strings by effect id. Other values are left out. */
function readEvents(v: unknown): Record<string, string[]> | undefined {
  if (!isObject(v)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(v)) {
    if (EFFECT_ID.test(id) && Array.isArray(list)) out[id] = list.filter((e): e is string => typeof e === 'string');
  }
  return out;
}

/** A palette profile's name: a string with something in it, trimmed. */
function readProfileName(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
