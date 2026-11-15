// Cuts the block letters (packages/vfx-runtime/data/letters.json) into triangles once, so the runtime never has to.
// Run: npm run letters   (writes packages/vfx-runtime/src/core/letters.ts)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShapeUtils, Vector2 } from 'three';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'packages/vfx-runtime/data/letters.json'), 'utf8'));

const area = (c) => { let a = 0; for (let i = 0; i < c.length; i++) { const [x0, y0] = c[i], [x1, y1] = c[(i + 1) % c.length]; a += x0 * y1 - x1 * y0; } return a / 2; };
const inside = (x, y, c) => { let r = false; for (let i = 0, j = c.length - 1; i < c.length; j = i++) { const [xi, yi] = c[i], [xj, yj] = c[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; };

// Letters marked "from": "shamble-vfx" are our own drawing in the board's style, not the board's: the header names them.
const ours = Object.entries(src.letters).filter(([, g]) => g.from === 'shamble-vfx').map(([ch]) => ch);
const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a.join(''));

const letters = {};
for (const [ch, g] of Object.entries(src.letters)) {
  // Outlines go one way round (positive area), holes the other. Each hole belongs to the outline around it.
  const outers = g.c.filter((c) => area(c) > 0);
  const holes = g.c.filter((c) => area(c) < 0);
  const points = [];
  const tris = [];
  for (const outer of outers) {
    const mine = holes.filter((h) => inside(h[0][0], h[0][1], outer));
    const all = [outer, ...mine];
    const base = points.length / 2;
    const faces = ShapeUtils.triangulateShape(outer.map(([x, y]) => new Vector2(x, y)), mine.map((h) => h.map(([x, y]) => new Vector2(x, y))));
    for (const c of all) for (const [x, y] of c) points.push(x, y);
    for (const f of faces) tris.push(base + f[0], base + f[1], base + f[2]);
  }
  letters[ch] = { w: g.w, contours: g.c.map((c) => c.flat()), points, tris };
}

const body = `/**
 * Our own block letters, cut into triangles. Made by tools/build-letters.mjs from data/letters.json: do not edit by hand.
 * ${src.about}${ours.length ? `\n * Drawn by Shamble VFX in the board's style, waiting for the Art lead's review: ${list(ours)}.` : ''}
 */
export interface Letter {
  /** Width in letter units (the cap height is 7). */
  w: number;
  /** Outlines and holes, as flat [x, y, ...] lists: the ink is stroked along these. */
  contours: number[][];
  /** Every corner, flat [x, y, ...]. */
  points: number[];
  /** The fill: index triples into points. */
  tris: number[];
}

export const LETTERS: Record<string, Letter> = ${JSON.stringify(letters)};
`;
writeFileSync(join(root, 'packages/vfx-runtime/src/core/letters.ts'), body);
console.log(`wrote ${Object.keys(letters).length} letters`);
