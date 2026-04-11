import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeBackground from '../../components/ThemeBackground';
import { useAlertStream, type AlertPayload } from '../../hooks/useAlertStream';
import { useSettings } from '../../contexts/SettingsContext';

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

  // Auto-dismiss after ALERT_DURATION_MS
  useEffect(() => {
    if (!currentAlert) return;
    const timer = setTimeout(dismissAlert, ALERT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [currentAlert, dismissAlert]);

  if (isLoadingSettings) return null;

  return (
    <div
      className="alert-overlay"
      style={{
        opacity: settings.overlayOpacity,
        fontSize: `${settings.fontSize}rem`,
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <ThemeBackground panelMode={false} />

      {/* Dev: connection status indicator (hidden in production-like use) */}
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

      <AnimatePresence mode="wait">
        {currentAlert && (
          <motion.div
            key={currentAlert.id}
            initial={{ opacity: 0, scale: 0.8, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -40 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5em',
              textAlign: 'center',
              padding: '1.5em 2.5em',
              background: 'rgba(0,0,0,0.6)',
              borderRadius: '0.75em',
              border: '2px solid',
              maxWidth: '80vw',
            }}
          >
            <span style={{ fontSize: '3em', lineHeight: 1 }}>{alertIcon(currentAlert.type)}</span>
            <span style={{ fontSize: '1.4em', fontWeight: 700 }}>
              {alertTitle(currentAlert)}
            </span>
            {currentAlert.message && (
              <span style={{ fontSize: '0.95em', opacity: 0.85, fontStyle: 'italic' }}>
                "{currentAlert.message}"
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invisible connected indicator for debugging */}
      {isConnected && (
        <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: '0.6rem', opacity: 0.2 }}>
          ●
        </div>
      )}
    </div>
  );
}
