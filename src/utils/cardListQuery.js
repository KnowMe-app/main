/*
 * Запит «Списку» на `AddNewProfile`: картки, впорядковані за полем, у
 * діапазоні значень цього поля, — і, за бажанням, картки, де поля немає.
 *
 * Цим одним описом виражається все, що екран колись робив сімома режимами й
 * трьома окремими добірками: «Кому дзвонити» — це дата дзвінка до сьогодні,
 * від новіших; «Остання дія» — остання дія, від новіших; «Стрічка» — дата
 * публікації; «Обрані» — час вподобання. Нове поле — це рядок у переліку
 * нижче, а не ще один завантажувач.
 *
 * Поле тут — лише те, за яким база вміє сортувати сама: індекс у правилах
 * (`.indexOn`) або мапа власника, яку однаково читають цілком. Інакше
 * сторінка коштувала б обходу всіх анкет.
 */

import { MATCHING_CARD_ORDER_FIELD } from './matchingCardIndex';

export const CARD_LIST_FILTER = 'CARD_LIST';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOTTED_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

// «99» у даті дзвінка — не дата, а рішення: таку ставить дизлайк.
const NEVER_CALL_VALUES = new Set(['2099-99-99', '9999-99-99', '99.99.2099', '99.99.9999']);

const pad = value => String(value).padStart(2, '0');
const toIsoDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shiftDay = (now, days) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);

