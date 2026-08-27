/**
 * Офлайн-міграція `users` / `newUsers` у нові вузли RTDB.
 *
 * Рухається вона не «одним прогоном», а групами полів, і кожна група — це
 * окрема кнопка. Причина в тому, що одне й те саме сире поле потрібне кільком
 * вузлам: `surname` дає стрічці ініціал, а `profileDetails` — повне прізвище;
 * `photos` дає аватар, а потім їде цілим набором. Якби міграція йшла одним
 * прогоном, кожне таке поле довелося б або видаляти зарано, або не видаляти
 * ніколи.
 *
 * Звідси головне правило, яке тут тримається жорсткіше за все інше:
 *
 *   поле зникає з `newUsers` тільки після того, як цей самий прогін
 *   відзвітував успіх саме для цього поля.
 *
 * Не «група відпрацювала», не «здається, скопіювалось», а конкретне поле в
 * конкретній анкеті лягло в цільовий вузол або вже лежить там тим самим
 * значенням. Конфлікт, порожнє значення, невиведена похідна — джерело лишається
 * на місці і їде у звіт.
 *
 * `users` не мутується взагалі: з нього тільки читають. Це legacy-колекція
 * мобільного застосунку, і чистити її нікому.
 *
 * Бази тут немає ні на читання, ні на запис. На вхід — локальні JSON-копії, на
 * вихід — файли, які адмін заливає вручну після перевірки.
 */

import {
  PROFILE_NODES,
  MATCHING_CARD_DIRECT_FIELDS,
  PROFILE_CONTACT_FIELDS,
  PROFILE_WORKFLOW_FIELDS,
  PROFILE_TECHNICAL_FIELDS,
  PROFILE_DETAIL_FIELDS,
  NEVER_MIGRATED_FIELDS,
  ACCESS_CONTROL_FIELDS,
  SECRET_FIELDS,
  ALL_MAPPED_FIELDS,
} from './profileNodeSchema';
import {
  hasMeaningfulValue,
  deepClone,
  deepEqual,
  deriveSurnameShort,
  deriveRh,
  deriveBloodGroup,
  deriveAvatar,
  deriveRole,
  deriveFeedDate,
  compareLoginRecency,
  checkGetInTouchKeySafety,
} from './rtdbMigrationDerive';

/** Кнопки міграції, у порядку, в якому їх задумано натискати. */
export const MIGRATION_GROUPS = Object.freeze([
  { id: 'matchingCards', label: 'Migrate Matching Cards', node: PROFILE_NODES.matchingCards },
  { id: 'profileContacts', label: 'Migrate Contacts', node: PROFILE_NODES.profileContacts },
  { id: 'profileWorkflow', label: 'Migrate Workflow', node: PROFILE_NODES.profileWorkflow },
  { id: 'profileTechnical', label: 'Migrate Technical', node: PROFILE_NODES.profileTechnical },
  { id: 'getInTouch', label: 'Migrate GetInTouch', node: 'multiDataPatch' },
  { id: 'profileDetails', label: 'Migrate Profiles', node: PROFILE_NODES.profileDetails },
]);

const DIRECT_FIELDS_BY_GROUP = {
  matchingCards: MATCHING_CARD_DIRECT_FIELDS,
  profileContacts: PROFILE_CONTACT_FIELDS,
  profileWorkflow: PROFILE_WORKFLOW_FIELDS,
  profileTechnical: PROFILE_TECHNICAL_FIELDS,
  profileDetails: PROFILE_DETAIL_FIELDS,
  getInTouch: [],
};

/**
 * Скільки подробиць звіт тримає списком.
 *
 * На 26 тисячах анкет попередження «поле порожнє» дало б сотні тисяч рядків —
 * файл, який ніхто не відкриє. Тому подробиці обрізаються, а рахунок ведеться
 * повний: у `warningsByCode` видно, скільки їх насправді.
 */
export const MIGRATION_DETAIL_CAP = 500;

const emptyTargets = () => ({
  [PROFILE_NODES.matchingCards]: {},
  [PROFILE_NODES.profileDetails]: {},
  [PROFILE_NODES.profileContacts]: {},
  [PROFILE_NODES.profileWorkflow]: {},
  [PROFILE_NODES.profileTechnical]: {},
  multiDataPatch: { getInTouch: {} },
});

const emptyCounters = () => ({
  profilesScanned: 0,
  fieldsCopiedFromUsers: 0,
  fieldsMovedFromNewUsers: 0,
  derivedValuesCreated: 0,
  alreadyPresent: 0,
  skippedEmpty: 0,
  skippedAbsent: 0,
  conflicts: 0,
  unsafeKeys: 0,
  errors: 0,
  deletionsFromNewUsers: 0,
  consumedFromUsers: 0,
});

const countProfileFields = collection => {
  const stats = {};
  Object.values(collection || {}).forEach(profile => {
    if (!profile || typeof profile !== 'object') return;
    Object.entries(profile).forEach(([field, value]) => {
      if (!stats[field]) stats[field] = { count: 0, types: {} };
      stats[field].count += 1;
      const type = value === null ? 'null' : (Array.isArray(value) ? 'array' : typeof value);
      stats[field].types[type] = (stats[field].types[type] || 0) + 1;
    });
  });
  return stats;
};

