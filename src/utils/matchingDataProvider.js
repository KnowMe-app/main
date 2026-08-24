import { get, limitToFirst, orderByKey, query, ref } from 'firebase/database';
import { collectAgeIdsByFilters, database } from 'components/config';
import { getCard, getIndexIdsByQuery, MATCHING_INDEX_CACHE_VERSION, serializeQueryFilters, setIndexIdsForQuery } from './cardIndex';
import { collectFilteredMatchingSourceCards } from './matchingSourceBackfill';
import { getIndexedNewUsersIdsByRules, normalizeSearchKeySetKeys } from './newUsersFilterSetsIndex';
import {
  FIELD_COUNT_SEARCH_KEY_INDEX_NAME,
  collectFieldCountIdsFromIndexNode,
  hasFieldCountRangeBuckets,
  isSparseProfile,
} from './fieldCountBuckets';
import { getCachedSearchKeyPayload } from './searchKeyCache';
import { MATCHING_PERFORMANCE_CACHE_TTL_MS } from './cacheConstants';
import {
  BLOOD_SEARCH_KEY_BUCKETS,
  BMI_SEARCH_KEY_BUCKETS,
  CONTACT_SEARCH_KEY_BUCKETS,
  COUNTRY_SEARCH_KEY_BUCKETS,
  CSECTION_SEARCH_KEY_BUCKETS,
  FIELD_COUNT_SEARCH_KEY_BUCKETS,
  IMT_BUCKET_FILTER_KEYS,
  IMT_SEARCH_KEY_BUCKETS,
  MARITAL_STATUS_BUCKET_FILTER_KEYS,
  MARITAL_STATUS_SEARCH_KEY_BUCKETS,
  ROLE_BUCKET_FILTER_KEYS,
  ROLE_SEARCH_KEY_BUCKETS,
  USER_ID_SEARCH_KEY_BUCKETS,
  canSearchKeyPlanNameCandidates,
  isBucketSelectedByFilterGroup,
  planSearchKeyBucketRead,
  resolveBmiBucket,
  resolveCountryBucket,
  selectSearchKeyBuckets,
} from './searchKeyBuckets';

export const MATCHING_INDEX_ROOT = 'searchKey';
export const MATCHING_USERS_INDEX_ROOT = `${MATCHING_INDEX_ROOT}/users`;

const BLOOD_BUCKETS = BLOOD_SEARCH_KEY_BUCKETS;
const ROLE_BUCKETS = ROLE_SEARCH_KEY_BUCKETS;
const CSECTION_BUCKETS = CSECTION_SEARCH_KEY_BUCKETS;
const IMT_BUCKETS = IMT_SEARCH_KEY_BUCKETS;
const CONTACT_BUCKETS = CONTACT_SEARCH_KEY_BUCKETS;
const USER_ID_BUCKETS = USER_ID_SEARCH_KEY_BUCKETS;
const FIELD_COUNT_BUCKETS = FIELD_COUNT_SEARCH_KEY_BUCKETS;
const AGE_BUCKETS_BY_MATCHING_KEY = {
  le21: ['le21'],
  le25: ['le21', '22_25'],
  '22_25': ['22_25'],
  '26_30': ['26_30'],
  '31_33': ['31_35'],
  '34_36': ['31_35', '36_38'],
  '36_38': ['36_38'],
  '37_plus': ['36_38', '39_41', '42_plus'],
  '37_42': ['36_38', '39_41', '42_plus'],
  '39_41': ['39_41'],
  '42_plus': ['42_plus'],
  '43_plus': ['42_plus'],
  other: ['?'],
  empty: ['no'],
  no: ['no'],
  '?': ['?'],
};

const hasActiveFilterGroup = group =>
  Boolean(group && typeof group === 'object' && Object.values(group).some(value => value === false));

const selectedFilterKeys = group => {
  if (!hasActiveFilterGroup(group)) return [];
  return Object.entries(group)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
};

const hasFilterOption = (group, option) =>
  Boolean(group && typeof group === 'object' && Object.prototype.hasOwnProperty.call(group, option));

const shouldIncludeNoBucket = (group, noOption = 'empty') =>
  !hasFilterOption(group, noOption) || Boolean(group?.[noOption]);

const getFilterGroupDebugState = (groupName, group) => {
  const normalizedGroup = group && typeof group === 'object' ? group : {};
  const entries = Object.entries(normalizedGroup);
  const selectedValues = entries.filter(([, enabled]) => Boolean(enabled)).map(([key]) => key);
  const allSelected = entries.length > 0 && entries.every(([, enabled]) => Boolean(enabled));
  const groupActive = hasActiveFilterGroup(normalizedGroup);
  return {
    groupName,
    selectedValues,
    allSelected,
    groupActive,
  };
};

const unique = values => [...new Set((values || []).filter(Boolean))];

const normalizeBucketFilterKey = (bucket, bucketMap = {}) => bucketMap[bucket] || bucket;

// The drawer only renders a checkbox for some of the buckets an index holds, so a
// missing option defers to the group's "?" and never removes cards on its own.
// See utils/searchKeyBuckets.js for why.
const buildAllowedBucketsFromFilterGroup = (group, allBuckets = [], bucketMap = {}) =>
  selectSearchKeyBuckets(group, allBuckets, { bucketMap });

const mapSelectedFilterBuckets = (group, bucketMap = {}) =>
  selectedFilterKeys(group).map(key => bucketMap[key] || key);

const addGroup = (groups, indexName, values, debug = {}) => {
  const normalizedValues = unique(values.map(value => String(value || '').trim()).filter(Boolean));
  if (!indexName || normalizedValues.length === 0) return;
  const { allBuckets, ...groupDebug } = debug;
  // How the group reaches Firebase: name the selected buckets, subtract the rejected
  // ones, or query a key range. See planSearchKeyBucketRead — `no` is not stored, so
  // a selection that keeps the unfilled cards can only be read as a subtraction.
  const readPlan = planSearchKeyBucketRead({
    indexName,
    allBuckets: allBuckets || normalizedValues,
    selectedBuckets: normalizedValues,
  });
  groups.push({
    indexName,
    values: normalizedValues,
    allBuckets: (allBuckets || normalizedValues).map(String),
    readMode: readPlan.mode,
    readBuckets: readPlan.buckets,
    canInvertRead: Boolean(readPlan.canInvert),
    includeBuckets: readPlan.includeBuckets,
    ...groupDebug,
  });
};

const buildExcludeBucketMeta = ({ group, allBuckets = [], bucketMap = {}, allowedBuckets = [] } = {}) => {
  if (!hasActiveFilterGroup(group)) return {};
  const normalizedAllowed = new Set((allowedBuckets || []).map(String));
  const excludedValues = (allBuckets || [])
    .map(String)
    .filter(bucket => !normalizedAllowed.has(bucket) && group?.[normalizeBucketFilterKey(bucket, bucketMap)] === false);

  if (!excludedValues.length || !normalizedAllowed.size) return {};

  return {
    excludedValues,
    indexStrategy: excludedValues.length < normalizedAllowed.size ? 'exclude-buckets' : 'include-buckets',
  };
};

const buildRoleBuckets = (filters, collectionSource) => {
  const roleFilters = filters?.userRole || filters?.role;
  const buckets = buildAllowedBucketsFromFilterGroup(roleFilters, ROLE_BUCKETS, ROLE_BUCKET_FILTER_KEYS);
  if (!buckets.length) return [];

  // Matching treats additional newUsers without a role as donor profiles, so keep
  // the indexed provider aligned with the existing post-filter fallback.
  if (
    collectionSource === 'newUsers' &&
    Boolean(roleFilters?.ed) &&
    shouldIncludeNoBucket(roleFilters, 'empty')
  ) buckets.push('no');

  return unique(buckets);
};

// Blood is one index but two drawer groups, so a bucket carries a key for each.
// `1` means the group is on record without an Rh, `+`/`-` the other way round, and
// `no`/`?` mean nothing usable is on record — the same categories the hydrated-card
// post-filter derives in toBloodGroupCategory/toRhCategory.
const getBloodMeta = bucket => {
  const normalized = String(bucket || '').trim().toLowerCase();
  if (/^[1-4][+-]$/.test(normalized)) return { bloodGroup: normalized[0], rh: normalized[1] };
  if (/^[1-4]$/.test(normalized)) return { bloodGroup: normalized, rh: 'empty' };
  if (normalized === '+' || normalized === '-') return { bloodGroup: 'other', rh: normalized };
  if (normalized === 'no') return { bloodGroup: 'empty', rh: 'empty' };
  return { bloodGroup: 'other', rh: 'other' };
};

