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
  OWNER_MULTI_DATA_FIELD_NAMES,
  OWNER_MULTI_DATA_STRING_FIELDS,
  FIELD_SOURCES,
  isTwinField,
  CLEANED_COLLECTION_NOISE_FIELDS,
  CLEANED_COLLECTION_PRESERVED_FIELDS,
} from './profileNodeSchema';
import {
  hasMeaningfulValue,
  deepClone,
  deepEqual,
  deriveSurnameShort,
  deriveRh,
  deriveAvatar,
  deriveRole,
  deriveFeedDate,
  compareLoginRecency,
  normalizeLegacyDates,
  flattenOwnerValueToString,
} from './rtdbMigrationDerive';
import { isListLikeValue, mergeUserFieldValue } from './mergeUserCollections';

/** Кнопки міграції, у порядку, в якому їх задумано натискати. */
export const MIGRATION_GROUPS = Object.freeze([
  { id: 'matchingCards', label: 'Migrate Matching Cards', node: PROFILE_NODES.matchingCards },
  { id: 'profileContacts', label: 'Migrate Contacts', node: PROFILE_NODES.profileContacts },
  { id: 'profileWorkflow', label: 'Migrate Workflow', node: PROFILE_NODES.profileWorkflow },
  { id: 'profileTechnical', label: 'Migrate Technical', node: PROFILE_NODES.profileTechnical },
  { id: 'getInTouch', label: 'Migrate GetInTouch', node: 'multiDataPatch' },
  // `writer` і графік стимуляції їдуть тим самим шляхом і з тієї ж причини: це
  // позначки адміна про контакт, а не властивості самого контакту.
  { id: 'writer', label: 'Migrate Writer', node: 'multiDataPatch' },
  { id: 'stimulationSchedule', label: 'Migrate Stimulation Schedule', node: 'multiDataPatch' },
  { id: 'profileDetails', label: 'Migrate Profiles', node: PROFILE_NODES.profileDetails },
]);

const DIRECT_FIELDS_BY_GROUP = {
  matchingCards: MATCHING_CARD_DIRECT_FIELDS,
  profileContacts: PROFILE_CONTACT_FIELDS,
  profileWorkflow: PROFILE_WORKFLOW_FIELDS,
  profileTechnical: PROFILE_TECHNICAL_FIELDS,
  profileDetails: PROFILE_DETAIL_FIELDS,
  getInTouch: [],
  writer: [],
  stimulationSchedule: [],
};

/**
 * Під якими ключами поле може лежати в джерелі.
 *
 * Синоніми описані в схемі, і сюди вони приходять цілим переліком: `region`
 * читається і з `region`, і з `state`. Забирається з джерела рівно той ключ, з
 * якого значення взяли, — другий лишається на місці і їде у звіт, бо це вже
 * розбіжність, а не синонім.
 *
 * Виняток — близнюки (`lastLogin` / `lastLogin2`, `createdAt` / `createdAt2`).
 * Там друга копія не розбіжність, а те саме значення іншим написанням, тож
 * забираються обидва ключі: див. `consumeTwinKeys`.
 */
const sourceKeysFor = field => FIELD_SOURCES[field] || [field];

/** Усі ключі-синоніми, які знає хоч одне поле. */
const ALIAS_SOURCE_FIELDS = [...new Set(
  Object.entries(FIELD_SOURCES).flatMap(([field, keys]) => (
    keys.filter(key => key !== field)
  )),
)];

/** Група -> поле власника, яке вона переносить у `multiData`. */
const OWNER_VALUE_FIELD_BY_GROUP = Object.fromEntries(
  OWNER_MULTI_DATA_FIELD_NAMES.map(field => [field, field]),
);

/**
 * Скільки подробиць звіт тримає списком.
 *
 * На 26 тисячах анкет попередження «поле порожнє» дало б сотні тисяч рядків —
 * файл, який ніхто не відкриє. Тому подробиці обрізаються, а рахунок ведеться
 * повний: у `warningsByCode` видно, скільки їх насправді.
 */
export const MIGRATION_DETAIL_CAP = 500;

/**
 * Позначка у файлі залишків — щоб кнопка завантаження впізнала свій формат.
 *
 * Без неї `{ users, newUsers }` не відрізнити від експорту кореня бази, а
 * переплутати їх дорого: у другому випадку в `users` лежала б уся колекція, і
 * інструмент почав би міграцію з нуля поверх уже зробленого.
 */
export const CLEANED_COLLECTIONS_KIND = 'rtdb-migration-cleaned-collections';

