'use strict';

/**
 * Прапорець картки «є публічні відгуки» (`matchingCards/{картка}/hasPublicReview`)
 * рахує сервер, а не той, хто пише відгук.
 *
 * Навіщо. Стрічка розгортає доріжку відгуків і питає їх лише там, де прапорець
 * стоїть, тож він мусить відповідати вузлу `comments/{картка}`. Поки його писав
 * клієнт, видалення й правка відгуку спершу читали, чи лишились інші відгуки
 * (`hasRemainingPublicComments`), — а без звʼязку це читання висить, тож
 * зняти чи поправити відгук без мережі було не можна, і через чергу записів
 * пристрою (`utils/writeOutbox`) вони не йшли. Тригер бачить кожну появу й
 * зникнення відгуку, хоч би хто його писав (зокрема перенос відгуків адміном),
 * і сам вирішує, чи лишився на картці хоч один.
 *
 * Правка тексту прапорця не міняє — тригер на неї не читає нічого.
 */
const PUBLIC_COMMENTS_ROOT = 'comments';
const MATCHING_CARDS_ROOT = 'matchingCards';

const isUsableId = id => typeof id === 'string' && id.trim() !== '' && !/[.#$\[\]/]/.test(id);

/**
 * Час останньої зміни відгуків картки (`matchingCards/{картка}/reviewsAt`).
 *
 * Прапорець міняється лише на першому відгуку й на останньому видаленому, тож
 * другий відгук, правка й видалення одного з кількох картку не чіпали — і
 * журнал змін карток (`recordMatchingCardChange`) про них мовчав: інший читач
 * показував з кешу пристрою (шість годин, разом із порожньою відповіддю)
 * старий список. Ця мітка міняє картку на **кожен** запис відгуку, тож журнал
 * про нього каже, а кеш відгуків звіряє з нею свою версію.
 */
const REVIEWS_AT_FIELD = 'reviewsAt';

/** Чи змінився відгук узагалі (зʼявився, зник чи змінився текст). */
const changesReview = (before, after) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);

/**
 * Поставити мітку зміни відгуків наявній картці. Мітка росте строго: два
 * записи в ту саму мілісекунду інакше дали б ту саму версію, і кеш, що вже
 * прочитав перший, не перечитав би другого.
 */
const stampReviewsChange = async (profileId, { updateCard, now = Date.now() }) => {
  if (!isUsableId(profileId)) return false;
  let stamped = false;
  await updateCard(profileId, card => {
    // Той самий випадок, що й нижче: `null` — локальна копія, а не «немає».
    if (card === null || card === undefined) return null;
    if (typeof card !== 'object') return undefined;
    const previous = Number(card[REVIEWS_AT_FIELD]) || 0;
    stamped = true;
    return { ...card, [REVIEWS_AT_FIELD]: Math.max(now, previous + 1) };
  });
  return stamped;
};

/** Чи змінилась наявність відгуку (зʼявився чи зник), а не його текст. */
const changesReviewPresence = (before, after) => Boolean(before) !== Boolean(after);

/**
 * Привести прапорець картки у відповідність до вузла відгуків.
 *
 * `readHasAny(id)` — чи є під `comments/{id}` бодай один запис;
 * `updateCard(id, updater)` — транзакція над `matchingCards/{id}`: `updater`
 * повертає нову картку, `null` (порожній вузол лишається порожнім) або
 * `undefined` (нічого не міняти). Картки немає —
 * прапорця не ставимо: інакше запис поля завів би картку з одним полем
 * (чернетка, видалена анкета), і стрічка показала б порожній рядок.
 */
// Скільки разів звіряти прапорець із вузлом відгуків, поки вони не зійдуться.
const MAX_RECONCILE_ROUNDS = 5;

const syncPublicReviewFlag = async (profileId, { readHasAny, updateCard }) => {
  if (!isUsableId(profileId)) return false;
  let changed = false;
  let hasAny = Boolean(await readHasAny(profileId));
  // Транзакція стереже картку, а не вузол відгуків, прочитаний окремо: тригер
  // видалення міг прочитати «відгуків немає», а тим часом хтось додав новий,
  // і його тригер уже відпрацював. Записане тоді `false` ховало б живий
  // відгук назавжди — наступної події, що виправила б прапорець, немає. Тож
  // після запису вузол перечитується, і розбіжність записується знову.
  for (let round = 0; round < MAX_RECONCILE_ROUNDS; round += 1) {
    const expected = hasAny;
    await updateCard(profileId, card => {
      // `null` — не «картки немає», а часто локальна копія неслуханого вузла
      // на першому виклику транзакції: перерваний тут запис не дочекався б
      // справжньої картки з сервера. Повертаємо `null` — сервер, де картка є,
      // викличе ще раз уже з нею, а де її немає, запис `null` нічого не заведе.
      if (card === null || card === undefined) return null;
      if (typeof card !== 'object') return undefined;
      if (Boolean(card.hasPublicReview) === expected && (expected || card.hasPublicReview === false)) return undefined;
      changed = true;
      return { ...card, hasPublicReview: expected };
    });
    hasAny = Boolean(await readHasAny(profileId));
    if (hasAny === expected) return changed;
  }
  // Відгуки міняються швидше, ніж ми встигаємо звірити: нехай тригер
  // повторить подію (`retry: true`), а не лишить прапорець неперевіреним.
  throw new Error(`hasPublicReview для ${profileId} не зійшовся з відгуками за ${MAX_RECONCILE_ROUNDS} спроб`);
};

module.exports = {
  PUBLIC_COMMENTS_ROOT,
  MATCHING_CARDS_ROOT,
  REVIEWS_AT_FIELD,
  changesReview,
  stampReviewsChange,
  changesReviewPresence,
  syncPublicReviewFlag,
};
