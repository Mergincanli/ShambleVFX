import { describe, expect, it } from 'vitest';
import { NAME_MAX, allFolders, effectMatches, effectTree, folderOf, folderPaths, joinName, movedEffect, renamedEffect, splitName } from '../src/doc/folders';
import type { FolderNode, Named } from '../src/doc/folders';

const fx = (id: string, name: string): Named => ({ id, name });

/** The tree as lines: "+ Folder (count)" for a folder, "- name" for an effect, indented two spaces a level. */
function lines(n: FolderNode<Named>, depth = 0): string[] {
  const pad = '  '.repeat(depth);
  return [
    ...n.folders.flatMap((f) => [`${pad}+ ${f.name} (${f.count})`, ...lines(f, depth + 1)]),
    ...n.effects.map((e) => `${pad}- ${e.base}`),
  ];
}

describe('folders from effect names', () => {
  it('splits a name at " / " into its folders and the name the list shows', () => {
    expect(splitName('Rifle shot')).toEqual({ folders: [], base: 'Rifle shot' });
    expect(splitName('Weapons / Rifle shot')).toEqual({ folders: ['Weapons'], base: 'Rifle shot' });
    expect(splitName('Vehicles / Tank / Shell')).toEqual({ folders: ['Vehicles', 'Tank'], base: 'Shell' });
    // Only " / " with its spaces makes a folder; empty folders are left out; nothing after the last " / ": no folder.
    expect(splitName('AT/AA gun')).toEqual({ folders: [], base: 'AT/AA gun' });
    expect(splitName(' / Shell')).toEqual({ folders: [], base: 'Shell' });
    expect(splitName('Weapons /  / Shell')).toEqual({ folders: ['Weapons'], base: 'Shell' });
    expect(splitName('Weapons / ')).toEqual({ folders: [], base: 'Weapons /' });
    expect(folderOf('Vehicles / Tank / Shell')).toBe('Vehicles / Tank');
    expect(folderOf('Shell')).toBe('');
    expect(folderPaths('Vehicles / Tank / Shell')).toEqual(['Vehicles', 'Vehicles / Tank']);
    expect(joinName('Vehicles / Tank', 'Shell')).toBe('Vehicles / Tank / Shell');
    expect(joinName('', 'Shell')).toBe('Shell');
  });

  it('groups effects into folders, nested, folders first, then effects, each A to Z with numbers in order, and counts all inside', () => {
    const tree = effectTree([
      fx('b', 'Rifle (demo)'), fx('c', 'Weapons / Shot 10'), fx('d', 'Weapons / Shot 2'), fx('e', 'Vehicles / Tank / Shell'),
      fx('f', 'Vehicles / Tank / Gun blast'), fx('g', 'Vehicles / Jeep horn'), fx('h', 'Arrow'), fx('i', 'Weapons / Grenade'),
    ]);
    expect(tree.count).toBe(8);
    expect(lines(tree)).toEqual([
      '+ Vehicles (3)', '  + Tank (2)', '    - Gun blast', '    - Shell', '  - Jeep horn',
      '+ Weapons (3)', '  - Grenade', '  - Shot 2', '  - Shot 10',
      '- Arrow', '- Rifle (demo)',
    ]);
    const tank = tree.folders[0]!.folders[0]!;
    expect([tank.path, tank.depth, tree.folders[0]!.depth]).toEqual(['Vehicles / Tank', 1, 0]);
    expect(allFolders(tree.folders.flatMap(function all(f): Named[] { return [...f.effects.map((e) => e.item), ...f.folders.flatMap(all)]; })))
      .toEqual(['Vehicles', 'Vehicles / Tank', 'Weapons']);
  });

  it('keeps two effects of the same name apart, by their ids', () => {
    const tree = effectTree([fx('z_2', 'Weapons / Shot'), fx('z', 'Weapons / Shot')]);
    expect(tree.folders[0]!.effects.map((e) => e.item.id)).toEqual(['z', 'z_2']);
  });
});

describe('renaming an effect and moving it to a folder (the Effects list and the right panel share these rules)', () => {
  it('renames to the words typed, which are the name without its folder: the folder stays, " / " typed makes folders inside it', () => {
    expect(renamedEffect('Weapons / Rifle shot', 'Rifle fire')).toBe('Weapons / Rifle fire');
    expect(renamedEffect('Rifle shot', '  Rifle fire  ')).toBe('Rifle fire');
    expect(renamedEffect('Weapons / Rifle shot', 'Heavy / Blast')).toBe('Weapons / Heavy / Blast');
  });

  it('changes nothing for an empty name or the same name, and refuses a name that, with its folder, is too long', () => {
    expect(renamedEffect('Weapons / Rifle shot', '   ')).toBeNull();
    expect(renamedEffect('Weapons / Rifle shot', 'Rifle shot ')).toBeNull();
    const folder = 'W'.repeat(40);
    const fits = 'n'.repeat(NAME_MAX - folder.length - 3);
    expect(renamedEffect(`${folder} / Shot`, fits)).toBe(`${folder} / ${fits}`);
    expect(renamedEffect(`${folder} / Shot`, `${fits}n`)).toBe('too long');
  });

  it('moves to a folder (or out of one) keeping the name, within the same 80 characters', () => {
    expect(movedEffect('Rifle shot', 'Weapons')).toBe('Weapons / Rifle shot');
    expect(movedEffect('Weapons / Rifle shot', 'Vehicles / Tank')).toBe('Vehicles / Tank / Rifle shot');
    expect(movedEffect('Weapons / Rifle shot', '')).toBe('Rifle shot');
    expect(movedEffect('Weapons / Rifle shot', 'Weapons')).toBeNull();
    expect(movedEffect('n'.repeat(70), 'Folder name')).toBe('too long');
  });
});

describe('searching the effects', () => {
  const shot = fx('rifle_shot', 'Weapons / Rifle shot (demo)');
  it('finds an effect by its name, its folder, its file and its game events, in any case', () => {
    expect(effectMatches(shot, [], 'rifle')).toBe(true);
    expect(effectMatches(shot, [], 'WEAPONS')).toBe(true);
    expect(effectMatches(shot, [], 'rifle_shot.vfx')).toBe(true);
    expect(effectMatches(shot, ['demo.rifle.fire'], 'rifle.fire')).toBe(true);
    expect(effectMatches(shot, [], 'tank')).toBe(false);
    expect(effectMatches(shot, [], '')).toBe(true);
    expect(effectMatches(shot, [], '   ')).toBe(true);
  });
  it('needs every word typed, each anywhere', () => {
    expect(effectMatches(shot, [], 'rifle demo')).toBe(true);
    expect(effectMatches(shot, ['demo.rifle.fire'], 'weapons fire')).toBe(true);
    expect(effectMatches(shot, [], 'rifle tank')).toBe(false);
  });
});
