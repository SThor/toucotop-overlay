import React from 'react';
import { MeshGradient } from '@paper-design/shaders-react';
import '../styles/Y2KTheme.css';
import '@fontsource/unifrakturmaguntia/400.css';
import '@fontsource-variable/climate-crisis/index.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/libre-barcode-39-extended-text/400.css';

interface Props {
  /** When true, skips the vignette (overlay panel context). */
  panelMode?: boolean;
}

const Y2KBackground: React.FC<Props> = ({ panelMode = false }) => {
  return (
    <div
      className={panelMode ? 'y2k-bg-panel' : undefined}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: -1,
        overflow: 'hidden',
      }}
    >
      {/* MeshGradient base — same palette as PauseOverlay */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <MeshGradient
          width="100%"
          height="100%"
          colors={['#030305', '#1a0020', '#7700ff', '#00ffcc', '#ff00aa']}
          distortion={0.88}
          swirl={0.55}
          grainMixer={0.12}
          grainOverlay={0.06}
          speed={0.18}
          fit="cover"
        />
      </div>

      {/* Dark vignette — only for full-page backgrounds, not overlay panels */}
      {!panelMode && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at center, transparent 50%, rgba(3,3,5,0.55) 78%, rgba(26,0,32,0.88) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};

export default Y2KBackground;
