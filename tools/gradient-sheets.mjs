// Contact sheets of the gradients the runtime draws on smoke, the fire's bed and bursts, with test gradients (not
// proposals: crude colours on purpose, so direction and band edges are easy to judge). A bed's gradient runs from the
// middle (0) to the rim (1), as a glow's.
//   node tools/gradient-sheets.mjs [--faction=soviets] [--seed=7]
// It writes a throwaway project into out/gradients/project/gradients/ (a palette.json with the test gradients, effects
// made from the Molotov preset's layers, the hit star image), opens it in the editor's own preview (the real runtime, the
// game camera) and saves one sheet per kind: out/gradients/smoke.png, bed.png, sparks.png and image-burst.png. Each row
// is one effect at four moments; the caption names it and the time. Nothing is written to projects/ or exports/.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, d) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `=${d}`).split('=').slice(1).join('=');
const faction = arg('faction', 'soviets');
const seed = Number(arg('seed', '7'));
const outDir = join(repo, 'out', 'gradients');
const root = join(outDir, 'project');
const dir = join(root, 'gradients');

// ---------------------------------------------------------------- the throwaway project
const palette = JSON.parse(readFileSync(join(repo, 'packages', 'vfx-format', 'palette', 'palette.json'), 'utf8'));
const role = (at, r, alpha) => ({ at, role: r, ...(alpha === undefined ? {} : { alpha }) });
const hex = (at, h) => ({ at, hex: h });
/**
 * How far the bed's four bands reach without a gradient, from the middle (0) to the rim (1): band k (from the rim) to
 * 1 - 0.58 k / 3 - 0.03 k. A banded gradient with the tones from the middle out, each from the edge of the band inside
 * it, draws today's bed.
 */
const TONE_EDGES = [0, 1, 2, 3].map((k) => 1 - (0.58 * k) / 3 - 0.03 * k);
palette.gradients = {
  'sheet.rgb': { kind: 'banded', from: 'assumed', note: 'Test: red from 0, green from 0.4, blue from 0.7.', stops: [hex(0, '#E02020'), hex(0.4, '#20B020'), hex(0.7, '#2050E0')] },
  'sheet.smoke.hot': { kind: 'smooth', from: 'assumed', stops: [role(0, 'heat.2'), role(0.25, 'heat.dark'), role(0.55, 'fire.smoke'), role(1, 'fire.smoke', 0.35)] },
  'sheet.smoke.thin': { kind: 'smooth', from: 'assumed', stops: [role(0, 'smoke.light'), role(0.5, 'smoke.dark', 0.75), role(1, 'smoke', 0.1)] },
  'sheet.bed.tones': { kind: 'banded', from: 'assumed', note: "The Molotov bed's tones from the middle out, with the band edges where its bands are without a gradient.", stops: [role(0, 'heat.3'), role(TONE_EDGES[3], 'heat.2'), role(TONE_EDGES[2], 'heat.1'), role(TONE_EDGES[1], 'heat.dark')] },
  'sheet.bed.bands': { kind: 'banded', from: 'assumed', stops: [role(0, 'heat.4'), role(0.2, 'heat.3'), role(0.45, 'heat.1'), role(0.7, 'heat.dark'), role(0.88, 'heat.deep')] },
  'sheet.bed.smooth': { kind: 'smooth', from: 'assumed', stops: [role(0, 'heat.4'), role(0.25, 'heat.3'), role(0.5, 'heat.1'), role(0.75, 'heat.dark'), role(1, 'heat.deep')] },
  'sheet.bed.eight': { kind: 'banded', from: 'assumed', note: 'Test: eight stops, the most the checker takes without a warning.',
    stops: ['#E02020', '#F08020', '#F0E020', '#20B020', '#20D0D0', '#2050E0', '#8030E0', '#E020C0'].map((h, k) => hex(k / 8, h)) },
  'sheet.bed.two': { kind: 'smooth', from: 'assumed', stops: [role(0, 'heat.4'), role(1, 'heat.dark')] },
  'sheet.sparks': { kind: 'smooth', from: 'assumed', stops: [role(0, 'white'), role(0.15, 'heat.4'), role(0.4, 'heat.3'), role(0.65, 'heat.1'), role(0.85, 'heat.dark'), role(1, 'heat.deep', 0)] },
  'sheet.team': { kind: 'smooth', from: 'assumed', stops: [role(0, 'white'), role(0.3, 'glow.hot'), role(0.65, 'team'), role(1, 'team.dark', 0)] },
  'sheet.image': { kind: 'smooth', from: 'assumed', stops: [role(0, 'heat.4'), role(0.35, 'heat.1'), role(0.7, 'smoke', 0.8), role(1, 'smoke', 0)] },
};

const molotov = JSON.parse(readFileSync(join(repo, 'examples', 'demo-project', 'effects', 'board_molotov.vfx.json'), 'utf8'));
const layer = (id) => structuredClone(molotov.layers.find((l) => l.id === id));
const effect = (id, name, phases, layers) => ({ format: 'shamble-vfx', version: 5, id, name, controls: { ...molotov.controls }, phases, layers });
const grad = (l, g) => { if (!g) return l; if (l.type === 'shape') l.shape.gradient = g; else l.gradient = g; return l; };

