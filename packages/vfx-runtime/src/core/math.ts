/** Small vector helpers on [x, y, z] tuples. World axes: x and z on the ground, y up (three.js). */
import type { Vec3 } from '@shamble/vfx-format';

export const UP: Readonly<Vec3> = [0, 1, 0];

export function add(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: Readonly<Vec3>, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
/** a + b * s */
export function addScaled(a: Readonly<Vec3>, b: Readonly<Vec3>, s: number): Vec3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}
export function dot(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function length(a: Readonly<Vec3>): number {
  return Math.hypot(a[0], a[1], a[2]);
}
/** Unit vector, or undefined when the vector is (almost) zero. */
export function normalize(a: Readonly<Vec3>): Vec3 | undefined {
  const l = length(a);
  return l < 1e-9 ? undefined : [a[0] / l, a[1] / l, a[2] / l];
}
export function lerp(a: Readonly<Vec3>, b: Readonly<Vec3>, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The shot frame: forward points from origin to target, flat on the ground; right and up complete it.
 * When origin and target are the same point (a blast), forward is world -z.
 */
export interface ShotFrame {
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

export function shotFrame(origin: Readonly<Vec3>, target: Readonly<Vec3>): ShotFrame {
  const forward = normalize([target[0] - origin[0], 0, target[2] - origin[2]]) ?? ([0, 0, -1] as Vec3);
  const right = cross(forward, UP);
  return { right, up: [0, 1, 0], forward };
}

/** An offset given in the shot frame (x right, y up, z forward), as a world vector. */
export function frameOffset(f: ShotFrame, o: Readonly<Vec3>): Vec3 {
  return [
    f.right[0] * o[0] + f.up[0] * o[1] + f.forward[0] * o[2],
    f.right[1] * o[0] + f.up[1] * o[1] + f.forward[1] * o[2],
    f.right[2] * o[0] + f.up[2] * o[1] + f.forward[2] * o[2],
  ];
}
