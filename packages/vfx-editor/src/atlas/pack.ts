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
/** A round white dot (with a soft edge) for halftone: one textured square per dot instead of a many-sided disc. */
export const DOT_BLOCK = '__dot';
const DOT = 16;
const WHITE = 8;

/**
 * Where every image goes on the atlas page, with the white block and the dot. The editor's preview and the export both
 * use this, so the game's atlas has the same layout as the one the editor draws from.
 */
export function atlasLayout(images: readonly PackInput[], pad = 2): PackResult {
  return packRects([...images, { name: WHITE_BLOCK, width: WHITE, height: WHITE }, { name: DOT_BLOCK, width: DOT, height: DOT }], { padding: pad });
}

/** The dot's pixels: white, radius 7 of a 16 px square, a one-pixel soft edge, clear corners (RGBA, not premultiplied). */
export function dotPixels(): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(new ArrayBuffer(DOT * DOT * 4));
  for (let y = 0; y < DOT; y++) for (let x = 0; x < DOT; x++) {
    const d = Math.hypot(x + 0.5 - DOT / 2, y + 0.5 - DOT / 2);
    const i = (y * DOT + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = Math.round(255 * Math.min(1, Math.max(0, DOT / 2 - 1 + 0.5 - d)));
  }
  return px;
}

/** A picture as plain RGBA bytes, not premultiplied (as a PNG holds it). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/**
 * The atlas page as RGBA bytes, from each image's own bytes: images copied exactly, their edge pixels repeated into the
 * padding, the white block (with its padding white too) and the dot. Used by the export (Node has no canvas).
 */
export function composeAtlas(layout: PackResult, images: ReadonlyMap<string, Pixels>, pad = 2): Uint8Array {
  const W = layout.width, H = layout.height;
  const out = new Uint8Array(W * H * 4);
  const put = (x: number, y: number, src: Uint8Array | Uint8ClampedArray, si: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    out[o] = src[si]!; out[o + 1] = src[si + 1]!; out[o + 2] = src[si + 2]!; out[o + 3] = src[si + 3]!;
  };
  for (const [name, im] of images) {
    const r = layout.rects[name];
    if (!r) continue;
    for (let y = -pad; y < im.height + pad; y++) {
      const sy = Math.min(im.height - 1, Math.max(0, y));
      for (let x = -pad; x < im.width + pad; x++) {
        const sx = Math.min(im.width - 1, Math.max(0, x));
        put(r.x + x, r.y + y, im.data, (sy * im.width + sx) * 4);
      }
    }
  }
  const w = layout.rects[WHITE_BLOCK]!;
  const white = new Uint8Array([255, 255, 255, 255]);
  for (let y = -pad; y < w.h + pad; y++) for (let x = -pad; x < w.w + pad; x++) put(w.x + x, w.y + y, white, 0);
  const d = layout.rects[DOT_BLOCK]!;
  const dot = dotPixels();
  for (let y = 0; y < DOT; y++) for (let x = 0; x < DOT; x++) put(d.x + x, d.y + y, dot, (y * DOT + x) * 4);
  return out;
}

/** Cut one image back out of an atlas page (for importing an export). */
export function cutFromAtlas(page: Pixels, r: AtlasRect): Uint8Array {
  const out = new Uint8Array(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const src = ((r.y + y) * page.width + r.x) * 4;
    out.set(page.data.subarray(src, src + r.w * 4), y * r.w * 4);
  }
  return out;
}

/** Paint the atlas page. Each image's edge pixels are repeated into its padding, so filtering never bleeds. */
export function drawAtlas(images: readonly AtlasImage[], pad = 2): Atlas {
  const packed = atlasLayout(images, pad);
  const canvas = document.createElement('canvas');
  canvas.width = packed.width;
  canvas.height = packed.height;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const w = packed.rects[WHITE_BLOCK]!;
  g.fillStyle = '#ffffff';
  g.fillRect(w.x - pad, w.y - pad, w.w + 2 * pad, w.h + 2 * pad);
  // The dot: the same pixels the export writes.
  const d = packed.rects[DOT_BLOCK]!;
  g.putImageData(new ImageData(dotPixels(), DOT, DOT), d.x, d.y);
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
