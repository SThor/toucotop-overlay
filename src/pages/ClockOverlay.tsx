import { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { TwitchProvider } from '../contexts/TwitchContext';
import AnimatedBackground from '../components/AnimatedBackground';
import CRTBackground from '../components/CRTBackground';
import '../styles/ClockOverlay.css';

const ClockOverlay = () => {
  const { settings } = useSettings();
  const { streamInfo, fetchStreamInfo } = TwitchProvider.useTwitch();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [streamDuration, setStreamDuration] = useState('00:00:00');

  // Trigger stream info fetch when component mounts or channel changes
  useEffect(() => {
    if (settings.channelName && fetchStreamInfo) {
      fetchStreamInfo();
    }
  }, [settings.channelName, fetchStreamInfo]);

  // Fetch stream info on component mount and periodically refresh
  useEffect(() => {
    if (settings.channelName && !settings.previewMode) {
      fetchStreamInfo();
      
      // Smart refresh: check every 30 seconds, but only log/notify when data actually changes
      let lastTitle = '';
      let lastGame = '';
      
      const refreshInterval = setInterval(async () => {
        const previousTitle = lastTitle;
        const previousGame = lastGame;
        
        await fetchStreamInfo();
        
        // Check if title or game changed (we'll get the new data from streamInfo in next render)
        if (streamInfo) {
          if (streamInfo.title !== previousTitle && previousTitle !== '') {
            console.log(`🎯 Stream title changed: "${previousTitle}" → "${streamInfo.title}"`);
          }
          if (streamInfo.gameName !== previousGame && previousGame !== '') {
            console.log(`🎮 Game changed: "${previousGame}" → "${streamInfo.gameName}"`);
          }
          
          lastTitle = streamInfo.title;
          lastGame = streamInfo.gameName;
        }
      }, 30 * 1000);

      return () => clearInterval(refreshInterval);
    }
  }, [settings.channelName, settings.previewMode, fetchStreamInfo, streamInfo]);

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

  return (
    <div 
      className={`clock-overlay ${settings.previewMode ? 'preview-mode' : ''}`}
      style={{ opacity: settings.overlayOpacity }}
    >
      {settings.crtEffects ? <CRTBackground /> : <AnimatedBackground />}
      <div className="current-time-section">
        <div className={`time-label ${settings.crtEffects ? 'crt-glow-text-subtle' : ''}`}>Current Time</div>
        <div className={`current-time ${settings.crtEffects ? 'crt-glow-text' : ''}`}>{formatTime(currentTime)}</div>
        <div className="current-date">{formatDate(currentTime)}</div>
      </div>
      
      <div className="divider"></div>
      
      <div className="stream-time-section">
        <div className={`time-label ${settings.crtEffects ? 'crt-glow-text-subtle' : ''}`}>Stream Duration</div>
        <div className={`stream-duration ${settings.crtEffects ? 'crt-glow-text-strong' : ''}`}>{streamDuration}</div>
        <div className="stream-info">
          {settings.channelName ? `${settings.channelName} Live` : 'Live Stream'}
        </div>
      </div>
      
      <div className="clock-footer">
        <div className="stream-title">
          {streamInfo && streamInfo.isLive 
            ? streamInfo.title 
            : (settings.previewMode ? 'Preview: Stream Title' : 'Stream Offline')
          }
        </div>
        <div className="stream-category">
          {streamInfo && streamInfo.isLive && streamInfo.gameName && (
              <>{streamInfo.gameName}</>
            )}
            {settings.previewMode && (
              <>{`Preview: Game Category`}</>
            )}
          </div>
      </div>
    </div>
  );
};

export default ClockOverlay;
