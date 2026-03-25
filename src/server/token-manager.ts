/**
 * Token Manager
 * Enhanced token operations with automatic refresh capabilities
 */

import { refreshUserToken } from '@twurple/auth';
import * as storage from './storage.js';
import type { UserData } from './twitch-api-client.js';

// Type definitions for token manager
export interface RefreshTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string[];
}

export interface TokenExpirationInfo {
  accessToken: {
    expiresAt: string | null;
    expired: boolean;
    canRefresh: boolean;
  };
  overlayToken: {
    expiresAt: string | null;
    expired: boolean;
  };
}

export interface ApiCallFunction {
  (userData: UserData): Promise<any>;
}

/**
 * Enhanced token manager with automatic refresh capability
 */
export class TokenManager {
  private refreshPromises: Map<string, Promise<storage.StoredUserData | null>>;

  constructor() {
    this.refreshPromises = new Map(); // Prevent concurrent refresh attempts
  }

  /**
   * Store user tokens (delegates to existing storage)
   */
  storeUserTokens(username: string, tokenData: storage.TokenData): void {
    return storage.storeUserTokens(username, tokenData);
  }

  /**
   * Get user tokens with optional automatic refresh
   */
  async getUserTokens(username: string, autoRefresh: boolean = false): Promise<storage.StoredUserData | null> {
    const userData = storage.getUserTokens(username);
    
    if (!userData) {
      return null;
    }

    // If token is not expired, return as-is
    if (!userData.expiresAt || new Date(userData.expiresAt) > new Date()) {
      return userData;
    }

    // If expired and auto-refresh requested, try to refresh
    if (autoRefresh && userData.refreshToken) {
      console.log(`🔄 Attempting automatic token refresh for user: ${username}`);
      return await this.refreshUserTokens(username);
    }

    // Return expired token data (caller can decide what to do)
    return userData;
  }

  /**
   * Get user by overlay token (delegates to existing storage)
   */
  getUserByOverlayToken(overlayToken: string): storage.StoredUserData | null {
    return storage.getUserByOverlayToken(overlayToken);
  }

  /**
   * Get user by overlay token with automatic access token refresh
   */
  async getUserByOverlayTokenWithRefresh(overlayToken: string): Promise<storage.StoredUserData | null> {
    const userData = this.getUserByOverlayToken(overlayToken);
    
    if (!userData) {
      return null;
    }

    // Check if access token is expired (overlay token is still valid)
    if (userData.expiresAt && new Date(userData.expiresAt) <= new Date()) {
      console.log(`🔄 Access token expired for overlay user, attempting refresh: ${userData.username}`);
      
      const refreshedData = await this.refreshUserTokens(userData.username);
      return refreshedData; // Will be null if refresh failed
    }

    return userData;
  }

  /**
   * Refresh user's access token using refresh token
   */
  async refreshUserTokens(username: string): Promise<storage.StoredUserData | null> {
    // Prevent concurrent refresh attempts for the same user
    if (this.refreshPromises.has(username)) {
      return await this.refreshPromises.get(username)!;
    }

    const refreshPromise = this._performTokenRefresh(username);
    this.refreshPromises.set(username, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      this.refreshPromises.delete(username);
    }
  }

