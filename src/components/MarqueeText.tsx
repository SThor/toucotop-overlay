import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
}

/**
 * Renders text that scrolls horizontally (marquee-style) only when it overflows
 * its container. Overflow is measured via ResizeObserver. When the text fits, it
 * renders as plain text with no animation.
 */
const MarqueeText = ({ text, className }: MarqueeTextProps) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      const width = inner.scrollWidth;
      const diff = width - outer.clientWidth;
      setTextWidth(width);
      setOverflow(diff > 0 ? diff : 0);
    };

    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(outer);
      ro.observe(inner);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text]);

  const shouldScroll = overflow > 0;
  const gap = 40;
  const scrollDistance = textWidth + gap;
  const duration = shouldScroll ? Math.max(8, scrollDistance / 28) : 0; // ~28px/s, min 8s

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', textAlign: shouldScroll ? 'left' : undefined }}
    >
      {shouldScroll ? (
        <span
          style={
            {
              display: 'inline-flex',
              alignItems: 'center',
              animation: `marquee-scroll ${duration}s ease-in-out infinite`,
              '--marquee-distance': `-${scrollDistance}px`,
            } as CSSProperties
          }
        >
          <span ref={innerRef}>{text}</span>
          <span aria-hidden="true" style={{ marginLeft: `${gap}px` }}>
            {text}
          </span>
        </span>
      ) : (
        <span ref={innerRef}>{text}</span>
      )}
    </div>
  );
};

export default MarqueeText;
