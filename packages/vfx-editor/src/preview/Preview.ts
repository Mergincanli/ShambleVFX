/**
 * The live preview: the game camera over the palette A street, the Conscript stand-in, the wall for cover,
 * a target you drag, and the effects drawn by the real runtime (vfx-runtime), exactly as the game will draw them.
 */
import {
  Color, Matrix4, Mesh, NoColorSpace, PlaneGeometry, Raycaster, RenderTarget, RGBAFormat, RingGeometry,
  Scene, UnsignedByteType, Vector2, Vector3, WebGPURenderer,
} from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { Plane } from 'three';
import type { FactionId, Palette } from '@shamble/vfx-format';
import { VfxRenderer } from '@shamble/vfx-runtime';
import type { Atlas } from '@shamble/vfx-runtime';
import { buildStandIn, buildWall } from './actors';
import type { Actor } from './actors';
import { CAM, cameraGround, makeGameCamera } from './camera';
import { flat, inShadeBand, shadowOffsetPerMetre } from './materials';
import data from './scene-data.json';

/** whole: the 1080p screen fitted with a frame guide; game: 100 %; close: 200 %; frame: exactly the game screen (for screenshots). */
export type ViewMode = 'whole' | 'game' | 'close' | 'frame';

export interface PreviewOptions {
  container: HTMLElement;
  palette: Palette;
  /** 'webgl' forces the WebGL 2 backend; 'auto' uses WebGPU when the browser has it. */
  backend: 'auto' | 'webgl';
  /** Render into a texture and copy it to a 2D canvas (for headless checks, where a WebGPU canvas cannot show). */
  offscreen?: boolean;
}

const SCREEN_W = CAM.screenWidth, SCREEN_H = CAM.screenHeight;

export class Preview {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly vfx: VfxRenderer;
  readonly target = cameraGround(3.0, -0.6);
  readonly shooter = cameraGround(-4.6, -1.3);
  faction: FactionId = 'soviets';
  view: ViewMode = 'whole';
  /** What the close-up centres on: the muzzle (origin) or the target. */
  closeOn: 'origin' | 'target' = 'target';
  /** The share of the real game size the 1080p frame is shown at (1 = game size). */
  scale = 1;
  onTargetMoved: (() => void) | null = null;

  private container: HTMLElement;
  private overlay: HTMLDivElement;
  private frameBox: HTMLDivElement;
  private scaleLabel: HTMLDivElement;
  private standIn!: Actor & { muzzle: Vector3 };
  private wall: Actor;
  private shadows: Mesh[] = [];
  private targetMarker: Mesh;
  private offscreenTarget: RenderTarget | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private size = new Vector2(1, 1);
  private ray = new Raycaster();
  private groundPlane = new Plane(new Vector3(0, 1, 0), 0);

  static async create(opts: PreviewOptions): Promise<Preview> {
    const renderer = new WebGPURenderer({ antialias: true, forceWebGL: opts.backend === 'webgl' });
    await renderer.init();
    return new Preview(opts, renderer);
  }

