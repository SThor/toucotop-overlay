import express from 'express';
import { randomUUID } from 'crypto';
import { ApiClient } from '@twurple/api';
import { AppTokenAuthProvider, exchangeCode } from '@twurple/auth';
import { storeUserTokens, getUserTokens } from './storage.js';

const router = express.Router();

// Server-side environment variables (more secure for OAuth)
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'https://stream-staging.touco.top/auth/callback';
const ALLOWED_USERS = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : ['toucotop', 'sthor'];

console.log('🔧 OAuth Configuration:');
console.log(`   Client ID: ${CLIENT_ID ? 'Configured ✅' : 'Missing ❌'}`);
console.log(`   Redirect URI: ${REDIRECT_URI}`);
console.log(`   Allowed Users: ${ALLOWED_USERS.join(', ')}`);
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

  console.log('🔐 OAuth initiation debug:');
  console.log('  - Generated state:', state);
  console.log('  - Session ID:', req.sessionID);
  console.log('  - State stored in session:', req.session.oauthState);

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

  console.log(`🔄 Redirecting to Twitch OAuth: ${authUrl}`);
  res.redirect(authUrl);
});

/**
 * GET /auth/callback
 * Handle Twitch OAuth callback
 */
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  console.log('🔍 OAuth callback debug:');
  console.log('  - Received state:', state);
  console.log('  - Session state:', req.session?.oauthState);
  console.log('  - Session ID:', req.sessionID);
  console.log('  - Has session:', !!req.session);

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
    console.error('❌ Invalid OAuth state');
    console.log('  - Expected:', req.session?.oauthState);
    console.log('  - Received:', state);
    return res.status(400).json({ 
      error: 'Invalid request', 
      message: 'OAuth state mismatch - this can happen if cookies are disabled or the session expired' 
    });
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
      console.error(`❌ User not in allowlist: ${username}`);
      return res.status(403).json({ 
        error: 'Access denied', 
        message: `User '${username}' is not authorized to use this overlay system.` 
      });
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

    // Return success page with overlay token
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Success - Toucotop Overlay</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: system-ui, sans-serif; 
              max-width: 600px; 
              margin: 50px auto; 
              padding: 20px;
              background: #1f0f01;
              color: #ffebdb;
            }
            .success { 
              background: rgba(229, 109, 12, 0.1); 
              border: 1px solid #e56d0c; 
              padding: 20px; 
              border-radius: 8px; 
              margin-bottom: 20px;
            }
            .token { 
              background: rgba(255, 255, 255, 0.05); 
              padding: 15px; 
              border-radius: 4px; 
              font-family: monospace; 
              font-size: 14px;
              word-break: break-all;
              margin: 10px 0;
            }
            .url { 
              background: rgba(255, 255, 255, 0.05); 
              padding: 15px; 
              border-radius: 4px; 
              font-family: monospace; 
              font-size: 12px;
              word-break: break-all;
            }
            button {
              background: #e56d0c;
              color: white;
              border: none;
              padding: 10px 15px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            }
            button:hover { background: #d1610b; }
          </style>
        </head>
        <body>
          <div class="success">
            <h2>✅ Authentication Successful!</h2>
            <p>Welcome, <strong>${user.display_name}</strong>! Your overlay is now connected to your Twitch account.</p>
          </div>
          
          <h3>🎯 Your Overlay Token</h3>
          <p>Use this token in OBS Browser Source URLs:</p>
          <div class="token" id="token">${overlayToken}</div>
          <button onclick="copyToken()">📋 Copy Token</button>
          
          <h3>📺 OBS Browser Source URLs</h3>
          <p><strong>Chat Overlay:</strong></p>
          <div class="url">${req.protocol}://${req.get('host')}/chat?token=${overlayToken}</div>
          
          <p><strong>Clock Overlay:</strong></p>
          <div class="url">${req.protocol}://${req.get('host')}/clock?token=${overlayToken}</div>
          
          <p><strong>Bar Overlay:</strong></p>
          <div class="url">${req.protocol}://${req.get('host')}/bar?token=${overlayToken}</div>
          
          <h3>📋 Next Steps</h3>
          <ol>
            <li>Copy one of the URLs above</li>
            <li>In OBS, add a Browser Source</li>
            <li>Paste the URL and set size (recommended: 1920x1080)</li>
            <li>Your overlay will now show real follower/subscriber data!</li>
          </ol>
          
          <script>
            function copyToken() {
              navigator.clipboard.writeText('${overlayToken}').then(() => {
                alert('Token copied to clipboard!');
              });
            }
          </script>
        </body>
      </html>
    `);

    console.log(`✅ OAuth completed for ${username}, overlay token: ${overlayToken}`);

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
  const userData = getUserTokens(token);
  
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