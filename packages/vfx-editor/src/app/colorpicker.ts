/**
 * The colour picker (docs/ui-redesign.md 6.7): a popover left of the right panel that edits a colour role in the project's
 * palette.json. Its header shows the colour, the role's name, whether it changes with the faction, and Close. Under it, three
 * tabs:
 *   - Colour: the faction switch (for a colour per faction), a hue ring with a brightness and saturation triangle, the hex
 *     value with Copy and the exact values, darker and lighter steps, five colours that go with it, how the colour is worked
 *     out from another, the effect's main colour and Revert, and whose value it is;
 *   - Palette: every colour of the palette as a chip (click one to change it), the palette profiles, and New colour;
 *   - Gradients: the ready-made gradients, the project's and the gradient editor (gradients.ts puts them in its slot).
 * Each way in opens its own tab; an opening that names none takes the tab used last. Every change is an undoable edit; one
 * drag is one undo step. It lives outside the inspector, so the swatches can be redrawn while it is open.
 */
import { FACTION_IDS, resolveRole, roleNames } from '@shamble/vfx-format';
import type { FactionId, PaletteEntry, PaletteSource } from '@shamble/vfx-format';
import type { Palette } from '@shamble/vfx-format';
import { DERIVED_ROLES, ROLE_NAME, isFactionRole, roleEntry } from '../doc/edits';
import type { AppApi } from './api';
import { HARMONIES, contrast, harmony, hexToRgb, hsvToRgb, parseHexInput, rgbToHex, rgbToHsv, shades, tints } from './colour';
import type { Harmony } from './colour';
import { fold, h, icon } from './dom';
import { ProfilePanel } from './profiles';

const SOURCE: Record<PaletteSource, string> = {
  mustafa: 'Yours: you chose it.',
  'art-lead': "The Art lead's working value (2026-11-14).",
  'board-v7': "The drawing board's value (v7).",
  derived: 'Worked out from another colour by a formula.',
  assumed: "Shamble VFX's guess, waiting for a decision.",
};

/** The picker's tabs. */
export type PickerTab = 'colour' | 'palette' | 'gradients';
const TABS: readonly { id: PickerTab; label: string; tip: string }[] = [
  { id: 'colour', label: 'Colour', tip: 'Change this colour: the wheel, the hex value, darker and lighter steps, and colours that go with it.' },
  { id: 'palette', label: 'Palette', tip: 'Every colour of the project: click one to change it. Palette profiles keep and load whole sets of colours.' },
  { id: 'gradients', label: 'Gradients', tip: 'Only ramps the game can draw: smooth or banded, from the middle out. Blurred, mesh and image gradients are not in.' },
];
/** The tab used last: an opening that names no tab opens on it. Kept while the page is open, not after a reload. */
let lastTab: PickerTab = 'colour';

/** The wheel's size and its hue ring's width, in CSS pixels. */
const SIZE = 200;
const RING = 16;
/** Room between the picker and the right panel, and the window's edges. */
const GAP = 8;

export class ColourPicker {
  readonly el: HTMLElement;
  private role = '';
  private faction: FactionId = 'soviets';
  private tab: PickerTab = lastTab;
  private hsv: [number, number, number] = [0, 0, 0];
  private shownHex = '';
  /** Each colour as it was when the picker first showed it (for Revert). */
  private openedWith = new Map<string, PaletteEntry>();
  /** The role, faction and colour the status line's words were said for ("Copied #FF2E63."): they go when another shows. */
  private saidFor = '';
  private dragging: 'hue' | 'sv' | null = null;
  private gesture = 0;
  private harmonyKind: Harmony = 'analogous';
  private paletteKey = '';
  /** The palette profiles, on the Palette tab. */
  private profiles!: ProfilePanel;
  /** Where the row that opened the picker was, and the left edge of the right panel (the picker is placed by these). */
  private anchorRect: { left: number; top: number } | null = null;
  private panelLeft: number | null = null;
  /** The swatch or button that opened the picker: the focus goes back to it when the picker closes. */
  private opener: HTMLElement | null = null;
  private parts!: {
    chip: HTMLElement; title: HTMLElement; scope: HTMLElement; note: HTMLElement; source: HTMLElement; factions: HTMLElement;
    canvas: HTMLCanvasElement; hex: HTMLInputElement; slidersBtn: HTMLButtonElement; sliders: HTMLElement;
    hue: HTMLInputElement; sat: HTMLInputElement; val: HTMLInputElement; r: HTMLInputElement; g: HTMLInputElement; b: HTMLInputElement;
    shades: HTMLElement; tints: HTMLElement; harmony: HTMLElement; harmonySel: HTMLSelectElement; derived: HTMLElement;
    main: HTMLButtonElement; revert: HTMLButtonElement; palette: HTMLElement; status: HTMLElement;
    newName: HTMLInputElement; newEach: HTMLInputElement; newError: HTMLElement; newSaid: HTMLElement;
    body: HTMLElement; tabs: Record<PickerTab, HTMLButtonElement>; panels: Record<PickerTab, HTMLElement>;
  };

