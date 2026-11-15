import { describe, expect, it } from 'vitest';
import paletteJson from '../../vfx-format/palette/palette.json';
import { newEffect, newWordLayer, wordShares } from '@shamble/vfx-format';
import type { EffectFile, Palette, SoundWord, Vec3, WordLayer } from '@shamble/vfx-format';
import { DrawSink, evaluate, hashText, pickWord, random01 } from '../src/index';
import type { CameraBasis, EvalContext } from '../src/index';

const palette = paletteJson as Palette;

function gameCamera(): CameraBasis {
  const p = (35.3 * Math.PI) / 180, y = (45 * Math.PI) / 180;
  const back: Vec3 = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  const forward: Vec3 = [-back[0], -back[1], -back[2]];
  const right: Vec3 = [Math.cos(y), 0, -Math.sin(y)];
  const up: Vec3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  return { right, up, forward };
}

const ctx = (seed: number): EvalContext => ({
  seed, timeMs: 100, inputs: { origin: [0, 1.3, 0], target: [20, 0, 0] }, faction: 'soviets', palette, camera: gameCamera(),
  imageRect: () => ({ u0: 0, v0: 0, u1: 0.5, v1: 0.5 }), white: [0.9, 0.9],
});

const layer = (words: SoundWord[], over: Partial<WordLayer> = {}): WordLayer => ({ ...newWordLayer('word', 'Sound word'), words, ...over });

/** What one play draws: the letters (one item each) and the triangles. */
function drawn(l: WordLayer, seed: number): { letters: number; triangles: number } {
  const fx: EffectFile = { ...newEffect('w', 'W'), layers: [l] };
  const sink = new DrawSink(64);
  const r = evaluate(fx, ctx(seed), sink);
  return { letters: sink.items, triangles: r.triangles };
}

/** Version 4's word pick, written out as it was: the layer's seed mix, then one random number scaled to the list. */
function version4Pick(l: { id: string; seed: number; perPlay: boolean; words: unknown[] }, seed: number): number {
  const mix = ((l.perPlay ? seed : 0) ^ Math.imul(l.seed + 1, 0x9e3779b1) ^ hashText(l.id)) >>> 0;
  const n = l.words.length;
  return Math.min(n - 1, Math.floor(random01(mix, 1, 0) * n));
}

describe('the word a play shows', () => {
  it('is the word version 4 showed, for every seed, when no word has a chance (20,000 seeds, 1 to 16 words)', () => {
    const seeds = [...Array.from({ length: 20000 }, (_, i) => i), 0xffffffff, 0x80000000, 2 ** 31 - 1, 123456789];
    let compared = 0;
    for (let n = 1; n <= 16; n++) {
      const words = Array.from({ length: n }, (_, i) => ({ text: `W${i}` }));
      for (const over of [{}, { id: 'gun_word', seed: 41 }, { perPlay: false, seed: 9 }] as Partial<WordLayer>[]) {
        const l = layer(words, over);
        for (const seed of seeds) {
          if (pickWord(l, seed) !== version4Pick(l, seed)) throw new Error(`${n} words, ${JSON.stringify(over)}, seed ${seed}: ${pickWord(l, seed)} is not ${version4Pick(l, seed)}`);
          compared++;
        }
      }
    }
    expect(compared).toBe(16 * 3 * 20004);
  });

  it('draws the word version 4 drew, when no word has a chance', () => {
    const texts = ['A', 'BO', 'ZAP', 'BOOM', 'KABOOM'];
    const l = layer(texts.map((text) => ({ text })));
    for (let seed = 1; seed <= 300; seed++) expect(drawn(l, seed).letters, `seed ${seed}`).toBe(texts[version4Pick(l, seed)]!.length);
  });

  it('is what drawing shows, including the plays that show no word (2,000 seeds)', () => {
    // Words of different lengths, so the letters drawn tell which word it was. 70 % in all: 30 % of plays show no word.
    const words = [{ text: 'A', chance: 10 }, { text: 'BO', chance: 20 }, { text: 'ZAP', chance: 15 }, { text: 'BOOM', chance: 25 }];
    const l = layer(words);
    const seen = new Map<number, number>();
    for (let seed = 1; seed <= 2000; seed++) {
      const i = pickWord(l, seed);
      const d = drawn(l, seed);
      expect(d.letters, `seed ${seed}`).toBe(i < 0 ? 0 : words[i]!.text.length);
      if (i < 0) expect(d.triangles, `seed ${seed} shows no word, so it draws nothing`).toBe(0);
      else expect(d.triangles).toBeGreaterThan(0);
      seen.set(i, (seen.get(i) ?? 0) + 1);
    }
    // Every word and "no word" came up, about as often as their shares say.
    const shares = wordShares(words);
    for (const [i, share] of [...shares.words.map((s, k) => [k, s] as const), [-1, shares.none] as const]) {
      expect(Math.abs((seen.get(i) ?? 0) / 2000 - share), `word ${i}`).toBeLessThan(0.035);
    }
  });

  it('follows the chances when some words have none: they share the rest', () => {
    const words = [{ text: 'A', chance: 40 }, { text: 'BO' }, { text: 'ZAP' }];
    const l = layer(words);
    for (let seed = 1; seed <= 600; seed++) {
      const i = pickWord(l, seed);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(drawn(l, seed).letters).toBe(words[i]!.text.length);
    }
  });

  it('is the same word every play for a layer that does not change per play', () => {
    const words = [{ text: 'A', chance: 30 }, { text: 'BO', chance: 30 }, { text: 'ZAP', chance: 30 }];
    const l = layer(words, { perPlay: false });
    const first = pickWord(l, 1);
    for (let seed = 1; seed <= 200; seed++) {
      expect(pickWord(l, seed)).toBe(first);
      expect(drawn(l, seed).letters).toBe(first < 0 ? 0 : words[first]!.text.length);
    }
  });

  it('never shows a word with a 0 % chance, nor one left with nothing', () => {
    const l = layer([{ text: 'A', chance: 0 }, { text: 'BO', chance: 100 }, { text: 'ZAP' }]);
    for (let seed = 1; seed <= 500; seed++) expect(pickWord(l, seed)).toBe(1);
  });
});
