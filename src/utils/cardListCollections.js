/*
 * «Що показати» на `AddNewProfile` — колекції карток і порядки в них.
 *
 * Двигун «Списку» питає чотири речі (`utils/cardListQuery`): поле, напрямок,
 * діапазон і що робити з картками без значення. Це мова бази, а не адміна, і
 * панель, що говорила нею, лишалась зрозумілою лише тому, хто її писав: ті
 * самі «Обрані» стояли чіпом, ще раз «готовим списком» і ще раз полем
 * «Сортувати за», а «Картки без дати дзвінка: після решти» було відповіддю на
 * питання, якого людина не ставила.
 *
 * Адмін питає інакше — **які картки** і **в якому порядку**. Тож тут ті самі
 * запити розкладено саме так: колекція (кожна рівно в одному місці, з
 * поясненням одним реченням), порядки, які мають сенс саме в ній, і період
 * за полем, яким вона впорядкована. Запит двигуна з цього збирає одна функція
 * (`buildCardListQueryFromSelection`), а назад — інша
 * (`resolveCardListSelection`): збережений колись запит (кеш, знімок «назад до
 * списку», старий режим) показується тією колекцією, якою він є.
 */

import { getCardListField, normalizeCardListQuery, readFieldDate } from './cardListQuery';

export const CARD_LIST_COLLECTION_GROUPS = Object.freeze([
  { key: 'calls', label: 'Дзвінки' },
  { key: 'reactions', label: 'Реакції' },
  { key: 'publication', label: 'Публікація' },
  { key: 'base', label: 'Уся база' },
]);

/*
 * Колекції «Списку». `primary` стоять чіпами на виду, решта — у «Ще».
 *
 * `orders` — порядки колекції: поле й напрямок двигуна плюс підпис словами
 * того, що впорядковано («спершу сьогоднішні», а не «↓»). `periodLabel` —
 * як зветься поле в рядку періоду: «Дата дзвінка: за 7 днів».
 *
 * `missing` — що робити з картками без значення: `only` — колекція й є такі
 * картки; `allWhenAny` — «Усі картки»: без періоду картки без значення йдуть
 * після решти, бо «усі» мусить означати всі; з періодом їх немає — вони не
 * потрапляють у жоден період. `withMissing` — галочка, якою адмін сам
 * дописує їх у кінець (колишній режим NoGIT).
 */
