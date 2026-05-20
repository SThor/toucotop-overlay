import { useEffect, useRef } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import GlobalAlertLayer from '../../components/GlobalAlertLayer';
import '../../styles/BorderOverlay.css';

interface BorderStarCanvasProps {
  className: string;
  size?: number;
}

type NormalizedPoint = { x: number; y: number };

const STAR_POINTS = {
  top: { x: 0.50, y: 0.12 },
  pairTR: { x: 0.55, y: 0.45 },
  right: { x: 0.88, y: 0.50 },
  pairBR: { x: 0.55, y: 0.55 },
  bottom: { x: 0.50, y: 0.88 },
  pairBL: { x: 0.45, y: 0.55 },
  left: { x: 0.12, y: 0.50 },
  pairTL: { x: 0.45, y: 0.45 },
} as const;

function toPoint(size: number, point: NormalizedPoint) {
  return { x: point.x * size, y: point.y * size };
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

    const top = toPoint(size, STAR_POINTS.top);
    const pairTR = toPoint(size, STAR_POINTS.pairTR);
    const right = toPoint(size, STAR_POINTS.right);
    const pairBR = toPoint(size, STAR_POINTS.pairBR);
    const bottom = toPoint(size, STAR_POINTS.bottom);
    const pairBL = toPoint(size, STAR_POINTS.pairBL);
    const left = toPoint(size, STAR_POINTS.left);
    const pairTL = toPoint(size, STAR_POINTS.pairTL);

    // Four cubic Beziers, one for each arm, with sharp anchor tips.
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.bezierCurveTo(pairTR.x, pairTR.y, pairTR.x, pairTR.y, right.x, right.y);
    ctx.bezierCurveTo(pairBR.x, pairBR.y, pairBR.x, pairBR.y, bottom.x, bottom.y);
    ctx.bezierCurveTo(pairBL.x, pairBL.y, pairBL.x, pairBL.y, left.x, left.y);
    ctx.bezierCurveTo(pairTL.x, pairTL.y, pairTL.x, pairTL.y, top.x, top.y);
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