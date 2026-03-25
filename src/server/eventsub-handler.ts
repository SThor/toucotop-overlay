/**
 * Twitch EventSub Handler
 * Webhook verification, event storage, and subscription management
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { UserData } from './twitch-api-client.js';

// EventSub configuration constants
const MIN_EVENTSUB_SECRET_LENGTH = 32;
const EVENTSUB_SECRET = process.env.EVENTSUB_SECRET;
const EVENTSUB_CALLBACK_URL = process.env.EVENTSUB_CALLBACK_URL;
const EVENTSUB_PUBLIC_BASE_URL = process.env.EVENTSUB_PUBLIC_BASE_URL;
const EVENTSUB_ALLOWED_HOSTS = (process.env.EVENTSUB_ALLOWED_HOSTS || '')
  .split(',')
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

// Type definitions for EventSub
export interface EventSubEvent {
  subscription: {
    id: string;
    type: string;
    version: string;
    status: string;
    cost: number;
    condition: Record<string, any>;
    transport: {
      method: string;
      callback: string;
    };
    created_at: string;
  };
  event?: Record<string, any>;
  challenge?: string;
  timestamp?: string;
  id?: string;
}

export interface EventSubSubscriptionData {
  type: string;
  version: string;
  condition: Record<string, any>;
  transport: {
    method: string;
    callback: string;
    secret: string;
  };
}

export interface EventSubHeaders {
  'twitch-eventsub-message-id'?: string;
  'twitch-eventsub-message-timestamp'?: string;
  'twitch-eventsub-message-signature'?: string;
  'twitch-eventsub-message-type'?: string;
  [key: string]: string | undefined;
}

// Validate EventSub configuration at startup
if (EVENTSUB_SECRET && EVENTSUB_SECRET.length < MIN_EVENTSUB_SECRET_LENGTH) {
  throw new Error(`EVENTSUB_SECRET must be at least ${MIN_EVENTSUB_SECRET_LENGTH} characters long`);
}

if (process.env.NODE_ENV === 'production' && !EVENTSUB_SECRET) {
  throw new Error('EVENTSUB_SECRET must be set in production');
}

/**
 * In-memory event storage with automatic cleanup
 */
export class EventStore {
  public events: EventSubEvent[];
  private maxEvents: number;

  constructor(maxEvents: number = 100) {
    this.events = [];
    this.maxEvents = maxEvents;
  }

