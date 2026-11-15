/**
 * Colour maths for the picker: hex, HSV (the wheel), and OKLab / OKLCH (Björn Ottosson's perceptual space), so shades,
 * tints, harmonies and ramps step evenly to the eye.
 */
export type RGB = [number, number, number];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(c: RGB): string {
  return '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** What a person typed, as #RRGGBB: "#abc", "abc", "#aabbcc" or "aabbcc". Null when it is not a colour. */
export function parseHexInput(s: string): string | null {
  const t = s.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) return ('#' + [...t].map((c) => c + c).join('')).toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(t)) return ('#' + t).toUpperCase();
  return null;
}

/** HSV: hue 0..360, saturation and value 0..1. */
export function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s, x = c * (1 - Math.abs((hh % 2) - 1)), m = v - c;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]: RGB): [number, number, number] {
  const R = toLinear(r / 255), G = toLinear(g / 255), B = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLab to linear sRGB, unclamped (so callers can tell whether it is inside the screen's colours). */
function oklabToLinear([L, a, b]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

export function oklabToRgb(lab: [number, number, number]): RGB {
  const [r, g, b] = oklabToLinear(lab);
  return [toSrgb(clamp(r)) * 255, toSrgb(clamp(g)) * 255, toSrgb(clamp(b)) * 255];
}

/** OKLCH: lightness 0..1, chroma 0..~0.37, hue 0..360. */
export function rgbToOklch(rgb: RGB): [number, number, number] {
  const [L, a, b] = rgbToOklab(rgb);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h];
}

/** A colour from OKLCH; chroma is lowered until it fits the screen's colours (hue and lightness kept). */
export function oklchToRgb(L: number, C: number, h: number): RGB {
  const rad = (h * Math.PI) / 180;
  const fits = (c: number) => oklabToLinear([L, c * Math.cos(rad), c * Math.sin(rad)]).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let c = Math.max(0, C);
  if (!fits(c)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    c = lo;
  }
  return oklabToRgb([clamp(L), c * Math.cos(rad), c * Math.sin(rad)]);
}

/** Eight darker steps of a colour, evenly to the eye. */
export function shades(hex: string, n = 8): string[] {
  const [L, C, h] = rgbToOklch(hexToRgb(hex));
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1);
    return rgbToHex(oklchToRgb(L + (0.16 - L) * t, C * (1 - 0.45 * t), h));
  });
}

/** Eight lighter steps of a colour, evenly to the eye. */
export function tints(hex: string, n = 8): string[] {
  const [L, C, h] = rgbToOklch(hexToRgb(hex));
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1);
    return rgbToHex(oklchToRgb(L + (0.98 - L) * t, C * (1 - 0.85 * t), h));
  });
}

export type Harmony = 'analogous' | 'complementary' | 'triad' | 'split' | 'tetrad' | 'mono';
export const HARMONIES: { value: Harmony; label: string }[] = [
  { value: 'analogous', label: 'Neighbours' },
  { value: 'complementary', label: 'Opposite' },
  { value: 'split', label: 'Split opposite' },
  { value: 'triad', label: 'Three apart' },
  { value: 'tetrad', label: 'Four apart' },
  { value: 'mono', label: 'One hue' },
];

/** Five colours that go with this one, by a classic colour scheme, worked out in OKLCH. */
export function harmony(hex: string, scheme: Harmony): string[] {
  const [L, C, h] = rgbToOklch(hexToRgb(hex));
  const c = Math.max(C, 0.06);
  const at = (dh: number, dl = 0, k = 1) => rgbToHex(oklchToRgb(clamp(L + dl, 0.12, 0.97), c * k, h + dh));
  switch (scheme) {
    case 'analogous': return [at(-40, 0.04), at(-20, 0.02), at(0), at(20, -0.02), at(40, -0.04)];
    case 'complementary': return [at(0, 0.12, 0.7), at(0), at(180, 0.1, 0.8), at(180), at(180, -0.14)];
    case 'split': return [at(0), at(150, 0.06), at(210, 0.06), at(150, -0.1), at(210, -0.1)];
    case 'triad': return [at(0), at(120), at(240), at(120, 0.14, 0.6), at(240, -0.14)];
    case 'tetrad': return [at(0), at(90), at(180), at(270), at(0, 0.15, 0.5)];
    case 'mono': return [at(0, -0.3, 0.8), at(0, -0.15, 0.9), at(0), at(0, 0.12, 0.7), at(0, 0.24, 0.45)];
  }
}

/** n colours from a to b, evenly to the eye (OKLCH, the short way round the hue circle). */
export function ramp(a: string, b: string, n: number): string[] {
  const A = rgbToOklch(hexToRgb(a)), B = rgbToOklch(hexToRgb(b));
  let dh = B[2] - A[2];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  // A grey has no hue: take the other end's.
  const hA = A[1] < 0.01 ? B[2] : A[2], hB = B[1] < 0.01 ? A[2] : A[2] + dh;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return rgbToHex(oklchToRgb(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, hA + (hB - hA) * t));
  });
}

/** WCAG contrast ratio between two colours (for text on a swatch). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => { const [r, g, b2] = hexToRgb(hex).map((v) => toLinear(v / 255)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!; };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
