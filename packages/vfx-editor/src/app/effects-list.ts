/**
 * The Effects section of the left sidebar (docs/ui-redesign.md 6.2): a 32 px header with the count and a + menu (New
 * effect, From preset…), a search box, and the effects in folders. A folder is the part of an effect's name before " / "
 * (src/doc/folders.ts): only part of the name, never of the file. A click on a folder opens or closes it, remembered per
 * project; folders come first, then effects, each A to Z.
 *
 * An effect's row: a dot in its main colour (for the faction shown) and its name without its folder. On hover, on the
 * selected row and while it has the keyboard focus, a More button opens its menu (Rename, Duplicate, Move to folder…,
 * Delete); a right-click opens the same menu. A double-click renames it in place. One menu serves every row.
 *
 * The app keeps the effects and does the edits (the actions); this module shows them and says what was asked.
 */
import type { EffectFile } from '@shamble/vfx-format';
import { NAME_MAX, allFolders, effectMatches, effectTree, folderOf, folderPaths, joinName, splitName, FOLDER_SEP } from '../doc/folders';
import type { FolderNode } from '../doc/folders';
import { contextMenu, h, icon, iconButton, menu, renameBox, scrollNearest, searchField, tip } from './dom';
import type { MenuView, RenameBox } from './dom';

/** What the list asks of the app. */
export interface EffectsListActions {
  effects(): readonly EffectFile[];
  /** The selected effect's id. */
  selected(): string | null;
  /** A layer is selected: a click on the selected effect's row goes back to the effect's own settings. */
  layerSelected(): boolean;
  /** The dot's colour: the effect's main colour for the faction shown. */
  colourOf(fx: EffectFile): string | undefined;
  /** The game events an effect answers (the search looks in them). */
  eventsOf(id: string): readonly string[];
  /** The open project (folders are remembered per project). */
  projectId(): string | null;
  select(id: string): void;
  newEffect(): void;
  fromPreset(): void;
  duplicate(id: string): void;
  /** Give an effect a new name (its folder included): one undo step. */
  rename(id: string, name: string, label: string): void;
  /** Ask for a new folder's name (the question dialog); null when cancelled. */
  askFolder(effectName: string): Promise<string | null>;
  remove(id: string): void;
  say(text: string, bad?: boolean): void;
}

export interface EffectsListView {
  /** The whole section: header, search and list. */
  el: HTMLElement;
  list: HTMLElement;
  /** Show the effects as they are now (after any change). */
  render(): void;
  /** Put the keyboard focus in the search box (the / key). */
  focusSearch(): void;
  /** Rename an effect in place (F2, the menu, a double-click): its row shows first. */
  startRename(id: string): void;
  /** An effect's row is being renamed. */
  renaming(): boolean;
  /**
   * Move to folder… for an effect from elsewhere (the right panel's header, UI phase 6): the same folder menu, below
   * `below`.
   */
  openFolderMenu(id: string, below: HTMLElement): void;
  /** Move an effect to a folder ('' for none): its name rewritten in one undo step, within the 80 characters. */
  moveToFolder(id: string, folder: string): void;
}

/** The longest name allowed, as a sentence. */
const TOO_LONG = `That name is too long: an effect's name, with its folder, has at most ${NAME_MAX} characters.`;

