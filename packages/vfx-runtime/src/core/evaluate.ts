/**
 * evaluate(): draw one moment of one effect.
 * In: the effect, a seed, a time and the inputs. Out: quads in the sink, in layer order (first layer at the bottom).
 * There is no hidden state, so any moment can be drawn directly, in any order, and the same in gives the same out.
 */
import { MAIN_ROLE, isInputAnchor, parseHex, resolveRole, srgbToLinear } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Palette, ProjectileLayer, SpriteLayer, Timing, Vec3 } from '@shamble/vfx-format';
import { applyControls } from './controls';
import type { ResolvedControls } from './controls';
import { clamp, cross, length, lerp, normalize, sub } from './math';
import type { QuadSink } from './sink';
import { holdSteps, inputPoint, resolveTimeline, stepMs } from './timeline';
import type { EffectInputs, LayerSpan, Timeline } from './timeline';

/** The camera's unit vectors in world space. forward points from the camera into the scene. */
export interface CameraBasis {
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

/** Where an image sits in the atlas, in 0..1 atlas coordinates, v measured from the top. */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface EvalContext {
  /** Everything random comes from this number. */
  seed: number;
  /** The moment to draw, in ms since the effect started. */
  timeMs: number;
  inputs: EffectInputs;
  /** The faction that made the effect: team and glow roles resolve to its colours. */
  faction: FactionId;
  palette: Palette;
  camera: CameraBasis;
  /** Finds an image in the atlas. Undefined when the atlas does not have it. */
  imageRect(name: string): UvRect | undefined;
  /**
   * How to write tint colours: 'linear' (three.js colour management on, the default) or 'srgb'
   * (colour management off, as the legacy game did). The three.js side sets this from the renderer's setup.
   */
  colourSpace?: 'linear' | 'srgb';
}

export interface EvalResult {
  /** Quads this call added to the sink. */
  quads: number;
  /** Images the effect names that the atlas does not have (those layers were skipped). */
  missingImages: string[];
  /** When the effect's last layer ends, for these inputs. */
  lengthMs: number;
}

/** The step a layer is on at a local time. Whole steps; everything else is worked out from this number. */
export function stepIndex(localMs: number, perSecond: number): number {
  return Math.floor((localMs * perSecond) / 1000 + 1e-9);
}

/** Local time as the layer shows it: the start of its current step, or the time itself when smooth. */
export function shownTime(localMs: number, t: Timing): number {
  if (t.mode === 'smooth') return localMs;
  return (stepIndex(localMs, t.perSecond) * 1000) / t.perSecond;
}

const DEG = Math.PI / 180;

export function evaluate(fx: EffectFile, ctx: EvalContext, sink: QuadSink, timeline?: Timeline): EvalResult {
  const c = applyControls(fx.controls);
  const tl = timeline ?? resolveTimeline(fx, ctx.inputs, c);
  const before = sink.count;
  const missing: string[] = [];
  const colours = new Map<string, [number, number, number]>();
  const cam = ctx.camera;
  // How far towards the camera a point must move to rise by one metre: cot(pitch).
  const fy = Math.abs(cam.forward[1]);
  const pullPerMetre = fy > 0.05 ? Math.sqrt(Math.max(0, 1 - fy * fy)) / fy : 20;

  for (let i = 0; i < fx.layers.length; i++) {
    const l = fx.layers[i]!;
    if (l.type !== 'sprite') continue;
    const span = tl.layers[i]!;
    const tau = ctx.timeMs - span.startMs;
    if (tau < 0 || tau >= span.endMs - span.startMs) continue;
    const rect = ctx.imageRect(l.image);
    if (!rect) {
      if (!missing.includes(l.image)) missing.push(l.image);
      continue;
    }
    drawSprite(fx, l, i, span, tau, rect, ctx, c, tl, sink, colours, pullPerMetre);
  }
  return { quads: sink.count - before, missingImages: missing, lengthMs: tl.lengthMs };
}

function roleColour(role: string, ctx: EvalContext, c: ResolvedControls, cache: Map<string, [number, number, number]>): [number, number, number] {
  const name = role === MAIN_ROLE ? c.mainRole : role;
  let col = cache.get(name);
  if (!col) {
    const hex = resolveRole(ctx.palette, name, ctx.faction);
    // An unknown role draws white (untinted). The checker names it.
    const [r, g, b] = hex ? parseHex(hex) : [255, 255, 255];
    col = ctx.colourSpace === 'srgb'
      ? [r / 255, g / 255, b / 255]
      : [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
    cache.set(name, col);
  }
  return col;
}

function drawSprite(
  fx: EffectFile, l: SpriteLayer, index: number, span: LayerSpan, tau: number, rect: UvRect,
  ctx: EvalContext, c: ResolvedControls, tl: Timeline, sink: QuadSink,
  colours: Map<string, [number, number, number]>, pullPerMetre: number,
): void {
  const cam = ctx.camera;
  const n = l.timing.mode === 'steps' ? stepIndex(tau, l.timing.perSecond) : -1;

  // Where the sprite is, and which way its path goes.
  let p: Vec3;
  let dir: Vec3 | undefined;
  let spinDeg = 0;
  let stretch = 1;
  let ride: { along: number; total: number } | undefined;
  if (isInputAnchor(l.at)) {
    p = inputPoint(ctx.inputs, tl.frame, l.at, c.size);
    dir = normalize(sub(ctx.inputs.target, ctx.inputs.origin)) ?? tl.frame.forward;
  } else {
    const ps = tl.byId.get(l.at.layer)!;
    const pl = fx.layers[ps.index] as ProjectileLayer;
    const f = ps.flight!;
    // The rider samples the projectile on the projectile's own steps, so they move together.
    const tp = Math.max(0, shownTime(ctx.timeMs - ps.startMs, pl.timing));
    const k = f.ms > 0 ? clamp(tp / f.ms, 0, 1) : 1;
    p = lerp(f.from, f.to, k);
    dir = f.dir;
    spinDeg = (pl.spinDegPerS * tp) / 1000;
    stretch = pl.stretch * c.intensity;
    const total = length(sub(f.to, f.from));
    ride = { along: k * total, total };
  }

  // Size. Sprites on a point the game gives grow with intensity (flashes, hits, landings).
  let w = l.sizeM[0] * c.size;
  let h = l.sizeM[1] * c.size;
  if (!ride) { w *= c.intensity; h *= c.intensity; }
  if (l.facing === 'path') w *= stretch;
  if (!(w > 1e-6 && h > 1e-6)) return;

  // Axes: facing the camera, or lying along the path (x along the motion, y across it, in the view).
  let ax: Vec3 = cam.right;
  let ay: Vec3 = cam.up;
  if (l.facing === 'path' && dir) {
    const side = normalize(cross(dir, cam.forward));
    if (side) { ax = dir; ay = side; }
  }
  if (spinDeg !== 0) {
    const cs = Math.cos(spinDeg * DEG), sn = Math.sin(spinDeg * DEG);
    const rx: Vec3 = [ax[0] * cs + ay[0] * sn, ax[1] * cs + ay[1] * sn, ax[2] * cs + ay[2] * sn];
    const ry: Vec3 = [ay[0] * cs - ax[0] * sn, ay[1] * cs - ax[1] * sn, ay[2] * cs - ax[2] * sn];
    ax = rx; ay = ry;
  }

  // Extent around the anchor. Pivot [0,0] is the image's top-left corner, [1,1] its bottom-right.
  const pu = l.pivot[0], pv = l.pivot[1];
  let a0 = -pu * w, a1 = (1 - pu) * w; // along x: left edge .. right edge
  const b0 = -(1 - pv) * h, b1 = pv * h; // along y: bottom edge .. top edge
  // A streak riding a projectile never reaches back past the start of the path, nor past its end.
  if (ride && l.facing === 'path' && dir && ax === dir) {
    a0 = Math.max(a0, -ride.along);
    a1 = Math.min(a1, ride.total - ride.along);
    if (a1 - a0 < 1e-4) return;
  }
  const cu0 = (a0 + pu * w) / w, cu1 = (a1 + pu * w) / w; // the part of the image still shown

  // Flipbook frame: one frame per step (held longer when the duration control is above 1).
  let fu0 = rect.u0, fu1 = rect.u1, fv0 = rect.v0, fv1 = rect.v1;
  if (l.flipbook) {
    const fb = l.flipbook;
    const hold = holdSteps(c.time);
    let frame: number;
    if (n >= 0) {
      const k = Math.floor(n / hold);
      frame = fb.loop ? k % fb.frames : Math.min(k, fb.frames - 1);
    } else if (fb.loop) {
      frame = Math.floor(tau / (stepMs(l.timing) * hold)) % fb.frames;
    } else {
      const dur = span.endMs - span.startMs;
      frame = Math.min(fb.frames - 1, Math.floor((tau / dur) * fb.frames));
    }
    const col = frame % fb.cols, row = Math.floor(frame / fb.cols);
    const du = (rect.u1 - rect.u0) / fb.cols, dv = (rect.v1 - rect.v0) / fb.rows;
    fu0 = rect.u0 + du * col; fu1 = fu0 + du;
    fv0 = rect.v0 + dv * row; fv1 = fv0 + dv;
  }
  const uL = fu0 + (fu1 - fu0) * cu0;
  const uR = fu0 + (fu1 - fu0) * cu1;

  const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
  const cx = p[0] + ax[0] * am + ay[0] * bm;
  const cy = p[1] + ax[1] * am + ay[1] * bm;
  const cz = p[2] + ax[2] * am + ay[2] * bm;
  const W = a1 - a0, H = b1 - b0;

  // Depth pull (assumption, marked): the part of a sprite that reaches below its anchor, seen along the camera's
  // up, is pulled towards the camera by as much, so the ground or the wall it sits on never cuts it.
  let reach = 0;
  for (let sx = -0.5; sx <= 0.5; sx += 1) {
    for (let sy = -0.5; sy <= 0.5; sy += 1) {
      const ox = cx - p[0] + ax[0] * W * sx + ay[0] * H * sy;
      const oy = cy - p[1] + ax[1] * W * sx + ay[1] * H * sy;
      const oz = cz - p[2] + ax[2] * W * sx + ay[2] * H * sy;
      reach = Math.max(reach, -(ox * cam.up[0] + oy * cam.up[1] + oz * cam.up[2]));
    }
  }
  const pull = reach * pullPerMetre + 0.02;

  const col = l.tint.mode === 'multiply' ? roleColour(l.tint.role, ctx, c, colours) : WHITE;
  sink.push(
    cx, cy, cz, pull,
    ax[0] * W, ax[1] * W, ax[2] * W,
    ay[0] * H, ay[1] * H, ay[2] * H,
    uL, fv0, uR, fv1,
    col[0], col[1], col[2], 1,
    index,
  );
}

const WHITE: [number, number, number] = [1, 1, 1];
