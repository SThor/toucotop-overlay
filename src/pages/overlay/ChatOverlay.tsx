import { useEffect, useRef } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { TwitchProvider } from '../../contexts/TwitchContext';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeBackground from '../../components/ThemeBackground';
import EmoteMessage from '../../components/EmoteMessage';
import Y2KDivider from '../../components/Y2KDivider';
import GlobalAlertLayer from '../../components/GlobalAlertLayer';
import '../../styles/ChatOverlay.css';

const ChatOverlay = () => {
  const { settings, isLoadingSettings } = useSettings();
  const { messages, isConnected, isConnecting, error } = TwitchProvider.useTwitch();
  const reducedEffects = settings.themeSettings.y2k.reducedEffects;
  const isFeedFromTop = settings.chatFeedDirection === 'top';
  const isY2KTheme = settings.theme === 'y2k';

  const messagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest message when feed direction is bottom (column order,
  // newest at bottom — column-reverse/top direction handles itself naturally).
  useEffect(() => {
    if (settings.chatFeedDirection !== 'top' && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, settings.chatFeedDirection]);

  if (isLoadingSettings) return null;

  // Determine divider placement and type
  let divider: React.ReactNode = null;
  if (isY2KTheme) {
    divider = (
      <div className={`chat-y2k-divider${!isFeedFromTop ? ' chat-y2k-divider--flipped' : ''}`}>
        <Y2KDivider staticMode={reducedEffects} />
      </div>
    );
  } else if (settings.theme === 'crt' || settings.theme === 'default') {
    divider = <div className="chat-divider"></div>;
  }

  // For CRT and Y2K, divider is always above title. For default, above in bottom-feed, below in top-feed.
  const header = (
    <div className="chat-header">
      {(!isFeedFromTop || settings.theme === 'crt' || isY2KTheme) && divider}
      <h3>
        <span className="chat-icon" aria-hidden="true">💬</span> Stream Chat
        {isConnecting && <span className="connection-status connecting"> (Connecting...)</span>}
        {error && <span className="connection-status error" title={error}> (Connection Error)</span>}
        {isConnected && settings.theme === 'crt' && <span className="connection-status connected"> (Live)</span>}
      </h3>
      {isFeedFromTop && settings.theme === 'default' && divider}
    </div>
  );

  return (
    <div
      className={`chat-overlay${settings.theme === 'crt' ? ' crt-active' : ''}${settings.theme === 'y2k' ? ' y2k-active' : ''}${isFeedFromTop ? ' feed-from-top' : ' feed-from-bottom'}`}
      style={{ opacity: settings.perOverlayOpacity?.chat ?? settings.overlayOpacity, fontSize: `${settings.perOverlayFontSize?.chat ?? settings.fontSize}rem` }}
    >
      <ThemeBackground panelMode />
      {isFeedFromTop && header}
      
      <div ref={messagesRef} className={`chat-messages ${isFeedFromTop ? 'feed-from-top' : 'feed-from-bottom'}`}>
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className="chat-message"
              layout
              initial={{ 
                opacity: 0, 
                x: 20,
                scale: 0.8
              }}
              animate={{
                opacity: 1, // old-message fade handled by CSS mask-image on the container
                x: 0,
                scale: 1
              }}
              exit={{ 
                opacity: 0,
                x: -20,
                scale: 0.8,
                height: 0,
                paddingTop: 0,
                paddingBottom: 0
              }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
                mass: 1
              }}
            >
              <span 
                className={`username ${settings.theme === 'crt' ? 'crt-glow-text' : ''}`} 
                style={{ color: msg.color }}
              >
                {msg.displayName || msg.username}:
              </span>
              {msg.emotes && msg.emotes.length > 0 ? (
                <EmoteMessage message={msg} className="message" />
              ) : (
                <span className="message">{msg.message}</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {!isFeedFromTop && header}
      <GlobalAlertLayer />
    </div>
  );
};

export default ChatOverlay;
