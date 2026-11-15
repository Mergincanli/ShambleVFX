/**
 * The painter: comic drawing primitives (filled stars and polygons, discs, soft glows, ink strokes with round joins,
 * dashes, ribbons) turned into triangles in a TriBuffer.
 * Drawing happens in a flat local frame (x right, y up, in metres) that is placed in the world by an origin and two axes.
 * Ink is drawn the way the drawing board draws it: a stroke centred on the edge first, the fill on top, so the visible
 * line is the outer half.
 */
import type { Vec3 } from '@shamble/vfx-format';
import type { TriBuffer } from './sink';

export type RGBA = [number, number, number, number];

export interface Frame3 {
  o: Vec3;
  u: Vec3;
  v: Vec3;
}

const TAU = Math.PI * 2;

export class Painter {
  private buf!: TriBuffer;
  private f: Frame3 = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] };
  private wu = 0.5;
  private wv = 0.5;
  private layer = 0;
  private dotRect: { u0: number; v0: number; u1: number; v1: number } | undefined;

  /** Start drawing one layer into a buffer. `dot`: a round white dot in the atlas, when it has one. */
  begin(buf: TriBuffer, frame: Frame3, layer: number, white: [number, number], dot?: { u0: number; v0: number; u1: number; v1: number }): void {
    this.buf = buf;
    this.f = frame;
    this.layer = layer;
    this.wu = white[0];
    this.wv = white[1];
    this.dotRect = dot;
  }

  /** A small round dot (halftone, specks): one textured square when the atlas has a dot, else a six-sided disc. */
  dot(x: number, y: number, r: number, c: RGBA): void {
    if (r <= 0 || c[3] <= 0) return;
    if (this.dotRect) this.image(x, y, (r * 8) / 7, (r * 8) / 7, 0, this.dotRect, c);
    else this.disc(x, y, r, r, c, 6);
  }

  /** Count items drawn (see TriBuffer.items): the generators call this once per particle, dot, letter, tongue or shape. */
  item(n = 1): void {
    this.buf.items += n;
  }

  /** Change the frame (for a part drawn at another place or angle). */
  setFrame(frame: Frame3): void {
    this.f = frame;
  }

  get frame(): Frame3 {
    return this.f;
  }

  get target(): TriBuffer {
    return this.buf;
  }

  /** A vertex at local (x, y). */
  vtx(x: number, y: number, c: RGBA): number {
    const f = this.f;
    return this.buf.vertex(
      f.o[0] + f.u[0] * x + f.v[0] * y,
      f.o[1] + f.u[1] * x + f.v[1] * y,
      f.o[2] + f.u[2] * x + f.v[2] * y,
      0, this.wu, this.wv, c[0], c[1], c[2], c[3], this.layer,
    );
  }

  /** An image from the atlas on a quad centred at (cx, cy), hw x hh half size, turned by rot. rect: atlas uv, v from the top. */
  image(cx: number, cy: number, hw: number, hh: number, rot: number, rect: { u0: number; v0: number; u1: number; v1: number }, c: RGBA): void {
    if (hw <= 0 || hh <= 0 || c[3] <= 0) return;
    const f = this.f, cr = Math.cos(rot), sr = Math.sin(rot);
    const corner = (sx: number, sy: number, u: number, v: number) => {
      const x = cx + sx * hw * cr - sy * hh * sr, y = cy + sx * hw * sr + sy * hh * cr;
      return this.buf.vertex(f.o[0] + f.u[0] * x + f.v[0] * y, f.o[1] + f.u[1] * x + f.v[1] * y, f.o[2] + f.u[2] * x + f.v[2] * y,
        0, u, v, c[0], c[1], c[2], c[3], this.layer);
    };
    // Image rows go down from the top: the quad's top edge (+y) takes v0.
    const a = corner(-1, -1, rect.u0, rect.v1), b = corner(1, -1, rect.u1, rect.v1), d = corner(1, 1, rect.u1, rect.v0), e = corner(-1, 1, rect.u0, rect.v0);
    this.buf.tri(a, b, d);
    this.buf.tri(a, d, e);
  }

  /** A filled polygon that every point of can be seen from (cx, cy): a fan from that point. pts = [x0, y0, x1, y1, ...]. */
  fan(cx: number, cy: number, pts: ArrayLike<number>, c: RGBA): void {
    const n = pts.length / 2;
    if (n < 3 || c[3] <= 0) return;
    const centre = this.vtx(cx, cy, c);
    const first = this.vtx(pts[0]!, pts[1]!, c);
    let prev = first;
    for (let i = 1; i < n; i++) {
      const cur = this.vtx(pts[i * 2]!, pts[i * 2 + 1]!, c);
      this.buf.tri(centre, prev, cur);
      prev = cur;
    }
    this.buf.tri(centre, prev, first);
  }

  /** A filled polygon, fanned from the average of its points (fine for star-like and convex shapes). */
  poly(pts: ArrayLike<number>, c: RGBA): void {
    let cx = 0, cy = 0;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) { cx += pts[i * 2]!; cy += pts[i * 2 + 1]!; }
    this.fan(cx / n, cy / n, pts, c);
  }

  /** A filled oval. */
  disc(cx: number, cy: number, rx: number, ry: number, c: RGBA, segs = 0, rot = 0): void {
    if (rx <= 0 || ry <= 0 || c[3] <= 0) return;
    const n = segs || Math.max(8, Math.min(48, Math.ceil(Math.max(rx, ry) * 40)));
    const pts = new Float64Array(n * 2);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (TAU * i) / n, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pts[i * 2] = cx + x * cr - y * sr;
      pts[i * 2 + 1] = cy + x * sr + y * cr;
    }
    this.fan(cx, cy, pts, c);
  }

  /** A soft round glow: full alpha in the middle, 42 % halfway out, nothing at the rim (as the board's radial gradient). */
  softDisc(cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
    if (rx <= 0 || ry <= 0 || c[3] <= 0) return;
    const n = 32;
    const mid: RGBA = [c[0], c[1], c[2], c[3] * 0.42];
    const rim: RGBA = [c[0], c[1], c[2], 0];
    const centre = this.vtx(cx, cy, c);
    const a0: number[] = [], b0: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (TAU * i) / n, x = Math.cos(a), y = Math.sin(a);
      a0.push(this.vtx(cx + x * rx * 0.5, cy + y * ry * 0.5, mid));
      b0.push(this.vtx(cx + x * rx, cy + y * ry, rim));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.buf.tri(centre, a0[i]!, a0[j]!);
      this.buf.tri(a0[i]!, b0[i]!, b0[j]!);
      this.buf.tri(a0[i]!, b0[j]!, a0[j]!);
    }
  }

  /** A quad from four corners. */
  quad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: RGBA): void {
    if (c[3] <= 0) return;
    const a = this.vtx(x0, y0, c), b = this.vtx(x1, y1, c), d = this.vtx(x2, y2, c), e = this.vtx(x3, y3, c);
    this.buf.tri(a, b, d);
    this.buf.tri(a, d, e);
  }

  /**
   * A stroke of width w along a polyline, centred on it, with round joins where it bends and round or flat ends.
   * dash = [on, off] lengths along the line, for a broken line.
   */
  stroke(pts: ArrayLike<number>, closed: boolean, w: number, c: RGBA, dash?: readonly [number, number], round = true): void {
    const n = pts.length / 2;
    if (n < 2 || w <= 0 || c[3] <= 0) return;
    if (dash && dash[0] > 0 && dash[1] > 0) {
      this.dashed(pts, closed, w, c, dash, round);
      return;
    }
    const segs = closed ? n : n - 1;
    const h = w / 2;
    for (let i = 0; i < segs; i++) {
      const x0 = pts[i * 2]!, y0 = pts[i * 2 + 1]!;
      const j = (i + 1) % n;
      const x1 = pts[j * 2]!, y1 = pts[j * 2 + 1]!;
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      const nx = (-dy / l) * h, ny = (dx / l) * h;
      this.quad(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, c);
    }
    // Round joins only where the line really bends, and round ends.
    if (!round) return;
    const joinSegs = w > 0.06 ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const isEnd = !closed && (i === 0 || i === n - 1);
      if (!isEnd) {
        const p = (i - 1 + n) % n, q = (i + 1) % n;
        const ax = pts[i * 2]! - pts[p * 2]!, ay = pts[i * 2 + 1]! - pts[p * 2 + 1]!;
        const bx = pts[q * 2]! - pts[i * 2]!, by = pts[q * 2 + 1]! - pts[i * 2 + 1]!;
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la > 1e-9 && lb > 1e-9 && (ax * bx + ay * by) / (la * lb) > 0.94) continue;
      }
      this.disc(pts[i * 2]!, pts[i * 2 + 1]!, h, h, c, joinSegs);
    }
  }

  private dashed(pts: ArrayLike<number>, closed: boolean, w: number, c: RGBA, dash: readonly [number, number], round: boolean): void {
    const n = pts.length / 2;
    const segs = closed ? n : n - 1;
    let on = true, left = dash[0];
    let cur: number[] = [pts[0]!, pts[1]!];
    for (let i = 0; i < segs; i++) {
      let x0 = pts[i * 2]!, y0 = pts[i * 2 + 1]!;
      const j = (i + 1) % n;
      const x1 = pts[j * 2]!, y1 = pts[j * 2 + 1]!;
      let l = Math.hypot(x1 - x0, y1 - y0);
      while (l > 1e-9) {
        const step = Math.min(l, left);
        const k = step / l;
        const xm = x0 + (x1 - x0) * k, ym = y0 + (y1 - y0) * k;
        if (on) cur.push(xm, ym);
        l -= step;
        left -= step;
        x0 = xm; y0 = ym;
        if (left <= 1e-9) {
          if (on && cur.length >= 4) this.stroke(cur, false, w, c, undefined, round);
          on = !on;
          left = on ? dash[0] : dash[1];
          cur = [x0, y0];
        }
      }
    }
    if (on && cur.length >= 4) this.stroke(cur, false, w, c, undefined, round);
  }

  /** A ribbon between two polylines of the same length (a flame tongue, a band). a and b are flat point lists. */
  strip(a: ArrayLike<number>, b: ArrayLike<number>, c: RGBA): void {
    const n = Math.min(a.length, b.length) / 2;
    if (n < 2 || c[3] <= 0) return;
    let pa = this.vtx(a[0]!, a[1]!, c), pb = this.vtx(b[0]!, b[1]!, c);
    for (let i = 1; i < n; i++) {
      const qa = this.vtx(a[i * 2]!, a[i * 2 + 1]!, c), qb = this.vtx(b[i * 2]!, b[i * 2 + 1]!, c);
      this.buf.tri(pa, qa, qb);
      this.buf.tri(pa, qb, pb);
      pa = qa; pb = qb;
    }
  }

  /** A band from (x0, y0) to (x1, y1), w0 wide at the start and w1 at the end. Soft: alpha fades to nothing at its sides. */
  band(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, c: RGBA, soft = false): void {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
    if (l < 1e-9 || c[3] <= 0) return;
    const nx = -dy / l, ny = dx / l;
    if (!soft) {
      this.quad(x0 + nx * w0 / 2, y0 + ny * w0 / 2, x1 + nx * w1 / 2, y1 + ny * w1 / 2, x1 - nx * w1 / 2, y1 - ny * w1 / 2, x0 - nx * w0 / 2, y0 - ny * w0 / 2, c);
      return;
    }
    const edge: RGBA = [c[0], c[1], c[2], 0];
    const a = this.vtx(x0 + nx * w0 / 2, y0 + ny * w0 / 2, edge), b = this.vtx(x1 + nx * w1 / 2, y1 + ny * w1 / 2, edge);
    const m0 = this.vtx(x0, y0, c), m1 = this.vtx(x1, y1, c);
    const d0 = this.vtx(x0 - nx * w0 / 2, y0 - ny * w0 / 2, edge), d1 = this.vtx(x1 - nx * w1 / 2, y1 - ny * w1 / 2, edge);
    this.buf.tri(a, b, m1); this.buf.tri(a, m1, m0);
    this.buf.tri(m0, m1, d1); this.buf.tri(m0, d1, d0);
  }
}

/** The points of a regular oval, flat [x, y, ...]. */
export function ovalPoints(cx: number, cy: number, rx: number, ry: number, n: number, rot = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (TAU * i) / n;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

/** Is (x, y) inside the polygon pts (even-odd rule)? */
export function insidePolygon(x: number, y: number, pts: ArrayLike<number>): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2]!, yi = pts[i * 2 + 1]!, xj = pts[j * 2]!, yj = pts[j * 2 + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
