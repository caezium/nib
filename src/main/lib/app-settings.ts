import { prefs } from '@mobrowser/api';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * User-chosen image-generation settings (persisted in prefs.json):
 *   - backend: which lane to generate on
 *   - openrouter model: the model used on the OpenRouter lane
 *
 * The avatar's written spec lives in avatar-store.ts alongside the avatar image.
 */
const BACKEND_KEY = 'image.backend';
const MODEL_KEY = 'image.openrouterModel';
const FREE_BACKEND_PREFERENCE_KEY = 'image.freeBackendPreference';

export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3.1-flash-image-preview';

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

function executable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function usableCodex(p: string): boolean {
  if (!executable(p)) return false;

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

/**
 * Locate the Codex CLI. macOS GUI apps often do not inherit the user's shell
 * PATH, so also check the app bundle plus common Homebrew/user-local installs.
 */
export function getCodexCliPath(): string | null {
  const explicit = process.env.CODEX_BIN?.trim();
  if (explicit && usableCodex(explicit)) return explicit;

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
    if (usableCodex(candidate)) return candidate;
  }
  return null;
}

/** True when the Codex CLI is available — the free, no-API-key lane is usable. */
export function codexAvailable(): boolean {
  return getCodexCliPath() !== null;
}

/** Locate the Gemini CLI. GUI apps often need explicit Homebrew/user-local paths. */
export function getGeminiCliPath(): string | null {
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

/** True when the Gemini CLI is available — another no-API-key lane. */
export function geminiAvailable(): boolean {
  return getGeminiCliPath() !== null;
}
