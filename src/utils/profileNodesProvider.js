/**
 * Єдина точка читання анкети після розділення вузлів.
 *
 * Компонент більше не знає, у якому вузлі лежить поле: він просить картку,
 * деталі або повну анкету, а адаптер вирішує, куди піти. Це не лише охайність —
 * без такої точки кожен новий екран сам вирішував би, чи тягнути йому контакти,
 * і рано чи пізно хтось потягнув би їх у список.
 *
 * Головне правило читання:
 *
 *   список читає тільки `matchingCards`.
 *
 * Контакти, workflow і технічні дані — це окремі вузли з окремими правами, і
 * запитуються вони поштучно, для однієї відкритої картки, і тільки коли їх
 * справді показують. Широкого читання `profileContacts` тут немає взагалі.
 */

import { ref as ref2, get } from 'firebase/database';

import { database } from 'components/config';
import { withAdminDownloadToast } from './backendDownloadToast';
import {
  PROFILE_NODES,
  PROFILE_CONTACT_FIELDS,
  PROFILE_WORKFLOW_FIELDS,
  PROFILE_TECHNICAL_FIELDS,
  PROFILE_DETAIL_FIELDS,
} from './profileNodeSchema';

const readNode = async (node, profileId) => {
  const id = String(profileId || '').trim();
  if (!id) return null;

  try {
    const snapshot = await withAdminDownloadToast(get(ref2(database, `${node}/${id}`)), {
      operation: 'get',
      source: 'profileNodesProvider',
      path: `${node}/${id}`,
    });
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    // Вузол, на який у читача немає прав, — це не збій анкети. `profileContacts`
    // навмисно закритий для більшості читачів, і повна картка має відкритись
    // без нього, а не впасти.
    console.warn('[profileNodes] не вдалося прочитати вузол', { node, profileId: id, error });
    return null;
  }
};

/**
 * Поля вузла, вибрані з legacy-анкети.
 *
 * Міграція йде вручну і не миттєво: доки вона не пройшла, новий вузол для
 * частини анкет порожній, а дані лежать там, де лежали. Читати новий вузол і
 * мовчки показувати порожнечу — найгірший з можливих варіантів, тож поки він
 * порожній, відповідь збирається зі старого місця тим самим переліком полів.
 *
 * Відкат зникне сам собою: щойно анкета мігрована (або бодай раз збережена
 * після розділення), новий вузол непорожній, і legacy більше не читається.
 */
const pickNodeFields = (legacyProfile, fields) => {
  if (!legacyProfile || typeof legacyProfile !== 'object') return null;
  const picked = {};
  fields.forEach(field => {
    if (legacyProfile[field] !== undefined && legacyProfile[field] !== null) {
      picked[field] = legacyProfile[field];
    }
  });
  return Object.keys(picked).length ? picked : null;
};

const readNodeWithLegacyFallback = async (node, profileId, fields, legacyProfile) => {
  const stored = await readNode(node, profileId);
  if (stored) return stored;
  return pickNodeFields(legacyProfile, fields);
};

export const getMatchingCard = profileId => readNode(PROFILE_NODES.matchingCards, profileId);

export const getProfileDetails = (profileId, legacyProfile = null) =>
  readNodeWithLegacyFallback(PROFILE_NODES.profileDetails, profileId, PROFILE_DETAIL_FIELDS, legacyProfile);

export const getContacts = (profileId, legacyProfile = null) =>
  readNodeWithLegacyFallback(PROFILE_NODES.profileContacts, profileId, PROFILE_CONTACT_FIELDS, legacyProfile);

export const getWorkflow = (profileId, legacyProfile = null) =>
  readNodeWithLegacyFallback(PROFILE_NODES.profileWorkflow, profileId, PROFILE_WORKFLOW_FIELDS, legacyProfile);

export const getTechnical = (profileId, legacyProfile = null) =>
  readNodeWithLegacyFallback(PROFILE_NODES.profileTechnical, profileId, PROFILE_TECHNICAL_FIELDS, legacyProfile);

/**
 * Повна анкета — картка стрічки плюс залишкові деталі, і тільки за окремим
 * запитом — контакти, workflow, технічне.
 *
 * Порядок накладання не випадковий: `matchingCards` — базова частина, а
 * `profileDetails` тримає лише те, чого в ній немає. Дублікатів між ними бути
 * не повинно, тож який із двох «виграє», значення не має; накладання деталей
 * зверху лишає місце для навмисно різної деталізації (`surname` проти
 * `surnameShort`), яка приходить окремими ключами і нічого не затирає.
 *
 * Вузли читаються паралельно: чотири послідовні читання перетворили б
 * відкриття картки на чотири затримки мережі поспіль.
 */
export const getFullProfile = async (profileId, options = {}) => {
  const {
    includeContacts = false,
    includeWorkflow = false,
    includeTechnical = false,
    legacyProfile = null,
  } = options;

  const [card, details, contacts, workflow, technical] = await Promise.all([
    getMatchingCard(profileId),
    getProfileDetails(profileId, legacyProfile),
    includeContacts ? getContacts(profileId, legacyProfile) : null,
    includeWorkflow ? getWorkflow(profileId, legacyProfile) : null,
    includeTechnical ? getTechnical(profileId, legacyProfile) : null,
  ]);

  if (!card && !details && !contacts && !workflow && !technical) return null;

  return {
    userId: String(profileId),
    ...(card || {}),
    ...(details || {}),
    ...(contacts || {}),
    ...(workflow || {}),
    ...(technical || {}),
  };
};

/**
 * Персональні `getInTouch` одного власника у вигляді `profileId -> value`.
 *
 * У базі вони лежать навпаки — `owner/value/profileId` — щоб однакове значення
 * не плодило тисячі однакових підструктур. Стара логіка сортування і фільтрів
 * очікує значення на самій картці, тож адаптер перевертає структуру тут, один
 * раз на завантаження списку, і віддає мапу. Сама логіка сортування не
 * змінюється: вона й далі отримує `card.getInTouch`, просто значення приходить
 * не з картки.
 */
export const getOwnerGetInTouchMap = async ownerId => {
  const owner = String(ownerId || '').trim();
  if (!owner) return {};

  try {
    const snapshot = await withAdminDownloadToast(
      get(ref2(database, `multiData/getInTouch/${owner}`)),
      { operation: 'get', source: 'profileNodesProvider', path: `multiData/getInTouch/${owner}` },
    );
    if (!snapshot.exists()) return {};

    const map = {};
    Object.entries(snapshot.val() || {}).forEach(([value, profiles]) => {
      Object.entries(profiles || {}).forEach(([profileId, isSet]) => {
        if (isSet === true) map[profileId] = value;
      });
    });
    return map;
  } catch (error) {
    console.warn('[profileNodes] не вдалося прочитати multiData/getInTouch', { ownerId: owner, error });
    return {};
  }
};

/**
 * Підмішує персональний `getInTouch` у картки перед тим, як їх побачить стара
 * логіка сортування та фільтрації.
 *
 * Це адаптер, а не зміна семантики: картка отримує рівно те поле і рівно те
 * значення, які раніше лежали в ній самій.
 */
export const withOwnerGetInTouch = (cards = [], getInTouchMap = {}) => (
  cards.map(cardEntry => {
    const value = getInTouchMap[cardEntry?.userId];
    return value === undefined ? cardEntry : { ...cardEntry, getInTouch: value };
  })
);
