/**
 * Програми агенцій і клінік на боці читача: `localStorage` спершу, база —
 * лише коли там немає чинної копії.
 *
 * Програми не приватні, тож лежать окремим вузлом, відкритим кожному
 * авторизованому (`multiData/programs/{uid}`), а не в картці стрічки: у
 * картці вони важили б більше за решту картки разом, і кожна сторінка
 * стрічки тягла б їх для всіх — зокрема для тих, кому програми не адресовані.
 * Картка несе самий лише час їхньої зміни (`programsAt`), і це — версія кеша:
 * збіглась із тим, що лежить у браузері, — запиту немає зовсім; не збіглась —
 * один точковий `get` на картку, і тільки тоді, коли картка вже в списку.
 *
 * Модуль не знає мережі: читача й писача реєструє `programsRemote`
 * (`setProgramsTransport`), бо сюди дивляться `donorPrograms` і фільтр
 * стрічки, а ті мусять лишатись чистими.
 */

import { useSyncExternalStore } from 'react';
import { programsToRecord, setCardProgramsLookup } from './donorPrograms';
import { listProfileRoles } from './matchingPeerVisibility';

export const PROGRAMS_CACHE_PREFIX = 'programs:v1:';

const memory = new Map();
const inFlight = new Map();
// Невдале читання не повторюється в межах вкладки для тієї самої версії:
// інакше відмова бази на одній картці ставала б запитом на кожен рендер.
const failed = new Set();
const listeners = new Set();
let version = 0;
let transport = { read: null, write: null };

export const setProgramsTransport = next => {
  transport = { read: next?.read || null, write: next?.write || null };
};

const cardIdOf = card => String(card?.userId || card?.id || '').trim();
export const readCardProgramsAt = card => {
  const at = Number(card?.programsAt);
  return Number.isFinite(at) && at > 0 ? at : 0;
};

const storageKey = uid => `${PROGRAMS_CACHE_PREFIX}${uid}`;

const readEntry = uid => {
  if (!uid) return null;
  if (memory.has(uid)) return memory.get(uid);
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.items !== 'object') return null;
    const entry = { at: Number(parsed.at) || 0, items: parsed.items || {}, pending: parsed.pending === true };
    memory.set(uid, entry);
    return entry;
  } catch {
    return null;
  }
};

const writeEntry = (uid, entry) => {
  memory.set(uid, entry);
  try {
    window.localStorage.setItem(storageKey(uid), JSON.stringify(entry));
  } catch {
    // Переповнене сховище чи приватне вікно: копія живе в памʼяті вкладки.
  }
};

const removeEntry = uid => {
  memory.delete(uid);
  try {
    window.localStorage.removeItem(storageKey(uid));
  } catch {
    // The in-memory copy is still gone when storage is unavailable.
  }
};

const notify = () => {
  version += 1;
  listeners.forEach(listener => listener());
};

export const subscribePrograms = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getProgramsVersion = () => version;

/** Номер версії сховища — щоб сортування й фільтр перерахувались, коли програми приїхали. */
export const useProgramsVersion = () => useSyncExternalStore(subscribePrograms, getProgramsVersion, getProgramsVersion);

/**
 * Програми картки без жодного запиту: `{}` — програм немає, `null` — ще не
 * прочитані. Застаріла копія віддається, поки свіжа в дорозі: краще показати
 * вчорашні суми на мить, ніж порожнє місце.
 */
export const peekCardPrograms = card => {
  const at = readCardProgramsAt(card);
  if (!at) return {};
  const entry = readEntry(cardIdOf(card));
  return entry ? entry.items : null;
};

setCardProgramsLookup(peekCardPrograms);

const isFresh = (entry, at) => Boolean(entry) && !entry.pending && entry.at >= at;

