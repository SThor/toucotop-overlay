import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { TwitchProvider } from '../../contexts/TwitchContext';
import ThemeBackground from '../../components/ThemeBackground';
import MarqueeText from '../../components/MarqueeText';
import BarY2KOrnament from '../../components/BarY2KOrnament';
import GlobalAlertLayer from '../../components/GlobalAlertLayer';
import { normalizeBarStackScrollSeconds, type BarSectionKey, type BarWidthTokenType } from '../../server/shared/overlaySettings';
import '../../styles/BarOverlay.css';

const BOOST_MIN_WIDTH_PX = 56;
const STRETCH_MIN_WIDTH_PX = 28;
const STACK_HEADROOM_PX = 14;

// Safety floors observed from real rendered content widths at default scale.
// These guard against viewport widths that are technically "configured" but too
// small for the actual section internals (labels, icons, paddings).
const SECTION_INTRINSIC_MIN_WIDTH: Record<BarSectionKey, number> = {
  clock: 122,
  duration: 152,
  title: 168,
  viewers: 112,
  followers: 112,
  subscribers: 126,
  recentFollower: 168,
  recentSub: 168,
};

function getSectionStyle(finalMinWidth: number, token: BarWidthTokenType | null): React.CSSProperties {
  const stretch = token === 'stretch';
  const basis = finalMinWidth;

  return {
    minWidth: `${basis}px`,
    flex: `${stretch ? 1 : 0} 0 ${basis}px`,
    maxWidth: 'none',
  };
}

interface RotatingStackViewportProps {
  stackId: string;
  sections: BarSectionKey[];
  minWidth: number;
  token: BarWidthTokenType | null;
  rotateMs: number;
  transitionMs: number;
  renderSectionNode: (key: BarSectionKey) => React.ReactNode | null;
}

