import { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useTwitch } from '../contexts/TwitchContext';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedBackground from '../components/AnimatedBackground';
import CRTBackground from '../components/CRTBackground';
import EmoteMessage from '../components/EmoteMessage';
import '../styles/ChatOverlay.css';

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
  color: string;
}

const ChatOverlay = () => {
  const { settings } = useSettings();
  const { messages, isConnected, isConnecting, error } = useTwitch();
  const [demoMessages, setDemoMessages] = useState<ChatMessage[]>([]);

  // Debug logging to help track connection issues
  useEffect(() => {
    console.log('ChatOverlay: Connection state changed', { 
      isConnected, 
      isConnecting, 
      error, 
      channelName: settings.channelName,
      previewMode: settings.previewMode 
    });
  }, [isConnected, isConnecting, error, settings.channelName, settings.previewMode]);

  // Demo messages for when not connected to Twitch AND in preview mode
  useEffect(() => {
    if (!settings.previewMode) {
      // Clear demo messages when connected to real Twitch OR not in preview mode
      setDemoMessages([]);
      return;
    }

    // Show demo messages only when in preview mode
    const demos: ChatMessage[] = [
      {
        id: '1',
        username: 'StreamFan123',
        message: 'Hey everyone! Great stream!',
        timestamp: new Date(),
        color: '#FF6B6B'
      },
      {
        id: '2',
        username: 'GamerGirl99',
        message: 'That was an amazing play! 🎮',
        timestamp: new Date(Date.now() - 30000),
        color: '#4ECDC4'
      },
      {
        id: '3',
        username: 'ChatModerator',
        message: 'Welcome to the stream! Remember to follow the rules.',
        timestamp: new Date(Date.now() - 60000),
        color: '#E56D0C'
      }
    ];

    setDemoMessages(demos);

    // Simulate new messages only when in preview mode
    const interval = setInterval(() => {
      if (settings.previewMode) {
        const newMessage: ChatMessage = {
          id: Date.now().toString(),
          username: `Viewer${Math.floor(Math.random() * 1000)}`,
          message: getRandomMessage(),
          timestamp: new Date(),
          color: getRandomColor()
        };

        setDemoMessages(prev => [...prev.slice(-(settings.maxChatMessages - 1)), newMessage]);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [settings.maxChatMessages, settings.previewMode]);

  const getRandomMessage = () => {
    const messages = [
      'This is awesome!',
      'Keep it up!',
      'LOL that was funny',
      'Nice work!',
      'First time watching, love it!',
      'PogChamp',
      'This game looks fun',
      'How long have you been streaming?'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  const getRandomColor = () => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

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

  // Use real Twitch messages when connected, demo messages only in preview mode when not connected
  const displayMessages = isConnected ? messages : (settings.previewMode ? demoMessages : []);

  return (
    <div 
      className={`chat-overlay ${settings.previewMode ? 'preview-mode' : ''}`}
      style={{ opacity: settings.overlayOpacity }}
    >
      {settings.crtEffects ? <CRTBackground /> : <AnimatedBackground />}
      <div className="chat-header">
        <h3 className={settings.crtEffects ? 'crt-glow-text' : ''}>
          💬 {settings.channelName ? `${settings.channelName}'s Chat` : 'Stream Chat'}
          {isConnecting && <span className="connection-status connecting"> (Connecting...)</span>}
          {error && <span className="connection-status error"> (Error)</span>}
          {settings.previewMode && <span className="connection-status demo"> (Demo Mode)</span>}
          {!settings.channelName && <span className="connection-status demo"> (Enter channel name to connect)</span>}
        </h3>
        <div className="chat-divider"></div>
      </div>
      
      <div className={`chat-messages ${settings.chatFeedDirection === 'top' ? 'feed-from-top' : 'feed-from-bottom'}`}>
        <AnimatePresence mode="popLayout">
          {displayMessages.map((msg, index) => (
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
                opacity: getMessageOpacity(index, displayMessages.length),
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
                className={`username ${settings.crtEffects ? 'crt-glow-text' : ''}`} 
                style={{ color: msg.color }}
              >
                {isConnected && 'displayName' in msg ? msg.displayName || msg.username : msg.username}:
              </span>
              {isConnected && 'emotes' in msg ? (
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
