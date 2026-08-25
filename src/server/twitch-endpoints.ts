/**
 * Twitch API Endpoint Handlers
 * Configuration-driven approach with single generic handler
 */

import type { Request, Response } from 'express';
import { 
  makeTwitchApiCall, 
  buildTwitchHeaders, 
  buildOAuthHeaders, 
  buildApiUrl,
  type UserData,
  type TwitchApiResponse 
} from './twitch-api-client.js';
import { EventStore, type EventSubEvent } from './eventsub-handler.js';

import { getLastEvents } from './storage.js';
import type { LastFollowerData, LastSubscriberData } from './storage.js';

export interface LastEventsResponse {
  lastFollower?: LastFollowerData;
  lastSubscriber?: LastSubscriberData;
}

export interface EndpointConfig {
  url: string;
  headers: 'twitch' | 'oauth';
  params?: (userData: UserData) => Record<string, string | number>;
  errorMessage?: string;
}

export interface EndpointConfigs {
  [key: string]: EndpointConfig;
}

// Use proper EventSub types instead of any[]
export interface EventsResponse {
  events: EventSubEvent[];
  total: number;
}

export interface LiveDataResponse {
  stream?: TwitchApiResponse;
  followers?: TwitchApiResponse;
  subscribers?: TwitchApiResponse;
  lastEvents: LastEventsResponse;
  fetchedAt: string;
}

const LIVE_DATA_CACHE_MS = 25_000;
const liveDataCache = new Map<string, { data: LiveDataResponse; expiresAt: number }>();
const liveDataRequests = new Map<string, Promise<LiveDataResponse>>();

// Endpoint configurations - all the differences between endpoints in one place
const endpointConfigs: EndpointConfigs = {
  user: {
    url: 'https://api.twitch.tv/helix/users',
    headers: 'twitch'
  },
  channel: {
    url: 'https://api.twitch.tv/helix/channels',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId }),
    headers: 'twitch'
  },
  stream: {
    url: 'https://api.twitch.tv/helix/streams',
    params: (userData: UserData) => ({ user_id: userData.twitchUserId }),
    headers: 'twitch'
  },
  followers: {
    url: 'https://api.twitch.tv/helix/channels/followers',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId, first: 10 }),
    headers: 'twitch',
    errorMessage: 'Followers endpoint requires special permissions'
  },
  subscribers: {
    url: 'https://api.twitch.tv/helix/subscriptions',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId, first: 10 }),
    headers: 'twitch',
    errorMessage: 'Subscribers endpoint requires special permissions'
  },
  validate: {
    url: 'https://id.twitch.tv/oauth2/validate',
    headers: 'oauth'
  },
  clips: {
    url: 'https://api.twitch.tv/helix/clips',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId, first: 10 }),
    headers: 'twitch',
    errorMessage: 'Clips endpoint failed'
  },
  videos: {
    url: 'https://api.twitch.tv/helix/videos',
    params: (userData: UserData) => ({ user_id: userData.twitchUserId, first: 5, type: 'archive' }),
    headers: 'twitch',
    errorMessage: 'Videos endpoint failed'
  },
  schedule: {
    url: 'https://api.twitch.tv/helix/schedule',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId }),
    headers: 'twitch',
    errorMessage: 'Schedule endpoint failed'
  },
  polls: {
    url: 'https://api.twitch.tv/helix/polls',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId, first: 5 }),
    headers: 'twitch',
    errorMessage: 'Polls endpoint requires broadcaster scope'
  },
  predictions: {
    url: 'https://api.twitch.tv/helix/predictions',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId, first: 5 }),
    headers: 'twitch',
    errorMessage: 'Predictions endpoint requires broadcaster scope'
  },
  goals: {
    url: 'https://api.twitch.tv/helix/goals',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId }),
    headers: 'twitch',
    errorMessage: 'Goals endpoint requires broadcaster scope'
  },
  emotes: {
    url: 'https://api.twitch.tv/helix/chat/emotes',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId }),
    headers: 'twitch',
    errorMessage: 'Emotes endpoint failed'
  },
  chatters: {
    url: 'https://api.twitch.tv/helix/chat/chatters',
    params: (userData: UserData) => ({ 
      broadcaster_id: userData.twitchUserId, 
      moderator_id: userData.twitchUserId, 
      first: 100 
    }),
    headers: 'twitch',
    errorMessage: 'Chatters endpoint requires moderator scope'
  },
  moderators: {
    url: 'https://api.twitch.tv/helix/moderation/moderators',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId }),
    headers: 'twitch',
    errorMessage: 'Moderators endpoint requires moderation scope'
  },
  vips: {
    url: 'https://api.twitch.tv/helix/channels/vips',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId }),
    headers: 'twitch',
    errorMessage: 'VIPs endpoint requires broadcaster scope'
  },
  hypetrain: {
    url: 'https://api.twitch.tv/helix/hypetrain/status',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId }),
    headers: 'twitch',
    errorMessage: 'Hype Train status requires channel:read:hype_train scope'
  },
  bits: {
    url: 'https://api.twitch.tv/helix/bits/leaderboard',
    params: (userData: UserData) => ({ user_id: userData.twitchUserId }),
    headers: 'twitch',
    errorMessage: 'Bits leaderboard requires bits:read scope'
  },
  channelpoints: {
    url: 'https://api.twitch.tv/helix/channel_points/custom_rewards',
    params: (userData: UserData) => ({ broadcaster_id: userData.twitchUserId }),
    headers: 'twitch',
    errorMessage: 'Channel points requires channel:read:redemptions scope'
  }
};

