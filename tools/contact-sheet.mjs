// A contact sheet: several effects, each at a few moments, close up, on one picture (for judging a collection).
//   node tools/contact-sheet.mjs [--project=examples/hits-collection] [--effects=a,b] [--scene=hit-unit]
//        [--relation=enemy] [--faction=soviets] [--seed=7] [--times=auto|ms,ms,...] [--view=close|game] [--zoom=2] [--out=out/sheets/hits.png]
// "auto" picks four moments from the effect's phases: early in the peak, late in the peak, early and late in the fade.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, d) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `=${d}`).split('=').slice(1).join('=');
const project = arg('project', 'examples/hits-collection');
const only = arg('effects', '').split(',').filter(Boolean);
const scene = arg('scene', '');
const relation = arg('relation', 'enemy');
const faction = arg('faction', 'soviets');
const timesArg = arg('times', 'auto');
const view = arg('view', 'close');
const zoom = Number(arg('zoom', '2'));
const seed = Number(arg('seed', '7'));
const out = join(repo, arg('out', 'out/sheets/contact.png'));
mkdirSync(dirname(out), { recursive: true });

const server = await createServer({ root: join(repo, 'packages', 'vfx-editor'), configFile: join(repo, 'packages', 'vfx-editor', 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?backend=webgl&frame=1&project=${project}`);
await page.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
const effects = await page.evaluate(() => window.__vfx.app.debugState().effects);
const list = only.length ? only : effects;

const CW = 560, CH = 400; // one cell: the middle of the close-up
const rows = [];
for (const id of list) {
  const times = await page.evaluate(([id, scene, faction, relation, timesArg]) => {
    const a = window.__vfx.app;
    window.__vfxManual = true;
    return a.setupForChecks({ effect: id, ...(scene ? { scene } : {}), faction, relation, distance: 1 }).then(() => {
      if (timesArg !== 'auto') return timesArg.split(',').map(Number);
      const tl = a.timeline();
      const p = tl.phases;
      const peak = p.peak.endMs - p.peak.startMs, fade = p.fade.endMs - p.fade.startMs;
      if (peak + fade <= 0) return [0.1, 0.3, 0.55, 0.8].map((k) => k * tl.lengthMs);
      return [p.peak.startMs + Math.min(40, peak * 0.15), p.peak.startMs + peak * 0.7, p.fade.startMs + fade * 0.25, p.fade.startMs + fade * 0.7];
    });
  }, [id, scene, faction, relation, timesArg]);
  const cells = [];
  for (const t of times) {
    await page.evaluate(async ([t, view, zoom, seed]) => {
      const a = window.__vfx.app;
      a.previewForChecks.setCloseZoom(zoom);
      a.previewForChecks.setCloseOn('target');
      a.previewForChecks.setView(view);
      a.previewForChecks.targetMarker.visible = false;
      await a.showAt(t, seed);
      await a.showAt(t, seed);
      document.querySelector('.status')?.classList.remove('show');
    }, [t, view, zoom, seed]);
    await page.waitForTimeout(40);
    const shot = PNG.sync.read(await page.screenshot({ clip: { x: (1280 - CW) / 2, y: (720 - CH) / 2, width: CW, height: CH } }));
    cells.push({ png: shot, label: `${id} ${Math.round(t)} ms` });
  }
  rows.push(cells);
  console.log(`${id}: ${times.map((t) => Math.round(t)).join(', ')} ms`);
}
const cols = Math.max(...rows.map((r) => r.length));
const sheet = new PNG({ width: cols * (CW + 6) + 6, height: rows.length * (CH + 6) + 6 });
sheet.data.fill(255);
rows.forEach((cells, r) => cells.forEach((c, k) => {
  const ox = 6 + k * (CW + 6), oy = 6 + r * (CH + 6);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const s = (y * CW + x) * 4, d = ((oy + y) * sheet.width + ox + x) * 4;
    sheet.data[d] = c.png.data[s]; sheet.data[d + 1] = c.png.data[s + 1]; sheet.data[d + 2] = c.png.data[s + 2]; sheet.data[d + 3] = 255;
  }
}));
writeFileSync(out, PNG.sync.write(sheet));
console.log(`\n${out}${errors.length ? `\nERRORS: ${errors.join(' | ')}` : ''}`);
await browser.close();
await server.close();
