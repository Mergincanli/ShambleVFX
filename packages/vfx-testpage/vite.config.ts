import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/** The repo's exports/ folder (git ignores it): what the editor's Export button and `npm run export` write. */
const EXPORTS = resolve(import.meta.dirname, '..', '..', 'exports');
const TYPES: Record<string, string> = { '.json': 'application/json', '.png': 'image/png' };

/**
 * Serves exports/ at /exports/, read-only, so the page can load an export folder the way the game would: by URL.
 * GET /exports/index.json lists the export folders.
 */
function serveExports(): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0]!);
    if (!path.startsWith('/exports/')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
    const rel = path.slice('/exports/'.length);
    if (rel === 'index.json' || rel === '') {
      const names = await fs.readdir(EXPORTS).catch(() => [] as string[]);
      const list: { folder: string; name: string }[] = [];
      for (const folder of names.sort()) {
        const m = await fs.readFile(join(EXPORTS, folder, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => null);
        if (m && typeof m.name === 'string') list.push({ folder, name: m.name });
      }
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(list));
    }
    const file = resolve(EXPORTS, rel);
    if (!file.startsWith(EXPORTS + sep) || !TYPES[extname(file)]) { res.statusCode = 404; return res.end(); }
    try {
      const body = await fs.readFile(file);
      res.setHeader('content-type', TYPES[extname(file)]!);
      res.setHeader('cache-control', 'no-store');
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  };
  return {
    name: 'shamble-vfx-serve-exports',
    configureServer(server) { server.middlewares.use((req, res, next) => void handle(req, res, next)); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => void handle(req, res, next)); },
  };
}

export default defineConfig({
  plugins: [serveExports()],
  server: { host: '127.0.0.1', port: 5174, strictPort: false, open: !process.env.VFX_NO_OPEN },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
