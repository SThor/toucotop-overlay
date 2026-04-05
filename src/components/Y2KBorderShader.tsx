import { useEffect, useRef, useState } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

interface Props {
  /** Must match the CSS border-radius of the containing overlay box. */
  borderRadius?: number;
  /** Visual thickness of the rendered border in pixels (at canvas resolution). */
  thickness?: number;
}

const Y2KBorderShader: React.FC<Props> = ({ borderRadius = 16, thickness = 3 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [maskImg, setMaskImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const draw = (w: number, h: number) => {
      if (!w || !h) return;
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

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        draw(width, height);
      });
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      const { width, height } = el.getBoundingClientRect();
      draw(width, height);
    }
  }, [borderRadius, thickness]);

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
    >
      {maskImg && (
        <LiquidMetal
          width="100%"
          height="100%"
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
