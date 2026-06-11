export const FIELD_COUNT_RANGE_BUCKETS = ['le5', 'f6_10', 'f11_20', 'f20_plus'];

export const FIELD_COUNT_SEARCH_KEY_INDEX_NAME = 'fields';

const normalizeBucketValues = values => {
  if (!values) return [];
  if (Array.isArray(values)) return values;
  if (values instanceof Set) return [...values];
  return [values];
};

export const hasFieldCountRangeBuckets = values =>
  normalizeBucketValues(values).some(value => FIELD_COUNT_RANGE_BUCKETS.includes(String(value || '').trim()));

export const isFieldCountInRangeBucket = (countKey, rangeBucket) => {
  const parsedCount = Number.parseInt(String(countKey), 10);
  if (!Number.isInteger(parsedCount) || parsedCount < 0) return false;

  switch (rangeBucket) {
    case 'le5':
      return parsedCount <= 5;
    case 'f6_10':
      return parsedCount >= 6 && parsedCount <= 10;
    case 'f11_20':
      return parsedCount >= 11 && parsedCount <= 20;
    case 'f20_plus':
      return parsedCount > 20;
    default:
      return false;
  }
};

export const isFieldCountInSelectedRanges = (countKey, rangeBuckets = []) => {
  const selectedRangeBuckets = normalizeBucketValues(rangeBuckets)
    .map(value => String(value || '').trim())
    .filter(value => FIELD_COUNT_RANGE_BUCKETS.includes(value));

  return selectedRangeBuckets.some(rangeBucket => isFieldCountInRangeBucket(countKey, rangeBucket));
};

export const collectFieldCountIdsFromIndexNode = (fieldsIndexNode, rangeBuckets = []) => {
  const ids = new Set();
  if (!fieldsIndexNode || typeof fieldsIndexNode !== 'object' || Array.isArray(fieldsIndexNode)) return ids;

  Object.entries(fieldsIndexNode).forEach(([countKey, usersMap]) => {
    if (!isFieldCountInSelectedRanges(countKey, rangeBuckets)) return;
    Object.keys(usersMap || {}).forEach(userId => {
      if (userId) ids.add(userId);
    });
  });

  return ids;
};
