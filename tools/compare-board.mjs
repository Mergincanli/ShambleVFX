// Side by side: the Art lead's VFX drawing board (left) and Shamble VFX (right), same effect, same moment, same faction
// and "made by", both as one 1080p game screen shown at 1280 x 720.
//   npm run compare            all four board effects at their key moments
//   npm run compare -- shell   one effect
// The drawing board is Mustafa's file: it stays in style-guide/ (git ignores it). Without it, this tool says so and stops.
// Pictures go to out/compare/ (also ignored by git).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const board = join(repo, 'style-guide', 'vfx_drawing_board_v7.html');
if (!existsSync(board)) {
  console.log('The drawing board is not in style-guide/ (vfx_drawing_board_v7.html). Nothing to compare.');
  process.exit(0);
}
const out = join(repo, 'out', 'compare');
mkdirSync(out, { recursive: true });

// The board's four effects, the moments to compare (ms into the effect), and what Shamble VFX shows for each.
// "ours" names an effect in the demo project and a preview scene; it changes as the presets are built.
export const CASES = {
  muzzle: { times: [15, 45, 80, 160], ours: { effect: 'board_muzzle', scene: 'board-muzzle' } },
  molotov: { times: [150, 1200, 3000, 4600], ours: { effect: 'board_molotov', scene: 'board-molotov' } },
  beam: { times: [200, 1000, 2000, 3000], ours: { effect: 'board_beam', scene: 'board-beam' } },
  shell: { times: [100, 400, 600, 700, 1300, 1700], ours: { effect: 'board_shell', scene: 'board-shell' } },
};
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const factions = process.argv.includes('--all-factions') ? ['Soviets', 'Allies', 'Empire'] : ['Soviets'];
const sides = process.argv.includes('--both-sides') ? ['enemy', 'ours'] : ['enemy'];

const server = await createServer({ root: join(repo, 'packages', 'vfx-editor'), configFile: join(repo, 'packages', 'vfx-editor', 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

// The board, with its font request blocked (no call to Google from a check).
const boardPage = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
await boardPage.route('**/*', (r) => (/fonts\.(googleapis|gstatic)\.com/.test(r.request().url()) ? r.abort() : r.continue()));
await boardPage.goto('file://' + board);
await boardPage.waitForFunction(() => window.vfxBoard);

// Shamble VFX: the game screen only, 1280 x 720 (the board's size), WebGL 2.
const ours = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ours.goto(`${base}/?backend=webgl&frame=1&project=examples/demo-project`);
await ours.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });

async function boardAt(fx, t, fac, side) {
  const url = await boardPage.evaluate(([fx, t, fac, side]) => {
    const b = window.vfxBoard;
    Object.assign(b.S, { fx, fac, side, view: 'game', low: 'full', colour: 'heat', ff: 'shape', dist: 4, shellword: 'KABOOM', word: 'on', dark: 'burnt' });
    b.run(0);
    b.sync();
    b.at(t);
    return document.getElementById('stage').toDataURL('image/png');
  }, [fx, t, fac, side]);
  return PNG.sync.read(Buffer.from(url.split(',')[1], 'base64'));
}

async function oursAt(c, t, fac, side) {
  const shown = await ours.evaluate(async ([c, t, fac, side]) => {
    const a = window.__vfx.app;
    window.__vfxManual = true;
    const relation = side === 'enemy' ? 'enemy' : 'team';
    const ok = a.setupForChecks ? await a.setupForChecks({ effect: c.effect, scene: c.scene, faction: fac.toLowerCase(), relation, distance: 4 }) : a.pickEffect(c.effect);
    await a.showAt(t, 7);
    await a.showAt(t, 7);
    document.querySelector('.status')?.classList.remove('show');
    return ok;
  }, [c.ours, t, fac, side]);
  await ours.waitForTimeout(80);
  return { png: PNG.sync.read(await ours.screenshot()), shown };
}

function sideBySide(left, right, label) {
  const W = 1280, H = 720, top = 28;
  const img = new PNG({ width: W * 2 + 8, height: H + top });
  img.data.fill(255);
  const blit = (src, ox) => {
    for (let y = 0; y < Math.min(H, src.height); y++) for (let x = 0; x < Math.min(W, src.width); x++) {
      const s = (y * src.width + x) * 4, d = ((y + top) * img.width + x + ox) * 4;
      img.data[d] = src.data[s]; img.data[d + 1] = src.data[s + 1]; img.data[d + 2] = src.data[s + 2]; img.data[d + 3] = 255;
    }
  };
  blit(left, 0);
  blit(right, W + 8);
  // A thin ink bar between the two pictures.
  for (let y = 0; y < img.height; y++) for (let x = W; x < W + 8; x++) { const d = (y * img.width + x) * 4; img.data[d] = 17; img.data[d + 1] = 18; img.data[d + 2] = 26; }
  void label;
  return PNG.sync.write(img);
}

let n = 0;
for (const [fx, c] of Object.entries(CASES)) {
  if (only.length && !only.includes(fx)) continue;
  for (const fac of factions) for (const side of sides) for (const t of c.times) {
    const left = await boardAt(fx, t, fac, side);
    const right = await oursAt(c, t, fac, side);
    const name = `${fx}-${String(t).padStart(4, '0')}ms-${fac.toLowerCase()}-${side}.png`;
    writeFileSync(join(out, name), sideBySide(left, right.png, name));
    console.log(`${name}${right.shown ? '' : '  (ours: not built yet)'}`);
    n++;
  }
}
await browser.close();
await server.close();
console.log(`\n${n} side-by-side pictures in out/compare/ (left: the drawing board, right: Shamble VFX).`);
