import React, { useEffect, useState, useRef, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resolveAccess } from 'utils/accessLevel';
import {
  ActionButton,
  AdminToggle,
  AnimatedCard,
  CardContainer,
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
  OwnerStatusMessage,
  SharedCommentText,
  SkeletonCardInner,
  SkeletonInfo,
  SkeletonLine,
  SkeletonPhoto,
  SubmitButton,
  ThemeToggleButton,
  ThemeToggleKnob,
  ThemeToggleScene,
  ThemeToggleTrackIcon,
  TopActions,
  ModernActionRail,
  ModernBioText,
  ModernChip,
  ModernChipGrid,
  ModernContactDetails,
  ModernContactLinks,
  ModernContactLink,
  ModernContactSummary,
  ModernFieldList,
  ModernFieldRow,
  ModernDesktopNavButton,
  ModernFactPill,
  ModernHero,
  ModernHeroContent,
  ModernHeroFacts,
  ModernHeroFallbackMark,
  ModernHeroImage,
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
  lazyLoadProfilePhotos,
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
import SearchBar from './SearchBar';
import PhotoViewer from './PhotoViewer';
import FilterPanel from './FilterPanel';
import { useAutoResize } from '../hooks/useAutoResize';
import { getCacheKey, clearAllCardsCache, setFavoriteIds } from "../utils/cache";
import { incrementMatchingLoadStat, logMatchingLocalStorageCacheStats, normalizeQueryKey, getIdsByQuery, setIdsForQuery, getCard } from '../utils/cardIndex';
import {
  cleanupMatchingLocalStorageCache,
  clearMatchingLocalStorageCache,
  logMatchingLocalStorageDebugStats,
} from '../utils/searchKeyCache';
import { getCardsByList, updateCard } from '../utils/cardsStorage';
import { getCurrentDate } from './foramtDate';
import InfoModal from './InfoModal';
import { FaFacebookF, FaFilter, FaTimes, FaHeart, FaEllipsisV, FaDownload, FaInstagram, FaTelegramPlane, FaViber, FaWhatsapp, FaVk, FaGlobe, FaLinkedin, FaYoutube, FaChevronLeft, FaChevronRight, FaMapMarkerAlt } from 'react-icons/fa';
import { FaPhoneVolume, FaXTwitter } from 'react-icons/fa6';
import { MdEmail } from 'react-icons/md';
import { SiTiktok } from 'react-icons/si';
import { getContactEntries, CONTACT_LINK_BUILDERS } from './contactMethods';
import { handleEmptyFetch } from './loadMoreUtils';
import { collectMatchingIndexedLoadMorePage } from 'utils/matchingIndexedLoadMore';
import {
  getHeroFields,
  getQuickFacts,
  getProfileAge,
  getProfileBio,
  getProfileLocation,
  getProfileName,
  getProfilePhotos,
  getProfileRole,
  getProfileSections,
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
  checkReactionNewUsersMembership,
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
import {
  applyMatchingUiFiltersToUsers,
  buildMatchingIndexFilterGroups,
  compareUsersByLastLogin2,
  fetchAdditionalNewUsersBySearchIndex,
  fetchFilteredMatchingSourceChunk,
  fetchMatchingIndexedCandidates,
  fetchNewUsersByIdsForMatching as fetchNewUsersByIdsForMatchingData,
  getActiveMatchingFiltersDebug,
  isAllowedIdForMatchingCollection,
  isMatchingCardId,
  isSameMatchingCursor,
  isShortMatchingUserId,
  isValidMatchingUserId,
} from 'utils/matchingDataProvider';


const DEBUG_ADDITIONAL_MATCHING_USER_ID = BACKEND_TRAFFIC_TRACKING_TEST_UID;
const MATCHING_LOG_MODE_TEST_USER_ID = 'S0VhDLCYjuTFDNLalRa85u7fPcg2';
const MATCHING_DEBUG_LOG_MODE_KEY = 'matchingDebugLogMode';
const DEBUG_SHARED_OWNER_ID = 'stFMfZ8CqQX05L8vK9Yse6FdYIh1';
const DEBUG_SHARED_NEW_USER_ID = 'ID0001';
const ADDITIONAL_PROFILE_CACHE_TTL_MS = 45 * 1000;
const ADDITIONAL_MATCHING_LOG_LIMIT = 300;
const buildEmptyReactionPagination = () => ({ ids: [], nextOffset: 0, hasMore: false, accessSnapshotKey: '' });
const MATCHING_REACTION_IDLE_STYLE = { background: 'rgba(247, 147, 30, 0.95)' };

const shouldDebugAdditionalMatching = (...ids) =>
  ids.some(id => {
    const normalizedId = String(id || '').trim();
    return normalizedId === DEBUG_ADDITIONAL_MATCHING_USER_ID || normalizedId === MATCHING_LOG_MODE_TEST_USER_ID;
  });

const getStoredMatchingDebugLogMode = () => {
  if (typeof localStorage === 'undefined') return 'console';
  return localStorage.getItem(MATCHING_DEBUG_LOG_MODE_KEY) === 'file' ? 'file' : 'console';
};

const isMatchingDebugFileMode = () => {
  if (typeof window === 'undefined') return false;
  return window.__MATCHING_DEBUG_LOG_MODE === 'file';
};

const getMatchingDebugLogsStore = () => {
  if (typeof window === 'undefined') return null;
  if (!Array.isArray(window.__MATCHING_DEBUG_LOGS)) {
    window.__MATCHING_DEBUG_LOGS = [];
  }
  return window.__MATCHING_DEBUG_LOGS;
};

const downloadMatchingDebugLogs = ({ reason = 'manual' } = {}) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const logs = getMatchingDebugLogsStore() || [];
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
    testUserId: MATCHING_LOG_MODE_TEST_USER_ID,
    logMode: window.__MATCHING_DEBUG_LOG_MODE || 'console',
    reason,
    logs,
  };
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `matching-debug-${fileStamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  return true;
};

const writeMatchingDebugLog = (stage, data = {}, errors = null) => {
  const store = getMatchingDebugLogsStore();
  if (!store) return;
  store.push({
    timestamp: new Date().toISOString(),
    stage,
    payload: data,
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

  if (isMatchingDebugFileMode()) {
    writeMatchingDebugLog(`additionalMatching:${message}`, { ...data, compact });
    logAdditionalMatchingDebug(accessUserId, message, data);
    return;
  }

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
  if (isMatchingDebugFileMode()) {
    writeMatchingDebugLog(`sharedReactions:${message}`, data);
    return;
  }
  console.info('[Matching][sharedReactions debug]', message, data);
};

const summarizeUsersForReactionDebug = (users, limit = 25) => ({
  count: (users || []).length,
  ids: (users || []).map(user => user?.userId).filter(Boolean).slice(0, limit),
  sources: (users || []).slice(0, limit).map(user => ({
    userId: user?.userId,
    source: user?.__sourceCollection,
    publish: user?.publish,
    matchingAccessAllowed: user?.__matchingAccessAllowed,
    fromCardCache: user?.__fromCardCache,
  })),
});

const summarizeReactionMapForDebug = map => summarizeIdsForDebug(Object.keys(normalizeReactionMap(map)));

const debugReactionFlowLog = (stage, data = {}) => {
  if (isMatchingDebugFileMode()) {
    writeMatchingDebugLog(`reactionDebug:${stage}`, data);
    return;
  }
  console.info('[Matching][reactionDebug]', stage, data);
};

const debugMissingNewUsersToast = (accessUserId, indexedCount) => {
  if (!shouldDebugAdditionalMatching(accessUserId) || indexedCount <= 0) return;

  logAdditionalMatchingDebug(accessUserId, 'missing fetched newUsers records', { indexedCount });
};

const get = (...args) => {
  incrementMatchingLoadStat('rtdbReads');
  return withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'Matching',
    path: args[0],
  });
};

const onValue = wrapAdminOnValue(firebaseOnValue, {
  operation: 'onValue',
  source: 'Matching',
});

// Filter out users with invalid identifiers; Firebase push IDs are usually 20 chars.
const isValidId = isValidMatchingUserId;
const isShortId = isShortMatchingUserId;
const isAllowedIdForCollection = isAllowedIdForMatchingCollection;
const NEW_USERS_USER_ID_PREFIXES = ['-O', 'AA', 'AB', 'VK', 'ID'];
const isLikelyNewUsersUserId = id => {
  const value = String(id || '').trim();
  return Boolean(value) && (
    isShortId(value) ||
    NEW_USERS_USER_ID_PREFIXES.some(prefix => value.startsWith(prefix))
  );
};
const getPreferredReactionSources = id => (
  isLikelyNewUsersUserId(id) ? ['newUsers', 'users'] : ['users', 'newUsers']
);

const canShowReactionTabCard = (card, { isAdmin = false } = {}) => {
  if (!card?.userId) return false;
  const source = card.__sourceCollection || (isShortId(card.userId) ? 'newUsers' : 'users');
  if (source === 'newUsers') {
    return card.__matchingAccessAllowed !== false;
  }
  if (isAdmin) return true;
  return card.publish !== false;
};

const FETCH_USERS_BY_IDS_BATCH_SIZE = 100;
const fetchNewUsersByIdsForMatching = (ids, batchSize = FETCH_USERS_BY_IDS_BATCH_SIZE) =>
  fetchNewUsersByIdsForMatchingData({
    ids,
    batchSize,
    get,
    ref: refDb,
    database,
    getAllUserPhotos,
  });

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

const ProfileFieldRows = ({ fields }) => {
  if (!fields.length) return null;
  return (
    <ModernFieldList>
      {fields.map(field => (
        <ModernFieldRow key={`${field.key}-${field.label}`}>
          <strong>{field.label}</strong>
          <span>{field.value}</span>
        </ModernFieldRow>
      ))}
    </ModernFieldList>
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


const HERO_FACT_UNITS = {
  height: 'cm',
  weight: 'kg',
};

const formatHeroFact = item => {
  const rawValue = String(item?.value || '').trim();
  const preferredUnit = HERO_FACT_UNITS[item?.key];
  if (!rawValue) return { value: '', unit: preferredUnit || '' };

  if (preferredUnit) {
    const withoutUnit = rawValue.replace(new RegExp(`\\s*${preferredUnit}$`, 'i'), '').trim();
    return { value: withoutUnit || rawValue, unit: preferredUnit };
  }

  const unitMatch = rawValue.match(/^(.+?)\s*(cm|kg|кг|см)$/i);
  if (unitMatch) return { value: unitMatch[1].trim(), unit: unitMatch[2] };
  return { value: rawValue, unit: '' };
};

const SwipeableCard = ({
  user,
  photo,
  role,
  isAgency,
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
  const allPhotos = [heroPhoto, ...photos].filter(Boolean).filter((item, index, list) => list.indexOf(item) === index);
  const [activeHeroPhoto, setActiveHeroPhoto] = useState(heroPhoto);
  const [viewerIndex, setViewerIndex] = useState(null);
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

  const profileName = getProfileName(user);
  const roleLabel = getRoleLabel(resolvedRole);
  const isGenericProfileRole = roleLabel === 'Profile';
  const name = profileName || '';
  const age = getProfileAge(user);
  const title = [name, age].filter(Boolean).join(', ');
  const shouldShowRoleBadge = !isGenericProfileRole;
  const locationInfo = getProfileLocation(user);
  const identityAndLocationKeys = ['name', 'surname', 'agencyName', 'companyName', 'agency', 'country', 'region', 'city', 'role', 'userRole'];
  const heroFields = getHeroFields(user, resolvedRole, { excludeKeys: identityAndLocationKeys });
  const usedSummaryFieldKeys = collectProfileFieldKeys(heroFields);
  const bodyHeroFields = getQuickFacts(user, resolvedRole, { excludeKeys: [...identityAndLocationKeys, ...usedSummaryFieldKeys] });
  const usedBodyFieldKeys = collectProfileFieldKeys(bodyHeroFields);
  const sections = getProfileSections(user, resolvedRole, { excludeKeys: [...identityAndLocationKeys, ...usedSummaryFieldKeys, ...usedBodyFieldKeys] });
  const bio = getProfileBio(user);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
  const shouldShowHeroContent = Boolean(title || locationInfo || heroFields.length > 0);
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

  const openPhotoViewer = index => event => {
    if (event) event.stopPropagation();
    if (swipedRef.current || index < 0 || !allPhotos[index]) return;
    setViewerIndex(index);
  };

  const openHeroViewer = event => {
    const heroIndex = allPhotos.indexOf(activeHeroPhoto);
    openPhotoViewer(heroIndex === -1 ? 0 : heroIndex)(event);
  };

  const handleHeroKeyDown = event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openHeroViewer(event);
  };

  return (
    <>
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
        <ModernHero
          $image={activeHeroPhoto}
          $clickable={!!activeHeroPhoto}
          role={activeHeroPhoto ? 'button' : undefined}
          tabIndex={activeHeroPhoto ? 0 : undefined}
          aria-label={activeHeroPhoto ? `Open ${name || 'matching profile'} photo` : undefined}
          onClick={activeHeroPhoto ? openHeroViewer : undefined}
          onKeyDown={activeHeroPhoto ? handleHeroKeyDown : undefined}
        >
          {!activeHeroPhoto && initials && <ModernHeroFallbackMark>{initials}</ModernHeroFallbackMark>}
          {activeHeroPhoto && <ModernHeroImage src={activeHeroPhoto} alt={`${name || 'Matching'} profile hero`} onError={() => setActiveHeroPhoto('')} />}
          {shouldShowRoleBadge && <ModernRoleBadge $role={resolvedRole}>{roleLabel}</ModernRoleBadge>}
        </ModernHero>
        {shouldShowHeroContent && (
          <ModernHeroContent>
            {title && <ModernHeroTitle>{title}</ModernHeroTitle>}
            {locationInfo && <ModernHeroLocation><FaMapMarkerAlt aria-hidden="true" />{locationInfo}</ModernHeroLocation>}
            {heroFields.length > 0 && (
              <ModernHeroFacts>
                {heroFields.slice(0, 6).map(item => {
                  const fact = formatHeroFact(item);
                  return (
                    <ModernFactPill key={`hero-${item.key}`}>
                      <span className="fact-value">{fact.value}</span>
                      <span className="fact-label">{fact.unit || item.label}</span>
                    </ModernFactPill>
                  );
                })}
              </ModernHeroFacts>
            )}
          </ModernHeroContent>
        )}
        {isAdmin && (
          <AdminToggle published={user.publish} onClick={e => { e.stopPropagation(); togglePublish(user); }} />
        )}
        <ModernProfileBody>
          <ProfileBio text={bio} />
          {bodyHeroFields.length > 0 && (
            <ModernSection>
              <ModernSectionTitle>Key details</ModernSectionTitle>
              <ProfileChips fields={bodyHeroFields} role={resolvedRole} />
            </ModernSection>
          )}
          {sections.filter(section => section.variant !== 'contacts').map(section => (
            <ModernSection key={section.title}>
              <ModernSectionTitle>{section.title}</ModernSectionTitle>
              {section.variant === 'chips' || section.title === 'Appearance' ? (
                <ProfileChips fields={section.fields} role={resolvedRole} />
              ) : (
                <ProfileFieldRows fields={section.fields} />
              )}
            </ModernSection>
          ))}
          {sections.filter(section => section.variant === 'contacts').map(section => (
            <ModernSection key={section.title}>
              <ModernContactDetails onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                <ModernContactSummary>Show contacts</ModernContactSummary>
                <ProfileContactLinks user={user} role={resolvedRole} />
              </ModernContactDetails>
            </ModernSection>
          ))}
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
        </ModernProfileBody>
        </ModernProfileScroll>
        <ModernActionRail>
          <span ref={dislikeButtonWrapRef}>
            <BtnDislike userId={user.userId} userData={user} dislikeUsers={dislikeUsers} setDislikeUsers={setDislikeUsers} ownDislikeUsers={ownDislikeUsers} setOwnDislikeUsers={setOwnDislikeUsers} favoriteUsers={favoriteUsers} setFavoriteUsers={setFavoriteUsers} ownFavoriteUsers={ownFavoriteUsers} setOwnFavoriteUsers={setOwnFavoriteUsers} onRemove={handleRemove} multiDataOwnerId={multiDataOwnerId} customStyle={MATCHING_REACTION_IDLE_STYLE} />
          </span>
          <span ref={favoriteButtonWrapRef}>
            <BtnFavorite userId={user.userId} userData={user} favoriteUsers={favoriteUsers} setFavoriteUsers={setFavoriteUsers} ownFavoriteUsers={ownFavoriteUsers} setOwnFavoriteUsers={setOwnFavoriteUsers} dislikeUsers={dislikeUsers} setDislikeUsers={setDislikeUsers} ownDislikeUsers={ownDislikeUsers} setOwnDislikeUsers={setOwnDislikeUsers} onRemove={handleRemove} multiDataOwnerId={multiDataOwnerId} customStyle={MATCHING_REACTION_IDLE_STYLE} />
          </span>
        </ModernActionRail>
      </ModernProfileShell>
      </AnimatedCard>
      {viewerIndex !== null && allPhotos.length > 0 && (
        <PhotoViewer photos={allPhotos} index={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </>
  );
};

const INITIAL_LOAD = 5;
const MATCHING_VISIBLE_BUFFER = 2;
const MATCHING_REFILL_LIMIT = 5;
const LOAD_MORE = 5;
const MATCHING_INDEXED_LOAD_MORE_MAX_PAGES = 2;
const ADDITIONAL_BACKFILL_MAX_PAGES = 2;
const MATCHING_AUTO_LOAD_MORE_COOLDOWN_MS = 700;
const MATCHING_MAX_EMPTY_AUTO_LOAD_MORE_ATTEMPTS = 2;
const SCROLL_Y_KEY = 'matchingScrollY';
const SEARCH_KEY = 'matchingSearchQuery';
const COLLECTION_SOURCE_KEY = 'matchingCollectionSource';
const MATCHING_THEME_KEY = 'matchingThemeMode';

const getStoredMatchingTheme = () => {
  try {
    const storedTheme = localStorage.getItem(MATCHING_THEME_KEY) || sessionStorage.getItem(MATCHING_THEME_KEY);
    return storedTheme === 'light' ? 'light' : 'dark';
  } catch (error) {
    return 'dark';
  }
};

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
  const [activeProfileIndex, setActiveProfileIndex] = useState(0);
  const [matchingDebugLogMode, setMatchingDebugLogMode] = useState(getStoredMatchingDebugLogMode);
  const [themeMode, setThemeMode] = useState(getStoredMatchingTheme);
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
  const [photoCacheByUserId, setPhotoCacheByUserId] = useState({});
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
  const reactionSourceByIdRef = useRef({});
  const reactionClassificationRequestsRef = useRef(new Map());
  const reactionAccessRequestsRef = useRef(new Map());
  const loadInitialVersionRef = useRef(0);
  const additionalRulesToastRef = useRef('');
  const additionalProfileCacheRef = useRef(null);
  const additionalProfileRequestVersionRef = useRef(0);
  const additionalMatchingFetchVersionRef = useRef(0);
  const additionalLoadMoreFetchVersionRef = useRef(0);
  const additionalMatchingApplyVersionRef = useRef(0);
  const reactionLoadVersionRef = useRef(0);
  const sharedReactionCandidateLoadVersionRef = useRef(0);
  const autoLoadMoreLastRunRef = useRef(0);
  const autoLoadMoreSignatureRef = useRef('');
  const emptyAutoLoadMoreAttemptsRef = useRef(0);
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
    setAdditionalNewUsers(prev => prev.filter(u => u.userId !== id));
    setSharedReactionCandidateUsers(prev => prev.filter(u => u.userId !== id));
  };
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  useEffect(() => {
    try {
      localStorage.setItem(MATCHING_THEME_KEY, themeMode);
      sessionStorage.setItem(MATCHING_THEME_KEY, themeMode);
    } catch (error) {
      // Theme persistence is non-critical; keep the in-memory theme if storage is unavailable.
    }
    document.documentElement.dataset.matchingTheme = themeMode;
  }, [themeMode]);
  const handleThemeToggle = React.useCallback(() => {
    setThemeMode(current => (current === 'light' ? 'dark' : 'light'));
  }, []);
  useEffect(() => {
    emptyAutoLoadMoreAttemptsRef.current = 0;
    autoLoadMoreSignatureRef.current = '';
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
    const debugMatchingCache = isAdmin || shouldDebugAdditionalMatching(ownerId);
    const cleanupStats = cleanupMatchingLocalStorageCache({ debug: debugMatchingCache });

    if (debugMatchingCache) {
      logMatchingLocalStorageCacheStats('matching mount');
      logMatchingLocalStorageDebugStats('matching mount');
      console.info('[Matching cache] cleanup summary:', cleanupStats);
    }
  }, [isAdmin, ownerId]);

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
  const waitForOwnerId = React.useCallback(() =>
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
    }), [getMatchingMultiDataOwnerIds]);

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
    void loadCommentsFor(filtered);
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
    const ownOwnerId = getOwnerId();
    if (ownOwnerId) pruneComments(ownOwnerId, ids);
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

  const loadCommentsFor = React.useCallback(async (list, { force = false, activeOnly = true } = {}) => {
    const owners = getMatchingMultiDataOwnerIds();
    const ownOwnerId = getOwnerId();
    if (!owners.length || !ownOwnerId) return;
    const sourceList = activeOnly ? (list || []).slice(0, 1) : (list || []);
    const ids = Array.from(new Set(sourceList.map(u => u?.userId).filter(Boolean)));
    if (!ids.length) return;

    const requestContext = {
      viewMode: viewModeRef.current,
      collectionSource: collectionSourceRef.current,
      filtersSignature: stableAdditionalSignature(filtersRef.current || {}),
      ownerId: ownOwnerId,
      ownersSignature: stableAdditionalSignature(owners),
    };
    const canApplyCommentsResult = () => (
      requestContext.viewMode === viewModeRef.current &&
      requestContext.collectionSource === collectionSourceRef.current &&
      requestContext.filtersSignature === stableAdditionalSignature(filtersRef.current || {}) &&
      requestContext.ownerId === getOwnerId() &&
      requestContext.ownersSignature === stableAdditionalSignature(getMatchingMultiDataOwnerIds())
    );

    const cache = loadComments();
    const fetchedEntries = await Promise.all(
      owners.map(async owner => {
        const ownerCache = cache[owner] || {};
        const missingIds = force ? ids : ids.filter(id => !ownerCache[id]);
        if (!missingIds.length) return { owner, comments: {}, requestedIds: [] };
        return { owner, comments: await fetchUserComments(owner, missingIds), requestedIds: missingIds };
      })
    );

    const latestStore = loadComments();
    const nextStore = { ...latestStore };
    fetchedEntries.forEach(({ owner, comments: ownerComments = {}, requestedIds = [] }) => {
      nextStore[owner] = { ...(nextStore[owner] || {}) };
      requestedIds.forEach(id => {
        const serverComments = ownerComments?.[id] || [];
        const newestServer = [...serverComments].sort((a, b) => (b.lastAction || 0) - (a.lastAction || 0))[0];
        const local = nextStore[owner][id];
        if (shouldUseServerComment(newestServer, local)) {
          nextStore[owner][id] = {
            ...newestServer,
            text: String(newestServer.text || ''),
            lastAction: newestServer.lastAction || Date.now(),
            cachedAt: Date.now(),
          };
        } else if (local) {
          nextStore[owner][id] = { ...local, cachedAt: local.cachedAt || Date.now() };
        } else {
          nextStore[owner][id] = { text: '', lastAction: Date.now(), cachedAt: Date.now(), empty: true };
        }
      });
    });

    const commentsMap = {};
    const sharedCommentsMap = {};
    ids.forEach(id => {
      const ownEntry = nextStore?.[ownOwnerId]?.[id];
      if (ownEntry && !ownEntry.empty) commentsMap[id] = ownEntry.text || '';

      sharedCommentsMap[id] = owners
        .filter(owner => owner !== ownOwnerId)
        .map(owner => nextStore?.[owner]?.[id])
        .filter(entry => entry && !entry.empty)
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
    saveComments(nextStore);
    if (!canApplyCommentsResult()) return;
    setComments(prev => ({ ...prev, ...commentsMap }));
    setSharedComments(prev => ({ ...prev, ...sharedCommentsMap }));
  }, [getMatchingMultiDataOwnerIds]);

  useEffect(() => {
    if (!usersRef.current.length || !multiDataOwnerIds.length) return;
    loadCommentsFor(usersRef.current);
  }, [loadCommentsFor, multiDataOwnerIds]);



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
            const rawMultiDataAccessUserIds = profile?.[MULTI_DATA_ACCESS_FIELD];
            const accessOwnerIds = parseMultiDataAccessUserIds(rawMultiDataAccessUserIds);
            const resolvedOwnerIds = resolveMatchingMultiDataOwnerIds({ viewerId: user.uid, profile });
            debugSharedReactionsLog(user.uid, 'ownerIds read from multiDataAccessUserIds', {
              rawMultiDataAccessUserIds,
              sharedOwnerIds: accessOwnerIds,
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
      const sharedFavoriteIds = uniqueTruthyReactionIds(
        sharedOwnerIds.map(sharedOwnerId => favoriteSnapshots[sharedOwnerId])
      );
      const sharedDislikeIds = uniqueTruthyReactionIds(
        sharedOwnerIds.map(sharedOwnerId => dislikeSnapshots[sharedOwnerId])
      );
      debugSharedReactionsLog(ownOwnerId, 'priority merge applied for shared reactions', {
        ownerIds,
        availableOwnerIds,
        sharedOwnerIds,
        loadedReactionCountByOwnerId: sharedOwnerIds.reduce((acc, sharedOwnerId) => {
          const ownerFavoritesCount = Object.keys(normalizeReactionMap(favoriteSnapshots[sharedOwnerId])).length;
          const ownerDislikesCount = Object.keys(normalizeReactionMap(dislikeSnapshots[sharedOwnerId])).length;
          acc[sharedOwnerId] = {
            favorites: ownerFavoritesCount,
            dislikes: ownerDislikesCount,
            total: ownerFavoritesCount + ownerDislikesCount,
          };
          return acc;
        }, {}),
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
        finalMergedSharedFavoritesCount: sharedFavoriteIds.length,
        finalMergedSharedDislikesCount: sharedDislikeIds.length,
        finalMergedSharedReactionCount: new Set([
          ...sharedFavoriteIds,
          ...sharedDislikeIds,
        ]).size,
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
        const viewerId = getOwnerId();
        const isDebugViewer = shouldDebugAdditionalMatching(viewerId);
        favoriteSnapshots[effectiveOwnerId] = snap.exists() ? snap.val() : {};
        loadedFavoriteOwnerIds.add(effectiveOwnerId);
        debugSharedReactionsLog(viewerId, 'loaded favorites snapshot for ownerId', {
          ownerId: effectiveOwnerId,
          ...(isDebugViewer ? {
            loadedReactionCount: Object.keys(normalizeReactionMap(favoriteSnapshots[effectiveOwnerId])).length,
          } : {}),
        });
        applyPrioritizedReactionMaps();
      }, error => markOwnerSnapshotLoaded(favoriteSnapshots, loadedFavoriteOwnerIds, 'favorites', error));
      const unsubDis = onValue(disRef, snap => {
        const viewerId = getOwnerId();
        const isDebugViewer = shouldDebugAdditionalMatching(viewerId);
        dislikeSnapshots[effectiveOwnerId] = snap.exists() ? snap.val() : {};
        loadedDislikeOwnerIds.add(effectiveOwnerId);
        debugSharedReactionsLog(viewerId, 'loaded dislikes snapshot for ownerId', {
          ownerId: effectiveOwnerId,
          ...(isDebugViewer ? {
            loadedReactionCount: Object.keys(normalizeReactionMap(dislikeSnapshots[effectiveOwnerId])).length,
          } : {}),
        });
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

        const collected = [];
        const fetchedIds = [];
        let nextOffset = 0;
        let sourceHasMore = true;
        let visibleCount = 0;
        let loadedPages = 0;

        while (
          sourceHasMore &&
          loadedPages < ADDITIONAL_BACKFILL_MAX_PAGES &&
          (collected.length === 0 || visibleCount < INITIAL_LOAD)
        ) {
          loadedPages += 1;
          // eslint-disable-next-line no-await-in-loop
          const loaded = await fetchAdditionalNewUsersBySearchIndex({
            parsedRuleGroups: freshParsedAdditionalAccessRules,
            rawRules: freshRawRules,
            accessUserId: ownerId,
            searchKeySetKeys: resolvedSearchKeySetKeys,
            collectionSource,
            filters: filtersRef.current || {},
            excludeIds: [
              ...Object.keys(favoriteUsersRef.current),
              ...Object.keys(dislikeUsersRef.current),
            ],
            offset: nextOffset,
            limit: INITIAL_LOAD,
            fetchNewUsersByIds: fetchNewUsersByIdsForMatching,
            shouldDebugAdditionalMatching,
            debugAdditionalToast,
            logAdditionalMatchingDebug,
            debugMissingNewUsersToast,
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

          fetchedIds.push(...(loaded.userIds || []));
          const previousOffset = nextOffset;
          nextOffset = Number.isFinite(Number(loaded.nextOffset)) ? loaded.nextOffset : previousOffset;
          sourceHasMore = Boolean(loaded.hasMore) && nextOffset > previousOffset;

          const pageUsers = (loaded.users || []).filter(user =>
            user?.userId &&
            !favoriteUsersRef.current[user.userId] &&
            !dislikeUsersRef.current[user.userId] &&
            !collected.some(collectedUser => collectedUser.userId === user.userId)
          );
          collected.push(...pageUsers);

          visibleCount = applyMatchingUiFiltersToUsers({
            users: collected,
            filters: filtersRef.current || {},
            filterMainFn: filterMain,
            favoriteUsers: favoriteUsersRef.current,
            dislikeUsers: dislikeUsersRef.current,
            excludeReactionUsers: true,
            roleIndexSets,
            collectionSource,
          }).length;
        }

        if (isLatestAdditionalFetch()) {
          setAdditionalNewUsers(collected);
          setAdditionalNextOffset(nextOffset);
          loadedIdsRef.current = new Set(collected.map(user => user.userId).filter(Boolean));
          setHasMore(sourceHasMore);
          setLastKey(null);
          logAdditionalMatchingDebug(ownerId, 'initial additional matching final cards', {
            fetchedIds,
            filteredIds: collected.map(user => user.userId).filter(Boolean),
            pagination: { nextOffset, hasMore: sourceHasMore },
            finalCardsCount: collected.length,
            loadedPages,
            visibleCount,
          });
          collected.forEach(user => { if (!user.__fromCardCache) updateCard(user.userId, user); });
          void loadCommentsFor(collected);
          const toastSignature = `${currentAdditionalAccessRules}::${nextOffset}${sourceHasMore ? '+' : ''}`;
          if (additionalRulesToastRef.current !== toastSignature) {
            toast(
              `Додаткові правила доступу (newUsers): завантажено ${nextOffset}${sourceHasMore ? '+' : ''} карточок для matching.`,
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
        loadingRef.current = false;
        setLoading(false);
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
    roleIndexSets,
  ]);

  const fetchChunk = React.useCallback(
    async (
      limit,
      lastDate,
      exclude = new Set(),
      onPart
    ) => fetchFilteredMatchingSourceChunk({
      targetVisibleCount: limit,
      initialCursor: lastDate,
      exclude,
      collectionSource,
      parsedAdditionalAccessRules,
      filters: filtersRef.current || {},
      isAdmin,
      favoriteUsers: favoriteUsersRef.current,
      dislikeUsers: dislikeUsersRef.current,
      roleIndexSets,
      filterMainFn: filterMain,
      fetchUsersByLastLogin2,
      fetchUsersByLastLogin2FromCollection,
      hydrateUsersByIds: ids => fetchUsersByIds(ids, { collectionSource }),
      onPart,
    }),
    [collectionSource, isAdmin, parsedAdditionalAccessRules, roleIndexSets]
  );

  const loadInitial = React.useCallback(async () => {
    if (loadingRef.current) {
      console.info('[loadInitial] skip overlapping request', { viewMode: viewModeRef.current });
      return;
    }
    const loadInitialVersion = loadInitialVersionRef.current + 1;
    loadInitialVersionRef.current = loadInitialVersion;
    debugReactionFlowLog('loadInitial:start', { viewMode: viewModeRef.current, collectionSource });
    loadingRef.current = true;
    const startMode = viewModeRef.current;
    const canApplyInitialLoad = () => loadInitialVersion === loadInitialVersionRef.current && viewModeRef.current === startMode;
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

      const activeIndexFilterGroups = buildMatchingIndexFilterGroups({
        filters: filtersRef.current || {},
        collectionSource,
      });
      if (collectionSource === 'users' && activeIndexFilterGroups.length > 0) {
        const indexed = await fetchMatchingIndexedCandidates({
          collectionSource: 'users',
          filters: filtersRef.current || {},
          viewMode: viewModeRef.current,
          ownerId: getOwnerId(),
          offset: 0,
          limit: INITIAL_LOAD,
          excludeIds: [...exclude],
          hydrateUsersByIds: ids => fetchUsersByIds(ids, { collectionSource }),
        });
        if (!canApplyInitialLoad()) return;
        const indexedUsers = (indexed.users || []).filter(user => isAllowedIdForCollection(user.userId, collectionSource));
        if (indexedUsers.length === 0 && !indexed.hasMore) {
          console.warn('[Matching][indexedProvider] empty users index result; falling back to source pagination');
        } else {
          indexedUsers.forEach(user => { if (!user.__fromCardCache) updateCard(user.userId, user); });
          loadedIdsRef.current = new Set(indexedUsers.map(user => user.userId).filter(Boolean));
          setUsers(indexedUsers);
          setIdsForQuery(defaultListKey, indexedUsers.map(user => user.userId));
          void loadCommentsFor(indexedUsers);
          if (!canApplyInitialLoad()) return;
          setLastKey(indexed.nextOffset);
          setHasMore(Boolean(indexed.hasMore));
          setViewMode('default');
          return;
        }
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
        void loadCommentsFor(filteredCached);
        if (!canApplyInitialLoad()) return;
        setViewMode('default');
        // continue to fetch latest data to refresh cache
      }
      const res = await fetchChunk(
        INITIAL_LOAD,
        undefined,
        exclude,
        async part => {
          if (!canApplyInitialLoad()) return;
          const unique = part.filter(u => !loadedIdsRef.current.has(u.userId));
          if (unique.length) {
            unique.forEach(u => loadedIdsRef.current.add(u.userId));
            setUsers(prev => [...prev, ...unique]);
            void loadCommentsFor(unique);
          }
        }
      );
      if (!canApplyInitialLoad()) return;
      console.log('[loadInitial] initial loaded', res.users.length, 'hasMore', res.hasMore);
      const stats = typeof window !== 'undefined' ? window.matchingLoadStats : null;
      if (stats && typeof console.table === 'function') console.table([stats]);
      loadedIdsRef.current = new Set([
        ...loadedIdsRef.current,
        ...res.users.map(u => u.userId),
      ]);
      res.users.forEach(u => { if (!u.__fromCardCache) updateCard(u.userId, u); });
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        res.users.forEach(u => map.set(u.userId, u));
        const result = Array.from(map.values());
        setIdsForQuery(defaultListKey, result.map(u => u.userId));
        return result;
      });
      void loadCommentsFor(res.users);
      if (!canApplyInitialLoad()) return;
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
      setViewMode('default');
    } finally {
      if (loadInitialVersion === loadInitialVersionRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [collectionSource, defaultListKey, fetchChunk, getMatchingMultiDataOwnerIds, loadCommentsFor, parsedAdditionalAccessRules.length]); // include fetchChunk to satisfy react-hooks/exhaustive-deps

  const reloadDefault = React.useCallback(() => {
    emptyAutoLoadMoreAttemptsRef.current = 0;
    autoLoadMoreSignatureRef.current = '';
    invalidateReactionAsyncWork();
    viewModeRef.current = 'default';
    setViewMode('default');
    setActiveProfileIndex(0);
    resetReactionPaginationState();
    loadInitial();
  }, [invalidateReactionAsyncWork, loadInitial, resetReactionPaginationState]);


  const handleFiltersChange = React.useCallback(nextFilters => {
    emptyAutoLoadMoreAttemptsRef.current = 0;
    autoLoadMoreSignatureRef.current = '';
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    const currentMode = viewModeRef.current;
    if (currentMode === 'favorites' || currentMode === 'dislikes') {
      debugReactionFlowLog('handleFiltersChange:ignored-for-reaction-tab', {
        viewMode: currentMode,
        ignoredFilters: getActiveMatchingFiltersDebug(nextFilters || {}),
      });
      return;
    }

    if (currentMode === 'default') {
      loadedIdsRef.current = new Set();
      setUsers([]);
      setAdditionalNewUsers([]);
      setAdditionalNextOffset(0);
      setLastKey(null);
      setHasMore(true);
    }
  }, []);

  const resetFiltersAndCache = React.useCallback(() => {
    const debugMatchingCache = isAdmin || shouldDebugAdditionalMatching(ownerId);
    const removedLocalStorageKeys = clearMatchingLocalStorageCache({ debug: debugMatchingCache });
    localStorage.removeItem('matchingFilters');
    localStorage.removeItem(SEARCH_KEY);
    clearAllCardsCache();

    emptyAutoLoadMoreAttemptsRef.current = 0;
    autoLoadMoreSignatureRef.current = '';
    loadingRef.current = false;
    loadedIdsRef.current = new Set();
    additionalRulesToastRef.current = '';
    additionalProfileCacheRef.current = null;
    additionalProfileRequestVersionRef.current += 1;
    additionalMatchingFetchVersionRef.current += 1;
    additionalLoadMoreFetchVersionRef.current += 1;
    additionalMatchingApplyVersionRef.current += 1;
    invalidateReactionAsyncWork();
    resetReactionPaginationState();
    filtersRef.current = {};
    viewModeRef.current = 'default';
    setFilters({});
    setUsers([]);
    setAdditionalNewUsers([]);
    setAdditionalNextOffset(0);
    setSharedReactionIds([]);
    setSharedReactionCandidateUsers([]);
    setPhotoCacheByUserId({});
    setLastKey(null);
    setHasMore(true);
    setLoading(false);
    setViewMode('default');
    setFilterResetToken(prev => prev + 1);

    if (debugMatchingCache) {
      console.info('[Matching cache] reset removed keys:', removedLocalStorageKeys);
      logMatchingLocalStorageDebugStats('after reset');
    }

    loadInitial();
    toast.success('Фільтри та кеш скинуто');
  }, [invalidateReactionAsyncWork, isAdmin, loadInitial, ownerId, resetReactionPaginationState]);

  const classifyReactionIdsBySource = React.useCallback(async ids => {
    const uniqueIds = [...new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean))];
    const requestKey = uniqueIds.slice().sort().join('|');
    if (reactionClassificationRequestsRef.current.has(requestKey)) {
      debugReactionFlowLog('classifyReactionIdsBySource:dedupe-hit', { ids: summarizeIdsForDebug(uniqueIds) });
      return reactionClassificationRequestsRef.current.get(requestKey);
    }

    const requestPromise = (async () => {
      const classifications = {};

      debugReactionFlowLog('classifyReactionIdsBySource:start', {
        fullReactionIds: summarizeIdsForDebug(uniqueIds),
        fullReactionIdsCount: uniqueIds.length,
      });

      await Promise.all(uniqueIds.map(async id => {
        const preferredSources = getPreferredReactionSources(id);
        const attempts = [];
        let found = null;

        for (const sourceName of preferredSources) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const snapshot = await get(refDb(database, `${sourceName}/${id}`));
            const exists = snapshot.exists();
            attempts.push({ source: sourceName, exists });
            if (exists && !found) {
              found = { source: sourceName };
              break;
            }
          } catch (error) {
            attempts.push({ source: sourceName, exists: false, error: error?.message || String(error) });
          }
        }

        const source = found?.source || null;
        classifications[id] = {
          source,
          preferredSources,
          attempts,
          reason: source ? `found-in-${source}` : 'missing-in-users-and-newUsers',
        };
      }));

      const userReactionIds = uniqueIds.filter(id => classifications[id]?.source === 'users');
      const newUserReactionIds = uniqueIds.filter(id => classifications[id]?.source === 'newUsers');
      const unclassifiedIds = uniqueIds.filter(id => !classifications[id]?.source);
      const classifiedTotal = userReactionIds.length + newUserReactionIds.length + unclassifiedIds.length;
      debugReactionFlowLog('classifyReactionIdsBySource:result', {
        fullReactionIds: summarizeIdsForDebug(uniqueIds),
        userReactionIds: summarizeIdsForDebug(userReactionIds),
        newUserReactionIds: summarizeIdsForDebug(newUserReactionIds),
        unclassifiedIds: summarizeIdsForDebug(unclassifiedIds),
        counts: {
          fullReactionIds: uniqueIds.length,
          userReactionIds: userReactionIds.length,
          newUserReactionIds: newUserReactionIds.length,
          unclassifiedIds: unclassifiedIds.length,
          classifiedTotal,
          integrityOk: classifiedTotal === uniqueIds.length,
        },
        sourceCounts: Object.fromEntries(['users', 'newUsers', 'unclassified'].map(sourceName => [
          sourceName,
          sourceName === 'unclassified' ? unclassifiedIds.length : uniqueIds.filter(id => classifications[id]?.source === sourceName).length,
        ])),
      });

      if (classifiedTotal !== uniqueIds.length) {
        console.error('[Matching][reactions] reaction ID classification integrity failed', {
          fullReactionIds: uniqueIds,
          userReactionIds,
          newUserReactionIds,
          unclassifiedIds,
        });
      }

      reactionSourceByIdRef.current = {
        ...reactionSourceByIdRef.current,
        ...Object.fromEntries(
          Object.entries(classifications).map(([id, classification]) => [id, classification.source])
        ),
      };

      return {
        fullReactionIds: uniqueIds,
        userReactionIds,
        newUserReactionIds,
        unclassifiedIds,
        classifications,
      };
    })().finally(() => {
      reactionClassificationRequestsRef.current.delete(requestKey);
    });

    reactionClassificationRequestsRef.current.set(requestKey, requestPromise);
    return requestPromise;
  }, []);

  const fetchReactionCardsByIds = React.useCallback(async ids => {
    const uniqueIds = [...new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean))];
    const sourceById = reactionSourceByIdRef.current || {};
    const cachedEntries = new Map();
    const missingBySource = {
      users: [],
      newUsers: [],
    };
    const unknownSourceIds = [];

    debugReactionFlowLog('fetchReactionCardsByIds:start', {
      ids: summarizeIdsForDebug(uniqueIds),
      sourceCounts: Object.fromEntries(['users', 'newUsers', 'unknown'].map(sourceName => [
        sourceName,
        sourceName === 'unknown'
          ? uniqueIds.filter(id => !sourceById[id]).length
          : uniqueIds.filter(id => sourceById[id] === sourceName).length,
      ])),
      viewMode: viewModeRef.current,
    });

    uniqueIds.forEach(id => {
      const cached = getCard(id);
      let source = sourceById[id];
      if (!source && (cached?.__sourceCollection === 'users' || cached?.__sourceCollection === 'newUsers')) {
        source = cached.__sourceCollection;
        reactionSourceByIdRef.current = {
          ...reactionSourceByIdRef.current,
          [id]: source,
        };
      }
      const canUseCachedCard = cached && (!source || !cached.__sourceCollection || cached.__sourceCollection === source);

      if (canUseCachedCard) {
        cachedEntries.set(id, {
          ...cached,
          userId: id,
          __sourceCollection: cached.__sourceCollection || source || getPreferredReactionSources(id)[0],
          __fromCardCache: true,
        });
      } else if (source === 'users' || source === 'newUsers') {
        missingBySource[source].push(id);
      } else {
        unknownSourceIds.push(id);
      }
    });

    if (unknownSourceIds.length > 0) {
      debugReactionFlowLog('fetchReactionCardsByIds:unknown-source-classification', {
        unknownSourceIds: summarizeIdsForDebug(unknownSourceIds),
      });
      const classification = await classifyReactionIdsBySource(unknownSourceIds);
      classification.userReactionIds.forEach(id => missingBySource.users.push(id));
      classification.newUserReactionIds.forEach(id => missingBySource.newUsers.push(id));
      if (classification.unclassifiedIds.length > 0) {
        debugReactionFlowLog('fetchReactionCardsByIds:missing-unclassified-ids', {
          missingIds: summarizeIdsForDebug(classification.unclassifiedIds),
          classifications: classification.classifications,
        });
      }
    }

    const missingUserIds = [...new Set(missingBySource.users.filter(id => !cachedEntries.has(id)))];
    const missingNewUserIds = [...new Set(missingBySource.newUsers.filter(id => !cachedEntries.has(id)))];

    debugReactionFlowLog('fetchReactionCardsByIds:request-backend', {
      requestedIds: summarizeIdsForDebug(uniqueIds),
      cacheHitIds: summarizeIdsForDebug(Array.from(cachedEntries.keys())),
      missingUserIds: summarizeIdsForDebug(missingUserIds),
      missingNewUserIds: summarizeIdsForDebug(missingNewUserIds),
    });

    const [usersMap, newUsersCards] = await Promise.all([
      missingUserIds.length ? fetchUsersByIds(missingUserIds, { collectionSource: 'users' }) : Promise.resolve({}),
      missingNewUserIds.length ? fetchNewUsersByIdsForMatching(missingNewUserIds) : Promise.resolve([]),
    ]);

    debugReactionFlowLog('fetchReactionCardsByIds:backend-returned', {
      usersMapIds: summarizeIdsForDebug(Object.keys(usersMap || {})),
      newUsersCardIds: summarizeIdsForDebug((newUsersCards || []).map(card => card.userId).filter(Boolean)),
      missingUsersIds: summarizeIdsForDebug(missingUserIds.filter(id => !usersMap?.[id])),
      missingNewUsersIds: summarizeIdsForDebug(missingNewUserIds.filter(id => !(newUsersCards || []).some(card => card.userId === id))),
    });

    const result = {};
    uniqueIds.forEach(id => {
      const source = reactionSourceByIdRef.current?.[id];
      const cached = cachedEntries.get(id);
      const fetchedUser = usersMap?.[id];
      const fetchedNewUser = (newUsersCards || []).find(card => card.userId === id);
      const user = cached || (source === 'newUsers' ? fetchedNewUser : fetchedUser);

      if (user && (source === 'users' || source === 'newUsers')) {
        result[id] = { ...user, userId: id, __sourceCollection: source };
      }
    });

    debugReactionFlowLog('fetchReactionCardsByIds:result', {
      requestedIds: summarizeIdsForDebug(uniqueIds),
      returnedIds: summarizeIdsForDebug(Object.keys(result)),
      missingResultIds: summarizeIdsForDebug(uniqueIds.filter(id => !result[id])),
      users: summarizeUsersForReactionDebug(Object.values(result)),
    });

    return result;
  }, [classifyReactionIdsBySource]);

  const getAccessibleReactionIds = React.useCallback(async (reactionIds, accessSnapshot = {}) => {
    const uniqueIds = [...new Set((reactionIds || []).map(id => String(id || '').trim()).filter(Boolean))];
    const accessRequestKey = stableAdditionalSignature({
      ids: uniqueIds.slice().sort(),
      accessUserId: accessSnapshot.accessUserId || ownerId || getOwnerId(),
      collectionSource: accessSnapshot.collectionSource || collectionSourceRef.current,
      rawRules: accessSnapshot.rawRules ?? currentAdditionalAccessRules,
      searchKeySetsOfExactUser: accessSnapshot.searchKeySetsOfExactUser ?? currentSearchKeySetKeys,
    });
    if (reactionAccessRequestsRef.current.has(accessRequestKey)) {
      debugReactionFlowLog('getAccessibleReactionIds:dedupe-hit', { inputIds: summarizeIdsForDebug(uniqueIds) });
      return reactionAccessRequestsRef.current.get(accessRequestKey);
    }

    const accessPromise = (async () => {
    const {
      userReactionIds,
      newUserReactionIds,
      unclassifiedIds,
      classifications,
    } = await classifyReactionIdsBySource(uniqueIds);

    debugReactionFlowLog('getAccessibleReactionIds:start', {
      inputIds: summarizeIdsForDebug(uniqueIds),
      userReactionIds: summarizeIdsForDebug(userReactionIds),
      newUserReactionIds: summarizeIdsForDebug(newUserReactionIds),
      unclassifiedIds: summarizeIdsForDebug(unclassifiedIds),
      classifications,
      viewMode: viewModeRef.current,
      collectionSource: accessSnapshot.collectionSource,
    });

    if (unclassifiedIds.length > 0) {
      debugReactionFlowLog('getAccessibleReactionIds:missing-unclassified-ids', {
        unclassifiedIds: summarizeIdsForDebug(unclassifiedIds),
        classifications: Object.fromEntries(unclassifiedIds.map(id => [id, classifications[id]])),
      });
    }

    if (newUserReactionIds.length === 0) {
      debugReactionFlowLog('getAccessibleReactionIds:users-only-result', {
        reactionIds: summarizeIdsForDebug(userReactionIds),
        unclassifiedIds: summarizeIdsForDebug(unclassifiedIds),
      });
      return uniqueIds.filter(id => userReactionIds.includes(id));
    }

    const rawRulesForRequest = accessSnapshot.rawRules ?? currentAdditionalAccessRules;
    const parsedRulesForRequest = parseAdditionalAccessRuleGroups(rawRulesForRequest);
    if (parsedRulesForRequest.length === 0) {
      const resultIds = uniqueIds.filter(id => userReactionIds.includes(id) || newUserReactionIds.includes(id));
      debugReactionFlowLog('getAccessibleReactionIds:no-rules-result', {
        reactionIds: summarizeIdsForDebug(resultIds),
        unclassifiedIds: summarizeIdsForDebug(unclassifiedIds),
      });
      return resultIds;
    }

    const searchKeySetsForRequest = accessSnapshot.searchKeySetsOfExactUser ?? currentSearchKeySetKeys;
    const viewerId = accessSnapshot.accessUserId || ownerId || getOwnerId();
    if (!viewerId) {
      debugReactionFlowLog('getAccessibleReactionIds:no-viewer-result', {
        reactionIds: summarizeIdsForDebug(userReactionIds),
        blockedNewUserReactionIds: summarizeIdsForDebug(newUserReactionIds),
      });
      return uniqueIds.filter(id => userReactionIds.includes(id));
    }

    const resolvedSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(searchKeySetsForRequest, viewerId)
      ? searchKeySetsForRequest
      : await resolveAdditionalSearchKeySetKeysForMatching(null, viewerId);

    if (!resolvedSearchKeySetKeys.length) {
      debugReactionFlowLog('getAccessibleReactionIds:no-search-key-sets-result', {
        viewerId,
        reactionIds: summarizeIdsForDebug(userReactionIds),
        blockedNewUserReactionIds: summarizeIdsForDebug(newUserReactionIds),
      });
      return uniqueIds.filter(id => userReactionIds.includes(id));
    }

    debugReactionFlowLog('getAccessibleReactionIds:index-request', {
      viewerId,
      candidateUserIds: summarizeIdsForDebug(newUserReactionIds),
      searchKeySetKeysCount: resolvedSearchKeySetKeys.length,
    });

    const indexed = await checkReactionNewUsersMembership({
      candidateUserIds: newUserReactionIds,
      searchKeySetKeys: resolvedSearchKeySetKeys,
      debugMatchingFlow: shouldDebugAdditionalMatching(viewerId),
      debugToast: (message, data) => debugAdditionalToast(viewerId, message, data),
    });
    const allowedIds = new Set(Array.isArray(indexed?.userIds) ? indexed.userIds : []);
    const allowedNewUserReactionIds = newUserReactionIds.filter(id => allowedIds.has(id));
    const blockedNewUserReactionIds = newUserReactionIds.filter(id => !allowedIds.has(id));
    const resultIds = uniqueIds.filter(id => userReactionIds.includes(id) || allowedNewUserReactionIds.includes(id));
    debugReactionFlowLog('getAccessibleReactionIds:index-result', {
      indexedIds: summarizeIdsForDebug(Array.from(allowedIds)),
      allowedNewUserReactionIds: summarizeIdsForDebug(allowedNewUserReactionIds),
      blockedNewUserReactionIds: summarizeIdsForDebug(blockedNewUserReactionIds),
      unclassifiedIds: summarizeIdsForDebug(unclassifiedIds),
      reactionIds: summarizeIdsForDebug(resultIds),
    });
    return resultIds;
    })().finally(() => {
      reactionAccessRequestsRef.current.delete(accessRequestKey);
    });

    reactionAccessRequestsRef.current.set(accessRequestKey, accessPromise);
    return accessPromise;
  }, [
    classifyReactionIdsBySource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    ownerId,
  ]);

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

    if (requestViewMode === 'default') {
      if (canApplySharedCandidateResult()) {
        setSharedReactionCandidateUsers([]);
      }
      debugSharedReactionsLog(viewerId, 'skipped shared reaction candidate hydration for default deck', {
        collectionSource: requestCollectionSource,
      });
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

    const reactionAccessSnapshot = {
      accessUserId: viewerId,
      collectionSource,
      rawRules: currentAdditionalAccessRules,
      searchKeySetsOfExactUser: currentSearchKeySetKeys,
    };
    const accessibleCandidateIds = await getAccessibleReactionIds(candidateIds, reactionAccessSnapshot);
    if (!canApplySharedCandidateResult()) {
      return;
    }

    const recordsById = accessibleCandidateIds.length > 0
      ? await fetchReactionCardsByIds(accessibleCandidateIds)
      : {};
    if (!canApplySharedCandidateResult()) {
      return;
    }

    const loadedUsers = accessibleCandidateIds
      .map(id => recordsById?.[id])
      .filter(Boolean)
      .filter(user => canShowMatchingUser(user, { isAdmin }))
      .map(user => ({
        ...user,
        ...(user.__sourceCollection === 'newUsers' ? { __matchingAccessAllowed: true } : {}),
      }));
    const loadedIds = new Set(loadedUsers.map(user => user.userId).filter(Boolean));
    const filteredInvalidIds = candidateIds.filter(id => !reactionSourceByIdRef.current?.[id]);
    const filteredByCollectionIds = [];
    const filteredByAccessIds = candidateIds.filter(id => !accessibleCandidateIds.includes(id) && reactionSourceByIdRef.current?.[id] === 'newUsers');
    const missingAllowedIds = accessibleCandidateIds.filter(id => !loadedIds.has(id));
    const allowedNewUserIds = accessibleCandidateIds.filter(id => reactionSourceByIdRef.current?.[id] === 'newUsers');
    const indexedAllowedNewUserIds = new Set(allowedNewUserIds);

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
    void loadCommentsFor(loadedUsers);

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
    fetchReactionCardsByIds,
    getAccessibleReactionIds,
    loadCommentsFor,
    ownerId,
    isAdmin,
    sharedReactionIds,
    viewMode,
  ]);

  useEffect(() => {
    if (viewModeRef.current === 'default') {
      setSharedReactionCandidateUsers([]);
      return;
    }
    loadSharedReactionCandidates();
  }, [loadSharedReactionCandidates]);

  const loadReactionCardsPage = React.useCallback(async ({
    reactionIds,
    reactionMap = {},
    offset = 0,
    limit = LOAD_MORE,
    loadedIds = new Set(),
  }) => {
    const activeReactionMap = normalizeReactionMap(reactionMap);
    debugReactionFlowLog('loadReactionCardsPage:start', {
      viewMode: viewModeRef.current,
      reactionIds: summarizeIdsForDebug(reactionIds),
      reactionMap: summarizeReactionMapForDebug(reactionMap),
      offset,
      limit,
      loadedIds: summarizeIdsForDebug(Array.from(loadedIds || [])),
      filters: getActiveMatchingFiltersDebug(filtersRef.current || {}),
      collectionSource,
    });
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
        debugReactionFlowLog('loadReactionCardsPage:filterUsers-input', {
          viewMode: viewModeRef.current,
          candidates: summarizeUsersForReactionDebug(candidates),
          activeReactionIds: summarizeReactionMapForDebug(activeReactionMap),
          loadedIds: summarizeIdsForDebug(Array.from(loadedIds || [])),
        });
        const scopedCandidates = candidates
          .filter(user => activeReactionMap[user.userId])
          .filter(user => isMatchingCardId(user.userId))
          .filter(user => canShowReactionTabCard(user, { isAdmin }))
          .filter(user => !loadedIds.has(user.userId));

        debugReactionFlowLog('loadReactionCardsPage:scopedCandidates-before-ui-filters', {
          viewMode: viewModeRef.current,
          scopedCandidates: summarizeUsersForReactionDebug(scopedCandidates),
          filteredOutBeforeUiIds: candidates
            .map(user => user.userId)
            .filter(id => !scopedCandidates.some(user => user.userId === id)),
          filters: getActiveMatchingFiltersDebug(filtersRef.current || {}),
        });

        debugReactionFlowLog('loadReactionCardsPage:reaction-tabs-skip-ui-filters', {
          viewMode: viewModeRef.current,
          users: summarizeUsersForReactionDebug(scopedCandidates),
          ignoredFilters: getActiveMatchingFiltersDebug(filtersRef.current || {}),
          ignoredFilterTypes: ['userRole', 'age', 'blood', 'reaction', 'favOnly', 'collectionSource'],
        });

        return scopedCandidates;
      },
      debugLog: (stage, payload) => debugReactionFlowLog(`loadReactionCardsPageRecords:${stage}`, {
        viewMode: viewModeRef.current,
        ...payload,
      }),
    });

    const sortedUsers = page.users.sort(compareUsersByLastLogin2);
    debugReactionFlowLog('loadReactionCardsPage:result', {
      viewMode: viewModeRef.current,
      users: summarizeUsersForReactionDebug(sortedUsers),
      nextOffset: page.nextOffset,
      hasMore: page.hasMore,
      loadedIds: summarizeIdsForDebug(Array.from(loadedIds || [])),
    });

    return {
      ...page,
      users: sortedUsers,
    };
  }, [
    collectionSource,
    fetchReactionCardsByIds,
    isAdmin,
  ]);

  const loadReactionCards = React.useCallback(async reactionType => {
    const isFavoritesMode = reactionType === 'favorites';
    loadInitialVersionRef.current += 1;
    additionalLoadMoreFetchVersionRef.current += 1;
    additionalMatchingApplyVersionRef.current += 1;
    reactionLoadVersionRef.current += 1;
    sharedReactionCandidateLoadVersionRef.current += 1;
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
    setActiveProfileIndex(0);
    loadingRef.current = true;
    setLoading(true);
    setUsers([]);
    setSharedReactionCandidateUsers([]);
    setLastKey(null);
    setHasMore(false);
    resetReactionPaginationState(reactionType);

    debugReactionFlowLog('loadReactionCards:start', {
      reactionType,
      reactionLoadVersion,
      requestCollectionSource,
      ownerId,
      currentOwnerId: getOwnerId(),
      filters: getActiveMatchingFiltersDebug(filtersRef.current || {}),
    });

    try {
      const owners = await waitForOwnerId();
      debugReactionFlowLog('loadReactionCards:owners', { reactionType, owners });
      if (!owners.length) {
        debugReactionFlowLog('loadReactionCards:no-owners', { reactionType });
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
      debugReactionFlowLog('loadReactionCards:snapshots-loaded', {
        reactionType,
        owners,
        ownOwnerId,
        favoriteSnapshotCounts: Object.fromEntries(owners.map(owner => [owner, Object.keys(normalizeReactionMap(favoriteSnapshots[owner])).length])),
        dislikeSnapshotCounts: Object.fromEntries(owners.map(owner => [owner, Object.keys(normalizeReactionMap(dislikeSnapshots[owner])).length])),
      });
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
      debugReactionFlowLog('loadReactionCards:fullReactionIds', {
        reactionType,
        fullReactionIds: summarizeIdsForDebug(fullReactionIds),
        favoritesMap: summarizeReactionMapForDebug(favMap),
        dislikesMap: summarizeReactionMapForDebug(disMap),
        ownFavorites: summarizeReactionMapForDebug(ownFavorites),
        ownDislikes: summarizeReactionMapForDebug(ownDislikes),
        sharedReactionIds: summarizeIdsForDebug(nextSharedReactionIds),
      });
      const reactionAccessSnapshot = {
        accessUserId: ownerId || getOwnerId(),
        collectionSource,
        rawRules: currentAdditionalAccessRules,
        searchKeySetsOfExactUser: currentSearchKeySetKeys,
      };
      const reactionAccessSnapshotKey = buildAdditionalAccessSnapshotKey(reactionAccessSnapshot);
      const reactionIds = await getAccessibleReactionIds(fullReactionIds, reactionAccessSnapshot);
      debugReactionFlowLog('loadReactionCards:accessibleReactionIds', {
        reactionType,
        reactionIds: summarizeIdsForDebug(reactionIds),
        removedByAccessIds: fullReactionIds.filter(id => !reactionIds.includes(id)),
        reactionAccessSnapshotKey,
      });
      if (!canApplyReactionLoad()) {
        debugReactionFlowLog('loadReactionCards:stale-after-access', { reactionType, reactionLoadVersion });
        return;
      }
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
      debugReactionFlowLog('loadReactionCards:page-loaded', {
        reactionType,
        users: summarizeUsersForReactionDebug(page.users),
        nextOffset: page.nextOffset,
        pageHasMore: page.hasMore,
        loadedIds: summarizeIdsForDebug(Array.from(loadedIds)),
      });
      if (!canApplyReactionLoad()) {
        debugReactionFlowLog('loadReactionCards:stale-after-page', { reactionType, reactionLoadVersion });
        return;
      }

      page.users.forEach(user => { if (!user.__fromCardCache) updateCard(user.userId, user); });
      if (isFavoritesMode) {
        cacheFavoriteUsers(Object.fromEntries(page.users.map(user => [user.userId, user])));
      } else {
        cacheDislikedUsers(Object.fromEntries(page.users.map(user => [user.userId, user])));
      }
      reactionLoadedIdsRef.current[reactionType] = loadedIds;
      loadedIdsRef.current = new Set(page.users.map(user => user.userId));
      setUsers(page.users);
      void loadCommentsFor(page.users);
      if (!canApplyReactionLoad()) return;
      const hasPendingSharedCandidates = hasPendingSharedReactionCandidates({
        reactionIds,
        sharedReactionIds: nextSharedReactionIds,
        loadedIds,
        reactionMap,
      });
      const nextHasMore = page.hasMore || hasPendingSharedCandidates;
      debugReactionFlowLog('loadReactionCards:hasMore-result', {
        reactionType,
        pageHasMore: page.hasMore,
        hasPendingSharedCandidates,
        nextHasMore,
        nextOffset: page.nextOffset,
        loadedIds: summarizeIdsForDebug(Array.from(loadedIds)),
        reactionIds: summarizeIdsForDebug(reactionIds),
      });
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
      debugReactionFlowLog('loadReactionCards:finish', {
        reactionType,
        reactionLoadVersion,
        viewMode: viewModeRef.current,
        loadingBeforeFinish: loadingRef.current,
      });
      loadingRef.current = false;
      setLoading(false);
    }
  }, [
    collectionSource,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    getAccessibleReactionIds,
    loadCommentsFor,
    loadReactionCardsPage,
    ownerId,
    resetReactionPaginationState,
    waitForOwnerId,
  ]);

  const switchMatchingMode = React.useCallback((nextMode) => {
    if (nextMode === 'favorites' || nextMode === 'dislikes') {
      loadInitialVersionRef.current += 1;
      additionalLoadMoreFetchVersionRef.current += 1;
      additionalMatchingApplyVersionRef.current += 1;
      reactionLoadVersionRef.current += 1;
      sharedReactionCandidateLoadVersionRef.current += 1;
      loadingRef.current = false;
      setActiveProfileIndex(0);
      setUsers([]);
      setSharedReactionCandidateUsers([]);
      resetReactionPaginationState(nextMode);
      viewModeRef.current = nextMode;
      setViewMode(nextMode);
      void loadReactionCards(nextMode);
      return;
    }

    if (nextMode === 'default') {
      reloadDefault();
    }
  }, [loadReactionCards, reloadDefault, resetReactionPaginationState]);

  const switchCollectionSource = React.useCallback((nextSource) => {
    if (nextSource !== 'users' && nextSource !== 'newUsers') return;
    if (nextSource === collectionSourceRef.current) return;

    loadInitialVersionRef.current += 1;
    reactionLoadVersionRef.current += 1;
    sharedReactionCandidateLoadVersionRef.current += 1;
    additionalLoadMoreFetchVersionRef.current += 1;
    additionalMatchingApplyVersionRef.current += 1;
    emptyAutoLoadMoreAttemptsRef.current = 0;
    autoLoadMoreSignatureRef.current = '';
    loadingRef.current = false;
    setLoading(false);
    setActiveProfileIndex(0);
    resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });
    resetReactionPaginationState();
    setSharedReactionCandidateUsers([]);
    collectionSourceRef.current = nextSource;
    setCollectionSource(nextSource);

    if (viewModeRef.current !== 'favorites' && viewModeRef.current !== 'dislikes') {
      viewModeRef.current = 'default';
      setViewMode('default');
    }
  }, [resetAdditionalMatchingState, resetReactionPaginationState]);

  const loadFavoriteCards = () => switchMatchingMode('favorites');

  const loadDislikeCards = () => switchMatchingMode('dislikes');

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

  const loadMore = React.useCallback(async ({ targetVisibleCount = 0, currentVisibleCount = 0, limit = LOAD_MORE } = {}) => {
    const isReactionViewMode = viewMode === 'favorites' || viewMode === 'dislikes';
    if (!hasMore || loadingRef.current || (viewMode !== 'default' && !isReactionViewMode)) {
      console.log('[loadMore] skip', { hasMore, loading: loadingRef.current, viewMode });
      return;
    }
    const visibleDeficit = Math.max(0, Number(targetVisibleCount) - Number(currentVisibleCount));
    const requestedLimit = Math.max(1, Number(limit) || LOAD_MORE, visibleDeficit);
    console.log('[loadMore] start', { lastKey, hasMore, requestedLimit, targetVisibleCount, currentVisibleCount });
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
    const finishLoadMoreIfLatest = () => {
      if (!isLatestLoadMore()) {
        console.log('[loadMore] stale request finished after a newer request; keeping loading state for active request', {
          loadMoreVersion,
          latestLoadMoreVersion: additionalLoadMoreFetchVersionRef.current,
          applyVersion,
          latestApplyVersion: additionalMatchingApplyVersionRef.current,
        });
        return;
      }
      loadingRef.current = false;
      setLoading(false);
    };
    try {
      if (isReactionViewMode) {
        const reactionMap = viewMode === 'favorites'
          ? favoriteUsersRef.current
          : dislikeUsersRef.current;
        const currentPagination = reactionPaginationByType[viewMode] || buildEmptyReactionPagination();
        const reactionMapIds = Object.keys(reactionMap);
        debugReactionFlowLog('loadMore:reaction-start', {
          viewMode,
          reactionMap: summarizeReactionMapForDebug(reactionMap),
          currentPagination,
          requestedLimit,
          targetVisibleCount,
          currentVisibleCount,
        });
        const hasAccessScopedNewUsersUserIds = [
          ...reactionMapIds,
          ...(currentPagination.ids || []),
        ].some(id => reactionSourceByIdRef.current?.[id] === 'newUsers' || isLikelyNewUsersUserId(id));
        const shouldRefreshReactionIds = Boolean(
          parsedAdditionalAccessRules.length > 0 &&
          (collectionSource === 'newUsers' || hasAccessScopedNewUsersUserIds)
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
        debugReactionFlowLog('loadMore:reactionIds', {
          viewMode,
          reactionIds: summarizeIdsForDebug(reactionIds),
          didAccessSnapshotChange,
          shouldRefreshReactionIds,
          reactionAccessSnapshotKey,
        });

        if (!canApplyLoadMoreResult()) return;

        const loadedIds = didAccessSnapshotChange
          ? new Set()
          : (reactionLoadedIdsRef.current[viewMode] || new Set());
        const page = await loadReactionCardsPage({
          reactionIds,
          reactionMap,
          offset: didAccessSnapshotChange || currentPagination.ids.length === 0 ? 0 : currentPagination.nextOffset,
          limit: requestedLimit,
          loadedIds,
        });
        debugReactionFlowLog('loadMore:reaction-page-loaded', {
          viewMode,
          users: summarizeUsersForReactionDebug(page.users),
          nextOffset: page.nextOffset,
          pageHasMore: page.hasMore,
          loadedIds: summarizeIdsForDebug(Array.from(loadedIds)),
        });

        if (!canApplyLoadMoreResult()) return;

        page.users.forEach(user => { if (!user.__fromCardCache) updateCard(user.userId, user); });
        if (!canApplyLoadMoreResult()) return;
        reactionLoadedIdsRef.current[viewMode] = loadedIds;
        loadedIdsRef.current = new Set(loadedIds);
        setUsers(prev => {
          if (didAccessSnapshotChange) return page.users;
          const map = new Map(prev.map(user => [user.userId, user]));
          page.users.forEach(user => map.set(user.userId, user));
          return Array.from(map.values());
        });
        void loadCommentsFor(page.users);
        const hasPendingSharedCandidates = hasPendingSharedReactionCandidates({
          reactionIds,
          sharedReactionIds,
          loadedIds,
          reactionMap,
        });
        const nextHasMore = page.hasMore || hasPendingSharedCandidates;
        debugReactionFlowLog('loadMore:reaction-hasMore-result', {
          viewMode,
          pageHasMore: page.hasMore,
          hasPendingSharedCandidates,
          nextHasMore,
          nextOffset: page.nextOffset,
          loadedIds: summarizeIdsForDebug(Array.from(loadedIds)),
          reactionIds: summarizeIdsForDebug(reactionIds),
        });
        setReactionPaginationByType(prev => ({
          ...prev,
          [viewMode]: {
            ids: reactionIds,
            nextOffset: page.nextOffset,
            hasMore: nextHasMore,
            accessSnapshotKey: reactionAccessSnapshotKey,
          },
        }));
        setHasMore(nextHasMore);
        setLastKey(null);
        return page.users.length;
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
            pagination: { offset: nextOffset, limit: requestedLimit },
          });

          const loaded = await fetchAdditionalNewUsersBySearchIndex({
            rawRules: freshRawRules,
            accessUserId: ownerId,
            searchKeySetKeys: resolvedSearchKeySetKeys,
            collectionSource,
            filters: filtersRef.current || {},
            excludeIds: [...baseExclude],
            offset: nextOffset,
            limit: requestedLimit,
            fetchNewUsersByIds: fetchNewUsersByIdsForMatching,
            shouldDebugAdditionalMatching,
            debugAdditionalToast,
            logAdditionalMatchingDebug,
            debugMissingNewUsersToast,
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
            filterMainFn: filterMain,
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

        collected.forEach(user => { if (!user.__fromCardCache) updateCard(user.userId, user); });
        if (!isLatestLoadMore()) return;
        collected.forEach(user => {
          loadedIdsRef.current.add(user.userId);
        });
        setAdditionalNewUsers(prev => {
          const map = new Map((shouldResetAdditionalPagination ? [] : prev).map(user => [user.userId, user]));
          collected.forEach(user => map.set(user.userId, user));
          return Array.from(map.values());
        });
        void loadCommentsFor(collected);
        setAdditionalNextOffset(nextOffset);
        setHasMore(canLoadMoreAdditional);
        logAdditionalMatchingDebug(ownerId, 'load more additional matching final cards', {
          fetchedIds: collected.map(user => user.userId).filter(Boolean),
          filteredIds: collected.map(user => user.userId).filter(Boolean),
          pagination: { nextOffset, hasMore: canLoadMoreAdditional },
          finalCardsCount: collected.length,
        });
        setLastKey(null);
        return collected.length;
      }

      const activeIndexFilterGroups = buildMatchingIndexFilterGroups({
        filters: filtersRef.current || {},
        collectionSource,
      });
      if (collectionSource === 'users' && activeIndexFilterGroups.length > 0) {
        const indexedPage = await collectMatchingIndexedLoadMorePage({
          requestedLimit,
          initialOffset: Number(lastKey) || 0,
          maxPages: MATCHING_INDEXED_LOAD_MORE_MAX_PAGES,
          baseExclude,
          loadedIds: loadedIdsRef.current,
          filters: filtersRef.current || {},
          viewMode,
          ownerId: getOwnerId(),
          fetchMatchingIndexedCandidates,
          hydrateUsersByIds: ids => fetchUsersByIds(ids, { collectionSource }),
          isLatestLoadMore,
        });
        if (indexedPage.stale) return;

        if (indexedPage.cursorStuck) {
          console.warn('[Matching][indexedProvider] stopped loadMore because indexed cursor did not move', {
            finalIndexedOffset: indexedPage.finalOffset,
            indexedPageCalls: indexedPage.pageCalls,
            stopReason: indexedPage.stopReason,
          });
        }

        indexedPage.collected.forEach(user => { if (!user.__fromCardCache) updateCard(user.userId, user); });
        if (!isLatestLoadMore()) return;
        indexedPage.collected.forEach(user => loadedIdsRef.current.add(user.userId));
        setUsers(prev => {
          const map = new Map(prev.map(user => [user.userId, user]));
          indexedPage.collected.forEach(user => map.set(user.userId, user));
          const result = Array.from(map.values());
          setIdsForQuery(defaultListKey, result.map(user => user.userId));
          return result;
        });
        void loadCommentsFor(indexedPage.collected);
        setLastKey(indexedPage.finalOffset);
        setHasMore(Boolean(indexedPage.finalHasMore && !indexedPage.cursorStuck));
        return indexedPage.collected.length;
      }

      const collected = [];
      let cursor = Number.isFinite(Number(lastKey)) ? null : lastKey;
      let canLoadMore = hasMore;
      let loadedChunkCalls = 0;

      while (collected.length < requestedLimit && canLoadMore && loadedChunkCalls < 1) {
        loadedChunkCalls += 1;
        const remaining = requestedLimit - collected.length;
        const dynamicExclude = new Set([
          ...baseExclude,
          ...loadedIdsRef.current,
          ...collected.map(u => u.userId).filter(Boolean),
        ]);
        const res = await fetchChunk(remaining, cursor, dynamicExclude);
        if (!isLatestLoadMore()) {
          console.log('[loadMore] ignored stale default batch result', {
            loadMoreVersion,
            latestLoadMoreVersion: additionalLoadMoreFetchVersionRef.current,
            applyVersion,
            latestApplyVersion: additionalMatchingApplyVersionRef.current,
          });
          return;
        }
        console.log('[loadMore] batch', {
          requested: remaining,
          received: res.users.length,
          cursor,
          nextCursor: res.lastKey,
          hasMore: res.hasMore,
          sourceHasMore: res.sourceHasMore,
          loadedPages: res.loadedPages,
          stopReason: res.stopReason,
        });

        const unique = res.users.filter(
          u => u?.userId && !loadedIdsRef.current.has(u.userId)
        );
        if (unique.length) {
          collected.push(...unique);
        }

        const stuck = !res.lastKey || isSameMatchingCursor(res.lastKey, cursor);
        cursor = res.lastKey;
        canLoadMore = res.hasMore && !stuck;
      }

      collected.forEach(u => { if (!u.__fromCardCache) updateCard(u.userId, u); });
      if (!isLatestLoadMore()) return;
      collected.forEach(u => loadedIdsRef.current.add(u.userId));
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        collected.forEach(u => map.set(u.userId, u));
        const result = Array.from(map.values());
        setIdsForQuery(defaultListKey, result.map(u => u.userId));
        return result;
      });
      void loadCommentsFor(collected);

      const sourceCanContinueWithoutVisibleCards = canLoadMore && collected.length === 0;
      if (sourceCanContinueWithoutVisibleCards) {
        console.log('[loadMore] source cursor advanced with more pages; keeping hasMore true for next cycle');
        setHasMore(true);
      } else if (handleEmptyFetch({ users: collected, lastKey: cursor }, lastKey, setHasMore)) {
        console.log('[loadMore] empty fetch, no more cards');
      } else {
        setHasMore(canLoadMore);
      }
      setLastKey(cursor);
      return collected.length;
    } finally {
      finishLoadMoreIfLatest();
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
    sharedReactionIds,
    viewMode,
  ]);

  useEffect(() => {
    if (viewModeRef.current === 'favorites' || viewModeRef.current === 'dislikes') return;
    reloadDefault();
    // reloadDefault is intentionally not a dependency: mode/source switches call explicit handlers,
    // while reaction-state changes must not retrigger the default deck loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previousCollectionSourceForReloadRef = useRef(collectionSource);
  useEffect(() => {
    if (previousCollectionSourceForReloadRef.current === collectionSource) return;
    previousCollectionSourceForReloadRef.current = collectionSource;

    setActiveProfileIndex(0);
    if (viewModeRef.current === 'favorites' || viewModeRef.current === 'dislikes') {
      void loadReactionCards(viewModeRef.current);
      return;
    }

    reloadDefault();
  }, [collectionSource, loadReactionCards, reloadDefault]);

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

  const reactionTabUsers = useMemo(() => {
    if (viewMode !== 'favorites' && viewMode !== 'dislikes') return [];

    const reactionMap = viewMode === 'favorites' ? favoriteUsers : dislikeUsers;
    const reactionIds = Object.keys(normalizeReactionMap(reactionMap));
    if (!reactionIds.length) return [];

    const candidateUsersById = new Map();
    [
      ...users,
      ...additionalNewUsers,
      ...sharedReactionCandidateUsers,
    ].forEach(user => {
      if (!user?.userId || candidateUsersById.has(user.userId)) return;
      candidateUsersById.set(user.userId, user);
    });

    const uniqueIds = new Set();
    return reactionIds
      .map(id => candidateUsersById.get(id))
      .filter(card => Boolean(card))
      .filter(card => {
        if (!card?.userId || uniqueIds.has(card.userId)) return false;
        if (!canShowReactionTabCard(card, { isAdmin })) return false;
        uniqueIds.add(card.userId);
        return true;
      });
  }, [
    additionalNewUsers,
    dislikeUsers,
    favoriteUsers,
    isAdmin,
    sharedReactionCandidateUsers,
    users,
    viewMode,
  ]);

  const filteredUsers = (viewMode === 'favorites' || viewMode === 'dislikes')
    ? reactionTabUsers
    : applyMatchingUiFiltersToUsers({
    users: visibleUsers,
    filters,
    filterMainFn: filterMain,
    favoriteUsers,
    dislikeUsers,
    excludeReactionUsers: viewMode === 'default',
    roleIndexSets,
    collectionSource,
    viewMode,
  });
  const renderedCards = filteredUsers;
  const renderedCardsLength = renderedCards.length;

  useEffect(() => {
    if (viewMode !== 'favorites' && viewMode !== 'dislikes') return;

    debugReactionFlowLog('render:visible-filtered-rendered', {
      viewMode,
      loading,
      loadingRef: loadingRef.current,
      hasMore,
      collectionSource,
      reactionIds: summarizeIdsForDebug(Object.keys(normalizeReactionMap(viewMode === 'favorites' ? favoriteUsers : dislikeUsers))),
      users: summarizeUsersForReactionDebug(users),
      additionalNewUsers: summarizeUsersForReactionDebug(additionalNewUsers),
      sharedReactionCandidateUsers: summarizeUsersForReactionDebug(sharedReactionCandidateUsers),
      reactionTabUsers: summarizeUsersForReactionDebug(reactionTabUsers),
      visibleUsers: summarizeUsersForReactionDebug(visibleUsers),
      filteredUsers: summarizeUsersForReactionDebug(filteredUsers),
      renderedCards: summarizeUsersForReactionDebug(renderedCards),
      filters: getActiveMatchingFiltersDebug(filters),
      favoriteUsers: summarizeReactionMapForDebug(favoriteUsers),
      dislikeUsers: summarizeReactionMapForDebug(dislikeUsers),
      reactionPagination: reactionPaginationByType[viewMode],
    });
  }, [
    additionalNewUsers,
    collectionSource,
    dislikeUsers,
    favoriteUsers,
    filteredUsers,
    reactionTabUsers,
    filters,
    hasMore,
    loading,
    reactionPaginationByType,
    renderedCards,
    sharedReactionCandidateUsers,
    users,
    viewMode,
    visibleUsers,
  ]);

  const activeProfile = filteredUsers[activeProfileIndex] || null;

  const withLazyPhotos = React.useCallback(user => {
    if (!user?.userId) return user;
    const cachedPhotos = photoCacheByUserId[user.userId];
    if (!cachedPhotos) return user;
    return {
      ...user,
      photos: cachedPhotos,
      __photosHydrated: true,
    };
  }, [photoCacheByUserId]);

  const activeProfileWithLazyPhotos = withLazyPhotos(activeProfile);

  useEffect(() => {
    const candidates = [filteredUsers[activeProfileIndex], filteredUsers[activeProfileIndex + 1]]
      .filter(user => user?.userId && !user.__photosHydrated && !photoCacheByUserId[user.userId]);
    if (!candidates.length) return undefined;

    let cancelled = false;
    candidates.forEach(user => {
      lazyLoadProfilePhotos(user.userId).then(photos => {
        if (cancelled) return;
        incrementMatchingLoadStat('photoLazyLoadProfiles');
        setPhotoCacheByUserId(prev => ({
          ...prev,
          [user.userId]: Array.isArray(photos) ? photos : [],
        }));
        const stats = typeof window !== 'undefined' ? window.matchingLoadStats : null;
        if (stats && typeof console.table === 'function') console.table([stats]);
      }).catch(() => {
        if (!cancelled) {
          setPhotoCacheByUserId(prev => ({ ...prev, [user.userId]: [] }));
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeProfileIndex, filteredUsers, photoCacheByUserId]);

  useEffect(() => {
    if (activeProfile?.userId) {
      void loadCommentsFor([activeProfile], { activeOnly: true });
    }
  }, [activeProfile, loadCommentsFor]);

  useEffect(() => {
    setActiveProfileIndex(index => {
      if (filteredUsers.length === 0) return 0;
      return Math.min(index, filteredUsers.length - 1);
    });
  }, [filteredUsers.length]);

  useEffect(() => {
    setActiveProfileIndex(0);
  }, [
    collectionSource,
    reactionPaginationByType.favorites.ids,
    reactionPaginationByType.dislikes.ids,
    viewMode,
  ]);

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

  const runAutoLoadMore = React.useCallback((signature, payload) => {
    if (emptyAutoLoadMoreAttemptsRef.current >= MATCHING_MAX_EMPTY_AUTO_LOAD_MORE_ATTEMPTS) return;
    if (autoLoadMoreSignatureRef.current === signature) return;
    const now = Date.now();
    if (now - autoLoadMoreLastRunRef.current < MATCHING_AUTO_LOAD_MORE_COOLDOWN_MS) return;

    autoLoadMoreSignatureRef.current = signature;
    autoLoadMoreLastRunRef.current = now;
    Promise.resolve(loadMore(payload)).then(addedCount => {
      const visibleAdded = Math.max(0, Number(addedCount) || 0);
      incrementMatchingLoadStat('visibleCardsAdded', visibleAdded);
      if (visibleAdded > 0) {
        emptyAutoLoadMoreAttemptsRef.current = 0;
      } else {
        emptyAutoLoadMoreAttemptsRef.current += 1;
        incrementMatchingLoadStat('emptyLoadMoreAttempts');
      }
      const stats = typeof window !== 'undefined' ? window.matchingLoadStats : null;
      if (stats && typeof console.table === 'function') console.table([stats]);
    });
  }, [loadMore]);

  useEffect(() => {
    if (viewMode !== 'default' && viewMode !== 'favorites' && viewMode !== 'dislikes') return;
    if (loadingRef.current || loading) return;
    if (!hasMore) return;
    if (filteredUsers.length >= MATCHING_VISIBLE_BUFFER) return;

    const signature = stableAdditionalSignature({
      type: 'refill',
      viewMode,
      collectionSource,
      length: filteredUsers.length,
      lastKey,
      additionalNextOffset,
      filters,
    });
    runAutoLoadMore(signature, {
      currentVisibleCount: filteredUsers.length,
      targetVisibleCount: MATCHING_VISIBLE_BUFFER,
      limit: MATCHING_REFILL_LIMIT,
    });
  }, [additionalNextOffset, collectionSource, filteredUsers.length, filters, hasMore, lastKey, loading, runAutoLoadMore, viewMode]);

  const lastCardLoadTriggerSignatureRef = useRef('');
  const lastCardVisibilityLogSignatureRef = useRef('');
  useEffect(() => {
    if (viewMode !== 'default' && viewMode !== 'favorites' && viewMode !== 'dislikes') return;
    if (renderedCardsLength < 1) return;

    const lastRenderedIndex = renderedCardsLength - 1;
    const activeRenderedIndex = activeProfileIndex;
    if (activeRenderedIndex < lastRenderedIndex) return;

    const reactionPagination = reactionPaginationByType[viewMode] || buildEmptyReactionPagination();
    const sourceNextOffset = collectionSource === 'newUsers' && parsedAdditionalAccessRules.length > 0
      ? additionalNextOffset
      : (viewMode === 'favorites' || viewMode === 'dislikes' ? reactionPagination.nextOffset : undefined);
    const sourceCursor = sourceNextOffset ?? lastKey ?? null;
    const sourceCursorSignature = stableAdditionalSignature(
      sourceNextOffset !== undefined && sourceNextOffset !== null
        ? { type: 'sourceNextOffset', value: sourceNextOffset }
        : { type: 'lastKey', value: lastKey ?? null }
    );
    const sourceHasMore = Boolean(hasMore);
    const loadingRefCurrent = Boolean(loadingRef.current);
    const lastRenderedCard = renderedCards[lastRenderedIndex] || null;
    const lastRenderedCardUserId = lastRenderedCard?.userId || null;
    const paginationSignature = stableAdditionalSignature({
      collectionSource,
      sourceCursorSignature,
      viewMode,
    });
    const triggerSignature = stableAdditionalSignature({
      paginationSignature,
      renderedLength: renderedCardsLength,
      activeRenderedIndex,
      triggerIndex: lastRenderedIndex,
      triggerUserId: lastRenderedCardUserId || '',
    });
    const visibilityLogSignature = [
      triggerSignature,
      sourceHasMore ? 'has-more' : 'no-more',
      loadingRefCurrent || loading ? 'loading' : 'idle',
    ].join('::');

    if (lastCardVisibilityLogSignatureRef.current !== visibilityLogSignature) {
      lastCardVisibilityLogSignatureRef.current = visibilityLogSignature;
      console.log('[Matching][lastCardActive]', {
        renderedLength: renderedCardsLength,
        triggerIndex: lastRenderedIndex,
        triggerUserId: lastRenderedCardUserId,
        activeRenderedIndex,
        hasMore: sourceHasMore,
        loadingRefCurrent,
        sourceNextOffset,
        lastKey,
        sourceCursor,
        sourceCursorSignature,
      });
    }

    if (!sourceHasMore || loadingRefCurrent || loading) return;
    if (lastCardLoadTriggerSignatureRef.current === triggerSignature) return;
    lastCardLoadTriggerSignatureRef.current = triggerSignature;

    runAutoLoadMore(`last-card:${triggerSignature}`, {
      currentVisibleCount: renderedCardsLength,
      targetVisibleCount: MATCHING_VISIBLE_BUFFER,
      limit: MATCHING_REFILL_LIMIT,
    });
  }, [
    activeProfileIndex,
    additionalNextOffset,
    collectionSource,
    hasMore,
    lastKey,
    runAutoLoadMore,
    loading,
    parsedAdditionalAccessRules.length,
    reactionPaginationByType,
    renderedCards,
    renderedCardsLength,
    viewMode,
  ]);
  useEffect(() => {
    setBackendDownloadToastsEnabled(downloadSizeToastsEnabled);
  }, [downloadSizeToastsEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__MATCHING_DEBUG_LOG_MODE = matchingDebugLogMode;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MATCHING_DEBUG_LOG_MODE_KEY, matchingDebugLogMode);
    }
  }, [matchingDebugLogMode]);

  const handleDownloadSizeToastsToggle = () => {
    setDownloadSizeToastsEnabled(prev => !prev);
  };

  const handleMatchingDebugLogModeToggle = () => {
    setMatchingDebugLogMode(prev => {
      const nextMode = prev === 'file' ? 'console' : 'file';
      if (nextMode === 'file') {
        if (typeof window !== 'undefined') {
          window.__MATCHING_DEBUG_LOGS = [];
          window.__MATCHING_DEBUG_LOG_MODE = 'file';
        }
        writeMatchingDebugLog('logMode:enabled-file', { ownerId, viewMode: viewModeRef.current, collectionSource: collectionSourceRef.current });
        toast.success('Логи Matching пишуться у файл. Натисни ще раз, щоб завантажити файл.');
      } else {
        writeMatchingDebugLog('logMode:disabled-file', { ownerId, viewMode: viewModeRef.current, collectionSource: collectionSourceRef.current });
        downloadMatchingDebugLogs({ reason: 'toggle-to-console' });
        if (typeof window !== 'undefined') window.__MATCHING_DEBUG_LOG_MODE = 'console';
        toast.success('Файл логів Matching завантажено. Консольні логи увімкнено.');
      }
      return nextMode;
    });
  };

  const showBackendTrafficToggle = ownerId === BACKEND_TRAFFIC_TRACKING_TEST_UID;
  const showMatchingDebugLogModeToggle = ownerId === MATCHING_LOG_MODE_TEST_USER_ID;

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
      <FilterContainer show={showFilters} $themeMode={themeMode} onClick={e => e.stopPropagation()}>
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
              onChange={e => switchCollectionSource(e.target.value)}
            />
            Основна (users)
          </CollectionSourceLabel>
          <CollectionSourceLabel>
            <input
              type="radio"
              name="matchingCollectionSource"
              value="newUsers"
              checked={collectionSource === 'newUsers'}
              onChange={e => switchCollectionSource(e.target.value)}
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
      <Container $themeMode={themeMode}>
        <InnerContainer>
          <HeaderContainer>
            <TopActions>
              <ThemeToggleButton
                type="button"
                $themeMode={themeMode}
                aria-pressed={themeMode === 'light'}
                aria-label={themeMode === 'light' ? 'Switch Matching to dark theme' : 'Switch Matching to light theme'}
                title={themeMode === 'light' ? 'Dark theme' : 'Light theme'}
                onClick={handleThemeToggle}
              >
                <ThemeToggleTrackIcon $side="left" $active={themeMode === 'dark'} aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img">
                    <path fill="currentColor" d="M15.4 2.8a7.4 7.4 0 1 0 5.8 10.8 6.2 6.2 0 1 1-5.8-10.8Z" />
                    <circle cx="6" cy="6" r="1.4" fill="#ffd45c" />
                    <circle cx="19" cy="5.5" r="1.1" fill="#ffd45c" />
                  </svg>
                </ThemeToggleTrackIcon>
                <ThemeToggleTrackIcon $side="right" $active={themeMode === 'light'} aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img">
                    <circle cx="9" cy="9" r="4" fill="#ffd45c" />
                    <path fill="currentColor" d="M8 17.5h8.8a3.8 3.8 0 0 0 .4-7.6 5.3 5.3 0 0 0-10.1 1.7A3 3 0 0 0 8 17.5Z" />
                  </svg>
                </ThemeToggleTrackIcon>
                <ThemeToggleKnob $themeMode={themeMode} aria-hidden="true">
                  <ThemeToggleScene $themeMode={themeMode} />
                </ThemeToggleKnob>
              </ThemeToggleButton>
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
              {showMatchingDebugLogModeToggle && (
                <BackendTrafficToggleButton
                  type="button"
                  $active={matchingDebugLogMode === 'file'}
                  aria-pressed={matchingDebugLogMode === 'file'}
                  title={
                    matchingDebugLogMode === 'file'
                      ? 'Завантажити файл логів Matching і повернути логи в консоль'
                      : 'Писати логи Matching у файл замість консолі'
                  }
                  aria-label={
                    matchingDebugLogMode === 'file'
                      ? 'Завантажити файл логів Matching і повернути логи в консоль'
                      : 'Писати логи Matching у файл замість консолі'
                  }
                  onClick={handleMatchingDebugLogModeToggle}
                >
                  🧾
                  <BackendTrafficToggleStatus>{matchingDebugLogMode === 'file' ? 'FILE' : 'LOG'}</BackendTrafficToggleStatus>
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
            {activeProfileWithLazyPhotos ? (() => {
              const user = activeProfileWithLazyPhotos;
              const photos = getProfilePhotos(user);
              const photo = photos[0];
              const role = getProfileRole(user);
              const isAgency = role === 'ag' || role === 'ip';
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
                          setLocalComment(ownerId, user.userId, text, res?.lastAction);
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

          {showInfoModal && (
            <InfoModal onClose={() => setShowInfoModal(false)} text="dotsMenu" Context={dotsMenu} />
          )}
        </InnerContainer>
      </Container>
    </>
  );
};

export default Matching;
