import { useEffect, useRef } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import GlobalAlertLayer from '../../components/GlobalAlertLayer';
import '../../styles/BorderOverlay.css';

interface BorderStarCanvasProps {
  className: string;
  size?: number;
}

function BorderStarCanvas({ className, size = 44 }: BorderStarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const center = size / 2;
    const arm = size * 0.46;
    const inner = size * 0.15;
    const curve = inner * 1.45;

    // Four-point star built as a rounded-intersection cross.
    ctx.beginPath();
    ctx.moveTo(center, center - arm);
    ctx.quadraticCurveTo(center + inner * 0.4, center - curve, center + inner, center - inner);
    ctx.lineTo(center + arm, center);
    ctx.quadraticCurveTo(center + curve, center + inner * 0.4, center + inner, center + inner);
    ctx.lineTo(center, center + arm);
    ctx.quadraticCurveTo(center - inner * 0.4, center + curve, center - inner, center + inner);
    ctx.lineTo(center - arm, center);
    ctx.quadraticCurveTo(center - curve, center - inner * 0.4, center - inner, center - inner);
    ctx.closePath();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.shadowColor = 'rgba(196, 214, 255, 0.55)';
    ctx.shadowBlur = size * 0.18;
    ctx.fill();
  }, [size]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

const BorderOverlay = () => {
  const { settings, isLoadingSettings } = useSettings();

  if (isLoadingSettings) return null;

  const bottomOffset = settings.barFloating ? 80 : 60;
  const overlayStyle = {
    opacity: settings.overlayOpacity,
    fontSize: `${settings.fontSize}rem`,
    '--border-bottom-offset': `${bottomOffset}px`,
  } as React.CSSProperties;

  return (
    <div
      className={`border-overlay${settings.theme === 'crt' ? ' crt-active' : ''}${settings.theme === 'y2k' ? ' y2k-active' : ''}`}
      style={overlayStyle}
    >
      <div className="border-overlay__frame" />

      {settings.theme === 'y2k' && (
        <>
          <BorderStarCanvas className="border-overlay__star border-overlay__star--top-left" />
          <BorderStarCanvas className="border-overlay__star border-overlay__star--top-right" />
          <BorderStarCanvas className="border-overlay__star border-overlay__star--bottom-left" />
          <BorderStarCanvas className="border-overlay__star border-overlay__star--bottom-right" />
          <BorderStarCanvas className="border-overlay__star border-overlay__star--top-center" size={48} />
        </>
      )}

      <GlobalAlertLayer />
    </div>
  );
};

export default BorderOverlay;