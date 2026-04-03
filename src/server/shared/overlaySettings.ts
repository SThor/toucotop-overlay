// Single canonical definition of OverlaySettings — imported by both
// src/server/storage.ts (server) and src/contexts/SettingsContext.tsx (client)
export interface OverlaySettings {
  overlayOpacity: number;
  chatFeedDirection: 'top' | 'bottom';
  maxChatMessages: number;
  theme: string;
  themeSettings: {
    crt: {
      intensity: 'minimal' | 'subtle' | 'medium';
      scanlines: boolean;
      animation: boolean;
    };
  };
  overlayFullWidth: boolean;
}

export const defaultOverlaySettings: OverlaySettings = {
  overlayOpacity: 0.9,
  chatFeedDirection: 'bottom',
  maxChatMessages: 50,
  theme: 'crt',
  themeSettings: {
    crt: {
      intensity: 'subtle',
      scanlines: true,
      animation: true,
    }
  },
  overlayFullWidth: false,
};