const buildBloodBuckets = filters => {
  const bloodGroupActive = hasActiveFilterGroup(filters?.bloodGroup);
  const rhActive = hasActiveFilterGroup(filters?.rh);
  if (!bloodGroupActive && !rhActive) return [];

  return BLOOD_BUCKETS.filter(bucket => {
    const meta = getBloodMeta(bucket);
    const bloodAllowed = bloodGroupActive
      ? isBucketSelectedByFilterGroup(filters?.bloodGroup, meta.bloodGroup)
      : true;
    const rhAllowed = rhActive ? isBucketSelectedByFilterGroup(filters?.rh, meta.rh) : true;
    return bloodAllowed && rhAllowed;
  });
};

const MARITAL_STATUS_BUCKETS = MARITAL_STATUS_SEARCH_KEY_BUCKETS;
const MARITAL_STATUS_BUCKET_MAP = MARITAL_STATUS_BUCKET_FILTER_KEYS;
const buildMaritalStatusBuckets = filters => buildAllowedBucketsFromFilterGroup(
  filters?.maritalStatus,
  MARITAL_STATUS_BUCKETS,
  MARITAL_STATUS_BUCKET_MAP
);

const buildAgeBuckets = filters => {
  const selected = selectedFilterKeys(filters?.age);
  if (!selected.length) return [];
  return selected.flatMap(key => AGE_BUCKETS_BY_MATCHING_KEY[key] || []);
};

const buildPointBuckets = (filters, filterName, bucketMap = {}) =>
  mapSelectedFilterBuckets(filters?.[filterName], bucketMap);

export const buildMatchingIndexFilterGroups = ({ filters = {}, collectionSource = 'users' } = {}) => {
  const groups = [];
  const roleBuckets = buildRoleBuckets(filters, collectionSource);
  const roleFilters = filters?.userRole || filters?.role;
  addGroup(
    groups,
    'role',
    roleBuckets,
    {
      source: 'searchKey/users',
      allBuckets: ROLE_BUCKETS,
      ...getFilterGroupDebugState('userRole', roleFilters),
      ...buildExcludeBucketMeta({ group: roleFilters, allBuckets: ROLE_BUCKETS, bucketMap: ROLE_BUCKET_FILTER_KEYS, allowedBuckets: roleBuckets }),
    }
  );
  const maritalStatusBuckets = buildMaritalStatusBuckets(filters);
  addGroup(
    groups,
    'maritalStatus',
    maritalStatusBuckets,
    {
      source: 'searchKey/users',
      allBuckets: MARITAL_STATUS_BUCKETS,
      ...getFilterGroupDebugState('maritalStatus', filters?.maritalStatus),
      ...buildExcludeBucketMeta({ group: filters?.maritalStatus, allBuckets: MARITAL_STATUS_BUCKETS, bucketMap: MARITAL_STATUS_BUCKET_MAP, allowedBuckets: maritalStatusBuckets }),
    }
  );
  const bloodBuckets = buildBloodBuckets(filters);
  addGroup(
    groups,
    'blood',
    bloodBuckets,
    {
      source: 'searchKey/users',
      allBuckets: BLOOD_BUCKETS,
      ...getFilterGroupDebugState('bloodGroup+rh', {
        ...(filters?.bloodGroup || {}),
        ...(filters?.rh ? Object.fromEntries(Object.entries(filters.rh).map(([key, value]) => [`rh:${key}`, value])) : {}),
      }),
      excludedValues: BLOOD_BUCKETS.filter(bucket => !bloodBuckets.includes(bucket)),
      indexStrategy: BLOOD_BUCKETS.filter(bucket => !bloodBuckets.includes(bucket)).length < bloodBuckets.length ? 'exclude-buckets' : 'include-buckets',
    }
  );
  addGroup(
    groups,
    'age',
    buildAgeBuckets(filters),
    {
      source: 'searchKey/users',
      ...getFilterGroupDebugState('age', filters?.age),
    }
  );
  const csectionBuckets = CSECTION_BUCKETS.filter(bucket => buildPointBuckets(filters, 'csection').includes(bucket));
  addGroup(
    groups,
    'csection',
    csectionBuckets,
    {
      source: 'searchKey/users',
      allBuckets: CSECTION_BUCKETS,
      ...getFilterGroupDebugState('csection', filters?.csection),
      ...buildExcludeBucketMeta({ group: filters?.csection, allBuckets: CSECTION_BUCKETS, allowedBuckets: csectionBuckets }),
    }
  );
  const contactBuckets = CONTACT_BUCKETS.filter(bucket => buildPointBuckets(filters, 'contact').includes(bucket));
  addGroup(
    groups,
    'contact',
    contactBuckets,
    {
      source: 'searchKey/users',
      allBuckets: CONTACT_BUCKETS,
      ...getFilterGroupDebugState('contact', filters?.contact),
      ...buildExcludeBucketMeta({ group: filters?.contact, allBuckets: CONTACT_BUCKETS, allowedBuckets: contactBuckets }),
    }
  );
  const userIdBuckets = USER_ID_BUCKETS.filter(bucket => buildPointBuckets(filters, 'userId').includes(bucket));
  addGroup(
    groups,
    'userId',
    userIdBuckets,
    {
      source: 'searchKey/users',
      allBuckets: USER_ID_BUCKETS,
      ...getFilterGroupDebugState('userId', filters?.userId),
      ...buildExcludeBucketMeta({ group: filters?.userId, allBuckets: USER_ID_BUCKETS, allowedBuckets: userIdBuckets }),
    }
  );
  const fieldBuckets = FIELD_COUNT_BUCKETS.filter(bucket => buildPointBuckets(filters, 'fields').includes(bucket));
  addGroup(
    groups,
    'fields',
    fieldBuckets,
    {
      source: 'searchKey/users',
      allBuckets: FIELD_COUNT_BUCKETS,
      ...getFilterGroupDebugState('fields', filters?.fields),
      ...buildExcludeBucketMeta({ group: filters?.fields, allBuckets: FIELD_COUNT_BUCKETS, allowedBuckets: fieldBuckets }),
    }
  );

  const bmiBuckets = selectSearchKeyBuckets(filters?.bmi, BMI_SEARCH_KEY_BUCKETS);
  addGroup(
    groups,
    'bmi',
    bmiBuckets,
    {
      source: 'searchKey/users',
      allBuckets: BMI_SEARCH_KEY_BUCKETS,
      ...getFilterGroupDebugState('bmi', filters?.bmi),
    }
  );
  const countryBuckets = selectSearchKeyBuckets(filters?.country, COUNTRY_SEARCH_KEY_BUCKETS);
  addGroup(
    groups,
    'country',
    countryBuckets,
    {
      source: 'searchKey/users',
      allBuckets: COUNTRY_SEARCH_KEY_BUCKETS,
      ...getFilterGroupDebugState('country', filters?.country),
    }
  );

  if (collectionSource !== 'newUsers') {
    const imtBuckets = IMT_BUCKETS.filter(bucket => buildPointBuckets(filters, 'imt', { other: '?' }).includes(bucket));
    addGroup(
      groups,
      'imt',
      imtBuckets,
      {
        source: 'searchKey/users',
        allBuckets: IMT_BUCKETS,
        ...getFilterGroupDebugState('imt', filters?.imt),
        ...buildExcludeBucketMeta({ group: filters?.imt, allBuckets: IMT_BUCKETS, bucketMap: IMT_BUCKET_FILTER_KEYS, allowedBuckets: imtBuckets }),
      }
    );
  }

  return groups;
};

const collectIdsFromValue = value => {
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).filter(Boolean);
};

