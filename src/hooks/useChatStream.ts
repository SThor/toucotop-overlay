import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import type { TwitchChatMessage } from '../contexts/TwitchContext';

const MAX_MESSAGES = 200;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

function isHistoryMessage(item: unknown): item is TwitchChatMessage & { timestamp: string } {
  if (!item || typeof item !== 'object') return false;
  const value = item as Record<string, unknown>;
  return (
    typeof value.id === 'string' &&
    typeof value.username === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.message === 'string' &&
    typeof value.timestamp === 'string' &&
    Array.isArray(value.badges) &&
    value.badges.every((badge) => typeof badge === 'string') &&
    typeof value.isHighlight === 'boolean' &&
    typeof value.isMod === 'boolean' &&
    typeof value.isSubscriber === 'boolean' &&
    typeof value.isVip === 'boolean'
  );
}

/**
 * Hook that connects to the server SSE chat stream and returns live messages.
 */
export function useChatStream() {
  const { settings } = useSettings();
  const token = settings.overlayToken;
  const maxMessages = settings.maxChatMessages || MAX_MESSAGES;

  const [messages, setMessages] = useState<TwitchChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const clearMessages = useCallback(() => setMessages([]), []);
  const clampMessages = useCallback(
    (next: TwitchChatMessage[]) => (next.length > maxMessages ? next.slice(-maxMessages) : next),
    [maxMessages],
  );

  useEffect(() => {
    if (!token) {
      setIsConnected(false);
      setIsConnecting(false);
      setError('No overlay token');
      setMessages([]);
      // Clean up any existing connection and pending reconnect
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      return;
    }

    function scheduleReconnect() {
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setError('Chat connection failed: max retries reached. Re-authenticate to reconnect.');
        return;
      }
      reconnectAttemptsRef.current++;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        void connect();
      }, RECONNECT_DELAY_MS);
    }

    async function connect() {
      // Clear messages from any previous connection to avoid cross-session leakage
      setMessages([]);
      setIsConnecting(true);
      // Clean up previous connection
      eventSourceRef.current?.close();

      try {
        const historyResponse = await fetch(`/api/chat/history?token=${encodeURIComponent(token)}`);
        if (historyResponse.ok) {
          const historyData = await historyResponse.json() as { messages?: unknown };
          const historyItems = Array.isArray(historyData.messages) ? historyData.messages : [];
          const historyMessages = historyItems
            .filter(isHistoryMessage)
            .map((data) => ({
              ...data,
              timestamp: new Date(data.timestamp),
            }));
          setMessages(clampMessages(historyMessages));
        }
      } catch {
        // Ignore history load errors and continue with real-time stream.
      }

      const url = `/api/chat/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
      });

      es.addEventListener('message', (e) => {
        try {
          const data = JSON.parse(e.data) as TwitchChatMessage & { timestamp: string };
          const msg: TwitchChatMessage = {
            ...data,
            timestamp: new Date(data.timestamp),
          };
          setMessages((prev) => {
            const next = [...prev, msg];
            return clampMessages(next);
          });
        } catch {
          console.warn('Failed to parse chat message SSE data');
        }
      });

      es.addEventListener('delete', (e) => {
        try {
          const { messageId } = JSON.parse(e.data) as { messageId: string };
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        } catch {
          console.warn('Failed to parse delete SSE data');
        }
      });

      es.addEventListener('clear', () => {
        setMessages([]);
      });

      // Single consolidated error handler for both server-sent error events
      // and connection-level failures (replaces the previous es.onerror duplicate).
      es.addEventListener('error', (e) => {
        const isConnectionError = es.readyState === EventSource.CLOSED || !(e instanceof MessageEvent) || !e.data;
        if (isConnectionError) {
          setError('Chat connection closed');
        } else {
          try {
            const data = JSON.parse((e as MessageEvent).data) as { error: string };
            setError(data.error);
          } catch {
            setError('Chat connection lost');
          }
        }
        setIsConnected(false);
        setIsConnecting(false);
        es.close();
        scheduleReconnect();
      });
    }

    void connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [token, clampMessages]);

  return { messages, isConnected, isConnecting, error, clearMessages };
}
