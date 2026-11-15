import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import { exportProject, importExport, readExport, toJson } from '../server/export';
import { budgetThatCounts } from '../src/cost/budgets';
import { EDITOR_NOTE, readProjectJson } from '../src/io/project-file';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shamble-vfx-export-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
/** A palettes folder of its own for a test (never the real palettes/). */
const palettesFor = (label: string) => join(tmp, `palettes-${label}`);

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const read = (p: string) => readFileSync(p, 'utf8');
const json = (p: string) => JSON.parse(read(p)) as Record<string, unknown>;
const pixels = (p: string) => {
  const png = PNG.sync.read(readFileSync(p));
  return { width: png.width, height: png.height, data: Buffer.from(png.data) };
};

describe('the example files', () => {
  it("are written in the project's own JSON layout, so an export is byte-equal to them", () => {
    for (const f of walk(join(repo, 'examples')).filter((f) => f.endsWith('.json'))) {
      const text = read(f);
      expect(text, relative(repo, f)).toBe(toJson(JSON.parse(text)));
    }
  });
});

describe.each(['demo-project', 'hits-collection'])('export, import and export again: %s', (name) => {
  const source = join(repo, 'examples', name);
  const out = join(tmp, `${name}-export`);
  const back = join(tmp, `${name}-back`);
  const again = join(tmp, `${name}-again`);
  const palettesDir = palettesFor(name);

  it('exports with no errors', async () => {
    const r = await exportProject(source, out);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    // The only warnings: images no effect uses (left out of the atlas).
    for (const w of r.warnings) expect(w).toMatch(/^images\/.+: no effect uses it/);
    expect(r.effects).toBe(readdirSync(join(source, 'effects')).length);
  });

  it('holds every effect byte for byte, and the events the project lists', async () => {
    const meta = json(join(source, 'project.json')) as { name: string; events: Record<string, string[]> };
    const ex = await readExport(out);
    expect(ex.check.ok).toBe(true);
    expect(ex.manifest!.name).toBe(meta.name);
    for (const f of readdirSync(join(source, 'effects'))) expect(read(join(out, 'effects', f)), f).toBe(read(join(source, 'effects', f)));
    const lookup = Object.fromEntries(Object.entries(meta.events).flatMap(([id, evs]) => evs.map((e) => [e, id])));
    expect(ex.manifest!.events).toEqual(lookup);
  });

  it('imports back to the same effects, the same images, events and scenes', async () => {
    const r = await importExport(out, back, { palettesDir });
    expect(r.errors).toEqual([]);
    for (const f of readdirSync(join(source, 'effects'))) expect(read(join(back, 'effects', f)), f).toBe(read(join(source, 'effects', f)));
    const atlas = json(join(out, 'atlas.json')) as { rects: Record<string, unknown> };
    for (const img of Object.keys(atlas.rects).filter((n) => !n.startsWith('__'))) {
      expect(pixels(join(back, 'images', img)), img).toEqual(pixels(join(source, 'images', img)));
    }
    const was = json(join(source, 'project.json')), now = json(join(back, 'project.json'));
    expect(now.name).toBe(was.name);
    expect(now.events).toEqual(was.events);
    expect(now.preview).toEqual(was.preview);
    // The example has no palette profile: its colours became one named after the project, and project.json records it.
    expect(r.profile).toEqual({ id: (was.name as string).toLowerCase().replace(/ /g, '-'), name: was.name, added: true });
    expect(now.paletteProfile).toBe(was.name);
  });

  it('exports the imported project to the same files; editor.json now names the palette profile the import made', async () => {
    const r = await exportProject(back, again);
    expect(r.errors).toEqual([]);
    const files = walk(out).map((f) => relative(out, f)).sort();
    expect(walk(again).map((f) => relative(again, f)).sort()).toEqual(files);
    for (const f of files.filter((x) => x !== 'editor.json')) expect(readFileSync(join(again, f)).equals(readFileSync(join(out, f))), f).toBe(true);
    // editor.json: the same, plus the profile's name (the example had none, so the first export named none).
    const first = json(join(out, 'editor.json'));
    expect(first.paletteProfile).toBeUndefined();
    const meta = json(join(source, 'project.json'));
    expect(read(join(again, 'editor.json'))).toBe(toJson({ note: first.note, version: first.version, paletteProfile: meta.name, preview: first.preview, budgets: first.budgets }));
  });

  it('stays the same from then on: a second import finds the same profile and adds none, and its export is the same, byte for byte', async () => {
    const back2 = join(tmp, `${name}-back2`), again2 = join(tmp, `${name}-again2`);
    const before = readdirSync(palettesDir).sort();
    const r = await importExport(again, back2, { palettesDir });
    expect(r.errors).toEqual([]);
    expect(r.profile).toMatchObject({ name: json(join(source, 'project.json')).name, added: false });
    expect(readdirSync(palettesDir).sort()).toEqual(before);
    expect((await exportProject(back2, again2)).errors).toEqual([]);
    const files = walk(again).map((f) => relative(again, f)).sort();
    expect(walk(again2).map((f) => relative(again2, f)).sort()).toEqual(files);
    for (const f of files) expect(readFileSync(join(again2, f)).equals(readFileSync(join(again, f))), f).toBe(true);
  });
});

