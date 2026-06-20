import { prefs } from '@mobrowser/api';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasApiKeyInPrefs } from './openai-api-key';

/**
 * User-chosen image-generation settings (persisted in prefs.json):
 *   - backend: which lane to generate on
 *   - openrouter model: the model used on the OpenRouter lane
 *
 * The avatar's written spec lives in avatar-store.ts alongside the avatar image.
 */
const BACKEND_KEY = 'image.backend';
const MODEL_KEY = 'image.openrouterModel';
const TEXT_MODEL_KEY = 'image.textModel';
const FREE_BACKEND_PREFERENCE_KEY = 'image.freeBackendPreference';

export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3.1-flash-image-preview';

/** The text model that drafts an article's shot list (Article mode). On the
 *  Codex/Gemini lanes the CLI's own model is used; this applies to the keyed
 *  OpenRouter lane. */
export const DEFAULT_TEXT_MODEL = 'openai/gpt-5.4-mini';

/** Current, capable, cheap text models for the shot-list picker (field is
 *  editable). Sourced from the live OpenRouter catalog — not from memory. */
export const SUGGESTED_TEXT_MODELS = [
  'openai/gpt-5.4-mini',
  'openai/gpt-5.4-nano',
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.5-flash',
  'deepseek/deepseek-v4-flash',
  'qwen/qwen3.6-flash',
  'x-ai/grok-4.3',
  'anthropic/claude-opus-4.8',
];

/** A short list of known OpenRouter image-output models (the field is editable). */
export const SUGGESTED_MODELS = [
  'google/gemini-3.1-flash-image-preview',
  'google/gemini-3-pro-image-preview',
  'google/gemini-2.5-flash-image',
  'openai/gpt-5.4-image-2',
  'openai/gpt-5-image-mini',
  'openai/gpt-5-image',
  'black-forest-labs/flux.2-pro',
  'black-forest-labs/flux.2-flex',
  'bytedance-seed/seedream-4.5',
  'x-ai/grok-imagine-image-quality',
];

/** "auto" | "openrouter" | "openai" | "codex" | "gemini" | "mock". Default "auto". */
export function getBackendSetting(): string {
  return prefs.getString(BACKEND_KEY).trim() || 'auto';
}

export function setBackendSetting(value: string): boolean {
  prefs.setString(BACKEND_KEY, value.trim());
  return prefs.persist();
}

/** In Auto mode, which no-key lane should be tried first. */
export function getFreeBackendPreference(): 'codex' | 'gemini' {
  return prefs.getString(FREE_BACKEND_PREFERENCE_KEY).trim() === 'gemini'
    ? 'gemini'
    : 'codex';
}

export function setFreeBackendPreference(value: string): boolean {
  prefs.setString(
    FREE_BACKEND_PREFERENCE_KEY,
    value.trim() === 'gemini' ? 'gemini' : 'codex'
  );
  return prefs.persist();
}

/** OpenRouter image model — saved pref, else OPENROUTER_MODEL env, else default. */
export function getOpenRouterModel(): string {
  return (
    prefs.getString(MODEL_KEY).trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_OPENROUTER_MODEL
  );
}

export function setOpenRouterModel(value: string): boolean {
  prefs.setString(MODEL_KEY, value.trim());
  return prefs.persist();
}

/** Shot-list (article-planning) text model — saved pref, else OPENROUTER_TEXT_MODEL env, else default. */
export function getTextModel(): string {
  return (
    prefs.getString(TEXT_MODEL_KEY).trim() ||
    process.env.OPENROUTER_TEXT_MODEL?.trim() ||
    DEFAULT_TEXT_MODEL
  );
}

export function setTextModel(value: string): boolean {
  prefs.setString(TEXT_MODEL_KEY, value.trim());
  return prefs.persist();
}

