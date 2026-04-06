import { useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { TwitchProvider } from '../../contexts/TwitchContext';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeBackground from '../../components/ThemeBackground';
import EmoteMessage from '../../components/EmoteMessage';
import Y2KDivider from '../../components/Y2KDivider';
import Y2KBorderShader from '../../components/Y2KBorderShader';
import '../../styles/ChatOverlay.css';

const ChatOverlay = () => {
  const { settings } = useSettings();
  const { messages, isConnected, isConnecting, error } = TwitchProvider.useTwitch();

  // Debug logging to help track connection issues
  useEffect(() => {
    console.log('ChatOverlay: Connection state changed', { 
      isConnected, 
      isConnecting, 
      error,
    });
  }, [isConnected, isConnecting, error]);

  // Calculate opacity for message based on its position and feed direction
  const getMessageOpacity = (index: number, totalMessages: number) => {
    if (totalMessages <= 3) return 1.0; // Don't fade if we have few messages
    
    const position = settings.chatFeedDirection === 'top' ? index : totalMessages - 1 - index;
    const fadeLength = Math.max(3, Math.floor(totalMessages / 4)); // Fade the oldest 25% of messages (min 3)
    
    if (position < fadeLength) {
      // Smooth fade from 0.2 to 1.0 using easing function
      const progress = position / fadeLength;
      const easedProgress = 1 - Math.pow(1 - progress, 2); // Ease-out quad
      return 0.2 + easedProgress * 0.8;
    }
    return 1.0;
  };

  return (
    <div
      className={`chat-overlay${settings.theme === 'crt' ? ' crt-active' : ''}${settings.theme === 'y2k' ? ' y2k-active' : ''}`}
      style={{ opacity: settings.perOverlayOpacity?.chat ?? settings.overlayOpacity, fontSize: `${settings.perOverlayFontSize?.chat ?? settings.fontSize}rem` }}
    >
      <ThemeBackground panelMode />
      {settings.theme === 'y2k' && <Y2KBorderShader shape="ellipse" thickness={5} />}
      <div className="chat-header">
        <h3>
          <span className="chat-icon" aria-hidden="true">💬</span> Stream Chat
          {isConnecting && <span className="connection-status connecting"> (Connecting...)</span>}
          {error && <span className="connection-status error" title={error}> (Connection Error)</span>}
          {isConnected && <span className="connection-status connected"> (Live)</span>}
        </h3>
        {settings.theme === 'y2k' ? <Y2KDivider /> : <div className="chat-divider"></div>}
      </div>
      
      <div className={`chat-messages ${settings.chatFeedDirection === 'top' ? 'feed-from-top' : 'feed-from-bottom'}`}>
        <AnimatePresence mode="popLayout">
          {messages.map((msg, index) => (
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
                opacity: getMessageOpacity(index, messages.length),
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
    </div>
  );
};

export default ChatOverlay;