const emptyTargets = () => ({
  [PROFILE_NODES.matchingCards]: {},
  [PROFILE_NODES.profileDetails]: {},
  [PROFILE_NODES.profileContacts]: {},
  [PROFILE_NODES.profileWorkflow]: {},
  [PROFILE_NODES.profileTechnical]: {},
  // Не список літералів: поля власника перелічені в схемі, і другий перелік
  // тут розійшовся б із нею при першому ж додаванні.
  multiDataPatch: Object.fromEntries(OWNER_MULTI_DATA_FIELD_NAMES.map(field => [field, {}])),
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
  errors: 0,
  deletionsFromNewUsers: 0,
  consumedFromUsers: 0,
});

/**
 * Ключі, які самі по собі нічого не розповідають про анкету.
 *
 * `userId` дублює назву самого вузла: він у ній і так є. Анкета, у якій після
 * міграції не лишилось нічого, крім нього, — це порожня оболонка, а не дані.
 * У звіті їй робити нічого (там питання «що не переїхало»), а в очищеному
 * файлі — тим паче: файл замінює вузол цілком, тож відсутність такої картки в
 * ньому і є прибиранням оболонки.
 */
const IDENTITY_ONLY_FIELDS = ['userId'];

/** Чи лишилось в анкеті хоч щось, крім її ж ідентифікатора. */
const hasRemainingData = profile => Object.keys(profile)
  .some(field => !IDENTITY_ONLY_FIELDS.includes(field));

/**
 * Поле, яке міграція свідомо не переносить.
 *
 * `userId` тут же: він дублює назву вузла, тобто не дані, а їхня адреса. Без
 * цього рядка він стояв би в купці «поле поза жодним allowlist» на всі 26
 * тисяч анкет — тобто в списку рішень для людини, хоча вирішувати нема чого.
 */
const isExcludedField = field => NEVER_MIGRATED_FIELDS.includes(field)
  || ACCESS_CONTROL_FIELDS.includes(field)
  || SECRET_FIELDS.includes(field)
  || IDENTITY_ONLY_FIELDS.includes(field);

/**
 * Поле, у якого є нове місце.
 *
 * Крім вузлів профілю сюди входять `publish` і `userRole` (їх забирають
 * похідні картки) та поля власника — вони їдуть у `multiData`, а не у вузол
 * анкети, але місце в них є, і в «невідоме» їм не місце.
 */
const isMappedField = field => ALL_MAPPED_FIELDS.includes(field)
  || field === 'publish'
  || field === 'userRole'
  || ALIAS_SOURCE_FIELDS.includes(field)
  || OWNER_MULTI_DATA_FIELD_NAMES.includes(field);

/** Скільки анкет колекції звелись до самого лише `userId` (або до порожнечі). */
const countIdentityOnlyRecords = collection => Object.values(collection || {}).reduce(
  (total, profile) => (
    profile && typeof profile === 'object' && !hasRemainingData(profile) ? total + 1 : total
  ),
  0,
);

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
      mapped: isMappedField(field),
      excluded: isExcludedField(field),
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
  pendingOwnerValues: {},
  writes: [],
  ownerValueWrites: [],
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
 *
 * Поле тут одне, хоч у джерелі копій дві: `lastLogin2` більше не окреме поле
 * цілі, а перша копія того самого `lastLogin` (`TWIN_FIELD_SOURCES`). Судити
 * датою треба саме `users` проти `newUsers`, а не два написання в одній анкеті.
 */
