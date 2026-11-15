/**
 * Word chances: how often each word of a word layer shows. One set of rules, used by the runtime (to pick a word), the
 * checker (to warn) and the editor (to show the odds). No dependencies, so the runtime can use it.
 *
 * A chance is a percent from 0 to 100, and it is optional:
 * 1. No word has a chance: every word gets an equal share. Every play shows a word.
 * 2. The chances add up to more than 100: they are scaled down to 100. Words without a chance get nothing.
 * 3. Some words have no chance: they share what is left (100 minus the given chances) equally.
 * 4. Every word has a chance and they add up to less than 100: the rest of the plays show no word (Mustafa's choice).
 */

/** Anything with an optional chance in percent: a word of a word layer. */
export interface WithChance {
  chance?: number;
}

/** Each word's share of the plays (0..1, in list order) and the share of plays that show no word. They add up to 1. */
export interface WordShares {
  words: number[];
  none: number;
}

/** What the given chances add up to. A total within this much of 100 counts as 100 (rounding, as in 33.3 + 33.3 + 33.4). */
const ROUNDING = 1e-9;

/** A chance as a number to count with: a missing one stays missing, a broken one (not a number, below 0) counts as 0. */
function chanceOf(w: WithChance): number | undefined {
  if (w.chance === undefined) return undefined;
  return Number.isFinite(w.chance) && w.chance > 0 ? w.chance : 0;
}

/**
 * The given chances added up (in percent), how many words have one, and whether they pass 100 % (they are scaled down)
 * or reach it (words without a chance are left with nothing).
 */
export function chanceTotal(words: readonly WithChance[]): { total: number; given: number; over: boolean; full: boolean } {
  let total = 0;
  let given = 0;
  for (const w of words) {
    const c = chanceOf(w);
    if (c === undefined) continue;
    total += c;
    given++;
  }
  return { total, given, over: total > 100 + ROUNDING, full: given > 0 && total >= 100 - ROUNDING };
}

/** Each word's share of the plays, and the share of "no word", by the four rules above. */
export function wordShares(words: readonly WithChance[]): WordShares {
  const n = words.length;
  if (!n) return { words: [], none: 1 };
  const { total, given, over, full } = chanceTotal(words);
  // 1. No word has a chance: equal shares, every play shows a word.
  if (!given) return { words: words.map(() => 1 / n), none: 0 };
  // 2. More than 100 %: scaled down to 100. Words without a chance get nothing.
  if (over) return { words: words.map((w) => (chanceOf(w) ?? 0) / total), none: 0 };
  // 3. Some words have no chance: they share what is left equally.
  const open = n - given;
  if (open > 0) {
    const left = full ? 0 : (100 - total) / open;
    return { words: words.map((w) => (chanceOf(w) ?? left) / 100), none: 0 };
  }
  // 4. Every word has a chance: what is left under 100 % shows no word.
  return { words: words.map((w) => chanceOf(w)! / 100), none: full ? 0 : (100 - total) / 100 };
}

/**
 * Which word one random number u (0 <= u < 1) picks: its index in the list, or -1 for "no word". The words are laid
 * end to end by their shares, then "no word"; u falls into one of them.
 * With no chances set the shares are equal, and the pick is the formula of format version 4, so an effect made before
 * chances existed shows the same word for every seed as it did then.
 */
export function wordAt(words: readonly WithChance[], u: number): number {
  const n = words.length;
  if (!n) return -1;
  if (words.every((w) => w.chance === undefined)) return Math.min(n - 1, Math.floor(u * n));
  const s = wordShares(words);
  let end = 0;
  for (let i = 0; i < n; i++) {
    end += s.words[i]!;
    if (u < end) return i;
  }
  if (s.none > 0) return -1;
  // The shares add up to a hair under 1 (rounding): the last word that can show takes the rest.
  for (let i = n - 1; i >= 0; i--) if (s.words[i]! > 0) return i;
  return -1;
}
