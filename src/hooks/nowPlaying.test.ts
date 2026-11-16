import { describe, expect, it } from 'vitest';
import {
  EMPTY_SMTC_STATE,
  applySmtcMessage,
  estimatePositionMs,
  formatPlaybackTime,
  HIDDEN,
  PAUSE_GRACE_MS,
  stepVisibility,
  toNowPlaying,
  type NowPlaying,
  type SmtcState,
} from './nowPlaying';

const BASE = 'http://localhost:11451';
const NOW = Date.parse('2026-11-16T20:00:00Z');

const info = (data: Record<string, unknown>) => JSON.stringify({ type: 'info', v: 2, ts: NOW, data });
const progress = (data: Record<string, unknown>) => JSON.stringify({ type: 'progress', v: 2, ts: NOW, data });

const spotifyInfo = {
  artist: 'Daft Punk', title: 'Veridis Quo', albumTitle: 'Discovery', albumArtist: 'Daft Punk',
  playbackType: 1, sourceApp: 'Spotify.exe', albumArt: '/albumArt/abc123',
};

function feed(...messages: string[]): SmtcState {
  return messages.reduce((state, msg) => applySmtcMessage(state, msg, NOW), EMPTY_SMTC_STATE);
}

describe('applySmtcMessage + toNowPlaying', () => {
  it('builds a track from info and progress messages', () => {
    const state = feed(
      info(spotifyInfo),
      progress({ position: 42, duration: 345, status: 4, lastUpdatedTime: NOW - 1000 }),
    );

    expect(toNowPlaying(state, BASE)).toEqual({
      title: 'Veridis Quo',
      artist: 'Daft Punk',
      album: 'Discovery',
      source: 'spotify',
      isPlaying: true,
      positionMs: 42_000,
      durationMs: 345_000,
      artwork: 'http://localhost:11451/albumArt/abc123',
      updatedAt: NOW,
    });
  });

  it('detects Deezer and marks paused tracks', () => {
    const state = feed(
      info({ ...spotifyInfo, sourceApp: 'Deezer.Desktop', albumArt: '' }),
      progress({ position: 0, duration: 0, status: 5 }),
    );
    expect(toNowPlaying(state, BASE)).toMatchObject({ source: 'deezer', isPlaying: false });
    expect(toNowPlaying(state, BASE)?.artwork).toBeUndefined();
    expect(toNowPlaying(state, BASE)?.durationMs).toBeUndefined();
  });

  it('labels any other player as "other"', () => {
    const state = feed(info({ ...spotifyInfo, sourceApp: 'foobar2000.exe' }));
    expect(toNowPlaying(state, BASE)?.source).toBe('other');
  });

  it('returns null when nothing is playing', () => {
    expect(toNowPlaying(EMPTY_SMTC_STATE, BASE)).toBeNull();
    expect(toNowPlaying(feed(info({ ...spotifyInfo, title: '' })), BASE)).toBeNull();
  });

  it('returns null when the session is closed or stopped', () => {
    expect(toNowPlaying(feed(info(spotifyInfo), progress({ position: 0, duration: 0, status: 0 })), BASE)).toBeNull();
    expect(toNowPlaying(feed(info(spotifyInfo), progress({ position: 0, duration: 0, status: 3 })), BASE)).toBeNull();
  });

  it('ignores video sessions (YouTube in a browser, etc.)', () => {
    expect(toNowPlaying(feed(info({ ...spotifyInfo, playbackType: 2 })), BASE)).toBeNull();
  });

  it('ignores malformed and unrelated messages', () => {
    const state = feed(info(spotifyInfo));
    expect(applySmtcMessage(state, 'not json', NOW)).toBe(state);
    expect(applySmtcMessage(state, JSON.stringify({ type: 'pong', v: 2, ts: NOW }), NOW)).toBe(state);
  });

  it('keeps an absolute artwork URL untouched', () => {
    const state = feed(info({ ...spotifyInfo, albumArt: 'https://cdn.example/cover.jpg' }));
    expect(toNowPlaying(state, BASE)?.artwork).toBe('https://cdn.example/cover.jpg');
  });
});

