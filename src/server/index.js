import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import cors from 'cors';
import session from 'express-session';

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
  app.post('/webhooks/eventsub', (req, res) => {
    const messageType = req.headers['twitch-eventsub-message-type'];
    
    if (messageType === 'webhook_callback_verification') {
      // Handle webhook challenge
      const challenge = req.body.challenge;
      console.log('🔐 EventSub webhook challenge received');
      return res.status(200).send(challenge);
    }
    
    if (messageType === 'notification') {
      // Handle actual event notification
      const event = req.body;
      eventStore.addEvent(event);
      return res.status(204).send();
    }
    
    if (messageType === 'revocation') {
      // Handle subscription revocation
      console.log('⚠️ EventSub subscription revoked:', req.body.subscription);
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
      const webhookUrl = `${req.protocol}://${req.get('host')}/webhooks/eventsub`;
      
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
      res.json(result);
    } catch (error) {
      console.error('EventSub subscription error:', error);
      res.status(500).json({ error: 'Failed to create subscription' });
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
          const userResponse = await fetch('https://api.twitch.tv/helix/users', { headers });
          data = await userResponse.json();
          break;

        case 'channel':
          const channelResponse = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${userData.twitchUserId}`, { headers });
          data = await channelResponse.json();
          break;

        case 'stream':
          const streamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userData.twitchUserId}`, { headers });
          data = await streamResponse.json();
          break;

        case 'followers':
          try {
            const followersResponse = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userData.twitchUserId}&first=10`, { headers });
            data = await followersResponse.json();
          } catch (error) {
            data = { error: 'Followers endpoint requires special permissions', details: error.message };
          }
          break;

        case 'subscribers':
          try {
            const subsResponse = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${userData.twitchUserId}&first=10`, { headers });
            data = await subsResponse.json();
          } catch (error) {
            data = { error: 'Subscribers endpoint requires special permissions', details: error.message };
          }
          break;

        case 'validate':
          const validateResponse = await fetch('https://id.twitch.tv/oauth2/validate', {
            headers: { 'Authorization': `OAuth ${userData.accessToken}` }
          });
          data = await validateResponse.json();
          break;

        case 'clips':
          try {
            const clipsResponse = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${userData.twitchUserId}&first=10`, { headers });
            data = await clipsResponse.json();
          } catch (error) {
            data = { error: 'Clips endpoint failed', details: error.message };
          }
          break;

        case 'videos':
          try {
            const videosResponse = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userData.twitchUserId}&first=5&type=archive`, { headers });
            data = await videosResponse.json();
          } catch (error) {
            data = { error: 'Videos endpoint failed', details: error.message };
          }
          break;

        case 'schedule':
          try {
            const scheduleResponse = await fetch(`https://api.twitch.tv/helix/schedule?broadcaster_id=${userData.twitchUserId}`, { headers });
            data = await scheduleResponse.json();
          } catch (error) {
            data = { error: 'Schedule endpoint failed', details: error.message };
          }
          break;

        case 'polls':
          try {
            const pollsResponse = await fetch(`https://api.twitch.tv/helix/polls?broadcaster_id=${userData.twitchUserId}&first=5`, { headers });
            data = await pollsResponse.json();
          } catch (error) {
            data = { error: 'Polls endpoint requires broadcaster scope', details: error.message };
          }
          break;

        case 'predictions':
          try {
            const predictionsResponse = await fetch(`https://api.twitch.tv/helix/predictions?broadcaster_id=${userData.twitchUserId}&first=5`, { headers });
            data = await predictionsResponse.json();
          } catch (error) {
            data = { error: 'Predictions endpoint requires broadcaster scope', details: error.message };
          }
          break;

        case 'goals':
          try {
            const goalsResponse = await fetch(`https://api.twitch.tv/helix/goals?broadcaster_id=${userData.twitchUserId}`, { headers });
            data = await goalsResponse.json();
          } catch (error) {
            data = { error: 'Goals endpoint requires broadcaster scope', details: error.message };
          }
          break;

        case 'emotes':
          try {
            const emotesResponse = await fetch(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${userData.twitchUserId}`, { headers });
            data = await emotesResponse.json();
          } catch (error) {
            data = { error: 'Emotes endpoint failed', details: error.message };
          }
          break;

        case 'chatters':
          try {
            const chattersResponse = await fetch(`https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${userData.twitchUserId}&moderator_id=${userData.twitchUserId}&first=100`, { headers });
            data = await chattersResponse.json();
          } catch (error) {
            data = { error: 'Chatters endpoint requires moderator scope', details: error.message };
          }
          break;

        case 'moderators':
          try {
            const modsResponse = await fetch(`https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${userData.twitchUserId}`, { headers });
            data = await modsResponse.json();
          } catch (error) {
            data = { error: 'Moderators endpoint requires moderation scope', details: error.message };
          }
          break;

        case 'vips':
          try {
            const vipsResponse = await fetch(`https://api.twitch.tv/helix/channels/vips?broadcaster_id=${userData.twitchUserId}`, { headers });
            data = await vipsResponse.json();
          } catch (error) {
            data = { error: 'VIPs endpoint requires broadcaster scope', details: error.message };
          }
          break;

        case 'games':
          try {
            // Get current game from channel info first
            const channelResp = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${userData.twitchUserId}`, { headers });
            const channelData = await channelResp.json();
            if (channelData.data && channelData.data[0] && channelData.data[0].game_id) {
              const gamesResponse = await fetch(`https://api.twitch.tv/helix/games?id=${channelData.data[0].game_id}`, { headers });
              data = await gamesResponse.json();
            } else {
              data = { data: [], message: 'No game currently set' };
            }
          } catch (error) {
            data = { error: 'Games endpoint failed', details: error.message };
          }
          break;

        case 'hypetrain':
          try {
            const hypeResponse = await fetch(`https://api.twitch.tv/helix/hypetrain/status?broadcaster_id=${userData.twitchUserId}`, { headers });
            data = await hypeResponse.json();
          } catch (error) {
            data = { error: 'Hype Train status requires channel:read:hype_train scope', details: error.message };
          }
          break;

        case 'bits':
          try {
            const bitsResponse = await fetch(`https://api.twitch.tv/helix/bits/leaderboard?user_id=${userData.twitchUserId}`, { headers });
            data = await bitsResponse.json();
          } catch (error) {
            data = { error: 'Bits leaderboard requires bits:read scope', details: error.message };
          }
          break;

        case 'channelpoints':
          try {
            const rewardsResponse = await fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${userData.twitchUserId}`, { headers });
            data = await rewardsResponse.json();
          } catch (error) {
            data = { error: 'Channel points requires channel:read:redemptions scope', details: error.message };
          }
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

      res.json(data);
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