import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';

export type AlertType =
  | 'follow'
  | 'subscribe'
  | 'resubscribe'
  | 'gift_sub'
  | 'cheer'
  | 'raid'
  | 'hype_train_begin'
  | 'hype_train_progress'
  | 'hype_train_end';

export interface AlertPayload {
  id: string;
  type: AlertType;
  timestamp: string;
  userName?: string;
  tier?: string;
  isGift?: boolean;
  gifterName?: string;
  cumulativeMonths?: number;
  streakMonths?: number;
  message?: string;
  giftCount?: number;
  bits?: number;
  raiderName?: string;
  viewerCount?: number;
  level?: number;
  progress?: number;
}

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_QUEUE = 20;

/**
 * Hook that connects to /api/alerts/stream via SSE and returns a queue of
 * pending alerts. Alerts are consumed one-by-one: call `dismissAlert()` once
 * the overlay animation for the current alert has completed.
 */
export function useAlertStream() {
  const { settings } = useSettings();
  const token = settings.overlayToken;

  const [queue, setQueue] = useState<AlertPayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  /** Remove the head of the queue (call after the animation for the alert ends). */
  const dismissAlert = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  useEffect(() => {
    if (!token) {
      setIsConnected(false);
      setIsConnecting(false);
      setError('No overlay token');
      setQueue([]);
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectAttemptsRef.current = 0;
      return;
    }

    function scheduleReconnect() {
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setError('Alert connection failed: max retries reached. Re-authenticate to reconnect.');
        return;
      }
      reconnectAttemptsRef.current++;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    function connect() {
      setIsConnecting(true);
      esRef.current?.close();

      const url = `/api/alerts/stream?token=${encodeURIComponent(token!)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('connected', () => {
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
      });

      es.addEventListener('alert', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as AlertPayload;
          setQueue((q) => q.length >= MAX_QUEUE ? q : [...q, payload]);
        } catch {
          console.error('[useAlertStream] Failed to parse alert payload');
        }
      });

      es.addEventListener('keepalive', () => {
        // keepalive — no action needed
      });

      es.onerror = () => {
        setIsConnected(false);
        setIsConnecting(false);
        es.close();
        esRef.current = null;
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [token]);

  return {
    currentAlert: queue[0] ?? null,
    queue,
    isConnected,
    isConnecting,
    error,
    dismissAlert,
  };
}
