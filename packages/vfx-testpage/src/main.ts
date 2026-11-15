/**
 * The game-side test page. It loads only @shamble/vfx-runtime (and three.js) and an export folder, and plays effects by
 * game event name, the way the game will. It proves the game can use the exported files without the editor.
 *
 * Colour setup: three.js's default, as in the editor: colour management on, blending in linear light, sRGB on screen.
 * The runtime follows ColorManagement.enabled, so a game that turns colour management off gets the palette hexes there too.
 *
 * Address options: ?export=demo-project (a folder in exports/)  &event=rifle.shot  &tier=low|medium|high
 *   &faction=soviets|allies|empire  &by=enemy|team|self  &backend=webgl (WebGL 2 instead of WebGPU)
 *   &offscreen=1 (draw into a texture and copy it to the page: for headless browsers, which cannot show a WebGPU canvas)
 */
import {
  BoxGeometry, Color, Mesh, MeshBasicNodeMaterial, NoColorSpace, PerspectiveCamera, PlaneGeometry, RenderTarget, RGBAFormat,
  RingGeometry, Scene, UnsignedByteType, Vector3, WebGPURenderer,
} from 'three/webgpu';
import {
  applyControls, EffectPlayer, FACTION_IDS, FORMAT_VERSION, loadExport, resolveRole, resolveTimeline, TIER_NAMES, VfxRenderer,
} from '@shamble/vfx-runtime';
import type { EffectFile, EffectInputs, FactionId, LoadedExport, Relation, TierName } from '@shamble/vfx-runtime';

const W = 1920, H = 1080;
const RELATIONS: readonly Relation[] = ['enemy', 'team', 'self'];
const params = new URLSearchParams(location.search);
/** An address option, if it is one of the allowed values. */
function option<T extends string>(name: string, allowed: readonly T[]): T | undefined {
  const v = params.get(name);
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}
const offscreen = params.get('offscreen') === '1';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  export: $<HTMLSelectElement>('export'), event: $<HTMLSelectElement>('event'), play: $<HTMLButtonElement>('play'),
  repeat: $<HTMLInputElement>('repeat'), tier: $<HTMLSelectElement>('tier'), faction: $<HTMLSelectElement>('faction'),
  by: $<HTMLSelectElement>('by'), height: $<HTMLSelectElement>('height'), distance: $<HTMLInputElement>('distance'),
  stage: $<HTMLDivElement>('stage'), status: $<HTMLElement>('status'),
};

// ------------------------------------------------------------------ the game's side of things
// The game camera as the drawing board draws it: 35.3 degrees above the ground, 15 degree lens, turned 45 degrees,
// 100.7 px per metre at 1080p. The game brings its own camera; these are its numbers.
const RAD = Math.PI / 180;
const PITCH = 35.3 * RAD, YAW = 45 * RAD, FOV = 15, PX_PER_M = 100.7;
const CAMERA_DISTANCE = H / 2 / Math.tan((FOV / 2) * RAD) / PX_PER_M;
const GROUND = '#B8A683'; // the sunlit street (Art lead, sheet 17)
const MARK = '#11121A';

/** A ground point from camera-aligned metres: right on screen, and away from the camera. */
function ground(right: number, away: number, height = 0): Vector3 {
  const bx = right * Math.cos(YAW) - away * Math.sin(YAW), by = right * Math.sin(YAW) + away * Math.cos(YAW);
  return new Vector3(bx, height, -by);
}
// Where the test shot comes from and goes to (the board's rifle scene). In the game, the event brings these.
const SHOOTER = new Vector3(-4.27, 0, 1.06);
const MUZZLE_HEIGHT = 1.2;
const TARGET = new Vector3(3.79, 0, -0.6);

function gameCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(FOV, W / H, 1, 400);
  cam.position.set(Math.cos(PITCH) * Math.sin(YAW), Math.sin(PITCH), Math.cos(PITCH) * Math.cos(YAW)).multiplyScalar(CAMERA_DISTANCE);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

const flat = (hex: string) => new MeshBasicNodeMaterial({ color: new Color(hex) });

// ------------------------------------------------------------------ page state
let loaded: LoadedExport | null = null;
let renderer: WebGPURenderer;
let vfx: VfxRenderer | null = null;
let target: RenderTarget | null = null;
let shown: HTMLCanvasElement | null = null;
const scene = new Scene();
const standIns: Mesh[] = [];
const camera = gameCamera();
const player = new EffectPlayer();
let plays = 0;
let paused = false;
let lastEvent = '';
const frameMs: number[] = [];
let copying = false;
let copies: Promise<void> = Promise.resolve();
/** Copies run one after another, so a slow copy from the play loop never lands over a newer picture. */
function queueCopy(): Promise<void> {
  copies = copies.then(copyOut, copyOut);
  return copies;
}

function inputs(): EffectInputs {
  const h = Number(ui.height.value) || 0;
  return {
    origin: [SHOOTER.x, MUZZLE_HEIGHT, SHOOTER.z],
    target: [TARGET.x, h, TARGET.z],
  };
}
const faction = () => ui.faction.value as FactionId;
const relation = () => ui.by.value as Relation;
const distanceM = () => Math.max(0, Number(ui.distance.value) || 0);
const lengthOf = (fx: EffectFile) => resolveTimeline(fx, inputs(), applyControls(fx.controls)).lengthMs;

