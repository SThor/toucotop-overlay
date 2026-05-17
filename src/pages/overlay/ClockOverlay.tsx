import { useEffect, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { TwitchProvider } from '../../contexts/TwitchContext';
import ThemeBackground from '../../components/ThemeBackground';
import MarqueeText from '../../components/MarqueeText';
import GlobalAlertLayer from '../../components/GlobalAlertLayer';
import '../../styles/ClockOverlay.css';

// Destructure the hook for cleaner usage
const { useTwitch } = TwitchProvider;

const ClockOverlay = () => {
  const { settings, isLoadingSettings } = useSettings();
  const { streamInfo } = useTwitch();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [streamDuration, setStreamDuration] = useState('00:00:00');
  
  // Track previous values for change detection
  const [lastTitle, setLastTitle] = useState('');
  const [lastGame, setLastGame] = useState('');

  // Detect and log changes in stream info
  useEffect(() => {
    if (streamInfo && streamInfo.isLive) {
      // Check for title changes
      if (streamInfo.title !== lastTitle) {
        if (lastTitle !== '') {
          console.log(`🎯 Stream title changed: "${lastTitle}" → "${streamInfo.title}"`);
        }
        setLastTitle(streamInfo.title);
      }
      
      // Check for game changes
      if (streamInfo.gameName !== lastGame) {
        if (lastGame !== '') {
          console.log(`🎮 Game changed: "${lastGame}" → "${streamInfo.gameName}"`);
        }
        setLastGame(streamInfo.gameName);
      }
    }
  }, [streamInfo, lastTitle, lastGame]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      // Calculate stream duration based on actual stream start time
      if (streamInfo && streamInfo.isLive && streamInfo.startedAt) {
        const duration = now.getTime() - streamInfo.startedAt.getTime();
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((duration % (1000 * 60)) / 1000);
        
        setStreamDuration(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      } else {
        setStreamDuration('00:00:00');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [streamInfo]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (isLoadingSettings) return null;

  return (
    <div
      className={`clock-overlay${settings.theme === 'crt' ? ' crt-active' : ''}${settings.theme === 'y2k' ? ' y2k-active' : ''}`}
      style={{ opacity: settings.perOverlayOpacity?.clock ?? settings.overlayOpacity, fontSize: `${settings.perOverlayFontSize?.clock ?? settings.fontSize}rem` }}
    >
      <ThemeBackground panelMode />
      <div className="current-time-section">
        <div className={`time-label ${settings.theme === 'crt' ? 'crt-glow-text-subtle' : ''}`}>Current Time</div>
        <div className={`current-time ${settings.theme === 'crt' ? 'crt-glow-text' : ''}`}>{formatTime(currentTime)}</div>
        <div className="current-date">{formatDate(currentTime)}</div>
      </div>
      
      <div className="divider"></div>
      
      <div className="stream-time-section">
        <div className={`time-label ${settings.theme === 'crt' ? 'crt-glow-text-subtle' : ''}`}>Stream Duration</div>
        <div className={`stream-duration ${settings.theme === 'crt' ? 'crt-glow-text-strong' : ''}`}>{streamDuration}</div>
        <div className="stream-info">
          {streamInfo == null ? '—' : streamInfo.isLive ? 'Live' : 'Offline'}
        </div>
      </div>
      
      <div className="clock-footer">
        <MarqueeText
          className="stream-title"
          text={streamInfo?.isLive ? streamInfo.title : 'Stream Offline'}
        />
        {streamInfo?.isLive && streamInfo?.gameName && (
          <MarqueeText
            className="stream-category"
            text={streamInfo.gameName}
          />
        )}
      </div>
      <GlobalAlertLayer />
    </div>
  );
};

export default ClockOverlay;
