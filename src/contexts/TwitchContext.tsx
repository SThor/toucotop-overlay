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
  /** May be undefined when the API response doesn't include a timestamp (e.g. subscriptions endpoint) */
  subscribeDate?: Date;
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
  subscriberCount: number;
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
const LAST_EVENTS_POLL_MS = 30_000;

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

interface TwitchLiveData {
  stream?: { data?: TwitchStreamData[] };
  followers?: { data?: TwitchFollowerData[]; total?: number };
  subscribers?: { data?: TwitchSubscriberData[]; total?: number };
  lastEvents?: {
    lastFollower?: { userId?: string; userName?: string; userDisplayName?: string; followedAt?: string };
    lastSubscriber?: { userId?: string; userName?: string; userDisplayName?: string; tier?: string; isGift?: boolean; gifterName?: string; subscribedAt?: string };
  };
}

export const TwitchProvider: TwitchProviderComponent = ({ children }) => {
  const { settings } = useSettings();
  const { fetchApi, hasToken } = useServerApi();
  const { messages, isConnected: chatConnected, isConnecting: chatConnecting, error: chatError, clearMessages } = useChatStream();

  const [streamInfo, setStreamInfo] = useState<TwitchStreamInfo | null>(null);
  const [isLoadingStreamInfo, setIsLoadingStreamInfo] = useState(false);
  const [lastFollower, setLastFollower] = useState<TwitchFollower | null>(null);
  const [lastSubscriber, setLastSubscriber] = useState<TwitchSubscriber | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);

  const [cachedEmotes, setCachedEmotes] = useState<Map<string, CachedEmote>>(new Map());
  const emotesLoadedRef = useRef<string>('');

  // Suppress unused variable warning — settings may be used for future config
  void settings;

  // --- Stream info polling ---
  const fetchStreamInfo = useCallback(async () => {
    setIsLoadingStreamInfo(true);
    try {
      const data = await fetchApi<{ data?: TwitchStreamData[] }>('stream');
      const list = data?.data;
      if (!Array.isArray(list)) return;

      if (list.length > 0) {
        const s = list[0];
        if (!s || typeof s.started_at !== 'string') return;
        setStreamInfo({
          id: typeof s.id === 'string' ? s.id : '',
          title: typeof s.title === 'string' ? s.title : '',
          gameName: typeof s.game_name === 'string' ? s.game_name : '',
          startedAt: new Date(s.started_at),
          viewerCount: typeof s.viewer_count === 'number' ? s.viewer_count : 0,
          isLive: true,
        });
      } else {
        setStreamInfo((prev) =>
          prev
            ? { ...prev, isLive: false, viewerCount: 0 }
            : { id: '', title: '', gameName: '', startedAt: new Date(), viewerCount: 0, isLive: false }
        );
      }
    } catch (err) {
      console.error('[TwitchContext] fetchStreamInfo failed:', err);
    } finally {
      setIsLoadingStreamInfo(false);
    }
  }, [fetchApi]);

  // --- Followers polling ---
  const fetchFollowers = useCallback(async () => {
    try {
      const data = await fetchApi<{ data?: TwitchFollowerData[]; total?: number }>('followers');
      const list = data?.data;
      if (!Array.isArray(list)) return;

      setFollowerCount(typeof data?.total === 'number' ? data.total : 0);
      if (list.length > 0) {
        const f = list[0];
        if (!f || typeof f.followed_at !== 'string') return;
        setLastFollower({
          userId: typeof f.user_id === 'string' ? f.user_id : '',
          userName: typeof f.user_login === 'string' ? f.user_login : '',
          userDisplayName: typeof f.user_name === 'string' ? f.user_name : '',
          followDate: new Date(f.followed_at),
        });
      }
    } catch (err) {
      console.error('[TwitchContext] fetchFollowers failed:', err);
    }
  }, [fetchApi]);

  // --- Subscribers polling ---
  const fetchSubscribers = useCallback(async () => {
    try {
      const data = await fetchApi<{ data?: TwitchSubscriberData[]; total?: number }>('subscribers');
      const list = data?.data;
      if (!Array.isArray(list)) return;

      setSubscriberCount(typeof data?.total === 'number' ? data.total : 0);

      if (list.length > 0) {
        const s = list[0];
        if (!s) return;
        setLastSubscriber({
          userId: typeof s.user_id === 'string' ? s.user_id : '',
          userName: typeof s.user_login === 'string' ? s.user_login : '',
          userDisplayName: typeof s.user_name === 'string' ? s.user_name : '',
          tier: typeof s.tier === 'string' ? s.tier : '1000',
          isGift: !!s.is_gift,
          gifterName: typeof s.gifter_name === 'string' ? s.gifter_name : undefined,
          // subscribeDate intentionally omitted — subscriptions API doesn't include a timestamp
        });
      }
    } catch (err) {
      console.error('[TwitchContext] fetchSubscribers failed:', err);
    }
  }, [fetchApi]);

  // --- Last events (persisted follow/sub from server storage) ---
  const fetchLastEvents = useCallback(async () => {
    try {
      const data = await fetchApi<{
        lastFollower?: { userId?: string; userName?: string; userDisplayName?: string; followedAt?: string };
        lastSubscriber?: { userId?: string; userName?: string; userDisplayName?: string; tier?: string; isGift?: boolean; gifterName?: string; subscribedAt?: string };
      }>('last-events');
      if (!data || typeof data !== 'object') return;

      if (data.lastFollower && typeof data.lastFollower.followedAt === 'string') {
        const storedDate = new Date(data.lastFollower.followedAt);
        if (!isNaN(storedDate.getTime())) {
          setLastFollower((prev) => {
            if (!prev || storedDate > prev.followDate) {
              return {
                userId: data.lastFollower!.userId ?? '',
                userName: data.lastFollower!.userName ?? '',
                userDisplayName: data.lastFollower!.userDisplayName ?? '',
                followDate: storedDate,
              };
            }
            return prev;
          });
        }
      }

      if (data.lastSubscriber && typeof data.lastSubscriber.subscribedAt === 'string') {
        const storedDate = new Date(data.lastSubscriber.subscribedAt);
        if (!isNaN(storedDate.getTime())) {
          setLastSubscriber((prev) => {
            if (!prev || !prev.subscribeDate || storedDate > prev.subscribeDate) {
              return {
                userId: data.lastSubscriber!.userId ?? '',
                userName: data.lastSubscriber!.userName ?? '',
                userDisplayName: data.lastSubscriber!.userDisplayName ?? '',
                tier: data.lastSubscriber!.tier ?? '1000',
                isGift: !!data.lastSubscriber!.isGift,
                gifterName: data.lastSubscriber!.gifterName,
                subscribeDate: storedDate,
              };
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('[TwitchContext] fetchLastEvents failed:', err);
    }
  }, [fetchApi]);

  // --- Emotes (one-time fetch per token) ---
  const fetchEmotes = useCallback(async () => {
    try {
      const currentToken = settings.overlayToken;
      if (emotesLoadedRef.current === currentToken) return;
      const data = await fetchApi<{ data?: TwitchEmoteData[] }>('emotes');
      const list = data?.data;
      if (!Array.isArray(list)) return;

      const map = new Map<string, CachedEmote>();
      for (const emote of list) {
        if (!emote || typeof emote.id !== 'string' || typeof emote.name !== 'string') continue;
        const base = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}`;
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
    } catch (err) {
      console.error('[TwitchContext] fetchEmotes failed:', err);
    }
  }, [fetchApi, settings.overlayToken]);

  const fetchLiveData = useCallback(async () => {
    setIsLoadingStreamInfo(true);
    try {
      const data = await fetchApi<TwitchLiveData>('live');
      if (!data) return;

      const stream = data.stream?.data;
      if (Array.isArray(stream)) {
        const current = stream[0];
        if (current && typeof current.started_at === 'string') {
          setStreamInfo({
            id: current.id ?? '',
            title: current.title ?? '',
            gameName: current.game_name ?? '',
            startedAt: new Date(current.started_at),
            viewerCount: current.viewer_count ?? 0,
            isLive: true,
          });
        } else {
          setStreamInfo((prev) => prev
            ? { ...prev, isLive: false, viewerCount: 0 }
            : { id: '', title: '', gameName: '', startedAt: new Date(), viewerCount: 0, isLive: false });
        }
      }

      const followers = data.followers?.data;
      if (Array.isArray(followers)) {
        setFollowerCount(data.followers?.total ?? 0);
        const current = followers[0];
        if (current && typeof current.followed_at === 'string') {
          setLastFollower({
            userId: current.user_id ?? '',
            userName: current.user_login ?? '',
            userDisplayName: current.user_name ?? '',
            followDate: new Date(current.followed_at),
          });
        }
      }

      const subscribers = data.subscribers?.data;
      if (Array.isArray(subscribers)) {
        setSubscriberCount(data.subscribers?.total ?? 0);
        const current = subscribers[0];
        if (current) {
          setLastSubscriber({
            userId: current.user_id ?? '',
            userName: current.user_login ?? '',
            userDisplayName: current.user_name ?? '',
            tier: current.tier ?? '1000',
            isGift: !!current.is_gift,
            gifterName: current.gifter_name,
          });
        }
      }

      const lastEvents = data.lastEvents;
      if (lastEvents?.lastFollower?.followedAt) {
        const storedDate = new Date(lastEvents.lastFollower.followedAt);
        if (!isNaN(storedDate.getTime())) {
          setLastFollower((prev) => !prev || storedDate > prev.followDate ? {
            userId: lastEvents.lastFollower!.userId ?? '',
            userName: lastEvents.lastFollower!.userName ?? '',
            userDisplayName: lastEvents.lastFollower!.userDisplayName ?? '',
            followDate: storedDate,
          } : prev);
        }
      }
      if (lastEvents?.lastSubscriber?.subscribedAt) {
        const storedDate = new Date(lastEvents.lastSubscriber.subscribedAt);
        if (!isNaN(storedDate.getTime())) {
          setLastSubscriber((prev) => !prev || !prev.subscribeDate || storedDate > prev.subscribeDate ? {
            userId: lastEvents.lastSubscriber!.userId ?? '',
            userName: lastEvents.lastSubscriber!.userName ?? '',
            userDisplayName: lastEvents.lastSubscriber!.userDisplayName ?? '',
            tier: lastEvents.lastSubscriber!.tier ?? '1000',
            isGift: !!lastEvents.lastSubscriber!.isGift,
            gifterName: lastEvents.lastSubscriber!.gifterName,
            subscribeDate: storedDate,
          } : prev);
        }
      }
    } catch (err) {
      console.error('[TwitchContext] fetchLiveData failed:', err);
    } finally {
      setIsLoadingStreamInfo(false);
    }
  }, [fetchApi]);

  // --- Set up polling and initial fetches ---
  useEffect(() => {
    if (!hasToken) return;

    // Register intervals FIRST so a failure in an initial fetch can never
    // prevent the polling timers from being created.
    const liveDataTimer = setInterval(fetchLiveData, STREAM_POLL_MS);

    // Fire the initial fetches in a fire-and-forget, fully isolated way.
    void fetchLiveData();
    void fetchEmotes();

    // OBS may throttle timers while a browser source's scene is inactive.
    // Refresh immediately when the source becomes active again.
    const refreshOnResume = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchLiveData();
    };
    document.addEventListener('visibilitychange', refreshOnResume);
    window.addEventListener('pageshow', refreshOnResume);
    window.addEventListener('focus', refreshOnResume);

    return () => {
      clearInterval(liveDataTimer);
      document.removeEventListener('visibilitychange', refreshOnResume);
      window.removeEventListener('pageshow', refreshOnResume);
      window.removeEventListener('focus', refreshOnResume);
    };
  }, [hasToken, fetchLiveData, fetchEmotes]);

  const getEmoteByName = useCallback(
    (name: string): CachedEmote | undefined => cachedEmotes.get(name.toLowerCase()),
    [cachedEmotes]
  );

  const value: TwitchContextType = {
    isConnected: chatConnected,
    isConnecting: chatConnecting,
    error: chatError,
    messages,
    cachedEmotes,
    streamInfo,
    isLoadingStreamInfo,
    lastFollower,
    lastSubscriber,
    followerCount,
    subscriberCount,
    clearMessages,
    getEmoteByName,
  };

  return <TwitchContext.Provider value={value}>{children}</TwitchContext.Provider>;
};

// Add the hook as a static property to avoid Fast Refresh issues
TwitchProvider.useTwitch = useTwitch;
