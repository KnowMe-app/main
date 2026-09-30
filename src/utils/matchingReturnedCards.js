/**
 * Картки, які читач щойно повернув зі «Обраного» чи «Не цікавих» у «Усі».
 *
 * Реакція викидає картку з деки, а зняття реакції нічого туди не вертає:
 * картка просто знову проходить крізь фільтри — і стає туди, де їй місце за
 * датою публікації. Для старої анкети це сота позиція, тобто за кілька
 * сторінок прокрутки, а то й за межею ще не дочитаної стрічки. Читач
 * повертав картку, відкривав «Усі» — і не знаходив її ніде: «не
 * повертається».
 *
 * Тож повернене в цьому перегляді стоїть на початку «Усіх», новіше вище, і
 * лише до перезавантаження сторінки: це відповідь на щойно зроблену дію, а не
 * новий порядок стрічки.
 */

const isMarked = (map, id) => Boolean(map && map[id]);

/**
 * Які id зникли з мапи реакцій колекції, не перейшовши в протилежну.
 *
 * Перехід із «Обраного» в «Не цікаві» (і навпаки) — це нова реакція, а не
 * повернення: такій картці в «Усіх» не місце.
 */
export const listReturnedReactionIds = ({
  previousMap,
  nextMap,
  oppositeMap,
} = {}) => Object.keys(previousMap || {})
  .filter(id => isMarked(previousMap, id))
  .filter(id => !isMarked(nextMap, id) && !isMarked(oppositeMap, id));

/**
 * Ставить повернені картки на початок деки.
 *
 * Та сама картка, дочитана пагінацією, другий раз не показується; картка, на
 * яку читач відреагував знову, з голови деки знімається — її прибере звичайна
 * логіка реакцій.
 */
export const placeReturnedCardsFirst = ({
  users,
  returnedCards,
  favoriteUsers,
  dislikeUsers,
} = {}) => {
  const list = Array.isArray(users) ? users : [];
  const returned = (Array.isArray(returnedCards) ? returnedCards : [])
    .filter(card => card?.userId)
    .filter(card => !isMarked(favoriteUsers, card.userId) && !isMarked(dislikeUsers, card.userId));
  if (!returned.length) return list;

  const returnedIds = new Set(returned.map(card => card.userId));
  // Свіжіша версія картки — та, що вже в деці: пагінація могла дочитати її
  // після повернення.
  const loadedById = new Map(list.filter(user => returnedIds.has(user?.userId)).map(user => [user.userId, user]));
  return [
    ...returned.map(card => loadedById.get(card.userId) || card),
    ...list.filter(user => !returnedIds.has(user?.userId)),
  ];
};

/**
 * Другий крок того самого: після злиття деки повернене піднімається нагору
 * ще раз.
 *
 * Злиття ставить свої голови — власні чернетки за датою
 * (`placeOwnDraftsInFeed`), пачку наданих карток з входу — і стара повернена
 * картка опинялась під ними, тобто знов не там, куди читач дивиться. Вставляти
 * тут нічого не можна: дека вже пройшла правила показу, і картки, якої в ній
 * немає, тут не має бути й надалі.
 */
export const liftReturnedCards = (users, returnedCards) => {
  const list = Array.isArray(users) ? users : [];
  const order = (Array.isArray(returnedCards) ? returnedCards : []).map(card => card?.userId).filter(Boolean);
  if (!order.length) return list;
  const rank = new Map(order.map((id, index) => [id, index]));
  const lifted = list.filter(user => rank.has(user?.userId)).sort((a, b) => rank.get(a.userId) - rank.get(b.userId));
  if (!lifted.length) return list;
  return [...lifted, ...list.filter(user => !rank.has(user?.userId))];
};
