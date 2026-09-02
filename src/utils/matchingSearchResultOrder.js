import { MATCHING_CARD_FEED_FIELD } from './matchingCardIndex';

/**
 * Склад і порядок відповіді на пошуковий запит.
 *
 * Пошук — не стрічка. Стрічка показує лише картки з `feedDate`, і це її
 * визначення: ключ є → картка в стрічці, ключа немає → її там немає. Запит
 * називає конкретну людину, і відповідати «немає» лише тому, що анкету ще не
 * опублікували, означає ховати від читача те, що він явно шукає: у `searchId`
 * лежать усі анкети, і саме звідти пошук бере id.
 *
 * Тож видача збирається так:
 *
 * - картка з `feedDate` іде першою — опубліковане і є те, за чим приходять;
 * - решта йде за нею у своєму порядку — знайдене, але не показане;
 * - явне `feedDate: false` (чи рядок `'false'`) не показується взагалі: це не
 *   «ще не опублікували», а «показувати не можна».
 *
 * Ключ читається двома іменами навмисно: у самій проєкції він зветься
 * `feedDate`, а `expandMatchingCard` віддає його стрічці під старим іменем
 * `lastLogin2` — за ним сортує і курсор стрічки. Обидві форми доходять сюди.
 */

const readRawFeedValue = user => {
  if (!user || typeof user !== 'object') return undefined;
  const raw = user[MATCHING_CARD_FEED_FIELD];
  return raw === undefined || raw === null ? user.lastLogin2 : raw;
};

/**
 * Явна заборона показу — не те саме, що відсутній ключ.
 *
 * Питається двома іменами, бо картка доїжджає сюди у двох формах. Урізана
 * проєкція (`fetchLimitedProfileById`) несе сирий `feedDate`; повна анкета
 * (`readProfileFromNodes` → `expandMatchingCard`) сирого ключа не має взагалі —
 * розгортання перекладає `false` у `publish: false`. Питати лише перше означало
 * б не побачити сховану анкету на всьому шляху повного доступу.
 */
export const isFeedDateExplicitlyDenied = user => {
  const raw = readRawFeedValue(user);
  if (raw === false || raw === 'false') return true;
  const publish = user?.publish;
  return publish === false || publish === 'false';
};

/** Дата стрічки картки; порожній рядок означає «поза стрічкою». */
export const readSearchResultFeedDate = user => {
  const raw = readRawFeedValue(user);
  return typeof raw === 'string' ? raw.trim() : '';
};

export const isSearchResultInFeed = user => Boolean(readSearchResultFeedDate(user));

/**
 * Порядок стабільний: усередині кожної з двох груп зберігається той порядок, у
 * якому картки приїхали, а опубліковані ще й ідуть від найновішої дати — так
 * само, як їх сортує сама стрічка.
 */
export const orderMatchingSearchResults = (users = []) => {
  const kept = (Array.isArray(users) ? users : [])
    .filter(user => user && !isFeedDateExplicitlyDenied(user));

  const inFeed = [];
  const outsideFeed = [];
  kept.forEach(user => (isSearchResultInFeed(user) ? inFeed : outsideFeed).push(user));

  inFeed.sort((a, b) => readSearchResultFeedDate(b).localeCompare(readSearchResultFeedDate(a)));

  return [...inFeed, ...outsideFeed];
};
