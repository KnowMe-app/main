/**
 * Версія позначок власника на пристрої — сигнал «памʼятки, реакції, дати
 * «Відкласти» чи перелік «лише для вподобаних» змінились деінде».
 *
 * Ці шари пристрій тримає шість годин (`utils/matchingCachePolicy`), а журнал
 * змін карток про них мовчить: вони лежать не в картці. Памʼятку, написану з
 * телефона, ноутбук того самого читача (і спільні власники) показував старою
 * до TTL. Тепер тригер функцій (`functions/ownerMarks.js`) на кожен запис
 * ставить `multiData/ownerMarksAt/{власник}/{вид}` = час сервера, а пристрій
 * раз на вкладку на власника питає цей вузол (один запит) і забуває кеш тих
 * видів, чия версія новіша за вже побачену (`km.ownerMarksSeen.v1:{читач}`).
 *
 * Перевірка — раз на вкладку на пару «читач|власник», і той самий проміс
 * чекають усі читачі кеша: памʼятки (`loadCommentsFor`), реакції, «Відкласти».
 * Збій чи повільна мережа — нічого не забуваємо: лишається TTL, як і доти.
 * Записи цього ж пристрою теж піднімають версію, тож після власної правки
 * наступна вкладка один раз перечитає свої памʼятки — це ціна того, що
 * пристрій не знає часу сервера свого запису.
 */
export const OWNER_MARK_KINDS = ['comments', 'favorites', 'dislikes', 'getInTouch', 'likedAudience'];
const SEEN_PREFIX = 'km.ownerMarksSeen.v1:';
const CHECK_TIMEOUT_MS = 4000;

let readVersions = null;
const invalidators = new Map();
const listeners = new Set();
const checks = new Map();

export const configureOwnerMarkVersions = ({ read } = {}) => {
  readVersions = typeof read === 'function' ? read : null;
};

/** Як забути кеш виду: `(viewerId, ownerId) => void`. */
export const registerOwnerMarkInvalidator = (kind, invalidate) => {
  if (OWNER_MARK_KINDS.includes(kind) && typeof invalidate === 'function') invalidators.set(kind, invalidate);
};

export const subscribeOwnerMarkChanges = listener => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const readSeen = viewerId => {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${SEEN_PREFIX}${viewerId}`) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeSeen = (viewerId, seen) => {
  try {
    localStorage.setItem(`${SEEN_PREFIX}${viewerId}`, JSON.stringify(seen));
  } catch {
    // без сховища наступна вкладка просто перечитає позначки
  }
};

const withTimeout = (promise, ms) => {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('owner-marks-timeout')), ms); }),
  ]).finally(() => clearTimeout(timer));
};

/**
 * Які види змінились: версія новіша за побачену. Власника пристрій ще не
 * бачив зовсім — кеш міг лягти до цього механізму, тож усе, що має версію,
 * вважаємо зміненим (один раз).
 */
export const resolveChangedOwnerMarkKinds = (remote, seenForOwner) => {
  const versions = remote && typeof remote === 'object' ? remote : {};
  return OWNER_MARK_KINDS.filter(kind => {
    const version = Number(versions[kind]) || 0;
    if (!version) return false;
    if (!seenForOwner) return true;
    return version > (Number(seenForOwner[kind]) || 0);
  });
};

const runCheck = async (viewerId, ownerId, timeoutMs) => {
  if (!readVersions) return [];
  let remote;
  try {
    remote = await withTimeout(Promise.resolve().then(() => readVersions(ownerId, viewerId)), timeoutMs);
  } catch {
    return [];
  }
  const seen = readSeen(viewerId);
  const changed = resolveChangedOwnerMarkKinds(remote, seen[ownerId]);
  changed.forEach(kind => {
    try {
      invalidators.get(kind)?.(viewerId, ownerId);
    } catch (error) {
      console.warn('[ownerMarks] не вдалося забути кеш', kind, error);
    }
  });
  const versions = {};
  OWNER_MARK_KINDS.forEach(kind => {
    const version = Number(remote?.[kind]) || 0;
    if (version) versions[kind] = version;
  });
  writeSeen(viewerId, { ...readSeen(viewerId), [ownerId]: { ...(seen[ownerId] || {}), ...versions } });
  if (changed.length) {
    listeners.forEach(listener => {
      try {
        listener({ viewerId, ownerId, kinds: changed });
      } catch (error) {
        console.warn('[ownerMarks] слухач впав', error);
      }
    });
  }
  return changed;
};

/**
 * Перевірити власників (раз на вкладку на кожного) і дочекатись забування
 * застарілого. Повертає `{ [ownerId]: kinds[] }`.
 */
export const ensureOwnerMarksChecked = async (viewerId, ownerIds = [], { timeoutMs = CHECK_TIMEOUT_MS } = {}) => {
  const viewer = String(viewerId || '').trim();
  if (!viewer) return {};
  const owners = [...new Set((ownerIds || []).map(id => String(id || '').trim()).filter(Boolean))];
  const results = await Promise.all(owners.map(async ownerId => {
    const key = `${viewer}|${ownerId}`;
    if (!checks.has(key)) checks.set(key, runCheck(viewer, ownerId, timeoutMs));
    return [ownerId, await checks.get(key)];
  }));
  return Object.fromEntries(results);
};

/** Вихід з акаунта й тести: наступна вкладка-сесія перевіряє заново. */
export const resetOwnerMarkChecks = () => checks.clear();
