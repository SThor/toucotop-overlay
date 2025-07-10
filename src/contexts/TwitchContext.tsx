import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ChatClient } from '@twurple/chat';
import { ApiClient } from '@twurple/api';
import { StaticAuthProvider } from '@twurple/auth';
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

interface TwitchContextType {
  chatClient: ChatClient | null;
  apiClient: ApiClient | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  messages: TwitchChatMessage[];
  cachedEmotes: Map<string, CachedEmote>;
  connect: () => Promise<void>;
  disconnect: () => void;
  clearMessages: () => void;
  loadRecentMessages: () => Promise<void>;
  getEmoteByName: (name: string) => CachedEmote | undefined;
}

const TwitchContext = createContext<TwitchContextType | undefined>(undefined);

export const useTwitch = () => {
  const context = useContext(TwitchContext);
  if (!context) {
    throw new Error('useTwitch must be used within a TwitchProvider');
  }
  return context;
};

interface TwitchProviderProps {
  children: React.ReactNode;
}

export const TwitchProvider: React.FC<TwitchProviderProps> = ({ children }) => {
  const { settings } = useSettings();
  const [chatClient, setChatClient] = useState<ChatClient | null>(null);
  const [apiClient, setApiClient] = useState<ApiClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TwitchChatMessage[]>([]);
  const [cachedEmotes, setCachedEmotes] = useState<Map<string, CachedEmote>>(new Map());

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
    if (!settings.channelName) return;

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
  }, [settings.channelName, settings.maxChatMessages]);

  const connect = useCallback(async () => {
    if (!settings.channelName) {
      setError('Channel name is required');
      return;
    }

    if (isConnecting || isConnected) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // For read-only chat, we can connect anonymously without credentials
      let chat: ChatClient;
      let api: ApiClient | null = null;

      if (settings.twitchClientId && settings.twitchAccessToken) {
        // Authenticated connection (if credentials are provided)
        const authProvider = new StaticAuthProvider(settings.twitchClientId, settings.twitchAccessToken);
        api = new ApiClient({ authProvider });
        chat = new ChatClient({ authProvider, channels: [settings.channelName] });
        setApiClient(api);
      } else {
        // Anonymous read-only connection (no credentials needed)
        chat = new ChatClient({ channels: [settings.channelName] });
        setApiClient(null);
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
        console.log(`Connected to Twitch chat for channel: ${settings.channelName}`);
        
        // Preload emotes if we have an API client
        if (api) {
          await preloadEmotes(api);
        }
        
        // Load recent messages after connecting
        await loadRecentMessages();
      });

      chat.onDisconnect((manually: boolean, reason?: Error) => {
        setIsConnected(false);
        setIsConnecting(false);
        if (!manually && reason) {
          setError(`Disconnected: ${reason.message}`);
        }
        console.log('Disconnected from Twitch chat', { manually, reason });
      });

      // Connect to chat
      await chat.connect();
      setChatClient(chat);

    } catch (err) {
      setIsConnecting(false);
      setError(err instanceof Error ? err.message : 'Failed to connect to Twitch');
      console.error('Twitch connection error:', err);
    }
  }, [settings.channelName, settings.twitchClientId, settings.twitchAccessToken, settings.maxChatMessages, isConnecting, isConnected, loadRecentMessages, preloadEmotes]);

  const disconnect = useCallback(() => {
    if (chatClient) {
      chatClient.quit();
      setChatClient(null);
    }
    setApiClient(null);
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    // Clear cached emotes on disconnect
    setCachedEmotes(new Map());
  }, [chatClient]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    // Also clear from localStorage
    localStorage.removeItem(`twitch-messages-${settings.channelName}`);
  }, [settings.channelName]);

  // Save messages to localStorage for persistence
  useEffect(() => {
    if (messages.length > 0 && settings.channelName) {
      localStorage.setItem(`twitch-messages-${settings.channelName}`, JSON.stringify(messages));
    }
  }, [messages, settings.channelName]);

  // Auto-connect when channel name is available (credentials are optional)
  useEffect(() => {
    if (settings.channelName && !isConnected && !isConnecting) {
      connect();
    }
  }, [settings.channelName, isConnected, isConnecting, connect]);

  // Disconnect when channel name is removed
  useEffect(() => {
    if (!settings.channelName && (isConnected || isConnecting)) {
      disconnect();
    }
  }, [settings.channelName, isConnected, isConnecting, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const value: TwitchContextType = {
    chatClient,
    apiClient,
    isConnected,
    isConnecting,
    error,
    messages,
    cachedEmotes,
    connect,
    disconnect,
    clearMessages,
    loadRecentMessages,
    getEmoteByName,
  };

  return <TwitchContext.Provider value={value}>{children}</TwitchContext.Provider>;
};