describe('export refusals', () => {
  /** A copy of the demo project to break. */
  function copy(label: string): string {
    const dir = join(tmp, `broken-${label}`);
    cpSync(join(repo, 'examples', 'demo-project'), dir, { recursive: true });
    return dir;
  }

  it('writes nothing when two effects answer the same event', async () => {
    const dir = copy('events');
    const meta = json(join(dir, 'project.json')) as { events: Record<string, string[]> };
    meta.events.board_shell = ['rifle.shot'];
    writeFileSync(join(dir, 'project.json'), toJson(meta));
    const out = join(tmp, 'no-export-1');
    const r = await exportProject(dir, out);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('"rifle.shot" is answered by both "board_muzzle" and "board_shell": one event plays one effect');
    expect(existsSync(out)).toBe(false);
  });

  it('writes nothing when an effect has errors, and names them', async () => {
    const dir = copy('schema');
    const fx = json(join(dir, 'effects', 'rifle_shot.vfx.json')) as { layers: Record<string, unknown>[] };
    fx.layers[1]!.image = 'not_there.png';
    writeFileSync(join(dir, 'effects', 'rifle_shot.vfx.json'), toJson(fx));
    const out = join(tmp, 'no-export-2');
    const r = await exportProject(dir, out);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('effects/rifle_shot.vfx.json: layers[1].image: "not_there.png" is missing from the images folder');
    expect(existsSync(out)).toBe(false);
  });

  it('replaces an earlier export as a whole, so a deleted effect does not stay in it', async () => {
    const out = join(tmp, 'replaced');
    expect((await exportProject(join(repo, 'examples', 'hits-collection'), out)).ok).toBe(true);
    const r = await exportProject(join(repo, 'examples', 'demo-project'), out);
    expect(r.ok).toBe(true);
    expect(readdirSync(join(out, 'effects')).sort()).toEqual(readdirSync(join(repo, 'examples', 'demo-project', 'effects')).sort());
    expect(readdirSync(tmp).filter((f) => f.startsWith('.replaced'))).toEqual([]);
  });

  it('never deletes a folder that is not an export, nor the project itself', async () => {
    const dir = copy('safety');
    const busy = join(tmp, 'my-art');
    mkdirSync(busy, { recursive: true });
    writeFileSync(join(busy, 'sketch.png'), 'art');
    const notExport = await exportProject(dir, busy);
    expect(notExport.ok).toBe(false);
    expect(notExport.errors[0]).toMatch(/already holds files and is not an earlier export/);
    expect(read(join(busy, 'sketch.png'))).toBe('art');
    for (const out of [dir, join(dir, 'export'), tmp]) {
      const r = await exportProject(dir, out);
      expect(r.ok, out).toBe(false);
      expect(r.errors[0]).toMatch(/must be outside the project folder|is not an earlier export/);
    }
    expect(existsSync(join(dir, 'project.json'))).toBe(true);
    expect(existsSync(join(dir, 'export'))).toBe(false);
  });

  it('exports an older effect as its upgraded copy', async () => {
    const dir = copy('old');
    const fx = json(join(dir, 'effects', 'rifle_shot.vfx.json')) as { version: number; layers: Record<string, unknown>[] };
    fx.version = 2;
    for (const l of fx.layers) delete l.tiers;
    writeFileSync(join(dir, 'effects', 'rifle_shot.vfx.json'), toJson(fx));
    const out = join(tmp, 'upgraded');
    const r = await exportProject(dir, out);
    expect(r.errors).toEqual([]);
    // The same effect as the current file (the upgrade adds "tiers" at the end of each layer, so compare values).
    expect(json(join(out, 'effects', 'rifle_shot.vfx.json'))).toEqual(json(join(repo, 'examples', 'demo-project', 'effects', 'rifle_shot.vfx.json')));
  });
});

