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
  connect: () => Promise<void>;
  disconnect: () => void;
  clearMessages: () => void;
  loadRecentMessages: () => Promise<void>;
  getEmoteByName: (name: string) => CachedEmote | undefined;
  fetchStreamInfo: () => Promise<void>;
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
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [lastConnectionAttempt, setLastConnectionAttempt] = useState<number>(0);

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

  const connect = useCallback(async () => {
    if (!settings.channelName) {
      setError('Channel name is required');
      return;
    }

    if (isConnecting || isConnected) {
      return;
    }

    // Rate limiting: prevent rapid reconnection attempts
    const now = Date.now();
    const timeSinceLastAttempt = now - lastConnectionAttempt;
    const minInterval = Math.min(2000 * Math.pow(1.5, connectionAttempts), 15000); // Gentler backoff, max 15s

    if (timeSinceLastAttempt < minInterval && connectionAttempts > 0) {
      console.log(`Rate limiting connection attempts. Please wait ${Math.ceil((minInterval - timeSinceLastAttempt) / 1000)}s`);
      setError(`Please wait ${Math.ceil((minInterval - timeSinceLastAttempt) / 1000)}s before retrying`);
      return;
    }

    setLastConnectionAttempt(now);
    setConnectionAttempts(prev => prev + 1);
    setIsConnecting(true);
    setError(null);

    console.log(`Attempting to connect to Twitch chat for channel: ${settings.channelName} (attempt ${connectionAttempts + 1})`);

    try {
      // Disconnect any existing connection first
      if (chatClient) {
        console.log('Disconnecting existing chat client');
        chatClient.quit();
        setChatClient(null);
      }
      if (apiClient) {
        setApiClient(null);
      }

      // For read-only chat, we can connect anonymously without credentials
      let api: ApiClient | null = null;

      // Always use anonymous chat connection (read-only)
      const chat = new ChatClient({ channels: [settings.channelName] });

      // But use authenticated API client if credentials are available (for better rate limits and more features)
      if (import.meta.env.VITE_TWITCH_CLIENT_ID && import.meta.env.VITE_TWITCH_CLIENT_SECRET) {
        const authProvider = new AppTokenAuthProvider(
          import.meta.env.VITE_TWITCH_CLIENT_ID, 
          import.meta.env.VITE_TWITCH_CLIENT_SECRET
        );
        api = new ApiClient({ authProvider });
        setApiClient(api);
        console.log('Using authenticated API client for enhanced features');
      } else {
        setApiClient(null);
        console.log('Using anonymous connections (chat + API)');
      }

      // Set up chat message handler
      chat.onMessage((_channel: string, user: string, text: string, msg) => {
        // Parse the message using @twurple's parseChatMessage function
        const messageParts = parseChatMessage(text, msg.emoteOffsets);
        
        // Extract emote data from the parsed parts
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

      // Set up message deletion handler
      chat.onMessageRemove((_channel: string, messageId: string, msg) => {
        console.log(`Message deleted: ${messageId}`, msg);
        setMessages(prev => prev.filter(message => message.id !== messageId));
      });

      // Set up user ban/timeout handler (removes all messages from that user)
      chat.onTimeout((_channel: string, user: string, _duration: number, msg) => {
        console.log(`User timed out: ${user}`, msg);
        setMessages(prev => prev.filter(message => message.username.toLowerCase() !== user.toLowerCase()));
      });

      // Set up user ban handler (removes all messages from that user)
      chat.onBan((_channel: string, user: string, msg) => {
        console.log(`User banned: ${user}`, msg);
        setMessages(prev => prev.filter(message => message.username.toLowerCase() !== user.toLowerCase()));
      });

      // Set up message clear handler (clears all messages - /clear command)
      chat.onChatClear(() => {
        console.log('Chat cleared by moderator');
        setMessages([]);
      });

      // Set up connection handlers
      chat.onConnect(async () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        setConnectionAttempts(0); // Reset attempts on successful connection
        console.log(`Connected to Twitch chat for channel: ${settings.channelName}`);
        
        // Preload emotes if we have an API client
        if (api) {
          preloadEmotesRef.current(api).catch(err => console.error('Failed to preload emotes:', err));
        }
        
        // Load recent messages after connecting
        loadRecentMessagesRef.current().catch(err => console.error('Failed to load recent messages:', err));
      });

      chat.onDisconnect((manually: boolean, reason?: Error) => {
        console.log('Chat disconnected', { manually, reason, channel: settings.channelName });
        setIsConnected(false);
        setIsConnecting(false);
        
        if (!manually) {
          if (reason) {
            console.error('Unexpected disconnection:', reason);
            setError(`Connection lost: ${reason.message}`);
          }
          
          // Auto-reconnect after a delay if not manually disconnected and still on same channel
          const reconnectDelay = Math.min(5000 * Math.pow(1.5, connectionAttempts), 30000);
          console.log(`Scheduling reconnection in ${reconnectDelay}ms`);
          
          setTimeout(() => {
            // Only reconnect if we're still on the same channel and not connected
            if (settings.channelName === currentChannelRef.current && !isConnected && !isConnecting) {
              console.log('Attempting auto-reconnection');
              connectRef.current();
            }
          }, reconnectDelay);
        } else {
          setError(null);
        }
      });

      // Connect to chat with timeout
      const connectionPromise = chat.connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 10000); // 10 second timeout
      });

      await Promise.race([connectionPromise, timeoutPromise]);
      setChatClient(chat);

    } catch (err) {
      setIsConnecting(false);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to Twitch';
      setError(errorMessage);
      console.error('Twitch connection error:', err);
      
      // Don't immediately retry on error - let the rate limiting handle it
    }
  }, [settings.channelName, settings.maxChatMessages, isConnecting, isConnected, connectionAttempts, lastConnectionAttempt, chatClient, apiClient]);

  const disconnect = useCallback(() => {
    if (chatClient) {
      chatClient.quit();
      setChatClient(null);
    }
    setApiClient(null);
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    setConnectionAttempts(0); // Reset attempts on manual disconnect
    setLastConnectionAttempt(0);
    // Clear cached emotes on disconnect
    setCachedEmotes(new Map());
    // Clear stream info on disconnect
    setStreamInfo(null);
    setIsLoadingStreamInfo(false);
  }, [chatClient]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    // Also clear from localStorage
    localStorage.removeItem(`twitch-messages-${settings.channelName}`);
  }, [settings.channelName]);

  // Function to fetch stream information
  const fetchStreamInfo = useCallback(async () => {
    if (!settings.channelName) {
      setStreamInfo(null);
      return;
    }

    try {
      setIsLoadingStreamInfo(true);
      setError(null);

      if (apiClient) {
        // Authenticated API approach (preferred when available)
        const user = await apiClient.users.getUserByName(settings.channelName);
        if (!user) {
          console.error(`User not found: ${settings.channelName}`);
          setStreamInfo(null);
          return;
        }

        const stream = await apiClient.streams.getStreamByUserId(user.id);
        
        if (stream) {
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
            startedAt: stream.startDate,
            viewers: stream.viewers
          });
        } else {
          // Stream is offline
          setStreamInfo({
            id: '',
            title: '',
            gameName: '',
            startedAt: new Date(),
            viewerCount: 0,
            isLive: false
          });
          console.log('Stream is offline (authenticated)');
        }
      } else {
        // Anonymous approach using Twitch Helix API with environment variables
        const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
        
        if (!clientId) {
          console.warn('No Twitch Client ID available in environment variables. Stream info will not be available.');
          setStreamInfo({
            id: '',
            title: '',
            gameName: '',
            startedAt: new Date(),
            viewerCount: 0,
            isLive: false
          });
          return;
        }
        
        console.log('Fetching stream info anonymously for:', settings.channelName);
        
        // First get user ID from username
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${settings.channelName}`, {
          headers: {
            'Client-ID': clientId
          }
        });
        
        if (!userResponse.ok) {
          throw new Error(`Failed to fetch user: ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) {
          console.error(`User not found: ${settings.channelName}`);
          setStreamInfo({
            id: '',
            title: '',
            gameName: '',
            startedAt: new Date(),
            viewerCount: 0,
            isLive: false
          });
          return;
        }
        
        const userId = userData.data[0].id;
        
        // Then get stream info
        const streamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, {
          headers: {
            'Client-ID': clientId
          }
        });
        
        if (!streamResponse.ok) {
          throw new Error(`Failed to fetch stream: ${streamResponse.status}`);
        }
        
        const streamData = await streamResponse.json();
        
        if (streamData.data && streamData.data.length > 0) {
          const stream = streamData.data[0];
          
          // Get game info
          let gameName = 'Unknown Game';
          if (stream.game_id) {
            try {
              const gameResponse = await fetch(`https://api.twitch.tv/helix/games?id=${stream.game_id}`, {
                headers: {
                  'Client-ID': clientId
                }
              });
              
              if (gameResponse.ok) {
                const gameData = await gameResponse.json();
                if (gameData.data && gameData.data.length > 0) {
                  gameName = gameData.data[0].name;
                }
              }
            } catch (error) {
              console.warn('Failed to fetch game info:', error);
            }
          }
          
          setStreamInfo({
            id: stream.id,
            title: stream.title,
            gameName: gameName,
            startedAt: new Date(stream.started_at),
            viewerCount: stream.viewer_count,
            isLive: true
          });
          
          console.log('Stream info fetched (anonymous):', {
            title: stream.title,
            game: gameName,
            startedAt: stream.started_at,
            viewers: stream.viewer_count
          });
        } else {
          // Stream is offline
          setStreamInfo({
            id: '',
            title: '',
            gameName: '',
            startedAt: new Date(),
            viewerCount: 0,
            isLive: false
          });
          console.log('Stream is offline (anonymous)');
        }
      }
    } catch (error) {
      console.error('Failed to fetch stream info:', error);
      setError(`Failed to fetch stream info: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Set offline state on error
      setStreamInfo({
        id: '',
        title: '',
        gameName: '',
        startedAt: new Date(),
        viewerCount: 0,
        isLive: false
      });
    } finally {
      setIsLoadingStreamInfo(false);
    }
  }, [apiClient, settings.channelName]);

  // Save messages to localStorage for persistence
  useEffect(() => {
    if (messages.length > 0 && settings.channelName) {
      localStorage.setItem(`twitch-messages-${settings.channelName}`, JSON.stringify(messages));
    }
  }, [messages, settings.channelName]);

  // Auto-connect when channel name is available (credentials are optional)
  // Use refs to prevent infinite loops
  const connectRef = useRef(connect);
  const loadRecentMessagesRef = useRef(loadRecentMessages);
  const preloadEmotesRef = useRef(preloadEmotes);
  const currentChannelRef = useRef<string | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update refs
  useEffect(() => {
    connectRef.current = connect;
    loadRecentMessagesRef.current = loadRecentMessages;
    preloadEmotesRef.current = preloadEmotes;
  });

  // Handle channel changes and connection logic
  useEffect(() => {
    // Clear any pending connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // If channel changed, disconnect first
    if (currentChannelRef.current && currentChannelRef.current !== settings.channelName) {
      console.log('Channel changed, disconnecting from previous channel');
      disconnect();
    }

    currentChannelRef.current = settings.channelName;

    // Connect to new channel if provided
    if (settings.channelName && !isConnected && !isConnecting) {
      console.log('Scheduling connection to channel:', settings.channelName);
      connectionTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, 500); // Slightly longer delay to prevent rapid firing
    }

    // Disconnect if no channel name
    if (!settings.channelName && (isConnected || isConnecting)) {
      console.log('No channel name, disconnecting');
      disconnect();
    }

    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    };
  }, [settings.channelName, isConnected, isConnecting, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Fetch stream info when channel name is available and set up periodic refresh
  useEffect(() => {
    if (!settings.channelName || settings.previewMode) {
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
  }, [settings.channelName, settings.previewMode, fetchStreamInfo]);

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
    connect,
    disconnect,
    clearMessages,
    loadRecentMessages,
    getEmoteByName,
    fetchStreamInfo,
  };

  return <TwitchContext.Provider value={value}>{children}</TwitchContext.Provider>;
};

// Add the hook as a static property to avoid Fast Refresh issues
TwitchProvider.useTwitch = useTwitch;
