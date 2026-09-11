import { normalizePhoneValue } from '../components/inputValidations';
import { parseUkTriggerQuery } from './parseUkTrigger';
import { encodeKey } from './searchIndexCandidates';


export const SEARCH_ID_INDEXED_FIELDS = new Set([
  'instagram',
  'ameblo',
  'facebook',
  'email',
  'phone',
  'telegram',
  'tiktok',
  'linkedin',
  'youtube',
  'twitter',
  'line',
  'otherLink',
  'other',
  'vk',
  'name',
  'surname',
]);

export const getSearchIdIndexedFields = () => [...SEARCH_ID_INDEXED_FIELDS];

export const isSearchIdIndexedField = field => SEARCH_ID_INDEXED_FIELDS.has(field);

export const getSearchIdPrefixes = searchIdPrefixes => {
  const fallback = getSearchIdIndexedFields();
  if (!Array.isArray(searchIdPrefixes)) {
    return fallback;
  }
  if (searchIdPrefixes.length === 0) {
    return [];
  }

  const normalizedPrefixes = searchIdPrefixes
    .map(prefix => (typeof prefix === 'string' ? prefix.trim() : ''))
    .filter(Boolean);

  return fallback.filter(prefix => normalizedPrefixes.includes(prefix));
};

const SOCIAL_SEARCH_KEYS = new Set([
  'telegram',
  'instagram',
  'ameblo',
  'facebook',
  'tiktok',
  'linkedin',
  'youtube',
  'twitter',
]);

