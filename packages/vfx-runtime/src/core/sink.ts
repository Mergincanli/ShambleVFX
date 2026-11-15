/**
 * Where evaluate() writes what it wants drawn: plain typed arrays of triangles, reused every frame.
 * Sprites, shapes, words and particles all become triangles here, so they draw in strict layer order.
 * There is one buffer per blend group; the three.js side uploads each as one draw call.
 * Nothing is allocated per frame unless a buffer must grow.
 */

/** Blend groups. "ground" groups draw first (they lie on the ground); "top" groups draw over the scene. */
export type BlendGroup = 'ground-multiply' | 'ground-normal' | 'ground-screen' | 'top-normal' | 'top-add';
export const BLEND_GROUPS: readonly BlendGroup[] = ['ground-multiply', 'ground-normal', 'ground-screen', 'top-normal', 'top-add'];

export class TriBuffer {
  /** Vertices written this frame. */
  vcount = 0;
  /** Indices written this frame (3 per triangle). */
  icount = 0;
  /** Bumps whenever the arrays are replaced by bigger ones. */
  generation = 0;
  /** x, y, z in world metres, then the depth pull towards the camera in metres. */
  pos!: Float32Array;
  /** Atlas coordinates, v measured from the top. */
  uv!: Float32Array;
  /** Colour r, g, b (linear or sRGB, as the renderer wants) and alpha. */
  col!: Float32Array;
  /** Which layer of its effect made each vertex (for the cost panel and the tests). */
  layer!: Int32Array;
  idx!: Uint32Array;
  private vcap: number;
  private icap: number;

  constructor(vertices = 1024) {
    this.vcap = Math.max(4, vertices);
    this.icap = this.vcap * 2;
    this.alloc();
  }

  clear(): void {
    this.vcount = 0;
    this.icount = 0;
  }

  /** Add a vertex; returns its index. */
  vertex(x: number, y: number, z: number, pull: number, u: number, v: number, r: number, g: number, b: number, a: number, layer: number): number {
    if (this.vcount >= this.vcap) this.grow(true, false);
    const n = this.vcount, i4 = n * 4, i2 = n * 2;
    const p = this.pos, c = this.col, t = this.uv;
    p[i4] = x; p[i4 + 1] = y; p[i4 + 2] = z; p[i4 + 3] = pull;
    t[i2] = u; t[i2 + 1] = v;
    c[i4] = r; c[i4 + 1] = g; c[i4 + 2] = b; c[i4 + 3] = a;
    this.layer[n] = layer;
    this.vcount = n + 1;
    return n;
  }

  tri(a: number, b: number, c: number): void {
    if (this.icount + 3 > this.icap) this.grow(false, true);
    const i = this.icount;
    this.idx[i] = a; this.idx[i + 1] = b; this.idx[i + 2] = c;
    this.icount = i + 3;
  }

  /**
   * A quad from its centre and two full-size axes: corners bottom-left, bottom-right, top-right, top-left.
   * uv: left u, top v, right u, bottom v.
   */
  quad(
    cx: number, cy: number, cz: number,
    xx: number, xy: number, xz: number,
    yx: number, yy: number, yz: number,
    uL: number, vT: number, uR: number, vB: number,
    r: number, g: number, b: number, a: number,
    pull: number, layer: number,
  ): void {
    const hx = xx / 2, hy = xy / 2, hz = xz / 2, vx = yx / 2, vy = yy / 2, vz = yz / 2;
    const i0 = this.vertex(cx - hx - vx, cy - hy - vy, cz - hz - vz, pull, uL, vB, r, g, b, a, layer);
    const i1 = this.vertex(cx + hx - vx, cy + hy - vy, cz + hz - vz, pull, uR, vB, r, g, b, a, layer);
    const i2 = this.vertex(cx + hx + vx, cy + hy + vy, cz + hz + vz, pull, uR, vT, r, g, b, a, layer);
    const i3 = this.vertex(cx - hx + vx, cy - hy + vy, cz - hz + vz, pull, uL, vT, r, g, b, a, layer);
    this.tri(i0, i1, i2);
    this.tri(i0, i2, i3);
  }

  private alloc(): void {
    this.pos = new Float32Array(this.vcap * 4);
    this.uv = new Float32Array(this.vcap * 2);
    this.col = new Float32Array(this.vcap * 4);
    this.layer = new Int32Array(this.vcap);
    this.idx = new Uint32Array(this.icap);
  }

  private grow(vertices: boolean, indices: boolean): void {
    const old = { pos: this.pos, uv: this.uv, col: this.col, layer: this.layer, idx: this.idx };
    if (vertices) this.vcap *= 2;
    if (indices) this.icap *= 2;
    this.alloc();
    this.pos.set(old.pos); this.uv.set(old.uv); this.col.set(old.col); this.layer.set(old.layer); this.idx.set(old.idx);
    this.generation++;
  }
}

export class DrawSink {
  readonly groups: Record<BlendGroup, TriBuffer>;

  constructor(vertices = 1024) {
    this.groups = Object.fromEntries(BLEND_GROUPS.map((g) => [g, new TriBuffer(vertices)])) as Record<BlendGroup, TriBuffer>;
  }

  clear(): void {
    for (const g of BLEND_GROUPS) this.groups[g].clear();
  }

  /** Triangles in all groups this frame. */
  get triangles(): number {
    let n = 0;
    for (const g of BLEND_GROUPS) n += this.groups[g].icount / 3;
    return n;
  }

  /** Groups with something to draw (one draw call each). */
  get drawCalls(): number {
    let n = 0;
    for (const g of BLEND_GROUPS) if (this.groups[g].icount > 0) n++;
    return n;
  }
}

/** A sprite quad read back from a buffer (tests and the editor's inspector, not the per-frame path). */
export interface QuadRecord {
  centre: [number, number, number];
  pull: number;
  axisX: [number, number, number];
  axisY: [number, number, number];
  uv: [number, number, number, number];
  colour: [number, number, number, number];
  layer: number;
}

/** Read back quads written with TriBuffer.quad(), in order. Only meaningful for buffers holding sprites only. */
export function readQuads(b: TriBuffer): QuadRecord[] {
  const out: QuadRecord[] = [];
  const P = (i: number, k: number) => b.pos[i * 4 + k]!;
  for (let q = 0; q + 3 < b.vcount; q += 4) {
    const c = [0, 1, 2].map((k) => (P(q, k) + P(q + 1, k) + P(q + 2, k) + P(q + 3, k)) / 4) as [number, number, number];
    out.push({
      centre: c,
      pull: P(q, 3),
      axisX: [0, 1, 2].map((k) => P(q + 1, k) - P(q, k)) as [number, number, number],
      axisY: [0, 1, 2].map((k) => P(q + 3, k) - P(q, k)) as [number, number, number],
      uv: [b.uv[q * 2]!, b.uv[(q + 3) * 2 + 1]!, b.uv[(q + 1) * 2]!, b.uv[q * 2 + 1]!],
      colour: [b.col[q * 4]!, b.col[q * 4 + 1]!, b.col[q * 4 + 2]!, b.col[q * 4 + 3]!],
      layer: b.layer[q]!,
    });
  }
  return out;
}
