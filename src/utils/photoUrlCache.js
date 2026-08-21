import { CACHE_TTL_MS } from './cacheConstants';

/**
 * Кеш URL фото профілів, який переживає перезавантаження сторінки.
 *
 * Порахувати аватар одного профілю коштує рекурсивного `listAll` по
 * `avatar/{userId}` у Storage плюс `getDownloadURL` на кожен файл. Це найдорожча
 * операція на картку, і досі вона повторювалась при кожному відкритті стрічки:
 * `photos` свідомо виключені з кешу карток (`HEAVY_CARD_CACHE_KEYS`), а
 * `photoCacheByUserId` жив у React-стейті й помирав разом зі сторінкою.
 *
 * Тут лежать самі URL — рядки, кілька сотень байтів на профіль, окремо від
 * кешу карток, з власним TTL. Сам вміст фото кешує браузер, тож повторний вхід
 * у стрічку не робить жодного мережевого запиту за аватарами.
 */

const PHOTO_URLS_KEY = 'matchingPhotoUrls';
export const PHOTO_URL_CACHE_TTL_MS = CACHE_TTL_MS;

// Стеля на кількість профілів у кеші: localStorage невеликий, а стрічка за
// сесію може перебрати сотні карток. При переповненні найстаріші записи йдуть.
const MAX_CACHED_PROFILES = 600;

const readStore = () => {
  try {
    const raw = localStorage.getItem(PHOTO_URLS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = store => {
  try {
    localStorage.setItem(PHOTO_URLS_KEY, JSON.stringify(store));
  } catch {
    // Переповнений або недоступний localStorage не має ламати стрічку: кеш
    // фото — це прискорення, а не джерело правди.
  }
};

const isFresh = entry =>
  Boolean(entry) && Number.isFinite(Number(entry.cachedAt))
  && Date.now() - Number(entry.cachedAt) <= PHOTO_URL_CACHE_TTL_MS;

/** URL фото профілю, або `null` якщо їх не кешовано (чи кеш протух). */
export const getCachedPhotoUrls = userId => {
  if (!userId) return null;
  const entry = readStore()[userId];
  if (!isFresh(entry) || !Array.isArray(entry.urls)) return null;
  return entry.urls;
};

/** Те саме для пачки id — одне читання localStorage замість N. */
export const getCachedPhotoUrlsMap = (userIds = []) => {
  const store = readStore();
  const result = {};
  userIds.filter(Boolean).forEach(userId => {
    const entry = store[userId];
    if (isFresh(entry) && Array.isArray(entry.urls)) result[userId] = entry.urls;
  });
  return result;
};

export const setCachedPhotoUrls = (userId, urls) => {
  if (!userId) return;
  const store = readStore();
  store[userId] = { urls: Array.isArray(urls) ? urls : [], cachedAt: Date.now() };

  const ids = Object.keys(store);
  if (ids.length > MAX_CACHED_PROFILES) {
    ids
      .sort((a, b) => Number(store[a]?.cachedAt || 0) - Number(store[b]?.cachedAt || 0))
      .slice(0, ids.length - MAX_CACHED_PROFILES)
      .forEach(staleId => { delete store[staleId]; });
  }

  writeStore(store);
};

export const clearPhotoUrlCache = () => {
  try {
    localStorage.removeItem(PHOTO_URLS_KEY);
  } catch {
    // нічого: кеш і так необовʼязковий
  }
};
