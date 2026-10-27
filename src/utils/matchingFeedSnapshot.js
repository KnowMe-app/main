import { readTimedCacheEntry, writeTimedCacheEntry } from './matchingCachePolicy';

/**
 * Остання показана дека стрічки — у памʼяті пристрою, а не лише вкладки.
 *
 * Знімок у памʼяті JS (`lastFeedSnapshot` у `Matching`) робив миттєвим
 * повернення з картки чи форми, але перезавантаження сторінки його стирало, і
 * стрічка знову чекала входу Firebase, власної анкети й реакцій, перш ніж
 * узагалі зазирнути в кеш. Тут лежать самі id деки й читач, якому її показали;
 * картки складаються з кеша карток (`composeCachedCards`), тож контактів тут
 * немає й бути не може (`sanitizeMatchingCardForCache`).
 *
 * Ключ під префіксом `cardsCache:` навмисно: його стирає той самий скид кеша
 * матчингу (`isMatchingLocalStorageCacheKey`) — «Почати стрічку заново» і
 * зміна ролі, — інакше скинута дека поверталась би звідси.
 */
export const MATCHING_FEED_SNAPSHOT_KEY = 'cardsCache:matchingFeedSnapshot';
const MAX_SNAPSHOT_IDS = 200;

export const writePersistedFeedSnapshot = ({ ownerId, ids } = {}) => {
  const owner = String(ownerId || '').trim();
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))].slice(0, MAX_SNAPSHOT_IDS);
  if (!owner || !list.length) return;
  writeTimedCacheEntry(MATCHING_FEED_SNAPSHOT_KEY, { ownerId: owner, ids: list });
};

export const readPersistedFeedSnapshot = ownerId => {
  const owner = String(ownerId || '').trim();
  if (!owner) return null;
  const entry = readTimedCacheEntry(MATCHING_FEED_SNAPSHOT_KEY);
  if (!entry || entry.ownerId !== owner || !Array.isArray(entry.ids) || !entry.ids.length) return null;
  return { ownerId: owner, ids: entry.ids.map(String), cachedAt: entry.cachedAt };
};

export const clearPersistedFeedSnapshot = () => {
  try {
    localStorage.removeItem(MATCHING_FEED_SNAPSHOT_KEY);
  } catch {
    // нічого: без `localStorage` і знімка немає
  }
};
