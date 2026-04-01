import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from './SettingsContext';
import { useChatStream } from '../hooks/useChatStream';
import { useServerApi } from '../hooks/useServerApi';

export interface TwitchChatMessage {
  id: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: Date;
  color?: string;
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
    urls: EmoteUrls;
  }>;
}

export interface EmoteUrls {
  '1x': string;
  '2x': string;
  '3x': string;
  '1x_static': string;
  '2x_static': string;
  '3x_static': string;
}

export interface CachedEmote {
  id: string;
  name: string;
  urls: EmoteUrls;
}

export interface TwitchStreamInfo {
  id: string;
  title: string;
  gameName: string;
  startedAt: Date;
  viewerCount: number;
  isLive: boolean;
}

export interface TwitchFollower {
  userId: string;
  userName: string;
  userDisplayName: string;
  followDate: Date;
}

export interface TwitchSubscriber {
  userId: string;
  userName: string;
  userDisplayName: string;
  tier: string;
  isGift: boolean;
  gifterName?: string;
  subscribeDate: Date;
}

interface TwitchContextType {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  messages: TwitchChatMessage[];
  cachedEmotes: Map<string, CachedEmote>;
  streamInfo: TwitchStreamInfo | null;
  isLoadingStreamInfo: boolean;
  lastFollower: TwitchFollower | null;
  lastSubscriber: TwitchSubscriber | null;
  followerCount: number;
  clearMessages: () => void;
  getEmoteByName: (name: string) => CachedEmote | undefined;
}

const TwitchContext = createContext<TwitchContextType | undefined>(undefined);

const useTwitch = () => {
  const context = useContext(TwitchContext);
  if (!context) {
    throw new Error('useTwitch must be used within a TwitchProvider');
  }
  return context;
};

interface TwitchProviderProps {
  children: React.ReactNode;
}

type TwitchProviderComponent = React.FC<TwitchProviderProps> & {
  useTwitch: typeof useTwitch;
};

// Polling intervals
const STREAM_POLL_MS = 30_000;
const FOLLOWERS_POLL_MS = 10 * 60_000;
const SUBSCRIBERS_POLL_MS = 10 * 60_000;

// Twitch API response shapes (subset we need)
interface TwitchStreamData {
  id: string;
  title: string;
  game_name: string;
  started_at: string;
  viewer_count: number;
}

interface TwitchFollowerData {
  user_id: string;
  user_login: string;
  user_name: string;
  followed_at: string;
}

interface TwitchSubscriberData {
  user_id: string;
  user_login: string;
  user_name: string;
  tier: string;
  is_gift: boolean;
  gifter_name?: string;
}

interface TwitchEmoteData {
  id: string;
  name: string;
  format: string[];
  theme_mode: string[];
  scale: string[];
}

