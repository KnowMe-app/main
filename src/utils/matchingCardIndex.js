import { normalizePublish } from './reactionPriority';
import {
  deriveSurnameShort,
  deriveRh,
  deriveBloodGroup,
  deriveRole,
  normalizeFeedDateValue,
  resolveMatchingCardAvatarFromProfile,
} from './profileFieldDerive';

/**
 * `matchingCards` — проєкція анкети рівно під стрічку матчингу.
 *
 * Стрічка рендерить фото, імʼя, вік, локацію і рядок метрик, а пост-фільтри
 * читають ще кілька похідних. Це десяток скалярів, тоді як повна анкета — це
 * кілька кілобайтів контактів, описів і службових полів. Раніше стрічка тягнула
 * повний вузол `users/{id}` на кожну картку (та ще й двічі: вдруге заради поля
 * `photos`), плюс рекурсивний лістинг Storage заради одного аватара.
 *
 * Тепер це ще й межа безпеки, а не лише економія трафіку. Контакти, повне
 * прізвище, робочі позначки і технічні дані живуть у власних вузлах із власними
 * правами; сюди потрапляє тільки те, без чого не намалювати рядок стрічки.
 *
 * Тут лежить контракт цієї проєкції: що в ній є, як її зібрати з анкети і як
 * розгорнути назад у форму, яку розуміють `renderFacts`, `filterMain` і
 * `applyMatchingSearchKeyFilters`. Писач (`syncMatchingCardIndex`) і читач
 * (стрічка) беруть його звідси, тому розійтись вони не можуть.
 */

export const MATCHING_CARDS_ROOT = 'matchingCards';

/**
 * `feedDate` — і допуск до стрічки, і порядок у ній, одним ключем.
 *
 * Ключ є лише в показаної картки, і саме наявність, а не значення, дає право
 * показу. Це не економія байтів, а перенесення фільтра з клієнта в індекс:
 * схованої картки в діапазоні немає, тож вона не може приїхати у видачу.
 *
 * Ключ один, бо стрічка одна — і колекція у вебі одна: анкета потрапляє в
 * стрічку за `publish`, а не за тим, де лежить її тіло.
 *
 * Порядок у RTDB завжди зростаючий, і `val()` до того ж повертає обʼєкт, у
 * якому порядок запиту не зберігається. Тож найновіші беруться з хвоста
 * (`limitToLast`), а сортує читач.
 */
export const MATCHING_CARD_FEED_FIELD = 'feedDate';

/** Поле, за яким сортується стрічка (потребує `.indexOn` у правилах БД). */
export const MATCHING_CARD_ORDER_FIELD = MATCHING_CARD_FEED_FIELD;

/** Прапорець на розгорнутій картці: це проєкція, а не повна анкета. */
export const MATCHING_SUMMARY_FLAG = '__matchingSummary';

/**
 * Скаляри, які переносяться в проєкцію як є.
 *
 * Тут немає ані `surname`, ані `blood`, ані `lastLogin2`, ані `lastAction`,
 * ані `getInTouch`: у кожного з них тепер свій вузол, а стрічці потрібне не
 * саме значення, а похідна від нього.
 */
