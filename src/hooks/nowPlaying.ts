// "Now playing" support, fed by the local companion app smtc-now-playing
// (https://github.com/soarqin/smtc-now-playing). It reads the Windows media
// session (SMTC), which Spotify and Deezer desktop both publish, and exposes it
// on ws://localhost:11451/ws. OBS runs on the same machine, so the overlay
// connects to it directly.

export const DEFAULT_NOW_PLAYING_URL = 'http://localhost:11451';

export type NowPlayingSource = 'spotify' | 'deezer' | 'other';

export interface NowPlaying {
  title: string;
  artist: string;
  album?: string;
  source: NowPlayingSource;
  isPlaying: boolean;
  /** Playback position at `updatedAt`, in milliseconds. */
  positionMs?: number;
  durationMs?: number;
  artwork?: string;
  /** Local time (ms since epoch) the position was received. */
  updatedAt: number;
}

// Subset of the smtc-now-playing WebSocket v2 protocol we rely on.
interface SmtcInfo {
  title: string;
  artist: string;
  albumTitle: string;
  playbackType: number;
  sourceApp: string;
  albumArt: string;
}

interface SmtcProgress {
  /** Seconds. */
  position: number;
  /** Seconds. */
  duration: number;
  status: number;
}

export interface SmtcState {
  info: SmtcInfo | null;
  progress: SmtcProgress | null;
  updatedAt: number;
}

export const EMPTY_SMTC_STATE: SmtcState = { info: null, progress: null, updatedAt: 0 };

// SMTC playback status / type values
const STATUS_PLAYING = 4;
const STATUS_PAUSED = 5;
const PLAYBACK_TYPE_VIDEO = 2;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Fold one raw WebSocket message into the state. Unknown messages are ignored. */
export function applySmtcMessage(state: SmtcState, raw: string, now: number): SmtcState {
  let msg: { type?: unknown; data?: unknown };
  try {
    msg = JSON.parse(raw);
  } catch {
    return state;
  }
  const data = (msg.data && typeof msg.data === 'object' ? msg.data : {}) as Record<string, unknown>;

  if (msg.type === 'info') {
    return {
      ...state,
      info: {
        title: str(data.title).trim(),
        artist: str(data.artist).trim(),
        albumTitle: str(data.albumTitle).trim(),
        playbackType: num(data.playbackType),
        sourceApp: str(data.sourceApp),
        albumArt: str(data.albumArt),
      },
      updatedAt: now,
    };
  }

  if (msg.type === 'progress') {
    return {
      ...state,
      progress: { position: num(data.position), duration: num(data.duration), status: num(data.status) },
      updatedAt: now,
    };
  }

  return state;
}

function detectSource(sourceApp: string): NowPlayingSource {
  const app = sourceApp.toLowerCase();
  if (app.includes('spotify')) return 'spotify';
  if (app.includes('deezer')) return 'deezer';
  return 'other';
}

/** Current track, or null when nothing (musical) is playing or paused. */
export function toNowPlaying(state: SmtcState, baseUrl: string): NowPlaying | null {
  const { info, progress } = state;
  if (!info || !info.title || info.playbackType === PLAYBACK_TYPE_VIDEO) return null;
  if (progress && progress.status !== STATUS_PLAYING && progress.status !== STATUS_PAUSED) return null;

  const track: NowPlaying = {
    title: info.title,
    artist: info.artist,
    source: detectSource(info.sourceApp),
    isPlaying: progress ? progress.status === STATUS_PLAYING : true,
    updatedAt: state.updatedAt,
  };
  if (info.albumTitle) track.album = info.albumTitle;
  if (info.albumArt) track.artwork = new URL(info.albumArt, baseUrl).toString();
  if (progress) {
    track.positionMs = Math.max(0, progress.position) * 1000;
    if (progress.duration > 0) track.durationMs = progress.duration * 1000;
  }
  return track;
}

/** Current playback position, extrapolated from the last update while playing. */
export function estimatePositionMs(track: NowPlaying, now: number): number | null {
  if (track.positionMs === undefined) return null;
  const elapsed = track.isPlaying ? Math.max(0, now - track.updatedAt) : 0;
  const position = track.positionMs + elapsed;
  return track.durationMs !== undefined ? Math.min(position, track.durationMs) : position;
}

export function formatPlaybackTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

export function toWebSocketUrl(baseUrl: string): string {
  const url = new URL('/ws', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
