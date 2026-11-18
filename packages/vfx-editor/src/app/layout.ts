/**
 * The window's grid (docs/ui-redesign.md 5.2): the left sidebar, the centre (the preview over the timeline) and the right
 * panel, with four splitters. The default sizes are custom properties in style.css (one set for windows 2200 px wide or
 * more, one for narrower ones); a dragged size is remembered in localStorage and overrides its default, set inline on #app.
 * A double-click on a splitter forgets it.
 *
 * Sizes are kept within their limits, and the centre is never narrower than 640 px: when the window is too narrow for the
 * remembered widths, both sidebars give way, each in proportion to its room above its narrowest. The remembered size stays
 * what was dragged, so a window that grows again gets it back.
 */
import { splitter } from './dom';
import type { SplitterView } from './dom';

export type SizeKey = 'left' | 'right' | 'effects' | 'timeline';

/** Where each size is remembered. */
export const SIZE_KEYS: Readonly<Record<SizeKey, string>> = {
  left: 'vfx-size:left', right: 'vfx-size:right', effects: 'vfx-size:effects', timeline: 'vfx-size:timeline',
};

export const LIMITS = {
  left: [200, 420] as const,
  right: [260, 480] as const,
  /** The effects list: at least this tall, and this much of the column left for the layers. */
  effectsMin: 120,
  effectsRoomBelow: 160,
  /** The timeline: at least this tall, and at most this share of the centre column. */
  timelineMin: 140,
  timelineMaxShare: 0.6,
  centreMin: 640,
  windowMin: 1280,
} as const;

/** One press of an arrow key on a splitter. */
export const KEY_STEP = 16;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The sidebars' widths for a window `width` px wide (never under 1280, #app's narrowest), from the wished ones: each within
 * its limits, and both narrower when the centre would be under 640 px, each in proportion to its room above its narrowest.
 */
export function sideWidths(width: number, left: number, right: number): { left: number; right: number } {
  let l = clamp(left, ...LIMITS.left), r = clamp(right, ...LIMITS.right);
  const room = Math.max(width, LIMITS.windowMin) - LIMITS.centreMin;
  const over = l + r - room;
  if (over > 0) {
    const roomL = l - LIMITS.left[0], roomR = r - LIMITS.right[0];
    const share = roomL + roomR > 0 ? roomL / (roomL + roomR) : 0.5;
    l -= over * share;
    r -= over * (1 - share);
  }
  return { left: l, right: r };
}

/** How wide one sidebar may be dragged while the other one is `other` px wide, in a window `width` px wide. */
export function sideRange(key: 'left' | 'right', width: number, other: number): [number, number] {
  const [lo, hi] = LIMITS[key];
  return [lo, Math.max(lo, Math.min(hi, Math.max(width, LIMITS.windowMin) - LIMITS.centreMin - other))];
}

/** How tall the effects list may be in a left column `column` px tall. */
export function effectsRange(column: number): [number, number] {
  return [LIMITS.effectsMin, Math.max(LIMITS.effectsMin, column - LIMITS.effectsRoomBelow)];
}

/** How tall the timeline may be in a centre column `column` px tall. */
export function timelineRange(column: number): [number, number] {
  return [LIMITS.timelineMin, Math.max(LIMITS.timelineMin, column * LIMITS.timelineMaxShare)];
}

/** A remembered size: a positive number of px, or null. */
export function readSize(v: string | null): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CSS_VAR: Readonly<Record<SizeKey, string>> = { left: '--left-w', right: '--right-w', effects: '--effects-h', timeline: '--timeline-h' };

const store = {
  get(key: SizeKey): number | null { try { return readSize(localStorage.getItem(SIZE_KEYS[key])); } catch { return null; } },
  set(key: SizeKey, v: number): void { try { localStorage.setItem(SIZE_KEYS[key], String(Math.round(v))); } catch { /* storage may be blocked */ } },
  forget(key: SizeKey): void { try { localStorage.removeItem(SIZE_KEYS[key]); } catch { /* storage may be blocked */ } },
};

export interface GridParts {
  /** #app: the remembered sizes are set on it, inline, over the defaults on :root. */
  root: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
  centre: HTMLElement;
  /** The effects section (its height is --effects-h) and the timeline with its header (--timeline-h). */
  effects: HTMLElement;
  timeline: HTMLElement;
}

/**
 * The four splitters and the sizes they set. `changed` is called after a size changes (the preview and the timeline follow
 * by themselves, as their boxes change).
 */
