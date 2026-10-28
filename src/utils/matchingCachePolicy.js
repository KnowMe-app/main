import { CACHE_TTL_MS } from './cacheConstants';

/**
 * Загальне правило кеша матчингу — одне на всі його шари.
 *
 * 1. Спершу дивимось у памʼять пристрою, і якщо там щось є — читаємо його.
 * 2. Перевіряємо свіжість: записане не раніше як `MATCHING_CACHE_TTL_MS` тому.
 * 3. Свіже — працюємо саме з ним і бекенд не питаємо зовсім. Немає або
 *    протухло — один запит до бекенду, і відповідь лягає в кеш з новою міткою.
 *
 * Свіжою бекенд робить лише правка: людина, яка міняє свою чи чужу картку,
 * читає її точково з бази (форма доповнення, редагування, «Мій профіль»), а
 * власні записи (реакції, анкета) кладуться в кеш одразу ж, тож свій кеш
 * правди не губить. Чуже — реакції спільних власників, нові картки в стрічці,
 * права, які видав адмін, — доїжджає щонайпізніше через TTL.
 *
 * Навіщо: на кожне перезавантаження сторінки стрічка читала власну анкету
 * (одинадцять вузлів і лістинг фото), реакції, ключі наборів і голову стрічки
 * адміна — навіть коли все це лежало в браузері з попереднього разу. Помножене
 * на кількість читачів, це і було навантаження на бекенд.
 *
 * Нотатки (`MATCHING_COMMENTS_CACHE_TTL_MS`) колись були винятком на десять
 * хвилин — тепер ті самі шість годин: чату тут немає, а власна нотатка лягає
 * в кеш одразу після запису (`rememberCommentWrite`). Так само живуть
 * контакти (`utils/matchingContactsCache`), дати «Відкласти», анкети «лише для
 * вподобаних» і публічні відгуки (`utils/matchingTimedStore`).
 */
export const MATCHING_CACHE_TTL_MS = CACHE_TTL_MS;

const toTimestamp = value => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const isMatchingCacheFresh = (cachedAt, { now = Date.now(), ttlMs = MATCHING_CACHE_TTL_MS } = {}) => {
  const at = toTimestamp(cachedAt);
  return at > 0 && now - at <= ttlMs;
};

/**
 * Запис із міткою часу в `localStorage` — для дрібних шарів, у яких немає
 * власного сховища (ключі наборів, знімок деки). Зіпсований чи заблокований
 * `localStorage` коштує лише запиту до бекенду, а не помилки на екрані.
 */
export const readTimedCacheEntry = (key, { now = Date.now(), ttlMs = MATCHING_CACHE_TTL_MS } = {}) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!isMatchingCacheFresh(parsed.cachedAt, { now, ttlMs })) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeTimedCacheEntry = (key, value, { now = Date.now() } = {}) => {
  if (!key || !value || typeof value !== 'object') return;
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, cachedAt: now }));
  } catch {
    // переповнений `localStorage`: наступний раз просто спитаємо бекенд
  }
};

export const removeCacheEntriesByPrefix = prefix => {
  if (!prefix) return;
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // нічого: без `localStorage` і кеша немає
  }
};
