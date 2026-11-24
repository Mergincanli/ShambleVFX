/** What the panels may ask of the app. */
import type { EffectFile, FactionId, Gradient, Layer, Palette, PaletteEntry, TierName } from '@shamble/vfx-format';
import type { ProjectStore } from '../io/store';
import type { Problem } from '@shamble/vfx-format/validate';
import type { Timeline } from '@shamble/vfx-runtime';
import type { Budgets, CostMetric, LimitsRef } from '../cost/budgets';
import type { CostReport } from '../cost/measure';
import type { Path } from '../doc/edits';
import type { NotDrawnNote, NotDrawnReason } from '../doc/not-drawn';
import type { PickerTab } from './colorpicker';

export interface EditOptions {
  label?: string;
  /** Edits with the same key merge into one undo step until commit(). */
  mergeKey?: string;
}

/** The palette profiles' part of the editor's store (src/io/store.ts): the local server's palettes folder. */
export type ProfileStore = Pick<ProjectStore, 'listProfiles' | 'readProfile' | 'createProfile' | 'saveProfile' | 'renameProfile' | 'deleteProfile' | 'restoreDefaultProfiles'>;

export interface AppApi {
  palette: Palette;
  faction: FactionId;
  effect(): EffectFile | undefined;
  layer(): Layer | undefined;
  selectLayer(id: string | null): void;
  /** A layer's row is under the mouse (Layers list or timeline), or none is: the preview fades the others while it is. */
  hoverLayer(id: string | null): void;
  /** The layer whose row is under the mouse, in the Layers list or on the timeline: both highlight it. */
  hoveredLayer(): string | null;
  imageNames(): string[];
  imageUrl(name: string): string | undefined;
  editEffect(path: Path, value: unknown, opts?: EditOptions): void;
  editLayer(path: Path, value: unknown, opts?: EditOptions): void;
  replaceLayer(layer: Layer, label: string): void;
  /** End a drag or a typed value: the next edit is a new undo step. */
  commit(): void;
  /** The current effect's timeline for the current origin and target. */
  timeline(): Timeline | undefined;
  /** The checker's problems for the current effect. */
  problems(): Problem[];
  /**
   * The problems stop the preview from drawing the effect (a schema, format or version problem). The preview, the cost
   * measurement and the right panel's problems banner all ask this one question.
   */
  previewWaits(): boolean;

  /** What the right panel header's More menus do (UI phase 6): what the lists' row menus do (phase 4). */
  duplicateEffect(id: string): void;
  /** Move to folder… for an effect: the folder menu (the folders there are, No folder, New folder…) below a button. */
  openFolderMenu(id: string, below: HTMLElement): void;
  /**
   * The right panel's Name field: rename an effect to the words typed (its name without its folder), by the Effects list's
   * rename rules (one function for both). True when it was renamed.
   */
  renameEffectTo(id: string, typed: string): boolean;
  /** Every folder in use in the project, A to Z ("Vehicles", "Vehicles / Tank", "Weapons"): the Folder select's choices. */
  folders(): string[];
  /** The right panel's Folder select: move an effect to a folder ('' for none), as Move to folder… does: one undo step. */
  moveToFolder(id: string, folder: string): void;
  /** The Folder select's New folder…: ask for the folder's name, then move the effect there. False when nothing moved. */
  newFolder(id: string): Promise<boolean>;
  /** Delete an effect, after asking (undo brings it back). */
  deleteEffect(id: string): void;
  /** Rename a layer in place, in its row of the Layers list (as F2 does). */
  renameLayerInPlace(id: string): void;
  /** Duplicate a layer: the copy goes just above it, and is selected. */
  duplicateLayer(id: string): void;
  /** Move a layer by delta places in the file (+1: up the list, so it draws over more): one undo step. */
  moveLayer(id: string, delta: number): void;
  /** Delete a layer; when it is the selected one, the layer that takes its place is selected. */
  deleteLayer(id: string): void;
  /**
   * The layers of the current effect the preview could not draw at the moment shown (the last frame), and why, in plain
   * words: an image that did not load, or one that is not in the project. A layer the tier leaves out gets no note.
   */
  layersNotDrawn(): NotDrawnNote[];
  /**
   * Why each layer of the current effect is not drawn in the preview now, in plain words (the "not drawn" warning): its
   * effect's errors stop the preview, the tier shown leaves it out, or its image is not there (at any moment).
   */
  notDrawnReasons(): NotDrawnReason[];
  importImages(): void;

