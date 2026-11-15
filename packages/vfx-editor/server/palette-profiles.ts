/**
 * The palettes folder on disk: palette profiles, one file each (palettes/<id>.json; the rules are in
 * ../src/io/palette-profile.ts). The editor's local server loads this file through Vite (ssrLoadModule), as it loads
 * ./export.ts, so it can use the format package; export.ts uses it when an import adds the export's colours as a profile.
 * Tests import it directly, each with its own folder.
 *
 * - When the folder does not exist yet, it is made with the two default profiles ("Built-in" and "Built-in with
 *   gradients"). A folder that exists never gets them again by itself: deleted defaults come back only by
 *   restoreDefaultProfiles, which adds the ones whose name is missing.
 * - The file names are made here: a safe slug of the name, plus a number when taken. A name or a path read from a file or
 *   a request is never used as a path: an id is looked up in the folder's own listing. Symbolic links are skipped.
 * - Names are unique without regard to upper and lower case.
 * - One change at a time per folder, so two requests never take the same name or file.
 * Errors carry an HTTP status and plain words (ProfileError).
 */
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import paletteJson from '@shamble/vfx-format/palette.json';
import type { Palette } from '@shamble/vfx-format';
import {
  BUILT_IN_PROFILE, PROFILE_ID, chooseImportProfile, defaultProfiles, profileName, profileNameProblem, profilePaletteProblems,
  profileSummary, readProfileFile, sameName, toProfileJson,
} from '../src/io/palette-profile';
import type { ImportedProfile, Profile, ProfileFileProblem, ProfileListing, ProfileSummary } from '../src/io/palette-profile';
import { slugify } from './project-files';

export { BUILT_IN_PROFILE };

/** The built-in palette: the default profiles are made from it. */
const builtInPalette = paletteJson as Palette;

/** What went wrong, with the HTTP status the local server answers with. */
export class ProfileError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ProfileError';
  }
}

const toJson = (v: unknown): string => JSON.stringify(v, null, 2) + '\n';

// ---------------------------------------------------------------- one change at a time

const queues = new Map<string, Promise<unknown>>();

/** Run `fn` after every earlier call for the same folder has finished. */
function oneAtATime<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(dir);
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  const done = run.catch(() => undefined);
  queues.set(key, done);
  void done.then(() => { if (queues.get(key) === done) queues.delete(key); });
  return run;
}

// ---------------------------------------------------------------- the folder

/**
 * A file in the folder: readable as a profile, or not (then `error` says why, and `newer` when it is a newer version).
 * `name` is known when the file says one.
 */
interface Entry {
  id: string;
  file: string;
  changed: Date;
  name?: string;
  palette?: Palette;
  error?: string;
  newer?: boolean;
}

