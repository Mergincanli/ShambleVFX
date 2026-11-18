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
import type { Relation } from '@shamble/vfx-runtime';
import { VfxRenderer } from '@shamble/vfx-runtime';
import type { Atlas } from '@shamble/vfx-runtime';
import { buildStandIn, buildTank, buildWall } from './actors';
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

type Ground = [number, number];
/** One preview set-up (scene-data.json, scenes). Ground places are the board's camera-aligned [right, away]. */
export interface SceneSpec {
  id: string;
  name: string;
  from: string;
  shooter: { kind: 'soldier' | 'tank'; at?: Ground; muzzle?: Ground; gun?: 'gun' | 'hammer'; faces?: Ground };
  /** A fixed start point instead of the shooter's muzzle (a fire pit starts where it burns). */
  origin?: { at: Ground; heightM: number };
  target?: { at?: Ground; heightM?: number; tank?: { at: Ground; turnDeg: number } };
  you?: { at: Ground; dir: Ground; distanceM: number };
  props: { kind: 'wall' | 'soldier'; at: Ground; side?: 'own' | 'foe'; faces?: Ground; lengthM?: number; thicknessM?: number }[];
}
export const SCENES = data.scenes.list as SceneSpec[];

/** Who each faction fights, as on the drawing board. */
const FOE: Record<FactionId, FactionId> = { soviets: 'allies', allies: 'empire', empire: 'soviets' };

interface Placed { actor: Actor; at: Vector3 }

function ground([r, a]: Ground): Vector3 {
  return cameraGround(r, a);
}

/** A world direction on the ground from a camera-aligned one. */
function groundDir([r, a]: Ground): Vector3 {
  return cameraGround(r, a).sub(cameraGround(0, 0)).normalize();
}

export class Preview {
  readonly renderer: WebGPURenderer;
  readonly scene3d = new Scene();
  readonly camera: PerspectiveCamera;
  readonly vfx: VfxRenderer;
  /** Where the effect goes (world metres; above the ground for a wall's face or a tank's top). */
  readonly target = cameraGround(3.0, -0.6);
  /** Where the one who fires stands. */
  readonly shooter = cameraGround(-4.6, -1.3);
  faction: FactionId = 'soviets';
  /** Who made the effect, seen from you: an enemy, your team, or you. */
  relation: Relation = 'enemy';
  scene: SceneSpec = SCENES[0]!;
  /** You, the player looking (when the scene has you), and the way the distance slider moves the target from you. */
  you: Vector3 | null = null;
  private youDir = new Vector3(1, 0, 0);
  private distanceM = 4;
  view: ViewMode = 'whole';
  /** What the close-up centres on: the muzzle (origin) or the target. */
  closeOn: 'origin' | 'target' = 'target';
  /** How much the close-up enlarges the game screen (2 = 200 %). */
  closeZoom = 2;
  /** Told the scale whenever the view or the preview's size changes it (the editor shows it next to the View buttons). */
  onScale: ((scale: number) => void) | null = null;
  onTargetMoved: (() => void) | null = null;

  private container: HTMLElement;
  private overlay: HTMLDivElement;
  private frameBox: HTMLDivElement;
  private scaleNow = 1;
  private shooterActor!: Actor & { muzzle: Vector3 };
  private targetTank: (Actor & { top: Vector3 }) | null = null;
  private targetTankAt = new Vector3();
  private targetTankTurn = 0;
  private youActor: Actor | null = null;
  private props: Placed[] = [];
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
    this.scene3d.background = new Color(g.sun);
    const ground = new Mesh(new PlaneGeometry(400, 400), flat(g.sun));
    ground.rotation.x = -Math.PI / 2;
    ground.renderOrder = -20;
    this.scene3d.add(ground);
    this.scene3d.add(this.shadeBand());

