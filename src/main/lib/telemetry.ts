/**
 * Anonymous product telemetry for the Nib desktop app.
 *
 * Two sinks, both reached with plain HTTPS (no SDK, so nothing extra to bundle
 * into the MoBrowser main process):
 *   - PostHog  — anonymous usage events (which mode/style, success/failure).
 *   - Sentry   — crash/error reports via the envelope endpoint.
 *
 * Privacy contract (kept in sync with the README + the in-app Settings note):
 *   - Events carry only coarse facts: event name, style id, provider name,
 *     variant counts, durations, OK/error. Never a prompt, avatar, API key, or
 *     generated image.
 *   - A random per-install id groups events without identifying anyone.
 *   - On by default; the user can opt out in Settings, and the NIB_NO_TELEMETRY
 *     env var force-disables it. Everything no-ops when disabled or when the
 *     ingestion keys are empty.
 */
import { app, prefs } from '@mobrowser/api';
import { randomUUID } from 'node:crypto';
import { SENTRY_DSN, POSTHOG_KEY, POSTHOG_HOST } from './telemetry-config';

const OPT_OUT_KEY = 'telemetry.optOut';
const ANON_ID_KEY = 'telemetry.anonId';

/** True when the user (or the env kill switch) has disabled telemetry. */
export function isOptedOut(): boolean {
  if (process.env.NIB_NO_TELEMETRY) return true;
  return prefs.getString(OPT_OUT_KEY).trim() === '1';
}

/** Persist the opt-out choice. */
export function setOptedOut(optOut: boolean): void {
  prefs.setString(OPT_OUT_KEY, optOut ? '1' : '0');
  prefs.persist();
}

function enabled(): boolean {
  return !isOptedOut();
}

function appVersion(): string {
  try {
    return app.version;
  } catch {
    return '0.0.0';
  }
}

function truncate(value: string, max = 240): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function scrubTelemetryText(value: string): string {
  const home = process.env.HOME || '';
  const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let scrubbed = value
    .replace(/sk-or-[A-Za-z0-9_-]+/g, '[redacted-openrouter-key]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-openai-key]')
    .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=_-]+/g, '[redacted-image]');
  if (home) scrubbed = scrubbed.replace(new RegExp(escapedHome, 'g'), '[home]');
  return truncate(scrubbed.replace(/\/Users\/[^/\s)]+/g, '/Users/[user]'));
}

function scrubProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value == null
    ) {
      clean[key] = typeof value === 'string' ? scrubTelemetryText(value) : value;
    } else {
      clean[key] = '[redacted]';
    }
  }
  return clean;
}

function errorSummary(err: Error): string {
  const message = scrubTelemetryText(err.message || '');
  const providerStatus = message.match(/\b(OpenAI|OpenRouter) API error (\d{3})\b/);
  if (providerStatus) return `${providerStatus[1]} API error ${providerStatus[2]}`;
  const codexExit = message.match(/\bCodex failed \(exit \d+\)/);
  if (codexExit) return codexExit[0];
  const geminiExit = message.match(/\bGemini failed \(exit \d+\)/);
  if (geminiExit) return geminiExit[0];
  if (message.startsWith('Could not run Codex')) return 'Could not run Codex';
  if (message.startsWith('Could not run Gemini')) return 'Could not run Gemini';
  if (message.startsWith('Codex timed out')) return 'Codex timed out';
  if (message.startsWith('Gemini timed out')) return 'Gemini timed out';
  return err.name || 'Error';
}

/** Stable-but-anonymous per-install id, generated once and stored in prefs. */
function anonId(): string {
  let id = prefs.getString(ANON_ID_KEY).trim();
  if (!id) {
    id = randomUUID();
    prefs.setString(ANON_ID_KEY, id);
    prefs.persist();
  }
  return id;
}

// ---------------------------------------------------------------------------
// PostHog — usage events
// ---------------------------------------------------------------------------

/**
 * Record an anonymous usage event. `properties` must contain only coarse,
 * non-identifying facts — callers never pass prompt text or image data.
 */
export function capture(event: string, properties: Record<string, unknown> = {}): void {
  if (!enabled() || !POSTHOG_KEY) return;
  const body = JSON.stringify({
    api_key: POSTHOG_KEY,
    event,
    distinct_id: anonId(),
    properties: {
      ...scrubProperties(properties),
      app_version: appVersion(),
      os: process.platform,
      $lib: 'nib-app',
    },
    timestamp: new Date().toISOString(),
  });
  // Fire-and-forget; telemetry must never throw into or block the caller.
  void fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Sentry — error reports (raw envelope endpoint)
// ---------------------------------------------------------------------------

function sentryParts(): { host: string; projectId: string; publicKey: string } | null {
  // DSN shape: https://<publicKey>@<host>/<projectId>
  const m = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(SENTRY_DSN);
  if (!m) return null;
  return { publicKey: m[1], host: m[2], projectId: m[3] };
}

/**
 * Minimal stack representation. We deliberately don't ship the Sentry SDK, so
 * grouping is coarse: each stack line becomes a synthetic frame (innermost
 * last, as Sentry expects).
 */
function framesFromStack(stack: string) {
  return stack
    .split('\n')
    .slice(1, 30)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const scrubbed = scrubTelemetryText(line);
      return { filename: scrubbed, function: scrubbed };
    })
    .reverse();
}

/**
 * Report an error to Sentry. `context` holds only coarse tags (scope, kind) —
 * no user content.
 */
export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  if (!enabled() || !SENTRY_DSN) return;
  const parts = sentryParts();
  if (!parts) return;

  const e = err instanceof Error ? err : new Error(String(err));
  const eventId = randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    release: `nib@${appVersion()}`,
    environment: process.env.ICON_PROVIDER === 'mock' ? 'development' : 'production',
    tags: { os: process.platform },
    extra: scrubProperties(context),
    user: { id: anonId() },
    exception: {
      values: [
        {
          type: e.name || 'Error',
          value: errorSummary(e),
          stacktrace: e.stack ? { frames: framesFromStack(e.stack) } : undefined,
        },
      ],
    },
  };

  const envelope =
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: SENTRY_DSN }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event) +
    '\n';

  const url = `https://${parts.host}/api/${parts.projectId}/envelope/?sentry_key=${parts.publicKey}&sentry_version=7`;
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
    body: envelope,
  }).catch(() => {});
}

/** Called once at startup. Records app_started when telemetry is enabled. */
export function initTelemetry(providerName: string): void {
  // No process-level uncaughtException handler on purpose: adding one would
  // suppress the runtime's default crash behavior. Errors are captured
  // explicitly at the call sites (IPC handlers + renderer reporter) instead.
  capture('app_started', { provider: providerName });
}