/**
 * Інвентаризація локального файлу: скільки записів, які поля, якого вони типу.
 *
 * Робиться до будь-якої міграції — саме звідси видно, що allowlist чогось не
 * знає. Поле, якого немає в жодній групі, не «дозбирується» автоматично: воно
 * лишається в `newUsers` і чекає рішення людини.
 */
export const buildCollectionInventory = collection => {
  const fieldStats = countProfileFields(collection);
  const fields = Object.keys(fieldStats).sort();
  return {
    recordCount: Object.keys(collection || {}).length,
    uniqueFieldCount: fields.length,
    fields: fields.map(field => ({
      field,
      count: fieldStats[field].count,
      types: fieldStats[field].types,
      mapped: ALL_MAPPED_FIELDS.includes(field),
      excluded: NEVER_MIGRATED_FIELDS.includes(field)
        || ACCESS_CONTROL_FIELDS.includes(field)
        || SECRET_FIELDS.includes(field),
    })),
  };
};

/**
 * Пароль у даних — це інцидент, а не поле для міграції.
 *
 * У звіт іде тільки факт і адреса, ніколи саме значення: звіт викачується
 * файлом і живе в теці «Завантаження» рівно стільки, скільки про нього
 * забудуть.
 */
const collectSecurityWarnings = (users, newUsers) => {
  const warnings = [];
  [['users', users], ['newUsers', newUsers]].forEach(([collection, data]) => {
    Object.entries(data || {}).forEach(([profileId, profile]) => {
      if (!profile || typeof profile !== 'object') return;
      SECRET_FIELDS.forEach(field => {
        if (field in profile) {
          warnings.push({
            severity: 'CRITICAL',
            code: 'SECRET_FIELD_PRESENT',
            collection,
            profileId,
            field,
            message: `У ${collection}/${profileId} лежить поле «${field}». Значення не показано і не перенесено.`,
          });
        }
      });
    });
  });
  return warnings;
};

/**
 * Робочий стан міграції.
 *
 * `originalUsers` / `originalNewUsers` — недоторканні копії завантажених файлів;
 * `Reset` повертає стан саме до них. `workingNewUsers` — єдина колекція, з якої
 * щось видаляється, і тільки після успіху.
 */
export const createMigrationState = ({ users = {}, newUsers = {} } = {}) => {
  const originalUsers = deepClone(users) || {};
  const originalNewUsers = deepClone(newUsers) || {};

  return {
    originalUsers,
    originalNewUsers,
    workingNewUsers: deepClone(originalNewUsers),
    /**
     * Що з `users` ще не забрано.
     *
     * Сам `/users` не чіпається — це копія, і живе вона рівно заради одного
     * питання адміна: «а що з цієї колекції не переїхало?». Планування далі
     * читає `originalUsers`, бо в базі поля лишаються на місці і кожен
     * наступний прогін мусить бачити їх знову.
     */
    remainingUsers: deepClone(originalUsers),
    targets: emptyTargets(),
    /** Хто саме поклав значення в цільовий вузол — щоб конфлікт називав обидві сторони. */
    targetOrigins: {},
    /**
     * `owner::profileId -> value` для `getInTouch`.
     *
     * У value-first структурі значення сидить у назві ключа, тож без цього
     * покажчика довелось би обходити всі значення власника, щоб дізнатись, чи
     * вже є ця картка. Тут це один пошук замість обходу.
     */
    getInTouchByProfile: {},
    appliedGroups: [],
    report: {
      startedAt: new Date().toISOString(),
      sourceStats: {
        users: { recordCount: Object.keys(originalUsers).length },
        newUsers: { recordCount: Object.keys(originalNewUsers).length },
      },
      groups: {},
      conflicts: [],
      warnings: [],
      warningsByCode: {},
      securityWarnings: collectSecurityWarnings(originalUsers, originalNewUsers),
      unmappedFieldStats: {},
    },
  };
};

/** Повне повернення до завантажених файлів (§24). */
export const resetMigrationState = state => createMigrationState({
  users: state.originalUsers,
  newUsers: state.originalNewUsers,
});

// ---------------------------------------------------------------------------
// Планування
// ---------------------------------------------------------------------------

const createPlanContext = (state, group) => ({
  state,
  group,
  node: MIGRATION_GROUPS.find(entry => entry.id === group)?.node || null,
  pendingTargets: {},
  pendingGetInTouchByProfile: {},
  writes: [],
  getInTouchWrites: [],
  deletions: [],
  consumedFromUsers: [],
  consumedKeys: new Set(),
  conflicts: [],
  warnings: [],
  warningsByCode: {},
  counters: emptyCounters(),
});

const readPlannedTarget = (ctx, profileId, field) => {
  const pending = ctx.pendingTargets[profileId];
  if (pending && Object.prototype.hasOwnProperty.call(pending, field)) {
    return { exists: true, value: pending[field].value, origin: pending[field].origin };
  }
  const stored = ctx.state.targets[ctx.node]?.[profileId];
  if (stored && Object.prototype.hasOwnProperty.call(stored, field)) {
    return {
      exists: true,
      value: stored[field],
      origin: ctx.state.targetOrigins?.[ctx.node]?.[profileId]?.[field] || 'unknown',
    };
  }
  return { exists: false };
};

