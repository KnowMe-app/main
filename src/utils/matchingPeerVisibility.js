import { normalizeProfileRole } from './profileRole';

/**
 * У стандартній деці донорка бачить усі картки, крім карток донорок.
 * Невідомі й відсутні ролі залишаються. Роль `ed` завжди перемагає в масиві
 * ролей і не має винятків для власної анкети чи `__matchingAccessAllowed`.
 * Викликач обмежує це правило загальним списком; пошук і реакції проходять повз.
 */

const PEER_HIDDEN_VIEWER_ROLE = 'ed';

/**
 * Ролі, заради яких донорка й відкриває стрічку: агенція, потенційні батьки,
 * клініка/клієнт. `pp` лишається тут разом з `ip` — старі анкети батьків
 * заведені під ним (`hasAgentOrIPRole` у картці читає обидва).
 */
const COUNTERPARTY_ROLES = new Set(['ag', 'ip', 'cl', 'pp']);

const roleValues = value => {
  if (Array.isArray(value)) return value.flatMap(roleValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(roleValues);
  const text = String(value ?? '').trim();
  return text ? [text] : [];
};

/** Ролі картки — нормалізовані й без порожніх. Порядок збережено. */
export const listProfileRoles = user => [
  ...new Set(
    [...roleValues(user?.userRole), ...roleValues(user?.role)]
      .map(value => normalizeProfileRole(value.toLowerCase()))
      .filter(Boolean),
  ),
];

/** Ролі читача по порядку — з масиву, з `['ag','ed']` чи з рядка `'ag,ed'`. */
const listViewerRoles = viewerRole => roleValues(viewerRole)
  .flatMap(value => value.split(','))
  .map(value => normalizeProfileRole(value.trim().toLowerCase()))
  .filter(Boolean);

/**
 * Поточна роль читача — **остання** з поданих.
 *
 * Роль міняють на `MyProfile`, і `deriveRole` її **обʼєднує**: після переходу з
 * агенції в донорки в анкеті лишається `['ag', 'ed']`. Тобто масив тут — це не
 * «і те, і те», а історія, у якої поточне значення останнє, як і в решти полів
 * анкети (`getCurrentValue`).
 *
 * Досі тут стояло `String(viewerRole)`, тобто ціле `'ag,ed'`, якого
 * `normalizeProfileRole` не впізнає взагалі — і вертав він `''`. Через це
 * читачка, яка щойно стала доноркою, далі гортала стрічку як агенція: правило
 * деки її не бачило, а чіпи пропонували їй те, чого в деці не буває.
 *
 * Картки це правило не стосується: там масив ролей справді набір («анкета
 * заявила себе і агенцією, і доноркою»), і читає його `listProfileRoles`.
 */
export const resolveViewerCurrentRole = viewerRole => {
  const roles = listViewerRoles(viewerRole);
  return roles.length ? roles[roles.length - 1] : '';
};

/** Чи ця людина дивиться стрічку як донорка. */
export const isDonorViewer = viewerRole =>
  resolveViewerCurrentRole(viewerRole) === PEER_HIDDEN_VIEWER_ROLE;

/** Чи картка не містить донорської ролі. */
export const isNotEggDonorCard = user =>
  !listProfileRoles(user).includes(PEER_HIDDEN_VIEWER_ROLE);

/** Чи ця картка — відомий контрагент донорки. */
export const isCounterpartyCard = user =>
  listProfileRoles(user).some(role => COUNTERPARTY_ROLES.has(role));

/**
 * Прибирає з деки донорки лише картки з роллю `ed`. Поза стандартною декою не
 * застосовується — рішення про це ухвалює викликач.
 */
export const keepDonorCounterpartyCards = ({ users = [], viewerRole } = {}) => {
  if (!isDonorViewer(viewerRole)) return users;
  return users.filter(user => user && isNotEggDonorCard(user));
};

/**
 * Чіпи «Тип профілю», які в деці донорки взагалі можуть щось показати.
 *
 * Шухляда пропонує чотири: `ED`, `AG`, `IP` і `?`. Донорці з них працюють два —
 * `AG` та `IP`: решта контрагентів (`cl`, `pp`) падає в `?`, а `ED` у її деці не
 * буває **ніколи**, бо колег `keepDonorCounterpartyCards` прибирає ще на
 * сторінці джерела.
 */
export const DONOR_FEED_ROLE_FILTER_KEYS = Object.freeze(['ag', 'ip']);

/** Усі чіпи «Типу профілю», у тому порядку, у якому їх малює шухляда. */
export const FEED_ROLE_FILTER_KEYS = Object.freeze(['ed', 'ag', 'ip', 'other']);

/**
 * Які чіпи «Типу профілю» показувати саме цьому читачеві.
 *
 * Донорці `ED` не показуємо зовсім: її дека складається з контрагентів, і цей
 * чіп не може ані додати картку, ані прибрати — він лише обіцяє вибір, якого
 * немає. `?` лишається: під ним ходять `cl` і `pp`, тобто теж контрагенти.
 */
export const listFeedRoleFilterKeysForViewer = viewerRole => (
  isDonorViewer(viewerRole)
    ? FEED_ROLE_FILTER_KEYS.filter(key => key !== PEER_HIDDEN_VIEWER_ROLE)
    : FEED_ROLE_FILTER_KEYS
);

/**
 * Приводить збережений «Тип профілю» до ролі, яку читач має **зараз**.
 *
 * Фільтри переживають зміну ролі — вони лежать у `localStorage`, — і саме тому
 * зміна ролі давала порожній екран: агенція, яка гортала самих донорок
 * (`{ed: true, ag: false, ip: false}`), ставала доноркою й діставала умову,
 * якої її дека виконати не може. Виглядало це як помилка застосунку, хоч
 * фільтр був чинний — для попередньої ролі.
 *
 * Тому робимо дві речі, і обидві лише на зміну ролі:
 *
 * - знята позначка, якої читачеві більше не показують, вмикається назад: вона
 *   все одно нічого не звужує, а лишатись у стані невидимою не має права;
 * - якщо після цього жодної **показаної** позначки не лишилось увімкненою,
 *   група повертається до «все увімкнено»: порожній вибір — це не звуження, а
 *   глухий кут.
 *
 * Обʼєкт повертається той самий, коли міняти нема чого: інакше кожна відповідь
 * на профіль читача виглядала б як нові фільтри й коштувала б перезбирання деки.
 */
export const alignRoleFilterGroupWithViewer = (roleFilters, viewerRole) => {
  if (!roleFilters || typeof roleFilters !== 'object') return roleFilters;

  const offered = new Set(listFeedRoleFilterKeysForViewer(viewerRole));
  const shown = Object.entries(roleFilters).reduce((acc, [key, enabled]) => {
    acc[key] = offered.has(key) ? enabled : true;
    return acc;
  }, {});

  const nothingLeftToShow = [...offered].every(key => !shown[key]);
  const next = nothingLeftToShow
    ? Object.keys(shown).reduce((acc, key) => ({ ...acc, [key]: true }), {})
    : shown;

  const changed = Object.keys(next).some(key => Boolean(next[key]) !== Boolean(roleFilters[key]));
  return changed ? next : roleFilters;
};

/**
 * Чи вимкнула донорка в «Типі профілю» рівно те, що їй тільки й показують.
 *
 * Це не «нічого не знайшлось», а неможлива умова: дека донорки складається з
 * контрагентів, і зняті `AG` та `IP` не лишають у ній нічого, хай яка велика
 * стрічка. Коштувало це дорого й мовчки — обхід **усієї** стрічки (277 карток,
 * вісім кругів до бази) заради `filteredCardsCount: 0`, після чого `hasMore`
 * закривався, спостерігач за кінцем списку вимикався разом з ним, і на екрані
 * лишалось «Фільтри приховали всі завантажені профілі (6)» — про шість карток
 * наданого доступу, тобто не про ту причину — і жодного жесту, яким можна
 * попросити ще. Виглядало це як стрічка, що не вантажиться від самого початку.
 *
 * Увімкнений `?` умови не рятує, і питати про нього тут не треба: під ним
 * ходять `cl` і `pp`, яких у базі одиниці або немає зовсім, а сама відповідь
 * потрібна рівно там, де на екрані вже порожньо. Тобто це не обіцянка «нічого
 * не знайдеться», а назва причини для екрана, який і так нічого не показав.
 */
export const donorFeedRoleFilterLeavesNothing = ({ viewerRole, filters } = {}) => {
  if (!isDonorViewer(viewerRole)) return false;
  const roleFilters = filters?.userRole || filters?.role;
  if (!roleFilters || typeof roleFilters !== 'object') return false;
  // Група без жодної знятої позначки нічого не звужує — і нічого не ламає.
  if (!Object.values(roleFilters).some(enabled => !enabled)) return false;
  return DONOR_FEED_ROLE_FILTER_KEYS.every(key => !roleFilters[key]);
};

/**
 * Підпис ролі читача — щоб «та сама роль» упізнавалась як та сама.
 *
 * Роль читача приїжджає двічі: спершу з відповіді на `fetchUserById`, потім із
 * оновлення профілю доступу. Обидва рази це **новий масив** (`['ag', 'ed']`),
 * і порівняння по посиланню бачило в ньому зміну ролі — стрічка скидала кеш і
 * вантажилась удруге. На екрані це виглядало як скелетон → картки → знову
 * скелетон → знову картки, тобто як зламане завантаження.
 *
 * Тому ролі порівнюються значенням: нормалізовані, без порожніх. Рядок із
 * `localStorage` (`'ag,ed'`) дає той самий підпис, що й масив із бази.
 *
 * А от **порядок зберігається**, і сортувати його не можна. Раніше сортували —
 * «і агенція, і донорка» читалось як набір, — але поточна роль читача тепер
 * саме остання (`resolveViewerCurrentRole`), тож `['ag','ed']` і `['ed','ag']`
 * це дві різні ролі. Зі сортуванням підпис у них збігався, зміну ролі ніхто не
 * помічав, і читачка лишалась зі старою декою й старими чіпами до
 * перезавантаження сторінки.
 */
export const viewerRoleSignature = viewerRole => [
  ...new Set(
    roleValues(viewerRole)
      .flatMap(value => value.split(','))
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  ),
].join(',');
