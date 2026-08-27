import { isLongFormatUserId } from 'utils/mergeUserCollections';
import { PROFILE_NODES, resolveFieldOwnerNode } from 'utils/profileNodeSchema';

/**
 * Блоки форми анкети — по вузлу бекенду, у якому лежать їхні поля.
 *
 * Після розділення вузлів «де це поле насправді» перестало бути очевидним: одна
 * форма пише в пʼять різних місць із різними правами. Тому форма показує це
 * прямо — заголовком блоку і посиланням у консоль саме на той вузол.
 *
 * Це не прикраса. Коли адмін бачить порожнє поле, перше питання — «його немає
 * чи я його не бачу»; посилання відповідає на нього за один клік. А коли
 * правило відмовило в записі, воно називає шлях — і шлях має бути видно там
 * само, де стоїть поле.
 */

const FIREBASE_CONSOLE_DATABASE_URL =
  'https://console.firebase.google.com/u/0/project/webringitapp/database/webringitapp-default-rtdb/data';

/** Консоль Firebase кодує слеші в шляху як `~2F`. */
export const buildRtdbConsoleLink = segments => {
  const path = segments
    .filter(segment => segment !== null && segment !== undefined && String(segment) !== '')
    .map(segment => `~2F${encodeURIComponent(String(segment))}`)
    .join('');
  return `${FIREBASE_CONSOLE_DATABASE_URL}${path}`;
};

/**
 * Блоки, які не збігаються з вузлом один-в-один.
 *
 * `getInTouch` — персональна позначка конкретного адміна, і в анкеті її більше
 * немає: вона лежить у `multiData` під тим, хто її поставив. `publish` навпаки
 * лишається в legacy-анкеті — його читає мобільний застосунок, — а на стрічку
 * впливає через `feedDate`. Права доступу теж лишаються в `/users`: саме звідти
 * їх читають правила бази, і другої копії тут бути не повинно.
 */
export const PROFILE_FORM_BLOCK_IDS = Object.freeze({
  matchingCards: PROFILE_NODES.matchingCards,
  profileContacts: PROFILE_NODES.profileContacts,
  profileDetails: PROFILE_NODES.profileDetails,
  profileWorkflow: PROFILE_NODES.profileWorkflow,
  profileTechnical: PROFILE_NODES.profileTechnical,
  getInTouch: 'multiDataGetInTouch',
  access: 'access',
  legacy: 'legacy',
});

const ACCESS_BLOCK_FIELDS = new Set([
  'accessLevel',
  'canCreateProfiles',
  'additionalAccessRules',
  'multiDataAccessUserIds',
  'multiDataSourceUserIds',
  'godMode',
]);

const EXPLICIT_FIELD_BLOCKS = {
  getInTouch: PROFILE_FORM_BLOCK_IDS.getInTouch,
  // `publish` фізично лишається в legacy-анкеті; стрічку вмикає похідний
  // `feedDate` у картці.
  publish: PROFILE_FORM_BLOCK_IDS.legacy,
  userRole: PROFILE_FORM_BLOCK_IDS.matchingCards,
};

/** Порядок блоків у формі — від того, що бачать усі, до того, що бачать одиниці. */
export const PROFILE_FORM_BLOCK_ORDER = Object.freeze([
  PROFILE_FORM_BLOCK_IDS.matchingCards,
  PROFILE_FORM_BLOCK_IDS.profileContacts,
  PROFILE_FORM_BLOCK_IDS.profileDetails,
  PROFILE_FORM_BLOCK_IDS.getInTouch,
  PROFILE_FORM_BLOCK_IDS.profileWorkflow,
  PROFILE_FORM_BLOCK_IDS.profileTechnical,
  PROFILE_FORM_BLOCK_IDS.legacy,
  PROFILE_FORM_BLOCK_IDS.access,
]);

