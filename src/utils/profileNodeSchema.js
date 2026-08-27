/**
 * Розкладка анкети по вузлах RTDB — одне декларативне джерело правди.
 *
 * Досі анкета була одним великим змішаним обʼєктом у `users` / `newUsers`:
 * імʼя лежало поруч із телефоном, а телефон — поруч із `deviceWidth`. Стрічці
 * потрібен десяток скалярів, а читала вона кілобайти; контакти читав кожен, хто
 * мав право на матчинг, бо вони фізично в тому ж вузлі.
 *
 * Тут описано, який вузол володіє яким полем. Цим переліком користуються троє:
 * офлайн-міграція (розкладає локальні копії колекцій), runtime-адаптер
 * (збирає анкету назад) і роутер записів (веде збережене поле у свій вузол).
 * Поки перелік один, вони не можуть розійтись.
 *
 * Legacy `/users` не рефакториться: його читає мобільний застосунок.
 */

/** Корені нових вузлів. Назви самопояснювальні — без загальних `profiles`/`contacts`. */
export const PROFILE_NODES = Object.freeze({
  matchingCards: 'matchingCards',
  profileDetails: 'profileDetails',
  profileContacts: 'profileContacts',
  profileWorkflow: 'profileWorkflow',
  profileTechnical: 'profileTechnical',
});

/** Легка картка стрічки: скаляри, які переносяться як є. */
export const MATCHING_CARD_DIRECT_FIELDS = Object.freeze([
  'name',
  'birth',
  'city',
  'region',
  'country',
  'height',
  'weight',
  'bmi',
  'ownKids',
  'csection',
  'lastDelivery',
  'maritalStatus',
  'experience',
  'eyeColor',
  'hairColor',
]);

/**
 * Похідні картки: значення рахується з іншого поля, а не копіюється.
 *
 * `role` теж тут, бо в старих даних роль лежить під двома іменами
 * (`userRole` і `role`), і звести їх до одного ключа — це рішення, а не копія.
 */
export const MATCHING_CARD_DERIVED_FIELDS = Object.freeze({
  role: ['userRole', 'role'],
  surnameShort: ['surname'],
  rh: ['blood'],
  bloodGroup: ['blood'],
  avatar: ['avatar', 'photos'],
  feedDate: ['publish', 'lastLogin2', 'lastLogin'],
});

/**
 * Синоніми джерела: під яким іще іменем те саме поле лежить у старих даних.
 *
 * `state` — це та сама область, яку картка тримає в `region`: у мобільних
 * анкетах поле називалось так, і в даних воно лежить рядком на кшталт
 * «Донецкая область» або «Bayern». Окремого ключа в картці йому не заводять —
 * стрічка фільтрує по локації одним полем, і другий ключ означав би дві різні
 * відповіді на те саме питання. Тож `state` їде в `region`, а якщо обидва є і
 * розходяться — це звичайний конфлікт, а не тихе перезаписування.
 */
export const MATCHING_CARD_FIELD_SOURCES = Object.freeze({
  region: Object.freeze(['region', 'state']),
});

/** Усі ключі джерела, з яких збирається картка, включно з синонімами. */
export const MATCHING_CARD_SOURCE_FIELDS = Object.freeze([...new Set(
  MATCHING_CARD_DIRECT_FIELDS.flatMap(field => MATCHING_CARD_FIELD_SOURCES[field] || [field]),
)]);

/** Повний набір ключів, які має право лежати в картці стрічки. */
export const MATCHING_CARD_ALLOWED_FIELDS = Object.freeze([
  ...MATCHING_CARD_DIRECT_FIELDS,
  ...Object.keys(MATCHING_CARD_DERIVED_FIELDS),
]);

/**
 * Чого в картці стрічки бути не повинно — перелік із ТЗ, дослівно.
 *
 * Це не документація, а тест: правила бази тримають той самий allowlist, і
 * `databaseRulesProfileNodes` звіряє одне з одним.
 */
export const MATCHING_CARD_FORBIDDEN_FIELDS = Object.freeze([
  'surname',
  'blood',
  'phone',
  'email',
  'instagram',
  'facebook',
  'telegram',
  'contacts',
  'source',
  'fieldsCount',
  'v',
  'sortAt',
  'publish',
  'lastLogin',
  'lastLogin2',
  'lastAction',
  'getInTouch',
  'lastCycle',
  'cycleStatus',
  'registrationDate',
  'myComment',
  'publicComment',
  'accessLevel',
  'canCreateProfiles',
  'additionalAccessRules',
  'multiDataAccessUserIds',
  'deviceWidth',
  'deviceHeight',
  'deviceResize',
  // Сира назва локації: у картці вона живе під `region`, і другого ключа
  // для тієї самої області там бути не повинно.
  'state',
]);

