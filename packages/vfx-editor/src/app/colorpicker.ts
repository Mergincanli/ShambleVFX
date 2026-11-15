/**
 * The colour picker: opens over a palette swatch and edits that colour role in the project's palette.json.
 * A hue ring with a brightness and saturation triangle, the hex value, sliders, darker and lighter steps, five colours that
 * go with it, the whole palette (click one to edit it), and a form to add a colour. Every change is an undoable edit;
 * one drag is one undo step. It lives outside the inspector, so the swatches can be redrawn while it is open.
 */
import { FACTION_IDS, resolveRole, roleNames } from '@shamble/vfx-format';
import type { FactionId, PaletteEntry, PaletteSource } from '@shamble/vfx-format';
import { DERIVED_ROLES, ROLE_NAME, isFactionRole, roleEntry } from '../doc/edits';
import type { AppApi } from './api';
import { HARMONIES, contrast, harmony, hexToRgb, hsvToRgb, parseHexInput, rgbToHex, rgbToHsv, shades, tints } from './colour';
import type { Harmony } from './colour';
import { h, icon } from './dom';

const SOURCE: Record<PaletteSource, string> = {
  mustafa: 'Yours: you chose it.',
  'art-lead': "The Art lead's working value (2026-11-14).",
  'board-v7': "The drawing board's value (v7).",
  derived: 'Worked out from another colour by a formula.',
  assumed: "Shamble VFX's guess, waiting for a decision.",
};
const SIZE = 224;
const RING = 18;

export class ColourPicker {
  readonly el: HTMLElement;
  private role = '';
  private faction: FactionId = 'soviets';
  private hsv: [number, number, number] = [0, 0, 0];
  private shownHex = '';
  /** Each colour as it was when the picker first showed it (for Revert). */
  private openedWith = new Map<string, PaletteEntry>();
  private dragging: 'hue' | 'sv' | null = null;
  private gesture = 0;
  private harmonyKind: Harmony = 'analogous';
  private paletteKey = '';
  private anchor: HTMLElement | null = null;
  private parts!: {
    chip: HTMLElement; title: HTMLElement; scope: HTMLElement; note: HTMLElement; source: HTMLElement; factions: HTMLElement;
    canvas: HTMLCanvasElement; hex: HTMLInputElement; slidersBtn: HTMLButtonElement; sliders: HTMLElement;
    hue: HTMLInputElement; sat: HTMLInputElement; val: HTMLInputElement; r: HTMLInputElement; g: HTMLInputElement; b: HTMLInputElement;
    shades: HTMLElement; tints: HTMLElement; harmony: HTMLElement; harmonySel: HTMLSelectElement; derived: HTMLElement;
    main: HTMLButtonElement; revert: HTMLButtonElement; palette: HTMLElement; status: HTMLElement;
    newName: HTMLInputElement; newEach: HTMLInputElement; newError: HTMLElement; extra: HTMLElement;
  };

  constructor(private readonly app: AppApi) {
    this.el = this.build();
    document.body.append(this.el);
  }

  get isOpen(): boolean {
    return this.el.matches(':popover-open');
  }

  get editing(): { role: string; faction: FactionId } | null {
    return this.isOpen ? { role: this.role, faction: this.faction } : null;
  }

  /** A place for more panels (the gradients). */
  get extraSlot(): HTMLElement {
    return this.parts.extra;
  }

  /** Open on a role, next to the swatch that was clicked. */
  open(role: string, anchor: HTMLElement): void {
    this.anchor = anchor;
    if (!this.isOpen) this.el.showPopover();
    this.show(role);
    this.place();
    this.parts.canvas.focus({ preventScroll: true });
  }

  close(): void {
    if (this.isOpen) this.el.hidePopover();
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
  }

  // ---------------------------------------------------------------- building

