import express from 'express';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApiClient } from '@twurple/api';
import { AppTokenAuthProvider, exchangeCode } from '@twurple/auth';
import { storeUserTokens, getUserByOverlayToken } from './storage.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server-side environment variables (more secure for OAuth)
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'https://stream-staging.touco.top/auth/callback';
const ALLOWED_USERS = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : ['toucotop', 'silmassan'];

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
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes are working!', timestamp: new Date().toISOString() });
});

/**
 * GET /auth/twitch
 * Redirect user to Twitch OAuth authorization
 */
router.get('/twitch', (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).json({ 
      error: 'OAuth not configured', 
      message: 'Missing TWITCH_CLIENT_ID environment variable' 
    });
  }

  // Generate random state for security
  const state = randomUUID();
  req.session.oauthState = state;

  const scopes = [
    'user:read:email',          // Get user info
    'moderator:read:followers', // Read follower data
    'channel:read:subscriptions' // Read subscriber data
  ];

  const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes.join(' '))}&` +
    `state=${state}`;

  console.log(`🔄 Starting OAuth flow for state: ${state}`);
  res.redirect(authUrl);
});

/**
 * GET /auth/callback
 * Handle Twitch OAuth callback
 */
router.get('/callback', async (req, res) => {
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
    
    // Serve auth error page
    try {
      const errorHtml = readFileSync(path.join(__dirname, 'static-views', 'auth-error.html'), 'utf-8');
      return res.status(400).send(errorHtml);
    } catch (error) {
      console.error('Failed to read auth error page:', error);
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'OAuth state mismatch - this can happen if cookies are disabled or the session expired' 
      });
    }
  }

  if (!code) {
    console.error('❌ Missing authorization code');
    return res.status(400).json({ 
      error: 'Missing code', 
      message: 'No authorization code received' 
    });
  }

  try {
    console.log('🔄 Exchanging code for tokens...');
    
    // Exchange authorization code for access token
    const tokenData = await exchangeCode(CLIENT_ID, CLIENT_SECRET, code, REDIRECT_URI);
    
    // Create API client to get user info
    const authProvider = new AppTokenAuthProvider(CLIENT_ID, CLIENT_SECRET);
    const apiClient = new ApiClient({ authProvider });
    
    // Get user information
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Client-Id': CLIENT_ID
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch user info: ${userResponse.status}`);
    }

    const userData = await userResponse.json();
    const user = userData.data[0];
    
    if (!user) {
      throw new Error('No user data returned from Twitch API');
    }

    const username = user.login.toLowerCase();
    console.log(`👤 User authenticated: ${username} (${user.display_name})`);

    // Check if user is allowed
    if (!ALLOWED_USERS.includes(username)) {
      console.error(`❌ User not authorized: ${username}`);
      
      // Serve access denied page
      try {
        const accessDeniedHtml = readFileSync(path.join(__dirname, 'static-views', 'access-denied.html'), 'utf-8');
        const personalizedHtml = accessDeniedHtml.replace('{{USERNAME}}', username);
        return res.status(403).send(personalizedHtml);
      } catch (error) {
        console.error('Failed to read access denied page:', error);
        return res.status(403).json({ 
          error: 'Access denied', 
          message: `User '${username}' is not authorized to use this overlay system.` 
        });
      }
    }

    // Generate unique overlay token for OBS
    const overlayToken = `overlay_${username}_${randomUUID().slice(0, 8)}`;

    // Store user tokens
    const expiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000));
    storeUserTokens(username, {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken || null,
      overlayToken,
      expiresAt: expiresAt.toISOString(),
      twitchUserId: user.id,
      displayName: user.display_name
    });

    // Store success data in session for display on root page
    req.session.authSuccess = {
      displayName: user.display_name,
      overlayToken,
      username
    };

    console.log(`✅ OAuth completed for ${username}, overlay token: ${overlayToken}`);
    
    // Redirect to root page which will show success page
    res.redirect('/');

  } catch (error) {
    console.error('❌ OAuth callback error:', error);
    res.status(500).json({ 
      error: 'Authentication failed', 
      message: error.message 
    });
  }
});

/**
 * GET /auth/status
 * Check authentication status (for admin/debugging)
 */
router.get('/status', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.json({ 
      authenticated: false, 
      message: 'No token provided' 
    });
  }

  // Find user by overlay token
  const userData = getUserByOverlayToken(token);
  
  if (!userData) {
    return res.json({ 
      authenticated: false, 
      message: 'Invalid or expired token' 
    });
  }

  res.json({
    authenticated: true,
    username: userData.username,
    displayName: userData.displayName,
    expiresAt: userData.expiresAt
  });
});

export default router;