/**
 * The viewport toolbar (docs/ui-redesign.md 6.3): one 36 px row over the preview. Fire; chips for the scene, the faction
 * that fired, who made it, the distance from you and the tier; on the right, Fade other layers and the View chip with the
 * scale. A chip shows its value and opens a menu of the choices, with a header naming the setting. Distance opens a small
 * popover instead (the slider, a number you can type, the hint about word sizes), or is dragged sideways on the chip.
 * In a narrow window the row wraps onto a second one, the controls in the same order.
 *
 * The app keeps the values: the toolbar shows them (the set functions) and says what was chosen (the actions).
 */
import { FACTION_IDS, TIER_NAMES } from '@shamble/vfx-format';
import type { FactionId, Palette, TierName } from '@shamble/vfx-format';
import type { Relation } from '@shamble/vfx-runtime';
import { SCENES } from '../preview/Preview';
import type { ViewMode } from '../preview/Preview';
import { chip, fitValue, h, icon, iconButton, menu, placeBelow, scrubDrag, scrubNumber, tip } from './dom';
import type { ChipView, IconName } from './dom';

export type CloseOn = 'origin' | 'target';

/** What the toolbar asks the app to do. */
export interface ToolbarActions {
  fire(): void;
  scene(id: string): void;
  faction(f: FactionId): void;
  relation(r: Relation): void;
  /** The distance from you, while it is dragged or typed (0 to 14 m). */
  distance(m: number): void;
  tier(t: TierName): void;
  view(v: ViewMode): void;
  closeOn(c: CloseOn): void;
  fade(on: boolean): void;
}

export interface ToolbarState {
  scene: string; faction: FactionId; relation: Relation; distance: number; tier: TierName; view: ViewMode; closeOn: CloseOn; fade: boolean;
}

export interface ToolbarView {
  el: HTMLElement;
  /** Fade other layers, the icon toggle left of View. */
  fadeButton: HTMLButtonElement;
  setScene(id: string): void;
  setFaction(f: FactionId): void;
  setRelation(r: Relation): void;
  setDistance(m: number): void;
  setTier(t: TierName): void;
  setView(v: ViewMode): void;
  setCloseOn(c: CloseOn): void;
  /** The scale the preview shows the game screen at (1 = game size), shown muted in the View chip. */
  setScale(k: number): void;
  /** A menu of the toolbar or the Distance popover is open: the editor's keys wait (the open one gets them). */
  popupOpen(): boolean;
}

/** The distance's limits and step: the slider's, as before (0 to 14 m in 0.1 m). */
export const DISTANCE = { min: 0, max: 14, step: 0.1, digits: 1 } as const;

const TIER_LABEL: Record<TierName, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const RELATIONS: { value: Relation; label: string; icon: IconName; changes: string; help: string }[] = [
  // What each changes, from the runtime (core/draw.ts edgeLook, core/words.ts): edges set to auto or enemy are solid ink for
  // an enemy's effect and broken lines for your team's and yours; a word seen only by the shooter shows when you made it.
  { value: 'enemy', label: 'Enemy', icon: 'enemy', changes: 'solid ink edges', help: 'Made by an enemy' },
  { value: 'team', label: 'Your team', icon: 'team', changes: 'thin broken edges', help: 'Made by your team' },
  { value: 'self', label: 'You', icon: 'self', changes: 'thin broken edges, your own words show', help: 'Made by you' },
];
const VIEWS: { value: Exclude<ViewMode, 'frame'>; label: string; icon: IconName; key: string }[] = [
  { value: 'whole', label: 'Whole screen', icon: 'view-whole', key: '1' },
  { value: 'game', label: 'Game size', icon: 'view-game', key: '2' },
  { value: 'close', label: 'Close-up', icon: 'view-close', key: '3' },
];
const CLOSE_ON: { value: CloseOn; label: string; icon: IconName; help: string }[] = [
  { value: 'origin', label: 'Muzzle', icon: 'muzzle', help: 'Close-up on the muzzle' },
  { value: 'target', label: 'Target', icon: 'target', help: 'Close-up on the target' },
];
const sceneName = (id: string) => SCENES.find((s) => s.id === id)?.name ?? id;
const distanceText = (m: number) => `${m.toFixed(DISTANCE.digits)} m`;

