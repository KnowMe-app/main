import { useEffect, useCallback } from 'react';

export const useAutoResize = (ref, value) => {
  const autoResize = useCallback(textarea => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoResize(ref.current);
  }, [ref, value, autoResize]);

  return autoResize;
};
