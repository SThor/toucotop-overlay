import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';

type Handler = (...args: unknown[]) => void;

// Fake twurple ChatClient: records handlers so tests can emit IRC events.
const fakeClients: FakeChatClient[] = [];
class FakeChatClient {
  handlers = new Map<string, Handler>();
  constructor() { fakeClients.push(this); }
  private bind = (name: string) => (h: Handler) => { this.handlers.set(name, h); return { unbind() {} }; };
  onConnect = this.bind('connect');
  onDisconnect = this.bind('disconnect');
  onMessage = this.bind('message');
  onMessageRemove = this.bind('messageRemove');
  onChatClear = this.bind('chatClear');
  onTimeout = this.bind('timeout');
  onBan = this.bind('ban');
  connect = vi.fn(async () => {});
  quit = vi.fn();
  emit(name: string, ...args: unknown[]) {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`no handler registered for ${name}`);
    h(...args);
  }
}

vi.mock('@twurple/chat', () => ({ ChatClient: FakeChatClient }));
vi.mock('./storage.js', () => ({ extendOverlayToken: vi.fn() }));

const { addSSEClient, getRelayHistory } = await import('./chat-relay.js');

function fakeResponse() {
  const res = new EventEmitter() as EventEmitter & { writeHead: () => void; write: (s: string) => void; end: () => void; chunks: string[] };
  res.chunks = [];
  res.writeHead = () => {};
  res.write = (s: string) => { res.chunks.push(s); };
  res.end = () => {};
  return res;
}

function sseEvents(res: ReturnType<typeof fakeResponse>) {
  return res.chunks
    .filter((c) => c.startsWith('event: '))
    .map((c) => {
      const [, event, data] = /^event: (.+)\ndata: (.*)\n\n$/s.exec(c) ?? [];
      return { event, data: JSON.parse(data ?? 'null') };
    });
}

function ircMessage(id: string, userName: string, text: string) {
  return [
    '#chan', userName, text,
    {
      id,
      date: new Date('2026-11-16T12:00:00Z'),
      emoteOffsets: new Map(),
      tags: new Map(),
      userInfo: { userName, displayName: userName, color: '', badges: new Map(), isMod: false, isSubscriber: false, isVip: false },
    },
  ];
}

let channelSeq = 0;
let channel = '';
let res: ReturnType<typeof fakeResponse>;
let irc: FakeChatClient;

beforeEach(async () => {
  channel = `chan${++channelSeq}`;
  res = fakeResponse();
  addSSEClient(channel, res as unknown as Response);
  await vi.waitFor(() => expect(sseEvents(res).some((e) => e.event === 'connected')).toBe(true));
  irc = fakeClients.at(-1)!;
  irc.emit('message', ...ircMessage('m1', 'spammer', 'buy followers'));
  irc.emit('message', ...ircMessage('m2', 'alice', 'hello'));
  irc.emit('message', ...ircMessage('m3', 'spammer', 'buy more'));
});

afterEach(() => { res.emit('close'); });

describe('chat relay moderation', () => {
  it('removes a single deleted message from history and notifies clients', async () => {
    irc.emit('messageRemove', '#chan', 'm2', {});
    expect((await getRelayHistory(channel)).map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(sseEvents(res).at(-1)).toEqual({ event: 'delete', data: { messageId: 'm2' } });
  });

  it('removes all messages of a timed-out user and notifies clients', async () => {
    irc.emit('timeout', '#chan', 'spammer', 600, {});
    expect((await getRelayHistory(channel)).map((m) => m.id)).toEqual(['m2']);
    expect(sseEvents(res).at(-1)).toEqual({ event: 'deleteUser', data: { username: 'spammer' } });
  });

  it('removes all messages of a banned user and notifies clients', async () => {
    irc.emit('ban', '#chan', 'spammer', {});
    expect((await getRelayHistory(channel)).map((m) => m.id)).toEqual(['m2']);
    expect(sseEvents(res).at(-1)).toEqual({ event: 'deleteUser', data: { username: 'spammer' } });
  });

  it('does not replay moderated messages to a client that reconnects', async () => {
    irc.emit('ban', '#chan', 'spammer', {});
    const res2 = fakeResponse();
    addSSEClient(channel, res2 as unknown as Response);
    await vi.waitFor(() => expect(sseEvents(res2).some((e) => e.event === 'history')).toBe(true));
    const history = sseEvents(res2).find((e) => e.event === 'history')!.data.messages as { id: string }[];
    expect(history.map((m) => m.id)).toEqual(['m2']);
    res2.emit('close');
  });
});