const BLOCK_META = {
  [PROFILE_FORM_BLOCK_IDS.matchingCards]: {
    title: 'Картка стрічки',
    hint: 'Легка проєкція під матчинг. Прізвище тут скорочене до ініціала, група крові — розібрана на номер і резус.',
  },
  [PROFILE_FORM_BLOCK_IDS.profileContacts]: {
    title: 'Контакти',
    hint: 'Окремий вузол з окремим правом читання. Матчинговий доступ сам собою його не відкриває.',
  },
  [PROFILE_FORM_BLOCK_IDS.profileDetails]: {
    title: 'Анкета',
    hint: 'Розширені дані, яких немає в картці стрічки: повне прізвище, повна група крові, фото, опис.',
  },
  [PROFILE_FORM_BLOCK_IDS.getInTouch]: {
    title: 'Звʼязатись',
    hint: 'Персональна позначка адміна, а не поле анкети: у базі вона лежить під тим, хто її поставив.',
  },
  [PROFILE_FORM_BLOCK_IDS.profileWorkflow]: {
    title: 'Робота з анкетою',
    hint: 'Внутрішні операційні дані. Видно тим, хто редагує матчинг.',
  },
  [PROFILE_FORM_BLOCK_IDS.profileTechnical]: {
    title: 'Технічне',
    hint: 'Логіни, дати створення, мова. Видно власнику анкети і суперадмінам.',
  },
  [PROFILE_FORM_BLOCK_IDS.legacy]: {
    title: 'Legacy-анкета',
    hint: 'Поля, які ще не мають власного вузла. Звідси їх читає мобільний застосунок.',
  },
  [PROFILE_FORM_BLOCK_IDS.access]: {
    title: 'Доступи',
    hint: 'Рівень доступу і право створювати анкети живуть у profileTechnical — правила бази питають і його, і legacy. Делегування чужого multiData лишається тільки в legacy.',
  },
};

/** Якому блоку належить поле. Невідоме поле лишається в legacy — як і в даних. */
export const resolveProfileFormBlock = fieldName => {
  if (!fieldName) return PROFILE_FORM_BLOCK_IDS.legacy;
  if (ACCESS_BLOCK_FIELDS.has(fieldName)) return PROFILE_FORM_BLOCK_IDS.access;
  if (EXPLICIT_FIELD_BLOCKS[fieldName]) return EXPLICIT_FIELD_BLOCKS[fieldName];
  return resolveFieldOwnerNode(fieldName) || PROFILE_FORM_BLOCK_IDS.legacy;
};

/**
 * Заголовок блоку разом із посиланням саме на той вузол, де лежать його дані.
 *
 * Для legacy й доступів колекція вгадується за форматом id тим самим правилом,
 * що й скрізь: довгий id — це Firebase-Auth UID, тобто `users`.
 */
export const buildProfileFormBlockHeader = (blockId, { profileId, ownerId, sourceCollection } = {}) => {
  const meta = BLOCK_META[blockId] || { title: blockId, hint: '' };
  const legacyCollection = sourceCollection
    || (isLongFormatUserId(profileId) ? 'users' : 'newUsers');

  const path = (() => {
    switch (blockId) {
      case PROFILE_FORM_BLOCK_IDS.getInTouch:
        return ownerId
          ? ['multiData', 'getInTouch', ownerId]
          : ['multiData', 'getInTouch'];
      case PROFILE_FORM_BLOCK_IDS.legacy:
        return [legacyCollection, profileId];
      // Права переїхали в технічний вузол, і посилання веде туди ж, куди тепер
      // іде запис. Делегування (`multiDataSourceUserIds`, `godMode`) лишилось у
      // legacy — його видно в блоці legacy-анкети.
      case PROFILE_FORM_BLOCK_IDS.access:
        return [PROFILE_NODES.profileTechnical, profileId];
      default:
        return [blockId, profileId];
    }
  })();

  return {
    id: blockId,
    title: meta.title,
    hint: meta.hint,
    path: path.join('/'),
    href: buildRtdbConsoleLink(path),
  };
};

/**
 * Розкладає поля по блоках, зберігаючи наявний порядок усередині кожного.
 *
 * Пріоритетна сортовка форми нікуди не дівається — вона просто діє в межах
 * блоку: адмін і далі бачить дату народження перед розміром взуття, але тепер
 * бачить ще й те, у який вузол ці двоє поїдуть.
 */
export const groupProfileFormFieldsByBlock = (fields = []) => {
  const byBlock = new Map(PROFILE_FORM_BLOCK_ORDER.map(blockId => [blockId, []]));

  fields.forEach(field => {
    const blockId = resolveProfileFormBlock(field?.name);
    if (!byBlock.has(blockId)) byBlock.set(blockId, []);
    byBlock.get(blockId).push(field);
  });

  const ordered = [];
  const blockStarts = new Map();

  byBlock.forEach((blockFields, blockId) => {
    if (!blockFields.length) return;
    blockStarts.set(blockFields[0].name, blockId);
    ordered.push(...blockFields);
  });

  return { fields: ordered, blockStarts };
};
