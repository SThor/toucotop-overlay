import { useEffect, useState } from 'react';
import type { FC, CSSProperties } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';


// Default ornament size for bar overlay
const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 90;

interface Props {
  /** Mirror the ornament for the right side. */
  flip?: boolean;
  /** Source image path. Defaults to /tribal.png */
  src?: string;
  /** When true, centers the ornament horizontally instead of anchoring to an edge. */
  center?: boolean;
  /** Override rendered width in px. Defaults to 500. */
  width?: number;
  /** Override rendered height in px. Defaults to 90. */
  height?: number;
  /** How far above the top border to push the ornament (as a translateY percentage). Defaults to -65. */
  yOffset?: number;
  /** Render a static chromed image (no WebGL shader) for low-effects mode. */
  staticMode?: boolean;
}


const BarY2KOrnament: FC<Props> = ({
  flip = false,
  src = '/tribal.png',
  center = false,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  yOffset = -65,
  staticMode = false,
}) => {
  const [mask, setMask] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (staticMode) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      if (flip) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, 0, 0, width, height);
      const out = new Image();
      out.onload = () => { if (!cancelled) setMask(out); };
      out.src = canvas.toDataURL('image/png');
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [flip, src, width, height, staticMode]);

  const positionStyle: CSSProperties = center
    ? { left: '50%', transform: `translateX(-50%) translateY(${yOffset}%)` }
    : flip
      ? { right: 0, transform: `translateX(50%) translateY(${yOffset}%)` }
      : { left: 0, transform: `translateX(-50%) translateY(${yOffset}%)` };

  const maskBaseStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    transformOrigin: 'center',
  };

  const staticScaleStyle: CSSProperties = staticMode
    ? {
        transform: 'scale(0.93)',
        transformOrigin: center ? 'center top' : (flip ? 'right top' : 'left top'),
      }
    : {};

  return (
    <div
      style={{
        position: 'absolute',
        width,
        height,
        top: 0,
        ...positionStyle,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {staticMode ? (
        <div style={{ position: 'relative', width: '100%', height: '100%', ...staticScaleStyle }}>
          <img
            src={src}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              transform: flip ? 'scaleX(-1)' : undefined,
              filter: 'grayscale(0.35) brightness(1.08) contrast(1.28) saturate(1.2)',
              opacity: 0.96,
            }}
          />
          <div
            aria-hidden="true"
            style={{
              ...maskBaseStyle,
              transform: flip ? 'scaleX(-1)' : undefined,
              background: 'linear-gradient(112deg, #ffffff 0%, #d6daea 18%, #8f86b0 34%, #72f3ff 50%, #ff6dd7 65%, #f9fbff 82%, #8afcff 100%)',
              backgroundSize: '200% 200%',
              mixBlendMode: 'screen',
              opacity: 0.72,
              animation: 'y2k-iridescent-shift 9s ease-in-out infinite',
            }}
          />
          <div
            aria-hidden="true"
            style={{
              ...maskBaseStyle,
              transform: flip ? 'scaleX(-1)' : undefined,
              background: 'conic-gradient(from 210deg at 50% 45%, #ffffff 0deg, #66f2ff 70deg, #a56bff 135deg, #ff58c5 220deg, #f7fcff 300deg, #ffffff 360deg)',
              backgroundSize: '165% 165%',
              mixBlendMode: 'color-dodge',
              opacity: 0.52,
              filter: 'blur(0.25px) saturate(1.25)',
              animation: 'y2k-prism-drift 11s linear infinite',
            }}
          />
          <div
            aria-hidden="true"
            style={{
              ...maskBaseStyle,
              transform: flip ? 'scaleX(-1)' : undefined,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0) 30%, rgba(0,0,0,0.18) 100%)',
              mixBlendMode: 'soft-light',
              opacity: 0.55,
              animation: 'y2k-specular-pulse 7s ease-in-out infinite',
            }}
          />
        </div>
      ) : (
        mask && (
          <LiquidMetal
            width={width}
            height={height}
            image={mask}
            colorBack="#00000000"
            colorTint="#e0e0e0"
            shape="none"
            shiftRed={0.35}
            shiftBlue={-0.35}
            distortion={0.12}
            softness={0.15}
            contour={0.4}
            angle={70}
            speed={0.4}
            scale={0.9}
            fit="cover"
          />
        )
      )}
    </div>
  );
};

export default BarY2KOrnament;
