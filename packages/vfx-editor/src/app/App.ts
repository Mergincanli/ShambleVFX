/**
 * The editor: one window with the layers on the left, the live preview in the middle (with the transport and the
 * timeline under it), and one panel on the right. Effects play through vfx-runtime, the code the game ships.
 */
import paletteJson from '@shamble/vfx-format/palette.json';
import { EVENT_NAME, FACTION_IDS, TIER_NAMES, checkPalette, newBurstLayer, newEffect, newShapeLayer, newWordLayer, upgradePalette } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Gradient, Layer, Palette, PaletteEntry, ShapeKind, ShapeLayer, TierName, Vec3 } from '@shamble/vfx-format';
import { checkEffect } from '@shamble/vfx-format/validate';
import { roleNames } from '@shamble/vfx-format';
import type { Problem } from '@shamble/vfx-format/validate';
import { EffectPlayer, applyControls, resolveTimeline } from '@shamble/vfx-runtime';
import type { Atlas, Relation, Timeline } from '@shamble/vfx-runtime';
import { drawAtlas } from '../atlas/pack';
import { measureCost, readBudgets } from '../cost/measure';
import type { Budgets, CostConditions, CostMetric, CostReport } from '../cost/measure';
import type { AtlasImage } from '../atlas/pack';
import {
  ROLE_NAME, addEffect, addLayer, addRole, deriveAgain, restoreRoleEntry, setGradient, duplicateLayer, effectById, freeEffectId, freeLayerId, moveLayer, newProjectile, newSprite, removeEffect, removeLayer,
  replaceLayer as replaceLayerIn, setEffectValue, setLayerValue, setRoleColour,
} from '../doc/edits';
import type { Path } from '../doc/edits';
import { History } from '../doc/history';
import { notDrawnNotes } from '../doc/not-drawn';
import type { NotDrawnNote } from '../doc/not-drawn';
import { DevServerStore, StoreError, effectPath, imagePath, readJson, writeJson } from '../io/store';
import type { ExportResult, ExportSummary, ProjectContents, ProjectStore } from '../io/store';
import { makeGameCamera } from '../preview/camera';
import { Preview, SCENES } from '../preview/Preview';
import type { ViewMode } from '../preview/Preview';
import type { AppApi, EditOptions } from './api';
import { ColourPicker } from './colorpicker';
import { GradientPanel } from './gradients';
import { h, icon, segmented, selectField } from './dom';
import { buildInspector } from './inspector';
import { buildTimeline } from './timeline';
import type { TimelineView } from './timeline';

/** The built-in palette: a project without its own palette.json uses it (the examples do). */
const builtInPalette = paletteJson as Palette;
const SPEEDS = [1, 0.5, 0.25, 0.1];
const LOOP_REST_MS = 300;
const LAST_PROJECT = 'vfx-last-project';
const TIER_LABEL: Record<TierName, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const THEME_KEY = 'vfx-theme';

