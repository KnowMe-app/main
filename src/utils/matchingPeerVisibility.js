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

/**
 * Ролі читача з його анкети — обидва ключі разом, як і в картки.
 *
 * Стрічка брала `userRole || role`, тобто перший непорожній ключ: у старих
 * анкетах `userRole` бував `'ed'`, а агенція лежала в `role`, і донорка-агентка
 * гортала стрічку донорки — бачила менше карток, ніж бачила б сама агенція.
 * Друга роль може лише розширити деку (`listViewerHiddenCardRoles`), тож
 * загубити її означає звузити те, що людині доступне.
 */
export const readViewerRolesFromProfile = profile => {
  const roles = listProfileRoles(profile);
  if (roles.length) return roles.join(',');
  return String(profile?.userRole || profile?.role || '');
};

/** Ролі читача по порядку — з масиву, з `['ag','ed']` чи з рядка `'ag,ed'`. */
export const listViewerRoles = viewerRole => roleValues(viewerRole)
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

/*
 * Ролі читача — це **набір** справ, а не історія. Людина, що веде і донорську
 * анкету, і агентську, працює як агенція — їй потрібні всі картки, зокрема
 * інших донорок. А донорка, яка ще й сурогатна мама, лишається «людиною» в
 * обох ролях: колег (інших донорок і СМ) вона не шукає, їй потрібні агенції,
 * клініки й батьки. Тобто кожна додана роль може лише **розширити** деку:
 * роль організації чи батьків знімає звуження цілком.
 *
 * Звужує деку лише читач, у якого всі ролі особисті (`ed`, `sm`), і ховає він
 * рівно анкети своїх ролей (`listViewerHiddenCardRoles`). Доти тут брали
 * поточну (останню) роль, і донорка-агентка гортала стрічку донорки.
 */
const PERSON_VIEWER_ROLES = new Set(['ed', 'sm']);

/*
 * Ховаються **обидві** особисті ролі, а не лише власна. Донорка шукає агенцію,
 * клініку чи батьків, а не сурогатну маму: поки ховалась сама її роль, у
 * стрічці донорки стояли СМ, і рейка пропонувала їй чіп «Сурогатна мати» —
 * а з ним сімейний стан, пологи й резус, тобто фільтри під кандидаток, яких
 * донорка не шукає. Те саме з СМ і донорками.
 */
const PERSON_HIDDEN_CARD_ROLES = Object.freeze(['ed', 'sm']);

export const listViewerHiddenCardRoles = viewerRole => {
  const roles = [...new Set(listViewerRoles(viewerRole))];
  if (!roles.length || roles.some(role => !PERSON_VIEWER_ROLES.has(role))) return [];
  return [...PERSON_HIDDEN_CARD_ROLES];
};

/** Чи ця людина дивиться стрічку як донорка (і лише як людина, без ролі організації). */
export const isDonorViewer = viewerRole =>
  listViewerHiddenCardRoles(viewerRole).includes(PEER_HIDDEN_VIEWER_ROLE);

/** Чи картка не містить донорської ролі. */
export const isNotEggDonorCard = user =>
  !listProfileRoles(user).includes(PEER_HIDDEN_VIEWER_ROLE);

/**
 * Чи лишається в картці бодай одна анкета, яку цьому читачеві показують.
 * Донорка-агентка для донорки-читачки — це агентська анкета: картку лишаємо,
 * а донорський рядок не малюємо (`listFeedRowAnketaRoles`).
 */
export const isCardVisibleForHiddenRoles = (user, hiddenRoles = []) => {
  if (!hiddenRoles.length) return true;
  const roles = listProfileRoles(user);
  if (!roles.some(role => hiddenRoles.includes(role))) return true;
  return roles.some(role => !hiddenRoles.includes(role));
};

/** Чи ця картка — відомий контрагент донорки. */
/**
 * Картка без ролей, яких цей читач у деці не бачить.
 *
 * Картку пропускає будь-яка видима роль (`isCardVisibleForHiddenRoles`), а
 * рядок підписувала основна, тобто остання: анкета `['ip', 'ed']` — людина,
 * що була батьками, а стала донором, — проходила в стрічку донорки через
 * `ip`, а на фото стояло «Донор ооцитів». Донорка, яка шукала агенцію чи
 * батьків, бачила конкурентку. Рядок мусить показувати ту анкету, заради якої
 * картку пропустили. Без змін повертає той самий обʼєкт.
 */
export const withoutHiddenCardRoles = (user, hiddenRoles = []) => {
  if (!user || !hiddenRoles.length) return user;
  const roles = listProfileRoles(user);
  const shown = roles.filter(role => !hiddenRoles.includes(role));
  if (!shown.length || shown.length === roles.length) return user;
  return { ...user, role: shown, userRole: shown };
};

export const isCounterpartyCard = user =>
  listProfileRoles(user).some(role => COUNTERPARTY_ROLES.has(role));

/**
 * Прибирає з деки донорки лише картки з роллю `ed`. Поза стандартною декою не
 * застосовується — рішення про це ухвалює викликач.
 */
