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
    const top = size * 0.04;
    const right = size * 0.96;
    const bottom = size * 0.98;
    const left = size * 0.06;
    const upperShoulder = size * 0.30;
    const lowerShoulder = size * 0.70;
    const upperInner = size * 0.19;
    const lowerInner = size * 0.81;

    // Four-point star with sharper inner corners and a slight asymmetry so it
    // feels hand-cut rather than mechanically mirrored.
    ctx.beginPath();
    ctx.moveTo(center, top);
    ctx.lineTo(center + size * 0.11, upperShoulder);
    ctx.lineTo(right, center);
    ctx.lineTo(center + size * 0.15, lowerShoulder);
    ctx.lineTo(center, bottom);
    ctx.lineTo(center - size * 0.14, lowerInner);
    ctx.lineTo(left, center - size * 0.02);
    ctx.lineTo(center - size * 0.12, upperInner);
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
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = overlayRef.current;
    if (!root || settings.theme !== 'y2k') return;

    let frame = 0;
    const apply = (now: number) => {
      const t = now / 1000;
      root.style.setProperty('--border-drift-a', `${Math.sin(t * 0.17) * 0.45}px`);
      root.style.setProperty('--border-drift-b', `${Math.sin(t * 0.23 + 1.3) * 0.35}px`);
      root.style.setProperty('--border-drift-c', `${Math.sin(t * 0.13 + 2.1) * 0.25}px`);
      root.style.setProperty('--border-drift-d', `${Math.sin(t * 0.19 + 0.7) * 0.2}px`);
      frame = window.requestAnimationFrame(apply);
    };

    frame = window.requestAnimationFrame(apply);
    return () => window.cancelAnimationFrame(frame);
  }, [settings.theme]);

  if (isLoadingSettings) return null;

  const bottomOffset = settings.barFloating ? 80 : 60;
  const overlayStyle = {
    opacity: settings.overlayOpacity,
    fontSize: `${settings.fontSize}rem`,
    '--border-bottom-offset': `${bottomOffset}px`,
  } as React.CSSProperties;

  return (
    <div
      ref={overlayRef}
      className={`border-overlay${settings.theme === 'crt' ? ' crt-active' : ''}${settings.theme === 'y2k' ? ' y2k-active' : ''}`}
      style={overlayStyle}
    >
      {settings.theme === 'y2k' ? (
        <svg
          className="border-overlay__frame border-overlay__frame--y2k"
          aria-hidden="true"
          preserveAspectRatio="none"
          viewBox="0 0 1000 1000"
        >
          <rect
            x="10"
            y="10"
            width="980"
            height="980"
            rx="0"
            ry="0"
          />
        </svg>
      ) : (
        <div className="border-overlay__frame" />
      )}

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