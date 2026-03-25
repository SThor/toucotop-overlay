/**
 * Twitch Stream Overlay Server
 * Main Express server with modular Twitch API integration
 */

import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, statSync } from 'fs';
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
  errorHandler,
  requestLogger,
  getCorsOptions,
  configureTrustProxy 
} from './middleware.js';
import { defaultTokenManager } from './token-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// HTML escape function to prevent XSS in template replacements
function escapeHtml(unsafe: unknown): string {
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
  
  // Session configuration for OAuth flow
  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Request logging middleware (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.use(requestLogger());
  }

  // Static file serving
  app.use(express.static(path.join(__dirname, '../dist')));

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
      const { userData } = req; // Attached by validateOverlayToken middleware
      
      if (!userData) {
        res.status(401).json({ error: 'User data not found' });
        return;
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
   * EventSub subscription management endpoint
   */
  app.post('/api/eventsub/subscribe', async (req: Request, res: Response) => {
    return handleEventSubSubscription(req, res, defaultTokenManager.getUserByOverlayToken.bind(defaultTokenManager));
  });

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

  // ===== STATIC PAGE ROUTES =====

  /**
   * Root route - landing page or success page based on session
   */
  app.get('/', (req: Request, res: Response) => {
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
      return;
    } catch (error) {
      console.error('Failed to read landing page:', error);
      res.status(500).send('Server error');
      return;
    }
  });

  /**
   * Demo page route with token validation
   */
  app.get('/demo', (req: Request, res: Response) => {
    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
      return res.redirect('/');
    }

    // Find user by overlay token
    const userData = defaultTokenManager.getUserByOverlayToken(token);
    
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

  // ===== REACT APP ROUTES =====

  /**
   * Catch-all handler for React Router
   * Serves the main React app for client-side routing
   */
  app.get('*', (_req: Request, res: Response) => {
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