/**
 * Draws effects with three.js: every triangle of every playing effect, one mesh per blend group, one atlas texture.
 * Runs on the WebGPU renderer and on its WebGL 2 backend. No compute: the core builds the triangles on the CPU,
 * the vertex stage places them.
 *
 * Use, per frame:
 *   vfx.begin(camera);  vfx.draw(effect, { seed, timeMs, inputs, faction });  ...  vfx.end();  renderer.render(scene, camera);
 */
import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  CanvasTexture,
  ColorManagement,
  DataTexture,
  DynamicDrawUsage,
  Group,
  LinearFilter,
  Mesh,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
} from 'three/webgpu';
import type { Camera } from 'three/webgpu';
import type { EffectFile, FactionId, Palette, TierName } from '@shamble/vfx-format';
import { evaluate } from '../core/evaluate';
import type { CameraBasis, EvalResult, NotDrawn, UvRect } from '../core/evaluate';
import type { Relation } from '../core/draw';
import type { EffectLookup, EffectPlayer } from '../core/player';
import { BLEND_GROUPS, DrawSink } from '../core/sink';
import type { BlendGroup, TriBuffer } from '../core/sink';
import type { EffectInputs } from '../core/timeline';
import { atlasLookup } from './atlas';
import type { Atlas } from './atlas';
import { createEffectMaterial } from './tsl';
import type { BlendMode, EffectMaterial } from './tsl';

export interface DrawParams {
  seed: number;
  timeMs: number;
  inputs: EffectInputs;
  faction: FactionId;
  /** Who made the effect, seen from the player looking: an enemy (the default), your team, or you. */
  relation?: Relation;
  /** Distance from the player looking to the event, metres (comic words shrink with it). */
  viewerDistanceM?: number;
}

export interface VfxStats {
  /** Triangles drawn this frame. */
  triangles: number;
  /** Draw calls the effects cost this frame (one per blend group in use). */
  drawCalls: number;
  /** Separate items drawn this frame: each sprite, particle, dot, letter, flame tongue and shape counts once. */
  items: number;
  /** Effects drawn this frame. */
  effects: number;
  /**
   * The layers that should have drawn this frame but could not, because the atlas does not have their image: one entry
   * per effect and layer, however often the effect was drawn. A layer the tier leaves out is never listed.
   */
  notDrawn: NotDrawn[];
}

const BLEND_OF: Record<BlendGroup, BlendMode> = { 'ground-multiply': 'multiply', 'ground-screen': 'screen', ground: 'over', top: 'over' };

interface GroupMesh {
  mesh: Mesh;
  geometry: BufferGeometry;
  material: EffectMaterial;
  generation: number;
}

