import { VERIFICATION_FUNCTION_REGION } from './emailVerification';

/**
 * Вхід через Telegram — клієнтський бік (`functions/telegramAuth.js` — серверний).
 *
 * Застосунок сам генерує `nonce` і відкриває бота посиланням
 * `t.me/<бот>?start=<nonce>`. Посилання стоїть у звичайному `<a href>`, а не
 * у `window.open` після запиту до функції: відкрите не з дотику вікно браузер
 * блокує, а на телефоні саме `<a>` відкриває застосунок Telegram.
 *
 * Поки людина в Telegram, вкладка застосунку може й перезавантажитись
 * (мобільний браузер вивантажує фонові вкладки), тож спроба лежить у
 * `sessionStorage` і продовжується на монтуванні форми входу.
 *
 * Без імені бота (`REACT_APP_TELEGRAM_BOT_USERNAME`) кнопки немає зовсім, і
 * форма лишається поштовою — так застосунок не обіцяє входу, якого ще не
 * розгорнуто.
 */

export const TELEGRAM_BOT_USERNAME = String(process.env.REACT_APP_TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
export const TELEGRAM_COMPLETE_FUNCTION_NAME = 'completeTelegramLogin';
export const TELEGRAM_LOGIN_STORAGE_KEY = 'km.telegramLogin.v1';
// Мусить збігатися з `LOGIN_TTL_MS` у `functions/telegramAuth.js`.
export const TELEGRAM_LOGIN_TTL_MS = 10 * 60 * 1000;
export const TELEGRAM_POLL_INTERVAL_MS = 2500;

export const isTelegramLoginAvailable = (botUsername = TELEGRAM_BOT_USERNAME) => /^[A-Za-z0-9_]{5,32}$/.test(botUsername);

const toBase64Url = bytes => {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const createTelegramLoginNonce = () => {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};

export const buildTelegramLoginLink = (nonce, botUsername = TELEGRAM_BOT_USERNAME) => `https://t.me/${botUsername}?start=${nonce}`;

export const saveTelegramLoginAttempt = attempt => {
  try {
    sessionStorage.setItem(TELEGRAM_LOGIN_STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // Приватний режим: спроба живе лише в памʼяті сторінки.
  }
};

export const readTelegramLoginAttempt = (now = Date.now()) => {
  try {
    const attempt = JSON.parse(sessionStorage.getItem(TELEGRAM_LOGIN_STORAGE_KEY) || 'null');
    if (!attempt || typeof attempt.nonce !== 'string' || !Number.isFinite(attempt.startedAt)) return null;
    if (now - attempt.startedAt > TELEGRAM_LOGIN_TTL_MS) {
      sessionStorage.removeItem(TELEGRAM_LOGIN_STORAGE_KEY);
      return null;
    }
    return attempt;
  } catch {
    return null;
  }
};

export const clearTelegramLoginAttempt = () => {
  try {
    sessionStorage.removeItem(TELEGRAM_LOGIN_STORAGE_KEY);
  } catch {
    // нічого
  }
};

/**
 * Питає функцію, чи бот уже отримав номер. `ready` несе custom token —
 * функція віддає його рівно один раз.
 * @returns {Promise<{ status: 'pending'|'ready'|'expired'|'invalid', started?: boolean, token?: string, isNew?: boolean, profile?: object }>}
 */
export const pollTelegramLogin = async (app, nonce) => {
  const { getFunctions, httpsCallable } = await import(/* webpackChunkName: "firebase-functions" */ 'firebase/functions');
  const call = httpsCallable(getFunctions(app, VERIFICATION_FUNCTION_REGION), TELEGRAM_COMPLETE_FUNCTION_NAME, { timeout: 15000 });
  const { data } = await call({ nonce });
  return data || { status: 'pending' };
};

/**
 * Поля анкети з акаунта Telegram: номер (підтверджений Telegram), нік і
 * імʼя. Порожнього не пишемо — людина допише в «Моєму профілі».
 */
export const buildTelegramProfileData = (profile = {}) => {
  const data = {};
  const phone = String(profile.phone || '').replace(/\D/g, '');
  if (phone) data.phone = phone;
  const username = String(profile.username || '').trim().replace(/^@/, '');
  if (username) data.telegram = username;
  const firstName = String(profile.firstName || '').trim();
  if (firstName) data.name = firstName;
  const lastName = String(profile.lastName || '').trim();
  if (lastName) data.surname = lastName;
  return data;
};
