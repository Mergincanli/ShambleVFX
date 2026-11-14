/**
 * The sprite material. All TSL (three.js shading language) in the runtime lives in this one small file,
 * because three.js changes this API between releases. TSL builds both WGSL (WebGPU) and GLSL (WebGL 2).
 *
 * Per quad (instanced attributes written by the core):
 *   iCentre  xyz centre in world metres, w = depth pull towards the camera in metres
 *   iAxisX   full width as a world vector
 *   iAxisY   full height as a world vector
 *   iUv      atlas rectangle: left u, top v, right u, bottom v
 *   iColour  linear (or sRGB, matching the renderer) tint and alpha
 */
import { DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import type { Texture } from 'three/webgpu';
import { attribute, cameraProjectionMatrix, cameraViewMatrix, float, length, max, mix, positionGeometry, texture, varying, vec2, vec4 } from 'three/tsl';

export interface SpriteMaterial {
  material: MeshBasicNodeMaterial;
  /** Swap the atlas texture without rebuilding the material. */
  setMap(map: Texture): void;
}

export function createSpriteMaterial(map: Texture): SpriteMaterial {
  const corner = positionGeometry.xy; // the quad's corner, -0.5 .. 0.5
  const centre = attribute('iCentre', 'vec4');
  const axisX = attribute('iAxisX', 'vec4');
  const axisY = attribute('iAxisY', 'vec4');
  const rect = attribute('iUv', 'vec4');
  const tint = attribute('iColour', 'vec4');

  // World position of this corner (the mesh itself never moves, so world = local).
  const world = centre.xyz.add(axisX.xyz.mul(corner.x)).add(axisY.xyz.mul(corner.y));
  // Depth pull: slide the corner towards the camera along its own view ray. Its place on screen stays the same.
  const view = cameraViewMatrix.mul(vec4(world, 1)).xyz;
  const dist = length(view);
  const pulled = view.mul(max(dist.sub(centre.w), dist.mul(0.05)).div(dist));

  const material = new MeshBasicNodeMaterial();
  material.vertexNode = cameraProjectionMatrix.mul(vec4(pulled, 1));

  const uv = varying(vec2(mix(rect.x, rect.z, corner.x.add(0.5)), mix(rect.y, rect.w, float(0.5).sub(corner.y))));
  const texel = texture(map, uv);
  const col = varying(tint);
  material.colorNode = vec4(texel.rgb.mul(col.rgb), texel.a.mul(col.a));

  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = DoubleSide;

  return {
    material,
    setMap(m: Texture) {
      texel.value = m;
    },
  };
}
