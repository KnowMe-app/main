import { useEffect, useState } from 'react';

/**
 * Скільки колонок має стрічка на цьому екрані.
 *
 * Стрічка стояла колонкою в 480 px посеред будь-якого екрана, і на комп'ютері
 * дві третини ширини були порожні — а агенції, для яких стрічка найважливіша,
 * працюють саме з комп'ютера й гортали двісті анкет по одній на висоту
 * вікна. Тепер ширина стає колонками: список — до трьох, галерея — до
 * чотирьох. Межі ті самі, що в `FEED_WIDE_MIN_WIDTH` / `FEED_XWIDE_MIN_WIDTH`
 * у стилях, тож CSS і розкладка галереї кажуть одне й те саме.
 */
export const FEED_WIDE_MIN_WIDTH = 900;
export const FEED_XWIDE_MIN_WIDTH = 1280;

export const resolveFeedColumns = width => {
  const w = Number(width) || 0;
  if (w >= FEED_XWIDE_MIN_WIDTH) return { list: 3, gallery: 4 };
  if (w >= FEED_WIDE_MIN_WIDTH) return { list: 2, gallery: 3 };
  if (w < 600) return { list: 1, gallery: 1 };
  return { list: 1, gallery: 2 };
};

const readViewportWidth = () => (typeof window === 'undefined' ? 0 : window.innerWidth);

export const useFeedColumns = () => {
  const [columns, setColumns] = useState(() => resolveFeedColumns(readViewportWidth()));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () => {
      const next = resolveFeedColumns(readViewportWidth());
      setColumns(previous => (
        previous.list === next.list && previous.gallery === next.gallery ? previous : next
      ));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return columns;
};

export default useFeedColumns;
