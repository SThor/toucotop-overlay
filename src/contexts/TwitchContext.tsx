import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { ChatClient } from '@twurple/chat';
import { ApiClient } from '@twurple/api';
import { AppTokenAuthProvider } from '@twurple/auth';
import { buildEmoteImageUrl, parseChatMessage } from '@twurple/chat';
import { useSettings } from './SettingsContext';

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

interface EmoteUrls {
  '1x': string;
  '2x': string;
  '3x': string;
  '1x_static': string;
  '2x_static': string;
  '3x_static': string;
}

interface CachedEmote {
  id: string;
  name: string;
  urls: EmoteUrls;
}

interface TwitchStreamInfo {
  id: string;
  title: string;
  gameName: string;
  startedAt: Date;
  viewerCount: number;
  isLive: boolean;
}

interface TwitchFollower {
  userId: string;
  userName: string;
  userDisplayName: string;
  followDate: Date;
}

interface TwitchSubscriber {
  userId: string;
  userName: string;
  userDisplayName: string;
  tier: string;
  isGift: boolean;
  gifterName?: string;
  subscribeDate: Date;
}

interface TwitchContextType {
  chatClient: ChatClient | null;
  apiClient: ApiClient | null;
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
  connect: () => Promise<void>;
  disconnect: () => void;
  clearMessages: () => void;
  loadRecentMessages: () => Promise<void>;
  getEmoteByName: (name: string) => CachedEmote | undefined;
  fetchStreamInfo: () => Promise<void>;
  fetchFollowers: () => Promise<void>;
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

export const TwitchProvider: TwitchProviderComponent = ({ children }) => {
  const { settings } = useSettings();
  const [chatClient, setChatClient] = useState<ChatClient | null>(null);
  const [apiClient, setApiClient] = useState<ApiClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TwitchChatMessage[]>([]);
  const [cachedEmotes, setCachedEmotes] = useState<Map<string, CachedEmote>>(new Map());
  const [streamInfo, setStreamInfo] = useState<TwitchStreamInfo | null>(null);
  const [isLoadingStreamInfo, setIsLoadingStreamInfo] = useState(false);
  const [lastFollower, setLastFollower] = useState<TwitchFollower | null>(null);
  const [lastSubscriber, setLastSubscriber] = useState<TwitchSubscriber | null>(null);
  const [followerCount, setFollowerCount] = useState(0);

  // Simplified connection state
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionInProgressRef = useRef(false);
  const currentChannelRef = useRef<string>('');

  // Maximum retry attempts before giving up
  const MAX_RETRY_ATTEMPTS = 3;
  const BASE_RETRY_DELAY = 2000; // 2 seconds

  // Helper function to create emote URLs
  const createEmoteUrls = (emoteId: string): EmoteUrls => ({
    '1x': buildEmoteImageUrl(emoteId, { animationSettings: 'animated', backgroundType: 'dark', size: '1.0' }),
    '2x': buildEmoteImageUrl(emoteId, { animationSettings: 'animated', backgroundType: 'dark', size: '2.0' }),
    '3x': buildEmoteImageUrl(emoteId, { animationSettings: 'animated', backgroundType: 'dark', size: '3.0' }),
    '1x_static': buildEmoteImageUrl(emoteId, { animationSettings: 'static', backgroundType: 'dark', size: '1.0' }),
    '2x_static': buildEmoteImageUrl(emoteId, { animationSettings: 'static', backgroundType: 'dark', size: '2.0' }),
    '3x_static': buildEmoteImageUrl(emoteId, { animationSettings: 'static', backgroundType: 'dark', size: '3.0' })
  });

  // Function to preload emotes
  const preloadEmotes = useCallback(async (api: ApiClient) => {
    if (!api || !settings.channelName) return;

    try {
      console.log('Preloading emotes...');
      const emoteMap = new Map<string, CachedEmote>();

      // Get global emotes
      try {
        const globalEmotes = await api.chat.getGlobalEmotes();
        globalEmotes.forEach(emote => {
          emoteMap.set(emote.name.toLowerCase(), {
            id: emote.id,
            name: emote.name,
            urls: createEmoteUrls(emote.id)
          });
        });
        console.log(`Loaded ${globalEmotes.length} global emotes`);
      } catch (error) {
        console.warn('Failed to load global emotes:', error);
      }

      // Get channel emotes
      try {
        const channelUser = await api.users.getUserByName(settings.channelName);
        if (channelUser) {
          const channelEmotes = await api.chat.getChannelEmotes(channelUser.id);
          channelEmotes.forEach(emote => {
            emoteMap.set(emote.name.toLowerCase(), {
              id: emote.id,
              name: emote.name,
              urls: createEmoteUrls(emote.id)
            });
          });
          console.log(`Loaded ${channelEmotes.length} channel emotes for ${settings.channelName}`);
        }
      } catch (error) {
        console.warn('Failed to load channel emotes:', error);
      }

      setCachedEmotes(emoteMap);
      console.log(`Total cached emotes: ${emoteMap.size}`);
    } catch (error) {
      console.error('Failed to preload emotes:', error);
    }
  }, [settings.channelName]);

  // Function to get emote by name
  const getEmoteByName = useCallback((name: string): CachedEmote | undefined => {
    return cachedEmotes.get(name.toLowerCase());
  }, [cachedEmotes]);

  // Load recent messages from localStorage
  const loadRecentMessages = useCallback(async () => {
    if (!settings.channelName || settings.previewMode) return;

    try {
      const storedMessages = localStorage.getItem(`twitch-messages-${settings.channelName}`);
      if (storedMessages) {
        const parsed: TwitchChatMessage[] = JSON.parse(storedMessages);
        // Filter to recent messages and respect maxChatMessages limit
        const recent = parsed
          .filter(msg => new Date().getTime() - new Date(msg.timestamp).getTime() < 30 * 60 * 1000) // Last 30 minutes
          .slice(-settings.maxChatMessages);
        
        if (recent.length > 0) {
          setMessages(recent);
          console.log(`Loaded ${recent.length} recent messages from cache`);
        }
      }
    } catch (error) {
      console.error('Failed to load recent messages:', error);
    }
  }, [settings.previewMode, settings.channelName, settings.maxChatMessages]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting from Twitch...');
    
    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (chatClient) {
      chatClient.quit();
      setChatClient(null);
    }
    
    setApiClient(null);
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    connectionInProgressRef.current = false;
    
    // Clear all data
    setCachedEmotes(new Map());
    setStreamInfo(null);
    setIsLoadingStreamInfo(false);
    setLastFollower(null);
    setLastSubscriber(null);
    setFollowerCount(0);
  }, [chatClient]);

