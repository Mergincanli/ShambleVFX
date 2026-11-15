import { describe, expect, it } from 'vitest';
import paletteJson from '../../vfx-format/palette/palette.json';
import { newEffect, newWordLayer, parseHex, resolveRole, wordShares } from '@shamble/vfx-format';
import type { EffectFile, Palette, SoundWord, Vec3, WordLayer } from '@shamble/vfx-format';
import { BLEND_GROUPS, DrawSink, evaluate, hashText, pickWord, random01 } from '../src/index';
import { WORD_SPACE } from '../src/core/words';
import type { CameraBasis, EvalContext } from '../src/index';

const palette = paletteJson as Palette;

function gameCamera(): CameraBasis {
  const p = (35.3 * Math.PI) / 180, y = (45 * Math.PI) / 180;
  const back: Vec3 = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  const forward: Vec3 = [-back[0], -back[1], -back[2]];
  const right: Vec3 = [Math.cos(y), 0, -Math.sin(y)];
  const up: Vec3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  return { right, up, forward };
}

const ctx = (seed: number): EvalContext => ({
  seed, timeMs: 100, inputs: { origin: [0, 1.3, 0], target: [20, 0, 0] }, faction: 'soviets', palette, camera: gameCamera(),
  imageRect: () => ({ u0: 0, v0: 0, u1: 0.5, v1: 0.5 }), white: [0.9, 0.9],
});

const layer = (words: SoundWord[], over: Partial<WordLayer> = {}): WordLayer => ({ ...newWordLayer('word', 'Sound word'), words, ...over });

/** What one play draws: the letters (one item each) and the triangles. */
function drawn(l: WordLayer, seed: number): { letters: number; triangles: number } {
  const fx: EffectFile = { ...newEffect('w', 'W'), layers: [l] };
  const sink = new DrawSink(64);
  const r = evaluate(fx, ctx(seed), sink);
  return { letters: sink.items, triangles: r.triangles };
}

/** Version 4's word pick, written out as it was: the layer's seed mix, then one random number scaled to the list. */
function version4Pick(l: { id: string; seed: number; perPlay: boolean; words: unknown[] }, seed: number): number {
  const mix = ((l.perPlay ? seed : 0) ^ Math.imul(l.seed + 1, 0x9e3779b1) ^ hashText(l.id)) >>> 0;
  const n = l.words.length;
  return Math.min(n - 1, Math.floor(random01(mix, 1, 0) * n));
}

