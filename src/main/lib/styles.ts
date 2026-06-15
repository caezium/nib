/**
 * Look library.
 *
 * The "house methodology" (white background, one idea, the avatar performs the
 * action, 16:9, sparse labels) is constant — see prompt-builder.ts. A *style*
 * only swaps the rendering look: line quality, texture, and color treatment.
 *
 * The look definitions are NOT defined here: they are read from the single
 * canonical source `skills/nib/references/style-data.json`, which the skill
 * engine (skills/nib/scripts/generate.py) reads too — so the app and the skill
 * can never drift. Edit the looks in that JSON, not here.
 */
import styleData from "../../../skills/nib/references/style-data.json";

export interface StyleDef {
  /** Stable id stored in prefs / sent over IPC. */
  id: string;
  /** Short human label for the picker. */
  label: string;
  /** The look fragment appended to the base methodology. */
  look: string;
}

export const STYLES: Record<string, StyleDef> = Object.fromEntries(
  styleData.looks.map((s): [string, StyleDef] => [s.id, s])
);

export const DEFAULT_STYLE_ID: string = styleData.defaultStyleId;

/** Resolve a (possibly empty/unknown) style id to a definition. */
export function resolveStyle(id?: string): StyleDef {
  const key = (id ?? "").trim();
  return STYLES[key] ?? STYLES[DEFAULT_STYLE_ID]!;
}

/** Compact list for the renderer's picker. */
export function styleList(): { id: string; label: string }[] {
  return styleData.looks.map((s) => ({ id: s.id, label: s.label }));
}
