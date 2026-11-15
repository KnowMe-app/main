/**
 * Незбережені правки картки на `AddNewProfile` — на пристрої, до запису.
 *
 * Чому. Форма адміна зберігає на blur (`handleSubmit` → `remoteUpdate`), і
 * правка спершу лягає на екран і в кеш карток, а запис іде у фоні. Без
 * звʼязку той запис висів у памʼяті вкладки (SDK бази не тримає
 * незавершене на диску), і закрита чи перезавантажена вкладка губила
 * внесене адміном — хоча екран показував його збереженим.
 *
 * Як. Кожне збереження спершу лягає сюди (`km.adminCardPending.v1:{uid}`,
 * запис на картку) і знімається лише тоді, коли `remoteUpdate` скінчився
 * успіхом — і лише своє (`at`): новіша правка тієї самої картки, що ще чекає,
 * лишається. На відкритті `AddNewProfile` і на подію `online` недослане
 * проганяється тим самим `remoteUpdate`. Сирий запис у загальну чергу
 * (`utils/writeOutbox`) тут не годиться — як і в «Моєму профілі»: збереження
 * картки — це злиття з базою, маршрутизація по вузлах, індекси й картка
 * стрічки.
 *
 * Правки однієї картки складаються в один запис: форма щоразу несе повний
 * стан картки, тож новіший стан заміняє старіший, а видалення (`delCondition`,
 * `deletedKeys`, `removedIndexValues`) накопичуються — інакше стерте до
 * обриву звʼязку воскресло б наступним збереженням.
 */

const STORAGE_KEY_PREFIX = 'km.adminCardPending.v1:';
// Стеля життя: правка, яку тиждень за тижнем не вдалось дослати, вже нічого не
// означає й лише перебивала б картку на кожному відкритті.
export const ADMIN_CARD_PENDING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const listeners = new Set();
let lastStamp = 0;

const storageKey = uid => `${STORAGE_KEY_PREFIX}${uid}`;
const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const nextStamp = () => {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
};

const notify = () => {
  listeners.forEach(listener => {
    try {
      listener();
    } catch {
      // слухач не мусить ламати збереження
    }
  });
};

const readAll = uid => {
  if (!uid) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(uid)) || '{}');
    if (!isPlainObject(parsed)) return {};
    const cutoff = Date.now() - ADMIN_CARD_PENDING_MAX_AGE_MS;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([cardId, entry]) => cardId && isPlainObject(entry?.params) && Number(entry.at) > cutoff
      )
    );
  } catch {
    return {};
  }
};

const writeAll = (uid, all) => {
  if (!uid) return false;
  try {
    if (Object.keys(all).length) localStorage.setItem(storageKey(uid), JSON.stringify(all));
    else localStorage.removeItem(storageKey(uid));
    return true;
  } catch {
    return false;
  } finally {
    notify();
  }
};

const hasFilledValue = (state, key) => {
  if (!isPlainObject(state) || !Object.prototype.hasOwnProperty.call(state, key)) return false;
  const value = state[key];
  return value !== undefined && value !== null;
};

const unique = list => [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];

const mergeRemovedIndexValues = (prev, next) => {
  if (!isPlainObject(prev)) return isPlainObject(next) ? next : undefined;
  if (!isPlainObject(next)) return prev;
  const merged = { ...prev };
  Object.entries(next).forEach(([field, values]) => {
    const before = Array.isArray(merged[field]) ? merged[field] : [];
    const added = Array.isArray(values) ? values : [values];
    merged[field] = [...before, ...added.filter(value => !before.includes(value))];
  });
  return merged;
};

/**
 * Скласти нову правку картки з тією, що ще чекає. Поле, яке в новому стані
 * знову заповнене, зі стертих знімається — так само, як `pendingDeletedKeysRef`.
 */
