/**
 * Screen area: how much of the 1920 x 1080 game screen an effect's triangles cover. Triangles are filled into a grid of
 * small cells (4 x 4 px by default) by their cell centres: the union counts each cell once, the overlap count counts it
 * once per triangle (what the GPU fills, see-through parts included). Off-screen parts are left out.
 */
import type { Matrix4 } from 'three';
import { BLEND_GROUPS } from '@shamble/vfx-runtime';
import type { DrawSink } from '@shamble/vfx-runtime';

export class Coverage {
  readonly cols: number;
  readonly rows: number;
  private mask: Uint8Array;
  /** Cells covered by at least one triangle. */
  covered = 0;
  /** Cells covered, counted once per triangle. */
  filled = 0;

  constructor(readonly width = 1920, readonly height = 1080, readonly cell = 4) {
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.mask = new Uint8Array(this.cols * this.rows);
  }

  clear(): void {
    this.mask.fill(0);
    this.covered = 0;
    this.filled = 0;
  }

  /** The share of the screen covered (0..1). */
  get union(): number {
    return this.covered / (this.cols * this.rows);
  }

  /** The share of the screen filled, overlaps counted (can pass 1). */
  get withOverlap(): number {
    return this.filled / (this.cols * this.rows);
  }

  /** Fill one triangle given in screen pixels (y down). */
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0 || !Number.isFinite(area)) return;
    const s = area > 0 ? 1 : -1;
    const c = this.cell;
    // Cells whose centres can be inside, clipped to the screen.
    const c0 = Math.max(0, Math.ceil(Math.min(x0, x1, x2) / c - 0.5));
    const c1 = Math.min(this.cols - 1, Math.floor(Math.max(x0, x1, x2) / c - 0.5));
    const r0 = Math.max(0, Math.ceil(Math.min(y0, y1, y2) / c - 0.5));
    const r1 = Math.min(this.rows - 1, Math.floor(Math.max(y0, y1, y2) / c - 0.5));
    if (c0 > c1 || r0 > r1) return;
    // A cell centre exactly on an edge two triangles share belongs to one of them only (the edge's owner).
    const owns = (dx: number, dy: number) => dy * s > 0 || (dy === 0 && dx * s < 0);
    const o0 = owns(x1 - x0, y1 - y0), o1 = owns(x2 - x1, y2 - y1), o2 = owns(x0 - x2, y0 - y2);
    for (let r = r0; r <= r1; r++) {
      const py = (r + 0.5) * c;
      for (let q = c0; q <= c1; q++) {
        const px = (q + 0.5) * c;
        const e0 = ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) * s;
        const e1 = ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) * s;
        const e2 = ((x0 - x2) * (py - y2) - (y0 - y2) * (px - x2)) * s;
        if (e0 < 0 || e1 < 0 || e2 < 0 || (e0 === 0 && !o0) || (e1 === 0 && !o1) || (e2 === 0 && !o2)) continue;
        this.filled++;
        const k = r * this.cols + q;
        if (!this.mask[k]) { this.mask[k] = 1; this.covered++; }
      }
    }
  }

  /** Fill every triangle in a draw sink, seen through a camera's view-projection matrix. */
  sink(sink: DrawSink, viewProjection: Matrix4): void {
    const m = viewProjection.elements;
    let sx = new Float64Array(0), sy = new Float64Array(0), ok = new Uint8Array(0);
    for (const g of BLEND_GROUPS) {
      const b = sink.groups[g];
      if (b.icount === 0) continue;
      if (sx.length < b.vcount) { sx = new Float64Array(b.vcount); sy = new Float64Array(b.vcount); ok = new Uint8Array(b.vcount); }
      for (let i = 0; i < b.vcount; i++) {
        const x = b.pos[i * 4]!, y = b.pos[i * 4 + 1]!, z = b.pos[i * 4 + 2]!;
        const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
        ok[i] = w > 1e-6 ? 1 : 0;
        const nx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
        const ny = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
        sx[i] = ((nx + 1) / 2) * this.width;
        sy[i] = ((1 - ny) / 2) * this.height;
      }
      for (let t = 0; t < b.icount; t += 3) {
        const a = b.idx[t]!, c = b.idx[t + 1]!, d = b.idx[t + 2]!;
        if (!ok[a] || !ok[c] || !ok[d]) continue;
        this.tri(sx[a]!, sy[a]!, sx[c]!, sy[c]!, sx[d]!, sy[d]!);
      }
    }
  }
}
