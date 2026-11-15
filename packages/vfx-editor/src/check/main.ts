/**
 * The colour check page. It draws sprites tinted by palette roles on the game ground, with the real runtime,
 * so a headless browser can read the pixels back and compare them with the palette hexes.
 * Open /check.html (WebGPU when the browser has it) or /check.html?backend=webgl (WebGL 2).
 */
import { BoxGeometry, Color, Mesh, MeshBasicNodeMaterial, NoColorSpace, PlaneGeometry, RenderTarget, RGBAFormat, Scene, UnsignedByteType, Vector3, WebGPURenderer } from 'three/webgpu';
import paletteJson from '@shamble/vfx-format/palette.json';
import { newEffect, newProjectileLayer, newSpriteLayer, resolveRole } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Palette, SpriteLayer } from '@shamble/vfx-format';
import { VfxRenderer } from '@shamble/vfx-runtime';
import { cameraGround, makeGameCamera } from '../preview/camera';
import data from '../preview/scene-data.json';

const palette = paletteJson as Palette;
const params = new URLSearchParams(location.search);
const forceWebGL = params.get('backend') === 'webgl';
const faction = (params.get('faction') ?? 'allies') as FactionId;
// Off-screen: render into a texture and read it back. Headless browsers here cannot show a WebGPU canvas,
// but they can render WebGPU off-screen, so the check reads the real WebGPU output this way.
const offscreen = params.get('offscreen') === '1';

interface Probe { label: string; x: number; y: number; expect: string }

