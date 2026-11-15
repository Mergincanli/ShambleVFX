/**
 * The effect material. All TSL (three.js shading language) in the runtime lives in this one small file, because
 * three.js changes this API between releases. TSL builds both WGSL (WebGPU) and GLSL (WebGL 2).
 *
 * Per vertex (written by the core):
 *   position  xyz in world metres (interleaved with vPull)
 *   vPull     depth pull towards the camera in metres
 *   vUv   atlas coordinates (untextured shapes point at a white block)
 *   vCol  colour (linear or sRGB, matching the renderer) and alpha
 *
 * One material per blend group:
 *   normal    ordinary see-through drawing
 *   multiply  darkens what is under it (scorch marks): out = under x colour
 *   screen    lightens what is under it (light on the ground): out = 1 - (1 - under)(1 - colour)
 *   add       adds light (glows): out = under + colour
 */
import { AdditiveBlending, CustomBlending, DoubleSide, DstColorFactor, MeshBasicNodeMaterial, NormalBlending, OneFactor, OneMinusDstColorFactor, ZeroFactor, AddEquation } from 'three/webgpu';
import type { Texture } from 'three/webgpu';
import { attribute, cameraProjectionMatrix, cameraViewMatrix, float, length, max, mix, positionGeometry, texture, varying, vec3, vec4 } from 'three/tsl';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'add';

export interface EffectMaterial {
  material: MeshBasicNodeMaterial;
  /** Swap the atlas texture without rebuilding the material. */
  setMap(map: Texture): void;
}

export function createEffectMaterial(map: Texture, blend: BlendMode): EffectMaterial {
  const pull = attribute('vPull', 'float');
  const uvA = attribute('vUv', 'vec2');
  const colA = attribute('vCol', 'vec4');

  // Depth pull: slide the vertex towards the camera along its own view ray. Its place on screen stays the same.
  const view = cameraViewMatrix.mul(vec4(positionGeometry, 1)).xyz;
  const dist = length(view);
  const pulled = view.mul(max(dist.sub(pull), dist.mul(0.05)).div(dist));

  const material = new MeshBasicNodeMaterial();
  material.vertexNode = cameraProjectionMatrix.mul(vec4(pulled, 1));

  const texel = texture(map, varying(uvA));
  const col = varying(colA);
  const rgb = texel.rgb.mul(col.rgb);
  const a = texel.a.mul(col.a);

  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = DoubleSide;

  if (blend === 'normal') {
    material.colorNode = vec4(rgb, a);
    material.blending = NormalBlending;
  } else if (blend === 'multiply') {
    // Fold alpha into the colour (white = no change), then multiply what is under it.
    material.colorNode = vec4(mix(vec3(1), rgb, a), float(1));
    material.blending = CustomBlending;
    material.blendEquation = AddEquation;
    material.blendSrc = DstColorFactor;
    material.blendDst = ZeroFactor;
  } else if (blend === 'screen') {
    material.colorNode = vec4(rgb.mul(a), float(1));
    material.blending = CustomBlending;
    material.blendEquation = AddEquation;
    material.blendSrc = OneMinusDstColorFactor;
    material.blendDst = OneFactor;
  } else {
    material.colorNode = vec4(rgb, a);
    material.blending = AdditiveBlending;
  }

  return {
    material,
    setMap(m: Texture) {
      texel.value = m;
    },
  };
}
