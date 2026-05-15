import type { CSSProperties, FC } from 'react';
import '../styles/Y2KTheme.css';

interface Props {
  maskSrc: string;
  flip?: boolean;
}

const IridescentMaskedLayers: FC<Props> = ({ maskSrc, flip = false }) => {
  const maskBaseStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    WebkitMaskImage: `url(${maskSrc})`,
    maskImage: `url(${maskSrc})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    transformOrigin: 'center',
    transform: flip ? 'scaleX(-1)' : undefined,
  };

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          ...maskBaseStyle,
          background: 'var(--y2k-iridescent-linear)',
          backgroundSize: '200% 200%',
          mixBlendMode: 'screen',
          opacity: 0.74,
          animation: 'y2k-iridescent-shift 9s ease-in-out infinite',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          ...maskBaseStyle,
          background: 'var(--y2k-iridescent-conic)',
          backgroundSize: '165% 165%',
          mixBlendMode: 'color-dodge',
          opacity: 0.54,
          filter: 'blur(0.25px) saturate(1.25)',
          animation: 'y2k-prism-drift 11s linear infinite',
        }}
      />
    </>
  );
};

export default IridescentMaskedLayers;