/**
 * Приватні контакти. Сюди ж — точна адреса (`street`); місто/область/країна
 * лишаються в картці стрічки, бо на них фільтрує саме стрічка.
 */
export const PROFILE_CONTACT_FIELDS = Object.freeze([
  'phone',
  'email',
  'instagram',
  'facebook',
  'telegram',
  'telegram2',
  'tiktok',
  'vk',
  'otherLink',
  'other',
  'ameblo',
  'linkedin',
  'twitter',
  'youtube',
  'skype',
  'whatsapp',
  'viber',
  'line',
  'website',
  'street',
]);

/** Внутрішні робочі дані профілю. `getInTouch`/`lastLogin`/`publish` сюди не йдуть. */
export const PROFILE_WORKFLOW_FIELDS = Object.freeze([
  'lastAction',
  'cycleStatus',
  'lastCycle',
]);

/**
 * Права доступу — теж технічні дані, і живуть вони в `profileTechnical`.
 *
 * Спершу їх лишали в legacy-колекціях: правила бази читають рівень доступу
 * саме звідти, і друга копія прав, яку ніхто не синхронізує, — це гірше, ніж
 * незручний залишок. Але з цього виходило, що очищений `newUsers` мусить
 * везти права з файлу у файл вічно, а вузол акаунта — не знати про них нічого.
 *
 * Тепер джерело істини одне і воно нове: правила питають про рівень доступу і
 * `profileTechnical` теж, тож поле переїжджає туди разом з рештою технічного, а
 * з колекції зникає. `/users` при цьому не чіпається — там своя копія лишається
 * як була, і саме тому переїзд нікому не знімає доступ.
 */
export const PROFILE_TECHNICAL_ACCESS_FIELDS = Object.freeze([
  'accessLevel',
  'canCreateProfiles',
  'multiDataAccessUserIds',
  'additionalAccessRules',
]);

/** Технічні дані та account metadata. Без device-полів. */
export const PROFILE_TECHNICAL_FIELDS = Object.freeze([
  'lastLogin',
  'lastLogin2',
  'registrationDate',
  'areTermsConfirmed',
  'createdAt',
  // Той самий момент створення в ISO-форматі. Обидва пише `makeNewUser`, і
  // якби тут стояв лише один, другий лишався б незмапленим назавжди.
  'createdAt2',
  'language',
  'login',
  ...PROFILE_TECHNICAL_ACCESS_FIELDS,
]);

/**
 * Залишкові дані анкети — явний allowlist, а не «все, що лишилось».
 *
 * `profileDetails` не є копією старої анкети: базові поля канонічно живуть у
 * картці стрічки, і дублювати їх тут заборонено. Винятки — навмисно різна
 * деталізація: `surname` проти `surnameShort` і `blood` проти `rh`.
 */
export const PROFILE_DETAIL_FIELDS = Object.freeze([
  // повна деталізація того, що в картці лежить урізаним
  'surname',
  'blood',
  'photos',
  'photo',

  // зовнішність
  'hairStructure',
  'bodyType',
  'faceShape',
  'noseShape',
  'lipsShape',
  'chin',
  'breastSize',
  'clothingSize',
  'shoeSize',
  'glasses',
  'race',

  // освіта / професія / особисте
  'education',
  'profession',
  'hobbies',
  'sport',
  'moreInfo_main',
  'reward',
  'fathersname',

  // анкета здоровʼя
  'alcohol',
  'allergy',
  'smoking',
  'surgeries',
  'chronicDiseases',
  'twinsInFamily',

  // IP / подружжя
  'nameWife',
  'nameHusband',
  'birthWife',
  'birthHusband',
  'raceWife',
  'raceHusband',
  'weightWife',
  'weightHusband',
  'heightWife',
  'heightHusband',
  'eyeColorWife',
  'eyeColorHusband',
  'hairColorWife',
  'hairColorHusband',
  'chinWife',
  'chinHusband',
  'faceShapeWife',
  'faceShapeHusband',
  'lipsShapeWife',
  'lipsShapeHusband',
  'noseShapeWife',
  'noseShapeHusband',
  'bloodWife',
  'bloodHusband',
  'peculiaritiesWife',
  'peculiaritiesHusband',

  // решта відомих питань анкети
  'surrogacyProgramInterest',
  'interestInSurrogacy',
  'pastSurrogacyExperience',
  'surrogacyExperience',
  'opuCountry',
  'opuDate',
  'opuEggsNumber',
]);

/**
 * Поля, які не переносяться у новий backend узагалі.
 *
 * `device*` — архаїка часів, коли розмір екрана писався в анкету. `attitude`,
 * `blackList`, `whiteList` — мертві списки. Кеш-артефакти опиняються в анкеті
 * випадково, через збереження стану UI. У legacy `/users` вони можуть лишатись
 * скільки завгодно: цей перелік каже лише, що в нові вузли їх не копіюють.
 */
