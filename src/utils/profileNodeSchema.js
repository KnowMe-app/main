/**
 * Розкладка анкети по вузлах RTDB — одне декларативне джерело правди.
 *
 * Досі анкета була одним великим змішаним обʼєктом у `users`:
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
const MATCHING_CARD_DIRECT_FIELDS = Object.freeze([
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
const MATCHING_CARD_DERIVED_FIELDS = Object.freeze({
  role: ['userRole', 'role'],
  surnameShort: ['surname'],
  rh: ['blood'],
  bloodGroup: ['blood'],
  avatar: ['avatar', 'photos'],
  feedDate: ['publish', 'lastLogin2', 'lastLogin'],
});

/**
 * Поля-близнюки: той самий факт, записаний двічі й різними форматами.
 *
 * `lastLogin` і `lastLogin2` — це один вхід: `buildAuthSessionPayload` пише їх
 * разом з одного `getCurrentDate()`, просто перший крапками (`25.08.2026`), а
 * другий в ISO (`2026-08-25`). Те саме з `createdAt` / `createdAt2` у
 * `makeNewUser`. Тобто це не два значення, які треба звести, а одне, записане
 * двома написаннями.
 *
 * У новий вузол їде ISO-копія — і під коротким ім'ям, без «2». Не з
 * акуратності: ISO-копія чесніша. `lastLogin2` оновлюють шляхи, які до
 * крапкового `lastLogin` не доходять узагалі (вхід у застосунок, показ картки),
 * тож крапковий просто відстає. А `createdAt` рахується локальним часом, тоді
 * як `createdAt2` — UTC: анкета, створена після 21:00 за Києвом, має в них
 * різні дати, і саме ISO-копія збігається з тим, що бачить решта бази.
 *
 * Ключі перелічені в порядку переваги: перший непорожній і виграє.
 */
const TWIN_FIELD_SOURCES = Object.freeze({
  createdAt: Object.freeze(['createdAt2', 'createdAt']),
  lastLogin: Object.freeze(['lastLogin2', 'lastLogin']),
});

/**
 * Канонічне ім'я поля в новому вузлі.
 *
 * `lastLogin2`, записаний застосунком сьогодні, лягає в `profileTechnical` під
 * ім'ям `lastLogin` — тим самим, під яким його поклала міграція. Інакше вузол
 * знову розʼїхався б на дві копії однієї дати, тільки вже після переїзду.
 */
const CANONICAL_BY_SOURCE_FIELD = Object.freeze(Object.fromEntries(
  Object.entries(TWIN_FIELD_SOURCES).flatMap(([field, keys]) => keys.map(key => [key, field])),
));

export const resolveCanonicalFieldName = field => CANONICAL_BY_SOURCE_FIELD[field] || field;

/** Наскільки ця копія переважна: 0 — та, що виграє. */
export const twinSourceRank = field => {
  const canonical = CANONICAL_BY_SOURCE_FIELD[field];
  if (!canonical) return 0;
  return TWIN_FIELD_SOURCES[canonical].indexOf(field);
};

