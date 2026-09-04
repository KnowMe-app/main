import { normalizePublish } from './reactionPriority';
import { hasCurrentValue } from 'components/getCurrentValue';
import {
  deriveSurnameShort,
  deriveRh,
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
 * Значень у нього три, і кожне — це окрема відповідь на питання «чи показувати»:
 *
 * - **дата** (`YYYY-MM-DD`) — картка в стрічці, і дата ж задає її місце в ній;
 * - **`false`** — анкету сховали навмисно (кнопка «Приховати анкету» на
 *   `MyProfile`). Це не те саме, що відсутній ключ: сховану не показує ані
 *   стрічка, ані пошук;
 * - **ключа немає** — анкету ще не публікували. У стрічку вона не потрапляє,
 *   але пошук її знаходить: у `searchId` лежать усі анкети, і мовчати про
 *   знайдене лише тому, що воно не опубліковане, означає не відповісти на
 *   запит.
 *
 * Стрічку тримає в межах сам індекс, а не клієнт: `startAt('')` по цьому полю
 * бере лише рядки, тож і `false`, і відсутній ключ у діапазон не входять — і
 * сховану картку у видачу привезти нема чим.
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

/**
 * Плоский список значень поля: порядок збережено, порожні прибрано, однакові
 * не двояться (повторне збереження інакше нарощувало б масив).
 */
const collectFieldValues = value => {
  const flatten = current => {
    if (Array.isArray(current)) return current.flatMap(flatten);
    if (current && typeof current === 'object') return Object.values(current).flatMap(flatten);
    const scalar = trimmed(current);
    return scalar ? [scalar] : [];
  };
  return [...new Set(flatten(value))];
};

/**
 * Значення поля анкети для картки: скаляр лишається скаляром, кілька значень
 * лишаються кількома.
 *
 * `trimmed` лишається там, де значення завжди скаляр (id, аватар), а поля
 * анкети скаляром бувають не завжди: форма дозволяє тримати в полі кілька
 * значень, і в базі воно лежить масивом. Мовчазне `''` на такий масив коштувало
 * імені: `name` живе **тільки** в цій проєкції — роутер записів `matchingCards`
 * не чіпає (`profileNodeWriter.js`), а в `PROFILE_DETAIL_FIELDS` його немає.
 * Тобто поле, викинуте тут, не зберігалось узагалі ніде, скільки б разів його
 * не вводили, і анкета переставала знаходитись за власним іменем.
 *
 * Кілька значень лишаються масивом, а не зводяться до одного і не склеюються в
 * рядок. Причина та сама, що й у решті бази: анкета тримає кілька імен, кілька
 * телефонів, кілька дат пологів, і `searchId` індексує їх усі
 * (`extractIndexableFieldValues`). Звести їх тут означало б зробити картку
 * єдиним місцем, де частина анкети зникає, — а вона єдине місце, де ці поля
 * взагалі зберігаються.
 *
 * Ціна одна, і вона свідома: `.indexOn: ['name']` упорядковує лише скаляри, тож
 * картку з кількома іменами не знайде префіксний скан `searchMatchingCardsByText`.
 * Її знаходить `searchId`, де лежить кожне зі значень.
 */
const projectionValue = value => {
  if (value !== null && typeof value === 'object') {
    const values = collectFieldValues(value);
    if (!values.length) return undefined;
    // Стерте поле лишає по собі позначку, а не зникає безслідно.
    //
    // `collectFieldValues` знімає порожні значення — і разом з ними знімало
    // єдине, чим стирання відрізняється від його відсутності. Людина прибирала
    // імʼя, у вузлі лишалось `['Оксана', '']`, а в картку їхало `['Оксана']` —
    // і рядок стрічки показував далі те, чого в анкеті вже немає, тоді як
    // відкрита анкета показувала порожньо. Дві відповіді на одне питання.
    //
    // Тому історія лишається історією (усі непорожні версії — картка єдине
    // місце, де живе `name`, і зводити її до одного значення означало б
    // втратити решту), а порожня остання версія доїжджає позначкою.
    return hasCurrentValue(value) ? values : [...values, ''];
  }
  const scalar = trimmed(value);
  return scalar || undefined;
};

const firstNonEmpty = (data, keys) => {
  for (const key of keys) {
    const value = projectionValue(data?.[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

/**
 * Чи є в полі бодай щось, що мало б доїхати до картки.
 *
 * Навмисно ширше за `collectFieldValues`: питання тут не «що ми змогли
 * прочитати», а «чи було що читати». Збіг цих двох відповідей і робив втрату
 * поля невидимою.
 */
const hasAnyValue = value => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAnyValue);
  if (typeof value === 'object') return Object.values(value).some(hasAnyValue);
  return true;
};

/**
 * Поля, значення яких є в анкеті, але в картку не потрапили.
 *
 * Проєкція навмисно бере не все — але «не взяли, бо не належить картці» і «не
 * взяли, бо не змогли прочитати значення» на вигляд однакові: обидва просто
 * відсутній ключ. Саме на цій тиші й згубилось ім'я. Тут перелічені другі:
 * поле є в переліку картки, значення в анкеті непорожнє, а в проєкції ключа
 * немає. Викликач вирішує, що з цим робити, — писати в консоль чи в звіт.
 */
export const listDroppedProjectionFields = (data, projection) => {
  if (!data || typeof data !== 'object') return [];
  const isEmptyInCard = key => projectionValue(projection?.[key]) === undefined;

  const dropped = COPIED_FIELDS.filter(key => hasAnyValue(data[key]) && isEmptyInCard(key));
  // Роль виводиться, а не копіюється, але губилась так само — і в перелік
  // копійованих полів вона не входить, тож перевіряється окремо.
  if ((hasAnyValue(data.role) || hasAnyValue(data.userRole)) && isEmptyInCard('role')) {
    dropped.push('role');
  }
  return dropped;
};

// Вибір основного фото живе поруч з рештою похідних — і офлайн-міграція, і
// писач індексу беруть його звідти, тож аватар у них не може розійтись.
export { resolveMatchingCardAvatarFromProfile };

/** Чи стоїть у полі `publish` явне «ні». */
const isPublishExplicitlyDenied = data => {
  const publish = data?.publish;
  return publish === false || publish === 'false';
};

/** Чи був у попередньої картки ключ стрічки — байдуже, дата чи `false`. */
const hasFeedKey = card => Boolean(card)
  && typeof card === 'object'
  && Object.prototype.hasOwnProperty.call(card, MATCHING_CARD_FEED_FIELD);

/**
 * Значення `feedDate` для картки — див. три його стани вище.
 *
 * Раніше тут стояла ще одна умова: картка мусила бути з колекції `users`. Це
 * була умова часів двох дек, і коштувала вона дорого — анкета, створена у
 * вебі, отримувала push-ключ, тобто «не users», і в стрічку не потрапляла
 * ніколи. Колекція одна, і право показу дає рівно `publish`.
 *
 * Показана картка без придатної дати в індекс не йде: впорядкувати її нема за
 * чим, а з порожнім значенням вона лягла б на дно діапазону і однаково не
 * показалась би.
 *
 * Знята з публікації отримує `false`, а не порожнє поле: «сховали» і «ще не
 * публікували» — різні стани, і пошук поводиться з ними по-різному.
 *
 * Але сховати можна лише те, що вже мало ключ: `publish: false` в анкеті — це
 * не завжди рішення сховати. Це ще й початковий стан форми (`ProfileScreen`
 * стартує саме з нього) і те, як виглядає анкета, якої ніколи не публікували, —
 * і мітити її як сховану означало б викинути з пошуку тих, кого щойно завели.
 * Тож рішення читається з переходу: попередня картка вже стояла в стрічці (або
 * вже позначена схованою) — це зняття публікації; ключа в неї не було — анкета
 * так і лишається неопублікованою.
 *
 * Попередню картку передає писач (`syncMatchingCardIndex`), який її вже
 * прочитав. Коли її не передали взагалі (офлайн-збірка вузла з локальних
 * файлів), переходу нема звідки взятись — і `publish: false` береться як є, бо
 * туди він приходить із самої ж картки через `expandMatchingCard`.
 */
const resolveFeedDate = (data, { existingCard } = {}) => {
  if (isPublishExplicitlyDenied(data)) {
    return existingCard === undefined || hasFeedKey(existingCard) ? false : '';
  }
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
 *
 * `options.existingCard` — попередня картка з бази; за нею `resolveFeedDate`
 * відрізняє зняття публікації від анкети, якої ніколи не публікували.
 */
export const buildMatchingCardProjection = (userId, data, options = {}) => {
  const id = trimmed(userId) || trimmed(data?.userId);
  if (!id || !data || typeof data !== 'object') return null;

  const projection = {};
  COPIED_FIELDS.forEach(key => {
    const value = projectionValue(data[key]);
    if (value !== undefined) projection[key] = value;
  });

  const csection = firstNonEmpty(data, CSECTION_ALIASES);
  if (csection !== undefined) projection.csection = csection;

  // Похідні від полів, які самі в картку не потрапляють. Кожна з них рахується
  // тим самим кодом, що й офлайн-міграція, — інакше картка, зібрана вручну з
  // локальних файлів, розійшлася б із карткою, дописаною при збереженні анкети.
  const surnameShort = deriveSurnameShort(data.surname).value;
  if (surnameShort) projection.surnameShort = surnameShort;

  // Тільки резус. Номер групи картка не носить: разом вони складаються назад у
  // повне `blood`, а воно живе в `profileDetails` — за межею приватності, яку
  // картка й позначає. За групою стрічка фільтрує через `searchKey/blood`.
  const rh = deriveRh(data.blood).value;
  if (rh) projection.rh = rh;

  // Роль теж буває не одна: `deriveRole` навмисно віддає масив, коли анкета
  // заявляла себе в кількох ролях. `trimmed` повертав на такий масив порожній
  // рядок — і картка з двома ролями лишалась узагалі без `role`.
  const role = projectionValue(deriveRole(data).value);
  if (role !== undefined) projection.role = role;

  const avatar = trimmed(options.avatar) || resolveMatchingCardAvatarFromProfile(data);
  if (avatar) projection.avatar = avatar;

  // Ані `source`, ані `fieldsCount`, ані `v` картка більше не носить. Колекцію
  // називає формат id; заповненість зі стрічки прибрано разом із фільтром; а
  // версія була потрібна лише доти, доки у вузлі лежали картки двох поколінь.
  const feedDate = resolveFeedDate(data, { existingCard: options.existingCard });
  // `false` — теж значення, і воно мусить лягти в картку: без нього сховану
  // анкету не відрізнити від тієї, яку ще не публікували.
  if (feedDate || feedDate === false) projection[MATCHING_CARD_FEED_FIELD] = feedDate;

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
 * `feedDate`), а стрічка й далі отримує ті імена полів, які знала
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
    avatar, surnameShort, rh,
    [MATCHING_CARD_FEED_FIELD]: feedDate,
    ...rest
  } = card;

  // `blood` збирається назад із резуса — і тільки з нього: номера групи картка
  // не носить. Формат той самий, який читає `toRhCategory`; `toBloodGroupCategory`
  // на такому значенні каже «групи тут немає», і фільтр за групою її не питає в
  // картки, а бере з індексу `searchKey/blood`.
  const blood = trimmed(rh);

  return {
    ...rest,
    userId: id,
    // Повного прізвища в картці немає; стрічка показує ініціал там, де раніше
    // показувала прізвище.
    ...(trimmed(surnameShort) ? { surname: surnameShort } : {}),
    ...(blood ? { blood } : {}),
    // Ключ стрічки є датою — картка показана; немає ключа — ні. `publish`
    // ставиться лише в першому випадку: `normalizePublish` читає відсутнє
    // значення як «не показувати», так само як у повній анкеті. Сама дата
    // віддається під старим іменем, бо за ним сортує і курсор, і
    // `compareUsersByLastLogin2`.
    //
    // `false` повертається назад як `publish: false` — і це не косметика:
    // картка перебудовується з перечитаної анкети при кожному збереженні
    // (`runMatchingCardRefresh`), тож без цього перша ж правка сусіднього поля
    // стирала б позначку «сховано» і повертала анкету в пошук.
    ...(feedDate === false ? { publish: false } : {}),
    ...(trimmed(feedDate) ? { publish: true, lastLogin2: feedDate } : {}),
    photos: avatar ? [avatar] : [],
    __photosHydrated: true,
    [MATCHING_SUMMARY_FLAG]: true,
  };
};

export const isMatchingSummaryCard = user => Boolean(user?.[MATCHING_SUMMARY_FLAG]);

/**
 * Порівняння значень, яке розуміє поле з кількох значень.
 *
 * `!==` на двох масивах істинний завжди, тож без цього писач вважав би картку
 * зміненою на кожне збереження і переписував би її дарма. Скаляр і масив з тим
 * самим значенням — теж різні: перехід між формами має доїхати до бази.
 */
const sameProjectionValue = (left, right) => {
  const leftIsObject = left !== null && typeof left === 'object';
  const rightIsObject = right !== null && typeof right === 'object';
  if (leftIsObject !== rightIsObject) return false;
  if (!leftIsObject) return left === right;

  // Позначка стирання — теж різниця, і саме та, яку легко не помітити:
  // `['Оксана']` і `['Оксана', '']` дають однакові непорожні значення, тож без
  // цієї перевірки писач вважав би картку незміненою і не доніс би до бази
  // те, що поле прибрали.
  if (hasCurrentValue(left) !== hasCurrentValue(right)) return false;

  const leftValues = collectFieldValues(left);
  const rightValues = collectFieldValues(right);
  return leftValues.length === rightValues.length
    && leftValues.every((value, index) => value === rightValues[index]);
};

/**
 * Чи змінилась проєкція? Писач звіряє її з тим, що вже лежить у базі, і мовчить,
 * коли правка анкети не зачепила жодного поля стрічки — а це більшість правок.
 */
export const areMatchingCardProjectionsEqual = (a, b) => {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!sameProjectionValue(a[key], b[key])) return false;
  }
  return true;
};
