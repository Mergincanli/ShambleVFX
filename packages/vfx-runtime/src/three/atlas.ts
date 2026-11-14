/**
 * The runtime's only way to get images: one atlas page and a rectangle per image name.
 * The editor packs the project's PNGs into an atlas the same way the export will, so both draw the same.
 */
import type { UvRect } from '../core/evaluate';

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Atlas {
  /** The packed page: a canvas, an ImageBitmap or a loaded image. */
  image: TexImageSource | OffscreenCanvas;
  width: number;
  height: number;
  /** Pixel rectangles, y measured from the top, keyed by image file name. */
  rects: Record<string, AtlasRect>;
}

/** A lookup from image name to 0..1 atlas coordinates (v from the top). */
export function atlasLookup(atlas: Atlas): (name: string) => UvRect | undefined {
  const cache = new Map<string, UvRect>();
  return (name) => {
    let r = cache.get(name);
    if (!r) {
      const px = atlas.rects[name];
      if (!px) return undefined;
      r = { u0: px.x / atlas.width, v0: px.y / atlas.height, u1: (px.x + px.w) / atlas.width, v1: (px.y + px.h) / atlas.height };
      cache.set(name, r);
    }
    return r;
  };
}
