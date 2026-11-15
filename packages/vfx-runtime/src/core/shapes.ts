/**
 * Comic shapes built in code. Each kind is a small generator: it reads its parameters and the moment (DrawCtx) and
 * draws with the painter in the layer's flat frame (x right, y up, metres). These are Shamble VFX's own generators,
 * made to give the look of the Art lead's drawing board, not copies of its code or tables.
 */
import type {
  BandShape, BeadsShape, CloudShape, DotsShape, FlashShape, GlowShape, HalftoneFill, LinesShape, RingShape, ScorchShape,
  ShapeSpec, ShardsShape, SmokeShape, TrailShape,
} from '@shamble/vfx-format';
import { breakProgress, clamp01, curveAt, edgeLook, pick } from './draw';
import type { DrawCtx, EdgeLook } from './draw';
import { drawBed, drawFlames } from './fire';
import { insidePolygon, ovalPoints } from './painter';
import type { RGBA } from './painter';
import { flightPoint } from './timeline';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export function drawShape(spec: ShapeSpec, ctx: DrawCtx): void {
  switch (spec.kind) {
    case 'shards': return drawShards(spec, ctx);
    case 'flash': return drawFlash(spec, ctx);
    case 'cloud': return drawCloud(spec, ctx);
    case 'smoke': return drawSmoke(spec, ctx);
    case 'ring': return drawRing(spec, ctx);
    case 'dots': return drawDots(spec, ctx);
    case 'scorch': return drawScorch(spec, ctx);
    case 'lines': return drawLines(spec, ctx);
    case 'glow': return drawGlow(spec, ctx);
    case 'trail': return drawTrail(spec, ctx);
    case 'band': return drawBand(spec, ctx);
    case 'beads': return drawBeads(spec, ctx);
    case 'flames': return drawFlames(spec, ctx);
    case 'bed': return drawBed(spec, ctx);
  }
}

/** The ink outline of a filled shape, drawn under it: solid ink, or your own team's thin broken line. */
export function outline(ctx: DrawCtx, pts: ArrayLike<number>, look: EdgeLook, inkPx: number, brokenRole = 'heat.rim'): void {
  if (look === 'ink' && inkPx > 0) ctx.p.stroke(pts, true, ctx.px(inkPx) * 2, ctx.rgba('ink'));
  else if (look === 'broken') ctx.p.stroke(pts, true, ctx.px(3.5), ctx.rgba(brokenRole), [ctx.px(10), ctx.px(8)]);
}

/** A star of straight shards: n spikes of uneven length, inner corners near inner x radius. */
export function shardPoints(ctx: DrawCtx, seed: number, R: number, n: number, inner: number, jit: number, rot: number, squash: number): number[] {
  const out: number[] = [];
  // The spikes' angles are as uneven as their lengths: a jitter of 0 gives a regular star (a glint, a hit star).
  const aj = Math.min(1, jit / 0.3);
  for (let i = 0; i < n; i++) {
    const a0 = rot + (TAU * (i + (ctx.rnd(seed, i) - 0.5) * 0.3 * aj)) / n;
    const a1 = rot + (TAU * (i + 0.5 + (ctx.rnd(seed, i + 64) - 0.5) * 0.24 * aj)) / n;
    const r0 = R * (1 + (ctx.rnd(seed, i + 128) * 2 - 1) * jit);
    const r1 = R * inner * (1 + (ctx.rnd(seed, i + 192) * 2 - 1) * 0.12);
    out.push(Math.cos(a0) * r0, Math.sin(a0) * r0 * squash, Math.cos(a1) * r1, Math.sin(a1) * r1 * squash);
  }
  return out;
}

