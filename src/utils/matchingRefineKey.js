import {
  toAgeCategory,
  toBloodGroupCategory,
  toCountryCategory,
} from './matchingDataProvider';

/**
 * Дофільтрація видачі — рівно один ключ, рівно одне значення.
 *
 * Це не друга шухляда фільтрів. Шухляда описує, кого показувати в деці, і
 * тримає одразу сім груп; тут же питання вужче й одноразове: «серед чотирьохсот
 * знайдених Анн — котра». На таке питання відповідає один розрізнювач, і
 * другий поруч із ним лише додає роботи пальцю.
 *
 * Головне обмеження — **жодного додаткового читання з бекенду**. Усі значення
 * беруться з полів, які вже лежать у проєкції `matchingCards` (`birth`, `city`,
 * `blood`, `country`), тож дофільтр рахується в памʼяті, а звужений набір
 * означає **менше** гідратації анкет, а не більше.
 *
 * Межі рахують ті самі функції, що й індексний план та пост-фільтр
 * (`toAgeCategory`, `toBloodGroupCategory`, `toCountryCategory` з
 * `matchingDataProvider`). Свою копію тут заводити не можна: саме розбіжність
 * на межі округлення й робить фільтр і індекс різними фільтрами.
 */

/** Категорія «значення не заповнене» — спільна для всіх ключів зі словником. */
export const REFINE_OTHER_BUCKET = 'other';

/**
 * Місто словника не має: його значення — це дані, а не перелік.
 *
 * Тому бакети для нього збираються з самої видачі, а не з константи, і саме
 * тому цей ключ живе лише в пошуку: у стрічці ключ мусить **називати
 * кандидатів** для індексу, а `searchKey` індексу `city` не має. Проріджувати
 * ним уже завантажене означало б показувати «Київ: 12» там, де в базі їх
 * триста.
 */
export const REFINE_CITY_LIMIT = 6;

const trimmed = value => String(value ?? '').trim();

const cityBucketOf = user => trimmed(user?.city) || REFINE_OTHER_BUCKET;

export const MATCHING_REFINE_KEYS = [
  {
    key: 'age',
    label: 'Вік',
    // Група шухляди, у яку пише той самий рядок у режимі стрічки.
    filterName: 'age',
    categorize: toAgeCategory,
    buckets: [
      { value: 'le25', label: '≤25' },
      { value: '26_30', label: '26–30' },
      { value: '31_33', label: '31–33' },
      { value: '34_36', label: '34–36' },
      { value: '37_plus', label: '37+' },
      { value: REFINE_OTHER_BUCKET, label: '?' },
    ],
  },
  {
    key: 'city',
    label: 'Місто',
    // Індексу немає — тож і кандидатів цей ключ назвати не може.
    filterName: null,
    categorize: cityBucketOf,
    buckets: null,
    otherLabel: 'Без міста',
  },
  {
    key: 'bloodGroup',
    label: 'Група крові',
    filterName: 'bloodGroup',
    categorize: toBloodGroupCategory,
    buckets: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: REFINE_OTHER_BUCKET, label: '?' },
    ],
  },
  {
    key: 'country',
    label: 'Країна',
    filterName: 'country',
    categorize: toCountryCategory,
    buckets: [
      { value: 'ua', label: 'Ukraine' },
      { value: 'other', label: 'Other' },
      { value: 'unknown', label: '?' },
    ],
  },
];

export const DEFAULT_REFINE_KEY = 'age';

/**
 * Скільки результатів робить дофільтр доречним.
 *
 * На десяти знайдених рядок лише забирає висоту: їх видно всі й так. Поріг
 * навмисно вищий за порцію відліку — інакше він зʼявлявся б і зникав, поки
 * читач гортає.
 */
export const REFINE_MIN_RESULTS = 24;

export const getRefineKeySpec = key =>
  MATCHING_REFINE_KEYS.find(spec => spec.key === key) || MATCHING_REFINE_KEYS[0];

/** Ключі, які має сенс пропонувати в стрічці: ті, що вміють назвати кандидатів. */
export const isRefineKeyAvailableInFeed = key => Boolean(getRefineKeySpec(key).filterName);

export const bucketOfUser = (key, user) => {
  const spec = getRefineKeySpec(key);
  const bucket = spec.categorize(user);
  return bucket === undefined || bucket === null || bucket === '' ? REFINE_OTHER_BUCKET : String(bucket);
};

/**
 * Значення ключа з їхніми числами — рівно те, що малює рядок.
 *
 * Число обовʼязкове: «31–33» саме по собі нічого не каже, а «31–33 · 74» каже
 * все — і чи варто тапати, і що буде після тапу.
 *
 * Ключ зі словником віддає всі свої значення, навіть нульові: чіп, що зникає
 * під пальцем, смикає рядок саме тоді, коли в нього цілять. Ключ без словника
 * (місто) віддає найчастіші значення видачі, бо перелічити всі міста — це вже
 * не рядок, а список.
 */
export const buildRefineOptions = (key, users = []) => {
  const spec = getRefineKeySpec(key);
  const list = Array.isArray(users) ? users : [];

  const counts = new Map();
  list.forEach(user => {
    const bucket = bucketOfUser(key, user);
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  });

  if (spec.buckets) {
    return spec.buckets.map(bucket => ({
      value: bucket.value,
      label: bucket.label,
      count: counts.get(bucket.value) || 0,
    }));
  }

  const named = [...counts.entries()]
    .filter(([value]) => value !== REFINE_OTHER_BUCKET)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, REFINE_CITY_LIMIT)
    .map(([value, count]) => ({ value, label: value, count }));

  const otherCount = counts.get(REFINE_OTHER_BUCKET) || 0;
  if (!otherCount) return named;
  return [...named, { value: REFINE_OTHER_BUCKET, label: spec.otherLabel || '?', count: otherCount }];
};

/** Звуження видачі — чистий фільтр по вже наявних картках. */
export const applyRefineSelection = (users = [], key, value) => {
  if (!value) return Array.isArray(users) ? users : [];
  return (Array.isArray(users) ? users : []).filter(user => bucketOfUser(key, user) === value);
};

/**
 * Стан групи шухляди для «лише це значення».
 *
 * Фільтри matching відніманні: група стартує з усім увімкненим, а читач гасить
 * зайве. Тож «лише 31–33» — це та сама група з однією увімкненою опцією, а не
 * новий вид стану. Саме тому рядок у стрічці нічого нового не читає: план
 * будує наявний `planSearchKeyBucketRead`, і виходить він найдешевшим —
 * `include`.
 *
 * Ключ без групи (місто) сюди не доходить: `isRefineKeyAvailableInFeed`
 * прибирає його з переліку ще до тапу.
 */
export const buildFeedFilterGroupForRefine = (key, value, currentGroup) => {
  const spec = getRefineKeySpec(key);
  if (!spec.filterName || !currentGroup || typeof currentGroup !== 'object') return null;
  const next = {};
  Object.keys(currentGroup).forEach(option => { next[option] = option === value; });
  // Значення, якого група не пропонує (місто чи новий бакет), не має вимикати
  // геть усе: це був би фільтр «нічого», а не уточнення.
  return Object.values(next).some(Boolean) ? next : null;
};
