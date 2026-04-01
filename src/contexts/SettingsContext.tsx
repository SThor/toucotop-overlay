import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface Settings {
  overlayToken: string;
  overlayOpacity: number;
  chatFeedDirection: 'top' | 'bottom';
  maxChatMessages: number;
  // CRT visual effects
  crtEffects: boolean;
  crtIntensity: 'minimal' | 'subtle' | 'medium';
  crtScanlines: boolean;
  crtAnimation: boolean;
  // Overlay appearance mode
  overlayFullWidth: boolean;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  resetSettings: () => void;
}

const defaultSettings: Settings = {
  overlayToken: '',
  overlayOpacity: 0.9,
  chatFeedDirection: 'bottom',
  maxChatMessages: 50,
  crtEffects: true,
  crtIntensity: 'subtle',
  crtScanlines: true,
  crtAnimation: true,
  overlayFullWidth: false,
};

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

function loadInitialSettings(): Settings {
  // Load from localStorage
  let base = { ...defaultSettings };
  try {
    const saved = localStorage.getItem('toucotop-overlay-settings');
    if (saved) base = { ...base, ...JSON.parse(saved) };
  } catch {
    // ignore corrupt storage
  }

  // Apply URL param overrides synchronously so first render has correct token
  const urlParams = new URLSearchParams(window.location.search);
  const overrides: Partial<Settings> = {};

  if (urlParams.has('token')) {
    overrides.overlayToken = urlParams.get('token') || '';
  }
  if (urlParams.has('overlayOpacity')) {
    const opacity = parseFloat(urlParams.get('overlayOpacity') || '');
    if (!isNaN(opacity) && opacity >= 0 && opacity <= 1) overrides.overlayOpacity = opacity;
  }
  if (urlParams.has('chatFeedDirection')) {
    const direction = urlParams.get('chatFeedDirection');
    if (direction === 'top' || direction === 'bottom') overrides.chatFeedDirection = direction;
  }
  if (urlParams.has('maxChatMessages')) {
    const max = parseInt(urlParams.get('maxChatMessages') || '', 10);
    if (!isNaN(max) && max >= 10 && max <= 100) overrides.maxChatMessages = max;
  }
  if (urlParams.has('crtEffects')) {
    overrides.crtEffects = urlParams.get('crtEffects') === 'true';
  }
  if (urlParams.has('crtIntensity')) {
    const intensity = urlParams.get('crtIntensity');
    if (intensity === 'minimal' || intensity === 'subtle' || intensity === 'medium') overrides.crtIntensity = intensity;
  }
  if (urlParams.has('crtScanlines')) {
    overrides.crtScanlines = urlParams.get('crtScanlines') === 'true';
  }
  if (urlParams.has('crtAnimation')) {
    overrides.crtAnimation = urlParams.get('crtAnimation') === 'true';
  }

  const initial = Object.keys(overrides).length > 0 ? { ...base, ...overrides } : base;

  // Persist immediately so subsequent renders / child components see the token
  if (Object.keys(overrides).length > 0) {
    try {
      localStorage.setItem('toucotop-overlay-settings', JSON.stringify(initial));
    } catch {
      // ignore
    }
  }

  return initial;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(loadInitialSettings);
  const urlUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // URL parameter update function
  const updateUrlParameters = useCallback((settings: Settings) => {
    const url = new URL(window.location.href);
    
    // Preserve token in URL if present
    if (settings.overlayToken) {
      url.searchParams.set('token', settings.overlayToken);
    } else {
      url.searchParams.delete('token');
    }

    // Update or remove overlayOpacity (only if different from default)
    if (settings.overlayOpacity !== defaultSettings.overlayOpacity) {
      url.searchParams.set('overlayOpacity', settings.overlayOpacity.toString());
    } else {
      url.searchParams.delete('overlayOpacity');
    }

    // Update or remove chatFeedDirection (only if different from default)
    if (settings.chatFeedDirection !== defaultSettings.chatFeedDirection) {
      url.searchParams.set('chatFeedDirection', settings.chatFeedDirection);
    } else {
      url.searchParams.delete('chatFeedDirection');
    }

    // Update or remove maxChatMessages (only if different from default)
    if (settings.maxChatMessages !== defaultSettings.maxChatMessages) {
      url.searchParams.set('maxChatMessages', settings.maxChatMessages.toString());
    } else {
      url.searchParams.delete('maxChatMessages');
    }

    // Update or remove crtEffects (only if different from default)
    if (settings.crtEffects !== defaultSettings.crtEffects) {
      url.searchParams.set('crtEffects', settings.crtEffects.toString());
    } else {
      url.searchParams.delete('crtEffects');
    }

    // Update or remove crtIntensity (only if different from default)
    if (settings.crtIntensity !== defaultSettings.crtIntensity) {
      url.searchParams.set('crtIntensity', settings.crtIntensity);
    } else {
      url.searchParams.delete('crtIntensity');
    }

    // Update or remove crtScanlines (only if different from default)
    if (settings.crtScanlines !== defaultSettings.crtScanlines) {
      url.searchParams.set('crtScanlines', settings.crtScanlines.toString());
    } else {
      url.searchParams.delete('crtScanlines');
    }

    // Update or remove crtAnimation (only if different from default)
    if (settings.crtAnimation !== defaultSettings.crtAnimation) {
      url.searchParams.set('crtAnimation', settings.crtAnimation.toString());
    } else {
      url.searchParams.delete('crtAnimation');
    }
    
    // Update the URL without triggering a page reload
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Debounced URL parameter update function
  const debouncedUpdateUrlParameters = useCallback((settings: Settings) => {
    if (urlUpdateTimeoutRef.current) {
      clearTimeout(urlUpdateTimeoutRef.current);
    }
    
    urlUpdateTimeoutRef.current = setTimeout(() => {
      updateUrlParameters(settings);
    }, 300); // Wait 300ms after last change before updating URL
  }, [updateUrlParameters]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem('toucotop-overlay-settings', JSON.stringify(updated));
      
      // Debounced URL parameter update
      debouncedUpdateUrlParameters(updated);
      
      return updated;
    });
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.removeItem('toucotop-overlay-settings');
    
    // Clear URL parameters immediately (no debouncing for reset)
    updateUrlParameters(defaultSettings);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
