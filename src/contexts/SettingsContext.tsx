import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { defaultOverlaySettings, type OverlaySettings } from '../server/shared/overlaySettings';

// Full settings including auth token (kept for backwards compat with consumers)
export interface Settings extends OverlaySettings {
  overlayToken: string;
}

interface SettingsContextType {
  settings: Settings;
  /** The raw server-persisted settings, without URL query-param overrides applied.
   * Use this when building PATCH payloads so session-only URL overrides are
   * never accidentally written back to the server. */
  persistedSettings: OverlaySettings;
  /** True while loading settings from the server for the first time */
  isLoadingSettings: boolean;
  updateSettings: (newSettings: Partial<Settings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: React.ReactNode;
}

// Parse URL parameter overrides (session-only — not saved to server)
function parseUrlOverrides(search: string): Partial<OverlaySettings> {
  const p = new URLSearchParams(search);
  const o: Partial<OverlaySettings> = {};

  if (p.has('overlayOpacity')) {
    const v = parseFloat(p.get('overlayOpacity') || '');
    if (!isNaN(v) && v >= 0.1 && v <= 1) o.overlayOpacity = v;
  }
  if (p.has('fontSize')) {
    const v = parseFloat(p.get('fontSize') || '');
    if (!isNaN(v) && v >= 0.5 && v <= 10) o.fontSize = v;
  }
  // Per-overlay opacity: ?opacityChat=0.8&opacityClock=0.7&opacityBar=0.6
  const perOpacity: OverlaySettings['perOverlayOpacity'] = {};
  for (const [key, param] of [['chat', 'opacityChat'], ['clock', 'opacityClock'], ['bar', 'opacityBar']] as const) {
    if (p.has(param)) {
      const v = parseFloat(p.get(param) || '');
      if (!isNaN(v) && v >= 0.1 && v <= 1) perOpacity[key] = v;
    }
  }
  if (Object.keys(perOpacity).length > 0) o.perOverlayOpacity = perOpacity;

  // Per-overlay font size: ?fontSizeChat=1.4&fontSizeClock=1.2&fontSizeBar=0.9
  const perFont: OverlaySettings['perOverlayFontSize'] = {};
  for (const [key, param] of [['chat', 'fontSizeChat'], ['clock', 'fontSizeClock'], ['bar', 'fontSizeBar']] as const) {
    if (p.has(param)) {
      const v = parseFloat(p.get(param) || '');
      if (!isNaN(v) && v >= 0.5 && v <= 10) perFont[key] = v;
    }
  }
  if (Object.keys(perFont).length > 0) o.perOverlayFontSize = perFont;

  if (p.has('chatFeedDirection')) {
    const v = p.get('chatFeedDirection');
    if (v === 'top' || v === 'bottom') o.chatFeedDirection = v;
  }
  if (p.has('maxChatMessages')) {
    const v = parseInt(p.get('maxChatMessages') || '', 10);
    if (!isNaN(v) && v >= 10 && v <= 100) o.maxChatMessages = v;
  }
  if (p.has('barFloating')) o.barFloating = p.get('barFloating') !== 'false';
  if (p.has('theme')) {
    const v = p.get('theme');
    if (v === 'crt' || v === 'default' || v === 'y2k') o.theme = v;
  }
  // Legacy boolean param: ?crtEffects=false  (kept for backward compat)
  if (p.has('crtEffects') && !p.has('theme')) o.theme = p.get('crtEffects') === 'false' ? 'default' : 'crt';
  if (p.has('crtIntensity') || p.has('crtScanlines') || p.has('crtAnimation')) {
    const crt: Partial<OverlaySettings['themeSettings']['crt']> = {};
    const intensity = p.get('crtIntensity');
    if (intensity === 'minimal' || intensity === 'subtle' || intensity === 'medium') crt.intensity = intensity;
    if (p.has('crtScanlines')) crt.scanlines = p.get('crtScanlines') !== 'false';
    if (p.has('crtAnimation')) crt.animation = p.get('crtAnimation') !== 'false';
    o.themeSettings = { crt } as OverlaySettings['themeSettings'];
  }

  return o;
}

// Load overlay token synchronously from URL or localStorage
function loadInitialToken(): string {
  const urlToken = new URLSearchParams(window.location.search).get('token');
  if (urlToken) return urlToken;
  try {
    const saved = localStorage.getItem('toucotop-overlay-settings');
    if (saved) {
      const parsed = JSON.parse(saved) as { overlayToken?: string };
      if (parsed.overlayToken) return parsed.overlayToken;
    }
  } catch { /* ignore corrupt storage */ }
  return localStorage.getItem('toucotop-overlay-token') || '';
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  // Token is managed via localStorage only (not a server setting)
  const [overlayToken, setOverlayToken] = useState<string>(loadInitialToken);
  const overlayTokenRef = useRef(overlayToken);
  useEffect(() => {
    console.log('[SettingsProvider] overlayToken state changed:', overlayToken ? '(set)' : '(empty)');
    overlayTokenRef.current = overlayToken;
  }, [overlayToken]);

  // Server-side overlay settings, fetched async after token is available
  const [serverSettings, setServerSettings] = useState<OverlaySettings>(defaultOverlaySettings);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);

