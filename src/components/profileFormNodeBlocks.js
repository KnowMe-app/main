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

const FALLBACK_FIREBASE_PROJECT_ID = 'webringitapp';

/** Проєкт беремо з конфігурації, а не з константи: dev і prod — різні бази. */
const getFirebaseConsoleProjectId = () =>
  process.env.REACT_APP_PROJECT_ID || FALLBACK_FIREBASE_PROJECT_ID;

const getFirebaseRealtimeDatabaseName = () => {
  const fallbackDatabaseName = `${getFirebaseConsoleProjectId()}-default-rtdb`;

  try {
    const { hostname } = new URL(process.env.REACT_APP_DATABASE_URL || '');
    return hostname.split('.')[0] || fallbackDatabaseName;
  } catch (error) {
    return fallbackDatabaseName;
  }
};

/**
 * Консоль Firebase кодує слеші всередині шляху як `~2F`, але сам шлях лишається
 * окремим сегментом URL — після `/data` має стояти справжній слеш. Без нього
 * консоль отримує `/data~2FprofileContacts…` і відкриває корінь бази замість
 * вузла, тобто посилання мовчки веде не туди, куди написано.
 */
export const buildRtdbConsoleLink = segments => {
  const path = segments
    .filter(segment => segment !== null && segment !== undefined && String(segment) !== '')
    .map(segment => `~2F${encodeURIComponent(String(segment))}`)
    .join('');
  const databaseUrl =
    `https://console.firebase.google.com/u/0/project/${getFirebaseConsoleProjectId()}`
    + `/database/${getFirebaseRealtimeDatabaseName()}/data`;

  return path ? `${databaseUrl}/${path}` : databaseUrl;
};

/**
 * Блоки, які не збігаються з вузлом один-в-один.
 *
 * `getInTouch` — персональна позначка конкретного адміна, і в анкеті її більше
 * немає: вона лежить у `multiData` під тим, хто її поставив. `publish`
 * власного вузла не має, але в базу потрапляє — писач картки перекладає його в
 * `feedDate`, — тож і стоїть він у блоці картки стрічки. Права доступу живуть у
 * `profileTechnical`: саме звідти їх читають правила бази.
 *
 * `unstored` — поля, яким немає вузла взагалі. Тут вони стояли блоком «legacy»
 * з вигаданим шляхом `legacy/{id}` і правились як звичайні — а збереження
 * мовчки їх відкидало (`fanOutProfileNodes` пише лише поля з власником).
 * Тепер блок каже, що поля не зберігаються, і показує їх лише для читання.
 */
