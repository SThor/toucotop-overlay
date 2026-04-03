/**
 * Twitch Stream Overlay Server
 * Main Express server with modular Twitch API integration
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { statSync } from 'fs';
import cors from 'cors';
import session from 'express-session';

// Import new modular components
import { handleTwitchApiEndpoint, handleGamesEndpoint, handleEventsEndpoint } from './twitch-endpoints.js';
import { 
  handleEventSubWebhook, 
  handleEventSubSubscription, 
  handleEventSubEventsDeletion,
  defaultEventStore 
} from './eventsub-handler.js';
import { 
  validateOverlayToken, 
  validateEndpoint,
  validateJsonBody,
  errorHandler,
  requestLogger,
  getCorsOptions,
  configureTrustProxy 
} from './middleware.js';
import { defaultTokenManager } from './token-manager.js';
import { addSSEClient } from './chat-relay.js';
import settingsRouter from './settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting server setup...');

// Server initialization with module imports
try {
  // Import auth routes
  const authRoutes = await import('./auth.js');
  
  // Configure Express middleware
  app.use(cors(getCorsOptions()));
  
  // Raw body capture for EventSub webhook signature verification
  app.use(express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      if (req.path === '/webhooks/eventsub') {
        req.rawBody = buf.toString('utf8');
      }
    }
  }));
  
  // Trust proxy configuration
  configureTrustProxy(app);
  
  // Session configuration for OAuth flow with production safety
  let sessionSecret = process.env.SESSION_SECRET;
  
  if (process.env.NODE_ENV === 'production') {
    if (!sessionSecret) {
      throw new Error('SESSION_SECRET environment variable must be set in production');
    }
  } else {
    // Safe default for non-production environments only
    sessionSecret = sessionSecret || 'dev-secret-change-in-production';
  }
  
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = process.env.COOKIE_SECURE === 'true' || isProduction;

  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'oauth_session',
    cookie: {
      secure: isSecure,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes (just enough for OAuth flow)
      domain: process.env.COOKIE_DOMAIN || undefined
    }
  }));

  // Request logging middleware (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.use(requestLogger());
  }

  // Security headers middleware for auth routes
  app.use('/auth', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Static file serving for the React SPA build output
  app.use(express.static(path.join(__dirname, '../dist'), { index: false }));

  // ===== WEBHOOK ROUTES =====
  
  /**
   * EventSub webhook handler
   * Handles challenge verification, event notifications, and revocations
   */
  app.post('/webhooks/eventsub', (req: Request, res: Response) => {
    return handleEventSubWebhook(req, res, defaultEventStore);
  });

  // ===== API ROUTES =====
  
  /**
   * Health check endpoint for Docker and monitoring
   */
  app.get('/health', (_req: Request, res: Response) => {
    // Get build/deployment timestamp from when this file was compiled
    let buildTimestamp: string;
    try {
      const stats = statSync(__filename);
      buildTimestamp = stats.mtime.toISOString();
    } catch {
      buildTimestamp = 'unknown';
    }

    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      buildTimestamp,
      version: process.env.npm_package_version || '1.0.0'
    });
  });
  
  /**
   * Main Twitch API endpoint router
   * Handles all 21 API endpoints with consistent token validation
   */
  app.get('/api/twitch/:endpoint', 
    validateEndpoint(),
    validateOverlayToken(defaultTokenManager.getUserByOverlayToken.bind(defaultTokenManager)),
    async (req: Request, res: Response) => {
      const { endpoint } = req.params;
      let { userData } = req; // Attached by validateOverlayToken middleware

      if (!userData) {
        console.warn(`[401] /api/twitch/${endpoint}: No userData after token validation`);
        res.status(401).json({ error: 'User data not found' });
        return;
      }

      // If access token is expired, attempt refresh before making API calls
      if (userData.expiresAt && new Date(userData.expiresAt) <= new Date()) {
        if (userData.refreshToken) {
          console.log(`[INFO] Access token expired for ${userData.username}, attempting refresh...`);
          const refreshed = await defaultTokenManager.refreshUserTokens(userData.username);
          if (refreshed) {
            userData = refreshed;
            req.userData = refreshed;
            console.log(`[INFO] Token refresh successful for ${userData.username}`);
          } else {
            console.warn(`[401] /api/twitch/${endpoint}: Token refresh failed for ${userData.username}`);
            res.status(401).json({ error: 'Access token expired and refresh failed' });
            return;
          }
        } else {
          console.warn(`[401] /api/twitch/${endpoint}: Access token expired and no refresh token for ${userData.username}`);
          res.status(401).json({ error: 'Access token expired and no refresh token' });
          return;
        }
      }

      try {
        let data;

        // Route to appropriate handler based on endpoint type
        if (endpoint === 'events') {
          data = handleEventsEndpoint(req, defaultEventStore);
        } else if (endpoint === 'games') {
          data = await handleGamesEndpoint(userData, res);
        } else {
          // All other endpoints use the generic handler
          data = await handleTwitchApiEndpoint(endpoint as string, userData, res);
        }

        // Only send response if we have data (errors already handled by individual handlers)
        if (data !== null && data !== undefined) {
          res.json(data);
        }
      } catch (error) {
        console.error(`API Error for ${endpoint}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'API request failed', message: errorMessage });
      }
    }
  );

  /**
   * Chat SSE stream endpoint
   * Streams real-time chat messages for the authenticated user's channel
   */
  app.get('/api/chat/stream',
    validateOverlayToken(defaultTokenManager.getUserByOverlayToken.bind(defaultTokenManager)),
    (req: Request, res: Response) => {
      const { userData } = req;
      if (!userData) {
        res.status(401).json({ error: 'User data not found' });
        return;
      }
      addSSEClient(userData.username, res);
    }
  );

  /**
   * Overlay settings endpoint (GET + PATCH)
   */
  app.use('/api/settings', settingsRouter);

  /**
   * EventSub subscription management endpoint
   */
  app.post('/api/eventsub/subscribe', 
    validateJsonBody(['token', 'eventType']),
    async (req: Request, res: Response) => {
      return handleEventSubSubscription(req, res, defaultTokenManager.getUserByOverlayToken.bind(defaultTokenManager));
    }
  );

  /**
   * EventSub events deletion endpoint
   */
  app.delete('/api/twitch/events', (req: Request, res: Response) => {
    return handleEventSubEventsDeletion(req, res, defaultTokenManager.getUserByOverlayToken.bind(defaultTokenManager), defaultEventStore);
  });

  // ===== AUTHENTICATION ROUTES =====
  
  // Mount OAuth routes
  console.log('🔧 Mounting auth routes at /auth...');
  app.use('/auth', authRoutes.default);

  // ===== REACT APP ROUTES =====

  /**
   * Catch-all handler for React Router
   * Serves the main React app for client-side routing
   * Uses Express 5 named wildcard syntax
   */
  app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });

  // ===== ERROR HANDLING =====
  
  // Global error handler (must be last)
  app.use(errorHandler());

  // ===== SERVER STARTUP =====
  
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} to view the overlay system`);
    console.log(`📈 API endpoints available at http://localhost:${PORT}/api/twitch/:endpoint`);
    console.log(`🔗 EventSub webhooks at http://localhost:${PORT}/webhooks/eventsub`);
    
    if (process.env.NODE_ENV === 'production') {
      console.log('🚀 Production mode - enhanced security enabled');
    } else {
      console.log('🛠️ Development mode - CORS and logging enabled');
    }
  });

} catch (error) {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
}