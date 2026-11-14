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
import { box, grow, limb, merge, taperedBox, toGeometry, transform } from './shapes';
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

/** The wall for cover, centred on x = z = 0, long side along x. */
export function buildWall(inShade: boolean): Actor {
  const w = data.wall;
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
