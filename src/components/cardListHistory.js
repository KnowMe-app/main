// Картка на `AddNewProfile`, відкрита зі списку чи видачі пошуку, — окремий
// крок історії. Поки адреса картки (`?userId=`) лише заміняла адресу списку,
// «назад» телефона вів повз список на попередній екран, а то й на інший сайт.
// `cardReturn` — `{ listKey, restoring }`: `location.key` запису списку, поверх
// якого відкрито картку, і позначка, що «назад» уже до нього дійшов.

/** «Назад» дійшов до запису списку, а картка ще в стані — час вертати список. */
export const isBackToCardList = ({ cardReturn, locationKey, urlUserId, activeUserId }) =>
  Boolean(cardReturn && cardReturn.listKey === locationKey && !urlUserId && activeUserId);

/**
 * Що робити з адресою, коли змінилась відкрита картка:
 * `skip` — нічого (адреса вже та, або список саме вертається),
 * `push` — новий крок історії, `replace` — заміна поточного.
 * `clearReturn` — картку закрито, запис списку більше не потрібен.
 */
export const planCardUrlWrite = ({
  activeUserId,
  currentUserIdInUrl,
  cardReturn,
  locationKey,
  ownHistoryEntry = false,
}) => {
  if (!activeUserId && !currentUserIdInUrl) return { action: 'skip', clearReturn: true };
  // Поки знімок списку ще не зняв картку зі стану, адресу картки назад не пишемо.
  if (cardReturn?.restoring && cardReturn.listKey === locationKey && !currentUserIdInUrl) {
    return { action: 'skip' };
  }
  if (!activeUserId) return { action: 'remove' };
  if (currentUserIdInUrl === activeUserId) return { action: 'skip' };
  // Відкриття поверх уже відкритої картки лишається заміною: «назад» веде до
  // списку, а не до попередньої картки. Дублікати й «Like/Dislike» кладуть
  // свій запис історії самі (`ownHistoryEntry`).
  const push = !currentUserIdInUrl && !cardReturn && !ownHistoryEntry;
  return { action: push ? 'push' : 'replace' };
};

/** Кнопка «Назад до попереднього списку» робить те саме, що «назад» телефона. */
export const shouldGoBackInHistory = ({ cardReturn, locationKey }) =>
  Boolean(cardReturn && !cardReturn.restoring && cardReturn.listKey !== locationKey);
