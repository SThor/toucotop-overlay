import React from 'react';
import { LiquidMetal } from '@paper-design/shaders-react';
import '../styles/Y2KTheme.css';
import '@fontsource/unifrakturmaguntia/400.css';
import '@fontsource-variable/climate-crisis/index.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/libre-barcode-39/400.css';

const Y2KBackground: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {/* Hidden SVG filter definitions — drip effect used by overlay text */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="y2k-drip-filter" x="-20%" y="-20%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* LiquidMetal fills the full canvas as the base layer */}
      <LiquidMetal
        width="100%"
        height="100%"
        colorBack="#030305"
        colorTint="#c8c8c8"
        shape="none"
        shiftRed={0.35}
        shiftBlue={-0.35}
        distortion={0.12}
        softness={0.22}
        contour={0.3}
        angle={70}
        speed={0.35}
        scale={0.9}
        fit="cover"
      />

      {/* Colour-dodge cyan + magenta accent layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, transparent 20%, rgba(0,255,204,0.07) 38%, transparent 52%, rgba(255,0,170,0.06) 68%, transparent 82%)',
          backgroundSize: '400% 400%',
          mixBlendMode: 'color-dodge',
          animation: 'y2k-color-sweep 8s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Dark vignette to keep overlay content readable */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(3,3,5,0.55) 78%, rgba(26,0,32,0.88) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export default Y2KBackground;
