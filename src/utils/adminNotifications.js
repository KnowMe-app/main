import { VERIFICATION_FUNCTION_REGION } from './emailVerification';

/**
 * Виклики функцій сторінки сповіщень адміна (`functions/index.js`):
 * `adminNotificationStatus` (чи привʼязано Telegram, скільки пристроїв для
 * push) і `sendAdminTestNotification`. Обидві пускають лише адмінів.
 */
const CALL_TIMEOUT_MS = 20000;

const callFunction = async (auth, name, payload = {}) => {
  const { getFunctions, httpsCallable } = await import(/* webpackChunkName: "firebase-functions" */ 'firebase/functions');
  const call = httpsCallable(getFunctions(auth.app, VERIFICATION_FUNCTION_REGION), name, { timeout: CALL_TIMEOUT_MS });
  const result = await call(payload);
  return result?.data || {};
};

export const fetchAdminNotificationStatus = auth => callFunction(auth, 'adminNotificationStatus');

export const sendAdminTestNotification = auth => callFunction(auth, 'sendAdminTestNotification');

const OUTCOME_TEXTS = {
  telegram: 'Telegram — надіслано',
  'telegram-not-linked': 'Telegram не привʼязано до цього акаунта',
  'push-no-devices': 'Push — немає жодного пристрою з дозволом',
  'push-failed': 'Push — не вдалося надіслати',
};

/** Відповідь тестового надсилання → зрозумілі рядки. */
export const describeTestOutcomes = (outcomes = []) => {
  if (!outcomes.length) return ['Жоден канал не ввімкнено'];
  return outcomes.map(outcome => {
    if (OUTCOME_TEXTS[outcome]) return OUTCOME_TEXTS[outcome];
    const push = /^push-(\d+)$/.exec(outcome);
    if (push) return `Push — надіслано на пристроїв: ${push[1]}`;
    if (outcome.startsWith('telegram-failed')) return 'Telegram — бот не зміг надіслати (бот зупинено?)';
    return outcome;
  });
};