export const PROFILE_FORM_BLOCK_IDS = Object.freeze({
  matchingCards: PROFILE_NODES.matchingCards,
  profileContacts: PROFILE_NODES.profileContacts,
  profileDetails: PROFILE_NODES.profileDetails,
  profileWorkflow: PROFILE_NODES.profileWorkflow,
  profileTechnical: PROFILE_NODES.profileTechnical,
  getInTouch: 'multiDataGetInTouch',
  ownerMarks: 'multiDataOwnerMarks',
  access: 'access',
  unstored: 'unstored',
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
  // Вузла анкети в них немає, але їх зберігають окремі писачі — під тим, хто
  // їх поставив (`setOwnerWriter`, `setOwnerStimulationSchedule`, нотатка —
  // `multiData/comments`). У блоці «Не зберігається» вони стали б лише для
  // читання, тобто адмін утратив би власну нотатку.
  writer: PROFILE_FORM_BLOCK_IDS.ownerMarks,
  stimulationSchedule: PROFILE_FORM_BLOCK_IDS.ownerMarks,
  myComment: PROFILE_FORM_BLOCK_IDS.ownerMarks,
  // `publish` власного вузла не має; стрічку вмикає похідний `feedDate` у
  // картці — туди запис і йде.
  publish: PROFILE_FORM_BLOCK_IDS.matchingCards,
  userRole: PROFILE_FORM_BLOCK_IDS.matchingCards,
};

/** Порядок блоків у формі — від того, що бачать усі, до того, що бачать одиниці. */
export const PROFILE_FORM_BLOCK_ORDER = Object.freeze([
  PROFILE_FORM_BLOCK_IDS.matchingCards,
  PROFILE_FORM_BLOCK_IDS.profileContacts,
  PROFILE_FORM_BLOCK_IDS.profileDetails,
  PROFILE_FORM_BLOCK_IDS.getInTouch,
  PROFILE_FORM_BLOCK_IDS.ownerMarks,
  PROFILE_FORM_BLOCK_IDS.profileWorkflow,
  PROFILE_FORM_BLOCK_IDS.profileTechnical,
  PROFILE_FORM_BLOCK_IDS.unstored,
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
  [PROFILE_FORM_BLOCK_IDS.ownerMarks]: {
    title: 'Ваші позначки',
    hint: 'Нотатка, автор і графік стимуляції — позначки того, хто їх ставить: лежать у multiData під вашим uid (comments, writer, stimulationSchedule), а не в анкеті.',
  },
  [PROFILE_FORM_BLOCK_IDS.profileWorkflow]: {
    title: 'Робота з анкетою',
    hint: 'Внутрішні операційні дані. Видно тим, хто редагує матчинг.',
  },
  [PROFILE_FORM_BLOCK_IDS.profileTechnical]: {
    title: 'Технічне',
    hint: 'Логіни, дати створення, мова. Видно власнику анкети і суперадмінам.',
  },
  [PROFILE_FORM_BLOCK_IDS.unstored]: {
    title: 'Не зберігається',
    hint: 'Поля без власного вузла: база їх не приймає, і збереження форми їх відкидає, тож тут вони лише для читання. Щоб поле зберігалось, йому потрібен вузол у profileNodeSchema.',
  },
  [PROFILE_FORM_BLOCK_IDS.access]: {
    title: 'Доступи',
    hint: 'Рівень доступу, право створювати анкети й делегування чужого multiData живуть у profileTechnical — правила бази питають лише його.',
  },
};

/** Якому блоку належить поле. Невідоме поле — у блоці «Не зберігається». */
export const resolveProfileFormBlock = fieldName => {
  if (!fieldName) return PROFILE_FORM_BLOCK_IDS.unstored;
  if (ACCESS_BLOCK_FIELDS.has(fieldName)) return PROFILE_FORM_BLOCK_IDS.access;
  if (EXPLICIT_FIELD_BLOCKS[fieldName]) return EXPLICIT_FIELD_BLOCKS[fieldName];
  return resolveFieldOwnerNode(fieldName) || PROFILE_FORM_BLOCK_IDS.unstored;
};

/**
 * Заголовок блоку разом із посиланням саме на той вузол, де лежать його дані.
 *
 * Блок полів без вузла посилання не має: у базі вони не лежать ніде.
 */
export const DRAFT_RECORD_BLOCK_ID = 'profileMutationDraft';

const DRAFT_RECORD_BLOCK_META = {
  title: 'Чернетка',
  hint: 'Анкета ще не опублікована: усі її поля лежать одним записом у multiData/profileMutations, а не у вузлах готової анкети. Правки форми йдуть туди ж і пишуться в журнал чернетки.',
};

/**
 * `draftSegments` — адреса даних чернетки (`getDraftRecordDataSegments`).
 *
 * Вузлів готової анкети в чернетки немає, тож посилання «Контакти →
 * profileContacts/{id}» вело в `null` і саме так і читалось: контактів
 * немає, — хоч вони лежали в чернетці. Для чернетки всі поля анкети — один
 * блок з посиланням на її запис. Позначка «Звʼязатись» лишається своєю: вона
 * лежить під адміном, а не в анкеті.
 */
export const buildProfileFormBlockHeader = (blockId, { profileId, ownerId, draftSegments = null } = {}) => {
  if (draftSegments && blockId !== PROFILE_FORM_BLOCK_IDS.getInTouch) {
    const labelSegments = draftSegments.filter(segment => segment !== profileId);
    return {
      id: DRAFT_RECORD_BLOCK_ID,
      title: DRAFT_RECORD_BLOCK_META.title,
      hint: DRAFT_RECORD_BLOCK_META.hint,
      label: labelSegments.join('/'),
      path: draftSegments.join('/'),
      href: buildRtdbConsoleLink(draftSegments),
    };
  }
  const meta = BLOCK_META[blockId] || { title: blockId, hint: '' };

  const path = (() => {
    switch (blockId) {
      case PROFILE_FORM_BLOCK_IDS.getInTouch:
        return ownerId
          ? ['multiData', 'getInTouch', ownerId]
          : ['multiData', 'getInTouch'];
      // Шляху в базі немає; ключ лише розводить блоки у формі й не
      // показується (`label` нижче порожній — назву дає `title`).
      case PROFILE_FORM_BLOCK_IDS.unstored:
        return ['unstored', profileId];
      // Права переїхали в технічний вузол, і посилання веде туди ж, куди тепер
      // іде запис.
      // Позначки лежать у трьох різних вузлах `multiData`, тож посилання
      // веде на сам `multiData`, а назви вузлів дає підказка блоку.
      case PROFILE_FORM_BLOCK_IDS.ownerMarks:
        return ['multiData'];
      case PROFILE_FORM_BLOCK_IDS.access:
        return [PROFILE_NODES.profileTechnical, profileId];
      default:
        return [blockId, profileId];
    }
  })();

  // `label` — шлях без id анкети. Форма показує саме його: id той самий у
  // кожного блоку, тобто нічого не розрізняє, зате займає майже весь рядок і
  // ховає під собою назву вузла — єдине, заради чого блок і підписаний.
  // Посилання при цьому веде на повний шлях, разом з id.
  const labelSegments = profileId ? path.filter(segment => segment !== profileId) : path;

  const unstored = blockId === PROFILE_FORM_BLOCK_IDS.unstored;
  return {
    id: blockId,
    title: meta.title,
    hint: meta.hint,
    label: unstored ? meta.title : labelSegments.join('/'),
    path: path.join('/'),
    href: unstored ? '' : buildRtdbConsoleLink(path),
    readOnly: unstored,
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
