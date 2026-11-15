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
 *   over      ordinary see-through drawing and added light in one draw call, in the order written: premultiplied
 *             alpha, out = colour x a + under x (1 - a'), where a' = a for ordinary drawing and 0 for added light
 *             (the core marks added light with a negative alpha)
 *   multiply  darkens what is under it (scorch marks): out = under x colour
 *   screen    lightens what is under it (light on the ground): out = 1 - (1 - under)(1 - colour)
 */
import { AddEquation, CustomBlending, DoubleSide, DstColorFactor, MeshBasicNodeMaterial, OneFactor, OneMinusDstColorFactor, OneMinusSrcAlphaFactor, ZeroFactor } from 'three/webgpu';
import type { Texture } from 'three/webgpu';
import { abs, attribute, cameraProjectionMatrix, cameraViewMatrix, float, length, max, mix, positionGeometry, select, texture, varying, vec3, vec4 } from 'three/tsl';

export type BlendMode = 'over' | 'multiply' | 'screen';

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
  const a = texel.a.mul(abs(col.a));

  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = DoubleSide;
  // One pass, in the order the core wrote the triangles. (By default three.js draws a see-through, two-sided mesh
  // twice, back faces first, which would put every triangle wound one way under every triangle wound the other.)
  material.forceSinglePass = true;

  if (blend === 'over') {
    material.colorNode = vec4(rgb.mul(a), select(col.a.lessThan(0), float(0), a));
    material.blending = CustomBlending;
    material.blendEquation = AddEquation;
    material.blendSrc = OneFactor;
    material.blendDst = OneMinusSrcAlphaFactor;
    material.blendEquationAlpha = AddEquation;
    material.blendSrcAlpha = OneFactor;
    material.blendDstAlpha = OneMinusSrcAlphaFactor;
  } else if (blend === 'multiply') {
    // Fold alpha into the colour (white = no change), then multiply what is under it.
    material.colorNode = vec4(mix(vec3(1), rgb, a), float(1));
    material.blending = CustomBlending;
    material.blendEquation = AddEquation;
    material.blendSrc = DstColorFactor;
    material.blendDst = ZeroFactor;
  } else {
    material.colorNode = vec4(rgb.mul(a), float(1));
    material.blending = CustomBlending;
    material.blendEquation = AddEquation;
    material.blendSrc = OneMinusDstColorFactor;
    material.blendDst = OneFactor;
  }

  return {
    material,
    setMap(m: Texture) {
      texel.value = m;
    },
  };
}