describe('a project with its own colours', () => {
  it('exports with its palette.json, a new colour included, and import gives it back', async () => {
    const dir = join(tmp, 'own-colours');
    cpSync(join(repo, 'examples', 'demo-project'), dir, { recursive: true });
    const pal = JSON.parse(read(join(repo, 'packages', 'vfx-format', 'palette', 'palette.json')));
    pal.roles['heat.blue'] = { hex: '#3A7BFF', from: 'mustafa' };
    pal.factions.soviets.roles.team.hex = '#C01010';
    writeFileSync(join(dir, 'palette.json'), toJson(pal));
    const fx = json(join(dir, 'effects', 'rifle_shot.vfx.json')) as { controls: { colour: string } };
    fx.controls.colour = 'heat.blue';
    writeFileSync(join(dir, 'effects', 'rifle_shot.vfx.json'), toJson(fx));
    const out = join(tmp, 'own-colours-export');
    const r = await exportProject(dir, out);
    expect(r.errors).toEqual([]);
    expect(json(join(out, 'palette.json'))).toEqual(pal);
    const back = join(tmp, 'own-colours-back');
    expect((await importExport(out, back, { palettesDir: palettesFor('own-colours') })).ok).toBe(true);
    expect(read(join(back, 'palette.json'))).toBe(read(join(out, 'palette.json')));
  });

  it('carries a gradient a glow uses, and names one the palette lacks', async () => {
    const dir = join(tmp, 'gradient-glow');
    cpSync(join(repo, 'examples', 'hits-collection'), dir, { recursive: true });
    const pal = JSON.parse(read(join(repo, 'packages', 'vfx-format', 'palette', 'palette.json')));
    pal.gradients['glow.ramp'] = { kind: 'smooth', from: 'mustafa', stops: [{ at: 0, role: 'glow.hot' }, { at: 0.5, hex: '#FF8800', alpha: 0.8 }, { at: 1, role: 'glow', alpha: 0 }] };
    writeFileSync(join(dir, 'palette.json'), toJson(pal));
    const file = join(dir, 'effects', 'hit_energy_pulse.vfx.json');
    const fx = json(file) as { layers: { id: string; shape?: Record<string, unknown> }[] };
    fx.layers.find((l) => l.id === 'glow')!.shape!.gradient = 'glow.ramp';
    writeFileSync(file, toJson(fx));
    const out = join(tmp, 'gradient-glow-export');
    const r = await exportProject(dir, out);
    expect(r.errors).toEqual([]);
    expect((json(join(out, 'palette.json')) as { gradients: Record<string, unknown> }).gradients['glow.ramp']).toEqual(pal.gradients['glow.ramp']);
    const back = join(tmp, 'gradient-glow-back');
    expect((await importExport(out, back, { palettesDir: palettesFor('gradient-glow') })).ok).toBe(true);
    expect(read(join(back, 'effects', 'hit_energy_pulse.vfx.json'))).toBe(read(file));
    // Without the gradient in the palette, the export is refused and says why.
    delete pal.gradients['glow.ramp'];
    writeFileSync(join(dir, 'palette.json'), toJson(pal));
    const refused = await exportProject(dir, join(tmp, 'gradient-glow-refused'));
    expect(refused.errors).toContain('effects/hit_energy_pulse.vfx.json: layers[2].shape.gradient: "glow.ramp" is not a gradient in the palette');
  });

  it('names a broken palette.json and exports nothing', async () => {
    const dir = join(tmp, 'bad-colours');
    cpSync(join(repo, 'examples', 'demo-project'), dir, { recursive: true });
    writeFileSync(join(dir, 'palette.json'), toJson({ version: 1, factions: {}, roles: { ink: { hex: 'black', from: 'mustafa' } } }));
    const out = join(tmp, 'bad-colours-export');
    const r = await exportProject(dir, out);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/palette\.json: /);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses a colour the project palette does not have', async () => {
    const dir = join(tmp, 'unknown-colour');
    cpSync(join(repo, 'examples', 'demo-project'), dir, { recursive: true });
    const fx = json(join(dir, 'effects', 'rifle_shot.vfx.json')) as { controls: { colour: string } };
    fx.controls.colour = 'heat.blue';
    writeFileSync(join(dir, 'effects', 'rifle_shot.vfx.json'), toJson(fx));
    const r = await exportProject(dir, join(tmp, 'unknown-colour-export'));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('effects/rifle_shot.vfx.json: controls.colour: "heat.blue" is not a role in the palette');
  });
});

