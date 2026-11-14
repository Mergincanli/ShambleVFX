import { describe, expect, it } from 'vitest';
import { packRects } from '../src/atlas/pack';

describe('packRects', () => {
  it('places every image inside the page, with padding, and no two overlap', () => {
    const items = [
      { name: 'a', width: 512, height: 512 },
      { name: 'b', width: 512, height: 48 },
      { name: 'c', width: 160, height: 160 },
      { name: 'd', width: 576, height: 192 },
      { name: 'e', width: 32, height: 32 },
      { name: 'f', width: 768, height: 256 },
      { name: 'g', width: 640, height: 640 },
    ];
    const p = packRects(items, { padding: 2 });
    const rs = Object.entries(p.rects);
    expect(rs).toHaveLength(items.length);
    for (const [, r] of rs) {
      expect(r.x).toBeGreaterThanOrEqual(2);
      expect(r.y).toBeGreaterThanOrEqual(2);
      expect(r.x + r.w + 2).toBeLessThanOrEqual(p.width);
      expect(r.y + r.h + 2).toBeLessThanOrEqual(p.height);
    }
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i]![1], b = rs[j]![1];
      const apart = a.x + a.w + 4 <= b.x || b.x + b.w + 4 <= a.x || a.y + a.h + 4 <= b.y || b.y + b.h + 4 <= a.y;
      expect(apart).toBe(true);
    }
  });

  it('gives the same page for the same images, whatever their order', () => {
    const items = [{ name: 'x', width: 100, height: 40 }, { name: 'y', width: 80, height: 40 }, { name: 'z', width: 30, height: 90 }];
    expect(packRects(items)).toEqual(packRects([...items].reverse()));
  });
});
