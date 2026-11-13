/**
 * Незбережене у формі «Додати картку» / «Запропонувати правку» — на пристрої,
 * доки запис не скінчився.
 *
 * Чому. Форма зберігає на кожному blur (`persistDraft` у
 * `ProfileCreationWorkspace`): своя чернетка — `saveCreateProfileMutation`,
 * доповнення чужої картки — `saveOverlayForUserCard`. Без звʼязку ці записи
 * висять у памʼяті вкладки, і закрита вкладка губила набране, хоча форма
 * показувала його на екрані. Сирий запис у чергу пристрою (`utils/writeOutbox`)
 * тут не годиться: збереження — це різниця з карткою, ревізія чернетки,
 * заявки на унікальність і індекс пошуку. Тож тут лежить сам стан форми, а
 * дописує його той самий `persistDraft`, щойно цю картку відкриють знову.
 *
 * Запис знімається, коли збереження скінчилось — успіхом чи остаточною
 * відмовою (відмова лишає набране на екрані, а безкінечний повтор
 * `REVISION_CONFLICT` на кожному відкритті нічого б не дав), — і лише свій:
 * новіша правка тієї самої картки має інший `at`.
 *
 * Ключ `km.cardFormPending.v1:{uid}` = { [ціль]: { draft, at } }, ціль —
 * `draft:{картка}` або `overlay:{картка}`. Вихід стирає (`App`, гілка `out`).
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
export const rememberCardFormPending = (uid, target, draft) => {
  if (!uid || !target || !draft || typeof draft !== 'object') return 0;
  const at = Math.max(Date.now(), lastAt + 1);
  lastAt = at;
  const entries = readAll(uid);
  entries[target] = { draft, at };
  writeAll(uid, entries);
  return at;
};

/** Зняти запис, якщо він досі той самий, що поклав цей запис. */
export const settleCardFormPending = (uid, target, at) => {
  if (!uid || !target || !at) return;
  const entries = readAll(uid);
  if (entries[target]?.at !== at) return;
  delete entries[target];
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
