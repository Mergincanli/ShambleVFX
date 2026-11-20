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
//    the selection; its rows: numbers you drag or type, whole numbers in whole steps, groups of numbers (a flipbook's
//    Grid in a narrow panel too, and Cost's title there), shortened segments, the colour roles' swatches, Tab through
//    every number box; the headers' More menus, the problems banner, no Cost or Checks under a layer; the
//    effect's sections: Folder, the Phases bar, Main colour and Edit palette…, Cost closed at first with its Budgets toggle;
//    a layer's: the tier chips, the Image section, readouts, a glow's gradient edit button; the done-when at 1920; Part B:
//    a word layer's words with their chances, gradients on smoke, the bed and bursts, the Budgets place in Cost, the "not
//    drawn" warning), the
//    layer icons, the tooltips and their help texts, the shell (the grid's sizes, the splitters, the
//    status bar, the main menu, the scale, typing a time), the effects list (folders, search, the rows' menus, renaming,
//    Move to folder, Duplicate, Delete) and the layers list (the add menu, the rows' buttons and menus, renaming, drag to
//    reorder, the sync with the timeline) with their keys, the timeline (its sizes, the bars' labels inside or beside their
//    bars, the phases' names, the playhead and its head, the ruler staying at the top, clicks and scrubs, the selected, hovered
//    and left-out rows, the edge round a label while a hover fades or the theme changes), Save as into projects/, Export
//    and Import, and the palette profiles Import adds (everything made is deleted again after). Palette profiles go to a
//    temporary folder (VFX_PALETTES_DIR), so the real palettes/ is never touched.
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

/** Choose a row in a chip's menu with the mouse: click the chip, then the row with that label. */
async function chooseInMenu(page, chipSelector, label) {
  await page.click(chipSelector);
  const id = await page.locator(chipSelector).getAttribute('aria-controls');
  await page.locator(`#${id} .menu-item`, { has: page.locator('.menu-label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) }).click();
}

/** A name as a whole-text pattern (brackets and the like taken as they are). */
const exactly = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
/** An effect's row in the Effects list, by the name it shows (without its folder). */
const effectRow = (page, name) => page.locator('.effects-list .item', { has: page.locator('.item-name', { hasText: exactly(name) }) });
/** A row of an open menu (on body), by its label. */
const menuRow = (page, menuId, label) => page.locator(`#${menuId} .menu-item`, { has: page.locator('.menu-label', { hasText: exactly(label) }) });
/** Open an effect's menu with its More button (shown on hover), and choose a row in it. */
async function effectMenu(page, name, label) {
  const row = effectRow(page, name);
  await row.hover();
  await row.locator('.more').click();
  await page.waitForSelector('#effect-menu:popover-open', { timeout: 5000 });
  if (label) await menuRow(page, 'effect-menu', label).click();
}
/**
 * An icon button whose menu is open, after the pointer has gone into the menu: is it still shown, and does it look open as a
 * chip with its menu open (4.6): the field colour, the icon in --accent-ink?
 */
async function openLook(page, button, menuId) {
  const box = await page.locator(`#${menuId}`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4);
  await page.waitForTimeout(250);
  return button.evaluate((b) => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--accent-ink)';
    probe.style.backgroundColor = 'var(--bg-field)';
    document.body.append(probe);
    const want = getComputedStyle(probe);
    const look = { shown: b.getClientRects().length > 0, expanded: b.getAttribute('aria-expanded'),
      icon: getComputedStyle(b.querySelector('svg')).color === want.color, field: getComputedStyle(b).backgroundColor === want.backgroundColor };
    probe.remove();
    return look;
  });
}
/** The + menu of the Effects header: New effect or From preset…. */
async function addEffectMenu(page, label) {
  await page.click('.effects-section .add-effect');
  await page.waitForSelector('#add-effect-menu:popover-open', { timeout: 5000 });
  await menuRow(page, 'add-effect-menu', label).click();
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
  // Only the game screen: the preview is the whole window, and none of the editor's parts shows round it, the new ones
  // included (the status bar, the splitters, the toolbar's chips, every menu and popover even when opened, one at a time,
  // the scale in the View chip).
  const frameOnly = await fr.page.evaluate(() => {
    const visible = (e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
    const shown = (s) => [...document.querySelectorAll(s)].some(visible);
    const popups = [...document.querySelectorAll('.menu, .popover')];
    const popupShown = popups.filter((m) => { m.showPopover(); const v = visible(m); m.hidePopover(); return v; }).map((m) => m.id);
    const v = document.querySelector('.viewport').getBoundingClientRect();
    return { viewport: [v.x, v.y, v.width, v.height].join(), popups: popups.length, popupShown,
      shown: ['.topbar', '.hints-toggle', '.statusbar', '.splitter', '.menu', '.popover', '.scale-text', '.vbar', '.chip-btn', '.fire', '.transport', '.timeline-pane', '.left', '.right', '.vhint', '.frame-label', '.vcorner', '.vnotes'].filter(shown) };
  });
  ok(`[${label}] ?frame=1 shows only the game screen: the preview fills the 1920 x 1080 window, with no bar, chip, status bar, splitter, menu, popover, scale or note over it ("not drawn") round it`,
    frameOnly.viewport === '0,0,1920,1080' && frameOnly.shown.length === 0 && frameOnly.popups >= 7 && frameOnly.popupShown.length === 0, JSON.stringify(frameOnly));
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
  // The words (since UI phase 6, Part B, one row per word under the label "Words (one picked per play)", where a comma list
  // was): a word typed again keeps its chance, a new word gets none, and undo puts them back. Typed into the rows: the first
  // becomes WHAM, the second is typed again (with its chance), the third becomes ZAP; three undo steps (the chance and two
  // words) put them back, where the comma list took one for the whole list.
  await p.evaluate(() => { const a = window.__vfx.app; a.selectLayer('word'); a.editLayer(['words', 1, 'chance'], 30); a.commit(); });
  await p.waitForTimeout(150);
  const wordBox = (n) => p.locator(`.inspector .word-list input[aria-label="Word ${n}"]`);
  const shownWords = await p.evaluate(() => [...document.querySelectorAll('.inspector .word-list input.word-text')].map((x) => x.value).join(', '));
  for (const [n, typed] of [[1, 'wham'], [2, 'krakoom'], [3, 'zap']]) { await wordBox(n).fill(typed); await wordBox(n).press('Enter'); }
  await p.locator('.timeline').click({ position: { x: 60, y: 8 } });
  const typedWords = (await L('word')).words;
  for (let k = 0; k < 3; k++) await p.keyboard.press('Control+z');
  const wordsBack = (await L('word')).words;
  ok('the words show one row each (capitals); a word typed again in its row keeps its chance, a new word gets none, and undo puts them back',
    shownWords === 'KABOOM, KRAKOOM, BADOOM, WHAM' && JSON.stringify(typedWords) === JSON.stringify([{ text: 'WHAM' }, { text: 'KRAKOOM', chance: 30 }, { text: 'ZAP' }, { text: 'WHAM' }])
      && JSON.stringify(wordsBack) === JSON.stringify([{ text: 'KABOOM' }, { text: 'KRAKOOM' }, { text: 'BADOOM' }, { text: 'WHAM' }]),
    `"${shownWords}" -> ${JSON.stringify(typedWords)}, after three undos ${JSON.stringify(wordsBack)}`);
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
  await p.click('.layers-section .add-layer');
  await p.waitForSelector('#add-layer-menu:popover-open', { timeout: 5000 });
  await menuRow(p, 'add-layer-menu', 'Cloud blast').click();
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
  await addEffectMenu(p, 'From preset…');
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

  // -- dragging the target keeps it under the cursor, in every view (chosen in the View chip's menu)
  for (const view of ['Whole screen', 'Game size', 'Close-up']) {
    await chooseInMenu(p, '.vbar .view-chip', view);
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
  await chooseInMenu(p, '.vbar .view-chip', 'Whole screen');

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
  // Since UI phase 6 Cost is a section that folds, closed at first, and its budget boxes show while its Budgets toggle is
  // on: open it and switch Budgets on, as a person does, before typing a budget.
  await p.locator('.inspector .costcard > details > summary').click();
  await p.locator('.inspector .costcard .cost-budgets input').check();
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

  // -- the right panel shows what is selected. A layer: only its settings, under a header with the effect's name (back to
  // the effect's settings, as Esc is), "›", its icon and name; since UI phase 6 no Cost and no Checks under it (the effect's
  // view ends with Cost; the problems banner and the status bar show the problems). Every layer says what draws it; a
  // projectile, which draws nothing, lists the layers riding it, and they say so in the Layers list.
  const layerInfo = await server.ssrLoadModule('/src/doc/layer-info.ts');
  const layerRow = (name) => p.locator('.layers-list .layer-item', { has: p.locator(':scope > span', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) });
  const panel = () => p.evaluate(() => {
    const ins = document.querySelector('.inspector');
    const head = ins.querySelector(':scope > .insp-head');
    const card = ins.querySelector(':scope > section.card.layer');
    const top = ins.getBoundingClientRect().top;
    // The effect's header: its dot, in the colour of the main colour's swatch in the colour list.
    const dot = head?.querySelector('.fx-dot'), mainChip = ins.querySelector('.swatch[aria-current="true"] .chip'), effectCard = ins.querySelector(':scope > section.card.bigcontrols');
    return {
      layer: window.__vfx.app.layer()?.id ?? null, first: ins.firstElementChild?.className ?? '', second: ins.children[1]?.className ?? '',
      kind: head?.querySelector('.insp-kind')?.textContent ?? null, effectTop: effectCard ? Math.round(effectCard.getBoundingClientRect().top - top) : null,
      dot: dot ? { dot: getComputedStyle(dot).backgroundColor, main: mainChip ? getComputedStyle(mainChip).backgroundColor : null } : null,
      link: head?.querySelector('.crumb')?.textContent ?? null, title: head?.querySelector('.insp-title')?.textContent ?? null,
      icon: !!head?.querySelector('svg, img'), headH: head ? Math.round(head.getBoundingClientRect().height) : null,
      cardTop: card ? Math.round(card.getBoundingClientRect().top - top) : null, effectSettings: !!ins.querySelector('.bigcontrols'),
      // What draws the layer: since UI phase 6 the first line of its Layer section (it was right under the layer's kind).
      draws: card?.querySelector('.draws')?.textContent ?? null, drawsFile: card?.querySelector('.draws code')?.textContent ?? null,
      // Cost and Checks in the view, in order, and whether Cost is the last section.
      costAndChecks: [...ins.children].map((c) => c.classList.contains('costcard') ? 'cost' : c.classList.contains('checks') ? 'checks' : null).filter(Boolean).join(),
      costLast: !!ins.lastElementChild?.classList.contains('costcard'),
    };
  });
  await p.evaluate(() => window.__vfx.app.pickEffect('rifle_shot'));
  await layerRow('Muzzle flash').click();
  const sel = await panel();
  ok('a layer\'s settings come first, under a header: the effect\'s name, "›", the layer\'s icon and name; the effect\'s settings are not shown, and neither are Cost and Checks',
    sel.layer === 'flash' && sel.first === 'insp-head' && sel.link === 'Rifle shot (demo)' && sel.title === 'Muzzle flash' && sel.icon && sel.cardTop === sel.headH
      && !sel.effectSettings && sel.costAndChecks === '', JSON.stringify(sel));
  await p.locator('.inspector .insp-head .crumb').click();
  const back = await panel();
  ok('clicking the effect\'s name in the header goes back to the effect\'s settings, under the effect\'s own 40 px header: a dot in its main colour, its name and "Effect"; the Effect section follows, and Cost ends it',
    back.layer === null && back.effectSettings && back.first === 'insp-head effect-head' && back.second.includes('bigcontrols') && back.link === null && back.title === 'Rifle shot (demo)'
      && back.kind === 'Effect' && !!back.dot && back.dot.dot === back.dot.main && back.headH === 40 && back.effectTop === back.headH && back.costAndChecks === 'cost' && back.costLast, JSON.stringify(back));
  await layerRow('Hit spark').click();
  // The layer's name: "Name" in its Layer section since UI phase 6 (it was "Layer name").
  await p.locator('.inspector label.field', { has: p.locator('.flab', { hasText: /^Name$/ }) }).locator('input').focus();
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

  // -- the right panel's rows (docs/ui-redesign.md 6.6, UI phase 6). A property row is a grid: the label on the left (its
  // column at least 84 px, at most 38 % of the row), the control on the right; rows 28 px with 4 px between them. Numbers
  // use scrubNumber: drag the label or a prefix sideways, or type ("0,5" works too); one drag is one undo step, Enter one,
  // Esc none, ↑ one a press. Two or three numbers share a row, each box with a short prefix and its full name as its name
  // and tooltip. A segment whose words do not fit is shortened, its full words in its tooltip. A colour role's select has a
  // swatch of the role's colour, for the faction shown. On a page of its own.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const rp = g.page;
    rp.on('dialog', (d) => d.accept());
    const help = await server.ssrLoadModule('/src/app/help.ts');
    const undoNow = () => rp.evaluate(() => { const h = window.__vfx.app.history; return { n: h.past.length, label: h.undoLabel ?? null, dirty: h.dirty }; });
    const layerNow = (path) => rp.evaluate((path) => path.reduce((v, k) => v?.[k], window.__vfx.app.layer()), path);
    const select = (fx, layer) => rp.evaluate(({ fx, layer }) => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect(fx); a.selectLayer(layer); }, { fx, layer });
    /** Drag an element sideways by dx px, in steps, with the real mouse. */
    const dragBy = async (loc, dx) => {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      const x = b.x + Math.min(10, b.width / 2), y = b.y + b.height / 2;
      await rp.mouse.move(x, y);
      await rp.mouse.down();
      for (let k = 1; k <= 10; k++) await rp.mouse.move(x + (dx * k) / 10, y);
      await rp.mouse.up();
    };
    const row = (section, label) => rp.locator('.inspector details', { has: rp.locator(':scope > summary', { hasText: exactly(section) }) })
      .locator('.prop', { has: rp.locator(':scope > .flab', { hasText: exactly(label) }) }).first();

    // The grid: the Size and place section of the Muzzle flash.
    await select('rifle_shot', 'flash');
    const grid = await rp.evaluate(() => {
      const fold = [...document.querySelectorAll('.inspector details')].find((d) => d.querySelector(':scope > summary').textContent === 'Size and place');
      const rows = [...fold.querySelectorAll(':scope > .foldbody > .prop')];
      const box = (e) => e.getBoundingClientRect();
      const w = rows[0], h = rows[1];
      const cols = getComputedStyle(w).gridTemplateColumns.split(' ').map(parseFloat);
      const lab = w.querySelector(':scope > .flab');
      return { labels: rows.map((r) => r.querySelector(':scope > .flab')?.textContent), rowH: rows.map((r) => Math.round(box(r).height)), gap: Math.round(box(h).top - box(w).bottom),
        labelCol: cols[0], want: Math.max(84, 0.38 * box(w).width), labelFont: getComputedStyle(lab).fontSize, labelColour: getComputedStyle(lab).color,
        muted: (() => { const s = document.createElement('span'); s.style.color = 'var(--text-muted)'; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; })(),
        ellipsis: getComputedStyle(lab).textOverflow, controlLeft: Math.round(box(w.querySelector('.slide-ctl')).left - box(w).left) };
    });
    ok('a property row is a grid: the label (12 px, --text-muted, an ellipsis when too long) in a column of at least 84 px and at most 38 % of the row, the control in the rest; rows 28 px, 4 px apart',
      grid.labels.slice(0, 2).join() === 'Width,Height' && grid.rowH.every((x) => x === 28) && grid.gap === 4 && Math.abs(grid.labelCol - grid.want) < 0.5 && grid.labelFont === '12px'
        && grid.labelColour === grid.muted && grid.ellipsis === 'ellipsis' && Math.abs(grid.controlLeft - grid.labelCol - 8) <= 1, JSON.stringify(grid));

    // A number: drag the label (one undo step), type "0,45" (one), Esc (none), ↑ (one a press).
    const w0 = await layerNow(['sizeM', 0]);
    const u0 = await undoNow();
    await dragBy(row('Size and place', 'Width').locator('.flab'), 40);
    const w1 = await layerNow(['sizeM', 0]);
    const u1 = await undoNow();
    await rp.keyboard.press('Control+z');
    const w2 = await layerNow(['sizeM', 0]);
    const pivotY = rp.locator('.inspector input.num[aria-label="Pivot y"]');
    await pivotY.fill('0,45');
    await pivotY.press('Enter');
    const typed = { value: await layerNow(['pivot', 1]), shown: await pivotY.inputValue(), u: await undoNow() };
    await pivotY.fill('0,9');
    await pivotY.press('Escape');
    const esc = { value: await layerNow(['pivot', 1]), shown: await pivotY.inputValue(), u: await undoNow(), layer: await rp.evaluate(() => window.__vfx.app.layer()?.id ?? null) };
    // Undo pressed in the box: the box shows the number undone at once, and leaving it with Tab writes nothing back.
    await rp.keyboard.press('Control+z');
    const undoneInBox = { value: await layerNow(['pivot', 1]), shown: await pivotY.inputValue(), u: await undoNow() };
    await rp.keyboard.press('Tab');
    const leftBox = { value: await layerNow(['pivot', 1]), u: await undoNow() };
    const delayBox = rp.locator('.inspector input.num[aria-label="Delay"]');
    await delayBox.focus();
    const d0 = await layerNow(['start', 'ms']);
    const ud = await undoNow();
    await rp.keyboard.press('ArrowUp');
    await rp.keyboard.press('ArrowUp');
    const arrows = { ms: await layerNow(['start', 'ms']), u: await undoNow() };
    await rp.keyboard.press('Control+z');
    await rp.keyboard.press('Control+z');
    const d1 = await layerNow(['start', 'ms']);
    ok('a number box is dragged by its label (10 steps for 40 px: one undo step), typed with a comma ("0,45", Enter: one undo step), put back by Esc (no step, the layer stays selected), stepped by ↑ (one step a press); an undo pressed in the box shows there at once, and leaving the box writes nothing back',
      w0 === 1.2 && w1 === 1.3 && u1.n === u0.n + 1 && u1.label === 'Width' && w2 === 1.2 && typed.value === 0.45 && typed.shown === '0.45' && typed.u.n === u0.n + 1
        && esc.value === 0.45 && esc.shown === '0.45' && esc.u.n === typed.u.n && esc.layer === 'flash' && arrows.ms === d0 + 20 && arrows.u.n === ud.n + 2 && d1 === d0
        && undoneInBox.value === 0.5 && undoneInBox.shown === '0.5' && undoneInBox.u.n === u0.n && leftBox.value === 0.5 && leftBox.u.n === u0.n,
      JSON.stringify({ w: [w0, w1, w2], drag: u1, typed, esc, undoneInBox, leftBox, arrows, delay: [d0, d1] }));

    // A whole number of the file (the schema's whole numbers: How many, Points, Teeth, Seed…) goes in whole steps: a drag on
    // its name, ↑ and a typed decimal keep it whole, so the checker never refuses it (with a step of 0.01, a drag gave 6.04
    // and the preview waited).
    await select('board_molotov', 'sparks');
    const c0 = await layerNow(['count']);
    const uc = await undoNow();
    await dragBy(row('Pieces', 'How many').locator('.flab'), 16);
    const dragged = { count: await layerNow(['count']), u: await undoNow(), problems: await rp.evaluate(() => window.__vfx.app.problems().length) };
    const howMany = row('Pieces', 'How many').locator('input.num');
    await howMany.focus();
    await rp.keyboard.press('ArrowUp');
    const stepped = await layerNow(['count']);
    await howMany.fill('7,5');
    await howMany.press('Enter');
    const typedWhole = { count: await layerNow(['count']), shown: await howMany.inputValue() };
    await rp.keyboard.press('Tab');
    for (let k = 0; k < 3; k++) await rp.keyboard.press('Control+z');
    const cBack = await layerNow(['count']);
    await select('board_muzzle', 'hit');
    const p0 = await layerNow(['shape', 'points']);
    await dragBy(row('Shape: shards', 'Points').locator('.flab'), 8);
    const points = { value: await layerNow(['shape', 'points']), problems: await rp.evaluate(() => window.__vfx.app.problems().length) };
    await rp.keyboard.press('Control+z');
    ok('a whole number of the file (How many, Points, Teeth, Seed…) goes in whole steps: a 16 px drag on its name adds 4 (one undo step), ↑ adds 1, a typed 7,5 keeps 8; the checker finds no problem',
      dragged.count === c0 + 4 && dragged.u.n === uc.n + 1 && dragged.problems === 0 && stepped === c0 + 5 && typedWhole.count === 8 && typedWhole.shown === '8' && cBack === c0
        && points.value === p0 + 2 && points.problems === 0 && (await layerNow(['shape', 'points'])) === p0,
      JSON.stringify({ c0, dragged, stepped, typedWhole, cBack, p0, points }));
    await select('rifle_shot', 'flash');

    // Groups: each box's prefix, its full name (aria-label) and its tooltip (the full name, then the help text).
    const groupOf = (label) => rp.evaluate((label) => {
      const a = window.__vfx.app;
      const g = [...document.querySelectorAll('.inspector .prop-group')].find((x) => x.querySelector(':scope > .flab')?.textContent === label);
      if (!g) return null;
      return { boxes: [...g.querySelectorAll('.scrub')].map((s) => ({ prefix: s.querySelector('.scrub-prefix')?.textContent, name: s.querySelector('input').getAttribute('aria-label'),
        tip: a.tipForChecks(s)?.lines ?? null })), unit: g.querySelector('.prop-boxes > .unit')?.textContent ?? null, oneRow: Math.round(g.getBoundingClientRect().height) === 28 };
    }, label);
    const pivot = await groupOf('Pivot'), gridBoxes = await groupOf('Grid');
    await select('rifle_shot', 'hit');
    const offset = await groupOf('Offset');
    await select('board_beam', 'emitter_glow');
    const nudge = await groupOf('Nudge');
    await select('board_shell', 'debris');
    const life = await groupOf('Life');
    await select('board_molotov', 'smoke');
    const grow = await groupOf('Size over life');
    const want = (g, list) => !!g && g.oneRow && g.boxes.map((b) => `${b.prefix}=${b.name}`).join() === list && g.boxes.every((b) => b.tip?.[0] === b.name);
    ok('two or three numbers share a row: each box shows a short prefix (R U F, X Y, Cols Rows Frames, Min Max, S P E) and has its full name as its name and its tooltip; the unit shows once, after the last box',
      want(offset, 'R=Right,U=Up,F=Forward') && offset.unit === 'm' && want(pivot, 'X=Pivot x,Y=Pivot y') && pivot.unit === null
        && want(gridBoxes, 'Cols=Columns,Rows=Rows,Frames=Frames') && want(nudge, 'R=Nudge right,U=Nudge up') && nudge.unit === 'm'
        && want(life, 'Min=Life, min,Max=Life, max') && life.unit === 'ms' && want(grow, 'S=Size over life, start,P=Size over life, peak,E=Size over life, end'),
      JSON.stringify({ offset, pivot, gridBoxes, nudge, life, grow }));
    ok('a box\'s tooltip gives the help text for its full name (Right, in Size and place) or for its row (Life, a range of a burst\'s pieces)',
      offset.boxes[0].tip?.[1] === help.helpFor('Right', { section: ['Size and place'], layer: 'sprite' }) && life.boxes[1].tip?.[1] === help.helpFor('Life', { section: ['Pieces'], layer: 'burst' })
        && grow.boxes[1].tip?.[1] === help.helpFor('Size over life (start, peak, end)', { section: ['Shape: smoke'], kind: 'smoke' }),
      JSON.stringify([offset.boxes[0].tip, life.boxes[1].tip, grow.boxes[1].tip]));

    // A flipbook's Grid (Cols, Rows, Frames: long prefixes) shows its numbers whole, a frame count of three digits too, at
    // 1920 and in the narrowest panel (260 px), on one 28 px row whose boxes end where the Pivot's do; where the control column
    // is too narrow they start left of it, clear of the label's words. (Before, 120 frames showed "12", and at 260 px the
    // numbers ran under the next box.)
    await select('rifle_shot', 'flash');
    const gridFit = () => rp.evaluate(() => {
      const g = document.querySelector('.inspector .prop-group[aria-label="Grid"]');
      const lab = document.createRange();
      lab.selectNodeContents(g.querySelector(':scope > .flab'));
      const boxes = g.querySelector('.prop-boxes').getBoundingClientRect();
      const pivot = document.querySelector('.inspector .prop-group[aria-label="Pivot"] .prop-boxes').getBoundingClientRect();
      const whole = [...g.querySelectorAll('.scrub')].every((s) => {
        const i = s.querySelector('input'), r = i.getBoundingClientRect(), b = s.getBoundingClientRect();
        return i.scrollWidth <= i.clientWidth && r.left >= b.left && r.right <= b.right + 0.5;
      });
      return { values: [...g.querySelectorAll('input')].map((i) => i.value).join(), whole, h: Math.round(g.getBoundingClientRect().height), right: +(boxes.right - pivot.right).toFixed(1),
        left: +(boxes.left - pivot.left).toFixed(1), clear: boxes.left >= lab.getBoundingClientRect().right + 7.5,
        panel: Math.round(document.querySelector('.inspector').getBoundingClientRect().width) };
    });
    const setGrid = (fb) => rp.evaluate((fb) => { const a = window.__vfx.app; a.editLayer(['flipbook'], { ...fb, loop: false }, { label: 'Flipbook grid' }); a.commit(); }, fb);
    const fits = [await gridFit()];
    await setGrid({ cols: 12, rows: 10, frames: 120 });
    fits.push(await gridFit());
    // At 2560 x 1440 the control column has the room: the boxes start where the Pivot's do.
    await rp.setViewportSize({ width: 2560, height: 1440 });
    const gridWide = await gridFit();
    await rp.setViewportSize({ width: 1920, height: 1080 });
    const rs = await rp.locator('.split-right').boundingBox();
    await rp.mouse.move(rs.x + rs.width / 2, rs.y + rs.height / 2);
    await rp.mouse.down();
    await rp.mouse.move(rs.x + rs.width / 2 + 600, rs.y + rs.height / 2, { steps: 6 });
    await rp.mouse.up();
    fits.push(await gridFit());
    await rp.keyboard.press('Control+z');
    fits.push(await gridFit());
    // Still in the narrowest panel: Cost's header words ("Measured, no budgets") end in an ellipsis before its title does.
    await rp.evaluate(async () => { const a = window.__vfx.app; a.pickEffect('board_beam'); a.selectLayer(null); await a.measureForChecks(); });
    const costHead = await rp.evaluate(() => {
      const t = document.querySelector('.inspector .cost-fold > summary .fold-title'), s = document.querySelector('.inspector .cost-fold > summary .cost-sum');
      return { title: t.textContent, whole: t.scrollWidth <= t.clientWidth, sum: s.textContent, cut: s.scrollWidth > s.clientWidth, panel: Math.round(document.querySelector('.inspector').getBoundingClientRect().width) };
    });
    await rp.locator('.split-right').dblclick();
    ok('a flipbook\'s Grid shows its numbers whole (2, 2, 4 and 12, 10, 120) at 1920 and in the narrowest panel (260 px): one 28 px row, the boxes ending where the Pivot\'s do and clear of the label\'s words; at 2560 they also start where the Pivot\'s do',
      fits.every((f) => f.whole && f.h === 28 && Math.abs(f.right) <= 0.5 && f.clear) && fits.map((f) => f.values).join(' | ') === '2,2,4 | 12,10,120 | 12,10,120 | 2,2,4'
        && fits[0].panel > 290 && fits[2].panel < 262 && fits[3].panel < 262 && gridWide.whole && gridWide.h === 28 && Math.abs(gridWide.left) <= 0.5 && Math.abs(gridWide.right) <= 0.5
        && gridWide.panel > 310, JSON.stringify({ fits, gridWide }));
    ok('in the narrowest panel (260 px) Cost\'s header words end in an ellipsis before its title does: "Measured, no budgets" is cut, "Cost" stays whole',
      costHead.title === 'Cost' && costHead.whole && costHead.sum === 'Measured, no budgets' && costHead.cut && costHead.panel < 262, JSON.stringify(costHead));

    // A drag on a group's prefix: the nudge of a layer that has none. Its first step adds the nudge, which builds the panel
    // again under the pointer; the drag goes on, and it is one undo step.
    await select('board_beam', 'emitter_glow');
    const un = await undoNow();
    const before = await rp.evaluate(() => document.querySelector('.inspector section.card.layer'));
    await dragBy(row('Place', 'Nudge').locator('.scrub-prefix').first(), 40);
    const nudged = { shift: await layerNow(['shiftM']), u: await undoNow(), rebuilt: await rp.evaluate((old) => old !== document.querySelector('.inspector section.card.layer'), before) };
    await rp.keyboard.press('Control+z');
    const nudgeBack = await layerNow(['shiftM']);
    ok('a drag on a prefix changes its number (the first nudge of a layer builds the panel again under the pointer): the drag goes on to its end, and it is one undo step',
      JSON.stringify(nudged.shift) === '[0.5,0]' && nudged.u.n === un.n + 1 && nudged.u.label === 'Nudge' && nudged.rebuilt && nudgeBack === undefined, JSON.stringify({ nudged, nudgeBack }));

    // Shortened segments: their full words in their tooltips and as their names.
    await select('rifle_shot', 'flash');
    const segs = await rp.evaluate(() => {
      const a = window.__vfx.app;
      const groupOf = (label) => [...document.querySelectorAll('.inspector .prop.seg-row')].find((r) => r.querySelector(':scope > .flab')?.textContent === label);
      const read = (label) => [...(groupOf(label)?.querySelectorAll('.seg') ?? [])].map((b) => ({ text: b.textContent, name: b.getAttribute('aria-label'), tip: a.tipForChecks(b)?.lines[0] ?? null, height: Math.round(groupOf(label).querySelector('.seggroup').getBoundingClientRect().height) }));
      const out = { colour: read('Colour'), faces: read('Faces') };
      a.pickEffect('rifle_shot'); a.selectLayer('bullet');
      out.flight = read('Flight');
      return out;
    });
    const segLine = (list) => list.map((s) => `${s.text}=${s.tip}`).join(' | ');
    ok('a segment whose words do not fit on one line in the 296 px panel is shortened, its full words in its tooltip and as its name: Keep, Multiply; Camera, Path; Speed, Time, Phase',
      segLine(segs.colour) === 'Keep=Keep the image\'s colours | Multiply=Multiply by a colour role' && segs.colour.every((s) => s.name === s.tip)
        && segLine(segs.faces) === 'Camera=The camera | Path=Along the path: the image\'s x axis lies along the motion, or along the shot'
        && segLine(segs.flight) === 'Speed=By speed | Time=Fixed time | Phase=One phase' && [...segs.colour, ...segs.faces, ...segs.flight].every((s) => s.height === 24),
      JSON.stringify(segs));

    // A colour role's select: a 14 px swatch of the role's colour for the faction shown, at its left edge; it follows a
    // faction change and a colour changed in the picker. Role names are Plex Mono.
    await select('board_beam', 'emitter_glow');
    const swatch = () => rp.evaluate(() => {
      const a = window.__vfx.app;
      const sel = [...document.querySelectorAll('.inspector .role-select select')].find((s) => s.getAttribute('aria-label') === 'Colour' && s.closest('details')?.querySelector(':scope > summary').textContent === 'Shape: glow');
      const sw = sel.parentElement.querySelector('.role-swatch');
      const rgb = (hex) => `rgb(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(', ')})`;
      const r = sw.getBoundingClientRect(), s = sel.getBoundingClientRect();
      return { role: sel.value, colour: getComputedStyle(sw).backgroundColor, want: rgb(a.palette.factions[a.faction]?.roles[sel.value]?.hex ?? a.palette.roles[sel.value].hex),
        size: `${Math.round(r.width)}x${Math.round(r.height)}`, left: Math.round(r.left - s.left), font: getComputedStyle(sel).fontFamily.split(',')[0].replace(/"/g, '') };
    });
    const sw0 = await swatch();
    await rp.evaluate(() => window.__vfx.app.setFaction('allies'));
    const sw1 = await swatch();
    await rp.evaluate(() => { const a = window.__vfx.app; a.setColour(a.layer().shape.role, '#00FF00'); a.commit(); });
    const sw2 = await swatch();
    await rp.keyboard.press('Control+z');
    await rp.evaluate(() => window.__vfx.app.setFaction('soviets'));
    const sw3 = await swatch();
    ok('a colour role\'s select has a 14 px swatch of the role\'s colour (for the faction shown) at its left edge, in Plex Mono; the swatch follows a faction change and a colour changed in the picker',
      sw0.role === 'glow' && sw0.colour === sw0.want && sw0.size === '14x14' && sw0.left <= 8 && sw0.font === 'IBM Plex Mono' && sw1.colour === sw1.want && sw1.colour !== sw0.colour
        && sw2.colour === 'rgb(0, 255, 0)' && sw3.colour === sw0.colour, JSON.stringify([sw0, sw1, sw2, sw3]));

    // Tab through every number box of every view (the effect's and each layer's) of both examples: each takes the focus,
    // and nothing changes (no undo step, nothing unsaved). Every segmented control there fits on one line at 1920.
    const sweepTab = async () => {
      const views = await rp.evaluate(() => { const a = window.__vfx.app; const v = []; for (const id of a.debugState().effects) { a.pickEffect(id); v.push([id, null], ...a.effect().layers.map((l) => [id, l.id])); } return v; });
      let boxes = 0, focused = 0, wrapped = [];
      for (const [fx, layer] of views) {
        const n = await rp.evaluate(({ fx, layer }) => {
          const a = window.__vfx.app;
          a.pickEffect(fx); a.selectLayer(layer);
          for (const d of document.querySelectorAll('.inspector details:not([open])')) d.open = true;
          window.__tabbed = new Set();
          document.querySelector('.inspector').addEventListener('focusin', (e) => { if (e.target.matches('input.num')) window.__tabbed.add(e.target); });
          document.querySelector('.inspector .insp-title').focus();
          const tabbable = [...document.querySelectorAll('.inspector :is(input, select, button, summary, [tabindex="0"])')].filter((x) => x.getClientRects().length && !x.disabled && x.tabIndex >= 0);
          window.__wrapped = [...document.querySelectorAll('.inspector .prop > .seggroup')].filter((s) => s.getClientRects().length && s.getBoundingClientRect().height > 25).map((s) => `${fx}/${layer}: ${s.getAttribute('aria-label')}`);
          return { boxes: [...document.querySelectorAll('.inspector input.num')].filter((x) => x.getClientRects().length).length, tabbable: tabbable.length };
        }, { fx, layer });
        for (let k = 0; k < n.tabbable; k++) await rp.keyboard.press('Tab');
        const got = await rp.evaluate(() => ({ n: window.__tabbed.size, wrapped: window.__wrapped }));
        boxes += n.boxes; focused += got.n; wrapped.push(...got.wrapped);
      }
      return { views: views.length, boxes, focused, wrapped };
    };
    const tab0 = await undoNow();
    const demoTab = await sweepTab();
    const tab1 = await undoNow();
    await rp.evaluate(async () => { window.confirm = () => true; await window.__vfx.app.openProject('examples/hits-collection'); });
    const hitsTab = await sweepTab();
    const tab2 = await rp.evaluate(() => { const h = window.__vfx.app.history; return { n: h.past.length, dirty: h.dirty, name: document.querySelector('.project-name')?.textContent }; });
    ok('Tab through every number box of every layer and effect of both examples: each takes the focus, and no undo step appears and nothing is marked unsaved',
      demoTab.boxes > 500 && demoTab.focused === demoTab.boxes && hitsTab.boxes > 500 && hitsTab.focused === hitsTab.boxes && tab1.n === tab0.n && !tab1.dirty && tab2.n === 0 && !tab2.dirty && !tab2.name.includes('•'),
      JSON.stringify({ demo: demoTab.views + ' views, ' + demoTab.focused + '/' + demoTab.boxes, hits: hitsTab.views + ' views, ' + hitsTab.focused + '/' + hitsTab.boxes, tab0, tab1, tab2 }));
    // The timeline header's Speed is a segmented control too, but in a bar: its label and its four buttons on one row.
    const speedRow = await rp.evaluate(() => {
      const g = document.querySelector('.transport .seggroup');
      const tops = new Set([...g.querySelectorAll('.seg')].map((b) => Math.round(b.getBoundingClientRect().top)));
      return { rows: tops.size, h: Math.round(g.getBoundingClientRect().height), label: g.parentElement?.querySelector(':scope > .lab > span')?.textContent ?? null };
    });
    ok('every segmented control in the right panel fits on one line at 1920 x 1080 (every layer of both examples), and the timeline header\'s Speed keeps its buttons on one row beside its label',
      demoTab.wrapped.length === 0 && hitsTab.wrapped.length === 0 && speedRow.rows === 1 && speedRow.h <= 24 && speedRow.label === 'Speed',
      `${[...demoTab.wrapped, ...hitsTab.wrapped].slice(0, 4).join(', ') || 'none wraps'}; Speed: ${JSON.stringify(speedRow)}`);
    ok('the rows page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await rp.close();
  }

  // -- the right panel's header menus and its problems (docs/ui-redesign.md 6.6, UI phase 6). Each header has a More
  // button: the effect's (Duplicate effect, Move to folder…, Delete effect) and a layer's (Rename, Duplicate, Move up, Move
  // down, Delete), doing what the lists' row menus do, each one undo step. The problems banner shows only when the checker
  // finds problems: how many, a list that opens, each path in Plex Mono (a click on one that points at a layer selects it),
  // and "The preview waits until these are fixed." when they stop the preview. The status bar's Checks opens it. Cost and
  // Checks no longer sit under a layer. On a page of its own.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const hp = g.page;
    hp.on('dialog', (d) => d.accept());
    const menuNow = (id) => hp.evaluate((id) => {
      const m = document.getElementById(id);
      return { open: !!m?.matches(':popover-open'), rows: m ? [...m.querySelectorAll('.menu-item, .menu-divider')].map((c) => c.matches('.menu-divider') ? '—'
        : `${c.querySelector('.menu-label').textContent}${c.querySelector('.menu-key') ? ` ${c.querySelector('.menu-key').textContent}` : ''}${c.disabled ? ' (off)' : ''}`) : [] };
    }, id);
    const more = () => hp.locator('.inspector > .insp-head .insp-more');
    // A press on a menu's button less than 100 ms after the menu closed counts as the press that closed it (dom.ts, menu's
    // openBelow), so the check waits a little, as a person always does, before it opens the menu again.
    const openMore = async (id) => { await hp.waitForTimeout(150); await more().click(); await hp.waitForSelector(`#${id}:popover-open`, { timeout: 5000 }); };
    // A button's colours change in 120 ms (a CSS transition). This browser's frames come slowly while another editor page
    // draws, so before reading the open look, the pointer goes into the menu and the button's transitions are let finish.
    const settledLook = async (id) => {
      const box = await hp.locator(`#${id}`).boundingBox();
      await hp.mouse.move(box.x + box.width / 2, box.y + box.height - 4);
      await more().evaluate((b) => Promise.all(b.getAnimations().map((x) => x.finished)));
      return openLook(hp, more(), id);
    };
    const muted = await hp.evaluate(() => { const s = document.createElement('span'); s.style.color = 'var(--text-muted)'; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; });
    await hp.evaluate(() => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect('rifle_shot'); a.selectLayer(null); });

    // The effect's More: Duplicate effect, Move to folder… (New folder…, the question dialog's OK clicked), Delete effect.
    const fxMore = await more().evaluate((b) => ({ name: b.getAttribute('aria-label'), popup: b.getAttribute('aria-haspopup'), tip: window.__vfx.app.tipForChecks(b)?.lines[0] ?? null }));
    await openMore('insp-effect-menu');
    const fxMenu = await menuNow('insp-effect-menu');
    const fxLook = await settledLook('insp-effect-menu');
    await menuRow(hp, 'insp-effect-menu', 'Duplicate effect').click();
    const dup = await hp.evaluate(() => { const a = window.__vfx.app; return { id: a.effect()?.id, name: a.effect()?.name, undo: a.history.undoLabel }; });
    await hp.keyboard.press('Control+z');
    const dupGone = await hp.evaluate((id) => !window.__vfx.app.debugState().effects.includes(id), dup.id);
    await hp.evaluate(() => window.__vfx.app.pickEffect('rifle_shot'));
    await openMore('insp-effect-menu');
    await menuRow(hp, 'insp-effect-menu', 'Move to folder…').click();
    await hp.waitForSelector('#folder-menu:popover-open', { timeout: 5000 });
    const folderBelow = await hp.evaluate(() => Math.round(document.getElementById('folder-menu').getBoundingClientRect().top - document.querySelector('.inspector .insp-more').getBoundingClientRect().bottom));
    await menuRow(hp, 'folder-menu', 'New folder…').click();
    await hp.waitForSelector('dialog[open] input.text', { timeout: 5000 });
    await hp.locator('dialog[open] input.text').fill('Tests');
    await hp.locator('dialog[open] button', { hasText: 'OK' }).click();
    const moved = await hp.evaluate(() => {
      const a = window.__vfx.app, t = document.querySelector('.inspector .insp-title'), f = t.querySelector('.insp-folder');
      return { name: a.effect().name, undo: a.history.undoLabel, title: t.textContent, folder: f?.textContent ?? null, folderColour: f ? getComputedStyle(f).color : null, folderWeight: f ? getComputedStyle(f).fontWeight : null };
    });
    await hp.keyboard.press('Control+z');
    const movedBack = await hp.evaluate(() => window.__vfx.app.effect().name);
    await openMore('insp-effect-menu');
    await menuRow(hp, 'insp-effect-menu', 'Delete effect').click();
    const deleted = await hp.evaluate(() => ({ gone: !window.__vfx.app.debugState().effects.includes('rifle_shot'), undo: window.__vfx.app.history.undoLabel }));
    await hp.keyboard.press('Control+z');
    const deleteUndone = await hp.evaluate(() => window.__vfx.app.debugState().effects.includes('rifle_shot'));
    ok('the effect\'s header has a More button (looks open while its menu is): Duplicate effect, Move to folder… (below the button) and Delete effect do what the Effects list\'s menu does, each one undo step',
      fxMore.popup === 'menu' && fxMore.name === 'More: Rifle shot (demo)' && fxMore.tip === 'More' && fxMenu.open && fxMenu.rows.join('|') === 'Duplicate effect Ctrl+D|Move to folder…|—|Delete effect'
        && fxLook.shown && fxLook.expanded === 'true' && fxLook.icon && fxLook.field && dup.name === 'Rifle shot (demo) copy' && dup.undo === 'Duplicate effect' && dupGone
        && folderBelow >= 0 && folderBelow <= 8 && moved.name === 'Tests / Rifle shot (demo)' && moved.undo === 'Move to folder' && movedBack === 'Rifle shot (demo)'
        && deleted.gone && deleted.undo === 'Delete effect' && deleteUndone,
      JSON.stringify({ fxMore, fxMenu: fxMenu.rows, fxLook, dup, dupGone, folderBelow, moved: [moved.name, moved.undo, movedBack], deleted, deleteUndone }));
    ok('the effect\'s header shows its folder as a muted prefix before its name, in the title\'s size, not bold', moved.title === 'Tests / Rifle shot (demo)' && moved.folder === 'Tests / '
      && moved.folderColour === muted && moved.folderWeight === '400', JSON.stringify(moved));

    // A layer's More: Rename (in place, in the Layers list), Duplicate, Move up, Move down, Delete.
    await hp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); a.selectLayer('flash'); });
    const order = () => hp.evaluate(() => window.__vfx.app.effect().layers.map((l) => l.id));
    const order0 = await order();
    const i = order0.indexOf('flash');
    const swap = (a, b) => { const o = [...order0]; [o[a], o[b]] = [o[b], o[a]]; return o.join(); };
    await openMore('insp-layer-menu');
    const layerMenu = await menuNow('insp-layer-menu');
    const layerLook = await settledLook('insp-layer-menu');
    await menuRow(hp, 'insp-layer-menu', 'Rename').click();
    const renameBox = await hp.waitForFunction(() => { const b = document.querySelector('.layers-list .layer-item[data-layer="flash"] input.rename'); return b && document.activeElement === b ? b.value : null; }, null, { timeout: 5000 })
      .then((x) => x.jsonValue(), () => null);
    await hp.locator('.layers-list input.rename').fill('Flash two');
    await hp.keyboard.press('Enter');
    const renamed = await hp.evaluate(() => ({ name: window.__vfx.app.effect().layers.find((l) => l.id === 'flash').name, undo: window.__vfx.app.history.undoLabel }));
    await hp.keyboard.press('Control+z');
    const step = async (label) => {
      await openMore('insp-layer-menu');
      await menuRow(hp, 'insp-layer-menu', label).click();
      const r = await hp.evaluate(() => ({ order: window.__vfx.app.effect().layers.map((l) => l.id).join(), sel: window.__vfx.app.layer()?.id ?? null, undo: window.__vfx.app.history.undoLabel }));
      await hp.keyboard.press('Control+z');
      await hp.evaluate(() => window.__vfx.app.selectLayer('flash'));
      return r;
    };
    const dupL = await step('Duplicate'), upL = await step('Move up'), downL = await step('Move down'), delL = await step('Delete');
    const order1 = (await order()).join();
    // The layer at the top of the list (the last in the file) cannot move up; the one at the bottom cannot move down.
    await hp.evaluate((id) => window.__vfx.app.selectLayer(id), order0[order0.length - 1]);
    await openMore('insp-layer-menu');
    const topMenu = await menuNow('insp-layer-menu');
    await hp.keyboard.press('Escape');
    ok('a layer\'s header has a More button (looks open while its menu is): Rename (in place, in the Layers list), Duplicate, Move up, Move down and Delete do what the Layers list\'s menu does, each one undo step',
      layerMenu.rows.join('|') === 'Rename F2|Duplicate Ctrl+D|Move up Ctrl+]|Move down Ctrl+[|—|Delete Del' && layerLook.expanded === 'true' && layerLook.icon && layerLook.field
        && renameBox === 'Muzzle flash' && renamed.name === 'Flash two' && renamed.undo === 'Rename layer' && dupL.sel !== 'flash' && dupL.order.split(',').length === order0.length + 1 && dupL.undo === 'Duplicate layer'
        && upL.order === swap(i, i + 1) && upL.undo === 'Move layer' && downL.order === swap(i, i - 1) && downL.undo === 'Move layer'
        && delL.order === order0.filter((x) => x !== 'flash').join() && delL.sel === order0[i + 1] && delL.undo === 'Delete layer' && order1 === order0.join()
        && topMenu.rows.includes('Move up Ctrl+] (off)') && topMenu.rows.includes('Move down Ctrl+['),
      JSON.stringify({ layerMenu: layerMenu.rows, layerLook, renameBox, renamed, dupL, upL, downL, delL, order0, order1, topMenu: topMenu.rows }));

    // The problems banner: none without problems; with one, in both views, right under the header.
    const bannerNow = () => hp.evaluate(() => {
      const a = window.__vfx.app, ins = document.querySelector('.inspector'), b = ins.querySelector('.problems-banner');
      if (!b) return { shown: false, layer: a.layer()?.id ?? null, waits: a.previewWaits() };
      const head = b.querySelector('.banner-head'), list = b.querySelector('.banner-list'), wait = b.querySelector('.banner-wait');
      const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--bad-bg)'; document.body.append(probe); const badBg = getComputedStyle(probe).backgroundColor; probe.remove();
      return { shown: true, layer: a.layer()?.id ?? null, second: ins.children[1] === b, count: b.querySelector('.banner-count').textContent, icon: head.querySelector('svg')?.getAttribute('class'),
        bg: getComputedStyle(b).backgroundColor, badBg, open: head.getAttribute('aria-expanded'), listShown: !list.hidden && list.getClientRects().length > 0,
        items: [...list.querySelectorAll('li')].map((li) => ({ path: li.querySelector('code')?.textContent, font: getComputedStyle(li.querySelector('code')).fontFamily.split(',')[0].replace(/"/g, ''),
          button: !!li.querySelector('button.banner-path'), message: li.querySelector('.banner-msg')?.textContent })),
        wait: !wait.hidden && wait.getClientRects().length ? wait.textContent : null, waits: a.previewWaits(), tip: a.tipForChecks(head)?.lines.join(' ') ?? '' };
    });
    await hp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); a.selectLayer(null); });
    const none = await bannerNow();
    await hp.evaluate(() => window.__vfx.app.selectLayer('flash'));
    const noneLayer = await bannerNow();
    await hp.evaluate(() => { const a = window.__vfx.app; a.editLayer(['image'], 'no_such.png'); a.commit(); });
    const inLayer = await bannerNow();
    await hp.evaluate(() => window.__vfx.app.selectLayer(null));
    const inEffect = await bannerNow();
    ok('the problems banner shows only when the checker finds problems, in both views, right under the header: --bad-bg, the warning icon and how many ("1 problem"); its tooltip names what the checker checks',
      !none.shown && !noneLayer.shown && inLayer.shown && inLayer.second && inLayer.count === '1 problem' && inLayer.icon === 'icon icon-warning' && inLayer.bg === inLayer.badBg
        && inEffect.shown && inEffect.second && inEffect.tip.includes('links between layers'), JSON.stringify({ none, noneLayer, inLayer, inEffect: [inEffect.shown, inEffect.second] }));
    await hp.locator('.inspector .problems-banner .banner-head').click();
    const opened = await bannerNow();
    await hp.locator('.inspector .problems-banner button.banner-path').first().click();
    const picked = await bannerNow();
    ok('the banner\'s list opens with its chevron: each problem\'s path in Plex Mono and its message; a click on a path that points at a layer selects that layer, and the banner stays, open',
      inEffect.open === 'false' && !inEffect.listShown && opened.open === 'true' && opened.listShown && opened.items.length === 1 && opened.items[0].path === `layers[${i}].image`
        && opened.items[0].font === 'IBM Plex Mono' && opened.items[0].button && /no_such\.png/.test(opened.items[0].message ?? '') && picked.layer === 'flash' && picked.shown && picked.open === 'true' && picked.listShown,
      JSON.stringify({ closed: [inEffect.open, inEffect.listShown], opened, picked: [picked.layer, picked.open, picked.listShown] }));
    // The preview waits only for problems that stop it (schema, format or version): a size the schema refuses does.
    await hp.keyboard.press('Control+z');
    await hp.evaluate(() => { const a = window.__vfx.app; a.selectLayer(null); a.editEffect(['controls', 'size'], -1, { label: 'Size' }); a.commit(); });
    const waiting = await bannerNow();
    await hp.keyboard.press('Control+z');
    const clean = await bannerNow();
    ok('when the problems stop the preview (a value the schema refuses), the banner says "The preview waits until these are fixed."; for a missing image it does not; fixed, the banner goes',
      picked.wait === null && !picked.waits && waiting.shown && waiting.wait === 'The preview waits until these are fixed.' && waiting.waits && !clean.shown && !clean.waits,
      JSON.stringify({ image: [picked.wait, picked.waits], schema: [waiting.count, waiting.wait, waiting.waits], clean }));

    // The status bar's Checks: with problems, it opens the banner's list where the panel shows it; with none, a message.
    await hp.evaluate(() => { const a = window.__vfx.app; a.selectLayer('flash'); a.editLayer(['image'], 'no_such.png'); a.commit(); });
    await hp.locator('.inspector .problems-banner .banner-head').click();
    await hp.evaluate(() => { document.querySelector('.right').scrollTop = 400; });
    const closedAgain = await bannerNow();
    await hp.locator('.statusbar .sb-checks').click();
    const fromBar = await hp.evaluate(() => {
      const b = document.querySelector('.inspector .problems-banner'), h = document.querySelector('.inspector > .insp-head');
      return { layer: window.__vfx.app.layer()?.id ?? null, open: b?.querySelector('.banner-head').getAttribute('aria-expanded') ?? null, focus: !!b && document.activeElement === b.querySelector('.banner-head'),
        top: document.querySelector('.right').scrollTop, below: b && h ? Math.round(b.getBoundingClientRect().top - h.getBoundingClientRect().bottom) : null };
    });
    await hp.keyboard.press('Control+z');
    await hp.locator('.statusbar .sb-checks').click();
    const allGood = await hp.waitForFunction(() => document.querySelector('.status.show')?.textContent ?? null, null, { timeout: 5000 }).then((x) => x.jsonValue(), () => null);
    ok('the status bar\'s Checks opens the banner\'s list (the panel scrolled to the top, the focus on the banner, the layer still selected); with no problems, a click on "All good" says so in a message',
      closedAgain.open === 'false' && fromBar.layer === 'flash' && fromBar.open === 'true' && fromBar.focus && fromBar.top === 0 && fromBar.below !== null && Math.abs(fromBar.below) <= 1 && /^All good/.test(allGood ?? ''),
      JSON.stringify({ closedAgain: closedAgain.open, fromBar, allGood }));

    // Cost and Checks: none under a layer; the effect's view ends with Cost; no Checks section anywhere.
    const placement = await hp.evaluate(() => {
      const a = window.__vfx.app, ins = document.querySelector('.inspector');
      const kinds = () => [...ins.children].map((c) => c.classList.contains('costcard') ? 'cost' : c.classList.contains('checks') ? 'checks' : null).filter(Boolean).join();
      a.pickEffect('rifle_shot'); a.selectLayer('flash');
      const layerView = kinds();
      a.selectLayer(null);
      return { layerView, effectView: kinds(), last: ins.lastElementChild?.classList.contains('costcard') ?? false, checks: !!document.querySelector('.inspector .checks') };
    });
    ok('Cost and Checks no longer sit under a layer: a layer\'s view has neither; the effect\'s view ends with Cost, and there is no Checks section (the banner and the status bar show the problems)',
      placement.layerView === '' && placement.effectView === 'cost' && placement.last && !placement.checks, JSON.stringify(placement));
    ok('the header and problems page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await hp.close();
  }

  // -- the effect's settings (docs/ui-redesign.md 6.6, UI phase 6): sections that fold, in this order: Effect (Name without
  // its folder, Folder, Game events), Scale (Size, Intensity, Duration, each with its icon), Phases (a bar of the three
  // lengths, then the three lengths on one row), Colour (Main colour with its edit button, the effect's colours, Edit
  // palette…), then Cost, closed at first: its state in its header with the Measure button, and a Budgets toggle that shows
  // the budget boxes. On a page of its own, with fresh storage (folds and the Budgets toggle are remembered).
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const ep = g.page;
    const help = await server.ssrLoadModule('/src/app/help.ts');
    const undoNow = () => ep.evaluate(() => { const h = window.__vfx.app.history; return { n: h.past.length, label: h.undoLabel ?? null }; });
    const cssColour = (value, prop = 'color') => ep.evaluate(({ value, prop }) => { const s = document.createElement('span'); s.style[prop] = value; document.body.append(s); const c = getComputedStyle(s)[prop]; s.remove(); return c; }, { value, prop });
    const rgbOf = (hex) => `rgb(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(', ')})`;
    await ep.evaluate(() => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect('board_beam'); a.selectLayer(null); });

    // The sections and their rows, as shown with fresh storage.
    const layout = await ep.evaluate(() => {
      const ins = document.querySelector('.inspector');
      const words = (e) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const secs = [...ins.querySelectorAll(':scope > .bigcontrols > details, :scope > .costcard > details')].map((d) =>
        `${words(d.querySelector(':scope > summary > .fold-title'))}${d.open ? '' : ' (closed)'}: ${[...d.querySelectorAll(':scope > .foldbody > .prop > .flab, :scope > .foldbody > label.check')].map(words).join(', ')}`.trim());
      return { secs, icons: [...ins.querySelectorAll('.bigcontrols .row.big > .flab > svg')].map((s) => s.getAttribute('class')), nums: ins.querySelectorAll('.bigcontrols .row.big input.num').length,
        last: ins.lastElementChild?.matches('.costcard') ?? false };
    });
    ok('the effect\'s settings are sections that fold, in order: Effect (Name, Folder, Game events), Scale (Size, Intensity and Duration, each with its icon before its name), Phases, Colour (Main colour), then Cost, closed at first',
      layout.secs.join(' | ') === 'Effect: Name, Folder, Game events | Scale: Size, Intensity, Duration | Phases: | Colour: Main colour | Cost (closed): Budgets'
        && layout.icons.join() === 'icon icon-size,icon icon-intensity,icon icon-duration' && layout.nums === 3 && layout.last, JSON.stringify(layout));

    // Name and Folder: New folder… (the question dialog's OK clicked), the name without its folder, a rename that keeps the
    // folder, an empty name, No folder, New folder… cancelled, and a move that would pass 80 characters.
    const nameBox = ep.locator('.inspector .bigcontrols label.field', { has: ep.locator(':scope > .flab', { hasText: /^Name$/ }) }).locator('input');
    const folderSel = ep.locator('.inspector .bigcontrols label.field', { has: ep.locator(':scope > .flab', { hasText: /^Folder$/ }) }).locator('select');
    const fxNow = () => ep.evaluate(() => { const a = window.__vfx.app, sel = [...document.querySelectorAll('.inspector .bigcontrols label.field')].find((f) => f.querySelector('.flab')?.textContent === 'Folder')?.querySelector('select');
      return { name: a.effect().name, box: [...document.querySelectorAll('.inspector .bigcontrols label.field')].find((f) => f.querySelector('.flab')?.textContent === 'Name')?.querySelector('input').value,
        folder: sel?.value ?? null, options: sel ? [...sel.options].map((o) => o.textContent) : [], undo: a.history.undoLabel ?? null, n: a.history.past.length }; });
    const f0 = await fxNow();
    await folderSel.selectOption({ label: 'New folder…' });
    await ep.waitForSelector('dialog[open] input.text', { timeout: 5000 });
    const whileAsking = (await fxNow()).folder;
    await ep.locator('dialog[open] input.text').fill('Tests');
    await ep.locator('dialog[open] button', { hasText: 'OK' }).click();
    const f1 = await fxNow();
    await nameBox.fill('Beam two');
    await nameBox.press('Enter');
    const f2 = await fxNow();
    await nameBox.fill('   ');
    await nameBox.press('Enter');
    const f3 = await fxNow();
    await folderSel.selectOption({ label: 'No folder' });
    const f4 = await fxNow();
    await folderSel.selectOption({ label: 'New folder…' });
    await ep.waitForSelector('dialog[open] input.text', { timeout: 5000 });
    await ep.locator('dialog[open] button', { hasText: 'Cancel' }).click();
    const f5 = await fxNow();
    await nameBox.fill('n'.repeat(76));
    await nameBox.press('Enter');
    const f6 = await fxNow();
    await folderSel.selectOption({ label: 'New folder…' });
    await ep.waitForSelector('dialog[open] input.text', { timeout: 5000 });
    await ep.locator('dialog[open] input.text').fill('Tests');
    await ep.locator('dialog[open] button', { hasText: 'OK' }).click();
    const tooLong = await ep.waitForFunction(() => { const t = document.querySelector('.status.show')?.textContent ?? ''; return /too long/.test(t) ? t : null; }, null, { timeout: 5000 }).then((x) => x.jsonValue(), () => null);
    const f7 = await fxNow();
    for (let k = 0; k < 4; k++) await ep.keyboard.press('Control+z');
    const f8 = await fxNow();
    ok('Folder: New folder… asks for a name (OK clicked) and moves the effect there in one undo step; the Name field shows the name without its folder, and a name typed keeps the folder (one undo step); an empty name changes nothing; No folder moves it out',
      f0.name === 'Hammer leech beam (board)' && f0.box === f0.name && f0.folder === '' && f0.options[0] === 'No folder' && f0.options.at(-1) === 'New folder…' && whileAsking === ''
        && f1.name === 'Tests / Hammer leech beam (board)' && f1.box === 'Hammer leech beam (board)' && f1.folder === 'Tests' && f1.options.includes('Tests') && f1.undo === 'Move to folder' && f1.n === f0.n + 1
        && f2.name === 'Tests / Beam two' && f2.undo === 'Rename effect' && f2.n === f1.n + 1 && f3.name === f2.name && f3.box === 'Beam two' && f3.n === f2.n
        && f4.name === 'Beam two' && f4.folder === '' && f4.undo === 'Move to folder' && f4.n === f3.n + 1,
      JSON.stringify({ f0, whileAsking, f1, f2, f3, f4 }));
    ok('Folder: New folder… cancelled puts the select back and changes nothing; a move that would pass 80 characters with its folder is refused in a message, and the select goes back',
      f5.name === f4.name && f5.folder === '' && f5.n === f4.n && f6.name === 'n'.repeat(76) && f6.n === f5.n + 1 && /too long/.test(tooLong ?? '') && f7.name === f6.name && f7.folder === '' && f7.n === f6.n
        && f8.name === 'Hammer leech beam (board)',
      JSON.stringify({ f5, f6: [f6.name.length, f6.n], tooLong, f7: [f7.name.length, f7.folder, f7.n], f8: f8.name }));

    // Phases: the bar shows the three lengths in proportion, in the timeline's phase colours; the lengths on one row, each box
    // with its prefix and its unit; a length typed changes the bar; all three at 0 (Rifle shot (demo)): an empty bar.
    const phases = () => ep.evaluate(() => {
      const bar = document.querySelector('.inspector .phase-bar'), group = bar?.parentElement.querySelector('.prop-group.bare');
      const segs = [...bar.querySelectorAll('.phase-seg')].map((s) => ({ name: s.classList[1], w: s.getBoundingClientRect().width, shown: !s.hidden, bg: getComputedStyle(s).backgroundColor }));
      return { h: Math.round(bar.getBoundingClientRect().height), w: bar.getBoundingClientRect().width, none: bar.classList.contains('none'), tip: window.__vfx.app.tipForChecks(bar)?.lines[0] ?? null, segs,
        boxes: [...group.querySelectorAll('.scrub')].map((s) => `${s.querySelector('.scrub-prefix').textContent}|${s.querySelector('input').getAttribute('aria-label')}|${s.querySelector('input').value}|${s.querySelector('.unit').textContent}`),
        oneRow: Math.round(group.getBoundingClientRect().height) === 28, fx: window.__vfx.app.effect().phases };
    });
    const ph0 = await phases();
    const phaseColours = [await cssColour('var(--tl-windup)', 'backgroundColor'), await cssColour('var(--tl-peak)', 'backgroundColor'), await cssColour('var(--tl-fade)', 'backgroundColor')];
    const windup = ep.locator('.inspector .prop-group.bare input.num[aria-label="Wind-up"]');
    await windup.fill('0');
    await windup.press('Enter');
    const ph1 = await phases();
    const u1 = await undoNow();
    await ep.keyboard.press('Control+z');
    await ep.evaluate(() => window.__vfx.app.pickEffect('rifle_shot'));
    const phZero = await phases();
    const total = ph0.segs.reduce((a, s) => a + s.w, 0), ms = [350, 2500, 300];
    ok('Phases: a 6 px bar of the three lengths in proportion (350, 2500, 300 ms), in the timeline\'s phase colours, then the three lengths on one row (W, P, F: Wind-up, Peak, Fade, in ms); a length set to 0 leaves the bar',
      ph0.h === 6 && ph0.segs.every((s, i) => s.shown && Math.abs(s.w / total - ms[i] / 3150) < 0.01 && s.bg === phaseColours[i]) && Math.abs(total + 4 - ph0.w) < 1
        && ph0.boxes.join() === 'W|Wind-up|350|ms,P|Peak|2500|ms,F|Fade|300|ms' && ph0.oneRow && ph0.tip === 'Wind-up 350 ms, Peak 2500 ms, Fade 300 ms'
        && ph1.fx.windupMs === 0 && !ph1.segs[0].shown && ph1.segs[1].shown && u1.label === 'Wind-up length',
      JSON.stringify({ ph0, ph1: ph1.segs, u1, phaseColours }));
    ok('Phases with all three lengths at 0 (Rifle shot (demo)): the bar is empty, and its tooltip says there are no phases',
      phZero.none && phZero.segs.every((s) => !s.shown) && phZero.h === 6 && phZero.tip === 'No phases: all three lengths are 0 ms' && phZero.boxes.join() === 'W|Wind-up|0|ms,P|Peak|0|ms,F|Fade|0|ms',
      JSON.stringify(phZero));

    // Colour: Main colour (the role's swatch, the role, an edit button that opens the picker on it); another role is one undo
    // step and the header's dot follows; Edit palette… opens the picker at its palette.
    await ep.evaluate(() => window.__vfx.app.pickEffect('board_beam'));
    const mainNow = () => ep.evaluate(() => {
      const a = window.__vfx.app, row = document.querySelector('.inspector .main-colour'), sel = row.querySelector('select'), edit = row.querySelector('button.edit-colour');
      return { role: sel.value, want: a.effect().controls.colour, swatch: getComputedStyle(row.querySelector('.role-swatch')).backgroundColor, dot: getComputedStyle(document.querySelector('.inspector .fx-dot')).backgroundColor,
        hex: a.palette.factions[a.faction]?.roles[sel.value]?.hex ?? a.palette.roles[sel.value]?.hex, edit: edit ? `${edit.getAttribute('aria-label')}|${a.tipForChecks(edit)?.lines[0]}|${!!edit.querySelector('svg.icon-edit')}` : null,
        font: getComputedStyle(sel).fontFamily.split(',')[0].replace(/"/g, ''), undo: a.history.undoLabel ?? null, n: a.history.past.length };
    });
    const m0 = await mainNow();
    await ep.locator('.inspector .main-colour select').selectOption('team');
    const m1 = await mainNow();
    await ep.keyboard.press('Control+z');
    await ep.locator('.inspector .main-colour button.edit-colour').click();
    await ep.waitForFunction(() => document.querySelector('.cpick').matches(':popover-open'), null, { timeout: 5000 });
    const picker1 = await ep.evaluate(() => ({ title: document.querySelector('.cpick .cp-title').textContent }));
    await ep.locator('.cp-head button[aria-label="Close the colour picker"]').click();
    await ep.waitForFunction(() => !document.querySelector('.cpick').matches(':popover-open'));
    await ep.locator('.inspector .edit-palette').click();
    await ep.waitForFunction(() => document.querySelector('.cpick').matches(':popover-open'), null, { timeout: 5000 });
    await ep.waitForTimeout(200);
    const picker2 = await ep.evaluate(() => {
      const c = document.querySelector('.cpick'), sec = c.querySelector('details.cp-palette-section'), r = c.getBoundingClientRect(), s = sec.getBoundingClientRect();
      return { title: c.querySelector('.cp-title').textContent, open: sec.open, focus: document.activeElement === sec.querySelector('summary'), inView: s.top >= r.top - 1 && s.top < r.bottom - 40,
        chips: sec.querySelectorAll('.cp-pchip').length, icon: !!document.querySelector('.inspector .edit-palette svg.icon-palette') };
    });
    await ep.locator('.cp-head button[aria-label="Close the colour picker"]').click();
    await ep.waitForFunction(() => !document.querySelector('.cpick').matches(':popover-open'));
    ok('Main colour: the role\'s swatch, the role (Plex Mono) and an edit button; another role is one undo step and the header\'s dot follows; the edit button opens the colour picker on the main colour',
      m0.role === m0.want && m0.role === 'glow' && m0.swatch === rgbOf(m0.hex) && m0.dot === m0.swatch && m0.font === 'IBM Plex Mono' && m0.edit === 'Edit the main colour|Edit the main colour|true'
        && m1.want === 'team' && m1.role === 'team' && m1.swatch === rgbOf(m1.hex) && m1.dot === m1.swatch && m1.undo === 'Main colour' && m1.n === m0.n + 1 && picker1.title === 'glow',
      JSON.stringify({ m0, m1, picker1 }));
    ok('"Edit palette…" (the palette icon) opens the colour picker at its palette: the Palette section open, in view, with the keyboard focus on its title (the picker\'s tabs come in UI phase 7)',
      picker2.title === 'glow' && picker2.open && picker2.focus && picker2.inView && picker2.chips > 10 && picker2.icon, JSON.stringify(picker2));

    // Cost: closed at first; its header says the state in the status bar's words ("Not measured", muted) and has the Measure
    // button, which works with the section closed and does not open it; the boxes show with Budgets on (remembered), and
    // stay while a budget is set; the conditions are in the info icon's tooltip; the row names are whole, on one line.
    const costNow = () => ep.evaluate(() => {
      const a = window.__vfx.app, c = document.querySelector('.inspector .costcard'), d = c.querySelector(':scope > details'), sum = c.querySelector('.cost-sum'), m = c.querySelector('.cost-measure');
      const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
      const toggle = c.querySelector('.cost-budgets input');
      return { open: d.open, heading: sum.textContent, colour: getComputedStyle(sum).color, bar: document.querySelector('.statusbar .sb-cost').textContent, measure: shown(m) && !d.querySelector('summary').contains(m) && !!m.querySelector('svg.icon-gauge'),
        boxes: [...c.querySelectorAll('input.budget')].filter(shown).length, toggle: toggle ? `${toggle.checked ? 'on' : 'off'}${toggle.disabled ? ' (stays)' : ''}` : null, stored: localStorage.getItem('vfx-budgets'),
        level: shown(c.querySelector('.cost-level')), info: shown(c.querySelector('.cost-info')) ? a.tipForChecks(c.querySelector('.cost-info'))?.lines[0] ?? null : null,
        title: a.tipForChecks(d.querySelector('summary'))?.lines.join(' ') ?? '' };
    });
    const muted = await cssColour('var(--text-muted)'), bad = await cssColour('var(--bad)');
    const c0 = await costNow();
    await ep.locator('.inspector .cost-measure').click();
    await ep.waitForFunction(() => !!window.__vfx.app.costReport() && !window.__vfx.app.costProgress(), null, { timeout: 60000 });
    const c1 = await costNow();
    await ep.locator('.inspector .costcard > details > summary').click();
    const c2 = await costNow();
    await ep.locator('.inspector .cost-budgets input').check();
    const c3 = await costNow();
    const draws = ep.locator('table.cost input.budget[aria-label="Budget: Draws, High"]');
    await draws.fill('1');
    await draws.press('Enter');
    const c4 = await costNow();
    await draws.fill('');
    await draws.press('Enter');
    await ep.locator('.inspector .cost-budgets input').uncheck();
    const c5 = await costNow();
    ok('Cost is closed at first: its header says "Not measured" in --text-muted (the status bar\'s words, without "Cost:") and has the Measure button (gauge icon), which works with the section closed and does not open it; then it says "Measured, no budgets", as the status bar does',
      !c0.open && c0.heading === 'Not measured' && c0.colour === muted && c0.bar === 'Cost: not measured' && c0.measure && !c1.open && c1.heading === 'Measured, no budgets' && c1.bar === c1.heading,
      JSON.stringify({ c0, c1 }));
    ok('Cost\'s Budgets toggle: off at first (no budget boxes, no line about budgets), on shows the 15 boxes and is remembered (vfx-budgets); a budget typed turns the header to "1 over budget" in --bad and the toggle stays on while it is set; off again hides them',
      c2.open && c2.toggle === 'off' && c2.boxes === 0 && !c2.level && c3.toggle === 'on' && c3.boxes === 15 && c3.level && c3.stored === '1'
        && c4.heading === '1 over budget' && c4.colour === bad && c4.bar === '1 over budget' && c4.toggle === 'on (stays)' && c4.boxes === 15 && c5.toggle === 'off' && c5.boxes === 0 && c5.stored === '0',
      JSON.stringify({ c2, c3, c4, c5 }));
    const rowNames = await ep.evaluate(() => [...document.querySelectorAll('table.cost tbody th')].map((th) => {
      const r = document.createRange();
      r.selectNodeContents(th);
      return { name: th.textContent, cut: th.scrollWidth > th.clientWidth + 1, lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size };
    }));
    ok('Cost\'s long explanation is its title\'s tooltip, the measuring conditions the info icon\'s; the table\'s row names show whole, each on one line at 1920 x 1080',
      c1.title.includes('fixed seed') && c2.info?.startsWith('Measured at a fresh game camera') && rowNames.length === 5 && rowNames.every((r) => !r.cut && r.lines === 1),
      JSON.stringify({ title: c1.title.slice(0, 60), info: c2.info?.slice(0, 60), rowNames }));

    // A select too narrow for its value (no ellipsis in a closed select), or a text box (an ellipsis while it does not have
    // the focus): its tooltip gives the value whole, then its label's help text, by the pointer and by the keyboard; one whose
    // value fits has none of its own.
    const cutTips = await ep.evaluate(() => {
      const a = window.__vfx.app;
      const control = (label, tag) => [...document.querySelectorAll('.inspector label.field, .inspector .field')].find((f) => f.querySelector(':scope > .flab')?.textContent === label)?.querySelector(tag);
      a.pickEffect('board_beam'); a.selectLayer(null);
      const name = control('Name', 'input'), events = control('Game events', 'input');
      const out = { name: a.tipForChecks(name)?.lines ?? null, ellipsis: getComputedStyle(name).textOverflow, events: a.tipForChecks(events)?.lines ?? null };
      a.pickEffect('rifle_shot'); a.selectLayer('hit');
      const role = control('Role', 'select'), sits = control('Sits on', 'select');
      return { ...out, role: a.tipForChecks(role)?.lines ?? null, value: role.selectedOptions[0].textContent, sits: a.tipForChecks(sits)?.lines ?? null, sitsValue: sits.selectedOptions[0].textContent };
    });
    const wantRole = help.helpFor('Role', { section: ['Colour'], layer: 'sprite' });
    const wantName = help.helpFor('Name', { section: ['Effect'] });
    ok('a select too narrow for its value ("main (the effect\'s colour)"), or a text box ("Hammer leech beam (board)", which ends in an ellipsis), has a tooltip with the value whole, then its label\'s help text; one whose value fits has none of its own',
      cutTips.role?.[0] === 'main (the effect\'s colour)' && cutTips.role?.[1] === wantRole && cutTips.sits === null
        && cutTips.name?.[0] === 'Hammer leech beam (board)' && cutTips.name?.[1] === wantName && cutTips.ellipsis === 'ellipsis' && cutTips.events === null, JSON.stringify({ cutTips, wantRole, wantName }));
    ok('the effect\'s settings page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await ep.close();
  }

  // -- a layer's settings (docs/ui-redesign.md 6.6, UI phase 6): the Look, then Layer (what draws it, its name, Shows in as
  // three toggle chips with the tier icons, their real checkboxes see-through over them), then the type's own sections. A
  // sprite's Image section: its image select, the picture as wide as the panel allows and at most 160 px tall on the
  // checkerboard with its pivot (a click moves it), Pivot, Flipbook, Grid, Loop the frames, and "Add PNG images…". Readouts
  // end their sections. A glow's gradient has an edit button. And the done-when of phase 6 at 1920 x 1080 (fresh storage,
  // Show hints on): a sprite's Layer, Image and Size and place show without scrolling, the Look first, and the effect's
  // Effect, Scale, Phases and Colour. On a page of its own.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const lp = g.page;
    const undoNow = () => lp.evaluate(() => { const h = window.__vfx.app.history; return { n: h.past.length, label: h.undoLabel ?? null }; });
    const cssColour = (value, prop = 'color') => lp.evaluate(({ value, prop }) => { const s = document.createElement('span'); s.style[prop] = value; document.body.append(s); const c = getComputedStyle(s)[prop]; s.remove(); return c; }, { value, prop });
    const select = (fx, layer) => lp.evaluate(({ fx, layer }) => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect(fx); a.selectLayer(layer); }, { fx, layer });
    /** The sprite's picture, once its image has loaded (before that it is a 160 px square). */
    const pictureLoaded = () => lp.waitForFunction(() => { const i = document.querySelector('.inspector .thumb-pic img'); return !!i && i.complete && i.naturalWidth > 0 && !!document.querySelector('.inspector .thumb-pic').style.getPropertyValue('--ar'); }, null, { timeout: 10000 }).catch(() => {});

    // The done-when, first, with fresh storage: everything open as it is at first, Show hints on.
    await select('rifle_shot', 'flash');
    await pictureLoaded();
    const fits = await lp.evaluate(async () => {
      const a = window.__vfx.app, right = document.querySelector('.right'), panel = right.getBoundingClientRect();
      // The colour list moves to its new place in a short animation: measure where things end up.
      const settled = () => Promise.all(document.getAnimations().filter((x) => x.effect?.target?.closest?.('.swatches')).map((x) => x.finished.catch(() => {})));
      const bottomOf = (title) => { const d = [...document.querySelectorAll('.inspector details')].find((x) => x.querySelector(':scope > summary > .fold-title')?.textContent === title); return d ? Math.round(d.getBoundingClientRect().bottom) : null; };
      const firstFold = document.querySelector('.inspector section.card.layer > details')?.querySelector(':scope > summary > .fold-title')?.textContent ?? null;
      const out = { hints: document.documentElement.dataset.hints, panelBottom: Math.round(panel.bottom), scroll: right.scrollTop, first: firstFold,
        sprite: { Look: bottomOf('Look'), Layer: bottomOf('Layer'), Image: bottomOf('Image'), 'Size and place': bottomOf('Size and place') } };
      a.selectLayer(null);
      await settled();
      out.effect = { Effect: bottomOf('Effect'), Scale: bottomOf('Scale'), Phases: bottomOf('Phases'), Colour: bottomOf('Colour') };
      return out;
    });
    const inside = (o) => Object.values(o).every((b) => b !== null && b <= fits.panelBottom);
    ok('done when: at 1920 x 1080 (fresh storage, Show hints on) a sprite\'s Layer, Image and Size and place sections show without scrolling, the Look first (the demo\'s Muzzle flash, a flipbook), and the effect\'s Effect, Scale, Phases and Colour',
      fits.hints === 'on' && fits.scroll === 0 && fits.first === 'Look' && inside(fits.sprite) && inside(fits.effect), JSON.stringify(fits));

    // Layer: what draws it, its name and Shows in, its kind in its header; Shows in as three toggle chips.
    await select('board_molotov', 'flames');
    const chipsNow = () => lp.evaluate(() => {
      const fold = [...document.querySelectorAll('.inspector details')].find((x) => x.querySelector(':scope > summary > .fold-title')?.textContent === 'Layer');
      const row = fold.querySelector('.tiers-row'), label = row.querySelector(':scope > .flab');
      return { kind: fold.querySelector(':scope > summary > .fold-meta')?.textContent ?? null, rows: [...fold.querySelectorAll(':scope > .foldbody > *')].map((e) => e.matches('.draws') ? 'draws' : e.querySelector(':scope > .flab')?.textContent ?? e.className),
        chips: [...row.querySelectorAll('.tier-boxes > label.check')].map((c) => {
          const box = c.querySelector('input'), r = c.getBoundingClientRect(), b = box.getBoundingClientRect();
          return { word: c.querySelector('span').textContent, icon: c.querySelector('svg')?.getAttribute('class'), on: box.checked, off: box.disabled, name: box.getAttribute('aria-label'),
            over: Math.abs(r.left - b.left) < 0.5 && Math.abs(r.width - b.width) < 0.5 && Math.abs(r.height - b.height) < 0.5, clear: getComputedStyle(box).opacity === '0',
            bg: getComputedStyle(c).backgroundColor, iconColour: getComputedStyle(c.querySelector('svg')).color, h: Math.round(r.height), top: Math.round(r.top), tip: window.__vfx.app.tipForChecks(c)?.lines[0] ?? null };
        }), labelTop: Math.round(label.getBoundingClientRect().top), tiers: window.__vfx.app.layer().tiers.join(',') };
    });
    const field = await cssColour('var(--bg-field)', 'backgroundColor'), accent = await cssColour('var(--accent-ink)');
    const ch0 = await chipsNow();
    // The keyboard: Tab from the name onto the first chip, Space switches Low on (one undo step), Space again off.
    await lp.locator('.inspector .tiers-row').evaluate((row) => row.closest('.foldbody').querySelector('label.field input').focus());
    const u0 = await undoNow();
    await lp.keyboard.press('Tab');
    const focused = await lp.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
    await lp.keyboard.press('Space');
    const ch1 = await chipsNow();
    const u1 = await undoNow();
    await lp.keyboard.press('Space');
    const ch2 = await chipsNow();
    // The last tier cannot be switched off.
    await select('board_molotov', 'flames_low');
    const chLast = await chipsNow();
    ok('Layer: what draws it, Name and Shows in, the layer\'s kind on the right of its header; Shows in is three chips with the tier icons and words, a chip that is on in the field colour with its icon in --accent-ink, one that is off without',
      ch0.kind === 'Shape' && ch0.rows.join() === 'draws,Name,Shows in' && ch0.chips.map((c) => `${c.word}|${c.icon}|${c.name}`).join() === 'Low|icon icon-tier-low|Shows in Low,Medium|icon icon-tier-medium|Shows in Medium,High|icon icon-tier-high|Shows in High'
        && ch0.chips.every((c) => c.h === 24 && Math.abs(c.top - ch0.labelTop) <= 6) && !ch0.chips[0].on && ch0.chips[0].bg !== field && ch0.chips[1].on && ch0.chips[1].bg === field && ch0.chips[1].iconColour === accent,
      JSON.stringify(ch0));
    ok('each chip\'s real checkbox lies over the whole chip, see-through: Tab reaches it, Space switches the tier on and off (one undo step each), and the last tier cannot be switched off (its tooltip says why)',
      ch0.chips.every((c) => c.over && c.clear) && focused === 'Shows in Low' && ch1.tiers === 'low,medium,high' && ch1.chips[0].on && u1.n === u0.n + 1 && u1.label === 'Tiers' && ch2.tiers === 'medium,high'
        && chLast.tiers === 'low' && chLast.chips[0].on && chLast.chips[0].off && chLast.chips[0].tip === 'A layer must show in at least one tier',
      JSON.stringify({ focused, ch1: ch1.tiers, u0, u1, ch2: ch2.tiers, last: chLast.chips[0] }));

    // The Image section of a sprite: the order of its rows, the picture's size, a click on it moving the pivot.
    await select('rifle_shot', 'flash');
    await pictureLoaded();
    const imageNow = () => lp.evaluate(() => {
      const fold = [...document.querySelectorAll('.inspector details')].find((x) => x.querySelector(':scope > summary > .fold-title')?.textContent === 'Image');
      const body = fold.querySelector(':scope > .foldbody'), well = body.querySelector('.thumb'), pic = well.querySelector('.thumb-pic'), dot = pic.querySelector('.pivot');
      const w = well.getBoundingClientRect(), p = pic.getBoundingClientRect(), d = dot.getBoundingClientRect(), row = body.getBoundingClientRect();
      const add = body.querySelector('button.add-images');
      return { rows: [...body.children].filter((e) => !e.hidden).map((e) => e.matches('.thumb') ? 'picture' : e.querySelector(':scope > .flab, :scope > .check-text')?.textContent ?? e.querySelector('button')?.textContent ?? e.className),
        well: { w: Math.round(w.width), full: Math.abs(w.width - row.width) < 1 }, pic: { w: Math.round(p.width), h: Math.round(p.height), centred: Math.abs((p.left - w.left) - (w.right - p.right)) < 1, checker: getComputedStyle(pic).backgroundImage.includes('conic') },
        dot: { x: (d.left + d.width / 2 - p.left) / p.width, y: (d.top + d.height / 2 - p.top) / p.height }, pivot: window.__vfx.app.layer().pivot,
        add: add ? `${add.textContent}|${!!add.querySelector('svg.icon-import')}|${add.className}` : null };
    });
    const im0 = await imageNow();
    const picBox = await lp.locator('.inspector .thumb-pic').boundingBox();
    const u2 = await undoNow();
    await lp.mouse.click(picBox.x + picBox.width * 0.1, picBox.y + picBox.height * 0.3);
    const im1 = await imageNow();
    const u3 = await undoNow();
    await lp.keyboard.press('Control+z');
    await select('rifle_shot', 'tracer');
    await pictureLoaded();
    const tracer = await imageNow();
    ok('Image: the image, its picture, Pivot, Flipbook, Grid, Loop the frames and "Add PNG images…" (a ghost button with the import icon); the picture as wide as the panel allows and at most 160 px tall, on the checkerboard in a well as wide as the panel (a square image 160 x 160, the 512 x 48 tracer the panel\'s width)',
      im0.rows.join() === 'Image,picture,Pivot,Flipbook,Grid,Loop the frames,Add PNG images…' && im0.add === 'Add PNG images…|true|plain add-images' && im0.well.full && im0.pic.w === 160 && im0.pic.h === 160 && im0.pic.centred && im0.pic.checker
        && tracer.pic.w === tracer.well.w && Math.abs(tracer.pic.h - tracer.well.w * 48 / 512) <= 1,
      JSON.stringify({ im0, tracer: { pic: tracer.pic, well: tracer.well } }));
    // (The click lands on whole pixels and the picture may start on a half pixel: the pivot, kept to two decimals, may be
    // 0.01 off what the click aimed at.)
    ok('a click on the picture puts the pivot there (in its frame of the flipbook): one undo step, and the pivot\'s dot follows',
      Math.abs(im1.pivot[0] - 0.2) <= 0.011 && Math.abs(im1.pivot[1] - 0.6) <= 0.011 && u3.n === u2.n + 1 && u3.label === 'Pivot'
        && Math.abs(im1.dot.x - im1.pivot[0] / 2) < 0.01 && Math.abs(im1.dot.y - im1.pivot[1] / 2) < 0.01,
      JSON.stringify({ before: im0.pivot, after: im1.pivot, dot: im1.dot, u3 }));

    // Readouts end their sections, 11 px and muted.
    const readouts = await lp.evaluate(() => {
      const a = window.__vfx.app;
      const muted = (() => { const s = document.createElement('span'); s.style.color = 'var(--text-muted)'; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; })();
      const lastOf = (title) => { const d = [...document.querySelectorAll('.inspector details')].find((x) => x.querySelector(':scope > summary > .fold-title')?.textContent === title); const e = [...d.querySelector(':scope > .foldbody').children].filter((x) => !x.hidden).at(-1);
        return { readout: e.matches('.readout'), text: e.textContent, size: getComputedStyle(e).fontSize, muted: getComputedStyle(e).color === muted }; };
      a.pickEffect('rifle_shot'); a.selectLayer('bullet');
      return { motion: lastOf('Motion'), time: lastOf('Time') };
    });
    ok('readouts end their sections, 11 px and muted: "Now: … in the air over … m." at the end of a projectile\'s Motion, "Shows from … ms" at the end of Time',
      readouts.motion.readout && /^Now: \d+ ms in the air over [\d.]+ m\.$/.test(readouts.motion.text) && readouts.time.readout && /^Shows from \d+ to \d+ ms/.test(readouts.time.text)
        && [readouts.motion, readouts.time].every((r) => r.size === '11px' && r.muted), JSON.stringify(readouts));

    // A glow's gradient: its edit button opens the colour picker at its gradients; with a gradient chosen, that one is open
    // in the gradient editor.
    await select('board_beam', 'emitter_glow');
    const gradButton = lp.locator('.inspector .gradient-field button.edit-gradient');
    const gradInfo = await gradButton.evaluate((b) => `${b.getAttribute('aria-label')}|${!!b.querySelector('svg.icon-edit')}|${b.closest('label.field')?.querySelector('.flab')?.textContent}`);
    await gradButton.click();
    await lp.waitForFunction(() => document.querySelector('.cpick').matches(':popover-open'), null, { timeout: 5000 });
    await lp.waitForTimeout(200);
    const gradientsNow = () => lp.evaluate(() => {
      const c = document.querySelector('.cpick'), sec = c.querySelector('details.gr'), r = c.getBoundingClientRect(), s = sec.getBoundingClientRect();
      return { role: c.querySelector('.cp-title').textContent, open: sec.open, inView: s.top >= r.top - 1 && s.top < r.bottom - 40, focus: document.activeElement === sec.querySelector(':scope > summary'),
        editor: c.querySelector('.gr-editor').open ? c.querySelector('.gr-title').textContent : null };
    });
    const gp0 = await gradientsNow();
    await lp.locator('.gr-tile', { hasText: 'Radial ramp' }).click();
    await lp.locator('.gr-body button', { hasText: 'Use on the selected glow' }).click();
    await lp.locator('.cp-head button[aria-label="Close the colour picker"]').click();
    await lp.waitForFunction(() => !document.querySelector('.cpick').matches(':popover-open'));
    await lp.evaluate(() => { const d = document.querySelector('.cpick .gr-editor'); d.open = false; });
    await gradButton.click();
    await lp.waitForFunction(() => document.querySelector('.cpick').matches(':popover-open'), null, { timeout: 5000 });
    await lp.waitForTimeout(200);
    const gp1 = await gradientsNow();
    const gradLayer = await lp.evaluate(() => window.__vfx.app.layer().shape.gradient ?? null);
    await lp.locator('.cp-head button[aria-label="Close the colour picker"]').click();
    ok('a glow\'s "Gradient, middle to rim" has an edit button that opens the colour picker at its gradients (on the glow\'s colour, the Gradients section open and in view); with a gradient chosen, that gradient is open in the editor (the picker\'s tabs come in UI phase 7)',
      gradInfo === 'Edit the gradients|true|Gradient, middle to rim' && gp0.role === 'glow' && gp0.open && gp0.inView && gp0.focus && gradLayer === 'glow.ramp' && gp1.open && gp1.inView && gp1.editor === 'glow.ramp',
      JSON.stringify({ gradInfo, gp0, gp1, gradLayer }));
    ok('the layer\'s settings page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await lp.close();
  }

  // -- Part B in the right panel and the transport (UI phase 6, slices 5 and 6: the plan Mustafa approved on 2026-11-15): a
  // word layer's words with their chances (a % box per word, Remove, Add word, "No word: 40 %", the red note over 100 %, the
  // 1,000-shot line counted with the game's own pick, capitals, one undo step per change); a gradient picked on smoke, a
  // fire's bed and a burst (drawn by the runtime, one undo step, with a glow's edit button); the "not drawn" warning over the
  // preview and next to what draws the layer (a layer the tier leaves out, a file with errors; an image that did not load is
  // on a throwaway project below); New shot each loop next to Loop (on at first, a new seed each loop, off holds one shot,
  // Fire still makes a new one). On a page of its own; nothing is saved.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const bp = g.page;
    bp.on('dialog', (d) => d.accept());
    const odds = await server.ssrLoadModule('/src/doc/odds.ts');
    const help = await server.ssrLoadModule('/src/app/help.ts');
    const undoNow = () => bp.evaluate(() => { const h = window.__vfx.app.history; return { n: h.past.length, label: h.undoLabel ?? null }; });
    const cssColour = (value, prop = 'color') => bp.evaluate(({ value, prop }) => { const s = document.createElement('span'); s.style[prop] = value; document.body.append(s); const c = getComputedStyle(s)[prop]; s.remove(); return c; }, { value, prop });
    const bad = await cssColour('var(--bad)'), faint = await cssColour('var(--text-faint)');

    // ---- the words with their chances: the tank shell's sound word (four words, no chances at first)
    await bp.evaluate(() => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect('board_shell'); a.selectLayer('word'); });
    const wordsNow = () => bp.evaluate(() => {
      const a = window.__vfx.app, list = document.querySelector('.inspector .word-list');
      const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
      const line = (c) => { const e = list.querySelector(c); return shown(e) ? e.textContent : ''; };
      const rows = [...list.querySelectorAll('.word-row')].map((r) => {
        const box = r.querySelector('input.num');
        return { text: r.querySelector('input.word-text').value, font: getComputedStyle(r.querySelector('input.word-text')).fontFamily.split(',')[0].replace(/"/g, ''), chance: box.value, placeholder: box.placeholder,
          placeholderColour: getComputedStyle(box, '::placeholder').color, unit: r.querySelector('.unit')?.textContent ?? null, remove: !r.querySelector('button.word-remove').disabled, h: Math.round(r.getBoundingClientRect().height) };
      });
      return { label: list.querySelector(':scope > .flab').textContent, inField: list.matches('.field'), rows, none: line('.word-none'), over: line('.word-over'), overColour: getComputedStyle(list.querySelector('.word-over')).color,
        odds: line('.word-odds'), add: !list.querySelector('button.add-word').disabled, layer: a.layer(), n: a.history.past.length, undo: a.history.undoLabel ?? null,
        focus: document.activeElement?.getAttribute('aria-label') ?? null, unsaved: document.querySelector('.project-name').textContent.includes('•') };
    });
    /** The 1,000-shot line as the game's own pick gives it, counted here (src/doc/odds.ts, the runtime's pickWord). */
    const wantOdds = (layer) => {
      const o = odds.wordOdds(layer, 1000);
      const n = (x) => x.toLocaleString('en-US');
      return `In 1,000 shots: ${[...layer.words.map((w, i) => `${w.text} ${n(o.words[i])}`), ...(o.none ? [`no word ${n(o.none)}`] : [])].join(', ')}`;
    };
    const chanceBox = (k) => bp.locator(`.inspector .word-list .word-row:nth-child(${k}) input.num`);
    const typeChance = async (k, text) => { await chanceBox(k).fill(text); await chanceBox(k).press('Enter'); };
    const w0 = await wordsNow();
    await typeChance(1, '30');
    const w1 = await wordsNow();
    await typeChance(2, '20');
    await typeChance(3, '5');
    await typeChance(4, '5');
    const w2 = await wordsNow();
    await typeChance(3, '5,5');
    const w3 = await wordsNow();
    await typeChance(1, '90');
    const w4 = await wordsNow();
    await typeChance(4, '');
    const w5 = await wordsNow();
    // Tab through a box that is empty, and Enter on one that shows its number: nothing changes.
    await chanceBox(4).focus();
    await bp.keyboard.press('Tab');
    await chanceBox(1).focus();
    await bp.keyboard.press('Enter');
    const w6 = await wordsNow();
    ok('a word layer\'s words: one row per word (the word in Plex Mono, its chance in a % box, Remove) under the label "Words (one picked per play)"; an empty box shows, faint, the share it gets (25 % each with no chances)',
      w0.label === 'Words (one picked per play)' && w0.inField && w0.rows.map((r) => r.text).join() === 'KABOOM,KRAKOOM,BADOOM,WHAM' && w0.rows.every((r) => r.chance === '' && r.placeholder === '25' && r.unit === '%' && r.remove && r.font === 'IBM Plex Mono' && r.h === 28)
        && w0.rows[0].placeholderColour === faint && w0.none === '' && w0.over === '' && w0.add,
      JSON.stringify(w0.rows));
    ok('a chance typed is one undo step ("Word chance"); the empty boxes share what is left (70 % in three: 23.3 each); every word with a chance and 60 % in all: "No word: 40 %"; "5,5" takes the comma as the decimal point',
      w1.layer.words[0].chance === 30 && w1.n === w0.n + 1 && w1.undo === 'Word chance' && w1.rows.slice(1).every((r) => r.placeholder === '23.3')
        && w2.layer.words.map((w) => w.chance).join() === '30,20,5,5' && w2.n === w0.n + 4 && w2.none === 'No word: 40 %' && w2.rows.every((r) => r.placeholder === '')
        && w3.layer.words[2].chance === 5.5 && w3.none === 'No word: 39.5 %',
      JSON.stringify({ w1: [w1.layer.words, w1.undo, w1.rows.map((r) => r.placeholder)], w2: [w2.none, w2.n - w0.n], w3: w3.none }));
    ok('over 100 % a red note (--bad) says they still play, scaled down to 100 %, and "No word" goes; a box cleared takes the chance away (one undo step); Tab through an empty box and Enter on a shown number change nothing',
      w4.over === 'The chances add up to 120.5 %: they still play, scaled down to 100 %.' && w4.overColour === bad && w4.none === ''
        && w5.layer.words[3].chance === undefined && w5.n === w4.n + 1 && w5.over.startsWith('The chances add up to 115.5 %') && w6.n === w5.n && JSON.stringify(w6.layer.words) === JSON.stringify(w5.layer.words),
      JSON.stringify({ w4: [w4.over, w4.overColour], w5: [w5.layer.words, w5.over], w6: w6.n - w5.n }));
    ok('the 1,000-shot line is the game\'s own pick, counted for seeds 1 to 1,000 (src/doc/odds.ts: the runtime\'s pickWord): with no chances, with "No word: 40 %", and over 100 %',
      w0.odds === wantOdds(w0.layer) && w2.odds === wantOdds(w2.layer) && w2.odds.includes(', no word ') && w4.odds === wantOdds(w4.layer) && /^In 1,000 shots: KABOOM \d/.test(w0.odds),
      JSON.stringify({ w0: w0.odds, w2: w2.odds, w4: w4.odds }));
    // Remove, Add word (its box takes the focus, its text chosen: typed words go in capitals), an empty word.
    await bp.locator('.inspector .word-list .word-row:nth-child(4) button.word-remove').click();
    const w7 = await wordsNow();
    await bp.locator('.inspector .word-list button.add-word').click();
    const w8 = await wordsNow();
    await bp.keyboard.type('pow');
    const typedNow = await bp.evaluate(() => document.activeElement?.value ?? null);
    await bp.keyboard.press('Enter');
    const w9 = await wordsNow();
    await bp.locator('.inspector .word-list input[aria-label="Word 4"]').fill('');
    await bp.locator('.inspector .word-list input[aria-label="Word 4"]').press('Enter');
    const w10 = await wordsNow();
    // A word typed again in another spelling, then given its first chance, which builds the panel again: the focus stays in
    // its % box, named after the word shown. A word removed with the keyboard: the focus goes to the bin that takes its place.
    await bp.locator('.inspector .word-list input[aria-label="Word 4"]').fill('blam');
    await bp.locator('.inspector .word-list input[aria-label="Word 4"]').press('Enter');
    await typeChance(4, '10');
    const kept = await bp.evaluate(() => ({ focus: document.activeElement?.getAttribute('aria-label') ?? null, box: document.activeElement?.matches('.word-list input.num') ?? false, word: window.__vfx.app.layer().words[3] }));
    await bp.locator('.inspector .word-list .word-row:nth-child(4) button.word-remove').focus();
    await bp.keyboard.press('Enter');
    const afterRemove = await bp.evaluate(() => ({ focus: document.activeElement?.getAttribute('aria-label') ?? null, n: window.__vfx.app.layer().words.length }));
    for (let k = 0; k < 3; k++) await bp.keyboard.press('Control+z');
    ok('a word typed again in another spelling keeps the focus in its % box through its first chance (the panel is built again; the box is named after the word shown); after Remove with the keyboard the focus goes to the bin that takes its place',
      kept.focus === 'Chance of BLAM' && kept.box && JSON.stringify(kept.word) === '{"text":"BLAM","chance":10}' && afterRemove.focus === 'Remove BADOOM' && afterRemove.n === 3,
      JSON.stringify({ kept, afterRemove }));
    // One word left: it cannot be removed; sixteen: no more can be added.
    await bp.evaluate(() => { const a = window.__vfx.app; a.editLayer(['words'], [{ text: 'BOOM' }], { label: 'x' }); a.commit(); });
    const one = await wordsNow();
    await bp.evaluate(() => { const a = window.__vfx.app; a.editLayer(['words'], Array.from({ length: 16 }, (_, i) => ({ text: `W${i}` })), { label: 'x' }); a.commit(); });
    const sixteen = await wordsNow();
    for (let k = 0; k < 2; k++) await bp.keyboard.press('Control+z');
    ok('Remove takes a word away with its chance, Add word adds BOOM with no chance and its box takes the focus with its text chosen; typed words are capitals ("pow" shows POW); each is one undo step; an empty word puts the old one back',
      w7.layer.words.map((w) => w.text).join() === 'KABOOM,KRAKOOM,BADOOM' && w7.n === w6.n + 1 && w7.undo === 'Remove word'
        && w8.layer.words.length === 4 && JSON.stringify(w8.layer.words[3]) === '{"text":"BOOM"}' && w8.focus === 'Word 4' && w8.undo === 'Add word'
        && typedNow === 'POW' && w9.layer.words[3].text === 'POW' && w9.undo === 'Word' && w9.n === w8.n + 1 && w10.rows[3].text === 'POW' && w10.n === w9.n,
      JSON.stringify({ w7: w7.layer.words, w8: [w8.layer.words[3], w8.focus], typedNow, w9: w9.layer.words[3], w10: [w10.rows[3].text, w10.n - w9.n] }));
    ok('a word layer keeps at least one word (its Remove is off) and has at most sixteen (Add word is off)',
      one.rows.length === 1 && !one.rows[0].remove && one.add && sixteen.rows.length === 16 && !sixteen.add, JSON.stringify({ one: one.rows.length, sixteen: [sixteen.rows.length, sixteen.add] }));
    for (let k = 0; k < w10.n - w0.n; k++) await bp.keyboard.press('Control+z');
    const wBack = await wordsNow();
    ok('undo puts the words back as they were, one step at a time, and leaves nothing unsaved', JSON.stringify(wBack.layer.words) === JSON.stringify(w0.layer.words) && wBack.n === w0.n && !wBack.unsaved,
      JSON.stringify({ words: wBack.layer.words, n: wBack.n - w0.n }));

    // ---- gradients on smoke, a fire's bed and a burst: a banded green-to-blue gradient made in the page (the examples'
    // palette has none), picked in each layer's own select; drawn, read in the runtime's own buffers.
    await bp.evaluate(() => { const a = window.__vfx.app; a.setGradient('check.green', { kind: 'banded', from: 'mustafa', stops: [{ at: 0, hex: '#00FF00' }, { at: 0.5, hex: '#0000FF' }] }); a.commit(); });
    const gradNow = (layer) => bp.evaluate(async (layer) => {
      const a = window.__vfx.app;
      if (a.effect()?.id !== 'board_molotov') a.pickEffect('board_molotov');
      a.selectLayer(layer);
      const span = a.timeline().byId.get(layer);
      await a.showAt(span.startMs + (span.endMs - span.startMs) * 0.4, 7);
      const i = a.effect().layers.findIndex((l) => l.id === layer);
      let own = 0, banded = 0;
      const is = (v, k) => Math.abs(v - k) < 0.002;
      for (const b of Object.values(a.previewForChecks.vfx.sink.groups)) {
        for (let v = 0; v < b.vcount; v++) {
          if (b.layer[v] !== i) continue;
          own++;
          const r = b.col[v * 4], gg = b.col[v * 4 + 1], bb = b.col[v * 4 + 2];
          if (is(r, 0) && ((is(gg, 1) && is(bb, 0)) || (is(gg, 0) && is(bb, 1)))) banded++;
        }
      }
      const l = a.layer();
      const f = [...document.querySelectorAll('.inspector .gradient-field label.field')][0];
      return { own, banded, gradient: (l.type === 'burst' ? l.gradient : l.shape.gradient) ?? null, label: f?.querySelector('.flab').textContent ?? null, value: f?.querySelector('select').value ?? null,
        none: f?.querySelector('select').options[0].textContent ?? null, edit: !!f?.querySelector('button.edit-gradient svg.icon-edit'), n: a.history.past.length, undo: a.history.undoLabel ?? null };
    }, layer);
    const pick = async (label) => bp.locator('.inspector .gradient-field label.field', { has: bp.locator('.flab', { hasText: exactly(label) }) }).locator('select').selectOption('check.green');
    const grads = {};
    for (const [layer, label] of [['smoke', 'Gradient over life'], ['bed', 'Gradient, middle to rim'], ['sparks', 'Gradient over life']]) {
      const before = await gradNow(layer);
      await pick(label);
      grads[layer] = { before, after: await gradNow(layer) };
    }
    ok('smoke, a fire\'s bed and a burst have a gradient field like a glow\'s (smoke and a burst: "Gradient over life"; a bed: "Gradient, middle to rim"), with no gradient at first and its edit button',
      grads.smoke.before.label === 'Gradient over life' && grads.bed.before.label === 'Gradient, middle to rim' && grads.sparks.before.label === 'Gradient over life'
        && Object.values(grads).every((x) => x.before.gradient === null && x.before.value === '' && x.before.edit && /^None: /.test(x.before.none)),
      JSON.stringify(Object.fromEntries(Object.entries(grads).map(([k, x]) => [k, [x.before.label, x.before.none, x.before.edit]]))));
    ok('a gradient picked on smoke, the bed and a burst goes into the file in one undo step each, and the runtime draws it: their vertices take its two colours (none did before)',
      Object.values(grads).every((x) => x.after.gradient === 'check.green' && x.after.value === 'check.green' && x.after.n === x.before.n + 1 && x.after.undo === 'Gradient' && x.before.own > 0 && x.before.banded === 0 && x.after.banded > 0),
      JSON.stringify(Object.fromEntries(Object.entries(grads).map(([k, x]) => [k, { own: x.after.own, banded: [x.before.banded, x.after.banded], undo: x.after.undo }]))));
    // The smoke's edit button: the colour picker at its gradients, with the gradient chosen open in the editor.
    await bp.evaluate(() => window.__vfx.app.selectLayer('smoke'));
    await bp.locator('.inspector .gradient-field button.edit-gradient').click();
    await bp.waitForFunction(() => document.querySelector('.cpick').matches(':popover-open'), null, { timeout: 5000 });
    await bp.waitForTimeout(200);
    const smokePicker = await bp.evaluate(() => { const c = document.querySelector('.cpick'), sec = c.querySelector('details.gr'); return { role: c.querySelector('.cp-title').textContent, open: sec.open, editor: c.querySelector('.gr-editor').open ? c.querySelector('.gr-title').textContent : null }; });
    await bp.locator('.cp-head button[aria-label="Close the colour picker"]').click();
    ok('the smoke\'s gradient edit button opens the colour picker at its gradients, on the smoke\'s colour, with its gradient open in the editor',
      smokePicker.role === 'fire.smoke' && smokePicker.open && smokePicker.editor === 'check.green', JSON.stringify(smokePicker));
    for (let k = 0; k < 4; k++) await bp.keyboard.press('Control+z');
    const gradsBack = await bp.evaluate(() => { const a = window.__vfx.app, fx = a.effect(); return { names: Object.keys(a.palette.gradients ?? {}), any: fx.layers.some((l) => l.gradient || l.shape?.gradient) }; });
    ok('undo takes the three gradients and the gradient made for the check away again', gradsBack.names.length === 0 && !gradsBack.any, JSON.stringify(gradsBack));

    // ---- the "not drawn" warning: over the preview (lower left, above the drag hint) and next to what draws the layer
    const notesNow = () => bp.evaluate(async () => {
      const a = window.__vfx.app;
      await a.showAt(60, 7);
      const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
      const notes = [...document.querySelectorAll('.vnotes .vnote')].filter(shown);
      const v = document.querySelector('.viewport').getBoundingClientRect(), h = document.querySelector('.vhint').getBoundingClientRect(), n = notes[0]?.getBoundingClientRect();
      return { notes: notes.map((x) => x.textContent), panel: [...document.querySelectorAll('.inspector .draws .not-drawn-line')].filter(shown).map((x) => x.textContent),
        icon: notes[0] ? getComputedStyle(notes[0].querySelector('svg')).color : null, hint: shown(document.querySelector('.vhint')),
        place: n ? { left: n.left - v.left, aboveHint: !shown(document.querySelector('.vhint')) || n.bottom <= h.top, inside: n.bottom <= v.bottom && n.left >= v.left } : null,
        drawsTip: a.tipForChecks(document.querySelector('.inspector .draws .not-drawn'))?.lines[0] ?? null };
    });
    await bp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); a.selectLayer('hit'); });
    const nd0 = await notesNow();
    await bp.evaluate(() => { const a = window.__vfx.app; a.editLayer(['tiers'], ['high'], { label: 'Tiers' }); a.commit(); a.setTierForChecks('low'); });
    const nd1 = await notesNow();
    await bp.locator('.topbar .hints-toggle').click();
    const nd2 = await notesNow();
    await bp.locator('.topbar .hints-toggle').click();
    await bp.evaluate(() => { const a = window.__vfx.app; a.setTierForChecks('high'); a.editEffect(['controls', 'size'], 99, { label: 'Size' }); a.commit(); });
    const nd3 = await notesNow();
    await bp.keyboard.press('Control+z');
    await bp.keyboard.press('Control+z');
    const nd4 = await notesNow();
    ok('a healthy layer gets no "not drawn" warning, over the preview or in its panel',
      nd0.notes.length === 0 && nd0.panel.length === 0 && nd4.notes.length === 0 && nd4.panel.length === 0, JSON.stringify({ nd0, nd4 }));
    ok('a layer the tier leaves out: the preview says "Hit spark is not drawn: the Low tier leaves it out: it shows in High." (lower left, above the drag hint, the warning icon in --bad) and its panel says it under what draws it',
      nd1.notes.join() === 'Hit spark is not drawn: the Low tier leaves it out: it shows in High.' && nd1.panel.join() === 'Not drawn: the Low tier leaves it out: it shows in High.'
        && nd1.icon === bad && nd1.place?.inside && nd1.place.aboveHint && nd1.place.left <= 12 && nd1.drawsTip === help.NEW_THIS_ROUND.notDrawn,
      JSON.stringify(nd1));
    ok('the warning is a state, not a hint: with Show hints off the drag hint goes and the warning stays', !nd2.hint && nd2.notes.join() === nd1.notes.join(), JSON.stringify({ hint: nd2.hint, notes: nd2.notes }));
    ok('a file with errors that stop the preview: "Rifle shot (demo) is not drawn: its file has errors …" over the preview, and the layer\'s panel says its effect has errors',
      nd3.notes.join() === 'Rifle shot (demo) is not drawn: its file has errors (listed at the top of the right panel).' && nd3.panel.join() === 'Not drawn: its effect has errors that stop the preview.',
      JSON.stringify({ notes: nd3.notes, panel: nd3.panel }));

    // ---- New shot each loop, next to Loop in the timeline's header: on at first, each loop a new seed; off, the same shot
    // again; Fire still makes a new one. The clock is driven by the check (tickForChecks), so the loop is certain.
    const shot0 = await bp.evaluate(() => {
      const b = document.querySelector('.transport button.new-shot'), loop = document.querySelector('.transport .tb[aria-pressed]');
      const probe = document.createElement('i'); probe.style.color = 'var(--accent-ink)'; document.body.append(probe); const accent = getComputedStyle(probe).color; probe.remove();
      return { text: b.textContent, pressed: b.getAttribute('aria-pressed'), afterLoop: b.previousElementSibling === loop && loop.textContent === 'Loop', icon: !!b.querySelector('svg.icon-dice'),
        yellow: getComputedStyle(b.querySelector('svg')).color === accent, tip: window.__vfx.app.tipForChecks(b)?.lines ?? null, oneRow: Math.round(document.querySelector('.transport').getBoundingClientRect().height) };
    });
    const loopOnce = () => bp.evaluate(async () => {
      const a = window.__vfx.app;
      a.pickEffect('rifle_shot');
      const len = a.timeline().lengthMs;
      await a.showAt(len - 20, 5);
      document.querySelector('.transport .play').click();
      await a.tickForChecks(600);
      const d = a.debugState();
      document.querySelector('.transport .play').click();
      a.resumeForChecks();
      return { seed: d.seed, time: d.mainTime, len };
    });
    const nextSeed = (s) => ((s * 1664525 + 1013904223) >>> 0);
    const looped = await loopOnce();
    await bp.locator('.transport button.new-shot').click();
    const offPressed = await bp.locator('.transport button.new-shot').getAttribute('aria-pressed');
    const held = await loopOnce();
    await bp.evaluate(() => { const a = window.__vfx.app; window.__vfxManual = true; return a.showAt(20, 5); });
    await bp.locator('.timeline').click({ position: { x: 60, y: 8 } });
    await bp.keyboard.press('f');
    const firedSeed = await bp.evaluate(() => window.__vfx.app.debugState().seed);
    await bp.evaluate(() => window.__vfx.app.resumeForChecks());
    await bp.locator('.transport button.new-shot').click();
    ok('New shot each loop sits right after Loop in the timeline\'s header: the dice icon and its words, on at first (its icon in the accent, as an active toggle), its help text in its tooltip; the header stays one 32 px row',
      shot0.text === 'New shot each loop' && shot0.pressed === 'true' && shot0.afterLoop && shot0.icon && shot0.yellow && shot0.tip?.includes(help.HELP['New shot each loop']) && shot0.oneRow === 32,
      JSON.stringify(shot0));
    ok('on, a loop of Play is a new shot (the next seed: everything random changes); off, the loop shows the same shot again; Fire makes a new shot either way',
      looped.time < looped.len - 20 && looped.seed === nextSeed(5) && offPressed === 'false' && held.time < held.len - 20 && held.seed === 5 && firedSeed === nextSeed(5),
      JSON.stringify({ looped, offPressed, held, firedSeed, want: nextSeed(5) }));
    ok('the Part B page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await bp.close();
  }

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
  const insignia = await p.evaluate(() => ({
    rows: [...document.querySelectorAll('#faction-menu .menu-item')].map((b) => `${b.querySelector('.menu-icon svg')?.getAttribute('class')}|${b.querySelector('.menu-label').textContent}|${b.querySelector('.team-dot') ? 'dot' : 'no dot'}`),
    chip: (() => { const c = document.querySelector('.vbar .faction-chip'), svg = c.querySelector('.chip-icon svg'); return `${svg?.getAttribute('class')}|${c.querySelector('.chip-value').textContent}|${getComputedStyle(svg.querySelector('.insignia')).fill}`; })(),
    want: (() => { const a = window.__vfx.app, f = a.faction, p = document.createElement('span'); p.style.color = a.palette.factions[f].roles.team.hex; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return `icon icon-faction-${f} team-filled|${a.palette.factions[f].name}|${c}`; })(),
  }));
  ok('the Faction chip\'s menu shows each faction\'s marking, its name and its team colour\'s dot; the chip shows the chosen faction\'s marking, filled with its team colour, and its name',
    insignia.rows.join() === 'icon icon-faction-soviets|Soviets|dot,icon icon-faction-allies|Allies|dot,icon icon-faction-empire|Empire|dot' && insignia.chip === insignia.want, JSON.stringify(insignia));
  // Each team colour's dot keeps an edge that stands out from the menu (3:1 or more) in Day and in Night, so a dark team
  // colour (Empire's purple on Night's menu) still shows. The theme is put back after.
  const dots = await p.evaluate(() => {
    const rgba = (s) => { const v = s.match(/[\d.]+/g).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
    const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const lum = (c) => [c.r, c.g, c.b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (x, y) => { const [m, n] = [lum(x), lum(y)].sort((u, w) => w - u); return (m + 0.05) / (n + 0.05); };
    const was = document.documentElement.dataset.theme;
    const out = {};
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      const menu = document.getElementById('faction-menu');
      const bg = rgba(getComputedStyle(menu).backgroundColor);
      out[theme] = [...menu.querySelectorAll('.team-dot')].map((d) => {
        const cs = getComputedStyle(d), shadow = cs.boxShadow, m = shadow.match(/rgba?\([^)]*\)/);
        if (!m) return { shadow, ratio: 0 };
        // An inset edge is drawn over the dot's own colour; an edge outside it, over the menu.
        const ring = over(rgba(m[0]), shadow.includes('inset') ? rgba(cs.backgroundColor) : bg);
        return { fill: cs.backgroundColor, shadow, ratio: +ratio(ring, bg).toFixed(2) };
      });
    }
    document.documentElement.dataset.theme = was;
    return out;
  });
  ok('each team colour\'s dot in the Faction menu has an edge that stands out from the menu, 3:1 or more, in Day and in Night',
    ['light', 'dark'].every((t) => dots[t].length === 3 && dots[t].every((d) => d.ratio >= 3)), JSON.stringify(dots));

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
  await effectMenu(p, 'Tank shell flight (demo)', 'Delete');
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
    // Not an example: the top bar's Save says Saved, and Save as… is in the main menu.
    await savedPage.page.click('.topbar .logo');
    await savedPage.page.getByRole('menuitem', { name: 'Save as…', exact: true }).click();
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

    // At once on keyboard focus (Shift+Tab from Save to Night mode), named and explained; Esc hides it and still leaves the
    // layer, as Esc does.
    await tp.evaluate(() => { const a = window.__vfx.app; a.selectLayer('flash'); });
    await restPointer();
    await tp.locator('.topbar button.save').focus();
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
      // Since UI phase 6 a box of a group of numbers (a prefix "R", "Min") has a tooltip of its own: its full name and the help
      // text for it, or for its row.
      const LABELS = '.lab > label, .lab > span:first-child:not(.hint):not(.val), .flab, label.check, details > summary, section.card > h2, .card-head > h2, table.cost th, .prop-group .scrub';
      const misses = new Set(), seen = new Set(), long = new Set();
      let checked = 0, hints = 0;
      const look = (where) => {
        // Each hint shown in the panel (296 px wide here): one line, two at most (16 px a line).
        for (const el of document.querySelectorAll('.inspector .hint')) {
          if (!el.textContent.trim() || getComputedStyle(el).display === 'none' || !el.getClientRects().length) continue;
          hints++;
          if (Math.round(el.getBoundingClientRect().height / 16) > 2) long.add(`${where}: "${el.textContent.trim()}"`);
        }
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
      // The top bar (Projects… and Keys moved into the main menu, with Save as…), the main menu (on body, closed), the
      // viewport toolbar with its chips' menus and the Distance popover (on body, closed), the timeline's header (Transport)
      // and the status bar.
      const BAR = { 'Top bar': ['Main menu', 'Project', 'Undo', 'Redo', 'Show hints', 'Night mode', 'Save as…', 'Export…'],
        'Main menu': ['Projects…', 'New project…', 'Save', 'Save as…', 'Export…', 'Import an export…', 'Show hints', 'Night mode', 'Keyboard shortcuts'],
        'Preview bar': ['Fire', 'Scene', 'Faction that fired', 'Made by', 'Distance from you', 'Tier', 'Low', 'Medium', 'High', 'View', 'Close-up on',
          'Whole screen', 'Game size', 'Close-up', 'Close-up on the muzzle', 'Close-up on the target', 'Made by an enemy', 'Made by your team', 'Made by you', 'Fade other layers'],
        Transport: ['Step back', 'Play', 'Step forward', 'Loop', 'New shot each loop', 'Speed', 'Time'], 'Status bar': ['Checks', 'Triangles and draw calls', 'Cost', 'Renderer', 'Keyboard shortcuts'],
        Effects: ['Effects', 'Add an effect', 'New effect', 'From preset…', 'Search effects', 'Rename', 'Duplicate', 'Move to folder…', 'Delete effect', 'No folder', 'New folder…'],
        Layers: ['Layers', 'Add a layer', 'Sprite layer', 'Projectile layer', 'Shape layer', 'Shape: ring', 'Shape: bed', 'Burst layer', 'Word layer', 'Rename', 'Duplicate', 'Move up', 'Move down', 'Delete layer'] };
      const bars = [];
      for (const [section, labels] of Object.entries(BAR)) {
        const regions = [...document.querySelectorAll(`[data-help-section="${section}"]`)];
        for (const label of labels) {
          const el = regions.flatMap((region) => [...region.querySelectorAll('button, .lab > span, .flab, select, [data-help-label], h2')]).find((x) => !x.closest('.effects-list, .layers-list') && (x.getAttribute('aria-label') === label || x.getAttribute('data-help-label') === label || x.textContent.replace(/\s+/g, ' ').trim() === label));
          if (!el || !a.helpForChecks(el)) bars.push(`${section}: ${label}${el ? '' : ' (not found)'}`);
        }
      }
      return { checked, distinct: seen.size, misses: [...misses], bars, hints, long: [...long], panel: Math.round(document.querySelector('.right').getBoundingClientRect().width) };
    });
    ok('every label and section title of the right panel (every layer of both examples) and every control of the bars has a help text',
      sweep.misses.length === 0 && sweep.bars.length === 0 && sweep.checked > 5000 && sweep.distinct >= 195,
      `${sweep.checked} labels and titles checked (${sweep.distinct} different); missing: ${[...sweep.misses.slice(0, 4), ...sweep.bars.slice(0, 4)].join(', ') || 'none'}`);
    ok('every hint in the right panel, for every layer of both examples, is one line, two at most, at the default panel width',
      sweep.panel === 296 && sweep.hints > 100 && sweep.long.length === 0, `${sweep.hints} hints seen in the ${sweep.panel} px panel; longer than two lines: ${sweep.long.slice(0, 3).join(', ') || 'none'}`);
    // The full words of each rewritten hint are in the tooltip of what it explains (the colour picker's: its sections' titles).
    const longWords = await tp.evaluate(() => {
      const a = window.__vfx.app;
      if (!a.debugState().effects.includes('board_beam')) { window.confirm = () => true; return a.openProject('examples/demo-project').then(() => null); }
      return null;
    }).then(() => tp.evaluate(() => {
      const a = window.__vfx.app;
      const find = (sel, text) => [...document.querySelectorAll(sel)].find((x) => x.textContent.replace(/\s+/g, ' ').trim() === text);
      const tipOf = (el) => (el ? a.tipForChecks(el) : null);
      const words = (el) => tipOf(el)?.lines.join(' ') ?? '';
      a.pickEffect('board_beam');
      const out = {
        // Since UI phase 6: "Game events" (the brief's words), and Cost and the effect's Colour are sections that fold (their
        // titles are the folds' summaries).
        events: words(find('.inspector .flab', 'Game events')), size: words(find('.inspector .flab', 'Size')),
        intensity: words(find('.inspector .flab', 'Intensity')), duration: words(find('.inspector .flab', 'Duration')),
        // The checker's five things: in the Checks section's title until UI phase 6; since, in the status bar's Checks (and the
        // problems banner, which shows only with problems: see the header and problems page).
        cost: words(document.querySelector('.inspector .costcard > details > summary')), checks: words(document.querySelector('.statusbar .sb-checks')),
        layers: tipOf(find('.layers-section h2', 'Layers'))?.lines ?? null,
        colour: words(find('.inspector .bigcontrols details > summary', 'Colour')),
      };
      a.selectLayer('emitter_glow');
      out.gradient = words(find('.inspector .flab', 'Gradient, middle to rim'));
      out.layerColour = words(find('.inspector details > summary', 'Colour'));
      a.selectLayer(null);
      out.newColour = words(find('.cpick summary', 'New colour'));
      out.gradients = words(find('.cpick summary', 'Gradients'));
      out.ramp = words(find('.cpick summary', 'Make a ramp between two colours'));
      out.editor = words(document.querySelector('.cpick .gr-editor > summary'));
      return out;
    }));
    ok('the full words of each rewritten hint are in the tooltip of what it explains: Game events, Size, Intensity, Duration, Cost, Checks, the Layers title, Colour, a glow\'s gradient, and the colour picker\'s New colour, Gradients, ramp and gradient editor',
      longWords.events.includes('One event plays one effect; the names are proposals until the game settles them') && longWords.size.includes('sprites, shapes, pieces, words and offsets')
        && longWords.intensity.includes('never makes anything see-through') && longWords.duration.includes('A flight by speed') && longWords.cost.includes('fixed seed') && longWords.cost.includes('saved in project.json')
        && longWords.checks.includes('links between layers') && longWords.layers?.[0] === 'Top of the list draws on top.' && longWords.colour.includes('used by every layer whose colour is "main"')
        && longWords.gradient.includes('the edit button next to it opens the picker at its gradients') && longWords.layerColour.includes('the marked one is the effect\'s main colour')
        && longWords.newColour.includes('Effects name it') && longWords.gradients.includes('Blurred, mesh and image gradients are not in') && longWords.ramp.includes('(OKLCH)')
        && longWords.editor.includes('cannot be renamed or removed this round'), JSON.stringify(longWords));
    // One name for one thing: the Game events hint says what the game does with the names in the words of its tooltip and
    // README ("starts").
    const eventsHint = await tp.evaluate(() => {
      const a = window.__vfx.app;
      a.pickEffect('board_beam');
      const field = document.querySelector('.inspector .field.events');
      return { hint: field?.querySelector(':scope > .hint')?.textContent ?? null, tip: field ? a.tipForChecks(field.querySelector('.flab'))?.lines.join(' ') ?? '' : '' };
    });
    ok('the Game events hint uses its tooltip\'s verb: "Names the game starts this effect by, separated by commas."',
      eventsHint.hint === 'Names the game starts this effect by, separated by commas.' && eventsHint.tip.includes('The names the game starts this effect by'), JSON.stringify(eventsHint));
    ok('the tooltip page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await tp.close();
  }

  // -- the shell (docs/ui-redesign.md 5.2, 6.1, 6.4, 6.5, 6.8): the grid's sizes at 1920 x 1080 and 2560 x 1440, the four
  // splitters (drag, limits, remembered after a reload, double-click, the arrow keys, the preview and the Look following at
  // once), the status bar, the main menu, the ? key, the scale next to the View buttons, and typing a time in the
  // timeline's header. On a page of its own: the sizes the splitters remember would stay for the pages after it.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const sp = g.page;
    const help = await server.ssrLoadModule('/src/app/help.ts');
    const frames = () => sp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const grid = () => sp.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const slot = box('.timeline-slot'), list = box('.layers-list');
      const inside = (sel, r) => [...document.querySelectorAll(sel)].filter((x) => { const b = x.getBoundingClientRect(); return b.height > 0 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5; }).length;
      return { left: box('.left').width, right: box('.right').width, centre: box('.centre').width, effects: +(box('.effects-section').height / box('.left').height).toFixed(4),
        timeline: +(box('.timeline-pane').height / box('.centre').height).toFixed(4), tlRows: inside('.timeline .tl-row', slot), layerRows: inside('.layers-list .layer-item', list),
        top: box('.topbar').height, status: box('.statusbar').height, head: box('.transport').height, insHead: box('.inspector > .insp-head').height, width: box('#app').width };
    });
    await sp.evaluate(async () => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect('board_beam'); await a.showAt(1000, 7); });
    const g1920 = await grid();
    ok('at 1920 x 1080 the window\'s grid has its default sizes: left 248 px, right 296 px, the effects 40 % of the left column, the timeline 30 % of the centre; at least 8 track rows and 14 layer rows show without scrolling (Hammer leech beam, 16 layers)',
      g1920.left === 248 && g1920.right === 296 && near(g1920.effects, 0.4, 0.002) && near(g1920.timeline, 0.3, 0.002) && g1920.tlRows >= 8 && g1920.layerRows >= 14
        && g1920.top === 40 && g1920.status === 24 && g1920.head === 32 && g1920.insHead === 40, JSON.stringify(g1920));
    await sp.setViewportSize({ width: 2560, height: 1440 });
    await frames();
    const g2560 = await grid();
    ok('at 2560 x 1440: left 280 px, right 320 px, the effects 40 %, the timeline 34 %', g2560.left === 280 && g2560.right === 320 && near(g2560.effects, 0.4, 0.002) && near(g2560.timeline, 0.34, 0.002), JSON.stringify(g2560));
    await sp.setViewportSize({ width: 1920, height: 1080 });
    await frames();

    // The splitters: separators with a name, a size and its limits, and a tooltip that says what to do.
    const splitters = await sp.evaluate(() => [...document.querySelectorAll('.splitter')].map((s) => {
      const t = window.__vfx.app.tipForChecks(s);
      return { name: s.getAttribute('aria-label'), role: s.getAttribute('role'), orientation: s.getAttribute('aria-orientation'), tab: s.getAttribute('tabindex'),
        now: +s.getAttribute('aria-valuenow'), min: +s.getAttribute('aria-valuemin'), max: +s.getAttribute('aria-valuemax'), tip: t?.lines ?? [] };
    }));
    const byName = Object.fromEntries(splitters.map((x) => [x.name, x]));
    const wantSplit = { 'Resize the left sidebar': ['vertical', 248, 200, 420], 'Resize the right panel': ['vertical', 296, 260, 480], 'Resize the effects list': ['horizontal', 406, 120, 856], 'Resize the timeline': ['horizontal', 305, 140, 610] };
    ok('four splitters, each a focusable separator with its name, orientation, size and limits (aria-valuenow, -min, -max), and the tooltip "Drag to resize. Double-click to reset." with its help text',
      splitters.length === 4 && Object.entries(wantSplit).every(([name, [o, now, min, max]]) => {
        const x = byName[name];
        return x && x.role === 'separator' && x.orientation === o && x.tab === '0' && Math.abs(x.now - now) <= 1 && x.min === min && Math.abs(x.max - max) <= 1
          && x.tip[0] === 'Drag to resize. Double-click to reset.' && x.tip[1] === help.helpFor(name);
      }), JSON.stringify(splitters));
    const sizes = () => sp.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const stored = Object.fromEntries(['left', 'right', 'effects', 'timeline'].map((k) => [k, localStorage.getItem(`vfx-size:${k}`)]));
      return { left: Math.round(r('.left').width), right: Math.round(r('.right').width), effects: Math.round(r('.effects-section').height), timeline: Math.round(r('.timeline-pane').height),
        centre: Math.round(r('.centre').width), stored, time: window.__vfx.app.debugState().mainTime };
    });
    const centreOf = async (sel) => { const b = await sp.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const drag = async (sel, dx, dy, whileDown) => {
      const [x, y] = await centreOf(sel);
      await sp.mouse.move(x, y);
      await sp.mouse.down();
      await sp.mouse.move(x + dx, y + dy, { steps: 6 });
      const during = whileDown ? await whileDown() : null;
      await sp.mouse.up();
      return during;
    };
    // While the timeline's splitter is dragged, the preview follows at once: its canvas has the new size, and the scene is
    // drawn on it (not the empty ground a resized canvas shows until the next frame). The clock is stopped here, so only
    // the redraw for the new size can draw it.
    const before = await sizes();
    const mid = await drag('.split-timeline', 0, -80, async () => {
      await frames();
      const info = await sp.evaluate(() => {
        const v = document.querySelector('.viewport'), c = v.querySelector('canvas'), r = v.getBoundingClientRect(), f = document.querySelector('.frame-guide').getBoundingClientRect();
        return { cw: c.width, ch: c.height, vw: Math.floor(r.width), vh: Math.floor(r.height), frame: { x: Math.max(r.x, f.x), y: Math.max(r.y, f.y), r: Math.min(r.right, f.right), b: Math.min(r.bottom, f.bottom) },
          timeline: Math.round(document.querySelector('.timeline-pane').getBoundingClientRect().height), dragging: !!document.querySelector('.split-timeline.dragging') };
      });
      const png = PNG.sync.read(await sp.screenshot({ path: join(shots, 'shell-splitter-drag.png') }));
      // Inside the game frame, below its label: a drawn scene is ground and something else; an empty canvas only one of them.
      let n = 0, ground = 0, other = 0;
      for (let y = Math.ceil(info.frame.y) + 32; y < info.frame.b - 8; y += 6) for (let x = Math.ceil(info.frame.x) + 8; x < info.frame.r - 8; x += 6) { n++; const d = diff(hex(png, x, y), '#B8A683'); if (d <= 2) ground++; else if (d > 12) other++; }
      return { ...info, n, ground, other };
    });
    ok('while a splitter is dragged the preview follows at once: its canvas takes the new size and the scene is drawn on it, also with the clock stopped',
      mid.dragging && mid.timeline === before.timeline + 80 && mid.cw === mid.vw && mid.ch === mid.vh && mid.n > 500 && mid.ground > mid.n * 0.2 && mid.other > mid.n * 0.02, JSON.stringify(mid));
    const tl1 = await sizes();
    await drag('.split-left', 60, 0);
    const l1 = await sizes();
    await drag('.split-right', -100, 0);
    const r1 = await sizes();
    await drag('.split-effects', 0, 100);
    const e1 = await sizes();
    ok('dragging a splitter resizes its zone and remembers the size (vfx-size:left, right, effects, timeline)',
      tl1.timeline === before.timeline + 80 && tl1.stored.timeline === String(tl1.timeline) && l1.left === 308 && l1.stored.left === '308' && r1.right === 396 && r1.stored.right === '396'
        && e1.effects === before.effects + 100 && e1.stored.effects === String(e1.effects), JSON.stringify({ before, tl1, l1, r1, e1 }));
    // The limits: left 200 to 420 px, right 260 to 480 px, the effects 120 px to the column less 160 px, the timeline 140 px to
    // 60 % of the centre; the centre never under 640 px.
    await drag('.split-left', 600, 0); const lMax = await sizes();
    await drag('.split-left', -600, 0); const lMin = await sizes();
    await drag('.split-right', -600, 0); const rMax = await sizes();
    await drag('.split-right', 600, 0); const rMin = await sizes();
    await drag('.split-effects', 0, 900); const eMax = await sizes();
    // The Layers section is then 160 px tall: its list gives way, so its header with the + stays inside the column, and at
    // least one row shows, whose buttons show inside the column on hover.
    const layersBox = () => sp.evaluate(() => {
      const left = document.querySelector('.left').getBoundingClientRect(), list = document.querySelector('.layers-list').getBoundingClientRect();
      const head = document.querySelector('.layers-section .card-head').getBoundingClientRect(), add = document.querySelector('.layers-section .add-layer').getBoundingClientRect();
      const row = document.querySelector('.layers-list .layer-item'), rowBox = row.getBoundingClientRect();
      const tools = [...row.querySelectorAll('.item-tools button')].filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect());
      return { section: Math.round(document.querySelector('.layers-section').getBoundingClientRect().height), list: Math.round(list.height), head: Math.round(head.bottom), add: Math.round(add.bottom),
        addInside: add.left >= left.left && add.right <= left.right, column: Math.round(left.bottom), row: Math.round(rowBox.bottom), rowShown: rowBox.height >= 28 && rowBox.bottom <= list.bottom + 0.5,
        tools: tools.length, toolsLowest: tools.length ? Math.round(Math.max(...tools.map((r) => r.bottom))) : null, toolsInside: tools.every((r) => r.right <= left.right && r.bottom <= left.bottom) };
    });
    await sp.locator('.layers-list .layer-item').first().hover();
    const layersAtMax = await layersBox();
    await sp.mouse.move(900, 400);
    await drag('.split-effects', 0, -900); const eMin = await sizes();
    await drag('.split-timeline', 0, -900); const tMax = await sizes();
    await drag('.split-timeline', 0, 900); const tMin = await sizes();
    ok('the splitters stop at their limits: left 200 to 420 px, right 260 to 480 px, the effects 120 px to the column less 160 px, the timeline 140 px to 60 % of the centre',
      lMax.left === 420 && lMin.left === 200 && rMax.right === 480 && rMin.right === 260 && eMax.effects === 1016 - 160 && eMin.effects === 120 && tMax.timeline === 610 && tMin.timeline === 140,
      JSON.stringify({ left: [lMin.left, lMax.left], right: [rMin.right, rMax.right], effects: [eMin.effects, eMax.effects], timeline: [tMin.timeline, tMax.timeline] }));
    ok('with the effects list at its largest, the Layers section (160 px) keeps its header with the + inside the column, and its list at least one row, whose Move up, Move down and More show inside the column on hover',
      layersAtMax.section === 160 && layersAtMax.head <= layersAtMax.column && layersAtMax.add <= layersAtMax.column && layersAtMax.addInside && layersAtMax.list >= 28 && layersAtMax.rowShown
        && layersAtMax.tools === 3 && layersAtMax.toolsLowest <= layersAtMax.column && layersAtMax.toolsInside, JSON.stringify(layersAtMax));
    // The arrow keys move a focused splitter 16 px (they do not step the timeline), Home and End go to its limits.
    await sp.locator('.split-left').focus();
    await sp.keyboard.press('ArrowRight');
    const k1 = await sizes();
    await sp.keyboard.press('ArrowRight');
    await sp.keyboard.press('ArrowLeft');
    const k2 = await sizes();
    await sp.locator('.split-timeline').focus();
    await sp.keyboard.press('ArrowUp');
    const k3 = await sizes();
    await sp.keyboard.press('End');
    const k4 = await sizes();
    // The line's colour change takes 120 ms, but this software-drawing browser can hold its animation frames back while it
    // draws the preview again at the size End gave it (one run read the line 12 ms into its change, 200 ms after the key):
    // wait until the change is done, at most 5 s, then read it, with the splitter still focused from the keyboard.
    const lineNow = () => { const s = document.querySelector('.split-timeline'); const probe = document.createElement('span'); probe.style.color = 'var(--focus)'; document.body.append(probe); const want = getComputedStyle(probe).color; probe.remove(); return { line: getComputedStyle(s, '::before').backgroundColor, want, focused: s.matches(':focus-visible') }; };
    await sp.waitForFunction(`(({ line, want }) => line === want)((${lineNow})())`, null, { timeout: 5000, polling: 50 }).catch(() => {});
    const focusLine = await sp.evaluate(lineNow);
    ok('a focused splitter moves 16 px a press of the arrow keys (not the timeline\'s steps), End takes it to its limit, and its line shows the focus colour',
      k1.left === 216 && k2.left === 216 && k1.time === before.time && k2.time === before.time && k3.timeline === 156 && k4.timeline === 610 && k4.stored.timeline === '610' && focusLine.focused && focusLine.line === focusLine.want,
      JSON.stringify({ k1: k1.left, k2: k2.left, k3: k3.timeline, k4: k4.timeline, time: [before.time, k2.time], focusLine }));
    // The widest sidebars in a window that shrinks to 1280 px: the centre keeps 640 px, and they come back when it grows.
    await drag('.split-left', 600, 0);
    await drag('.split-right', -600, 0);
    const wide = await sizes();
    await sp.setViewportSize({ width: 1280, height: 800 });
    await frames();
    const narrow = await sizes();
    await sp.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    const back1920 = await sizes();
    ok('the centre is never narrower than 640 px: at 1280 px wide both sidebars give way, and they come back when the window grows',
      wide.left === 420 && wide.right === 480 && narrow.centre >= 640 && narrow.left + narrow.centre + narrow.right === 1280 && narrow.left >= 200 && narrow.right >= 260
        && back1920.left === 420 && back1920.right === 480 && back1920.stored.left === '420', JSON.stringify({ wide, narrow, back1920 }));
    // Remembered after a reload; a double-click forgets one and puts its default back.
    await sp.reload();
    await sp.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
    await sp.evaluate(async () => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect('board_beam'); await a.showAt(1000, 7); });
    const reloaded = await sizes();
    for (const sel of ['.split-left', '.split-right', '.split-effects', '.split-timeline']) await sp.locator(sel).dblclick();
    const reset = await sizes();
    ok('the sizes are remembered after a reload; a double-click on a splitter forgets its size and puts the default back',
      reloaded.left === 420 && reloaded.right === 480 && reloaded.timeline === 610 && reloaded.effects === 120
        && reset.left === 248 && reset.right === 296 && reset.effects === before.effects && reset.timeline === before.timeline && Object.values(reset.stored).every((v) => v === null),
      JSON.stringify({ reloaded, reset }));
    // The Look follows the right splitter at once too: its canvas takes the panel's new width.
    await sp.evaluate(async () => { const a = window.__vfx.app; a.selectLayer('emitter_glow'); await a.showAt(1000, 7); });
    const look = await drag('.split-right', -80, 0, async () => { await frames(); return sp.evaluate(() => { const b = document.querySelector('.inspector .look-box'), c = b?.querySelector('canvas'); return { box: b?.clientWidth, canvas: c?.width, panel: Math.round(document.querySelector('.right').getBoundingClientRect().width) }; }); });
    await sp.locator('.split-right').dblclick();
    ok('the Look follows the right splitter at once: its picture takes the panel\'s new width while it is dragged', look.panel === 376 && look.canvas === look.box && look.box > 300, JSON.stringify(look));

    // The status bar: the checks, this frame's triangles and draw calls, the cost, the renderer; never the class "status".
    // Read after the colours' 120 ms change.
    const bar = async () => { await sp.waitForTimeout(200); return sp.evaluate(() => {
      const a = window.__vfx.app, s = a.previewForChecks.vfx.stats, b = document.querySelector('.statusbar');
      const colour = (v) => { const p = document.createElement('span'); p.style.color = `var(${v})`; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; };
      const checks = b.querySelector('.sb-checks'), cost = b.querySelector('.sb-cost');
      return { cls: b.className, h: b.getBoundingClientRect().height, font: getComputedStyle(b).fontSize, checks: checks.textContent, checksIcon: checks.querySelector('svg')?.getAttribute('class'), checksColour: getComputedStyle(checks).color,
        good: colour('--good'), bad: colour('--bad'), warn: colour('--warn'), muted: colour('--text-muted'),
        tris: b.querySelector('.sb-tris').textContent, draws: b.querySelector('.sb-draws').textContent, want: `${s.triangles} triangle${s.triangles === 1 ? '' : 's'}|${s.drawCalls} draw call${s.drawCalls === 1 ? '' : 's'}`,
        cost: cost.textContent, costColour: getComputedStyle(cost).color, renderer: b.querySelector('.sb-renderer').textContent, rendererTip: a.tipForChecks(b.querySelector('.sb-renderer'))?.lines[0] ?? null,
        keys: b.querySelector('button[aria-label="Keyboard shortcuts"]') ? a.tipForChecks(b.querySelector('button[aria-label="Keyboard shortcuts"]')) : null, problems: a.problems().length };
    }); };
    await sp.evaluate(async () => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); await a.showAt(20, 7); });
    const sb1 = await bar();
    ok('the status bar (24 px, 11 px text) shows the checks ("All good", its check in --good), this frame\'s triangles and draw calls, the cost and the renderer (WebGL 2, with its tooltip), and ? for the keyboard shortcuts',
      !sb1.cls.split(' ').includes('status') && sb1.h === 24 && sb1.font === '11px' && sb1.checks === 'All good' && sb1.checksIcon === 'icon icon-check' && sb1.checksColour === sb1.good
        && `${sb1.tris}|${sb1.draws}` === sb1.want && sb1.cost === 'Cost: not measured' && sb1.costColour === sb1.muted && sb1.renderer === 'WebGL 2'
        && sb1.rendererTip === 'Drawing with the WebGL 2 fallback of the WebGPU renderer.' && sb1.keys?.lines[0] === 'Keyboard shortcuts' && sb1.keys?.key === '?', JSON.stringify(sb1));
    // A problem: "1 problem" in --bad, with the warning icon. Since UI phase 6 a click opens the problems banner's list in the
    // view shown (the layer stays selected), right under the header, the focus on the banner; before, it showed the effect's
    // view at its Checks section, which is gone.
    await sp.evaluate(async () => { const a = window.__vfx.app; a.selectLayer('flash'); a.editLayer(['image'], 'no_such.png'); a.commit(); await a.showAt(20, 7); });
    const sb2 = await bar();
    await sp.locator('.statusbar .sb-checks').click();
    const checksShown = await sp.waitForFunction(() => {
      const c = document.querySelector('.inspector .problems-banner'), r = document.querySelector('.right').getBoundingClientRect(), h = document.querySelector('.inspector > .insp-head')?.getBoundingClientRect();
      const b = c?.getBoundingClientRect(), head = c?.querySelector('.banner-head');
      return b && h && b.top >= h.bottom - 1 && b.top < r.bottom - 20 && head?.getAttribute('aria-expanded') === 'true'
        ? { layer: window.__vfx.app.layer()?.id ?? null, top: Math.round(b.top - r.top), focus: document.activeElement === head, title: c.querySelector('.banner-count').textContent } : null;
    }, null, { timeout: 5000 }).then((x) => x.jsonValue(), () => null);
    await sp.keyboard.press('Control+z');
    await sp.evaluate(async () => { await window.__vfx.app.showAt(20, 7); });
    const sb3 = await bar();
    const nProblems = `${sb2.problems} problem${sb2.problems === 1 ? '' : 's'}`;
    ok('with a problem the status bar says how many ("1 problem") in --bad with the warning icon, as the problems banner does; a click opens the banner\'s list right under the header, the focus on it, the layer still selected',
      sb2.problems >= 1 && sb2.checks === nProblems && sb2.checksIcon === 'icon icon-warning' && sb2.checksColour === sb2.bad && !!checksShown && checksShown.layer === 'flash' && checksShown.focus && checksShown.title === nProblems && sb3.checks === 'All good',
      JSON.stringify({ sb2: [sb2.checks, sb2.checksIcon], checksShown, after: sb3.checks }));
    // The triangles: a click shows the effect's view at Cost, opened (since UI phase 6 it is a section that folds, closed at
    // first), the focus on Measure (its header's button, since then not the section's first button).
    await sp.evaluate(() => window.__vfx.app.selectLayer('hit'));
    const costClosed = await sp.evaluate(() => { const a = window.__vfx.app; a.selectLayer(null); const d = document.querySelector('.inspector .costcard > details'); a.selectLayer('hit'); return d ? !d.open : null; });
    await sp.locator('.statusbar .sb-stats').click();
    const costShown = await sp.waitForFunction(() => {
      const c = document.querySelector('.inspector .costcard'), r = document.querySelector('.right').getBoundingClientRect(), b = c?.getBoundingClientRect();
      return b && b.top >= r.top && b.top < r.bottom - 20
        ? { layer: window.__vfx.app.layer()?.id ?? null, focus: document.activeElement === c.querySelector('.cost-measure'), open: !!c.querySelector(':scope > details')?.open } : null;
    }, null, { timeout: 5000 }).then((x) => x.jsonValue(), () => null);
    ok('a click on the triangles and draw calls shows the effect\'s settings (no layer selected) at Cost, which opens, the focus on Measure', costClosed === true && !!costShown && costShown.layer === null && costShown.focus && costShown.open,
      JSON.stringify({ costClosed, costShown }));
    // The cost, from the card's own state: measured with no budget on, over budget (--bad), out of date (--warn).
    await sp.evaluate(() => window.__vfx.app.measureForChecks());
    const c1 = await bar();
    await sp.evaluate(() => window.__vfx.app.setBudget('high', 'draws', 0));
    const c2 = await bar();
    const c2tip = await sp.evaluate(() => window.__vfx.app.tipForChecks(document.querySelector('.statusbar .sb-cost')));
    await sp.evaluate(async () => { const a = window.__vfx.app; a.editEffect(['controls', 'size'], 1.5, { label: 'Size' }); a.commit(); await a.showAt(20, 7); });
    const c3 = await bar();
    await sp.keyboard.press('Control+z');
    await sp.evaluate(() => window.__vfx.app.setBudget('high', 'draws', 40));
    const c4 = await bar();
    await sp.evaluate(() => window.__vfx.app.setBudget('high', 'draws', undefined));
    ok('the status bar\'s cost follows the cost card: "Measured, no budgets", "1 over budget" in --bad (which one in its tooltip), "Out of date" in --warn after a change, "Within budget" in --good',
      c1.cost === 'Measured, no budgets' && c2.cost === '1 over budget' && c2.costColour === c2.bad && c2tip?.lines[0] === 'Over budget: Draws in High.' && c3.cost === 'Out of date' && c3.costColour === c3.warn
        && c4.cost === 'Within budget' && c4.costColour === c4.good, JSON.stringify([c1.cost, c2.cost, c2tip?.lines[0], c3.cost, c4.cost]));
    // The hint: over the preview, the drag hint; elsewhere, nothing. A message (the toast) shows above the status bar.
    const vp = await sp.locator('.viewport').boundingBox();
    await sp.mouse.move(vp.x + vp.width / 2, vp.y + 40);
    const hintOver = await sp.locator('.statusbar .sb-hint').textContent();
    await sp.mouse.move(vp.x + vp.width + 80, vp.y + 200);
    const hintAway = await sp.locator('.statusbar .sb-hint').textContent();
    await sp.evaluate(async () => { const a = window.__vfx.app; a.editEffect(['controls', 'size'], 1.5, { label: 'Size' }); a.commit(); });
    await sp.keyboard.press('Control+z');
    const toast = await sp.evaluate(() => ({ shown: document.querySelector('.status').classList.contains('show'), bottom: document.querySelector('.status').getBoundingClientRect().bottom, bar: document.querySelector('.statusbar').getBoundingClientRect().top }));
    ok('the status bar\'s middle shows the drag hint while the pointer is over the preview, and nothing elsewhere; a message shows above the status bar',
      hintOver === 'Drag the ground to move the target. Shift + drag moves the stand-in.' && hintAway === '' && toast.shown && toast.bottom <= toast.bar, JSON.stringify({ hintOver, hintAway, toast }));

    // The main menu: opens below the logo with the focus on its first row; the arrows, Home and End move; Esc closes it and
    // gives the focus back to the logo; a second click closes it, and so does a click outside it.
    const menuState = () => sp.evaluate(() => {
      const m = document.querySelector('#main-menu'), logo = document.querySelector('.topbar .logo'), r = m.getBoundingClientRect(), l = logo.getBoundingClientRect();
      return { open: m.matches(':popover-open'), role: m.getAttribute('role'), parent: m.parentElement === document.body, expanded: logo.getAttribute('aria-expanded'), focus: document.activeElement?.dataset.helpLabel ?? document.activeElement?.className ?? null,
        rows: [...m.querySelectorAll('.menu-item, .menu-divider')].map((x) => x.matches('.menu-divider') ? '—' : `${x.getAttribute('role')}:${x.querySelector('.menu-label').textContent}${x.querySelector('.menu-key') ? `(${x.querySelector('.menu-key').textContent})` : ''}${x.hasAttribute('aria-checked') ? `=${x.getAttribute('aria-checked')}` : ''}`),
        below: Math.round(r.top - l.bottom), left: Math.round(r.left - l.left), inside: r.right <= innerWidth && r.bottom <= innerHeight, rowH: Math.round(m.querySelector('.menu-item').getBoundingClientRect().height) };
    });
    await sp.locator('.topbar .logo').click();
    await sp.waitForFunction(() => document.activeElement?.closest('.menu'), null, { timeout: 5000 }).catch(() => {});
    const m1 = await menuState();
    await sp.keyboard.press('ArrowDown'); const fDown = (await menuState()).focus;
    await sp.keyboard.press('End'); const fEnd = (await menuState()).focus;
    await sp.keyboard.press('ArrowDown'); const fWrap = (await menuState()).focus;
    await sp.keyboard.press('ArrowUp'); await sp.keyboard.press('Home'); const fHome = (await menuState()).focus;
    const tBefore = (await sp.evaluate(() => window.__vfx.app.debugState().mainTime));
    await sp.keyboard.press('Escape');
    const m2 = await menuState();
    const tAfter = (await sp.evaluate(() => window.__vfx.app.debugState().mainTime));
    ok('the main menu opens below the logo, on body, with the focus on its first row: Projects…, New project…, Save (Ctrl+S), Save as…, Export…, Import an export…, a line, Show hints and Night mode (checks), Keyboard shortcuts (?)',
      m1.open && m1.role === 'menu' && m1.parent && m1.expanded === 'true' && m1.focus === 'Projects…' && m1.below >= 0 && m1.below <= 8 && m1.left === 0 && m1.inside && m1.rowH === 28
        && m1.rows.join(' | ') === 'menuitem:Projects… | menuitem:New project… | menuitem:Save(Ctrl+S) | menuitem:Save as… | menuitem:Export… | menuitem:Import an export… | — | menuitemcheckbox:Show hints=true | menuitemcheckbox:Night mode=false | menuitem:Keyboard shortcuts(?)',
      JSON.stringify(m1));
    ok('in the main menu ↑ and ↓ move between the rows (round from the last to the first), Home and End go to the ends; Esc closes it and gives the focus back to the logo, and the keys stay the menu\'s',
      fDown === 'New project…' && fEnd === 'Keyboard shortcuts' && fWrap === 'Projects…' && fHome === 'Projects…' && !m2.open && m2.expanded === 'false' && m2.focus === 'Main menu' && tAfter === tBefore,
      JSON.stringify({ fDown, fEnd, fWrap, fHome, after: m2, time: [tBefore, tAfter] }));
    await sp.locator('.topbar .logo').click();
    const m3 = (await menuState()).open;
    await sp.locator('.topbar .logo').click();
    const m4 = (await menuState()).open;
    await sp.locator('.topbar .logo').click();
    const m5 = (await menuState()).open;
    const hintBox = await sp.locator('.statusbar .sb-hint').boundingBox();
    await sp.mouse.click(hintBox.x + hintBox.width / 2, hintBox.y + hintBox.height / 2);
    const m6 = (await menuState()).open;
    ok('a second click on the logo closes the main menu, and so does a click outside it', m3 && !m4 && m5 && !m6, JSON.stringify({ m3, m4, m5, m6 }));
    // Tab closes it too: the focus goes back to the logo, whose tooltip Tab shows at once, and nothing throws. (The menu hid
    // with the focus still in it, so the browser gave the focus back in the middle of hiding, where the tooltip could not
    // open: "Invalid to show a popover during another show operation".)
    const errorsBeforeTab = g.errors.length;
    await sp.locator('.topbar .logo').click();
    await sp.waitForFunction(() => document.activeElement?.closest('.menu'), null, { timeout: 5000 }).catch(() => {});
    const inMenu = (await menuState()).focus;
    await sp.keyboard.press('Tab');
    await sp.waitForTimeout(150);
    const mTab = await menuState();
    const tabTip = await sp.evaluate(() => (document.querySelector('.tooltip')?.matches(':popover-open') ? document.querySelector('.tooltip .tip-first > span')?.textContent ?? null : null));
    ok('Tab in the main menu closes it and gives the focus back to the logo, with the logo\'s tooltip, and no error',
      inMenu === 'Projects…' && !mTab.open && mTab.expanded === 'false' && mTab.focus === 'Main menu' && tabTip === 'Main menu' && g.errors.length === errorsBeforeTab,
      JSON.stringify({ inMenu, after: { open: mTab.open, focus: mTab.focus }, tabTip, errors: g.errors.slice(errorsBeforeTab, errorsBeforeTab + 2) }));
    await sp.keyboard.press('Escape');
    // Its rows work: each opens what it names, and nothing is written (the dialogs are cancelled).
    const chooseRow = async (name) => { await sp.locator('.topbar .logo').click(); await sp.getByRole('menuitem', { name, exact: true }).or(sp.getByRole('menuitemcheckbox', { name, exact: true })).click(); };
    const dialogTitle = () => sp.waitForFunction(() => document.querySelector('dialog[open] h2')?.textContent ?? null, null, { timeout: 15000 }).then((x) => x.jsonValue(), () => null);
    const closeDialog = () => sp.evaluate(() => document.querySelector('dialog[open]')?.close());
    await chooseRow('Keyboard shortcuts');
    const keysTitle = await dialogTitle();
    const keysRows = await sp.evaluate(() => [...document.querySelectorAll('dialog[open] .keys tr')].map((r) => r.querySelector('kbd').textContent));
    await closeDialog();
    await chooseRow('Projects…');
    const projTitle = await dialogTitle();
    await closeDialog();
    await chooseRow('Import an export…');
    const importTitle = await dialogTitle();
    const importShown = await sp.evaluate(() => { const h = [...document.querySelectorAll('dialog[open] h3')].find((x) => x.textContent === 'Import an export'); const r = h?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight; });
    await closeDialog();
    await chooseRow('New project…');
    const newTitle = await dialogTitle();
    await sp.locator('dialog[open] >> text=Cancel').click();
    await chooseRow('Save as…');
    const saveAsTitle = await dialogTitle();
    await sp.locator('dialog[open] >> text=Cancel').click();
    // On an example, Save asks for a copy (Save as); Export… with changes asks first, and Cancel writes nothing.
    await chooseRow('Save');
    const saveTitle = await dialogTitle();
    await sp.locator('dialog[open] >> text=Cancel').click();
    await sp.evaluate(() => { const a = window.__vfx.app; a.editEffect(['controls', 'size'], 1.5, { label: 'Size' }); a.commit(); });
    await chooseRow('Export…');
    const exportTitle = await dialogTitle();
    await sp.locator('dialog[open] button[data-answer="cancel"]').click();
    await sp.keyboard.press('Control+z');
    await chooseRow('Night mode');
    const nightOn = await sp.evaluate(() => ({ theme: document.documentElement.dataset.theme, pressed: document.querySelector('.theme-toggle').getAttribute('aria-pressed'), stored: localStorage.getItem('vfx-theme') }));
    await sp.locator('.topbar .logo').click();
    const checkedRow = await sp.evaluate(() => [...document.querySelectorAll('#main-menu .menu-item[role="menuitemcheckbox"]')].find((b) => b.querySelector('.menu-label').textContent === 'Night mode').getAttribute('aria-checked'));
    await sp.getByRole('menuitemcheckbox', { name: 'Night mode', exact: true }).click();
    const nightOff = await sp.evaluate(() => document.documentElement.dataset.theme);
    ok('the main menu\'s rows work: Keyboard shortcuts, Projects… and Import an export… (Projects, at its exports) open their dialogs, New project… and Save as… ask for a name, Save on an example asks for a copy, Export… asks about unsaved changes, Night mode is a check',
      keysTitle === 'Keyboard shortcuts' && keysRows.includes('?') && keysRows.includes('Drag the ground') && keysRows.includes('Shift + drag') && projTitle === 'Projects' && importTitle === 'Projects' && importShown
        && newTitle === 'New project' && saveAsTitle === 'Save as' && saveTitle === 'Save as' && exportTitle === 'Export' && nightOn.theme === 'dark' && nightOn.pressed === 'true' && nightOn.stored === 'dark'
        && checkedRow === 'true' && nightOff === 'light', JSON.stringify({ keysTitle, keysRows, projTitle, importTitle, importShown, newTitle, saveAsTitle, saveTitle, exportTitle, nightOn, checkedRow, nightOff }));
    ok('the Keyboard shortcuts dialog lists the keys of the lists: F2, Ctrl+D, Ctrl+] / Ctrl+[ and /, and Esc still', ['F2', 'Ctrl+D', 'Ctrl+] / Ctrl+[', '/', 'Esc', 'Delete'].every((k) => keysRows.includes(k)),
      JSON.stringify(keysRows));
    // The ? key opens the keyboard shortcuts (the focus is on the logo now, as the menu left it), but not while typing in a
    // field (the time readout's box, below).
    await sp.keyboard.press('?');
    const qTitle = await dialogTitle();
    await closeDialog();

    // The time readout: "89 / 299 ms" and "step 1" (its tooltip: the comic step rate). A click on the time makes it a box:
    // Enter goes to the typed time, paused; Esc leaves it; a time past the end stops at the end. While firing: how many play.
    await sp.evaluate(async () => { const a = window.__vfx.app; a.pickEffect('shell_flight'); await a.showAt(250, 7); });
    const readout = () => sp.evaluate(() => {
      const t = document.querySelector('.transport .time'), box = t.querySelector('.time-input');
      return { text: [...t.children].filter((x) => !x.hidden).map((x) => x.textContent).join(''), box: !box.hidden, focus: document.activeElement?.className ?? null, time: window.__vfx.app.debugState().mainTime, playing: window.__vfx.app.debugState().playing,
        step: window.__vfx.app.tipForChecks(t.querySelector('.time-step'))?.lines[0] ?? null, stepColour: getComputedStyle(t.querySelector('.time-step')).color, muted: (() => { const p = document.createElement('span'); p.style.color = 'var(--text-muted)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })() };
    });
    const r0 = await readout();
    await sp.locator('.transport .time-now').click();
    const r1b = await readout();
    await sp.keyboard.press('?');
    const typedQ = await sp.evaluate(() => ({ dialog: !!document.querySelector('dialog[open]'), value: document.querySelector('.time-input').value }));
    await sp.locator('.transport .time-input').fill('120');
    await sp.keyboard.press('Enter');
    const r2 = await readout();
    await sp.locator('.transport .time-now').click();
    await sp.locator('.transport .time-input').fill('50');
    await sp.keyboard.press('Escape');
    const r3 = await readout();
    await sp.locator('.transport .time-now').click();
    await sp.locator('.transport .time-input').fill('99999');
    await sp.keyboard.press('Enter');
    const r4 = await readout();
    const len = await sp.evaluate(() => window.__vfx.app.timeline().lengthMs);
    await sp.evaluate(async () => { const a = window.__vfx.app; a.fire(); await a.tickForChecks(40); });
    const r5 = await readout();
    await sp.evaluate(async () => { await window.__vfx.app.showAt(0, 7); });
    ok('the ? key opens the keyboard shortcuts, but not while typing in a field', qTitle === 'Keyboard shortcuts' && !typedQ.dialog && typedQ.value.endsWith('?'), JSON.stringify({ qTitle, typedQ }));
    ok('the time readout says "250 / … ms" and "step 3" (muted, its tooltip the comic step rate); a click on the time types one: Enter goes there, paused, Esc leaves it, a time past the end stops at the end; while firing it says how many play',
      r0.text === `250 / ${Math.round(len)} msstep 3` && r0.step === 'Steps of 1/12 s, the comic step rate' && r0.stepColour === r0.muted && r1b.box && r1b.focus?.includes('time-input')
        && r2.time === 120 && !r2.playing && !r2.box && r2.text.startsWith('120 / ') && r2.focus === 'time-now' && r3.time === 120 && !r3.box && r4.time === len && r5.text === 'Firing: 1 playing',
      JSON.stringify({ r0, r1b: [r1b.box, r1b.focus], r2: [r2.text, r2.time, r2.playing, r2.focus], r3: [r3.time, r3.box], r4: r4.time, len, r5: r5.text }));
    // With the keyboard focus on the time (Tab from the speed buttons), its focus ring ends before the slash of " / … ms"
    // (it crossed it), and the text keeps its spacing: the slash is no further from the time's last digit than one space and
    // the box's 1 px edge (3.8 px; a first fix made it 7.8). An inset shadow reaches no further than the box.
    await sp.evaluate(async () => { await window.__vfx.app.showAt(250, 7); });
    await sp.locator('.transport [aria-label="Speed"] button').last().focus();
    await sp.keyboard.press('Tab');
    const ring = await sp.evaluate(() => {
      const b = document.activeElement, t = document.querySelector('.transport .time-len').firstChild;
      const g = getComputedStyle(b), r = b.getBoundingClientRect();
      const spread = Math.max(0, ...g.boxShadow.split(/,(?![^(]*\))/).filter((x) => !x.includes('inset')).map((x) => +(x.match(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/)?.[4] ?? 0)));
      const out = Math.max(0, parseFloat(g.outlineWidth) + parseFloat(g.outlineOffset), spread);
      const slash = document.createRange(), i = t.textContent.indexOf('/');
      slash.setStart(t, i);
      slash.setEnd(t, i + 1);
      const digits = document.createRange();
      digits.selectNodeContents(b);
      const space = document.createRange();
      space.setStart(t, 0);
      space.setEnd(t, 1);
      return { focus: b.className, visible: b.matches(':focus-visible') && g.outlineStyle === 'solid', ringRight: +(r.right + out).toFixed(2), slash: +slash.getBoundingClientRect().left.toFixed(2),
        gap: +(slash.getBoundingClientRect().left - digits.getBoundingClientRect().right).toFixed(2), space: +space.getBoundingClientRect().width.toFixed(2) };
    });
    await sp.evaluate(async () => { await window.__vfx.app.showAt(0, 7); });
    ok('the time\'s focus ring, from the keyboard, ends before the slash of " / … ms", and the text keeps its spacing',
      ring.focus === 'time-now' && ring.visible && ring.ringRight <= ring.slash && ring.gap <= ring.space + 1.5, JSON.stringify(ring));

    // The scale, in the View chip after the view's name: muted, with its tooltip; it follows the view and the preview's size.
    const scaleNow = () => sp.evaluate(() => {
      const s = document.querySelector('.vbar .view-chip .scale-text');
      return { text: s?.textContent, in: s?.closest('.chip-btn')?.getAttribute('data-help-label') ?? null, after: s?.previousElementSibling?.textContent ?? null, tip: s ? window.__vfx.app.tipForChecks(s)?.lines[0] : null,
        want: `${Math.round(window.__vfx.app.previewForChecks.scale * 100)} %`, colour: s ? getComputedStyle(s).color : null, others: document.querySelectorAll('.scale-text').length };
    });
    const s1 = await scaleNow();
    await drag('.split-timeline', 0, -120);
    await frames();
    const s2 = await scaleNow();
    await sp.locator('.split-timeline').dblclick();
    await chooseInMenu(sp, '.vbar .view-chip', 'Game size');
    const s3 = await scaleNow();
    await chooseInMenu(sp, '.vbar .view-chip', 'Close-up');
    const s4 = await scaleNow();
    await chooseInMenu(sp, '.vbar .view-chip', 'Whole screen');
    ok('the scale shows in the View chip, after the view\'s name ("59 %", muted, with its tooltip), and follows the preview\'s size and the view (Game size 100 %, Close-up 200 %)',
      s1.in === 'View' && s1.after === 'Whole screen' && s1.others === 1 && s1.text === s1.want && s1.tip === `The preview shows the game screen at ${s1.text} of its size.` && s1.colour === sb1.muted
        && s2.text === s2.want && s2.text !== s1.text && s3.text === '100 %' && s3.after === 'Game size' && s4.text === '200 %' && s4.after === 'Close-up' && !(await sp.locator('.scale-label').count()),
      JSON.stringify({ s1, s2: s2.text, s3: [s3.text, s3.after], s4: [s4.text, s4.after] }));
    ok('the shell page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await sp.close();
  }

  // -- the viewport toolbar (docs/ui-redesign.md 6.3, 6.10, 6.9): one 36 px row at 1920 and 2560 with the default sizes and
  // its widest values; Fire's and each chip's tooltip; each chip's menu by mouse and by keyboard (below the chip, the focus on
  // the chosen row; the arrows, Home and End, type-ahead, Enter choosing what the old control chose, Esc giving the focus
  // back); the editor's keys waiting while a menu is open (L in the Tier menu goes to Low, and Loop stays); the View menu's
  // 1, 2 and 3; F firing from a closed chip; Distance: its drag (0.1 m per 4 px, Shift ten times that), its popover (the
  // slider's arrow keys as before, a typed "0,5"); a menu opened at a point staying inside the window; tooltips at once on
  // keyboard focus, a number box and a select too, and none after a click into a number box.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const tp = g.page;
    const help = await server.ssrLoadModule('/src/app/help.ts');
    const frames = () => tp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const state = () => tp.evaluate(() => {
      const a = window.__vfx.app, pv = a.previewForChecks, d = a.debugState();
      return { scene: pv.scene.id, faction: a.faction, previewFaction: pv.faction, relation: pv.relation, tier: a.previewTier(), drawTier: pv.vfx.tier, view: pv.view, closeOn: pv.closeOn,
        distance: +pv.viewerDistanceM.toFixed(2), time: d.mainTime, playing: d.playing, fired: d.playingCount, loop: document.querySelector('.transport .tb[aria-pressed]').getAttribute('aria-pressed') };
    });
    const chipText = (sel) => tp.locator(`.vbar ${sel} .chip-value`).textContent();
    /** A chip's menu (or popover) as it is now, and where the focus is. */
    const menuOf = (chipSel) => tp.evaluate((sel) => {
      const c = document.querySelector(`.vbar ${sel}`), m = document.getElementById(c.getAttribute('aria-controls'));
      const r = m.getBoundingClientRect(), cr = c.getBoundingClientRect(), f = document.activeElement;
      return { open: m.matches(':popover-open'), expanded: c.getAttribute('aria-expanded'), haspopup: c.getAttribute('aria-haspopup'), role: m.getAttribute('role'), parent: m.parentElement === document.body,
        below: Math.round(r.top - cr.bottom), aligned: Math.round(r.left) === Math.round(cr.left) || Math.round(r.right) === Math.round(cr.right), inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        title: m.querySelector('.menu-title, .pop-title')?.textContent ?? null, foot: m.querySelector('.menu-foot')?.textContent ?? null,
        focus: f?.closest?.('.menu') === m ? f.querySelector('.menu-label').textContent : f === c ? 'the chip' : f?.getAttribute('aria-label') ?? f?.tagName ?? null,
        chosen: [...m.querySelectorAll('.menu-item[aria-checked="true"]')].map((b) => b.querySelector('.menu-label').textContent), rowH: Math.round(m.querySelector('.menu-item')?.getBoundingClientRect().height ?? 0) };
    }, chipSel);
    const press = async (...keys) => { for (const k of keys) await tp.keyboard.press(k); };
    const focusChip = (sel) => tp.locator(`.vbar ${sel}`).focus();
    await tp.evaluate(async () => { const a = window.__vfx.app; window.__vfxManual = true; await a.setupForChecks({ effect: 'rifle_shot', scene: 'board-beam', relation: 'team', distance: 14, tier: 'medium' }); await a.showAt(100, 7); document.querySelector('.status')?.classList.remove('show'); });
    await tp.locator('.vbar .fire').focus();
    await press('3');

    // One row, 36 px, with long values: the longest scene name, Your team, 14.0 m, Medium, Close-up at 200 % (Whole screen
    // is 17 px wider and fits by far at these sizes; README gives the narrowest one-row window for each view). In a
    // window too narrow for it (1280 px), a second row, the controls in the same order, nothing outside the bar.
    const oneRow = () => tp.evaluate(() => {
      // The controls: the bar's own, then Fade other layers and View from the group that keeps them side by side.
      const b = document.querySelector('.vbar'), r = b.getBoundingClientRect(), items = [...b.children].flatMap((c) => c.matches('.vbar-end') ? [...c.children] : [c]);
      const kids = items.map((c) => c.getBoundingClientRect()), mid = (k) => Math.round(k.top + k.height / 2);
      const [fade, view] = ['.fade-toggle', '.view-chip'].map((q) => b.querySelector(`.vbar-end > ${q}`)?.getBoundingClientRect());
      return { h: Math.round(r.height), rows: new Set(kids.map(mid)).size, inside: kids.every((k) => k.left >= r.left - 0.5 && k.right <= r.right + 0.5 && k.bottom <= r.bottom + 0.5),
        together: !!fade && !!view && mid(fade) === mid(view) && view.left > fade.right,
        order: items.map((c) => c.getAttribute('data-help-label') ?? c.getAttribute('aria-label') ?? c.textContent.trim()).join(), values: [...b.querySelectorAll('.chip-value')].map((v) => v.textContent).join(' | ') };
    });
    const row1920 = await oneRow();
    await tp.setViewportSize({ width: 2560, height: 1440 });
    await frames();
    const row2560 = await oneRow();
    await tp.setViewportSize({ width: 1280, height: 800 });
    await frames();
    const row1280 = await oneRow();
    await tp.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    const ORDER = 'Fire,Scene,Faction that fired,Made by,Distance from you,Tier,Fade other layers,View';
    ok('the toolbar is one 36 px row at 1920 x 1080 and at 2560 x 1440 with the default sizes and long values: Fire, Scene, Faction that fired, Made by, Distance from you, Tier, then Fade other layers and View; at 1280 px it wraps onto a second row, in the same order, with Fade other layers and View side by side',
      row1920.h === 36 && row1920.rows === 1 && row1920.inside && row1920.order === ORDER && row1920.values === 'Board: beam between tanks | Soviets | Your team | 14.0 m | Medium | Close-up'
        && row2560.h === 36 && row2560.rows === 1 && row2560.inside && row1280.rows === 2 && row1280.inside && row1280.order === ORDER && row1280.together, JSON.stringify({ row1920, row2560, row1280 }));

    // Fire's tooltip, as the brief words it, with F; each chip's: its old label, then that label's help text.
    const tips = await tp.evaluate(() => {
      const a = window.__vfx.app;
      const out = { fire: a.tipForChecks(document.querySelector('.vbar .fire')) };
      for (const c of document.querySelectorAll('.vbar .chip-btn')) out[c.getAttribute('data-help-label')] = a.tipForChecks(c);
      return out;
    });
    const chipTipsOk = ['Scene', 'Faction that fired', 'Made by', 'Distance from you', 'Tier', 'View'].every((l) => tips[l]?.lines[0] === l && tips[l]?.lines[1] === help.helpFor(l, { section: 'Preview bar' }));
    ok('Fire\'s tooltip is "Fire from the stand-in to the target, as the game does" with F; each chip\'s tooltip is its old label and that label\'s help text (View with 1, 2, 3)',
      tips.fire?.lines[0] === 'Fire from the stand-in to the target, as the game does' && tips.fire?.key === 'F' && chipTipsOk && tips.View?.key === '1, 2, 3', JSON.stringify(tips));

    // Each chip's menu by mouse: below the chip, on body, the header naming the setting, the focus on the chosen row; a row
    // chosen does what the old control did, and the chip shows it.
    await tp.evaluate(async () => { const a = window.__vfx.app; await a.setupForChecks({ effect: 'rifle_shot', scene: 'street', faction: 'soviets', relation: 'enemy', distance: 4, tier: 'high' }); });
    await tp.locator('.vbar .fire').focus();
    await press('1');
    const mouse = {};
    for (const [sel, row] of [['.scene-chip', 'Board: fire pit'], ['.faction-chip', 'Allies'], ['.relation-chip', 'Your team'], ['.tier-chip', 'Medium'], ['.view-chip', 'Game size']]) {
      await tp.click(`.vbar ${sel}`);
      await tp.waitForFunction((s) => document.activeElement?.closest('.menu') && document.querySelector(`.vbar ${s}`).getAttribute('aria-expanded') === 'true', sel, { timeout: 5000 }).catch(() => {});
      const opened = await menuOf(sel);
      await tp.locator(`#${await tp.locator(`.vbar ${sel}`).getAttribute('aria-controls')} .menu-item`, { has: tp.locator('.menu-label', { hasText: new RegExp(`^${row}$`) }) }).click();
      mouse[sel] = { opened, after: await menuOf(sel), value: await chipText(sel), state: await state() };
    }
    await chooseInMenu(tp, '.vbar .view-chip', 'Muzzle');
    const muzzle = await state();
    // The scene is remembered for the effect: another effect, then back.
    const remembered = await tp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('shell_flight'); const other = a.previewForChecks.scene.id; a.pickEffect('rifle_shot'); return { other, back: a.previewForChecks.scene.id, chip: document.querySelector('.vbar .scene-chip .chip-value').textContent }; });
    const wantOpened = (m, title, chosen) => m.open && m.expanded === 'true' && m.haspopup === 'menu' && m.role === 'menu' && m.parent && m.below >= 0 && m.below <= 8 && m.aligned && m.inside && m.title === title && m.focus === chosen && m.rowH === 28;
    ok('each chip\'s menu opens by mouse below its chip (on body, with a header naming the setting, the focus on the chosen row), and a row chosen does what the old control did: the scene (remembered for the effect), the faction, made by, the tier, the view and the close-up\'s centre; the chip shows it',
      wantOpened(mouse['.scene-chip'].opened, 'Scene', 'Street (stand-in and wall)') && mouse['.scene-chip'].opened.foot === 'Each effect remembers its scene.' && mouse['.scene-chip'].state.scene === 'board-molotov' && mouse['.scene-chip'].value === 'Board: fire pit'
        && remembered.back === 'board-molotov' && remembered.chip === 'Board: fire pit'
        && wantOpened(mouse['.faction-chip'].opened, 'Faction that fired', 'Soviets') && mouse['.faction-chip'].state.faction === 'allies' && mouse['.faction-chip'].state.previewFaction === 'allies' && mouse['.faction-chip'].value === 'Allies'
        && wantOpened(mouse['.relation-chip'].opened, 'Made by', 'Enemy') && mouse['.relation-chip'].state.relation === 'team' && mouse['.relation-chip'].value === 'Your team'
        && wantOpened(mouse['.tier-chip'].opened, 'Tier', 'High') && mouse['.tier-chip'].state.tier === 'medium' && mouse['.tier-chip'].state.drawTier === 'medium' && mouse['.tier-chip'].value === 'Medium'
        && wantOpened(mouse['.view-chip'].opened, 'View', 'Whole screen') && mouse['.view-chip'].opened.chosen.join() === 'Whole screen,Target' && mouse['.view-chip'].state.view === 'game' && mouse['.view-chip'].value === 'Game size'
        && muzzle.closeOn === 'origin' && Object.values(mouse).every((m) => !m.after.open && m.after.expanded === 'false'),
      JSON.stringify({ ...mouse, muzzle: muzzle.closeOn, remembered }));

    // By keyboard: Enter opens (the focus on the chosen row), ↑ ↓ go round, Home and End, a letter goes to the next row
    // starting with it (letters typed quickly spell a word), Enter chooses and gives the focus back to the chip; Esc closes
    // and gives the focus back, choosing nothing.
    const kb = {};
    // After the keys, the page's timers run once (a menu takes the focus on one, as soon as it shows).
    const step = async (name, keys) => { await press(...keys); await tp.evaluate(() => new Promise((r) => setTimeout(r, 30))); kb[name] = await menuOf(name.split(':')[0]); };
    await focusChip('.scene-chip');
    await step('.scene-chip:enter', ['Enter']);
    await step('.scene-chip:down', ['ArrowDown']);
    await step('.scene-chip:end', ['End']);
    await step('.scene-chip:home', ['Home']);
    await step('.scene-chip:up', ['ArrowUp']);
    await step('.scene-chip:h', ['h']);
    // A pause, so the next letters start a new word.
    await tp.waitForTimeout(800);
    await step('.scene-chip:tan', ['b', 'o', 'a', 'r', 'd']);
    await step('.scene-chip:chose', ['Enter']);
    const sceneKb = await state();
    await focusChip('.faction-chip');
    await step('.faction-chip:enter', ['Enter']);
    await step('.faction-chip:e', ['e']);
    await step('.faction-chip:esc', ['Escape']);
    const factionEsc = await state();
    await step('.faction-chip:again', ['Enter']);
    await step('.faction-chip:s', ['s']);
    await step('.faction-chip:chose', ['Enter']);
    const factionKb = await state();
    await focusChip('.relation-chip');
    await step('.relation-chip:enter', ['Enter']);
    await step('.relation-chip:y', ['y']);
    await step('.relation-chip:chose', ['Enter']);
    const relationKb = await state();
    // L in the Tier menu goes to Low, and Loop does not toggle; ← does not step the timeline, and F does not fire.
    const before = await state();
    await focusChip('.tier-chip');
    await step('.tier-chip:enter', ['Enter']);
    await step('.tier-chip:L', ['L']);
    await step('.tier-chip:left', ['ArrowLeft', 'f', '1']);
    const whileOpen = await state();
    await step('.tier-chip:chose', ['Enter']);
    const tierKb = await state();
    ok('each chip\'s menu works by keyboard: Enter opens it with the focus on the chosen row, ↑ and ↓ go round, Home and End go to the ends, a letter goes to the next row starting with it (quick letters spell a word), Enter chooses and gives the focus back to the chip, Esc closes it and chooses nothing',
      kb['.scene-chip:enter'].open && kb['.scene-chip:enter'].focus === 'Board: fire pit' && kb['.scene-chip:down'].focus === 'Board: beam between tanks' && kb['.scene-chip:end'].focus === 'Hit on the ground'
        && kb['.scene-chip:home'].focus === 'Street (stand-in and wall)' && kb['.scene-chip:up'].focus === 'Hit on the ground' && kb['.scene-chip:h'].focus === 'Hit on a soldier'
        && kb['.scene-chip:tan'].focus === 'Board: rifle at a wall' && !kb['.scene-chip:chose'].open && kb['.scene-chip:chose'].focus === 'the chip' && sceneKb.scene === 'board-muzzle'
        && kb['.faction-chip:enter'].focus === 'Allies' && kb['.faction-chip:e'].focus === 'Empire' && !kb['.faction-chip:esc'].open && kb['.faction-chip:esc'].focus === 'the chip' && factionEsc.faction === 'allies'
        && kb['.faction-chip:again'].focus === 'Allies' && kb['.faction-chip:s'].focus === 'Soviets' && factionKb.faction === 'soviets' && kb['.faction-chip:chose'].focus === 'the chip'
        && kb['.relation-chip:enter'].focus === 'Your team' && kb['.relation-chip:y'].focus === 'You' && relationKb.relation === 'self'
        && tierKb.tier === 'low' && tierKb.drawTier === 'low' && !kb['.tier-chip:chose'].open,
      JSON.stringify({ kb: Object.fromEntries(Object.entries(kb).map(([k, v]) => [k, `${v.open ? 'open' : 'closed'}:${v.focus}`])), scene: sceneKb.scene, factionEsc: factionEsc.faction, faction: factionKb.faction, relation: relationKb.relation, tier: tierKb.tier }));
    ok('while a menu is open the editor\'s keys wait: L in the Tier menu goes to Low and Loop stays on; ← does not step the timeline, F does not fire and 1 does not change the view',
      kb['.tier-chip:L'].focus === 'Low' && kb['.tier-chip:left'].open && kb['.tier-chip:left'].focus === 'Low' && whileOpen.loop === before.loop && whileOpen.loop === 'true' && whileOpen.time === before.time
        && whileOpen.fired === before.fired && whileOpen.view === before.view && whileOpen.tier === before.tier, JSON.stringify({ before, whileOpen, focus: kb['.tier-chip:left'].focus }));

    // The View menu: 1, 2 and 3 choose their view and close it (its rows show those keys); its Close-up on rows. With the
    // menu closed, the keys 1, 2 and 3 work as before, and the chip follows. F still fires from a closed chip; Space on a
    // chip plays or pauses, as on every button, and opens nothing.
    await focusChip('.view-chip');
    await step('.view-chip:enter', ['Enter']);
    await step('.view-chip:3', ['3']);
    const view3 = await state();
    await step('.view-chip:again', ['Enter']);
    await step('.view-chip:end', ['End']);
    await step('.view-chip:target', ['Enter']);
    const target = await state();
    await press('1');
    const key1 = { ...(await state()), chip: await chipText('.view-chip') };
    await press('2');
    const key2 = { ...(await state()), chip: await chipText('.view-chip') };
    await press('1');
    const firedBefore = (await state()).fired;
    await press('f');
    await tp.waitForTimeout(100);
    const firedAfter = await state();
    await tp.evaluate(async () => { await window.__vfx.app.showAt(100, 7); });
    await focusChip('.tier-chip');
    await press(' ');
    const spaced = { ...(await state()), menu: (await menuOf('.tier-chip')).open };
    await focusChip('.tier-chip');
    await press(' ');
    const spacedBack = await state();
    ok('the View menu: 1, 2 and 3 choose their view and close it (its rows show them); Close-up on: Muzzle or Target; with it closed, the keys 1, 2 and 3 work as before and the chip follows; F still fires from a closed chip; Space on a chip plays or pauses and opens nothing',
      kb['.view-chip:enter'].focus === 'Game size' && !kb['.view-chip:3'].open && kb['.view-chip:3'].focus === 'the chip' && view3.view === 'close' && kb['.view-chip:again'].focus === 'Close-up'
        && kb['.view-chip:end'].focus === 'Target' && target.closeOn === 'target' && key1.view === 'whole' && key1.chip === 'Whole screen' && key2.view === 'game' && key2.chip === 'Game size'
        && firedAfter.fired === firedBefore + 1 && spaced.playing && !spaced.menu && !spacedBack.playing,
      JSON.stringify({ view3: view3.view, closeOn: target.closeOn, key1: [key1.view, key1.chip], key2: [key2.view, key2.chip], fired: [firedBefore, firedAfter.fired], spaced: [spaced.playing, spaced.menu], spacedBack: spacedBack.playing }));

    // Distance: drag the chip sideways, 0.1 m for every 4 px, ten times that with Shift, within 0 to 14 m; a drag opens no
    // popover. A click opens it below the chip with the focus on the slider: ← and → step 0.1 m as the slider did, and the
    // timeline does not step; a typed "0,5" or "2.5" in its number box sets the distance; Esc gives the focus back.
    await tp.evaluate(async () => { const a = window.__vfx.app; await a.setupForChecks({ effect: 'rifle_shot', scene: 'street', distance: 4 }); await a.showAt(100, 7); });
    const chipBox = await tp.locator('.vbar .distance-chip').boundingBox();
    const dragChip = async (dx, shift = false) => {
      const x = chipBox.x + chipBox.width / 2, y = chipBox.y + chipBox.height / 2;
      await tp.mouse.move(x, y);
      if (shift) await tp.keyboard.down('Shift');
      await tp.mouse.down();
      await tp.mouse.move(x + dx, y, { steps: 10 });
      await tp.mouse.up();
      if (shift) await tp.keyboard.up('Shift');
      return { distance: (await state()).distance, chip: await chipText('.distance-chip'), popover: (await menuOf('.distance-chip')).open };
    };
    const d40 = await dragChip(40);
    const dShift = await dragChip(8, true);
    const dLow = await dragChip(-400);
    const dHigh = await dragChip(80, true);
    await tp.evaluate(() => { const a = window.__vfx.app; a.previewForChecks.setDistance(4); a.toolbar.setDistance(4); });
    await tp.click('.vbar .distance-chip');
    await tp.waitForFunction(() => document.activeElement?.closest('.popover'), null, { timeout: 5000 }).catch(() => {});
    const popOpen = await menuOf('.distance-chip');
    const t0 = (await state()).time;
    await press('ArrowRight', 'ArrowRight', 'ArrowLeft');
    const arrows = { ...(await state()), chip: await chipText('.distance-chip') };
    await press('Tab');
    const numberFocus = await tp.evaluate(() => ({ focus: document.activeElement?.getAttribute('aria-label'), tip: document.querySelector('.tooltip')?.matches(':popover-open') ? document.querySelector('.tooltip .tip-first > span')?.textContent : null }));
    await tp.keyboard.type('0,5');
    await press('Enter');
    const comma = { ...(await state()), chip: await chipText('.distance-chip'), slider: await tp.locator('.distance-pop input[type="range"]').inputValue() };
    await tp.locator('.distance-pop input.num').fill('2.5');
    await press('Enter');
    const dot = { ...(await state()), chip: await chipText('.distance-chip') };
    await press('Escape');
    const popClosed = await menuOf('.distance-chip');
    ok('Distance: dragging the chip sideways changes it, 0.1 m for every 4 px and ten times that with Shift, within 0 to 14 m, and opens no popover',
      d40.distance === 5 && d40.chip === '5.0 m' && !d40.popover && dShift.distance === 7 && dShift.chip === '7.0 m' && dLow.distance === 0 && dLow.chip === '0.0 m' && dHigh.distance === 14 && dHigh.chip === '14.0 m' && !dHigh.popover,
      JSON.stringify({ d40, dShift, dLow, dHigh }));
    ok('Distance: a click opens its popover below the chip, the focus on the slider; ← and → step 0.1 m as the slider did (the timeline does not step); its number box takes "0,5" and "2.5"; Esc closes it and gives the focus back to the chip',
      popOpen.open && popOpen.role === 'dialog' && popOpen.haspopup === 'dialog' && popOpen.expanded === 'true' && popOpen.below >= 0 && popOpen.below <= 8 && popOpen.title === 'Distance from you' && popOpen.focus === 'Distance from you'
        && arrows.distance === 4.1 && arrows.chip === '4.1 m' && arrows.time === t0 && numberFocus.focus === 'Distance from you, in metres' && numberFocus.tip === help.helpFor('Distance from you', { section: 'Preview bar' })
        && comma.distance === 0.5 && comma.chip === '0.5 m' && comma.slider === '0.5' && dot.distance === 2.5 && dot.chip === '2.5 m' && !popClosed.open && popClosed.focus === 'the chip' && popClosed.expanded === 'false',
      JSON.stringify({ popOpen, arrows: [arrows.distance, arrows.chip, arrows.time, t0], numberFocus, comma: [comma.distance, comma.chip, comma.slider], dot: [dot.distance, dot.chip], popClosed }));
    // Past 14 m (the target dragged far in the tank shell's scene, which has you in it): the popover's number box shows the
    // distance the chip shows, and the slider stays at its end; Enter in the untouched box and ↑ change nothing, ↓ steps down
    // from 14 m, as before. Then the scene and the distance go back.
    await tp.evaluate(async () => { const a = window.__vfx.app; await a.setupForChecks({ effect: 'board_shell', scene: 'board-shell', distance: 4 }); await a.showAt(300, 7); });
    const tgt = await tp.evaluate(() => { const pv = window.__vfx.app.previewForChecks; const r = document.querySelector('.viewport').getBoundingClientRect(); const [x, y] = pv.toCanvas(pv.target); return { x: r.x + x, y: r.y + y, top: r.y }; });
    await tp.mouse.move(tgt.x, tgt.y);
    await tp.mouse.down();
    await tp.mouse.move(tgt.x + 300, tgt.top + 40, { steps: 12 });
    await tp.mouse.up();
    const farNow = () => tp.evaluate(() => { const pop = document.getElementById('distance-popover'); return { distance: +window.__vfx.app.previewForChecks.viewerDistanceM.toFixed(1), chip: document.querySelector('.vbar .distance-chip .chip-value').textContent, box: pop.querySelector('input.num').value, slider: pop.querySelector('input[type="range"]').value, open: pop.matches(':popover-open') }; });
    await tp.click('.vbar .distance-chip');
    await tp.waitForFunction(() => document.activeElement?.closest('.popover'), null, { timeout: 5000 }).catch(() => {});
    const far = await farNow();
    await tp.locator('.distance-pop input.num').focus();
    await press('Enter');
    const farEnter = await farNow();
    await press('ArrowUp');
    const farUp = await farNow();
    await press('ArrowDown');
    const farDown = await farNow();
    await press('Escape');
    await tp.evaluate(async () => { const a = window.__vfx.app; await a.setupForChecks({ effect: 'board_shell', scene: 'board-shell', distance: 4 }); await a.setupForChecks({ effect: 'rifle_shot', scene: 'street', distance: 4 }); await a.showAt(100, 7); });
    ok('Distance past 14 m (the target dragged far in the tank shell\'s scene): the popover\'s number box shows what the chip shows, the slider stays at 14 m; Enter in the untouched box and ↑ change nothing, ↓ goes to 13.9 m',
      far.distance > 14 && far.open && far.box === far.chip.replace(' m', '') && far.slider === '14' && farEnter.distance === far.distance && farEnter.box === far.box
        && farUp.distance === far.distance && farUp.box === far.box && farDown.distance === 13.9 && farDown.box === '13.9' && farDown.chip === '13.9 m',
      JSON.stringify({ far, farEnter, farUp, farDown }));

    // A menu opened at a point (a right-click; phase 4 gives the lists' rows theirs): near the window's corner it turns left
    // and up, so it stays inside the window, open after the button is let go, the focus on its first row; Esc closes it.
    await tp.evaluate(async () => {
      const dom = await import('/src/app/dom.ts');
      const target = document.createElement('div');
      target.className = 'check-right-click';
      Object.assign(target.style, { position: 'fixed', right: '0', bottom: '0', width: '420px', height: '300px', zIndex: '50' });
      document.body.append(target);
      window.__rightClick = null;
      const view = dom.menu({ id: 'check-right-click-menu', label: 'Check', items: [{ label: 'First row', action: () => { window.__rightClick = 'first'; } }, { label: 'Second row', action: () => { window.__rightClick = 'second'; } }, 'divider', { label: 'Third row', action: () => { window.__rightClick = 'third'; } }] });
      dom.contextMenu(target, view);
    });
    const atPoint = () => tp.evaluate(() => { const m = document.getElementById('check-right-click-menu'), r = m.getBoundingClientRect(); return { open: m.matches(':popover-open'), left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight, focus: document.activeElement?.closest('.menu') === m ? document.activeElement.querySelector('.menu-label').textContent : null, chosen: window.__rightClick }; });
    await tp.mouse.click(1916, 1076, { button: 'right' });
    await tp.waitForTimeout(150);
    const corner = await atPoint();
    await press('End', 'Enter');
    const cornerChosen = await atPoint();
    await tp.mouse.click(1560, 800, { button: 'right' });
    await tp.waitForTimeout(150);
    const middle = await atPoint();
    await press('Escape');
    const escaped = await atPoint();
    await tp.evaluate(() => { document.querySelector('.check-right-click')?.remove(); document.getElementById('check-right-click-menu')?.remove(); });
    ok('a menu opened at a point (right-click) stays inside the window: near the corner it turns left and up, it stays open after the button is let go, with the focus on its first row; elsewhere its corner is at the pointer; Enter chooses, Esc closes',
      corner.open && corner.focus === 'First row' && corner.right <= corner.w && corner.bottom <= corner.h && corner.left >= 0 && corner.top >= 0 && corner.right >= 1910 && corner.bottom >= 1070
        && !cornerChosen.open && cornerChosen.chosen === 'third' && middle.open && middle.left === 1560 && middle.top === 800 && middle.focus === 'First row' && !escaped.open,
      JSON.stringify({ corner, cornerChosen: [cornerChosen.open, cornerChosen.chosen], middle, escaped: escaped.open }));

    // Tooltips at once on keyboard focus, for a number box and a select too (the tooltip of their label, above the box), and
    // none when a click puts the focus in a number box, even just after a Tab.
    await tp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('board_shell'); a.selectLayer('ring'); });
    const rest = await tp.locator('.viewport').boundingBox();
    await tp.mouse.move(rest.x + rest.width / 2, rest.y + rest.height / 2);
    const ringFold = tp.locator('.inspector details', { has: tp.locator(':scope > summary', { hasText: /^Shape: ring$/ }) });
    const placeFold = tp.locator('.inspector details', { has: tp.locator(':scope > summary', { hasText: /^Place$/ }) });
    const widthBox = ringFold.locator('label.field', { has: tp.locator('.flab', { hasText: /^Width$/ }) }).locator('input').first();
    const facesBox = placeFold.locator('label.field', { has: tp.locator('.flab', { hasText: /^Faces$/ }) }).locator('select');
    const tabOnto = async (loc) => {
      await loc.scrollIntoViewIfNeeded();
      await frames();
      // What comes before it takes the focus by code (no tooltip for that), then Tab.
      await loc.evaluate((el) => { const all = [...document.querySelectorAll('input, select, button, summary, [tabindex="0"]')].filter((x) => x.getClientRects().length && !x.disabled && x.tabIndex >= 0); all[all.indexOf(el) - 1].focus(); });
      await tp.waitForTimeout(50);
      const quiet = await tp.evaluate(() => !!document.querySelector('.tooltip')?.matches(':popover-open'));
      await tp.evaluate(() => { window.__focusTip = { tabAt: null, openAt: null }; document.addEventListener('keydown', (e) => { if (e.key === 'Tab' && window.__focusTip.tabAt === null) window.__focusTip.tabAt = performance.now(); }, { capture: true, once: true }); const id = setInterval(() => { if (window.__focusTip.tabAt !== null && document.querySelector('.tooltip')?.matches(':popover-open')) { window.__focusTip.openAt = performance.now(); clearInterval(id); } }, 4); setTimeout(() => clearInterval(id), 3000); });
      await press('Tab');
      await tp.waitForFunction(() => window.__focusTip.openAt !== null, null, { timeout: 3000 }).catch(() => {});
      return tp.evaluate((q) => {
        const t = document.querySelector('.tooltip'), f = document.activeElement, r = t?.getBoundingClientRect(), fr = f.getBoundingClientRect();
        return { quiet: !q, open: !!t?.matches(':popover-open'), after: window.__focusTip.openAt === null ? null : Math.round(window.__focusTip.openAt - window.__focusTip.tabAt), focus: f.getAttribute('aria-label'),
          lines: t ? [...t.querySelectorAll(':scope > .tip-first > span, :scope > p')].map((x) => x.textContent) : [], above: !!r && r.bottom <= fr.top, desc: f.getAttribute('aria-describedby') };
      }, quiet);
    };
    const tabWidth = await tabOnto(widthBox);
    const tabFaces = await tabOnto(facesBox);
    const wantWidth = help.helpFor('Width', { section: ['Shape: ring'], layer: 'shape', kind: 'ring' });
    const wantFaces = help.helpFor('Faces', { section: ['Place'], layer: 'shape', kind: 'ring' });
    ok('a tooltip shows at once when Tab brings the focus to a number box or a select: its label\'s help text, above the box, describing it',
      tabWidth.quiet && tabWidth.open && tabWidth.after !== null && tabWidth.after < 150 && tabWidth.focus === 'Width' && tabWidth.lines.join(' | ') === wantWidth && tabWidth.above && tabWidth.desc === 'vfx-tooltip'
        && tabFaces.quiet && tabFaces.open && tabFaces.after < 150 && tabFaces.focus === 'Faces' && tabFaces.lines.join(' | ') === wantFaces && tabFaces.above,
      JSON.stringify({ tabWidth, tabFaces }));
    await press('Tab');
    await widthBox.scrollIntoViewIfNeeded();
    const box = await widthBox.boundingBox();
    await tp.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await tp.waitForTimeout(150);
    const atClick = await tp.evaluate(() => ({ open: !!document.querySelector('.tooltip')?.matches(':popover-open'), focus: document.activeElement?.getAttribute('aria-label') }));
    await tp.waitForTimeout(700);
    const afterClick = await tp.evaluate(() => ({ open: !!document.querySelector('.tooltip')?.matches(':popover-open'), focus: document.activeElement?.getAttribute('aria-label') }));
    ok('a click into a number box shows no tooltip, also just after a Tab (a text box matches :focus-visible after a click too)',
      atClick.focus === 'Width' && !atClick.open && !afterClick.open && afterClick.focus === 'Width', JSON.stringify({ atClick, afterClick }));
    await tp.keyboard.press('Escape');
    ok('the toolbar page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await tp.close();
  }

  // -- Show hints (docs/ui-redesign.md 6.9, 6.1, 6.4): on at first; the top bar's light bulb (left of Night mode) and the main
  // menu's row hide and show the one-line hints and the drag hint over the preview, and the choice is remembered (vfx-hints)
  // after a reload; ?hints=off and ?hints=on count for their page only. Meta text and lines that carry a state stay when the
  // hints hide, and the status bar keeps the drag hint over the preview.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    let hp = g.page;
    const DRAG = 'Drag the ground to move the target. Shift + drag moves the stand-in.';
    const hintsNow = (page = hp) => page.evaluate(() => {
      const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
      const b = document.querySelector('.topbar .hints-toggle');
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent-ink)';
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      // Hints with words in the window, in what is open (the colour list's hides by its own rule when there is no colour to
      // click; the closed colour picker's, a closed popover's, fold's or dialog's are not on screen anyway).
      const hints = [...document.querySelectorAll('#app .hint')].filter((e) => e.textContent.trim() && !e.closest('[hidden], details:not([open]), dialog:not([open])'));
      return { data: document.documentElement.dataset.hints, stored: localStorage.getItem('vfx-hints'), pressed: b?.getAttribute('aria-pressed'), label: b?.getAttribute('aria-label'),
        beforeNight: !!b?.nextElementSibling?.matches('.theme-toggle'), yellow: !!b && getComputedStyle(b.querySelector('svg.icon-hint')).color === accent,
        hints: hints.length, hintsShown: hints.filter(shown).length, vhint: shown(document.querySelector('.vhint')),
        states: [...document.querySelectorAll('.costcard .state-line')].filter((e) => e.textContent.trim()).map((e) => `${e.className.replace('state-line ', '')}:${shown(e)}`).join(),
        row: [...document.querySelectorAll('#main-menu .menu-item')].find((x) => x.querySelector('.menu-label').textContent === 'Show hints')?.getAttribute('aria-checked') ?? null };
    });
    const openMenu = async () => { await hp.click('.topbar .logo'); await hp.waitForFunction(() => document.activeElement?.closest('#main-menu'), null, { timeout: 5000 }).catch(() => {}); };
    await hp.evaluate(async () => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect('rifle_shot'); await a.showAt(20, 7); });
    // Cost's lines that carry its state: since UI phase 6 Cost folds, closed at first, and its line on budgets shows with its
    // Budgets toggle on (or a budget set). Open it and switch Budgets on, so those lines are on screen.
    await hp.locator('.inspector .costcard > details > summary').click();
    await hp.locator('.inspector .costcard .cost-budgets input').check();
    await openMenu();
    const atFirst = await hintsNow();
    await hp.keyboard.press('Escape');
    await hp.locator('.topbar .hints-toggle').click();
    const offByBulb = await hintsNow();
    // The status bar's drag hint, with the hints off.
    const vp = await hp.locator('.viewport').boundingBox();
    await hp.mouse.move(vp.x + vp.width / 2, vp.y + 60);
    const barHint = await hp.locator('.statusbar .sb-hint').textContent();
    // Meta text stays: the ids and the exports' folders in Projects.
    await openMenu();
    await hp.getByRole('menuitem', { name: 'Projects…', exact: true }).click();
    await hp.waitForSelector('dialog[open] .plist .meta', { timeout: 15000 }).catch(() => {});
    const meta = await hp.evaluate(() => {
      const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
      const m = [...document.querySelectorAll('dialog[open] .meta')];
      const own = [...document.querySelectorAll('dialog[open] p')].find((p) => p.textContent.startsWith('Makes a new project from an export folder'));
      return { n: m.length, shown: m.filter(shown).length, first: m[0]?.textContent.trim() ?? null, ownLine: shown(own) };
    });
    await hp.evaluate(() => document.querySelector('dialog[open]')?.close());
    ok('Show hints is on at first: the light bulb in the top bar, left of Night mode, is pressed (its icon in the accent, as an active toggle), its row in the main menu is checked, and the hints and the drag hint over the preview show',
      atFirst.data === 'on' && atFirst.stored === null && atFirst.label === 'Show hints' && atFirst.pressed === 'true' && atFirst.beforeNight && atFirst.yellow && atFirst.row === 'true'
        && atFirst.hints >= 8 && atFirst.hintsShown === atFirst.hints && atFirst.vhint, JSON.stringify(atFirst));
    ok('the light bulb hides the one-line hints and the drag hint over the preview, and remembers it (vfx-hints); lines that carry a state, meta text and a dialog\'s own line stay, and the status bar still shows the drag hint over the preview',
      offByBulb.data === 'off' && offByBulb.stored === 'off' && offByBulb.pressed === 'false' && !offByBulb.yellow && offByBulb.hints >= 8 && offByBulb.hintsShown === 0 && !offByBulb.vhint
        && offByBulb.states.includes('cost-status:true') && offByBulb.states.includes('cost-level:true') && !offByBulb.states.includes(':false') && barHint === DRAG
        && meta.n >= 3 && meta.shown === meta.n && meta.ownLine, JSON.stringify({ offByBulb, barHint, meta }));
    // The main menu's row does the same, and the choice outlives a reload.
    await openMenu();
    const rowOff = (await hintsNow()).row;
    await hp.getByRole('menuitemcheckbox', { name: 'Show hints', exact: true }).click();
    const onByRow = await hintsNow();
    await openMenu();
    await hp.getByRole('menuitemcheckbox', { name: 'Show hints', exact: true }).click();
    const offByRow = await hintsNow();
    await hp.reload();
    await hp.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
    await openMenu();
    const reloaded = await hintsNow();
    await hp.keyboard.press('Escape');
    ok('Show hints in the main menu, a check before Night mode, does what the light bulb does, and the choice is remembered after a reload',
      rowOff === 'false' && onByRow.data === 'on' && onByRow.stored === 'on' && onByRow.pressed === 'true' && onByRow.hintsShown === onByRow.hints && onByRow.vhint
        && offByRow.data === 'off' && offByRow.stored === 'off' && offByRow.hintsShown === 0 && reloaded.data === 'off' && reloaded.pressed === 'false' && reloaded.row === 'false' && reloaded.hintsShown === 0 && !reloaded.vhint,
      JSON.stringify({ rowOff, onByRow, offByRow, reloaded }));
    // ?hints=on over a remembered off: on for that page, and off is still remembered.
    await hp.goto(`${base}/?backend=webgl&hints=on&project=examples/demo-project`);
    await hp.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
    const onByQuery = await hintsNow();
    const errors = [...g.errors];
    await hp.close();
    // ?hints=off in a browser that never chose: off for that page, and nothing is remembered.
    const q = await open(`${base}/?backend=webgl&hints=off&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const offByQuery = await hintsNow(q.page);
    await q.page.close();
    ok('?hints=off hides the hints for its page only (nothing is remembered), and ?hints=on shows them over a remembered off',
      offByQuery.data === 'off' && offByQuery.stored === null && offByQuery.pressed === 'false' && offByQuery.hintsShown === 0 && !offByQuery.vhint
        && onByQuery.data === 'on' && onByQuery.stored === 'off' && onByQuery.pressed === 'true' && onByQuery.hintsShown === onByQuery.hints && onByQuery.vhint, JSON.stringify({ offByQuery, onByQuery }));
    ok('the Show hints pages have no errors', errors.length === 0 && q.errors.length === 0, [...errors, ...q.errors].slice(0, 2).join(' | '));
  }

  // -- the Effects list (docs/ui-redesign.md 6.2, 6.10, 6.11): folders from the names (" / "), nested, folders first, each
  // A to Z with numbers in order, counts of all inside; open or closed remembered per project; the search (name, folder,
  // file, game events), Esc and /; the row's menu by its More button and by a right-click; renaming in place; Move to
  // folder (a folder there is, No folder, New folder…), Duplicate and Delete, each one undo step; the keys /, F2 and
  // Ctrl+D, none while typing or with a menu open; inside the rename and search boxes the editor's keys only type. On a
  // throwaway project (projects/browser-check-folders-…), deleted after.
  {
    const fname = `browser-check-folders-${Date.now()}`;
    const fdir = join(repo, 'projects', fname);
    cpSync(join(repo, 'examples', 'demo-project'), fdir, { recursive: true });
    // And one with no effects at all, for the empty list (its effect files are taken away below).
    const edir = join(repo, 'projects', `${fname}-empty`);
    cpSync(join(repo, 'examples', 'demo-project'), edir, { recursive: true });
    const fxFile = (id) => join(fdir, 'effects', `${id}.vfx.json`);
    const readFx = (id) => JSON.parse(readFileSync(fxFile(id), 'utf8'));
    const writeFx = (fx) => writeFileSync(fxFile(fx.id), `${JSON.stringify(fx, null, 2)}\n`);
    for (const [id, name] of Object.entries({ board_beam: 'Abilities / Hammer leech beam (board)', board_molotov: 'Weapons / Grenades / Molotov flame pit (board)',
      board_muzzle: 'Weapons / Rifles / Rifle shot (board)', board_shell: 'Vehicles / Tank / Tank shell (board)' })) writeFx({ ...readFx(id), name });
    writeFx({ ...readFx('rifle_shot'), id: 'shot_two', name: 'Weapons / Rifles / Shot 2' });
    writeFx({ ...readFx('rifle_shot'), id: 'shot_ten', name: 'Weapons / Rifles / Shot 10' });
    writeFx({ ...readFx('shell_flight'), id: 'arrow', name: 'Arrow' });
    const fmeta = () => JSON.parse(readFileSync(join(fdir, 'project.json'), 'utf8'));
    const ownBudget = { on: true, limits: { high: { draws: 9 } } };
    writeFileSync(join(fdir, 'project.json'), `${JSON.stringify({ ...fmeta(), budgets: { effects: { board_muzzle: ownBudget } } }, null, 2)}\n`);
    let g = null;
    try {
      g = await open(`${base}/?backend=webgl&project=projects/${fname}`, () => window.__vfx && window.__vfx.ready);
      const lp = g.page;
      let confirms = 0;
      lp.on('dialog', (d) => { confirms++; d.accept(); });
      await lp.evaluate(async () => { window.__vfxManual = true; await window.__vfx.app.showAt(250, 7); document.querySelector('.status')?.classList.remove('show'); });
      /** The list as lines: "+ Folder (count)", "- Effect", two spaces a level; " *" marks the selected row, "closed" a closed folder. */
      const listNow = () => lp.evaluate(() => {
        const a = window.__vfx.app;
        const rows = [...document.querySelectorAll('.effects-list > *')].map((r) => {
          const pad = '  '.repeat(+(r.style.getPropertyValue('--depth') || 0));
          if (r.matches('.folder')) return `${pad}+ ${r.querySelector('.folder-name').textContent} (${r.querySelector('.folder-count').textContent})${r.getAttribute('aria-expanded') === 'true' ? '' : ' closed'}`;
          if (r.matches('.item')) return `${pad}- ${r.querySelector('.item-name')?.textContent ?? `[${r.querySelector('input.rename')?.value}]`}${r.classList.contains('sel') ? ' *' : ''}`;
          return `(${r.querySelector('p')?.textContent ?? r.textContent.trim()})`;
        });
        const f = document.activeElement;
        return { rows, count: document.querySelector('.effects-section .list-count').textContent, search: document.querySelector('.effects-search input').value,
          focus: f?.matches('.effects-search input') ? 'search' : f?.matches('input.rename') ? 'rename' : f?.closest?.('.menu') ? 'menu' : f?.className || f?.tagName,
          sel: a.effect()?.id ?? null, name: a.effect()?.name ?? null, layer: a.layer()?.id ?? null, n: a.debugState().effects.length,
          undo: a.history.undoLabel ?? null, canUndo: a.history.canUndo, time: a.debugState().mainTime, playing: a.debugState().playing,
          dirty: document.querySelector('.project-name').textContent.includes('•') };
      });
      const nameOf = (id) => lp.evaluate((id) => window.__vfx.app.history.doc.effects.find((e) => e.id === id)?.name ?? null, id);
      const start = await listNow();
      const want = ['+ Abilities (1)', '  - Hammer leech beam (board)', '+ Vehicles (1)', '  + Tank (1)', '    - Tank shell (board)', '+ Weapons (4)', '  + Grenades (1)',
        '    - Molotov flame pit (board)', '  + Rifles (3)', '    - Rifle shot (board)', '    - Shot 2', '    - Shot 10', '- Arrow *', '- Rifle shot (demo)', '- Tank shell flight (demo)'];
      // Each level is indented 20 px: an effect's dot sits under its folder's folder icon, and its name under the folder's name.
      const lineUp = await lp.evaluate(() => {
        const x = (el) => Math.round(el.getBoundingClientRect().left);
        const folder = document.querySelector('.effects-list .folder[data-folder="Abilities"]'), child = document.querySelector('.effects-list .item[data-effect="board_beam"]');
        const top = document.querySelector('.effects-list .item[data-effect="arrow"]');
        const head = document.querySelector('.effects-section .card-head'), add = head.querySelector('.add-effect'), search = document.querySelector('.effects-search');
        return { childDot: x(child.querySelector('.fx-dot')) - x(top.querySelector('.fx-dot')), underIcon: x(child.querySelector('.fx-dot')) - 3 === x(folder.querySelector('.icon-folder')),
          underName: x(child.querySelector('.item-name')) === x(folder.querySelector('.folder-name')), headH: Math.round(head.getBoundingClientRect().height),
          add: [Math.round(add.getBoundingClientRect().width), Math.round(add.getBoundingClientRect().height)], addLabel: add.getAttribute('aria-label'),
          searchH: Math.round(search.getBoundingClientRect().height), placeholder: search.querySelector('input').placeholder, searchIcon: !!search.querySelector('svg.icon-search'),
          rowH: Math.round(top.getBoundingClientRect().height), folderH: Math.round(folder.getBoundingClientRect().height), title: head.querySelector('h2').textContent };
      });
      ok('the Effects list puts effects in folders from their names (" / "), nested: folders first, then effects, each A to Z with numbers in order ("Shot 2" before "Shot 10"); a folder counts every effect inside it',
        JSON.stringify(start.rows) === JSON.stringify(want) && start.count === '9', JSON.stringify(start.rows));
      ok('its header is "Effects", the count and a 24 px + button in 32 px; the search box is 24 px with the search icon and "Search effects"; rows are 28 px, and each folder level is indented 20 px (a dot under its folder\'s icon, a name under its folder\'s name)',
        lineUp.title === 'Effects' && lineUp.headH === 32 && lineUp.add.join() === '24,24' && lineUp.addLabel === 'Add an effect' && lineUp.searchH === 24 && lineUp.placeholder === 'Search effects'
          && lineUp.searchIcon && lineUp.rowH === 28 && lineUp.folderH === 28 && lineUp.childDot === 20 && lineUp.underIcon && lineUp.underName, JSON.stringify(lineUp));

      // Open and closed, remembered per project (localStorage, vfx-folders:<project>): after a reload, and after another project.
      const key = `vfx-folders:projects/${fname}`;
      await lp.locator('.effects-list .folder[data-folder="Weapons"]').click();
      const closedNow = await listNow();
      const stored = await lp.evaluate((k) => localStorage.getItem(k), key);
      await lp.reload();
      await lp.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
      const afterReload = await listNow();
      await lp.evaluate(async () => { await window.__vfx.app.openProject('examples/demo-project'); });
      const demoRows = (await listNow()).rows;
      await lp.evaluate(async (p) => { await window.__vfx.app.openProject(p); }, `projects/${fname}`);
      const back = await listNow();
      await lp.locator('.effects-list .folder[data-folder="Weapons"]').click();
      const reopened = await listNow();
      const storedOpen = await lp.evaluate((k) => localStorage.getItem(k), key);
      const weaponsClosed = ['+ Abilities (1)', '  - Hammer leech beam (board)', '+ Vehicles (1)', '  + Tank (1)', '    - Tank shell (board)', '+ Weapons (4) closed', '- Arrow *', '- Rifle shot (demo)', '- Tank shell flight (demo)'];
      ok('a click on a folder closes it (and opens it again), remembered per project: after a reload, and after opening another project and coming back',
        JSON.stringify(closedNow.rows) === JSON.stringify(weaponsClosed) && stored === '["Weapons"]' && JSON.stringify(afterReload.rows) === JSON.stringify(weaponsClosed)
          && !demoRows.some((r) => r.includes('+ ')) && JSON.stringify(back.rows) === JSON.stringify(weaponsClosed) && JSON.stringify(reopened.rows) === JSON.stringify(want) && storedOpen === '[]',
        JSON.stringify({ closedNow: closedNow.rows, stored, afterReload: afterReload.rows.length, demoRows: demoRows.length, back: back.rows.length, storedOpen }));
      await lp.evaluate(async () => { window.__vfxManual = true; await window.__vfx.app.showAt(250, 7); document.querySelector('.status')?.classList.remove('show'); });

      // The search: by name, folder, file and game event; the count says "1 of 9"; matching effects keep their folders open,
      // even a closed one, which closes again when the search is cleared. Esc clears it, Esc again lets go of the box; / puts
      // the focus there from anywhere, but not while typing (the time readout's box takes the /).
      await lp.locator('.effects-list .folder[data-folder="Weapons"]').click();
      await lp.locator('.effects-list .item[data-effect="arrow"] .item-main').focus();
      await lp.keyboard.press('/');
      const slash = await listNow();
      const searchFor = async (q) => { await lp.locator('.effects-search input').fill(q); return listNow(); };
      const byName = await searchFor('pit');
      const byFolder = await searchFor('grenades');
      const byFile = await searchFor('shot_ten');
      const byEvent = await searchFor('demo.tank');
      const none = await searchFor('zzz');
      await lp.locator('.effects-list .list-empty button', { hasText: 'Clear the search' }).click();
      const clearedByButton = await listNow();
      await searchFor('grenades');
      await lp.keyboard.press('Escape');
      const esc1 = await listNow();
      await lp.keyboard.press('Escape');
      const esc2 = await listNow();
      await lp.locator('.transport .time-now').click();
      await lp.keyboard.press('/');
      const typedSlash = await lp.evaluate(() => ({ value: document.querySelector('.time-input').value, search: document.activeElement?.matches('.effects-search input') ?? false }));
      await lp.keyboard.press('Escape');
      ok('/ puts the keyboard focus in the effects search from anywhere, but not while typing in a field (the / is typed there)',
        slash.focus === 'search' && typedSlash.value.endsWith('/') && !typedSlash.search, JSON.stringify({ slash: slash.focus, typedSlash }));
      ok('the search finds effects by name, folder, file and game event, keeps their folders open (a closed one too), and the count says how many of all match ("1 of 9")',
        byName.rows.join('|') === '+ Weapons (1)|  + Grenades (1)|    - Molotov flame pit (board)' && byName.count === '1 of 9'
          && byFolder.rows.join('|') === '+ Weapons (1)|  + Grenades (1)|    - Molotov flame pit (board)' && byFile.rows.join('|') === '+ Weapons (1)|  + Rifles (1)|    - Shot 10'
          && byEvent.rows.join('|') === '- Tank shell flight (demo)' && byEvent.count === '1 of 9', JSON.stringify({ byName, byFolder: byFolder.rows, byFile: byFile.rows, byEvent: byEvent.rows }));
      ok('a search with no match says so and offers to clear it; Esc clears the search (the folders it opened close again, as they were), and Esc in the empty box lets go of it',
        none.rows.join('|') === '(Nothing matches "zzz".)' && none.count === '0 of 9' && clearedByButton.search === '' && clearedByButton.rows.includes('+ Weapons (4) closed')
          && esc1.search === '' && esc1.focus === 'search' && esc1.rows.includes('+ Weapons (4) closed') && esc1.count === '9' && esc2.focus !== 'search',
        JSON.stringify({ none: none.rows, cleared: clearedByButton.rows.length, esc1: [esc1.search, esc1.focus, esc1.count], esc2: esc2.focus }));
      await lp.locator('.effects-list .folder[data-folder="Weapons"]').click();

      // The row's menu: its More button (shown on hover and on the selected row) opens it below, and a second click closes it;
      // a right-click on a row opens the same menu at the pointer. Its rows: Rename (F2), Duplicate (Ctrl+D), Move to folder…,
      // a line, Delete.
      const menuNow = () => lp.evaluate(() => {
        const m = document.getElementById('effect-menu');
        const r = m.getBoundingClientRect();
        return { open: m.matches(':popover-open'), x: Math.round(r.left), y: Math.round(r.top),
          rows: [...m.children].map((c) => c.matches('.menu-divider') ? '—' : `${c.querySelector('.menu-label')?.textContent}${c.querySelector('.menu-key') ? `(${c.querySelector('.menu-key').textContent})` : ''}`),
          focus: document.activeElement?.closest?.('#effect-menu') ? document.activeElement.querySelector('.menu-label').textContent : document.activeElement?.getAttribute('aria-label') ?? null };
      });
      const shotRow = effectRow(lp, 'Shot 2');
      const hiddenMore = await shotRow.locator('.more').isVisible();
      await shotRow.hover();
      const hoverMore = await shotRow.locator('.more').isVisible();
      const moreBox = await shotRow.locator('.more').boundingBox();
      await shotRow.locator('.more').click();
      await lp.waitForSelector('#effect-menu:popover-open', { timeout: 5000 });
      await lp.waitForFunction(() => document.activeElement?.closest('#effect-menu'), null, { timeout: 5000 }).catch(() => {});
      const byClick = await menuNow();
      const expanded = await shotRow.locator('.more').getAttribute('aria-expanded');
      const moreOpen = await openLook(lp, shotRow.locator('.more'), 'effect-menu');
      await shotRow.locator('.more').click();
      await lp.waitForTimeout(200);
      const secondClick = await menuNow();
      await effectRow(lp, 'Arrow').scrollIntoViewIfNeeded();
      const arrowBox = await effectRow(lp, 'Arrow').boundingBox();
      await lp.mouse.click(arrowBox.x + 60, arrowBox.y + 14, { button: 'right' });
      await lp.waitForSelector('#effect-menu:popover-open', { timeout: 5000 });
      const byRight = await menuNow();
      await lp.keyboard.press('Escape');
      const afterEsc = await menuNow();
      const selMore = await lp.locator('.effects-list .item.sel .more').isVisible();
      ok('an effect\'s row shows its More button on hover and on the selected row; it opens the row\'s menu below it (Rename F2, Duplicate Ctrl+D, Move to folder…, Delete), and a second click closes it',
        !hiddenMore && hoverMore && selMore && byClick.open && Math.abs(byClick.y - (moreBox.y + moreBox.height + 4)) <= 1 && byClick.rows.join('|') === 'Rename(F2)|Duplicate(Ctrl+D)|Move to folder…|—|Delete'
          && byClick.focus === 'Rename' && expanded === 'true' && !secondClick.open, JSON.stringify({ hiddenMore, hoverMore, selMore, byClick, expanded, secondClick: secondClick.open }));
      ok('while its menu is open, the More button stays (the pointer gone into the menu) and looks open, as a chip with its menu open: the field colour, the icon in --accent-ink',
        moreOpen.shown && moreOpen.expanded === 'true' && moreOpen.icon && moreOpen.field, JSON.stringify(moreOpen));
      ok('a right-click on an effect\'s row opens the same menu at the pointer; Esc closes it', byRight.open && byRight.x === Math.round(arrowBox.x + 60) && byRight.y === Math.round(arrowBox.y + 14)
        && byRight.rows.join('|') === byClick.rows.join('|') && !afterEsc.open, JSON.stringify({ byRight, afterEsc: afterEsc.open }));

      // Renaming in place: a double-click on the name gives a box with the name (its folder stays); Enter keeps the new name in
      // one undo step, Esc keeps the old one, an empty name keeps the old one, a click elsewhere keeps it and still does what
      // it does. F2 renames the selected effect.
      await shotRow.dblclick();
      const dbl = await listNow();
      const selected = await lp.evaluate(() => { const i = document.activeElement; return i?.matches('input.rename') ? [i.selectionStart, i.selectionEnd, i.value.length] : null; });
      await lp.keyboard.type('Shot 3');
      await lp.keyboard.press('Enter');
      const renamed = await listNow();
      await lp.keyboard.press('Control+z');
      const renameUndone = await nameOf('shot_two');
      const undoBefore = (await listNow()).canUndo;
      await shotRow.dblclick();
      await lp.keyboard.type('xyz');
      await lp.keyboard.press('Escape');
      const escaped = await listNow();
      await effectRow(lp, 'Arrow').click();
      await lp.keyboard.press('F2');
      const f2 = await listNow();
      await lp.keyboard.press('Control+a');
      await lp.keyboard.press('Backspace');
      await lp.keyboard.press('Enter');
      const emptyName = await nameOf('arrow');
      await lp.keyboard.press('F2');
      await lp.keyboard.type('Bolt');
      await effectRow(lp, 'Rifle shot (demo)').click();
      const clickedAway = await listNow();
      const bolt = await nameOf('arrow');
      await lp.keyboard.press('Control+z');
      const boltUndone = await nameOf('arrow');
      ok('a double-click on an effect\'s name renames it in place (its folder stays): Enter keeps the new name, in one undo step',
        dbl.focus === 'rename' && dbl.rows.includes('    - [Shot 2] *') && JSON.stringify(selected) === '[0,6,6]' && renamed.name === 'Weapons / Rifles / Shot 3' && renamed.undo === 'Rename effect'
          && renamed.focus === 'item-main' && renameUndone === 'Weapons / Rifles / Shot 2', JSON.stringify({ dbl: [dbl.focus, dbl.sel], selected, renamed: [renamed.name, renamed.undo, renamed.focus], renameUndone }));
      ok('Esc in the rename box keeps the old name (no undo step), and so does an empty name; F2 renames the selected effect; a click on another row keeps the name typed and selects that row',
        escaped.name === 'Weapons / Rifles / Shot 2' && escaped.focus === 'item-main' && f2.focus === 'rename' && f2.sel === 'arrow' && emptyName === 'Arrow'
          && bolt === 'Bolt' && clickedAway.sel === 'rifle_shot' && boltUndone === 'Arrow' && undoBefore === escaped.canUndo,
        JSON.stringify({ escaped: [escaped.name, escaped.focus], f2: [f2.focus, f2.sel], emptyName, bolt, clickedAway: clickedAway.sel, boltUndone }));

      // A click on another row's More while a rename box is open: the click keeps the name typed (the list is built again for
      // it), and the menu still opens below that row's More, not in the window's corner; Move to folder… opens there too, and
      // Esc gives the focus back to that More.
      await lp.keyboard.press('F2');
      await lp.keyboard.type('Rifle shot (demo) 2');
      const arrowRow = effectRow(lp, 'Arrow');
      await arrowRow.hover();
      const arrowMore = await arrowRow.locator('.more').boundingBox();
      await arrowRow.locator('.more').click();
      await lp.waitForSelector('#effect-menu:popover-open', { timeout: 5000 });
      const placeOf = (id) => lp.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), bottom: Math.round(r.bottom) }; }, id);
      const midMenu = await placeOf('effect-menu');
      const midRow = await lp.evaluate(() => {
        const b = document.querySelector('.effects-list .item[data-effect="arrow"] > .more');
        return { expanded: b?.getAttribute('aria-expanded') ?? null, shown: !!b && b.getClientRects().length > 0, name: window.__vfx.app.history.doc.effects.find((e) => e.id === 'rifle_shot').name, undo: window.__vfx.app.history.undoLabel };
      });
      await menuRow(lp, 'effect-menu', 'Move to folder…').click();
      await lp.waitForSelector('#folder-menu:popover-open', { timeout: 5000 });
      const midFolders = await placeOf('folder-menu');
      await lp.keyboard.press('Escape');
      const midBack = await lp.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
      await lp.keyboard.press('Control+z');
      const midUndone = await nameOf('rifle_shot');
      /** Below the More button (or above it, where there is no room below), their left edges lined up. */
      const underArrowMore = (m) => Math.abs(m.x - Math.round(arrowMore.x)) <= 1
        && (Math.abs(m.y - (arrowMore.y + arrowMore.height + 4)) <= 1 || Math.abs(m.bottom - (arrowMore.y - 4)) <= 1);
      ok('a click on another row\'s More while a rename box is open keeps the name typed, in one undo step, and opens that row\'s menu below its More (not in the window\'s corner); Move to folder… opens there too, and Esc gives the focus back to that More',
        midRow.name === 'Rifle shot (demo) 2' && midRow.undo === 'Rename effect' && underArrowMore(midMenu) && midRow.expanded === 'true' && midRow.shown
          && underArrowMore(midFolders) && midBack === 'More: Arrow' && midUndone === 'Rifle shot (demo)',
        JSON.stringify({ midMenu, arrowMore, midRow, midFolders, midBack, midUndone }));

      // Inside the rename box and the search box, Space, Delete, Backspace, ← and → only type: they never play, delete the
      // selected layer or step the time. Esc there does only the innermost thing (cancel the rename, clear the search): the
      // layer stays selected; only a third Esc, with nothing going on, leaves it.
      const typingKeys = async () => {
        const before = await listNow();
        // From the end of the text: a space, two steps back, Delete takes the last letter, a step on, Backspace takes the space.
        for (const k of ['Space', 'ArrowLeft', 'ArrowLeft', 'Delete', 'ArrowRight', 'Backspace']) await lp.keyboard.press(k);
        const after = await listNow();
        const layers = await lp.evaluate(() => window.__vfx.app.effect().layers.length);
        return { playing: after.playing, time: after.time === before.time, layer: after.layer, layers, focus: after.focus };
      };
      await lp.evaluate(async () => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); a.selectLayer('flash'); await a.showAt(250, 7); });
      const layersBefore = await lp.evaluate(() => window.__vfx.app.effect().layers.length);
      await effectRow(lp, 'Rifle shot (demo)').click({ button: 'right' });
      await menuRow(lp, 'effect-menu', 'Rename').click();
      await lp.keyboard.press('End');
      const inRename = await typingKeys();
      const renameValue = await lp.evaluate(() => document.querySelector('input.rename')?.value ?? null);
      await lp.keyboard.press('Escape');
      const renameEsc = await listNow();
      await lp.keyboard.press('/');
      await lp.keyboard.type('rifle');
      const inSearch = await typingKeys();
      const searchValue = await lp.locator('.effects-search input').inputValue();
      await lp.keyboard.press('Escape');
      const searchEsc1 = await listNow();
      await lp.keyboard.press('Escape');
      const searchEsc2 = await listNow();
      await lp.keyboard.press('Escape');
      const searchEsc3 = await listNow();
      ok('inside the rename box Space, Delete, Backspace, ← and → only type (no play, no deleted layer, no step); Esc cancels the rename and the layer stays selected',
        !inRename.playing && inRename.time && inRename.layer === 'flash' && inRename.layers === layersBefore && inRename.focus === 'rename' && renameValue === 'Rifle shot (demo' && renameEsc.name === 'Rifle shot (demo)' && renameEsc.layer === 'flash',
        JSON.stringify({ inRename, renameValue, renameEsc: [renameEsc.name, renameEsc.layer] }));
      ok('inside the search box the same keys only type; Esc clears the search, a second Esc lets go of the box, the layer still selected; a third Esc leaves the layer',
        !inSearch.playing && inSearch.time && inSearch.layer === 'flash' && inSearch.layers === layersBefore && inSearch.focus === 'search' && searchValue === 'rifl'
          && searchEsc1.search === '' && searchEsc1.layer === 'flash' && searchEsc2.focus !== 'search' && searchEsc2.layer === 'flash' && searchEsc3.layer === null,
        JSON.stringify({ inSearch, searchValue, esc: [searchEsc1.search, searchEsc1.layer, searchEsc2.focus, searchEsc2.layer, searchEsc3.layer] }));

      // Move to folder…: a menu of the folders there are, No folder and New folder… (the question dialog; its OK button is
      // clicked, so this holds with or without the change to Enter that waits for Mustafa). Each move is one undo step.
      const folderMenuNow = () => lp.evaluate(() => {
        const m = document.getElementById('folder-menu');
        return { open: !!m?.matches(':popover-open'), title: m?.querySelector('.menu-title')?.textContent ?? null,
          rows: m ? [...m.querySelectorAll('.menu-item, .menu-divider')].map((c) => c.matches('.menu-divider') ? '—' : `${c.querySelector('.menu-label').textContent}${c.getAttribute('aria-checked') === 'true' ? ' •' : ''}`) : [] };
      });
      await effectMenu(lp, 'Arrow', 'Move to folder…');
      await lp.waitForSelector('#folder-menu:popover-open', { timeout: 5000 });
      const fm = await folderMenuNow();
      await menuRow(lp, 'folder-menu', 'Vehicles / Tank').click();
      const movedTank = await listNow();
      const movedName = await nameOf('arrow');
      await lp.keyboard.press('Control+z');
      const moveUndone = await nameOf('arrow');
      await effectMenu(lp, 'Shot 10', 'Move to folder…');
      await lp.waitForSelector('#folder-menu:popover-open', { timeout: 5000 });
      const fmShot = await folderMenuNow();
      await menuRow(lp, 'folder-menu', 'No folder').click();
      const noFolder = await nameOf('shot_ten');
      const noFolderUndo = (await listNow()).undo;
      await lp.keyboard.press('Control+z');
      const noFolderUndone = await nameOf('shot_ten');
      await effectMenu(lp, 'Arrow', 'Move to folder…');
      await lp.waitForSelector('#folder-menu:popover-open', { timeout: 5000 });
      await menuRow(lp, 'folder-menu', 'New folder…').click();
      const askTitle = await lp.waitForFunction(() => document.querySelector('dialog[open] h2')?.textContent ?? null, null, { timeout: 5000 }).then((x) => x.jsonValue(), () => null);
      await lp.locator('dialog[open] input.text').fill('Fresh');
      await lp.locator('dialog[open] button', { hasText: 'OK' }).click();
      const fresh = await listNow();
      const freshName = await nameOf('arrow');
      await lp.keyboard.press('Control+z');
      const freshUndone = { ...(await listNow()), arrow: await nameOf('arrow') };
      ok('Move to folder… lists the folders there are, No folder (chosen when it has none) and New folder…; choosing a folder moves the effect there in one undo step',
        fm.open && fm.title === 'Move to folder' && fm.rows.join('|') === 'No folder •|Abilities|Vehicles|Vehicles / Tank|Weapons|Weapons / Grenades|Weapons / Rifles|—|New folder…'
          && movedName === 'Vehicles / Tank / Arrow' && movedTank.undo === 'Move to folder' && movedTank.rows.some((r) => r.startsWith('    - Arrow')) && moveUndone === 'Arrow'
          && fmShot.rows.includes('Weapons / Rifles •') && noFolder === 'Shot 10' && noFolderUndo === 'Move to folder' && noFolderUndone === 'Weapons / Rifles / Shot 10',
        JSON.stringify({ fm, movedName, movedUndo: movedTank.undo, moveUndone, noFolder, noFolderUndone }));
      ok('New folder… asks for the folder\'s name (the question dialog, its OK button clicked) and moves the effect into the new folder, which starts open, in one undo step',
        askTitle === 'New folder' && freshName === 'Fresh / Arrow' && fresh.rows.includes('+ Fresh (1)') && fresh.rows.some((r) => r.startsWith('  - Arrow')) && fresh.undo === 'Move to folder'
          && freshUndone.arrow === 'Arrow' && !freshUndone.rows.some((r) => r.includes('Fresh')), JSON.stringify({ askTitle, freshName, fresh: fresh.rows, freshUndone: freshUndone.arrow }));

      // Duplicate: "<name> copy", in its folder, selected, with the source's scene and own budgets but no game events. One undo
      // takes away the copy, its scene and its budgets (no unsaved dot left), and redo brings all back; project.json follows.
      await lp.evaluate(() => window.__vfx.app.pickEffect('board_muzzle'));
      const cleanBefore = await listNow();
      await effectMenu(lp, 'Rifle shot (board)', 'Duplicate');
      const dup = await listNow();
      const dupInfo = await lp.evaluate(() => { const a = window.__vfx.app; return { id: a.effect()?.id, scene: a.previewForChecks.scene.id, events: a.events(), budget: a.budgets().effects[a.effect()?.id] ?? null, stored: a.previewScenes[a.effect()?.id] ?? null }; });
      await lp.keyboard.press('Control+z');
      const dupUndone = await listNow();
      const undoneInfo = await lp.evaluate(() => { const a = window.__vfx.app; return { scene: a.previewScenes.board_muzzle_2 ?? null, budget: a.budgets().effects.board_muzzle_2 ?? null }; });
      await lp.keyboard.press('Control+Shift+z');
      const redoneInfo = await lp.evaluate(() => { const a = window.__vfx.app; return { ids: a.debugState().effects, scene: a.previewScenes.board_muzzle_2 ?? null, budget: a.budgets().effects.board_muzzle_2 ?? null }; });
      const saveNow = async () => {
        await lp.keyboard.press('Control+s');
        await lp.waitForFunction(() => !document.querySelector('.project-name')?.textContent?.includes('•'), null, { timeout: 15000 }).catch(() => {});
        await lp.waitForTimeout(200);
      };
      await saveNow();
      const savedWith = fmeta();
      await lp.keyboard.press('Control+z');
      await saveNow();
      const savedWithout = fmeta();
      const copyFile = existsSync(fxFile('board_muzzle_2'));
      ok('Duplicate makes "<name> copy" in the same folder, selected, with the source\'s scene and its own budgets and no game events; one undo takes the copy, its scene and budgets away and leaves nothing unsaved; redo brings them back',
        !cleanBefore.dirty && dup.name === 'Weapons / Rifles / Rifle shot (board) copy' && dup.sel === 'board_muzzle_2' && dup.undo === 'Duplicate effect' && dup.rows.includes('    - Rifle shot (board) copy *')
          && dupInfo.scene === 'board-muzzle' && dupInfo.stored === 'board-muzzle' && dupInfo.events.length === 0 && JSON.stringify(dupInfo.budget) === JSON.stringify(ownBudget)
          && dupUndone.n === 9 && !dupUndone.dirty && undoneInfo.scene === null && undoneInfo.budget === null
          && redoneInfo.ids.includes('board_muzzle_2') && redoneInfo.scene === 'board-muzzle' && JSON.stringify(redoneInfo.budget) === JSON.stringify(ownBudget),
        JSON.stringify({ dup: [dup.name, dup.sel, dup.undo], dupInfo, dupUndone: [dupUndone.n, dupUndone.dirty], undoneInfo, redoneInfo }));
      ok('saved, the copy\'s scene and budgets are in project.json and its game events are not; after undo and another save, nothing of the copy is left',
        savedWith.preview?.board_muzzle_2?.scene === 'board-muzzle' && JSON.stringify(savedWith.budgets?.effects?.board_muzzle_2) === JSON.stringify(ownBudget) && !savedWith.events?.board_muzzle_2
          && savedWith.events?.board_muzzle?.length > 0 && !savedWithout.preview?.board_muzzle_2 && !savedWithout.budgets?.effects?.board_muzzle_2 && !copyFile,
        JSON.stringify({ withCopy: { preview: savedWith.preview?.board_muzzle_2, budget: savedWith.budgets?.effects?.board_muzzle_2, events: savedWith.events?.board_muzzle_2 ?? null }, without: { preview: savedWithout.preview?.board_muzzle_2 ?? null }, copyFile }));

      // The keys: Ctrl+D duplicates the selected effect when no layer is selected; F2 and Ctrl+D do nothing while typing in
      // a field (the search box) or with a menu open; / goes to the menu's type-ahead then.
      await effectRow(lp, 'Shot 2').click();
      await lp.keyboard.press('Control+d');
      const ctrlD = await listNow();
      await lp.keyboard.press('Control+z');
      await lp.locator('.effects-search input').focus();
      await lp.keyboard.press('F2');
      await lp.keyboard.press('Control+d');
      const whileTyping = await listNow();
      await lp.keyboard.press('Escape');
      await effectMenu(lp, 'Shot 2');
      await lp.waitForFunction(() => document.activeElement?.closest('#effect-menu'), null, { timeout: 5000 }).catch(() => {});
      await lp.keyboard.press('F2');
      await lp.keyboard.press('Control+d');
      await lp.keyboard.press('/');
      const withMenu = await listNow();
      const menuStill = await menuNow();
      await lp.keyboard.press('Escape');
      ok('Ctrl+D duplicates the selected effect when no layer is selected; F2, Ctrl+D and / do nothing to the list while typing in a field or with a menu open',
        ctrlD.name === 'Weapons / Rifles / Shot 2 copy' && ctrlD.n === 10 && whileTyping.n === 9 && !whileTyping.rows.some((r) => r.includes('[')) && whileTyping.focus === 'search'
          && withMenu.n === 9 && !withMenu.rows.some((r) => r.includes('[')) && withMenu.focus === 'menu' && menuStill.open,
        JSON.stringify({ ctrlD: [ctrlD.name, ctrlD.n], whileTyping: [whileTyping.n, whileTyping.focus], withMenu: [withMenu.n, withMenu.focus, menuStill.open] }));

      // Delete keeps its confirmation and its undo.
      const confirmsBefore = confirms;
      await effectMenu(lp, 'Shot 10', 'Delete');
      const deleted = await listNow();
      await lp.keyboard.press('Control+z');
      const deleteUndone = await listNow();
      ok('Delete in an effect\'s menu asks first, deletes it, and undo brings it back',
        confirms === confirmsBefore + 1 && deleted.n === 8 && !deleted.rows.some((r) => r.includes('Shot 10')) && deleteUndone.n === 9 && deleteUndone.rows.includes('    - Shot 10'),
        JSON.stringify({ confirms: confirms - confirmsBefore, deleted: deleted.n, deleteUndone: deleteUndone.n }));

      // Each row's dot: 10 px, the effect's main colour for the faction shown, with a 1 px edge in --text-faint (so a dark colour
      // shows in Night); it follows the faction.
      const dotOf = () => lp.evaluate(() => {
        const a = window.__vfx.app;
        const fx = a.history.doc.effects.find((e) => e.id === 'board_beam');
        const d = document.querySelector('.effects-list .item[data-effect="board_beam"] .fx-dot');
        const probe = document.createElement('span');
        probe.style.color = 'var(--text-faint)';
        document.body.append(probe);
        const faint = getComputedStyle(probe).color;
        probe.style.color = (a.palette.factions[a.faction].roles[fx.controls.colour] ?? a.palette.roles[fx.controls.colour]).hex;
        const want = getComputedStyle(probe).color;
        probe.remove();
        const r = d.getBoundingClientRect();
        return { size: `${Math.round(r.width)}x${Math.round(r.height)}`, colour: getComputedStyle(d).backgroundColor, want, edge: getComputedStyle(d).boxShadow.includes(faint) && /1px/.test(getComputedStyle(d).boxShadow), faction: a.faction };
      });
      const dotSoviets = await dotOf();
      await lp.evaluate(() => window.__vfx.app.setFaction('allies'));
      const dotAllies = await dotOf();
      await lp.evaluate(() => window.__vfx.app.setFaction('soviets'));
      ok('each effect\'s row has a 10 px dot in its main colour for the faction shown, with a 1 px edge in --text-faint; it follows the faction',
        dotSoviets.size === '10x10' && dotSoviets.colour === dotSoviets.want && dotSoviets.edge && dotAllies.colour === dotAllies.want && dotAllies.colour !== dotSoviets.colour,
        JSON.stringify({ dotSoviets, dotAllies }));
      // Clearing a search keeps the selected effect in sight: its own folders stay open; the other folders the search opened
      // close again, as they were.
      const folderState = (n) => lp.evaluate((f) => document.querySelector(`.effects-list .folder[data-folder="${f}"]`)?.getAttribute('aria-expanded') ?? null, n);
      for (const f of ['Weapons', 'Vehicles']) if ((await folderState(f)) === 'true') await lp.locator(`.effects-list .folder[data-folder="${f}"]`).click();
      const shutBefore = [await folderState('Weapons'), await folderState('Vehicles')];
      await lp.locator('.effects-search input').fill('(board)');
      await lp.locator('.effects-list .item[data-effect="board_molotov"] .item-main').click();
      await lp.locator('.effects-search input').focus();
      await lp.keyboard.press('Escape');
      const inSight = await listNow();
      const molotovRow = await lp.evaluate(() => {
        const r = document.querySelector('.effects-list .item[data-effect="board_molotov"]'), l = document.querySelector('.effects-list');
        if (!r) return null;
        const b = r.getBoundingClientRect(), lb = l.getBoundingClientRect();
        return { sel: r.classList.contains('sel'), inView: b.top >= lb.top - 1 && b.bottom <= lb.bottom + 1 };
      });
      // The same with the Clear the search button, after typing on until nothing matched.
      await lp.locator('.effects-list .folder[data-folder="Weapons"]').click();
      const shutAgain = await folderState('Weapons');
      await lp.locator('.effects-search input').fill('pit');
      await lp.locator('.effects-list .item[data-effect="board_molotov"] .item-main').click();
      await lp.locator('.effects-search input').fill('pitzzz');
      await lp.locator('.effects-list .list-empty button', { hasText: 'Clear the search' }).click();
      const byButton = await listNow();
      ok('clearing a search keeps the selected effect in sight: its own folders stay open, and the other folders the search opened close again, as they were; the Clear the search button too',
        shutBefore.join() === 'false,false' && inSight.search === '' && inSight.rows.some((r) => /^\+ Weapons \(\d+\)$/.test(r)) && inSight.rows.some((r) => /^  \+ Grenades \(\d+\)$/.test(r))
          && inSight.rows.includes('    - Molotov flame pit (board) *') && inSight.rows.some((r) => /^\+ Vehicles \(\d+\) closed$/.test(r)) && molotovRow?.sel === true && molotovRow?.inView === true
          && shutAgain === 'false' && byButton.search === '' && byButton.rows.some((r) => /^\+ Weapons \(\d+\)$/.test(r)) && byButton.rows.includes('    - Molotov flame pit (board) *'),
        JSON.stringify({ shutBefore, rows: inSight.rows, molotovRow, shutAgain, byButton: byButton.rows }));
      // A project with no effects: "No effects yet." and Make an effect, which makes a new effect (New effect), selected.
      for (const f of readdirSync(join(edir, 'effects'))) rmSync(join(edir, 'effects', f));
      await lp.evaluate(async (p) => { await window.__vfx.app.openProject(p); }, `projects/${fname}-empty`);
      const noEffects = await listNow();
      await lp.locator('.effects-list .list-empty button', { hasText: 'Make an effect' }).click();
      const made = await listNow();
      ok('a project with no effects says "No effects yet." with a Make an effect button, which makes a new effect and selects it',
        noEffects.rows.join('|') === '(No effects yet.)' && noEffects.count === '0' && made.n === 1 && made.name === 'New effect' && made.rows.join('|') === '- New effect *',
        JSON.stringify({ noEffects: [noEffects.rows, noEffects.count], made: [made.n, made.name, made.rows] }));
      ok('the Effects list page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    } finally {
      await g?.page.close();
      rmSync(fdir, { recursive: true, force: true });
      rmSync(edir, { recursive: true, force: true });
    }
  }

  // -- the Layers list (docs/ui-redesign.md 6.2, 6.10, 6.11): the + menu that adds a layer (its groups, the 14 shapes with
  // their plain names and the names in the file), the new layer above the selected one and selected; a row's buttons (Move
  // up, Move down, More) in its tag's place on hover and on the selected row, and its menu by More and by a right-click;
  // Rename, Duplicate, Move up, Move down and Delete, each one undo step; renaming in place; drag to reorder (the landing
  // line, one undo step, Esc cancels); the empty state; the hover highlight both ways with the timeline; the selection
  // scrolled into view in both; the keys F2, Ctrl+D, Ctrl+] and Ctrl+[, none while typing or with a menu open, and inside the
  // rename box the editor's keys only type. On the demo project (an example: nothing is saved).
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const lp = g.page;
    lp.on('dialog', (d) => d.accept());
    const help = await server.ssrLoadModule('/src/app/help.ts');
    const info = await server.ssrLoadModule('/src/doc/layer-info.ts');
    await lp.evaluate(async () => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect('board_beam'); a.selectLayer('emitter_glow'); await a.showAt(1000, 7); document.querySelector('.status')?.classList.remove('show'); });
    /** The rows as shown (top of the list first), the selection, the undo step and where the focus is. */
    const layersNow = () => lp.evaluate(() => {
      const a = window.__vfx.app, f = document.activeElement;
      return { order: a.effect().layers.map((l) => l.id).reverse(), sel: a.layer()?.id ?? null, n: a.effect().layers.length, undo: a.history.undoLabel ?? null,
        rows: [...document.querySelectorAll('.layers-list .layer-item')].map((r) => r.dataset.layer), renaming: document.querySelector('.layers-list input.rename')?.value ?? null,
        focus: f?.matches('input.rename') ? 'rename' : f?.matches('.effects-search input') ? 'search' : f?.closest?.('.menu') ? 'menu' : f?.className || f?.tagName,
        time: a.debugState().mainTime, playing: a.debugState().playing, count: document.querySelector('.layers-section .list-count')?.textContent ?? null };
    });
    const layerRowOf = (id) => lp.locator(`.layers-list .layer-item[data-layer="${id}"]`);
    const start = await layersNow();

    // The + menu: Sprite (an image), Projectile (a path in flight), under "Shapes" the 14 kinds (shape icon, plain name, the
    // name in the file on the right), then Burst (pieces thrown out) and Word (a comic sound). The new layer goes above the
    // selected one and is selected.
    await lp.click('.layers-section .add-layer');
    await lp.waitForSelector('#add-layer-menu:popover-open', { timeout: 5000 });
    await lp.waitForFunction(() => document.activeElement?.closest('#add-layer-menu'), null, { timeout: 5000 }).catch(() => {});
    const addMenu = await lp.evaluate(() => {
      const m = document.getElementById('add-layer-menu');
      const icon = (c) => (c.querySelector('.menu-icon svg')?.getAttribute('class') ?? '').replace('icon icon-', '');
      return { parts: [...m.querySelectorAll(':scope > .menu-item, :scope > .menu-divider, :scope > .menu-group > .menu-heading, :scope > .menu-group > .menu-item')].map((c) => c.matches('.menu-divider') ? '—'
        : c.matches('.menu-heading') ? `# ${c.textContent}` : `${icon(c)}: ${c.querySelector('.menu-label').textContent} (${c.querySelector('.menu-desc')?.textContent ?? ''})`), focus: document.activeElement?.querySelector?.('.menu-label')?.textContent ?? null };
    });
    await menuRow(lp, 'add-layer-menu', 'Halftone dots').click();
    const added = await layersNow();
    const addedLayer = await lp.evaluate(() => { const l = window.__vfx.app.layer(); return { type: l?.type, kind: l?.shape?.kind, name: l?.name }; });
    await lp.keyboard.press('Control+z');
    // Undo took the selected layer away: select the glow again.
    await lp.evaluate(() => window.__vfx.app.selectLayer('emitter_glow'));
    const shapeParts = info.SHAPE_KINDS.map((k) => `shape-${k}: ${info.SHAPE_TEXT[k].charAt(0).toUpperCase()}${info.SHAPE_TEXT[k].slice(1)} (${k})`);
    ok('the Layers header\'s + opens the add menu: Sprite (an image), Projectile (a path in flight), under "Shapes" the 14 kinds with their icons, plain names and the names in the file, then Burst and Word',
      JSON.stringify(addMenu.parts) === JSON.stringify(['sprite: Sprite (an image)', 'projectile: Projectile (a path in flight)', '—', '# Shapes', ...shapeParts, '—', 'burst: Burst (pieces thrown out)', 'word: Word (a comic sound)'])
        && addMenu.focus === 'Sprite', JSON.stringify(addMenu));
    ok('a layer added from the menu goes above the selected one, and is selected', added.n === start.n + 1 && added.sel === 'dots' && added.order.indexOf('dots') === start.order.indexOf('emitter_glow')
      && added.order.indexOf('emitter_glow') === start.order.indexOf('emitter_glow') + 1 && addedLayer.type === 'shape' && addedLayer.kind === 'dots' && added.undo === 'Add shape' && added.count === String(start.n + 1),
      JSON.stringify({ added: { n: added.n, sel: added.sel, at: added.order.indexOf('dots') }, was: start.order.indexOf('emitter_glow'), addedLayer, undo: added.undo }));

    // A menu taller than the window (here the add menu, in a window 480 px tall; Move to folder… in a project with many
    // folders) stays inside the window and scrolls, and the row that takes the focus is scrolled into view (End, Home).
    await lp.setViewportSize({ width: 1920, height: 480 });
    await lp.click('.layers-section .add-layer');
    await lp.waitForSelector('#add-layer-menu:popover-open', { timeout: 5000 });
    await lp.waitForFunction(() => document.activeElement?.closest('#add-layer-menu'), null, { timeout: 5000 }).catch(() => {});
    /** The open add menu against the window, and its row with the focus against the menu. */
    const tallMenu = () => lp.evaluate(() => {
      const m = document.getElementById('add-layer-menu'), r = m.getBoundingClientRect(), f = document.activeElement, fr = f.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), win: innerHeight, scrolls: m.scrollHeight > m.clientHeight + 1,
        focus: f.closest('#add-layer-menu') ? f.querySelector('.menu-label')?.textContent ?? null : null, shown: fr.top >= r.top - 1 && fr.bottom <= r.bottom + 1 };
    });
    const tallStart = await tallMenu();
    await lp.keyboard.press('End');
    const tallEnd = await tallMenu();
    await lp.keyboard.press('Home');
    const tallHome = await tallMenu();
    await lp.keyboard.press('Escape');
    await lp.setViewportSize({ width: 1920, height: 1080 });
    ok('a menu taller than the window (the add menu, in a window 480 px tall) stays inside it and scrolls, and the row that takes the focus is scrolled into view (End, Home)',
      tallStart.top >= 0 && tallStart.bottom <= tallStart.win && tallStart.scrolls && tallEnd.focus === 'Word' && tallEnd.shown && tallHome.focus === 'Sprite' && tallHome.shown,
      JSON.stringify({ tallStart, tallEnd, tallHome }));

    // A row's buttons take its tag's place on hover and on the selected row (the tag stays in the page, hidden); its menu
    // opens from More, and from a right-click; Move up and Move down move it by one place, each one undo step.
    const rowState = (id) => lp.evaluate((id) => {
      const r = document.querySelector(`.layers-list .layer-item[data-layer="${id}"]`), code = r.querySelector(':scope > code');
      return { tools: [...r.querySelectorAll('.item-tools button')].filter((b) => b.getClientRects().length).map((b) => b.getAttribute('aria-label').split(':')[0]), tag: getComputedStyle(code).display, tagText: code.textContent,
        span: r.querySelector(':scope > span')?.textContent, glyph: !!r.querySelector(':scope > svg, :scope > img'), h: Math.round(r.getBoundingClientRect().height) };
    }, id);
    const restRow = await rowState('beads');
    const selRow = await rowState('emitter_glow');
    await layerRowOf('beads').hover();
    const hoverRow = await rowState('beads');
    const tips = await lp.evaluate(() => {
      const r = document.querySelector('.layers-list .layer-item[data-layer="beads"]');
      return [...r.querySelectorAll('.item-tools button')].map((b) => window.__vfx.app.tipForChecks(b));
    });
    await layerRowOf('beads').locator('.item-tools button.more').click();
    await lp.waitForSelector('#layer-menu:popover-open', { timeout: 5000 });
    const layerMoreOpen = { ...(await openLook(lp, layerRowOf('beads').locator('.item-tools button.more'), 'layer-menu')), row: await rowState('beads') };
    const layerMenu = await lp.evaluate(() => [...document.getElementById('layer-menu').children].map((c) => c.matches('.menu-divider') ? '—' : `${c.querySelector('.menu-label').textContent}(${c.querySelector('.menu-key')?.textContent ?? ''})${c.disabled ? ' off' : ''}`));
    await menuRow(lp, 'layer-menu', 'Move up').click();
    const menuUp = await layersNow();
    await lp.keyboard.press('Control+z');
    await layerRowOf('beads').hover();
    await layerRowOf('beads').locator('.item-tools button', { hasText: '' }).first().click();
    const buttonUp = await layersNow();
    await lp.keyboard.press('Control+z');
    await layerRowOf('beads').hover();
    await layerRowOf('beads').locator('.item-tools button').nth(1).click();
    const buttonDown = await layersNow();
    await lp.keyboard.press('Control+z');
    const topRow = await lp.evaluate(() => { const r = document.querySelector('.layers-list .layer-item'); return [...r.querySelectorAll('.item-tools button')].map((b) => b.disabled); });
    await layerRowOf('spot_star').scrollIntoViewIfNeeded();
    const starBox = await layerRowOf('spot_star').boundingBox();
    await lp.mouse.click(starBox.x + 50, starBox.y + 14, { button: 'right' });
    await lp.waitForSelector('#layer-menu:popover-open', { timeout: 5000 });
    const rightAt = await lp.evaluate(() => { const r = document.getElementById('layer-menu').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
    await lp.keyboard.press('Escape');
    const beadsAt = start.order.indexOf('beads');
    ok('a layer\'s row is its icon, its name and its tag, 28 px; on hover and on the selected row, Move up, Move down and More take the tag\'s place (the tag is hidden, still in the page)',
      restRow.tools.length === 0 && restRow.tag !== 'none' && restRow.tagText === 'beads' && restRow.span === 'Beads' && restRow.glyph && restRow.h === 28
        && selRow.tools.join() === 'Move up,Move down,More' && selRow.tag === 'none' && hoverRow.tools.join() === 'Move up,Move down,More' && hoverRow.tag === 'none' && hoverRow.tagText === 'beads',
      JSON.stringify({ restRow, selRow, hoverRow }));
    ok('the row\'s buttons are named in their tooltips with their help texts and keys: Move up (Ctrl+]), Move down (Ctrl+[), More',
      tips[0]?.lines[0] === 'Move up' && tips[0]?.lines[1] === help.helpFor('Move up', { section: 'Layers' }) && tips[0]?.key === 'Ctrl+]'
        && tips[1]?.lines[0] === 'Move down' && tips[1]?.key === 'Ctrl+[' && tips[2]?.lines[0] === 'More' && tips[2]?.lines[1] === help.helpFor('More', { section: 'Layers' }),
      JSON.stringify(tips));
    ok('while a layer\'s menu is open, its row keeps Move up, Move down and More in the tag\'s place (the pointer gone into the menu), and More looks open',
      layerMoreOpen.shown && layerMoreOpen.expanded === 'true' && layerMoreOpen.icon && layerMoreOpen.field && layerMoreOpen.row.tools.join() === 'Move up,Move down,More' && layerMoreOpen.row.tag === 'none',
      JSON.stringify(layerMoreOpen));
    ok('the row\'s menu (More, or a right-click at the pointer): Rename (F2), Duplicate (Ctrl+D), Move up (Ctrl+]), Move down (Ctrl+[), Delete (Del); Move up there, and the row\'s Move up and Move down buttons, move it one place, each one undo step; at the top, Move up is off',
      layerMenu.join('|') === 'Rename(F2)|Duplicate(Ctrl+D)|Move up(Ctrl+])|Move down(Ctrl+[)|—|Delete(Del)' && menuUp.order.indexOf('beads') === beadsAt - 1 && menuUp.undo === 'Move layer'
        && buttonUp.order.indexOf('beads') === beadsAt - 1 && buttonDown.order.indexOf('beads') === beadsAt + 1 && buttonDown.undo === 'Move layer' && topRow[0] === true && topRow[1] === false
        && rightAt[0] === Math.round(starBox.x + 50) && rightAt[1] === Math.round(starBox.y + 14), JSON.stringify({ layerMenu, menuUp: menuUp.order.indexOf('beads'), buttonUp: buttonUp.order.indexOf('beads'), buttonDown: buttonDown.order.indexOf('beads'), beadsAt, topRow, rightAt }));

    // Duplicate (the menu, and Ctrl+D) puts a copy just above and selects it; Delete (the menu, and the Delete key) asks
    // nothing, as before, and undo brings it back. Each is one undo step.
    await layerRowOf('beads').hover();
    await layerRowOf('beads').locator('.item-tools button.more').click();
    await menuRow(lp, 'layer-menu', 'Duplicate').click();
    const dup = await layersNow();
    await lp.keyboard.press('Control+z');
    await lp.evaluate(() => window.__vfx.app.selectLayer('beads'));
    await lp.keyboard.press('Control+d');
    const dupKey = await layersNow();
    await lp.keyboard.press('Control+z');
    await lp.evaluate(() => window.__vfx.app.selectLayer('beads'));
    await layerRowOf('lock_ring').hover();
    await layerRowOf('lock_ring').locator('.item-tools button.more').click();
    await menuRow(lp, 'layer-menu', 'Delete').click();
    const del = await layersNow();
    await lp.keyboard.press('Control+z');
    const delBack = await layersNow();
    ok('Duplicate in a layer\'s menu, and Ctrl+D on the selected layer, put a copy just above it and select it; Delete in the menu deletes the layer (the selection stays), and undo brings it back',
      dup.sel === 'beads_2' && dup.order.indexOf('beads_2') === dup.order.indexOf('beads') - 1 && dup.undo === 'Duplicate layer' && dupKey.sel === 'beads_2' && dupKey.n === start.n + 1
        && !del.order.includes('lock_ring') && del.sel === 'beads' && del.undo === 'Delete layer' && delBack.order.includes('lock_ring') && delBack.n === start.n,
      JSON.stringify({ dup: [dup.sel, dup.undo], dupKey: [dupKey.sel, dupKey.n], del: [del.sel, del.undo, del.order.includes('lock_ring')], delBack: delBack.n }));

    // Renaming in place: a double-click on the name, F2 on the selected layer, the menu's Rename. Enter keeps the new name in
    // one undo step, Esc keeps the old one; inside the box Space, Delete, Backspace, ← and → only type (no play, no deleted
    // layer, no step), and its Esc leaves the layer selected.
    await layerRowOf('spot_star').dblclick();
    const dbl = await layersNow();
    await lp.keyboard.type('Star');
    await lp.keyboard.press('Enter');
    const renamed = await lp.evaluate(() => ({ name: window.__vfx.app.effect().layers.find((l) => l.id === 'spot_star').name, undo: window.__vfx.app.history.undoLabel, focus: document.activeElement?.className }));
    await lp.keyboard.press('Control+z');
    await lp.keyboard.press('F2');
    const f2 = await layersNow();
    await lp.keyboard.press('End');
    for (const k of ['Space', 'ArrowLeft', 'ArrowLeft', 'Delete', 'ArrowRight', 'Backspace']) await lp.keyboard.press(k);
    const inBox = await layersNow();
    await lp.keyboard.press('Escape');
    const boxEsc = await layersNow();
    const keptName = await lp.evaluate(() => window.__vfx.app.layer()?.name);
    ok('a double-click on a layer\'s name renames it in place: Enter keeps the new name in one undo step; F2 renames the selected layer',
      dbl.renaming === 'Hot spot star' && dbl.focus === 'rename' && dbl.sel === 'spot_star' && renamed.name === 'Star' && renamed.undo === 'Rename layer' && renamed.focus === 'item-main'
        && f2.renaming === 'Hot spot star' && f2.focus === 'rename', JSON.stringify({ dbl: [dbl.renaming, dbl.focus, dbl.sel], renamed, f2: [f2.renaming, f2.focus] }));
    ok('inside a layer\'s rename box Space, Delete, Backspace, ← and → only type (no play, no deleted layer, no step); Esc keeps the old name, and the layer stays selected',
      inBox.renaming === 'Hot spot sta' && !inBox.playing && inBox.time === f2.time && inBox.n === start.n && inBox.sel === 'spot_star' && boxEsc.renaming === null && boxEsc.sel === 'spot_star' && keptName === 'Hot spot star',
      JSON.stringify({ inBox: [inBox.renaming, inBox.playing, inBox.time, inBox.n, inBox.sel], boxEsc: [boxEsc.renaming, boxEsc.sel], keptName }));

    // A click on another row's More while a rename box is open: the click keeps the name typed (the list is built again for
    // it), and the menu still opens below that row's More, not in the window's corner; Esc gives the focus back to that More.
    await lp.keyboard.press('F2');
    await lp.keyboard.type('Star 2');
    await layerRowOf('beads').hover();
    const beadsMore = await layerRowOf('beads').locator('.item-tools button.more').boundingBox();
    await layerRowOf('beads').locator('.item-tools button.more').click();
    await lp.waitForSelector('#layer-menu:popover-open', { timeout: 5000 });
    const midLayer = await lp.evaluate(() => {
      const r = document.getElementById('layer-menu').getBoundingClientRect(), b = document.querySelector('.layers-list .layer-item[data-layer="beads"] .item-tools button.more');
      return { x: Math.round(r.left), y: Math.round(r.top), bottom: Math.round(r.bottom), expanded: b?.getAttribute('aria-expanded') ?? null, shown: !!b && b.getClientRects().length > 0,
        name: window.__vfx.app.effect().layers.find((l) => l.id === 'spot_star').name, undo: window.__vfx.app.history.undoLabel };
    });
    await lp.keyboard.press('Escape');
    const midLayerBack = await lp.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
    await lp.keyboard.press('Control+z');
    const midLayerUndone = await lp.evaluate(() => window.__vfx.app.effect().layers.find((l) => l.id === 'spot_star').name);
    ok('a click on another layer\'s More while a rename box is open keeps the name typed, in one undo step, and opens that row\'s menu below its More (not in the window\'s corner); Esc gives the focus back to that More',
      midLayer.name === 'Star 2' && midLayer.undo === 'Rename layer' && Math.abs(midLayer.x - Math.round(beadsMore.x)) <= 1
        && (Math.abs(midLayer.y - (beadsMore.y + beadsMore.height + 4)) <= 1 || Math.abs(midLayer.bottom - (beadsMore.y - 4)) <= 1)
        && midLayer.expanded === 'true' && midLayer.shown && midLayerBack === 'More: Beads' && midLayerUndone === 'Hot spot star',
      JSON.stringify({ midLayer, beadsMore, midLayerBack, midLayerUndone }));

    // Drag to reorder: a press that moves less than 4 px is a click (it selects); a drag shows a 2 px --accent-ink line where
    // the row will land and moves it there in one moveLayer, one undo step, however far; Esc cancels a drag, nothing moves,
    // and the layer stays selected.
    await lp.evaluate(() => window.__vfx.app.selectLayer('emitter_glow'));
    const box = async (id) => { await layerRowOf(id).scrollIntoViewIfNeeded(); return layerRowOf(id).boundingBox(); };
    const b1 = await box('beam_core');
    await lp.mouse.move(b1.x + 70, b1.y + 14);
    await lp.mouse.down();
    await lp.mouse.move(b1.x + 72, b1.y + 15, { steps: 2 });
    await lp.mouse.up();
    const click = await layersNow();
    const before = await layersNow();
    const from = await box('emitter_hot');
    const to = await box('spot_glow_wide');
    await lp.mouse.move(from.x + 70, from.y + 14);
    await lp.mouse.down();
    await lp.mouse.move(from.x + 70, to.y + to.height - 4, { steps: 10 });
    const line = await lp.evaluate(() => {
      const l = document.querySelector('.layers-list .drop-line'), probe = document.createElement('span');
      probe.style.color = 'var(--accent-ink)';
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      if (!l) return null;
      const r = l.getBoundingClientRect(), next = document.querySelector('.layers-list .layer-item[data-layer="beads"]').getBoundingClientRect();
      return { h: Math.round(r.height), colour: getComputedStyle(l).backgroundColor === accent, at: Math.round(r.top + r.height / 2) === Math.round(next.top), width: Math.round(r.width) };
    });
    await lp.mouse.up();
    const dropped = await layersNow();
    await lp.keyboard.press('Control+z');
    const dropUndone = await layersNow();
    const c1 = await box('emitter_white');
    const c2 = await box('beads');
    await lp.mouse.move(c1.x + 70, c1.y + 14);
    await lp.mouse.down();
    await lp.mouse.move(c1.x + 70, c2.y + 20, { steps: 8 });
    await lp.keyboard.press('Escape');
    const lineAfterEsc = await lp.evaluate(() => !!document.querySelector('.layers-list .drop-line'));
    await lp.mouse.up();
    const cancelled = await layersNow();
    const want = [...before.order];
    want.splice(want.indexOf('emitter_hot'), 1);
    want.splice(want.indexOf('spot_glow_wide') + 1, 0, 'emitter_hot');
    ok('a press on a layer\'s row that moves less than 4 px is a click: it selects the layer', click.sel === 'beam_core', JSON.stringify({ sel: click.sel }));
    ok('dragging a layer\'s row shows a 2 px line in --accent-ink where it will land, and moves it there, five places, in one undo step',
      !!line && line.h === 2 && line.colour && line.at && JSON.stringify(dropped.order) === JSON.stringify(want) && dropped.undo === 'Move layer' && JSON.stringify(dropUndone.order) === JSON.stringify(before.order),
      JSON.stringify({ line, dropped: dropped.order, undo: dropped.undo, undone: dropUndone.order.join() === before.order.join() }));
    ok('Esc during a drag cancels it: the line goes, nothing moves, and the layer stays selected', !lineAfterEsc && JSON.stringify(cancelled.order) === JSON.stringify(before.order) && cancelled.sel === 'beam_core' && cancelled.undo === before.undo,
      JSON.stringify({ lineAfterEsc, sel: cancelled.sel, same: cancelled.order.join() === before.order.join() }));
    // Esc during a drag, then the pointer back over the row the drag started on and let go there: that is not a click on the
    // row (it would select it), and the next real click selects as usual.
    const w1 = await box('emitter_white');
    await lp.mouse.move(w1.x + 70, w1.y + 14);
    await lp.mouse.down();
    await lp.mouse.move(w1.x + 70, w1.y + 70, { steps: 8 });
    await lp.keyboard.press('Escape');
    await lp.mouse.move(w1.x + 70, w1.y + 14, { steps: 4 });
    await lp.mouse.up();
    const escRelease = await layersNow();
    await layerRowOf('emitter_white').click();
    const clickAfter = await layersNow();
    ok('after Esc cancels a drag, letting go over the row it started on is not a click: the selected layer stays, and the next click selects as usual',
      escRelease.sel === 'beam_core' && JSON.stringify(escRelease.order) === JSON.stringify(before.order) && escRelease.undo === before.undo && clickAfter.sel === 'emitter_white',
      JSON.stringify({ escRelease: escRelease.sel, same: escRelease.order.join() === before.order.join(), clickAfter: clickAfter.sel }));

    // The keys: Ctrl+] and Ctrl+[ move the selected layer up and down the list, each one undo step; none of F2, Ctrl+D,
    // Ctrl+] and Ctrl+[ does anything while typing in a field (the search box) or with a menu open.
    await lp.evaluate(() => window.__vfx.app.selectLayer('beads'));
    const k0 = await layersNow();
    await lp.keyboard.press('Control+BracketRight');
    const kUp = await layersNow();
    await lp.keyboard.press('Control+z');
    await lp.keyboard.press('Control+BracketLeft');
    const kDown = await layersNow();
    await lp.keyboard.press('Control+z');
    await lp.keyboard.press('/');
    for (const k of ['F2', 'Control+d', 'Control+BracketRight', 'Control+BracketLeft']) await lp.keyboard.press(k);
    const kTyping = await layersNow();
    await lp.keyboard.press('Escape');
    await layerRowOf('beads').locator('.item-tools button.more').click();
    await lp.waitForSelector('#layer-menu:popover-open', { timeout: 5000 });
    await lp.waitForFunction(() => document.activeElement?.closest('#layer-menu'), null, { timeout: 5000 }).catch(() => {});
    for (const k of ['F2', 'Control+d', 'Control+BracketRight', 'Control+BracketLeft']) await lp.keyboard.press(k);
    const kMenu = await layersNow();
    const menuOpen = await lp.evaluate(() => document.getElementById('layer-menu').matches(':popover-open'));
    await lp.keyboard.press('Escape');
    // Esc closes only the menu; the next Esc, with nothing going on, leaves the layer.
    const menuEsc = { ...(await layersNow()), open: await lp.evaluate(() => document.getElementById('layer-menu').matches(':popover-open')) };
    await lp.keyboard.press('Escape');
    const secondEsc = await layersNow();
    ok('Esc in a layer\'s menu closes only the menu, and the layer stays selected; the next Esc leaves the layer',
      !menuEsc.open && menuEsc.sel === 'beads' && secondEsc.sel === null, JSON.stringify({ menuEsc: [menuEsc.open, menuEsc.sel], second: secondEsc.sel }));
    await lp.evaluate(() => window.__vfx.app.selectLayer('beads'));
    const at = k0.order.indexOf('beads');
    ok('Ctrl+] and Ctrl+[ move the selected layer up and down the list, each one undo step', kUp.order.indexOf('beads') === at - 1 && kUp.undo === 'Move layer' && kDown.order.indexOf('beads') === at + 1 && kDown.sel === 'beads',
      JSON.stringify({ at, up: kUp.order.indexOf('beads'), down: kDown.order.indexOf('beads') }));
    ok('F2, Ctrl+D, Ctrl+] and Ctrl+[ do nothing while typing in a field or with a menu open', JSON.stringify(kTyping.order) === JSON.stringify(k0.order) && kTyping.renaming === null && kTyping.focus === 'search'
      && JSON.stringify(kMenu.order) === JSON.stringify(k0.order) && kMenu.renaming === null && kMenu.focus === 'menu' && menuOpen, JSON.stringify({ kTyping: [kTyping.n, kTyping.focus], kMenu: [kMenu.n, kMenu.focus, menuOpen] }));

    // Hovering a row highlights the same row on the timeline, and the other way round; a new selection scrolls into view in
    // both, as little as needed, and nothing round the lists moves.
    const lit = (sel) => lp.evaluate((sel) => { const r = document.querySelector(sel); const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--bg-hover)'; document.body.append(probe); const want = getComputedStyle(probe).backgroundColor; probe.remove(); return { hovered: r.classList.contains('hovered'), bg: getComputedStyle(r).backgroundColor === want }; }, sel);
    await lp.evaluate(() => window.__vfx.app.selectLayer('emitter_white'));
    // (After each hover, the 120 ms colour change has ended.)
    await layerRowOf('beam_glow').hover();
    await lp.waitForTimeout(250);
    const listToTimeline = await lit('.timeline .tl-row[data-layer="beam_glow"]');
    await lp.locator('.timeline .tl-row[data-layer="emitter_hot"] .tl-name').hover();
    await lp.waitForTimeout(250);
    const timelineToList = await lit('.layers-list .layer-item[data-layer="emitter_hot"]');
    await lp.mouse.move(900, 300);
    const afterLeave = await lp.evaluate(() => document.querySelectorAll('.layers-list .hovered, .timeline .hovered').length);
    ok('hovering a layer\'s row highlights the same row on the timeline, and hovering a timeline row highlights it in the Layers list',
      listToTimeline.hovered && listToTimeline.bg && timelineToList.hovered && timelineToList.bg && afterLeave === 0, JSON.stringify({ listToTimeline, timelineToList, afterLeave }));
    await lp.locator('.split-effects').focus();
    await lp.keyboard.press('End');
    await lp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const inView = (listSel, rowSel) => lp.evaluate(([listSel, rowSel]) => { const l = document.querySelector(listSel).getBoundingClientRect(), r = document.querySelector(rowSel).getBoundingClientRect(); return r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5; }, [listSel, rowSel]);
    const lastBefore = await inView('.layers-list', '.layers-list .layer-item[data-layer="ground_glow_target"]');
    await lp.locator('.timeline .tl-row[data-layer="ground_glow_target"] .tl-name').scrollIntoViewIfNeeded();
    await lp.locator('.timeline .tl-row[data-layer="ground_glow_target"] .tl-name').click();
    const listScrolled = await inView('.layers-list', '.layers-list .layer-item[data-layer="ground_glow_target"]');
    await lp.evaluate(() => { document.querySelector('.timeline-slot').scrollTop = 0; });
    const tlBefore = await inView('.timeline-slot', '.timeline .tl-row[data-layer="ground_glow_target"]');
    await lp.evaluate(() => window.__vfx.app.selectLayer('emitter_white'));
    await layerRowOf('lock_ring').scrollIntoViewIfNeeded();
    await layerRowOf('lock_ring').click();
    const tlScrolled = await inView('.timeline-slot', '.timeline .tl-row[data-layer="lock_ring"]');
    const still = await lp.evaluate(() => ({ left: document.querySelector('.left').scrollTop, app: document.querySelector('#app').scrollTop, doc: document.scrollingElement.scrollTop, effects: document.querySelector('.effects-section').scrollTop }));
    ok('a new selection scrolls into view, as little as needed, in the Layers list (picked on the timeline) and on the timeline (picked in the list); nothing round the lists scrolls',
      !lastBefore && listScrolled && !tlBefore && tlScrolled && still.left === 0 && still.app === 0 && still.doc === 0 && still.effects === 0, JSON.stringify({ lastBefore, listScrolled, tlBefore, tlScrolled, still }));
    // A layer moved by Ctrl+[ from the last row that shows stays in view in both places (it went under the timeline's sticky
    // ruler, or out of the Layers list).
    const edgeRow = await lp.evaluate(() => {
      const slot = document.querySelector('.timeline-slot');
      slot.scrollTop = 0;
      const s = slot.getBoundingClientRect(), rows = [...slot.querySelectorAll('.tl-row')];
      let last = null;
      rows.forEach((r, i) => { if (r.getBoundingClientRect().bottom <= s.bottom + 0.5 && i < rows.length - 1) last = r.dataset.layer; });
      return last;
    });
    const rowIndex = (id) => lp.evaluate((i) => [...document.querySelectorAll('.timeline .tl-row')].findIndex((r) => r.dataset.layer === i), edgeRow);
    await lp.evaluate((id) => window.__vfx.app.selectLayer(id), edgeRow);
    await lp.evaluate(() => document.activeElement?.blur?.());
    const edgeBefore = await rowIndex(edgeRow);
    await lp.keyboard.press('Control+BracketLeft');
    await lp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const movedEdge = await lp.evaluate((id) => {
      const slot = document.querySelector('.timeline-slot'), s = slot.getBoundingClientRect(), top = document.querySelector('.timeline .tl-top')?.getBoundingClientRect();
      const t = slot.querySelector(`.tl-row[data-layer="${id}"]`).getBoundingClientRect();
      const list = document.querySelector('.layers-list'), l = list.getBoundingClientRect(), r = list.querySelector(`.layer-item[data-layer="${id}"]`).getBoundingClientRect();
      return { timeline: t.top >= (top ? top.bottom : s.top) - 0.5 && t.bottom <= s.bottom + 0.5, list: r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5, undo: window.__vfx.app.history.undoLabel };
    }, edgeRow);
    const edgeAfter = await rowIndex(edgeRow);
    await lp.keyboard.press('Control+z');
    ok('a layer moved by Ctrl+[ from the last row that shows stays in view on the timeline (below its sticky ruler) and in the Layers list',
      !!edgeRow && edgeAfter === edgeBefore + 1 && movedEdge.undo === 'Move layer' && movedEdge.timeline && movedEdge.list, JSON.stringify({ edgeRow, edgeBefore, edgeAfter, movedEdge }));
    await lp.locator('.split-effects').dblclick();

    // Empty: a new effect has no layers: "No layers yet." and an "Add a layer" button, which opens the add menu.
    await addEffectMenu(lp, 'New effect');
    const empty = await lp.evaluate(() => ({ text: document.querySelector('.layers-list .list-empty p')?.textContent ?? null, button: document.querySelector('.layers-list .list-empty button')?.textContent ?? null,
      count: document.querySelector('.layers-section .list-count')?.textContent }));
    await lp.locator('.layers-list .list-empty button').click();
    await lp.waitForSelector('#add-layer-menu:popover-open', { timeout: 5000 });
    await menuRow(lp, 'add-layer-menu', 'Sprite').click();
    const fromEmpty = await layersNow();
    await lp.keyboard.press('Control+z');
    await lp.keyboard.press('Control+z');
    ok('an effect with no layers says "No layers yet." with an "Add a layer" button, which opens the add menu (a sprite added from it is selected)',
      empty.text === 'No layers yet.' && empty.button === 'Add a layer' && empty.count === '0' && fromEmpty.n === 1 && fromEmpty.sel === fromEmpty.order[0], JSON.stringify({ empty, fromEmpty: [fromEmpty.n, fromEmpty.sel] }));

    // A right-click menu opened while nothing had the keyboard focus: Esc closes it, and the focus leaves the menu at once,
    // so a key pressed right after (Space) can't reach a hidden row of it (it opened a rename box for the layer).
    // The right-click is the contextmenu event alone, so it gives nothing the focus (a press on the row would focus it).
    await lp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); a.selectLayer(null); });
    const rightClickUnfocused = () => lp.evaluate(() => {
      document.activeElement?.blur?.();
      const row = document.querySelector('.layers-list .layer-item[data-layer="tracer"]'), r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 50, clientY: r.top + 14, button: 2, buttons: 0 }));
      return document.activeElement === document.body || document.activeElement?.closest?.('#layer-menu') != null;
    });
    const unfocused1 = await rightClickUnfocused();
    await lp.waitForSelector('#layer-menu:popover-open', { timeout: 5000 });
    const escNow = await lp.evaluate(() => {
      const m = document.getElementById('layer-menu'), before = document.activeElement;
      (before ?? m).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const f = document.activeElement;
      return { wasIn: !!before?.closest?.('#layer-menu'), open: m.matches(':popover-open'), inMenu: !!f?.closest?.('#layer-menu') };
    });
    const unfocused2 = await rightClickUnfocused();
    await lp.waitForSelector('#layer-menu:popover-open', { timeout: 5000 });
    await lp.keyboard.press('Escape');
    await lp.keyboard.press(' ');
    const spaceAfter = await lp.evaluate(() => ({ rename: !!document.querySelector('.layers-list input.rename'), inMenu: !!document.activeElement?.closest?.('.menu'), open: document.getElementById('layer-menu').matches(':popover-open') }));
    await lp.evaluate(async () => { window.__vfxManual = true; await window.__vfx.app.showAt(250, 7); document.querySelector('.status')?.classList.remove('show'); });
    ok('a right-click menu opened while nothing had the focus lets go of the focus as Esc closes it, so Space pressed right after opens no rename box',
      unfocused1 && unfocused2 && escNow.wasIn && !escNow.open && !escNow.inMenu && !spaceAfter.rename && !spaceAfter.inMenu && !spaceAfter.open, JSON.stringify({ unfocused1, unfocused2, escNow, spaceAfter }));
    // On hover the row's buttons take the tag's place, so a rider says what it rides in the row's own tooltip.
    await lp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); a.selectLayer(null); });
    await lp.mouse.move(900, 300);
    await lp.waitForTimeout(700);
    const tracer = layerRowOf('tracer');
    const tb = await tracer.boundingBox();
    await lp.mouse.move(tb.x + 60, tb.y + 14);
    const tipText = await lp.waitForFunction(() => (document.querySelector('.tooltip')?.matches(':popover-open') ? document.querySelector('.tooltip .tip-first > span')?.textContent : null), null, { timeout: 5000 }).then((x) => x.jsonValue(), () => null);
    ok('a rider\'s row says what it rides in its own tooltip on hover ("Tracer: rides Bullet"), where its buttons take the tag\'s place', tipText === 'Tracer: rides Bullet', String(tipText));
    ok('the Layers list page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
    await lp.close();
  }

  // -- the timeline (docs/ui-redesign.md 6.5): its sizes at 1920 x 1080 and 2560 x 1440 (the names column, the ruler, the
  // phase strip, the rows, the bars); every bar's label in full view in its lane, inside its bar when it fits, else beside
  // it in --text-muted (the Rifle shot's Bullet; a bar near the end of the span), also after a splitter makes the lanes
  // narrower and back; the phases' names inside when they fit, their times in their tooltips, also with no layers; the
  // playhead (its line through the ruler and the lanes, its head, which drags) and no label hidden by it; the ruler and the
  // phase strip at the top while the rows scroll, and a selected row scrolled into view below them; scrubbing, and a click
  // on a bar selecting; the selected row, the hovered one and a row left out of the tier; the edge round a label while a
  // hover fades or the theme changes. On a page of its own: the splitters' sizes are remembered.
  {
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
    const tp = g.page;
    const frames = () => tp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    /** Show an effect paused at a moment, with a layer selected or none. */
    const showTl = (effect, ms, layer = null) => tp.evaluate(async ([effect, ms, layer]) => {
      const a = window.__vfx.app;
      window.__vfxManual = true;
      if (a.effect()?.id !== effect) a.pickEffect(effect);
      a.selectLayer(layer);
      await a.showAt(ms, 7);
    }, [effect, ms, layer]);
    const tlSizes = () => tp.evaluate(() => {
      const r = (el) => el.getBoundingClientRect();
      const all = (s) => [...document.querySelectorAll(s)];
      return { name: r(document.querySelector('.timeline .tl-name')).width, ruler: r(document.querySelector('.timeline .tl-ruler')).height, phases: r(document.querySelector('.timeline .tl-phases')).height,
        rows: [...new Set(all('.timeline .tl-row').map((x) => r(x).height))], bars: [...new Set(all('.timeline .tl-bar').map((x) => r(x).height))],
        radius: [...new Set(all('.timeline .tl-bar').map((x) => getComputedStyle(x).borderRadius))], font: getComputedStyle(document.querySelector('.timeline .tl-name span')).fontSize };
    });
    await showTl('board_beam', 1000);
    const z1920 = await tlSizes();
    await tp.setViewportSize({ width: 2560, height: 1440 });
    await frames();
    const z2560 = await tlSizes();
    await tp.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    const sizesRight = (z) => z.ruler === 24 && z.phases === 16 && z.rows.join() === '24' && z.bars.join() === '16' && z.radius.join() === '3px' && z.font === '12px';
    ok('the timeline\'s sizes (6.5): the names column 176 px at 1920 and 200 px at 2560, the ruler 24 px, the phase strip 16 px, rows 24 px, bars 16 px with 3 px corners, names in 12 px',
      z1920.name === 176 && z2560.name === 200 && sizesRight(z1920) && sizesRight(z2560), JSON.stringify({ z1920, z2560 }));

    // Every bar's label: in full view in its lane; inside the bar (its padding on both sides) when it fits there, in
    // --tl-bar-text; else just right of the bar, or left of it, in --text-muted. (A row left out of the tier has its label
    // at 35 %: checked further on.)
    const labelsNow = () => tp.evaluate(() => {
      const probe = (v) => { const s = document.createElement('span'); s.style.color = v; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
      const muted = probe('var(--text-muted)'), ink = probe('var(--tl-bar-text)');
      const pad = parseFloat(getComputedStyle(document.querySelector('.timeline')).getPropertyValue('--tl-label-pad'));
      return [...document.querySelectorAll('.timeline .tl-row')].map((row) => {
        const lane = row.querySelector('.tl-lane').getBoundingClientRect(), bar = row.querySelector('.tl-bar'), b = bar.getBoundingClientRect();
        const label = bar.querySelector('.tl-label'), l = label.getBoundingClientRect();
        const where = l.left >= b.left + 1 + pad - 0.5 && l.right <= b.right - 1 - pad + 0.5 ? 'inside' : l.left >= b.right ? 'right' : l.right <= b.left ? 'left' : 'over';
        const fits = l.width + 2 * (pad + 1) <= b.width;
        const colour = getComputedStyle(label).color;
        return { id: row.dataset.layer, text: label.textContent, fit: bar.dataset.fit, where, fits, w: +l.width.toFixed(1), bar: +b.width.toFixed(1),
          inLane: l.left >= lane.left - 0.5 && l.right <= lane.right + 0.5 && l.top >= lane.top - 0.5 && l.bottom <= lane.bottom + 0.5,
          shown: getComputedStyle(label).visibility === 'visible' && l.width > 0, colourOk: row.classList.contains('off') || colour === (where === 'inside' ? ink : muted) };
      });
    });
    const labelsRight = (list) => list.every((x) => x.inLane && x.shown && x.colourOk && x.where === x.fit && (x.fits ? x.where === 'inside' : x.where === 'right' || x.where === 'left'));
    const labelSweep = async () => {
      const out = {};
      for (const id of ['rifle_shot', 'board_beam', 'board_molotov', 'board_muzzle', 'board_shell', 'shell_flight']) { await showTl(id, 20); out[id] = await labelsNow(); }
      return out;
    };
    const sweep1920 = await labelSweep();
    await tp.setViewportSize({ width: 2560, height: 1440 });
    await frames();
    const sweep2560 = await labelSweep();
    await tp.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    const wrong = (sw) => Object.entries(sw).flatMap(([fx, list]) => list.filter((x) => !labelsRight([x])).map((x) => `${fx}/${x.id} ${JSON.stringify(x)}`));
    const bullet = (sw) => sw.rifle_shot.find((x) => x.id === 'bullet');
    ok('every bar\'s label shows whole in its lane at 1920 and 2560: inside its bar when it fits there, else beside it in --text-muted (the Rifle shot\'s Bullet, "9 ms in the air", right of its bar)',
      wrong(sweep1920).length === 0 && wrong(sweep2560).length === 0 && Object.values(sweep1920).flat().length > 60 && bullet(sweep1920).where === 'right' && bullet(sweep2560).where === 'right'
        && bullet(sweep1920).text === '9 ms in the air' && Object.values(sweep1920).flat().some((x) => x.where === 'inside'),
      `wrong: ${[...wrong(sweep1920), ...wrong(sweep2560)].slice(0, 3).join('; ') || 'none'}; Bullet ${JSON.stringify(bullet(sweep1920))}`);

    // A bar near the end of the span: the Rifle shot's Tracer core made to start at 910 ms and last 15 ms (then undone): the
    // span is then 1000 ms, so the bar ends 75 ms before the lane does. Its label goes beside it, inside the lane, at both
    // sizes.
    await tp.evaluate(async () => {
      const a = window.__vfx.app;
      a.pickEffect('rifle_shot');
      a.selectLayer('tracer_core');
      a.editLayer(['start'], { ms: 910 });
      a.editLayer(['durationMs'], 15);
      a.commit();
      a.selectLayer(null);
      await a.showAt(20, 7);
    });
    const late1920 = (await labelsNow()).find((x) => x.id === 'tracer_core');
    await tp.setViewportSize({ width: 2560, height: 1440 });
    await frames();
    const late2560 = (await labelsNow()).find((x) => x.id === 'tracer_core');
    await tp.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    ok('a short bar near the end of the span (15 ms, ending at 925 of 1000 ms) has its label beside it, whole, inside the lane, at 1920 and 2560',
      labelsRight([late1920, late2560]) && late1920.text === '15 ms' && late1920.where !== 'inside' && late2560.where !== 'inside', JSON.stringify({ late1920, late2560 }));

    // The splitters make the lanes narrower: a label that fitted moves beside its bar, still whole (the Molotov's 250 ms
    // bars). In the narrowest centre (a window 1280 px wide, the sidebars at their widest: 640 px) the late bar's label has
    // no room left on its right and goes left of its bar. A double-click puts the sizes back, and the labels with them.
    const centreOf = async (sel) => { const b = await tp.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const dragSplit = async (sel, dx, dy = 0) => {
      const [x, y] = await centreOf(sel);
      await tp.mouse.move(x, y);
      await tp.mouse.down();
      await tp.mouse.move(x + dx, y + dy, { steps: 6 });
      await tp.mouse.up();
      await frames();
    };
    await dragSplit('.split-left', 300);
    await dragSplit('.split-right', -300);
    await tp.setViewportSize({ width: 1280, height: 1080 });
    await frames();
    const narrowLate = (await labelsNow()).find((x) => x.id === 'tracer_core');
    const narrowest = await tp.evaluate(() => Math.round(document.querySelector('.centre').getBoundingClientRect().width));
    // There, the ruler's labels: one that would run into the "ms" at the ruler's end is hidden (the Molotov's 5000; its 5500
    // sits past the end, where it never showed).
    await showTl('board_molotov', 20);
    const narrowTicks = await tp.evaluate(() => {
      const unit = document.querySelector('.timeline .tl-unit').getBoundingClientRect();
      const ticks = [...document.querySelectorAll('.timeline .tl-tick')].map((t) => ({ text: t.textContent, right: t.querySelector('span').getBoundingClientRect().right, shown: getComputedStyle(t.querySelector('span')).visibility === 'visible' }));
      return { hidden: ticks.filter((t) => !t.shown).map((t) => t.text), clear: ticks.every((t) => !t.shown || t.right <= unit.left - 1) };
    });
    // There, the timeline's header (with New shot each loop since UI phase 6, Part B) keeps one row: the toggle says "New
    // shot" (its full name stays its name for screen readers), Speed's buttons stay on one row, nothing runs past the end.
    const narrowHead = await tp.evaluate(() => {
      const t = document.querySelector('.transport'), r = t.getBoundingClientRect(), b = t.querySelector('button.new-shot');
      const segs = [...t.querySelectorAll('.seggroup .seg')];
      return { h: Math.round(r.height), inside: [...t.querySelectorAll('button, .time')].every((k) => k.getBoundingClientRect().right <= r.right + 0.5),
        speedRows: new Set(segs.map((x) => Math.round(x.getBoundingClientRect().top))).size, shot: b.innerText.trim(), name: b.getAttribute('aria-label'), time: t.querySelector('.time').innerText.trim() };
    });
    await showTl('rifle_shot', 20);
    await tp.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    await showTl('board_molotov', 20);
    const narrowMolotov = await labelsNow();
    const narrowPhases = await tp.evaluate(() => [...document.querySelectorAll('.timeline .tl-phase')].map((p) => ({ name: p.classList[1], fit: p.dataset.fit, visible: getComputedStyle(p.querySelector('span')).visibility === 'visible', tip: window.__vfx.app.tipForChecks(p)?.lines[0] ?? null })));
    const lanes = await tp.evaluate(() => Math.round(document.querySelector('.timeline .tl-lane').getBoundingClientRect().width));
    await tp.locator('.split-left').dblclick();
    await tp.locator('.split-right').dblclick();
    await frames();
    const wideMolotov = await labelsNow();
    // The Tracer core's two edits undone.
    await tp.evaluate(() => document.activeElement?.blur());
    await tp.keyboard.press('Control+z');
    await tp.keyboard.press('Control+z');
    const lateBack = await tp.evaluate(() => { const a = window.__vfx.app; a.pickEffect('rifle_shot'); const l = a.effect().layers.find((x) => x.id === 'tracer_core'); return JSON.stringify([l.start, l.durationMs]); });
    const ign = (list) => list.find((x) => x.id === 'ignition_lines');
    ok('a splitter dragged until a bar\'s label no longer fits: the label moves beside its bar, whole and in --text-muted (Molotov\'s 250 ms bars); with no room on its right it goes left (the late 15 ms bar, in a 640 px centre, where a ruler label that would run into the "ms" is hidden); a double-click on the splitters brings it back inside',
      labelsRight(narrowMolotov) && ign(narrowMolotov).where === 'right' && labelsRight([narrowLate]) && narrowLate.where === 'left' && labelsRight(wideMolotov) && ign(wideMolotov).where === 'inside'
        && narrowest === 640 && narrowTicks.clear && narrowTicks.hidden.join() === '5000,5500' && lateBack === '[{"ms":0},80]',
      JSON.stringify({ lanes, narrowest, narrow: ign(narrowMolotov), late: narrowLate, ticks: narrowTicks, wide: ign(wideMolotov), lateBack }));
    ok('in the narrowest centre (640 px) the timeline\'s header keeps one 32 px row: New shot each loop says "New shot" (its full name for screen readers), Speed\'s buttons stay on one row, and nothing runs past its end (the Molotov\'s four-figure time too)',
      narrowHead.h === 32 && narrowHead.inside && narrowHead.speedRows === 1 && narrowHead.shot === 'New shot' && narrowHead.name === 'New shot each loop' && /\/ 5050 ms/.test(narrowHead.time),
      JSON.stringify(narrowHead));

    // The phases: each name inside its phase when it fits (Hammer leech beam), hidden when it does not (the Molotov's
    // 250 ms wind-up in the narrow lanes); the times in the tooltip either way.
    await showTl('board_beam', 1000);
    const beamPhases = await tp.evaluate(() => [...document.querySelectorAll('.timeline .tl-phase')].map((p) => {
      const b = p.getBoundingClientRect(), s = p.querySelector('span').getBoundingClientRect();
      return { name: p.classList[1], text: p.querySelector('span').textContent, fit: p.dataset.fit, visible: getComputedStyle(p.querySelector('span')).visibility === 'visible',
        inside: s.left >= b.left + 3.5 && s.right <= b.right - 3.5, size: getComputedStyle(p.querySelector('span')).fontSize, tip: window.__vfx.app.tipForChecks(p)?.lines[0] ?? null };
    }));
    ok('the phase strip: each phase\'s name inside it in 11 px when it fits (Hammer leech beam), hidden when it does not (the Molotov\'s 250 ms wind-up, lanes made narrow); its times in its tooltip ("wind-up: 0–350 ms")',
      beamPhases.length === 3 && beamPhases.every((p) => p.fit === 'yes' && p.visible && p.inside && p.size === '11px') && beamPhases.map((p) => p.tip).join(' | ') === 'wind-up: 0–350 ms | peak: 350–2850 ms | fade: 2850–3150 ms'
        && narrowPhases[0].name === 'windup' && narrowPhases[0].fit === 'no' && !narrowPhases[0].visible && narrowPhases[0].tip === 'wind-up: 0–250 ms' && narrowPhases.slice(1).every((p) => p.fit === 'yes' && p.visible),
      JSON.stringify({ beamPhases, narrowPhases }));
    // An effect with phases and no layers: the phases' names and the ruler's labels are measured all the same. The Hammer
    // leech beam with a 40 ms wind-up (15 px wide) and every layer deleted, then all of it undone: the wind-up's name is
    // hidden, not cut, and no ruler label runs into the "ms" (the 3000).
    await showTl('board_beam', 1000);
    await tp.evaluate(() => { const a = window.__vfx.app; a.editEffect(['phases', 'windupMs'], 40); a.commit(); });
    const beamLayers = await tp.evaluate(() => window.__vfx.app.effect().layers.length);
    for (let i = 0; i < beamLayers; i++) {
      await tp.evaluate(() => { const a = window.__vfx.app; a.selectLayer(a.effect().layers[0].id); document.activeElement?.blur(); });
      await tp.keyboard.press('Delete');
    }
    await showTl('board_beam', 20);
    const bare = await tp.evaluate(() => {
      const unit = document.querySelector('.timeline .tl-unit').getBoundingClientRect();
      const shown = (s) => getComputedStyle(s).visibility === 'visible';
      return {
        rows: document.querySelectorAll('.timeline .tl-row').length,
        phases: [...document.querySelectorAll('.timeline .tl-phase')].map((p) => {
          const b = p.getBoundingClientRect(), s = p.querySelector('span'), r = s.getBoundingClientRect();
          return { name: p.classList[1], fit: p.dataset.fit ?? null, shown: shown(s), whole: !shown(s) || (r.left >= b.left - 0.5 && r.right <= b.right + 0.5) };
        }),
        ticks: [...document.querySelectorAll('.timeline .tl-tick')].map((t) => {
          const s = t.querySelector('span');
          return { text: t.textContent, fit: t.dataset.fit ?? null, clear: !shown(s) || s.getBoundingClientRect().right <= unit.left - 1 };
        }),
      };
    });
    await tp.evaluate(() => document.activeElement?.blur());
    for (let i = 0; i <= beamLayers; i++) await tp.keyboard.press('Control+z');
    const beamBack = await tp.evaluate(() => { const fx = window.__vfx.app.effect(); return `${fx.layers.length} layers, wind-up ${fx.phases.windupMs} ms`; });
    ok('an effect with phases and no layers: its phases\' names and the ruler\'s labels are still measured (the Hammer leech beam with a 40 ms wind-up and every layer deleted): the wind-up\'s name is hidden, not cut, and no ruler label runs into the "ms"',
      bare.rows === 0 && bare.phases.length === 3 && bare.phases.every((p) => p.fit !== null && p.whole) && bare.phases[0].name === 'windup' && bare.phases[0].fit === 'no' && !bare.phases[0].shown
        && bare.ticks.length > 3 && bare.ticks.every((t) => t.fit !== null && t.clear) && beamBack === '16 layers, wind-up 350 ms',
      JSON.stringify({ bare, beamBack }));
    // The playhead (6.5): a 2 px line in --accent-ink through the ruler and the phase strip (.tl-head) and the lanes
    // (.tl-line), at the same place and meeting with no gap; its 10 px head in the ruler's lower half, clear of every tick
    // label, the 0 too at 0 ms. The ruler, the phase strip and the head stay at the top while the rows scroll. (The playhead
    // moves on a drawn frame: showAt draws one.)
    const playheadNow = () => tp.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent-ink)';
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const head = r('.timeline .tl-head'), line = r('.timeline .tl-line'), top = r('.timeline .tl-top'), ruler = r('.timeline .tl-ruler'), rows = r('.timeline .tl-rows'), slot = r('.timeline-slot');
      const knob = document.querySelector('.timeline .tl-knob'), kb = knob.getBoundingClientRect(), shape = getComputedStyle(knob, '::before');
      const hk = { left: kb.left + parseFloat(shape.left), right: kb.left + parseFloat(shape.left) + parseFloat(shape.width), top: kb.bottom - parseFloat(shape.height), bottom: kb.bottom };
      const clear = [...document.querySelectorAll('.timeline .tl-tick span, .timeline .tl-unit')].every((s) => { const l = s.getBoundingClientRect(); return l.right <= hk.left || l.left >= hk.right || l.bottom <= hk.top || l.top >= hk.bottom; });
      const colour = [...document.querySelectorAll('.timeline .tl-head, .timeline .tl-line')].every((x) => getComputedStyle(x).backgroundColor === accent) && shape.backgroundColor === accent;
      return { headW: head.width, lineW: line.width, sameX: Math.abs(head.left - line.left) < 0.01, headTop: +(head.top - top.top).toFixed(1), headToTop: +(top.bottom - head.bottom).toFixed(1),
        gap: +(line.top - head.bottom).toFixed(1), lineToRows: +(rows.bottom - line.bottom).toFixed(1), colour, knob: [parseFloat(shape.width), parseFloat(shape.height)],
        lowerHalf: hk.top >= ruler.top + ruler.height / 2 - 0.5 && hk.bottom <= ruler.bottom + 0.5 && hk.left < head.left + 1 && hk.right > head.right - 1, clear,
        stuck: +(top.top - slot.top).toFixed(1), headIn: head.top >= slot.top - 0.5, scrolled: document.querySelector('.timeline-slot').scrollTop };
    });
    await showTl('board_beam', 0);
    const ph0 = await playheadNow();
    await showTl('board_beam', 1000);
    const ph1 = await playheadNow();
    // While firing it is hidden, both parts, as before; showing a moment brings it back.
    const firing = await tp.evaluate(async () => {
      const a = window.__vfx.app;
      const gone = (s) => getComputedStyle(document.querySelector(s)).display === 'none';
      a.fire();
      await a.tickForChecks(40);
      const out = { head: gone('.timeline .tl-head'), line: gone('.timeline .tl-line') };
      await a.showAt(1000, 7);
      out.back = !gone('.timeline .tl-head') && !gone('.timeline .tl-line');
      return out;
    });
    await tp.evaluate(() => { const s = document.querySelector('.timeline-slot'); s.scrollTop = s.scrollHeight; });
    await frames();
    const ph2 = await playheadNow();
    await tp.evaluate(() => { document.querySelector('.timeline-slot').scrollTop = 0; });
    const lineRight = (p) => p.headW === 2 && p.lineW === 2 && p.colour && p.sameX && p.headTop === 0 && p.headToTop === 0 && p.lineToRows === 0 && p.knob.join() === '10,10' && p.lowerHalf && p.clear;
    ok('the playhead: a 2 px line in --accent-ink through the ruler, the phase strip and the lanes, one line with no gap; its 10 px head in the ruler\'s lower half, clear of the tick labels (the 0 too, at 0 ms); hidden while firing, both parts',
      lineRight(ph0) && lineRight(ph1) && ph0.gap === 0 && ph1.gap === 0 && firing.head && firing.line && firing.back, JSON.stringify({ ph0, ph1, firing }));
    ok('with the rows scrolled to the end the ruler, the phase strip and the playhead\'s head stay at the top, and the line goes on under them',
      lineRight(ph2) && ph2.scrolled > 100 && ph2.stuck === 0 && ph2.headIn && ph2.gap < 0, JSON.stringify(ph2));

    // The head drags: a press on it, 2 px off its middle, keeps the time (and pauses); 100 px of drag move it by 100 px of
    // time.
    await showTl('board_beam', 500);
    const tlState = () => tp.evaluate(() => { const a = window.__vfx.app, d = a.debugState(); return { ms: +d.mainTime.toFixed(1), playing: d.playing, layer: a.layer()?.id ?? null }; });
    const kb = await tp.locator('.timeline .tl-knob').boundingBox();
    const lanePx = await tp.evaluate(() => document.querySelector('.timeline .tl-ruler').getBoundingClientRect().width);
    await tp.mouse.move(kb.x + kb.width / 2 + 2, kb.y + kb.height - 3);
    await tp.mouse.down();
    const headPressed = await tlState();
    await tp.mouse.move(kb.x + kb.width / 2 + 102, kb.y + kb.height - 3, { steps: 5 });
    const headDragged = await tlState();
    await tp.mouse.up();
    ok('the playhead\'s head drags: a press on it keeps the time, and 100 px of drag scrub 100 px of time, paused',
      near(headPressed.ms, 500, 1) && !headPressed.playing && near(headDragged.ms, 500 + (100 / lanePx) * 3500, 3) && !headDragged.playing, JSON.stringify({ headPressed, headDragged, lanePx }));

    // Scrubbing as before: a press on the ruler, on the phase strip and on an empty part of a lane goes to that moment.
    const pressAt = async (sel, fx, fy) => { const b = await tp.locator(sel).boundingBox(); await tp.mouse.click(b.x + b.width * fx, b.y + b.height * fy); return tlState(); };
    const onRuler = await pressAt('.timeline .tl-ruler', 0.3, 0.3);
    const onPhases = await pressAt('.timeline .tl-phases', 0.5, 0.5);
    await showTl('rifle_shot', 0);
    const onLane = await pressAt('.timeline .tl-row[data-layer="dust"] .tl-lane', 0.05, 0.5);
    ok('a press on the ruler, the phase strip or an empty part of a lane scrubs to that moment, as before, and selects nothing',
      near(onRuler.ms, 0.3 * 3500, 10) && near(onPhases.ms, 0.5 * 3500, 10) && near(onLane.ms, 0.05 * 400, 2) && [onRuler, onPhases, onLane].every((s) => !s.playing && s.layer === null),
      JSON.stringify({ onRuler, onPhases, onLane }));

    // A click on a bar selects its layer and leaves the time as it was (a press that moves 2 px is still a click); a press
    // on a bar that moves scrubs, paused, and selects nothing; a click on a bar's label beside it, or on a name, selects.
    // (The Hammer leech beam's bars fill most of their lanes.)
    await showTl('board_beam', 500);
    const barAt = async (id) => { const b = await tp.locator(`.timeline .tl-row[data-layer="${id}"] .tl-bar`).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    let [bx, by] = await barAt('spot_star');
    await tp.mouse.click(bx, by);
    const barClick = await tlState();
    [bx, by] = await barAt('beads');
    await tp.mouse.move(bx, by);
    await tp.mouse.down();
    await tp.mouse.move(bx + 2, by + 1);
    await tp.mouse.up();
    const barNudge = await tlState();
    [bx, by] = await barAt('emitter_glow');
    await tp.mouse.move(bx, by);
    await tp.mouse.down();
    await tp.mouse.move(bx + 80, by, { steps: 4 });
    const barDrag = await tlState();
    await tp.mouse.up();
    const barDragMs = await tp.evaluate((x) => { const r = document.querySelector('.timeline .tl-ruler').getBoundingClientRect(); return ((x - r.left) / r.width) * 3500; }, bx + 80);
    await tp.locator('.timeline .tl-row[data-layer="closing_rings"] .tl-name').click();
    const nameClick = await tlState();
    await showTl('rifle_shot', 200);
    await tp.locator('.timeline .tl-row[data-layer="bullet"] .tl-label').click();
    const besideClick = await tlState();
    ok('a click on a bar selects its layer and keeps the time (a 2 px move is still a click); a press on a bar that moves scrubs, paused, and selects nothing; a click on a label beside its bar, or on a name, selects',
      barClick.layer === 'spot_star' && barClick.ms === 500 && barNudge.layer === 'beads' && barNudge.ms === 500 && barDrag.layer === 'beads' && !barDrag.playing && near(barDrag.ms, barDragMs, 5)
        && nameClick.layer === 'closing_rings' && besideClick.layer === 'bullet' && besideClick.ms === 200, JSON.stringify({ barClick, barNudge, barDrag, barDragMs, nameClick, besideClick }));

    // A layer whose row is scrolled out of view, selected: its row stops right below the ruler and the phase strip, not
    // under them (Hammer leech beam, picked in the Layers list with the rows scrolled to the end). The Rifle shot has no
    // phases: with the timeline at its lowest, its first row stops right below the ruler.
    const rowUnder = (id) => tp.evaluate((id) => {
      const slot = document.querySelector('.timeline-slot').getBoundingClientRect(), top = document.querySelector('.timeline .tl-top').getBoundingClientRect();
      const row = document.querySelector(`.timeline .tl-row[data-layer="${id}"]`).getBoundingClientRect();
      return { below: +(row.top - top.bottom).toFixed(1), header: +(top.bottom - slot.top).toFixed(1), inView: row.top >= top.bottom - 0.5 && row.bottom <= slot.bottom + 0.5, scrolled: document.querySelector('.timeline-slot').scrollTop };
    }, id);
    await showTl('board_beam', 1000);
    await tp.evaluate(() => { const s = document.querySelector('.timeline-slot'); s.scrollTop = s.scrollHeight; });
    await tp.locator('.layers-list .layer-item[data-layer="emitter_white"] .item-main').click();
    const beamFirst = await rowUnder('emitter_white');
    await tp.locator('.layers-list .layer-item[data-layer="ground_glow_target"] .item-main').scrollIntoViewIfNeeded();
    await tp.locator('.layers-list .layer-item[data-layer="ground_glow_target"] .item-main').click();
    const beamLast = await rowUnder('ground_glow_target');
    await dragSplit('.split-timeline', 0, 600);
    await showTl('rifle_shot', 20, 'bullet');
    await showTl('rifle_shot', 20, 'dust');
    const rifleFirst = await rowUnder('dust');
    const lowest = await tp.evaluate(() => Math.round(document.querySelector('.timeline-pane').getBoundingClientRect().height));
    await tp.locator('.split-timeline').dblclick();
    await frames();
    ok('a layer whose row is out of view, selected, scrolls into view below the ruler and the phase strip (40 px), not under them; below the ruler alone (24 px) when the effect has no phases',
      beamFirst.below === 0 && beamFirst.header === 40 && beamFirst.inView && beamLast.inView && beamLast.scrolled > 0 && rifleFirst.below === 0 && rifleFirst.header === 24 && rifleFirst.inView && lowest === 140,
      JSON.stringify({ beamFirst, beamLast, rifleFirst, lowest }));

    // Selection and hover as in the Layers list: the selected row's --bg-selected across the name and the lane (its name
    // cell the same colour as the selected row in the Layers list), its bar's 2 px --accent-ink outline; a hovered row's
    // lane, and the selected one's, exactly --tl-lane-hover and --tl-lane-selected (the edge round a label beside its bar
    // takes those). In Day and in Night.
    const looks = async (theme) => {
      await showTl('rifle_shot', 200, 'tracer');
      // The pointer on an empty part of the Hit spark row's lane, where no tooltip opens: the row highlights.
      const hitLane = await tp.locator('.timeline .tl-row[data-layer="hit"] .tl-lane').boundingBox();
      await tp.mouse.move(hitLane.x + hitLane.width - 60, hitLane.y + hitLane.height / 2);
      await tp.waitForTimeout(300);
      const geo = await tp.evaluate(() => {
        const probe = (prop, v) => { const s = document.createElement('span'); s.style[prop] = v; document.body.append(s); const c = getComputedStyle(s)[prop]; s.remove(); return c; };
        const row = document.querySelector('.timeline .tl-row.sel'), bar = row.querySelector('.tl-bar'), name = row.querySelector('.tl-name'), lane = row.querySelector('.tl-lane');
        const hovered = document.querySelector('.timeline .tl-row[data-layer="hit"]');
        const list = document.querySelector('.layers-list .layer-item.sel').getBoundingClientRect();
        const n = name.getBoundingClientRect(), l = lane.getBoundingClientRect(), b = bar.getBoundingClientRect(), hl = hovered.querySelector('.tl-lane').getBoundingClientRect();
        const hex = (c) => '#' + c.match(/\d+/g).slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase();
        return { rowBg: getComputedStyle(row).backgroundColor === probe('backgroundColor', 'var(--bg-selected)'), cells: getComputedStyle(name).backgroundColor + ' ' + getComputedStyle(lane).backgroundColor,
          outline: `${getComputedStyle(bar).outlineStyle} ${getComputedStyle(bar).outlineWidth}`, outlineColour: getComputedStyle(bar).outlineColor === probe('color', 'var(--accent-ink)'),
          hoveredClass: hovered.classList.contains('hovered') || hovered.matches(':hover'), want: { hover: hex(probe('color', 'var(--tl-lane-hover)')), sel: hex(probe('color', 'var(--tl-lane-selected)')) },
          at: { name: [Math.round(n.right - 6), Math.round(n.top + n.height / 2)], list: [Math.round(list.right - 110), Math.round(list.top + list.height / 2)], lane: [Math.round(l.right - 20), Math.round(l.top + l.height / 2)],
            hover: [Math.round(hl.right - 20), Math.round(hl.top + hl.height / 2)], outline: [Math.round(b.left + b.width / 2), Math.round(b.top - 2)] } };
      });
      const png = PNG.sync.read(await tp.screenshot({ path: join(shots, `timeline-selection-${theme}.png`) }));
      const px = (p) => hex(png, p[0], p[1]);
      const accent = await tp.evaluate(() => { const s = document.createElement('span'); s.style.color = 'var(--accent-ink)'; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return '#' + c.match(/\d+/g).slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase(); });
      await tp.mouse.move(900, 300);
      return { ...geo, px: { name: px(geo.at.name), list: px(geo.at.list), lane: px(geo.at.lane), hover: px(geo.at.hover), outline: px(geo.at.outline) }, accent };
    };
    const lookDay = await looks('day');
    await tp.locator('.topbar .theme-toggle').click();
    const lookNight = await looks('night');
    await tp.locator('.topbar .theme-toggle').click();
    const lookRight = (k) => k.rowBg && k.cells === 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)' && k.outline === 'solid 2px' && k.outlineColour && k.hoveredClass
      && diff(k.px.name, k.px.list) <= 1 && diff(k.px.lane, k.want.sel) <= 1 && diff(k.px.hover, k.want.hover) <= 1 && diff(k.px.outline, k.accent) <= 1;
    ok('the selected row: --bg-selected across the name (the colour of the selected row in the Layers list) and the lane, its bar outlined 2 px in --accent-ink; a hovered lane and the selected one exactly --tl-lane-hover and --tl-lane-selected, in Day and Night',
      lookRight(lookDay) && lookRight(lookNight), JSON.stringify({ lookDay, lookNight }));

    // Left out of the tier: the bar at 35 % (its fill 0.35 of its colour over the lane), the name muted; the selected one's
    // name keeps --text and its outline stays whole. (The Molotov in Low: Flames is in Medium and High only.)
    const offLook = await tp.evaluate(async () => {
      const a = window.__vfx.app;
      a.pickEffect('board_molotov');
      a.setTierForChecks('low');
      a.selectLayer(null);
      await a.showAt(1200, 7);
      const probe = (v) => { const s = document.createElement('span'); s.style.color = v; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
      const row = document.querySelector('.timeline .tl-row[data-layer="flames"]'), bar = row.querySelector('.tl-bar'), label = bar.querySelector('.tl-label');
      const b = bar.getBoundingClientRect(), l = label.getBoundingClientRect();
      // A point of the fill: halfway between two step marks (each 1 px at the end of its step), well right of the label.
      const stepPx = bar.classList.contains('steps') ? (parseFloat(bar.style.getPropertyValue('--step')) / 100) * (b.width - 2) : 0;
      const x = stepPx ? b.left + 1 + (Math.ceil((l.right + 20 - b.left - 1) / stepPx) + 0.5) * stepPx : l.right + 40;
      const type = [...bar.classList][1];
      const out = { off: row.classList.contains('off'), name: getComputedStyle(row.querySelector('.tl-name')).color === probe('var(--text-muted)'), fill: probe(`var(--tl-${type})`), lane: probe('var(--tl-lane)'),
        at: [Math.round(x), Math.round(b.top + b.height / 2)], stepPx: +stepPx.toFixed(1), type, outlineAt: [Math.round(b.left + b.width / 2), Math.round(b.top - 2)],
        // Its label: the bar's text colour at 35 % over the bar's own 35 %, as the whole bar at 35 % looks.
        label: getComputedStyle(label).color === probe(`color-mix(in srgb, var(--tl-bar-text) 35%, color-mix(in srgb, var(--tl-${type}) 35%, var(--tl-lane)))`) };
      return out;
    });
    const offPng = PNG.sync.read(await tp.screenshot());
    const offPx = hex(offPng, offLook.at[0], offLook.at[1]);
    // Selected, its name keeps --text and its outline is --accent-ink at full strength (sampled where it is drawn).
    const offSel = await tp.evaluate(() => {
      const a = window.__vfx.app;
      a.selectLayer('flames');
      const probe = (v) => { const s = document.createElement('span'); s.style.color = v; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
      const accent = probe('var(--accent-ink)');
      return { name: getComputedStyle(document.querySelector('.timeline .tl-row[data-layer="flames"] .tl-name')).color === probe('var(--text)'),
        accent: '#' + accent.match(/\d+/g).slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase() };
    });
    const offSelPx = hex(PNG.sync.read(await tp.screenshot()), offLook.outlineAt[0], offLook.outlineAt[1]);
    await tp.evaluate(() => window.__vfx.app.selectLayer(null));
    await tp.evaluate(async () => { const a = window.__vfx.app; a.setTierForChecks('high'); await a.showAt(1200, 7); });
    const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
    const offWant = '#' + rgb(offLook.fill).map((f, i) => Math.round(0.35 * f + 0.65 * rgb(offLook.lane)[i]).toString(16).padStart(2, '0')).join('').toUpperCase();
    ok('a bar left out of the tier is at 35 % (its fill 0.35 of its colour over the lane, its label at 35 % too) and its name muted; selected, its name keeps --text and its outline is drawn at full strength',
      offLook.off && offLook.name && offLook.label && diff(offPx, offWant) <= 2 && offSel.name && diff(offSelPx, offSel.accent) <= 1, JSON.stringify({ offLook, offPx, offWant, offSel, offSelPx }));

    // The edge round a label (its 1 px stroke in the colour behind it) stays the colour round it while the row's colour
    // changes: caught 20 ms into a hover coming and into one going (the row fades in 120 ms; so does the edge), in Day and
    // Night, and 20 ms into a theme change (the lane switches at once; so does the edge), round the Bullet's label beside its
    // bar (also on the selected row, for the theme change) and round the label inside a bar left out of the tier (the
    // Molotov's Flames in Low). For the picture the letters are made see-through and the bar's step marks taken off, so
    // only the edge is drawn: it must not stand out from what is round it. (The hover is the Layers list's and the theme
    // toggle is clicked in the page, so the change starts in the same call that catches it.)
    const edgeCaught = async (effect, ms, id, how, layer = null) => {
      await showTl(effect, ms, layer);
      await tp.evaluate(([id, how]) => window.__vfx.app.hoverLayer(how === 'out' ? id : null), [id, how]);
      await tp.waitForTimeout(250);
      const caught = await tp.evaluate(([id, how]) => {
        if (how === 'theme') document.querySelector('.topbar .theme-toggle').click();
        else window.__vfx.app.hoverLayer(how === 'in' ? id : null);
        const row = document.querySelector(`.timeline .tl-row[data-layer="${id}"]`), bar = row.querySelector('.tl-bar'), label = bar.querySelector('.tl-label');
        const anims = row.getAnimations();
        for (const a of anims) { a.pause(); a.currentTime = 20; }
        label.style.color = 'transparent';
        bar.style.backgroundImage = 'none';
        const l = label.getBoundingClientRect();
        return { theme: document.documentElement.dataset.theme, props: anims.map((a) => a.transitionProperty ?? '?'), hovered: row.classList.contains('hovered'), sel: row.classList.contains('sel'),
          fit: bar.dataset.fit, off: row.classList.contains('off'), box: [l.left, l.top, l.width, l.height] };
      }, [id, how]);
      await frames();
      const [lx, ly, lw, lh] = caught.box;
      const png = PNG.sync.read(await tp.screenshot({ clip: { x: Math.floor(lx) - 2, y: Math.ceil(ly), width: Math.ceil(lw) + 4, height: Math.floor(lh) } }));
      await tp.evaluate((id) => {
        const row = document.querySelector(`.timeline .tl-row[data-layer="${id}"]`), bar = row.querySelector('.tl-bar');
        bar.style.backgroundImage = '';
        bar.querySelector('.tl-label').style.color = '';
        for (const a of row.getAnimations()) a.finish();
        window.__vfx.app.hoverLayer(null);
      }, id);
      // What is round the edge: the commonest colour in the label's box. The edge may differ from it by rounding only.
      const counts = new Map();
      for (let i = 0; i < png.data.length; i += 4) { const k = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
      const bg = [...counts.entries()].sort((p, q) => q[1] - p[1])[0][0].split(',').map(Number);
      let most = 0;
      for (let i = 0; i < png.data.length; i += 4) for (let k = 0; k < 3; k++) most = Math.max(most, Math.abs(png.data[i + k] - bg[k]));
      return { id, how, theme: caught.theme, props: caught.props, hovered: caught.hovered, sel: caught.sel, fit: caught.fit, off: caught.off, most };
    };
    const fades = [];
    for (const theme of ['day', 'night']) {
      if (theme === 'night') await tp.locator('.topbar .theme-toggle').click();
      await tp.mouse.move(900, 300);
      for (const how of ['in', 'out']) fades.push(await edgeCaught('rifle_shot', 200, 'bullet', how));
      await tp.evaluate(() => window.__vfx.app.setTierForChecks('low'));
      for (const how of ['in', 'out']) fades.push(await edgeCaught('board_molotov', 1200, 'flames', how));
      await tp.evaluate(() => window.__vfx.app.setTierForChecks('high'));
    }
    await tp.locator('.topbar .theme-toggle').click();
    await tp.mouse.move(900, 300);
    // Theme changes, each case Day to Night and back to Day.
    const switches = [];
    for (const [effect, ms, id, layer, tier] of [['rifle_shot', 200, 'bullet', null, 'high'], ['rifle_shot', 200, 'bullet', 'bullet', 'high'], ['board_molotov', 1200, 'flames', null, 'low']]) {
      await tp.evaluate((tier) => window.__vfx.app.setTierForChecks(tier), tier);
      for (let k = 0; k < 2; k++) switches.push(await edgeCaught(effect, ms, id, 'theme', layer));
    }
    await tp.evaluate(() => window.__vfx.app.setTierForChecks('high'));
    const fadesRight = fades.length === 8 && fades.every((f) => f.props.includes('background-color') && f.hovered === (f.how === 'in') && f.most <= 3)
      && fades.filter((f) => f.id === 'bullet').every((f) => f.fit === 'right' && !f.off) && fades.filter((f) => f.id === 'flames').every((f) => f.fit === 'inside' && f.off);
    const switchesRight = switches.length === 6 && switches.every((f) => f.props.length > 0 && f.most <= 3) && switches.map((f) => f.theme).join() === 'dark,light,dark,light,dark,light'
      && switches[2].sel && switches[3].sel && switches[4].off && switches[4].fit === 'inside';
    ok('the edge round a label stays the colour round it while its row\'s colour changes: 20 ms into a hover coming or going (in Day and Night) and into a theme change, round the Bullet\'s label beside its bar (also selected) and the label inside a bar left out of the tier',
      fadesRight && switchesRight, JSON.stringify({ fades, switches }));

    // Neither hides the other: at 20 ms on the Hammer leech beam the playhead crosses the first digit of "3150 ms", the "w"
    // of "wind-up" and the ruler's 0; at 20 ms on the Rifle shot it crosses the Bullet's label beside its bar. Each label's
    // letters and their 1 px edge look the same as with the playhead far away, and the line shows round them.
    const underPlayhead = async (effect, onMs, awayMs, sel) => {
      await showTl(effect, onMs);
      const b = await tp.locator(sel).first().boundingBox();
      const clip = { x: Math.floor(b.x), y: Math.floor(b.y), width: Math.ceil(b.x + b.width) - Math.floor(b.x), height: Math.ceil(b.y + b.height) - Math.floor(b.y) };
      const lineX = await tp.evaluate(() => { const r = document.querySelector('.timeline .tl-line').getBoundingClientRect(); return r.left + r.width / 2; });
      const on = PNG.sync.read(await tp.screenshot({ clip }));
      await showTl(effect, awayMs);
      const away = PNG.sync.read(await tp.screenshot({ clip }));
      // In the label's own box: its background is the commonest colour with the playhead away; its letters, the pixels that
      // differ from it (with their soft edges). A letter pixel may move a little (24 of 255: the label can sit at a fraction
      // of a pixel, and its edge and letters round apart); without the edge they took the line's colour. Elsewhere in the
      // box the line may show.
      const counts = new Map();
      for (let i = 0; i < away.data.length; i += 4) { const k = `${away.data[i]},${away.data[i + 1]},${away.data[i + 2]}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
      const bg = [...counts.entries()].sort((p, q) => q[1] - p[1])[0][0].split(',').map(Number);
      const W = away.width, H = away.height;
      const ink = (x, y) => { const i = (y * W + x) * 4; return Math.max(...[0, 1, 2].map((k) => Math.abs(away.data[i + k] - bg[k]))) > 40; };
      let kept = 0, changedLetters = 0, lineShows = 0, most = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const d = Math.max(...[0, 1, 2].map((k) => Math.abs(on.data[i + k] - away.data[i + k])));
        if (ink(x, y)) { most = Math.max(most, d); if (d > 24) changedLetters++; else kept++; } else if (d > 40) lineShows++;
      }
      return { sel, crosses: lineX >= clip.x + 1 && lineX <= clip.x + clip.width - 1, kept, changedLetters, most, lineShows };
    };
    const hidden = [
      await underPlayhead('board_beam', 20, 1500, '.timeline .tl-row[data-layer="emitter_white"] .tl-label'),
      await underPlayhead('board_beam', 20, 1500, '.timeline .tl-phase.windup span'),
      await underPlayhead('board_beam', 20, 1500, '.timeline .tl-tick span'),
      await underPlayhead('rifle_shot', 20, 200, '.timeline .tl-row[data-layer="bullet"] .tl-label'),
    ];
    ok('no label is hidden by the playhead: on "3150 ms" and "wind-up" at 20 ms (Hammer leech beam), the ruler\'s 0, and the Bullet\'s label beside its bar, the letters stay as they were and the line shows round them',
      hidden.every((x) => x.crosses && x.kept > 20 && x.changedLetters === 0 && x.lineShows > 0), JSON.stringify(hidden));
    ok('the timeline page has no errors', g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
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
      // Cost folds since UI phase 6, closed at first: open it to see the line drawn.
      document.querySelector('.inspector .costcard > details').open = true;
      const el = document.querySelector('.costcard .cost-level');
      const r = document.createRange();
      r.selectNodeContents(el);
      // Its tooltip's words: the title, or data-tip once the title has moved into the tooltip.
      return { text: el.textContent, title: el.title || el.dataset.tip || '', lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size };
    });
    ok('the cost card names a class with a long name in one or two lines, the whole name in its tooltip', level.lines >= 1 && level.lines <= 2
      && level.text.startsWith('The budgets of its class "Big explosions') && level.title.includes(longClass), `${level.lines} line(s): "${level.text}"`);
    // Delete the rifle shot and save, with nothing else changed: project.json leaves out its budgets (and events).
    await effectMenu(g.page, 'Rifle shot (demo)', 'Delete');
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

  // -- the Budgets place in Cost (UI phase 6, Part B: the plan Mustafa approved on 2026-11-15), on a throwaway project
  // (projects/browser-check-budget-place-…, deleted after): under Cost's Budgets toggle, whose numbers the boxes show
  // (Project, Class, Own), each level switched on and off, the effect's class picked, a class made with New class… (the
  // question dialog's OK clicked), renamed and deleted; numbers typed at each level; which level counts (the closest that is
  // on); every change one undo step; saved in project.json. On the same project, whose muzzle_flash.png does not decode, the
  // "not drawn" warning for an image that did not load.
  {
    const bpn = `browser-check-budget-place-${Date.now()}`;
    const bdir = join(repo, 'projects', bpn);
    cpSync(join(repo, 'examples', 'demo-project'), bdir, { recursive: true });
    // In the project, but not a PNG: it cannot load.
    writeFileSync(join(bdir, 'images', 'muzzle_flash.png'), 'not a png');
    let g = null;
    try {
      g = await open(`${base}/?backend=webgl&project=projects/${bpn}`, () => window.__vfx && window.__vfx.ready);
      const pg = g.page;
      pg.on('dialog', (d) => d.accept());
      await pg.evaluate(() => { const a = window.__vfx.app; window.__vfxManual = true; a.pickEffect('board_beam'); });
      await pg.locator('.inspector .costcard > details > summary').click();
      await pg.locator('.inspector .costcard .cost-budgets input').check();
      const placeNow = () => pg.evaluate(() => {
        const a = window.__vfx.app, c = document.querySelector('.inspector .costcard'), place = c.querySelector('.budget-place');
        const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
        const segs = [...place.querySelectorAll('.budget-shows .seg')];
        const sw = Object.fromEntries([...place.querySelectorAll('label.check')].map((l) => [l.querySelector('.check-text').textContent, l.querySelector('input').checked]));
        const sel = place.querySelector('.budget-class select');
        const box = (m, t) => c.querySelector(`input.budget[aria-label="Budget: ${m}, ${t}"]`).value;
        return { shown: shown(place), rows: [...place.children].map((r) => r.querySelector('.flab, .check-text')?.textContent ?? r.className),
          shows: segs.find((s) => s.getAttribute('aria-pressed') === 'true')?.textContent ?? null, classSeg: !segs[1].disabled, segH: Math.round(place.querySelector('.budget-shows .seggroup').getBoundingClientRect().height),
          sw, cls: sel.value, options: [...sel.options].map((o) => o.textContent), tools: shown(place.querySelector('.class-rename')) && shown(place.querySelector('.class-delete')),
          level: c.querySelector('.cost-level').textContent, boxes: { drawsHigh: box('Draws', 'High'), drawsLow: box('Draws', 'Low'), trisHigh: box('Triangles', 'High') },
          budgets: a.budgets(), n: a.history.past.length, undo: a.history.undoLabel ?? null };
      });
      const typeBudget = async (metric, tier, value) => { const b = pg.locator(`table.cost input.budget[aria-label="Budget: ${metric}, ${tier}"]`); await b.fill(value); await b.press('Enter'); };
      const flip = (words) => pg.locator('.inspector .budget-place label.check', { has: pg.locator('.check-text', { hasText: exactly(words) }) }).click();
      const answer = async (text) => {
        await pg.waitForSelector('dialog[open] input.text', { timeout: 5000 });
        await pg.locator('dialog[open] input.text').fill(text);
        await pg.locator('dialog[open] button', { hasText: 'OK' }).click();
        await pg.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 5000 });
        await pg.waitForTimeout(150);
      };
      const p0 = await placeNow();
      await typeBudget('Draws', 'High', '5');
      const p1 = await placeNow();
      await pg.locator('.inspector .budget-class select').selectOption({ label: 'Big' });
      const p2 = await placeNow();
      await flip('Class budgets');
      const p3 = await placeNow();
      await typeBudget('Triangles', 'High', '9000');
      const p4 = await placeNow();
      await pg.locator('.inspector .budget-class select').selectOption({ label: 'New class…' });
      await answer('Huge');
      const p5 = await placeNow();
      await pg.locator('.inspector .budget-place .class-rename').click();
      await answer('Massive');
      const p6 = await placeNow();
      await flip('Its own budgets');
      const p7 = await placeNow();
      await typeBudget('Draws', 'Low', '2');
      const p8 = await placeNow();
      await pg.locator('.inspector .budget-shows button.seg[aria-label="The project\'s budgets"]').click();
      const p9 = await placeNow();
      await flip('Its own budgets');
      const p10 = await placeNow();
      await flip('Class budgets');
      const p11 = await placeNow();
      await pg.locator('.inspector .budget-place .class-delete').click();
      const p12 = await placeNow();
      await pg.keyboard.press('Control+z');
      const p13 = await placeNow();
      ok('Cost\'s Budgets toggle shows the Budgets place: Boxes show (Project, Class, Own: Project at first, Class off while the effect has no class, on one line), Project budgets, Class budgets, Class (No class, the classes, New class…) and Its own budgets, all off at first',
        p0.shown && p0.rows.join() === 'Boxes show,Project budgets,Class budgets,Class,Its own budgets' && p0.shows === 'Project' && !p0.classSeg && p0.segH <= 24
          && Object.values(p0.sw).every((v) => v === false) && p0.cls === '' && p0.options.join() === 'No class,Small,Normal,Big,New class…' && !p0.tools
          && p0.level === 'No budgets are on. Type a number to switch on the project\'s budgets.',
        JSON.stringify(p0));
      ok('a number typed in a box goes to the level the boxes show and switches it on (the project\'s), one undo step; picking the effect\'s class is one; Class budgets on is one, and then its class counts, and the boxes show its numbers',
        p1.budgets.project.on && p1.budgets.project.limits.high.draws === 5 && p1.sw['Project budgets'] && p1.undo === 'Budget' && p1.n === p0.n + 1 && p1.level === 'The project\'s budgets count for this effect.'
          && p2.budgets.effects.board_beam.class === 'big' && p2.cls === 'big' && p2.classSeg && p2.tools && p2.undo === 'Budget class' && p2.n === p1.n + 1
          && p3.budgets.classes.on && p3.undo === 'Class budgets on' && p3.n === p2.n + 1 && p3.level === 'The budgets of its class "Big" count.' && p3.shows === 'Class' && p3.boxes.drawsHigh === ''
          && p4.budgets.classes.list.find((c) => c.id === 'big').limits.high.triangles === 9000 && p4.n === p3.n + 1 && p4.boxes.trisHigh === '9000',
        JSON.stringify({ p1: [p1.budgets.project, p1.undo, p1.level], p2: [p2.cls, p2.undo], p3: [p3.level, p3.shows, p3.undo], p4: p4.budgets.classes.list.find((c) => c.id === 'big') }));
      ok('New class… asks for a name (OK clicked), makes the class and puts the effect in it, in one undo step; the pencil renames it (its id stays, the effect stays in it), in one',
        p5.budgets.classes.list.at(-1)?.id === 'huge' && p5.budgets.classes.list.at(-1)?.name === 'Huge' && p5.cls === 'huge' && p5.undo === 'New class' && p5.n === p4.n + 1 && p5.options.includes('Huge')
          && p6.budgets.classes.list.at(-1)?.id === 'huge' && p6.budgets.classes.list.at(-1)?.name === 'Massive' && p6.cls === 'huge' && p6.undo === 'Rename class' && p6.n === p5.n + 1 && p6.level === 'The budgets of its class "Massive" count.',
        JSON.stringify({ p5: [p5.budgets.classes.list, p5.cls, p5.undo], p6: [p6.budgets.classes.list.at(-1), p6.level] }));
      ok('the closest level that is on counts: its own when on (the boxes then show its own numbers, typed there), its class when its own is off, the project\'s when class budgets are off too; Boxes show picks whose numbers the boxes show',
        p7.budgets.effects.board_beam.on && p7.level === 'This effect\'s own budgets count.' && p7.shows === 'Own' && p7.undo === 'Own budgets on'
          && p8.budgets.effects.board_beam.limits.low.draws === 2 && p8.boxes.drawsLow === '2' && p8.n === p7.n + 1
          && p9.shows === 'Project' && p9.boxes.drawsHigh === '5' && p9.n === p8.n
          && p10.level === 'The budgets of its class "Massive" count.' && p10.undo === 'Own budgets off' && p11.level === 'The project\'s budgets count for this effect.' && p11.undo === 'Class budgets off',
        JSON.stringify({ p7: [p7.level, p7.shows], p8: p8.budgets.effects.board_beam, p9: [p9.shows, p9.boxes], p10: p10.level, p11: p11.level }));
      ok('the bin deletes the effect\'s class after asking (the effect is then in none), one undo step; undo brings the class back with the effect in it',
        !p12.budgets.classes.list.some((c) => c.id === 'huge') && p12.cls === '' && !p12.budgets.effects.board_beam.class && p12.undo === 'Delete class' && p12.n === p11.n + 1
          && p13.budgets.classes.list.at(-1)?.name === 'Massive' && p13.cls === 'huge' && p13.n === p11.n,
        JSON.stringify({ p12: [p12.budgets.classes.list.map((c) => c.id), p12.cls], p13: [p13.budgets.classes.list.at(-1), p13.cls] }));
      // Saved: project.json holds the three levels, only what differs from the defaults.
      await pg.keyboard.press('Control+s');
      await pg.waitForFunction(() => !document.querySelector('.project-name')?.textContent?.includes('•'), null, { timeout: 15000 }).catch(() => {});
      await pg.waitForTimeout(300);
      const savedPlace = JSON.parse(readFileSync(join(bdir, 'project.json'), 'utf8')).budgets;
      const wantPlace = { project: { on: true, limits: { high: { draws: 5 } } },
        classes: { list: [{ id: 'small', name: 'Small' }, { id: 'normal', name: 'Normal' }, { id: 'big', name: 'Big', limits: { high: { triangles: 9000 } } }, { id: 'huge', name: 'Massive' }] },
        effects: { board_beam: { class: 'huge', limits: { low: { draws: 2 } } } } };
      ok('saved, project.json holds the budgets at their three levels: the project\'s (on, 5 draws in High), the classes (Big\'s 9000 triangles, Massive made here; class budgets off) and the effect\'s (in Massive, its own 2 draws in Low, off)',
        JSON.stringify(savedPlace) === JSON.stringify(wantPlace), JSON.stringify(savedPlace));
      // An image that did not load: the preview and the layer's panel say so.
      const broken = await pg.evaluate(async () => {
        const a = window.__vfx.app;
        a.pickEffect('rifle_shot'); a.selectLayer('flash');
        await a.showAt(20, 7);
        const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
        return { notes: [...document.querySelectorAll('.vnotes .vnote')].filter(shown).map((x) => x.textContent), panel: [...document.querySelectorAll('.inspector .draws .not-drawn-line')].filter(shown).map((x) => x.textContent) };
      });
      ok('an image in the project that does not load: the preview says "Muzzle flash is not drawn: the image muzzle_flash.png did not load." and the layer\'s panel says it under what draws it',
        broken.notes.includes('Muzzle flash is not drawn: the image muzzle_flash.png did not load.') && broken.panel.join() === 'Not drawn: the image muzzle_flash.png did not load.', JSON.stringify(broken));
    } finally {
      await g?.page.close();
      rmSync(bdir, { recursive: true, force: true });
    }
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
    m.effectVersion = 5;
    writeFileSync(join(old, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
    const g1 = await open(`${tpBase}/?export=_check-old-effects&offscreen=1&backend=webgl`, () => window.__test && window.__test.ready);
    const e1 = await g1.page.evaluate(() => window.__test.error ?? '');
    ok('test page: effects of an older version are refused in plain words', /version 5, and this runtime plays version 6: export them again/.test(e1), e1);
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
