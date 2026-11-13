/**
 * Що стрічці повторити, коли звʼязок повернувся (подія `online` у `Matching`).
 *
 * - Порожня дека з помилкою — стрічку заново, але **лише коли відкрита сама
 *   стрічка**: помилка лишається в стані й після переходу в колекцію чи пошук,
 *   а перезавантаження стрічки перемикає режим і замінює видачу.
 * - Недочитаний хвіст — наступну сторінку, за власною позначкою відмови
 *   (`tailFailed`), а не за видимістю кнопки «Показати ще»: відмова сторінки
 *   ту кнопку не вмикає. Пошук хвіст з бази не дочитує — там зсув вікна.
 *
 * @returns {'reload-default' | 'retry-tail' | null}
 */
export const resolveOnlineRecovery = ({
  mode,
  loadError,
  hasRows,
  deckHasMore,
  showFeedRetry,
  tailFailed,
} = {}) => {
  if (loadError && !hasRows) return mode === 'default' ? 'reload-default' : null;
  if (mode !== 'search' && deckHasMore && (showFeedRetry || tailFailed)) return 'retry-tail';
  return null;
};