function drawShards(sp: ShardsShape, ctx: DrawCtx): void {
  const k2 = breakProgress(ctx, sp.breakUp);
  const sz = ctx.s * (1 - 0.5 * k2);
  const boil = ctx.parity * sp.boilDeg * DEG;
  const rot = sp.rotationDeg * DEG;
  const look = edgeLook(sp.edge, ctx.relation);
  if (sp.whiteFirstStep && ctx.n === 0) {
    const pts = shardPoints(ctx, 1, sp.radiusM * 1.3 * ctx.s, sp.points, sp.inner, sp.jitter, rot, sp.squash);
    outline(ctx, pts, look, sp.inkPx);
    ctx.p.fan(0, 0, pts, ctx.rgba('white'));
    return;
  }
  let first = true;
  sp.tones.forEach((tone, i) => {
    if (tone.vanishAt !== undefined && k2 >= tone.vanishAt) return;
    const pts = shardPoints(ctx, 11 + i * 12, sp.radiusM * tone.scale * sz, tone.points ?? sp.points, sp.inner, i === 0 ? sp.jitter : sp.jitter * 0.67, rot + i * 0.3 + boil, sp.squash);
    if (first) {
      outline(ctx, pts, look, sp.inkPx);
      first = false;
    }
    ctx.p.fan(0, 0, pts, ctx.rgba(tone.role));
    if (i === 0) {
      if (sp.halftone) halftoneIn(ctx, pts, sp.halftone, sp.radiusM * sz);
      if (sp.double) {
        const inner = shardPoints(ctx, 97, sp.radiusM * tone.scale * sz * 0.72, tone.points ?? sp.points, sp.inner, sp.jitter, rot + 0.15 + boil, sp.squash);
        ctx.p.stroke(inner, true, ctx.px(Math.max(1.5, sp.inkPx * 0.6)), ctx.rgba('ink'));
      }
    }
  });
}

/** Halftone dots inside a polygon, shrinking towards one side. */
function halftoneIn(ctx: DrawCtx, pts: number[], h: HalftoneFill, R: number): void {
  const step = ctx.px(h.stepPx), r0 = ctx.px(h.dotPx);
  if (step <= 0) return;
  const dx = Math.cos(h.towardDeg * DEG), dy = Math.sin(h.towardDeg * DEG);
  const c = ctx.rgba(h.role);
  const n = Math.ceil(R / step) + 1;
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const x = (i + (j & 1) * 0.5) * step, y = j * step * 0.866;
      if (!insidePolygon(x, y, pts)) continue;
      const along = (x * dx + y * dy) / R; // -1 .. 1 towards the fade side
      const r = r0 * clamp01(0.55 - along * 0.5);
      if (r > step * 0.06) ctx.p.disc(x, y, r, r, c, 6);
    }
  }
}

/** Shamble VFX's own muzzle-flash outline (unit length along x): a long spike forward, spikes to the sides and back. */
const FLASH: readonly number[] = [1.0, 0.0, 0.5, 0.1, 0.52, 0.36, 0.26, 0.16, 0.02, 0.34, 0.08, 0.0, 0.02, -0.34, 0.26, -0.16, 0.52, -0.36, 0.5, -0.1];

function drawFlash(sp: FlashShape, ctx: DrawCtx): void {
  const odd = ctx.parity === 1;
  const L = sp.lengthM * ctx.s * (odd ? sp.alternate.scale : 1);
  const jit = odd ? sp.alternate.jitter : 0;
  const look = edgeLook(sp.edge, ctx.relation);
  sp.tones.forEach((tone, i) => {
    const l = L * tone.scale;
    const pts: number[] = [];
    for (let k = 0; k < FLASH.length; k += 2) {
      const side = FLASH[k + 1]!;
      const bend = (k === 2 || k === 18 ? Math.sign(side) * jit : 0) - (k === 8 || k === 12 ? Math.sign(side) * jit : 0);
      pts.push(FLASH[k]! * l, (side + bend) * l);
    }
    if (i === 0) outline(ctx, pts, look, sp.inkPx);
    ctx.p.fan(l * 0.2, 0, pts, ctx.rgba(tone.role));
  });
}

function cloudPoints(ctx: DrawCtx, seed: number, R: number, squash: number, lobes: number, depth: number, rot: number): number[] {
  const out: number[] = [];
  const per = 6;
  const N = lobes * per;
  for (let i = 0; i < N; i++) {
    const a = rot + (TAU * i) / N;
    const lobe = Math.floor(i / per);
    const ph = (i % per) / per;
    const bump = Math.pow(Math.sin(ph * Math.PI), 0.6) * (0.75 + 0.5 * ctx.rnd(seed, lobe));
    const r = R * (1 - depth + depth * bump);
    out.push(Math.cos(a) * r, Math.sin(a) * r * squash);
  }
  return out;
}

