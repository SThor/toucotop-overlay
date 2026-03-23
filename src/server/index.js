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

  // Debug logging
  app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path}`);
    next();
  });

  // Session middleware for OAuth state persistence
  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: true, // Create session for OAuth flow
    name: 'oauth.session', // Custom session name
    cookie: { 
      secure: true, // HTTPS required for secure cookies
      httpOnly: true,
      sameSite: 'lax', // Allow cookies during redirects
      maxAge: 10 * 60 * 1000 // 10 minutes
    }
  }));

  // Health check endpoint (before static files)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // OAuth routes (before static files)
  console.log('🔧 Mounting auth routes at /auth...');
  app.use('/auth', (req, res, next) => {
    console.log(`🎯 Auth route hit: ${req.method} /auth${req.path}`);
    next();
  }, authRoutes.default);

  console.log('📁 Setting up static files...');
  // Serve static files from dist directory
  app.use(express.static(path.join(__dirname, '../../dist')));

  console.log('🔀 Setting up catch-all route...');

  // API routes for overlay data will be added next
  
  // 404 catch-all route with fun gaming-themed page
  app.get('*', (req, res) => {
    console.log(`❌ 404 Not Found: ${req.path}`);
    try {
      const html404 = readFileSync(path.join(__dirname, '404.html'), 'utf-8');
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