function RotatingStackViewport({ stackId, sections, minWidth, token, rotateMs, transitionMs, renderSectionNode }: RotatingStackViewportProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const sectionCount = sections.length;

  useEffect(() => {
    setCurrentIndex(0);
    setIsAnimating(false);
  }, [stackId, sections.join('|')]);

  useEffect(() => {
    if (sectionCount <= 1 || isAnimating) return;
    const timeout = setTimeout(() => {
      setIsAnimating(true);
    }, rotateMs);

    return () => clearTimeout(timeout);
  }, [sectionCount, currentIndex, isAnimating, rotateMs]);

  const queue = useMemo(() => {
    if (sectionCount <= 1) return sections.slice(0, 1);
    return [
      sections[currentIndex],
      sections[(currentIndex + 1) % sectionCount],
    ];
  }, [sectionCount, sections, currentIndex]);

  const handleTransitionEnd = () => {
    if (!isAnimating || sectionCount <= 1) return;
    setIsAnimating(false);
    setCurrentIndex((value) => (value + 1) % sectionCount);
  };

  if (sectionCount <= 1) {
    const singleKey = sections[0];
    const singleNode = singleKey ? renderSectionNode(singleKey) : null;
    if (!singleNode) return null;
    return (
      <div className="bar-stack-viewport" style={getSectionStyle(minWidth, token)}>
        <div className="bar-stack-frame bar-stack-frame-single">
          {singleNode}
        </div>
      </div>
    );
  }

  return (
    <div className="bar-stack-viewport" style={getSectionStyle(minWidth, token)}>
      <div
        className={`bar-stack-track${isAnimating ? ' is-animating' : ''}`}
        style={{
          transform: isAnimating ? 'translateY(-50%)' : 'translateY(0%)',
          transitionDuration: `${transitionMs}ms`,
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {queue.map((sectionKey, index) => {
          const node = renderSectionNode(sectionKey);
          if (!node) return null;
          return (
            <div className="bar-stack-frame" key={`${stackId}-${currentIndex}-${index}-${sectionKey}`}>
              {node}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BarOverlayContent = () => {
  const { settings, isLoadingSettings } = useSettings();
  const twitch = TwitchProvider.useTwitch();
  const reducedEffects = settings.themeSettings.y2k.reducedEffects;
  const showBarOrnaments = settings.themeSettings.y2k.showBarOrnaments;
  const stackScrollSeconds = normalizeBarStackScrollSeconds(settings.barStackScrollSeconds);
  const stackRotateMs = Math.round(stackScrollSeconds * 1000);
  const stackTransitionMs = Math.min(1200, Math.max(320, Math.round(stackRotateMs * 0.1)));
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

  const orderedActiveStacks = useMemo(() => {
    const seen = new Set<BarSectionKey>();
    return settings.barSectionStacks
      .map((stack) => ({
        ...stack,
        sections: stack.sections.filter((sectionKey) => {
          if (!settings.barSections[sectionKey]) return false;
          if (seen.has(sectionKey)) return false;
          seen.add(sectionKey);
          return true;
        }),
      }))
      .filter((stack) => stack.sections.length > 0);
  }, [settings.barSectionStacks, settings.barSections]);

  const renderSectionNode = (key: BarSectionKey): React.ReactNode | null => {
    if (key === 'clock') {
      return (
        <div className="bar-section bar-section-clock">
          <div className="bar-stat-content">
            <div className="bar-time-value">{formatTime(currentTime)}</div>
            <div className="bar-time-label">Current Time</div>
          </div>
        </div>
      );
    }

    if (key === 'duration') {
      return (
        <div className="bar-section bar-section-duration">
          <div className="bar-stat-content">
            <div className="bar-time-value">{formatStreamDuration()}</div>
            <div className="bar-time-label">Stream Duration</div>
          </div>
        </div>
      );
    }

    if (key === 'title') {
      return (
        <div className="bar-section bar-stream-section">
          <MarqueeText className="bar-stream-title" text={twitch.streamInfo?.title || 'Stream Title'} />
          <MarqueeText className="bar-stream-category" text={twitch.streamInfo?.gameName || 'No Category'} />
        </div>
      );
    }

    if (key === 'viewers') {
      return (
        <div className="bar-section bar-stat-section">
          <div className="bar-stat-icon" aria-hidden="true">👥</div>
          <div className="bar-stat-content">
            <div className="bar-stat-value">{twitch.streamInfo?.isLive ? formatNumber(twitch.streamInfo.viewerCount) : '0'}</div>
            <div className="bar-stat-label">Viewers</div>
          </div>
        </div>
      );
    }

    if (key === 'followers') {
      return (
        <div className="bar-section bar-stat-section">
          <div className="bar-stat-icon" aria-hidden="true">❤️</div>
          <div className="bar-stat-content">
            <div className="bar-stat-value">{formatNumber(twitch.followerCount)}</div>
            <div className="bar-stat-label">Followers</div>
          </div>
        </div>
      );
    }

    if (key === 'subscribers') {
      return (
        <div className="bar-section bar-stat-section">
          <div className="bar-stat-icon" aria-hidden="true">⭐</div>
          <div className="bar-stat-content">
            <div className="bar-stat-value">{formatNumber(twitch.subscriberCount)}</div>
            <div className="bar-stat-label">Subscribers</div>
          </div>
        </div>
      );
    }

    if (key === 'recentFollower') {
      if (!twitch.lastFollower) return null;
      return (
        <div className={`bar-section bar-recent-section ${newFollowerAnimation ? 'new-update' : ''}`}>
          <div className="bar-recent-icon" aria-hidden="true">❤️</div>
          <div className="bar-recent-content">
            <MarqueeText className="bar-recent-name" text={twitch.lastFollower.userDisplayName} />
            <MarqueeText className="bar-recent-label" text={`Last Follow ${formatRelativeTime(twitch.lastFollower.followDate)}`} />
          </div>
        </div>
      );
    }

    if (key === 'recentSub') {
      if (!twitch.lastSubscriber) return null;
      return (
        <div className={`bar-section bar-recent-section ${newSubscriberAnimation ? 'new-update' : ''}`}>
          <div className="bar-recent-icon" aria-hidden="true">⭐</div>
          <div className="bar-recent-content">
            <MarqueeText className="bar-recent-name" text={twitch.lastSubscriber.userDisplayName} />
            <MarqueeText
              className="bar-recent-label"
              text={`Last Sub${twitch.lastSubscriber.subscribeDate ? ` ${formatRelativeTime(twitch.lastSubscriber.subscribeDate)}` : ''}${twitch.lastSubscriber.isGift ? ' (Gift)' : ''}`}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  const visibleStacks = useMemo(() => {
    const barFontScale = settings.perOverlayFontSize?.bar ?? settings.fontSize;
    const stacks = orderedActiveStacks
      .map((stack) => {
        const availableSections = stack.sections.filter((key) => {
          if (key === 'recentFollower') return !!twitch.lastFollower;
          if (key === 'recentSub') return !!twitch.lastSubscriber;
          return true;
        });
        if (availableSections.length === 0) return null;

        const maxBaseMinWidth = Math.max(...availableSections.map((key) => {
          const configured = settings.barSectionMinWidth[key] ?? 132;
          const intrinsicFloor = Math.round((SECTION_INTRINSIC_MIN_WIDTH[key] ?? 132) * barFontScale);
          return Math.max(configured, intrinsicFloor);
        }));
        const token = stack.widthToken ?? null;
        const dynamicMin = maxBaseMinWidth + (token === 'boost' ? BOOST_MIN_WIDTH_PX : 0) + (token === 'stretch' ? STRETCH_MIN_WIDTH_PX : 0) + STACK_HEADROOM_PX;
        return {
          id: stack.id,
          sections: availableSections,
          minWidth: dynamicMin,
          token,
        };
      })
      .filter((stack): stack is { id: string; sections: BarSectionKey[]; minWidth: number; token: BarWidthTokenType | null } => !!stack);

    if (stacks.length === 0) return [];
    if (overlayWidth <= 0) return stacks;

    const dividerBudget = Math.max(0, stacks.length - 1) * 16;
    const available = Math.max(0, overlayWidth - 24);
    let total = stacks.reduce((sum, stack) => sum + stack.minWidth, 0) + dividerBudget;
    const keep = new Set(stacks.map((stack) => stack.id));

    const priorityOrder = [
      ...settings.barStackPriority.filter((id) => keep.has(id)),
      ...stacks.map((stack) => stack.id).filter((id) => !settings.barStackPriority.includes(id)),
    ];
    const priorityIndex = new Map(priorityOrder.map((id, index) => [id, index]));
    const orderIndex = new Map(stacks.map((stack, index) => [stack.id, index]));
    const droppable = [...stacks].sort((a, b) => {
      const priorityDiff = (priorityIndex.get(b.id) ?? 99) - (priorityIndex.get(a.id) ?? 99);
      if (priorityDiff !== 0) return priorityDiff;
      return (orderIndex.get(b.id) ?? 0) - (orderIndex.get(a.id) ?? 0);
    });

    for (const stack of droppable) {
      if (total <= available) break;
      if (!keep.has(stack.id)) continue;
      keep.delete(stack.id);
      total -= stack.minWidth + 16;
    }

    if (keep.size === 0 && stacks[0]) keep.add(stacks[0].id);
    return stacks.filter((stack) => keep.has(stack.id));
  }, [
    orderedActiveStacks,
    overlayWidth,
    settings.fontSize,
    settings.barSectionMinWidth,
    settings.perOverlayFontSize,
    settings.barStackPriority,
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

      {settings.theme === 'y2k' && showBarOrnaments && (
        <>
          <BarY2KOrnament staticMode={reducedEffects} />
          <BarY2KOrnament src="/tribal_center.png" center height={65} yOffset={-72} staticMode={reducedEffects} />
          <BarY2KOrnament flip staticMode={reducedEffects} />
        </>
      )}
      {visibleStacks.flatMap((stack, index) => {
        const stackNode = (
          <RotatingStackViewport
            key={`stack-${stack.id}`}
            stackId={stack.id}
            sections={stack.sections}
            minWidth={stack.minWidth}
            token={stack.token}
            rotateMs={stackRotateMs}
            transitionMs={stackTransitionMs}
            renderSectionNode={renderSectionNode}
          />
        );

        return index < visibleStacks.length - 1
          ? [stackNode, <div key={`div-${stack.id}`} className="bar-divider" />]
          : [stackNode];
      })}
      <GlobalAlertLayer />
    </div>
  );
};

const BarOverlay = () => {
  return <BarOverlayContent />;
};

export default BarOverlay;
