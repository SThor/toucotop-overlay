import { describe, expect, it } from 'vitest';
import {
  BAR_SECTION_KEYS,
  defaultOverlaySettings,
  normalizeBarSections,
  normalizeBarSectionStacks,
  normalizeNowPlayingPauseGraceSeconds,
  parseNowPlayingSettingsPatch,
} from './overlaySettings';

describe('nowPlaying bar section', () => {
  it('is a known bar section', () => {
    expect(BAR_SECTION_KEYS).toContain('nowPlaying');
  });

  it('is disabled by default so existing bars are unchanged', () => {
    expect(defaultOverlaySettings.barSections.nowPlaying).toBe(false);
    expect(normalizeBarSections({}).nowPlaying).toBe(false);
    expect(defaultOverlaySettings.barSectionStacks.flatMap((s) => s.sections)).not.toContain('nowPlaying');
    expect(defaultOverlaySettings.barStackPriority).not.toContain('stack-nowPlaying');
  });

  it('keeps an explicit enabled value', () => {
    expect(normalizeBarSections({ nowPlaying: true }).nowPlaying).toBe(true);
  });

  it('accepts nowPlaying inside a stack', () => {
    const stacks = normalizeBarSectionStacks([{ id: 's1', sections: ['nowPlaying', 'title'], widthToken: 'stretch' }]);
    expect(stacks).toEqual([{ id: 's1', sections: ['nowPlaying', 'title'], widthToken: 'stretch' }]);
  });
});

describe('now playing pause settings', () => {
  it('hides paused tracks after a 5 second grace period by default', () => {
    expect(defaultOverlaySettings.nowPlayingHideWhenPaused).toBe(true);
    expect(defaultOverlaySettings.nowPlayingPauseGraceSeconds).toBe(5);
  });

  it('clamps the grace period to 0–60 seconds and falls back to 5', () => {
    expect(normalizeNowPlayingPauseGraceSeconds(12.34)).toBe(12.3);
    expect(normalizeNowPlayingPauseGraceSeconds(-1)).toBe(0);
    expect(normalizeNowPlayingPauseGraceSeconds(999)).toBe(60);
    expect(normalizeNowPlayingPauseGraceSeconds('x')).toBe(5);
    expect(normalizeNowPlayingPauseGraceSeconds(undefined)).toBe(5);
  });

  it('validates a settings patch', () => {
    expect(parseNowPlayingSettingsPatch({ nowPlayingHideWhenPaused: false, nowPlayingPauseGraceSeconds: 10 }))
      .toEqual({ patch: { nowPlayingHideWhenPaused: false, nowPlayingPauseGraceSeconds: 10 }, errors: [] });
    expect(parseNowPlayingSettingsPatch({ overlayOpacity: 1 })).toEqual({ patch: {}, errors: [] });
  });

  it('rejects invalid values', () => {
    const result = parseNowPlayingSettingsPatch({ nowPlayingHideWhenPaused: 'yes', nowPlayingPauseGraceSeconds: 61 });
    expect(result.patch).toEqual({});
    expect(result.errors).toHaveLength(2);
  });
});
