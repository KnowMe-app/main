import {
  CARDS_CACHE_VERSION,
  loadCards,
  loadQueries,
  resetMatchingLocalStorageCache,
  saveCards,
  saveQueries,
} from '../utils/cardIndex';

/*
 * Кеш карток — не сирий `localStorage['cards']`, і сюїти, що так його читали,
 * падали всі разом. Причин три, і жодна не про мок `localStorage`:
 * - картки лежать у версіонованій обгортці (`{ __cacheVersion, ownerId, items }`),
 *   тож `stored['1']` завжди `undefined`, а покладене туди голим обʼєктом кеш
 *   визнає застарілим і стирає;
 * - списки пишуться з затримкою (`saveQueries`, 300 мс), тож одразу після
 *   запису в `localStorage` їх ще немає;
 * - модуль тримає прочитане в памʼяті, і `localStorage.clear()` між тестами
 *   цієї памʼяті не чистить — тест бачив картки попереднього.
 * Тому сюїти читають і кладуть кеш через сам модуль.
 */
export const resetCardsCache = () => {
  localStorage.clear();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  resetMatchingLocalStorageCache('test');
  console.info.mockRestore();
};

export const readCachedCards = () => loadCards();

export const readCachedQueries = () => loadQueries();

/** Кладе картки так, як їх поклав би сам кеш, зберігаючи подані дати. */
export const seedCachedCards = cards => {
  const items = Object.fromEntries(Object.entries(cards).map(([id, card]) => [
    id,
    { userId: id, cacheVersion: CARDS_CACHE_VERSION, ...card },
  ]));
  saveCards(items, { immediate: true });
};

/** Робить запис списку старим, не чіпаючи решти його стану. */
export const expireCachedQuery = (key, cachedAt) => {
  const queries = loadQueries();
  saveQueries({ ...queries, [key]: { ...queries[key], cachedAt } });
};
