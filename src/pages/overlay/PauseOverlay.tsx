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
    const FONT_SIZE = 200;
    const FONT_WEIGHT = 400;
    const FONT_FAMILY = 'UnifrakturMaguntia';
    let cancelled = false;
    // Wait for all @font-face rules to be registered (important in OBS/CEF where
    // CSS parsing may lag behind JS execution), then explicitly load the face.
    document.fonts.ready
      .then(() => document.fonts.load(`${FONT_WEIGHT} ${FONT_SIZE}px "${FONT_FAMILY}"`))
      .then(() => {
        const canvas = document.createElement('canvas');
        // cv01 selects the alternate 'k' glyph in UnifrakturMaguntia.
        // Setting font-feature-settings on the canvas element is non-standard
        // for Canvas 2D — the context font shorthand doesn't include it. However,
        // Chromium (used by OBS) appears to pick it up from the element style in
        // some versions. If it has no effect the fallback 'k' glyph is used instead.
        canvas.style.fontFeatureSettings = '"cv01" 1';
        const ctx = canvas.getContext('2d')!;
        ctx.font = `${FONT_WEIGHT} ${FONT_SIZE}px "${FONT_FAMILY}"`;
        // Measure actual ink bounds on all four sides so no glyph stroke is clipped.
        // PAD also absorbs the chromatic aberration shift from the LiquidMetal shader.
        const metrics = ctx.measureText(text);
        const xOrigin = Math.ceil(metrics.actualBoundingBoxLeft);
        const yOrigin = Math.ceil(metrics.actualBoundingBoxAscent);
        const w = xOrigin + Math.ceil(metrics.actualBoundingBoxRight);
        const h = yOrigin + Math.ceil(metrics.actualBoundingBoxDescent);
        canvas.width = w;
        canvas.height = h;
        // Re-apply font after canvas resize (resize resets context state)
        ctx.font = `${FONT_WEIGHT} ${FONT_SIZE}px "${FONT_FAMILY}"`;
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, xOrigin, yOrigin);
        if (cancelled) return;
        const img = new Image();
        img.onload = () => { if (!cancelled) setMask({ img, w, h }); };
        img.src = canvas.toDataURL('image/png');
      }).catch(() => { /* font unavailable — mask stays null, fallback text renders */ });

    return () => { cancelled = true; };
  }, [text]);

  return mask;
}

const PauseOverlay: React.FC = () => {
  const { settings, isLoadingSettings } = useSettings();
  const theme = settings.theme;
  const reducedEffects = settings.themeSettings.y2k.reducedEffects;
  const token = settings.overlayToken;
  const [channelName, setChannelName] = useState<string>('');
  const titleMask = useFrakturMask(settings.pauseTitle);

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

  const hideBackground = settings.hideBackground;
  const hideContent = settings.hideContent;

  if (isLoadingSettings) return null;

  return (
    <div
      className={`pause-scene${theme === 'crt' ? ' crt-active' : ''}${theme === 'y2k' ? ' y2k-active' : ''}${hideBackground ? ' bg-hidden' : ''}`}
    >
      {/* Y2K: custom MeshGradient fullscreen base */}
      {!hideBackground && theme === 'y2k' && (
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
      {!hideBackground && theme === 'crt' && <ThemeBackground />}

      {/* Y2K: dark centre vignette so text pops */}
      {!hideBackground && theme === 'y2k' && <div className="pause-vignette" />}

      {/* Centred content stack */}
      {!hideContent && <div className="pause-content">
        {theme === 'y2k' ? (
          !reducedEffects && titleMask ? (
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
            <h1 className="pause-title-fallback y2k-chrome-text y2k-font-fraktur">{settings.pauseTitle}</h1>
          )
        ) : (
          <h1 className="pause-title">{settings.pauseTitle}</h1>
        )}

        <p className={`pause-subtitle${theme === 'y2k' ? ' y2k-font-pixel' : ''}`}>
          {settings.pauseSubtitle}
        </p>

        {channelName && (
          <p
            className={`pause-barcode${theme === 'y2k' ? ' y2k-font-barcode' : ''}`}
            aria-hidden="true"
          >
            {theme === 'y2k' ? `*${channelName.toUpperCase()}*` : channelName}
          </p>
        )}
      </div>}
    </div>
  );
};

export default PauseOverlay;
