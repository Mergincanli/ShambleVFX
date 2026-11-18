/**
 * The window's grid (src/app/layout.ts, docs/ui-redesign.md 5.2): the limits of the four sizes, and the centre never
 * narrower than 640 px. The browser check drags the splitters in the real editor.
 */
import { describe, expect, it } from 'vitest';
import { LIMITS, effectsRange, readSize, sideRange, sideWidths, timelineRange } from '../src/app/layout';

describe('the sidebars', () => {
  it('keep their widths within their limits', () => {
    expect(sideWidths(2560, 100, 900)).toEqual({ left: 200, right: 480 });
    expect(sideWidths(2560, 300, 300)).toEqual({ left: 300, right: 300 });
  });

  it('give way when the centre would be under 640 px, each in proportion to its room above its narrowest', () => {
    // 1280 px: 640 px for the two sidebars. Wished: 420 (220 above 200) and 480 (220 above 260): 260 too much, half each.
    const w = sideWidths(1280, 420, 480);
    expect(w.left + w.right).toBeCloseTo(640, 6);
    expect(w).toEqual({ left: 290, right: 350 });
    // Only one of them has room: it gives it all.
    const one = sideWidths(1280, 200, 480);
    expect(one).toEqual({ left: 200, right: 440 });
  });

  it('count a window under 1280 px as 1280 (#app is never narrower)', () => {
    expect(sideWidths(900, 420, 480)).toEqual(sideWidths(1280, 420, 480));
  });

  it('can be dragged as far as the other sidebar and the centre allow', () => {
    expect(sideRange('left', 2560, 320)).toEqual([200, 420]);
    expect(sideRange('left', 1280, 480)).toEqual([200, 200]);
    expect(sideRange('right', 1280, 300)).toEqual([260, 340]);
    expect(sideRange('right', 1920, 248)).toEqual([260, 480]);
  });
});

describe('the effects list and the timeline', () => {
  it('stay within their limits: the effects 120 px to the column less 160 px, the timeline 140 px to 60 %', () => {
    expect(effectsRange(1016)).toEqual([120, 856]);
    expect(timelineRange(1016)).toEqual([140, 1016 * 0.6]);
    // A very short window: the least is still allowed.
    expect(effectsRange(200)).toEqual([120, 120]);
    expect(timelineRange(200)).toEqual([140, 140]);
    expect(LIMITS.timelineMaxShare).toBe(0.6);
  });

  it('remember only a positive number of px', () => {
    expect(readSize('312')).toBe(312);
    expect(readSize(null)).toBeNull();
    expect(readSize('')).toBeNull();
    expect(readSize('wide')).toBeNull();
    expect(readSize('-4')).toBeNull();
  });
});