export const CARD_LIST_COLLECTIONS = Object.freeze([
  {
    key: 'call',
    label: 'Кому дзвонити',
    group: 'calls',
    primary: true,
    hint: 'Дата дзвінка вже настала — сьогодні або раніше.',
    orders: [
      { key: 'recent', label: 'Спершу сьогоднішні', field: 'getInTouch', direction: 'desc' },
      { key: 'oldest', label: 'Спершу найдавніші', field: 'getInTouch', direction: 'asc' },
    ],
    periodLabel: 'Дата дзвінка',
    periods: ['upToToday', 'last7', 'last30'],
    customPeriod: true,
    withMissing: 'Додати в кінець картки без дати дзвінка',
  },
  {
    key: 'scheduled',
    label: 'Заплановані',
    group: 'calls',
    hint: 'Дата дзвінка ще попереду.',
    orders: [
      { key: 'soonest', label: 'Спершу найближчі', field: 'getInTouch', direction: 'asc' },
      { key: 'latest', label: 'Спершу найпізніші', field: 'getInTouch', direction: 'desc' },
    ],
    periods: ['afterToday'],
  },
  {
    key: 'undated',
    label: 'Без дати дзвінка',
    group: 'calls',
    hint: 'Дати дзвінка ви ще не ставили.',
    orders: [{ key: 'id', label: 'За ID картки', field: 'getInTouch', direction: 'desc' }],
    periods: ['any'],
    missing: 'only',
  },
  {
    key: 'never',
    label: 'Не дзвонити',
    group: 'calls',
    hint: 'Позначені «99» — дзвонити не треба.',
    orders: [{ key: 'id', label: 'За ID картки', field: 'getInTouch', direction: 'desc' }],
    periods: ['never'],
  },
  {
    key: 'favorites',
    label: 'Обрані',
    group: 'reactions',
    primary: true,
    hint: 'Картки, які ви вподобали.',
    orders: [
      { key: 'recent', label: 'Нещодавно вподобані', field: 'favorite', direction: 'desc' },
      { key: 'oldest', label: 'Давно вподобані', field: 'favorite', direction: 'asc' },
    ],
    periodLabel: 'Вподобано',
    periods: ['any', 'last7', 'last30', 'last365'],
    customPeriod: true,
  },
  {
    key: 'dislikes',
    label: 'Не цікаві',
    group: 'reactions',
    hint: 'Картки, про які ви сказали «не цікаво».',
    orders: [
      { key: 'recent', label: 'Нещодавні', field: 'dislike', direction: 'desc' },
      { key: 'oldest', label: 'Давні', field: 'dislike', direction: 'asc' },
    ],
    periodLabel: 'Позначено',
    periods: ['any', 'last7', 'last30', 'last365'],
    customPeriod: true,
  },
  {
    key: 'feed',
    label: 'Стрічка',
    group: 'publication',
    primary: true,
    hint: 'Опубліковані анкети — те, що бачать читачі на matching.',
    orders: [
      { key: 'recent', label: 'Нові публікації', field: 'feedDate', direction: 'desc' },
      { key: 'oldest', label: 'Давні публікації', field: 'feedDate', direction: 'asc' },
    ],
    periodLabel: 'Опубліковано',
    periods: ['upToToday', 'last7', 'last30', 'last365'],
    customPeriod: true,
  },
  {
    key: 'unpublished',
    label: 'Неопубліковані',
    group: 'publication',
    hint: 'Анкети, яких у стрічці немає: ще не публікували або зняли.',
    orders: [{ key: 'id', label: 'За ID картки', field: 'feedDate', direction: 'desc' }],
    periods: ['any'],
    missing: 'only',
  },
  {
    key: 'all',
    label: 'Усі картки',
    group: 'base',
    primary: true,
    hint: 'Уся база, у порядку, який ви оберете.',
    orders: [
      { key: 'activity', label: 'Остання дія', field: 'lastAction', direction: 'desc', periodLabel: 'Остання дія' },
      { key: 'idle', label: 'Давно без дій', field: 'lastAction', direction: 'asc', periodLabel: 'Остання дія' },
      { key: 'registered', label: 'Нові акаунти', field: 'createdAt', direction: 'desc', periodLabel: 'Реєстрація' },
      { key: 'login', label: 'Останній вхід', field: 'lastLogin', direction: 'desc', periodLabel: 'Останній вхід' },
      { key: 'cycle', label: 'Початок циклу', field: 'lastCycle', direction: 'desc', periodLabel: 'Початок циклу' },
      { key: 'id', label: 'За ID картки', field: 'cardKey', direction: 'asc' },
    ],
    periods: ['any', 'last7', 'last30', 'last365'],
    customPeriod: true,
    missing: 'allWhenAny',
  },
]);

export const CARD_LIST_PERIOD_LABELS = Object.freeze({
  upToToday: 'До сьогодні',
  afterToday: 'Після сьогодні',
  last7: 'За 7 днів',
  last30: 'За 30 днів',
  last365: 'За рік',
  any: 'Будь-коли',
  never: '«99»',
});

const COLLECTIONS_BY_KEY = new Map(CARD_LIST_COLLECTIONS.map(collection => [collection.key, collection]));

export const DEFAULT_CARD_LIST_COLLECTION = 'call';

export const getCardListCollection = key => COLLECTIONS_BY_KEY.get(key) || COLLECTIONS_BY_KEY.get(DEFAULT_CARD_LIST_COLLECTION);

export const CARD_LIST_PRIMARY_COLLECTIONS = Object.freeze(CARD_LIST_COLLECTIONS.filter(collection => collection.primary));
export const CARD_LIST_MORE_COLLECTIONS = Object.freeze(CARD_LIST_COLLECTIONS.filter(collection => !collection.primary));

export const getCardListOrder = (collection, orderKey) => (
  collection.orders.find(order => order.key === orderKey) || collection.orders[0]
);

// Поле, яким колекція впорядкована, має період лише тоді, коли воно — дата чи
// час: ключ картки періоду не має.
export const orderHasPeriod = order => order.field !== 'cardKey';

/**
 * Періоди колекції за цим порядком — лише ті, які вміє поле порядку: у «Усіх
 * картках» поле міняється разом із порядком, а «за 7 днів» для початку циклу
 * двигун не приймає.
 */
export const listCardListPeriods = (collection, order) => {
  if (!orderHasPeriod(order)) return [];
  const fieldRanges = getCardListField(order.field).ranges;
  return collection.periods.filter(period => fieldRanges.includes(period));
};

