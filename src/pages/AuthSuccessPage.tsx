import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Slider, Switch, Button, Text, Group, Stack, Title, Paper, Radio, Container, Select, TextInput, ActionIcon,
} from '@mantine/core';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CopyButton } from '../components/CopyButton';
import { useSettings } from '../contexts/SettingsContext';
import {
  BAR_SECTION_KEYS,
  type BarSectionKey,
  type BarWidthTokenType,
  defaultOverlaySettings,
} from '../server/shared/overlaySettings';
import '../styles/ServerPages.css';

const BAR_SECTION_META: Record<BarSectionKey, { label: string; shortLabel: string; icon: string }> = {
  clock: { label: 'Current Time', shortLabel: 'Time', icon: '🕐' },
  duration: { label: 'Stream Duration', shortLabel: 'Duration', icon: '⏱️' },
  title: { label: 'Stream Title / Category', shortLabel: 'Title + Category', icon: '🎬' },
  viewers: { label: 'Viewers', shortLabel: 'Viewers', icon: '👥' },
  followers: { label: 'Followers', shortLabel: 'Followers', icon: '❤️' },
  subscribers: { label: 'Subscribers', shortLabel: 'Subscribers', icon: '⭐' },
  recentFollower: { label: 'Last Follower', shortLabel: 'Latest Follow', icon: '🆕' },
  recentSub: { label: 'Last Subscriber', shortLabel: 'Latest Sub', icon: '🎁' },
};

function isBarSectionKey(value: unknown): value is BarSectionKey {
  return typeof value === 'string' && BAR_SECTION_KEYS.includes(value as BarSectionKey);
}

function isBarWidthTokenType(value: unknown): value is BarWidthTokenType {
  return value === 'stretch' || value === 'boost';
}

interface SortableBarOrderItemProps {
  sectionKey: BarSectionKey;
  token: BarWidthTokenType | null;
  onRemove: (key: BarSectionKey) => void;
}

function TokenPill({ tokenType, sourceSection, id }: { tokenType: BarWidthTokenType; sourceSection: BarSectionKey | 'pool'; id: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: {
      dragKind: 'widthToken',
      tokenType,
      sourceSection,
    },
  });
  const style = {
    transform: sourceSection === 'pool' ? undefined : CSS.Transform.toString(transform),
  };
  const label = tokenType === 'stretch' ? 'Stretch' : 'Boost';

  return (
    <span
      ref={setNodeRef}
      style={style}
      className={`bar-token-pill bar-token-${tokenType}${isDragging ? ' is-dragging' : ''}`}
      {...attributes}
      {...listeners}
      title={label}
    >
      {tokenType === 'stretch' ? '↔' : '＋'}
    </span>
  );
}

