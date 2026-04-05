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
}

const ThemeBackground: React.FC<Props> = ({ panelMode = false }) => {
  const { settings } = useSettings();

  // Inside overlay panels: only CRT needs a rendered backdrop component.
  // Default theme = bare CSS panel; Y2K = CSS + Y2KBorderShader (added by the overlay itself).
  if (panelMode) return settings.theme === 'crt' ? <CRTBackground /> : null;

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
