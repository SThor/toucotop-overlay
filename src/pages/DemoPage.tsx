import { useSearchParams, Link } from 'react-router-dom';
import { useState, useCallback, useRef } from 'react';
import '../styles/ServerPages.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EndpointDef {
  name: string;
  endpoint: string;
  category: string;
  overlayUse: string;
  icon: string;
  description: string;
}

interface CardState {
  data: string;
  status: 'idle' | 'loading' | 'success' | 'error';
}

type CardStates = Record<string, CardState>;

// ─── Endpoint definitions ────────────────────────────────────────────────────

const ENDPOINT_CATEGORIES: { title: string; icon: string; description: string; endpoints: EndpointDef[] }[] = [
  {
    title: 'Core Channel Data',
    icon: '🎮',
    description: 'Essential channel information and current status',
    endpoints: [
      { name: 'User Information', endpoint: 'user', category: 'Core', overlayUse: 'Display streamer name and profile', icon: '👤', description: 'Basic user profile data including display name, creation date, and account type' },
      { name: 'Channel Information', endpoint: 'channel', category: 'Core', overlayUse: 'Current game and stream title', icon: '📺', description: 'Channel details including current game, title, language, and broadcaster settings' },
      { name: 'Stream Status', endpoint: 'stream', category: 'Core', overlayUse: 'Live indicator and viewer count', icon: '🔴', description: 'Live stream information including viewer count, start time, and stream quality' },
      { name: 'Token Validation', endpoint: 'validate', category: 'Core', overlayUse: 'Verify authentication status', icon: '🔑', description: 'OAuth token status, scopes, expiration time, and authentication details' },
    ],
  },
  {
    title: 'Community & Audience',
    icon: '👥',
    description: 'Follower, subscriber, and community management data',
    endpoints: [
      { name: 'Followers', endpoint: 'followers', category: 'Community', overlayUse: 'Recent follow notifications', icon: '❤️', description: 'Recent followers with follow dates and total follower count' },
      { name: 'Subscribers', endpoint: 'subscribers', category: 'Community', overlayUse: 'Sub count and recent subs', icon: '⭐', description: 'Active subscribers with tier information and subscription details' },
      { name: 'Chat Members', endpoint: 'chatters', category: 'Community', overlayUse: 'Active viewer display', icon: '💬', description: 'Current active chatters and their user types' },
      { name: 'Moderators', endpoint: 'moderators', category: 'Community', overlayUse: 'Mod list for chat features', icon: '🛡️', description: 'Channel moderators and their assigned permissions' },
      { name: 'VIP Users', endpoint: 'vips', category: 'Community', overlayUse: 'VIP recognition in overlays', icon: '👑', description: 'VIP users with special chat privileges' },
    ],
  },
  {
    title: 'Content & Media',
    icon: '🎬',
    description: 'Clips, videos, schedule, and content-related data',
    endpoints: [
      { name: 'Recent Clips', endpoint: 'clips', category: 'Content', overlayUse: 'Highlight recent clips', icon: '🎞️', description: 'Recent clips created by viewers with view counts and creation dates' },
      { name: 'Past Broadcasts', endpoint: 'videos', category: 'Content', overlayUse: 'Link to recent VODs', icon: '📼', description: 'Recent VODs and archived streams with titles and view counts' },
      { name: 'Stream Schedule', endpoint: 'schedule', category: 'Content', overlayUse: 'Next stream countdown', icon: '📅', description: 'Upcoming scheduled streams and recurring time slots' },
      { name: 'Current Game', endpoint: 'games', category: 'Content', overlayUse: 'Game artwork and details', icon: '🎯', description: 'Currently played game/category with detailed information' },
    ],
  },
  {
    title: 'Interactive Features',
    icon: '🎮',
    description: 'Polls, predictions, channel points, and interactive elements',
    endpoints: [
      { name: 'Active Polls', endpoint: 'polls', category: 'Interactive', overlayUse: 'Live poll results overlay', icon: '📊', description: 'Current and recent polls with voting options and results' },
      { name: 'Predictions', endpoint: 'predictions', category: 'Interactive', overlayUse: 'Prediction status display', icon: '🔮', description: 'Active predictions with outcomes and channel point wagers' },
      { name: 'Channel Point Rewards', endpoint: 'channelpoints', category: 'Interactive', overlayUse: 'Reward redemption alerts', icon: '🎁', description: 'Custom channel point rewards and redemption options' },
      { name: 'Creator Goals', endpoint: 'goals', category: 'Interactive', overlayUse: 'Goal progress bars', icon: '🎯', description: 'Active creator goals and progress tracking' },
      { name: 'Hype Train Status', endpoint: 'hypetrain', category: 'Interactive', overlayUse: 'Hype train progress display', icon: '🚂', description: 'Current hype train status and progress' },
    ],
  },
  {
    title: 'Additional Features',
    icon: '✨',
    description: 'Emotes, bits, and other special channel features',
    endpoints: [
      { name: 'Channel Emotes', endpoint: 'emotes', category: 'Additional', overlayUse: 'Chat integration features', icon: '😀', description: 'Custom channel emotes and subscriber emotes' },
      { name: 'Bits Leaderboard', endpoint: 'bits', category: 'Additional', overlayUse: 'Top supporter display', icon: '💎', description: 'Top bits supporters and donation leaderboard' },
    ],
  },
];

