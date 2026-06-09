import { getResolvedApiKey } from "./openai-api-key";
import { resolveProviderName, withRetry } from "./image-provider";

export interface Shot {
  theme: string;
  coreIdea: string;
  labels: string[];
}

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

const SYSTEM_PROMPT =
  "You select which ideas in an article deserve a standalone illustration. " +
  "Read the article and choose 4 to 8 of its strongest, most visualizable ideas — " +
  "a judgment, a process, a structure, a state, or a metaphor. " +
  "Skip generic intros, conclusions, and pure summaries; prefer concrete, drawable ideas. " +
  "For each chosen idea return: " +
  "theme (a 2-4 word title), " +
  "core_idea (ONE concrete sentence naming the single thing to visualize), " +
  "labels (0-3 very short 1-2 word phrases that could be handwritten on the image, or []). " +
  'Respond ONLY with JSON of the form ' +
  '{"shots":[{"theme":"...","core_idea":"...","labels":["..."]}]}.';

interface ChatConfig {
  url: string;
  model: string;
  headers: Record<string, string>;
}

function chatConfig(apiKey: string): ChatConfig {
  const name = resolveProviderName();
  if (name === "openrouter") {
    return {
      url: OPENROUTER_CHAT_URL,
      model: process.env.OPENROUTER_TEXT_MODEL?.trim() || "openai/gpt-4o-mini",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/caezium/sidekick-illustrator",
        "X-Title": "Sidekick",
      },
    };
  }
  return {
    url: OPENAI_CHAT_URL,
    model: process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

/** Lenient JSON parse: tolerate ```json fences and surrounding prose. */
function parseShots(content: string): Shot[] {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Fall back to the first {...} block.
  if (!text.startsWith("{")) {
    const brace = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (brace >= 0 && end > brace) text = text.slice(brace, end + 1);
  }
  const parsed = JSON.parse(text) as { shots?: unknown };
  const raw = Array.isArray(parsed.shots) ? parsed.shots : [];
  const shots: Shot[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const theme = typeof o.theme === "string" ? o.theme.trim() : "";
    const coreIdea = typeof o.core_idea === "string" ? o.core_idea.trim() : "";
    if (!coreIdea) continue;
    const labels = Array.isArray(o.labels)
      ? o.labels.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean).slice(0, 3)
      : [];
    shots.push({ theme: theme || coreIdea.slice(0, 40), coreIdea, labels });
  }
  return shots.slice(0, 8);
}

/**
 * Turn an article into a shot list (4-8 illustratable ideas) via a text LLM.
 * Uses the same key/provider as image generation.
 */
export async function makeShotList(article: string): Promise<Shot[]> {
  const text = article.trim();
  if (!text) return [];

  if (resolveProviderName() === "mock") {
    return [
      { theme: "Two breakpoints", coreIdea: "A decision splits into two clearly different paths.", labels: ["A", "B"] },
      { theme: "Sort by purpose", coreIdea: "Items are sorted into labeled bins by their goal.", labels: ["sort"] },
      { theme: "Trust bridge", coreIdea: "Evidence tiles are laid one by one to build a bridge to trust.", labels: ["trust"] },
      { theme: "Idea well", coreIdea: "Ideas are pulled up from a deep well like buckets of water.", labels: [] },
    ];
  }

  const apiKey = getResolvedApiKey();
  if (!apiKey) {
    throw new Error("No API key. Add an OpenAI or OpenRouter key in app preferences.");
  }
  const cfg = chatConfig(apiKey);

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        signal: controller.signal,
        headers: cfg.headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text.slice(0, 24_000) },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Shot-list API error ${res.status}: ${body}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const shots = parseShots(content);
      if (shots.length === 0) throw new Error("The model returned no usable shots.");
      return shots;
    } finally {
      clearTimeout(timeoutId);
    }
  }, MAX_RETRIES);
}