describe('the word a play shows', () => {
  it('is the word version 4 showed, for every seed, when no word has a chance (20,000 seeds, 1 to 16 words)', () => {
    const seeds = [...Array.from({ length: 20000 }, (_, i) => i), 0xffffffff, 0x80000000, 2 ** 31 - 1, 123456789];
    let compared = 0;
    for (let n = 1; n <= 16; n++) {
      const words = Array.from({ length: n }, (_, i) => ({ text: `W${i}` }));
      for (const over of [{}, { id: 'gun_word', seed: 41 }, { perPlay: false, seed: 9 }] as Partial<WordLayer>[]) {
        const l = layer(words, over);
        for (const seed of seeds) {
          if (pickWord(l, seed) !== version4Pick(l, seed)) throw new Error(`${n} words, ${JSON.stringify(over)}, seed ${seed}: ${pickWord(l, seed)} is not ${version4Pick(l, seed)}`);
          compared++;
        }
      }
    }
    expect(compared).toBe(16 * 3 * 20004);
  });

  it('draws the word version 4 drew, when no word has a chance', () => {
    const texts = ['A', 'BO', 'ZAP', 'BOOM', 'KABOOM'];
    const l = layer(texts.map((text) => ({ text })));
    for (let seed = 1; seed <= 300; seed++) expect(drawn(l, seed).letters, `seed ${seed}`).toBe(texts[version4Pick(l, seed)]!.length);
  });

  it('is what drawing shows, including the plays that show no word (2,000 seeds)', () => {
    // Words of different lengths, so the letters drawn tell which word it was. 70 % in all: 30 % of plays show no word.
    const words = [{ text: 'A', chance: 10 }, { text: 'BO', chance: 20 }, { text: 'ZAP', chance: 15 }, { text: 'BOOM', chance: 25 }];
    const l = layer(words);
    const seen = new Map<number, number>();
    for (let seed = 1; seed <= 2000; seed++) {
      const i = pickWord(l, seed);
      const d = drawn(l, seed);
      expect(d.letters, `seed ${seed}`).toBe(i < 0 ? 0 : words[i]!.text.length);
      if (i < 0) expect(d.triangles, `seed ${seed} shows no word, so it draws nothing`).toBe(0);
      else expect(d.triangles).toBeGreaterThan(0);
      seen.set(i, (seen.get(i) ?? 0) + 1);
    }
    // Every word and "no word" came up, about as often as their shares say.
    const shares = wordShares(words);
    for (const [i, share] of [...shares.words.map((s, k) => [k, s] as const), [-1, shares.none] as const]) {
      expect(Math.abs((seen.get(i) ?? 0) / 2000 - share), `word ${i}`).toBeLessThan(0.035);
    }
  });

  it('follows the chances when some words have none: they share the rest', () => {
    const words = [{ text: 'A', chance: 40 }, { text: 'BO' }, { text: 'ZAP' }];
    const l = layer(words);
    for (let seed = 1; seed <= 600; seed++) {
      const i = pickWord(l, seed);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(drawn(l, seed).letters).toBe(words[i]!.text.length);
    }
  });

  it('is the same word every play for a layer that does not change per play', () => {
    const words = [{ text: 'A', chance: 30 }, { text: 'BO', chance: 30 }, { text: 'ZAP', chance: 30 }];
    const l = layer(words, { perPlay: false });
    const first = pickWord(l, 1);
    for (let seed = 1; seed <= 200; seed++) {
      expect(pickWord(l, seed)).toBe(first);
      expect(drawn(l, seed).letters).toBe(first < 0 ? 0 : words[first]!.text.length);
    }
  });

  it('never shows a word with a 0 % chance, nor one left with nothing', () => {
    const l = layer([{ text: 'A', chance: 0 }, { text: 'BO', chance: 100 }, { text: 'ZAP' }]);
    for (let seed = 1; seed <= 500; seed++) expect(pickWord(l, seed)).toBe(1);
  });
});