  /** Show the preview (and the colours) for another faction. */
  setFaction(f: FactionId): void;
  /** Change a colour in the project's palette (for the faction given, or the one shown). mergeKey: one undo step per drag. */
  setColour(role: string, hex: string, opts?: { faction?: FactionId; mergeKey?: string }): void;
  /** Put a colour back as it was (its value and whose it is). */
  restoreColour(role: string, entry: PaletteEntry, faction: FactionId): void;
  /** Add a colour role; returns why it could not, or null. */
  addColour(role: string, perFaction: boolean, hex: string): string | null;
  /** Work team.dark or glow.hot out again from its base. */
  deriveColour(role: string, faction?: FactionId): void;
  /** Add a gradient to the project's palette, or change one (mergeKey: one undo step per drag or typing run). */
  setGradient(name: string, g: Gradient, opts?: { mergeKey?: string }): void;
  /** Make a role the current effect's main colour. */
  setMainColour(role: string): void;
  /**
   * Open the colour picker on a role, left of the right panel and level with the row of `anchor` (a colour in the colour
   * list, the main colour's edit button), at a tab: the Colour tab for those two; with none, the tab used last.
   */
  openColourPicker(role: string, anchor: HTMLElement, tab?: PickerTab): void;
  /** "Edit palette…": the colour picker on a role, at its Palette tab. */
  openPalette(role: string, anchor: HTMLElement): void;
  /**
   * A gradient field's edit button: the colour picker on a role, at its Gradients tab, with the gradient named open in the
   * gradient editor when it is in the palette.
   */
  openGradients(role: string, anchor: HTMLElement, gradient?: string): void;

  /** The palette profiles on this computer (the colour picker's Palette tab, UI phase 7). */
  profiles(): ProfileStore;
  /** The palette profile the project's colours came from (project.json "paletteProfile"), or undefined. */
  paletteProfile(): string | undefined;
  /** Every effect of the project: loading a profile keeps the colours they use. */
  allEffects(): readonly EffectFile[];
  /** The project's name (the name Save as profile… starts from). */
  projectName(): string;
  /** Take a profile's colours (as loadProfile made them) and name the profile: one undo step. */
  loadPaletteProfile(palette: Palette, name: string): void;
  /** Name the profile the project's colours are kept as (Save as profile…, Save over): one undo step, none when it is named so. */
  namePaletteProfile(name: string): void;
  /** The question dialog, as it is: the name typed, or null when cancelled (or nothing was typed). */
  askName(title: string, text: string, value: string): Promise<string | null>;
  /** A question with a few answers, the first the main one, and optional parts under its words; null when closed. */
  askChoice(title: string, text: string, answers: [string, string][], body?: HTMLElement[]): Promise<string | null>;

  /** The quality tier the preview draws (Low, Medium or High). */
  previewTier(): TierName;
  /** The game events the current effect answers (kept in project.json, under "events"). */
  events(): string[];
  setEvents(list: string[]): void;
  /** Problems with the current effect's event names: badly written, or answered by another effect too. */
  eventProblems(): string[];

  /** The last cost measurement of the current effect. */
  costReport(): CostReport | undefined;
  /** True when the effect or the scene changed after it was measured. */
  costStale(): boolean;
  /** While measuring: what is being measured. */
  costProgress(): string | null;
  measureCost(): void;
  /** The project's budgets at three levels: the project's, the classes' and each effect's own (project.json "budgets"). */
  budgets(): Budgets;
  /**
   * Set or clear one budget at a level (the project's at first; a class's; an effect's own). A number switches its level on;
   * clearing one does not switch it off. One undo step.
   */
  setBudget(tier: TierName, metric: CostMetric, value: number | undefined, where?: LimitsRef): void;
  /** Any other change to the budgets (a level switched on or off, an effect's class): one undo step; none when nothing changed. */
  editBudgets(next: Budgets, label: string): void;
  /** Cost's New class…: ask for a name (the question dialog), add the class and put the effect in it, in one undo step. */
  newBudgetClass(effectId: string): Promise<boolean>;
  /** Rename a class of budgets: ask for its new name; one undo step. The effects in it stay in it. */
  renameBudgetClass(classId: string): Promise<boolean>;
  /** Delete a class of budgets, after asking: the effects in it are in no class. One undo step. */
  deleteBudgetClass(classId: string): void;
}
