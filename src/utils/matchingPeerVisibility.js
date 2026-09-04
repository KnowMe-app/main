import { normalizeProfileRole } from './profileRole';

/**
 * Донорка гортає стрічку контрагентів, а не колег.
 *
 * Стрічка матчингу відповідає на питання «кого мені шукати», і в донорки це
 * питання конкретне: агенція, яка підбере програму, клініка, потенційні батьки.
 * Чужі донорські анкети на нього не відповідають — вона в цій стрічці не читач
 * каталогу, а сама анкета.
 *
 * Спершу правило було сформульоване як «прибрати картки колег»: ховались лише
 * ті, чиї ролі всі до одної `ed`. Виявилось, що це не те саме. Картка, у якої
 * ролі немає взагалі (а таких у базі більшість — роль зʼявилась пізніше за самі
 * анкети), під «колегу» не підпадала й лишалась у стрічці. Донорка відкривала
 * список і бачила там купу анкет невідомо кого — тобто рівно те, від чого
 * правило й мало захистити. Тож умова перевернута: у стрічці лишається те, що
 * **впізнане як контрагент**, а не все, що не впізнане як колега. Невідома роль
 * — це не контрагент.
 *
 * Правило діє **у стрічці**, а не в пошуку. Це і є його межа: якщо донорка
 * вводить конкретний контакт чи імʼя, вона питає про конкретну людину, і
 * мовчати у відповідь означало б не відповісти на запит — так само, як це було
 * б із неопублікованою анкетою. Тому воно застосовується лише до деки за
 * замовчуванням: пошук, реакції й окремо надані картки проходять повз нього.
 *
 * Два винятки — свідомі:
 *
 * - **власна анкета** лишається видимою: це єдина картка, яку читачка веде;
 * - **явно наданий доступ** (`__matchingAccessAllowed`) б'є це правило так
 *   само, як б'є `publish`: правила додаткового доступу для того й існують.
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

/** Чи ця людина дивиться стрічку як донорка. */
export const isDonorViewer = viewerRole =>
  normalizeProfileRole(String(viewerRole ?? '').trim().toLowerCase()) === PEER_HIDDEN_VIEWER_ROLE;

/**
 * Чи ця картка — контрагент донорки.
 *
 * Досить однієї впізнаної ролі з переліку: анкета, яка заявила себе і агенцією,
 * і доноркою, лишається в стрічці агенцією. Роль, якої застосунок не знає, і
 * відсутня роль контрагента не роблять.
 */
export const isCounterpartyCard = user =>
  listProfileRoles(user).some(role => COUNTERPARTY_ROLES.has(role));

/**
 * Лишає в деці донорки самих контрагентів. Поза декою за замовчуванням не
 * застосовується — рішення про це ухвалює викликач.
 */
export const keepDonorCounterpartyCards = ({ users = [], viewerRole, viewerId } = {}) => {
  if (!isDonorViewer(viewerRole)) return users;
  const ownId = String(viewerId || '').trim();

  return users.filter(user => {
    if (!user) return false;
    if (ownId && String(user.userId || '').trim() === ownId) return true;
    if (user.__matchingAccessAllowed === true) return true;
    return isCounterpartyCard(user);
  });
};
