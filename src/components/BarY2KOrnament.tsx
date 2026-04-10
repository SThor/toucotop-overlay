import { useEffect, useState } from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';

// Ornament intrinsic size: WIDTH x HEIGHT px.
// Positioned so its horizontal center sits at the bar edge (half off-screen)
// and its vertical center sits at the bar's top border (half above, half inside).
const WIDTH = 300;
const HEIGHT = 90;

interface Props {
  /** Mirror the ornament for the right side. */
  flip?: boolean;
}

const BarY2KOrnament: React.FC<Props> = ({ flip = false }) => {
  const [mask, setMask] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext('2d')!;
      if (flip) {
        ctx.translate(WIDTH, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
      const out = new Image();
      out.onload = () => setMask(out);
      out.src = canvas.toDataURL('image/png');
    };
    img.src = '/tribal.png';
  }, [flip]);

  return (
    <div
      style={{
        position: 'absolute',
        width: WIDTH,
        height: HEIGHT,
        top: 0,
        ...(flip
          ? { right: 0, transform: 'translateX(50%) translateY(-50%)' }
          : { left: 0, transform: 'translateX(-50%) translateY(-50%)' }),
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {mask && (
        <LiquidMetal
          width={WIDTH}
          height={HEIGHT}
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
