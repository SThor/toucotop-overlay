import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import './CRTBackground.css';

interface CRTBackgroundProps {
  intensity?: 'minimal' | 'subtle' | 'medium';
  enableScanlines?: boolean;
  enableAnimation?: boolean;
}

const CRTBackground: React.FC<CRTBackgroundProps> = ({
  intensity,
  enableScanlines,
  enableAnimation
}) => {
  const { settings } = useSettings();
  
  // Use props or fall back to settings
  const effectIntensity = intensity || settings.crtIntensity;
  const showScanlines = enableScanlines !== undefined ? enableScanlines : settings.crtScanlines;
  const showAnimation = enableAnimation !== undefined ? enableAnimation : settings.crtAnimation;

  if (!settings.crtEffects) {
    return null;
  }

  return (
    <div className={`crt-background crt-intensity-${effectIntensity}`}>
      {/* Main CRT glow container */}
      <div className="crt-glow" />
      
      {/* Static scanlines */}
      {showScanlines && <div className="crt-scanlines" />}
      
      {/* Animated scan sweep */}
      {showAnimation && <div className="crt-scan-sweep" />}
      
      {/* Chromatic aberration overlay */}
      <div className="crt-aberration" />
    </div>
  );
};

export default CRTBackground;
