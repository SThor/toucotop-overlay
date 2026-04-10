import { useEffect, useState } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

// Ornament intrinsic size: WIDTH x HEIGHT px.
// Positioned so its horizontal center sits at the bar edge (half off-screen)
// and its vertical center sits at the bar's top border (half above, half inside).
const WIDTH = 500;
const DEFAULT_HEIGHT = 90;

interface Props {
  /** Mirror the ornament for the right side. */
  flip?: boolean;
  /** Source image path. Defaults to /tribal.png */
  src?: string;
  /** When true, centers the ornament horizontally instead of anchoring to an edge. */
  center?: boolean;
  /** Override rendered height in px. Defaults to 90. */
  height?: number;
  /** How far above the top border to push the ornament (as a translateY percentage). Defaults to -65. */
  yOffset?: number;
}

const BarY2KOrnament: React.FC<Props> = ({
  flip = false,
  src = '/tribal.png',
  center = false,
  height = DEFAULT_HEIGHT,
  yOffset = -65,
}) => {
  const [mask, setMask] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      if (flip) {
        ctx.translate(WIDTH, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, 0, 0, WIDTH, height);
      const out = new Image();
      out.onload = () => setMask(out);
      out.src = canvas.toDataURL('image/png');
    };
    img.src = src;
  }, [flip, src, height]);

  const positionStyle: React.CSSProperties = center
    ? { left: '50%', transform: `translateX(-50%) translateY(${yOffset}%)` }
    : flip
      ? { right: 0, transform: `translateX(50%) translateY(${yOffset}%)` }
      : { left: 0, transform: `translateX(-50%) translateY(${yOffset}%)` };

  return (
    <div
      style={{
        position: 'absolute',
        width: WIDTH,
        height,
        top: 0,
        ...positionStyle,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {mask && (
        <LiquidMetal
          width={WIDTH}
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
      )}
    </div>
  );
};

export default BarY2KOrnament;
