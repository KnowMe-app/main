/**
 * Власна анкета для «Мого профілю» — памʼять пристрою.
 *
 * Сторінка відкривалась із заставкою, поки анкета їхала з бази: вхід Firebase,
 * потім пʼять вузлів анкети, потім ще й лістинг фото в Storage — на телефоні
 * це секунди, і так на кожному перезавантаженні, хоч анкета з минулого разу не
 * змінилась. Тепер сторінка малює те, що було прочитано чи записано минулого
 * разу, а свіже з бази тихо лягає поверх (поля, які людина вже встигла
 * правити, `mergeLoadedProfileData` не перебиває).
 *
 * Лежить тут анкета **так, як вона в базі** (а не стан форми): з неї форма
 * складається тим самим шляхом, що й зі свіжої. Базою порівняння для запису
 * (`persistedProfileRef`) кешована анкета не стає ніколи — перше збереження
 * однаково читає базу, тож застаріле значення з кеша не потрапить у запис як
 * «незмінене».
 *
 * Це дані самої власниці в її ж браузері, і привʼязані вони до uid. Вихід з
 * акаунта стирає їх (`clearMyProfileCache` — у `App` на «користувача немає» й
 * у «Моєму профілі» на «Вийти»), інакше на спільному пристрої наступний читач
 * міг би їх дістати з `localStorage`.
 */

import { isMatchingCacheFresh } from './matchingCachePolicy';

const STORAGE_KEY_PREFIX = 'km.myProfile.v1:';

// Тиждень: старше — це вже не «показати миттєво, поки їде свіже», а показати
// анкету, якої, можливо, вже немає в такому вигляді.
export const MY_PROFILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const buildKey = uid => `${STORAGE_KEY_PREFIX}${uid}`;

export const readMyProfileCache = (uid, now = Date.now()) => {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(buildKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = parsed?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (!Number.isFinite(parsed.cachedAt) || now - parsed.cachedAt > MY_PROFILE_CACHE_TTL_MS) return null;
    return data;
  } catch {
    // Зіпсований чи заблокований `localStorage` коштує лише миттєвого показу.
    return null;
  }
};

/**
 * Та сама анкета як джерело для старту матчингу (`loadViewerProfile`): роль,
 * права й спільні власники реакцій. Тут уже не «показати, поки їде свіже», а
 * «свіже не питати зовсім», тож строк — загальний для кеша матчингу, шість
 * годин, а не тиждень (`utils/matchingCachePolicy`).
 */
export const readFreshMyProfileCache = (uid, now = Date.now()) => {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(buildKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = parsed?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return isMatchingCacheFresh(parsed.cachedAt, { now }) ? data : null;
  } catch {
    return null;
  }
};

export const writeMyProfileCache = (uid, data, now = Date.now()) => {
  if (!uid || !data || typeof data !== 'object') return;
  const { password: _password, ...rest } = data;
  const clean = Object.fromEntries(Object.entries(rest).filter(([key]) => !key.startsWith('__')));
  try {
    localStorage.setItem(buildKey(uid), JSON.stringify({ cachedAt: now, data: clean }));
  } catch {
    // переповнений `localStorage`: наступне відкриття просто почекає на базу
  }
};

// Поле, записане повз загальне збереження (роль — `updateProfileRole`), лягає
// в уже збережену анкету; немає її — нема що й правити.
export const patchMyProfileCache = (uid, patch) => {
  const data = readMyProfileCache(uid);
  if (!data) return;
  writeMyProfileCache(uid, { ...data, ...patch });
};

export const clearMyProfileCache = () => {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // нічого: без `localStorage` і кеша немає
  }
};
