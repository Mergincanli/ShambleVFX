/**
 * Folders in the effects list (docs/ui-redesign.md 6.2). An effect's folder is the part of its name before " / ", as in
 * Figma: "Weapons / Rifle shot" sits in Weapons, and "Vehicles / Tank / Shell" sits in Tank, inside Vehicles. A folder is
 * only part of a name: the file format has no folders. Also the search over the list. No DOM here, so the unit tests use
 * it as the list does.
 */

/** What stands between a folder and the rest of the name. */
export const FOLDER_SEP = ' / ';
/** The longest effect name the file allows (the schema's maxLength), folder included. */
export const NAME_MAX = 80;

/** An effect's name in parts: its folders, outside first, and the name the list shows. */
export interface NameParts {
  folders: string[];
  base: string;
}

/**
 * Split a name into its folders and the rest. Spaces round each part do not count, and an empty folder is left out
 * (" / Shell" is Shell, in no folder). A name with nothing after its last " / " has no folder: it shows whole.
 */
export function splitName(name: string): NameParts {
  const parts = name.split(FOLDER_SEP).map((p) => p.trim());
  const base = parts.pop() ?? '';
  if (!base) return { folders: [], base: name.trim() };
  return { folders: parts.filter(Boolean), base };
}

/** The folder an effect is in, as a path ("Vehicles / Tank"), or '' for none. */
export function folderOf(name: string): string {
  return splitName(name).folders.join(FOLDER_SEP);
}

/** A name in a folder ('' for none). */
export function joinName(folder: string, base: string): string {
  return folder ? `${folder}${FOLDER_SEP}${base}` : base;
}

/**
 * An effect's new name after a rename, as the Effects list's rename box and the right panel's Name field both edit it: the
 * words typed are the name without its folder, so the folder stays; " / " typed in them makes folders inside the effect's
 * own folder. Spaces at either end do not count. Null: nothing changes (nothing typed, or the same name). 'too long': the
 * name with its folder would pass NAME_MAX.
 */
export function renamedEffect(name: string, typed: string): string | null | 'too long' {
  const words = typed.trim();
  if (!words) return null;
  const next = joinName(folderOf(name), words);
  if (next === name) return null;
  return next.length > NAME_MAX ? 'too long' : next;
}

/**
 * An effect's new name after Move to folder… (or the right panel's Folder select): the same name in another folder ('' for
 * none). Null: it is in that folder already. 'too long': the name with its new folder would pass NAME_MAX.
 */
export function movedEffect(name: string, folder: string): string | null | 'too long' {
  const next = joinName(folder, splitName(name).base);
  if (next === name) return null;
  return next.length > NAME_MAX ? 'too long' : next;
}

/** The folders that hold a name, from the outside in: "Vehicles", then "Vehicles / Tank". */
export function folderPaths(name: string): string[] {
  const { folders } = splitName(name);
  return folders.map((_, i) => folders.slice(0, i + 1).join(FOLDER_SEP));
}

/** A to Z, with numbers in order ("Shot 2" before "Shot 10"). */
export function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** What the list needs of an effect. */
export interface Named {
  id: string;
  name: string;
}

export interface FolderNode<T extends Named> {
  /** Its own name. */
  name: string;
  /** Its path from the top: "Vehicles / Tank". */
  path: string;
  /** 0 for a folder at the top of the list. */
  depth: number;
  /** Folders first, then effects, each A to Z. */
  folders: FolderNode<T>[];
  effects: { item: T; base: string }[];
  /** Every effect inside it, those in its folders too. */
  count: number;
}

/**
 * The effects as a tree of folders: at each level the folders, then the effects, each A to Z (an effect by the name it
 * shows; two of the same name by their ids). The top level is a folder with no name.
 */
export function effectTree<T extends Named>(items: readonly T[]): FolderNode<T> {
  const root: FolderNode<T> = { name: '', path: '', depth: -1, folders: [], effects: [], count: 0 };
  for (const item of items) {
    const { folders, base } = splitName(item.name);
    let node = root;
    node.count++;
    for (const name of folders) {
      let next = node.folders.find((f) => f.name === name);
      if (!next) {
        next = { name, path: node.path ? `${node.path}${FOLDER_SEP}${name}` : name, depth: node.depth + 1, folders: [], effects: [], count: 0 };
        node.folders.push(next);
      }
      node = next;
      node.count++;
    }
    node.effects.push({ item, base });
  }
  const sort = (n: FolderNode<T>) => {
    n.folders.sort((a, b) => byName(a.name, b.name));
    n.effects.sort((a, b) => byName(a.base, b.base) || byName(a.item.id, b.item.id));
    n.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** Every folder path in use, A to Z: "Vehicles", "Vehicles / Tank", "Weapons". */
export function allFolders(items: readonly Named[]): string[] {
  const out = new Set<string>();
  for (const it of items) for (const p of folderPaths(it.name)) out.add(p);
  return [...out].sort(byName);
}

/**
 * Does an effect match the search? Each word typed must be found, in any case, in its name (its folder is part of it), its
 * file ("rifle_shot.vfx.json") or one of its game events. An empty search matches every effect.
 */
export function effectMatches(item: Named, events: readonly string[], query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const fields = [item.name, `${item.id}.vfx.json`, ...events].map((s) => s.toLowerCase());
  return words.every((w) => fields.some((f) => f.includes(w)));
}
