/**
 * The editor's icons, drawn in code on a 24 px grid: 1.75 px lines with round ends and joins, a few filled shapes,
 * and the three faction markings from sheet 16 (the Soviet star with inner corners at 0.42, the Allied chevron with
 * six corners, twice as wide as high, the Empire's flower of five round petals with an open centre of 0.27).
 */

type Shape = { d: string; fill?: boolean; cls?: string } | { circle: [number, number, number]; fill?: boolean; cls?: string };

const star = (cx: number, cy: number, R: number, inner: number, points = 5): string => {
  const out: string[] = [];
  for (let k = 0; k < points * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / points, r = k % 2 ? R * inner : R;
    out.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${out.join('L')}Z`;
};

/** Five round petals (radius half the flower's), as one outline, and the open centre. */
const flower = (cx: number, cy: number, R: number, centre: number): string => {
  const rp = R / 2, ri = R * 0.809;
  const at = (deg: number, r: number) => { const a = (deg * Math.PI) / 180; return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`; };
  let d = `M${at(-126, ri)}`;
  for (let k = 0; k < 5; k++) d += `A${rp} ${rp} 0 1 1 ${at(-126 + 72 * (k + 1), ri)}`;
  const c = R * centre;
  return `${d}ZM${cx + c} ${cy}A${c} ${c} 0 1 0 ${cx - c} ${cy}A${c} ${c} 0 1 0 ${cx + c} ${cy}Z`;
};

/** The chevron: six corners, twice as wide as high, the inner edges parallel to the outer ones. */
const chevron = (cx: number, cy: number, w: number): string => {
  const s = w / 2, p = (x: number, y: number) => `${(cx + x * s).toFixed(2)} ${(cy + y * s).toFixed(2)}`;
  return `M${p(-1, 0.5)}L${p(0, -0.5)}L${p(1, 0.5)}L${p(0.45, 0.5)}L${p(0, 0.05)}L${p(-0.45, 0.5)}Z`;
};

