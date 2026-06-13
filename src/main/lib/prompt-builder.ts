import { resolveStyle } from "./styles";

/**
 * The house "methodology" — constant across every style. The avatar's identity
 * comes from the reference image; this fixes the rules of the picture. The
 * rendering *look* is supplied separately by the selected style (see styles.ts).
 */
const BASE_METHODOLOGY =
  "One standalone 16:9 horizontal illustration on a pure white background. " +
  "Express ONE single idea with generous empty white space. " +
  "The recurring character shown in the reference image is the subject and MUST " +
  "physically perform the idea (pushing, sorting, steering, building, holding, " +
  "fishing, patching, balancing, arranging) — never decoration; keep it clearly " +
  "recognizable and consistent in shape, color, and proportions. " +
  "Invent a fresh, concrete physical metaphor for this specific idea; do not " +
  "default to bridge / funnel / roadmap. Use simple low-tech tactile props " +
  "(boxes, tubes, buckets, pulleys, boards, levers, carts, wires). " +
  "Keep the main subject around 40-60% of the canvas. " +
  "At most a few very short handwritten labels (1-4 words each), only when useful; " +
  "no title; never write the structure name on the image. " +
  "It is not a photo, not a logo, not a corporate infographic, not a formal " +
  "flowchart, and not a UI mockup.";

/**
 * Things to steer away from. OpenAI / gemini image models rely mainly on the
 * positive prompt, so this is advisory for providers that accept it.
 */
export const NEGATIVE_PROMPT =
  "photoreal render, 3D corporate render, glossy commercial vector style, " +
  "PPT infographic, dense diagram, dashboard, children's-book look, cute plush " +
  "mascot, emoji, sticker, logo, realistic UI, long sentences, paragraphs of " +
  "text, watermark, multiple unrelated objects, clutter";

export interface BuiltPrompt {
  positive: string;
  negative: string;
}

/**
 * Wrap the user's concept in the house methodology plus the chosen look.
 *
 * `userIntent` is the idea to illustrate; `styleId` selects the rendering look
 * (defaults to the house marker look when empty/unknown). The avatar reference
 * image is supplied separately and carries the character's identity.
 */
export function buildPrompt(userIntent: string, styleId?: string): BuiltPrompt {
  const style = resolveStyle(styleId);
  const intent = userIntent.trim();
  return {
    positive: `${BASE_METHODOLOGY}\n\nLook: ${style.look}\n\nConcept to illustrate: ${intent}`,
    negative: NEGATIVE_PROMPT,
  };
}
