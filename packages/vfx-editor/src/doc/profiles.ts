/**
 * Palette profiles in the editor (UI phase 7): the rules the colour picker's Palette tab follows, with no page code, so they
 * are tested in Node. The profile file, the name rule and the store are in ../io/palette-profile.ts and ../io/store.ts; the
 * load itself is ./load-profile.ts.
 *   - The two defaults ("Built-in", "Built-in with gradients") can be loaded, duplicated and saved as a file, not changed,
 *     renamed or deleted (in the editor: the local server still allows it, and Restore the default profiles brings one back).
 *   - An imported profile keeps its name; a taken name gets " (1)", " (2)" and so on. A duplicate is "<name> copy", numbered
 *     the same way when taken.
 *   - Before a load, the colours and gradients the project's effects use that the profile lacks are listed in plain words,
 *     with where they are used.
 *   - A load is one undo step: the colours and the profile's name together; Save as profile and Save over name it too.
 */
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { BUILT_IN_GRADIENTS_PROFILE, BUILT_IN_PROFILE, PROFILE_NAME_MAX, nameBase, numberedName, profileName, sameName } from '../io/palette-profile';
import type { EditorDoc } from './history';
import type { ProfileLoad } from './load-profile';

/** The default profiles, by name. */
export const DEFAULT_PROFILES: readonly string[] = [BUILT_IN_PROFILE, BUILT_IN_GRADIENTS_PROFILE];

/** One of the two defaults (by name, without regard to upper and lower case): it can be loaded or copied, not changed. */
export function isDefaultProfile(name: string): boolean {
  return DEFAULT_PROFILES.some((d) => sameName(d, name));
}

/** The defaults a listing lacks (by name), in their order. */
export function missingDefaults(names: readonly string[]): string[] {
  return DEFAULT_PROFILES.filter((d) => !names.some((n) => sameName(n, d)));
}

/** A name that is not one of `taken` (without regard to case): the name itself, else its base with " (1)", " (2)"… */
export function freeProfileName(name: string, taken: readonly string[]): string {
  const want = profileName(name);
  const used = new Set(taken.map((t) => profileName(t).toLowerCase()));
  if (!used.has(want.toLowerCase())) return want;
  const base = nameBase(want);
  for (let n = 1; ; n++) {
    const candidate = numberedName(base, n);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** A duplicate's name: "<name> copy" (cut so it stays within 64 characters), numbered when taken. */
export function copyName(name: string, taken: readonly string[]): string {
  const suffix = ' copy';
  const base = [...profileName(name)].slice(0, PROFILE_NAME_MAX - suffix.length).join('').trimEnd();
  return freeProfileName(`${base}${suffix}`, taken);
}

/** The name of the file "Save as file" makes: the profile's name in lowercase letters, digits and dashes, then ".json". */
export function profileFileName(name: string): string {
  const slug = profileName(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  return `${slug || 'palette-profile'}.json`;
}

/** A colour or gradient a profile lacks that the project's effects use, as the list before a load says it. */
export interface LackingLine {
  /** The role or the gradient's name. */
  name: string;
  kind: 'colour' | 'gradient';
  /** Kept from the project's current colours; false when the project lacks it too (the layers that use it stay broken). */
  kept: boolean;
  /** Where it is used: "Rifle shot (demo): Hit spark, Muzzle flash; Tank shell (board): its main colour", and "and 3 more". */
  where: string;
}

/** How many places a line names before "and N more". */
const PLACES = 3;

/** The list a load shows first: what the profile lacks that the effects use (gradients first, as the load keeps them). */
export function lackingLines(load: Pick<ProfileLoad, 'colours' | 'gradients'>, effects: readonly EffectFile[]): LackingLine[] {
  const where = (uses: readonly { effect: string; layer?: string }[]): string => {
    const byEffect = new Map<string, string[]>();
    for (const u of uses) {
      const fx = effects.find((e) => e.id === u.effect);
      const fxName = fx?.name ?? u.effect;
      const place = u.layer === undefined ? 'its main colour' : fx?.layers.find((l) => l.id === u.layer)?.name ?? u.layer;
      if (!byEffect.has(fxName)) byEffect.set(fxName, []);
      const list = byEffect.get(fxName)!;
      if (!list.includes(place)) list.push(place);
    }
    const all = [...byEffect].flatMap(([fx, places]) => places.map((p) => ({ fx, p })));
    const shown = all.slice(0, PLACES);
    const groups = new Map<string, string[]>();
    for (const { fx, p } of shown) { if (!groups.has(fx)) groups.set(fx, []); groups.get(fx)!.push(p); }
    const text = [...groups].map(([fx, places]) => `${fx}: ${places.join(', ')}`).join('; ');
    return all.length > PLACES ? `${text}, and ${all.length - PLACES} more` : text;
  };
  return [
    ...load.gradients.map((g) => ({ name: g.name, kind: 'gradient' as const, kept: g.kept, where: where(g.uses) })),
    ...load.colours.map((c) => ({ name: c.role, kind: 'colour' as const, kept: c.kept, where: where(c.uses) })),
  ];
}

/** The document with a profile's colours loaded, and the profile named (one undo step). */
export function withLoadedProfile(doc: EditorDoc, palette: Palette, name: string): EditorDoc {
  return { ...doc, palette, paletteProfile: profileName(name) };
}

/** The document with the profile its colours are kept as named (Save as profile, Save over); the same document when it is named so already. */
export function withProfileName(doc: EditorDoc, name: string): EditorDoc {
  const n = profileName(name);
  return doc.paletteProfile === n ? doc : { ...doc, paletteProfile: n };
}
