/**
 * The two scale objects of the preview: the Conscript stand-in (Sheet 16) and the wall for cover (Sheet 17).
 * Every number comes from scene-data.json; the few the sheets do not give are under standIn.assumed.
 *
 * Ink (the advisor's order): each object draws as a group, far to near. First its thick outline hull, without
 * writing depth, so its own parts paint over the inside and only the outer silhouette stays; then its parts and
 * the thin hulls that draw the lines inside it.
 */
import { BufferGeometry, Group, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import type { FactionId } from '@shamble/vfx-format';
import { box, grow, limb, merge, prism, slab, taperedBox, toGeometry, transform } from './shapes';
import type { Solid } from './shapes';
import { flat, inkHull, toon } from './materials';
import data from './scene-data.json';
import { Matrix4 } from 'three';

const PPM = data.camera.pxPerMetreAt1080;
/** Ink widths in metres, from the px widths of the line rule at 1080p. */
export const INK_M = {
  unitOutline: data.lines.unitOutlinePx / PPM,
  unitInside: data.lines.unitInsidePx / PPM,
  wallOutline: data.lines.wallOutlinePx / PPM,
  wallEdge: data.lines.wallEdgePx / PPM,
};

export interface Actor {
  group: Group;
  /** All parts as one solid, for the flat shadow. */
  shadowGeometry: BufferGeometry;
  /** Draw order: the thick hull at base, everything else at base + 1. */
  setOrder(base: number): void;
  dispose(): void;
}

interface Part { solid: Solid; colour: string }

function assemble(parts: Part[], outline: number, inside: number, inShade: boolean, name: string): Actor {
  const group = new Group();
  group.name = name;
  const byColour = new Map<string, Solid[]>();
  for (const p of parts) byColour.set(p.colour, [...(byColour.get(p.colour) ?? []), p.solid]);
  const meshes: Mesh[] = [];
  for (const [colour, solids] of byColour) {
    const m = new Mesh(toGeometry(merge(solids)), toon(colour, inShade));
    meshes.push(m);
  }
  const thin = new Mesh(toGeometry(onGround(merge(parts.map((p) => grow(p.solid, inside))))), inkHull({ writeDepth: true }));
  const thick = new Mesh(toGeometry(onGround(merge(parts.map((p) => grow(p.solid, outline))))), inkHull({ writeDepth: false }));
  group.add(thick, thin, ...meshes);
  const shadowGeometry = toGeometry(merge(parts.map((p) => p.solid)));
  return {
    group,
    shadowGeometry,
    setOrder(base: number) {
      thick.renderOrder = base;
      thin.renderOrder = base + 1;
      for (const m of meshes) m.renderOrder = base + 1;
    },
    dispose() {
      for (const o of [thick, thin, ...meshes]) {
        o.geometry.dispose();
        (o.material as MeshBasicNodeMaterial).dispose();
      }
      shadowGeometry.dispose();
    },
  };
}

/** The Conscript stand-in, facing +z, feet on y = 0. Returns the actor and the muzzle point in its own space. */
export function buildStandIn(faction: FactionId, inShade: boolean): Actor & { muzzle: Vector3 } {
  const H = data.standIn.heights, W = data.standIn.widths, D = data.standIn.depths, A = data.standIn.assumed;
  const C = data.standIn.materials[faction];
  const parts: Part[] = [];
  const add = (solid: Solid, colour: string) => parts.push({ solid, colour });
  const at = (s: Solid, x: number, y: number, z: number) => transform(s, new Matrix4().makeTranslation(x, y, z));

  // Legs and boots (Dark), under the coat.
  for (const side of [-1, 1]) {
    const x = side * (A.legGap / 2 + A.legWidth / 2);
    add(at(box(A.legWidth, H.coatHem + 0.03, A.legDepth), x, 0, 0), C.dark);
    add(at(box(A.legWidth + 0.015, H.bootTop * 0.3, A.legDepth + 0.08), x, 0, 0.04), C.dark);
  }
  // The long coat that widens to the hem, and the body up to the shoulders.
  add(taperedBox(W.coatHem, D.coatHem, W.waist, 0.25, H.coatHem, H.belt), C.coat);
  add(taperedBox(W.waist + 0.02, 0.25, W.shoulders - 0.06, 0.27, H.belt, H.shoulders), C.coat);
  add(box(W.waist + 0.04, 0.065, 0.28, H.belt - 0.035), C.dark); // belt
  // Shoulder boards: the faction's top colour on a trim rim.
  for (const side of [-1, 1]) {
    add(at(box(0.145, 0.016, 0.19, H.shoulders - 0.004), side * 0.17, 0, 0), C.trim);
    add(at(box(0.12, 0.022, 0.165, H.shoulders + 0.01), side * 0.17, 0, 0), C.top);
  }
  // Neck, fur hat with ear flaps, the hat's top in the faction's top colour, the dark face strip.
  add(box(0.15, H.chin + 0.04 - H.shoulders, 0.15, H.shoulders), C.dark);
  add(box(A.hatWidth, H.hatTop - 0.045 - H.chin, A.hatDepth, H.chin), C.coat);
  add(box(A.hatWidth - 0.03, 0.045, A.hatDepth - 0.03, H.hatTop - 0.045), C.top);
  add(at(box(0.17, 0.1, 0.02, H.chin + 0.03), 0, 0, A.hatDepth / 2), C.dark);

  // The rifle, held across the chest and aimed forward (assumed pose), and the arms that hold it.
  const rx = -0.06, ry = A.rifleHeight;
  const stock = new Vector3(rx, ry, -0.12), muzzle = new Vector3(rx, ry, -0.12 + A.rifleLength);
  add(limb(stock, muzzle, A.rifleThickness, A.rifleThickness * 1.4), C.dark);
  const handR = new Vector3(rx - 0.02, ry - 0.05, 0.12), handL = new Vector3(rx + 0.02, ry - 0.04, 0.44);
  const shoulderR = new Vector3(-0.2, H.shoulders - 0.05, 0), shoulderL = new Vector3(0.2, H.shoulders - 0.05, 0);
  const elbowR = new Vector3(-0.22, H.shoulders - 0.3, 0.02), elbowL = new Vector3(0.17, H.shoulders - 0.28, 0.2);
  add(limb(shoulderR, elbowR, A.armWidth), C.coat);
  add(limb(elbowR, handR, A.armWidth * 0.9), C.coat);
  add(limb(shoulderL, elbowL, A.armWidth), C.coat);
  add(limb(elbowL, handL, A.armWidth * 0.9), C.coat);
  for (const h of [handR, handL]) add(at(box(0.085, 0.085, 0.095, -0.0425), h.x, h.y, h.z), C.dark);

  const actor = assemble(parts, INK_M.unitOutline, INK_M.unitInside, inShade, `stand-in ${faction}`);
  return { ...actor, muzzle: muzzle.clone().add(new Vector3(0, 0, 0.02)) };
}

/** The wall for cover, centred on x = z = 0, long side along x. A scene may give its own length and thickness. */
export function buildWall(inShade: boolean, size: { lengthM?: number; thicknessM?: number } = {}): Actor {
  const w = { ...data.wall, ...size };
  const part: Part = { solid: box(w.lengthM, w.heightM, w.thicknessM), colour: w.base };
  const actor = assemble([part], INK_M.wallOutline, INK_M.wallEdge, inShade, 'wall for cover');
  // Edges between the wall's own faces: thin dark lines along the top edges, as the board strokes each face.
  const e = INK_M.wallEdge;
  const hw = w.lengthM / 2, ht = w.thicknessM / 2, top = w.heightM;
  const edges = merge([
    at3(box(w.lengthM + e, e, e), 0, top - e / 2, ht),
    at3(box(w.lengthM + e, e, e), 0, top - e / 2, -ht),
    at3(box(e, e, w.thicknessM + e), hw, top - e / 2, 0),
    at3(box(e, e, w.thicknessM + e), -hw, top - e / 2, 0),
    at3(box(e, w.heightM, e), hw, 0, ht),
    at3(box(e, w.heightM, e), -hw, 0, ht),
    at3(box(e, w.heightM, e), hw, 0, -ht),
    at3(box(e, w.heightM, e), -hw, 0, -ht),
  ]);
  const edgeMesh = new Mesh(toGeometry(edges), flat(data.ink.hex));
  actor.group.add(edgeMesh);
  const setOrder = actor.setOrder;
  return {
    ...actor,
    setOrder(base: number) {
      setOrder(base);
      edgeMesh.renderOrder = base + 1;
    },
    dispose() {
      actor.dispose();
      edgeMesh.geometry.dispose();
      (edgeMesh.material as MeshBasicNodeMaterial).dispose();
    },
  };
}

/** Keep ink above the ground: the part under the feet then shows as the ink contact line around them. */
function onGround(s: Solid): Solid {
  for (let i = 1; i < s.positions.length; i += 3) if (s.positions[i]! < 0.001) s.positions[i] = 0.001;
  return s;
}

function at3(s: Solid, x: number, y: number, z: number): Solid {
  return transform(s, new Matrix4().makeTranslation(x, y, z));
}

/**
 * The drawing board's tank blockout, facing +z, tracks on y = 0. The board gives a tank in its own axes (u forward,
 * v to the left, z up); here u is +z, v is +x and z is +y. Returns the actor, the point the effect starts from (the
 * gun's muzzle or the Hammer's emitter) and the point a beam aims at (the top of the turret), in its own space.
 */
export function buildTank(faction: FactionId, gun: 'gun' | 'hammer', inShade: boolean): Actor & { muzzle: Vector3; top: Vector3 } {
  const T = data.tank;
  const team = data.standIn.materials[faction].top;
  const parts: Part[] = [];
  const add = (solid: Solid, colour: string) => parts.push({ solid, colour });
  const uvz = (b: { u: number[]; v: number[]; z: number[] }) => slab(b.v[0]!, b.v[1]!, b.z[0]!, b.z[1]!, b.u[0]!, b.u[1]!);
  for (const side of [1, -1]) add(uvz({ u: T.track.u, v: T.track.v.map((v) => v * side).sort((a, b) => a - b), z: T.track.z }), T.track.colour);
  add(uvz(T.hull), T.hullColour[faction]);
  // The band of team colour over the deck and down the sides, a hair proud of the hull so it shows.
  const e = 0.004;
  add(slab(T.hull.v[0]! - e, T.hull.v[1]! + e, T.hull.z[0]!, T.hull.z[1]! + e, T.band.u[0]!, T.band.u[1]!), team);
  // The turret: eight sides in team colour darkened, a roof in team colour.
  const outline = T.turret.outline.map(([u, v]) => [v!, u!] as [number, number]);
  const ccw = signedArea(outline) > 0 ? outline : [...outline].reverse();
  add(prism(ccw, T.turret.z[0]!, T.turret.z[1]!), scaleHex(team, T.turret.sideShade));
  add(prism(ccw, T.turret.z[1]!, T.turret.z[1]! + 0.012), team);
  let muzzle: Vector3;
  if (gun === 'gun') {
    add(uvz(T.gun.barrel), T.steel);
    add(uvz(T.gun.brake), T.steel);
    muzzle = new Vector3(T.gun.muzzle[1], T.gun.muzzle[2], T.gun.muzzle[0]);
  } else {
    for (const side of [1, -1]) add(uvz({ u: T.hammer.arms.u, v: T.hammer.arms.v.map((v) => v * side).sort((a, b) => a - b), z: T.hammer.arms.z }), T.steel);
    const r = T.hammer.emitterRadiusM, [eu, ev, ez] = T.hammer.emitter as [number, number, number];
    add(slab(ev - r, ev + r, ez - r, ez + r, eu - r, eu + r), T.emitterColour[faction]);
    muzzle = new Vector3(ev, ez, eu);
  }
  const actor = assemble(parts, INK_M.unitOutline, INK_M.unitInside, inShade, `tank ${faction}`);
  const [tu, tv, tz] = T.top as [number, number, number];
  return { ...actor, muzzle, top: new Vector3(tv, tz, tu) };
}

function signedArea(pts: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i]!, [x1, z1] = pts[(i + 1) % pts.length]!;
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

function scaleHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.min(255, v * k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
