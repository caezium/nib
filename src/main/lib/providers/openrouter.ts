import type {
  ImageProvider,
  GenerationRequest,
  GenerationResult,
} from "../image-provider";
import { withRetry, GenerationError } from "../image-provider";
import { getResolvedOpenRouterApiKey } from "../openai-api-key";
import { getOpenRouterModel } from "../app-settings";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Optional attribution headers OpenRouter shows on its activity dashboard. */
const REFERER = "https://github.com/caezium/nib";
const TITLE = "Nib";

/** Abort individual HTTP requests after this many milliseconds. Image models
 *  vary wildly in speed (gemini-flash ~10s, some gpt-image lanes >90s). */
const REQUEST_TIMEOUT_MS = 150_000;

/** How many times to retry a failed request before giving up. */
const MAX_RETRIES = 3;

const IMAGE_ONLY_MODELS = new Set([
  "black-forest-labs/flux.2-pro",
  "black-forest-labs/flux.2-flex",
  "black-forest-labs/flux.2-klein-4b",
  "black-forest-labs/flux.2-max",
  "bytedance-seed/seedream-4.5",
  "x-ai/grok-imagine-image-quality",
]);

// ---------------------------------------------------------------------------
// Response shape (only the fields we read)
// ---------------------------------------------------------------------------

interface ChatImagePart {
  type?: string;
  image_url?: { url?: string };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      images?: ChatImagePart[];
      content?: string | ChatImagePart[];
    };
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip a `data:<mime>;base64,` prefix, returning the raw base64 payload. */
function dataUrlToBase64(url: string): string {
  const comma = url.indexOf(",");
  return comma >= 0 ? url.slice(comma + 1) : url;
}

/**
 * Pull the first generated image out of an OpenRouter chat completion.
 * Images normally arrive in `message.images[].image_url.url` as a data URL,
 * but we also scan `message.content` defensively.
 */
function extractImageB64(json: ChatCompletionResponse): string | null {
  const message = json.choices?.[0]?.message;
  if (!message) return null;

  const fromImages = message.images?.find((p) => p?.image_url?.url)?.image_url?.url;
  if (fromImages) return dataUrlToBase64(fromImages);

  if (Array.isArray(message.content)) {
    const fromContent = message.content.find(
      (p) => p?.type === "image_url" && p.image_url?.url
    )?.image_url?.url;
    if (fromContent) return dataUrlToBase64(fromContent);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * OpenRouter image generation provider.
 *
 * Unlike OpenAI's `/images/generations`, OpenRouter generates images through
 * the `/chat/completions` endpoint with `modalities: ["image", "text"]`, and
 * returns a single image per call. To produce `count` variants we fan out that
 * many requests in parallel.
 *
 * API key: read from application preferences only (an `sk-or-…` key).
 */
export class OpenRouterProvider implements ImageProvider {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = getResolvedOpenRouterApiKey();
    if (!apiKey) {
      throw new GenerationError(
        "no_key",
        "No OpenRouter API key. Save an sk-or key in Settings, or switch to Auto/Codex."
      );
    }

    const model = getOpenRouterModel();
    const count = Math.max(1, request.count);

    // One image per request → fire `count` requests concurrently.
    const settled = await Promise.allSettled(
      Array.from({ length: count }, () =>
        this.generateOne(
          apiKey,
          model,
          request.positivePrompt,
          request.referenceImageB64,
          request.referenceImageMime
        )
      )
    );

    const images = settled
      .filter(
        (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled"
      )
      .map((r) => r.value);

    if (images.length === 0) {
      // Surface the first failure (preserves 401/403 so the UI can re-prompt
      // for the key).
      const firstRejection = settled.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      const reason = firstRejection?.reason;
      throw reason instanceof Error
        ? reason
        : new Error(String(reason ?? "OpenRouter returned no image data."));
    }

    return { images };
  }

  /** Generate a single image via one chat-completion request. */
  private generateOne(
    apiKey: string,
    model: string,
    prompt: string,
    referenceB64?: string,
    referenceMime?: string
  ): Promise<string> {
    return withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        // For an edit, the reference image precedes the text instruction.
        const content: ChatImagePart[] | Array<Record<string, unknown>> = [];
        if (referenceB64) {
          const mime = referenceMime?.trim() || "image/png";
          content.push({
            type: "image_url",
            image_url: { url: `data:${mime};base64,${referenceB64}` },
          });
        }
        content.push({ type: "text", text: prompt });

        const res = await fetch(CHAT_COMPLETIONS_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": REFERER,
            "X-Title": TITLE,
          },
          body: JSON.stringify({
            model,
            modalities: IMAGE_ONLY_MODELS.has(model) ? ["image"] : ["image", "text"],
            // Article illustrations are 16:9 landscape.
            image_config: { aspect_ratio: "16:9" },
            messages: [{ role: "user", content }],
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          if (res.status === 402) {
            // Out of credits — retrying won't help, fail fast.
            throw new GenerationError(
              "no_credits",
              "OpenRouter is out of credits for this request. Add credits at " +
                "https://openrouter.ai/settings/credits, or switch to a cheaper model in Settings."
            );
          }
          if (res.status === 401 || res.status === 403) {
            // Bad/rejected key — retrying won't help, fail fast.
            throw new GenerationError(
              "no_key",
              `OpenRouter rejected the API key (${res.status}). Check your sk-or key in Settings.`
            );
          }
          throw new GenerationError(
            "unknown",
            `OpenRouter API error ${res.status}: ${body.slice(0, 300)}`,
            /* retryable */ true
          );
        }

        const json = (await res.json()) as ChatCompletionResponse;
        const image = extractImageB64(json);
        if (!image) {
          throw new GenerationError(
            "unsupported_model",
            "OpenRouter returned no image. Ensure the selected model supports image output."
          );
        }
        return image;
      } catch (err) {
        // The AbortController fires on timeout; surface it as something useful
        // instead of the raw DOMException "This operation was aborted".
        if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
          throw new GenerationError(
            "timeout",
            `The image request timed out after ${REQUEST_TIMEOUT_MS / 1000}s — the model may be slow ` +
              "or busy. Try again, or switch to a faster model (e.g. google/gemini-2.5-flash-image) in Settings.",
            /* retryable */ true
          );
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    }, MAX_RETRIES);
  }
}
