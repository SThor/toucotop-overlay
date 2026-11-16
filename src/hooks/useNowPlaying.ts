import { useEffect, useState } from 'react';
import {
  DEFAULT_NOW_PLAYING_URL,
  EMPTY_SMTC_STATE,
  applySmtcMessage,
  toNowPlaying,
  toWebSocketUrl,
  type NowPlaying,
  type SmtcState,
} from './nowPlaying';

const RECONNECT_DELAY_MS = 5000;

/**
 * Connects to the local smtc-now-playing companion and returns the current
 * track (null when nothing is playing or the companion is not running).
 * Reconnects forever, so starting the companion after OBS just works.
 */
export function useNowPlaying(enabled = true, baseUrl = DEFAULT_NOW_PLAYING_URL): NowPlaying | null {
  const [state, setState] = useState<SmtcState>(EMPTY_SMTC_STATE);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY_SMTC_STATE);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      try {
        ws = new WebSocket(toWebSocketUrl(baseUrl));
      } catch {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        return;
      }
      ws.onmessage = (e) => {
        if (typeof e.data === 'string') {
          setState((prev) => applySmtcMessage(prev, e.data, Date.now()));
        }
      };
      ws.onclose = () => {
        ws = null;
        setState(EMPTY_SMTC_STATE);
        if (!disposed) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      disposed = true;
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [enabled, baseUrl]);

  return toNowPlaying(state, baseUrl);
}

/** Re-renders every `intervalMs` while `active`, returning the current time. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
