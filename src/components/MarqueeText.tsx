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

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      const diff = inner.scrollWidth - outer.clientWidth;
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

  const duration = overflow > 0 ? Math.max(6, overflow / 40) : 0; // ~40px/s, min 6s

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', textAlign: overflow > 0 ? 'left' : undefined }}
    >
      <span
        ref={innerRef}
        style={
          overflow > 0
            ? {
                display: 'inline-block',
                animation: `marquee-scroll ${duration}s linear infinite`,
                '--marquee-distance': `-${overflow + 32}px`,
              } as CSSProperties
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
};

export default MarqueeText;