  constructor(private readonly app: AppApi) {
    this.el = this.build();
    document.body.append(this.el);
    this.showTab(this.tab);
  }

  get isOpen(): boolean {
    return this.el.matches(':popover-open');
  }

  get editing(): { role: string; faction: FactionId } | null {
    return this.isOpen ? { role: this.role, faction: this.faction } : null;
  }

  /** The tab shown. */
  get shownTab(): PickerTab {
    return this.tab;
  }

  /** The Gradients tab's slot (gradients.ts). */
  get gradientSlot(): HTMLElement {
    return this.parts.panels.gradients;
  }

  /**
   * Open on a role, next to the row that was clicked, at a tab: the Colour tab for a colour (the main colour's edit button, a
   * colour in the colour list), the Palette tab for "Edit palette…", the Gradients tab for a gradient's edit button. With
   * no tab, the one used last.
   */
  open(role: string, anchor: HTMLElement, tab: PickerTab = lastTab): void {
    const row = anchor.closest<HTMLElement>('.prop') ?? anchor;
    const a = row.getBoundingClientRect();
    this.anchorRect = { left: a.left, top: a.top };
    this.panelLeft = anchor.closest('.right')?.getBoundingClientRect().left ?? null;
    this.opener = anchor;
    if (!this.isOpen) this.el.showPopover();
    this.show(role);
    this.showTab(tab);
    // Each opening starts at the top of its tab.
    this.parts.body.scrollTop = 0;
    this.place();
    this.focusIn();
  }

  /** Show a tab: it becomes the one used last. The Colour tab's keys are the wheel's; the others start at their tab. */
  showTab(tab: PickerTab): void {
    const changed = tab !== this.tab;
    this.tab = tab;
    lastTab = tab;
    for (const t of TABS) {
      const on = t.id === tab;
      this.parts.tabs[t.id].setAttribute('aria-selected', String(on));
      this.parts.tabs[t.id].tabIndex = on ? 0 : -1;
      this.parts.panels[t.id].hidden = !on;
    }
    if (changed) this.parts.body.scrollTop = 0;
    if (!this.isOpen) return;
    // The profiles are listed each time the Palette tab shows (never when the picker opens on another tab).
    if (tab === 'palette') this.profiles.show();
    this.place();
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.hidePopover();
    // Back to where the work was: the swatch that opened the picker, or else the main colour's. The colour list keeps its
    // swatches while it is open, but a layer's list hides the colours the layer does not use, the main colour's too, and a
    // hidden swatch cannot take the focus (it would stay in the closed picker, then fall to the page).
    const shown = (e: Element | null): e is HTMLElement => e instanceof HTMLElement && e.isConnected && e.getClientRects().length > 0;
    const back = [this.opener, document.querySelector('.swatches .swatch[aria-current="true"]')].find(shown);
    back?.focus({ preventScroll: true });
  }

  /** Edit another role (or the same one for another faction). */
  show(role: string, faction: FactionId = this.app.faction): void {
    this.role = role;
    this.faction = faction;
    const key = `${role}|${faction}`;
    const entry = roleEntry(this.app.palette, role, faction);
    if (entry && !this.openedWith.has(key)) this.openedWith.set(key, { ...entry });
    this.shownHex = '';
    this.refresh();
  }

  /** The document or the faction changed: show what is there now (never while dragging). */
  refresh(): void {
    if (!this.isOpen || this.dragging) return;
    const pal = this.app.palette;
    if (!roleNames(pal).includes(this.role)) { this.close(); return; }
    if (isFactionRole(pal, this.role) && this.faction !== this.app.faction) this.faction = this.app.faction;
    const hex = this.currentHex()!;
    if (hex !== this.shownHex) {
      const [hh, s, v] = rgbToHsv(hexToRgb(hex));
      // A grey or black has no hue of its own: keep the one shown.
      this.hsv = [s > 0 && v > 0 ? hh : this.hsv[0], v > 0 ? s : this.hsv[1], v];
      this.shownHex = hex;
    }
    this.drawAll(hex);
    this.profiles.refresh();
  }

