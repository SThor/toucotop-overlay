interface ModeratableMessage {
  id: string;
  username: string;
}

export function removeMessageById<T extends ModeratableMessage>(messages: T[], messageId: string): T[] {
  return messages.filter((m) => m.id !== messageId);
}

/** Drop every message from a user (timeout / ban). Returns the same array if nothing changed. */
export function removeMessagesFromUser<T extends ModeratableMessage>(messages: T[], username: string): T[] {
  const login = username.toLowerCase();
  const next = messages.filter((m) => m.username.toLowerCase() !== login);
  return next.length === messages.length ? messages : next;
}
