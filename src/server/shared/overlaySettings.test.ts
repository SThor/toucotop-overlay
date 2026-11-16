import { describe, expect, it } from 'vitest';
import { BAR_SECTION_KEYS, defaultOverlaySettings, normalizeBarSections, normalizeBarSectionStacks } from './overlaySettings';

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
