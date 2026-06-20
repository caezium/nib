import { OpenAIProvider } from "./providers/openai";
import { OpenRouterProvider } from "./providers/openrouter";
import { MockImageProvider } from "./providers/mock";
import { CodexProvider } from "./providers/codex";
import { GeminiProvider } from "./providers/gemini";
import { getResolvedApiKey, detectProviderFromKey } from "./openai-api-key";
import {
  getBackendSetting,
  getFreeBackendPreference,
  codexAvailable,
  geminiAvailable,
} from "./app-settings";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface GenerationRequest {
  positivePrompt: string;
  negativePrompt: string;
  /** Base64-encoded image, no data URL prefix.  Omit for text-to-image. */
  referenceImageB64?: string;
  /**
   * MIME type of `referenceImageB64` (e.g. "image/png", "image/jpeg").
   * Providers must honor this — sending a JPEG/WebP labeled as PNG makes
   * OpenAI's /images/edits reject it. Defaults to image/png when omitted.
   */
  referenceImageMime?: string;
  /** Number of icon variants to generate. */
  count: number;
}

export interface GenerationResult {
  /**
   * Base64-encoded PNG strings with the squircle mask pre-applied.
   * No data URL prefix — compatible with the existing IPC contract.
   */
  images: string[];
}

/** Common interface implemented by every image generation back-end. */
export interface ImageProvider {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

// ---------------------------------------------------------------------------
// Supported providers
// ---------------------------------------------------------------------------

export type ProviderName = "openai" | "openrouter" | "codex" | "gemini" | "mock";

// ---------------------------------------------------------------------------
// Provider resolution — one cached instance per provider name
// ---------------------------------------------------------------------------

const _instances: Partial<Record<ProviderName, ImageProvider>> = {};

function firstFreeProvider(): ProviderName | null {
  const order: Array<"codex" | "gemini"> =
    getFreeBackendPreference() === "gemini" ? ["gemini", "codex"] : ["codex", "gemini"];
  for (const provider of order) {
    if (provider === "codex" && codexAvailable()) return "codex";
    if (provider === "gemini" && geminiAvailable()) return "gemini";
  }
  return null;
}

/**
 * Resolve the active provider name.
 *
 * An explicit `ICON_PROVIDER` environment variable always wins (handy for
 * `mock` during development, or to pin a provider). Otherwise the provider is
 * inferred from the stored API key: an `sk-or-…` key selects OpenRouter, and
 * anything else selects OpenAI. Re-evaluated on every call so swapping the key
 * at runtime takes effect immediately.
 */
export function resolveProviderName(): ProviderName {
  const forced = process.env.ICON_PROVIDER?.trim();
  if (
    forced === "mock" ||
    forced === "openai" ||
    forced === "openrouter" ||
    forced === "codex" ||
    forced === "gemini"
  ) {
    return forced;
  }
  // A user-chosen backend (Settings) usually overrides auto-detection. If the
  // chosen API-key lane has no key, fall back to Codex when it is available so
  // stale settings do not trap the app in a dead "No API key" state.
  const setting = getBackendSetting();
  if (setting === "mock") return "mock";
  if (setting === "codex" || setting === "gemini") {
    const usable = setting === "codex" ? codexAvailable() : geminiAvailable();
    if (usable) return setting;
    // The saved free lane isn't usable (not installed / logged out / no image
    // feature). Fall back so a stale setting doesn't fail every generation:
    // the other free lane, else a saved API key, else the choice as-is.
    const free = firstFreeProvider();
    if (free) return free;
    const key = getResolvedApiKey();
    if (key) return detectProviderFromKey(key);
    return setting;
  }
  if (setting === "openai" || setting === "openrouter") {
    const free = firstFreeProvider();
    return getResolvedApiKey() || !free ? setting : free;
  }
  // auto: prefer no-key subscription/CLI lanes first, then fall back to the
  // saved API key, else OpenAI (which will prompt for a key).
  const free = firstFreeProvider();
  if (free) return free;
  const key = getResolvedApiKey();
  if (key) return detectProviderFromKey(key);
  return "openai";
}

/**
 * Return the active provider, instantiating it on first use per name.
 *
 * Required configuration:
 *   - openai:     `sk-…` key in app preferences
 *   - openrouter: `sk-or-…` key in app preferences (model via OPENROUTER_MODEL)
 *   - mock:       none (placeholder images only, for local testing)
 */
export function getProvider(): ImageProvider {
  const name = resolveProviderName();
  const existing = _instances[name];
  if (existing) return existing;

  let created: ImageProvider;
  switch (name) {
    case "mock":
      created = new MockImageProvider();
      break;
    case "openrouter":
      created = new OpenRouterProvider();
      break;
    case "codex":
      created = new CodexProvider();
      break;
    case "gemini":
      created = new GeminiProvider();
      break;
    default:
      created = new OpenAIProvider();
  }
  _instances[name] = created;
  return created;
}

// ---------------------------------------------------------------------------
// Shared retry utility
// ---------------------------------------------------------------------------

/**
 * A failure that retrying cannot fix (bad API key, out of credits, …). Throw
 * this instead of a plain Error so `withRetry` surfaces it immediately rather
 * than burning the full backoff budget on a request that can never succeed.
 */
export class TerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminalError";
  }
}

/**
 * Run `fn` up to `maxAttempts` times.  On failure before the last attempt,
 * waits `initialDelayMs × attempt` milliseconds before retrying (linear back-off).
 * A `TerminalError` short-circuits the loop and is rethrown at once.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  initialDelayMs = 1_000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof TerminalError) throw err;
      if (attempt < maxAttempts) {
        await new Promise<void>((r) => setTimeout(r, initialDelayMs * attempt));
      }
    }
  }
  throw lastError;
}
