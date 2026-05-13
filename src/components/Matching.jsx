import React, { useEffect, useState, useRef, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resolveAccess } from 'utils/accessLevel';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import styled, { keyframes } from 'styled-components';
import { color } from './styles';
import {
  fetchUsersByLastLogin2,
  fetchUserById,
  fetchFavoriteUsers,
  fetchDislikeUsers,
  filterMain,
  searchUsersOnly,
  fetchUserComments,
  setUserComment,
  fetchUsersByIds,
  database,
  auth,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
} from './config';
import { get as firebaseGet, onValue as firebaseOnValue, ref as refDb, query, orderByChild, orderByKey, startAt, endAt, limitToLast } from 'firebase/database';
import { withAdminDownloadToast, wrapAdminOnValue } from 'utils/backendDownloadToast';

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { BtnFavorite } from './smallCard/btnFavorite';
import { BtnDislike } from './smallCard/btnDislike';
import { getCurrentValue } from './getCurrentValue';
import { fieldContactsIcons } from './smallCard/fieldContacts';
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';
import { useAutoResize } from '../hooks/useAutoResize';
import { getCacheKey, clearAllCardsCache, setFavoriteIds } from "../utils/cache";
import { normalizeQueryKey, getIdsByQuery, setIdsForQuery, getCard } from '../utils/cardIndex';
import { getCardsByList, updateCard } from '../utils/cardsStorage';
import { getCurrentDate } from './foramtDate';
import InfoModal from './InfoModal';
import { FaFilter, FaTimes, FaHeart, FaEllipsisV, FaDownload } from 'react-icons/fa';
import { handleEmptyFetch } from './loadMoreUtils';
import {
  normalizeCountry,
  normalizeRegion,
} from './normalizeLocation';
import { convertDriveLinkToImage } from '../utils/convertDriveLinkToImage';
import {
  cacheFavoriteUsers,
  syncFavorites,
  getFavorites,
} from '../utils/favoritesStorage';
import {
  cacheDislikedUsers,
  syncDislikes,
  getDislikes,
} from '../utils/dislikesStorage';
import {
  loadComments,
  saveComments,
  setLocalComment,
  pruneComments,
  shouldUseServerComment,
} from '../utils/commentsStorage';
import {
  parseAdditionalAccessRuleGroups,
} from 'utils/additionalAccessRules';
import {
  getIndexedNewUsersIdsByRules,
  normalizeSearchKeySetKeys,
} from 'utils/newUsersFilterSetsIndex';
import {
  MULTI_DATA_ACCESS_FIELD,
  parseMultiDataAccessUserIds,
  resolveMatchingMultiDataOwnerIds,
} from 'utils/multiDataAccess';
import {
  buildSharedReactionCandidateIds,
  canShowMatchingUser,
  mergeMatchingCandidateUsers,
  loadReactionCardsPageRecords,
  normalizeReactionMap,
  readReactionSnapshotMaps,
  resolvePrioritizedReactionMaps,
  shouldApplyReactionPageResult,
  uniqueTruthyReactionIds,
} from 'utils/reactionPriority';


const DEBUG_ADDITIONAL_MATCHING_USER_ID = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';
const DEBUG_SHARED_OWNER_ID = 'stFMfZ8CqQX05L8vK9Yse6FdYIh1';
const DEBUG_SHARED_NEW_USER_ID = 'ID0001';
const ADDITIONAL_PROFILE_CACHE_TTL_MS = 45 * 1000;
const ADDITIONAL_MATCHING_LOG_LIMIT = 300;
const buildEmptyReactionPagination = () => ({ ids: [], nextOffset: 0, hasMore: false });

const shouldDebugAdditionalMatching = (...ids) =>
  ids.some(id => String(id || '').trim() === DEBUG_ADDITIONAL_MATCHING_USER_ID);

const getAdditionalMatchingLogsStore = () => {
  if (typeof window === 'undefined') return null;
  if (!Array.isArray(window.__ADDITIONAL_MATCHING_LOGS)) {
    window.__ADDITIONAL_MATCHING_LOGS = [];
  }
  if (typeof window.downloadAdditionalMatchingLogs !== 'function') {
    window.downloadAdditionalMatchingLogs = () => {
      const now = new Date();
      const pad = value => String(value).padStart(2, '0');
      const fileStamp = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
      ].join('-') + `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const body = {
        userAgent: window.navigator?.userAgent || '',
        url: window.location?.href || '',
        timestamp: now.toISOString(),
        testUserId: DEBUG_ADDITIONAL_MATCHING_USER_ID,
        logs: Array.isArray(window.__ADDITIONAL_MATCHING_LOGS) ? window.__ADDITIONAL_MATCHING_LOGS : [],
      };
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `additional-matching-debug-${fileStamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    };
  }
  return window.__ADDITIONAL_MATCHING_LOGS;
};

const logAdditionalMatchingDebug = (accessUserId, stage, payload = {}, errors = null) => {
  if (!shouldDebugAdditionalMatching(accessUserId)) return;
  const store = getAdditionalMatchingLogsStore();
  if (!store) return;
  store.push({
    timestamp: new Date().toISOString(),
    stage,
    payload,
    errors: errors
      ? {
          message: errors.message || String(errors),
          stack: errors.stack || undefined,
          ...(errors && typeof errors === 'object' ? errors : {}),
        }
      : null,
  });
  if (store.length > ADDITIONAL_MATCHING_LOG_LIMIT) {
    store.splice(0, store.length - ADDITIONAL_MATCHING_LOG_LIMIT);
  }
};

const formatDebugToastValue = value => {
  if (Array.isArray(value)) {
    const preview = value.slice(0, 8).map(item => String(item)).join(', ');
    return `[${preview}${value.length > 8 ? ', …' : ''}] (${value.length})`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const preview = entries
      .slice(0, 6)
      .map(([entryKey, entryValue]) => `${entryKey}: ${Array.isArray(entryValue) ? `[${entryValue.slice(0, 4).join(', ')}]` : String(entryValue)}`)
      .join(', ');
    return `{${preview}${entries.length > 6 ? ', …' : ''}}`;
  }

  return String(value);
};

const debugAdditionalToast = (accessUserId, message, data = {}) => {
  if (!shouldDebugAdditionalMatching(accessUserId)) return;

  const compact = Object.entries(data)
    .map(([key, value]) => `${key}: ${formatDebugToastValue(value)}`)
    .join(', ');

  console.info('[ADD newUsers debug]', message, data, compact);
  logAdditionalMatchingDebug(accessUserId, message, data);
};


const summarizeIdsForDebug = (ids, limit = 25) => {
  const normalized = [...new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean))];
  return {
    count: normalized.length,
    ids: normalized.slice(0, limit),
    truncated: normalized.length > limit,
  };
};

const countTruthyReactionEntries = maps =>
  maps.reduce((total, map) => total + Object.keys(normalizeReactionMap(map)).length, 0);

const debugSharedReactionsLog = (viewerId, message, data = {}) => {
  if (!shouldDebugAdditionalMatching(viewerId)) return;
  console.info('[Matching][sharedReactions debug]', message, data);
};

const debugMissingNewUsersToast = (accessUserId, indexedCount) => {
  if (!shouldDebugAdditionalMatching(accessUserId) || indexedCount <= 0) return;

  logAdditionalMatchingDebug(accessUserId, 'missing fetched newUsers records', { indexedCount });
};

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'Matching',
    path: args[0],
  });

const onValue = wrapAdminOnValue(firebaseOnValue, {
  operation: 'onValue',
  source: 'Matching',
});

// Filter out users with invalid identifiers; Firebase push IDs are usually 20 chars.
const isValidId = id => typeof id === 'string' && id.length >= 20;

const ROLE_COLORS = {
  ed: { accent: '#c2185b', light: 'rgba(194,24,91,0.07)', border: 'rgba(194,24,91,0.22)', text: '#9c1057', tag: 'rgba(252,228,236,0.9)' },
  ag: { accent: '#1565c0', light: 'rgba(21,101,192,0.07)', border: 'rgba(21,101,192,0.22)', text: '#0d47a1', tag: 'rgba(227,242,253,0.9)' },
  ip: { accent: '#00695c', light: 'rgba(0,105,92,0.07)', border: 'rgba(0,105,92,0.22)', text: '#004d40', tag: 'rgba(224,242,241,0.9)' },
  sm: { accent: '#6a1b9a', light: 'rgba(106,27,154,0.07)', border: 'rgba(106,27,154,0.22)', text: '#4a148c', tag: 'rgba(243,229,245,0.9)' },
  cl: { accent: '#0277bd', light: 'rgba(2,119,189,0.07)', border: 'rgba(2,119,189,0.22)', text: '#01579b', tag: 'rgba(225,245,254,0.9)' },
};
const getRoleColors = role => ROLE_COLORS[role] || { accent: color.accent5, light: 'rgba(247,147,30,0.08)', border: 'rgba(247,147,30,0.25)', text: color.accent3, tag: 'rgba(255,243,224,0.9)' };
const isShortId = id => typeof id === 'string' && id.length > 0 && id.length < 20;
const isMatchingCardId = id => isValidId(id) || isShortId(id);
const isAllowedIdForCollection = (id, collection = 'users') =>
  collection === 'newUsers' ? isShortId(id) : isValidId(id);
const compareUsersByLastLogin2 = (a = {}, b = {}) =>
  (b.lastLogin2 || '').localeCompare(a.lastLogin2 || '');

const FETCH_USERS_BY_IDS_BATCH_SIZE = 100;

const ADDITIONAL_SEARCH_KEY_SET_PROFILE_FIELDS = [
  'searchKeySetsOfExactUser',
  'searchKeySetKeys',
  'searchKeySets',
  'additionalSearchKeySetKeys',
  'additionalAccessKeySets',
  'additionalAccessSearchKeySets',
  'keySets',
];

const getAdditionalSearchKeySetKeysFromProfile = profile =>
  normalizeSearchKeySetKeys(
    ADDITIONAL_SEARCH_KEY_SET_PROFILE_FIELDS.map(fieldName => profile?.[fieldName])
  );

const sortAdditionalSearchKeySetKeys = keys =>
  [...keys].sort((a, b) => {
    const ai = Number(String(a).split('_').pop()) || 0;
    const bi = Number(String(b).split('_').pop()) || 0;
    return ai - bi;
  });

const areSearchKeySetKeysForAccessUserId = (keys, accessUserId) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  const normalizedKeys = normalizeSearchKeySetKeys(keys);
  if (!normalizedAccessUserId || normalizedKeys.length === 0) return false;
  return normalizedKeys.every(key => String(key || '').startsWith(`${normalizedAccessUserId}_`));
};


const stableAdditionalSignature = value => {
  const normalize = input => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.keys(input)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, key) => {
          acc[key] = normalize(input[key]);
          return acc;
        }, {});
    }
    return input ?? '';
  };

  return JSON.stringify(normalize(value));
};

const getRawRulesSignature = rawRules => stableAdditionalSignature(String(rawRules || ''));
const getSearchKeySetsOfExactUserSignature = keys =>
  stableAdditionalSignature(sortAdditionalSearchKeySetKeys(normalizeSearchKeySetKeys(keys)));
async function resolveAdditionalSearchKeySetKeysForMatching(profile, accessUserId) {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  const keysFromProfile = getAdditionalSearchKeySetKeysFromProfile(profile);
  let keysFromSearchKeySetsRoot = [];

  debugAdditionalToast(normalizedAccessUserId, 'resolve keys: accessUserId', {
    accessUserId: normalizedAccessUserId,
  });
  debugAdditionalToast(normalizedAccessUserId, 'resolve keys: profile keys', {
    keysFromProfile,
  });

  if (!normalizedAccessUserId) {
    debugAdditionalToast(normalizedAccessUserId, 'resolve keys: final', {
      searchKeySetsOfExactUser: keysFromProfile,
    });
    return keysFromProfile;
  }

  if (keysFromProfile.length && areSearchKeySetKeysForAccessUserId(keysFromProfile, normalizedAccessUserId)) {
    debugAdditionalToast(normalizedAccessUserId, 'resolve keys: final', {
      searchKeySetsOfExactUser: keysFromProfile,
    });
    return keysFromProfile;
  }

  if (keysFromProfile.length) {
    debugAdditionalToast(normalizedAccessUserId, 'resolve keys: ignored profile keys for another owner', {
      keysFromProfile,
    });
  }

  const prefix = `${normalizedAccessUserId}_`;
  const snap = await get(query(refDb(database, 'searchKeySets'), orderByKey(), startAt(prefix), endAt(`${prefix}\uf8ff`)));
  if (snap.exists()) {
    keysFromSearchKeySetsRoot = Object.keys(snap.val() || {})
      .filter(key => key.startsWith(prefix));
  }
  logAdditionalMatchingDebug(normalizedAccessUserId, 'resolve searchKeySetsOfExactUser prefix lookup', {
    firebasePath: 'searchKeySets',
    prefix,
    searchKeySetsOfExactUser: keysFromSearchKeySetsRoot,
  });

  const searchKeySetKeys = sortAdditionalSearchKeySetKeys(normalizeSearchKeySetKeys(keysFromSearchKeySetsRoot));
  debugAdditionalToast(normalizedAccessUserId, 'resolve keys: root keys', {
    keysFromSearchKeySetsRoot,
  });
  debugAdditionalToast(normalizedAccessUserId, 'resolve keys: final', {
    searchKeySetsOfExactUser: searchKeySetKeys,
  });

  return searchKeySetKeys;
}

