import { readCardRevision } from './matchingCardIndex';
import { replaceFeedProjection } from './freshFeedProjection';

/**
 * Одне сховище проєкцій карток стрічки на вкладку — перший крок до «одного
 * сховища карток замість шарів».
 *
 * Чому. Та сама картка жила в кількох станах `Matching` (`users`, «лише для
 * вподобаних», надані правилами, спільні реакції) і в кеші пристрою, і кожну
 * копію оновлював свій шлях. Свіжа проєкція, яку приніс один шлях, до решти
 * копій не доходила — так розгортання бачило стару версію анкети, а рядок
 * «лише для вподобаних» лишався зі старим фото. Тепер свіжа проєкція лягає
 * сюди, а рядок бере її звідси (`resolveStoredProjection`), хоч би з якого
 * джерела прийшов.
 *
 * Що сюди пише. Лише відповіді бази — `expandVerifiedMatchingCard` у
 * `config.js` (сторінка стрічки, картки за id, пошук, свіжа картка сторожа
 * стану). Не стан стрічки й не кеш пристрою: стара копія звідти перебила б
 * свіжішу. Новіша версія анкети (`rev`) перемагає; та сама версія —
 * перемагає пізніший запис, бо він і прочитаний пізніше.
 *
 * Скидається разом зі стрічкою («Оновити стрічку», зміна читача).
 */
const projections = new Map();
// Повні анкети карток (`ensureFullProfile` у стрічці): прочитані з бази чи
// взяті з кешу пристрою на дотик. Лежать поруч із проєкціями, бо лише тут
// видно, чи анкета ще відповідає показаній картці (`isStoredFullProfileStale`).
const fullProfiles = new Map();
const listeners = new Set();
let storeViewer = null;
let storeVersion = 0;
// Скільки разів сховище скидали («Оновити стрічку», інший читач). Стрічка
// памʼятає, які анкети вже просила; після скидання ця памʼять бреше, а
// відповідь, що летіла до скидання, належить уже забутому стану.
let storeGeneration = 0;

// Сторінка стрічки пише десять проєкцій поспіль — одне сповіщення на всі:
// інакше кожна картка давала б окремий перерендер `Matching`. Версія
// росте одразу, тож читач, що питає `getCardStoreVersion`, бачить зміну.
let notifyScheduled = false;
const notify = () => {
  storeVersion += 1;
  if (notifyScheduled) return;
  notifyScheduled = true;
  Promise.resolve().then(() => {
    notifyScheduled = false;
    listeners.forEach(listener => {
      try {
        listener();
      } catch {
        // слухач не мусить ламати запис
      }
    });
  });
};

export const getCardStoreVersion = () => storeVersion;

export const getCardStoreGeneration = () => storeGeneration;

export const subscribeCardStore = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearCardStore = () => {
  storeGeneration += 1;
  if (!projections.size && !fullProfiles.size) return;
  projections.clear();
  fullProfiles.clear();
  notify();
};

/** Інший читач — інше сховище: перемкнутись, забувши проєкції попереднього. */
export const switchCardStoreViewer = viewerId => {
  const next = viewerId || null;
  if (next === storeViewer) return;
  storeViewer = next;
  storeGeneration += 1;
  if (projections.size || fullProfiles.size) {
    projections.clear();
    fullProfiles.clear();
    notify();
  }
};

/**
 * Записати проєкції, щойно прочитані з бази. `cardsById` — розгорнуті
 * проєкції (`expandMatchingCard`). Старіша за наявну версією не лягає.
 */
export const upsertStoredProjections = (viewerId, cardsById) => {
  switchCardStoreViewer(viewerId);
  let changed = false;
  Object.entries(cardsById || {}).forEach(([id, card]) => {
    if (!id || !card || typeof card !== 'object') return;
    const current = projections.get(id);
    if (current === card) return;
    if (current && readCardRevision(card) < readCardRevision(current)) return;
    projections.set(id, card);
    changed = true;
  });
  if (changed) notify();
};

export const getStoredProjection = id => (id ? projections.get(String(id)) || null : null);

/**
 * Рядок стрічки з найсвіжішою проєкцією зі сховища. Проєкція замінюється
 * цілком, від рядка лишаються лише клієнтські позначки (`__…`); повна анкета
 * й рядок, свіжіший за сховище, лишаються як є. Без змін — той самий обʼєкт.
 */
export const resolveStoredProjection = (user, isProjection) => {
  if (!user?.userId || !isProjection(user)) return user;
  const stored = projections.get(String(user.userId));
  if (!stored || stored === user) return user;
  return replaceFeedProjection(user, stored);
};

/**
 * Ті самі заміни на списку джерела деки; без змін — той самий масив (тоді
 * мемо `Matching`, що від нього залежать, не перераховуються).
 */
