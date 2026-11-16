import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettings } from '../../contexts/SettingsContext';
import ThemeBackground from '../../components/ThemeBackground';
import MarqueeText from '../../components/MarqueeText';
import { useNow, useNowPlaying } from '../../hooks/useNowPlaying';
import { estimatePositionMs, formatPlaybackTime, onlyWhilePlaying } from '../../hooks/nowPlaying';
import '../../styles/NowPlayingOverlay.css';

const SOURCE_LABEL = { spotify: 'Spotify', deezer: 'Deezer', other: 'Now Playing' } as const;

/**
 * Dedicated "now playing" card: cover, title, artist and progress.
 * Fed by the local smtc-now-playing companion; hidden when nothing plays or playback is paused.
 */
const NowPlayingOverlay = () => {
  const { settings, isLoadingSettings } = useSettings();
  const track = onlyWhilePlaying(useNowPlaying(!isLoadingSettings));
  const now = useNow(!!track);

  useEffect(() => {
    document.body.classList.add('overlay-mode');
    return () => document.body.classList.remove('overlay-mode');
  }, []);

  if (isLoadingSettings) return null;

  const position = track ? estimatePositionMs(track, now) : null;
  const progress = track?.durationMs && position !== null ? position / track.durationMs : null;
  const themeClass = settings.theme === 'crt' ? ' crt-active' : settings.theme === 'y2k' ? ' y2k-active' : '';

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          key="now-playing"
          className={`now-playing-overlay${themeClass}`}
          style={{ opacity: settings.overlayOpacity, fontSize: `${settings.fontSize}rem` }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: settings.overlayOpacity, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <ThemeBackground panelMode />
          <div className="now-playing-cover">
            {track.artwork
              ? <img src={track.artwork} alt="" />
              : <div className="now-playing-cover-placeholder" aria-hidden="true">🎵</div>}
          </div>
          <div className="now-playing-info">
            <div className="now-playing-source">
              ▶ {SOURCE_LABEL[track.source]}
            </div>
            <MarqueeText className="now-playing-title" text={track.title} />
            <MarqueeText className="now-playing-artist" text={track.album ? `${track.artist} · ${track.album}` : track.artist} />
            {progress !== null && position !== null && track.durationMs && (
              <div className="now-playing-progress">
                <span>{formatPlaybackTime(position)}</span>
                <div className="now-playing-progress-bar">
                  <div className="now-playing-progress-fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
                </div>
                <span>{formatPlaybackTime(track.durationMs)}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NowPlayingOverlay;
