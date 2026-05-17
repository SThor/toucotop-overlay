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
import { handleTwitchApiEndpoint, handleGamesEndpoint, handleEventsEndpoint, handleLastEventsEndpoint } from './twitch-endpoints.js';
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
import { getUserTokens, listAuthenticatedUsers } from './storage.js';
import { addSSEClient, activateRelay, getRelayHistory } from './chat-relay.js';
import { addAlertSSEClient, broadcastAlert } from './alert-relay.js';
import { ALERT_TYPES } from './shared/alertTypes.js';
import type { AlertType } from './shared/alertTypes.js';
import settingsRouter from './settings.js';

const VALID_ALERT_TYPES: ReadonlySet<AlertType> = new Set(ALERT_TYPES);
const OVERLAY_ADMIN = process.env.OVERLAY_ADMIN?.trim().toLowerCase() || null;
const TWITCH_USERNAME_REGEX = /^[a-z0-9_]{3,25}$/;

function canSendTargetedCustomAlerts(username: string): boolean {
  if (!OVERLAY_ADMIN) return false;
  return username.toLowerCase() === OVERLAY_ADMIN;
}

function getDefaultCustomTarget(targets: string[]): string | null {
  if (targets.length === 0) return null;
  if (!OVERLAY_ADMIN) return targets[0] ?? null;
  const firstNonAdmin = targets.find((t) => t !== OVERLAY_ADMIN);
  return firstNonAdmin ?? null;
}

function listValidCustomTargets(): string[] {
  const now = Date.now();
  return listAuthenticatedUsers()
    .map((u) => u.toLowerCase())
    .filter((u) => TWITCH_USERNAME_REGEX.test(u))
    .filter((u) => {
      const tokenData = getUserTokens(u);
      if (!tokenData?.overlayExpiresAt) return false;
      return new Date(tokenData.overlayExpiresAt).getTime() > now;
    })
    .sort((a, b) => a.localeCompare(b));
}

