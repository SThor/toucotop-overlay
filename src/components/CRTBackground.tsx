import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import './CRTBackground.css';

const CRTBackground: React.FC = () => {
  const { settings } = useSettings();

  if (settings.theme !== 'crt') {
    return null;
  }

  const { intensity, scanlines, animation } = settings.themeSettings.crt;

  return (
    <div className={`crt-background crt-intensity-${intensity}`}>
      {/* Main CRT glow container */}
      <div className="crt-glow" />

      {/* Static scanlines */}
      {scanlines && <div className="crt-scanlines" />}

      {/* Animated scan sweep */}
      {animation && <div className="crt-scan-sweep" />}
    </div>
  );
};

export default CRTBackground;