const EVENT_TYPES = [
  { value: 'channel.follow', label: 'New Follows' },
  { value: 'channel.subscribe', label: 'New Subscribers' },
  { value: 'channel.subscription.gift', label: 'Gift Subscriptions' },
  { value: 'channel.cheer', label: 'Bits/Cheers' },
  { value: 'channel.raid', label: 'Incoming Raids' },
  { value: 'stream.online', label: 'Stream Online' },
  { value: 'stream.offline', label: 'Stream Offline' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEventData(events: Array<{ subscription: { type: string }; timestamp: string; event: Record<string, unknown> }>): string {
  if (!events || events.length === 0) return 'No recent events found';

  return events
    .map((ev) => {
      const type = ev.subscription.type;
      const ts = new Date(ev.timestamp).toLocaleString();
      let info = `🕐 ${ts} - ${type}`;
      switch (type) {
        case 'channel.follow':
          info += `\n👤 New follower: ${ev.event.user_name}`;
          break;
        case 'channel.subscribe':
          info += `\n⭐ New subscriber: ${ev.event.user_name} (Tier ${ev.event.tier})`;
          break;
        case 'channel.subscription.gift':
          info += `\n🎁 Gift sub: ${ev.event.user_name} to ${ev.event.recipient_user_name}`;
          break;
        case 'channel.cheer':
          info += `\n💎 ${ev.event.user_name} cheered ${ev.event.bits} bits`;
          break;
        case 'channel.raid':
          info += `\n🚀 Raided by ${ev.event.from_broadcaster_user_name} (${ev.event.viewers} viewers)`;
          break;
        case 'stream.online':
          info += '\n🔴 Stream went online';
          break;
        case 'stream.offline':
          info += '\n⚫ Stream went offline';
          break;
      }
      return info;
    })
    .join('\n\n');
}

function getAllEndpoints(): EndpointDef[] {
  return ENDPOINT_CATEGORIES.flatMap((cat) => cat.endpoints);
}

// ─── ApiCard component ───────────────────────────────────────────────────────

function ApiCard({
  def,
  state,
  onFetch,
}: {
  def: EndpointDef;
  state: CardState;
  onFetch: () => void;
}) {
  return (
    <div className="api-card">
      <div className="card-header">
        <h3 className="card-title">
          {def.name}
          {state.status === 'loading' && <span className="status-indicator status-loading" />}
          {state.status === 'success' && <span className="status-indicator status-success" />}
          {state.status === 'error' && <span className="status-indicator status-error" />}
        </h3>
        <span className="card-icon">{def.icon}</span>
      </div>
      <p className="card-description">{def.description}</p>
      <button className="card-button" onClick={onFetch} disabled={state.status === 'loading'}>
        Fetch {def.name.split(' ').pop()}
      </button>
      <div className={`card-data ${state.status === 'idle' ? '' : state.status}`}>{state.data}</div>
    </div>
  );
}

// ─── EventsCard component ────────────────────────────────────────────────────

function EventsCard({
  token,
  state,
  onFetch,
  onClear,
}: {
  token: string;
  state: CardState;
  onFetch: () => void;
  onClear: () => void;
}) {
  void token; // used by parent callbacks
  return (
    <div className="api-card">
      <div className="card-header">
        <h3 className="card-title">
          Recent Events
          {state.status === 'loading' && <span className="status-indicator status-loading" />}
          {state.status === 'success' && <span className="status-indicator status-success" />}
          {state.status === 'error' && <span className="status-indicator status-error" />}
        </h3>
        <span className="card-icon">⚡</span>
      </div>
      <p className="card-description">Latest EventSub notifications (follows, subs, etc.)</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="card-button" onClick={onFetch} disabled={state.status === 'loading'}>
          Fetch Recent Events
        </button>
        <button className="card-button danger" onClick={onClear} style={{ width: 'auto' }}>
          Clear Events
        </button>
      </div>
      <div className={`card-data ${state.status === 'idle' ? '' : state.status}`}>{state.data}</div>
    </div>
  );
}

// ─── EventSubCard component ──────────────────────────────────────────────────

function EventSubCard({ token }: { token: string }) {
  const [selectedEvent, setSelectedEvent] = useState('channel.follow');
  const [statusText, setStatusText] = useState('Select an event type to subscribe');
  const [statusClass, setStatusClass] = useState('');

  const subscribe = useCallback(async () => {
    setStatusText('Creating subscription...');
    setStatusClass('loading');
    try {
      const resp = await fetch('/api/eventsub/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, eventType: selectedEvent }),
      });
      const data = await resp.json();
      if (resp.ok && data.data) {
        setStatusText(`✅ Successfully subscribed to ${selectedEvent}\nStatus: ${data.data[0].status}\nID: ${data.data[0].id}`);
        setStatusClass('success');
      } else {
        setStatusText(`❌ Error: ${JSON.stringify(data, null, 2)}`);
        setStatusClass('error');
      }
    } catch (err) {
      setStatusText(`❌ Network error: ${err instanceof Error ? err.message : String(err)}`);
      setStatusClass('error');
    }
  }, [token, selectedEvent]);

  return (
    <div className="api-card">
      <div className="card-header">
        <h3 className="card-title">EventSub Setup</h3>
        <span className="card-icon">🔧</span>
      </div>
      <p className="card-description">Manage EventSub subscriptions for real-time events</p>
      <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          className="eventsub-select"
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
        >
          {EVENT_TYPES.map((et) => (
            <option key={et.value} value={et.value}>
              {et.label}
            </option>
          ))}
        </select>
        <button className="card-button" onClick={subscribe} style={{ width: 'auto', margin: 0 }}>
          Subscribe
        </button>
      </div>
      <div className={`card-data ${statusClass}`}>{statusText}</div>
    </div>
  );
}

// ─── Main DemoPage ───────────────────────────────────────────────────────────

export default function DemoPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const displayName = params.get('displayName') || 'User';

  // Card states keyed by endpoint name
  const [cards, setCards] = useState<CardStates>(() => {
    const initial: CardStates = {};
    for (const ep of getAllEndpoints()) {
      initial[ep.endpoint] = { data: 'Click button to load...', status: 'idle' };
    }
    initial['events'] = { data: 'Click button to load...', status: 'idle' };
    return initial;
  });

  const [analysisData, setAnalysisData] = useState('Click "Run Full Analysis" to test all endpoints and generate comprehensive analysis...');
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const analysisResultsRef = useRef<Record<string, unknown>>({});

  const updateCard = useCallback((endpoint: string, update: Partial<CardState>) => {
    setCards((prev) => ({ ...prev, [endpoint]: { ...prev[endpoint], ...update } }));
  }, []);

  // Fetch a single endpoint
  const fetchEndpoint = useCallback(
    async (endpoint: string) => {
      updateCard(endpoint, { data: 'Loading...', status: 'loading' });
      try {
        const resp = await fetch(`/api/twitch/${endpoint}?token=${encodeURIComponent(token)}`);
        const data = await resp.json();
        if (resp.ok) {
          if (endpoint === 'events') {
            const eventsText = formatEventData(data.events);
            updateCard(endpoint, { data: `Total Events: ${data.total}\n\n${eventsText}`, status: 'success' });
          } else {
            updateCard(endpoint, { data: JSON.stringify(data, null, 2), status: 'success' });
          }
        } else {
          updateCard(endpoint, {
            data: `Error: ${data.error}\n${data.message || data.details || ''}`,
            status: 'error',
          });
        }
      } catch (err) {
        updateCard(endpoint, {
          data: `Network Error: ${err instanceof Error ? err.message : String(err)}`,
          status: 'error',
        });
      }
    },
    [token, updateCard],
  );

  // Clear events via DELETE
  const clearEvents = useCallback(async () => {
    updateCard('events', { data: 'Clearing events...', status: 'loading' });
    try {
      const resp = await fetch(`/api/twitch/events?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      const data = await resp.json();
      if (resp.ok) {
        updateCard('events', { data: '✅ Events cleared successfully', status: 'success' });
      } else {
        updateCard('events', { data: `❌ Error: ${data.error}`, status: 'error' });
      }
    } catch (err) {
      updateCard('events', { data: `❌ Network error: ${err instanceof Error ? err.message : String(err)}`, status: 'error' });
    }
  }, [token, updateCard]);

  // Run full analysis
  const runFullAnalysis = useCallback(async () => {
    setAnalysisStatus('loading');
    setAnalysisData('Running comprehensive analysis of all Twitch API endpoints...\n\nThis may take 30-60 seconds to complete.');

    const allEps = [
      ...getAllEndpoints(),
      { name: 'Recent Events', endpoint: 'events', category: 'Events', overlayUse: 'Real-time event notifications', icon: '⚡', description: '' },
    ];

    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      totalEndpoints: allEps.length,
      results: {} as Record<string, unknown>,
      summary: { successful: 0, failed: 0, errors: [] as unknown[], warnings: [] as string[] },
      categories: {} as Record<string, { successful: number; failed: number; total: number }>,
      overlayRecommendations: [] as string[],
    };

    const summary = results.summary as { successful: number; failed: number; errors: unknown[]; warnings: string[] };
    const categories = results.categories as Record<string, { successful: number; failed: number; total: number }>;
    const endpointResults = results.results as Record<string, unknown>;
    const recs = results.overlayRecommendations as string[];

    let progressText = 'Running comprehensive analysis of all Twitch API endpoints...';

    for (const ep of allEps) {
      progressText += `\n\nTesting ${ep.name} (${ep.category})...`;
      setAnalysisData(progressText);

      try {
        const start = Date.now();
        const resp = await fetch(`/api/twitch/${ep.endpoint}?token=${encodeURIComponent(token)}`);
        const data = await resp.json();
        const responseTime = Date.now() - start;

        const result: Record<string, unknown> = {
          endpoint: ep.endpoint,
          category: ep.category,
          overlayUse: ep.overlayUse,
          status: resp.status,
          success: resp.ok,
          responseTime,
          dataSize: JSON.stringify(data).length,
          hasData: data && (data.data ? data.data.length > 0 : Object.keys(data).length > 0),
        };

        if (resp.ok) {
          result.data = data;
          summary.successful++;
          progressText += ' ✅ SUCCESS';
          if (result.hasData && ep.overlayUse) {
            recs.push(`✅ ${ep.name}: ${ep.overlayUse}`);
          }
        } else {
          result.error = data.error || 'Unknown error';
          result.message = data.message || data.details || '';
          summary.failed++;
          summary.errors.push({ endpoint: ep.name, error: result.error, message: result.message });
          progressText += ` ❌ FAILED (${result.error})`;
        }

        endpointResults[ep.name] = result;

        if (!categories[ep.category]) {
          categories[ep.category] = { successful: 0, failed: 0, total: 0 };
        }
        categories[ep.category].total++;
        if (result.success) categories[ep.category].successful++;
        else categories[ep.category].failed++;
      } catch (err) {
        summary.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        summary.errors.push({ endpoint: ep.name, error: 'Network Error', message: msg });
        endpointResults[ep.name] = { endpoint: ep.endpoint, success: false, error: 'Network Error', message: msg };
        progressText += ' ❌ NETWORK ERROR';
      }

      // Small delay between requests
      await new Promise((r) => setTimeout(r, 100));
    }

    // Generate analysis summary
    const successRate = ((summary.successful / allEps.length) * 100).toFixed(1);
    const successfulWithTime = Object.values(endpointResults).filter(
      (r: unknown) => (r as Record<string, unknown>).success && typeof (r as Record<string, unknown>).responseTime === 'number',
    ) as Record<string, unknown>[];
    const avgTime = successfulWithTime.length > 0
      ? successfulWithTime.reduce((a, r) => a + (r.responseTime as number), 0) / successfulWithTime.length
      : 0;

    (results as Record<string, unknown>).analysis = {
      successRate: successRate + '%',
      averageResponseTime: avgTime,
    };

    analysisResultsRef.current = results;
    setAnalysisData(JSON.stringify(results, null, 2));
    setAnalysisStatus('success');
  }, [token]);

  // Refresh all endpoints
  const refreshAll = useCallback(() => {
    const allEps = getAllEndpoints();
    allEps.forEach((ep, i) => {
      setTimeout(() => fetchEndpoint(ep.endpoint), i * 200);
    });
  }, [fetchEndpoint]);

  // Clear all card data
  const clearAll = useCallback(() => {
    setCards((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { data: 'Click button to load...', status: 'idle' };
      }
      return next;
    });
    analysisResultsRef.current = {};
    setAnalysisData('Click "Run Full Analysis" to test all endpoints and generate comprehensive analysis...');
    setAnalysisStatus('idle');
  }, []);

  // Export analysis results
  const exportAnalysis = useCallback(() => {
    const data = analysisResultsRef.current;
    if (!data || Object.keys(data).length === 0) {
      alert('No analysis data to export. Please run Full Analysis first.');
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twitch-api-analysis-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="demo-container">
      <div className="demo-header">
        <div className="icon-code">🚀</div>
        <h1>Twitch API Demo Dashboard</h1>
        <p>
          Authenticated as <strong>{displayName}</strong> - Comprehensive Twitch API Testing
        </p>
      </div>

      {/* Analysis Section */}
      <div className="analysis-section">
        <h2>🔬 Comprehensive Analysis</h2>
        <div className="analysis-actions">
          <button className="analysis-btn" onClick={runFullAnalysis}>
            Run Full Analysis
          </button>
          <button className="analysis-btn" onClick={refreshAll}>
            Refresh All Data
          </button>
          <button className="analysis-btn" onClick={exportAnalysis}>
            Export Results
          </button>
          <button className="analysis-btn" onClick={clearAll}>
            Clear All
          </button>
        </div>
        <div
          className={`card-data ${analysisStatus === 'idle' ? '' : analysisStatus}`}
          style={{ maxHeight: 300 }}
        >
          {analysisData}
        </div>
      </div>

      {/* Endpoint Categories */}
      {ENDPOINT_CATEGORIES.map((cat) => (
        <div className="category-section" key={cat.title}>
          <h2 className="category-title">
            <span>{cat.icon}</span> {cat.title}
          </h2>
          <p className="category-description">{cat.description}</p>
          <div className="cards-grid">
            {cat.endpoints.map((ep) => (
              <ApiCard
                key={ep.endpoint}
                def={ep}
                state={cards[ep.endpoint] || { data: 'Click button to load...', status: 'idle' }}
                onFetch={() => fetchEndpoint(ep.endpoint)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Real-time Events Section */}
      <div className="category-section">
        <h2 className="category-title">
          <span>📡</span> Real-time Events
        </h2>
        <p className="category-description">EventSub notifications and recent stream events</p>
        <div className="cards-grid">
          <EventsCard
            token={token}
            state={cards['events'] || { data: 'Click button to load...', status: 'idle' }}
            onFetch={() => fetchEndpoint('events')}
            onClear={clearEvents}
          />
          <EventSubCard token={token} />
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '3rem', marginBottom: '2rem' }}>
        <Link to="/" className="demo-back-link">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
