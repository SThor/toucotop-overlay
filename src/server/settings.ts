/**
 * Settings API Routes
 * GET  /api/settings  — return server-stored overlay settings for the authenticated user
 * PATCH /api/settings — update settings (partial, merges with existing)
 */

import express, { type Request, type Response, Router } from 'express';
import { getUserByOverlayToken, updateUserSettings, defaultOverlaySettings, type OverlaySettings } from './storage.js';

const router: Router = express.Router();

/**
 * GET /api/settings
 * Returns the stored overlay settings for the token owner.
 */
router.get('/', (req: Request, res: Response) => {
  const token = req.query['token'];
  if (typeof token !== 'string' || !token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const user = getUserByOverlayToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const raw = user.overlaySettings ?? defaultOverlaySettings;
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
 * Merges the provided partial settings into the stored settings.
 */
router.patch('/', express.json(), (req: Request, res: Response) => {
  const token = req.query['token'];
  if (typeof token !== 'string' || !token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const user = getUserByOverlayToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const body = req.body as Partial<OverlaySettings>;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return;
  }

  // Whitelist known fields to avoid storing arbitrary data
  const allowed: (keyof OverlaySettings)[] = [
    'overlayOpacity', 'chatFeedDirection', 'maxChatMessages',
    'theme', 'themeSettings', 'overlayFullWidth',
  ];
  const patch: Partial<OverlaySettings> = {};
  for (const key of allowed) {
    if (key in body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[key] = (body as any)[key];
    }
  }

  const ok = updateUserSettings(user.username, patch);
  if (!ok) {
    res.status(500).json({ error: 'Failed to save settings' });
    return;
  }

  res.json({ settings: { ...user.overlaySettings, ...patch } });
});

export default router;
