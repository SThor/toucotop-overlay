/**
 * Alert Relay Module
 * Broadcasts Twitch EventSub alerts (follow, sub, hype-train, etc.) to browser
 * overlay clients via SSE. One channel relay, shared across all connected clients.
 */

import type { Response } from 'express';

// ─── Alert payload types ─────────────────────────────────────────────────────

export type AlertType =
  | 'follow'
  | 'subscribe'
  | 'resubscribe'
  | 'gift_sub'
  | 'cheer'
  | 'raid'
  | 'hype_train_begin'
  | 'hype_train_progress'
  | 'hype_train_end';

export interface AlertPayload {
  /** Unique id for this alert event */
  id: string;
  type: AlertType;
  /** ISO timestamp */
  timestamp: string;
  // ── per-type optional fields ──────────────────────────────────────────────
  /** Display name of the acting user (follower, subscriber, raider, cheerer…) */
  userName?: string;
  /** Sub tier: '1000' | '2000' | '3000' */
  tier?: string;
  /** Whether this is a gifted sub */
  isGift?: boolean;
  /** Gifter display name */
  gifterName?: string;
  /** Re-sub cumulative months */
  cumulativeMonths?: number;
  /** Streak months for re-sub */
  streakMonths?: number;
  /** Re-sub / custom reward message */
  message?: string;
  /** Number of gifted subs in a gift-bomb */
  giftCount?: number;
  /** Bits amount for cheers */
  bits?: number;
  /** Raiding channel display name */
  raiderName?: string;
  /** Viewer count for raids */
  viewerCount?: number;
  /** Hype train level */
  level?: number;
  /** Hype train progress 0-100 */
  progress?: number;
}

// ─── SSE infrastructure ───────────────────────────────────────────────────────

interface SSEClient {
  res: Response;
}

interface ChannelAlertRelay {
  clients: Set<SSEClient>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const CLEANUP_DELAY_MS = 30_000;
const KEEPALIVE_INTERVAL_MS = 15_000;

const channelRelays = new Map<string, ChannelAlertRelay>();

function sendSSE(client: SSEClient, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client disconnected – cleaned up via 'close' event
  }
}

function getOrCreateRelay(channel: string): ChannelAlertRelay {
  const existing = channelRelays.get(channel);
  if (existing) {
    if (existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer);
      existing.cleanupTimer = null;
    }
    return existing;
  }
  const relay: ChannelAlertRelay = { clients: new Set(), cleanupTimer: null };
  channelRelays.set(channel, relay);
  return relay;
}

function scheduleCleanup(channel: string): void {
  const relay = channelRelays.get(channel);
  if (!relay) return;
  relay.cleanupTimer = setTimeout(() => {
    if (relay.clients.size === 0) {
      channelRelays.delete(channel);
      console.log(`🔔 Alert relay removed for channel: ${channel}`);
    }
  }, CLEANUP_DELAY_MS);
}

/**
 * Add a new SSE client for the given channel's alert stream.
 * Called from the express route handler.
 */
export function addAlertSSEClient(channel: string, res: Response): void {
  const relay = getOrCreateRelay(channel);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const client: SSEClient = { res };
  relay.clients.add(client);

  // Confirm connection
  sendSSE(client, 'connected', { channel });

  // Keepalive heartbeat
  const keepaliveTimer = setInterval(() => {
    sendSSE(client, 'keepalive', { ts: Date.now() });
  }, KEEPALIVE_INTERVAL_MS);

  res.on('close', () => {
    clearInterval(keepaliveTimer);
    relay.clients.delete(client);
    console.log(`🔔 Alert SSE client disconnected (${channel}), ${relay.clients.size} remaining`);
    if (relay.clients.size === 0) {
      scheduleCleanup(channel);
    }
  });

  console.log(`🔔 Alert SSE client connected (${channel}), total: ${relay.clients.size}`);
}

/**
 * Broadcast an alert to all SSE clients subscribed to the channel.
 * Called from the EventSub webhook handler.
 */
export function broadcastAlert(channel: string, payload: AlertPayload): void {
  const relay = channelRelays.get(channel);
  if (!relay || relay.clients.size === 0) return;
  for (const client of relay.clients) {
    sendSSE(client, 'alert', payload);
  }
  console.log(`🔔 Alert broadcast to ${relay.clients.size} client(s) on ${channel}: ${payload.type}`);
}