const addWarning = (ctx, warning) => {
  ctx.warningsByCode[warning.code] = (ctx.warningsByCode[warning.code] || 0) + 1;
  if (ctx.warnings.length < MIGRATION_DETAIL_CAP) ctx.warnings.push(warning);
};

const addConflict = (ctx, conflict) => {
  ctx.counters.conflicts += 1;
  if (ctx.conflicts.length < MIGRATION_DETAIL_CAP) ctx.conflicts.push(conflict);
};

/**
 * Поля, у яких розбіжність між копіями розсуджується датою, а не людиною.
 *
 * «Коли анкету востаннє бачили» — це не думка колекції, а факт, і з двох
 * записів правдивий пізніший: старіший просто відстав. Тож замість конфлікту
 * тут перемагає та копія, що ближча до сьогодні, — але лише коли обидва
 * значення справді дати. Незрозуміле значення повертає все до звичайного
 * правила: розбіжність їде у звіт.
 */
const RECENCY_WINS_FIELDS = ['lastLogin', 'lastLogin2'];

/**
 * Один запис у цільовий вузол — і рішення, чи можна після нього чіпати джерело.
 *
 * Чотири результати, і тільки останній не означає успіх:
 *   `copied`   — у цілі поля не було, кладемо;
 *   `already`  — там уже лежить те саме значення (повторний клік нічого не робить);
 *   `replaced` — там лежить старіша дата входу, і її змінює свіжіша;
 *   `conflict` — там лежить інше значення. Ціль не перезаписується, джерело не
 *                видаляється, розбіжність їде у звіт.
 */
const offerValue = (ctx, { profileId, field, value, sourceCollection, derived = false }) => {
  const existing = readPlannedTarget(ctx, profileId, field);

  if (!existing.exists) {
    ctx.writes.push({ node: ctx.node, profileId, field, value, origin: sourceCollection });
    if (!ctx.pendingTargets[profileId]) ctx.pendingTargets[profileId] = {};
    ctx.pendingTargets[profileId][field] = { value, origin: sourceCollection };

    if (derived) ctx.counters.derivedValuesCreated += 1;
    if (sourceCollection === 'users') ctx.counters.fieldsCopiedFromUsers += 1;
    else ctx.counters.fieldsMovedFromNewUsers += 1;
    return 'copied';
  }

  if (deepEqual(existing.value, value)) {
    ctx.counters.alreadyPresent += 1;
    return 'already';
  }

  if (RECENCY_WINS_FIELDS.includes(field)) {
    const comparison = compareLoginRecency(value, existing.value);
    if (comparison !== null) {
      const warning = {
        code: 'LOGIN_RECENCY_RESOLVED',
        profileId,
        field,
        collection: sourceCollection,
        targetGroup: ctx.group,
        keptValue: comparison > 0 ? value : existing.value,
        droppedValue: comparison > 0 ? existing.value : value,
        keptSource: comparison > 0 ? sourceCollection : existing.origin,
      };
      addWarning(ctx, warning);

      // Свіжіше значення заміщає старіше просто новим записом: `applyMigrationPlan`
      // виконує записи по черзі, тож останній і лишається в цілі.
      if (comparison > 0) {
        ctx.writes.push({ node: ctx.node, profileId, field, value, origin: sourceCollection });
        if (!ctx.pendingTargets[profileId]) ctx.pendingTargets[profileId] = {};
        ctx.pendingTargets[profileId][field] = { value, origin: sourceCollection };
        if (sourceCollection === 'users') ctx.counters.fieldsCopiedFromUsers += 1;
        else ctx.counters.fieldsMovedFromNewUsers += 1;
        return 'replaced';
      }

      // Старіше значення не записується — але джерело своє віддало, і тримати
      // його далі нема за чим: свіжіша дата вже в цілі.
      ctx.counters.alreadyPresent += 1;
      return 'already';
    }
  }

  const conflict = {
    profileId,
    targetGroup: ctx.group,
    field,
    reason: 'SOURCE_CONFLICT',
    existingSource: existing.origin,
    incomingSource: sourceCollection,
  };
  // Форма зі специфікації — коли конфлікт справді між двома колекціями.
  if (existing.origin === 'users' && sourceCollection === 'newUsers') {
    conflict.usersValue = existing.value;
    conflict.newUsersValue = value;
  } else {
    conflict.existingValue = existing.value;
    conflict.incomingValue = value;
  }
  addConflict(ctx, conflict);
  return 'conflict';
};

/**
 * Поле спожите — тобто воно доїхало в новий вузол.
 *
 * Для `newUsers` це означає видалення з робочої копії: саме так із неї
 * поступово зникає все перенесене. Для `users` видалення немає — це
 * legacy-колекція мобільного застосунку, і чистити її нікому, — але знати, що
 * поле переїхало, все одно треба: різниця між тим, що було, і тим, що спожито,
 * і є відповіддю на питання «що не переїхало».
 *
 * Облік один на дві колекції навмисно: якби «спожито» рахувалось окремо від
 * «видалено», вони б розійшлись, і залишок по `users` показував би не те.
 */
