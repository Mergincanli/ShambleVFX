/** What the panels may ask of the app. */
import type { EffectFile, FactionId, Layer, Palette, TierName } from '@shamble/vfx-format';
import type { Problem } from '@shamble/vfx-format/validate';
import type { Timeline } from '@shamble/vfx-runtime';
import type { Budgets, CostMetric, CostReport } from '../cost/measure';
import type { Path } from '../doc/edits';

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
  importImages(): void;

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
  /** The budgets typed for this project (shared by its effects). */
  budgets(): Budgets;
  setBudget(tier: TierName, metric: CostMetric, value: number | undefined): void;
}
