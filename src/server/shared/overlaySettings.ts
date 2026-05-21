// Single canonical definition of OverlaySettings — imported by both
// src/server/storage.ts (server) and src/contexts/SettingsContext.tsx (client)
export type OverlayTheme = 'crt' | 'default' | 'y2k';

export const BAR_SECTION_KEYS = [
  'clock',
  'duration',
  'title',
  'viewers',
  'followers',
  'subscribers',
  'recentFollower',
  'recentSub',
] as const;

export type BarSectionKey = (typeof BAR_SECTION_KEYS)[number];

export interface PerOverlayNumber {
  chat?: number | null;
  clock?: number | null;
  bar?: number | null;
}

export type BarSections = Record<BarSectionKey, boolean>;
export type BarSectionOrder = BarSectionKey[];
export type BarSectionPriority = Record<BarSectionKey, number>;
export type BarWidthTokenType = 'stretch' | 'boost';
export type BarSectionWidthTokens = Record<BarSectionKey, BarWidthTokenType | null>;

const DEFAULT_BAR_SECTIONS: BarSections = {
  clock: true,
  duration: true,
  title: true,
  viewers: true,
  followers: true,
  subscribers: true,
  recentFollower: true,
  recentSub: true,
};

const DEFAULT_BAR_SECTION_ORDER: BarSectionOrder = [...BAR_SECTION_KEYS];

// Lower number means higher priority (kept visible longer as space shrinks).
const DEFAULT_BAR_SECTION_PRIORITY: BarSectionPriority = {
  title: 1,
  recentFollower: 2,
  viewers: 3,
  clock: 4,
  duration: 5,
  followers: 6,
  subscribers: 7,
  recentSub: 8,
};

const DEFAULT_BAR_SECTION_WIDTH_TOKENS: BarSectionWidthTokens = {
  clock: null,
  duration: null,
  title: 'stretch',
  viewers: null,
  followers: null,
  subscribers: null,
  recentFollower: 'boost',
  recentSub: 'boost',
};

export function normalizeBarSections(raw?: Partial<BarSections> | null): BarSections {
  const src = raw ?? {};
  return {
    clock: typeof src.clock === 'boolean' ? src.clock : DEFAULT_BAR_SECTIONS.clock,
    duration: typeof src.duration === 'boolean' ? src.duration : DEFAULT_BAR_SECTIONS.duration,
    title: typeof src.title === 'boolean' ? src.title : DEFAULT_BAR_SECTIONS.title,
    viewers: typeof src.viewers === 'boolean' ? src.viewers : DEFAULT_BAR_SECTIONS.viewers,
    followers: typeof src.followers === 'boolean' ? src.followers : DEFAULT_BAR_SECTIONS.followers,
    subscribers: typeof src.subscribers === 'boolean' ? src.subscribers : DEFAULT_BAR_SECTIONS.subscribers,
    recentFollower: typeof src.recentFollower === 'boolean' ? src.recentFollower : DEFAULT_BAR_SECTIONS.recentFollower,
    recentSub: typeof src.recentSub === 'boolean' ? src.recentSub : DEFAULT_BAR_SECTIONS.recentSub,
  };
}

export function normalizeBarSectionOrder(raw?: ReadonlyArray<unknown> | null): BarSectionOrder {
  const selected = Array.isArray(raw)
    ? raw.filter((value): value is BarSectionKey =>
      typeof value === 'string' && BAR_SECTION_KEYS.includes(value as BarSectionKey),
    )
    : [];

  const deduped = selected.filter((value, index) => selected.indexOf(value) === index);
  const missing = BAR_SECTION_KEYS.filter((key) => !deduped.includes(key));
  return [...deduped, ...missing];
}

export function normalizeBarSectionPriority(raw?: Partial<Record<BarSectionKey, number>> | null): BarSectionPriority {
  const src = raw ?? {};
  const normalized: BarSectionPriority = { ...DEFAULT_BAR_SECTION_PRIORITY };

  for (const key of BAR_SECTION_KEYS) {
    const value = src[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = Math.min(99, Math.max(1, Math.round(value)));
    }
  }

  return normalized;
}

export function normalizeBarSectionWidthTokens(raw?: Partial<Record<BarSectionKey, unknown>> | null): BarSectionWidthTokens {
  const src = raw ?? {};
  const normalized: BarSectionWidthTokens = { ...DEFAULT_BAR_SECTION_WIDTH_TOKENS };

  for (const key of BAR_SECTION_KEYS) {
    const current = src[key];
    if (current === null || current === undefined) {
      normalized[key] = null;
      continue;
    }
    if (current === 'stretch' || current === 'boost') {
      normalized[key] = current;
      continue;
    }

    // Backward compatibility: migrate old count format { stretch, boost }.
    if (typeof current === 'object' && !Array.isArray(current)) {
      const record = current as Partial<Record<BarWidthTokenType, unknown>>;
      const stretchCount = typeof record.stretch === 'number' ? record.stretch : 0;
      const boostCount = typeof record.boost === 'number' ? record.boost : 0;
      if (stretchCount > 0) {
        normalized[key] = 'stretch';
      } else if (boostCount > 0) {
        normalized[key] = 'boost';
      } else {
        normalized[key] = null;
      }
    }
  }

  return normalized;
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
  barSectionOrder: BarSectionOrder;
  barSectionPriority: BarSectionPriority;
  barSectionWidthTokens: BarSectionWidthTokens;
  theme: OverlayTheme;
  themeSettings: {
    crt: {
      intensity: 'minimal' | 'subtle' | 'medium';
      scanlines: boolean;
      animation: boolean;
    };
    y2k: {
      reducedEffects: boolean;
      showBarOrnaments: boolean;
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
  barSectionOrder: [...DEFAULT_BAR_SECTION_ORDER],
  barSectionPriority: { ...DEFAULT_BAR_SECTION_PRIORITY },
  barSectionWidthTokens: { ...DEFAULT_BAR_SECTION_WIDTH_TOKENS },
  theme: 'crt',
  themeSettings: {
    crt: {
      intensity: 'subtle',
      scanlines: true,
      animation: true,
    },
    y2k: {
      reducedEffects: false,
      showBarOrnaments: true,
    },
  },
  pauseTitle: 'En pause',
  pauseSubtitle: '— je reviens —',
  hideBackground: false,
  hideContent: false,
};