export function buildToolbar(o: { factions: Palette['factions']; state: ToolbarState; act: ToolbarActions }): ToolbarView {
  const s = { ...o.state };
  const act = o.act;
  const section = 'Preview bar';
  const teamHex = (f: FactionId) => o.factions[f].roles.team?.hex ?? 'transparent';
  /** A faction's marking; filled with its team colour (a colour from the palette: the brief's one exception to tokens). */
  const marking = (f: FactionId, filled: boolean) => {
    const svg = icon(`faction-${f}`);
    if (filled) { svg.classList.add('team-filled'); svg.style.setProperty('--team', teamHex(f)); }
    return svg;
  };

  // ------------------------------------------------ Fire: the one accent-filled control in the main window
  const fire = h('button', { class: 'fire', attrs: { type: 'button', 'data-tip': 'Fire from the stand-in to the target, as the game does', 'data-tip-key': 'F' }, on: { click: () => act.fire() } },
    icon('fire'), 'Fire');

  // ------------------------------------------------ the chips and their menus
  const sceneChip = chip({ label: 'Scene', icon: 'scene', value: sceneName(s.scene), className: 'scene-chip' });
  menu({ opener: sceneChip.el, id: 'scene-menu', label: 'Scene', title: 'Scene', helpSection: section,
    // Each effect's scene is kept in project.json when the project is saved (App.ts, writeEffects).
    footer: 'Each effect remembers its scene.',
    items: SCENES.map((x) => ({ label: x.name, chosen: () => s.scene === x.id, action: () => act.scene(x.id) })) });

  const factionChip = chip({ label: 'Faction that fired', icon: marking(s.faction, true), value: o.factions[s.faction].name, className: 'faction-chip' });
  menu({ opener: factionChip.el, id: 'faction-menu', label: 'Faction that fired', title: 'Faction that fired', helpSection: section,
    items: FACTION_IDS.map((f) => ({
      label: o.factions[f].name, icon: () => marking(f, false), chosen: () => s.faction === f, action: () => act.faction(f),
      description: () => h('span', { class: 'team-dot', style: `--team:${teamHex(f)}`, attrs: { 'aria-hidden': 'true' } }),
    })) });

  const relationOf = (r: Relation) => RELATIONS.find((x) => x.value === r) ?? RELATIONS[0]!;
  const relationChip = chip({ label: 'Made by', icon: relationOf(s.relation).icon, value: relationOf(s.relation).label, className: 'relation-chip' });
  menu({ opener: relationChip.el, id: 'relation-menu', label: 'Made by', title: 'Made by', helpSection: section,
    items: RELATIONS.map((x) => ({ label: x.label, icon: x.icon, description: x.changes, helpLabel: x.help, chosen: () => s.relation === x.value, action: () => act.relation(x.value) })) });

  // Distance: a chip that opens a small popover, or is dragged sideways (0.1 m for 4 px, Shift: ten times that).
  const distanceChip = chip({ label: 'Distance from you', icon: 'distance', value: distanceText(s.distance), className: 'distance-chip' });
  const range = h('input', { attrs: { type: 'range', min: String(DISTANCE.min), max: String(DISTANCE.max), step: String(DISTANCE.step), 'aria-label': 'Distance from you' } });
  const fit = (m: number) => fitValue(m, DISTANCE);
  /** A distance chosen here: shown everywhere at once, then told to the app. */
  const choose = (m: number) => { const v = fit(m); if (v === s.distance) return; showDistance(v); act.distance(v); };
  const number = scrubNumber({ label: 'Distance from you, in metres', value: s.distance, step: DISTANCE.step, digits: DISTANCE.digits, min: DISTANCE.min, max: DISTANCE.max, unit: 'm',
    onInput: (v) => choose(v) });
  range.addEventListener('input', () => choose(+range.value));
  const popTitle = h('div', { class: 'pop-title', attrs: { 'aria-hidden': 'true', 'data-help-label': 'Distance from you' }, text: 'Distance from you' });
  // Dragging the popover's title changes the number too, as a field's label does.
  number.dragFrom(popTitle);
  const pop = h('div', { class: 'popover distance-pop', attrs: { id: 'distance-popover', popover: 'auto', role: 'dialog', 'aria-label': 'Distance from you', 'data-help-section': section } },
    popTitle,
    h('div', { class: 'pop-row' }, range, number.el),
    h('p', { class: 'hint', text: 'Comic words shrink with it, each by its own curve.' }));
  document.body.append(pop);
  distanceChip.el.popoverTargetElement = pop;
  distanceChip.el.setAttribute('aria-haspopup', 'dialog');
  distanceChip.el.setAttribute('aria-expanded', 'false');
  distanceChip.el.setAttribute('aria-controls', pop.id);
  scrubDrag(distanceChip.el, { step: DISTANCE.step, pxPerStep: 4, get: () => s.distance, set: (v) => choose(v) });
  // Open: the focus on the slider, whose arrow keys step 0.1 m as before (as soon as it shows: the toggle event waits for the
  // next frame). Closed with the focus in it: back on the chip.
  const focusIn = () => { if (pop.matches(':popover-open') && !pop.contains(document.activeElement)) range.focus({ preventScroll: true }); };
  pop.addEventListener('beforetoggle', (e) => {
    const opening = (e as ToggleEvent).newState === 'open';
    distanceChip.el.setAttribute('aria-expanded', String(opening));
    if (opening) { placeBelow(pop, distanceChip.el); setTimeout(focusIn); }
  });
  pop.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState === 'open') focusIn();
    else if (pop.contains(document.activeElement)) distanceChip.el.focus({ preventScroll: true });
  });
  const closePop = () => { distanceChip.el.focus({ preventScroll: true }); if (pop.matches(':popover-open')) pop.hidePopover(); };
  pop.addEventListener('keydown', (e) => {
    // Esc, and Tab past its last control (or Shift+Tab before its first), close it and give the focus back to the chip.
    const edge = e.key === 'Tab' && (e.shiftKey ? document.activeElement === range : document.activeElement === number.input);
    if (e.key === 'Escape' || edge) { e.preventDefault(); e.stopPropagation(); closePop(); }
  });

  const tierChip = chip({ label: 'Tier', icon: `tier-${s.tier}`, value: TIER_LABEL[s.tier], className: 'tier-chip' });
  menu({ opener: tierChip.el, id: 'tier-menu', label: 'Tier', title: 'Tier', helpSection: section,
    // The preview's tier: only the layers in it draw (a projectile has no tiers: it is the path its riders follow).
    items: TIER_NAMES.map((t) => ({ label: TIER_LABEL[t], icon: `tier-${t}` as const, description: 'draws only the layers in this tier', chosen: () => s.tier === t, action: () => act.tier(t) })) });

  // ------------------------------------------------ on the right: Fade other layers, then View with the scale
  const fadeButton = iconButton({ icon: 'gradient', label: 'Fade other layers', className: 'tb fade-toggle', pressed: s.fade, onClick: () => act.fade(fadeButton.getAttribute('aria-pressed') !== 'true') });
  const scale = h('span', { class: 'scale-text' });
  const viewOf = (v: ViewMode) => VIEWS.find((x) => x.value === v) ?? VIEWS[0]!;
  const viewChip = chip({ label: 'View', icon: viewOf(s.view).icon, value: viewOf(s.view).label, className: 'view-chip', extra: scale });
  menu({ opener: viewChip.el, id: 'view-menu', label: 'View', title: 'View', helpSection: section, rowKeys: true, items: [
    ...VIEWS.map((x) => ({ label: x.label, icon: x.icon, shortcut: x.key, ariaKeys: x.key, chosen: () => s.view === x.value, action: () => act.view(x.value) })),
    { heading: 'Close-up on' },
    ...CLOSE_ON.map((x) => ({ label: x.label, icon: x.icon, helpLabel: x.help, chosen: () => s.closeOn === x.value, action: () => act.closeOn(x.value) })),
  ] });

  // Fade other layers and View stay side by side: in a window too narrow for one row they wrap together.
  const end = h('div', { class: 'vbar-end' }, fadeButton, viewChip.el);
  const el = h('div', { class: 'vbar', attrs: { 'data-help-section': section } },
    fire, sceneChip.el, factionChip.el, relationChip.el, distanceChip.el, tierChip.el, end);

  const showDistance = (m: number) => {
    s.distance = m;
    distanceChip.set(distanceText(m));
    range.value = String(Math.min(DISTANCE.max, Math.max(DISTANCE.min, m)));
    number.set(m);
  };
  const set = <K extends keyof ToolbarState>(k: K, v: ToolbarState[K], c: ChipView, value: string, glyph?: IconName | Element) => { s[k] = v; c.set(value, glyph); };
  return {
    el, fadeButton,
    setScene: (id) => set('scene', id, sceneChip, sceneName(id)),
    setFaction: (f) => set('faction', f, factionChip, o.factions[f].name, marking(f, true)),
    setRelation: (r) => set('relation', r, relationChip, relationOf(r).label, relationOf(r).icon),
    setDistance: (m) => showDistance(m),
    setTier: (t) => set('tier', t, tierChip, TIER_LABEL[t], `tier-${t}`),
    setView: (v) => set('view', v, viewChip, viewOf(v).label, viewOf(v).icon),
    setCloseOn: (c) => { s.closeOn = c; },
    setScale: (k) => {
      const pct = `${Math.round(k * 100)} %`;
      if (scale.textContent === pct) return;
      scale.textContent = pct;
      tip(scale, `The preview shows the game screen at ${pct} of its size.`);
    },
    popupOpen: () => !!document.querySelector('.menu:popover-open, .popover:popover-open'),
  };
}
