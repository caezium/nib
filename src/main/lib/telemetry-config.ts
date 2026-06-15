/**
 * Public, embeddable client keys for product telemetry.
 *
 * Both values below are *write-only ingestion keys* — they are designed to ship
 * inside a client app (a Sentry DSN and a PostHog project key), so they are not
 * secrets. Telemetry no-ops entirely when a value is empty, so a fork that
 * leaves these blank sends nothing. Override either at runtime with the matching
 * NIB_* environment variable (handy for self-hosted PostHog/Sentry or testing).
 *
 * No prompt text, avatar, API key, or generated image is ever sent — see
 * telemetry.ts for exactly what each event carries.
 */
export const SENTRY_DSN = process.env.NIB_SENTRY_DSN ?? '';

export const POSTHOG_KEY = process.env.NIB_POSTHOG_KEY ?? '';

export const POSTHOG_HOST = process.env.NIB_POSTHOG_HOST ?? 'https://us.i.posthog.com';
