/**
 * The Look: a live picture of the selected layer, at the top of its panel. The layer alone, drawn by the real runtime
 * (VfxRenderer, the code the game ships) with a second, small renderer on the preview's ground colour; framed on the layer
 * (its box on the game screen over its time, with a margin); playing its own time in a loop at the preview's seed,
 * faction, made-by and distance. A layer that rides a projectile is drawn riding it; a projectile shows its riders flying.
 *
 * The renderer (WebGL 2) exists only while a layer's panel shows the Look: it is made on the next task after the panel
 * opens, so many selections in a row make none, and disposed with its WebGL context when the panel closes or the Look is
 * folded. It draws in the app's frames (there is one frame loop), and only while the page is visible.
 */
import { Color, Matrix4, Scene, WebGPURenderer } from 'three/webgpu';
import type { PerspectiveCamera } from 'three';
import { TIER_NAMES } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Layer, Palette } from '@shamble/vfx-format';
import { BLEND_GROUPS, VfxRenderer } from '@shamble/vfx-runtime';
import type { Atlas, DrawParams, EffectInputs, Relation, Timeline } from '@shamble/vfx-runtime';
import { ridingOn } from '../doc/layer-info';
import { CAM, makeGameCamera } from '../preview/camera';
import data from '../preview/scene-data.json';
import { h } from './dom';
import { keptLayers } from './fade';

const SCREEN_W = CAM.screenWidth, SCREEN_H = CAM.screenHeight;
/** Room round the layer's box, on each side, as a share of the box. */
export const LOOK_MARGIN = 0.1;
/** The smallest part of the game screen the Look shows, in px of the 1920 x 1080 screen: a speck is not blown up past it. */
export const LOOK_MIN_PX = 32;
/**
 * How often the layer is drawn to find its box: 120 times a second of its time (6 to 48 times). A fast streak crosses the
 * screen in a few frames, so a short time is drawn often; a long one is drawn 48 times, spread over it.
 */
const SAMPLES_PER_SECOND = 120;
/** While a value is dragged the effect changes every frame: its box is worked out again at most this often (ms). */
const REFIT_MS = 200;

/** A stretch of effect time, ms. */
export interface Span { start: number; end: number }
/** A box on the 1920 x 1080 game screen, px, y down. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/**
 * The effect as the Look draws it. Every layer stays, so the times, the landings and each layer's own random numbers are
 * the same as in the preview, but only the layer draws (for a projectile, which draws nothing, the layers riding it). A
 * layer draws the same in every tier it shows in, so the ones drawn are put in every tier: the Look shows the layer even
 * when the preview's tier leaves it out.
 */
export function aloneEffect(fx: EffectFile, layer: Layer): EffectFile {
  const shown = keptLayers(fx, layer.id) ?? new Set<number>();
  return { ...fx, layers: fx.layers.map((l, i) => (l.type === 'projectile' ? l : { ...l, tiers: shown.has(i) ? [...TIER_NAMES] : [] })) };
}

/** The time the Look loops over: the layer's own; for a projectile, its flight and its riders' times together. */
export function loopSpan(fx: EffectFile, tl: Timeline, layer: Layer): Span | undefined {
  const indices = keptLayers(fx, layer.id) ?? new Set<number>();
  let start = Infinity, end = -Infinity;
  for (const i of indices) {
    const s = tl.layers[i];
    if (s && s.endMs > s.startMs) { start = Math.min(start, s.startMs); end = Math.max(end, s.endMs); }
  }
  return end > start ? { start, end } : undefined;
}

/** The moment `clockMs` into the loop: the span, then a rest (as Loop rests between plays). Undefined during the rest. */
export function loopMoment(span: Span, clockMs: number, restMs: number): number | undefined {
  const len = span.end - span.start, round = len + restMs;
  const k = ((clockMs % round) + round) % round;
  return k < len ? span.start + k : undefined;
}

/** The moment held while the app is paused for a picture (showAt): the moment shown when it is in the span, else the middle. */
export function stillMoment(span: Span, ms: number): number {
  return ms >= span.start && ms < span.end ? ms : span.start + (span.end - span.start) / 2;
}

/**
 * The part of the game screen the Look shows: the layer's box (at least LOOK_MIN_PX across) with the margin on each side,
 * made wider or taller to the picture's shape, around the box's middle.
 */
