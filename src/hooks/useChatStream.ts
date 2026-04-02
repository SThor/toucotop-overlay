import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import type { TwitchChatMessage } from '../contexts/TwitchContext';

const MAX_MESSAGES = 200;
const RECONNECT_DELAY_MS = 3000;

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

  const clearMessages = useCallback(() => setMessages([]), []);

  useEffect(() => {
    if (!token) {
      setIsConnected(false);
      setIsConnecting(false);
      setError('No overlay token');
      // Clean up any existing connection and pending reconnect
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }

    function scheduleReconnect() {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    function connect() {
      // Clear messages from any previous connection to avoid cross-session leakage
      setMessages([]);
      setIsConnecting(true);
      // Clean up previous connection
      eventSourceRef.current?.close();

      const url = `/api/chat/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
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
            return next.length > maxMessages ? next.slice(-maxMessages) : next;
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

    connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [token, maxMessages]);

  return { messages, isConnected, isConnecting, error, clearMessages };
}
