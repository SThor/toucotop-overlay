import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Slider, Switch, Button, Text, Group, Stack, Title, Paper, Radio, Container, Select,
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
  const { persistedSettings, updateSettings, resetSettings, isLoadingSettings } = useSettings();

  // On a fresh OAuth callback, the server puts all three into the redirect URL.
  // On a direct visit (e.g. bookmarked dashboard), only the stored token is available.
  const urlToken = params.get('token');
  const urlDisplayName = params.get('displayName');
  const urlExpiresAt = params.get('expiresAt');
  const overlayToken = persistedSettings.overlayToken;

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
    (patch: Partial<typeof persistedSettings.themeSettings.crt>) => {
      updateSettings({ themeSettings: { crt: patch } as typeof persistedSettings.themeSettings });
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
  const crt = persistedSettings.themeSettings.crt;

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
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>
              Per-overlay URL overrides (session-only)
            </summary>
            <Text size="xs" c="dimmed" mt="xs" mb="xs">
              Append query parameters to any overlay URL to override settings for that browser source
              only. These are not saved — useful for per-scene OBS configuration.
            </Text>
            <Text size="xs" c="dimmed" component="div">
              <strong>Opacity</strong> (0.1–1):{' '}
              <code>?opacityChat=0.8&amp;opacityClock=0.7&amp;opacityBar=0.6</code>
            </Text>
            <Text size="xs" c="dimmed" component="div" mt={4}>
              <strong>Font scale</strong> (0.5–10):{' '}
              <code>?fontSizeChat=1.2&amp;fontSizeClock=0.9&amp;fontSizeBar=1.4</code>
            </Text>
            <Text size="xs" c="dimmed" component="div" mt={4}>
              <strong>Other</strong>:{' '}
              <code>?overlayOpacity=0.9&amp;fontSize=1.2&amp;barFloating=false&amp;theme=crt</code>
            </Text>
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
                  Global Opacity: {Math.round(persistedSettings.overlayOpacity * 100)}%
                </Text>
                <Slider
                  value={persistedSettings.overlayOpacity}
                  onChange={(v) => save({ overlayOpacity: v })}
                  min={0.1} max={1} step={0.05}
                />
              </div>
              <Text size="sm" fw={500}>Per-overlay opacity overrides</Text>
              <Stack gap="md" pl="md">
                {(['chat', 'clock', 'bar'] as const).map((key) => {
                  const isOverridden = persistedSettings.perOverlayOpacity[key] != null;
                  return (
                    <div key={key}>
                      <Group justify="space-between" mb="xs">
                        <Text size="sm" fw={500} tt="capitalize">
                          {key}: {Math.round((persistedSettings.perOverlayOpacity[key] ?? persistedSettings.overlayOpacity) * 100)}%
                          {!isOverridden ? ' (using global)' : ''}
                        </Text>
                        <Switch
                          size="xs"
                          label="Override"
                          checked={isOverridden}
                          onChange={(e) => {
                            const on = e.currentTarget.checked;
                            save({
                              perOverlayOpacity: {
                                ...persistedSettings.perOverlayOpacity,
                                [key]: on ? (persistedSettings.perOverlayOpacity[key] ?? persistedSettings.overlayOpacity) : null,
                              },
                            });
                          }}
                        />
                      </Group>
                      {isOverridden && (
                        <Slider
                          value={persistedSettings.perOverlayOpacity[key]!}
                          onChange={(v) => save({ perOverlayOpacity: { ...persistedSettings.perOverlayOpacity, [key]: v } })}
                          min={0.1} max={1} step={0.05}
                        />
                      )}
                    </div>
                  );
                })}
              </Stack>

              {/* Font Size */}
              <div>
                <Text size="sm" fw={500} mb="xs">
                  Global Font Size: {persistedSettings.fontSize.toFixed(2)}×
                </Text>
                <Slider
                  value={persistedSettings.fontSize}
                  onChange={(v) => save({ fontSize: v })}
                  min={0.5} max={10} step={0.05}
                  marks={[
                    { value: 0.5, label: '0.5×' },
                    { value: 1, label: '1×' },
                    { value: 5, label: '5×' },
                    { value: 10, label: '10×' },
                  ]}
                />
              </div>
              <Text size="sm" fw={500}>Per-overlay font size overrides</Text>
              <Stack gap="md" pl="md">
                {(['chat', 'clock', 'bar'] as const).map((key) => {
                  const isOverridden = persistedSettings.perOverlayFontSize[key] != null;
                  return (
                    <div key={key}>
                      <Group justify="space-between" mb="xs">
                        <Text size="sm" fw={500} tt="capitalize">
                          {key}: {(persistedSettings.perOverlayFontSize[key] ?? persistedSettings.fontSize).toFixed(2)}×
                          {!isOverridden ? ' (using global)' : ''}
                        </Text>
                        <Switch
                          size="xs"
                          label="Override"
                          checked={isOverridden}
                          onChange={(e) => {
                            const on = e.currentTarget.checked;
                            save({
                              perOverlayFontSize: {
                                ...persistedSettings.perOverlayFontSize,
                                [key]: on ? (persistedSettings.perOverlayFontSize[key] ?? persistedSettings.fontSize) : null,
                              },
                            });
                          }}
                        />
                      </Group>
                      {isOverridden && (
                        <Slider
                          value={persistedSettings.perOverlayFontSize[key]!}
                          onChange={(v) => save({ perOverlayFontSize: { ...persistedSettings.perOverlayFontSize, [key]: v } })}
                          min={0.5} max={10} step={0.05}
                        />
                      )}
                    </div>
                  );
                })}
              </Stack>

              <Switch
                label="Floating Bar"
                description="Bar overlay appears as a centered floating pill instead of full-width"
                checked={persistedSettings.barFloating}
                onChange={(e) => save({ barFloating: e.currentTarget.checked })}
              />

              {/* Chat */}
              <div>
                <Text size="sm" fw={500} mb="xs">Chat Feed Direction</Text>
                <Radio.Group
                  value={persistedSettings.chatFeedDirection}
                  onChange={(v) => save({ chatFeedDirection: v as 'top' | 'bottom' })}
                >
                  <Stack gap="xs">
                    <Radio value="bottom" label="Feed from bottom (new messages appear at bottom)" />
                    <Radio value="top" label="Feed from top (new messages appear at top)" />
                  </Stack>
                </Radio.Group>
              </div>

              <div>
                <Text size="sm" fw={500} mb="xs">
                  Maximum Chat Messages: {persistedSettings.maxChatMessages}
                </Text>
                <Slider
                  value={persistedSettings.maxChatMessages}
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
                <Button variant="light" onClick={resetSettings}>
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

              <Text size="sm" c="dimmed">
                Configure visual effects for your overlays.
              </Text>
              <Select
                label="Theme"
                description="Choose the visual style for all overlays"
                value={persistedSettings.theme}
                onChange={(v) => { if (v) save({ theme: v as import('../server/shared/overlaySettings').OverlayTheme }); }}
                data={[
                  { value: 'default', label: 'Animated background' },
                  { value: 'crt', label: 'CRT effects' },
                ]}
                allowDeselect={false}
              />
              {persistedSettings.theme === 'crt' && (
                <>
                  <div>
                    <Text size="sm" fw={500} mb="xs">CRT Intensity</Text>
                    <Radio.Group
                      value={crt.intensity}
                      onChange={(v) => updateCrtSettings({ intensity: v as 'minimal' | 'subtle' | 'medium' })}
                    >
                      <Stack gap="xs">
                        <Radio value="minimal" label="Minimal — very subtle effects" />
                        <Radio value="subtle" label="Subtle — balanced for streaming (recommended)" />
                        <Radio value="medium" label="Medium — more pronounced effects" />
                      </Stack>
                    </Radio.Group>
                  </div>
                  <Switch
                    label="Scanlines"
                    description="Horizontal lines across the display"
                    checked={crt.scanlines}
                    onChange={(e) => updateCrtSettings({ scanlines: e.currentTarget.checked })}
                  />
                  <Switch
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
