import React, { createContext, useContext, useState } from 'react';
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

export const TwitchProvider: TwitchProviderComponent = ({ children }) => {
  const { settings } = useSettings();
  const [messages, setMessages] = useState<TwitchChatMessage[]>([]);
  const [cachedEmotes] = useState<Map<string, CachedEmote>>(new Map());
  const [streamInfo] = useState<TwitchStreamInfo | null>(null);
  const [lastFollower] = useState<TwitchFollower | null>(null);
  const [lastSubscriber] = useState<TwitchSubscriber | null>(null);
  const [followerCount] = useState(0);

  // TODO: Phase 3 will wire these to server API via hooks

  const clearMessages = () => {
    setMessages([]);
  };

  const getEmoteByName = (name: string): CachedEmote | undefined => {
    return cachedEmotes.get(name.toLowerCase());
  };

  // Suppress unused variable warning - settings will be used in Phase 3
  void settings;

  const value: TwitchContextType = {
    isConnected: false,
    isConnecting: false,
    error: null,
    messages,
    cachedEmotes,
    streamInfo,
    isLoadingStreamInfo: false,
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
