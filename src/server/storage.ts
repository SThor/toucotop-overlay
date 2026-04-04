import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token storage directory (will be a Docker volume in production)
const TOKENS_DIR = path.join(__dirname, '../../tokens');

import { defaultOverlaySettings, type OverlaySettings, type OverlayTheme } from './shared/overlaySettings.js';
export type { OverlaySettings, OverlayTheme };
export { defaultOverlaySettings };

// TokenData: the input shape — what the OAuth callback has available to pass into storeUserTokens().
// All auth-critical fields are required; housekeeping fields (username, timestamps, settings) are
// optional because they don't exist yet at the point of calling storeUserTokens().
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  overlayToken: string;
  twitchUserId: string;
  displayName: string;
  expiresAt: string;
  overlayExpiresAt?: string;
  overlaySettings?: OverlaySettings;
  username?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LastFollowerData {
  userId: string;
  userName: string;
  userDisplayName: string;
  followedAt: string; // ISO string
}

export interface LastSubscriberData {
  userId: string;
  userName: string;
  userDisplayName: string;
  tier: string;
  isGift: boolean;
  gifterName?: string;
  subscribedAt: string; // ISO string
}

// StoredUserData: the persisted shape — what you read back out of the JSON file.
// Extends TokenData with all optional fields made required, because storeUserTokens() fills them
// in (from existing data or fresh defaults) before writing. Code that reads a token file can
// therefore rely on every field being present.
export interface StoredUserData extends TokenData {
  username: string;
  createdAt: string;
  updatedAt: string;
  overlayExpiresAt: string;
  overlaySettings: OverlaySettings;
  lastFollower?: LastFollowerData;
  lastSubscriber?: LastSubscriberData;
}

