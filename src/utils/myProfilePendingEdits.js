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

const EMPTY = Object.freeze({ fields: {}, directFields: [], searchIdFields: [], generations: {}, seq: 0 });

export const readPendingProfileEdits = uid => {
  if (!uid) return EMPTY;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(uid)) || 'null');
    if (!parsed || typeof parsed.fields !== 'object' || !parsed.fields) return EMPTY;
    return {
      fields: parsed.fields,
      directFields: Array.isArray(parsed.directFields) ? parsed.directFields : [],
      searchIdFields: Array.isArray(parsed.searchIdFields) ? parsed.searchIdFields : [],
      generations: parsed.generations && typeof parsed.generations === 'object' ? parsed.generations : {},
      seq: Number(parsed.seq) || 0,
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
  // Кожна правка — нове покоління поля (див. `settlePendingProfileEdits`).
  const seq = pending.seq + 1;
  writePending(uid, {
    fields: { ...pending.fields, [name]: value === undefined ? null : value },
    directFields: addTo(pending.directFields, direct),
    searchIdFields: addTo(pending.searchIdFields, searchId),
    generations: { ...pending.generations, [name]: seq },
    seq,
  });
};

/** Покоління правок у мить виклику збереження — для `settlePendingProfileEdits`. */
export const capturePendingProfileGenerations = uid => ({ ...readPendingProfileEdits(uid).generations });

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Зняти правки, які база щойно прийняла.
 *
 * Звіряється **покоління**, а не значення: людина могла набрати A → B → A,
 * поки летів перший запис, і всі три стали в чергу збережень. Перше A,
 * підтверджене за значенням, зняло б останнє A — і якби вкладку закрили після
 * запису B, але до запису останнього A, у базі лишилось би B без жодної
 * правки, що його виправить. `capturedGenerations` — покоління полів у мить
 * виклику збереження (`capturePendingProfileGenerations`): знімається поле,
 * чиє покоління відтоді не змінилось. Правки першої версії модуля поколінь не
 * мають — для них лишається звірка значенням.
 */
export const settlePendingProfileEdits = (uid, savedState, capturedGenerations = {}) => {
  if (!uid || !savedState) return;
  const pending = readPendingProfileEdits(uid);
  const names = Object.keys(pending.fields);
  if (!names.length) return;
  const settled = names.filter(name => {
    const generation = pending.generations[name];
    if (generation !== undefined) return capturedGenerations[name] === generation;
    return sameValue(pending.fields[name], savedState[name]);
  });
  if (!settled.length) return;
  const keep = name => !settled.includes(name);
  const fields = Object.fromEntries(Object.entries(pending.fields).filter(([name]) => keep(name)));
  writePending(uid, {
    fields,
    directFields: pending.directFields.filter(keep),
    searchIdFields: pending.searchIdFields.filter(keep),
    generations: Object.fromEntries(Object.entries(pending.generations).filter(([name]) => keep(name))),
    seq: pending.seq,
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
