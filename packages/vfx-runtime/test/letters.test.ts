import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import paletteJson from '../../vfx-format/palette/palette.json';
import { WORD_LETTERS, newEffect, newWordLayer } from '@shamble/vfx-format';
import type { EffectFile, Palette, Vec3 } from '@shamble/vfx-format';
import { DrawSink, evaluate } from '../src/index';
import type { CameraBasis } from '../src/index';
import { LETTERS } from '../src/core/letters';

interface LetterData { w: number; from?: string; c: [number, number][][] }
const DATA = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'letters.json'), 'utf8')) as { about: string; letters: Record<string, LetterData> };
const SOURCE = readFileSync(join(import.meta.dirname, '..', 'src', 'core', 'letters.ts'), 'utf8');
const NEW = ['J', 'Q', 'V', 'X', 'Y'];

/**
 * The thinnest stroke of a letter, in letter units: from points along each edge (its middle 60 %), straight into the ink,
 * to the side the ray meets first, counted only when that side faces back (runs the other way, within 25 degrees). So it
 * measures across stems, bars and diagonals, and not into the sharp corners where a diagonal is cut flat.
 */
function thinnestStroke(g: LetterData): number {
  const edges = g.c.flatMap((c) => c.map((p, i) => [p[0], p[1], c[(i + 1) % c.length]![0], c[(i + 1) % c.length]![1]] as const));
  const angle = (e: readonly number[]) => Math.atan2(e[3]! - e[1]!, e[2]! - e[0]!);
  let thinnest = Infinity;
  edges.forEach((e, k) => {
    const [ax, ay, bx, by] = e;
    const l = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / l, ny = (bx - ax) / l; // the ink lies left of every edge: outlines go one way round, holes the other
    for (let s = 0.2; s <= 0.8 + 1e-9; s += 0.05) {
      const px = ax + (bx - ax) * s, py = ay + (by - ay) * s;
      let best = Infinity, hit = -1;
      edges.forEach(([cx, cy, dx, dy], j) => {
        if (j === k) return;
        const ex = dx - cx, ey = dy - cy, den = nx * ey - ny * ex;
        if (Math.abs(den) < 1e-12) return;
        const t = ((cx - px) * ey - (cy - py) * ex) / den, u = ((cx - px) * ny - (cy - py) * nx) / den;
        if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) { best = t; hit = j; }
      });
      if (hit < 0) continue;
      let turn = Math.abs(angle(e) - angle(edges[hit]!)) % (2 * Math.PI);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (Math.PI - turn < (25 * Math.PI) / 180) thinnest = Math.min(thinnest, best);
    }
  });
  return thinnest;
}

function gameCamera(): CameraBasis {
  const p = (35.3 * Math.PI) / 180, y = (45 * Math.PI) / 180;
  const back: Vec3 = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  const forward: Vec3 = [-back[0], -back[1], -back[2]];
  const right: Vec3 = [Math.cos(y), 0, -Math.sin(y)];
  const up: Vec3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  return { right, up, forward };
}

/** The letters one play of a word draws (each letter is one item). */
function lettersDrawn(text: string): number {
  const fx: EffectFile = { ...newEffect('w', 'W'), layers: [{ ...newWordLayer('word', 'Sound word'), words: [{ text }] }] };
  const sink = new DrawSink(64);
  evaluate(fx, {
    seed: 1, timeMs: 100, inputs: { origin: [0, 1.3, 0], target: [20, 0, 0] }, faction: 'soviets', palette: paletteJson as Palette,
    camera: gameCamera(), imageRect: () => ({ u0: 0, v0: 0, u1: 0.5, v1: 0.5 }), white: [0.9, 0.9],
  }, sink);
  return sink.items;
}

describe('the letters', () => {
  it('are A to Z and !, exactly what the checker allows', () => {
    expect(Object.keys(LETTERS).sort().join('')).toBe([...WORD_LETTERS].sort().join(''));
    expect(WORD_LETTERS).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ!');
  });

  it('are built from data/letters.json (npm run letters): the same letters, widths and outlines', () => {
    expect(Object.keys(LETTERS)).toEqual(Object.keys(DATA.letters));
    for (const [ch, g] of Object.entries(DATA.letters)) {
      expect(LETTERS[ch]!.w, ch).toBe(g.w);
      expect(LETTERS[ch]!.contours, ch).toEqual(g.c.map((c) => c.flat()));
    }
  });

  it("mark J, Q, V, X and Y as drawn by Shamble VFX, waiting for the Art lead's review, in the data and in letters.ts", () => {
    expect(Object.keys(DATA.letters).filter((ch) => DATA.letters[ch]!.from === 'shamble-vfx')).toEqual(NEW);
    expect(Object.values(DATA.letters).every((g) => g.from === undefined || g.from === 'shamble-vfx')).toBe(true);
    expect(SOURCE).toContain(" * Drawn by Shamble VFX in the board's style, waiting for the Art lead's review: J, Q, V, X and Y.\n");
    // The mark stays in the data: the runtime gets only widths, outlines and triangles.
    for (const [ch, g] of Object.entries(LETTERS)) expect(Object.keys(g).sort(), ch).toEqual(['contours', 'points', 'tris', 'w']);
  });

  it("each stay inside 0 to their width and 0 to 7, except the Q's tail: 1 unit under the line and 0.4 past its width", () => {
    for (const [ch, g] of Object.entries(DATA.letters)) {
      const pts = g.c.flat();
      const outside = pts.filter(([x, y]) => x < 0 || x > g.w || y < 0 || y > 7);
      if (ch !== 'Q') expect(outside, ch).toEqual([]);
      else expect(outside).toEqual([[3.9, -1], [5.8, -1]]);
      expect(Math.min(...pts.map((p) => p[0])), ch).toBe(0);
    }
    expect(DATA.letters.Q!.w).toBe(5.4);
  });

  it("have no stroke thinner than the board's: the new letters 1.4 units or more, all of them 1.1 or more", () => {
    const thinnest = Object.fromEntries(Object.entries(DATA.letters).map(([ch, g]) => [ch, thinnestStroke(g)]));
    // The board's own: the A's bar 1.1, the G's 1.2, the E's middle bar 1.3, the M's and W's diagonals 1.34, most bars 1.4 to 1.5.
    expect(thinnest.A).toBeCloseTo(1.1, 6);
    expect(thinnest.M).toBeCloseTo(1.342, 3);
    for (const ch of NEW) expect(thinnest[ch], ch).toBeGreaterThanOrEqual(1.4);
    for (const [ch, t] of Object.entries(thinnest)) {
      expect(t, ch).toBeGreaterThanOrEqual(1.1 - 1e-9);
      expect(t, ch).toBeLessThan(2);
    }
  });

  it('draw every letter of words that use the new ones (they used to be left out)', () => {
    for (const text of ['JINX', 'QUAKE', 'VROOM', 'ZAP', 'YAK', 'WAX', 'JQVXY']) expect(lettersDrawn(text), text).toBe(text.length);
    // Characters we have not drawn are still left out.
    expect(lettersDrawn('KA-BLAM')).toBe(6);
  });
});
