/**
 * The palettes folder on disk (server/palette-profiles.ts), the routes of the local server and the editor's store
 * functions for palette profiles. Every test uses a folder of its own under the system's temporary folder: the real
 * palettes/ is never touched (checked at the end).
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import type { Palette } from '@shamble/vfx-format';
import {
  ProfileError, addImportedProfile, createProfile, deleteProfile, listProfiles, readProfile, renameProfile, restoreDefaultProfiles, saveProfile,
} from '../server/palette-profiles';
import { createProjectFilesHandler } from '../server/project-files';
import { DevServerStore, StoreError } from '../src/io/store';
import { PROFILE_FORMAT, defaultProfiles, profileSwatches, toProfileJson } from '../src/io/palette-profile';
import { BROKEN, brokenCopy } from './broken-palettes';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const realPalettes = join(repo, 'palettes');
const realBefore = existsSync(realPalettes) ? readdirSync(realPalettes).sort() : null;
const builtIn = paletteJson as Palette;
const fresh = (): Palette => structuredClone(builtIn);
const tmp = mkdtempSync(join(tmpdir(), 'shamble-vfx-palettes-'));
let n = 0;
/** A palettes folder of its own (not made yet). */
const folder = () => join(tmp, `palettes-${++n}`);
const toJson = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const posix = process.platform !== 'win32';

/** The error a call ends with: its status and message. */
async function refusal(p: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ProfileError || e instanceof StoreError) return { status: e.status, message: e.message };
    throw e;
  }
  throw new Error('it did not fail');
}

const coloursWith = (hex: string) => { const p = fresh(); p.roles['heat.1']!.hex = hex; return p; };

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
  // The real palettes folder: as it was (not made, if it was not there).
  expect(existsSync(realPalettes) ? readdirSync(realPalettes).sort() : null).toEqual(realBefore);
});