// Ensure tokens directory exists with restrictive permissions
if (!fs.existsSync(TOKENS_DIR)) {
  fs.mkdirSync(TOKENS_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Store user's Twitch tokens and overlay token
 */
export function storeUserTokens(username: string, tokenData: TokenData): void {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  const now = new Date();
  
  // Check if user already exists to preserve overlay metadata
  const existingData = fs.existsSync(tokenFile) ? getUserTokens(username) : null;
  
  // Only preserve the existing overlayExpiresAt if the overlay token is unchanged and hasn't expired.
  // A new overlayToken always gets a fresh 24h lifetime.
  const existingOverlayExpiry = existingData?.overlayExpiresAt;
  const sameOverlayToken = tokenData.overlayToken === existingData?.overlayToken;
  const overlayStillValid = sameOverlayToken && !!existingOverlayExpiry && new Date(existingOverlayExpiry) > now;

  const data: StoredUserData = {
    ...tokenData,
    username,
    createdAt: existingData?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    overlayExpiresAt: overlayStillValid
      ? existingOverlayExpiry
      : new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    // Preserve existing settings; new users get defaults
    overlaySettings: existingData?.overlaySettings ?? { ...defaultOverlaySettings },
  };
  
  fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  console.log(`✅ Stored tokens for user: ${username}`);
}

/**
 * Get user's stored tokens
 */
export function getUserTokens(username: string): StoredUserData | null {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  
  if (!fs.existsSync(tokenFile)) {
    return null;
  }
  
  try {
    const data: StoredUserData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    
    // Check if access token is expired (but still return data for potential refresh)
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      console.log(`⚠️ Access token expired for user: ${username} (may need refresh)`);
      // Don't return null - let the caller decide if they need to refresh
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Error reading tokens for ${username}:`, error);
    return null;
  }
}

/**
 * Get user by overlay token
 */
export function getUserByOverlayToken(overlayToken: string): StoredUserData | null {
  if (!overlayToken) return null;
  
  try {
    const tokenFiles = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of tokenFiles) {
      const filePath = path.join(TOKENS_DIR, file);
      const data: StoredUserData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (data.overlayToken === overlayToken) {
        // Check if overlay token is expired (separate from access token)
        if (data.overlayExpiresAt && new Date(data.overlayExpiresAt) < new Date()) {
          console.log(`⚠️ Expired overlay token used`);
          return null;
        }
        
        return data;
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error finding user by overlay token:', error);
    return null;
  }
}

const OVERLAY_TOKEN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
// Only write if expiry would advance by more than this to avoid hammering disk
const EXTEND_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Extend the overlay token expiry by 24h from now (sliding window).
 * Only writes to disk if the remaining lifetime is below the threshold.
 */
export function extendOverlayToken(username: string): void {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  if (!fs.existsSync(tokenFile)) return;

  try {
    const data: StoredUserData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    const now = new Date();
    const newExpiry = new Date(now.getTime() + OVERLAY_TOKEN_WINDOW_MS);
    const currentExpiry = data.overlayExpiresAt ? new Date(data.overlayExpiresAt) : now;

    // Skip disk write if expiry is already far enough in the future
    if (currentExpiry.getTime() - now.getTime() > EXTEND_THRESHOLD_MS) return;

    data.overlayExpiresAt = newExpiry.toISOString();
    data.updatedAt = now.toISOString();
    fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (error) {
    console.error(`❌ Error extending overlay token for ${username}:`, error);
  }
}

/**
 * Update overlay settings for a user identified by username.
 * Returns the fully-merged persisted settings on success, or null on failure.
 */
export function updateUserSettings(username: string, settings: Partial<OverlaySettings>): OverlaySettings | null {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  if (!fs.existsSync(tokenFile)) return null;

  try {
    const data: StoredUserData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    const base = data.overlaySettings ?? defaultOverlaySettings;
    const merged: OverlaySettings = {
      ...defaultOverlaySettings,
      ...base,
      ...settings,
      perOverlayOpacity: {
        ...defaultOverlaySettings.perOverlayOpacity,
        ...(base.perOverlayOpacity ?? {}),
        ...(settings.perOverlayOpacity ?? {}),
      },
      perOverlayFontSize: {
        ...defaultOverlaySettings.perOverlayFontSize,
        ...(base.perOverlayFontSize ?? {}),
        ...(settings.perOverlayFontSize ?? {}),
      },
      themeSettings: {
        ...defaultOverlaySettings.themeSettings,
        ...(base.themeSettings ?? {}),
        ...(settings.themeSettings ?? {}),
        crt: {
          ...defaultOverlaySettings.themeSettings.crt,
          ...(base.themeSettings?.crt ?? {}),
          ...(settings.themeSettings?.crt ?? {}),
        },
      },
    };
    data.overlaySettings = merged;
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    return merged;
  } catch (error) {
    console.error(`❌ Error updating settings for ${username}:`, error);
    return null;
  }
}

/**
 * Update the last follower for a user.
 */
export function updateLastFollower(username: string, data: LastFollowerData): void {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  if (!fs.existsSync(tokenFile)) return;
  try {
    const stored: StoredUserData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    stored.lastFollower = data;
    stored.updatedAt = new Date().toISOString();
    fs.writeFileSync(tokenFile, JSON.stringify(stored, null, 2), { mode: 0o600 });
  } catch (error) {
    console.error(`❌ Error updating lastFollower for ${username}:`, error);
  }
}

/**
 * Update the last subscriber for a user.
 */
export function updateLastSubscriber(username: string, data: LastSubscriberData): void {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  if (!fs.existsSync(tokenFile)) return;
  try {
    const stored: StoredUserData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    stored.lastSubscriber = data;
    stored.updatedAt = new Date().toISOString();
    fs.writeFileSync(tokenFile, JSON.stringify(stored, null, 2), { mode: 0o600 });
  } catch (error) {
    console.error(`❌ Error updating lastSubscriber for ${username}:`, error);
  }
}

/**
 * Get persisted last follow/subscribe events for a user.
 */
export function getLastEvents(username: string): { lastFollower?: LastFollowerData; lastSubscriber?: LastSubscriberData } {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  if (!fs.existsSync(tokenFile)) return {};
  try {
    const stored: StoredUserData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    return {
      lastFollower: stored.lastFollower,
      lastSubscriber: stored.lastSubscriber,
    };
  } catch {
    return {};
  }
}

/**
 * Remove user's tokens (logout)
 */
export function removeUserTokens(username: string): void {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  
  if (fs.existsSync(tokenFile)) {
    fs.unlinkSync(tokenFile);
    console.log(`🗑️ Removed tokens for user: ${username}`);
  }
}

/**
 * List all authenticated users
 */
export function listAuthenticatedUsers(): string[] {
  try {
    const tokenFiles = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json'));
    return tokenFiles.map(f => f.replace('.json', ''));
  } catch (error) {
    console.error('❌ Error listing users:', error);
    return [];
  }
}