/** Повний набір ключів, які має право лежати в картці стрічки. */
export const MATCHING_CARD_ALLOWED_FIELDS = Object.freeze([
  ...MATCHING_CARD_DIRECT_FIELDS,
  ...Object.keys(MATCHING_CARD_DERIVED_FIELDS),
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
const PROFILE_WORKFLOW_FIELDS = Object.freeze([
  'lastAction',
  'cycleStatus',
  'lastCycle',
]);

/**
 * Права доступу — теж технічні дані, і живуть вони в `profileTechnical`.
 *
 * Спершу їх лишали в legacy-колекціях: правила бази читають рівень доступу
 * саме звідти, і друга копія прав, яку ніхто не синхронізує, — це гірше, ніж
 * незручний залишок. Але з цього виходило, що очищена legacy-анкета мусить
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
  'multiDataSourceUserIds',
  'additionalAccessRules',
]);

/** Технічні дані та account metadata. Без device-полів. */
const PROFILE_TECHNICAL_FIELDS = Object.freeze([
  // `lastLogin` і `createdAt` тут в однині: пари з «2» більше немає, значення
  // береться з ISO-копії, а ім'я лишається коротке. Звідки саме береться —
  // у `TWIN_FIELD_SOURCES`.
  'lastLogin',
  'registrationDate',
  'areTermsConfirmed',
  'createdAt',
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
const PROFILE_DETAIL_FIELDS = Object.freeze([
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
 * Лишився один: `godMode` — аварійний прапорець, який не видають ні формою, ні
 * міграцією. Решта прав переїхала в `profileTechnical` (див.
 * `PROFILE_TECHNICAL_ACCESS_FIELDS`), але забороненими для картки стрічки,
 * деталей і контактів лишились усі: технічне право не має права лежати там.
 */
export const ACCESS_CONTROL_FIELDS = Object.freeze([
  'godMode',
]);

/** Усі права разом — там, де питання «чи це взагалі право доступу». */
export const ALL_ACCESS_CONTROL_FIELDS = Object.freeze([
  ...PROFILE_TECHNICAL_ACCESS_FIELDS,
  ...ACCESS_CONTROL_FIELDS,
]);

/**
 * Персональні дані власника щодо чужих карток — окремий вузол `multiData`.
 *
 * `getInTouch` каже, коли з контактом звʼязатись; анкети це не описує — та
 * сама жінка для одного адміна «подзвонити 1 вересня», а для іншого не
 * записана взагалі.
 */
const MULTI_DATA_GET_IN_TOUCH_PATH = 'multiData/getInTouch';

/**
 * `writer` — теж не поле анкети, а позначка того, хто з нею спілкувався.
 *
 * У старих даних воно лежить в анкеті рядком на кшталт «Ik, » або «IgTT, » —
 * тобто ініціалами адмінів, які писали цьому контакту, і яким саме способом.
 */
const MULTI_DATA_WRITER_PATH = 'multiData/writer';

/**
 * Персональний графік стимуляції — така сама позначка, тільки таблицею.
 *
 * Сусідній `multiData/stimulation` — це вже зведена таблиця медикаментів
 * (`rows`/`startDate`), яку будує сторінка графіка. Тут же лежить те, з чого
 * вона будується, — сире поле анкети, тому і вузол окремий.
 */
const MULTI_DATA_STIMULATION_SCHEDULE_PATH = 'multiData/stimulationSchedule';

/**
 * Поля, які належать не анкеті, а тому, хто їх поставив.
 *
 * Форма в усіх одна: `{path}/{ownerId}/{profileId}` = значення. Раніше короткі
 * позначки лежали навпаки — значення в назві ключа, анкети прапорцями під ним,
 * — щоб однакове значення не плодило тисячі однакових підструктур. Ця економія
 * коштувала дорожче, ніж давала:
 *
 *   — значення мусило ставати ключем, тобто втрачати `.`, `/`, `#`, `[`, `]`
 *     і власну довжину: нотатка адміна поверталась йому переписаною;
 *   — зміна значення була не записом, а переїздом між двома ключами;
 *   — база не вміла ані відсортувати такі позначки, ані взяти діапазон: під
 *     ключем лежить набір анкет, а не значення.
 *
 * Значенням під анкетою все це зникає, а замість втраченої економії зʼявляється
 * індекс: `.indexOn: ".value"` на вузлі власника (див. `OWNER_MULTI_DATA_INDEXED_FIELDS`)
 * дає `orderByValue()` — і сортування за датою «звʼязатись», і вибірку
 * діапазону, які раніше довелось би робити в памʼяті браузера.
 */
const OWNER_MULTI_DATA_FIELDS = Object.freeze([
  Object.freeze({ field: 'getInTouch', path: MULTI_DATA_GET_IN_TOUCH_PATH, indexed: true, stringOnly: true }),
  Object.freeze({ field: 'writer', path: MULTI_DATA_WRITER_PATH, stringOnly: true }),
  Object.freeze({ field: 'stimulationSchedule', path: MULTI_DATA_STIMULATION_SCHEDULE_PATH }),
]);

/**
 * Поля власника, за якими база сортує сама.
 *
 * Індексується скаляр, за яким є сенс упорядковувати чи брати діапазон: дата
 * «звʼязатись» — так, таблиця графіка — ні, її не порівнюють.
 */
export const OWNER_MULTI_DATA_INDEXED_FIELDS = Object.freeze(
  OWNER_MULTI_DATA_FIELDS.filter(entry => entry.indexed).map(entry => entry.field),
);

/**
 * Поля власника, які база приймає лише рядком.
 *
 * Це не здогад про дані, а копія правила: на `multiData/getInTouch/$ownerId/$userId`
 * і на `multiData/writer/$ownerId/$userId` у `database.rules.json` стоїть
 * `.validate: "!newData.exists() || newData.isString()"`, а на графіку
 * стимуляції — ні, бо він таблиця. Перелік потрібен саме тут: переїзд мусить
 * зводити значення до рядка ще на етапі плану, інакше масив зі старої анкети
 * доходить до заливки і провалює `.validate` — а це PERMISSION_DENIED на цілу
 * порцію, без натяку, який саме запис завинив.
 */
export const OWNER_MULTI_DATA_STRING_FIELDS = Object.freeze(
  OWNER_MULTI_DATA_FIELDS.filter(entry => entry.stringOnly).map(entry => entry.field),
);

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
 * `/users`, і рішення по них ухвалює людина, а не міграція.
 */
export const resolveFieldOwnerNode = field => OWNER_BY_FIELD[resolveCanonicalFieldName(field)] || null;
