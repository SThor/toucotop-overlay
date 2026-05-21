import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { TwitchProvider } from '../../contexts/TwitchContext';
import ThemeBackground from '../../components/ThemeBackground';
import MarqueeText from '../../components/MarqueeText';
import BarY2KOrnament from '../../components/BarY2KOrnament';
import GlobalAlertLayer from '../../components/GlobalAlertLayer';
import { type BarSectionKey } from '../../server/shared/overlaySettings';
import '../../styles/BarOverlay.css';

const SECTION_MIN_WIDTH: Record<BarSectionKey, number> = {
  clock: 114,
  duration: 132,
  title: 148,
  viewers: 92,
  followers: 92,
  subscribers: 102,
  recentFollower: 144,
  recentSub: 144,
};

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
    if (isLoadingSettings) return;

    const measure = () => {
      // In floating mode the bar shrinks to fit its content, so measuring the
      // bar's own clientWidth creates a feedback loop (bar shrinks → less budget
      // → more items hidden → bar shrinks further). Instead use the viewport
      // width capped at 95 % as the available budget so items are shown/hidden
      // based on the maximum space the bar could ever occupy.
      const nextWidth = settings.barFloating
        ? window.innerWidth * 0.95
        : (overlayRef.current?.clientWidth ?? 0);
      setOverlayWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    };

    measure();

    // Full-width mode: observe the bar element (it fills 100 vw so the bar's
    // clientWidth is the right budget and changes on window resize).
    // Floating mode: just listen on window resize so the 95 vw budget updates.
    if (!settings.barFloating) {
      const node = overlayRef.current;
      if (node && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(measure);
        ro.observe(node);
        return () => ro.disconnect();
      }
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isLoadingSettings, settings.barFloating]);

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
    const ordered = settings.barSectionOrder.filter((key) => settings.barSections[key]);
    const active = ordered.filter((key) => {
      if (key === 'recentFollower') return !!twitch.lastFollower;
      if (key === 'recentSub') return !!twitch.lastSubscriber;
      return true;
    });

    if (active.length === 0) return new Set<BarSectionKey>();
    if (overlayWidth <= 0) return new Set<BarSectionKey>(active);

    const dividerBudget = Math.max(0, active.length - 1) * 16;
    const available = Math.max(0, overlayWidth - 24);
    let total = active.reduce((sum, key) => sum + SECTION_MIN_WIDTH[key], 0) + dividerBudget;
    const keep = new Set<BarSectionKey>(active);

    const orderIndex = new Map(settings.barSectionOrder.map((key, index) => [key, index]));
    const droppable = [...active].sort((a, b) => {
      const priorityDiff = (settings.barSectionPriority[b] ?? 99) - (settings.barSectionPriority[a] ?? 99);
      if (priorityDiff !== 0) return priorityDiff;
      return (orderIndex.get(b) ?? 0) - (orderIndex.get(a) ?? 0);
    });

    for (const key of droppable) {
      if (total <= available) break;
      if (!keep.has(key)) continue;
      keep.delete(key);
      total -= SECTION_MIN_WIDTH[key] + 16;
    }

    if (keep.size === 0 && active[0]) keep.add(active[0]);

    return keep;
  }, [
    overlayWidth,
    settings.barSectionOrder,
    settings.barSectionPriority,
    settings.barSections,
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
        const sectionNodes: Record<BarSectionKey, React.ReactNode | null> = {
          clock: visibleItems.has('clock')
            ? (
              <div key="clock" className="bar-section bar-section-clock">
                <div className="bar-stat-content">
                  <div className="bar-time-value">{formatTime(currentTime)}</div>
                  <div className="bar-time-label">Current Time</div>
                </div>
              </div>
            )
            : null,
          duration: visibleItems.has('duration')
            ? (
              <div key="duration" className="bar-section bar-section-duration">
                <div className="bar-stat-content">
                  <div className="bar-time-value">{formatStreamDuration()}</div>
                  <div className="bar-time-label">Stream Duration</div>
                </div>
              </div>
            )
            : null,
          title: visibleItems.has('title')
            ? (
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
            )
            : null,
          viewers: visibleItems.has('viewers')
            ? (
              <div key="viewers" className="bar-section bar-stat-section">
                <div className="bar-stat-item">
                  <div className="bar-stat-icon" aria-hidden="true">👥</div>
                  <div className="bar-stat-content">
                    <div className="bar-stat-value">
                      {twitch.streamInfo?.isLive ? formatNumber(twitch.streamInfo.viewerCount) : '0'}
                    </div>
                    <div className="bar-stat-label">Viewers</div>
                  </div>
                </div>
              </div>
            )
            : null,
          followers: visibleItems.has('followers')
            ? (
              <div key="followers" className="bar-section bar-stat-section">
                <div className="bar-stat-item">
                  <div className="bar-stat-icon" aria-hidden="true">❤️</div>
                  <div className="bar-stat-content">
                    <div className="bar-stat-value">{formatNumber(twitch.followerCount)}</div>
                    <div className="bar-stat-label">Followers</div>
                  </div>
                </div>
              </div>
            )
            : null,
          subscribers: visibleItems.has('subscribers')
            ? (
              <div key="subscribers" className="bar-section bar-stat-section">
                <div className="bar-stat-item">
                  <div className="bar-stat-icon" aria-hidden="true">⭐</div>
                  <div className="bar-stat-content">
                    <div className="bar-stat-value">{formatNumber(twitch.subscriberCount)}</div>
                    <div className="bar-stat-label">Subscribers</div>
                  </div>
                </div>
              </div>
            )
            : null,
          recentFollower: visibleItems.has('recentFollower') && twitch.lastFollower
            ? (
              <div key="recentFollower" className="bar-section bar-recent-section">
                <div className={`bar-recent-item ${newFollowerAnimation ? 'new-update' : ''}`}>
                  <div className="bar-recent-icon" aria-hidden="true">❤️</div>
                  <div className="bar-recent-content">
                    <MarqueeText className="bar-recent-name" text={twitch.lastFollower.userDisplayName} />
                    <MarqueeText
                      className="bar-recent-label"
                      text={`Last Follow ${formatRelativeTime(twitch.lastFollower.followDate)}`}
                    />
                  </div>
                </div>
              </div>
            )
            : null,
          recentSub: visibleItems.has('recentSub') && twitch.lastSubscriber
            ? (
              <div key="recentSub" className="bar-section bar-recent-section">
                <div className={`bar-recent-item ${newSubscriberAnimation ? 'new-update' : ''}`}>
                  <div className="bar-recent-icon" aria-hidden="true">⭐</div>
                  <div className="bar-recent-content">
                    <MarqueeText className="bar-recent-name" text={twitch.lastSubscriber.userDisplayName} />
                    <MarqueeText
                      className="bar-recent-label"
                      text={`Last Sub${twitch.lastSubscriber.subscribeDate ? ` ${formatRelativeTime(twitch.lastSubscriber.subscribeDate)}` : ''}${twitch.lastSubscriber.isGift ? ' (Gift)' : ''}`}
                    />
                  </div>
                </div>
              </div>
            )
            : null,
        };

        const sections = settings.barSectionOrder
          .filter((key) => settings.barSections[key])
          .map((key) => sectionNodes[key])
          .filter((node): node is React.ReactNode => node !== null);

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
