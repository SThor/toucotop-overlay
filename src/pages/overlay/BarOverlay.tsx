import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { TwitchProvider } from '../../contexts/TwitchContext';
import ThemeBackground from '../../components/ThemeBackground';
import MarqueeText from '../../components/MarqueeText';
import BarY2KOrnament from '../../components/BarY2KOrnament';
import GlobalAlertLayer from '../../components/GlobalAlertLayer';
import '../../styles/BarOverlay.css';

const BarOverlayContent = () => {
  const { settings, isLoadingSettings } = useSettings();
  const twitch = TwitchProvider.useTwitch();
  const reducedEffects = settings.themeSettings.y2k.reducedEffects;
  const overlayRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [overlayWidth, setOverlayWidth] = useState(0);
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

  // Track rendered width so lower-priority items can be hidden as space shrinks.
  useEffect(() => {
    const measure = () => {
      const nextWidth = overlayRef.current?.clientWidth ?? 0;
      setOverlayWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    };

    measure();

    const node = overlayRef.current;
    if (!node) return;

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
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

  const visibleItems = useMemo(() => {
    type ItemKey = 'clock' | 'duration' | 'title' | 'stats' | 'recentFollower' | 'recentSub';

    const config: Array<{ key: ItemKey; enabled: boolean; minWidth: number; dropRank: number; keep?: boolean }> = [
      { key: 'clock', enabled: settings.barSections.clock, minWidth: 114, dropRank: 3 },
      { key: 'duration', enabled: settings.barSections.duration, minWidth: 132, dropRank: 4 },
      { key: 'title', enabled: settings.barSections.title, minWidth: 220, dropRank: 0, keep: true },
      { key: 'stats', enabled: settings.barSections.stats, minWidth: 232, dropRank: 2 },
      { key: 'recentFollower', enabled: settings.barSections.recentFollower && !!twitch.lastFollower, minWidth: 214, dropRank: 1 },
      { key: 'recentSub', enabled: settings.barSections.recentSub && !!twitch.lastSubscriber, minWidth: 214, dropRank: 5 },
    ];

    const active = config.filter((item) => item.enabled);
    if (active.length === 0) return new Set<ItemKey>();

    // On first render before measurement, keep all enabled sections.
    if (overlayWidth <= 0) return new Set<ItemKey>(active.map((item) => item.key));

    // Reserve a little room for dividers and section gaps.
    const dividerBudget = Math.max(0, active.length - 1) * 16;
    const available = Math.max(0, overlayWidth - 24);
    let total = active.reduce((sum, item) => sum + item.minWidth, 0) + dividerBudget;
    const keep = new Set<ItemKey>(active.map((item) => item.key));

    const droppable = [...active]
      .filter((item) => !item.keep)
      .sort((a, b) => b.dropRank - a.dropRank);

    for (const item of droppable) {
      if (total <= available) break;
      if (!keep.has(item.key)) continue;
      keep.delete(item.key);
      total -= item.minWidth + 16;
    }

    // Always keep at least one item visible.
    if (keep.size === 0 && active[0]) keep.add(active[0].key);

    return keep;
  }, [
    overlayWidth,
    settings.barSections.clock,
    settings.barSections.duration,
    settings.barSections.title,
    settings.barSections.stats,
    settings.barSections.recentFollower,
    settings.barSections.recentSub,
    twitch.lastFollower,
    twitch.lastSubscriber,
  ]);

  if (isLoadingSettings) return null;

  return (
    <div
      ref={overlayRef}
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

        if (sec.clock && visibleItems.has('clock')) sections.push(
          <div key="clock" className="bar-section bar-section-clock">
            <div className="bar-stat-content">
              <div className="bar-time-value">{formatTime(currentTime)}</div>
              <div className="bar-time-label">Current Time</div>
            </div>
          </div>
        );

        if (sec.duration && visibleItems.has('duration')) sections.push(
          <div key="duration" className="bar-section bar-section-duration">
            <div className="bar-stat-content">
              <div className="bar-time-value">{formatStreamDuration()}</div>
              <div className="bar-time-label">Stream Duration</div>
            </div>
          </div>
        );

        if (sec.title && visibleItems.has('title')) sections.push(
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

        if (sec.stats && visibleItems.has('stats')) sections.push(
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

        const showRecentFollower = sec.recentFollower && !!twitch.lastFollower && visibleItems.has('recentFollower');
        const showRecentSub = sec.recentSub && !!twitch.lastSubscriber && visibleItems.has('recentSub');
        const hasRecent = showRecentFollower || showRecentSub;
        if (hasRecent) sections.push(
          <div key="recent" className="bar-section bar-recent-section">
            {showRecentFollower && twitch.lastFollower && (
              <div className={`bar-recent-item ${newFollowerAnimation ? 'new-update' : ''}`}>
                <div className="bar-recent-icon" aria-hidden="true">❤️</div>
                <div className="bar-recent-content">
                  <MarqueeText className="bar-recent-name" text={twitch.lastFollower.userDisplayName} />
                  <div className="bar-recent-label">Last Follow {formatRelativeTime(twitch.lastFollower.followDate)}</div>
                </div>
              </div>
            )}
            {showRecentSub && twitch.lastSubscriber && (
              <div className={`bar-recent-item ${newSubscriberAnimation ? 'new-update' : ''}`}>
                <div className="bar-recent-icon" aria-hidden="true">⭐</div>
                <div className="bar-recent-content">
                  <MarqueeText className="bar-recent-name" text={twitch.lastSubscriber.userDisplayName} />
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
      <GlobalAlertLayer />
    </div>
  );
};

const BarOverlay = () => {
  return <BarOverlayContent />;
};

export default BarOverlay;
