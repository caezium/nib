import { prefs } from '@mobrowser/api';

/**
 * The avatar is the persistent reference character fed into every generation,
 * stored as base64 in application preferences (prefs.json).
 */
const AVATAR_B64_KEY = 'avatar.imageB64';
const AVATAR_MIME_KEY = 'avatar.mime';
const AVATAR_SPEC_KEY = 'avatar.spec';

/** True when an avatar has been saved. */
export function hasAvatar(): boolean {
  return prefs.getString(AVATAR_B64_KEY).trim().length > 0;
}

/** Stored avatar bytes as base64 (no data URL prefix); empty when none saved. */
export function getAvatarB64(): string {
  return prefs.getString(AVATAR_B64_KEY).trim();
}

/** Stored avatar MIME type; defaults to image/png. */
export function getAvatarMime(): string {
  return prefs.getString(AVATAR_MIME_KEY).trim() || 'image/png';
}

/** Persist the avatar. Returns false if preferences could not be written. */
export function setAvatar(imageB64: string, mime: string): boolean {
  prefs.setString(AVATAR_B64_KEY, imageB64.trim());
  prefs.setString(AVATAR_MIME_KEY, (mime || 'image/png').trim());
  return prefs.persist();
}

/**
 * Optional written description of the character (silhouette, face, the one accent
 * part). Folded into every prompt to lock the design tighter than the image alone.
 */
export function getAvatarSpec(): string {
  return prefs.getString(AVATAR_SPEC_KEY).trim();
}

export function setAvatarSpec(spec: string): boolean {
  prefs.setString(AVATAR_SPEC_KEY, spec.trim());
  return prefs.persist();
}
