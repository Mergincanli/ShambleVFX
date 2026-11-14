/** What the panels may ask of the app. */
import type { EffectFile, FactionId, Layer, Palette } from '@shamble/vfx-format';
import type { Problem } from '@shamble/vfx-format/validate';
import type { Timeline } from '@shamble/vfx-runtime';
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
}
