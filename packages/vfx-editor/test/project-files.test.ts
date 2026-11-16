import { cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer as createViteServer } from 'vite';
import { createProjectFilesHandler, isProjectPath, projectFiles, slugify } from '../server/project-files';
import type { ProjectRoot } from '../server/project-files';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake image data')]);
const posix = process.platform !== 'win32';

let tmp: string;
let roots: ProjectRoot[];
let server: Server;
let port: number;

interface Reply { status: number; type: string; body: Buffer; json: () => any }

function call(method: string, route: string, opts: { headers?: Record<string, string | undefined>; body?: Buffer | string; to?: number } = {}): Promise<Reply> {
  const p = opts.to ?? port;
  const headers: Record<string, string> = {};
  const merged: Record<string, string | undefined> = { host: `127.0.0.1:${p}`, 'x-shamble-vfx': '1', ...opts.headers };
  for (const [k, v] of Object.entries(merged)) if (v !== undefined) headers[k] = v;
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: p, method, path: `/__vfx/api/${route}`, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body, json: () => JSON.parse(body.toString('utf8')) });
      });
    });
    req.on('error', reject);
    if (opts.body !== undefined) req.end(opts.body);
    else req.end();
  });
}

const json = (v: unknown) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });
const q = (id: string, path?: string) => new URLSearchParams(path === undefined ? { id } : { id, path }).toString();

