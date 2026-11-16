import { describe, expect, it } from 'vitest';
import { removeMessageById, removeMessagesFromUser } from './chatMessages';

const msg = (id: string, username: string) => ({ id, username });

describe('chat message moderation helpers', () => {
  it('removes a single message by id', () => {
    expect(removeMessageById([msg('1', 'a'), msg('2', 'b')], '1')).toEqual([msg('2', 'b')]);
  });

  it('removes every message of a user, case-insensitively', () => {
    const list = [msg('1', 'Spammer'), msg('2', 'alice'), msg('3', 'spammer')];
    expect(removeMessagesFromUser(list, 'spammer')).toEqual([msg('2', 'alice')]);
  });

  it('returns the same array when nothing matches (no useless re-render)', () => {
    const list = [msg('1', 'alice')];
    expect(removeMessagesFromUser(list, 'bob')).toBe(list);
  });
});
