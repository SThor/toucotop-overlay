/**
 * Twitch API Client
 * HTTP interface for Twitch API calls with error handling
 */

import type { Response } from 'express';

// Type definitions for our data structures
export interface UserData {
  username: string;
  accessToken: string;
  refreshToken: string;
  overlayToken: string;
  twitchUserId: string;
  displayName: string;
  expiresAt: string;
  overlayExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TwitchApiResponse {
  data?: any[];
  error?: string;
  message?: string;
  [key: string]: any;
}

export interface ApiHeaders {
  [key: string]: string | undefined;
}

/**
 * Handles Twitch API response with proper status forwarding
 */
async function handleTwitchResponse(twitchResponse: globalThis.Response, res: Response): Promise<TwitchApiResponse | null> {
  const data = await twitchResponse.json() as TwitchApiResponse;
  
  if (twitchResponse.ok) {
    return data;
  } else {
    // Forward the Twitch error status to the client
    res.status(twitchResponse.status).json(data);
    return null; // Indicates error was handled
  }
}

/**
 * Makes authenticated Twitch API call with consistent error handling
 */
async function makeTwitchApiCall(
  url: string, 
  headers: ApiHeaders, 
  res: Response, 
  errorMessage: string = 'API request failed'
): Promise<TwitchApiResponse | null> {
  try {
    const response = await fetch(url, { headers: headers as any });
    const data = await handleTwitchResponse(response, res);
    if (data === null) return null; // Error already handled
    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage, details: errorMsg });
    return null;
  }
}

/**
 * Builds standard Twitch API headers for authenticated requests
 * Validates TWITCH_CLIENT_ID to prevent runtime errors
 */
function buildTwitchHeaders(userData: UserData): Record<string, string> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  
  if (!clientId) {
    throw new Error('TWITCH_CLIENT_ID environment variable is not set');
  }
  
  // Validate that client ID is not empty string
  if (clientId.trim() === '') {
    throw new Error('TWITCH_CLIENT_ID cannot be empty');
  }
  
  return {
    'Authorization': `Bearer ${userData.accessToken}`,
    'Client-Id': clientId.trim()
  };
}

/**
 * Builds OAuth validation headers for token validation
 */
function buildOAuthHeaders(userData: UserData): ApiHeaders {
  return {
    'Authorization': `OAuth ${userData.accessToken}`
  };
}

/**
 * Builds Twitch API URL with query parameters
 */
function buildApiUrl(baseUrl: string, params: Record<string, string | number | boolean> = {}): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  return url.toString();
}

export {
  handleTwitchResponse,
  makeTwitchApiCall,
  buildTwitchHeaders,
  buildOAuthHeaders,
  buildApiUrl
};