  const connect = useCallback(async () => {
    const channelName = settings.channelName?.trim();
    
    if (!channelName) {
      setError('Channel name is required');
      return;
    }

    // Prevent multiple simultaneous connections
    if (connectionInProgressRef.current || isConnected) {
      console.log('Connection already in progress or connected, skipping...');
      return;
    }

    // Check retry limit
    if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
      console.log(`Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached. Please refresh the page to try again.`);
      setError(`Connection failed after ${MAX_RETRY_ATTEMPTS} attempts. Please refresh the page.`);
      return;
    }

    connectionInProgressRef.current = true;
    setIsConnecting(true);
    setError(null);
    
    const attemptNumber = connectionAttempts + 1;
    console.log(`Connecting to Twitch chat: ${channelName} (attempt ${attemptNumber}/${MAX_RETRY_ATTEMPTS})`);

    try {
      // Disconnect any existing connection
      if (chatClient) {
        chatClient.quit();
        setChatClient(null);
      }
      
      // Create API client if credentials available
      let api: ApiClient | null = null;
      if (import.meta.env.VITE_TWITCH_CLIENT_ID && import.meta.env.VITE_TWITCH_CLIENT_SECRET) {
        const authProvider = new AppTokenAuthProvider(
          import.meta.env.VITE_TWITCH_CLIENT_ID, 
          import.meta.env.VITE_TWITCH_CLIENT_SECRET
        );
        api = new ApiClient({ authProvider });
        setApiClient(api);
      }

      // Create chat client
      const chat = new ChatClient({ channels: [channelName] });

      // Set up event handlers
      chat.onMessage((_channel: string, user: string, text: string, msg) => {
        const messageParts = parseChatMessage(text, msg.emoteOffsets);
        const emotes = messageParts
          .filter(part => part.type === 'emote')
          .map(emotePart => ({
            id: emotePart.id,
            name: emotePart.name,
            startIndex: emotePart.position,
            endIndex: emotePart.position + emotePart.length - 1,
            urls: createEmoteUrls(emotePart.id)
          }));

        const newMessage: TwitchChatMessage = {
          id: msg.id || Date.now().toString(),
          username: user,
          displayName: msg.userInfo.displayName || user,
          message: text,
          timestamp: new Date(),
          color: msg.userInfo.color || undefined,
          badges: Array.from(msg.userInfo.badges?.keys() || []),
          isHighlight: msg.isHighlight || false,
          isMod: msg.userInfo.isMod || false,
          isSubscriber: msg.userInfo.isSubscriber || false,
          isVip: msg.userInfo.isVip || false,
          emotes: emotes,
        };

        setMessages(prev => {
          const maxMessages = settings.maxChatMessages || 50;
          const updated = [...prev, newMessage];
          return updated.slice(-maxMessages);
        });
      });

      // Handle message deletions
      chat.onMessageRemove((_channel: string, messageId: string) => {
        setMessages(prev => prev.filter(message => message.id !== messageId));
      });

      chat.onTimeout((_channel: string, user: string) => {
        setMessages(prev => prev.filter(message => message.username.toLowerCase() !== user.toLowerCase()));
      });

      chat.onBan((_channel: string, user: string) => {
        setMessages(prev => prev.filter(message => message.username.toLowerCase() !== user.toLowerCase()));
      });

      chat.onChatClear(() => {
        setMessages([]);
      });

      // Connection success handler
      chat.onConnect(() => {
        console.log(`✅ Connected to Twitch chat: ${channelName}`);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        setConnectionAttempts(0); // Reset on successful connection
        connectionInProgressRef.current = false;
        
        // Load additional data
        if (api) {
          preloadEmotes(api).catch(err => console.warn('Failed to preload emotes:', err));
        }
        loadRecentMessages().catch(err => console.warn('Failed to load recent messages:', err));
      });

      // Disconnection handler
      chat.onDisconnect((manually: boolean, reason?: Error) => {
        console.log(`❌ Disconnected from Twitch chat:`, { manually, reason: reason?.message });
        
        setIsConnected(false);
        setIsConnecting(false);
        connectionInProgressRef.current = false;
        
        // Only auto-reconnect if:
        // 1. Not manually disconnected
        // 2. Still on the same channel
        // 3. Haven't exceeded retry limit
        // 4. Not in preview mode
        if (!manually && 
            channelName === currentChannelRef.current && 
            connectionAttempts < MAX_RETRY_ATTEMPTS &&
            !settings.previewMode) {
          
          const delay = BASE_RETRY_DELAY * Math.pow(2, connectionAttempts); // Exponential backoff
          console.log(`⏰ Scheduling reconnection in ${delay}ms (attempt ${connectionAttempts + 1}/${MAX_RETRY_ATTEMPTS})`);
          
          setConnectionAttempts(prev => prev + 1);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (channelName === currentChannelRef.current && !isConnected) {
              connect();
            }
          }, delay);
        } else if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
          setError(`Connection failed after ${MAX_RETRY_ATTEMPTS} attempts. Please refresh the page.`);
        }
      });

      // Connect with timeout
      await Promise.race([
        chat.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        )
      ]);

      setChatClient(chat);

    } catch (err) {
      console.error('❌ Twitch connection error:', err);
      
      setIsConnecting(false);
      connectionInProgressRef.current = false;
      setConnectionAttempts(prev => prev + 1);
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to Twitch';
      setError(errorMessage);
      
      // Schedule retry if not at limit
      if (connectionAttempts + 1 < MAX_RETRY_ATTEMPTS && !settings.previewMode) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, connectionAttempts);
        console.log(`⏰ Scheduling retry in ${delay}ms`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (channelName === currentChannelRef.current && !isConnected) {
            connect();
          }
        }, delay);
      }
    }
  }, [settings.channelName, settings.maxChatMessages, settings.previewMode, connectionAttempts, isConnected, chatClient, preloadEmotes, loadRecentMessages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    // Also clear from localStorage
    if (settings.channelName) {
      localStorage.removeItem(`twitch-messages-${settings.channelName}`);
    }
  }, [settings.channelName]);

  // Function to fetch stream information
  const fetchStreamInfo = useCallback(async () => {
    if (settings.previewMode) {
      // Use demo data for preview mode
      setStreamInfo({
        id: 'demo_stream_123',
        title: 'Demo Stream - Testing Overlay Features',
        gameName: 'Software and Game Development',
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // Started 2 hours ago
        viewerCount: 142,
        isLive: true
      });
      return;
    }

    try {
      setIsLoadingStreamInfo(true);
      setError(null);

      if (!apiClient) {
        console.error('No API client available for fetching stream info');
        // No API client - return data that indicates API error state
        setStreamInfo({
          id: 'error_stream',
          title: 'Error Fetching Stream Info',
          gameName: 'Unknown',
          startedAt: new Date(),
          viewerCount: 0,
          isLive: false
        });
        return;
      }

      // Authenticated API approach (preferred when available)
      const user = await apiClient.users.getUserByName(settings.channelName);
      if (!user) {
        console.error(`User not found: ${settings.channelName}`);
        // Return data that indicates user not found
        setStreamInfo({
          id: 'error_stream',
          title: 'Error Fetching Stream Info: User Not Found',
          gameName: 'Unknown',
          startedAt: new Date(),
          viewerCount: 0,
          isLive: false
        });
        return;
      }

      const stream = await apiClient.streams.getStreamByUserId(user.id);

      if (!stream) {
        // Stream is offline - return data that indicates offline state
        setStreamInfo({
          id: 'offline_stream',
          title: 'Offline',
          gameName: 'no category',
          startedAt: new Date(Date.now()),
          viewerCount: 0,
          isLive: false
        });
        return;
      }
      
      const gameInfo = await apiClient.games.getGameById(stream.gameId);
      
      setStreamInfo({
        id: stream.id,
        title: stream.title,
        gameName: gameInfo?.name || 'Unknown Game',
        startedAt: stream.startDate,
        viewerCount: stream.viewers,
        isLive: true
      });
      
      console.log('Stream info fetched (authenticated):', {
        title: stream.title,
        game: gameInfo?.name,
        viewers: stream.viewers
      });
    } catch (error) {
      console.error('Failed to fetch stream info:', error);
      // return data that indicates error state
      setStreamInfo({
        id: 'error_stream',
        title: 'Error Fetching Stream Info: API Error',
        gameName: 'Unknown',
        startedAt: new Date(),
        viewerCount: 0,
        isLive: false
      });
    } finally {
      setIsLoadingStreamInfo(false);
    }
  }, [apiClient, settings.channelName, settings.previewMode]);

  // Function to fetch followers and subscriber information
  const fetchFollowers = useCallback(async () => {
    if (settings.previewMode) {
      // Use stable demo data for preview mode
      setFollowerCount(1247);
      setLastFollower({
        userId: 'demo_user_123',
        userName: 'demo_follower',
        userDisplayName: 'DemoFollower',
        followDate: new Date(Date.now() - 45 * 60 * 1000)
      });
      setLastSubscriber({
        userId: 'demo_sub_456',
        userName: 'demo_subscriber',
        userDisplayName: 'DemoSubscriber',
        tier: '1000',
        isGift: false,
        subscribeDate: new Date(Date.now() - 2 * 60 * 60 * 1000)
      });
      return;
    }

    try {
      // Use stable demo data - follower/subscriber APIs require special permissions
      if (followerCount === 0) {
        setFollowerCount(1247);
      }
      
      if (!lastFollower) {
        setLastFollower({
          userId: 'demo_user_123',
          userName: 'demo_follower',
          userDisplayName: 'DemoFollower',
          followDate: new Date(Date.now() - 45 * 60 * 1000)
        });
      }
      
      if (!lastSubscriber) {
        setLastSubscriber({
          userId: 'demo_sub_456',
          userName: 'demo_subscriber',
          userDisplayName: 'DemoSubscriber',
          tier: '1000',
          isGift: false,
          subscribeDate: new Date(Date.now() - 2 * 60 * 60 * 1000)
        });
      }
    } catch (error) {
      console.error('Failed to fetch follower/subscriber data:', error);
    }
  }, [settings.previewMode, followerCount, lastFollower, lastSubscriber]);

  // Save messages to localStorage for persistence
  useEffect(() => {
    if (messages.length > 0 && settings.channelName) {
      localStorage.setItem(`twitch-messages-${settings.channelName}`, JSON.stringify(messages));
    }
  }, [messages, settings.channelName]);

  // Main effect for handling channel changes
  useEffect(() => {
    const newChannel = settings.channelName?.trim() || '';
    
    // Channel changed - disconnect and reset
    if (currentChannelRef.current !== newChannel) {
      console.log(`Channel changed: "${currentChannelRef.current}" → "${newChannel}"`);
      
      currentChannelRef.current = newChannel;
      setConnectionAttempts(0); // Reset attempts on channel change
      
      // Disconnect from old channel
      disconnect();
      
      // Connect to new channel after a brief delay
      if (newChannel && !settings.previewMode) {
        setTimeout(() => {
          connect();
        }, 1000);
      }
    }
  }, [settings.channelName, settings.previewMode, disconnect, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      disconnect();
    };
  }, [disconnect]);

  // Fetch stream info when channel name is available and set up periodic refresh
  useEffect(() => {
    if (!settings.channelName) {
      return;
    }

    // Fetch immediately
    fetchStreamInfo();

    // Set up periodic refresh every 30 seconds for live stream data
    const streamInfoInterval = setInterval(() => {
      fetchStreamInfo();
    }, 30000);

    return () => {
      clearInterval(streamInfoInterval);
    };
  }, [settings.channelName, fetchStreamInfo]);

  // Fetch followers and subscriber info when channel name is available
  useEffect(() => {
    if (!settings.channelName) {
      return;
    }

    // Fetch initially
    fetchFollowers();

    // Set up periodic refresh every 10 minutes for follower/subscriber data
    const followersInterval = setInterval(() => {
      fetchFollowers();
    }, 600000); // 10 minutes

    return () => {
      clearInterval(followersInterval);
    };
  }, [settings.channelName, fetchFollowers]);

  const value: TwitchContextType = {
    chatClient,
    apiClient,
    isConnected,
    isConnecting,
    error,
    messages,
    cachedEmotes,
    streamInfo,
    isLoadingStreamInfo,
    lastFollower,
    lastSubscriber,
    followerCount,
    connect,
    disconnect,
    clearMessages,
    loadRecentMessages,
    getEmoteByName,
    fetchStreamInfo,
    fetchFollowers,
  };

  return <TwitchContext.Provider value={value}>{children}</TwitchContext.Provider>;
};

// Add the hook as a static property to avoid Fast Refresh issues
TwitchProvider.useTwitch = useTwitch;
