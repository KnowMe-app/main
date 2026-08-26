/**
 * Роутер записів: куди лягає поле після розділення вузлів.
 *
 * Рішення «яке значення прийняте» тут не ухвалюється — його вже ухвалила
 * існуюча логіка редагування з її мутаціями, історією і показом старого й
 * нового значення. Роутер відповідає лише на друге питання: у який вузол це
 * значення записати.
 *
 * Запис іде додатково до legacy `/users` та `/newUsers`, а не замість них.
 * Причин дві. Мобільний застосунок читає `/users` і про нові вузли не знає —
 * зламати його не можна. І дані ще не перенесені: поки міграція не пройшла,
 * нові вузли неповні, і зробити їх єдиним джерелом означало б показати
 * порожнечу замість анкети. Тож кожне збереження від сьогодні наповнює новий
 * вузол, а legacy лишається дзеркалом.
 *
 * `matchingCards` цей роутер не чіпає: картка збирається не копіюванням полів,
 * а `buildMatchingCardProjection` — з похідними (`surnameShort`, `rh`,
 * `bloodGroup`, `feedDate`). Її оновлює `syncMatchingCardIndex`, і саме тому
 * правила бази не приймають у картку сирих полів.
 */

import { PROFILE_NODES, resolveFieldOwnerNode } from './profileNodeSchema';

/** Вузли, які наповнює роутер. Картку стрічки пише проєкція, а не копія полів. */
const ROUTED_NODES = new Set([
  PROFILE_NODES.profileDetails,
  PROFILE_NODES.profileContacts,
  PROFILE_NODES.profileWorkflow,
  PROFILE_NODES.profileTechnical,
]);

/**
 * Службові ключі писача, які не є даними анкети.
 *
 * `__`-префікс ставить сам застосунок (позначки джерела, кешу, гідратації), а
 * `undefined` у RTDB означає «не чіпати», а не «видалити».
 */
const isRoutableEntry = ([field, value]) => (
  Boolean(field)
  && !field.startsWith('__')
  && value !== undefined
  && ROUTED_NODES.has(resolveFieldOwnerNode(field))
);

/**
 * Мультилокаційний патч від кореня бази.
 *
 * Один `update` замість чотирьох записів: RTDB застосовує такий патч атомарно,
 * тож анкета не може опинитись наполовину в старому вузлі, а наполовину в
 * новому. `null` лишається `null` — це видалення ключа, і воно має доїхати до
 * нового вузла так само, як доїжджає до legacy.
 */
export const buildProfileNodePatch = (profileId, payload = {}) => {
  const id = String(profileId || '').trim();
  if (!id || !payload || typeof payload !== 'object') return {};

  return Object.entries(payload)
    .filter(isRoutableEntry)
    .reduce((patch, [field, value]) => {
      patch[`${resolveFieldOwnerNode(field)}/${id}/${field}`] = value;
      return patch;
    }, {});
};

/**
 * Які саме вузли зачепить цей патч — для логів і тестів.
 */
export const listTouchedProfileNodes = patch => (
  [...new Set(Object.keys(patch || {}).map(path => path.split('/')[0]))].sort()
);