function isAlertType(value: string): value is AlertType {
  return VALID_ALERT_TYPES.has(value as AlertType);
}

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
        } else if (endpoint === 'last-events') {
          data = handleLastEventsEndpoint(userData.username);
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
        res.status(500).json({ error: 'Internal error: authentication data missing' });
        return;
      }
      addSSEClient(userData.username, res);
    }
  );

  /**
   * Chat history endpoint
   * Returns buffered recent chat messages for initial overlay hydration.
   */
  app.get('/api/chat/history',
    validateOverlayToken(defaultTokenManager.getUserByOverlayToken.bind(defaultTokenManager)),
    async (req: Request, res: Response) => {
      const { userData } = req;
      if (!userData) {
        res.status(401).json({ error: 'User data not found' });
        return;
      }

      const messages = await getRelayHistory(userData.username);
      res.json({ messages });
    }
  );

  /**
   * Alerts SSE stream endpoint
   * Streams real-time alert events (follow, sub, hype-train, etc.) to overlay clients
   */
  app.get('/api/alerts/stream',
    validateOverlayToken(defaultTokenManager.getUserByOverlayToken.bind(defaultTokenManager)),
    (req: Request, res: Response) => {
      const { userData } = req;
      if (!userData) {
        res.status(401).json({ error: 'User data not found' });
        return;
      }
      addAlertSSEClient(userData.username, res);
    }
  );

  /**
   * Manual test-alert trigger endpoint
   * Allows the dashboard to fire a fake alert for testing overlay appearance
   */
  app.post('/api/alerts/trigger',
    validateJsonBody(['token', 'type']),
    (req: Request, res: Response) => {
      const { token, type, data } = req.body as { token: unknown; type: unknown; data?: unknown };

      // Explicit runtime type checks — validateJsonBody only verifies presence, not type
      if (typeof token !== 'string' || typeof type !== 'string') {
        res.status(400).json({ error: 'token and type must be strings' });
        return;
      }

      const userData = defaultTokenManager.getUserByOverlayToken(token);
      if (!userData) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      if (!isAlertType(type)) {
        res.status(400).json({ error: 'Invalid alert type', validTypes: [...VALID_ALERT_TYPES] });
        return;
      }

      // Sanitize caller-supplied extras: only allow plain objects, spread first so
      // required core fields (id, type, timestamp) cannot be overridden
      const extraData = data !== null && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : {};

      broadcastAlert(userData.username, {
        // Default optional per-type fields (can be overridden by extraData)
        userName: 'TestUser',
        tier: '1000',
        bits: 100,
        giftCount: 5,
        raiderName: 'TestRaider',
        viewerCount: 42,
        level: 1,
        progress: 50,
        cumulativeMonths: 3,
        message: 'Test alert message!',
        // Caller-supplied overrides for optional fields
        ...extraData,
        // Required core fields last — cannot be overridden by caller
        id: `test_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type,
        timestamp: new Date().toISOString(),
      });

      res.json({ ok: true, type, channel: userData.username });
    }
  );

  /**
   * Restricted custom alert targets endpoint
    * Returns whether caller can send targeted custom alerts and, when allowed,
    * the list of currently valid authenticated target usernames.
   */
  app.get('/api/alerts/custom-targets', (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      res.status(400).json({ error: 'token is required' });
      return;
    }

    const userData = defaultTokenManager.getUserByOverlayToken(token);
    if (!userData) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const canSend = canSendTargetedCustomAlerts(userData.username);
    const targets = canSend ? listValidCustomTargets() : [];
    const defaultTarget = getDefaultCustomTarget(targets);

    res.json({
      canSendTargetedCustomAlerts: canSend,
      targets,
      defaultTarget,
    });
  });

  /**
   * Restricted custom alert endpoint
    * Only the configured privileged account can push a custom alert into a selected overlay channel.
   */
  app.post('/api/alerts/custom',
    validateJsonBody(['token', 'title']),
    (req: Request, res: Response) => {
      const { token, title, message, icon, targetUsername } = req.body as {
        token: unknown;
        title: unknown;
        message?: unknown;
        icon?: unknown;
        targetUsername?: unknown;
      };

      if (typeof token !== 'string' || typeof title !== 'string') {
        res.status(400).json({ error: 'token and title must be strings' });
        return;
      }

      const userData = defaultTokenManager.getUserByOverlayToken(token);
      if (!userData) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      if (!canSendTargetedCustomAlerts(userData.username)) {
        res.status(403).json({ error: 'This endpoint is restricted to the configured privileged user' });
        return;
      }

      const customTitle = title.trim();
      if (!customTitle) {
        res.status(400).json({ error: 'title must not be empty' });
        return;
      }
      if (customTitle.length > 120) {
        res.status(400).json({ error: 'title is too long (max 120 chars)' });
        return;
      }

      const validTargets = listValidCustomTargets();
      const defaultTarget = getDefaultCustomTarget(validTargets);
      const rawTarget = typeof targetUsername === 'string'
        ? targetUsername.trim().toLowerCase()
        : (defaultTarget ?? '');

      if (!rawTarget) {
        res.status(400).json({ error: 'No valid target user available' });
        return;
      }

      if (!TWITCH_USERNAME_REGEX.test(rawTarget)) {
        res.status(400).json({ error: 'targetUsername is invalid' });
        return;
      }

      const allowedTargets = new Set(validTargets);
      if (!allowedTargets.has(rawTarget)) {
        res.status(400).json({ error: 'targetUsername not found in authenticated users' });
        return;
      }

      const customMessage = typeof message === 'string' ? message.trim().slice(0, 200) : '';
      const customIcon = typeof icon === 'string' ? icon.trim().slice(0, 8) : '📣';

      broadcastAlert(rawTarget, {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: 'custom',
        timestamp: new Date().toISOString(),
        userName: userData.displayName || userData.username,
        customTitle,
        customIcon: customIcon || '📣',
        ...(customMessage ? { message: customMessage } : {}),
      });

      res.json({ ok: true, channel: rawTarget });
    }
  );

  /**
   * Overlay settings endpoint (GET + PATCH)
   * Mounted behind validateOverlayToken so the sliding-window token extension
   * applies to dashboard usage and req.userData is available in the router.
   */
  app.use(
    '/api/settings',
    validateOverlayToken(defaultTokenManager.getUserByOverlayToken.bind(defaultTokenManager)),
    settingsRouter
  );

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

  // Keep chat relays alive for authenticated users so history keeps accumulating
  // even while no overlay is currently connected.
  for (const username of listAuthenticatedUsers()) {
    activateRelay(username).catch((error) => {
      console.error(
        `⚠️ Failed to activate chat relay for ${username}; server continues without preloaded history for this channel. Check Twitch connectivity and stored auth tokens.`,
        error,
      );
    });
  }

} catch (error) {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
}