function drawCloud(sp: CloudShape, ctx: DrawCtx): void {
  const k2 = breakProgress(ctx, sp.breakUp);
  const sz = ctx.s * (1 - 0.4 * k2);
  const boil = ctx.parity * sp.boilDeg * DEG;
  const look = edgeLook(sp.edge, ctx.relation);
  let first = true;
  sp.tones.forEach((tone, i) => {
    if (tone.vanishAt !== undefined && k2 >= tone.vanishAt) return;
    const R = sp.radiusM * tone.scale * sz;
    const pts = cloudPoints(ctx, 5 + i * 7, R, sp.squash, Math.max(5, Math.round(sp.lobes * (0.6 + 0.4 * tone.scale))), sp.lobeDepth, boil + i * 0.4);
    // Inner tones sit a little high: the cloud is lit from above.
    const lift = i * sp.radiusM * 0.05 * sz;
    for (let k = 1; k < pts.length; k += 2) pts[k] = pts[k]! + lift;
    if (first) {
      outline(ctx, pts, look, sp.inkPx);
      first = false;
    }
    ctx.p.fan(0, lift, pts, ctx.rgba(tone.role));
    if (i === 0 && sp.halftone) halftoneIn(ctx, pts, sp.halftone, sp.radiusM * sz);
  });
}

/** Shamble VFX's own lump layouts: [x, y, radius] as shares of the puff's radius. */
const PUFF: readonly (readonly [number, number, number])[] = [[0, 0, 1], [-0.74, -0.18, 0.62], [0.76, -0.14, 0.66], [0.1, 0.58, 0.7]];

function drawSmoke(sp: SmokeShape, ctx: DrawCtx): void {
  const items: { age: number; seed: number }[] = [];
  if (sp.loop) {
    const life = sp.loop.lifeMs, cnt = sp.loop.count;
    for (let q = 0; q < cnt; q++) {
      const offset = (q * life) / cnt;
      if (ctx.tau < offset) continue;
      const cycle = Math.floor((ctx.tau - offset) / life);
      items.push({ age: (ctx.tau - offset - cycle * life) / life, seed: q * 7 + cycle * 3 });
    }
  } else items.push({ age: ctx.t, seed: 1 });
  const rim = ctx.rgba(sp.rimRole);
  const fill = ctx.rgba(sp.role);
  const light = sp.lightRole ? ctx.rgba(sp.lightRole) : undefined;
  for (const it of items) {
    const g = curveAt([[0, sp.grow[0]], [0.78, sp.grow[1]], [1, sp.grow[2]]], it.age);
    const R = sp.radiusM * ctx.s * g;
    if (R < ctx.px(1.5)) continue;
    // Drift: right, and forward (away from the camera on the ground, which shows up the screen by the camera's tilt).
    const cx = sp.driftM[0] * it.age, cy = sp.riseM * it.age + sp.driftM[1] * it.age * awayOnScreen(ctx);
    const parts = sp.style === 'puff'
      ? PUFF.map(([x, y, r]) => [cx + x * R, cy + y * R, r * R] as const)
      : billowParts(ctx, it.seed, cx, cy, R);
    const ink = ctx.px(sp.inkPx);
    for (const [x, y, r] of parts) ctx.p.disc(x, y, r + ink, r + ink, rim, 16);
    for (const [x, y, r] of parts) ctx.p.disc(x, y, r, r, fill, 16);
    if (sp.style === 'billow') {
      if (light) for (const [x, y, r] of parts) if (y > cy - R * 0.1) ctx.p.disc(x - R * 0.12, y + R * 0.15, r * 0.72, r * 0.72, light, 14);
      // Halftone underneath, in the darker rim colour.
      const dot = ctx.rgba(sp.rimRole, 0.55);
      const step = Math.max(ctx.px(5), R * 0.16);
      for (let j = 0; j < 4; j++) for (let i = -3; i <= 3; i++) {
        const x = cx + (i + (j & 1) * 0.5) * step, y = cy - R * 0.25 - j * step * 0.8;
        if (parts.some(([px, py, pr]) => Math.hypot(x - px, y - py) < pr * 0.85)) ctx.p.disc(x, y, step * 0.22 * (1 - j / 5), step * 0.22 * (1 - j / 5), dot, 6);
      }
    }
  }
}

