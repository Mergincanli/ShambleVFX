/**
 * The colours each layer asks the palette for, beyond the examples: no example uses a gradient, and they do not try every
 * edge, ink width or timing. Made-up layers of every kind, drawn by the real runtime and compared with the format's
 * static list, as the example tests do (colours-used.ts). Every made-by; one faction, since the faction changes no request
 * (the example tests sweep all three); each layer in the first tier it shows in, as everywhere in these tests. The last
 * test holds the runtime to what that rests on: a layer draws the same in each tier it shows in.
 *
 * The named roles below avoid ink, white and heat.rim where they can, so a request for those comes from what the kind
 * draws without naming them.
 */
import { describe, expect, it } from 'vitest';
import { EDGES, FACTION_IDS, newBurstLayer, newEffect, newProjectileLayer, newShapeLayer, newSpriteLayer, newWordLayer } from '@shamble/vfx-format';
import type { BurstLayer, EffectFile, Layer, Palette, ParticleLook, ShapeLayer, ShapeSpec, WordLayer } from '@shamble/vfx-format';
import { applyControls, resolveTimeline } from '../src/core/index';
import { RELATIONS, builtIn, checkEffectColours, exampleEffects, layerPicture, samePicture } from './colours-used';
import type { Extra, Sweep } from './colours-used';

const palette: Palette = {
  ...builtIn,
  gradients: {
    'test.ramp': { kind: 'smooth', from: 'assumed', stops: [{ at: 0, role: 'glow.hot' }, { at: 0.5, role: 'glow' }, { at: 1, hex: '#204060', alpha: 0.5 }] },
    'test.bands': { kind: 'banded', from: 'assumed', stops: [{ at: 0, role: 'scorch.1' }, { at: 0.3, role: 'heat.deep' }, { at: 0.6, role: 'heat.4' }] },
    'test.cool': { kind: 'smooth', from: 'assumed', stops: [{ at: 0, role: 'fire.light' }, { at: 0.6, role: 'heat.dark' }, { at: 1, role: 'heat.dark', alpha: 0 }] },
    'test.main': { kind: 'smooth', from: 'assumed', stops: [{ at: 0, role: 'main' }, { at: 1, role: 'smoke.dark' }] },
    'test.hex': { kind: 'banded', from: 'assumed', stops: [{ at: 0, hex: '#FFE8A0' }, { at: 0.5, hex: '#802010' }] },
  },
};
/** Gradients the palette has; test.missing is named by layers but not in the palette (they fall back to their roles). */
const IN_PALETTE = new Set(Object.keys(palette.gradients));
const sweep: Sweep = { factions: ['soviets'], relations: RELATIONS, seeds: [1] };

function effect(id: string, layers: Layer[]): EffectFile {
  const fx = newEffect(id, id);
  fx.layers = layers;
  return fx;
}

function shape<K extends ShapeSpec['kind']>(id: string, kind: K, edit: (s: Extract<ShapeSpec, { kind: K }>, l: ShapeLayer) => void = () => {}): ShapeLayer {
  const l = newShapeLayer(id, id, kind);
  edit(l.shape as Extract<ShapeSpec, { kind: K }>, l);
  return l;
}

