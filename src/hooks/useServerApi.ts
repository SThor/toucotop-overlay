import { useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';

/**
 * Hook providing a fetch helper that calls server API endpoints
 * with the overlay token from settings.
 */
export function useServerApi() {
  const { settings } = useSettings();
  const token = settings.overlayToken;

  const fetchApi = useCallback(
    async <T = unknown>(endpoint: string): Promise<T | null> => {
      if (!token) return null;

      try {
        const res = await fetch(
          `/api/twitch/${endpoint}?token=${encodeURIComponent(token)}`
        );
        if (!res.ok) {
          console.warn(`API ${endpoint} returned ${res.status}`);
          return null;
        }
        return (await res.json()) as T;
      } catch (err) {
        console.error(`API ${endpoint} fetch error:`, err);
        return null;
      }
    },
    [token]
  );

  return { fetchApi, hasToken: !!token };
}
