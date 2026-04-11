import express, { type Request, type Response, Router } from 'express';
import { randomUUID } from 'crypto';
import { exchangeCode, type AccessToken } from '@twurple/auth';
import { storeUserTokens, getUserByOverlayToken, getUserTokens } from './storage.js';

// Extend Express Session interface for OAuth state
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
  }
}

// Type definitions for Twitch API responses
interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  email?: string;
  created_at: string;
}

interface TwitchUsersResponse {
  data: TwitchUser[];
}

interface AuthStatusResponse {
  authenticated: boolean;
  message?: string;
  username?: string;
  displayName?: string;
  expiresAt?: string;
}

const router: Router = express.Router();

// Server-side environment variables (more secure for OAuth)
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'https://stream-staging.touco.top/auth/callback';
const ALLOWED_USERS: string[] = process.env.ALLOWED_USERS 
  ? process.env.ALLOWED_USERS.split(',').map(u => u.trim().toLowerCase()).filter(Boolean)
  : [];

// Validate required environment variables at startup
if (process.env.NODE_ENV === 'production') {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set in production');
  }
}

console.log('🔧 OAuth Configuration:');
console.log(`   Client ID: ${CLIENT_ID ? 'Configured ✅' : 'Missing ❌'}`);
console.log(`   Redirect URI: ${REDIRECT_URI}`);
console.log(`   Allowed Users: ${ALLOWED_USERS.join(', ')}`);
if (process.env.NODE_ENV !== 'production') {
  console.log(`   Environment ALLOWED_USERS: ${process.env.ALLOWED_USERS || 'Not set'}`);
}
console.log('🛠️ Auth routes registered: /auth/twitch, /auth/callback, /auth/status');

/**
 * GET /auth/test
 * Simple test endpoint
 */
router.get('/test', (_req: Request, res: Response) => {
  res.json({ message: 'Auth routes are working!', timestamp: new Date().toISOString() });
});

/**
 * GET /auth/twitch
 * Redirect user to Twitch OAuth authorization
 */
router.get('/twitch', (req: Request, res: Response) => {
  if (!CLIENT_ID) {
    return res.status(500).json({ 
      error: 'OAuth not configured', 
      message: 'Missing TWITCH_CLIENT_ID environment variable' 
    });
  }

  if (!CLIENT_SECRET) {
    return res.status(500).json({ 
      error: 'OAuth not configured', 
      message: 'Missing TWITCH_CLIENT_SECRET environment variable' 
    });
  }

  // Generate random state for security
  const state = randomUUID();
  req.session.oauthState = state;

  const scopes: string[] = [
    // Core user data
    'user:read:email',              // Get user info and email
    
    // Community data
    'moderator:read:followers',     // Read follower data
    'channel:read:subscriptions',   // Read subscriber data
    'moderator:read:chatters',      // Read active chat members
    'moderation:read',              // Read moderator list
    'channel:read:vips',            // Read VIP users
    
    // Interactive features
    'channel:read:polls',           // Read active polls
    'channel:read:predictions',     // Read predictions
    'channel:read:redemptions',     // Read channel point rewards/redemptions  
    'channel:read:goals',           // Read creator goals
    'channel:read:hype_train',      // Read hype train status
    
    // Additional features
    'bits:read'                     // Read bits leaderboard
  ];

  const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes.join(' '))}&` +
    `state=${state}`;

  console.log(`🔄 Starting OAuth flow for state: ${state}`);
  res.redirect(authUrl);
  return;
});

/**
 * GET /auth/callback
 * Handle Twitch OAuth callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (process.env.NODE_ENV !== 'production') {
    console.log('🔍 OAuth callback - state validation');
  }

  // Check for OAuth errors
  if (error) {
    console.error('❌ OAuth error:', error);
    return res.status(400).json({ 
      error: 'OAuth failed', 
      message: `Twitch OAuth error: ${error}` 
    });
  }

  // Validate state parameter
  if (!req.session?.oauthState || state !== req.session.oauthState) {
    console.error('❌ OAuth state validation failed');
    if (process.env.NODE_ENV !== 'production') {
      console.log('  - Expected:', req.session?.oauthState);
      console.log('  - Received:', state);    
    }
    
    // Redirect to auth error page
    return res.redirect('/auth/error');
  }

  if (!code || typeof code !== 'string') {
    console.error('❌ Missing authorization code');
    return res.status(400).json({ 
      error: 'Missing code', 
      message: 'No authorization code received' 
    });
  }

  try {
    console.log('🔄 Exchanging code for tokens...');
    
    // Exchange authorization code for access token
    const tokenData: AccessToken = await exchangeCode(CLIENT_ID!, CLIENT_SECRET!, code, REDIRECT_URI);
    
    // Get user information
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Client-Id': CLIENT_ID!
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch user info: ${userResponse.status}`);
    }

    const userData = await userResponse.json() as TwitchUsersResponse;
    const user = userData.data[0];
    
    if (!user) {
      throw new Error('No user data returned from Twitch API');
    }

    const username = user.login.toLowerCase();
    console.log(`👤 User authenticated: ${username} (${user.display_name})`);

    // Check if user is allowed
    if (!ALLOWED_USERS.includes(username)) {
      console.error(`❌ User not authorized: ${username}`);
      
      // Redirect to access denied page
      return res.redirect(`/auth/denied?username=${encodeURIComponent(username)}`);
    }

    // Reuse the existing overlay token so OBS source URLs remain valid after re-auth.
    // Only generate a new one if this user has never authenticated before.
    const existingUser = getUserTokens(username);
    const overlayToken = existingUser?.overlayToken ?? `overlay_${username}_${randomUUID().slice(0, 8)}`;

    // Store user tokens
    const expiresAt = new Date(Date.now() + ((tokenData.expiresIn || 3600) * 1000));
    storeUserTokens(username, {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken || '',
      overlayToken,
      expiresAt: expiresAt.toISOString(),
      twitchUserId: user.id,
      displayName: user.display_name
    });

    console.log(`✅ OAuth completed for ${username}`);

    // Redirect to React success page with only the token.
    // displayName and expiresAt are intentionally omitted: AuthSuccessPage fetches
    // them from /auth/status, avoiding a race where RequireToken (parent component)
    // re-adds stripped params back to the URL after AuthSuccessPage clears them.
    res.redirect(`/auth/success?token=${encodeURIComponent(overlayToken)}`);
    return;

  } catch (error) {
    console.error('❌ OAuth callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Authentication failed', 
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : errorMessage
    });
    return;
  }
});

/**
 * GET /auth/status
 * Check authentication status (for admin/debugging)
 */
router.get('/status', (req: Request, res: Response) => {
  const { token } = req.query;
  
  if (!token || typeof token !== 'string') {
    return res.json({ 
      authenticated: false, 
      message: 'No token provided' 
    } as AuthStatusResponse);
  }

  // Find user by overlay token
  const userData = getUserByOverlayToken(token);
  
  if (!userData) {
    return res.json({ 
      authenticated: false, 
      message: 'Invalid or expired token' 
    } as AuthStatusResponse);
  }

  res.json({
    authenticated: true,
    username: userData.username,
    displayName: userData.displayName,
    expiresAt: userData.overlayExpiresAt
  } as AuthStatusResponse);
  return;
});

export default router;