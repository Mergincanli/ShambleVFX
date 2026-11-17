// The browser check: one command that proves the editor and the runtime work in a real browser.
//   npm run check:browser
// 1. Builds vfx-runtime alone: it must import only three.js, and hold no checker (zod) and no editor code.
// 2. Starts the editor's dev server, then on WebGPU and on WebGL 2:
//    - the colour check page: white sprites tinted by roles must read back as the exact palette hexes; a sprite
//      centred on the ground keeps its lower half; a sprite behind a wall stays hidden (and shows without the wall);
//      a half-transparent sprite is compared with what Canvas 2D (the drawing board) shows, as a number;
//    - the editor: opens the demo project, pauses at set times (never waits on a running animation), and saves
//      1920 x 1080 screenshots to out/screenshots/.
// 3. On WebGL 2, drives the editor: an edit and its undo, Fire, quality tiers, game events, the cost panel and budgets, the
//    right panel (a layer's settings first and the way back, what draws each layer, a projectile's riders, the colours of
//    the selection), the layer icons, the tooltips and their help texts, Save as into projects/, Export and Import, and the
//    palette profiles Import adds (everything made is deleted again after). Palette profiles go to a temporary folder
//    (VFX_PALETTES_DIR), so the real palettes/ is never touched.
// 4. The game-side test page (packages/vfx-testpage), on WebGPU and on WebGL 2: it loads only vfx-runtime and an export
//    folder and plays effects by event name. Its bundle must hold no checker (zod) and no editor code.
// WebGPU is read back off-screen: this headless browser cannot show a WebGPU canvas, but renders WebGPU fine.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(repo, 'out', 'screenshots');
mkdirSync(shots, { recursive: true });
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const note = (name, detail) => { results.push({ name, pass: true, detail, note: true }); console.log(`NOTE  ${name}  (${detail})`); };

// ---------------------------------------------------------------- 1. the runtime alone
{
  const root = join(repo, 'packages', 'vfx-runtime');
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'silent' });
  const js = readFileSync(join(root, 'dist', 'vfx-runtime.js'), 'utf8');
  const imports = [...js.matchAll(/from ?["']([^"']+)["']/g)].map((m) => m[1]);
  ok('runtime imports only three.js', imports.every((i) => i === 'three/webgpu' || i === 'three/tsl' || i === 'three'), imports.join(', '));
  ok('runtime holds no checker (zod) and no editor code', !/zod|ZodError|vfx-editor|Preview|DevServerStore|History/.test(js));
  note('runtime size', `${(js.length / 1024).toFixed(1)} kB minified`);
}

// ---------------------------------------------------------------- 1b. the test page alone, as built
{
  const root = join(repo, 'packages', 'vfx-testpage');
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'silent' });
  const dir = join(root, 'dist', 'assets');
  const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  ok('test page holds no checker (zod) and no editor code', !/zod|ZodError|vfx-editor|DevServerStore|checkEffect|effectSchema|Preview\b/.test(js));
  note('test page size (three.js included)', `${(js.length / 1024).toFixed(0)} kB minified`);
}

