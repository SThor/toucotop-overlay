import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ThemeBackground from '../../components/ThemeBackground';
import BarY2KOrnament from '../../components/BarY2KOrnament';
import { useAlertStream, type AlertPayload } from '../../hooks/useAlertStream';
import { useSettings } from '../../contexts/SettingsContext';
import '../../styles/AlertOverlay.css';

// ─── Per-type display helpers ─────────────────────────────────────────────────

function alertTitle(alert: AlertPayload): string {
  switch (alert.type) {
    case 'follow':
      return `${alert.userName ?? 'Someone'} just followed!`;
    case 'subscribe':
      return alert.isGift
        ? `${alert.gifterName ?? 'Someone'} gifted a sub to ${alert.userName ?? 'someone'}!`
        : `${alert.userName ?? 'Someone'} just subscribed!`;
    case 'resubscribe':
      return `${alert.userName ?? 'Someone'} resubscribed${alert.cumulativeMonths ? ` (${alert.cumulativeMonths} months)` : ''}!`;
    case 'gift_sub':
      return `${alert.userName ?? 'Someone'} gifted ${alert.giftCount ?? 1} sub${(alert.giftCount ?? 1) > 1 ? 's' : ''}!`;
    case 'cheer':
      return `${alert.userName ?? 'Someone'} cheered ${alert.bits ?? 0} bits!`;
    case 'raid':
      return `${alert.raiderName ?? 'Someone'} is raiding with ${alert.viewerCount ?? 0} viewers!`;
    case 'hype_train_begin':
      return `Hype Train started! Level ${alert.level ?? 1}`;
    case 'hype_train_progress':
      return `Hype Train level ${alert.level ?? '?'} — ${alert.progress ?? 0}%`;
    case 'hype_train_end':
      return `Hype Train ended at level ${alert.level ?? '?'}!`;
    default:
      return 'Alert!';
  }
}

function alertIcon(type: AlertPayload['type']): string {
  switch (type) {
    case 'follow': return '❤️';
    case 'subscribe': return '⭐';
    case 'resubscribe': return '🌟';
    case 'gift_sub': return '🎁';
    case 'cheer': return '💎';
    case 'raid': return '⚔️';
    case 'hype_train_begin':
    case 'hype_train_progress':
    case 'hype_train_end': return '🚂';
    default: return '🔔';
  }
}

/** Duration (ms) an alert is shown before auto-dismissing */
const ALERT_DURATION_MS = 5000;


// ─── Component ────────────────────────────────────────────────────────────────

export default function AlertOverlay() {
  const { settings, isLoadingSettings } = useSettings();
  const { currentAlert, isConnected, isConnecting, error, dismissAlert } = useAlertStream();
  const reducedEffects = settings.themeSettings.y2k.reducedEffects;

  // Track the last non-null alert for animation
  const [displayedAlert, setDisplayedAlert] = useState<AlertPayload | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);

  // Only take the queue head when no alert is currently being displayed.
  useEffect(() => {
    if (!displayedAlert && currentAlert) {
      setDisplayedAlert(currentAlert);
      setIsVisible(true);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => setIsVisible(false), ALERT_DURATION_MS);
      return;
    }

    if (displayedAlert && !currentAlert) {
      setIsVisible(false);
    }

    return () => { if (hideTimeout.current) clearTimeout(hideTimeout.current); };
  }, [currentAlert, displayedAlert]);

  // Framer Motion fires onAnimationComplete for both show and hide transitions.
  // We only advance the queue once the hide transition is done.
  const handleAnimationComplete = () => {
    if (!isVisible && displayedAlert) {
      setDisplayedAlert(null);
      dismissAlert();
    }
  };

  if (isLoadingSettings) return null;

  // Fallbacks for empty state
  const type = displayedAlert?.type || 'follow';
  const title = displayedAlert ? alertTitle(displayedAlert) : '';
  const message = displayedAlert?.message || '';

  return (
    <div
      className={`alert-overlay${settings.theme === 'crt' ? ' crt-active' : ''}${settings.theme === 'y2k' ? ' y2k-active' : ''}`}
      style={{ opacity: settings.overlayOpacity, fontSize: `${settings.fontSize}rem` }}
    >
      {/* Dev: connection status indicator */}
      {(isConnecting || error) && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            fontSize: '0.7rem',
            opacity: 0.4,
            pointerEvents: 'none',
          }}
        >
          {isConnecting ? 'Connecting…' : error}
        </div>
      )}

      {/* Always mounted alert popup, animate presence */}
      <motion.div
        className="alert-popup"
        animate={isVisible ? { opacity: 1, scale: 1, y: 0, pointerEvents: 'auto' } : { opacity: 0, scale: 0.8, y: 40, pointerEvents: 'none' }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{ position: 'relative' }}
        onAnimationComplete={handleAnimationComplete}
      >
        {(settings.theme === 'crt' || settings.theme === 'y2k') && <ThemeBackground panelMode />}
        <span className="alert-icon" style={{ fontSize: '3em', lineHeight: 1 }}>
          {alertIcon(type)}
        </span>
        <span className="alert-title" style={{ fontSize: '1.4em', fontWeight: 700 }}>
          {title}
        </span>
        {/* Always render message span for layout stability */}
        <span
          className="alert-message"
          style={{ fontSize: '0.95em', opacity: 0.85, fontStyle: 'italic', visibility: message ? 'visible' : 'hidden' }}
        >
          {message ? `"${message}"` : ''}
        </span>
        {/* Always render ornament for Y2K theme, animate with popup */}
        {settings.theme === 'y2k' && (
          <BarY2KOrnament
            src="/tribal_alert.png"
            center
            width={340}
            height={88}
            yOffset={128}
            staticMode={reducedEffects}
          />
        )}
      </motion.div>

      {/* Invisible connected indicator for debugging */}
      {isConnected && (
        <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: '0.6rem', opacity: 0.2 }}>
          ●
        </div>
      )}
    </div>
  );
}