const COPIED_FIELDS = [
  'name',
  'birth',
  'city',
  'region',
  'country',
  'height',
  'weight',
  'bmi',
  'maritalStatus',
  'csection',
  'ownKids',
  'lastDelivery',
  'experience',
  'eyeColor',
  'hairColor',
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

// Вибір основного фото живе поруч з рештою похідних — і офлайн-міграція, і
// писач індексу беруть його звідти, тож аватар у них не може розійтись.
export { resolveMatchingCardAvatarFromProfile };

/**
 * Дата для стрічки — у показаної картки, хай звідки вона прийшла.
 *
 * Раніше тут стояла ще одна умова: картка мусила бути з колекції `users`. Це
 * була умова часів двох дек, і коштувала вона дорого — анкета, створена у
 * вебі, отримувала push-ключ, тобто «не users», і в стрічку не потрапляла
 * ніколи. Колекція одна, і право показу дає рівно `publish`.
 *
 * Показана картка без придатної дати в індекс не йде: впорядкувати її нема за
 * чим, а з порожнім значенням вона лягла б на дно діапазону і однаково не
 * показалась би.
 */
const resolveFeedDate = data => {
  if (!normalizePublish(data?.publish)) return '';
  return normalizeFeedDateValue(data?.lastLogin2)
    || normalizeFeedDateValue(data?.lastLogin)
    || normalizeFeedDateValue(data?.createdAt2)
    || normalizeFeedDateValue(data?.createdAt);
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

  // Похідні від полів, які самі в картку не потрапляють. Кожна з них рахується
  // тим самим кодом, що й офлайн-міграція, — інакше картка, зібрана вручну з
  // локальних файлів, розійшлася б із карткою, дописаною при збереженні анкети.
  const surnameShort = deriveSurnameShort(data.surname).value;
  if (surnameShort) projection.surnameShort = surnameShort;

  const rh = deriveRh(data.blood).value;
  if (rh) projection.rh = rh;

  const bloodGroup = deriveBloodGroup(data.blood).value;
  if (bloodGroup) projection.bloodGroup = bloodGroup;

  const role = trimmed(deriveRole(data).value);
  if (role) projection.role = role;

  const avatar = trimmed(options.avatar) || resolveMatchingCardAvatarFromProfile(data);
  if (avatar) projection.avatar = avatar;

  // Ані `source`, ані `fieldsCount`, ані `v` картка більше не носить. Колекцію
  // називає формат id; заповненість зі стрічки прибрано разом із фільтром; а
  // версія була потрібна лише доти, доки у вузлі лежали картки двох поколінь.
  const feedDate = resolveFeedDate(data);
  if (feedDate) projection[MATCHING_CARD_FEED_FIELD] = feedDate;

  return projection;
};

/**
 * Збирає весь вузол `matchingCards` з локальних копій колекцій.
 *
 * Це офлайн-двійник фонової індексації: жодного запиту в базу, ані на читання,
 * ані на запис. Адмін викачує анкети файлом, збирає з них вузол тут, у
 * браузері, і заливає його в базу вручну одним імпортом — замість тисяч
 * дрібних записів з телефона.
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
  const stats = { total: 0, written: 0, skipped: 0, withAvatar: 0, inFeed: 0, byCollection: {} };

  Object.entries(collectionsMap).forEach(([collectionName, usersMap]) => {
    const collectionStats = { total: 0, written: 0, withAvatar: 0, inFeed: 0 };

    Object.entries(usersMap || {}).forEach(([userId, userData]) => {
      if (!userId || !userData || typeof userData !== 'object') return;
      collectionStats.total += 1;
      stats.total += 1;

      const projection = buildMatchingCardProjection(userId, userData);
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
      if (projection[MATCHING_CARD_FEED_FIELD]) {
        collectionStats.inFeed += 1;
        stats.inFeed += 1;
      }
    });

    stats.byCollection[collectionName] = collectionStats;
  });

  stats.withoutAvatar = stats.written - stats.withAvatar;
  return { payload, stats };
};

/**
 * Чи це взагалі картка.
 *
 * Версії схеми більше немає: усі картки перебудовані, і другого покоління у
 * вузлі не лишилось. Тож питання звузилось до «чи є тут хоч щось» — порожній
 * або битий вузол читач і далі відрізняє від картки й догідратовує анкету.
 */
export const isCurrentMatchingCardSchema = card =>
  Boolean(card) && typeof card === 'object' && !Array.isArray(card) && Object.keys(card).length > 0;

/**
 * Розгортає проєкцію у форму, яку читають рендер рядка і пост-фільтри.
 *
 * Це адаптер, а не друга схема: у базі лежать похідні (`surnameShort`, `rh`,
 * `bloodGroup`, `feedDate`), а стрічка й далі отримує ті імена полів, які знала
 * завжди. Тобто розділення вузлів не переписує ані `renderFacts`, ані
 * `applyMatchingSearchKeyFilters`, ані сортування — вони бачать те саме, просто
 * значення приходить з іншого місця.
 *
 * Фото вважається гідратованим: аватар уже в картці, тож стрічці нема за чим
 * іти в Storage.
 */
export const expandMatchingCard = (userId, card) => {
  if (!isCurrentMatchingCardSchema(card)) return null;
  const id = trimmed(userId);
  if (!id) return null;

  const {
    avatar, surnameShort, rh, bloodGroup,
    [MATCHING_CARD_FEED_FIELD]: feedDate,
    ...rest
  } = card;

  // `blood` збирається назад із двох похідних, бо саме його формат читають
  // `toBloodGroupCategory` і `toRhCategory`. Сирого значення анкети (яке буває
  // масивом версій чи текстом на пів рядка) у вузлі немає — воно в
  // `profileDetails`.
  const blood = `${trimmed(bloodGroup)}${trimmed(rh)}`;

  return {
    ...rest,
    userId: id,
    // Повного прізвища в картці немає; стрічка показує ініціал там, де раніше
    // показувала прізвище.
    ...(trimmed(surnameShort) ? { surname: surnameShort } : {}),
    ...(blood ? { blood } : {}),
    // Ключ стрічки є — картка показана; немає — ні. `publish` ставиться лише в
    // першому випадку: `normalizePublish` читає відсутнє значення як «не
    // показувати», так само як у повній анкеті. Сама дата віддається під
    // старим іменем, бо за ним сортує і курсор, і `compareUsersByLastLogin2`.
    ...(trimmed(feedDate) ? { publish: true, lastLogin2: feedDate } : {}),
    photos: avatar ? [avatar] : [],
    __photosHydrated: true,
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
