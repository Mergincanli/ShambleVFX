/**
 * The editor: one window (docs/ui-redesign.md 5): the top bar; the effects and layers on the left, the live preview in the
 * middle with the timeline under it (the transport in its header), and one panel on the right; the status bar at the
 * bottom. Splitters between the zones resize them (layout.ts). Effects play through vfx-runtime, the code the game ships.
 */
import paletteJson from '@shamble/vfx-format/palette.json';
import { EVENT_NAME, FACTION_IDS, TIER_NAMES, checkPalette, newBurstLayer, newEffect, newShapeLayer, newWordLayer, resolveRole, upgradePalette } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Gradient, Layer, Palette, PaletteEntry, ShapeKind, ShapeLayer, TierName, Vec3 } from '@shamble/vfx-format';
import { checkEffect } from '@shamble/vfx-format/validate';
import { roleNames } from '@shamble/vfx-format';
import type { Problem } from '@shamble/vfx-format/validate';
import { EffectPlayer, applyControls, resolveTimeline } from '@shamble/vfx-runtime';
import type { Atlas, DrawParams, Relation, Timeline } from '@shamble/vfx-runtime';
import { drawAtlas } from '../atlas/pack';
import { addClass, budgetThatCounts, budgetsJson, defaultBudgets, deleteClass, dropMissingEffects, forgetEffect, renameClass, setEffectClass, setLevelOn, setLimit } from '../cost/budgets';
import type { Budgets, CostMetric, LevelRef, LimitsRef } from '../cost/budgets';
import { measureCost } from '../cost/measure';
import type { CostConditions, CostReport } from '../cost/measure';
import type { AtlasImage } from '../atlas/pack';
import {
  ROLE_NAME, addEffect, addLayer, addRole, deriveAgain, restoreRoleEntry, setGradient, duplicateEffect, duplicateLayer, effectById, freeEffectId, freeLayerId, moveLayer, newProjectile, newSprite, removeEffect, removeLayer,
  replaceLayer as replaceLayerIn, setEffectValue, setLayerValue, setRoleColour,
} from '../doc/edits';
import type { Path } from '../doc/edits';
import { allFolders } from '../doc/folders';
import { History } from '../doc/history';
import type { EditorDoc } from '../doc/history';
import { SHAPE_TEXT } from '../doc/layer-info';
import { notDrawnNotes, notDrawnReasons } from '../doc/not-drawn';
import { withLoadedProfile, withProfileName } from '../doc/profiles';
import type { NotDrawnNote, NotDrawnReason } from '../doc/not-drawn';
import { newProjectFile } from '../io/project-file';
import type { ProjectFile } from '../io/project-file';
import { DevServerStore, StoreError, effectPath, imagePath, readJson, readProject, writeJson, writeProject } from '../io/store';
import type { ExportResult, ExportSummary, ProjectContents, ProjectStore } from '../io/store';
import { makeGameCamera } from '../preview/camera';
import { Preview, SCENES } from '../preview/Preview';
import type { ViewMode } from '../preview/Preview';
import type { AppApi, EditOptions, ProfileStore } from './api';
import { ColourPicker } from './colorpicker';
import type { PickerTab } from './colorpicker';
import { GradientPanel } from './gradients';
import { costSummary } from './costcard';
import { buildEffectsList } from './effects-list';
import type { EffectsListView } from './effects-list';
import { buildLayersList } from './layers-list';
import type { LayersListView } from './layers-list';
import { h, icon, iconButton, installTooltips, menu, scrollNearest, segmented, tip, tipContent } from './dom';
import { FADE_KEY, fadeOthers, keptLayers, sinkMarks } from './fade';
import { lookupHelp } from './helptips';
import { buildInspector } from './inspector';
import type { InspectorView } from './inspector';
import { GridSizes } from './layout';
import type { LookState } from './look';
import { buildTimeline } from './timeline';
import type { TimelineView } from './timeline';
import { buildToolbar } from './toolbar';
import type { ToolbarView } from './toolbar';

/** The built-in palette: a project without its own palette.json uses it (the examples do). */
const builtInPalette = paletteJson as Palette;
/** The budgets of a project that has none set (every level off, the three starting classes with no numbers). */
const NO_BUDGETS: Budgets = defaultBudgets();
const SPEEDS = [1, 0.5, 0.25, 0.1];
const LOOP_REST_MS = 300;
const LAST_PROJECT = 'vfx-last-project';
const THEME_KEY = 'vfx-theme';
/** Show hints, remembered: 'on' or 'off' (a browser that never chose shows them). */
const HINTS_KEY = 'vfx-hints';
/** One wording for the drag hint everywhere: over the preview, in the status bar, and in README. */
const DRAG_HINT = 'Drag the ground to move the target. Shift + drag moves the stand-in.';

