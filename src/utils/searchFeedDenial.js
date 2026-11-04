import { isFeedDateExplicitlyDenied } from './matchingSearchResultOrder';

/**
 * Сховану анкету (`feedDate: false`) не бачить ніхто — ні в пошуку, ні в
 * стрічці, ні в колекціях — і рішення про це бере **свіже** значення з бази.
 *
 * Так людина ховає анкету сама («Приховати анкету») і так її ховає видалення
 * акаунта: акаунт входу стерто одразу, а картка й ключі `searchId` лежать до
 * очищення адміном. Картки ж на екран здебільшого приходять з кешу пристрою
 * (шість годин, `utils/matchingCachePolicy`) — і той, хто бачив анкету до
 * видалення, бачив би її далі з колишньою датою публікації.
 *
 * Стан картки для рішення — два поля `matchingCards/{id}`: `feedDate` і
 * `audience`. «Лише для вподобаних» — це теж `feedDate: false`, але з
 * `audience: 'liked'`: таку картку стрічка тим, кого вподобали, показує
 * (`fetchLikedAudienceCards`), а пошук — нікому.
 */

/** Пошук: явне `false` ховає завжди — і «лише для вподобаних» теж. */
export const isFeedStateDeniedForSearch = state => {
  const value = state?.feedDate;
  return value === false || value === 'false';
};

/** Стрічка й колекції: `false` ховає, крім кола «лише для вподобаних». */
export const isFeedStateDeniedForFeed = state => (
  isFeedStateDeniedForSearch(state) && state?.audience !== 'liked'
);

/**
 * Читач стану з памʼяттю вкладки. `peek` відповідає синхронно (для рендеру,
 * який не може чекати), `read` — з бази, `prime` — записати стан, щойно
 * прочитаний іншим запитом (сторінка стрічки вже несе `feedDate`, і питати
 * його вдруге — даремний круг). Збій читання стану не дає: картку лишаємо —
 * стрічка й пошук мусять працювати й без звʼязку.
 */
export const createFeedStateReader = (readState, { ttlMs = 60 * 1000, now = () => Date.now() } = {}) => {
  const memo = new Map();
  const inFlight = new Map();
  const remember = (userId, state) => {
    memo.set(userId, { at: now(), state: state || {} });
  };
  const peek = userId => {
    const cached = memo.get(userId);
    return cached && now() - cached.at < ttlMs ? cached.state : undefined;
  };
  const read = async userId => {
    const cached = peek(userId);
    if (cached) return cached;
    if (inFlight.has(userId)) return inFlight.get(userId);
    const pending = (async () => {
      try {
        const state = await readState(userId);
        remember(userId, state);
        return state || {};
      } catch (error) {
        console.warn('[feedDate] check failed, keeping the card', { userId, error: error?.code || error });
        return null;
      } finally {
        inFlight.delete(userId);
      }
    })();
    inFlight.set(userId, pending);
    return pending;
  };
  return {
    read,
    peek,
    prime: (userId, state) => { if (userId) remember(userId, state); },
    clear: () => { memo.clear(); inFlight.clear(); },
  };
};

const isProfileDraft = user => user?.__profileMutationOperation === 'create';

/**
 * Видача пошуку без схованих анкет. Форма відповіді та сама, що в пошуку: одна
 * картка — сам обʼєкт, кілька — мапа, нічого — `{}`; чужі форми (`null`,
 * масив) проходять як є. Чернетки не питаються: картки стрічки в них немає.
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
    if (isProfileDraft(user)) return true;
    return !(await readDenied(user.userId || id));
  }));
  const kept = entries.filter((entry, index) => keep[index]);
  if (kept.length === entries.length) return result;
  if (!kept.length) return {};
  if (kept.length === 1) return kept[0][1];
  return Object.fromEntries(kept);
};

/**
 * Які рядки стрічки можна показати просто зараз і які треба ще перевірити.
 *
 * Перевіряються всі картки, крім чернеток і `skip` (власна картка читача — її
 * сховане він бачити мусить). Картка без свіжого стану в памʼяті вкладки
 * **не показується, доки його не прочитано** — інакше видалена анкета
 * мигала б на екрані й зникала з-під пальця. Відмова читання стану не дає
 * (`null`), і така картка показується: без звʼязку стрічка не мусить
 * порожніти.
 *
 * @returns {{ visible: object[], pendingIds: string[] }}
 */
export const gateRowsByFeedState = (rows, { peek, isChecked, skip = () => false }) => {
  const visible = [];
  const pendingIds = [];
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const id = row?.userId;
    if (!id || isProfileDraft(row) || skip(row)) {
      visible.push(row);
      return;
    }
    const state = peek(id);
    if (state) {
      if (!isFeedStateDeniedForFeed(state)) visible.push(row);
      return;
    }
    if (isChecked(id)) {
      // Читання вже закінчилось, а стану немає — збій: картку лишаємо.
      visible.push(row);
      return;
    }
    pendingIds.push(id);
  });
  return { visible, pendingIds };
};