/** Make the folder with the default profiles when it does not exist yet. */
async function ensureFolder(dir: string): Promise<void> {
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) throw new ProfileError(500, `The palette profiles folder (${dir}) is a file, not a folder`);
    return;
  } catch (e) {
    if (e instanceof ProfileError || (e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  await fs.mkdir(dirname(resolve(dir)), { recursive: true });
  try {
    await fs.mkdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return;
    throw e;
  }
  for (const d of defaultProfiles(builtInPalette)) await writeNew(dir, d.name, d.palette);
}

/** Every .json file in the folder (no dot files, no folders, no links), read. */
async function scan(dir: string): Promise<{ entries: Entry[]; problems: ProfileFileProblem[] }> {
  const entries: Entry[] = [];
  const problems: ProfileFileProblem[] = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    if (!d.name.endsWith('.json') || d.name.startsWith('.')) continue;
    if (!d.isFile()) continue; // folders and symbolic links are never followed
    const id = d.name.slice(0, -'.json'.length);
    if (!PROFILE_ID.test(id)) {
      problems.push({ file: d.name, error: `"${d.name}" is not a palette profile file name: the editor names them itself (lowercase letters, digits, - and _)` });
      continue;
    }
    const file = join(dir, d.name);
    let changed: Date;
    let raw: unknown;
    try {
      const [st, text] = await Promise.all([fs.stat(file), fs.readFile(file, 'utf8')]);
      changed = st.mtime;
      raw = JSON.parse(text);
    } catch (e) {
      const why = e instanceof SyntaxError ? `it is not JSON (${e.message})` : `it cannot be read (${(e as Error).message})`;
      entries.push({ id, file, changed: new Date(0), error: why });
      problems.push({ file: d.name, error: `"${d.name}": ${why}` });
      continue;
    }
    const r = readProfileFile(raw);
    if (r.ok) entries.push({ id, file, changed, name: r.name, palette: r.palette });
    else {
      entries.push({ id, file, changed, error: r.error, ...(r.kind === 'version' ? { newer: true } : {}), ...(r.name !== undefined ? { name: r.name } : {}) });
      problems.push({ file: d.name, error: `"${d.name}": ${r.error}` });
    }
  }
  return { entries, problems };
}

const readable = (entries: Entry[]) => entries.filter((e): e is Entry & { name: string; palette: Palette } => !e.error);
const names = (entries: Entry[]) => entries.flatMap((e) => (e.name !== undefined ? [e.name] : []));
const summaryOf = (e: Entry & { name: string; palette: Palette }) => profileSummary(e.id, e.name, e.changed, e.palette);

function listing(entries: Entry[], problems: ProfileFileProblem[]): ProfileListing {
  const profiles = readable(entries).map(summaryOf);
  profiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { profiles, problems: problems.sort((a, b) => a.file.localeCompare(b.file)) };
}

/** The file of a profile by its id, from the folder's own listing (never a path made from the request). */
function find(entries: Entry[], id: string): Entry {
  if (typeof id !== 'string' || !PROFILE_ID.test(id)) throw new ProfileError(400, `"${String(id)}" is not a palette profile id`);
  const e = entries.find((x) => x.id === id);
  if (!e) throw new ProfileError(404, `There is no palette profile "${id}" (it may have been renamed or deleted: list the profiles again)`);
  return e;
}

/** A profile that can be changed: readable, and not of a newer version. */
function changeable(e: Entry): Entry & { name: string; palette: Palette } {
  if (!e.error) return e as Entry & { name: string; palette: Palette };
  const file = `${e.id}.json`;
  if (e.newer) throw new ProfileError(409, `"${file}": ${e.error}. It is left as it is`);
  throw new ProfileError(422, `"${file}": ${e.error}. Fix it in a text editor, or delete it`);
}

/** The colours given, read as the current version; plain words when they cannot be kept. */
function paletteToKeep(palette: unknown): Palette {
  const { palette: p, problems } = profilePaletteProblems(palette);
  if (problems.length) throw new ProfileError(400, `These colours cannot be kept as a palette profile: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (and ${problems.length - 3} more)` : ''}`);
  return p;
}

/** The base of a profile's file name: a safe slug of its name ("profile" when nothing usable is left). */
function slugOf(name: string): string {
  return slugify(name) || 'profile';
}

/** The ids a profile with this name may have: its slug, then its slug with a number. */
function idFits(id: string, name: string): boolean {
  const base = slugOf(name);
  return id === base || (id.startsWith(`${base}-`) && /^\d+$/.test(id.slice(base.length + 1)));
}

/**
 * Write a new profile file under the first free id (its slug, then slug-2, slug-3, ...), never over another file: the
 * whole file is written next to it first, then linked in under its name, which fails when the name is taken.
 */
async function writeNew(dir: string, name: string, palette: Palette): Promise<string> {
  const text = toJson(toProfileJson(name, palette));
  const base = slugOf(name);
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const file = join(dir, `${id}.json`);
    const tmp = join(dir, `.${id}.json.${randomBytes(6).toString('hex')}.tmp`);
    await fs.writeFile(tmp, text, { flag: 'wx' });
    try {
      await fs.link(tmp, file);
      return id;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue;
      // A file system without hard links: one change at a time keeps others out, so a rename is safe while the name is free.
      if (await fs.lstat(file).then(() => true, () => false)) continue;
      await fs.rename(tmp, file);
      return id;
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }
}

/** Write over an existing profile file: next to it first, then renamed over it, so a file is never half written. */
async function writeOver(file: string, name: string, palette: Palette): Promise<void> {
  const tmp = join(dirname(file), `.${file.split(/[\\/]/).pop()}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await fs.writeFile(tmp, toJson(toProfileJson(name, palette)), { flag: 'wx' });
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

async function summaryAt(dir: string, id: string, name: string, palette: Palette): Promise<ProfileSummary> {
  const st = await fs.stat(join(dir, `${id}.json`));
  return profileSummary(id, profileName(name), st.mtime, palette);
}

// ---------------------------------------------------------------- what the local server offers

/** Every profile (id, name, when changed, swatches), and the files that cannot be used, with why. */
export function listProfiles(dir: string): Promise<ProfileListing> {
  return oneAtATime(dir, async () => {
    await ensureFolder(dir);
    const { entries, problems } = await scan(dir);
    return listing(entries, problems);
  });
}

/** One profile, with its palette (read as the current version). */
export function readProfile(dir: string, id: string): Promise<Profile> {
  return oneAtATime(dir, async () => {
    await ensureFolder(dir);
    const e = changeable(find((await scan(dir)).entries, id));
    return { ...summaryOf(e), palette: e.palette };
  });
}

/** A new profile with these colours. Refused (409) when the name is taken, so the editor can ask for another. */
export function createProfile(dir: string, name: string, palette: unknown): Promise<ProfileSummary> {
  return oneAtATime(dir, async () => {
    await ensureFolder(dir);
    const { entries } = await scan(dir);
    const wrong = profileNameProblem(String(name ?? ''), names(entries));
    if (wrong) throw new ProfileError(/^There is already/.test(wrong) ? 409 : 400, wrong);
    const p = paletteToKeep(palette);
    const nice = profileName(name);
    const id = await writeNew(dir, nice, p);
    return summaryAt(dir, id, nice, p);
  });
}

/** Save these colours over an existing profile. Its name and id stay. */
export function saveProfile(dir: string, id: string, palette: unknown): Promise<ProfileSummary> {
  return oneAtATime(dir, async () => {
    await ensureFolder(dir);
    const e = changeable(find((await scan(dir)).entries, id));
    const p = paletteToKeep(palette);
    await writeOver(e.file, e.name, p);
    return summaryAt(dir, e.id, e.name, p);
  });
}

/**
 * Give a profile another name (refused, 409, when the name is taken). Its file is renamed to fit the new name, so its id
 * can change: the summary gives the id it ends with.
 */
export function renameProfile(dir: string, id: string, name: string): Promise<ProfileSummary> {
  return oneAtATime(dir, async () => {
    await ensureFolder(dir);
    const { entries } = await scan(dir);
    const e = changeable(find(entries, id));
    const wrong = profileNameProblem(String(name ?? ''), names(entries.filter((x) => x !== e)));
    if (wrong) throw new ProfileError(/^There is already/.test(wrong) ? 409 : 400, wrong);
    const nice = profileName(name);
    if (idFits(e.id, nice)) {
      await writeOver(e.file, nice, e.palette);
      return summaryAt(dir, e.id, nice, e.palette);
    }
    const newId = await writeNew(dir, nice, e.palette);
    await fs.rm(e.file, { force: true });
    return summaryAt(dir, newId, nice, e.palette);
  });
}

/** Delete a profile (a default one too: it does not come back by itself). A file that cannot be read can be deleted too. */
export function deleteProfile(dir: string, id: string): Promise<void> {
  return oneAtATime(dir, async () => {
    await ensureFolder(dir);
    const e = find((await scan(dir)).entries, id);
    await fs.rm(e.file, { force: true });
  });
}

/** Add back the default profiles whose names are missing (without regard to case); one with the name, edited or not, stays as it is. */
export function restoreDefaultProfiles(dir: string): Promise<ProfileListing & { added: string[] }> {
  return oneAtATime(dir, async () => {
    await ensureFolder(dir);
    const added: string[] = [];
    const taken = names((await scan(dir)).entries);
    for (const d of defaultProfiles(builtInPalette)) {
      if (taken.some((t) => sameName(t, d.name))) continue;
      await writeNew(dir, d.name, d.palette);
      added.push(d.name);
    }
    const { entries, problems } = await scan(dir);
    return { added, ...listing(entries, problems) };
  });
}

/**
 * An import's colours as a profile: `wanted` is editor.json's profile name, else the export's project name. A profile of
 * that name (or one of its numbered names) with the very same colours is used as it is; else the colours are added, under
 * the name or the first free numbered name (see chooseImportProfile).
 */
export function addImportedProfile(dir: string, wanted: string, palette: unknown): Promise<ImportedProfile> {
  return oneAtATime(dir, async () => {
    const p = paletteToKeep(palette);
    await ensureFolder(dir);
    const { entries } = await scan(dir);
    const choice = chooseImportProfile(readable(entries), names(entries), wanted, p);
    if ('use' in choice) return { id: choice.use.id, name: choice.use.name, added: false };
    const id = await writeNew(dir, choice.add, p);
    return { id, name: choice.add, added: true };
  });
}
