import { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import AnimatedBackground from '../components/AnimatedBackground';
import CRTBackground from '../components/CRTBackground';
import '../styles/ClockOverlay.css';

const ClockOverlay = () => {
  const { settings } = useSettings();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [streamStartTime] = useState(new Date()); // Would be set when stream starts
  const [streamDuration, setStreamDuration] = useState('00:00:00');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      // Calculate stream duration
      const duration = now.getTime() - streamStartTime.getTime();
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((duration % (1000 * 60)) / 1000);
      
      setStreamDuration(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [streamStartTime]);

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
          {settings.streamTitle}
        </div>
      </div>
    </div>
  );
};

export default ClockOverlay;
