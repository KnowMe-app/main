import { sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';

/**
 * Лист «Підтвердіть пошту» — один вхід на весь застосунок.
 *
 * Спершу кличемо власну функцію (`functions/index.js`, `sendVerificationEmail`):
 * вона шле брендований лист KnowMe мовою інтерфейсу, з плашкою ролі, а кнопка
 * веде на `/auth/action` нашого домену. Стандартний лист Firebase — сірий
 * англомовний рядок з посиланням на `firebaseapp.com` — лишається запасом:
 * функція не розгорнута, поштовий сервіс відмовив, мережа впала. Тобто
 * реєстрація без листа не лишається ніколи, а функція вмикається сама, щойно
 * її задеплоїли, — без прапорця в збірці.
 *
 * Межа відправок функції (`resource-exhausted`) — не збій, і запасом її не
 * обходимо: відповідаємо тим самим кодом, яким Firebase відповідає на
 * надто часті листи (`auth/too-many-requests`), щоб виклики обробляли його
 * однаково.
 *
 * `firebase/functions` вантажиться лише тут і лише на вимогу: вхід лежить у
 * головному файлі, а лист шлеться раз на реєстрацію.
 */

// Мусить збігатися з `REGION` у `functions/config.js`.
export const VERIFICATION_FUNCTION_REGION = 'europe-west1';
export const VERIFICATION_FUNCTION_NAME = 'sendVerificationEmail';
export const PASSWORD_RESET_FUNCTION_NAME = 'sendPasswordResetEmail';
const CALL_TIMEOUT_MS = 20000;

// Firebase знає китайську лише з регіоном.
const FIREBASE_EMAIL_LANGUAGES = Object.freeze({ zh: 'zh-CN' });

export const toFirebaseEmailLanguage = language => {
  const code = String(language || '').trim().toLowerCase();
  return FIREBASE_EMAIL_LANGUAGES[code] || code || 'uk';
};

/**
 * Мова листів Firebase (запасний лист підтвердження, «Забули пароль?»).
 * Без неї Firebase писав мовою шаблону з консолі, а не мовою людини.
 */
export const applyAuthEmailLanguage = (auth, language) => {
  if (!auth || !language) return;
  auth.languageCode = toFirebaseEmailLanguage(language);
};

const tooManyRequests = () => {
  const error = new Error('Too many verification emails');
  error.code = 'auth/too-many-requests';
  return error;
};

const callMailFunction = async (app, name, payload) => {
  const { getFunctions, httpsCallable } = await import(/* webpackChunkName: "firebase-functions" */ 'firebase/functions');
  const call = httpsCallable(getFunctions(app, VERIFICATION_FUNCTION_REGION), name, { timeout: CALL_TIMEOUT_MS });
  const { data } = await call(payload);
  return data;
};

/**
 * @param {import('firebase/auth').User} user
 * @param {{ auth: import('firebase/auth').Auth, language?: string, role?: string|string[] }} options
 * @returns {Promise<{ via: 'knowme'|'firebase', status: 'sent'|'already-verified' }>}
 */
export const requestVerificationEmail = async (user, { auth, language, role } = {}) => {
  if (!user) throw new Error('requestVerificationEmail: no signed-in user');
  const app = auth?.app || user?.auth?.app;

  if (app) {
    try {
      const data = await callMailFunction(app, VERIFICATION_FUNCTION_NAME, { language: language || '', role: role || '' });
      if (data?.status === 'sent' || data?.status === 'already-verified') {
        return { via: 'knowme', status: data.status };
      }
      console.warn('[emailVerification] unexpected function response, using the Firebase email', data);
    } catch (error) {
      if (error?.code === 'functions/resource-exhausted') throw tooManyRequests();
      console.warn('[emailVerification] KnowMe email failed, using the Firebase email', error?.code || error);
    }
  }

  applyAuthEmailLanguage(auth, language);
  await sendEmailVerification(user);
  return { via: 'firebase', status: 'sent' };
};

/**
 * Лист «Зміна пароля» («Забули пароль?»). Той самий порядок, що й у листа
 * підтвердження: спершу брендований лист функції `sendPasswordResetEmail`
 * (кнопка веде на `/auth/action`, де `AuthActionPage` питає новий пароль), а
 * коли вона не відповіла — стандартний лист Firebase мовою інтерфейсу.
 *
 * Функція відповідає `sent` і тоді, коли акаунта з такою адресою немає, — як і
 * Firebase із захистом від перебору: форма не мусить розкривати, чи є акаунт.
 * Межа відправок — `auth/too-many-requests`, невалідна адреса —
 * `auth/invalid-email`, тож обробник на екрані входу лишився тим самим.
 *
 * @param {string} email
 * @param {{ auth: import('firebase/auth').Auth, language?: string }} options
 */
export const requestPasswordResetEmail = async (email, { auth, language } = {}) => {
  const app = auth?.app;
  if (app) {
    try {
      const data = await callMailFunction(app, PASSWORD_RESET_FUNCTION_NAME, { email, language: language || '' });
      if (data?.status === 'sent') return { via: 'knowme', status: 'sent' };
      console.warn('[passwordReset] unexpected function response, using the Firebase email', data);
    } catch (error) {
      if (error?.code === 'functions/resource-exhausted') throw tooManyRequests();
      if (error?.code === 'functions/invalid-argument') {
        throw Object.assign(new Error('Invalid email'), { code: 'auth/invalid-email' });
      }
      console.warn('[passwordReset] KnowMe email failed, using the Firebase email', error?.code || error);
    }
  }

  applyAuthEmailLanguage(auth, language);
  await sendPasswordResetEmail(auth, email);
  return { via: 'firebase', status: 'sent' };
};
