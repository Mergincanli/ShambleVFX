/**
 * The editor: one window with the layers on the left, the live preview in the middle (with the transport and the
 * timeline under it), and one panel on the right. Effects play through vfx-runtime, the code the game ships.
 */
import paletteJson from '@shamble/vfx-format/palette.json';
import { FACTION_IDS, newBurstLayer, newEffect, newShapeLayer, newWordLayer } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Layer, Palette, ShapeKind, ShapeLayer, Vec3 } from '@shamble/vfx-format';
import { checkEffect } from '@shamble/vfx-format/validate';
import type { Problem } from '@shamble/vfx-format/validate';
import { EffectPlayer, applyControls, resolveTimeline } from '@shamble/vfx-runtime';
import type { Relation, Timeline } from '@shamble/vfx-runtime';
import { drawAtlas } from '../atlas/pack';
import type { AtlasImage } from '../atlas/pack';
import {
  addEffect, addLayer, duplicateLayer, effectById, freeEffectId, freeLayerId, moveLayer, newProjectile, newSprite, removeEffect, removeLayer,
  replaceLayer as replaceLayerIn, setEffectValue, setLayerValue,
} from '../doc/edits';
import type { Path } from '../doc/edits';
import { History } from '../doc/history';
import { DevServerStore, StoreError, effectPath, imagePath, readJson, writeJson } from '../io/store';
import type { ProjectContents, ProjectStore } from '../io/store';
import { Preview, SCENES } from '../preview/Preview';
import type { ViewMode } from '../preview/Preview';
import type { AppApi, EditOptions } from './api';
import { h, icon, segmented, selectField } from './dom';
import { buildInspector } from './inspector';
import { buildTimeline } from './timeline';
import type { TimelineView } from './timeline';

const palette = paletteJson as Palette;
const SPEEDS = [1, 0.5, 0.25, 0.1];
const LOOP_REST_MS = 300;
const LAST_PROJECT = 'vfx-last-project';
const SHAPE_KINDS: ShapeKind[] = ['shards', 'flash', 'cloud', 'smoke', 'ring', 'dots', 'scorch', 'lines', 'glow', 'trail', 'band', 'beads', 'flames', 'bed'];
const SHAPE_TEXT: Record<ShapeKind, string> = {
  shards: 'star of shards', flash: 'muzzle flash', cloud: 'cloud blast', smoke: 'smoke', ring: 'ring', dots: 'halftone dots', scorch: 'scorch mark',
  lines: 'speed lines', glow: 'glow', trail: 'trail behind a projectile', band: 'beam', beads: 'beads along a beam', flames: 'flame tongues', bed: 'fire bed',
};

export class App implements AppApi {
  readonly palette = palette;
  faction: FactionId = 'soviets';
  private store: ProjectStore = new DevServerStore();
  private history = new History({ effects: [] });
  private project: ProjectContents | null = null;
  private images = new Map<string, { bitmap: ImageBitmap; url: string }>();
  private effectsOnDisk = new Set<string>();
  private selEffect: string | null = null;
  private selLayer: string | null = null;
  private preview!: Preview;
  private inspector!: ReturnType<typeof buildInspector>;
  private timelineView!: TimelineView;
  private player = new EffectPlayer();
  private playing = false;
  private loop = true;
  private speed = 1;
  private mainTime = 0;
  private clock = 0;
  private seed = 1;
  private lastFrame = 0;
  private timelineCache: { fx: EffectFile; where: string; tl: Timeline } | null = null;
  private problemCache: { fx: EffectFile | undefined; images: number; list: Problem[] } | null = null;
  private els!: {
    root: HTMLElement; projectName: HTMLElement; save: HTMLButtonElement; undo: HTMLButtonElement; redo: HTMLButtonElement;
    effects: HTMLElement; layers: HTMLElement; viewport: HTMLElement; play: HTMLButtonElement; time: HTMLElement; stats: HTMLElement;
    backend: HTMLElement; status: HTMLElement; dialog: HTMLDialogElement;
  };
  private factionCtl!: ReturnType<typeof segmented<FactionId>>;
  private viewCtl!: ReturnType<typeof segmented<ViewMode>>;
  private closeCtl!: ReturnType<typeof segmented<'origin' | 'target'>>;
  private sceneCtl!: ReturnType<typeof selectField>;
  private relationCtl!: ReturnType<typeof segmented<Relation>>;
  private distanceBox!: { el: HTMLElement; set(v: number): void };
  /** The preview scene each effect was last shown in (kept in project.json, under "preview"). */
  private previewScenes: Record<string, string> = {};
  private projectMeta: Record<string, unknown> = {};
  private metaDirty = false;
  private speedCtl!: ReturnType<typeof segmented<number>>;
  private loopBtn!: HTMLButtonElement;

  static async start(root: HTMLElement): Promise<App> {
    const app = new App();
    await app.boot(root);
    return app;
  }

  // ---------------------------------------------------------------- AppApi

  effect(): EffectFile | undefined {
    return this.selEffect ? effectById(this.history.doc, this.selEffect) : undefined;
  }

  layer(): Layer | undefined {
    return this.effect()?.layers.find((l) => l.id === this.selLayer);
  }

  selectLayer(id: string | null): void {
    this.selLayer = id;
    this.renderLayers();
    this.inspector.refresh();
    this.timelineView.refresh();
  }

  imageNames(): string[] {
    return [...this.images.keys()].sort();
  }

  imageUrl(name: string): string | undefined {
    return this.images.get(name)?.url;
  }

  editEffect(path: Path, value: unknown, opts: EditOptions = {}): void {
    if (!this.selEffect) return;
    this.history.apply(opts.label ?? 'Edit', setEffectValue(this.history.doc, this.selEffect, path, value), { mergeKey: opts.mergeKey && `${this.selEffect}:${opts.mergeKey}` });
  }

