import { resolveProfileFieldCountBucket } from './fieldCountBuckets';

/**
 * `matchingCards` — проєкція анкети рівно під стрічку матчингу.
 *
 * Стрічка рендерить фото, імʼя, вік, локацію і рядок метрик, а пост-фільтри
 * читають ще кілька похідних. Це десяток скалярів, тоді як повна анкета — це
 * кілька кілобайтів контактів, описів і службових полів. Раніше стрічка тягнула
 * повний вузол `users/{id}` на кожну картку (та ще й двічі: вдруге заради поля
 * `photos`), плюс рекурсивний лістинг Storage заради одного аватара.
 *
 * Тут лежить контракт цієї проєкції: що в ній є, як її зібрати з анкети і як
 * розгорнути назад у форму, яку розуміють `renderFacts`, `filterMain` і
 * `applyMatchingSearchKeyFilters`. Писач (`syncMatchingCardIndex`) і читач
 * (стрічка) беруть його звідси, тому розійтись вони не можуть.
 */

export const MATCHING_CARDS_ROOT = 'matchingCards';

/**
 * Версія схеми. Читач, що бачить чужу версію, вважає картку застарілою і
 * догідратовує анкету повністю — так півмігрований індекс не показує порожнеч.
 */
export const MATCHING_CARD_SCHEMA_VERSION = 1;

/** Поле, за яким сортується стрічка (потребує `.indexOn` у правилах БД). */
export const MATCHING_CARD_ORDER_FIELD = 'lastLogin2';

/** Прапорець на розгорнутій картці: це проєкція, а не повна анкета. */
export const MATCHING_SUMMARY_FLAG = '__matchingSummary';

// Скаляри, які переносяться в проєкцію як є. Порядок не має значення — це набір.
const COPIED_FIELDS = [
  'name',
  'surname',
  'birth',
  'city',
  'region',
  'country',
  'height',
  'weight',
  'bmi',
  'maritalStatus',
  'csection',
  'blood',
  'ownKids',
  'lastDelivery',
  'role',
  'userRole',
  'lastLogin2',
  'lastAction',
  'getInTouch',
];

// Аліаси кесаревого: анкети різних поколінь тримають його під різними іменами,
// а `renderFacts` шукає перший непорожній. Проєкція зводить їх до `csection`.
const CSECTION_ALIASES = ['cSection', 'csection', 'c_section', 'cesareanSection'];

const trimmed = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  return '';
};

const firstNonEmpty = (data, keys) => {
  for (const key of keys) {
    const value = trimmed(data?.[key]);
    if (value) return value;
  }
  return '';
};

const hasContactValue = value => {
  if (Array.isArray(value)) return value.some(item => trimmed(item));
  return trimmed(value).length > 0;
};

const telegramValues = value => {
  const values = Array.isArray(value) ? value : [value];
  return values.map(trimmed).filter(Boolean);
};

/**
 * Ключі контактів, які має анкета — без самих значень.
 *
 * Фільтр «контакт» питає лише «чи є телеграм / телефон / інстаграм», тож
 * проєкції достатньо переліку ключів. Значення сюди не потрапляють: стрічка їх
 * не показує, а контакти — найчутливіше, що є в анкеті.
 *
 * Розкладка `telegram` / `telegram2` повторює `getContactIndexSet` у config.js:
 * «ук…» — це український телеграм, решта — ні, і одна анкета може дати обидва.
 */
export const collectMatchingCardContactKeys = data => {
  const keys = [];
  const add = (key, present) => { if (present) keys.push(key); };

  add('vk', hasContactValue(data?.vk));
  add('instagram', hasContactValue(data?.instagram));
  add('ameblo', hasContactValue(data?.ameblo));
  add('facebook', hasContactValue(data?.facebook));
  add('phone', hasContactValue(data?.phone));
  add('telegram', telegramValues(data?.telegram).some(item => !item.toLowerCase().startsWith('ук')));
  add('telegram2', telegramValues(data?.telegram).some(item => item.toLowerCase().startsWith('ук')));
  add('tiktok', hasContactValue(data?.tiktok));
  add('linkedin', hasContactValue(data?.linkedin));
  add('youtube', hasContactValue(data?.youtube));
  add('email', hasContactValue(data?.email));
  add('twitter', hasContactValue(data?.twitter));
  add('line', hasContactValue(data?.line));
  add('otherLink', hasContactValue(data?.otherLink));

  return keys;
};

const normalizePhotoList = value => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizePhotoList);
  if (typeof value === 'object') return Object.values(value).flatMap(normalizePhotoList);
  const photo = trimmed(value);
  return photo ? [photo] : [];
};

/** Перше фото анкети з поля `photos` (Storage тут не чіпається). */
export const resolveMatchingCardAvatarFromProfile = data => normalizePhotoList(data?.photos)[0] || '';

/**
 * Кількість заповнених полів — так само, як її рахує писач індексу `fields`.
 * Службові `__ключі` не рахуються, інакше проєкція і повна анкета розійшлися б
 * на межі бакета.
 */
const countProfileFieldsForIndex = data => (
  data && typeof data === 'object'
    ? Object.keys(data).filter(key => !key.startsWith('__') && data[key] !== null && data[key] !== undefined).length
    : 0
);

export const resolveMatchingCardCollection = (userId, data) => {
  const explicit = trimmed(data?.__sourceCollection);
  if (explicit === 'users' || explicit === 'newUsers') return explicit;
  return String(userId || '').length >= 20 ? 'users' : 'newUsers';
};