function setStatus(text: string, bad = false): void {
  ui.status.textContent = text;
  ui.status.classList.toggle('bad', bad);
}

function play(event = ui.event.value): void {
  if (!loaded) return;
  const fx = loaded.effectFor(event);
  if (!fx) { setStatus(`No effect answers the event "${event}".`, true); return; }
  paused = false;
  lastEvent = event;
  player.start(fx.id, { seed: ++plays, inputs: inputs(), faction: faction(), relation: relation(), viewerDistanceM: distanceM(), nowMs: performance.now() });
}

/** Copy the off-screen picture to the page (WebGL reads rows from the bottom up, WebGPU from the top down). */
async function copyOut(): Promise<void> {
  if (!target || !shown) return;
  const px = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H)) as Uint8Array;
  const rows = new Uint8ClampedArray(W * H * 4);
  const bottomUp = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true;
  for (let y = 0; y < H; y++) {
    const src = (bottomUp ? H - 1 - y : y) * W * 4;
    rows.set(px.subarray(src, src + W * 4), y * W * 4);
  }
  shown.getContext('2d')!.putImageData(new ImageData(rows, W, H), 0, 0);
}

function frame(): void {
  if (!loaded || !vfx || paused) return;
  const now = performance.now();
  vfx.tier = ui.tier.value as TierName;
  const t0 = performance.now();
  vfx.begin(camera);
  vfx.drawPlaying(player, now, loaded.lookup);
  vfx.end();
  renderer.render(scene, camera);
  frameMs.push(performance.now() - t0);
  if (frameMs.length > 60) frameMs.shift();
  if (offscreen && !copying) { copying = true; void queueCopy().finally(() => { copying = false; }); }
  if (ui.repeat.checked && player.count === 0 && lastEvent) play(lastEvent);
  if (now - lastStatus > 250) showStats(now);
}

let lastStatus = 0;
function showStats(now: number): void {
  if (!vfx || !loaded) return;
  lastStatus = now;
  const s = vfx.stats;
  const avg = frameMs.reduce((a, b) => a + b, 0) / Math.max(1, frameMs.length);
  const fx = loaded?.effectFor(lastEvent || ui.event.value);
  setStatus(
    `${backendName()}  ·  ${loaded.manifest.name}: ${loaded.events.length} events, effects version ${FORMAT_VERSION}` +
      `  ·  ${fx ? `"${lastEvent || ui.event.value}" plays ${fx.name} (${Math.round(lengthOf(fx))} ms)` : ''}` +
      `  ·  tier ${vfx.tier}: ${s.triangles} triangles, ${s.drawCalls} draws, ${avg.toFixed(2)} ms a frame (CPU, whole frame)`,
  );
}