/** Night mode: dark panels round the preview (the preview itself keeps the game's colours). */
function applyTheme(dark: boolean): void {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Show hints: the one-line hints show, or hide (the stylesheet, by data-hints). Their full words are in tooltips either way. */
function applyHints(on: boolean): void {
  document.documentElement.dataset.hints = on ? 'on' : 'off';
}

const hintsOn = () => document.documentElement.dataset.hints !== 'off';

export class App implements AppApi {
  faction: FactionId = 'soviets';
  private store: ProjectStore = new DevServerStore();
  private history = new History({ effects: [], palette: builtInPalette, budgets: NO_BUDGETS });
  /** The palette as last read from or written to the project's palette.json (or the built-in one). */
  private paletteOnDisk: Palette = builtInPalette;
  private project: ProjectContents | null = null;
  private images = new Map<string, { bitmap: ImageBitmap; url: string }>();
  private effectsOnDisk = new Set<string>();
  private selEffect: string | null = null;
  private selLayer: string | null = null;
  private preview!: Preview;
  private inspector!: InspectorView;
  private timelineView!: TimelineView;
  private player = new EffectPlayer();
  private playing = false;
  private loop = true;
  /** New shot each loop: on at first, each loop of Play is a new shot (a new seed), as each shot in the game is. Off holds one shot. */
  private newShot = true;
  private speed = 1;
  private mainTime = 0;
  private clock = 0;
  private seed = 1;
  private lastFrame = 0;
  /** A frame is asked for from the screen. One at a time, so the preview is drawn once per screen frame. */
  private frameAsked = false;
  private timelineCache: { fx: EffectFile; where: string; tl: Timeline } | null = null;
  private problemCache: { fx: EffectFile | undefined; images: number; list: Problem[]; palette: Palette } | null = null;
  private els!: {
    root: HTMLElement; projectName: HTMLElement; project: HTMLButtonElement; lock: HTMLElement; save: HTMLButtonElement; undo: HTMLButtonElement; redo: HTMLButtonElement;
    hints: HTMLButtonElement; night: HTMLButtonElement; effects: HTMLElement; layers: HTMLElement; viewport: HTMLElement; play: HTMLButtonElement; time: HTMLElement;
    timeNow: HTMLButtonElement; timeInput: HTMLInputElement; timeLen: HTMLElement; timeStep: HTMLElement; timeFiring: HTMLElement;
    status: HTMLElement; dialog: HTMLDialogElement;
    sbChecks: HTMLButtonElement; sbTris: HTMLElement; sbDraws: HTMLElement; sbCost: HTMLButtonElement; sbHint: HTMLElement; sbRenderer: HTMLElement;
    vnotes: HTMLElement;
  };
  private grid!: GridSizes;
  /** The time readout is being typed in (its current time became a box). */
  private timeEditing = false;
  /** What the status bar shows now, so a frame changes only what changed. */
  private statusShown = { checks: '', cost: '' };
  /** The "not drawn" lines over the preview now, so a frame changes them only when they change. */
  private notDrawnShown = '';
  /** A frame is being drawn (offscreen, the copy is awaited): a redraw for a new size waits for the next frame. */
  private drawing = false;
  /** Start-up is done: the project is open and the frames run. */
  private booted = false;
  /** The bar over the preview (toolbar.ts): Fire, the chips, Fade other layers and View. */
  private toolbar!: ToolbarView;
  /** The preview scene each effect was last shown in (kept in project.json, under "preview"). */
  private previewScenes: Record<string, string> = {};
  /**
   * project.json as read, upgraded to version 2. Saving writes it back with the scenes, events and budgets of the moment,
   * so what the editor does not edit (the name, the palette profile, notes such as "about") is kept.
   */
  private projectFile: ProjectFile = newProjectFile('');
  /** project.json was an older version: the next save writes it as version 2, as saving does with old effect files. */
  private projectFileOld = false;
  private metaDirty = false;
  /**
   * The effects project.json was last read or written with. Its events, scenes and budgets follow the effects, so a save
   * writes it again whenever the effects differ (one deleted, or brought back by undo), even with nothing else changed.
   */
  private fileEffectIds = new Set<string>();
  /** Why the last project asked for was not opened (its project.json is a newer version), in plain words; else null. */
  private refusal: string | null = null;
  private speedCtl!: ReturnType<typeof segmented<number>>;
  private loopBtn!: HTMLButtonElement;
  private newShotBtn!: HTMLButtonElement;
  /** The quality tier the preview draws. */
  private tier: TierName = 'high';
  /** The game events each effect answers (project.json "events"). Deleted effects keep theirs here, so undo brings them back. */
  private eventsValue: Record<string, string[]> = {};
  /**
   * The budgets project.json was last read or written with. The budgets themselves are in the document (history.doc), so a
   * budget edit is undone like any edit; a save writes project.json again whenever they are not these.
   */
  private budgetsOnDisk: Budgets = NO_BUDGETS;
  /** The palette profile's name project.json was last read or written with (the name itself is in the document). */
  private profileOnDisk: string | undefined;
  private costReports = new Map<string, CostReport>();
  /** While measuring: what is being measured (the preview waits). */
  private measuring: string | null = null;
  /** The atlas the preview draws with (the cost panel measures with it too). */
  private atlas: Atlas | null = null;
  private picker!: ColourPicker;
  private gradients!: GradientPanel;
  /** Fade other layers (the toggle in the bar above the preview): on until switched off, remembered as vfx-fade. */
  private fadeOn = true;
  private fadeBtn!: HTMLButtonElement;
  /** The layer whose row is under the mouse, in the Layers list or on the timeline: the others fade while it is. */
  private hovered: string | null = null;
  /** ?frame=1 shows only the game screen, as a player sees it: nothing fades there. */
  private frameOnly = false;
  /** The moment showAt paused at (for pictures): the Look holds a moment from it. Null while the app runs as usual. */
  private lookStill: number | null = null;
  /** The Effects section of the left sidebar: header, search, folders and rows (effects-list.ts). */
  private effectsList!: EffectsListView;
  /** The Layers section: header with the add menu, rows, their menu, drag to reorder (layers-list.ts). */
  private layersList!: LayersListView;
  /**
   * What Duplicate gave each copy outside the document (its scene), by the copy's id. Undo that takes a copy away takes it
   * away too (and keeps it here); redo that brings it back brings it back. A new effect that takes the id forgets it. (The
   * copy's own budgets are in the document, in the same undo step as the copy.)
   */
  private copies = new Map<string, { scene?: string }>();
  /** The effect ids of the document last shown, to see what an undo or a redo took away or brought back. */
  private shownIds = new Set<string>();

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
    const changed = id !== this.selLayer;
    this.selLayer = id;
    this.renderLayers();
    this.inspector.refresh();
    this.timelineView.refresh();
    // A new selection shows in the Layers list and on the timeline: each scrolled as little as needed to show its row.
    if (changed && id) this.showLayerRow(id);
  }

  /** A layer's row in the Layers list and on the timeline, each scrolled as little as needed to show it. */
  private showLayerRow(id: string): void {
    const row = this.els.layers.querySelector(`.layer-item[data-layer="${CSS.escape(id)}"]`);
    if (row) scrollNearest(this.els.layers, row);
    const slot = this.els.root.querySelector<HTMLElement>('.timeline-slot');
    const tl = slot?.querySelector(`.tl-row[data-layer="${CSS.escape(id)}"]`);
    if (slot && tl) scrollNearest(slot, tl);
  }

  hoverLayer(id: string | null): void {
    if (this.hovered === id) return;
    this.hovered = id;
    // The same row is highlighted in the Layers list and on the timeline.
    for (const el of this.els.root.querySelectorAll<HTMLElement>('.layers-list .layer-item, .timeline .tl-row')) el.classList.toggle('hovered', !!id && el.dataset.layer === id);
  }

  hoveredLayer(): string | null {
    return this.hovered;
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

  notDrawnReasons(): NotDrawnReason[] {
    const fx = this.effect();
    if (!fx) return [];
    return notDrawnReasons(fx, {
      atlasImages: this.atlas ? new Set(Object.keys(this.atlas.rects)) : null, projectImages: (this.project?.images ?? []).map((im) => im.name),
      notDrawn: this.preview.vfx.stats.notDrawn, tier: this.tier, waits: this.previewWaits(),
    });
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

  /** The problems stop the preview (a schema, format or version problem): it waits until they are fixed. */
  previewWaits(): boolean {
    return this.problems().some((p) => p.kind === 'schema' || p.kind === 'format' || p.kind === 'version');
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
    this.toolbar.setFaction(f);
    this.inspector.refresh();
    this.picker?.refresh();
    // Each effect's dot is its main colour for the faction shown.
    this.renderEffects();
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

  openColourPicker(role: string, anchor: HTMLElement, tab?: PickerTab): void {
    this.picker.open(role, anchor, tab);
    this.gradients.refresh();
  }

  openPalette(role: string, anchor: HTMLElement): void {
    this.openColourPicker(role, anchor, 'palette');
  }

  openGradients(role: string, anchor: HTMLElement, gradient?: string): void {
    this.openColourPicker(role, anchor, 'gradients');
    if (gradient && this.palette.gradients?.[gradient]) this.gradients.edit(gradient);
  }

  profiles(): ProfileStore {
    return this.store;
  }

  paletteProfile(): string | undefined {
    return this.history.doc.paletteProfile;
  }

  allEffects(): readonly EffectFile[] {
    return this.history.doc.effects;
  }

  projectName(): string {
    return this.projectFile.name || this.project?.name || 'My colours';
  }

  loadPaletteProfile(palette: Palette, name: string): void {
    this.history.apply('Load palette profile', withLoadedProfile(this.history.doc, palette, name));
    this.history.endGesture();
  }

  namePaletteProfile(name: string): void {
    this.history.apply('Palette profile', withProfileName(this.history.doc, name));
    this.history.endGesture();
  }

  askName(title: string, text: string, value: string): Promise<string | null> {
    return this.ask(title, text, value);
  }

  askChoice(title: string, text: string, answers: [string, string][], body: HTMLElement[] = []): Promise<string | null> {
    return this.choose(title, text, answers, body);
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
    // The search looks in the game events too.
    this.renderEffects();
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
    return this.history.doc.budgets ?? NO_BUDGETS;
  }

  setBudget(tier: TierName, metric: CostMetric, value: number | undefined, where: LimitsRef = 'project'): void {
    let b = setLimit(this.budgets(), where, tier, metric, value);
    // A number typed switches its level on (the project's, the class level, or the effect's own); clearing one does not
    // switch it off.
    if (value !== undefined) b = setLevelOn(b, levelOf(where), true);
    this.editBudgets(b, 'Budget');
  }

  editBudgets(next: Budgets, label: string): void {
    // Nothing changed (the same number typed again, a level switched to what it was): no undo step, nothing unsaved.
    if (sameBudgets(next, this.budgets())) return;
    this.history.apply(label, { ...this.history.doc, budgets: next });
    this.history.endGesture();
  }

  async newBudgetClass(effectId: string): Promise<boolean> {
    const name = await this.ask('New class', 'A name for the new class of budgets, such as Huge. This effect goes into it; type its numbers in Cost.', 'New class');
    if (!name) return false;
    const r = addClass(this.budgets(), name);
    if ('error' in r) { this.say(r.error, true); return false; }
    this.editBudgets(setEffectClass(r.budgets, effectId, r.id), 'New class');
    return true;
  }

  async renameBudgetClass(classId: string): Promise<boolean> {
    const c = this.budgets().classes.list.find((x) => x.id === classId);
    if (!c) return false;
    const name = await this.ask('Rename class', `A new name for the class "${c.name}". The effects in it stay in it.`, c.name);
    if (!name || name === c.name) return false;
    const r = renameClass(this.budgets(), classId, name);
    if ('error' in r) { this.say(r.error, true); return false; }
    this.editBudgets(r.budgets, 'Rename class');
    return true;
  }

  deleteBudgetClass(classId: string): void {
    const c = this.budgets().classes.list.find((x) => x.id === classId);
    if (!c || !confirm(`Delete the class "${c.name}"? Its numbers go with it, and the effects in it are in no class. Undo brings it back.`)) return;
    this.editBudgets(deleteClass(this.budgets(), classId), 'Delete class');
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
    if (this.previewWaits()) {
      this.say('This effect has errors: fix the problems listed at the top of the right panel, then measure.', true);
      return;
    }
    this.measuring = 'Starting…';
    this.inspector.refresh();
    this.renderStatus();
    try {
      const report = await measureCost({
        ...this.costConditions(), effect: fx, palette: this.palette, atlas: this.atlas, camera: makeGameCamera(),
        onProgress: (t) => { this.measuring = t; this.inspector.refresh(); this.renderStatus(); },
      });
      this.costReports.set(fx.id, report);
    } catch (e) {
      this.say(`Measuring failed: ${(e as Error).message}`, true);
    } finally {
      this.measuring = null;
    }
    this.inspector.refresh();
    this.renderStatus();
  }

  /** The status bar's triangles and cost: the effect's own view, its Cost section opened and scrolled to, the focus on Measure. */
  private showCostCard(): void {
    if (this.selLayer) this.selectLayer(null);
    // Looked up after the selection: the panel was built again.
    const card = this.els.root.querySelector('.inspector .costcard');
    const fold = card?.querySelector<HTMLDetailsElement>(':scope > details');
    if (fold) fold.open = true;
    card?.scrollIntoView({ block: 'start', behavior: scrollBehaviour() });
    card?.querySelector<HTMLButtonElement>('.cost-measure')?.focus({ preventScroll: true });
  }

  /**
   * The status bar's checks: with problems, the right panel's problems banner opens its list, in the view shown (the panel
   * scrolled to the top, the focus on the banner); with none, a message says so and what the checker looked at.
   */
  private showChecks(): void {
    if (this.inspector.openProblems()) return;
    this.say('All good: the checker finds no problems in this effect (its schema, colour roles, images, links between layers and lengths).');
  }

  /** Show the preview in a view (Whole screen, Game size, Close-up): the View chip's menu, and the 1, 2 and 3 keys. */
  private setView(v: ViewMode): void {
    this.preview.setView(v);
    this.toolbar.setView(v);
  }

  private setTier(t: TierName): void {
    this.tier = t;
    this.preview.vfx.tier = t;
    this.toolbar.setTier(t);
    this.renderLayers();
    this.timelineView.refresh();
    // A layer's panel says when the tier leaves it out (next to what draws it), and so does the preview.
    this.inspector.refresh();
    this.renderNotDrawn();
  }

  // ---------------------------------------------------------------- start up

  private async boot(root: HTMLElement): Promise<void> {
    const params = new URLSearchParams(location.search);
    const stored = (() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })();
    applyTheme((params.get('theme') ?? stored) === 'dark');
    // Show hints: on in a browser that never chose. ?hints=on or off (for pictures) counts for this page only, as ?theme=
    // does: it is not remembered.
    const storedHints = (() => { try { return localStorage.getItem(HINTS_KEY); } catch { return null; } })();
    applyHints((params.get('hints') ?? storedHints) !== 'off');
    // One tooltip for the page: every title, and the help texts for labels (help.ts).
    installTooltips(lookupHelp);
    this.fadeOn = (() => { try { return localStorage.getItem(FADE_KEY) !== '0'; } catch { return true; } })();
    this.frameOnly = params.get('frame') === '1';
    this.buildShell(root);
    this.preview = await Preview.create({
      container: this.els.viewport, palette: this.palette, backend: params.get('backend') === 'webgl' ? 'webgl' : 'auto', offscreen: params.get('offscreen') === '1',
    });
    this.preview.onTargetMoved = () => { this.timelineView.refresh(); this.inspector.refresh(); this.toolbar.setDistance(this.preview.viewerDistanceM); };
    this.toolbar.setDistance(this.preview.viewerDistanceM);
    // The scale it shows the game screen at, in the View chip: now, and whenever the view or its size changes it.
    this.preview.onScale = (k) => this.toolbar.setScale(k);
    this.toolbar.setScale(this.preview.scale);
    // ?frame=1 shows only the game screen at its real size: for screenshots of what a player sees.
    if (params.get('frame') === '1') { document.body.classList.add('frame-only'); this.preview.setView('frame'); }
    // The renderer, at the right end of the status bar, with the tooltip the badge in the top bar had.
    this.els.sbRenderer.textContent = this.preview.backendName;
    this.els.sbRenderer.title = this.preview.backendName === 'WebGPU'
      ? 'Drawing with the WebGPU renderer. Add ?backend=webgl to the address to try the WebGL 2 fallback.'
      : 'Drawing with the WebGL 2 fallback of the WebGPU renderer.';
    this.picker = new ColourPicker(this);
    this.gradients = new GradientPanel(this);
    this.picker.gradientSlot.append(this.gradients.el);
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
      // A project refused at start-up (a newer project.json): the demo opens instead, and its message keeps the reason.
      if (!opened) opened = await this.openProject('examples/demo-project', true, want ? (this.refusal ?? undefined) : undefined);
    } catch (e) {
      this.say(`Could not open a project: ${(e as Error).message}`, true);
    }
    const fxParam = params.get('effect');
    if (fxParam && effectById(this.history.doc, fxParam)) this.selectEffect(fxParam);
    // The preview's canvas is cleared when its size changes, after the frame was drawn (its own observer sizes it): draw the
    // moment again at once, so the preview follows a splitter while it is dragged instead of showing an empty frame.
    // Created after the preview's observer, so it runs after it.
    new ResizeObserver(() => { if (this.booted && !this.drawing && !this.measuring) void this.frame(this.lastFrame); }).observe(this.els.viewport);
    this.booted = true;
    this.lastFrame = performance.now();
    this.askFrame(true);
  }

  /**
   * Ask the screen for the next frame, unless one is asked for already or the browser check drives the clock (`force`:
   * even then). Only one frame is ever waiting, so a frame drawn outside the loop (showAt) starts no second loop.
   */
  private askFrame(force = false): void {
    if (this.frameAsked || (!force && (window as unknown as { __vfxManual?: boolean }).__vfxManual)) return;
    this.frameAsked = true;
    requestAnimationFrame((t) => { this.frameAsked = false; void this.frame(t); });
  }

  private buildShell(root: HTMLElement): void {
    // ------------------------------------------------ the top bar (docs/ui-redesign.md 6.1)
    // The bars' tooltips are their help texts (help.ts, by label and region: data-help-section) with the shortcut; an
    // icon-only button's tooltip starts with its name. Undo and Redo name the step (renderTopbar).
    const logo = h('button', { class: 'logo', title: 'Main menu', attrs: { type: 'button', 'aria-label': 'Shamble VFX main menu', 'data-help-label': 'Main menu' } },
      h('span', { class: 'brand' }, h('b', { text: 'Shamble' }), h('span', { text: 'VFX' })), icon('chevron-down'));
    // The project's name keeps its text as it was ("Demo project •"): the lock of an example sits between the name and the dot.
    const lock = h('span', { class: 'lock', attrs: { role: 'img', 'aria-label': 'an example, read-only' } }, icon('lock'));
    tip(lock, 'An example: it can\'t change. Save as makes your own copy.');
    const projectName = h('span', { class: 'project-name' }, h('span', { class: 'pn-text' }), lock, h('span', { class: 'pn-dot' }));
    const project = h('button', { class: 'project-btn', attrs: { type: 'button', 'data-help-label': 'Project' }, on: { click: () => void this.projectsDialog() } }, projectName);
    const save = h('button', { class: 'tb save', attrs: { type: 'button' }, on: { click: () => void this.save() } }, h('span', { class: 'save-icon' }, icon('save')), h('span', { class: 'save-label', text: 'Save' }));
    // An icon toggle: the sun shows in Day, the moon in Night (the stylesheet picks one by aria-pressed).
    // Show hints, a light bulb, left of Night mode: an icon toggle (on: the field colour, the bulb in --accent-ink).
    const hints = iconButton({ icon: 'hint', label: 'Show hints', className: 'tb hints-toggle', pressed: hintsOn(), onClick: () => this.setHints(!hintsOn()) });
    const night = iconButton({ icon: ['sun', 'moon'], label: 'Night mode', className: 'tb theme-toggle', pressed: document.documentElement.dataset.theme === 'dark',
      onClick: () => this.setTheme(document.documentElement.dataset.theme !== 'dark') });
    const undo = iconButton({ icon: 'undo', label: 'Undo', className: 'tb', onClick: () => this.history.undo() });
    const redo = iconButton({ icon: 'redo', label: 'Redo', className: 'tb', onClick: () => this.history.redo() });
    const status = h('div', { class: 'status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const dialog = h('dialog', { class: 'dlg' });
    const top = h('header', { class: 'topbar', attrs: { 'data-help-section': 'Top bar' } },
      logo, h('div', { class: 'project' }, project),
      h('div', { class: 'tools' }, undo, redo, h('span', { class: 'tb-sep', attrs: { 'aria-hidden': 'true' } }), hints, night, h('span', { class: 'tb-sep', attrs: { 'aria-hidden': 'true' } }), save,
        h('button', { class: 'tb export', attrs: { type: 'button' }, on: { click: () => void this.exportDialog() } }, icon('export'), h('span', { text: 'Export…' }))));
    // The main menu: what left the top bar (Projects…, Save as…, Keys) and the rest of a project's commands. A menu of
    // dom.ts, appended to document.body, so nothing clips it.
    menu({ opener: logo, id: 'main-menu', label: 'Main menu', helpSection: 'Main menu', items: [
      { label: 'Projects…', icon: 'projects', action: () => void this.projectsDialog() },
      { label: 'New project…', icon: 'plus', action: () => void this.newProject() },
      { label: 'Save', icon: 'save', shortcut: 'Ctrl+S', ariaKeys: 'Control+S', disabled: () => this.els.save.disabled, action: () => void this.save() },
      { label: 'Save as…', icon: 'save-as', disabled: () => !this.project, action: () => void this.saveAsDialog() },
      { label: 'Export…', icon: 'export', disabled: () => !this.project, action: () => void this.exportDialog() },
      { label: 'Import an export…', icon: 'import', action: () => void this.projectsDialog(true) },
      'divider',
      { label: 'Show hints', checked: hintsOn, action: () => this.setHints(!hintsOn()) },
      { label: 'Night mode', checked: () => document.documentElement.dataset.theme === 'dark', action: () => this.setTheme(document.documentElement.dataset.theme !== 'dark') },
      { label: 'Keyboard shortcuts', icon: 'keys', shortcut: '?', ariaKeys: '?', action: () => this.keysDialog() },
    ] });

    // ------------------------------------------------ the left sidebar: effects over layers
    this.effectsList = buildEffectsList({
      effects: () => this.history.doc.effects,
      selected: () => this.selEffect,
      layerSelected: () => this.selLayer !== null,
      colourOf: (fx) => resolveRole(this.palette, fx.controls.colour, this.faction),
      eventsOf: (id) => this.eventsValue[id] ?? [],
      projectId: () => this.project?.id ?? null,
      select: (id) => this.selectEffect(id),
      newEffect: () => this.newEffect(),
      fromPreset: () => void this.presetDialog(),
      duplicate: (id) => this.duplicateEffect(id),
      rename: (id, name, label) => this.renameEffect(id, name, label),
      askFolder: (name) => this.ask('New folder', `A name for the new folder. "${name}" moves into it. A " / " in the name makes a folder inside a folder.`, 'New folder'),
      remove: (id) => this.deleteEffect(id),
      say: (text, bad) => this.say(text, bad),
    });
    const effects = this.effectsList.list;
    const effectsSection = this.effectsList.el;
    this.layersList = buildLayersList({
      effect: () => this.effect(),
      selected: () => this.selLayer,
      select: (id) => this.selectLayer(id),
      tier: () => this.tier,
      imageUrl: (n) => this.imageUrl(n),
      add: (kind) => this.addLayer(kind),
      move: (id, delta) => this.moveLayerBy(id, delta),
      duplicate: (id) => this.duplicateLayerOf(id),
      rename: (id, name) => this.renameLayer(id, name),
      remove: (id) => this.deleteLayerOf(id),
      hover: (id) => this.hoverLayer(id),
      hovered: () => this.hovered,
    });
    const layers = this.layersList.list;
    const layersSection = this.layersList.el;
    const left = h('aside', { class: 'left' }, effectsSection, layersSection);

    // ------------------------------------------------ the viewport toolbar (6.3): Fire, the chips, Fade other layers, View
    this.toolbar = buildToolbar({
      factions: builtInPalette.factions,
      state: { scene: SCENES[0]!.id, faction: this.faction, relation: 'enemy', distance: 4, tier: this.tier, view: 'whole', closeOn: 'target', fade: this.fadeOn },
      act: {
        fire: () => this.fire(),
        scene: (id) => this.chooseScene(id),
        faction: (f) => this.setFaction(f),
        relation: (r) => { this.preview.setRelation(r); this.toolbar.setRelation(r); },
        distance: (m) => { this.preview.setDistance(m); this.timelineView.refresh(); },
        tier: (t) => this.setTier(t),
        view: (v) => this.setView(v),
        closeOn: (c) => { this.preview.setCloseOn(c); this.toolbar.setCloseOn(c); },
        fade: (on) => this.setFade(on),
      },
    });
    // Fade other layers: an icon toggle, on until switched off. Its tooltip: its name and the help text (help.ts).
    this.fadeBtn = this.toolbar.fadeButton;
    const viewport = h('div', { class: 'viewport' });
    const vbar = this.toolbar.el;
    const hint = h('div', { class: 'vhint', text: DRAG_HINT });
    // What the preview does not draw, and why (UI phase 6, Part B): over the preview, above the drag hint, in the lower left
    // corner. A state, not a hint: Show hints off keeps it.
    const vnotes = h('div', { class: 'vnotes', attrs: { 'aria-live': 'polite' } });

    // ------------------------------------------------ the timeline's header: the transport (6.5)
    const play = iconButton({ icon: 'play', label: 'Play', className: 'play', onClick: () => this.togglePlay() });
    this.loopBtn = h('button', { class: 'tb', attrs: { type: 'button', 'aria-pressed': 'true' }, on: { click: () => this.setLoop(!this.loop) } }, icon('loop'), 'Loop');
    // New shot each loop (UI phase 6, Part B), next to Loop: a toggle as Loop is, on at first. In a header too narrow for its
    // words it says "New shot" (the stylesheet); its full name stays its name for screen readers and its tooltip's.
    this.newShotBtn = h('button', { class: 'tb new-shot', attrs: { type: 'button', 'aria-pressed': 'true', 'aria-label': 'New shot each loop' }, on: { click: () => this.setNewShot(!this.newShot) } },
      icon('dice'), h('span', {}, 'New shot', h('span', { class: 'new-shot-more', text: ' each loop' })));
    this.speedCtl = segmented<number>({ label: 'Speed', options: SPEEDS.map((s) => ({ value: s, label: s === 1 ? '1×' : s === 0.5 ? '½×' : s === 0.25 ? '¼×' : '⅒×' })), value: 1,
      onChange: (s) => { this.speed = s; this.speedCtl.set(s); }, small: true, inline: true });
    // The time readout: the current time (click it to type one), the length, the step; while firing, how many plays run.
    const timeNow = h('button', { class: 'time-now', attrs: { type: 'button', 'aria-label': 'Go to a time', 'data-help-label': 'Time' }, on: { click: () => this.editTime() } });
    const timeInput = h('input', { class: 'num time-input', attrs: { type: 'text', inputmode: 'decimal', spellcheck: 'false', 'aria-label': 'Go to a time, in ms' } });
    timeInput.hidden = true;
    timeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.endTimeEdit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); this.endTimeEdit(false); }
    });
    timeInput.addEventListener('blur', () => { if (this.timeEditing) this.endTimeEdit(false, false); });
    const timeLen = h('span', { class: 'time-len' });
    const timeStep = h('span', { class: 'time-step', title: 'Steps of 1/12 s, the comic step rate' });
    const timeFiring = h('span', { class: 'time-firing' });
    const time = h('span', { class: 'time', attrs: { 'data-help-label': 'Time' } }, timeNow, timeInput, timeLen, timeStep, timeFiring);
    const transport = h('div', { class: 'transport', attrs: { 'data-help-section': 'Transport' } },
      iconButton({ icon: 'step-back', label: 'Step back', className: 'tb', onClick: () => this.step(-1) }),
      play,
      iconButton({ icon: 'step-fwd', label: 'Step forward', className: 'tb', onClick: () => this.step(1) }),
      this.loopBtn, this.newShotBtn, this.speedCtl.el, time);
    const timelinePane = h('section', { class: 'timeline-pane', attrs: { 'aria-label': 'Timeline' } }, transport, h('div', { class: 'timeline-slot' }));
    // The status bar shows the drag hint while the pointer is over the preview (data-status-hint).
    const viewportWrap = h('div', { class: 'viewport-wrap', attrs: { 'data-status-hint': DRAG_HINT } }, viewport, h('div', { class: 'vcorner' }, vnotes, hint));
    const centre = h('main', { class: 'centre' }, vbar, viewportWrap, timelinePane);
    const right = h('div', { class: 'right' });

    // ------------------------------------------------ the status bar (6.8): never the class "status" (the message's)
    const sbChecks = h('button', { class: 'sb-item sb-checks', attrs: { type: 'button', 'data-help-label': 'Checks' }, on: { click: () => this.showChecks() } });
    const sbTris = h('span', { class: 'sb-tris' }), sbDraws = h('span', { class: 'sb-draws' });
    const sbStats = h('button', { class: 'sb-item sb-stats', attrs: { type: 'button', 'data-help-label': 'Triangles and draw calls' }, on: { click: () => this.showCostCard() } }, sbTris, sbDraws);
    const sbCost = h('button', { class: 'sb-item sb-cost', attrs: { type: 'button', 'data-help-label': 'Cost' }, on: { click: () => this.showCostCard() } });
    const sbHint = h('span', { class: 'sb-hint' });
    const sbRenderer = h('span', { class: 'sb-renderer', attrs: { 'data-help-label': 'Renderer' } });
    const sbKeys = iconButton({ icon: 'question', label: 'Keyboard shortcuts', className: 'sb-item sb-keys', onClick: () => this.keysDialog() });
    sbKeys.setAttribute('data-help-label', 'Keyboard shortcuts');
    const statusbar = h('footer', { class: 'statusbar', attrs: { 'data-help-section': 'Status bar' } },
      h('div', { class: 'sb-left' }, sbChecks, sbStats, sbCost), sbHint, h('div', { class: 'sb-right' }, sbRenderer, sbKeys));

    const workspace = h('div', { class: 'workspace' }, left, centre, right);
    root.append(top, workspace, statusbar, status, dialog);
    // The four splitters, over the lines between the zones (layout.ts keeps the sizes and remembers them).
    this.grid = new GridSizes({ root, left, right, centre, effects: effectsSection, timeline: timelinePane });
    workspace.append(this.grid.splitters.left.el, this.grid.splitters.right.el);
    left.append(this.grid.splitters.effects.el);
    centre.append(this.grid.splitters.timeline.el);
    this.grid.apply();
    // The hint for what is under the pointer, in the middle of the status bar.
    document.addEventListener('pointerover', (e) => this.setStatusHint(((e.target as Element).closest?.('[data-status-hint]') as HTMLElement | null)?.dataset.statusHint ?? ''));
    document.addEventListener('pointerout', (e) => { if (e.relatedTarget === null) this.setStatusHint(''); });
    this.els = {
      root, projectName, project, lock, save, undo, redo, hints, night, effects, layers, viewport, play, time, timeNow, timeInput, timeLen, timeStep, timeFiring, status, dialog,
      sbChecks, sbTris, sbDraws, sbCost, sbHint, sbRenderer, vnotes,
    };
  }

  // ---------------------------------------------------------------- projects

  /**
   * Open a project. quiet: say nothing when it cannot be read (start-up tries the last project first). insteadOf: why the
   * project asked for was refused, said before "Opened … instead" (start-up opens the demo in its place).
   */
  private async openProject(id: string, quiet = false, insteadOf?: string): Promise<boolean> {
    this.refusal = null;
    if ((this.history.dirty || this.metaDirty) && !confirm('You have changes that are not saved. Open another project anyway?')) return false;
    let contents: ProjectContents;
    try {
      contents = await this.store.open(id);
    } catch (e) {
      if (!quiet) this.say(`Could not open the project: ${(e as Error).message}`, true);
      return false;
    }
    // project.json first: one of a newer version is not opened, so it is never written over.
    const meta = await readProject(this.store, id);
    if (!meta.ok) {
      this.refusal = `Could not open ${contents.name}: ${meta.error}.`;
      this.say(this.refusal, true);
      return false;
    }
    this.project = contents;
    try { localStorage.setItem(LAST_PROJECT, id); } catch { /* ignore */ }
    this.useProjectFile(meta.project ?? newProjectFile(contents.name), meta.upgradedFrom !== undefined);
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
    this.fileEffectIds = new Set(effects.map((e) => e.id));
    this.copies.clear();
    const profile = this.projectFile.paletteProfile;
    this.history.reset({ effects, palette: projectPalette, budgets: this.budgetsOnDisk, ...(profile !== undefined ? { paletteProfile: profile } : {}) });
    this.preview.vfx.palette = projectPalette;
    this.player.clear();
    this.selEffect = effects[0]?.id ?? null;
    this.selLayer = null;
    this.mainTime = 0;
    // Show the first effect in the scene it remembers.
    const scene = this.sceneOf(this.selEffect);
    if (this.preview && this.preview.scene.id !== scene) { this.preview.setScene(scene); this.toolbar?.setDistance(this.preview.viewerDistanceM); }
    this.toolbar?.setScene(scene);
    this.renderAll();
    const opened = insteadOf ? `${insteadOf} Opened ${contents.name} instead` : `Opened ${contents.name}`;
    this.say(bad.length ? `${opened}, with problems: ${bad.join(' | ')}` : `${opened}${contents.writable ? '' : ' (an example: use "Save as" to keep changes)'}.`, bad.length > 0 || !!insteadOf);
    return true;
  }

  /**
   * project.json as read (version 2; old: it was an older version): the scene each effect is shown in, the game events
   * each answers, and the budgets. A project without a readable project.json opens with a fresh one.
   */
  private useProjectFile(p: ProjectFile, old: boolean): void {
    this.projectFile = p;
    this.projectFileOld = old;
    this.previewScenes = {};
    for (const [fx, v] of Object.entries(p.preview ?? {})) {
      const scene = (v as { scene?: unknown } | null)?.scene;
      if (typeof scene === 'string' && SCENES.some((x) => x.id === scene)) this.previewScenes[fx] = scene;
    }
    this.eventsValue = readEvents(p.events);
    // They go into the document when the project's effects do (openProject), and so does the palette profile's name.
    this.budgetsOnDisk = p.budgets;
    this.profileOnDisk = p.paletteProfile;
    this.costReports.clear();
    this.metaDirty = false;
  }

  /** Show the chosen scene, and remember it for the effect shown. */
  private chooseScene(id: string): void {
    if (!this.preview.setScene(id)) return;
    this.toolbar.setScene(id);
    if (this.selEffect && this.previewScenes[this.selEffect] !== id) {
      this.previewScenes[this.selEffect] = id;
      this.metaDirty = true;
      this.renderTopbar();
    }
    this.toolbar.setDistance(this.preview.viewerDistanceM);
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
    if (this.booted) this.renderStatus();
    // A sprite's picture in the Layers list and on the timeline comes from these images.
    if (this.timelineView) { this.renderLayers(); this.timelineView.refresh(); }
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
      const ids = doc.effects.map((e) => e.id);
      const effectsChanged = ids.length !== this.fileEffectIds.size || ids.some((id) => !this.fileEffectIds.has(id));
      const budgets = doc.budgets ?? NO_BUDGETS;
      if (this.metaDirty || this.projectFileOld || effectsChanged || budgets !== this.budgetsOnDisk || doc.paletteProfile !== this.profileOnDisk || projectId !== this.project?.id) {
        const preview: Record<string, { scene: string }> = {};
        for (const fx of doc.effects) if (this.previewScenes[fx.id]) preview[fx.id] = { scene: this.previewScenes[fx.id]! };
        const events: Record<string, string[]> = {};
        for (const fx of doc.effects) if (this.eventsValue[fx.id]?.length) events[fx.id] = [...this.eventsValue[fx.id]!];
        let base = this.projectFile;
        if (projectId !== this.project?.id) {
          // Another project's file: keep what it says (never write over one of a newer version).
          const other = await readProject(this.store, projectId);
          if (!other.ok) throw new Error(other.error);
          base = other.project ?? newProjectFile(this.project?.name ?? projectId);
        }
        const name = projectId === this.project?.id ? (this.projectFile.name ?? this.project?.name) : base.name;
        // The events, scenes and budgets of effects that are gone are left out of the file. They stay here: undoing the
        // delete brings the effect back with them, and the next save writes them again (the effects differ once more).
        const file: ProjectFile = { ...base, ...(name ? { name } : {}), events, preview, budgets: dropMissingEffects(budgets, ids) };
        // The palette profile the colours came from goes with the colours (palette.json above).
        if (doc.paletteProfile !== undefined) file.paletteProfile = doc.paletteProfile;
        else delete file.paletteProfile;
        await writeProject(this.store, projectId, file);
        if (projectId === this.project?.id) {
          this.projectFile = file; this.projectFileOld = false; this.fileEffectIds = new Set(ids); this.budgetsOnDisk = budgets; this.profileOnDisk = doc.paletteProfile;
        }
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
      // The copy's project.json is fresh (its own name only). Keep everything the project said (its events, scenes,
      // budgets, palette profile and notes) under the copy's own name: saving writes it into the copy, as version 2.
      this.projectFile = { ...this.projectFile, name: copy.name };
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
      const meta = await readProject(this.store, p.id);
      const scenes = ((meta.ok ? meta.project?.preview : undefined) ?? {}) as Record<string, { scene?: string } | undefined>;
      const items: HTMLElement[] = [];
      for (const file of contents.effects) {
        let fx: EffectFile | undefined;
        try { fx = checkEffect(await readJson(this.store, p.id, `effects/${file}`), { palette: builtInPalette }).effect; } catch { fx = undefined; }
        if (!fx) continue;
        const preset = fx, scene = scenes[fx.id]?.scene;
        items.push(h('li', {}, h('button', { class: 'linkish', attrs: { type: 'button' }, text: fx.name, on: { click: () => { d.close(); this.addFromPreset(preset, scene); } } }),
          h('span', { class: 'meta', text: ` ${fx.layers.length} layers` })));
      }
      if (items.length) groups.push(h('h3', { text: p.name }), h('ul', { class: 'plist' }, ...items));
    }
    d.replaceChildren(h('h2', { text: 'New from preset' }), h('p', { text: 'A copy goes into this project; the preset itself stays as it is.' }), ...groups,
      h('div', { class: 'dlg-buttons' }, h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Close', on: { click: () => d.close() } })));
    d.showModal();
  }

  private addFromPreset(preset: EffectFile, scene?: string): void {
    const id = freeEffectId(this.history.doc, preset.id);
    const fx: EffectFile = { ...structuredClone(preset), id, name: id === preset.id ? preset.name : `${preset.name} (copy)` };
    // A preset's game events stay with the preset: one event plays one effect.
    if (this.eventsValue[id]) { delete this.eventsValue[id]; this.metaDirty = true; }
    this.copies.delete(id);
    this.history.apply('New from preset', this.withoutBudgetOf(addEffect(this.history.doc, fx), id));
    if (scene && SCENES.some((x) => x.id === scene)) { this.previewScenes[id] = scene; this.metaDirty = true; }
    this.selectEffect(id);
    this.say(`Added "${fx.name}" from the presets.`);
  }

  /** Projects: open one, make a new one, or import an export. importFirst: the focus starts on the exports (Import an export…). */
  private async projectsDialog(importFirst = false): Promise<void> {
    let listing;
    try { listing = await this.store.list(); } catch (e) { this.say((e as Error).message, true); return; }
    const d = this.els.dialog;
    const rows = listing.projects.map((p) => h('li', {},
      h('button', { class: 'linkish', attrs: { type: 'button' }, text: p.name, on: { click: () => { d.close(); void this.openProject(p.id); } } }),
      h('span', { class: 'meta', text: ` ${p.id}${p.writable ? '' : ' · example, read-only'}` })));
    let exportsList: ExportSummary[] = [];
    try { exportsList = await this.store.listExports(); } catch { /* no exports to show */ }
    const importRows = exportsList.map((e) => h('li', {},
      h('button', { class: 'linkish', attrs: { type: 'button' }, text: e.name, on: { click: () => { d.close(); void this.importDialog(e); } } }),
      h('span', { class: 'meta', text: ` exports/${e.folder} · ${e.effects} effect${e.effects === 1 ? '' : 's'}, ${e.events} event${e.events === 1 ? '' : 's'}` })));
    const importTitle = h('h3', { text: 'Import an export', attrs: { 'data-tip': 'Makes a new project from an export folder: the effects as they are, each image cut back out of the atlas, the game events, scenes and budgets.' } });
    d.replaceChildren(
      h('h2', { text: 'Projects' }),
      h('ul', { class: 'plist' }, ...rows),
      importTitle,
      h('p', { text: 'Makes a new project from an export folder, with its effects, images, game events, scenes and budgets.' }),
      importRows.length ? h('ul', { class: 'plist imports' }, ...importRows) : h('p', { class: 'state-line', text: 'No exports yet: Export… writes one into exports/.' }),
      h('div', { class: 'dlg-buttons' },
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'New project…', on: { click: () => { d.close(); void this.newProject(); } } }),
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Close', on: { click: () => d.close() } })));
    d.showModal();
    if (importFirst) {
      importTitle.scrollIntoView({ block: 'nearest' });
      (d.querySelector('.imports button') as HTMLButtonElement | null)?.focus();
    }
  }

  /** A new, empty project in projects/, opened at once: it asks for a name first (the main menu, and the Projects dialog). */
  private async newProject(): Promise<void> {
    const name = await this.ask('New project', 'A name for the project. It goes in the projects folder (kept out of git).', 'My effects');
    if (!name) return;
    try { const p = await this.store.create('projects', name); await this.openProject(p.id); } catch (e) { this.say((e as Error).message, true); }
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

  /** A question with a few answers (the first is the main one), and optional parts under its words; null when the dialog is closed. */
  private choose(title: string, text: string, answers: [string, string][], body: HTMLElement[] = []): Promise<string | null> {
    const d = this.els.dialog;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: string | null) => { if (done) return; done = true; d.close(); resolve(v); };
      d.replaceChildren(h('h2', { text: title }), h('p', { text }), ...body,
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
      ['Ctrl+S', 'Save'], ['Delete', 'Delete the selected layer'],
      ['F2', 'Rename the selected layer, or the effect, in place'], ['Ctrl+D', 'Duplicate the selected layer, or the effect'],
      ['Ctrl+] / Ctrl+[', 'Move the selected layer up / down the list'], ['/', 'Search the effects'],
      ['Esc', 'Cancel a rename or a drag, clear the search, or close the menu or the colour picker; with none of these, leave the layer and go back to the effect'],
      ['?', 'These keyboard shortcuts'], ['Arrow keys on a splitter', 'Move it 16 px'],
      ['Drag the ground', 'Move the target'], ['Shift + drag', 'Move the stand-in'],
    ];
    d.replaceChildren(h('h2', { text: 'Keyboard shortcuts' }), h('table', { class: 'keys' }, ...keys.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: v })))),
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
      this.toolbar.setDistance(this.preview.viewerDistanceM);
    }
    this.toolbar?.setScene(scene);
    this.renderAll();
  }

  private newEffect(): void {
    const id = freeEffectId(this.history.doc, 'new_effect');
    const fx = newEffect(id, 'New effect');
    if (this.eventsValue[id]) { delete this.eventsValue[id]; this.metaDirty = true; }
    this.copies.delete(id);
    this.history.apply('New effect', this.withoutBudgetOf(addEffect(this.history.doc, fx), id));
    this.selectEffect(id);
  }

  /**
   * A new effect that takes the id of a deleted one starts without that one's budgets and class: in the same undo step, so
   * undoing the new effect brings them back for the deleted one.
   */
  private withoutBudgetOf(doc: EditorDoc, id: string): EditorDoc {
    const b = doc.budgets ?? NO_BUDGETS;
    const next = forgetEffect(b, id);
    return next === b ? doc : { ...doc, budgets: next };
  }

  /**
   * Duplicate an effect (the Effects list's menu, Ctrl+D with no layer selected): "<name> copy", with its scene and its own
   * budgets, without its game events (one event plays one effect), selected. One undo step takes away the copy, its scene
   * and its budgets. project.json is written at the next save anyway, since the effects differ, so nothing else is unsaved.
   */
  duplicateEffect(id: string): void {
    const r = duplicateEffect(this.history.doc, id);
    if (!r.id) return;
    const copy = r.id;
    // The copy's id may be a deleted effect's: it starts without that one's events and budgets (they were not in the file).
    delete this.eventsValue[copy];
    this.copies.delete(copy);
    const scene = this.previewScenes[id];
    if (scene) this.previewScenes[copy] = scene; else delete this.previewScenes[copy];
    // Its own budgets, in the document, in the copy's undo step.
    let budgets = forgetEffect(this.budgets(), copy);
    const own = budgets.effects[id];
    if (own) budgets = { ...budgets, effects: { ...budgets.effects, [copy]: structuredClone(own) } };
    this.copies.set(copy, {});
    this.history.apply('Duplicate effect', { ...r.doc, budgets });
    this.history.endGesture();
    this.selectEffect(copy);
  }

  /** A new name for an effect, its folder included: renamed in place, or moved to a folder. One undo step. */
  private renameEffect(id: string, name: string, label: string): void {
    this.history.apply(label, setEffectValue(this.history.doc, id, ['name'], name));
    this.history.endGesture();
  }

  /**
   * Undo took a copy away: its scene goes with it (kept, for redo). Redo brought it back: so does its scene. A copy deleted
   * (an edit) keeps it, as every deleted effect does, so undoing the delete finds it. (Its budgets are in the document, so
   * undo and redo move them with the copy.)
   */
  private followCopies(why: 'edit' | 'undo' | 'redo' | 'reset'): void {
    // A save says 'reset' too, and keeps the undo steps: only undo and redo move a copy's scene.
    if (why !== 'undo' && why !== 'redo') return;
    for (const [id, kept] of this.copies) {
      const here = !!effectById(this.history.doc, id), was = this.shownIds.has(id);
      if (was && !here && why === 'undo') {
        kept.scene = this.previewScenes[id];
        delete this.previewScenes[id];
      } else if (!was && here && why === 'redo') {
        if (kept.scene) this.previewScenes[id] = kept.scene;
      }
    }
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

  /** F2: rename the selected layer in place, or the effect when no layer is selected. True when something is renamed. */
  private renameSelection(): boolean {
    if (this.selLayer) this.layersList.startRename(this.selLayer);
    else if (this.selEffect) this.effectsList.startRename(this.selEffect);
    else return false;
    return true;
  }

  /** Ctrl+D: duplicate the selected layer, or the effect when no layer is selected. True when something is duplicated. */
  private duplicateSelection(): boolean {
    if (!this.selEffect) return false;
    if (this.selLayer) this.duplicateSelected();
    else this.duplicateEffect(this.selEffect);
    return true;
  }

  private moveSelected(delta: number): void {
    if (this.selLayer) this.moveLayerBy(this.selLayer, delta);
  }

  /**
   * Move a layer by delta places in the file (+1: up the list, so it draws over more): a row's buttons and menu, Ctrl+] and
   * Ctrl+[, and a drag in the list, which moves it any number of places. One undo step.
   */
  private moveLayerBy(id: string, delta: number): void {
    if (!this.selEffect || !delta) return;
    this.history.apply('Move layer', moveLayer(this.history.doc, this.selEffect, id, delta));
    this.history.endGesture();
    // The moved row stays in view in both places: at the edge of what shows, Ctrl+] or Ctrl+[ took it under the timeline's
    // sticky ruler or out of the Layers list.
    this.showLayerRow(id);
  }

  private duplicateSelected(): void {
    if (this.selLayer) this.duplicateLayerOf(this.selLayer);
  }

  /** Duplicate a layer: the copy goes just above it, and is selected. */
  private duplicateLayerOf(id: string): void {
    if (!this.selEffect) return;
    const r = duplicateLayer(this.history.doc, this.selEffect, id);
    this.history.apply('Duplicate layer', r.doc);
    if (r.id) this.selectLayer(r.id);
  }

  private deleteSelected(): void {
    if (this.selLayer) this.deleteLayerOf(this.selLayer);
  }

  /** Delete a layer. When it was the selected one, the layer that takes its place in the list is selected. */
  private deleteLayerOf(id: string): void {
    if (!this.selEffect) return;
    const fx = this.effect()!;
    const i = fx.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    const wasSelected = id === this.selLayer;
    this.history.apply('Delete layer', removeLayer(this.history.doc, this.selEffect, id));
    const after = this.effect()!.layers;
    if (wasSelected) this.selectLayer(after[Math.min(i, after.length - 1)]?.id ?? null);
  }

  /** A new name for a layer, typed in its row: one undo step. */
  // The right panel header's More menus (UI phase 6) do what the lists' row menus do: the same functions.

  /** Move to folder… for an effect, below a button (the header's More): the Effects list's folder menu. */
  openFolderMenu(id: string, below: HTMLElement): void {
    this.effectsList.openFolderMenu(id, below);
  }

  /** The right panel's Name field: the Effects list's rename rules (one function, renameTo). */
  renameEffectTo(id: string, typed: string): boolean {
    return this.effectsList.renameTo(id, typed);
  }

  folders(): string[] {
    return allFolders(this.history.doc.effects);
  }

  /** The right panel's Folder select: the Effects list's Move to folder. */
  moveToFolder(id: string, folder: string): void {
    this.effectsList.moveToFolder(id, folder);
  }

  /** The Folder select's New folder…: the Effects list's, with the same question. */
  newFolder(id: string): Promise<boolean> {
    return this.effectsList.newFolder(id);
  }

  /** Rename a layer in place, in its row of the Layers list, as F2 and the row's menu do. */
  renameLayerInPlace(id: string): void {
    this.layersList.startRename(id);
  }

  duplicateLayer(id: string): void {
    this.duplicateLayerOf(id);
  }

  moveLayer(id: string, delta: number): void {
    this.moveLayerBy(id, delta);
  }

  deleteLayer(id: string): void {
    this.deleteLayerOf(id);
  }

  private renameLayer(id: string, name: string): void {
    if (!this.selEffect) return;
    this.history.apply('Rename layer', setLayerValue(this.history.doc, this.selEffect, id, ['name'], name));
    this.history.endGesture();
  }

  deleteEffect(id: string): void {
    if (!confirm('Delete this effect? (Undo brings it back until you leave.)')) return;
    this.history.apply('Delete effect', removeEffect(this.history.doc, id));
    this.selEffect = this.history.doc.effects[0]?.id ?? null;
    this.selLayer = null;
    this.renderAll();
  }

  private onDocChange(why: 'edit' | 'undo' | 'redo' | 'reset'): void {
    this.followCopies(why);
    this.shownIds = new Set(this.history.doc.effects.map((e) => e.id));
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
    this.renderStatus();
    if (why === 'undo' || why === 'redo') this.say(`${why === 'undo' ? 'Undid' : 'Redid'}.`);
  }

  // ---------------------------------------------------------------- playback

  private inputs(): { origin: Vec3; target: Vec3 } {
    const o = this.preview.origin, t = this.preview.target;
    return { origin: [o.x, o.y, o.z], target: [t.x, t.y, t.z] };
  }

  private togglePlay(): void {
    this.lookStill = null;
    const len = this.timeline()?.lengthMs ?? 0;
    if (!this.playing && this.mainTime >= len) this.mainTime = 0;
    this.playing = !this.playing;
    this.renderTransport();
  }

  private setLoop(v: boolean): void {
    this.loop = v;
    this.loopBtn.setAttribute('aria-pressed', String(v));
  }

  /** New shot each loop on or off (not remembered, as Loop is not). Off, Play loops the same shot; Fire still makes a new one. */
  private setNewShot(v: boolean): void {
    this.newShot = v;
    this.newShotBtn.setAttribute('aria-pressed', String(v));
  }

  /** Fade other layers on or off (remembered). The preview shows it in its next frame. */
  private setFade(on: boolean): void {
    this.fadeOn = on;
    this.fadeBtn.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem(FADE_KEY, on ? '1' : '0'); } catch { /* storage may be blocked */ }
  }

  /**
   * What fades in the preview: every layer but the one in focus (the row under the mouse, else the selected layer; for a
   * projectile, the layers riding it). Null when nothing fades: no layer in focus, Fade other layers off, or ?frame=1.
   */
  private fadeFocus(fx: EffectFile | undefined): { effect: string; keep: Set<number> } | null {
    if (!fx || !this.fadeOn || this.frameOnly) return null;
    // A hovered row whose layer is gone (deleted under the mouse) counts as no hover.
    const keep = (this.hovered ? keptLayers(fx, this.hovered) : undefined) ?? (this.selLayer ? keptLayers(fx, this.selLayer) : undefined);
    return keep ? { effect: fx.id, keep } : null;
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
    this.lookStill = null;
    this.seed = nextSeed(this.seed);
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
      this.askFrame();
      return;
    }
    const fx = this.effect();
    const len = this.timeline()?.lengthMs ?? 0;
    if (this.playing) {
      this.clock += dt * this.speed;
      if (Number.isFinite(this.mainTime)) {
        this.mainTime += dt * this.speed;
        if (this.mainTime >= len) {
          // Each loop starts after a short rest; with New shot each loop on, as a new shot (everything random changes).
          if (this.loop) { this.mainTime = -LOOP_REST_MS; if (this.newShot) this.seed = nextSeed(this.seed); }
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
    const drawable = fx && !this.previewWaits();
    const shown = fx && drawable && Number.isFinite(this.mainTime) && this.mainTime >= 0;
    const focus = this.fadeFocus(fx);
    this.drawing = true;
    await this.preview.render((vfx) => {
      const params: DrawParams = { seed: this.seed, timeMs: this.mainTime, inputs: this.inputs(), faction: this.faction, relation: this.preview.relation, viewerDistanceM: this.preview.viewerDistanceM };
      if (!focus) {
        // The game's look: the runtime's own calls, nothing changed.
        if (shown) vfx.draw(fx, params);
        vfx.drawPlaying(this.player, this.clock, lookup);
        return;
      }
      // Fade other layers: each draw's new vertices, as soon as the runtime has written them and before anything goes to
      // the GPU (vfx.end). Effects still playing from an earlier Fire of another effect fade as a whole.
      const draw = (e: EffectFile, p: DrawParams) => {
        const from = sinkMarks(vfx.sink);
        vfx.draw(e, p);
        fadeOthers(vfx.sink, from, e.id === focus.effect ? focus.keep : NOTHING_KEPT);
      };
      if (shown) draw(fx, params);
      // As vfx.drawPlaying draws them.
      for (const pl of this.player.alive(this.clock, lookup)) {
        const e = lookup(pl.effectId);
        if (e) draw(e, { seed: pl.seed, timeMs: this.clock - pl.startMs, inputs: pl.inputs, faction: pl.faction, relation: pl.relation, viewerDistanceM: pl.viewerDistanceM });
      }
    }).finally(() => { this.drawing = false; });
    // The Look: the selected layer alone, in its own small picture, at the preview's speed.
    const layer = this.layer();
    this.inspector.look.frame(dt * this.speed, fx && layer ? {
      effect: fx, layer, timeline: this.timeline()!, seed: this.seed, faction: this.faction, relation: this.preview.relation,
      viewerDistanceM: this.preview.viewerDistanceM, inputs: this.inputs(), palette: this.palette, atlas: this.atlas,
      waits: !drawable, still: this.lookStill, restMs: LOOP_REST_MS,
    } : null);
    this.renderStatus();
    this.renderNotDrawn();
    this.renderTime(len);
    this.askFrame();
  }

  /**
   * Over the preview, what it does not draw, and why, in plain words (UI phase 6, Part B): "Muzzle flash is not drawn: the
   * image muzzle_flash.png did not load." Every layer of the effect shown whose image is not there, in the tier shown; the
   * selected layer's every reason (the tier leaves it out); or the effect itself, while its errors stop the preview. At most
   * three lines. The selected layer's panel says the same next to what draws it.
   */
  private renderNotDrawn(): void {
    const fx = this.effect();
    const lines: string[] = [];
    if (fx && this.booted && !this.frameOnly) {
      if (this.previewWaits()) lines.push(`${fx.name} is not drawn: its file has errors (listed at the top of the right panel).`);
      else {
        const inTier = (id: string) => { const l = fx.layers.find((x) => x.id === id); return !!l && l.type !== 'projectile' && l.tiers.includes(this.tier); };
        for (const r of this.notDrawnReasons()) {
          if (r.layer === this.selLayer || (r.why !== 'tier' && inTier(r.layer))) lines.push(`${r.name} is not drawn: ${r.text}.`);
        }
      }
    }
    const shown = lines.length > 3 ? [...lines.slice(0, 2), `And ${lines.length - 2} more layers are not drawn.`] : lines;
    const key = shown.join('\n');
    if (key === this.notDrawnShown) return;
    this.notDrawnShown = key;
    this.els.vnotes.replaceChildren(...shown.map((t) => h('p', { class: 'vnote' }, icon('warning'), h('span', { text: t }))));
    // The panel's line next to what draws the layer follows (a note the runtime made for this frame can come and go).
    this.inspector.refresh();
  }

  // ---------------------------------------------------------------- drawing the panels

  private renderAll(): void {
    this.renderTopbar();
    this.renderEffects();
    this.renderLayers();
    this.inspector?.rebuild();
    this.timelineView?.refresh();
    this.renderTransport();
    this.renderStatus();
  }

  private renderTopbar(): void {
    const p = this.project;
    const dirty = this.history.dirty || this.metaDirty;
    // The name's text stays "Demo project •" (the dot: unsaved); an example's lock sits between them.
    setText(this.els.projectName.querySelector('.pn-text')!, p ? p.name : 'No project');
    setText(this.els.projectName.querySelector('.pn-dot')!, p && dirty ? ' •' : '');
    showIf(this.els.lock, !!p && !p.writable);
    // Its tooltip: the project's folder, then what a click does (help.ts).
    tip(this.els.project, p ? p.id : null);
    // Save shows the state: Saved (nothing to save), Save, or Save as… on an example, which cannot change.
    const example = !!p && !p.writable, saved = !!p && p.writable && !dirty;
    const label = example ? 'Save as…' : saved ? 'Saved' : 'Save';
    const saveLabel = this.els.save.querySelector('.save-label') as HTMLElement;
    if (saveLabel.textContent !== label) {
      saveLabel.textContent = label;
      this.els.save.querySelector('.save-icon')!.replaceChildren(icon(example ? 'save-as' : saved ? 'check' : 'save'));
    }
    this.els.save.disabled = saved;
    this.els.save.classList.toggle('saved', saved);
    this.els.undo.disabled = !this.history.canUndo;
    this.els.redo.disabled = !this.history.canRedo;
    // Their tooltips name the step; the shortcut and the help text come from help.ts.
    tip(this.els.undo, this.history.canUndo ? `Undo ${this.history.undoLabel}` : 'Nothing to undo');
    tip(this.els.redo, this.history.canRedo ? `Redo ${this.history.redoLabel}` : 'Nothing to redo');
  }

  /** The Effects section (effects-list.ts): folders, rows, the count, the search. */
  private renderEffects(): void {
    this.effectsList?.render();
  }

  /** The Layers section (layers-list.ts): the rows, the count, the empty state. */
  private renderLayers(): void {
    this.layersList?.render();
  }

  /** Play or Pause: an icon button whose name and tooltip say which. */
  private renderTransport(): void {
    const label = this.playing ? 'Pause' : 'Play';
    const b = this.els.play;
    if (b.getAttribute('aria-label') === label && b.firstElementChild) return;
    b.replaceChildren(icon(this.playing ? 'pause' : 'play'));
    b.setAttribute('aria-label', label);
  }

  /** The time readout: "89 / 299 ms" and "step 1"; while firing, "Firing: 1 playing". The box being typed in is left alone. */
  private renderTime(len: number): void {
    const t = Number.isFinite(this.mainTime) ? Math.max(0, this.mainTime) : -1;
    const e = this.els, firing = t < 0;
    if (firing && this.timeEditing) this.endTimeEdit(false, false);
    showIf(e.timeNow, !firing && !this.timeEditing);
    showIf(e.timeLen, !firing);
    showIf(e.timeStep, !firing);
    showIf(e.timeFiring, firing);
    if (firing) setText(e.timeFiring, `Firing: ${this.player.count} playing`);
    else {
      setText(e.timeNow, t.toFixed(0));
      setText(e.timeLen, ` / ${len.toFixed(0)} ms`);
      setText(e.timeStep, `step ${Math.floor((t * 12) / 1000 + 1e-9)}`);
    }
    this.timelineView.setPlayhead(t);
  }

  /** Type a time: the readout's current time becomes a box. Enter goes there, paused; Esc leaves it as it was. */
  private editTime(): void {
    if (!Number.isFinite(this.mainTime) || this.timeEditing) return;
    const e = this.els;
    this.timeEditing = true;
    e.timeInput.value = Math.max(0, this.mainTime).toFixed(0);
    e.timeNow.hidden = true;
    e.timeInput.hidden = false;
    e.timeInput.focus();
    e.timeInput.select();
  }

  /**
   * The typed time: go (Enter) shows that moment, paused, within the effect's length (a comma works as the decimal point);
   * otherwise nothing changes. refocus puts the focus back on the readout (not when it went elsewhere).
   */
  private endTimeEdit(go: boolean, refocus = true): void {
    if (!this.timeEditing) return;
    const e = this.els;
    this.timeEditing = false;
    const len = this.timeline()?.lengthMs ?? 0;
    if (go) {
      const ms = parseFloat(e.timeInput.value.replace(',', '.'));
      if (Number.isFinite(ms)) {
        this.playing = false;
        this.mainTime = Math.max(0, Math.min(len, ms));
        this.renderTransport();
      }
    }
    e.timeInput.hidden = true;
    e.timeNow.hidden = !Number.isFinite(this.mainTime);
    if (refocus && !e.timeNow.hidden) e.timeNow.focus();
    this.renderTime(len);
  }

  /**
   * The status bar: the checks (the same list as the Checks section), this frame's triangles and draw calls, and the cost
   * card's state in a few words. Only what changed is written.
   */
  private renderStatus(): void {
    const e = this.els;
    const n = this.problems().length;
    const checks = n ? `${n} problem${n === 1 ? '' : 's'}` : 'All good';
    if (this.statusShown.checks !== checks) {
      this.statusShown.checks = checks;
      e.sbChecks.replaceChildren(icon(n ? 'warning' : 'check'), h('span', { text: checks }));
      e.sbChecks.classList.toggle('good', !n);
      e.sbChecks.classList.toggle('bad', n > 0);
    }
    const s = this.preview?.vfx.stats;
    if (s) {
      setText(e.sbTris, `${s.triangles} triangle${s.triangles === 1 ? '' : 's'}`);
      setText(e.sbDraws, `${s.drawCalls} draw call${s.drawCalls === 1 ? '' : 's'}`);
    }
    const fx = this.effect();
    const c = costSummary(this.costReport(), { stale: this.costStale(), busy: this.measuring, counting: fx ? budgetThatCounts(this.budgets(), fx.id) : undefined });
    const cost = `${c.state}|${c.text}|${c.detail}`;
    if (this.statusShown.cost !== cost) {
      this.statusShown.cost = cost;
      e.sbCost.textContent = c.text;
      e.sbCost.dataset.state = c.state;
      tip(e.sbCost, c.detail || null);
    }
  }

  /** The middle of the status bar: the hint for what is under the pointer (the preview's), or nothing. */
  private setStatusHint(text: string): void {
    if (this.els) setText(this.els.sbHint, text);
  }

  /** Show hints on or off, from the top bar's button or the main menu (remembered as vfx-hints). */
  private setHints(on: boolean): void {
    applyHints(on);
    this.els.hints.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem(HINTS_KEY, on ? 'on' : 'off'); } catch { /* storage may be blocked */ }
  }

  /** Night mode on or off, from the top bar's button or the main menu (remembered). */
  private setTheme(dark: boolean): void {
    applyTheme(dark);
    this.els.night.setAttribute('aria-pressed', String(dark));
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* storage may be blocked */ }
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
      // Undo, redo and save (above) work everywhere. Other keys pressed in the colour picker, a menu or the Distance popover
      // are theirs (the picker's wheel takes the arrows, a menu's type-ahead the letters): never the editor's shortcuts. While
      // a menu or the popover is open, the editor's keys wait (F, L, 1 2 3, ← →, Space). Escape puts the picker away from
      // anywhere else.
      if (e.defaultPrevented || (e.target as HTMLElement).closest?.('.cpick, .menu, .popover') || this.toolbar.popupOpen()) return;
      if (e.key === 'Escape' && this.picker.isOpen && !this.els.dialog.open) { this.picker.close(); return; }
      // Escape with nothing open leaves the layer: the effect's settings show again. Not while typing (a text or number
      // field, a select); a checkbox or a slider that keeps the focus after a click is not typing.
      const notTyping = !typing || (tag === 'INPUT' && ['checkbox', 'radio', 'range'].includes((e.target as HTMLInputElement).type));
      if (e.key === 'Escape' && notTyping && !mod && !this.els.dialog.open) { if (this.selLayer) { e.preventDefault(); this.inspector.backToEffect(); } return; }
      // Ctrl+D duplicates the selected layer, or the effect (and never opens the browser's bookmark then); Ctrl+] and Ctrl+[
      // move the selected layer up and down the list. Not while typing.
      if (mod && !e.shiftKey && !e.altKey && !typing && !this.els.dialog.open) {
        if (e.key.toLowerCase() === 'd') { if (this.duplicateSelection()) e.preventDefault(); return; }
        if (e.key === ']' || e.key === '[') { if (this.selLayer) { e.preventDefault(); this.moveSelected(e.key === ']' ? 1 : -1); } return; }
      }
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
      else if (e.key === '1' || e.key === '2' || e.key === '3') this.setView((['whole', 'game', 'close'] as const)[+e.key - 1]!);
      else if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
      else if (e.key === '?') { e.preventDefault(); this.keysDialog(); }
      // / puts the focus in the effects search (without typing the /); F2 renames in place.
      else if (e.key === '/') { e.preventDefault(); this.effectsList.focusSearch(); }
      else if (e.key === 'F2') { if (this.renameSelection()) e.preventDefault(); }
    });
  }

  // ---------------------------------------------------------------- for the browser check

  /**
   * Pause and show the current effect at time ms, with a seed. Used by tools/browser-check.mjs and the picture tools. The
   * Look holds a moment from ms too (ms itself when the layer shows then, else the middle of its time), so pictures repeat;
   * with a layer selected it waits (at most 10 s) until the Look can draw.
   */
  async showAt(ms: number, seed = 1): Promise<void> {
    this.playing = false;
    this.mainTime = ms;
    this.seed = seed;
    this.player.clear();
    this.lookStill = ms;
    let timer = 0;
    await Promise.race([this.inspector.look.whenReady(), new Promise<void>((r) => { timer = window.setTimeout(r, 10000); })]);
    clearTimeout(timer);
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
    this.lookStill = null;
    this.lastFrame = performance.now();
    this.askFrame();
  }

  /** For the browser check: the playback state. */
  debugState(): { playing: boolean; mainTime: number; speed: number; playingCount: number; effects: string[]; seed: number } {
    return { playing: this.playing, mainTime: this.mainTime, speed: this.speed, playingCount: this.player.count, effects: this.history.doc.effects.map((e) => e.id), seed: this.seed };
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
    if (o.faction) { this.faction = o.faction; this.preview.setFaction(o.faction); this.toolbar.setFaction(o.faction); this.renderEffects(); }
    if (o.relation) { this.preview.setRelation(o.relation); this.toolbar.setRelation(o.relation); }
    if (o.distance !== undefined) { this.preview.setDistance(o.distance); this.toolbar.setDistance(this.preview.viewerDistanceM); }
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

  /** For the browser check: the help text a label, a section's title or a control gets in its tooltip (help.ts), or null. */
  helpForChecks(el: Element): string | null {
    return lookupHelp(el)?.text ?? null;
  }

  /** For the browser check: what an element's tooltip says (its lines and its shortcut), as it would show it; or null. */
  tipForChecks(el: Element): { lines: string[]; key?: string } | null {
    return tipContent(el);
  }

  get previewForChecks(): Preview {
    return this.preview;
  }

  /** For the browser check: what the Look is doing. */
  lookForChecks(): LookState {
    return this.inspector.look.state();
  }

  /** For the browser check: the Look's last renderer is disposed, its canvas gone and its WebGL context lost. */
  lookDisposedForChecks(): Promise<boolean> {
    return this.inspector.look.disposedForChecks();
  }
}

/** Fade every layer of an effect that is not the one in focus (an effect still playing from an earlier Fire). */
const NOTHING_KEPT: ReadonlySet<number> = new Set();

/** Write a text only when it changed (the status bar and the readout are written every frame). */
function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Show or hide an element, touching it only when that changes. */
function showIf(el: HTMLElement, shown: boolean): void {
  if (el.hidden === shown) el.hidden = !shown;
}

/** Smooth scrolling, unless the system asks for less motion. */
function scrollBehaviour(): ScrollBehavior {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export { StoreError };

/** The seed of the next shot (Fire, and a new loop with New shot each loop on). */
function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

/** The level a set of numbers belongs to: a number typed in a class's switches the class level on. */
function levelOf(where: LimitsRef): LevelRef {
  return where === 'project' ? 'project' : 'class' in where ? 'classes' : { effect: where.effect };
}

/** Two sets of budgets that say the same (as project.json would hold them). */
function sameBudgets(a: Budgets, b: Budgets): boolean {
  return a === b || JSON.stringify(budgetsJson(a)) === JSON.stringify(budgetsJson(b));
}

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