/** Чи є з чого обирати період у цій колекції за цим порядком. */
export const collectionOffersPeriod = (collection, order) => orderHasPeriod(order)
  && (listCardListPeriods(collection, order).length > 1 || Boolean(collection.customPeriod));

export const describeCardListPeriodField = (collection, order) => order.periodLabel || collection.periodLabel || '';

const isCustomPeriod = period => Boolean(period && typeof period === 'object'
  && (readFieldDate(period.from) || readFieldDate(period.to)));

const resolvePeriod = (collection, order, period) => {
  if (!orderHasPeriod(order)) return 'any';
  const periods = listCardListPeriods(collection, order);
  if (typeof period === 'string' && periods.includes(period)) return period;
  if (collection.customPeriod && isCustomPeriod(period)) return period;
  return periods[0] || 'any';
};

/**
 * Запит двигуна з вибору адміна. Порядок, якого в колекції немає, стає першим
 * порядком колекції, а період — першим її періодом: колекція не може
 * опинитись у стані, якого її панель не показує.
 */
export const buildCardListQueryFromSelection = ({ collection: collectionKey, order: orderKey, period, withMissing } = {}) => {
  const collection = getCardListCollection(collectionKey);
  const order = getCardListOrder(collection, orderKey);
  const range = resolvePeriod(collection, order, period);
  let missing = 'exclude';
  if (collection.missing === 'only') missing = 'only';
  else if (collection.missing === 'allWhenAny') missing = range === 'any' ? 'after' : 'exclude';
  else if (collection.withMissing && withMissing) missing = 'after';
  return normalizeCardListQuery({ field: order.field, direction: order.direction, range, missing });
};

const resolveCollectionKeyForQuery = query => {
  switch (query.field) {
    case 'getInTouch':
      if (query.range === 'never') return 'never';
      if (query.missing === 'only') return 'undated';
      if (query.range === 'afterToday') return 'scheduled';
      return 'call';
    case 'favorite': return 'favorites';
    case 'dislike': return 'dislikes';
    case 'feedDate': return query.missing === 'only' ? 'unpublished' : 'feed';
    default: return 'all';
  }
};

/**
 * Вибір, яким є збережений запит: колекція, порядок, період, галочка «без
 * значення». Запит, зібраний колись у старій шухляді «Сортування» поза
 * колекціями (скажімо, «Останній вхід» від давніших), стає найближчим
 * вибором — тим самим полем у його колекції.
 */
export const resolveCardListSelection = rawQuery => {
  const query = normalizeCardListQuery(rawQuery);
  const collection = getCardListCollection(resolveCollectionKeyForQuery(query));
  const order = collection.orders.find(item => item.field === query.field && item.direction === query.direction)
    || collection.orders.find(item => item.field === query.field)
    || collection.orders[0];
  return {
    collection: collection.key,
    order: order.key,
    period: resolvePeriod(collection, order, query.range),
    withMissing: Boolean(collection.withMissing) && query.missing === 'after',
  };
};

/** Запит, яким панель його показує: старий запит поза колекціями — найближчим. */
export const canonicalizeCardListQuery = rawQuery => buildCardListQueryFromSelection(resolveCardListSelection(rawQuery));

const formatDotted = iso => {
  const date = readFieldDate(iso);
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
};

export const describeCardListPeriod = period => {
  if (period && typeof period === 'object') {
    return [period.from ? `з ${formatDotted(period.from)}` : '', period.to ? `по ${formatDotted(period.to)}` : '']
      .filter(Boolean)
      .join(' ');
  }
  return CARD_LIST_PERIOD_LABELS[period] || '';
};

/**
 * Список словами — для порожнього стану й підказок: «Обрані · Давно
 * вподобані · за 30 днів». Порядок і період називаються лише тоді, коли в
 * колекції було з чого обирати.
 */
export const describeCardListSelection = rawSelection => {
  const collection = getCardListCollection(rawSelection?.collection);
  const order = getCardListOrder(collection, rawSelection?.order);
  const parts = [collection.label];
  if (collection.orders.length > 1) parts.push(order.label);
  const period = resolvePeriod(collection, order, rawSelection?.period);
  if (collectionOffersPeriod(collection, order) && period !== listCardListPeriods(collection, order)[0]) {
    parts.push(describeCardListPeriod(period).toLowerCase());
  }
  if (collection.withMissing && rawSelection?.withMissing) parts.push('+ без дати');
  return parts.join(' · ');
};
