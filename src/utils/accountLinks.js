import { VERIFICATION_FUNCTION_REGION } from './emailVerification';

/**
 * Один головний акаунт на людину (`functions/accountMerge.js`).
 *
 * Вхід Telegram, Google чи поштою може відкрити **другорядний** акаунт —
 * той, що людина колись завела іншим способом, а потім привʼязала до
 * головного. Функція `resolvePrimaryAccount` на такий вхід віддає токен
 * головного, і застосунок перемикає сесію (`settlePrimaryAccount`): дані —
 * Flow, анкета, реакції — живуть у головному.
 *
 * Перевірка коштує виклик функції, тож іде на кожному **новому** вході
 * (форма входу) і раз на добу з пристрою для сесії, що вже була
 * (`shouldRecheckPrimaryAccount` у `App`): привʼязати другий акаунт могли з
 * іншого пристрою, і телефон, що сидів у ньому, мусить перемкнутись теж.
 */

export const RESOLVE_PRIMARY_FUNCTION_NAME = 'resolvePrimaryAccount';
export const MERGE_ACCOUNT_FUNCTION_NAME = 'mergeAccountInto';
export const PRIMARY_RECHECK_STORAGE_PREFIX = 'km.primaryAccountChecked.v1:';
export const PRIMARY_RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SECONDARY_APP_NAME = 'km-account-merge';

const callFunction = async (app, name, data = {}, timeout = 20000) => {
  const { getFunctions, httpsCallable } = await import(/* webpackChunkName: "firebase-functions" */ 'firebase/functions');
  const call = httpsCallable(getFunctions(app, VERIFICATION_FUNCTION_REGION), name, { timeout });
  const { data: result } = await call(data);
  return result || {};
};

export const shouldRecheckPrimaryAccount = (uid, now = Date.now()) => {
  if (!uid) return false;
  try {
    const last = Number(localStorage.getItem(`${PRIMARY_RECHECK_STORAGE_PREFIX}${uid}`));
    return !Number.isFinite(last) || now - last > PRIMARY_RECHECK_INTERVAL_MS;
  } catch {
    return true;
  }
};

const rememberPrimaryChecked = (uid, now = Date.now()) => {
  try {
    localStorage.setItem(`${PRIMARY_RECHECK_STORAGE_PREFIX}${uid}`, String(now));
  } catch {
    // приватний режим: перевіримо наступного разу
  }
};

/**
 * Питає, чи поточний акаунт головний. `redirect` — сесію перемкнуто на
 * головний (`signInWithCustomToken`); `merged` — у головний щойно долито
 * давню привʼязку (`onMerged` перебудовує картку й індекс з долитого).
 * Збій і тайм-аут вхід не тримають: лишаємось там, де увійшли.
 * @returns {Promise<'primary'|'redirect'|'merged'|'skipped'>}
 */
export const settlePrimaryAccount = async (auth, { timeoutMs = 6000, onMerged } = {}) => {
  const user = auth?.currentUser;
  if (!user) return 'skipped';
  let timer = null;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const result = await Promise.race([
      callFunction(auth.app, RESOLVE_PRIMARY_FUNCTION_NAME).catch(error => {
        console.warn('[accounts] головний акаунт не перевірено', error?.code || error);
        return null;
      }),
      timeout,
    ]);
    if (!result) return 'skipped';
    rememberPrimaryChecked(user.uid);
    if (result.status === 'redirect' && result.token) {
      const { signInWithCustomToken } = await import('firebase/auth');
      const credential = await signInWithCustomToken(auth, result.token);
      rememberPrimaryChecked(credential.user.uid);
      return 'redirect';
    }
    if (result.status === 'merged') {
      if (onMerged) await Promise.resolve(onMerged(user.uid)).catch(() => {});
      return 'merged';
    }
    return 'primary';
  } catch (error) {
    console.warn('[accounts] перемкнути на головний акаунт не вдалося', error?.code || error);
    return 'skipped';
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Окремий екземпляр Auth у памʼяті: увійти в другий акаунт, щоб довести, що
 * він свій, і не чіпати сесію головного.
 */
const getSecondaryAuth = async primaryApp => {
  const { getApps, initializeApp } = await import('firebase/app');
  const { getAuth, inMemoryPersistence, setPersistence } = await import('firebase/auth');
  const app = getApps().find(item => item.name === SECONDARY_APP_NAME)
    || initializeApp(primaryApp.options, SECONDARY_APP_NAME);
  const secondaryAuth = getAuth(app);
  await setPersistence(secondaryAuth, inMemoryPersistence);
  return secondaryAuth;
};

/**
 * Зливає з поточним акаунтом інший, у який людина входить цим `credential`
 * (Google чи пошта з паролем, що вже належать іншому акаунту). Вхід у той
 * акаунт іде окремим екземпляром Auth і закінчується одразу: функції досить
 * його ID-токена, отриманого щойно (≤ 5 хв) паролем чи Google. Про злиття
 * сервер пише на пошту того акаунта (`language` — мова листа).
 * @returns {Promise<{ status: string, reason?: string }>}
 */
export const mergeAccountWithCredential = async (auth, credential, { language } = {}) => {
  const { signInWithCredential, signOut } = await import('firebase/auth');
  const secondaryAuth = await getSecondaryAuth(auth.app);
  try {
    const secondary = await signInWithCredential(secondaryAuth, credential);
    if (secondary.user.uid === auth.currentUser?.uid) return { status: 'already-merged' };
    const idToken = await secondary.user.getIdToken(true);
    return await callFunction(auth.app, MERGE_ACCOUNT_FUNCTION_NAME, { secondaryIdToken: idToken, language }, 60000);
  } finally {
    await signOut(secondaryAuth).catch(() => {});
  }
};
