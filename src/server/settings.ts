/**
 * Settings API Routes
 * GET  /api/settings  — return server-stored overlay settings for the authenticated user
 * PATCH /api/settings — update settings (partial, merges with existing)
 *
 * Both routes are mounted behind validateOverlayToken() in index.ts, so
 * req.userData is guaranteed to be populated; no manual token handling needed here.
 */

import express, { type Request, type Response, Router } from 'express';
import { getUserTokens, updateUserSettings, defaultOverlaySettings, type OverlaySettings } from './storage.js';
import {
  BAR_SECTION_KEYS,
  normalizeBarSectionStacks,
  normalizeBarStackPriority,
  normalizeBarSectionMinWidth,
  normalizeBarSectionOrder,
  normalizeBarSectionPriority,
  normalizeBarSectionWidthTokens,
  normalizeBarStackScrollSeconds,
  normalizeBarSections,
} from './shared/overlaySettings.js';

const router: Router = express.Router();
type OverlaySettingsPatch = Omit<Partial<OverlaySettings>, 'barSections' | 'barSectionStacks' | 'barStackPriority' | 'barSectionOrder' | 'barSectionPriority' | 'barSectionMinWidth' | 'barSectionWidthTokens'> & {
  barSections?: Partial<OverlaySettings['barSections']>;
  barSectionStacks?: OverlaySettings['barSectionStacks'];
  barStackPriority?: OverlaySettings['barStackPriority'];
  barSectionOrder?: OverlaySettings['barSectionOrder'];
  barSectionPriority?: Partial<OverlaySettings['barSectionPriority']>;
  barSectionMinWidth?: Partial<OverlaySettings['barSectionMinWidth']>;
  barSectionWidthTokens?: Partial<OverlaySettings['barSectionWidthTokens']>;
};

/**
 * GET /api/settings
 * Returns the stored overlay settings for the token owner.
 */
router.get('/', (req: Request, res: Response) => {
  const username = req.userData!.username;
  const user = getUserTokens(username);
  const raw = user?.overlaySettings ?? defaultOverlaySettings;
  const normalizedStacks = normalizeBarSectionStacks(raw.barSectionStacks, {
    barSections: raw.barSections,
    barSectionOrder: raw.barSectionOrder,
    barSectionWidthTokens: raw.barSectionWidthTokens,
  });
  const normalized: OverlaySettings = {
    ...defaultOverlaySettings,
    ...raw,
    perOverlayOpacity: { ...defaultOverlaySettings.perOverlayOpacity, ...(raw.perOverlayOpacity ?? {}) },
    perOverlayFontSize: { ...defaultOverlaySettings.perOverlayFontSize, ...(raw.perOverlayFontSize ?? {}) },
    barStackScrollSeconds: normalizeBarStackScrollSeconds(raw.barStackScrollSeconds),
    barSections: normalizeBarSections(raw.barSections),
    barSectionStacks: normalizedStacks,
    barStackPriority: normalizeBarStackPriority(raw.barStackPriority, normalizedStacks),
    barSectionOrder: normalizeBarSectionOrder(raw.barSectionOrder),
    barSectionPriority: normalizeBarSectionPriority(raw.barSectionPriority),
    barSectionMinWidth: normalizeBarSectionMinWidth(raw.barSectionMinWidth),
    barSectionWidthTokens: normalizeBarSectionWidthTokens(raw.barSectionWidthTokens),
    themeSettings: {
      ...defaultOverlaySettings.themeSettings,
      ...(raw.themeSettings ?? {}),
      crt: {
        ...defaultOverlaySettings.themeSettings.crt,
        ...(raw.themeSettings?.crt ?? {}),
      },
      y2k: {
        ...defaultOverlaySettings.themeSettings.y2k,
        ...(raw.themeSettings?.y2k ?? {}),
      },
    },
  };
  res.json({ settings: normalized });
});

/**
 * PATCH /api/settings
 * Validates and merges the provided partial settings into the stored settings.
 */