function listen(handler: ReturnType<typeof createProjectFilesHandler>): Promise<Server> {
  return new Promise((resolve) => {
    const s = createServer((req, res) => void handler(req, res));
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'shamble-vfx-files-'));
  // A read-only example project, with things the API must ignore.
  const demo = join(tmp, 'examples', 'demo');
  mkdirSync(join(demo, 'effects', 'nested'), { recursive: true });
  mkdirSync(join(demo, 'images'), { recursive: true });
  writeFileSync(join(demo, 'project.json'), JSON.stringify({ format: 'shamble-vfx-project', version: 1, name: 'Demo project' }));
  writeFileSync(join(demo, 'effects', 'shot.vfx.json'), '{"id":"shot"}');
  writeFileSync(join(demo, 'effects', 'notes.txt'), 'not an effect');
  writeFileSync(join(demo, 'images', 'flash.png'), PNG);
  writeFileSync(join(demo, 'images', 'photo.jpg'), 'not a png');
  mkdirSync(join(tmp, 'examples', 'not-a-project'));
  // Things outside every root, for the escape tests.
  mkdirSync(join(tmp, 'outside', 'proj'), { recursive: true });
  writeFileSync(join(tmp, 'outside', 'secret.png'), PNG);
  writeFileSync(join(tmp, 'outside', 'proj', 'project.json'), JSON.stringify({ format: 'shamble-vfx-project', version: 1, name: 'Outside' }));
  roots = [
    { id: 'examples', label: 'Examples (read-only)', dir: join(tmp, 'examples'), writable: false },
    { id: 'projects', label: 'My projects', dir: join(tmp, 'projects'), writable: true }, // made on first use
  ];
  server = await listen(createProjectFilesHandler({ roots }));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server?.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('who may call', () => {
  it('needs the editor header', async () => {
    const r = await call('GET', 'projects', { headers: { 'x-shamble-vfx': undefined } });
    expect(r.status).toBe(403);
    expect(r.json().error).toMatch(/did not come from the Shamble VFX editor/);
  });
  it('needs this server by its local name and port', async () => {
    expect((await call('GET', 'projects', { headers: { host: `evil.example:${port}` } })).status).toBe(403);
    expect((await call('GET', 'projects', { headers: { host: '127.0.0.1:1' } })).status).toBe(403);
    expect((await call('GET', 'projects', { headers: { host: `localhost:${port}` } })).status).toBe(200);
  });
  it('refuses requests from other web pages', async () => {
    const r = await call('GET', 'projects', { headers: { origin: 'http://evil.example' } });
    expect(r.status).toBe(403);
    expect(r.json().error).toMatch(/another web page/);
    expect((await call('GET', 'projects', { headers: { origin: `http://127.0.0.1:${port}` } })).status).toBe(200);
    expect((await call('GET', 'projects', { headers: { host: `localhost:${port}`, origin: `http://localhost:${port}` } })).status).toBe(200);
  });
});

describe('projects', () => {
  it('lists the roots and the project folders (only folders with project.json)', async () => {
    const r = await call('GET', 'projects');
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({
      roots: [
        { id: 'examples', label: 'Examples (read-only)', writable: false },
        { id: 'projects', label: 'My projects', writable: true },
      ],
      projects: [{ id: 'examples/demo', name: 'Demo project', root: 'examples', writable: false }],
    });
  });

  it('makes a new project in a writable root, and makes the root on first use', async () => {
    const r = await call('POST', 'projects', json({ root: 'projects', name: 'My First FX' }));
    expect(r.status).toBe(201);
    expect(r.json()).toEqual({ id: 'projects/my-first-fx', name: 'My First FX', root: 'projects', writable: true });
    const dir = join(tmp, 'projects', 'my-first-fx');
    expect(readFileSync(join(dir, 'project.json'), 'utf8')).toBe(`${JSON.stringify({ format: 'shamble-vfx-project', version: 2, name: 'My First FX' }, null, 2)}\n`);
    expect(existsSync(join(dir, 'effects'))).toBe(true);
    expect(existsSync(join(dir, 'images'))).toBe(true);
  });

  it('refuses a name that is taken, a read-only root, an unknown root and a name without letters', async () => {
    expect((await call('POST', 'projects', json({ root: 'projects', name: 'my first fx' }))).status).toBe(409);
    expect((await call('POST', 'projects', json({ root: 'examples', name: 'Sneaky' }))).status).toBe(403);
    expect((await call('POST', 'projects', json({ root: 'nowhere', name: 'X' }))).status).toBe(404);
    expect((await call('POST', 'projects', json({ root: 'projects', name: '!!!' }))).status).toBe(400);
    expect((await call('POST', 'projects', { body: JSON.stringify({ root: 'projects', name: 'Y' }), headers: { 'content-type': 'text/plain' } })).status).toBe(415);
  });

  it('tells what a project holds, ignoring files that are not effects or PNGs', async () => {
    const r = await call('GET', `project?${q('examples/demo')}`);
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ id: 'examples/demo', name: 'Demo project', writable: false, palette: false, effects: ['shot.vfx.json'], images: [{ name: 'flash.png', bytes: PNG.length }] });
    expect((await call('GET', `project?${q('examples/not-a-project')}`)).status).toBe(404);
  });

  it('copies a project into a writable root ("Save as"), files and new name only', async () => {
    const r = await call('POST', 'copy', json({ from: 'examples/demo', root: 'projects', name: 'Demo copy' }));
    expect(r.status).toBe(201);
    expect(r.json().id).toBe('projects/demo-copy');
    const c = await call('GET', `project?${q('projects/demo-copy')}`);
    expect(c.json()).toEqual({ id: 'projects/demo-copy', name: 'Demo copy', writable: true, palette: false, effects: ['shot.vfx.json'], images: [{ name: 'flash.png', bytes: PNG.length }] });
    expect(existsSync(join(tmp, 'projects', 'demo-copy', 'effects', 'notes.txt'))).toBe(false);
    expect(existsSync(join(tmp, 'projects', 'demo-copy', 'images', 'photo.jpg'))).toBe(false);
    // The copy's project.json is fresh, version 2, with its own name (the editor then writes the rest into it).
    expect(JSON.parse(readFileSync(join(tmp, 'projects', 'demo-copy', 'project.json'), 'utf8'))).toEqual({ format: 'shamble-vfx-project', version: 2, name: 'Demo copy' });
    expect((await call('POST', 'copy', json({ from: 'examples/demo', root: 'projects', name: 'Demo copy' }))).status).toBe(409);
    expect((await call('POST', 'copy', json({ from: 'examples/demo', root: 'examples', name: 'Again' }))).status).toBe(403);
  });
});

