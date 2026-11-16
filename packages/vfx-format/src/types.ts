/**
 * The effect file, version 5.
 *
 * Rules that hold for every effect file:
 * - Times are in milliseconds, sizes and distances in metres, ink widths in px on a 1080p screen.
 * - Colours are role names ("heat.2", "team", "glow"). A hex colour is never stored in an effect file:
 *   the hexes live in the one palette file (palette/palette.json).
 * - Everything random comes from the seed the game passes in (mixed with each layer's own seed).
 * - Layers draw in list order: the first layer is at the bottom.
 * - An effect has three phases on its timeline: wind-up, peak, fade.
 */

export const FORMAT_ID = 'shamble-vfx' as const;
export const FORMAT_VERSION = 5 as const;

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
/** A curve: [time 0..1, value] points, straight lines between them. */
export type Curve = [number, number][];
/** A range: a value is picked between the two, from the seed. */
export type Range = [number, number];

/** The points the game gives an effect when it starts it. */
export type InputName = 'origin' | 'target';
export const INPUT_NAMES: readonly InputName[] = ['origin', 'target'];

/** A colour role, resolved through the palette for the faction that made the effect. */
export type RoleName = string;

/** In a tint or a fill, "main" means the effect's colour control (one of the big controls). */
export const MAIN_ROLE = 'main' as const;

export type PhaseName = 'windup' | 'peak' | 'fade';
export const PHASE_NAMES: readonly PhaseName[] = ['windup', 'peak', 'fade'];

/** The effect's three phases, back to back: wind-up, then peak, then fade. All zero = no phases set. */
export interface Phases {
  windupMs: number;
  peakMs: number;
  fadeMs: number;
}

/**
 * A point given by the game, moved by an offset in the "shot frame":
 * x to the right, y up, z forward (forward = from origin towards target, flat on the ground).
 */
export interface InputAnchor {
  input: InputName;
  offset: Vec3;
}

/** Ride on a projectile layer: the layer moves with it. Only projectiles can be ridden. */
export interface LayerAnchor {
  layer: string;
}

export type Anchor = InputAnchor | LayerAnchor;

/** When a layer starts: some ms after the effect starts, after a projectile lands, or after a phase starts. */
export type StartAnchor = { ms: number } | { arrivalOf: string; ms: number } | { phase: PhaseName; ms: number };

/** A layer moves in whole steps (12 a second is the comic default) or smoothly. */
export type Timing = { mode: 'steps'; perSecond: number } | { mode: 'smooth' };

/**
 * How a flat layer is placed in the world.
 * camera: faces the camera. path: its x axis lies along the motion (or the shot).
 * ground: lies flat on the ground. upright: stands up like a sign (camera's right, world up), so heights are true heights.
 */
export type Facing = 'camera' | 'path' | 'ground' | 'upright';
export const FACINGS: readonly Facing[] = ['camera', 'path', 'ground', 'upright'];

/**
 * How a layer mixes with what is under it. multiply darkens (scorch marks) and screen lightens (light on the ground):
 * both lie on the ground. add adds light (glows).
 */
export type Blend = 'normal' | 'multiply' | 'screen' | 'add';
export const BLENDS: readonly Blend[] = ['normal', 'multiply', 'screen', 'add'];

/**
 * Friend or foe by shape and edge (Mustafa, 2026-11-14), set per layer.
 * auto: an enemy's gets a solid ink edge, your own team's a thin broken one (what "broken" looks like depends on the
 *       kind: a dashed rim, a hollow spark, a thin dark line, a dashed beam). enemy: an ink edge for an enemy's, none
 *       for your own team's. ink, broken, none: always that look.
 */
export type Edge = 'auto' | 'enemy' | 'ink' | 'broken' | 'none';
export const EDGES: readonly Edge[] = ['auto', 'enemy', 'ink', 'broken', 'none'];

/**
 * The big controls each effect opens with. They scale the effect as a whole.
 * What each one changes is decided in one place: vfx-runtime's applyControls().
 */
