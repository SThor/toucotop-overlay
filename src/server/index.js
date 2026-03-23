import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import authRoutes from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Debug logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});

// Simple session middleware (for OAuth state)
app.use((req, res, next) => {
  if (!req.session) {
    req.session = {};
  }
  next();
});

// Health check endpoint (before static files)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OAuth routes (before static files)
app.use('/auth', authRoutes);

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../../dist')));

// API routes for overlay data will be added next
// For now, all other requests go to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Overlay server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});