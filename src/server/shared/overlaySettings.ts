// Single canonical definition of OverlaySettings — imported by both
// src/server/storage.ts (server) and src/contexts/SettingsContext.tsx (client)
export type OverlayTheme = 'crt' | 'default' | 'y2k';

export interface PerOverlayNumber {
  chat?: number | null;
  clock?: number | null;
  bar?: number | null;
}

export interface OverlaySettings {
  overlayOpacity: number;
  perOverlayOpacity: PerOverlayNumber;
  fontSize: number;
  perOverlayFontSize: PerOverlayNumber;
  chatFeedDirection: 'top' | 'bottom';
  maxChatMessages: number;
  barFloating: boolean;
  theme: OverlayTheme;
  themeSettings: {
    crt: {
      intensity: 'minimal' | 'subtle' | 'medium';
      scanlines: boolean;
      animation: boolean;
    };
  };
  pauseTitle: string;
  pauseSubtitle: string;
  /** When true, the theme background (CRT/Y2K shader) is not rendered for this overlay. */
  hideBackground: boolean;
}

export const defaultOverlaySettings: OverlaySettings = {
  overlayOpacity: 0.9,
  perOverlayOpacity: { chat: null, clock: null, bar: null },
  fontSize: 1.0,
  perOverlayFontSize: { chat: null, clock: null, bar: null },
  chatFeedDirection: 'bottom',
  maxChatMessages: 50,
  barFloating: true,
  theme: 'crt',
  themeSettings: {
    crt: {
      intensity: 'subtle',
      scanlines: true,
      animation: true,
    }
  },
  pauseTitle: 'En pause',
  pauseSubtitle: '— je reviens —',
  hideBackground: false,
};