  /** Before a profile is loaded: when the colour shown is not in the new colours, show the main colour (or the first). */
  private keepRole(next: Palette): void {
    const names = roleNames(next);
    if (names.includes(this.role)) return;
    const main = this.app.effect()?.controls.colour;
    this.role = main && names.includes(main) ? main : names[0] ?? this.role;
    this.shownHex = '';
  }

  // ---------------------------------------------------------------- building

  private build(): HTMLElement {
    const chip = h('span', { class: 'cp-chip' });
    const title = h('code', { class: 'cp-title' });
    const scope = h('span', { class: 'cp-scope' });
    const closeBtn = h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Close the colour picker' }, title: 'Close (Esc)', on: { click: () => this.close() } }, icon('close'));

    // The tabs: a full-width segmented control. ← and → (Home, End) move between them, as in any group of tabs.
    const tabList = h('div', { class: 'cp-tabs', attrs: { role: 'tablist', 'aria-label': 'Colour picker' } });
    const tabs = {} as Record<PickerTab, HTMLButtonElement>;
    const panels = {} as Record<PickerTab, HTMLElement>;
    for (const t of TABS) {
      tabs[t.id] = h('button', {
        class: 'cp-tab', title: t.tip, text: t.label,
        attrs: { type: 'button', role: 'tab', id: `cp-tab-${t.id}`, 'aria-controls': `cp-panel-${t.id}`, 'aria-selected': 'false', tabindex: '-1', 'data-tab': t.id },
        on: { click: () => this.showTab(t.id) },
      }) as HTMLButtonElement;
      panels[t.id] = h('div', { class: `cp-panel cp-panel-${t.id}`, attrs: { role: 'tabpanel', id: `cp-panel-${t.id}`, 'aria-labelledby': `cp-tab-${t.id}`, hidden: '' } });
      tabList.append(tabs[t.id]);
    }
    tabList.addEventListener('keydown', (e) => {
      const i = TABS.findIndex((t) => t.id === this.tab);
      const n = TABS.length;
      const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (to < 0) return;
      e.preventDefault();
      this.showTab(TABS[to]!.id);
      tabs[TABS[to]!.id].focus({ preventScroll: true });
    });

    // ---- the Colour tab
    const note = h('p', { class: 'cp-note' });
    const source = h('p', { class: 'cp-source' });
    const factions = h('div', { class: 'cp-factions', attrs: { role: 'group', 'aria-label': 'Which faction\'s colour to change' } });
    const canvas = h('canvas', { class: 'cp-wheel', attrs: { tabindex: '0', role: 'img', width: String(SIZE), height: String(SIZE) } }) as HTMLCanvasElement;
    const hex = h('input', { class: 'text cp-hex', attrs: { type: 'text', 'aria-label': 'Hex colour', maxlength: '7', spellcheck: 'false', autocomplete: 'off' } }) as HTMLInputElement;
    const copy = h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Copy the hex value' }, title: 'Copy', on: { click: () => void this.copyHex() } }, icon('copy'));
    const slidersBtn = h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Exact values', 'aria-pressed': 'false' }, title: 'Exact values: hue, saturation, brightness, red, green, blue',
      on: { click: () => this.toggleSliders() } }, icon('sliders')) as HTMLButtonElement;
    const num = (label: string, max: number) => h('input', { class: 'num', attrs: { type: 'number', min: '0', max: String(max), step: '1', 'aria-label': label } }) as HTMLInputElement;
    const range = (label: string, max: number) => h('input', { attrs: { type: 'range', min: '0', max: String(max), step: '1', 'aria-label': label } }) as HTMLInputElement;
    const hue = range('Hue', 359), sat = range('Saturation', 100), val = range('Brightness', 100);
    const r = num('Red', 255), g = num('Green', 255), b = num('Blue', 255);
    const sliders = h('div', { class: 'cp-sliders', attrs: { hidden: '' } },
      h('label', { class: 'cp-slider' }, h('span', { text: 'Hue' }), hue),
      h('label', { class: 'cp-slider' }, h('span', { text: 'Saturation' }), sat),
      h('label', { class: 'cp-slider' }, h('span', { text: 'Brightness' }), val),
      h('div', { class: 'cp-rgb' }, h('label', {}, h('span', { text: 'R' }), r), h('label', {}, h('span', { text: 'G' }), g), h('label', {}, h('span', { text: 'B' }), b)));
    const shadesRow = h('div', { class: 'cp-row', attrs: { role: 'group', 'aria-label': 'Darker' } });
    const tintsRow = h('div', { class: 'cp-row', attrs: { role: 'group', 'aria-label': 'Lighter' } });
    const harmonyRow = h('div', { class: 'cp-row cp-row5', attrs: { role: 'group', 'aria-label': 'Colours that go with it' } });
    const harmonySel = h('select', { class: 'cp-harmony', attrs: { 'aria-label': 'Colour scheme' } }, ...HARMONIES.map((x) => h('option', { attrs: { value: x.value }, text: x.label }))) as HTMLSelectElement;
    const derived = h('div', { class: 'cp-derived' });
    const main = h('button', { class: 'tb', attrs: { type: 'button', 'aria-pressed': 'false' }, on: { click: () => this.app.setMainColour(this.role) } }) as HTMLButtonElement;
    const revert = h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Revert', title: 'Back to the colour it had when you opened it', on: { click: () => this.revert() } }) as HTMLButtonElement;
    const status = h('p', { class: 'cp-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    panels.colour.append(note, factions, canvas,
      h('div', { class: 'cp-hexrow' }, hex, copy, slidersBtn), sliders,
      // Darker and Lighter: two strips with a short label on the left; Goes with it: its scheme, then its strip under them.
      h('div', { class: 'cp-strips' },
        h('span', { class: 'cp-strip-label', text: 'Darker' }), shadesRow,
        h('span', { class: 'cp-strip-label', text: 'Lighter' }), tintsRow,
        h('div', { class: 'cp-goes' }, h('span', { class: 'cp-strip-label', text: 'Goes with it' }), harmonySel), harmonyRow),
      derived,
      h('div', { class: 'cp-actions' }, main, revert),
      source, status);

    // ---- the Palette tab: the chips, then New colour at the bottom, folded
    const palette = h('div', { class: 'cp-palette' });
    const newName = h('input', { class: 'text', attrs: { type: 'text', placeholder: 'such as fire.blue', 'aria-label': 'New colour name', spellcheck: 'false', autocomplete: 'off' } }) as HTMLInputElement;
    const newShared = h('input', { attrs: { type: 'radio', name: 'cp-new-kind', checked: '' } }) as HTMLInputElement;
    const newEach = h('input', { attrs: { type: 'radio', name: 'cp-new-kind' } }) as HTMLInputElement;
    const newError = h('p', { class: 'cp-error', attrs: { role: 'alert' } });
    // What Add colour did, said here on the Palette tab (the status line is on the Colour tab, which does not show then).
    const newSaid = h('p', { class: 'cp-new-said', attrs: { role: 'status', 'aria-live': 'polite' } });
    const add = h('button', { class: 'tb', attrs: { type: 'button' }, text: 'Add colour', on: { click: () => this.addColour() } });
    const newFold = fold('New colour', [
      h('p', { class: 'hint', text: 'A new role, starting as the colour above. It cannot be renamed or removed later.' }),
      newName,
      h('label', { class: 'check' }, newShared, h('span', { text: 'One colour for every faction' })),
      h('label', { class: 'check' }, newEach, h('span', { text: 'One colour per faction (like team)' })),
      newError, add, newSaid], false, [], { className: 'cp-new', remember: false });
    newFold.querySelector(':scope > summary')!.setAttribute('data-tip', 'A new colour role, starting as the colour above. Effects name it; a role cannot be renamed or removed later.');
    this.profiles = new ProfilePanel(this.app, (next) => this.keepRole(next));
    panels.palette.append(palette, this.profiles.el, newFold);

    const body = h('div', { class: 'cp-body' }, panels.colour, panels.palette, panels.gradients);
    const el = h('div', { class: 'cpick', attrs: { popover: 'manual', role: 'dialog', 'aria-label': 'Colour picker' } },
      h('div', { class: 'cp-top' }, h('div', { class: 'cp-head' }, chip, h('div', { class: 'cp-name' }, title, scope), closeBtn), tabList),
      body);
    this.parts = { chip, title, scope, note, source, factions, canvas, hex, slidersBtn, sliders, hue, sat, val, r, g, b, shades: shadesRow, tints: tintsRow,
      harmony: harmonyRow, harmonySel, derived, main, revert, palette, status, newName, newEach, newError, newSaid, body, tabs, panels };

    // The wheel: drag the ring for the hue, the triangle for brightness and saturation.
    canvas.addEventListener('pointerdown', (e) => {
      const [x, y] = this.local(e);
      const d = Math.hypot(x - SIZE / 2, y - SIZE / 2), R1 = SIZE / 2 - 3, R0 = R1 - RING;
      if (d >= R0 - 3 && d <= R1 + 6) this.dragging = 'hue';
      else if (this.bary(x, y).every((v) => v > -0.12)) this.dragging = 'sv';
      else return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.gesture++;
      this.dragTo(x, y);
    });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) { const [x, y] = this.local(e); this.dragTo(x, y); } });
    const end = () => { if (!this.dragging) return; this.dragging = null; this.app.commit(); this.refresh(); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', (e) => this.key(e));
    // It stays open while you play the effect or fire; Escape (or Close) puts it away.
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); this.close(); } });
    canvas.addEventListener('keyup', () => this.app.commit());

    hex.addEventListener('change', () => this.typedHex());
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.typedHex(); } });
    for (const [input, k] of [[hue, 0], [sat, 1], [val, 2]] as const) {
      input.addEventListener('input', () => {
        const next: [number, number, number] = [...this.hsv];
        next[k] = k === 0 ? Number(input.value) : Number(input.value) / 100;
        this.setHsv(next, 'slider');
      });
      input.addEventListener('change', () => this.app.commit());
    }
    for (const input of [r, g, b]) {
      input.addEventListener('change', () => {
        const c = [r, g, b].map((x) => Math.min(255, Math.max(0, Math.round(Number(x.value) || 0)))) as [number, number, number];
        // The boxes show the numbers used, also when that is the colour already and nothing is drawn again.
        [r, g, b].forEach((x, i) => { x.value = String(c[i]); });
        this.useHex(rgbToHex(c));
      });
    }
    harmonySel.addEventListener('change', () => { this.harmonyKind = harmonySel.value as Harmony; this.drawAll(this.currentHex()!); });
    newName.addEventListener('input', () => { this.parts.newError.textContent = this.nameProblem(newName.value.trim()) ?? ''; this.parts.newSaid.textContent = ''; });
    newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addColour(); } });
    window.addEventListener('resize', () => { if (this.isOpen) this.place(); });
    // When a tab or a section opens or closes, keep the whole picker inside the window.
    new ResizeObserver(() => { if (this.isOpen) this.place(); }).observe(el);
    // Revert goes back to the colours as they were when the picker opened this time; the status line's words go with it.
    el.addEventListener('toggle', (e) => { if ((e as ToggleEvent).newState === 'closed') { this.openedWith.clear(); this.dragging = null; this.say(''); this.parts.newSaid.textContent = ''; } });
    return el;
  }

  // ---------------------------------------------------------------- showing

  private currentHex(): string | undefined {
    return resolveRole(this.app.palette, this.role, this.faction);
  }

  /** The keyboard focus into the tab shown: the wheel on the Colour tab (its arrow keys change the colour), else the tab. */
  private focusIn(): void {
    if (this.tab === 'colour') this.parts.canvas.focus({ preventScroll: true });
    else this.parts.tabs[this.tab].focus({ preventScroll: true });
  }

  private drawAll(hex: string): void {
    const p = this.parts, pal = this.app.palette;
    const faction = isFactionRole(pal, this.role);
    const entry = roleEntry(pal, this.role, this.faction);
    // The status line speaks of the colour it was said for: another role, another faction's colour or a new value takes its
    // words away (they stayed for good, under every colour shown after, and kept the tab a line or two taller).
    if (this.saidFor && this.saidFor !== `${this.role}|${this.faction}|${hex}`) this.say('');
    p.chip.style.background = hex;
    p.title.textContent = this.role;
    p.scope.textContent = faction ? `Changes with the faction: ${pal.factions[this.faction].name}` : 'One colour for every faction';
    p.note.textContent = entry?.note ?? '';
    p.note.hidden = !entry?.note;
    p.source.textContent = entry ? SOURCE[entry.from] ?? '' : '';
    // The faction switch, for colours that change with the faction: each faction's marking and its colour (its name in the
    // tooltip and for screen readers).
    p.factions.hidden = !faction;
    if (faction) {
      p.factions.replaceChildren(...FACTION_IDS.map((f) => {
        const v = resolveRole(pal, this.role, f)!;
        const name = pal.factions[f].name;
        return h('button', { class: 'cp-faction', attrs: { type: 'button', 'aria-pressed': String(f === this.faction), 'aria-label': `${name}: ${v}` },
          title: `${name}: change the ${name} colour (the preview switches to ${name})`,
          on: { click: () => { this.app.setFaction(f); this.show(this.role, f); } } },
        icon(`faction-${f}`), h('span', { class: 'cp-dot', style: `background:${v}` }));
      }));
    }
    this.drawWheel();
    p.canvas.setAttribute('aria-label', `Colour wheel for ${this.role}: hue ${Math.round(this.hsv[0])}°, saturation ${Math.round(this.hsv[1] * 100)} %, brightness ${Math.round(this.hsv[2] * 100)} %. Arrow keys change hue and brightness, Page Up and Page Down the saturation.`);
    if (document.activeElement !== p.hex) p.hex.value = hex;
    p.hue.value = String(Math.round(this.hsv[0]));
    p.sat.value = String(Math.round(this.hsv[1] * 100));
    p.val.value = String(Math.round(this.hsv[2] * 100));
    const [r, g, b] = hexToRgb(hex);
    for (const [input, v] of [[p.r, r], [p.g, g], [p.b, b]] as const) if (document.activeElement !== input) input.value = String(v);
    const swatches = (row: HTMLElement, list: string[], what: string) => row.replaceChildren(...list.map((x) => h('button', {
      class: 'cp-swatch', style: `background:${x}`, attrs: { type: 'button', 'aria-label': `${what}: ${x}` }, title: `${x}: use it`, on: { click: () => this.useHex(x) },
    })));
    swatches(p.shades, shades(hex), 'Darker');
    swatches(p.tints, tints(hex), 'Lighter');
    swatches(p.harmony, harmony(hex, this.harmonyKind), 'Goes with it');
    // Worked out from another colour: say how, and offer to work it out again.
    const d = DERIVED_ROLES[this.role];
    p.derived.hidden = !d;
    if (d) {
      const isDerived = entry?.from === 'derived';
      // Set by hand, in as few words as worked out (no more lines): "Usually worked out from glow (glow mixed with 25 % white); now
      // set by hand." took five lines beside the button, and glow.hot's tab to 661 px, over the brief's 640.
      p.derived.replaceChildren(h('span', { text: isDerived ? `Worked out from ${d.from}: ${d.text}.` : `Set by hand. Usually ${d.text}.` }),
        h('button', { class: 'mini', attrs: { type: 'button' }, text: 'Work it out again', title: `Set it to ${d.text}, from the current ${d.from}`, on: { click: () => this.app.deriveColour(this.role, this.faction) } }));
    }
    const isMain = this.app.effect()?.controls.colour === this.role;
    p.main.textContent = isMain ? "This effect's main colour" : "Use as this effect's main colour";
    p.main.setAttribute('aria-pressed', String(isMain));
    p.main.disabled = !this.app.effect();
    const before = this.openedWith.get(`${this.role}|${this.faction}`);
    p.revert.disabled = !before || (before.hex === hex && before.from === entry?.from);
    this.drawPalette();
  }

  /** The Palette tab's chips: the team colours of the faction shown, then the shared ones, A to Z; names in their tooltips. */
  private drawPalette(): void {
    const pal = this.app.palette;
    const key = `${roleNames(pal).join(',')}|${this.role}|${this.faction}|${roleNames(pal).map((r) => resolveRole(pal, r, this.faction)).join('')}|${this.app.effect()?.controls.colour}`;
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    const shared = Object.keys(pal.roles).sort(), team = Object.keys(pal.factions[this.faction].roles).sort();
    const chip = (r: string) => {
      const v = resolveRole(pal, r, this.faction)!;
      const main = this.app.effect()?.controls.colour === r;
      return h('button', { class: `cp-pchip${r === this.role ? ' sel' : ''}${main ? ' main' : ''}`, style: `background:${v};--on:${contrast(v, '#FFFFFF') > 3 ? '#FFFFFF' : '#11121A'}`,
        attrs: { type: 'button', 'aria-label': `Change ${r} (${v})${main ? ", this effect's main colour" : ''}`, 'aria-current': String(r === this.role) },
        title: `${r} ${v}${main ? " · this effect's main colour" : ''}`, on: { click: () => this.pick(r) } });
    };
    this.parts.palette.replaceChildren(
      h('div', { class: 'cp-label', text: `Team colours (${pal.factions[this.faction].name})` }), h('div', { class: 'cp-pgrid' }, ...team.map(chip)),
      h('div', { class: 'cp-label', text: 'Shared colours' }), h('div', { class: 'cp-pgrid' }, ...shared.map(chip)));
  }

  /** A chip clicked in the Palette tab: change that colour, on the Colour tab. */
  private pick(role: string): void {
    this.show(role);
    this.showTab('colour');
    this.parts.canvas.focus({ preventScroll: true });
  }

  /**
   * Put the picker left of the right panel, its top level with the row that opened it, and the whole of it inside the window
   * (it moves up when it would pass the bottom; a picker taller than the window scrolls inside).
   */
  private place(): void {
    const a = this.anchorRect;
    if (!a) return;
    const w = this.el.offsetWidth, hh = this.el.offsetHeight;
    let left = (this.panelLeft ?? a.left) - w - GAP;
    if (left < GAP) left = Math.max(GAP, Math.min(window.innerWidth - w - GAP, a.left));
    const top = Math.max(GAP, Math.min(window.innerHeight - hh - GAP, a.top));
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }

  // ---------------------------------------------------------------- the wheel

  private corners(): [[number, number], [number, number], [number, number]] {
    const c = SIZE / 2, R = SIZE / 2 - 3 - RING - 7;
    const a = ((this.hsv[0] + 30) * Math.PI) / 180;
    const at = (t: number): [number, number] => [c + R * Math.cos(t), c - R * Math.sin(t)];
    return [at(a), at(a + (2 * Math.PI) / 3), at(a + (4 * Math.PI) / 3)];
  }

  /** Barycentric weights of a point: hue corner, white corner, black corner. */
  private bary(x: number, y: number): [number, number, number] {
    const [[hx, hy], [wx, wy], [kx, ky]] = this.corners();
    const d = (wy - ky) * (hx - kx) + (kx - wx) * (hy - ky);
    const bh = ((wy - ky) * (x - kx) + (kx - wx) * (y - ky)) / d;
    const bw = ((ky - hy) * (x - kx) + (hx - kx) * (y - ky)) / d;
    return [bh, bw, 1 - bh - bw];
  }

  private drawWheel(): void {
    const cv = this.parts.canvas, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (cv.width !== SIZE * dpr) { cv.width = SIZE * dpr; cv.height = SIZE * dpr; }
    const g = cv.getContext('2d')!;
    const c = SIZE / 2, R1 = SIZE / 2 - 3, R0 = R1 - RING;
    // The triangle: hue, white and black corners, filled pixel by pixel with soft edges.
    const [hr, hg, hb] = hsvToRgb(this.hsv[0], 1, 1);
    const img = g.createImageData(cv.width, cv.height);
    const [[hx, hy], [wx, wy], [kx, ky]] = this.corners();
    const d = (wy - ky) * (hx - kx) + (kx - wx) * (hy - ky);
    const edge = 1.5 * (R0 - 7) * dpr;
    for (let py = 0; py < cv.height; py++) {
      for (let px = 0; px < cv.width; px++) {
        const x = (px + 0.5) / dpr, y = (py + 0.5) / dpr;
        const bh = ((wy - ky) * (x - kx) + (kx - wx) * (y - ky)) / d;
        const bw = ((ky - hy) * (x - kx) + (hx - kx) * (y - ky)) / d;
        const bk = 1 - bh - bw;
        const m = Math.min(bh, bw, bk);
        if (m < -1 / edge) continue;
        const i = (py * cv.width + px) * 4;
        const H = Math.max(0, bh), W = Math.max(0, bw);
        img.data[i] = hr * H + 255 * W;
        img.data[i + 1] = hg * H + 255 * W;
        img.data[i + 2] = hb * H + 255 * W;
        img.data[i + 3] = Math.min(255, Math.max(0, (m * edge + 0.5) * 255));
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.putImageData(img, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The hue ring (hue grows anticlockwise; yellow at the top).
    const ring = g.createConicGradient(0, c, c);
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const [r, gg, b] = hsvToRgb(330 - 360 * t, 1, 1);
      ring.addColorStop(t, `rgb(${r},${gg},${b})`);
    }
    g.beginPath();
    g.arc(c, c, R1, 0, Math.PI * 2);
    g.arc(c, c, R0, 0, Math.PI * 2, true);
    g.fillStyle = ring;
    g.fill('evenodd');
    // Handles: on the ring, and in the triangle.
    const a = ((this.hsv[0] + 30) * Math.PI) / 180, rm = (R0 + R1) / 2;
    this.handle(g, c + rm * Math.cos(a), c - rm * Math.sin(a), RING / 2 - 1);
    const [, s, v] = this.hsv;
    const bH = s * v, bW = (1 - s) * v, bK = 1 - v;
    this.handle(g, hx * bH + wx * bW + kx * bK, hy * bH + wy * bW + ky * bK, 7);
  }

  private handle(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.lineWidth = 3;
    g.strokeStyle = '#11121A';
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = '#FFFFFF';
    g.stroke();
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.parts.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
  }

  private dragTo(x: number, y: number): void {
    if (this.dragging === 'hue') {
      const deg = (Math.atan2(-(y - SIZE / 2), x - SIZE / 2) * 180) / Math.PI;
      this.setHsv([(((deg - 30) % 360) + 360) % 360, this.hsv[1], this.hsv[2]], `drag${this.gesture}`);
    } else if (this.dragging === 'sv') {
      let [bh, bw, bk] = this.bary(x, y).map((v) => Math.max(0, v)) as [number, number, number];
      const sum = bh + bw + bk || 1;
      bh /= sum; bw /= sum; bk /= sum;
      const v = Math.min(1, bh + bw);
      this.setHsv([this.hsv[0], v > 1e-6 ? bh / v : this.hsv[1], v], `drag${this.gesture}`);
    }
  }

  private key(e: KeyboardEvent): void {
    const big = e.shiftKey;
    const [hh, s, v] = this.hsv;
    let next: [number, number, number] | null = null;
    if (e.key === 'ArrowLeft') next = [(hh - (big ? 10 : 1) + 360) % 360, s, v];
    else if (e.key === 'ArrowRight') next = [(hh + (big ? 10 : 1)) % 360, s, v];
    else if (e.key === 'ArrowUp') next = [hh, s, Math.min(1, v + (big ? 0.1 : 0.01))];
    else if (e.key === 'ArrowDown') next = [hh, s, Math.max(0, v - (big ? 0.1 : 0.01))];
    else if (e.key === 'PageUp') next = [hh, Math.min(1, s + 0.05), v];
    else if (e.key === 'PageDown') next = [hh, Math.max(0, s - 0.05), v];
    if (!next) return;
    e.preventDefault();
    this.setHsv(next, 'keys');
  }

  // ---------------------------------------------------------------- changing

  /** A new colour from the wheel or the sliders: kept as HSV here, so the hue does not jump on greys. */
  private setHsv(next: [number, number, number], mergeKey: string): void {
    this.hsv = next;
    const hex = rgbToHex(hsvToRgb(next[0], next[1], next[2]));
    this.shownHex = hex;
    this.app.setColour(this.role, hex, { faction: this.faction, mergeKey });
    this.drawAll(hex);
  }

  /**
   * A finished colour (typed, or a swatch): one undo step. When it is the colour already, nothing is drawn again: after
   * Enter, the hex box's change event comes once more as it loses the focus, and a redraw then built the buttons under the
   * pointer again and lost the click that took the focus (the faction switch, Work it out again, a Darker colour).
   */
  private useHex(hex: string): void {
    const before = this.app.palette;
    this.app.setColour(this.role, hex, { faction: this.faction });
    this.app.commit();
    if (this.app.palette !== before) this.refresh();
  }

  private typedHex(): void {
    const v = parseHexInput(this.parts.hex.value);
    // One line, as the source line whose place it takes (the tab stays under 640 px); red, as it says what went wrong.
    if (!v) { this.say('Not a colour: type #RRGGBB, such as #F47A1C.', true); this.parts.hex.value = this.currentHex() ?? ''; return; }
    // As the picker writes it (#RRGGBB), also when it is the colour already and nothing is drawn again.
    this.parts.hex.value = v;
    this.useHex(v);
  }

  private revert(): void {
    const before = this.openedWith.get(`${this.role}|${this.faction}`);
    if (!before) return;
    this.app.restoreColour(this.role, before, this.faction);
    this.refresh();
  }

  private async copyHex(): Promise<void> {
    const v = this.currentHex() ?? '';
    try { await navigator.clipboard.writeText(v); this.say(`Copied ${v}.`); } catch { this.parts.hex.select(); this.say('Press Ctrl+C to copy.'); }
  }

  private toggleSliders(): void {
    const show = this.parts.sliders.hidden;
    this.parts.sliders.hidden = !show;
    this.parts.slidersBtn.setAttribute('aria-pressed', String(show));
    this.place();
  }

  private nameProblem(name: string): string | null {
    if (!name) return null;
    if (!ROLE_NAME.test(name)) return 'Use lowercase words joined by dots, such as fire.blue.';
    if (roleNames(this.app.palette).includes(name)) return `"${name}" is a colour already.`;
    return null;
  }

  private addColour(): void {
    const name = this.parts.newName.value.trim();
    const problem = name ? this.nameProblem(name) : 'Give the colour a name first.';
    if (problem) { this.parts.newError.textContent = problem; this.parts.newSaid.textContent = ''; return; }
    const err = this.app.addColour(name, this.parts.newEach.checked, this.currentHex() ?? '#FFFFFF');
    if (err) { this.parts.newError.textContent = err; this.parts.newSaid.textContent = ''; return; }
    this.parts.newName.value = '';
    this.parts.newError.textContent = '';
    this.show(name);
    this.parts.newSaid.textContent = `Added ${name}. Effects can use it now; Save keeps it in the project's palette.json.`;
  }

  /**
   * The status line: words about the colour shown, in the source line's place while they show (empty words clear it, and
   * the source line shows again); `bad` when they say what went wrong (red).
   */
  private say(text: string, bad = false): void {
    this.parts.status.textContent = text;
    this.parts.status.classList.toggle('bad', bad && !!text);
    this.saidFor = text ? `${this.role}|${this.faction}|${this.currentHex() ?? ''}` : '';
  }
}
