import React from 'react';
import type { TwitchChatMessage } from '../contexts/TwitchContext';

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
  color: string;
}

interface EmoteMessageProps {
  message: TwitchChatMessage | ChatMessage;
  className?: string;
}

const EmoteMessage: React.FC<EmoteMessageProps> = ({ message, className }) => {
  // Check if this is a TwitchChatMessage with emotes
  const twitchMessage = message as TwitchChatMessage;
  
  if (!twitchMessage.emotes || twitchMessage.emotes.length === 0) {
    // No emotes, render plain text
    return <span className={className}>{message.message}</span>;
  }

  // Sort emotes by start index to process them in order
  const sortedEmotes = [...twitchMessage.emotes].sort((a, b) => a.startIndex - b.startIndex);
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  sortedEmotes.forEach((emote, i) => {
    // Add text before the emote
    if (emote.startIndex > lastIndex) {
      const textPart = message.message.substring(lastIndex, emote.startIndex);
      if (textPart) {
        parts.push(<span key={`text-${i}`}>{textPart}</span>);
      }
    }

    // Add the emote image
    parts.push(
      <img
        key={`emote-${emote.id}-${i}`}
        src={emote.urls['2x']} // Try animated 2x first for better quality
        alt={emote.name}
        className="chat-emote"
        title={emote.name}
        loading="lazy"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          const currentSrc = target.src;
          
          // Try different fallbacks in order
          if (currentSrc === emote.urls['2x']) {
            // Try animated 1x
            target.src = emote.urls['1x'];
          } else if (currentSrc === emote.urls['1x']) {
            // Try static 2x
            target.src = emote.urls['2x_static'];
          } else if (currentSrc === emote.urls['2x_static']) {
            // Try static 1x
            target.src = emote.urls['1x_static'];
          } else {
            // All fallbacks failed, show text
            target.style.display = 'none';
            target.insertAdjacentText('afterend', emote.name);
          }
        }}
      />
    );

    lastIndex = emote.endIndex + 1;
  });

  // Add any remaining text after the last emote
  if (lastIndex < message.message.length) {
    const remainingText = message.message.substring(lastIndex);
    if (remainingText) {
      parts.push(<span key="text-final">{remainingText}</span>);
    }
  }

  return <span className={className}>{parts}</span>;
};

export default EmoteMessage;
