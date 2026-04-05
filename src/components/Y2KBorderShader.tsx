import { useEffect, useRef, useState } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

interface Props {
  /** Must match the CSS border-radius of the containing overlay box. */
  borderRadius?: number;
  /** Visual thickness of the rendered border in pixels (at canvas resolution). */
  thickness?: number;
}

const Y2KBorderShader: React.FC<Props> = ({ borderRadius = 16, thickness = 3 }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [maskImg, setMaskImg] = useState<HTMLImageElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    // Observe the *parent* element so we get an accurate size immediately on
    // mount rather than waiting for the absolutely-positioned wrapper to relayout.
    const parent = wrapperRef.current?.parentElement;
    if (!parent) return;

    const draw = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      setDims({ w, h });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = thickness;
      const r = Math.min(borderRadius, w / 2, h / 2);
      const half = thickness / 2;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(half, half, w - thickness, h - thickness, r);
      } else {
        ctx.rect(half, half, w - thickness, h - thickness);
      }
      ctx.stroke();
      const img = new Image();
      img.onload = () => setMaskImg(img);
      img.src = canvas.toDataURL('image/png');
    };

    // Measure immediately, then keep it up to date.
    const { width, height } = parent.getBoundingClientRect();
    draw(width, height);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(([entry]) => {
        const { width: w, height: h } = entry.contentRect;
        draw(w, h);
      });
      ro.observe(parent);
      return () => ro.disconnect();
    }
  }, [borderRadius, thickness]);

  return (
    // overflow: hidden clips any sub-pixel bleed from the shader's chromatic shift.
    <div
      ref={wrapperRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}
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
  );
};

export default Y2KBorderShader;
