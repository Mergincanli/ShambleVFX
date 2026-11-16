import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import paletteJson from '../palette/palette.json';
import type { Palette } from '../src/index';
import { checkEffect, problemLines } from '../src/validate/index';

const examples = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples');

describe('example projects', () => {
  for (const project of readdirSync(examples)) {
    const dir = join(examples, project);
    const images = readdirSync(join(dir, 'images'));
    for (const file of readdirSync(join(dir, 'effects'))) {
      it(`${project}/${file} passes the checker, in the current version, and is byte for byte what the editor saves`, () => {
        const text = readFileSync(join(dir, 'effects', file), 'utf8');
        const r = checkEffect(JSON.parse(text), { palette: paletteJson as Palette, images });
        expect(problemLines(r.problems)).toEqual([]);
        expect(`${r.effect?.id}.vfx.json`).toBe(file);
        // No upgrade needed: the examples are saved in the current version.
        expect(r.upgradedFrom).toBeUndefined();
        // The editor keeps the checker's copy of an effect (its fields in the schema's order) and saves it as
        // JSON.stringify(effect, null, 2) and a newline: opening an example and saving it changes nothing.
        expect(`${JSON.stringify(r.effect, null, 2)}\n`).toBe(text);
      });
    }
  }
});