export const resolveStoredProjectionList = (users, isProjection) => {
  if (!Array.isArray(users) || !projections.size) return users;
  let changed = false;
  const next = users.map(user => {
    const resolved = resolveStoredProjection(user, isProjection);
    if (resolved !== user) changed = true;
    return resolved;
  });
  return changed ? next : users;
};

/**
 * Локальна правка картки, яку база вже прийняла (адмін зняв чи повернув
 * публікацію). Сховище пишуть лише відповіді бази, але без цієї правки
 * прочитана раніше проєкція перебила б її в кожному рядку
 * (`resolveStoredProjection`), і повторний дотик просив би протилежного.
 * Немає проєкції в сховищі — нічого перебивати, і запису немає.
 *
 * @returns {{ previous: object, patched: object }|null} квитанція для
 *   `restoreStoredProjection`.
 */
export const patchStoredProjection = (id, patch) => {
  const key = id ? String(id) : '';
  const current = key ? projections.get(key) : null;
  if (!current || typeof patch !== 'function') return null;
  const next = patch(current);
  if (!next || next === current) return null;
  projections.set(key, next);
  notify();
  return { previous: current, patched: next };
};

/**
 * Відкотити правку `patchStoredProjection` (відмова бази) — **лише якщо в
 * сховищі досі вона**. Відповідь бази, що прийшла, поки запис летів, новіша
 * за знімок до правки (інша версія, інші поля), і повернути поверх неї
 * старий знімок означало б відкотити й її.
 */
export const restoreStoredProjection = (id, receipt) => {
  const key = id ? String(id) : '';
  if (!key || !receipt?.previous) return;
  if (projections.get(key) !== receipt.patched) return;
  projections.set(key, receipt.previous);
  notify();
};

/**
 * Повна анкета картки — у тому самому сховищі, що й проєкції.
 *
 * Доти вона жила окремим станом стрічки (`fullProfileByUserId`) і лягала
 * поверх рядка завжди: сховище приносило свіжішу картку (нова версія `rev` —
 * анкету правили), а розгорнутий рядок показував поверх неї стару анкету.
 * Старіша за наявну версією анкета не лягає; та сама — пізніший запис
 * перемагає.
 */
export const upsertStoredFullProfile = (id, profile) => {
  const key = id ? String(id) : '';
  if (!key || !profile || typeof profile !== 'object') return;
  const current = fullProfiles.get(key);
  if (current === profile) return;
  if (current && readCardRevision(profile) < readCardRevision(current)) return;
  fullProfiles.set(key, profile);
  notify();
};

/** Дописати до анкети частину (контакти, дочитані окремо) — без перевірки версії. */
export const mergeStoredFullProfile = (id, partial) => {
  const key = id ? String(id) : '';
  if (!key || !partial || typeof partial !== 'object') return;
  fullProfiles.set(key, { ...(fullProfiles.get(key) || {}), ...partial });
  notify();
};

/** Локальна правка анкети (той самий випадок, що `patchStoredProjection`). */
export const patchStoredFullProfile = (id, patch) => {
  const key = id ? String(id) : '';
  const current = key ? fullProfiles.get(key) : null;
  if (!current || typeof patch !== 'function') return;
  const next = patch(current);
  if (!next || next === current) return;
  fullProfiles.set(key, next);
  notify();
};

/**
 * Анкета старіша за проєкцію в сховищі: картку відтоді правили. Таку анкету
 * не можна класти поверх рядка — вона перебила б свіжі поля старими, — її
 * треба дочитати. Без версії з якогось боку — не відомо, тож не застаріла.
 */
export const isStoredFullProfileStale = id => {
  const key = id ? String(id) : '';
  const full = key ? fullProfiles.get(key) : null;
  const projection = key ? projections.get(key) : null;
  if (!full || !projection) return false;
  const fullRevision = readCardRevision(full);
  const projectionRevision = readCardRevision(projection);
  return fullRevision > 0 && projectionRevision > fullRevision;
};

/** Чинна анкета картки або `null` (немає чи застаріла). */
export const getStoredFullProfile = id => {
  const key = id ? String(id) : '';
  if (!key || isStoredFullProfileStale(key)) return null;
  return fullProfiles.get(key) || null;
};

/** Анкета є, але застаріла — дочитати (`ensureFullProfile` у стрічці). */
export const listStaleStoredFullProfileIds = () => [...fullProfiles.keys()].filter(isStoredFullProfileStale);

export const __resetCardStoreForTests = () => {
  notifyScheduled = false;
  fullProfiles.clear();
  projections.clear();
  listeners.clear();
  storeViewer = null;
  storeVersion = 0;
  storeGeneration = 0;
};