/** Night mode: dark panels round the preview (the preview itself keeps the game's colours). */
function applyTheme(dark: boolean): void {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
const SHAPE_KINDS: ShapeKind[] = ['shards', 'flash', 'cloud', 'smoke', 'ring', 'dots', 'scorch', 'lines', 'glow', 'trail', 'band', 'beads', 'flames', 'bed'];
const SHAPE_TEXT: Record<ShapeKind, string> = {
  shards: 'star of shards', flash: 'muzzle flash', cloud: 'cloud blast', smoke: 'smoke', ring: 'ring', dots: 'halftone dots', scorch: 'scorch mark',
  lines: 'speed lines', glow: 'glow', trail: 'trail behind a projectile', band: 'beam', beads: 'beads along a beam', flames: 'flame tongues', bed: 'fire bed',
};

export class App implements AppApi {
  faction: FactionId = 'soviets';
  private store: ProjectStore = new DevServerStore();
  private history = new History({ effects: [], palette: builtInPalette });
  /** The palette as last read from or written to the project's palette.json (or the built-in one). */
  private paletteOnDisk: Palette = builtInPalette;
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
  private problemCache: { fx: EffectFile | undefined; images: number; list: Problem[]; palette: Palette } | null = null;
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
  private tierCtl!: ReturnType<typeof segmented<TierName>>;
  /** The quality tier the preview draws. */
  private tier: TierName = 'high';
  /** The game events each effect answers (project.json "events"). Deleted effects keep theirs here, so undo brings them back. */
  private eventsValue: Record<string, string[]> = {};
  /** Budgets typed for this project, per tier (project.json "budgets"). */
  private budgetsValue: Budgets = {};
  private costReports = new Map<string, CostReport>();
  /** While measuring: what is being measured (the preview waits). */
  private measuring: string | null = null;
  /** The atlas the preview draws with (the cost panel measures with it too). */
  private atlas: Atlas | null = null;
  private picker!: ColourPicker;
  private gradients!: GradientPanel;

  static async start(root: HTMLElement): Promise<App> {
    const app = new App();
    await app.boot(root);
    return app;
  }

  // ---------------------------------------------------------------- AppApi

  /** The project's colours: its palette.json, or the built-in palette. */
  get palette(): Palette {
    return this.history.doc.palette;
  }

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

  layersNotDrawn(): NotDrawnNote[] {
    const fx = this.effect();
    if (!fx) return [];
    return notDrawnNotes(fx, this.preview.vfx.stats.notDrawn, (this.project?.images ?? []).map((im) => im.name));
  }

  problems(): Problem[] {
    const fx = this.effect();
    const pal = this.palette;
    if (this.problemCache && this.problemCache.fx === fx && this.problemCache.images === this.images.size && this.problemCache.palette === pal) return this.problemCache.list;
    const r = fx ? checkEffect(fx, { palette: pal, images: this.images.keys() }) : null;
    const list = r && !r.ok ? r.problems : [];
    this.problemCache = { fx, images: this.images.size, list, palette: pal };
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

  previewTier(): TierName {
    return this.tier;
  }

  setFaction(f: FactionId): void {
    if (f === this.faction) return;
    this.faction = f;
    this.preview.setFaction(f);
    this.factionCtl.set(f);
    this.inspector.refresh();
    this.picker?.refresh();
  }

  setColour(role: string, hex: string, opts: { faction?: FactionId; mergeKey?: string } = {}): void {
    const f = opts.faction ?? this.faction;
    this.history.apply(`Colour ${role}`, setRoleColour(this.history.doc, role, f, hex), { mergeKey: opts.mergeKey && `colour:${role}:${f}:${opts.mergeKey}` });
  }

  restoreColour(role: string, entry: PaletteEntry, faction: FactionId): void {
    this.history.apply(`Revert ${role}`, restoreRoleEntry(this.history.doc, role, faction, entry));
    this.history.endGesture();
  }

  addColour(role: string, perFaction: boolean, hex: string): string | null {
    if (!ROLE_NAME.test(role)) return 'Use lowercase words joined by dots, such as fire.blue.';
    if (roleNames(this.palette).includes(role)) return `"${role}" is a colour already.`;
    this.history.apply(`Add colour ${role}`, addRole(this.history.doc, role, perFaction, hex));
    this.history.endGesture();
    return null;
  }

  deriveColour(role: string, faction?: FactionId): void {
    this.history.apply(`Work out ${role}`, deriveAgain(this.history.doc, role, faction ?? this.faction));
    this.history.endGesture();
  }

  setGradient(name: string, g: Gradient, opts: { mergeKey?: string } = {}): void {
    this.history.apply(`Gradient ${name}`, setGradient(this.history.doc, name, g), { mergeKey: opts.mergeKey && `gradient:${name}:${opts.mergeKey}` });
  }

  setMainColour(role: string): void {
    this.editEffect(['controls', 'colour'], role, { label: 'Main colour' });
    this.commit();
  }

  openColourPicker(role: string, anchor: HTMLElement): void {
    this.picker.open(role, anchor);
    this.gradients.refresh();
  }

  events(): string[] {
    return this.selEffect ? [...(this.eventsValue[this.selEffect] ?? [])] : [];
  }

  setEvents(list: string[]): void {
    const id = this.selEffect;
    if (!id) return;
    const clean = [...new Set(list.map((e) => e.trim()).filter(Boolean))];
    if (clean.join('\n') === (this.eventsValue[id] ?? []).join('\n')) return;
    if (clean.length) this.eventsValue[id] = clean;
    else delete this.eventsValue[id];
    this.metaDirty = true;
    this.renderTopbar();
    this.inspector.refresh();
  }

  eventProblems(): string[] {
    const id = this.selEffect;
    if (!id) return [];
    const out: string[] = [];
    for (const ev of this.eventsValue[id] ?? []) {
      if (!EVENT_NAME.test(ev)) out.push(`"${ev}" is not an event name: lowercase words joined by dots, such as "rifle.shot".`);
      const other = this.history.doc.effects.find((fx) => fx.id !== id && (this.eventsValue[fx.id] ?? []).includes(ev));
      if (other) out.push(`"${ev}" is already answered by "${other.name}": one event plays one effect.`);
    }
    return out;
  }

  costReport(): CostReport | undefined {
    return this.selEffect ? this.costReports.get(this.selEffect) : undefined;
  }

  costStale(): boolean {
    const r = this.costReport();
    if (!r) return false;
    if (r.effect !== this.effect() || r.palette !== this.palette) return true;
    const a = r.conditions, b = this.costConditions();
    const key = (c: CostConditions) => JSON.stringify([c.scene, c.origin, c.target, c.faction, c.relation, c.viewerDistanceM]);
    return key(a) !== key(b);
  }

  costProgress(): string | null {
    return this.measuring;
  }

  measureCost(): void {
    void this.runMeasure();
  }

  budgets(): Budgets {
    return this.budgetsValue;
  }

  setBudget(tier: TierName, metric: CostMetric, value: number | undefined): void {
    const b: Budgets = structuredClone(this.budgetsValue);
    if (value === undefined) {
      delete b[tier]?.[metric];
      if (b[tier] && !Object.keys(b[tier]!).length) delete b[tier];
    } else (b[tier] ??= {})[metric] = value;
    this.budgetsValue = b;
    this.metaDirty = true;
    this.renderTopbar();
    this.inspector.refresh();
  }

  private costConditions(): CostConditions {
    const i = this.inputs();
    return {
      scene: this.preview.scene.id, sceneName: this.preview.scene.name, origin: i.origin, target: i.target, seed: 1,
      faction: this.faction, relation: this.preview.relation, viewerDistanceM: this.preview.viewerDistanceM,
    };
  }

  /** Measure the current effect's cost in every tier. The preview waits meanwhile, so it does not share the computer. */
  private async runMeasure(): Promise<void> {
    const fx = this.effect();
    if (!fx || this.measuring) return;
    if (this.problems().some((p) => p.kind === 'schema' || p.kind === 'format' || p.kind === 'version')) {
      this.say('This effect has errors (see Checks): fix them, then measure.', true);
      return;
    }
    this.measuring = 'Starting…';
    this.inspector.refresh();
    try {
      const report = await measureCost({
        ...this.costConditions(), effect: fx, palette: this.palette, atlas: this.atlas, camera: makeGameCamera(),
        onProgress: (t) => { this.measuring = t; this.inspector.refresh(); },
      });
      this.costReports.set(fx.id, report);
    } catch (e) {
      this.say(`Measuring failed: ${(e as Error).message}`, true);
    } finally {
      this.measuring = null;
    }
    this.inspector.refresh();
  }

  /** Scroll the right panel to the cost card. */
  private showCostCard(): void {
    const card = this.els.root.querySelector('.costcard');
    card?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    (card?.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  private setTier(t: TierName): void {
    this.tier = t;
    this.preview.vfx.tier = t;
    this.tierCtl.set(t);
    this.renderLayers();
    this.timelineView.refresh();
  }

  // ---------------------------------------------------------------- start up

  private async boot(root: HTMLElement): Promise<void> {
    const params = new URLSearchParams(location.search);
    const stored = (() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })();
    applyTheme((params.get('theme') ?? stored) === 'dark');
    this.buildShell(root);
    this.preview = await Preview.create({
      container: this.els.viewport, palette: this.palette, backend: params.get('backend') === 'webgl' ? 'webgl' : 'auto', offscreen: params.get('offscreen') === '1',
    });
    this.preview.onTargetMoved = () => { this.timelineView.refresh(); this.inspector.refresh(); this.distanceBox.set(this.preview.viewerDistanceM); };
    this.distanceBox.set(this.preview.viewerDistanceM);
    // ?frame=1 shows only the game screen at its real size: for screenshots of what a player sees.
    if (params.get('frame') === '1') { document.body.classList.add('frame-only'); this.preview.setView('frame'); }
    this.els.backend.textContent = this.preview.backendName;
    this.els.backend.title = this.preview.backendName === 'WebGPU'
      ? 'Drawing with the WebGPU renderer. Add ?backend=webgl to the address to try the WebGL 2 fallback.'
      : 'Drawing with the WebGL 2 fallback of the WebGPU renderer.';
    this.picker = new ColourPicker(this);
    this.gradients = new GradientPanel(this);
    this.picker.extraSlot.append(this.gradients.el);
    this.inspector = buildInspector(this);
    root.querySelector('.right')!.append(this.inspector.el);
    this.timelineView = buildTimeline(this, (ms, done) => this.scrub(ms, done));
    root.querySelector('.timeline-slot')!.append(this.timelineView.el);
    this.history.subscribe((why) => this.onDocChange(why));
    this.bindKeys();
    // Unsaved means effects, or what project.json holds (scenes, game events, budgets).
    window.addEventListener('beforeunload', (e) => { if (this.history.dirty || this.metaDirty) e.preventDefault(); });

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
    const save = h('button', { class: 'tb', attrs: { type: 'button' }, title: 'Save (Ctrl+S)', on: { click: () => void this.save() } }, icon('save'), h('span', { class: 'save-label', text: 'Save' }));
    const night = h('button', { class: 'tb theme-toggle', attrs: { type: 'button', 'aria-pressed': String(document.documentElement.dataset.theme === 'dark') },
      title: 'Night mode: dark panels (the preview keeps the game\'s colours)', on: { click: () => {
        const dark = document.documentElement.dataset.theme !== 'dark';
        applyTheme(dark);
        night.setAttribute('aria-pressed', String(dark));
        try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* storage may be blocked */ }
      } } }, icon('moon'), h('span', { text: 'Night mode' }));
    const undo = h('button', { class: 'tb icon-only', attrs: { type: 'button', 'aria-label': 'Undo' }, title: 'Undo (Ctrl+Z)', on: { click: () => this.history.undo() } }, icon('undo'));
    const redo = h('button', { class: 'tb icon-only', attrs: { type: 'button', 'aria-label': 'Redo' }, title: 'Redo (Ctrl+Shift+Z)', on: { click: () => this.history.redo() } }, icon('redo'));
    const backend = h('span', { class: 'badge' });
    const status = h('div', { class: 'status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const dialog = h('dialog', { class: 'dlg' });
    const top = h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('b', { text: 'Shamble' }), h('span', { text: 'VFX' })),
      h('div', { class: 'project' }, projectName,
        h('button', { class: 'tb', attrs: { type: 'button' }, on: { click: () => void this.projectsDialog() } }, icon('projects'), h('span', { text: 'Projects…' })),
        save,
        h('button', { class: 'tb save-as', attrs: { type: 'button' }, on: { click: () => void this.saveAsDialog() } }, icon('save-as'), h('span', { text: 'Save as…' })),
        h('button', { class: 'tb export', attrs: { type: 'button' }, title: 'Write the folder the game loads: a manifest, one file per effect, one packed atlas', on: { click: () => void this.exportDialog() } },
          icon('export'), h('span', { text: 'Export…' }))),
      h('div', { class: 'tools' }, undo, redo, backend, night,
        h('button', { class: 'tb', attrs: { type: 'button' }, title: 'Keyboard shortcuts', on: { click: () => this.keysDialog() } }, icon('keys'), h('span', { text: 'Keys' }))));

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
        h('button', { class: 'mini', attrs: { type: 'button' }, title: 'A copy of a ready-made effect: the drawing board\'s four, and the comic hits', on: { click: () => void this.presetDialog() } }, icon('preset'), 'From preset…')), effects),
      h('section', { class: 'card grow' }, h('div', { class: 'card-head' }, h('h2', { text: 'Layers' }), h('span', { class: 'hint', text: 'top draws on top' })),
        h('div', { class: 'layer-tools' },
          addMenu),
        layers,
        h('div', { class: 'layer-tools' },
          h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Move up' }, title: 'Move up (draws over more)', on: { click: () => this.moveSelected(1) } }, icon('up')),
          h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Move down' }, title: 'Move down', on: { click: () => this.moveSelected(-1) } }, icon('down')),
          h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Duplicate' }, title: 'Duplicate', on: { click: () => this.duplicateSelected() } }, icon('copy')),
          h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Delete layer' }, title: 'Delete layer (Del)', on: { click: () => this.deleteSelected() } }, icon('trash')))));

    this.factionCtl = segmented<FactionId>({ label: 'Faction that fired', value: this.faction,
      options: FACTION_IDS.map((f) => ({ value: f, label: builtInPalette.factions[f].name, icon: `faction-${f}` as const, style: `--team:${builtInPalette.factions[f].roles.team!.hex}` })),
      onChange: (f) => this.setFaction(f), small: true });
    this.viewCtl = segmented<ViewMode>({ label: 'View', options: [{ value: 'whole', label: 'Whole screen', icon: 'view-whole' }, { value: 'game', label: 'Game size', icon: 'view-game' }, { value: 'close', label: 'Close-up', icon: 'view-close' }],
      value: 'whole', onChange: (v) => { this.preview.setView(v); this.viewCtl.set(v); }, small: true });
    this.closeCtl = segmented<'origin' | 'target'>({ label: 'Close-up on', options: [{ value: 'origin', label: 'Muzzle', icon: 'muzzle' }, { value: 'target', label: 'Target', icon: 'target' }], value: 'target',
      onChange: (v) => { this.preview.setCloseOn(v); this.closeCtl.set(v); }, small: true });
    this.sceneCtl = selectField({ label: 'Scene', options: SCENES.map((x) => ({ value: x.id, label: x.name })), value: SCENES[0]!.id,
      onChange: (id) => this.chooseScene(id) });
    this.relationCtl = segmented<Relation>({ label: 'Made by', small: true, value: 'enemy',
      options: [{ value: 'enemy', label: 'Enemy', icon: 'enemy', title: 'An enemy made it: comic outlines in ink' }, { value: 'team', label: 'Your team', icon: 'team', title: 'Your team made it: thin broken outlines' },
        { value: 'self', label: 'You', icon: 'self', title: 'You made it: your own words show' }],
      onChange: (r) => { this.preview.setRelation(r); this.relationCtl.set(r); } });
    this.distanceBox = distanceControl((m) => { this.preview.setDistance(m); this.timelineView.refresh(); });
    this.tierCtl = segmented<TierName>({ label: 'Tier', small: true, value: 'high',
      options: TIER_NAMES.map((t) => ({ value: t, label: TIER_LABEL[t], icon: `tier-${t}` as const, title: `Draw in the ${TIER_LABEL[t]} quality tier: layers not in it are left out` })),
      onChange: (t) => this.setTier(t) });
    const fire = h('button', { class: 'fire', attrs: { type: 'button' }, title: 'Fire from the shooter to the target (F)', on: { click: () => this.fire() } }, icon('fire'), 'Fire');
    const stats = h('button', { class: 'stats', attrs: { type: 'button' }, title: 'This frame. Click for the cost panel: the effect measured over its whole length, per tier',
      on: { click: () => this.showCostCard() } });
    const viewport = h('div', { class: 'viewport' });
    const vbar = h('div', { class: 'vbar' }, fire, this.sceneCtl.el, this.factionCtl.el, this.relationCtl.el, this.distanceBox.el, this.tierCtl.el, this.viewCtl.el, this.closeCtl.el, stats);
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
    if ((this.history.dirty || this.metaDirty) && !confirm('You have changes that are not saved. Open another project anyway?')) return false;
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
    // The project's own colours, or the built-in palette.
    let projectPalette = builtInPalette;
    if (contents.palette) {
      try {
        // An older palette.json (version 1, no gradients) is read as the current version.
        const raw = upgradePalette(await readJson(this.store, id, 'palette.json'));
        const wrong = checkPalette(raw);
        if (wrong.length) bad.push(`palette.json: ${wrong.slice(0, 2).join('; ')} (the built-in palette is used instead)`);
        else projectPalette = raw;
      } catch (e) {
        bad.push(`palette.json: ${(e as Error).message} (the built-in palette is used instead)`);
      }
    }
    this.paletteOnDisk = projectPalette;
    for (const file of contents.effects) {
      try {
        const raw = await readJson(this.store, id, `effects/${file}`);
        const r = checkEffect(raw, { palette: projectPalette, images: this.images.keys() });
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
    this.history.reset({ effects, palette: projectPalette });
    this.preview.vfx.palette = projectPalette;
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

  /** project.json: the name, the scene each effect is shown in, the game events each answers, and the budgets. */
  private async readProjectMeta(): Promise<void> {
    this.projectMeta = {};
    this.previewScenes = {};
    this.eventsValue = {};
    this.budgetsValue = {};
    this.costReports.clear();
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
      this.eventsValue = readEvents(this.projectMeta.events);
      this.budgetsValue = readBudgets(this.projectMeta.budgets);
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
    this.atlas = drawAtlas(list);
    this.preview.setAtlas(this.atlas);
    this.costReports.clear();
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
      // Changed colours go into the project's own palette.json (the built-in palette is never written).
      if (doc.palette !== this.paletteOnDisk) {
        await writeJson(this.store, projectId, 'palette.json', doc.palette);
        this.paletteOnDisk = doc.palette;
      }
      if (this.metaDirty || projectId !== this.project?.id) {
        const preview: Record<string, { scene: string }> = {};
        for (const fx of doc.effects) if (this.previewScenes[fx.id]) preview[fx.id] = { scene: this.previewScenes[fx.id]! };
        const name = projectId === this.project?.id ? (this.projectMeta.name ?? this.project?.name) : undefined;
        const current = projectId === this.project?.id ? this.projectMeta : await readJson(this.store, projectId, 'project.json').catch(() => ({}));
        const events: Record<string, string[]> = {};
        for (const fx of doc.effects) if (this.eventsValue[fx.id]?.length) events[fx.id] = [...this.eventsValue[fx.id]!];
        const meta: Record<string, unknown> = { ...(current as Record<string, unknown>), ...(name ? { name } : {}), events, preview };
        if (Object.keys(this.budgetsValue).length) meta.budgets = this.budgetsValue;
        else delete meta.budgets;
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
      // The copy's project.json is fresh (its own name only). Keep everything the project said (its events, budgets,
      // notes), under the copy's own name, and write the scenes into it.
      let fresh: Record<string, unknown> = { name: copy.name };
      try { fresh = (await readJson(this.store, copy.id, 'project.json')) as Record<string, unknown>; } catch { /* keep the name */ }
      this.projectMeta = { ...this.projectMeta, ...fresh };
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
        try { fx = checkEffect(await readJson(this.store, p.id, `effects/${file}`), { palette: builtInPalette }).effect; } catch { fx = undefined; }
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
    // A preset's game events stay with the preset: one event plays one effect.
    if (this.eventsValue[id]) { delete this.eventsValue[id]; this.metaDirty = true; }
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
    let exportsList: ExportSummary[] = [];
    try { exportsList = await this.store.listExports(); } catch { /* no exports to show */ }
    const importRows = exportsList.map((e) => h('li', {},
      h('button', { class: 'linkish', attrs: { type: 'button' }, text: e.name, on: { click: () => { d.close(); void this.importDialog(e); } } }),
      h('span', { class: 'hint', text: ` exports/${e.folder} · ${e.effects} effect${e.effects === 1 ? '' : 's'}, ${e.events} event${e.events === 1 ? '' : 's'}` })));
    d.replaceChildren(
      h('h2', { text: 'Projects' }),
      h('ul', { class: 'plist' }, ...rows),
      h('h3', { text: 'Import an export' }),
      h('p', { class: 'hint', text: 'Makes a new project from an export folder: the effects as they are, each image cut back out of the atlas, the game events, scenes and budgets.' }),
      importRows.length ? h('ul', { class: 'plist imports' }, ...importRows) : h('p', { class: 'hint', text: 'No exports yet: Export… writes one into exports/.' }),
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

  /** Export the project as saved on disk. Unsaved changes are named first: the export never holds what was not saved. */
  private async exportDialog(): Promise<void> {
    const p = this.project;
    if (!p) return;
    if (this.history.dirty || this.metaDirty) {
      const choice = p.writable
        ? await this.choose('Export', 'You have changes that are not saved. Export writes the project as it is saved on disk.',
          [['save', 'Save, then export'], ['disk', 'Export what is saved'], ['cancel', 'Cancel']])
        : await this.choose('Export', 'This example has changes that are not saved. Export writes the example as it is on disk. To export your changes, use Save as first, then Export.',
          [['disk', 'Export the example as it is'], ['cancel', 'Cancel']]);
      if (!choice || choice === 'cancel') return;
      if (choice === 'save') {
        await this.writeEffects(p.id);
        if (this.history.dirty || this.metaDirty) return;
      }
    }
    const r = await this.exportNow();
    if (r) this.showExportReport(r);
  }

  /** Export the open project (as saved). Used by the Export button and the browser check. */
  async exportNow(): Promise<ExportResult | null> {
    if (!this.project) return null;
    this.say('Exporting…');
    try {
      const r = await this.store.exportProject(this.project.id);
      this.say(r.ok ? `Exported to ${r.folder}/.` : 'Not exported: see the problems.', !r.ok);
      return r;
    } catch (e) {
      this.say(`Export failed: ${(e as Error).message}`, true);
      return null;
    }
  }

  private showExportReport(r: ExportResult): void {
    const d = this.els.dialog;
    const body: HTMLElement[] = [h('h2', { text: r.ok ? 'Exported' : 'Not exported' })];
    if (r.ok) {
      body.push(h('p', { text: `${r.effects} effect${r.effects === 1 ? '' : 's'} answering ${r.events} game event${r.events === 1 ? '' : 's'} went to ${r.folder}/: a manifest, one file per effect, one packed atlas with its map, and the palette.` }));
      body.push(h('p', {}, 'To play it as the game would: run ', h('code', { text: 'npm run testpage' }), ' in the repo, and pick this export.'));
    } else {
      body.push(h('p', { text: 'Nothing was written. The export checker found:' }), h('ul', { class: 'problems' }, ...r.errors.map((e) => h('li', { text: e }))));
    }
    if (r.warnings.length) body.push(h('p', { text: 'Worth a look:' }), h('ul', { class: 'problems warn' }, ...r.warnings.map((w) => h('li', { text: w }))));
    d.replaceChildren(...body, h('div', { class: 'dlg-buttons' }, h('button', { class: 'tb primary', attrs: { type: 'button' }, text: 'Close', on: { click: () => d.close() } })));
    d.classList.add('export-report');
    d.addEventListener('close', () => d.classList.remove('export-report'), { once: true });
    d.showModal();
  }

  private async importDialog(e: ExportSummary): Promise<void> {
    const name = await this.ask('Import', `A name for the new project made from exports/${e.folder}. It goes in the projects folder (kept out of git).`, `${e.name} (imported)`.slice(0, 60));
    if (!name) return;
    let r;
    try { r = await this.store.importExport(e.folder, 'projects', name); } catch (err) { this.say(`Import failed: ${(err as Error).message}`, true); return; }
    if (!r.ok || !r.project) {
      const d = this.els.dialog;
      d.replaceChildren(h('h2', { text: 'Not imported' }), h('p', { text: 'Nothing was made. The export checker found:' }), h('ul', { class: 'problems' }, ...r.errors.map((x) => h('li', { text: x }))),
        h('div', { class: 'dlg-buttons' }, h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Close', on: { click: () => d.close() } })));
      d.showModal();
      return;
    }
    if (await this.openProject(r.project.id)) this.say(`Imported ${r.effects} effect${r.effects === 1 ? '' : 's'} and ${r.images} image${r.images === 1 ? '' : 's'} as "${r.project.name}".`);
  }

  /** A question with a few answers; null when the dialog is closed. */
  private choose(title: string, text: string, answers: [string, string][]): Promise<string | null> {
    const d = this.els.dialog;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: string | null) => { if (done) return; done = true; d.close(); resolve(v); };
      d.replaceChildren(h('h2', { text: title }), h('p', { text }),
        h('div', { class: 'dlg-buttons' }, ...answers.map(([v, label], i) => h('button', { class: i === 0 ? 'tb primary' : 'tb', attrs: { type: 'button', 'data-answer': v }, text: label, on: { click: () => finish(v) } }))));
      d.addEventListener('close', () => finish(null), { once: true });
      d.showModal();
    });
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
    if (this.eventsValue[id]) { delete this.eventsValue[id]; this.metaDirty = true; }
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
    if (this.preview.vfx.palette !== this.palette) this.preview.vfx.palette = this.palette;
    this.renderEffects();
    this.renderLayers();
    this.inspector.refresh();
    this.picker.refresh();
    if (this.picker.isOpen) this.gradients.refresh();
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
    if (this.measuring) {
      // The cost panel is timing the effect: the preview waits, so it does not share the computer.
      if (!(window as unknown as { __vfxManual?: boolean }).__vfxManual) requestAnimationFrame((t) => void this.frame(t));
      return;
    }
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
    this.els.stats.textContent = `${s.triangles} triangle${s.triangles === 1 ? '' : 's'} · ${s.drawCalls} draw call${s.drawCalls === 1 ? '' : 's'} · cost…`;
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
    (this.els.save.querySelector('.save-label') as HTMLElement).textContent = p && !p.writable ? 'Save as…' : 'Save';
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
    list.replaceChildren(...[...fx.layers].reverse().map((l) => {
      const hidden = l.type !== 'projectile' && !l.tiers.includes(this.tier);
      return h('button', {
        class: `item layer-item${l.id === this.selLayer ? ' sel' : ''}${hidden ? ' off' : ''}`, attrs: { type: 'button' }, on: { click: () => this.selectLayer(l.id) },
        title: hidden ? `Not drawn in the ${TIER_LABEL[this.tier]} tier` : '',
      }, icon(l.type), h('span', { text: l.name }), h('code', { text: hidden ? `not in ${TIER_LABEL[this.tier]}` : layerTag(l) }));
    }));
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
      // Undo, redo and save (above) work everywhere. Other keys pressed in the colour picker are the picker's (its wheel
      // takes the arrows): never the editor's shortcuts. Escape puts the picker away from anywhere.
      if (e.defaultPrevented || (e.target as HTMLElement).closest?.('.cpick')) return;
      if (e.key === 'Escape' && this.picker.isOpen && !this.els.dialog.open) { this.picker.close(); return; }
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
  async setupForChecks(o: { effect: string; scene?: string; faction?: FactionId; relation?: Relation; distance?: number; tier?: TierName }): Promise<boolean> {
    if (!effectById(this.history.doc, o.effect)) return false;
    this.selectEffect(o.effect);
    if (o.scene) this.chooseScene(o.scene);
    if (o.faction) { this.faction = o.faction; this.preview.setFaction(o.faction); this.factionCtl.set(o.faction); }
    if (o.relation) { this.preview.setRelation(o.relation); this.relationCtl.set(o.relation); }
    if (o.distance !== undefined) { this.preview.setDistance(o.distance); this.distanceBox.set(this.preview.viewerDistanceM); }
    if (o.tier) this.setTier(o.tier);
    this.metaDirty = false;
    this.renderTopbar();
    return true;
  }

  /** For the browser check: measure the current effect now and hand back the report. */
  async measureForChecks(): Promise<CostReport | undefined> {
    await this.runMeasure();
    return this.costReport();
  }

  /** For the browser check: draw the preview in a tier. */
  setTierForChecks(t: TierName): void {
    this.setTier(t);
  }

  get previewForChecks(): Preview {
    return this.preview;
  }
}

export { StoreError };

/** The game events from project.json: effect id to a list of event names (anything else is left out). */
function readEvents(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [id, list] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(list)) {
      const names = list.filter((e): e is string => typeof e === 'string' && e.trim() !== '');
      if (names.length) out[id] = names;
    }
  }
  return out;
}

/** A few words after a layer's name in the list: its image, its flight, its shape, its word. */
function layerTag(l: Layer): string {
  switch (l.type) {
    case 'sprite': return l.image.replace(/\.png$/, '');
    case 'projectile': return l.flight.mode === 'speed' ? `${l.flight.mps} m/s` : l.flight.mode === 'time' ? `${l.flight.ms} ms` : `${l.flight.phase}`;
    case 'shape': return l.shape.kind;
    case 'burst': return `${l.count} × ${l.look.kind}`;
    case 'word': return l.words.map((w) => w.text).join(' / ');
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
