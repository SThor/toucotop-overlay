import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

interface Dims { w: number; h: number; }

interface Props {
  /** Render a static chromed divider (no WebGL shader) for low-effects mode. */
  staticMode?: boolean;
}

const Y2KDivider: FC<Props> = ({ staticMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [stretchedMask, setStretchedMask] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (staticMode) return;
    const img = new Image();
    img.onload = () => setSourceImg(img);
    img.src = '/tribal.png';
  }, [staticMode]);

  // Re-draw the source image stretched to exact container dims whenever either changes
  useEffect(() => {
    if (staticMode) return;
    if (!sourceImg || !dims || dims.w <= 0) return;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(sourceImg, 0, 0, dims.w, dims.h);
    const out = new Image();
    out.onload = () => { if (!cancelled) setStretchedMask(out); };
    out.src = canvas.toDataURL('image/png');
    return () => { cancelled = true; };
  }, [sourceImg, dims, staticMode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      setDims({ w: Math.round(w), h: Math.round(h) });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 72, flexShrink: 0, pointerEvents: 'none' }}
    >
      {staticMode ? (
        <div style={{ position: 'relative', width: '100%', height: '100%', transform: 'scaleY(0.9)', transformOrigin: 'center top' }}>
          <img
            src="/tribal.png"
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              filter: 'grayscale(0.35) brightness(1.08) contrast(1.28) saturate(1.2)',
              opacity: 0.96,
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              WebkitMaskImage: 'url(/tribal.png)',
              maskImage: 'url(/tribal.png)',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              transform: 'translateX(1.2px)',
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
              position: 'absolute',
              inset: 0,
              WebkitMaskImage: 'url(/tribal.png)',
              maskImage: 'url(/tribal.png)',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              transform: 'translateX(-1.2px)',
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
              position: 'absolute',
              inset: 0,
              WebkitMaskImage: 'url(/tribal.png)',
              maskImage: 'url(/tribal.png)',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0) 30%, rgba(0,0,0,0.18) 100%)',
              mixBlendMode: 'soft-light',
              opacity: 0.55,
              animation: 'y2k-specular-pulse 7s ease-in-out infinite',
            }}
          />
        </div>
      ) : (
        stretchedMask && dims && dims.w > 0 && (
        <LiquidMetal
          width={dims.w}
          height={dims.h}
          image={stretchedMask}
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

export default Y2KDivider;

