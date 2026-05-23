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
  if (!Array.isArray(searchIdPrefixes) || searchIdPrefixes.length === 0) {
    return fallback;
  }

  const normalizedPrefixes = searchIdPrefixes
    .map(prefix => (typeof prefix === 'string' ? prefix.trim() : ''))
    .filter(Boolean);

  const allowedPrefixes = fallback.filter(prefix => normalizedPrefixes.includes(prefix));
  return allowedPrefixes.length > 0 ? allowedPrefixes : fallback;
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
    /(?:^|[^A-Za-z0-9_])(?:ameblo|амебло)\s*:?\s*@?([A-Za-z0-9._-]+)/i,
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

export const normalizeExactSearchIdInput = (rawValue, searchIdPrefixes) => {
  const baseValue = String(rawValue || '').trim();
  if (!baseValue) return '';

  const normalizedPrefixes = getSearchIdPrefixes(searchIdPrefixes);
  if (normalizedPrefixes.length !== 1) {
    return baseValue.replace(/\s+/g, ' ');
  }

  const [onlyPrefix] = normalizedPrefixes;
  const normalizedValue = normalizeSearchIdInput(onlyPrefix, baseValue);
  return normalizedValue || baseValue.replace(/\s+/g, ' ');
};

const normalizePhoneSearchIdValue = rawValue => normalizePhoneValue(rawValue);

export const buildSearchIdCandidateKeys = (
  modifiedSearchValue,
  rawSearchValue,
  searchIdPrefixes,
  options = {},
) => {
  const normalizedValue = String(modifiedSearchValue || '').toLowerCase();
  const rawValue = String(rawSearchValue || '').trim();
  if (!normalizedValue) return [];

  const {
    includeVariants = true,
    includeAdaptedPhoneVariant = false,
  } = options;
  const ukSmPrefix = encodeKey('УК СМ ').toLowerCase();
  const hasUkSm = normalizedValue.startsWith(ukSmPrefix);
  const prefixesToCheck = getSearchIdPrefixes(searchIdPrefixes);

  return prefixesToCheck.flatMap(prefix => {
    if (prefix === 'phone') {
      const hasPhoneLabel = /(?:^|\b)(?:phone|телефон|тел|номер|моб)\b/i.test(rawValue);
      const hasLetters = /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(rawValue);
      const digitsOnly = rawValue.replace(/\D/g, '');
      const isShortNumericFragment = digitsOnly.length > 0 && digitsOnly.length < 4;

      if ((hasLetters && !hasPhoneLabel) || isShortNumericFragment) {
        return [];
      }
    }

    if (prefix === 'phone' && includeAdaptedPhoneVariant) {
      const adaptedPhoneValue = normalizePhoneSearchIdValue(rawSearchValue);
      const adaptedPhoneKey = encodeKey(adaptedPhoneValue).toLowerCase();
      const rawPhoneKey = encodeKey(String(rawSearchValue || '').trim()).toLowerCase();
      const valuesToCheck = [...new Set([adaptedPhoneKey, rawPhoneKey].filter(Boolean))];
      return valuesToCheck.map(value => `${prefix}_${value}`);
    }

    const searchKeys = [`${prefix}_${normalizedValue}`];

    if (!includeVariants) {
      return searchKeys;
    }

    if (hasUkSm) {
      searchKeys.push(`${prefix}_${normalizedValue.slice(ukSmPrefix.length)}`);
    } else {
      searchKeys.push(`${prefix}_${ukSmPrefix}${normalizedValue}`);
    }

    if (normalizedValue.startsWith('0')) {
      searchKeys.push(`${prefix}_38${normalizedValue}`);
    }
    if (normalizedValue.startsWith('+')) {
      searchKeys.push(`${prefix}_${normalizedValue.slice(1)}`);
    }

    return searchKeys;
  });
};

export const shouldSkipBroadFallbackForExactSearchId = searchKey => {
  if (searchKey !== 'searchId') return false;

  // `searchId` в UI — окремий режим пошуку.
  // Тому додаткові broad-fallback запити (по users/newUsers, partial userId тощо)
  // не мають виконуватись, інакше можна отримати результати з інших полів
  // (наприклад, telegram), навіть якщо вибрано тільки instagram-префікс.
  return true;
};

export const buildSearchIdRecordKey = searchedValue => {
  if (!searchedValue || typeof searchedValue !== 'object' || Array.isArray(searchedValue)) {
    return null;
  }

  const entries = Object.entries(searchedValue);
  if (entries.length !== 1) return null;

  const [[searchKey, searchValue]] = entries;
  if (!SEARCH_ID_INDEXED_FIELDS.has(searchKey)) return null;
  if (typeof searchValue !== 'string') return null;

  const normalizedSearchValue = normalizeSearchIdInput(searchKey, searchValue);
  if (!normalizedSearchValue) return null;

  return `${searchKey}_${encodeKey(normalizedSearchValue).toLowerCase()}`;
};

export const makeSearchKeyValue = (searchedValue, options = {}) => {
  const { searchIdPrefixes } = options;
  const [searchKey, searchValue] = Object.entries(searchedValue)[0];
  const normalizedSearchValue = searchKey === 'searchId'
    ? normalizeExactSearchIdInput(searchValue, searchIdPrefixes)
    : normalizeSearchIdInput(searchKey, searchValue);
  const modifiedSearchValue = encodeKey(normalizedSearchValue);
  const searchIdKey = buildSearchIdRecordKey({ [searchKey]: searchValue });

  return {
    searchKey,
    searchValue: normalizedSearchValue,
    modifiedSearchValue,
    searchIdKey,
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
