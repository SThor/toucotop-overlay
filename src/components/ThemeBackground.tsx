import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import CRTBackground from './CRTBackground';
import Y2KBackground from './Y2KBackground';
import AnimatedBackground from './AnimatedBackground';

const ThemeBackground: React.FC = () => {
  const { settings } = useSettings();

  if (settings.theme === 'crt') return <CRTBackground />;
  if (settings.theme === 'y2k') return <Y2KBackground />;
  return <AnimatedBackground />;
};

export default ThemeBackground;