export function frameBox(b: Box, aspect: number, margin = LOOK_MARGIN, minPx = LOOK_MIN_PX): { x: number; y: number; w: number; h: number } {
  let w = Math.max(b.x1 - b.x0, minPx) * (1 + 2 * margin);
  let hh = Math.max(b.y1 - b.y0, minPx) * (1 + 2 * margin);
  if (w / hh < aspect) w = hh * aspect;
  else hh = w / aspect;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
}

/**
 * Where the layer draws on the game screen over its time: drawn SAMPLES_PER_SECOND times a second of the span (6 to 48
 * times) with the Look's own VfxRenderer, each vertex seen through the game camera. Undefined when it draws nothing.
 * The first and the last moment are among those drawn: a fast streak moves far between two moments, and where it leaves
 * and where it lands must be in the box too. A layer draws while its time is under its end, so the last moment is just
 * before the end.
 */
export function measureBox(vfx: VfxRenderer, cam: PerspectiveCamera, fx: EffectFile, span: Span, p: Omit<DrawParams, 'timeMs'>): Box | undefined {
  const len = span.end - span.start;
  const n = Math.max(6, Math.min(48, Math.ceil((len * SAMPLES_PER_SECOND) / 1000)));
  const last = len - Math.min(0.5, len / 100);
  cam.updateMatrixWorld();
  const e = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < n; k++) {
    vfx.begin(cam);
    vfx.draw(fx, { ...p, timeMs: span.start + (k / (n - 1)) * last });
    for (const g of BLEND_GROUPS) {
      const b = vfx.sink.groups[g], pos = b.pos;
      for (let v = 0; v < b.vcount; v++) {
        const x = pos[v * 4]!, y = pos[v * 4 + 1]!, z = pos[v * 4 + 2]!;
        const w = e[3]! * x + e[7]! * y + e[11]! * z + e[15]!;
        if (!(w > 1e-6)) continue;
        // The depth pull moves a vertex along its own view ray, so where it lands on screen is where it is.
        const sx = (((e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) / w + 1) / 2) * SCREEN_W;
        const sy = ((1 - (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) / w) / 2) * SCREEN_H;
        if (sx < x0) x0 = sx;
        if (sx > x1) x1 = sx;
        if (sy < y0) y0 = sy;
        if (sy > y1) y1 = sy;
      }
    }
  }
  return x1 >= x0 && y1 >= y0 ? { x0, y0, x1, y1 } : undefined;
}

/** What the app hands the Look every frame while a layer is selected. */
export interface LookFrame {
  effect: EffectFile;
  layer: Layer;
  timeline: Timeline;
  seed: number;
  faction: FactionId;
  relation: Relation;
  viewerDistanceM: number;
  inputs: EffectInputs;
  palette: Palette;
  atlas: Atlas | null;
  /** The effect has problems that stop the preview (schema, format, version): the Look waits too. */
  waits: boolean;
  /** The app is paused for a picture (showAt) at this moment: the Look holds a moment from it, so pictures repeat. */
  still: number | null;
  /** The rest between plays, as the preview's Loop rests (ms). */
  restMs: number;
}

/** For the browser check: what the Look is doing. */
export interface LookState {
  shown: boolean;
  open: boolean;
  renderer: boolean;
  ready: boolean;
  /** Pictures drawn since the editor started (every renderer the Look had). */
  frames: number;
  /** The moment of effect time last drawn, or null (nothing drawn, or the rest between plays). */
  moment: number | null;
  /** How large the last picture showed the game screen (1: game size), or null. */
  zoom: number | null;
  text: string;
}

export class LookView {
  /** The picture (its canvas comes and goes with the renderer) and a line under it. */
  readonly el: HTMLElement;
  private readonly box: HTMLElement;
  private readonly note: HTMLElement;
  private shown = false;
  private open = false;
  private renderer: WebGPURenderer | null = null;
  private vfx: VfxRenderer | null = null;
  private ready = false;
  private failed = false;
  /** Bumped by every stop, so a renderer that finishes starting after it is not used. */
  private generation = 0;
  private startTimer = 0;
  private waiters: (() => void)[] = [];
  private readonly scene = new Scene();
  /** The game camera with a view offset onto the layer's part of the screen. */
  private readonly camera = makeGameCamera();
  /** The game camera on the whole 1920 x 1080 screen, for finding the layer's box. */
  private readonly fitCam = makeGameCamera();
  private clock = 0;
  private layerKey = '';
  private atlasShown: Atlas | null = null;
  private alone: { fx: EffectFile; layer: Layer; out: EffectFile } | null = null;
  private fit: { key: unknown[]; box: Box | undefined; at: number } | null = null;
  private sized = '';
  private moment: number | null = null;
  private zoom: number | null = null;
  private frames = 0;
  private lastCanvas: HTMLCanvasElement | null = null;
  private disposing: Promise<void> = Promise.resolve();

