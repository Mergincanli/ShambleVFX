// A picture of our block letters, drawn by the real runtime in the comic word style (two tones, the black outline, the
// pushed-back copy): the whole alphabet upright, the new letters close up next to the board's, the alphabet in the comic
// layout, words that use the new letters, and the same words at game size.
//   node tools/letter-sheet.mjs [--faction=soviets]
// It writes a throwaway project into out/letters/project/letters/ (one effect per row, made of word layers), opens it in
// the editor's own preview (the real runtime, the game camera) and saves out/letters/letters.png, and the game-size row
// enlarged 3 times (pixel for pixel) as out/letters/game-size.png. Only the sunlit ground and the words show: the scene's
// soldiers, its band of shade and the target mark are hidden. Nothing is written to projects/ or exports/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, d) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `=${d}`).split('=').slice(1).join('=');
const faction = arg('faction', 'soviets');
const outDir = join(repo, 'out', 'letters');
const root = join(outDir, 'project');
const dir = join(root, 'letters');
const PX_PER_M = 100.7; // px per metre on a 1080p screen at the game camera (drawing board v7)

// ---------------------------------------------------------------- the throwaway project
const LETTERS = JSON.parse(readFileSync(join(repo, 'packages', 'vfx-runtime', 'data', 'letters.json'), 'utf8')).letters;
/** A word's width in px at a letter height, as drawWord lays it out (0.5 between letters, no ramp). */
const widthPx = (text, px) => ([...text].reduce((s, ch) => s + (LETTERS[ch] ? LETTERS[ch].w + 0.5 : 0), 0) - 0.5) * (px / 7);
const UPRIGHT = { slant: 0, turn: 0, bounce: 0, tilt: [0, 0], ramp: 0 };
const COMIC = { slant: 9, turn: 4, bounce: 0.35, tilt: [0, 0], ramp: 0 };

/** One word layer, centred `x`, `y` px (1080p, y up) from the middle of the cell (the target). */
const word = (id, text, px, look, x, y, seed = 1) => ({
  id, name: text, type: 'word', start: { ms: 0 }, timing: { mode: 'steps', perSecond: 12 }, tiers: ['low', 'medium', 'high'],
  at: { input: 'target', offset: [0, 0, 0] }, facing: 'camera', blend: 'normal', durationMs: 2000,
  shiftM: [x / PX_PER_M, y / PX_PER_M],
  words: [{ text }], letterPx: px, colours: { top: 'white', bottom: 'glow', back: 'team.dark' },
  tiltDeg: look.tilt, sizeJitter: 0, ramp: look.ramp, bounce: look.bounce, turnDeg: look.turn, slantDeg: look.slant,
  pop: { scale: 1.15, steps: 2 }, breakSteps: 0, riseM: 0, distance: { curve: [[0, 1]], minPx: 0 }, visibleTo: 'everyone',
  seed, perPlay: false,
});
/** Words side by side on one line, `gap` px apart, centred on x = 0, at height y. */
const line = (prefix, texts, px, look, y, gap, seeds = []) => {
  const ws = texts.map((t) => widthPx(t, px));
  let x = -(ws.reduce((a, b) => a + b, 0) + gap * (texts.length - 1)) / 2;
  return texts.map((t, i) => {
    const l = word(`${prefix}_${i}`, t, px, look, x + ws[i] / 2, y, seeds[i] ?? i + 1);
    x += ws[i] + gap;
    return l;
  });
};
const effect = (id, name, layers) => ({
  format: 'shamble-vfx', version: 5, id, name, controls: { size: 1, intensity: 1, duration: 1, colour: 'heat.2' },
  phases: { windupMs: 0, peakMs: 2000, fadeMs: 0 }, layers,
});

const HALVES = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ!'];
const WORDS = ['JINX', 'QUAKE', 'VROOM', 'ZAP', 'YAK', 'WAX'];
// Each row: one effect, the close-up zoom it is shot at, the cell's size on screen, and its caption.
const rows = [
  { zoom: 3, w: 1560, h: 330, label: 'Upright, as drawn (no slant, turn or bounce). New: J, Q, V, X and Y',
    fx: effect('l_upright', 'Upright', [...line('a', [HALVES[0]], 30, UPRIGHT, 26, 0), ...line('b', [HALVES[1]], 30, UPRIGHT, -26, 0)]) },
  { zoom: 3, w: 1560, h: 230, label: 'Close up: the new letters between the board\'s (I J K, P Q R, U V W X Y Z)',
    fx: effect('l_close', 'Close up', line('c', ['IJK', 'PQR', 'UVWXYZ'], 44, UPRIGHT, 0, 30)) },
  { zoom: 3, w: 1560, h: 330, label: 'The comic layout: slanted 9°, each letter turned up to 4° and up to 0.35 off the line',
    fx: effect('l_comic', 'Comic layout', [...line('d', [HALVES[0]], 30, COMIC, 26, 0, [3]), ...line('e', [HALVES[1]], 30, COMIC, -26, 0, [5])]) },
  { zoom: 2.5, w: 1560, h: 440, label: 'Words with the new letters: tilted 4° to 10°, growing along the word (ramp 0.2)',
    fx: effect('l_words', 'Words', [
      ...line('f', WORDS.slice(0, 3), 40, { ...COMIC, tilt: [4, 10], ramp: 0.2 }, 40, 40, [2, 4, 6]),
      ...line('g', WORDS.slice(3), 40, { ...COMIC, tilt: [-10, -4], ramp: 0.2 }, -42, 40, [8, 10, 12]),
    ]) },
  { zoom: 1, w: 760, h: 150, label: 'At game size (100 %): letters 32, 20 and 16 px tall', small: true,
    fx: effect('l_game', 'Game size', [
      ...line('h', WORDS, 32, COMIC, 36, 22, [2, 4, 6, 8, 10, 12]),
      ...line('i', WORDS, 20, COMIC, -6, 16, [2, 4, 6, 8, 10, 12]),
      ...line('j', WORDS, 16, COMIC, -40, 12, [2, 4, 6, 8, 10, 12]),
    ]) },
];