const fetchPrograms = (uid, at) => {
  const key = `${uid}@${at}`;
  if (inFlight.has(key)) return inFlight.get(key);
  if (failed.has(key) || !transport.read) return Promise.resolve(readEntry(uid)?.items || null);
  const request = transport.read(uid)
    .then(data => {
      const items = data?.items && typeof data.items === 'object' ? data.items : {};
      writeEntry(uid, { at: Number(data?.updatedAt) || at, items, pending: false });
      notify();
      return items;
    })
    .catch(error => {
      failed.add(key);
      console.warn('[programs] не вдалося прочитати програми картки', uid, error);
      return readEntry(uid)?.items || null;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};

/** Дочитує програми картки, якщо в браузері немає чинної копії. */
export const ensureCardPrograms = card => {
  const at = readCardProgramsAt(card);
  const uid = cardIdOf(card);
  if (!at || !uid) return Promise.resolve({});
  const entry = readEntry(uid);
  if (isFresh(entry, at)) return Promise.resolve(entry.items);
  return fetchPrograms(uid, at);
};

/** Програми для всіх переданих карток, у яких вони є, — паралельно. */
export const ensureProgramsForCards = cards => Promise.all(
  (Array.isArray(cards) ? cards : [])
    .filter(card => readCardProgramsAt(card) > 0)
    .filter(card => {
      const roles = listProfileRoles(card);
      return !roles.length || roles.some(role => role === 'ag' || role === 'cl');
    })
    .map(card => ensureCardPrograms(card)),
);

// --- власні програми -------------------------------------------------------

/** Власні програми з браузера — одразу, до будь-якого запиту. */
export const peekOwnPrograms = uid => readEntry(String(uid || '').trim());

/**
 * Власні програми з бази — раз на вкладку: з іншого пристрою їх могли
 * змінити. Не збережене ще з цього браузера (`pending`) база не перебиває —
 * його спершу треба дописати (`retryPendingPrograms`).
 */
const ownLoaded = new Set();
export const loadOwnPrograms = async uid => {
  const id = String(uid || '').trim();
  if (!id || !transport.read) return readEntry(id);
  const local = readEntry(id);
  if (ownLoaded.has(id) || local?.pending) return local;
  ownLoaded.add(id);
  try {
    const data = await transport.read(id);
    const entry = data?.items && typeof data.items === 'object'
      ? { at: Number(data.updatedAt) || 0, items: data.items, pending: false }
      : null;
    if (entry) {
      writeEntry(id, entry);
      notify();
      return entry;
    }
    // A fulfilled read with no node is an authoritative remote deletion. Only
    // a rejected read may retain the local cache (the catch branch below).
    // Do not let this older read erase a save that became pending meanwhile.
    const current = readEntry(id);
    if (current !== local || current?.pending) return current;
    removeEntry(id);
    notify();
    return null;
  } catch (error) {
    ownLoaded.delete(id);
    console.warn('[programs] не вдалося прочитати власні програми', error);
    return local;
  }
};

/**
 * Записує програми: спершу в браузер (з позначкою «ще не в базі»), тоді в
 * базу разом із `programsAt` картки. Відмова бази програм не губить: вони
 * лишаються в браузері й дописуються на наступному відкритті профілю.
 */
export const saveCardPrograms = async (uid, programs) => {
  const id = String(uid || '').trim();
  if (!id) return null;
  const items = programsToRecord(programs);
  const at = Date.now();
  writeEntry(id, { at, items, pending: true });
  notify();
  if (!transport.write) return { at, items, saved: false };
  await transport.write(id, items, at);
  writeEntry(id, { at, items, pending: false });
  return { at, items, saved: true };
};

export const retryPendingPrograms = async uid => {
  const entry = readEntry(String(uid || '').trim());
  if (!entry?.pending) return false;
  await saveCardPrograms(uid, entry.items);
  return true;
};

/** Лише для тестів: чисте сховище між сценаріями. */
export const resetProgramsStoreForTests = () => {
  memory.clear();
  inFlight.clear();
  failed.clear();
  ownLoaded.clear();
  version = 0;
};