describe('import refusals', () => {
  it('never writes into a folder that has files', async () => {
    const out = join(tmp, 'for-import');
    await exportProject(join(repo, 'examples', 'hits-collection'), out);
    const target = join(tmp, 'busy');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'project.json'), '{}');
    const r = await importExport(out, target, { palettesDir: palettesFor('busy') });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/is not empty: import into a new folder/);
    expect(read(join(target, 'project.json'))).toBe('{}');
    // A refused import keeps no palette profile either.
    expect(existsSync(palettesFor('busy'))).toBe(false);
  });

  it('never writes outside the new project, even from a doctored export', async () => {
    const out = join(tmp, 'doctored');
    await exportProject(join(repo, 'examples', 'demo-project'), out);
    const map = json(join(out, 'atlas.json')) as { rects: Record<string, unknown> };
    map.rects['../../escaped.png'] = map.rects['burst.png'];
    writeFileSync(join(out, 'atlas.json'), toJson(map));
    const target = join(tmp, 'doctored-target', 'project');
    const r = await importExport(out, target, { palettesDir: palettesFor('doctored') });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/is not an image file name/);
    expect(existsSync(join(tmp, 'doctored-target', 'escaped.png'))).toBe(false);
    expect(existsSync(target)).toBe(false);
  });

  it('names what is wrong with a broken export', async () => {
    const out = join(tmp, 'broken-export');
    await exportProject(join(repo, 'examples', 'hits-collection'), out);
    rmSync(join(out, 'effects', 'hit_energy_zap.vfx.json'));
    const r = await importExport(out, join(tmp, 'never'), { palettesDir: palettesFor('never') });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/"effects\/hit_energy_zap\.vfx\.json" is missing from the export/);
    expect(existsSync(join(tmp, 'never'))).toBe(false);
    expect(existsSync(palettesFor('never'))).toBe(false);
  });
});

