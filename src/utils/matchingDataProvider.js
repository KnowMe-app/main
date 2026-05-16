import { get, ref } from 'firebase/database';
import { database } from 'components/config';
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

const hydrateOrderedUsers = async ({ ids, hydrateUsersByIds, collectionSource }) => {
  if (!ids.length || typeof hydrateUsersByIds !== 'function') return [];
  const hydrated = await hydrateUsersByIds(ids);
  const map = Array.isArray(hydrated)
    ? new Map(hydrated.map(user => [user?.userId, user]).filter(([id]) => Boolean(id)))
    : new Map(Object.entries(hydrated || {}));

  return ids
    .map(id => map.get(id))
    .filter(Boolean)
    .map(user => ({ ...user, __sourceCollection: collectionSource }));
};

const normalizeOffset = value => Math.max(0, Number(value) || 0);
const normalizeLimit = value => Math.max(1, Number(value) || 1);

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
} = {}) => {
  const filterGroups = buildMatchingIndexFilterGroups({ filters, collectionSource });
  const excludedSet = new Set((Array.isArray(excludeIds) ? excludeIds : [...(excludeIds || [])]).filter(Boolean));
  const safeOffset = normalizeOffset(offset);
  const safeLimit = normalizeLimit(limit);

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
    const users = await hydrateOrderedUsers({ ids: userIds, hydrateUsersByIds, collectionSource });
    return {
      usedIndex: true,
      userIds,
      users,
      nextOffset: Number.isFinite(Number(indexed?.nextOffset)) ? indexed.nextOffset : safeOffset + userIds.length,
      hasMore: Boolean(indexed?.hasMore),
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
  const allMatchingIds = (intersectIdSets(idSets) || []).filter(id => !excludedSet.has(id));
  const pageIds = allMatchingIds.slice(safeOffset, safeOffset + safeLimit);
  const users = await hydrateOrderedUsers({ ids: pageIds, hydrateUsersByIds, collectionSource: 'users' });
  const nextOffset = safeOffset + pageIds.length;

  return {
    usedIndex: true,
    userIds: pageIds,
    users,
    nextOffset,
    hasMore: nextOffset < allMatchingIds.length,
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

const passthroughFilterMain = usersData => usersData;

export const applyMatchingUiFiltersToUsers = ({
  users,
  filters,
  favoriteUsers,
  dislikeUsers,
  excludeReactionUsers = false,
  roleIndexSets,
  collectionSource,
  viewMode = 'default',
  filterMainFn = passthroughFilterMain,
}) =>
  applyMatchingSearchKeyFilters(
    filterMainFn(
      users.map(u => [u.userId, u]),
      null,
      getMatchingFiltersWithoutSearchKeyGroups(filters),
      favoriteUsers,
      dislikeUsers
    )
      .map(([, u]) => u)
      .filter(u => (
        !excludeReactionUsers ||
        (!favoriteUsers[u.userId] && !dislikeUsers[u.userId])
      )),
    filters,
    roleIndexSets
  ).filter(u => (
    viewMode === 'favorites' ||
    viewMode === 'dislikes' ||
    isAllowedIdForMatchingCollection(u.userId, collectionSource)
  ));

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
  if (typeof get !== 'function' || typeof ref !== 'function' || !database || typeof getAllUserPhotos !== 'function') {
    throw new Error('fetchNewUsersByIdsForMatching requires get, ref, database and getAllUserPhotos dependencies');
  }

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const safeBatchSize = Math.max(1, Number(batchSize) || 100);
  const result = [];
  let offset = 0;

  while (offset < uniqueIds.length) {
    const chunkIds = uniqueIds.slice(offset, offset + safeBatchSize);
    const chunkSnapshots = await Promise.all(
      chunkIds.map(async userId => {
        const [snapshot, photos] = await Promise.all([
          get(ref(database, `newUsers/${userId}`)),
          getAllUserPhotos(userId),
        ]);
        if (!snapshot.exists()) return null;
        return {
          userId,
          ...(snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {}),
          photos: Array.isArray(photos) ? photos : [],
          __photosHydrated: true,
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