const planConsumption = (ctx, sourceCollection, profileId, field) => {
  const key = `${sourceCollection}::${profileId}::${field}`;
  if (ctx.consumedKeys.has(key)) return;

  if (sourceCollection === 'newUsers') {
    const profile = ctx.state.workingNewUsers[profileId];
    if (!profile || typeof profile !== 'object') return;
    if (!Object.prototype.hasOwnProperty.call(profile, field)) return;

    ctx.consumedKeys.add(key);
    ctx.deletions.push({ profileId, field });
    ctx.counters.deletionsFromNewUsers += 1;
    return;
  }

  const profile = ctx.state.originalUsers[profileId];
  if (!profile || typeof profile !== 'object') return;
  if (!Object.prototype.hasOwnProperty.call(profile, field)) return;

  ctx.consumedKeys.add(key);
  ctx.consumedFromUsers.push({ profileId, field });
  ctx.counters.consumedFromUsers += 1;
};

const isSuccess = outcome => outcome === 'copied' || outcome === 'already' || outcome === 'replaced';

/** Пряме поле: значення переноситься як є, без зміни типу (§20). */
const planDirectField = (ctx, { profileId, field, source, sourceCollection }) => {
  if (!Object.prototype.hasOwnProperty.call(source, field)) {
    ctx.counters.skippedAbsent += 1;
    return;
  }

  const raw = source[field];
  if (!hasMeaningfulValue(raw)) {
    // Міграція — не прибирання. Порожнє значення не переноситься, але й не
    // зникає: розбиратись із ним буде людина, дивлячись на cleaned-newUsers.
    ctx.counters.skippedEmpty += 1;
    addWarning(ctx, {
      code: 'EMPTY_SOURCE_VALUE',
      profileId,
      field,
      collection: sourceCollection,
      targetGroup: ctx.group,
    });
    return;
  }

  const outcome = offerValue(ctx, {
    profileId,
    field,
    value: deepClone(raw),
    sourceCollection,
  });

  if (isSuccess(outcome)) planConsumption(ctx, sourceCollection, profileId, field);
};

/**
 * `role` — єдина похідна, яку рахують одразу по обох колекціях.
 *
 * Решта похідних відповідає на питання «що каже ця копія анкети», і на нього в
 * кожної копії своя відповідь. Роль — питання іншого роду: у яких ролях анкета
 * себе заявляла. Відповідь на нього одна на всю анкету, і збирається вона з
 * усіх чотирьох місць, де роль буває, — `userRole` та `role` у `users` і в
 * `newUsers`. Тому прохід тут один на профіль, а не по одному на колекцію:
 * інакше друга копія приносила б у ціль інший масив і сперечалася б із першою.
 *
 * Ключі забираються з обох колекцій — але, як завжди, лише ті, з яких у
 * зібраний набір справді щось потрапило.
 */
const planMergedRole = (ctx, { profileId, usersSource, newUsersSource }) => {
  const merged = deriveRole(usersSource, newUsersSource);
  if (merged.value === undefined) return;

  const perCollection = [
    ['users', deriveRole(usersSource)],
    ['newUsers', deriveRole(newUsersSource)],
  ];

  // Походженням вважається `users`, коли вона внесла хоч один варіант: у
  // конфлікті з нею legacy-колекція виграє, і облік має казати те саме.
  const sourceCollection = perCollection[0][1].value !== undefined ? 'users' : 'newUsers';

  const outcome = offerValue(ctx, {
    profileId,
    field: 'role',
    value: merged.value,
    sourceCollection,
    derived: true,
  });

  if (!isSuccess(outcome)) return;
  // Кожна колекція віддає рівно ті свої ключі, з яких у зібраний набір щось
  // потрапило. Значення, з якого не вийшло жодного варіанта, лишається на
  // місці — навіть коли роль у сусідній копії знайшлась.
  perCollection.forEach(([collection, role]) => {
    role.consumed.forEach(field => planConsumption(ctx, collection, profileId, field));
  });
};

/**
 * Похідні картки стрічки.
 *
 * Кожна з них має власне правило щодо джерела, і всі правила — обмежувальні:
 * `surname` і `blood` не видаляються тут узагалі, бо повні значення ще потрібні
 * `profileDetails`; `photos` не видаляється, навіть коли з нього взято аватар;
 * `lastLogin*` не видаляються, бо на них чекає `profileTechnical`.
 *
 * `role` сюди не входить: він рахується один раз на анкету, по обох колекціях
 * одразу (`planMergedRole`).
 */