  editLayer(path: Path, value: unknown, opts: EditOptions = {}): void {
    if (!this.selEffect || !this.selLayer) return;
    this.history.apply(opts.label ?? 'Edit', setLayerValue(this.history.doc, this.selEffect, this.selLayer, path, value), { mergeKey: opts.mergeKey && `${this.selEffect}:${this.selLayer}:${opts.mergeKey}` });
  }

  replaceLayer(layer: Layer, label: string): void {
    if (!this.selEffect) return;
    this.history.apply(label, replaceLayerIn(this.history.doc, this.selEffect, layer));
  }

  commit(): void {
    this.history.endGesture();
  }

  timeline(): Timeline | undefined {
    const fx = this.effect();
    if (!fx) return undefined;
    const o = this.preview.origin, t = this.preview.target;
    const where = [o.x, o.y, o.z, t.x, t.z].join('|');
    // Effects are never changed in place, so the same object means the same effect.
    if (this.timelineCache?.fx !== fx || this.timelineCache.where !== where) {
      this.timelineCache = { fx, where, tl: resolveTimeline(fx, this.inputs(), applyControls(fx.controls)) };
    }
    return this.timelineCache.tl;
  }

  problems(): Problem[] {
    const fx = this.effect();
    if (this.problemCache && this.problemCache.fx === fx && this.problemCache.images === this.images.size) return this.problemCache.list;
    const r = fx ? checkEffect(fx, { palette, images: this.images.keys() }) : null;
    const list = r && !r.ok ? r.problems : [];
    this.problemCache = { fx, images: this.images.size, list };
    return list;
  }

  async importImages(): Promise<void> {
    if (!this.project) return;
    if (!this.project.writable) {
      this.say('This is an example project, so it cannot change. Use "Save as" to make your own copy first.', true);
      return;
    }
    const input = h('input', { attrs: { type: 'file', accept: 'image/png', multiple: '' } });
    input.addEventListener('change', async () => {
      const files = [...(input.files ?? [])];
      for (const f of files) {
        const name = f.name.replace(/[^A-Za-z0-9 _.-]/g, '_');
        try {
          await this.store.write(this.project!.id, imagePath(name.endsWith('.png') ? name : `${name}.png`), f);
        } catch (e) {
          this.say(`Could not add ${f.name}: ${(e as Error).message}`, true);
        }
      }
      await this.loadImages();
      this.say(`Added ${files.length} image${files.length === 1 ? '' : 's'}.`);
    });
    input.click();
  }

  // ---------------------------------------------------------------- start up