/**
 * Збирає проєкцію з повної анкети.
 *
 * `avatar` не резолвиться зі Storage — це окремий, дорогий крок, який робить
 * фонова індексація; сюди його передають через `options.avatar`. Порожні поля
 * не пишуться взагалі: «немає значення» — це відсутність ключа, як і в
 * `searchKey`, і саме тому вузол лишається маленьким.
 */
export const buildMatchingCardProjection = (userId, data, options = {}) => {
  const id = trimmed(userId) || trimmed(data?.userId);
  if (!id || !data || typeof data !== 'object') return null;

  const projection = {};
  COPIED_FIELDS.forEach(key => {
    const value = trimmed(data[key]);
    if (value) projection[key] = value;
  });

  const csection = firstNonEmpty(data, CSECTION_ALIASES);
  if (csection) projection.csection = csection;

  const contacts = collectMatchingCardContactKeys(data);
  if (contacts.length) projection.contacts = contacts.join(',');

  const avatar = trimmed(options.avatar) || resolveMatchingCardAvatarFromProfile(data);
  if (avatar) projection.avatar = avatar;

  // `publish: false` — це виняток («не показувати»), тож пишеться лише він.
  // Відсутність ключа читається як «показувати», як і в повній анкеті.
  if (data.publish === false) projection.publish = false;

  projection.fieldsCount = countProfileFieldsForIndex(data);
  projection.source = resolveMatchingCardCollection(id, data);
  projection.v = MATCHING_CARD_SCHEMA_VERSION;

  return projection;
};

/**
 * Збирає весь вузол `matchingCards` з локальних копій колекцій.
 *
 * Це офлайн-двійник фонової індексації: жодного запиту в базу, ані на читання,
 * ані на запис. Адмін викачує `users.json` і `newUsers.json`, збирає з них файл
 * тут, у браузері, і заливає його в базу вручну одним імпортом — замість
 * тисяч дрібних записів з телефона.
 *
 * Аватар береться лише з поля `photos` анкети: лістинг Storage — це мережа, а
 * тут її немає за визначенням. Скільки карток лишилось без аватара, функція
 * каже окремо, щоб це не було сюрпризом.
 *
 * Форма результату — вміст вузла, а не шлях від кореня: файл імпортується саме
 * в `matchingCards`, так само як індекси `searchKey` імпортуються у свій вузол.
 */
export const buildMatchingCardsPayloadFromCollections = (collectionsMap = {}) => {
  const payload = {};
  const stats = { total: 0, written: 0, skipped: 0, withAvatar: 0, byCollection: {} };

  Object.entries(collectionsMap).forEach(([collectionName, usersMap]) => {
    const source = collectionName === 'newUsers' ? 'newUsers' : 'users';
    const collectionStats = { total: 0, written: 0, withAvatar: 0 };

    Object.entries(usersMap || {}).forEach(([userId, userData]) => {
      if (!userId || !userData || typeof userData !== 'object') return;
      collectionStats.total += 1;
      stats.total += 1;

      const projection = buildMatchingCardProjection(userId, { ...userData, __sourceCollection: source });
      if (!projection) {
        stats.skipped += 1;
        return;
      }

      payload[userId] = projection;
      collectionStats.written += 1;
      stats.written += 1;
      if (projection.avatar) {
        collectionStats.withAvatar += 1;
        stats.withAvatar += 1;
      }
    });

    stats.byCollection[source] = collectionStats;
  });

  stats.withoutAvatar = stats.written - stats.withAvatar;
  return { payload, stats };
};

export const isCurrentMatchingCardSchema = card =>
  Boolean(card) && typeof card === 'object' && Number(card.v) === MATCHING_CARD_SCHEMA_VERSION;

/**
 * Розгортає проєкцію у форму, яку читають рендер рядка і пост-фільтри.
 *
 * Похідні, які не відновити зі скалярів (перелік контактів, лічильник полів),
 * їдуть під службовими `__ключами`; `filterMain` і `countProfileFields` віддають
 * їм перевагу, коли вони є. Фото вважається гідратованим: аватар уже в картці,
 * тож стрічці нема за чим іти в Storage.
 */
export const expandMatchingCard = (userId, card) => {
  if (!isCurrentMatchingCardSchema(card)) return null;
  const id = trimmed(userId);
  if (!id) return null;

  const { avatar, contacts, fieldsCount, source, v, ...rest } = card;
  const contactKeys = trimmed(contacts) ? contacts.split(',').filter(Boolean) : [];

  return {
    ...rest,
    userId: id,
    photos: avatar ? [avatar] : [],
    __photosHydrated: true,
    __sourceCollection: source === 'newUsers' ? 'newUsers' : 'users',
    __contactKeys: contactKeys,
    __fieldsCount: Number.isFinite(Number(fieldsCount)) ? Number(fieldsCount) : undefined,
    [MATCHING_SUMMARY_FLAG]: true,
  };
};

export const isMatchingSummaryCard = user => Boolean(user?.[MATCHING_SUMMARY_FLAG]);

/**
 * Чи змінилась проєкція? Писач звіряє її з тим, що вже лежить у базі, і мовчить,
 * коли правка анкети не зачепила жодного поля стрічки — а це більшість правок.
 */
export const areMatchingCardProjectionsEqual = (a, b) => {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

/** Бакет заповненості — щоб фільтр «?» рахував проєкцію так само, як анкету. */
export const resolveMatchingCardFieldsBucket = card =>
  resolveProfileFieldCountBucket({ __fieldsCount: Number(card?.fieldsCount) || 0 });
