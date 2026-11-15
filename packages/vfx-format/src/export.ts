/**
 * The export folder the game loads: the manifest's shape and its names. No dependencies, so the runtime can read it.
 * The checker for a whole export folder is in "@shamble/vfx-format/validate" (checkExport).
 *
 *   manifest.json         the effects, their versions and the game events they answer
 *   palette.json          the colour roles (team colours per faction)
 *   atlas.png, atlas.json one packed image page, and where each image sits on it
 *   effects/<id>.vfx.json one effect file each, in the current effect format version
 *   editor.json           the editor's own notes (preview scenes, budgets, the palette profile's name); the game ignores it
 */

export const EXPORT_FORMAT = 'shamble-vfx-export' as const;
/** The export folder's own version (the manifest's layout). The effect files carry the effect format version. */
export const EXPORT_VERSION = 1 as const;

/** A game event's name: lowercase words joined by dots, such as "rifle.shot" or "tank.shell.land". */
export const EVENT_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export interface ManifestEffect {
  id: string;
  name: string;
  /** The effect file format version the file is in. */
  version: number;
  /** Path inside the export folder. */
  file: string;
  /** The game events this effect answers. */
  events: string[];
}

export interface ExportManifest {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  /** The project's name. */
  name: string;
  /** The effect file format version every effect file is in. */
  effectVersion: number;
  palette: string;
  atlas: { image: string; map: string; width: number; height: number };
  effects: ManifestEffect[];
  /** Event name to effect id: the lookup the game uses. One event plays one effect. */
  events: Record<string, string>;
}

export interface AtlasMap {
  width: number;
  height: number;
  /** Pixel rectangles, y from the top, keyed by image file name. "__white" and "__dot" are the runtime's own blocks. */
  rects: Record<string, { x: number; y: number; w: number; h: number }>;
}