function executable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function codexResponds(p: string): boolean {
  try {
    execFileSync(p, ['--version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function usableGemini(p: string): boolean {
  if (!executable(p)) return false;

  try {
    execFileSync(p, ['--version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Locating a CLI shells out `<cli> --version`; resolveProviderName() runs on
// every generation, so cache each lookup briefly instead of spawning every time.
// A short TTL still lets a freshly-installed CLI be picked up without a restart.
const CLI_CACHE_MS = 15_000;

function cachedPath(compute: () => string | null): () => string | null {
  let value: string | null | undefined;
  let at = 0;
  return () => {
    const now = Date.now();
    if (value !== undefined && now - at < CLI_CACHE_MS) return value;
    value = compute();
    at = now;
    return value;
  };
}

/** Why the free Codex lane is / isn't usable — granular so the UI can say more
 *  than "not found": Codex IS installed but too old to emit image artifacts. */
export type CodexStatus = 'ok' | 'no-cli' | 'logged-out' | 'needs-update';

/**
 * Locate a Codex binary (responds to `--version`) — no usability gate. macOS GUI
 * apps often don't inherit the shell PATH, so also check the app bundle plus
 * common Homebrew/user-local installs.
 */
function locateCodex(): string | null {
  const explicit = process.env.CODEX_BIN?.trim();
  if (explicit && executable(explicit) && codexResponds(explicit)) return explicit;

  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const home = process.env.HOME || '';
  const candidates = [
    '/Applications/Codex.app/Contents/Resources/codex',
    ...dirs.map((d) => path.join(d, 'codex')),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    home ? path.join(home, '.local/bin/codex') : '',
    home ? path.join(home, '.npm-global/bin/codex') : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (executable(candidate) && codexResponds(candidate)) return candidate;
  }
  return null;
}

/**
 * Staged readiness check. The free lane works only when Codex is installed, the
 * user is logged in, AND `codex features list` reports both `image_generation`
 * and `imagegenext` (the exec image-artifact extension, Codex CLI >=0.141).
 * Without `imagegenext`, `codex exec` claims success but emits no PNG.
 */
/** Run a short codex subcommand, merging stdout+stderr — codex writes
 *  `login status` to STDERR, so reading only stdout misses "Logged in". */
function runCodex(bin: string, args: string[]): { code: number; out: string } {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 8000 });
    return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') };
  } catch {
    return { code: 1, out: '' };
  }
}

function computeCodexState(): { status: CodexStatus; bin: string | null } {
  const bin = locateCodex();
  if (!bin) return { status: 'no-cli', bin: null };

  const login = runCodex(bin, ['login', 'status']);
  if (login.code !== 0 || !/logged in/i.test(login.out)) return { status: 'logged-out', bin };

  const feats = runCodex(bin, ['features', 'list']);
  // Require `image_generation` (older Codex lacks it entirely). Do NOT require
  // `imagegenext`: it's an under-development feature that `features list` doesn't
  // print even though `exec --enable imagegenext` accepts it, so requiring it
  // here marked every Codex install as unusable. Whether the account is actually
  // entitled to render (no HTTP 403) can't be known until a render is attempted —
  // that surfaces as a clear generation error.
  if (feats.code !== 0 || !feats.out.toLowerCase().includes('image_generation')) {
    return { status: 'needs-update', bin };
  }
  return { status: 'ok', bin };
}

let _codexState: { status: CodexStatus; bin: string | null } | undefined;
let _codexStateAt = 0;
function getCodexState(): { status: CodexStatus; bin: string | null } {
  const now = Date.now();
  if (_codexState !== undefined && now - _codexStateAt < CLI_CACHE_MS) return _codexState;
  _codexState = computeCodexState();
  _codexStateAt = now;
  return _codexState;
}

/** Path to a fully-usable Codex CLI (image artifacts work), else null. */
export function getCodexCliPath(): string | null {
  const s = getCodexState();
  return s.status === 'ok' ? s.bin : null;
}

/** Granular reason the Codex lane is / isn't usable (for the Settings hint). */
export function getCodexStatus(): CodexStatus {
  return getCodexState().status;
}

/** True when the Codex CLI is fully usable for the free, no-API-key lane. */
export function codexAvailable(): boolean {
  return getCodexState().status === 'ok';
}

/** Locate the Gemini CLI. GUI apps often need explicit Homebrew/user-local paths. */
function computeGeminiCliPath(): string | null {
  const explicit = process.env.GEMINI_BIN?.trim();
  if (explicit && usableGemini(explicit)) return explicit;

  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const home = process.env.HOME || '';
  const candidates = [
    ...dirs.map((d) => path.join(d, 'gemini')),
    '/opt/homebrew/bin/gemini',
    '/usr/local/bin/gemini',
    home ? path.join(home, '.local/bin/gemini') : '',
    home ? path.join(home, '.npm-global/bin/gemini') : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (usableGemini(candidate)) return candidate;
  }
  return null;
}

export const getGeminiCliPath = cachedPath(computeGeminiCliPath);

/** True when the Gemini CLI is available — another no-API-key lane. */
export function geminiAvailable(): boolean {
  return getGeminiCliPath() !== null;
}

// ---------------------------------------------------------------------------
// Unified image-settings schema (RFC #2)
//
// A single source of truth that cleanly separates what the user CHOOSES
// (PersistedImageSettings — writable, round-trips) from probed FACTS
// (ImageDerivedFacts — read-only, recomputed). The getters/setters above
// remain as the internal implementation; callers should prefer this facade.
//
// saveImageSettings() is a WHOLE-OBJECT write: there is no per-field
// conditional, so clearing the model or text-model field persists an empty
// string (which load resolves back to the default) instead of being silently
// skipped — structurally preventing the persisted-vs-displayed divergence bug.
// ---------------------------------------------------------------------------

/** What the user chooses. Persisted to prefs.json; round-trips writably. */
export interface PersistedImageSettings {
  backend: string; // 'auto' | 'openrouter' | 'openai' | 'codex' | 'gemini' | 'mock'
  /** OpenRouter image model; '' means "use the default". load() returns resolved. */
  openRouterModel: string;
  /** Shot-list text model; '' means "use the default". load() returns resolved. */
  textModel: string;
  freeBackendPreference: 'codex' | 'gemini';
}

/** Probed/computed facts. Never written by the UI; recomputed on read. */
export interface ImageDerivedFacts {
  codexAvailable: boolean;
  codexStatus: CodexStatus;
  geminiAvailable: boolean;
  hasKey: boolean;
}

/** User choices, with each field's prefs→env→default chain already applied. */
export function loadImageSettings(): PersistedImageSettings {
  return {
    backend: getBackendSetting(),
    openRouterModel: getOpenRouterModel(),
    textModel: getTextModel(),
    freeBackendPreference: getFreeBackendPreference(),
  };
}

/** Whole-object write. Empty model/textModel clears the override (→ default). */
export function saveImageSettings(next: PersistedImageSettings): boolean {
  setBackendSetting(next.backend || 'auto');
  setOpenRouterModel(next.openRouterModel ?? '');
  setTextModel(next.textModel ?? '');
  setFreeBackendPreference(next.freeBackendPreference);
  return prefs.persist();
}

/** Live probe of CLI/key facts (cached internally). Read-only — no setter. */
export function imageDerivedFacts(): ImageDerivedFacts {
  return {
    codexAvailable: codexAvailable(),
    codexStatus: getCodexStatus(),
    geminiAvailable: geminiAvailable(),
    hasKey: hasApiKeyInPrefs(),
  };
}
