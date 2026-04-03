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

const router: Router = express.Router();

/**
 * GET /api/settings
 * Returns the stored overlay settings for the token owner.
 */
router.get('/', (req: Request, res: Response) => {
  const username = req.userData!.username;
  const user = getUserTokens(username);
  const raw = user?.overlaySettings ?? defaultOverlaySettings;
  const normalized: OverlaySettings = {
    ...defaultOverlaySettings,
    ...raw,
    themeSettings: {
      ...defaultOverlaySettings.themeSettings,
      ...(raw.themeSettings ?? {}),
      crt: {
        ...defaultOverlaySettings.themeSettings.crt,
        ...(raw.themeSettings?.crt ?? {}),
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
  const body = req.body as Partial<OverlaySettings>;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return;
  }

  const patch: Partial<OverlaySettings> = {};
  const errors: string[] = [];

  if ('overlayOpacity' in body) {
    const v = body.overlayOpacity;
    if (typeof v !== 'number' || v < 0.1 || v > 1) {
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
    if (v !== 'crt' && v !== 'default') {
      errors.push('theme must be "crt" or "default"');
    } else {
      patch.theme = v;
    }
  }

  if ('overlayFullWidth' in body) {
    const v = body.overlayFullWidth;
    if (typeof v !== 'boolean') {
      errors.push('overlayFullWidth must be a boolean');
    } else {
      patch.overlayFullWidth = v;
    }
  }

  if ('themeSettings' in body) {
    const ts = body.themeSettings;
    if (typeof ts !== 'object' || ts === null || Array.isArray(ts)) {
      errors.push('themeSettings must be an object');
    } else if (ts.crt !== undefined) {
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
        if (Object.keys(crtPatch).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          patch.themeSettings = { crt: crtPatch } as any;
        }
      }
    }
  }

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  const username = req.userData!.username;
  // Read current settings before update so we can compute the response accurately
  const base = getUserTokens(username)?.overlaySettings ?? defaultOverlaySettings;

  const ok = updateUserSettings(username, patch);
  if (!ok) {
    res.status(500).json({ error: 'Failed to save settings' });
    return;
  }

  // Compute the deep-merged result (mirrors updateUserSettings logic) so the
  // response reflects what was actually persisted rather than the stale pre-update value.
  const persisted: OverlaySettings = {
    ...defaultOverlaySettings,
    ...base,
    ...patch,
    themeSettings: {
      ...defaultOverlaySettings.themeSettings,
      ...(base.themeSettings ?? {}),
      ...(patch.themeSettings ?? {}),
      crt: {
        ...defaultOverlaySettings.themeSettings.crt,
        ...(base.themeSettings?.crt ?? {}),
        ...(patch.themeSettings?.crt ?? {}),
      },
    },
  };

  res.json({ settings: persisted });
});

export default router;
