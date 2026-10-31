import { classifyGetInTouchMark } from './reactionCategory';

/*
 * Що показує «Список» на `AddNewProfile` — одним описом, а не режимом.
 *
 * Тут стояли сім режимів сортування радіокнопками (GIT, GITnew, NoGIT,
 * «NoGIT + індекс», LA, LA2, «З JSON-файлів»), і кожен був окремим
 * завантажувачем зі своїм набором конструкцій: звідки брати кандидатів, чи
 * ховати майбутні дзвінки, чи відсівати індексом до читання анкет, чи брати
 * анкету з кешу, як гортати. Перемикались вони цілком, тож узяти «кому
 * дзвонити» разом з «без дати» чи вимкнути індекс, не втративши кешу, не
 * виходило ніяк — і два з них (GITnew та «NoGIT + індекс») давно ходили в ту
 * саму функцію бекенду, відрізняючись лише обгортками.
 *
 * Тепер двигун один (`utils/cardListEngine`), а план — це галочки:
 *
 * - **що показати** — стани позначки `getInTouch` (`classifyGetInTouchMark`):
 *   кому дзвонити, заплановані, без дати, «не дзвонити»; список складається з
 *   них у цьому порядку, кожна картка — один раз;
 * - **порядок** — за датою дзвінка (кожен стан своїм запитом) або за
 *   останньою дією (один потік `profileWorkflow`, стани — фільтром);
 * - **як вантажити** — відсів індексом `searchKey`, кеш браузера, наступна
 *   сторінка наперед, перелік з JSON-файлів.
 *
 * Фільтри панелі («Фільтри») — не частина плану: вони звужують будь-який план
 * однаково.
 */

export const CARD_LIST_FILTER = 'CARD_LIST';

export const CARD_LIST_SEGMENTS = Object.freeze([
  {
    key: 'due',
    label: 'Кому дзвонити',
    hint: 'дата дзвінка сьогодні й раніше — від сьогодні назад',
  },
  {
    key: 'future',
    label: 'Заплановані',
    hint: 'дата дзвінка після сьогодні — від найближчої',
  },
  {
    key: 'undated',
    label: 'Без дати',
    hint: 'позначки немає або вона не дата — за ключем картки',
  },
  {
    key: 'never',
    label: 'Не дзвонити',
    hint: '«99» — таку дату ставить дизлайк',
  },
]);

export const CARD_LIST_SEGMENT_KEYS = Object.freeze(CARD_LIST_SEGMENTS.map(segment => segment.key));

export const CARD_LIST_OPTIONS = Object.freeze([
  {
    key: 'byLastAction',
    group: 'order',
    label: 'За останньою дією',
    hint: 'увесь список — від найсвіжішої дії; галочки вище лишаються фільтром, '
      + 'картки без жодної дії сюди не потрапляють',
  },
  {
    key: 'indexPrefilter',
    group: 'load',
    label: 'Відсів індексом',
    hint: 'фільтри, які знає searchKey, перевіряються до читання анкети — '
      + 'для анкет, яких немає в кеші',
  },
  {
    key: 'cacheFirst',
    group: 'load',
    label: 'Кеш браузера',
    hint: 'анкети й сам перелік, показані за останні 6 год, з бази вдруге не читаються; '
      + 'повторне натискання «Список» перечитує перелік',
  },
  {
    key: 'prefetch',
    group: 'load',
    label: 'Наступна сторінка наперед',
    hint: 'вантажиться у фоні, поки ви дивитесь поточну',
  },
  {
    key: 'fromFiles',
    group: 'source',
    label: 'Перелік з JSON-файлів',
    hint: 'кандидати й фільтри — з обраних файлів вузлів, без обходу бази; '
      + 'позначки й анкети — з бази',
  },
]);

export const CARD_LIST_OPTION_KEYS = Object.freeze(CARD_LIST_OPTIONS.map(option => option.key));

export const DEFAULT_CARD_LIST_PLAN = Object.freeze({
  segments: Object.freeze({ due: true, future: false, undated: false, never: false }),
  byLastAction: false,
  indexPrefilter: true,
  cacheFirst: true,
  prefetch: true,
  fromFiles: false,
});

const ALL_SEGMENTS = Object.freeze({ due: true, future: true, undated: true, never: true });

/*
 * Швидкий вибір — колишні режими як набори галочок. Пресет ставить лише те,
 * що визначає *які* картки і *в якому* порядку; як їх вантажити (індекс,
 * кеш, наперед, файли) лишається таким, як його виставив адмін.
 */
export const CARD_LIST_PRESETS = Object.freeze([
  {
    key: 'call',
    label: 'Кому дзвонити',
    legacyModes: ['GITnew', 'GIT', 'SearchIdKeyOnly'],
    plan: { segments: { due: true, future: false, undated: false, never: false }, byLastAction: false },
  },
  {
    key: 'notScheduled',
    label: 'Усі, крім запланованих',
    legacyModes: ['NoGIT'],
    plan: { segments: { due: true, future: false, undated: true, never: false }, byLastAction: false },
  },
  {
    key: 'activity',
    label: 'Остання дія',
    legacyModes: ['LA', 'LA2'],
    plan: { segments: ALL_SEGMENTS, byLastAction: true },
  },
]);

const toBoolean = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/**
 * План, з яким двигун може працювати: усі ключі на місці, булеві, і хоча б
 * один стан позначки обраний. Порожній набір станів — це не «показати все», а
 * «не показати нічого», і такий список коштував би повного обходу джерел
 * заради порожнього екрана; тому він повертається до умовчання.
 */
