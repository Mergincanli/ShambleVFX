/**
 * The palette profiles, on the colour picker's Palette tab (UI phase 7): named sets of colours kept on this computer (the
 * editor's local server and its store, src/io/store.ts), each listed with a few of its colours. The line over the list
 * says which profile this project's colours came from.
 *   - Load copies a profile's colours into the project, as one undo step. First, the colours and gradients the project's
 *     effects use that the profile lacks are listed: they are kept from the project's current colours, so no effect breaks
 *     (src/doc/load-profile.ts).
 *   - Save as profile… keeps the project's colours as a new profile. A row's More menu saves them over that profile (it
 *     asks first), renames it, duplicates it, saves it as a file to send, or deletes it (it asks first). Import profile…
 *     reads such a file; a taken name gets " (1)", " (2)" and so on.
 *   - The two defaults can be loaded, duplicated and saved as a file, but not changed, renamed or deleted (a lock says so);
 *     Restore the default profiles brings back one that is missing.
 *   - The project names the profile when one is loaded or saved (project.json "paletteProfile"). Editing or deleting a
 *     profile changes no project until it is loaded there.
 * Names follow the store's rules (src/io/palette-profile.ts): 1 to 64 characters, each name once whatever its capitals.
 */
import type { Palette } from '@shamble/vfx-format';
import { loadProfile } from '../doc/load-profile';
import { copyName, freeProfileName, isDefaultProfile, lackingLines, missingDefaults, profileFileName } from '../doc/profiles';
import type { LackingLine } from '../doc/profiles';
import { PROFILE_ID, profileNameProblem, readProfileFile, sameColours, sameName, toProfileJson } from '../io/palette-profile';
import type { ProfileListing, ProfileSummary } from '../io/palette-profile';
import { StoreError } from '../io/store';
import type { AppApi } from './api';
import { fold, h, icon, iconButton, menu, tip } from './dom';
import type { MenuView } from './dom';

type Child = Node | string;