describe('the project palette', () => {
  const palette = JSON.stringify({ version: 1, factions: {}, roles: {} });
  it('writes palette.json when it is a palette, and refuses anything else under that name', async () => {
    await call('POST', 'projects', json({ root: 'projects', name: 'With colours' }));
    const put = (body: string) => call('PUT', `file?${q('projects/with-colours', 'palette.json')}`, { headers: { 'content-type': 'application/json' }, body });
    expect((await put(palette)).status).toBe(200);
    expect((await call('GET', `project?${q('projects/with-colours')}`)).json().palette).toBe(true);
    expect((await put('{"hello":1}')).status).toBe(400);
    expect((await put('[1,2]')).status).toBe(400);
  });
  it('copies palette.json on Save as', async () => {
    const r = await call('POST', 'copy', json({ from: 'projects/with-colours', root: 'projects', name: 'Colours copy' }));
    expect(r.status).toBe(201);
    expect(readFileSync(join(tmp, 'projects', 'colours-copy', 'palette.json'), 'utf8')).toBe(palette);
  });
});

describe('files', () => {
  const id = 'projects/my-first-fx';

  it('writes and reads back an effect file', async () => {
    const text = JSON.stringify({ format: 'shamble-vfx', id: 'boom' }, null, 2) + '\n';
    const w = await call('PUT', `file?${q(id, 'effects/boom.vfx.json')}`, { body: text, headers: { 'content-type': 'application/json' } });
    expect(w.status).toBe(200);
    const r = await call('GET', `file?${q(id, 'effects/boom.vfx.json')}`);
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/application\/json/);
    expect(r.body.toString('utf8')).toBe(text);
  });

  it('writes and reads back a PNG, byte for byte', async () => {
    const w = await call('PUT', `file?${q(id, 'images/dot.png')}`, { body: PNG, headers: { 'content-type': 'image/png' } });
    expect(w.status).toBe(200);
    const r = await call('GET', `file?${q(id, 'images/dot.png')}`);
    expect(r.type).toBe('image/png');
    expect(r.body.equals(PNG)).toBe(true);
  });

  it('refuses broken JSON, a fake PNG, a bad project.json and the wrong content type', async () => {
    expect((await call('PUT', `file?${q(id, 'effects/bad.vfx.json')}`, { body: '{nope', headers: { 'content-type': 'application/json' } })).status).toBe(400);
    const fake = await call('PUT', `file?${q(id, 'images/fake.png')}`, { body: 'GIF89a...', headers: { 'content-type': 'image/png' } });
    expect(fake.status).toBe(400);
    expect(fake.json().error).toMatch(/not a PNG/);
    expect((await call('PUT', `file?${q(id, 'project.json')}`, { body: '{"name":"x"}', headers: { 'content-type': 'application/json' } })).status).toBe(400);
    expect((await call('PUT', `file?${q(id, 'images/dot.png')}`, { body: PNG, headers: { 'content-type': 'application/json' } })).status).toBe(415);
    expect(existsSync(join(tmp, 'projects', 'my-first-fx', 'images', 'fake.png'))).toBe(false);
  });

  it('lets project.json be rewritten when it stays a project file', async () => {
    const body = JSON.stringify({ format: 'shamble-vfx-project', version: 1, name: 'Renamed' });
    expect((await call('PUT', `file?${q(id, 'project.json')}`, { body, headers: { 'content-type': 'application/json' } })).status).toBe(200);
    expect((await call('GET', `project?${q(id)}`)).json().name).toBe('Renamed');
  });

  it('takes project.json version 2 with any parts the reader knows, and refuses a newer version or one that is not a number', async () => {
    const put = (v: unknown) => call('PUT', `file?${q(id, 'project.json')}`, { body: JSON.stringify(v), headers: { 'content-type': 'application/json' } });
    const v2 = { format: 'shamble-vfx-project', version: 2, name: 'Renamed', paletteProfile: 'Soviets dark', budgets: { project: { on: true, limits: { high: { triangles: 5000 } } } } };
    expect((await put(v2)).status).toBe(200);
    const newer = await put({ ...v2, version: 3 });
    expect(newer.status).toBe(400);
    expect(newer.json().error).toBe('project.json is version 3, and this Shamble VFX reads version 2 and older: update Shamble VFX to open this project');
    expect((await put({ ...v2, version: '2' })).status).toBe(400);
    // The refused files were not written: the version 2 one is still there.
    expect(JSON.parse(readFileSync(join(tmp, 'projects', 'my-first-fx', 'project.json'), 'utf8'))).toEqual(v2);
  });

  it('lists a project whose project.json is a newer version, by its name (the editor says why it cannot open it)', async () => {
    const dir = join(tmp, 'projects', 'from-the-future');
    mkdirSync(join(dir, 'effects'), { recursive: true });
    writeFileSync(join(dir, 'project.json'), JSON.stringify({ format: 'shamble-vfx-project', version: 3, name: 'From the future' }));
    const listed = (await call('GET', 'projects')).json().projects as { id: string; name: string }[];
    expect(listed.find((p) => p.id === 'projects/from-the-future')?.name).toBe('From the future');
    expect((await call('GET', `project?${q('projects/from-the-future')}`)).json().name).toBe('From the future');
  });

  it('deletes effects and images, never project.json', async () => {
    expect((await call('DELETE', `file?${q(id, 'images/dot.png')}`)).status).toBe(200);
    expect((await call('GET', `file?${q(id, 'images/dot.png')}`)).status).toBe(404);
    expect((await call('DELETE', `file?${q(id, 'images/dot.png')}`)).status).toBe(404);
    expect((await call('DELETE', `file?${q(id, 'project.json')}`)).status).toBe(400);
  });

  it('keeps examples read-only, but readable', async () => {
    expect((await call('GET', `file?${q('examples/demo', 'effects/shot.vfx.json')}`)).status).toBe(200);
    const w = await call('PUT', `file?${q('examples/demo', 'effects/shot.vfx.json')}`, { body: '{}', headers: { 'content-type': 'application/json' } });
    expect(w.status).toBe(403);
    expect(w.json().error).toMatch(/read-only/);
    expect((await call('DELETE', `file?${q('examples/demo', 'images/flash.png')}`)).status).toBe(403);
    expect(readFileSync(join(tmp, 'examples', 'demo', 'effects', 'shot.vfx.json'), 'utf8')).toBe('{"id":"shot"}');
  });

  it('refuses every path that is not one of the three allowed forms', async () => {
    const bad = ['../project.json', '/etc/passwd', 'effects/../../x.vfx.json', 'effects/sub/x.vfx.json', 'images/x.jpg', 'effects\\x.vfx.json', 'effects/x.json', 'project.json/..', 'images/.hidden.png', 'images/..png'];
    for (const p of bad) {
      const r = await call('GET', `file?${q('examples/demo', p)}`);
      expect(r.status, p).toBe(400);
    }
    // Percent-encoded dots arrive decoded and are refused the same way.
    expect((await call('GET', 'file?id=examples%2Fdemo&path=%2e%2e%2fproject.json')).status).toBe(400);
    expect((await call('GET', 'file?id=examples%2Fdemo&path=effects%2F%2e%2e%2f%2e%2e%2fsecret.vfx.json')).status).toBe(400);
  });

  it('refuses project ids that leave their root', async () => {
    for (const bad of ['../..', 'examples/../projects', 'examples/demo/../..', 'examples', '/tmp', 'examples/.']) {
      const r = await call('GET', `project?${q(bad)}`);
      expect([400, 404], bad).toContain(r.status);
    }
    expect((await call('GET', `project?${q('nowhere/demo')}`)).status).toBe(404);
  });

  it.skipIf(!posix)('never follows a symbolic link out of a project', async () => {
    const dir = join(tmp, 'projects', 'my-first-fx');
    symlinkSync(join(tmp, 'outside', 'secret.png'), join(dir, 'images', 'leak.png'));
    expect((await call('GET', `file?${q(id, 'images/leak.png')}`)).status).toBe(403);
    // A project folder that is a link to somewhere outside its root.
    symlinkSync(join(tmp, 'outside', 'proj'), join(tmp, 'projects', 'linked'));
    expect((await call('GET', `project?${q('projects/linked')}`)).status).toBe(403);
    expect((await call('GET', 'projects')).json().projects.map((p: { id: string }) => p.id)).not.toContain('projects/linked');
    // An effects folder that is a link to outside: writing through it is refused and nothing lands outside.
    const other = join(tmp, 'projects', 'other');
    mkdirSync(join(other, 'images'), { recursive: true });
    writeFileSync(join(other, 'project.json'), JSON.stringify({ format: 'shamble-vfx-project', version: 1, name: 'Other' }));
    symlinkSync(join(tmp, 'outside'), join(other, 'effects'));
    const w = await call('PUT', `file?${q('projects/other', 'effects/planted.vfx.json')}`, { body: '{}', headers: { 'content-type': 'application/json' } });
    expect(w.status).toBe(403);
    expect(existsSync(join(tmp, 'outside', 'planted.vfx.json'))).toBe(false);
    // Deleting a link removes the link, not what it points to.
    expect((await call('DELETE', `file?${q(id, 'images/leak.png')}`)).status).toBe(200);
    expect(existsSync(join(tmp, 'outside', 'secret.png'))).toBe(true);
  });

  it('refuses bodies over the size limit', async () => {
    const small = await listen(createProjectFilesHandler({ roots, maxBodyBytes: 1024 }));
    const p = (small.address() as AddressInfo).port;
    const big = Buffer.concat([PNG, Buffer.alloc(4096)]);
    const r = await call('PUT', `file?${q(id, 'images/big.png')}`, { body: big, to: p, headers: { host: `127.0.0.1:${p}`, 'content-type': 'image/png' } });
    small.close();
    expect(r.status).toBe(413);
    expect(existsSync(join(tmp, 'projects', 'my-first-fx', 'images', 'big.png'))).toBe(false);
  });

  it('answers unknown routes and methods plainly', async () => {
    expect((await call('GET', 'nothing')).status).toBe(404);
    expect((await call('DELETE', 'projects')).status).toBe(405);
    expect((await call('POST', `file?${q(id, 'images/x.png')}`)).status).toBe(405);
    expect((await call('DELETE', 'profiles')).status).toBe(405);
    expect((await call('GET', 'profiles/defaults')).status).toBe(405);
  });

  it('has no palettes folder when it was given its own roots and none, so palette profiles and import say so (the real folder is never touched)', async () => {
    const list = await call('GET', 'profiles');
    expect(list.status).toBe(501);
    expect(list.json().error).toBe('Palette profiles are not set up on this server (it has no palettes folder)');
    expect((await call('GET', `profile?${q('built-in')}`)).status).toBe(501);
    const im = await call('POST', 'import', json({ export: 'hits', root: 'projects', name: 'Never made' }));
    expect(im.status).toBe(501);
    expect(im.json().error).toMatch(/no palettes folder/);
    expect(existsSync(join(tmp, 'projects', 'never-made'))).toBe(false);
  });
});

