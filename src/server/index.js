import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import cors from 'cors';
import session from 'express-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting server setup...');

// Test auth import
try {
  const authRoutes = await import('./auth.js');
  console.log('✅ Auth module imported successfully:', Object.keys(authRoutes));
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Trust proxy when behind reverse proxy/load balancer
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    console.log('🔒 Trust proxy enabled');
  }

  // Debug logging with session info for auth routes only
  app.use((req, res, next) => {
    if (req.path.startsWith('/auth/') && process.env.NODE_ENV !== 'production') {
      console.log(`🔑 Auth Debug - Session ID: ${req.sessionID}, Cookie: ${req.headers.cookie ? 'Present' : 'Missing'}`);
    }
    next();
  });

  // Session middleware for OAuth state persistence
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = process.env.COOKIE_SECURE === 'true' || isProduction;
  
  console.log(`🍪 Cookie configuration: secure=${isSecure}, env=${process.env.NODE_ENV}`);
  
  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: true, // Create session for OAuth flow
    name: 'oauth_session', // Custom session name (no dots)
    cookie: { 
      secure: isSecure, // Environment-aware secure flag
      httpOnly: true,
      sameSite: 'lax', // Allow cookies during redirects
      maxAge: 15 * 60 * 1000, // 15 minutes
      domain: process.env.COOKIE_DOMAIN || undefined // Allow custom domain setting
    }
  }));

  // Health check endpoint (before static files)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
          .replace(/\{\{DISPLAY_NAME\}\}/g, req.session.authSuccess.displayName)
          .replace(/\{\{OVERLAY_TOKEN\}\}/g, req.session.authSuccess.overlayToken)
          .replace(/\{\{CHAT_URL\}\}/g, `${req.protocol}://${req.get('host')}/chat?token=${req.session.authSuccess.overlayToken}`)
          .replace(/\{\{CLOCK_URL\}\}/g, `${req.protocol}://${req.get('host')}/clock?token=${req.session.authSuccess.overlayToken}`)
          .replace(/\{\{BAR_URL\}\}/g, `${req.protocol}://${req.get('host')}/bar?token=${req.session.authSuccess.overlayToken}`);
        
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
      const personalizedHtml = html404.replace('{{REQUEST_PATH}}', req.path);
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
  app.use(cors());
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