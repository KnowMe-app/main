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
  fetchFavoriteUsersData,
  fetchDislikeUsersData,
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
import { get, onValue, ref as refDb, query, orderByChild, endAt, limitToLast } from 'firebase/database';
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
  getFavoriteCards,
} from '../utils/favoritesStorage';
import {
  cacheDislikedUsers,
  syncDislikes,
  getDislikes,
  getDislikedCards,
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
import { resolveMatchingMultiDataOwnerIds } from 'utils/multiDataAccess';
import { resolvePrioritizedReactionMaps } from 'utils/reactionPriority';

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
const filterMatchingUsers = list => list.filter(u => isMatchingCardId(u?.userId));

const compareUsersByLastLogin2 = (a = {}, b = {}) =>
  (b.lastLogin2 || '').localeCompare(a.lastLogin2 || '');

const FETCH_USERS_BY_IDS_BATCH_SIZE = 100;

const ADDITIONAL_SEARCH_KEY_SET_PROFILE_FIELDS = [
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

const fetchAdditionalNewUsersBySearchIndex = async ({
  rawRules,
  accessUserId,
  searchKeySetKeys,
  offset = 0,
  limit = FETCH_USERS_BY_IDS_BATCH_SIZE,
}) => {
  const indexed = await getIndexedNewUsersIdsByRules({
    rawRules,
    accessUserId,
    searchKeySetKeys,
    fetchMissingBuckets: true,
    resultOffset: offset,
    resultLimit: limit,
  });

  const userIds = Array.isArray(indexed?.userIds) ? indexed.userIds : [];
  const users = await fetchNewUsersByIdsForMatching(userIds);

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
  roleIndexSets,
  collectionSource,
}) =>
  applyMatchingSearchKeyFilters(
    filterMain(
      users.map(u => [u.userId, u]),
      null,
      getMatchingFiltersWithoutSearchKeyGroups(filters),
      favoriteUsers
    ).map(([, u]) => u),
    filters,
    roleIndexSets
  ).filter(u => isAllowedIdForCollection(u.userId, collectionSource));

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
        dislikeUsers={dislikeUsers}
        setDislikeUsers={setDislikeUsers}
        onRemove={handleRemove}
        multiDataOwnerId={multiDataOwnerId}
      />
      <BtnDislike
        userId={user.userId}
        userData={user}
        dislikeUsers={dislikeUsers}
        setDislikeUsers={setDislikeUsers}
        favoriteUsers={favoriteUsers}
        setFavoriteUsers={setFavoriteUsers}
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
  const favoriteUsersRef = useRef(favoriteUsers);
  const dislikeUsersRef = useRef(dislikeUsers);
  const [viewMode, setViewMode] = useState('default');
  const viewModeRef = useRef(viewMode);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
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
  const additionalRulesToastRef = useRef('');
  const additionalFiltersSignature = useMemo(() => JSON.stringify(filters || {}), [filters]);
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
    favoriteUsersRef.current = favoriteUsers;
  }, [favoriteUsers]);

  useEffect(() => {
    dislikeUsersRef.current = dislikeUsers;
  }, [dislikeUsers]);

  useEffect(() => {
    usersRef.current = users;
    const ids = users.map(u => u.userId);
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
  }, [users]);

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
    saveComments(newStore);
    setComments(commentsMap);
    setSharedComments(sharedCommentsMap);
  }, [getMatchingMultiDataOwnerIds]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      if (user) {
        localStorage.setItem('ownerId', user.uid);
        setOwnerId(user.uid);
        setMultiDataOwnerIds(resolveMatchingMultiDataOwnerIds({ viewerId: user.uid }));

        const syncAccessProfile = async () => {
          try {
            const profile = await fetchUserById(user.uid);
            const accessLevel = profile?.accessLevel || '';
            const additionalAccessRules = profile?.additionalAccessRules || '';
            const searchKeySetKeys = getAdditionalSearchKeySetKeysFromProfile(profile);

            setCurrentAccessLevel(accessLevel);
            setCurrentAdditionalAccessRules(additionalAccessRules);
            setCurrentSearchKeySetKeys(searchKeySetKeys);
            localStorage.setItem('accessLevel', accessLevel);
            localStorage.setItem('additionalAccessRules', additionalAccessRules);
            localStorage.setItem('additionalSearchKeySetKeys', searchKeySetKeys.join(','));
            setMultiDataOwnerIds(resolveMatchingMultiDataOwnerIds({ viewerId: user.uid, profile }));
          } catch (error) {
            console.error('Failed to refresh access profile on Matching', error);
            const cachedAccessLevel = localStorage.getItem('accessLevel') || '';
            const cachedAdditionalAccessRules = localStorage.getItem('additionalAccessRules') || '';
            const cachedSearchKeySetKeys = normalizeSearchKeySetKeys(localStorage.getItem('additionalSearchKeySetKeys') || '');
            setCurrentAccessLevel(cachedAccessLevel);
            setCurrentAdditionalAccessRules(cachedAdditionalAccessRules);
            setCurrentSearchKeySetKeys(cachedSearchKeySetKeys);
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
  }, [resetAdditionalMatchingState]);

  useEffect(() => {
    const ownerIds = getMatchingMultiDataOwnerIds();
    if (!ownerIds.length) return undefined;

    const favoriteSnapshots = {};
    const dislikeSnapshots = {};
    const applyPrioritizedReactionMaps = () => {
      const { favorites, dislikes } = resolvePrioritizedReactionMaps({
        ownerIds,
        ownOwnerId: getOwnerId(),
        favoriteSnapshots,
        dislikeSnapshots,
      });
      setFavoriteUsers(favorites);
      syncFavorites(favorites);
      setDislikeUsers(dislikes);
      syncDislikes(dislikes);
    };

    const unsubs = ownerIds.flatMap(effectiveOwnerId => {
      const favRef = refDb(database, `multiData/favorites/${effectiveOwnerId}`);
      const disRef = refDb(database, `multiData/dislikes/${effectiveOwnerId}`);

      const unsubFav = onValue(favRef, snap => {
        favoriteSnapshots[effectiveOwnerId] = snap.exists() ? snap.val() : {};
        applyPrioritizedReactionMaps();
      });
      const unsubDis = onValue(disRef, snap => {
        dislikeSnapshots[effectiveOwnerId] = snap.exists() ? snap.val() : {};
        applyPrioritizedReactionMaps();
      });

      return [unsubFav, unsubDis];
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [getMatchingMultiDataOwnerIds]);

  useEffect(() => {
    let cancelled = false;

    const loadAdditionalNewUsers = async () => {
      if (collectionSource !== 'newUsers') {
        resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
        return;
      }

      if (!parsedAdditionalAccessRules || parsedAdditionalAccessRules.length === 0) {
        resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
        return;
      }

      resetAdditionalMatchingState({ resetHasMore: true });
      loadingRef.current = true;
      setLoading(true);

      try {
        const loaded = await fetchAdditionalNewUsersBySearchIndex({
          parsedRuleGroups: parsedAdditionalAccessRules,
          rawRules: currentAdditionalAccessRules,
          accessUserId: ownerId,
          searchKeySetKeys: currentSearchKeySetKeys,
          offset: 0,
          limit: INITIAL_LOAD,
        });

        if (!cancelled) {
          setAdditionalNewUsers(loaded.users);
          setAdditionalNextOffset(loaded.nextOffset);
          loadedIdsRef.current = new Set(loaded.users.map(user => user.userId).filter(Boolean));
          setHasMore(loaded.hasMore);
          setLastKey(null);
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
        if (!cancelled) {
          resetAdditionalMatchingState({ resetHasMore: false });
          setHasMore(false);
        }
      } finally {
        if (!cancelled) {
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
    additionalFiltersSignature,
    collectionSource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    loadCommentsFor,
    ownerId,
    parsedAdditionalAccessRules,
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

        const filtered = isAdmin
          ? applyMatchingSearchKeyFilters(
              filterMain(
                sourceRes.users.map(u => [u.userId, u]),
                null,
                getMatchingFiltersWithoutSearchKeyGroups(filters),
                favoriteUsersRef.current
              ).map(([, u]) => u),
              filters,
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
    [collectionSource, filters, isAdmin, parsedAdditionalAccessRules.length, roleIndexSets]
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
        const [favMaps, disMaps] = await Promise.all([
          Promise.all(owners.map(owner => fetchFavoriteUsers(owner))),
          Promise.all(owners.map(owner => fetchDislikeUsers(owner))),
        ]);
        const favoriteSnapshots = Object.fromEntries(owners.map((owner, index) => [owner, favMaps[index]]));
        const dislikeSnapshots = Object.fromEntries(owners.map((owner, index) => [owner, disMaps[index]]));
        const { favorites: favIds, dislikes: disIds } = resolvePrioritizedReactionMaps({
          ownerIds: owners,
          ownOwnerId: getOwnerId(),
          favoriteSnapshots,
          dislikeSnapshots,
        });
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
    setViewMode('default');
    loadInitial();
  }, [loadInitial]);

  const resetFiltersAndCache = React.useCallback(() => {
    localStorage.removeItem('matchingFilters');
    localStorage.removeItem(SEARCH_KEY);
    clearAllCardsCache();
    setFilterResetToken(prev => prev + 1);
    reloadDefault();
    toast.success('Фільтри та кеш скинуто');
  }, [reloadDefault]);

  const loadFavoriteCards = async () => {
    setViewMode('favorites');
    setLoading(true);
    setUsers([]);
    const owners = await waitForOwnerId();
    if (!owners.length) {
      setLoading(false);
      return;
    }

    const [favoriteMaps, dislikeMaps] = await Promise.all([
      Promise.all(owners.map(owner => fetchFavoriteUsers(owner))),
      Promise.all(owners.map(owner => fetchDislikeUsers(owner))),
    ]);
    const favoriteSnapshots = Object.fromEntries(owners.map((owner, index) => [owner, favoriteMaps[index]]));
    const dislikeSnapshots = Object.fromEntries(owners.map((owner, index) => [owner, dislikeMaps[index]]));
    const { favorites: favMap, dislikes: disMap } = resolvePrioritizedReactionMaps({
      ownerIds: owners,
      ownOwnerId: getOwnerId(),
      favoriteSnapshots,
      dislikeSnapshots,
    });
    const favDataByOwner = await Promise.all(owners.map(owner => fetchFavoriteUsersData(owner)));
    const favUsers = Object.assign({}, ...favDataByOwner);
    syncFavorites(favMap);
    syncDislikes(disMap);
    setFavoriteUsers(favMap);
    setDislikeUsers(disMap);
    setFavoriteIds(favMap);
    cacheFavoriteUsers(favUsers);
    setIdsForQuery('favorite', Object.keys(favMap));
    const { cards: favCards } = await getFavoriteCards(id => fetchUserById(id));
    const list = filterMatchingUsers(favCards).sort(compareUsersByLastLogin2);
    loadedIdsRef.current = new Set(list.map(u => u.userId));
    setUsers(list);
    await loadCommentsFor(list);
    setHasMore(false);
    setLastKey(null);
    setLoading(false);
  };

  const loadDislikeCards = async () => {
    setViewMode('dislikes');
    setLoading(true);
    setUsers([]);
    const owners = await waitForOwnerId();
    if (!owners.length) {
      setLoading(false);
      return;
    }

    const [favoriteMaps, dislikeMaps] = await Promise.all([
      Promise.all(owners.map(owner => fetchFavoriteUsers(owner))),
      Promise.all(owners.map(owner => fetchDislikeUsers(owner))),
    ]);
    const favoriteSnapshots = Object.fromEntries(owners.map((owner, index) => [owner, favoriteMaps[index]]));
    const dislikeSnapshots = Object.fromEntries(owners.map((owner, index) => [owner, dislikeMaps[index]]));
    const { favorites: favMap, dislikes: disMap } = resolvePrioritizedReactionMaps({
      ownerIds: owners,
      ownOwnerId: getOwnerId(),
      favoriteSnapshots,
      dislikeSnapshots,
    });
    const dislikeDataByOwner = await Promise.all(owners.map(owner => fetchDislikeUsersData(owner)));
    const loaded = Object.assign({}, ...dislikeDataByOwner);
    cacheDislikedUsers(loaded);
    syncFavorites(favMap);
    setFavoriteUsers(favMap);
    syncDislikes(disMap);
    setDislikeUsers(disMap);
    setIdsForQuery('dislike', Object.keys(disMap));
    const { cards: disCards } = await getDislikedCards(id => fetchUserById(id));
    const list = filterMatchingUsers(disCards).sort(compareUsersByLastLogin2);
    loadedIdsRef.current = new Set(list.map(u => u.userId));
    setUsers(list);
    await loadCommentsFor(list);
    setHasMore(false);
    setLastKey(null);
    setLoading(false);
  };

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
    if (!hasMore || loadingRef.current || viewMode !== 'default') {
      console.log('[loadMore] skip', { hasMore, loading: loadingRef.current, viewMode });
      return;
    }
    console.log('[loadMore] start', { lastKey, hasMore });
    loadingRef.current = true;
    setLoading(true);
    try {
      const baseExclude = new Set([
        ...Object.keys(favoriteUsersRef.current),
        ...Object.keys(dislikeUsersRef.current),
      ]);

      if (collectionSource === 'newUsers' && parsedAdditionalAccessRules.length > 0) {
        const collected = [];
        let nextOffset = additionalNextOffset;
        let canLoadMoreAdditional = true;
        let visibleCount = Math.max(0, Number(currentVisibleCount) || 0);
        const requiredVisibleCount = Math.max(0, Number(targetVisibleCount) || 0);
        let loadedPages = 0;

        while (
          canLoadMoreAdditional &&
          loadedPages < ADDITIONAL_BACKFILL_MAX_PAGES &&
          (collected.length === 0 || visibleCount < requiredVisibleCount)
        ) {
          loadedPages += 1;
          // eslint-disable-next-line no-await-in-loop
          const loaded = await fetchAdditionalNewUsersBySearchIndex({
            rawRules: currentAdditionalAccessRules,
            accessUserId: ownerId,
            searchKeySetKeys: currentSearchKeySetKeys,
            offset: nextOffset,
            limit: LOAD_MORE,
          });

          const pageUsers = loaded.users.filter(user =>
            user?.userId &&
            !baseExclude.has(user.userId) &&
            !loadedIdsRef.current.has(user.userId) &&
            !collected.some(collectedUser => collectedUser.userId === user.userId)
          );
          collected.push(...pageUsers);

          const candidateMap = new Map(additionalNewUsers.map(user => [user.userId, user]));
          collected.forEach(user => candidateMap.set(user.userId, user));
          visibleCount = applyMatchingUiFiltersToUsers({
            users: Array.from(candidateMap.values()),
            filters,
            favoriteUsers: favoriteUsersRef.current,
            roleIndexSets,
            collectionSource,
          }).length;

          canLoadMoreAdditional = Boolean(loaded.hasMore) && loaded.nextOffset > nextOffset;
          nextOffset = loaded.nextOffset;
        }

        collected.forEach(user => {
          loadedIdsRef.current.add(user.userId);
          updateCard(user.userId, user);
        });
        setAdditionalNewUsers(prev => {
          const map = new Map(prev.map(user => [user.userId, user]));
          collected.forEach(user => map.set(user.userId, user));
          return Array.from(map.values());
        });
        await loadCommentsFor(collected);
        setAdditionalNextOffset(nextOffset);
        setHasMore(canLoadMoreAdditional);
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
      loadingRef.current = false;
      setLoading(false);
    }
  }, [
    additionalNewUsers,
    additionalNextOffset,
    collectionSource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    defaultListKey,
    fetchChunk,
    filters,
    hasMore,
    lastKey,
    loadCommentsFor,
    ownerId,
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


  const visibleUsers = useMemo(() => {
    let baseUsers = isAdmin
      ? users
      : users.filter(user => user.__sourceCollection === 'newUsers' || user.publish === true);

    const hasAdditionalAccessRules = parsedAdditionalAccessRules.length > 0;
    if (hasAdditionalAccessRules) {
      const allowedBySetKey = new Set(additionalNewUsers.map(user => user.userId).filter(Boolean));
      baseUsers = baseUsers.filter(user => {
        if (user?.__sourceCollection !== 'newUsers') return true;
        return collectionSource !== 'newUsers' || allowedBySetKey.has(user.userId);
      });
    }

    const shouldInjectAdditionalCards =
      viewMode === 'default' &&
      collectionSource === 'newUsers' &&
      hasAdditionalAccessRules &&
      additionalNewUsers.length > 0;

    const byId = new Map(baseUsers.map(user => [user.userId, user]));
    if (shouldInjectAdditionalCards) {
      additionalNewUsers.forEach(user => {
        const existing = byId.get(user.userId);
        if (existing) {
          byId.set(user.userId, { ...existing, ...user });
        } else {
          byId.set(user.userId, user);
        }
      });
    }

    const mergedUsers = Array.from(byId.values());
    if (viewMode !== 'default') {
      return baseUsers;
    }

    return mergedUsers.filter(
      user => !favoriteUsers[user.userId] && !dislikeUsers[user.userId]
    );
  }, [
    additionalNewUsers,
    dislikeUsers,
    favoriteUsers,
    isAdmin,
    parsedAdditionalAccessRules,
    users,
    viewMode,
    collectionSource,
  ]);

  const filteredUsers = applyMatchingUiFiltersToUsers({
    users: visibleUsers,
    filters,
    favoriteUsers,
    roleIndexSets,
    collectionSource,
  });

  useEffect(() => {
    if (viewMode !== 'default') return;
    if (loadingRef.current || loading) return;
    if (!hasMore) return;
    if (filteredUsers.length >= INITIAL_LOAD) return;

    loadMore({
      currentVisibleCount: filteredUsers.length,
      targetVisibleCount: INITIAL_LOAD,
    });
  }, [filteredUsers.length, hasMore, loadMore, loading, viewMode]);

  useEffect(() => {
    if (viewMode !== 'default') return;
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
                resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
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
                resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
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
          onChange={setFilters}
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
                        dislikeUsers={dislikeUsers}
                        setDislikeUsers={setDislikeUsers}
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

          {viewMode === 'default' && (
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
