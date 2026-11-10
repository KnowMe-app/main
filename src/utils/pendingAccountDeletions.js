import { listPendingAccountDeletions } from './accountDeletion';

/**
 * Які картки стрічки адміна — видалені власником акаунти, що чекають очищення
 * бази (`accountDeletions/{uid}`, функція `listPendingAccountDeletions`).
 *
 * Навіщо: стрічка адміна навмисно показує й сховані анкети, а видалення
 * акаунта ховає анкету (`feedDate: false`), але саму картку стирає лише
 * адмінське очищення. Людина, яка видалила анкету й зареєструвалась заново
 * (новий акаунт Telegram отримує новий uid), виглядала в стрічці адміна
 * дублем — дві картки з тим самим іменем і телефоном, і нічого не казало,
 * що одна з них уже видалена.
 *
 * Черга мала й міняється рідко, тож читається раз на вкладку (з памʼяттю на
 * `PENDING_DELETIONS_TTL_MS`), а одночасні запити ділять одне читання.
 * Збій — порожній набір: позначка лише підказка, і без неї стрічка така
 * сама, як була.
 */
export const PENDING_DELETIONS_TTL_MS = 10 * 60 * 1000;

let cached = null; // { ownerId, ids: Set<string>, at: number }
let inFlight = null; // { ownerId, promise }

export const readPendingAccountDeletionIds = async ({ auth, now = Date.now() } = {}) => {
  const ownerId = auth?.currentUser?.uid || '';
  if (!ownerId) return new Set();
  if (cached && cached.ownerId === ownerId && now - cached.at < PENDING_DELETIONS_TTL_MS) return cached.ids;
  if (inFlight && inFlight.ownerId === ownerId) return inFlight.promise;
  const promise = listPendingAccountDeletions({ auth })
    .then(result => {
      const ids = new Set((result?.items || []).map(item => item?.uid).filter(Boolean));
      // Збій не памʼятається: наступне відкриття стрічки спробує знову.
      if (!result?.error) cached = { ownerId, ids, at: now };
      return ids;
    })
    .catch(() => new Set())
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { ownerId, promise };
  return promise;
};

/** Після очищення (чи виходу) черга в памʼяті вже неправдива. */
export const forgetPendingAccountDeletions = () => {
  cached = null;
  inFlight = null;
};
