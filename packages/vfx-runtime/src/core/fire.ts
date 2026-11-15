/**
 * Fire: the bed of a flame pit and its tongues. (A first simple version; the Molotov preset brings the full drawing.)
 */
import type { BedShape, FlamesShape } from '@shamble/vfx-format';
import type { DrawCtx } from './draw';

export function drawFlames(sp: FlamesShape, ctx: DrawCtx): void {
  const c = ctx.rgba(sp.tones[0] ?? 'heat.1');
  for (let i = 0; i < sp.count; i++) {
    const x = (ctx.rnd(51, i) - 0.5) * sp.radiusM * 1.6 * ctx.s;
    const h = (sp.tallM[0] + (sp.tallM[1] - sp.tallM[0]) * ctx.rnd(52, i)) * ctx.s;
    const w = (sp.widthM[0] + (sp.widthM[1] - sp.widthM[0]) * ctx.rnd(53, i)) * ctx.s;
    ctx.p.poly([x - w, 0, x + w, 0, x + sp.lean * h, h], c);
  }
}

export function drawBed(sp: BedShape, ctx: DrawCtx): void {
  if (sp.part !== 'lumps') return;
  sp.tones.forEach((role, k) => {
    const r = sp.radiusM * ctx.s * (1 - k / (sp.tones.length + 1));
    ctx.p.disc(0, 0, r, r, ctx.rgba(role), 32);
  });
}