const RECENCY_WINS_FIELDS = ['lastLogin'];

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

  // Дві версії списку — це не дві відповіді на те саме питання, а дві частини
  // однієї відповіді. Анкета тримає кілька телефонів, кілька імен, кілька дат
  // пологів, і застосунок роками показував їх злитими саме так
  // (`mergeUserFieldValue`). Оголосити це конфліктом означало б лишити поле
  // непереміщеним узагалі — тобто зробити з двох частин нуль.
  //
  // Два різні скаляри конфліктом лишаються: там форма поля каже, що значення
  // одне, і вибирати між ними — не робота міграції.
  if (isListLikeValue(existing.value) || isListLikeValue(value)) {
    const fromUsers = existing.origin === 'users' ? existing.value : value;
    const fromNewUsers = existing.origin === 'users' ? value : existing.value;
    const merged = mergeUserFieldValue(fromUsers, fromNewUsers);

    addWarning(ctx, {
      code: 'LIST_VALUES_MERGED',
      profileId,
      field,
      collection: sourceCollection,
      targetGroup: ctx.group,
      merged,
    });

    ctx.writes.push({ node: ctx.node, profileId, field, value: merged, origin: sourceCollection });
    if (!ctx.pendingTargets[profileId]) ctx.pendingTargets[profileId] = {};
    ctx.pendingTargets[profileId][field] = { value: merged, origin: sourceCollection };
    if (sourceCollection === 'users') ctx.counters.fieldsCopiedFromUsers += 1;
    else ctx.counters.fieldsMovedFromNewUsers += 1;
    return 'merged';
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

const isSuccess = outcome => outcome === 'copied'
  || outcome === 'already'
  || outcome === 'replaced'
  // Злитий список теж доїхав — обидва джерела віддали в нього своє.
  || outcome === 'merged';

/** Пряме поле: значення переноситься як є, без зміни типу (§20). */
const planDirectField = (ctx, { profileId, field, source, sourceCollection }) => {
  const present = sourceKeysFor(field).filter(
    key => Object.prototype.hasOwnProperty.call(source, key),
  );

  if (!present.length) {
    ctx.counters.skippedAbsent += 1;
    return;
  }

  // Перший непорожній ключ зі списку і є значенням поля. Порядок у списку —
  // це і є рішення: у синонімів попереду канонічне ім'я (`region`, не
  // `state`), у близнюків — ISO-копія (`lastLogin2`, не `lastLogin`).
  const sourceKey = present.find(key => hasMeaningfulValue(source[key]));

  if (!sourceKey) {
    // Міграція — не прибирання. Порожнє значення не переноситься, але й не
    // зникає: розбиратись із ним буде людина, дивлячись на cleaned-newUsers.
    ctx.counters.skippedEmpty += 1;
    addWarning(ctx, {
      code: 'EMPTY_SOURCE_VALUE',
      profileId,
      field: present[0],
      collection: sourceCollection,
      targetGroup: ctx.group,
    });
    return;
  }

  // Дата переїжджає одним написанням — `YYYY-MM-DD`. Це не косметика: поки
  // `25.08.2026` і `2026-08-25` різні рядки, дві копії тієї самої анкети
  // дають конфлікт на рівному місці, а сортування рядком ставить крапкові
  // дати не туди.
  const value = normalizeLegacyDates(deepClone(source[sourceKey]));

  const outcome = offerValue(ctx, { profileId, field, value, sourceCollection });

  if (!isSuccess(outcome)) return;

  planConsumption(ctx, sourceCollection, profileId, sourceKey);
  consumeTwinKeys(ctx, { profileId, field, source, sourceCollection, sourceKey, value, present });
};

/**
 * Забрати другу копію значення — ту, що програла.
 *
 * Для синоніма (`state` при наявному `region`) цього не роблять: два різні
 * імені можуть нести два різні факти, і розбирається з цим людина. Близнюк —
 * інша річ: `lastLogin` і `lastLogin2` пише один і той самий рядок коду з
 * одного значення, тож лишити крапкову копію в `newUsers` означало б лишити
 * її там назавжди — нового місця в неї немає.
 *
 * Мовчки це робиться лише тоді, коли копії справді збігаються. Розбіжність
 * (а вона буває: `createdAt` рахують локальним часом, `createdAt2` — UTC, і
 * після 21:00 за Києвом у них різні дати) їде у звіт окремим кодом. Не
 * конфліктом — рішення вже ухвалене на користь ISO-копії, — але видимим.
 */
const consumeTwinKeys = (ctx, { profileId, field, source, sourceCollection, sourceKey, value, present }) => {
  if (!isTwinField(field)) return;

  present.filter(key => key !== sourceKey).forEach(key => {
    const discarded = normalizeLegacyDates(deepClone(source[key]));
    if (hasMeaningfulValue(discarded) && !deepEqual(discarded, value)) {
      addWarning(ctx, {
        code: 'TWIN_VALUE_DISCARDED',
        profileId,
        field: key,
        collection: sourceCollection,
        targetGroup: ctx.group,
        kept: value,
        discarded,
      });
    }
    planConsumption(ctx, sourceCollection, profileId, key);
  });
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

  // Тільки резус. Номер групи картка не носить: разом вони складаються назад у
  // повне `blood`, а воно за межею приватності — у `profileDetails`. Сире
  // `blood` (вільний текст, а бува й масив версій) лишається на місці: повне
  // значення забере `profileDetails`.
  [
    ['rh', deriveRh(source.blood)],
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

/**
 * Кнопки GetInTouch, Writer і Stimulation Schedule: `owner/profileId = значення` (§14).
 *
 * Жодне з трьох полів не описує анкету: `getInTouch` каже, коли з контактом
 * звʼязатись, `writer` — хто і чим із ним уже спілкувався, графік стимуляції —
 * як його ведуть. Та сама жінка для одного адміна «подзвонити 1 вересня», а
 * для іншого не записана взагалі, тож усі три їдуть під власника.
 *
 * Значення лягає значенням, а не назвою ключа. Ключем воно було раніше — і
 * платою за це були переписані нотатки (ключ не тримає `.`, `/`, `#`, `[`,
 * `]`), переїзд між ключами замість запису і неможливість відсортувати
 * позначки базою. Тепер сортує база: `.indexOn: ".value"` на вузлі власника.
 *
 * Розбіжність між копіями розсуджується як усюди: інше значення в цілі — це
 * конфлікт, ціль не перезаписується, джерело лишається на місці.
 */
const planOwnerValueField = (ctx, { field, profileId, source, sourceCollection, ownerUid }) => {
  if (!Object.prototype.hasOwnProperty.call(source, field)) {
    ctx.counters.skippedAbsent += 1;
    return;
  }

  const raw = source[field];
  if (!hasMeaningfulValue(raw)) {
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

  // Дата «звʼязатись» у старих даних написана двома способами; після переїзду
  // вона одна, інакше сортування за значенням ставило б крапкові дати не туди.
  const normalized = normalizeLegacyDates(deepClone(raw));

  /*
   * Скалярні поля власника зводяться до рядка тут, а не при заливці.
   *
   * `getInTouch` і `writer` база приймає тільки рядком (`.validate` на
   * `$ownerId/$userId`), а в частині старих анкет вони лежать масивом — слід
   * коду, який колись писав `updatedCodes` без `join`. Провалена `.validate`
   * повертається як PERMISSION_DENIED, порція заливки — 200 записів, тож один
   * такий масив валить 199 здорових сусідів і читається як «немає прав на весь
   * вузол». Тому масив стає тим самим рядком, який дала б форма картки, ще на
   * етапі плану: у файл експорту і в базу їде вже одне й те саме значення.
   */
  const value = OWNER_MULTI_DATA_STRING_FIELDS.includes(field) && typeof normalized !== 'string'
    ? flattenOwnerValueToString(normalized)
    : normalized;

  // Порожній рядок після зведення означав би запис «нічого» поверх позначки —
  // це не перенесення, а втрата. Такого в даних немає (вище стоїть перевірка
  // на осмисленість), але ціна помилки тут вища за ціну перевірки.
  if (value === '') {
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

  if (value !== normalized) {
    addWarning(ctx, {
      code: 'OWNER_VALUE_FLATTENED',
      profileId,
      field,
      collection: sourceCollection,
      targetGroup: ctx.group,
      kept: value,
      discarded: normalized,
    });
  }

  const profileKey = `${field}::${ownerUid}::${profileId}`;
  const pending = ctx.pendingOwnerValues[profileKey];
  const stored = ctx.state.targets.multiDataPatch?.[field]?.[ownerUid]?.[profileId];
  const existing = pending !== undefined ? pending : stored;

  if (existing !== undefined) {
    if (deepEqual(existing, value)) {
      ctx.counters.alreadyPresent += 1;
      planConsumption(ctx, sourceCollection, profileId, field);
      return;
    }

    addConflict(ctx, {
      profileId,
      targetGroup: ctx.group,
      field,
      reason: 'SOURCE_CONFLICT',
      existingValue: existing,
      incomingValue: value,
      incomingSource: sourceCollection,
    });
    return;
  }

  ctx.ownerValueWrites.push({ field, ownerUid, profileId, value });
  ctx.pendingOwnerValues[profileKey] = value;
  if (sourceCollection === 'users') ctx.counters.fieldsCopiedFromUsers += 1;
  else ctx.counters.fieldsMovedFromNewUsers += 1;

  planConsumption(ctx, sourceCollection, profileId, field);
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
  const ownerValueField = OWNER_VALUE_FIELD_BY_GROUP[group] || null;
  // Ім'я опції лишилось від часів, коли поле власника було одне; обидва
  // приймаються, щоб виклики з `getInTouchOwnerUid` не поламались мовчки.
  const ownerUid = String(options.ownerUid || options.getInTouchOwnerUid || '').trim();

  if (ownerValueField && !ownerUid) {
    return {
      group,
      node: ctx.node,
      blocked: 'MISSING_OWNER_UID',
      writes: [],
      ownerValueWrites: [],
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

      if (ownerValueField) {
        planOwnerValueField(ctx, {
          field: ownerValueField,
          profileId,
          source,
          sourceCollection,
          ownerUid,
        });
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
    ownerValueWrites: ctx.ownerValueWrites,
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
      if (isExcludedField(field)) bucket = 'excluded';
      else if (isMappedField(field)) bucket = 'mapped';
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

  (plan.ownerValueWrites || []).forEach(({ field, ownerUid, profileId, value }) => {
    const root = state.targets.multiDataPatch[field];
    if (!root[ownerUid]) root[ownerUid] = {};
    root[ownerUid][profileId] = deepClone(value);
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
  multiData: Object.fromEntries(
    OWNER_MULTI_DATA_FIELD_NAMES.map(field => [field, state.targets.multiDataPatch[field]]),
  ),
});

/** Звіт із підсумком по залишку — те, що адмін читає замість здогадок. */
export const buildMigrationAudit = state => ({
  ...state.report,
  finishedAt: new Date().toISOString(),
  appliedGroups: [...state.appliedGroups],
  remainingNewUsers: {
    recordCount: Object.keys(state.workingNewUsers).length,
    keyCount: countRemainingKeys(state.workingNewUsers),
    identityOnlyRecordCount: countIdentityOnlyRecords(state.workingNewUsers),
  },
  remainingUsers: {
    recordCount: Object.keys(state.remainingUsers).length,
    keyCount: countRemainingKeys(state.remainingUsers),
    identityOnlyRecordCount: countIdentityOnlyRecords(state.remainingUsers),
  },
  /*
   * Розкладка залишку по обох колекціях, порахована тут і зараз.
   * `report.unmappedFieldStats` каже те саме лише про `newUsers` і лише після
   * першого `Apply` — а питання «що ще не переїхало» в адміна одне на дві
   * колекції, і ставить він його з першої ж хвилини.
   */
  remainderFieldStats: {
    users: buildUnmappedFieldStats(state.remainingUsers),
    newUsers: buildUnmappedFieldStats(state.workingNewUsers),
  },
  detailCap: MIGRATION_DETAIL_CAP,
});

/**
 * Залишок колекції — звіт, а не патч.
 *
 * Порожні анкети звідси прибрані — і ті, від яких лишився сам `userId`, теж:
 * анкета, з якої забрали все, — це успіх, і в списку «що не переїхало» їй
 * робити нічого. Значення секретів заміщені позначкою: побачити треба, що поле
 * лишилось, а не яке воно.
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
    if (!hasRemainingData(profile)) return;
    const copy = {};
    const fields = Object.keys(profile);
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
        // Скільки анкет звелись до порожньої оболонки. Без цього числа різниця
        // між «було 26 тисяч» і «лишилось 900» читалась би як втрата даних.
        identityOnlyRecordCount: countIdentityOnlyRecords(state.remainingUsers),
        remainingKeyCount: countRemainingKeys(state.remainingUsers),
        unmappedFieldStats: buildUnmappedFieldStats(state.remainingUsers),
      },
      newUsers: {
        sourceRecordCount: Object.keys(state.originalNewUsers).length,
        remainingRecordCount: Object.keys(newUsers).length,
        identityOnlyRecordCount: countIdentityOnlyRecords(state.workingNewUsers),
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

/**
 * Колекція без перенесених полів — те, що заливають назад у базу і що потім
 * можна знову завантажити в цей самий інструмент.
 *
 * Від звіту вона відрізняється двома речами: значення тут справжні (звіт
 * обрізає `attitude`, і залитий у базу він стер би людям дані), а шум
 * прибраний — і ключами, і цілими анкетами. Анкета, від якої лишився сам
 * `userId`, не картка; ключ із порожнім рядком не дані; кеш-мітки, розміри
 * екрана і мертві списки не переживають навіть одного кола міграції, а
 * тягнуться з файлу у файл і роблять залишок нечитабельним.
 *
 * Що саме прибрано — видно в `summary.droppedFields`: очищення тут не мовчазне.
 */
const isNoiseField = field => CLEANED_COLLECTION_NOISE_FIELDS.includes(field);

/**
 * Що з анкети переживає очищення.
 *
 * Права доступу лишаються завжди — це єдине їхнє місце (див.
 * `CLEANED_COLLECTION_PRESERVED_FIELDS`). Далі відсіюється шум за назвою і
 * порожнє за значенням: ключ, у якому лежить порожній рядок, порожній масив
 * або обʼєкт із самих порожніх рядків, не несе нічого — а в залишку саме такі
 * ключі й складають більшість.
 */
const cleanProfile = profile => {
  const cleaned = {};
  const dropped = [];

  Object.entries(profile).forEach(([field, value]) => {
    if (CLEANED_COLLECTION_PRESERVED_FIELDS.includes(field)) {
      cleaned[field] = deepClone(value);
      return;
    }
    if (isNoiseField(field) || !hasMeaningfulValue(value)) {
      dropped.push(field);
      return;
    }
    cleaned[field] = deepClone(value);
  });

  return { cleaned, dropped };
};

const buildCleanedCollection = collection => {
  const out = {};
  Object.entries(collection || {}).forEach(([profileId, profile]) => {
    if (!profile || typeof profile !== 'object') {
      if (profile !== undefined) out[profileId] = profile;
      return;
    }
    if (!hasRemainingData(profile)) return;
    const { cleaned } = cleanProfile(profile);
    // Анкета, від якої після очищення не лишилось жодного ключа, — це шум
    // цілим записом. У файл вона не їде: возити далі порожню оболонку так
    // само нема сенсу, як і оболонку з самого `userId`.
    if (!Object.keys(cleaned).length) return;
    out[profileId] = cleaned;
  });
  return out;
};

/**
 * Скільки ключів очищення прибрало і яких саме.
 *
 * Без цього рядка різниця між «поле поїхало у свій вузол» і «поле викинули як
 * шум» була б невидима: обидва зникають із файлу однаково. Тут же видно, що
 * саме зникло і скільки разів — і якщо в переліку раптом стоїть щось живе,
 * це помітно до заливання, а не після.
 */
const buildCleanedDropStats = collection => {
  const stats = {};
  Object.values(collection || {}).forEach(profile => {
    if (!profile || typeof profile !== 'object') return;
    if (!hasRemainingData(profile)) return;
    cleanProfile(profile).dropped.forEach(field => {
      stats[field] = (stats[field] || 0) + 1;
    });
  });
  return stats;
};

export const buildCleanedNewUsers = state => buildCleanedCollection(state.workingNewUsers);

/**
 * Те саме для `users` — але це не файл на імпорт.
 *
 * `/users` читає мобільний застосунок, і заливати в нього залишок не можна:
 * там лежать поля, які міграція свідомо не чіпає. Тут він потрібен для іншого
 * — щоб наступний прогін інструмента почався з того місця, де скінчився
 * попередній, а не з повного вихідного файлу.
 */
export const buildCleanedUsers = state => buildCleanedCollection(state.remainingUsers);

/**
 * Обидві колекції одним файлом — саме тим, який інструмент уміє прочитати
 * назад.
 *
 * Міграція не робиться за один захід: частину полів забирає конфлікт, частину
 * — рішення людини, і між заходами стан має десь жити. Живе він тут: файл
 * несе рівно те, що ще не переїхало, у справжніх значеннях, і завантажується
 * однією кнопкою замість двох окремих файлів.
 */
export const buildCleanedCollections = state => ({
  kind: CLEANED_COLLECTIONS_KIND,
  generatedAt: new Date().toISOString(),
  appliedGroups: [...state.appliedGroups],
  note: 'Залишок обох колекцій у справжніх значеннях. `newUsers` звідси можна залити в базу; `users` — ні, він тільки для повторного завантаження в інструмент.',
  summary: {
    users: {
      recordCount: Object.keys(state.remainingUsers).length,
      keptRecordCount: Object.keys(buildCleanedUsers(state)).length,
      keyCount: countRemainingKeys(state.remainingUsers),
      droppedFields: buildCleanedDropStats(state.remainingUsers),
    },
    newUsers: {
      recordCount: Object.keys(state.workingNewUsers).length,
      keptRecordCount: Object.keys(buildCleanedNewUsers(state)).length,
      keyCount: countRemainingKeys(state.workingNewUsers),
      droppedFields: buildCleanedDropStats(state.workingNewUsers),
    },
  },
  users: buildCleanedUsers(state),
  newUsers: buildCleanedNewUsers(state),
});

export const getMigrationTarget = (state, node) => deepClone(state.targets[node]);

export const getOwnerValuePatch = (state, field) => deepClone(state.targets.multiDataPatch[field]);

export const getGetInTouchPatch = state => getOwnerValuePatch(state, 'getInTouch');
