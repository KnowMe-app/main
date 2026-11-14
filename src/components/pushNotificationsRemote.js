import { getApp } from 'firebase/app';
import { beforeAuthStateChanged } from 'firebase/auth';
import { ref, remove, serverTimestamp, set } from 'firebase/database';
import { auth, database } from './config';

/**
 * Push-сповіщення на пристрій (Firebase Cloud Messaging).
 *
 * Навіщо: донорка дізнається, що її анкету вподобали, навіть коли застосунок
 * закритий (функція `notifyDonorAboutLike`, `functions/likeNotifications.js`;
 * у сповіщенні лише кількість, без того, хто вподобав).
 *
 * Як: дозвіл браузера → токен FCM на нашому ж service worker
 * (`src/service-worker.js`, подія `push`; окремого `firebase-messaging-sw.js`
 * немає — другий воркер на тому самому scope перебивав би кеш застосунку) →
 * `pushTokens/{uid}/{токен}` = `{ at }`. Читає вузол лише функція; правила
 * пускають власника писати й знімати свій токен.
 *
 * Що вмикається лише там, де справді працюватиме:
 * - прод-збірка з воркером (у режимі розробки воркера немає);
 * - задано публічний VAPID-ключ (`REACT_APP_FIREBASE_VAPID_KEY`, змінна
 *   репозиторію в `deploy.yml`) — без нього блоку в «Моєму профілі» немає;
 * - iPhone — лише коли сайт додано на початковий екран (iOS 16.4+): у Safari
 *   `PushManager` немає зовсім, і замість кнопки людина бачить, як додати.
 *
 * `firebase/messaging` вантажиться на вимогу: у головному файлі він не
 * потрібен нікому, крім тих, хто натиснув кнопку.
 */

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY || '';
const TOKEN_STORAGE_PREFIX = 'km.pushToken.v1:';
const REFRESH_STORAGE_PREFIX = 'km.pushTokenCheckedAt.v1:';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WORKER_WAIT_MS = 4000;
const SIGN_OUT_CLEANUP_WAIT_MS = 1500;

const readStorage = key => {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};
const writeStorage = (key, value) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // приватний режим: токен лишиться лише в базі, наступне відкриття спитає знову
  }
};

const isIosDevice = (nav = typeof navigator !== 'undefined' ? navigator : null) => Boolean(nav)
  && (/iPad|iPhone|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1));

const isStandaloneApp = () => {
  if (typeof window === 'undefined') return false;
  if (window.navigator && window.navigator.standalone === true) return true;
  return Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
};

/**
 * Стан push на цьому пристрої — без жодного запиту й без діалогу дозволу:
 * - `off` — показувати нічого (ключа немає, браузер не вміє, воркера немає);
 * - `ios-install` — iPhone у Safari: спершу додати на початковий екран;
 * - `denied` — дозвіл заблоковано в налаштуваннях браузера;
 * - `default` / `granted` — можна вмикати (чи вже дозволено).
 */
export const readPushAvailability = async () => {
  if (!VAPID_KEY || typeof window === 'undefined' || typeof navigator === 'undefined') return 'off';
  const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasPush) return isIosDevice() && !isStandaloneApp() ? 'ios-install' : 'off';
  const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (!registration) return 'off';
  return window.Notification.permission === 'denied' ? 'denied' : window.Notification.permission;
};

export const isPushEnabledOnDevice = uid => Boolean(uid && readStorage(`${TOKEN_STORAGE_PREFIX}${uid}`))
  && typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted';

const waitForWorker = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, reject) => { setTimeout(() => reject(new Error('service worker not ready')), WORKER_WAIT_MS); }),
]);

const loadMessaging = async () => {
  const messagingModule = await import(/* webpackChunkName: "firebase-messaging" */ 'firebase/messaging');
  if (!(await messagingModule.isSupported())) throw new Error('messaging not supported');
  return { ...messagingModule, messaging: messagingModule.getMessaging(getApp()) };
};

const fetchDeviceToken = async () => {
  const registration = await waitForWorker();
  const { getToken, messaging } = await loadMessaging();
  return getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
};

