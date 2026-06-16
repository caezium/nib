import { prefs } from '@mobrowser/api';
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

export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash-image';

/** A short list of known OpenRouter image-output models (the field is editable). */
export const SUGGESTED_MODELS = ['google/gemini-2.5-flash-image'];

/** "auto" | "openrouter" | "openai" | "codex" | "mock". Default "auto". */
export function getBackendSetting(): string {
  return prefs.getString(BACKEND_KEY).trim() || 'auto';
}

export function setBackendSetting(value: string): boolean {
  prefs.setString(BACKEND_KEY, value.trim());
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

/** True when the Codex CLI is on PATH — the free, no-API-key lane is usable. */
export function codexAvailable(): boolean {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  return dirs.some((d) => {
    try {
      return d.length > 0 && fs.existsSync(path.join(d, 'codex'));
    } catch {
      return false;
    }
  });
}
