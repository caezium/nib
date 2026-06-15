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
export const SENTRY_DSN =
  process.env.NIB_SENTRY_DSN ??
  'https://d3445a9c589e219c90232d17f2b723ef@o4510941431922688.ingest.us.sentry.io/4511570492456960';

export const POSTHOG_KEY =
  process.env.NIB_POSTHOG_KEY ?? 'phc_3RWM3V4Z531drOnYCloeuOnyBt67hla7ywhTLywqcFT';

export const POSTHOG_HOST = process.env.NIB_POSTHOG_HOST ?? 'https://us.i.posthog.com';
