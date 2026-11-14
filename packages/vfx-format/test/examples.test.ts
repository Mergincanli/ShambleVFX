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
      it(`${project}/${file} passes the checker`, () => {
        const r = checkEffect(JSON.parse(readFileSync(join(dir, 'effects', file), 'utf8')), { palette: paletteJson as Palette, images });
        expect(problemLines(r.problems)).toEqual([]);
        expect(r.ok && `${r.effect.id}.vfx.json`).toBe(file);
      });
    }
  }
});