rmSync(root, { recursive: true, force: true });
mkdirSync(join(dir, 'effects'), { recursive: true });
const preview = {};
for (const r of rows) {
  writeFileSync(join(dir, 'effects', `${r.fx.id}.vfx.json`), `${JSON.stringify(r.fx, null, 2)}\n`);
  preview[r.fx.id] = { scene: 'board-molotov' };
}
writeFileSync(join(dir, 'project.json'), `${JSON.stringify({ format: 'shamble-vfx-project', version: 2, name: 'Letter sheet', events: {}, preview }, null, 2)}\n`);

// ---------------------------------------------------------------- the pictures, through the editor's preview
process.env.VFX_PROJECT_ROOTS = root;
const { createServer } = await import('vite');
const { chromium } = await import('playwright');
const server = await createServer({ root: join(repo, 'packages', 'vfx-editor'), configFile: join(repo, 'packages', 'vfx-editor', 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const VW = 1600, VH = 1000;
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?backend=webgl&frame=1&project=extra1/letters`);
await page.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
const have = await page.evaluate(() => window.__vfx.app.debugState().effects);

const cells = [];
for (const r of rows) {
  if (!have.includes(r.fx.id)) throw new Error(`the editor did not open ${r.fx.id}`);
  await page.evaluate(([id, faction]) => { window.__vfxManual = true; return window.__vfx.app.setupForChecks({ effect: id, faction, relation: 'enemy', distance: 1, tier: 'high' }); }, [r.fx.id, faction]);
  const centre = await page.evaluate(async (zoom) => {
    const a = window.__vfx.app;
    const pv = a.previewForChecks;
    pv.setCloseZoom(zoom);
    pv.setCloseOn('target');
    pv.setView('close');
    // Only the ground and the effect: no soldiers, band of shade, shadows or target mark.
    for (const o of pv.scene3d.children) o.visible = o === pv.vfx.object || o.renderOrder === -20;
    await a.showAt(600, 1);
    await a.showAt(600, 1);
    // Where the target (the middle of the cell) lands on the page.
    const p = pv.target.clone().project(pv.camera);
    const box = document.querySelector('canvas').getBoundingClientRect();
    return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height };
  }, r.zoom);
  const clip = { x: Math.round(centre.x - r.w / 2), y: Math.round(centre.y - r.h / 2), width: r.w, height: r.h };
  if (clip.x < 0 || clip.y < 0 || clip.x + clip.width > VW || clip.y + clip.height > VH) throw new Error(`${r.fx.id}: the cell ${JSON.stringify(clip)} does not fit the page`);
  await page.waitForTimeout(40);
  cells.push({ r, png: PNG.sync.read(await page.screenshot({ clip })) });
  console.log(`${r.fx.id}: ${r.w} x ${r.h} at zoom ${r.zoom}`);
}

// One sheet: the cells under each other, each under its caption (drawn by the page, so no font is needed here).
const captions = [];
for (const { r } of cells) {
  await page.setContent(`<body style="margin:0;background:#fff"><div id="c" style="display:inline-block;font:15px/22px sans-serif;color:#111;padding:6px 8px">${r.label}</div></body>`);
  captions.push(PNG.sync.read(await (await page.$('#c')).screenshot()));
}
const W = Math.max(...cells.map((c) => c.r.w)) + 12;
const H = cells.reduce((s, c, i) => s + captions[i].height + c.r.h + 6, 6);
const sheet = new PNG({ width: W, height: H });
sheet.data.fill(255);
const blit = (img, ox, oy) => {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const s = (y * img.width + x) * 4, d = ((oy + y) * W + ox + x) * 4;
    sheet.data[d] = img.data[s]; sheet.data[d + 1] = img.data[s + 1]; sheet.data[d + 2] = img.data[s + 2]; sheet.data[d + 3] = 255;
  }
};
let y = 6;
cells.forEach((c, i) => {
  blit(captions[i], 6, y);
  y += captions[i].height;
  blit(c.png, 6, y);
  y += c.r.h + 6;
});
mkdirSync(outDir, { recursive: true });
const file = join(outDir, faction === 'soviets' ? 'letters.png' : `letters-${faction}.png`);
writeFileSync(file, PNG.sync.write(sheet));
console.log(file);

// The game-size row again, 3 times larger, pixel for pixel: what a player sees, big enough to judge.
const small = cells.find((c) => c.r.small);
const big = new PNG({ width: small.r.w * 3, height: small.r.h * 3 });
for (let yy = 0; yy < big.height; yy++) for (let xx = 0; xx < big.width; xx++) {
  const s = (Math.floor(yy / 3) * small.r.w + Math.floor(xx / 3)) * 4, d = (yy * big.width + xx) * 4;
  big.data[d] = small.png.data[s]; big.data[d + 1] = small.png.data[s + 1]; big.data[d + 2] = small.png.data[s + 2]; big.data[d + 3] = 255;
}
const bigFile = join(outDir, faction === 'soviets' ? 'game-size.png' : `game-size-${faction}.png`);
writeFileSync(bigFile, PNG.sync.write(big));
console.log(bigFile);
if (errors.length) console.log(`ERRORS: ${errors.join(' | ')}`);
await browser.close();
await server.close();
