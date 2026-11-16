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
export type BarSectionMinWidth = Record<BarSectionKey, number>;
export type BarWidthTokenType = 'stretch' | 'boost';
export type BarSectionWidthTokens = Record<BarSectionKey, BarWidthTokenType | null>;
export interface BarSectionStack {
  id: string;
  sections: BarSectionKey[];
  widthToken: BarWidthTokenType | null;
}
export type BarStackPriority = string[];

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

const DEFAULT_BAR_SECTION_MIN_WIDTH: BarSectionMinWidth = {
  clock: 114,
  duration: 132,
  title: 148,
  viewers: 92,
  followers: 92,
  subscribers: 102,
  recentFollower: 144,
  recentSub: 144,
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

const DEFAULT_BAR_SECTION_STACKS: BarSectionStack[] = BAR_SECTION_KEYS.map((key) => ({
  id: `stack-${key}`,
  sections: [key],
  widthToken: DEFAULT_BAR_SECTION_WIDTH_TOKENS[key],
}));

const DEFAULT_BAR_STACK_PRIORITY: BarStackPriority = DEFAULT_BAR_SECTION_STACKS.map((stack) => stack.id);

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

export function normalizeBarSectionMinWidth(raw?: Partial<Record<BarSectionKey, number>> | null): BarSectionMinWidth {
  const src = raw ?? {};
  const normalized: BarSectionMinWidth = { ...DEFAULT_BAR_SECTION_MIN_WIDTH };

  for (const key of BAR_SECTION_KEYS) {
    const value = src[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = Math.min(480, Math.max(72, Math.round(value)));
    }
  }

  return normalized;
}

function normalizeBarTimingSeconds(raw: unknown, fallbackSeconds: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return fallbackSeconds;
  }

  const clamped = Math.min(30, Math.max(0.1, raw));
  return Number(clamped.toPrecision(2));
}

export function normalizeBarStackScrollDurationSeconds(raw?: unknown): number {
  return normalizeBarTimingSeconds(raw, 0.5);
}

export function normalizeBarStackPauseSeconds(raw?: unknown): number {
  return normalizeBarTimingSeconds(raw, 6.5);
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

function normalizeStackId(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, 80);
}

export function normalizeBarSectionStacks(
  raw?: ReadonlyArray<unknown> | null,
  fallback?: {
    barSections?: Partial<BarSections> | null | undefined;
    barSectionOrder?: ReadonlyArray<unknown> | null | undefined;
    barSectionWidthTokens?: Partial<Record<BarSectionKey, unknown>> | null | undefined;
  },
): BarSectionStack[] {
  const seenSections = new Set<BarSectionKey>();
  const seenIds = new Set<string>();
  const normalized: BarSectionStack[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const id = normalizeStackId(record.id, `stack-${normalized.length + 1}`);
      if (seenIds.has(id)) continue;

      const sectionsRaw = Array.isArray(record.sections) ? record.sections : [];
      const sections = sectionsRaw
        .filter((value): value is BarSectionKey => typeof value === 'string' && BAR_SECTION_KEYS.includes(value as BarSectionKey))
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .filter((value) => !seenSections.has(value));

      if (sections.length === 0) continue;

      for (const section of sections) seenSections.add(section);
      seenIds.add(id);
      normalized.push({
        id,
        sections,
        widthToken: record.widthToken === 'stretch' || record.widthToken === 'boost' ? record.widthToken : null,
      });
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackSections = normalizeBarSections(fallback?.barSections);
  const fallbackOrder = normalizeBarSectionOrder(fallback?.barSectionOrder);
  const fallbackTokens = normalizeBarSectionWidthTokens(fallback?.barSectionWidthTokens);
  return fallbackOrder
    .filter((key) => fallbackSections[key])
    .map((key) => ({
      id: `stack-${key}`,
      sections: [key],
      widthToken: fallbackTokens[key],
    }));
}

export function normalizeBarStackPriority(
  raw: unknown,
  stacks: ReadonlyArray<BarSectionStack>,
): BarStackPriority {
  const stackIds = stacks.map((stack) => stack.id);
  if (stackIds.length === 0) return [];

  const selected = Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string' && stackIds.includes(value))
    : [];

  const deduped = selected.filter((value, index) => selected.indexOf(value) === index);
  const missing = stackIds.filter((id) => !deduped.includes(id));
  return [...deduped, ...missing];
}

export interface OverlaySettings {
  overlayOpacity: number;
  perOverlayOpacity: PerOverlayNumber;
  fontSize: number;
  perOverlayFontSize: PerOverlayNumber;
  chatFeedDirection: 'top' | 'bottom';
  maxChatMessages: number;
  barFloating: boolean;
  barStackScrollDurationSeconds: number;
  barStackPauseSeconds: number;
  barSections: BarSections;
  barSectionStacks: BarSectionStack[];
  barStackPriority: BarStackPriority;
  barSectionOrder: BarSectionOrder;
  barSectionPriority: BarSectionPriority;
  barSectionMinWidth: BarSectionMinWidth;
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
  barStackScrollDurationSeconds: 0.5,
  barStackPauseSeconds: 6.5,
  barSections: { ...DEFAULT_BAR_SECTIONS },
  barSectionStacks: DEFAULT_BAR_SECTION_STACKS.map((stack) => ({ ...stack, sections: [...stack.sections] })),
  barStackPriority: [...DEFAULT_BAR_STACK_PRIORITY],
  barSectionOrder: [...DEFAULT_BAR_SECTION_ORDER],
  barSectionPriority: { ...DEFAULT_BAR_SECTION_PRIORITY },
  barSectionMinWidth: { ...DEFAULT_BAR_SECTION_MIN_WIDTH },
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
