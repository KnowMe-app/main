import { listCardAnketaRoles } from './cardAnketas';

/*
 * Реакція на анкету, а не на людину.
 *
 * Донорка, яка ще й агентка, у стрічці — дві анкети (`listCardAnketaRoles`), і
 * лайк донорської не означає лайку агентської. Роль анкети лежить у
 * **значенні** реакції, а ключ лишається id картки:
 *
 *   multiData/favorites/{читач}/{картка} = 'ed'       — вподобано донорську
 *   multiData/favorites/{читач}/{картка} = 'ed,ag'    — обидві (так само `true`)
 *   multiData/favorites/{читач}/{картка} = true       — людину цілком
 *
 * Суфікс у ключі (`{картка}_ed`) тут розглядали й відкинули: ключ реакції всюди
 * читається як id картки — `fetchUserById`, кеші реакцій, спільні реакції
 * адмінів, лічильники, — і кожне з цих місць довелось би вчити розбирати id.
 * А id карток бувають push-ключами, у яких `_` і `-` — звичайні символи, тож
 * розбір був би ще й неоднозначним. У значенні ж роль нікому не заважає: всі
 * читачі питають лише, чи воно truthy, а старі записи (`true`, мітка часу
 * дизлайку) так і лишаються «людина цілком». Правила значення не перевіряють,
 * тож ручного викочування це не потребує.
 *
 * Картка з однією анкетою пише, як і раніше, `true` / мітку часу.
 */

const ROLE_LIST_RE = /^[a-z]{2}(,[a-z]{2})*$/;

/** Ролі, яких стосується значення реакції; `null` — людина цілком. */
export const readReactionRoles = value => {
  if (!value) return [];
  if (typeof value === 'string' && ROLE_LIST_RE.test(value.trim())) return value.trim().split(',');
  return null;
};

/** Чи реакція стосується саме цієї анкети (`''` — картка без розщеплення). */
export const reactionCoversAnketa = (value, anketaRole) => {
  if (!value) return false;
  if (!anketaRole) return true;
  const roles = readReactionRoles(value);
  return roles === null || roles.includes(anketaRole);
};

/**
 * Анкети картки, яких читач у деці ще не вирішив. Порожньо — картку з деки
 * прибирають, як і раніше прибирали картку з реакцією. Анкети схованих для
 * читача ролей (`hiddenRoles`) не рахуються: донорка, якій агентська анкета
 * донорки-агентки сподобалась, свою донорську там не побачить і так.
 */
export const listUnreactedAnketaRoles = (user, favorites = {}, dislikes = {}, hiddenRoles = []) => {
  const id = user?.userId;
  const roles = listCardAnketaRoles(user).filter(role => !hiddenRoles.includes(role));
  if (!roles.length) return favorites[id] || dislikes[id] ? [] : [''];
  return roles.filter(role => !reactionCoversAnketa(favorites[id], role) && !reactionCoversAnketa(dislikes[id], role));
};

/** Чи картку з деки прибирає реакція: вирішено кожну видиму анкету. */
export const isCardFullyReacted = (user, favorites = {}, dislikes = {}, hiddenRoles = []) => {
  const id = user?.userId;
  if (!id || (!favorites[id] && !dislikes[id])) return false;
  return listUnreactedAnketaRoles(user, favorites, dislikes, hiddenRoles).length === 0;
};

/**
 * Нове значення реакції після дотику до анкети `anketaRole`.
 * `undefined` — ключ треба зняти. `fullValue` — що писати, коли реакція
 * накрила всі анкети картки (`true` для лайку, мітка часу для дизлайку).
 */
export const toggleAnketaReactionValue = ({ value, anketaRole, cardRoles, fullValue }) => {
  const covered = readReactionRoles(value);
  const current = covered === null ? [...cardRoles] : covered;
  const next = current.includes(anketaRole)
    ? current.filter(role => role !== anketaRole)
    : [...current, anketaRole];
  if (!next.length) return undefined;
  if (cardRoles.every(role => next.includes(role))) return fullValue;
  return cardRoles.filter(role => next.includes(role)).join(',');
};

/** Значення реакції без анкети `anketaRole` (лайк знімає дизлайк тієї ж анкети). */
export const removeAnketaFromReactionValue = ({ value, anketaRole, cardRoles }) => {
  if (!value) return undefined;
  const covered = readReactionRoles(value);
  const current = covered === null ? [...cardRoles] : covered;
  if (!current.includes(anketaRole)) return value;
  const next = current.filter(role => role !== anketaRole);
  return next.length ? cardRoles.filter(role => next.includes(role)).join(',') : undefined;
};

/**
 * Id карток, реакція на які стосується людини цілком. Лише їх можна
 * виключати ще на сторінці джерела: картка з реакцією на одну анкету мусить
 * дійти до деки, бо друга анкета ще чекає рішення.
 */
export const listWholeCardReactionIds = (map = {}) => Object.entries(map || {})
  .filter(([id, value]) => id && value && readReactionRoles(value) === null)
  .map(([id]) => id);
