/**
 * Fire: the bed of a flame pit and its tongues. Shamble VFX's own generators, made for the look of the Art lead's
 * drawing board (after Mustafa's two fire references): a boiling bed of rounded lumps in tone bands, dark at the rim and
 * bright in the middle; long S-curved tongues layered back to front, each with a shaded side and a light core; one ink
 * line round every shape; halftone where one tone meets the next. Every layout comes from the seed.
 *
 * Both draw facing the camera at the fire's centre on the ground. Ground places (x to the right, z away from the camera,
 * h up, metres) are laid onto the drawing's plane with the camera's own tilt, so the bed reads as lying on the ground.
 */
import type { BedShape, FlamesShape } from '@shamble/vfx-format';
import { breakProgress, clamp01, edgeLook, ease, pick, rampAt } from './draw';
import type { DrawCtx, GradientRamp } from './draw';
import { insidePolygon, ovalPoints } from './painter';
import type { RGBA } from './painter';

const TAU = Math.PI * 2;

/** How a ground offset shows on the drawing's plane: y = away x sa + up x ua. */
function tilt(ctx: DrawCtx): { sa: number; ua: number } {
  const f = ctx.p.frame;
  // "away" on the ground: world up crossed with the frame's x.
  const ax = f.u[2], az = -f.u[0];
  const l = Math.hypot(ax, az) || 1;
  return { sa: (ax * f.v[0] + az * f.v[2]) / l, ua: f.v[1] };
}

/** Grow-in and cool-down shared by bed and tongues: reach (0..1) in the start, and the fade in eight held steps. */
function lifeShape(ctx: DrawCtx, growMs: number, breakUp: BedShape['breakUp']): { reach: number; fadeK: number } {
  const reach = growMs > 0 ? ease(clamp01(ctx.tauRaw / growMs)) : 1;
  const fadeK = Math.floor(breakProgress(ctx, breakUp) * 8) / 8;
  return { reach, fadeK };
}

/** The line round fire shapes: heavy ink for an enemy's, a thin dark line of the fire's own for your team's. */
function fireLine(ctx: DrawCtx, edge: BedShape['edge'], inkPx: number, darkRole: string): { col: RGBA; w: number; heavy: boolean } | null {
  const look = edgeLook(edge, ctx.relation);
  if (look === 'none') return null;
  if (look === 'ink') return { col: ctx.rgba('ink'), w: ctx.px(inkPx), heavy: true };
  return { col: ctx.rgba(darkRole), w: ctx.px(inkPx * 0.66), heavy: false };
}

/** A lump in drawing coordinates; d and a: where it sits on the ground from its band's centre (distance, angle). */
interface Lump { x: number; y: number; rx: number; ry: number; a: number; i: number; d: number }

// ---------------------------------------------------------------- the bed

/**
 * One band of the bed, as shares of the bed's radius: its base oval (rho), its lumps (r0), and how far it sits towards
 * the camera (z, in tenths). Its lumps reach out to rho + r0 from the middle: its edge. Places on the bed run from the
 * middle (0) to the rim (1), as on a glow. lo to hi: the places the band shows, from where the next band in takes over
 * out to its own edge. c: its flat colour (a tone, or a banded gradient's stop). A smooth gradient (g) colours it by
 * place instead, kept between lo and hi.
 */
interface Band { rho: number; r0: number; z: number; c?: RGBA; g?: GradientRamp; lo: number; hi: number }

/**
 * The bed's bands, rim first.
 * - Tones, or a smooth gradient: one band per tone, in the places the bands have always had. A smooth gradient keeps
 *   that layout and blends its colours over it, from the middle out.
 * - A banded gradient: one band per stop. A stop's colour holds from its place out to the next stop (the last stop's to
 *   the rim; the first stop's from the very middle), so the band edges sit at the stops. A band with no room (two stops
 *   at one place, a stop at the rim) is left out.
 */