  /**
   * Internal method to perform token refresh
   */
  private async _performTokenRefresh(username: string): Promise<storage.StoredUserData | null> {
    try {
      const userData = storage.getUserTokens(username);
      
      if (!userData || !userData.refreshToken) {
        console.error(`❌ No refresh token available for user: ${username}`);
        return null;
      }

      console.log(`🔄 Refreshing access token for user: ${username}`);

      // Use @twurple/auth to refresh the token
      const newTokenData = await refreshUserToken(
        process.env.TWITCH_CLIENT_ID || '',
        process.env.TWITCH_CLIENT_SECRET || '',
        userData.refreshToken
      );
      
      // Update stored tokens with new access token
      const updatedData: storage.StoredUserData = {
        ...userData,
        accessToken: newTokenData.accessToken,
        refreshToken: newTokenData.refreshToken || userData.refreshToken, // Keep old if not provided
        expiresAt: newTokenData.expiresIn
          ? new Date(Date.now() + newTokenData.expiresIn * 1000).toISOString()
          : userData.expiresAt,
        updatedAt: new Date().toISOString()
      };

      // Store updated tokens
      this.storeUserTokens(username, updatedData);

      // Read back what was actually persisted to ensure returned data matches storage
      const storedData = storage.getUserTokens(username) || updatedData;
      
      console.log(`✅ Successfully refreshed token for user: ${username}`);
      return storedData;

    } catch (error) {
      console.error(`❌ Failed to refresh token for user ${username}:`, error);
      
      // If refresh fails due to invalid refresh token, we might need to clear the user data
      if (error instanceof Error && error.message && error.message.includes('invalid_grant')) {
        console.warn(`⚠️ Invalid refresh token for ${username}, user needs to re-authenticate`);
      }
      
      return null;
    }
  }

  /**
   * Attempt API call with automatic token refresh on 401 errors
   */
  async apiCallWithRefresh(
    username: string, 
    apiCallFn: ApiCallFunction, 
    maxRetries: number = 1
  ): Promise<any | null> {
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const userData = await this.getUserTokens(username, attempt > 0);
        
        if (!userData) {
          console.error(`❌ No valid token for user: ${username}`);
          return null;
        }

        // Attempt the API call
        const result = await apiCallFn(userData);
        
        // If successful, return result
        if (result !== null) {
          return result;
        }

        // If this was already a retry, give up
        if (attempt >= maxRetries) {
          console.error(`❌ API call failed after ${maxRetries} refresh attempts for user: ${username}`);
          return null;
        }

        // Try refreshing the token for next attempt
        console.log(`🔄 API call failed, attempting token refresh for user: ${username}`);
        attempt++;

      } catch (error) {
        console.error(`❌ API call with refresh failed for user ${username}:`, error);
        return null;
      }
    }

    return null;
  }

  /**
   * Remove user tokens (delegates to existing storage)
   */
  removeUserTokens(username: string): void {
    return storage.removeUserTokens(username);
  }

  /**
   * List authenticated users (delegates to existing storage)
   */
  listAuthenticatedUsers(): string[] {
    return storage.listAuthenticatedUsers();
  }

  /**
   * Check if user's access token is expired
   */
  isUserTokenExpired(username: string): boolean {
    const userData = storage.getUserTokens(username);
    
    if (!userData || !userData.expiresAt) {
      return true; // Assume expired if no expiration info
    }

    return new Date(userData.expiresAt) <= new Date();
  }

  /**
   * Get token expiration info for user
   */
  getTokenExpirationInfo(username: string): TokenExpirationInfo | null {
    const userData = storage.getUserTokens(username);
    
    if (!userData) {
      return null;
    }

    const accessTokenExpired = userData.expiresAt ? 
      new Date(userData.expiresAt) <= new Date() : true;
    
    const overlayTokenExpired = userData.overlayExpiresAt ? 
      new Date(userData.overlayExpiresAt) <= new Date() : true;

    return {
      accessToken: {
        expiresAt: userData.expiresAt,
        expired: accessTokenExpired,
        canRefresh: !!userData.refreshToken
      },
      overlayToken: {
        expiresAt: userData.overlayExpiresAt,
        expired: overlayTokenExpired
      }
    };
  }
}

// Create singleton instance
const defaultTokenManager = new TokenManager();

// Export both the class and default instance
export {
  defaultTokenManager
};

// Re-export storage functions for backward compatibility
export {
  storeUserTokens,
  getUserTokens,
  getUserByOverlayToken,
  removeUserTokens,
  listAuthenticatedUsers
} from './storage.js';