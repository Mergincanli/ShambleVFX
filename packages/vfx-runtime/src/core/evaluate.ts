/**
 * evaluate(): draw one moment of one effect.
 * In: the effect, a seed, a time and the inputs. Out: triangles in the sink, in layer order (first layer at the bottom).
 * There is no hidden state, so any moment can be drawn directly, in any order, and the same in gives the same out.
 */
import { MAIN_ROLE, isInputAnchor, parseHex, resolveRole, srgbToLinear } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Palette, ProjectileLayer, SpriteLayer, TierName, Timing, Vec3, VisibleLayer } from '@shamble/vfx-format';
import { applyControls } from './controls';
import type { ResolvedControls } from './controls';
import { curveAt } from './draw';
import type { DrawCtx, GradientRamp, Relation } from './draw';
import type { RGBA } from './painter';
import { clamp, cross, length, normalize, scale, sub } from './math';
import { Painter } from './painter';
import type { Frame3 } from './painter';
import { drawBurst } from './particles';
import { layerSeed, random01 } from './random';
import { drawShape } from './shapes';
import type { BlendGroup, DrawSink, TriBuffer } from './sink';
import { flightDirection, flightPoint, holdSteps, inputPoint, resolveTimeline, stepMs } from './timeline';
import type { EffectInputs, Flight, LayerSpan, Timeline } from './timeline';
import { drawWord } from './words';

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
  /** Who made it, seen from the player looking: an enemy, your team, or you. Default enemy. */
  relation?: Relation;
  /** Distance from the player looking to the event, metres (comic words shrink with it). Default 0. */
  viewerDistanceM?: number;
  palette: Palette;
  camera: CameraBasis;
  /** Finds an image in the atlas. Undefined when the atlas does not have it. */
  imageRect(name: string): UvRect | undefined;
  /**
   * How to write colours: 'linear' (three.js colour management on, the default) or 'srgb'
   * (colour management off, as the legacy game did). The three.js side sets this from the renderer's setup.
   */
  colourSpace?: 'linear' | 'srgb';
  /** The atlas point that is plain white, for shapes drawn without an image. */
  white?: [number, number];
  /** A round white dot in the atlas (radius 7/16 of its square), for halftone: two triangles a dot. */
  dot?: UvRect;
  /** px on a 1080p screen per metre at the game camera. Default 100.7 (drawing board v7). */
  pxPerMetre?: number;
  /** The quality tier: layers that do not show in it are not drawn (timing stays the same). Default high. */
  tier?: TierName;
}

/**
 * A layer that should have drawn at this moment but could not: the atlas does not have its image. A layer the tier
 * leaves out, or one that is not on at this moment, is not one of these.
 */
export interface NotDrawn {
  /** The effect's id. */
  effect: string;
  /** The layer's id, and its place in the effect's list. */
  layer: string;
  index: number;
  /** The image it needs. */
  image: string;
}