export function bedBands(sp: BedShape, ctx: DrawCtx): Band[] {
  const g = sp.gradient ? ctx.gradient?.(sp.gradient) : undefined;
  if (!g?.banded) {
    const K = sp.tones.length;
    const out = sp.tones.map((role, k): Band => ({ rho: 0.76 - 0.58 * (K > 1 ? k / (K - 1) : 0), r0: 0.24 - 0.03 * k, z: k, ...(g ? { g } : { c: ctx.rgba(role) }), lo: 0, hi: 0 }));
    out.forEach((b, k) => { b.hi = b.rho + b.r0; b.lo = k + 1 < K ? out[k + 1]!.rho + out[k + 1]!.r0 : 0; });
    return out;
  }
  const s = g.stops, out: Band[] = [];
  let z = 0, last = 1;
  for (let j = s.length - 1; j >= 0; j--) {
    const hi = j + 1 < s.length ? clamp01(s[j + 1]!.at) : 1, lo = j ? clamp01(s[j]!.at) : 0;
    if (hi <= lo) continue;
    const k = out.length;
    // Lumps as tones would have them, but never more than 0.6 of the band's reach; a band shifts towards the camera by
    // less when its edge is close to the last one's, so it stays inside it.
    const r0 = Math.min(Math.max(0.03, 0.24 - 0.03 * k), 0.6 * hi);
    if (k) z += Math.min(1, 9 * (last - hi));
    out.push({ rho: hi - r0, r0, z, c: s[j]!.c, lo, hi });
    last = hi;
  }
  return out;
}

/** A band's colour: its flat colour, or a smooth gradient's halfway through the band. */
function bandColour(b: Band): RGBA {
  return b.c ?? rampAt(b.g!, (b.lo + b.hi) / 2);
}

/** One band of the bed: a base oval and lumps round its edge, in drawing coordinates. */
function bandLumps(sp: BedShape, ctx: DrawCtx, b: Band, k: number, scale: number, boil: number, t: { sa: number; ua: number }): Lump[] {
  const R = sp.radiusM * ctx.s * scale;
  const rho = R * b.rho;
  const z = -R * 0.1 * b.z;                     // inner bands sit nearer the camera: the bright middle sits low, in front
  const n = Math.max(4, Math.round(sp.lumps * (rho / (R * 0.76))));
  const r0 = R * b.r0;
  const out: Lump[] = [{ x: 0, y: z * t.sa, rx: rho * 1.02, ry: rho * 1.02 * t.sa, a: 0, i: -1, d: 0 }];
  for (let i = 0; i < n; i++) {
    const a = (TAU * (i + 0.5 * (k % 2))) / n + (ctx.rnd(30 + k, i) - 0.5) * 0.35;
    const r = r0 * (0.8 + 0.4 * ctx.rnd(40 + k, i)) * (1 + 0.09 * Math.sin(boil * 2.1 + i * 2.3 + k));
    const d = rho * (0.95 + 0.1 * ctx.rnd(50 + k, i));
    const gx = d * Math.cos(a), gz = d * Math.sin(a) + z;
    const lift = (0.45 - 0.05 * k) * r;
    out.push({ x: gx, y: gz * t.sa + lift * t.ua, rx: r, ry: r * 0.78, a, i, d });
  }
  return out;
}

/**
 * A lump coloured by a smooth gradient: each corner takes the colour of its place (its distance from the band's middle
 * on the ground, as a share of the radius), as if the lump lay flat on the ground (a circle of its own radius), kept
 * between the band's lo and hi. So the middle cools when the inner bands go out. Same triangles as a plain lump.
 */
function placeDisc(ctx: DrawCtx, q: Lump, R: number, b: Band, segs = 20): void {
  const at = (ox: number, oz: number) => rampAt(b.g!, Math.min(b.hi, Math.max(b.lo, Math.hypot(q.d * Math.cos(q.a) + ox, q.d * Math.sin(q.a) + oz) / R)));
  const mid = ctx.p.vtx(q.x, q.y, at(0, 0)), rim: number[] = [];
  for (let i = 0; i < segs; i++) {
    const c = Math.cos((TAU * i) / segs), s = Math.sin((TAU * i) / segs);
    rim.push(ctx.p.vtx(q.x + c * q.rx, q.y + s * q.ry, at(c * q.rx, s * q.rx)));
  }
  for (let i = 0; i < segs; i++) ctx.p.target.tri(mid, rim[i]!, rim[(i + 1) % segs]!);
}