// ---------------------------------------------------------------- 2. the dev server and the browser
// Palette profiles (Import adds one) go to a temporary folder; the real palettes/ must stay as it is.
const realPalettes = join(repo, 'palettes');
const realPalettesBefore = existsSync(realPalettes) ? readdirSync(realPalettes).sort().join() : null;
const checkTmp = mkdtempSync(join(tmpdir(), 'shamble-vfx-check-'));
// Not made yet: the server makes it, with the two default profiles, the first time it is needed (here: at Import).
const checkPalettes = join(checkTmp, 'palettes');
process.env.VFX_PALETTES_DIR = checkPalettes;
const server = await createServer({ root: join(repo, 'packages', 'vfx-editor'), configFile: join(repo, 'packages', 'vfx-editor', 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

const hex = (png, x, y) => { const i = (y * png.width + x) * 4; return '#' + [png.data[i], png.data[i + 1], png.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };
const diff = (a, b) => Math.max(...[1, 3, 5].map((k) => Math.abs(parseInt(a.slice(k, k + 2), 16) - parseInt(b.slice(k, k + 2), 16))));

async function open(url, ready) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // This headless browser draws in software, in one GPU process for all its pages: a page opened while another editor
  // page draws waits for that page's frames. How long the second editor page below took is noted in every run.
  const t0 = Date.now();
  await page.goto(url);
  const loadedMs = Date.now() - t0;
  await page.waitForFunction(ready, null, { timeout: 60000 });
  return { page, errors, loadedMs, readyMs: Date.now() - t0 };
}

let webgpu = true;
for (const backend of ['webgpu', 'webgl']) {
  const q = backend === 'webgl' ? '&backend=webgl' : '';
  // -- colour check page
  const { page, errors } = await open(`${base}/check.html?offscreen=1${q}`, () => window.__check && window.__check.ready);
  const info = await page.evaluate(() => ({ ...window.__check, redraw: undefined }));
  if (info.error) { ok(`[${backend}] colour check page runs`, false, info.error.split('\n')[0]); await page.close(); continue; }
  if (backend === 'webgpu' && info.backend !== 'webgpu') { webgpu = false; note('WebGPU', `not available in this browser; ran on ${info.backend}`); }
  await page.waitForTimeout(300);
  const png = PNG.sync.read(await page.screenshot());
  const label = `${backend}${backend === 'webgpu' && !webgpu ? ' (fell back)' : ''}`;
  for (const p of info.probes) {
    const got = hex(png, p.x, p.y), d = diff(got, p.expect);
    if (p.label.startsWith('half')) note(`[${label}] half-transparent heat.1 over the ground vs Canvas 2D`, `got ${got}, Canvas 2D ${p.expect}, ${d} levels apart: three.js blends in linear light, Canvas 2D in sRGB`);
    else ok(`[${label}] ${p.label}`, d <= 1, `got ${got}, want ${p.expect}`);
  }
  ok(`[${label}] colour check page has no errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();

  // -- the editor, paused at set times
  const ed = await open(`${base}/?offscreen=1${q}&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
  const p = ed.page;
  const startError = await p.evaluate(() => window.__vfx.error);
  ok(`[${label}] editor starts`, !startError, startError || '');
  if (startError) { await p.close(); continue; }
  const shot = async (effect, ms, name, view = 'whole', closeOn = 'target') => {
    await p.evaluate(async ([id, t, v, on]) => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect(id); a.previewForChecks.setCloseOn(on); a.previewForChecks.setView(v); await a.showAt(t, 7); await a.showAt(t, 7); document.querySelector('.status')?.classList.remove('show'); }, [effect, ms, view, closeOn]);
    await p.waitForTimeout(250);
    await p.waitForTimeout(120);
    return PNG.sync.read(await p.screenshot({ path: join(shots, `${name}-${backend}.png`) }));
  };
  const flash = await shot('rifle_shot', 20, 'editor-rifle-flash');
  // The preview must draw: ground colour in it, and the flash's orange near the muzzle.
  const box = await p.evaluate(() => { const r = document.querySelector('.viewport').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  let ground = 0, orange = 0;
  for (let y = Math.round(box.y); y < box.y + box.h; y += 4) for (let x = Math.round(box.x); x < box.x + box.w; x += 4) {
    const c = hex(flash, x, y);
    if (diff(c, '#B8A683') <= 2) ground++;
    if (diff(c, '#F47A1C') <= 3 || diff(c, '#FFB02E') <= 3) orange++;
  }
  ok(`[${label}] editor preview draws the ground`, ground > 1000, `${ground} samples`);
  ok(`[${label}] editor preview draws the muzzle flash`, orange > 10, `${orange} samples of heat.1 / heat.2`);
  // Fade other layers: with a layer selected the other layers fade in the preview (to about a quarter) and the selected
  // one keeps its colours. Counted round the muzzle, where the flash is: its own orange stays with the flash selected, and
  // fades into the ground with the hit spark (at the target) selected. Fade other layers off, the preview is the game's
  // look again, pixel for pixel, with a layer still selected.
  const muzzle = await p.evaluate(() => { const pv = window.__vfx.app.previewForChecks; const r = document.querySelector('.viewport').getBoundingClientRect(); const [x, y] = pv.toCanvas(pv.origin); return { x: Math.round(r.x + x), y: Math.round(r.y + y) }; });
  const orangeNear = (png) => {
    let n = 0;
    for (let y = muzzle.y - 90; y <= muzzle.y + 90; y += 2) for (let x = muzzle.x - 90; x <= muzzle.x + 150; x += 2) { const c = hex(png, x, y); if (diff(c, '#F47A1C') <= 3 || diff(c, '#FFB02E') <= 3) n++; }
    return n;
  };
  const fadeShot = async (layer, fadeOn, name) => {
    await p.evaluate(async ([l, on]) => {
      const a = window.__vfx.app;
      window.__vfxManual = true;
      a.pickEffect('rifle_shot');
      a.previewForChecks.setView('whole');
      a.selectLayer(l);
      const t = document.querySelector('.vbar .fade-toggle');
      if ((t.getAttribute('aria-pressed') === 'true') !== on) t.click();
      await a.showAt(20, 7);
      await a.showAt(20, 7);
      document.querySelector('.status')?.classList.remove('show');
    }, [layer, fadeOn]);
    await p.waitForTimeout(250);
    return PNG.sync.read(await p.screenshot({ path: join(shots, `${name}-${backend}.png`) }));
  };
  const nearNone = orangeNear(flash);
  const nearFlash = orangeNear(await fadeShot('flash', true, 'editor-fade-flash-selected'));
  const nearHit = orangeNear(await fadeShot('hit', true, 'editor-fade-hit-selected'));
  ok(`[${label}] with a layer selected the other layers fade in the preview: the muzzle flash keeps its colours when it is selected, and fades when the hit spark is`,
    nearNone > 10 && nearFlash >= nearNone * 0.9 && nearHit <= nearNone * 0.1, `orange round the muzzle: ${nearNone} with no layer selected, ${nearFlash} with the flash selected, ${nearHit} with the hit spark selected`);
  const fadeOff = await fadeShot('hit', false, 'editor-fade-off');
  let lookChanged = 0, lookSamples = 0;
  for (let y = Math.round(box.y); y < box.y + box.h; y += 2) for (let x = Math.round(box.x); x < box.x + box.w; x += 2) { lookSamples++; if (hex(fadeOff, x, y) !== hex(flash, x, y)) lookChanged++; }
  ok(`[${label}] Fade other layers off: the preview is the game's look, pixel for pixel, with a layer selected`, lookChanged === 0, `${lookChanged} of ${lookSamples} samples differ from the preview with no layer selected`);
  await shot('shell_flight', 300, 'editor-shell-flight');
  await shot('shell_flight', 620, 'editor-shell-landing');
  await shot('rifle_shot', 20, 'closeup-rifle-flash', 'close', 'origin');
  await shot('shell_flight', 640, 'closeup-shell-landing', 'close', 'target');
  ok(`[${label}] editor has no errors`, ed.errors.length === 0, ed.errors.slice(0, 2).join(' | '));
  await p.close();

  // -- the game screen only, at its real size
  const fr = await open(`${base}/?offscreen=1&frame=1${q}&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
  for (const [effect, ms, name] of [['rifle_shot', 20, 'game-rifle-flash'], ['rifle_shot', 60, 'game-rifle-hit'], ['shell_flight', 300, 'game-shell-flight'], ['shell_flight', 620, 'game-shell-landing'], ['shell_flight', 760, 'game-shell-burst']]) {
    await fr.page.evaluate(async ([id, t]) => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect(id); a.previewForChecks.setView('frame'); await a.showAt(t, 7); await a.showAt(t, 7); }, [effect, ms]);
    await fr.page.waitForTimeout(100);
    const img = PNG.sync.read(await fr.page.screenshot({ path: join(shots, `${name}-${backend}.png`) }));
    let g = 0;
    for (let y = 0; y < 1080; y += 8) for (let x = 0; x < 1920; x += 8) if (diff(hex(img, x, y), '#B8A683') <= 2) g++;
    ok(`[${label}] game screen ${name} draws the scene`, g > 5000, `${g} ground samples`);
  }
  await fr.page.close();
}

// ---------------------------------------------------------------- 2b. the board presets look the same on WebGPU as on WebGL 2
// WebGL 2 is the backend the side-by-side comparisons with the drawing board check by eye. Here the same moments are
// drawn on both backends and must match: draw order (sparks over the white frame), added light (the beam's glows),
// light on the ground (screen) and stains (multiply) all go through the WebGPU path too.
if (webgpu) {
  const cases = [
    ['examples/demo-project', 'board_shell', 'board-shell', 600, 'sparks over the white frame'],
    ['examples/demo-project', 'board_shell', 'board-shell', 1300, 'burst, scorch and ring'],
    ['examples/demo-project', 'board_beam', 'board-beam', 1000, 'beam and added glows'],
    ['examples/demo-project', 'board_muzzle', 'board-muzzle', 45, 'flash, tracer and light on the ground'],
    ['examples/demo-project', 'board_molotov', 'board-molotov', 1200, 'fire: bed, tongues, halftone'],
    ['examples/hits-collection', 'hit_burst_star', 'hit-unit', 300, 'a hit: halftone fill, shards, word'],
  ];
  const pages = {};
  const pageFor = async (b, project) => {
    const key = `${b}|${project}`;
    if (!pages[key]) pages[key] = await open(`${base}/?offscreen=1&frame=1${b === 'webgl' ? '&backend=webgl' : ''}&project=${project}`, () => window.__vfx && window.__vfx.ready);
    return pages[key];
  };
  for (const [project, effect, scene, ms, what] of cases) {
    const img = {};
    let box = null;
    for (const b of ['webgpu', 'webgl']) {
      const pg = (await pageFor(b, project)).page;
      box = await pg.evaluate(async ([effect, scene, ms]) => {
        const a = window.__vfx.app;
        window.__vfxManual = true;
        await a.setupForChecks({ effect, scene, faction: 'soviets', relation: 'enemy', distance: 4 });
        a.previewForChecks.setView('frame');
        await a.showAt(ms, 7);
        await a.showAt(ms, 7);
        document.querySelector('.status')?.classList.remove('show');
        const [x, y] = a.previewForChecks.toCanvas(a.previewForChecks.target);
        return { x: Math.round(x), y: Math.round(y) };
      }, [effect, scene, ms]);
      await pg.waitForTimeout(100);
      img[b] = PNG.sync.read(await pg.screenshot({ path: join(shots, `backends-${effect}-${ms}-${b}.png`) }));
    }
    // Compare a box round the target, each image first averaged over 2 x 2 pixels (edges differ a little between the
    // backends; a missing or misplaced shape does not average away).
    const W = img.webgl.width, H = img.webgl.height;
    const x0 = Math.max(0, box.x - 480), x1 = Math.min(W - 2, box.x + 480), y0 = Math.max(0, box.y - 420), y1 = Math.min(H - 2, box.y + 300);
    const avg = (png, x, y, k) => (png.data[(y * W + x) * 4 + k] + png.data[(y * W + x + 1) * 4 + k] + png.data[((y + 1) * W + x) * 4 + k] + png.data[((y + 1) * W + x + 1) * 4 + k]) / 4;
    let off = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      let d = 0;
      for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(avg(img.webgpu, x, y, k) - avg(img.webgl, x, y, k)));
      if (d > 48) off++;
      n++;
    }
    const share = off / n;
    ok(`board preset ${effect} at ${ms} ms looks the same on WebGPU and WebGL 2 (${what})`, share < 0.0015, `${(share * 100).toFixed(3)} % of the box round the target differs`);
  }
  for (const [key, pg] of Object.entries(pages)) {
    ok(`[${key}] presets draw without errors`, pg.errors.length === 0, pg.errors.slice(0, 2).join(' | '));
    await pg.page.close();
  }
}

// ---------------------------------------------------------------- 3. driving the editor (WebGL 2), with the clock running
{
  const { page: p, errors } = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
  p.on('dialog', (d) => d.accept());
  const st = () => p.evaluate(() => window.__vfx.app.debugState());
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // -- an edit, undo, redo
  await p.click('text=Rifle shot (demo)');
  const sizeBox = p.locator('.bigcontrols .row.big').first().locator('input.num');
  await sizeBox.fill('2');
  await sizeBox.press('Enter');
  await p.locator('.timeline').click({ position: { x: 60, y: 8 } });
  const after = await p.evaluate(() => window.__vfx.app.effect().controls.size);
  await p.keyboard.press('Control+z');
  const undone = await p.evaluate(() => window.__vfx.app.effect().controls.size);
  ok('an edit (size 1 -> 2) and its undo', after === 2 && undone === 1, `after ${after}, after undo ${undone}`);
  await p.keyboard.press('Control+Shift+z');
  const redone = await p.evaluate(() => window.__vfx.app.effect().controls.size);
  ok('redo', redone === 2, `after redo ${redone}`);

  // -- the new layer types: a generated field, the add menu, a phase start, a preset
  const L = (id) => p.evaluate((id) => window.__vfx.app.effect().layers.find((l) => l.id === id), id);
  await p.evaluate(() => { const a = window.__vfx.app; a.pickEffect('board_shell'); a.selectLayer('burst'); });
  await p.waitForTimeout(150);
  const radius = p.locator('.inspector label.field', { has: p.locator('.flab', { hasText: /^Radius$/ }) }).locator('input').first();
  await radius.fill('1.5');
  await radius.press('Enter');
  await p.locator('.timeline').click({ position: { x: 60, y: 8 } });
  const r1 = (await L('burst')).shape.radiusM;
  await p.keyboard.press('Control+z');
  const r0 = (await L('burst')).shape.radiusM;
  ok('a shape\'s generated field edits the effect, and undo puts it back', r1 === 1.5 && r0 === 1.1, `radius ${r1}, after undo ${r0}`);
  // The words box: the words as a comma list; a word typed again keeps its chance, a new one gets none.
  await p.evaluate(() => { const a = window.__vfx.app; a.selectLayer('word'); a.editLayer(['words', 1, 'chance'], 30); a.commit(); });
  await p.waitForTimeout(150);
  const wordsBox = () => p.locator('.inspector label.field', { has: p.locator('.flab', { hasText: /^Words \(one picked per play\)$/ }) }).locator('input');
  const shownWords = await wordsBox().inputValue();
  await wordsBox().fill('wham, krakoom, zap');
  await wordsBox().press('Enter');
  await p.locator('.timeline').click({ position: { x: 60, y: 8 } });
  const typedWords = (await L('word')).words;
  await p.keyboard.press('Control+z');
  await p.keyboard.press('Control+z');
  const wordsBack = (await L('word')).words;
  ok('the words box shows the words as a comma list; a word typed again keeps its chance, and undo puts them back',
    shownWords === 'KABOOM, KRAKOOM, BADOOM, WHAM' && JSON.stringify(typedWords) === JSON.stringify([{ text: 'WHAM' }, { text: 'KRAKOOM', chance: 30 }, { text: 'ZAP' }])
      && JSON.stringify(wordsBack) === JSON.stringify([{ text: 'KABOOM' }, { text: 'KRAKOOM' }, { text: 'BADOOM' }, { text: 'WHAM' }]),
    `"${shownWords}" -> ${JSON.stringify(typedWords)}, after two undos ${JSON.stringify(wordsBack)}`);
  // Layers that cannot draw at the moment shown, and why (from the runtime's note on the frame): an image that did not
  // load (in the project, not in the atlas), an image not in the project. A layer the tier leaves out gets no note.
  const notDrawn = await p.evaluate(async () => {
    const a = window.__vfx.app;
    const notes = () => a.layersNotDrawn().map((n) => `${n.layer} ${n.why}: ${n.text}`);
    a.pickEffect('rifle_shot');
    await a.showAt(20);
    const clean = notes();
    const atlas = a.atlas;
    a.previewForChecks.setAtlas({ ...atlas, rects: Object.fromEntries(Object.entries(atlas.rects).filter(([k]) => k !== 'muzzle_flash.png')) });
    await a.showAt(20);
    const notLoaded = notes();
    a.previewForChecks.setAtlas(atlas);
    a.selectLayer('flash');
    a.editLayer(['image'], 'no_such.png');
    a.commit();
    await a.showAt(20);
    const missing = notes();
    a.editLayer(['tiers'], ['high']);
    a.commit();
    a.setTierForChecks('low');
    await a.showAt(20);
    const leftOut = notes();
    a.setTierForChecks('high');
    return { clean, notLoaded, missing, leftOut };
  });
  await p.keyboard.press('Control+z');
  await p.keyboard.press('Control+z');
  const flashBack = await p.evaluate(() => { const l = window.__vfx.app.effect().layers.find((x) => x.id === 'flash'); return `${l.image} ${l.tiers.join(',')}`; });
  ok('layers that cannot draw are named in plain words (an image that did not load, one not in the project); a layer the tier leaves out gets no note',
    notDrawn.clean.length === 0 && notDrawn.notLoaded.join() === 'flash not-loaded: the image muzzle_flash.png did not load'
      && notDrawn.missing.join() === 'flash missing: the image no_such.png is not in the project' && notDrawn.leftOut.length === 0 && flashBack === 'muzzle_flash.png low,medium,high',
    `${JSON.stringify(notDrawn)}; after two undos ${flashBack}`);
  await p.evaluate(() => window.__vfx.app.pickEffect('board_shell'));
  await p.evaluate(() => window.__vfx.app.selectLayer('burst'));
  const before = (await p.evaluate(() => window.__vfx.app.effect().layers.length));
  await p.selectOption('select.add-layer', 'shape:cloud');
  await p.waitForTimeout(150);
  const added = await p.evaluate(() => { const a = window.__vfx.app; return { n: a.effect().layers.length, sel: a.layer()?.type, kind: a.layer()?.shape?.kind }; });
  ok('the add menu adds a shape layer and selects it', added.n === before + 1 && added.sel === 'shape' && added.kind === 'cloud', JSON.stringify(added));
  const starts = p.locator('.inspector label.field', { has: p.locator('.flab', { hasText: /^Starts$/ }) }).locator('select');
  await starts.selectOption('phase:peak');
  const st0 = (await p.evaluate(() => window.__vfx.app.layer().start));
  await p.locator('.inspector label.field', { has: p.locator('.flab', { hasText: /^Delay$/ }) }).locator('input').fill('40');
  await p.locator('.inspector label.field', { has: p.locator('.flab', { hasText: /^Delay$/ }) }).locator('input').press('Enter');
  const st1 = (await p.evaluate(() => window.__vfx.app.layer().start));
  ok('a layer can start with a phase, and keeps it when its delay changes', st0.phase === 'peak' && st1.phase === 'peak' && st1.ms === 40, `${JSON.stringify(st0)} then ${JSON.stringify(st1)}`);
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
  await p.click('text=From preset…');
  await p.waitForSelector('dialog[open] >> text=Heavy: big blast', { timeout: 15000 });
  const nFx = (await st()).effects.length;
  await p.click('dialog[open] >> text=Heavy: big blast');
  await p.waitForTimeout(200);
  const after2 = await p.evaluate(() => { const a = window.__vfx.app; return { n: a.debugState().effects.length, id: a.effect()?.id, scene: a.previewForChecks.scene.id }; });
  ok('New from preset copies a ready-made effect in, with its scene', after2.n === nFx + 1 && after2.id === 'hit_heavy_blast' && after2.scene === 'hit-ground', JSON.stringify(after2));
  await p.keyboard.press('Control+z');

  // -- the transport, on the tank shell (about 1 s long)
  await p.click('text=Tank shell flight (demo)');
  await p.click('.transport .play');
  // Real time in a headless browser comes in uneven frames (the first ones compile shaders), so wait for the clock
  // to move rather than for a fixed time.
  await p.waitForFunction(() => window.__vfx.app.debugState().mainTime > 50, null, { timeout: 3000 }).catch(() => {});
  let s1 = await st();
  ok('Play (mouse) moves the time', s1.playing && s1.mainTime > 50, `playing ${s1.playing}, ${s1.mainTime.toFixed(0)} ms`);
  await p.keyboard.press(' ');
  s1 = await st();
  await p.waitForTimeout(250);
  const s2 = await st();
  ok('Space after a mouse click on Play pauses once (not twice)', !s1.playing && !s2.playing, `playing ${s1.playing} then ${s2.playing}`);
  ok('Pause holds the time', s1.mainTime === s2.mainTime, `${s1.mainTime.toFixed(1)} -> ${s2.mainTime.toFixed(1)} ms`);
  await p.keyboard.press('ArrowRight');
  const s3 = await st();
  const stepMs = 1000 / 12;
  ok('→ steps to the next 1/12 s', near(s3.mainTime, (Math.round(s2.mainTime / stepMs) + 1) * stepMs, 0.01), `${s2.mainTime.toFixed(1)} -> ${s3.mainTime.toFixed(1)} ms`);
  await p.keyboard.press('ArrowLeft');
  const s4 = await st();
  ok('← steps back', near(s4.mainTime, s3.mainTime - stepMs, 0.01), `${s3.mainTime.toFixed(1)} -> ${s4.mainTime.toFixed(1)} ms`);
  // A timeline drag scrubs and pauses.
  const ruler = await p.locator('.tl-ruler').boundingBox();
  await p.mouse.move(ruler.x + ruler.width * 0.2, ruler.y + 10);
  await p.mouse.down();
  await p.mouse.move(ruler.x + ruler.width * 0.5, ruler.y + 10, { steps: 6 });
  const mid = await st();
  await p.mouse.up();
  const span = await p.evaluate(() => Math.max(400, Math.ceil((window.__vfx.app.timeline().lengthMs * 1.08) / 100) * 100));
  ok('a timeline drag scrubs (and pauses)', !mid.playing && near(mid.mainTime, span * 0.5, span * 0.02), `${mid.mainTime.toFixed(0)} ms of ${span}`);
  // ¼ speed: a quarter of the real time passes on the effect's clock (driven with explicit frame times, so a slow
  // headless browser does not change the answer).
  await p.click('.transport >> text=¼×');
  await p.evaluate(async () => { const a = window.__vfx.app; await a.showAt(0, 1); });
  await p.keyboard.press(' ');
  await p.evaluate(() => window.__vfx.app.tickForChecks(600));
  const q = await st();
  ok('¼× runs the clock at a quarter of real time', near(q.mainTime, 150, 1), `${q.mainTime.toFixed(1)} ms after 600 ms of real time`);
  await p.keyboard.press(' ');
  await p.evaluate(() => window.__vfx.app.resumeForChecks());
  await p.click('.transport >> text=1×');
  // Fire, then a step while the fired effect plays.
  await p.keyboard.press('f');
  await p.waitForTimeout(120);
  const fired = await st();
  ok('Fire starts the effect from the stand-in to the target', fired.playingCount === 1 && fired.playing, `${fired.playingCount} playing`);
  await p.keyboard.press('ArrowRight');
  const afterFire = await st();
  ok('→ while a fired effect plays steps from the start', Number.isFinite(afterFire.mainTime) && near(afterFire.mainTime, stepMs, 0.01) && !afterFire.playing, `${afterFire.mainTime} ms`);

  // -- dragging the target keeps it under the cursor, in every view
  for (const view of ['Whole screen', 'Game size', 'Close-up']) {
    await p.click(`.vbar >> text=${view}`);
    await p.waitForTimeout(100);
    const where = () => p.evaluate(() => { const pv = window.__vfx.app.previewForChecks; const r = document.querySelector('.viewport').getBoundingClientRect(); const [x, y] = pv.toCanvas(pv.target); return [r.x + x, r.y + y]; });
    const [tx, ty] = await where();
    await p.mouse.move(tx, ty);
    await p.mouse.down();
    const gx = tx - 140, gy = ty + 70;
    await p.mouse.move(gx, gy, { steps: 12 });
    const [nx, ny] = await where();
    await p.mouse.up();
    ok(`[${view}] dragging the target keeps it under the cursor`, near(nx, gx, 3) && near(ny, gy, 3), `cursor ${gx.toFixed(0)},${gy.toFixed(0)}; target ${nx.toFixed(0)},${ny.toFixed(0)}`);
  }
  await p.click('.vbar >> text=Whole screen');

  // -- quality tiers: the preview draws only the chosen tier; layers it leaves out fade in the list
  const tierInfo = await p.evaluate(async () => {
    const a = window.__vfx.app;
    window.__vfxManual = true;
    await a.setupForChecks({ effect: 'board_molotov', scene: 'board-molotov', tier: 'low' });
    await a.showAt(1200, 7);
    const lowTris = a.previewForChecks.vfx.stats.triangles;
    const faded = document.querySelectorAll('.layers-list .layer-item.off').length;
    const expected = a.effect().layers.filter((l) => l.type !== 'projectile' && !l.tiers.includes('low')).length;
    a.setTierForChecks('high');
    await a.showAt(1200, 7);
    const highTris = a.previewForChecks.vfx.stats.triangles;
    const fadedHigh = document.querySelectorAll('.layers-list .layer-item.off').length;
    window.__vfxManual = false;
    a.resumeForChecks();
    return { lowTris, highTris, faded, expected, fadedHigh };
  });
  ok('the Low tier leaves out the layers not in it, and fades them in the list', tierInfo.lowTris < tierInfo.highTris && tierInfo.faded === tierInfo.expected && tierInfo.faded > 0 && tierInfo.fadedHigh === 1,
    `${tierInfo.lowTris} triangles in Low, ${tierInfo.highTris} in High; ${tierInfo.faded} layers faded in Low (want ${tierInfo.expected}), ${tierInfo.fadedHigh} in High (the Low-only flames)`);
  // "Shows in": a layer in one tier cannot lose it; ticking a box edits the layer, and undo puts it back.
  await p.evaluate(() => window.__vfx.app.selectLayer('flames_low'));
  await p.waitForTimeout(100);
  const onlyLow = await p.evaluate(() => [...document.querySelectorAll('.tier-boxes input')].map((b) => ({ on: b.checked, off: b.disabled })));
  ok('"Shows in" keeps the last tier: a Low-only layer cannot lose Low', onlyLow[0].on && onlyLow[0].off && !onlyLow[1].on && !onlyLow[2].on, JSON.stringify(onlyLow));
  await p.evaluate(() => window.__vfx.app.selectLayer('flames'));
  await p.waitForTimeout(100);
  await p.locator('.tier-boxes input').first().check();
  const ticked = await p.evaluate(() => window.__vfx.app.layer().tiers.join(','));
  await p.keyboard.press('Control+z');
  const untouched = await p.evaluate(() => window.__vfx.app.layer().tiers.join(','));
  ok('ticking Low adds the tier to the layer, and undo takes it away', ticked === 'low,medium,high' && untouched === 'medium,high', `${ticked}, after undo ${untouched}`);

  // -- game events: checked as typed
  await p.evaluate(() => window.__vfx.app.pickEffect('board_shell'));
  await p.waitForTimeout(100);
  const events = p.locator('.events input');
  await events.fill('tank.shot, rifle.shot');
  const clash = await p.locator('.event-problems').innerText();
  await events.fill('tank.shot, tank.shell.check');
  await events.press('Tab');
  const clean = await p.locator('.event-problems').innerText();
  ok('an event another effect answers is named as you type', /"rifle\.shot" is already answered by "Rifle shot \(board\)"/.test(clash) && clean.trim() === '', clash.replace(/\n/g, ' | '));

  // -- the cost panel: the same counts on every press, milliseconds measured; a budget colours its cell
  const cost = await p.evaluate(async () => {
    const a = window.__vfx.app;
    const strip = (r) => Object.fromEntries(Object.entries(r.tiers).map(([t, c]) => [t, { draws: c.draws, sprites: c.sprites, triangles: c.triangles, area: c.area, overlap: c.areaWithOverlap }]));
    const r1 = await a.measureForChecks();
    const r2 = await a.measureForChecks();
    return { one: strip(r1), two: strip(r2), ms: Object.fromEntries(Object.entries(r2.tiers).map(([t, c]) => [t, c.ms])), frames: r2.frames, clock: r2.clockStepMs };
  });
  ok('the cost panel gives the same counts and area on every press', JSON.stringify(cost.one) === JSON.stringify(cost.two) && cost.one.high.triangles > 0 && cost.frames > 0, JSON.stringify(cost.one.high));
  ok('the cost panel measures milliseconds in every tier', Object.values(cost.ms).every((m) => Number.isFinite(m.avg) && m.avg > 0 && m.worst >= m.p95 && m.p95 > 0), Object.entries(cost.ms).map(([t, m]) => `${t} ${m.avg.toFixed(2)}/${m.p95.toFixed(2)}/${m.worst.toFixed(2)}`).join(', '));
  note('tank shell (board) cost', ['low', 'medium', 'high'].map((t) => `${t}: ${cost.one[t].draws} draws, ${cost.one[t].sprites} sprites, ${cost.one[t].triangles} triangles, ${(cost.one[t].area * 100).toFixed(1)} % of the screen`).join('; ') + `; clock step ${cost.clock} ms`);
  // The cost is measured with its own renderer: the layers the preview fades (a layer selected, Fade other layers on) count
  // in full, so the counts and the area are the same.
  const costFaded = await p.evaluate(async () => {
    const a = window.__vfx.app;
    a.selectLayer('burst');
    const on = document.querySelector('.vbar .fade-toggle')?.getAttribute('aria-pressed');
    const r = await a.measureForChecks();
    a.selectLayer(null);
    return { on, tiers: Object.fromEntries(Object.entries(r.tiers).map(([t, c]) => [t, { draws: c.draws, sprites: c.sprites, triangles: c.triangles, area: c.area, overlap: c.areaWithOverlap }])) };
  });
  ok('the cost measurement does not see the fade: with a layer selected and Fade other layers on, the same counts and area', costFaded.on === 'true' && JSON.stringify(costFaded.tiers) === JSON.stringify(cost.one),
    JSON.stringify(costFaded.tiers.high));
  const budget = p.locator('table.cost input.budget').nth(2); // draws, High
  const levelBefore = await p.locator('.costcard .cost-level').innerText();
  await budget.fill('1');
  await budget.press('Enter');
  await p.waitForTimeout(100);
  const over = await p.evaluate(() => document.querySelectorAll('table.cost td.over').length);
  ok('a typed budget colours the cell when the effect goes over it', over === 1, `${over} cell(s) over`);
  // The boxes are the project's budgets: a typed number switches them on, and the card's hint line says they count.
  const levelAfter = await p.locator('.costcard .cost-level').innerText();
  const projectBudgets = await p.evaluate(() => window.__vfx.app.budgets().project);
  ok('a typed budget switches on the project\'s budgets, and the card says they count', levelBefore.trim() === 'No budgets are on. Type a number to switch on the project\'s budgets.'
    && levelAfter.trim() === 'The project\'s budgets count for this effect.' && projectBudgets.on === true && projectBudgets.limits.high?.draws === 1, `"${levelBefore.trim()}" -> "${levelAfter.trim()}"`);
  await p.screenshot({ path: join(shots, 'editor-cost-panel.png') });

  // -- the right panel shows what is selected. A layer: its settings first, under a header with the effect's name (back to
  // the effect's settings, as Esc is), "›", its icon and name; Cost and Checks stay under it. Every layer says what draws
  // it; a projectile, which draws nothing, lists the layers riding it, and they say so in the Layers list.
  const layerInfo = await server.ssrLoadModule('/src/doc/layer-info.ts');
  const layerRow = (name) => p.locator('.layers-list .layer-item', { has: p.locator(':scope > span', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) });
  const panel = () => p.evaluate(() => {
    const ins = document.querySelector('.inspector');
    const head = ins.querySelector(':scope > .insp-head');
    const card = ins.querySelector(':scope > section.card.layer');
    const top = ins.getBoundingClientRect().top;
    return {
      layer: window.__vfx.app.layer()?.id ?? null, first: ins.firstElementChild?.className ?? '',
      link: head?.querySelector('.crumb')?.textContent ?? null, title: head?.querySelector('.insp-title')?.textContent ?? null,
      icon: !!head?.querySelector('svg, img'), headH: head ? Math.round(head.getBoundingClientRect().height) : null,
      cardTop: card ? Math.round(card.getBoundingClientRect().top - top) : null, effectSettings: !!ins.querySelector('.bigcontrols'),
      draws: card?.querySelector(':scope > .draws')?.textContent ?? null, drawsFile: card?.querySelector(':scope > .draws code')?.textContent ?? null,
      costAndChecks: [...ins.children].slice(-2).map((c) => c.classList.contains('costcard') ? 'cost' : c.classList.contains('checks') ? 'checks' : c.className).join(),
    };
  });
  await p.evaluate(() => window.__vfx.app.pickEffect('rifle_shot'));
  await layerRow('Muzzle flash').click();
  const sel = await panel();
  ok('a layer\'s settings come first, under a header: the effect\'s name, "›", the layer\'s icon and name; the effect\'s settings are not shown, Cost and Checks stay at the bottom',
    sel.layer === 'flash' && sel.first === 'insp-head' && sel.link === 'Rifle shot (demo)' && sel.title === 'Muzzle flash' && sel.icon && sel.cardTop === sel.headH
      && !sel.effectSettings && sel.costAndChecks === 'cost,checks', JSON.stringify(sel));
  await p.locator('.inspector .insp-head .crumb').click();
  const back = await panel();
  ok('clicking the effect\'s name in the header goes back to the effect\'s settings', back.layer === null && back.effectSettings && back.first.includes('bigcontrols') && back.link === null
    && back.costAndChecks === 'cost,checks', JSON.stringify(back));
  await layerRow('Hit spark').click();
  await p.locator('.inspector label.field', { has: p.locator('.flab', { hasText: /^Layer name$/ }) }).locator('input').focus();
  await p.keyboard.press('Escape');
  const whileTyping = await panel();
  // A checkbox just clicked keeps the focus; that is not typing, so Esc leaves the layer from there (Show all, on and off).
  const showAllBox = p.locator('.inspector .fold-actions label.show-all input');
  await showAllBox.click();
  await showAllBox.click();
  const fromBox = await p.evaluate(() => document.activeElement?.matches('.show-all input') ?? false);
  await p.keyboard.press('Escape');
  const escapedFromBox = await panel();
  // And from the Layers list, where a click on a row leaves the focus.
  await layerRow('Hit spark').click();
  await p.keyboard.press('Escape');
  const escaped = await panel();
  ok('Esc goes back to the effect\'s settings (from a checkbox just clicked in the panel, or from the Layers list), but not while typing in a field',
    whileTyping.layer === 'hit' && fromBox && escapedFromBox.layer === null && escapedFromBox.effectSettings && escaped.layer === null && escaped.effectSettings,
    `while typing: ${whileTyping.layer}; after Esc on a checkbox (focused: ${fromBox}): ${escapedFromBox.layer}; after Esc from the list: ${escaped.layer}`);
  // What draws each layer: an image (its file, in Plex Mono), or code; a projectile draws nothing.
  const drawn = await p.evaluate(() => {
    const a = window.__vfx.app; const out = {};
    a.pickEffect('board_shell');
    for (const id of ['burst', 'word', 'debris', 'shell']) { a.selectLayer(id); out[id] = document.querySelector('.inspector .draws')?.textContent; }
    a.selectLayer(null);
    return out;
  });
  ok('every layer\'s panel says what draws it: "Image: <file>" or "Drawn in code, no image"; a projectile is an invisible path', sel.draws === 'Image: muzzle_flash.png' && sel.drawsFile === 'muzzle_flash.png'
    && drawn.burst === 'Drawn in code, no image' && drawn.word === 'Drawn in code, no image' && drawn.debris === 'Drawn in code, no image' && drawn.shell === 'An invisible path: it draws nothing itself',
    JSON.stringify({ flash: sel.draws, ...drawn }));
  // A projectile lists its riders: a button each, which selects it, and what draws it.
  await p.evaluate(() => window.__vfx.app.pickEffect('rifle_shot'));
  await layerRow('Bullet').click();
  const riders = await p.evaluate(() => [...document.querySelectorAll('.inspector .rider')].map((r) => `${r.querySelector('.rider-name')?.textContent} | ${r.querySelector('.rider-what')?.textContent} | ${r.querySelector('.rider-what code')?.textContent}`));
  await p.locator('.inspector .rider', { has: p.locator('.rider-name', { hasText: /^Tracer$/ }) }).click();
  const riderPicked = await panel();
  ok('a projectile\'s panel lists the layers riding it, each with what draws it, and a click selects one',
    riders.join(' / ') === 'Tracer core | Sprite, image: tracer_core.png | tracer_core.png / Tracer | Sprite, image: tracer_body.png | tracer_body.png' && riderPicked.layer === 'tracer' && riderPicked.title === 'Tracer',
    `${riders.join(' / ')}; then ${riderPicked.layer}`);
  const tags = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.layers-list .layer-item')].map((b) => [b.querySelector(':scope > span').textContent,
    `${b.querySelector('code').textContent} (${getComputedStyle(b.querySelector('code')).fontFamily.split(',')[0].replace(/"/g, '')})`])));
  ok('layers that ride a projectile have a "rides <projectile>" tag in the Layers list, in Plex Sans; the others keep their tags',
    tags['Tracer'] === 'rides Bullet (IBM Plex Sans)' && tags['Tracer core'] === 'rides Bullet (IBM Plex Sans)' && tags['Muzzle flash'] === 'muzzle_flash (IBM Plex Mono)' && tags['Bullet'] === '800 m/s (IBM Plex Sans)',
    JSON.stringify(tags));

  // -- one icon per kind of layer (src/app/layer-icons.ts), in the Layers list, the timeline's names column, the panel's
  // header and a projectile's riders. A sprite whose image is loaded shows that image (its first frame) instead.
  const glyphs = await p.evaluate(() => {
    const a = window.__vfx.app;
    // The icon's name (icon icon-<name>), or "img" for a picture.
    const glyphOf = (el) => { const g = el?.querySelector(':scope > svg, :scope > img'); return !g ? null : g.tagName === 'IMG' ? 'img' : (g.getAttribute('class') ?? '').replace('icon icon-', ''); };
    const row = (name) => [...document.querySelectorAll('.layers-list .layer-item')].find((b) => b.querySelector(':scope > span')?.textContent === name);
    const tlName = (name) => [...document.querySelectorAll('.timeline .tl-name')].find((b) => b.querySelector(':scope > span')?.textContent === name);
    const out = {};
    a.pickEffect('board_shell');
    for (const name of ['Ring on the ground', 'Debris', 'Speed lines', 'Firing word', 'Shell', 'Sparks']) out[name] = glyphOf(row(name));
    out['timeline: Ring on the ground'] = glyphOf(tlName('Ring on the ground'));
    a.selectLayer('ring');
    out['header: ring'] = glyphOf(document.querySelector('.inspector .insp-head'));
    // A sprite: its own image in the list, the timeline, the header and its projectile's riders; the image's url is the one
    // the editor loaded for the atlas.
    a.pickEffect('rifle_shot');
    const own = (el, image) => { const g = el?.querySelector(':scope > img.layer-thumb'); return !!g && g.getAttribute('src') === a.imageUrl(image) && g.getBoundingClientRect().width === 16; };
    out.spriteRow = own(row('Muzzle flash'), 'muzzle_flash.png');
    out.spriteTimeline = own(tlName('Muzzle flash'), 'muzzle_flash.png');
    out.flipbookFirstFrame = getComputedStyle(row('Muzzle flash').querySelector('img')).getPropertyValue('object-view-box');
    a.selectLayer('flash');
    out.spriteHeader = own(document.querySelector('.inspector .insp-head'), 'muzzle_flash.png');
    a.selectLayer('bullet');
    out.riders = [...document.querySelectorAll('.inspector .rider')].map((r) => own(r, r.querySelector('.rider-name').textContent === 'Tracer' ? 'tracer_body.png' : 'tracer_core.png'));
    out.bulletRow = glyphOf(row('Bullet'));
    // An image that is not in the project: the image icon, not a broken picture. The header follows without a rebuild.
    a.selectLayer('flash');
    a.editLayer(['image'], 'no_such.png');
    a.commit();
    out.missingRow = glyphOf(row('Muzzle flash'));
    out.missingHeader = glyphOf(document.querySelector('.inspector .insp-head'));
    return out;
  });
  await p.keyboard.press('Control+z');
  // An image burst: the image icon, and its tag ("9 × image") is a count, so it stays Plex Sans. Then back with undo.
  const imageBurst = await p.evaluate(() => {
    const a = window.__vfx.app;
    a.pickEffect('board_shell');
    a.selectLayer('debris');
    a.replaceLayer({ ...a.layer(), look: { kind: 'image', image: 'muzzle_flash.png', tint: { mode: 'keep' } } }, 'Look');
    a.commit();
    const b = [...document.querySelectorAll('.layers-list .layer-item')].find((x) => x.querySelector(':scope > span')?.textContent === 'Debris');
    const head = document.querySelector('.inspector .insp-head > svg');
    return { icon: b.querySelector(':scope > svg')?.getAttribute('class'), header: head?.getAttribute('class'), tag: b.querySelector('code').textContent,
      font: getComputedStyle(b.querySelector('code')).fontFamily.split(',')[0].replace(/"/g, '') };
  });
  await p.keyboard.press('Control+z');
  const debrisBack = await p.evaluate(() => window.__vfx.app.effect().layers.find((l) => l.id === 'debris').look.kind);
  ok('every kind of layer has its own icon in the Layers list, on the timeline and in the panel\'s header (a ring shows the ring)',
    glyphs['Ring on the ground'] === 'shape-ring' && glyphs['timeline: Ring on the ground'] === 'shape-ring' && glyphs['header: ring'] === 'shape-ring' && glyphs['Debris'] === 'burst-chip'
      && glyphs['Speed lines'] === 'shape-lines' && glyphs['Firing word'] === 'word' && glyphs['Shell'] === 'projectile' && glyphs['Sparks'] === 'burst-diamond' && glyphs.bulletRow === 'projectile',
    JSON.stringify(glyphs));
  ok('a sprite shows its own image (the first frame of a flipbook) in the list, on the timeline, in the header and among its projectile\'s riders; a missing image shows the image icon',
    glyphs.spriteRow && glyphs.spriteTimeline && glyphs.spriteHeader && glyphs.riders.length === 2 && glyphs.riders.every(Boolean) && /^inset\(0(px)? 50% 50% 0(px)?\)$/.test(glyphs.flipbookFirstFrame.trim())
      && glyphs.missingRow === 'sprite' && glyphs.missingHeader === 'sprite', JSON.stringify(glyphs));
  ok('an image burst shows the image icon, and its tag (a count) stays in Plex Sans; only a sprite\'s image name is Plex Mono',
    imageBurst.icon === 'icon icon-sprite' && imageBurst.header === 'icon icon-sprite' && /^\d+ × image$/.test(imageBurst.tag) && imageBurst.font === 'IBM Plex Sans' && debrisBack === 'chip',
    `${JSON.stringify(imageBurst)}; after undo the look is ${debrisBack}`);
  // A sprite whose frame is more than four times as wide as it is tall (the tracers' 512 × 48) fills its icon with a slice
  // from its middle, where fitted in whole it would be a line about a pixel thick; a square frame (the muzzle flash's, the
  // top left cell of its flipbook) is fitted in whole. In the Layers list and among the Bullet's riders.
  await p.evaluate(() => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); a.selectLayer('bullet'); });
  const thumbFit = await p.waitForFunction(() => {
    const fitOf = (img) => (img?.dataset.fit ? `${img.dataset.fit} ${getComputedStyle(img).objectFit}` : null);
    const row = (name) => [...document.querySelectorAll('.layers-list .layer-item')].find((b) => b.querySelector(':scope > span')?.textContent === name)
      ?.querySelector(':scope > img.layer-thumb');
    const rider = (name) => [...document.querySelectorAll('.inspector .rider')].find((r) => r.querySelector('.rider-name')?.textContent === name)
      ?.querySelector(':scope > img.layer-thumb');
    const r = { tracer: fitOf(row('Tracer')), core: fitOf(row('Tracer core')), flash: fitOf(row('Muzzle flash')), riderTracer: fitOf(rider('Tracer')) };
    return Object.values(r).every(Boolean) ? r : null;
  }, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
  ok('a sprite whose frame is more than four times as wide as it is tall (a tracer) fills its icon with a slice from its middle; a square frame is fitted in whole',
    !!thumbFit && thumbFit.tracer === 'slice cover' && thumbFit.core === 'slice cover' && thumbFit.riderTracer === 'slice cover' && thumbFit.flash === 'whole contain',
    JSON.stringify(thumbFit));

  // -- Fade other layers, read where the preview's colours are made: the runtime's own buffers, vertex by vertex, as they
  // go to the GPU. The layer in focus keeps its colours; every other vertex fades to a quarter, by its blend group (normal:
  // its alpha; added light: its colour; stains (multiply) and light on the ground (screen): their alpha).
  const fadeHelp = (await server.ssrLoadModule('/src/app/help.ts')).helpFor('Fade other layers', { section: 'Preview bar' });
  const fadeToggle = () => p.evaluate(() => {
    const b = document.querySelector('.vbar .fade-toggle');
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent-ink)';
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    // Its tooltip, as it would show (its name, then its help text).
    return { label: b?.getAttribute('aria-label'), tip: b ? window.__vfx.app.tipForChecks(b) : null, pressed: b?.getAttribute('aria-pressed'), stored: localStorage.getItem('vfx-fade'), icon: !!b?.querySelector('svg.icon'),
      yellow: !!b && getComputedStyle(b.querySelector('svg')).color === accent };
  });
  const toggleOn = await fadeToggle();
  await p.locator('.vbar .fade-toggle').click();
  const toggleOff = await fadeToggle();
  await p.locator('.vbar .fade-toggle').click();
  const toggleBack = await fadeToggle();
  ok('Fade other layers is an icon toggle in the bar above the preview, on at first (its icon in the accent, as an active toggle), remembered as vfx-fade',
    toggleOn.label === 'Fade other layers' && toggleOn.tip?.lines[0] === 'Fade other layers' && toggleOn.tip?.lines[1] === fadeHelp && toggleOn.icon && toggleOn.pressed === 'true' && toggleOn.stored === null && toggleOn.yellow
      && toggleOff.pressed === 'false' && toggleOff.stored === '0' && !toggleOff.yellow && toggleBack.pressed === 'true' && toggleBack.stored === '1' && toggleBack.yellow,
    JSON.stringify({ on: toggleOn, off: toggleOff, back: toggleBack }));
  const sinkAt = (effect, ms, layer) => p.evaluate(async ([effect, ms, layer]) => {
    const a = window.__vfx.app;
    window.__vfxManual = true;
    if (a.effect()?.id !== effect) a.pickEffect(effect);
    a.selectLayer(layer);
    await a.showAt(ms, 7);
    const ids = a.effect().layers.map((l) => l.id);
    const groups = Object.fromEntries(Object.entries(a.previewForChecks.vfx.sink.groups).map(([g, b]) => [g, { col: Array.from(b.col.subarray(0, b.vcount * 4)), layer: Array.from(b.layer.subarray(0, b.vcount)) }]));
    return { ids, groups };
  }, [effect, ms, layer]);
  /** How the preview's vertices changed from `before` (no layer in focus) to `after`, with the layers `keep` in focus. */
  const fadeChanges = (before, after, keep) => {
    const k = keep.map((id) => before.ids.indexOf(id));
    const out = { kept: 0, normal: 0, light: 0, multiply: 0, screen: 0, wrong: 0, first: '' };
    for (const g of Object.keys(before.groups)) {
      const a = before.groups[g], b = after.groups[g];
      if (a.layer.join() !== b.layer.join()) { out.wrong++; out.first ||= `${g}: not the same vertices`; continue; }
      for (let v = 0; v < a.layer.length; v++) {
        const [r, gg, bb, al] = a.col.slice(v * 4, v * 4 + 4);
        let want;
        if (k.includes(a.layer[v])) { want = [r, gg, bb, al]; out.kept++; }
        else if ((g === 'ground' || g === 'top') && al < 0) { want = [r / 4, gg / 4, bb / 4, al]; out.light++; }
        else { want = [r, gg, bb, al / 4]; out[g === 'ground-multiply' ? 'multiply' : g === 'ground-screen' ? 'screen' : 'normal']++; }
        const got = b.col.slice(v * 4, v * 4 + 4);
        if (want.some((x, i) => Math.fround(x) !== got[i])) { out.wrong++; out.first ||= `${g} vertex ${v}: ${got.join(',')}, want ${want.join(',')}`; }
      }
    }
    return out;
  };
  const show = (c) => `kept ${c.kept}, faded ${c.normal} normal, ${c.light} added light, ${c.multiply} multiply, ${c.screen} screen${c.wrong ? `; ${c.wrong} wrong, first: ${c.first}` : ''}`;
  const beamNone = await sinkAt('board_beam', 1000, null);
  const beamCore = fadeChanges(beamNone, await sinkAt('board_beam', 1000, 'beam_core'), ['beam_core']);
  const shellNone = await sinkAt('board_shell', 1300, null);
  const shellBurst = fadeChanges(shellNone, await sinkAt('board_shell', 1300, 'burst'), ['burst']);
  ok('with a layer selected the preview fades every other layer to a quarter by blend group (normal, added light, stains, light on the ground); the selected layer keeps its colours',
    !beamCore.wrong && !shellBurst.wrong && beamCore.kept > 0 && beamCore.normal > 0 && beamCore.light > 0 && beamCore.screen > 0 && shellBurst.kept > 0 && shellBurst.multiply > 0,
    `Beam, hot core: ${show(beamCore)}. Burst: ${show(shellBurst)}`);
  // A projectile draws nothing: selecting it keeps the layers riding it at full strength.
  const flightNone = await sinkAt('board_shell', 300, null);
  const shellRiders = fadeChanges(flightNone, await sinkAt('board_shell', 300, 'shell'), ['shell', 'trail']);
  const bulletNone = await sinkAt('rifle_shot', 20, null);
  const bulletRiders = fadeChanges(bulletNone, await sinkAt('rifle_shot', 20, 'bullet'), ['bullet', 'tracer', 'tracer_core']);
  ok('selecting a projectile keeps the layers riding it at full strength and fades the rest', !shellRiders.wrong && !bulletRiders.wrong && shellRiders.kept > 0 && shellRiders.normal > 0 && bulletRiders.kept > 0 && bulletRiders.normal > 0,
    `Shell (its streak rides it): ${show(shellRiders)}. Bullet (two tracers ride it): ${show(bulletRiders)}`);
  // Hovering a row, in the Layers list or on the timeline, fades the others while the mouse is there; then the selection
  // counts again.
  await sinkAt('board_shell', 1300, 'burst');
  await p.hover('.layers-list .layer-item[data-layer="debris"]');
  const hoverList = fadeChanges(shellNone, await sinkAt('board_shell', 1300, 'burst'), ['debris']);
  await p.hover('.timeline .tl-row[data-layer="sparks"] .tl-name');
  const hoverTimeline = fadeChanges(shellNone, await sinkAt('board_shell', 1300, 'burst'), ['sparks']);
  // A scrub that starts on a row's lane is not a hover: while you drag, the selected layer counts.
  const lane = await p.locator('.timeline .tl-row[data-layer="sparks"] .tl-lane').boundingBox();
  await p.mouse.move(lane.x + lane.width * 0.3, lane.y + lane.height / 2);
  await p.mouse.down();
  await p.mouse.move(lane.x + lane.width * 0.4, lane.y + lane.height / 2, { steps: 3 });
  const whileScrubbing = fadeChanges(shellNone, await sinkAt('board_shell', 1300, 'burst'), ['burst']);
  await p.mouse.up();
  await p.mouse.move(5, 5);
  const hoverGone = fadeChanges(shellNone, await sinkAt('board_shell', 1300, 'burst'), ['burst']);
  ok('hovering a layer\'s row in the Layers list or on the timeline fades the other layers while it is there; then the selected layer counts again',
    !hoverList.wrong && !hoverTimeline.wrong && !hoverGone.wrong && hoverList.kept > 0 && hoverTimeline.kept > 0 && hoverGone.kept === shellBurst.kept,
    `Debris row: ${show(hoverList)}. Sparks on the timeline: ${show(hoverTimeline)}. Mouse away: ${show(hoverGone)}`);
  ok('a scrub that starts on a row\'s lane is not a hover: while you drag, the selected layer counts', !whileScrubbing.wrong && whileScrubbing.kept === shellBurst.kept,
    `while dragging on the Sparks lane: ${show(whileScrubbing)}`);
  // Effects playing from Fire fade too. The same moment is drawn twice, Fade other layers on and then off, with no time
  // passing between (a frame of 0 ms). A fired copy of the effect shown keeps the layer in focus; an effect still playing
  // from an earlier Fire of another effect fades as a whole, also its layer at the same place in its own list.
  const firedFade = await p.evaluate(async () => {
    const a = window.__vfx.app;
    window.__vfxManual = true;
    const toggle = document.querySelector('.vbar .fade-toggle');
    const snap = () => Object.fromEntries(Object.entries(a.previewForChecks.vfx.sink.groups).map(([g, b]) => [g, { col: Array.from(b.col.subarray(0, b.vcount * 4)), layer: Array.from(b.layer.subarray(0, b.vcount)) }]));
    const both = async () => {
      await a.frame(a.lastFrame);
      const on = snap();
      toggle.click();
      await a.frame(a.lastFrame);
      const off = snap();
      toggle.click();
      return { on, off };
    };
    a.pickEffect('rifle_shot');
    a.selectLayer('flash');
    await a.showAt(0, 7);
    a.fire();
    await a.tickForChecks(80);
    const rifle = { ids: a.effect().layers.map((l) => l.id), ...(await both()) };
    a.pickEffect('board_shell');
    a.selectLayer('muzzle_blast');
    // The tank shell at 100 ms, its muzzle blast in the middle of its 230 ms, while the rifle shot fired before plays on.
    a.mainTime = 100;
    const shell = { ids: a.effect().layers.map((l) => l.id), ...(await both()) };
    const playing = a.debugState().playingCount;
    await a.showAt(0, 7);
    return { rifle, shell, playing };
  });
  const firedShot = fadeChanges({ ids: firedFade.rifle.ids, groups: firedFade.rifle.off }, { ids: firedFade.rifle.ids, groups: firedFade.rifle.on }, ['flash']);
  // The other effect's vertices: each must be the same as with the fade off (kept) or faded; only the muzzle blast keeps.
  const blastIndex = firedFade.shell.ids.indexOf('muzzle_blast');
  const mixed = { keptHere: 0, fadedHere: 0, keptElsewhere: 0, faded: 0, wrong: 0 };
  for (const g of Object.keys(firedFade.shell.off)) {
    const a = firedFade.shell.off[g], b = firedFade.shell.on[g];
    if (a.layer.join() !== b.layer.join()) { mixed.wrong++; continue; }
    for (let v = 0; v < a.layer.length; v++) {
      const was = a.col.slice(v * 4, v * 4 + 4), got = b.col.slice(v * 4, v * 4 + 4);
      const faded = ((g === 'ground' || g === 'top') && was[3] < 0 ? [was[0] / 4, was[1] / 4, was[2] / 4, was[3]] : [was[0], was[1], was[2], was[3] / 4]).every((x, i) => Math.fround(x) === got[i]);
      const same = was.every((x, i) => x === got[i]);
      const here = a.layer[v] === blastIndex;
      if (faded) mixed[here ? 'fadedHere' : 'faded']++;
      else if (same) mixed[here ? 'keptHere' : 'keptElsewhere']++;
      else mixed.wrong++;
    }
  }
  ok('effects playing from Fire fade too: a fired copy of the effect shown keeps the layer in focus, and an effect still playing from another effect fades as a whole',
    firedFade.playing === 1 && !firedShot.wrong && firedShot.kept > 0 && firedShot.normal > 0 && !mixed.wrong && mixed.keptHere > 0 && mixed.fadedHere > 0 && mixed.keptElsewhere === 0 && mixed.faded > 0,
    `fired rifle shot, Muzzle flash in focus: ${show(firedShot)}. Tank shell (board) shown, Muzzle blast in focus, the rifle shot still playing: ${JSON.stringify(mixed)} (here: place ${blastIndex} in each effect's list)`);
  // Fade other layers off: exactly the game's look, every vertex as with no layer selected.
  await p.locator('.vbar .fade-toggle').click();
  const offBeam = await sinkAt('board_beam', 1000, 'beam_core');
  await p.hover('.layers-list .layer-item[data-layer="beads"]');
  const offHover = await sinkAt('board_beam', 1000, 'beam_core');
  await p.mouse.move(5, 5);
  await p.locator('.vbar .fade-toggle').click();
  ok('Fade other layers off: the preview is the game\'s look, every vertex as with no layer selected, also while a row is hovered',
    JSON.stringify(offBeam.groups) === JSON.stringify(beamNone.groups) && JSON.stringify(offHover.groups) === JSON.stringify(beamNone.groups), `${Object.values(beamNone.groups).reduce((n, g) => n + g.layer.length, 0)} vertices compared`);

  // -- The Look: a live picture of the selected layer at the top of its panel. The layer alone, drawn by the runtime on the
  // preview's ground colour, framed on it. Paused by showAt it holds the moment shown, so it is read as a picture here.
  const lookPicture = async (effect, layer, ms) => {
    const info = await p.evaluate(async ([effect, layer, ms]) => {
      const a = window.__vfx.app;
      window.__vfxManual = true;
      if (a.effect()?.id !== effect) a.pickEffect(effect);
      a.selectLayer(layer);
      await a.showAt(ms, 7);
      await a.showAt(ms, 7);
      document.querySelector('.status')?.classList.remove('show');
      const card = document.querySelector('.inspector > section.card.layer');
      const first = card?.firstElementChild;
      const box = card?.querySelector('.look-box');
      const r = box?.getBoundingClientRect();
      return { first: first?.matches('details.look-fold') ? first.querySelector(':scope > summary').textContent : first?.tagName ?? null, open: !!first?.open,
        canvas: !!box?.querySelector('canvas'), box: r ? { x: Math.round(r.x) + 4, y: Math.round(r.y) + 4, width: Math.floor(r.width) - 8, height: Math.floor(r.height) - 8 } : null, state: a.lookForChecks() };
    }, [effect, layer, ms]);
    if (!info.box) return { ...info, ground: 0, drawn: 0, orange: 0, n: 0 };
    await p.waitForTimeout(100);
    const png = PNG.sync.read(await p.screenshot({ clip: info.box, path: join(shots, `look-${effect}-${layer}.png`) }));
    let ground = 0, drawn = 0, orange = 0, n = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      const c = hex(png, x, y), d = diff(c, '#B8A683');
      n++;
      if (d <= 2) ground++; else if (d > 24) drawn++;
      if (diff(c, '#F47A1C') <= 3 || diff(c, '#FFB02E') <= 3) orange++;
    }
    return { ...info, ground, drawn, orange, n };
  };
  const brief = (l) => `${l.first}${l.open ? ' (open)' : ''}, ${l.drawn} of ${l.n} px drawn, ${l.ground} ground${l.orange ? `, ${l.orange} orange` : ''}; "${l.state.text}"`;
  const lookFlash = await lookPicture('rifle_shot', 'flash', 20);
  ok('a layer\'s settings start with the Look: the layer alone, drawn by the runtime on the preview\'s ground colour (the muzzle flash, in its own orange), held at the moment shown',
    lookFlash.first === 'Look' && lookFlash.open && lookFlash.canvas && lookFlash.state.ready && lookFlash.state.moment === 20 && lookFlash.ground > lookFlash.n * 0.3 && lookFlash.drawn > 200 && lookFlash.orange > 50,
    brief(lookFlash));
  const looks = [];
  for (const [effect, layer, ms, what] of [['board_shell', 'burst', 1300, 'a shape'], ['board_shell', 'sparks', 1300, 'a burst'], ['board_shell', 'word', 1300, 'a word'],
    ['rifle_shot', 'tracer', 20, 'a sprite riding a projectile'], ['rifle_shot', 'bullet', 20, 'a projectile (its riders)'], ['board_shell', 'trail', 300, 'a shape riding a projectile']]) {
    looks.push({ what, ...(await lookPicture(effect, layer, ms)) });
  }
  ok('the Look draws each kind of layer, not a blank picture: a shape, a burst, a word, layers riding a projectile, a projectile\'s riders',
    looks.every((l) => l.first === 'Look' && l.canvas && l.state.moment !== null && l.drawn > 40 && l.ground > l.n * 0.2), looks.map((l) => `${l.what}: ${brief(l)}`).join(' | '));
  // It draws only while the layer's panel shows it and the page is visible; folded or with no layer selected it lets go of
  // its renderer (and the renderer's WebGL context).
  const lookStops = await p.evaluate(async () => {
    const a = window.__vfx.app;
    window.__vfxManual = true;
    const frames = () => a.lookForChecks().frames;
    const later = () => new Promise((r) => setTimeout(r, 50));
    const f0 = frames(); await a.tickForChecks(200); const shown = frames() - f0;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    const f1 = frames(); await a.tickForChecks(200); const hidden = frames() - f1;
    delete document.visibilityState;
    const f2 = frames(); await a.tickForChecks(200); const visible = frames() - f2;
    const summary = document.querySelector('.inspector .look-fold > summary');
    summary.click();
    await later();
    const folded = a.lookForChecks(), foldedGone = await a.lookDisposedForChecks();
    const f3 = frames(); await a.tickForChecks(200); const whileFolded = frames() - f3;
    summary.click();
    await later();
    await a.showAt(300, 7);
    const reopened = a.lookForChecks();
    a.selectLayer(null);
    const none = a.lookForChecks(), noneGone = await a.lookDisposedForChecks(), inPanel = !!document.querySelector('.inspector .look');
    const f4 = frames(); await a.tickForChecks(200); const whileNone = frames() - f4;
    return { shown, hidden, visible, folded: { renderer: folded.renderer, gone: foldedGone, frames: whileFolded }, reopened: { renderer: reopened.renderer, ready: reopened.ready },
      none: { renderer: none.renderer, gone: noneGone, inPanel, frames: whileNone } };
  });
  ok('the Look draws only while its layer\'s panel shows it and the page is visible; folded, or with no layer selected, its renderer is disposed (its WebGL context lost) and it draws nothing',
    lookStops.shown > 0 && lookStops.hidden === 0 && lookStops.visible > 0 && !lookStops.folded.renderer && lookStops.folded.gone && lookStops.folded.frames === 0
      && lookStops.reopened.renderer && lookStops.reopened.ready && !lookStops.none.renderer && lookStops.none.gone && !lookStops.none.inPanel && lookStops.none.frames === 0, JSON.stringify(lookStops));
  // While the app runs, it plays the layer's own time in a loop.
  const lookLive = await p.evaluate(async () => {
    const a = window.__vfx.app;
    a.pickEffect('board_shell');
    a.selectLayer('burst');
    a.resumeForChecks();
    const seen = new Set();
    const t0 = performance.now();
    while (performance.now() - t0 < 6000 && seen.size < 4) {
      await new Promise((r) => requestAnimationFrame(r));
      const m = a.lookForChecks().moment;
      if (m !== null) seen.add(Math.round(m));
    }
    const tl = a.timeline().byId.get('burst');
    return { moments: [...seen], start: tl.startMs, end: tl.endMs };
  });
  ok('while the app runs the Look plays the layer\'s own time in a loop', lookLive.moments.length >= 4 && lookLive.moments.every((m) => m >= lookLive.start && m < lookLive.end),
    `${lookLive.moments.join(', ')} ms, in ${lookLive.start}–${lookLive.end} ms`);

  // -- the colours of the selection: the effect's (its main colour and every layer's), a layer's (with the ones it draws
  // without naming them, such as the ink outline), a projectile's riders'. The same list as the checker's (src/doc/layer-info.ts).
  const shownColours = () => p.evaluate(() => {
    const list = document.querySelector('.inspector .swatches');
    const note = document.querySelector('.inspector .colour-note');
    // The hint under the list, as shown (Show hints is on in this browser).
    const hint = list.parentElement.querySelector(':scope > .hint');
    return { shown: [...list.querySelectorAll(':scope > .swatch:not([hidden])')].map((x) => x.textContent), all: list.classList.contains('all'), note: note && !note.hidden ? note.textContent : '',
      hint: hint && hint.getClientRects().length ? hint.textContent : '' };
  });
  const wantColours = async () => {
    const { fx, layer, palette } = await p.evaluate(() => { const a = window.__vfx.app; return { fx: a.effect(), layer: a.layer()?.id ?? null, palette: a.palette }; });
    return layerInfo.selectionColours(fx, layer ? fx.layers.find((l) => l.id === layer) : undefined, palette).roles;
  };
  const coloursOf = async (effect, layer) => {
    await p.evaluate(([effect, layer]) => { const a = window.__vfx.app; a.pickEffect(effect); a.selectLayer(layer); }, [effect, layer]);
    return { got: await shownColours(), want: await wantColours() };
  };
  const ofBeam = await coloursOf('board_beam', null);
  const ofRing = await coloursOf('board_beam', 'lock_ring');
  const ofBullet = await coloursOf('rifle_shot', 'bullet');
  const ofFlash = await coloursOf('rifle_shot', 'flash');
  const same = (c) => !c.got.all && c.want.length > 0 && JSON.stringify(c.got.shown) === JSON.stringify(c.want);
  ok('the colour list shows the colours of the selection: the effect\'s, a layer\'s (the ink it does not name too), a projectile\'s riders\' (it says it has none of its own)',
    same(ofBeam) && same(ofRing) && ofRing.want.includes('ink') && same(ofBullet) && ofBullet.got.note.startsWith('A projectile has no colours of its own')
      && ofFlash.got.shown.length === 0 && ofFlash.want.length === 0 && ofFlash.got.note === 'It uses no palette colours: the image keeps its own colours.',
    JSON.stringify({ beam: ofBeam.got.shown, ring: ofRing.got.shown, bullet: [ofBullet.got.shown, ofBullet.got.note], flash: ofFlash.got.note }));
  ok('the hint under the colour list says to click a colour only when there is one: not under a sprite that keeps its own colours',
    ofFlash.got.hint === '' && ofRing.got.hint.startsWith('Click a colour to change it') && ofBeam.got.hint.includes('Click a colour to change it'),
    JSON.stringify({ flash: ofFlash.got.hint, ring: ofRing.got.hint, beam: ofBeam.got.hint }));
  // Show all, next to the Colour title: every colour of the palette, the selection's in bold; remembered. Colours that leave
  // or come back move in a short animation, and none with reduced motion. The section stays open.
  const glowOnly = await coloursOf('board_beam', 'emitter_glow');
  const swatchMoves = () => p.evaluate(() => document.getAnimations().filter((x) => x.effect?.target?.closest?.('.swatches')).map((x) => x.effect.getTiming().duration));
  await p.locator('.inspector .fold-actions label.show-all').click();
  const moves = await swatchMoves();
  const allOn = await p.evaluate(() => {
    const a = window.__vfx.app;
    const roles = new Set([...Object.keys(a.palette.roles), ...Object.values(a.palette.factions).flatMap((f) => Object.keys(f.roles))]);
    const list = [...document.querySelectorAll('.inspector .swatches > .swatch:not([hidden])')];
    return { open: document.querySelector('.inspector .fold-actions').closest('details').open, stored: localStorage.getItem('vfx-colours-all'), shown: list.length, roles: roles.size,
      bold: list.filter((x) => getComputedStyle(x).fontWeight === '600').map((x) => x.textContent), uses: list.filter((x) => x.classList.contains('uses')).map((x) => x.textContent) };
  });
  ok('Show all shows every colour, the selection\'s in bold, and is remembered; the Colour section stays open', same(glowOnly) && allOn.open && allOn.stored === '1' && allOn.shown === allOn.roles
    && JSON.stringify(allOn.bold) === JSON.stringify(glowOnly.want) && JSON.stringify(allOn.uses) === JSON.stringify(glowOnly.want), JSON.stringify({ before: glowOnly.got.shown, ...allOn }));
  ok('colours that come back move in a short animation (about 150 ms)', moves.length > 0 && moves.every((d) => d === 150), `${moves.length} animations: ${[...new Set(moves)].join(', ')} ms`);
  // Let those finish (this browser draws in software, so its frames come slowly), then the same with reduced motion: none.
  await p.waitForFunction(() => !document.getAnimations().some((x) => x.effect?.target?.closest?.('.swatches')) && !document.querySelector('.swatch-ghost'), null, { timeout: 15000 }).catch(() => {});
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.locator('.inspector .fold-actions label.show-all').click();
  const stillMoving = (await swatchMoves()).length;
  const offReduced = await shownColours();
  await p.locator('.inspector .fold-actions label.show-all').click();
  const stillMoving2 = (await swatchMoves()).length;
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  ok('with reduced motion the colours leave and come back without moving', stillMoving === 0 && stillMoving2 === 0 && JSON.stringify(offReduced.shown) === JSON.stringify(glowOnly.want),
    `${stillMoving} and ${stillMoving2} animations; shown when off: ${offReduced.shown.join(', ')}`);
  // Show all stays on for another selection.
  await p.evaluate(() => window.__vfx.app.selectLayer('lock_ring'));
  const allKept = await shownColours();
  ok('Show all stays on for another selection', allKept.all && allKept.shown.length === allOn.roles, `${allKept.shown.length} colours shown`);

  // -- the colour picker: a typed colour, a drag on the wheel and its undo, a new colour, Revert. Show all is on, so the
  // glow's list holds dust too, which the glow does not use.
  await p.evaluate(() => { const a = window.__vfx.app; a.pickEffect('board_beam'); a.selectLayer('emitter_glow'); });
  await p.locator('.swatch', { hasText: /^dust$/ }).first().click();
  const pickerOpen = await p.locator('.cpick').evaluate((el) => el.matches(':popover-open'));
  await p.locator('.cp-hex').fill('#3a7bff');
  await p.locator('.cp-hex').press('Enter');
  const dust = await p.evaluate(() => window.__vfx.app.palette.roles.dust);
  ok('a palette swatch opens the colour picker, and a typed colour changes the role as yours', pickerOpen && dust.hex === '#3A7BFF' && dust.from === 'mustafa', JSON.stringify(dust));
  await p.locator('.cp-pchip[aria-label^="Change glow ("]').first().click();
  // The picker grows (a faction row) and may move to stay in the window: measure the wheel once it has settled.
  let wheel = await p.locator('.cp-wheel').boundingBox();
  for (let k = 0; k < 20; k++) {
    await p.waitForTimeout(50);
    const again = await p.locator('.cp-wheel').boundingBox();
    if (again && wheel && Math.abs(again.x - wheel.x) < 0.5 && Math.abs(again.y - wheel.y) < 0.5) break;
    wheel = again;
  }
  const glowBefore = await p.evaluate(() => window.__vfx.app.palette.factions.soviets.roles.glow.hex);
  await p.mouse.move(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2);
  await p.mouse.down();
  await p.mouse.move(wheel.x + wheel.width / 2 - 25, wheel.y + wheel.height / 2 + 20, { steps: 8 });
  await p.mouse.up();
  const dragged = await p.evaluate(() => ({ hex: window.__vfx.app.palette.factions.soviets.roles.glow.hex, preview: window.__vfx.app.previewForChecks.vfx.palette.factions.soviets.roles.glow.hex, undo: window.__vfx.app.history.undoLabel }));
  await p.locator('.cp-actions button', { hasText: 'Revert' }).click();
  const reverted = await p.evaluate(() => window.__vfx.app.palette.factions.soviets.roles.glow);
  ok('a drag on the wheel changes the colour and the preview at once; Revert puts it back as it was', dragged.hex !== glowBefore && dragged.preview === dragged.hex && dragged.undo === 'Colour glow' && reverted.hex === glowBefore && reverted.from === 'art-lead',
    `${glowBefore} -> ${dragged.hex} -> ${reverted.hex} (${reverted.from})`);
  // Keys in the picker are the picker's: → turns the hue; the timeline does not step and Delete removes no layer. Undo still works.
  const keysBefore = await p.evaluate(() => ({ t: window.__vfx.app.debugState().mainTime, n: window.__vfx.app.effect().layers.length, hue: window.__vfx.app.palette.factions.soviets.roles.glow.hex }));
  await p.locator('.cp-wheel').focus();
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Delete');
  const keysAfter = await p.evaluate(() => ({ t: window.__vfx.app.debugState().mainTime, n: window.__vfx.app.effect().layers.length, hue: window.__vfx.app.palette.factions.soviets.roles.glow.hex }));
  await p.keyboard.press('Control+z');
  const keysUndone = await p.evaluate(() => window.__vfx.app.palette.factions.soviets.roles.glow.hex);
  ok('keys in the colour picker are the picker\'s: → turns the hue, the timeline and the layers stay, undo still works',
    keysAfter.hue !== keysBefore.hue && keysAfter.t === keysBefore.t && keysAfter.n === keysBefore.n && keysUndone === keysBefore.hue, `${keysBefore.hue} -> ${keysAfter.hue} -> ${keysUndone}; ${keysAfter.n} layers`);
  // It stays open while you play the effect; Escape puts it away from anywhere.
  await p.click('.transport .play');
  const stillOpen = await p.locator('.cpick').evaluate((el) => el.matches(':popover-open'));
  await p.click('.transport .play');
  await p.keyboard.press('Escape');
  const closedByEscape = await p.locator('.cpick').evaluate((el) => !el.matches(':popover-open'));
  const layerKept = await p.evaluate(() => window.__vfx.app.layer()?.id ?? null);
  ok('the picker stays open while you play the effect, and Escape closes it (only it: the layer stays selected)', stillOpen && closedByEscape && layerKept === 'emitter_glow',
    `open after Play: ${stillOpen}, closed by Escape: ${closedByEscape}, layer: ${layerKept}`);
  await p.locator('.swatch', { hasText: /^glow$/ }).first().click();
  await p.locator('.cp-new summary').click();
  await p.locator('.cp-new input.text').fill('fire.blue');
  await p.locator('.cp-new button', { hasText: 'Add colour' }).click();
  const newRole = await p.evaluate(() => ({ role: window.__vfx.app.palette.roles['fire.blue'], inList: [...document.querySelectorAll('.inspector select option')].some((o) => o.value === 'fire.blue') }));
  ok('New colour adds a role every colour list offers', !!newRole.role && newRole.role.from === 'mustafa' && newRole.inList, JSON.stringify(newRole));

  // -- gradients: a ready-made one, put on a glow
  await p.locator('.cp-section.gr > summary').click();
  await p.locator('.gr-tile', { hasText: 'Radial ramp' }).click();
  await p.locator('.gr-body button', { hasText: 'Use on the selected glow' }).click();
  // Close it with its own button (Escape depends on where the focus is).
  await p.locator('.cp-head button[aria-label="Close the colour picker"]').click();
  await p.waitForFunction(() => !document.querySelector('.cpick').matches(':popover-open'));
  const grad = await p.evaluate(async () => { const a = window.__vfx.app; window.__vfxManual = true; await a.showAt(1000, 7); window.__vfxManual = false; a.resumeForChecks();
    return { names: Object.keys(a.palette.gradients), layer: a.layer()?.shape?.gradient, problems: a.problems().length }; });
  ok('a ready-made gradient goes into the palette and onto the selected glow', grad.names.join() === 'glow.ramp' && grad.layer === 'glow.ramp' && grad.problems === 0, JSON.stringify(grad));
  // Show all off again: the glow's own colours, now with its gradient's.
  await p.locator('.inspector .fold-actions label.show-all').click();
  const ownAgain = await shownColours();
  const ownWant = await wantColours();
  const storedOff = await p.evaluate(() => localStorage.getItem('vfx-colours-all'));
  ok('Show all off: the list is the layer\'s own colours again, its gradient\'s colours too, and that is remembered', !ownAgain.all && storedOff === '0' && ownWant.length > glowOnly.want.length
    && JSON.stringify(ownAgain.shown) === JSON.stringify(ownWant), `${ownAgain.shown.join(', ')} (want ${ownWant.join(', ')}); stored ${storedOff}`);
  // Closing the picker gives the focus back to the swatch that opened it, also in a layer's list, which hides the colours the
  // layer does not use (the main colour's too, so the focus cannot go there). A second Escape then leaves the layer.
  await p.evaluate(() => { const a = window.__vfx.app; a.pickEffect('board_shell'); a.selectLayer('ring'); });
  await p.locator('.inspector .swatch[data-key="role:team"]').focus();
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('.cpick').matches(':popover-open'));
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('.cpick').matches(':popover-open'));
  const focusBack = await p.evaluate(() => ({ focus: document.activeElement?.dataset?.key ?? document.activeElement?.tagName ?? null,
    inPanel: !!document.activeElement?.closest('.inspector'), mainHidden: document.querySelector('.inspector .swatch[aria-current="true"]')?.hidden ?? null, layer: window.__vfx.app.layer()?.id ?? null }));
  await p.keyboard.press('Escape');
  const afterSecondEsc = await p.evaluate(() => window.__vfx.app.layer()?.id ?? null);
  ok('closing the colour picker gives the focus back to the swatch that opened it, also in a layer\'s list that hides the main colour; a second Escape leaves the layer',
    focusBack.focus === 'role:team' && focusBack.inPanel && focusBack.mainHidden === true && focusBack.layer === 'ring' && afterSecondEsc === null, JSON.stringify({ ...focusBack, afterSecondEsc }));
  await p.evaluate(() => { const a = window.__vfx.app; a.pickEffect('board_beam'); a.selectLayer('emitter_glow'); });

  // -- night mode: panels go dark, the preview keeps the game's colours
  await p.locator('.topbar button.theme-toggle').click();
  const night = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, pressed: document.querySelector('.theme-toggle').getAttribute('aria-pressed'), stored: localStorage.getItem('vfx-theme') }));
  await p.screenshot({ path: join(shots, 'editor-night-mode.png') });
  await p.locator('.topbar button.theme-toggle').click();
  const day = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor }));
  ok('Night mode turns the panels dark (#1E1E1E) and is remembered; it turns off again (#E2DED6)', night.theme === 'dark' && night.bg === 'rgb(30, 30, 30)' && night.pressed === 'true' && night.stored === 'dark'
    && day.theme === 'light' && day.bg === 'rgb(226, 222, 214)', JSON.stringify({ night, day }));
  const insignia = await p.evaluate(() => [...document.querySelectorAll('.vbar [aria-label="Faction that fired"] button')].map((b) => `${b.querySelector('svg')?.getAttribute('class')}|${b.textContent}`));
  ok('the faction buttons show each faction\'s marking and its name', insignia.join() === 'icon icon-faction-soviets|Soviets,icon icon-faction-allies|Allies,icon icon-faction-empire|Empire', insignia.join(', '));

  // -- the preview is drawn once per screen frame: one frame loop, even after the check drew frames itself (showAt). Each
  // extra loop would draw the whole scene again in every frame (in this software-drawing browser, that is what made a
  // second editor page take half a minute to start).
  const loops = await p.evaluate(() => new Promise((res) => {
    const a = window.__vfx.app;
    let frames = 0, ticks = 0;
    const real = a.frame;
    a.frame = function (...args) { frames++; return real.apply(this, args); };
    const t0 = performance.now();
    const tick = () => { ticks++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else { delete a.frame; res({ frames, ticks }); } };
    requestAnimationFrame(tick);
  }));
  ok('the preview is drawn once per screen frame (one frame loop), even after frames the check drew itself', loops.frames > 0 && loops.frames <= loops.ticks + 1, `${loops.frames} frames drawn in ${loops.ticks} screen frames`);

  // -- Save as, after deleting an effect: the copy must not bring it back; then open the copy again
  const kept = (await st()).effects.filter((id) => id !== 'shell_flight').sort();
  await p.click('.effects-list .item:has-text("Tank shell flight") button[aria-label^="Delete"]');
  await p.waitForTimeout(100);
  const name = `browser-check-${Date.now()}`;
  await p.click('.topbar >> text=Save as…');
  await p.fill('dialog input.text', name);
  await p.click('dialog >> text=OK');
  await p.waitForFunction(() => document.querySelector('.project-name')?.textContent?.toLowerCase().includes('browser-check') && !document.querySelector('.project-name')?.textContent?.includes('•'), null, { timeout: 15000 }).catch(() => {});
  const dir = join(repo, 'projects', name);
  const files = existsSync(join(dir, 'effects')) ? readdirSync(join(dir, 'effects')).sort() : [];
  ok('Save as leaves out an effect deleted before saving', files.join() === kept.map((id) => `${id}.vfx.json`).join() && !files.includes('shell_flight.vfx.json'), files.join(', ') || 'no files');
  const savedPage = await open(`${base}/?backend=webgl&project=projects/${name}`, () => window.__vfx && window.__vfx.ready);
  note('a second editor page, opened while the first one is open', `loaded in ${(savedPage.loadedMs / 1000).toFixed(1)} s, ready in ${(savedPage.readyMs / 1000).toFixed(1)} s`);
  const reopened = await savedPage.page.evaluate(() => {
    const a = window.__vfx.app;
    a.pickEffect('board_shell');
    const scene = a.previewForChecks.scene.id;
    a.pickEffect('rifle_shot');
    return { effects: a.debugState().effects.slice().sort(), size: a.effect()?.controls.size, name: document.querySelector('.project-name')?.textContent, scene };
  });
  ok('the saved project opens again, with the edit in it', reopened.effects.join() === kept.join() && reopened.size === 2, `${reopened.name}: ${reopened.effects.join(', ')}, rifle_shot size ${reopened.size}`);
  ok('the saved copy has its own name and keeps each effect\'s scene', (reopened.name ?? '').toLowerCase().includes('browser-check') && reopened.scene === 'board-shell', `${reopened.name}, board_shell in ${reopened.scene}`);
  const meta = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const savedPalette = existsSync(join(dir, 'palette.json')) ? JSON.parse(readFileSync(join(dir, 'palette.json'), 'utf8')) : null;
  const savedBeam = JSON.parse(readFileSync(join(dir, 'effects', 'board_beam.vfx.json'), 'utf8'));
  ok('the saved copy keeps its colours and gradients in its own palette.json', savedPalette?.version === 2 && savedPalette.roles.dust.hex === '#3A7BFF' && !!savedPalette.roles['fire.blue'] && !!savedPalette.gradients['glow.ramp']
    && savedBeam.layers.find((l) => l.id === 'emitter_glow').shape.gradient === 'glow.ramp', savedPalette ? `dust ${savedPalette.roles.dust.hex}, gradients ${Object.keys(savedPalette.gradients).join(', ')}` : 'no palette.json');
  ok('the built-in palette and the examples stay unchanged', JSON.parse(readFileSync(join(repo, 'packages', 'vfx-format', 'palette', 'palette.json'), 'utf8')).roles.dust.hex === '#DCC8A0' && !existsSync(join(repo, 'examples', 'demo-project', 'palette.json')));
  // project.json version 2: the budgets typed on the card are the project level, switched on; nothing else is written.
  const savedBudgets = JSON.stringify({ project: { on: true, limits: { high: { draws: 1 } } } });
  ok('the saved copy is project.json version 2 and keeps the game events and the budgets', meta.version === 2 && meta.events?.board_shell?.join() === 'tank.shot,tank.shell.check' && meta.events?.board_muzzle?.join() === 'rifle.shot' && !meta.events?.shell_flight
    && JSON.stringify(meta.budgets) === savedBudgets, JSON.stringify({ version: meta.version, events: meta.events?.board_shell, budgets: meta.budgets }));

  // -- Export from the editor, then Import the export as a new project: the same effects come back
  const exported = await savedPage.page.evaluate(() => window.__vfx.app.exportNow());
  const exportDir = join(repo, 'exports', name);
  const manifest = existsSync(join(exportDir, 'manifest.json')) ? JSON.parse(readFileSync(join(exportDir, 'manifest.json'), 'utf8')) : null;
  ok('Export writes the folder the game loads', !!exported?.ok && manifest?.events?.['tank.shell.check'] === 'board_shell' && manifest.effects.length === kept.length,
    exported ? `${exported.folder}: ${exported.effects} effects, ${exported.events} events${exported.errors.length ? `; ${exported.errors[0]}` : ''}` : 'no answer');
  const imported = await savedPage.page.evaluate(async (name) => {
    const res = await fetch('/__vfx/api/import', { method: 'POST', headers: { 'X-Shamble-VFX': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ export: name, root: 'projects', name: `${name} imported` }) });
    return { status: res.status, body: await res.json() };
  }, name);
  const importDir = imported.body?.id ? join(repo, 'projects', imported.body.id.split('/')[1]) : null;
  const sameFiles = importDir && kept.every((id) => readFileSync(join(importDir, 'effects', `${id}.vfx.json`), 'utf8') === readFileSync(join(dir, 'effects', `${id}.vfx.json`), 'utf8'));
  ok('Export and Import carry the project\'s palette.json', !!importDir && readFileSync(join(exportDir, 'palette.json'), 'utf8') === readFileSync(join(importDir, 'palette.json'), 'utf8')
    && JSON.parse(readFileSync(join(exportDir, 'palette.json'), 'utf8')).gradients['glow.ramp'] !== undefined);
  ok('Import gives back the same effects, byte for byte, with their events', imported.status === 201 && !!sameFiles && JSON.parse(readFileSync(join(importDir, 'project.json'), 'utf8')).events?.board_shell?.join() === 'tank.shot,tank.shell.check',
    `${imported.status} ${imported.body?.id ?? JSON.stringify(imported.body)}`);
  const notes = existsSync(join(exportDir, 'editor.json')) ? JSON.parse(readFileSync(join(exportDir, 'editor.json'), 'utf8')) : null;
  const importedMeta = importDir && existsSync(join(importDir, 'project.json')) ? JSON.parse(readFileSync(join(importDir, 'project.json'), 'utf8')) : null;
  ok('Export writes editor.json version 2 with the budgets, and Import gives them back in project.json version 2', notes?.version === 2 && JSON.stringify(notes.budgets) === savedBudgets
    && importedMeta?.version === 2 && JSON.stringify(importedMeta.budgets) === savedBudgets, JSON.stringify({ editor: { version: notes?.version, budgets: notes?.budgets }, imported: { version: importedMeta?.version, budgets: importedMeta?.budgets } }));

  // -- Import keeps the export's colours as a palette profile, named after the export's project (not the name typed for the
  // new project), and the new project.json records it. The folder (made on first use) also got the two default profiles.
  const profileFile = existsSync(checkPalettes) ? readdirSync(checkPalettes).find((f) => { try { return JSON.parse(readFileSync(join(checkPalettes, f), 'utf8')).name === name; } catch { return false; } }) : undefined;
  const profileJson = profileFile ? JSON.parse(readFileSync(join(checkPalettes, profileFile), 'utf8')) : null;
  ok('Import keeps the export\'s colours as a palette profile named after the export\'s project, and project.json records it',
    imported.body?.profile?.name === name && imported.body.profile.added === true && importedMeta?.paletteProfile === name
    && JSON.stringify(profileJson?.palette) === JSON.stringify(JSON.parse(readFileSync(join(exportDir, 'palette.json'), 'utf8'))),
    JSON.stringify({ answer: imported.body?.profile, recorded: importedMeta?.paletteProfile, file: profileFile }));
  const listed = await savedPage.page.evaluate(async () => {
    const res = await fetch('/__vfx/api/profiles', { headers: { 'X-Shamble-VFX': '1' } });
    return { status: res.status, body: await res.json() };
  });
  const listedNames = (listed.body?.profiles ?? []).map((x) => x.name);
  ok('the palette profiles are listed through the editor\'s server: the two defaults and the imported one, with swatches',
    listed.status === 200 && listedNames.includes('Built-in') && listedNames.includes('Built-in with gradients') && listedNames.includes(name)
    && listed.body.profiles.every((x) => x.swatches.length === 8 && /^\d{4}-\d\d-\d\dT/.test(x.changed)), `${listed.status}: ${listedNames.join(', ')}`);

  // -- Save as keeps the palette profile's name, and Export writes it into editor.json: on the imported project.
  const againName = `${name}-again`;
  const againDir = join(repo, 'projects', againName), againExport = join(repo, 'exports', againName);
  const reopenedImported = importDir ? await savedPage.page.evaluate((id) => { window.confirm = () => true; return window.__vfx.app.openProject(id); }, imported.body.id) : false;
  if (reopenedImported) {
    await savedPage.page.click('.topbar >> text=Save as…');
    await savedPage.page.fill('dialog input.text', againName);
    await savedPage.page.click('dialog >> text=OK');
    await savedPage.page.waitForFunction((n) => document.querySelector('.project-name')?.textContent?.includes(n) && !document.querySelector('.project-name')?.textContent?.includes('•'), againName, { timeout: 15000 }).catch(() => {});
  }
  const againMeta = existsSync(join(againDir, 'project.json')) ? JSON.parse(readFileSync(join(againDir, 'project.json'), 'utf8')) : null;
  const againExported = againMeta ? await savedPage.page.evaluate(() => window.__vfx.app.exportNow()) : null;
  const againNotes = existsSync(join(againExport, 'editor.json')) ? JSON.parse(readFileSync(join(againExport, 'editor.json'), 'utf8')) : null;
  ok('Save as keeps the palette profile\'s name in project.json, and Export writes it into editor.json',
    !!reopenedImported && againMeta?.name === againName && againMeta.paletteProfile === name && !!againExported?.ok && againNotes?.paletteProfile === name,
    JSON.stringify({ opened: reopenedImported, saved: againMeta && { name: againMeta.name, paletteProfile: againMeta.paletteProfile }, exported: againExported?.ok, editor: againNotes?.paletteProfile }));
  rmSync(againDir, { recursive: true, force: true });
  rmSync(againExport, { recursive: true, force: true });
  await savedPage.page.close();
  if (importDir) rmSync(importDir, { recursive: true, force: true });
  rmSync(exportDir, { recursive: true, force: true });
  ok('the examples stay unchanged', JSON.parse(readFileSync(join(repo, 'examples', 'demo-project', 'effects', 'rifle_shot.vfx.json'), 'utf8')).controls.size === 1);
  rmSync(dir, { recursive: true, force: true });
  ok('editor (driven) has no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await p.close();

  // -- tooltips (docs/ui-redesign.md 6.9): one shared tooltip, after 500 ms of hover (150 ms when another was just open) and
  // at once on keyboard focus; it hides on a press, on scroll and on Esc (which still does its job in the editor). Every title
  // becomes one, so no native tooltip shows as well. Labels, section titles and the bars' controls get their help texts
  // (src/app/help.ts) by their label and where they are shown. Times are taken in the page: this browser's frames come slowly.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const tp = g.page;
    const help = await server.ssrLoadModule('/src/app/help.ts');
    await tp.evaluate(() => {
      window.__vfxManual = true;
      // When the pointer came over the element marked data-probe, when the tooltip opened after that, and whether it was
      // open 250 ms after; when Tab was pressed.
      const t = window.__tipProbe = { overAt: null, openAt: null, at250: null, tabAt: null };
      document.addEventListener('pointerover', (e) => {
        if (t.overAt !== null || !e.target.closest?.('[data-probe]')) return;
        t.overAt = performance.now();
        setTimeout(() => { t.at250 = !!document.querySelector('.tooltip')?.matches(':popover-open'); }, 250);
      }, true);
      document.addEventListener('keydown', (e) => { if (e.key === 'Tab') t.tabAt = performance.now(); }, true);
      setInterval(() => { if (t.openAt === null && (t.overAt !== null || t.tabAt !== null) && document.querySelector('.tooltip')?.matches(':popover-open')) t.openAt = performance.now(); }, 4);
    });
    const tipNow = () => tp.evaluate(() => {
      const el = document.querySelector('.tooltip');
      return { open: !!el?.matches(':popover-open'), lines: el ? [...el.querySelectorAll(':scope > .tip-first > span, :scope > p')].map((x) => x.textContent) : [], key: el?.querySelector('kbd')?.textContent ?? null };
    });
    // Mark one element, rest the pointer where nothing has a tooltip (long enough for "just open" to pass), then hover it.
    const frames = () => tp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const hoverProbe = async (locator) => {
      await tp.evaluate(() => { document.querySelectorAll('[data-probe]').forEach((x) => x.removeAttribute('data-probe')); Object.assign(window.__tipProbe, { overAt: null, openAt: null, at250: null, tabAt: null }); });
      await locator.scrollIntoViewIfNeeded();
      // A scroll hides the tooltip (and one waiting): let the scroll's event pass before the hover.
      await frames();
      await locator.evaluate((el) => { el.dataset.probe = '1'; });
      const box = await locator.boundingBox();
      await tp.mouse.move(box.x + Math.min(box.width / 2, 12), box.y + box.height / 2);
      await tp.waitForFunction(() => window.__tipProbe.openAt !== null, null, { timeout: 10000 }).catch(() => {});
      return tp.evaluate(() => ({ ...window.__tipProbe, delay: window.__tipProbe.openAt === null ? null : Math.round(window.__tipProbe.openAt - window.__tipProbe.overAt) }));
    };
    const restPointer = async () => { const v = await tp.locator('.viewport').boundingBox(); await tp.mouse.move(v.x + 30, v.y + v.height - 60); await tp.waitForTimeout(700); };

    // A field label: its help text, for where it is (a ring's Width is its line's thickness), after the hover delay.
    await tp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('board_shell'); a.selectLayer('ring'); });
    const ringFold = tp.locator('.inspector details', { has: tp.locator(':scope > summary', { hasText: /^Shape: ring$/ }) });
    await restPointer();
    const width = await hoverProbe(ringFold.locator('.flab', { hasText: /^Width$/ }).first());
    const widthTip = await tipNow();
    const wantWidth = help.helpFor('Width', { section: ['Shape: ring'], layer: 'shape', kind: 'ring' });
    ok('a tooltip shows after the hover delay (500 ms), not before, with the help text for the field label where it is (a ring\'s Width)',
      width.delay !== null && width.delay >= 450 && width.delay < 4000 && width.at250 === false && widthTip.open && widthTip.lines.join(' | ') === wantWidth && wantWidth.includes('ring'),
      `opened ${width.delay} ms after the hover, open at 250 ms: ${width.at250}; "${widthTip.lines.join(' | ')}"`);
    // Another label while that one shows: 150 ms.
    const quick = await (async () => {
      await tp.evaluate(() => { document.querySelectorAll('[data-probe]').forEach((x) => x.removeAttribute('data-probe')); Object.assign(window.__tipProbe, { overAt: null, openAt: null, at250: null, tabAt: null }); });
      const ink = ringFold.locator('.flab', { hasText: /^Ink line$/ }).first();
      await ink.evaluate((el) => { el.dataset.probe = '1'; });
      const box = await ink.boundingBox();
      await tp.mouse.move(box.x + 8, box.y + box.height / 2);
      await tp.waitForFunction(() => window.__tipProbe.openAt !== null, null, { timeout: 10000 }).catch(() => {});
      return tp.evaluate(() => (window.__tipProbe.openAt === null ? null : Math.round(window.__tipProbe.openAt - window.__tipProbe.overAt)));
    })();
    const inkTip = await tipNow();
    ok('with a tooltip just open, the next one shows after 150 ms', quick !== null && quick >= 100 && quick < 450 && inkTip.lines.join() === help.helpFor('Ink line', { section: ['Shape: ring'], layer: 'shape', kind: 'ring' }),
      `${quick} ms; "${inkTip.lines.join(' | ')}"`);
    // The same words mean other things elsewhere: the ring's Colour field (its line) and the layer's Colour section (its title).
    const colours = await tp.evaluate(() => {
      const a = window.__vfx.app;
      const colourField = [...document.querySelectorAll('.inspector details .flab')].find((x) => x.textContent === 'Colour' && x.closest('details').querySelector(':scope > summary').textContent === 'Shape: ring');
      const colourTitle = [...document.querySelectorAll('.inspector details > summary')].find((x) => x.textContent === 'Colour');
      return { field: a.helpForChecks(colourField), title: a.helpForChecks(colourTitle) };
    });
    ok('help texts follow where a label is: a ring\'s Colour field and the layer\'s Colour section get their own texts',
      colours.field === help.helpFor('Colour', { section: ['Shape: ring'], layer: 'shape', kind: 'ring' }) && colours.title === help.helpFor('Colour', { title: true, section: [], layer: 'shape', kind: 'ring' })
        && colours.field !== colours.title, JSON.stringify(colours));
    // The help texts do not change a control's name (the Width box is still called Width), and the label gets no ARIA.
    const names = await tp.evaluate(() => {
      const fold = [...document.querySelectorAll('.inspector details')].find((d) => d.querySelector(':scope > summary').textContent === 'Shape: ring');
      const lab = [...fold.querySelectorAll('.flab')].find((x) => x.textContent === 'Width');
      return { box: lab.closest('label.field').querySelector('input').getAttribute('aria-label'), labelAria: [...lab.attributes].map((x) => x.name).filter((n) => n.startsWith('aria') || n === 'title') };
    });
    const widthBoxes = await tp.getByRole('spinbutton', { name: 'Width', exact: true }).count();
    ok('help texts never replace a control\'s name: the Width box is still named Width, and its label gets no ARIA or title', names.box === 'Width' && names.labelAria.length === 0 && widthBoxes >= 1,
      `${JSON.stringify(names)}; ${widthBoxes} spinbutton(s) named Width`);
    // A scroll hides it.
    const scrolled = await tp.evaluate(async () => {
      const before = !!document.querySelector('.tooltip')?.matches(':popover-open');
      document.querySelector('.right').scrollTop += 40;
      await new Promise((r) => setTimeout(r, 60));
      return { before, after: !!document.querySelector('.tooltip')?.matches(':popover-open') };
    });

    // Every title becomes a tooltip: a layer row's (its full name) leaves its title for the tooltip, so no native one shows.
    await tp.evaluate(() => window.__vfx.app.pickEffect('rifle_shot'));
    await restPointer();
    const rowLoc = tp.locator('.layers-list .layer-item', { has: tp.locator(':scope > span', { hasText: /^Muzzle flash$/ }) });
    const rowHover = await hoverProbe(rowLoc);
    const rowTip = await tipNow();
    const rowAttrs = await rowLoc.evaluate((el) => ({ title: el.getAttribute('title'), tip: el.getAttribute('data-tip') }));
    ok('every title becomes a tooltip: the title moves into the tooltip on hover, so the browser\'s own does not show too; a scroll hides it',
      rowHover.delay >= 450 && rowAttrs.title === null && rowAttrs.tip === 'Muzzle flash' && rowTip.open && rowTip.lines[0] === 'Muzzle flash' && scrolled.before && !scrolled.after,
      `${JSON.stringify(rowAttrs)}; "${rowTip.lines.join(' | ')}" after ${rowHover.delay} ms; scroll: open ${scrolled.before} -> ${scrolled.after}`);
    // A name in brackets is a name, not a shortcut: a layer called "Smoke (2)" keeps it whole. And a click on a row (the
    // list is built again under the pointer) leaves no tooltip while the pointer stays.
    await tp.evaluate(() => { const a = window.__vfx.app; a.selectLayer('dust'); a.editLayer(['name'], 'Smoke (2)', { label: 'Rename layer' }); a.commit(); a.selectLayer(null); });
    await restPointer();
    const bracketRow = tp.locator('.layers-list .layer-item', { has: tp.locator(':scope > span', { hasText: /^Smoke \(2\)$/ }) });
    await hoverProbe(bracketRow);
    const bracketTip = await tipNow();
    await restPointer();
    const hitRow = tp.locator('.layers-list .layer-item', { has: tp.locator(':scope > span', { hasText: /^Hit spark$/ }) });
    const hitBox = await hitRow.boundingBox();
    await tp.mouse.move(hitBox.x + 40, hitBox.y + hitBox.height / 2);
    await tp.mouse.down();
    await tp.mouse.up();
    await tp.waitForTimeout(900);
    const afterRowClick = await tp.evaluate(() => ({ open: !!document.querySelector('.tooltip')?.matches(':popover-open'), layer: window.__vfx.app.layer()?.id ?? null }));
    await tp.keyboard.press('Control+z');
    ok('a name in brackets stays whole in its tooltip ("Smoke (2)", no shortcut); a click on a row built again under the pointer leaves no tooltip',
      bracketTip.open && bracketTip.lines[0] === 'Smoke (2)' && bracketTip.key === null && !afterRowClick.open && afterRowClick.layer === 'hit',
      `${JSON.stringify(bracketTip)}; after the click on Hit spark: ${JSON.stringify(afterRowClick)}`);

    // Undo and Redo name the step, with the shortcut and the help text; the tooltip follows when the step changes.
    await tp.evaluate(() => { const a = window.__vfx.app; a.editEffect(['controls', 'size'], 2, { label: 'Size' }); a.commit(); });
    await restPointer();
    const undoLoc = tp.locator('.topbar button[aria-label="Undo"]');
    await hoverProbe(undoLoc);
    const undoTip = await tipNow();
    await tp.keyboard.press('Control+z');
    await tp.waitForTimeout(100);
    const undoneTip = await tipNow();
    const undoName = await undoLoc.getAttribute('aria-label');
    ok('the Undo tooltip names the step, with its shortcut and help text, and follows when the step changes (its name stays Undo)',
      undoTip.lines[0] === 'Undo Size' && undoTip.key === 'Ctrl+Z' && undoTip.lines[1] === help.helpFor('Undo', { section: 'Top bar' }) && undoneTip.lines[0] === 'Nothing to undo' && undoName === 'Undo',
      `${JSON.stringify(undoTip)} -> ${JSON.stringify(undoneTip)}`);
    // A press hides it, and it stays away while the pointer stays (Loop, pressed twice: as it was).
    const loopLoc = tp.locator('.transport button', { hasText: /^Loop$/ });
    await restPointer();
    const loopHover = await hoverProbe(loopLoc);
    const loopTip = await tipNow();
    await loopLoc.click();
    await tp.waitForTimeout(700);
    const afterPress = await tipNow();
    await loopLoc.click();
    ok('a press hides the tooltip, and it does not come back while the pointer stays', loopHover.delay !== null && loopTip.open && loopTip.key === 'L' && !afterPress.open,
      `before the press: ${JSON.stringify(loopTip)}; after: open ${afterPress.open}`);

    // At once on keyboard focus (Shift+Tab from Keys to Night mode), named and explained; Esc hides it and still leaves the
    // layer, as Esc does.
    await tp.evaluate(() => { const a = window.__vfx.app; a.selectLayer('flash'); });
    await restPointer();
    await tp.locator('.topbar button', { hasText: /^Keys$/ }).focus();
    await tp.evaluate(() => Object.assign(window.__tipProbe, { overAt: null, openAt: null, at250: null, tabAt: null }));
    const quietFocus = await tipNow();
    await tp.keyboard.press('Shift+Tab');
    await tp.waitForFunction(() => window.__tipProbe.openAt !== null, null, { timeout: 5000 }).catch(() => {});
    const focusTip = await tipNow();
    const focused = await tp.evaluate(() => ({ name: document.activeElement?.getAttribute('aria-label'), desc: document.activeElement?.getAttribute('aria-describedby'),
      after: window.__tipProbe.openAt === null ? null : Math.round(window.__tipProbe.openAt - window.__tipProbe.tabAt) }));
    await tp.keyboard.press('Escape');
    await tp.waitForTimeout(50);
    const escTip = await tipNow();
    const escState = await tp.evaluate(() => ({ layer: window.__vfx.app.layer()?.id ?? null, focus: document.activeElement?.getAttribute('aria-label'), desc: document.activeElement?.getAttribute('aria-describedby') }));
    const nightNamed = await tp.getByRole('button', { name: 'Night mode', exact: true }).count();
    ok('a tooltip shows at once on keyboard focus (Tab), with the button\'s name and its help text, and describes the focused button; focus the editor moves shows none',
      !quietFocus.open && focusTip.open && focused.after !== null && focused.after < 120 && focused.name === 'Night mode' && focusTip.lines[0] === 'Night mode'
        && focusTip.lines[1] === help.helpFor('Night mode', { section: 'Top bar' }) && focused.desc === 'vfx-tooltip' && nightNamed === 1,
      `focus on ${focused.name}, open ${focused.after} ms after Tab: "${focusTip.lines.join(' | ')}"; after a focus by code: open ${quietFocus.open}`);
    ok('Esc hides the tooltip, and is not taken from the editor (it still goes back to the effect\'s settings)', !escTip.open && escState.layer === null && escState.focus === focused.name && escState.desc === null,
      JSON.stringify(escState));

    // It shows over the colour picker (a popover in the top layer): drawn on top, in its own colours.
    await tp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('board_beam'); a.selectLayer('emitter_glow'); a.openColourPicker('glow', document.querySelector('.inspector .swatch:not([hidden])')); });
    await restPointer();
    await hoverProbe(tp.locator('.cp-head button[aria-label="Close the colour picker"]'));
    const overPicker = await tp.evaluate(() => {
      const t = document.querySelector('.tooltip'), r = t.getBoundingClientRect(), pk = document.querySelector('.cpick').getBoundingClientRect();
      const x = Math.round(r.left + 10), y = Math.round(r.top + 3);
      return { x, y, inPicker: x > pk.left && x < pk.right && y > pk.top && y < pk.bottom, bg: getComputedStyle(t).backgroundColor, size: getComputedStyle(t).fontSize, max: getComputedStyle(t).maxWidth,
        lines: [...t.querySelectorAll(':scope > .tip-first > span, :scope > p')].map((q) => q.textContent), key: t.querySelector('kbd')?.textContent };
    });
    const pickShot = PNG.sync.read(await tp.screenshot({ path: join(shots, 'editor-tooltip-over-picker.png'), animations: 'disabled' }));
    const px = hex(pickShot, overPicker.x, overPicker.y);
    const bgHex = '#' + overPicker.bg.match(/\d+/g).slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase();
    await tp.locator('.cp-head button[aria-label="Close the colour picker"]').click();
    // Night: still dark (its own colour, not the panel's).
    const nightBg = await tp.evaluate(() => { document.documentElement.dataset.theme = 'dark'; const bg = getComputedStyle(document.querySelector('.tooltip')).backgroundColor; document.documentElement.dataset.theme = 'light'; return bg; });
    ok('the tooltip draws over the colour picker; it is 12 px, at most 280 px wide, dark in Day and in Night, with a title\'s shortcut in its kbd ("Close (Esc)")',
      overPicker.inPicker && diff(px, bgHex) <= 2 && bgHex === '#2A2A2A' && nightBg === 'rgb(30, 30, 30)' && overPicker.size === '12px' && overPicker.max === '280px'
        && overPicker.lines.join() === 'Close' && overPicker.key === 'Esc', `pixel ${px} at ${overPicker.x},${overPicker.y} (tooltip ${bgHex}, Night ${nightBg}); ${JSON.stringify(overPicker)}`);

    // Lines with no label of their own explain themselves too, with help.ts's texts for them: the "rides Bullet" tag in the
    // Layers list, and the line saying what draws a layer.
    const ownLines = await tp.evaluate(() => {
      const a = window.__vfx.app;
      a.pickEffect('rifle_shot');
      a.selectLayer('flash');
      const tracer = [...document.querySelectorAll('.layers-list .layer-item')].find((b) => b.querySelector(':scope > span')?.textContent === 'Tracer');
      const rides = tracer?.querySelector('code.rides'), draws = document.querySelector('.inspector .draws');
      const out = { rides: rides ? a.tipForChecks(rides) : null, draws: draws ? a.tipForChecks(draws) : null };
      a.selectLayer('bullet');
      out.path = a.tipForChecks(document.querySelector('.inspector .draws'));
      a.selectLayer(null);
      return out;
    });
    ok('the "rides" tag in the Layers list and the line saying what draws a layer explain themselves in their tooltips (help.ts)',
      ownLines.rides?.lines.join() === help.NEW_THIS_ROUND.ridesTag('Bullet') && ownLines.draws?.lines.join() === help.NEW_THIS_ROUND.drawnFromImage('muzzle_flash.png')
        && ownLines.path?.lines.join() === help.NEW_THIS_ROUND.invisiblePath, JSON.stringify(ownLines));

    // Every label and section title of the right panel, for every effect and layer of both examples, and the bars' controls,
    // has a help text (as tools/ui-shots.mjs reads the panel: field labels, checkboxes, folds' and cards' titles, cost rows).
    const sweep = await tp.evaluate(async () => {
      const a = window.__vfx.app;
      const LABELS = '.lab > label, .lab > span:first-child:not(.hint):not(.val), .flab, label.check, details > summary, section.card > h2, .card-head > h2, table.cost th';
      const misses = new Set(), seen = new Set();
      let checked = 0;
      const look = (where) => {
        for (const el of document.querySelectorAll(`.inspector :is(${LABELS})`)) {
          if (el.matches('table.cost thead th') && !el.textContent.trim()) continue; // the empty corner of the cost table
          checked++;
          const t = el.textContent.replace(/\s+/g, ' ').trim();
          seen.add(t);
          if (!a.helpForChecks(el)) misses.add(`${where}: "${t}"`);
        }
      };
      for (const project of ['examples/demo-project', 'examples/hits-collection']) {
        if (project !== 'examples/demo-project') { window.confirm = () => true; await a.openProject(project); }
        for (const id of a.debugState().effects) {
          a.pickEffect(id);
          look(id);
          for (const l of a.effect().layers) { a.selectLayer(l.id); look(`${id}/${l.id}`); }
          a.selectLayer(null);
        }
      }
      const BAR = { 'Top bar': ['Projects…', 'Save as…', 'Export…', 'Undo', 'Redo', 'Night mode', 'Keys'], 'Preview bar': ['Fire', 'Scene', 'Faction that fired', 'Made by', 'Distance from you', 'Tier', 'Low', 'Medium', 'High', 'View', 'Close-up on'],
        Transport: ['Step back', 'Play', 'Step forward', 'Loop', 'Speed', 'Time'], Effects: ['Effects', 'New', 'From preset…'], Layers: ['Layers', 'Add a layer', 'Move up', 'Move down', 'Duplicate', 'Delete layer'] };
      const bars = [];
      for (const [section, labels] of Object.entries(BAR)) {
        const region = document.querySelector(`[data-help-section="${section}"]`);
        for (const label of labels) {
          const el = [...region.querySelectorAll('button, .lab > span, .flab, select, [data-help-label], h2')].find((x) => !x.closest('.effects-list, .layers-list') && (x.getAttribute('aria-label') === label || x.getAttribute('data-help-label') === label || x.textContent.replace(/\s+/g, ' ').trim() === label));
          if (!el || !a.helpForChecks(el)) bars.push(`${section}: ${label}${el ? '' : ' (not found)'}`);
        }
      }
      return { checked, distinct: seen.size, misses: [...misses], bars };
    });
    ok('every label and section title of the right panel (every layer of both examples) and every control of the bars has a help text',
      sweep.misses.length === 0 && sweep.bars.length === 0 && sweep.checked > 5000 && sweep.distinct >= 195,
      `${sweep.checked} labels and titles checked (${sweep.distinct} different); missing: ${[...sweep.misses.slice(0, 4), ...sweep.bars.slice(0, 4)].join(', ') || 'none'}`);
    ok('the tooltip page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await tp.close();
  }

  // -- typed game events count as unsaved: opening another project asks first, and so does leaving the page.
  // (This headless browser never shows the leave-page dialog, so the check sends the leave event itself and reads whether
  // the editor held it back.)
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const leaveHeld = () => g.page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    const heldBefore = await leaveHeld();
    await g.page.evaluate(() => window.__vfx.app.pickEffect('board_beam'));
    await g.page.locator('.events input').click();
    await g.page.locator('.events input').fill('hammer.leech, hammer.leech.check');
    const asked = await g.page.evaluate(async () => {
      const said = [];
      window.confirm = (m) => { said.push(m); return false; };
      const opened = await window.__vfx.app.openProject('examples/hits-collection');
      return { opened, said, still: window.__vfx.app.debugState().effects.includes('board_beam') };
    });
    ok('typed game events are unsaved changes: opening another project asks first', asked.opened === false && asked.said.length === 1 && asked.still, JSON.stringify(asked));
    const heldAfter = await leaveHeld();
    ok('typed game events are unsaved changes: leaving the page asks first', !heldBefore && heldAfter, `held back before typing: ${heldBefore}, after: ${heldAfter}`);
    await g.page.close();
  }

  // -- a project whose project.json is version 1 still opens, with its scenes, and opening it writes nothing. The examples
  // are version 2, so the check keeps a version 1 file of its own (the demo's, as it was).
  {
    const old = `browser-check-v1-${Date.now()}`;
    const odir = join(repo, 'projects', old);
    cpSync(join(repo, 'examples', 'demo-project'), odir, { recursive: true });
    const oldText = readFileSync(join(repo, 'packages', 'vfx-editor', 'test', 'fixtures', 'project-v1', 'demo-project.json'), 'utf8');
    writeFileSync(join(odir, 'project.json'), oldText);
    const g = await open(`${base}/?backend=webgl&project=projects/${old}`, () => window.__vfx && window.__vfx.ready);
    const got = await g.page.evaluate(() => {
      const a = window.__vfx.app;
      a.pickEffect('board_shell');
      return { effects: a.debugState().effects.length, name: document.querySelector('.project-name')?.textContent ?? '', scene: a.previewForChecks.scene.id };
    });
    await g.page.close();
    const untouched = readFileSync(join(odir, 'project.json'), 'utf8') === oldText;
    rmSync(odir, { recursive: true, force: true });
    ok('a project whose project.json is version 1 opens, with its scenes, and opening it writes nothing', oldText.includes('"version": 1,') && got.effects === 6
      && got.name.startsWith('Demo project') && got.scene === 'board-shell' && untouched, JSON.stringify({ ...got, untouched }));
  }

  // -- a deleted effect's budgets: saving leaves them out of project.json; after undo, the next save writes them again,
  // even with nothing else changed. On the same page: the cost card names a class with a long name in one or two lines.
  {
    const bud = `browser-check-budgets-${Date.now()}`;
    const bdir = join(repo, 'projects', bud);
    cpSync(join(repo, 'examples', 'demo-project'), bdir, { recursive: true });
    const longClass = 'Big explosions that fill most of the screen and last a long time';
    const budgets = {
      classes: { on: true, list: [{ id: 'small', name: 'Small' }, { id: 'normal', name: 'Normal' }, { id: 'big', name: longClass, limits: { high: { triangles: 9000 } } }] },
      effects: { board_shell: { class: 'big' }, rifle_shot: { on: true, limits: { high: { draws: 1 } } } },
    };
    const demoMeta = JSON.parse(readFileSync(join(repo, 'examples', 'demo-project', 'project.json'), 'utf8'));
    writeFileSync(join(bdir, 'project.json'), `${JSON.stringify({ ...demoMeta, budgets }, null, 2)}\n`);
    const g = await open(`${base}/?backend=webgl&project=projects/${bud}`, () => window.__vfx && window.__vfx.ready);
    g.page.on('dialog', (d) => d.accept());
    const fileMeta = () => JSON.parse(readFileSync(join(bdir, 'project.json'), 'utf8'));
    const saved = async () => {
      await g.page.keyboard.press('Control+s');
      await g.page.waitForFunction(() => !document.querySelector('.project-name')?.textContent?.includes('•'), null, { timeout: 15000 }).catch(() => {});
      await g.page.waitForTimeout(300);
    };
    // The level line, as drawn: its lines counted from where each line of its text starts.
    await g.page.evaluate(() => window.__vfx.app.pickEffect('board_shell'));
    await g.page.waitForTimeout(150);
    const level = await g.page.evaluate(() => {
      const el = document.querySelector('.costcard .cost-level');
      const r = document.createRange();
      r.selectNodeContents(el);
      // Its tooltip's words: the title, or data-tip once the title has moved into the tooltip.
      return { text: el.textContent, title: el.title || el.dataset.tip || '', lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size };
    });
    ok('the cost card names a class with a long name in one or two lines, the whole name in its tooltip', level.lines >= 1 && level.lines <= 2
      && level.text.startsWith('The budgets of its class "Big explosions') && level.title.includes(longClass), `${level.lines} line(s): "${level.text}"`);
    // Delete the rifle shot and save, with nothing else changed: project.json leaves out its budgets (and events).
    await g.page.click('.effects-list .item:has-text("Rifle shot (demo)") button[aria-label^="Delete"]');
    await g.page.waitForTimeout(150);
    await saved();
    const afterDelete = fileMeta();
    await g.page.keyboard.press('Control+z');
    await g.page.waitForTimeout(150);
    const back = await g.page.evaluate(() => ({ effects: window.__vfx.app.debugState().effects, budget: window.__vfx.app.budgets().effects.rifle_shot ?? null }));
    await saved();
    const afterUndo = fileMeta();
    await g.page.close();
    rmSync(bdir, { recursive: true, force: true });
    ok('saving after deleting an effect leaves its budgets out of project.json; after undo, the next save writes them again',
      !afterDelete.budgets?.effects?.rifle_shot && !afterDelete.events?.rifle_shot && afterDelete.budgets?.effects?.board_shell?.class === 'big'
      && back.effects.includes('rifle_shot') && back.budget?.on === true
      && JSON.stringify(afterUndo.budgets?.effects?.rifle_shot) === JSON.stringify(budgets.effects.rifle_shot) && afterUndo.events?.rifle_shot?.length > 0,
      JSON.stringify({ afterDelete: afterDelete.budgets?.effects, afterUndo: afterUndo.budgets?.effects, events: afterUndo.events?.rifle_shot }));
  }

  // -- a project whose project.json is a newer version is not opened, so it is never written over; the editor says why,
  // also when it is the project the editor starts with (it opens the demo instead, and the message keeps the reason).
  {
    const future = `browser-check-future-${Date.now()}`;
    const fdir = join(repo, 'projects', future);
    mkdirSync(join(fdir, 'effects'), { recursive: true });
    const futureText = `${JSON.stringify({ format: 'shamble-vfx-project', version: 3, name: 'From the future' }, null, 2)}\n`;
    writeFileSync(join(fdir, 'project.json'), futureText);
    const g = await open(`${base}/?backend=webgl&project=projects/${future}`, () => window.__vfx && window.__vfx.ready);
    const atStart = await g.page.evaluate(() => ({
      status: document.querySelector('.status')?.textContent ?? '', bad: !!document.querySelector('.status.bad'), name: document.querySelector('.project-name')?.textContent ?? '',
    }));
    ok('a newer project.json the editor starts with is not opened; the demo opens instead, and the message says why', atStart.name.startsWith('Demo project') && atStart.bad
      && atStart.status === 'Could not open From the future: project.json is version 3, and this Shamble VFX reads version 2 and older: update Shamble VFX to open this project. Opened Demo project instead (an example: use "Save as" to keep changes).',
      `${atStart.status} (on ${atStart.name})`);
    const tried = await g.page.evaluate(async (id) => {
      const opened = await window.__vfx.app.openProject(id);
      return { opened, status: document.querySelector('.status')?.textContent ?? '', name: document.querySelector('.project-name')?.textContent ?? '' };
    }, `projects/${future}`);
    await g.page.close();
    const untouched = readFileSync(join(fdir, 'project.json'), 'utf8') === futureText;
    rmSync(fdir, { recursive: true, force: true });
    ok('a project whose project.json is a newer version is not opened, and the editor says why', tried.opened === false && untouched && tried.name.startsWith('Demo project')
      && tried.status === 'Could not open From the future: project.json is version 3, and this Shamble VFX reads version 2 and older: update Shamble VFX to open this project.', `${tried.status} (still on ${tried.name})`);
  }
}

