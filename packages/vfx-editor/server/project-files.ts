/**
 * Saving and opening project folders on disk, through the local dev server (npm run dev).
 *
 * Why a server and not the browser's own folder picker: Brave turns that picker off unless you set a flag,
 * and Mustafa uses Brave. This works in every browser.
 *
 * A project folder:
 *   project.json             {"format":"shamble-vfx-project","version":1,"name":"..."}
 *   effects/<id>.vfx.json    one file per effect
 *   images/<name>.png        the images the effects use
 *   palette.json             the project's colours (optional: without it the built-in palette is used)
 *
 * Roots (folders that hold project folders):
 *   examples/   in the repo, read-only, so tracked files are never changed by accident ("Save as" copies one out)
 *   projects/   in the repo (git ignores it), writable, made on first use
 *   VFX_PROJECT_ROOTS (environment variable): more writable folders, separated like PATH
 *
 * This is a write API on your own computer, and any web page you open could try to call it. So every request
 * must come to this server by name (Host 127.0.0.1 or localhost, this port), from this server's own pages
 * (Origin, when the browser sends one), with the header X-Shamble-VFX: 1, which other pages cannot add without
 * this server agreeing (and it never agrees). Paths are checked against a short list of allowed forms and must
 * stay inside the project folder, symbolic links included.
 *
 * API, all under /__vfx/api:
 *   GET    projects                      list roots and projects
 *   POST   projects   {root, name}       make a new project folder
 *   POST   copy       {from, root, name} copy a project into a writable root ("Save as")
 *   GET    project?id=                   what a project holds
 *   GET    file?id=&path=                one file's bytes
 *   PUT    file?id=&path=                write one file (JSON must parse, PNG must be a PNG)
 *   DELETE file?id=&path=                delete one effect or image file
 *   GET    exports                       list the export folders in exports/
 *   POST   export     {id}               export a project (as saved on disk) to exports/<folder>/, replacing it
 *   POST   import     {export, root, name}  make a new project from exports/<export>/
 *
 * Export and import run the code in ./export.ts (the same as `npm run export`), loaded through Vite, so they can use the
 * TypeScript packages as they are.
 */
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type * as ExportModule from './export';

export const API_PREFIX = '/__vfx/api/';
export const CLIENT_HEADER = 'x-shamble-vfx';
export const PROJECT_FORMAT = 'shamble-vfx-project';

export interface ProjectRoot {
  /** Short id used in project ids: "<root id>/<folder>". Lowercase letters, digits, _ and -. */
  id: string;
  /** What the editor shows. */
  label: string;
  /** Absolute folder. */
  dir: string;
  writable: boolean;
}

export interface ProjectFilesOptions {
  /** The roots to use instead of the default ones (for tests). */
  roots?: ProjectRoot[];
  /** Largest request body accepted, in bytes. Default 16 MB. */
  maxBodyBytes?: number;
  /** Where exports go. Default: the repo's exports/ folder (git ignores it). */
  exportsDir?: string;
  /** Loads ./export.ts. The Vite plugin loads it through the dev server; tests can import it directly. */
  loadExport?: () => Promise<typeof ExportModule>;
}

const ROOT_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const NAME = '[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}';
const FOLDER = new RegExp(`^${NAME}$`);
const PROJECT_PATH = new RegExp(`^(project\\.json|palette\\.json|effects/${NAME}\\.vfx\\.json|images/${NAME}\\.png)$`);
const EFFECT_FILE = new RegExp(`^${NAME}\\.vfx\\.json$`);
const IMAGE_FILE = new RegExp(`^${NAME}\\.png$`);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_MAX_BODY = 16 * 1024 * 1024;

