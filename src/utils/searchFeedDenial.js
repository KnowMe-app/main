import { isFeedDateExplicitlyDenied } from './matchingSearchResultOrder';

/**
 * Сховану анкету (`feedDate: false`) пошук не знаходить — ніхто й ніде.
 *
 * Так людина ховає анкету сама («Приховати анкету») і так її ховає видалення
 * акаунта: акаунт входу стерто одразу, а картка й ключі `searchId` лежать до
 * очищення адміном. Видача вже відкидала `false` (`orderMatchingSearchResults`),
 * але питала картку, яку їй дали, а давав її здебільшого кеш пристрою — і на
 * шість годин після видалення той, хто бачив анкету раніше, знаходив її з
 * датою публікації. Тому рішення бере **свіже** значення з бази
 * (`readDenied`, у `config.js` — точковий `matchingCards/{id}/feedDate`).
 *
 * Чернетки не питаються: картки стрічки в них немає, і ховати їх нема чим.
 * Форма відповіді та сама, що в пошуку: одна картка — сам обʼєкт, кілька —
 * мапа, нічого — `{}`; чужі форми (`null`, масив) проходять як є.
 *
 * @param {object|null} result
 * @param {{ readDenied: (userId: string) => Promise<boolean> }} deps
 */
export const filterFeedDeniedSearchResult = async (result, { readDenied }) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const isSingle = typeof result.userId === 'string';
  const entries = isSingle ? [[result.userId, result]] : Object.entries(result);
  if (!entries.length) return result;
  const keep = await Promise.all(entries.map(async ([id, user]) => {
    if (!user || typeof user !== 'object') return false;
    if (isFeedDateExplicitlyDenied(user)) return false;
    if (user.__profileMutationOperation === 'create') return true;
    return !(await readDenied(user.userId || id));
  }));
  const kept = entries.filter((entry, index) => keep[index]);
  if (kept.length === entries.length) return result;
  if (!kept.length) return {};
  if (kept.length === 1) return kept[0][1];
  return Object.fromEntries(kept);
};

/**
 * Памʼять таба на хвилину: той самий запит, набраний двічі (чи видача, що
 * проходить і пошук, і кеш `Matching`), не платить за ту саму картку двічі.
 * Збій читання картку лишає — пошук мусить відповідати й без звʼязку.
 */
export const createFeedDenialReader = (readFeedDate, { ttlMs = 60 * 1000, now = () => Date.now() } = {}) => {
  const memo = new Map();
  const read = async userId => {
    const cached = memo.get(userId);
    if (cached && now() - cached.at < ttlMs) return cached.denied;
    try {
      const value = await readFeedDate(userId);
      const denied = value === false || value === 'false';
      memo.set(userId, { at: now(), denied });
      return denied;
    } catch (error) {
      console.warn('[search] feedDate check failed, keeping the hit', { userId, error: error?.code || error });
      return false;
    }
  };
  read.clear = () => memo.clear();
  return read;
};