describe('a space in a word', () => {
  const cam = gameCamera();
  /** Upright letters (no tilt or slant) of one size (no size jitter); turn, bounce and growth along the word as given. */
  const word = (text: string, over: Partial<WordLayer> = {}): WordLayer =>
    layer([{ text }], { tiltDeg: [0, 0], slantDeg: 0, sizeJitter: 0, turnDeg: 0, bounce: 0, ramp: 0, colours: { top: 'heat.4', bottom: 'heat.2', back: 'team.dark' }, ...over });
  /** Every vertex of one play, across and up the screen (metres), with its colour as "r,g,b" in sRGB. */
  const picture = (l: WordLayer) => {
    const sink = new DrawSink(64);
    evaluate({ ...newEffect('w', 'W'), layers: [l] }, { ...ctx(1), colourSpace: 'srgb' }, sink);
    const out: { x: number; y: number; c: string }[] = [];
    for (const g of BLEND_GROUPS) {
      const b = sink.groups[g];
      for (let i = 0; i < b.vcount; i++) {
        const p = [b.pos[i * 4]!, b.pos[i * 4 + 1]!, b.pos[i * 4 + 2]!];
        out.push({ x: p[0]! * cam.right[0] + p[1]! * cam.right[1] + p[2]! * cam.right[2], y: p[0]! * cam.up[0] + p[1]! * cam.up[1] + p[2]! * cam.up[2], c: [b.col[i * 4], b.col[i * 4 + 1], b.col[i * 4 + 2]].map((v) => v!.toFixed(3)).join(',') });
      }
    }
    return out;
  };
  const toneColours = new Set(['heat.4', 'heat.2'].map((r) => parseHex(resolveRole(palette, r, 'soviets')!).map((v) => (v / 255).toFixed(3)).join(',')));
  /** Where the letters' two flat tones lie across the screen, in letter units (the cap height is 7), sorted. */
  const tonesAcross = (l: WordLayer, unit: number) => picture(l).filter((v) => toneColours.has(v.c)).map((v) => v.x / unit).sort((a, b) => a - b);
  /** One letter unit in metres: a lone I is 1.9 units wide. */
  const unit = (() => { const xs = tonesAcross(word('I'), 1); return (xs[xs.length - 1]! - xs[0]!) / 1.9; })();
  const widestGap = (xs: number[]) => xs.slice(1).reduce((m, x, i) => Math.max(m, x - xs[i]!), 0);

  // Vertex positions are kept as 32-bit floats: a hundred-thousandth of a letter unit is as close as they read.
  it('puts the letters around it 0.5 + 2.4 + 0.5 units apart, against 0.5 between letters', () => {
    expect(WORD_SPACE).toBe(2.4);
    expect(widestGap(tonesAcross(word('KA BOOM'), unit))).toBeCloseTo(3.4, 4);
    // Without the space no gap comes near that (the widest is inside a letter).
    expect(widestGap(tonesAcross(word('KABOOM'), unit))).toBeLessThan(1.6);
    // The word grows by the space and the spacing after it, and stays centred.
    const a = tonesAcross(word('KABOOM'), unit), b = tonesAcross(word('KA BOOM'), unit);
    expect(b[b.length - 1]! - b[0]! - (a[a.length - 1]! - a[0]!)).toBeCloseTo(2.9, 4);
    expect(b[b.length - 1]! + b[0]!).toBeCloseTo(a[a.length - 1]! + a[0]!, 4);
  });

  it('leaves about an I of ground between the two words once the outline and the pushed-back copy are drawn', () => {
    // Everything drawn (outlines, the pushed-back copy, the tones) across the screen: the widest gap is the ground between
    // the words. 32 px letters, where the outline is 6.2 % of the height.
    const across = picture(word('WHAM BAM', { letterPx: 32 })).map((v) => v.x / unit).sort((a, b) => a - b);
    const ground = widestGap(across);
    expect(ground).toBeGreaterThan(1.7);
    expect(ground).toBeLessThan(2.1);
  });

  it('adds one gap per space; spaces before the first letter or after the last add nothing', () => {
    expect(widestGap(tonesAcross(word('KA  BOOM'), unit))).toBeCloseTo(0.5 + 2 * 2.9, 4);
    expect(picture(word(' KABOOM  '))).toEqual(picture(word('KABOOM')));
    // A character that is not drawn is left out; the spaces round it stay.
    expect(widestGap(tonesAcross(word('KA # BOOM'), unit))).toBeCloseTo(0.5 + 2 * 2.9, 4);
  });

  it('only moves the letters apart: each letter keeps its own turn, bounce and size along the word', () => {
    // As a new word layer has them: turned and bounced letters that grow along the word.
    const over = { turnDeg: 4, bounce: 0.35, ramp: 0.2 };
    const a = picture(word('KABOOM', over)), b = picture(word('KA BOOM', over));
    expect(b).toHaveLength(a.length);
    // The gap takes the size of the letter before it (the A, second of six letters, at 1 + 0.2 x (1/5 - 0.5)).
    const half = (1.45 * (1 + 0.2 * (1 / 5 - 0.5))) * unit;
    let left = 0, right = 0;
    a.forEach((v, i) => {
      expect(b[i]!.c).toBe(v.c);
      expect(Math.abs(b[i]!.y - v.y)).toBeLessThan(2e-6);
      const dx = b[i]!.x - v.x;
      if (Math.abs(dx + half) < 2e-6) left++;
      else if (Math.abs(dx - half) < 2e-6) right++;
      else throw new Error(`vertex ${i} moved by ${dx}, not by ${half} either way`);
    });
    // K and A move left, B, O, O and M right: one word, now two.
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(left);
    expect(drawn(word('KA BOOM', over), 1).letters).toBe(6);
  });
});