export interface Controls {
  size: number;
  intensity: number;
  duration: number;
  colour: RoleName;
}

/** A flipbook is a grid of frames in one image, read left to right, top to bottom. One frame per step. */
export interface Flipbook {
  cols: number;
  rows: number;
  frames: number;
  loop: boolean;
}

export type Tint = { mode: 'keep' } | { mode: 'multiply'; role: RoleName };

/** A factor over time: size over time on top of the layer's own size (scale), or see-through over time (alpha). */
export interface ScaleAnim {
  /** One factor per step from the start: [1.18, 1.06] pops a shape in a little too large, then it settles. */
  steps?: number[];
  /** A curve over the layer's life (0 = start, 1 = end). */
  life?: Curve;
}

interface LayerCommon {
  /** Unique inside the effect. Lowercase letters, digits and _. */
  id: string;
  /** The name shown in the editor. */
  name: string;
  start: StartAnchor;
  timing: Timing;
}

/** Quality tiers. The game picks one for every effect; each layer says in which tiers it shows. */
export type TierName = 'low' | 'medium' | 'high';
export const TIER_NAMES: readonly TierName[] = ['low', 'medium', 'high'];

/** What every visible layer (sprite, shape, burst, word) has. */
interface VisibleCommon extends LayerCommon {
  /** The quality tiers this layer shows in. Low drops extras but stays readable (Mustafa's decision 7). */
  tiers: TierName[];
  at: Anchor;
  facing: Facing;
  blend: Blend;
  /** How long the layer shows. Absent: automatic (see the layer type), or until a phase ends (untilPhaseEnd). */
  durationMs?: number;
  /** The layer ends when this phase ends. Do not set with durationMs. */
  untilPhaseEnd?: PhaseName;
  scale?: ScaleAnim;
  /**
   * How solid the layer is over time, 0..1 (multiplies every colour's alpha). Comic shapes stay solid; light, rings
   * and glows may fade.
   */
  alpha?: ScaleAnim;
  /** Moves the drawing in its own flat frame, metres: [right, up] (for a camera-facing layer: on screen). */
  shiftM?: Vec2;
  /** A layer flat on the ground lies this high above it, metres (a ring around a tank's middle). Default 0. */
  liftM?: number;
}

export interface SpriteLayer extends VisibleCommon {
  type: 'sprite';
  /** A PNG file name in the project's images folder. */
  image: string;
  flipbook?: Flipbook;
  /** The point of the image that sits on the anchor: [0, 0] is the top-left corner, [1, 1] the bottom-right. */
  pivot: Vec2;
  /** Width and height in metres. */
  sizeM: Vec2;
  tint: Tint;
}

export interface ProjectileLayer extends LayerCommon {
  type: 'projectile';
  from: InputAnchor;
  to: InputAnchor;
  /** How long it flies: from a speed (distance / speed), a fixed time, or the length of a phase. */
  flight: { mode: 'speed'; mps: number } | { mode: 'time'; ms: number } | { mode: 'phase'; phase: PhaseName };
  /** Height of the arc above the straight line, in metres, at the middle of the flight. 0 = straight. */
  arcM: number;
  /** Length factor along the path for the sprites that ride it: 1 is no stretch, 2 twice as long. */
  stretch: number;
  /** Degrees per second the riding sprites turn in their own plane. */
  spinDegPerS: number;
}

/** One tone of a layered shape: a copy at `scale` of the outer size, filled with `role`. */
export interface Tone {
  role: RoleName;
  scale: number;
  /** Its own number of points (shards only). */
  points?: number;
  /** The tone goes away when the break-up reaches this point (0..1). Absent: it stays. */
  vanishAt?: number;
}

/** Halftone dots inside a shape: they shrink towards one side. */
export interface HalftoneFill {
  role: RoleName;
  stepPx: number;
  dotPx: number;
  /** The side the dots fade towards, in degrees on screen (0 = right, 90 = up). */
  towardDeg: number;
}

/** When a shape breaks up: over a phase, or over the last part of the layer's life. */
export type BreakUp = { phase: PhaseName } | { lastMs: number };

