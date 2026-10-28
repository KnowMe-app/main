import { isMatchingCacheFresh, removeCacheEntriesByPrefix } from './matchingCachePolicy';

/**
 * Контакти анкет (`profileContacts/{id}`) — у памʼяті пристрою, шість годин.
 *
 * Рядок стрічки просить контакти сам, щойно зʼявився на екрані
 * (`readProfileContacts`), і памʼять вкладки (десять хвилин) їх не рятувала:
 * перезавантаження чи друга прокрутка тих самих екранів коштували ще по
 * читанню на картку. Тепер діє загальне правило кеша матчингу
 * (`utils/matchingCachePolicy`), і памʼятається вся відповідь — і контакти, і
 * «закрито» (`allowed: false`).
 *
 * Це рішення власниці продукту, і в нього є ціна: межа приватності
 * (`feedDate`) у базі змінюється миттєво, а тут — щонайпізніше через TTL. Хто
 * вже бачив номер анкети, яку потім зняли з публікації, бачитиме його на цьому
 * пристрої до шести годин; закриті контакти щойно опублікованої так само
 * відкриються не одразу. Кеш карток (`sanitizeMatchingCardForCache`) контактів
 * і далі не тримає — вони лежать окремо, привʼязані до читача, і вихід з
 * акаунта їх стирає (`clearContactsCache` у `App`). Правка контактів картки
 * знімає її запис (`forgetProfileContacts` у писачі вузлів).
 */
const STORAGE_KEY_PREFIX = 'km.matchingContacts.v1:';
// Стеля, щоб адмін, який за день проходить тисячі карток, не виїв `localStorage`.
const MAX_ENTRIES = 1500;

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
  try {
    localStorage.setItem(buildKey(viewerId), JSON.stringify(store));
  } catch {
    // переповнений `localStorage`: наступного разу контакти приїдуть з бази
  }
};

export const readFreshProfileContacts = (viewerId, cardId, { now = Date.now() } = {}) => {
  if (!viewerId || !cardId) return null;
  const entry = readStore(viewerId)[cardId];
  if (!entry || !isMatchingCacheFresh(entry.cachedAt, { now })) return null;
  return {
    allowed: entry.allowed === true,
    contacts: entry.contacts && typeof entry.contacts === 'object' ? entry.contacts : (entry.allowed ? {} : null),
  };
};

export const writeProfileContacts = (viewerId, cardId, { allowed, contacts } = {}, { now = Date.now() } = {}) => {
  if (!viewerId || !cardId) return;
  const store = readStore(viewerId);
  store[cardId] = {
    cachedAt: now,
    allowed: allowed === true,
    contacts: allowed === true && contacts && typeof contacts === 'object' ? contacts : null,
  };
  const ids = Object.keys(store);
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => Number(store[a]?.cachedAt || 0) - Number(store[b]?.cachedAt || 0))
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach(id => { delete store[id]; });
  }
  writeStore(viewerId, store);
};

/** Контакти картки змінили — її запис мусить піти в усіх читачів пристрою. */
export const forgetProfileContacts = cardId => {
  if (!cardId) return;
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_KEY_PREFIX))
      .forEach(key => {
        const viewerId = key.slice(STORAGE_KEY_PREFIX.length);
        const store = readStore(viewerId);
        if (!store[cardId]) return;
        delete store[cardId];
        writeStore(viewerId, store);
      });
  } catch {
    // нічого: без `localStorage` і кеша немає
  }
};

export const clearContactsCache = () => removeCacheEntriesByPrefix(STORAGE_KEY_PREFIX);
