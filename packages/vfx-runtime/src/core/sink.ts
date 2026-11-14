/**
 * Where evaluate() writes the quads it wants drawn: plain typed arrays, one row per quad, reused every frame.
 * The three.js side uploads these arrays as they are. Nothing is allocated per frame unless the arrays must grow.
 */
export class QuadSink {
  count = 0;
  capacity: number;
  /** Bumps whenever the arrays are replaced by bigger ones. */
  generation = 0;
  /** x, y, z of the quad's centre (world metres), then the depth pull towards the camera (metres). */
  centre!: Float32Array;
  /** The quad's full width as a world vector; w unused. */
  axisX!: Float32Array;
  /** The quad's full height as a world vector; w unused. */
  axisY!: Float32Array;
  /** Atlas coordinates: left u, top v, right u, bottom v (v measured from the top of the atlas). */
  uv!: Float32Array;
  /** Linear-light r, g, b and alpha. */
  colour!: Float32Array;
  /** Which layer of its effect made the quad (for the cost panel and picking). */
  layer!: Int32Array;

  constructor(capacity = 256) {
    this.capacity = Math.max(1, capacity);
    this.alloc(this.capacity);
  }

  clear(): void {
    this.count = 0;
  }

  push(
    cx: number, cy: number, cz: number, pull: number,
    xx: number, xy: number, xz: number,
    yx: number, yy: number, yz: number,
    uL: number, vT: number, uR: number, vB: number,
    r: number, g: number, b: number, a: number,
    layer: number,
  ): void {
    if (this.count >= this.capacity) this.grow();
    const i = this.count * 4;
    this.centre[i] = cx; this.centre[i + 1] = cy; this.centre[i + 2] = cz; this.centre[i + 3] = pull;
    this.axisX[i] = xx; this.axisX[i + 1] = xy; this.axisX[i + 2] = xz; this.axisX[i + 3] = 0;
    this.axisY[i] = yx; this.axisY[i + 1] = yy; this.axisY[i + 2] = yz; this.axisY[i + 3] = 0;
    this.uv[i] = uL; this.uv[i + 1] = vT; this.uv[i + 2] = uR; this.uv[i + 3] = vB;
    this.colour[i] = r; this.colour[i + 1] = g; this.colour[i + 2] = b; this.colour[i + 3] = a;
    this.layer[this.count] = layer;
    this.count++;
  }

  private alloc(n: number): void {
    this.centre = new Float32Array(n * 4);
    this.axisX = new Float32Array(n * 4);
    this.axisY = new Float32Array(n * 4);
    this.uv = new Float32Array(n * 4);
    this.colour = new Float32Array(n * 4);
    this.layer = new Int32Array(n);
  }

  private grow(): void {
    const old = { centre: this.centre, axisX: this.axisX, axisY: this.axisY, uv: this.uv, colour: this.colour, layer: this.layer };
    this.capacity *= 2;
    this.alloc(this.capacity);
    this.centre.set(old.centre); this.axisX.set(old.axisX); this.axisY.set(old.axisY);
    this.uv.set(old.uv); this.colour.set(old.colour); this.layer.set(old.layer);
    this.generation++;
  }

  /** The quads as objects, for tests and the editor's inspector. Not for the per-frame path. */
  read(): QuadRecord[] {
    const out: QuadRecord[] = [];
    for (let q = 0; q < this.count; q++) {
      const i = q * 4;
      out.push({
        centre: [this.centre[i]!, this.centre[i + 1]!, this.centre[i + 2]!],
        pull: this.centre[i + 3]!,
        axisX: [this.axisX[i]!, this.axisX[i + 1]!, this.axisX[i + 2]!],
        axisY: [this.axisY[i]!, this.axisY[i + 1]!, this.axisY[i + 2]!],
        uv: [this.uv[i]!, this.uv[i + 1]!, this.uv[i + 2]!, this.uv[i + 3]!],
        colour: [this.colour[i]!, this.colour[i + 1]!, this.colour[i + 2]!, this.colour[i + 3]!],
        layer: this.layer[q]!,
      });
    }
    return out;
  }
}

export interface QuadRecord {
  centre: [number, number, number];
  pull: number;
  axisX: [number, number, number];
  axisY: [number, number, number];
  uv: [number, number, number, number];
  colour: [number, number, number, number];
  layer: number;
}