  private async boot(root: HTMLElement): Promise<void> {
    const params = new URLSearchParams(location.search);
    this.buildShell(root);
    this.preview = await Preview.create({
      container: this.els.viewport, palette, backend: params.get('backend') === 'webgl' ? 'webgl' : 'auto', offscreen: params.get('offscreen') === '1',
    });
    this.preview.onTargetMoved = () => { this.timelineView.refresh(); this.inspector.refresh(); this.distanceBox.set(this.preview.viewerDistanceM); };
    this.distanceBox.set(this.preview.viewerDistanceM);
    // ?frame=1 shows only the game screen at its real size: for screenshots of what a player sees.
    if (params.get('frame') === '1') { document.body.classList.add('frame-only'); this.preview.setView('frame'); }
    this.els.backend.textContent = this.preview.backendName;
    this.els.backend.title = this.preview.backendName === 'WebGPU'
      ? 'Drawing with the WebGPU renderer. Add ?backend=webgl to the address to try the WebGL 2 fallback.'
      : 'Drawing with the WebGL 2 fallback of the WebGPU renderer.';
    this.inspector = buildInspector(this);
    root.querySelector('.right')!.append(this.inspector.el);
    this.timelineView = buildTimeline(this, (ms, done) => this.scrub(ms, done));
    root.querySelector('.timeline-slot')!.append(this.timelineView.el);
    this.history.subscribe((why) => this.onDocChange(why));
    this.bindKeys();
    window.addEventListener('beforeunload', (e) => { if (this.history.dirty) e.preventDefault(); });

    let opened = false;
    const want = params.get('project') ?? (() => { try { return localStorage.getItem(LAST_PROJECT); } catch { return null; } })();
    try {
      if (want) opened = await this.openProject(want, true);
      if (!opened) opened = await this.openProject('examples/demo-project', true);
    } catch (e) {
      this.say(`Could not open a project: ${(e as Error).message}`, true);
    }
    const fxParam = params.get('effect');
    if (fxParam && effectById(this.history.doc, fxParam)) this.selectEffect(fxParam);
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private buildShell(root: HTMLElement): void {
    const projectName = h('span', { class: 'project-name' });
    const save = h('button', { class: 'tb', attrs: { type: 'button' }, title: 'Save (Ctrl+S)', text: 'Save', on: { click: () => void this.save() } });
    const undo = h('button', { class: 'tb icon-only', attrs: { type: 'button', 'aria-label': 'Undo' }, title: 'Undo (Ctrl+Z)', on: { click: () => this.history.undo() } }, icon('undo'));
    const redo = h('button', { class: 'tb icon-only', attrs: { type: 'button', 'aria-label': 'Redo' }, title: 'Redo (Ctrl+Shift+Z)', on: { click: () => this.history.redo() } }, icon('redo'));
    const backend = h('span', { class: 'badge' });
    const status = h('div', { class: 'status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const dialog = h('dialog', { class: 'dlg' });
    const top = h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('b', { text: 'Shamble' }), h('span', { text: 'VFX' })),
      h('div', { class: 'project' }, projectName,
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Projects…', on: { click: () => void this.projectsDialog() } }),
        save,
        h('button', { class: 'tb save-as', attrs: { type: 'button' }, text: 'Save as…', on: { click: () => void this.saveAsDialog() } })),
      h('div', { class: 'tools' }, undo, redo, backend,
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Keys', title: 'Keyboard shortcuts', on: { click: () => this.keysDialog() } })));

    const effects = h('div', { class: 'list effects-list' });
    const layers = h('div', { class: 'list layers-list' });
    const addMenu = h('select', { class: 'add-layer', attrs: { 'aria-label': 'Add a layer', title: 'Add a layer' } },
      h('option', { attrs: { value: '' }, text: '＋ Add…' }),
      h('option', { attrs: { value: 'sprite' }, text: 'Sprite (an image)' }),
      h('option', { attrs: { value: 'projectile' }, text: 'Projectile (a path in flight)' }),
      ...SHAPE_KINDS.map((k) => h('option', { attrs: { value: `shape:${k}` }, text: `Shape: ${SHAPE_TEXT[k]}` })),
      h('option', { attrs: { value: 'burst' }, text: 'Burst (pieces thrown out)' }),
      h('option', { attrs: { value: 'word' }, text: 'Word (a comic sound)' }));
    addMenu.addEventListener('change', () => { const v = addMenu.value; addMenu.value = ''; if (v) this.addLayer(v); });
    const left = h('aside', { class: 'left' },
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Effects' }),
        h('button', { class: 'mini', attrs: { type: 'button' }, title: 'New effect', on: { click: () => this.newEffect() } }, icon('plus'), 'New'),
        h('button', { class: 'mini', attrs: { type: 'button' }, title: 'A copy of a ready-made effect: the drawing board\'s four, and the comic hits', on: { click: () => void this.presetDialog() } }, 'From preset…')), effects),
      h('section', { class: 'card grow' }, h('div', { class: 'card-head' }, h('h2', { text: 'Layers' }), h('span', { class: 'hint', text: 'top draws on top' })),
        h('div', { class: 'layer-tools' },
          addMenu),
        layers,
        h('div', { class: 'layer-tools' },
          h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Move up' }, title: 'Move up (draws over more)', on: { click: () => this.moveSelected(1) } }, icon('up')),
          h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Move down' }, title: 'Move down', on: { click: () => this.moveSelected(-1) } }, icon('down')),
          h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Duplicate' }, title: 'Duplicate', on: { click: () => this.duplicateSelected() } }, icon('copy')),
          h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Delete layer' }, title: 'Delete layer (Del)', on: { click: () => this.deleteSelected() } }, icon('trash')))));

    this.factionCtl = segmented<FactionId>({ label: 'Faction that fired', options: FACTION_IDS.map((f) => ({ value: f, label: palette.factions[f].name })), value: this.faction,
      onChange: (f) => { this.faction = f; this.preview.setFaction(f); this.factionCtl.set(f); this.inspector.refresh(); }, small: true });
    this.viewCtl = segmented<ViewMode>({ label: 'View', options: [{ value: 'whole', label: 'Whole screen' }, { value: 'game', label: 'Game size' }, { value: 'close', label: 'Close-up' }],
      value: 'whole', onChange: (v) => { this.preview.setView(v); this.viewCtl.set(v); }, small: true });
    this.closeCtl = segmented<'origin' | 'target'>({ label: 'Close-up on', options: [{ value: 'origin', label: 'Muzzle' }, { value: 'target', label: 'Target' }], value: 'target',
      onChange: (v) => { this.preview.setCloseOn(v); this.closeCtl.set(v); }, small: true });
    this.sceneCtl = selectField({ label: 'Scene', options: SCENES.map((x) => ({ value: x.id, label: x.name })), value: SCENES[0]!.id,
      onChange: (id) => this.chooseScene(id) });
    this.relationCtl = segmented<Relation>({ label: 'Made by', small: true, value: 'enemy',
      options: [{ value: 'enemy', label: 'Enemy', title: 'An enemy made it: comic outlines in ink' }, { value: 'team', label: 'Your team', title: 'Your team made it: thin broken outlines' }, { value: 'self', label: 'You', title: 'You made it: your own words show' }],
      onChange: (r) => { this.preview.setRelation(r); this.relationCtl.set(r); } });
    this.distanceBox = distanceControl((m) => { this.preview.setDistance(m); this.timelineView.refresh(); });
    const fire = h('button', { class: 'fire', attrs: { type: 'button' }, title: 'Fire from the shooter to the target (F)', on: { click: () => this.fire() } }, icon('fire'), 'Fire');
    const stats = h('span', { class: 'stats' });
    const viewport = h('div', { class: 'viewport' });
    const vbar = h('div', { class: 'vbar' }, fire, this.sceneCtl.el, this.factionCtl.el, this.relationCtl.el, this.distanceBox.el, this.viewCtl.el, this.closeCtl.el, stats);
    const hint = h('div', { class: 'vhint', text: 'Drag on the ground to move the target. Shift + drag moves the stand-in.' });

    const play = h('button', { class: 'play', attrs: { type: 'button' }, title: 'Play / pause (Space)', on: { click: () => this.togglePlay() } }, icon('play'), 'Play');
    this.loopBtn = h('button', { class: 'tb', attrs: { type: 'button', 'aria-pressed': 'true' }, title: 'Loop (L)', on: { click: () => this.setLoop(!this.loop) } }, icon('loop'), 'Loop');
    this.speedCtl = segmented<number>({ label: 'Speed', options: SPEEDS.map((s) => ({ value: s, label: s === 1 ? '1×' : s === 0.5 ? '½×' : s === 0.25 ? '¼×' : '⅒×' })), value: 1,
      onChange: (s) => { this.speed = s; this.speedCtl.set(s); }, small: true });
    const time = h('span', { class: 'time' });
    const transport = h('div', { class: 'transport' },
      h('button', { class: 'tb icon-only', attrs: { type: 'button', 'aria-label': 'Step back' }, title: 'One step back (←)', on: { click: () => this.step(-1) } }, icon('step-back')),
      play,
      h('button', { class: 'tb icon-only', attrs: { type: 'button', 'aria-label': 'Step forward' }, title: 'One step forward (→)', on: { click: () => this.step(1) } }, icon('step-fwd')),
      this.loopBtn, this.speedCtl.el, time);

    const centre = h('main', { class: 'centre' }, vbar, h('div', { class: 'viewport-wrap' }, viewport, hint), transport, h('div', { class: 'timeline-slot' }));
    const right = h('div', { class: 'right' });
    root.append(top, h('div', { class: 'workspace' }, left, centre, right), status, dialog);
    this.els = { root, projectName, save, undo, redo, effects, layers, viewport, play, time, stats, backend, status, dialog };
  }

  // ---------------------------------------------------------------- projects

  private async openProject(id: string, quiet = false): Promise<boolean> {
    if (this.history.dirty && !confirm('You have changes that are not saved. Open another project anyway?')) return false;
    let contents: ProjectContents;
    try {
      contents = await this.store.open(id);
    } catch (e) {
      if (!quiet) this.say(`Could not open the project: ${(e as Error).message}`, true);
      return false;
    }
    this.project = contents;
    try { localStorage.setItem(LAST_PROJECT, id); } catch { /* ignore */ }
    await this.readProjectMeta();
    await this.loadImages();
    const effects: EffectFile[] = [];
    const bad: string[] = [];
    for (const file of contents.effects) {
      try {
        const raw = await readJson(this.store, id, `effects/${file}`);
        const r = checkEffect(raw, { palette, images: this.images.keys() });
        if (r.ok && r.effect) effects.push(r.effect);
        else {
          // Keep a file that parses but has problems (for example a missing image), so it can be fixed here.
          // Always keep the upgraded copy, never the old file as it was read.
          if (r.effect) effects.push(r.effect);
          bad.push(`${file}: ${r.problems.map((p) => `${p.path} ${p.message}`).slice(0, 3).join('; ')}`);
        }
      } catch (e) {
        bad.push(`${file}: ${(e as Error).message}`);
      }
    }
    this.effectsOnDisk = new Set(effects.map((e) => e.id));
    this.history.reset({ effects });
    this.player.clear();
    this.selEffect = effects[0]?.id ?? null;
    this.selLayer = null;
    this.mainTime = 0;
    // Show the first effect in the scene it remembers.
    const scene = this.sceneOf(this.selEffect);
    if (this.preview && this.preview.scene.id !== scene) { this.preview.setScene(scene); this.distanceBox?.set(this.preview.viewerDistanceM); }
    this.sceneCtl?.set(scene);
    this.renderAll();
    this.say(bad.length ? `Opened ${contents.name}, with problems: ${bad.join(' | ')}` : `Opened ${contents.name}${contents.writable ? '' : ' (an example: use "Save as" to keep changes)'}.`, bad.length > 0);
    return true;
  }

  /** project.json: the name, and which preview scene each effect is shown in. */
  private async readProjectMeta(): Promise<void> {
    this.projectMeta = {};
    this.previewScenes = {};
    this.metaDirty = false;
    try {
      const meta = await readJson(this.store, this.project!.id, 'project.json');
      if (meta && typeof meta === 'object') this.projectMeta = meta as Record<string, unknown>;
      const pv = this.projectMeta.preview;
      if (pv && typeof pv === 'object') {
        for (const [fx, v] of Object.entries(pv as Record<string, { scene?: unknown }>)) {
          if (v && typeof v.scene === 'string' && SCENES.some((x) => x.id === v.scene)) this.previewScenes[fx] = v.scene;
        }
      }
    } catch { /* a project without a readable project.json still opens */ }
  }

  /** Show the chosen scene, and remember it for the effect shown. */
  private chooseScene(id: string): void {
    if (!this.preview.setScene(id)) return;
    this.sceneCtl.set(id);
    if (this.selEffect && this.previewScenes[this.selEffect] !== id) {
      this.previewScenes[this.selEffect] = id;
      this.metaDirty = true;
      this.renderTopbar();
    }
    this.distanceBox.set(this.preview.viewerDistanceM);
    this.timelineView.refresh();
    this.inspector.refresh();
  }

  /** The scene an effect remembers, or the street. */
  private sceneOf(effectId: string | null): string {
    return (effectId && this.previewScenes[effectId]) || SCENES[0]!.id;
  }

  private async loadImages(): Promise<void> {
    if (!this.project) return;
    const listing = await this.store.open(this.project.id);
    this.project = listing;
    for (const v of this.images.values()) URL.revokeObjectURL(v.url);
    this.images.clear();
    for (const im of listing.images) {
      try {
        const blob = await this.store.read(listing.id, imagePath(im.name));
        const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        this.images.set(im.name, { bitmap, url: URL.createObjectURL(blob) });
      } catch (e) {
        this.say(`Could not read ${im.name}: ${(e as Error).message}`, true);
      }
    }
    const list: AtlasImage[] = [...this.images].map(([name, v]) => ({ name, image: v.bitmap, width: v.bitmap.width, height: v.bitmap.height }));
    this.preview.setAtlas(drawAtlas(list));
    this.problemCache = null;
    this.inspector?.refresh();
  }

  private async save(): Promise<void> {
    if (!this.project) return;
    if (!this.project.writable) { await this.saveAsDialog(); return; }
    await this.writeEffects(this.project.id);
  }

  private async writeEffects(projectId: string): Promise<void> {
    try {
      const doc = this.history.doc;
      for (const fx of doc.effects) await writeJson(this.store, projectId, effectPath(fx.id), fx);
      for (const id of this.effectsOnDisk) if (!doc.effects.some((e) => e.id === id)) await this.store.remove(projectId, effectPath(id));
      this.effectsOnDisk = new Set(doc.effects.map((e) => e.id));
      if (this.metaDirty || projectId !== this.project?.id) {
        const preview: Record<string, { scene: string }> = {};
        for (const fx of doc.effects) if (this.previewScenes[fx.id]) preview[fx.id] = { scene: this.previewScenes[fx.id]! };
        const name = projectId === this.project?.id ? (this.projectMeta.name ?? this.project?.name) : undefined;
        const current = projectId === this.project?.id ? this.projectMeta : await readJson(this.store, projectId, 'project.json').catch(() => ({}));
        const meta = { ...(current as Record<string, unknown>), ...(name ? { name } : {}), preview };
        await writeJson(this.store, projectId, 'project.json', meta);
        if (projectId === this.project?.id) this.projectMeta = meta;
        this.metaDirty = false;
      }
      this.history.markSaved();
      this.say(`Saved ${doc.effects.length} effect${doc.effects.length === 1 ? '' : 's'} to ${projectId}.`);
    } catch (e) {
      this.say(`Saving failed: ${(e as Error).message}`, true);
    }
  }

  private async saveAsDialog(): Promise<void> {
    if (!this.project) return;
    const name = await this.ask('Save as', 'A name for your copy of this project. It goes in the projects folder (kept out of git).', `${this.project.name} copy`);
    if (!name) return;
    try {
      const copy = await this.store.copy(this.project.id, 'projects', name);
      const doc = this.history.doc;
      this.project = await this.store.open(copy.id);
      // The copy's project.json is fresh (its own name, no scenes): start from it, and write the scenes into it.
      try { this.projectMeta = (await readJson(this.store, copy.id, 'project.json')) as Record<string, unknown>; } catch { this.projectMeta = { name: copy.name }; }
      this.metaDirty = true;
      // The copy holds every effect file the original had, deleted ones too: list them, so saving removes those.
      this.effectsOnDisk = new Set(this.project.effects.map((f) => f.replace(/\.vfx\.json$/, '')));
      await this.writeEffects(copy.id);
      try { localStorage.setItem(LAST_PROJECT, copy.id); } catch { /* ignore */ }
      this.history.reset(doc);
      this.history.markSaved();
      this.renderAll();
      this.say(`Saved as ${copy.name} in projects/.`);
    } catch (e) {
      this.say(`Save as failed: ${(e as Error).message}`, true);
    }
  }

  /** Ready-made effects: every effect in the example projects. Picking one copies it into this project. */
  private async presetDialog(): Promise<void> {
    if (!this.project) return;
    let listing;
    try { listing = await this.store.list(); } catch (e) { this.say((e as Error).message, true); return; }
    const d = this.els.dialog;
    const groups: HTMLElement[] = [];
    for (const p of listing.projects.filter((x) => !x.writable)) {
      let contents: ProjectContents;
      try { contents = await this.store.open(p.id); } catch { continue; }
      let scenes: Record<string, { scene?: string }> = {};
      try { scenes = ((await readJson(this.store, p.id, 'project.json')) as { preview?: typeof scenes }).preview ?? {}; } catch { /* no scenes */ }
      const items: HTMLElement[] = [];
      for (const file of contents.effects) {
        let fx: EffectFile | undefined;
        try { fx = checkEffect(await readJson(this.store, p.id, `effects/${file}`), { palette }).effect; } catch { fx = undefined; }
        if (!fx) continue;
        const preset = fx, scene = scenes[fx.id]?.scene;
        items.push(h('li', {}, h('button', { class: 'linkish', attrs: { type: 'button' }, text: fx.name, on: { click: () => { d.close(); this.addFromPreset(preset, scene); } } }),
          h('span', { class: 'hint', text: ` ${fx.layers.length} layers` })));
      }
      if (items.length) groups.push(h('h3', { text: p.name }), h('ul', { class: 'plist' }, ...items));
    }
    d.replaceChildren(h('h2', { text: 'New from preset' }), h('p', { class: 'hint', text: 'A copy goes into this project; the preset itself stays as it is.' }), ...groups,
      h('div', { class: 'dlg-buttons' }, h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Close', on: { click: () => d.close() } })));
    d.showModal();
  }

  private addFromPreset(preset: EffectFile, scene?: string): void {
    const id = freeEffectId(this.history.doc, preset.id);
    const fx: EffectFile = { ...structuredClone(preset), id, name: id === preset.id ? preset.name : `${preset.name} (copy)` };
    this.history.apply('New from preset', addEffect(this.history.doc, fx));
    if (scene && SCENES.some((x) => x.id === scene)) { this.previewScenes[id] = scene; this.metaDirty = true; }
    this.selectEffect(id);
    this.say(`Added "${fx.name}" from the presets.`);
  }

  private async projectsDialog(): Promise<void> {
    let listing;
    try { listing = await this.store.list(); } catch (e) { this.say((e as Error).message, true); return; }
    const d = this.els.dialog;
    const rows = listing.projects.map((p) => h('li', {},
      h('button', { class: 'linkish', attrs: { type: 'button' }, text: p.name, on: { click: () => { d.close(); void this.openProject(p.id); } } }),
      h('span', { class: 'hint', text: ` ${p.id}${p.writable ? '' : ' · example, read-only'}` })));
    d.replaceChildren(
      h('h2', { text: 'Projects' }),
      h('ul', { class: 'plist' }, ...rows),
      h('div', { class: 'dlg-buttons' },
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'New project…', on: { click: async () => {
          d.close();
          const name = await this.ask('New project', 'A name for the project. It goes in the projects folder (kept out of git).', 'My effects');
          if (!name) return;
          try { const p = await this.store.create('projects', name); await this.openProject(p.id); } catch (e) { this.say((e as Error).message, true); }
        } } }),
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Close', on: { click: () => d.close() } })));
    d.showModal();
  }

  private ask(title: string, text: string, value: string): Promise<string | null> {
    const d = this.els.dialog;
    return new Promise((resolve) => {
      const input = h('input', { class: 'text', attrs: { type: 'text', value, maxlength: '60' } });
      const done = (v: string | null) => { d.close(); resolve(v); };
      d.replaceChildren(h('h2', { text: title }), h('p', { text }), input,
        h('div', { class: 'dlg-buttons' },
          h('button', { class: 'tb primary', attrs: { type: 'button' }, text: 'OK', on: { click: () => done(input.value.trim() || null) } }),
          h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Cancel', on: { click: () => done(null) } })));
      d.onkeydown = (e) => { if (e.key === 'Enter') done(input.value.trim() || null); };
      d.showModal();
      input.select();
    });
  }

  private keysDialog(): void {
    const d = this.els.dialog;
    const keys: [string, string][] = [
      ['Space', 'Play or pause'], ['F', 'Fire from the stand-in to the target'], ['← / →', 'One step back or forward (1/12 s)'],
      ['L', 'Loop on or off'], ['1 / 2 / 3', 'Whole screen / game size / close-up'], ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z or Ctrl+Y', 'Redo'],
      ['Ctrl+S', 'Save'], ['Delete', 'Delete the selected layer'], ['Drag on the ground', 'Move the target'], ['Shift + drag', 'Move the stand-in'],
    ];
    d.replaceChildren(h('h2', { text: 'Keys' }), h('table', { class: 'keys' }, ...keys.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: v })))),
      h('div', { class: 'dlg-buttons' }, h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Close', on: { click: () => d.close() } })));
    d.showModal();
  }

  // ---------------------------------------------------------------- effects and layers

  private selectEffect(id: string): void {
    this.selEffect = id;
    this.selLayer = null;
    this.mainTime = 0;
    const scene = this.sceneOf(id);
    if (this.preview && this.preview.scene.id !== scene) {
      this.preview.setScene(scene);
      this.distanceBox.set(this.preview.viewerDistanceM);
    }
    this.sceneCtl?.set(scene);
    this.renderAll();
  }

  private newEffect(): void {
    const id = freeEffectId(this.history.doc, 'new_effect');
    const fx = newEffect(id, 'New effect');
    this.history.apply('New effect', addEffect(this.history.doc, fx));
    this.selectEffect(id);
  }

  /** Add a layer: 'sprite', 'projectile', 'shape:<kind>', 'burst' or 'word'. */
  private addLayer(kind: string): void {
    const fx = this.effect();
    if (!fx) return;
    const image = this.imageNames().find((n) => n !== 'white.png') ?? this.imageNames()[0] ?? 'white.png';
    let layer: Layer;
    if (kind === 'sprite') layer = newSprite(fx, image);
    else if (kind === 'projectile') layer = newProjectile(fx);
    else if (kind.startsWith('shape:')) {
      const k = kind.slice(6) as ShapeKind;
      const id = freeLayerId(fx, k);
      layer = newShapeLayer(id, SHAPE_TEXT[k].replace(/^./, (c) => c.toUpperCase()), k);
      // A trail rides a projectile: on the newest one, or a new one made for it.
      if (k === 'trail') {
        let p: Layer | undefined = [...fx.layers].reverse().find((l) => l.type === 'projectile');
        if (!p) { p = newProjectile(fx); this.history.apply('Add projectile', addLayer(this.history.doc, fx.id, p, this.selLayer ?? undefined)); }
        layer = { ...(layer as ShapeLayer), at: { layer: p.id } };
        delete (layer as Partial<ShapeLayer>).durationMs;
      }
    } else if (kind === 'burst') layer = newBurstLayer(freeLayerId(fx, 'burst'), 'Burst');
    else layer = newWordLayer(freeLayerId(fx, 'word'), 'Word');
    this.history.apply(`Add ${layer.type}`, addLayer(this.history.doc, fx.id, layer, this.selLayer ?? undefined));
    this.selectLayer(layer.id);
  }

  private moveSelected(delta: number): void {
    if (this.selEffect && this.selLayer) this.history.apply('Move layer', moveLayer(this.history.doc, this.selEffect, this.selLayer, delta));
  }

  private duplicateSelected(): void {
    if (!this.selEffect || !this.selLayer) return;
    const r = duplicateLayer(this.history.doc, this.selEffect, this.selLayer);
    this.history.apply('Duplicate layer', r.doc);
    if (r.id) this.selectLayer(r.id);
  }

  private deleteSelected(): void {
    if (!this.selEffect || !this.selLayer) return;
    const fx = this.effect()!;
    const i = fx.layers.findIndex((l) => l.id === this.selLayer);
    this.history.apply('Delete layer', removeLayer(this.history.doc, this.selEffect, this.selLayer));
    const after = this.effect()!.layers;
    this.selectLayer(after[Math.min(i, after.length - 1)]?.id ?? null);
  }

  private deleteEffect(id: string): void {
    if (!confirm('Delete this effect? (Undo brings it back until you leave.)')) return;
    this.history.apply('Delete effect', removeEffect(this.history.doc, id));
    this.selEffect = this.history.doc.effects[0]?.id ?? null;
    this.selLayer = null;
    this.renderAll();
  }

  private onDocChange(why: 'edit' | 'undo' | 'redo' | 'reset'): void {
    // Undo can bring back or take away the selected effect or layer.
    if (this.selEffect && !this.effect()) this.selEffect = this.history.doc.effects[0]?.id ?? null;
    if (this.selLayer && !this.layer()) this.selLayer = null;
    this.problemCache = null;
    this.renderEffects();
    this.renderLayers();
    this.inspector.refresh();
    this.timelineView.refresh();
    this.renderTopbar();
    if (why === 'undo' || why === 'redo') this.say(`${why === 'undo' ? 'Undid' : 'Redid'}.`);
  }

  // ---------------------------------------------------------------- playback

  private inputs(): { origin: Vec3; target: Vec3 } {
    const o = this.preview.origin, t = this.preview.target;
    return { origin: [o.x, o.y, o.z], target: [t.x, t.y, t.z] };
  }

  private togglePlay(): void {
    const len = this.timeline()?.lengthMs ?? 0;
    if (!this.playing && this.mainTime >= len) this.mainTime = 0;
    this.playing = !this.playing;
    this.renderTransport();
  }

  private setLoop(v: boolean): void {
    this.loop = v;
    this.loopBtn.setAttribute('aria-pressed', String(v));
  }

  private step(dir: number): void {
    this.playing = false;
    // After Fire, the playhead is not on the timeline (only fired effects were playing): start from 0.
    if (!Number.isFinite(this.mainTime)) { this.mainTime = 0; this.player.clear(); }
    const stepMs = 1000 / 12;
    const n = Math.round(this.mainTime / stepMs) + dir;
    this.mainTime = Math.max(0, Math.min(this.timeline()?.lengthMs ?? 0, n * stepMs));
    this.renderTransport();
  }

  /** Scrub: pause and show the moment ms (done = the drag ended). */
  private scrub(ms: number, done: boolean): void {
    if (done) return;
    this.playing = false;
    this.mainTime = ms;
    this.renderTransport();
  }

  /** Fire: start the effect from the stand-in to the target, as the game would on a shot. */
  private fire(): void {
    const fx = this.effect();
    if (!fx) return;
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    this.player.start(fx.id, { seed: this.seed, inputs: this.inputs(), faction: this.faction, nowMs: this.clock, relation: this.preview.relation, viewerDistanceM: this.preview.viewerDistanceM });
    if (!this.playing) { this.playing = true; this.mainTime = Number.POSITIVE_INFINITY; }
    this.renderTransport();
  }

  private async frame(now: number): Promise<void> {
    // Real time since the last frame, capped so a hidden tab coming back does not jump the effect.
    const dt = Math.min(100, Math.max(0, now - this.lastFrame));
    this.lastFrame = now;
    const fx = this.effect();
    const len = this.timeline()?.lengthMs ?? 0;
    if (this.playing) {
      this.clock += dt * this.speed;
      if (Number.isFinite(this.mainTime)) {
        this.mainTime += dt * this.speed;
        if (this.mainTime >= len) {
          if (this.loop) this.mainTime = -LOOP_REST_MS;
          else { this.mainTime = len; this.playing = this.player.count > 0; }
        }
      } else if (this.player.count === 0) {
        // Only fired effects were playing, and they are done.
        this.playing = false;
        this.mainTime = 0;
      }
    }
    const lookup = (id: string) => effectById(this.history.doc, id);
    // An effect the schema refuses (a value typed out of range) is not drawn until it is fixed: the checks panel says why.
    const drawable = fx && !this.problems().some((p) => p.kind === 'schema' || p.kind === 'format' || p.kind === 'version');
    await this.preview.render((vfx) => {
      if (fx && drawable && Number.isFinite(this.mainTime) && this.mainTime >= 0) {
        vfx.draw(fx, { seed: this.seed, timeMs: this.mainTime, inputs: this.inputs(), faction: this.faction, relation: this.preview.relation, viewerDistanceM: this.preview.viewerDistanceM });
      }
      vfx.drawPlaying(this.player, this.clock, lookup);
    });
    const s = this.preview.vfx.stats;
    this.els.stats.textContent = `${s.triangles} triangle${s.triangles === 1 ? '' : 's'} · ${s.drawCalls} draw call${s.drawCalls === 1 ? '' : 's'}`;
    this.renderTime(len);
    if (!(window as unknown as { __vfxManual?: boolean }).__vfxManual) requestAnimationFrame((t) => void this.frame(t));
  }

  // ---------------------------------------------------------------- drawing the panels

  private renderAll(): void {
    this.renderTopbar();
    this.renderEffects();
    this.renderLayers();
    this.inspector?.rebuild();
    this.timelineView?.refresh();
    this.renderTransport();
  }

  private renderTopbar(): void {
    const p = this.project;
    const dirty = this.history.dirty || this.metaDirty;
    this.els.projectName.textContent = p ? `${p.name}${dirty ? ' •' : ''}` : 'No project';
    this.els.projectName.title = p ? `${p.id}${p.writable ? '' : ' (example, read-only)'}` : '';
    this.els.save.textContent = p && !p.writable ? 'Save as…' : 'Save';
    this.els.save.disabled = !!p && p.writable && !dirty;
    (this.els.root.querySelector('.save-as') as HTMLElement).style.display = p && !p.writable ? 'none' : '';
    this.els.undo.disabled = !this.history.canUndo;
    this.els.redo.disabled = !this.history.canRedo;
    this.els.undo.title = this.history.canUndo ? `Undo ${this.history.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
    this.els.redo.title = this.history.canRedo ? `Redo ${this.history.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo';
  }

  private renderEffects(): void {
    const list = this.els.effects;
    list.replaceChildren(...this.history.doc.effects.map((fx) => h('div', { class: fx.id === this.selEffect ? 'item sel' : 'item' },
      h('button', { class: 'item-main', title: `${fx.name} (file ${fx.id}.vfx.json)`, attrs: { type: 'button' }, on: { click: () => this.selectEffect(fx.id) } }, h('span', { text: fx.name })),
      h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': `Delete ${fx.name}` }, title: 'Delete effect', on: { click: () => this.deleteEffect(fx.id) } }, icon('trash')))));
  }

  private renderLayers(): void {
    const fx = this.effect();
    const list = this.els.layers;
    if (!fx) { list.replaceChildren(h('p', { class: 'empty', text: 'No effect.' })); return; }
    // Shown top of the drawing order first.
    list.replaceChildren(...[...fx.layers].reverse().map((l) => h('button', {
      class: l.id === this.selLayer ? 'item layer-item sel' : 'item layer-item', attrs: { type: 'button' }, on: { click: () => this.selectLayer(l.id) },
    }, icon(l.type), h('span', { text: l.name }), h('code', { text: layerTag(l) }))));
    if (!fx.layers.length) list.append(h('p', { class: 'empty', text: 'No layers yet. Add a sprite or a projectile.' }));
  }

  private renderTransport(): void {
    this.els.play.replaceChildren(icon(this.playing ? 'pause' : 'play'), this.playing ? 'Pause' : 'Play');
  }

  private renderTime(len: number): void {
    const t = Number.isFinite(this.mainTime) ? Math.max(0, this.mainTime) : -1;
    const step = t >= 0 ? Math.floor((t * 12) / 1000 + 1e-9) : 0;
    this.els.time.textContent = t >= 0 ? `${t.toFixed(0)} / ${len.toFixed(0)} ms · step ${step}` : `firing · ${this.player.count} playing`;
    this.timelineView.setPlayhead(t);
  }

  private say(text: string, bad = false): void {
    const s = this.els.status;
    s.textContent = text;
    s.className = bad ? 'status bad show' : 'status show';
    clearTimeout((s as unknown as { _t?: number })._t);
    (s as unknown as { _t?: number })._t = window.setTimeout(() => s.classList.remove('show'), bad ? 9000 : 3500);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.history.redo(); else this.history.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.history.redo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void this.save(); return; }
      if (typing || mod || this.els.dialog.open) return;
      if (tag === 'BUTTON' && e.key === 'Enter') return;
      if (e.key === ' ') {
        // A button clicked with the mouse keeps focus; Space would click it again on key-up. Take the focus away.
        e.preventDefault();
        if ((e.target as HTMLElement).tagName === 'BUTTON') (e.target as HTMLElement).blur();
        this.togglePlay();
      }
      else if (e.key === 'f' || e.key === 'F') this.fire();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
      else if (e.key === 'l' || e.key === 'L') this.setLoop(!this.loop);
      else if (e.key === '1' || e.key === '2' || e.key === '3') { const v = (['whole', 'game', 'close'] as const)[+e.key - 1]!; this.preview.setView(v); this.viewCtl.set(v); }
      else if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
    });
  }

  // ---------------------------------------------------------------- for the browser check

  /** Pause and show the current effect at time ms, with a seed. Used by tools/browser-check.mjs. */
  async showAt(ms: number, seed = 1): Promise<void> {
    this.playing = false;
    this.mainTime = ms;
    this.seed = seed;
    this.player.clear();
    await this.frame(performance.now());
  }

  /** For the browser check: let realMs of real time pass in 40 ms frames, without waiting for the screen. */
  async tickForChecks(realMs: number): Promise<void> {
    (window as unknown as { __vfxManual?: boolean }).__vfxManual = true;
    for (let t = 0; t < realMs; t += 40) await this.frame(this.lastFrame + 40);
  }

  /** For the browser check: hand the clock back to the screen's frames. */
  resumeForChecks(): void {
    (window as unknown as { __vfxManual?: boolean }).__vfxManual = false;
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => void this.frame(t));
  }

  /** For the browser check: the playback state. */
  debugState(): { playing: boolean; mainTime: number; speed: number; playingCount: number; effects: string[] } {
    return { playing: this.playing, mainTime: this.mainTime, speed: this.speed, playingCount: this.player.count, effects: this.history.doc.effects.map((e) => e.id) };
  }

  /** For the browser check: pick an effect by id. */
  pickEffect(id: string): boolean {
    if (!effectById(this.history.doc, id)) return false;
    this.selectEffect(id);
    return true;
  }

  /** For the compare and browser checks: an effect in a scene, for a faction, made by someone, at a distance. */
  async setupForChecks(o: { effect: string; scene?: string; faction?: FactionId; relation?: Relation; distance?: number }): Promise<boolean> {
    if (!effectById(this.history.doc, o.effect)) return false;
    this.selectEffect(o.effect);
    if (o.scene) this.chooseScene(o.scene);
    if (o.faction) { this.faction = o.faction; this.preview.setFaction(o.faction); this.factionCtl.set(o.faction); }
    if (o.relation) { this.preview.setRelation(o.relation); this.relationCtl.set(o.relation); }
    if (o.distance !== undefined) { this.preview.setDistance(o.distance); this.distanceBox.set(this.preview.viewerDistanceM); }
    this.metaDirty = false;
    this.renderTopbar();
    return true;
  }

  get previewForChecks(): Preview {
    return this.preview;
  }
}

export { StoreError };

/** A few words after a layer's name in the list: its image, its flight, its shape, its word. */
function layerTag(l: Layer): string {
  switch (l.type) {
    case 'sprite': return l.image.replace(/\.png$/, '');
    case 'projectile': return l.flight.mode === 'speed' ? `${l.flight.mps} m/s` : l.flight.mode === 'time' ? `${l.flight.ms} ms` : `${l.flight.phase}`;
    case 'shape': return l.shape.kind;
    case 'burst': return `${l.count} × ${l.look.kind}`;
    case 'word': return l.words.join(' / ');
  }
}

/** A small distance control for the viewport bar: a range and the number in metres. */
function distanceControl(onInput: (m: number) => void): { el: HTMLElement; set(v: number): void } {
  const range = h('input', { attrs: { type: 'range', min: '0', max: '14', step: '0.1', 'aria-label': 'Distance from you' } });
  const val = h('span', { class: 'dist-val' });
  const set = (v: number) => { range.value = String(v); val.textContent = `${v.toFixed(1)} m`; };
  range.addEventListener('input', () => { set(+range.value); onInput(+range.value); });
  set(4);
  const el = h('div', { class: 'row dist', title: 'How far you are from the effect. Comic words shrink with distance: full size to 2 m, 60 % from 5 to 8 m, gone at 11 m.' },
    h('div', { class: 'lab' }, h('span', { text: 'Distance from you' })), range, val);
  return { el, set };
}
