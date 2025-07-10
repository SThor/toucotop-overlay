import { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import AnimatedBackground from '../components/AnimatedBackground';
import CRTBackground from '../components/CRTBackground';
import '../styles/BarOverlay.css';

interface ProgressItem {
  label: string;
  current: number;
  max: number;
  color: string;
}

const BarOverlay = () => {
  const { settings } = useSettings();
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([
    { label: 'Followers Goal', current: 1250, max: 2000, color: '#FF6B6B' },
    { label: 'Stream Health', current: 85, max: 100, color: '#4ECDC4' },
    { label: 'Chat Activity', current: 67, max: 100, color: '#45B7D1' }
  ]);

  // Set overlay mode for OBS transparency
  useEffect(() => {
    document.body.classList.add('overlay-mode');
    return () => document.body.classList.remove('overlay-mode');
  }, []);

  useEffect(() => {
    // Simulate progress updates
    const interval = setInterval(() => {
      setProgressItems(prev => prev.map(item => ({
        ...item,
        current: Math.min(item.max, item.current + Math.random() * 5)
      })));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const calculatePercentage = (current: number, max: number) => {
    return Math.min(100, (current / max) * 100);
  };

  return (
    <div 
      className={`bar-overlay ${settings.previewMode ? 'preview-mode' : ''}`}
      style={{ opacity: settings.overlayOpacity }}
    >
      {settings.crtEffects ? <CRTBackground /> : <AnimatedBackground />}
      <div className="bar-header">
        <h3 className={settings.crtEffects ? 'crt-glow-text' : ''}>📊 Stream Info</h3>
        <div className="channel-info">
          {settings.channelName && <span className={settings.crtEffects ? 'crt-glow-text-subtle' : ''}>@{settings.channelName}</span>}
        </div>
      </div>
      
      <div className="progress-section">
        {progressItems.map((item, index) => (
          <div key={index} className="progress-item">
            <div className="progress-header">
              <span className="progress-label">{item.label}</span>
              <span className="progress-value">
                {Math.floor(item.current)}/{item.max}
              </span>
            </div>
            
            <div className="progress-bar-container">
              <div 
                className="progress-bar"
                style={{
                  width: `${calculatePercentage(item.current, item.max)}%`,
                  backgroundColor: item.color
                }}
              >
                <div className="progress-bar-shine"></div>
              </div>
            </div>
            
            <div className="progress-percentage">
              {Math.round(calculatePercentage(item.current, item.max))}%
            </div>
          </div>
        ))}
      </div>
      
      <div className="stats-section">
        <div className="stat-item">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <div className="stat-value">342</div>
            <div className="stat-label">Viewers</div>
          </div>
        </div>
        
        <div className="stat-item">
          <div className="stat-icon">💬</div>
          <div className="stat-info">
            <div className="stat-value">1.2k</div>
            <div className="stat-label">Messages</div>
          </div>
        </div>
        
        <div className="stat-item">
          <div className="stat-icon">❤️</div>
          <div className="stat-info">
            <div className="stat-value">89</div>
            <div className="stat-label">Likes</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarOverlay;