    const ring = new RingGeometry(0.44, 0.52, 48);
    ring.rotateX(-Math.PI / 2);
    this.targetMarker = new Mesh(ring, flat(data.ink.hex, { writeDepth: false, offset: 2 }));
    this.targetMarker.renderOrder = -4;
    this.scene3d.add(this.targetMarker);
    this.scene3d.add(this.vfx.object);

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
    this.frameBox.innerHTML = '<span class="frame-label">1920 × 1080</span>';
    this.overlay.append(this.frameBox);
    this.container.appendChild(this.overlay);

    this.setScene(SCENES[0]!.id);
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.resize();
  }

  /** The share of the real game size the 1080p frame is shown at (1 = game size). */
  get scale(): number {
    return this.scaleNow;
  }

  get backendName(): 'WebGPU' | 'WebGL 2' {
    return (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  }

  /** The effect's origin: the shooter's muzzle (or the scene's fixed start point), in world metres. */
  get origin(): Vector3 {
    const o = this.scene.origin;
    if (o) return ground(o.at).setY(o.heightM);
    return this.shooterActor.muzzle.clone().applyMatrix4(this.shooterActor.group.matrixWorld);
  }

  /** How far you are from the event, metres: measured in the scene when it has you, else the slider's number. */
  get viewerDistanceM(): number {
    if (!this.you) return this.distanceM;
    return Math.hypot(this.target.x - this.you.x, this.target.z - this.you.z);
  }

  /** Whether the distance comes from the scene (you and the target), so the slider moves the target. */
  get distanceMovesTarget(): boolean {
    return this.you !== null;
  }

  setFaction(f: FactionId): void {
    if (f === this.faction) return;
    this.faction = f;
    this.buildActors();
  }

  setRelation(r: Relation): void {
    if (r === this.relation) return;
    this.relation = r;
    this.buildActors();
  }

  /** Set the distance from you. In a scene with you, the target moves along the scene's line from you. */
  setDistance(m: number): void {
    this.distanceM = Math.max(0, m);
    if (this.you) {
      const p = this.you.clone().addScaledVector(this.youDir, this.distanceM);
      this.target.set(p.x, this.target.y, p.z);
      this.afterMove();
    }
  }

  /** Change the set-up: who fires, where to, what stands around. */
  setScene(id: string): boolean {
    const sc = SCENES.find((x) => x.id === id);
    if (!sc) return false;
    this.scene = sc;
    this.shooterMoved = false;
    if (sc.shooter.at) this.shooter.copy(ground(sc.shooter.at));
    else if (sc.shooter.muzzle) this.shooter.copy(ground(sc.shooter.muzzle));
    if (sc.you) {
      this.you = ground(sc.you.at);
      this.youDir = groundDir(sc.you.dir);
      this.distanceM = sc.you.distanceM;
      this.target.copy(this.you).addScaledVector(this.youDir, this.distanceM).setY(0);
    } else {
      this.you = null;
      if (sc.target?.tank) {
        this.targetTankAt = ground(sc.target.tank.at);
        this.target.copy(this.targetTankAt);
      } else if (sc.target?.at) {
        this.target.copy(ground(sc.target.at)).setY(sc.target.heightM ?? 0);
      }
    }
    this.buildActors();
    this.updateView();
    return true;
  }

  setAtlas(atlas: Atlas): void {
    this.vfx.setAtlas(atlas);
  }

  setView(v: ViewMode): void {
    this.view = v;
    // The game screen shows what a player sees: no editor marks.
    this.targetMarker.visible = v !== 'frame';
    this.resize();
  }

  /** What the close-up centres on: the muzzle or the target. */
  setCloseOn(v: 'origin' | 'target'): void {
    this.closeOn = v;
    this.updateView();
  }

  /** How much the close-up enlarges (1 = game size, centred on the muzzle or the target). */
  setCloseZoom(z: number): void {
    this.closeZoom = Math.max(0.5, Math.min(4, z));
    this.updateView();
  }

  /** Draw one frame. `drawEffects` adds the effects to show (vfx.draw calls) between begin and end. */
  async render(drawEffects: (vfx: VfxRenderer) => void): Promise<void> {
    this.orderActors();
    this.vfx.begin(this.camera);
    drawEffects(this.vfx);
    this.vfx.end();
    this.renderer.render(this.scene3d, this.camera);
    if (this.offscreenTarget && this.offscreenCanvas) await this.copyOffscreen();
  }

  /** Where a world point lands on the preview canvas, in CSS px. */
  toCanvas(p: Vector3): [number, number] {
    const v = p.clone().project(this.camera);
    return [((v.x + 1) / 2) * this.size.x, ((1 - v.y) / 2) * this.size.y];
  }

  // ---------------------------------------------------------------- scene parts

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

  /** Every actor of the scene, all at once (after a change of scene, faction or "made by"). */
  private buildActors(): void {
    for (const a of this.allActors()) {
      this.scene3().remove(a.group);
      a.dispose();
    }
    const sc = this.scene, own = this.faction, foe = FOE[own];
    const shade = (v: Vector3) => inShadeBand(v.x, v.z);
    // The one who fires.
    if (sc.shooter.kind === 'tank') {
      this.shooterActor = buildTank(own, sc.shooter.gun ?? 'gun', shade(this.shooter));
    } else {
      this.shooterActor = buildStandIn(own, shade(this.shooter));
    }
    this.add(this.shooterActor, this.shooter);
    // A tank to aim at (the beam).
    this.targetTank = null;
    if (sc.target?.tank) {
      this.targetTankTurn = sc.target.tank.turnDeg;
      this.targetTank = buildTank(foe, 'gun', shade(this.targetTankAt));
      this.add(this.targetTank, this.targetTankAt);
    }
    // You: on the other side when an enemy made the effect, on its side when your team or you did.
    this.youActor = null;
    if (this.you) {
      this.youActor = buildStandIn(this.relation === 'enemy' ? foe : own, shade(this.you));
      this.add(this.youActor, this.you);
    }
    // Everything else.
    this.props = sc.props.map((p) => {
      const at = ground(p.at);
      const actor = p.kind === 'wall'
        ? buildWall(shade(at), { ...(p.lengthM ? { lengthM: p.lengthM } : {}), ...(p.thicknessM ? { thicknessM: p.thicknessM } : {}) })
        : buildStandIn(p.side === 'own' ? own : foe, shade(at));
      this.add(actor, at);
      if (p.faces) turnTo(actor, groundDir(p.faces));
      return { actor, at };
    });
    this.afterMove();
  }

  private add(a: Actor, at: Vector3): void {
    a.group.position.set(at.x, 0, at.z);
    this.scene3().add(a.group);
  }

  private scene3(): Scene {
    return this.scene3d;
  }

  private allActors(): Actor[] {
    const list: (Actor | null | undefined)[] = [this.shooterActor, this.targetTank, this.youActor, ...this.props.map((p) => p.actor)];
    return list.filter((a): a is Actor => !!a);
  }

  /** After anything moved: who faces where, the target ring, the shadows. */
  private afterMove(): void {
    const sc = this.scene;
    // A soldier placed by its muzzle: stand it so the tip of its rifle is at the scene's point.
    if (sc.shooter.kind === 'soldier' && sc.shooter.muzzle && !this.shooterMoved) {
      const want = ground(sc.shooter.muzzle);
      for (let i = 0; i < 4; i++) {
        this.faceShooter();
        const m = this.shooterActor.muzzle.clone().applyMatrix4(this.shooterActor.group.matrixWorld);
        this.shooter.x += want.x - m.x;
        this.shooter.z += want.z - m.z;
        this.shooterActor.group.position.set(this.shooter.x, 0, this.shooter.z);
      }
    }
    this.faceShooter();
    if (this.targetTank) {
      this.targetTank.group.position.set(this.targetTankAt.x, 0, this.targetTankAt.z);
      turnTo(this.targetTank, this.targetTankAt.clone().sub(this.shooter).setY(0).normalize(), this.targetTankTurn);
      this.targetTank.group.updateMatrixWorld(true);
      const top = this.targetTank.top.clone().applyMatrix4(this.targetTank.group.matrixWorld);
      this.target.copy(top);
    }
    if (this.youActor && this.you) turnTo(this.youActor, this.youDir);
    this.targetMarker.position.set(this.target.x, 0.004, this.target.z);
    this.rebuildShadows();
  }

  private shooterMoved = false;

  private faceShooter(): void {
    const sc = this.scene;
    const dir = sc.shooter.faces ? groundDir(sc.shooter.faces) : this.target.clone().sub(this.shooter).setY(0).normalize();
    this.shooterActor.group.position.set(this.shooter.x, 0, this.shooter.z);
    turnTo(this.shooterActor, dir);
  }

  private rebuildShadows(): void {
    for (const s of this.shadows) {
      this.scene3().remove(s);
      (s.material as { dispose(): void }).dispose();
    }
    this.shadows = [];
    const [sx, sz] = shadowOffsetPerMetre();
    const project = new Matrix4().set(1, sx, 0, 0, 0, 0, 0, 0.003, 0, sz, 1, 0, 0, 0, 0, 1);
    for (const a of this.allActors()) {
      const m = new Mesh(a.shadowGeometry, flat(data.ground.shade, { writeDepth: false, offset: 2 }));
      m.matrixAutoUpdate = false;
      a.group.updateMatrixWorld(true);
      m.matrix.multiplyMatrices(project, a.group.matrixWorld);
      m.renderOrder = -10;
      this.shadows.push(m);
      this.scene3().add(m);
    }
  }

  /** Each object is a group drawn far to near, so a nearer object's ink is never painted over. */
  private orderActors(): void {
    const cam = this.camera.position;
    const list = this.allActors().map((a) => ({ a, d: a.group.position.distanceToSquared(cam) }));
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
    const k = this.view === 'whole' ? Math.min(w / SCREEN_W, h / SCREEN_H) * 0.94 : this.view === 'frame' ? Math.min(w / SCREEN_W, h / SCREEN_H) : this.view === 'game' ? 1 : this.closeZoom;
    if (k !== this.scaleNow) { this.scaleNow = k; this.onScale?.(k); }
    const vw = w / k, vh = h / k;
    let cx = SCREEN_W / 2, cy = SCREEN_H / 2;
    if (this.view === 'game' || this.view === 'close') {
      // Centre on the action: the middle of shooter and target for game size, the muzzle or the target for the
      // close-up. Worked out when the view changes and after a drag, never during one (the ground must stay
      // under the cursor while you drag).
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
    const stop = () => {
      if (dragging && (this.view === 'game' || this.view === 'close')) this.updateView();
      dragging = null;
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  }

  private moveTo(which: 'target' | 'shooter', p: Vector3): void {
    if (which === 'target') {
      if (this.targetTank) this.targetTankAt.set(p.x, 0, p.z);
      // A target above the ground (a wall's face) keeps its height as it moves.
      else this.target.set(p.x, this.target.y, p.z);
      if (this.you) this.distanceM = this.viewerDistanceM;
    } else {
      this.shooter.set(p.x, 0, p.z);
      this.shooterMoved = true;
    }
    this.afterMove();
    this.onTargetMoved?.();
  }
}

/** Turn an actor (built facing +z) to face a ground direction, plus an extra turn in degrees. */
function turnTo(a: Actor, dir: Vector3, extraDeg = 0): void {
  a.group.rotation.y = Math.atan2(dir.x, dir.z) + (extraDeg * Math.PI) / 180;
  a.group.updateMatrixWorld(true);
}