export function buildEffectsList(act: EffectsListActions): EffectsListView {
  // ------------------------------------------------ the header: "Effects", the count, + (New effect, From preset…)
  const count = h('span', { class: 'list-count' });
  const add = iconButton({ icon: 'plus', label: 'Add an effect', className: 'mini add-effect', onClick: () => { /* the menu opens itself: its button is its invoker */ } });
  menu({ opener: add, id: 'add-effect-menu', label: 'Add an effect', helpSection: 'Effects', items: [
    { label: 'New effect', icon: 'plus', action: () => act.newEffect() },
    { label: 'From preset…', icon: 'preset', action: () => act.fromPreset() },
  ] });

  // ------------------------------------------------ the search
  let query = '';
  /** Folders opened or closed by a click while a search is on: for this search only. */
  const searchToggles = new Map<string, boolean>();
  const search = searchField({ label: 'Search effects', placeholder: 'Search effects', className: 'effects-search', onInput: (q) => {
    const cleared = !!query.trim() && !q.trim();
    query = q;
    searchToggles.clear();
    if (cleared) keepSelectedInSight();
    render();
  } });
  const setQuery = (q: string) => { query = q; search.set(q); searchToggles.clear(); };
  /** A search cleared: the folders it opened close again, as they were, but the selected effect's own folders stay open,
   *  so its row still shows (and scrolls into view). */
  const keepSelectedInSight = () => {
    scrollToSelected = true;
    const sel = act.effects().find((e) => e.id === act.selected());
    if (sel) openTo(sel);
  };

  const list = h('div', { class: 'list effects-list', attrs: { 'aria-label': 'Effects' } });
  const el = h('section', { class: 'card effects-section', attrs: { 'data-help-section': 'Effects' } },
    h('div', { class: 'card-head' }, h('h2', { text: 'Effects' }), count, add), search.el, list);

  // ------------------------------------------------ folders open or closed, per project (localStorage)
  let project: string | null | undefined;
  /** The closed folders' paths. A folder never seen before is not here, so it starts open. */
  let closed = new Set<string>();
  const storeKey = (p: string) => `vfx-folders:${p}`;
  const load = (p: string | null) => {
    closed = new Set();
    if (!p) return;
    try {
      const v: unknown = JSON.parse(localStorage.getItem(storeKey(p)) ?? '[]');
      if (Array.isArray(v)) closed = new Set(v.filter((s): s is string => typeof s === 'string'));
    } catch { /* storage may be blocked, or hold something else */ }
  };
  const save = () => {
    if (!project) return;
    try { localStorage.setItem(storeKey(project), JSON.stringify([...closed].sort())); } catch { /* storage may be blocked */ }
  };
  const isOpen = (path: string) => (query.trim() ? searchToggles.get(path) ?? true : !closed.has(path));
  const toggle = (path: string) => {
    if (query.trim()) searchToggles.set(path, !isOpen(path));
    else { if (closed.has(path)) closed.delete(path); else closed.add(path); save(); }
    render();
  };

  /**
   * The effect last shown on purpose, as "id|folder". When the selected effect differs (it was selected some other way than
   * by its row: Duplicate, New effect, From preset…, undo, the inspector), or moved to another folder, its folders open and
   * its row scrolls into view. A click on its row sets it first, so nothing moves.
   */
  let revealed = '';
  const keyOf = (fx: EffectFile) => `${fx.id}|${folderOf(fx.name)}`;
  /** An effect to show once more after an edit of its own (moved to a folder, renamed into one), selected or not. */
  let pendingReveal: string | null = null;
  let scrollToSelected = false;
  /** Make an effect's row show: its folders open, and a search that hides it cleared. */
  const openTo = (fx: EffectFile) => {
    const paths = folderPaths(fx.name);
    if (paths.some((p) => closed.has(p))) { for (const p of paths) closed.delete(p); save(); }
    if (query.trim() && !effectMatches(fx, act.eventsOf(fx.id), query)) setQuery('');
    else for (const p of paths) searchToggles.delete(p);
  };

  // ------------------------------------------------ renaming in place
  let renaming: { id: string; text: string; box: RenameBox | null; fresh: boolean } | null = null;
  const startRename = (id: string) => {
    const fx = act.effects().find((e) => e.id === id);
    if (!fx) return;
    renaming?.box?.dispose();
    renaming = { id, text: splitName(fx.name).base, box: null, fresh: true };
    pendingReveal = id;
    render();
  };
  const endRename = (text: string | null, how: 'key' | 'elsewhere') => {
    const r = renaming;
    if (!r) return;
    renaming = null;
    const fx = act.effects().find((e) => e.id === r.id);
    const typed = text?.trim() ?? '';
    // An empty name, or Esc: the name stays as it was. The box edits the name without its folder; " / " typed in it makes
    // folders inside the effect's own folder.
    const name = fx && typed ? joinName(folderOf(fx.name), typed) : null;
    if (fx && name && name !== fx.name) {
      if (name.length > NAME_MAX) { act.say(TOO_LONG, true); render(); }
      else {
        // Renamed into a folder of its own: its row shows there. Otherwise nothing moves (a click elsewhere goes on).
        if (folderOf(name) !== folderOf(fx.name)) pendingReveal = fx.id;
        act.rename(fx.id, name, 'Rename effect');
      }
    } else render();
    // From the keyboard, the focus goes back to the row (a click elsewhere keeps it where it went).
    if (how === 'key') (list.querySelector(`.item[data-effect="${CSS.escape(r.id)}"] .item-main`) as HTMLElement | null)?.focus({ preventScroll: true });
  };

  // ------------------------------------------------ one menu for every row, and the folders to move to
  /** The effect the row menu was opened for, and where it was opened (below its More button, or at a point). */
  let menuFor: string | null = null;
  let menuAt: { button: HTMLElement } | { x: number; y: number } | null = null;
  const target = () => act.effects().find((e) => e.id === menuFor);
  const rowMenu = menu({ id: 'effect-menu', label: 'Effect', helpSection: 'Effects', items: [
    { label: 'Rename', icon: 'edit', shortcut: 'F2', ariaKeys: 'F2', disabled: () => !target(), action: () => { if (target()) startRename(menuFor!); } },
    { label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D', ariaKeys: 'Control+D', disabled: () => !target(), action: () => { if (target()) act.duplicate(menuFor!); } },
    { label: 'Move to folder…', icon: 'folder', disabled: () => !target(), action: () => openFolderMenu() },
    'divider',
    { label: 'Delete', icon: 'trash', helpLabel: 'Delete effect', disabled: () => !target(), action: () => { if (target()) act.remove(menuFor!); } },
  ] });

  /** Move to folder…: the folders there are, No folder and New folder…, made again each time (the folders change). */
  let folderMenu: MenuView | null = null;
  const moveTo = (id: string, folder: string) => {
    const fx = act.effects().find((e) => e.id === id);
    if (!fx) return;
    const name = joinName(folder, splitName(fx.name).base);
    if (name === fx.name) return;
    if (name.length > NAME_MAX) { act.say(TOO_LONG, true); return; }
    pendingReveal = id;
    act.rename(id, name, 'Move to folder');
  };
  const makeFolderMenu = (): MenuView => {
    folderMenu?.el.remove();
    const fx = target();
    const current = fx ? folderOf(fx.name) : '';
    const id = menuFor;
    // Folder names are names people give: no help text is looked up for them (helpLabel '').
    folderMenu = menu({ id: 'folder-menu', label: 'Move to folder', title: 'Move to folder', helpSection: 'Effects', items: [
      { label: 'No folder', chosen: () => current === '', action: () => { if (id) moveTo(id, ''); } },
      ...allFolders(act.effects()).map((f) => ({ label: f, icon: 'folder' as const, helpLabel: '', chosen: () => current === f, action: () => { if (id) moveTo(id, f); } })),
      'divider',
      { label: 'New folder…', icon: 'plus', action: () => {
        if (!id || !fx) return;
        void act.askFolder(fx.name).then((typed) => {
          // "Weapons / Heavy" typed makes Heavy inside Weapons; spaces round each part and empty parts do not count.
          const folder = (typed ?? '').split(FOLDER_SEP).map((p) => p.trim()).filter(Boolean).join(FOLDER_SEP);
          if (folder) moveTo(id, folder);
        });
      } },
    ] });
    return folderMenu;
  };
  const openFolderMenu = () => {
    const m = makeFolderMenu();
    if (menuAt && 'button' in menuAt && menuAt.button.isConnected) m.openBelow(menuAt.button);
    else if (menuAt && 'x' in menuAt) m.openAt(menuAt.x, menuAt.y);
    else m.open();
  };
  const openFolderMenuFor = (id: string, below: HTMLElement) => { menuFor = id; menuAt = { button: below }; openFolderMenu(); };
  // Made now too, so its rows and their help texts are there before it is first opened.
  makeFolderMenu();

  // A right-click on a row opens its menu at the pointer (the context-menu key: at the row).
  contextMenu(list, rowMenu, (e) => {
    const row = (e.target as Element).closest?.<HTMLElement>('.item');
    if (!row || row.querySelector('input.rename')) return null;
    menuFor = row.dataset.effect ?? null;
    const r = row.getBoundingClientRect();
    menuAt = e.clientX === 0 && e.clientY === 0 ? { x: r.left + 8, y: r.bottom } : { x: e.clientX, y: e.clientY };
    return row;
  });

  // ------------------------------------------------ clicks: a folder opens or closes, a row selects, a double-click renames
  list.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('.more, input, .list-empty')) return;
    const folder = t.closest<HTMLElement>('.folder');
    if (folder) { toggle(folder.dataset.folder ?? ''); return; }
    const row = t.closest<HTMLElement>('.item');
    const id = row?.dataset.effect;
    if (!id) return;
    const fx = act.effects().find((x) => x.id === id);
    // The second click of a double-click (the first selected it, and the list was built again under the pointer).
    if (e.detail === 2 && id === act.selected() && !act.layerSelected()) { startRename(id); return; }
    if (fx && (id !== act.selected() || act.layerSelected())) { revealed = keyOf(fx); act.select(id); }
  });

  // ------------------------------------------------ the rows
  const folderRow = (f: FolderNode<EffectFile>, open: boolean, holdsSelected: boolean): HTMLElement => {
    const n = f.count;
    const row = h('button', {
      class: holdsSelected ? 'folder has-sel' : 'folder', title: `${f.path}: ${n} effect${n === 1 ? '' : 's'}`,
      attrs: { type: 'button', 'aria-expanded': String(open), 'data-folder': f.path, style: `--depth: ${f.depth}` },
    }, icon('chevron-right'), icon('folder'), h('span', { class: 'folder-name', text: f.name }), h('span', { class: 'folder-count', text: String(n) }));
    return row;
  };

  const effectRow = (fx: EffectFile, base: string, depth: number, sel: boolean): HTMLElement => {
    const dot = h('span', { class: 'fx-dot', attrs: { 'aria-hidden': 'true' } });
    const colour = act.colourOf(fx);
    if (colour) dot.style.backgroundColor = colour;
    const row = h('div', { class: sel ? 'item sel' : 'item', attrs: { 'data-effect': fx.id, style: `--depth: ${depth}` } });
    if (renaming?.id === fx.id) {
      const folder = folderOf(fx.name);
      renaming.box?.dispose();
      const box = renameBox({ value: renaming.text, label: `New name for ${fx.name}`, maxLength: NAME_MAX - (folder ? folder.length + FOLDER_SEP.length : 0), onEnd: endRename });
      box.el.addEventListener('input', () => { if (renaming) renaming.text = box.el.value; });
      renaming.box = box;
      row.classList.add('renaming');
      row.append(h('div', { class: 'item-main' }, dot, box.el));
      return row;
    }
    const main = h('button', { class: 'item-main', title: `${fx.name} (file ${fx.id}.vfx.json)`, attrs: { type: 'button', ...(sel ? { 'aria-current': 'true' } : {}) } },
      dot, h('span', { class: 'item-name', text: base }));
    // Its More button: its name says which effect (for screen readers); its tooltip says "More" and what is in the menu. A
    // click that ends a rename builds the list again before it gets here: the menu then opens below this row's new More.
    const more = iconButton({ icon: 'more', label: `More: ${base}`, className: 'mini more', onClick: () => {
      const at = more.isConnected ? more : list.querySelector<HTMLElement>(`.item[data-effect="${CSS.escape(fx.id)}"] > .more`);
      if (!at) return;
      menuFor = fx.id;
      menuAt = { button: at };
      rowMenu.openBelow(at);
    } });
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    tip(more, 'More');
    // Shown on the selected row only (and on hover): the keyboard reaches it there; elsewhere the menu is a right-click away.
    if (!sel) more.tabIndex = -1;
    row.append(main, more);
    return row;
  };

  const render = () => {
    const effects = act.effects();
    const selId = act.selected();
    const selFx = effects.find((e) => e.id === selId);
    const pid = act.projectId();
    if (pid !== project) {
      // Another project: its folders as they were left there, and no search. Its first effect shows where it is.
      project = pid;
      load(pid);
      setQuery('');
      renaming?.box?.dispose();
      renaming = null;
      revealed = selFx ? keyOf(selFx) : '';
      scrollToSelected = true;
    } else if (selFx && keyOf(selFx) !== revealed) {
      revealed = keyOf(selFx);
      openTo(selFx);
      scrollToSelected = true;
    }
    let revealRow: string | null = null;
    if (pendingReveal) {
      const fx = effects.find((e) => e.id === pendingReveal);
      if (fx) { openTo(fx); revealRow = fx.id; }
      pendingReveal = null;
    }
    if (renaming && !effects.some((e) => e.id === renaming!.id)) { renaming.box?.dispose(); renaming = null; }
    const hadFocus = !!renaming && renaming.box?.el === document.activeElement;

    const q = query.trim();
    const shown = q ? effects.filter((fx) => effectMatches(fx, act.eventsOf(fx.id), q)) : effects;
    count.textContent = q ? `${shown.length} of ${effects.length}` : String(effects.length);
    tip(count, q ? `${shown.length} of the ${effects.length} effects match the search.` : null);
    const rows: HTMLElement[] = [];
    const selPaths = selFx ? folderPaths(selFx.name) : [];
    const walk = (node: FolderNode<EffectFile>) => {
      for (const f of node.folders) {
        const open = isOpen(f.path);
        // A closed folder that holds the selected effect says so.
        rows.push(folderRow(f, open, !open && selPaths.includes(f.path)));
        if (open) walk(f);
      }
      for (const { item, base } of node.effects) rows.push(effectRow(item, base, node.depth + 1, item.id === selId));
    };
    walk(effectTree(shown));
    if (!effects.length) {
      rows.push(h('div', { class: 'list-empty' }, h('p', { class: 'empty', text: 'No effects yet.' }),
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Make an effect', on: { click: () => act.newEffect() } })));
    } else if (!shown.length) {
      rows.push(h('div', { class: 'list-empty' }, h('p', { class: 'empty', text: `Nothing matches "${q}".` }),
        h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Clear the search', on: { click: () => { setQuery(''); keepSelectedInSight(); render(); search.input.focus(); } } })));
    }
    list.replaceChildren(...rows);

    if (renaming?.box) {
      const input = renaming.box.el;
      if (renaming.fresh || hadFocus || !document.activeElement || document.activeElement === document.body) {
        input.focus({ preventScroll: true });
        if (renaming.fresh) input.select(); else input.setSelectionRange(input.value.length, input.value.length);
      }
      renaming.fresh = false;
      scrollNearest(list, input.closest('.item')!);
    }
    const scrollId = revealRow ?? (scrollToSelected ? selId : null);
    scrollToSelected = false;
    const row = scrollId ? list.querySelector(`.item[data-effect="${CSS.escape(scrollId)}"]`) : null;
    if (row) scrollNearest(list, row);
  };

  return {
    el, list, render,
    focusSearch: () => { search.input.focus(); search.input.select(); },
    startRename,
    renaming: () => !!renaming,
    openFolderMenu: openFolderMenuFor,
    moveToFolder: moveTo,
  };
}
