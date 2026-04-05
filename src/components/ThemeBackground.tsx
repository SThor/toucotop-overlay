import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import CRTBackground from './CRTBackground';
import AnimatedBackground from './AnimatedBackground';

const LazyY2KBackground = React.lazy(() => import('./Y2KBackground'));

const ThemeBackground: React.FC = () => {
  const { settings } = useSettings();

  if (settings.theme === 'crt') return <CRTBackground />;
  if (settings.theme === 'y2k') {
    return (
      <React.Suspense fallback={<AnimatedBackground />}>
        <LazyY2KBackground />
      </React.Suspense>
    );
  }
  return <AnimatedBackground />;
};

export default ThemeBackground;
