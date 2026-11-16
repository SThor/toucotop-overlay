import { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { normalizeNowPlayingPauseGraceSeconds } from '../server/shared/overlaySettings';
import {
  DEFAULT_NOW_PLAYING_URL,
  EMPTY_SMTC_STATE,
  HIDDEN,
  applySmtcMessage,
  stepVisibility,
  toNowPlaying,
  toWebSocketUrl,
  type NowPlaying,
  type SmtcState,
  type VisibilityState,
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

/**
 * The track an overlay should display, applying the user's pause settings:
 * hide while paused (or not), after a grace period that also smooths over the
 * short gap between two songs.
 */
export function useDisplayedNowPlaying(enabled = true): NowPlaying | null {
  const { settings } = useSettings();
  const track = useNowPlaying(enabled);
  const hideWhenPaused = settings.nowPlayingHideWhenPaused ?? true;
  const graceMs = normalizeNowPlayingPauseGraceSeconds(settings.nowPlayingPauseGraceSeconds) * 1000;
  const [visibility, setVisibility] = useState<VisibilityState>(HIDDEN);

  useEffect(() => {
    setVisibility((prev) => stepVisibility(prev, track, Date.now(), { hideWhenPaused, graceMs }));
    // `track` is rebuilt on every render; compare it by content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(track), hideWhenPaused, graceMs]);

  // Let the grace period expire.
  useEffect(() => {
    if (visibility.hideAt === null) return;
    const id = setTimeout(() => {
      setVisibility((prev) => stepVisibility(prev, null, Date.now(), { hideWhenPaused, graceMs }));
    }, Math.max(0, visibility.hideAt - Date.now()));
    return () => clearTimeout(id);
  }, [visibility.hideAt, hideWhenPaused, graceMs]);

  return visibility.shown;
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