/**
 * Скільки id з одного бакета варто тягнути, перш ніж визнати групу неселективною.
 *
 * Індекс відповідає на «які id підходять» так: качає всі id усіх обраних бакетів
 * і перетинає їх у браузері. Вартість — від розміру бакетів, а не від розміру
 * сторінки, тож на великій базі фільтр «заміжня» означав мегабайти id заради
 * пʼяти карток. Але група, що лишає пів бази, індексу нічого й не дає: перетин
 * від неї майже не звужується. Дешевше визнати її неселективною і лишити
 * пост-фільтру, який усе одно проходить по кожній показаній картці.
 *
 * Число: із запасом більше за будь-яку сторінку, менше за стелю кеша
 * (`MATCHING_QUERY_MAX_IDS`), тож перетин прочитаних множин у неї завжди влазить.
 */
export const MATCHING_SEARCH_KEY_BUCKET_READ_CAP = 1500;

/**
 * Читає вузол бакета з межею.
 *
 * `limitToFirst(CAP + 1)` дає одразу обидві відповіді одним запитом: якщо
 * повернулось CAP або менше — це весь бакет, і читати повторно нема чого; якщо
 * CAP + 1 — бакет завідомо більший за межу, і решту качати не треба.
 */
const readBucketNodeIds = async path => {
  // Кешується під ключем, що містить межу: зміна межі має знецінити старі
  // записи, бо в них лежить зріз іншого розміру, а не весь вузол.
  const cacheKey = `${path}#cap${MATCHING_SEARCH_KEY_BUCKET_READ_CAP}`;
  const payload = await getCachedSearchKeyPayload(cacheKey, async () => {
    const snapshot = await get(query(ref(database, path), orderByKey(), limitToFirst(MATCHING_SEARCH_KEY_BUCKET_READ_CAP + 1)));
    return { exists: snapshot.exists(), value: snapshot.exists() ? snapshot.val() || {} : null };
  }, { ttlMs: MATCHING_PERFORMANCE_CACHE_TTL_MS });

  const ids = payload?.exists ? collectIdsFromValue(payload.value) : [];
  return { ids, overflowed: ids.length > MATCHING_SEARCH_KEY_BUCKET_READ_CAP };
};

// `{ ids, overflowed }`: `overflowed` означає «група не звужує пошук настільки,
// щоб її читання окупилось», і викликач прибирає її з індексного плану.
const readBucketIds = async ({ rootPath, indexName, values }) => {
  if (indexName === FIELD_COUNT_SEARCH_KEY_INDEX_NAME && hasFieldCountRangeBuckets(values)) {
    // The rebuilt index stores the four range buckets, so the ranges asked for can be
    // read one node at a time. A legacy index stores one node per filled-field count
    // and has to be scanned whole; fall back to that only when no range node exists.
    const rangeReads = await Promise.all(
      values.map(value => readBucketNodeIds(`${rootPath}/${indexName}/${value}`)),
    );
    if (rangeReads.some(read => read.ids.length)) {
      const rangeIds = new Set();
      rangeReads.forEach(read => read.ids.forEach(id => rangeIds.add(id)));
      return { ids: rangeIds, overflowed: rangeReads.some(read => read.overflowed) || rangeIds.size > MATCHING_SEARCH_KEY_BUCKET_READ_CAP };
    }

    // Легасі-вузол `fields` — один лист на кожне число заповнених полів, тож
    // порахувати його можна тільки цілим. Межа тут застосовується постфактум:
    // читання вже сталось, але план і список кандидатів лишаються обмеженими.
    const snapshot = await get(ref(database, `${rootPath}/${indexName}`));
    const legacyIds = snapshot.exists()
      ? collectFieldCountIdsFromIndexNode(snapshot.val(), values)
      : new Set();
    return { ids: legacyIds, overflowed: legacyIds.size > MATCHING_SEARCH_KEY_BUCKET_READ_CAP };
  }

  const ids = new Set();
  const reads = await Promise.all(values.map(value => readBucketNodeIds(`${rootPath}/${indexName}/${value}`)));
  reads.forEach(read => read.ids.forEach(id => ids.add(id)));
  return {
    ids,
    overflowed: reads.some(read => read.overflowed) || ids.size > MATCHING_SEARCH_KEY_BUCKET_READ_CAP,
  };
};

// Can this group produce a candidate list on its own? 'include' names buckets and
// 'range' queries birth dates; 'exclude' and 'defer' can only reject. Knowing this
// up front lets a plan made purely of rejections skip its reads entirely.
const canGroupNameCandidates = group => canSearchKeyPlanNameCandidates(group?.readMode || 'include');

const invertOneGroupToNameCandidates = groups => {
  const invertible = groups
    .filter(group => group?.canInvertRead && group.includeBuckets?.length)
    .sort((a, b) => a.includeBuckets.length - b.includeBuckets.length)[0];
  if (!invertible) return groups;

  return groups.map(group => (
    group === invertible
      ? { ...group, readMode: 'include', readBuckets: group.includeBuckets }
      : group
  ));
};

// A group read resolves to { mode, ids }: 'include' narrows the candidates down to
// `ids`, 'exclude' only says which ids to drop. `null` means the group puts no
// restriction on the index at all.
const readMatchingUsersFilterIds = async ({ group, filters }) => {
  const readMode = group?.readMode || 'include';
  if (readMode === 'none' || readMode === 'defer') return null;

  if (readMode === 'range') {
    // searchKey/users/age is stored by backend birth-date keys (d_YYYY-MM-DD),
    // while matching UI/frontend still uses buckets such as le21/22_25/26_30.
    // Reuse the shared date-range reader so wide age filters page through the
    // real backend date index instead of looking for non-existent bucket nodes.
    if (group?.indexName !== 'age') return null;
    const ageIds = await collectAgeIdsByFilters(filters?.age, [MATCHING_USERS_INDEX_ROOT], {
      includeUnofferedBuckets: true,
    });
    if (!(ageIds instanceof Set)) return null;
    // Діапазонне читання обмежити наперед не вийшло б: `limitToFirst` різав би
    // кількість вузлів-дат, а не id, тобто тихо викидав би цілі роки народження.
    // Тому межа перевіряється постфактум — читання вже сталось, але план і
    // список кандидатів лишаються обмеженими.
    return { mode: 'include', ids: ageIds, overflowed: ageIds.size > MATCHING_SEARCH_KEY_BUCKET_READ_CAP };
  }

  const buckets = group?.readBuckets || [];
  if (!buckets.length) return null;

  const { ids, overflowed } = await readBucketIds({
    rootPath: MATCHING_USERS_INDEX_ROOT,
    indexName: group.indexName,
    values: buckets,
  });

  return { mode: readMode === 'exclude' ? 'exclude' : 'include', ids, overflowed };
};

// The least-filled bucket of the field-count index. A card with nothing on record
// is in no other index at all, so this is the one place it can be recognised
// without hydrating it.
export const SPARSE_CARD_FIELD_BUCKET = FIELD_COUNT_SEARCH_KEY_BUCKETS[0];

/**
 * Keep the near-empty cards, but put them at the end.
 *
 * They must not drop out of the deck - a reader who has not switched off "?" asked
 * to see cards with nothing on record, and losing them silently is the failure this
 * whole index rework is about. They are also not what anyone is scrolling for, so
 * they sort behind everything that has data, once, over the whole candidate list
 * rather than per page, so pagination inherits the order.
 *
 * One bucket read, cached like every other searchKey read.
 */
const orderSparseCardsLast = async (ids, rootPath) => {
  if (!Array.isArray(ids) || ids.length < 2) return ids;

  const path = `${rootPath}/${FIELD_COUNT_SEARCH_KEY_INDEX_NAME}/${SPARSE_CARD_FIELD_BUCKET}`;
  let sparseIds = null;
  try {
    const payload = await getCachedSearchKeyPayload(path, async () => {
      const snapshot = await get(ref(database, path));
      return { exists: snapshot.exists(), value: snapshot.exists() ? snapshot.val() || {} : null };
    });
    sparseIds = payload?.exists ? new Set(Object.keys(payload.value || {})) : null;
  } catch (error) {
    // Ordering is a nicety; never fail a page over it.
    console.warn('[Matching][indexedProvider] could not read the sparse-card bucket', { path, error });
    return ids;
  }

  if (!sparseIds?.size) return ids;

  const withData = [];
  const nearlyEmpty = [];
  ids.forEach(id => (sparseIds.has(id) ? nearlyEmpty : withData).push(id));
  return nearlyEmpty.length ? [...withData, ...nearlyEmpty] : ids;
};

