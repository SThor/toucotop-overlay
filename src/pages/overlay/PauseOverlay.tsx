import React, { useEffect, useState } from 'react';
import { MeshGradient, LiquidMetal } from '@paper-design/shaders-react';
import { useSettings } from '../../contexts/SettingsContext';
import '../../styles/Y2KTheme.css';
import './PauseOverlay.css';
import '@fontsource/unifrakturmaguntia/400.css';
import '@fontsource-variable/climate-crisis/index.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/libre-barcode-39-extended-text/400.css';

interface TextMask {
  img: HTMLImageElement;
  w: number;
  h: number;
}

function useFrakturMask(text: string): TextMask | null {
  const [mask, setMask] = useState<TextMask | null>(null);

  useEffect(() => {
    document.fonts.load('400 200px "UnifrakturMaguntia"').then(() => {
      const FONT_SIZE = 200;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = `400 ${FONT_SIZE}px UnifrakturMaguntia`;
      const w = Math.ceil(ctx.measureText(text).width) + 60;
      const h = Math.ceil(FONT_SIZE * 1.4);
      canvas.width = w;
      canvas.height = h;
      // Re-apply font after canvas resize (resize resets context state)
      ctx.font = `400 ${FONT_SIZE}px UnifrakturMaguntia`;
      ctx.fillStyle = 'white';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, 30, FONT_SIZE);
      const img = new Image();
      img.onload = () => setMask({ img, w, h });
      img.src = canvas.toDataURL('image/png');
    });
  }, [text]);

  return mask;
}

const PauseOverlay: React.FC = () => {
  const { settings } = useSettings();
  const token = settings.overlayToken;
  const [channelName, setChannelName] = useState<string>('');
  const titleMask = useFrakturMask('Be Right Back');

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
        {titleMask && (
          <div
            className="pause-title-wrapper"
            style={{ aspectRatio: `${titleMask.w} / ${titleMask.h}` }}
          >
            <LiquidMetal
              width="100%"
              height="100%"
              image={titleMask.img}
              colorBack="#030305"
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
          </div>
        )}

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

export default PauseOverlay;