export type ShapeSpec =
  | ShardsShape | FlashShape | CloudShape | SmokeShape | RingShape | DotsShape | ScorchShape | LinesShape
  | GlowShape | TrailShape | BandShape | BeadsShape | FlamesShape | BedShape;

export type ShapeKind = ShapeSpec['kind'];

/** A burst of straight shards or a star, in layered tones (outer first). Also glints and hit stars (jitter 0). */
export interface ShardsShape {
  kind: 'shards';
  radiusM: number;
  points: number;
  /** Inner corners, as a share of the radius. */
  inner: number;
  /** How uneven the spikes are (0 = a regular star). */
  jitter: number;
  /** 1 = round; less than 1 squashes it top to bottom. */
  squash: number;
  rotationDeg: number;
  tones: Tone[];
  inkPx: number;
  edge: Edge;
  /** The first step is drawn white (the "one white frame" when a shell lands). */
  whiteFirstStep: boolean;
  /** Degrees it turns on every other step (the drawing "boils"). */
  boilDeg: number;
  /** Tones go away from the outside in, and the shape shrinks to half, over this time. */
  breakUp?: BreakUp;
  /** A second, jagged edge inside the first. */
  double: boolean;
  halftone?: HalftoneFill;
}

/** A muzzle flash: a long spike forward, side spikes, short spikes back. Lies along the shot. */
export interface FlashShape {
  kind: 'flash';
  lengthM: number;
  tones: Tone[];
  inkPx: number;
  edge: Edge;
  /** Every other step is drawn smaller and jittered, as the drawing board alternates two drawings. */
  alternate: { scale: number; jitter: number };
}

/** A cloud: a lumpy, scalloped outline (blast cores, puff bursts), in layered tones. */
export interface CloudShape {
  kind: 'cloud';
  radiusM: number;
  squash: number;
  lobes: number;
  /** How far the lobes stand out, as a share of the radius. */
  lobeDepth: number;
  tones: Tone[];
  inkPx: number;
  edge: Edge;
  boilDeg: number;
  breakUp?: BreakUp;
  halftone?: HalftoneFill;
}

/** Smoke: a puff (a few rounds with a rim) or a billow (lumpy, lit from above, halftone underneath). */
export interface SmokeShape {
  kind: 'smoke';
  style: 'puff' | 'billow';
  radiusM: number;
  role: RoleName;
  /**
   * A gradient in the palette: the body colour over each puff's life, from its start (0) to its end (1). With it, the
   * body takes its colour from the gradient, not from role; the light top and the rim keep their own colours. The
   * gradient's alpha multiplies the whole puff's opacity; each round is see-through on its own, so where rounds overlap
   * they show.
   */
  gradient?: string;
  /** The lighter top of a billow. */
  lightRole?: RoleName;
  rimRole: RoleName;
  inkPx: number;
  /** Size over the life, as [start, peak, end] factors. */
  grow: [number, number, number];
  /** How far it rises over its life, in metres. */
  riseM: number;
  /** How far the wind carries it over its life: [right, forward] metres. */
  driftM: Vec2;
  /** Billows that keep coming: how many at once, and how long each one lives. */
  loop?: { count: number; lifeMs: number };
}

/**
 * A circle on the ground: the ring round a blast or a fire area.
 * auto-zigzag / auto-teeth: an enemy's ring is a zigzag (shell) or a solid ring with teeth (fire, lock-on), your own
 * team's is dashed. The other styles force one look.
 */
export interface RingShape {
  kind: 'ring';
  radiusM: number;
  /** The coloured line, px at 1080p. */
  widthPx: number;
  /** The ink line under it, px at 1080p (0 = none). */
  inkPx: number;
  role: RoleName;
  style: 'auto-zigzag' | 'auto-teeth' | 'solid' | 'dashed' | 'zigzag' | 'teeth';
  /** Zigzag corners or teeth round the ring. */
  teeth: number;
  /** How far the teeth reach in, metres. */
  teethM: number;
  /** It grows from this share of its size to full size over growMs. */
  growFrom: number;
  growMs: number;
  /** It turns dashed, and loses its teeth, when the break-up passes this point (0..1). */
  dashAt?: number;
  breakUp?: BreakUp;
  /** Rings that close in on the centre, again and again (a lock-on). */
  closing?: { count: number; periodMs: number; fromM: number; toM: number };
  /** The ring's height as a share of its width (a ring facing the camera drawn as if it lay on the ground). Default 1. */
  squash?: number;
}