const intersectIdSets = sets => {
  const usableSets = (sets || []).filter(set => set instanceof Set);
  if (!usableSets.length) return null;
  if (usableSets.some(set => set.size === 0)) return [];

  const [smallest, ...rest] = [...usableSets].sort((a, b) => a.size - b.size);
  return [...smallest]
    .filter(id => rest.every(set => set.has(id)))
    .sort((a, b) => a.localeCompare(b));
};

/**
 * Fold the per-group reads into one candidate list.
 *
 * Exclusions can only be subtracted from something, so a plan made purely of them
 * returns null: the caller then pages the deck itself and lets the hydrated-card
 * post-filter do the rejecting, which is what the exclusion would have cost anyway.
 */
const combineFilterGroupIds = results => {
  const includeSets = (results || [])
    .filter(result => result?.mode === 'include' && result.ids instanceof Set)
    .map(result => result.ids);
  const excludeSets = (results || [])
    .filter(result => result?.mode === 'exclude' && result.ids instanceof Set)
    .map(result => result.ids);

  const baseIds = intersectIdSets(includeSets);
  if (!baseIds) return null;
  if (!excludeSets.length) return baseIds;

  return baseIds.filter(id => !excludeSets.some(set => set.has(id)));
};

const normalizeSignatureValue = value => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeSignatureValue).sort();
  return Object.keys(value).sort().reduce((acc, key) => {
    const normalized = normalizeSignatureValue(value[key]);
    if (normalized !== undefined) acc[key] = normalized;
    return acc;
  }, {});
};

const buildRawRulesSignature = rawRules => String(rawRules || '').trim();


const buildMatchingIndexCacheMeta = ({ filterSignature = '', collectionSource = 'users', ownerId = '', accessUserId = '' } = {}) => ({
  filterSignature: String(filterSignature || ''),
  collectionSource: String(collectionSource || 'users'),
  ownerId: String(ownerId || ''),
  accessUserId: String(accessUserId || ''),
});

export const buildMatchingIndexQueryKey = ({
  collectionSource = 'users',
  filters = {},
  viewMode = 'default',
  ownerId = '',
  accessUserId = '',
  rawRules = '',
  searchKeySetKeys = [],
  searchKeySetsOfExactUser = searchKeySetKeys,
} = {}) => {
  const relevantViewMode = viewMode === 'favorites' || viewMode === 'dislikes' ? viewMode : 'default';
  return `matchingIndex:${serializeQueryFilters(normalizeSignatureValue({
    collectionSource,
    filters: normalizeSignatureValue(filters || {}),
    viewMode: relevantViewMode,
    ownerId: String(ownerId || accessUserId || '').trim(),
    accessUserId: String(accessUserId || ownerId || '').trim(),
    accessSnapshot: collectionSource === 'newUsers'
      ? {
          rawRulesSignature: buildRawRulesSignature(rawRules),
          searchKeySetKeys: normalizeSearchKeySetKeys(searchKeySetKeys),
          searchKeySetsOfExactUser: normalizeSearchKeySetKeys(searchKeySetsOfExactUser),
        }
      : null,
  }))}`;
};

const isCachedCardCompatible = (card, collectionSource) => {
  if (!card?.userId) return false;
  const cachedSource = card.__sourceCollection || (card.userId.length < 20 ? 'newUsers' : 'users');
  if (collectionSource === 'users') return cachedSource === 'users' || cachedSource === undefined;
  if (collectionSource === 'newUsers') return cachedSource === 'newUsers';
  return true;
};

const hydrateOrderedUsers = async ({ ids, hydrateUsersByIds, collectionSource }) => {
  if (!ids.length || typeof hydrateUsersByIds !== 'function') return [];
  const cachedById = new Map();
  const missingIds = [];
  ids.forEach(id => {
    const cached = getCard(id);
    if (cached && isCachedCardCompatible(cached, collectionSource)) {
      cachedById.set(id, {
        ...cached,
        userId: id,
        __sourceCollection: cached.__sourceCollection || collectionSource,
        __fromCardCache: true,
      });
    } else {
      missingIds.push(id);
    }
  });

  const hydrated = missingIds.length ? await hydrateUsersByIds(missingIds) : [];
  const map = Array.isArray(hydrated)
    ? new Map(hydrated.map(user => [user?.userId, user]).filter(([id]) => Boolean(id)))
    : new Map(Object.entries(hydrated || {}));
  cachedById.forEach((user, id) => map.set(id, user));

  return ids
    .map(id => map.get(id))
    .filter(Boolean)
    .map(user => ({ ...user, __sourceCollection: collectionSource }));
};

const normalizeOffset = value => Math.max(0, Number(value) || 0);
const normalizeLimit = value => Math.max(1, Number(value) || 1);

const sliceIndexedBaseIds = ({ ids = [], offset = 0, limit = 1, excludedSet = new Set() } = {}) => {
  const safeOffset = normalizeOffset(offset);
  const safeLimit = normalizeLimit(limit);
  const pageIds = [];
  let cursor = safeOffset;

  while (cursor < ids.length && pageIds.length < safeLimit) {
    const id = ids[cursor];
    cursor += 1;
    if (!id || excludedSet.has(id)) continue;
    pageIds.push(id);
  }

  let hasMore = false;
  for (let index = cursor; index < ids.length; index += 1) {
    const id = ids[index];
    if (id && !excludedSet.has(id)) {
      hasMore = true;
      break;
    }
  }

  return {
    pageIds,
    nextOffset: cursor,
    hasMore,
  };
};

