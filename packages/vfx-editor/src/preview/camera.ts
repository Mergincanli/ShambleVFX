/**
 * The game camera, exactly as the VFX drawing board v7 draws it (its P() function), in three.js.
 *
 * Board coordinates: x, y on the ground, z up. three.js: y up. Mapping: (x, y, z) board -> (x, z, -y) three.
 * The camera looks at the focus point on the ground from distance D = F / PPM, where F is the focal length in px
 * at 1080p and PPM the board's 100.7 px per metre.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import data from './scene-data.json';

export const CAM = data.camera;
const RAD = Math.PI / 180;

/** Focal length in px for the 1080p game screen. */
export const FOCAL_PX = CAM.screenHeight / 2 / Math.tan((CAM.fovDeg / 2) * RAD);
/** Distance from the camera to the point it looks at, in metres (about 40.73 m). */
export const CAMERA_DISTANCE = FOCAL_PX / CAM.pxPerMetreAt1080;

/** Direction from the focus point to the camera, in three.js world axes. */
export function cameraBack(): Vector3 {
  const p = CAM.pitchDeg * RAD, y = CAM.yawDeg * RAD;
  return new Vector3(Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y));
}

/** A camera for the full 1920 x 1080 game screen, looking at `focus` on the ground. */
export function makeGameCamera(focus = new Vector3()): PerspectiveCamera {
  const cam = new PerspectiveCamera(CAM.fovDeg, CAM.screenWidth / CAM.screenHeight, 1, 400);
  placeGameCamera(cam, focus);
  return cam;
}

export function placeGameCamera(cam: PerspectiveCamera, focus: Vector3): void {
  cam.position.copy(focus).addScaledVector(cameraBack(), CAMERA_DISTANCE);
  cam.up.set(0, 1, 0);
  cam.lookAt(focus);
  cam.updateMatrixWorld();
}

/**
 * The drawing board's own projection, ported as it is (board v7, functions Pc, w2c and P), for a 1920 x 1080 screen.
 * Used by the tests to prove the three.js camera draws exactly where the board draws.
 */
export function boardProject(x: number, y: number, z: number): [number, number] {
  const W = CAM.screenWidth, H = CAM.screenHeight;
  const PITCH = CAM.pitchDeg * RAD, YAW = CAM.yawDeg * RAD;
  const F = H / 2 / Math.tan((CAM.fovDeg * Math.PI) / 360);
  const PPM = CAM.pxPerMetreAt1080 * (H / 1080);
  const D = F / PPM, CP = Math.cos(PITCH), SP = Math.sin(PITCH), CY = Math.cos(YAW), SY = Math.sin(YAW);
  const cx = x * CY + y * SY, cy = -x * SY + y * CY;
  const vy = cy + D * CP, vz = z - D * SP, yc = vy * SP + vz * CP, zc = vy * CP - vz * SP;
  return [W / 2 + (F * cx) / zc, H / 2 - (F * yc) / zc];
}

/** Board ground coordinates (x, y, height z) to a three.js point. */
export function boardToThree(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, z, -y);
}

/** Camera-aligned ground coordinates (right, away from the camera) to a three.js ground point, as the board's c2w. */
export function cameraGround(right: number, away: number): Vector3 {
  const YAW = CAM.yawDeg * RAD, CY = Math.cos(YAW), SY = Math.sin(YAW);
  return boardToThree(right * CY - away * SY, right * SY + away * CY, 0);
}
