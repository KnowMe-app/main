import { isAdminUid } from './accessLevel';
import { MATCHING_CARD_FEED_FIELD } from './matchingCardIndex';

/**
 * Скільки анкети віддавати читачеві, коли картки немає в стрічці.
 *
 * Аудиторія матчингу — це не самі лише адміністратори. Акаунт, заведений з
 * екрана входу як агенція, теж має роль, відмінну від `ed`, і саме за нею йому
 * відкривались і `profileDetails`, і `profileContacts` — на будь-яку анкету,
 * хоч і на ту, якої в стрічці немає. Тобто анкету, знайдену за точним
 * контактом, звичайний користувач бачив цілком: прізвище, деталі й контакти,
 * попри те що показу їй ніхто не давав.
 *
 * Межу проводить той самий ключ, що й для самої стрічки, — `feedDate`:
 *
 * - ключ **є** → анкета показана, і читач бачить її як завжди;
 * - ключа **немає** → максимум доступної інформації це `matchingCards`.
 *
 * Виданий рівень доступу цієї межі не знімає. Спершу її не помічав кожен, чий
 * `accessLevel` містив `matching`, — тобто рівно те, що видають агенції, щоб
 * вона взагалі побачила стрічку («перегляд matching»). Виходило, що межа
 * стосувалась лише акаунтів без жодного рівня, а всі інші читали приховану
 * анкету цілком — з контактами. Тепер від межі не залежать тільки двоє:
 * власниця анкети (це її дані) і суперадміни з `ADMIN_UIDS` (це вони ведуть
 * анкету до публікації). Решті — картка, хай який рівень їм видано.
 *
 * Справжня межа — у `database.rules.json`, де ті самі випадки описані
 * правилом читання `profileDetails/$uid` і `profileContacts/$uid`. Тут вона
 * повторена в коді, який складає анкету: щоб застосунок не малював того, що
 * приїхало повз правила — зі старого кеша, з legacy-шару чи з вузла, права на
 * який колись розширять.
 */

/** Чи ця картка в стрічці. Питання про картку, а не про читача. */
export const isCardInMatchingFeed = card => Boolean(
  card
  && typeof card === 'object'
  && String(card[MATCHING_CARD_FEED_FIELD] || '').trim(),
);

/**
 * Кому анкета відкрита без огляду на те, чи вона в стрічці.
 *
 * Питання лише про двох: власницю анкети й суперадміна. Рівень доступу тут не
 * питається навмисно — саме він і був дірою: `accessLevel` зі словом
 * `matching` має кожна агенція, якій відкрили стрічку, і поки він означав
 * «службовий доступ», прихована анкета була для неї такою ж відкритою, як і
 * показана.
 */
export const canReadProfileOutsideFeed = ({ profileId, viewerId } = {}) => {
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedProfileId = String(profileId || '').trim();
  if (normalizedViewerId && normalizedProfileId && normalizedViewerId === normalizedProfileId) return true;
  return isAdminUid(normalizedViewerId);
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
  parts = {},
  legacy = null,
} = {}) => {
  const cappedToCard = !isCardInMatchingFeed(parts.card)
    && !canReadProfileOutsideFeed({ profileId, viewerId });

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
