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
const syncPublicReviewFlag = async (profileId, { readHasAny, updateCard }) => {
  if (!isUsableId(profileId)) return false;
  const hasAny = Boolean(await readHasAny(profileId));
  let changed = false;
  await updateCard(profileId, card => {
    // `null` — не «картки немає», а часто локальна копія неслуханого вузла
    // на першому виклику транзакції: перерваний тут запис не дочекався б
    // справжньої картки з сервера. Повертаємо `null` — сервер, де картка є,
    // викличе ще раз уже з нею, а де її немає, запис `null` нічого не заведе.
    if (card === null || card === undefined) return null;
    if (typeof card !== 'object') return undefined;
    if (Boolean(card.hasPublicReview) === hasAny && (hasAny || card.hasPublicReview === false)) return undefined;
    changed = true;
    return { ...card, hasPublicReview: hasAny };
  });
  return changed;
};

module.exports = {
  PUBLIC_COMMENTS_ROOT,
  MATCHING_CARDS_ROOT,
  changesReviewPresence,
  syncPublicReviewFlag,
};
