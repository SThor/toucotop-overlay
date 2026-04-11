import { useEffect, useRef, useState } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

interface Dims { w: number; h: number; }

export default function ShaderTestPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [maskImg, setMaskImg] = useState<HTMLImageElement | null>(null);

  // Load the tribal image as the LiquidMetal mask
  useEffect(() => {
    const img = new Image();
    img.onload = () => setMaskImg(img);
    img.src = '/tribal.png';
  }, []);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setDims({ w: Math.round(w), h: Math.round(h) });
    });
    ro.observe(el);
    const { width: w, height: h } = el.getBoundingClientRect();
    setDims({ w: Math.round(w), h: Math.round(h) });
    return () => ro.disconnect();
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#030305',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '80vw', maxWidth: 900, aspectRatio: '2 / 1' }}
      >
        {maskImg && dims && (
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
    </div>
  );
}