const writeToken = (uid, token) => set(ref(database, `pushTokens/${uid}/${token}`), { at: serverTimestamp() });
const removeToken = (uid, token) => remove(ref(database, `pushTokens/${uid}/${token}`));

/**
 * Вмикає сповіщення на пристрої: діалог дозволу браузера (лише з дотику —
 * інакше браузери його блокують) і запис токена.
 * @returns {Promise<'granted'|'denied'|'default'>}
 */
export const enablePushNotifications = async uid => {
  if (!uid) throw new Error('no viewer');
  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const token = await fetchDeviceToken();
  const previous = readStorage(`${TOKEN_STORAGE_PREFIX}${uid}`);
  await writeToken(uid, token);
  if (previous && previous !== token) await removeToken(uid, previous).catch(() => {});
  writeStorage(`${TOKEN_STORAGE_PREFIX}${uid}`, token);
  writeStorage(`${REFRESH_STORAGE_PREFIX}${uid}`, String(Date.now()));
  return 'granted';
};

/** Вимикає сповіщення на цьому пристрої (інші пристрої не чіпає). */
export const disablePushNotifications = async uid => {
  const token = readStorage(`${TOKEN_STORAGE_PREFIX}${uid}`);
  writeStorage(`${TOKEN_STORAGE_PREFIX}${uid}`, '');
  writeStorage(`${REFRESH_STORAGE_PREFIX}${uid}`, '');
  if (!token) return;
  await removeToken(uid, token).catch(() => {});
  try {
    const { deleteToken, messaging } = await loadMessaging();
    await deleteToken(messaging);
  } catch {
    // токен у базі вже знято — функція на цей пристрій більше не шле
  }
};

/**
 * Раз на добу звіряє токен пристрою з записаним: FCM час від часу видає новий,
 * і старий перестає доходити. Лише там, де людина вже дозволила, — діалогу
 * тут не буває.
 */
export const refreshPushToken = async uid => {
  if (!uid || !isPushEnabledOnDevice(uid)) return;
  const checkedAt = Number(readStorage(`${REFRESH_STORAGE_PREFIX}${uid}`)) || 0;
  if (Date.now() - checkedAt < REFRESH_INTERVAL_MS) return;
  try {
    const token = await fetchDeviceToken();
    const previous = readStorage(`${TOKEN_STORAGE_PREFIX}${uid}`);
    await writeToken(uid, token);
    if (previous && previous !== token) await removeToken(uid, previous).catch(() => {});
    writeStorage(`${TOKEN_STORAGE_PREFIX}${uid}`, token);
    writeStorage(`${REFRESH_STORAGE_PREFIX}${uid}`, String(Date.now()));
  } catch {
    // без звʼязку чи воркера — спробуємо на наступному відкритті
  }
};

let signOutCleanupInstalled = false;

/**
 * Вихід знімає токен цього пристрою **до** виходу: після нього правила вже не
 * пустять зняти запис, і сповіщення попереднього читача приходили б на
 * пристрій, де вже сидить інша людина. Виходів у застосунку кілька
 * (`signOut` у шести екранах), тож це один хук Firebase, а не правка кожного.
 * Без звʼязку чекаємо щонайбільше 1,5 с — вихід не мусить висіти.
 */
export const installPushSignOutCleanup = () => {
  if (signOutCleanupInstalled) return;
  signOutCleanupInstalled = true;
  try {
    beforeAuthStateChanged(auth, async nextUser => {
      const current = auth.currentUser;
      if (!current || (nextUser && nextUser.uid === current.uid)) return;
      const uid = current.uid;
      const token = readStorage(`${TOKEN_STORAGE_PREFIX}${uid}`);
      if (!token) return;
      writeStorage(`${TOKEN_STORAGE_PREFIX}${uid}`, '');
      writeStorage(`${REFRESH_STORAGE_PREFIX}${uid}`, '');
      await Promise.race([
        removeToken(uid, token).catch(() => {}),
        new Promise(resolve => { setTimeout(resolve, SIGN_OUT_CLEANUP_WAIT_MS); }),
      ]);
    });
  } catch {
    // обʼєкт auth без цього хука (тести з підставним `auth`) — лишаємо як є
  }
};