const planMatchingDerivedFields = (ctx, { profileId, source, sourceCollection }) => {
  const surnameShort = deriveSurnameShort(source.surname);
  if (surnameShort.warning) {
    addWarning(ctx, {
      code: surnameShort.warning,
      profileId,
      field: 'surname',
      collection: sourceCollection,
      targetGroup: ctx.group,
    });
  } else if (surnameShort.value !== undefined) {
    offerValue(ctx, {
      profileId,
      field: 'surnameShort',
      value: surnameShort.value,
      sourceCollection,
      derived: true,
    });
    // `surname` лишається: `profileDetails` забере його повним значенням.
  }

  // Резус і номер групи — два впорядковані скаляри, за якими фільтрує стрічка.
  // Сире `blood` (вільний текст, а бува й масив версій) лишається на місці:
  // повне значення забере `profileDetails`.
  [
    ['rh', deriveRh(source.blood)],
    ['bloodGroup', deriveBloodGroup(source.blood)],
  ].forEach(([field, derived]) => {
    if (derived.warning) {
      addWarning(ctx, {
        code: derived.warning,
        profileId,
        field: 'blood',
        collection: sourceCollection,
        targetGroup: ctx.group,
      });
      return;
    }
    if (derived.value === undefined) return;
    offerValue(ctx, { profileId, field, value: derived.value, sourceCollection, derived: true });
  });

  const avatar = deriveAvatar(source);
  if (avatar.value !== undefined) {
    const outcome = offerValue(ctx, {
      profileId,
      field: 'avatar',
      value: avatar.value,
      sourceCollection,
      derived: true,
    });
    // Окреме поле `avatar` — це пряма копія, його можна прибрати. Виведене з
    // `photos` — ні: набір фото ще не мігрував.
    if (isSuccess(outcome) && !avatar.fromPhotos) {
      planConsumption(ctx, sourceCollection, profileId, 'avatar');
    }
  }

  // Про `publish` говорить лише запис, у якому цей ключ узагалі є. Інакше
  // повторний прогін (після того, як `publish` уже видалено) читав би
  // відсутність як «не показувати» і сперечався б із власним результатом.
  // Стрічка — це показані картки колекції `users`, і тільки вони. `newUsers`
  // поля `publish` не має взагалі, її анкети користувачам не показуються, тож
  // `feedDate` з цього боку не зʼявляється навіть тоді, коли дата в анкеті є.
  //
  // Випадковий `publish` у `newUsers` не переноситься і не видаляється: на
  // стрічку він вплинути не може, а вигадувати йому значення — це рівно те,
  // чого міграція не робить. Він лишається на місці і йде у звіт.
  if (sourceCollection === 'newUsers' && Object.prototype.hasOwnProperty.call(source, 'publish')) {
    addWarning(ctx, {
      code: 'PUBLISH_IN_NEW_USERS_IGNORED',
      profileId,
      field: 'publish',
      collection: sourceCollection,
      targetGroup: ctx.group,
    });
  }

  if (sourceCollection === 'users' && Object.prototype.hasOwnProperty.call(source, 'publish')) {
    const feed = deriveFeedDate(source);

    if (feed.warning) {
      // Показана картка без придатної дати. Фальшива дата зробила б її
      // показаною «сьогодні» — тож дати немає, і `publish` лишається на місці.
      ctx.counters.errors += 1;
      addWarning(ctx, {
        code: feed.warning,
        severity: 'BLOCKING',
        profileId,
        field: 'publish',
        collection: sourceCollection,
        targetGroup: ctx.group,
      });
    } else if (feed.value !== undefined) {
      const outcome = offerValue(ctx, {
        profileId,
        field: 'feedDate',
        value: feed.value,
        sourceCollection,
        derived: true,
      });
      if (isSuccess(outcome)) planConsumption(ctx, sourceCollection, profileId, 'publish');
    } else {
      // Не показана. Семантика виражається відсутністю ключа — але тільки якщо
      // ключа там справді немає. Якщо `users` уже поклав дату, це розбіжність
      // джерел, а не «успішно виражено».
      const existing = readPlannedTarget(ctx, profileId, 'feedDate');
      if (existing.exists) {
        addConflict(ctx, {
          profileId,
          targetGroup: ctx.group,
          field: 'feedDate',
          reason: 'FEED_DATE_PUBLISH_CONFLICT',
          existingSource: existing.origin,
          incomingSource: sourceCollection,
          existingValue: existing.value,
          incomingValue: null,
        });
      } else {
        planConsumption(ctx, sourceCollection, profileId, 'publish');
      }
    }
  }
};

