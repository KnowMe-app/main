import { normalizePhoneValue } from '../components/inputValidations';
import { parseUkTriggerQuery } from './parseUkTrigger';
import { encodeKey } from './searchIndexCandidates';
import { getSearchIdPrefixes } from './searchKeyCheckboxFilters';
export const normalizeSearchIdInput = (searchKey, rawValue) => {
  const baseValue = String(rawValue || '').trim();
  if (!baseValue) return '';

  if (searchKey === 'phone') {
    return normalizePhoneValue(baseValue);
  }

  if (searchKey === 'telegram') {
    const parsedTrigger = parseUkTriggerQuery(baseValue);
    if (parsedTrigger?.searchPair?.telegram) {
      return parsedTrigger.searchPair.telegram;
    }
  }

  return baseValue.replace(/\s+/g, ' ');
};

const normalizePhoneSearchIdValue = rawValue => normalizePhoneValue(rawValue);

export const buildSearchIdCandidateKeys = (
  modifiedSearchValue,
  rawSearchValue,
  searchIdPrefixes,
  options = {},
) => {
  const normalizedValue = String(modifiedSearchValue || '').toLowerCase();
  if (!normalizedValue) return [];

  const {
    includeVariants = true,
    includeAdaptedPhoneVariant = false,
  } = options;
  const ukSmPrefix = encodeKey('УК СМ ').toLowerCase();
  const hasUkSm = normalizedValue.startsWith(ukSmPrefix);
  const prefixesToCheck = getSearchIdPrefixes(searchIdPrefixes);

  return prefixesToCheck.flatMap(prefix => {
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

export const makeSearchKeyValue = searchedValue => {
  const [searchKey, searchValue] = Object.entries(searchedValue)[0];
  const normalizedSearchValue = normalizeSearchIdInput(searchKey, searchValue);
  const modifiedSearchValue = encodeKey(normalizedSearchValue);
  const searchIdKey = `${searchKey}_${modifiedSearchValue.toLowerCase()}`;

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
