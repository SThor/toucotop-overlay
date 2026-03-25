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
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMessages = useCallback(() => setMessages([]), []);

  useEffect(() => {
    if (!token) {
      setIsConnected(false);
      setError('No overlay token');
      return;
    }

    function connect() {
      // Clean up previous connection
      eventSourceRef.current?.close();

      const url = `/api/chat/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
        setIsConnected(true);
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

      es.addEventListener('error', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { error: string };
          setError(data.error);
        } catch {
          setError('Chat connection lost');
        }
        setIsConnected(false);
        es.close();

        // Auto-reconnect
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      });

      es.onerror = () => {
        // EventSource fires generic error on disconnect
        if (es.readyState === EventSource.CLOSED) {
          setIsConnected(false);
          setError('Chat connection closed');
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [token, maxMessages]);

  return { messages, isConnected, error, clearMessages };
}
