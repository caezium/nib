import { resolveStyle } from "./styles";
import styleData from "../../../skills/nib/references/style-data.json";

/**
 * The house "methodology" — constant across every style. The avatar's identity
 * comes from the reference image; this fixes the rules of the picture. The
 * rendering *look* is supplied separately by the selected style (see styles.ts).
 *
 * The methodology and negative-prompt text live in the single canonical source
 * `skills/nib/references/style-data.json` (read by the skill engine too); they
 * are imported here rather than re-typed so the app and skill never drift.
 */
const BASE_METHODOLOGY: string = styleData.baseMethodology;

/**
 * Things to steer away from. OpenAI / gemini image models rely mainly on the
 * positive prompt, so this is advisory for providers that accept it.
 */
export const NEGATIVE_PROMPT: string = styleData.negativePrompt;

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
