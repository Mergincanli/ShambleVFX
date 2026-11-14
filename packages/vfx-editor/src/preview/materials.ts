/**
 * Materials for the preview scene (not the runtime): two-tone toon faces, flat ink, flat ground.
 * Colours follow the drawing board: lit = base x sun colour, shade = base x shadow colour (both in sRGB, as the
 * board multiplies), and a face turned away from the sun is x 0.72.
 */
import { BackSide, Color, MeshBasicNodeMaterial } from 'three/webgpu';
import { color, dot, normalWorld, select, uniform, vec3 } from 'three/tsl';
import { cameraGround } from './camera';
import data from './scene-data.json';

export function hexMul(a: string, b: string): string {
  const pa = parse(a), pb = parse(b);
  return toHex(pa.map((v, i) => (v * pb[i]!) / 255));
}
export function hexScale(a: string, f: number): string {
  return toHex(parse(a).map((v) => v * f));
}
function parse(h: string): number[] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function toHex(c: number[]): string {
  return '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Direction towards the sun, in world axes (board v7: shadows fall 0.75 m right and 0.22 m up the screen per metre). */
export function sunDirection(): [number, number, number] {
  const [r, a] = data.light.sunFromCamera as [number, number];
  const s = cameraGround(r, a);
  const n = Math.hypot(s.x, 1, s.z);
  return [-s.x / n, 1 / n, -s.z / n];
}

/** Where a point at height h casts its shadow, per metre of height, as a world vector on the ground. */
export function shadowOffsetPerMetre(): [number, number] {
  const [r, a] = data.light.sunFromCamera as [number, number];
  const s = cameraGround(r, a);
  return [s.x, s.z];
}

const SUN = uniform(vec3(...sunDirection()));

/** A two-tone face: lit colour where the face turns to the sun, x 0.72 elsewhere. */
export function toon(base: string, inShade: boolean): MeshBasicNodeMaterial {
  const lit = hexMul(base, inShade ? data.light.shadow : data.light.sun);
  const away = hexScale(lit, data.light.turnedAway);
  const m = new MeshBasicNodeMaterial();
  m.colorNode = select(dot(normalWorld, SUN).greaterThan(0.2), color(new Color(lit)), color(new Color(away)));
  return m;
}

/** Ink drawn from the back faces of a slightly larger solid (an "inverted hull"). */
export function inkHull(opts: { writeDepth: boolean }): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ color: new Color(data.ink.hex) });
  m.side = BackSide;
  m.depthWrite = opts.writeDepth;
  return m;
}

export function flat(hex: string, opts: { writeDepth?: boolean; offset?: number } = {}): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ color: new Color(hex) });
  m.depthWrite = opts.writeDepth ?? true;
  if (opts.offset) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -opts.offset;
    m.polygonOffsetUnits = -opts.offset;
  }
  return m;
}

/** Is a ground point inside the board's band of shadow? */
export function inShadeBand(x: number, z: number): boolean {
  const band = data.ground.shadeBand;
  // Board camera-aligned coordinates: right = x*cos(yaw) + y*sin(yaw), away = -x*sin(yaw) + y*cos(yaw), with board y = -z.
  const yaw = (data.camera.yawDeg * Math.PI) / 180;
  const bx = x, by = -z;
  const right = bx * Math.cos(yaw) + by * Math.sin(yaw);
  const away = -bx * Math.sin(yaw) + by * Math.cos(yaw);
  const v = right - away;
  return v > band.nearM && v < band.farM;
}
