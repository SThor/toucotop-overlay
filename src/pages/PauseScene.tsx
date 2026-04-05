import React, { useEffect, useState } from 'react';
import { MeshGradient } from '@paper-design/shaders-react';
import { useSettings } from '../contexts/SettingsContext';
import '../styles/Y2KTheme.css';
import './PauseScene.css';
import '@fontsource/unifrakturmaguntia/400.css';
import '@fontsource-variable/climate-crisis/index.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/libre-barcode-39/400.css';

const PauseScene: React.FC = () => {
  const { settings } = useSettings();
  const token = settings.overlayToken;
  const [channelName, setChannelName] = useState<string>('');

  useEffect(() => {
    if (!token) return;
    fetch(`/auth/status?token=${encodeURIComponent(token)}`)
      .then((r) => r.json() as Promise<{ authenticated: boolean; displayName?: string }>)
      .then((data) => {
        if (data.authenticated && data.displayName) setChannelName(data.displayName);
      })
      .catch(() => { /* silently ignore — barcode stays empty */ });
  }, [token]);

  return (
    <div className="pause-scene">
      {/* Hidden SVG filter — reuse drip goo filter */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="pause-drip-filter" x="-20%" y="-20%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* MeshGradient fullscreen base */}
      <div className="pause-shader">
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

      {/* Dark centre vignette so text pops */}
      <div className="pause-vignette" />

      {/* Gothic main text */}
      <div className="pause-content">
        <div className="pause-drip-wrapper">
          <h1
            className="pause-title y2k-glitch"
            data-text="Be Right Back"
          >
            Be Right Back
          </h1>
          {/* Drip blobs */}
          <div className="pause-drips" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
        </div>

        <p className="pause-subtitle y2k-font-pixel">— stream paused —</p>

        {channelName && (
          <p className="pause-barcode y2k-font-barcode" aria-hidden="true">
            *{channelName.toUpperCase()}*
          </p>
        )}
      </div>
    </div>
  );
};

export default PauseScene;