/** Кнопка GetInTouch: `owner/value/profileId = true` (§14). */
const planGetInTouch = (ctx, { profileId, source, sourceCollection, ownerUid }) => {
  if (!Object.prototype.hasOwnProperty.call(source, 'getInTouch')) {
    ctx.counters.skippedAbsent += 1;
    return;
  }

  const raw = source.getInTouch;
  if (!hasMeaningfulValue(raw)) {
    ctx.counters.skippedEmpty += 1;
    addWarning(ctx, {
      code: 'EMPTY_SOURCE_VALUE',
      profileId,
      field: 'getInTouch',
      collection: sourceCollection,
      targetGroup: ctx.group,
    });
    return;
  }

  const safety = checkGetInTouchKeySafety(raw);
  if (!safety.safe) {
    // Лишилось тільки те, з чого ключа не буває взагалі: порожнє значення або
    // самі лише заборонені символи. Таке джерело лишається на місці.
    ctx.counters.unsafeKeys += 1;
    addWarning(ctx, {
      code: safety.reason,
      profileId,
      field: 'getInTouch',
      collection: sourceCollection,
      targetGroup: ctx.group,
      value: safety.original,
    });
    return;
  }

  if (safety.changed) {
    // Значення виправлене, а не відкинуте, — але виправлення видно: у звіті
    // стоять обидві форми, тож адмін упізнає свою нотатку і бачить, під яким
    // ключем вона тепер лежить.
    ctx.counters.unsafeKeys += 1;
    addWarning(ctx, {
      code: safety.reason,
      profileId,
      field: 'getInTouch',
      collection: sourceCollection,
      targetGroup: ctx.group,
      value: safety.original,
      key: safety.key,
    });
  }

  // Одна картка має в одного власника рівно одне значення `getInTouch`. Якщо
  // `users` і `newUsers` кажуть різне, у value-first структурі це вилилось би
  // у два записи під різними ключами — картка опинилась би одразу у двох
  // списках. Тож розбіжність тут така сама, як і всюди: конфлікт, і джерело
  // лишається на місці.
  const profileKey = `${ownerUid}::${profileId}`;
  const known = ctx.pendingGetInTouchByProfile[profileKey]
    ?? ctx.state.getInTouchByProfile?.[profileKey];

  if (known !== undefined && known !== safety.key) {
    addConflict(ctx, {
      profileId,
      targetGroup: ctx.group,
      field: 'getInTouch',
      reason: 'SOURCE_CONFLICT',
      existingValue: known,
      incomingValue: safety.key,
      incomingSource: sourceCollection,
    });
    return;
  }

  if (known === safety.key) {
    ctx.counters.alreadyPresent += 1;
  } else {
    ctx.getInTouchWrites.push({ ownerUid, value: safety.key, profileId });
    ctx.pendingGetInTouchByProfile[profileKey] = safety.key;
    ctx.counters.derivedValuesCreated += 1;
    if (sourceCollection === 'users') ctx.counters.fieldsCopiedFromUsers += 1;
    else ctx.counters.fieldsMovedFromNewUsers += 1;
  }

  planConsumption(ctx, sourceCollection, profileId, 'getInTouch');
};

/**
 * План групи — що саме буде записано і що саме буде видалено.
 *
 * Нічого не мутує: план можна порахувати, показати адміну і не застосовувати.
 * `users` обробляється першим, `newUsers` — другим, тож при розбіжності
 * значень цілим лишається те, що прийшло з legacy-колекції, а `newUsers`
 * повідомляє про конфлікт і нічого не втрачає (§19).
 */
export const planMigrationGroup = (state, group, options = {}) => {
  const ctx = createPlanContext(state, group);
  const directFields = DIRECT_FIELDS_BY_GROUP[group] || [];
  const ownerUid = String(options.getInTouchOwnerUid || '').trim();

  if (group === 'getInTouch' && !ownerUid) {
    return {
      group,
      node: ctx.node,
      blocked: 'MISSING_GET_IN_TOUCH_OWNER',
      writes: [],
      getInTouchWrites: [],
      deletions: [],
      consumedFromUsers: [],
      conflicts: [],
      warnings: [],
      warningsByCode: {},
      counters: emptyCounters(),
    };
  }

  const profileIds = [...new Set([
    ...Object.keys(state.originalUsers || {}),
    ...Object.keys(state.workingNewUsers || {}),
  ])].sort();

  profileIds.forEach(profileId => {
    ctx.counters.profilesScanned += 1;

    /**
     * Пряме поле читається з робочої копії, похідне — з початкової.
     *
     * Різниця не косметична. Пряме поле картка забирає собі, тож робоча копія
     * і є відповіддю на питання «чи воно ще тут». А `surname`, `blood`,
     * `photos`, `lastLogin*` картка тільки читає: володіють ними `profileDetails`
     * і `profileTechnical`, і саме вони їх видаляють. Якби похідні читались із
     * робочої копії, порядок натискання кнопок міняв би результат: після
     * «Migrate Profiles» стрічка лишилась би без `surnameShort`, `rh`,
     * `bloodGroup` і аватарів — мовчки, бо джерело вже поїхало у свій вузол і
     * скаржитись нема на що.
     *
     * Початкова копія цього не ламає: похідні не видаляють нічого, чим не
     * володіють, а повторне виведення того самого значення впирається в
     * `already` і нових записів не робить.
     */
    const passes = [
      ['users', state.originalUsers?.[profileId], state.originalUsers?.[profileId]],
      ['newUsers', state.workingNewUsers?.[profileId], state.originalNewUsers?.[profileId]],
    ];

    if (group === 'matchingCards') {
      planMergedRole(ctx, {
        profileId,
        usersSource: state.originalUsers?.[profileId],
        newUsersSource: state.originalNewUsers?.[profileId],
      });
    }

    passes.forEach(([sourceCollection, source, derivationSource]) => {
      if (!source || typeof source !== 'object') return;

      if (group === 'getInTouch') {
        planGetInTouch(ctx, { profileId, source, sourceCollection, ownerUid });
        return;
      }

      directFields.forEach(field => planDirectField(ctx, { profileId, field, source, sourceCollection }));

      if (group === 'matchingCards') {
        planMatchingDerivedFields(ctx, {
          profileId,
          source: derivationSource && typeof derivationSource === 'object' ? derivationSource : source,
          sourceCollection,
        });
      }
    });
  });

  return {
    group,
    node: ctx.node,
    blocked: null,
    writes: ctx.writes,
    getInTouchWrites: ctx.getInTouchWrites,
    deletions: ctx.deletions,
    consumedFromUsers: ctx.consumedFromUsers,
    conflicts: ctx.conflicts,
    warnings: ctx.warnings,
    warningsByCode: ctx.warningsByCode,
    counters: ctx.counters,
  };
};