/**
 * A field of halftone dots: the soft edge of a blast, light on the ground. With edgeM 0 the dots shrink from the middle
 * out; with edgeM > 0 they stay full size and shrink over the last edgeM metres (a ring of light from innerM).
 */
export interface DotsShape {
  kind: 'dots';
  radiusM: number;
  innerM: number;
  edgeM: number;
  stepPx: number;
  dotPx: number;
  role: RoleName;
  alpha: number;
  /** The field grows from this share to full size over growMs. */
  growFrom: number;
  growMs: number;
  /** The outer edge breathes by this many metres every other step. */
  flickerM: number;
  /** The field's height as a share of its width (round dots on a ground-shaped field: the sine of the camera's tilt). */
  squash?: number;
  breakUp?: BreakUp;
}

/** A stain on the ground (multiply it): a soft oval, or a splat with lobes. */
export interface ScorchShape {
  kind: 'scorch';
  style: 'oval' | 'splat';
  radiusM: number;
  role: RoleName;
  /** A darker middle: its share of the size (0 = none). */
  coreScale: number;
  coreRole: RoleName;
  lobes: number;
  growMs: number;
}

/** Thin ink lines radiating from the middle (speed lines). */
export interface LinesShape {
  kind: 'lines';
  count: number;
  innerM: Range;
  lengthM: Range;
  widthPx: Range;
  role: RoleName;
  /** The lines are gone after this share of the life. */
  until: number;
  /** How far they move out over that time, as a share of the inner radius. */
  spread: number;
}

/** A soft round glow (light), or a flat disc of light. Use with add or screen. */
export interface GlowShape {
  kind: 'glow';
  radiusM: number;
  role: RoleName;
  alpha: number;
  soft: boolean;
  /** A gradient in the palette, from the middle to the rim. With it, the glow takes its colours from the gradient (times alpha), not from role. */
  gradient?: string;
  /** Size over the life, as [start, end] factors. */
  grow: Vec2;
  /** Every other step it is this much larger (flicker). */
  flicker: number;
}

/** A streak along a projectile's path: the last part of the path behind it. Rides a projectile. */
export interface TrailShape {
  kind: 'trail';
  /** How much of the path it covers behind the projectile, as a share of the whole path. */
  length: number;
  /** Width in px at the tail and at the head. */
  widthPx: Vec2;
  role: RoleName;
  /** The front part, in another colour (the hot head of a shell). */
  head?: { role: RoleName; share: number };
  /** A thin core line along the middle. "auto" leaves it out for your own team, as the board does. */
  core?: { role: RoleName; px: number; edge: Edge };
  inkPx: number;
  edge: Edge;
  /** It breaks into dashes that shrink towards the target over this time. */
  breakUp?: BreakUp;
  dashes: number;
}

/** A straight band from one point to another (a beam): solid, soft (light), or broken. */
export interface BandShape {
  kind: 'band';
  from: InputAnchor;
  to: InputAnchor;
  /** Width in metres at the start and at the end. */
  widthM: Vec2;
  role: RoleName;
  alpha: number;
  soft: boolean;
  /**
   * ink: always solid. broken: always a dashed line. auto: solid for an enemy's, dashed for your own team's.
   * enemy: solid for an enemy's, not drawn for your own team's (the beam's white core). none: not drawn.
   */
  edge: Edge;
  /** Every other step it is this much wider (flicker). */
  flicker: number;
  /** Over this phase it grows from the start towards the end, as a thin dashed line (finding the target). */
  find?: PhaseName;
  /** Over this phase it lets go: it pulls back from the end towards the start. */
  letGo?: PhaseName;
}

