'use strict';

/**
 * Перелік опублікованих карток: `matchingFeedIndex/{картка}` = `{ d, r }` —
 * дата в стрічці (`feedDate`) і ролі картки. Лише картки з датою: схованих
 * (`feedDate: false`, зокрема «лише для вподобаних») і неопублікованих тут
 * немає.
 *
 * Навіщо. Опублікованих у базі кілька сотень із двадцяти тисяч карток, і
 * без переліку застосунок дізнавався, чи картка в стрічці, лише прочитавши її
 * саму. Через це (заміряно наживо 13.11):
 * - пошук поширеного імені читав кожну знайдену картку — «Ольга» дає 487 id,
 *   з них опубліковано 5, а читалось усі 487, щоб поставити опубліковані
 *   першими;
 * - стрічка донорки (умовчання «Тип профілю» — самі агенції) брала
 *   кандидатів з бакета ролі `searchKey` у порядку ключів, а не за датою, тож
 *   щойно опублікована агенція нагору не потрапляла, і серед кандидатів були
 *   неопубліковані, які однаково відсіювались.
 * Перелік цілком — близько 15 КБ, і з ним обидва питання вирішуються без
 * жодного читання карток.
 *
 * Чому тригер. Як і журнал змін (`cardChanges.js`): писачів картки десяток, а
 * тригер бачить кожен запис. Клієнтам писати сюди не треба (правила не пускають).
 * Розкриває перелік не більше, ніж сама картка: дату й роль опублікованої
 * картки й так читає кожен, хто увійшов.
 */
const MATCHING_FEED_INDEX_ROOT = 'matchingFeedIndex';
// Позначка повного заповнення (`scripts/buildFeedIndex.mjs`): поки її немає,
// перелік може бути неповним (тригер пише лише картки, змінені після
// розгортання), і застосунок ним не користується.
const MATCHING_FEED_INDEX_BUILT_KEY = '_built';

const isDateFeed = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeRoles = role => {
  const list = Array.isArray(role) ? role : String(role || '').split(',');
  return [...new Set(list
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => /^[a-z?]{1,8}$/.test(item)))];
};

/** Запис переліку для картки або `null`, коли картки в стрічці немає. */
const buildFeedIndexEntry = card => {
  if (!card || typeof card !== 'object' || !isDateFeed(card.feedDate)) return null;
  return { d: card.feedDate, r: normalizeRoles(card.role).join(',') };
};

const isSameEntry = (a, b) => (a === null && b === null)
  || (Boolean(a) && Boolean(b) && a.d === b.d && a.r === b.r);

const buildFeedIndexPath = cardId => {
  const id = typeof cardId === 'string' ? cardId.trim() : '';
  if (!id || id.startsWith('_') || /[.#$\[\]/]/.test(id)) return null;
  return `${MATCHING_FEED_INDEX_ROOT}/${id}`;
};

/**
 * Обробник тригера: пише чи знімає запис переліку, коли змінилась дата в
 * стрічці чи роль. Решта правок картки переліку не чіпає — запису немає.
 */
const syncFeedIndexEntry = async (cardId, { before, after, setValue }) => {
  const path = buildFeedIndexPath(cardId);
  if (!path) return false;
  const previous = buildFeedIndexEntry(before);
  const next = buildFeedIndexEntry(after);
  if (isSameEntry(previous, next)) return false;
  await setValue(path, next);
  return true;
};

/** Перелік цілком із вузла `matchingCards` (скрипт заповнення). */
const buildFeedIndexFromCards = (cards, { builtAt = Date.now() } = {}) => {
  const index = {};
  Object.entries(cards || {}).forEach(([cardId, card]) => {
    if (!buildFeedIndexPath(cardId)) return;
    const entry = buildFeedIndexEntry(card);
    if (entry) index[cardId] = entry;
  });
  index[MATCHING_FEED_INDEX_BUILT_KEY] = builtAt;
  return index;
};

module.exports = {
  MATCHING_FEED_INDEX_ROOT,
  MATCHING_FEED_INDEX_BUILT_KEY,
  buildFeedIndexEntry,
  buildFeedIndexPath,
  syncFeedIndexEntry,
  buildFeedIndexFromCards,
};