router.patch('/', express.json(), (req: Request, res: Response) => {
  const username = req.userData!.username;
  const user = getUserTokens(username);
  const rawExisting = user?.overlaySettings ?? defaultOverlaySettings;
  const existingStacks = normalizeBarSectionStacks(rawExisting.barSectionStacks, {
    barSections: rawExisting.barSections,
    barSectionOrder: rawExisting.barSectionOrder,
    barSectionWidthTokens: rawExisting.barSectionWidthTokens,
  });

  const body = req.body as OverlaySettingsPatch;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return;
  }

  const patch: OverlaySettingsPatch = {};
  const errors: string[] = [];

  if ('overlayOpacity' in body) {
    const v = body.overlayOpacity;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.1 || v > 1) {
      errors.push('overlayOpacity must be a number between 0.1 and 1');
    } else {
      patch.overlayOpacity = v;
    }
  }

  if ('chatFeedDirection' in body) {
    const v = body.chatFeedDirection;
    if (v !== 'top' && v !== 'bottom') {
      errors.push('chatFeedDirection must be "top" or "bottom"');
    } else {
      patch.chatFeedDirection = v;
    }
  }

  if ('maxChatMessages' in body) {
    const v = body.maxChatMessages;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 10 || v > 100) {
      errors.push('maxChatMessages must be an integer between 10 and 100');
    } else {
      patch.maxChatMessages = v;
    }
  }

  if ('theme' in body) {
    const v = body.theme;
    if (v !== 'crt' && v !== 'default' && v !== 'y2k') {
      errors.push('theme must be "crt", "default", or "y2k"');
    } else {
      patch.theme = v;
    }
  }

  if ('fontSize' in body) {
    const v = body.fontSize;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.5 || v > 10) {
      errors.push('fontSize must be a number between 0.5 and 10');
    } else {
      patch.fontSize = v;
    }
  }

  if ('barFloating' in body) {
    const v = body.barFloating;
    if (typeof v !== 'boolean') {
      errors.push('barFloating must be a boolean');
    } else {
      patch.barFloating = v;
    }
  }

  if ('barStackScrollSeconds' in body) {
    const v = body.barStackScrollSeconds;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 2 || v > 20) {
      errors.push('barStackScrollSeconds must be a number between 2 and 20');
    } else {
      patch.barStackScrollSeconds = Math.round(v * 10) / 10;
    }
  }

  if ('barSections' in body) {
    const v = body.barSections;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push('barSections must be an object');
    } else {
      const sections: Partial<OverlaySettings['barSections']> = {};
      for (const key of ['clock', 'duration', 'title', 'viewers', 'followers', 'subscribers', 'recentFollower', 'recentSub'] as const) {
        if (key in v) {
          const val = (v as unknown as Record<string, unknown>)[key];
          if (typeof val !== 'boolean') {
            errors.push(`barSections.${key} must be a boolean`);
          } else {
            sections[key] = val;
          }
        }
      }
      if (errors.length === 0) patch.barSections = sections;
    }
  }

  if ('barSectionStacks' in body) {
    const v = body.barSectionStacks;
    if (!Array.isArray(v)) {
      errors.push('barSectionStacks must be an array');
    } else {
      const normalizedStacks = normalizeBarSectionStacks(v, {
        barSections: normalizeBarSections(body.barSections),
        barSectionOrder: body.barSectionOrder,
        barSectionWidthTokens: body.barSectionWidthTokens,
      });
      patch.barSectionStacks = normalizedStacks;
      patch.barStackPriority = normalizeBarStackPriority(body.barStackPriority, normalizedStacks);
    }
  }

  if ('barStackPriority' in body && !('barSectionStacks' in body)) {
    patch.barStackPriority = normalizeBarStackPriority(body.barStackPriority, existingStacks);
  }

  if ('barSectionOrder' in body) {
    const v = body.barSectionOrder;
    if (!Array.isArray(v)) {
      errors.push('barSectionOrder must be an array');
    } else {
      const seen = new Set<string>();
      const keys: OverlaySettings['barSectionOrder'] = [];
      for (const item of v) {
        if (typeof item !== 'string' || !BAR_SECTION_KEYS.includes(item)) {
          errors.push('barSectionOrder contains invalid section keys');
          break;
        }
        if (seen.has(item)) {
          errors.push('barSectionOrder cannot contain duplicate keys');
          break;
        }
        seen.add(item);
        keys.push(item);
      }

      if (errors.length === 0) {
        patch.barSectionOrder = normalizeBarSectionOrder(keys);
      }
    }
  }

  if ('barSectionPriority' in body) {
    const v = body.barSectionPriority;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push('barSectionPriority must be an object');
    } else {
      const priorityPatch: Partial<OverlaySettings['barSectionPriority']> = {};
      for (const key of BAR_SECTION_KEYS) {
        if (key in v) {
          const rawValue = (v as Record<string, unknown>)[key];
          if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
            errors.push(`barSectionPriority.${key} must be a number`);
          } else {
            priorityPatch[key] = Math.min(99, Math.max(1, Math.round(rawValue)));
          }
        }
      }
      if (errors.length === 0) patch.barSectionPriority = priorityPatch;
    }
  }

  if ('barSectionMinWidth' in body) {
    const v = body.barSectionMinWidth;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push('barSectionMinWidth must be an object');
    } else {
      const minWidthPatch: Partial<OverlaySettings['barSectionMinWidth']> = {};
      for (const key of BAR_SECTION_KEYS) {
        if (key in v) {
          const rawValue = (v as Record<string, unknown>)[key];
          if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
            errors.push(`barSectionMinWidth.${key} must be a number`);
          } else {
            minWidthPatch[key] = Math.min(480, Math.max(72, Math.round(rawValue)));
          }
        }
      }
      if (errors.length === 0) patch.barSectionMinWidth = minWidthPatch;
    }
  }

  if ('barSectionWidthTokens' in body) {
    const v = body.barSectionWidthTokens;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push('barSectionWidthTokens must be an object');
    } else {
      const tokenPatch: Partial<OverlaySettings['barSectionWidthTokens']> = {};
      for (const key of BAR_SECTION_KEYS) {
        if (!(key in v)) continue;
        const rawToken = (v as Record<string, unknown>)[key];
        if (rawToken === null || rawToken === 'stretch' || rawToken === 'boost') {
          tokenPatch[key] = rawToken;
          continue;
        }

        // Backward compatibility: accept old object shape and normalize server-side.
        if (typeof rawToken === 'object' && rawToken !== null && !Array.isArray(rawToken)) {
          tokenPatch[key] = rawToken as unknown as OverlaySettings['barSectionWidthTokens'][typeof key];
          continue;
        }

        errors.push(`barSectionWidthTokens.${key} must be "stretch", "boost", or null`);
      }
      if (errors.length === 0) patch.barSectionWidthTokens = tokenPatch;
    }
  }

  if ('perOverlayOpacity' in body) {
    const v = body.perOverlayOpacity;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push('perOverlayOpacity must be an object');
    } else {
      const perOpacity: OverlaySettings['perOverlayOpacity'] = {};
      for (const key of ['chat', 'clock', 'bar'] as const) {
        if (key in v) {
          const val = v[key];
          if (val === undefined) continue;
          if (val === null) { perOpacity[key] = null; continue; }
          if (typeof val !== 'number' || !Number.isFinite(val) || val < 0.1 || val > 1) {
            errors.push(`perOverlayOpacity.${key} must be a number between 0.1 and 1`);
          } else {
            perOpacity[key] = val;
          }
        }
      }
      if (errors.length === 0) patch.perOverlayOpacity = perOpacity;
    }
  }

  if ('perOverlayFontSize' in body) {
    const v = body.perOverlayFontSize;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push('perOverlayFontSize must be an object');
    } else {
      const perFont: OverlaySettings['perOverlayFontSize'] = {};
      for (const key of ['chat', 'clock', 'bar'] as const) {
        if (key in v) {
          const val = v[key];
          if (val === undefined) continue;
          if (val === null) { perFont[key] = null; continue; }
          if (typeof val !== 'number' || !Number.isFinite(val) || val < 0.5 || val > 10) {
            errors.push(`perOverlayFontSize.${key} must be a number between 0.5 and 10`);
          } else {
            perFont[key] = val;
          }
        }
      }
      if (errors.length === 0) patch.perOverlayFontSize = perFont;
    }
  }

  if ('pauseTitle' in body) {
    const v = body.pauseTitle;
    if (typeof v !== 'string') {
      errors.push('pauseTitle must be a string');
    } else {
      // Empty string resets to default
      patch.pauseTitle = v.trim() === '' ? defaultOverlaySettings.pauseTitle : v;
    }
  }

  if ('pauseSubtitle' in body) {
    const v = body.pauseSubtitle;
    if (typeof v !== 'string') {
      errors.push('pauseSubtitle must be a string');
    } else {
      // Empty string resets to default
      patch.pauseSubtitle = v.trim() === '' ? defaultOverlaySettings.pauseSubtitle : v;
    }
  }

  if ('themeSettings' in body) {
    const ts = body.themeSettings;
    if (typeof ts !== 'object' || ts === null || Array.isArray(ts)) {
      errors.push('themeSettings must be an object');
    } else {
      const themePatch: {
        crt?: Partial<OverlaySettings['themeSettings']['crt']>;
        y2k?: Partial<OverlaySettings['themeSettings']['y2k']>;
      } = {};

      if (ts.crt !== undefined) {
        const c = ts.crt;
        if (typeof c !== 'object' || c === null || Array.isArray(c)) {
          errors.push('themeSettings.crt must be an object');
        } else {
          const crtPatch: Partial<OverlaySettings['themeSettings']['crt']> = {};
          if ('intensity' in c) {
            if (c.intensity !== 'minimal' && c.intensity !== 'subtle' && c.intensity !== 'medium') {
              errors.push('themeSettings.crt.intensity must be "minimal", "subtle", or "medium"');
            } else {
              crtPatch.intensity = c.intensity;
            }
          }
          if ('scanlines' in c) {
            if (typeof c.scanlines !== 'boolean') {
              errors.push('themeSettings.crt.scanlines must be a boolean');
            } else {
              crtPatch.scanlines = c.scanlines;
            }
          }
          if ('animation' in c) {
            if (typeof c.animation !== 'boolean') {
              errors.push('themeSettings.crt.animation must be a boolean');
            } else {
              crtPatch.animation = c.animation;
            }
          }
          if (Object.keys(crtPatch).length > 0) themePatch.crt = crtPatch;
        }
      }

      if (ts.y2k !== undefined) {
        const y = ts.y2k;
        if (typeof y !== 'object' || y === null || Array.isArray(y)) {
          errors.push('themeSettings.y2k must be an object');
        } else {
          const y2kPatch: Partial<OverlaySettings['themeSettings']['y2k']> = {};
          if ('reducedEffects' in y) {
            if (typeof y.reducedEffects !== 'boolean') {
              errors.push('themeSettings.y2k.reducedEffects must be a boolean');
            } else {
              y2kPatch.reducedEffects = y.reducedEffects;
            }
          }
          if ('showBarOrnaments' in y) {
            if (typeof y.showBarOrnaments !== 'boolean') {
              errors.push('themeSettings.y2k.showBarOrnaments must be a boolean');
            } else {
              y2kPatch.showBarOrnaments = y.showBarOrnaments;
            }
          }
          if (Object.keys(y2kPatch).length > 0) themePatch.y2k = y2kPatch;
        }
      }

      if (Object.keys(themePatch).length > 0) {
        patch.themeSettings = {
          ...(patch.themeSettings ?? {}),
          ...(themePatch.crt ? { crt: themePatch.crt } : {}),
          ...(themePatch.y2k ? { y2k: themePatch.y2k } : {}),
        } as OverlaySettings['themeSettings'];
      }
    }
  }

  if ('hideBackground' in body) {
    const v = body.hideBackground;
    if (typeof v !== 'boolean') {
      errors.push('hideBackground must be a boolean');
    } else {
      patch.hideBackground = v;
    }
  }

  if ('hideContent' in body) {
    const v = body.hideContent;
    if (typeof v !== 'boolean') {
      errors.push('hideContent must be a boolean');
    } else {
      patch.hideContent = v;
    }
  }

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  // updateUserSettings reads, deep-merges, writes, and returns the persisted result in one pass
  const persisted = updateUserSettings(username, patch);
  if (!persisted) {
    res.status(500).json({ error: 'Failed to save settings' });
    return;
  }

  res.json({ settings: persisted });
});

export default router;