describe('project.json version 2 and editor.json', () => {
  /** Every file of an export folder, by path. */
  const files = (dir: string) => walk(dir).map((f) => relative(dir, f)).sort();
  /** The two folders hold the same files, byte for byte (`except` left out). */
  const sameFiles = (a: string, b: string, except: string[] = []) => {
    expect(files(b)).toEqual(files(a));
    for (const f of files(a).filter((x) => !except.includes(x))) expect(readFileSync(join(b, f)).equals(readFileSync(join(a, f))), f).toBe(true);
  };
  /**
   * Export, import, export again, with a palettes folder of its own. The two exports hold the same files, byte for byte; only
   * when the project had no palette profile does the second editor.json differ, by naming the one the import made (`profile`).
   * A second import and export then give the same files again. Returns the first export and the imported project.
   */
  async function roundTrip(label: string, project: string, profile: string) {
    const out = join(tmp, `${label}-export`), back = join(tmp, `${label}-back`), again = join(tmp, `${label}-again`);
    const palettesDir = palettesFor(label);
    const first = await exportProject(project, out);
    expect(first.errors).toEqual([]);
    const imported = await importExport(out, back, { palettesDir });
    expect(imported.errors).toEqual([]);
    expect(imported.profile).toMatchObject({ name: profile, added: true });
    const second = await exportProject(back, again);
    expect(second.errors).toEqual([]);
    const notes = json(join(out, 'editor.json'));
    if (notes.paletteProfile === profile) sameFiles(out, again);
    else {
      expect(notes.paletteProfile).toBeUndefined();
      sameFiles(out, again, ['editor.json']);
      expect(read(join(again, 'editor.json'))).toBe(toJson({ note: notes.note, version: notes.version, paletteProfile: profile, preview: notes.preview, budgets: notes.budgets }));
    }
    const back2 = join(tmp, `${label}-back2`), again2 = join(tmp, `${label}-again2`);
    const reimported = await importExport(again, back2, { palettesDir });
    expect(reimported.profile).toMatchObject({ name: profile, added: false });
    expect((await exportProject(back2, again2)).errors).toEqual([]);
    sameFiles(again, again2);
    return { out, back };
  }
  const demo = json(join(repo, 'examples', 'demo-project', 'project.json')) as { name: string; events: Record<string, string[]>; preview: Record<string, unknown> };

  it('a version 1 project with budgets: they travel as the project level, switched off, and export, import, export gives the same files', async () => {
    const dir = join(tmp, 'v1-budgets');
    cpSync(join(repo, 'examples', 'demo-project'), dir, { recursive: true });
    writeFileSync(join(dir, 'project.json'), toJson({ ...demo, budgets: { high: { triangles: 5000, draws: 3 }, low: { ms: 1.5 } } }));
    expect(json(join(dir, 'project.json')).version).toBe(1);
    const { out, back } = await roundTrip('v1-budgets', dir, demo.name);
    // The first export, pinned: editor.json version 2, the numbers kept at the project level, off (no "on").
    expect(read(join(out, 'editor.json'))).toBe(toJson({
      note: EDITOR_NOTE, version: 2, preview: demo.preview, budgets: { project: { limits: { low: { ms: 1.5 }, high: { draws: 3, triangles: 5000 } } } },
    }));
    // The imported project is version 2, and says the same.
    const now = json(join(back, 'project.json'));
    expect(now.version).toBe(2);
    expect(now.name).toBe(demo.name);
    expect(now.events).toEqual(demo.events);
    expect(now.preview).toEqual(demo.preview);
    expect(now.budgets).toEqual({ project: { limits: { low: { ms: 1.5 }, high: { draws: 3, triangles: 5000 } } } });
    // A version 1 project has no palette profile: its colours became one named after the export's project.
    expect(now.paletteProfile).toBe(demo.name);
  });

  it('a version 2 project with budgets at all three levels and a palette profile: export, import, export gives the same files', async () => {
    const dir = join(tmp, 'v2-budgets');
    cpSync(join(repo, 'examples', 'demo-project'), dir, { recursive: true });
    const budgets = {
      project: { on: true, limits: { high: { triangles: 5000 } } },
      classes: { on: true, list: [{ id: 'small', name: 'Small' }, { id: 'normal', name: 'Normal' }, { id: 'big', name: 'Huge', limits: { high: { triangles: 9000 } } }, { id: 'tiny', name: 'Tiny' }] },
      effects: { board_shell: { class: 'big' }, board_muzzle: { on: true, limits: { low: { draws: 2 } } }, rifle_shot: { class: 'tiny', limits: { medium: { ms: 0.5 } } } },
    };
    // An entry for an effect the project no longer has: the export leaves it out.
    const withGone = { ...budgets, effects: { ...budgets.effects, gone_effect: { on: true } } };
    writeFileSync(join(dir, 'project.json'), toJson({ format: 'shamble-vfx-project', version: 2, name: demo.name, paletteProfile: 'Soviets dark', events: demo.events, preview: demo.preview, budgets: withGone }));
    const { out, back } = await roundTrip('v2-budgets', dir, 'Soviets dark');
    expect(read(join(out, 'editor.json'))).toBe(toJson({ note: EDITOR_NOTE, version: 2, paletteProfile: 'Soviets dark', preview: demo.preview, budgets }));
    const text = read(join(back, 'project.json'));
    const now = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(now)).toEqual(['format', 'version', 'name', 'paletteProfile', 'events', 'preview', 'budgets']);
    expect(now.version).toBe(2);
    expect(now.paletteProfile).toBe('Soviets dark');
    expect(now.budgets).toEqual(budgets);
    // What counts for each effect survives the trip.
    const r = readProjectJson(now);
    if (!r.ok) throw new Error(r.error);
    expect(budgetThatCounts(r.project.budgets, 'board_shell')).toEqual({ level: 'class', class: { id: 'big', name: 'Huge' }, limits: { high: { triangles: 9000 } } });
    expect(budgetThatCounts(r.project.budgets, 'board_muzzle')).toEqual({ level: 'effect', limits: { low: { draws: 2 } } });
    expect(budgetThatCounts(r.project.budgets, 'rifle_shot').class?.name).toBe('Tiny');
    expect(budgetThatCounts(r.project.budgets, 'shell_flight').level).toBe('project');
  });

  it('imports an older editor.json (no version, one set of budgets): they become the project level, switched off', async () => {
    const out = join(tmp, 'old-notes-export');
    expect((await exportProject(join(repo, 'examples', 'demo-project'), out)).ok).toBe(true);
    writeFileSync(join(out, 'editor.json'), toJson({ note: 'For the Shamble VFX editor only (preview scenes, budgets). The game ignores this file.', preview: demo.preview, budgets: { high: { draws: 3 } } }));
    const back = join(tmp, 'old-notes-back');
    expect((await importExport(out, back, { palettesDir: palettesFor('old-notes') })).errors).toEqual([]);
    const now = json(join(back, 'project.json'));
    expect(now.version).toBe(2);
    expect(now.preview).toEqual(demo.preview);
    expect(now.budgets).toEqual({ project: { limits: { high: { draws: 3 } } } });
    expect(now.paletteProfile).toBe(demo.name);
    // Exported again, editor.json is version 2 with the same numbers, and the palette profile the import made.
    const again = join(tmp, 'old-notes-again');
    expect((await exportProject(back, again)).ok).toBe(true);
    expect(json(join(again, 'editor.json'))).toEqual({ note: EDITOR_NOTE, version: 2, paletteProfile: demo.name, preview: demo.preview, budgets: { project: { limits: { high: { draws: 3 } } } } });
  });

  it('refuses an editor.json of a newer version, and makes nothing', async () => {
    const out = join(tmp, 'newer-notes-export');
    expect((await exportProject(join(repo, 'examples', 'hits-collection'), out)).ok).toBe(true);
    writeFileSync(join(out, 'editor.json'), toJson({ note: 'from the future', version: 3, budgets: {} }));
    const back = join(tmp, 'newer-notes-back');
    const r = await importExport(out, back, { palettesDir: palettesFor('newer-notes') });
    expect(r).toEqual({ ok: false, errors: ['editor.json is version 3, and this Shamble VFX reads version 2 and older: update Shamble VFX to import this export'], effects: 0, images: 0 });
    expect(existsSync(back)).toBe(false);
    expect(existsSync(palettesFor('newer-notes'))).toBe(false);
  });

  it('refuses to export a project whose project.json is a newer version, and writes nothing', async () => {
    const dir = join(tmp, 'newer-project');
    cpSync(join(repo, 'examples', 'demo-project'), dir, { recursive: true });
    writeFileSync(join(dir, 'project.json'), toJson({ ...demo, version: 3 }));
    const out = join(tmp, 'newer-project-export');
    const r = await exportProject(dir, out);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['project.json is version 3, and this Shamble VFX reads version 2 and older: update Shamble VFX to open this project']);
    expect(existsSync(out)).toBe(false);
  });
});