export const fetchMatchingIndexedCandidates = async ({
  collectionSource = 'users',
  filters = {},
  rawRules = '',
  accessUserId = '',
  searchKeySetKeys = [],
  offset = 0,
  limit = 1,
  excludeIds = [],
  hydrateUsersByIds,
  newUsersIndexReader = getIndexedNewUsersIdsByRules,
  viewMode = 'default',
  ownerId = '',
  useIndexIdCache = true,
} = {}) => {
  const filterGroups = buildMatchingIndexFilterGroups({ filters, collectionSource });
  const excludedSet = new Set((Array.isArray(excludeIds) ? excludeIds : [...(excludeIds || [])]).filter(Boolean));
  const safeOffset = normalizeOffset(offset);
  const safeLimit = normalizeLimit(limit);
  const filterSignature = serializeQueryFilters(normalizeSignatureValue(filters || {}));
  const cacheMeta = buildMatchingIndexCacheMeta({
    filterSignature,
    collectionSource,
    ownerId: String(ownerId || '').trim(),
    accessUserId: String(accessUserId || '').trim(),
  });
  const cacheKey = buildMatchingIndexQueryKey({
    collectionSource,
    filters,
    viewMode,
    ownerId,
    accessUserId,
    rawRules,
    searchKeySetKeys,
    searchKeySetsOfExactUser: searchKeySetKeys,
  });

  const readCachedPage = () => {
    if (!useIndexIdCache || collectionSource === 'newUsers') return null;
    const cached = getIndexIdsByQuery(cacheKey, {
      requiredComplete: true,
      expectedMeta: cacheMeta,
    });
    if (!cached || !Array.isArray(cached.ids)) return null;
    const sliced = sliceIndexedBaseIds({ ids: cached.ids, offset: safeOffset, limit: safeLimit, excludedSet });
    return {
      allIds: cached.ids,
      ...sliced,
    };
  };

  const cachedPage = readCachedPage();
  if (cachedPage) {
    console.info('[Matching][indexedProvider] cache hit', {
      cacheKey,
      idsCount: cachedPage.allIds?.length || 0,
      pageIdsCount: cachedPage.pageIds?.length || 0,
      offset: safeOffset,
      limit: safeLimit,
    });
    const users = await hydrateOrderedUsers({ ids: cachedPage.pageIds, hydrateUsersByIds, collectionSource });
    return {
      usedIndex: true,
      usedIndexIdCache: true,
      cacheKey,
      userIds: cachedPage.allIds,
      paginationInputIds: cachedPage.allIds,
      pageIds: cachedPage.pageIds,
      users,
      nextOffset: cachedPage.nextOffset,
      hasMore: cachedPage.hasMore,
      filterGroups,
    };
  }
  console.info('[Matching][indexedProvider] cache miss', {
    cacheKey,
    collectionSource,
    offset: safeOffset,
    limit: safeLimit,
  });

  if (collectionSource === 'newUsers') {
    const indexed = await newUsersIndexReader({
      rawRules,
      accessUserId,
      searchKeySetsOfExactUser: searchKeySetKeys,
      fetchMissingBuckets: true,
      requireSearchKeySetKeys: true,
      resultOffset: safeOffset,
      resultLimit: safeLimit,
      additionalFilterBucketGroups: filterGroups,
      excludedUserIds: [...excludedSet],
    });
    const userIds = Array.isArray(indexed?.userIds) ? indexed.userIds : [];
    const nextOffset = Number.isFinite(Number(indexed?.nextOffset)) ? indexed.nextOffset : safeOffset + userIds.length;
    const hasMore = Boolean(indexed?.hasMore);
    const users = await hydrateOrderedUsers({ ids: userIds, hydrateUsersByIds, collectionSource });
    return {
      usedIndex: true,
      usedIndexIdCache: false,
      cacheKey,
      userIds,
      paginationInputIds: userIds,
      pageIds: userIds,
      users,
      nextOffset,
      hasMore,
      filterGroups,
      reason: indexed?.reason,
    };
  }

  if (!filterGroups.length) {
    return { usedIndex: false, userIds: [], users: [], nextOffset: safeOffset, hasMore: true, filterGroups };
  }

  // Every active group is an exclusion (typically because the reader kept the
  // "?"/unfilled cards), so the index can only reject candidates, never name them.
  // Hand the deck back to source pagination rather than read the bulk buckets to
  // reconstruct a list the post-filter would rebuild anyway.
  const deferToSourcePagination = () => {
    console.info('[Matching][indexedProvider] no include-mode filter group, deferring to source pagination', {
      cacheKey,
      groups: filterGroups.map(group => ({ indexName: group.indexName, readMode: group.readMode })),
    });
    return {
      usedIndex: false,
      userIds: [],
      users: [],
      nextOffset: safeOffset,
      hasMore: false,
      filterGroups,
      reason: 'exclude-only-index-plan',
    };
  };

  // Inverting a read is only worth it when something else names the candidates. With
  // nothing to subtract from, flip the cheapest invertible group back to a forward
  // read rather than hand the whole deck to source pagination.
  const plannedGroups = filterGroups.some(canGroupNameCandidates)
    ? filterGroups
    : invertOneGroupToNameCandidates(filterGroups);

  if (!plannedGroups.some(canGroupNameCandidates)) return deferToSourcePagination();

  const idSets = await Promise.all(
    plannedGroups.map(group => readMatchingUsersFilterIds({ group, filters }))
  );

  // Група, чиє читання впeрлось у межу, лишає надто велику частку бази, щоб
  // звузити перетин, — вона вибуває з плану. Це ніколи не змінює видачу:
  // `applyMatchingSearchKeyFilters` — повний двійник індексного плану і проходить
  // по кожній показаній картці, тож викинута група й далі відкидає своє, просто
  // після гідратації, а не до неї. Round-trip тест тримає цю рівність.
  const overflowedGroups = plannedGroups.filter((group, index) => idSets[index]?.overflowed);
  const selectiveIdSets = idSets.map(result => (result?.overflowed ? null : result));
  if (overflowedGroups.length) {
    console.info('[Matching][indexedProvider] групи поза межею читання лишаються пост-фільтру', {
      cacheKey,
      readCap: MATCHING_SEARCH_KEY_BUCKET_READ_CAP,
      groups: overflowedGroups.map(group => ({ indexName: group.indexName, readMode: group.readMode })),
    });
  }

  const combinedIds = combineFilterGroupIds(selectiveIdSets);
  // Жодної групи в межах — індекс не назвав кандидатів, і читати далі нема що.
  // Дека йде звичайною пагінацією, де сторінка коштує сторінки.
  if (!combinedIds) return deferToSourcePagination();
  const allMatchingIds = await orderSparseCardsLast(combinedIds, MATCHING_USERS_INDEX_ROOT);
  const ageGroupIndex = plannedGroups.findIndex(group => group.indexName === 'age');
  const ageDateRangeIdsCount = ageGroupIndex >= 0
    ? (idSets[ageGroupIndex]?.ids?.size || 0)
    : null;
  if (useIndexIdCache) {
    setIndexIdsForQuery(cacheKey, allMatchingIds, {
      complete: true,
      cacheVersion: MATCHING_INDEX_CACHE_VERSION,
      meta: cacheMeta,
    });
  }
  const { pageIds, nextOffset, hasMore } = sliceIndexedBaseIds({
    ids: allMatchingIds,
    offset: safeOffset,
    limit: safeLimit,
    excludedSet,
  });
  const users = await hydrateOrderedUsers({ ids: pageIds, hydrateUsersByIds, collectionSource: 'users' });

  return {
    usedIndex: true,
    usedIndexIdCache: false,
    cacheKey,
    userIds: allMatchingIds,
    paginationInputIds: allMatchingIds,
    pageIds,
    users,
    nextOffset,
    hasMore,
    filterGroups: plannedGroups,
    overflowedFilterGroups: overflowedGroups.map(group => group.indexName),
    usedAgeDateRangeReader: ageDateRangeIdsCount !== null,
    ageDateRangeIdsCount,
  };
};


export const isValidMatchingUserId = id => typeof id === 'string' && id.length >= 20;
export const isShortMatchingUserId = id => typeof id === 'string' && id.length > 0 && id.length < 20;
export const isMatchingCardId = id => isValidMatchingUserId(id) || isShortMatchingUserId(id);
export const isAllowedIdForMatchingCollection = (id, collection = 'users') =>
  collection === 'newUsers' ? isShortMatchingUserId(id) : isValidMatchingUserId(id);
export const compareUsersByLastLogin2 = (a = {}, b = {}) =>
  (b.lastLogin2 || '').localeCompare(a.lastLogin2 || '');

export const isSameMatchingCursor = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.date === b.date && a.userId === b.userId;
};

const MATCHING_SEARCHKEY_FILTER_KEYS = ['userRole', 'maritalStatus', 'bloodGroup', 'rh', 'age', 'bmi', 'country'];

export const isMatchingFilterGroupActive = group =>
  group && typeof group === 'object' && Object.values(group).some(v => !v);

const resolveRoleCategoryFromSearchKey = (userId, roleIndexSets) => {
  if (!userId || !roleIndexSets) return null;

  if (roleIndexSets.ag?.has(userId)) return 'ag';
  if (roleIndexSets.ip?.has(userId)) return 'ip';
  if (roleIndexSets.ed?.has(userId)) return 'ed';
  if (roleIndexSets['?']?.has(userId) || roleIndexSets.no?.has(userId)) return 'other';

  return null;
};

const buildAllowedRoleIdsFromSearchKey = (roleFilters, roleIndexSets) => {
  if (!roleFilters || !roleIndexSets) return null;

  const allIndexedIds = new Set();
  const allowedIds = new Set();

  const includeBucket = bucket => {
    const bucketSet = roleIndexSets?.[bucket];
    if (!(bucketSet instanceof Set)) return;
    bucketSet.forEach(id => {
      allIndexedIds.add(id);
      allowedIds.add(id);
    });
  };

  const trackBucketOnly = bucket => {
    const bucketSet = roleIndexSets?.[bucket];
    if (!(bucketSet instanceof Set)) return;
    bucketSet.forEach(id => allIndexedIds.add(id));
  };

  if (roleFilters.ag) includeBucket('ag');
  else trackBucketOnly('ag');

  if (roleFilters.ip) includeBucket('ip');
  else trackBucketOnly('ip');

  if (roleFilters.ed) includeBucket('ed');
  else trackBucketOnly('ed');

  if (roleFilters.other) {
    includeBucket('?');
    includeBucket('no');
  } else {
    trackBucketOnly('?');
    trackBucketOnly('no');
  }

  return { allowedIds, allIndexedIds };
};

