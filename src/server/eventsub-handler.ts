/**
 * Twitch EventSub Handler
 * Webhook verification, event storage, and subscription management
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { UserData } from './twitch-api-client.js';
import { updateLastFollower, updateLastSubscriber } from './storage.js';
import { broadcastAlert } from './alert-relay.js';

// EventSub configuration constants
const MIN_EVENTSUB_SECRET_LENGTH = 32;
const EVENTSUB_SECRET = process.env.EVENTSUB_SECRET;
const EVENTSUB_CALLBACK_URL = process.env.EVENTSUB_CALLBACK_URL;
const EVENTSUB_PUBLIC_BASE_URL = process.env.EVENTSUB_PUBLIC_BASE_URL;
const EVENTSUB_ALLOWED_HOSTS = (process.env.EVENTSUB_ALLOWED_HOSTS || '')
  .split(',')
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_ALERT_EVENTSUB_TYPES = [
  'channel.follow',
  'channel.subscribe',
  'channel.subscription.message',
  'channel.subscription.gift',
  'channel.cheer',
  'channel.raid',
  'channel.hype_train.begin',
  'channel.hype_train.progress',
  'channel.hype_train.end',
] as const;

interface AppAccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedAppAccessToken: { token: string; expiresAt: number } | null = null;

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function pickDisplayName(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const normalized = toOptionalString(candidate);
    if (normalized !== undefined) {
      return normalized;
    }
  }
  return undefined;
}

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

async function getAppAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAppAccessToken && cachedAppAccessToken.expiresAt > now + 60_000) {
    return cachedAppAccessToken.token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Webhook transport subscriptions require an app access token.
    // This means both TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be present.
    throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required to create an app access token');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Twitch app access token: ${response.status} ${errorText}`);
  }

  const tokenResponse = await response.json() as AppAccessTokenResponse;
  if (!tokenResponse.access_token || !tokenResponse.expires_in) {
    throw new Error('Twitch app access token response was missing access_token or expires_in');
  }

  cachedAppAccessToken = {
    token: tokenResponse.access_token,
    expiresAt: now + (tokenResponse.expires_in * 1000),
  };

  return tokenResponse.access_token;
}

function buildSubscriptionData(
  eventType: string,
  userData: UserData,
  webhookUrl: string,
  secret: string,
): EventSubSubscriptionData {
  const condition = eventType === 'channel.follow'
    ? {
        broadcaster_user_id: userData.twitchUserId,
        moderator_user_id: userData.twitchUserId,
      }
    : eventType === 'channel.raid'
      ? {
          to_broadcaster_user_id: userData.twitchUserId,
        }
      : {
          broadcaster_user_id: userData.twitchUserId,
        };

  return {
    type: eventType,
    version: eventType === 'channel.follow' ? '2' : '1',
    condition,
    transport: {
      method: 'webhook',
      callback: webhookUrl,
      secret,
    },
  };
}

async function createEventSubSubscription(
  subscriptionData: EventSubSubscriptionData,
): Promise<{ ok: boolean; status: number; result: unknown }> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    throw new Error('TWITCH_CLIENT_ID is not configured');
  }

  const appAccessToken = await getAppAccessToken();
  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appAccessToken}`,
      'Client-Id': clientId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(subscriptionData),
  });

  const result = await response.json();

  // Twitch returns 409 when the same subscription already exists.
  if (response.status === 409) {
    return { ok: true, status: response.status, result };
  }

  return { ok: response.ok, status: response.status, result };
}

async function ensureDefaultEventSubSubscriptions(req: Request, userData: UserData): Promise<void> {
  if (!EVENTSUB_SECRET) {
    throw new Error('EventSub secret is not configured');
  }

  const webhookUrl = getEventSubWebhookUrl(req);
  const results = await Promise.all(
    DEFAULT_ALERT_EVENTSUB_TYPES.map(async (eventType) => {
      const subscriptionData = buildSubscriptionData(eventType, userData, webhookUrl, EVENTSUB_SECRET);
      const createResult = await createEventSubSubscription(subscriptionData);
      return { eventType, ...createResult };
    }),
  );

  for (const result of results) {
    if (!result.ok) {
      console.warn(`⚠️ EventSub ensure failed for ${result.eventType}: status ${result.status}`);
    }
  }
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

    const eventData = parsedBody.event ?? {};
    const broadcasterLogin: string = typeof eventData['broadcaster_user_login'] === 'string'
      ? eventData['broadcaster_user_login']
      : '';
    const raidTargetLogin: string = typeof eventData['to_broadcaster_user_login'] === 'string'
      ? eventData['to_broadcaster_user_login']
      : '';

    const subType = parsedBody.subscription.type;
    const targetChannel = subType === 'channel.raid' ? raidTargetLogin : broadcasterLogin;

    if (targetChannel) {
      const actorName = pickDisplayName(eventData['user_name'], eventData['user_login']);

      if (subType === 'channel.follow') {
        updateLastFollower(targetChannel, {
          userId: String(eventData['user_id'] ?? ''),
          userName: String(eventData['user_login'] ?? ''),
          userDisplayName: String(eventData['user_name'] ?? eventData['user_login'] ?? ''),
          followedAt: String(eventData['followed_at'] ?? new Date().toISOString()),
        });
        broadcastAlert(targetChannel, {
          id: `follow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'follow',
          timestamp: new Date().toISOString(),
          ...(actorName !== undefined ? { userName: actorName } : {}),
        });
      } else if (subType === 'channel.subscribe') {
        const gifterLogin = Boolean(eventData['is_gift']) && typeof eventData['gifter_user_login'] === 'string'
          ? eventData['gifter_user_login'] as string
          : undefined;
        updateLastSubscriber(targetChannel, {
          userId: String(eventData['user_id'] ?? ''),
          userName: String(eventData['user_login'] ?? ''),
          userDisplayName: String(eventData['user_name'] ?? eventData['user_login'] ?? ''),
          tier: String(eventData['tier'] ?? '1000'),
          isGift: Boolean(eventData['is_gift']),
          ...(gifterLogin !== undefined ? { gifterName: gifterLogin } : {}),
          subscribedAt: new Date().toISOString(),
        });
        // channel.subscribe fires for both regular and individual gifted subs.
        // Keep type as 'subscribe' in both cases: the overlay uses isGift + gifterName
        // to distinguish them. 'gift_sub' is reserved for channel.subscription.gift
        // (gift bombs) where userName is the gifter, not the recipient.
        broadcastAlert(targetChannel, {
          id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'subscribe',
          timestamp: new Date().toISOString(),
          ...(actorName !== undefined ? { userName: actorName } : {}),
          tier: String(eventData['tier'] ?? '1000'),
          isGift: Boolean(eventData['is_gift']),
          ...(gifterLogin !== undefined ? { gifterName: gifterLogin } : {}),
        });
      } else if (subType === 'channel.subscription.message') {
        const cumMonths = typeof eventData['cumulative_months'] === 'number' ? eventData['cumulative_months'] : undefined;
        const streakMo = typeof eventData['streak_months'] === 'number' ? eventData['streak_months'] : undefined;
        const resubMsg = typeof eventData['message']?.['text'] === 'string' ? eventData['message']['text'] as string : undefined;
        broadcastAlert(targetChannel, {
          id: `resub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'resubscribe',
          timestamp: new Date().toISOString(),
          ...(actorName !== undefined ? { userName: actorName } : {}),
          tier: String(eventData['tier'] ?? '1000'),
          ...(cumMonths !== undefined ? { cumulativeMonths: cumMonths } : {}),
          ...(streakMo !== undefined ? { streakMonths: streakMo } : {}),
          ...(resubMsg !== undefined ? { message: resubMsg } : {}),
        });
      } else if (subType === 'channel.subscription.gift') {
        broadcastAlert(targetChannel, {
          id: `giftsub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'gift_sub',
          timestamp: new Date().toISOString(),
          ...(actorName !== undefined ? { userName: actorName } : {}),
          tier: String(eventData['tier'] ?? '1000'),
          giftCount: typeof eventData['total'] === 'number' ? eventData['total'] : 1,
        });
      } else if (subType === 'channel.cheer') {
        const cheerBits = typeof eventData['bits'] === 'number' ? eventData['bits'] : undefined;
        const cheerMsg = typeof eventData['message'] === 'string' ? eventData['message'] as string : undefined;
        const cheerActor = Boolean(eventData['is_anonymous']) ? undefined : actorName;
        broadcastAlert(targetChannel, {
          id: `cheer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'cheer',
          timestamp: new Date().toISOString(),
          ...(cheerActor !== undefined ? { userName: cheerActor } : {}),
          ...(cheerBits !== undefined ? { bits: cheerBits } : {}),
          ...(cheerMsg !== undefined ? { message: cheerMsg } : {}),
        });
      } else if (subType === 'channel.raid') {
        const raidViewers = typeof eventData['viewers'] === 'number' ? eventData['viewers'] : undefined;
        const raiderName = pickDisplayName(eventData['from_broadcaster_user_name'], eventData['from_broadcaster_user_login']);
        broadcastAlert(targetChannel, {
          id: `raid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'raid',
          timestamp: new Date().toISOString(),
          ...(raiderName !== undefined ? { raiderName } : {}),
          ...(raidViewers !== undefined ? { viewerCount: raidViewers } : {}),
        });
      } else if (subType === 'channel.hype_train.begin') {
        broadcastAlert(targetChannel, {
          id: `hypetrain_begin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'hype_train_begin',
          timestamp: new Date().toISOString(),
          level: typeof eventData['level'] === 'number' ? eventData['level'] : 1,
          progress: typeof eventData['progress'] === 'number' ? eventData['progress'] : 0,
        });
      } else if (subType === 'channel.hype_train.progress') {
        const htLevel = typeof eventData['level'] === 'number' ? eventData['level'] : undefined;
        const htProgress = typeof eventData['progress'] === 'number' ? eventData['progress'] : undefined;
        broadcastAlert(targetChannel, {
          id: `hypetrain_progress_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'hype_train_progress',
          timestamp: new Date().toISOString(),
          ...(htLevel !== undefined ? { level: htLevel } : {}),
          ...(htProgress !== undefined ? { progress: htProgress } : {}),
        });
      } else if (subType === 'channel.hype_train.end') {
        const htEndLevel = typeof eventData['level'] === 'number' ? eventData['level'] : undefined;
        broadcastAlert(targetChannel, {
          id: `hypetrain_end_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'hype_train_end',
          timestamp: new Date().toISOString(),
          ...(htEndLevel !== undefined ? { level: htEndLevel } : {}),
        });
      }
    }

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
    const webhookUrl = getEventSubWebhookUrl(req);
    const subscriptionData = buildSubscriptionData(eventType, userData, webhookUrl, EVENTSUB_SECRET);
    const createResult = await createEventSubSubscription(subscriptionData);
    return res.status(createResult.status).json(createResult.result);
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
  ensureDefaultEventSubSubscriptions,
  defaultEventStore,
  // Export constants for use by main server
  EVENTSUB_SECRET
};