const smoke = (g, edit) => {
  const l = layer('smoke');
  Object.assign(l, { start: { ms: 0 }, shiftM: [-0.4, -0.3], durationMs: 2400 });
  delete l.untilPhaseEnd;
  Object.assign(l.shape, { radiusM: 0.8, riseM: 0.9, driftM: [0.6, 0], loop: { count: 3, lifeMs: 1600 } });
  edit?.(l);
  return grad(l, g);
};
const bedPair = (g) => ['bed', 'bed_detail'].map((id) => grad(layer(id), g));
const sparks = (g, edit) => {
  const l = layer('spikes');
  Object.assign(l, {
    id: 'sparks', name: 'Sparks', count: 14, lifeMs: [500, 900], speedMps: [1.5, 3], direction: 'out', spreadDeg: 180, startRadiusM: [0.1, 0.25],
    gravityMps2: 2, drag: 2, sizeM: [0.07, 0.1], sizeOverLife: [[0, 1], [1, 0.6]], seed: 3, shiftM: [0, 0.2],
    look: { kind: 'spark', role: 'heat.3', inkPx: 1.6, edge: 'enemy' }, streak: { role: 'heat.4', lengthM: 0.35, widthPx: 3 },
  });
  delete l.untilPhaseEnd;
  edit?.(l);
  return grad(l, g);
};
const stars = (g) => {
  const l = sparks(g, (x) => Object.assign(x, {
    id: 'stars', name: 'Hit stars', count: 8, lifeMs: [600, 900], speedMps: [1, 2], gravityMps2: 0, drag: 1.5,
    sizeM: [0.2, 0.3], sizeOverLife: [[0, 0.7], [1, 1.2]], spinDegPerS: [-120, 120], look: { kind: 'image', image: 'hit_star.png', tint: { mode: 'multiply', role: 'heat.2' } },
  }));
  delete l.streak;
  return l;
};

const peak = (ms) => ({ windupMs: 0, peakMs: ms, fadeMs: 0 });
const BED_PHASES = { windupMs: 250, peakMs: 1500, fadeMs: 800 };
const sheets = [
  { file: 'smoke.png', scene: 'board-molotov', zoom: 1, times: [300, 900, 1500, 2100], rows: [
    effect('g_smoke_plain', 'Smoke billows, no gradient', peak(2400), [smoke()]),
    effect('g_smoke_rgb', 'Billows, banded red/green/blue over each life', peak(2400), [smoke('sheet.rgb')]),
    effect('g_smoke_hot', 'Billows, hot to cold, fading to 35 %', peak(2400), [smoke('sheet.smoke.hot')]),
    effect('g_smoke_thin', 'One puff, thinning to 10 %', peak(2400), [smoke('sheet.smoke.thin', (l) => {
      Object.assign(l.shape, { style: 'puff', radiusM: 0.6, rimRole: 'smoke.dark', grow: [0.6, 1.4, 1.3], riseM: 0.8, driftM: [0.5, 0] });
      delete l.shape.loop; delete l.shape.lightRole;
    })]),
  ] },
  { file: 'bed.png', scene: 'board-molotov', zoom: 1, times: [150, 1000, 1950, 2350], rows: [
    effect('g_bed_plain', "The Molotov bed's tones, no gradient", BED_PHASES, bedPair()),
    effect('g_bed_tones', 'Banded: the same tones, edges where the bands are', BED_PHASES, bedPair('sheet.bed.tones')),
    effect('g_bed_rgb', 'Banded red/green/blue: red middle, edges at 0.4 and 0.7', BED_PHASES, bedPair('sheet.rgb')),
    effect('g_bed_bands', 'Banded, five stops (0, 0.2, 0.45, 0.7, 0.88): five bands', BED_PHASES, bedPair('sheet.bed.bands')),
    effect('g_bed_eight', 'Banded, eight stops (0 to 7/8, red in the middle): eight bands', BED_PHASES, bedPair('sheet.bed.eight')),
    effect('g_bed_smooth', "Smooth, five stops (0 to 1 by 0.25): the tones' four bands", BED_PHASES, bedPair('sheet.bed.smooth')),
    effect('g_bed_two', "Smooth, two stops (0 and 1): still the tones' four bands", BED_PHASES, bedPair('sheet.bed.two')),
  ] },
  { file: 'sparks.png', scene: 'board-molotov', zoom: 1.5, times: [60, 250, 450, 700], rows: [
    effect('g_sparks_plain', 'Sparks, no gradient', peak(900), [sparks()]),
    effect('g_sparks_cool', 'Sparks cooling: white, yellow, orange, dark, gone', peak(900), [sparks('sheet.sparks')]),
    effect('g_sparks_rgb', 'Sparks, banded red/green/blue over each life', peak(900), [sparks('sheet.rgb')]),
    effect('g_sparks_loop', 'Looping sparks over a fire area, cooling', peak(2000), [grad(Object.assign(layer('sparks'), { start: { ms: 0 }, durationMs: 2000, count: 18, speedMps: [1, 1.8], areaM: [1.4, 0.3], shiftM: [0, -0.5] }), 'sheet.sparks')]),
    effect('g_sparks_team', "Your team's broken edge, team colours", peak(900), [sparks('sheet.team', (l) => { l.look.edge = 'broken'; })]),
  ] },
  { file: 'image-burst.png', scene: 'board-molotov', zoom: 1.5, times: [60, 250, 450, 700], rows: [
    effect('g_img_plain', 'Image pieces tinted heat.2, no gradient', peak(900), [stars()]),
    effect('g_img_grad', 'Image pieces: hot, orange, smoke, gone', peak(900), [stars('sheet.image')]),
    effect('g_img_rgb', 'Image pieces, banded red/green/blue', peak(900), [stars('sheet.rgb')]),
  ] },
];