function billowParts(ctx: DrawCtx, seed: number, cx: number, cy: number, R: number): (readonly [number, number, number])[] {
  const parts: [number, number, number][] = [[cx, cy, R * 0.6]];
  for (let i = 0; i < 7; i++) {
    const a = (TAU * i) / 7 + ctx.rnd(seed, i) * 0.7;
    const d = R * (0.45 + 0.22 * ctx.rnd(seed, i + 9));
    const r = R * (0.4 + 0.2 * ctx.rnd(seed, i + 19)) * (1 + 0.07 * (ctx.parity ? 1 : -1));
    parts.push([cx + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d * 0.85, r]);
  }
  return parts;
}

function drawRing(sp: RingShape, ctx: DrawCtx): void {
  const k = breakProgress(ctx, sp.breakUp);
  const dashedNow = sp.dashAt !== undefined && k > sp.dashAt;
  const enemy = ctx.relation === 'enemy';
  let style = sp.style;
  if (style === 'auto-zigzag') style = enemy ? 'zigzag' : 'dashed';
  if (style === 'auto-teeth') style = enemy ? 'teeth' : 'dashed';
  const w = ctx.px(sp.widthPx), ink = ctx.px(sp.inkPx);
  const col = ctx.rgba(sp.role), black = ctx.rgba('ink');
  if (sp.closing) {
    const c = sp.closing;
    for (let q = 0; q < c.count; q++) {
      const rp = (((ctx.tau + (q * c.periodMs) / c.count) % c.periodMs) + c.periodMs) % c.periodMs / c.periodMs;
      const r = (c.fromM + (c.toM - c.fromM) * rp) * ctx.s;
      const pts = ovalPoints(0, 0, r, r * (sp.squash ?? 1), 64);
      const a = 0.3 + 0.7 * rp, wq = w * (0.7 + 0.7 * rp);
      if (style === 'dashed') ctx.p.stroke(pts, true, wq, ctx.rgba(sp.role, a), [ctx.px(13.5), ctx.px(13.5)]);
      else {
        ctx.p.stroke(pts, true, wq * 3.2, ctx.rgba(sp.role, a * 0.35));
        ctx.p.stroke(pts, true, wq, ctx.rgba(sp.role, a));
      }
    }
    return;
  }
  const grow = sp.growMs > 0 ? Math.min(1, sp.growFrom + ((1 - sp.growFrom) * ctx.tau) / sp.growMs) : 1;
  const R = sp.radiusM * ctx.s * grow;
  const sq = sp.squash ?? 1;
  const circle = ovalPoints(0, 0, R, R * sq, 72);
  if (style === 'dashed') {
    ctx.p.stroke(circle, true, w, col, [w * 3, w * 2.4]);
  } else if (style === 'zigzag') {
    const zz: number[] = [];
    const m = Math.max(4, sp.teeth) * 2;
    const inner = Math.max(0.05, 1 - sp.teethM / Math.max(R, 1e-6));
    for (let i = 0; i < m; i++) {
      const a = (TAU * i) / m, f = i % 2 ? inner : 1;
      zz.push(Math.cos(a) * R * f, Math.sin(a) * R * f * sq);
    }
    if (ink > 0) ctx.p.stroke(zz, true, ink, black);
    ctx.p.stroke(zz, true, w, col);
  } else {
    const dash = dashedNow ? ([ctx.px(21), ctx.px(15)] as const) : undefined;
    if (ink > 0) ctx.p.stroke(circle, true, ink, black, dash);
    ctx.p.stroke(circle, true, w, col, dash);
    if (style === 'teeth' && !dashedNow) {
      const hw = 0.085, r0 = R - sp.teethM * ctx.s;
      for (let i = 0; i < sp.teeth; i++) {
        const a = (TAU * i) / sp.teeth + 0.05;
        const tri = [Math.cos(a - hw) * R, Math.sin(a - hw) * R * sq, Math.cos(a + hw) * R, Math.sin(a + hw) * R * sq, Math.cos(a) * r0, Math.sin(a) * r0 * sq];
        ctx.p.stroke(tri, true, ctx.px(1.95) * 2, black);
        ctx.p.poly(tri, col);
      }
    }
  }
}