// ---------------------------------------------------------------------------
// Застосування
// ---------------------------------------------------------------------------

const rememberOrigin = (state, node, profileId, field, origin) => {
  if (!state.targetOrigins[node]) state.targetOrigins[node] = {};
  if (!state.targetOrigins[node][profileId]) state.targetOrigins[node][profileId] = {};
  state.targetOrigins[node][profileId][field] = origin;
};

/**
 * Залишкові поля `workingNewUsers` — те, чого жодна група не забрала.
 *
 * Ділиться надвоє: `mapped` — поле, яке група знає, але цього разу не змогла
 * перенести (конфлікт, порожньо, ще не натиснута кнопка); `unknown` — поле,
 * якого немає в жодному allowlist. Друге і є та купка, заради якої міграція не
 * робить `profileDetails = все, що лишилось`.
 */
const buildUnmappedFieldStats = workingNewUsers => {
  const stats = { mapped: {}, unknown: {}, excluded: {} };
  Object.values(workingNewUsers || {}).forEach(profile => {
    if (!profile || typeof profile !== 'object') return;
    Object.keys(profile).forEach(field => {
      let bucket = 'unknown';
      if (NEVER_MIGRATED_FIELDS.includes(field)
        || ACCESS_CONTROL_FIELDS.includes(field)
        || SECRET_FIELDS.includes(field)) bucket = 'excluded';
      else if (ALL_MAPPED_FIELDS.includes(field)
        || field === 'publish' || field === 'userRole' || field === 'getInTouch') bucket = 'mapped';
      stats[bucket][field] = (stats[bucket][field] || 0) + 1;
    });
  });
  return stats;
};

const countRemainingKeys = workingNewUsers => Object.values(workingNewUsers || {}).reduce(
  (total, profile) => total + (profile && typeof profile === 'object' ? Object.keys(profile).length : 0),
  0,
);

/**
 * Застосовує план: пише в цілі, видаляє з `workingNewUsers`, копить звіт.
 *
 * Порядок важливий — спершу записи, потім видалення. План уже вирішив, що
 * видаляти можна, але тримати цей порядок дешево, а плутати його — ні.
 */
export const applyMigrationPlan = (state, plan) => {
  if (plan.blocked) return state;

  plan.writes.forEach(({ node, profileId, field, value, origin }) => {
    if (!state.targets[node][profileId]) state.targets[node][profileId] = {};
    state.targets[node][profileId][field] = deepClone(value);
    rememberOrigin(state, node, profileId, field, origin);
  });

  plan.getInTouchWrites.forEach(({ ownerUid, value, profileId }) => {
    const root = state.targets.multiDataPatch.getInTouch;
    if (!root[ownerUid]) root[ownerUid] = {};
    if (!root[ownerUid][value]) root[ownerUid][value] = {};
    root[ownerUid][value][profileId] = true;
    state.getInTouchByProfile[`${ownerUid}::${profileId}`] = value;
  });

  plan.deletions.forEach(({ profileId, field }) => {
    const profile = state.workingNewUsers[profileId];
    if (profile && typeof profile === 'object') delete profile[field];
  });

  // З `users` нічого не видаляється — тільки з копії залишку. Це не чистка
  // колекції, а відмітка «це поле вже в новому вузлі».
  (plan.consumedFromUsers || []).forEach(({ profileId, field }) => {
    const profile = state.remainingUsers[profileId];
    if (profile && typeof profile === 'object') delete profile[field];
  });

  const previous = state.report.groups[plan.group];
  state.report.groups[plan.group] = {
    lastRunAt: new Date().toISOString(),
    runCount: (previous?.runCount || 0) + 1,
    ...plan.counters,
    remainingNewUsersKeys: countRemainingKeys(state.workingNewUsers),
    remainingUsersKeys: countRemainingKeys(state.remainingUsers),
  };

  plan.conflicts.forEach(conflict => {
    if (state.report.conflicts.length < MIGRATION_DETAIL_CAP) state.report.conflicts.push(conflict);
  });
  plan.warnings.forEach(warning => {
    if (state.report.warnings.length < MIGRATION_DETAIL_CAP) state.report.warnings.push(warning);
  });
  Object.entries(plan.warningsByCode).forEach(([code, count]) => {
    state.report.warningsByCode[code] = (state.report.warningsByCode[code] || 0) + count;
  });

  state.report.unmappedFieldStats = buildUnmappedFieldStats(state.workingNewUsers);
  if (!state.appliedGroups.includes(plan.group)) state.appliedGroups.push(plan.group);

  return state;
};

/** Спланувати і одразу застосувати — зручний шлях для тестів. */
export const runMigrationGroup = (state, group, options = {}) => {
  const plan = planMigrationGroup(state, group, options);
  applyMigrationPlan(state, plan);
  return plan;
};

// ---------------------------------------------------------------------------
// Експорт
// ---------------------------------------------------------------------------

/**
 * Один файл під ручний імпорт у корінь бази.
 *
 * `/users` сюди не входить принципово: legacy-колекція мобільного застосунку
 * не має жодної причини їхати назад у базу з цього інструмента.
 */