/** Bright beads that run along a line, again and again (the direction of a drain). */
export interface BeadsShape {
  kind: 'beads';
  from: InputAnchor;
  to: InputAnchor;
  count: number;
  periodMs: number;
  sizeM: number;
  role: RoleName;
  glowRole?: RoleName;
}

/** Flame tongues: long S-curved shapes that sway and flow one way, each with a light core and a shaded side. */
export interface FlamesShape {
  kind: 'flames';
  radiusM: number;
  count: number;
  /** Which depth of the fire: back, middle, front, or all three. */
  depth: 'back' | 'middle' | 'front' | 'all';
  tallM: Range;
  widthM: Range;
  /** How far the tips lean with the wind, metres per metre of height. */
  lean: number;
  sway: number;
  /** Steps one sway takes. */
  cycleSteps: Range;
  /** body, middle, hot, core (outer to inner) for the back tongues; nearer tongues use the hotter end. */
  tones: RoleName[];
  shadeRole: RoleName;
  inkPx: number;
  edge: Edge;
  /** A small flame that lets go of a tall tongue's tip. */
  licks: boolean;
  growMs: number;
  breakUp?: BreakUp;
}

/** The bed of a fire: rounded lumps in tone bands, dark at the rim and bright in the middle, boiling. */
export interface BedShape {
  kind: 'bed';
  radiusM: number;
  /** Rim to middle: one band of lumps per tone. Used when there is no gradient. */
  tones: RoleName[];
  /**
   * A gradient in the palette, from the middle (0) to the rim (1), as a glow's, in place of the tones' colours. A banded
   * gradient gives one band per stop, with the band edges at the stops. A smooth one keeps the tones' bands (one per
   * tone, in their places) and blends its colours over them. Both parts (lumps and detail) read it, so the detail's
   * halftone sits where the bands meet: give both bed layers of a fire the same one.
   */
  gradient?: string;
  lumps: number;
  /** Draw only the bed (flat tones), or only its detail on top (halftone where tones meet, brush strokes, curls). */
  part: 'lumps' | 'detail';
  detailRole: RoleName;
  inkPx: number;
  edge: Edge;
  /** The lumps change every this many steps. */
  boilSteps: number;
  growMs: number;
  breakUp?: BreakUp;
}

export interface ShapeLayer extends VisibleCommon {
  type: 'shape';
  shape: ShapeSpec;
  /** This layer's own seed. */
  seed: number;
  /** true: the shape changes with every play (the play seed is mixed in); false: always the same. */
  perPlay: boolean;
}

export type ParticleLook =
  | {
    kind: 'diamond' | 'chip' | 'spark' | 'dot' | 'shard' | 'speck' | 'puff' | 'streak' | 'spike'; role: RoleName; inkPx: number; edge: Edge;
    /** The colour of the "ink" edge, when it should not be black (a stone chip's darker rim). Default ink. */
    inkRole?: RoleName;
  }
  | { kind: 'image'; image: string; tint: Tint };

/** A set number of small things thrown out at once (or again and again, with loop). */
export interface BurstLayer extends VisibleCommon {
  type: 'burst';
  count: number;
  lifeMs: Range;
  speedMps: Range;
  /** In the layer's flat frame: out = all round; up = around up within spreadDeg; path = around the shot within spreadDeg. */
  direction: 'up' | 'out' | 'path';
  spreadDeg: number;
  /** Starting distance from the anchor, in metres. */
  startRadiusM: Range;
  /** Pieces start anywhere in a box this big round the anchor, [half width, half height] in metres (sparks over a fire). */
  areaM?: Vec2;
  gravityMps2: number;
  /** Slows the pieces down: 0 = none; 3 = they lose most of their speed in a third of a second. */
  drag: number;
  sizeM: Range;
  sizeOverLife: Curve;
  spinDegPerS: Range;
  look: ParticleLook;
  /**
   * A gradient in the palette: each piece's colour over its own life, from its birth (0) to its end (1). It replaces the
   * look's role; image pieces are multiplied by it (in place of the tint). The gradient's alpha multiplies the piece's
   * opacity. The speed streak keeps its own colour, and ink edges stay.
   */
  gradient?: string;
  /** Each piece starts again when its life ends (a loop of the layer's clock, not an emitter with memory). */
  loop: boolean;
  /** A speed streak behind each piece, pointing back the way it came: tapered, in its own colour. */
  streak?: { role: RoleName; lengthM: number; widthPx: number };
  /** Pieces stop on the ground instead of going through it. */
  groundStop: boolean;
  seed: number;
  perPlay: boolean;
}

