import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import CRTBackground from './CRTBackground';
import AnimatedBackground from './AnimatedBackground';

const LazyY2KBackground = React.lazy(() => import('./Y2KBackground'));

interface Props {
  /**
   * When true the component is being used inside an overlay panel (chat/clock/bar).
   * In Y2K mode the full-viewport LiquidMetal shader is suppressed so the panel
   * can use a plain black background instead; the border is handled separately by
   * Y2KBorderShader. CRT and default themes are unaffected.
   */
  panelMode?: boolean;
}

const ThemeBackground: React.FC<Props> = ({ panelMode = false }) => {
  const { settings } = useSettings();

  if (settings.theme === 'crt') return <CRTBackground />;
  if (settings.theme === 'y2k') {
    if (panelMode) return null;
    return (
      <React.Suspense fallback={<AnimatedBackground />}>
        <LazyY2KBackground />
      </React.Suspense>
    );
  }
  return <AnimatedBackground />;
};

export default ThemeBackground;