  /**
   * Add new event to storage with automatic metadata
   */
  addEvent(event: EventSubEvent): void {
    this.events.unshift({
      ...event,
      timestamp: new Date().toISOString(),
      id: `${event.subscription.type}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    });
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }
    
    console.log(`📡 New EventSub event: ${event.subscription.type}`);
  }

  /**
   * Get recent events with optional limit
   */
  getEvents(limit: number = 50): EventSubEvent[] {
    return this.events.slice(0, limit);
  }

  /**
   * Get events filtered by subscription type
   */
  getEventsByType(type: string, limit: number = 20): EventSubEvent[] {
    return this.events.filter(e => e.subscription.type === type).slice(0, limit);
  }

  /**
   * Clear all stored events
   */
  clearEvents(): void {
    this.events = [];
  }
}

/**
 * HMAC signature verification for EventSub webhooks
 */
function verifyEventSubSignature(headers: EventSubHeaders, rawBody: string, secret: string): boolean {
  const messageId = headers['twitch-eventsub-message-id'];
  const timestamp = headers['twitch-eventsub-message-timestamp'];
  const signature = headers['twitch-eventsub-message-signature'];
  
  if (!messageId || !timestamp || !signature) {
    console.warn('❌ Missing required EventSub headers');
    return false;
  }
  
  // Verify timestamp is valid RFC3339 and recent (within 10 minutes)
  const timestampMs = Date.parse(timestamp);
  if (Number.isNaN(timestampMs)) {
    console.warn('❌ Invalid EventSub timestamp format');
    return false;
  }

  const now = Date.now();
  if (Math.abs(now - timestampMs) > 10 * 60 * 1000) {
    console.warn('❌ EventSub timestamp too old or in future');
    return false;
  }
  
  // Create HMAC signature
  const message = messageId + timestamp + rawBody;
  const expectedDigestHex = crypto
    .createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('hex');

  const signaturePrefix = 'sha256=';
  if (!signature.startsWith(signaturePrefix)) {
    return false;
  }

  const providedDigestHex = signature.slice(signaturePrefix.length);
  if (!/^[a-f0-9]{64}$/i.test(providedDigestHex)) {
    return false;
  }

  const providedDigest = Buffer.from(providedDigestHex, 'hex');
  const expectedDigest = Buffer.from(expectedDigestHex, 'hex');

  // Prevent timingSafeEqual from throwing on malformed signatures
  if (providedDigest.length !== expectedDigest.length) {
    return false;
  }
  
  // Compare digest bytes using timing-safe comparison
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Get EventSub webhook callback URL
 */
function getEventSubWebhookUrl(req: Request): string {
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

/**
 * Handle EventSub webhook requests
 */
function handleEventSubWebhook(req: Request, res: Response, eventStore: EventStore): Response {
  const messageType = req.headers['twitch-eventsub-message-type'];

  if (!EVENTSUB_SECRET) {
    return res.status(503).send('EventSub is not configured');
  }
  
  // Verify HMAC signature for all EventSub message types, including challenge.
  if (!req.rawBody) {
    console.warn('❌ Missing raw body for EventSub signature verification');
    return res.status(400).send('Invalid request body');
  }

  if (!verifyEventSubSignature(req.headers as EventSubHeaders, req.rawBody, EVENTSUB_SECRET)) {
    console.warn('❌ Invalid EventSub signature, rejecting request');
    return res.status(403).send('Forbidden: Invalid signature');
  }

  const parsedBody: EventSubEvent = req.body;
  
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
  return res.status(400).send('Unknown message type');
}

/**
 * Handle EventSub subscription creation
 */
async function handleEventSubSubscription(
  req: Request, 
  res: Response, 
  getUserByOverlayToken: (token: string) => UserData | null
): Promise<Response> {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing JSON body' });
  }

  const { token, eventType } = req.body;
  
  if (!token || typeof token !== 'string' || !eventType || typeof eventType !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid token/eventType' });
  }

  const userData = getUserByOverlayToken(token);
  if (!userData) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!EVENTSUB_SECRET) {
    return res.status(500).json({ error: 'EventSub secret is not configured' });
  }

  try {
    const clientId = process.env.TWITCH_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'TWITCH_CLIENT_ID is not configured' });
    }

    const webhookUrl = getEventSubWebhookUrl(req);
    
    const subscriptionData: EventSubSubscriptionData = {
      type: eventType,
      version: '1',
      condition: {
        broadcaster_user_id: userData.twitchUserId
      },
      transport: {
        method: 'webhook',
        callback: webhookUrl,
        secret: EVENTSUB_SECRET
      }
    };

    const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userData.accessToken}`,
        'Client-Id': clientId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscriptionData)
    });

    const result = await response.json();
    return res.status(response.status).json(result);
  } catch (error) {
    console.error('EventSub subscription error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to create subscription', details: errorMessage });
  }
}

/**
 * Handle EventSub events deletion
 */
function handleEventSubEventsDeletion(
  req: Request, 
  res: Response, 
  getUserByOverlayToken: (token: string) => UserData | null, 
  eventStore: EventStore
): Response {
  const { token } = req.query;
  
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Missing token' });
  }

  const userData = getUserByOverlayToken(token);
  if (!userData) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  eventStore.clearEvents();
  return res.json({ message: 'Events cleared', timestamp: new Date().toISOString() });
}

// Create default event store instance
const defaultEventStore = new EventStore();

export {
  verifyEventSubSignature,
  getEventSubWebhookUrl,
  handleEventSubWebhook,
  handleEventSubSubscription,
  handleEventSubEventsDeletion,
  defaultEventStore,
  // Export constants for use by main server
  EVENTSUB_SECRET
};