describe('the palettes folder', () => {
  it('is made with the two default profiles the first time it is needed', async () => {
    const dir = folder();
    const list = await listProfiles(dir);
    expect(list.problems).toEqual([]);
    expect(list.profiles.map((p) => [p.id, p.name, p.gradientCount])).toEqual([['built-in', 'Built-in', 0], ['built-in-with-gradients', 'Built-in with gradients', 12]]);
    expect(readdirSync(dir).sort()).toEqual(['built-in-with-gradients.json', 'built-in.json']);
    const [plain, graded] = defaultProfiles(builtIn);
    expect(readFileSync(join(dir, 'built-in.json'), 'utf8')).toBe(toJson(toProfileJson(plain!.name, plain!.palette)));
    expect(readFileSync(join(dir, 'built-in-with-gradients.json'), 'utf8')).toBe(toJson(toProfileJson(graded!.name, graded!.palette)));
    expect(JSON.parse(readFileSync(join(dir, 'built-in.json'), 'utf8'))).toEqual({ format: PROFILE_FORMAT, version: 1, name: 'Built-in', palette: builtIn });
  });

  it('gives each profile its id, name, when it changed, swatches and how many gradients, sorted by name', async () => {
    const dir = folder();
    const t0 = Date.now() - 1000;
    await createProfile(dir, 'apple', fresh());
    const list = await listProfiles(dir);
    expect(list.profiles.map((p) => p.name)).toEqual(['apple', 'Built-in', 'Built-in with gradients']);
    const p = list.profiles[0]!;
    expect(p.id).toBe('apple');
    expect(p.swatches).toEqual(profileSwatches(builtIn));
    expect(Date.parse(p.changed)).toBeGreaterThanOrEqual(t0);
    expect(p.changed).toBe(statSync(join(dir, 'apple.json')).mtime.toISOString());
  });

  it('gets no defaults when it exists already, even empty', async () => {
    const dir = folder();
    mkdirSync(dir);
    expect(await listProfiles(dir)).toEqual({ profiles: [], problems: [] });
    expect(readdirSync(dir)).toEqual([]);
  });

  it('never brings back a deleted default by itself; restoring adds back the missing ones once, and leaves one that is there as it is', async () => {
    const dir = folder();
    await listProfiles(dir);
    await deleteProfile(dir, 'built-in');
    expect((await listProfiles(dir)).profiles.map((p) => p.name)).toEqual(['Built-in with gradients']);
    // An edited default stays as it is; a profile named like a default (in other letters) counts as that default.
    await saveProfile(dir, 'built-in-with-gradients', coloursWith('#000001'));
    const first = await restoreDefaultProfiles(dir);
    expect(first.added).toEqual(['Built-in']);
    expect(first.profiles.map((p) => p.name)).toEqual(['Built-in', 'Built-in with gradients']);
    expect((await readProfile(dir, 'built-in-with-gradients')).palette.roles['heat.1']!.hex).toBe('#000001');
    const again = await restoreDefaultProfiles(dir);
    expect(again.added).toEqual([]);
    expect(readdirSync(dir).sort()).toEqual(['built-in-with-gradients.json', 'built-in.json']);
    await renameProfile(dir, 'built-in', 'BUILT-IN');
    expect((await restoreDefaultProfiles(dir)).added).toEqual([]);
  });

  it('names the .json files it cannot use, and why; other files, dot files, folders and links are left out', async () => {
    const dir = folder();
    mkdirSync(dir);
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    writeFileSync(join(dir, 'project.json'), toJson({ format: 'shamble-vfx-project', version: 2, name: 'A project' }));
    writeFileSync(join(dir, 'future.json'), toJson({ ...toProfileJson('From the future', fresh()), version: 2 }));
    writeFileSync(join(dir, 'My Colours.json'), toJson(toProfileJson('My colours', fresh())));
    writeFileSync(join(dir, 'notes.txt'), 'notes');
    writeFileSync(join(dir, '.hidden.json'), toJson(toProfileJson('Hidden', fresh())));
    mkdirSync(join(dir, 'folder.json'));
    writeFileSync(join(dir, 'good.json'), toJson(toProfileJson('Good', fresh())));
    if (posix) {
      writeFileSync(join(tmp, 'outside.json'), toJson(toProfileJson('Outside', fresh())));
      symlinkSync(join(tmp, 'outside.json'), join(dir, 'linked.json'));
    }
    const list = await listProfiles(dir);
    expect(list.profiles.map((p) => p.name)).toEqual(['Good']);
    expect(list.problems.map((p) => p.file)).toEqual(['broken.json', 'future.json', 'My Colours.json', 'project.json']);
    const why = Object.fromEntries(list.problems.map((p) => [p.file, p.error]));
    expect(why['broken.json']).toMatch(/^"broken\.json": it is not JSON/);
    expect(why['future.json']).toBe('"future.json": it is version 2, and this Shamble VFX reads version 1: update Shamble VFX to use it');
    expect(why['project.json']).toBe('"project.json": it is not a palette profile (it needs "format": "shamble-vfx-palette-profile")');
    expect(why['My Colours.json']).toMatch(/is not a palette profile file name: the editor names them itself/);
    // A file of a newer version holds its name all the same: it is taken.
    expect((await refusal(createProfile(dir, 'from the FUTURE', fresh())))).toEqual({ status: 409, message: 'There is already a palette profile named "From the future": pick another name.' });
  });

  it.each(BROKEN)('names a profile file whose colours have %s, and everything else still works, deleting it too', async (_, edit, first) => {
    const dir = folder();
    await listProfiles(dir); // made, with the two defaults
    writeFileSync(join(dir, 'odd.json'), toJson(toProfileJson('Odd', brokenCopy(edit))));
    const list = await listProfiles(dir);
    expect(list.profiles.map((p) => p.name)).toEqual(['Built-in', 'Built-in with gradients']);
    expect(list.problems).toHaveLength(1);
    expect(list.problems[0]!.file).toBe('odd.json');
    expect(list.problems[0]!.error.startsWith(`"odd.json": its colours: ${first}`)).toBe(true);
    // The others can be read, made, saved, renamed and restored; an import's colours still become a profile.
    expect((await readProfile(dir, 'built-in')).name).toBe('Built-in');
    const odd = await refusal(readProfile(dir, 'odd'));
    expect(odd.status).toBe(422);
    expect(odd.message).toMatch(/^"odd\.json": its colours: .*\. Fix it in a text editor, or delete it$/);
    expect((await createProfile(dir, 'New one', fresh())).id).toBe('new-one');
    expect((await saveProfile(dir, 'new-one', coloursWith('#000009'))).name).toBe('New one');
    expect((await renameProfile(dir, 'new-one', 'Newer one')).id).toBe('newer-one');
    expect((await restoreDefaultProfiles(dir)).added).toEqual([]);
    expect(await addImportedProfile(dir, 'Comic hits', fresh())).toEqual({ id: 'comic-hits', name: 'Comic hits', added: true });
    // The odd file keeps its name: it is taken.
    expect((await refusal(createProfile(dir, 'ODD', fresh()))).status).toBe(409);
    await deleteProfile(dir, 'odd');
    expect(existsSync(join(dir, 'odd.json'))).toBe(false);
    expect((await refusal(deleteProfile(dir, 'odd'))).status).toBe(404);
    expect((await listProfiles(dir)).problems).toEqual([]);
  });
});

