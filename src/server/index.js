import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import cors from 'cors';
import session from 'express-session';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// HTML escape function to prevent XSS in template replacements
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return String(unsafe);
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;") 
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const app = express();
const PORT = process.env.PORT || 3000;
const EVENTSUB_CALLBACK_URL = process.env.EVENTSUB_CALLBACK_URL;
const EVENTSUB_PUBLIC_BASE_URL = process.env.EVENTSUB_PUBLIC_BASE_URL;
const EVENTSUB_ALLOWED_HOSTS = (process.env.EVENTSUB_ALLOWED_HOSTS || '')
  .split(',')
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

// EventSub event storage (in-memory for now)
const eventStore = {
  events: [], // Array to store recent events
  maxEvents: 100, // Keep last 100 events
  
  addEvent(event) {
    this.events.unshift({
      ...event,
      timestamp: new Date().toISOString(),
      id: `${event.subscription.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }
    
    console.log(`📡 New EventSub event: ${event.subscription.type}`);
  },
  
  getEvents(limit = 50) {
    return this.events.slice(0, limit);
  },
  
  getEventsByType(type, limit = 20) {
    return this.events.filter(e => e.subscription.type === type).slice(0, limit);
  },
  
  clearEvents() {
    this.events = [];
  }
};

console.log('🚀 Starting server setup...');

// HMAC signature verification for EventSub webhooks
function verifyEventSubSignature(headers, body, secret) {
  const messageId = headers['twitch-eventsub-message-id'];
  const timestamp = headers['twitch-eventsub-message-timestamp'];
  const signature = headers['twitch-eventsub-message-signature'];
  
  if (!messageId || !timestamp || !signature) {
    console.warn('❌ Missing required EventSub headers');
    return false;
  }
  
  // Verify timestamp is recent (within 10 minutes)  
  const timestampMs = parseInt(timestamp);
  const now = Date.now();
  if (Math.abs(now - timestampMs) > 10 * 60 * 1000) {
    console.warn('❌ EventSub timestamp too old or in future');
    return false;
  }
  
  // Create HMAC signature
  const message = messageId + timestamp + body;
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('hex');
  
  // Compare signatures using timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );
}

function getEventSubWebhookUrl(req) {
  if (EVENTSUB_CALLBACK_URL) {
    return EVENTSUB_CALLBACK_URL;
  }

  if (EVENTSUB_PUBLIC_BASE_URL) {
    return `${EVENTSUB_PUBLIC_BASE_URL.replace(/\/+$/, '')}/webhooks/eventsub`;
  }

  // Fallback for local/dev environments only.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set EVENTSUB_CALLBACK_URL or EVENTSUB_PUBLIC_BASE_URL in production');
  }

  const protocol = ((req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0] || 'http').trim();
  const host = ((req.get('x-forwarded-host') || req.get('host') || '').split(',')[0] || '').trim().toLowerCase();

  if (!host) {
    throw new Error('Unable to determine callback host');
  }

  if (EVENTSUB_ALLOWED_HOSTS.length > 0 && !EVENTSUB_ALLOWED_HOSTS.includes(host)) {
    throw new Error(`Host not allowed for EventSub callback: ${host}`);
  }

  return `${protocol}://${host}/webhooks/eventsub`;
}

// Test auth import
try {
  const authRoutes = await import('./auth.js');
  const { getUserByOverlayToken } = await import('./storage.js');
  console.log('✅ Auth module imported successfully:', Object.keys(authRoutes));
  
  // Middleware
  const corsOptions = {
    origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : true),
    credentials: true
  };
  app.use(cors(corsOptions));
  app.use(express.json());
  
  // Trust proxy when behind reverse proxy/load balancer
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    console.log('🔒 Trust proxy enabled');
  }

  // Session middleware for OAuth state persistence
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = process.env.COOKIE_SECURE === 'true' || isProduction;
  
  let sessionSecret = process.env.SESSION_SECRET;
  
  if (isProduction && !sessionSecret) {
    throw new Error('SESSION_SECRET environment variable must be set in production');
  }
  
  if (!sessionSecret) {
    // Safe default for non-production environments only
    sessionSecret = 'dev-secret-change-in-production';
  }
  
  console.log(`🍪 Cookie configuration: secure=${isSecure}, env=${process.env.NODE_ENV}`);
  
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false, // Only persist sessions that are actually used (e.g., during OAuth flow)
    name: 'oauth_session', // Custom session name (no dots)
    cookie: { 
      secure: isSecure, // Environment-aware secure flag
      httpOnly: true,
      sameSite: 'lax', // Allow cookies during redirects
      maxAge: 15 * 60 * 1000, // 15 minutes
      domain: process.env.COOKIE_DOMAIN || undefined // Allow custom domain setting
    }
  }));

  // Debug logging with session info for auth routes only (after session middleware)
  app.use((req, res, next) => {
    if (req.path.startsWith('/auth/') && process.env.NODE_ENV !== 'production') {
      console.log(`🔑 Auth Debug - Session ID: ${req.sessionID}, Cookie: ${req.headers.cookie ? 'Present' : 'Missing'}`);
    }
    
    // Add security headers for auth routes
    if (req.path.startsWith('/auth/')) {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }
    
    next();
  });

  // Health check endpoint (before static files)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // EventSub webhook endpoints  
  app.post('/webhooks/eventsub', express.raw({ type: 'application/json' }), (req, res) => {
    const messageType = req.headers['twitch-eventsub-message-type'];
    const secret = process.env.EVENTSUB_SECRET || 'your-webhook-secret';
    
    // Verify HMAC signature (except for webhook challenge)
    if (messageType !== 'webhook_callback_verification') {
      if (!verifyEventSubSignature(req.headers, req.body, secret)) {
        console.warn('❌ Invalid EventSub signature, rejecting request');
        return res.status(403).send('Forbidden: Invalid signature');
      }
    }
    
    // Parse JSON body after signature verification
    let parsedBody;
    try {
      parsedBody = JSON.parse(req.body);
    } catch (error) {
      console.error('❌ Failed to parse EventSub body:', error);
      return res.status(400).send('Invalid JSON');
    }
    
    if (messageType === 'webhook_callback_verification') {
      // Handle webhook challenge
      const challenge = parsedBody.challenge;
      console.log('🔐 EventSub webhook challenge received');
      return res.status(200).send(challenge);
    }
    
    if (messageType === 'notification') {
      // Handle actual event notification
      eventStore.addEvent(parsedBody);
      return res.status(204).send();
    }
    
    if (messageType === 'revocation') {
      // Handle subscription revocation
      console.log('⚠️ EventSub subscription revoked:', parsedBody.subscription);
      return res.status(204).send();
    }
    
    console.log('❓ Unknown EventSub message type:', messageType);
    res.status(400).send('Unknown message type');
  });

  // EventSub subscription management
  app.post('/api/eventsub/subscribe', async (req, res) => {
    const { token, eventType } = req.body;
    
    if (!token || !eventType) {
      return res.status(400).json({ error: 'Missing token or eventType' });
    }

    const userData = getUserByOverlayToken(token);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    try {
      const webhookUrl = getEventSubWebhookUrl(req);
      
      const subscriptionData = {
        type: eventType,
        version: '1',
        condition: {
          broadcaster_user_id: userData.twitchUserId
        },
        transport: {
          method: 'webhook',
          callback: webhookUrl,
          secret: process.env.EVENTSUB_SECRET || 'your-webhook-secret'
        }
      };

      const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userData.accessToken}`,
          'Client-Id': process.env.TWITCH_CLIENT_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscriptionData)
      });

      const result = await response.json();
      return res.status(response.status).json(result);
    } catch (error) {
      console.error('EventSub subscription error:', error);
      return res.status(500).json({ error: 'Failed to create subscription', details: error.message });
    }
  });

  // OAuth routes (before static files)
  console.log('🔧 Mounting auth routes at /auth...');
  app.use('/auth', authRoutes.default);

  // Root route - landing page or success page
  app.get('/', (req, res) => {
    // Check if user has success data in session
    if (req.session?.authSuccess) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Showing success page for user:', req.session.authSuccess.displayName);
      }
      
      try {
        const successHtml = readFileSync(path.join(__dirname, 'static-views', 'success.html'), 'utf-8');
        const personalizedHtml = successHtml
          .replace(/\{\{DISPLAY_NAME\}\}/g, escapeHtml(req.session.authSuccess.displayName))
          .replace(/\{\{OVERLAY_TOKEN\}\}/g, escapeHtml(req.session.authSuccess.overlayToken))
          .replace(/\{\{OVERLAY_EXPIRES_AT\}\}/g, req.session.authSuccess.overlayExpiresAt || '')
          .replace(/\{\{CHAT_URL\}\}/g, `${req.protocol}://${req.get('host')}/chat?token=${encodeURIComponent(req.session.authSuccess.overlayToken)}`)
          .replace(/\{\{CLOCK_URL\}\}/g, `${req.protocol}://${req.get('host')}/clock?token=${encodeURIComponent(req.session.authSuccess.overlayToken)}`)
          .replace(/\{\{BAR_URL\}\}/g, `${req.protocol}://${req.get('host')}/bar?token=${encodeURIComponent(req.session.authSuccess.overlayToken)}`);
        
        return res.send(personalizedHtml);
      } catch (error) {
        console.error('Failed to read success page:', error);
        // Fall through to landing page
      }
    }
    
    // Show landing page
    try {
      const landingHtml = readFileSync(path.join(__dirname, 'static-views', 'landing.html'), 'utf-8');
      res.send(landingHtml);
    } catch (error) {
      console.error('Failed to read landing page:', error);
      res.status(500).send('Server error');
    }
  });

  // Demo page route
  app.get('/demo', (req, res) => {
    const { token } = req.query;
    
    if (!token) {
      return res.redirect('/');
    }

    // Find user by overlay token
    const userData = getUserByOverlayToken(token);
    
    if (!userData) {
      return res.redirect('/');
    }

    try {
      const demoHtml = readFileSync(path.join(__dirname, 'static-views', 'demo.html'), 'utf-8');
      const personalizedHtml = demoHtml
        .replace(/\{\{DISPLAY_NAME\}\}/g, escapeHtml(userData.displayName))
        .replace(/\{\{OVERLAY_TOKEN\}\}/g, escapeHtml(token));
      
      res.send(personalizedHtml);
    } catch (error) {
      console.error('Failed to read demo page:', error);
      res.status(500).send('Server error');
    }
  });

  // API routes for Twitch data
  app.get('/api/twitch/:endpoint', async (req, res) => {
    const { token } = req.query;
    const { endpoint } = req.params;
    
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

  // Validate endpoint parameter
    const validEndpoints = [
      'user', 'channel', 'stream', 'followers', 'subscribers', 'validate',
      'clips', 'videos', 'schedule', 'polls', 'predictions', 'goals', 
      'emotes', 'chatters', 'moderators', 'vips', 'games',
      'hypetrain', 'bits', 'channelpoints', 'events'
    ];
    if (!validEndpoints.includes(endpoint)) {
      return res.status(404).json({ error: 'Unknown endpoint' });
    }

    const userData = getUserByOverlayToken(token);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    try {
      let data;
      const headers = {
        'Authorization': `Bearer ${userData.accessToken}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID
      };

      switch (endpoint) {
        case 'user':
          data = await makeTwitchApiCall('https://api.twitch.tv/helix/users', headers, res);
          break;

        case 'channel':
          data = await makeTwitchApiCall(`https://api.twitch.tv/helix/channels?broadcaster_id=${userData.twitchUserId}`, headers, res);
          break;

        case 'stream':
          data = await makeTwitchApiCall(`https://api.twitch.tv/helix/streams?user_id=${userData.twitchUserId}`, headers, res);
          break;

        case 'followers':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userData.twitchUserId}&first=10`,
            headers, 
            res, 
            'Followers endpoint requires special permissions'
          );
          break;

        case 'subscribers':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${userData.twitchUserId}&first=10`,
            headers, 
            res, 
            'Subscribers endpoint requires special permissions'
          );
          break;

        case 'validate':
          data = await makeTwitchApiCall(
            'https://id.twitch.tv/oauth2/validate',
            { 'Authorization': `OAuth ${userData.accessToken}` },
            res
          );
          break;

        case 'clips':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/clips?broadcaster_id=${userData.twitchUserId}&first=10`,
            headers, 
            res, 
            'Clips endpoint failed'
          );
          break;

        case 'videos':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/videos?user_id=${userData.twitchUserId}&first=5&type=archive`,
            headers, 
            res, 
            'Videos endpoint failed'
          );
          break;

        case 'schedule':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/schedule?broadcaster_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'Schedule endpoint failed'
          );
          break;

        case 'polls':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/polls?broadcaster_id=${userData.twitchUserId}&first=5`,
            headers, 
            res, 
            'Polls endpoint requires broadcaster scope'
          );
          break;

        case 'predictions':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/predictions?broadcaster_id=${userData.twitchUserId}&first=5`,
            headers, 
            res, 
            'Predictions endpoint requires broadcaster scope'
          );
          break;

        case 'goals':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/goals?broadcaster_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'Goals endpoint requires broadcaster scope'
          );
          break;

        case 'emotes':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'Emotes endpoint failed'
          );
          break;

        case 'chatters':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${userData.twitchUserId}&moderator_id=${userData.twitchUserId}&first=100`,
            headers, 
            res, 
            'Chatters endpoint requires moderator scope'
          );
          break;

        case 'moderators':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'Moderators endpoint requires moderation scope'
          );
          break;

        case 'vips':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/channels/vips?broadcaster_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'VIPs endpoint requires broadcaster scope'
          );
          break;

        case 'games':
          // Get current game from channel info first
          const channelData = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/channels?broadcaster_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'Games endpoint failed'
          );
          
          if (!channelData) return; // Error already handled
          
          if (channelData.data?.[0]?.game_id) {
            data = await makeTwitchApiCall(
              `https://api.twitch.tv/helix/games?id=${channelData.data[0].game_id}`,
              headers, 
              res, 
              'Games endpoint failed'
            );
          } else {
            data = { data: [], message: 'No game currently set' };
          }
          break;

        case 'hypetrain':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/hypetrain/status?broadcaster_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'Hype Train status requires channel:read:hype_train scope'
          );
          break;

        case 'bits':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/bits/leaderboard?user_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'Bits leaderboard requires bits:read scope'
          );
          break;

        case 'channelpoints':
          data = await makeTwitchApiCall(
            `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${userData.twitchUserId}`,
            headers, 
            res, 
            'Channel points requires channel:read:redemptions scope'
          );
          break;

        case 'events':
          // Get recent EventSub events
          const { type, limit } = req.query;
          if (type) {
            data = {
              events: eventStore.getEventsByType(type, parseInt(limit) || 20),
              total: eventStore.events.filter(e => e.subscription.type === type).length
            };
          } else {
            data = {
              events: eventStore.getEvents(parseInt(limit) || 50),
              total: eventStore.events.length
            };
          }
          break;
      }

      // Only send response if we have data (errors already handled by makeTwitchApiCall)
      if (data !== null) {
        res.json(data);
      }
    } catch (error) {
      console.error(`API Error for ${endpoint}:`, error);
      res.status(500).json({ error: 'API request failed', message: error.message });
    }
  });

  // EventSub management endpoints
  app.delete('/api/twitch/events', (req, res) => {
    const { token } = req.query;
    
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

    const userData = getUserByOverlayToken(token);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    eventStore.clearEvents();
    res.json({ message: 'Events cleared', timestamp: new Date().toISOString() });
  });

  console.log('📁 Setting up static files...');
  // Serve static files from dist directory
  app.use(express.static(path.join(__dirname, '../../dist')));
  
  // Serve server pages CSS file (multiple paths for auth routes)
  app.get('/server-pages.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'static-views', 'server-pages.css'));
  });
  app.get('/auth/server-pages.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'static-views', 'server-pages.css'));
  });

  console.log('🔀 Setting up catch-all route...');

  // API routes for overlay data will be added next
  
  // 404 catch-all route
  app.get('*', (req, res) => {
    try {
      const html404 = readFileSync(path.join(__dirname, 'static-views', '404.html'), 'utf-8');
      const personalizedHtml = html404.replace('{{REQUEST_PATH}}', escapeHtml(req.path));
      res.status(404).send(personalizedHtml);
    } catch (error) {
      console.error('Error serving 404 page:', error);
      res.status(404).send('404 - Page Not Found');
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 Overlay server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔧 Auth test: http://localhost:${PORT}/auth/test`);
  });

} catch (error) {
  console.error('❌ Failed to import auth module:', error);
  
  // Fallback server without auth
  app.use(cors({ origin: false })); // Disable CORS in fallback mode for security
  app.use(express.json());
  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', error: 'Auth module failed to load' });
  });
  
  app.get('/auth/*', (req, res) => {
    res.status(500).json({ error: 'Auth system not available', message: error.message });
  });
  
  app.use(express.static(path.join(__dirname, '../../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });
  
  app.listen(PORT, () => {
    console.log(`⚠️ Server running in fallback mode on port ${PORT}`);
  });
}

// Helper function to handle Twitch API responses with proper status forwarding
async function handleTwitchResponse(twitchResponse, res) {
  const data = await twitchResponse.json();
  
  if (twitchResponse.ok) {
    return data;
  } else {
    // Forward the Twitch error status to the client
    res.status(twitchResponse.status).json(data);
    return null; // Indicates error was handled
  }
}

// Helper function to make Twitch API calls with consistent error handling
async function makeTwitchApiCall(url, headers, res, errorMessage = 'API request failed') {
  try {
    const response = await fetch(url, { headers });
    const data = await handleTwitchResponse(response, res);
    if (data === null) return null; // Error already handled
    return data;
  } catch (error) {
    res.status(500).json({ error: errorMessage, details: error.message });
    return null;
  }
}