/**
 * One word a word layer can show. chance: how often it shows, in percent (0 to 100), optional. How chances turn into
 * shares of the plays (words without a chance, chances adding up to more or less than 100): see wordShares (words.ts).
 */
export interface SoundWord {
  text: string;
  chance?: number;
}

/** A comic sound word in our own block letters. It always faces the screen. */
export interface WordLayer extends VisibleCommon {
  type: 'word';
  /**
   * One is picked per play, from the seed. Drawn in capitals. A space between two letters is a gap (spaces before the
   * first letter or after the last add nothing); other characters than A to Z, ! and the space are left out, and the
   * checker warns about them.
   */
  words: SoundWord[];
  /** Letter height in px on a 1080p screen, at full size. */
  letterPx: number;
  /** Two flat tones (top above, bottom below, hard edge between) and the pushed-back copy behind. */
  colours: { top: RoleName; bottom: RoleName; back: RoleName };
  /** A thin line of this colour between two black outlines, so the word reads on anything. */
  separation?: RoleName;
  /** Tilt of the whole word, picked per play between these, degrees (negative = the other way). */
  tiltDeg: Range;
  /** Size picked per play within this share up or down. */
  sizeJitter: number;
  /** Letters grow (+) or shrink (-) along the word, as a share. */
  ramp: number;
  /** How far letters sit above or below the line, in letter heights / 7. */
  bounce: number;
  /** How far each letter turns, degrees. */
  turnDeg: number;
  slantDeg: number;
  /** Pops in a little too large for the first steps, then settles. */
  pop: { scale: number; steps: number };
  /** Shrinks away at the end: over a phase or the last ms of its life, in this many steps (0 = smoothly). */
  breakUp?: BreakUp;
  breakSteps: number;
  /** How far it rises over its life, in metres. */
  riseM: number;
  /** Size by distance from the player who sees it: [metres, size share] points; under minPx it is not drawn. */
  distance: { curve: [number, number][]; minPx: number };
  /** everyone, or only the player who fired (a gun's word). */
  visibleTo: 'everyone' | 'shooter';
  seed: number;
  perPlay: boolean;
}

export type Layer = SpriteLayer | ProjectileLayer | ShapeLayer | BurstLayer | WordLayer;
export type LayerType = Layer['type'];
export const LAYER_TYPES: readonly LayerType[] = ['sprite', 'projectile', 'shape', 'burst', 'word'];
export type VisibleLayer = SpriteLayer | ShapeLayer | BurstLayer | WordLayer;

export interface EffectFile {
  format: typeof FORMAT_ID;
  version: typeof FORMAT_VERSION;
  /** Lowercase letters, digits and _. Also the file name: <id>.vfx.json */
  id: string;
  name: string;
  controls: Controls;
  phases: Phases;
  layers: Layer[];
}

export function isInputAnchor(a: Anchor): a is InputAnchor {
  return (a as InputAnchor).input !== undefined;
}

export function isArrivalStart(s: StartAnchor): s is { arrivalOf: string; ms: number } {
  return (s as { arrivalOf?: string }).arrivalOf !== undefined;
}

export function isPhaseStart(s: StartAnchor): s is { phase: PhaseName; ms: number } {
  return (s as { phase?: string }).phase !== undefined;
}

export function isVisible(l: Layer): l is VisibleLayer {
  return l.type !== 'projectile';
}