const stripQueryHashAndSlashSuffix = value =>
  String(value || '')
    .split(/[?#]/)[0]
    .split('/')[0]
    .trim();

const normalizeLabeledContactValue = (baseValue, labelPattern) => {
  const labelMatch = baseValue.match(labelPattern);
  if (!labelMatch?.[1]) return null;
  return stripQueryHashAndSlashSuffix(labelMatch[1].replace(/^@/, ''));
};

const normalizeLinkedInValue = baseValue => {
  const urlMatch = baseValue.match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/i);
  if (urlMatch?.[1]) return stripQueryHashAndSlashSuffix(urlMatch[1]);

  return normalizeLabeledContactValue(
    baseValue,
    /(?:^|[^A-Za-z0-9_])(?:linkedin|linked\s*in|лінкедін|линкедин)\s*:?\s*@?([A-Za-z0-9._-]+)/i,
  );
};

const normalizeYoutubePath = (rawPath, preserveRoutePrefixes = true) => {
  const [pathBeforeQuery] = String(rawPath || '').split(/[?#]/);
  const pathSegments = pathBeforeQuery.split('/').filter(Boolean);

  if (!pathSegments.length) return '';

  const [firstSegment, secondSegment] = pathSegments;
  const lowerFirstSegment = firstSegment.toLowerCase();

  if (preserveRoutePrefixes && ['channel', 'c', 'user'].includes(lowerFirstSegment) && secondSegment) {
    return `${lowerFirstSegment}/${secondSegment.replace(/^@/, '')}`;
  }

  return firstSegment.replace(/^@/, '');
};

const normalizeYoutubeValue = baseValue => {
  const urlMatch = baseValue.match(/(?:https?:\/\/)?(?:m\.|www\.)?(?:(youtube\.com)\/|(?:youtu\.be)\/)([^\s]+)/i);
  if (urlMatch?.[2]) return normalizeYoutubePath(urlMatch[2], Boolean(urlMatch[1]));

  const labelMatch = baseValue.match(
    /(?:^|[^A-Za-z0-9_])(?:youtube|youtu\.?be|yt|ютуб)\s*:?\s*@?([A-Za-z0-9._-]+(?:\/(?:[A-Za-z0-9._-]+))?)/i,
  );
  if (labelMatch?.[1]) return normalizeYoutubePath(labelMatch[1]);

  return null;
};

const normalizeAmebloValue = baseValue => {
  const urlMatch = baseValue.match(/ameblo\.jp\/([^/?#\s]+)/i);
  if (urlMatch?.[1]) return stripQueryHashAndSlashSuffix(urlMatch[1].replace(/^@/, ''));

  return normalizeLabeledContactValue(
    baseValue,
    /(?:^|[^A-Za-z0-9_])(?:ameblo|амебло)(?:\s*:\s*|\s+)@?([A-Za-z0-9][A-Za-z0-9._-]*)/i,
  );
};

const normalizeSocialSearchValue = (searchKey, baseValue) => {
  const parsedTrigger = parseUkTriggerQuery(baseValue);
  if (parsedTrigger?.contactType === searchKey && parsedTrigger?.searchPair?.[searchKey]) {
    return parsedTrigger.searchPair[searchKey];
  }

  if (searchKey === 'linkedin') {
    return normalizeLinkedInValue(baseValue) || baseValue.replace(/\s+/g, ' ');
  }

  if (searchKey === 'youtube') {
    return normalizeYoutubeValue(baseValue) || baseValue.replace(/\s+/g, ' ');
  }

  if (searchKey === 'ameblo') {
    return normalizeAmebloValue(baseValue) || baseValue.replace(/\s+/g, ' ');
  }

  return baseValue.replace(/\s+/g, ' ');
};
export const normalizeSearchIdInput = (searchKey, rawValue) => {
  const baseValue = String(rawValue || '').trim();
  if (!baseValue) return '';

  if (searchKey === 'phone') {
    return normalizePhoneValue(baseValue);
  }

  if (SOCIAL_SEARCH_KEYS.has(searchKey)) {
    return normalizeSocialSearchValue(searchKey, baseValue);
  }

  return baseValue.replace(/\s+/g, ' ');
};

/**
 * Нормалізація набраного — на моменті введення, а не на кожному полі індексу.
 *
 * Ключ індексу тепер один на значення, тож питання «якою нормалізацією його
 * шукати» теж лишилось одне. Відповідає на нього `SearchBar`: він уже розбирає
 * набране парсерами і знає, що це телефон, посилання чи текст, і передає це
 * поле сюди (`searchIdDetectedField`). Раніше нормалізація вибиралась за
 * префіксом і тільки коли префікс був рівно один — тобто на звичайному пошуку
 * не вибиралась ніколи, і телефон, набраний із пробілами, не знаходився.
 */
export const normalizeExactSearchIdInput = (rawValue, searchIdPrefixes, searchIdDetectedField) => {
  const baseValue = String(rawValue || '').trim();
  if (!baseValue) return '';

  const fallbackValue = baseValue.replace(/\s+/g, ' ');

  if (isSearchIdIndexedField(searchIdDetectedField)) {
    return normalizeSearchIdInput(searchIdDetectedField, baseValue) || fallbackValue;
  }

  const normalizedPrefixes = getSearchIdPrefixes(searchIdPrefixes);
  if (normalizedPrefixes.length !== 1) {
    return fallbackValue;
  }

  const [onlyPrefix] = normalizedPrefixes;
  const normalizedValue = normalizeSearchIdInput(onlyPrefix, baseValue);
  return normalizedValue || fallbackValue;
};


export const formatLocalIsoDate = date => {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeSearchDateComparableValue = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const numericDate = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (numericDate) {
    const [, day, month, year] = numericDate;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const isoDate = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const timestamp = Number(raw);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    const millis = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return formatLocalIsoDate(date);
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return formatLocalIsoDate(date);

  return raw.replace(/\s+/g, ' ').toLowerCase();
};

const normalizePhoneSearchIdValue = rawValue => normalizePhoneValue(rawValue);

const UK_SM_KEY_PART = encodeKey('УК СМ ').toLowerCase();

/**
 * Кандидати — це варіанти **значення**, а не перебір полів.
 *
 * Поки ключ був `{поле}_{значення}`, цей перебір давав по ключу на кожне поле
 * індексу: текстовий запит коштував чотирнадцять точкових читань, з яких
 * влучало щонайбільше одне. Поле тепер лежить усередині значення, тож перебору
 * немає — лишились самі варіанти написання, і їх одиниці.
 *
 * Перший кандидат — точне набране (вже нормалізоване `makeSearchKeyValue` за
 * полем, яке розпізнав `SearchBar`). Решта — здогадки про написання, і читає їх
 * `collectUserIdsBySearchIdKeys` лише тоді, коли точне нічого не знайшло.
 */
export const buildSearchIdCandidateKeys = (modifiedSearchValue, rawSearchValue, options = {}) => {
  const normalizedValue = String(modifiedSearchValue || '').toLowerCase();
  if (!normalizedValue) return [];

  const {
    includeVariants = true,
    includeAdaptedPhoneVariant = false,
    // «УК СМ» — робоча приставка адміна, а не частина значення. Для всіх інших
    // запит із нею — звичайний текст: шукається рівно те, що набрали.
    includeUkSmVariant = false,
  } = options;

  const searchKeys = [normalizedValue];

  if (includeAdaptedPhoneVariant) {
    // Телефон, набраний у будь-якому написанні, шукається ще й у тій формі, у
    // якій його зберігає бекенд.
    const adaptedPhoneKey = encodeKey(normalizePhoneSearchIdValue(rawSearchValue)).toLowerCase();
    const rawPhoneKey = encodeKey(String(rawSearchValue || '').trim()).toLowerCase();
    searchKeys.push(adaptedPhoneKey, rawPhoneKey);
  }

  if (includeVariants) {
    if (includeUkSmVariant) {
      searchKeys.push(normalizedValue.startsWith(UK_SM_KEY_PART)
        ? normalizedValue.slice(UK_SM_KEY_PART.length)
        : `${UK_SM_KEY_PART}${normalizedValue}`);
    }

    if (normalizedValue.startsWith('0')) {
      searchKeys.push(`38${normalizedValue}`);
    }
    if (normalizedValue.startsWith('+')) {
      searchKeys.push(normalizedValue.slice(1));
    }
  }

  return [...new Set(searchKeys.filter(Boolean))];
};

/**
 * Дві черги: точне набране і здогадки про написання.
 *
 * Друга черга не викидається — вона читається, коли перша не знайшла нічого,
 * тож «не знайшов» коштує стільки ж, скільки коштував раніше, а влучний
 * пошук — одне читання.
 */
export const splitSearchIdCandidateKeys = (searchKeys, exactSearchKey = '') => {
  const uniqueKeys = [...new Set(searchKeys || [])].filter(Boolean);
  if (!uniqueKeys.length) return { primary: [], fallback: [] };

  const exactKey = String(exactSearchKey || '').toLowerCase() || uniqueKeys[0];
  const primary = uniqueKeys.filter(searchKey => searchKey === exactKey);
  const fallback = uniqueKeys.filter(searchKey => searchKey !== exactKey);

  // Точного серед кандидатів немає — ділити нема чого, інакше перша черга
  // лишиться порожньою.
  if (!primary.length) return { primary: fallback, fallback: [] };

  return { primary, fallback };
};

export const shouldSkipBroadFallbackForExactSearchId = searchKey => {
  if (searchKey !== 'searchId') return false;

  // `searchId` в UI — окремий режим пошуку.
  // Тому додаткові broad-fallback запити (по `users`, partial userId тощо)
  // не мають виконуватись, інакше можна отримати результати з інших полів
  // (наприклад, telegram), навіть якщо вибрано тільки instagram-префікс.
  return true;
};

/**
 * Ключ індексу — саме значення, а поле живе **у значенні**.
 *
 *   searchId/{значення}/{поле} = id | [id, ...]
 *
 * Довго ключ був `{поле}_{значення}`, і це коштувало по читанню на кожне поле:
 * пошук не знає, у якому полі лежить набране, тож питав усі шістнадцять —
 * чотирнадцять точкових читань на кожен текстовий запит, а для адміна ще й
 * стільки ж діапазонних сканів під частковий збіг. Форма запиту відсіювала
 * лише пошту й телефон.
 *
 * Тепер запит читає **один** ключ, а поле вибирається вже в прочитаному
 * значенні — тож звуження пошуку до поля (`searchIdPrefixes`), підпис «знайдено
 * за instagram» і діагностика лишаються, але коштують нуль запитів.
 *
 * Ціна злиття виміряна на експорті бази: з 77 394 різних значень лише 246
 * лежать більш ніж в одному полі, і 232 з них — це пара `name`/`surname`
 * (Олена-імʼя та Олена-прізвище). Видача від злиття не меншає ніколи —
 * обʼєднання завжди надмножина.
 */
export const SEARCH_ID_ROOT = 'searchId';

/** Ключ вузла `searchId` для значення поля: нормалізація поля + кодування. */
export const buildSearchIdValueKey = (field, rawValue) => {
  if (!isSearchIdIndexedField(field)) return '';
  const normalizedValue = normalizeSearchIdInput(field, rawValue);
  if (!normalizedValue) return '';
  return encodeKey(normalizedValue).toLowerCase();
};

/** Повний шлях до списку id одного поля. */
export const buildSearchIdEntryPath = (valueKey, field) =>
  (valueKey && field ? `${SEARCH_ID_ROOT}/${valueKey}/${field}` : '');

/**
 * Ключ заявки на унікальність (`multiData/profileIdentityClaims`).
 *
 * Він лишається у старій формі `{поле}_{значення}` навмисно: заявки живуть
 * своїм вузлом і своїм життям, і перейменування ключа означало б, що всі вже
 * подані заявки перестають упізнаватись — тобто дві чернетки з тим самим
 * телефоном знову змогли б існувати одночасно.
 */
export const buildSearchIdClaimKey = (field, valueKey) =>
  (field && valueKey ? `${field}_${valueKey}` : '');

const asIdList = value => {
  if (Array.isArray(value)) return value.flat(Infinity).filter(id => typeof id === 'string' && id);
  return typeof value === 'string' && value ? [value] : [];
};

/**
 * Розгорнути значення ключа в пари «id → поле, у якому збіглось».
 *
 * Рядок або масив замість обʼєкта — це запис у старій формі (ключ із
 * префіксом). Читати його теж треба: під час переходу обидві форми лежать
 * поруч, і мовчки губити знайдене — гірше, ніж віддати його без назви поля.
 */
export const readSearchIdEntryMatches = (entryValue, fields) => {
  const allowedFields = Array.isArray(fields) && fields.length ? new Set(fields) : null;

  if (entryValue && typeof entryValue === 'object' && !Array.isArray(entryValue)) {
    return Object.entries(entryValue)
      .filter(([field]) => !allowedFields || allowedFields.has(field))
      .flatMap(([field, value]) => asIdList(value).map(id => ({ id, field })));
  }

  return asIdList(entryValue).map(id => ({ id, field: '' }));
};

export const readSearchIdEntryIds = (entryValue, fields) => [
  ...new Set(readSearchIdEntryMatches(entryValue, fields).map(match => match.id)),
];

/** Додати id до значення поля, не чіпаючи вже наявні. */
export const appendSearchIdEntryId = (currentValue, userId) => {
  const ids = asIdList(currentValue);
  if (ids.includes(userId)) return ids.length === 1 ? ids[0] : ids;
  const nextIds = [...ids, userId];
  return nextIds.length === 1 ? nextIds[0] : nextIds;
};

/** Зняти id зі значення поля. `null` означає «поля більше немає». */
export const removeSearchIdEntryId = (currentValue, userId) => {
  const nextIds = asIdList(currentValue).filter(id => id !== userId);
  if (!nextIds.length) return null;
  return nextIds.length === 1 ? nextIds[0] : nextIds;
};

/** Поле й ключ для однієї пари «поле: значення». */
export const describeSearchIdRecord = searchedValue => {
  if (!searchedValue || typeof searchedValue !== 'object' || Array.isArray(searchedValue)) {
    return null;
  }

  const entries = Object.entries(searchedValue);
  if (entries.length !== 1) return null;

  const [[searchKey, searchValue]] = entries;
  if (!SEARCH_ID_INDEXED_FIELDS.has(searchKey)) return null;
  if (typeof searchValue !== 'string') return null;

  const valueKey = buildSearchIdValueKey(searchKey, searchValue);
  if (!valueKey) return null;

  return { field: searchKey, valueKey, path: buildSearchIdEntryPath(valueKey, searchKey) };
};

export const buildSearchIdRecordKey = searchedValue => describeSearchIdRecord(searchedValue)?.valueKey || null;

export const makeSearchKeyValue = (searchedValue, options = {}) => {
  const { searchIdPrefixes, searchIdDetectedField } = options;
  const [searchKey, searchValue] = Object.entries(searchedValue)[0];
  const normalizedSearchValue = searchKey === 'searchId'
    ? normalizeExactSearchIdInput(searchValue, searchIdPrefixes, searchIdDetectedField)
    : normalizeSearchIdInput(searchKey, searchValue);
  const modifiedSearchValue = encodeKey(normalizedSearchValue);
  // Поле потрібне разом із ключем: у новій формі індексу воно і є тим, куди
  // лягає id (`searchId/{значення}/{поле}`).
  const searchIdRecord = describeSearchIdRecord({ [searchKey]: searchValue });

  return {
    searchKey,
    searchValue: normalizedSearchValue,
    modifiedSearchValue,
    searchIdKey: searchIdRecord?.valueKey || null,
    searchIdField: searchIdRecord?.field || '',
  };
};

export const getEqualToCandidates = (searchKey, rawSearchValue) => {
  const trimmed = String(rawSearchValue || '').trim();
  if (!trimmed) return [];

  if (searchKey === 'phone') {
    const normalizedPhone = normalizeSearchIdInput('phone', trimmed);
    return [...new Set([normalizedPhone, trimmed].filter(Boolean))];
  }

  return [trimmed];
};