/** The roots used by `npm run dev`: examples (read-only), projects (writable), and VFX_PROJECT_ROOTS. */
export function defaultRoots(env: NodeJS.ProcessEnv = process.env): ProjectRoot[] {
  // This file is packages/vfx-editor/server/project-files.ts, so the repo is three folders up.
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const roots: ProjectRoot[] = [
    { id: 'examples', label: 'Examples (read-only)', dir: join(repo, 'examples'), writable: false },
    { id: 'projects', label: 'My projects', dir: join(repo, 'projects'), writable: true },
  ];
  const extra = (env.VFX_PROJECT_ROOTS ?? '').split(delimiter).map((s) => s.trim()).filter(Boolean);
  extra.forEach((dir, i) => {
    roots.push({ id: `extra${i + 1}`, label: resolve(dir), dir: resolve(dir), writable: true });
  });
  return roots;
}

/** The repo's exports/ folder. */
export function defaultExportsDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'exports');
}

/** Turn a project name into a folder name: lowercase letters, digits, _ and -. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64)
    .replace(/[-_]+$/g, '');
}

/** A path inside a project that the API may touch. */
export function isProjectPath(p: string): boolean {
  return PROJECT_PATH.test(p) && !p.includes('..');
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface Project {
  root: ProjectRoot;
  folder: string;
  dir: string;
}

/** The request handler, usable with Vite's dev server or a plain Node http server. */
export function createProjectFilesHandler(opts: ProjectFilesOptions = {}) {
  const roots = opts.roots ?? defaultRoots();
  const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const exportsDir = opts.exportsDir ?? defaultExportsDir();
  const loadExport = async () => {
    if (!opts.loadExport) throw new ApiError(501, 'Export is not set up on this server');
    return opts.loadExport();
  };
  for (const r of roots) {
    if (!ROOT_ID.test(r.id)) throw new Error(`Project root id "${r.id}" must be lowercase letters, digits, _ or -`);
  }

  return async function handle(req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void): Promise<void> {
    const rawUrl = req.url ?? '';
    if (!rawUrl.startsWith(API_PREFIX)) {
      if (next) next();
      else send(res, 404, { error: 'Not found' });
      return;
    }
    try {
      checkCaller(req);
      const url = new URL(rawUrl, 'http://local');
      const route = url.pathname.slice(API_PREFIX.length);
      const method = (req.method ?? 'GET').toUpperCase();
      const q = url.searchParams;

      if (route === 'projects' && method === 'GET') return send(res, 200, await listProjects(roots));
      if (route === 'projects' && method === 'POST') {
        const body = await readJsonBody(req, maxBody);
        return send(res, 201, await createProject(roots, str(body.root, 'root'), str(body.name, 'name')));
      }
      if (route === 'copy' && method === 'POST') {
        const body = await readJsonBody(req, maxBody);
        return send(res, 201, await copyProject(roots, str(body.from, 'from'), str(body.root, 'root'), str(body.name, 'name')));
      }
      if (route === 'project' && method === 'GET') {
        const p = await openProject(roots, param(q, 'id'));
        return send(res, 200, await projectContents(p));
      }
      if (route === 'file') {
        const p = await openProject(roots, param(q, 'id'));
        const path = param(q, 'path');
        if (method === 'GET') return sendFile(res, await readProjectFile(p, path), path);
        if (method === 'PUT') {
          if (!p.root.writable) throw readOnly();
          checkContentType(req, path.endsWith('.png') ? 'image/png' : 'application/json');
          await writeProjectFile(p, path, await readBody(req, maxBody));
          return send(res, 200, { ok: true });
        }
        if (method === 'DELETE') {
          if (!p.root.writable) throw readOnly();
          await deleteProjectFile(p, path);
          return send(res, 200, { ok: true });
        }
        throw new ApiError(405, `${method} is not allowed here`);
      }
      if (route === 'exports' && method === 'GET') return send(res, 200, await listExports(exportsDir));
      if (route === 'export' && method === 'POST') {
        const body = await readJsonBody(req, maxBody);
        const p = await openProject(roots, str(body.id, 'id'));
        const out = join(exportsDir, p.folder);
        const report = await (await loadExport()).exportProject(p.dir, out);
        return send(res, report.ok ? 200 : 422, { folder: `exports/${p.folder}`, ...report });
      }
      if (route === 'import' && method === 'POST') {
        const body = await readJsonBody(req, maxBody);
        const folder = str(body.export, 'export');
        if (!FOLDER.test(folder) || folder.includes('..')) throw new ApiError(400, `"${folder}" is not an export folder name`);
        const dir = join(exportsDir, folder);
        if (!(await isFolder(dir)) || !(await realInside(dir, exportsDir))) throw new ApiError(404, `There is no export "exports/${folder}"`);
        const root = writableRoot(roots, str(body.root, 'root'));
        const made = await makeProjectFolder(root, str(body.name, 'name'));
        const r = await (await loadExport()).importExport(dir, made.dir, made.name).catch((e: unknown) => ({ ok: false, errors: [String((e as Error)?.message ?? e)], effects: 0, images: 0 }));
        if (!r.ok) {
          await fs.rm(made.dir, { recursive: true, force: true });
          return send(res, 422, { ok: false, errors: r.errors });
        }
        return send(res, 201, { ok: true, id: `${root.id}/${made.folder}`, name: made.name, root: root.id, writable: true, effects: r.effects, images: r.images });
      }
      if (['projects', 'copy', 'project', 'exports', 'export', 'import'].includes(route)) throw new ApiError(405, `${method} is not allowed here`);
      throw new ApiError(404, 'Not found');
    } catch (e) {
      if (e instanceof ApiError) send(res, e.status, { error: e.message });
      else send(res, 500, { error: `The server could not do that: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
}

/** The Vite plugin: adds the API to `npm run dev`. */
export function projectFiles(opts: ProjectFilesOptions = {}): Plugin {
  return {
    name: 'shamble-vfx-project-files',
    apply: 'serve',
    configureServer(server) {
      const handle = createProjectFilesHandler({
        loadExport: () => server.ssrLoadModule('/server/export.ts') as Promise<typeof ExportModule>,
        ...opts,
      });
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
  };
}

// ---------------------------------------------------------------- who may call

function checkCaller(req: IncomingMessage): void {
  const port = req.socket.localPort;
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  const host = (req.headers.host ?? '').toLowerCase();
  if (!allowed.includes(host)) throw new ApiError(403, 'Refused: the request did not come to this editor by its local address');
  const origin = req.headers.origin;
  if (origin !== undefined && !allowed.map((h) => `http://${h}`).includes(origin.toLowerCase())) {
    throw new ApiError(403, 'Refused: the request came from another web page');
  }
  if (req.headers[CLIENT_HEADER] !== '1') throw new ApiError(403, 'Refused: the request did not come from the Shamble VFX editor');
}

function checkContentType(req: IncomingMessage, want: string): void {
  const got = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  if (got !== want) throw new ApiError(415, `Expected content type ${want}`);
}

// ---------------------------------------------------------------- projects

async function listProjects(roots: ProjectRoot[]) {
  const projects: { id: string; name: string; root: string; writable: boolean }[] = [];
  for (const root of roots) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(root.dir, { withFileTypes: true });
    } catch {
      continue; // a root that does not exist yet has no projects
    }
    for (const e of entries) {
      if (!e.isDirectory() || !FOLDER.test(e.name) || e.name.includes('..')) continue;
      const dir = join(root.dir, e.name);
      const meta = await readMeta(dir);
      if (!meta) continue;
      projects.push({ id: `${root.id}/${e.name}`, name: meta.name, root: root.id, writable: root.writable });
    }
  }
  projects.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { roots: roots.map((r) => ({ id: r.id, label: r.label, writable: r.writable })), projects };
}

/** project.json, or undefined when the folder is not a project. A broken project.json still counts (named after the folder). */
async function readMeta(dir: string): Promise<{ name: string } | undefined> {
  let text: string;
  try {
    text = await fs.readFile(join(dir, 'project.json'), 'utf8');
  } catch {
    return undefined;
  }
  try {
    const j = JSON.parse(text) as { name?: unknown };
    if (typeof j.name === 'string' && j.name.trim()) return { name: j.name.trim() };
  } catch {
    // fall through
  }
  return { name: dir.split(sep).pop() ?? 'project' };
}

async function openProject(roots: ProjectRoot[], id: string): Promise<Project> {
  const slash = id.indexOf('/');
  const rootId = slash > 0 ? id.slice(0, slash) : '';
  const folder = slash > 0 ? id.slice(slash + 1) : '';
  if (!ROOT_ID.test(rootId) || !FOLDER.test(folder) || folder.includes('..')) {
    throw new ApiError(400, `"${id}" is not a project id (expected <root>/<folder>)`);
  }
  const root = roots.find((r) => r.id === rootId);
  if (!root) throw new ApiError(404, `There is no project root "${rootId}"`);
  const dir = join(root.dir, folder);
  let st;
  try {
    st = await fs.stat(dir);
  } catch {
    throw new ApiError(404, `There is no project "${id}"`);
  }
  if (!st.isDirectory()) throw new ApiError(404, `There is no project "${id}"`);
  if (!(await realInside(dir, root.dir))) throw new ApiError(403, `Refused: "${id}" points outside its project root`);
  try {
    await fs.access(join(dir, 'project.json'));
  } catch {
    throw new ApiError(404, `"${id}" is not a project folder (no project.json)`);
  }
  return { root, folder, dir };
}

async function projectContents(p: Project) {
  const meta = await readMeta(p.dir);
  const effects = (await listFiles(join(p.dir, 'effects'), EFFECT_FILE)).map((f) => f.name);
  const images = await listFiles(join(p.dir, 'images'), IMAGE_FILE);
  const palette = await fs.stat(join(p.dir, 'palette.json')).then((s) => s.isFile(), () => false);
  return {
    id: `${p.root.id}/${p.folder}`,
    name: meta?.name ?? p.folder,
    writable: p.root.writable,
    palette,
    effects,
    images: images.map((f) => ({ name: f.name, bytes: f.bytes })),
  };
}

async function listFiles(dir: string, pattern: RegExp): Promise<{ name: string; bytes: number }[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { name: string; bytes: number }[] = [];
  for (const e of entries) {
    if (!e.isFile() || !pattern.test(e.name) || e.name.includes('..')) continue;
    const st = await fs.stat(join(dir, e.name));
    out.push({ name: e.name, bytes: st.size });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function writableRoot(roots: ProjectRoot[], rootId: string): ProjectRoot {
  const root = roots.find((r) => r.id === rootId);
  if (!root) throw new ApiError(404, `There is no project root "${rootId}"`);
  if (!root.writable) throw new ApiError(403, `"${root.label}" is read-only. Pick a writable place, such as My projects`);
  return root;
}

function displayName(name: string): string {
  const n = name.trim();
  if (!n || n.length > 80 || /[\u0000-\u001f\u007f]/.test(n)) throw new ApiError(400, 'A project name needs 1 to 80 letters');
  return n;
}

/** Make an empty project folder. Fails if the folder exists. */
async function makeProjectFolder(root: ProjectRoot, name: string): Promise<{ folder: string; dir: string; name: string }> {
  const nice = displayName(name);
  const folder = slugify(nice);
  if (!folder || !FOLDER.test(folder)) throw new ApiError(400, `"${nice}" does not make a usable folder name; use some letters or digits`);
  await fs.mkdir(root.dir, { recursive: true });
  const dir = join(root.dir, folder);
  try {
    await fs.mkdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new ApiError(409, `A project folder named "${folder}" already exists`);
    throw e;
  }
  if (!(await realInside(dir, root.dir))) throw new ApiError(403, 'Refused: the new folder would be outside its project root');
  return { folder, dir, name: nice };
}

async function createProject(roots: ProjectRoot[], rootId: string, name: string) {
  const root = writableRoot(roots, rootId);
  const made = await makeProjectFolder(root, name);
  await writeAtomic(join(made.dir, 'project.json'), projectJson(made.name));
  await fs.mkdir(join(made.dir, 'effects'));
  await fs.mkdir(join(made.dir, 'images'));
  return { id: `${root.id}/${made.folder}`, name: made.name, root: root.id, writable: true };
}

async function copyProject(roots: ProjectRoot[], fromId: string, rootId: string, name: string) {
  const from = await openProject(roots, fromId);
  const root = writableRoot(roots, rootId);
  const made = await makeProjectFolder(root, name);
  try {
    await writeAtomic(join(made.dir, 'project.json'), projectJson(made.name));
    // The project's own colours come along (never through a link out of the source project).
    const pal = join(from.dir, 'palette.json');
    if (await fs.stat(pal).then((s) => s.isFile(), () => false) && (await realInside(pal, from.dir))) await fs.copyFile(pal, join(made.dir, 'palette.json'));
    for (const [sub, pattern] of [['effects', EFFECT_FILE], ['images', IMAGE_FILE]] as const) {
      await fs.mkdir(join(made.dir, sub));
      for (const f of await listFiles(join(from.dir, sub), pattern)) {
        const src = join(from.dir, sub, f.name);
        if (!(await realInside(src, from.dir))) continue; // never follow a link out of the source project
        await fs.copyFile(src, join(made.dir, sub, f.name));
      }
    }
  } catch (e) {
    await fs.rm(made.dir, { recursive: true, force: true });
    throw e;
  }
  return { id: `${root.id}/${made.folder}`, name: made.name, root: root.id, writable: true };
}

function projectJson(name: string): Buffer {
  return Buffer.from(JSON.stringify({ format: PROJECT_FORMAT, version: 1, name }, null, 2) + '\n');
}

// ---------------------------------------------------------------- exports

async function isFolder(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function listExports(exportsDir: string) {
  const out: { folder: string; name: string; effects: number; events: number }[] = [];
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(exportsDir, { withFileTypes: true });
  } catch {
    // no exports yet
  }
  for (const e of entries) {
    if (!e.isDirectory() || !FOLDER.test(e.name)) continue;
    try {
      const m = JSON.parse(await fs.readFile(join(exportsDir, e.name, 'manifest.json'), 'utf8')) as { name?: unknown; effects?: unknown[]; events?: object };
      out.push({ folder: e.name, name: typeof m.name === 'string' ? m.name : e.name, effects: m.effects?.length ?? 0, events: Object.keys(m.events ?? {}).length });
    } catch {
      // not an export
    }
  }
  return { exports: out.sort((a, b) => a.folder.localeCompare(b.folder)) };
}

// ---------------------------------------------------------------- files

function filePath(p: Project, path: string): string {
  if (!isProjectPath(path)) {
    throw new ApiError(400, `"${path}" is not a file the editor may touch (project.json, effects/<name>.vfx.json or images/<name>.png)`);
  }
  return join(p.dir, ...path.split('/'));
}

async function readProjectFile(p: Project, path: string): Promise<Buffer> {
  const file = filePath(p, path);
  let st;
  try {
    st = await fs.stat(file);
  } catch {
    throw new ApiError(404, `There is no file "${path}" in this project`);
  }
  if (!st.isFile()) throw new ApiError(404, `There is no file "${path}" in this project`);
  if (!(await realInside(file, p.dir))) throw new ApiError(403, `Refused: "${path}" points outside the project folder`);
  return fs.readFile(file);
}

async function writeProjectFile(p: Project, path: string, body: Buffer): Promise<void> {
  const file = filePath(p, path);
  if (path.endsWith('.png')) {
    if (body.length < 8 || !body.subarray(0, 8).equals(PNG_SIGNATURE)) throw new ApiError(400, `"${path}" is not a PNG image`);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      throw new ApiError(400, `"${path}" is not valid JSON`);
    }
    if (path === 'project.json') {
      const j = parsed as { format?: unknown; name?: unknown } | null;
      if (!j || typeof j !== 'object' || j.format !== PROJECT_FORMAT || typeof j.name !== 'string' || !j.name.trim()) {
        throw new ApiError(400, `project.json must be an object with "format": "${PROJECT_FORMAT}" and a "name"`);
      }
    }
    if (path === 'palette.json') {
      const j = parsed as { version?: unknown; factions?: unknown; roles?: unknown } | null;
      if (!j || typeof j !== 'object' || typeof j.version !== 'number' || !j.factions || typeof j.factions !== 'object' || !j.roles || typeof j.roles !== 'object') {
        throw new ApiError(400, 'palette.json must be an object with a "version", "factions" and "roles"');
      }
    }
  }
  const folder = dirname(file);
  await fs.mkdir(folder, { recursive: true });
  if (!(await realInside(folder, p.dir))) throw new ApiError(403, `Refused: "${path}" points outside the project folder`);
  try {
    if (!(await realInside(file, p.dir))) throw new ApiError(403, `Refused: "${path}" points outside the project folder`);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // The file does not exist yet: fine.
  }
  await writeAtomic(file, body);
}

async function deleteProjectFile(p: Project, path: string): Promise<void> {
  const file = filePath(p, path);
  if (path === 'project.json') throw new ApiError(400, 'project.json cannot be deleted');
  let st;
  try {
    st = await fs.lstat(file);
  } catch {
    throw new ApiError(404, `There is no file "${path}" in this project`);
  }
  // A symbolic link is removed as a link; what it points to is never touched.
  if (!st.isFile() && !st.isSymbolicLink()) throw new ApiError(404, `There is no file "${path}" in this project`);
  if (!(await realInside(dirname(file), p.dir))) throw new ApiError(403, `Refused: "${path}" points outside the project folder`);
  await fs.unlink(file);
}

/** Write to a temporary file next to the target, then rename it over the target, so a file is never half written. */
async function writeAtomic(file: string, data: Buffer): Promise<void> {
  const tmp = join(dirname(file), `.${file.split(sep).pop()}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await fs.writeFile(tmp, data, { flag: 'wx' });
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

/** True when `child`, with every symbolic link followed, is inside `parent` (or is it). */
async function realInside(child: string, parent: string): Promise<boolean> {
  const [c, p] = await Promise.all([fs.realpath(child), fs.realpath(parent)]);
  const rel = relative(p, c);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

// ---------------------------------------------------------------- requests and replies

function readOnly(): ApiError {
  return new ApiError(403, 'This project is read-only (an example). Use Save as to copy it into your projects');
}

function param(q: URLSearchParams, name: string): string {
  const v = q.get(name);
  if (v === null || v === '') throw new ApiError(400, `Missing "${name}"`);
  return v;
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v) throw new ApiError(400, `Missing "${name}"`);
  return v;
}

async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? '0');
  const chunks: Buffer[] = [];
  let size = 0;
  let tooBig = declared > max;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) tooBig = true;
    if (!tooBig) chunks.push(chunk);
    if (size > max * 4) break; // stop reading a body that keeps coming
  }
  if (tooBig) throw new ApiError(413, `The file is larger than ${Math.round(max / (1024 * 1024))} MB`);
  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
  checkContentType(req, 'application/json');
  const body = await readBody(req, max);
  try {
    const j = JSON.parse(body.toString('utf8')) as unknown;
    if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError(400, 'The request body must be a JSON object');
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function sendFile(res: ServerResponse, data: Buffer, path: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', path.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(data.length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(data);
}
