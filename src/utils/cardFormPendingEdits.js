import { areProposalValuesEqual } from './profileProposals';

/**
 * Незбережене у формі «Додати картку» / «Запропонувати правку» — на пристрої,
 * доки запис не скінчився.
 *
 * Чому. Форма зберігає на кожному blur (`persistDraft` у
 * `ProfileCreationWorkspace`). Без звʼязку ці записи висять у памʼяті
 * вкладки, і закрита вкладка губила набране, хоча форма
 * показувала його на екрані. Сирий запис у чергу пристрою (`utils/writeOutbox`)
 * тут не годиться: збереження — це різниця з карткою, ревізія чернетки,
 * заявки на унікальність і індекс пошуку. Тут лежать правка форми й база,
 * від якої почали редагування. За нею форма перевіряє, чи можна дослати правку.
 *
 * Підтвердження запису має мітку `at`: воно може зняти лише власний запис.
 * Якщо в черзі є новіша правка з тієї самої бази, після підтвердження
 * її базою може стати щойно записана ревізія.
 *
 * Ключ `km.cardFormPending.v1:{uid}` = { [ціль]: { draft, at, expected?, targetKey? } }.
 * Ціль — `draft:{картка}` або `overlay:{картка}`. У старих записів `expected`
 * відсутній. `expected: null` означає, що запису в базі ще точно не було.
 * Вихід стирає (`App`, гілка `out`).
 */
const STORAGE_KEY_PREFIX = 'km.cardFormPending.v1:';
const storageKey = uid => `${STORAGE_KEY_PREFIX}${uid}`;

// Стеля: незбережене старше за тиждень уже нікому не потрібне, а набране
// поверх давно зміненої картки могло б її відкотити.
export const CARD_FORM_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const readAll = uid => {
  if (!uid) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(uid)) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeAll = (uid, entries) => {
  try {
    if (Object.keys(entries).length) localStorage.setItem(storageKey(uid), JSON.stringify(entries));
    else localStorage.removeItem(storageKey(uid));
  } catch {
    // Без `localStorage` набране живе лише в памʼяті вкладки — як і було.
  }
};

export const buildCardFormTarget = ({ overlayCardId, draftCardId } = {}) => {
  if (overlayCardId) return `overlay:${overlayCardId}`;
  if (draftCardId) return `draft:${draftCardId}`;
  return '';
};

let lastAt = 0;
/** Покласти стан форми до запису. Повертає мітку, якою запис потім знімають. */
export const rememberCardFormPending = (uid, target, draft, { expected, targetKey, basis, needsBlur, sessionId } = {}) => {
  if (!uid || !target || !draft || typeof draft !== 'object') return 0;
  const entries = readAll(uid);
  const storedAt = Number(entries[target]?.at);
  const at = Math.max(Date.now(), lastAt + 1, Number.isSafeInteger(storedAt) ? storedAt + 1 : 0);
  lastAt = at;
  entries[target] = {
    draft,
    at,
    ...(expected !== undefined && { expected }),
    ...(targetKey !== undefined && { targetKey }),
    ...(basis !== undefined && { basis }),
    ...(needsBlur && { needsBlur: true }),
    ...(sessionId && { sessionId }),
  };
  writeAll(uid, entries);
  return at;
};

/** Зняти запис, якщо він досі той самий, що поклав цей запис. */
export const settleCardFormPending = (uid, target, at, { sessionId } = {}) => {
  if (!uid || !target || !at) return;
  const entries = readAll(uid);
  if (entries[target]?.at !== at || (sessionId && entries[target]?.sessionId !== sessionId)) return;
  delete entries[target];
  writeAll(uid, entries);
};

/** Перенести базу новішої правки на ревізію, яку щойно записала ця черга. */
export const advanceCardFormPending = (uid, target, expected, nextExpected, afterAt = 0, {
  latestAt, basis, sessionId,
} = {}) => {
  if (!uid || !target || expected === undefined || nextExpected === undefined) return;
  const entries = readAll(uid);
  const entry = entries[target];
  if (!entry || !(entry.at > afterAt) || (latestAt != null && entry.at !== latestAt)
    || (sessionId && entry.sessionId !== sessionId)
    || !areProposalValuesEqual(entry.expected, expected)) return;
  entries[target] = { ...entry, expected: nextExpected, ...(basis !== undefined && { basis }) };
  writeAll(uid, entries);
};

export const readCardFormPending = (uid, target, { now = Date.now() } = {}) => {
  if (!uid || !target) return null;
  const entry = readAll(uid)[target];
  if (!entry || !entry.draft || typeof entry.draft !== 'object') return null;
  if (!(now - Number(entry.at || 0) <= CARD_FORM_PENDING_MAX_AGE_MS)) return null;
  return entry;
};

export const clearCardFormPending = () => {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // нічого: без `localStorage` і запису немає
  }
};
