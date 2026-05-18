// Single canonical definition of OverlaySettings — imported by both
// src/server/storage.ts (server) and src/contexts/SettingsContext.tsx (client)
export type OverlayTheme = 'crt' | 'default' | 'y2k';

export interface PerOverlayNumber {
  chat?: number | null;
  clock?: number | null;
  bar?: number | null;
}

export interface BarSections {
  clock: boolean;
  duration: boolean;
  title: boolean;
  /** Legacy aggregate toggle kept for backward compatibility with older saved settings. */
  stats: boolean;
  viewers: boolean;
  followers: boolean;
  subscribers: boolean;
  recentFollower: boolean;
  recentSub: boolean;
}

const DEFAULT_BAR_SECTIONS: BarSections = {
  clock: true,
  duration: true,
  title: true,
  stats: true,
  viewers: true,
  followers: true,
  subscribers: true,
  recentFollower: true,
  recentSub: true,
};

export function normalizeBarSections(raw?: Partial<BarSections> | null): BarSections {
  const src = raw ?? {};
  const legacyStats = typeof src.stats === 'boolean' ? src.stats : undefined;

  const viewers = typeof src.viewers === 'boolean' ? src.viewers : (legacyStats ?? DEFAULT_BAR_SECTIONS.viewers);
  const followers = typeof src.followers === 'boolean' ? src.followers : (legacyStats ?? DEFAULT_BAR_SECTIONS.followers);
  const subscribers = typeof src.subscribers === 'boolean' ? src.subscribers : (legacyStats ?? DEFAULT_BAR_SECTIONS.subscribers);

  return {
    clock: typeof src.clock === 'boolean' ? src.clock : DEFAULT_BAR_SECTIONS.clock,
    duration: typeof src.duration === 'boolean' ? src.duration : DEFAULT_BAR_SECTIONS.duration,
    title: typeof src.title === 'boolean' ? src.title : DEFAULT_BAR_SECTIONS.title,
    stats: typeof src.stats === 'boolean' ? src.stats : (viewers || followers || subscribers),
    viewers,
    followers,
    subscribers,
    recentFollower: typeof src.recentFollower === 'boolean' ? src.recentFollower : DEFAULT_BAR_SECTIONS.recentFollower,
    recentSub: typeof src.recentSub === 'boolean' ? src.recentSub : DEFAULT_BAR_SECTIONS.recentSub,
  };
}

export interface OverlaySettings {
  overlayOpacity: number;
  perOverlayOpacity: PerOverlayNumber;
  fontSize: number;
  perOverlayFontSize: PerOverlayNumber;
  chatFeedDirection: 'top' | 'bottom';
  maxChatMessages: number;
  barFloating: boolean;
  barSections: BarSections;
  theme: OverlayTheme;
  themeSettings: {
    crt: {
      intensity: 'minimal' | 'subtle' | 'medium';
      scanlines: boolean;
      animation: boolean;
    };
    y2k: {
      reducedEffects: boolean;
    };
  };
  pauseTitle: string;
  pauseSubtitle: string;
  /** When true, the theme background (CRT/Y2K shader) is not rendered for this overlay. */
  hideBackground: boolean;
  /** When true, the foreground content (title, subtitle, barcode) is not rendered for this overlay. */
  hideContent: boolean;
}

export const defaultOverlaySettings: OverlaySettings = {
  overlayOpacity: 0.9,
  perOverlayOpacity: { chat: null, clock: null, bar: null },
  fontSize: 1.0,
  perOverlayFontSize: { chat: null, clock: null, bar: null },
  chatFeedDirection: 'bottom',
  maxChatMessages: 50,
  barFloating: true,
  barSections: { ...DEFAULT_BAR_SECTIONS },
  theme: 'crt',
  themeSettings: {
    crt: {
      intensity: 'subtle',
      scanlines: true,
      animation: true,
    },
    y2k: {
      reducedEffects: false,
    },
  },
  pauseTitle: 'En pause',
  pauseSubtitle: '— je reviens —',
  hideBackground: false,
  hideContent: false,
};
