/**
 * The editor's icons, drawn in code on a 24 px grid: 1.75 px lines with round ends and joins, a few filled shapes,
 * and the three faction markings from sheet 16 (the Soviet star with inner corners at 0.42, the Allied chevron with
 * six corners, twice as wide as high, the Empire's flower of five round petals with an open centre of 0.27).
 * Every kind of layer has its own icon (layer-icons.ts picks it): a shape by its kind, a burst by the look of its
 * pieces, drawn from the runtime's own outlines (the muzzle flash, the smoke puff, the chip, the shard).
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

/** Round dots [x, y, r] as one path, each drawn the same way round, so where two overlap they stay filled. */
const discs = (dots: [number, number, number][]): string => dots.map(([x, y, r]) => {
  const n = (v: number) => +v.toFixed(2);
  return `M${n(x - r)} ${y}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0`;
}).join('');

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
  word: [{ d: 'M4.33 18.13L2.94 8.22L5.61 7.85L7.34 9.02L7.73 11.79L6.39 13.39L3.72 13.77M9.37 7.32L12.24 6.92L13.46 8.36L14.4 15.1L13.64 16.82L10.76 17.22L9.55 15.78L8.61 9.04L9.37 7.32M14.87 6.55L17.7 16.25L18.43 9.99L20.87 15.8L20.91 5.7' }],
  // One per kind of layer: shape-<kind> for a shape, burst-<look> for a burst (an image burst shows sprite).
  'shape-shards': [{ d: 'M10.28 2.45L12.71 8.98L15.87 7.75L14.78 10.43L20.15 10.17L15.22 12.91L17.06 16.44L13.77 14.98L14.16 21.55L11.29 15.42L8.26 16.5L9.22 13.97L3.4 14.5L8.78 11.49L6.96 8.26L10.23 9.42Z' }],
  'shape-flash': [{ d: 'M21.5 12L12.05 10.11L12.43 5.2L7.51 8.98L2.98 5.57L4.11 12L2.98 18.43L7.51 15.02L12.43 18.8L12.05 13.89Z' }],
  'shape-cloud': [{ d: 'M10.65 5.7A3.82 3.82 0 0 1 17.92 7.98A2.24 2.24 0 0 1 19.79 12.03A3.63 3.63 0 0 1 16.1 18.18A2.95 2.95 0 0 1 10.28 19.03A3.75 3.75 0 0 1 4.5 14.26A2.3 2.3 0 0 1 4.85 9.68A3.53 3.53 0 0 1 10.65 5.7Z' }],
  'shape-smoke': [{ d: 'M7.67 18.45A3.35 3.35 0 1 1 7.86 11.94A3.78 3.78 0 1 1 15.31 11.4A3.56 3.56 0 1 1 14.35 18.44A5.4 5.4 0 0 1 7.67 18.45Z' }, { circle: [19.2, 5.6, 1.7] }, { circle: [21, 2.6, 0.9], fill: true }],
  'shape-ring': [{ d: 'M21.8 12.5A9.8 6.2 0 0 1 21.19 14.65M18.93 16.88A9.8 6.2 0 0 1 16.1 18.13M12 18.7A9.8 6.2 0 0 1 8.61 18.32M5.07 16.88A9.8 6.2 0 0 1 3.1 15.1M2.2 12.5A9.8 6.2 0 0 1 2.81 10.35M5.07 8.12A9.8 6.2 0 0 1 7.9 6.87M12 6.3A9.8 6.2 0 0 1 15.39 6.68M18.93 8.12A9.8 6.2 0 0 1 20.9 9.9' }],
  'shape-dots': [{ d: discs([[12, 12, 2.1], [17, 12, 1.35], [14.5, 16.33, 1.35], [9.5, 16.33, 1.35], [7, 12, 1.35], [9.5, 7.67, 1.35], [14.5, 7.67, 1.35], [19.5, 16.33, 1.15], [12, 20.66, 1.15], [4.5, 16.33, 1.15], [4.5, 7.67, 1.15], [12, 3.34, 1.15], [19.5, 7.67, 1.15]]), fill: true }],
  'shape-scorch': [{ d: 'M3.8 13.6A8.2 4.2 0 1 0 20.2 13.6A8.2 4.2 0 1 0 3.8 13.6Z', fill: true }, { d: discs([[4.6, 13.4, 2], [8.4, 10.4, 2.1], [15, 10.2, 2.3], [19.6, 13.4, 2], [15.6, 17, 1.9], [8.4, 17, 1.8], [21.6, 9.4, 1], [2.6, 17.8, 0.9]]), fill: true }],
  'shape-lines': [{ d: 'M16 12L21.8 12M17.34 15.88L19.6 17.53M14.24 15.32L17.48 20.12M11.65 18.59L11.51 21.39M10.37 15.65L8.01 20.95M6.17 15.1L3.7 16.41M8.02 11.65L2.24 11.15M6.12 9L3.62 7.73M10.25 8.4L7.7 3.19M11.42 5.43L11.18 2.64M14.12 8.61L17.19 3.69M17.6 8.5L19.97 7.02' }],
  'shape-glow': [{ circle: [12, 12, 4.4], fill: true }, { d: 'M20.35 14.06A8.6 8.6 0 0 1 19.36 16.45M16.45 19.36A8.6 8.6 0 0 1 14.06 20.35M9.94 20.35A8.6 8.6 0 0 1 7.55 19.36M4.64 16.45A8.6 8.6 0 0 1 3.65 14.06M3.65 9.94A8.6 8.6 0 0 1 4.64 7.55M7.55 4.64A8.6 8.6 0 0 1 9.94 3.65M14.06 3.65A8.6 8.6 0 0 1 16.45 4.64M19.36 7.55A8.6 8.6 0 0 1 20.35 9.94' }],
  'shape-trail': [{ d: 'M3.4 20.6C4.4 13.6 9 8.6 15.2 6.2L17 9.6C11.6 10.8 6.6 14.6 3.4 20.6Z', fill: true }, { circle: [17.6, 6.6, 2.7], fill: true }],
  'shape-band': [{ circle: [3.8, 12, 2.2], fill: true }, { d: 'M8.4 9.6H21M8.4 14.4H21' }],
  'shape-beads': [{ d: 'M2.5 12H19.5M16 8l4 4-4 4' }, { circle: [6, 12, 2.1], fill: true }, { circle: [11.6, 12, 2.1], fill: true }],
  'shape-flames': [{ d: 'M9.8 21.5C5.6 21.5 3.6 18.4 4.6 15C5.6 11.6 9.4 10.2 9.4 6.4C9.4 5 9 3.6 8.2 2.5C14.2 4 18.6 9 18.4 14.4C18.2 18.8 14.8 21.5 9.8 21.5Z' }, { d: 'M10.4 21.4C8.4 20.8 7.8 18.6 8.8 16.8C9.8 15 11.6 14 11.8 11.8C14.4 13.6 15.4 16.4 14.6 18.6C14 20.2 12.6 21.4 10.4 21.4' }],
  'shape-bed': [{ d: 'M12 7.6A3.58 3.58 0 0 1 18.17 8.96A2.44 2.44 0 0 1 21.45 12.39A2.04 2.04 0 0 1 20.31 16.3A3.04 3.04 0 0 1 15.28 18.85A3.79 3.79 0 0 1 8.72 18.85A3.04 3.04 0 0 1 3.69 16.3A2.04 2.04 0 0 1 2.55 12.39A2.44 2.44 0 0 1 5.83 8.96A3.58 3.58 0 0 1 12 7.6ZM14.4 11.15A1.78 1.78 0 0 1 16.8 13.4A1.78 1.78 0 0 1 14.4 15.65A3.17 3.17 0 0 1 9.6 15.65A1.78 1.78 0 0 1 7.2 13.4A1.78 1.78 0 0 1 9.6 11.15A3.17 3.17 0 0 1 14.4 11.15Z' }],
  'burst-diamond': [{ d: 'M8 9.45L10.31 14.4L8 19.35L5.69 14.4ZM16.6 3.3L18.14 6.6L16.6 9.9L15.06 6.6ZM18 15.2L19.12 17.6L18 20L16.88 17.6Z', fill: true }],
  'burst-chip': [{ d: 'M14.46 15.2L9.43 17.74L4.64 17.15L5.21 11.83L10.12 11.18Z' }, { d: 'M18 10.2L15.53 7.88L14.88 5.06L18 4.29L19.38 6.92ZM15.81 16.86L18.4 16.07L20.61 16.75L19.9 19.22L17.52 19.12Z', fill: true }],
  'burst-spark': [{ d: 'M7.53 3.05L9.87 5.77L10.07 9.35L7.73 6.63ZM21.19 9.3L17.62 11.88L13.21 11.9L16.78 9.32ZM16.4 20.82L14.1 18.35L13.8 14.98L16.1 17.45ZM2.1 15.24L5.51 12.81L9.7 12.76L6.29 15.19Z', fill: true }],
  'burst-dot': [{ d: discs([[8.4, 14.6, 3.4], [16.8, 7.4, 2.4], [18.2, 17.2, 1.7], [5.6, 6, 1.2]]), fill: true }],
  'burst-shard': [{ d: 'M3.42 11.61L13.23 13.02L8.52 19.34ZM20.19 4.73L16.93 10.8L13.92 6.22ZM19.27 20.73L15.82 16.88L19.82 15.93Z', fill: true }],
  'burst-speck': [{ d: discs([[5.6, 6.2, 1.4], [11.8, 4.6, 1.3], [18.4, 7.4, 1.5], [9.4, 11, 1.45], [15.6, 12.6, 1.35], [4.8, 15.2, 1.3], [11, 17.4, 1.5], [18.6, 17.8, 1.4], [7.6, 20.6, 1.3]]), fill: true }],
  'burst-puff': [{ d: discs([[8.8, 14.8, 4.1], [6.34, 15.62, 2.67], [11.26, 15.42, 2.87], [17.6, 7.4, 2.7], [15.98, 7.94, 1.76], [19.22, 7.81, 1.89]]), fill: true }],
  'burst-streak': [{ d: 'M4.99 20.59L11.39 14.19A1.4 1.4 0 0 0 9.41 12.21L3.01 18.61A1.4 1.4 0 0 0 4.99 20.59ZM10.24 22.12L18.24 16.12A1.4 1.4 0 0 0 16.56 13.88L8.56 19.88A1.4 1.4 0 0 0 10.24 22.12ZM11.59 10.59L17.59 4.59A1.4 1.4 0 0 0 15.61 2.61L9.61 8.61A1.4 1.4 0 0 0 11.59 10.59Z', fill: true }],
  'burst-spike': [{ d: 'M13.18 8.28L11.11 1.84L10.19 8.54ZM16.06 10.99L19.95 6.44L14.33 8.53ZM14.87 14.64L21.4 15.42L15.9 11.82ZM10.85 16.02L12.85 21.66L13.83 15.75ZM8.19 12.84L3.64 17.85L9.91 15.29ZM9.1 8.99L3.39 7.99L7.83 11.71Z', fill: true }],
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
  enemy: [{ d: 'M4 4h2.6L16 13.4M20 4h-2.6L8 13.4M12.6 17.6l5-5M6.4 12.6l5 5M16.3 16.3l3.2 3.2M7.7 16.3l-3.2 3.2' }],
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
  // The shell (UI phase 2): an example's lock, a problem's warning, the keyboard shortcuts' question mark.
  lock: [{ d: 'M7 10.5h10a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 17 20H7a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 7 10.5z' }, { d: 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.3v2.2' }],
  warning: [{ d: 'M10.3 4.4L3 17.3a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0z' }, { d: 'M12 9.6v4.2M12 17v.1' }],
  question: [{ circle: [12, 12, 8.5] }, { d: 'M9.5 9.7a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.2-2.5 3.8M12 16.9v.1' }],
  // UI phase 3: Show hints, a light bulb.
  hint: [{ d: 'M9.4 15.6A6.2 6.2 0 1 1 14.6 15.6c-.5.4-.8 1-.8 1.6v.4h-3.6v-.4c0-.6-.3-1.2-.8-1.6z' }, { d: 'M10.2 20.6h3.6' }],
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