  private constructor(opts: PreviewOptions, renderer: WebGPURenderer) {
    this.renderer = renderer;
    this.container = opts.container;
    this.camera = makeGameCamera();
    this.vfx = new VfxRenderer(opts.palette, { renderOrder: 1000 });

    const g = data.ground;
    this.scene.background = new Color(g.sun);
    const ground = new Mesh(new PlaneGeometry(400, 400), flat(g.sun));
    ground.rotation.x = -Math.PI / 2;
    ground.renderOrder = -20;
    this.scene.add(ground);
    this.scene.add(this.shadeBand());

    this.wall = buildWall(inShadeBand(...this.wallSpot()));
    const ws = this.wallSpot();
    this.wall.group.position.set(ws[0], 0, ws[1]);
    this.scene.add(this.wall.group);
    this.buildStandIn();

    const ring = new RingGeometry(0.44, 0.52, 48);
    ring.rotateX(-Math.PI / 2);
    this.targetMarker = new Mesh(ring, flat(data.ink.hex, { writeDepth: false, offset: 2 }));
    this.targetMarker.renderOrder = -4;
    this.scene.add(this.targetMarker);
    this.scene.add(this.vfx.mesh);

    if (opts.offscreen) {
      this.offscreenTarget = new RenderTarget(16, 16, { type: UnsignedByteType, format: RGBAFormat, colorSpace: NoColorSpace, depthBuffer: true, samples: 4 });
      this.renderer.setOutputRenderTarget(this.offscreenTarget);
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.className = 'preview-canvas';
      this.container.appendChild(this.offscreenCanvas);
    } else {
      this.renderer.domElement.className = 'preview-canvas';
      this.container.appendChild(this.renderer.domElement);
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'preview-overlay';
    this.frameBox = document.createElement('div');
    this.frameBox.className = 'frame-guide';
    this.frameBox.innerHTML = '<span class="frame-label">1920 × 1080 game screen</span>';
    this.scaleLabel = document.createElement('div');
    this.scaleLabel.className = 'scale-label';
    this.overlay.append(this.frameBox, this.scaleLabel);
    this.container.appendChild(this.overlay);

    this.placeTarget();
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.resize();
  }

  get backendName(): 'WebGPU' | 'WebGL 2' {
    return (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  }

  /** The effect's origin: the stand-in's muzzle, in world metres. */
  get origin(): Vector3 {
    return this.standIn.muzzle.clone().applyMatrix4(this.standIn.group.matrixWorld);
  }

  setFaction(f: FactionId): void {
    if (f === this.faction) return;
    this.faction = f;
    this.buildStandIn();
  }

  setAtlas(atlas: Atlas): void {
    this.vfx.setAtlas(atlas);
  }

  setView(v: ViewMode): void {
    this.view = v;
    this.resize();
  }

  /** Draw one frame. `drawEffects` adds the effects to show (vfx.draw calls) between begin and end. */
  async render(drawEffects: (vfx: VfxRenderer) => void): Promise<void> {
    if (this.view === 'game' || this.view === 'close') this.updateView();
    this.orderActors();
    this.vfx.begin(this.camera);
    drawEffects(this.vfx);
    this.vfx.end();
    this.renderer.render(this.scene, this.camera);
    if (this.offscreenTarget && this.offscreenCanvas) await this.copyOffscreen();
  }

  /** Where a world point lands on the preview canvas, in CSS px. */
  toCanvas(p: Vector3): [number, number] {
    const v = p.clone().project(this.camera);
    return [((v.x + 1) / 2) * this.size.x, ((1 - v.y) / 2) * this.size.y];
  }

  // ---------------------------------------------------------------- scene parts

  private wallSpot(): [number, number] {
    const p = cameraGround(4.3, 0.4);
    return [p.x, p.z];
  }

  private shadeBand(): Mesh {
    const b = data.ground.shadeBand;
    // The band holds the camera-aligned points whose right - away lies between nearM and farM.
    const corners = [[b.nearM, -40], [b.farM, -40], [b.farM, 40], [b.nearM, 40]].map(([v, s]) => {
      const right = (v! + s!) / 2, away = (s! - v!) / 2;
      return cameraGround(right, away);
    });
    const geo = new PlaneGeometry(1, 1);
    const pos = geo.getAttribute('position');
    // PlaneGeometry corners: (-,+), (+,+), (-,-), (+,-) -> map onto the band's four corners.
    const order = [3, 2, 0, 1];
    order.forEach((ci, vi) => pos.setXYZ(vi, corners[ci]!.x, 0.001, corners[ci]!.z));
    geo.computeVertexNormals();
    const m = new Mesh(geo, flat(data.ground.shade, { offset: 1 }));
    m.material.side = 2; // both sides
    m.renderOrder = -19;
    return m;
  }

  private buildStandIn(): void {
    if (this.standIn) {
      this.scene.remove(this.standIn.group);
      this.standIn.dispose();
    }
    this.standIn = buildStandIn(this.faction, inShadeBand(this.shooter.x, this.shooter.z));
    this.standIn.group.position.copy(this.shooter);
    this.scene.add(this.standIn.group);
    this.faceTarget();
    this.rebuildShadows();
  }

  private rebuildShadows(): void {
    for (const s of this.shadows) {
      this.scene.remove(s);
      (s.material as { dispose(): void }).dispose();
    }
    this.shadows = [];
    const [sx, sz] = shadowOffsetPerMetre();
    const project = new Matrix4().set(1, sx, 0, 0, 0, 0, 0, 0.003, 0, sz, 1, 0, 0, 0, 0, 1);
    for (const a of [this.wall, this.standIn]) {
      const m = new Mesh(a.shadowGeometry, flat(data.ground.shade, { writeDepth: false, offset: 2 }));
      m.matrixAutoUpdate = false;
      a.group.updateMatrixWorld(true);
      m.matrix.multiplyMatrices(project, a.group.matrixWorld);
      m.renderOrder = -10;
      this.shadows.push(m);
      this.scene.add(m);
    }
  }

  private faceTarget(): void {
    const dx = this.target.x - this.shooter.x, dz = this.target.z - this.shooter.z;
    this.standIn.group.rotation.y = Math.atan2(dx, dz);
    this.standIn.group.updateMatrixWorld(true);
  }

  private placeTarget(): void {
    this.targetMarker.position.set(this.target.x, 0.004, this.target.z);
  }

  /** Each object is a group drawn far to near, so a nearer object's ink is never painted over. */
  private orderActors(): void {
    const cam = this.camera.position;
    const list = [this.wall, this.standIn].map((a) => ({ a, d: a.group.position.distanceToSquared(cam) }));
    list.sort((p, q) => q.d - p.d);
    list.forEach((o, i) => o.a.setOrder(i * 2));
  }

  // ---------------------------------------------------------------- view and size

  private resize(): void {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    this.size.set(w, h);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.offscreenTarget && this.offscreenCanvas) {
      this.offscreenTarget.setSize(Math.round(w * dpr), Math.round(h * dpr));
      this.offscreenCanvas.width = Math.round(w * dpr);
      this.offscreenCanvas.height = Math.round(h * dpr);
    }
    this.updateView();
  }

  private updateView(): void {
    const { x: w, y: h } = this.size;
    const k = this.view === 'whole' ? Math.min(w / SCREEN_W, h / SCREEN_H) * 0.94 : this.view === 'frame' ? Math.min(w / SCREEN_W, h / SCREEN_H) : this.view === 'game' ? 1 : 2;
    this.scale = k;
    const vw = w / k, vh = h / k;
    let cx = SCREEN_W / 2, cy = SCREEN_H / 2;
    if (this.view === 'game' || this.view === 'close') {
      // Centre on the action: the middle of shooter and target for game size, the target for the close-up.
      const focus = this.view === 'game' ? this.origin.clone().lerp(this.target, 0.5) : this.closeOn === 'origin' ? this.origin : this.target.clone();
      this.camera.clearViewOffset();
      const v = focus.project(this.camera);
      cx = ((v.x + 1) / 2) * SCREEN_W;
      cy = ((1 - v.y) / 2) * SCREEN_H;
    }
    this.camera.aspect = SCREEN_W / SCREEN_H;
    this.camera.setViewOffset(SCREEN_W, SCREEN_H, cx - vw / 2, cy - vh / 2, vw, vh);
    this.camera.updateProjectionMatrix();
    const left = (0 - (cx - vw / 2)) * k, top = (0 - (cy - vh / 2)) * k;
    Object.assign(this.frameBox.style, { left: `${left}px`, top: `${top}px`, width: `${SCREEN_W * k}px`, height: `${SCREEN_H * k}px` });
    this.scaleLabel.textContent = this.view === 'whole'
      ? `Whole game screen · preview at ${Math.round(k * 100)} % of game size`
      : this.view === 'game' ? 'Game size (100 %): a 1.8 m soldier is about 150 px tall' : 'Close-up: 200 % of game size';
  }

  private async copyOffscreen(): Promise<void> {
    const t = this.offscreenTarget!, c = this.offscreenCanvas!;
    const w = t.width, h = t.height;
    const px = (await this.renderer.readRenderTargetPixelsAsync(t, 0, 0, w, h)) as Uint8Array;
    const rows = new Uint8ClampedArray(w * h * 4);
    const bottomUp = (this.renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true;
    for (let y = 0; y < h; y++) {
      const src = (bottomUp ? h - 1 - y : y) * w * 4;
      rows.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    c.getContext('2d')!.putImageData(new ImageData(rows, w, h), 0, 0);
  }

  // ---------------------------------------------------------------- dragging the target (and the shooter, with Shift)

  private bindPointer(): void {
    const el = this.container;
    let dragging: 'target' | 'shooter' | null = null;
    const groundAt = (e: PointerEvent): Vector3 | null => {
      const r = el.getBoundingClientRect();
      const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.camera);
      const hit = new Vector3();
      return this.ray.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = groundAt(e);
      if (!p) return;
      dragging = e.shiftKey ? 'shooter' : 'target';
      el.setPointerCapture(e.pointerId);
      this.moveTo(dragging, p);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = groundAt(e);
      if (p) this.moveTo(dragging, p);
    });
    const stop = () => { dragging = null; };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  }

  private moveTo(which: 'target' | 'shooter', p: Vector3): void {
    if (which === 'target') {
      this.target.set(p.x, 0, p.z);
      this.placeTarget();
      this.faceTarget();
    } else {
      this.shooter.set(p.x, 0, p.z);
      this.buildStandIn();
    }
    this.rebuildShadows();
    this.onTargetMoved?.();
  }
}
