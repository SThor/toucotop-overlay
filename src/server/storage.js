import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token storage directory (will be a Docker volume in production)
const TOKENS_DIR = path.join(__dirname, '../../tokens');

// Ensure tokens directory exists
if (!fs.existsSync(TOKENS_DIR)) {
  fs.mkdirSync(TOKENS_DIR, { recursive: true });
}

/**
 * Store user's Twitch tokens and overlay token
 * @param {string} username - Twitch username
 * @param {Object} tokenData - Token information
 * @param {string} tokenData.accessToken - Twitch access token
 * @param {string} tokenData.refreshToken - Twitch refresh token
 * @param {string} tokenData.overlayToken - Generated overlay token for OBS
 * @param {Date} tokenData.expiresAt - Token expiration
 */
export function storeUserTokens(username, tokenData) {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  const data = {
    ...tokenData,
    username,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2));
  console.log(`✅ Stored tokens for user: ${username}`);
}

/**
 * Get user's stored tokens
 * @param {string} username - Twitch username
 * @returns {Object|null} Token data or null if not found
 */
export function getUserTokens(username) {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  
  if (!fs.existsSync(tokenFile)) {
    return null;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    
    // Check if token is expired
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      console.log(`⚠️ Token expired for user: ${username}`);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Error reading tokens for ${username}:`, error);
    return null;
  }
}

/**
 * Get user by overlay token
 * @param {string} overlayToken - Overlay token from URL parameter
 * @returns {Object|null} User data or null if token not found
 */
export function getUserByOverlayToken(overlayToken) {
  if (!overlayToken) return null;
  
  try {
    const tokenFiles = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of tokenFiles) {
      const filePath = path.join(TOKENS_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (data.overlayToken === overlayToken) {
        // Check if token is expired
        if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
          console.log(`⚠️ Expired token used: ${overlayToken}`);
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

/**
 * Remove user's tokens (logout)
 * @param {string} username - Twitch username
 */
export function removeUserTokens(username) {
  const tokenFile = path.join(TOKENS_DIR, `${username}.json`);
  
  if (fs.existsSync(tokenFile)) {
    fs.unlinkSync(tokenFile);
    console.log(`🗑️ Removed tokens for user: ${username}`);
  }
}

/**
 * List all authenticated users
 * @returns {Array} Array of usernames
 */
export function listAuthenticatedUsers() {
  try {
    const tokenFiles = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json'));
    return tokenFiles.map(f => f.replace('.json', ''));
  } catch (error) {
    console.error('❌ Error listing users:', error);
    return [];
  }
}