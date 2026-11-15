import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import { exportProject, importExport, readExport, toJson } from '../server/export';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shamble-vfx-export-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

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
    const r = await importExport(out, back);
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
  });

  it('exports the imported project to the same files', async () => {
    const r = await exportProject(back, again);
    expect(r.errors).toEqual([]);
    const files = walk(out).map((f) => relative(out, f)).sort();
    expect(walk(again).map((f) => relative(again, f)).sort()).toEqual(files);
    for (const f of files) expect(readFileSync(join(again, f)).equals(readFileSync(join(out, f))), f).toBe(true);
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

  it('replaces the export folder, so a deleted effect does not stay in it', async () => {
    const out = join(tmp, 'replaced');
    mkdirSync(join(out, 'effects'), { recursive: true });
    writeFileSync(join(out, 'effects', 'old_effect.vfx.json'), '{}');
    const r = await exportProject(join(repo, 'examples', 'demo-project'), out);
    expect(r.ok).toBe(true);
    expect(existsSync(join(out, 'effects', 'old_effect.vfx.json'))).toBe(false);
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

describe('import refusals', () => {
  it('never writes into a folder that has files', async () => {
    const out = join(tmp, 'for-import');
    await exportProject(join(repo, 'examples', 'hits-collection'), out);
    const target = join(tmp, 'busy');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'project.json'), '{}');
    const r = await importExport(out, target);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/is not empty: import into a new folder/);
    expect(read(join(target, 'project.json'))).toBe('{}');
  });

  it('names what is wrong with a broken export', async () => {
    const out = join(tmp, 'broken-export');
    await exportProject(join(repo, 'examples', 'hits-collection'), out);
    rmSync(join(out, 'effects', 'hit_energy_zap.vfx.json'));
    const r = await importExport(out, join(tmp, 'never'));
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/"effects\/hit_energy_zap\.vfx\.json" is missing from the export/);
    expect(existsSync(join(tmp, 'never'))).toBe(false);
  });
});