function SortableBarOrderItem({ sectionKey, token, onRemove }: SortableBarOrderItemProps) {
  const meta = BAR_SECTION_META[sectionKey];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionKey,
    data: { dragKind: 'sectionOrder' },
  });
  const { setNodeRef: setDropZoneRef, isOver } = useDroppable({
    id: `token-zone-${sectionKey}`,
    data: {
      dropType: 'tokenSection',
      sectionKey,
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bar-order-chip${token === 'stretch' ? ' bar-order-chip-stretch' : ''}${isDragging ? ' is-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="bar-chip-top-row">
        <span className="bar-chip-icon" aria-hidden="true">{meta.icon}</span>
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          title="Remove block"
          aria-label={`Remove ${meta.label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(sectionKey);
          }}
        >
          ✕
        </ActionIcon>
      </div>
      <span className="bar-order-chip-label">{meta.shortLabel}</span>
      <div ref={setDropZoneRef} className={`bar-token-zone${isOver ? ' is-over' : ''}`}>
        {token && <TokenPill id={`token-${sectionKey}`} tokenType={token} sourceSection={sectionKey} />}
        {!token && <span className="bar-token-zone-placeholder">Drop token</span>}
      </div>
    </div>
  );
}

function TokenPoolZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: 'token-pool',
    data: { dropType: 'tokenPool' },
  });

  return (
    <div ref={setNodeRef} className={`bar-token-pool${isOver ? ' is-over' : ''}`}>
      <Text size="xs" c="dimmed">Width tokens</Text>
      <div className="bar-token-pool-items">
        <TokenPill id="pool-stretch" tokenType="stretch" sourceSection="pool" />
        <TokenPill id="pool-boost" tokenType="boost" sourceSection="pool" />
      </div>
      <Text size="xs" c="dimmed">Drag into a block to assign, or drag back here to remove.</Text>
    </div>
  );
}

interface SortableBarPriorityItemProps {
  sectionKey: BarSectionKey;
}

function SortableBarPriorityItem({ sectionKey }: SortableBarPriorityItemProps) {
  const meta = BAR_SECTION_META[sectionKey];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sectionKey });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bar-priority-item${isDragging ? ' is-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className="bar-priority-item-rank" aria-hidden="true">☰</span>
      <Text size="sm" className="bar-priority-label">{meta.icon} {meta.shortLabel}</Text>
    </div>
  );
}

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
  username: string;
  displayName: string;
  expiresAt: string;
}

export default function AuthSuccessPage() {
  const [params] = useSearchParams();
  const { settings, persistedSettings, updateSettings, resetSettings, isLoadingSettings } = useSettings();

  // On a fresh OAuth callback the server puts only `token` in the redirect URL.
  // On a direct visit (e.g. bookmarked dashboard) no URL token is present.
  const urlToken = params.get('token');
  const overlayToken = settings.overlayToken;

  console.log('[AuthSuccessPage] mounted — overlayToken:', overlayToken ? '(set)' : '(empty)', '| urlToken:', urlToken ? '(set)' : null);

  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  // Guard synchronously: if there's no token anywhere on first render, show the
  // expired UI immediately rather than flashing valid-looking URLs for one frame.
  const [sessionExpired, setSessionExpired] = useState(() => !overlayToken && !urlToken);
  const [showSaved, setShowSaved] = useState(false);
  const showSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [testAlertStatus, setTestAlertStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const testAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customAlertTitle, setCustomAlertTitle] = useState('Admin message');
  const [customAlertMessage, setCustomAlertMessage] = useState('');
  const [customAlertIcon, setCustomAlertIcon] = useState('📣');
  const [customAlertTarget, setCustomAlertTarget] = useState<string | null>('toucotop');
  const [customAlertTargets, setCustomAlertTargets] = useState<string[]>([]);
  const [isLoadingCustomTargets, setIsLoadingCustomTargets] = useState(false);
  const [canSendTargetedCustomAlert, setCanSendTargetedCustomAlert] = useState(false);
  const [customAlertStatus, setCustomAlertStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const customAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clear pending timers on unmount to avoid setState on an unmounted component
  useEffect(() => () => {
    if (showSavedTimerRef.current) clearTimeout(showSavedTimerRef.current);
    if (testAlertTimerRef.current) clearTimeout(testAlertTimerRef.current);
    if (customAlertTimerRef.current) clearTimeout(customAlertTimerRef.current);
  }, []);

  // Strip all URL params and persist the token via updateSettings (handles both localStorage keys)
  useEffect(() => {
    if (urlToken) {
      updateSettings({ overlayToken: urlToken });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [urlToken, updateSettings]);

  // Fetch auth info from /auth/status (always — no URL params to seed from)
  useEffect(() => {
    if (!overlayToken) {
      setSessionExpired(true);
      return;
    }
    fetch(`/auth/status?token=${encodeURIComponent(overlayToken)}`)
      .then((res) => res.json() as Promise<{ authenticated: boolean; username?: string; displayName?: string; expiresAt?: string }>)
      .then((data) => {
        if (data.authenticated) {
          setAuthInfo({
            username: data.username || '',
            displayName: data.displayName || '',
            expiresAt: data.expiresAt || '',
          });
        } else {
          setSessionExpired(true);
        }
      })
      .catch(() => { /* keep rendering on network error */ });
  }, [overlayToken]);

  useEffect(() => {
    if (!overlayToken) return;

    setIsLoadingCustomTargets(true);
    fetch(`/api/alerts/custom-targets?token=${encodeURIComponent(overlayToken)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('custom-targets request failed');
        }
        return res.json() as Promise<{
          canSendTargetedCustomAlerts?: boolean;
          targets?: string[];
          defaultTarget?: string | null;
        }>;
      })
      .then((data) => {
        const canSend = data.canSendTargetedCustomAlerts === true;
        setCanSendTargetedCustomAlert(canSend);
        if (!canSend) {
          setCustomAlertTargets([]);
          setCustomAlertTarget(null);
          return;
        }

        const targets = (data.targets ?? []).filter((t) => typeof t === 'string' && t.length > 0);
        setCustomAlertTargets(targets);
        if (data.defaultTarget && targets.includes(data.defaultTarget)) {
          setCustomAlertTarget(data.defaultTarget);
        } else if (targets.length > 0) {
          setCustomAlertTarget((prev) => (prev && targets.includes(prev) ? prev : targets[0]));
        } else {
          setCustomAlertTarget(null);
        }
      })
      .catch(() => {
        setCanSendTargetedCustomAlert(false);
        setCustomAlertTargets([]);
        setCustomAlertTarget(null);
      })
      .finally(() => setIsLoadingCustomTargets(false));
  }, [overlayToken]);

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
  const pauseUrl = `${baseUrl}/pause?token=${encodeURIComponent(overlayToken)}`;
  const alertsUrl = `${baseUrl}/alerts?token=${encodeURIComponent(overlayToken)}`;
  const crt = persistedSettings.themeSettings.crt;
  const y2k = persistedSettings.themeSettings.y2k ?? defaultOverlaySettings.themeSettings.y2k;
  const selectedTargetIsValid = !!customAlertTarget && customAlertTargets.includes(customAlertTarget);
  const enabledBarSections = persistedSettings.barSectionOrder.filter((key) => persistedSettings.barSections[key]);
  const priorityOrderedSections = [...enabledBarSections].sort(
    (a, b) => (persistedSettings.barSectionPriority[a] ?? 99) - (persistedSettings.barSectionPriority[b] ?? 99),
  );
  const disabledBarSections = BAR_SECTION_KEYS.filter((key) => !persistedSettings.barSections[key]);
  const [activeWidthToken, setActiveWidthToken] = useState<BarWidthTokenType | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleBarOrderDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const dragKind = active.data.current?.dragKind;

    if (dragKind === 'sectionOrder') {
      if (active.id === over.id) return;
      if (!isBarSectionKey(active.id) || !isBarSectionKey(over.id)) return;

      const from = enabledBarSections.indexOf(active.id);
      const to = enabledBarSections.indexOf(over.id);
      if (from < 0 || to < 0 || from === to) return;

      const reorderedEnabled = arrayMove(enabledBarSections, from, to);
      const reorderedSet = new Set(reorderedEnabled);
      const nextOrder = [
        ...reorderedEnabled,
        ...persistedSettings.barSectionOrder.filter((key) => !reorderedSet.has(key)),
      ];
      save({ barSectionOrder: nextOrder });
      return;
    }

    if (dragKind !== 'widthToken') return;

    const tokenType = active.data.current?.tokenType;
    const sourceSection = active.data.current?.sourceSection as BarSectionKey | 'pool' | undefined;
    if (!isBarWidthTokenType(tokenType) || (!isBarSectionKey(sourceSection) && sourceSection !== 'pool')) return;

    let targetSection: BarSectionKey | 'pool' | null = null;
    const dropType = over.data.current?.dropType;
    if (dropType === 'tokenPool') targetSection = 'pool';
    if (dropType === 'tokenSection') {
      const key = over.data.current?.sectionKey;
      if (isBarSectionKey(key)) targetSection = key;
    }
    if (!targetSection && isBarSectionKey(over.id)) targetSection = over.id;
    if (!targetSection) return;
    if (sourceSection === targetSection) return;

    const nextTokens = { ...persistedSettings.barSectionWidthTokens };

    if (sourceSection === 'pool') {
      if (targetSection === 'pool') return;
      nextTokens[targetSection] = tokenType;
      save({ barSectionWidthTokens: nextTokens });
      return;
    }

    nextTokens[sourceSection] = null;

    if (targetSection !== 'pool') {
      nextTokens[targetSection] = tokenType;
    }

    save({ barSectionWidthTokens: nextTokens });
  };

  const removeBarSection = (key: BarSectionKey) => {
    save({
      barSections: {
        ...persistedSettings.barSections,
        [key]: false,
      },
      barSectionWidthTokens: {
        ...persistedSettings.barSectionWidthTokens,
        [key]: null,
      },
    });
  };

  const handlePriorityDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;
    if (!isBarSectionKey(active.id) || !isBarSectionKey(over.id)) return;

    const from = priorityOrderedSections.indexOf(active.id);
    const to = priorityOrderedSections.indexOf(over.id);
    if (from < 0 || to < 0 || from === to) return;

    const reordered = arrayMove(priorityOrderedSections, from, to);
    const nextPriority = { ...persistedSettings.barSectionPriority };
    reordered.forEach((key, index) => {
      nextPriority[key] = index + 1;
    });
    save({ barSectionPriority: nextPriority });
  };

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
              { label: '⏸ Pause Scene', url: pauseUrl },
              { label: '🔔 Alerts Overlay', url: alertsUrl },
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
              <code>?overlayOpacity=0.9&amp;fontSize=1.2&amp;barFloating=false&amp;theme=y2k&amp;reducedEffects=true&amp;showBarOrnaments=false&amp;hideBackground=true&amp;hideContent=true</code>
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

              <div>
                <Text size="sm" fw={700} mb="xs">Bar</Text>
                <Stack gap="sm">
                  <Switch
                    label="Floating Bar"
                    description="Bar overlay appears as a centered floating pill instead of full-width"
                    checked={persistedSettings.barFloating}
                    onChange={(e) => save({ barFloating: e.currentTarget.checked })}
                  />

                  <div>
                    <Text size="xs" fw={600} mb={4}>Bar Order (left to right)</Text>
                    <Text size="xs" c="dimmed" mb="xs">
                      Drag blocks directly in this lane to match the real bar layout. Stretch tokens increase expansion, Boost tokens increase preferred width.
                    </Text>
                    {enabledBarSections.length === 0 ? (
                      <Text size="xs" c="dimmed">No blocks enabled. Add one below.</Text>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={(event) => {
                          const tokenType = event.active.data.current?.tokenType;
                          if (isBarWidthTokenType(tokenType)) setActiveWidthToken(tokenType);
                        }}
                        onDragCancel={() => setActiveWidthToken(null)}
                        onDragEnd={(event) => {
                          handleBarOrderDragEnd(event);
                          setActiveWidthToken(null);
                        }}
                      >
                        <SortableContext items={enabledBarSections} strategy={horizontalListSortingStrategy}>
                          <div className="bar-order-lane">
                            {enabledBarSections.map((key) => (
                              <SortableBarOrderItem
                                key={key}
                                sectionKey={key}
                                token={persistedSettings.barSectionWidthTokens[key]}
                                onRemove={removeBarSection}
                              />
                            ))}
                          </div>
                        </SortableContext>
                        <TokenPoolZone />
                        <DragOverlay>
                          {activeWidthToken && <span className={`bar-token-pill bar-token-${activeWidthToken} is-overlay`}>{activeWidthToken === 'stretch' ? '↔' : '＋'}</span>}
                        </DragOverlay>
                      </DndContext>
                    )}
                  </div>

                  {disabledBarSections.length > 0 && (
                    <div className="bar-section-add-zone">
                      <Text size="xs" c="dimmed" mb={6}>Add block</Text>
                      <Group gap="xs" wrap="wrap">
                        {disabledBarSections.map((key) => (
                          <Button
                            key={key}
                            size="compact-xs"
                            variant="light"
                            onClick={() => {
                              const nextOrder = [...persistedSettings.barSectionOrder.filter((v) => v !== key), key];
                              save({
                                barSectionOrder: nextOrder,
                                barSections: {
                                  ...persistedSettings.barSections,
                                  [key]: true,
                                },
                              });
                            }}
                          >
                            + {BAR_SECTION_META[key].label}
                          </Button>
                        ))}
                      </Group>
                    </div>
                  )}

                  <div>
                    <Text size="xs" fw={600} mb={4}>Visibility Priority</Text>
                    <Text size="xs" c="dimmed" mb="xs">
                      Drag to rank importance from top to bottom. Top items stay visible the longest when space gets tight.
                    </Text>
                    {priorityOrderedSections.length > 0 && (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handlePriorityDragEnd}
                      >
                        <SortableContext items={priorityOrderedSections} strategy={verticalListSortingStrategy}>
                          <div className="bar-priority-list">
                            {priorityOrderedSections.map((key) => (
                              <SortableBarPriorityItem key={key} sectionKey={key} />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>
                </Stack>
              </div>

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

              {/* Pause overlay text */}
              <TextInput
                label="Pause title"
                description="Main heading shown on the pause scene. Clear to reset to default."
                placeholder={defaultOverlaySettings.pauseTitle}
                value={persistedSettings.pauseTitle}
                onChange={(e) => save({ pauseTitle: e.currentTarget.value })}
              />
              <TextInput
                label="Pause subtitle"
                description="Secondary line shown below the pause title. Clear to reset to default."
                placeholder={defaultOverlaySettings.pauseSubtitle}
                value={persistedSettings.pauseSubtitle}
                onChange={(e) => save({ pauseSubtitle: e.currentTarget.value })}
              />
              <Switch
                label="Hide background"
                description="Hide the theme background (shader/CRT effects). Use with a second browser source to split background and content in OBS."
                checked={persistedSettings.hideBackground}
                onChange={(e) => save({ hideBackground: e.currentTarget.checked })}
              />
              <Switch
                label="Hide content"
                description="Hide the foreground content (title, subtitle, decoration). Use with a second browser source to split content from the background in OBS."
                checked={persistedSettings.hideContent}
                onChange={(e) => save({ hideContent: e.currentTarget.checked })}
              />

              <Group justify="space-between" mt="sm">
                <Button variant="light" onClick={resetSettings}>
                  Reset to Defaults
                </Button>
                {showSaved && <Text c="violet" size="sm" fw={600}>✓ Saved!</Text>}
              </Group>
            </Stack>
          )}
        </Paper>

        {/* Test Alerts */}
        <Paper p="xl" radius="md" withBorder shadow="sm">
          <Title order={2} mb="sm">
            <span className="section-title">🔔 Test Alerts</span>
          </Title>
          <Text size="sm" c="dimmed" mb="lg">
            Fire a test alert to the <strong>Alerts Overlay</strong> browser source. Make sure the
            overlay is open in OBS (or in a separate browser tab) before sending.
          </Text>
          <Group gap="xs" wrap="wrap">
            {([
              { type: 'follow', label: '❤️ Follow' },
              { type: 'subscribe', label: '⭐ Subscribe' },
              { type: 'resubscribe', label: '🌟 Resub' },
              { type: 'gift_sub', label: '🎁 Gift Sub' },
              { type: 'cheer', label: '💎 Cheer' },
              { type: 'raid', label: '⚔️ Raid' },
              { type: 'hype_train_begin', label: '🚂 Hype Train' },
            ] as const).map(({ type, label }) => (
              <Button
                key={type}
                variant="light"
                size="xs"
                disabled={testAlertStatus === 'sending'}
                onClick={async () => {
                  setTestAlertStatus('sending');
                  try {
                    const res = await fetch('/api/alerts/trigger', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ token: overlayToken, type }),
                    });
                    setTestAlertStatus(res.ok ? 'ok' : 'error');
                  } catch {
                    setTestAlertStatus('error');
                  }
                  if (testAlertTimerRef.current) clearTimeout(testAlertTimerRef.current);
                  testAlertTimerRef.current = setTimeout(() => setTestAlertStatus('idle'), 2000);
                }}
              >
                {label}
              </Button>
            ))}
          </Group>
          {testAlertStatus === 'ok' && <Text c="green" size="xs" mt="xs">✓ Alert sent!</Text>}
          {testAlertStatus === 'error' && <Text c="red" size="xs" mt="xs">Failed to send alert. Is the server running?</Text>}

          {canSendTargetedCustomAlert && (
            <>
              <Text size="sm" c="dimmed" mt="md" mb="xs">
                Special sender mode: send a custom alert to any authenticated channel.
              </Text>
              <Stack gap="xs">
                <Select
                  label="Target channel"
                  placeholder={isLoadingCustomTargets ? 'Loading channels...' : 'Select a channel'}
                  data={customAlertTargets.map((u) => ({ value: u, label: u }))}
                  value={customAlertTarget}
                  onChange={setCustomAlertTarget}
                  searchable
                  disabled={isLoadingCustomTargets || customAlertStatus === 'sending'}
                  nothingFoundMessage="No authenticated channels found"
                />
                <TextInput
                  label="Custom alert title"
                  value={customAlertTitle}
                  onChange={(e) => setCustomAlertTitle(e.currentTarget.value)}
                  placeholder="Enter alert title"
                  maxLength={120}
                />
                <TextInput
                  label="Message (optional)"
                  value={customAlertMessage}
                  onChange={(e) => setCustomAlertMessage(e.currentTarget.value)}
                  placeholder="Enter optional message"
                  maxLength={200}
                />
                <TextInput
                  label="Icon (optional)"
                  value={customAlertIcon}
                  onChange={(e) => setCustomAlertIcon(e.currentTarget.value)}
                  placeholder="📣"
                  maxLength={8}
                />
                <Group justify="flex-start">
                  <Button
                    size="xs"
                    disabled={
                      customAlertStatus === 'sending'
                      || customAlertTitle.trim().length === 0
                      || !selectedTargetIsValid
                    }
                    onClick={async () => {
                      if (!selectedTargetIsValid || !customAlertTarget) {
                        setCustomAlertStatus('error');
                        return;
                      }

                      setCustomAlertStatus('sending');
                      try {
                        const res = await fetch('/api/alerts/custom', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            token: overlayToken,
                            targetUsername: customAlertTarget,
                            title: customAlertTitle,
                            message: customAlertMessage,
                            icon: customAlertIcon,
                          }),
                        });
                        setCustomAlertStatus(res.ok ? 'ok' : 'error');
                      } catch {
                        setCustomAlertStatus('error');
                      }
                      if (customAlertTimerRef.current) clearTimeout(customAlertTimerRef.current);
                      customAlertTimerRef.current = setTimeout(() => setCustomAlertStatus('idle'), 2500);
                    }}
                  >
                    Send custom alert
                  </Button>
                </Group>
                {customAlertStatus === 'ok' && (
                  <Text c="green" size="xs">✓ Custom alert sent to {customAlertTarget}.</Text>
                )}
                {customAlertStatus === 'error' && (
                  <Text c="red" size="xs">Custom alert failed or was not authorized.</Text>
                )}
              </Stack>
            </>
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
                  { value: 'default', label: 'Default' },
                  { value: 'crt', label: 'CRT effects' },
                  { value: 'y2k', label: 'Gothic Techno (Y2K)' },
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
              {persistedSettings.theme === 'y2k' && (
                <>
                  <Switch
                    label="Reduced effects"
                    description="Use static ornaments and title treatment instead of animated shader effects for better OBS stability."
                    checked={y2k.reducedEffects}
                    onChange={(e) => save({ themeSettings: { y2k: { reducedEffects: e.currentTarget.checked } } as typeof persistedSettings.themeSettings })}
                  />
                  <Switch
                    label="Show bar ornaments"
                    description="Show decorative Y2K ornaments on the bar overlay. Disable this when using the border overlay instead."
                    checked={y2k.showBarOrnaments}
                    onChange={(e) => save({ themeSettings: { y2k: { showBarOrnaments: e.currentTarget.checked } } as typeof persistedSettings.themeSettings })}
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
