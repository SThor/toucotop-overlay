import { useEffect, useRef, useState } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

interface Dims { w: number; h: number; }

const Y2KDivider: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [maskImg, setMaskImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setMaskImg(img);
    img.src = '/tribal.png';
  }, []);

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
      style={{ width: '100%', height: 36, flexShrink: 0, pointerEvents: 'none' }}
    >
      {maskImg && dims && dims.w > 0 && (
        <LiquidMetal
          width={dims.w}
          height={dims.h}
          image={maskImg}
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
          fit="contain"
        />
      )}
    </div>
  );
};

export default Y2KDivider;