describe('making, reading, saving, renaming and deleting', () => {
  it('makes a profile under a safe file name of its own, with a number when that is taken', async () => {
    const dir = folder();
    expect(await createProfile(dir, '  Soviets dark ', fresh())).toMatchObject({ id: 'soviets-dark', name: 'Soviets dark', gradientCount: 0 });
    expect((await createProfile(dir, 'Soviets dark!', fresh())).id).toBe('soviets-dark-2');
    expect((await createProfile(dir, 'Soviets: dark?', fresh())).id).toBe('soviets-dark-3');
    // A name with no Latin letters or digits: "profile", numbered.
    expect((await createProfile(dir, String.fromCharCode(0x0421, 0x0421, 0x0421, 0x0420), fresh())).id).toBe('profile');
    expect((await createProfile(dir, '***', fresh())).id).toBe('profile-2');
    expect(JSON.parse(readFileSync(join(dir, 'soviets-dark-2.json'), 'utf8')).name).toBe('Soviets dark!');
  });

  it('never uses a name as a path: everything stays inside the folder', async () => {
    const dir = folder();
    const made = await createProfile(dir, '../../escape', fresh());
    expect(made.id).toBe('escape');
    expect(existsSync(join(dir, 'escape.json'))).toBe(true);
    expect(existsSync(join(tmp, 'escape.json'))).toBe(false);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses a taken name (409, without regard to case), a bad name and colours that are not a palette (400), in plain words', async () => {
    const dir = folder();
    await createProfile(dir, 'Soviets dark', fresh());
    expect(await refusal(createProfile(dir, 'SOVIETS DARK', fresh()))).toEqual({ status: 409, message: 'There is already a palette profile named "Soviets dark": pick another name.' });
    expect(await refusal(createProfile(dir, 'built-in', fresh()))).toMatchObject({ status: 409 });
    expect(await refusal(createProfile(dir, `a${String.fromCharCode(10)}b`, fresh()))).toEqual({ status: 400, message: 'A palette profile name needs 1 to 64 characters, with no tabs or line breaks.' });
    expect(await refusal(createProfile(dir, 'x'.repeat(65), fresh()))).toMatchObject({ status: 400 });
    const bad = fresh();
    bad.roles.ink = { hex: 'black', from: 'mustafa' };
    expect(await refusal(createProfile(dir, 'Bad', bad))).toEqual({ status: 400, message: 'These colours cannot be kept as a palette profile: ink: "black" is not a #RRGGBB colour' });
    expect(await refusal(createProfile(dir, 'Nothing', undefined))).toMatchObject({ status: 400, message: /not a palette/ });
    expect(readdirSync(dir).sort()).toEqual(['built-in-with-gradients.json', 'built-in.json', 'soviets-dark.json']);
  });

  it.each(BROKEN)('refuses colours with %s (400, in plain words), to make or to save, and writes nothing', async (_, edit, first) => {
    const dir = folder();
    await createProfile(dir, 'Soviets dark', fresh());
    const before = readFileSync(join(dir, 'soviets-dark.json'), 'utf8');
    const made = await refusal(createProfile(dir, 'Odd', brokenCopy(edit)));
    expect(made.status).toBe(400);
    expect(made.message.startsWith(`These colours cannot be kept as a palette profile: ${first}`)).toBe(true);
    const saved = await refusal(saveProfile(dir, 'soviets-dark', brokenCopy(edit)));
    expect(saved).toEqual(made);
    expect(readdirSync(dir).sort()).toEqual(['built-in-with-gradients.json', 'built-in.json', 'soviets-dark.json']);
    expect(readFileSync(join(dir, 'soviets-dark.json'), 'utf8')).toBe(before);
    expect((await refusal(addImportedProfile(dir, 'Imported', brokenCopy(edit)))).status).toBe(400);
  });

  it('keeps an older palette as version 2', async () => {
    const dir = folder();
    const old = fresh() as unknown as Record<string, unknown>;
    old.version = 1;
    delete old.gradients;
    await createProfile(dir, 'Old colours', old);
    const p = await readProfile(dir, 'old-colours');
    expect(p.palette.version).toBe(2);
    expect(p.palette.gradients).toEqual({});
  });

  it('reads a profile by its id, and says plainly why it cannot', async () => {
    const dir = folder();
    await createProfile(dir, 'Soviets dark', coloursWith('#000001'));
    const p = await readProfile(dir, 'soviets-dark');
    expect(p).toMatchObject({ id: 'soviets-dark', name: 'Soviets dark' });
    expect(p.palette.roles['heat.1']!.hex).toBe('#000001');
    expect(await refusal(readProfile(dir, 'nothing-here'))).toEqual({ status: 404, message: 'There is no palette profile "nothing-here" (it may have been renamed or deleted: list the profiles again)' });
    for (const bad of ['../built-in', 'Built-in', '', '.hidden', 'a/b', 'built-in.json']) expect((await refusal(readProfile(dir, bad))).status, bad).toBe(400);
    writeFileSync(join(dir, 'broken.json'), '{');
    expect(await refusal(readProfile(dir, 'broken'))).toMatchObject({ status: 422, message: /^"broken\.json": it is not JSON .*Fix it in a text editor, or delete it$/ });
    writeFileSync(join(dir, 'future.json'), toJson({ ...toProfileJson('Future', fresh()), version: 2 }));
    expect(await refusal(readProfile(dir, 'future'))).toMatchObject({ status: 409 });
  });

  it('saves colours over a profile: its name and id stay; bad colours change nothing; a newer file is left as it is', async () => {
    const dir = folder();
    await createProfile(dir, 'Soviets dark', fresh());
    const saved = await saveProfile(dir, 'soviets-dark', coloursWith('#000002'));
    expect(saved).toMatchObject({ id: 'soviets-dark', name: 'Soviets dark' });
    expect((await readProfile(dir, 'soviets-dark')).palette.roles['heat.1']!.hex).toBe('#000002');
    const before = readFileSync(join(dir, 'soviets-dark.json'), 'utf8');
    expect((await refusal(saveProfile(dir, 'soviets-dark', { version: 2 }))).status).toBe(400);
    expect(readFileSync(join(dir, 'soviets-dark.json'), 'utf8')).toBe(before);
    const future = toJson({ ...toProfileJson('Future', fresh()), version: 2 });
    writeFileSync(join(dir, 'future.json'), future);
    expect(await refusal(saveProfile(dir, 'future', fresh()))).toEqual({ status: 409, message: '"future.json": it is version 2, and this Shamble VFX reads version 1: update Shamble VFX to use it. It is left as it is' });
    expect(readFileSync(join(dir, 'future.json'), 'utf8')).toBe(future);
    expect((await refusal(saveProfile(dir, 'gone', fresh()))).status).toBe(404);
  });

  it('renames a profile: refused when taken, its own name in other letters is fine, and its file follows the name', async () => {
    const dir = folder();
    await createProfile(dir, 'Soviets dark', coloursWith('#000003'));
    await createProfile(dir, 'Allies light', fresh());
    expect(await refusal(renameProfile(dir, 'soviets-dark', 'allies LIGHT'))).toEqual({ status: 409, message: 'There is already a palette profile named "Allies light": pick another name.' });
    expect((await refusal(renameProfile(dir, 'soviets-dark', ''))).status).toBe(400);
    // Its own name in other letters: the same file.
    expect(await renameProfile(dir, 'soviets-dark', 'SOVIETS dark')).toMatchObject({ id: 'soviets-dark', name: 'SOVIETS dark' });
    // Another name: a file named after it, and the id it ends with.
    const moved = await renameProfile(dir, 'soviets-dark', 'Night red');
    expect(moved).toMatchObject({ id: 'night-red', name: 'Night red' });
    expect(existsSync(join(dir, 'soviets-dark.json'))).toBe(false);
    const p = await readProfile(dir, 'night-red');
    expect(p.name).toBe('Night red');
    expect(p.palette.roles['heat.1']!.hex).toBe('#000003');
    // Back to a name whose file name is taken by another profile: a number.
    writeFileSync(join(dir, 'soviets-dark.json'), toJson(toProfileJson('Soviets-dark!', fresh())));
    expect((await renameProfile(dir, 'night-red', 'Soviets dark')).id).toBe('soviets-dark-2');
  });

  it('deletes a profile, a file it cannot read too', async () => {
    const dir = folder();
    await createProfile(dir, 'Soviets dark', fresh());
    await deleteProfile(dir, 'soviets-dark');
    expect(existsSync(join(dir, 'soviets-dark.json'))).toBe(false);
    expect((await refusal(deleteProfile(dir, 'soviets-dark'))).status).toBe(404);
    writeFileSync(join(dir, 'broken.json'), '{');
    await deleteProfile(dir, 'broken');
    expect(existsSync(join(dir, 'broken.json'))).toBe(false);
  });

  it('makes one change at a time: the same name asked for ten times at once is made once', async () => {
    const dir = folder();
    const tries = await Promise.allSettled(Array.from({ length: 10 }, () => createProfile(dir, 'Soviets dark', fresh())));
    expect(tries.filter((t) => t.status === 'fulfilled')).toHaveLength(1);
    expect(tries.filter((t) => t.status === 'rejected').map((t) => (t as PromiseRejectedResult).reason.status)).toEqual(Array(9).fill(409));
    const ids = await Promise.all(Array.from({ length: 6 }, (_, i) => createProfile(dir, `Allies${'!'.repeat(i + 1)}`, fresh())));
    expect(new Set(ids.map((x) => x.id)).size).toBe(6);
    expect((await listProfiles(dir)).profiles).toHaveLength(2 + 1 + 6);
  });
});

