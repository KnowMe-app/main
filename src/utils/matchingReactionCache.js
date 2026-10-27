import { isMatchingCacheFresh, removeCacheEntriesByPrefix } from './matchingCachePolicy';

/**
 * Реакції (`multiData/favorites|dislikes/{власник}`) — у памʼяті пристрою.
 *
 * Стрічка тримала на кожного власника реакцій підписку `onValue`, і кожне
 * перезавантаження сторінки читало обидві мапи цілком: в адміна зі спільними
 * власниками — сотні записів. Тепер діє загальне правило кеша матчингу
 * (`utils/matchingCachePolicy`): свіжа мапа береться звідси, і підписки на
 * цього власника немає; протухла чи відсутня — підписка, як було, а кожен її
 * знімок лягає сюди.
 *
 * Без підписки власна реакція не повертається луною з бази, тож її несе сам
 * писач: кожен запис реакції в `config.js` править кеш **до** запиту
 * (`patchCachedReactionValue`) і відкочує на відмові, а стрічка слухає ці
 * правки (`subscribeReactionCachePatches`) так само, як слухала б `onValue`.
 * Мітку часу правка не зсуває: чуже в тій самій мапі (реакції спільного
 * власника з іншого пристрою) однаково перечитається, щойно мине TTL.
 *
 * Привʼязано до читача: ті самі мапи спільного власника читач без доступу не
 * бачить, а вихід з акаунта кеш стирає (`clearReactionCache` у `App`).
 */
const STORAGE_KEY_PREFIX = 'km.matchingReactions.v1:';
const KINDS = new Set(['favorites', 'dislikes']);

const buildKey = viewerId => `${STORAGE_KEY_PREFIX}${viewerId}`;

const readStore = viewerId => {
  if (!viewerId) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(buildKey(viewerId)) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (viewerId, store) => {
  if (!viewerId) return;
  try {
    localStorage.setItem(buildKey(viewerId), JSON.stringify(store));
  } catch {
    // переповнений `localStorage`: наступного разу мапа приїде з бази
  }
};

const isRemovedValue = value => value === undefined || value === null || value === false;

const normalizeMap = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const readFreshReactionSnapshot = (viewerId, ownerId, kind, { now = Date.now() } = {}) => {
  if (!viewerId || !ownerId || !KINDS.has(kind)) return null;
  const entry = readStore(viewerId)?.[ownerId]?.[kind];
  if (!entry || !isMatchingCacheFresh(entry.cachedAt, { now })) return null;
  return { ...normalizeMap(entry.value) };
};

export const writeReactionSnapshot = (viewerId, ownerId, kind, value, { now = Date.now() } = {}) => {
  if (!viewerId || !ownerId || !KINDS.has(kind)) return;
  const store = readStore(viewerId);
  store[ownerId] = { ...(store[ownerId] || {}), [kind]: { cachedAt: now, value: normalizeMap(value) } };
  writeStore(viewerId, store);
};

const patchListeners = new Set();

export const subscribeReactionCachePatches = listener => {
  if (typeof listener !== 'function') return () => {};
  patchListeners.add(listener);
  return () => patchListeners.delete(listener);
};

/**
 * Одна реакція — у вже збережену мапу. Немає мапи — нема чого й правити:
 * наступне читання візьме її з бази цілком. Слухачі чують правку в будь-якому
 * разі: стрічка тримає мапу, взяту з кеша, у власній памʼяті, і та мусить
 * лишатись правдивою, навіть коли сам запис у `localStorage` уже стерто.
 * Повертає попереднє значення (`{ patched: true, previous }`), щоб писач міг
 * відкотити правку на відмові.
 */
export const patchCachedReactionValue = (viewerId, ownerId, kind, cardId, value) => {
  if (!viewerId || !ownerId || !cardId || !KINDS.has(kind)) return { patched: false };
  const store = readStore(viewerId);
  const entry = store[ownerId]?.[kind];
  let result = { patched: false };
  if (entry) {
    const map = { ...normalizeMap(entry.value) };
    result = { patched: true, previous: map[cardId] };
    if (isRemovedValue(value)) delete map[cardId];
    else map[cardId] = value;
    store[ownerId] = { ...store[ownerId], [kind]: { ...entry, value: map } };
    writeStore(viewerId, store);
  }
  patchListeners.forEach(listener => {
    try {
      listener({ viewerId, ownerId, kind, cardId, value: isRemovedValue(value) ? undefined : value });
    } catch (error) {
      console.warn('[matchingReactionCache] слухач правки впав', error);
    }
  });
  return result;
};

export const clearReactionCache = () => removeCacheEntriesByPrefix(STORAGE_KEY_PREFIX);
