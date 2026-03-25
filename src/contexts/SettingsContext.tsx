import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

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

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
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

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('toucotop-overlay-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...defaultSettings, ...parsed });
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }

    // Check for query parameters and override settings
    const urlParams = new URLSearchParams(window.location.search);
    const querySettings: Partial<Settings> = {};

    if (urlParams.has('token')) {
      querySettings.overlayToken = urlParams.get('token') || '';
    }
    if (urlParams.has('overlayOpacity')) {
      const opacity = parseFloat(urlParams.get('overlayOpacity') || '0.9');
      if (!isNaN(opacity) && opacity >= 0 && opacity <= 1) {
        querySettings.overlayOpacity = opacity;
      }
    }
    if (urlParams.has('chatFeedDirection')) {
      const direction = urlParams.get('chatFeedDirection');
      if (direction === 'top' || direction === 'bottom') {
        querySettings.chatFeedDirection = direction;
      }
    }
    if (urlParams.has('maxChatMessages')) {
      const maxMessages = parseInt(urlParams.get('maxChatMessages') || '50', 10);
      if (!isNaN(maxMessages) && maxMessages >= 10 && maxMessages <= 100) {
        querySettings.maxChatMessages = maxMessages;
      }
    }
    if (urlParams.has('crtEffects')) {
      querySettings.crtEffects = urlParams.get('crtEffects') === 'true';
    }
    if (urlParams.has('crtIntensity')) {
      const intensity = urlParams.get('crtIntensity');
      if (intensity === 'minimal' || intensity === 'subtle' || intensity === 'medium') {
        querySettings.crtIntensity = intensity;
      }
    }
    if (urlParams.has('crtScanlines')) {
      querySettings.crtScanlines = urlParams.get('crtScanlines') === 'true';
    }
    if (urlParams.has('crtAnimation')) {
      querySettings.crtAnimation = urlParams.get('crtAnimation') === 'true';
    }

    if (Object.keys(querySettings).length > 0) {
      setSettings(prev => {
        const newSettings = { ...prev, ...querySettings };
        localStorage.setItem('toucotop-overlay-settings', JSON.stringify(newSettings));
        return newSettings;
      });
    }
  }, []);

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