describe('an import\'s colours', () => {
  it('make a fresh folder (with the defaults), then become a profile; the very same colours are found again, other colours numbered', async () => {
    const dir = folder();
    expect(await addImportedProfile(dir, 'Comic hits', fresh())).toEqual({ id: 'comic-hits', name: 'Comic hits', added: true });
    expect(readdirSync(dir).sort()).toEqual(['built-in-with-gradients.json', 'built-in.json', 'comic-hits.json']);
    expect(await addImportedProfile(dir, 'COMIC HITS', fresh())).toEqual({ id: 'comic-hits', name: 'Comic hits', added: false });
    expect(await addImportedProfile(dir, 'Comic hits', coloursWith('#000004'))).toEqual({ id: 'comic-hits-1', name: 'Comic hits (1)', added: true });
    expect(await addImportedProfile(dir, 'Comic hits (1)', coloursWith('#000005'))).toEqual({ id: 'comic-hits-2', name: 'Comic hits (2)', added: true });
    expect(await addImportedProfile(dir, 'Comic hits (7)', coloursWith('#000004'))).toEqual({ id: 'comic-hits-1', name: 'Comic hits (1)', added: false });
    expect((await readProfile(dir, 'comic-hits-2')).palette.roles['heat.1']!.hex).toBe('#000005');
    expect((await refusal(addImportedProfile(dir, 'Broken', { version: 2 }))).status).toBe(400);
  });
});

