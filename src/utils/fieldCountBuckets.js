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

// Keys the app adds to a hydrated card (`__sourceCollection`, `__fromCardCache`)
// are not profile data. Excluding them keeps the count the index writes and the
// count the post-filter derives from a loaded card identical.
export const countProfileFields = profile => {
  if (!profile || typeof profile !== 'object') return 0;
  return Object.keys(profile).filter(key => !key.startsWith('__')).length;
};

export const resolveProfileFieldCountBucket = profile =>
  resolveFieldCountRangeBucket(countProfileFields(profile));

/** A card with almost nothing on record: the deck keeps these, but shows them last. */
export const isSparseProfile = profile =>
  resolveProfileFieldCountBucket(profile) === FIELD_COUNT_RANGE_BUCKETS[0];

// The index stores one of the four range buckets. Numeric keys are the legacy shape
// (one node per filled-field count) and are still recognised so a half-migrated
// index keeps answering while the rebuild runs.
export const resolveFieldCountRangeBucket = count => {
  const parsedCount = Number.parseInt(String(count), 10);
  if (!Number.isInteger(parsedCount) || parsedCount <= 5) return 'le5';
  if (parsedCount <= 10) return 'f6_10';
  if (parsedCount <= 20) return 'f11_20';
  return 'f20_plus';
};

export const isFieldCountInRangeBucket = (countKey, rangeBucket) => {
  const normalizedKey = String(countKey || '').trim();
  if (FIELD_COUNT_RANGE_BUCKETS.includes(normalizedKey)) return normalizedKey === rangeBucket;

  const parsedCount = Number.parseInt(normalizedKey, 10);
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
  if (!fieldsIndexNode || typeof fieldsIndexNode !== 'object') return ids;

  Object.entries(fieldsIndexNode).forEach(([countKey, usersMap]) => {
    if (!isFieldCountInSelectedRanges(countKey, rangeBuckets)) return;
    Object.keys(usersMap || {}).forEach(userId => {
      if (userId) ids.add(userId);
    });
  });

  return ids;
};
