// ---------------------------------------------------------------------------
// Shared image-generation types + retry plumbing.
//
// Provider *resolution* (which backend is active, instance caching, the
// env→setting→availability→key cascade, and the text lane) lives in
// ./provider-resolver. This module holds only the contract every provider
// implements and the retry helper they share.
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

export type ProviderName = "openai" | "openrouter" | "codex" | "gemini" | "mock";

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
