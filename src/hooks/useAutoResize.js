import { useEffect, useCallback } from 'react';

export const useAutoResize = (ref, value) => {
  const autoResize = useCallback(textarea => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    // scrollHeight is content + padding only. With box-sizing: border-box (the app default) the
    // height style must also cover the borders, otherwise the field measures a couple px shorter
    // than its own text and clips the last line's descenders.
    const borderHeight = textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = `${textarea.scrollHeight + (borderHeight > 0 ? borderHeight : 0)}px`;
  }, []);

  useEffect(() => {
    autoResize(ref.current);
  }, [ref, value, autoResize]);

  // The value isn't the only thing that changes how tall the text renders: the field re-wraps
  // when the viewport (and therefore the column) gets narrower, and when the custom webfont
  // finishes loading with different metrics than the fallback it replaced. Both would otherwise
  // leave the field at a stale, too-short height with the overflow clipped.
  useEffect(() => {
    const remeasure = () => autoResize(ref.current);
    window.addEventListener('resize', remeasure);
    if (typeof document !== 'undefined' && document.fonts?.ready?.then) {
      document.fonts.ready.then(remeasure).catch(() => {});
    }
    return () => window.removeEventListener('resize', remeasure);
  }, [ref, autoResize]);

  return autoResize;
};