function drawDots(sp: DotsShape, ctx: DrawCtx): void {
  const k = breakProgress(ctx, sp.breakUp);
  if (k >= 1) return;
  const grow = sp.growMs > 0 ? Math.min(1, sp.growFrom + ((1 - sp.growFrom) * ctx.tau) / sp.growMs) : 1;
  const R = (sp.radiusM * grow + ctx.parity * sp.flickerM) * ctx.s;
  const inner = sp.innerM * grow * ctx.s;
  const step = ctx.px(sp.stepPx), r0 = ctx.px(sp.dotPx) * (1 - k);
  const c = ctx.rgba(sp.role, sp.alpha);
  const sq = sp.squash ?? 1;
  const nx = Math.ceil(R / step) + 1, ny = Math.ceil((R * sq) / (step * 0.866)) + 1;
  for (let j = -ny; j <= ny; j++) {
    for (let i = -nx; i <= nx; i++) {
      const x = (i + (j & 1) * 0.5) * step, y = j * step * 0.866;
      const d = Math.hypot(x, y / sq);
      if (d >= R || d < inner) continue;
      const r = sp.edgeM > 0 ? r0 * clamp01((R - d) / (sp.edgeM * ctx.s)) : r0 * (1 - (d / R) * 0.85);
      if (r > step * 0.05) ctx.p.disc(x, y, r, r, c, 6);
    }
  }
}

function drawScorch(sp: ScorchShape, ctx: DrawCtx): void {
  const grow = sp.growMs > 0 ? Math.min(1, ctx.tau / sp.growMs) : 1;
  const R = sp.radiusM * ctx.s * grow;
  if (R <= 0) return;
  const c = ctx.rgba(sp.role);
  if (sp.style === 'oval') {
    ctx.p.disc(0, 0, R, R, c, 40);
  } else {
    const pts: number[] = [];
    const lobes = Array.from({ length: Math.max(0, sp.lobes) }, (_, k) => ({
      a: (TAU * (k + 0.2 + 0.6 * ctx.rnd(31, k))) / Math.max(1, sp.lobes), h: 0.1 + 0.2 * ctx.rnd(32, k), w: 0.16 + 0.12 * ctx.rnd(33, k),
    }));
    for (let i = 0; i < 96; i++) {
      const a = (TAU * i) / 96;
      let rr = 0.78;
      for (const L of lobes) {
        const da = Math.abs((((a - L.a) % TAU) + TAU * 1.5) % TAU - Math.PI);
        if (da < L.w) rr += L.h * Math.pow(1 - da / L.w, 1.4);
      }
      pts.push(Math.cos(a) * R * rr, Math.sin(a) * R * rr);
    }
    ctx.p.fan(0, 0, pts, c);
  }
  if (sp.coreScale > 0) ctx.p.disc(0, 0, R * sp.coreScale, R * sp.coreScale, ctx.rgba(sp.coreRole), 32);
}

function drawLines(sp: LinesShape, ctx: DrawCtx): void {
  if (ctx.t >= sp.until) return;
  const k = sp.until > 0 ? ctx.t / sp.until : 1;
  const c = ctx.rgba(sp.role);
  for (let i = 0; i < sp.count; i++) {
    const a = ctx.rnd(41, i) * TAU;
    const r0 = pick(sp.innerM, ctx.rnd(42, i)) * ctx.s * (1 + sp.spread * k);
    const len = pick(sp.lengthM, ctx.rnd(43, i)) * ctx.s * (1 - k);
    if (len <= 0) continue;
    const ca = Math.cos(a), sa = Math.sin(a);
    ctx.p.stroke([ca * r0, sa * r0, ca * (r0 + len), sa * (r0 + len)], false, ctx.px(pick(sp.widthPx, ctx.rnd(44, i))), c);
  }
}