function insideLumps(x: number, y: number, list: Lump[]): boolean {
  for (const q of list) {
    const dx = (x - q.x) / q.rx, dy = (y - q.y) / q.ry;
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}

export function drawBed(sp: BedShape, ctx: DrawCtx): void {
  const { reach, fadeK } = lifeShape(ctx, sp.growMs, sp.breakUp);
  if (fadeK >= 0.9 || reach <= 0.01) return;
  const all = bedBands(sp, ctx);
  const K = all.length;
  const scale = reach * (1 - 0.3 * fadeK);
  const R = sp.radiusM * ctx.s * scale;
  // As it cools the middle goes first: fewer bands, from the inside out.
  const bands = K - Math.min(K - 1, Math.floor(fadeK * K * 1.003));
  const boil = Math.floor((ctx.n >= 0 ? ctx.n : ctx.tau / ctx.stepMs) / Math.max(1, sp.boilSteps));
  const t = tilt(ctx);
  const line = fireLine(ctx, sp.edge, sp.inkPx, sp.detailRole);
  const deep = ctx.rgba(sp.detailRole);
  for (let k = 0; k < bands; k++) {
    const b = all[k]!;
    const list = bandLumps(sp, ctx, b, k, scale, boil, t);
    if (sp.part === 'lumps') {
      // The line first, round every lump of the band, so overlapping lumps share one outline; then the fill.
      const lw = k === 0 && line ? line.w : (line ? line.w * 0.45 : ctx.px(sp.inkPx * 0.3));
      const lc = k === 0 && line ? line.col : deep;
      if (lw > 0) {
        if (k === 0 && line?.heavy) for (const q of list) ctx.p.stroke(ovalPoints(q.x - 0.5 * lw, q.y - 0.65 * lw, q.rx, q.ry, 20), true, 2 * lw, lc);
        for (const q of list) ctx.p.stroke(ovalPoints(q.x, q.y, q.rx, q.ry, 20), true, 2 * lw, lc);
      }
      for (const q of list) {
        if (b.c) ctx.p.disc(q.x, q.y, q.rx, q.ry, b.c, 20);
        else placeDisc(ctx, q, R, b);
      }
      continue;
    }
    // Detail: halftone of the next tone on each lump's outer side, where one tone meets the next; brush strokes.
    const next = bandColour(all[k + 1 < K ? k + 1 : K - 1]!);
    const step = ctx.px(10.1), dot = ctx.px(4.9);
    for (let qi = 1; qi < list.length; qi++) {
      const q = list[qi]!;
      // Only the base oval and the lump's neighbours can hold its halftone patch: test against those, not every lump.
      const near = [list[0]!, q, list[qi > 1 ? qi - 1 : list.length - 1]!, list[qi < list.length - 1 ? qi + 1 : 1]!];
      if (k + 1 < K) {
        const cx = q.x - Math.cos(q.a) * q.rx * 0.75, cy = q.y - Math.sin(q.a) * q.ry * 0.75;
        const nx = Math.ceil(q.rx / step) + 1;
        for (let j = -nx; j <= nx; j++) for (let i = -nx; i <= nx; i++) {
          const x = cx + (i + (j & 1) * 0.5) * step, y = cy + j * step * 0.866;
          const d = Math.hypot(x - cx, y - cy) / q.rx;
          if (d >= 1 || !insideLumps(x, y, near)) continue;
          const r = dot * (1 - d * 0.85);
          if (r > step * 0.06) { ctx.p.dot(x, y, r, next); ctx.p.item(); }
        }
      }
      if (ctx.rnd(60 + k + boil, q.i) > 0.45) hatch(ctx, q, next, near, boil);
    }
  }
  // White-hot spots low in the middle, while the whole bed burns: more of the middle band, reaching towards the camera.
  if (sp.part === 'lumps' && bands === K) {
    const b = all[K - 1]!, z = -R * 0.1 * b.z;
    for (let m = 0; m < 3; m++) {
      const gx = (ctx.rnd(70, m) - 0.5) * R * 0.32, gz = -R * (0.24 + 0.14 * ctx.rnd(71, m));
      const r = R * (0.1 + 0.04 * ctx.rnd(72, m)) * (1 + 0.1 * Math.sin(boil * 2 + m));
      const y = gz * t.sa + 0.1 * t.ua;
      // A smooth gradient colours them by place as well, so they blend into the middle as a tone's do.
      if (b.c) ctx.p.disc(gx, y, r, r * 0.6, b.c, 16);
      else placeDisc(ctx, { x: gx, y, rx: r, ry: r * 0.6, a: Math.atan2(gz - z, gx), i: m, d: Math.hypot(gx, gz - z) }, R, b, 16);
    }
  }
}

/** A few parallel brush strokes, pointed at both ends, across a lump (kept inside the band). */
function hatch(ctx: DrawCtx, q: Lump, col: RGBA, list: Lump[], boil: number): void {
  const ang = q.a + Math.PI / 2 + 0.55;
  const c = Math.cos(ang), s = Math.sin(ang);
  const len = q.rx * 0.9, gap = q.rx * 0.17, w = ctx.px(1.6);
  for (let i = 0; i < 4; i++) {
    const o = (i - 1.5) * gap;
    const l = len * (0.55 + 0.45 * ctx.rnd(80 + boil, q.i * 7 + i));
    const sh = (ctx.rnd(81 + boil, q.i * 7 + i) - 0.5) * len * 0.35;
    const px = q.x + Math.cos(q.a) * q.rx * 0.2 - s * o + c * sh, py = q.y + Math.sin(q.a) * q.ry * 0.2 + c * o + s * sh;
    const x0 = px - (c * l) / 2, y0 = py - (s * l) / 2, x1 = px + (c * l) / 2, y1 = py + (s * l) / 2;
    if (!insideLumps(x0, y0, list) || !insideLumps(x1, y1, list)) continue;
    leaf(ctx, x0, y0, x1, y1, w, col);
  }
}

/** One brush stroke: thick in the middle, pointed at both ends. */
function leaf(ctx: DrawCtx, x0: number, y0: number, x1: number, y1: number, w: number, col: RGBA): void {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * w, ny = (dx / l) * w;
  ctx.p.poly([x0, y0, mx + nx, my + ny, x1, y1, mx - nx, my - ny], col);
}

// ---------------------------------------------------------------- the tongues

interface Tongue {
  /** Ground place: across and away from the camera, metres. */
  x: number;
  z: number;
  h: number;
  w: number;
  lean: number;
  sway: number;
  cycle: number;
  offset: number;
  /** 0 back, 1 middle, 2 front */
  depth: number;
  i: number;
}

/**
 * Where the tongues stand, how tall, how they sway: all from the seed. They stand in rows, evenly spread across each row
 * with some jitter: a back row of tall ones, a middle row, a front row of short bright ones, and a few small ones round
 * the rim. Shares of the count: 0.3 back, 0.32 middle, 0.2 front, the rest on the rim.
 */
function tongues(sp: FlamesShape, ctx: DrawCtx): Tongue[] {
  const R = sp.radiusM;
  const rows: { depth: number; n: number; z: [number, number]; h: [number, number]; rim: boolean }[] = [];
  const nb = Math.max(1, Math.round(sp.count * 0.3)), nm = Math.max(1, Math.round(sp.count * 0.32)), nf = Math.max(1, Math.round(sp.count * 0.2));
  const nr = Math.max(0, sp.count - nb - nm - nf);
  const want = (d: number) => sp.depth === 'all' || (sp.depth === 'back' && d === 0) || (sp.depth === 'middle' && d === 1) || (sp.depth === 'front' && d === 2);
  rows.push({ depth: 0, n: nb, z: [0.34, 0.57], h: [0.55, 1], rim: false });
  rows.push({ depth: 1, n: nm, z: [-0.04, 0.24], h: [0.4, 0.75], rim: false });
  rows.push({ depth: 2, n: nf, z: [-0.39, -0.14], h: [0.28, 0.47], rim: false });
  rows.push({ depth: 2, n: nr, z: [-0.74, -0.14], h: [0, 0.08], rim: true });
  const out: Tongue[] = [];
  let i = 0;
  for (const row of rows) {
    for (let j = 0; j < row.n; j++, i++) {
      const depth = row.rim && j % 2 === 1 ? 0 : row.depth;
      if (!want(depth)) continue;
      const z = pick(row.z, ctx.rnd(92, i));
      // Across the row, evenly, with jitter; rim tongues sit near the left and right ends of the fire.
      let across: number;
      if (row.rim) across = (j % 2 ? -1 : 1) * (0.78 + 0.16 * ctx.rnd(91, i)) * (j % 4 < 2 ? 1 : 0.62);
      else across = -0.86 + (1.72 * (j + 0.5 + (ctx.rnd(91, i) - 0.5) * 0.7)) / row.n;
      const width = Math.sqrt(Math.max(0.05, 1 - z * z * 1.4));
      const h = row.rim ? pick(sp.tallM, 0) * (1 + 0.36 * ctx.rnd(93, i)) : pick(sp.tallM, pick(row.h, ctx.rnd(93, i)));
      const w = pick(sp.widthM, ctx.rnd(94, i)) * (0.62 + 0.38 * Math.min(1, h / sp.tallM[1]));
      const cycle = Math.max(3, Math.round(pick(sp.cycleSteps, ctx.rnd(95, i))));
      out.push({
        x: across * width * R, z: z * R, h, w,
        lean: sp.lean * (0.6 + 0.8 * ctx.rnd(96, i)), sway: sp.sway * (0.85 + 0.3 * ctx.rnd(97, i)),
        cycle, offset: Math.floor(ctx.rnd(98, i) * cycle), depth, i,
      });
    }
  }
  // Back to front.
  return out.sort((a, b) => b.z - a.z);
}

/** A tongue's centre line and half widths at N + 1 points, in drawing coordinates. */
function ribbon(tg: Tongue, ctx: DrawCtx, H: number, phase: number, t: { sa: number; ua: number }, wk: number, tMax: number, shift: number) {
  const N = 16;
  const cx: number[] = [], cy: number[] = [];
  for (let j = 0; j <= N; j++) {
    const s = (tMax * j) / N;
    // An S-bend that travels up the tongue, a lean with the wind, and a hook at the tip.
    const side = (tg.lean * s + tg.sway * Math.pow(s, 0.65) * Math.sin(TAU * (1.3 * s - phase)) + 0.18 * Math.pow(s, 4.5)) * H;
    cx.push(tg.x * ctx.s + side);
    cy.push(tg.z * ctx.s * t.sa + H * s * t.ua);
  }
  const a: number[] = [], b: number[] = [];
  const W = tg.w * ctx.s * wk;
  for (let j = 0; j <= N; j++) {
    const p = Math.max(0, j - 1), q = Math.min(N, j + 1);
    const dx = cx[q]! - cx[p]!, dy = cy[q]! - cy[p]!, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, u = j / N;
    // Swells low, tapers to a point: this tongue's own width profile.
    const hw = W * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + 0.82 * u)), 0.8) * Math.pow(1 - u, 0.55) * 1.25;
    const off = shift * W * (1 - 0.6 * u);
    a.push(cx[j]! + nx * (off + hw), cy[j]! + ny * (off + hw));
    b.push(cx[j]! + nx * (off - hw), cy[j]! + ny * (off - hw));
  }
  return { a, b, cx, cy, N, W };
}

