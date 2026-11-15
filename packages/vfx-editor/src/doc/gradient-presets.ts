/**
 * The ready-made gradients: ramps to start from, made of roles so they follow the faction. Proposals, all drawable by the
 * runtime. The colour picker offers them (src/app/gradients.ts), and the default palette profile "Built-in with
 * gradients" holds them (src/io/palette-profile.ts). Plain data with no imports but types, so the local server can use it.
 */
import type { Gradient } from '@shamble/vfx-format';

export interface GradientPreset {
  /** The name a gradient made from it gets in the palette (glow.ramp, then glow.ramp.2 when taken). */
  name: string;
  /** What the picker calls it. */
  label: string;
  gradient: Omit<Gradient, 'from'>;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { name: 'glow.ramp', label: 'Radial ramp', gradient: { kind: 'smooth', stops: [{ at: 0, role: 'glow.hot' }, { at: 0.45, role: 'glow', alpha: 0.9 }, { at: 1, role: 'glow', alpha: 0 }] } },
  { name: 'glow.fade', label: 'Soft fade', gradient: { kind: 'smooth', stops: [{ at: 0, role: 'glow' }, { at: 1, role: 'glow', alpha: 0 }] } },
  { name: 'fire.core', label: 'Hot core', gradient: { kind: 'smooth', stops: [{ at: 0, role: 'white' }, { at: 0.25, role: 'heat.3' }, { at: 0.6, role: 'heat.1', alpha: 0.85 }, { at: 1, role: 'heat.1', alpha: 0 }] } },
  { name: 'fire.bands', label: 'Banding', gradient: { kind: 'banded', stops: [{ at: 0, role: 'heat.4' }, { at: 0.25, role: 'heat.3' }, { at: 0.5, role: 'heat.2' }, { at: 0.75, role: 'heat.1' }] } },
  { name: 'team.duo', label: 'Duotone', gradient: { kind: 'smooth', stops: [{ at: 0, role: 'glow.hot' }, { at: 1, role: 'team' }] } },
  { name: 'team.tri', label: 'Tricolor', gradient: { kind: 'smooth', stops: [{ at: 0, role: 'white' }, { at: 0.5, role: 'glow' }, { at: 1, role: 'team.dark' }] } },
  { name: 'glow.rings', label: 'Landscape', gradient: { kind: 'banded', stops: [{ at: 0, role: 'white' }, { at: 0.35, role: 'glow.hot' }, { at: 0.7, role: 'glow', alpha: 0.7 }] } },
  { name: 'fire.ember', label: 'Ember', gradient: { kind: 'smooth', stops: [{ at: 0, role: 'heat.3' }, { at: 0.5, role: 'heat.dark', alpha: 0.9 }, { at: 1, role: 'heat.deep', alpha: 0 }] } },
  { name: 'smoke.fade', label: 'Smoke', gradient: { kind: 'smooth', stops: [{ at: 0, role: 'smoke.light', alpha: 0.9 }, { at: 1, role: 'smoke', alpha: 0 }] } },
];
