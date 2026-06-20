// ---------------------------------------------------------------------------
// Provider resolution — the single place that answers "which backend is
// active, is it usable, and how do I run it?" for BOTH the image lane and the
// text (shot-list) lane.
//
// Previously this cascade lived in image-provider.ts and was *duplicated* in
// shot-list.ts (chatConfig re-resolved the provider independently), so the two
// lanes could silently disagree. Here a single resolution feeds both, so they
// can no longer drift.
//
// The one impure dependency — probing the Codex/Gemini CLIs (shelling out) — is
// injected as a `CliProbe` port so the whole cascade is unit-testable with no
// subprocesses. Everything else (prefs, env, saved key) is a deterministic read.
// ---------------------------------------------------------------------------

import type {
  ImageProvider,
  ProviderName,
  GenerationRequest,
  GenerationResult,
} from "./image-provider";
import { OpenAIProvider } from "./providers/openai";
import { OpenRouterProvider } from "./providers/openrouter";
import { MockImageProvider } from "./providers/mock";
import { CodexProvider } from "./providers/codex";
import { GeminiProvider } from "./providers/gemini";
import { getResolvedApiKey, detectProviderFromKey } from "./openai-api-key";
import {
  getBackendSetting,
  getFreeBackendPreference,
  getCodexStatus,
  getCodexCliPath,
  getGeminiCliPath,
  type CodexStatus,
} from "./app-settings";
import { planShotList, type Shot } from "./shot-list";

// ---------------------------------------------------------------------------
// CliProbe port — the only impure boundary, injectable for tests
// ---------------------------------------------------------------------------

export interface CliProbe {
  codexState(): { status: CodexStatus; bin: string | null };
  geminiPath(): string | null;
}

/** Production probe: defers to the real CLI-locating logic in app-settings. */
export const realCliProbe: CliProbe = {
  codexState: () => ({ status: getCodexStatus(), bin: getCodexCliPath() }),
  geminiPath: () => getGeminiCliPath(),
};

// ---------------------------------------------------------------------------
// Why a lane can't run right now (null when usable) — the UI renders these
// instead of re-deriving "is it usable?" from scattered booleans.
// ---------------------------------------------------------------------------

export type Unusable =
  | { reason: "no-cli"; lane: "codex" | "gemini" }
  | { reason: "logged-out"; lane: "codex" }
  | { reason: "needs-update"; lane: "codex" }
  | { reason: "no-api-key"; lane: "openai" | "openrouter" };

// ---------------------------------------------------------------------------
// The resolution cascade (was image-provider.resolveProviderName)
// ---------------------------------------------------------------------------

function codexUsable(probe: CliProbe): boolean {
  return probe.codexState().status === "ok";
}

function geminiUsable(probe: CliProbe): boolean {
  return probe.geminiPath() !== null;
}

function firstFreeProvider(probe: CliProbe): ProviderName | null {
  const order: Array<"codex" | "gemini"> =
    getFreeBackendPreference() === "gemini" ? ["gemini", "codex"] : ["codex", "gemini"];
  for (const provider of order) {
    if (provider === "codex" && codexUsable(probe)) return "codex";
    if (provider === "gemini" && geminiUsable(probe)) return "gemini";
  }
  return null;
}

/**
 * Resolve the active provider name.
 *
 * An explicit `ICON_PROVIDER` environment variable always wins. Otherwise: a
 * user-chosen backend (Settings) is honored when usable, falling back to the
 * other free lane / a saved API key so a stale setting never traps the app in a
 * dead "No API key" state. Re-evaluated on every call so swapping the key or
 * backend at runtime takes effect immediately.
 */
export function resolveProviderName(probe: CliProbe = realCliProbe): ProviderName {
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
  const setting = getBackendSetting();
  if (setting === "mock") return "mock";
  if (setting === "codex" || setting === "gemini") {
    const usable = setting === "codex" ? codexUsable(probe) : geminiUsable(probe);
    if (usable) return setting;
    const free = firstFreeProvider(probe);
    if (free) return free;
    const key = getResolvedApiKey();
    if (key) return detectProviderFromKey(key);
    return setting;
  }
  if (setting === "openai" || setting === "openrouter") {
    const free = firstFreeProvider(probe);
    return getResolvedApiKey() || !free ? setting : free;
  }
  // auto: prefer no-key subscription/CLI lanes first, then a saved API key,
  // else OpenAI (which will prompt for a key).
  const free = firstFreeProvider(probe);
  if (free) return free;
  const key = getResolvedApiKey();
  if (key) return detectProviderFromKey(key);
  return "openai";
}

/** Why the resolved provider can't run (null = ready). */
function blockedReason(name: ProviderName, probe: CliProbe): Unusable | null {
  switch (name) {
    case "mock":
      return null;
    case "codex": {
      const status = probe.codexState().status;
      if (status === "ok") return null;
      if (status === "no-cli") return { reason: "no-cli", lane: "codex" };
      if (status === "logged-out") return { reason: "logged-out", lane: "codex" };
      return { reason: "needs-update", lane: "codex" };
    }
    case "gemini":
      return geminiUsable(probe) ? null : { reason: "no-cli", lane: "gemini" };
    case "openai":
    case "openrouter":
      return getResolvedApiKey() ? null : { reason: "no-api-key", lane: name };
  }
}

// ---------------------------------------------------------------------------
// Provider instances — one cached instance per provider name
// ---------------------------------------------------------------------------

const _instances: Partial<Record<ProviderName, ImageProvider>> = {};

function providerInstance(name: ProviderName): ImageProvider {
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
// Public surface
// ---------------------------------------------------------------------------

/** A fully-resolved active backend — both lanes run on the SAME provider. */
export interface ResolvedProvider {
  readonly name: ProviderName;
  /** Image lane: generate icon variants. */
  generate(request: GenerationRequest): Promise<GenerationResult>;
  /** Text lane: plan an article's shot list on the same backend. */
  planShots(article: string): Promise<Shot[]>;
  /** null = ready; otherwise the concrete reason, for upfront UI messaging. */
  readonly blocked: Unusable | null;
  /** True when this lane needs a saved API key to run. */
  readonly needsApiKey: boolean;
}

/**
 * The common entry point. Runs the cascade once and hands back a ready object
 * that serves both the image and text lanes on the resolved provider.
 */
export function resolveProvider(probe: CliProbe = realCliProbe): ResolvedProvider {
  const name = resolveProviderName(probe);
  return {
    name,
    generate: (request) => providerInstance(name).generate(request),
    planShots: (article) => planShotList(name, article),
    blocked: blockedReason(name, probe),
    needsApiKey: name === "openai" || name === "openrouter",
  };
}

/** Read-only availability snapshot for the Settings UI (no lane committed). */
export interface ProviderAvailability {
  active: ProviderName;
  backendSetting: string;
  freeBackendPreference: "codex" | "gemini";
  codexStatus: CodexStatus;
  codexAvailable: boolean;
  geminiAvailable: boolean;
  hasApiKey: boolean;
}

export function describeProviders(
  probe: CliProbe = realCliProbe
): ProviderAvailability {
  return {
    active: resolveProviderName(probe),
    backendSetting: getBackendSetting(),
    freeBackendPreference: getFreeBackendPreference(),
    codexStatus: probe.codexState().status,
    codexAvailable: codexUsable(probe),
    geminiAvailable: geminiUsable(probe),
    hasApiKey: getResolvedApiKey().length > 0,
  };
}
