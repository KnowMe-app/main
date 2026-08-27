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
 *
 * Самі читання живуть у `components/config` разом із рештою доступу до бази —
 * тут лише те, як з них складається відповідь. Двох реалізацій немає навмисно:
 * розійшовшись, вони давали б різну анкету на різних екранах.
 */

import { ref as ref2, get } from 'firebase/database';

import {
  database,
  readProfileFromNodes,
  readOwnerGetInTouchMap,
  setOwnerGetInTouch,
  invalidateOwnerGetInTouchMap,
  readOwnerWriterMap,
  setOwnerWriter,
  invalidateOwnerWriterMap,
} from 'components/config';
import { withAdminDownloadToast } from './backendDownloadToast';
import { PROFILE_NODES } from './profileNodeSchema';

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
    // може бути звужений до окремої категорії людей, і повна картка має
    // відкритись без нього, а не впасти.
    console.warn('[profileNodes] не вдалося прочитати вузол', { node, profileId: id, error });
    return null;
  }
};

export const getMatchingCard = profileId => readNode(PROFILE_NODES.matchingCards, profileId);
export const getProfileDetails = profileId => readNode(PROFILE_NODES.profileDetails, profileId);
export const getContacts = profileId => readNode(PROFILE_NODES.profileContacts, profileId);
export const getWorkflow = profileId => readNode(PROFILE_NODES.profileWorkflow, profileId);
export const getTechnical = profileId => readNode(PROFILE_NODES.profileTechnical, profileId);

/**
 * Повна анкета — картка стрічки плюс залишкові деталі, і тільки за окремим
 * запитом контакти, workflow і технічне.
 *
 * Вузли читаються паралельно: чотири послідовні читання перетворили б
 * відкриття картки на чотири затримки мережі поспіль.
 *
 * `legacy` — анкета зі старої колекції, якщо викликач її вже має. Поки не всі
 * анкети переїхали, вона лягає найпершим шаром і перекривається новими вузлами
 * там, де вони непорожні.
 */
export const getFullProfile = (profileId, options = {}) => readProfileFromNodes(profileId, options);

/**
 * Персональні `getInTouch` одного власника у вигляді `profileId -> value`.
 *
 * У базі вони лежать навпаки — `owner/value/profileId` — щоб однакове значення
 * не плодило тисячі однакових підструктур. Стара логіка сортування і фільтрів
 * очікує значення на самій картці, тож адаптер перевертає структуру тут і
 * віддає мапу. Сама логіка сортування не змінюється: вона й далі отримує
 * `card.getInTouch`, просто значення приходить не з картки.
 */
export const getOwnerGetInTouchMap = readOwnerGetInTouchMap;

/** Поставити або зняти позначку. Зміна значення — це переїзд між ключами. */
export const setGetInTouch = setOwnerGetInTouch;

/** Скинути памʼять мапи — після зовнішньої зміни або зміни власника. */
export const forgetOwnerGetInTouch = invalidateOwnerGetInTouchMap;

/**
 * Підмішує персональний `getInTouch` у картки перед тим, як їх побачить стара
 * логіка сортування та фільтрації.
 *
 * Це адаптер, а не зміна семантики: картка отримує рівно те поле і рівно те
 * значення, які раніше лежали в ній самій.
 */
export const withOwnerValue = (cards = [], valueMap = {}, field = 'getInTouch') => (
  cards.map(cardEntry => {
    const value = valueMap[cardEntry?.userId];
    if (value === undefined) {
      if (cardEntry?.[field] === undefined) return cardEntry;
      const { [field]: removed, ...rest } = cardEntry;
      return rest;
    }
    return { ...cardEntry, [field]: value };
  })
);

export const withOwnerGetInTouch = (cards = [], getInTouchMap = {}) => (
  withOwnerValue(cards, getInTouchMap, 'getInTouch')
);

/**
 * `writer` живе там само, де `getInTouch`, і повертається на картку так само.
 *
 * Це позначка про спосіб звʼязку з контактом: хто з ним уже спілкувався і
 * чим. Анкети вона не описує, тож лежить під власником, а не в самій анкеті.
 */
export const getOwnerWriterMap = readOwnerWriterMap;

/** Поставити або зняти позначку способу звʼязку. */
export const setWriter = setOwnerWriter;

/** Скинути памʼять мапи `writer`. */
export const forgetOwnerWriter = invalidateOwnerWriterMap;

export const withOwnerWriter = (cards = [], writerMap = {}) => (
  withOwnerValue(cards, writerMap, 'writer')
);