export class GridSizes {
  readonly splitters: Record<SizeKey, SplitterView>;
  private readonly parts: GridParts;
  /** The size when a drag started. */
  private start = 0;

  constructor(parts: GridParts) {
    this.parts = parts;
    const make = (key: SizeKey, label: string, orientation: 'vertical' | 'horizontal', sign: 1 | -1) => splitter({
      label, orientation, className: `split-${key}`, tip: 'Drag to resize. Double-click to reset.',
      onStart: () => { this.start = this.current(key); },
      // Dragging the right sidebar's edge to the right, or the timeline's edge down, makes them smaller. A press that does not
      // move (a click, the first half of a double-click) remembers nothing.
      onDrag: (d, done) => { this.set(key, this.start + sign * d); if (done && d !== 0) this.remember(key); },
      onKey: (step) => {
        const [lo, hi] = this.range(key);
        this.set(key, step === 'min' ? lo : step === 'max' ? hi : this.current(key) + sign * step);
        this.remember(key);
      },
      onReset: () => this.reset(key),
    });
    this.splitters = {
      left: make('left', 'Resize the left sidebar', 'vertical', 1),
      right: make('right', 'Resize the right panel', 'vertical', -1),
      effects: make('effects', 'Resize the effects list', 'horizontal', 1),
      timeline: make('timeline', 'Resize the timeline', 'horizontal', -1),
    };
    window.addEventListener('resize', () => this.apply());
    // The zones' sizes can change without a splitter (the toolbar takes a second row): tell them afresh when one is focused.
    for (const s of Object.values(this.splitters)) s.el.addEventListener('focus', () => this.tell());
  }

  /** Lay out the remembered sizes (within the limits of the window as it is now), and tell screen readers the sizes. */
  apply(): void {
    const { root } = this.parts;
    const wishL = store.get('left'), wishR = store.get('right');
    if (wishL === null && wishR === null) { root.style.removeProperty('--left-w'); root.style.removeProperty('--right-w'); }
    else {
      const w = sideWidths(root.clientWidth, wishL ?? this.byDefault('left'), wishR ?? this.byDefault('right'));
      // A side with no remembered size keeps its default unless the other one's width pushes it.
      this.setVar('left', wishL === null && w.left === this.byDefault('left') ? null : w.left);
      this.setVar('right', wishR === null && w.right === this.byDefault('right') ? null : w.right);
    }
    for (const key of ['effects', 'timeline'] as const) {
      const wish = store.get(key);
      this.setVar(key, wish === null ? null : clamp(wish, ...this.range(key)));
    }
    this.tell();
  }

  /** Forget a remembered size: back to the default. */
  reset(key: SizeKey): void {
    store.forget(key);
    this.apply();
  }

  /** The size it has now, as laid out, in px. */
  current(key: SizeKey): number {
    const p = this.parts;
    return key === 'left' ? p.left.offsetWidth : key === 'right' ? p.right.offsetWidth : key === 'effects' ? p.effects.offsetHeight : p.timeline.offsetHeight;
  }

  /** The sizes it may take now, in px. */
  range(key: SizeKey): [number, number] {
    const p = this.parts;
    if (key === 'left') return sideRange('left', p.root.clientWidth, p.right.offsetWidth);
    if (key === 'right') return sideRange('right', p.root.clientWidth, p.left.offsetWidth);
    if (key === 'effects') return effectsRange(p.left.clientHeight);
    return timelineRange(p.centre.clientHeight);
  }

  /** A size while it is dragged or moved with the keys: within its limits, laid out at once. */
  private set(key: SizeKey, v: number): void {
    this.setVar(key, clamp(v, ...this.range(key)));
    this.tell();
  }

  /** Remember the size it has now (after a drag or a key). */
  private remember(key: SizeKey): void {
    store.set(key, this.current(key));
    this.apply();
  }

  /** The default width of a sidebar for this window, from style.css (:root, so a size set on #app does not hide it). */
  private byDefault(key: 'left' | 'right'): number {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(CSS_VAR[key])) || LIMITS[key][0];
  }

  private setVar(key: SizeKey, px: number | null): void {
    if (px === null) this.parts.root.style.removeProperty(CSS_VAR[key]);
    else this.parts.root.style.setProperty(CSS_VAR[key], `${Math.round(px)}px`);
  }

  /** aria-valuenow, -min and -max of every splitter, from the layout as it is now. */
  private tell(): void {
    for (const key of ['left', 'right', 'effects', 'timeline'] as const) {
      const [lo, hi] = this.range(key);
      this.splitters[key].setValue(this.current(key), lo, hi);
    }
  }
}
