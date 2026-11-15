import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toJson } from '../server/export';
import { budgetThatCounts, defaultBudgets, dropMissingEffects } from '../src/cost/budgets';
import { EDITOR_NOTE, newProjectFile, readEditorJson, readProjectJson, toEditorJson, toProjectJson } from '../src/io/project-file';
import type { ProjectFile } from '../src/io/project-file';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const exampleText = (name: string) => readFileSync(join(repo, 'examples', name, 'project.json'), 'utf8');
/** The tests' own version 1 files: the examples' project.json as they were before they moved to version 2. */
const version1Text = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', 'project-v1', `${name}.json`), 'utf8');

/** Read project.json and insist that it worked. */
function read(raw: unknown) {
  const r = readProjectJson(raw);
  if (!r.ok) throw new Error(`expected project.json to read: ${r.error}`);
  return r;
}

/** A version 2 project.json with every part, written in the project's own layout. */
const V2_TEXT = toJson({
  format: 'shamble-vfx-project',
  version: 2,
  name: 'Big guns',
  paletteProfile: 'Soviets dark',
  about: 'Notes the editor does not edit.',
  events: { board_shell: ['tank.shot'], board_muzzle: ['rifle.shot'] },
  preview: { board_shell: { scene: 'board-shell' } },
  budgets: {
    project: { on: true, limits: { high: { triangles: 5000 } } },
    classes: { on: true, list: [{ id: 'small', name: 'Small' }, { id: 'normal', name: 'Normal' }, { id: 'big', name: 'Huge', limits: { high: { triangles: 9000 } } }] },
    effects: { board_shell: { class: 'big' }, board_muzzle: { on: true, limits: { low: { draws: 2 } } } },
  },
});

describe('project.json', () => {
  it.each(['demo-project', 'hits-collection'])('reads the example %s (version 2) and writes it back byte for byte', (name) => {
    const text = exampleText(name);
    const r = read(JSON.parse(text));
    expect(r.upgradedFrom).toBeUndefined();
    expect(r.project.budgets).toEqual(defaultBudgets());
    expect(text).toContain('"version": 2,');
    expect(toJson(toProjectJson(r.project))).toBe(text);
  });

  it.each(['demo-project', 'hits-collection'])('reads the example %s as it was at version 1 as version 2; written again, it is today\'s example', (name) => {
    const old = version1Text(name);
    expect(old).toContain('"version": 1,');
    const r = read(JSON.parse(old));
    expect(r.upgradedFrom).toBe(1);
    expect(r.project.budgets).toEqual(defaultBudgets());
    // Only the version number changes.
    expect(toJson(toProjectJson(r.project))).toBe(old.replace('"version": 1,', '"version": 2,'));
    expect(toJson(toProjectJson(r.project))).toBe(exampleText(name));
  });

  it('reads version 1 budgets as the project level, switched off; written as version 2 with the numbers kept', () => {
    const r = read({ format: 'shamble-vfx-project', version: 1, name: 'Old', events: {}, preview: {}, budgets: { high: { triangles: 5000 }, low: { draws: 2 } } });
    expect(r.upgradedFrom).toBe(1);
    expect(r.project.budgets.project).toEqual({ on: false, limits: { low: { draws: 2 }, high: { triangles: 5000 } } });
    expect(JSON.stringify(toProjectJson(r.project))).toBe(JSON.stringify({
      format: 'shamble-vfx-project', version: 2, name: 'Old', events: {}, preview: {}, budgets: { project: { limits: { low: { draws: 2 }, high: { triangles: 5000 } } } },
    }));
  });

  it('reads version 2 with every part, and writes it back byte for byte', () => {
    const r = read(JSON.parse(V2_TEXT));
    expect(r.upgradedFrom).toBeUndefined();
    expect(r.project.name).toBe('Big guns');
    expect(r.project.paletteProfile).toBe('Soviets dark');
    expect(r.project.other).toEqual({ about: 'Notes the editor does not edit.' });
    expect(budgetThatCounts(r.project.budgets, 'board_shell')).toEqual({ level: 'class', class: { id: 'big', name: 'Huge' }, limits: { high: { triangles: 9000 } } });
    expect(budgetThatCounts(r.project.budgets, 'board_muzzle').level).toBe('effect');
    expect(budgetThatCounts(r.project.budgets, 'rifle_shot').level).toBe('project');
    expect(toJson(toProjectJson(r.project))).toBe(V2_TEXT);
    // And again: what the writer wrote reads back to the same file.
    expect(toJson(toProjectJson(read(JSON.parse(toJson(toProjectJson(r.project)))).project))).toBe(V2_TEXT);
  });

  it('writes the parts in a fixed order, whatever order the file had them in', () => {
    const r = read({ budgets: { project: { on: true } }, preview: {}, notes: 'n', events: {}, name: 'Mixed', version: 2, paletteProfile: 'P', format: 'shamble-vfx-project' });
    expect(Object.keys(toProjectJson(r.project))).toEqual(['format', 'version', 'name', 'paletteProfile', 'notes', 'events', 'preview', 'budgets']);
  });

  it('writes a new project as version 2 with its name only', () => {
    expect(toProjectJson(newProjectFile('My FX'))).toEqual({ format: 'shamble-vfx-project', version: 2, name: 'My FX' });
  });

  it('refuses a newer version, and a version that is not a whole number, in plain words (keeping the name for the list)', () => {
    const newer = readProjectJson({ format: 'shamble-vfx-project', version: 3, name: 'Future' });
    expect(newer).toEqual({ ok: false, kind: 'version', name: 'Future', error: 'project.json is version 3, and this Shamble VFX reads version 2 and older: update Shamble VFX to open this project' });
    const text = readProjectJson({ format: 'shamble-vfx-project', version: '2', name: 'Typed' });
    expect(text).toEqual({ ok: false, kind: 'version', name: 'Typed', error: 'project.json says "version": "2", which is not a version number: open it in a text editor and write a whole number such as 2' });
    for (const v of [1.5, 0, -1, null]) expect(readProjectJson({ version: v, name: 'x' }).ok, String(v)).toBe(false);
    // A project.json with no version is read as version 1.
    expect(read({ format: 'shamble-vfx-project', name: 'No number' }).upgradedFrom).toBe(1);
    // Not an object at all: the editor opens the project without it, as before.
    for (const raw of [[], null, 'text', 5]) expect(readProjectJson(raw)).toEqual({ ok: false, kind: 'not-a-project', error: 'project.json is not a JSON object' });
  });

  it('keeps only lists of strings as game events, keeps other parts as they are, and trims the palette profile\'s name', () => {
    const r = read(JSON.parse(`{
      "format": "shamble-vfx-project", "version": 2, "name": "Odd",
      "events": { "board_shell": ["tank.shot", 3, "", "x"], "board_muzzle": "rifle.shot", "__proto__": ["a"], "Bad Id": ["b"] },
      "paletteProfile": "  Soviets dark  ",
      "notes": { "kept": [1, 2] }
    }`));
    expect(r.project.events).toEqual({ board_shell: ['tank.shot', '', 'x'] });
    expect(r.project.paletteProfile).toBe('Soviets dark');
    expect(r.project.other).toEqual({ notes: { kept: [1, 2] } });
    for (const p of ['', '   ', 5]) expect(read({ version: 2, name: 'x', paletteProfile: p }).project.paletteProfile).toBeUndefined();
  });
});