  private build(): HTMLElement {
    const chip = h('span', { class: 'cp-chip' });
    const title = h('code', { class: 'cp-title' });
    const scope = h('span', { class: 'cp-scope' });
    const closeBtn = h('button', { class: 'mini icon-only', attrs: { type: 'button', 'aria-label': 'Close the colour picker' }, title: 'Close (Esc)', on: { click: () => this.close() } }, icon('close'));
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
    const palette = h('div', { class: 'cp-palette' });
    const status = h('p', { class: 'cp-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const newName = h('input', { class: 'text', attrs: { type: 'text', placeholder: 'such as fire.blue', 'aria-label': 'New colour name', spellcheck: 'false', autocomplete: 'off' } }) as HTMLInputElement;
    const newShared = h('input', { attrs: { type: 'radio', name: 'cp-new-kind', checked: '' } }) as HTMLInputElement;
    const newEach = h('input', { attrs: { type: 'radio', name: 'cp-new-kind' } }) as HTMLInputElement;
    const newError = h('p', { class: 'cp-error', attrs: { role: 'alert' } });
    const add = h('button', { class: 'tb primary', attrs: { type: 'button' }, text: 'Add colour', on: { click: () => this.addColour() } });
    const extra = h('div', { class: 'cp-extra' });
    void newShared;

    const el = h('div', { class: 'cpick', attrs: { popover: 'auto', role: 'dialog', 'aria-label': 'Colour' } },
      h('div', { class: 'cp-head' }, chip, h('div', { class: 'cp-name' }, title, scope), closeBtn),
      note, factions, canvas,
      h('div', { class: 'cp-hexrow' }, hex, copy, slidersBtn), sliders,
      h('div', { class: 'cp-label', text: 'Darker' }), shadesRow,
      h('div', { class: 'cp-label', text: 'Lighter' }), tintsRow,
      h('div', { class: 'cp-label cp-label-row' }, h('span', { text: 'Goes with it' }), harmonySel), harmonyRow,
      derived,
      h('div', { class: 'cp-actions' }, main, revert),
      source, status,
      h('details', { class: 'cp-section', attrs: { open: '' } }, h('summary', { text: 'Palette' }), palette),
      h('details', { class: 'cp-section cp-new' }, h('summary', { text: 'New colour' }),
        h('p', { class: 'hint', text: 'A new colour role, starting as the colour above. Effects name it; a role cannot be renamed or removed later.' }),
        newName,
        h('label', { class: 'check' }, newShared, h('span', { text: 'One colour for every faction' })),
        h('label', { class: 'check' }, newEach, h('span', { text: 'One colour per faction (like team)' })),
        newError, add),
      extra);
    this.parts = { chip, title, scope, note, source, factions, canvas, hex, slidersBtn, sliders, hue, sat, val, r, g, b, shades: shadesRow, tints: tintsRow,
      harmony: harmonyRow, harmonySel, derived, main, revert, palette, status, newName, newEach, newError, extra };

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
        this.useHex(rgbToHex(c));
      });
    }
    harmonySel.addEventListener('change', () => { this.harmonyKind = harmonySel.value as Harmony; this.drawAll(this.currentHex()!); });
    newName.addEventListener('input', () => { this.parts.newError.textContent = this.nameProblem(newName.value.trim()) ?? ''; });
    newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addColour(); } });
    window.addEventListener('resize', () => { if (this.isOpen) this.place(); });
    // When a section opens or closes, keep the whole picker inside the window.
    new ResizeObserver(() => { if (this.isOpen) this.place(); }).observe(el);
    // Revert goes back to the colours as they were when the picker opened this time.
    el.addEventListener('toggle', (e) => { if ((e as ToggleEvent).newState === 'closed') { this.openedWith.clear(); this.dragging = null; } });
    return el;
  }

  // ---------------------------------------------------------------- showing

  private currentHex(): string | undefined {
    return resolveRole(this.app.palette, this.role, this.faction);
  }

  private drawAll(hex: string): void {
    const p = this.parts, pal = this.app.palette;
    const faction = isFactionRole(pal, this.role);
    const entry = roleEntry(pal, this.role, this.faction);
    p.chip.style.background = hex;
    p.title.textContent = this.role;
    p.scope.textContent = faction ? `Changes with the faction: this is the ${pal.factions[this.faction].name} colour` : 'One colour for every faction';
    p.note.textContent = entry?.note ?? '';
    p.note.hidden = !entry?.note;
    p.source.textContent = entry ? SOURCE[entry.from] ?? '' : '';
    // The faction switch, for colours that change with the faction.
    p.factions.hidden = !faction;
    if (faction) {
      p.factions.replaceChildren(...FACTION_IDS.map((f) => {
        const v = resolveRole(pal, this.role, f)!;
        return h('button', { class: 'cp-faction', attrs: { type: 'button', 'aria-pressed': String(f === this.faction), 'aria-label': `${pal.factions[f].name}: ${v}` },
          title: `Change the ${pal.factions[f].name} colour (the preview switches to ${pal.factions[f].name})`,
          on: { click: () => { this.app.setFaction(f); this.show(this.role, f); } } },
        icon(`faction-${f}`), h('span', { text: pal.factions[f].name }), h('span', { class: 'cp-dot', style: `background:${v}` }));
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
      p.derived.replaceChildren(h('span', { text: isDerived ? `Worked out from ${d.from}: ${d.text}.` : `Usually worked out from ${d.from} (${d.text}); now set by hand.` }),
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
        title: `${r} ${v}${main ? " · this effect's main colour" : ''}`, on: { click: () => this.show(r) } });
    };
    this.parts.palette.replaceChildren(
      h('div', { class: 'cp-label', text: `Team colours (${pal.factions[this.faction].name})` }), h('div', { class: 'cp-pgrid' }, ...team.map(chip)),
      h('div', { class: 'cp-label', text: 'Shared colours' }), h('div', { class: 'cp-pgrid' }, ...shared.map(chip)));
  }

  /** Put the picker next to the swatch, left of the right panel, inside the window. */
  private place(): void {
    const a = this.anchor?.getBoundingClientRect();
    if (!a) return;
    const panel = this.anchor!.closest('.right')?.getBoundingClientRect();
    const w = this.el.offsetWidth, hh = this.el.offsetHeight;
    let left = (panel ? panel.left : a.left) - w - 10;
    if (left < 8) left = Math.min(window.innerWidth - w - 8, a.left);
    const top = Math.max(8, Math.min(window.innerHeight - hh - 8, a.top - 120));
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
    const [h0, s, v] = this.hsv;
    const bH = s * v, bW = (1 - s) * v, bK = 1 - v;
    void h0;
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

  /** A finished colour (typed, or a swatch): one undo step. */
  private useHex(hex: string): void {
    this.app.setColour(this.role, hex, { faction: this.faction });
    this.app.commit();
    this.refresh();
  }

  private typedHex(): void {
    const v = parseHexInput(this.parts.hex.value);
    if (!v) { this.say('That is not a colour: use #RRGGBB, such as #F47A1C.'); this.parts.hex.value = this.currentHex() ?? ''; return; }
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
    if (problem) { this.parts.newError.textContent = problem; return; }
    const err = this.app.addColour(name, this.parts.newEach.checked, this.currentHex() ?? '#FFFFFF');
    if (err) { this.parts.newError.textContent = err; return; }
    this.parts.newName.value = '';
    this.parts.newError.textContent = '';
    this.say(`Added ${name}. Effects can use it now; Save keeps it in the project's palette.json.`);
    this.show(name);
  }

  private say(text: string): void {
    this.parts.status.textContent = text;
  }
}
