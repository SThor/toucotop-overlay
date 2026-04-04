import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Slider, Switch, Button, Text, Group, Stack, Title, Paper, Radio, Container,
} from '@mantine/core';
import { CopyButton } from '../components/CopyButton';
import { useSettings } from '../contexts/SettingsContext';
import '../styles/ServerPages.css';

function formatExpiryDate(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

interface AuthInfo {
  displayName: string;
  expiresAt: string;
}

export default function AuthSuccessPage() {
  const [params] = useSearchParams();
  const { settings, updateSettings, resetSettings, isLoadingSettings } = useSettings();

  // On a fresh OAuth callback, the server puts all three into the redirect URL.
  // On a direct visit (e.g. bookmarked dashboard), only the stored token is available.
  const urlToken = params.get('token');
  const urlDisplayName = params.get('displayName');
  const urlExpiresAt = params.get('expiresAt');
  const overlayToken = settings.overlayToken;

  console.log('[AuthSuccessPage] mounted — overlayToken:', overlayToken ? '(set)' : '(empty)', '| urlToken:', urlToken ? '(set)' : null);

  // Seed auth info immediately from URL params when present (avoids a redundant round-trip)
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(
    urlDisplayName ? { displayName: urlDisplayName, expiresAt: urlExpiresAt ?? '' } : null,
  );
  // Guard synchronously: if there's no token anywhere on first render, show the
  // expired UI immediately rather than flashing valid-looking URLs for one frame.
  const [sessionExpired, setSessionExpired] = useState(() => !overlayToken && !urlToken);
  const [showSaved, setShowSaved] = useState(false);
  const showSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPerOpacity, setShowPerOpacity] = useState(() => Object.keys(settings.perOverlayOpacity).length > 0);
  const [showPerFontSize, setShowPerFontSize] = useState(() => Object.keys(settings.perOverlayFontSize).length > 0);

  // Clear pending timer on unmount to avoid setState on an unmounted component
  useEffect(() => () => {
    if (showSavedTimerRef.current) clearTimeout(showSavedTimerRef.current);
  }, []);

  // Strip all URL params and persist the token via updateSettings (handles both localStorage keys)
  useEffect(() => {
    if (urlToken) {
      updateSettings({ overlayToken: urlToken });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [urlToken, updateSettings]);

  // Call /auth/status only when auth info wasn't already in the URL params
  // (i.e. the user navigated to the dashboard directly rather than arriving from OAuth)
  useEffect(() => {
    if (urlDisplayName) return; // Already seeded — skip the fetch
    if (!overlayToken) {
      setSessionExpired(true);
      return;
    }
    fetch(`/auth/status?token=${encodeURIComponent(overlayToken)}`)
      .then((res) => res.json() as Promise<{ authenticated: boolean; displayName?: string; expiresAt?: string }>)
      .then((data) => {
        if (data.authenticated) {
          setAuthInfo({ displayName: data.displayName || '', expiresAt: data.expiresAt || '' });
        } else {
          setSessionExpired(true);
        }
      })
      .catch(() => { /* keep rendering on network error */ });
  }, [overlayToken, urlDisplayName]);

  // Helper for CRT sub-settings: sends only the changed CRT fields so session-only
  // URL overrides in the effective `settings` view are never persisted to the server.
  // Both client (updateSettings) and server (updateUserSettings) deep-merge themeSettings.crt.
  const updateCrtSettings = useCallback(
    (patch: Partial<typeof settings.themeSettings.crt>) => {
      updateSettings({ themeSettings: { crt: patch } as typeof settings.themeSettings });
      if (showSavedTimerRef.current) clearTimeout(showSavedTimerRef.current);
      setShowSaved(true);
      showSavedTimerRef.current = setTimeout(() => setShowSaved(false), 1500);
    },
    [updateSettings],
  );

  const save = useCallback(
    (patch: Parameters<typeof updateSettings>[0]) => {
      updateSettings(patch);
      if (showSavedTimerRef.current) clearTimeout(showSavedTimerRef.current);
      setShowSaved(true);
      showSavedTimerRef.current = setTimeout(() => setShowSaved(false), 1500);
    },
    [updateSettings],
  );

  if (sessionExpired) {
    return (
      <div className="server-page">
        <div className="container">
          <div className="icon-code">⏰</div>
          <h1 className="page-title">Session Expired</h1>
          <p className="page-message">Your session has expired.</p>
          <a href="/auth/twitch" className="action-btn">🔄 Re-authenticate now</a>
        </div>
      </div>
    );
  }

  const baseUrl = window.location.origin;
  const chatUrl = `${baseUrl}/chat?token=${encodeURIComponent(overlayToken)}`;
  const clockUrl = `${baseUrl}/clock?token=${encodeURIComponent(overlayToken)}`;
  const barUrl = `${baseUrl}/bar?token=${encodeURIComponent(overlayToken)}`;
  const crt = settings.themeSettings.crt;

  return (
    <Container size="lg" py="xl" className="main-page">
      <Stack gap="xl">

        {/* Welcome header */}
        <Paper p="xl" radius="md" withBorder shadow="sm" className="main-header">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Title order={1}>
                {authInfo?.displayName
                  ? <>{`👋 `}<span className="main-title">{`Welcome back, ${authInfo.displayName}`}</span></>
                  : <>{`🎮 `}<span className="main-title">Toucotop Stream Overlay</span></>
                }
              </Title>
              {authInfo?.expiresAt && (
                <Text size="sm" c="dimmed" mt="xs">
                  Session token expires: {formatExpiryDate(authInfo.expiresAt)}
                </Text>
              )}
            </div>
            <a href="/auth/twitch" className="dashboard-btn" style={{ flexShrink: 0 }}>
              🔄 Re-authenticate
            </a>
          </Group>
        </Paper>

        {/* OBS Browser Source URLs */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="sm">
            <>📺 <span className="section-title">OBS Browser Source URLs</span></>
          </Title>
          <Text size="sm" c="dimmed" mb="lg">
            Add these as Browser Sources in OBS. Settings are stored server-side — no need to
            update URLs when you change settings below.
          </Text>
          <Stack gap="sm">
            {[
              { label: '💬 Chat Overlay', url: chatUrl },
              { label: '🕐 Clock Overlay', url: clockUrl },
              { label: '📊 Info Bar Overlay', url: barUrl },
            ].map(({ label, url }) => (
              <div key={url}>
                <Text size="sm" fw={500} mb="xs">{label}</Text>
                <div className="url-box">
                  <span>{url}</span>
                  <CopyButton text={url} />
                </div>
              </div>
            ))}
          </Stack>
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>
              Show overlay token
            </summary>
            <div className="token-box" style={{ marginTop: 8 }}>
              <span>{overlayToken}</span>
              <CopyButton text={overlayToken} />
            </div>
          </details>
        </Paper>

        {/* Layout & chat settings */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Settings</span>
          </Title>
          {isLoadingSettings ? (
            <Text c="dimmed" size="sm">Loading settings…</Text>
          ) : (
            <Stack gap="lg">
              {/* Opacity */}
              <div>
                <Text size="sm" fw={500} mb="xs">
                  Global Opacity: {Math.round(settings.overlayOpacity * 100)}%
                </Text>
                <Slider
                  color="violet"
                  value={settings.overlayOpacity}
                  onChange={(v) => save({ overlayOpacity: v })}
                  min={0.1} max={1} step={0.05}
                />
              </div>
              <Switch
                color="violet"
                label="Per-overlay opacity overrides"
                description="Set a different opacity for each overlay"
                checked={showPerOpacity}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  setShowPerOpacity(on);
                  if (!on) save({ perOverlayOpacity: {} });
                }}
              />
              {showPerOpacity && (
                <Stack gap="md" pl="md">
                  {(['chat', 'clock', 'bar'] as const).map((key) => (
                    <div key={key}>
                      <Text size="sm" fw={500} mb="xs" tt="capitalize">
                        {key}: {Math.round((settings.perOverlayOpacity[key] ?? settings.overlayOpacity) * 100)}%
                        {settings.perOverlayOpacity[key] == null ? ' (using global)' : ''}
                      </Text>
                      <Slider
                        color="violet"
                        value={settings.perOverlayOpacity[key] ?? settings.overlayOpacity}
                        onChange={(v) => save({ perOverlayOpacity: { ...settings.perOverlayOpacity, [key]: v } })}
                        min={0.1} max={1} step={0.05}
                      />
                    </div>
                  ))}
                </Stack>
              )}

              {/* Font Size */}
              <div>
                <Text size="sm" fw={500} mb="xs">
                  Global Font Size: {settings.fontSize.toFixed(2)}×
                </Text>
                <Slider
                  color="violet"
                  value={settings.fontSize}
                  onChange={(v) => save({ fontSize: v })}
                  min={0.5} max={2} step={0.05}
                  marks={[
                    { value: 0.5, label: '0.5×' },
                    { value: 1, label: '1×' },
                    { value: 1.5, label: '1.5×' },
                    { value: 2, label: '2×' },
                  ]}
                />
              </div>
              <Switch
                color="violet"
                label="Per-overlay font size overrides"
                description="Set a different scale for each overlay"
                checked={showPerFontSize}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  setShowPerFontSize(on);
                  if (!on) save({ perOverlayFontSize: {} });
                }}
              />
              {showPerFontSize && (
                <Stack gap="md" pl="md">
                  {(['chat', 'clock', 'bar'] as const).map((key) => (
                    <div key={key}>
                      <Text size="sm" fw={500} mb="xs" tt="capitalize">
                        {key}: {(settings.perOverlayFontSize[key] ?? settings.fontSize).toFixed(2)}×
                        {settings.perOverlayFontSize[key] == null ? ' (using global)' : ''}
                      </Text>
                      <Slider
                        color="violet"
                        value={settings.perOverlayFontSize[key] ?? settings.fontSize}
                        onChange={(v) => save({ perOverlayFontSize: { ...settings.perOverlayFontSize, [key]: v } })}
                        min={0.5} max={2} step={0.05}
                      />
                    </div>
                  ))}
                </Stack>
              )}

              {/* Chat */}
              <div>
                <Text size="sm" fw={500} mb="xs">Chat Feed Direction</Text>
                <Radio.Group
                  color="violet"
                  value={settings.chatFeedDirection}
                  onChange={(v) => save({ chatFeedDirection: v as 'top' | 'bottom' })}
                >
                  <Stack gap="xs">
                    <Radio color="violet" value="bottom" label="Feed from bottom (new messages appear at bottom)" />
                    <Radio color="violet" value="top" label="Feed from top (new messages appear at top)" />
                  </Stack>
                </Radio.Group>
              </div>

              <div>
                <Text size="sm" fw={500} mb="xs">
                  Maximum Chat Messages: {settings.maxChatMessages}
                </Text>
                <Slider
                  color="violet"
                  value={settings.maxChatMessages}
                  onChange={(v) => save({ maxChatMessages: v })}
                  min={10} max={100} step={1}
                  marks={[
                    { value: 10, label: '10' },
                    { value: 50, label: '50' },
                    { value: 100, label: '100' },
                  ]}
                />
              </div>

              <Group justify="space-between" mt="sm">
                <Button variant="light" color="violet" onClick={resetSettings}>
                  Reset to Defaults
                </Button>
                {showSaved && <Text c="violet" size="sm" fw={600}>✓ Saved!</Text>}
              </Group>
            </Stack>
          )}
        </Paper>

        {/* Visual effects */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Visual Effects</span>
          </Title>
          {isLoadingSettings ? (
            <Text c="dimmed" size="sm">Loading settings…</Text>
          ) : (
            <Stack gap="lg">
              <Switch
                color="violet"
                label="Floating Bar"
                description="Bar overlay appears as a centered floating pill instead of full-width"
                checked={settings.barFloating}
                onChange={(e) => save({ barFloating: e.currentTarget.checked })}
              />
              <Text size="sm" c="dimmed">
                Configure CRT-style visual effects for a retro gaming aesthetic.
              </Text>
              <Switch
                color="violet"
                label="Enable CRT Effects"
                description="Toggle between CRT effects and animated background"
                checked={settings.theme === 'crt'}
                onChange={(e) => save({ theme: e.currentTarget.checked ? 'crt' : 'default' })}
              />
              {settings.theme === 'crt' && (
                <>
                  <div>
                    <Text size="sm" fw={500} mb="xs">CRT Intensity</Text>
                    <Radio.Group
                      color="violet"
                      value={crt.intensity}
                      onChange={(v) => updateCrtSettings({ intensity: v as 'minimal' | 'subtle' | 'medium' })}
                    >
                      <Stack gap="xs">
                        <Radio color="violet" value="minimal" label="Minimal — very subtle effects" />
                        <Radio color="violet" value="subtle" label="Subtle — balanced for streaming (recommended)" />
                        <Radio color="violet" value="medium" label="Medium — more pronounced effects" />
                      </Stack>
                    </Radio.Group>
                  </div>
                  <Switch
                    color="violet"
                    label="Scanlines"
                    description="Horizontal lines across the display"
                    checked={crt.scanlines}
                    onChange={(e) => updateCrtSettings({ scanlines: e.currentTarget.checked })}
                  />
                  <Switch
                    color="violet"
                    label="Scan Animation"
                    description="Occasional scanning sweep effect"
                    checked={crt.animation}
                    onChange={(e) => updateCrtSettings({ animation: e.currentTarget.checked })}
                  />
                </>
              )}
            </Stack>
          )}
        </Paper>

      </Stack>
    </Container>
  );
}