export interface EvalResult {
  /** Triangles this call added to the sink. */
  triangles: number;
  /** Images the effect names that the atlas does not have (those layers were skipped). */
  missingImages: string[];
  /** The layers skipped at this moment because the atlas does not have their image, one entry each. */
  notDrawn: NotDrawn[];
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
const WHITE: readonly [number, number, number] = [1, 1, 1];
const painter = new Painter();

/**
 * Which buffer a layer draws into. multiply and screen lie on the ground. normal and add share a buffer (on the ground
 * or over the scene): an added layer marks its colours with a negative alpha, which the material reads as "add".
 */
export function groupOf(l: VisibleLayer): BlendGroup {
  if (l.blend === 'multiply') return 'ground-multiply';
  if (l.blend === 'screen') return 'ground-screen';
  return l.facing === 'ground' ? 'ground' : 'top';
}

/** Where a visible layer is, which way its path goes and, when it rides a projectile, how far along the flight. */
interface Anchor {
  p: Vec3;
  dir: Vec3 | undefined;
  ride: { flight: Flight; k: number } | undefined;
  spinDeg: number;
  stretch: number;
}

export function evaluate(fx: EffectFile, ctx: EvalContext, sink: DrawSink, timeline?: Timeline): EvalResult {
  const c = applyControls(fx.controls);
  const tl = timeline ?? resolveTimeline(fx, ctx.inputs, c);
  const before = sink.triangles;
  const missing: string[] = [];
  const notDrawn: NotDrawn[] = [];
  const skip = (index: number, image: string) => {
    if (!missing.includes(image)) missing.push(image);
    notDrawn.push({ effect: fx.id, layer: fx.layers[index]!.id, index, image });
  };
  const colours = new Map<string, [number, number, number]>();
  const cam = ctx.camera;
  // How far towards the camera a point must move to rise by one metre on screen: cot(pitch).
  const fy = Math.abs(cam.forward[1]);
  const pullPerMetre = fy > 0.05 ? Math.sqrt(Math.max(0, 1 - fy * fy)) / fy : 20;
  const relation = ctx.relation ?? 'enemy';
  const mPerPx = 1 / (ctx.pxPerMetre ?? 100.7);
  const white = ctx.white ?? [0.5, 0.5];
  const viewerDistanceM = ctx.viewerDistanceM ?? 0;

  const rgbOf = (role: string): [number, number, number] => {
    const name = role === MAIN_ROLE ? c.mainRole : role;
    let col = colours.get(name);
    if (!col) {
      const hex = resolveRole(ctx.palette, name, ctx.faction);
      // An unknown role draws white (untinted). The checker names it.
      const [r, g, b] = hex ? parseHex(hex) : [255, 255, 255];
      col = ctx.colourSpace === 'srgb'
        ? [r / 255, g / 255, b / 255]
        : [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
      colours.set(name, col);
    }
    return col;
  };

  // Palette gradients, resolved once per call: stops naming a role follow the faction; hexes convert like roles do.
  const ramps = new Map<string, GradientRamp | undefined>();
  const gradientOf = (name: string): GradientRamp | undefined => {
    if (ramps.has(name)) return ramps.get(name);
    const g = ctx.palette.gradients?.[name];
    let ramp: GradientRamp | undefined;
    if (g && g.stops.length) {
      const stops = g.stops.map((st) => {
        let rgb: [number, number, number];
        if (st.role) rgb = rgbOf(st.role);
        else {
          const [r, gg, b] = st.hex && /^#[0-9A-Fa-f]{6}$/.test(st.hex) ? parseHex(st.hex) : [255, 255, 255];
          rgb = ctx.colourSpace === 'srgb' ? [r / 255, gg / 255, b / 255] : [srgbToLinear(r / 255), srgbToLinear(gg / 255), srgbToLinear(b / 255)];
        }
        return { at: st.at, c: [rgb[0], rgb[1], rgb[2], st.alpha ?? 1] as RGBA };
      }).sort((a, b) => a.at - b.at);
      ramp = { banded: g.kind === 'banded', stops };
    }
    ramps.set(name, ramp);
    return ramp;
  };

  const tier = ctx.tier ?? 'high';
  for (let i = 0; i < fx.layers.length; i++) {
    const l = fx.layers[i]!;
    if (l.type === 'projectile') continue;
    // A layer not in this tier is only not drawn: when everything starts and ends stays the same in every tier.
    if (l.tiers && !l.tiers.includes(tier)) continue;
    const span = tl.layers[i]!;
    const tauRaw = ctx.timeMs - span.startMs;
    const life = span.endMs - span.startMs;
    if (tauRaw < 0 || tauRaw >= life) continue;
    const n = l.timing.mode === 'steps' ? stepIndex(tauRaw, l.timing.perSecond) : -1;
    const tau = shownTime(tauRaw, l.timing);
    const buf = sink.groups[groupOf(l)];
    const where = anchorOf(fx, l, ctx, c, tl);

    if (l.type === 'sprite') {
      const rect = ctx.imageRect(l.image);
      if (!rect) {
        skip(i, l.image);
        continue;
      }
      drawSprite(l, i, span, tau, n, rect, where, cam, c, buf, rgbOf, pullPerMetre);
      continue;
    }

    if (l.type === 'burst' && l.look.kind === 'image' && !ctx.imageRect(l.look.image)) {
      skip(i, l.look.image);
      continue;
    }
    // Shapes, bursts and words: drawn flat in the layer's frame by the painter. Along a path they lie in the screen's
    // plane, as drawn comic shapes do (a sprite along a path lies along the real path instead).
    const frame = frameFor(l.facing, where.p, where.dir, cam, true);
    if (l.facing === 'ground' && l.liftM) frame.o[1] = l.liftM * c.size;
    if (l.shiftM) {
      for (let k = 0; k < 3; k++) {
        frame.o[k] = frame.o[k]! + (frame.u[k]! * l.shiftM[0] + frame.v[k]! * l.shiftM[1]) * c.size;
      }
    }
    const seedMix = layerSeed(l, ctx.seed);
    const v0 = buf.vcount;
    painter.begin(buf, frame, i, white, ctx.dot);
    const dctx: DrawCtx & { viewerDistanceM: number } = {
      p: painter,
      tau,
      n,
      parity: n >= 0 ? n % 2 : Math.floor(tau / (1000 / 12)) % 2,
      lifeMs: life,
      t: clamp(tau / life, 0, 1),
      effT: span.startMs + tau,
      tauRaw,
      effTRaw: ctx.timeMs,
      stepMs: stepMs(l.timing),
      tl,
      rnd: (a, b = 0) => random01(seedMix, a, b),
      rgba: (role, alpha = 1) => {
        const k = rgbOf(role);
        return [k[0], k[1], k[2], alpha];
      },
      relation,
      px: (v) => v * mPerPx,
      s: c.size * scaleAt(l.scale, n, tau / life),
      intensity: c.intensity,
      ...(where.ride ? { ride: where.ride } : {}),
      point: (input, offset) => inputPoint(ctx.inputs, tl.frame, { input, offset }, c.size),
      image: (name) => ctx.imageRect(name),
      gradient: gradientOf,
      viewerDistanceM,
    };
    if (l.type === 'shape') drawShape(l.shape, dctx);
    else if (l.type === 'burst') drawBurst(l, dctx);
    else drawWord(l, dctx);
    // Measured from the anchor itself, so a drawing moved up off the ground (shiftM) is pulled by what reaches below it.
    // A flat layer lifted off the ground (a ring round a tank's middle) is pulled like a standing one, so the thing it
    // circles does not hide its far side: it is drawn over its target, as a comic panel would.
    const onGround = l.facing === 'ground' && !l.liftM;
    setPull(buf, v0, where.p, cam, onGround ? 0 : pullPerMetre, onGround ? GROUND_PULL : l.type === 'word' ? WORD_STAND_OFF : STAND_OFF);
    const a = l.alpha ? scaleAt(l.alpha, n, tau / life) : 1;
    const sign = l.blend === 'add' ? -1 : 1;
    if (a !== 1 || sign < 0) for (let k = v0; k < buf.vcount; k++) buf.col[k * 4 + 3] = buf.col[k * 4 + 3]! * a * sign;
  }
  return { triangles: sink.triangles - before, missingImages: missing, notDrawn, lengthMs: tl.lengthMs };
}

/** Size factor from the layer's size animation: per step, and over its life. */
function scaleAt(s: VisibleLayer['scale'], n: number, t: number): number {
  if (!s) return 1;
  let k = 1;
  if (s.steps && n >= 0 && n < s.steps.length) k *= s.steps[n]!;
  if (s.life) k *= curveAt(s.life, clamp(t, 0, 1));
  return k;
}

function anchorOf(fx: EffectFile, l: VisibleLayer, ctx: EvalContext, c: ResolvedControls, tl: Timeline): Anchor {
  if (isInputAnchor(l.at)) {
    const p = inputPoint(ctx.inputs, tl.frame, l.at, c.size);
    const dir = normalize(sub(ctx.inputs.target, ctx.inputs.origin)) ?? tl.frame.forward;
    return { p, dir, ride: undefined, spinDeg: 0, stretch: 1 };
  }
  const ps = tl.byId.get(l.at.layer)!;
  const pl = fx.layers[ps.index] as ProjectileLayer;
  const f = ps.flight!;
  // A rider samples the projectile on the projectile's own steps, so they move together.
  const tp = Math.max(0, shownTime(ctx.timeMs - ps.startMs, pl.timing));
  const k = f.ms > 0 ? clamp(tp / f.ms, 0, 1) : 1;
  return {
    p: flightPoint(f, k),
    dir: flightDirection(f, k),
    ride: { flight: f, k },
    spinDeg: (pl.spinDegPerS * tp) / 1000,
    stretch: pl.stretch * c.intensity,
  };
}

/**
 * The flat frame a layer draws in: u is its x, v its y. With `flat`, a path frame lies in the screen's plane (its x
 * along the path as seen on screen, never foreshortened); without, its x lies along the real path.
 */
export function frameFor(facing: VisibleLayer['facing'], o: Vec3, dir: Vec3 | undefined, cam: CameraBasis, flat = false): Frame3 {
  if (facing === 'upright') {
    const u = normalize([cam.right[0], 0, cam.right[2]]) ?? [1, 0, 0];
    return { o: [...o], u, v: [0, 1, 0] };
  }
  if (facing === 'ground') {
    // Flat on the ground under the anchor (assumption, marked: the ground is flat, at height 0), x to the right on
    // screen, y away from the camera (up the screen).
    const u = normalize([cam.right[0], 0, cam.right[2]]) ?? [1, 0, 0];
    const v = normalize([cam.forward[0], 0, cam.forward[2]]) ?? [0, 0, -1];
    return { o: [o[0], 0, o[2]], u, v };
  }
  if (facing === 'path' && dir) {
    const side = normalize(cross(dir, cam.forward));
    if (side) {
      if (!flat) return { o: [...o], u: [...dir], v: side };
      const along = normalize(cross(cam.forward, side));
      // A drawn shape along a path stays upright: its y points up the screen whichever way the shot goes, so smoke
      // rises and the drawing is mirrored for a shot to the left rather than turned upside down.
      const up = side[0] * cam.up[0] + side[1] * cam.up[1] + side[2] * cam.up[2] < 0 ? scale(side, -1) : side;
      if (along) return { o: [...o], u: along, v: up };
    }
  }
  return { o: [...o], u: [...cam.right], v: [...cam.up] };
}

/**
 * How far a layer flat on the ground is pulled towards the camera, metres: enough to stay over ground decals and painted
 * shadows (which sit a millimetre up, with a polygon offset), too little to show over the feet of what stands on it.
 */
const GROUND_PULL = 0.05;

/**
 * How far every standing layer is pulled towards the camera on top of its reach, metres (assumption, marked). A flat
 * drawing through a muzzle or a hit point would otherwise cut into the thing it sits on (a gun's arms, a turret's
 * edge); the drawing board draws effects over their own unit. Walls still hide what is clearly behind them.
 */
const STAND_OFF = 0.4;

/** Comic words sit over everything near them, as lettering over a panel (assumption, marked): a bigger stand-off. */
const WORD_STAND_OFF = 1.5;

/**
 * Depth pull (assumption, marked): the part of a layer that reaches below its anchor, seen along the camera's up, is
 * pulled towards the camera by as much, so the ground or the wall it stands on never cuts it, plus the stand-off.
 * Ground layers sit just above the ground.
 */
function setPull(buf: TriBuffer, v0: number, anchor: Vec3, cam: CameraBasis, pullPerMetre: number, base = STAND_OFF): void {
  let reach = 0;
  if (pullPerMetre > 0) {
    for (let i = v0; i < buf.vcount; i++) {
      const o = i * 4;
      const d = (buf.pos[o]! - anchor[0]) * cam.up[0] + (buf.pos[o + 1]! - anchor[1]) * cam.up[1] + (buf.pos[o + 2]! - anchor[2]) * cam.up[2];
      if (-d > reach) reach = -d;
    }
  }
  const pull = reach * pullPerMetre + base;
  for (let i = v0; i < buf.vcount; i++) buf.pos[i * 4 + 3] = pull;
}

function drawSprite(
  l: SpriteLayer, index: number, span: LayerSpan, tau: number, n: number, rect: UvRect, where: Anchor,
  cam: CameraBasis, c: ResolvedControls, buf: TriBuffer,
  rgbOf: (role: string) => [number, number, number], pullPerMetre: number,
): void {
  const p = where.p;
  const dir = where.dir;
  const total = where.ride ? length(sub(where.ride.flight.to, where.ride.flight.from)) : 0;
  const along = where.ride ? where.ride.k * total : 0;

  // Size. Sprites on a point the game gives grow with intensity (flashes, hits, landings).
  const anim = scaleAt(l.scale, n, tau / (span.endMs - span.startMs));
  let w = l.sizeM[0] * c.size * anim;
  let h = l.sizeM[1] * c.size * anim;
  if (!where.ride) { w *= c.intensity; h *= c.intensity; }
  if (l.facing === 'path') w *= where.stretch;
  if (!(w > 1e-6 && h > 1e-6)) return;

  // Axes: the layer's frame (facing the camera, along the path, flat on the ground, or upright).
  const fr = frameFor(l.facing, p, dir, cam);
  if (l.facing === 'ground' && l.liftM) fr.o[1] = l.liftM * c.size;
  const alongPath = l.facing === 'path' && dir !== undefined && fr.u[0] === dir[0] && fr.u[1] === dir[1] && fr.u[2] === dir[2];
  let ax: Vec3 = fr.u;
  let ay: Vec3 = fr.v;
  if (where.spinDeg !== 0) {
    const cs = Math.cos(where.spinDeg * DEG), sn = Math.sin(where.spinDeg * DEG);
    const rx: Vec3 = [ax[0] * cs + ay[0] * sn, ax[1] * cs + ay[1] * sn, ax[2] * cs + ay[2] * sn];
    const ry: Vec3 = [ay[0] * cs - ax[0] * sn, ay[1] * cs - ax[1] * sn, ay[2] * cs - ax[2] * sn];
    ax = rx; ay = ry;
  }

  // Extent around the anchor. Pivot [0,0] is the image's top-left corner, [1,1] its bottom-right.
  const pu = l.pivot[0], pv = l.pivot[1];
  let a0 = -pu * w, a1 = (1 - pu) * w; // along x: left edge .. right edge
  const b0 = -(1 - pv) * h, b1 = pv * h; // along y: bottom edge .. top edge
  // A streak riding a projectile never reaches back past the start of the path, nor past its end.
  if (where.ride && alongPath && where.spinDeg === 0) {
    a0 = Math.max(a0, -along);
    a1 = Math.min(a1, total - along);
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
  const o = fr.o;
  const cx = o[0] + ax[0] * am + ay[0] * bm;
  const cy = o[1] + ax[1] * am + ay[1] * bm;
  const cz = o[2] + ax[2] * am + ay[2] * bm;
  const W = a1 - a0, H = b1 - b0;

  // Depth pull, as for shapes: by how far the quad reaches below its anchor on screen. Ground sprites sit just above.
  const onGround = l.facing === 'ground' && !l.liftM;
  let reach = 0;
  if (!onGround) {
    for (let sx = -0.5; sx <= 0.5; sx += 1) {
      for (let sy = -0.5; sy <= 0.5; sy += 1) {
        const ox = cx - o[0] + ax[0] * W * sx + ay[0] * H * sy;
        const oy = cy - o[1] + ax[1] * W * sx + ay[1] * H * sy;
        const oz = cz - o[2] + ax[2] * W * sx + ay[2] * H * sy;
        reach = Math.max(reach, -(ox * cam.up[0] + oy * cam.up[1] + oz * cam.up[2]));
      }
    }
  }
  const pull = onGround ? GROUND_PULL : reach * pullPerMetre + STAND_OFF;

  const col = l.tint.mode === 'multiply' ? rgbOf(l.tint.role) : WHITE;
  const alpha = l.alpha ? scaleAt(l.alpha, n, tau / (span.endMs - span.startMs)) : 1;
  if (alpha <= 0) return;
  buf.items++;
  buf.quad(
    cx, cy, cz,
    ax[0] * W, ax[1] * W, ax[2] * W,
    ay[0] * H, ay[1] * H, ay[2] * H,
    uL, fv0, uR, fv1,
    col[0], col[1], col[2], l.blend === 'add' ? -alpha : alpha,
    pull, index,
  );
}
