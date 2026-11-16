/**
 * The help texts in the tooltips (help.ts): for an element under the pointer or the keyboard focus, its label and where it
 * is shown, read from the page when the tooltip is about to show. Nothing is written into the page, so a label that
 * changes (Save and Save as…, Play and Pause) or a label added later gets its text as soon as help.ts has one.
 *
 * Where a label is shown, as help.ts asks for it (the same names the settings inventory of tools/ui-shots.mjs uses):
 *   - in the right panel: the titles of the folding sections round it, from the outside in, or else the title of its card
 *     ("Effect", "Shape layer", "Cost"). A section's own title is asked for with title: true and the sections round it.
 *     The panel says which layer type and shape kind it shows (data-help-layer and data-help-kind, on [data-help-panel]);
 *   - in the bars and the lists: the region's name (data-help-section: Top bar, Preview bar, Transport, Effects, Layers).
 * Only the editor's own words are looked up: never names people give (the rows, the header's names, the riders, the colour
 * swatches), and not in the colour picker or the dialogs.
 */
import { helpFor, shortcutFor } from './help';
import type { HelpWhere, LayerType, ShapeKind } from './help';
import type { TipHelp } from './dom';

/** Field labels, as the settings inventory reads them; a checkbox is named by its label (label.check, below). */
const FIELD_LABEL = '.lab > label, .lab > span:first-child:not(.hint):not(.val), .flab';
/** Section titles: a fold's summary, a card's title. */
const SECTION_TITLE = 'details > summary, section.card > h2, .card-head > h2';
/** Buttons with the editor's own words on them. */
const BUTTON = 'button.tb, button.mini, button.plain, button.seg, button.fire, button.play';
/** Names people give, and what holds them. */
const NAMES = '.item, .item-main, .layer-item, .tl-name, .rider, .crumb, .swatch, .swatch-extra, .insp-title';
const ELSEWHERE = '.cpick, .dlg';

const words = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const titleWords = (el: Element) => (el.getAttribute('data-tip') ?? el.getAttribute('title') ?? '').replace(/\s+\([^()]*\)$/, '').trim();

/** The label (or labels to try, in order) an element is known by, and whether it is a section's title. */
function labelOf(el: Element): { labels: string[]; title: boolean } | null {
  if (el.matches(SECTION_TITLE)) return { labels: [words(el)], title: true };
  // A checkbox: the name a screen reader says (its aria-label: "Shows in Low"), or the words next to it.
  if (el.matches('label.check')) return { labels: [el.querySelector('input')?.getAttribute('aria-label') ?? '', words(el.querySelector(':scope > span'))], title: false };
  if (el.matches(FIELD_LABEL)) {
    const t = words(el);
    if (t && t !== '…') return { labels: [t], title: false };
    // The second and third box of a pair or a group of three: the first box's label speaks for the row.
    const field = el.closest('.field');
    const row = field?.parentElement?.matches('.fieldrow') ? field.parentElement : null;
    const first = words(row?.querySelector(':scope > .field .flab'));
    return first && first !== '…' ? { labels: [first], title: false } : null;
  }
  if (el.matches('table.cost th')) return { labels: [words(el)], title: false };
  if (el.matches(BUTTON)) return { labels: [el.getAttribute('aria-label') ?? '', titleWords(el), words(el)], title: false };
  // A control with no label of its own next to it (the add menu): its aria-label.
  if (el.matches('select, input') && !el.closest('label.field, .field, .row, label.check')) return { labels: [el.getAttribute('aria-label') ?? ''], title: false };
  const named = el.getAttribute('data-help-label');
  return named ? { labels: [named], title: false } : null;
}

/** Where an element is shown, as help.ts wants it. */
function whereOf(el: Element, title: boolean): HelpWhere {
  const region = el.closest<HTMLElement>('[data-help-section]');
  if (region) return { section: region.dataset.helpSection!, ...(title ? { title: true } : {}) };
  const panel = el.closest<HTMLElement>('[data-help-panel]');
  const layer = panel?.dataset.helpLayer as LayerType | undefined;
  const kind = panel?.dataset.helpKind as ShapeKind | undefined;
  // The folding sections round it, from the outside in; for a section's own title, the ones round its section.
  const path: string[] = [];
  const from = title ? (el.matches('summary') ? el.parentElement?.parentElement : null) : el;
  for (let d = from?.closest('details'); d && (!panel || panel.contains(d)); d = d.parentElement?.closest('details')) path.unshift(words(d.querySelector(':scope > summary')));
  // A field in no fold: its card's title.
  if (!title && !path.length) {
    const card = words(el.closest('section.card')?.querySelector(':scope > h2, :scope > .card-head > h2'));
    if (card) path.push(card);
  }
  return { section: path, ...(layer ? { layer } : {}), ...(kind ? { kind } : {}), ...(title ? { title: true } : {}) };
}

/** The help text and shortcut for an element, from its label where it is shown; null when help.ts has neither. */
export function lookupHelp(el: Element): TipHelp | null {
  if (el.matches(NAMES) || el.closest(ELSEWHERE)) return null;
  const asked = labelOf(el);
  if (!asked) return null;
  const where = whereOf(el, asked.title);
  for (const label of asked.labels) {
    if (!label) continue;
    const text = helpFor(label, where);
    const key = shortcutFor(label);
    if (text || key) return { ...(text ? { text } : {}), ...(key ? { key } : {}) };
  }
  return null;
}
