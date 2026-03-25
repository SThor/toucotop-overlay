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

// Type definitions for endpoint configuration
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

/**
 * Special handler for events endpoint (accesses local storage)
 */
function handleEventsEndpoint(req: Request, eventStore: EventStore): EventsResponse {
  const { type, limit } = req.query;
  
  if (type && typeof type === 'string') {
    const limitNum = typeof limit === 'string' ? parseInt(limit) : 20;
    return {
      events: eventStore.getEventsByType(type, limitNum || 20),
      total: eventStore.events.filter(e => e.subscription.type === type).length
    };
  } else {
    const limitNum = typeof limit === 'string' ? parseInt(limit) : 50;
    return {
      events: eventStore.getEvents(limitNum || 50),
      total: eventStore.events.length
    };
  }
}

// List of valid endpoint names
const validEndpoints: string[] = [...Object.keys(endpointConfigs), 'games', 'events'];

export {
  endpointConfigs,
  handleTwitchApiEndpoint,
  handleGamesEndpoint, 
  handleEventsEndpoint,
  validEndpoints
};