/**
 * Chat Relay Module
 * Connects to Twitch IRC (anonymous) and streams chat messages to browser clients via SSE.
 * One ChatClient per channel, shared across all SSE clients for that channel.
 */

import { ChatClient } from '@twurple/chat';
import type { Response } from 'express';
import { extendOverlayToken } from './storage.js';

// Payload types matching TwitchContext.tsx interface shapes (serialized for JSON)

interface EmoteUrlsPayload {
  '1x': string;
  '2x': string;
  '3x': string;
  '1x_static': string;
  '2x_static': string;
  '3x_static': string;
}

interface ChatMessagePayload {
  id: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: string;
  color?: string | undefined;
  badges: string[];
  isHighlight: boolean;
  isMod: boolean;
  isSubscriber: boolean;
  isVip: boolean;
  emotes?: Array<{
    id: string;
    name: string;
    startIndex: number;
    endIndex: number;
    urls: EmoteUrlsPayload;
  }> | undefined;
}

interface SSEClient {
  res: Response;
}

interface ChannelRelay {
  chatClient: ChatClient;
  clients: Set<SSEClient>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const CLEANUP_DELAY_MS = 30_000;
const KEEPALIVE_INTERVAL_MS = 15_000;

const channelRelays = new Map<string, ChannelRelay>();

function buildEmoteUrls(emoteId: string): EmoteUrlsPayload {
  const base = `https://static-cdn.jtvnps.net/emoticons/v2/${emoteId}`;
  return {
    '1x': `${base}/default/dark/1.0`,
    '2x': `${base}/default/dark/2.0`,
    '3x': `${base}/default/dark/3.0`,
    '1x_static': `${base}/static/dark/1.0`,
    '2x_static': `${base}/static/dark/2.0`,
    '3x_static': `${base}/static/dark/3.0`,
  };
}

function sendSSE(client: SSEClient, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client disconnected — will be cleaned up via the 'close' event
  }
}

function broadcastToChannel(channel: string, event: string, data: unknown): void {
  const relay = channelRelays.get(channel);
  if (!relay) return;
  for (const client of relay.clients) {
    sendSSE(client, event, data);
  }
}

async function getOrCreateRelay(channel: string): Promise<ChannelRelay> {
  const existing = channelRelays.get(channel);
  if (existing) {
    if (existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer);
      existing.cleanupTimer = null;
    }
    return existing;
  }

  console.log(`💬 Creating chat relay for channel: ${channel}`);

  const chatClient = new ChatClient({ channels: [channel] });

  const relay: ChannelRelay = {
    chatClient,
    clients: new Set(),
    cleanupTimer: null,
  };

  // Store early so broadcasts work even during connect
  channelRelays.set(channel, relay);

  chatClient.onMessage((_chan, _user, text, msg) => {
    const emotes: NonNullable<ChatMessagePayload['emotes']> = [];

    for (const [emoteId, positions] of msg.emoteOffsets) {
      for (const pos of positions) {
        const parts = pos.split('-');
        const startIndex = parseInt(parts[0] ?? '0', 10);
        const endIndex = parseInt(parts[1] ?? '0', 10);
        const name = text.substring(startIndex, endIndex + 1);

        emotes.push({
          id: emoteId,
          name,
          startIndex,
          endIndex,
          urls: buildEmoteUrls(emoteId),
        });
      }
    }

    const payload: ChatMessagePayload = {
      id: msg.id,
      username: msg.userInfo.userName,
      displayName: msg.userInfo.displayName,
      message: text,
      timestamp: msg.date.toISOString(),
      color: msg.userInfo.color || undefined,
      badges: Array.from(msg.userInfo.badges.keys()),
      isHighlight: msg.tags.get('msg-id') === 'highlighted-message',
      isMod: msg.userInfo.isMod,
      isSubscriber: msg.userInfo.isSubscriber,
      isVip: msg.userInfo.isVip,
      emotes: emotes.length > 0 ? emotes : undefined,
    };

    broadcastToChannel(channel, 'message', payload);
  });

  chatClient.onMessageRemove((_chan, messageId) => {
    broadcastToChannel(channel, 'delete', { messageId });
  });

  chatClient.onChatClear(() => {
    broadcastToChannel(channel, 'clear', {});
  });

  chatClient.onConnect(() => {
    console.log(`✅ Chat relay connected for channel: ${channel}`);
  });

  chatClient.onDisconnect((_manually, _reason) => {
    console.log(`❌ Chat relay disconnected for channel: ${channel}`);
  });

  try {
    await chatClient.connect();
  } catch (error) {
    console.error(`❌ Failed to connect chat relay for channel: ${channel}:`, error);
    chatClient.quit();
    channelRelays.delete(channel);
    throw error;
  }

  return relay;
}

function scheduleCleanup(channel: string): void {
  const relay = channelRelays.get(channel);
  if (!relay || relay.clients.size > 0) return;

  relay.cleanupTimer = setTimeout(() => {
    if (relay.clients.size === 0) {
      console.log(`🗑️ Cleaning up chat relay for channel: ${channel}`);
      relay.chatClient.quit();
      channelRelays.delete(channel);
    }
  }, CLEANUP_DELAY_MS);
}

/**
 * Add an SSE client for a channel's chat stream.
 * Creates the chat relay (anonymous IRC connection) if one doesn't exist yet.
 */
export function addSSEClient(channel: string, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const client: SSEClient = { res };

  getOrCreateRelay(channel)
    .then((relay) => {
      relay.clients.add(client);
      sendSSE(client, 'connected', { channel });

      const keepalive = setInterval(() => {
        try {
          res.write(':keepalive\n\n');
          // Extend overlay token on each keepalive so long-lived SSE
          // connections don't expire while the overlay is actively in use
          extendOverlayToken(channel);
        } catch {
          clearInterval(keepalive);
        }
      }, KEEPALIVE_INTERVAL_MS);

      res.on('close', () => {
        clearInterval(keepalive);
        relay.clients.delete(client);
        console.log(`👋 SSE client disconnected from channel: ${channel} (${relay.clients.size} remaining)`);
        scheduleCleanup(channel);
      });

      console.log(`📡 SSE client connected to channel: ${channel} (${relay.clients.size} total)`);
    })
    .catch((error) => {
      console.error(`❌ Failed to create chat relay for ${channel}:`, error);
      sendSSE(client, 'error', { error: 'Failed to connect to chat' });
      res.end();
    });
}