  constructor() {
    this.box = h('div', { class: 'look-box', attrs: { role: 'img', 'aria-label': 'The selected layer alone, in a loop' } });
    this.note = h('p', { class: 'readout look-note' });
    this.el = h('div', { class: 'look' }, this.box, this.note);
    this.scene.background = new Color(data.ground.sun);
  }

  /** The layer's panel shows the Look, or no longer does (no layer selected). */
  setShown(on: boolean): void {
    this.shown = on;
    this.update();
  }

  /** The Look's section is open, or folded. */
  setOpen(on: boolean): void {
    this.open = on;
    this.update();
  }

  /** Resolves once the renderer can draw, or at once when the Look has nothing to wait for (not shown, folded, failed). */
  whenReady(): Promise<void> {
    if (!this.wanted() || this.ready || this.failed || (!this.renderer && !this.startTimer)) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** One frame of the app. dtMs: effect time since the last frame (real time at the preview's speed). */
  frame(dtMs: number, f: LookFrame | null): void {
    if (!f) return;
    const key = `${f.effect.id}|${f.layer.id}`;
    if (key !== this.layerKey) {
      // Another layer starts its loop from its beginning, framed anew.
      this.layerKey = key;
      this.clock = 0;
      this.fit = null;
      this.box.setAttribute('aria-label', `${f.layer.name} alone, in a loop`);
    } else if (f.still === null) this.clock += dtMs;
    if (this.ready && this.wanted() && document.visibilityState !== 'hidden') this.draw(f);
  }

  state(): LookState {
    return { shown: this.shown, open: this.open, renderer: !!this.renderer, ready: this.ready, frames: this.frames, moment: this.moment, zoom: this.zoom, text: this.note.textContent ?? '' };
  }

  /** For the browser check: the last renderer is gone, its canvas out of the page and its WebGL context lost. */
  async disposedForChecks(): Promise<boolean> {
    await this.disposing;
    const c = this.lastCanvas;
    const gl = c?.getContext('webgl2') ?? null;
    return !this.renderer && !!c && !c.isConnected && !!gl && gl.isContextLost();
  }

  private wanted(): boolean {
    return this.shown && this.open;
  }

  private update(): void {
    if (!this.wanted()) { this.stop(); return; }
    // On the next task: selections made one after another in one go (a script, the settings inventory) make no renderer.
    if (!this.renderer && !this.startTimer && !this.failed) this.startTimer = window.setTimeout(() => this.start(), 0);
  }

  private start(): void {
    this.startTimer = 0;
    if (!this.wanted() || this.renderer) return;
    // A panel that is not on screen (?frame=1 shows only the game screen) gets no renderer.
    if (!this.box.isConnected || !this.box.getClientRects().length) { this.flush(); return; }
    const gen = ++this.generation;
    let renderer: WebGPURenderer;
    try {
      // WebGL 2 is enough for a small picture, and lighter than a second WebGPU device. Its canvas is its own, so
      // disposing it loses its context.
      renderer = new WebGPURenderer({ antialias: true, forceWebGL: true });
    } catch {
      this.fail();
      return;
    }
    renderer.domElement.className = 'look-canvas';
    this.box.append(renderer.domElement);
    this.renderer = renderer;
    renderer.init().then(() => {
      if (gen !== this.generation) return;
      this.ready = true;
      this.flush();
    }, () => { if (gen === this.generation) this.fail(); });
  }

  private fail(): void {
    this.failed = true;
    this.stop();
    this.note.textContent = 'The picture cannot be drawn in this browser: it needs WebGL 2.';
  }

  /** Dispose the renderer (and its WebGL context) and the runtime's meshes, materials and atlas texture. */
  private stop(): void {
    if (this.startTimer) { clearTimeout(this.startTimer); this.startTimer = 0; }
    this.generation++;
    const r = this.renderer, v = this.vfx;
    this.renderer = null;
    this.vfx = null;
    this.ready = false;
    this.atlasShown = null;
    this.fit = null;
    this.sized = '';
    this.moment = null;
    if (v) { this.scene.remove(v.object); v.dispose(); }
    if (r) {
      this.lastCanvas = r.domElement;
      r.domElement.remove();
      this.disposing = r.dispose().catch(() => undefined);
    }
    this.flush();
  }

  private flush(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const resolve of w) resolve();
  }

  private draw(f: LookFrame): void {
    const renderer = this.renderer!;
    const w = this.box.clientWidth, hh = this.box.clientHeight;
    if (!w || !hh) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = `${w}x${hh}@${dpr}`;
    if (size !== this.sized) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, hh, false);
      this.sized = size;
    }
    if (!this.vfx) {
      this.vfx = new VfxRenderer(f.palette, { renderOrder: 1000 });
      this.scene.add(this.vfx.object);
    }
    const vfx = this.vfx;
    vfx.palette = f.palette;
    if (f.atlas && f.atlas !== this.atlasShown) { vfx.setAtlas(f.atlas); this.atlasShown = f.atlas; }
    const p: Omit<DrawParams, 'timeMs'> = { seed: f.seed, faction: f.faction, relation: f.relation, viewerDistanceM: f.viewerDistanceM, inputs: f.inputs };
    const span = loopSpan(f.effect, f.timeline, f.layer);
    let alone: EffectFile | undefined, at: number | undefined, text: string;
    this.zoom = null;
    if (f.waits) text = 'The picture waits until the effect\'s problems are fixed (see Checks).';
    else if (!span) text = 'Nothing to show: it has no time of its own.';
    else {
      alone = this.aloneOf(f.effect, f.layer);
      const box = this.boxFor(vfx, alone, span, p, f.still !== null);
      if (!box) {
        text = f.layer.type === 'projectile' && keptLayers(f.effect, f.layer.id)!.size < 2
          ? 'Nothing to show: no layer rides it yet.' : 'Nothing to show: it draws nothing over its time.';
        alone = undefined;
      } else {
        const fb = frameBox(box, w / hh);
        this.camera.setViewOffset(SCREEN_W, SCREEN_H, fb.x, fb.y, fb.w, fb.h);
        this.camera.updateProjectionMatrix();
        this.zoom = hh / fb.h;
        at = f.still !== null ? stillMoment(span, f.still) : loopMoment(span, this.clock, f.restMs);
        const where = `${Math.round(this.zoom * 100)} % of game size, ${span.start.toFixed(0)}–${span.end.toFixed(0)} ms in a loop.`;
        const rides = ridingOn(f.effect, f.layer);
        text = f.layer.type === 'projectile' ? `Its riders at ${where}` : rides ? `Rides ${rides.name}, at ${where}` : `At ${where}`;
      }
    }
    vfx.begin(this.camera);
    if (alone && at !== undefined) vfx.draw(alone, { ...p, timeMs: at });
    vfx.end();
    renderer.render(this.scene, this.camera);
    this.moment = alone && at !== undefined ? at : null;
    this.frames++;
    if (this.note.textContent !== text) this.note.textContent = text;
  }

  private aloneOf(fx: EffectFile, layer: Layer): EffectFile {
    if (this.alone?.fx !== fx || this.alone.layer !== layer) this.alone = { fx, layer, out: aloneEffect(fx, layer) };
    return this.alone.out;
  }

  /** The layer's box, worked out again when anything it depends on changes (at most every REFIT_MS, except for a picture). */
  private boxFor(vfx: VfxRenderer, alone: EffectFile, span: Span, p: Omit<DrawParams, 'timeMs'>, now: boolean): Box | undefined {
    const key: unknown[] = [alone, span.start, span.end, p.seed, p.faction, p.relation, p.viewerDistanceM, ...p.inputs.origin, ...p.inputs.target, vfx.palette, this.atlasShown];
    const old = this.fit;
    if (old && old.key.length === key.length && old.key.every((v, i) => v === key[i])) return old.box;
    const t = performance.now();
    if (old && !now && t - old.at < REFIT_MS) return old.box;
    const box = measureBox(vfx, this.fitCam, alone, span, p);
    this.fit = { key, box, at: t };
    return box;
  }
}
