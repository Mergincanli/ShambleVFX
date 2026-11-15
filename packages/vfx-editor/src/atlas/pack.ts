/**
 * Packs the project's images into one atlas page: the same packing the export will use (milestone 3),
 * so the editor draws from an atlas exactly like the game.
 * packRects() only places rectangles (tested in Node); drawAtlas() paints the page in the browser.
 */
import type { Atlas, AtlasRect } from '@shamble/vfx-runtime';

export interface PackInput {
  name: string;
  width: number;
  height: number;
}

export interface PackResult {
  width: number;
  height: number;
  rects: Record<string, AtlasRect>;
}

/** Shelf packing: tallest first, left to right, a new shelf when a row is full. `padding` px around every image. */
export function packRects(items: readonly PackInput[], opts: { maxWidth?: number; padding?: number } = {}): PackResult {
  const pad = opts.padding ?? 2;
  const maxW = opts.maxWidth ?? 4096;
  const area = items.reduce((a, i) => a + (i.width + 2 * pad) * (i.height + 2 * pad), 0);
  const widest = items.reduce((m, i) => Math.max(m, i.width + 2 * pad), 0);
  let width = 256;
  while (width < Math.sqrt(area) * 1.15 && width < maxW) width *= 2;
  width = Math.min(maxW, Math.max(width, widest));
  const sorted = [...items].sort((a, b) => b.height - a.height || a.name.localeCompare(b.name));
  const rects: Record<string, AtlasRect> = {};
  let x = 0, y = 0, rowH = 0;
  for (const it of sorted) {
    const w = it.width + 2 * pad, h = it.height + 2 * pad;
    if (x + w > width) { x = 0; y += rowH; rowH = 0; }
    rects[it.name] = { x: x + pad, y: y + pad, w: it.width, h: it.height };
    x += w;
    rowH = Math.max(rowH, h);
  }
  const height = Math.max(4, Math.ceil((y + rowH) / 4) * 4);
  return { width, height, rects };
}

export interface AtlasImage {
  name: string;
  image: CanvasImageSource;
  width: number;
  height: number;
}

/** The block of plain white every atlas holds: shapes, words and particles are drawn with it. */
export const WHITE_BLOCK = '__white';

/** Paint the atlas page. Each image's edge pixels are repeated into its padding, so filtering never bleeds. */
export function drawAtlas(images: readonly AtlasImage[], pad = 2): Atlas {
  const packed = packRects([...images, { name: WHITE_BLOCK, width: 8, height: 8 }], { padding: pad });
  const canvas = document.createElement('canvas');
  canvas.width = packed.width;
  canvas.height = packed.height;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const w = packed.rects[WHITE_BLOCK]!;
  g.fillStyle = '#ffffff';
  g.fillRect(w.x - pad, w.y - pad, w.w + 2 * pad, w.h + 2 * pad);
  for (const im of images) {
    const r = packed.rects[im.name]!;
    const { x, y, w, h } = r;
    g.drawImage(im.image, x, y);
    // Repeat the edges into the padding (left, right, top, bottom, then corners).
    g.drawImage(im.image, 0, 0, 1, h, x - pad, y, pad, h);
    g.drawImage(im.image, w - 1, 0, 1, h, x + w, y, pad, h);
    g.drawImage(im.image, 0, 0, w, 1, x, y - pad, w, pad);
    g.drawImage(im.image, 0, h - 1, w, 1, x, y + h, w, pad);
    g.drawImage(im.image, 0, 0, 1, 1, x - pad, y - pad, pad, pad);
    g.drawImage(im.image, w - 1, 0, 1, 1, x + w, y - pad, pad, pad);
    g.drawImage(im.image, 0, h - 1, 1, 1, x - pad, y + h, pad, pad);
    g.drawImage(im.image, w - 1, h - 1, 1, 1, x + w, y + h, pad, pad);
  }
  return { image: canvas, width: packed.width, height: packed.height, rects: packed.rects };
}