const toRoleCategory = (user, roleIndexSets = null) => {
  const indexedCategory = resolveRoleCategoryFromSearchKey(user?.userId, roleIndexSets);
  if (indexedCategory) return indexedCategory;

  const normalizeRole = value => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['ed', 'ag', 'ip', 'sm', 'cl'].includes(normalized)) return normalized;
    if (!normalized) return 'no';
    return '?';
  };

  const directRole = normalizeRole(user?.role);
  const fallbackRole = normalizeRole(user?.userRole);

  if (
    user?.__sourceCollection === 'newUsers' &&
    fallbackRole === 'no' &&
    (directRole === 'no' || directRole === '?')
  ) {
    return 'ed';
  }

  const resolved = directRole !== 'no' && directRole !== '?' ? directRole : fallbackRole;

  if (['ed', 'ag', 'ip'].includes(resolved)) return resolved;
  return 'other';
};

const toMaritalStatusCategory = user => {
  const raw = String(user?.maritalStatus || '').trim().toLowerCase();
  if (!raw) return 'other';

  const compact = raw.replace(/[.,;:!]/g, '').replace(/\s+/g, '');
  const plusValues = new Set(['+', 'plus', 'yes', 'так', 'заміжня', 'замужем', 'одружена', 'одружений', 'married']);
  const minusValues = new Set(['-', 'minus', 'no', 'ні', 'незаміжня', 'незамужем', 'неодружена', 'неодружений', 'single', 'unmarried']);

  if (plusValues.has(compact)) return 'married';
  if (minusValues.has(compact)) return 'unmarried';
  return 'other';
};

const toBloodGroupCategory = user => {
  const normalized = String(user?.blood || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  if (/^[1-4][+-]$/.test(normalized)) return normalized[0];
  if (/^[1-4]$/.test(normalized)) return normalized;
  return 'other';
};

const toRhCategory = user => {
  const normalized = String(user?.blood || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  if (normalized.endsWith('+') || normalized === '+') return '+';
  if (normalized.endsWith('-') || normalized === '-') return '-';
  return 'other';
};

const toAgeCategory = user => {
  const birth = String(user?.birth || '').trim();
  const match = birth.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return 'other';

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const birthDate = new Date(year, month - 1, day);
  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return 'other';
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;

  if (age <= 25) return 'le25';
  if (age <= 30) return '26_30';
  if (age <= 33) return '31_33';
  if (age <= 36) return '34_36';
  if (age >= 37) return '37_plus';
  return 'other';
};

// Same rule the index writer uses, so the two can never disagree on a boundary.
const toBmiCategory = user => resolveBmiBucket(user);

const toCountryCategory = user => resolveCountryBucket(user);

export const getMatchingFiltersWithoutSearchKeyGroups = filters => {
  const base = { ...(filters || {}) };
  MATCHING_SEARCHKEY_FILTER_KEYS.forEach(key => {
    delete base[key];
  });
  return base;
};

export const applyMatchingSearchKeyFilters = (users, filters, roleIndexSets = null) => {
  const activeFilters = filters || {};
  const roleIndexFilterMeta = isMatchingFilterGroupActive(activeFilters.userRole)
    ? buildAllowedRoleIdsFromSearchKey(activeFilters.userRole, roleIndexSets)
    : null;

  return users.filter(user => {
    if (isMatchingFilterGroupActive(activeFilters.userRole)) {
      if (roleIndexFilterMeta && user?.userId && roleIndexFilterMeta.allIndexedIds.has(user.userId)) {
        if (!roleIndexFilterMeta.allowedIds.has(user.userId)) return false;
      } else {
        const category = toRoleCategory(user, roleIndexSets);
        if (!activeFilters.userRole[category]) return false;
      }
    }

    if (isMatchingFilterGroupActive(activeFilters.maritalStatus)) {
      const category = toMaritalStatusCategory(user);
      if (!activeFilters.maritalStatus[category]) return false;
    }

    if (isMatchingFilterGroupActive(activeFilters.bloodGroup)) {
      const category = toBloodGroupCategory(user);
      if (!activeFilters.bloodGroup[category]) return false;
    }

    if (isMatchingFilterGroupActive(activeFilters.rh)) {
      const category = toRhCategory(user);
      if (!activeFilters.rh[category]) return false;
    }

    if (isMatchingFilterGroupActive(activeFilters.age)) {
      const category = toAgeCategory(user);
      if (!activeFilters.age[category]) return false;
    }
    if (isMatchingFilterGroupActive(activeFilters.bmi)) {
      const category = toBmiCategory(user);
      if (!activeFilters.bmi[category]) return false;
    }

    if (isMatchingFilterGroupActive(activeFilters.country)) {
      const category = toCountryCategory(user);
      if (!activeFilters.country[category]) return false;
    }

    return true;
  });
};

const getActiveGroupFilterKeys = group => (
  Object.entries(group || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key)
);

export const getMatchingUiFilterDebugSummary = filters => Object.entries(filters || {})
  .flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      const active = value.filter(item => String(item || '').trim() !== '');
      return active.length > 0 ? [`${key}=[${active.join('|')}]`] : [];
    }

    if (value && typeof value === 'object') {
      if (!isMatchingFilterGroupActive(value)) return [];
      const active = getActiveGroupFilterKeys(value);
      return active.length > 0 ? [`${key}=[${active.join('|')}]`] : [];
    }

    if (typeof value === 'boolean') {
      return value ? [`${key}=true`] : [];
    }

    const normalized = String(value || '').trim();
    return normalized ? [`${key}=${normalized}`] : [];
  })
  .slice(0, 10)
  .join(', ');

export const getMatchingSearchKeyFilterDebugForUser = ({
  user,
  filters = {},
  roleIndexSets = null,
} = {}) => {
  const failedFilters = [];
  const checks = {};
  const roleFilterMeta = isMatchingFilterGroupActive(filters.userRole)
    ? buildAllowedRoleIdsFromSearchKey(filters.userRole, roleIndexSets)
    : null;

  if (isMatchingFilterGroupActive(filters.userRole)) {
    const active = getActiveGroupFilterKeys(filters.userRole);
    let category = toRoleCategory(user, roleIndexSets);
    let pass = Boolean(filters.userRole?.[category]);
    const details = {
      active,
      category,
      pass,
      fromIndex: false,
    };
    if (roleFilterMeta && user?.userId && roleFilterMeta.allIndexedIds.has(user.userId)) {
      pass = roleFilterMeta.allowedIds.has(user.userId);
      details.pass = pass;
      details.fromIndex = true;
      details.allowedByIndex = pass;
    }
    const groupState = getFilterGroupDebugState('userRole', filters.userRole);
    checks.userRole = {
      ...details,
      ...groupState,
      source: 'searchKey/users',
    };
    if (!pass) failedFilters.push('userRole');
  }

  if (isMatchingFilterGroupActive(filters.maritalStatus)) {
    const category = toMaritalStatusCategory(user);
    const active = getActiveGroupFilterKeys(filters.maritalStatus);
    const pass = Boolean(filters.maritalStatus?.[category]);
    checks.maritalStatus = {
      active, category, pass, ...getFilterGroupDebugState('maritalStatus', filters.maritalStatus), source: 'searchKey/users',
    };
    if (!pass) failedFilters.push('maritalStatus');
  }

  if (isMatchingFilterGroupActive(filters.bloodGroup)) {
    const category = toBloodGroupCategory(user);
    const active = getActiveGroupFilterKeys(filters.bloodGroup);
    const pass = Boolean(filters.bloodGroup?.[category]);
    checks.bloodGroup = {
      active, category, pass, ...getFilterGroupDebugState('bloodGroup', filters.bloodGroup), source: 'searchKey/users',
    };
    if (!pass) failedFilters.push('bloodGroup');
  }

  if (isMatchingFilterGroupActive(filters.rh)) {
    const category = toRhCategory(user);
    const active = getActiveGroupFilterKeys(filters.rh);
    const pass = Boolean(filters.rh?.[category]);
    checks.rh = {
      active, category, pass, ...getFilterGroupDebugState('rh', filters.rh), source: 'searchKey/users',
    };
    if (!pass) failedFilters.push('rh');
  }

  if (isMatchingFilterGroupActive(filters.age)) {
    const category = toAgeCategory(user);
    const active = getActiveGroupFilterKeys(filters.age);
    const pass = Boolean(filters.age?.[category]);
    checks.age = {
      active, category, pass, ...getFilterGroupDebugState('age', filters.age), source: 'searchKey/users',
    };
    if (!pass) failedFilters.push('age');
  }

  if (isMatchingFilterGroupActive(filters.bmi)) {
    const category = toBmiCategory(user);
    const active = getActiveGroupFilterKeys(filters.bmi);
    const pass = Boolean(filters.bmi?.[category]);
    checks.bmi = {
      active, category, pass, ...getFilterGroupDebugState('bmi', filters.bmi), source: 'searchKey/users',
    };
    if (!pass) failedFilters.push('bmi');
  }

  return {
    failedFilters,
    checks,
  };
};

