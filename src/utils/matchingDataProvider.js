import { get, ref } from 'firebase/database';
import { database } from 'components/config';
import { getCard, getIndexIdsByQuery, MATCHING_INDEX_CACHE_VERSION, serializeQueryFilters, setIndexIdsForQuery } from './cardIndex';
import { collectFilteredMatchingSourceCards } from './matchingSourceBackfill';
import { getIndexedNewUsersIdsByRules, normalizeSearchKeySetKeys } from './newUsersFilterSetsIndex';

export const MATCHING_INDEX_ROOT = 'searchKey';
export const MATCHING_USERS_INDEX_ROOT = `${MATCHING_INDEX_ROOT}/users`;

const BLOOD_BUCKETS = ['1+', '1-', '1', '2+', '2-', '2', '3+', '3-', '3', '4+', '4-', '4', '?', 'no'];
const ROLE_BUCKETS = ['ed', 'sm', 'ag', 'ip', 'pp', 'cl', '?', 'no'];
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

const unique = values => [...new Set((values || []).filter(Boolean))];

const addGroup = (groups, indexName, values) => {
  const normalizedValues = unique(values.map(value => String(value || '').trim()).filter(Boolean));
  if (!indexName || normalizedValues.length === 0) return;
  groups.push({ indexName, values: normalizedValues });
};

const buildRoleBuckets = (filters, collectionSource) => {
  const selected = selectedFilterKeys(filters?.userRole || filters?.role);
  if (!selected.length) return [];

  const buckets = [];
  if (selected.includes('ed')) buckets.push('ed');
  if (selected.includes('ag')) buckets.push('ag');
  if (selected.includes('ip')) buckets.push('ip');
  if (selected.includes('sm')) buckets.push('sm');
  if (selected.includes('pp')) buckets.push('pp');
  if (selected.includes('cl')) buckets.push('cl');
  if (selected.includes('empty')) buckets.push('no');
  if (selected.includes('other')) {
    buckets.push('?', 'no');
    ROLE_BUCKETS.forEach(bucket => {
      if (!['ed', 'ag', 'ip', 'no'].includes(bucket)) buckets.push(bucket);
    });
  }

  // Matching treats additional newUsers without a role as donor profiles, so keep
  // the indexed provider aligned with the existing post-filter fallback.
  if (collectionSource === 'newUsers' && selected.includes('ed')) buckets.push('no');

  return buckets;
};

const getBloodMeta = bucket => {
  if (bucket === '?' || bucket === 'no') return { bloodGroup: 'other', rh: 'other' };
  const match = String(bucket).match(/^([1-4])([+-])?$/);
  if (!match) return { bloodGroup: 'other', rh: 'other' };
  return { bloodGroup: match[1], rh: match[2] || 'other' };
};

const buildBloodBuckets = filters => {
  const bloodGroupActive = hasActiveFilterGroup(filters?.bloodGroup);
  const rhActive = hasActiveFilterGroup(filters?.rh);
  if (!bloodGroupActive && !rhActive) return [];

  return BLOOD_BUCKETS.filter(bucket => {
    const meta = getBloodMeta(bucket);
    const bloodAllowed = bloodGroupActive ? Boolean(filters?.bloodGroup?.[meta.bloodGroup]) : true;
    const rhAllowed = rhActive ? Boolean(filters?.rh?.[meta.rh]) : true;
    return bloodAllowed && rhAllowed;
  });
};

const buildMaritalStatusBuckets = filters => {
  const selected = selectedFilterKeys(filters?.maritalStatus);
  if (!selected.length) return [];

  const buckets = [];
  if (selected.includes('married')) buckets.push('+');
  if (selected.includes('unmarried')) buckets.push('-');
  if (selected.includes('other')) buckets.push('?', 'no');
  if (selected.includes('empty')) buckets.push('no');
  return buckets;
};

const buildAgeBuckets = filters => {
  const selected = selectedFilterKeys(filters?.age);
  if (!selected.length) return [];
  return selected.flatMap(key => AGE_BUCKETS_BY_MATCHING_KEY[key] || []);
};

export const buildMatchingIndexFilterGroups = ({ filters = {}, collectionSource = 'users' } = {}) => {
  const groups = [];
  addGroup(groups, 'role', buildRoleBuckets(filters, collectionSource));
  addGroup(groups, 'maritalStatus', buildMaritalStatusBuckets(filters));
  addGroup(groups, 'blood', buildBloodBuckets(filters));
  addGroup(groups, 'age', buildAgeBuckets(filters));
  return groups;
};

