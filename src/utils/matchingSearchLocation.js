/**
 * Адреса видачі пошуку — одна на весь застосунок.
 *
 * Форма створення й форма доповнення відкриваються з рядка видачі, і закриття
 * форми має повертати рівно туди: до тих самих знайдених карток, а не на
 * порожній екран, з якого читач мусить шукати вдруге те, що вже знайшов. Щоб
 * «туди» було чим назвати, адреса живе тут, а не двома копіями констант у
 * `Matching.jsx` і в майстерні створення.
 *
 * Запит лежить у двох місцях, і обидва тут навмисні: в адресі — щоб видача
 * пережила перезавантаження, і в `localStorage` — щоб пережила перехід у форму
 * й назад навіть тоді, коли адресу ніхто не передав (наприклад, сторінку форми
 * оновили).
 */
export const MATCHING_SEARCH_QUERY_PARAM = 'q';
export const MATCHING_SEARCH_STORAGE_KEY = 'matchingSearchQuery';
export const MATCHING_PATH = '/matching';

export const readStoredMatchingSearchQuery = () => {
  try {
    return localStorage.getItem(MATCHING_SEARCH_STORAGE_KEY) || '';
  } catch {
    // Заблокований localStorage коштує лише підставленого запиту.
    return '';
  }
};

/** `/matching?q=…` — або просто `/matching`, коли запиту немає. */
export const buildMatchingSearchPath = query => {
  const trimmed = String(query || '').trim();
  if (!trimmed) return MATCHING_PATH;
  return `${MATCHING_PATH}?${MATCHING_SEARCH_QUERY_PARAM}=${encodeURIComponent(trimmed)}`;
};
