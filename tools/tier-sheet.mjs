// Quality tiers side by side: one effect at one moment in Low, Medium and High, at the game camera and the game's real size
// (a crop of the 1920 x 1080 game screen round the effect). For judging whether Low stays readable.
//   node tools/tier-sheet.mjs                                   the four board presets at their key moments
//   node tools/tier-sheet.mjs --project=examples/hits-collection --effects=hit_burst_star --times=300
//   options: --faction=soviets --relation=enemy --seed=7 --out=out/sheets
// Pictures go to out/sheets/tiers-<effect>-<ms>ms.png (kept out of git).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, d) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `=${d}`).split('=').slice(1).join('=');
const project = arg('project', 'examples/demo-project');
const faction = arg('faction', 'soviets');
const relation = arg('relation', 'enemy');
const seed = Number(arg('seed', '7'));
const outDir = join(repo, arg('out', 'out/sheets'));
mkdirSync(outDir, { recursive: true });
// The board presets' scenes and key moments (as the side-by-side comparison uses them).
const BOARD = [
  { effect: 'board_muzzle', scene: 'board-muzzle', times: [45] },
  { effect: 'board_shell', scene: 'board-shell', times: [1300] },
  { effect: 'board_beam', scene: 'board-beam', times: [1000] },
  { effect: 'board_molotov', scene: 'board-molotov', times: [1200] },
];
const effectsArg = arg('effects', '').split(',').filter(Boolean);
const timesArg = arg('times', '').split(',').filter(Boolean).map(Number);
const cases = effectsArg.length ? effectsArg.map((effect) => ({ effect, scene: arg('scene', ''), times: timesArg.length ? timesArg : [300] })) : BOARD;

const server = await createServer({ root: join(repo, 'packages', 'vfx-editor'), configFile: join(repo, 'packages', 'vfx-editor', 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?backend=webgl&frame=1&project=${project}`);
await page.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });

const TIERS = ['low', 'medium', 'high'];
const LABEL = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
for (const c of cases) {
  for (const t of c.times) {
    const cells = [];
    let box = null;
    for (const tier of TIERS) {
      const where = await page.evaluate(async ([c, t, tier, faction, relation, seed]) => {
        const a = window.__vfx.app;
        window.__vfxManual = true;
        await a.setupForChecks({ effect: c.effect, ...(c.scene ? { scene: c.scene } : {}), faction, relation, distance: 4, tier });
        a.previewForChecks.setView('frame');
        await a.showAt(t, seed);
        await a.showAt(t, seed);
        document.querySelector('.status')?.classList.remove('show');
        const pv = a.previewForChecks;
        return { o: pv.toCanvas(pv.origin), g: pv.toCanvas(pv.target), tris: pv.vfx.stats.triangles };
      }, [c, t, tier, faction, relation, seed]);
      if (!box) {
        // A crop round the effect: origin and target, with room above for words and smoke.
        const x0 = Math.min(where.o[0], where.g[0]) - 330, x1 = Math.max(where.o[0], where.g[0]) + 330;
        const y0 = Math.min(where.o[1], where.g[1]) - 420, y1 = Math.max(where.o[1], where.g[1]) + 220;
        const w = Math.min(1100, x1 - x0), h = Math.min(760, y1 - y0);
        const cx = Math.round(Math.max(0, Math.min(1920 - w, (x0 + x1) / 2 - w / 2))), cy = Math.round(Math.max(0, Math.min(1080 - h, (y0 + y1) / 2 - h / 2 - 60)));
        box = { x: cx, y: cy, width: Math.round(w), height: Math.round(h) };
      }
      await page.waitForTimeout(60);
      cells.push({ tier, tris: where.tris, png: PNG.sync.read(await page.screenshot({ clip: box })) });
    }
    const gap = 8, top = 0;
    const sheet = new PNG({ width: cells.length * (box.width + gap) - gap, height: box.height + top });
    sheet.data.fill(255);
    cells.forEach((cell, k) => {
      const ox = k * (box.width + gap);
      for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
        const s = (y * box.width + x) * 4, d = ((y + top) * sheet.width + ox + x) * 4;
        sheet.data[d] = cell.png.data[s]; sheet.data[d + 1] = cell.png.data[s + 1]; sheet.data[d + 2] = cell.png.data[s + 2]; sheet.data[d + 3] = 255;
      }
      // An ink bar between cells.
      if (k > 0) for (let y = 0; y < sheet.height; y++) for (let x = ox - gap; x < ox; x++) { const d = (y * sheet.width + x) * 4; sheet.data[d] = 17; sheet.data[d + 1] = 18; sheet.data[d + 2] = 26; }
    });
    const name = `tiers-${c.effect}-${String(t).padStart(4, '0')}ms.png`;
    writeFileSync(join(outDir, name), PNG.sync.write(sheet));
    console.log(`${name}: ${cells.map((x) => `${LABEL[x.tier]} ${x.tris} triangles`).join(' | ')}`);
  }
}
await browser.close();
await server.close();
if (errors.length) console.log('Errors:', errors.slice(0, 3).join(' | '));
console.log(`\nLeft to right: Low, Medium, High. Pictures in ${outDir}.`);