const fetchNewUsersByIdsForMatching = async (ids, batchSize = FETCH_USERS_BY_IDS_BATCH_SIZE) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const safeBatchSize = Math.max(1, Number(batchSize) || FETCH_USERS_BY_IDS_BATCH_SIZE);
  const result = [];
  let offset = 0;

  while (offset < uniqueIds.length) {
    const chunkIds = uniqueIds.slice(offset, offset + safeBatchSize);
    const chunkSnapshots = await Promise.all(
      chunkIds.map(async userId => {
        const snapshot = await get(refDb(database, `newUsers/${userId}`));
        if (!snapshot.exists()) return null;
        return {
          userId,
          ...(snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {}),
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

const fetchAdditionalNewUsersBySearchIndex = async ({
  rawRules,
  accessUserId,
  searchKeySetKeys,
  collectionSource = 'newUsers',
  offset = 0,
  limit = FETCH_USERS_BY_IDS_BATCH_SIZE,
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

  const indexed = await getIndexedNewUsersIdsByRules({
    rawRules,
    accessUserId: normalizedAccessUserId,
    searchKeySetsOfExactUser: searchKeySetKeys,
    fetchMissingBuckets: true,
    requireSearchKeySetKeys: collectionSource === 'newUsers',
    resultOffset: offset,
    resultLimit: limit,
    debugMatchingFlow: shouldDebugAdditionalMatching(normalizedAccessUserId),
    debugToast: (message, data) => debugAdditionalToast(normalizedAccessUserId, message, data),
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

  const users = await fetchNewUsersByIdsForMatching(userIds);
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

const isSameCursor = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.date === b.date && a.userId === b.userId;
};

const MATCHING_SEARCHKEY_FILTER_KEYS = ['userRole', 'maritalStatus', 'bloodGroup', 'rh', 'age'];

const isFilterGroupActive = group =>
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

const getMatchingFiltersWithoutSearchKeyGroups = filters => {
  const base = { ...(filters || {}) };
  MATCHING_SEARCHKEY_FILTER_KEYS.forEach(key => {
    delete base[key];
  });
  return base;
};

const applyMatchingSearchKeyFilters = (users, filters, roleIndexSets = null) => {
  const activeFilters = filters || {};
  const roleIndexFilterMeta = isFilterGroupActive(activeFilters.userRole)
    ? buildAllowedRoleIdsFromSearchKey(activeFilters.userRole, roleIndexSets)
    : null;

  return users.filter(user => {
    if (isFilterGroupActive(activeFilters.userRole)) {
      if (roleIndexFilterMeta && user?.userId && roleIndexFilterMeta.allIndexedIds.has(user.userId)) {
        if (!roleIndexFilterMeta.allowedIds.has(user.userId)) return false;
      } else {
      const category = toRoleCategory(user, roleIndexSets);
      if (!activeFilters.userRole[category]) return false;
      }
    }

    if (isFilterGroupActive(activeFilters.maritalStatus)) {
      const category = toMaritalStatusCategory(user);
      if (!activeFilters.maritalStatus[category]) return false;
    }

    if (isFilterGroupActive(activeFilters.bloodGroup)) {
      const category = toBloodGroupCategory(user);
      if (!activeFilters.bloodGroup[category]) return false;
    }

    if (isFilterGroupActive(activeFilters.rh)) {
      const category = toRhCategory(user);
      if (!activeFilters.rh[category]) return false;
    }

    if (isFilterGroupActive(activeFilters.age)) {
      const category = toAgeCategory(user);
      if (!activeFilters.age[category]) return false;
    }

    return true;
  });
};

const applyMatchingUiFiltersToUsers = ({
  users,
  filters,
  favoriteUsers,
  dislikeUsers,
  excludeReactionUsers = false,
  roleIndexSets,
  collectionSource,
}) =>
  applyMatchingSearchKeyFilters(
    filterMain(
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
  ).filter(u => isAllowedIdForCollection(u.userId, collectionSource));

const getActiveMatchingFiltersDebug = filters => Object.entries(filters || {}).reduce((acc, [key, value]) => {
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

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  background-color: #f5f5f5;
`;

const InnerContainer = styled.div`
  max-width: 480px;
  width: 100%;
  background-color: #f0f0f0;
  padding: 0;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-sizing: border-box;
  position: relative;

  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    background-color: #f5f5f5;
    box-shadow: 0 4px 8px #f5f5f5;
    border-radius: 0;
  }
`;


const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 10px;
  margin-bottom: 8px;
  justify-content: center;
`;

const LoadMoreFooter = styled.div`
  position: relative;
  z-index: 5;
  display: flex;
  justify-content: center;
  padding: 6px 12px 24px;
`;

const CardContainer = styled.div`
  position: relative;
  width: 100%;
`;

const STACK_CARD_RADIUS = '18px';

const NextPhoto = styled.img`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  box-sizing: border-box;
  border: 2px solid ${color.gray3};
  border-radius: ${STACK_CARD_RADIUS};
  transform: translate(4px, -4px);
  z-index: 1;
`;

const ThirdPhoto = styled.img`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  box-sizing: border-box;
  border: 2px solid ${color.gray4};
  border-radius: ${STACK_CARD_RADIUS};
  transform: translate(8px, -8px);
  z-index: 0;
`;

const NextInfoCard = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 2px solid ${color.gray3};
  border-radius: ${STACK_CARD_RADIUS};
  transform: translate(4px, -4px);
  z-index: 1;
  background: #fff;
  overflow: hidden;
`;

const ThirdInfoCard = styled(NextInfoCard)`
  border-color: ${color.gray4};
  transform: translate(8px, -8px);
  z-index: 0;
`;

const CardWrapper = styled.div`
  position: relative;
  width: 100%;
  border: 1px solid ${props => props.$role ? getRoleColors(props.$role).border : 'rgba(214, 193, 163, 0.35)'};
  border-top: 3px solid ${props => props.$role ? getRoleColors(props.$role).accent : color.accent5};
  border-radius: ${STACK_CARD_RADIUS};
  box-sizing: border-box;
  overflow: hidden;
  background: #fffdfa;
  box-shadow:
    0 14px 32px rgba(33, 26, 17, 0.12),
    0 2px 8px rgba(33, 26, 17, 0.06);
  z-index: 2;
`;

const CommentInput = styled.textarea`
  width: 100%;
  margin: 0;
  display: block;
  box-sizing: border-box;
  padding: 0 40px 0 10px;
  resize: none;
  overflow: hidden;
  height: 16px;
  min-height: 16px;
  line-height: 16px;
  border: ${props => (props.plain ? 'none' : `1px solid ${color.gray3}`)};
  border-radius: ${props => (props.plain ? '0' : '8px')};
  outline: ${props => (props.plain ? 'none' : 'auto')};
`;

const CommentBox = styled.div`
  position: relative;
  width: 100%;
`;

const SharedCommentText = styled.div`
  padding: 0 10px 3px;
  font-size: 12px;
  line-height: 1.25;
  color: ${color.gray1};
  font-style: italic;
  white-space: pre-wrap;
  word-break: break-word;
`;

const ResizableCommentInput = ({ value, onChange, onBlur, onClick, ...rest }) => {
  const ref = useRef(null);
  const autoResize = useAutoResize(ref, value);

  return (
    <CommentInput
      {...rest}
      rows={1}
      ref={ref}
      value={value}
      onClick={onClick}
      onChange={e => {
        onChange && onChange(e);
        autoResize(e.target);
      }}
      onBlur={onBlur}
    />
  );
};

const Card = styled.div`
  width: 100%;
  height: auto;
  aspect-ratio: ${({ $hasPhoto, $small }) =>
    $hasPhoto ? ($small ? '4 / 5' : '3 / 4') : 'auto'};
  min-height: ${({ $hasPhoto, $small, $compactWithoutPhoto }) =>
    !$hasPhoto && $compactWithoutPhoto ? ($small ? '180px' : '220px') : $small ? '260px' : '320px'};
  padding-bottom: 0;
  background: linear-gradient(180deg, #fffaf2 0%, #f8f5ef 100%);
  background-size: cover;
  background-position: center;
  border-radius: ${STACK_CARD_RADIUS};
  position: relative;
  overflow: hidden;
  box-shadow:
    0 10px 26px rgba(37, 29, 20, 0.14),
    0 0 0 1px rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.72);
  isolation: isolate;
  margin-bottom: 0;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 40%;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 0%, rgba(19, 15, 12, 0.58) 100%);
    pointer-events: none;
    z-index: 1;
  }
`;

const loadingWave = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
`;

const SkeletonCardInner = styled.div`
  position: relative;
  width: 100%;
  height: auto;
  aspect-ratio: ${({ $small }) => ($small ? '4 / 5' : '3 / 4')};
  min-height: ${({ $small }) => ($small ? '280px' : '340px')};
  overflow: hidden;
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 20%;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.5) 100%
    );
    pointer-events: none;
    z-index: 0;
  }
`;

const SkeletonPhoto = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='30' r='20' fill='%23ccc'/%3E%3Crect x='15' y='55' width='70' height='35' fill='%23ccc'/%3E%3C/svg%3E");
  background-size: cover;
  background-position: center;
  filter: blur(20px);
`;

const SkeletonInfo = styled.div`
  position: absolute;
  bottom: 55px;
  left: 10px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
`;

const SkeletonLine = styled.div`
  height: 12px;
  background: ${color.paleAccent3};
  opacity: 0.7;
  border-radius: 4px;
  width: ${({ $w }) => $w || '80%'};
  animation: ${loadingWave} 1.5s infinite;
  background-size: 200% 100%;
  background-image: linear-gradient(90deg, ${color.paleAccent2} 25%, ${color.paleAccent5} 50%, ${color.paleAccent2} 75%);
`;

const MatchingSkeleton = ({ $small }) => (
  <CardWrapper data-card data-skeleton>
    <SkeletonCardInner $small={$small}>
      <SkeletonPhoto />
      <SkeletonInfo>
        <SkeletonLine $w="60%" />
        <SkeletonLine $w="40%" />
        <SkeletonLine $w="50%" />
      </SkeletonInfo>
    </SkeletonCardInner>
  </CardWrapper>
);

const TopActions = styled.div`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 10px;
  z-index: 10;
`;

const ActionButton = styled.button`
  width: 35px;
  height: 35px;
  padding: 3px;
  border: none;
  background-color: ${color.accent5};
  color: white;
  border-radius: 50px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  &:disabled {
    background-color: ${color.gray3};
    color: ${color.gray4};
    cursor: default;
  }
`;

const HeaderContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
`;

const CardCount = styled.p`
  width: 100%;
  margin: 0;
  text-align: center;
  color: black;
`;

const LoadMoreButton = styled.button`
  margin: 0;
  border: none;
  border-radius: 8px;
  background-color: ${color.accent5};
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 16px;

  &:disabled {
    background-color: ${color.gray3};
    color: ${color.gray4};
    cursor: default;
  }
`;

const SubmitButton = styled.button`
  padding: 11px 14px;
  color: ${color.black};
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  align-self: flex-start;
  width: 100%;
  text-align: left;
  background: linear-gradient(180deg, ${color.oppositeAccent} 0%, #fffaf2 100%);
  box-shadow: inset 0 -1px 0 ${color.gray};
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${color.paleAccent2};
    border-color: ${color.paleAccent5};
    transform: translateY(-1px);
  }
`;

const ExitButton = styled(SubmitButton)`
  background: #fff;
  color: ${color.accent3};
  border-color: ${color.gray};

  &:hover {
    background-color: ${color.paleAccent2};
  }
`;

const FilterOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 15;
  display: ${props => (props.show ? 'block' : 'none')};
`;

const FilterContainer = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: 320px;
  max-width: 80%;
  background: #fff;
  z-index: 20;
  transform: translateX(${props => (props.show ? '0' : '100%')});
  transition: transform 0.3s ease-in-out;
  padding: 10px;
  overflow-y: auto;
`;

const FilterResetButton = styled.button`
  width: 100%;
  padding: 10px;
  margin: 0 0 10px;
  border: 1px solid ${color.gray3};
  border-radius: 8px;
  background: ${color.accent5};
  color: #fff;
  font-weight: 600;
  cursor: pointer;
`;
const CollectionSourceWrap = styled.div`
  margin: 0 0 10px;
  border: 1px solid ${color.gray3};
  border-radius: 8px;
  padding: 10px;
  background: #fff;
  color: #2c2d38;
`;
const CollectionSourceTitle = styled.p`
  margin: 0 0 8px;
  font-weight: 600;
  color: #2c2d38;
`;
const CollectionSourceLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  cursor: pointer;
  color: #2c2d38;

  input {
    accent-color: ${color.accent5};
  }
`;

// Components below were previously defined for a modal that is no longer
// rendered. They were causing "assigned a value but never used" warnings
// during builds, so the unused definitions have been removed.

const Title = styled.span`
  color: ${props => getRoleColors(props.$role).text};
  font-weight: 800;
  margin-bottom: 4px;
  margin-right: 4px;
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-size: 10px;
  background: ${props => getRoleColors(props.$role).tag};
  border: 1px solid ${props => getRoleColors(props.$role).border};
  border-radius: 8px;
  padding: 3px 8px;
`;

const HeaderIdentityRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
`;

const DonorName = styled.strong`
  display: inline-block;
  line-height: 1.2;
  color: #1f1f26;
  font-size: 18px;
  font-weight: 700;
`;

const ProfileSection = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
  padding-bottom: 8px;
`;

const Info = styled.div`
  flex: 1;
`;

const LocationLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-start;
  color: #6f7182;
  font-size: 12px;
`;

// Fields to display in the details modal
const FIELDS = [
  { key: 'height', label: 'Height (cm)' },
  { key: 'weight', label: 'Weight (kg)' },
  { key: 'bmi', label: 'BMI' },
  { key: 'clothingSize', label: 'Clothing size' },
  { key: 'shoeSize', label: 'Shoe size' },
  { key: 'blood', label: 'Rh' },
  { key: 'eyeColor', label: 'Eyes' },
  { key: 'glasses', label: 'Glasses' },
  { key: 'race', label: 'Race' },
  { key: 'hairColor', label: 'Hair color' },
  { key: 'hairStructure', label: 'Hair structure' },
  { key: 'chin', label: 'Chin' },
  { key: 'breastSize', label: 'Breast size' },
  { key: 'bodyType', label: 'Body type' },
  { key: 'maritalStatus', label: 'Marital status' },
  { key: 'ownKids', label: 'Own kids' },
  { key: 'faceShape', label: 'Face shape' },
  { key: 'noseShape', label: 'Nose shape' },
  { key: 'lipsShape', label: 'Lips shape' },
  { key: 'reward', label: 'Expected reward $' },
  { key: 'experience', label: 'Donation exp' },
];
const MAIN_INFO_FIELDS_LIMIT = 15;

const Table = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  row-gap: 5px;
  column-gap: 5px;
  font-size: 13px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  padding: 7px;

  & > div {
    line-height: 1.15;
    display: flex;
    flex-direction: column;
    background: #fbf9f5;
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    padding: 4px 7px;
  }

  & strong {
    font-size: 8px;
    color: ${props => props.$roleColor || color.accent3};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }

  & > div > span,
  & > div {
    color: #2f2f39;
    font-weight: 700;
  }
`;

const MoreInfo = styled.div`
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-left: 4px solid ${props => (props.$isAdmin ? '#ff6b6b' : '#f7931e')};
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
  font-size: 14px;
  white-space: pre-line;
  color: #3e3f4c;
`;

const Contact = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  font-size: 14px;
  border-top: ${props => (props.$withBorder ? `1px solid rgba(0, 0, 0, 0.08)` : 'none')};
  padding-top: ${props => (props.$withBorder ? '10px' : '0')};
  margin-top: ${props => (props.$withBorder ? '6px' : '0')};
`;

const Icons = styled.div`
  display: flex;
  gap: 5px;
  font-size: inherit;
  color: ${color.accent5};
  align-items: center;
  flex-wrap: wrap;

  & a {
    width: 30px !important;
    height: 30px !important;
    border-radius: 8px;
    background: rgba(247, 147, 30, 0.1);
    border: 1px solid rgba(247, 147, 30, 0.22) !important;
    transition: all 0.15s ease;
  }

  & a:hover {
    background: rgba(255, 108, 0, 0.18);
    border-color: rgba(255, 108, 0, 0.38) !important;
    transform: translateY(-1px);
  }

  & svg {
    width: 13px !important;
    height: 13px !important;
  }
`;

const BasicInfo = styled.div`
  position: absolute;
  bottom: 58px;
  left: 16px;
  right: 12px;
  text-align: left;
  color: #fff;
  font-weight: 700;
  text-shadow: 0 2px 14px rgba(16, 12, 8, 0.9);
  pointer-events: none;
  line-height: 1.2;
  font-size: 20px;
  z-index: 2;
`;

const CardInfo = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  width: calc(100% - 24px);
  padding: 10px 11px;
  background: rgba(255, 255, 255, 0.88);
  color: #2c2d38;
  font-size: 13px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  backdrop-filter: blur(8px);
`;

const RoleHeader = styled(Title)`
  margin-bottom: 2px;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
`;



const AdminToggle = styled.div`
  position: absolute;
  top: 5px;
  right: 5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${props => (props.published ? 'green' : 'red')};
  z-index: 10;
  cursor: pointer;
`;

const Id = styled.div`
  position: absolute;
  right: 10px;
  top: 0;
  z-index: 2;
  font-size: 12px;
  color: ${color.gray3};
  text-align: right;
  display: inline-block;
  padding-right: 4px;
`;


const InfoSlide = styled.div`
  width: 100%;
  height: auto;
  min-height: auto;
  background: ${props =>
    props.$role
      ? `linear-gradient(160deg, #fffdf8 0%, ${getRoleColors(props.$role).light} 100%)`
      : 'linear-gradient(180deg, #fffdf8 0%, #f6f2eb 100%)'};
  color: #2c2d38;
  overflow-y: visible;
  box-sizing: border-box;
  padding: 10px 12px;
  padding-bottom: ${({ $reserveActionButtons }) => ($reserveActionButtons ? '56px' : '10px')};
`;

const slideLeft = keyframes`
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
`;

const slideRight = keyframes`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`;

const AnimatedCard = styled(Card)`
  animation: ${({ $dir }) =>
    $dir === 'left'
      ? slideLeft
      : $dir === 'right'
      ? slideRight
      : 'none'} 0.3s ease;
`;

const SwipeableCard = ({
  user,
  photo,
  role,
  isAgency,
  nameParts,
  isAdmin,
  favoriteUsers,
  setFavoriteUsers,
  dislikeUsers,
  setDislikeUsers,
  ownFavoriteUsers,
  setOwnFavoriteUsers,
  ownDislikeUsers,
  setOwnDislikeUsers,
  viewMode,
  handleRemove,
  togglePublish,
  multiDataOwnerId,
}) => {
  const moreInfo = getCurrentValue(user.moreInfo_main);
  const profession = getCurrentValue(user.profession);
  const education = getCurrentValue(user.education);
  const { mainFields, extraFields } = splitSelectedFields(user, { isAdmin });
  const showDescriptionSlide = Boolean(
    moreInfo || profession || education || extraFields.length > 0
  );

  const slides = React.useMemo(() => {
    const photosArr = Array.isArray(user.photos)
      ? user.photos.filter(Boolean).map(convertDriveLinkToImage)
      : [getCurrentValue(user.photos)]
          .filter(Boolean)
          .map(convertDriveLinkToImage);
    let base;
    if (role === 'ag') {
      base = ['main'];
    } else {
      base = photo ? ['main', 'info'] : ['info'];
    }
    if (showDescriptionSlide) base.push('description');
    base.push(...photosArr.slice(1));
    return base;
  }, [user.photos, showDescriptionSlide, photo, role]);

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(null);
  const startX = useRef(null);
  const wasSwiped = useRef(false);

  const handleTouchStart = e => {
    if (slides.length <= 1) return;
    if (e.touches && e.touches.length > 0) {
      startX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = e => {
    if (slides.length <= 1) return;
    if (startX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - startX.current;
    if (deltaX > 50) {
      setDir('right');
      setIndex(i => (i - 1 + slides.length) % slides.length);
      wasSwiped.current = true;
      setTimeout(() => {
        wasSwiped.current = false;
      }, 50);
    } else if (deltaX < -50) {
      setDir('left');
      setIndex(i => (i + 1) % slides.length);
      wasSwiped.current = true;
      setTimeout(() => {
        wasSwiped.current = false;
      }, 50);
    }
    startX.current = null;
  };

  useEffect(() => {
    if (dir) {
      const t = setTimeout(() => setDir(null), 300);
      return () => clearTimeout(t);
    }
  }, [dir]);

  const handleClick = e => {
    if (wasSwiped.current) {
      wasSwiped.current = false;
      return;
    }
    if (slides.length > 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX > rect.width / 2) {
        setDir('left');
        setIndex(i => (i + 1) % slides.length);
      } else {
        setDir('right');
        setIndex(i => (i - 1 + slides.length) % slides.length);
      }
    }
  };

  const current = slides[index];
  const style =
    current === 'main'
      ? photo
        ? { backgroundImage: `url(${photo})`, backgroundColor: 'transparent' }
        : { backgroundColor: '#fff' }
      : current !== 'description' && current !== 'info'
      ? { backgroundImage: `url(${current})`, backgroundColor: 'transparent' }
      : { backgroundColor: '#fff' };

  const displayName = [
    getCurrentValue(user.name),
    getCurrentValue(user.surname),
  ]
    .filter(Boolean)
    .map(v => String(v).trim())
    .join(' ');
  const isEggDonor = (role || '').includes('ed');
  const contacts = fieldContactsIcons(user, { phoneAsIcon: true, iconSize: 16 });
  const selectedFields = mainFields;
  const regionInfo = normalizeRegion(getCurrentValue(user.region));
  const cityInfo = getCurrentValue(user.city);
  const locationInfo = isEggDonor
    ? regionInfo || ''
    : getCurrentValue(user.country)
    ? [
        normalizeCountry(getCurrentValue(user.country)),
        cityInfo || regionInfo,
      ]
        .filter(Boolean)
        .join(', ')
    : cityInfo || regionInfo;

  return (
    <AnimatedCard
      $dir={dir}
      $small={isAgency}
      $compactWithoutPhoto={!photo}
      $hasPhoto={!!photo}
      data-card
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={style}
    >
      {current === 'description' && (
        <InfoSlide $reserveActionButtons={!photo} $role={role}>
          {extraFields.length > 0 && <Table $roleColor={getRoleColors(role).text}>{extraFields}</Table>}
          {education && (
            <MoreInfo>
              <strong>Education</strong>
              <br />
              {education}
            </MoreInfo>
          )}
          {profession && (
            <MoreInfo>
              <strong>Profession</strong>
              <br />
              {profession}
            </MoreInfo>
          )}
          {moreInfo && (
            <MoreInfo>
              {moreInfo}
            </MoreInfo>
          )}
        </InfoSlide>
      )}
      {current === 'info' && (
        <InfoSlide $reserveActionButtons={!photo} $role={role}>
          {photo ? (
            <HeaderIdentityRow style={{ marginBottom: '8px' }}>
              <Title $role={role}>{getRoleTitle(user)}</Title>
              {contacts && <Icons style={{ marginLeft: 'auto' }}>{contacts}</Icons>}
            </HeaderIdentityRow>
          ) : (
            <ProfileSection>
              <Info>
                <HeaderIdentityRow>
                  <Title $role={role}>{getRoleTitle(user)}</Title>
                  <DonorName>{formatNameAndAge(user, displayName)}</DonorName>
                </HeaderIdentityRow>
                <LocationLine>
                  <span>{locationInfo}</span>
                  {isEggDonor && contacts && <Icons>{contacts}</Icons>}
                </LocationLine>
              </Info>
            </ProfileSection>
          )}
          {selectedFields.length > 0 && <Table $roleColor={getRoleColors(role).text}>{selectedFields}</Table>}
          {!isEggDonor && !photo && contacts && (
            <Contact $withBorder={selectedFields.length > 0}>
              <Icons>{contacts}</Icons>
            </Contact>
          )}
          {isEggDonor && photo && locationInfo && (
            <LocationLine style={{ marginTop: '4px', fontSize: '11px', opacity: 0.7 }}>
              <span>{locationInfo}</span>
            </LocationLine>
          )}
        </InfoSlide>
      )}
      {current === 'main' && role !== 'ag' && (
        <BasicInfo>
          {formatNameAndAge(user, displayName)}
          <br />
          {locationInfo}
        </BasicInfo>
      )}
      {(current === 'main' || (!photo && current === 'info')) && isAdmin && (
        <AdminToggle
          published={user.publish}
          onClick={e => {
            e.stopPropagation();
            togglePublish(user);
          }}
        />
      )}
      <BtnFavorite
        userId={user.userId}
        userData={user}
        favoriteUsers={favoriteUsers}
        setFavoriteUsers={setFavoriteUsers}
        ownFavoriteUsers={ownFavoriteUsers}
        setOwnFavoriteUsers={setOwnFavoriteUsers}
        dislikeUsers={dislikeUsers}
        setDislikeUsers={setDislikeUsers}
        ownDislikeUsers={ownDislikeUsers}
        setOwnDislikeUsers={setOwnDislikeUsers}
        onRemove={handleRemove}
        multiDataOwnerId={multiDataOwnerId}
      />
      <BtnDislike
        userId={user.userId}
        userData={user}
        dislikeUsers={dislikeUsers}
        setDislikeUsers={setDislikeUsers}
        ownDislikeUsers={ownDislikeUsers}
        setOwnDislikeUsers={setOwnDislikeUsers}
        favoriteUsers={favoriteUsers}
        setFavoriteUsers={setFavoriteUsers}
        ownFavoriteUsers={ownFavoriteUsers}
        setOwnFavoriteUsers={setOwnFavoriteUsers}
        onRemove={handleRemove}
        multiDataOwnerId={multiDataOwnerId}
      />
      {current === 'main' && isAgency && (
        <CardInfo>
          <HeaderRow>
            <RoleHeader $role={role}>{role === 'ag' ? 'Agency' : 'Couple'}</RoleHeader>
            {nameParts && <strong>{nameParts}</strong>}
          </HeaderRow>
          <LocationLine>
            {locationInfo && <span>{locationInfo}</span>}
            {contacts && <Icons>{contacts}</Icons>}
          </LocationLine>
        </CardInfo>
      )}
      {(current === 'info' || current === 'main') && null}
    </AnimatedCard>
  );
};

const normalizeOwnKidsValue = value => {
  const normalized = (value ?? '').toString().trim().toLowerCase();

  if (normalized === '') return value;

  if (['0', '-', 'no', 'ні', 'немає'].includes(normalized)) {
    return 'No';
  }

  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue) && numericValue >= 1) {
    return 'Yes';
  }

  return value;
};

const buildSelectedFields = (user, { isAdmin } = {}) => {
  return FIELDS.map(field => {
    if (field.key === 'reward' && !isAdmin) return null;

    let value = user[field.key];
    if (field.key === 'bmi') {
      const { weight, height } = user;
      if (weight && height) {
        value = Math.round((weight / (height * height)) * 10000);
      } else {
        value = null;
      }
    }

    value = getCurrentValue(value);

    if (field.key === 'maritalStatus') {
      const role = (user.userRole || '').toString().trim().toLowerCase();
      if (role === 'ed' && value) {
        const normalized = value.toString().trim().toLowerCase();
        if (
          ['yes', 'так', '+', 'married', 'заміжня', 'одружена'].includes(
            normalized
          )
        ) {
          value = 'Married';
        } else if (
          [
            'no',
            'ні',
            '-',
            'single',
            'unmarried',
            'незаміжня',
            'не заміжня',
          ].includes(normalized)
        ) {
          value = 'Single';
        }
      }
    }

    if (field.key === 'ownKids') {
      value = normalizeOwnKidsValue(value);
    }

    if (value === undefined || value === '' || value === null) return null;

    return (
      <div key={field.key}>
        <strong>{field.label}</strong>{' '}
        {String(value)}
      </div>
    );
  });
};

const splitSelectedFields = (user, { isAdmin } = {}) => {
  const allFields = buildSelectedFields(user, { isAdmin }).filter(Boolean);
  return {
    mainFields: allFields.slice(0, MAIN_INFO_FIELDS_LIMIT),
    extraFields: allFields.slice(MAIN_INFO_FIELDS_LIMIT),
  };
};

const getInfoSlidesCount = user => {
  const moreInfo = getCurrentValue(user.moreInfo_main);
  const profession = getCurrentValue(user.profession);
  const education = getCurrentValue(user.education);
  const { extraFields } = splitSelectedFields(user);
  const showDescriptionSlide = Boolean(
    moreInfo || profession || education || extraFields.length > 0
  );
  return 1 + (showDescriptionSlide ? 1 : 0);
};

const getRoleTitle = user => {
  const userRole = (user.userRole || '')
    .toString()
    .trim()
    .toLowerCase();
  const role = (user.userRole || user.role || '')
    .toString()
    .trim()
    .toLowerCase();

  if (role === 'ag') return 'Agency';
  if (role === 'ip') return 'Intended parents';
  if (role === 'ed') return 'Egg donor';
  if (!userRole) return 'Potential ED';
  return '';
};

const formatNameAndAge = (user, displayName) => {
  const age = user?.birth ? utilCalculateAge(user.birth) : '';
  const sourceCollection = user?.__sourceCollection || '';

  if (!displayName && age && sourceCollection === 'newUsers') {
    return `${age} years old`;
  }

  return `${displayName}${age ? `, ${age}` : ''}`;
};

const InfoCardContent = ({ user, variant, isAdmin }) => {
  const moreInfo = getCurrentValue(user.moreInfo_main);
  const profession = getCurrentValue(user.profession);
  const education = getCurrentValue(user.education);
  const { mainFields, extraFields } = splitSelectedFields(user, { isAdmin });

  const displayName = [
    getCurrentValue(user.name),
    getCurrentValue(user.surname),
  ]
    .filter(Boolean)
    .map(v => String(v).trim())
    .join(' ');
  const role = (user.userRole || user.role || '')
    .toString()
    .trim()
    .toLowerCase();
  const isEggDonor = role.includes('ed');
  const contacts = fieldContactsIcons(user, { phoneAsIcon: true, iconSize: 16 });
  const selectedFields = mainFields;
  const roleTitle = getRoleTitle(user);
  const regionInfo = normalizeRegion(getCurrentValue(user.region));
  const cityInfo = getCurrentValue(user.city);
  const locationInfo = isEggDonor
    ? regionInfo || ''
    : getCurrentValue(user.country)
    ? [
        normalizeCountry(getCurrentValue(user.country)),
        cityInfo || regionInfo,
      ]
        .filter(Boolean)
        .join(', ')
    : cityInfo || regionInfo;

  if (variant === 'description') {
    return (
      <InfoSlide $role={role}>
        {extraFields.length > 0 && <Table $roleColor={getRoleColors(role).text}>{extraFields}</Table>}
        {education && (
          <MoreInfo>
            <strong>Education</strong>
            <br />
            {education}
          </MoreInfo>
        )}
        {profession && (
          <MoreInfo>
            <strong>Profession</strong>
            <br />
            {profession}
          </MoreInfo>
        )}
        {moreInfo && <MoreInfo>{moreInfo}</MoreInfo>}
      </InfoSlide>
    );
  }

  return (
    <InfoSlide $role={role}>
      <ProfileSection>
        <Info>
          <HeaderIdentityRow>
            <Title $role={role}>{roleTitle}</Title>
            <DonorName>{formatNameAndAge(user, displayName)}</DonorName>
          </HeaderIdentityRow>
          <LocationLine>
            <span>{locationInfo}</span>
            {isEggDonor && contacts && <Icons>{contacts}</Icons>}
          </LocationLine>
        </Info>
      </ProfileSection>
      {selectedFields.length > 0 && <Table $roleColor={getRoleColors(role).text}>{selectedFields}</Table>}
      {!isEggDonor && contacts && (
        <Contact $withBorder={selectedFields.length > 0}>
          <Icons>{contacts}</Icons>
        </Contact>
      )}
    </InfoSlide>
  );
};


const INITIAL_LOAD = 6;
const LOAD_MORE = 6;
const ADDITIONAL_BACKFILL_MAX_PAGES = 3;
const SCROLL_Y_KEY = 'matchingScrollY';
const SEARCH_KEY = 'matchingSearchQuery';
const COLLECTION_SOURCE_KEY = 'matchingCollectionSource';

const fetchUsersByLastLogin2FromCollection = async (collection = 'users', limit = 9, lastDate) => {
  const usersRef = refDb(database, collection);
  const realLimit = limit + 1;
  const { todayDash } = getCurrentDate();
  const cursor =
    typeof lastDate === 'object' && lastDate !== null
      ? { date: lastDate.date || '', userId: lastDate.userId || '' }
      : { date: lastDate || '', userId: '' };

  let fetchLimit = realLimit;
  let entries = [];
  let snapshotSize = 0;

  while (entries.length < realLimit && fetchLimit <= 5000) {
    const q = cursor.date
      ? query(usersRef, orderByChild('lastLogin2'), endAt(cursor.date), limitToLast(fetchLimit))
      : query(usersRef, orderByChild('lastLogin2'), endAt(todayDash), limitToLast(fetchLimit));

    const snapshot = await get(q);
    if (!snapshot.exists()) {
      return { users: [], lastKey: null, hasMore: false };
    }

    entries = Object.entries(snapshot.val()).sort((a, b) => {
      const bDate = b[1].lastLogin2 || '';
      const aDate = a[1].lastLogin2 || '';
      const byDate = bDate.localeCompare(aDate);
      if (byDate !== 0) return byDate;
      return b[0].localeCompare(a[0]);
    });

    if (cursor.date) {
      entries = entries.filter(([id, data]) => {
        const date = data.lastLogin2 || '';
        if (date < cursor.date) return true;
        if (date > cursor.date) return false;
        return cursor.userId ? id.localeCompare(cursor.userId) < 0 : false;
      });
    }

    snapshotSize = Object.keys(snapshot.val()).length;
    if (entries.length >= realLimit || snapshotSize < fetchLimit) break;
    fetchLimit *= 2;
  }

  const hasMore = entries.length > limit;
  if (hasMore) entries = entries.slice(0, limit);
  const lastEntry = entries[entries.length - 1];

  return {
    users: entries.map(([id, data]) => ({ userId: id, ...data })),
    lastKey: lastEntry
      ? { date: lastEntry[1].lastLogin2 || '', userId: lastEntry[0] }
      : null,
    hasMore,
  };
};

const Matching = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const usersRef = useRef(users);
  const [lastKey, setLastKey] = useState(undefined);
  const [hasMore, setHasMore] = useState(true);
  // removed selected user modal logic
  const [favoriteUsers, setFavoriteUsers] = useState({});
  const [dislikeUsers, setDislikeUsers] = useState({});
  const [ownFavoriteUsers, setOwnFavoriteUsers] = useState({});
  const [ownDislikeUsers, setOwnDislikeUsers] = useState({});
  const [sharedReactionIds, setSharedReactionIds] = useState([]);
  const [sharedReactionCandidateUsers, setSharedReactionCandidateUsers] = useState([]);
  const [reactionPaginationByType, setReactionPaginationByType] = useState({
    favorites: buildEmptyReactionPagination(),
    dislikes: buildEmptyReactionPagination(),
  });
  const favoriteUsersRef = useRef(favoriteUsers);
  const dislikeUsersRef = useRef(dislikeUsers);
  const ownFavoriteUsersRef = useRef(ownFavoriteUsers);
  const ownDislikeUsersRef = useRef(ownDislikeUsers);
  const [viewMode, setViewMode] = useState('default');
  const viewModeRef = useRef(viewMode);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const filtersRef = useRef(filters);
  const [collectionSource, setCollectionSource] = useState(
    () => localStorage.getItem(COLLECTION_SOURCE_KEY) || 'users'
  );
  const defaultListKey = `default:${collectionSource}`;
  const [filterResetToken, setFilterResetToken] = useState(0);
  const [comments, setComments] = useState({});
  const [sharedComments, setSharedComments] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [ownerId, setOwnerId] = useState(null);
  const [multiDataOwnerIds, setMultiDataOwnerIds] = useState([]);
  const [currentAccessLevel, setCurrentAccessLevel] = useState(() => localStorage.getItem('accessLevel') || '');
  const [currentAdditionalAccessRules, setCurrentAdditionalAccessRules] = useState(
    () => localStorage.getItem('additionalAccessRules') || ''
  );
  const [currentSearchKeySetKeys, setCurrentSearchKeySetKeys] = useState(() =>
    normalizeSearchKeySetKeys(localStorage.getItem('additionalSearchKeySetKeys') || '')
  );
  const [additionalNewUsers, setAdditionalNewUsers] = useState([]);
  const additionalNewUsersRef = useRef(additionalNewUsers);
  const [additionalNextOffset, setAdditionalNextOffset] = useState(0);
  const [roleIndexSets] = useState(null);
  const access = resolveAccess({ uid: auth.currentUser?.uid, accessLevel: currentAccessLevel });
  const isAdmin = access.isAdmin;
  const parsedAdditionalAccessRules = useMemo(
    () => parseAdditionalAccessRuleGroups(currentAdditionalAccessRules),
    [currentAdditionalAccessRules]
  );
  const loadingRef = useRef(false);
  const loadedIdsRef = useRef(new Set());
  const reactionLoadedIdsRef = useRef({
    favorites: new Set(),
    dislikes: new Set(),
  });
  const additionalRulesToastRef = useRef('');
  const additionalProfileCacheRef = useRef(null);
  const additionalProfileRequestVersionRef = useRef(0);
  const additionalMatchingFetchVersionRef = useRef(0);
  const additionalLoadMoreFetchVersionRef = useRef(0);
  const additionalMatchingApplyVersionRef = useRef(0);
  const reactionLoadVersionRef = useRef(0);
  const matchingProfileStateRef = useRef({
    ownerId: null,
    collectionSource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
  });
  const resetAdditionalMatchingState = React.useCallback(({ resetHasMore = true, resetLoading = false } = {}) => {
    setAdditionalNewUsers([]);
    setAdditionalNextOffset(0);
    setLastKey(null);
    loadedIdsRef.current = new Set();
    additionalRulesToastRef.current = '';
    if (resetHasMore) setHasMore(true);
    if (resetLoading) {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);
  const resetReactionPaginationState = React.useCallback((reactionType = null) => {
    if (reactionType === 'favorites' || reactionType === 'dislikes') {
      reactionLoadedIdsRef.current[reactionType] = new Set();
      setReactionPaginationByType(prev => ({
        ...prev,
        [reactionType]: buildEmptyReactionPagination(),
      }));
      return;
    }

    reactionLoadedIdsRef.current = {
      favorites: new Set(),
      dislikes: new Set(),
    };
    setReactionPaginationByType({
      favorites: buildEmptyReactionPagination(),
      dislikes: buildEmptyReactionPagination(),
    });
  }, []);
  const invalidateReactionAsyncWork = React.useCallback(() => {
    reactionLoadVersionRef.current += 1;
    additionalLoadMoreFetchVersionRef.current += 1;
    additionalMatchingApplyVersionRef.current += 1;
    loadingRef.current = false;
    setLoading(false);
  }, []);
  const restoreRef = useRef(false);
  const scrollPositionRef = useRef(0);
  const saveScrollPosition = () => {
    sessionStorage.setItem(SCROLL_Y_KEY, String(scrollPositionRef.current));
  };
  const handleRemove = id => {
    setUsers(prev => prev.filter(u => u.userId !== id));
  };
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  useEffect(() => {
    localStorage.setItem(COLLECTION_SOURCE_KEY, collectionSource);
  }, [collectionSource]);
  useEffect(() => {
    matchingProfileStateRef.current = {
      ownerId,
      collectionSource,
      currentAdditionalAccessRules,
      currentSearchKeySetKeys,
    };
  }, [collectionSource, currentAdditionalAccessRules, currentSearchKeySetKeys, ownerId]);
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    const handleScroll = () => {
      scrollPositionRef.current = window.scrollY;
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      saveScrollPosition();
    };
  }, []);

  useLayoutEffect(() => {
    if (restoreRef.current || loading || users.length === 0) return;
    const savedY = sessionStorage.getItem(SCROLL_Y_KEY);
    if (savedY !== null) {
      requestAnimationFrame(() => {
        window.scrollTo(0, Number(savedY));
        restoreRef.current = true;
        sessionStorage.removeItem(SCROLL_Y_KEY);
      });
    }
  }, [loading, users]);

  const getOwnerId = () => auth.currentUser?.uid || localStorage.getItem('ownerId');
  const getMatchingMultiDataOwnerIds = React.useCallback(() => {
    const fallbackOwnerId = getOwnerId();
    const ids = multiDataOwnerIds.length ? multiDataOwnerIds : [fallbackOwnerId];
    return [...new Set(ids.filter(Boolean))];
  }, [multiDataOwnerIds]);
  const waitForOwnerId = () =>
    new Promise(resolve => {
      const check = () => {
        const ids = getMatchingMultiDataOwnerIds();
        if (ids.length) {
          resolve(ids);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

  const togglePublish = async user => {
    if (!isAdmin) return;
    const newValue = !user.publish;
    setUsers(prev =>
      prev.map(u =>
        u.userId === user.userId ? { ...u, publish: newValue } : u
      )
    );
    try {
      await updateDataInRealtimeDB(user.userId, { publish: newValue }, 'update');
      await updateDataInFiresoreDB(user.userId, { publish: newValue }, 'update');
    } catch (err) {
      console.error('Failed to toggle publish', err);
    }
  };

  const applySearchResults = async res => {
    const arr = Array.isArray(res) ? res : Object.values(res || {});
    const filtered = arr.filter(u => isValidId(u?.userId));
    setUsers(filtered);
    setHasMore(false);
    await loadCommentsFor(filtered);
    setLastKey(null);
    setViewMode('search');
  };

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    additionalNewUsersRef.current = additionalNewUsers;
  }, [additionalNewUsers]);

  useEffect(() => {
    favoriteUsersRef.current = favoriteUsers;
  }, [favoriteUsers]);

  useEffect(() => {
    dislikeUsersRef.current = dislikeUsers;
  }, [dislikeUsers]);

  useEffect(() => {
    ownFavoriteUsersRef.current = ownFavoriteUsers;
  }, [ownFavoriteUsers]);

  useEffect(() => {
    ownDislikeUsersRef.current = ownDislikeUsers;
  }, [ownDislikeUsers]);

  useEffect(() => {
    usersRef.current = users;
    const ids = [
      ...users.map(u => u.userId),
      ...sharedReactionCandidateUsers.map(u => u.userId),
    ];
    pruneComments(ids);
    setComments(prev => {
      const map = {};
      ids.forEach(id => {
        if (prev[id]) map[id] = prev[id];
      });
      return map;
    });
    setSharedComments(prev => {
      const map = {};
      ids.forEach(id => {
        if (prev[id]) map[id] = prev[id];
      });
      return map;
    });
  }, [sharedReactionCandidateUsers, users]);

  useEffect(() => {
    if (viewMode === 'favorites' || viewMode === 'dislikes') {
      return;
    }
    setUsers(prev =>
      prev.filter(
        u => !favoriteUsers[u.userId] && !dislikeUsers[u.userId]
      )
    );
  }, [favoriteUsers, dislikeUsers, viewMode]);



  const ensureFreshAdditionalMatchingProfile = React.useCallback(async ({ accessUserId, reason = 'additional-matching' } = {}) => {
    const state = matchingProfileStateRef.current || {};
    const normalizedAccessUserId = String(accessUserId || auth.currentUser?.uid || state.ownerId || '').trim();
    if (!normalizedAccessUserId) return null;

    const now = Date.now();
    const currentMetadata = {
      accessUserId: normalizedAccessUserId,
      rawRulesSignature: getRawRulesSignature(state.currentAdditionalAccessRules),
      searchKeySetsOfExactUserSignature: getSearchKeySetsOfExactUserSignature(state.currentSearchKeySetKeys),
      collectionSource: state.collectionSource,
    };
    const cached = additionalProfileCacheRef.current;
    const staleReasons = [];
    const paginationInvalidationReasons = [];

    if (!cached) staleReasons.push('missing-cache');
    if (cached && cached.accessUserId !== currentMetadata.accessUserId) {
      staleReasons.push('accessUserId-changed');
      paginationInvalidationReasons.push('accessUserId-changed');
    }
    if (cached && cached.rawRulesSignature !== currentMetadata.rawRulesSignature) {
      staleReasons.push('rawRulesSignature-changed');
      paginationInvalidationReasons.push('rawRulesSignature-changed');
    }
    if (cached && cached.searchKeySetsOfExactUserSignature !== currentMetadata.searchKeySetsOfExactUserSignature) {
      staleReasons.push('searchKeySetsOfExactUserSignature-changed');
      paginationInvalidationReasons.push('searchKeySetsOfExactUserSignature-changed');
    }
    if (cached && cached.collectionSource !== currentMetadata.collectionSource) {
      staleReasons.push('collectionSource-changed');
      paginationInvalidationReasons.push('collectionSource-changed');
    }
    if (cached && now - Number(cached.cachedAt || 0) > ADDITIONAL_PROFILE_CACHE_TTL_MS) staleReasons.push('ttl-expired');

    if (cached && staleReasons.length === 0) {
      logAdditionalMatchingDebug(normalizedAccessUserId, 'profile cache hit', {
        reason,
        cachedAt: cached.cachedAt,
        ttlMs: ADDITIONAL_PROFILE_CACHE_TTL_MS,
        metadata: currentMetadata,
        rawRules: cached.rawRules,
        searchKeySetsOfExactUser: cached.searchKeySetsOfExactUser,
      });
      return { ...cached, cacheHit: true, staleReasons: [], paginationInvalidationReasons: [] };
    }

    logAdditionalMatchingDebug(normalizedAccessUserId, 'profile cache miss/stale', {
      reason,
      staleReason: staleReasons,
      paginationInvalidationReasons,
      cachedAt: cached?.cachedAt || null,
      ttlMs: ADDITIONAL_PROFILE_CACHE_TTL_MS,
      metadata: currentMetadata,
    });

    const profileRequestVersion = additionalProfileRequestVersionRef.current + 1;
    additionalProfileRequestVersionRef.current = profileRequestVersion;
    const profilePath = `fetchUserById(${normalizedAccessUserId})`;
    try {
      const profile = await fetchUserById(normalizedAccessUserId) || {};
      const accessLevel = profile?.accessLevel || '';
      const additionalAccessRules = profile?.additionalAccessRules || '';
      const searchKeySetsOfExactUser = await resolveAdditionalSearchKeySetKeysForMatching(profile, normalizedAccessUserId);

      if (profileRequestVersion !== additionalProfileRequestVersionRef.current) {
        const latestCache = additionalProfileCacheRef.current;
        logAdditionalMatchingDebug(normalizedAccessUserId, 'ignored stale profile refetch', {
          firebasePath: profilePath,
          requestVersion: profileRequestVersion,
          latestVersion: additionalProfileRequestVersionRef.current,
          rawRules: additionalAccessRules,
          searchKeySetsOfExactUser,
        });
        return latestCache
          ? { ...latestCache, cacheHit: true, staleResponse: true, staleReasons, paginationInvalidationReasons: [] }
          : null;
      }
      const freshMetadata = {
        accessUserId: normalizedAccessUserId,
        rawRulesSignature: getRawRulesSignature(additionalAccessRules),
        searchKeySetsOfExactUserSignature: getSearchKeySetsOfExactUserSignature(searchKeySetsOfExactUser),
        collectionSource: state.collectionSource,
      };
      const confirmedPaginationInvalidationReasons = [];
      if (!cached) confirmedPaginationInvalidationReasons.push('missing-cache');
      if (cached && cached.accessUserId !== freshMetadata.accessUserId) confirmedPaginationInvalidationReasons.push('accessUserId-changed');
      if (cached && cached.rawRulesSignature !== freshMetadata.rawRulesSignature) confirmedPaginationInvalidationReasons.push('rawRulesSignature-changed');
      if (cached && cached.searchKeySetsOfExactUserSignature !== freshMetadata.searchKeySetsOfExactUserSignature) {
        confirmedPaginationInvalidationReasons.push('searchKeySetsOfExactUserSignature-changed');
      }
      if (cached && cached.collectionSource !== freshMetadata.collectionSource) confirmedPaginationInvalidationReasons.push('collectionSource-changed');

      const freshCache = {
        ...freshMetadata,
        profile,
        accessLevel,
        rawRules: additionalAccessRules,
        searchKeySetsOfExactUser,
        cachedAt: Date.now(),
        profilePath,
      };

      additionalProfileCacheRef.current = freshCache;
      matchingProfileStateRef.current = {
        ...matchingProfileStateRef.current,
        ownerId: normalizedAccessUserId,
        currentAdditionalAccessRules: additionalAccessRules,
        currentSearchKeySetKeys: searchKeySetsOfExactUser,
      };
      setCurrentAccessLevel(prev => (prev === accessLevel ? prev : accessLevel));
      setCurrentAdditionalAccessRules(prev => (prev === additionalAccessRules ? prev : additionalAccessRules));
      setCurrentSearchKeySetKeys(prev => (
        getSearchKeySetsOfExactUserSignature(prev) === getSearchKeySetsOfExactUserSignature(searchKeySetsOfExactUser)
          ? prev
          : searchKeySetsOfExactUser
      ));
      localStorage.setItem('accessLevel', accessLevel);
      localStorage.setItem('additionalAccessRules', additionalAccessRules);
      localStorage.setItem('additionalSearchKeySetKeys', searchKeySetsOfExactUser.join(','));
      setMultiDataOwnerIds(resolveMatchingMultiDataOwnerIds({ viewerId: normalizedAccessUserId, profile }));

      logAdditionalMatchingDebug(normalizedAccessUserId, 'profile refetched', {
        firebasePath: profilePath,
        rawRules: additionalAccessRules,
        searchKeySetsOfExactUser,
        metadata: freshMetadata,
        staleReasons,
        paginationInvalidationReasons: confirmedPaginationInvalidationReasons,
      });

      return {
        ...freshCache,
        cacheHit: confirmedPaginationInvalidationReasons.length === 0,
        refreshed: true,
        staleReasons,
        paginationInvalidationReasons: confirmedPaginationInvalidationReasons,
      };
    } catch (error) {
      logAdditionalMatchingDebug(normalizedAccessUserId, 'profile refetch failed', { firebasePath: profilePath }, error);
      throw error;
    }
  }, []);

  const loadCommentsFor = React.useCallback(async list => {
    const owners = getMatchingMultiDataOwnerIds();
    const ownOwnerId = getOwnerId();
    if (!owners.length || !ownOwnerId) return;
    const ids = Array.from(
      new Set([...usersRef.current.map(u => u.userId), ...list.map(u => u.userId)])
    );
    const cache = loadComments();
    const fetchedEntries = await Promise.all(
      owners.map(async owner => ({ owner, comments: await fetchUserComments(owner, ids) }))
    );
    const newStore = {};
    const commentsMap = {};
    const sharedCommentsMap = {};
    ids.forEach(id => {
      const ownEntry = fetchedEntries.find(entry => entry.owner === ownOwnerId);
      const ownComments = ownEntry?.comments?.[id] || [];
      const ownServer = [...ownComments].sort((a, b) => (b.lastAction || 0) - (a.lastAction || 0))[0];
      const local = cache[id];
      if (shouldUseServerComment(ownServer, local)) {
        newStore[id] = ownServer;
        commentsMap[id] = ownServer.text;
      } else if (local) {
        newStore[id] = local;
        commentsMap[id] = local.text;
      } else {
        commentsMap[id] = '';
      }

      sharedCommentsMap[id] = fetchedEntries
        .filter(entry => entry.owner !== ownOwnerId)
        .flatMap(entry => entry.comments?.[id] || [])
        .sort((a, b) => (b.lastAction || 0) - (a.lastAction || 0))
        .map(comment => String(comment.text || '').trim())
        .filter(Boolean);
    });
    const sharedOwnerIds = owners.filter(owner => owner !== ownOwnerId);
    const sharedCommentsCount = Object.values(sharedCommentsMap)
      .reduce((total, cardComments) => total + cardComments.length, 0);
    debugSharedReactionsLog(ownOwnerId, 'shared comments loaded', {
      ownerIds: owners,
      sharedOwnerIds,
      cardIds: summarizeIdsForDebug(ids),
      sharedCommentsCount,
      cardsWithSharedComments: summarizeIdsForDebug(
        Object.entries(sharedCommentsMap)
          .filter(([, cardComments]) => cardComments.length > 0)
          .map(([cardId]) => cardId)
      ),
    });
    saveComments(newStore);
    setComments(commentsMap);
    setSharedComments(sharedCommentsMap);
  }, [getMatchingMultiDataOwnerIds]);

  useEffect(() => {
    if (!users.length || !multiDataOwnerIds.length) return;
    loadCommentsFor(users);
  }, [loadCommentsFor, multiDataOwnerIds, users]);

  const loadSharedReactionCandidates = React.useCallback(async () => {
    const viewerId = ownerId || getOwnerId();
    if (viewMode === 'favorites' || viewMode === 'dislikes') {
      setSharedReactionCandidateUsers([]);
      return;
    }
    const candidateIds = [...new Set(sharedReactionIds.filter(Boolean))];
    debugSharedReactionsLog(viewerId, 'shared reaction ids found for candidate pool', {
      sharedReactionIds: summarizeIdsForDebug(candidateIds),
      collectionSource,
    });

    if (!viewerId || candidateIds.length === 0) {
      setSharedReactionCandidateUsers([]);
      return;
    }

    const filteredInvalidIds = candidateIds.filter(id => !isMatchingCardId(id));
    const filteredByCollectionIds = [];
    const filteredByAccessIds = [];
    let allowedNewUserIds = [];
    let indexedAllowedNewUserIds = null;

    if (collectionSource === 'newUsers') {
      const newUserCandidateIds = candidateIds.filter(isShortId);
      filteredByCollectionIds.push(...candidateIds.filter(id => !isShortId(id)));

      if (parsedAdditionalAccessRules.length > 0) {
        const resolvedSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(currentSearchKeySetKeys, viewerId)
          ? currentSearchKeySetKeys
          : await resolveAdditionalSearchKeySetKeysForMatching(null, viewerId);

        if (resolvedSearchKeySetKeys.length === 0) {
          filteredByAccessIds.push(...newUserCandidateIds);
        } else {
          const indexed = await getIndexedNewUsersIdsByRules({
            rawRules: currentAdditionalAccessRules,
            accessUserId: viewerId,
            searchKeySetKeys: resolvedSearchKeySetKeys,
            fetchMissingBuckets: true,
            requireSearchKeySetKeys: true,
            resultOffset: 0,
            resultLimit: Number.POSITIVE_INFINITY,
            debugMatchingFlow: shouldDebugAdditionalMatching(viewerId),
            debugToast: (message, data) => debugAdditionalToast(viewerId, message, data),
          });
          indexedAllowedNewUserIds = new Set(Array.isArray(indexed?.userIds) ? indexed.userIds : []);
          allowedNewUserIds = newUserCandidateIds.filter(id => indexedAllowedNewUserIds.has(id));
          filteredByAccessIds.push(...newUserCandidateIds.filter(id => !indexedAllowedNewUserIds.has(id)));
        }
      } else {
        allowedNewUserIds = newUserCandidateIds;
      }
    } else {
      filteredByCollectionIds.push(...candidateIds.filter(id => !isValidId(id)));
    }

    const loadedUsers = [];
    if (collectionSource === 'newUsers' && allowedNewUserIds.length > 0) {
      const newUsersCards = await fetchNewUsersByIdsForMatching(allowedNewUserIds);
      loadedUsers.push(
        ...newUsersCards.map(user => ({
          ...user,
          __matchingAccessAllowed: parsedAdditionalAccessRules.length > 0,
        }))
      );
    }

    if (collectionSource !== 'newUsers') {
      const userIds = candidateIds.filter(isValidId);
      if (userIds.length > 0) {
        const usersMap = await fetchUsersByIds(userIds);
        loadedUsers.push(
          ...userIds
            .map(id => usersMap[id])
            .filter(Boolean)
            .map(user => ({ ...user, __sourceCollection: 'users' }))
            .filter(user => canShowMatchingUser(user, { isAdmin }))
        );
      }
    }

    const loadedIds = new Set(loadedUsers.map(user => user.userId).filter(Boolean));
    const missingAllowedIds = collectionSource === 'newUsers'
      ? allowedNewUserIds.filter(id => !loadedIds.has(id))
      : candidateIds.filter(isValidId).filter(id => !loadedIds.has(id));

    loadedUsers.forEach(user => {
      const { __matchingAccessAllowed, ...cacheUser } = user;
      updateCard(user.userId, cacheUser);
    });
    setSharedReactionCandidateUsers(loadedUsers);
    await loadCommentsFor(loadedUsers);

    debugSharedReactionsLog(viewerId, 'shared reaction candidate pool resolved', {
      sharedReactionIds: summarizeIdsForDebug(candidateIds),
      addedToCandidatePool: summarizeIdsForDebug(loadedUsers.map(user => user.userId)),
      foundCollections: loadedUsers.map(user => ({
        userId: user.userId,
        collection: user.__sourceCollection || (isShortId(user.userId) ? 'newUsers' : 'users'),
      })),
      filteredInvalidIds: summarizeIdsForDebug(filteredInvalidIds),
      filteredByCollectionIds: summarizeIdsForDebug(filteredByCollectionIds),
      filteredByAccessOrSearchKeySets: summarizeIdsForDebug(filteredByAccessIds),
      missingAllowedCards: summarizeIdsForDebug(missingAllowedIds),
      allowedBySearchKeySetsCount: indexedAllowedNewUserIds ? indexedAllowedNewUserIds.size : null,
      id0001SelfCheck: {
        sharedReactionIdFound: candidateIds.includes(DEBUG_SHARED_NEW_USER_ID),
        allowedBySearchKeySets: collectionSource === 'newUsers'
          ? allowedNewUserIds.includes(DEBUG_SHARED_NEW_USER_ID)
          : null,
        filteredByAccessOrSearchKeySets: filteredByAccessIds.includes(DEBUG_SHARED_NEW_USER_ID),
        foundInCollection: loadedUsers.find(user => user.userId === DEBUG_SHARED_NEW_USER_ID)?.__sourceCollection || null,
        addedToCandidatePool: loadedIds.has(DEBUG_SHARED_NEW_USER_ID),
      },
    });
  }, [
    collectionSource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    loadCommentsFor,
    ownerId,
    isAdmin,
    parsedAdditionalAccessRules.length,
    sharedReactionIds,
    viewMode,
  ]);

  useEffect(() => {
    loadSharedReactionCandidates();
  }, [loadSharedReactionCandidates]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      if (user) {
        localStorage.setItem('ownerId', user.uid);
        setOwnerId(user.uid);
        const initialOwnerIds = resolveMatchingMultiDataOwnerIds({ viewerId: user.uid });
        setMultiDataOwnerIds(initialOwnerIds);
        debugSharedReactionsLog(user.uid, 'initial ownerIds before profile access load', {
          ownerIds: initialOwnerIds,
        });

        const syncAccessProfile = async () => {
          try {
            const profile = await fetchUserById(user.uid);
            const accessLevel = profile?.accessLevel || '';
            const additionalAccessRules = profile?.additionalAccessRules || '';
            const searchKeySetKeys = await resolveAdditionalSearchKeySetKeysForMatching(profile, user.uid);

            console.info('[Matching][additionalNewUsers] resolvedSearchKeySetKeys', searchKeySetKeys);

            setCurrentAccessLevel(accessLevel);
            setCurrentAdditionalAccessRules(additionalAccessRules);
            setCurrentSearchKeySetKeys(searchKeySetKeys);
            localStorage.setItem('accessLevel', accessLevel);
            localStorage.setItem('additionalAccessRules', additionalAccessRules);
            localStorage.setItem('additionalSearchKeySetKeys', searchKeySetKeys.join(','));
            const accessOwnerIds = parseMultiDataAccessUserIds(profile?.[MULTI_DATA_ACCESS_FIELD]);
            const resolvedOwnerIds = resolveMatchingMultiDataOwnerIds({ viewerId: user.uid, profile });
            debugSharedReactionsLog(user.uid, 'ownerIds read from multiDataAccessUserIds', {
              multiDataAccessUserIds: accessOwnerIds,
              ownerIds: resolvedOwnerIds,
              paths: accessOwnerIds.map(sharedOwnerId => ({
                favorites: `multiData/favorites/${sharedOwnerId}`,
                dislikes: `multiData/dislikes/${sharedOwnerId}`,
                comments: `multiData/comments/${sharedOwnerId}`,
              })),
            });
            setMultiDataOwnerIds(resolvedOwnerIds);
            const freshCache = await ensureFreshAdditionalMatchingProfile({
              accessUserId: user.uid,
              reason: 'auth-state-sync',
            });

            console.info('[Matching][additionalNewUsers] resolvedSearchKeySetsOfExactUser', freshCache?.searchKeySetsOfExactUser || []);
          } catch (error) {
            console.error('Failed to refresh access profile on Matching', error);
            const cachedAccessLevel = localStorage.getItem('accessLevel') || '';
            const cachedAdditionalAccessRules = localStorage.getItem('additionalAccessRules') || '';
            const cachedSearchKeySetKeys = normalizeSearchKeySetKeys(localStorage.getItem('additionalSearchKeySetKeys') || '');
            const fallbackSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(cachedSearchKeySetKeys, user.uid)
              ? cachedSearchKeySetKeys
              : await resolveAdditionalSearchKeySetKeysForMatching(null, user.uid);
            console.info('[Matching][additionalNewUsers] resolvedSearchKeySetsOfExactUser', fallbackSearchKeySetKeys);
            setCurrentAccessLevel(cachedAccessLevel);
            setCurrentAdditionalAccessRules(cachedAdditionalAccessRules);
            setCurrentSearchKeySetKeys(fallbackSearchKeySetKeys);
          }
        };

        syncAccessProfile();
      } else {
        localStorage.removeItem('ownerId');
        localStorage.removeItem('accessLevel');
        localStorage.removeItem('additionalAccessRules');
        localStorage.removeItem('additionalSearchKeySetKeys');
        setOwnerId('');
        setMultiDataOwnerIds([]);
        setFavoriteUsers({});
        setDislikeUsers({});
        setOwnFavoriteUsers({});
        setOwnDislikeUsers({});
        setSharedReactionIds([]);
        setSharedReactionCandidateUsers([]);
        setSharedComments({});
        setCurrentAccessLevel('');
        setCurrentAdditionalAccessRules('');
        setCurrentSearchKeySetKeys([]);
        resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
        return;
      }

      const { todayDash } = getCurrentDate();
      updateDataInNewUsersRTDB(user.uid, { lastLogin2: todayDash }, 'update');

    });

    return () => {
      unsubscribeAuth();
    };
  }, [ensureFreshAdditionalMatchingProfile, resetAdditionalMatchingState]);

  useEffect(() => {
    const ownerIds = getMatchingMultiDataOwnerIds();
    if (!ownerIds.length) return undefined;

    const favoriteSnapshots = {};
    const dislikeSnapshots = {};
    const loadedFavoriteOwnerIds = new Set();
    const loadedDislikeOwnerIds = new Set();
    const applyPrioritizedReactionMaps = () => {
      const ownOwnerId = getOwnerId();
      const hasLoadedOwnReactionSnapshots =
        ownOwnerId &&
        loadedFavoriteOwnerIds.has(ownOwnerId) &&
        loadedDislikeOwnerIds.has(ownOwnerId);
      if (!hasLoadedOwnReactionSnapshots) return;
      const availableOwnerIds = ownerIds.filter(ownerId => (
        ownerId === ownOwnerId ||
        (loadedFavoriteOwnerIds.has(ownerId) && loadedDislikeOwnerIds.has(ownerId))
      ));
      const sharedOwnerIds = availableOwnerIds.filter(id => id !== ownOwnerId);
      const { favorites, dislikes } = resolvePrioritizedReactionMaps({
        ownerIds: availableOwnerIds,
        ownOwnerId,
        favoriteSnapshots,
        dislikeSnapshots,
      });
      const ownFavorites = normalizeReactionMap(favoriteSnapshots[ownOwnerId]);
      const ownDislikes = normalizeReactionMap(dislikeSnapshots[ownOwnerId]);
      const nextSharedReactionIds = buildSharedReactionCandidateIds({
        ownerIds: availableOwnerIds,
        ownOwnerId,
        favoriteSnapshots,
        dislikeSnapshots,
        favorites,
        dislikes,
      });
      debugSharedReactionsLog(ownOwnerId, 'priority merge applied for shared reactions', {
        ownerIds,
        availableOwnerIds,
        sharedOwnerIds,
        sharedFavoritesFound: countTruthyReactionEntries(
          sharedOwnerIds.map(sharedOwnerId => favoriteSnapshots[sharedOwnerId])
        ),
        sharedDislikesFound: countTruthyReactionEntries(
          sharedOwnerIds.map(sharedOwnerId => dislikeSnapshots[sharedOwnerId])
        ),
        sharedFavoriteIdsFound: summarizeIdsForDebug(
          uniqueTruthyReactionIds(sharedOwnerIds.map(sharedOwnerId => favoriteSnapshots[sharedOwnerId]))
        ),
        sharedDislikeIdsFound: summarizeIdsForDebug(
          uniqueTruthyReactionIds(sharedOwnerIds.map(sharedOwnerId => dislikeSnapshots[sharedOwnerId]))
        ),
        sharedReactionIdsFound: summarizeIdsForDebug(nextSharedReactionIds),
        ownFavoritesFound: Object.keys(ownFavorites).length,
        ownDislikesFound: Object.keys(ownDislikes).length,
        appliedFavorites: summarizeIdsForDebug(Object.keys(favorites)),
        appliedDislikes: summarizeIdsForDebug(Object.keys(dislikes)),
        id0001SelfCheck: {
          hasAccessToSharedOwner: ownerIds.includes(DEBUG_SHARED_OWNER_ID),
          sharedOwnerDislikesId0001: Boolean(normalizeReactionMap(dislikeSnapshots[DEBUG_SHARED_OWNER_ID])[DEBUG_SHARED_NEW_USER_ID]),
          viewerOwnLikeId0001: Boolean(ownFavorites[DEBUG_SHARED_NEW_USER_ID]),
          viewerOwnDislikeId0001: Boolean(ownDislikes[DEBUG_SHARED_NEW_USER_ID]),
          appliedAsLiked: Boolean(favorites[DEBUG_SHARED_NEW_USER_ID]),
          appliedAsDisliked: Boolean(dislikes[DEBUG_SHARED_NEW_USER_ID]),
          requestedForCandidatePool: nextSharedReactionIds.includes(DEBUG_SHARED_NEW_USER_ID),
        },
      });
      ownFavoriteUsersRef.current = ownFavorites;
      ownDislikeUsersRef.current = ownDislikes;
      favoriteUsersRef.current = favorites;
      dislikeUsersRef.current = dislikes;
      setOwnFavoriteUsers(ownFavorites);
      setOwnDislikeUsers(ownDislikes);
      setSharedReactionIds(nextSharedReactionIds);
      setFavoriteUsers(favorites);
      syncFavorites(favorites);
      setDislikeUsers(dislikes);
      syncDislikes(dislikes);
    };

    const unsubs = ownerIds.flatMap(effectiveOwnerId => {
      const favRef = refDb(database, `multiData/favorites/${effectiveOwnerId}`);
      const disRef = refDb(database, `multiData/dislikes/${effectiveOwnerId}`);

      const markOwnerSnapshotLoaded = (snapshotStore, loadedOwnerIds, type, error) => {
        snapshotStore[effectiveOwnerId] = {};
        loadedOwnerIds.add(effectiveOwnerId);
        if (error) {
          debugSharedReactionsLog(getOwnerId(), `shared ${type} snapshot unavailable`, {
            ownerId: effectiveOwnerId,
            type,
            message: error.message || String(error),
          }, error);
        }
        applyPrioritizedReactionMaps();
      };

      const unsubFav = onValue(favRef, snap => {
        favoriteSnapshots[effectiveOwnerId] = snap.exists() ? snap.val() : {};
        loadedFavoriteOwnerIds.add(effectiveOwnerId);
        applyPrioritizedReactionMaps();
      }, error => markOwnerSnapshotLoaded(favoriteSnapshots, loadedFavoriteOwnerIds, 'favorites', error));
      const unsubDis = onValue(disRef, snap => {
        dislikeSnapshots[effectiveOwnerId] = snap.exists() ? snap.val() : {};
        loadedDislikeOwnerIds.add(effectiveOwnerId);
        applyPrioritizedReactionMaps();
      }, error => markOwnerSnapshotLoaded(dislikeSnapshots, loadedDislikeOwnerIds, 'dislikes', error));

      return [unsubFav, unsubDis];
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [getMatchingMultiDataOwnerIds]);

  useEffect(() => {
    let cancelled = false;
    const fetchVersion = additionalMatchingFetchVersionRef.current + 1;
    const applyVersion = additionalMatchingApplyVersionRef.current + 1;
    additionalMatchingFetchVersionRef.current = fetchVersion;
    additionalMatchingApplyVersionRef.current = applyVersion;
    const isLatestAdditionalFetch = () => (
      !cancelled &&
      fetchVersion === additionalMatchingFetchVersionRef.current &&
      applyVersion === additionalMatchingApplyVersionRef.current
    );

    const loadAdditionalNewUsers = async () => {
      if (collectionSource !== 'newUsers') {
        if (isLatestAdditionalFetch()) {
          resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
        }
        return;
      }

      try {
        const freshProfileCache = await ensureFreshAdditionalMatchingProfile({
          accessUserId: ownerId,
          reason: 'initial-additional-newUsers-load',
        });
        if (!isLatestAdditionalFetch()) {
          logAdditionalMatchingDebug(ownerId, 'ignored stale initial additional profile result', {
            fetchVersion,
            latestFetchVersion: additionalMatchingFetchVersionRef.current,
            applyVersion,
            latestApplyVersion: additionalMatchingApplyVersionRef.current,
          });
          return;
        }
        const freshRawRules = freshProfileCache?.rawRules ?? currentAdditionalAccessRules;
        const freshParsedAdditionalAccessRules = parseAdditionalAccessRuleGroups(freshRawRules);

        if (!freshParsedAdditionalAccessRules || freshParsedAdditionalAccessRules.length === 0) {
          if (isLatestAdditionalFetch()) {
            resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
          }
          return;
        }

        if (!isLatestAdditionalFetch()) return;
        resetAdditionalMatchingState({ resetHasMore: true });
        loadingRef.current = true;
        setLoading(true);

        const resolvedSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(
          freshProfileCache?.searchKeySetsOfExactUser || currentSearchKeySetKeys,
          ownerId
        )
          ? (freshProfileCache?.searchKeySetsOfExactUser || currentSearchKeySetKeys)
          : await resolveAdditionalSearchKeySetKeysForMatching(null, ownerId);

        if (!isLatestAdditionalFetch()) {
          logAdditionalMatchingDebug(ownerId, 'ignored stale initial additional key resolution', {
            fetchVersion,
            latestFetchVersion: additionalMatchingFetchVersionRef.current,
            applyVersion,
            latestApplyVersion: additionalMatchingApplyVersionRef.current,
          });
          return;
        }

        console.info('[Matching][additionalNewUsers] resolvedSearchKeySetsOfExactUser', resolvedSearchKeySetKeys);
        logAdditionalMatchingDebug(ownerId, 'initial additional matching request', {
          rawRules: freshRawRules,
          searchKeySetsOfExactUser: resolvedSearchKeySetKeys,
          collectionSource,
          filtersSignature: stableAdditionalSignature(filtersRef.current || {}),
          pagination: { offset: 0, limit: INITIAL_LOAD },
        });

        const loaded = await fetchAdditionalNewUsersBySearchIndex({
          parsedRuleGroups: freshParsedAdditionalAccessRules,
          rawRules: freshRawRules,
          accessUserId: ownerId,
          searchKeySetKeys: resolvedSearchKeySetKeys,
          collectionSource,
          offset: 0,
          limit: INITIAL_LOAD,
        });

        if (!isLatestAdditionalFetch()) {
          logAdditionalMatchingDebug(ownerId, 'ignored stale initial additional fetch result', {
            fetchVersion,
            latestFetchVersion: additionalMatchingFetchVersionRef.current,
            applyVersion,
            latestApplyVersion: additionalMatchingApplyVersionRef.current,
            fetchedIds: loaded?.userIds || [],
          });
          return;
        }

        if (isLatestAdditionalFetch()) {
          setAdditionalNewUsers(loaded.users);
          setAdditionalNextOffset(loaded.nextOffset);
          loadedIdsRef.current = new Set(loaded.users.map(user => user.userId).filter(Boolean));
          setHasMore(loaded.hasMore);
          setLastKey(null);
          logAdditionalMatchingDebug(ownerId, 'initial additional matching final cards', {
            fetchedIds: loaded.userIds,
            filteredIds: loaded.users.map(user => user.userId).filter(Boolean),
            pagination: { nextOffset: loaded.nextOffset, hasMore: loaded.hasMore },
            finalCardsCount: loaded.users.length,
          });
          await loadCommentsFor(loaded.users);
          const toastSignature = `${currentAdditionalAccessRules}::${loaded.nextOffset}${loaded.hasMore ? '+' : ''}`;
          if (additionalRulesToastRef.current !== toastSignature) {
            toast(
              `Додаткові правила доступу (newUsers): завантажено ${loaded.nextOffset}${loaded.hasMore ? '+' : ''} карточок для matching.`,
              { icon: 'ℹ️' }
            );
            additionalRulesToastRef.current = toastSignature;
          }
        }
      } catch (error) {
        console.error('Failed to load additional newUsers for matching', error);
        if (isLatestAdditionalFetch() && additionalNewUsersRef.current.length === 0) {
          resetAdditionalMatchingState({ resetHasMore: false });
          setHasMore(false);
        }
      } finally {
        if (isLatestAdditionalFetch()) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    };

    loadAdditionalNewUsers();

    return () => {
      cancelled = true;
    };
  }, [
    collectionSource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    ensureFreshAdditionalMatchingProfile,
    loadCommentsFor,
    ownerId,
    resetAdditionalMatchingState,
  ]);

  const fetchChunk = React.useCallback(
    async (
      limit,
      lastDate,
      exclude = new Set(),
      onPart
    ) => {
      const collected = [];
      let cursor = lastDate;
      let hasMore = false;
      let excludedCount = 0;
      let prevCursor;

      while (collected.length < limit) {
        if (collectionSource === 'newUsers' && parsedAdditionalAccessRules.length > 0) {
          break;
        }

        const remaining = limit - collected.length;
        const sourceRes =
          collectionSource === 'newUsers'
            ? await fetchUsersByLastLogin2FromCollection('newUsers', remaining + exclude.size + 1, cursor)
            : await fetchUsersByLastLogin2(remaining + exclude.size + 1, cursor);

        const activeFilters = filtersRef.current || {};
        const filtered = isAdmin
          ? applyMatchingSearchKeyFilters(
              filterMain(
                sourceRes.users.map(u => [u.userId, u]),
                null,
                getMatchingFiltersWithoutSearchKeyGroups(activeFilters),
                favoriteUsersRef.current,
                dislikeUsersRef.current
              ).map(([, u]) => u),
              activeFilters,
              roleIndexSets
            ).filter(
              u => isAllowedIdForCollection(u.userId, collectionSource) && !exclude.has(u.userId)
            )
          : sourceRes.users.filter(
              u => isAllowedIdForCollection(u.userId, collectionSource) && !exclude.has(u.userId)
            );

        excludedCount += sourceRes.users.length - filtered.length;
        const slice = filtered.slice(0, remaining);
        const ids = slice.map(user => user.userId);
        const enrichedMap = await fetchUsersByIds(ids);
        const validSlice = ids
          .map(id => enrichedMap[id])
          .filter(Boolean)
          .map(user => ({
            ...user,
            __sourceCollection: collectionSource === 'newUsers' ? 'newUsers' : 'users',
          }));

        if (validSlice.length) {
          collected.push(...validSlice);
          if (onPart) await onPart(validSlice);
        }

        hasMore = sourceRes.hasMore;
        prevCursor = cursor;
        cursor = sourceRes.lastKey;

        if (!sourceRes.hasMore || !sourceRes.lastKey || isSameCursor(prevCursor, cursor)) {
          break;
        }
      }

      return {
        users: collected,
        lastKey: cursor,
        hasMore,
        excludedCount,
      };
    },
    [collectionSource, isAdmin, parsedAdditionalAccessRules.length, roleIndexSets]
  );

  const loadInitial = React.useCallback(async () => {
    console.log('[loadInitial] start');
    loadingRef.current = true;
    const startMode = viewModeRef.current;
    setLoading(true);
    if (startMode !== 'default') {
      loadingRef.current = false;
      setLoading(false);
      return;
    }
    setUsers([]); // clear previous list to avoid caching wrong data
    loadedIdsRef.current = new Set();
    try {
      const owners = getMatchingMultiDataOwnerIds();
      let exclude = new Set();
      if (owners.length) {
        const { favoriteSnapshots, dislikeSnapshots } = await readReactionSnapshotMaps({
          ownerIds: owners,
          fetchFavoriteUsers,
          fetchDislikeUsers,
          onWarning: warning => debugSharedReactionsLog(getOwnerId(), 'initial shared reaction snapshot unavailable', warning, warning.error),
        });
        const ownOwnerId = getOwnerId();
        const { favorites: favIds, dislikes: disIds } = resolvePrioritizedReactionMaps({
          ownerIds: owners,
          ownOwnerId,
          favoriteSnapshots,
          dislikeSnapshots,
        });
        const ownFavorites = normalizeReactionMap(favoriteSnapshots[ownOwnerId]);
        const ownDislikes = normalizeReactionMap(dislikeSnapshots[ownOwnerId]);
        const nextSharedReactionIds = buildSharedReactionCandidateIds({
          ownerIds: owners,
          ownOwnerId,
          favoriteSnapshots,
          dislikeSnapshots,
          favorites: favIds,
          dislikes: disIds,
        });
        const sharedOwnerIds = owners.filter(id => id !== ownOwnerId);
        debugSharedReactionsLog(ownOwnerId, 'initial shared reaction ids found', {
          ownerIds: owners,
          sharedFavoriteIdsFound: summarizeIdsForDebug(
            uniqueTruthyReactionIds(sharedOwnerIds.map(sharedOwnerId => favoriteSnapshots[sharedOwnerId]))
          ),
          sharedDislikeIdsFound: summarizeIdsForDebug(
            uniqueTruthyReactionIds(sharedOwnerIds.map(sharedOwnerId => dislikeSnapshots[sharedOwnerId]))
          ),
          sharedReactionIdsFound: summarizeIdsForDebug(nextSharedReactionIds),
          id0001SelfCheck: {
            hasAccessToSharedOwner: owners.includes(DEBUG_SHARED_OWNER_ID),
            sharedOwnerDislikesId0001: Boolean(normalizeReactionMap(dislikeSnapshots[DEBUG_SHARED_OWNER_ID])[DEBUG_SHARED_NEW_USER_ID]),
            viewerOwnLikeId0001: Boolean(ownFavorites[DEBUG_SHARED_NEW_USER_ID]),
            viewerOwnDislikeId0001: Boolean(ownDislikes[DEBUG_SHARED_NEW_USER_ID]),
            appliedAsLiked: Boolean(favIds[DEBUG_SHARED_NEW_USER_ID]),
            appliedAsDisliked: Boolean(disIds[DEBUG_SHARED_NEW_USER_ID]),
            requestedForCandidatePool: nextSharedReactionIds.includes(DEBUG_SHARED_NEW_USER_ID),
          },
        });
        ownFavoriteUsersRef.current = ownFavorites;
        ownDislikeUsersRef.current = ownDislikes;
        favoriteUsersRef.current = favIds;
        dislikeUsersRef.current = disIds;
        setOwnFavoriteUsers(ownFavorites);
        setOwnDislikeUsers(ownDislikes);
        setSharedReactionIds(nextSharedReactionIds);
        setFavoriteUsers(favIds);
        setDislikeUsers(disIds);
        syncFavorites(favIds);
        syncDislikes(disIds);
        exclude = new Set([
          ...Object.keys(favIds),
          ...Object.keys(disIds),
        ]);
      } else {
        const localFav = getFavorites();
        const localDis = getDislikes();
        if (Object.keys(localFav).length || Object.keys(localDis).length) {
          ownFavoriteUsersRef.current = localFav;
          ownDislikeUsersRef.current = localDis;
          favoriteUsersRef.current = localFav;
          dislikeUsersRef.current = localDis;
          setOwnFavoriteUsers(localFav);
          setOwnDislikeUsers(localDis);
          setSharedReactionIds([]);
          setFavoriteUsers(localFav);
          setDislikeUsers(localDis);
          exclude = new Set([
            ...Object.keys(localFav),
            ...Object.keys(localDis),
          ]);
        }
      }

      if (collectionSource === 'newUsers' && parsedAdditionalAccessRules.length > 0) {
        setLastKey(null);
        setViewMode('default');
        return;
      }

      const { cards: cached } = await getCardsByList(defaultListKey);
      if (cached.length && viewModeRef.current === startMode) {
        console.log('[loadInitial] using cache', cached.length);
        const filteredCached = cached.filter(
          u => isAllowedIdForCollection(u.userId, collectionSource) && !exclude.has(u.userId)
        );
        loadedIdsRef.current = new Set(filteredCached.map(u => u.userId));
        setUsers(filteredCached);
        setIdsForQuery(defaultListKey, filteredCached.map(u => u.userId));
        await loadCommentsFor(filteredCached);
        if (viewModeRef.current !== startMode) return;
        setViewMode('default');
        // continue to fetch latest data to refresh cache
      }
      const res = await fetchChunk(
        INITIAL_LOAD,
        undefined,
        exclude,
        async part => {
          if (viewModeRef.current !== startMode) return;
          const unique = part.filter(u => !loadedIdsRef.current.has(u.userId));
          if (unique.length) {
            unique.forEach(u => loadedIdsRef.current.add(u.userId));
            setUsers(prev => [...prev, ...unique]);
            await loadCommentsFor(unique);
          }
        }
      );
      if (viewModeRef.current !== startMode) return;
      console.log('[loadInitial] initial loaded', res.users.length, 'hasMore', res.hasMore);
      loadedIdsRef.current = new Set([
        ...loadedIdsRef.current,
        ...res.users.map(u => u.userId),
      ]);
      res.users.forEach(u => updateCard(u.userId, u));
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        res.users.forEach(u => map.set(u.userId, u));
        const result = Array.from(map.values());
        setIdsForQuery(defaultListKey, result.map(u => u.userId));
        return result;
      });
      await loadCommentsFor(res.users);
      if (viewModeRef.current !== startMode) return;
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
      setViewMode('default');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [collectionSource, defaultListKey, fetchChunk, getMatchingMultiDataOwnerIds, loadCommentsFor, parsedAdditionalAccessRules.length]); // include fetchChunk to satisfy react-hooks/exhaustive-deps

  const reloadDefault = React.useCallback(() => {
    viewModeRef.current = 'default';
    invalidateReactionAsyncWork();
    resetReactionPaginationState();
    setViewMode('default');
    loadInitial();
  }, [invalidateReactionAsyncWork, loadInitial, resetReactionPaginationState]);


  const handleFiltersChange = React.useCallback(nextFilters => {
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    const currentMode = viewModeRef.current;
    if (currentMode === 'favorites' || currentMode === 'dislikes') {
      invalidateReactionAsyncWork();
      resetReactionPaginationState(currentMode);
      setUsers([]);
      setLastKey(null);
      setHasMore(true);
    }
  }, [invalidateReactionAsyncWork, resetReactionPaginationState]);

  const resetFiltersAndCache = React.useCallback(() => {
    localStorage.removeItem('matchingFilters');
    localStorage.removeItem(SEARCH_KEY);
    clearAllCardsCache();
    setFilterResetToken(prev => prev + 1);
    reloadDefault();
    toast.success('Фільтри та кеш скинуто');
  }, [reloadDefault]);

  const fetchReactionCardsByIds = React.useCallback(async ids => {
    const entries = await Promise.all(
      ids.map(async id => {
        const cached = getCard(id);
        const cachedPhotos = Array.isArray(cached?.photos) ? cached.photos : [];
        const canUseCachedCard = cached && cachedPhotos.length > 0 && (
          cached.__sourceCollection ||
          cached.publish === true ||
          !isShortId(id)
        );
        const user = canUseCachedCard ? cached : await fetchUserById(id);
        return user ? [id, user] : null;
      })
    );

    return entries.reduce((acc, entry) => {
      if (!entry) return acc;
      const [id, user] = entry;
      acc[id] = user;
      return acc;
    }, {});
  }, []);

  const getAccessibleReactionIds = React.useCallback(async reactionIds => {
    const uniqueIds = [...new Set((reactionIds || []).filter(Boolean))];
    if (collectionSource !== 'newUsers') {
      return uniqueIds.filter(isValidId);
    }

    const newUserReactionIds = uniqueIds.filter(isShortId);
    if (parsedAdditionalAccessRules.length === 0) {
      return newUserReactionIds;
    }

    const viewerId = ownerId || getOwnerId();
    if (!viewerId) return [];

    const resolvedSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(currentSearchKeySetKeys, viewerId)
      ? currentSearchKeySetKeys
      : await resolveAdditionalSearchKeySetKeysForMatching(null, viewerId);

    if (!resolvedSearchKeySetKeys.length) return [];

    const indexed = await getIndexedNewUsersIdsByRules({
      rawRules: currentAdditionalAccessRules,
      accessUserId: viewerId,
      searchKeySetsOfExactUser: resolvedSearchKeySetKeys,
      fetchMissingBuckets: true,
      requireSearchKeySetKeys: true,
      resultOffset: 0,
      resultLimit: Number.POSITIVE_INFINITY,
      debugMatchingFlow: shouldDebugAdditionalMatching(viewerId),
      debugToast: (message, data) => debugAdditionalToast(viewerId, message, data),
    });
    const allowedIds = new Set(Array.isArray(indexed?.userIds) ? indexed.userIds : []);
    return newUserReactionIds.filter(id => allowedIds.has(id));
  }, [
    collectionSource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    ownerId,
    parsedAdditionalAccessRules.length,
  ]);

  const loadReactionCardsPage = React.useCallback(async ({
    reactionIds,
    reactionMap = {},
    offset = 0,
    limit = LOAD_MORE,
    loadedIds = new Set(),
  }) => {
    const activeReactionMap = normalizeReactionMap(reactionMap);
    const page = await loadReactionCardsPageRecords({
      reactionIds,
      offset,
      limit,
      loadedIds,
      fetchUsersByIds: fetchReactionCardsByIds,
      mapUser: user => ({
        ...user,
        userId: user.userId,
        ...(collectionSource === 'newUsers' && parsedAdditionalAccessRules.length > 0
          ? { __matchingAccessAllowed: true }
          : {}),
      }),
      filterUsers: candidates => {
        const scopedCandidates = candidates
          .filter(user => activeReactionMap[user.userId])
          .filter(user => isMatchingCardId(user.userId))
          .filter(user => isAllowedIdForCollection(user.userId, collectionSource))
          .filter(user => canShowMatchingUser(user, { isAdmin }))
          .filter(user => !loadedIds.has(user.userId));

        return applyMatchingUiFiltersToUsers({
          users: scopedCandidates,
          filters: filtersRef.current || {},
          favoriteUsers: favoriteUsersRef.current,
          dislikeUsers: dislikeUsersRef.current,
          excludeReactionUsers: false,
          roleIndexSets,
          collectionSource,
        });
      },
    });

    return {
      ...page,
      users: page.users.sort(compareUsersByLastLogin2),
    };
  }, [
    collectionSource,
    fetchReactionCardsByIds,
    isAdmin,
    parsedAdditionalAccessRules.length,
    roleIndexSets,
  ]);

  const loadReactionCards = async reactionType => {
    const isFavoritesMode = reactionType === 'favorites';
    reactionLoadVersionRef.current += 1;
    const reactionLoadVersion = reactionLoadVersionRef.current;
    const requestCollectionSource = collectionSource;
    const canApplyReactionLoad = () => shouldApplyReactionPageResult({
      requestVersion: reactionLoadVersion,
      currentVersion: reactionLoadVersionRef.current,
      requestViewMode: reactionType,
      currentViewMode: viewModeRef.current,
      requestCollectionSource,
      currentCollectionSource: collectionSource,
    });
    viewModeRef.current = reactionType;
    setViewMode(reactionType);
    loadingRef.current = true;
    setLoading(true);
    setUsers([]);
    setSharedReactionCandidateUsers([]);
    setLastKey(null);
    setHasMore(false);
    resetReactionPaginationState(reactionType);

    try {
      const owners = await waitForOwnerId();
      if (!owners.length) {
        setHasMore(false);
        return;
      }

      const { favoriteSnapshots, dislikeSnapshots } = await readReactionSnapshotMaps({
        ownerIds: owners,
        fetchFavoriteUsers,
        fetchDislikeUsers,
        onWarning: warning => debugSharedReactionsLog(getOwnerId(), 'reaction snapshot unavailable while loading reaction cards', warning, warning.error),
      });
      const ownOwnerId = getOwnerId();
      const { favorites: favMap, dislikes: disMap } = resolvePrioritizedReactionMaps({
        ownerIds: owners,
        ownOwnerId,
        favoriteSnapshots,
        dislikeSnapshots,
      });
      const ownFavorites = normalizeReactionMap(favoriteSnapshots[ownOwnerId]);
      const ownDislikes = normalizeReactionMap(dislikeSnapshots[ownOwnerId]);
      ownFavoriteUsersRef.current = ownFavorites;
      ownDislikeUsersRef.current = ownDislikes;
      favoriteUsersRef.current = favMap;
      dislikeUsersRef.current = disMap;
      setOwnFavoriteUsers(ownFavorites);
      setOwnDislikeUsers(ownDislikes);
      setSharedReactionIds(buildSharedReactionCandidateIds({
        ownerIds: owners,
        ownOwnerId,
        favoriteSnapshots,
        dislikeSnapshots,
        favorites: favMap,
        dislikes: disMap,
      }));

      syncFavorites(favMap);
      syncDislikes(disMap);
      setFavoriteUsers(favMap);
      setDislikeUsers(disMap);

      const reactionMap = isFavoritesMode ? favMap : disMap;
      const listKey = isFavoritesMode ? 'favorite' : 'dislike';
      const fullReactionIds = Object.keys(reactionMap);
      const reactionIds = await getAccessibleReactionIds(fullReactionIds);
      if (!canApplyReactionLoad()) return;
      setIdsForQuery(listKey, reactionIds);
      if (isFavoritesMode) setFavoriteIds(favMap);

      const loadedIds = new Set();
      const page = await loadReactionCardsPage({
        reactionIds,
        reactionMap,
        offset: 0,
        limit: INITIAL_LOAD,
        loadedIds,
      });
      if (!canApplyReactionLoad()) return;

      page.users.forEach(user => updateCard(user.userId, user));
      if (isFavoritesMode) {
        cacheFavoriteUsers(Object.fromEntries(page.users.map(user => [user.userId, user])));
      } else {
        cacheDislikedUsers(Object.fromEntries(page.users.map(user => [user.userId, user])));
      }
      reactionLoadedIdsRef.current[reactionType] = loadedIds;
      loadedIdsRef.current = new Set(page.users.map(user => user.userId));
      setUsers(page.users);
      await loadCommentsFor(page.users);
      if (!canApplyReactionLoad()) return;
      setReactionPaginationByType(prev => ({
        ...prev,
        [reactionType]: {
          ids: reactionIds,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
        },
      }));
      setHasMore(page.hasMore);
    } finally {
      if (canApplyReactionLoad()) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };

  const loadFavoriteCards = () => loadReactionCards('favorites');

  const loadDislikeCards = () => loadReactionCards('dislikes');

  const searchUsers = async params => {
    const [key, value] = Object.entries(params)[0] || [];
    const term = key && value ? `${key}=${value}` : undefined;
    const cacheKey = getCacheKey('search', term ? normalizeQueryKey(term) : term);
    const ids = getIdsByQuery(cacheKey).filter(isValidId);
    if (ids.length > 0) {
      const cards = ids.map(id => getCard(id)).filter(c => c && isValidId(c.userId));
      if (cards.length > 0) {
        if (key === 'name' || key === 'names') {
          return Object.fromEntries(cards.map(c => [c.userId, c]));
        }
        return cards[0];
      }
    }
    const res = await searchUsersOnly(params);
    if (res && Object.keys(res).length > 0) {
      const arr = Array.isArray(res) ? res : Object.values(res);
      const filtered = arr.filter(u => isValidId(u.userId));
      filtered.forEach(u => updateCard(u.userId, u));
      setIdsForQuery(cacheKey, filtered.map(u => u.userId));
      return Array.isArray(res)
        ? filtered
        : Object.fromEntries(filtered.map(u => [u.userId, u]));
    }
    return res;
  };

  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('ownerId');
      setShowInfoModal(false);
      saveScrollPosition();
      navigate('/my-profile');
      await signOut(auth);
      clearAllCardsCache();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const loadMore = React.useCallback(async ({ targetVisibleCount = 0, currentVisibleCount = 0 } = {}) => {
    const isReactionViewMode = viewMode === 'favorites' || viewMode === 'dislikes';
    if (!hasMore || loadingRef.current || (viewMode !== 'default' && !isReactionViewMode)) {
      console.log('[loadMore] skip', { hasMore, loading: loadingRef.current, viewMode });
      return;
    }
    console.log('[loadMore] start', { lastKey, hasMore });
    loadingRef.current = true;
    setLoading(true);
    const loadMoreVersion = additionalLoadMoreFetchVersionRef.current + 1;
    const applyVersion = additionalMatchingApplyVersionRef.current + 1;
    additionalLoadMoreFetchVersionRef.current = loadMoreVersion;
    additionalMatchingApplyVersionRef.current = applyVersion;
    const requestCollectionSource = collectionSource;
    const requestViewMode = viewMode;
    const isLatestLoadMore = () => (
      loadMoreVersion === additionalLoadMoreFetchVersionRef.current &&
      applyVersion === additionalMatchingApplyVersionRef.current
    );
    const canApplyLoadMoreResult = () => (
      isLatestLoadMore() &&
      shouldApplyReactionPageResult({
        requestVersion: applyVersion,
        currentVersion: additionalMatchingApplyVersionRef.current,
        requestViewMode,
        currentViewMode: viewModeRef.current,
        requestCollectionSource,
        currentCollectionSource: collectionSource,
      })
    );
    try {
      if (isReactionViewMode) {
        const reactionMap = viewMode === 'favorites'
          ? favoriteUsersRef.current
          : dislikeUsersRef.current;
        const currentPagination = reactionPaginationByType[viewMode] || buildEmptyReactionPagination();
        const reactionIds = currentPagination.ids.length > 0
          ? currentPagination.ids
          : await getAccessibleReactionIds(Object.keys(reactionMap));
        const loadedIds = reactionLoadedIdsRef.current[viewMode] || new Set();
        const page = await loadReactionCardsPage({
          reactionIds,
          reactionMap,
          offset: currentPagination.ids.length > 0 ? currentPagination.nextOffset : 0,
          limit: LOAD_MORE,
          loadedIds,
        });

        if (!canApplyLoadMoreResult()) return;

        page.users.forEach(user => {
          updateCard(user.userId, user);
        });
        reactionLoadedIdsRef.current[viewMode] = loadedIds;
        loadedIdsRef.current = new Set(loadedIds);
        setUsers(prev => {
          const map = new Map(prev.map(user => [user.userId, user]));
          page.users.forEach(user => map.set(user.userId, user));
          return Array.from(map.values());
        });
        await loadCommentsFor(page.users);
        setReactionPaginationByType(prev => ({
          ...prev,
          [viewMode]: {
            ids: reactionIds,
            nextOffset: page.nextOffset,
            hasMore: page.hasMore,
          },
        }));
        setHasMore(page.hasMore);
        setLastKey(null);
        return;
      }

      const baseExclude = new Set([
        ...Object.keys(favoriteUsersRef.current),
        ...Object.keys(dislikeUsersRef.current),
      ]);

      if (collectionSource === 'newUsers' && parsedAdditionalAccessRules.length > 0) {
        const freshProfileCache = await ensureFreshAdditionalMatchingProfile({
          accessUserId: ownerId,
          reason: 'load-more-additional-newUsers',
        });
        if (!isLatestLoadMore()) {
          logAdditionalMatchingDebug(ownerId, 'ignored stale load more additional profile result', {
            loadMoreVersion,
            latestLoadMoreVersion: additionalLoadMoreFetchVersionRef.current,
            applyVersion,
            latestApplyVersion: additionalMatchingApplyVersionRef.current,
          });
          return;
        }
        const freshRawRules = freshProfileCache?.rawRules ?? currentAdditionalAccessRules;
        const freshParsedAdditionalAccessRules = parseAdditionalAccessRuleGroups(freshRawRules);
        const shouldResetAdditionalPagination =
          !freshProfileCache?.cacheHit &&
          (freshProfileCache?.paginationInvalidationReasons || []).length > 0;
        const collected = [];
        let nextOffset = shouldResetAdditionalPagination ? 0 : additionalNextOffset;
        let canLoadMoreAdditional = true;
        let visibleCount = shouldResetAdditionalPagination ? 0 : Math.max(0, Number(currentVisibleCount) || 0);
        const requiredVisibleCount = Math.max(0, Number(targetVisibleCount) || 0);
        let loadedPages = 0;
        const additionalCandidateBase = shouldResetAdditionalPagination ? [] : additionalNewUsers;

        if (!freshParsedAdditionalAccessRules.length) {
          if (isLatestLoadMore()) {
            resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
          }
          return;
        }

        if (shouldResetAdditionalPagination && isLatestLoadMore()) {
          resetAdditionalMatchingState({ resetHasMore: true });
        }
        if (!isLatestLoadMore()) return;

        while (
          canLoadMoreAdditional &&
          loadedPages < ADDITIONAL_BACKFILL_MAX_PAGES &&
          (collected.length === 0 || visibleCount < requiredVisibleCount)
        ) {
          loadedPages += 1;
          // eslint-disable-next-line no-await-in-loop
          const resolvedSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(
            freshProfileCache?.searchKeySetsOfExactUser || currentSearchKeySetKeys,
            ownerId
          )
            ? (freshProfileCache?.searchKeySetsOfExactUser || currentSearchKeySetKeys)
            : await resolveAdditionalSearchKeySetKeysForMatching(null, ownerId);

          if (!isLatestLoadMore()) {
            logAdditionalMatchingDebug(ownerId, 'ignored stale load more additional key resolution', {
              loadMoreVersion,
              latestLoadMoreVersion: additionalLoadMoreFetchVersionRef.current,
              applyVersion,
              latestApplyVersion: additionalMatchingApplyVersionRef.current,
            });
            return;
          }

          console.info('[Matching][additionalNewUsers] resolvedSearchKeySetsOfExactUser', resolvedSearchKeySetKeys);
          logAdditionalMatchingDebug(ownerId, 'load more additional matching request', {
            rawRules: freshRawRules,
            searchKeySetsOfExactUser: resolvedSearchKeySetKeys,
            collectionSource,
            filtersSignature: stableAdditionalSignature(filtersRef.current || {}),
            pagination: { offset: nextOffset, limit: LOAD_MORE },
          });

          const loaded = await fetchAdditionalNewUsersBySearchIndex({
            rawRules: freshRawRules,
            accessUserId: ownerId,
            searchKeySetKeys: resolvedSearchKeySetKeys,
            collectionSource,
            offset: nextOffset,
            limit: LOAD_MORE,
          });

          if (!isLatestLoadMore()) {
            logAdditionalMatchingDebug(ownerId, 'ignored stale load more additional page result', {
              loadMoreVersion,
              latestLoadMoreVersion: additionalLoadMoreFetchVersionRef.current,
              applyVersion,
              latestApplyVersion: additionalMatchingApplyVersionRef.current,
              fetchedIds: loaded?.userIds || [],
              pagination: { nextOffset: loaded?.nextOffset, hasMore: loaded?.hasMore },
            });
            return;
          }

          const pageUsers = loaded.users.filter(user =>
            user?.userId &&
            !baseExclude.has(user.userId) &&
            !loadedIdsRef.current.has(user.userId) &&
            !collected.some(collectedUser => collectedUser.userId === user.userId)
          );
          collected.push(...pageUsers);

          const candidateMap = new Map(additionalCandidateBase.map(user => [user.userId, user]));
          collected.forEach(user => candidateMap.set(user.userId, user));
          visibleCount = applyMatchingUiFiltersToUsers({
            users: Array.from(candidateMap.values()),
            filters,
            favoriteUsers: favoriteUsersRef.current,
            dislikeUsers: dislikeUsersRef.current,
            excludeReactionUsers: true,
            roleIndexSets,
            collectionSource,
          }).length;

          canLoadMoreAdditional = Boolean(loaded.hasMore) && loaded.nextOffset > nextOffset;
          nextOffset = loaded.nextOffset;
        }

        if (!isLatestLoadMore()) return;

        collected.forEach(user => {
          loadedIdsRef.current.add(user.userId);
          updateCard(user.userId, user);
        });
        setAdditionalNewUsers(prev => {
          const map = new Map((shouldResetAdditionalPagination ? [] : prev).map(user => [user.userId, user]));
          collected.forEach(user => map.set(user.userId, user));
          return Array.from(map.values());
        });
        await loadCommentsFor(collected);
        if (!isLatestLoadMore()) return;
        setAdditionalNextOffset(nextOffset);
        setHasMore(canLoadMoreAdditional);
        logAdditionalMatchingDebug(ownerId, 'load more additional matching final cards', {
          fetchedIds: collected.map(user => user.userId).filter(Boolean),
          filteredIds: collected.map(user => user.userId).filter(Boolean),
          pagination: { nextOffset, hasMore: canLoadMoreAdditional },
          finalCardsCount: collected.length,
        });
        setLastKey(null);
        return;
      }

      const collected = [];
      let cursor = lastKey;
      let canLoadMore = hasMore;

      while (collected.length < LOAD_MORE && canLoadMore) {
        const remaining = LOAD_MORE - collected.length;
        const dynamicExclude = new Set([
          ...baseExclude,
          ...loadedIdsRef.current,
          ...collected.map(u => u.userId).filter(Boolean),
        ]);
        const res = await fetchChunk(remaining, cursor, dynamicExclude);
        console.log('[loadMore] batch', {
          requested: remaining,
          received: res.users.length,
          cursor,
          nextCursor: res.lastKey,
          hasMore: res.hasMore,
        });

        const unique = res.users.filter(
          u => u?.userId && !loadedIdsRef.current.has(u.userId)
        );
        if (unique.length) {
          unique.forEach(u => loadedIdsRef.current.add(u.userId));
          collected.push(...unique);
        }

        const stuck = !res.lastKey || isSameCursor(res.lastKey, cursor);
        cursor = res.lastKey;
        canLoadMore = res.hasMore && !stuck;
      }

      collected.forEach(u => updateCard(u.userId, u));
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        collected.forEach(u => map.set(u.userId, u));
        const result = Array.from(map.values());
        setIdsForQuery(defaultListKey, result.map(u => u.userId));
        return result;
      });
      await loadCommentsFor(collected);

      if (handleEmptyFetch({ users: collected, lastKey: cursor }, lastKey, setHasMore)) {
        console.log('[loadMore] empty fetch, no more cards');
      } else {
        setHasMore(canLoadMore);
      }
      setLastKey(cursor);
    } finally {
      if (canApplyLoadMoreResult()) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [
    additionalNewUsers,
    additionalNextOffset,
    collectionSource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    ensureFreshAdditionalMatchingProfile,
    defaultListKey,
    fetchChunk,
    filters,
    getAccessibleReactionIds,
    hasMore,
    lastKey,
    loadCommentsFor,
    ownerId,
    loadReactionCardsPage,
    reactionPaginationByType,
    resetAdditionalMatchingState,
    parsedAdditionalAccessRules.length,
    roleIndexSets,
    viewMode,
  ]);

  useEffect(() => {
    console.log('[useEffect] calling loadInitial');
    reloadDefault();
  }, [reloadDefault]);

  const gridRef = useRef(null);
  const [preLastCardNode, setPreLastCardNode] = useState(null);


  const visibleUsers = useMemo(() => mergeMatchingCandidateUsers({
    users,
    additionalNewUsers,
    sharedReactionCandidateUsers,
    isAdmin,
    viewMode,
    collectionSource,
    hasAdditionalAccessRules: parsedAdditionalAccessRules.length > 0,
    ownFavoriteUsers,
    ownDislikeUsers,
    favoriteUsers,
    dislikeUsers,
  }), [
    additionalNewUsers,
    dislikeUsers,
    favoriteUsers,
    ownDislikeUsers,
    ownFavoriteUsers,
    isAdmin,
    parsedAdditionalAccessRules,
    sharedReactionCandidateUsers,
    users,
    viewMode,
    collectionSource,
  ]);

  const filteredUsers = applyMatchingUiFiltersToUsers({
    users: visibleUsers,
    filters,
    favoriteUsers,
    dislikeUsers,
    excludeReactionUsers: viewMode === 'default',
    roleIndexSets,
    collectionSource,
  });

  const additionalFiltersDebugSignatureRef = useRef('');
  useEffect(() => {
    if (collectionSource !== 'newUsers') return;
    if (!parsedAdditionalAccessRules.length) return;
    if (!shouldDebugAdditionalMatching(ownerId)) return;

    const first10FilteredUserIds = filteredUsers.map(user => user.userId).filter(Boolean).slice(0, 10);
    const signature = JSON.stringify({
      ownerId,
      beforeFilters: visibleUsers.length,
      afterFilters: filteredUsers.length,
      activeFilters: getActiveMatchingFiltersDebug(filters),
      collectionSource,
      first10FilteredUserIds,
    });
    if (additionalFiltersDebugSignatureRef.current === signature) return;
    additionalFiltersDebugSignatureRef.current = signature;

    debugAdditionalToast(ownerId, 'after UI filters', {
      beforeFilters: visibleUsers.length,
      afterFilters: filteredUsers.length,
      activeFilters: getActiveMatchingFiltersDebug(filters),
      collectionSource,
      first10FilteredUserIds,
    });
  }, [collectionSource, filteredUsers, filters, ownerId, parsedAdditionalAccessRules.length, visibleUsers]);

  useEffect(() => {
    if (viewMode !== 'default' && viewMode !== 'favorites' && viewMode !== 'dislikes') return;
    if (loadingRef.current || loading) return;
    if (!hasMore) return;
    if (filteredUsers.length >= INITIAL_LOAD) return;

    loadMore({
      currentVisibleCount: filteredUsers.length,
      targetVisibleCount: INITIAL_LOAD,
    });
  }, [filteredUsers.length, hasMore, loadMore, loading, viewMode]);

  useEffect(() => {
    if (viewMode !== 'default' && viewMode !== 'favorites' && viewMode !== 'dislikes') return;
    if (!hasMore || !preLastCardNode) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(preLastCardNode);

    return () => observer.disconnect();
  }, [hasMore, loadMore, preLastCardNode, viewMode]);

  const dotsMenu = () => (
    <>
      {(isAdmin || access.canAccessAdd || access.canAccessMatching) && (
        <>
          <SubmitButton onClick={() => { saveScrollPosition(); navigate('/my-profile'); }}>my profile</SubmitButton>
          {(isAdmin || access.canAccessAdd) && <SubmitButton onClick={() => { saveScrollPosition(); navigate('/add'); }}>add</SubmitButton>}
          {(isAdmin || access.canAccessMatching) && <SubmitButton onClick={() => { saveScrollPosition(); navigate('/matching'); }}>matching</SubmitButton>}
        </>
      )}
      <ExitButton onClick={handleExit}>exit</ExitButton>
    </>
  );

  return (
    <>
      {showFilters && <FilterOverlay show={showFilters} onClick={() => setShowFilters(false)} />}
      <FilterContainer show={showFilters} onClick={e => e.stopPropagation()}>
        {isAdmin && (
          <SearchBar
            searchFunc={searchUsers}
            setUsers={applySearchResults}
            setUserNotFound={() => {}}
            wrapperStyle={{ width: '100%', marginBottom: '10px' }}
            leftIcon="🔍"
            storageKey={SEARCH_KEY}
            onClear={reloadDefault}
          />
        )}
        <FilterResetButton onClick={resetFiltersAndCache}>
          Скинути фільтри та кеш
        </FilterResetButton>
        <CollectionSourceWrap>
          <CollectionSourceTitle>Колекція профілів:</CollectionSourceTitle>
          <CollectionSourceLabel>
            <input
              type="radio"
              name="matchingCollectionSource"
              value="users"
              checked={collectionSource === 'users'}
              onChange={e => {
                invalidateReactionAsyncWork();
                resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
                resetReactionPaginationState();
                setCollectionSource(e.target.value);
              }}
            />
            Основна (users)
          </CollectionSourceLabel>
          <CollectionSourceLabel>
            <input
              type="radio"
              name="matchingCollectionSource"
              value="newUsers"
              checked={collectionSource === 'newUsers'}
              onChange={e => {
                invalidateReactionAsyncWork();
                resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
                resetReactionPaginationState();
                setCollectionSource(e.target.value);
              }}
            />
            Додаткова (newUsers)
          </CollectionSourceLabel>
        </CollectionSourceWrap>
        <FilterPanel
          mode="matching"
          hideUserId
          hideCommentLength
          onChange={handleFiltersChange}
          resetToken={filterResetToken}
          nonAdminAllActive={!isAdmin}
        />
      </FilterContainer>
      <Container>
        <InnerContainer>
          <HeaderContainer>
            <CardCount>{filteredUsers.length} карточок</CardCount>
            <TopActions>
              {viewMode !== 'default' && (
                <ActionButton onClick={reloadDefault}><FaDownload /></ActionButton>
              )}
              <ActionButton onClick={() => setShowFilters(s => !s)}><FaFilter /></ActionButton>
              <ActionButton
                onClick={loadDislikeCards}
                disabled={viewMode === 'dislikes' || !ownerId}
              >
                <FaTimes />
              </ActionButton>
              <ActionButton
                onClick={loadFavoriteCards}
                disabled={viewMode === 'favorites' || !ownerId}
              >
                <FaHeart />
              </ActionButton>
              <ActionButton onClick={() => setShowInfoModal('dotsMenu')}><FaEllipsisV /></ActionButton>
            </TopActions>
          </HeaderContainer>
          {!ownerId && (
            <p style={{ textAlign: 'center', padding: '0 10px' }}>
              {ownerId === '' ? 'Owner not found' : 'Loading owner...'}
            </p>
          )}

          <Grid ref={gridRef}>
            {filteredUsers.map((user, index) => {
              const photos = Array.isArray(user.photos)
                ? user.photos.filter(Boolean).map(convertDriveLinkToImage)
                : [getCurrentValue(user.photos)]
                    .filter(Boolean)
                    .map(convertDriveLinkToImage);
              const photo = photos[0];
              const nextPhoto = photos[1];
              const thirdPhoto = photos[2];
              const role = (user.role || user.userRole || '')
                .toString()
                .trim()
                .toLowerCase();
              const isAgency = role === 'ag' || role === 'ip';

              const infoVariants = [];
              if (role === 'ag') {
                const moreInfo = getCurrentValue(user.moreInfo_main);
                const profession = getCurrentValue(user.profession);
                const education = getCurrentValue(user.education);
                const { extraFields } = splitSelectedFields(user, { isAdmin });
                const showDescriptionSlide = Boolean(
                  moreInfo || profession || education || extraFields.length > 0
                );
                if (showDescriptionSlide) infoVariants.push('description');
              } else {
                const infoSlides = getInfoSlidesCount(user);
                if (infoSlides >= 1) infoVariants.push('info');
                if (infoSlides >= 2) infoVariants.push('description');
                if (!photo) infoVariants.shift();
              }

              const nextVariant = nextPhoto ? null : infoVariants.shift();
              const thirdVariant = thirdPhoto ? null : infoVariants.shift();

              const nameParts = [
                getCurrentValue(user.name),
                getCurrentValue(user.surname),
              ]
                .filter(Boolean)
                .map(v => String(v).trim())
                .join(' ');
              return (
                <CardContainer
                  key={user.userId}
                  ref={
                    index === filteredUsers.length - 2 ? setPreLastCardNode : null
                  }
                >
                  {thirdVariant && (
                    <ThirdInfoCard>
                      <InfoCardContent user={user} variant={thirdVariant} isAdmin={isAdmin} />
                    </ThirdInfoCard>
                  )}
                    {thirdPhoto && <ThirdPhoto src={thirdPhoto} alt="third" />}
                    {nextVariant && (
                      <NextInfoCard>
                        <InfoCardContent user={user} variant={nextVariant} isAdmin={isAdmin} />
                      </NextInfoCard>
                    )}
                    {nextPhoto && <NextPhoto src={nextPhoto} alt="next" />}
                    <CardWrapper $role={role}>
                      <SwipeableCard
                        user={user}
                        photo={photo}
                        role={role}
                        isAgency={isAgency}
                        nameParts={nameParts}
                        isAdmin={isAdmin}
                        favoriteUsers={favoriteUsers}
                        setFavoriteUsers={setFavoriteUsers}
                        ownFavoriteUsers={ownFavoriteUsers}
                        setOwnFavoriteUsers={setOwnFavoriteUsers}
                        dislikeUsers={dislikeUsers}
                        setDislikeUsers={setDislikeUsers}
                        ownDislikeUsers={ownDislikeUsers}
                        setOwnDislikeUsers={setOwnDislikeUsers}
                        viewMode={viewMode}
                        handleRemove={handleRemove}
                        togglePublish={togglePublish}
                        multiDataOwnerId={ownerId}
                      />
                      <CommentBox>
                        <ResizableCommentInput
                          plain
                          placeholder="Мій коментар / My comment"
                          value={comments[user.userId] || ''}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const val = e.target.value;
                            setComments(prev => ({ ...prev, [user.userId]: val }));
                          }}
                          onBlur={async () => {
                            if (auth.currentUser) {
                              const text = comments[user.userId] || '';
                              const res = await setUserComment(user.userId, text, ownerId);
                              setLocalComment(user.userId, text, res?.lastAction);
                            }
                          }}
                        />
                        {(sharedComments[user.userId] || []).map((text, idx) => (
                          <SharedCommentText key={`${user.userId}-shared-comment-${idx}`}>
                            {text}
                          </SharedCommentText>
                        ))}
                        {isAdmin && (
                          <Id
                            onClick={() => {
                              saveScrollPosition();
                              navigate(`/edit/${user.userId}`, { state: user });
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            ID: {user.userId ? user.userId.slice(0, 5) : ''}
                          </Id>
                        )}
                      </CommentBox>
                    </CardWrapper>
                  </CardContainer>
                );
              })}
          {loading &&
            Array.from({ length: 4 }).map((_, idx) => (
              <MatchingSkeleton key={`skeleton-${idx}`} />
            ))}
          </Grid>

          {(viewMode === 'default' || viewMode === 'favorites' || viewMode === 'dislikes') && (
            <LoadMoreFooter>
              <LoadMoreButton onClick={loadMore} disabled={loading || !hasMore}>
                {loading
                  ? 'Завантаження...'
                  : hasMore
                    ? 'Дозавантажити карточки'
                    : 'Більше карточок завтра'}
              </LoadMoreButton>
            </LoadMoreFooter>
          )}

          {showInfoModal && (
            <InfoModal onClose={() => setShowInfoModal(false)} text="dotsMenu" Context={dotsMenu} />
          )}
        </InnerContainer>
      </Container>
    </>
  );
};

export default Matching;
