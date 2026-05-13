import React, { useEffect, useState, useRef, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resolveAccess } from 'utils/accessLevel';
import {
  ActionButton,
  AdminToggle,
  AnimatedCard,
  CardContainer,
  CardCount,
  CardWrapper,
  ClickableId,
  CollectionSourceLabel,
  CollectionSourceTitle,
  CollectionSourceWrap,
  CommentBox,
  CommentInput,
  Container,
  ExitButton,
  FilterContainer,
  FilterOverlay,
  FilterResetButton,
  Grid,
  HeaderContainer,
  InnerContainer,
  LoadMoreButton,
  LoadMoreFooter,
  OwnerStatusMessage,
  SharedCommentText,
  SkeletonCardInner,
  SkeletonInfo,
  SkeletonLine,
  SkeletonPhoto,
  SubmitButton,
  TopActions,
  ModernActionRail,
  ModernBioText,
  ModernChip,
  ModernChipGrid,
  ModernContactLinks,
  ModernContactLink,
  ModernDesktopNavButton,
  ModernFactPill,
  ModernGallery,
  ModernGalleryImage,
  ModernHero,
  ModernHeroContent,
  ModernHeroFacts,
  ModernHeroFallbackMark,
  ModernHeroLocation,
  ModernHeroTitle,
  ModernMoreButton,
  ModernProfileBody,
  ModernProfileScroll,
  ModernProfileShell,
  ModernRoleBadge,
  ModernSection,
  ModernSectionTitle,
  BackendTrafficToggleButton,
  BackendTrafficToggleStatus,
} from './Matching.styled';
import {
  fetchUsersByLastLogin2,
  fetchUserById,
  getAllUserPhotos,
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
import {
  BACKEND_TRAFFIC_TRACKING_TEST_UID,
  getBackendDownloadToastsEnabled,
  setBackendDownloadToastsEnabled,
  withAdminDownloadToast,
  wrapAdminOnValue,
} from 'utils/backendDownloadToast';

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { BtnFavorite } from './smallCard/btnFavorite';
import { BtnDislike } from './smallCard/btnDislike';
import { getCurrentValue } from './getCurrentValue';
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';
import { useAutoResize } from '../hooks/useAutoResize';
import { getCacheKey, clearAllCardsCache, setFavoriteIds } from "../utils/cache";
import { normalizeQueryKey, getIdsByQuery, setIdsForQuery, getCard } from '../utils/cardIndex';
import { getCardsByList, updateCard } from '../utils/cardsStorage';
import { getCurrentDate } from './foramtDate';
import InfoModal from './InfoModal';
import { FaFacebookF, FaFilter, FaTimes, FaHeart, FaEllipsisV, FaDownload, FaInstagram, FaTelegramPlane, FaViber, FaWhatsapp, FaVk, FaGlobe, FaLinkedin, FaYoutube, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { FaPhoneVolume, FaXTwitter } from 'react-icons/fa6';
import { MdEmail } from 'react-icons/md';
import { SiTiktok } from 'react-icons/si';
import { getContactEntries, CONTACT_LINK_BUILDERS } from './contactMethods';
import { handleEmptyFetch } from './loadMoreUtils';
import {
  getHeroFields,
  getProfileAge,
  getProfileBio,
  getProfileLocation,
  getProfileName,
  getProfilePhotos,
  getProfileRole,
  getProfileSections,
  getQuickFacts,
  getRoleLabel,
} from './profileLayoutConfig';
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
  mergeSharedReactionCandidateUsers,
  loadReactionCardsPageRecords,
  hasPendingSharedReactionCandidates,
  normalizeReactionMap,
  readReactionSnapshotMaps,
  resolvePrioritizedReactionMaps,
  shouldApplyReactionPageResult,
  shouldApplySharedReactionCandidateResult,
  uniqueTruthyReactionIds,
} from 'utils/reactionPriority';


const DEBUG_ADDITIONAL_MATCHING_USER_ID = BACKEND_TRAFFIC_TRACKING_TEST_UID;
const DEBUG_SHARED_OWNER_ID = 'stFMfZ8CqQX05L8vK9Yse6FdYIh1';
const DEBUG_SHARED_NEW_USER_ID = 'ID0001';
const ADDITIONAL_PROFILE_CACHE_TTL_MS = 45 * 1000;
const ADDITIONAL_MATCHING_LOG_LIMIT = 300;
const buildEmptyReactionPagination = () => ({ ids: [], nextOffset: 0, hasMore: false, accessSnapshotKey: '' });

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

const buildAdditionalAccessSnapshotKey = ({
  accessUserId = '',
  collectionSource = '',
  rawRules = '',
  searchKeySetKeys = [],
  searchKeySetsOfExactUser,
} = {}) => stableAdditionalSignature({
  accessUserId: String(accessUserId || '').trim(),
  collectionSource,
  rawRulesSignature: getRawRulesSignature(rawRules),
  searchKeySetsOfExactUserSignature: getSearchKeySetsOfExactUserSignature(
    searchKeySetsOfExactUser ?? searchKeySetKeys
  ),
});
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
        const [snapshot, photos] = await Promise.all([
          get(refDb(database, `newUsers/${userId}`)),
          getAllUserPhotos(userId),
        ]);
        if (!snapshot.exists()) return null;
        return {
          userId,
          ...(snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {}),
          photos: Array.isArray(photos) ? photos : [],
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
  viewMode = 'default',
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
  ).filter(u => (
    viewMode === 'favorites' ||
    viewMode === 'dislikes' ||
    isAllowedIdForCollection(u.userId, collectionSource)
  ));

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


const collectProfileFieldKeys = fields => [
  ...new Set(
    (fields || []).flatMap(field => [field.key, ...(field.sourceKeys || [])].filter(Boolean))
  ),
];

const ProfileChips = ({ fields, role }) => {
  if (!fields.length) return null;
  return (
    <ModernChipGrid>
      {fields.map(field => (
        <ModernChip key={`${field.key}-${field.label}`} $role={role}>
          <strong>{field.label}</strong>
          <span>{field.value}</span>
        </ModernChip>
      ))}
    </ModernChipGrid>
  );
};

const CONTACT_ICONS = {
  phone: FaPhoneVolume,
  email: MdEmail,
  telegram: FaTelegramPlane,
  whatsapp: FaWhatsapp,
  viber: FaViber,
  facebook: FaFacebookF,
  instagram: FaInstagram,
  tiktok: SiTiktok,
  vk: FaVk,
  linkedin: FaLinkedin,
  youtube: FaYoutube,
  twitter: FaXTwitter,
  website: FaGlobe,
  otherLink: FaGlobe,
};

const getContactLabel = key => ({
  otherLink: 'Other link',
}[key] || key.charAt(0).toUpperCase() + key.slice(1));

const ProfileContactLinks = ({ user, role }) => {
  const entries = getContactEntries(user);
  if (!entries.length) return null;

  return (
    <ModernContactLinks onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      {entries.map(entry => {
        const Icon = CONTACT_ICONS[entry.key] || FaGlobe;
        const valueText = String(entry.value || '').trim();
        const displayValue = entry.key === 'phone' ? `+${valueText.replace(/\s/g, '')}` : valueText;

        return (
          <ModernContactLink
            key={`${entry.key}-${entry.index}-${valueText}`}
            href={entry.href}
            target="_blank"
            rel="noopener noreferrer"
            $role={role}
            title={`${getContactLabel(entry.key)}: ${displayValue}`}
            aria-label={`${getContactLabel(entry.key)}: ${displayValue}`}
          >
            <Icon />
            <span>{displayValue}</span>
          </ModernContactLink>
        );
      })}
      {getContactEntries({
        telegram: [],
        phone: user?.phone,
      }).filter(entry => entry.key === 'phone').flatMap(entry => [
        <ModernContactLink
          key={`phone-telegram-${entry.index}`}
          href={CONTACT_LINK_BUILDERS.telegramFromPhone(entry.value)}
          target="_blank"
          rel="noopener noreferrer"
          $role={role}
          title="Telegram from phone"
          aria-label="Telegram from phone"
        >
          <FaTelegramPlane />
        </ModernContactLink>,
        <ModernContactLink
          key={`phone-viber-${entry.index}`}
          href={CONTACT_LINK_BUILDERS.viberFromPhone(entry.value)}
          target="_blank"
          rel="noopener noreferrer"
          $role={role}
          title="Viber from phone"
          aria-label="Viber from phone"
        >
          <FaViber />
        </ModernContactLink>,
        <ModernContactLink
          key={`phone-whatsapp-${entry.index}`}
          href={CONTACT_LINK_BUILDERS.whatsappFromPhone(entry.value)}
          target="_blank"
          rel="noopener noreferrer"
          $role={role}
          title="WhatsApp from phone"
          aria-label="WhatsApp from phone"
        >
          <FaWhatsapp />
        </ModernContactLink>,
      ])}
    </ModernContactLinks>
  );
};

const ProfileBio = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const shouldCollapse = text.length > 230;
  const displayText = shouldCollapse && !expanded ? `${text.slice(0, 230).trim()}…` : text;
  return (
    <ModernSection>
      <ModernSectionTitle>About</ModernSectionTitle>
      <ModernBioText>{displayText}</ModernBioText>
      {shouldCollapse && (
        <ModernMoreButton
          type="button"
          onClick={e => {
            e.stopPropagation();
            setExpanded(value => !value);
          }}
        >
          {expanded ? 'less' : 'more'}
        </ModernMoreButton>
      )}
    </ModernSection>
  );
};

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
  handleRemove,
  togglePublish,
  multiDataOwnerId,
  onNavigate,
  commentValue,
  sharedCommentTexts = [],
  onCommentChange,
  onCommentBlur,
  onAdminEdit,
}) => {
  const resolvedRole = getProfileRole(user) || role;
  const photos = getProfilePhotos(user);
  const heroPhoto = photo || photos[0] || '';
  const galleryPhotos = photos.filter(item => item && item !== heroPhoto);
  const [activeHeroPhoto, setActiveHeroPhoto] = useState(heroPhoto);
  const [dir, setDir] = useState(null);
  const favoriteButtonWrapRef = useRef(null);
  const dislikeButtonWrapRef = useRef(null);
  const touchStart = useRef(null);
  const swipedRef = useRef(false);

  useEffect(() => {
    setActiveHeroPhoto(heroPhoto);
  }, [heroPhoto, user.userId]);

  useEffect(() => {
    if (!dir) return undefined;
    const t = setTimeout(() => setDir(null), 260);
    return () => clearTimeout(t);
  }, [dir]);

  const name = getProfileName(user) || nameParts || getRoleLabel(resolvedRole);
  const age = getProfileAge(user);
  const title = `${name}${age ? `, ${age}` : ''}`;
  const roleLabel = getRoleLabel(resolvedRole);
  const locationInfo = getProfileLocation(user);
  const heroFields = getHeroFields(user, resolvedRole);
  const heroFieldKeys = collectProfileFieldKeys(heroFields);
  const quickFacts = getQuickFacts(user, resolvedRole, { excludeKeys: heroFieldKeys });
  const usedSummaryFieldKeys = collectProfileFieldKeys([...heroFields, ...quickFacts]);
  const sections = getProfileSections(user, resolvedRole, { excludeKeys: usedSummaryFieldKeys });
  const bio = getProfileBio(user);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || roleLabel.slice(0, 2).toUpperCase();
  const handleTouchStart = e => {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = e => {
    if (!touchStart.current || !e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.25) e.preventDefault();
  };

  const handleTouchEnd = e => {
    if (!touchStart.current || !e.changedTouches || e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    const direction = dx > 0 ? 'right' : 'left';
    swipedRef.current = true;
    setDir(direction);
    if (typeof onNavigate === 'function') {
      onNavigate(direction === 'left' ? 1 : -1);
    }
    setTimeout(() => {
      swipedRef.current = false;
    }, 80);
  };

  const handleClick = () => {
    if (swipedRef.current) swipedRef.current = false;
  };

  return (
    <AnimatedCard
      $dir={dir}
      $small={isAgency}
      $compactWithoutPhoto={!activeHeroPhoto}
      $hasPhoto={!!activeHeroPhoto}
      data-card
      data-testid="matching-profile-card"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      $activeProfile
    >
      <ModernProfileShell>
        <ModernProfileScroll>
        <ModernHero $image={activeHeroPhoto}>
          {!activeHeroPhoto && <ModernHeroFallbackMark>{initials}</ModernHeroFallbackMark>}
          {activeHeroPhoto && <img src={activeHeroPhoto} alt="" style={{ display: 'none' }} onError={() => setActiveHeroPhoto('')} />}
          <ModernHeroContent>
            <ModernRoleBadge $role={resolvedRole}>{roleLabel}</ModernRoleBadge>
            <ModernHeroTitle>{title}</ModernHeroTitle>
            {locationInfo && <ModernHeroLocation>{locationInfo}</ModernHeroLocation>}
            {heroFields.length > 0 && (
              <ModernHeroFacts>
                {heroFields.map(item => (
                  <ModernFactPill key={`hero-${item.key}`}>
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </ModernFactPill>
                ))}
              </ModernHeroFacts>
            )}
          </ModernHeroContent>
        </ModernHero>
        {isAdmin && (
          <AdminToggle published={user.publish} onClick={e => { e.stopPropagation(); togglePublish(user); }} />
        )}
        <ModernProfileBody>
          {quickFacts.length > 0 && (
            <ModernSection>
              <ModernSectionTitle>Quick facts</ModernSectionTitle>
              <ProfileChips fields={quickFacts} role={resolvedRole} />
            </ModernSection>
          )}
          <ProfileBio text={bio} />
          <ModernSection>
            <ModernSectionTitle>Comment</ModernSectionTitle>
            <CommentBox>
              <ResizableCommentInput
                plain
                placeholder="Мій коментар / My comment"
                value={commentValue || ''}
                onClick={e => e.stopPropagation()}
                onChange={e => onCommentChange && onCommentChange(e.target.value)}
                onBlur={onCommentBlur}
              />
              {sharedCommentTexts.map((text, idx) => (
                <SharedCommentText key={`${user.userId}-shared-comment-${idx}`}>
                  {text}
                </SharedCommentText>
              ))}
              {isAdmin && (
                <ClickableId onClick={onAdminEdit}>
                  ID: {user.userId ? user.userId.slice(0, 5) : ''}
                </ClickableId>
              )}
            </CommentBox>
          </ModernSection>
          {sections.map(section => (
            <ModernSection key={section.title}>
              <ModernSectionTitle>{section.title}</ModernSectionTitle>
              {section.variant === 'contacts' ? (
                <ProfileContactLinks user={user} role={resolvedRole} />
              ) : (
                <ProfileChips fields={section.fields} role={resolvedRole} />
              )}
            </ModernSection>
          ))}
          {galleryPhotos.length > 0 && (
            <ModernSection>
              <ModernSectionTitle>Gallery</ModernSectionTitle>
              <ModernGallery>
                {galleryPhotos.map(src => (
                  <ModernGalleryImage key={src} src={src} alt={`${name} profile`} onError={event => { event.currentTarget.style.display = 'none'; }} />
                ))}
              </ModernGallery>
            </ModernSection>
          )}
        </ModernProfileBody>
        </ModernProfileScroll>
        <ModernActionRail>
          <span ref={dislikeButtonWrapRef}>
            <BtnDislike userId={user.userId} userData={user} dislikeUsers={dislikeUsers} setDislikeUsers={setDislikeUsers} ownDislikeUsers={ownDislikeUsers} setOwnDislikeUsers={setOwnDislikeUsers} favoriteUsers={favoriteUsers} setFavoriteUsers={setFavoriteUsers} ownFavoriteUsers={ownFavoriteUsers} setOwnFavoriteUsers={setOwnFavoriteUsers} onRemove={handleRemove} multiDataOwnerId={multiDataOwnerId} customStyle={{ background: 'rgba(24, 21, 18, 0.78)' }} />
          </span>
          <span ref={favoriteButtonWrapRef}>
            <BtnFavorite userId={user.userId} userData={user} favoriteUsers={favoriteUsers} setFavoriteUsers={setFavoriteUsers} ownFavoriteUsers={ownFavoriteUsers} setOwnFavoriteUsers={setOwnFavoriteUsers} dislikeUsers={dislikeUsers} setDislikeUsers={setDislikeUsers} ownDislikeUsers={ownDislikeUsers} setOwnDislikeUsers={setOwnDislikeUsers} onRemove={handleRemove} multiDataOwnerId={multiDataOwnerId} customStyle={{ background: 'rgba(247, 147, 30, 0.95)' }} />
          </span>
        </ModernActionRail>
      </ModernProfileShell>
    </AnimatedCard>
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
  const collectionSourceRef = useRef(collectionSource);
  const defaultListKey = `default:${collectionSource}`;
  const [filterResetToken, setFilterResetToken] = useState(0);
  const [comments, setComments] = useState({});
  const [sharedComments, setSharedComments] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [ownerId, setOwnerId] = useState(null);
  const [downloadSizeToastsEnabled, setDownloadSizeToastsEnabled] = useState(() => getBackendDownloadToastsEnabled());
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
  const sharedReactionCandidateLoadVersionRef = useRef(0);
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
    sharedReactionCandidateLoadVersionRef.current += 1;
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
    collectionSourceRef.current = collectionSource;
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
    setLastKey(null);
    invalidateReactionAsyncWork();
    setSharedReactionCandidateUsers([]);
    viewModeRef.current = 'search';
    setViewMode('search');
    await loadCommentsFor(filtered);
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
      const fetchedProfile = await fetchUserById(normalizedAccessUserId);
      const profileFound = Boolean(fetchedProfile && typeof fetchedProfile === 'object');

      if (!profileFound) {
        const fallbackSearchKeySetsOfExactUser = areSearchKeySetKeysForAccessUserId(
          state.currentSearchKeySetKeys,
          normalizedAccessUserId
        )
          ? state.currentSearchKeySetKeys
          : await resolveAdditionalSearchKeySetKeysForMatching(null, normalizedAccessUserId);
        const fallbackCache = {
          accessUserId: normalizedAccessUserId,
          rawRulesSignature: getRawRulesSignature(state.currentAdditionalAccessRules),
          searchKeySetsOfExactUserSignature: getSearchKeySetsOfExactUserSignature(fallbackSearchKeySetsOfExactUser),
          collectionSource: state.collectionSource,
          profile: cached?.profile || {},
          accessLevel: cached?.accessLevel || '',
          rawRules: state.currentAdditionalAccessRules || '',
          searchKeySetsOfExactUser: fallbackSearchKeySetsOfExactUser,
          cachedAt: cached?.cachedAt || Date.now(),
          profilePath,
          profileFound: false,
        };

        logAdditionalMatchingDebug(normalizedAccessUserId, 'profile refetch returned empty; keeping current access state', {
          firebasePath: profilePath,
          rawRules: fallbackCache.rawRules,
          searchKeySetsOfExactUser: fallbackSearchKeySetsOfExactUser,
          metadata: {
            accessUserId: fallbackCache.accessUserId,
            rawRulesSignature: fallbackCache.rawRulesSignature,
            searchKeySetsOfExactUserSignature: fallbackCache.searchKeySetsOfExactUserSignature,
            collectionSource: fallbackCache.collectionSource,
          },
          staleReasons,
          paginationInvalidationReasons,
        });

        return {
          ...fallbackCache,
          cacheHit: true,
          profileRefreshFailed: true,
          staleReasons,
          paginationInvalidationReasons: [],
        };
      }

      const profile = fetchedProfile;
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
        profileFound: true,
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
    const requestVersion = sharedReactionCandidateLoadVersionRef.current + 1;
    sharedReactionCandidateLoadVersionRef.current = requestVersion;
    const requestViewMode = viewMode;
    const requestCollectionSource = collectionSource;
    const canApplySharedCandidateResult = () => shouldApplySharedReactionCandidateResult({
      requestVersion,
      currentVersion: sharedReactionCandidateLoadVersionRef.current,
      requestViewMode,
      currentViewMode: viewModeRef.current,
      requestCollectionSource,
      currentCollectionSource: collectionSourceRef.current,
    });

    if (!['default', 'favorites', 'dislikes'].includes(requestViewMode)) {
      setSharedReactionCandidateUsers([]);
      return;
    }

    const candidateIds = [...new Set(sharedReactionIds.filter(Boolean))];
    debugSharedReactionsLog(viewerId, 'shared reaction ids found for candidate pool', {
      sharedReactionIds: summarizeIdsForDebug(candidateIds),
      collectionSource,
    });

    if (!viewerId || candidateIds.length === 0) {
      if (canApplySharedCandidateResult()) {
        setSharedReactionCandidateUsers([]);
      }
      return;
    }

    const filteredInvalidIds = candidateIds.filter(id => !isMatchingCardId(id));
    const filteredByCollectionIds = [];
    const filteredByAccessIds = [];
    const userCandidateIds = candidateIds.filter(isValidId);
    const newUserCandidateIds = candidateIds.filter(isShortId);
    let allowedNewUserIds = [];
    let indexedAllowedNewUserIds = null;

    if (newUserCandidateIds.length > 0) {
      if (parsedAdditionalAccessRules.length > 0) {
        const resolvedSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(currentSearchKeySetKeys, viewerId)
          ? currentSearchKeySetKeys
          : await resolveAdditionalSearchKeySetKeysForMatching(null, viewerId);

        if (!canApplySharedCandidateResult()) {
          return;
        }

        if (resolvedSearchKeySetKeys.length === 0) {
          filteredByAccessIds.push(...newUserCandidateIds);
        } else {
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
          if (!canApplySharedCandidateResult()) {
            return;
          }
          indexedAllowedNewUserIds = new Set(Array.isArray(indexed?.userIds) ? indexed.userIds : []);
          allowedNewUserIds = newUserCandidateIds.filter(id => indexedAllowedNewUserIds.has(id));
          filteredByAccessIds.push(...newUserCandidateIds.filter(id => !indexedAllowedNewUserIds.has(id)));
        }
      } else {
        allowedNewUserIds = newUserCandidateIds;
      }
    }

    const loadedUsers = [];
    if (!canApplySharedCandidateResult()) {
      return;
    }

    if (allowedNewUserIds.length > 0) {
      const newUsersCards = await fetchNewUsersByIdsForMatching(allowedNewUserIds);
      if (!canApplySharedCandidateResult()) {
        return;
      }
      loadedUsers.push(
        ...newUsersCards.map(user => ({
          ...user,
          __sourceCollection: 'newUsers',
          __matchingAccessAllowed: parsedAdditionalAccessRules.length > 0,
        }))
      );
    }

    if (userCandidateIds.length > 0) {
      const usersMap = await fetchUsersByIds(userCandidateIds);
      if (!canApplySharedCandidateResult()) {
        return;
      }
      loadedUsers.push(
        ...userCandidateIds
          .map(id => usersMap[id])
          .filter(Boolean)
          .map(user => ({ ...user, __sourceCollection: 'users' }))
          .filter(user => canShowMatchingUser(user, { isAdmin }))
      );
    }

    const loadedIds = new Set(loadedUsers.map(user => user.userId).filter(Boolean));
    const missingAllowedIds = [
      ...userCandidateIds,
      ...allowedNewUserIds,
    ].filter(id => !loadedIds.has(id));

    if (!canApplySharedCandidateResult()) {
      return;
    }

    loadedUsers.forEach(user => {
      const { __matchingAccessAllowed, ...cacheUser } = user;
      updateCard(user.userId, cacheUser);
    });
    setSharedReactionCandidateUsers(prev => mergeSharedReactionCandidateUsers({
      currentUsers: prev,
      loadedUsers,
      candidateIds,
    }));
    await loadCommentsFor(loadedUsers);

    if (!canApplySharedCandidateResult()) {
      return;
    }

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
        allowedBySearchKeySets: allowedNewUserIds.includes(DEBUG_SHARED_NEW_USER_ID),
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
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    const usersIds = uniqueIds.filter(isValidId);
    const newUsersIds = uniqueIds.filter(isShortId);
    const cachedEntries = new Map();
    const missingUserIds = [];
    const missingNewUserIds = [];

    uniqueIds.forEach(id => {
      const cached = getCard(id);
      const cachedPhotos = Array.isArray(cached?.photos) ? cached.photos : [];
      const canUseCachedCard = cached && cachedPhotos.length > 0 && (
        cached.__sourceCollection ||
        cached.publish === true ||
        !isShortId(id)
      );

      if (canUseCachedCard) {
        cachedEntries.set(id, {
          ...cached,
          userId: id,
          __sourceCollection: cached.__sourceCollection || (isShortId(id) ? 'newUsers' : 'users'),
        });
      } else if (isShortId(id)) {
        missingNewUserIds.push(id);
      } else if (isValidId(id)) {
        missingUserIds.push(id);
      }
    });

    const [usersMap, newUsersCards] = await Promise.all([
      missingUserIds.length ? fetchUsersByIds(missingUserIds) : Promise.resolve({}),
      missingNewUserIds.length ? fetchNewUsersByIdsForMatching(missingNewUserIds) : Promise.resolve([]),
    ]);

    const result = {};
    usersIds.forEach(id => {
      const user = cachedEntries.get(id) || usersMap?.[id];
      if (user) {
        result[id] = { ...user, userId: id, __sourceCollection: 'users' };
      }
    });
    newUsersIds.forEach(id => {
      const user = cachedEntries.get(id) || newUsersCards.find(card => card.userId === id);
      if (user) {
        result[id] = { ...user, userId: id, __sourceCollection: 'newUsers' };
      }
    });

    return result;
  }, []);

  const getAccessibleReactionIds = React.useCallback(async (reactionIds, accessSnapshot = {}) => {
    const uniqueIds = [...new Set((reactionIds || []).filter(Boolean))];
    const userReactionIds = uniqueIds.filter(isValidId);
    const newUserReactionIds = uniqueIds.filter(isShortId);
    if (newUserReactionIds.length === 0) return userReactionIds;

    const rawRulesForRequest = accessSnapshot.rawRules ?? currentAdditionalAccessRules;
    const parsedRulesForRequest = parseAdditionalAccessRuleGroups(rawRulesForRequest);
    if (parsedRulesForRequest.length === 0) {
      return uniqueIds.filter(isMatchingCardId);
    }

    const searchKeySetsForRequest = accessSnapshot.searchKeySetsOfExactUser ?? currentSearchKeySetKeys;
    const viewerId = accessSnapshot.accessUserId || ownerId || getOwnerId();
    if (!viewerId) return userReactionIds;

    const resolvedSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(searchKeySetsForRequest, viewerId)
      ? searchKeySetsForRequest
      : await resolveAdditionalSearchKeySetKeysForMatching(null, viewerId);

    if (!resolvedSearchKeySetKeys.length) return userReactionIds;

    const indexed = await getIndexedNewUsersIdsByRules({
      rawRules: rawRulesForRequest,
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
    const allowedNewUserReactionIds = newUserReactionIds.filter(id => allowedIds.has(id));
    return uniqueIds.filter(id => userReactionIds.includes(id) || allowedNewUserReactionIds.includes(id));
  }, [
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    ownerId,
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
        ...(user.__sourceCollection === 'newUsers' ? { __matchingAccessAllowed: true } : {}),
      }),
      filterUsers: candidates => {
        const scopedCandidates = candidates
          .filter(user => activeReactionMap[user.userId])
          .filter(user => isMatchingCardId(user.userId))
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
          viewMode: viewModeRef.current,
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
      const nextSharedReactionIds = buildSharedReactionCandidateIds({
        ownerIds: owners,
        ownOwnerId,
        favoriteSnapshots,
        dislikeSnapshots,
        favorites: favMap,
        dislikes: disMap,
      });
      setSharedReactionIds(nextSharedReactionIds);

      syncFavorites(favMap);
      syncDislikes(disMap);
      setFavoriteUsers(favMap);
      setDislikeUsers(disMap);

      const reactionMap = isFavoritesMode ? favMap : disMap;
      const listKey = isFavoritesMode ? 'favorite' : 'dislike';
      const fullReactionIds = Object.keys(reactionMap);
      const reactionAccessSnapshot = {
        accessUserId: ownerId || getOwnerId(),
        collectionSource,
        rawRules: currentAdditionalAccessRules,
        searchKeySetsOfExactUser: currentSearchKeySetKeys,
      };
      const reactionAccessSnapshotKey = buildAdditionalAccessSnapshotKey(reactionAccessSnapshot);
      const reactionIds = await getAccessibleReactionIds(fullReactionIds, reactionAccessSnapshot);
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
      const hasPendingSharedCandidates = hasPendingSharedReactionCandidates({
        reactionIds,
        sharedReactionIds: nextSharedReactionIds,
        loadedIds,
        reactionMap,
      });
      const nextHasMore = page.hasMore || hasPendingSharedCandidates;
      setReactionPaginationByType(prev => ({
        ...prev,
        [reactionType]: {
          ids: reactionIds,
          nextOffset: page.nextOffset,
          hasMore: nextHasMore,
          accessSnapshotKey: reactionAccessSnapshotKey,
        },
      }));
      setHasMore(nextHasMore);
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
        const reactionMapIds = Object.keys(reactionMap);
        const hasAccessScopedNewUserReactionIds = [
          ...reactionMapIds,
          ...(currentPagination.ids || []),
        ].some(isShortId);
        const shouldRefreshReactionIds = Boolean(
          parsedAdditionalAccessRules.length > 0 &&
          (collectionSource === 'newUsers' || hasAccessScopedNewUserReactionIds)
        );
        const freshProfileCache = shouldRefreshReactionIds
          ? await ensureFreshAdditionalMatchingProfile({
            accessUserId: ownerId,
            reason: `load-more-${viewMode}-reaction-access`,
          })
          : null;

        if (!canApplyLoadMoreResult()) return;

        const reactionAccessSnapshot = {
          accessUserId: ownerId || getOwnerId(),
          collectionSource,
          rawRules: freshProfileCache?.rawRules ?? currentAdditionalAccessRules,
          searchKeySetsOfExactUser: freshProfileCache?.searchKeySetsOfExactUser ?? currentSearchKeySetKeys,
        };
        const reactionAccessSnapshotKey = buildAdditionalAccessSnapshotKey(reactionAccessSnapshot);
        const didAccessSnapshotChange = Boolean(
          shouldRefreshReactionIds &&
          currentPagination.ids.length > 0 &&
          currentPagination.accessSnapshotKey !== reactionAccessSnapshotKey
        );
        const reactionIds = shouldRefreshReactionIds || currentPagination.ids.length === 0
          ? await getAccessibleReactionIds(reactionMapIds, reactionAccessSnapshot)
          : currentPagination.ids;

        if (!canApplyLoadMoreResult()) return;

        const loadedIds = didAccessSnapshotChange
          ? new Set()
          : (reactionLoadedIdsRef.current[viewMode] || new Set());
        const page = await loadReactionCardsPage({
          reactionIds,
          reactionMap,
          offset: didAccessSnapshotChange || currentPagination.ids.length === 0 ? 0 : currentPagination.nextOffset,
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
          if (didAccessSnapshotChange) return page.users;
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
            accessSnapshotKey: reactionAccessSnapshotKey,
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
    viewMode,
  });

  const [activeProfileIndex, setActiveProfileIndex] = useState(0);
  const activeProfile = filteredUsers[activeProfileIndex] || null;

  useEffect(() => {
    setActiveProfileIndex(index => {
      if (filteredUsers.length === 0) return 0;
      return Math.min(index, filteredUsers.length - 1);
    });
  }, [filteredUsers.length]);

  const navigateActiveProfile = React.useCallback((step) => {
    setActiveProfileIndex(index => {
      if (filteredUsers.length === 0) return 0;
      const nextIndex = Math.max(0, Math.min(filteredUsers.length - 1, index + step));
      return nextIndex;
    });
  }, [filteredUsers.length]);

  useEffect(() => {
    const handleKeyDown = event => {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isTyping = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;
      if (isTyping) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateActiveProfile(1);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateActiveProfile(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateActiveProfile]);

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
    if (!hasMore || loadingRef.current || loading) return;
    if (filteredUsers.length === 0) return;
    if (activeProfileIndex < filteredUsers.length - 2) return;

    loadMore({ currentVisibleCount: filteredUsers.length });
  }, [activeProfileIndex, filteredUsers.length, hasMore, loadMore, loading, viewMode]);

  useEffect(() => {
    setBackendDownloadToastsEnabled(downloadSizeToastsEnabled);
  }, [downloadSizeToastsEnabled]);

  const handleDownloadSizeToastsToggle = () => {
    setDownloadSizeToastsEnabled(prev => !prev);
  };

  const showBackendTrafficToggle = ownerId === BACKEND_TRAFFIC_TRACKING_TEST_UID;

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
                collectionSourceRef.current = e.target.value;
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
                collectionSourceRef.current = e.target.value;
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
            <CardCount>{filteredUsers.length ? `${activeProfileIndex + 1} / ${filteredUsers.length}` : '0'} карточок</CardCount>
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
              {showBackendTrafficToggle && (
                <BackendTrafficToggleButton
                  type="button"
                  $active={downloadSizeToastsEnabled}
                  aria-pressed={downloadSizeToastsEnabled}
                  title={
                    downloadSizeToastsEnabled
                      ? 'Вимкнути тости щодо розміру завантаження з бекенду'
                      : 'Увімкнути тости щодо розміру завантаження з бекенду'
                  }
                  aria-label={
                    downloadSizeToastsEnabled
                      ? 'Вимкнути тости щодо розміру завантаження з бекенду'
                      : 'Увімкнути тости щодо розміру завантаження з бекенду'
                  }
                  onClick={handleDownloadSizeToastsToggle}
                >
                  📦
                  <BackendTrafficToggleStatus>{downloadSizeToastsEnabled ? 'ON' : 'OFF'}</BackendTrafficToggleStatus>
                </BackendTrafficToggleButton>
              )}
              <ActionButton onClick={() => setShowInfoModal('dotsMenu')}><FaEllipsisV /></ActionButton>
            </TopActions>
          </HeaderContainer>
          {!ownerId && (
            <OwnerStatusMessage>
              {ownerId === '' ? 'Owner not found' : 'Loading owner...'}
            </OwnerStatusMessage>
          )}

          <Grid>
            {activeProfile ? (() => {
              const user = activeProfile;
              const photos = getProfilePhotos(user);
              const photo = photos[0];
              const role = getProfileRole(user);
              const isAgency = role === 'ag' || role === 'ip';
              const nameParts = [
                getCurrentValue(user.name),
                getCurrentValue(user.surname),
              ]
                .filter(Boolean)
                .map(v => String(v).trim())
                .join(' ');
              return (
                <CardContainer key={user.userId}>
                  <CardWrapper $role={role}>
                    <ModernDesktopNavButton
                      type="button"
                      $side="left"
                      onClick={e => { e.stopPropagation(); navigateActiveProfile(-1); }}
                      disabled={activeProfileIndex === 0}
                      aria-label="Previous profile"
                    >
                      <FaChevronLeft />
                    </ModernDesktopNavButton>
                    <ModernDesktopNavButton
                      type="button"
                      $side="right"
                      onClick={e => { e.stopPropagation(); navigateActiveProfile(1); }}
                      disabled={activeProfileIndex >= filteredUsers.length - 1}
                      aria-label="Next profile"
                    >
                      <FaChevronRight />
                    </ModernDesktopNavButton>
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
                      handleRemove={handleRemove}
                      togglePublish={togglePublish}
                      multiDataOwnerId={ownerId}
                      onNavigate={navigateActiveProfile}
                      commentValue={comments[user.userId] || ''}
                      sharedCommentTexts={sharedComments[user.userId] || []}
                      onCommentChange={val => {
                        setComments(prev => ({ ...prev, [user.userId]: val }));
                      }}
                      onCommentBlur={async () => {
                        if (auth.currentUser) {
                          const text = comments[user.userId] || '';
                          const res = await setUserComment(user.userId, text, ownerId);
                          setLocalComment(user.userId, text, res?.lastAction);
                        }
                      }}
                      onAdminEdit={() => {
                        saveScrollPosition();
                        navigate(`/edit/${user.userId}`, { state: user });
                      }}
                    />
                  </CardWrapper>
                </CardContainer>
              );
            })() : loading ? (
              <MatchingSkeleton />
            ) : (
              <OwnerStatusMessage>Немає доступних профілів</OwnerStatusMessage>
            )}
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
