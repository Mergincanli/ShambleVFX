// The browser check: one command that proves the editor and the runtime work in a real browser.
//   npm run check:browser
// 1. Builds vfx-runtime alone: it must import only three.js, and hold no checker (zod) and no editor code.
// 2. Starts the editor's dev server, then on WebGPU and on WebGL 2:
//    - the colour check page: white sprites tinted by roles must read back as the exact palette hexes; a sprite
//      centred on the ground keeps its lower half; a sprite behind a wall stays hidden (and shows without the wall);
//      a half-transparent sprite is compared with what Canvas 2D (the drawing board) shows, as a number;
//    - the editor: opens the demo project, pauses at set times (never waits on a running animation), and saves
//      1920 x 1080 screenshots to out/screenshots/.
// 3. On WebGL 2, drives the editor: an edit and its undo, Fire, Save as into projects/ (deleted again after).
// WebGPU is read back off-screen: this headless browser cannot show a WebGPU canvas, but renders WebGPU fine.
import { mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
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
  await page.goto(url);
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
    a.pickEffect('rifle_shot');
    return { effects: a.debugState().effects.slice().sort(), size: a.effect()?.controls.size, name: document.querySelector('.project-name')?.textContent };
  });
  ok('the saved project opens again, with the edit in it', reopened.effects.join() === kept.join() && reopened.size === 2, `${reopened.name}: ${reopened.effects.join(', ')}, rifle_shot size ${reopened.size}`);
  await savedPage.page.close();
  ok('the examples stay unchanged', JSON.parse(readFileSync(join(repo, 'examples', 'demo-project', 'effects', 'rifle_shot.vfx.json'), 'utf8')).controls.size === 1);
  rmSync(dir, { recursive: true, force: true });
  ok('editor (driven) has no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await p.close();
}

await browser.close();
await server.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.filter((r) => !r.note).length - failed.length} passed, ${failed.length} failed. Screenshots: out/screenshots/`);
process.exit(failed.length ? 1 : 0);
