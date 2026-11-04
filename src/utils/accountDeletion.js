import { VERIFICATION_FUNCTION_REGION } from './emailVerification';

/**
 * Самовидалення профілю — виклик Cloud Function `deleteOwnAccount`
 * (`functions/index.js`, склад видалення — `functions/accountDeletion.js`).
 *
 * Видаляє сервер, а не браузер: частину слідів анкети (`searchId`, чужі
 * переліки) правила власникові не відкривають, і браузер стер би анкету,
 * лишивши її номер у пошуку. Відповідь — одна з причин, які екран уміє сказати
 * словами:
 *
 * - `deleted` — профілю й акаунта більше немає;
 * - `recent-login` — вхід давній, треба увійти ще раз;
 * - `protected` — адмінський чи спільний тестовий акаунт;
 * - `unavailable` — функцію не розгорнуто чи мережа впала: лишається запит
 *   поштою, як було до цієї кнопки.
 */
export const DELETE_ACCOUNT_FUNCTION_NAME = 'deleteOwnAccount';
export const ACCOUNT_DELETION_EMAIL = 'KnowMeEggDonor@gmail.com';
const CALL_TIMEOUT_MS = 120000;

export const classifyAccountDeletionError = error => {
  const code = String(error?.code || '');
  if (code === 'functions/failed-precondition') return 'recent-login';
  if (code === 'functions/permission-denied') return 'protected';
  if (code === 'functions/internal' && error?.details?.failed) return 'partial';
  return 'unavailable';
};

export const requestOwnAccountDeletion = async ({ auth, language } = {}) => {
  const app = auth?.app;
  if (!app || !auth?.currentUser) return { status: 'unavailable' };
  try {
    const { getFunctions, httpsCallable } = await import(/* webpackChunkName: "firebase-functions" */ 'firebase/functions');
    const call = httpsCallable(getFunctions(app, VERIFICATION_FUNCTION_REGION), DELETE_ACCOUNT_FUNCTION_NAME, { timeout: CALL_TIMEOUT_MS });
    const { data } = await call({ language: language || '' });
    if (data?.status === 'deleted') return { status: 'deleted', emailSent: Boolean(data.emailSent) };
    return { status: 'unavailable' };
  } catch (error) {
    console.warn('[accountDeletion] deleteOwnAccount failed', error?.code || error);
    return { status: classifyAccountDeletionError(error) };
  }
};