describe('helpers', () => {
  it('turns names into safe folder names', () => {
    expect(slugify('My First FX')).toBe('my-first-fx');
    expect(slugify("Mustafa's Big Boom!")).toBe('mustafa-s-big-boom');
    expect(slugify('Ärger über Öl')).toBe('arger-uber-ol');
    expect(slugify('***')).toBe('');
  });
  it('knows the allowed file paths', () => {
    expect(isProjectPath('project.json')).toBe(true);
    expect(isProjectPath('effects/rifle_shot.vfx.json')).toBe(true);
    expect(isProjectPath('images/Muzzle Flash 2.png')).toBe(true);
    expect(isProjectPath('images/../x.png')).toBe(false);
    expect(isProjectPath('effects/a/b.vfx.json')).toBe(false);
  });
});

describe('inside Vite', () => {
  it('serves the API from the dev server and passes other requests on', async () => {
    const vite = await createViteServer({ configFile: false, root: tmp, logLevel: 'silent', plugins: [projectFiles({ roots })], server: { host: '127.0.0.1', port: 0 } });
    await vite.listen();
    const p = (vite.httpServer!.address() as AddressInfo).port;
    try {
      const r = await call('GET', 'projects', { to: p, headers: { host: `127.0.0.1:${p}` } });
      expect(r.status).toBe(200);
      expect(r.json().roots.length).toBe(2);
      expect((await call('GET', 'projects', { to: p, headers: { host: `127.0.0.1:${p}`, 'x-shamble-vfx': undefined } })).status).toBe(403);
    } finally {
      await vite.close();
    }
  });
});

