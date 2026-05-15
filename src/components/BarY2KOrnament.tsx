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
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
              filter: 'grayscale(1) brightness(1.25) contrast(1.2)',
              opacity: 0.9,
            }}
          />
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
              transform: `${flip ? 'scaleX(-1) ' : ''}translateX(1.2px)`,
              filter: 'brightness(1.3) saturate(2.1) hue-rotate(338deg)',
              mixBlendMode: 'screen',
              opacity: 0.45,
            }}
          />
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
              transform: `${flip ? 'scaleX(-1) ' : ''}translateX(-1.2px)`,
              filter: 'brightness(1.25) saturate(1.9) hue-rotate(190deg)',
              mixBlendMode: 'screen',
              opacity: 0.4,
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
