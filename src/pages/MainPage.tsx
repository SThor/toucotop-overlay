import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Slider,
  Switch,
  Button,
  Text,
  Group,
  Stack,
  Container,
  Title,
  Paper,
  Grid,
  Card,
  List,
  Code,
  Radio
} from '@mantine/core';
import { useSettings } from '../contexts/SettingsContext';
import type { PerOverlayNumber } from '../server/shared/overlaySettings';
import '../styles/MainPage.css';

const MainPage = () => {
  const { settings, updateSettings, resetSettings } = useSettings();

  // Opacity
  const [localOpacity, setLocalOpacity] = useState(settings.overlayOpacity);
  const [showPerOpacity, setShowPerOpacity] = useState(Object.keys(settings.perOverlayOpacity).length > 0);
  const [localPerOpacity, setLocalPerOpacity] = useState<PerOverlayNumber>(settings.perOverlayOpacity);

  // Font size
  const [localFontSize, setLocalFontSize] = useState(settings.fontSize);
  const [showPerFontSize, setShowPerFontSize] = useState(Object.keys(settings.perOverlayFontSize).length > 0);
  const [localPerFontSize, setLocalPerFontSize] = useState<PerOverlayNumber>(settings.perOverlayFontSize);

  // Chat
  const [localChatFeedDirection, setLocalChatFeedDirection] = useState(settings.chatFeedDirection);
  const [localMaxChatMessages, setLocalMaxChatMessages] = useState(settings.maxChatMessages);

  // Bar
  const [localBarFloating, setLocalBarFloating] = useState(settings.barFloating);

  // Visual effects
  const [localCrtEnabled, setLocalCrtEnabled] = useState(settings.theme === 'crt');
  const [localCrtIntensity, setLocalCrtIntensity] = useState(settings.themeSettings.crt.intensity);
  const [localCrtScanlines, setLocalCrtScanlines] = useState(settings.themeSettings.crt.scanlines);
  const [localCrtAnimation, setLocalCrtAnimation] = useState(settings.themeSettings.crt.animation);

  const [showSavedIndicator, setShowSavedIndicator] = useState(false);

  useEffect(() => {
    setLocalOpacity(settings.overlayOpacity);
    setLocalPerOpacity(settings.perOverlayOpacity);
    setShowPerOpacity(Object.keys(settings.perOverlayOpacity).length > 0);
    setLocalFontSize(settings.fontSize);
    setLocalPerFontSize(settings.perOverlayFontSize);
    setShowPerFontSize(Object.keys(settings.perOverlayFontSize).length > 0);
    setLocalChatFeedDirection(settings.chatFeedDirection);
    setLocalMaxChatMessages(settings.maxChatMessages);
    setLocalBarFloating(settings.barFloating);
    setLocalCrtEnabled(settings.theme === 'crt');
    setLocalCrtIntensity(settings.themeSettings.crt.intensity);
    setLocalCrtScanlines(settings.themeSettings.crt.scanlines);
    setLocalCrtAnimation(settings.themeSettings.crt.animation);
  }, [settings]);

  const autoSave = (newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings);
    setShowSavedIndicator(true);
    setTimeout(() => setShowSavedIndicator(false), 1500);
  };

  const createOverlayUrl = (path: string) => {
    const url = new URL(path, window.location.origin);
    if (settings.overlayToken) url.searchParams.set('token', settings.overlayToken);
    if (settings.overlayOpacity !== 0.9) url.searchParams.set('overlayOpacity', settings.overlayOpacity.toString());
    if (settings.fontSize !== 1.0) url.searchParams.set('fontSize', settings.fontSize.toString());
    if (settings.chatFeedDirection !== 'bottom') url.searchParams.set('chatFeedDirection', settings.chatFeedDirection);
    if (settings.maxChatMessages !== 50) url.searchParams.set('maxChatMessages', settings.maxChatMessages.toString());
    if (!settings.barFloating) url.searchParams.set('barFloating', 'false');
    if (settings.theme !== 'crt') url.searchParams.set('crtEffects', 'false');
    if (settings.themeSettings.crt.intensity !== 'subtle') url.searchParams.set('crtIntensity', settings.themeSettings.crt.intensity);
    if (!settings.themeSettings.crt.scanlines) url.searchParams.set('crtScanlines', 'false');
    if (!settings.themeSettings.crt.animation) url.searchParams.set('crtAnimation', 'false');
    return url.pathname + url.search;
  };

  const overlayPages = [
    { path: createOverlayUrl('/chat'), title: 'Chat Overlay', description: 'Display Twitch chat messages on your stream', icon: '💬' },
    { path: createOverlayUrl('/clock'), title: 'Clock Overlay', description: 'Show current time and stream duration', icon: '🕐' },
    { path: createOverlayUrl('/bar'), title: 'Info Bar Overlay', description: 'Stream stats and recent follower/sub', icon: '📊' },
  ];

  return (
    <Container size="lg" py="xl" className="main-page">
      <Stack gap="xl">
        {/* Header */}
        <Paper p="xl" radius="md" withBorder shadow="sm" className="main-header">
          <Title order={1} ta="center">
            <span className="main-title">Toucotop Stream Overlay</span>
          </Title>
          <Text ta="center" size="lg" c="dimmed" mt="sm">
            Configure your Twitch stream overlays
          </Text>
        </Paper>

        {/* Opacity */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Opacity</span>
          </Title>
          <Stack gap="lg">
            <div>
              <Text size="sm" fw={500} mb="xs">Global Opacity: {Math.round(localOpacity * 100)}%</Text>
              <Slider
                value={localOpacity}
                onChange={(v) => { setLocalOpacity(v); autoSave({ overlayOpacity: v }); }}
                min={0.1} max={1} step={0.05}
              />
            </div>
            <Switch
              label="Per-overlay opacity overrides"
              description="Set a different opacity for each overlay"
              checked={showPerOpacity}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                setShowPerOpacity(on);
                if (!on) { setLocalPerOpacity({}); autoSave({ perOverlayOpacity: {} }); }
              }}
            />
            {showPerOpacity && (
              <Stack gap="md" pl="md">
                {(['chat', 'clock', 'bar'] as const).map((key) => (
                  <div key={key}>
                    <Text size="sm" fw={500} mb="xs" tt="capitalize">
                      {key}: {Math.round((localPerOpacity[key] ?? localOpacity) * 100)}%
                      {localPerOpacity[key] == null ? ' (using global)' : ''}
                    </Text>
                    <Slider
                      value={localPerOpacity[key] ?? localOpacity}
                      onChange={(v) => {
                        const next = { ...localPerOpacity, [key]: v };
                        setLocalPerOpacity(next);
                        autoSave({ perOverlayOpacity: next });
                      }}
                      min={0.1} max={1} step={0.05}
                    />
                  </div>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>

        {/* Font Size */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Font Size</span>
          </Title>
          <Stack gap="lg">
            <div>
              <Text size="sm" fw={500} mb="xs">Global Scale: {localFontSize.toFixed(2)}×</Text>
              <Slider
                value={localFontSize}
                onChange={(v) => { setLocalFontSize(v); autoSave({ fontSize: v }); }}
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
              label="Per-overlay font size overrides"
              description="Set a different scale for each overlay"
              checked={showPerFontSize}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                setShowPerFontSize(on);
                if (!on) { setLocalPerFontSize({}); autoSave({ perOverlayFontSize: {} }); }
              }}
            />
            {showPerFontSize && (
              <Stack gap="md" pl="md">
                {(['chat', 'clock', 'bar'] as const).map((key) => (
                  <div key={key}>
                    <Text size="sm" fw={500} mb="xs" tt="capitalize">
                      {key}: {(localPerFontSize[key] ?? localFontSize).toFixed(2)}×
                      {localPerFontSize[key] == null ? ' (using global)' : ''}
                    </Text>
                    <Slider
                      value={localPerFontSize[key] ?? localFontSize}
                      onChange={(v) => {
                        const next = { ...localPerFontSize, [key]: v };
                        setLocalPerFontSize(next);
                        autoSave({ perOverlayFontSize: next });
                      }}
                      min={0.5} max={2} step={0.05}
                    />
                  </div>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>

        {/* Chat */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Chat</span>
          </Title>
          <Stack gap="lg">
            <div>
              <Text size="sm" fw={500} mb="xs">Feed Direction</Text>
              <Radio.Group
                value={localChatFeedDirection}
                onChange={(v) => {
                  setLocalChatFeedDirection(v as 'top' | 'bottom');
                  autoSave({ chatFeedDirection: v as 'top' | 'bottom' });
                }}
              >
                <Stack gap="xs">
                  <Radio value="bottom" label="Feed from bottom (new messages appear at bottom)" />
                  <Radio value="top" label="Feed from top (new messages appear at top)" />
                </Stack>
              </Radio.Group>
            </div>
            <div>
              <Text size="sm" fw={500} mb="xs">Maximum Messages: {localMaxChatMessages}</Text>
              <Slider
                value={localMaxChatMessages}
                onChange={(v) => { setLocalMaxChatMessages(v); autoSave({ maxChatMessages: v }); }}
                min={10} max={100} step={1}
                marks={[{ value: 10, label: '10' }, { value: 50, label: '50' }, { value: 100, label: '100' }]}
              />
            </div>
          </Stack>
        </Paper>

        {/* Bar */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Info Bar</span>
          </Title>
          <Switch
            label="Floating bar"
            description="Display as a centered floating pill. When off, the bar spans the full screen width."
            checked={localBarFloating}
            onChange={(e) => {
              setLocalBarFloating(e.currentTarget.checked);
              autoSave({ barFloating: e.currentTarget.checked });
            }}
          />
        </Paper>

        {/* Visual Effects */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Visual Effects</span>
          </Title>
          <Stack gap="lg">
            <Text size="sm" c="dimmed">
              Configure CRT-style visual effects for a retro gaming aesthetic.
            </Text>
            <Switch
              label="Enable CRT Effects"
              description="Toggle between CRT effects and animated background"
              checked={localCrtEnabled}
              onChange={(e) => {
                setLocalCrtEnabled(e.currentTarget.checked);
                autoSave({ theme: e.currentTarget.checked ? 'crt' : 'default' });
              }}
            />
            {localCrtEnabled && (
              <>
                <div>
                  <Text size="sm" fw={500} mb="xs">CRT Intensity</Text>
                  <Radio.Group
                    value={localCrtIntensity}
                    onChange={(v) => {
                      const val = v as 'minimal' | 'subtle' | 'medium';
                      setLocalCrtIntensity(val);
                      autoSave({ themeSettings: { crt: { ...settings.themeSettings.crt, intensity: val } } });
                    }}
                  >
                    <Stack gap="xs">
                      <Radio value="minimal" label="Minimal — Very subtle effects" />
                      <Radio value="subtle" label="Subtle — Balanced for streaming (recommended)" />
                      <Radio value="medium" label="Medium — More pronounced effects" />
                    </Stack>
                  </Radio.Group>
                </div>
                <Switch
                  label="Scanlines"
                  description="Horizontal lines across the display"
                  checked={localCrtScanlines}
                  onChange={(e) => {
                    setLocalCrtScanlines(e.currentTarget.checked);
                    autoSave({ themeSettings: { crt: { ...settings.themeSettings.crt, scanlines: e.currentTarget.checked } } });
                  }}
                />
                <Switch
                  label="Scan Animation"
                  description="Occasional scanning sweep effect"
                  checked={localCrtAnimation}
                  onChange={(e) => {
                    setLocalCrtAnimation(e.currentTarget.checked);
                    autoSave({ themeSettings: { crt: { ...settings.themeSettings.crt, animation: e.currentTarget.checked } } });
                  }}
                />
              </>
            )}
          </Stack>
        </Paper>

        <Group justify="space-between">
          <Button variant="outline" color="brand" onClick={resetSettings}>
            Reset to Defaults
          </Button>
          {showSavedIndicator && (
            <Text c="brand" size="sm" fw={600}>✓ Saved!</Text>
          )}
        </Group>

        {/* Available Overlays */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Available Overlays</span>
          </Title>
          <Grid>
            {overlayPages.map((overlay) => (
              <Grid.Col span={{ base: 12, sm: 6, lg: 4 }} key={overlay.path}>
                <Card
                  component={Link}
                  to={overlay.path}
                  className="overlay-card"
                  p="lg"
                  radius="md"
                  withBorder
                  shadow="sm"
                >
                  <Text size="xl" mb="md" ta="center">{overlay.icon}</Text>
                  <Title order={4} mb="xs" ta="center">{overlay.title}</Title>
                  <Text size="sm" c="dimmed" ta="center" mb="md">{overlay.description}</Text>
                  <Text size="xs" c="brand" ta="center" fw={500}>Open Overlay →</Text>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Paper>

        {/* Usage Instructions */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Usage Instructions</span>
          </Title>
          <Stack gap="md">
            <List size="sm" spacing="xs">
              <List.Item>Configure your settings above (they save automatically)</List.Item>
              <List.Item>Click on an overlay to open it with your current settings</List.Item>
              <List.Item>Copy the URL and add it as a Browser Source in OBS</List.Item>
              <List.Item>You can also override any setting per-source via URL parameters</List.Item>
            </List>
            <Paper p="md" radius="sm" withBorder className="tip-paper">
              <Text fw={600} mb="xs">Tip:</Text>
              <Text size="sm" mb="sm">
                Override any setting via URL — e.g. a larger font for chat:
              </Text>
              <Code block>?token=your_overlay_token&fontSize=1.4</Code>
            </Paper>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
};

export default MainPage;