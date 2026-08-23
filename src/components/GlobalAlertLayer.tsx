import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import ThemeBackground from './ThemeBackground';
import BarY2KOrnament from './BarY2KOrnament';
import { useAlertStream, type AlertPayload } from '../hooks/useAlertStream';
import { useSettings } from '../contexts/SettingsContext';
import '../styles/AlertOverlay.css';

interface GlobalAlertLayerProps {
  showConnectionStatus?: boolean;
  mode?: 'all' | 'customOnly';
}

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
      return `Hype Train level ${alert.level ?? '?'} - ${alert.progress ?? 0}%`;
    case 'hype_train_end':
      return `Hype Train ended at level ${alert.level ?? '?'}!`;
    case 'custom':
      return alert.customTitle ?? 'Custom alert';
    default:
      return 'Alert!';
  }
}

function alertIcon(alert: AlertPayload): string {
  if (alert.type === 'custom') {
    return alert.customIcon && alert.customIcon.trim() ? alert.customIcon : '📣';
  }

  switch (alert.type) {
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

const ALERT_DURATION_MS = 5000;

export default function GlobalAlertLayer({ showConnectionStatus = false, mode = 'customOnly' }: GlobalAlertLayerProps) {
  const { settings, isLoadingSettings } = useSettings();
  const { currentAlert, isConnected, isConnecting, error, dismissAlert } = useAlertStream();
  const reducedEffects = settings.themeSettings.y2k.reducedEffects;

  const [displayedAlert, setDisplayedAlert] = useState<AlertPayload | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!displayedAlert && currentAlert) {
      // Non-alert overlays should only render bypass/custom alerts.
      if (mode === 'customOnly' && currentAlert.type !== 'custom') {
        dismissAlert();
      } else {
        setDisplayedAlert(currentAlert);
        setIsVisible(true);
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        hideTimeout.current = setTimeout(() => setIsVisible(false), ALERT_DURATION_MS);
      }
    }

    if (displayedAlert && !currentAlert) {
      setIsVisible(false);
    }
  }, [currentAlert, displayedAlert, mode, dismissAlert]);

  useEffect(() => {
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, []);

  const handleAnimationComplete = () => {
    if (!isVisible && displayedAlert) {
      setDisplayedAlert(null);
      dismissAlert();
    }
  };

  if (isLoadingSettings) return null;
  if (typeof document === 'undefined') return null;

  const title = displayedAlert ? alertTitle(displayedAlert) : '';
  const icon = displayedAlert ? alertIcon(displayedAlert) : '🔔';
  const message = displayedAlert?.message || '';

  return createPortal(
    <div
      className={`alert-overlay global-alert-layer${settings.theme === 'crt' ? ' crt-active' : ''}${settings.theme === 'y2k' ? ' y2k-active' : ''}`}
      style={{ opacity: settings.overlayOpacity, fontSize: `${settings.fontSize}rem` }}
    >
      {showConnectionStatus && (isConnecting || error) && (
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
          {isConnecting ? 'Connecting...' : error}
        </div>
      )}

      <motion.div
        className="alert-popup"
        animate={isVisible ? { opacity: 1, scale: 1, y: 0, pointerEvents: 'auto' } : { opacity: 0, scale: 0.8, y: 40, pointerEvents: 'none' }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{ position: 'relative' }}
        onAnimationComplete={handleAnimationComplete}
      >
        {(settings.theme === 'crt' || settings.theme === 'y2k') && <ThemeBackground panelMode />}
        <span className="alert-icon" style={{ fontSize: '3em', lineHeight: 1 }}>
          {icon}
        </span>
        <span className="alert-title" style={{ fontSize: '1.4em', fontWeight: 700 }}>
          {title}
        </span>
        <span
          className="alert-message"
          style={{ fontSize: '0.95em', opacity: 0.85, fontStyle: 'italic', visibility: message ? 'visible' : 'hidden' }}
        >
          {message ? `"${message}"` : ''}
        </span>
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

      {showConnectionStatus && isConnected && (
        <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: '0.6rem', opacity: 0.2 }}>
          ●
        </div>
      )}
    </div>,
    document.body
  );
}
