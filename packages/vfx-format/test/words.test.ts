import { describe, expect, it } from 'vitest';
import { chanceTotal, wordAt, wordShares } from '../src/index';

const sum = (s: { words: number[]; none: number }) => s.words.reduce((a, b) => a + b, 0) + s.none;
const w = (...chances: (number | undefined)[]) => chances.map((chance, i) => (chance === undefined ? { text: `W${i}` } : { text: `W${i}`, chance }));

describe('word chances: the four rules', () => {
  it('1. no word has a chance: equal shares, and every play shows a word', () => {
    expect(wordShares(w(undefined, undefined, undefined, undefined))).toEqual({ words: [0.25, 0.25, 0.25, 0.25], none: 0 });
    expect(wordShares(w(undefined))).toEqual({ words: [1], none: 0 });
  });

  it('2. chances over 100 % are scaled down to 100; words without one get nothing', () => {
    expect(wordShares(w(90, 30))).toEqual({ words: [0.75, 0.25], none: 0 });
    expect(wordShares(w(100, 100, undefined))).toEqual({ words: [0.5, 0.5, 0], none: 0 });
  });

  it('3. words without a chance share what is left equally', () => {
    expect(wordShares(w(50, undefined, undefined))).toEqual({ words: [0.5, 0.25, 0.25], none: 0 });
    expect(wordShares(w(0, undefined))).toEqual({ words: [0, 1], none: 0 });
    // The others already reach 100 %: nothing is left.
    expect(wordShares(w(60, 40, undefined))).toEqual({ words: [0.6, 0.4, 0], none: 0 });
  });

  it('4. every word has a chance and they add up to less than 100 %: the rest shows no word', () => {
    expect(wordShares(w(30, 20))).toEqual({ words: [0.3, 0.2], none: 0.5 });
    expect(wordShares(w(0, 0))).toEqual({ words: [0, 0], none: 1 });
    expect(wordShares(w(60, 40))).toEqual({ words: [0.6, 0.4], none: 0 });
  });

  it('always adds up to 1, and counts 100 % reached by rounding as 100 %', () => {
    for (const list of [w(undefined, undefined, undefined), w(90, 30, undefined), w(50, undefined, undefined), w(30, 20), w(12.5, 7.25, undefined, 3)]) {
      expect(sum(wordShares(list))).toBeCloseTo(1, 12);
    }
    const thirds = w(33.3, 33.3, 33.4);
    expect(chanceTotal(thirds)).toMatchObject({ over: false, full: true, given: 3 });
    expect(wordShares(thirds).none).toBe(0);
    expect(wordShares([...thirds, { text: 'MORE' }]).words[3]).toBe(0);
  });

  it('counts a broken chance (not a number, below 0) as 0, and an empty list as no word', () => {
    expect(wordShares([{ chance: Number.NaN }, { chance: -5 }, {}])).toEqual({ words: [0, 0, 1], none: 0 });
    expect(wordShares([])).toEqual({ words: [], none: 1 });
    expect(wordAt([], 0.5)).toBe(-1);
  });
});

describe('the pick: one random number to a word', () => {
  it('with no chances, is the formula of version 4 for every number, at every edge, for 1 to 16 words', () => {
    const old = (n: number, u: number) => Math.min(n - 1, Math.floor(u * n));
    for (let n = 1; n <= 16; n++) {
      const list = w(...new Array<undefined>(n).fill(undefined));
      for (let k = 0; k <= n; k++) {
        // Draws are whole multiples of 2^-32 (random01): test the ones next to every edge k / n.
        const at = Math.floor((k / n) * 2 ** 32);
        for (const d of [-2, -1, 0, 1, 2]) {
          const u = (at + d) / 2 ** 32;
          if (u < 0 || u >= 1) continue;
          expect(wordAt(list, u), `${n} words, u = ${u}`).toBe(old(n, u));
        }
      }
    }
  });

  it('lays the words end to end by their shares, then "no word"', () => {
    const list = w(30, 20); // 0.3, 0.2, then no word
    expect(wordAt(list, 0)).toBe(0);
    expect(wordAt(list, 0.2999)).toBe(0);
    expect(wordAt(list, 0.3)).toBe(1);
    expect(wordAt(list, 0.4999)).toBe(1);
    expect(wordAt(list, 0.5)).toBe(-1);
    expect(wordAt(list, 0.9999)).toBe(-1);
  });

  it('never picks a word whose share is 0', () => {
    const list = w(0, undefined, 0); // all to the middle word
    for (let u = 0; u < 1; u += 0.01) expect(wordAt(list, u)).toBe(1);
    const left = w(60, 40, undefined);
    for (let u = 0; u < 1; u += 0.01) expect(wordAt(left, u)).not.toBe(2);
  });

  it('gives the top of the range to the last word that can show when the shares fall a hair short of 1', () => {
    const thirds = w(33.3, 33.3, 33.4);
    expect(wordAt(thirds, 1 - 2 ** -32)).toBe(2);
    expect(wordAt(w(50, 50, 0), 1 - 2 ** -32)).toBe(1);
  });

  it('matches the shares over many draws', () => {
    const list = w(50, 30, undefined, undefined); // 0.5, 0.3, 0.1, 0.1
    const counts = [0, 0, 0, 0];
    const N = 100000;
    for (let i = 0; i < N; i++) counts[wordAt(list, (i + 0.5) / N)]!++;
    expect(counts).toEqual([50000, 30000, 10000, 10000]);
  });
});
