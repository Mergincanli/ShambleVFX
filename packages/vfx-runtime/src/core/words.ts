/**
 * Comic sound words in our own block letters (committed with Mustafa's permission, 2026-11-15).
 * A word is built back to front: a dark copy pushed down and to the side, a black outline, then the letter in two flat
 * tones with a hard edge between them. Each letter turns a little and sits a little off the line; the whole word leans.
 */
import type { WordLayer } from '@shamble/vfx-format';
import { breakProgress, clamp01, curveAt, pick } from './draw';
import type { DrawCtx } from './draw';
import { LETTERS } from './letters';
import type { Letter } from './letters';
import type { RGBA } from './painter';

const DEG = Math.PI / 180;

/** Which word of the list a play shows (from the seed). */
export function wordIndex(l: WordLayer, rnd: (a: number, b?: number) => number): number {
  return Math.min(l.words.length - 1, Math.floor(rnd(1) * l.words.length));
}

/** The size share a word gets at a distance from the player who sees it. */
export function wordDistanceScale(l: WordLayer, distanceM: number): number {
  return curveAt(l.distance.curve, distanceM);
}

interface Item { g: Letter; s: number; x: number; b: number; r: number; w: number }

export function drawWord(l: WordLayer, ctx: DrawCtx & { viewerDistanceM: number }): void {
  if (l.visibleTo === 'shooter' && ctx.relation !== 'self') return;
  const dist = wordDistanceScale(l, ctx.viewerDistanceM);
  if (l.letterPx * dist < l.distance.minPx) return;
  const popOn = ctx.n >= 0 ? ctx.n < l.pop.steps : ctx.tau < l.pop.steps * ctx.stepMs;
  const kb = breakProgress(ctx, l.breakUp);
  const brk = l.breakSteps > 0 ? Math.max(0, 1 - Math.floor(kb * (l.breakSteps + 1)) / l.breakSteps) : 1 - kb;
  const jitter = 1 + (ctx.rnd(2) * 2 - 1) * l.sizeJitter;
  const hPx = l.letterPx * dist * jitter * (popOn ? l.pop.scale : 1) * brk * ctx.s;
  if (hPx < 1) return;
  const h = ctx.px(hPx), u = h / 7;

  // Layout in letter units (cap height 7).
  const text = l.words[wordIndex(l, ctx.rnd)]!.toUpperCase();
  const chars = [...text].filter((ch) => LETTERS[ch]);
  const n = chars.length;
  if (!n) return;
  const items: Item[] = [];
  let x = 0;
  chars.forEach((ch, i) => {
    const g = LETTERS[ch]!;
    const s = 1 + l.ramp * (n > 1 ? i / (n - 1) - 0.5 : 0);
    items.push({ g, s, x, b: (ctx.rnd(3, i * 2 + 1) * 2 - 1) * l.bounce, r: (ctx.rnd(3, i * 2 + 2) * 2 - 1) * l.turnDeg * DEG, w: g.w * s });
    x += (g.w + 0.5) * s;
  });
  const tot = x - 0.5 * items[n - 1]!.s;
  const sl = Math.tan(l.slantDeg * DEG);
  const tilt = pick(l.tiltDeg, ctx.rnd(4)) * DEG;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const rise = l.riseM * (l.breakUp ? kb : ctx.t);

  const tf = (it: Item, px: number, py: number, ox = 0, oy = 0): [number, number] => {
    const mx = it.w / 2, my = 3.5 * it.s, ca = Math.cos(it.r), sa = Math.sin(it.r);
    const sx = px * it.s - mx, sy = py * it.s - my;
    let qx = mx + sx * ca - sy * sa + it.x - tot / 2;
    const qy = my + sx * sa + sy * ca + it.b - 3.5;
    qx += qy * sl;
    return [(qx * ct - qy * st) * u + ox, (qx * st + qy * ct) * u + rise + oy];
  };
  const contour = (it: Item, c: number[], ox: number, oy: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < c.length; i += 2) out.push(...tf(it, c[i]!, c[i + 1]!, ox, oy));
    return out;
  };
  const fill = (it: Item, col: RGBA, ox: number, oy: number) => {
    const P = it.g.points.map((_, i) => i);
    void P;
    for (let i = 0; i < it.g.tris.length; i += 3) {
      const a = it.g.tris[i]!, b = it.g.tris[i + 1]!, c = it.g.tris[i + 2]!;
      const A = tf(it, it.g.points[a * 2]!, it.g.points[a * 2 + 1]!, ox, oy);
      const B = tf(it, it.g.points[b * 2]!, it.g.points[b * 2 + 1]!, ox, oy);
      const C = tf(it, it.g.points[c * 2]!, it.g.points[c * 2 + 1]!, ox, oy);
      ctx.p.poly([A[0], A[1], B[0], B[1], C[0], C[1]], col);
    }
  };

  const k = ctx.px(Math.max(1.8, hPx * 0.062));
  const gap = l.separation ? k * 0.55 : 0;
  const ink = ctx.rgba('ink');
  const back = ctx.rgba(l.colours.back), top = ctx.rgba(l.colours.top), bottom = ctx.rgba(l.colours.bottom);
  const ox = 0.085 * h, oy = -0.1 * h;

  // 1. The pushed-back copy of every letter: its outline, then its fill.
  for (const it of items) for (const c of it.g.contours) ctx.p.stroke(contour(it, c, ox, oy), true, 2 * k, ink);
  for (const it of items) fill(it, back, ox, oy);
  // 2. Each letter: black under (outline and body), the separation line, then the two flat tones.
  for (const it of items) {
    for (const c of it.g.contours) ctx.p.stroke(contour(it, c, 0, 0), true, 2 * (k + gap), ink);
    fill(it, ink, 0, 0);
    if (l.separation && gap > 0) for (const c of it.g.contours) ctx.p.stroke(contour(it, c, 0, 0), true, 2 * gap, ctx.rgba(l.separation));
    // The hard edge between the tones: a line across the letter at 54 % of the way from its top to its foot.
    const T = tf(it, it.g.w / 2, 7), F = tf(it, it.g.w / 2 + 1.2, 0);
    const dx = F[0] - T[0], dy = F[1] - T[1], dl = Math.hypot(dx, dy) || 1;
    const nx = dx / dl, ny = dy / dl, sx = T[0] + dx * 0.54, sy = T[1] + dy * 0.54;
    for (let i = 0; i < it.g.tris.length; i += 3) {
      const tri: number[] = [];
      for (let j = 0; j < 3; j++) {
        const v = it.g.tris[i + j]!;
        tri.push(...tf(it, it.g.points[v * 2]!, it.g.points[v * 2 + 1]!));
      }
      const upper = clipHalf(tri, nx, ny, sx, sy, -1);
      const lower = clipHalf(tri, nx, ny, sx, sy, 1);
      if (upper.length >= 6) ctx.p.poly(upper, top);
      if (lower.length >= 6) ctx.p.poly(lower, bottom);
    }
  }
  ctx.p.item(items.length);
  void clamp01;
}

/** The part of a convex polygon on one side of a line through (sx, sy) with normal (nx, ny): side -1 or +1. */
function clipHalf(pts: number[], nx: number, ny: number, sx: number, sy: number, side: 1 | -1): number[] {
  const out: number[] = [];
  const n = pts.length / 2;
  const d = (i: number) => ((pts[i * 2]! - sx) * nx + (pts[i * 2 + 1]! - sy) * ny) * side;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const di = d(i), dj = d(j);
    if (di >= 0) out.push(pts[i * 2]!, pts[i * 2 + 1]!);
    if ((di >= 0) !== (dj >= 0)) {
      const t = di / (di - dj);
      out.push(pts[i * 2]! + (pts[j * 2]! - pts[i * 2]!) * t, pts[i * 2 + 1]! + (pts[j * 2 + 1]! - pts[i * 2 + 1]!) * t);
    }
  }
  return out;
}