const ICONS = {
  play: [{ d: 'M8 5.6v12.8a.8.8 0 0 0 1.2.7l10.3-6.4a.8.8 0 0 0 0-1.4L9.2 4.9A.8.8 0 0 0 8 5.6z', fill: true }],
  pause: [{ d: 'M7 5.5h3v13H7zM14 5.5h3v13h-3z', fill: true }],
  'step-back': [{ d: 'M6.5 6v12' }, { d: 'M18 6.6v10.8a.6.6 0 0 1-.9.5L9.4 12.5a.6.6 0 0 1 0-1l7.7-5.4a.6.6 0 0 1 .9.5z', fill: true }],
  'step-fwd': [{ d: 'M17.5 6v12' }, { d: 'M6 6.6v10.8a.6.6 0 0 0 .9.5l7.7-5.4a.6.6 0 0 0 0-1L6.9 6.1a.6.6 0 0 0-.9.5z', fill: true }],
  loop: [{ d: 'M17 2.8l3 3-3 3M4 11.5v-1.2a4.5 4.5 0 0 1 4.5-4.5H20M7 21.2l-3-3 3-3M20 12.5v1.2a4.5 4.5 0 0 1-4.5 4.5H4' }],
  undo: [{ d: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11' }],
  redo: [{ d: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13' }],
  fire: [{ d: 'M12 2.5l1.9 4.6 4.6-1.8-1.5 4.7 4.5 2-4.5 2 1.5 4.7-4.6-1.8-1.9 4.6-1.9-4.6-4.6 1.8 1.5-4.7-4.5-2 4.5-2-1.5-4.7 4.6 1.8z', fill: true }],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  close: [{ d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
  'chevron-down': [{ d: 'M6 9.5l6 6 6-6' }],
  trash: [{ d: 'M4 7h16M10 3.5h4M6 7l1 12.6a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9L18 7M10 11v6M14 11v6' }],
  copy: [{ d: 'M9 9.6A1.6 1.6 0 0 1 10.6 8h8A1.6 1.6 0 0 1 20.2 9.6v8.8a1.6 1.6 0 0 1-1.6 1.6h-8A1.6 1.6 0 0 1 9 18.4z' }, { d: 'M15.4 5.5v-.4a1.6 1.6 0 0 0-1.6-1.6h-8A1.6 1.6 0 0 0 4.2 5.1v8.8a1.6 1.6 0 0 0 1.6 1.6H6' }],
  up: [{ d: 'M12 19V5.5M6.5 11L12 5.5 17.5 11' }],
  down: [{ d: 'M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5' }],
  sprite: [{ d: 'M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z' }, { d: 'M4 16l4.5-4.5 4 4 3-3 4.5 4.5' }, { circle: [15.5, 8.5, 1.6] }],
  projectile: [{ d: 'M4 19.5c1.8-7.2 6.8-11.8 14-12.8' }, { d: 'M14.6 4.2l3.6 2.4-2.6 3.5' }, { circle: [4, 19.5, 1.2], fill: true }],
  shape: [{ d: star(12, 12.6, 9, 0.42) }],
  burst: [{ circle: [12, 12, 2.3] }, { d: 'M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9L18 18M6 18l2.1-2.1M15.9 8.1L18 6' }],
  word: [{ d: 'M4.6 5h14.8A1.6 1.6 0 0 1 21 6.6v8.3a1.6 1.6 0 0 1-1.6 1.6H10.2l-4.4 3.4v-3.4H4.6A1.6 1.6 0 0 1 3 14.9V6.6A1.6 1.6 0 0 1 4.6 5z' }, { d: 'M7.5 9.2h9M7.5 12.3h5.5' }],
  projects: [{ d: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z' }],
  save: [{ d: 'M5.2 4h11.4L20 7.4v11.4a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 18.8V5.2A1.2 1.2 0 0 1 5.2 4z' }, { d: 'M8 4v4.5h7V4M7.5 20v-6h9v6' }],
  'save-as': [{ d: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z' }, { d: 'M12 11.2v5.2M9.4 13.8h5.2' }],
  export: [{ d: 'M12 14.5V3.5M8 7.5l4-4 4 4' }, { d: 'M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5' }],
  import: [{ d: 'M12 3.5v11M8 10.5l4 4 4-4' }, { d: 'M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5' }],
  keys: [{ d: 'M3.6 6.5h16.8a1.1 1.1 0 0 1 1.1 1.1v8.8a1.1 1.1 0 0 1-1.1 1.1H3.6a1.1 1.1 0 0 1-1.1-1.1V7.6a1.1 1.1 0 0 1 1.1-1.1z' }, { d: 'M6.5 10h.5M10 10h.5M13.5 10h.5M17 10h.5M8 14h8' }],
  moon: [{ d: 'M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z' }],
  sun: [{ circle: [12, 12, 4] }, { d: 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4' }],
  scene: [{ d: 'M3.5 6.6l5-2.1 7 2.5 5-2.1v13l-5 2.1-7-2.5-5 2.1z' }, { d: 'M8.5 4.5v13M15.5 7v13' }],
  target: [{ circle: [12, 12, 7] }, { circle: [12, 12, 1.6], fill: true }, { d: 'M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4' }],
  muzzle: [{ d: 'M2.5 12h10.5' }, { d: 'M16 12l4.5-3.5M16 12h5.5M16 12l4.5 3.5' }, { d: 'M2.5 9.5v5' }],
  enemy: [{ circle: [12, 12, 6.5] }, { d: 'M12 3v4.2M12 16.8V21M3 12h4.2M16.8 12H21' }],
  team: [{ circle: [9, 8.5, 3] }, { d: 'M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5' }, { d: 'M15.5 5.9a3 3 0 0 1 0 5.6M17.5 14.6c1.8.6 3 2.4 3 4.9' }],
  self: [{ circle: [12, 8, 3.6] }, { d: 'M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6' }],
  distance: [{ d: 'M3.4 15.6L15.6 3.4l5 5L8.4 20.6z' }, { d: 'M7 12l1.6 1.6M10 9l2 2M13 6l1.6 1.6' }],
  'tier-low': [{ d: 'M5 15.5h3.2v5H5z', fill: true }, { d: 'M10.4 11h3.2v9.5h-3.2zM15.8 6h3.2v14.5h-3.2z' }],
  'tier-medium': [{ d: 'M5 15.5h3.2v5H5zM10.4 11h3.2v9.5h-3.2z', fill: true }, { d: 'M15.8 6h3.2v14.5h-3.2z' }],
  'tier-high': [{ d: 'M5 15.5h3.2v5H5zM10.4 11h3.2v9.5h-3.2zM15.8 6h3.2v14.5h-3.2z', fill: true }],
  'view-whole': [{ d: 'M3.6 4.5h16.8a1.1 1.1 0 0 1 1.1 1.1v10.3a1.1 1.1 0 0 1-1.1 1.1H3.6a1.1 1.1 0 0 1-1.1-1.1V5.6a1.1 1.1 0 0 1 1.1-1.1z' }, { d: 'M8.5 20.5h7M12 17v3.5' }],
  'view-game': [{ d: 'M4 8.5V5.2A1.2 1.2 0 0 1 5.2 4h3.3M15.5 4h3.3A1.2 1.2 0 0 1 20 5.2v3.3M20 15.5v3.3a1.2 1.2 0 0 1-1.2 1.2h-3.3M8.5 20H5.2A1.2 1.2 0 0 1 4 18.8v-3.3' }, { circle: [12, 12, 1.6], fill: true }],
  'view-close': [{ circle: [10.5, 10.5, 6.5] }, { d: 'M15.4 15.4l5.1 5.1M10.5 8v5M8 10.5h5' }],
  gauge: [{ d: 'M3.8 17.5a8.2 8.2 0 1 1 16.4 0' }, { d: 'M12 17.5l4.2-5.2' }, { circle: [12, 17.5, 1.3], fill: true }],
  sliders: [{ d: 'M4 7h9M17.5 7H20M4 17h2.5M11 17h9' }, { circle: [15.2, 7, 2.2] }, { circle: [8.8, 17, 2.2] }],
  palette: [{ d: 'M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 2-2 0-1.6-1.3-2-1.3-3.3 0-1 .8-1.7 1.8-1.7h2.2a3.8 3.8 0 0 0 3.8-3.8C20.5 6.2 16.7 3.5 12 3.5z' }, { circle: [7.6, 11.4, 1.2], fill: true }, { circle: [9.6, 7.3, 1.2], fill: true }, { circle: [14.4, 7.3, 1.2], fill: true }],
  gradient: [{ d: 'M5.2 4h13.6A1.2 1.2 0 0 1 20 5.2v13.6a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 18.8V5.2A1.2 1.2 0 0 1 5.2 4z' }, { d: 'M4 14.5L14.5 4M4 19.5L19.5 4M9.5 20L20 9.5M15 20l5-5' }],
  preset: [{ d: 'M11 3.5l1.8 4.7 4.7 1.8-4.7 1.8L11 16.5l-1.8-4.7L4.5 10l4.7-1.8z' }, { d: 'M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' }],
  info: [{ circle: [12, 12, 8.5] }, { d: 'M12 11v5.2M12 7.9v.1' }],
  'faction-soviets': [{ d: star(12, 12.8, 9.5, 0.42), cls: 'insignia' }],
  'faction-allies': [{ d: chevron(12, 12, 19), cls: 'insignia' }],
  'faction-empire': [{ d: flower(12, 12, 9.6, 0.27), cls: 'insignia' }],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

const NS = 'http://www.w3.org/2000/svg';

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const s of ICONS[name] as Shape[]) {
    const el = 'circle' in s ? document.createElementNS(NS, 'circle') : document.createElementNS(NS, 'path');
    if ('circle' in s) { el.setAttribute('cx', String(s.circle[0])); el.setAttribute('cy', String(s.circle[1])); el.setAttribute('r', String(s.circle[2])); }
    else el.setAttribute('d', s.d);
    if (s.fill) { el.setAttribute('fill', 'currentColor'); el.setAttribute('stroke', 'none'); }
    if (s.cls) el.setAttribute('class', s.cls);
    svg.append(el);
  }
  return svg;
}