/**
 * Generic handler for standard Twitch API endpoints
 * Replaces 20 nearly identical functions with configuration-driven approach
 */
async function handleTwitchApiEndpoint(
  endpoint: string, 
  userData: UserData, 
  res: Response
): Promise<TwitchApiResponse | null> {
  const config = endpointConfigs[endpoint];
  
  if (!config) {
    throw new Error(`No configuration found for endpoint: ${endpoint}`);
  }

  // Build headers based on config
  const headers = config.headers === 'oauth' ? 
    buildOAuthHeaders(userData) : 
    buildTwitchHeaders(userData);

  // Build URL with parameters if needed
  const url = config.params ? 
    buildApiUrl(config.url, config.params(userData)) : 
    config.url;

  return await makeTwitchApiCall(url, headers, res, config.errorMessage);
}

/**
 * Special handler for games endpoint (requires two API calls)
 */
async function handleGamesEndpoint(userData: UserData, res: Response): Promise<TwitchApiResponse | null> {
  const headers = buildTwitchHeaders(userData);
  
  // Get current game from channel info first
  const channelUrl = buildApiUrl('https://api.twitch.tv/helix/channels', {
    broadcaster_id: userData.twitchUserId
  });
  
  const channelData = await makeTwitchApiCall(channelUrl, headers, res, 'Games endpoint failed');
  if (!channelData) return null; // Error already handled
  
  if (channelData.data?.[0]?.game_id) {
    const gameUrl = buildApiUrl('https://api.twitch.tv/helix/games', {
      id: channelData.data[0].game_id
    });
    return await makeTwitchApiCall(gameUrl, headers, res, 'Games endpoint failed');
  } else {
    return { data: [], message: 'No game currently set' };
  }
}

async function fetchTwitchData(url: string, userData: UserData): Promise<TwitchApiResponse> {
  const response = await fetch(url, { headers: buildTwitchHeaders(userData) as HeadersInit });
  const data = await response.json() as TwitchApiResponse;
  if (!response.ok) {
    throw new Error(`Twitch returned ${response.status}: ${data.message ?? data.error ?? 'request failed'}`);
  }
  return data;
}

async function fetchLiveData(userData: UserData): Promise<LiveDataResponse> {
  const streamUrl = buildApiUrl(endpointConfigs.stream.url, endpointConfigs.stream.params!(userData));
  const followersUrl = buildApiUrl(endpointConfigs.followers.url, endpointConfigs.followers.params!(userData));
  const subscribersUrl = buildApiUrl(endpointConfigs.subscribers.url, endpointConfigs.subscribers.params!(userData));
  const [streamResult, followersResult, subscribersResult] = await Promise.allSettled([
    fetchTwitchData(streamUrl, userData),
    fetchTwitchData(followersUrl, userData),
    fetchTwitchData(subscribersUrl, userData),
  ]);

  for (const [name, result] of [
    ['stream', streamResult],
    ['followers', followersResult],
    ['subscribers', subscribersResult],
  ] as const) {
    if (result.status === 'rejected') {
      console.warn(`[live-data] ${name} request failed for ${userData.username}:`, result.reason);
    }
  }

  return {
    ...(streamResult.status === 'fulfilled' ? { stream: streamResult.value } : {}),
    ...(followersResult.status === 'fulfilled' ? { followers: followersResult.value } : {}),
    ...(subscribersResult.status === 'fulfilled' ? { subscribers: subscribersResult.value } : {}),
    lastEvents: getLastEvents(userData.username),
    fetchedAt: new Date().toISOString(),
  };
}

async function handleLiveDataEndpoint(userData: UserData): Promise<LiveDataResponse> {
  const cached = liveDataCache.get(userData.username);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const existingRequest = liveDataRequests.get(userData.username);
  if (existingRequest) return existingRequest;

  const request = fetchLiveData(userData).then((data) => {
    liveDataCache.set(userData.username, { data, expiresAt: Date.now() + LIVE_DATA_CACHE_MS });
    return data;
  }).finally(() => {
    liveDataRequests.delete(userData.username);
  });
  liveDataRequests.set(userData.username, request);
  return request;
}

/**
 * Special handler for events endpoint (accesses local storage)
 */
const MAX_LIMIT = 500;

function parseLimit(value: unknown, defaultValue: number): number {
  if (typeof value !== 'string') return defaultValue;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, MAX_LIMIT);
}

function handleEventsEndpoint(req: Request, eventStore: EventStore): EventsResponse {
  const { type, limit } = req.query;
  
  if (type && typeof type === 'string') {
    const limitNum = parseLimit(limit, 20);
    return {
      events: eventStore.getEventsByType(type, limitNum),
      total: eventStore.events.filter(e => e.subscription.type === type).length
    };
  } else {
    const limitNum = parseLimit(limit, 50);
    return {
      events: eventStore.getEvents(limitNum),
      total: eventStore.events.length
    };
  }
}

// List of valid endpoint names
const validEndpoints: string[] = [...Object.keys(endpointConfigs), 'games', 'events', 'last-events', 'live'];

function handleLastEventsEndpoint(username: string): LastEventsResponse {
  return getLastEvents(username);
}

export {
  endpointConfigs,
  handleTwitchApiEndpoint,
  handleGamesEndpoint, 
  handleLiveDataEndpoint,
  handleEventsEndpoint,
  handleLastEventsEndpoint,
  validEndpoints
};