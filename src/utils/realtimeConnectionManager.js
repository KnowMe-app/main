import { goOffline, goOnline } from 'firebase/database';

/**
 * Зʼєднання з базою — лише поки воно потрібне.
 *
 * Кожна відкрита вкладка тримає сокет до RTDB, а вкладку зі стрічкою люди
 * лишають відкритою на весь день. Одночасні зʼєднання — те, що в Firebase
 * впирається першим, коли читачів багато (на безкоштовному тарифі стеля — сто),
 * а після правила кеша матчингу (`utils/matchingCachePolicy`) тримати сокет
 * заради даних, які лежать на пристрої, нема для чого.
 *
 * Тож тут дві речі:
 * - **закрити, коли ніхто не дивиться**: вкладка у фоні `hiddenMs` або без
 *   жодного дотику `idleMs` — `goOffline`; повернулись чи торкнулись —
 *   `goOnline`, і SDK сам перепідписує слухачів (з хешем даних, тож незмінене
 *   вдруге не їде);
 * - **не відкривати без потреби**: SDK відкриває сокет, щойно хтось створить
 *   посилання на базу, навіть без жодного читання. Стрічка створювала його
 *   сама — підпискою на `.info/connected` заради плашки «Немає звʼязку». Тепер
 *   плашка стежить за звʼязком лише після першого справжнього запиту
 *   (`noteRealtimeDemand`, `useRealtimeConnection`), і теплий старт, де все
 *   взялося з кеша, сокета не відкриває зовсім.
 *
 * Читання поки зʼєднання призупинено не падає, а чекає, тож будь-яке
 * програмне читання (`get` у `config.js` і `Matching.jsx` кличе
 * `noteRealtimeDemand`) спершу відновлює зʼєднання. Призупиняє менеджер лише стрічка: довгі адмінські
 * роботи на `AddNewProfile` можуть іти у фоновій вкладці годинами.
 */
export const REALTIME_HIDDEN_SUSPEND_MS = 5 * 60 * 1000;
export const REALTIME_IDLE_SUSPEND_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
// Прокрутка сипле подіями; таймер простою досить переставляти раз на секунду.
const IDLE_REARM_THROTTLE_MS = 1000;

let demanded = false;
let suspended = false;
let activeDatabase = null;
const listeners = new Set();

const notify = () => listeners.forEach(listener => {
  try {
    listener();
  } catch (error) {
    console.warn('[realtimeConnection] слухач стану впав', error);
  }
});

export const getRealtimeConnectionDemand = () => ({ demanded, suspended });

// Слухачі чують лише зміну стану (потрібне / призупинене), а не кожне читання:
// стрічка перемальовувалась би на кожен запит.
export const subscribeRealtimeConnectionDemand = listener => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const resume = () => {
  if (!suspended) return;
  suspended = false;
  if (activeDatabase) goOnline(activeDatabase);
  notify();
};

/** Базу таки питають — зʼєднання потрібне, а призупинене відновлюється. */
export const noteRealtimeDemand = () => {
  resume();
  if (demanded) return;
  demanded = true;
  notify();
};

export const startRealtimeConnectionManager = (database, {
  hiddenMs = REALTIME_HIDDEN_SUSPEND_MS,
  idleMs = REALTIME_IDLE_SUSPEND_MS,
} = {}) => {
  if (!database || typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  activeDatabase = database;
  let hiddenTimer = null;
  let idleTimer = null;
  let lastArmedAt = 0;

  const suspend = () => {
    // Сокета ще немає (`_instanceStarted` — SDK ще не створював зʼєднання) —
    // закривати нічого, а `goOffline` якраз його б і створив.
    if (suspended || database._instanceStarted === false) return;
    suspended = true;
    goOffline(database);
    notify();
  };
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(suspend, idleMs);
    lastArmedAt = Date.now();
  };
  const onActivity = () => {
    resume();
    if (Date.now() - lastArmedAt > IDLE_REARM_THROTTLE_MS) armIdle();
  };
  const onVisibility = () => {
    clearTimeout(hiddenTimer);
    if (document.visibilityState === 'hidden') {
      hiddenTimer = setTimeout(suspend, hiddenMs);
      return;
    }
    resume();
    armIdle();
  };

  ACTIVITY_EVENTS.forEach(type => window.addEventListener(type, onActivity, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', onVisibility);
  onVisibility();

  return () => {
    clearTimeout(hiddenTimer);
    clearTimeout(idleTimer);
    ACTIVITY_EVENTS.forEach(type => window.removeEventListener(type, onActivity, { capture: true }));
    document.removeEventListener('visibilitychange', onVisibility);
    // Інші екрани призупиненого зʼєднання не чекають.
    resume();
    activeDatabase = null;
  };
};
