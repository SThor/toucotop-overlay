import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

interface Dims { w: number; h: number; }

const Y2KDivider: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [stretchedMask, setStretchedMask] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSourceImg(img);
    img.src = '/tribal.png';
  }, []);

  // Re-draw the source image stretched to exact container dims whenever either changes
  useEffect(() => {
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
  }, [sourceImg, dims]);

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
      {stretchedMask && dims && dims.w > 0 && (
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
      )}
    </div>
  );
};

export default Y2KDivider;