describe('editor.json', () => {
  const project = (): ProjectFile => read(JSON.parse(V2_TEXT)).project;

  it('is written as version 2 with the palette profile\'s name, the scenes and the budgets of the exported effects only', () => {
    const p = project();
    const json = toEditorJson(p, ['board_shell', 'rifle_shot']);
    expect(JSON.stringify(json)).toBe(JSON.stringify({
      note: EDITOR_NOTE,
      version: 2,
      paletteProfile: 'Soviets dark',
      preview: { board_shell: { scene: 'board-shell' } },
      budgets: {
        project: { on: true, limits: { high: { triangles: 5000 } } },
        classes: { on: true, list: [{ id: 'small', name: 'Small' }, { id: 'normal', name: 'Normal' }, { id: 'big', name: 'Huge', limits: { high: { triangles: 9000 } } }] },
        effects: { board_shell: { class: 'big' } },
      },
    }));
    expect(toEditorJson(newProjectFile('Plain'), [])).toEqual({ note: EDITOR_NOTE, version: 2, preview: {}, budgets: {} });
  });

  it('reads version 2 back to what was written', () => {
    const p = project();
    const r = readEditorJson(JSON.parse(JSON.stringify(toEditorJson(p, ['board_shell', 'board_muzzle']))));
    expect(r).toEqual({ ok: true, notes: { paletteProfile: 'Soviets dark', preview: p.preview, budgets: dropMissingEffects(p.budgets, ['board_shell', 'board_muzzle']) } });
  });

  it('reads the older one (no version): its budgets become the project level, switched off', () => {
    const r = readEditorJson({ note: 'For the Shamble VFX editor only (preview scenes, budgets). The game ignores this file.', preview: { board_shell: { scene: 'board-shell' } }, budgets: { high: { draws: 3 } } });
    expect(r).toEqual({ ok: true, upgradedFrom: 1, notes: { preview: { board_shell: { scene: 'board-shell' } }, budgets: { ...defaultBudgets(), project: { on: false, limits: { high: { draws: 3 } } } } } });
  });

  it('gives the defaults when an export has none, and refuses a newer one', () => {
    expect(readEditorJson(undefined)).toEqual({ ok: true, notes: { budgets: defaultBudgets() } });
    expect(readEditorJson({ version: 3, budgets: {} })).toEqual({ ok: false, error: 'editor.json is version 3, and this Shamble VFX reads version 2 and older: update Shamble VFX to import this export' });
  });
});
