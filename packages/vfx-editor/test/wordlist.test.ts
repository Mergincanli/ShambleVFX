/**
 * The words with their chances (src/app/wordlist.ts, UI phase 6 Part B): the share an empty box shows, the total the red note
 * gives over 100 %, and the 1,000-shot line, counted with the runtime's own pick (src/doc/odds.ts).
 */
import { describe, expect, it } from 'vitest';
import { newWordLayer, wordShares } from '@shamble/vfx-format';
import type { WordLayer } from '@shamble/vfx-format';
import { oddsText, percentText, totalText } from '../src/app/wordlist';
import { wordOdds } from '../src/doc/odds';

describe('the words with their chances', () => {
  it('shows a share as a percent with at most one decimal', () => {
    expect(percentText(0.25)).toBe('25');
    expect(percentText(70 / 3 / 100)).toBe('23.3');
    expect(percentText(0.4)).toBe('40');
    expect(percentText(0)).toBe('0');
  });

  it('gives the total over 100 % as the checker does: two decimals at most, more only to show it passes 100', () => {
    expect(totalText(120.5)).toBe('120.5');
    expect(totalText(120)).toBe('120');
    expect(totalText(133.3333)).toBe('133.33');
    expect(totalText(100.001)).toBe('100.001');
  });

  it('says what 1,000 shots show with the game\'s own pick, and no word\'s count when some show none', () => {
    const l: WordLayer = { ...newWordLayer('w', 'Word'), words: [{ text: 'BOOM', chance: 30 }, { text: 'BANG', chance: 30 }] };
    const o = wordOdds(l, 1000);
    const text = oddsText(l.words, o);
    expect(text).toBe(`In 1,000 shots: BOOM ${o.words[0]}, BANG ${o.words[1]}, no word ${o.none}`);
    expect(o.words[0]! + o.words[1]! + o.none).toBe(1000);
    // Near the shares of the four rules (30 %, 30 %, no word 40 %).
    expect(Math.abs(o.none / 1000 - wordShares(l.words).none)).toBeLessThan(0.05);
    // Every shot shows a word: no "no word".
    const all: WordLayer = { ...l, words: [{ text: 'BOOM' }, { text: 'BANG' }] };
    expect(oddsText(all.words, wordOdds(all, 1000))).not.toContain('no word');
  });
});
