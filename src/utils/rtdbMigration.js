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
  deletionKeys: new Set(),
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
 * Один запис у цільовий вузол — і рішення, чи можна після нього чіпати джерело.
 *
 * Три результати, і тільки два з них означають успіх:
 *   `copied`   — у цілі поля не було, кладемо;
 *   `already`  — там уже лежить те саме значення (повторний клік нічого не робить);
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

/** Видалення з `workingNewUsers` — рівно те поле, за яке щойно відзвітували успіх. */
const planDeletion = (ctx, profileId, field) => {
  const profile = ctx.state.workingNewUsers[profileId];
  if (!profile || typeof profile !== 'object') return;
  if (!Object.prototype.hasOwnProperty.call(profile, field)) return;

  const key = `${profileId}::${field}`;
  if (ctx.deletionKeys.has(key)) return;
  ctx.deletionKeys.add(key);
  ctx.deletions.push({ profileId, field });
  ctx.counters.deletionsFromNewUsers += 1;
};

const isSuccess = outcome => outcome === 'copied' || outcome === 'already';

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

  if (sourceCollection === 'newUsers' && isSuccess(outcome)) planDeletion(ctx, profileId, field);
};

/**
 * Похідні картки стрічки.
 *
 * Кожна з них має власне правило щодо джерела, і всі правила — обмежувальні:
 * `surname` і `blood` не видаляються тут узагалі, бо повні значення ще потрібні
 * `profileDetails`; `photos` не видаляється, навіть коли з нього взято аватар;
 * `lastLogin*` не видаляються, бо на них чекає `profileTechnical`.
 */
const planMatchingDerivedFields = (ctx, { profileId, source, sourceCollection }) => {
  const role = deriveRole(source);
  if (role.conflict) {
    addConflict(ctx, {
      profileId,
      targetGroup: ctx.group,
      field: 'role',
      reason: role.conflict,
      userRoleValue: source.userRole,
      roleValue: source.role,
    });
  } else if (role.value !== undefined) {
    const outcome = offerValue(ctx, {
      profileId,
      field: 'role',
      value: role.value,
      sourceCollection,
      derived: true,
    });
    // Обидва старі ключі йдуть тільки разом і тільки після безконфліктного `role`.
    if (sourceCollection === 'newUsers' && isSuccess(outcome)) {
      role.consumed.forEach(field => planDeletion(ctx, profileId, field));
    }
  }

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
    if (sourceCollection === 'newUsers' && isSuccess(outcome) && !avatar.fromPhotos) {
      planDeletion(ctx, profileId, 'avatar');
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
      if (sourceCollection === 'newUsers' && isSuccess(outcome)) planDeletion(ctx, profileId, 'publish');
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
      } else if (sourceCollection === 'newUsers') {
        planDeletion(ctx, profileId, 'publish');
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
    // Мовчазне кодування зробило б значення невпізнаваним для адміна, який його
    // й писав. Тож джерело лишається, а випадок їде у звіт.
    ctx.counters.unsafeKeys += 1;
    addWarning(ctx, {
      code: safety.reason,
      profileId,
      field: 'getInTouch',
      collection: sourceCollection,
      targetGroup: ctx.group,
      value: safety.key,
    });
    return;
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

  if (sourceCollection === 'newUsers') planDeletion(ctx, profileId, 'getInTouch');
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

    const passes = [
      ['users', state.originalUsers?.[profileId]],
      ['newUsers', state.workingNewUsers?.[profileId]],
    ];

    passes.forEach(([sourceCollection, source]) => {
      if (!source || typeof source !== 'object') return;

      if (group === 'getInTouch') {
        planGetInTouch(ctx, { profileId, source, sourceCollection, ownerUid });
        return;
      }

      directFields.forEach(field => planDirectField(ctx, { profileId, field, source, sourceCollection }));

      if (group === 'matchingCards') {
        planMatchingDerivedFields(ctx, { profileId, source, sourceCollection });
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

  const previous = state.report.groups[plan.group];
  state.report.groups[plan.group] = {
    lastRunAt: new Date().toISOString(),
    runCount: (previous?.runCount || 0) + 1,
    ...plan.counters,
    remainingNewUsersKeys: countRemainingKeys(state.workingNewUsers),
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
  detailCap: MIGRATION_DETAIL_CAP,
});

export const buildCleanedNewUsers = state => deepClone(state.workingNewUsers);

export const getMigrationTarget = (state, node) => deepClone(state.targets[node]);

export const getGetInTouchPatch = state => deepClone(state.targets.multiDataPatch.getInTouch);
