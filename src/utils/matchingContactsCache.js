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

/**
 * Контакти карток, які назвав журнал змін (`utils/matchingCardChanges`), —
 * забути в цього читача; без переліку — усі його записи (журнал «як уперше»).
 *
 * `forgetProfileContacts` знімає запис лише на пристрої того, хто правив, а
 * інший пристрій чи інший читач тримав старий номер до шести годин: правка
 * контактів ставить картці нову версію (`rev`), журнал про неї каже, але кеш
 * контактів журналу не слухав.
 */
export const forgetProfileContactsForViewer = (viewerId, cardIds) => {
  if (!viewerId) return;
  if (!cardIds) {
    try { localStorage.removeItem(buildKey(viewerId)); } catch { /* без сховища кеша немає */ }
    return;
  }
  const store = readStore(viewerId);
  let changed = false;
  cardIds.forEach(id => {
    if (store[id]) { delete store[id]; changed = true; }
  });
  if (changed) writeStore(viewerId, store);
};

/**
 * Усі відкриті контакти, які пристрій бачив, без огляду на вік, — для пошуку
 * без звʼязку: шукають номер серед того, що читач уже мав на екрані.
 */
export const readAllCachedProfileContacts = viewerId => {
  const result = {};
  Object.entries(readStore(viewerId)).forEach(([cardId, entry]) => {
    if (entry?.allowed === true && entry.contacts && typeof entry.contacts === 'object') result[cardId] = entry.contacts;
  });
  return result;
};

export const clearContactsCache = () => removeCacheEntriesByPrefix(STORAGE_KEY_PREFIX);