export const NEVER_MIGRATED_FIELDS = Object.freeze([
  'deviceWidth',
  'deviceHeight',
  'deviceResize',
  'attitude',
  'blackList',
  'whiteList',
  'cachedAt',
  'cacheVersion',
  '__photosHydrated',
  'loading',
  'loadingCounter',

  // Далі — рівно той перелік, який `config.js` уже вважає таким, що не має
  // права лежати на картці (`transientUserDataKeys`). Без нього ті самі ключі
  // потрапляли у звіті міграції в купку «поле поза жодним allowlist», тобто в
  // список рішень для людини, — хоча рішення по них давно ухвалене: кеш-мітки
  // транзитні, а `myComment` має власне сховище `multiData/comments`.
  '__sourceCollection',
  'cashVersion',
  'cash version',
  'localVersion',
  'localUpdatedAt',
  'source',
  '__profileSnapshotVersion',
  '__profileSnapshotSource',
  '__profileSnapshotUpdatedAt',
  'myComment',

  // Технічні мітки самого запису, а не анкети: `id` і `userId` дублюють адресу
  // вузла, `collection` каже, з якого файлу запис прочитали, `updatedAt` —
  // коли його востаннє записав UI. Жодне з них не описує людину, і рішення по
  // них ухвалювати нема кому.
  'id',
  'collection',
  'updatedAt',
]);

/**
 * Права, які в нові вузли не їдуть узагалі.
 *
 * `multiDataSourceUserIds` — це делегування читання чужого `multiData`, тобто
 * право не на анкету, а на дані іншого адміна; `godMode` — аварійний прапорець.
 * Обидва читаються з legacy напряму, і другої копії їм не заводять.
 *
 * Решта прав переїхала в `profileTechnical` (див.
 * `PROFILE_TECHNICAL_ACCESS_FIELDS`) — але забороненими для картки стрічки,
 * деталей і контактів лишились усі: технічне право не має права лежати там.
 */
export const ACCESS_CONTROL_FIELDS = Object.freeze([
  'multiDataSourceUserIds',
  'godMode',
]);

/** Усі права разом — там, де питання «чи це взагалі право доступу». */
export const ALL_ACCESS_CONTROL_FIELDS = Object.freeze([
  ...PROFILE_TECHNICAL_ACCESS_FIELDS,
  ...ACCESS_CONTROL_FIELDS,
]);

/** Пароль не потрапляє нікуди. Його поява в даних — інцидент, а не поле. */
export const SECRET_FIELDS = Object.freeze(['password']);

/** Персональні дані власника щодо чужих карток — окремий вузол `multiData`. */
export const MULTI_DATA_GET_IN_TOUCH_PATH = 'multiData/getInTouch';

/**
 * `writer` — теж не поле анкети, а позначка того, хто з нею спілкувався.
 *
 * У старих даних воно лежить в анкеті рядком на кшталт «Ik, » або «IgTT, » —
 * тобто ініціалами адмінів, які писали цьому контакту, і яким саме способом.
 * Анкети це не описує: та сама жінка для одного адміна «Ik», а для іншого — не
 * записана взагалі. Тож живе воно там само, де `getInTouch`: під власником,
 * значенням у назві ключа.
 */
export const MULTI_DATA_WRITER_PATH = 'multiData/writer';

/**
 * Поля, які належать не анкеті, а тому, хто їх поставив.
 *
 * Обидва влаштовані однаково — `{path}/{ownerId}/{значення}/{profileId}: true`
 * — і саме тому перелічені разом: міграція, правила бази і runtime мають
 * бачити один список, а не три схожі.
 */
export const OWNER_MULTI_DATA_FIELDS = Object.freeze([
  Object.freeze({ field: 'getInTouch', path: MULTI_DATA_GET_IN_TOUCH_PATH }),
  Object.freeze({ field: 'writer', path: MULTI_DATA_WRITER_PATH }),
]);

/** Самі назви полів — там, де шлях не потрібен. */
export const OWNER_MULTI_DATA_FIELD_NAMES = Object.freeze(
  OWNER_MULTI_DATA_FIELDS.map(entry => entry.field),
);

/**
 * Персональний графік стимуляції — теж під власником, але значенням, а не ключем.
 *
 * `getInTouch` і `writer` — це короткі позначки, тож у них значення сидить у
 * назві ключа. Графік так лежати не може: це не помітка, а таблиця днів і
 * призначень, і власників у неї стільки ж, скільки адмінів веде цю жінку —
 * кожен свій. Тож структура тут інша: `{шлях}/{ownerId}/{profileId}` = сам
 * графік.
 *
 * Сусідній `multiData/stimulation` — це вже зведена таблиця медикаментів
 * (`rows`/`startDate`), яку будує сторінка графіка. Тут же лежить те, з чого
 * вона будується, — сире поле анкети, тому і вузол окремий.
 */