describe('export and import', () => {
  it('exports a project to exports/, lists it, and imports it as a new project (through the dev server)', async () => {
    const box = join(tmp, 'export-box');
    const exRoots: ProjectRoot[] = [
      { id: 'examples', label: 'Examples (read-only)', dir: join(box, 'examples'), writable: false },
      { id: 'projects', label: 'My projects', dir: join(box, 'projects'), writable: true },
    ];
    mkdirSync(join(box, 'examples'), { recursive: true });
    cpSync(join(import.meta.dirname, '..', '..', '..', 'examples', 'hits-collection'), join(box, 'examples', 'hits'), { recursive: true });
    const exportsDir = join(box, 'exports');
    const palettesDir = join(box, 'palettes');
    // The editor package is Vite's root here, so the plugin loads server/export.ts and server/palette-profiles.ts the way
    // `npm run dev` does.
    const vite = await createViteServer({
      configFile: false, root: join(import.meta.dirname, '..'), logLevel: 'silent', appType: 'custom',
      plugins: [projectFiles({ roots: exRoots, exportsDir, palettesDir })], server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
    });
    await vite.listen();
    const p = (vite.httpServer!.address() as AddressInfo).port;
    const at = { to: p, headers: { host: `127.0.0.1:${p}`, 'content-type': 'application/json' } };
    try {
      expect((await call('GET', 'exports', { to: p, headers: { host: `127.0.0.1:${p}` } })).json()).toEqual({ exports: [] });
      const ex = await call('POST', 'export', { ...at, body: JSON.stringify({ id: 'examples/hits' }) });
      expect(ex.status).toBe(200);
      expect(ex.json()).toMatchObject({ ok: true, folder: 'exports/hits', effects: 10, events: 10, errors: [] });
      expect(existsSync(join(exportsDir, 'hits', 'manifest.json'))).toBe(true);
      expect((await call('GET', 'exports', { to: p, headers: { host: `127.0.0.1:${p}` } })).json()).toEqual({ exports: [{ folder: 'hits', name: 'Comic hits', effects: 10, events: 10 }] });

      const im = await call('POST', 'import', { ...at, body: JSON.stringify({ export: 'hits', root: 'projects', name: 'Hits back' }) });
      expect(im.status).toBe(201);
      // The export's colours became a palette profile named after the export's project (not the name typed for the new one).
      expect(im.json()).toMatchObject({ ok: true, id: 'projects/hits-back', name: 'Hits back', effects: 10, images: 0, profile: { id: 'comic-hits', name: 'Comic hits', added: true } });
      const back = JSON.parse(readFileSync(join(box, 'projects', 'hits-back', 'project.json'), 'utf8'));
      expect(back.name).toBe('Hits back');
      expect(back.paletteProfile).toBe('Comic hits');
      expect(back.events.hit_bullet_spark).toEqual(['hit.bullet.metal']);
      expect(back.preview.hit_heavy_blast).toEqual({ scene: 'hit-ground' });
      // The palette profiles, through the dev server: the two defaults (the folder was made on first use) and the import's.
      const profiles = await call('GET', 'profiles', { to: p, headers: { host: `127.0.0.1:${p}` } });
      expect(profiles.status).toBe(200);
      expect(profiles.json().profiles.map((x: { name: string }) => x.name)).toEqual(['Built-in', 'Built-in with gradients', 'Comic hits']);
      expect(readdirSync(palettesDir).sort()).toEqual(['built-in-with-gradients.json', 'built-in.json', 'comic-hits.json']);

      // A taken name, a read-only root and an unknown export are refused, and leave nothing behind.
      expect((await call('POST', 'import', { ...at, body: JSON.stringify({ export: 'hits', root: 'projects', name: 'Hits back' }) })).status).toBe(409);
      expect((await call('POST', 'import', { ...at, body: JSON.stringify({ export: 'hits', root: 'examples', name: 'X' }) })).status).toBe(403);
      expect((await call('POST', 'import', { ...at, body: JSON.stringify({ export: 'nothing', root: 'projects', name: 'Y' }) })).status).toBe(404);
      expect((await call('POST', 'import', { ...at, body: JSON.stringify({ export: '../examples', root: 'projects', name: 'Z' }) })).status).toBe(400);
      expect(existsSync(join(box, 'projects', 'y'))).toBe(false);

      // An export whose palette.json has a part missing is refused in plain words, and makes nothing.
      cpSync(join(exportsDir, 'hits'), join(exportsDir, 'badpal'), { recursive: true });
      const badPal = JSON.parse(readFileSync(join(exportsDir, 'badpal', 'palette.json'), 'utf8'));
      delete badPal.factions.soviets.roles;
      writeFileSync(join(exportsDir, 'badpal', 'palette.json'), `${JSON.stringify(badPal, null, 2)}\n`);
      const refused = await call('POST', 'import', { ...at, body: JSON.stringify({ export: 'badpal', root: 'projects', name: 'Bad colours' }) });
      expect(refused.status).toBe(422);
      expect(refused.json().errors[0]).toBe('palette.json: faction soviets has no "roles"');
      expect(existsSync(join(box, 'projects', 'bad-colours'))).toBe(false);
      // A profile file with a part missing is named in the list, and never stops an import.
      const odd = JSON.parse(readFileSync(join(palettesDir, 'comic-hits.json'), 'utf8'));
      odd.name = 'Odd';
      delete odd.palette.factions.allies.roles;
      writeFileSync(join(palettesDir, 'odd.json'), `${JSON.stringify(odd, null, 2)}\n`);
      const again = await call('POST', 'import', { ...at, body: JSON.stringify({ export: 'hits', root: 'projects', name: 'Hits again' }) });
      expect(again.status).toBe(201);
      expect(again.json().profile).toEqual({ id: 'comic-hits', name: 'Comic hits', added: false });
      const listed = await call('GET', 'profiles', { to: p, headers: { host: `127.0.0.1:${p}` } });
      expect(listed.status).toBe(200);
      expect(listed.json().problems.map((x: { file: string }) => x.file)).toEqual(['odd.json']);
    } finally {
      await vite.close();
    }
  }, 30000);

  it('names the problems and writes nothing when the project cannot be exported', async () => {
    const box = join(tmp, 'export-bad');
    mkdirSync(join(box, 'projects', 'bad', 'effects'), { recursive: true });
    writeFileSync(join(box, 'projects', 'bad', 'project.json'), JSON.stringify({ format: 'shamble-vfx-project', version: 1, name: 'Bad' }));
    writeFileSync(join(box, 'projects', 'bad', 'effects', 'shot.vfx.json'), '{"format":"shamble-vfx","version":3,"id":"shot"}');
    const s = await listen(createProjectFilesHandler({
      roots: [{ id: 'projects', label: 'My projects', dir: join(box, 'projects'), writable: true }],
      exportsDir: join(box, 'exports'),
      loadExport: () => import('../server/export'),
    }));
    const p = (s.address() as AddressInfo).port;
    try {
      const r = await call('POST', 'export', { to: p, headers: { host: `127.0.0.1:${p}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'projects/bad' }) });
      expect(r.status).toBe(422);
      expect(r.json().ok).toBe(false);
      expect(r.json().errors.join('\n')).toMatch(/effects\/shot\.vfx\.json: /);
      expect(existsSync(join(box, 'exports'))).toBe(false);
    } finally {
      s.close();
    }
  });
});
