/**
 * Loading a palette profile into a project: the project takes the profile's colours, but no effect may break. So every
 * colour and gradient the project's effects use that the profile lacks is kept from the project's current palette, and
 * listed, so the editor can say what was kept and why. The list of what an effect uses is the checker's own
 * (effectColours in @shamble/vfx-format/validate): named roles, the main colour, ink, white, the broken edge, and the
 * stops of every gradient it names.
 *
 * A pure function: it returns a new palette and never changes the palettes or effects it is given.
 */
import { FACTION_IDS, GRADIENT_NAME } from '@shamble/vfx-format';
import type { EffectFile, Palette, PaletteEntry } from '@shamble/vfx-format';
import { effectColours } from '@shamble/vfx-format/validate';
import type { ColourUse, GradientUse } from '@shamble/vfx-format/validate';
import { ROLE_NAME } from './edits';

/** A colour the project's effects use that the profile lacks. */
export interface LackingColour {
  role: string;
  /** Kept from the current palette. False when the current palette lacks it too: the effects that use it stay broken. */
  kept: boolean;
  /** A colour per faction (such as a team colour), as the current palette has it. */
  perFaction: boolean;
  /** Where it is used: the effect, and the checker's entry (the layer, the path, why). */
  uses: (ColourUse & { effect: string })[];
}

/** A gradient the project's effects use that the profile lacks. */
export interface LackingGradient {
  name: string;
  /** Kept from the current palette (its stops' colours are then kept too, when the profile lacks them). */
  kept: boolean;
  uses: (GradientUse & { effect: string })[];
}

export interface ProfileLoad {
  /** The profile's palette, plus what the effects need that it lacks, taken from the current palette. */
  palette: Palette;
  /** The colours the project's effects use that the profile lacks, in the order the effects first use them. */
  colours: LackingColour[];
  /** The gradients the project's effects use that the profile lacks. */
  gradients: LackingGradient[];
}

const own = <T>(o: Record<string, T> | undefined, k: string): T | undefined => (o && Object.hasOwn(o, k) ? o[k] : undefined);
const hasRole = (p: Palette, role: string) => own(p.roles, role) !== undefined || FACTION_IDS.some((f) => own(p.factions?.[f]?.roles, role) !== undefined);

/**
 * The palette a project gets when it loads `profile`: the profile's colours and gradients, and, kept from `current`,
 * every colour and gradient the effects use that the profile lacks. Gradients come first: a gradient kept from the
 * current palette brings the colours of its stops along when the profile lacks them.
 */
export function loadProfile(profile: Palette, current: Palette, effects: readonly EffectFile[]): ProfileLoad {
  const palette: Palette = structuredClone(profile);
  palette.gradients ??= {};
  const colours: LackingColour[] = [];
  const gradients: LackingGradient[] = [];

  // 1. Gradients the effects name that the profile lacks.
  const gradientUses = new Map<string, (GradientUse & { effect: string })[]>();
  for (const fx of effects) {
    for (const g of effectColours(fx).gradients) {
      if (!gradientUses.has(g.name)) gradientUses.set(g.name, []);
      gradientUses.get(g.name)!.push({ ...g, effect: fx.id });
    }
  }
  for (const [name, uses] of gradientUses) {
    if (own(profile.gradients, name) !== undefined || !GRADIENT_NAME.test(name)) continue;
    const g = own(current.gradients, name);
    if (g) palette.gradients[name] = structuredClone(g);
    gradients.push({ name, kept: !!g, uses });
  }

  // 2. Colours, with the gradients the new palette has (a kept gradient's stops are the current palette's).
  const colourUses = new Map<string, (ColourUse & { effect: string })[]>();
  for (const fx of effects) {
    for (const c of effectColours(fx, palette).colours) {
      if (c.role === undefined) continue; // a stop given as a hex is no palette colour
      if (!colourUses.has(c.role)) colourUses.set(c.role, []);
      colourUses.get(c.role)!.push({ ...c, effect: fx.id });
    }
  }
  for (const [role, uses] of colourUses) {
    if (hasRole(profile, role) || !ROLE_NAME.test(role)) continue;
    const perFaction = FACTION_IDS.some((f) => own(current.factions?.[f]?.roles, role) !== undefined);
    const shared = own(current.roles, role);
    if (perFaction) {
      for (const f of FACTION_IDS) {
        const e = own(current.factions?.[f]?.roles, role);
        const into = palette.factions?.[f]?.roles;
        if (e && into) into[role] = { ...(e as PaletteEntry) };
      }
    } else if (shared) palette.roles[role] = { ...shared };
    colours.push({ role, kept: perFaction || !!shared, perFaction, uses });
  }
  return { palette, colours, gradients };
}
