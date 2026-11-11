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
const listeners = new Set();
let storeViewer = null;
let storeVersion = 0;

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

export const subscribeCardStore = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearCardStore = () => {
  if (!projections.size) return;
  projections.clear();
  notify();
};

/** Інший читач — інше сховище: перемкнутись, забувши проєкції попереднього. */
export const switchCardStoreViewer = viewerId => {
  const next = viewerId || null;
  if (next === storeViewer) return;
  storeViewer = next;
  if (projections.size) {
    projections.clear();
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

export const __resetCardStoreForTests = () => {
  notifyScheduled = false;
  projections.clear();
  listeners.clear();
  storeViewer = null;
  storeVersion = 0;
};