function drawGlow(sp: GlowShape, ctx: DrawCtx): void {
  const R = sp.radiusM * ctx.s * (sp.grow[0] + (sp.grow[1] - sp.grow[0]) * ctx.t) * (1 + ctx.parity * sp.flicker);
  const c = ctx.rgba(sp.role, sp.alpha);
  if (sp.soft) ctx.p.softDisc(0, 0, R, R, c);
  else ctx.p.disc(0, 0, R, R, c, 40);
}

/** Project a world point into the painter's flat frame. */
function local(ctx: DrawCtx, P: readonly [number, number, number]): [number, number] {
  const f = ctx.p.frame;
  const dx = P[0] - f.o[0], dy = P[1] - f.o[1], dz = P[2] - f.o[2];
  return [dx * f.u[0] + dy * f.u[1] + dz * f.u[2], dx * f.v[0] + dy * f.v[1] + dz * f.v[2]];
}

/** A ribbon along a polyline whose half-width changes point by point. */
function taper(ctx: DrawCtx, pts: number[], half: number[], c: RGBA): void {
  const n = pts.length / 2;
  if (n < 2) return;
  const a: number[] = [], b: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - 1), q = Math.min(n - 1, i + 1);
    const dx = pts[q * 2]! - pts[p * 2]!, dy = pts[q * 2 + 1]! - pts[p * 2 + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, h = half[i]!;
    a.push(pts[i * 2]! + nx * h, pts[i * 2 + 1]! + ny * h);
    b.push(pts[i * 2]! - nx * h, pts[i * 2 + 1]! - ny * h);
  }
  ctx.p.strip(a, b, c);
}

function drawTrail(sp: TrailShape, ctx: DrawCtx): void {
  const ride = ctx.ride;
  if (!ride) return;
  const kb = breakProgress(ctx, sp.breakUp);
  if (kb >= 0.7) return;
  const k = ride.k;
  const tail = Math.max(0, k - sp.length);
  if (k - tail < 1e-4) return;
  const pieces: [number, number][] = [];
  if (kb > 0) {
    // Break-up: the streak falls into dashes that shrink towards the far end.
    for (let j = 0; j < sp.dashes; j++) {
      const u0 = kb + (1 - kb) * (j / sp.dashes) + 0.02, u1 = kb + (1 - kb) * ((j + 0.55) / sp.dashes);
      if (u1 > u0) pieces.push([tail + (k - tail) * u0, tail + (k - tail) * Math.min(1, u1)]);
    }
  } else pieces.push([tail, k]);
  const thin = 1 - kb;
  const look = edgeLook(sp.edge, ctx.relation);
  const ink = ctx.rgba('ink'), body = ctx.rgba(sp.role);
  for (const [a, b] of pieces) {
    const m = 8;
    const pts: number[] = [], half: number[] = [];
    for (let j = 0; j < m; j++) {
      const kk = a + ((b - a) * j) / (m - 1);
      const [x, y] = local(ctx, flightPoint(ride.flight, kk));
      pts.push(x, y);
      const u = (kk - tail) / Math.max(1e-6, k - tail);
      half.push((ctx.px(sp.widthPx[0] + (sp.widthPx[1] - sp.widthPx[0]) * u) / 2) * thin);
    }
    if (look === 'ink') taper(ctx, pts, half.map((h) => h + ctx.px(sp.inkPx)), ink);
    taper(ctx, pts, half, body);
    if (sp.head) {
      const from = Math.floor((1 - sp.head.share) * (m - 1));
      taper(ctx, pts.slice(from * 2), half.slice(from), ctx.rgba(sp.head.role));
    }
    if (sp.core && edgeLook(sp.core.edge, ctx.relation) !== 'none') ctx.p.stroke(pts, false, ctx.px(sp.core.px) * thin, ctx.rgba(sp.core.role), undefined, false);
  }
}