rmSync(root, { recursive: true, force: true });
mkdirSync(join(dir, 'effects'), { recursive: true });
mkdirSync(join(dir, 'images'), { recursive: true });
copyFileSync(join(repo, 'examples', 'demo-project', 'images', 'hit_star.png'), join(dir, 'images', 'hit_star.png'));
writeFileSync(join(dir, 'palette.json'), `${JSON.stringify(palette, null, 2)}\n`);
const preview = {};
for (const s of sheets) for (const fx of s.rows) {
  writeFileSync(join(dir, 'effects', `${fx.id}.vfx.json`), `${JSON.stringify(fx, null, 2)}\n`);
  preview[fx.id] = { scene: s.scene };
}
writeFileSync(join(dir, 'project.json'), `${JSON.stringify({ format: 'shamble-vfx-project', version: 2, name: 'Gradient sheets', events: {}, preview }, null, 2)}\n`);

// ---------------------------------------------------------------- the pictures, through the editor's preview
process.env.VFX_PROJECT_ROOTS = root;
const { createServer } = await import('vite');
const { chromium } = await import('playwright');
const server = await createServer({ root: join(repo, 'packages', 'vfx-editor'), configFile: join(repo, 'packages', 'vfx-editor', 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?backend=webgl&frame=1&project=extra1/gradients`);
await page.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
const have = await page.evaluate(() => window.__vfx.app.debugState().effects);

const CW = 560, CH = 400, CX = (1280 - CW) / 2, CY = (720 - CH) / 2;
for (const s of sheets) {
  const rows = [];
  for (const fx of s.rows) {
    if (!have.includes(fx.id)) throw new Error(`the editor did not open ${fx.id}`);
    await page.evaluate(([id, faction]) => { window.__vfxManual = true; return window.__vfx.app.setupForChecks({ effect: id, faction, relation: 'enemy', distance: 1, tier: 'high' }); }, [fx.id, faction]);
    const cells = [];
    for (const t of s.times) {
      await page.evaluate(async ([t, zoom, seed, label, cx, cy]) => {
        const a = window.__vfx.app;
        a.previewForChecks.setCloseZoom(zoom);
        a.previewForChecks.setCloseOn('target');
        a.previewForChecks.setView('close');
        a.previewForChecks.targetMarker.visible = false;
        await a.showAt(t, seed);
        await a.showAt(t, seed);
        document.querySelector('.status')?.classList.remove('show');
        let tag = document.getElementById('sheet-label');
        if (!tag) {
          tag = document.createElement('div');
          tag.id = 'sheet-label';
          tag.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;z-index:99999;font:12px/16px sans-serif;color:#111;background:rgba(255,255,255,0.8);padding:2px 6px;pointer-events:none`;
          document.body.append(tag);
        }
        tag.textContent = label;
      }, [t, s.zoom, seed, `${fx.name} · ${t} ms`, CX, CY]);
      await page.waitForTimeout(40);
      cells.push(PNG.sync.read(await page.screenshot({ clip: { x: CX, y: CY, width: CW, height: CH } })));
    }
    rows.push(cells);
    console.log(`${s.file}: ${fx.id}`);
  }
  const cols = s.times.length;
  const sheet = new PNG({ width: cols * (CW + 6) + 6, height: rows.length * (CH + 6) + 6 });
  sheet.data.fill(255);
  rows.forEach((cells, r) => cells.forEach((c, k) => {
    const ox = 6 + k * (CW + 6), oy = 6 + r * (CH + 6);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const si = (y * CW + x) * 4, di = ((oy + y) * sheet.width + ox + x) * 4;
      sheet.data[di] = c.data[si]; sheet.data[di + 1] = c.data[si + 1]; sheet.data[di + 2] = c.data[si + 2]; sheet.data[di + 3] = 255;
    }
  }));
  const file = join(outDir, faction === 'soviets' ? s.file : s.file.replace('.png', `-${faction}.png`));
  writeFileSync(file, PNG.sync.write(sheet));
  console.log(file);
}
if (errors.length) console.log(`ERRORS: ${errors.join(' | ')}`);
await browser.close();
await server.close();
