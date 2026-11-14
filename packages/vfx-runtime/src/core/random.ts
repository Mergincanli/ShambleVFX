/**
 * Random numbers from the seed, with no hidden state: the same (seed, a, b, c) always gives the same number,
 * whatever was asked before. That is what lets the runtime draw any moment directly, in any order.
 */

/** A well-mixed 32-bit hash of four 32-bit integers (murmur3-style finaliser). */
export function hash32(seed: number, a = 0, b = 0, c = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = mix(h ^ Math.imul(a | 0, 0x85ebca6b));
  h = mix(h ^ Math.imul(b | 0, 0xc2b2ae35));
  h = mix(h ^ Math.imul(c | 0, 0x27d4eb2f));
  return h >>> 0;
}

function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number in [0, 1) from the seed and up to three integers (say: layer, piece, channel). */
export function random01(seed: number, a = 0, b = 0, c = 0): number {
  return hash32(seed, a, b, c) / 4294967296;
}

/** A stable number for a text (a layer id), so a layer keeps its random numbers when layers are reordered. */
export function hashText(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