function drawBand(sp: BandShape, ctx: DrawCtx): void {
  // Edge: ink = always solid, broken = always dashed, auto = solid for an enemy's and dashed for your own team's,
  // enemy = solid for an enemy's and not drawn for your own team's, none = not drawn.
  const look = edgeLook(sp.edge, ctx.relation);
  if (look === 'none') return;
  const A = local(ctx, ctx.point(sp.from.input, sp.from.offset));
  const B = local(ctx, ctx.point(sp.to.input, sp.to.offset));
  if (sp.find) {
    const pf = phaseShare(ctx, sp.find);
    if (pf < 0) return;
    if (pf < 1) {
      ctx.p.stroke([A[0], A[1], A[0] + (B[0] - A[0]) * pf, A[1] + (B[1] - A[1]) * pf], false, ctx.px(2.9), ctx.rgba(sp.role, sp.alpha), [ctx.px(10.5), ctx.px(10.5)], false);
      return;
    }
  }
  const pl = sp.letGo ? clamp01(phaseShare(ctx, sp.letGo)) : 0;
  const th = (1 - 0.7 * pl) * (1 + ctx.parity * sp.flicker);
  // The band runs from the far end (pulled back as it lets go) to the start.
  const x0 = B[0] + (A[0] - B[0]) * pl, y0 = B[1] + (A[1] - B[1]) * pl;
  const wA = sp.widthM[0] * th * ctx.s, wB = sp.widthM[1] * th * ctx.s;
  const w0 = wB + (wA - wB) * pl;
  if (look === 'broken') {
    ctx.p.stroke([x0, y0, A[0], A[1]], false, Math.max(wA, wB) * 0.9, ctx.rgba(sp.role, sp.alpha), [0.5 * ctx.s, 0.26 * ctx.s], false);
    return;
  }
  ctx.p.band(x0, y0, A[0], A[1], w0, wA, ctx.rgba(sp.role, sp.alpha), sp.soft);
}

/** Share of a phase passed at this moment (below 0 before it, above 1 after). */
function phaseShare(ctx: DrawCtx, name: 'windup' | 'peak' | 'fade'): number {
  const p = ctx.tl.phases[name];
  const len = p.endMs - p.startMs;
  return len <= 0 ? (ctx.effTRaw >= p.startMs ? 1 : -1) : (ctx.effTRaw - p.startMs) / len;
}

function drawBeads(sp: BeadsShape, ctx: DrawCtx): void {
  const A = local(ctx, ctx.point(sp.from.input, sp.from.offset));
  const B = local(ctx, ctx.point(sp.to.input, sp.to.offset));
  const dx = B[0] - A[0], dy = B[1] - A[1], dl = Math.hypot(dx, dy);
  if (dl < 1e-6) return;
  const d = [dx / dl, dy / dl], n = [-d[1]!, d[0]!];
  const held = Math.floor(ctx.tau / ctx.stepMs) * ctx.stepMs;
  const hl = sp.sizeM * ctx.s, hw = hl * 0.42;
  for (let i = 0; i < sp.count; i++) {
    const ub = (i / sp.count + held / sp.periodMs) % 1;
    if (ub < 0.04 || ub > 0.94) continue;
    const x = A[0] + dx * ub, y = A[1] + dy * ub;
    if (sp.glowRole) ctx.p.softDisc(x, y, hl * 1.75, hl * 1.75, ctx.rgba(sp.glowRole, 0.6));
    ctx.p.poly([x + d[0]! * hl, y + d[1]! * hl, x + n[0]! * hw, y + n[1]! * hw, x - d[0]! * hl * 1.6, y - d[1]! * hl * 1.6, x - n[0]! * hw, y - n[1]! * hw], ctx.rgba(sp.role));
  }
}

/** How much one metre away from the camera, on the ground, shows up the layer's plane (the sine of the camera's tilt). */
function awayOnScreen(ctx: DrawCtx): number {
  const f = ctx.p.frame;
  const ax = f.u[2], az = -f.u[0];
  const l = Math.hypot(ax, az) || 1;
  return (ax * f.v[0] + az * f.v[2]) / l;
}
