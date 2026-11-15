/**
 * The word odds: which word 1,000 plays of a word layer show (seeds 1 to 1,000), counted with the runtime's own pickWord,
 * so the counts are what the game shows. The shares they come near are wordShares' (vfx-format).
 * A layer that does not change with every play (perPlay false) shows the same word on every play.
 */
import type { WordLayer } from '@shamble/vfx-format';
import { pickWord } from '@shamble/vfx-runtime';

export interface WordOdds {
  /** How many plays were counted: seeds 1 to shots. */
  shots: number;
  /** How many plays showed each word, in the layer's order. */
  words: number[];
  /** How many plays showed no word. */
  none: number;
}

export function wordOdds(layer: WordLayer, shots = 1000): WordOdds {
  const words = layer.words.map(() => 0);
  let none = 0;
  for (let seed = 1; seed <= shots; seed++) {
    const i = pickWord(layer, seed);
    if (i < 0) none++;
    else words[i] = words[i]! + 1;
  }
  return { shots, words, none };
}
