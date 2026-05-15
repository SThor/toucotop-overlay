import React, { useEffect, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { TwitchProvider } from '../../contexts/TwitchContext';
import ThemeBackground from '../../components/ThemeBackground';
import MarqueeText from '../../components/MarqueeText';
import BarY2KOrnament from '../../components/BarY2KOrnament';
import '../../styles/BarOverlay.css';

const BarOverlayContent = () => {
  const { settings, isLoadingSettings } = useSettings();
  const twitch = TwitchProvider.useTwitch();
  const reducedEffects = settings.themeSettings.y2k.reducedEffects;
  const [currentTime, setCurrentTime] = useState(new Date());
  const [newFollowerAnimation, setNewFollowerAnimation] = useState(false);
  const [newSubscriberAnimation, setNewSubscriberAnimation] = useState(false);
  const [prevFollower, setPrevFollower] = useState<string | null>(null);
  const [prevSubscriber, setPrevSubscriber] = useState<string | null>(null);

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Set overlay mode for OBS transparency
  useEffect(() => {
    document.body.classList.add('overlay-mode');
    return () => document.body.classList.remove('overlay-mode');
  }, []);

  // TwitchContext handles connection automatically - no manual connection needed

  // Animate when new follower detected
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | null = null;
    if (twitch.lastFollower && twitch.lastFollower.userName !== prevFollower) {
      setPrevFollower(twitch.lastFollower.userName);
      setNewFollowerAnimation(true);
      id = setTimeout(() => setNewFollowerAnimation(false), 2000);
    }
    return () => { if (id !== null) clearTimeout(id); };
  }, [twitch.lastFollower, prevFollower]);

  // Animate when new subscriber detected
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | null = null;
    if (twitch.lastSubscriber && twitch.lastSubscriber.userName !== prevSubscriber) {
      setPrevSubscriber(twitch.lastSubscriber.userName);
      setNewSubscriberAnimation(true);
      id = setTimeout(() => setNewSubscriberAnimation(false), 2000);
    }
    return () => { if (id !== null) clearTimeout(id); };
  }, [twitch.lastSubscriber, prevSubscriber]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatStreamDuration = () => {
    if (!twitch.streamInfo?.isLive || !twitch.streamInfo?.startedAt) {
      return '00:00:00';
    }
    
    const duration = Date.now() - twitch.streamInfo.startedAt.getTime();
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((duration % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const formatRelativeTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (isLoadingSettings) return null;

  return (
    <div
      className={`bar-overlay${settings.theme === 'crt' ? ' crt-active' : ''}${!settings.barFloating ? ' full-width' : ''}${settings.theme === 'y2k' ? ' y2k-active' : ''}`}
      style={{ opacity: settings.perOverlayOpacity?.bar ?? settings.overlayOpacity, fontSize: `${settings.perOverlayFontSize?.bar ?? settings.fontSize}rem` }}
    >
      <ThemeBackground panelMode />

      {settings.theme === 'y2k' && (
        <>
          <BarY2KOrnament staticMode={reducedEffects} />
          <BarY2KOrnament src="/tribal_center.png" center height={65} yOffset={-72} staticMode={reducedEffects} />
          <BarY2KOrnament flip staticMode={reducedEffects} />
        </>
      )}
      {(() => {
        const sec = settings.barSections;
        const sections: React.ReactNode[] = [];

        if (sec.clock) sections.push(
          <div key="clock" className="bar-section">
            <div className="bar-stat-content">
              <div className="bar-time-value">{formatTime(currentTime)}</div>
              <div className="bar-time-label">Current Time</div>
            </div>
          </div>
        );

        if (sec.duration) sections.push(
          <div key="duration" className="bar-section">
            <div className="bar-stat-content">
              <div className="bar-time-value">{formatStreamDuration()}</div>
              <div className="bar-time-label">Stream Duration</div>
            </div>
          </div>
        );

        if (sec.title) sections.push(
          <div key="title" className="bar-section bar-stream-section">
            <MarqueeText
              className="bar-stream-title"
              text={twitch.streamInfo?.title || 'Stream Title'}
            />
            <MarqueeText
              className="bar-stream-category"
              text={twitch.streamInfo?.gameName || 'No Category'}
            />
          </div>
        );

        if (sec.stats) sections.push(
          <div key="stats" className="bar-section bar-stats-section">
            <div className="bar-stat-item">
              <div className="bar-stat-icon" aria-hidden="true">👥</div>
              <div className="bar-stat-content">
                <div className="bar-stat-value">
                  {twitch.streamInfo?.isLive ? formatNumber(twitch.streamInfo.viewerCount) : '0'}
                </div>
                <div className="bar-stat-label">Viewers</div>
              </div>
            </div>
            <div className="bar-stat-item">
              <div className="bar-stat-icon" aria-hidden="true">❤️</div>
              <div className="bar-stat-content">
                <div className="bar-stat-value">{formatNumber(twitch.followerCount)}</div>
                <div className="bar-stat-label">Followers</div>
              </div>
            </div>
          </div>
        );

        const hasRecent = sec.recentFollower || sec.recentSub;
        if (hasRecent) sections.push(
          <div key="recent" className="bar-section bar-recent-section">
            {sec.recentFollower && twitch.lastFollower && (
              <div className={`bar-recent-item ${newFollowerAnimation ? 'new-update' : ''}`}>
                <div className="bar-recent-icon" aria-hidden="true">❤️</div>
                <div className="bar-recent-content">
                  <div className="bar-recent-name">{twitch.lastFollower.userDisplayName}</div>
                  <div className="bar-recent-label">Last Follow {formatRelativeTime(twitch.lastFollower.followDate)}</div>
                </div>
              </div>
            )}
            {sec.recentSub && twitch.lastSubscriber && (
              <div className={`bar-recent-item ${newSubscriberAnimation ? 'new-update' : ''}`}>
                <div className="bar-recent-icon" aria-hidden="true">⭐</div>
                <div className="bar-recent-content">
                  <div className="bar-recent-name">{twitch.lastSubscriber.userDisplayName}</div>
                  <div className="bar-recent-label">
                    Last Sub{twitch.lastSubscriber.subscribeDate ? ` ${formatRelativeTime(twitch.lastSubscriber.subscribeDate)}` : ''}
                    {twitch.lastSubscriber.isGift && ' (Gift)'}
                  </div>
                </div>
              </div>
            )}
          </div>
        );

        return sections.flatMap((node, i) =>
          i < sections.length - 1
            ? [node, <div key={`div-${i}`} className="bar-divider" />]
            : [node]
        );
      })()}
    </div>
  );
};

const BarOverlay = () => {
  return <BarOverlayContent />;
};

export default BarOverlay;
