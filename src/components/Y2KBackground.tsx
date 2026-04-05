import React from 'react';
import '../styles/Y2KTheme.css';
import '@fontsource/unifrakturmaguntia/400.css';
import '@fontsource-variable/climate-crisis/index.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/libre-barcode-39-extended-text/400.css';

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
