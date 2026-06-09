/**
 * System-level style constraints prepended to every illustration request.
 *
 * This is the "house style": a white-background, hand-drawn, lightly-pixelated
 * explanatory illustration in which the user's own avatar (supplied as a
 * reference image) performs the core conceptual action. The avatar's *identity*
 * comes from the reference image; this prefix only fixes the *style* and the
 * rule that the avatar must drive the action — so it works for any avatar.
 *
 * Keep entropy low (few adjectives, strict rules) for consistent output.
 */
const STYLE_PREFIX =
  "One standalone 16:9 horizontal article illustration. " +
  "Pure white background, generous empty white space, ONE single core idea. " +
  "Soft hand-drawn explanatory style: chunky, slightly imperfect dark-brown outlines, " +
  "lightly pixelated edges, restrained warm palette with occasional red / orange / blue / mint accents. " +
  "Low-tech tactile props only (boxes, tubes, buckets, pulleys, boards, bridges, funnels, levers, wires, carts). " +
  "The recurring IP character is the avatar shown in the reference image — keep it clearly recognizable and " +
  "consistent in shape, color, and proportions, and it MUST perform the core conceptual action " +
  "(pushing, sorting, steering, building, holding, fishing, patching, balancing, arranging), not merely decorate the scene. " +
  "Invent a fresh physical metaphor for this specific idea; do not reuse bridge / funnel / roadmap by default. " +
  "Main subject ~40-60% of the canvas. " +
  "0-5 very short handwritten labels (1-4 words each) only when useful; no title; never write the structure type on the image.";

/**
 * Things to steer away from. OpenAI / gemini image models rely mainly on the
 * positive prompt, so this is advisory for providers that accept it.
 */
export const NEGATIVE_PROMPT =
  "gradients, drop shadows, paper texture, complex or colored background, " +
  "glossy commercial vector style, PPT infographic, dense diagram, dashboard, " +
  "children's-book look, cute plush mascot, emoji, sticker, logo, realistic UI, " +
  "long sentences, paragraphs of text, watermark, multiple unrelated objects, clutter";

export interface BuiltPrompt {
  positive: string;
  negative: string;
}

/**
 * Wrap the user's concept in the house illustration style.
 *
 * `userIntent` is the idea to illustrate (e.g. "trust is built one piece of
 * evidence at a time"). The caller separately supplies the avatar reference
 * image, which carries the character's identity.
 */
export function buildPrompt(userIntent: string): BuiltPrompt {
  const intent = userIntent.trim();
  return {
    positive: `${STYLE_PREFIX}\n\nConcept to illustrate: ${intent}`,
    negative: NEGATIVE_PROMPT,
  };
}
