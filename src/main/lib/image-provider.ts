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
 * Machine-readable classification of a generation failure. The renderer can
 * branch on this code instead of pattern-matching free-text error messages
 * (see error-modal.tsx). `message` stays human-facing; `reason` drives behavior.
 */
export type GenerationErrorReason =
  | "no_key" // missing/empty/rejected credential — knowable pre-flight
  | "no_credits" // 402 / quota exhausted
  | "cli_missing" // codex/gemini binary absent, logged out, or too old
  | "timeout" // request exceeded the provider's budget
  | "unsupported_model" // selected model can't emit images
  | "declined" // model refused / returned no image
  | "not_entitled" // free CLI lane's plan lacks image-gen entitlement (HTTP 403)
  | "unknown";

/**
 * The structured error every provider should throw. `retryable: false`
 * short-circuits `withRetry` so a request that can never succeed (bad key, out
 * of credits) fails fast instead of burning the full backoff budget.
 */
export class GenerationError extends Error {
  constructor(
    readonly reason: GenerationErrorReason,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/**
 * Run `fn` up to `maxAttempts` times.  On failure before the last attempt,
 * waits `initialDelayMs × attempt` milliseconds before retrying (linear back-off).
 * A non-retryable `GenerationError` short-circuits the loop and is rethrown.
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
      if (err instanceof GenerationError && !err.retryable) throw err;
      if (attempt < maxAttempts) {
        await new Promise<void>((r) => setTimeout(r, initialDelayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Reference image + fan-out template (shared by the per-image providers)
// ---------------------------------------------------------------------------

/** A request's reference image, resolved once: MIME defaulted, extension mapped. */
export interface NormalizedReference {
  /** Base64 payload, no data URL prefix. */
  b64: string;
  /** MIME type, defaulted to `image/png` when the request omitted it. */
  mime: string;
  /** File extension matching the MIME — for providers that write a temp file. */
  ext: "png" | "jpg" | "webp" | "gif";
}

/**
 * Resolve a request's reference image once, replacing the MIME-default +
 * MIME→ext mapping that every provider used to repeat. Returns undefined for a
 * text-to-image request (no reference).
 */
export function normalizeReference(
  request: GenerationRequest
): NormalizedReference | undefined {
  if (!request.referenceImageB64) return undefined;
  const mime = request.referenceImageMime?.trim() || "image/png";
  const ext = mime.includes("jpeg")
    ? "jpg"
    : mime.includes("webp")
      ? "webp"
      : mime.includes("gif")
        ? "gif"
        : "png";
  return { b64: request.referenceImageB64, mime, ext };
}

/**
 * Template-method base for providers that produce ONE image per call and fan
 * out `count` of them concurrently. It owns the fan-out, the
 * first-error-wins surfacing, and reference normalization; a subclass
 * implements only `generateOne`. (OpenAI's batch `/images` API and the mock
 * provider don't fan out, so they implement `ImageProvider` directly.)
 */
export abstract class BaseImageProvider implements ImageProvider {
  protected abstract generateOne(
    request: GenerationRequest,
    ref: NormalizedReference | undefined
  ): Promise<string>;

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const ref = normalizeReference(request);
    const count = Math.max(1, request.count);
    const settled = await Promise.allSettled(
      Array.from({ length: count }, () => this.generateOne(request, ref))
    );
    const images = settled
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);
    if (images.length === 0) {
      // Surface the first failure (preserves a non-retryable GenerationError's
      // reason so the UI can react).
      const rejection = settled.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      const reason = rejection?.reason;
      throw reason instanceof Error
        ? reason
        : new Error(String(reason ?? "Provider returned no image."));
    }
    return { images };
  }
}