export const mergePendingCardSaveParams = (prev, next) => {
  if (!isPlainObject(prev)) return next;
  const state = next.syncedState || {};
  const nextDel = isPlainObject(next.delCondition) ? next.delCondition : {};
  const keepDeleted = key => Object.prototype.hasOwnProperty.call(nextDel, key) || !hasFilledValue(state, key);
  const delCondition = Object.fromEntries(
    Object.entries({ ...(isPlainObject(prev.delCondition) ? prev.delCondition : {}), ...nextDel })
      .filter(([key]) => keepDeleted(key))
  );
  return {
    ...next,
    delCondition: Object.keys(delCondition).length ? delCondition : undefined,
    deletedKeys: unique([...(prev.deletedKeys || []), ...(next.deletedKeys || [])]).filter(keepDeleted),
    removeKeys: unique([...(prev.removeKeys || []), ...(next.removeKeys || [])]).filter(keepDeleted),
    removedIndexValues: mergeRemovedIndexValues(prev.removedIndexValues, next.removedIndexValues),
    // Різні поля «переписати» — переписується вся картка: стан у формі
    // повний, а одне поле з двох інакше злилось би з базою як нова версія.
    overwrite: prev.overwrite === next.overwrite ? next.overwrite : 'overwrite',
    hasNewState: Boolean(prev.hasNewState || next.hasNewState),
  };
};

// JSON знімає `undefined` (намір «+» у формі) і функції — у базу вони й так
// не йдуть.
const toStorable = params => {
  try {
    return JSON.parse(JSON.stringify(params));
  } catch {
    return null;
  }
};

/**
 * Покласти правку картки на пристрій до запису. Повертає позначку `at`, з
 * якою її потім знімає `settlePendingCardSave`, або `null`, коли диска немає.
 */
export const rememberPendingCardSave = (uid, params) => {
  const cardId = String(params?.syncedState?.userId || '').trim();
  if (!uid || !cardId) return null;
  const storable = toStorable(params);
  if (!storable) return null;
  const all = readAll(uid);
  const at = nextStamp();
  all[cardId] = { at, params: mergePendingCardSaveParams(all[cardId]?.params, storable) };
  return writeAll(uid, all) ? at : null;
};

/** Зняти правку, яку база прийняла, — лише коли новішої тим часом не було. */
export const settlePendingCardSave = (uid, cardId, at) => {
  const id = String(cardId || '').trim();
  if (!uid || !id || !at) return;
  const all = readAll(uid);
  if (!all[id] || all[id].at !== at) return;
  delete all[id];
  writeAll(uid, all);
};

/** Правки, що чекають на звʼязок, від найстарішої. */
export const listPendingCardSaves = uid =>
  Object.entries(readAll(uid))
    .map(([cardId, entry]) => ({ cardId, at: entry.at, params: entry.params }))
    .sort((a, b) => a.at - b.at);

export const getPendingCardSave = (uid, cardId) => {
  const entry = readAll(uid)[String(cardId || '').trim()];
  return entry ? { cardId: String(cardId), at: entry.at, params: entry.params } : null;
};

/**
 * Картка з бази чи кеша з накладеною правкою, якої база ще не має: інакше
 * відкрита після перезавантаження картка показувала б старе до доставки.
 */
export const applyPendingCardSave = (uid, card) => {
  const id = String(card?.userId || '').trim();
  const pending = id ? getPendingCardSave(uid, id) : null;
  if (!pending) return card;
  const local = pending.params.localCardState || pending.params.syncedState || {};
  const next = { ...card, ...local, userId: card.userId || id };
  unique([...(pending.params.removeKeys || []), ...(pending.params.deletedKeys || [])]).forEach(key => {
    if (key !== 'userId' && !hasFilledValue(local, key)) delete next[key];
  });
  return next;
};

export const countPendingCardSaves = uid => Object.keys(readAll(uid)).length;

export const subscribePendingCardSaves = listener => {
  listeners.add(listener);
  const onStorage = event => {
    if (!event?.key || event.key.startsWith(STORAGE_KEY_PREFIX)) listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
};

/** Вихід з акаунта: незбережене адміна — теж памʼять пристрою про читача. */
export const clearAdminCardPending = () => {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // нічого
  }
  notify();
};
