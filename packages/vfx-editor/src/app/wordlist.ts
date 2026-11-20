/**
 * A word layer's words with their chances (UI phase 6, Part B: the plan Mustafa approved on 2026-11-15). One row per word:
 * the word (in capitals), its chance in a % box, and Remove; Add word under them. An empty box shares what is left with the
 * other empty ones (its placeholder says how much); all empty: equal chances. Under 100 %, a line says what is left for no
 * word ("No word: 40 %"); over 100 %, a red note says they still play, scaled down to 100 %. A last line counts 1,000 shots
 * with the game's own pick (wordOdds: the runtime's pickWord). Each change is one undo step.
 *
 * The words box this replaces kept a word's chance when the word was typed again. A row keeps its chance with the row, so a
 * word typed again in its row keeps it too, and so does a word whose spelling is corrected.
 *
 * The file's limits hold here, so the preview never stops on them: 1 to 16 words, each 1 to 24 characters (an empty word
 * puts the old one back), a chance from 0 to 100 %.
 */
import { chanceTotal, wordShares } from '@shamble/vfx-format';
import type { SoundWord, WordLayer } from '@shamble/vfx-format';
import { wordOdds } from '../doc/odds';
import type { AppApi } from './api';
import { formatNumber, h, icon, iconButton, optionalNumber, tip } from './dom';

interface Refresher { refresh(): void }

/** The most words a layer has, the longest word (the file's limits), and the text a new word starts with. */
export const WORDS_MAX = 16;
export const WORD_TEXT_MAX = 24;
const NEW_WORD = 'BOOM';
/** How many shots the line counts. */
const SHOTS = 1000;

/** A share of the plays as the rows show it: a percent with at most one decimal ("40", "33.3"). */
export function percentText(share: number): string {
  return formatNumber(share * 100, 1, true);
}

/**
 * A total of chances as the red note says it, as the checker's warning does: at most two decimals ("120.5"), more only when
 * it takes them to show it is over 100 ("100.001").
 */
export function totalText(total: number): string {
  for (let d = 2; d <= 9; d++) {
    const s = formatNumber(total, d, true);
    if (Number(s) > 100) return s;
  }
  return String(total);
}

/** The 1,000-shot line: each word's count, then no word's when some shots show none. */
export function oddsText(words: readonly SoundWord[], odds: { shots: number; words: number[]; none: number }): string {
  const n = (x: number) => x.toLocaleString('en-US');
  const parts = words.map((w, i) => `${w.text} ${n(odds.words[i] ?? 0)}`);
  if (odds.none > 0) parts.push(`no word ${n(odds.none)}`);
  return `In ${n(odds.shots)} shots: ${parts.join(', ')}`;
}

/**
 * The rows, Add word and the lines, in one field (its label "Words (one picked per play)": the settings inventory and the
 * help texts know the words by it). `label` is that label.
 */
