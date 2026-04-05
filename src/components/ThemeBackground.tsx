import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import CRTBackground from './CRTBackground';

const LazyY2KBackground = React.lazy(() => import('./Y2KBackground'));

interface Props {
  /**
   * When true the component is being used inside an overlay panel (chat/clock/bar).
   * In panel mode only CRT gets a rendered background component; default and Y2K
   * themes rely purely on CSS for their panel background.
   */
  panelMode?: boolean;
  /**
   * When true (and panelMode is true for y2k), renders the border shader.
   * Set to false for full-width overlays like a non-floating bar.
   */
  showBorder?: boolean;
}

const ThemeBackground: React.FC<Props> = ({ panelMode = false, showBorder = true }) => {
  const { settings } = useSettings();

  // Inside overlay panels: CRT gets its backdrop; Y2K gets its background+border.
  if (panelMode) {
    if (settings.theme === 'crt') return <CRTBackground />;
    if (settings.theme === 'y2k') {
      return (
        <React.Suspense fallback={null}>
          <LazyY2KBackground showBorder={showBorder} />
        </React.Suspense>
      );
    }
    return null;
  }

  // Full-viewport backgrounds (non-panel pages)
  if (settings.theme === 'crt') return <CRTBackground />;
  if (settings.theme === 'y2k') {
    return (
      <React.Suspense fallback={null}>
        <LazyY2KBackground />
      </React.Suspense>
    );
  }
  return null;
};

export default ThemeBackground;