export class VfxRenderer {
  /** Add this to the scene. It holds one mesh per blend group. */
  readonly object = new Group();
  /** The quality tier every effect draws at: low, medium or high (the game's setting). */
  tier: TierName = 'high';
  readonly sink: DrawSink;
  palette: Palette;
  private meshes: Record<BlendGroup, GroupMesh>;
  private texture: Texture;
  private lookup: (name: string) => UvRect | undefined = () => undefined;
  private whiteUv: [number, number] = [0.5, 0.5];
  private dotRect: UvRect | undefined;
  private basis: CameraBasis = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };
  private effectsThisFrame = 0;
  private notDrawnThisFrame: NotDrawn[] = [];
  private colourSpace: 'linear' | 'srgb' = 'linear';

  /** renderOrder: the ground groups draw at renderOrder .. +2, the top group at renderOrder + 10. */
  constructor(palette: Palette, opts: { renderOrder?: number; vertices?: number } = {}) {
    this.palette = palette;
    this.sink = new DrawSink(opts.vertices ?? 2048);
    this.texture = whiteTexture();
    const base = opts.renderOrder ?? 100;
    const order: Record<BlendGroup, number> = { 'ground-multiply': base, 'ground-screen': base + 1, ground: base + 2, top: base + 10 };
    this.meshes = Object.fromEntries(BLEND_GROUPS.map((g) => {
      const material = createEffectMaterial(this.texture, BLEND_OF[g]);
      const geometry = makeGeometry(this.sink.groups[g]);
      const mesh = new Mesh(geometry, material.material);
      mesh.name = `shamble-vfx ${g}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = order[g];
      mesh.visible = false;
      this.object.add(mesh);
      return [g, { mesh, geometry, material, generation: this.sink.groups[g].generation }];
    })) as unknown as Record<BlendGroup, GroupMesh>;
    this.object.name = 'shamble-vfx';
  }

  /**
   * Use a new atlas (after images were added or changed). The atlas should hold a white block named "__white", and may
   * hold a round white dot named "__dot" (16 px, radius 7): halftone dots then cost two triangles each.
   */
  setAtlas(atlas: Atlas): void {
    // (A worker or a test has no HTMLCanvasElement.)
    const canvas = typeof HTMLCanvasElement !== 'undefined' && atlas.image instanceof HTMLCanvasElement;
    const tex = canvas ? new CanvasTexture(atlas.image as HTMLCanvasElement) : new Texture(atlas.image as TexImageSource);
    tex.flipY = false; // atlas v is measured from the top
    tex.generateMipmaps = false;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.colorSpace = ColorManagement.enabled ? SRGBColorSpace : NoColorSpace;
    tex.needsUpdate = true;
    for (const g of BLEND_GROUPS) this.meshes[g].material.setMap(tex);
    this.texture.dispose();
    this.texture = tex;
    this.lookup = atlasLookup(atlas);
    const w = this.lookup('__white');
    this.whiteUv = w ? [(w.u0 + w.u1) / 2, (w.v0 + w.v1) / 2] : [0.5, 0.5];
    this.dotRect = this.lookup('__dot');
  }

  /** The atlas point that is plain white: shapes are drawn with it. */
  get white(): [number, number] {
    return this.whiteUv;
  }

  /** Start a frame. */
  begin(camera: Camera): void {
    this.sink.clear();
    this.effectsThisFrame = 0;
    // A new list, so one handed out with last frame's stats stays as it was.
    this.notDrawnThisFrame = [];
    this.colourSpace = ColorManagement.enabled ? 'linear' : 'srgb';
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const n = (x: number, y: number, z: number): [number, number, number] => {
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    this.basis = { right: n(e[0]!, e[1]!, e[2]!), up: n(e[4]!, e[5]!, e[6]!), forward: n(-e[8]!, -e[9]!, -e[10]!) };
  }

  /** Add one moment of one effect. */
  draw(effect: EffectFile, p: DrawParams): EvalResult {
    this.effectsThisFrame++;
    const r = evaluate(effect, {
      seed: p.seed,
      timeMs: p.timeMs,
      inputs: p.inputs,
      faction: p.faction,
      ...(p.relation ? { relation: p.relation } : {}),
      ...(p.viewerDistanceM !== undefined ? { viewerDistanceM: p.viewerDistanceM } : {}),
      palette: this.palette,
      camera: this.basis,
      imageRect: this.lookup,
      colourSpace: this.colourSpace,
      white: this.whiteUv,
      ...(this.dotRect ? { dot: this.dotRect } : {}),
      tier: this.tier,
    }, this.sink);
    const list = this.notDrawnThisFrame;
    for (const m of r.notDrawn) if (!list.some((x) => x.effect === m.effect && x.index === m.index)) list.push(m);
    return r;
  }

  /** Add every effect the player has running at nowMs. */
  drawPlaying(player: EffectPlayer, nowMs: number, lookup: EffectLookup): void {
    for (const p of player.alive(nowMs, lookup)) {
      const fx = lookup(p.effectId);
      if (fx) this.draw(fx, { seed: p.seed, timeMs: nowMs - p.startMs, inputs: p.inputs, faction: p.faction, relation: p.relation, viewerDistanceM: p.viewerDistanceM });
    }
  }

  /** Hand this frame's triangles to the GPU. Call before renderer.render(). */
  end(): void {
    for (const g of BLEND_GROUPS) {
      const buf = this.sink.groups[g];
      const m = this.meshes[g];
      if (buf.generation !== m.generation) {
        m.geometry.dispose();
        m.geometry = makeGeometry(buf);
        m.mesh.geometry = m.geometry;
        m.generation = buf.generation;
      } else if (buf.icount > 0) {
        const ib = (m.geometry.getAttribute('position') as InterleavedBufferAttribute).data;
        ib.clearUpdateRanges();
        ib.addUpdateRange(0, buf.vcount * 4);
        ib.needsUpdate = true;
        for (const [name, size] of [['vUv', 2], ['vCol', 4]] as const) {
          const a = m.geometry.getAttribute(name) as BufferAttribute;
          a.clearUpdateRanges();
          a.addUpdateRange(0, buf.vcount * size);
          a.needsUpdate = true;
        }
        const index = m.geometry.getIndex()!;
        index.clearUpdateRanges();
        index.addUpdateRange(0, buf.icount);
        index.needsUpdate = true;
      }
      m.geometry.setDrawRange(0, buf.icount);
      m.mesh.visible = buf.icount > 0;
    }
  }

  get stats(): VfxStats {
    return { triangles: this.sink.triangles, drawCalls: this.sink.drawCalls, items: this.sink.items, effects: this.effectsThisFrame, notDrawn: this.notDrawnThisFrame };
  }

  dispose(): void {
    for (const g of BLEND_GROUPS) {
      this.meshes[g].geometry.dispose();
      this.meshes[g].material.material.dispose();
    }
    this.texture.dispose();
  }
}

function makeGeometry(buf: TriBuffer): BufferGeometry {
  const g = new BufferGeometry();
  // x, y, z and the depth pull sit side by side in one buffer: "position" reads the first three, "vPull" the fourth.
  const ib = new InterleavedBuffer(buf.pos, 4); ib.setUsage(DynamicDrawUsage);
  const uv = new BufferAttribute(buf.uv, 2); uv.setUsage(DynamicDrawUsage);
  const col = new BufferAttribute(buf.col, 4); col.setUsage(DynamicDrawUsage);
  g.setAttribute('position', new InterleavedBufferAttribute(ib, 3, 0));
  g.setAttribute('vPull', new InterleavedBufferAttribute(ib, 1, 3));
  g.setAttribute('vUv', uv);
  g.setAttribute('vCol', col);
  const idx = new BufferAttribute(buf.idx, 1); idx.setUsage(DynamicDrawUsage);
  g.setIndex(idx);
  g.setDrawRange(0, buf.icount);
  return g;
}

function whiteTexture(): Texture {
  const t = new DataTexture(new Uint8Array(4 * 4 * 4).fill(255), 4, 4, RGBAFormat);
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}