describe('through the local server, and the editor\'s store', () => {
  let server: Server;
  let base: string;
  let dir: string;
  let store: DevServerStore;
  beforeAll(async () => {
    dir = folder();
    const handler = createProjectFilesHandler({ roots: [], palettesDir: dir, loadProfiles: () => import('../server/palette-profiles') });
    server = await new Promise<Server>((done) => { const s = createServer((q, r) => void handler(q, r)); s.listen(0, '127.0.0.1', () => done(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__vfx/api`;
    store = new DevServerStore(base);
  });
  afterAll(() => { server?.close(); });

  const call = (method: string, route: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/${route}`, { method, headers: { 'X-Shamble-VFX': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

  it('answers every route, with plain errors and their statuses', async () => {
    const list = await call('GET', 'profiles');
    expect(list.status).toBe(200);
    expect(((await list.json()) as { profiles: { name: string }[] }).profiles.map((p) => p.name)).toEqual(['Built-in', 'Built-in with gradients']);
    const made = await call('POST', 'profiles', { name: 'Soviets dark', palette: fresh() });
    expect(made.status).toBe(201);
    expect(await made.json()).toMatchObject({ id: 'soviets-dark', name: 'Soviets dark' });
    const taken = await call('POST', 'profiles', { name: 'soviets dark', palette: fresh() });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'There is already a palette profile named "Soviets dark": pick another name.' });
    expect((await call('POST', 'profiles', { palette: fresh() })).status).toBe(400);
    const one = await call('GET', `profile?id=soviets-dark`);
    expect(((await one.json()) as { palette: Palette }).palette).toEqual(builtIn);
    expect((await call('PUT', 'profile?id=soviets-dark', { palette: coloursWith('#000006') })).status).toBe(200);
    const renamed = await call('PATCH', 'profile?id=soviets-dark', { name: 'Night red' });
    expect(await renamed.json()).toMatchObject({ id: 'night-red', name: 'Night red' });
    expect((await call('GET', 'profile?id=..%2Fbuilt-in')).status).toBe(400);
    expect((await call('GET', 'profile?id=soviets-dark')).status).toBe(404);
    expect((await call('GET', 'profile')).status).toBe(400);
    expect((await call('DELETE', 'profile?id=night-red')).status).toBe(200);
    expect((await call('DELETE', 'profile?id=built-in')).status).toBe(200);
    const restored = await call('POST', 'profiles/defaults');
    expect(await restored.json()).toMatchObject({ added: ['Built-in'] });
    expect((await call('POST', 'profile?id=built-in')).status).toBe(405);
    expect((await call('PUT', 'profiles')).status).toBe(405);
    expect((await call('POST', 'profiles', { name: 'x', palette: fresh() }, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await fetch(`${base}/profiles`)).status).toBe(403);
  });

  it('a profile file, or colours sent, with a part missing or empty: plain words, and every route still answers', async () => {
    for (const [what, edit, first] of BROKEN) {
      writeFileSync(join(dir, 'odd.json'), toJson(toProfileJson('Odd', brokenCopy(edit))));
      const list = await call('GET', 'profiles');
      expect(list.status, what).toBe(200);
      const body = (await list.json()) as { profiles: { name: string }[]; problems: { file: string; error: string }[] };
      expect(body.profiles.map((p) => p.name)).toContain('Built-in');
      expect(body.problems.map((p) => p.file)).toEqual(['odd.json']);
      expect((await call('GET', 'profile?id=built-in')).status).toBe(200);
      const made = await call('POST', 'profiles', { name: 'Odd colours', palette: brokenCopy(edit) });
      expect(made.status, what).toBe(400);
      expect(((await made.json()) as { error: string }).error.startsWith(`These colours cannot be kept as a palette profile: ${first}`)).toBe(true);
      expect((await call('PUT', 'profile?id=built-in', { palette: brokenCopy(edit) })).status, what).toBe(400);
      expect((await call('POST', 'profiles/defaults')).status).toBe(200);
      expect((await call('DELETE', 'profile?id=odd')).status, what).toBe(200);
      expect((await call('DELETE', 'profile?id=odd')).status).toBe(404);
    }
  });

  it('the store lists, makes, reads, saves over, renames, deletes and restores, and a taken name fails with 409', async () => {
    const before = await store.listProfiles();
    expect(before.profiles.map((p) => p.name)).toEqual(['Built-in', 'Built-in with gradients']);
    const made = await store.createProfile('Allies light', coloursWith('#000007'));
    expect(made).toMatchObject({ id: 'allies-light', name: 'Allies light', swatches: profileSwatches(coloursWith('#000007')) });
    expect(await refusal(store.createProfile('ALLIES LIGHT', fresh()))).toEqual({ status: 409, message: 'There is already a palette profile named "Allies light": pick another name.' });
    expect((await store.readProfile('allies-light')).palette.roles['heat.1']!.hex).toBe('#000007');
    await store.saveProfile('allies-light', coloursWith('#000008'));
    expect((await store.readProfile('allies-light')).palette.roles['heat.1']!.hex).toBe('#000008');
    expect(await refusal(store.renameProfile('allies-light', 'built-in'))).toMatchObject({ status: 409 });
    expect(await store.renameProfile('allies-light', 'Allies dawn')).toMatchObject({ id: 'allies-dawn', name: 'Allies dawn' });
    await store.deleteProfile('allies-dawn');
    expect(await refusal(store.readProfile('allies-dawn'))).toMatchObject({ status: 404 });
    await store.deleteProfile('built-in-with-gradients');
    const restored = await store.restoreDefaultProfiles();
    expect(restored.added).toEqual(['Built-in with gradients']);
    expect(restored.profiles.map((p) => p.name)).toEqual(['Built-in', 'Built-in with gradients']);
  });
});
