import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export type { OverlaySettings } from '../server/shared/overlaySettings';
import type { OverlaySettings } from '../server/shared/overlaySettings';

// Full settings including auth token (kept for backwards compat with consumers)
export interface Settings extends OverlaySettings {
  overlayToken: string;
}

interface SettingsContextType {
  settings: Settings;
  /** True while loading settings from the server for the first time */
  isLoadingSettings: boolean;
  updateSettings: (newSettings: Partial<Settings>) => void;
  resetSettings: () => void;
}

export { defaultOverlaySettings } from '../server/shared/overlaySettings';
import { defaultOverlaySettings } from '../server/shared/overlaySettings';

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
  if (p.has('chatFeedDirection')) {
    const v = p.get('chatFeedDirection');
    if (v === 'top' || v === 'bottom') o.chatFeedDirection = v;
  }
  if (p.has('maxChatMessages')) {
    const v = parseInt(p.get('maxChatMessages') || '', 10);
    if (!isNaN(v) && v >= 10 && v <= 100) o.maxChatMessages = v;
  }
  if (p.has('crtEffects')) o.theme = p.get('crtEffects') === 'true' ? 'crt' : 'default';
  if (p.has('crtIntensity') || p.has('crtScanlines') || p.has('crtAnimation')) {
    const crt: Partial<OverlaySettings['themeSettings']['crt']> = {};
    const intensity = p.get('crtIntensity');
    if (intensity === 'minimal' || intensity === 'subtle' || intensity === 'medium') crt.intensity = intensity;
    if (p.has('crtScanlines')) crt.scanlines = p.get('crtScanlines') === 'true';
    if (p.has('crtAnimation')) crt.animation = p.get('crtAnimation') === 'true';
    o.themeSettings = { crt } as OverlaySettings['themeSettings'];
  }
  if (p.has('overlayFullWidth')) o.overlayFullWidth = p.get('overlayFullWidth') === 'true';

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
    console.log('[SettingsProvider] overlayToken state changed:', overlayToken ? overlayToken.slice(0,12)+'...' : '(empty)');
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

  // Fetch settings from server whenever the token changes
  useEffect(() => {
    let isCurrent = true;

    if (!overlayToken) {
      setServerSettings(defaultOverlaySettings);
      setIsLoadingSettings(false);
      return () => { isCurrent = false; };
    }
    const controller = new AbortController();
    setIsLoadingSettings(true);
    fetch(`/api/settings?token=${encodeURIComponent(overlayToken)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json() as { settings?: OverlaySettings } | null;
        if (!data || typeof data !== 'object' || !data.settings || typeof data.settings !== 'object') return null;
        return data.settings;
      })
      .then((fetched) => {
        if (!isCurrent) return;
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
      .catch((err) => { if (err.name !== 'AbortError') { /* network error — keep defaults */ } })
      .finally(() => { if (isCurrent) setIsLoadingSettings(false); });
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [overlayToken]);

  // Merged view: defaults → server settings → URL param overrides (session-only)
  // themeSettings is deep-merged so a single URL param (e.g. crtScanlines) doesn't
  // wipe the other crt fields stored server-side.
  const settings: Settings = {
    overlayToken,
    ...serverSettings,
    ...urlOverrides,
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
    <SettingsContext.Provider value={{ settings, isLoadingSettings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
