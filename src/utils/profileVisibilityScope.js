import { canAccessMatchingByLevel, isAdminUid } from './accessLevel';
import { MATCHING_CARD_FEED_FIELD } from './matchingCardIndex';
import { normalizeFeedDateValue } from './profileFieldDerive';

/**
 * Скільки анкети віддавати читачеві, коли картки немає в стрічці.
 *
 * Аудиторія матчингу — це не самі лише адміністратори. Звичайному акаунтові,
 * заведеному з екрана входу, відкривались і `profileDetails`, і
 * `profileContacts` — на будь-яку анкету, хоч і на ту, якої в стрічці немає.
 * Тобто анкету, знайдену за точним контактом, звичайний користувач бачив
 * цілком: прізвище, деталі й контакти, попри те що показу їй ніхто не давав.
 *
 * Межу проводить той самий ключ, що й для самої стрічки, — `feedDate`:
 *
 * - ключ **є** → анкета показана, і читач бачить її як завжди;
 * - ключа **немає** → максимум доступної інформації це `matchingCards`.
 *
 * Службовий доступ (`accessLevel` з `matching`), власник анкети й суперадміни
 * від цієї межі не залежать: саме вони й ведуть анкету до публікації.
 *
 * Справжня межа — у `database.rules.json`, де ті самі три випадки описані
 * правилом читання `profileDetails/$uid` і `profileContacts/$uid`. Тут вона
 * повторена в коді, який складає анкету: щоб застосунок не малював того, що
 * приїхало повз правила — зі старого кеша, з legacy-шару чи з вузла, права на
 * який колись розширять.
 */

/** Чи ця картка в стрічці. Питання про картку, а не про читача. */
export const isCardInMatchingFeed = card => Boolean(
  card
  && typeof card === 'object'
  && normalizeFeedDateValue(card[MATCHING_CARD_FEED_FIELD]),
);

/** Кому анкета відкрита без огляду на те, чи вона в стрічці. */
export const canReadProfileOutsideFeed = ({ profileId, viewerId, accessLevel } = {}) => {
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedProfileId = String(profileId || '').trim();
  if (normalizedViewerId && normalizedProfileId && normalizedViewerId === normalizedProfileId) return true;
  if (isAdminUid(normalizedViewerId)) return true;
  // Права, яких немає на руках, — це не дозвіл. Раніше `null` («застосунок ще
  // не знає») відкривав анкету цілком, бо ключ доступу зʼявляється лише після
  // читання власної анкети, тобто після мережевого круга. Вікно виходило
  // коротким, але справжнім: на холодному відкритті `/matching` пошук встигав
  // прочитати приховану анкету повністю — з контактами — і покласти її в кеш
  // карток, звідки її показували ще годинами. Хто справді має право, того
  // назве прочитаний рівень (`resolveViewerAccessLevel`), а не його
  // відсутність.
  return canAccessMatchingByLevel(accessLevel);
};

/**
 * Власна чернетка картки (`multiData/profileMutations`, `operation: 'create'`).
 *
 * Тіла в решті вузлів вона ще не має, тож питання «чи є картка в стрічці» до
 * неї не стосується: усе, що в ній є, — це те, що читач сам і набрав, і
 * ховати від нього власний набір нема сенсу.
 */
export const isOwnProfileDraftCard = card => String(card?.__profileMutationOperation || '') === 'create';

/**
 * Чи є сенс пропонувати цьому читачеві контакти цієї картки.
 *
 * Питання те саме, що й у `scopeProfileNodesToViewer`, лише задане **до**
 * малювання кнопки, а не після читання вузлів. Картка поза стрічкою, на яку
 * читач права не має, контактів не віддасть — ані кнопці, ані розгорнутому
 * блоку, — а сам значок обіцяв, що віддасть: кожне натискання коштувало круга
 * до бази заради напису «Контактів немає або вони закриті». Правила
 * додаткового доступу (`additionalAccessRules`) тут нічого не змінюють: вони
 * доливають картки в деку, а `profileContacts` відкриває лише `feedDate`.
 */
export const canOfferProfileContacts = ({ card, viewerId, accessLevel } = {}) => {
  if (!card || typeof card !== 'object') return false;
  if (isOwnProfileDraftCard(card)) return true;
  if (isCardInMatchingFeed(card)) return true;
  return canReadProfileOutsideFeed({ profileId: card.userId, viewerId, accessLevel });
};

/**
 * Зводить прочитані вузли до того, що цьому читачеві справді належить бачити.
 *
 * Повертає ті самі частини, якщо анкета показана або читач має на неї право
 * поза стрічкою; інакше лишає саму картку — і знімає legacy-шар, бо контакти
 * фізично лежать і в ньому.
 */
export const scopeProfileNodesToViewer = ({
  profileId,
  viewerId,
  accessLevel,
  parts = {},
  legacy = null,
} = {}) => {
  const cappedToCard = !isCardInMatchingFeed(parts.card)
    && !canReadProfileOutsideFeed({ profileId, viewerId, accessLevel });

  if (!cappedToCard) return { parts, legacy, cappedToCard };

  return {
    parts: {
      card: parts.card || null,
      details: null,
      contacts: null,
      workflow: null,
      technical: null,
    },
    legacy: null,
    cappedToCard,
  };
};
