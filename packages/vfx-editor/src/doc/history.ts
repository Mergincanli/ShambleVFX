/**
 * The editor's document and its undo history. No three.js and no page code, so it is tested in Node.
 *
 * Every edit is a command with a "before" and an "after" document. Documents are never changed in place:
 * an edit builds a new document that shares every effect it did not touch, so keeping both is cheap.
 * Undo puts "before" back; redo puts "after" back. Dragging a slider makes many small edits; they merge
 * into one command, so one drag is one undo step.
 */
import type { EffectFile } from '@shamble/vfx-format';

export interface EditorDoc {
  /** The project's effects, in the order shown. */
  effects: readonly EffectFile[];
}

interface Command {
  label: string;
  before: EditorDoc;
  after: EditorDoc;
  mergeKey?: string;
}

export class History {
  private past: Command[] = [];
  private future: Command[] = [];
  private current: EditorDoc;
  private saved: EditorDoc;
  private mergeOpen = false;
  private listeners = new Set<(why: 'edit' | 'undo' | 'redo' | 'reset') => void>();

  constructor(initial: EditorDoc, private readonly limit = 200) {
    this.current = initial;
    this.saved = initial;
  }

  get doc(): EditorDoc {
    return this.current;
  }

  /** True when there are edits that are not saved. */
  get dirty(): boolean {
    return this.current !== this.saved;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | undefined {
    return this.past[this.past.length - 1]?.label;
  }

  get redoLabel(): string | undefined {
    return this.future[this.future.length - 1]?.label;
  }

  /**
   * Make an edit. `next` is the whole new document. With a mergeKey, an edit with the same key right after
   * merges into the same command (until endGesture() is called).
   */
  apply(label: string, next: EditorDoc, opts: { mergeKey?: string } = {}): void {
    if (next === this.current) return;
    const last = this.past[this.past.length - 1];
    if (opts.mergeKey && this.mergeOpen && last && last.mergeKey === opts.mergeKey) {
      last.after = next;
    } else {
      this.past.push({ label, before: this.current, after: next, mergeKey: opts.mergeKey });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.mergeOpen = opts.mergeKey !== undefined;
    this.future = [];
    this.current = next;
    this.emit('edit');
  }

  /** End a drag or a typed number: the next edit starts a new undo step. */
  endGesture(): void {
    this.mergeOpen = false;
  }

  undo(): boolean {
    const c = this.past.pop();
    if (!c) return false;
    this.future.push(c);
    this.current = c.before;
    this.mergeOpen = false;
    this.emit('undo');
    return true;
  }

  redo(): boolean {
    const c = this.future.pop();
    if (!c) return false;
    this.past.push(c);
    this.current = c.after;
    this.mergeOpen = false;
    this.emit('redo');
    return true;
  }

  /** After saving: the current document is the saved one. */
  markSaved(): void {
    this.saved = this.current;
    this.emit('reset');
  }

  /** A new project: forget everything. */
  reset(doc: EditorDoc): void {
    this.past = [];
    this.future = [];
    this.current = doc;
    this.saved = doc;
    this.mergeOpen = false;
    this.emit('reset');
  }

  subscribe(fn: (why: 'edit' | 'undo' | 'redo' | 'reset') => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(why: 'edit' | 'undo' | 'redo' | 'reset'): void {
    for (const fn of this.listeners) fn(why);
  }
}