describe('the colours made-up layers of every kind ask the palette for', () => {
  it('stars of shards: every edge, ink width, double edge, white first step and timing', () => {
    const layers: Layer[] = [];
    for (const edge of EDGES) for (const inkPx of [0, 2]) for (const double of [false, true]) for (const white of [false, true]) {
      for (const timing of ['steps', 'smooth'] as const) {
        layers.push(shape(`sh_${edge}_${inkPx}_${+double}_${+white}_${timing}`, 'shards', (s, l) => {
          Object.assign(s, { edge, inkPx, double, whiteFirstStep: white });
          if (timing === 'smooth') l.timing = { mode: 'smooth' };
        }));
      }
    }
    layers.push(shape('sh_halftone', 'shards', (s) => { s.halftone = { role: 'fire.light', stepPx: 9, dotPx: 4, towardDeg: 45 }; }));
    checkEffectColours(effect('shards', layers), palette, sweep, []);
  }, 120_000);

  it('flashes, clouds, rings, dots, scorch marks, lines, glows, beams and beads', () => {
    const layers: Layer[] = [];
    const extras: Extra[] = [];
    for (const edge of EDGES) for (const inkPx of [0, 3]) {
      layers.push(shape(`fl_${edge}_${inkPx}`, 'flash', (s) => Object.assign(s, { edge, inkPx })));
      layers.push(shape(`cl_${edge}_${inkPx}`, 'cloud', (s) => Object.assign(s, { edge, inkPx })));
    }
    layers.push(shape('cl_halftone', 'cloud', (s) => { s.halftone = { role: 'fire.light', stepPx: 9, dotPx: 4, towardDeg: 45 }; }));
    for (const style of ['auto-zigzag', 'auto-teeth', 'solid', 'dashed', 'zigzag', 'teeth'] as const) for (const inkPx of [0, 8]) for (const closing of [false, true]) {
      layers.push(shape(`ri_${style.replace('-', '_')}_${inkPx}_${+closing}`, 'ring', (s) => {
        Object.assign(s, { style, inkPx });
        if (closing) s.closing = { count: 2, periodMs: 400, fromM: 1.5, toM: 0.3 };
      }));
    }
    layers.push(shape('dots', 'dots'));
    for (const style of ['oval', 'splat'] as const) for (const coreScale of [0, 0.5]) {
      const id = `sc_${style}_${coreScale ? 'core' : 'nocore'}`;
      layers.push(shape(id, 'scorch', (s) => Object.assign(s, { style, coreScale, lobes: 6 })));
      if (!coreScale) extras.push({ layer: id, role: 'scorch.2', why: 'a core of size 0 is not drawn; the file still names its colour' });
    }
    layers.push(shape('lines', 'lines', (s) => { s.role = 'heat.3'; }));
    for (const gradient of [undefined, 'test.ramp', 'test.main', 'test.hex', 'test.missing']) for (const soft of [false, true]) {
      const id = `gl_${gradient?.replace('test.', '') ?? 'plain'}_${+soft}`;
      layers.push(shape(id, 'glow', (s) => Object.assign(s, { role: 'heat.4', soft }, gradient ? { gradient } : {})));
      if (gradient && IN_PALETTE.has(gradient)) extras.push({ layer: id, role: 'heat.4', why: 'the gradient colours the glow in place of its role' });
    }
    for (const edge of EDGES) for (const soft of [false, true]) {
      const id = `ba_${edge}_${+soft}`;
      layers.push(shape(id, 'band', (s) => Object.assign(s, { edge, soft })));
      if (edge === 'none') extras.push({ layer: id, role: 'glow.hot', why: 'a beam with edge none is never drawn' });
    }
    for (const glowRole of [undefined, 'glow']) layers.push(shape(`be_${glowRole ?? 'plain'}`, 'beads', (s) => { s.role = 'heat.1'; if (glowRole) s.glowRole = glowRole; else delete s.glowRole; }));
    checkEffectColours(effect('shapes', layers), palette, sweep, extras, ['ba_none_0', 'ba_none_1']);
  }, 120_000);

  it('smoke: puffs and billows, with and without a gradient, a light top and a loop', () => {
    const layers: Layer[] = [];
    const extras: Extra[] = [];
    for (const style of ['puff', 'billow'] as const) for (const gradient of [undefined, 'test.cool', 'test.missing']) for (const light of [false, true]) for (const loop of [false, true]) {
      const id = `sm_${style}_${gradient?.replace('test.', '') ?? 'plain'}_${+light}_${+loop}`;
      layers.push(shape(id, 'smoke', (s) => {
        Object.assign(s, { style, role: 'fire.smoke', rimRole: 'fire.smoke.line' }, gradient ? { gradient } : {}, light ? { lightRole: 'fire.smoke.light' } : {}, loop ? { loop: { count: 3, lifeMs: 400 } } : {});
      }));
      if (gradient && IN_PALETTE.has(gradient)) extras.push({ layer: id, role: 'fire.smoke', why: 'the gradient colours the body in place of role' });
    }
    checkEffectColours(effect('smoke', layers), palette, sweep, extras);
  }, 120_000);

  it("a fire's tongues and bed: every edge, six tones, both bed parts, banded and smooth gradients", () => {
    const layers: Layer[] = [];
    const extras: Extra[] = [];
    const quick = (l: ShapeLayer) => { l.durationMs = 300; };
    for (const edge of EDGES) for (const six of [false, true]) {
      const id = `fm_${edge}_${six ? 6 : 4}`;
      layers.push(shape(id, 'flames', (s, l) => {
        Object.assign(s, { edge, count: 4, growMs: 0, tones: six ? ['heat.1', 'heat.2', 'heat.3', 'heat.4', 'fire.light', 'scorch.2'] : ['heat.1', 'heat.2', 'heat.3', 'heat.4'] });
        quick(l);
      }));
      if (six) extras.push({ layer: id, role: 'fire.light', why: 'only the first four tones of flames are drawn' }, { layer: id, role: 'scorch.2', why: 'only the first four tones of flames are drawn' });
    }
    for (const edge of EDGES) for (const part of ['lumps', 'detail'] as const) {
      layers.push(shape(`bd_${edge}_${part}`, 'bed', (s, l) => { Object.assign(s, { edge, part, lumps: 5, growMs: 0 }); quick(l); }));
    }
    for (const gradient of ['test.bands', 'test.cool', 'test.missing']) for (const part of ['lumps', 'detail'] as const) {
      const id = `bd_${gradient.replace('test.', '')}_${part}`;
      layers.push(shape(id, 'bed', (s, l) => { Object.assign(s, { part, gradient, lumps: 5, growMs: 0 }); quick(l); }));
      // The gradient's bands replace the tones; a tone the gradient also names as a stop is still asked for.
      const stops = new Set((palette.gradients[gradient]?.stops ?? []).map((st) => st.role));
      if (IN_PALETTE.has(gradient)) {
        for (const tone of ['heat.dark', 'heat.1', 'heat.2', 'heat.3']) if (!stops.has(tone)) extras.push({ layer: id, role: tone, why: 'the gradient\'s bands take the place of the tones' });
      }
    }
    checkEffectColours(effect('fire', layers), palette, sweep, extras);
  }, 120_000);

  it('trails: every edge, a core with every edge, a hot head', () => {
    const shot = newProjectileLayer('shot', 'Shot');
    shot.flight = { mode: 'speed', mps: 20 };
    const layers: Layer[] = [shot];
    const extras: Extra[] = [];
    for (const edge of EDGES) for (const core of [undefined, 'auto', 'enemy', 'none'] as const) for (const head of [false, true]) {
      const id = `tr_${edge}_${core ?? 'nocore'}_${+head}`;
      const l = shape(id, 'trail', (s) => {
        Object.assign(s, { edge });
        if (core) s.core = { role: 'glow.hot', px: 1.5, edge: core };
        if (!head) delete s.head;
      });
      delete l.durationMs;
      l.at = { layer: 'shot' };
      layers.push(l);
      if (core === 'none') extras.push({ layer: id, role: 'glow.hot', why: 'a core with edge none is not drawn' });
    }
    checkEffectColours(effect('trails', layers), palette, sweep, extras);
  }, 120_000);

  it('bursts: every look with every edge, an own ink colour, a streak, gradients, image pieces', () => {
    const layers: Layer[] = [];
    const burst = (id: string, look: ParticleLook, edit: (b: BurstLayer) => void = () => {}): BurstLayer => {
      const b: BurstLayer = { ...newBurstLayer(id, id), count: 4, lifeMs: [300, 400], speedMps: [2, 4], look };
      edit(b);
      return b;
    };
    const kinds = ['diamond', 'chip', 'spark', 'dot', 'shard', 'speck', 'puff', 'streak', 'spike'] as const;
    for (const kind of kinds) {
      for (const edge of EDGES) layers.push(burst(`bu_${kind}_${edge}`, { kind, role: 'heat.1', inkPx: 1.5, edge }));
      layers.push(burst(`bu_${kind}_inkrole`, { kind, role: 'heat.1', inkPx: 1.5, edge: 'ink', inkRole: 'stone.rim' }));
    }
    layers.push(burst('bu_streak', { kind: 'diamond', role: 'heat.1', inkPx: 1.5, edge: 'auto' }, (b) => { b.streak = { role: 'glow', lengthM: 0.4, widthPx: 3 }; }));
    for (const gradient of ['test.cool', 'test.main', 'test.missing']) {
      layers.push(burst(`bu_grad_${gradient.replace('test.', '')}`, { kind: 'diamond', role: 'heat.1', inkPx: 1.5, edge: 'auto' }, (b) => { b.gradient = gradient; }));
    }
    for (const tint of [{ mode: 'keep' as const }, { mode: 'multiply' as const, role: 'dust' }]) for (const gradient of [undefined, 'test.cool']) {
      layers.push(burst(`bu_image_${tint.mode}_${gradient ? 'grad' : 'plain'}`, { kind: 'image', image: 'hit_star.png', tint }, (b) => { if (gradient) b.gradient = gradient; }));
    }
    checkEffectColours(effect('bursts', layers), palette, sweep, []);
  }, 120_000);

  it('words and sprites: a separation line, a word only the shooter sees, "main" colours', () => {
    const word = (id: string, edit: (w: WordLayer) => void): WordLayer => {
      const w = newWordLayer(id, id);
      edit(w);
      return w;
    };
    const layers: Layer[] = [
      word('wo_plain', () => {}),
      word('wo_separation', (w) => { w.separation = 'heat.3'; }),
      word('wo_shooter', (w) => { w.visibleTo = 'shooter'; }),
      word('wo_main', (w) => { w.colours = { top: 'main', bottom: 'glow', back: 'team.dark' }; }),
      newSpriteLayer('sp_keep', 'Keep', 'flash.png'),
      { ...newSpriteLayer('sp_tint', 'Tint', 'flash.png'), tint: { mode: 'multiply', role: 'dust' } },
      { ...newSpriteLayer('sp_main', 'Main', 'flash.png'), tint: { mode: 'multiply', role: 'main' } },
    ];
    const fx = effect('words', layers);
    fx.controls.colour = 'glow.hot';
    checkEffectColours(fx, palette, sweep, []);
  }, 120_000);
});

describe('what the one-tier sweep rests on', () => {
  it('every example layer draws the same, to the bit, in each tier it shows in (a tier only leaves whole layers out)', () => {
    let compared = 0, drawnSomething = 0;
    for (const { project, file, fx } of exampleEffects()) {
      const len = resolveTimeline(fx, { origin: [-4, 1.5, 3], target: [3, 0.8, -2] }, applyControls(fx.controls)).lengthMs;
      fx.layers.forEach((l, i) => {
        if (l.type === 'projectile' || l.tiers.length < 2) return;
        for (const k of [0.1, 0.35, 0.6, 0.85]) for (const relation of RELATIONS) {
          const faction = FACTION_IDS[compared % FACTION_IDS.length]!;
          const [first, ...others] = l.tiers.map((t) => layerPicture(fx, i, k * len, t, relation, faction));
          for (const o of others) expect(samePicture(o, first!), `${project}/${file} "${l.id}" at ${Math.round(k * len)} ms`).toBe(true);
          if (first!.some((x) => x.length)) drawnSomething++;
          compared++;
        }
      });
    }
    expect(compared).toBeGreaterThan(300);
    expect(drawnSomething).toBeGreaterThan(100);
  });
});