describe('stepVisibility (pause grace period)', () => {
  const playing: NowPlaying = { title: 'T', artist: 'A', source: 'deezer', isPlaying: true, positionMs: 1000, updatedAt: NOW };
  const paused: NowPlaying = { ...playing, isPlaying: false };

  it('uses a 5 second grace period by default', () => {
    expect(PAUSE_GRACE_MS).toBe(5000);
  });

  it('honours a custom grace period', () => {
    const justPaused = stepVisibility(stepVisibility(HIDDEN, playing, NOW), paused, NOW, { graceMs: 10_000 });
    expect(justPaused.hideAt).toBe(NOW + 10_000);
  });

  it('hides immediately with a zero grace period', () => {
    expect(stepVisibility(stepVisibility(HIDDEN, playing, NOW), paused, NOW, { graceMs: 0 })).toEqual(HIDDEN);
  });

  it('keeps paused tracks on screen when hiding on pause is disabled', () => {
    const options = { hideWhenPaused: false };
    expect(stepVisibility(HIDDEN, paused, NOW, options)).toEqual({ shown: paused, hideAt: null });
    const later = stepVisibility(stepVisibility(HIDDEN, playing, NOW, options), paused, NOW + 60_000, options);
    expect(later).toEqual({ shown: paused, hideAt: null });
  });

  it('still uses the grace period when the session disappears, even if paused tracks stay visible', () => {
    const gone = stepVisibility(stepVisibility(HIDDEN, playing, NOW), null, NOW, { hideWhenPaused: false });
    expect(gone).toEqual({ shown: paused, hideAt: NOW + 5000 });
  });

  it('shows a playing track right away', () => {
    expect(stepVisibility(HIDDEN, playing, NOW)).toEqual({ shown: playing, hideAt: null });
  });

  it('never shows a track that was already paused when first seen', () => {
    expect(stepVisibility(HIDDEN, paused, NOW)).toEqual(HIDDEN);
  });

  it('keeps a paused track visible during the grace period, then hides it', () => {
    const visible = stepVisibility(HIDDEN, playing, NOW);
    const justPaused = stepVisibility(visible, paused, NOW + 1000);
    expect(justPaused).toEqual({ shown: paused, hideAt: NOW + 6000 });

    expect(stepVisibility(justPaused, paused, NOW + 5999).shown).toEqual(paused);
    expect(stepVisibility(justPaused, paused, NOW + 6000)).toEqual(HIDDEN);
  });

  it('does not restart the grace period on repeated paused updates', () => {
    const justPaused = stepVisibility(stepVisibility(HIDDEN, playing, NOW), paused, NOW);
    expect(stepVisibility(justPaused, paused, NOW + 3000).hideAt).toBe(NOW + 5000);
  });

  it('keeps the last track (frozen) when the session briefly disappears, e.g. between songs', () => {
    const visible = stepVisibility(HIDDEN, playing, NOW);
    const gap = stepVisibility(visible, null, NOW + 500);
    expect(gap).toEqual({ shown: paused, hideAt: NOW + 5500 });
  });

  it('cancels the grace period when playback resumes', () => {
    const justPaused = stepVisibility(stepVisibility(HIDDEN, playing, NOW), paused, NOW);
    const next = { ...playing, title: 'Next', updatedAt: NOW + 2000 };
    expect(stepVisibility(justPaused, next, NOW + 2000)).toEqual({ shown: next, hideAt: null });
  });
});

describe('estimatePositionMs', () => {
  const track: NowPlaying = { title: 'T', artist: 'A', source: 'spotify', isPlaying: true, positionMs: 10_000, durationMs: 60_000, updatedAt: NOW };

  it('advances the position while playing', () => {
    expect(estimatePositionMs(track, NOW + 2_500)).toBe(12_500);
  });

  it('freezes the position while paused', () => {
    expect(estimatePositionMs({ ...track, isPlaying: false }, NOW + 2_500)).toBe(10_000);
  });

  it('never exceeds the duration', () => {
    expect(estimatePositionMs(track, NOW + 120_000)).toBe(60_000);
  });

  it('returns null when the position is unknown', () => {
    expect(estimatePositionMs({ ...track, positionMs: undefined }, NOW)).toBeNull();
  });
});

describe('formatPlaybackTime', () => {
  it('formats minutes and seconds, with hours when needed', () => {
    expect(formatPlaybackTime(65_000)).toBe('1:05');
    expect(formatPlaybackTime(3_725_000)).toBe('1:02:05');
  });
});