const isRealIsoDate = iso => {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/** Дата поля як `РРРР-ММ-ДД`; стара крапкова форма теж читається. */
export const readFieldDate = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (ISO_DATE.test(text)) return isRealIsoDate(text) ? text : null;
  const dotted = text.match(DOTTED_DATE);
  if (!dotted) return null;
  const iso = `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  return isRealIsoDate(iso) ? iso : null;
};

/** Мітка часу поля в мс; рядок із самих цифр — та сама мітка. */
export const readFieldTimestamp = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
};

const isNeverCall = value => typeof value === 'string' && NEVER_CALL_VALUES.has(value.trim());

/*
 * Поля, за якими гортається список. `source` каже адаптерам бази, як
 * прочитати впорядковану сторінку:
 *
 * - `ownerValue` — позначка читача під `multiData/{шлях}/{власник}/{картка}`
 *   з індексом `.value` (дата дзвінка);
 * - `ownerMap` — мапа читача без індексу (обрані, «не цікаві»): вона і є
 *   перелік, тож читається раз і сортується тут;
 * - `child` — поле вузла анкети з `.indexOn` у правилах;
 * - `key` — ключ картки в `matchingCards`.
 *
 * `profileKey` — під яким іменем значення лежить в анкеті: свіже значення з
 * потоку кладеться туди поверх кешованої анкети, щоб картка показувала те,
 * за чим її щойно відібрали. `hint` — що це за поле, словами адміна.
 */
export const CARD_LIST_FIELDS = Object.freeze([
  {
    key: 'getInTouch',
    label: 'Дата дзвінка',
    hint: 'ваша позначка «коли подзвонити»',
    type: 'date',
    source: { kind: 'ownerValue', path: 'multiData/getInTouch' },
    profileKey: 'getInTouch',
    missingLabel: 'без дати дзвінка',
    ranges: ['upToToday', 'afterToday', 'last7', 'last30', 'never', 'any'],
    defaultRange: 'upToToday',
    defaultDirection: 'desc',
  },
  {
    key: 'lastAction',
    label: 'Остання дія',
    hint: 'коли з анкетою востаннє щось робили',
    type: 'timestamp',
    source: { kind: 'child', path: 'profileWorkflow', child: 'lastAction' },
    profileKey: 'lastAction',
    missingLabel: 'без жодної дії',
    ranges: ['last7', 'last30', 'last365', 'any'],
    defaultRange: 'any',
    defaultDirection: 'desc',
  },
  {
    key: 'feedDate',
    label: 'Публікація',
    hint: 'дата в стрічці matching',
    type: 'date',
    // Те саме поле й ті самі межі, за якими гортає стрічка `/matching`
    // (`fetchMatchingCardsPage`: `startAt('')`, `endAt(сьогодні)`), тож
    // «до сьогодні» — це рівно стрічка, яку бачить читач.
    source: { kind: 'child', path: 'matchingCards', child: MATCHING_CARD_ORDER_FIELD },
    missingLabel: 'неопубліковані',
    ranges: ['upToToday', 'last7', 'last30', 'last365', 'any'],
    defaultRange: 'upToToday',
    defaultDirection: 'desc',
  },
  {
    key: 'favorite',
    label: 'Обрані',
    hint: 'коли ви вподобали',
    type: 'timestamp',
    source: { kind: 'ownerMap', map: 'favorites' },
    ranges: ['last7', 'last30', 'last365', 'any'],
    defaultRange: 'any',
    defaultDirection: 'desc',
  },
  {
    key: 'dislike',
    label: 'Не цікаві',
    hint: 'коли ви сказали «не цікаво»',
    type: 'timestamp',
    source: { kind: 'ownerMap', map: 'dislikes' },
    ranges: ['last7', 'last30', 'last365', 'any'],
    defaultRange: 'any',
    defaultDirection: 'desc',
  },
  {
    key: 'createdAt',
    label: 'Реєстрація',
    hint: 'коли зареєстрували акаунт',
    type: 'timestamp',
    source: { kind: 'child', path: 'profileTechnical', child: 'createdAt' },
    missingLabel: 'без дати реєстрації',
    ranges: ['last7', 'last30', 'last365', 'any'],
    defaultRange: 'any',
    defaultDirection: 'desc',
  },
  {
    key: 'lastLogin',
    label: 'Останній вхід',
    hint: 'день останнього входу власниці анкети',
    type: 'date',
    source: { kind: 'child', path: 'profileTechnical', child: 'lastLogin' },
    missingLabel: 'без жодного входу',
    ranges: ['last7', 'last30', 'last365', 'any'],
    defaultRange: 'any',
    defaultDirection: 'desc',
  },
  {
    key: 'lastCycle',
    label: 'Початок циклу',
    hint: 'перший день останнього циклу',
    type: 'date',
    source: { kind: 'child', path: 'profileWorkflow', child: 'lastCycle' },
    missingLabel: 'без дати циклу',
    ranges: ['last30', 'last365', 'any'],
    defaultRange: 'any',
    defaultDirection: 'desc',
  },
  {
    key: 'cardKey',
    label: 'Ключ картки',
    hint: 'усі картки за id — повний перелік',
    type: 'key',
    source: { kind: 'key', path: 'matchingCards' },
    ranges: ['any'],
    defaultRange: 'any',
    defaultDirection: 'asc',
  },
]);

const FIELDS_BY_KEY = new Map(CARD_LIST_FIELDS.map(field => [field.key, field]));

export const getCardListField = key => FIELDS_BY_KEY.get(key) || FIELDS_BY_KEY.get('getInTouch');

/** Чи можна взагалі показати картки, де цього поля немає. */
export const fieldHasMissing = field => Boolean(field?.missingLabel);

export const CARD_LIST_RANGES = Object.freeze({
  upToToday: { label: 'до сьогодні' },
  afterToday: { label: 'після сьогодні' },
  last7: { label: 'за 7 днів' },
  last30: { label: 'за 30 днів' },
  last365: { label: 'за рік' },
  never: { label: '«99» — не дзвонити' },
  any: { label: 'будь-коли' },
});

export const CARD_LIST_MISSING = Object.freeze([
  { key: 'exclude', label: 'не показувати' },
  { key: 'after', label: 'після решти' },
  { key: 'only', label: 'лише такі' },
]);

export const CARD_LIST_DIRECTIONS = Object.freeze([
  { key: 'desc', arrow: '↓' },
  { key: 'asc', arrow: '↑' },
]);

// Напрямок словами того, що впорядковано: «спершу нові» для дати дзвінка
// читалось би як «спершу щойно поставлені», а впорядковано тут дати.
const DIRECTION_LABELS = {
  date: { desc: 'спершу пізніші дати', asc: 'спершу ранніші дати' },
  timestamp: { desc: 'спершу свіжіші', asc: 'спершу давніші' },
  key: { desc: 'Я → А', asc: 'А → Я' },
};

export const describeCardListDirection = (fieldKey, direction) => {
  const field = getCardListField(fieldKey);
  return (DIRECTION_LABELS[field.type] || DIRECTION_LABELS.date)[direction === 'asc' ? 'asc' : 'desc'];
};

const isCustomRange = range => Boolean(range && typeof range === 'object'
  && (readFieldDate(range.from) || readFieldDate(range.to)));

const normalizeCustomRange = range => {
  const from = readFieldDate(range?.from);
  const to = readFieldDate(range?.to);
  if (from && to && from > to) return { from: to, to: from };
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
};

/**
 * Запит, з яким двигун може працювати: відоме поле, напрямок, діапазон із
 * дозволених для поля (або свої дати) і «без значення» лише там, де поле
 * його має.
 */
export const normalizeCardListQuery = raw => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const field = getCardListField(source.field);
  const direction = source.direction === 'asc' || source.direction === 'desc'
    ? source.direction
    : field.defaultDirection;
  let range = field.defaultRange;
  if (typeof source.range === 'string' && field.ranges.includes(source.range)) range = source.range;
  else if (field.type !== 'key' && isCustomRange(source.range)) range = normalizeCustomRange(source.range);
  const missing = fieldHasMissing(field) && ['after', 'only'].includes(source.missing) ? source.missing : 'exclude';
  return { field: field.key, direction, range, missing };
};

export const DEFAULT_CARD_LIST_QUERY = Object.freeze(normalizeCardListQuery({ field: 'getInTouch' }));

const startOfDayMs = isoDate => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
};
const endOfDayMs = isoDate => startOfDayMs(isoDate) + 24 * 60 * 60 * 1000 - 1;

const dateRangeBounds = (rangeKey, now) => {
  const today = toIsoDate(now);
  switch (rangeKey) {
    case 'upToToday': return { to: today };
    case 'afterToday': return { from: toIsoDate(shiftDay(now, 1)), to: '2099-12-31' };
    case 'last7': return { from: toIsoDate(shiftDay(now, -7)), to: today };
    case 'last30': return { from: toIsoDate(shiftDay(now, -30)), to: today };
    case 'last365': return { from: toIsoDate(shiftDay(now, -365)), to: today };
    default: return {};
  }
};

/**
 * Діапазон запиту в двох формах: межі для самої бази (`bounds` — у
 * значеннях поля: дата рядком, мітка часу числом) і перевірка кожного рядка
 * (`accepts`). Перевірка потрібна попри межі: рядковий діапазон бази
 * пропускає й нотатки («99», текст), і стару крапкову дату.
 */
export const resolveCardListRange = (rawQuery, now = new Date()) => {
  const query = normalizeCardListQuery(rawQuery);
  const field = getCardListField(query.field);

  if (field.type === 'key') return { bounds: {}, accepts: () => true };

  if (query.range === 'never') {
    return { bounds: { from: '2099-99-99', to: '9999-99-99' }, accepts: isNeverCall };
  }

  const dateBounds = typeof query.range === 'object'
    ? query.range
    : dateRangeBounds(query.range, now);

  if (field.type === 'date') {
    return {
      bounds: { ...dateBounds },
      accepts: value => {
        const date = readFieldDate(value);
        if (!date) return false;
        if (dateBounds.from && date < dateBounds.from) return false;
        if (dateBounds.to && date > dateBounds.to) return false;
        return true;
      },
    };
  }

  const bounds = {
    ...(dateBounds.from ? { from: startOfDayMs(dateBounds.from) } : {}),
    ...(dateBounds.to ? { to: endOfDayMs(dateBounds.to) } : {}),
  };
  return {
    bounds,
    accepts: value => {
      const timestamp = readFieldTimestamp(value);
      // Старі вподобання лежать `true` чи кодом анкети, без часу: у
      // «будь-коли» вони є (у кінці списку), у діапазоні часу — ні.
      if (timestamp === null) return field.source.kind === 'ownerMap' && Boolean(value) && !bounds.from && !bounds.to;
      if (bounds.from !== undefined && timestamp < bounds.from) return false;
      if (bounds.to !== undefined && timestamp > bounds.to) return false;
      return true;
    },
  };
};

/** Чи поля в картці немає: для дати — не дата (але «99» — це значення). */
export const isFieldValueMissing = (fieldKey, value) => {
  const field = getCardListField(fieldKey);
  if (field.type === 'date') return !readFieldDate(value) && !(field.key === 'getInTouch' && isNeverCall(value));
  if (field.type === 'timestamp') return readFieldTimestamp(value) === null && !value;
  return false;
};

/**
 * Чи лишається картка в списку, якщо поле запиту отримало таке значення.
 * Питають, коли адмін змінив значення просто в списку (наприклад, поставив
 * дату дзвінка на тиждень уперед у «Кому дзвонити»): картка, що вийшла з
 * запиту, згасає, і на її місце довантажується наступна.
 */
export const cardListKeepsValue = (rawQuery, fieldKey, value, now = new Date()) => {
  const query = normalizeCardListQuery(rawQuery);
  if (query.field !== fieldKey) return true;
  if (isFieldValueMissing(fieldKey, value)) return query.missing !== 'exclude';
  if (query.missing === 'only') return false;
  return resolveCardListRange(query, now).accepts(value);
};

const rangeKeyOf = range => (typeof range === 'object' ? `${range.from || ''}..${range.to || ''}` : range);

/**
 * Ключ складу списку — для кешу переліку й знімка «назад до списку». Два
 * запити з однаковим ключем дають ті самі картки в тому самому порядку.
 */
export const buildCardListQueryKey = rawQuery => {
  const query = normalizeCardListQuery(rawQuery);
  return [query.field, query.direction, rangeKeyOf(query.range), query.missing].join('|');
};

/*
 * Готові запити. Перші чотири стоять чіпами в панелі списку (`primary`), решта
 * — у шухляді «Сортування». Колишні режими (`legacyModes`) переводяться сюди ж,
 * коли знімок «назад до списку» збережено ще старою версією екрана.
 */
export const CARD_LIST_PRESETS = Object.freeze([
  {
    key: 'call',
    label: 'Кому дзвонити',
    primary: true,
    query: { field: 'getInTouch', direction: 'desc', range: 'upToToday', missing: 'exclude' },
    legacyModes: ['GITnew', 'GIT', 'SearchIdKeyOnly', 'offline', 'ofline'],
  },
  {
    key: 'activity',
    label: 'Остання дія',
    primary: true,
    query: { field: 'lastAction', direction: 'desc', range: 'any', missing: 'exclude' },
    legacyModes: ['LA', 'LA2'],
  },
  {
    key: 'feed',
    label: 'Стрічка',
    primary: true,
    query: { field: 'feedDate', direction: 'desc', range: 'upToToday', missing: 'exclude' },
    legacyFilters: ['FEED_DATE'],
  },
  {
    key: 'favorites',
    label: 'Обрані',
    primary: true,
    query: { field: 'favorite', direction: 'desc', range: 'any', missing: 'exclude' },
    legacyFilters: ['FAVORITE'],
  },
  {
    key: 'scheduled',
    label: 'Заплановані',
    query: { field: 'getInTouch', direction: 'asc', range: 'afterToday', missing: 'exclude' },
  },
  {
    key: 'callAndUndated',
    label: 'Кому дзвонити + без дати',
    query: { field: 'getInTouch', direction: 'desc', range: 'upToToday', missing: 'after' },
    legacyModes: ['NoGIT'],
  },
  {
    key: 'undated',
    label: 'Без дати дзвінка',
    query: { field: 'getInTouch', direction: 'desc', range: 'any', missing: 'only' },
  },
  {
    key: 'dislikes',
    label: 'Не цікаві',
    query: { field: 'dislike', direction: 'desc', range: 'any', missing: 'exclude' },
  },
  {
    key: 'registered',
    label: 'Нові анкети',
    query: { field: 'createdAt', direction: 'desc', range: 'any', missing: 'exclude' },
  },
  {
    key: 'logins',
    label: 'Останній вхід',
    query: { field: 'lastLogin', direction: 'desc', range: 'any', missing: 'exclude' },
  },
]);

export const CARD_LIST_PRIMARY_PRESETS = Object.freeze(CARD_LIST_PRESETS.filter(preset => preset.primary));

export const getCardListPreset = key => CARD_LIST_PRESETS.find(preset => preset.key === key) || null;

export const findCardListPreset = rawQuery => {
  const key = buildCardListQueryKey(rawQuery);
  return CARD_LIST_PRESETS.find(preset => buildCardListQueryKey(preset.query) === key) || null;
};

/** Підпис запиту словами — на кнопці шухляди й у лозі. */
export const describeCardListQuery = rawQuery => {
  const query = normalizeCardListQuery(rawQuery);
  const preset = findCardListPreset(query);
  if (preset) return preset.label;
  const field = getCardListField(query.field);
  const direction = CARD_LIST_DIRECTIONS.find(item => item.key === query.direction);
  const range = typeof query.range === 'object'
    ? [query.range.from ? `з ${query.range.from}` : '', query.range.to ? `до ${query.range.to}` : ''].filter(Boolean).join(' ')
    : CARD_LIST_RANGES[query.range]?.label || '';
  if (query.missing === 'only') return `${field.label}: ${field.missingLabel}`;
  const parts = [`${field.label} ${direction?.arrow || ''}`.trim()];
  if (field.type !== 'key' && query.range !== 'any') parts.push(range);
  if (query.missing === 'after') parts.push(`+ ${field.missingLabel}`);
  return parts.join(' · ');
};

/**
 * Запит зі знімка, збереженого старою версією екрана: режим сортування
 * (`loadSortMode`) або добірка (`FEED_DATE`, `FAVORITE`). Невідоме — `null`.
 */
export const queryFromLegacyListState = ({ loadSortMode, currentFilter } = {}) => {
  const preset = CARD_LIST_PRESETS.find(item => (
    (currentFilter && (item.legacyFilters || []).includes(currentFilter))
    || (loadSortMode && (item.legacyModes || []).includes(loadSortMode))
  ));
  return preset ? normalizeCardListQuery(preset.query) : null;
};
