/**
 * Bursts: a set number of small things thrown out at once (or again and again, with loop). Every piece is worked out
 * from the seed and the time alone: where it started, which way it flew, how fast, how it slows and falls.
 */
import type { BurstLayer } from '@shamble/vfx-format';
import { curveAt, edgeLook, pick } from './draw';
import type { DrawCtx } from './draw';
import type { RGBA } from './painter';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export function drawBurst(l: BurstLayer, ctx: DrawCtx): void {
  const count = Math.max(0, Math.round(l.count * ctx.intensity));
  const look = l.look.kind === 'image' ? null : l.look;
  const img = l.look.kind === 'image' ? { rect: ctx.image?.(l.look.image), tint: l.look.tint } : null;
  if (img && !img.rect) return;
  const edge = look ? edgeLook(look.edge, ctx.relation) : 'none';
  const fill = look ? ctx.rgba(look.role) : img && img.tint.mode === 'multiply' ? ctx.rgba(img.tint.role) : ([1, 1, 1, 1] as RGBA);
  const ink = ctx.rgba(look?.inkRole ?? 'ink');
  // The ground, in the layer's plane: pieces that stop on it never go lower than this (flat ground at height 0).
  const f = ctx.p.frame;
  const floor = l.groundStop && f.v[1] > 0.05 && Math.abs(f.u[1]) < 1e-6 ? -f.o[1] / f.v[1] : -Infinity;
  for (let i = 0; i < count; i++) {
    const life = pick(l.lifeMs, ctx.rnd(61, i));
    let age = ctx.tau;
    let cycle = 0;
    if (l.loop) {
      const t = ctx.tau + ctx.rnd(62, i) * life;
      cycle = Math.floor(t / life);
      age = t - cycle * life;
    } else if (age > life) continue;
    const r = (k: number) => ctx.rnd(63 + k, i * 37 + cycle * 1013);
    // Direction in the layer's flat frame.
    let a: number;
    if (l.direction === 'out') a = r(0) * TAU;
    else if (l.direction === 'up') a = Math.PI / 2 + (r(0) * 2 - 1) * l.spreadDeg * DEG;
    else a = (r(0) * 2 - 1) * l.spreadDeg * DEG;
    const dx = Math.cos(a), dy = Math.sin(a);
    const sec = age / 1000;
    const v = pick(l.speedMps, r(1));
    const travel = l.drag > 0 ? (v * (1 - Math.exp(-l.drag * sec))) / l.drag : v * sec;
    const r0 = pick(l.startRadiusM, r(2));
    const ax = l.areaM ? (r(6) * 2 - 1) * l.areaM[0] : 0, ay = l.areaM ? (r(7) * 2 - 1) * l.areaM[1] : 0;
    const px = (ax + dx * (r0 + travel)) * ctx.s;
    const py = Math.max(floor, (ay + dy * (r0 + travel) - 0.5 * l.gravityMps2 * sec * sec) * ctx.s);
    const size = pick(l.sizeM, r(3)) * curveAt(l.sizeOverLife, age / life) * ctx.s;
    if (size <= 0) continue;
    if (l.streak && travel > 1e-4) {
      // The streak runs back along the way the piece came (never past where it started), widest at the piece.
      const back = Math.min(l.streak.lengthM * ctx.s, travel * ctx.s);
      const hw = ctx.px(l.streak.widthPx) / 2;
      const nx = -dy, ny = dx;
      ctx.p.poly([px + nx * hw, py + ny * hw, px - dx * back, py - dy * back, px - nx * hw, py - ny * hw], ctx.rgba(l.streak.role));
    }
    const spin = r(4) * TAU + pick(l.spinDegPerS, r(5)) * DEG * sec;
    if (img) { ctx.p.image(px, py, size, size, spin, img.rect!, fill); continue; }
    drawPiece(ctx, look?.kind ?? 'dot', px, py, size, spin, a, fill, ink, edge, look ? ctx.px(look.inkPx) : 0);
  }
}

function drawPiece(ctx: DrawCtx, kind: string, x: number, y: number, s: number, spin: number, heading: number, fill: RGBA, ink: RGBA, edge: 'ink' | 'broken' | 'none', inkW: number): void {
  let pts: number[];
  const rot = (px: number, py: number, ang: number): [number, number] => [x + px * Math.cos(ang) - py * Math.sin(ang), y + px * Math.sin(ang) + py * Math.cos(ang)];
  switch (kind) {
    case 'diamond':
      pts = [x, y + s * 1.5, x + s * 0.6, y, x, y - s * 1.5, x - s * 0.6, y];
      break;
    case 'chip': {
      // Shamble VFX's own broken-off chip: five uneven corners.
      const rr = [1.15, 0.72, 1.02, 0.86, 0.66];
      pts = [];
      [0, 1.22, 2.35, 3.55, 4.95].forEach((o, k) => pts.push(x + Math.cos(spin + o) * s * rr[k]!, y + Math.sin(spin + o) * s * rr[k]!));
      break;
    }
    case 'spark':
      pts = [...rot(s * 1.6, 0, heading), ...rot(0, s * 0.35, heading), ...rot(-s * 1.6, 0, heading), ...rot(0, -s * 0.35, heading)];
      break;
    case 'shard':
      pts = [...rot(s * 1.3, 0, spin), ...rot(-s * 0.7, s * 0.8, spin), ...rot(-s * 0.5, -s * 0.9, spin)];
      break;
    case 'spike':
      // A long thin spike thrown out: its foot at the piece's place, its point 3 sizes further out.
      pts = [...rot(0, s * 0.17, heading), ...rot(s * 3, 0, heading), ...rot(0, -s * 0.17, heading)];
      break;
    case 'streak': {
      const [ax, ay] = rot(-s * 2.5, 0, heading), [bx, by] = rot(s * 2.5, 0, heading);
      if (edge === 'ink') ctx.p.stroke([ax, ay, bx, by], false, s * 0.5 + inkW * 2, ink);
      ctx.p.stroke([ax, ay, bx, by], false, s * 0.5, fill);
      return;
    }
    case 'puff': {
      if (inkW > 0) for (const [px, py, pr] of [[0, 0, 1], [-0.6, -0.2, 0.65], [0.6, -0.15, 0.7]] as const) ctx.p.disc(x + px * s, y + py * s, pr * s + inkW, pr * s + inkW, ink, 12);
      for (const [px, py, pr] of [[0, 0, 1], [-0.6, -0.2, 0.65], [0.6, -0.15, 0.7]] as const) ctx.p.disc(x + px * s, y + py * s, pr * s, pr * s, fill, 12);
      return;
    }
    case 'speck':
      ctx.p.disc(x, y, s * 0.5, s * 0.5, fill, 6);
      return;
    default:
      if (edge === 'ink') ctx.p.disc(x, y, s + inkW, s + inkW, ink, 10);
      if (edge === 'broken') { ctx.p.stroke(circle(x, y, s), true, Math.max(inkW * 1.1, ctx.px(1.2)), fill); return; }
      ctx.p.disc(x, y, s, s, fill, 10);
      return;
  }
  if (edge === 'broken') {
    // Your own team's: the outline only, a thin line in the piece's colour.
    ctx.p.stroke(pts, true, Math.max(inkW * 1.1, ctx.px(1.2)), fill);
    return;
  }
  if (edge === 'ink') ctx.p.stroke(pts, true, inkW * 2, ink);
  ctx.p.poly(pts, fill);
}

function circle(x: number, y: number, r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 12; i++) out.push(x + Math.cos((TAU * i) / 12) * r, y + Math.sin((TAU * i) / 12) * r);
  return out;
}