  // URL overrides are re-derived whenever the location search string changes so they
  // don't persist across SPA navigation to a route with different (or no) query params.
  const { search } = useLocation();
  const urlOverrides = useMemo(() => {
    const overrides = parseUrlOverrides(search);
    console.log('[SettingsProvider] urlOverrides recomputed for search:', search || '(empty)', '| keys:', Object.keys(overrides));
    return overrides;
  }, [search]);

  // Debounce timer for server saves
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch settings from server whenever the token changes, with retry-with-backoff
  // so overlays recover automatically after a server restart / deploy.
  useEffect(() => {
    let isCurrent = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    if (!overlayToken) {
      setServerSettings(defaultOverlaySettings);
      setIsLoadingSettings(false);
      return () => { isCurrent = false; };
    }

    let controller = new AbortController();

    const attemptFetch = (attempt: number) => {
      if (attempt === 0) setIsLoadingSettings(true);
      controller = new AbortController();

      fetch(`/api/settings?token=${encodeURIComponent(overlayToken)}`, { signal: controller.signal })
        .then(async (res) => {
          if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // server error — retry
          if (!res.ok) return null; // 4xx (bad/expired token) — don't retry
          const data = await res.json() as { settings?: OverlaySettings } | null;
          if (!data || typeof data !== 'object' || !data.settings || typeof data.settings !== 'object') return null;
          return data.settings;
        })
        .then((fetched) => {
          if (!isCurrent) return;
          setIsLoadingSettings(false);
          if (!fetched) {
            setServerSettings(defaultOverlaySettings);
            return;
          }
          setServerSettings({
            ...defaultOverlaySettings,
            ...fetched,
            themeSettings: {
              ...defaultOverlaySettings.themeSettings,
              ...(fetched.themeSettings ?? {}),
              crt: {
                ...defaultOverlaySettings.themeSettings.crt,
                ...(fetched.themeSettings?.crt ?? {}),
              },
            },
          });
        })
        .catch((err) => {
          if (!isCurrent || err.name === 'AbortError') return;
          // Network error — server may be restarting. Retry with exponential backoff
          // (5 s → 10 s → 20 s → … capped at 60 s).
          if (attempt === 0) setIsLoadingSettings(false);
          const delay = Math.min(5_000 * 2 ** attempt, 60_000);
          retryTimer = setTimeout(() => { if (isCurrent) attemptFetch(attempt + 1); }, delay);
        });
    };

    attemptFetch(0);

    return () => {
      isCurrent = false;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [overlayToken]);

  // Merged view: defaults → server settings → URL param overrides (session-only)
  // Nested objects (themeSettings, perOverlayOpacity, perOverlayFontSize) are
  // deep-merged so a single URL param (e.g. ?opacityChat=0.8) doesn't wipe
  // the other overlay values stored server-side.
  const settings: Settings = {
    overlayToken,
    ...serverSettings,
    ...urlOverrides,
    perOverlayOpacity: {
      ...serverSettings.perOverlayOpacity,
      ...urlOverrides.perOverlayOpacity,
    },
    perOverlayFontSize: {
      ...serverSettings.perOverlayFontSize,
      ...urlOverrides.perOverlayFontSize,
    },
    themeSettings: {
      ...serverSettings.themeSettings,
      ...urlOverrides.themeSettings,
      crt: {
        ...serverSettings.themeSettings.crt,
        ...urlOverrides.themeSettings?.crt,
      },
    },
  };

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    // Handle token update separately (localStorage only — not a server setting)
    if ('overlayToken' in newSettings && newSettings.overlayToken !== undefined) {
      const token = newSettings.overlayToken;
      setOverlayToken(token);
      overlayTokenRef.current = token;
      localStorage.setItem('toucotop-overlay-token', token);
      // Keep legacy key in sync for backward compat
      try {
        const raw = localStorage.getItem('toucotop-overlay-settings');
        const existing = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
        localStorage.setItem('toucotop-overlay-settings', JSON.stringify({ ...existing, overlayToken: token }));
      } catch { /* ignore */ }
    }

    // Extract overlay settings patch (everything except overlayToken)
    const { overlayToken: _tok, ...overlayPatch } = newSettings;
    if (Object.keys(overlayPatch).length === 0) return;

    // Apply locally immediately for responsive UI (deep-merge themeSettings so partial
    // nested updates don't wipe sibling fields stored in serverSettings)
    setServerSettings((prev) => ({
      ...prev,
      ...overlayPatch,
      themeSettings: {
        ...prev.themeSettings,
        ...(overlayPatch.themeSettings ?? {}),
        crt: {
          ...prev.themeSettings.crt,
          ...(overlayPatch.themeSettings?.crt ?? {}),
        },
      },
    }));

    // Debounced save to server
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const token = overlayTokenRef.current;
      if (!token) return;
      fetch(`/api/settings?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overlayPatch),
      }).catch((err) => console.warn('Failed to save settings to server:', err));
    }, 500);
  }, []);

  const resetSettings = useCallback(() => {
    setServerSettings(defaultOverlaySettings);
    localStorage.removeItem('toucotop-overlay-settings');
    localStorage.removeItem('toucotop-overlay-token');
    setOverlayToken('');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Reset on server too if we have a token
    const token = overlayTokenRef.current;
    if (token) {
      fetch(`/api/settings?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultOverlaySettings),
      }).catch(() => { /* ignore */ });
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, persistedSettings: serverSettings, isLoadingSettings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
