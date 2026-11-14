// Draws the demo project's placeholder sprites with Canvas 2D in headless Chromium and saves them as PNGs.
// These are Shamble VFX's own test drawings (straight-edged comic shapes, flat colours, ink lines), not game art.
// Run: npm run images   (writes examples/demo-project/images/*.png)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'demo-project', 'images');
mkdirSync(out, { recursive: true });

// Colours come from the palette roles' values (heat ramp, ink). Sprites tinted at run time are drawn white/grey.
const page = `<!doctype html><canvas id=c></canvas><script>
const INK = '#11121A', H1 = '#F47A1C', H2 = '#FFB02E', H3 = '#FFE27A', H4 = '#FFF4D6', BURNT = '#B85207';
const TAU = Math.PI * 2;
function rnd(a, b) { const x = Math.sin(a * 127.1 + b * 311.7 + 0.5) * 43758.5453; return x - Math.floor(x); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function poly(g, pts, fill, stroke, lw) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); } if (fill) { g.fillStyle = fill; g.fill(); } }
function star(x, y, r0, r1, n, rot, seed, jit) { const o = []; for (let i = 0; i < n * 2; i++) { const a = rot + Math.PI * i / n; const r = (i % 2 ? r1 : r0) * (1 + (rnd(seed, i) - 0.5) * (jit || 0)); o.push([x + r * Math.cos(a), y + r * Math.sin(a)]); } return o; }
// A muzzle flash pointing right: a long spike forward, two side spikes, a short one back (after the board's flash idea, own shape).
function flashShape(x, y, L, jit) { return [[x + L, y], [x + L * 0.45, y - L * (0.13 + jit)], [x + L * 0.4, y - L * 0.42], [x + L * 0.2, y - L * 0.17], [x - L * 0.12, y - L * (0.26 - jit)],
  [x + L * 0.02, y], [x - L * 0.12, y + L * 0.26], [x + L * 0.2, y + L * (0.17 + jit)], [x + L * 0.4, y + L * 0.42], [x + L * 0.45, y + L * 0.13]]; }
function frames(cols, rows, size, draw) { const c = canvas(cols * size, rows * size), g = c.getContext('2d');
  for (let f = 0; f < cols * rows; f++) { g.save(); g.translate((f % cols) * size, Math.floor(f / cols) * size); g.beginPath(); g.rect(0, 0, size, size); g.clip(); draw(g, f, size); g.restore(); } return c; }
const shapes = {};
// 1. Rifle muzzle flash: 4 frames, 24 a second on the board. Pivot near the left edge (the muzzle).
shapes.muzzle_flash = frames(2, 2, 256, (g, f, s) => {
  const k = [1, 0.82, 0.62, 0.34][f], L = s * 0.8 * k, x = s * 0.16, y = s / 2, j = f % 2 ? 0.07 : 0;
  if (f < 3) { poly(g, flashShape(x, y, L, j), H1, INK, 9); poly(g, flashShape(x, y, L * 0.72, j), H2); poly(g, flashShape(x, y, L * 0.46, j), H3); poly(g, flashShape(x, y, L * 0.24, j), H4); }
  else { for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.7, r = L * 0.9; poly(g, star(x + Math.cos(a) * r, y + Math.sin(a) * r, 14, 5, 2, a, f, 0), H2, INK, 5); } }
});
// 2. Tracer body: a streak, thick at the head (right), thin at the tail. White, tinted at run time (glow).
shapes.tracer_body = (() => { const c = canvas(512, 48), g = c.getContext('2d');
  poly(g, [[6, 24], [440, 10], [506, 24], [440, 38]], '#FFFFFF', INK, 6); poly(g, [[60, 24], [440, 17], [490, 24], [440, 31]], '#E4E4E4'); return c; })();
// 3. Tracer core: a hot white line along the middle (kept as drawn).
shapes.tracer_core = (() => { const c = canvas(512, 48), g = c.getContext('2d'); poly(g, [[120, 24], [450, 20], [500, 24], [450, 28]], '#FFFFFF'); return c; })();
// 4. Hit star: six points, white with a grey half, ink edge. Tinted at run time.
shapes.hit_star = (() => { const c = canvas(160, 160), g = c.getContext('2d');
  const p = star(80, 80, 70, 16, 6, 0.4, 3, 0.35); poly(g, p, '#FFFFFF', INK, 7); poly(g, star(80, 80, 34, 9, 6, 0.4, 3, 0.2), '#FFFFFF'); return c; })();
// 5. Dust puff: three frames, a lump of rounds that swells and breaks. Light grey and white, tinted at run time (dust).
shapes.dust_puff = frames(3, 1, 192, (g, f, s) => {
  const r = s * [0.18, 0.25, 0.22][f], cx = s / 2, cy = s * 0.58; const parts = [[0, 0, 1], [-0.8, 0.25, 0.65], [0.8, 0.2, 0.7], [0.1, -0.6, 0.72]];
  const off = f === 2 ? 0.35 : 0;
  parts.forEach((q) => { g.beginPath(); g.arc(cx + q[0] * r * (1 + off), cy + q[1] * r * (1 + off) - f * 6, q[2] * r + 5, 0, TAU); g.fillStyle = INK; g.fill(); });
  parts.forEach((q) => { g.beginPath(); g.arc(cx + q[0] * r * (1 + off), cy + q[1] * r * (1 + off) - f * 6, q[2] * r, 0, TAU); g.fillStyle = '#FFFFFF'; g.fill(); });
  parts.forEach((q) => { g.beginPath(); g.arc(cx + q[0] * r * (1 + off) + r * 0.15, cy + q[1] * r * (1 + off) - f * 6 + r * 0.2, q[2] * r * 0.62, 0, TAU); g.fillStyle = '#CFCFCF'; g.fill(); });
});
// 6. Shell trail: a white streak (tinted with the team colour at run time). 7. Shell head: a hot point, kept as drawn.
shapes.shell_trail = (() => { const c = canvas(384, 48), g = c.getContext('2d'); poly(g, [[6, 24], [330, 12], [378, 24], [330, 36]], '#FFFFFF', INK, 7); return c; })();
shapes.shell_head = (() => { const c = canvas(96, 48), g = c.getContext('2d'); poly(g, [[8, 24], [40, 9], [88, 24], [40, 39]], H3, INK, 6); poly(g, [[24, 24], [44, 16], [74, 24], [44, 32]], H4); return c; })();
// 8. Heavy gun blast: more orange, no white (the Art lead's note on the tank). Three frames, pointing right.
shapes.gun_blast = frames(3, 1, 256, (g, f, s) => {
  const k = [1.15, 1, 0.7][f], R = s * 0.3 * k, x = s * 0.42, y = s / 2;
  poly(g, star(x, y, R, R * 0.42, 9, f * 0.05, 31, 0.6), BURNT, INK, 8); poly(g, star(x, y, R * 0.74, R * 0.33, 9, f * 0.05 + 0.2, 37, 0.5), H1); poly(g, star(x, y, R * 0.42, R * 0.19, 7, 0.3, 41, 0.4), H2);
});
// 9. Landing burst: frame 1 a white flash, then the shards in the heat colours, shrinking (four frames).
shapes.burst = frames(2, 2, 320, (g, f, s) => {
  const cx = s / 2, cy = s / 2, R = s * 0.42;
  if (f === 0) { poly(g, star(cx, cy, R * 1.05, R * 0.5, 11, 0.1, 4, 0.5), '#FFFFFF', INK, 9); return; }
  const k = [0, 1.06, 0.92, 0.7][f];
  poly(g, star(cx, cy, R * k, R * k * 0.5, 11, 0.1 + f * 0.04, 4, 0.55), H1, INK, 9);
  poly(g, star(cx, cy, R * k * 0.72, R * k * 0.36, 11, 0.4 + f * 0.04, 15, 0.4), H2);
  poly(g, star(cx, cy, R * k * 0.47, R * k * 0.24, 9, 0.7, 27, 0.35), H3);
  if (f < 3) poly(g, star(cx, cy, R * k * 0.25, R * k * 0.12, 8, 1.0, 35, 0.3), H4);
});
// 10. A plain white square, for the colour check.
shapes.white = (() => { const c = canvas(32, 32), g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 32, 32); return c; })();
window.__shapes = Object.fromEntries(Object.entries(shapes).map(([k, c]) => [k, c.toDataURL('image/png')]));
</script>`;

const browser = await chromium.launch();
const p = await browser.newPage();
await p.setContent(page);
const shapes = await p.evaluate(() => window.__shapes);
for (const [name, url] of Object.entries(shapes)) {
  writeFileSync(join(out, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`wrote images/${name}.png`);
}
await browser.close();