const backendName = () => ((renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2');

// ------------------------------------------------------------------ loading
async function listExports(): Promise<{ folder: string; name: string }[]> {
  try {
    const res = await fetch('exports/index.json');
    return res.ok ? ((await res.json()) as { folder: string; name: string }[]) : [];
  } catch {
    return [];
  }
}

async function load(folder: string): Promise<void> {
  setStatus(`Loading exports/${folder}/ …`);
  player.clear();
  loaded = await loadExport(`exports/${folder}/`);
  if (!vfx) {
    vfx = new VfxRenderer(loaded.palette, { renderOrder: 1000 });
    scene.add(vfx.object);
  }
  vfx.palette = loaded.palette;
  vfx.setAtlas(loaded.atlas);
  ui.event.replaceChildren(...loaded.events.map((e) => new Option(`${e}  →  ${loaded!.effectFor(e)!.name}`, e)));
  const want = params.get('event') ?? 'rifle.shot';
  if (loaded.events.includes(want)) ui.event.value = want;
  lastEvent = '';
  showStats(performance.now());
}

// ------------------------------------------------------------------ for the browser check
/** Draw one moment of the effect an event plays, alone, and wait until it is on the page. */
async function renderAt(event: string, timeMs: number, o: { tier?: TierName; faction?: FactionId; relation?: Relation; seed?: number; distanceM?: number } = {}) {
  const fx = loaded?.effectFor(event);
  if (!fx || !vfx) throw new Error(`no effect answers "${event}"`);
  paused = true;
  vfx.tier = o.tier ?? 'high';
  const t0 = performance.now();
  vfx.begin(camera);
  vfx.draw(fx, { seed: o.seed ?? 1, timeMs, inputs: inputs(), faction: o.faction ?? faction(), relation: o.relation ?? relation(), viewerDistanceM: o.distanceM ?? distanceM() });
  vfx.end();
  renderer.render(scene, camera);
  const ms = performance.now() - t0;
  await queueCopy();
  return { id: fx.id, lengthMs: lengthOf(fx), ...vfx.stats, ms };
}

/** The exact-colour probe: flat squares of known roles on the ground; their centres must read back as the palette hexes. */
async function probe(f: FactionId = 'allies') {
  const roles = ['heat.1', 'heat.4', 'team', 'glow', 'ink', 'white'];
  if (!vfx || !loaded) throw new Error('nothing is loaded');
  const v = vfx, pal = loaded.palette;
  paused = true;
  for (const m of standIns) m.visible = false;
  v.tier = 'high';
  v.begin(camera);
  const out = roles.map((role, i) => {
    const at = ground(-7.5 + i * 1.6, 4.2);
    const fx: EffectFile = {
      format: 'shamble-vfx', version: FORMAT_VERSION, id: `probe_${i}`, name: `Probe ${role}`,
      controls: { size: 1, intensity: 1, duration: 1, colour: 'heat.2' }, phases: { windupMs: 0, peakMs: 0, fadeMs: 0 },
      layers: [{
        id: 'square', name: 'Square', type: 'sprite', start: { ms: 0 }, timing: { mode: 'smooth' }, tiers: [...TIER_NAMES],
        at: { input: 'origin', offset: [0, 0.6, 0] }, facing: 'camera', blend: 'normal', image: '__white', pivot: [0.5, 0.5],
        sizeM: [1, 1], tint: { mode: 'multiply', role }, durationMs: 1000,
      }],
    };
    v.draw(fx, { seed: 1, timeMs: 10, inputs: { origin: at.toArray(), target: at.toArray() }, faction: f });
    const p = at.clone().setY(0.6).project(camera);
    return { label: role, x: Math.round(((p.x + 1) / 2) * W), y: Math.round(((1 - p.y) / 2) * H), expect: resolveRole(pal, role, f)! };
  });
  v.end();
  renderer.render(scene, camera);
  for (const m of standIns) m.visible = true;
  await queueCopy();
  return out;
}

// ------------------------------------------------------------------ start
async function main(): Promise<void> {
  renderer = new WebGPURenderer({ antialias: true, forceWebGL: params.get('backend') === 'webgl' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  await renderer.init();
  if (offscreen) {
    target = new RenderTarget(W, H, { type: UnsignedByteType, format: RGBAFormat, colorSpace: NoColorSpace, depthBuffer: true, samples: 4 });
    renderer.setOutputRenderTarget(target);
    shown = document.createElement('canvas');
    shown.width = W; shown.height = H;
    ui.stage.appendChild(shown);
  } else {
    ui.stage.appendChild(renderer.domElement);
  }

  scene.background = new Color(GROUND);
  const floor = new Mesh(new PlaneGeometry(200, 200), flat(GROUND));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // Stand-ins: the shooter (a 1.8 m post behind the muzzle) and a ring where the shot lands.
  const away = TARGET.clone().sub(SHOOTER).setY(0).normalize();
  const post = new Mesh(new BoxGeometry(0.45, 1.8, 0.45), flat('#4E5A44'));
  post.position.copy(SHOOTER).addScaledVector(away, -0.45).setY(0.9);
  scene.add(post);
  standIns.push(post);
  const ring = new Mesh(new RingGeometry(0.42, 0.5, 40), flat(MARK));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(TARGET).setY(0.01);
  scene.add(ring);
  standIns.push(ring);

  ui.faction.replaceChildren(...FACTION_IDS.map((f) => new Option(f[0]!.toUpperCase() + f.slice(1), f)));
  ui.faction.value = option('faction', FACTION_IDS) ?? 'allies';
  ui.tier.value = option('tier', TIER_NAMES) ?? 'high';
  ui.by.value = option('by', RELATIONS) ?? 'enemy';

  const list = await listExports();
  const folder = params.get('export') ?? list[0]?.folder ?? 'demo-project';
  const known = list.some((e) => e.folder === folder) ? list : [...list, { folder, name: folder }];
  ui.export.replaceChildren(...known.map((e) => new Option(`${e.name} (exports/${e.folder})`, e.folder)));
  ui.export.value = folder;
  await load(folder);

  ui.play.onclick = () => play();
  ui.event.onchange = () => play();
  ui.export.onchange = () => void load(ui.export.value).catch(fail);
  renderer.setAnimationLoop(frame);
  if (!offscreen && loaded!.events.length) play();

  (window as unknown as { __test: unknown }).__test = {
    ready: true,
    backend: backendName() === 'WebGPU' ? 'webgpu' : 'webgl2',
    name: loaded!.manifest.name,
    events: loaded!.events,
    effectFor: (e: string) => loaded!.effectFor(e)?.id,
    renderAt,
    probe,
    play,
    /** The last off-screen picture as a PNG data URL: exact pixels, 1920 x 1080. */
    snapshot: () => shown?.toDataURL('image/png') ?? '',
  };
}

function fail(e: unknown): void {
  let msg = e instanceof Error ? e.message : String(e);
  if (/manifest\.json \(the server said 404\)/.test(msg)) {
    msg += '. There is no export there yet: make one with "npm run export -- examples/demo-project", or with the Export button in the editor.';
  }
  setStatus(`Could not load: ${msg}`, true);
  (window as unknown as { __test: unknown }).__test = { ready: true, error: msg };
}

main().catch(fail);
