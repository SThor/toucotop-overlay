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
import '../styles/MainPage.css';

const MainPage = () => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [localOpacity, setLocalOpacity] = useState(settings.overlayOpacity);
  const [localChatFeedDirection, setLocalChatFeedDirection] = useState(settings.chatFeedDirection);
  const [localMaxChatMessages, setLocalMaxChatMessages] = useState(settings.maxChatMessages);
  const [localCrtEffects, setLocalCrtEffects] = useState(settings.crtEffects);
  const [localCrtIntensity, setLocalCrtIntensity] = useState(settings.crtIntensity);
  const [localCrtScanlines, setLocalCrtScanlines] = useState(settings.crtScanlines);
  const [localCrtAnimation, setLocalCrtAnimation] = useState(settings.crtAnimation);
  const [localOverlayFullWidth, setLocalOverlayFullWidth] = useState(settings.overlayFullWidth);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);

  // Sync local state with settings when they change (e.g., from query params)
  useEffect(() => {
    setLocalOpacity(settings.overlayOpacity);
    setLocalChatFeedDirection(settings.chatFeedDirection);
    setLocalMaxChatMessages(settings.maxChatMessages);
    setLocalCrtEffects(settings.crtEffects);
    setLocalCrtIntensity(settings.crtIntensity);
    setLocalCrtScanlines(settings.crtScanlines);
    setLocalCrtAnimation(settings.crtAnimation);
    setLocalOverlayFullWidth(settings.overlayFullWidth);
  }, [settings]);

  // Auto-save function that updates settings
  const autoSave = (newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings);
    
    // Show save indicator temporarily
    setShowSavedIndicator(true);
    setTimeout(() => setShowSavedIndicator(false), 1500);
  };

  const handleOpacityChange = (value: number) => {
    setLocalOpacity(value);
    autoSave({ overlayOpacity: value });
  };

  const handleOverlayFullWidthChange = (value: boolean) => {
    setLocalOverlayFullWidth(value);
    autoSave({ overlayFullWidth: value });
  };

  const handleChatFeedDirectionChange = (value: 'top' | 'bottom') => {
    setLocalChatFeedDirection(value);
    autoSave({ chatFeedDirection: value });
  };

  const handleMaxChatMessagesChange = (value: number) => {
    setLocalMaxChatMessages(value);
    autoSave({ maxChatMessages: value });
  };

  const handleCrtEffectsChange = (checked: boolean) => {
    setLocalCrtEffects(checked);
    autoSave({ crtEffects: checked });
  };

  const handleCrtIntensityChange = (value: 'minimal' | 'subtle' | 'medium') => {
    setLocalCrtIntensity(value);
    autoSave({ crtIntensity: value });
  };

  const handleCrtScanlinesChange = (checked: boolean) => {
    setLocalCrtScanlines(checked);
    autoSave({ crtScanlines: checked });
  };

  const handleCrtAnimationChange = (checked: boolean) => {
    setLocalCrtAnimation(checked);
    autoSave({ crtAnimation: checked });
  };

  // Helper function to create overlay URLs with current settings
  const createOverlayUrl = (path: string) => {
    const url = new URL(path, window.location.origin);
    
    // Add token if available
    if (settings.overlayToken) {
      url.searchParams.set('token', settings.overlayToken);
    }
    if (settings.overlayOpacity !== 0.9) {
      url.searchParams.set('overlayOpacity', settings.overlayOpacity.toString());
    }
    if (settings.overlayFullWidth) {
      url.searchParams.set('overlayFullWidth', 'true');
    }
    if (settings.chatFeedDirection !== 'bottom') {
      url.searchParams.set('chatFeedDirection', settings.chatFeedDirection);
    }
    if (settings.maxChatMessages !== 50) {
      url.searchParams.set('maxChatMessages', settings.maxChatMessages.toString());
    }
    if (settings.crtEffects !== true) {
      url.searchParams.set('crtEffects', settings.crtEffects.toString());
    }
    if (settings.crtIntensity !== 'subtle') {
      url.searchParams.set('crtIntensity', settings.crtIntensity);
    }
    if (settings.crtScanlines !== true) {
      url.searchParams.set('crtScanlines', settings.crtScanlines.toString());
    }
    if (settings.crtAnimation !== true) {
      url.searchParams.set('crtAnimation', settings.crtAnimation.toString());
    }
    
    return url.pathname + url.search;
  };

  const overlayPages = [
    {
      path: createOverlayUrl('/chat'),
      title: 'Chat Overlay',
      description: 'Display Twitch chat messages on your stream',
      icon: '💬'
    },
    {
      path: createOverlayUrl('/clock'),
      title: 'Clock Overlay',
      description: 'Show current time and stream duration',
      icon: '🕐'
    },
    {
      path: createOverlayUrl('/bar'),
      title: 'Info Bar Overlay',
      description: 'Progress bars and stream information',
      icon: '📊'
    }
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

        {/* Settings Section */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="lg">
            <span className="section-title">Settings</span>
          </Title>
          <Stack gap="lg">
            <div>
              <Text size="sm" fw={500} mb="xs">
                Overlay Opacity: {Math.round(localOpacity * 100)}%
              </Text>
              <Slider
                value={localOpacity}
                onChange={handleOpacityChange}
                min={0.1}
                max={1}
                step={0.1}
              />
            </div>

            <Switch
              label="Full Width Overlays (removes padding and borders for edge-to-edge appearance)"
              checked={localOverlayFullWidth}
              onChange={(e) => handleOverlayFullWidthChange(e.currentTarget.checked)}
            />

            <div>
              <Text size="sm" fw={500} mb="xs">
                Chat Feed Direction
              </Text>
              <Radio.Group
                value={localChatFeedDirection}
                onChange={(value) => handleChatFeedDirectionChange(value as 'top' | 'bottom')}
              >
                <Stack gap="xs">
                  <Radio value="bottom" label="Feed from bottom (new messages appear at bottom)" />
                  <Radio value="top" label="Feed from top (new messages appear at top)" />
                </Stack>
              </Radio.Group>
            </div>

            <div>
              <Text size="sm" fw={500} mb="xs">
                Maximum Chat Messages: {localMaxChatMessages}
              </Text>
              <Slider
                value={localMaxChatMessages}
                onChange={handleMaxChatMessagesChange}
                min={0}
                max={100}
                step={1}
                marks={[
                  { value: 10, label: '10' },
                  { value: 50, label: '50' },
                  { value: 100, label: '100' }
                ]}
              />
            </div>

            <Group justify="space-between" mt="md">
              <Button variant="outline" color="brand" onClick={resetSettings}>
                Reset to Defaults
              </Button>
              {showSavedIndicator && (
                <Text c="brand" size="sm" fw={600}>
                  ✓ Saved!
                </Text>
              )}
            </Group>
          </Stack>
        </Paper>

        {/* CRT Visual Effects */}
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
              checked={localCrtEffects}
              onChange={(e) => handleCrtEffectsChange(e.currentTarget.checked)}
            />

            {localCrtEffects && (
              <>
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    CRT Intensity
                  </Text>
                  <Radio.Group
                    value={localCrtIntensity}
                    onChange={(value) => handleCrtIntensityChange(value as 'minimal' | 'subtle' | 'medium')}
                  >
                    <Stack gap="xs">
                      <Radio value="minimal" label="Minimal - Very subtle effects" />
                      <Radio value="subtle" label="Subtle - Balanced for streaming (recommended)" />
                      <Radio value="medium" label="Medium - More pronounced effects" />
                    </Stack>
                  </Radio.Group>
                </div>

                <Switch
                  label="Scanlines"
                  description="Horizontal lines across the display"
                  checked={localCrtScanlines}
                  onChange={(e) => handleCrtScanlinesChange(e.currentTarget.checked)}
                />

                <Switch
                  label="Scan Animation"
                  description="Occasional scanning sweep effect"
                  checked={localCrtAnimation}
                  onChange={(e) => handleCrtAnimationChange(e.currentTarget.checked)}
                />
              </>
            )}
          </Stack>
        </Paper>

        {/* Overlays Section */}
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
                  <Text size="xl" mb="md" ta="center">
                    {overlay.icon}
                  </Text>
                  <Title order={4} mb="xs" ta="center">
                    {overlay.title}
                  </Title>
                  <Text size="sm" c="dimmed" ta="center" mb="md">
                    {overlay.description}
                  </Text>
                  <Text size="xs" c="brand" ta="center" fw={500}>
                    Open Overlay →
                  </Text>
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
              <List.Item>Configure your settings above (they save automatically as you type)</List.Item>
              <List.Item>Click on an overlay to open it in a new tab with your current settings</List.Item>
              <List.Item>Copy the URL and add it as a Browser Source in OBS</List.Item>
              <List.Item>Adjust the size and position in OBS as needed</List.Item>
            </List>
            
            <Paper p="md" radius="sm" withBorder className="tip-paper">
              <Text fw={600} mb="xs">Tip:</Text>
              <Text size="sm" mb="sm">
                Settings are automatically applied to overlay URLs and persist across sessions. 
                You can also override any setting by adding URL parameters like:
              </Text>
              <Code block>?token=your_overlay_token&overlayOpacity=0.8</Code>
            </Paper>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
};

export default MainPage;