export const buildCombinedRootPatch = state => ({
  [PROFILE_NODES.matchingCards]: state.targets[PROFILE_NODES.matchingCards],
  [PROFILE_NODES.profileDetails]: state.targets[PROFILE_NODES.profileDetails],
  [PROFILE_NODES.profileContacts]: state.targets[PROFILE_NODES.profileContacts],
  [PROFILE_NODES.profileWorkflow]: state.targets[PROFILE_NODES.profileWorkflow],
  [PROFILE_NODES.profileTechnical]: state.targets[PROFILE_NODES.profileTechnical],
  multiData: { getInTouch: state.targets.multiDataPatch.getInTouch },
});

/** Звіт із підсумком по залишку — те, що адмін читає замість здогадок. */
export const buildMigrationAudit = state => ({
  ...state.report,
  finishedAt: new Date().toISOString(),
  appliedGroups: [...state.appliedGroups],
  remainingNewUsers: {
    recordCount: Object.keys(state.workingNewUsers).length,
    keyCount: countRemainingKeys(state.workingNewUsers),
  },
  remainingUsers: {
    recordCount: Object.keys(state.remainingUsers).length,
    keyCount: countRemainingKeys(state.remainingUsers),
  },
  detailCap: MIGRATION_DETAIL_CAP,
});

/**
 * Залишок колекції — звіт, а не патч.
 *
 * Порожні анкети звідси прибрані: анкета, з якої забрали все, — це успіх, і в
 * списку «що не переїхало» їй робити нічого. Значення секретів заміщені
 * позначкою: побачити треба, що поле лишилось, а не яке воно.
 */
const REDACTED = '[не показано]';

/**
 * Поля, від яких у звіті лишається сам факт, а не вміст.
 *
 * `attitude` — це історія реакцій цілим журналом: на 71 анкету він дає майже
 * третину мегабайта, тобто більше, ніж усе інше в залишку разом. У новий
 * backend він не їде, розбирати його ніхто не буде, а читати звіт крізь нього
 * доводиться. Тож ключ лишається видимим — щоб не здавалось, ніби поля немає
 * зовсім, — а вміст ні: він і далі лежить у самій базі.
 */
const BULKY_REPORT_FIELDS = ['attitude'];
const OMITTED = '[не показано у звіті]';

const buildRemainderReport = collection => {
  const out = {};
  Object.entries(collection || {}).forEach(([profileId, profile]) => {
    if (!profile || typeof profile !== 'object') {
      if (profile !== undefined) out[profileId] = profile;
      return;
    }
    const fields = Object.keys(profile);
    if (!fields.length) return;
    const copy = {};
    fields.forEach(field => {
      if (SECRET_FIELDS.includes(field)) copy[field] = REDACTED;
      else if (BULKY_REPORT_FIELDS.includes(field)) copy[field] = OMITTED;
      else copy[field] = deepClone(profile[field]);
    });
    out[profileId] = copy;
  });
  return out;
};

/** Рештки `newUsers` — те саме, що поїде в `cleaned-newUsers`, але для очей. */
export const buildRemainingNewUsers = state => buildRemainderReport(state.workingNewUsers);

/** Рештки `users` — поля, яких жодна група не забрала. */
export const buildRemainingUsers = state => buildRemainderReport(state.remainingUsers);

/**
 * Обидва залишки одним файлом, із підсумком.
 *
 * Дві колекції поруч, бо питання в адміна одне на дві: що лишилось поза новими
 * вузлами. Розкладати відповідь по двох файлах і зводити руками — зайве.
 */
export const buildRemaindersExport = state => {
  const users = buildRemainingUsers(state);
  const newUsers = buildRemainingNewUsers(state);

  return {
    generatedAt: new Date().toISOString(),
    appliedGroups: [...state.appliedGroups],
    note: 'Звіт, не патч. Не імпортувати в базу. Значення паролів заміщені.',
    summary: {
      users: {
        sourceRecordCount: Object.keys(state.originalUsers).length,
        remainingRecordCount: Object.keys(users).length,
        remainingKeyCount: countRemainingKeys(state.remainingUsers),
        unmappedFieldStats: buildUnmappedFieldStats(state.remainingUsers),
      },
      newUsers: {
        sourceRecordCount: Object.keys(state.originalNewUsers).length,
        remainingRecordCount: Object.keys(newUsers).length,
        remainingKeyCount: countRemainingKeys(state.workingNewUsers),
        // Рахується тут і зараз, а не береться зі звіту: у звіті ця розкладка
        // зʼявляється лише після першого `Apply`, тож у файлі, викачаному після
        // самих лише Preview, на місці найбільшої колекції стояла порожнеча —
        // при тому, що поруч чесно написано 192 тисячі ключів.
        unmappedFieldStats: buildUnmappedFieldStats(state.workingNewUsers),
      },
    },
    users,
    newUsers,
  };
};

export const buildCleanedNewUsers = state => deepClone(state.workingNewUsers);

export const getMigrationTarget = (state, node) => deepClone(state.targets[node]);

export const getGetInTouchPatch = state => deepClone(state.targets.multiDataPatch.getInTouch);