const collectIdsFromValue = value => {
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).filter(Boolean);
};

const readBucketIds = async ({ rootPath, indexName, values }) => {
  const ids = new Set();
  await Promise.all(values.map(async value => {
    const snapshot = await get(ref(database, `${rootPath}/${indexName}/${value}`));
    if (!snapshot.exists()) return;
    collectIdsFromValue(snapshot.val()).forEach(id => ids.add(id));
  }));
  return ids;
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

  const idSets = await Promise.all(
    filterGroups.map(group => readBucketIds({ rootPath: MATCHING_USERS_INDEX_ROOT, ...group }))
  );
  const allMatchingIds = intersectIdSets(idSets) || [];
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
    filterGroups,
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

const MATCHING_SEARCHKEY_FILTER_KEYS = ['userRole', 'maritalStatus', 'bloodGroup', 'rh', 'age'];

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

  if (age <= 21) return 'le21';
  if (age <= 25) return '22_25';
  if (age <= 30) return '26_30';
  if (age <= 35) return '31_35';
  if (age <= 38) return '36_38';
  if (age <= 41) return '39_41';
  if (age >= 42) return '42_plus';
  return 'other';
};

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
    checks.userRole = details;
    if (!pass) failedFilters.push('userRole');
  }

  if (isMatchingFilterGroupActive(filters.maritalStatus)) {
    const category = toMaritalStatusCategory(user);
    const active = getActiveGroupFilterKeys(filters.maritalStatus);
    const pass = Boolean(filters.maritalStatus?.[category]);
    checks.maritalStatus = { active, category, pass };
    if (!pass) failedFilters.push('maritalStatus');
  }

  if (isMatchingFilterGroupActive(filters.bloodGroup)) {
    const category = toBloodGroupCategory(user);
    const active = getActiveGroupFilterKeys(filters.bloodGroup);
    const pass = Boolean(filters.bloodGroup?.[category]);
    checks.bloodGroup = { active, category, pass };
    if (!pass) failedFilters.push('bloodGroup');
  }

  if (isMatchingFilterGroupActive(filters.rh)) {
    const category = toRhCategory(user);
    const active = getActiveGroupFilterKeys(filters.rh);
    const pass = Boolean(filters.rh?.[category]);
    checks.rh = { active, category, pass };
    if (!pass) failedFilters.push('rh');
  }

  if (isMatchingFilterGroupActive(filters.age)) {
    const category = toAgeCategory(user);
    const active = getActiveGroupFilterKeys(filters.age);
    const pass = Boolean(filters.age?.[category]);
    checks.age = { active, category, pass };
    if (!pass) failedFilters.push('age');
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

  const baseUsers = filterMainFn(
    users.map(u => [u.userId, u]),
    null,
    filterMainFilters,
    filterMainFavoriteUsers,
    filterMainDislikeUsers
  )
    .map(([, u]) => u)
    .filter(u => (
      !excludeReactionUsers ||
      (!favoriteUsers[u.userId] && !dislikeUsers[u.userId])
    ))
    .filter(u => (
      isReactionViewMode(viewMode) ||
      isAllowedIdForMatchingCollection(u.userId, collectionSource)
    ));

  return baseUsers;
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
    hydrateUsersByIds: fetchNewUsersByIds,
    newUsersIndexReader: args => getIndexedNewUsersIdsByRules({
      ...args,
      fetchMissingBuckets: true,
      requireSearchKeySetKeys: collectionSource === 'newUsers',
      debugMatchingFlow: shouldDebugAdditionalMatching(normalizedAccessUserId),
      debugToast: (message, data) => debugAdditionalToast(normalizedAccessUserId, message, data),
    }),
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
  hydrateUsersByIds,
  onPart,
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
    getSourceLimit: ({ remaining }) => remaining + exclude.size + 1,
    fetchSourcePage: ({ limit: sourceLimit, cursor }) => (
      collectionSource === 'newUsers'
        ? fetchUsersByLastLogin2FromCollection('newUsers', sourceLimit, cursor)
        : fetchUsersByLastLogin2(sourceLimit, cursor)
    ),
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
  });
};