/** Plain words for what went wrong. */
const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class ProfilePanel {
  /** The section ("Palette profiles", a fold) the Palette tab shows. */
  readonly el: HTMLDetailsElement;
  private listing: ProfileListing | null = null;
  /** What the list says while it waits or when it could not be read. */
  private listState: 'waiting' | 'ready' | 'failed' = 'waiting';
  /** Each request for the list counts up, so an old answer never draws over a newer one. */
  private asked = 0;
  /** One action at a time: a second click while one runs does nothing (a double click on Load is one load). */
  private busy = false;
  private menuFor: ProfileSummary | null = null;
  private readonly rowMenu: MenuView;
  private readonly parts: { from: HTMLElement; list: HTMLElement; problems: HTMLElement; restore: HTMLElement; status: HTMLElement };

  /** `keepRole(next)`: before a load, the picker makes sure the colour it shows is in the new colours. */
  constructor(private readonly app: AppApi, private readonly keepRole: (next: Palette) => void) {
    const from = h('p', { class: 'pf-from' });
    const list = h('div', { class: 'pf-list', attrs: { role: 'list', 'aria-label': 'Palette profiles' } });
    const problems = h('div', { class: 'pf-problems' });
    const restore = h('div', { class: 'pf-restore', attrs: { hidden: '' } });
    const status = h('p', { class: 'pf-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const saveAs = h('button', { class: 'tb pf-save-as', attrs: { type: 'button' }, text: 'Save as profile…', title: 'Keep this project\'s colours as a new palette profile, on this computer, for any project to load',
      on: { click: () => this.saveAs() } });
    const importBtn = h('button', { class: 'tb pf-import', attrs: { type: 'button' }, text: 'Import profile…', title: 'Read a palette profile\'s file (one that Save as file made) and keep it as a profile',
      on: { click: () => this.chooseFile() } });
    this.parts = { from, list, problems, restore, status };
    this.el = fold('Palette profiles', [from, list, problems, restore, h('div', { class: 'pf-buttons' }, saveAs, importBtn), status], true, [], { className: 'cp-profiles', remember: false });
    this.el.querySelector(':scope > summary')!.setAttribute('data-tip',
      'Named sets of colours, kept on this computer: load one into this project, keep this project\'s colours as one, or send one as a file. A project keeps its own copy of the colours.');
    this.rowMenu = menu({ id: 'profile-menu', label: 'Palette profile', items: [
      { label: 'Load into this project', icon: 'palette', disabled: () => !this.menuFor, action: () => { if (this.menuFor) this.load(this.menuFor); } },
      { label: 'Save over…', icon: 'save', disabled: () => !this.menuFor || isDefaultProfile(this.menuFor.name), action: () => { if (this.menuFor) this.saveOver(this.menuFor); } },
      { label: 'Rename…', icon: 'edit', disabled: () => !this.menuFor || isDefaultProfile(this.menuFor.name), action: () => { if (this.menuFor) this.rename(this.menuFor); } },
      { label: 'Duplicate', icon: 'copy', disabled: () => !this.menuFor, action: () => { if (this.menuFor) this.duplicate(this.menuFor); } },
      { label: 'Save as file…', icon: 'export', disabled: () => !this.menuFor, action: () => { if (this.menuFor) this.saveFile(this.menuFor); } },
      'divider',
      { label: 'Delete…', icon: 'trash', disabled: () => !this.menuFor || isDefaultProfile(this.menuFor.name), action: () => { if (this.menuFor) this.remove(this.menuFor); } },
    ] });
    this.draw();
  }

  /** The Palette tab shows: list the profiles again (the local server makes the folder, with the two defaults, the first time). */
  show(): void {
    void this.list();
  }

  /** The project's colours or its profile's name changed: the line over the list, and which row is the project's. */
  refresh(): void {
    this.drawFrom();
    const mine = this.app.paletteProfile();
    for (const row of this.parts.list.querySelectorAll<HTMLElement>('.pf-row')) {
      const is = !!mine && sameName(row.dataset.name ?? '', mine);
      if (row.classList.contains('this') !== is) row.classList.toggle('this', is);
    }
  }

  // ---------------------------------------------------------------- drawing

  private names(): string[] {
    return this.listing?.profiles.map((p) => p.name) ?? [];
  }

  private drawFrom(): void {
    // Only when its words change: the picker refreshes on every change of the document.
    const mine = this.app.paletteProfile() ?? '';
    if (this.parts.from.dataset.name === mine && this.parts.from.childNodes.length) return;
    this.parts.from.dataset.name = mine;
    const words: Child[] = mine ? ['This project\'s colours came from ', h('b', { text: mine }), '.'] : ['This project\'s colours did not come from a profile.'];
    this.parts.from.replaceChildren(...words);
  }

  private draw(): void {
    this.drawFrom();
    const { list, problems, restore } = this.parts;
    if (this.listState !== 'ready' || !this.listing) {
      list.replaceChildren(h('p', { class: 'state-line', text: this.listState === 'waiting' ? 'Listing the palette profiles…' : 'The palette profiles could not be listed.' }));
      problems.replaceChildren();
      restore.hidden = true;
      return;
    }
    const mine = this.app.paletteProfile();
    // The keyboard focus on a row's button stays on the same button of the row in that place (the rows are made again).
    const active = document.activeElement;
    const focusAt = active instanceof HTMLElement && list.contains(active) && active.closest('.pf-row')
      ? { i: [...list.querySelectorAll('.pf-row')].indexOf(active.closest('.pf-row')!), button: active.classList.contains('pf-load') ? 'pf-load' : 'more' } : null;
    list.replaceChildren(...this.listing.profiles.map((p) => this.row(p, !!mine && sameName(p.name, mine))));
    if (!this.listing.profiles.length) list.append(h('p', { class: 'state-line', text: 'No palette profiles yet.' }));
    if (focusAt) {
      const rows = list.querySelectorAll('.pf-row');
      rows[Math.min(focusAt.i, rows.length - 1)]?.querySelector<HTMLElement>(`button.${focusAt.button}`)?.focus({ preventScroll: true });
    }
    // Files in the folder that cannot be used: named, with why; one the editor named can be deleted.
    problems.replaceChildren(...(this.listing.problems.length ? [h('p', { class: 'cp-label', text: 'Files that cannot be used' }),
      ...this.listing.problems.map((x) => {
        const id = x.file.endsWith('.json') ? x.file.slice(0, -5) : '';
        const text = x.error.startsWith(`"${x.file}": `) ? x.error.slice(x.file.length + 4) : x.error;
        return h('div', { class: 'pf-problem' }, h('div', { class: 'pf-problem-text' }, h('code', { text: x.file }), h('span', { class: 'meta', text })),
          PROFILE_ID.test(id) ? h('button', { class: 'mini', attrs: { type: 'button' }, text: 'Delete', title: `Delete ${x.file} from the palettes folder`, on: { click: () => this.removeFile(x.file, id) } }) : null);
      })] : []));
    const missing = missingDefaults(this.names());
    restore.hidden = !missing.length;
    if (missing.length) {
      restore.replaceChildren(h('p', { class: 'meta', text: `${missing.length === 1 ? 'A default profile is' : 'The default profiles are'} missing: ${missing.join(', ')}.` }),
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Restore the default profiles', title: 'Add back the default profiles that are missing; one that is there stays as it is', on: { click: () => this.restore() } }));
    }
  }

  /** A profile's row: its name (and a lock for a default), a few of its colours, Load, and More. */
  private row(p: ProfileSummary, mine: boolean): HTMLElement {
    const locked = isDefaultProfile(p.name);
    const name = h('span', { class: 'pf-name', text: p.name });
    tip(name, p.name);
    const lock = locked ? h('span', { class: 'pf-lock' }, icon('lock')) : null;
    if (lock) tip(lock, 'A default profile: load it, duplicate it or save it as a file. It cannot be changed, renamed or deleted.');
    const dots = h('span', { class: 'pf-dots', attrs: { 'aria-hidden': 'true' } }, ...p.swatches.map((s) => h('span', { class: 'pf-dot', style: `background:${s.hex}` })));
    const meta = h('span', { class: 'meta pf-meta', text: p.gradientCount === 0 ? 'No gradients' : `${p.gradientCount} gradient${p.gradientCount === 1 ? '' : 's'}` });
    const load = h('button', { class: 'mini pf-load', attrs: { type: 'button', 'aria-label': `Load ${p.name}` }, text: 'Load', title: `Load into this project: its colours become this project's colours (undo puts them back)`,
      on: { click: () => this.load(p) } });
    // Not while an action runs (one at a time): its menu would act on the row as it was.
    const more: HTMLButtonElement = iconButton({ icon: 'more', label: `More: ${p.name}`, className: 'mini more', onClick: () => { if (this.busy) return; this.menuFor = p; this.rowMenu.openBelow(more); } });
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    tip(more, 'More: save over it, rename, duplicate, save as file, delete');
    return h('div', { class: `pf-row${mine ? ' this' : ''}${locked ? ' locked' : ''}`, attrs: { role: 'listitem', 'data-id': p.id, 'data-name': p.name } },
      h('div', { class: 'pf-main' }, h('div', { class: 'pf-line' }, name, lock), h('div', { class: 'pf-line' }, dots, meta)), load, more);
  }

  private say(words: Child | Child[], bad = false): void {
    const s = this.parts.status;
    s.replaceChildren(...(Array.isArray(words) ? words : [words]));
    s.classList.toggle('bad', bad);
  }

  // ---------------------------------------------------------------- the store

  private async list(): Promise<void> {
    const n = ++this.asked;
    try {
      const l = await this.app.profiles().listProfiles();
      if (n !== this.asked) return;
      this.listing = l;
      this.listState = 'ready';
    } catch (e) {
      if (n !== this.asked) return;
      this.listState = 'failed';
      this.say(`The palette profiles could not be listed: ${why(e)}`, true);
    }
    this.draw();
  }

  /** Run one action at a time; what goes wrong is said in plain words under the list. */
  private run(what: () => Promise<void>): void {
    if (this.busy) return;
    this.busy = true;
    this.el.classList.add('busy');
    void what().catch((e: unknown) => this.say(why(e), true)).finally(() => { this.busy = false; this.el.classList.remove('busy'); });
  }

  /**
   * Ask for a name in the question dialog until it is a usable one: free (not one of `taken`), 1 to 64 characters. The
   * store has the last word: a name it refuses as taken (409) asks again with its words. Null when cancelled.
   */
  private async askName(title: string, text: string, value: string, taken: string[], use: (name: string) => Promise<void>): Promise<void> {
    let words = text, typed = value;
    for (;;) {
      const name = await this.app.askName(title, words, typed);
      if (name === null) return;
      const problem = profileNameProblem(name, taken);
      if (problem) { words = problem; typed = name; continue; }
      try {
        await use(name);
        return;
      } catch (e) {
        if (e instanceof StoreError && e.status === 409) { words = e.message; typed = name; taken = [...taken, name]; continue; }
        throw e;
      }
    }
  }

  private load(p: ProfileSummary): void {
    this.run(async () => {
      const prof = await this.app.profiles().readProfile(p.id);
      const effects = this.app.allEffects();
      const result = loadProfile(prof.palette, this.app.palette, effects);
      const lacking = lackingLines(result, effects);
      if (lacking.length) {
        const answer = await this.app.askChoice(`Load "${prof.name}"`, `"${prof.name}" lacks ${howMany(lacking)} this project's effects use. Loading keeps this project's own, so no effect breaks:`,
          [['load', 'Load'], ['cancel', 'Cancel']], [lackingList(lacking)]);
        if (answer !== 'load') return;
      }
      if (sameColours(result.palette, this.app.palette) && this.app.paletteProfile() === prof.name) { this.say(['This project has the colours of ', h('b', { text: prof.name }), ' already.']); return; }
      this.keepRole(result.palette);
      this.app.loadPaletteProfile(result.palette, prof.name);
      const kept = lacking.filter((x) => x.kept);
      const keptWords = howMany(kept);
      this.say(['Loaded ', h('b', { text: prof.name }), '.', kept.length ? ` ${keptWords.charAt(0).toUpperCase()}${keptWords.slice(1)} it lacked ${kept.length === 1 ? 'is' : 'are'} kept from this project.` : '', ' Ctrl+Z puts the old colours back.']);
    });
  }

  private saveAs(): void {
    // It starts from a free name: the project's profile name (or the project's name), numbered when it is taken.
    this.run(() => this.askName('Save as profile', 'A name for a new palette profile with this project\'s colours. It is kept on this computer, for any project to load.',
      freeProfileName(this.app.paletteProfile() ?? this.app.projectName(), this.names()), this.names(), async (name) => {
        const s = await this.app.profiles().createProfile(name, this.app.palette);
        this.app.namePaletteProfile(s.name);
        await this.list();
        this.say(['Saved this project\'s colours as ', h('b', { text: s.name }), '.']);
      }));
  }

  private saveOver(p: ProfileSummary): void {
    this.run(async () => {
      const answer = await this.app.askChoice(`Save over "${p.name}"`, `Its colours become this project's colours. Its old colours cannot be brought back.`, [['save', 'Save over'], ['cancel', 'Cancel']]);
      if (answer !== 'save') return;
      await this.app.profiles().saveProfile(p.id, this.app.palette);
      this.app.namePaletteProfile(p.name);
      await this.list();
      this.say(['Saved this project\'s colours over ', h('b', { text: p.name }), '.']);
    });
  }

  private rename(p: ProfileSummary): void {
    this.run(() => this.askName('Rename palette profile', `A new name for "${p.name}". A project that loaded it keeps its colours, and the name it had.`, p.name,
      this.names().filter((n) => n !== p.name), async (name) => {
        if (name === p.name) return;
        const s = await this.app.profiles().renameProfile(p.id, name);
        await this.list();
        this.say(['Renamed ', h('b', { text: p.name }), ' to ', h('b', { text: s.name }), '.']);
      }));
  }

  private duplicate(p: ProfileSummary): void {
    this.run(async () => {
      const prof = await this.app.profiles().readProfile(p.id);
      let taken = this.names();
      for (let k = 0; ; k++) {
        const name = copyName(p.name, taken);
        try {
          const s = await this.app.profiles().createProfile(name, prof.palette);
          await this.list();
          this.say(['Made ', h('b', { text: s.name }), ', a copy of ', h('b', { text: p.name }), '.']);
          return;
        } catch (e) {
          // A name taken by a file that cannot be used (not in the list): the next number.
          if (e instanceof StoreError && e.status === 409 && k < 20) { taken = [...taken, name]; continue; }
          throw e;
        }
      }
    });
  }

  /** Save as file: the profile's file, to send; Import profile… reads it. The browser puts it in its downloads. */
  private saveFile(p: ProfileSummary): void {
    this.run(async () => {
      const prof = await this.app.profiles().readProfile(p.id);
      const file = profileFileName(prof.name);
      const url = URL.createObjectURL(new Blob([JSON.stringify(toProfileJson(prof.name, prof.palette), null, 2) + '\n'], { type: 'application/json' }));
      const a = h('a', { attrs: { href: url, download: file, hidden: '' } });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.say(['Saved ', h('code', { text: file }), ' in your downloads. To use it on another computer: Import profile….']);
    });
  }

  private remove(p: ProfileSummary): void {
    this.run(async () => {
      const answer = await this.app.askChoice('Delete palette profile', `Delete "${p.name}" from this computer? No project changes: each keeps its own colours. This cannot be undone.`, [['delete', 'Delete'], ['cancel', 'Cancel']]);
      if (answer !== 'delete') return;
      await this.app.profiles().deleteProfile(p.id);
      await this.list();
      this.say(['Deleted ', h('b', { text: p.name }), '.']);
    });
  }

  private removeFile(file: string, id: string): void {
    this.run(async () => {
      const answer = await this.app.askChoice('Delete file', `Delete ${file} from the palettes folder? It cannot be used as a palette profile. This cannot be undone.`, [['delete', 'Delete'], ['cancel', 'Cancel']]);
      if (answer !== 'delete') return;
      await this.app.profiles().deleteProfile(id);
      await this.list();
      this.say(['Deleted ', h('code', { text: file }), '.']);
    });
  }

  private restore(): void {
    this.run(async () => {
      const r = await this.app.profiles().restoreDefaultProfiles();
      this.listing = r;
      this.listState = 'ready';
      this.draw();
      const still = missingDefaults(this.names());
      if (r.added.length) this.say(`Restored ${r.added.join(' and ')}.`);
      else if (still.length) this.say(`${still.join(' and ')} cannot come back: a file in the folder has that name but cannot be used. Delete it first.`, true);
      else this.say('The default profiles are all there.');
    });
  }

  /** Import profile…: pick a file; it becomes a profile under its own name, or with a number when that is taken. */
  private chooseFile(): void {
    if (this.busy) return;
    const input = h('input', { attrs: { type: 'file', accept: '.json,application/json' } });
    input.addEventListener('change', () => { const f = input.files?.[0]; if (f) this.run(() => this.importFile(f)); });
    input.click();
  }

  private async importFile(f: File): Promise<void> {
    let raw: unknown;
    try { raw = JSON.parse(await f.text()); } catch { this.say([h('code', { text: f.name }), ': it is not a palette profile (it is not JSON).'], true); return; }
    const r = readProfileFile(raw);
    if (!r.ok) { this.say([h('code', { text: f.name }), `: ${r.error}.`], true); return; }
    let taken = this.names();
    for (let k = 0; ; k++) {
      const name = freeProfileName(r.name, taken);
      try {
        const s = await this.app.profiles().createProfile(name, r.palette);
        await this.list();
        this.say(name === r.name ? ['Imported ', h('b', { text: s.name }), '.'] : ['Imported ', h('b', { text: s.name }), `: "${r.name}" was taken.`]);
        return;
      } catch (e) {
        if (e instanceof StoreError && e.status === 409 && k < 20) { taken = [...taken, name]; continue; }
        throw e;
      }
    }
  }
}

/** "2 colours", "a colour and a gradient", "3 colours and 2 gradients". */
function howMany(lines: LackingLine[]): string {
  const count = (kind: LackingLine['kind'], one: string, many: string) => { const n = lines.filter((x) => x.kind === kind).length; return n === 0 ? '' : n === 1 ? one : `${n} ${many}`; };
  return [count('colour', 'a colour', 'colours'), count('gradient', 'a gradient', 'gradients')].filter(Boolean).join(' and ');
}

/** The list a load shows first: each colour or gradient, whether it is kept, and where it is used. */
function lackingList(lines: LackingLine[]): HTMLElement {
  return h('ul', { class: 'pf-lacking' }, ...lines.map((x) => h('li', {},
    h('code', { text: x.name }), x.kind === 'gradient' ? h('span', { class: 'meta', text: ' (gradient)' }) : null,
    h('span', { class: x.kept ? 'pf-kept' : 'pf-lost', text: x.kept ? ' kept' : ' missing here too: it stays missing' }),
    h('div', { class: 'meta', text: `Used by ${x.where}` }))));
}
