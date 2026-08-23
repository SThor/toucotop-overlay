import { useCallback, useEffect, useRef, useState } from 'react';

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const resetAfterDelay = () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setStatus('idle'), 2000);
    };

    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus('copied');
        resetAfterDelay();
        return;
      }
      throw new Error('Clipboard API not available');
    } catch (err) {
      let fallbackSucceeded = false;

      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        fallbackSucceeded = typeof document.execCommand === 'function' && document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        fallbackSucceeded = false;
      }

      if (fallbackSucceeded) {
        setStatus('copied');
        resetAfterDelay();
      } else {
        // Clipboard operations failed; surface this for debugging and UX.
        // eslint-disable-next-line no-console
        console.error('Failed to copy text to clipboard');
        setStatus('failed');
        resetAfterDelay();
      }
    }
  }, [text]);

  return (
    <button
      className={`copy-btn${status === 'copied' ? ' copied' : ''}${status === 'failed' ? ' failed' : ''}${
        className ? ` ${className}` : ''
      }`}
      onClick={handleCopy}
    >
      {status === 'copied'
        ? '✅ Copied!'
        : status === 'failed'
        ? '❌ Failed to copy'
        : '📋 Copy'}
    </button>
  );
}
