/**
 * Simple solids for the preview scene: boxes, tapered boxes and limbs, with flat faces,
 * plus their "hulls" (the same solid, a little larger) that draw the ink lines.
 */
import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';

export interface Solid {
  /** Triangle corners, three numbers each, flat faces. */
  positions: number[];
  /** One normal per corner. */
  normals: number[];
}

/** A tapered box: bottom w0 x d0 at height y0, top w1 x d1 at height y1, centred on x = z = 0. */
export function taperedBox(w0: number, d0: number, w1: number, d1: number, y0: number, y1: number): Solid {
  const b = [[-w0 / 2, y0, -d0 / 2], [w0 / 2, y0, -d0 / 2], [w0 / 2, y0, d0 / 2], [-w0 / 2, y0, d0 / 2]];
  const t = [[-w1 / 2, y1, -d1 / 2], [w1 / 2, y1, -d1 / 2], [w1 / 2, y1, d1 / 2], [-w1 / 2, y1, d1 / 2]];
  const quads = [
    [b[0], b[1], b[2], b[3]], // bottom (faces down)
    [t[3], t[2], t[1], t[0]], // top
    [b[3], b[2], t[2], t[3]], // front (+z)
    [b[1], b[0], t[0], t[1]], // back (-z)
    [b[2], b[1], t[1], t[2]], // right (+x)
    [b[0], b[3], t[3], t[0]], // left (-x)
  ];
  const s: Solid = { positions: [], normals: [] };
  for (const q of quads) addQuad(s, q as number[][]);
  return s;
}

export function box(w: number, h: number, d: number, y0 = 0): Solid {
  return taperedBox(w, d, w, d, y0, y0 + h);
}

/** A box of thickness t x t running from a to b (a limb, a rifle). */
export function limb(a: Vector3, b: Vector3, tw: number, td = tw): Solid {
  const len = a.distanceTo(b);
  const s = box(tw, len, td, -len / 2);
  const dir = b.clone().sub(a).normalize();
  const m = new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir), new Vector3(1, 1, 1));
  return transform(s, m);
}

/** The same solid made larger by e metres on every side (for ink). Works for these convex, near-box shapes. */
export function grow(s: Solid, e: number): Solid {
  // Push every corner out along the average of the normals of the faces that meet there,
  // scaled so each face moves out by about e.
  const key = (i: number) => `${s.positions[i]!.toFixed(5)},${s.positions[i + 1]!.toFixed(5)},${s.positions[i + 2]!.toFixed(5)}`;
  const sums = new Map<string, Vector3[]>();
  for (let i = 0; i < s.positions.length; i += 3) {
    const n = new Vector3(s.normals[i], s.normals[i + 1], s.normals[i + 2]);
    const list = sums.get(key(i)) ?? [];
    if (!list.some((m) => m.distanceToSquared(n) < 1e-6)) list.push(n);
    sums.set(key(i), list);
  }
  const out: Solid = { positions: [], normals: [...s.normals] };
  for (let i = 0; i < s.positions.length; i += 3) {
    const faces = sums.get(key(i))!;
    // Solve for the push that moves each meeting face out by e (exact for three perpendicular faces).
    const push = new Vector3();
    for (const n of faces) push.add(n);
    const len2 = push.lengthSq();
    if (len2 > 1e-9) push.multiplyScalar(e * faces.length / len2);
    out.positions.push(s.positions[i]! + push.x, s.positions[i + 1]! + push.y, s.positions[i + 2]! + push.z);
  }
  return out;
}

export function transform(s: Solid, m: Matrix4): Solid {
  const v = new Vector3();
  const nm = new Matrix4().copy(m).invert().transpose();
  const out: Solid = { positions: [], normals: [] };
  for (let i = 0; i < s.positions.length; i += 3) {
    v.set(s.positions[i]!, s.positions[i + 1]!, s.positions[i + 2]!).applyMatrix4(m);
    out.positions.push(v.x, v.y, v.z);
    v.set(s.normals[i]!, s.normals[i + 1]!, s.normals[i + 2]!).applyMatrix4(nm).normalize();
    out.normals.push(v.x, v.y, v.z);
  }
  return out;
}

export function merge(list: Solid[]): Solid {
  const out: Solid = { positions: [], normals: [] };
  for (const s of list) {
    out.positions.push(...s.positions);
    out.normals.push(...s.normals);
  }
  return out;
}

export function toGeometry(s: Solid): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(s.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(s.normals, 3));
  g.computeBoundingSphere();
  return g;
}

function addQuad(s: Solid, q: number[][]): void {
  const [a, b, c, d] = q.map((p) => new Vector3(p[0], p[1], p[2])) as [Vector3, Vector3, Vector3, Vector3];
  const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
  if (n.lengthSq() < 1e-12) n.subVectors(c, a).cross(new Vector3().subVectors(d, a));
  n.normalize();
  for (const p of [a, b, c, a, c, d]) {
    s.positions.push(p.x, p.y, p.z);
    s.normals.push(n.x, n.y, n.z);
  }
}
