/**
 * Draws effects with three.js: every quad of every playing effect in one instanced mesh with one atlas texture.
 * Runs on the WebGPU renderer and on its WebGL 2 backend. No compute: the core writes the quads on the CPU,
 * the vertex stage places them.
 *
 * Use, per frame:
 *   vfx.begin(camera);  vfx.draw(effect, { seed, timeMs, inputs, faction });  ...  vfx.end();  renderer.render(scene, camera);
 */
import {
  BufferAttribute,
  CanvasTexture,
  ColorManagement,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
} from 'three/webgpu';
import type { Camera } from 'three/webgpu';
import type { EffectFile, FactionId, Palette } from '@shamble/vfx-format';
import { evaluate } from '../core/evaluate';
import type { CameraBasis, EvalResult, UvRect } from '../core/evaluate';
import type { EffectLookup, EffectPlayer } from '../core/player';
import { QuadSink } from '../core/sink';
import type { EffectInputs } from '../core/timeline';
import { atlasLookup } from './atlas';
import type { Atlas } from './atlas';
import { createSpriteMaterial } from './tsl';
import type { SpriteMaterial } from './tsl';

export interface DrawParams {
  seed: number;
  timeMs: number;
  inputs: EffectInputs;
  faction: FactionId;
}

export interface VfxStats {
  /** Quads drawn this frame. */
  quads: number;
  /** Draw calls the effects cost this frame. */
  drawCalls: number;
  /** Effects drawn this frame. */
  effects: number;
}

const ATTRS = ['iCentre', 'iAxisX', 'iAxisY', 'iUv', 'iColour'] as const;

export class VfxRenderer {
  readonly mesh: Mesh;
  readonly sink: QuadSink;
  palette: Palette;
  private geometry: InstancedBufferGeometry;
  private sprite: SpriteMaterial;
  private texture: Texture;
  private generation = -1;
  private lookup: (name: string) => UvRect | undefined = () => undefined;
  private basis: CameraBasis = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };
  private effectsThisFrame = 0;
  private colourSpace: 'linear' | 'srgb' = 'linear';

  constructor(palette: Palette, opts: { renderOrder?: number; capacity?: number } = {}) {
    this.palette = palette;
    this.sink = new QuadSink(opts.capacity ?? 512);
    this.texture = blankTexture();
    this.sprite = createSpriteMaterial(this.texture);
    this.geometry = this.makeGeometry();
    this.mesh = new Mesh(this.geometry, this.sprite.material);
    this.mesh.name = 'shamble-vfx';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder ?? 100;
  }

  /** Use a new atlas (after images were added or changed). */
  setAtlas(atlas: Atlas): void {
    const tex = atlas.image instanceof HTMLCanvasElement ? new CanvasTexture(atlas.image) : new Texture(atlas.image as TexImageSource);
    tex.flipY = false; // atlas v is measured from the top
    tex.generateMipmaps = false;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.colorSpace = ColorManagement.enabled ? SRGBColorSpace : NoColorSpace;
    tex.needsUpdate = true;
    this.sprite.setMap(tex);
    this.texture.dispose();
    this.texture = tex;
    this.lookup = atlasLookup(atlas);
  }

  /** Start a frame. */
  begin(camera: Camera): void {
    this.sink.clear();
    this.effectsThisFrame = 0;
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
    return evaluate(effect, {
      seed: p.seed,
      timeMs: p.timeMs,
      inputs: p.inputs,
      faction: p.faction,
      palette: this.palette,
      camera: this.basis,
      imageRect: this.lookup,
      colourSpace: this.colourSpace,
    }, this.sink);
  }

  /** Add every effect the player has running at nowMs. */
  drawPlaying(player: EffectPlayer, nowMs: number, lookup: EffectLookup): void {
    for (const p of player.alive(nowMs, lookup)) {
      const fx = lookup(p.effectId);
      if (fx) this.draw(fx, { seed: p.seed, timeMs: nowMs - p.startMs, inputs: p.inputs, faction: p.faction });
    }
  }

  /** Hand this frame's quads to the GPU. Call before renderer.render(). */
  end(): void {
    const s = this.sink;
    if (s.generation !== this.generation) {
      this.geometry.dispose();
      this.geometry = this.makeGeometry();
      this.mesh.geometry = this.geometry;
    } else {
      for (const name of ATTRS) {
        const a = this.geometry.getAttribute(name) as InstancedBufferAttribute;
        a.clearUpdateRanges();
        a.addUpdateRange(0, s.count * 4);
        a.needsUpdate = true;
      }
    }
    this.geometry.instanceCount = s.count;
    this.mesh.visible = s.count > 0;
  }

  get stats(): VfxStats {
    return { quads: this.sink.count, drawCalls: this.sink.count > 0 ? 1 : 0, effects: this.effectsThisFrame };
  }

  dispose(): void {
    this.geometry.dispose();
    this.sprite.material.dispose();
    this.texture.dispose();
  }

  private makeGeometry(): InstancedBufferGeometry {
    const s = this.sink;
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const arrays = [s.centre, s.axisX, s.axisY, s.uv, s.colour];
    ATTRS.forEach((name, i) => {
      const a = new InstancedBufferAttribute(arrays[i]!, 4);
      a.setUsage(DynamicDrawUsage);
      g.setAttribute(name, a);
    });
    g.instanceCount = s.count;
    this.generation = s.generation;
    return g;
  }
}

function blankTexture(): Texture {
  const t = new Texture();
  t.flipY = false;
  return t;
}
