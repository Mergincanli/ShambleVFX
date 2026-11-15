import { describe, expect, it } from 'vitest';
import { newWordLayer, wordShares } from '@shamble/vfx-format';
import type { SoundWord, WordLayer } from '@shamble/vfx-format';
import { wordOdds } from '../src/doc/odds';

const layer = (words: SoundWord[], perPlay = true): WordLayer => ({ ...newWordLayer('word', 'Word'), words, perPlay });

/**
 * 1,000 plays land within 5 points of each share: about three standard deviations for a share of one half
 * (sqrt(0.5 x 0.5 / 1000) = 1.6 points). The seeds are fixed (1 to 1,000), so the counts are the same on every run.
 */
const TOLERANCE = 0.05;

describe('the word odds (1,000 plays, counted with the runtime\'s pickWord)', () => {
  const cases: [string, SoundWord[]][] = [
    ['no chances: equal shares', [{ text: 'BOOM' }, { text: 'BANG' }, { text: 'WHAM' }]],
    ['chances under 100 %: the rest shows no word', [{ text: 'BOOM', chance: 30 }, { text: 'BANG', chance: 20 }]],
    ['chances over 100 %: scaled down', [{ text: 'BOOM', chance: 70 }, { text: 'BANG', chance: 50 }]],
    ['some chances: the others share the rest', [{ text: 'BOOM', chance: 60 }, { text: 'BANG' }, { text: 'WHAM' }]],
    ['decimals', [{ text: 'BOOM', chance: 12.5 }, { text: 'BANG', chance: 37.5 }, { text: 'WHAM', chance: 50 }]],
  ];
  for (const [name, words] of cases) {
    it(`comes near wordShares: ${name}`, () => {
      const odds = wordOdds(layer(words));
      const shares = wordShares(words);
      expect(odds.shots).toBe(1000);
      expect(odds.words).toHaveLength(words.length);
      expect(odds.words.reduce((a, b) => a + b, 0) + odds.none).toBe(1000);
      odds.words.forEach((n, i) => expect(Math.abs(n / 1000 - shares.words[i]!), `${words[i]!.text}: ${n} of 1000, share ${shares.words[i]}`).toBeLessThanOrEqual(TOLERANCE));
      expect(Math.abs(odds.none / 1000 - shares.none)).toBeLessThanOrEqual(TOLERANCE);
      // A share of 0 is never shown.
      if (shares.none === 0) expect(odds.none).toBe(0);
    });
  }

  it('counts exactly where a share is 0 or all', () => {
    expect(wordOdds(layer([{ text: 'BOOM', chance: 100 }, { text: 'BANG' }]))).toEqual({ shots: 1000, words: [1000, 0], none: 0 });
    expect(wordOdds(layer([{ text: 'BOOM', chance: 0 }, { text: 'BANG' }]))).toEqual({ shots: 1000, words: [0, 1000], none: 0 });
    expect(wordOdds(layer([{ text: 'BOOM', chance: 0 }, { text: 'BANG', chance: 0 }]))).toEqual({ shots: 1000, words: [0, 0], none: 1000 });
    expect(wordOdds(layer([{ text: 'BOOM' }]))).toEqual({ shots: 1000, words: [1000], none: 0 });
  });

  it('shows one word on every play when the layer does not change with the play', () => {
    const odds = wordOdds(layer([{ text: 'BOOM' }, { text: 'BANG' }, { text: 'WHAM' }], false));
    expect(odds.words.filter((n) => n > 0)).toEqual([1000]);
  });

  it('counts any number of plays', () => {
    const odds = wordOdds(layer([{ text: 'BOOM' }, { text: 'BANG' }]), 40);
    expect(odds.shots).toBe(40);
    expect(odds.words[0]! + odds.words[1]!).toBe(40);
  });
});
