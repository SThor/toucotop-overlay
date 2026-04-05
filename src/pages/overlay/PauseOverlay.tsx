import React, { useEffect, useState } from 'react';
import { MeshGradient, LiquidMetal } from '@paper-design/shaders-react';
import { useSettings } from '../../contexts/SettingsContext';
import ThemeBackground from '../../components/ThemeBackground';
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
      // Measure actual ink bounds on all four sides so no glyph stroke is clipped.
      // PAD also absorbs the chromatic aberration shift from the LiquidMetal shader.
      const metrics = ctx.measureText(text);
      const PAD = 80;
      const xOrigin = Math.ceil(metrics.actualBoundingBoxLeft) + PAD;
      const yOrigin = Math.ceil(metrics.actualBoundingBoxAscent) + PAD;
      const w = xOrigin + Math.ceil(metrics.actualBoundingBoxRight) + PAD;
      const h = yOrigin + Math.ceil(metrics.actualBoundingBoxDescent) + PAD;
      canvas.width = w;
      canvas.height = h;
      // Re-apply font after canvas resize (resize resets context state)
      ctx.font = `400 ${FONT_SIZE}px UnifrakturMaguntia`;
      ctx.fillStyle = 'white';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, xOrigin, yOrigin);
      if (cancelled) return;
      const img = new Image();
      img.onload = () => { if (!cancelled) setMask({ img, w, h }); };
      img.src = canvas.toDataURL('image/png');
    }).catch(() => { /* font unavailable — mask stays null, fallback text renders */ });

    let cancelled = false;
    return () => { cancelled = true; };
  }, [text]);

  return mask;
}

const PauseOverlay: React.FC = () => {
  const { settings } = useSettings();
  const theme = settings.theme;
  const token = settings.overlayToken;
  const [channelName, setChannelName] = useState<string>('');
  const titleMask = useFrakturMask('Be Right Back');

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let cancelled = false;
    fetch(`/auth/status?token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<{ authenticated: boolean; displayName?: string }>)
      .then((data) => {
        if (!cancelled && data.authenticated && data.displayName)
          setChannelName(data.displayName);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        /* silently ignore — barcode stays empty */
      });
    return () => { cancelled = true; controller.abort(); };
  }, [token]);

  return (
    <div
      className={`pause-scene${theme === 'crt' ? ' crt-active' : ''}${theme === 'y2k' ? ' y2k-active' : ''}`}
    >
      {/* Y2K: custom MeshGradient fullscreen base */}
      {theme === 'y2k' && (
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
      )}

      {/* CRT: scanline/glow overlay */}
      {theme === 'crt' && <ThemeBackground />}

      {/* Y2K: dark centre vignette so text pops */}
      {theme === 'y2k' && <div className="pause-vignette" />}

      {/* Centred content stack */}
      <div className="pause-content">
        {theme === 'y2k' ? (
          titleMask ? (
            <div
              className="pause-title-wrapper"
              style={{ aspectRatio: `${titleMask.w} / ${titleMask.h}` }}
            >
              <LiquidMetal
                width="100%"
                height="100%"
                image={titleMask.img}
                colorBack="#03030500"
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
          ) : (
            <h1 className="pause-title-fallback y2k-chrome-text">Be Right Back</h1>
          )
        ) : (
          <h1 className="pause-title">Be Right Back</h1>
        )}

        <p className={`pause-subtitle${theme === 'y2k' ? ' y2k-font-pixel' : ''}`}>
          — stream paused —
        </p>

        {channelName && (
          <p
            className={`pause-barcode${theme === 'y2k' ? ' y2k-font-barcode' : ''}`}
            aria-hidden="true"
          >
            {theme === 'y2k' ? `*${channelName.toUpperCase()}*` : channelName}
          </p>
        )}
      </div>
    </div>
  );
};

export default PauseOverlay;
