// One effect in one preview scene at chosen moments, as the game screen (1280 x 720), for looking closely.
// Usage: node shoot.mjs <effect> <scene> <ms> <out.png> [view=close] [closeOn=target] [relation=enemy] [hideLayers=a,b]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const [effect, scene, ms, out, view = 'close', closeOn = 'target', relation = 'enemy', hide = '', faction = 'soviets'] = process.argv.slice(2);
const server = await createServer({ root: `${repo}/packages/vfx-editor`, configFile: `${repo}/packages/vfx-editor/vite.config.ts`, logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/?backend=webgl&frame=1&project=examples/demo-project`);
await page.waitForFunction(() => window.__vfx && window.__vfx.ready, null, { timeout: 60000 });
for (const t of ms.split(',')) {
  await page.evaluate(async ([effect, scene, t, view, closeOn, relation, hide, faction]) => {
    const a = window.__vfx.app;
    window.__vfxManual = true;
    await a.setupForChecks({ effect, scene, faction, relation, distance: 4 });
    if (hide) {
      const fx = a.effect();
      const keep = fx.layers.filter((l) => !hide.split(',').includes(l.id));
      a.history.doc.effects[a.history.doc.effects.indexOf(fx)] = { ...fx, layers: keep };
    }
    a.previewForChecks.setCloseOn(closeOn);
    a.previewForChecks.setView(view);
    await a.showAt(+t, 7);
    await a.showAt(+t, 7);
    document.querySelector('.status')?.classList.remove('show');
  }, [effect, scene, t, view, closeOn, relation, hide, faction]);
  await page.waitForTimeout(60);
  const file = ms.includes(',') ? out.replace('.png', `-${t}.png`) : out;
  await page.screenshot({ path: file });
  console.log(file);
}
if (errors.length) console.log('ERRORS:', errors.join('\n'));
await browser.close();
await server.close();