/** The closed outline of a ribbon: one side up, the other down, a round foot. */
function outlineOf(r: { a: number[]; b: number[]; N: number; W: number }): number[] {
  const pts: number[] = [];
  for (let j = 0; j <= r.N; j++) pts.push(r.b[j * 2]!, r.b[j * 2 + 1]!);
  for (let j = r.N - 1; j >= 0; j--) pts.push(r.a[j * 2]!, r.a[j * 2 + 1]!);
  // A rounded foot, bulging down towards the camera.
  const fx = (r.a[0]! + r.b[0]!) / 2, fy = (r.a[1]! + r.b[1]!) / 2;
  pts.push(fx, fy - r.W * 0.45);
  return pts;
}

export function drawFlames(sp: FlamesShape, ctx: DrawCtx): void {
  const { reach, fadeK } = lifeShape(ctx, sp.growMs, sp.breakUp);
  if (fadeK >= 1) return;
  const hk = Math.pow(reach, 1.6) * (1 - 0.6 * fadeK);
  if (hk <= 0.02) return;
  const t = tilt(ctx);
  const frame = ctx.n >= 0 ? ctx.n : Math.floor(ctx.tau / ctx.stepMs);
  const line = fireLine(ctx, sp.edge, sp.inkPx, sp.shadeRole);
  const [body, mid, hot, core] = [0, 1, 2, 3].map((k) => ctx.rgba(sp.tones[Math.min(k, sp.tones.length - 1)]!));
  const shade = ctx.rgba(sp.shadeRole);
  for (const tg of tongues(sp, ctx)) {
    // The fire area races out at the start; tongues outside it wait. They go out one by one as it cools.
    if (Math.hypot(tg.x, tg.z) > sp.radiusM * reach * 0.98) continue;
    if (ctx.rnd(99, tg.i) < fadeK * 1.15) continue;
    ctx.p.item();
    // Each tongue stretches over its cycle (easing out), snaps back on the last step as a lick lets go, and starts again.
    const q = (((frame + tg.offset) % tg.cycle) + tg.cycle) % tg.cycle;
    const released = q === tg.cycle - 1;
    const sq = q / Math.max(1, tg.cycle - 2);
    const g = released ? 0.7 : 0.8 + 0.24 * sq * (2 - sq);
    // The S-bend travels up by one bend in a little more than a cycle.
    const phase = ((frame + tg.offset) * 0.8) / tg.cycle;
    const H = tg.h * g * hk * ctx.s;
    const base = [body, mid, hot][tg.depth]!, light = [mid, hot, core][tg.depth]!, dark = [shade, body, mid][tg.depth]!;
    const big = tg.h > 0.9;
    const r = ribbon(tg, ctx, H, phase, t, 1, 1, 0);
    const pts = outlineOf(r);
    if (line) {
      const lw = line.w * (big ? 1 : 0.8);
      if (line.heavy) ctx.p.stroke(pts.map((v, k) => v + (k % 2 ? -0.65 : -0.5) * lw), true, 2 * lw, line.col);
      ctx.p.stroke(pts, true, 2 * lw, line.col);
    }
    ctx.p.poly(pts, base);
    // The shaded side: the band between the tongue's right edge and a line a third of the way in.
    shadeSide(ctx, r, dark);
    // The light core, on the lit side, up to three quarters of the height.
    const inner = ribbon(tg, ctx, H, phase, t, tg.depth === 2 ? 0.32 : 0.4, 0.72, 0.22);
    ctx.p.poly(outlineOf(inner), light);
    // A small flame lets go of a tall tongue's tip, just after it stretched furthest, and drifts up as it shrinks.
    if (sp.licks && big) {
      const age = released ? 0 : q < 2 ? q + 1 : -1;
      if (age >= 0) {
        ctx.p.item();
        const tipX = r.cx[r.N]!, tipY = r.cy[r.N]!;
        const sz = 0.19 * (1 - 0.22 * age) * tg.h * hk * ctx.s;
        const lx = tipX + 0.05 * (1 + age) * tg.h * ctx.s, ly = tipY + (0.06 + 0.1 * age) * tg.h * ctx.s;
        const lick = lickPoints(lx, ly, sz, 0.24);
        if (line) ctx.p.stroke(lick, true, 2 * line.w * 0.8, line.col);
        ctx.p.poly(lick, base);
        if (age === 0) ctx.p.poly(lickPoints(lx + sz * 0.02, ly + sz * 0.08, sz * 0.5, 0.24), light);
      }
    }
  }
}

