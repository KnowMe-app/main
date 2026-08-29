/**
 * Роутер записів: куди лягає поле після розділення вузлів.
 *
 * Рішення «яке значення прийняте» тут не ухвалюється — його вже ухвалила
 * існуюча логіка редагування з її мутаціями, історією і показом старого й
 * нового значення. Роутер відповідає лише на друге питання: у який вузол це
 * значення записати.
 *
 * Запис іде додатково до legacy `/users`, а не замість неї.
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

import {
  PROFILE_NODES,
  resolveCanonicalFieldName,
  resolveFieldOwnerNode,
  twinSourceRank,
} from './profileNodeSchema';

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
 *
 * Близнюки дорогою зводяться в один ключ. Застосунок і далі пише в legacy
 * обидві копії дати (`lastLogin` крапками, `lastLogin2` в ISO) — мобільний
 * читає першу, і чіпати це не можна. Але в новому вузлі копія одна, ISO, під
 * коротким ім'ям: саме так її поклала міграція. Виграє вона незалежно від
 * того, в якому порядку ключі лежать у payload, — інакше результат залежав би
 * від порядку властивостей обʼєкта, тобто ні від чого.
 */
export const buildProfileNodePatch = (profileId, payload = {}) => {
  const id = String(profileId || '').trim();
  if (!id || !payload || typeof payload !== 'object') return {};

  const ranks = {};

  return Object.entries(payload)
    .filter(isRoutableEntry)
    .reduce((patch, [field, value]) => {
      const canonical = resolveCanonicalFieldName(field);
      const path = `${resolveFieldOwnerNode(field)}/${id}/${canonical}`;
      const rank = twinSourceRank(field);

      if (path in patch && ranks[path] <= rank) return patch;

      ranks[path] = rank;
      patch[path] = value;
      return patch;
    }, {});
};

/**
 * Які саме вузли зачепить цей патч — для логів і тестів.
 */
export const listTouchedProfileNodes = patch => (
  [...new Set(Object.keys(patch || {}).map(path => path.split('/')[0]))].sort()
);
