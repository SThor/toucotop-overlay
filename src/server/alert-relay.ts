/**
 * Alert Relay Module
 * Broadcasts Twitch EventSub alerts (follow, sub, hype-train, etc.) to browser
 * overlay clients via SSE. One channel relay, shared across all connected clients.
 */

import type { Response } from 'express';
import { extendOverlayToken } from './storage.js';
export type { AlertType, AlertPayload } from './shared/alertTypes.js';
import type { AlertPayload } from './shared/alertTypes.js';

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
// Extend overlay token at most once per hour per channel on keepalive
const KEEPALIVE_EXTEND_DEBOUNCE_MS = 60 * 60 * 1000;
const keepaliveExtendLastRun = new Map<string, number>();

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
  // Clear any previously scheduled cleanup to avoid multiple timers accumulating
  if (relay.cleanupTimer) {
    clearTimeout(relay.cleanupTimer);
    relay.cleanupTimer = null;
  }
  relay.cleanupTimer = setTimeout(() => {
    relay.cleanupTimer = null;
    if (relay.clients.size === 0) {
      channelRelays.delete(channel);
      keepaliveExtendLastRun.delete(channel);
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

  // Keepalive heartbeat + debounced token extension
  const keepaliveTimer = setInterval(() => {
    sendSSE(client, 'keepalive', { ts: Date.now() });
    const now = Date.now();
    const lastExtended = keepaliveExtendLastRun.get(channel) ?? 0;
    if (now - lastExtended > KEEPALIVE_EXTEND_DEBOUNCE_MS) {
      keepaliveExtendLastRun.set(channel, now);
      extendOverlayToken(channel);
    }
  }, KEEPALIVE_INTERVAL_MS);

  res.on('close', () => {
    clearInterval(keepaliveTimer);
    relay.clients.delete(client);
    console.log(`🔔 Alert SSE client disconnected (${channel}), ${relay.clients.size} remaining`);
    if (relay.clients.size === 0) {
      keepaliveExtendLastRun.delete(channel);
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