/** The shaded side of a tongue: from its right edge a third of the way across, up to near the tip. */
function shadeSide(ctx: DrawCtx, r: { a: number[]; b: number[]; N: number }, col: RGBA): void {
  const left: number[] = [], right: number[] = [];
  const top = Math.round(r.N * 0.94);
  for (let j = 0; j <= top; j++) {
    const ax = r.a[j * 2]!, ay = r.a[j * 2 + 1]!, bx = r.b[j * 2]!, by = r.b[j * 2 + 1]!;
    right.push(bx, by);
    left.push(bx + (ax - bx) * 0.34, by + (ay - by) * 0.34);
  }
  ctx.p.strip(left, right, col);
}

/** A small flame that has let go: pointed above, round below. */
function lickPoints(x: number, y: number, sz: number, lean: number): number[] {
  const pts: number[] = [];
  // Up the left side to the tip, down the right side, round foot (y up).
  const path: [number, number][] = [
    [-0.3, 0], [-0.42, 0.32], [-0.3, 0.62], [-0.02 + lean, 0.95], [lean * 1.8, 1.35],
    [lean * 1.4 + 0.1, 0.9], [0.36, 0.6], [0.42, 0.3], [0.28, 0], [0.12, -0.18], [-0.1, -0.2],
  ];
  for (const [px, py] of path) pts.push(x + px * sz, y + py * sz);
  return pts;
}

/** For tests: a tongue layout's tongues (where they stand and how tall). */
export function tongueLayout(sp: FlamesShape, ctx: DrawCtx): { x: number; z: number; h: number; depth: number }[] {
  return tongues(sp, ctx).map(({ x, z, h, depth }) => ({ x, z, h, depth }));
}

export { insidePolygon };