export const keepDonorCounterpartyCards = ({ users = [], viewerRole } = {}) => {
  const hiddenRoles = listViewerHiddenCardRoles(viewerRole);
  if (!hiddenRoles.length) return users;
  return users.filter(user => user && isCardVisibleForHiddenRoles(user, hiddenRoles));
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
export const FEED_ROLE_FILTER_KEYS = Object.freeze(['ed', 'sm', 'ag', 'ip', 'other']);

/**
 * Які чіпи «Типу профілю» показувати саме цьому читачеві.
 *
 * Донорці `ED` не показуємо зовсім: її дека складається з контрагентів, і цей
 * чіп не може ані додати картку, ані прибрати — він лише обіцяє вибір, якого
 * немає. `?` лишається: під ним ходять `cl` і `pp`, тобто теж контрагенти.
 */
// Те саме з чіпом «Сурогатна мати» для СМ: дека особистої ролі не має анкет
// своєї ролі (`listViewerHiddenCardRoles`), тож і чіпа для них не показуємо.
export const listFeedRoleFilterKeysForViewer = viewerRole => {
  const hidden = listViewerHiddenCardRoles(viewerRole);
  return hidden.length ? FEED_ROLE_FILTER_KEYS.filter(key => !hidden.includes(key)) : FEED_ROLE_FILTER_KEYS;
};

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
 * «Тип профілю» за замовчуванням для донорки й сурогатної мами — самі агенції.
 *
 * Стрічка особистої ролі складається з контрагентів, і серед них багато
 * порожніх анкет батьків: заведені й не заповнені, вони займали більшу частину
 * екрана. Агенції — це те, заради чого донорка й СМ відкривають стрічку, тож
 * саме з них стрічка й починається; батьків та інших читачка вмикає сама.
 *
 * Повертає `null`, коли читач не особистої ролі: тоді за замовчуванням
 * лишається все.
 */
export const resolvePersonalViewerRoleDefault = (roleFilters, viewerRole) => {
  if (!listViewerHiddenCardRoles(viewerRole).length) return null;
  const keys = roleFilters && typeof roleFilters === 'object'
    ? Object.keys(roleFilters)
    : FEED_ROLE_FILTER_KEYS;
  return keys.reduce((acc, key) => ({ ...acc, [key]: key === 'ag' }), {});
};

/**
 * «Тип профілю» за замовчуванням для біологічних батьків — те, кого вони
 * шукають (`seekingRole` анкети, уже розібраний `parseSeekingRoles`).
 *
 * Батьки й агенція гортали ту саму стрічку в тому самому порядку, а відповідь
 * на «Кого шукаєте» не міняла в ній нічого: батьки, що шукають донорку,
 * починали з сурогатних мам і агенцій. Клініка лежить у «Інших». Порожній
 * набір — батьки ще не вирішили — лишає все: `null`.
 */
const SEEKING_TO_ROLE_FILTER_KEY = Object.freeze({ ed: 'ed', sm: 'sm', ag: 'ag', cl: 'other' });
const PARENT_VIEWER_ROLES = new Set(['ip', 'pp']);

export const resolveParentViewerRoleDefault = (roleFilters, viewerRole, seekingKeys = []) => {
  const roles = listViewerRoles(viewerRole);
  if (!roles.length || roles.some(role => !PARENT_VIEWER_ROLES.has(role))) return null;
  const wanted = new Set((seekingKeys || []).map(key => SEEKING_TO_ROLE_FILTER_KEY[key]).filter(Boolean));
  if (!wanted.size) return null;
  const keys = roleFilters && typeof roleFilters === 'object' && Object.keys(roleFilters).length
    ? [...new Set([...Object.keys(roleFilters), ...FEED_ROLE_FILTER_KEYS])]
    : FEED_ROLE_FILTER_KEYS;
  return keys.reduce((acc, key) => ({ ...acc, [key]: wanted.has(key) }), {});
};

/**
 * «Тип профілю» за замовчуванням для агенції — без агенцій і батьків.
 *
 * Агенція відкриває стрічку, щоб знайти кандидаток, а гортала все підряд:
 * серед перших карток стояли інші агенції, тобто конкуренти, і батьки —
 * здебільшого з-за кордону й з самою поштою. Тепер стрічка починається з
 * донорок і сурогатних мам; агенції й батьків агенція вмикає сама.
 *
 * «Інші» лишаються ввімкненими навмисно, і це не про вміст, а про порядок.
 * Під ними ходять анкети без ролі й клініки — не конкуренти. А група, що
 * вимикає «Інших», відкидає й анкети без ролі, а їх індекс назвати не вміє
 * (порожній бакет не зберігається). Тож такий фільтр стрічка може виконати
 * лише переліченням бакетів (`include`), і картки тоді йдуть у порядку
 * ключів індексу, а не за датою публікації. Саме так уже гортається
 * умовчання донорки. Агенції з її двома сотнями донорок «нові згори» важить
 * більше, тому план тут — лише відкидання, і стрічка йде своїм порядком.
 *
 * Роль агенції серед ролей читача вирішує, хай яка ще поруч: донорка-агентка
 * працює як агенція (звуження деки `listViewerHiddenCardRoles` їй теж не
 * ставить). Клініки тут немає навмисно: для неї агенції — партнери, а не
 * конкуренти. Повертає `null`, коли агенції серед ролей читача немає.
 */
const AGENCY_VIEWER_ROLE = 'ag';
const AGENCY_DEFAULT_HIDDEN_ROLE_FILTER_KEYS = new Set(['ag', 'ip']);

export const resolveAgencyViewerRoleDefault = (roleFilters, viewerRole) => {
  if (!listViewerRoles(viewerRole).includes(AGENCY_VIEWER_ROLE)) return null;
  const keys = roleFilters && typeof roleFilters === 'object' && Object.keys(roleFilters).length
    ? [...new Set([...Object.keys(roleFilters), ...FEED_ROLE_FILTER_KEYS])]
    : FEED_ROLE_FILTER_KEYS;
  return keys.reduce((acc, key) => ({ ...acc, [key]: !AGENCY_DEFAULT_HIDDEN_ROLE_FILTER_KEYS.has(key) }), {});
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