export const MULTI_DATA_STIMULATION_SCHEDULE_PATH = 'multiData/stimulationSchedule';

/**
 * Поля власника, які їдуть у `multiData` цілим значенням.
 *
 * Від `OWNER_MULTI_DATA_FIELDS` відрізняються рівно формою запису: там ключ
 * несе значення, тут ключ — це анкета, а значення лежить значенням.
 */
export const OWNER_MULTI_DATA_PAYLOAD_FIELDS = Object.freeze([
  Object.freeze({ field: 'stimulationSchedule', path: MULTI_DATA_STIMULATION_SCHEDULE_PATH }),
]);

/** Самі назви полів — там, де шлях не потрібен. */
export const OWNER_MULTI_DATA_PAYLOAD_FIELD_NAMES = Object.freeze(
  OWNER_MULTI_DATA_PAYLOAD_FIELDS.map(entry => entry.field),
);

/**
 * Чого не має бути в очищеній копії колекції.
 *
 * Це не той самий перелік, що `NEVER_MIGRATED_FIELDS`: там сказано, чого не
 * копіюють у нові вузли, а тут — чого не тягнуть далі взагалі. Різниця видна
 * на `photo` і `login`: обидва мають своє нове місце, але якщо після всіх
 * груп вони й досі лежать у залишку, то лежать вони там порожніми або
 * зайвими, і в наступний прогін їх не беруть.
 *
 * `userId` та `id` — адреса запису, а не дані; `password` у файлі, який
 * зберігають на диску, — інцидент; решта — кеш-мітки, розміри екрана і мертві
 * списки, які й так нікуди не їдуть.
 */
export const CLEANED_COLLECTION_NOISE_FIELDS = Object.freeze([
  'blackList',
  'whiteList',
  'attitude',
  'userId',
  'deviceHeight',
  'deviceResize',
  'deviceWidth',
  'photo',
  'cachedAt',
  'updatedAt',
  '__sourceCollection',
  'id',
  'login',
  'password',
  'cacheVersion',
  'collection',
]);

/**
 * Що лишається в очищеній копії завжди — навіть порожнім.
 *
 * Права, які нікуди не переїжджають, живуть тільки в самій колекції. Якби
 * очищення прибрало їх разом із рештою порожніх ключів, залитий назад файл
 * зняв би делегування — і зробив би це мовчки. Решта прав тут не потрібна:
 * вона переїжджає в `profileTechnical`, а звідти вже зникає з колекції як усе
 * перенесене.
 */
export const CLEANED_COLLECTION_PRESERVED_FIELDS = Object.freeze([
  ...ACCESS_CONTROL_FIELDS,
]);

/** Поле, за яким і сортується, і фільтрується стрічка. */
export const FEED_DATE_FIELD = 'feedDate';

const OWNERSHIP = [
  [PROFILE_NODES.matchingCards, MATCHING_CARD_ALLOWED_FIELDS],
  [PROFILE_NODES.profileContacts, PROFILE_CONTACT_FIELDS],
  [PROFILE_NODES.profileWorkflow, PROFILE_WORKFLOW_FIELDS],
  [PROFILE_NODES.profileTechnical, PROFILE_TECHNICAL_FIELDS],
  [PROFILE_NODES.profileDetails, PROFILE_DETAIL_FIELDS],
];

const OWNER_BY_FIELD = OWNERSHIP.reduce((acc, [node, fields]) => {
  fields.forEach(field => {
    // Перший вузол у списку виграє: `surname` належить `profileDetails`, але
    // `surnameShort` — картці, і вони не конфліктують, бо це різні ключі.
    if (!(field in acc)) acc[field] = node;
  });
  return acc;
}, {});

/**
 * Куди писати поле після того, як існуюча логіка редагування вже вирішила,
 * яке значення прийняте (§26 ТЗ). Роутер не приймає рішень про значення — лише
 * про шлях.
 *
 * `null` означає «нове місце не визначене»: такі поля лишаються у legacy
 * `/users` і в `newUsers`, і рішення по них ухвалює людина, а не міграція.
 */
export const resolveFieldOwnerNode = field => OWNER_BY_FIELD[field] || null;

/** Чи можна це поле взагалі переносити у нові вузли. */
export const isMigratableField = field => (
  !NEVER_MIGRATED_FIELDS.includes(field)
  && !ACCESS_CONTROL_FIELDS.includes(field)
  && !SECRET_FIELDS.includes(field)
);

/** Усі поля, які має хоч один із нових вузлів. */
export const ALL_MAPPED_FIELDS = Object.freeze(Object.keys(OWNER_BY_FIELD).sort());