const passthroughFilterMain = usersData => usersData;

const isReactionViewMode = viewMode => viewMode === 'favorites' || viewMode === 'dislikes';

const getFilterMainInputsForMatchingView = ({
  filters,
  favoriteUsers = {},
  dislikeUsers = {},
  viewMode = 'default',
} = {}) => {
  const filterMainFilters = getMatchingFiltersWithoutSearchKeyGroups(filters);

  if (!isReactionViewMode(viewMode)) {
    return {
      filterMainFilters,
      filterMainFavoriteUsers: favoriteUsers,
      filterMainDislikeUsers: dislikeUsers,
    };
  }

  // Reaction tabs already scope the candidate list by the selected reaction map.
  // Do not let default-deck reaction filters (favorite.favOnly/reaction) or
  // favorite/dislike maps remove the very cards the active tab is supposed to show.
  const reactionSafeFilters = { ...filterMainFilters };
  delete reactionSafeFilters.favorite;
  delete reactionSafeFilters.reaction;
  return {
    filterMainFilters: reactionSafeFilters,
    filterMainFavoriteUsers: {},
    filterMainDislikeUsers: {},
  };
};

/**
 * Cards with almost nothing on record go to the end of whatever list is rendered.
 *
 * This is the same promise the indexed provider makes about the candidate ids, kept
 * here as well so it also holds for the decks the index does not drive: source
 * pagination, the newUsers deck and the reaction tabs. It is a stable partition, so
 * the order the deck chose is untouched apart from moving those cards down.
 */
const orderSparseUsersLast = users => {
  const withData = [];
  const nearlyEmpty = [];
  users.forEach(user => (isSparseProfile(user) ? nearlyEmpty : withData).push(user));
  return nearlyEmpty.length ? [...withData, ...nearlyEmpty] : users;
};

export const applyMatchingUiFiltersToUsers = ({
  users,
  filters,
  favoriteUsers = {},
  dislikeUsers = {},
  excludeReactionUsers = false,
  roleIndexSets,
  collectionSource,
  viewMode = 'default',
  filterMainFn = passthroughFilterMain,
}) => {
  const {
    filterMainFilters,
    filterMainFavoriteUsers,
    filterMainDislikeUsers,
  } = getFilterMainInputsForMatchingView({
    filters,
    favoriteUsers,
    dislikeUsers,
    viewMode,
  });

  // The five searchKey groups are stripped out of filterMain's settings, so nothing
  // else applies them: the index is their only enforcement - until it defers, which
  // it now does whenever a selection keeps the cards with nothing on record. Running
  // the twin post-filter here makes the deck correct either way. It costs nothing
  // when the index did narrow: it keeps exactly what the index would have kept.
  const searchKeyFilteredUsers = applyMatchingSearchKeyFilters(users, filters, roleIndexSets);

  const baseUsers = filterMainFn(
    searchKeyFilteredUsers.map(u => [u.userId, u]),
    null,
    filterMainFilters,
    filterMainFavoriteUsers,
    filterMainDislikeUsers
  )
    .map(([, u]) => u)
    .filter(u => (
      u?.__sourceCollection === 'newUsers' || u?.publish !== false
    ))
    .filter(u => (
      !excludeReactionUsers ||
      (!favoriteUsers[u.userId] && !dislikeUsers[u.userId])
    ))
    .filter(u => (
      isReactionViewMode(viewMode) ||
      // Search spans both collections by design: which one the drawer's source
      // selector points at governs the feed, not what a query is allowed to find.
      viewMode === 'search' ||
      isAllowedIdForMatchingCollection(u.userId, collectionSource)
    ));

  return orderSparseUsersLast(baseUsers);
};

export const getActiveMatchingFiltersDebug = filters => Object.entries(filters || {}).reduce((acc, [key, value]) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const disabled = Object.entries(value)
      .filter(([, enabled]) => !enabled)
      .map(([filterKey]) => filterKey);
    if (disabled.length) acc[key] = disabled;
    return acc;
  }

  if (value) acc[key] = value;
  return acc;
}, {});

export const fetchNewUsersByIdsForMatching = async ({
  ids,
  batchSize = 100,
  get,
  ref,
  database,
  getAllUserPhotos,
}) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  if (typeof get !== 'function' || typeof ref !== 'function' || !database) {
    throw new Error('fetchNewUsersByIdsForMatching requires get, ref and database dependencies');
  }

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const safeBatchSize = Math.max(1, Number(batchSize) || 100);
  const result = [];
  let offset = 0;

  while (offset < uniqueIds.length) {
    const chunkIds = uniqueIds.slice(offset, offset + safeBatchSize);
    const chunkSnapshots = await Promise.all(
      chunkIds.map(async userId => {
        const snapshot = await get(ref(database, `newUsers/${userId}`));
        if (!snapshot.exists()) return null;
        return {
          userId,
          ...(snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {}),
          photos: [],
          __photosHydrated: false,
          __sourceCollection: 'newUsers',
        };
      })
    );

    result.push(...chunkSnapshots.filter(Boolean));
    offset += safeBatchSize;
  }

  return result;
};

const buildEmptyAdditionalSearchIndexResult = (reason, offset = 0) => ({
  userIds: [],
  users: [],
  nextOffset: Math.max(0, Number(offset) || 0),
  hasMore: false,
  reason,
});

const rethrowMatchingStageError = (error, stage) => {
  if (error && typeof error === 'object') {
    error.stage = stage;
    error.requestLabel = stage;
    throw error;
  }
  const stagedError = new Error(String(error || `Matching request failed at ${stage}`));
  stagedError.code = 'matching/unknown';
  stagedError.stage = stage;
  stagedError.requestLabel = stage;
  throw stagedError;
};

export const fetchAdditionalNewUsersBySearchIndex = async ({
  rawRules,
  accessUserId,
  searchKeySetKeys,
  collectionSource = 'newUsers',
  filters = {},
  excludeIds = [],
  offset = 0,
  limit = 100,
  fetchNewUsersByIds,
  shouldDebugAdditionalMatching = () => false,
  debugAdditionalToast = () => {},
  logAdditionalMatchingDebug = () => {},
  debugMissingNewUsersToast = () => {},
}) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  const normalizedSearchKeySetKeys = normalizeSearchKeySetKeys(searchKeySetKeys);

  const indexRequestDebugData = {
    collectionSource,
    accessUserId: normalizedAccessUserId,
    rawRules,
    searchKeySetsOfExactUser: searchKeySetKeys,
    offset,
    limit,
    filterGroups: buildMatchingIndexFilterGroups({ filters, collectionSource }),
  };

  if (collectionSource === 'newUsers' && normalizedSearchKeySetKeys.length === 0) {
    const reason = 'no searchKeySets data';
    console.info('[Matching][additionalNewUsers] access scope empty', {
      ...indexRequestDebugData,
      reason,
    });
    debugAdditionalToast(normalizedAccessUserId, 'access scope empty', {
      ...indexRequestDebugData,
      reason,
    });
    return buildEmptyAdditionalSearchIndexResult(reason, offset);
  }

  console.info('[Matching][additionalNewUsers] getIndexedNewUsersIdsByRules request', indexRequestDebugData);
  debugAdditionalToast(normalizedAccessUserId, 'before getIndexedNewUsersIdsByRules', indexRequestDebugData);

  const indexed = await fetchMatchingIndexedCandidates({
    collectionSource: 'newUsers',
    filters,
    rawRules,
    accessUserId: normalizedAccessUserId,
    ownerId: normalizedAccessUserId,
    searchKeySetKeys,
    offset,
    limit,
    excludeIds,
    hydrateUsersByIds: async ids => {
      try {
        return await fetchNewUsersByIds(ids);
      } catch (error) {
        return rethrowMatchingStageError(error, 'profile-hydration');
      }
    },
    newUsersIndexReader: async args => {
      try {
        return await getIndexedNewUsersIdsByRules({
          ...args,
          fetchMissingBuckets: true,
          requireSearchKeySetKeys: collectionSource === 'newUsers',
          debugMatchingFlow: shouldDebugAdditionalMatching(normalizedAccessUserId),
          debugToast: (message, data) => debugAdditionalToast(normalizedAccessUserId, message, data),
        });
      } catch (error) {
        return rethrowMatchingStageError(error, 'search-index');
      }
    },
  });

  const userIds = Array.isArray(indexed?.userIds) ? indexed.userIds : [];
  console.info('[Matching][additionalNewUsers] indexedUserIdsCount', userIds.length);
  logAdditionalMatchingDebug(normalizedAccessUserId, 'index response ids', {
    fetchedIds: userIds,
    indexedUserIds: userIds,
    first10IndexedUserIds: userIds.slice(0, 10),
    hasMore: Boolean(indexed?.hasMore),
    nextOffset: Number.isFinite(Number(indexed?.nextOffset)) ? indexed.nextOffset : userIds.length,
  });

  const users = Array.isArray(indexed?.users) ? indexed.users : [];
  console.info('[Matching][additionalNewUsers] fetchedUsersCount', users.length);
  logAdditionalMatchingDebug(normalizedAccessUserId, 'newUsers fetch response', {
    requestedIds: userIds,
    fetchedUsers: users,
    first10FetchedUserIds: users.map(user => user.userId).filter(Boolean).slice(0, 10),
  });

  if (userIds.length > 0 && users.length === 0) {
    debugMissingNewUsersToast(normalizedAccessUserId, userIds.length);
  }

  return {
    userIds,
    users,
    nextOffset: Number.isFinite(Number(indexed?.nextOffset)) ? indexed.nextOffset : userIds.length,
    hasMore: Boolean(indexed?.hasMore),
  };
};

