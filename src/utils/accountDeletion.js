import { VERIFICATION_FUNCTION_REGION } from './emailVerification';

/**
 * Видалення акаунта — два кроки, обидва на сервері (`functions/index.js`,
 * склад — `functions/accountDeletion.js`).
 *
 * 1. Людина («Видалити анкету» в «Моєму профілі», `requestOwnAccountDeletion`):
 *    анкета ховається зі стрічки, посилання без входу гаснуть, акаунт входу
 *    видаляється, а запис лягає в чергу адміна.
 * 2. Адмін (сповіщення на `AddNewProfile`, `listPendingAccountDeletions` і
 *    `purgeDeletedAccount`): повне очищення бази від картки й усіх її
 *    звʼязків — чужих реакцій, позначок, індексів, фото.
 *
 * Чому сервер, а не браузер: людина без свіжого входу не може видалити свій
 * акаунт клієнтським SDK (`auth/requires-recent-login`), а очищення зачіпає
 * вузли, яких правила не відкривають навіть адміну (`telegramAccounts`,
 * чужі мапи реакцій, Auth). Адмін-SDK правил не питає, а межу прав тримає
 * сама функція: очищати може лише повний адмін і лише акаунт із черги.
 */
export const DELETE_ACCOUNT_FUNCTION_NAME = 'deleteOwnAccount';
export const LIST_ACCOUNT_DELETIONS_FUNCTION_NAME = 'listPendingAccountDeletions';
export const PURGE_ACCOUNT_FUNCTION_NAME = 'purgeDeletedAccount';
export const ACCOUNT_DELETION_EMAIL = 'KnowMeEggDonor@gmail.com';

const CALL_TIMEOUT_MS = 60000;
// Очищення обходить кореневі вузли цілком (`searchId`, реакції всіх
// власників), тож на великій базі триває помітно довше за звичайний виклик.
const PURGE_TIMEOUT_MS = 300000;

const callFunction = async (auth, name, payload, timeout = CALL_TIMEOUT_MS) => {
  const { getFunctions, httpsCallable } = await import(/* webpackChunkName: "firebase-functions" */ 'firebase/functions');
  const call = httpsCallable(getFunctions(auth.app, VERIFICATION_FUNCTION_REGION), name, { timeout });
  const { data } = await call(payload);
  return data;
};

/**
 * Відповідь функції — одна з причин, які екран уміє сказати словами:
 * - `recent-login` — вхід давній, треба увійти ще раз;
 * - `protected` — адмінський, спільний тестовий чи вимкнений акаунт;
 * - `unavailable` — функцію не розгорнуто чи мережа впала: лишається запит
 *   поштою, як було до цієї кнопки.
 */
export const classifyAccountDeletionError = error => {
  const code = String(error?.code || '');
  if (code === 'functions/failed-precondition') return 'recent-login';
  if (code === 'functions/permission-denied') return 'protected';
  if (code === 'functions/internal' && error?.details?.failed) return 'partial';
  return 'unavailable';
};

export const requestOwnAccountDeletion = async ({ auth, language } = {}) => {
  if (!auth?.app || !auth?.currentUser) return { status: 'unavailable' };
  try {
    const data = await callFunction(auth, DELETE_ACCOUNT_FUNCTION_NAME, { language: language || '' });
    if (data?.status === 'deleted') return { status: 'deleted', emailSent: Boolean(data.emailSent) };
    return { status: 'unavailable' };
  } catch (error) {
    console.warn('[accountDeletion] deleteOwnAccount failed', error?.code || error);
    return { status: classifyAccountDeletionError(error) };
  }
};

/**
 * Черга видалених акаунтів для адміна. `error` — не порожнеча: «нічого
 * очищати» мусить означати саме це, а не нерозгорнуту функцію.
 * @returns {Promise<{ items: Array<object>, canPurge: boolean, error: string }>}
 */
export const listPendingAccountDeletions = async ({ auth } = {}) => {
  if (!auth?.app || !auth?.currentUser) return { items: [], canPurge: false, error: 'unauthenticated' };
  try {
    const data = await callFunction(auth, LIST_ACCOUNT_DELETIONS_FUNCTION_NAME, {});
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      canPurge: Boolean(data?.canPurge),
      error: '',
    };
  } catch (error) {
    console.warn('[accountDeletion] listPendingAccountDeletions failed', error?.code || error);
    return { items: [], canPurge: false, error: String(error?.code || 'unavailable') };
  }
};

/**
 * Повне очищення бази від видаленого акаунта (лише повний адмін).
 * @returns {Promise<{ complete: boolean, failed: string[], counts: object, error: string }>}
 */
export const purgeDeletedAccount = async ({ auth, uid } = {}) => {
  if (!auth?.app || !auth?.currentUser || !uid) {
    return { complete: false, failed: [], counts: {}, error: 'unauthenticated' };
  }
  try {
    const data = await callFunction(auth, PURGE_ACCOUNT_FUNCTION_NAME, { uid }, PURGE_TIMEOUT_MS);
    return {
      complete: Boolean(data?.complete),
      failed: Array.isArray(data?.failed) ? data.failed : [],
      counts: data?.counts && typeof data.counts === 'object' ? data.counts : {},
      error: '',
    };
  } catch (error) {
    console.warn('[accountDeletion] purgeDeletedAccount failed', error?.code || error);
    return { complete: false, failed: [], counts: {}, error: String(error?.code || 'unavailable') };
  }
};

/** Скільки записів знято — одним рядком для звіту адміна. */
export const summarizePurgeCounts = counts => Object.values(counts || {})
  .reduce((sum, value) => sum + (Number(value) || 0), 0);
