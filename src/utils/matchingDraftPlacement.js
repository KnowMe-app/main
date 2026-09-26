import { compareUsersByLastLogin2 } from './matchingDataProvider';

/*
 * Власна чернетка стоїть у стрічці за датою створення, а не нагорі назавжди.
 *
 * Досі чернетки читача йшли головою деки: їх фіксована жменя, і хвіст списку
 * мусить належати пагінації (туди дивляться, чекаючи порції). Але голова теж
 * не їхня — стрічка впорядкована за `feedDate`, і картка, заведена тиждень
 * тому, висіла над усім, що зʼявилось відтоді. Читач бачить одні й ті самі
 * власні картки першими щодня, а свіже — під ними.
 *
 * Тепер чернетка — звичайний рядок стрічки: стає перед першою старшою за
 * неї карткою, і нові картки її штовхають униз. Хвіст пагінації при цьому
 * лишається чистим: чернетку, старшу за все вже завантажене, не ставлять у
 * кінець, поки стрічка ще має сторінки, — інакше наступна порція лягла б над
 * нею і порядок зламався б. Вона зʼявляється тоді, коли стрічка дійде до її
 * дати, або коли сторінок більше немає.
 *
 * Датою служить `feedDate` чернетки, якщо він у неї є, інакше день створення
 * (`createdAt` запису мутації). Лежить вона в окремому ключі
 * (`DRAFT_FEED_ORDER_FIELD`), а не в `lastLogin2`: за `lastLogin2`
 * `isCardInMatchingFeed` вирішує, чи картка опублікована, а чернетка — ні.
 */
export const DRAFT_FEED_ORDER_FIELD = '__feedOrderDate';

const pad = value => String(value).padStart(2, '0');

export const toFeedDateKey = timestamp => {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const resolveDraftFeedOrderDate = (profile = {}, mutation = {}) => {
  const own = typeof profile?.lastLogin2 === 'string' ? profile.lastLogin2.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  return toFeedDateKey(mutation?.createdAt) || toFeedDateKey(mutation?.updatedAt);
};

const asFeedRow = card => (card?.[DRAFT_FEED_ORDER_FIELD]
  ? { ...card, lastLogin2: card[DRAFT_FEED_ORDER_FIELD] }
  : card);

// Та сама впорядкованість, що й у сторінки стрічки (`compareUsersByLastLogin2`).
const standsBefore = (draft, card) => compareUsersByLastLogin2(asFeedRow(draft), asFeedRow(card)) < 0;

export const placeOwnDraftsInFeed = ({ drafts = [], users = [], hasMore = false } = {}) => {
  if (!drafts.length) return users;
  const pending = [...drafts].sort((a, b) => compareUsersByLastLogin2(asFeedRow(a), asFeedRow(b)));
  const result = [];
  let next = 0;
  users.forEach(card => {
    while (next < pending.length && standsBefore(pending[next], card)) {
      result.push(pending[next]);
      next += 1;
    }
    result.push(card);
  });
  // Старші за все завантажене чекають, доки стрічка до них дійде.
  if (!hasMore) result.push(...pending.slice(next));
  return result;
};
