/**
 * Server Middleware
 * Reusable middleware for validation, CORS, and error handling
 */

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import type { Express } from 'express';
import type { CorsOptions } from 'cors';
import { validEndpoints } from './twitch-endpoints.js';
import type { UserData } from './twitch-api-client.js';
import { extendOverlayToken } from './storage.js';

// Extend Express Request type to include custom properties
declare global {
  namespace Express {
    interface Request {
      userData?: UserData;
      rawBody?: string;
    }
  }
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export interface RequestData {
  count: number;
  resetTime: number;
}

/**
 * Validate overlay token middleware
 */
function validateOverlayToken(getUserByOverlayToken: (token: string) => UserData | null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      console.warn('[401] Overlay request missing token');
      res.status(401).json({ error: 'Missing token' });
      return;
    }

    const userData = getUserByOverlayToken(token);
    if (!userData) {
      console.warn(`[401] Overlay request invalid or expired token: ${token.slice(0, 12)}...`);
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Attach user data to request object for use in handlers
    req.userData = userData;

    // Sliding window: extend overlay token expiry on every valid use
    extendOverlayToken(userData.username);

    next();
  };
}

/**
 * Validate Twitch API endpoint parameter middleware
 */
function validateEndpoint() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { endpoint } = req.params;
    
    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint parameter' });
      return;
    }

    if (!validEndpoints.includes(endpoint as string)) {
      res.status(404).json({ error: 'Unknown endpoint' });
      return;
    }

    next();
  };
}

/**
 * Error handling middleware for unhandled errors
 */
function errorHandler(): ErrorRequestHandler {
  return (error: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('Unhandled server error:', error);
    
    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(500).json({
      error: 'Internal server error',
      ...(isDevelopment && { details: error.message, stack: error.stack })
    });
  };
}

/**
 * Request logging middleware
 */
function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { method, url } = req;
      const { statusCode } = res;
      
      // Log with different levels based on status code
      if (statusCode >= 500) {
        console.error(`${method} ${url} - ${statusCode} - ${duration}ms`);
      } else if (statusCode >= 400) {
        console.warn(`${method} ${url} - ${statusCode} - ${duration}ms`);
      } else {
        console.log(`${method} ${url} - ${statusCode} - ${duration}ms`);
      }
    });
    
    next();
  };
}

/**
 * Raw body capture middleware for webhook signature verification
 */
function captureRawBody() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.path === '/webhooks/eventsub') {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => data += chunk);
      req.on('end', () => {
        req.rawBody = data;
        next();
      });
    } else {
      next();
    }
  };
}

/**
 * Validate JSON body for POST requests
 */
function validateJsonBody(requiredFields: string[] = []) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    // Check for required fields
    for (const field of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) {
        res.status(400).json({ error: `Missing required field: ${field}` });
        return;
      }
    }

    next();
  };
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 */
function rateLimit(options: RateLimitOptions = {}) {
  const { windowMs = 15 * 60 * 1000, max = 100 } = options; // 15 minutes, 100 requests
  const requests = new Map<string, RequestData>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || (req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    
    // Clean old entries
    for (const [ip, data] of requests.entries()) {
      if (now - data.resetTime > windowMs) {
        requests.delete(ip);
      }
    }

    // Get or create request data
    let requestData = requests.get(key);
    if (!requestData || now - requestData.resetTime > windowMs) {
      requestData = { count: 0, resetTime: now };
      requests.set(key, requestData);
    }

    // Check rate limit
    if (requestData.count >= max) {
      res.status(429).json({ 
        error: 'Too many requests',
        retryAfter: Math.ceil((requestData.resetTime + windowMs - now) / 1000)
      });
      return;
    }

    requestData.count++;
    next();
  };
}

/**
 * CORS configuration factory
 */
function getCorsOptions(): CorsOptions {
  return {
    origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : true),
    credentials: true
  };
}

/**
 * Trust proxy configuration
 */
function configureTrustProxy(app: Express): void {
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
}

export {
  validateOverlayToken,
  validateEndpoint,
  errorHandler,
  requestLogger,
  captureRawBody,
  validateJsonBody,
  rateLimit,
  getCorsOptions,
  configureTrustProxy
};