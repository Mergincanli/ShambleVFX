/** What the panels may ask of the app. */
import type { EffectFile, FactionId, Gradient, Layer, Palette, PaletteEntry, TierName } from '@shamble/vfx-format';
import type { Problem } from '@shamble/vfx-format/validate';
import type { Timeline } from '@shamble/vfx-runtime';
import type { Budgets, CostMetric } from '../cost/budgets';
import type { CostReport } from '../cost/measure';
import type { Path } from '../doc/edits';
import type { NotDrawnNote } from '../doc/not-drawn';

export interface EditOptions {
  label?: string;
  /** Edits with the same key merge into one undo step until commit(). */
  mergeKey?: string;
}

export interface AppApi {
  palette: Palette;
  faction: FactionId;
  effect(): EffectFile | undefined;
  layer(): Layer | undefined;
  selectLayer(id: string | null): void;
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
   * The layers of the current effect the preview could not draw at the moment shown (the last frame), and why, in plain
   * words: an image that did not load, or one that is not in the project. A layer the tier leaves out gets no note.
   */
  layersNotDrawn(): NotDrawnNote[];
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
  /** Open the colour picker on a role, next to a swatch. */
  openColourPicker(role: string, anchor: HTMLElement): void;

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
   * Set or clear one of the project's budgets (the project level). A number switches the project level on. Until the new
   * Cost card comes (UI redesign, phase 6), this is all the card edits.
   */
  setBudget(tier: TierName, metric: CostMetric, value: number | undefined): void;
}