export const TwitchProvider: TwitchProviderComponent = ({ children }) => {
  const { settings } = useSettings();
  const { fetchApi, hasToken } = useServerApi();
  const { messages, isConnected: chatConnected, error: chatError, clearMessages } = useChatStream();

  const [streamInfo, setStreamInfo] = useState<TwitchStreamInfo | null>(null);
  const [isLoadingStreamInfo, setIsLoadingStreamInfo] = useState(false);
  const [lastFollower, setLastFollower] = useState<TwitchFollower | null>(null);
  const [lastSubscriber, setLastSubscriber] = useState<TwitchSubscriber | null>(null);
  const [followerCount, setFollowerCount] = useState(0);

  const [cachedEmotes, setCachedEmotes] = useState<Map<string, CachedEmote>>(new Map());
  const emotesLoadedRef = useRef<string>('');

  // Suppress unused variable warning — settings may be used for future config
  void settings;

  // --- Stream info polling ---
  const fetchStreamInfo = useCallback(async () => {
    try {
      const data = await fetchApi<{ data: TwitchStreamData[] }>('stream');
      if (!data) return;

      if (data.data.length > 0) {
        const s = data.data[0];
        setStreamInfo({
          id: s.id,
          title: s.title,
          gameName: s.game_name,
          startedAt: new Date(s.started_at),
          viewerCount: s.viewer_count,
          isLive: true,
        });
      } else {
        setStreamInfo((prev) =>
          prev ? { ...prev, isLive: false, viewerCount: 0 } : null
        );
      }
    } finally {
      setIsLoadingStreamInfo(false);
    }
  }, [fetchApi]);

  // --- Followers polling ---
  const fetchFollowers = useCallback(async () => {
    const data = await fetchApi<{ data: TwitchFollowerData[]; total: number }>('followers');
    if (!data) return;

    setFollowerCount(data.total ?? 0);
    if (data.data.length > 0) {
      const f = data.data[0];
      setLastFollower({
        userId: f.user_id,
        userName: f.user_login,
        userDisplayName: f.user_name,
        followDate: new Date(f.followed_at),
      });
    }
  }, [fetchApi]);

  // --- Subscribers polling ---
  const fetchSubscribers = useCallback(async () => {
    const data = await fetchApi<{ data: TwitchSubscriberData[]; total: number }>('subscribers');
    if (!data) return;

    if (data.data.length > 0) {
      const s = data.data[0];
      setLastSubscriber({
        userId: s.user_id,
        userName: s.user_login,
        userDisplayName: s.user_name,
        tier: s.tier,
        isGift: s.is_gift,
        gifterName: s.gifter_name,
        subscribeDate: new Date(), // Twitch subscriptions API doesn't include date
      });
    }
  }, [fetchApi]);

  // --- Emotes (one-time fetch per token) ---
  const fetchEmotes = useCallback(async () => {
    const currentToken = settings.overlayToken;
    if (emotesLoadedRef.current === currentToken) return;
    const data = await fetchApi<{ data: TwitchEmoteData[] }>('emotes');
    if (!data) return;

    const map = new Map<string, CachedEmote>();
    for (const emote of data.data) {
      const base = `https://static-cdn.jtvnps.net/emoticons/v2/${emote.id}`;
      map.set(emote.name.toLowerCase(), {
        id: emote.id,
        name: emote.name,
        urls: {
          '1x': `${base}/default/dark/1.0`,
          '2x': `${base}/default/dark/2.0`,
          '3x': `${base}/default/dark/3.0`,
          '1x_static': `${base}/static/dark/1.0`,
          '2x_static': `${base}/static/dark/2.0`,
          '3x_static': `${base}/static/dark/3.0`,
        },
      });
    }
    setCachedEmotes(map);
    emotesLoadedRef.current = currentToken;
  }, [fetchApi, settings.overlayToken]);

  // --- Set up polling and initial fetches ---
  useEffect(() => {
    if (!hasToken) return;

    setIsLoadingStreamInfo(true);
    fetchStreamInfo();
    fetchFollowers();
    fetchSubscribers();
    fetchEmotes();

    const streamTimer = setInterval(fetchStreamInfo, STREAM_POLL_MS);
    const followersTimer = setInterval(fetchFollowers, FOLLOWERS_POLL_MS);
    const subscribersTimer = setInterval(fetchSubscribers, SUBSCRIBERS_POLL_MS);

    return () => {
      clearInterval(streamTimer);
      clearInterval(followersTimer);
      clearInterval(subscribersTimer);
    };
  }, [hasToken, fetchStreamInfo, fetchFollowers, fetchSubscribers, fetchEmotes]);

  const getEmoteByName = useCallback(
    (name: string): CachedEmote | undefined => cachedEmotes.get(name.toLowerCase()),
    [cachedEmotes]
  );

  const value: TwitchContextType = {
    isConnected: chatConnected,
    isConnecting: hasToken && !chatConnected && !chatError,
    error: chatError,
    messages,
    cachedEmotes,
    streamInfo,
    isLoadingStreamInfo,
    lastFollower,
    lastSubscriber,
    followerCount,
    clearMessages,
    getEmoteByName,
  };

  return <TwitchContext.Provider value={value}>{children}</TwitchContext.Provider>;
};

// Add the hook as a static property to avoid Fast Refresh issues
TwitchProvider.useTwitch = useTwitch;