// ---------------------------------------------------------------- 4. the game-side test page, on both backends
{
  const exporter = await server.ssrLoadModule('/server/export.ts');
  for (const project of ['demo-project', 'hits-collection']) {
    const r = await exporter.exportProject(join(repo, 'examples', project), join(repo, 'exports', project));
    ok(`npm run export: examples/${project} exports`, r.ok, r.errors.slice(0, 2).join(' | ') || `${r.effects} effects, ${r.events} events`);
  }
  const tpRoot = join(repo, 'packages', 'vfx-testpage');
  const tp = await createServer({ root: tpRoot, configFile: join(tpRoot, 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
  await tp.listen();
  const tpBase = tp.resolvedUrls.local[0].replace(/\/$/, '');
  const demoManifest = JSON.parse(readFileSync(join(repo, 'exports', 'demo-project', 'manifest.json'), 'utf8'));
  const ground = '#B8A683';
  const decode = (url) => PNG.sync.read(Buffer.from(url.split(',')[1], 'base64'));
  const drawnPixels = (png) => { let n = 0; for (let y = 0; y < png.height; y += 4) for (let x = 0; x < png.width; x += 4) if (diff(hex(png, x, y), ground) > 6) n++; return n; };
  const moments = { 'rifle.shot': 60, 'tank.shot': 1300, 'molotov.land': 1200, 'hammer.leech': 1000, 'demo.rifle.shot': 30, 'demo.tank.shot': 600 };
  const snaps = {};
  for (const backend of ['webgpu', 'webgl']) {
    const label = `test page, ${backend}`;
    const { page, errors } = await open(`${tpBase}/?export=demo-project&offscreen=1${backend === 'webgl' ? '&backend=webgl' : ''}`, () => window.__test && window.__test.ready);
    const info = await page.evaluate(() => ({ error: window.__test.error, backend: window.__test.backend, events: window.__test.events }));
    if (info.error) { ok(`[${label}] loads the export`, false, info.error); await page.close(); continue; }
    ok(`[${label}] loads the export and lists its game events`, info.events.join() === Object.keys(demoManifest.events).sort().join(), `${info.backend}: ${info.events.join(', ')}`);
    const probes = await page.evaluate(() => window.__test.probe('allies'));
    const pp = decode(await page.evaluate(() => window.__test.snapshot()));
    const bad = probes.filter((q) => diff(hex(pp, q.x, q.y), q.expect) > 1).map((q) => `${q.label}: got ${hex(pp, q.x, q.y)}, want ${q.expect}`);
    ok(`[${label}] palette colours come out exactly (from the export's palette.json)`, bad.length === 0, bad.join('; ') || probes.map((q) => q.label).join(', '));
    snaps[backend] = {};
    for (const [event, t] of Object.entries(moments)) {
      const r = await page.evaluate(([e, t]) => window.__test.renderAt(e, t), [event, t]);
      const png = decode(await page.evaluate(() => window.__test.snapshot()));
      snaps[backend][event] = png;
      if (['rifle.shot', 'tank.shot', 'molotov.land', 'hammer.leech'].includes(event)) writeFileSync(join(shots, `testpage-${event.replace(/\./g, '-')}-${backend}.png`), PNG.sync.write(png));
      ok(`[${label}] "${event}" plays ${r.id}`, r.id === demoManifest.events[event] && r.triangles > 0 && drawnPixels(png) > 50, `${r.triangles} triangles, ${drawnPixels(png)} samples drawn`);
    }
    const low = await page.evaluate(() => window.__test.renderAt('tank.shot', 1300, { tier: 'low' }));
    const high = await page.evaluate(() => window.__test.renderAt('tank.shot', 1300, { tier: 'high' }));
    ok(`[${label}] the Low tier draws less of the tank shell than High`, low.triangles < high.triangles, `${low.triangles} triangles in Low, ${high.triangles} in High`);
    ok(`[${label}] has no errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }
  if (snaps.webgpu && snaps.webgl && webgpu) {
    for (const event of ['tank.shot', 'molotov.land', 'hammer.leech']) {
      const a = snaps.webgpu[event], b = snaps.webgl[event];
      const W = a.width, H = a.height;
      const avg = (png, x, y, k) => (png.data[(y * W + x) * 4 + k] + png.data[(y * W + x + 1) * 4 + k] + png.data[((y + 1) * W + x) * 4 + k] + png.data[((y + 1) * W + x + 1) * 4 + k]) / 4;
      let off = 0, n = 0;
      for (let y = 0; y < H - 2; y += 2) for (let x = 0; x < W - 2; x += 2) {
        let d = 0;
        for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(avg(a, x, y, k) - avg(b, x, y, k)));
        if (d > 48) off++;
        n++;
      }
      ok(`test page: "${event}" looks the same on WebGPU and WebGL 2`, off / n < 0.0015, `${((off / n) * 100).toFixed(3)} % of the screen differs`);
    }
  }
  // The hits collection: every event plays.
  {
    const { page, errors } = await open(`${tpBase}/?export=hits-collection&offscreen=1&backend=webgl`, () => window.__test && window.__test.ready);
    const evs = await page.evaluate(() => window.__test.events ?? []);
    const silent = [];
    for (const e of evs) {
      const r = await page.evaluate((e) => window.__test.renderAt(e, 200), e);
      const png = decode(await page.evaluate(() => window.__test.snapshot()));
      if (!(r.triangles > 0) || drawnPixels(png) < 20) silent.push(e);
    }
    ok('test page: every hit in the hits export plays by its event', evs.length === 10 && silent.length === 0, silent.length ? `nothing drawn for ${silent.join(', ')}` : `${evs.length} events`);
    ok('test page (hits) has no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }
  // A glow coloured by a banded gradient (flat colours, so they read back exactly), through export and the test page.
  {
    const dir = join(repo, 'out', '_check-gradient-project');
    rmSync(dir, { recursive: true, force: true });
    cpSync(join(repo, 'examples', 'hits-collection'), dir, { recursive: true });
    const pal = JSON.parse(readFileSync(join(repo, 'packages', 'vfx-format', 'palette', 'palette.json'), 'utf8'));
    pal.gradients['check.bands'] = { kind: 'banded', from: 'mustafa', stops: [{ at: 0, hex: '#00FF00' }, { at: 0.5, hex: '#0000FF' }] };
    writeFileSync(join(dir, 'palette.json'), JSON.stringify(pal, null, 2) + '\n');
    const file = join(dir, 'effects', 'hit_energy_pulse.vfx.json');
    const fx = JSON.parse(readFileSync(file, 'utf8'));
    fx.layers = fx.layers.filter((l) => l.id === 'glow').map((l) => ({ ...l, blend: 'normal', alpha: undefined, shape: { ...l.shape, gradient: 'check.bands', alpha: 1, flicker: 0, grow: [1, 1] } }));
    writeFileSync(file, JSON.stringify(fx, null, 2) + '\n');
    const out = join(repo, 'exports', '_check-gradient');
    const r = await exporter.exportProject(dir, out);
    ok('a glow coloured by a gradient exports', r.ok, r.errors.slice(0, 2).join(' | '));
    for (const backend of ['webgpu', 'webgl']) {
      const g = await open(`${tpBase}/?export=_check-gradient&offscreen=1${backend === 'webgl' ? '&backend=webgl' : ''}`, () => window.__test && window.__test.ready);
      const res = await g.page.evaluate(() => window.__test.renderAt('hit.energy.pulse', 150));
      const png = decode(await g.page.evaluate(() => window.__test.snapshot()));
      let green = 0, blue = 0;
      for (let y = 0; y < png.height; y += 2) for (let x = 0; x < png.width; x += 2) { const c = hex(png, x, y); if (diff(c, '#00FF00') <= 2) green++; if (diff(c, '#0000FF') <= 2) blue++; }
      ok(`[test page, ${backend}] the glow is drawn from the export's gradient: both bands, in their exact colours`, res.triangles > 0 && green > 50 && blue > 50, `${green} green and ${blue} blue samples`);
      writeFileSync(join(shots, `testpage-gradient-glow-${backend}.png`), PNG.sync.write(png));
      await g.page.close();
    }
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
  // The version guard and a missing export, in plain words.
  {
    const old = join(repo, 'exports', '_check-old-effects');
    cpSync(join(repo, 'exports', 'demo-project'), old, { recursive: true });
    const m = JSON.parse(readFileSync(join(old, 'manifest.json'), 'utf8'));
    m.effectVersion = 2;
    writeFileSync(join(old, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
    const g1 = await open(`${tpBase}/?export=_check-old-effects&offscreen=1&backend=webgl`, () => window.__test && window.__test.ready);
    const e1 = await g1.page.evaluate(() => window.__test.error ?? '');
    ok('test page: effects of an older version are refused in plain words', /version 2, and this runtime plays version 5: export them again/.test(e1), e1);
    await g1.page.close();
    rmSync(old, { recursive: true, force: true });
    const g2 = await open(`${tpBase}/?export=_check-missing&offscreen=1&backend=webgl`, () => window.__test && window.__test.ready);
    const e2 = await g2.page.evaluate(() => window.__test.error ?? '');
    ok('test page: a missing export names the command that makes one', /npm run export/.test(e2), e2.slice(0, 140));
    await g2.page.close();
  }
  await tp.close();
}

await browser.close();
await server.close();
rmSync(checkTmp, { recursive: true, force: true });
{
  const after = existsSync(realPalettes) ? readdirSync(realPalettes).sort().join() : null;
  ok('the real palettes/ folder is not touched (the check used a temporary one)', after === realPalettesBefore, realPalettesBefore === null ? (after === null ? 'not there, before or after' : 'made during the check') : 'compared its files');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.filter((r) => !r.note).length - failed.length} passed, ${failed.length} failed. Screenshots: out/screenshots/`);
process.exit(failed.length ? 1 : 0);
