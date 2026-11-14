/**
 * Where projects live, seen from the editor. One small interface, so the editor does not care how files are
 * reached. Today: DevServerStore, which talks to the local dev server (server/project-files.ts). A version
 * using the browser's own folder picker could be added later behind the same interface.
 *
 * A project folder holds project.json, effects/<id>.vfx.json and images/<name>.png.
 * Paths given to read/write/remove are relative to the project folder and use "/".
 */

export interface RootSummary {
  id: string;
  label: string;
  writable: boolean;
}

export interface ProjectSummary {
  /** "<root id>/<folder>" */
  id: string;
  name: string;
  root: string;
  writable: boolean;
}

export interface ProjectListing {
  roots: RootSummary[];
  projects: ProjectSummary[];
}

export interface ProjectContents {
  id: string;
  name: string;
  writable: boolean;
  /** File names in effects/, e.g. "rifle_shot.vfx.json". */
  effects: string[];
  /** File names in images/ with their size in bytes. */
  images: { name: string; bytes: number }[];
}

export interface ProjectStore {
  list(): Promise<ProjectListing>;
  /** Make a new, empty project in a writable root. */
  create(root: string, name: string): Promise<ProjectSummary>;
  /** Copy a project into a writable root under a new name ("Save as"). */
  copy(from: string, root: string, name: string): Promise<ProjectSummary>;
  open(id: string): Promise<ProjectContents>;
  read(id: string, path: string): Promise<Blob>;
  write(id: string, path: string, data: Blob): Promise<void>;
  remove(id: string, path: string): Promise<void>;
}

/** What went wrong, in plain words, with the HTTP status when there was one. */
export class StoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'StoreError';
  }
}

export const effectPath = (effectId: string): string => `effects/${effectId}.vfx.json`;
export const imagePath = (imageName: string): string => `images/${imageName}`;

export async function readJson<T = unknown>(store: ProjectStore, id: string, path: string): Promise<T> {
  const blob = await store.read(id, path);
  return JSON.parse(await blob.text()) as T;
}

/** JSON with two-space indents and a final newline, so files read well and diff cleanly. */
export async function writeJson(store: ProjectStore, id: string, path: string, value: unknown): Promise<void> {
  await store.write(id, path, new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
}

/** Talks to the local dev server started by `npm run dev`. */
export class DevServerStore implements ProjectStore {
  constructor(private readonly base = '/__vfx/api') {}

  list(): Promise<ProjectListing> {
    return this.json('GET', 'projects');
  }

  create(root: string, name: string): Promise<ProjectSummary> {
    return this.json('POST', 'projects', { root, name });
  }

  copy(from: string, root: string, name: string): Promise<ProjectSummary> {
    return this.json('POST', 'copy', { from, root, name });
  }

  open(id: string): Promise<ProjectContents> {
    return this.json('GET', `project?${new URLSearchParams({ id })}`);
  }

  async read(id: string, path: string): Promise<Blob> {
    const res = await this.call('GET', fileUrl(id, path));
    return res.blob();
  }

  async write(id: string, path: string, data: Blob): Promise<void> {
    const type = path.endsWith('.png') ? 'image/png' : 'application/json';
    await this.call('PUT', fileUrl(id, path), data, type);
  }

  async remove(id: string, path: string): Promise<void> {
    await this.call('DELETE', fileUrl(id, path));
  }

  private async json<T>(method: string, route: string, body?: unknown): Promise<T> {
    const res = await this.call(method, route, body === undefined ? undefined : JSON.stringify(body), 'application/json');
    return (await res.json()) as T;
  }

  private async call(method: string, route: string, body?: BodyInit, type?: string): Promise<Response> {
    const headers: Record<string, string> = { 'X-Shamble-VFX': '1' };
    if (body !== undefined && type) headers['Content-Type'] = type;
    let res: Response;
    try {
      res = await fetch(`${this.base}/${route}`, { method, headers, body, cache: 'no-store' });
    } catch {
      throw new StoreError('Cannot reach the editor\'s local server. Is "npm run dev" still running?', 0);
    }
    if (!res.ok) {
      let message = `The local server said ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) message = j.error;
      } catch {
        // keep the status text
      }
      throw new StoreError(message, res.status);
    }
    return res;
  }
}

function fileUrl(id: string, path: string): string {
  return `file?${new URLSearchParams({ id, path })}`;
}