describe('the export\'s colours as a palette profile', () => {
  it('are named after editor.json\'s palette profile, else after the export\'s project (never the name typed for the new project)', async () => {
    const dir = join(tmp, 'profile-names');
    cpSync(join(repo, 'examples', 'demo-project'), dir, { recursive: true });
    const pal = JSON.parse(read(join(repo, 'packages', 'vfx-format', 'palette', 'palette.json')));
    pal.roles.dust.hex = '#3A7BFF';
    writeFileSync(join(dir, 'palette.json'), toJson(pal));
    const demo = json(join(dir, 'project.json'));
    writeFileSync(join(dir, 'project.json'), toJson({ ...demo, version: 2, paletteProfile: 'Night red' }));
    const out = join(tmp, 'profile-names-export');
    expect((await exportProject(dir, out)).errors).toEqual([]);
    const palettesDir = palettesFor('profile-names');
    const back = join(tmp, 'profile-names-back');
    const r = await importExport(out, back, { name: 'Typed name', palettesDir });
    expect(r.profile).toEqual({ id: 'night-red', name: 'Night red', added: true });
    expect(json(join(back, 'project.json'))).toMatchObject({ name: 'Typed name', paletteProfile: 'Night red' });
    // The profile holds exactly the export's colours (and the defaults came with the new folder).
    expect(readdirSync(palettesDir).sort()).toEqual(['built-in-with-gradients.json', 'built-in.json', 'night-red.json']);
    expect(json(join(palettesDir, 'night-red.json'))).toEqual({ format: 'shamble-vfx-palette-profile', version: 1, name: 'Night red', palette: json(join(out, 'palette.json')) });
    // Without a name in editor.json: the export's project name. The same colours under another name are not looked for.
    const notes = json(join(out, 'editor.json'));
    delete notes.paletteProfile;
    writeFileSync(join(out, 'editor.json'), toJson(notes));
    const r2 = await importExport(out, join(tmp, 'profile-names-back2'), { name: 'Another typed name', palettesDir });
    expect(r2.profile).toEqual({ id: 'demo-project', name: 'Demo project', added: true });
    // Again: the very same colours are found, and nothing is added.
    const r3 = await importExport(out, join(tmp, 'profile-names-back3'), { palettesDir });
    expect(r3.profile).toEqual({ id: 'demo-project', name: 'Demo project', added: false });
    expect(json(join(tmp, 'profile-names-back3', 'project.json')).paletteProfile).toBe('Demo project');
    expect(readdirSync(palettesDir)).toHaveLength(4);
  });

  it('refuse an export whose palette.json is not a usable palette: nothing is made, and no profile kept', async () => {
    const out = join(tmp, 'bad-palette-export');
    expect((await exportProject(join(repo, 'examples', 'hits-collection'), out)).ok).toBe(true);
    const pal = json(join(out, 'palette.json')) as { roles: Record<string, { hex: string }> };
    pal.roles.ink!.hex = 'black';
    writeFileSync(join(out, 'palette.json'), toJson(pal));
    const back = join(tmp, 'bad-palette-back');
    const r = await importExport(out, back, { palettesDir: palettesFor('bad-palette') });
    expect(r).toEqual({ ok: false, errors: ['palette.json: ink: "black" is not a #RRGGBB colour'], effects: 0, images: 0 });
    expect(existsSync(back)).toBe(false);
    expect(existsSync(palettesFor('bad-palette'))).toBe(false);
  });
});
