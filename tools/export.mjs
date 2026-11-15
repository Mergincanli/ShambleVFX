#!/usr/bin/env node
/**
 * Export, check and import from the command line. The same code the editor's Export and Import buttons run
 * (packages/vfx-editor/server/export.ts), loaded through Vite so it can use the TypeScript packages as they are.
 *
 *   npm run export -- examples/demo-project                 writes exports/demo-project/
 *   npm run export -- examples/demo-project out/my-export   writes out/my-export/ (the folder is replaced)
 *   npm run check:export -- exports/demo-project            checks an export folder
 *   npm run import -- exports/demo-project projects/back    makes a new project from an export
 */
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, a, b, c] = process.argv.slice(2);
const usage = () => {
  console.error('usage: node tools/export.mjs export <project folder> [<export folder>]');
  console.error('       node tools/export.mjs check <export folder>');
  console.error('       node tools/export.mjs import <export folder> <new project folder> [<name>]');
  process.exit(2);
};
if (!cmd || !a || (cmd === 'import' && !b) || !['export', 'check', 'import'].includes(cmd)) usage();

const server = await createServer({
  root: join(repo, 'packages', 'vfx-editor'),
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let code = 0;
try {
  const ex = await server.ssrLoadModule('/server/export.ts');
  const list = (title, lines) => { if (lines.length) { console.log(title); for (const l of lines) console.log(`  ${l}`); } };
  if (cmd === 'export') {
    const project = resolve(a);
    const out = resolve(b ?? join(repo, 'exports', basename(project)));
    const r = await ex.exportProject(project, out);
    list('Errors (nothing written):', r.errors);
    list('Warnings:', r.warnings);
    if (r.ok) console.log(`Exported ${r.effects} effects answering ${r.events} events to ${out}`);
    code = r.ok ? 0 : 1;
  } else if (cmd === 'check') {
    const r = await ex.readExport(resolve(a));
    const lines = r.check.problems.map((p) => `${p.level === 'warning' ? 'warning: ' : ''}${p.path}: ${p.message}`);
    list('Problems:', lines);
    console.log(r.check.ok ? `OK: ${r.check.effects.size} effects, ${Object.keys(r.manifest?.events ?? {}).length} events` : 'The export has errors.');
    code = r.check.ok ? 0 : 1;
  } else {
    const r = await ex.importExport(resolve(a), resolve(b), c);
    list('Errors (nothing imported):', r.errors);
    if (r.ok) console.log(`Imported ${r.effects} effects and ${r.images} images into ${resolve(b)}`);
    code = r.ok ? 0 : 1;
  }
} finally {
  await server.close();
}
process.exit(code);
