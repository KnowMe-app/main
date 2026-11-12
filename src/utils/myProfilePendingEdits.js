/**
 * Незбережені правки «Мого профілю» — на пристрої, доки база їх не прийняла.
 *
 * Чому. Поле зберігається на blur (`saveState` у `MyProfile`), а без звʼязку
 * запис висить у памʼяті вкладки: закрита вкладка чи перезавантаження губили
 * правку, хоч поле показувало її збереженою, — у кеш «Мого профілю»
 * (`utils/myProfileCache`) вона лягає лише після запису. Сирий запис у
 * загальну чергу (`utils/writeOutbox`) тут не годиться: збереження анкети —
 * це різниця з базою, маршрутизація по вузлах, версія `rev`, картка стрічки й
 * індекс пошуку. Тож тут лежить сама правка (поле → значення), а дописує її
 * той самий `saveState`, щойно «Мій профіль» відкриється знову.
 *
 * Ключ `km.myProfilePending.v1:{uid}`. Вихід стирає (`App`, гілка `out`), як
 * і решту памʼяті пристрою про читача.
 */
const STORAGE_KEY_PREFIX = 'km.myProfilePending.v1:';

const storageKey = uid => `${STORAGE_KEY_PREFIX}${uid}`;

const EMPTY = Object.freeze({ fields: {}, directFields: [], searchIdFields: [] });

export const readPendingProfileEdits = uid => {
  if (!uid) return EMPTY;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(uid)) || 'null');
    if (!parsed || typeof parsed.fields !== 'object' || !parsed.fields) return EMPTY;
    return {
      fields: parsed.fields,
      directFields: Array.isArray(parsed.directFields) ? parsed.directFields : [],
      searchIdFields: Array.isArray(parsed.searchIdFields) ? parsed.searchIdFields : [],
    };
  } catch {
    return EMPTY;
  }
};

const writePending = (uid, pending) => {
  try {
    if (!Object.keys(pending.fields).length) {
      localStorage.removeItem(storageKey(uid));
      return;
    }
    localStorage.setItem(storageKey(uid), JSON.stringify({ ...pending, updatedAt: Date.now() }));
  } catch {
    // Без `localStorage` правка живе лише в памʼяті вкладки — як і було.
  }
};

/**
 * Запамʼятати правку поля. `direct` — поле пишеться як є (програми,
 * побажання — обʼєкти), `searchId` — поле індексується в пошуку.
 */
export const rememberPendingProfileEdit = (uid, name, value, { direct = false, searchId = false } = {}) => {
  if (!uid || !name) return;
  const pending = readPendingProfileEdits(uid);
  const addTo = (list, flag) => (flag && !list.includes(name) ? [...list, name] : list);
  writePending(uid, {
    fields: { ...pending.fields, [name]: value === undefined ? null : value },
    directFields: addTo(pending.directFields, direct),
    searchIdFields: addTo(pending.searchIdFields, searchId),
  });
};

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Зняти правки, які база щойно прийняла: лише ті поля, чиє значення в
 * записаному стані те саме, що й у правці. Поле, яке людина встигла змінити
 * ще раз, поки запис летів, лишається — його дописуватиме наступне збереження.
 */
export const settlePendingProfileEdits = (uid, savedState) => {
  if (!uid || !savedState) return;
  const pending = readPendingProfileEdits(uid);
  const names = Object.keys(pending.fields);
  if (!names.length) return;
  const settled = names.filter(name => sameValue(pending.fields[name], savedState[name]));
  if (!settled.length) return;
  const fields = Object.fromEntries(Object.entries(pending.fields).filter(([name]) => !settled.includes(name)));
  writePending(uid, {
    fields,
    directFields: pending.directFields.filter(name => name in fields),
    searchIdFields: pending.searchIdFields.filter(name => name in fields),
  });
};

export const hasPendingProfileEdits = uid => Object.keys(readPendingProfileEdits(uid).fields).length > 0;

export const clearPendingProfileEdits = () => {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // нічого
  }
};
