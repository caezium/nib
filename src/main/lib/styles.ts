/**
 * Look library.
 *
 * The "house methodology" (white background, one idea, the avatar performs the
 * action, 16:9, sparse labels) is constant — see prompt-builder.ts. A *style*
 * only swaps the rendering look: line quality, texture, and color treatment.
 * Each `look` fragment is original prose written for this app.
 *
 * All looks are designed to read on a white ground.
 */

export interface StyleDef {
  /** Stable id stored in prefs / sent over IPC. */
  id: string;
  /** Short human label for the picker. */
  label: string;
  /** The look fragment appended to the base methodology. */
  look: string;
}

export const STYLES: Record<string, StyleDef> = {
  marker: {
    id: "marker",
    label: "Marker",
    look:
      "Loose hand-drawn marker look: chunky, slightly wobbly dark-brown ink outlines, " +
      "lightly imperfect edges, flat fills, a restrained warm palette with small " +
      "red / orange / blue / mint accents. No gradients, no drop shadows, no texture.",
  },
  riso: {
    id: "riso",
    label: "Riso",
    look:
      "Risograph print look: two or three flat spot colors, visible halftone grain, " +
      "a slight ink-layer misregistration offset, soft rounded shapes, and a subtle " +
      "paper grain over the white ground.",
  },
  blueprint: {
    id: "blueprint",
    label: "Blueprint",
    look:
      "Technical blueprint look: thin, even blue line-work and annotations on white, " +
      "faint construction lines, small measurement ticks and labelled callouts, no " +
      "shading, monochrome blue with at most one sparing accent color.",
  },
  woodcut: {
    id: "woodcut",
    label: "Woodcut",
    look:
      "Woodcut / linocut look: bold high-contrast carved black lines, chunky " +
      "silhouettes, hatching and stipple for shade, one or two flat spot colors, and " +
      "a hand-printed roughness on white.",
  },
  pixel: {
    id: "pixel",
    label: "Pixel",
    look:
      "Chunky pixel-art look: visible square pixels, a limited palette, blocky " +
      "silhouettes with a clean dark outline, light dithering for shade, on a crisp " +
      "white ground.",
  },
  clay: {
    id: "clay",
    label: "Clay",
    look:
      "Soft clay / plasticine look: rounded matte 3D forms, gentle even lighting, a " +
      "faint fingerprinted texture, a warm muted palette on white, and no harsh shadows.",
  },
  gouache: {
    id: "gouache",
    label: "Gouache",
    look:
      "Gouache painting look: flat opaque brush shapes with soft visible brush edges, " +
      "a slightly chalky matte color, a warm limited palette, and minimal shading on white.",
  },
};

export const DEFAULT_STYLE_ID = "marker";

/** Resolve a (possibly empty/unknown) style id to a definition. */
export function resolveStyle(id?: string): StyleDef {
  const key = (id ?? "").trim();
  return STYLES[key] ?? STYLES[DEFAULT_STYLE_ID]!;
}

/** Compact list for the renderer's picker. */
export function styleList(): { id: string; label: string }[] {
  return Object.values(STYLES).map((s) => ({ id: s.id, label: s.label }));
}
