// The browser check: one command that proves the editor and the runtime work in a real browser.
//   npm run check:browser
// 1. Builds vfx-runtime alone: it must import only three.js, and hold no checker (zod) and no editor code.
// 2. Starts the editor's dev server, then on WebGPU and on WebGL 2:
//    - the colour check page: white sprites tinted by roles must read back as the exact palette hexes; a sprite
//      centred on the ground keeps its lower half; a sprite behind a wall stays hidden (and shows without the wall);
//      a half-transparent sprite is compared with what Canvas 2D (the drawing board) shows, as a number;
//    - the editor: opens the demo project, pauses at set times (never waits on a running animation), and saves
//      1920 x 1080 screenshots to out/screenshots/.
// 3. On WebGL 2, drives the editor: an edit and its undo, Fire, quality tiers, game events, the cost panel and budgets,
//    Save as into projects/, Export and Import (everything made is deleted again after).
// 4. The game-side test page (packages/vfx-testpage), on WebGPU and on WebGL 2: it loads only vfx-runtime and an export
//    folder and plays effects by event name. Its bundle must hold no checker (zod) and no editor code.
// WebGPU is read back off-screen: this headless browser cannot show a WebGPU canvas, but renders WebGPU fine.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  // A page opened while another editor page is still drawing can take about 30 s to start here: this headless browser
  // draws in software, and the new page's start-up waits for it (measured: its modules load in under half a second, then
  // nothing is pending for about 25 s). So the load gets as long as the app gets to be ready.
  await page.goto(url, { timeout: 60000 });
  await page.waitForFunction(ready, null, { timeout: 60000 });
  return { page, errors };
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

  // -- the colour picker: a typed colour, a drag on the wheel and its undo, a new colour, Revert
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
  ok('the picker stays open while you play the effect, and Escape closes it', stillOpen && closedByEscape, `open after Play: ${stillOpen}, closed by Escape: ${closedByEscape}`);
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

  // -- night mode: panels go dark, the preview keeps the game's colours
  await p.locator('.topbar button.theme-toggle').click();
  const night = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, pressed: document.querySelector('.theme-toggle').getAttribute('aria-pressed'), stored: localStorage.getItem('vfx-theme') }));
  await p.screenshot({ path: join(shots, 'editor-night-mode.png') });
  await p.locator('.topbar button.theme-toggle').click();
  const day = await p.evaluate(() => document.documentElement.dataset.theme);
  ok('Night mode turns the panels dark (#1F1F21) and is remembered; it turns off again', night.theme === 'dark' && night.bg === 'rgb(31, 31, 33)' && night.pressed === 'true' && night.stored === 'dark' && day === 'light', JSON.stringify(night));
  const insignia = await p.evaluate(() => [...document.querySelectorAll('.vbar [aria-label="Faction that fired"] button')].map((b) => `${b.querySelector('svg')?.getAttribute('class')}|${b.textContent}`));
  ok('the faction buttons show each faction\'s marking and its name', insignia.join() === 'icon icon-faction-soviets|Soviets,icon icon-faction-allies|Allies,icon icon-faction-empire|Empire', insignia.join(', '));

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
  await savedPage.page.close();
  if (importDir) rmSync(importDir, { recursive: true, force: true });
  rmSync(exportDir, { recursive: true, force: true });
  ok('the examples stay unchanged', JSON.parse(readFileSync(join(repo, 'examples', 'demo-project', 'effects', 'rifle_shot.vfx.json'), 'utf8')).controls.size === 1);
  rmSync(dir, { recursive: true, force: true });
  ok('editor (driven) has no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await p.close();

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

  // -- a project whose project.json is a newer version is not opened, so it is never written over; the editor says why.
  {
    const future = `browser-check-future-${Date.now()}`;
    const fdir = join(repo, 'projects', future);
    mkdirSync(join(fdir, 'effects'), { recursive: true });
    const futureText = `${JSON.stringify({ format: 'shamble-vfx-project', version: 3, name: 'From the future' }, null, 2)}\n`;
    writeFileSync(join(fdir, 'project.json'), futureText);
    const g = await open(`${base}/?backend=webgl&project=examples/demo-project`, () => window.__vfx && window.__vfx.ready);
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
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.filter((r) => !r.note).length - failed.length} passed, ${failed.length} failed. Screenshots: out/screenshots/`);
process.exit(failed.length ? 1 : 0);