async function main(): Promise<void> {
  const renderer = new WebGPURenderer({ antialias: false, forceWebGL });
  renderer.setPixelRatio(1);
  renderer.setSize(1920, 1080);
  await renderer.init();
  let target: RenderTarget | null = null;
  let shown: HTMLCanvasElement | null = null;
  if (offscreen) {
    // A plain 8-bit target: the renderer's output pass writes sRGB values into it once, as it would to the screen.
    target = new RenderTarget(1920, 1080, { type: UnsignedByteType, format: RGBAFormat, colorSpace: NoColorSpace, depthBuffer: true });
    renderer.setOutputRenderTarget(target);
    shown = document.createElement('canvas');
    shown.width = 1920; shown.height = 1080;
    document.body.appendChild(shown);
  } else {
    document.body.appendChild(renderer.domElement);
  }

  const scene = new Scene();
  scene.background = new Color(data.ground.sun);
  const ground = new Mesh(new PlaneGeometry(200, 200), new MeshBasicNodeMaterial({ color: new Color(data.ground.sun) }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const camera = makeGameCamera();

  // Atlas: an opaque white square and a half-transparent white square.
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = 64; atlasCanvas.height = 32;
  const g = atlasCanvas.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(32, 0, 32, 32);

  const vfx = new VfxRenderer(palette);
  vfx.setAtlas({ image: atlasCanvas, width: 64, height: 32, rects: { 'white.png': { x: 2, y: 2, w: 28, h: 28 }, 'half.png': { x: 34, y: 2, w: 28, h: 28 }, __white: { x: 10, y: 10, w: 8, h: 8 } } });
  scene.add(vfx.object);

  const roles = ['heat.1', 'heat.2', 'heat.3', 'heat.4', 'ink', 'team', 'glow', 'gunword.top', 'dust'];
  const fx: EffectFile = newEffect('colour_check', 'Colour check');
  const probes: Probe[] = [];
  const spots: Vector3[] = [];
  roles.forEach((role, i) => {
    const spot = cameraGround(-8 + i * 2, 2.5);
    spots.push(spot);
    const l: SpriteLayer = { ...newSpriteLayer(`r${i}`, role, 'white.png'), sizeM: [1.2, 1.2], tint: { mode: 'multiply', role }, at: { input: 'origin', offset: [0, 0, 0] } };
    fx.layers.push(l);
  });
  // Half-transparent heat.1 over the ground, and a sprite centred on the ground (the ground must not cut it).
  const halfSpot = cameraGround(-3, -2.5);
  const groundSpot = cameraGround(3, -2.5);
  // A 2 m wall facing the camera, and a sprite on the ground 1.5 m behind it: the wall must hide the sprite.
  const WALL = '#D0BA8C';
  const wallSpot = cameraGround(7, -3.2);
  const wall = new Mesh(new BoxGeometry(2.4, 2, 0.3), new MeshBasicNodeMaterial({ color: new Color(WALL) }));
  wall.position.set(wallSpot.x, 1, wallSpot.z);
  wall.rotation.y = Math.PI / 4;
  scene.add(wall);
  const behindSpot = cameraGround(7, -1.7);
  const controlSpot = cameraGround(4.6, -1.7); // the same distance, with no wall in front: must show
  // A 1 m square riding a projectile that spins 90 degrees a second, shown at 500 ms: turned 45 degrees.
  const spinSpot = cameraGround(-7, -2.5).add(new Vector3(0, 0.8, 0));
  const spinFx: EffectFile = newEffect('spin_check', 'Spin check');
  const spinP = newProjectileLayer('p', 'P');
  spinP.spinDegPerS = 90;
  spinP.timing = { mode: 'smooth' };
  spinFx.layers = [spinP, { ...newSpriteLayer('r', 'R', 'white.png'), at: { layer: 'p' }, sizeM: [1, 1], tint: { mode: 'multiply', role: 'ink' }, durationMs: 2000 }];

  const draw = () => {
    vfx.begin(camera);
    fx.layers.forEach((l, i) => {
      const one: EffectFile = { ...fx, layers: [l] };
      vfx.draw(one, { seed: 1, timeMs: 0, inputs: { origin: spots[i]!.toArray() as [number, number, number], target: spots[i]!.toArray() as [number, number, number] }, faction });
    });
    const half: EffectFile = { ...fx, layers: [{ ...newSpriteLayer('half', 'Half', 'half.png'), sizeM: [1.2, 1.2], tint: { mode: 'multiply', role: 'heat.1' } }] };
    vfx.draw(half, { seed: 1, timeMs: 0, inputs: { origin: halfSpot.toArray() as [number, number, number], target: halfSpot.toArray() as [number, number, number] }, faction });
    const onGround: EffectFile = { ...fx, layers: [{ ...newSpriteLayer('g', 'On the ground', 'white.png'), sizeM: [1.2, 1.2], tint: { mode: 'multiply', role: 'ink' } }] };
    vfx.draw(onGround, { seed: 1, timeMs: 0, inputs: { origin: groundSpot.toArray() as [number, number, number], target: groundSpot.toArray() as [number, number, number] }, faction });
    const behind: EffectFile = { ...fx, layers: [{ ...newSpriteLayer('b', 'Behind the wall', 'white.png'), sizeM: [0.8, 0.8], tint: { mode: 'multiply', role: 'ink' } }] };
    vfx.draw(behind, { seed: 1, timeMs: 0, inputs: { origin: behindSpot.toArray() as [number, number, number], target: behindSpot.toArray() as [number, number, number] }, faction });
    vfx.draw(behind, { seed: 1, timeMs: 0, inputs: { origin: controlSpot.toArray() as [number, number, number], target: controlSpot.toArray() as [number, number, number] }, faction });
    vfx.draw(spinFx, { seed: 1, timeMs: 500, inputs: { origin: spinSpot.toArray() as [number, number, number], target: spinSpot.toArray() as [number, number, number] }, faction });
    vfx.end();
    renderer.render(scene, camera);
  };
  draw();
  if (target && shown) {
    const px = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1920, 1080)) as Uint8Array;
    const rows = new Uint8ClampedArray(1920 * 1080 * 4);
    // WebGL reads rows from the bottom up; WebGPU from the top down.
    const bottomUp = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true;
    for (let y = 0; y < 1080; y++) {
      const src = (bottomUp ? 1079 - y : y) * 1920 * 4;
      rows.set(px.subarray(src, src + 1920 * 4), y * 1920 * 4);
    }
    const img = new ImageData(rows, 1920, 1080);
    shown.getContext('2d')!.putImageData(img, 0, 0);
  }

  const toPx = (v: Vector3): [number, number] => {
    const p = v.clone().project(camera);
    return [Math.round(((p.x + 1) / 2) * 1920), Math.round(((1 - p.y) / 2) * 1080)];
  };
  roles.forEach((role, i) => {
    const [x, y] = toPx(spots[i]!);
    probes.push({ label: role, x, y, expect: resolveRole(palette, role, faction)! });
  });
  const [hx, hy] = toPx(halfSpot);
  const heat1 = resolveRole(palette, 'heat.1', faction)!;
  probes.push({ label: 'half heat.1 over ground', x: hx, y: hy, expect: canvasBlend(heat1, data.ground.sun, 128 / 255) });
  // The sprite on the ground: probe its lower part (below the anchor), which the ground would cut without the depth pull.
  const low = groundSpot.clone().addScaledVector(camera.up, -0.4);
  const [lx, ly] = toPx(low);
  probes.push({ label: 'lower half of a sprite centred on the ground', x: lx, y: ly, expect: resolveRole(palette, 'ink', faction)! });
  const [bx, by] = toPx(behindSpot);
  probes.push({ label: 'a sprite 1.5 m behind a wall stays hidden', x: bx, y: by, expect: WALL });
  // Turned 45 degrees: a point 0.62 m to the right is inside the diamond (not inside the square it was);
  // a point 0.42 m right and 0.42 m up is inside the square it was, not inside the diamond.
  const [sx1, sy1] = toPx(spinSpot.clone().addScaledVector(camera.getWorldDirection(new Vector3()).cross(camera.up).normalize(), 0.62));
  probes.push({ label: 'a spinning sprite has turned 45 degrees (diamond tip shows)', x: sx1, y: sy1, expect: resolveRole(palette, 'ink', faction)! });
  const right = camera.getWorldDirection(new Vector3()).cross(camera.up).normalize();
  const upv = right.clone().cross(camera.getWorldDirection(new Vector3())).normalize();
  const [sx2, sy2] = toPx(spinSpot.clone().addScaledVector(right, 0.42).addScaledVector(upv, 0.42));
  probes.push({ label: 'a spinning sprite has turned 45 degrees (old corner is empty)', x: sx2, y: sy2, expect: data.ground.sun });
  const [cx2, cy2] = toPx(controlSpot);
  probes.push({ label: 'the same sprite with no wall in front shows', x: cx2, y: cy2, expect: resolveRole(palette, 'ink', faction)! });

  (window as unknown as { __check: unknown }).__check = {
    ready: true,
    backend: (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2',
    probes,
    redraw: draw,
    offscreen,
  };
}

/** What Canvas 2D (the drawing board) shows: blending in sRGB values. */
function canvasBlend(top: string, under: string, alpha: number): string {
  const a = new Color(top), b = new Color(under);
  const t = a.getHex(), u = b.getHex();
  const ch = (h: number, s: number) => (h >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(t, s) * alpha + ch(u, s) * (1 - alpha)));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

main().catch((e) => {
  (window as unknown as { __check: unknown }).__check = { ready: true, error: String(e?.stack ?? e) };
  throw e;
});
