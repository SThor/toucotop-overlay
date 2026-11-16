import { describe, expect, it } from 'vitest';
import {
  EMPTY_SMTC_STATE,
  applySmtcMessage,
  estimatePositionMs,
  formatPlaybackTime,
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