export function wordList(app: AppApi, parts: Refresher[], label: string): HTMLElement {
  const W = () => app.layer() as WordLayer;
  const words = () => W().words;
  /** Change the words: one undo step. */
  const edit = (next: SoundWord[], what: string) => { app.editLayer(['words'], next, { label: what }); app.commit(); };
  const rowsEl = h('div', { class: 'word-rows' });
  const add = h('button', { class: 'plain add-word', attrs: { type: 'button' }, on: { click: () => {
    const list = words();
    if (list.length >= WORDS_MAX) return;
    edit([...list, { text: NEW_WORD }], 'Add word');
    // The panel was built again (the list changed): the new word's box takes the focus, its text chosen, to type over.
    const box = document.querySelector<HTMLInputElement>(`.inspector .word-list input[aria-label="Word ${list.length + 1}"]`);
    box?.focus();
    box?.select();
  } } }, icon('plus'), h('span', { text: 'Add word' }));
  const none = h('p', { class: 'state-line word-none' });
  const over = h('p', { class: 'state-line word-over' });
  const odds = h('p', { class: 'state-line word-odds' });

  // One row per word, built for the list as it is: adding or taking away a word, or a first chance, builds the panel again
  // (the layer's structure changed), so the rows never go out of step with the words.
  const rows = words().map((w, i) => {
    const text = h('input', { class: 'text word-text', attrs: { type: 'text', 'aria-label': `Word ${i + 1}`, maxlength: String(WORD_TEXT_MAX), spellcheck: 'false', autocomplete: 'off' } });
    // Words are drawn in capitals: they are typed in capitals too, where the caret is.
    text.addEventListener('input', () => {
      const at = text.selectionStart, to = text.selectionEnd;
      const up = text.value.toUpperCase();
      if (up !== text.value) { text.value = up; text.setSelectionRange(at, to); }
    });
    text.addEventListener('change', () => {
      if (!text.isConnected) return;
      const list = words();
      const t = text.value.trim().toUpperCase();
      // An empty word puts the old one back; the same word changes nothing.
      if (!t || t === list[i]?.text) { text.value = list[i]?.text ?? ''; return; }
      edit(list.map((x, k) => (k === i ? { ...x, text: t } : x)), 'Word');
      text.value = words()[i]?.text ?? t;
    });
    const chance = optionalNumber({ label: `Chance of ${w.text}`, value: w.chance, step: 1, digits: 3, min: 0, max: 100, unit: '%', onChange: (v) => {
      if (!chance.input.isConnected) return;
      const list = words();
      edit(list.map((x, k) => {
        if (k !== i) return x;
        const { chance: _old, ...rest } = x;
        return v === undefined ? rest : { ...rest, chance: v };
      }), 'Word chance');
    } });
    // Its tooltip: its own words (set in draw), then the help text for "Chance".
    chance.input.setAttribute('data-help-label', 'Chance');
    const remove: HTMLButtonElement = iconButton({ icon: 'trash', label: `Remove ${w.text}`, className: 'mini word-remove', onClick: () => {
      const list = words();
      if (list.length <= 1) return;
      edit(list.filter((_, k) => k !== i), 'Remove word');
    } });
    remove.setAttribute('data-help-label', 'Remove word');
    return { text, chance, remove, el: h('div', { class: 'word-row' }, text, chance.el, remove) };
  });
  rowsEl.append(...rows.map((r) => r.el));

  /** The odds counted for the layer as it is (1,000 picks: only when the layer changed). */
  let counted: { layer: WordLayer; text: string } | null = null;
  const draw = () => {
    const l = W();
    const list = l.words;
    const shares = wordShares(list);
    rows.forEach((r, i) => {
      const w = list[i];
      if (!w) return;
      if (document.activeElement !== r.text) r.text.value = w.text;
      // An empty box shows, faint, the share it gets now.
      r.chance.set(w.chance, w.chance === undefined ? percentText(shares.words[i] ?? 0) : '');
      r.chance.input.setAttribute('data-tip', `Chance of ${w.text}, in % (empty: it shares what is left)`);
      r.remove.disabled = list.length <= 1;
      tip(r.remove, list.length <= 1 ? 'A word layer keeps at least one word' : `Remove ${w.text}`);
    });
    add.disabled = list.length >= WORDS_MAX;
    tip(add, list.length >= WORDS_MAX ? `A word layer has at most ${WORDS_MAX} words` : null);
    // Lines that carry a state: emptied, never hidden with words in them.
    const t = chanceTotal(list);
    none.textContent = shares.none > 0 ? `No word: ${percentText(shares.none)} %` : '';
    over.textContent = t.over ? `The chances add up to ${totalText(t.total)} %: they still play, scaled down to 100 %.` : '';
    if (counted?.layer !== l) counted = { layer: l, text: oddsText(list, wordOdds(l, SHOTS)) };
    odds.textContent = counted.text;
    tip(odds, l.perPlay ? 'Counted with the game\'s own pick, for seeds 1 to 1,000.' : 'Changes every play is off (Seed): every shot shows the same word.');
  };
  draw();
  parts.push({ refresh: draw });
  return h('div', { class: 'field prop word-list', attrs: { role: 'group', 'aria-label': label } },
    h('span', { class: 'flab', text: label }), rowsEl, h('div', { class: 'word-foot' }, add), none, over, odds);
}
