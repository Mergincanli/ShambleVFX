/**
 * The effect file, version 1.
 *
 * Rules that hold for every effect file:
 * - Times are in milliseconds, sizes and distances in metres.
 * - Colours are role names ("heat.2", "team", "glow"). A hex colour is never stored in an effect file:
 *   the hexes live in the one palette file (palette/palette.json).
 * - Everything random comes from the seed the game passes in.
 * - Layers draw in list order: the first layer is at the bottom.
 */

export const FORMAT_ID = 'shamble-vfx' as const;
export const FORMAT_VERSION = 1 as const;

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** The points the game gives an effect when it starts it. */
export type InputName = 'origin' | 'target';
export const INPUT_NAMES: readonly InputName[] = ['origin', 'target'];

/** A colour role, resolved through the palette for the faction that made the effect. */
export type RoleName = string;

/** In a tint, "main" means the effect's colour control (one of the big controls). */
export const MAIN_ROLE = 'main' as const;

/**
 * A point given by the game, moved by an offset in the "shot frame":
 * x to the right, y up, z forward (forward = from origin towards target, flat on the ground).
 */
export interface InputAnchor {
  input: InputName;
  offset: Vec3;
}

/** Ride on a projectile layer: the sprite moves with it. Only projectiles can be ridden. */
export interface LayerAnchor {
  layer: string;
}

export type Anchor = InputAnchor | LayerAnchor;

/** When a layer starts: some ms after the effect starts, or some ms after a projectile lands. */
export type StartAnchor = { ms: number } | { arrivalOf: string; ms: number };

/** A layer moves in whole steps (12 a second is the comic default) or smoothly. */
export type Timing = { mode: 'steps'; perSecond: number } | { mode: 'smooth' };

/**
 * The big controls each effect opens with. They scale the effect as a whole.
 * What each one changes is decided in one place: vfx-runtime's applyControls().
 */
export interface Controls {
  /** Scales sprite sizes and offsets. Not the points the game gives, not speeds. */
  size: number;
  /** How strong the effect is. In version 1 it scales flash-like sprites and streaks. */
  intensity: number;
  /** Stretches the effect's own times. Not a projectile's flight time (that comes from distance and speed). */
  duration: number;
  /** The main colour role. Layers whose tint role is "main" use it. */
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

/** "camera": the image faces the camera. "path": its x axis lies along the motion (or the shot direction). */
export type Facing = 'camera' | 'path';

interface LayerCommon {
  /** Unique inside the effect. Lowercase letters, digits and _. */
  id: string;
  /** The name shown in the editor. */
  name: string;
  start: StartAnchor;
  timing: Timing;
}

export interface SpriteLayer extends LayerCommon {
  type: 'sprite';
  at: Anchor;
  /** A PNG file name in the project's images folder. */
  image: string;
  flipbook?: Flipbook;
  /** The point of the image that sits on the anchor: [0, 0] is the top-left corner, [1, 1] the bottom-right. */
  pivot: Vec2;
  /** Width and height in metres. */
  sizeM: Vec2;
  tint: Tint;
  facing: Facing;
  /**
   * How long the sprite shows. Absent means: as long as the projectile it rides is in the air,
   * or, for a flipbook that does not loop, one step per frame.
   */
  durationMs?: number;
}

export interface ProjectileLayer extends LayerCommon {
  type: 'projectile';
  from: InputAnchor;
  to: InputAnchor;
  /** Metres per second. The flight time is distance / speed. */
  speedMps: number;
  /** Length factor along the path for the sprites that ride it: 1 is no stretch, 2 twice as long. */
  stretch: number;
  /** Degrees per second the riding sprites turn in their own plane. */
  spinDegPerS: number;
}

export type Layer = SpriteLayer | ProjectileLayer;
export type LayerType = Layer['type'];
export const LAYER_TYPES: readonly LayerType[] = ['sprite', 'projectile'];

export interface EffectFile {
  format: typeof FORMAT_ID;
  version: typeof FORMAT_VERSION;
  /** Lowercase letters, digits and _. Also the file name: <id>.vfx.json */
  id: string;
  name: string;
  controls: Controls;
  layers: Layer[];
}

export function isInputAnchor(a: Anchor): a is InputAnchor {
  return (a as InputAnchor).input !== undefined;
}

export function isArrivalStart(s: StartAnchor): s is { arrivalOf: string; ms: number } {
  return (s as { arrivalOf?: string }).arrivalOf !== undefined;
}