// Скільки анкет просити в джерела на одну сторінку стрічки. Фільтри відсіюють
// частину, тож запас потрібен — але фіксований, а не такий, що росте зі скролом.
const MATCHING_SOURCE_PAGE_OVERFETCH = 3;
const MATCHING_SOURCE_PAGE_OVERFETCH_FLOOR = 5;
const MATCHING_SOURCE_PAGE_LIMIT_CAP = 100;

export const fetchFilteredMatchingSourceChunk = ({
  targetVisibleCount,
  initialCursor,
  exclude = new Set(),
  collectionSource = 'users',
  parsedAdditionalAccessRules = [],
  filters = {},
  isAdmin = false,
  favoriteUsers = {},
  dislikeUsers = {},
  roleIndexSets = null,
  filterMainFn = passthroughFilterMain,
  fetchUsersByLastLogin2,
  fetchUsersByLastLogin2FromCollection,
  fetchMatchingCardsPage,
  hydrateUsersByIds,
  onPart,
  onDiagnosticEvent,
}) => {
  if (collectionSource === 'newUsers' && parsedAdditionalAccessRules.length > 0) {
    return Promise.resolve({
      users: [],
      lastKey: initialCursor ?? null,
      hasMore: false,
      sourceHasMore: false,
      cursorAdvanced: false,
      excludedCount: 0,
      loadedPages: 0,
    });
  }

  return collectFilteredMatchingSourceCards({
    targetVisibleCount,
    initialCursor,
    exclude,
    isSameCursor: isSameMatchingCursor,
    // Запас на відсіяні картки — а не `exclude.size`. Множина виключень росте з
    // кожною прогорнутою сторінкою (завантажені + обране + приховані), тож
    // прив'язка до неї означала, що на 40-й картці стрічка просила в бекенда
    // ~50 повних анкет, щоб показати п'ять. Постійний множник тримає запас
    // пропорційним тому, що справді потрібно.
    getSourceLimit: ({ remaining }) => Math.min(
      MATCHING_SOURCE_PAGE_LIMIT_CAP,
      remaining * MATCHING_SOURCE_PAGE_OVERFETCH + MATCHING_SOURCE_PAGE_OVERFETCH_FLOOR,
    ),
    // Сторінка джерела вже віддає все, що рядок стрічки показує — чи то повна
    // анкета, чи то проєкція `matchingCards`. Перечитувати її поштучно за id
    // нема потреби. Урізаний пошуковий хіт — інша річ: за ним стоїть не картка,
    // а проєкція з пʼяти полів, і його треба догідратувати.
    isHydrated: user => Boolean(user) && !user.__limitedProfile,
    maxSourceCards: 500,
    debugLabel: `matchingSourceBackfill:${collectionSource}`,
    fetchSourcePage: async ({ limit: sourceLimit, cursor }) => {
      const readProfilePage = () => (
        collectionSource === 'newUsers'
          ? fetchUsersByLastLogin2FromCollection('newUsers', sourceLimit, cursor)
          : fetchUsersByLastLogin2(sourceLimit, cursor)
      );

      // Читач мусить знати, чим саме він зараз читає стрічку: різниця між
      // проєкцією і повною анкетою — це порядок величини трафіку, і мовчазне
      // сповзання на анкети виглядає просто як «чомусь важко».
      const reportFeedSource = (feedSource, reason, error = null) => {
        if (typeof onDiagnosticEvent !== 'function') return;
        // Код помилки — це і є відповідь: PERMISSION_DENIED і «Index not defined»
        // лікуються по-різному, а без нього обидва виглядають як «не вдалося».
        const errorCode = String(error?.code || error?.name || '').trim();
        const errorMessage = String(error?.message || '').trim().slice(0, 200);
        onDiagnosticEvent({
          stage: 'feed-source',
          status: 'completed',
          feedSource,
          reason,
          collectionSource,
          errorCode,
          errorMessage,
        });
      };

      if (typeof fetchMatchingCardsPage !== 'function') {
        reportFeedSource('profiles', 'pager-unavailable');
        return readProfilePage();
      }

      // Основний шлях: одна сторінка стрічки = один запит по вузлу проєкцій,
      // де картка важить сотні байтів і вже несе аватар. Проєкція може бути ще
      // не побудована (нова база, індексація не запускалась) — тоді перша ж
      // сторінка приходить порожньою, і читач мовчки повертається до анкет.
      try {
        const cardsPage = await fetchMatchingCardsPage({ limit: sourceLimit, cursor, collectionSource });
        if (cardsPage?.users?.length && cardsPage.indexComplete !== false) {
          reportFeedSource('matchingCards', '');
          return cardsPage;
        }
        if (cardsPage?.indexComplete === false) {
          console.info('[Matching][matchingCards] індекс неповний — читаємо анкети напряму', { collectionSource });
          reportFeedSource('profiles', 'index-incomplete');
          return readProfilePage();
        }
        if (cursor) {
          reportFeedSource('matchingCards', '');
          return cardsPage;
        }
        console.info('[Matching][matchingCards] вузол порожній — читаємо анкети напряму', { collectionSource });
        reportFeedSource('profiles', 'index-empty');
      } catch (error) {
        console.warn('[Matching][matchingCards] сторінку прочитати не вдалося, читаємо анкети напряму', error);
        reportFeedSource('profiles', 'index-read-failed', error);
      }

      return readProfilePage();
    },
    filterSourceUsers: sourceUsers => {
      if (!isAdmin) {
        return sourceUsers.filter(
          user => isAllowedIdForMatchingCollection(user.userId, collectionSource) && !exclude.has(user.userId)
        );
      }

      return applyMatchingSearchKeyFilters(
        filterMainFn(
          sourceUsers.map(user => [user.userId, user]),
          null,
          getMatchingFiltersWithoutSearchKeyGroups(filters),
          favoriteUsers,
          dislikeUsers
        ).map(([, user]) => user),
        filters,
        roleIndexSets
      ).filter(
        user => isAllowedIdForMatchingCollection(user.userId, collectionSource) && !exclude.has(user.userId)
      );
    },
    hydrateUsersByIds,
    decorateUser: user => ({
      ...user,
      __sourceCollection: collectionSource === 'newUsers' ? 'newUsers' : 'users',
    }),
    onPart,
    onDiagnosticEvent,
  });
};