export const normalizeCardListPlan = raw => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawSegments = source.segments && typeof source.segments === 'object' ? source.segments : {};
  const segments = CARD_LIST_SEGMENT_KEYS.reduce((acc, key) => {
    acc[key] = toBoolean(rawSegments[key], DEFAULT_CARD_LIST_PLAN.segments[key]);
    return acc;
  }, {});
  const hasSegment = CARD_LIST_SEGMENT_KEYS.some(key => segments[key]);

  return CARD_LIST_OPTION_KEYS.reduce((plan, key) => {
    plan[key] = toBoolean(source[key], DEFAULT_CARD_LIST_PLAN[key]);
    return plan;
  }, { segments: hasSegment ? segments : { ...DEFAULT_CARD_LIST_PLAN.segments } });
};

export const listCardListSegments = plan => (
  CARD_LIST_SEGMENT_KEYS.filter(key => normalizeCardListPlan(plan).segments[key])
);

export const hasAllCardListSegments = plan => (
  listCardListSegments(plan).length === CARD_LIST_SEGMENT_KEYS.length
);

/** Чи належить картка з такою позначкою до списку за цим планом. */
export const planAcceptsGetInTouch = (plan, getInTouch) => (
  Boolean(normalizeCardListPlan(plan).segments[classifyGetInTouchMark(getInTouch)])
);

/**
 * Ключ результату: стани, порядок і джерело. Як саме вантажити (індекс, кеш,
 * наперед) на склад списку не впливає, тож у ключ не йде — інакше вимкнений
 * на хвилину кеш скидав би вже зібраний перелік.
 */
export const buildCardListPlanKey = plan => {
  const normalized = normalizeCardListPlan(plan);
  return [
    listCardListSegments(normalized).join('+'),
    normalized.byLastAction ? 'lastAction' : 'getInTouch',
    normalized.fromFiles ? 'files' : 'db',
  ].join('|');
};

const sameSegments = (left, right) => CARD_LIST_SEGMENT_KEYS.every(key => Boolean(left?.[key]) === Boolean(right?.[key]));

export const findCardListPreset = plan => {
  const normalized = normalizeCardListPlan(plan);
  return CARD_LIST_PRESETS.find(preset => (
    sameSegments(preset.plan.segments, normalized.segments)
    && Boolean(preset.plan.byLastAction) === normalized.byLastAction
  )) || null;
};

export const applyCardListPreset = (plan, presetKey) => {
  const preset = CARD_LIST_PRESETS.find(item => item.key === presetKey);
  const normalized = normalizeCardListPlan(plan);
  if (!preset) return normalized;
  return normalizeCardListPlan({
    ...normalized,
    segments: { ...preset.plan.segments },
    byLastAction: Boolean(preset.plan.byLastAction),
  });
};

/** Підпис на кнопці шухляди: що зараз у списку, словами. */
export const describeCardListPlan = plan => {
  const normalized = normalizeCardListPlan(plan);
  const preset = findCardListPreset(normalized);
  const base = preset
    ? preset.label
    : [
      CARD_LIST_SEGMENTS
        .filter(segment => normalized.segments[segment.key])
        .map(segment => segment.label)
        .join(' + '),
      normalized.byLastAction ? 'за останньою дією' : '',
    ].filter(Boolean).join(' · ');
  return normalized.fromFiles ? `${base} · JSON` : base;
};

/*
 * Колишні режими → план. Потрібно для того, що вже лежить у браузері:
 * знімок попереднього списку (`addNewProfilePreviousListState`) зберігав
 * `loadSortMode`, і «назад до списку» після оновлення застосунку мусить
 * відкрити той самий список, а не умовчання.
 */
const LEGACY_LOAD_SORT_MODE_PLANS = {
  GITnew: 'call',
  GIT: 'call',
  SearchIdKeyOnly: 'call',
  NoGIT: 'notScheduled',
  LA: 'activity',
  LA2: 'activity',
};

export const planFromLegacyLoadSortMode = (mode, basePlan = DEFAULT_CARD_LIST_PLAN) => {
  const normalizedMode = String(mode || '').trim();
  if (normalizedMode === 'offline' || normalizedMode === 'ofline') {
    return normalizeCardListPlan({ ...applyCardListPreset(basePlan, 'call'), fromFiles: true });
  }
  const presetKey = LEGACY_LOAD_SORT_MODE_PLANS[normalizedMode];
  if (!presetKey) return null;
  return normalizeCardListPlan({ ...applyCardListPreset(basePlan, presetKey), fromFiles: false });
};

/*
 * Нижня межа `lastAction` з фільтра панелі «LA». Коли список іде за
 * останньою дією, «за 7 днів» — це не фільтр після читання, а межа самого
 * запиту: потік закінчується там, де закінчуються сім днів, і далі база не
 * питається взагалі. «Порожньо» й «невідомий формат» у межу не вкладаються
 * (таких карток у впорядкованому запиті немає), тож з ними межі немає.
 */
const LAST_ACTION_FILTER_DAYS = {
  today: 0,
  yesterday: 1,
  last3days: 3,
  last7days: 7,
  last14days: 14,
  last30days: 30,
};

export const resolveLastActionLowerBound = (lastActionFilters, now = new Date()) => {
  if (!lastActionFilters || typeof lastActionFilters !== 'object') return null;
  const values = Object.values(lastActionFilters);
  const hasExplicitSelection = values.some(value => value === false) && values.some(value => value === true);
  if (!hasExplicitSelection) return null;
  if (lastActionFilters.no || lastActionFilters.empty || lastActionFilters['?']) return null;

  const selectedDays = Object.entries(LAST_ACTION_FILTER_DAYS)
    .filter(([key]) => lastActionFilters[key])
    .map(([, days]) => days);
  if (!selectedDays.length) return null;

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - Math.max(...selectedDays));
  return start.getTime();
};
