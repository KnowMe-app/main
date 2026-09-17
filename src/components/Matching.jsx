import React, { useEffect, useState, useRef, useLayoutEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resolveAccess } from 'utils/accessLevel';
import {
  ActionBadge,
  ActionButton,
  AdminToggle,
  AnimatedCard,
  CardContainer,
  CardWrapper,
  ClickableId,
  CommentBox,
  CommentInput,
  NoteField,
  NoteLane,
  NoteLaneHead,
  NoteLaneHint,
  NoteLanes,
  Container,
  FilterContainer,
  FilterDrawerBody,
  FilterDrawerClose,
  FilterDrawerFooter,
  FilterDrawerHeader,
  FilterDrawerHeading,
  FilterDrawerSubtitle,
  FilterDrawerTitle,
  FilterOverlay,
  FilterResetButton,
  Grid,
  InnerContainer,
  OwnerStatusMessage,
  SharedCommentText,
  SkeletonCardInner,
  SkeletonInfo,
  SkeletonLine,
  SkeletonPhoto,
  TopActionGroup,
  TopActions,
  ModernActionRail,
  ModernBioText,
  ModernChip,
  ModernChipGrid,
  ModernContactDetails,
  ContactIconLink,
  ContactIconRow,
  ContactPrimaryRow,
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
  ModernContactHints,
  ModernPhotoStrip,
  ModernPhotoThumb,
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
  MatchingSearchStatusMessage,
  Chip,
  ChipCount,
  ChipRemove,
  ChipsGroup,
  ChipsRow,
  FeedCountdown,
  FeedCountdownHint,
  FeedList,
  FeedLoadPromptButton,
  FeedNotice,
  FeedSentinel,
  FeedWrap,
  QueryDraftBody,
  QueryDraftButton,
  QueryDraftCard,
  QueryDraftLabel,
  QueryDraftNote,
  QueryDraftValue,
  MatchingTopBar,
  FilterApplyButton,
  SearchField,
  GalleryActionButton,
  GalleryActions,
  GalleryBody,
  GalleryFacts,
  GalleryColumn,
  GalleryGrid,
  GalleryHiddenBadge,
  GalleryLocation,
  GalleryName,
  GalleryNameRow,
  GalleryPhotoBox,
  GalleryPhotoCount,
  GalleryPublishDot,
  GalleryRoleTag,
  GalleryTile,
  LayoutToggleButton,
  DetailBar,
  DetailCloseButton,
  DetailInner,
  DetailLayer,
  DetailPosition,
} from './Matching.styled';
import {
  fetchUserById,
  lazyLoadProfilePhotos,
  fetchFavoriteUsers,
  fetchDislikeUsers,
  addContactViewUser,
  addMatchingSearchQuery,
  filterMain,
  searchUsersOnly,
  fetchUserComments,
  saveMyCardComment,
  addPublicProfileComment,
  deletePublicProfileComment,
  fetchPublicProfileComments,
  updatePublicProfileComment,
  COMMENTS_ROOT_PATH,
  PUBLIC_COMMENTS_ROOT_PATH,
  fetchUsersByIds,
  fetchMatchingCardsPage,
  fetchMatchingCardsByIds,
  clearMatchingCardsPageInFlight,
  fetchLimitedProfileById,
  database,
  auth,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
} from './config';
import { get as firebaseGet, onValue as firebaseOnValue, ref as refDb, query, orderByKey, startAt, endAt } from 'firebase/database';
import {
  BACKEND_TRAFFIC_TRACKING_TEST_UID,
  getBackendDownloadToastsEnabled,
  setBackendDownloadToastsEnabled,
  withAdminDownloadToast,
  wrapAdminOnValue,
} from 'utils/backendDownloadToast';

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { BtnFavorite, toggleFavoriteUser } from './smallCard/btnFavorite';
import { BtnDislike, toggleDislikeUser } from './smallCard/btnDislike';
import SearchBar, { detectSearchParams, getSearchCacheKeyForParams } from './SearchBar';
import PhotoViewer from './PhotoViewer';
import FilterPanel, { getDefaultFilters } from './FilterPanel';
import { buildMatchingFilterChips } from './SearchFilters';
import { getFieldLabel, pickerFields } from './formFields';
import { useAutoResize } from '../hooks/useAutoResize';
import { getCacheKey, clearAllCardsCache, setFavoriteIds } from "../utils/cache";
import {
  buildMatchingSearchResultCacheKey,
  clearMatchingCache,
  getCachedMatchingSummaryCards,
  getCard,
  getCompleteCachedProfile,
  getIdsByQuery,
  getIndexIdsByQuery,
  getMatchingLocalStorageCacheEpoch,
  incrementMatchingLoadStat,
  logMatchingLocalStorageCacheStats,
  normalizeQueryKey,
  setCachedMatchingSummaryCards,
  setIdsForQuery,
  setIndexIdsForQuery,
} from '../utils/cardIndex';
import {
  cleanupMatchingLocalStorageCache,
  logMatchingLocalStorageDebugStats,
} from '../utils/searchKeyCache';
import { findCachedCardsByText, getCardsByList, updateCard } from '../utils/cardsStorage';
import { getCachedPhotoUrlsMap, setCachedPhotoUrls } from '../utils/photoUrlCache';
import {
  MATCHING_CARDS_ROOT,
  MATCHING_CARD_FEED_FIELD,
  MATCHING_CARD_ORDER_FIELD,
  isMatchingCardPublished,
  isMatchingSummaryCard,
} from '../utils/matchingCardIndex';
import { normalizeFeedDateValue } from '../utils/profileFieldDerive';
import { estimateGalleryTileHeight, splitIntoBalancedColumns } from '../utils/galleryColumns';
import { MATCHING_SEARCH_ID_PREFIXES } from '../utils/matchingSearchPrefixes';
import { readBackendLinksEnabled } from '../utils/backendLinksMode';
// Формат адреси в консолі Firebase живе в одному місці: власна копія вже одного
// разу розійшлась із чужою на слеші після `/data` і мовчки вела в корінь бази.
import { buildRtdbConsoleLink } from './profileFormNodeBlocks';
import { orderMatchingSearchResults } from '../utils/matchingSearchResultOrder';
import {
  MATCHING_FIRST_PAGE_BATCH,
  MATCHING_THROTTLED_LOAD_BATCH,
  MATCHING_THROTTLED_LOAD_DELAY_MS,
  MATCHING_THROTTLED_LOAD_MAX_ATTEMPTS,
} from '../utils/matchingFeedThrottle';
import FeedLoadCountdown from './FeedLoadCountdown';
import SearchRefineBar from './SearchRefineBar';
import {
  DEFAULT_REFINE_KEY,
  REFINE_MIN_RESULTS,
  applyRefineSelection,
  getRefineKeySpec,
  isRefineKeyAvailableInFeed,
} from '../utils/matchingRefineKey';
import { getCurrentDate } from './foramtDate';
import InfoModal from './InfoModal';
import MatchingHiddenList from './MatchingHiddenList';
import { canOfferProfileContacts } from '../utils/profileVisibilityScope';
import ProfileRow, {
  CommentBlock,
  PublicCommentBlock,
  ProfileNotes,
  enrichGateLabel,
  reviewsGateLabel,
  describeReviewsState,
  renderFacts as renderProfileFacts,
  splitFactsByGroup as splitProfileFactsByGroup,
} from './ProfileRow';
import { FaFilter, FaTimes, FaHeart, FaEllipsisV, FaGlobe, FaChevronLeft, FaChevronRight, FaMapMarkerAlt, FaThLarge, FaListUl, FaStethoscope, FaSyncAlt, FaSearch } from 'react-icons/fa';
import { FaRegHeart, FaUndoAlt, FaChevronDown, FaPencilAlt, FaRegCommentDots } from 'react-icons/fa';
import { PhoneHandsetIcon } from './icons/PhoneHandsetIcon';
import { CONTACT_ICONS, PHONE_QUICK_LINKS, getContactIcon, isExternalContact } from './contactIcons';
import { getContactEntries } from './contactMethods';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import { getEffectiveProfile, loadOwnProfileMutations } from 'utils/profileMutations';
import { findMatchingProfileMutations } from 'utils/profileCreationSearch';
import { applyOverlayToCard, getOwnOverlayCardIndex, getOwnOverlayFieldsForCards } from 'utils/multiAccountEdits';
import {
  buildMatchingSearchPath,
  MATCHING_SEARCH_QUERY_PARAM,
  MATCHING_SEARCH_STORAGE_KEY,
} from 'utils/matchingSearchLocation';
import { LOGIN_ROUTE, buildReturnToFromLocation } from 'utils/authRedirect';
import { useAppSettings } from 'hooks/useAppSettings';
import { uiText } from 'utils/uiTranslations';
import { keepDonorCounterpartyCards, isDonorViewer, viewerRoleSignature } from 'utils/matchingPeerVisibility';
import { profileUiText, resolveProfileLanguage, translateProfileLabel } from 'utils/profileTexts';
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
  getRoleCode,
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
  COMMENTS_UPDATED_EVENT,
  pruneComments,
  shouldUseServerComment,
} from '../utils/commentsStorage';
import {
  parseAdditionalAccessRuleGroups,
} from 'utils/additionalAccessRules';
import {
  checkReactionCardMembership,
  normalizeSearchKeySetKeys,
} from 'utils/filterSetsIndex';
import {
  MULTI_DATA_ACCESS_FIELD,
  parseMultiDataAccessUserIds,
  resolveMatchingMultiDataOwnerIds,
} from 'utils/multiDataAccess';
import {
  buildSharedReactionCandidateIds,
  canShowMatchingUser,
  getCanShowMatchingUserDebug,
  mergeMatchingCandidateUsers,
  mergeSharedReactionCandidateUsers,
  loadReactionCardsPageRecords,
  hasPendingSharedReactionCandidates,
  normalizePublish,
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
  fetchFilteredMatchingSourceChunk,
  fetchAdditionalAccessUsersBySearchIndex,
  fetchMatchingIndexedCandidates,
  getActiveMatchingFiltersDebug,
  getMatchingSearchKeyFilterDebugForUser,
  getMatchingUiFilterDebugSummary,
  isMatchingCardId,
  isSameMatchingCursor,
} from 'utils/matchingDataProvider';
import {
  normalizeMatchingInitialLoadError,
  runInitialRequestWithTimeout,
} from 'utils/matchingLoadError';

// Spec §9: diagnostics are admin-only, so they live in their own chunk and are
// only fetched once the flag is switched on.
const MatchingDiagnostics = React.lazy(() => import('./MatchingDiagnostics'));

export {
  INITIAL_MATCHING_REQUEST_TIMEOUT_MS,
  annotateMatchingStageError,
  normalizeMatchingInitialLoadError,
  runInitialRequestWithTimeout,
} from 'utils/matchingLoadError';


const MATCHING_SEARCH_BAR_ENABLED_KEYS = {
  searchId: true,
  equalToAllCards: false,
  searchKey: false,
  partialUserId: false,
};

const getMatchingSearchResultCount = result => {
  if (!result) return 0;
  if (Array.isArray(result)) return result.filter(Boolean).length;
  if (result.userId) return 1;
  if (typeof result === 'object') return Object.keys(result).length;
  return 0;
};

// Підпис статусу називає лише сам запит. Ключ звідси прибрано свідомо: пошук
// пробує всі префікси індексу одразу, тож назвати один із них («phone: Ольга»)
// означало б збрехати про те, де саме шукали.
const formatMatchingSearchKeyLabel = searchKey => {
  const entries = searchKey && typeof searchKey === 'object' ? Object.entries(searchKey) : [];
  if (entries.length === 0) return '';

  const [[key, value]] = entries;
  return String(value ?? '').trim() || key;
};

// Чому стрічка сповзла з проєкцій на повні анкети. Текст говорить, що робити.
const FEED_SOURCE_FALLBACK_REASONS = {
  'index-empty': 'matchingCards порожній — індекс не побудовано',
  'index-read-failed': 'matchingCards не вдалося прочитати',
  'pager-unavailable': 'пагінація matchingCards недоступна',
};

const DEBUG_ADDITIONAL_MATCHING_USER_ID = BACKEND_TRAFFIC_TRACKING_TEST_UID;
const MATCHING_LOG_MODE_TEST_USER_ID = 'S0VhDLCYjuTFDNLalRa85u7fPcg2';
const MATCHING_DATA_SOURCE_MODE_KEY = 'matchingDataSourceMode';
const MATCHING_DEBUG_LOG_MODE_KEY = 'matchingDebugLogMode';
const MATCHING_DEBUG_SHOW_ALL_INDEXED_CARDS_KEY = 'matchingDebugShowAllIndexedCards';
const MATCHING_DEBUG_VERSION = 'autoload-diagnostics-v2';
const DEBUG_SHARED_OWNER_ID = 'stFMfZ8CqQX05L8vK9Yse6FdYIh1';
const DEBUG_SHARED_CARD_ID = 'ID0001';
const ADDITIONAL_PROFILE_CACHE_TTL_MS = 45 * 1000;
const INITIAL_LOAD_ERROR_TOAST_ID = 'matching-initial-load-error';
const ADDITIONAL_MATCHING_LOG_LIMIT = 300;
const buildEmptyReactionPagination = () => ({ ids: [], nextOffset: 0, hasMore: false, accessSnapshotKey: '' });
const MATCHING_REACTION_IDLE_STYLE = { background: 'rgba(247, 147, 30, 0.95)' };
// «Сховати» — дія без акценту: колір тут витрачається лише на «в обране».
const MATCHING_DISLIKE_IDLE_STYLE = {
  background: 'var(--matching-card-bg)',
  border: '1px solid var(--matching-card-border)',
};

const shouldDebugAdditionalMatching = (...ids) =>
  ids.some(id => {
    const normalizedId = String(id || '').trim();
    return normalizedId === DEBUG_ADDITIONAL_MATCHING_USER_ID || normalizedId === MATCHING_LOG_MODE_TEST_USER_ID;
  });

const getStoredMatchingDebugLogMode = () => {
  if (typeof localStorage === 'undefined') return 'console';
  return localStorage.getItem(MATCHING_DEBUG_LOG_MODE_KEY) === 'file' ? 'file' : 'console';
};

const getStoredMatchingDataSourceMode = () => {
  if (typeof localStorage === 'undefined') return 'localFirst';
  return localStorage.getItem(MATCHING_DATA_SOURCE_MODE_KEY) === 'backend' ? 'backend' : 'localFirst';
};

const getStoredDebugShowAllIndexedCards = () => {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(MATCHING_DEBUG_SHOW_ALL_INDEXED_CARDS_KEY) === 'true';
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

const writeMatchingDebugLog = (stage, data = {}, errors = null) => {
  const store = getMatchingDebugLogsStore();
  if (!store) return;
  store.push({
    timestamp: new Date().toISOString(),
    stage,
    payload: {
      matchingDebugVersion: MATCHING_DEBUG_VERSION,
      ...data,
    },
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

const buildLoadMoreDebugPayload = ({
  ownerId,
  viewMode,
  loadedIdsCount = 0,
  visibleUsersCount = 0,
  hasMore = false,
  lastKey = null,
  requestVersion = null,
  loadingState = false,
  loadingRefState = false,
  extra = {},
} = {}) => ({
  ownerId: ownerId || null,
  viewMode: viewMode || null,
  loadedIdsCount: Number(loadedIdsCount) || 0,
  visibleUsersCount: Number(visibleUsersCount) || 0,
  hasMore: Boolean(hasMore),
  lastKey: lastKey ?? null,
  requestVersion: requestVersion ?? null,
  loadingState: Boolean(loadingState),
  loadingMoreRef: Boolean(loadingRefState),
  ...extra,
});

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

const serializeConsoleArg = value => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return String(value);
    }
  }
  return value;
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

  console.info('[ADD access debug]', message, data, compact);
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

const MATCHING_HIDDEN_CONTACT_KEYS = ['vk'];

// Оптимістичне значення `feedDate` для цятки публікації: справжнє дорахує
// писач (`buildMatchingCardProjection`), а екран не має чекати на нього, щоб
// перефарбувати крапку.
const todayFeedDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const sanitizeCardForBackend = card => {
  if (!card || typeof card !== 'object') return card;
  const blockedPrefixes = ['__', '_cache', '_debug', '_local'];
  return Object.fromEntries(
    Object.entries(card).filter(([key]) => {
      return !blockedPrefixes.some(prefix => key.startsWith(prefix));
    })
  );
};


const hasRenderableMatchingProfilePayload = card => {
  if (!card || typeof card !== 'object') return false;
  const hasName = Boolean(String(card.name || card.displayName || '').trim());
  const hasPhoto = Boolean(card.photoURL || card.photo || card.avatar || card.mainPhoto);
  const hasPhotosArray = Array.isArray(card.photos) && card.photos.length > 0;
  const hasAbout = Boolean(String(card.about || card.bio || '').trim());
  return hasName || hasPhoto || hasPhotosArray || hasAbout;
};

const normalizeReactionCard = (card, id) => {
  if (!card || typeof card !== 'object') return null;
  const normalizedId = String(card.userId || card.id || id || '').trim();
  if (!normalizedId) return null;
  return {
    ...card,
    userId: normalizedId,
    id: card.id || normalizedId,
  };
};

const isValidCachedReactionCard = (card, id) => {
  const normalized = normalizeReactionCard(card, id);
  if (!normalized) return false;
  return hasRenderableMatchingProfilePayload(normalized);
};
const canShowReactionTabCard = (card, { isAdmin = false } = {}) => {
  if (!card?.userId) return false;
  // Явно наданий (або явно знятий) доступ вирішує сам; далі — звичайне
  // `publish`. Колекція, з якої картка приїхала, тут уже ні до чого.
  if (card.__matchingAccessAllowed === false) return false;
  if (card.__matchingAccessAllowed === true) return true;
  if (isAdmin) return true;
  return card.publish !== false;
};

// Глядач без повного доступу до матчингу бачить картку додаткового доступу
// урізаною: рівно ті пʼять полів, які правила відкривають кожному авторизованому.
const fetchLimitedProfilesByIdsForMatching = async ids => (
  await Promise.all((ids || []).map(userId => fetchLimitedProfileById(userId)))
).filter(Boolean);

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
  rawRules = '',
  searchKeySetKeys = [],
  searchKeySetsOfExactUser,
} = {}) => stableAdditionalSignature({
  accessUserId: String(accessUserId || '').trim(),
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

// `field` дозволяє тому самому полю жити у двох типографіках: у рядку стрічки
// воно однорядкове, а на картці стоїть поруч із публічним коментарем і мусить
// читатись однаково з ним (`NoteField`).
const ResizableCommentInput = ({ value, onChange, onBlur, onClick, field: Field = CommentInput, ...rest }) => {
  const ref = useRef(null);
  const autoResize = useAutoResize(ref, value);

  return (
    <Field
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

const getContactLabel = (key, language) => translateProfileLabel(
  { otherLink: 'Other link' }[key] || key.charAt(0).toUpperCase() + key.slice(1),
  language,
);

const contactDisplayValue = entry => {
  const valueText = String(entry?.value || '').trim();
  return entry?.key === 'phone' ? `+${valueText.replace(/\s/g, '')}` : valueText;
};

/**
 * Блок контактів картки — номер у першому рядку, решта в другому.
 *
 * Повністю читається лише телефон: його переписують, диктують і звіряють.
 * Пошта й ніки читання не потребують — у них тапають, — а текстом вони
 * забирали по рядку кожен і розтягували блок на пів екрана. Що саме за
 * іконкою, каже `title`, тож значення не зникає, а лише перестає займати рядок.
 *
 * Номерів у анкеті буває кілька — тоді перших рядків стільки ж, по одному на
 * номер: кожен зі своїми кнопками месенджерів.
 */
const ProfileContactLinks = ({ user, role, language }) => {
  const entries = getContactEntries(user).filter(entry => !MATCHING_HIDDEN_CONTACT_KEYS.includes(entry.key));
  if (!entries.length) return null;

  const phones = entries.filter(entry => entry.key === 'phone');
  const others = entries.filter(entry => entry.key !== 'phone');

  return (
    <ModernContactLinks onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      {phones.map(entry => {
        const displayValue = contactDisplayValue(entry);
        return (
          <ContactPrimaryRow key={`phone-${entry.index}-${entry.value}`}>
            <ModernContactLink
              href={entry.href}
              $role={role}
              title={`${getContactLabel('phone', language)}: ${displayValue}`}
              aria-label={`${getContactLabel('phone', language)}: ${displayValue}`}
            >
              <PhoneHandsetIcon />
              <span>{displayValue}</span>
            </ModernContactLink>
            <ContactIconRow>
              {PHONE_QUICK_LINKS.map(({ key, Icon, label, build }) => (
                <ContactIconLink
                  key={`phone-${key}-${entry.index}`}
                  href={build(entry.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${label}: ${displayValue}`}
                  aria-label={`${label}: ${displayValue}`}
                >
                  <Icon />
                </ContactIconLink>
              ))}
            </ContactIconRow>
          </ContactPrimaryRow>
        );
      })}
      {others.length > 0 && (
        <ContactIconRow $standalone>
          {others.map(entry => {
            const Icon = getContactIcon(entry.key);
            const displayValue = contactDisplayValue(entry);
            const label = `${getContactLabel(entry.key, language)}: ${displayValue}`;
            return (
              <ContactIconLink
                key={`${entry.key}-${entry.index}-${entry.value}`}
                href={entry.href}
                target={isExternalContact(entry.key) ? '_blank' : undefined}
                rel={isExternalContact(entry.key) ? 'noopener noreferrer' : undefined}
                title={label}
                aria-label={label}
              >
                <Icon />
              </ContactIconLink>
            );
          })}
        </ContactIconRow>
      )}
    </ModernContactLinks>
  );
};

const ProfileBio = ({ text, language }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const shouldCollapse = text.length > 230;
  const displayText = shouldCollapse && !expanded ? `${text.slice(0, 230).trim()}…` : text;
  return (
    <ModernSection>
      <ModernSectionTitle>{profileUiText('about', language)}</ModernSectionTitle>
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

const formatHeroFact = (item, language) => {
  const rawValue = String(item?.value || '').trim();
  const rawUnit = HERO_FACT_UNITS[item?.key];
  const preferredUnit = rawUnit ? translateProfileLabel(rawUnit, language) : rawUnit;
  if (!rawValue) return { value: '', unit: preferredUnit || '' };

  if (rawUnit) {
    const withoutUnit = rawValue.replace(new RegExp(`\\s*${rawUnit}$`, 'i'), '').trim();
    return { value: withoutUnit || rawValue, unit: preferredUnit };
  }

  const unitMatch = rawValue.match(/^(.+?)\s*(cm|kg|кг|см)$/i);
  if (unitMatch) return { value: unitMatch[1].trim(), unit: unitMatch[2] };
  return { value: rawValue, unit: '' };
};

const SwipeableCard = ({
  user,
  canonicalUserData,
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
  // Реакція сталася — картку треба **лишити** на екрані до наступної збірки
  // деки, а не прибрати з неї. Досі тут стояв `handleRemove`, який викидав
  // анкету зі списку тієї ж миті: лайк у відкритій картці гортав на наступну
  // людину, і подивитись, кого щойно вподобав, було вже ніде.
  onReacted,
  togglePublish,
  multiDataOwnerId,
  onNavigate,
  commentValue,
  sharedCommentTexts = [],
  onCommentChange,
  onCommentBlur,
  publicCommentSlot = null,
  onAdminEdit,
  onEnrich,
  debugRejectReasons = [],
  showDebugRejectReasons = false,
  debugFilteredOutReason = '',
  debugUiFilterSummary = '',
  debugUiFilterFailedFilters = '',
  debugCardDiagnostics = null,
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
  const contactViewKeysRef = useRef(new Set());
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

  // Мова картки — та сама, що обрана в меню трьох крапок. Читається тут, а не
  // в кожному гетері окремо: інакше половина рядка йшла б однією мовою, а
  // половина — тією, яку модуль вважав за замовчуванням.
  const { language } = useAppSettings();
  const profileName = getProfileName(user);
  // Плашка ролі несе той самий дволітерний код, що й рядок стрічки: словом
  // («Донорка яйцеклітин») вона казала про ту саму роль інакше, ніж список, і
  // мовою інтерфейсу — тобто дві назви на дві мови на одну річ.
  const roleCode = getRoleCode(resolvedRole);
  // Роль без назви — це `Profile`/`Анкета`; порівнюємо з кодом, а не з написом,
  // бо напис залежить від мови.
  const isGenericProfileRole = resolvedRole === 'other';
  const name = profileName || '';
  const age = getProfileAge(user);
  const title = [name, age].filter(Boolean).join(', ');
  const shouldShowRoleBadge = !isGenericProfileRole && Boolean(roleCode);
  // Те саме рішення, що й у рядку стрічки: спершу доповнення (його має той,
  // хто заводить картки), потім редагування (його має адмін). Урізаній
  // проєкції не належить ні те, ні те — правити в ній нема чого.
  const editProfileAction = useMemo(() => {
    if (user?.__limitedProfile) return null;
    if (onEnrich) return { title: uiText('Доповнити дані', language), onClick: () => onEnrich(user) };
    if (isAdmin && onAdminEdit) return { title: uiText('Редагувати анкету', language), onClick: onAdminEdit };
    return null;
  }, [isAdmin, language, onAdminEdit, onEnrich, user]);
  const locationInfo = getProfileLocation(user);
  const identityAndLocationKeys = [
    'name',
    'surname',
    'agencyName',
    'companyName',
    'agency',
    'country',
    'region',
    'city',
    'role',
    'userRole',
    'cSection',
    'csection',
    'c_section',
    'cesareanSection',
  ];
  const heroFields = getHeroFields(user, resolvedRole, { excludeKeys: identityAndLocationKeys, language });
  const usedSummaryFieldKeys = collectProfileFieldKeys(heroFields);
  const bodyHeroFields = getQuickFacts(user, resolvedRole, { excludeKeys: [...identityAndLocationKeys, ...usedSummaryFieldKeys], language });
  const usedBodyFieldKeys = collectProfileFieldKeys(bodyHeroFields);
  const sections = getProfileSections(user, resolvedRole, { excludeKeys: [...identityAndLocationKeys, ...usedSummaryFieldKeys, ...usedBodyFieldKeys, ...MATCHING_HIDDEN_CONTACT_KEYS], language });
  const bio = getProfileBio(user);
  const contactHintIcons = getContactEntries(user)
    .filter(entry => !MATCHING_HIDDEN_CONTACT_KEYS.includes(entry.key))
    .map(entry => ({ key: entry.key, Icon: CONTACT_ICONS[entry.key] || FaGlobe }))
    .slice(0, 4);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
  const shouldShowHeroContent = Boolean(title || locationInfo || heroFields.length > 0);
  const debugReasons = Array.isArray(debugRejectReasons) ? debugRejectReasons.filter(Boolean) : [];
  // Плашка з причиною відсіву — інструмент режиму діагностики, а не частина
  // картки. Поки вона малювалась із самої лише наявності причини, звичайний
  // читач бачив і внутрішні назви функцій та умов, і — головне — саму картку,
  // яку та причина забороняла показувати.
  const showDebugOverlay = Boolean(showDebugRejectReasons);
  const debugReasonText = showDebugOverlay
    ? (debugFilteredOutReason || (debugReasons.length > 0 ? debugReasons.join(', ') : ''))
    : '';
  const debugReasonLabel = !showDebugOverlay
    ? ''
    : (debugFilteredOutReason
      ? `Filtered: ${debugFilteredOutReason}`
      : (debugReasons.length > 0 ? 'DEBUG: normally hidden' : ''));
  const debugReasonHint = debugReasonText === 'blocked_by_ui_filter'
    ? `Картка прихована активними UI-фільтрами${debugUiFilterSummary ? `: ${debugUiFilterSummary}` : ''}`
    : '';
  const debugFailedFiltersHint = debugUiFilterFailedFilters
    ? `Blocked by: ${debugUiFilterFailedFilters}`
    : '';
  const debugContext = [
    user?.userId ? `userId=${user.userId}` : '',
    typeof user?.__matchingAccessAllowed === 'boolean' ? `matchingAccess=${user.__matchingAccessAllowed ? 'allowed' : 'blocked'}` : '',
  ].filter(Boolean).join(' · ');
  const diagnostics = debugCardDiagnostics && typeof debugCardDiagnostics === 'object' ? debugCardDiagnostics : null;
  const matchingDebugTrace = diagnostics?.__matchingDebugTrace && typeof diagnostics.__matchingDebugTrace === 'object'
    ? diagnostics.__matchingDebugTrace
    : null;
  const debugDiagnosticsRows = showDebugOverlay && diagnostics ? [
    `role=${diagnostics.role || '-'}`,
    `userRole=${diagnostics.userRole || '-'}`,
    `inVisible=${diagnostics.inVisibleCardIds ? 'yes' : 'no'}`,
    `inFiltered=${diagnostics.inFilteredUsers ? 'yes' : 'no'}`,
    `hiddenByUiFilter=${diagnostics.hiddenByUiFilter ? 'yes' : 'no'}`,
    `failedFilters=${Array.isArray(diagnostics.failedFilters) && diagnostics.failedFilters.length ? diagnostics.failedFilters.join('|') : '-'}`,
    `excludedBy=${diagnostics.excludedBy || '-'}`,
    `excludedAtStage=${diagnostics.excludedAtStage || '-'}`,
    `excludedReason=${diagnostics.excludedReason || '-'}`,
    `excludedFunction=${diagnostics.excludedFunction || '-'}`,
    `excludedCondition=${diagnostics.excludedCondition || '-'}`,
    `exactReason=${diagnostics.exactReason || '-'}`,
    `uiFailedFilters=${Array.isArray(diagnostics.uiFailedFilters) && diagnostics.uiFailedFilters.length ? diagnostics.uiFailedFilters.join('|') : '-'}`,
    `searchKeyFailedFilters=${Array.isArray(diagnostics.searchKeyFailedFilters) && diagnostics.searchKeyFailedFilters.length ? diagnostics.searchKeyFailedFilters.join('|') : '-'}`,
  ] : [];

  const handleContactsToggle = e => {
    e.stopPropagation();
    const owner = auth.currentUser;
    if (!e.currentTarget.open || !owner || !user.userId) return;
    const contactViewKey = `${multiDataOwnerId || owner.uid}:${user.userId}`;
    if (contactViewKeysRef.current.has(contactViewKey)) return;
    contactViewKeysRef.current.add(contactViewKey);
    void addContactViewUser(user.userId, multiDataOwnerId);
  };

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
      style={showDebugOverlay && debugFilteredOutReason ? { opacity: 0.58, filter: 'grayscale(0.85)' } : undefined}
    >
      <ModernProfileShell $role={resolvedRole}>
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
          {shouldShowRoleBadge && <ModernRoleBadge $role={resolvedRole}>{roleCode}</ModernRoleBadge>}
        </ModernHero>
        {showDebugOverlay && (debugFilteredOutReason || debugReasons.length > 0) && (
          <div style={{ margin: '10px 14px 0', padding: '8px 10px', borderRadius: 10, background: '#5a1325', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            {debugReasonLabel && <div>{debugReasonLabel}</div>}
            {debugReasonText && <div style={{ marginTop: 4, fontWeight: 600 }}>Reason: {debugReasonText}</div>}
            {debugReasonHint && <div style={{ marginTop: 4, fontWeight: 500 }}>Hint: {debugReasonHint}</div>}
            {debugFailedFiltersHint && <div style={{ marginTop: 4, fontWeight: 500 }}>Filters: {debugFailedFiltersHint}</div>}
            {debugContext && <div style={{ marginTop: 4, opacity: 0.9, fontWeight: 500 }}>Context: {debugContext}</div>}
            {diagnostics && (
              <>
                <div style={{ marginTop: 4, fontWeight: 600 }}>Function: {diagnostics.excludedFunction || '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Condition: {diagnostics.excludedCondition || '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Exact reason: {diagnostics.exactReason || '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Stage: {diagnostics.excludedAtStage || '-'}</div>
              </>
            )}
            {matchingDebugTrace && (
              <>
                <div style={{ marginTop: 4, fontWeight: 600 }}>Function: {matchingDebugTrace.excludedByFunction || '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Condition: {matchingDebugTrace.excludedCondition || '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Exact reason: {matchingDebugTrace.exactReason || '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Stage: {matchingDebugTrace.excludedAtStage || '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Failed filters: {Array.isArray(matchingDebugTrace.failedFilters) && matchingDebugTrace.failedFilters.length ? matchingDebugTrace.failedFilters.join('|') : '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Active filters: {matchingDebugTrace.activeFiltersSnapshot || '-'}</div>
                <div style={{ marginTop: 2, fontWeight: 600 }}>Card values: {matchingDebugTrace.cardValuesSnapshot || '-'}</div>
              </>
            )}
            {debugDiagnosticsRows.map(row => (
              <div key={row} style={{ marginTop: 2, opacity: 0.92, fontWeight: 500 }}>Diag: {row}</div>
            ))}
          </div>
        )}
        {allPhotos.length > 1 && (
          <ModernPhotoStrip onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
            {allPhotos.map((item, index) => (
              <ModernPhotoThumb
                key={`${user.userId}-thumb-${index}`}
                type="button"
                $active={item === activeHeroPhoto}
                style={{ backgroundImage: `url(${item})` }}
                aria-label={uiText('Фото {index} з {total}', language, { index: index + 1, total: allPhotos.length })}
                aria-pressed={item === activeHeroPhoto}
                onClick={event => { event.stopPropagation(); setActiveHeroPhoto(item); }}
              />
            ))}
          </ModernPhotoStrip>
        )}
        {shouldShowHeroContent && (
          <ModernHeroContent>
            {title && <ModernHeroTitle>{title}</ModernHeroTitle>}
            {locationInfo && <ModernHeroLocation><FaMapMarkerAlt aria-hidden="true" />{locationInfo}</ModernHeroLocation>}
            {heroFields.length > 0 && (
              <ModernHeroFacts>
                {heroFields.map(item => {
                  const fact = formatHeroFact(item, language);
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
          <ProfileBio text={bio} language={language} />
          {bodyHeroFields.length > 0 && (
            <ModernSection>
              <ModernSectionTitle>{profileUiText('keyDetails', language)}</ModernSectionTitle>
              <ProfileChips fields={bodyHeroFields} role={resolvedRole} />
            </ModernSection>
          )}
          {sections.filter(section => section.variant !== 'contacts').map(section => (
            <ModernSection key={section.title}>
              <ModernSectionTitle>{section.title}</ModernSectionTitle>
              {section.variant === 'chips' ? (
                <ProfileChips fields={section.fields} role={resolvedRole} />
              ) : (
                <ProfileFieldRows fields={section.fields} />
              )}
            </ModernSection>
          ))}
          {sections.filter(section => section.variant === 'contacts').map(section => (
            <ModernSection key={section.title}>
              <ModernContactDetails onToggle={handleContactsToggle} onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                <ModernContactSummary>
                  {profileUiText('showContacts', language)}
                  <ModernContactHints aria-hidden="true">
                    {contactHintIcons.map(({ key, Icon }) => <Icon key={key} />)}
                  </ModernContactHints>
                  <span className="contacts-chevron" aria-hidden="true">
                    <FaChevronDown size={16} />
                  </span>
                </ModernContactSummary>
                <ProfileContactLinks user={user} role={resolvedRole} language={language} />
              </ModernContactDetails>
            </ModernSection>
          ))}
          {/* Приватна нотатка й публічний запис — одна секція, дві доріжки.
              Це два записи про одну людину, зроблені в одному місці; двома
              повноцінними блоками вони важили стільки ж, скільки дані анкети,
              і читались як два різні застосунки — у кожного свій розмір
              шрифту й свій плейсхолдер. Хто бачить запис, каже смужка ліворуч
              і підпис над текстом, а не окрема рамка. */}
          <ModernSection onClick={e => e.stopPropagation()}>
            {/* Спільної шапки «Нотатки» більше немає: підпис над кожною
                доріжкою вже каже і що це, і хто це побачить, а третій
                заголовок над ними лише повторював слово. */}
            {/* Публічне — зверху, власне — під ним.
                Порядок був зворотний, і читач писав свою нотатку, ще не
                побачивши, що про цю людину вже написали інші: відповідь стояла
                під полем для питання. Той самий порядок тепер і в рядку стрічки
                (`RowNotes` у `ProfileRow`) — два екрани не можуть казати різне
                про ті самі два записи. */}
            <NoteLanes>
              {publicCommentSlot && (
                <NoteLane $public>
                  <NoteLaneHead>
                    <b>{profileUiText('publicComment', language)}</b>
                    <NoteLaneHint>{profileUiText('publicCommentHint', language)}</NoteLaneHint>
                  </NoteLaneHead>
                  {publicCommentSlot}
                </NoteLane>
              )}
              <NoteLane>
                <NoteLaneHead>
                  <b>{profileUiText('personalNote', language)}</b>
                  <NoteLaneHint>{profileUiText('personalNoteHint', language)}</NoteLaneHint>
                </NoteLaneHead>
                <CommentBox>
                  <ResizableCommentInput
                    plain
                    field={NoteField}
                    placeholder={profileUiText('personalNotePlaceholder', language)}
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
              </NoteLane>
            </NoteLanes>
          </ModernSection>
        </ModernProfileBody>
        </ModernProfileScroll>
        {/* Реакції на урізану проєкцію не вішаються: разом із реакцією
            картка лягла б у спільний кеш анкет, а проєкція — не анкета, і
            саме тому пошук з урізаною видачею кеш узагалі не чіпає. Плитка
            галереї й рядок списку ховають ці кнопки з тієї ж причини. */}
        {!user?.__limitedProfile && (
        <ModernActionRail>
          {/* Олівець, а не плюс: жест той самий, що й у рядку стрічки, —
              «правити цю анкету», — а плюс обіцяв щось додати до списку. Два
              екрани не можуть малювати одну дію двома різними значками. */}
          {/* Олівець один на обидві ролі — рівно як у рядку стрічки
              (`editAction` у `ProfileRow`): читач із правом заводити картки
              ним дописує анкету (`onEnrich`), адмін відкриває її на
              редагування (`onAdminEdit`). Адмінові його тут не було зовсім:
              жест, який у списку працював, у відкритій картці не робив
              нічого, а єдиним входом у редагування лишався дрібний напис
              «ID: 12345» під нотаткою. */}
          {editProfileAction && (
            <ActionButton
              type="button"
              onClick={event => { event.stopPropagation(); editProfileAction.onClick(); }}
              aria-label={editProfileAction.title}
              title={editProfileAction.title}
            >
              <FaPencilAlt />
            </ActionButton>
          )}
          {/* Позначка «на цю картку вже відповіли» ставиться **до** самої
              реакції, а не з її зворотного виклику: `onRemove` спрацьовує вже
              після того, як зміна списку вподобаних перемалювала сторінку, і
              картку встигало вичистити прибирання в `users` — тобто позначка
              приходила рівно на один рендер пізніше, ніж треба. Рядок стрічки
              робить так само: спершу памʼять, потім запис. */}
          <span ref={dislikeButtonWrapRef} onClickCapture={() => onReacted?.(user.userId)}>
            <BtnDislike userId={user.userId} userData={canonicalUserData} dislikeUsers={dislikeUsers} setDislikeUsers={setDislikeUsers} ownDislikeUsers={ownDislikeUsers} setOwnDislikeUsers={setOwnDislikeUsers} favoriteUsers={favoriteUsers} setFavoriteUsers={setFavoriteUsers} ownFavoriteUsers={ownFavoriteUsers} setOwnFavoriteUsers={setOwnFavoriteUsers} onRemove={onReacted} multiDataOwnerId={multiDataOwnerId} customStyle={MATCHING_DISLIKE_IDLE_STYLE} icon={FaTimes} inactiveIconColor="var(--matching-muted-text)" />
          </span>
          <span ref={favoriteButtonWrapRef} onClickCapture={() => onReacted?.(user.userId)}>
            <BtnFavorite userId={user.userId} userData={canonicalUserData} favoriteUsers={favoriteUsers} setFavoriteUsers={setFavoriteUsers} ownFavoriteUsers={ownFavoriteUsers} setOwnFavoriteUsers={setOwnFavoriteUsers} dislikeUsers={dislikeUsers} setDislikeUsers={setDislikeUsers} ownDislikeUsers={ownDislikeUsers} setOwnDislikeUsers={setOwnDislikeUsers} onRemove={onReacted} multiDataOwnerId={multiDataOwnerId} customStyle={MATCHING_REACTION_IDLE_STYLE} />
          </span>
        </ModernActionRail>
        )}
      </ModernProfileShell>
      </AnimatedCard>
      {viewerIndex !== null && allPhotos.length > 0 && (
        <PhotoViewer photos={allPhotos} index={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </>
  );
};

// Перший екран стрічки — та сама перша порція, що й у пошуку: десять рядків, а
// не дві. Далі йде притишений крок (`MATCHING_THROTTLED_LOAD_BATCH`).
const INITIAL_LOAD = MATCHING_FIRST_PAGE_BATCH;
const MATCHING_VISIBLE_BUFFER = 2;
const MATCHING_REFILL_LIMIT = 5;
const MATCHING_MAX_PAGES_PER_LOAD = 3;
const LOAD_MORE = 5;
// Стеля на одну пачку гідратації фото. Стрічка росте по 5 карток, тож стелю
// вона впирає тільки після довгого скролу — сенс числа в тому, щоб обмежити
// сплеск, а не в тому, щоб різати те, що читач уже прогорнув.
const FEED_PHOTO_HYDRATION_LIMIT = 24;
// A stable identity so a row without public comments doesn't re-render on it.
const EMPTY_PUBLIC_COMMENTS = [];
const EMPTY_USERS = [];
// Скільки чіпів фільтрів ряд показує згорнутим. Решта — за «+N», яке розгортає
// ряд на місці; ряд не скролиться вбік, він переноситься.
const MAX_FILTER_CHIPS = 3;
// Spec §2: the screen switches state a beat after typing stops, not on Enter.
const MATCHING_SEARCH_DEBOUNCE_MS = 250;
const MATCHING_QUERY_PARAM = MATCHING_SEARCH_QUERY_PARAM;
const readQueryFromUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get(MATCHING_QUERY_PARAM) || '';
  } catch {
    return '';
  }
};
// Скільки живе підсумок порції в кінці списку. Достатньо, щоб його прочитали,
// і замало, щоб він перетворився на постійний напис.
const MATCHING_BATCH_SUMMARY_VISIBLE_MS = 6000;

// «1 картка», «2 картки», «5 карток» — рядок читає людина, і число в ньому
// однозначне, тож форма слова має з ним збігатись.
const pluralizeCards = (count, language) => {
  const total = Math.abs(Number(count) || 0);
  // Англійській вистачає двох форм, українській — трьох, тож рахує їх кожна
  // мова сама, а не спільна таблиця з «картка(и)» в дужках.
  if (resolveProfileLanguage(language) === 'en') return total === 1 ? 'card' : 'cards';
  const tail = total % 100;
  if (tail >= 11 && tail <= 14) return 'карток';
  const last = tail % 10;
  if (last === 1) return 'картка';
  if (last >= 2 && last <= 4) return 'картки';
  return 'карток';
};

const MATCHING_INDEXED_LOAD_MORE_MAX_PAGES = 2;
const MATCHING_AUTO_LOAD_MORE_COOLDOWN_MS = 700;
const MATCHING_MAX_EMPTY_AUTO_LOAD_MORE_ATTEMPTS = 2;
const SCROLL_Y_KEY = 'matchingScrollY';
// Картка, на якій читач зупинився: якір відновлення позиції. Живе стільки ж,
// скільки й сам піксель, — рівно один перехід.
const SCROLL_ANCHOR_KEY = 'matchingScrollAnchorId';
// Скільки кадрів відновлення чекає на свій рядок. Стрічка повертається з кеша
// не в один рендер, і якір з'являється в DOM пізніше за перші картки; але
// чекати без кінця теж не можна — анкети могло вже й не бути в деці.
const SCROLL_ANCHOR_MAX_ATTEMPTS = 40;
// Скільки список чекає на відновлення позиції, перш ніж проявитись там, де він
// є. Трохи більше за стелю спроб вище: та рахує кадри, ця — час, і збігтись
// вони не мусять.
const SCROLL_RESTORE_REVEAL_MS = 1000;
// Скільки кадрів поспіль список має лишатись незмінним, щоб вважати його
// зібраним. Порція з однієї картки приїжджає першою, і без цього очікування
// відновлення завершувалось саме на ній.
const SCROLL_ANCHOR_STABLE_FRAMES = 8;

// Рядок картки за її id. `CSS.escape` є не скрізь (старі webview, частина
// тестових середовищ), а id картки — це або UID Firebase, або `TG0001`, тобто
// літери, цифри й дефіс: там екранувати нема чого, і запасний варіант нічого
// не втрачає.
const findCardNodeById = cardId => {
  if (!cardId || typeof document === 'undefined') return null;
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(cardId)
    : String(cardId).replace(/["\\]/g, '\\$&');
  try {
    return document.querySelector(`[data-card-id="${escaped}"]`);
  } catch {
    return null;
  }
};
const SEARCH_KEY = MATCHING_SEARCH_STORAGE_KEY;

// Spec §4: the list/gallery choice is a persistent per-device preference, kept
// under its own namespaced key so it survives a reload and never collides with
// `viewMode` (which selects the *collection* - all / favourites / hidden).
const MATCHING_VIEW_LAYOUT_KEY = 'km.matching.view';
// Дві розкладки одного й того самого списку: картка на всю ширину і дві
// колонки. Третьої — «одна картка на екран» — більше немає: вона показувала
// велике фото й під ним три факти з парою кнопок, тобто коштувала цілий екран
// за менше, ніж каже рядок списку. Велике фото переїхало в сам рядок: тепер
// його показує та розкладка, яка поруч із ним ще й розповідає про людину.
const MATCHING_VIEW_LAYOUTS = ['list', 'gallery'];
const MATCHING_DEFAULT_VIEW_LAYOUT = 'list';
export const MATCHING_VIEW_LAYOUT_LABELS = {
  list: 'Режим списку',
  gallery: 'Режим галереї',
};
/** Наступна розкладка по колу — один жест перебирає обидві. */
export const nextMatchingViewLayout = current => {
  const index = MATCHING_VIEW_LAYOUTS.indexOf(current);
  return MATCHING_VIEW_LAYOUTS[(index + 1) % MATCHING_VIEW_LAYOUTS.length];
};
const getStoredMatchingViewLayout = () => {
  try {
    const stored = localStorage.getItem(MATCHING_VIEW_LAYOUT_KEY);
    return MATCHING_VIEW_LAYOUTS.includes(stored) ? stored : MATCHING_DEFAULT_VIEW_LAYOUT;
  } catch {
    return MATCHING_DEFAULT_VIEW_LAYOUT;
  }
};

// Проєкція `matchingCards` — це те, що показує рядок стрічки, а не картка.
// Кеш карток обслуговує ще й екран редагування, тож класти туди проєкцію не
// можна: вона виглядала б там як анкета, з якої зникла половина полів.
const shouldCacheMatchingCard = user => Boolean(user) && !user.__fromCardCache && !isMatchingSummaryCard(user);

/**
 * Курсор наступної сторінки, відновлений з останньої картки на екрані.
 *
 * Пагінація джерела курсорна: пара (`lastLogin2`, `userId`) — це те місце, з
 * якого читати далі. Коли перший екран прийшов з кеша, ця пара лежить прямо в
 * останній кешованій картці, тож питати її в бекенду немає за чим.
 *
 * Картка без `lastLogin2` курсором бути не може: за нею сторінка почалась би з
 * початку і повернула те саме. Тоді краще чесно піти в джерело.
 */
export const buildMatchingCursorFromCard = card => {
  const date = String(card?.[MATCHING_CARD_ORDER_FIELD] || '').trim();
  const userId = String(card?.userId || '').trim();
  if (!date || !userId) return null;
  return { date, userId };
};

const countChangedMatchingFilterGroups = (currentFilters, defaultFilters) => {
  if (!currentFilters || !defaultFilters) return 0;

  return Object.keys(defaultFilters).reduce((count, groupName) => {
    const defaultGroup = defaultFilters[groupName] || {};
    const currentGroup = currentFilters[groupName] || {};
    const changed = Object.keys(defaultGroup).some(optionName =>
      Boolean(currentGroup[optionName]) !== Boolean(defaultGroup[optionName])
    );
    return changed ? count + 1 : count;
  }, 0);
};

// Плитка галереї — це картка, а не рамка під фото.
//
// Рамка 4/5 стояла тут завжди, і анкета без фото діставала пів екрана під дві
// літери власного ж імені, яке лежить рядком нижче. Тепер фото малюється лише
// тоді, коли воно є, а плитка без нього просто нижча — різна висота колонок
// дешевша за порожнечу. Пропорція залежить від ролі: донорці зовнішність — це
// дані, тож портретні 4/5 лишаються їй, решті вистачає 4/3.
//
// Локація й дії переїхали з фото в тіло картки: поверх знімка вони жили тільки
// тому, що іншого місця не було.
const GalleryCard = React.memo(({
  user,
  isAdmin,
  isFavorite,
  isHidden,
  onOpen,
  onToggleFavorite,
  onToggleHidden,
  onTogglePublish,
  onEnrich,
  clientComment,
  onCommentSave,
  reviewsSlot,
  reviewsAction,
  diagnosticsSlot,
}) => {
  const { language } = useAppSettings();
  // Той самий жест, що й у рядку списку: значок просить прочитати чужі відгуки,
  // а поле для власного стоїть у доріжці без нього.
  const [reviewsRequested, setReviewsRequested] = useState(false);
  const name = getProfileName(user);
  const age = getProfileAge(user);
  const photos = getProfilePhotos(user);
  const photo = photos[0];
  const role = getProfileRole(user);
  const roleCode = getRoleCode(role);
  const location = getProfileLocation(user);
  const facts = useMemo(() => renderProfileFacts(user, [], language), [language, user]);
  const [bodyFacts, reproFacts] = useMemo(() => splitProfileFactsByGroup(facts), [facts]);
  const isLimited = Boolean(user?.__limitedProfile);
  const isPublished = isMatchingCardPublished(user);

  return (
    <GalleryTile
      $muted={isHidden}
      $role={role}
      // Той самий якір, що й у рядку списку: розкладка не має впливати на те,
      // куди читач повернеться.
      data-card-id={user?.userId}
      onClick={() => onOpen(user)}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(user);
      }}
    >
      {isAdmin && onTogglePublish && (
        <GalleryPublishDot
          type="button"
          $published={isPublished}
          title={uiText(isPublished ? 'Прибрати зі стрічки' : 'Показати у стрічці', language)}
          aria-label={uiText(isPublished ? 'Прибрати зі стрічки' : 'Показати у стрічці', language)}
          aria-pressed={isPublished}
          onClick={event => { event.stopPropagation(); onTogglePublish(user); }}
        />
      )}
      {photo && (
        <GalleryPhotoBox>
          <img src={photo} alt="" loading="lazy" decoding="async" />
          {isHidden && <GalleryHiddenBadge>{uiText('Приховано', language)}</GalleryHiddenBadge>}
          {photos.length > 1 && <GalleryPhotoCount>{photos.length}</GalleryPhotoCount>}
        </GalleryPhotoBox>
      )}
      <GalleryBody>
        <GalleryName>
          {name}
          {age && <>, {age}</>}
        </GalleryName>
        {(roleCode || location) && (
          <GalleryNameRow>
            {roleCode && <GalleryRoleTag $role={role}>{roleCode}</GalleryRoleTag>}
            {location && (
              <GalleryLocation>
                <FaMapMarkerAlt aria-hidden="true" />
                <span>{location}</span>
              </GalleryLocation>
            )}
          </GalleryNameRow>
        )}
        {bodyFacts.length > 0 && (
          <GalleryFacts>
            {bodyFacts.map((node, idx) => (
              <React.Fragment key={node.key}>
                {idx > 0 && ' '}
                {node}
              </React.Fragment>
            ))}
          </GalleryFacts>
        )}
        {reproFacts.length > 0 && (
          <GalleryFacts $soft>
            {reproFacts.map((node, idx) => (
              <React.Fragment key={node.key}>
                {idx > 0 && ' '}
                {node}
              </React.Fragment>
            ))}
          </GalleryFacts>
        )}
        {!isLimited && (
          <GalleryActions>
            {onEnrich && (
              <GalleryActionButton type="button" aria-label={enrichGateLabel(language)} title={enrichGateLabel(language)} onClick={event => { event.stopPropagation(); onEnrich(user); }}>
                <FaPencilAlt />
              </GalleryActionButton>
            )}
            <GalleryActionButton
              type="button"
              $on={isFavorite}
              aria-label={uiText('В обране', language)}
              aria-pressed={isFavorite}
              title={uiText('В обране', language)}
              onClick={event => { event.stopPropagation(); onToggleFavorite(user); }}
            >
              {isFavorite ? <FaHeart /> : <FaRegHeart />}
            </GalleryActionButton>
            <GalleryActionButton
              type="button"
              $on={isHidden}
              aria-label={uiText(isHidden ? 'Повернути зі схованих' : 'Приховати', language)}
              aria-pressed={isHidden}
              title={uiText(isHidden ? 'Повернути зі схованих' : 'Приховати', language)}
              onClick={event => { event.stopPropagation(); onToggleHidden(user); }}
            >
              {isHidden ? <FaUndoAlt /> : <FaTimes />}
            </GalleryActionButton>
            {reviewsAction && (
              <GalleryActionButton
                type="button"
                $on={reviewsRequested}
                disabled={Boolean(reviewsAction.loading)}
                aria-label={reviewsGateLabel(language)}
                title={reviewsGateLabel(language)}
                onClick={event => {
                  event.stopPropagation();
                  setReviewsRequested(true);
                  reviewsAction.onRequest(user.userId);
                }}
              >
                <FaRegCommentDots />
                {reviewsAction.count > 0 && <b>{reviewsAction.count}</b>}
              </GalleryActionButton>
            )}
          </GalleryActions>
        )}
        {/* Ті самі дві доріжки, що й у рядку списку: розкладка міняє те, як
            картку показують, а не те, що про людину вже записали. Поки плитка
            їх не мала, читач у галереї не бачив власної нотатки — і дописував
            поверх запису, якого не видно. */}
        {!isLimited && onCommentSave && (
          <ProfileNotes
            language={language}
            publicSlot={reviewsSlot}
            reviewsStatus={describeReviewsState({
              requested: reviewsRequested,
              loading: Boolean(reviewsAction?.loading),
              loaded: Boolean(reviewsAction?.loaded),
              count: reviewsAction?.count || 0,
            }, language)}
            privateSlot={(
              <CommentBlock
                text={clientComment}
                placeholder={profileUiText('personalNotePlaceholder', language)}
                onSave={value => onCommentSave(user, value)}
              />
            )}
          />
        )}
        {diagnosticsSlot}
      </GalleryBody>
    </GalleryTile>
  );
}, (prev, next) => (
  prev.user === next.user
  && prev.isFavorite === next.isFavorite
  && prev.isHidden === next.isHidden
  && prev.isAdmin === next.isAdmin
  && prev.clientComment === next.clientComment
  && prev.reviewsSlot === next.reviewsSlot
  && prev.reviewsAction?.count === next.reviewsAction?.count
  && prev.reviewsAction?.loading === next.reviewsAction?.loading
  && prev.reviewsAction?.loaded === next.reviewsAction?.loaded
  && prev.diagnosticsSlot === next.diagnosticsSlot
  && prev.onEnrich === next.onEnrich
  && prev.onToggleHidden === next.onToggleHidden
  && prev.onTogglePublish === next.onTogglePublish
));

const Matching = () => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [users, setUsers] = useState([]);
  const usersRef = useRef(users);
  // Public source readiness is deliberately separate from the rendered deck:
  // own drafts and access-scoped cards must never satisfy the first ten-card
  // matchingCards window.
  const [initialPublicWindowComplete, setInitialPublicWindowComplete] = useState(false);
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
  const [reactionPipelineReadyByType, setReactionPipelineReadyByType] = useState({
    favorites: false,
    dislikes: false,
  });
  const favoriteUsersRef = useRef(favoriteUsers);
  const dislikeUsersRef = useRef(dislikeUsers);
  const ownFavoriteUsersRef = useRef(ownFavoriteUsers);
  const ownDislikeUsersRef = useRef(ownDislikeUsers);
  const [viewMode, setViewMode] = useState('default');
  const [viewLayout, setViewLayout] = useState(getStoredMatchingViewLayout);
  const toggleViewLayout = React.useCallback(() => {
    setViewLayout(current => {
      const next = nextMatchingViewLayout(current);
      try {
        localStorage.setItem(MATCHING_VIEW_LAYOUT_KEY, next);
      } catch {
        // a blocked localStorage only costs the persistence, not the switch
      }
      return next;
    });
  }, []);
  // Spec §1-§2: the search input is what switches the screen between the feed and
  // results, and the query lives in the URL so a reload keeps the context.
  const [searchQuery, setSearchQuery] = useState(readQueryFromUrl);
  const [searchTab, setSearchTab] = useState('results');
  // Дофільтр: один ключ, одне значення. У пошуку значення живе тут; у стрічці
  // воно виводиться з `filters` — інакше рядок і шухляда розійшлися б, щойно
  // читач відкриє другу.
  const [refineKey, setRefineKey] = useState(DEFAULT_REFINE_KEY);
  const [searchRefineValue, setSearchRefineValue] = useState(null);
  // Уточнення переживає наступний запит, і саме це робить його умовою, а не
  // ситом. Питання читача не «серед знайденого — котра», а «мене цікавлять
  // 26–30, Rh−»: сказане один раз, воно має діяти на кожен наступний запит, бо
  // інакше на кожній новій видачі його довелось би ставити наново — і встигнути
  // це зробити раніше, ніж відлік почне видавати картки по дві.
  //
  // Ціна помилки тут відома: уточнення може сховати саме того, кого шукали. Тож
  // воно не має права бути мовчазним — чіп із числом і хрестиком стоїть над
  // сіткою завжди, поки значення увімкнене, а порожня видача називає його
  // причиною (`resolveEmptyFeedMessage`).
  const refineStateRef = useRef({ key: DEFAULT_REFINE_KEY, value: null });
  useEffect(() => {
    refineStateRef.current = { key: refineKey, value: searchRefineValue };
  }, [refineKey, searchRefineValue]);
  const [filterGroupSelect, setFilterGroupSelect] = useState({ token: 0, name: '', value: '' });
  // Скільки знайдених уже на екрані. Видача більше не приїжджає одним шматком:
  // її показує той самий притишений відлік, що й стрічку.
  const [searchRevealCount, setSearchRevealCount] = useState(MATCHING_FIRST_PAGE_BATCH);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const current = url.searchParams.get(MATCHING_QUERY_PARAM) || '';
      const next = searchQuery.trim();
      if (current === next) return;
      if (next) url.searchParams.set(MATCHING_QUERY_PARAM, next);
      else url.searchParams.delete(MATCHING_QUERY_PARAM);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      // A blocked history API only costs the reload-safe context.
    }
  }, [searchQuery]);
  const [matchingSearchStatus, setMatchingSearchStatus] = useState('');
  const matchingSearchKeyRef = useRef(null);
  const [activeProfileIndex, setActiveProfileIndex] = useState(0);
  // Spec §1: the screen has one content area with three states. `detailIndex`
  // is the third - a layer over the feed rather than a route - and it points
  // into the very same `filtered` array the list and gallery render from, so
  // paging through it never issues a request.
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedRowIds, setExpandedRowIds] = useState(() => new Set());
  const feedScrollTopRef = useRef(0);
  const rowContactViewKeysRef = useRef(new Set());
  // Spec §8: public records about a profile, readable by everyone signed in.
  // Kept apart from `comments`, which holds this viewer's own private note.
  const [publicComments, setPublicComments] = useState({});
  const [publicCommentsLoading, setPublicCommentsLoading] = useState({});
  const publicCommentsRequestedRef = useRef(new Set());
  const [viewerName, setViewerName] = useState('');
  // Spec §9: admin-only data diagnostics. Both the flag and the module it pulls
  // in stay out of an ordinary user's way - the chunk is only fetched once the
  // flag is on, so the checks never reach a non-admin bundle.
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
  const [diagnosticsModule, setDiagnosticsModule] = useState(null);
  const [matchingDebugLogMode, setMatchingDebugLogMode] = useState(getStoredMatchingDebugLogMode);
  const [debugShowAllIndexedCards, setDebugShowAllIndexedCards] = useState(getStoredDebugShowAllIndexedCards);
  const [matchingDataSourceMode] = useState(getStoredMatchingDataSourceMode);
  // Тема тепер глобальна: перемикається в меню трьох крапок (ProfileDotsMenu).
  // Звідти ж береться й мова: нею говорять і підписи екрана, і його тости.
  const { language, themeMode } = useAppSettings();
  const viewModeRef = useRef(viewMode);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [initialLoadTrace, setInitialLoadTrace] = useState([]);
  const [initialRequestId, setInitialRequestId] = useState(0);
  const [filters, setFilters] = useState({});
  const filtersRef = useRef(filters);
  // Колекція у вебі одна, тож і дека одна: вибору джерела більше немає.
  const defaultListKey = 'default';
  const [filterResetToken, setFilterResetToken] = useState(0);
  const [draftFilters, setDraftFilters] = useState({});
  const draftFiltersRef = useRef(draftFilters);
  draftFiltersRef.current = draftFilters;
  const [filterGroupReset, setFilterGroupReset] = useState({ token: 0, name: '' });
  const [comments, setComments] = useState({});
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const dispatchedCommentSaveRef = useRef(null);
  const [sharedComments, setSharedComments] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const showFiltersRef = useRef(showFilters);
  showFiltersRef.current = showFilters;
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [ownerId, setOwnerId] = useState(null);
  const [personalCreateProfiles, setPersonalCreateProfiles] = useState([]);
  useEffect(() => {
    const syncCopiedComment = event => {
      if (event.detail?.ownerId !== ownerId || !event.detail?.cardId) return;
      const eventText = String(event.detail.text || '');
      const dispatchedSave = dispatchedCommentSaveRef.current;
      if (
        dispatchedSave?.cardId === event.detail.cardId
        && dispatchedSave.text === eventText
        && commentsRef.current[event.detail.cardId] !== eventText
      ) return;
      setComments(previous => ({
        ...previous,
        [event.detail.cardId]: eventText,
      }));
    };
    window.addEventListener(COMMENTS_UPDATED_EVENT, syncCopiedComment);
    return () => window.removeEventListener(COMMENTS_UPDATED_EVENT, syncCopiedComment);
  }, [ownerId]);
  const [downloadSizeToastsEnabled, setDownloadSizeToastsEnabled] = useState(() => getBackendDownloadToastsEnabled());
  const [multiDataOwnerIds, setMultiDataOwnerIds] = useState([]);
  const [currentAccessLevel, setCurrentAccessLevel] = useState(() => localStorage.getItem('accessLevel') || '');
  const [currentUserRole, setCurrentUserRole] = useState(() => localStorage.getItem('userRole') || '');
  // A cached role is useful for rendering, but it cannot start a deck: the
  // authenticated profile also owns the shared reaction scope that must be
  // snapshotted by the initial request.
  const [currentUserRoleResolved, setCurrentUserRoleResolved] = useState(false);
  // Роль читача потрібна не лише деці, а й дочитуванню сторінок: інакше запас
  // рахувався б по картках, які до екрана не доходять (`fetchChunk`).
  const currentUserRoleRef = useRef(currentUserRole);
  currentUserRoleRef.current = currentUserRole;
  const [currentCanCreateProfiles, setCurrentCanCreateProfiles] = useState(() => localStorage.getItem('canCreateProfiles') === 'true');
  const [currentAdditionalAccessRules, setCurrentAdditionalAccessRules] = useState(
    () => localStorage.getItem('additionalAccessRules') || ''
  );
  const [currentSearchKeySetKeys, setCurrentSearchKeySetKeys] = useState(() =>
    normalizeSearchKeySetKeys(localStorage.getItem('additionalSearchKeySetKeys') || '')
  );
  const [additionalAccessUsers, setAdditionalAccessUsers] = useState([]);
  const additionalAccessUsersRef = useRef(additionalAccessUsers);
  const [additionalNextOffset, setAdditionalNextOffset] = useState(0);
  const additionalNextOffsetRef = useRef(0);
  const [additionalHasMore, setAdditionalHasMore] = useState(false);
  const additionalHasMoreRef = useRef(false);
  const [photoCacheByUserId, setPhotoCacheByUserId] = useState({});
  // Власні доповнення до карток: `{ [cardId]: fields }`. Питаються лише про
  // показані картки й лише раз на таб — памʼять запитаних id нижче стереже,
  // щоб перемальовування не коштувало другого круга.
  const [ownOverlayFieldsByCardId, setOwnOverlayFieldsByCardId] = useState({});
  const requestedOwnOverlayIdsRef = useRef(new Set());
  // Які картки цей читач узагалі доповнював (`multiData/editsByEditor` плюс
  // памʼять браузера). Один запит на таб — і стрічка знає, у котрих зі своїх
  // сотень рядків є що накладати, не читаючи вузол на кожен.
  const [ownOverlayCardIds, setOwnOverlayCardIds] = useState(null);
  // На відміну від переліку вище, тут лише підтверджені Firebase id. Локальна
  // позначка могла лишитися після відхиленого правилами запису й не повинна
  // забороняти повторну best-effort міграцію оберненого індексу.
  const [remoteOwnOverlayCardIds, setRemoteOwnOverlayCardIds] = useState(null);
  const [ownOverlayStateOwnerId, setOwnOverlayStateOwnerId] = useState(ownerId);
  const ownOverlayOwnerIdRef = useRef(ownerId);
  ownOverlayOwnerIdRef.current = ownerId;
  // Позначка ставиться в тілі ефекту, а не лише знімається в прибиранні: у
  // StrictMode React монтує сторінку двічі, і прибирання першого монтування
  // залишало позначку знятою назавжди — відповідь про доповнення приходила вже
  // «розмонтованій» сторінці й мовчки викидалась.
  const ownOverlaysMountedRef = useRef(true);
  // Читання власного доповнення «на дотик» живе в рефі, щоб `ensureFullProfile`
  // лишався без залежностей: його ідентичність тримає половину обробників
  // сторінки, і перестворювати їх щоразу, коли приїхав черговий оверлей,
  // означало б перемальовувати всю стрічку.
  const ensureOwnOverlayRef = useRef(() => {});
  // Про які картки вже питали саме цим шляхом. Окремо від
  // `requestedOwnOverlayIdsRef`: та памʼять належить стрічці й лишається
  // поставленою й після порожньої відповіді, а дотик мусить мати право
  // спитати про картку, якої перелік не називав.
  const touchedOwnOverlayIdsRef = useRef(new Set());
  useEffect(() => {
    ownOverlaysMountedRef.current = true;
    return () => { ownOverlaysMountedRef.current = false; };
  }, []);
  // Сеанс Firebase може змінитися в іншій вкладці без перемонтування маршруту.
  // Не переносимо ані приватні поля, ані пам'ять уже прочитаних карток між uid.
  // Окремий owner стан також не дає старим полям потрапити навіть у перший
  // render нового власника, до синхронного прибирання layout-effect.
  useLayoutEffect(() => {
    setOwnOverlayStateOwnerId(ownerId);
    setOwnOverlayFieldsByCardId({});
    setOwnOverlayCardIds(null);
    setRemoteOwnOverlayCardIds(null);
    requestedOwnOverlayIdsRef.current = new Set();
    touchedOwnOverlayIdsRef.current = new Set();
  }, [ownerId]);
  const [roleIndexSets] = useState(null);
  const access = resolveAccess({
    uid: auth.currentUser?.uid,
    accessLevel: currentAccessLevel,
    userRole: currentUserRole,
    canCreateProfiles: currentCanCreateProfiles,
  });
  const isAdmin = access.isAdmin;

  // Стрілка «відкрити вузол у Firebase» біля публічних нотаток: та сама службова
  // навігація, що в блоках форми анкети, і той самий тумблер (EXT на
  // `AddNewProfile`). Читається один раз на монтування — `/add` і `/matching` це
  // різні маршрути, тож повернення сюди після перемикання тумблера й так
  // перемонтовує сторінку.
  const [backendLinksEnabled] = useState(readBackendLinksEnabled);
  const publicCommentsBackendHref = React.useCallback(profileId => (
    isAdmin && backendLinksEnabled && profileId
      ? buildRtdbConsoleLink([PUBLIC_COMMENTS_ROOT_PATH, profileId])
      : ''
  ), [backendLinksEnabled, isAdmin]);

  // Не-адмін гортає стрічку з паузою: замість того, щоб підвантажити наступну
  // сторінку одразу, сентинел лише вмикає відлік, і поки той іде — до бекенду не
  // йде жодного запиту. Це і стеля на трафік (дві картки на десять секунд), і
  // видима обіцянка: читач бачить, що картки будуть, і коли саме.
  //
  // Адмінові стрічка — робочий інструмент, і він впирається в її кінець щодня,
  // тож для нього все лишається як було: сентинел вантажить одразу.
  //
  // Оголошено тут, а не поруч зі стрічкою: цей прапорець читають ефекти вище за
  // текстом, і в їхніх списках залежностей він має бути вже ініціалізований.
  const isThrottledFeedPaging = !access.isAdmin;

  // Повідомлення про джерело стрічки адресоване тому, хто може перебудувати
  // індекс або хоча б повідомити про проблему, а не кожному читачеві.
  const canSeeFeedSourceNotice = access.isAdmin
    || String(auth.currentUser?.uid || '').trim() === BACKEND_TRAFFIC_TRACKING_TEST_UID;

  useEffect(() => {
    let active = true;
    if (!ownerId || isAdmin) {
      setPersonalCreateProfiles([]);
      return () => { active = false; };
    }
    loadOwnProfileMutations(ownerId)
      .then(items => {
        if (!active) return;
        const pendingProfiles = items.map(mutation => ({
          ...getEffectiveProfile({ mutation }),
          publish: true,
          __matchingAccessAllowed: true,
          __profileMutationOperation: 'create',
          __profileMutationStatus: mutation.status,
        }));
        setPersonalCreateProfiles(pendingProfiles);
      })
      .catch(error => console.error('Failed to load personal create profiles', error));
    return () => { active = false; };
  }, [isAdmin, ownerId]);
  // A public comment is signed with the author's own name, so the viewer's name
  // is resolved once here rather than at write time.
  useEffect(() => {
    if (!ownerId) {
      setViewerName('');
      return () => {};
    }
    let active = true;
    fetchUserById(ownerId)
      .then(profile => {
        if (!active) return;
        setViewerName(getProfileName(profile) || auth.currentUser?.displayName || '');
      })
      .catch(() => {
        if (active) setViewerName(auth.currentUser?.displayName || '');
      });
    return () => { active = false; };
  }, [ownerId]);

  const matchingDefaultFilters = useMemo(
    () => getDefaultFilters({ mode: 'matching', nonAdminAllActive: !access.isAdmin }),
    [access.isAdmin],
  );
  // The same condition the security rules use for reading `users`. A viewer
  // without it can still search; what comes back is the limited projection
  // (surname, name, age, region, city, public comment), because those are the only
  // child paths the rules let them read.
  const hasFullProfileAccess = access.isAdmin || access.canAccessMatching;

  const activeFilterGroupCount = useMemo(
    () => countChangedMatchingFilterGroups(filters, matchingDefaultFilters),
    [filters, matchingDefaultFilters],
  );
  const filterDrawerSubtitle = activeFilterGroupCount > 0
    ? uiText('Активно змінено груп: {count}', language, { count: activeFilterGroupCount })
    : uiText('Всі профілі показані за поточними правилами доступу', language);
  const isIndexedDebugTestUser = String(auth.currentUser?.uid || ownerId || '').trim() === MATCHING_LOG_MODE_TEST_USER_ID;
  const parsedAdditionalAccessRules = useMemo(
    () => parseAdditionalAccessRuleGroups(currentAdditionalAccessRules),
    [currentAdditionalAccessRules]
  );
  const loadingRef = useRef(false);
  const initialLoadInFlightRef = useRef(false);
  const additionalAccessLoadInFlightRef = useRef(false);
  const deferredInitialLoadErrorRef = useRef(null);
  const hasMoreRef = useRef(hasMore);
  const loadingStateRef = useRef(loading);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // Курсор видачі живе в рефі теж: `triggerEndOfDeckLoad` читає його з
  // обробника відліку, і перестворювати обробник на кожній зміні довжини
  // означало б перезапускати сам відлік.
  const searchRevealTargetRef = useRef(0);
  const [searchHasMore, setSearchHasMore] = useState(false);

  // Видача гортається так само, як стрічка: `hasMore` для неї хибний навмисно
  // (сторінок у мережі більше немає — усе знайдене вже в руках), тож право
  // показати відлік дає окремий прапорець.
  const deckHasMore = hasMore || (viewMode === 'default' && additionalHasMore) || searchHasMore;

  useEffect(() => {
    loadingStateRef.current = loading;
  }, [loading]);

  const loadedIdsRef = useRef(new Set());
  const reactionLoadedIdsRef = useRef({
    favorites: new Set(),
    dislikes: new Set(),
  });
  const reactionStorageByIdRef = useRef({});
  const reactionClassificationRequestsRef = useRef(new Map());
  const reactionAccessRequestsRef = useRef(new Map());
  const loadInitialVersionRef = useRef(0);
  const pendingDefaultReloadRef = useRef(false);
  const initialRequestIdRef = useRef(0);
  const initialLoadTraceRef = useRef([]);
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
  const autoLoadMoreCooldownRetryTimerRef = useRef(null);
  const originalConsoleMethodsRef = useRef(null);
  const consoleInterceptEnabledRef = useRef(false);
  const matchingLastCardsDebugStatsRef = useRef({
    sourceCardsCount: 0,
    filteredCardsCount: 0,
    emittedCardsCount: 0,
    filteredOutCount: 0,
    visibleReturnedCount: 0,
    excludedCount: 0,
    loadedPages: 0,
    stopReason: '',
    hasMore: false,
    sourceHasMore: false,
    requestedVisible: 0,
    stage: 'none',
    timestamp: '',
  });
  const emptyAutoLoadMoreAttemptsRef = useRef(0);
  const lastCardLoadTriggerSignatureRef = useRef('');
  const lastCardInFlightTriggerSignatureRef = useRef('');
  const matchingProfileStateRef = useRef({
    ownerId: null,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
  });
  const resetAdditionalMatchingState = React.useCallback(({ resetHasMore = true, resetLoading = false } = {}) => {
    setAdditionalAccessUsers([]);
    setAdditionalNextOffset(0);
    additionalHasMoreRef.current = false;
    setAdditionalHasMore(false);
    setLastKey(null);
    loadedIdsRef.current = new Set();
    additionalRulesToastRef.current = '';
    if (resetHasMore) setHasMore(true);
    if (resetLoading) {
      loadingRef.current = false;
      loadingStateRef.current = false;
      setLoading(false);
    }
  }, []);
  const beginInitialRequest = React.useCallback(() => {
    const requestId = initialRequestIdRef.current + 1;
    initialRequestIdRef.current = requestId;
    setInitialRequestId(requestId);
    setLoadError(null);
    initialLoadTraceRef.current = [];
    setInitialLoadTrace([]);
    toast.dismiss('matching-slow-load');
    toast.dismiss(INITIAL_LOAD_ERROR_TOAST_ID);
    loadingRef.current = true;
    loadingStateRef.current = true;
    setLoading(true);
    return requestId;
  }, []);
  // Стрічка читається або проєкціями, або повними анкетами — між ними порядок
  // величини трафіку. Сповзання на анкети мовчазне: воно виглядає просто як
  // «чомусь важко», і без цього повідомлення причину видно лише в консолі, якої
  // на телефоні немає. Кажемо один раз на причину за сесію і лише тим, хто може
  // з цим щось зробити.
  const announcedFeedSourceRef = useRef(new Set());
  const announceFeedSource = React.useCallback(event => {
    if (!canSeeFeedSourceNotice) return;
    const reason = String(event?.reason || '');
    if (event?.feedSource !== 'profiles' || !reason) return;
    const key = reason;
    if (announcedFeedSourceRef.current.has(key)) return;
    announcedFeedSourceRef.current.add(key);
    const detail = [event?.errorCode, event?.errorMessage].map(part => String(part || '').trim()).filter(Boolean).join(': ');
    const suffix = detail ? `\n${detail}` : '';
    toast(`${FEED_SOURCE_FALLBACK_REASONS[reason] || reason} — стрічка читає повні анкети замість matchingCards${suffix}`, {
      icon: '📦',
      id: `matching-feed-source-${key}`,
      duration: 8000,
    });
  }, [canSeeFeedSourceNotice]);

  const recordInitialLoadDiagnostic = React.useCallback(event => {
    const requestId = initialRequestIdRef.current;
    const timestamp = new Date().toISOString();
    const entry = { requestId, timestamp, ...event };
    const next = [...initialLoadTraceRef.current, entry].slice(-30);
    initialLoadTraceRef.current = next;
    setInitialLoadTrace(next);
    writeMatchingDebugLog('initialLoad:trace', entry);
    if (event?.stage === 'feed-source') announceFeedSource(event);
  }, [announceFeedSource]);
  const reportInitialLoadError = React.useCallback(error => {
    const diagnostic = normalizeMatchingInitialLoadError(error, {
      viewMode: viewModeRef.current,
      ownerId: getOwnerId(),
    });
    const diagnosticWithTrace = {
      ...diagnostic,
      requestId: initialRequestIdRef.current,
      trace: initialLoadTraceRef.current,
    };
    setLoadError(diagnosticWithTrace);
    loadingRef.current = false;
    loadingStateRef.current = false;
    setLoading(false);
    toast.dismiss('matching-slow-load');
    console.error({ event: 'Matching.initialLoadError', ...diagnosticWithTrace });
    toast.error(diagnostic.userMessage, {
      id: INITIAL_LOAD_ERROR_TOAST_ID,
    });
  }, []);
  // Коли загальну стрічку прочитати не вдалось, а картки додаткового доступу
  // вже є, деку показувати можна — екран помилки забрав би в глядача й те, що
  // йому таки надали. Але мовчати теж не можна: коротка дека без пояснення
  // читається як «більше нікого немає», а не як «половина не прочиталась».
  // Один рядок з кодом помилки називає цю різницю там, де консолі немає.
  const announcePublicFeedUnavailable = React.useCallback(error => {
    if (!error) return;
    const detail = String(error?.code || error?.message || error || '').trim();
    toast(uiText('Загальна стрічка недоступна{detail}. Показані лише картки з додаткового доступу.', language, { detail: detail ? `: ${detail}` : '' }), {
      id: 'matching-public-feed-unavailable',
      icon: '⚠️',
    });
  }, [language]);
  const resetReactionPaginationState = React.useCallback((reactionType = null) => {
    if (reactionType === 'favorites' || reactionType === 'dislikes') {
      reactionLoadedIdsRef.current[reactionType] = new Set();
      setReactionPipelineReadyByType(prev => ({ ...prev, [reactionType]: false }));
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
    setReactionPipelineReadyByType({
      favorites: false,
      dislikes: false,
    });
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
  /**
   * Чи список зараз чекає на відновлення позиції.
   *
   * Поки він чекає, його не видно: інакше читач бачить вершину списку й аж за
   * мить — той рядок, з якого пішов. Стан заводиться ще до першого рендера
   * (позначки в `sessionStorage` вже лежать), тож вершина не встигає
   * намалюватись жодного разу.
   */
  const [scrollRestorePending, setScrollRestorePending] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return Boolean(sessionStorage.getItem(SCROLL_ANCHOR_KEY) || sessionStorage.getItem(SCROLL_Y_KEY));
  });
  const scrollPositionRef = useRef(0);
  // Чи прокрутив читач стрічку донизу відтоді, як приїхала остання порція.
  // Ref читають обробники, стан — рендер; тримаємо обидва в парі.
  const scrolledDownSinceLoadRef = useRef(false);
  const [scrolledDownSinceLoad, setScrolledDownSinceLoad] = useState(false);
  // Остання спроба дозавантаження не дала жодної картки.
  const [lastLoadAddedNothing, setLastLoadAddedNothing] = useState(false);
  // Поточний цикл відліку: скільки карток він пообіцяв і скільки спроб уже зробив.
  // null — циклу немає, кінець списку може знову запропонувати відлік.
  const [throttledCycle, setThrottledCycle] = useState(null);
  // Підсумок останньої порції: скільки карток вона справді додала і коли.
  //
  // Відлік добігає нуля, картки лягають у кінець — і кінець списку знову
  // виглядає так само, як за секунду до того. Читач бачив блимання лічильника,
  // а не результат, і мусив прокручувати вгору, щоб дізнатись, чи взагалі щось
  // приїхало. Тепер порція називає себе сама, на тому ж місці, де щойно був
  // відлік.
  const [lastBatchSummary, setLastBatchSummary] = useState(null);
  /**
   * Куди читач дивився — це рядок, а не піксель.
   *
   * Піксельна позиція сама по собі не відновлює нічого: стрічка повертається
   * з кеша порціями, і `scrollTo(0, 4000)` по списку, у якому зараз десять
   * рядків, упирається в його кінець — а позначку «вже відновили» знімає
   * назавжди. Далі приїжджає решта карток, і читач опиняється там, звідки все
   * починалось: на початку списку. Тому поруч із пікселем лежить id картки, на
   * якій він зупинився, і саме її рядок відновлення шукає в DOM.
   *
   * Піксель лишається запасним: анкету могли прибрати з деки (реакція,
   * звужений фільтр), і тоді краще стати приблизно там, ніж угорі.
   */
  const lastSeenCardIdRef = useRef('');
  const saveScrollPosition = () => {
    // Порожній запис поверх збереженої позиції — це її стирання, а не
    // збереження. Стрічка на самому початку й без жодної переглянутої картки
    // нічого не важить, і писати про неї нічого: єдине, що такий запис робив, —
    // зносив орієнтир, з яким сюди щойно збирались повернутись. У режимі
    // розробки React ставить і знімає ефекти двічі, тож цей «розмонтаж» на
    // порожньому місці приходив рівно в кадрі монтування — і відновлення
    // позиції не працювало взагалі, тобто перевірити його наживо було ніяк.
    if (!lastSeenCardIdRef.current && !scrollPositionRef.current) return;
    sessionStorage.setItem(SCROLL_Y_KEY, String(scrollPositionRef.current));
    if (lastSeenCardIdRef.current) {
      sessionStorage.setItem(SCROLL_ANCHOR_KEY, lastSeenCardIdRef.current);
    } else {
      sessionStorage.removeItem(SCROLL_ANCHOR_KEY);
    }
  };
  /**
   * Картки, на які читач відповів у цьому перегляді деки.
   *
   * Реакція записується одразу, а картка лишається на місці до наступної
   * збірки деки (`keepReactedUserIds` у `applyMatchingUiFiltersToUsers`).
   * Досі було навпаки: лайк у відкритій картці прибирав анкету з-під пальця
   * тієї ж миті — на її місце приїжджала наступна, і подивитись, кого щойно
   * вподобав (чи виправити промах), було вже ніде. У списку рядок так само
   * випадав з-під свайпу.
   *
   * Набір живе рівно стільки, скільки поточна дека: зміна режиму або фільтрів
   * збирає її заново, і там реакції вже діють — саме цього читач і чекає,
   * повернувшись до стрічки.
   */
  const [stickyReactedUserIds, setStickyReactedUserIds] = useState(() => new Set());
  const rememberReactedCard = React.useCallback(userId => {
    if (!userId) return;
    setStickyReactedUserIds(previous => {
      if (previous.has(userId)) return previous;
      const next = new Set(previous);
      next.add(userId);
      return next;
    });
  }, []);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Дека зібралась заново — реакції, зроблені в попередній, більше її не
  // тримають. Саме це читач і має на увазі під «наступного разу картки вже не
  // буде»: він перемкнув режим, звузив фільтри або повернувся до стрічки.
  useEffect(() => {
    setStickyReactedUserIds(previous => (previous.size ? new Set() : previous));
  }, [viewMode, filters]);
  useEffect(() => {
    matchingProfileStateRef.current = {
      ownerId,
      currentAdditionalAccessRules,
      currentSearchKeySetKeys,
    };
  }, [currentAdditionalAccessRules, currentSearchKeySetKeys, ownerId]);
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
      const previousY = scrollPositionRef.current;
      const nextY = window.scrollY;
      scrollPositionRef.current = nextY;
      if (nextY <= previousY) return;

      // Прокрутка донизу повертає дозавантаженню бюджет спроб. Стеля на порожні
      // спроби ловить самохідний цикл «видно кінець → вантажимо → нічого не
      // приїхало»; ловити нею живу людину, яка досі гортає, не можна — саме
      // через це стрічка застрягала намертво до перезавантаження сторінки.
      emptyAutoLoadMoreAttemptsRef.current = 0;

      // І цей же жест — єдине, чим читач просить продовження: він заводить
      // відлік у кінці списку.
      if (scrolledDownSinceLoadRef.current) return;
      scrolledDownSinceLoadRef.current = true;
      setScrolledDownSinceLoad(true);
      setLastLoadAddedNothing(false);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      saveScrollPosition();
    };
  }, []);

  /**
   * Повернення до стрічки стає там, де читач її лишив.
   *
   * Відновлення тут було, і воно не працювало: одна спроба на першому ж
   * рендері, у якому в деці є бодай одна картка. А дека повертається порціями
   * — спершу те, що встиг віддати кеш, потім решта, — тож `scrollTo` по
   * короткому ще списку впирався в його кінець, позначка «відновили» знімалась
   * назавжди, і людина, яка гортала до шістдесятої картки, поверталась на
   * початок списку.
   *
   * Тепер орієнтир — рядок тієї картки, яку читач останньою дивився
   * (`data-card-id`), а не піксель: рядки різної висоти, і фото в них
   * догідратовуються вже після відновлення. Спроба повторюється покадрово,
   * доки той рядок не з'явиться в DOM — або доки не вичерпається стеля, після
   * якої лишається піксель як приблизна відповідь.
   */
  useLayoutEffect(() => {
    if (restoreRef.current || users.length === 0) return undefined;
    const savedY = sessionStorage.getItem(SCROLL_Y_KEY);
    const savedAnchorId = sessionStorage.getItem(SCROLL_ANCHOR_KEY);
    if (savedY === null && !savedAnchorId) {
      // Відновлювати нема чого — отже, й ховати список нема від чого.
      setScrollRestorePending(false);
      return undefined;
    }

    let frame = 0;
    let attempts = 0;
    let lastRowCount = -1;
    let stableFrames = 0;

    // Відновлення позиції — не жест читача. Орієнтир посувається одразу, щоб
    // подія скролу, яка зараз прийде, не зарахувалась як прокрутка донизу і не
    // завела відлік сама.
    const settle = () => {
      scrollPositionRef.current = window.scrollY;
      restoreRef.current = true;
      sessionStorage.removeItem(SCROLL_Y_KEY);
      sessionStorage.removeItem(SCROLL_ANCHOR_KEY);
      setScrollRestorePending(false);
    };

    /**
     * Знайти рядок мало — треба ще дочекатись, доки список перестане рости.
     *
     * Дека повертається порціями, і найперша з них буває з однієї картки — тієї
     * самої, яку шукаємо. `scrollIntoView` по такому списку ставить її на
     * початок екрана й оголошує відновлення завершеним, а решта карток
     * приїжджає вже після й зсуває її вниз: читач опиняється на вершині
     * списку — рівно там, звідки він не хотів починати. Тож якір центрується
     * щокадрово, а відновлення завершується аж тоді, коли кількість рядків не
     * змінюється кілька кадрів поспіль (або коли вичерпалась стеля спроб).
     */
    const tryRestore = () => {
      attempts += 1;
      const rows = document.querySelectorAll('[data-card-id]').length;
      if (rows === lastRowCount) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        lastRowCount = rows;
      }

      const anchor = findCardNodeById(savedAnchorId);
      if (anchor) {
        anchor.scrollIntoView({ block: 'center' });
        if (stableFrames >= SCROLL_ANCHOR_STABLE_FRAMES || attempts >= SCROLL_ANCHOR_MAX_ATTEMPTS) {
          settle();
          return;
        }
        frame = requestAnimationFrame(tryRestore);
        return;
      }
      if (savedAnchorId && attempts < SCROLL_ANCHOR_MAX_ATTEMPTS) {
        frame = requestAnimationFrame(tryRestore);
        return;
      }
      if (savedY !== null) window.scrollTo(0, Number(savedY));
      settle();
    };

    frame = requestAnimationFrame(tryRestore);
    return () => cancelAnimationFrame(frame);
  }, [users]);

  /**
   * Стеля очікування: список не ховається довше, ніж триває саме відновлення.
   *
   * Якір може не приїхати взагалі — картку прибрали з деки, фільтр звузили,
   * дека не догрузилась, — і тоді відновлення закінчується пікселем або не
   * закінчується зовсім. Ховати список після цього нема сенсу: краще показати
   * його там, де він є, ніж лишити людину перед порожнім екраном. Відлік іде
   * від першої картки: поки деки немає, ховати нічого.
   */
  const hasRenderedRows = users.length > 0;
  useEffect(() => {
    if (!scrollRestorePending || !hasRenderedRows) return undefined;
    const timer = setTimeout(() => setScrollRestorePending(false), SCROLL_RESTORE_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [hasRenderedRows, scrollRestorePending]);

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

  /**
   * Цятка адміна: показати анкету в стрічці або прибрати з неї.
   *
   * Стан питається в картки (`isMatchingCardPublished`), а не в `publish`:
   * `publish` живе в анкеті, а в проєкції його немає — тобто в стрічці кожна
   * цятка була б червоною, і перший же дотик «публікував» уже опубліковану.
   *
   * Пишеться при цьому саме `publish`: писач сам перекладе його у `feedDate`
   * картки (`refreshMatchingCardAfterProfileWrite` →
   * `buildMatchingCardProjection`), і два стани «поза стрічкою» — «сховали» і
   * «ще не публікували» — розрізняє він, а не цей обробник.
   *
   * Локально ключ картки міняється одразу обома іменами: перемальовує цятку
   * саме `feedDate`, і без нього вона лишалась би старого кольору до
   * перечитування стрічки.
   */
  const togglePublish = React.useCallback(async user => {
    if (!isAdmin || !user?.userId) return;
    const newValue = !isMatchingCardPublished(user);
    setUsers(prev =>
      prev.map(u => (u.userId === user.userId
        ? {
          ...u,
          publish: newValue,
          [MATCHING_CARD_FEED_FIELD]: newValue
            ? (normalizeFeedDateValue(u[MATCHING_CARD_FEED_FIELD]) || todayFeedDate())
            : false,
        }
        : u))
    );
    try {
      const backendPayload = sanitizeCardForBackend({ publish: newValue });
      await updateDataInRealtimeDB(user.userId, backendPayload, 'update');
      await updateDataInFiresoreDB(user.userId, backendPayload, 'update');
    } catch (err) {
      console.error('Failed to toggle publish', err);
    }
  }, [isAdmin]);

  // Spec §1: a non-empty query replaces the feed's contents with the results,
  // which the same filters then narrow - there is no second filtering branch.
  const applySearchResults = async res => {
    const arr = Array.isArray(res) ? res : Object.values(res || {});
    // Картка з короткого id — така сама картка: колекція у вебі одна, і саме так
    // її приймає індексна гілка стрічки. Мірка «довше за 20 символів» лишилась
    // від поділу на дві колекції і мовчки викидала з результатів усе, що
    // заведено в застосунку (push-id рівно 20 символів): статус устигав сказати
    // «Знайшов», а на екран не потрапляло нічого.
    //
    // Знайдене — не дека, і правило деки на нього не поширюється. Дека показує
    // лише картки з `feedDate`, і саме тому пошук мовчав про неопубліковані:
    // він знаходив анкету в `searchId`, читав її проєкцію — і викидав на
    // останньому кроці, бо картка не в стрічці. Але запит називає конкретну
    // людину, і відповісти «немає» на те, що знайшлось, — це не межа
    // приватності, а загублена відповідь: сама межа стоїть нижче, у тому, що
    // саме читається (`profileDetails` і `profileContacts` неопублікованої
    // анкети звичайному читачеві не віддають ані правила, ані
    // `scopeProfileNodesToViewer`).
    //
    // Тому позначка ставиться кожній знайденій картці, а не лише тій, чий
    // читач має повний доступ: інакше слабший доступ показував би більше за
    // сильніший.
    //
    // Порядок задає `orderMatchingSearchResults`: спершу картки з `feedDate`,
    // за ними — решта знайденого.
    const filtered = orderMatchingSearchResults(
      arr
        .filter(u => isMatchingCardId(u?.userId))
        .map(user => (user?.__matchingAccessAllowed === undefined
          ? { ...user, __matchingAccessAllowed: true }
          : user))
    );

    loadInitialVersionRef.current += 1;
    additionalLoadMoreFetchVersionRef.current += 1;
    additionalMatchingApplyVersionRef.current += 1;
    loadingRef.current = false;
    loadingStateRef.current = false;
    hasMoreRef.current = false;
    viewModeRef.current = 'search';

    setUsers(filtered);
    loadedIdsRef.current = new Set(filtered.map(u => u.userId).filter(Boolean));
    setAdditionalAccessUsers([]);
    setAdditionalNextOffset(0);
    additionalHasMoreRef.current = false;
    setAdditionalHasMore(false);
    setHasMore(false);
    setLastKey(null);
    setLoading(false);
    invalidateReactionAsyncWork();
    setSharedReactionCandidateUsers([]);
    setViewMode('search');
    // Нова видача — нове вікно показу. Але уточнення знімається не тут: воно
    // пережило запит навмисно (див. `refineStateRef`), бо описує не цю видачу,
    // а те, що читачеві взагалі цікаво. Раніше його скидало кожне «Знайшов», і
    // на запиті з чотирьохсот влучань уточнювати доводилось заново — щоразу
    // після того, як відлік уже почав видавати картки по дві.
    //
    // Мовчазним воно від цього не стає: чіп із числом і хрестиком лишається над
    // сіткою, а видача, з якої уточнення прибрало все, каже про це прямо.
    const { key: activeRefineKey, value: activeRefineValue } = refineStateRef.current;
    const refined = applyRefineSelection(filtered, activeRefineKey, activeRefineValue);
    setSearchRevealCount(MATCHING_FIRST_PAGE_BATCH);
    searchRevealTargetRef.current = refined.length;
    // Коментарі читаються для того, що на екрані, а не для всієї видачі, — а на
    // екран іде вже звужене, тож і читати їх для відсіяного нема за що.
    void loadCommentsFor(refined.slice(0, FEED_PHOTO_HYDRATION_LIMIT));
  };

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    additionalAccessUsersRef.current = additionalAccessUsers;
  }, [additionalAccessUsers]);

  useEffect(() => {
    additionalNextOffsetRef.current = additionalNextOffset;
  }, [additionalNextOffset]);

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
      ...additionalAccessUsers.map(u => u.userId),
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
  }, [additionalAccessUsers, sharedReactionCandidateUsers, users]);

  /*
   * Реакція вичищає картку і з самої деки — але не ту, на яку щойно відповіли.
   *
   * Це третє, найжорсткіше з прибирань: воно не фільтрує показ, а **викидає**
   * картку зі стану `users`, тож повернути її до наступного завантаження вже
   * нема звідки. Саме воно й забирало анкету з-під пальця: два інші прибирання
   * (`mergeMatchingCandidateUsers` і `applyMatchingUiFiltersToUsers`) уже
   * знали про `stickyReactedUserIds`, картка проходила крізь них — і все одно
   * зникала, бо до них просто не доходила.
   *
   * Виняток тут нічого не послаблює: щойно дека збереться заново, набір
   * порожній, і ті самі два фільтри приберуть картку без цього ефекту.
   */
  useEffect(() => {
    if (viewMode === 'favorites' || viewMode === 'dislikes') {
      return;
    }
    setUsers(prev =>
      prev.filter(u => (
        (!favoriteUsers[u.userId] && !dislikeUsers[u.userId])
        || stickyReactedUserIds.has(u.userId)
      ))
    );
  }, [favoriteUsers, dislikeUsers, stickyReactedUserIds, viewMode]);



  const ensureFreshAdditionalMatchingProfile = React.useCallback(async ({ accessUserId, reason = 'additional-matching' } = {}) => {
    const state = matchingProfileStateRef.current || {};
    const normalizedAccessUserId = String(accessUserId || auth.currentUser?.uid || state.ownerId || '').trim();
    if (!normalizedAccessUserId) return null;

    const now = Date.now();
    const currentMetadata = {
      accessUserId: normalizedAccessUserId,
      rawRulesSignature: getRawRulesSignature(state.currentAdditionalAccessRules),
      searchKeySetsOfExactUserSignature: getSearchKeySetsOfExactUserSignature(state.currentSearchKeySetKeys),
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
      const userRole = profile?.userRole || profile?.role || '';
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
      };
      const confirmedPaginationInvalidationReasons = [];
      if (!cached) confirmedPaginationInvalidationReasons.push('missing-cache');
      if (cached && cached.accessUserId !== freshMetadata.accessUserId) confirmedPaginationInvalidationReasons.push('accessUserId-changed');
      if (cached && cached.rawRulesSignature !== freshMetadata.rawRulesSignature) confirmedPaginationInvalidationReasons.push('rawRulesSignature-changed');
      if (cached && cached.searchKeySetsOfExactUserSignature !== freshMetadata.searchKeySetsOfExactUserSignature) {
        confirmedPaginationInvalidationReasons.push('searchKeySetsOfExactUserSignature-changed');
      }

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
      // Та сама роль у новому масиві — це не зміна ролі: тримаємо попереднє
      // значення, щоб памʼять про вже зібрану деку (`initialRoleLoadedRef`) і
      // мемо, що залежать від ролі, не перебудовувались на порожньому місці.
      setCurrentUserRole(prev => (viewerRoleSignature(prev) === viewerRoleSignature(userRole) ? prev : userRole));
      setCurrentAdditionalAccessRules(prev => (prev === additionalAccessRules ? prev : additionalAccessRules));
      setCurrentSearchKeySetKeys(prev => (
        getSearchKeySetsOfExactUserSignature(prev) === getSearchKeySetsOfExactUserSignature(searchKeySetsOfExactUser)
          ? prev
          : searchKeySetsOfExactUser
      ));
      localStorage.setItem('accessLevel', accessLevel);
      localStorage.setItem('userRole', userRole);
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
      filtersSignature: stableAdditionalSignature(filtersRef.current || {}),
      ownerId: ownOwnerId,
      ownersSignature: stableAdditionalSignature(owners),
    };
    const canApplyCommentsResult = () => (
      requestContext.viewMode === viewModeRef.current &&
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
    );    const latestStore = loadComments();
    const nextStore = { ...latestStore };
    fetchedEntries.forEach(({ owner, comments: ownerComments = {}, requestedIds = [] }) => {
      nextStore[owner] = { ...(nextStore[owner] || {}) };
      requestedIds.forEach(id => {
        const serverComment = ownerComments?.[id] || null;
        const local = nextStore[owner][id];
        if (shouldUseServerComment(serverComment, local)) {
          nextStore[owner][id] = {
            ...serverComment,
            text: String(serverComment.text || ''),
            lastAction: serverComment.lastAction || Date.now(),
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
        setCurrentUserRoleResolved(false);
        const initialOwnerIds = resolveMatchingMultiDataOwnerIds({ viewerId: user.uid });
        setMultiDataOwnerIds(initialOwnerIds);
        debugSharedReactionsLog(user.uid, 'initial ownerIds before profile access load', {
          ownerIds: initialOwnerIds,
        });

        const syncAccessProfile = async () => {
          try {
            const profile = await fetchUserById(user.uid);
            const accessLevel = profile?.accessLevel || '';
            const userRole = profile?.userRole || profile?.role || '';
            const canCreateProfiles = profile?.canCreateProfiles === true;
            const additionalAccessRules = profile?.additionalAccessRules || '';
            const rawMultiDataAccessUserIds = profile?.[MULTI_DATA_ACCESS_FIELD];
            const accessOwnerIds = parseMultiDataAccessUserIds(rawMultiDataAccessUserIds);
            const resolvedOwnerIds = resolveMatchingMultiDataOwnerIds({ viewerId: user.uid, profile });

            // The public deck needs the role and the reaction owners together.
            // Install both before resolving it, while leaving the unrelated
            // search-key discovery and additional-access refresh asynchronous.
            setMultiDataOwnerIds(resolvedOwnerIds);
            setCurrentUserRole(prev => (viewerRoleSignature(prev) === viewerRoleSignature(userRole) ? prev : userRole));
            localStorage.setItem('userRole', userRole);
            setCurrentUserRoleResolved(true);
            debugSharedReactionsLog(user.uid, 'ownerIds read from multiDataAccessUserIds', {
              rawMultiDataAccessUserIds,
              sharedOwnerIds: accessOwnerIds,
              ownerIds: resolvedOwnerIds,
              paths: accessOwnerIds.map(sharedOwnerId => ({
                favorites: `multiData/favorites/${sharedOwnerId}`,
                dislikes: `multiData/dislikes/${sharedOwnerId}`,
                comments: `${COMMENTS_ROOT_PATH}/${sharedOwnerId}`,
              })),
            });
            const searchKeySetKeys = await resolveAdditionalSearchKeySetKeysForMatching(profile, user.uid);

            console.info('[Matching][additionalAccessUsers] resolvedSearchKeySetKeys', searchKeySetKeys);

            setCurrentAccessLevel(accessLevel);
            setCurrentCanCreateProfiles(canCreateProfiles);
            setCurrentAdditionalAccessRules(additionalAccessRules);
            setCurrentSearchKeySetKeys(searchKeySetKeys);
            localStorage.setItem('accessLevel', accessLevel);
            localStorage.setItem('canCreateProfiles', canCreateProfiles ? 'true' : 'false');
            localStorage.setItem('additionalAccessRules', additionalAccessRules);
            localStorage.setItem('additionalSearchKeySetKeys', searchKeySetKeys.join(','));
            const freshCache = await ensureFreshAdditionalMatchingProfile({
              accessUserId: user.uid,
              reason: 'auth-state-sync',
            });

            console.info('[Matching][additionalAccessUsers] resolvedSearchKeySetsOfExactUser', freshCache?.searchKeySetsOfExactUser || []);
          } catch (error) {
            console.error('Failed to refresh access profile on Matching', error);
            const cachedAccessLevel = localStorage.getItem('accessLevel') || '';
            const cachedUserRole = localStorage.getItem('userRole') || '';
            const cachedAdditionalAccessRules = localStorage.getItem('additionalAccessRules') || '';
            const cachedSearchKeySetKeys = normalizeSearchKeySetKeys(localStorage.getItem('additionalSearchKeySetKeys') || '');
            setCurrentUserRole(cachedUserRole);
            setCurrentUserRoleResolved(true);
            const fallbackSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(cachedSearchKeySetKeys, user.uid)
              ? cachedSearchKeySetKeys
              : await resolveAdditionalSearchKeySetKeysForMatching(null, user.uid);
            console.info('[Matching][additionalAccessUsers] resolvedSearchKeySetsOfExactUser', fallbackSearchKeySetKeys);
            setCurrentAccessLevel(cachedAccessLevel);
            setCurrentAdditionalAccessRules(cachedAdditionalAccessRules);
            setCurrentSearchKeySetKeys(fallbackSearchKeySetKeys);
          }
        };

        syncAccessProfile();
      } else {
        localStorage.removeItem('ownerId');
        localStorage.removeItem('accessLevel');
        localStorage.removeItem('userRole');
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
        setCurrentUserRole('');
        setCurrentAdditionalAccessRules('');
        setCurrentSearchKeySetKeys([]);
        // `resetHasMore` тут саме `false`: вихід із сесії — це не «деку ще не
        // гортали», а «читати більше нема кому». Поки скид ставив `hasMore`
        // назад у `true`, довантаження бачило незакінчену деку й питало базу
        // знову, вже без жодного uid.
        resetAdditionalMatchingState({ resetHasMore: false, resetLoading: true });
        hasMoreRef.current = false;
        setHasMore(false);
        return;
      }

      const { todayDash } = getCurrentDate();
      // Дата входу — це і ключ стрічки: писач розкладе її по вузлах, перебудує
      // картку і віддзеркалить у legacy для мобільного застосунку.
      updateDataInRealtimeDB(user.uid, sanitizeCardForBackend({ lastLogin2: todayDash }), 'update');

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
          sharedOwnerDislikesId0001: Boolean(normalizeReactionMap(dislikeSnapshots[DEBUG_SHARED_OWNER_ID])[DEBUG_SHARED_CARD_ID]),
          viewerOwnLikeId0001: Boolean(ownFavorites[DEBUG_SHARED_CARD_ID]),
          viewerOwnDislikeId0001: Boolean(ownDislikes[DEBUG_SHARED_CARD_ID]),
          appliedAsLiked: Boolean(favorites[DEBUG_SHARED_CARD_ID]),
          appliedAsDisliked: Boolean(dislikes[DEBUG_SHARED_CARD_ID]),
          requestedForCandidatePool: nextSharedReactionIds.includes(DEBUG_SHARED_CARD_ID),
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

  /**
   * Гідратація карток для пошуку по індексу `searchKey`.
   *
   * Індекс називає id — показати треба картку. Спершу питаємо вузол проєкцій:
   * там уся інформація, яку рендерить рядок стрічки, включно з аватаром, у
   * сотнях байтів. Повна анкета читається лише для тих id, чиєї проєкції ще
   * немає (або вона старої версії) — тобто рівно доти, доки адмін не запустить
   * побудову карток.
   */
  const hydrateMatchingFeedCards = React.useCallback(async ids => {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if (!uniqueIds.length) return {};

    // Список id для цієї сторінки вже міг прийти з кеша — тоді читати з бекенду
    // ті самі проєкції ще раз немає за чим. Тому спершу локальний кеш проєкцій,
    // а по мережу йдуть тільки ті id, яких у ньому немає або чий запис протух.
    const isBackendOnlyMode = matchingDataSourceMode === 'backend';
    const cachedSummaries = isBackendOnlyMode
      ? { cards: {}, missingIds: uniqueIds }
      : getCachedMatchingSummaryCards(uniqueIds);
    if (isBackendOnlyMode) {
      writeMatchingDebugLog('matchingBackendOnlyModeUsed', {
        mode: matchingDataSourceMode,
        stage: 'summary-card-cache-read-skipped',
      });
    }
    const idsToFetch = cachedSummaries.missingIds;
    if (!idsToFetch.length) return { ...cachedSummaries.cards };
    const cacheEpoch = getMatchingLocalStorageCacheEpoch();

    try {
      const { cards, missingIds } = await fetchMatchingCardsByIds(idsToFetch);
      incrementMatchingLoadStat('matchingCardHits', Object.keys(cards).length);
      if (cacheEpoch === getMatchingLocalStorageCacheEpoch()) {
        setCachedMatchingSummaryCards(cards);
      }
      if (!missingIds.length) return { ...cachedSummaries.cards, ...cards };
      const hydrated = await fetchUsersByIds(missingIds);
      return { ...cachedSummaries.cards, ...cards, ...(hydrated || {}) };
    } catch (error) {
      console.warn('[Matching][matchingCards] не вдалося прочитати проєкції, читаємо анкети', error);
      const hydrated = await fetchUsersByIds(idsToFetch);
      return { ...cachedSummaries.cards, ...(hydrated || {}) };
    }
  }, [matchingDataSourceMode]);

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
      filters: filtersRef.current || {},
      isAdmin,
      favoriteUsers: favoriteUsersRef.current,
      dislikeUsers: dislikeUsersRef.current,
      roleIndexSets,
      filterMainFn: filterMain,
      fetchMatchingCardsPage,
      hydrateUsersByIds: ids => fetchUsersByIds(ids),
      // Дека донорки — це самі контрагенти, і рахувати запас треба по них.
      // Інакше сторінка джерела виглядає повною з карток, які на екран не
      // потраплять: відлік обіцяв би дві картки, а дорахувати їх було б нічим.
      viewerRole: currentUserRoleRef.current,
      viewerId: getOwnerId(),
      onPart,
      onDiagnosticEvent: recordInitialLoadDiagnostic,
    }),
    [isAdmin, recordInitialLoadDiagnostic, roleIndexSets]
  );

  // Додаткові правила відкривають окремі анкети, зокрема неопубліковані,
  // яких за визначенням немає у публічному matchingCards. Тому scoped-індекс
  // доповнює загальну стрічку, а не підміняє її джерело чи пагінацію.
  useEffect(() => {
    const accessUserId = String(ownerId || '').trim();
    const searchKeySetKeys = normalizeSearchKeySetKeys(currentSearchKeySetKeys);
    if (!accessUserId || !parsedAdditionalAccessRules.length || !searchKeySetKeys.length) {
      additionalMatchingFetchVersionRef.current += 1;
      additionalHasMoreRef.current = false;
      additionalAccessLoadInFlightRef.current = false;
      const deferredError = deferredInitialLoadErrorRef.current;
      deferredInitialLoadErrorRef.current = null;
      additionalAccessUsersRef.current = [];
      setAdditionalHasMore(false);
      setAdditionalAccessUsers([]);
      setAdditionalNextOffset(0);
      if (deferredError) reportInitialLoadError(deferredError);
      return () => {};
    }

    const requestVersion = additionalMatchingFetchVersionRef.current + 1;
    additionalMatchingFetchVersionRef.current = requestVersion;
    // Do not retain cards granted by the previous owner/rule set while its
    // replacement request is in flight (or if that request fails).
    additionalHasMoreRef.current = false;
    additionalAccessLoadInFlightRef.current = true;
    additionalAccessUsersRef.current = [];
    setAdditionalHasMore(false);
    setAdditionalAccessUsers([]);
    setAdditionalNextOffset(0);
    let cancelled = false;
    let loadedScopedCards = false;

    const loadAccessScopedCards = async () => {
      try {
        const loaded = await fetchAdditionalAccessUsersBySearchIndex({
          rawRules: currentAdditionalAccessRules,
          accessUserId,
          searchKeySetKeys,
          filters: filtersRef.current || {},
          excludeIds: [
            ...Object.keys(favoriteUsersRef.current),
            ...Object.keys(dislikeUsersRef.current),
          ],
          offset: 0,
          limit: MATCHING_REFILL_LIMIT,
          fetchUsersByIds: fetchLimitedProfilesByIdsForMatching,
          shouldDebugAdditionalMatching,
          debugAdditionalToast,
          logAdditionalMatchingDebug,
        });
        if (cancelled || requestVersion !== additionalMatchingFetchVersionRef.current) return;

        const publicIds = new Set(usersRef.current.map(user => user?.userId).filter(Boolean));
        const scopedUsers = (loaded.users || [])
          .filter(user => user?.userId && !publicIds.has(user.userId))
          // Пачка з входу — голова деки: вона вже на екрані, коли перша
          // сторінка стрічки тільки їде. Позначка розводить її з тими наданими
          // картками, які дочитуються після кінця стрічки, — тим місце в хвості,
          // де читач і чекає на приріст (`mergeMatchingCandidateUsers`).
          .map(user => ({ ...user, __matchingAccessAllowed: true, __matchingAccessInitialBatch: true }));
        loadedScopedCards = scopedUsers.length > 0;
        additionalAccessUsersRef.current = scopedUsers;
        setAdditionalAccessUsers(scopedUsers);
        additionalHasMoreRef.current = Boolean(loaded.hasMore);
        setAdditionalHasMore(Boolean(loaded.hasMore));
        setAdditionalNextOffset(Number(loaded.nextOffset) || 0);
        if (scopedUsers.length) {
          // Помилка загальної стрічки прийшла раніше за ці картки: екран
          // помилки знімаємо, але сам факт збою лишаємо сказаним.
          const droppedError = deferredInitialLoadErrorRef.current;
          deferredInitialLoadErrorRef.current = null;
          setLoadError(null);
          toast.dismiss(INITIAL_LOAD_ERROR_TOAST_ID);
          announcePublicFeedUnavailable(droppedError);
        }
        void loadCommentsFor(scopedUsers);
      } catch (error) {
        if (!cancelled) console.error('Failed to load access-scoped matching cards', error);
      } finally {
        if (!cancelled && requestVersion === additionalMatchingFetchVersionRef.current) {
          additionalAccessLoadInFlightRef.current = false;
          const deferredError = deferredInitialLoadErrorRef.current;
          deferredInitialLoadErrorRef.current = null;
          if (deferredError && !loadedScopedCards) {
            reportInitialLoadError(deferredError);
          }
        }
      }
    };

    loadAccessScopedCards();
    return () => { cancelled = true; };
  }, [
    announcePublicFeedUnavailable,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    loadCommentsFor,
    ownerId,
    parsedAdditionalAccessRules.length,
    filters,
    reportInitialLoadError,
  ]);

  const loadInitial = React.useCallback(async () => {
    writeMatchingDebugLog('initialLoad:start', { ownerId: getOwnerId(), viewMode: viewModeRef.current, currentlyRenderedCards: Array.isArray(usersRef.current) ? usersRef.current.length : 0, currentlyLoadedIds: loadedIdsRef.current?.size || 0, hasMore, lastKey });
    if (initialLoadInFlightRef.current) {
      console.info('[loadInitial] skip overlapping request', { viewMode: viewModeRef.current });
      return;
    }
    const requestFiltersSignature = stableAdditionalSignature(filtersRef.current || {});
    const loadInitialVersion = loadInitialVersionRef.current + 1;
    const cacheEpoch = getMatchingLocalStorageCacheEpoch();
    loadInitialVersionRef.current = loadInitialVersion;
    const initialRequest = beginInitialRequest();
    debugReactionFlowLog('loadInitial:start', { viewMode: viewModeRef.current });
    // Той самий висновок, що й у `loadMore`: без читача питати базу нема про
    // що, і скелетон мусить закінчитись повідомленням, а не крутитись вічно.
    if (!getOwnerId()) {
      writeMatchingDebugLog('initialLoad:blocked:noViewer', { viewMode: viewModeRef.current });
      if (initialRequest === initialRequestIdRef.current) {
        hasMoreRef.current = false;
        setHasMore(false);
        loadingRef.current = false;
        loadingStateRef.current = false;
        setLoading(false);
      }
      return;
    }
    const startMode = viewModeRef.current;
    const canApplyInitialLoad = () => loadInitialVersion === loadInitialVersionRef.current && viewModeRef.current === startMode && cacheEpoch === getMatchingLocalStorageCacheEpoch();
    const canApplyInitialLoadWithFilters = () => canApplyInitialLoad() && requestFiltersSignature === stableAdditionalSignature(filtersRef.current || {});
    if (startMode !== 'default') {
      if (initialRequest === initialRequestIdRef.current) {
        loadingRef.current = false;
        loadingStateRef.current = false;
        setLoading(false);
      }
      return;
    }
    initialLoadInFlightRef.current = true;
    loadingRef.current = true;
    setInitialPublicWindowComplete(false);
    setUsers([]); // clear previous list to avoid caching wrong data
    loadedIdsRef.current = new Set();
    try {
      const owners = getMatchingMultiDataOwnerIds();
      let exclude = new Set();
      if (owners.length) {
        recordInitialLoadDiagnostic({ stage: 'reaction-snapshots', status: 'started', count: owners.length });
        const { favoriteSnapshots, dislikeSnapshots } = await runInitialRequestWithTimeout(
          () => readReactionSnapshotMaps({
            ownerIds: owners,
            fetchFavoriteUsers,
            fetchDislikeUsers,
            onWarning: warning => debugSharedReactionsLog(getOwnerId(), 'initial shared reaction snapshot unavailable', warning, warning.error),
          }),
          'reaction-snapshots',
        );
        recordInitialLoadDiagnostic({ stage: 'reaction-snapshots', status: 'completed', count: owners.length });
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
            sharedOwnerDislikesId0001: Boolean(normalizeReactionMap(dislikeSnapshots[DEBUG_SHARED_OWNER_ID])[DEBUG_SHARED_CARD_ID]),
            viewerOwnLikeId0001: Boolean(ownFavorites[DEBUG_SHARED_CARD_ID]),
            viewerOwnDislikeId0001: Boolean(ownDislikes[DEBUG_SHARED_CARD_ID]),
            appliedAsLiked: Boolean(favIds[DEBUG_SHARED_CARD_ID]),
            appliedAsDisliked: Boolean(disIds[DEBUG_SHARED_CARD_ID]),
            requestedForCandidatePool: nextSharedReactionIds.includes(DEBUG_SHARED_CARD_ID),
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

      const activeIndexFilterGroups = buildMatchingIndexFilterGroups({
        filters: filtersRef.current || {},
      });
      const isBackendOnlyMode = matchingDataSourceMode === 'backend';
      if (activeIndexFilterGroups.length > 0) {
        if (isBackendOnlyMode) {
          writeMatchingDebugLog('matchingBackendOnlyModeUsed', {
            mode: matchingDataSourceMode,
            stage: 'indexed-candidates',
          });
        }
        recordInitialLoadDiagnostic({ stage: 'search-index', status: 'started' });
        const indexed = await runInitialRequestWithTimeout(() => fetchMatchingIndexedCandidates({
          filters: filtersRef.current || {},
          viewMode: viewModeRef.current,
          ownerId: getOwnerId(),
          viewerRole: currentUserRoleRef.current,
          viewerId: getOwnerId(),
          offset: 0,
          limit: INITIAL_LOAD,
          excludeIds: [...exclude],
          hydrateUsersByIds: ids => runInitialRequestWithTimeout(
            () => hydrateMatchingFeedCards(ids),
            'profile-hydration',
          ),
          useIndexIdCache: !isBackendOnlyMode,
        }), 'search-index');
        recordInitialLoadDiagnostic({ stage: 'search-index', status: 'completed', count: indexed?.users?.length || 0 });
        if (!canApplyInitialLoadWithFilters()) { console.log('[Matching][indexedProvider] staleIndexedResultIgnored', { requestFiltersSignature, currentFiltersSignature: stableAdditionalSignature(filtersRef.current || {}) }); return; }
        const indexedUsers = (indexed.users || []).filter(user => isMatchingCardId(user.userId));
        if (indexedUsers.length === 0 && !indexed.hasMore) {
          console.warn('[Matching][indexedProvider] empty users index result; falling back to source pagination');
        } else {
          indexedUsers.forEach(user => { if (shouldCacheMatchingCard(user)) updateCard(user.userId, user); });
          loadedIdsRef.current = new Set(indexedUsers.map(user => user.userId).filter(Boolean));
          setUsers(indexedUsers);
          setIdsForQuery(defaultListKey, indexedUsers.map(user => user.userId));
          void loadCommentsFor(indexedUsers);
          if (!canApplyInitialLoadWithFilters()) { console.log('[Matching][indexedProvider] staleIndexedResultIgnored', { requestFiltersSignature, currentFiltersSignature: stableAdditionalSignature(filtersRef.current || {}) }); return; }
          setLastKey(indexed.nextOffset);
          setHasMore(Boolean(indexed.hasMore));
          setInitialPublicWindowComplete(indexedUsers.length >= INITIAL_LOAD || !indexed.hasMore);
          setViewMode('default');
          return;
        }
      }

      let cached = [];
      if (!isBackendOnlyMode) {
        writeMatchingDebugLog('matchingLocalFirstAttempt', {
          mode: matchingDataSourceMode,
          cacheKey: defaultListKey,
          viewMode: viewModeRef.current,
        });
        try {
          const cacheResult = await getCardsByList(defaultListKey);
          cached = Array.isArray(cacheResult?.cards) ? cacheResult.cards : [];
        } catch (error) {
          writeMatchingDebugLog('matchingLocalCacheRejected', { reason: 'invalid_json', cacheKey: defaultListKey });
          cached = [];
        }
        if (!cached.length) {
          writeMatchingDebugLog('matchingLocalCacheRejected', { reason: 'missing', cacheKey: defaultListKey });
        }
      } else {
        writeMatchingDebugLog('matchingBackendOnlyModeUsed', {
          mode: matchingDataSourceMode,
          stage: 'default-list-cache-read-skipped',
        });
      }
      if (cached.length && viewModeRef.current === startMode) {
        writeMatchingDebugLog('matchingLocalCacheUsed', {
          cacheKey: defaultListKey,
          cardsCount: cached.length,
          mode: matchingDataSourceMode,
        });
        console.log('[loadInitial] using cache', cached.length);
        const filteredCached = keepDonorCounterpartyCards({
          users: applyMatchingUiFiltersToUsers({
            users: cached.filter(u => isMatchingCardId(u.userId) && !exclude.has(u.userId)),
            filters: filtersRef.current || {},
            filterMainFn: filterMain,
            favoriteUsers: favoriteUsersRef.current,
            dislikeUsers: dislikeUsersRef.current,
            excludeReactionUsers: true,
            roleIndexSets,
            viewMode: 'default',
          }),
          viewerRole: currentUserRoleRef.current,
          viewerId: getOwnerId(),
        });
        loadedIdsRef.current = new Set(filteredCached.map(u => u.userId));
        setUsers(filteredCached);
        setIdsForQuery(defaultListKey, filteredCached.map(u => u.userId));
        void loadCommentsFor(filteredCached);
        if (!canApplyInitialLoadWithFilters()) { console.log('[Matching][indexedProvider] staleIndexedResultIgnored', { requestFiltersSignature, currentFiltersSignature: stableAdditionalSignature(filtersRef.current || {}) }); return; }
        setViewMode('default');

        // Кеш віддав повний перший екран — на цьому й зупиняємось.
        //
        // Раніше тут стояло «continue to fetch latest data to refresh cache», і
        // стрічка щоразу перечитувала з бекенду ту саму сторінку `users`, яку
        // щойно намалювала з кеша: кеш був лише способом швидше показати те, за
        // що однаково платили трафіком. Курсор для наступної сторінки будуємо з
        // останньої кешованої картки — це та сама пара (дата, id), яку віддав би
        // запит.
        const cursorFromCache = buildMatchingCursorFromCard(filteredCached[filteredCached.length - 1]);
        if (filteredCached.length >= INITIAL_LOAD && cursorFromCache) {
          writeMatchingDebugLog('matchingLocalCacheServedInitialLoad', {
            cacheKey: defaultListKey,
            cardsCount: filteredCached.length,
            cursorFromCache,
          });
          setLastKey(cursorFromCache);
          setHasMore(true);
          setInitialPublicWindowComplete(true);
          return;
        }
        // Кеша не вистачило на екран — дочитуємо джерело, як і раніше.
      } else if (!isBackendOnlyMode) {
        writeMatchingDebugLog('matchingBackendFallbackUsed', {
          mode: matchingDataSourceMode,
          cacheKey: defaultListKey,
          reason: 'missing',
        });
      }
      const cachedPublicCount = loadedIdsRef.current.size;
      const initialExclude = new Set([...exclude, ...loadedIdsRef.current]);
      const res = await runInitialRequestWithTimeout(
        () => fetchChunk(
          Math.max(1, INITIAL_LOAD - cachedPublicCount),
          undefined,
          initialExclude,
          async part => {
          if (!canApplyInitialLoadWithFilters()) { console.log('[Matching][indexedProvider] staleIndexedResultIgnored', { requestFiltersSignature, currentFiltersSignature: stableAdditionalSignature(filtersRef.current || {}) }); return; }
          const unique = part.filter(u => !loadedIdsRef.current.has(u.userId));
          if (unique.length) {
            unique.forEach(u => loadedIdsRef.current.add(u.userId));
            setUsers(prev => [...prev, ...unique]);
            void loadCommentsFor(unique);
          }
          }
        ),
        'source-chunk',
      );
      if (!canApplyInitialLoad()) return;
      console.log('[loadInitial] initial loaded', res.users.length, 'hasMore', res.hasMore);
      const loadInitialStats = {
        requestedVisible: INITIAL_LOAD,
        sourceCardsCount: Number(res.sourceCardsCount || 0),
        filteredCardsCount: Number(res.filteredCardsCount || 0),
        emittedCardsCount: Number(res.emittedCardsCount || 0),
        filteredOutCount: Math.max(0, Number(res.sourceCardsCount || 0) - Number(res.filteredCardsCount || 0)),
        visibleReturnedCount: Number(res.users?.length || 0),
        excludedCount: Number(res.excludedCount || 0),
        loadedPages: Number(res.loadedPages || 0),
        stopReason: res.stopReason || '',
        hasMore: Boolean(res.hasMore),
        sourceHasMore: Boolean(res.sourceHasMore),
      };
      matchingLastCardsDebugStatsRef.current = {
        ...loadInitialStats,
        stage: 'loadInitial',
        timestamp: new Date().toISOString(),
      };
      writeMatchingDebugLog('cards:loadInitial-summary', loadInitialStats);
      const stats = typeof window !== 'undefined' ? window.matchingLoadStats : null;
      if (stats && typeof console.table === 'function') console.table([stats]);
      loadedIdsRef.current = new Set([
        ...loadedIdsRef.current,
        ...res.users.map(u => u.userId),
      ]);
      res.users.forEach(u => { if (shouldCacheMatchingCard(u)) updateCard(u.userId, u); });
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
      const sourceExhausted = res.stopReason === 'source_exhausted'
        || res.stopReason === 'no_visible_cards_added';
      setInitialPublicWindowComplete(
        cachedPublicCount + res.users.length >= INITIAL_LOAD || sourceExhausted
      );
      setViewMode('default');
      writeMatchingDebugLog('initialLoad:completed', {
        ownerId: getOwnerId(),
        viewMode: viewModeRef.current,
        currentlyRenderedCards: Array.isArray(usersRef.current) ? usersRef.current.length : 0,
        currentlyLoadedIds: loadedIdsRef.current?.size || 0,
        hasMore: Boolean(res?.hasMore),
        lastKey: res?.lastKey ?? null,
        visibleReturnedCount: Number(res?.users?.length || 0),
        sourceHasMore: Boolean(res?.sourceHasMore),
      });
    } catch (error) {
      if (canApplyInitialLoad() && initialRequest === initialRequestIdRef.current) {
        recordInitialLoadDiagnostic({ stage: error?.requestLabel || 'unknown', status: 'failed' });
        if (additionalAccessUsersRef.current.length > 0) {
          deferredInitialLoadErrorRef.current = null;
          // Дека лишається на екрані — але коротка, і без пояснення це читається
          // як «більше нікого немає». Один рядок з кодом помилки називає різницю
          // між «нікого» і «не прочиталось»: на телефоні консолі немає.
          announcePublicFeedUnavailable(error);
        } else if (additionalAccessLoadInFlightRef.current) {
          deferredInitialLoadErrorRef.current = error;
        } else {
          reportInitialLoadError(error);
        }
      }
      console.error('Failed to load initial matching profiles', error);
    } finally {
      // Захист від накладання звільняється завжди, а не лише коли запит
      // лишився актуальним: інакше перший же застарілий запит замикав його
      // назавжди, і кожне наступне перезавантаження стрічки мовчки вибувало —
      // зміна фільтрів не давала б нічого. Стан гонки тут не виникає: чи можна
      // застосувати відповідь, вирішує `canApplyInitialLoad`.
      initialLoadInFlightRef.current = false;
      if (pendingDefaultReloadRef.current) {
        pendingDefaultReloadRef.current = false;
        // A role/profile refresh may invalidate an in-flight cold load. Start
        // the replacement after this request releases the overlap guard.
        setTimeout(() => loadInitial(), 0);
        return;
      }
      if (loadInitialVersion === loadInitialVersionRef.current && initialRequest === initialRequestIdRef.current) {
        loadingRef.current = false;
        loadingStateRef.current = false;
        setLoading(false);
      }
    }
  }, [announcePublicFeedUnavailable, beginInitialRequest, defaultListKey, fetchChunk, getMatchingMultiDataOwnerIds, hasMore, hydrateMatchingFeedCards, lastKey, loadCommentsFor, matchingDataSourceMode, recordInitialLoadDiagnostic, reportInitialLoadError, roleIndexSets]); // include fetchChunk to satisfy react-hooks/exhaustive-deps

  const reloadDefault = React.useCallback(() => {
    setLoadError(null);
    toast.dismiss('matching-slow-load');
    toast.dismiss(INITIAL_LOAD_ERROR_TOAST_ID);
    emptyAutoLoadMoreAttemptsRef.current = 0;
    autoLoadMoreSignatureRef.current = '';
    lastCardLoadTriggerSignatureRef.current = '';
    lastCardInFlightTriggerSignatureRef.current = '';
    invalidateReactionAsyncWork();
    viewModeRef.current = 'default';
    setViewMode('default');
    setActiveProfileIndex(0);
    setInitialPublicWindowComplete(false);
    resetReactionPaginationState();
    if (initialLoadInFlightRef.current) {
      // The queued replacement owns the deck now. The active request may finish,
      // but it must not apply state or repopulate the default-list cache.
      loadInitialVersionRef.current += 1;
      initialRequestIdRef.current += 1;
      pendingDefaultReloadRef.current = true;
      return;
    }
    loadInitial();
  }, [invalidateReactionAsyncWork, loadInitial, resetReactionPaginationState]);


  // Spec §10: toggling a filter must not cost a reload. The drawer edits a draft
  // and updates its count locally; only "Показати N" drops the loaded deck and
  // re-queries, which is the expensive half.
  const applyFilters = React.useCallback(nextFilters => {
    emptyAutoLoadMoreAttemptsRef.current = 0;
    autoLoadMoreSignatureRef.current = '';
    lastCardLoadTriggerSignatureRef.current = '';
    lastCardInFlightTriggerSignatureRef.current = '';
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
      setInitialPublicWindowComplete(false);
      setUsers([]);
      setAdditionalAccessUsers([]);
      setAdditionalNextOffset(0);
      additionalHasMoreRef.current = false;
      setAdditionalHasMore(false);
      setLastKey(null);
      setHasMore(true);
    }
  }, []);

  const handleFiltersChange = React.useCallback(nextFilters => {
    setDraftFilters(nextFilters);
    // Only edits made inside the open drawer are a draft. A change from anywhere
    // else - a chip's ✕, the panel's first notification carrying the stored
    // filters that the initial load depends on - has no "Показати N" to wait for.
    if (!showFiltersRef.current || !filtersRef.current || Object.keys(filtersRef.current).length === 0) {
      applyFilters(nextFilters);
    }
  }, [applyFilters]);

  const applyDraftFilters = React.useCallback(() => {
    applyFilters(draftFiltersRef.current);
    setShowFilters(false);
  }, [applyFilters]);

  const resetFiltersAndCache = React.useCallback(() => {
    const debugMatchingCache = isAdmin || shouldDebugAdditionalMatching(ownerId);
    const removedLocalStorageKeys = clearMatchingCache('matching reset filters and cache');
    clearMatchingCardsPageInFlight();
    localStorage.removeItem('matchingFilters');
    localStorage.removeItem(SEARCH_KEY);

    emptyAutoLoadMoreAttemptsRef.current = 0;
    autoLoadMoreSignatureRef.current = '';
    lastCardLoadTriggerSignatureRef.current = '';
    lastCardInFlightTriggerSignatureRef.current = '';
    loadingRef.current = false;
    loadingStateRef.current = false;
    loadInitialVersionRef.current += 1;
    initialRequestIdRef.current += 1;
    initialLoadInFlightRef.current = false;
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
    setDraftFilters({});
    setUsers([]);
    additionalAccessUsersRef.current = [];
    setAdditionalAccessUsers([]);
    setAdditionalNextOffset(0);
    additionalHasMoreRef.current = false;
    setAdditionalHasMore(false);
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
    toast.success(uiText('Фільтри та кеш скинуто', language));
  }, [invalidateReactionAsyncWork, isAdmin, language, loadInitial, ownerId, resetReactionPaginationState]);

  // Чи картка є в загальній стрічці. Та, що є, видна всім, кому взагалі
  // відкрито матчинг; та, якої немає, — лише тим, кому її відкрили правилами
  // додаткового доступу.
  //
  // Питали про це раніше в legacy: «чи є тіло в `users/{id}`». Але веб з
  // legacy не читає, та й відповідь була не про картку, а про читача — кому
  // правила відкривають корінь `users`, тому й тіло. Питання ставиться там,
  // де на нього є чесна відповідь: ключ стрічки `feedDate` у проєкції. Він є
  // рівно в показаної картки, і саме його читає дека. Це ще й один рядок
  // замість цілої анкети на кожен id.
  const classifyReactionIdsByStorage = React.useCallback(async ids => {
    const uniqueIds = [...new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean))];
    const requestKey = uniqueIds.slice().sort().join('|');
    if (reactionClassificationRequestsRef.current.has(requestKey)) {
      debugReactionFlowLog('classifyReactionIdsByStorage:dedupe-hit', { ids: summarizeIdsForDebug(uniqueIds) });
      return reactionClassificationRequestsRef.current.get(requestKey);
    }

    const requestPromise = (async () => {
      const classifications = {};

      debugReactionFlowLog('classifyReactionIdsByStorage:start', {
        fullReactionIds: summarizeIdsForDebug(uniqueIds),
        fullReactionIdsCount: uniqueIds.length,
      });

      await Promise.all(uniqueIds.map(async id => {
        try {
          const snapshot = await get(refDb(database, `${MATCHING_CARDS_ROOT}/${id}/${MATCHING_CARD_FEED_FIELD}`));
          // Питається значення, а не наявність: у ключа три стани, і `false`
          // (сховали) теж «існує». У стрічці стоїть лише картка з датою — саме
          // її бачить запит стрічки (`startAt('')` бере самі рядки), тож
          // «існує» зарахувало б сховану до стрічкових і провело б її повз
          // перевірку додаткового доступу.
          const feedDate = snapshot.exists() ? snapshot.val() : null;
          classifications[id] = typeof feedDate === 'string' && feedDate.trim()
            ? { storage: 'feed', reason: 'in-matching-feed' }
            : { storage: 'nodes', reason: 'not-in-matching-feed' };
        } catch (error) {
          // Відмова в правах — це не відповідь «немає»: картку однаково
          // перевірить індекс додаткового доступу.
          classifications[id] = { storage: 'nodes', reason: 'feed-read-denied', error: error?.message || String(error) };
        }
      }));

      const legacyReactionIds = uniqueIds.filter(id => classifications[id]?.storage === 'feed');
      const nodeReactionIds = uniqueIds.filter(id => classifications[id]?.storage === 'nodes');
      debugReactionFlowLog('classifyReactionIdsByStorage:result', {
        fullReactionIds: summarizeIdsForDebug(uniqueIds),
        legacyReactionIds: summarizeIdsForDebug(legacyReactionIds),
        nodeReactionIds: summarizeIdsForDebug(nodeReactionIds),
        counts: {
          fullReactionIds: uniqueIds.length,
          legacyReactionIds: legacyReactionIds.length,
          nodeReactionIds: nodeReactionIds.length,
        },
      });

      reactionStorageByIdRef.current = {
        ...reactionStorageByIdRef.current,
        ...Object.fromEntries(
          Object.entries(classifications).map(([id, classification]) => [id, classification.storage])
        ),
      };

      return {
        fullReactionIds: uniqueIds,
        legacyReactionIds,
        nodeReactionIds,
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
    const cachedEntries = new Map();
    const invalidCacheHitIds = [];
    const missingIds = [];

    debugReactionFlowLog('fetchReactionCardsByIds:start', {
      ids: summarizeIdsForDebug(uniqueIds),
      viewMode: viewModeRef.current,
    });

    uniqueIds.forEach(id => {
      const cached = getCard(id);
      const normalizedCached = normalizeReactionCard(cached, id);

      if (isValidCachedReactionCard(normalizedCached, id)) {
        cachedEntries.set(id, {
          ...normalizedCached,
          __fromCardCache: true,
        });
      } else {
        if (cached) invalidCacheHitIds.push(id);
        missingIds.push(id);
      }
    });

    debugReactionFlowLog('fetchReactionCardsByIds:request-backend', {
      requestedIds: summarizeIdsForDebug(uniqueIds),
      requestedIdsCount: uniqueIds.length,
      validCacheHitIds: summarizeIdsForDebug(Array.from(cachedEntries.keys())),
      validCacheHitIdsCount: cachedEntries.size,
      invalidCacheHitIds: summarizeIdsForDebug(invalidCacheHitIds),
      invalidCacheHitIdsCount: invalidCacheHitIds.length,
      backendFetchIdsCount: missingIds.length,
      missingIds: summarizeIdsForDebug(missingIds),
    });

    const usersMap = missingIds.length ? await fetchUsersByIds(missingIds) : {};

    debugReactionFlowLog('fetchReactionCardsByIds:backend-returned', {
      usersMapIds: summarizeIdsForDebug(Object.keys(usersMap || {})),
      missingUsersIds: summarizeIdsForDebug(missingIds.filter(id => !usersMap?.[id])),
    });

    const result = {};
    uniqueIds.forEach(id => {
      const selectedUser = cachedEntries.get(id) || usersMap?.[id];
      const normalizedUser = normalizeReactionCard(selectedUser, id);

      if (normalizedUser && isValidCachedReactionCard(normalizedUser, id)) {
        result[id] = normalizedUser;
      }
    });

    debugReactionFlowLog('fetchReactionCardsByIds:result', {
      requestedIds: summarizeIdsForDebug(uniqueIds),
      finalReturnedCardsCount: Object.keys(result).length,
      finalReturnedIds: summarizeIdsForDebug(Object.keys(result)),
      returnedIds: summarizeIdsForDebug(Object.keys(result)),
      missingResultIds: summarizeIdsForDebug(uniqueIds.filter(id => !result[id])),
      users: summarizeUsersForReactionDebug(Object.values(result)),
    });

    return result;
  }, []);

  const getAccessibleReactionIds = React.useCallback(async (reactionIds, accessSnapshot = {}) => {
    const uniqueIds = [...new Set((reactionIds || []).map(id => String(id || '').trim()).filter(Boolean))];
    const accessRequestKey = stableAdditionalSignature({
      ids: uniqueIds.slice().sort(),
      accessUserId: accessSnapshot.accessUserId || ownerId || getOwnerId(),
      rawRules: accessSnapshot.rawRules ?? currentAdditionalAccessRules,
      searchKeySetsOfExactUser: accessSnapshot.searchKeySetsOfExactUser ?? currentSearchKeySetKeys,
    });
    if (reactionAccessRequestsRef.current.has(accessRequestKey)) {
      debugReactionFlowLog('getAccessibleReactionIds:dedupe-hit', { inputIds: summarizeIdsForDebug(uniqueIds) });
      return reactionAccessRequestsRef.current.get(accessRequestKey);
    }

    const accessPromise = (async () => {
    const {
      legacyReactionIds,
      nodeReactionIds,
      classifications,
    } = await classifyReactionIdsByStorage(uniqueIds);

    debugReactionFlowLog('getAccessibleReactionIds:start', {
      inputIds: summarizeIdsForDebug(uniqueIds),
      legacyReactionIds: summarizeIdsForDebug(legacyReactionIds),
      nodeReactionIds: summarizeIdsForDebug(nodeReactionIds),
      classifications,
      viewMode: viewModeRef.current,
    });

    if (nodeReactionIds.length === 0) {
      debugReactionFlowLog('getAccessibleReactionIds:legacy-only-result', {
        reactionIds: summarizeIdsForDebug(legacyReactionIds),
      });
      return uniqueIds.filter(id => legacyReactionIds.includes(id));
    }

    const rawRulesForRequest = accessSnapshot.rawRules ?? currentAdditionalAccessRules;
    const parsedRulesForRequest = parseAdditionalAccessRuleGroups(rawRulesForRequest);
    if (parsedRulesForRequest.length === 0) {
      debugReactionFlowLog('getAccessibleReactionIds:no-rules-result', {
        reactionIds: summarizeIdsForDebug(uniqueIds),
      });
      return uniqueIds;
    }

    const searchKeySetsForRequest = accessSnapshot.searchKeySetsOfExactUser ?? currentSearchKeySetKeys;
    const viewerId = accessSnapshot.accessUserId || ownerId || getOwnerId();
    if (!viewerId) {
      debugReactionFlowLog('getAccessibleReactionIds:no-viewer-result', {
        reactionIds: summarizeIdsForDebug(legacyReactionIds),
        blockedNodeReactionIds: summarizeIdsForDebug(nodeReactionIds),
      });
      return uniqueIds.filter(id => legacyReactionIds.includes(id));
    }

    const resolvedSearchKeySetKeys = areSearchKeySetKeysForAccessUserId(searchKeySetsForRequest, viewerId)
      ? searchKeySetsForRequest
      : await resolveAdditionalSearchKeySetKeysForMatching(null, viewerId);

    if (!resolvedSearchKeySetKeys.length) {
      debugReactionFlowLog('getAccessibleReactionIds:no-search-key-sets-result', {
        viewerId,
        reactionIds: summarizeIdsForDebug(legacyReactionIds),
        blockedNodeReactionIds: summarizeIdsForDebug(nodeReactionIds),
      });
      return uniqueIds.filter(id => legacyReactionIds.includes(id));
    }

    debugReactionFlowLog('getAccessibleReactionIds:index-request', {
      viewerId,
      candidateUserIds: summarizeIdsForDebug(nodeReactionIds),
      searchKeySetKeysCount: resolvedSearchKeySetKeys.length,
    });

    const indexed = await checkReactionCardMembership({
      candidateUserIds: nodeReactionIds,
      searchKeySetKeys: resolvedSearchKeySetKeys,
      debugMatchingFlow: shouldDebugAdditionalMatching(viewerId),
      debugToast: (message, data) => debugAdditionalToast(viewerId, message, data),
    });
    const allowedIds = new Set(Array.isArray(indexed?.userIds) ? indexed.userIds : []);
    const allowedNodeReactionIds = nodeReactionIds.filter(id => allowedIds.has(id));
    const blockedNodeReactionIds = nodeReactionIds.filter(id => !allowedIds.has(id));
    const resultIds = uniqueIds.filter(id => legacyReactionIds.includes(id) || allowedNodeReactionIds.includes(id));
    debugReactionFlowLog('getAccessibleReactionIds:index-result', {
      indexedIds: summarizeIdsForDebug(Array.from(allowedIds)),
      allowedNodeReactionIds: summarizeIdsForDebug(allowedNodeReactionIds),
      blockedNodeReactionIds: summarizeIdsForDebug(blockedNodeReactionIds),
      reactionIds: summarizeIdsForDebug(resultIds),
    });
    return resultIds;
    })().finally(() => {
      reactionAccessRequestsRef.current.delete(accessRequestKey);
    });

    reactionAccessRequestsRef.current.set(accessRequestKey, accessPromise);
    return accessPromise;
  }, [
    classifyReactionIdsByStorage,
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    ownerId,
  ]);

  const loadSharedReactionCandidates = React.useCallback(async () => {
    const cacheEpoch = getMatchingLocalStorageCacheEpoch();
    const viewerId = ownerId || getOwnerId();
    const requestVersion = sharedReactionCandidateLoadVersionRef.current + 1;
    sharedReactionCandidateLoadVersionRef.current = requestVersion;
    const requestViewMode = viewMode;
    const canApplySharedCandidateResult = () => cacheEpoch === getMatchingLocalStorageCacheEpoch() && shouldApplySharedReactionCandidateResult({
      requestVersion,
      currentVersion: sharedReactionCandidateLoadVersionRef.current,
      requestViewMode,
      currentViewMode: viewModeRef.current,
    });

    if (!['default', 'favorites', 'dislikes'].includes(requestViewMode)) {
      setSharedReactionCandidateUsers([]);
      return;
    }

    if (requestViewMode === 'default') {
      if (canApplySharedCandidateResult()) {
        setSharedReactionCandidateUsers([]);
      }
      debugSharedReactionsLog(viewerId, 'skipped shared reaction candidate hydration for default deck');
      return;
    }

    const candidateIds = [...new Set(sharedReactionIds.filter(Boolean))];
    debugSharedReactionsLog(viewerId, 'shared reaction ids found for candidate pool', {
      sharedReactionIds: summarizeIdsForDebug(candidateIds),
    });

    if (!viewerId || candidateIds.length === 0) {
      if (canApplySharedCandidateResult()) {
        setSharedReactionCandidateUsers([]);
      }
      return;
    }

    const reactionAccessSnapshot = {
      accessUserId: viewerId,
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
        ...(reactionStorageByIdRef.current?.[user.userId] === 'nodes' ? { __matchingAccessAllowed: true } : {}),
      }));
    const loadedIds = new Set(loadedUsers.map(user => user.userId).filter(Boolean));
    const filteredInvalidIds = candidateIds.filter(id => !reactionStorageByIdRef.current?.[id]);
    const filteredByAccessIds = candidateIds.filter(id => !accessibleCandidateIds.includes(id) && reactionStorageByIdRef.current?.[id] === 'nodes');
    const missingAllowedIds = accessibleCandidateIds.filter(id => !loadedIds.has(id));
    const allowedNodeCardIds = accessibleCandidateIds.filter(id => reactionStorageByIdRef.current?.[id] === 'nodes');

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
      filteredInvalidIds: summarizeIdsForDebug(filteredInvalidIds),
      filteredByAccessOrSearchKeySets: summarizeIdsForDebug(filteredByAccessIds),
      missingAllowedCards: summarizeIdsForDebug(missingAllowedIds),
      allowedBySearchKeySetsCount: allowedNodeCardIds.length,
      id0001SelfCheck: {
        sharedReactionIdFound: candidateIds.includes(DEBUG_SHARED_CARD_ID),
        allowedBySearchKeySets: allowedNodeCardIds.includes(DEBUG_SHARED_CARD_ID),
        filteredByAccessOrSearchKeySets: filteredByAccessIds.includes(DEBUG_SHARED_CARD_ID),
        addedToCandidatePool: loadedIds.has(DEBUG_SHARED_CARD_ID),
      },
    });
  }, [
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
        ...(reactionStorageByIdRef.current?.[user.userId] === 'nodes' ? { __matchingAccessAllowed: true } : {}),
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
          ignoredFilterTypes: ['userRole', 'age', 'blood', 'reaction', 'favOnly'],
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
    fetchReactionCardsByIds,
    isAdmin,
  ]);

  const loadReactionCards = React.useCallback(async reactionType => {
    const cacheEpoch = getMatchingLocalStorageCacheEpoch();
    const isFavoritesMode = reactionType === 'favorites';
    loadInitialVersionRef.current += 1;
    additionalLoadMoreFetchVersionRef.current += 1;
    additionalMatchingApplyVersionRef.current += 1;
    reactionLoadVersionRef.current += 1;
    sharedReactionCandidateLoadVersionRef.current += 1;
    const reactionLoadVersion = reactionLoadVersionRef.current;
    const canApplyReactionLoad = () => cacheEpoch === getMatchingLocalStorageCacheEpoch() && shouldApplyReactionPageResult({
      requestVersion: reactionLoadVersion,
      currentVersion: reactionLoadVersionRef.current,
      requestViewMode: reactionType,
      currentViewMode: viewModeRef.current,
    });
    viewModeRef.current = reactionType;
    setViewMode(reactionType);
    setActiveProfileIndex(0);
    loadingRef.current = true;
    setLoading(true);
    setUsers([]);
    setSharedReactionCandidateUsers([]);
    setLastKey(null);
    setHasMore(true);
    resetReactionPaginationState(reactionType);

    debugReactionFlowLog('loadReactionCards:start', {
      reactionType,
      reactionLoadVersion,
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
        rawRules: currentAdditionalAccessRules,
        searchKeySetsOfExactUser: currentSearchKeySetKeys,
      };
      const reactionAccessSnapshotKey = buildAdditionalAccessSnapshotKey(reactionAccessSnapshot);
      const reactionIds = await getAccessibleReactionIds(fullReactionIds, reactionAccessSnapshot);
      const classifiedReaction = await classifyReactionIdsByStorage(reactionIds);
      const safeReactionIds = [...new Set([
        ...classifiedReaction.legacyReactionIds,
        ...classifiedReaction.nodeReactionIds,
      ])];
      debugReactionFlowLog('loadReactionCards:accessibleReactionIds', {
        reactionType,
        reactionIds: summarizeIdsForDebug(reactionIds),
        accessibleReactionIdsCount: reactionIds.length,
        safeReactionIdsCount: safeReactionIds.length,
        paginationInitialized: false,
        reactionPipelineReady: false,
        nodeReactionIds: summarizeIdsForDebug(classifiedReaction.nodeReactionIds),
        removedByAccessIds: fullReactionIds.filter(id => !reactionIds.includes(id)),
        reactionAccessSnapshotKey,
      });
      if (!canApplyReactionLoad()) {
        debugReactionFlowLog('loadReactionCards:stale-after-access', { reactionType, reactionLoadVersion });
        return;
      }
      setReactionPaginationByType(prev => ({
        ...prev,
        [reactionType]: {
          ids: safeReactionIds,
          nextOffset: 0,
          hasMore: safeReactionIds.length > 0,
          accessSnapshotKey: reactionAccessSnapshotKey,
        },
      }));
      setReactionPipelineReadyByType(prev => ({ ...prev, [reactionType]: true }));
      setHasMore(safeReactionIds.length > 0);
      debugReactionFlowLog('loadReactionCards:pipeline-ready', {
        reactionType,
        reactionPipelineReady: true,
        paginationInitialized: true,
        paginationIdsCount: safeReactionIds.length,
      });
      setIdsForQuery(listKey, safeReactionIds);
      if (isFavoritesMode) setFavoriteIds(favMap);

      const loadedIds = new Set();
      const page = await loadReactionCardsPage({
        reactionIds: safeReactionIds,
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

      page.users.forEach(user => { if (shouldCacheMatchingCard(user)) updateCard(user.userId, user); });
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
        reactionIds: safeReactionIds,
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
        reactionIds: summarizeIdsForDebug(safeReactionIds),
      });
      setReactionPaginationByType(prev => ({
        ...prev,
        [reactionType]: {
          ids: safeReactionIds,
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
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    classifyReactionIdsByStorage,
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

  const loadFavoriteCards = React.useCallback(() => switchMatchingMode('favorites'), [switchMatchingMode]);

  const loadDislikeCards = React.useCallback(() => switchMatchingMode('dislikes'), [switchMatchingMode]);

  // Spec §3: the collection chips are a single-choice group, so re-picking the
  // collection already on screen is a no-op rather than a toggle back to the feed.
  const handleDislikeModeClick = React.useCallback(() => {
    if (viewMode === 'dislikes') return;
    loadDislikeCards();
  }, [loadDislikeCards, viewMode]);

  const handleDefaultModeClick = React.useCallback(() => {
    if (viewMode === 'default') return;
    reloadDefault();
  }, [reloadDefault, viewMode]);

  const handleFavoriteModeClick = React.useCallback(() => {
    if (viewMode === 'favorites') return;
    loadFavoriteCards();
  }, [loadFavoriteCards, viewMode]);

  const buildMatchingSearchStatusText = React.useCallback((status, searchKey = matchingSearchKeyRef.current) => {
    const keyLabel = formatMatchingSearchKeyLabel(searchKey);
    const suffix = keyLabel ? `: ${keyLabel}` : '';

    if (status === 'found') return uiText('Знайшов у searchId{suffix}', language, { suffix });
    if (status === 'notFound') return uiText('Не знайшов у searchId{suffix}', language, { suffix });
    if (status === 'searching') return uiText('Шукаю в searchId{suffix}', language, { suffix });
    return '';
  }, [language]);

  const handleMatchingSearchKey = React.useCallback(nextSearchKey => {
    matchingSearchKeyRef.current = nextSearchKey;
    setMatchingSearchStatus(buildMatchingSearchStatusText('searching', nextSearchKey));
  }, [buildMatchingSearchStatusText]);

  const handleMatchingSearchExecuted = React.useCallback(value => {
    const normalizedValue = String(value || '').trim();
    matchingSearchKeyRef.current = null;
    setMatchingSearchStatus(normalizedValue ? uiText('Шукаю в searchId...', language) : '');
  }, [language]);

  // Історію пише лише завершений пошук: прогони на паузах у наборі тексту
  // лишили б у базі ланцюг початків одного слова.
  const handleMatchingSearchCommitted = React.useCallback(value => {
    addMatchingSearchQuery(value);
  }, []);

  const handleMatchingSearchResultStatus = React.useCallback(result => {
    const resultCount = getMatchingSearchResultCount(result);
    setMatchingSearchStatus(buildMatchingSearchStatusText(resultCount > 0 ? 'found' : 'notFound'));
  }, [buildMatchingSearchStatusText]);

  const handleMatchingSearchStateStatus = React.useCallback(nextState => {
    if (!nextState || Object.keys(nextState).length === 0) return;
    handleMatchingSearchResultStatus(nextState);
  }, [handleMatchingSearchResultStatus]);

  const handleMatchingSearchNotFound = React.useCallback(isNotFound => {
    if (isNotFound) {
      setMatchingSearchStatus(buildMatchingSearchStatusText('notFound'));
    }
  }, [buildMatchingSearchStatusText]);

  const handleMatchingSearchResults = React.useCallback(result => {
    handleMatchingSearchResultStatus(result);
    setSearchTab('results');
    void applySearchResults(result);
    // applySearchResults closes over setters and refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleMatchingSearchResultStatus]);

  // Spec §1: the feed comes back the moment the query is empty, however it got
  // there - the ✕, or the last character being deleted.
  useEffect(() => {
    if (searchQuery.trim() || viewModeRef.current !== 'search') return;
    setMatchingSearchStatus('');
    matchingSearchKeyRef.current = null;
    setSearchTab('results');
    reloadDefault();
  }, [reloadDefault, searchQuery]);

  const handleSearchCleared = React.useCallback(() => {
    setMatchingSearchStatus('');
    matchingSearchKeyRef.current = null;
    setSearchQuery('');
    setSearchTab('results');
    reloadDefault();
  }, [reloadDefault]);

  const handleMatchingSearchError = React.useCallback(() => {
    setMatchingSearchStatus(uiText('Не вдалося виконати пошук. Спробуйте ще раз.', language));
  }, [language]);

  const searchUsers = async (params, options = {}) => {
    const cacheEpoch = getMatchingLocalStorageCacheEpoch();
    const canWriteMatchingCache = () => cacheEpoch === getMatchingLocalStorageCacheEpoch();
    // A limited hit is a projection, not a record. It never touches the shared card
    // cache in either direction: reading from it would hand back a full record the
    // viewer isn't entitled to, and writing to it would overwrite real cards with
    // five fields.
    const isLimited = Boolean(options?.limitedFields);
    const isCardsOnly = Boolean(options?.cardsOnly);
    const [key, value] = Object.entries(params)[0] || [];
    const term = key && value ? `${key}=${value}` : undefined;
    const cacheKey = key && value
      ? getSearchCacheKeyForParams(key, value, options)
      : getCacheKey('search', term ? normalizeQueryKey(term) : term);
    // Та сама форма, що й у `searchUsersOnly`: один збіг — картка, кілька —
    // мапа. Раніше все, крім `name`, згорталось у `cards[0]`, і кеш віддавав
    // одну анкету там, де запит знайшов кілька — а по імені в індексі
    // `searchId` кілька збігів це норма, а не виняток.
    const asSearchResult = cards => {
      if (cards.length === 1 && key !== 'name' && key !== 'names') return cards[0];
      return Object.fromEntries(cards.map(c => [c.userId, c]));
    };

    if (!isLimited) {
      const ids = getIdsByQuery(cacheKey).filter(isMatchingCardId);
      if (ids.length > 0) {
        const cards = ids.map(id => getCard(id)).filter(c => c && isMatchingCardId(c.userId));
        if (cards.length > 0) return asSearchResult(cards);
      }
    }

    /**
     * Видача `cardsOnly` має власний кеш — і доти, доки його не було, той самий
     * запит щоразу коштував стільки ж, скільки перший.
     *
     * Причина, чому вона не потрапляла в загальний кеш карток, лишається в силі:
     * проєкцію не можна класти в `cards`, інакше вона замістить повну анкету
     * десятком полів. Але в проєкцій є власне сховище (`matchingSummaryCards`),
     * а списки id уміє тримати кеш індексних запитів. Разом це рівно те, що
     * потрібно: id запиту + картки під ними, обидва на ті самі шість годин.
     *
     * Неповний кеш не викидається: id, чиєї проєкції бракує, догідратовуються
     * тим самим шляхом, що й сторінка стрічки, — тобто з бекенду читаються
     * рівно вони, а не вся видача заново.
     *
     * Список id живе доти, доки хтось не змінить анкету: створення, збереження
     * й видалення скидають його цілком (`clearMatchingSearchResultCache`) —
     * інакше щойно заведена анкета не знаходилась би до вечора.
     */
    const summaryCacheKey = isCardsOnly && !isLimited
      ? buildMatchingSearchResultCacheKey(cacheKey)
      : null;
    if (summaryCacheKey) {
      const cachedEntry = getIndexIdsByQuery(summaryCacheKey);
      const cachedIds = (cachedEntry?.ids || []).filter(isMatchingCardId);
      if (cachedIds.length > 0) {
        const hydrated = await hydrateMatchingFeedCards(cachedIds);
        const cards = cachedIds.map(id => hydrated?.[id]).filter(Boolean);
        if (cards.length === cachedIds.length) {
          incrementMatchingLoadStat('matchingSearchCacheHits', cards.length);
          return asSearchResult(cards);
        }
      }
    }

    const res = await searchUsersOnly(params, options);
    if (res && Object.keys(res).length > 0) {
      const arr = Array.isArray(res)
        ? res
        : res.userId
          ? [res]
          : Object.values(res);
      const filtered = arr.filter(u => isMatchingCardId(u?.userId));
      if (!isLimited && canWriteMatchingCache()) {
        // Проєкція в кеш не лягає — та сама сторожа, що й на всіх шляхах
        // стрічки. Інакше вона замістила б повну картку своїми десятьма
        // полями, і `surname` назавжди лишився б ініціалом: `updateCard`
        // зливає нове поверх старого, а `sanitizeMatchingCardForCache` знімає
        // з картки позначку `__matchingSummary`, тож догідратувати таку вже
        // нема за чим.
        const cacheable = filtered.filter(shouldCacheMatchingCard);
        cacheable.forEach(u => updateCard(u.userId, u));
        // Список id запиту пишеться лише разом із самими картками. Записати id
        // без карток означало б, що наступний той самий запит візьме з кеша
        // рівно ту їх частину, яка потрапила туди іншим шляхом, — і мовчки
        // віддасть менше, ніж знайшов.
        if (cacheable.length === filtered.length) {
          setIdsForQuery(cacheKey, filtered.map(u => u.userId));
        }
      }
      // Проєкції видачі лягають у своє сховище, а список id — під ключ запиту.
      // Обидва записи роблять наступний той самий пошук безкоштовним.
      if (summaryCacheKey && filtered.length && canWriteMatchingCache()) {
        setCachedMatchingSummaryCards(Object.fromEntries(
          filtered.filter(isMatchingSummaryCard).map(u => [u.userId, u]),
        ));
        setIndexIdsForQuery(summaryCacheKey, filtered.map(u => u.userId), { complete: true });
      }
      if (Array.isArray(res)) return filtered;
      if (res.userId) return filtered[0] || {};
      return Object.fromEntries(filtered.map(u => [u.userId, u]));
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
    const cacheEpoch = getMatchingLocalStorageCacheEpoch();
    const isReactionViewMode = viewMode === 'favorites' || viewMode === 'dislikes';
    const commonDebug = {
      ownerId: getOwnerId(),
      viewMode,
      loadedIdsCount: loadedIdsRef.current.size,
      visibleUsersCount: Number(usersRef.current?.length || 0),
      hasMore,
      lastKey,
      loadingState: loading,
      loadingRefState: loadingRef.current,
      extra: {
        targetVisibleCount,
        currentVisibleCount,
        requestedLimitInput: limit,
      },
    };
    const markBlockedLoadMore = (stopReason, details = {}) => {
      const blockedStats = {
        ...matchingLastCardsDebugStatsRef.current,
        stage: 'loadMore-blocked',
        stopReason,
        hasMore: Boolean(hasMore),
        sourceHasMore: Boolean(hasMore),
        requestedVisible: Number(targetVisibleCount) || 0,
        timestamp: new Date().toISOString(),
      };
      matchingLastCardsDebugStatsRef.current = blockedStats;
      writeMatchingDebugLog('cards:loadMore-blocked-summary', {
        ...blockedStats,
        ownerId: getOwnerId(),
        viewMode,
        details,
      });
    };
    writeMatchingDebugLog('loadMore:start', buildLoadMoreDebugPayload(commonDebug));
    // Без читача деку збирати нема з чого: правила бази відкривають навіть
    // картку лише авторизованому. Запит без uid — це не порожня сторінка, а
    // `Permission denied`, і `hasMore` після нього лишався `true`: довантаження
    // питало знову, і незалогінена вкладка слала десятки запитів на секунду в
    // нескінченному циклі, показуючи людині вічний скелетон. Межа входу стоїть
    // на маршруті (`RequireAuth`), а це — той самий висновок у самому читачі:
    // сесія протухає і посеред перегляду, вже після монтування екрана.
    if (!getOwnerId()) {
      markBlockedLoadMore('blocked-no-viewer', { guard: 'no signed-in viewer' });
      writeMatchingDebugLog('loadMore:blocked:noViewer', buildLoadMoreDebugPayload(commonDebug));
      hasMoreRef.current = false;
      additionalHasMoreRef.current = false;
      setHasMore(false);
      setAdditionalHasMore(false);
      loadingRef.current = false;
      loadingStateRef.current = false;
      setLoading(false);
      return 0;
    }
    if (!hasMoreRef.current && !(viewMode === 'default' && additionalHasMoreRef.current)) {
      markBlockedLoadMore('blocked-no-hasMore', { guard: 'hasMore === false' });
      writeMatchingDebugLog('loadMore:blocked:noHasMore', buildLoadMoreDebugPayload(commonDebug));
      return;
    }
    if (loadingRef.current) {
      markBlockedLoadMore('blocked-loading-ref-true', { guard: 'loadingRef.current === true' });
      writeMatchingDebugLog('loadMore:blocked:alreadyLoading', buildLoadMoreDebugPayload(commonDebug));
      return;
    }
    if (viewMode !== 'default' && !isReactionViewMode) {
      markBlockedLoadMore('blocked-unsupported-view-mode', { guard: 'viewMode guard', viewMode });
      writeMatchingDebugLog('loadMore:blocked:staleRequest', buildLoadMoreDebugPayload({
        ...commonDebug,
        extra: { ...commonDebug.extra, reason: 'unsupported-view-mode' },
      }));
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
    const requestViewMode = viewMode;
    const requestFiltersSignature = stableAdditionalSignature(filtersRef.current || {});
    const isLatestLoadMore = () => (
      loadMoreVersion === additionalLoadMoreFetchVersionRef.current &&
      applyVersion === additionalMatchingApplyVersionRef.current &&
      cacheEpoch === getMatchingLocalStorageCacheEpoch()
    );
    const canApplyLoadMoreResult = () => (
      isLatestLoadMore() &&
      shouldApplyReactionPageResult({
        requestVersion: applyVersion,
        currentVersion: additionalMatchingApplyVersionRef.current,
        requestViewMode,
        currentViewMode: viewModeRef.current,
      })
    );
    const canApplyLoadMoreResultWithFilters = () => canApplyLoadMoreResult() && requestFiltersSignature === stableAdditionalSignature(filtersRef.current || {});
    const logStaleLoadMoreResultIgnored = (stage, details = {}) => {
      console.log('[Matching] staleLoadMoreResultIgnored', {
        stage,
        requestFiltersSignature,
        currentFiltersSignature: stableAdditionalSignature(filtersRef.current || {}),
        ...details,
      });
    };
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
        const reactionPipelineReady = reactionPipelineReadyByType[viewMode];
        const currentPagination = reactionPaginationByType[viewMode] || buildEmptyReactionPagination();
        const reactionMapIds = Object.keys(reactionMap);
        debugReactionFlowLog('loadMore:reaction-start', {
          viewMode,
          reactionPipelineReady,
          paginationInitialized: Boolean(currentPagination.ids.length || currentPagination.accessSnapshotKey),
          paginationIdsCount: currentPagination.ids.length,
          reactionMap: summarizeReactionMapForDebug(reactionMap),
          currentPagination,
          requestedLimit,
          targetVisibleCount,
          currentVisibleCount,
        });
        if (!reactionPipelineReady) {
          debugReactionFlowLog('loadMore:reaction-skipped', {
            viewMode,
            loadReactionCardsPageSkippedReason: 'pipeline-not-ready',
          });
          return 0;
        }
        // Права глядача з правилами доступу могли змінитись — перечитуємо їх
        // перед сторінкою реакцій.
        const shouldRefreshReactionIds = parsedAdditionalAccessRules.length > 0;
        const freshProfileCache = shouldRefreshReactionIds
          ? await ensureFreshAdditionalMatchingProfile({
            accessUserId: ownerId,
            reason: `load-more-${viewMode}-reaction-access`,
          })
          : null;

        if (!canApplyLoadMoreResultWithFilters()) { logStaleLoadMoreResultIgnored('reaction-branch'); return; }

        const reactionAccessSnapshot = {
          accessUserId: ownerId || getOwnerId(),
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
        const classifiedReaction = await classifyReactionIdsByStorage(reactionIds);
        const safeReactionIds = [...new Set([
          ...classifiedReaction.legacyReactionIds,
          ...classifiedReaction.nodeReactionIds,
        ])];
        debugReactionFlowLog('loadMore:reactionIds', {
          viewMode,
          reactionIds: summarizeIdsForDebug(safeReactionIds),
          accessibleReactionIdsCount: reactionIds.length,
          paginationIdsCount: currentPagination.ids.length,
          didAccessSnapshotChange,
          shouldRefreshReactionIds,
          reactionAccessSnapshotKey,
          nodeReactionIds: summarizeIdsForDebug(classifiedReaction.nodeReactionIds),
        });

        if (!canApplyLoadMoreResultWithFilters()) { logStaleLoadMoreResultIgnored('reaction-branch'); return; }

        const loadedIds = didAccessSnapshotChange
          ? new Set()
          : (reactionLoadedIdsRef.current[viewMode] || new Set());
        const page = await loadReactionCardsPage({
          reactionIds: safeReactionIds,
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

        if (!canApplyLoadMoreResultWithFilters()) { logStaleLoadMoreResultIgnored('reaction-branch'); return; }

        page.users.forEach(user => { if (shouldCacheMatchingCard(user)) updateCard(user.userId, user); });
        if (!canApplyLoadMoreResultWithFilters()) { logStaleLoadMoreResultIgnored('reaction-branch'); return; }
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
          reactionIds: safeReactionIds,
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
          reactionIds: summarizeIdsForDebug(safeReactionIds),
        });
        setReactionPaginationByType(prev => ({
          ...prev,
          [viewMode]: {
            ids: safeReactionIds,
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

      // The scoped source is paged just like the public feed. Read only the
      // next deck-sized page; never drain the entire additional-access index
      // on initial load or after a filter change.
      // Public pagination owns its two-card quota. Access-scoped cards are a
      // separate deck source and may only page after matchingCards is truly
      // exhausted; otherwise two local/scoped cards could consume a cycle
      // without adding the two promised public cards.
      if (!hasMoreRef.current && additionalHasMoreRef.current && parsedAdditionalAccessRules.length > 0) {
        const scopedUsers = [];
        const publicIds = new Set(usersRef.current.map(user => user?.userId).filter(Boolean));
        const scopedIds = new Set(additionalAccessUsersRef.current.map(user => user?.userId).filter(Boolean));
        let scopedOffset = additionalNextOffsetRef.current;
        let scopedPageCalls = 0;

        // A sparse index page may hydrate fewer cards than requested. Keep the
        // same promised batch alive while the scoped source can still advance.
        while (scopedUsers.length < requestedLimit && additionalHasMoreRef.current && scopedPageCalls < MATCHING_MAX_PAGES_PER_LOAD) {
          scopedPageCalls += 1;
          const scopedPage = await fetchAdditionalAccessUsersBySearchIndex({
            rawRules: currentAdditionalAccessRules,
            accessUserId: ownerId,
            searchKeySetKeys: normalizeSearchKeySetKeys(currentSearchKeySetKeys),
            filters: filtersRef.current || {},
            excludeIds: [...baseExclude, ...publicIds, ...scopedIds],
            offset: scopedOffset,
            limit: requestedLimit - scopedUsers.length,
            fetchUsersByIds: fetchLimitedProfilesByIdsForMatching,
            shouldDebugAdditionalMatching,
            debugAdditionalToast,
            logAdditionalMatchingDebug,
          });
          if (!canApplyLoadMoreResultWithFilters()) {
            logStaleLoadMoreResultIgnored('additional-access-page');
            return;
          }

          const nextOffset = Number(scopedPage.nextOffset) || scopedOffset;
          additionalHasMoreRef.current = Boolean(scopedPage.hasMore && nextOffset > scopedOffset);
          (scopedPage.users || []).forEach(user => {
            if (!user?.userId || !normalizePublish(user.publish) || publicIds.has(user.userId) || scopedIds.has(user.userId)) return;
            scopedIds.add(user.userId);
            scopedUsers.push({ ...user, __matchingAccessAllowed: true });
          });
          scopedOffset = nextOffset;
        }

        setAdditionalHasMore(additionalHasMoreRef.current);
        setAdditionalNextOffset(scopedOffset);
        if (scopedUsers.length) {
          setAdditionalAccessUsers(prev => {
            const byId = new Map(prev.map(user => [user.userId, user]));
            scopedUsers.forEach(user => byId.set(user.userId, user));
            return Array.from(byId.values());
          });
          void loadCommentsFor(scopedUsers);
        }
        return scopedUsers.length;
      }

      const activeIndexFilterGroups = buildMatchingIndexFilterGroups({
        filters: filtersRef.current || {},
      });
      if (activeIndexFilterGroups.length > 0) {
        const indexedPage = await collectMatchingIndexedLoadMorePage({
          requestedLimit,
          initialOffset: Number(lastKey) || 0,
          maxPages: MATCHING_INDEXED_LOAD_MORE_MAX_PAGES,
          baseExclude,
          loadedIds: loadedIdsRef.current,
          filters: filtersRef.current || {},
          viewMode,
          ownerId: getOwnerId(),
          viewerRole: currentUserRoleRef.current,
          viewerId: getOwnerId(),
          fetchMatchingIndexedCandidates,
          hydrateUsersByIds: hydrateMatchingFeedCards,
          isLatestLoadMore: canApplyLoadMoreResultWithFilters,
        });
        if (indexedPage.stale) { logStaleLoadMoreResultIgnored('indexed-collect', { reason: indexedPage.staleReason || 'stale' }); return; }

        // Індексного плану могло не скластись: набір фільтрів на кшталт «крім
        // Агентства» вміє лише відкидати, тож індекс не називає жодного id.
        // `loadInitial` у цьому місці давно віддає деку послідовній пагінації;
        // тут же порожня відповідь застосовувалась як справжня — `hasMore`
        // ставав `false`, і загальна стрічка обривалась на першому ж фільтрі.
        // На екрані лишались тільки власні картки, які приходять іншими
        // конвеєрами, — «з фільтрами знову лише свої чернетки».
        if (!indexedPage.deferToSourcePagination) {
          if (indexedPage.cursorStuck) {
            console.warn('[Matching][indexedProvider] stopped loadMore because indexed cursor did not move', {
              finalIndexedOffset: indexedPage.finalOffset,
              indexedPageCalls: indexedPage.pageCalls,
              stopReason: indexedPage.stopReason,
            });
          }

          const visibleAfterAppend = Number(usersRef.current?.length || 0) + indexedPage.collected.length;
          console.log('[Matching][indexedProvider] loadMore diagnostics', {
            indexedIdsCount: indexedPage.indexedIdsCount,
            paginationInputIdsCount: indexedPage.paginationInputIdsCount,
            pageIdsCount: indexedPage.pageIdsCount,
            fetchedCardsCount: indexedPage.fetchedCardsCount,
            safetyFilteredOutCount: indexedPage.safetyFilteredOutCount,
            appendedCardsCount: indexedPage.collected.length,
            visibleCardsAfterAppend: visibleAfterAppend,
            hasMoreAfterAppend: Boolean(indexedPage.finalHasMore && !indexedPage.cursorStuck),
            refillBlockedReason: '',
          });
          indexedPage.collected.forEach(user => { if (shouldCacheMatchingCard(user)) updateCard(user.userId, user); });
          if (!canApplyLoadMoreResultWithFilters()) {
            logStaleLoadMoreResultIgnored('indexed-page-apply', {
              fetchedIds: indexedPage.collected.map(user => user.userId).filter(Boolean),
            });
            return;
          }
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
          const indexedHasMore = Boolean(indexedPage.finalHasMore && !indexedPage.cursorStuck);
          setHasMore(indexedHasMore);
          if (usersRef.current.length + indexedPage.collected.length >= INITIAL_LOAD || !indexedHasMore) {
            setInitialPublicWindowComplete(true);
          }
          return indexedPage.collected.length;
        }

        console.info('[Matching][indexedProvider] index plan unavailable; falling back to source pagination', {
          reason: indexedPage.deferReason || 'index-plan-unavailable',
          activeIndexFilterGroups: activeIndexFilterGroups.map(group => group.indexName),
        });
      }

      const collected = [];
      let cursor = Number.isFinite(Number(lastKey)) ? null : lastKey;
      let canLoadMore = hasMore;
      let loadedChunkCalls = 0;
      let stopReason = '';
      let sourceExhausted = false;
      writeMatchingDebugLog('loadMore:fetch:start', buildLoadMoreDebugPayload({
        ...commonDebug,
        requestVersion: applyVersion,
        extra: { requestedLimit, cursor },
      }));

      while (collected.length < requestedLimit && canLoadMore && loadedChunkCalls < MATCHING_MAX_PAGES_PER_LOAD) {
        loadedChunkCalls += 1;
        const remaining = requestedLimit - collected.length;
        const dynamicExclude = new Set([
          ...baseExclude,
          ...loadedIdsRef.current,
          ...collected.map(u => u.userId).filter(Boolean),
        ]);
        const res = await fetchChunk(remaining, cursor, dynamicExclude);
        if (!isLatestLoadMore()) {
          writeMatchingDebugLog('loadMore:blocked:staleRequest', buildLoadMoreDebugPayload({
            ...commonDebug,
            requestVersion: applyVersion,
            extra: { loadMoreVersion, latestLoadMoreVersion: additionalLoadMoreFetchVersionRef.current },
          }));
          console.log('[loadMore] ignored stale default batch result', {
            loadMoreVersion,
            latestLoadMoreVersion: additionalLoadMoreFetchVersionRef.current,
            applyVersion,
            latestApplyVersion: additionalMatchingApplyVersionRef.current,
          });
          return;
        }
        writeMatchingDebugLog('loadMore:fetch:result', buildLoadMoreDebugPayload({
          ...commonDebug,
          requestVersion: applyVersion,
          lastKey: res.lastKey,
          extra: {
            sourceCardsCount: res.sourceCardsCount || 0,
            filteredCardsCount: res.filteredCardsCount || 0,
            emittedCardsCount: res.emittedCardsCount || 0,
            loadedPages: res.loadedPages || 0,
            stopReason: res.stopReason || '',
            sourceHasMore: Boolean(res.sourceHasMore),
            hasMore: Boolean(res.hasMore),
            fetchedCount: Array.isArray(res.users) ? res.users.length : 0,
          },
        }));
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
        const loadMoreStats = {
          requestedVisible: remaining,
          sourceCardsCount: Number(res.sourceCardsCount || 0),
          filteredCardsCount: Number(res.filteredCardsCount || 0),
          emittedCardsCount: Number(res.emittedCardsCount || 0),
          filteredOutCount: Math.max(0, Number(res.sourceCardsCount || 0) - Number(res.filteredCardsCount || 0)),
          visibleReturnedCount: Number(res.users?.length || 0),
          excludedCount: Number(res.excludedCount || 0),
          loadedPages: Number(res.loadedPages || 0),
          stopReason: res.stopReason || '',
          hasMore: Boolean(res.hasMore),
          sourceHasMore: Boolean(res.sourceHasMore),
        };
        sourceExhausted = sourceExhausted
          || res.stopReason === 'source_exhausted'
          || res.stopReason === 'no_visible_cards_added';
        matchingLastCardsDebugStatsRef.current = {
          ...loadMoreStats,
          stage: 'loadMore',
          timestamp: new Date().toISOString(),
        };
        writeMatchingDebugLog('cards:loadMore-batch-summary', loadMoreStats);

        const unique = res.users.filter(
          u => u?.userId && !loadedIdsRef.current.has(u.userId)
        );
        if (unique.length) {
          collected.push(...unique);
        }

        const stuck = !res.lastKey || isSameMatchingCursor(res.lastKey, cursor);
        if (stuck && !res.lastKey) stopReason = 'no-cursor';
        if (stuck && res.lastKey && isSameMatchingCursor(res.lastKey, cursor)) stopReason = 'cursor-not-advanced';
        if (!res.hasMore && !stopReason) stopReason = res.stopReason || 'source-has-no-more';
        cursor = res.lastKey;
        canLoadMore = res.hasMore && !stuck;
      }
      if (!stopReason) {
        if (collected.length >= requestedLimit) stopReason = 'requested-visible-reached';
        else if (!canLoadMore) stopReason = 'hasMore-false';
        else if (loadedChunkCalls >= MATCHING_MAX_PAGES_PER_LOAD) stopReason = 'max-pages-reached';
      }

      collected.forEach(u => { if (shouldCacheMatchingCard(u)) updateCard(u.userId, u); });
      if (!canApplyLoadMoreResultWithFilters()) {
        logStaleLoadMoreResultIgnored('default-source-apply', {
          fetchedIds: collected.map(u => u.userId).filter(Boolean),
        });
        return;
      }
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
      if (
        viewMode === 'default'
        && (usersRef.current.length + collected.length >= INITIAL_LOAD || sourceExhausted || !canLoadMore)
      ) {
        setInitialPublicWindowComplete(true);
      }
      writeMatchingDebugLog('loadMore:emit', buildLoadMoreDebugPayload({
        ...commonDebug,
        requestVersion: applyVersion,
        lastKey: cursor,
        hasMore: canLoadMore,
        extra: {
          emittedCardsCount: collected.length,
          loadedChunkCalls,
          stopReason,
        },
      }));
      matchingLastCardsDebugStatsRef.current = {
        ...matchingLastCardsDebugStatsRef.current,
        stage: 'loadMore',
        stopReason: stopReason || 'completed',
        loadedPages: loadedChunkCalls,
        visibleReturnedCount: collected.length,
        hasMore: Boolean(canLoadMore),
        timestamp: new Date().toISOString(),
      };
      writeMatchingDebugLog('loadMore:completed', buildLoadMoreDebugPayload({
        ...commonDebug,
        requestVersion: applyVersion,
        lastKey: cursor,
        hasMore: canLoadMore,
        extra: { stopReason, loadedChunkCalls, emittedCardsCount: collected.length },
      }));
      return collected.length;
    } catch (error) {
      writeMatchingDebugLog('loadMore:error', buildLoadMoreDebugPayload({
        ...commonDebug,
        extra: {
          message: error?.message || String(error),
        },
      }), error);
      throw error;
    } finally {
      finishLoadMoreIfLatest();
      lastCardInFlightTriggerSignatureRef.current = '';
      lastCardLoadTriggerSignatureRef.current = '';
    }
  }, [
    currentAdditionalAccessRules,
    currentSearchKeySetKeys,
    ensureFreshAdditionalMatchingProfile,
    defaultListKey,
    fetchChunk,
    classifyReactionIdsByStorage,
    getAccessibleReactionIds,
    hasMore,
    hydrateMatchingFeedCards,
    loading,
    lastKey,
    loadCommentsFor,
    ownerId,
    loadReactionCardsPage,
    reactionPaginationByType,
    reactionPipelineReadyByType,
    parsedAdditionalAccessRules.length,
    sharedReactionIds,
    viewMode,
  ]);

  /**
   * Роль, під яку зібрано деку, — підписом, а не посиланням.
   *
   * Роль читача приїжджає двічі: з відповіді на профіль доступу і з наступного
   * оновлення того самого профілю. Значення те саме, а масив щоразу новий
   * (`['ag', 'ed']`), і порівняння по посиланню читало це як зміну ролі: кеш
   * скидався, стрічка вантажилась удруге — скелетон → картки → скелетон →
   * картки. `null` тут означає «деку ще не вантажили» й лишається окремим від
   * порожньої ролі: у читача без ролі підпис теж порожній, а деку йому все
   * одно треба зібрати.
   */
  const initialRoleLoadedRef = useRef(null);
  useEffect(() => {
    if (!currentUserRoleResolved) return;
    const nextRoleSignature = viewerRoleSignature(currentUserRole);
    const previousRole = initialRoleLoadedRef.current;
    if (previousRole === nextRoleSignature) return;
    initialRoleLoadedRef.current = nextRoleSignature;
    if (previousRole !== null) {
      clearMatchingCache('matching viewer role changed');
      clearMatchingCardsPageInFlight();
    }
    // Role visibility applies only to the default deck. In particular, a profile
    // response must not replace a search submitted while that response was pending.
    if (viewModeRef.current !== 'default') return;
    reloadDefault();
    // reloadDefault is intentionally not a dependency: mode/source switches call explicit handlers,
    // while reaction-state changes must not retrigger the default deck loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserRole, currentUserRoleResolved]);

  // Лічильник публічних карток має рахувати те саме, що видно на екрані:
  // інакше цикл відліку обіцяв би дві картки, а дорахувати їх на екрані було б
  // нічим — картки колег до нього не доходять.
  const publicVisibleUsers = useMemo(() => keepDonorCounterpartyCards({
    users: applyMatchingUiFiltersToUsers({
      users,
      filters,
      filterMainFn: filterMain,
      favoriteUsers,
      dislikeUsers,
      excludeReactionUsers: viewMode === 'default',
      keepReactedUserIds: stickyReactedUserIds,
      roleIndexSets,
      viewMode,
    }),
    viewerRole: viewMode === 'default' ? currentUserRole : '',
    viewerId: ownerId,
  }), [currentUserRole, dislikeUsers, favoriteUsers, filters, ownerId, roleIndexSets, stickyReactedUserIds, users, viewMode]);

  /**
   * Власна чернетка, яку питали по імені чи контакту, — теж відповідь пошуку.
   *
   * Чернетки немає в `searchId`, тож жоден запит її не знаходить, і людина,
   * яка щойно завела картку з цієї ж видачі, поверталась у видачу без неї:
   * екран відповідав «такої немає» на те, що вона сама щойно створила. Доливати
   * ж у видачу **всі** власні чернетки не можна — це показало б читачеві його
   * ж картки замість тієї людини, яку він шукав, і порахувало б їх у
   * «Знайдено N». Тож сюди потрапляють лише ті, що збіглися з набраним, — тим
   * самим розпізнавачем поля, що й сам пошук.
   */
  const personalDraftSearchMatches = useMemo(() => {
    if (viewMode !== 'search') return EMPTY_USERS;
    const detected = detectSearchParams(searchQuery.trim());
    if (!detected?.key) return EMPTY_USERS;
    const matches = findMatchingProfileMutations(
      personalCreateProfiles.map(profile => ({ cardId: profile.userId, data: profile })),
      detected,
    );
    return matches.length ? matches.map(item => item.data) : EMPTY_USERS;
  }, [personalCreateProfiles, searchQuery, viewMode]);

  const visibleUsers = useMemo(() => mergeMatchingCandidateUsers({
    // Власні щойно створені анкети видно завжди — вони не чекають на
    // погодження адміном, щоб зʼявитись у власника в стрічці. Але стрічка — це
    // не результати пошуку: доливати їх до відповіді на запит означає показати
    // читачеві його ж чернетки замість того, кого він шукав, і ще й порахувати
    // їх у «Знайдено N».
    //
    // Чернетки йдуть **перед** декою, а не після неї. Хвіст списку належить
    // пагінації: саме туди дивиться читач, коли чекає на порцію, і саме там
    // стоять відлік і сентинел. Поки чернетки лежали в хвості, дописана
    // сторінка лягала над ними — унизу нічого не змінювалось, і приріст
    // знаходився тільки прокруткою вгору. Чернетки ж не пагінуються: їх
    // фіксована жменя, і місце їм на початку, як власним карткам.
    users: viewMode === 'search'
      ? [...personalDraftSearchMatches, ...users]
      : [...(initialPublicWindowComplete ? personalCreateProfiles : EMPTY_USERS), ...users],
    additionalAccessUsers,
    sharedReactionCandidateUsers,
    isAdmin,
    viewMode,
    hasAdditionalAccessRules: parsedAdditionalAccessRules.length > 0,
    ownFavoriteUsers,
    ownDislikeUsers,
    favoriteUsers,
    dislikeUsers,
    viewerRole: currentUserRole,
    viewerId: ownerId,
    // Реакція прибирає картку двічі — тут і в `applyMatchingUiFiltersToUsers`,
    // — тож набір «відповіли просто зараз» мусять знати обидва прибирання.
    // Поки його знало лише друге, картка все одно зникала з-під пальця: до
    // фільтрів вона просто не доходила.
    keepReactedUserIds: stickyReactedUserIds,
  }), [
    additionalAccessUsers,
    dislikeUsers,
    favoriteUsers,
    ownDislikeUsers,
    ownFavoriteUsers,
    isAdmin,
    initialPublicWindowComplete,
    parsedAdditionalAccessRules,
    personalDraftSearchMatches,
    sharedReactionCandidateUsers,
    stickyReactedUserIds,
    users,
    personalCreateProfiles,
    viewMode,
    currentUserRole,
    ownerId,
  ]);

  const reactionTabUsers = useMemo(() => {
    if (viewMode !== 'favorites' && viewMode !== 'dislikes') return [];

    const reactionMap = viewMode === 'favorites' ? favoriteUsers : dislikeUsers;
    const reactionIds = Object.keys(normalizeReactionMap(reactionMap));
    if (!reactionIds.length) return [];

    const candidateUsersById = new Map();
    [
      ...users,
      ...additionalAccessUsers,
      ...sharedReactionCandidateUsers,
      ...personalCreateProfiles,
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
    additionalAccessUsers,
    dislikeUsers,
    favoriteUsers,
    isAdmin,
    personalCreateProfiles,
    sharedReactionCandidateUsers,
    users,
    viewMode,
  ]);

  useEffect(() => {
    if (!initialRequestId) return undefined;
    const requestId = initialRequestId;

    const slowLoadTimer = setTimeout(() => {
      if (requestId !== initialRequestIdRef.current || !loadingStateRef.current) return;
      const mode = viewModeRef.current || viewMode || 'unknown';
      toast(
        `Matching: не вдалося отримати дані протягом 5 секунд. Режим: ${mode}. Перевірте мережу, Firebase rules та індекси.`,
        {
          id: 'matching-slow-load',
          icon: '⚠️',
          duration: 10000,
        },
      );
    }, 5000);

    return () => {
      clearTimeout(slowLoadTimer);
      toast.dismiss('matching-slow-load');
    };
    // The deadline belongs to the request id; mutable refs provide diagnostic context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRequestId]);

  useEffect(() => {
    if (initialRequestId && !loading) toast.dismiss('matching-slow-load');
  }, [initialRequestId, loadError, loading]);

  // Spec §10: one `filtered` array feeds the list, the gallery and the detail
  // layer, and it is computed once per input change rather than on every render.
  // Уся видача після дофільтра. Числа рядка й «Знайдено» рахуються по ній, а не
  // по тому, що встигло потрапити на екран: інакше чіп обіцяв би «31–33 · 2».
  const searchRefinedUsers = useMemo(
    () => (viewMode === 'search' ? applyRefineSelection(visibleUsers, refineKey, searchRefineValue) : EMPTY_USERS),
    [refineKey, searchRefineValue, viewMode, visibleUsers],
  );

  useEffect(() => {
    const total = searchRefinedUsers.length;
    searchRevealTargetRef.current = total;
    setSearchHasMore(viewMode === 'search' && searchRevealCount < total);
  }, [searchRefinedUsers, searchRevealCount, viewMode]);

  const filteredUsers = useMemo(() => {
    if (viewMode === 'favorites' || viewMode === 'dislikes') return reactionTabUsers;
    if (debugShowAllIndexedCards && isIndexedDebugTestUser) return users;
    // Пошук — не стрічка, і фільтри його не звужують. Чіпи описують, кого
    // показувати в деці; запит називає конкретну людину, і сховати її через
    // те, що вона не того типу, означає відповісти «немає» на питання «де
    // ось цей». Саме так пошук і виглядав зламаним: статус казав «Знайшов у
    // searchId», а під ним стояло «Немає доступних профілів».
    //
    // Показується не вся видача, а її вікно: 400 знайдених — це 400 рядків у
    // DOM і стільки ж гідратацій, і саме тому пошук не мав ані відліку, ані
    // способу дочекатись кінця списку.
    if (viewMode === 'search') return searchRefinedUsers.slice(0, searchRevealCount);
    return applyMatchingUiFiltersToUsers({
      users: visibleUsers,
      filters,
      filterMainFn: filterMain,
      favoriteUsers,
      dislikeUsers,
      excludeReactionUsers: viewMode === 'default',
      keepReactedUserIds: stickyReactedUserIds,
      roleIndexSets,
      viewMode,
    });
  }, [
    debugShowAllIndexedCards,
    dislikeUsers,
    favoriteUsers,
    filters,
    isIndexedDebugTestUser,
    reactionTabUsers,
    roleIndexSets,
    searchRefinedUsers,
    searchRevealCount,
    stickyReactedUserIds,
    users,
    viewMode,
    visibleUsers,
  ]);
  // Counted off the already-loaded cache, so every chip tap in the drawer
  // updates the number instantly and without touching Firebase (spec §10).
  const draftFilteredCount = useMemo(() => {
    if (!showFilters) return 0;
    if (viewMode === 'favorites' || viewMode === 'dislikes') return reactionTabUsers.length;
    return applyMatchingUiFiltersToUsers({
      users: visibleUsers,
      filters: draftFilters,
      filterMainFn: filterMain,
      favoriteUsers,
      dislikeUsers,
      excludeReactionUsers: viewMode === 'default',
      roleIndexSets,
      viewMode,
    }).length;
  }, [
    dislikeUsers,
    draftFilters,
    favoriteUsers,
    reactionTabUsers.length,
    roleIndexSets,
    showFilters,
    viewMode,
    visibleUsers,
  ]);

  const isSearching = searchQuery.trim().length > 0;

  // Spec §3's "Схожі": a second pass over what this device already holds, so the
  // chip's count is honest without another round trip.
  const similarUsers = useMemo(() => {
    if (!isSearching) return [];
    const candidates = findCachedCardsByText(searchQuery, {
      excludeIds: filteredUsers.map(user => user?.userId).filter(Boolean),
    });
    // «Схожі» — та сама відповідь на запит, тільки з локального кешу, тож і
    // правило те саме: чіпи стрічки її не звужують. Інакше вкладка «Знайдено»
    // показувала б людину, а «Схожі» ховали б її двійника.
    //
    // Але кеш — це не право показу. У локальному сховищі лежить усе, що пристрій
    // колись бачив (власні чернетки, картки з реакцій, залишки від іншого
    // сеансу), і віддавати його читачеві як є означало показувати неопубліковані
    // анкети: саме так приховані картки й пробивались у деку повз
    // `canShowMatchingUser`. Кожен кандидат проходить той самий останній рубіж,
    // що й картка зі стрічки чи з відповіді бекенду.
    return candidates.filter(user => canShowMatchingUser(user, { isAdmin }));
  }, [filteredUsers, isAdmin, isSearching, searchQuery]);

  // Spec §1: whatever the reader is looking at, the list, the gallery and the
  // detail layer all index into this one array - so opening row N and paging
  // from it can never disagree about which card is which.
  const feedSourceWithoutOwnEdits = isSearching && searchTab === 'similar' ? similarUsers : filteredUsers;

  /**
   * Картка показується разом із тим, що читач сам у неї дописав.
   *
   * Доповнення (`multiData/edits/{картка}/{читач}`) — це шар поверх картки, а не
   * її правка: сама картка лишається такою, якою її бачать усі. Але поки список
   * показував саму лише картку, доповнення виглядало як загублене — читач
   * дописував телефон, вертався до списку й бачив ту саму картку без нього, а
   * прибраний у шарі хибний контакт стояв у ній як стояв. Тепер шар лягає
   * зверху скрізь, де його автор цю картку бачить: і у видачі пошуку, і в
   * стрічці, і в шарі деталей.
   */
  const withOwnEdits = React.useCallback(user => {
    if (ownOverlayStateOwnerId !== ownerId) return user;
    const fields = user?.userId ? ownOverlayFieldsByCardId[user.userId] : null;
    if (!fields || !Object.keys(fields).length) return user;
    return applyOverlayToCard(user, fields);
  }, [ownOverlayFieldsByCardId, ownOverlayStateOwnerId, ownerId]);

  /**
   * Порожня мапа віддає той самий масив, а не його копію: від `feedSource`
   * залежить і гідратація фото, і пагінація, і шар деталей.
   */
  const feedSource = useMemo(() => {
    if (!Object.keys(ownOverlayFieldsByCardId).length) return feedSourceWithoutOwnEdits;
    return feedSourceWithoutOwnEdits.map(withOwnEdits);
  }, [feedSourceWithoutOwnEdits, ownOverlayFieldsByCardId, withOwnEdits]);

  /**
   * Перелік власних доповнень — раз на таб.
   *
   * Це і є те, чим стрічка відрізняється від видачі пошуку: у видачі рядків
   * десяток, і питати про кожен можна прямо, а в стрічці їх сотні. Питання
   * «у котрих із них лежить мій шар» коштує один запит
   * (`multiData/editsByEditor` плюс памʼять браузера), і вже за ним читаються
   * самі шари — стільки, скільки читач насправді дописував.
   *
   * Доповнювати картку вміє той, кому дозволено заводити картки, і саме його
   * рядок несе олівець «Доповнити дані» — тож і питати є сенс лише в нього.
   * Адмін править картку напряму, і його правка їде в саму картку.
   */
  useEffect(() => {
    // Читач береться з `ownerId`, а не з `auth.currentUser`: на першому рендері
    // сторінки того ще немає, а перезапустити ефект нема на що — рівень
    // доступу відтоді не змінюється. Саме так перелік і не читався б узагалі.
    const editorUserId = ownerId;
    if (isAdmin || !access.canCreateProfiles || !editorUserId) return undefined;

    getOwnOverlayCardIndex(editorUserId)
      .then(({ cardUserIds, remoteCardUserIds }) => {
        if (!ownOverlaysMountedRef.current || ownOverlayOwnerIdRef.current !== editorUserId) return;
        setOwnOverlayCardIds(new Set(cardUserIds));
        setRemoteOwnOverlayCardIds(new Set(remoteCardUserIds));
      })
      .catch(error => console.warn('[Matching] own overlay index unavailable', error));

    return undefined;
  }, [access.canCreateProfiles, isAdmin, ownerId]);

  /**
   * Власне доповнення до однієї картки, про яку читач спитав прямо.
   *
   * Шар доповнення (`multiData/edits/{картка}/{читач}`) мусить лягти на картку
   * скрізь, де його автор цю картку бачить. У стрічці «де бачить» вирішує
   * перелік власних доповнень — інакше кожен з її сотень рядків коштував би
   * вузла. Але перелік не всезнаючий: у базі він лежить під
   * `multiData/editsByEditor`, правила на який викочуються руками, а поза базою
   * — у памʼяті цього браузера. Тож на іншому пристрої (і всюди, поки правила
   * не викотили) перелік мовчить, і дописаний телефон видно було рівно в одному
   * місці — у формі доповнення, яка читає вузол напряму. Людина дописала номер,
   * повернулась до списку й побачила ту саму картку без нього.
   *
   * Дотик знімає це питання, не платячи за стрічку: відкрита картка,
   * розгорнутий рядок і натиснута трубка — це три явні «покажи мені цю
   * анкету», і кожне з них уже коштує читання вузлів анкети. Ще один вузол на
   * той самий дотик стрічку не здорожчує, бо дотиків стільки, скільки їх
   * зробила людина, а не скільки рядків у списку.
   */
  useEffect(() => {
    const editorUserId = ownerId;
    if (isAdmin || !access.canCreateProfiles || !editorUserId) {
      ensureOwnOverlayRef.current = () => {};
      return;
    }

    ensureOwnOverlayRef.current = cardUserId => {
      if (!cardUserId || touchedOwnOverlayIdsRef.current.has(cardUserId)) return;
      touchedOwnOverlayIdsRef.current.add(cardUserId);
      getOwnOverlayFieldsForCards({ editorUserId, cardUserIds: [cardUserId] })
        .then(fieldsByCardId => {
          const fields = fieldsByCardId?.[cardUserId];
          if (!fields || !Object.keys(fields).length) return;
          if (!ownOverlaysMountedRef.current || ownOverlayOwnerIdRef.current !== editorUserId) return;
          setOwnOverlayFieldsByCardId(previous => ({ ...previous, [cardUserId]: fields }));
        })
        .catch(error => {
          // Читання, яке впало, мусить бути можливо повторити наступним дотиком:
          // відмова тут — це мережа або невикочені правила, а не «шару немає».
          touchedOwnOverlayIdsRef.current.delete(cardUserId);
          console.warn('[Matching] own overlay unavailable', cardUserId, error);
        });
    };
  }, [access.canCreateProfiles, isAdmin, ownerId]);

  /**
   * Читається лише те, що на екрані, — і в стрічці лише те, що читач дописував.
   *
   * Шар доповнення (`multiData/edits/{картка}/{читач}`) мусить лягти на картку
   * скрізь, де його автор цю картку бачить: людина дописала телефон, і
   * повернувшись до загального списку, очікує побачити там саме його, а не
   * картку без нього. Так само зі стертим у шарі полем — прибраний хибний
   * контакт не має вертатись у рядок.
   *
   * Ціна при цьому різна в двох режимах, і саме тому їх тут два. Видача пошуку
   * — це десяток рядків на явний запит, тож про кожен з них можна спитати
   * прямо. Стрічка ж гортається сотнями рядків, і читання «на кожну картку»
   * коштує рівно те, від чого її відмивали
   * (`docs/matching-feed-traffic.md`), — тож вона питає лише про ті картки,
   * які перелік власних доповнень уже назвав.
   */
  useEffect(() => {
    const editorUserId = ownerId;
    if (isAdmin || !access.canCreateProfiles || !editorUserId) return undefined;
    // Поки перелік не приїхав, стрічка не питає нічого: інакше перший її
    // рендер устиг би зробити той самий круг на кожен рядок.
    const currentOwnerOverlayCardIds = ownOverlayStateOwnerId === editorUserId ? ownOverlayCardIds : null;
    const currentRemoteOverlayCardIds = ownOverlayStateOwnerId === editorUserId ? remoteOwnOverlayCardIds : null;
    if (!currentOwnerOverlayCardIds || !currentRemoteOverlayCardIds) return undefined;

    const requested = requestedOwnOverlayIdsRef.current;
    const cardUserIds = feedSourceWithoutOwnEdits
      .map(user => user?.userId)
      .filter(userId => userId && !requested.has(userId))
      .filter(userId => isSearching || currentOwnerOverlayCardIds.has(userId));
    if (!cardUserIds.length) return undefined;

    cardUserIds.forEach(userId => requested.add(userId));
    getOwnOverlayFieldsForCards({
      editorUserId,
      cardUserIds,
      remotelyIndexedCardUserIds: currentRemoteOverlayCardIds,
    })
      .then(fieldsByCardId => {
        // Порожні відповіді в стан не йдуть: інакше кожен пошук перемальовував
        // би видачу мапою з самих лише порожніх обʼєктів.
        const found = Object.entries(fieldsByCardId).filter(([, fields]) => Object.keys(fields || {}).length);
        if (!ownOverlaysMountedRef.current || ownOverlayOwnerIdRef.current !== editorUserId || !found.length) return;
        setOwnOverlayFieldsByCardId(previous => ({ ...previous, ...Object.fromEntries(found) }));
      })
      .catch(error => console.warn('[Matching] own overlays unavailable', error));

    // Скасування тут не за чим: запит уже позначений як зроблений, і скасувати
    // його означало б викинути відповідь назавжди. Саме так воно й було —
    // прапорець `cancelled` знімався на кожному перезапуску ефекту (а видача
    // перебудовується щоразу, коли приїжджає наступна її частина), тож
    // доповнення приходило рівно тоді, коли його вже нема кому прийняти.
    // Лишається одна причина не писати в стан — розмонтована сторінка.
    return undefined;
  }, [access.canCreateProfiles, feedSourceWithoutOwnEdits, isAdmin, isSearching, ownOverlayCardIds, ownOverlayStateOwnerId, ownerId, remoteOwnOverlayCardIds]);

  const renderedCards = filteredUsers;
  const debugFilterPipelineDiagnostics = useMemo(() => {
    const isGroupNeutralOrInactive = value => (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !Object.values(value).some(flag => flag === false)
    );
    const buildNeutralGroup = value => (
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value).reduce((acc, key) => ({ ...acc, [key]: true }), {})
        : value
    );
    const detectUiFailedFiltersForCard = card => {
      if (!card?.userId) return [];
      const baseCandidate = [card];
      const baselineVisible = applyMatchingUiFiltersToUsers({
        users: baseCandidate,
        filters,
        filterMainFn: filterMain,
        favoriteUsers,
        dislikeUsers,
        excludeReactionUsers: viewMode === 'default',
        roleIndexSets,
        viewMode,
      }).length > 0;
      if (baselineVisible) return [];

      const groupKeys = Object.entries(filters || {})
        .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
        .filter(([, value]) => !isGroupNeutralOrInactive(value))
        .map(([key]) => key);

      return groupKeys.filter(groupKey => {
        const relaxedFilters = {
          ...(filters || {}),
          [groupKey]: buildNeutralGroup(filters?.[groupKey]),
        };
        return applyMatchingUiFiltersToUsers({
          users: baseCandidate,
          filters: relaxedFilters,
          filterMainFn: filterMain,
          favoriteUsers,
          dislikeUsers,
          excludeReactionUsers: viewMode === 'default',
          roleIndexSets,
          viewMode,
        }).length > 0;
      });
    };

    const batchId = `${viewMode}:${Date.now()}`;
    const loadedIds = Array.from(loadedIdsRef.current || []).filter(Boolean);
    const renderedIds = filteredUsers.map(card => card?.userId).filter(Boolean);
    const renderedIdsSet = new Set(renderedIds);
    const visibleCardIds = visibleUsers.map(card => card?.userId).filter(Boolean);
    const visibleCardIdsSet = new Set(visibleCardIds);
    const loadedPool = [...users, ...additionalAccessUsers, ...sharedReactionCandidateUsers];
    const cardById = new Map();
    loadedPool.forEach(card => {
      if (card?.userId && !cardById.has(card.userId)) cardById.set(card.userId, card);
    });

    const roleFilters = filters?.userRole && typeof filters.userRole === 'object' ? filters.userRole : {};
    const activeUserRoleFilters = Object.entries(roleFilters)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([role]) => role);
    const hasUserRoleFilter = activeUserRoleFilters.length > 0;

    const filteredOutByReason = {};
    const filteredOutCards = [];
    const seenKeys = new Set();
    const pushFiltered = ({ userId, stage, reason, details = {}, card }) => {
      const key = `${userId || 'missing'}::${stage}::${reason}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      filteredOutByReason[reason] = (filteredOutByReason[reason] || 0) + 1;
      filteredOutCards.push({
        userId: userId || null,
        stage,
        reason,
        details,
      });
    };

    const missingFromRendered = [];
    loadedIds.forEach(userId => {
      if (renderedIdsSet.has(userId)) return;
      const card = cardById.get(userId) || null;
      const cardRole = card ? getProfileRole(card) : null;
      let possibleReason = 'unknown_final_render_exclusion';

      if (!card) {
        possibleReason = 'unknown_final_render_exclusion';
      } else if (!card.publish && !card.__matchingAccessAllowed) {
        possibleReason = 'publish_false';
      } else if (!canShowMatchingUser(card, { isAdmin })) {
        possibleReason = 'hidden';
      } else if (hasUserRoleFilter && cardRole && !activeUserRoleFilters.includes(cardRole)) {
        possibleReason = 'excluded_by_userRole_filter';
      } else if (!visibleCardIdsSet.has(userId)) {
        possibleReason = 'excluded_by_ui_filter';
      }

      const details = {
        cardRole,
        pub: card?.publish,
        activeUserRoleFilters,
        excludedBy: null,
        excludedFunction: null,
        excludedCondition: null,
      };
      if (possibleReason === 'excluded_by_userRole_filter') {
        details.excludedBy = 'userRole';
        details.excludedFunction = 'getProfileRole + activeUserRoleFilters.includes';
        details.excludedCondition = `hasUserRoleFilter && cardRole && !activeUserRoleFilters.includes(cardRole) [cardRole=${cardRole || '-'}; active=${activeUserRoleFilters.join('|') || '-'}]`;
        details.failedFilters = ['userRole'];
        details.exactReason = 'ui_filter_failed:userRole';
      } else if (possibleReason === 'excluded_by_ui_filter') {
        const searchKeyDebug = getMatchingSearchKeyFilterDebugForUser({
          user: card,
          filters,
          roleIndexSets,
        });
        const uiFailedFilters = detectUiFailedFiltersForCard(card);
        const resolvedFailedFilters = Array.from(new Set([
          ...(Array.isArray(uiFailedFilters) ? uiFailedFilters : []),
          ...(Array.isArray(searchKeyDebug.failedFilters) ? searchKeyDebug.failedFilters : []),
        ].filter(Boolean)));
        details.failedFilters = resolvedFailedFilters;
        details.searchKeyChecks = searchKeyDebug.checks;
        details.searchKeyFailedFilters = Array.isArray(searchKeyDebug.failedFilters) ? searchKeyDebug.failedFilters : [];
        details.uiFailedFilters = Array.isArray(uiFailedFilters) ? uiFailedFilters : [];
        details.failedFilterGroupsBySource = {
          ui: details.uiFailedFilters,
          searchKey: details.searchKeyFailedFilters,
          merged: details.failedFilters,
        };
        details.excludedBy = details.failedFilters.length > 0 ? details.failedFilters[0] : 'unknown';
        details.excludedFunction = details.uiFailedFilters.length > 0
          ? 'applyMatchingUiFiltersToUsers'
          : (details.searchKeyFailedFilters.length > 0 ? 'getMatchingSearchKeyFilterDebugForUser' : 'unknown');
        const firstFailedFilter = details.failedFilters[0] || null;
        const firstFailedSearchKeyCheck = firstFailedFilter && searchKeyDebug.checks?.[firstFailedFilter]
          ? searchKeyDebug.checks[firstFailedFilter]
          : null;
        details.excludedCondition = firstFailedFilter
          ? `${firstFailedFilter}: selected=${(firstFailedSearchKeyCheck?.active || []).join('|') || '-'}; cardCategory=${firstFailedSearchKeyCheck?.category || '-'}; pass=${firstFailedSearchKeyCheck?.pass ? 'yes' : 'no'}; source=${firstFailedSearchKeyCheck?.source || '-'}; predicate=Boolean(filters.${firstFailedFilter}?.[category])`
          : 'No specific failed filter resolved';
        const hasUiEvidence = details.uiFailedFilters.length > 0
          && details.failedFilters.length > 0
          && details.excludedFunction
          && details.excludedCondition;
        if (!hasUiEvidence) {
          possibleReason = 'unknown_filter_block';
          details.excludedBy = 'unknown';
          details.excludedFunction = details.excludedFunction || 'unknown';
          details.excludedCondition = details.excludedCondition || 'ui filter blocked but no exact failed condition resolved';
          details.exactReason = 'unknown_filter_block';
          console.warn('[Matching][debugTrace] blocked_by_ui_filter rejected due to incomplete trace', {
            userId,
            uiFailedFilters: details.uiFailedFilters,
            failedFilters: details.failedFilters,
            excludedFunction: details.excludedFunction,
            excludedCondition: details.excludedCondition,
          });
        } else {
          details.exactReason = `ui_filter_failed:${details.failedFilters.join('|')}`;
        }
      } else if (possibleReason === 'hidden') {
        const canShowDebug = getCanShowMatchingUserDebug(card, { isAdmin });
        details.excludedFunction = canShowDebug.excludedFunction || 'canShowMatchingUser';
        details.excludedCondition = canShowDebug.excludedCondition || 'canShowMatchingUser(card, { isAdmin }) === false';
        details.exactReason = canShowDebug.exactReason || 'visibility_guard:hidden';
      } else if (possibleReason === 'publish_false') {
        details.excludedFunction = 'publish_flag_check';
        details.excludedCondition = '!card.publish && !card.__matchingAccessAllowed';
        details.exactReason = 'publish_false';
      } else if (possibleReason === 'unknown_final_render_exclusion') {
        details.excludedFunction = 'final_render_diff';
        details.excludedCondition = 'Card id exists in loadedIdsRef, but absent in final renderedIds';
        details.exactReason = 'unknown_final_render_exclusion';
      }
      details.__matchingDebugTrace = {
        finalReason: possibleReason,
        excludedAtStage: 'final_render_diff',
        excludedByFunction: details.excludedFunction || null,
        excludedCondition: details.excludedCondition || null,
        exactReason: details.exactReason || null,
        failedFilters: details.failedFilters || [],
        uiFailedFilters: details.uiFailedFilters || [],
        searchKeyFailedFilters: details.searchKeyFailedFilters || [],
        activeFiltersSnapshot: getMatchingUiFilterDebugSummary(filters),
        cardValuesSnapshot: `userId=${card?.userId || userId || '-'}; role=${cardRole || '-'}; userRole=${card?.userRole || '-'}; publish=${card?.publish === false ? 'false' : 'true'}`,
      };
      pushFiltered({
        userId,
        stage: 'final_render_diff',
        reason: possibleReason,
        details,
        card,
      });
      missingFromRendered.push({
        userId,
        detectedAt: 'final_render_diff',
        possibleReason,
        cardRole,
        pub: card?.publish,
      });
    });

    const hiddenByUiFilterSet = new Set(
      missingFromRendered
        .filter(item => item?.possibleReason === 'excluded_by_ui_filter')
        .map(item => item.userId)
        .filter(Boolean)
    );
    const failedFiltersByUserId = new Map(
      filteredOutCards
        .filter(item => item?.reason === 'excluded_by_ui_filter' && item?.userId)
        .map(item => [item.userId, item?.details?.failedFilters || []])
    );
    const filteredOutDetailsByUserId = new Map(
      filteredOutCards
        .filter(item => item?.userId)
        .map(item => [item.userId, item])
    );

    const allDebugIds = Array.from(new Set([
      ...loadedIds,
      ...renderedIds,
      ...visibleCardIds,
      ...Array.from(cardById.keys()),
    ].filter(Boolean)));

    const cardsDebug = allDebugIds.map(userId => {
      const card = cardById.get(userId) || null;
      const cardRole = card ? getProfileRole(card) : null;
      return {
        userId,
        role: cardRole,
        userRole: card?.userRole || null,
        inFilteredUsers: renderedIdsSet.has(userId),
        inRenderedUsers: renderedIdsSet.has(userId),
        inVisibleCardIds: visibleCardIdsSet.has(userId),
        hiddenByUiFilter: hiddenByUiFilterSet.has(userId),
        failedFilters: failedFiltersByUserId.get(userId) || [],
        excludedBy: filteredOutDetailsByUserId.get(userId)?.details?.excludedBy || null,
        excludedAtStage: filteredOutDetailsByUserId.get(userId)?.stage || null,
        excludedReason: filteredOutDetailsByUserId.get(userId)?.reason || null,
        excludedFunction: filteredOutDetailsByUserId.get(userId)?.details?.excludedFunction || null,
        excludedCondition: filteredOutDetailsByUserId.get(userId)?.details?.excludedCondition || null,
        exactReason: filteredOutDetailsByUserId.get(userId)?.details?.exactReason || null,
        uiFailedFilters: filteredOutDetailsByUserId.get(userId)?.details?.uiFailedFilters || [],
        searchKeyFailedFilters: filteredOutDetailsByUserId.get(userId)?.details?.searchKeyFailedFilters || [],
        __matchingDebugTrace: filteredOutDetailsByUserId.get(userId)?.details?.__matchingDebugTrace || null,
      };
    });

    return {
      batchId,
      loadedIdsCount: loadedIds.length,
      loadedCardsCount: cardById.size,
      visibleCardIdsCount: visibleCardIds.length,
      filteredUsersLength: filteredUsers.length,
      renderedCardsCount: renderedCards.length,
      renderedIdsCount: renderedIds.length,
      missingFromRenderedCount: missingFromRendered.length,
      missingFromRendered,
      cardsDebug,
      filteredOutByReason,
      filteredOutCards,
    };
  }, [
    additionalAccessUsers,
    dislikeUsers,
    favoriteUsers,
    filteredUsers,
    filters,
    isAdmin,
    renderedCards.length,
    roleIndexSets,
    sharedReactionCandidateUsers,
    users,
    viewMode,
    visibleUsers,
  ]);
  const renderedCardsLength = renderedCards.length;
  // Pagination targets count only public cards. `renderedCardsLength` also
  // contains drafts/access-scoped cards and is therefore only a DOM/deck size.
  const publicCardsLength = viewMode === 'default' ? publicVisibleUsers.length : renderedCardsLength;
  // Читається з обробника відліку, який живе поза рендером.
  const publicCardsLengthRef = useRef(publicCardsLength);
  useEffect(() => { publicCardsLengthRef.current = publicCardsLength; }, [publicCardsLength]);
  const pagedCardsLength = viewMode === 'default' ? filteredUsers.length : publicCardsLength;
  const pagedCardsLengthRef = useRef(pagedCardsLength);
  useEffect(() => { pagedCardsLengthRef.current = pagedCardsLength; }, [pagedCardsLength]);
  const debugFilteredOutReasonById = useMemo(() => {
    if (!(debugShowAllIndexedCards && isIndexedDebugTestUser)) return new Map();
    const map = new Map();
    (debugFilterPipelineDiagnostics.filteredOutCards || []).forEach(item => {
      if (!item?.userId || map.has(item.userId)) return;
      map.set(item.userId, item.reason || 'unknown_final_render_exclusion');
    });
    return map;
  }, [debugFilterPipelineDiagnostics.filteredOutCards, debugShowAllIndexedCards, isIndexedDebugTestUser]);
  const debugUiFilterFailedFiltersById = useMemo(() => {
    if (!(debugShowAllIndexedCards && isIndexedDebugTestUser)) return new Map();
    const map = new Map();
    (debugFilterPipelineDiagnostics.filteredOutCards || []).forEach(item => {
      if (!item?.userId || map.has(item.userId)) return;
      const failed = Array.isArray(item?.details?.failedFilters) ? item.details.failedFilters.filter(Boolean) : [];
      if (failed.length > 0) map.set(item.userId, failed.join(', '));
    });
    return map;
  }, [debugFilterPipelineDiagnostics.filteredOutCards, debugShowAllIndexedCards, isIndexedDebugTestUser]);
  const debugCardDiagnosticsById = useMemo(() => {
    if (!(debugShowAllIndexedCards && isIndexedDebugTestUser)) return new Map();
    const map = new Map();
    (debugFilterPipelineDiagnostics.cardsDebug || []).forEach(item => {
      if (!item?.userId || map.has(item.userId)) return;
      map.set(item.userId, item);
    });
    return map;
  }, [debugFilterPipelineDiagnostics.cardsDebug, debugShowAllIndexedCards, isIndexedDebugTestUser]);
  const debugHiddenStats = useMemo(() => {
    if (!(debugShowAllIndexedCards && isIndexedDebugTestUser)) return null;
    const visibleSet = new Set(applyMatchingUiFiltersToUsers({
      users: visibleUsers,
      filters,
      filterMainFn: filterMain,
      favoriteUsers,
      dislikeUsers,
      excludeReactionUsers: viewMode === 'default',
      roleIndexSets,
      viewMode,
    }).map(card => card?.userId).filter(Boolean));
    const normallyHidden = renderedCards.filter(card => card?.userId && !visibleSet.has(card.userId));
    return {
      indexedIdsTotal: renderedCards.length,
      displayedCardsTotal: renderedCards.length,
      normallyVisibleCardsTotal: visibleSet.size,
      normallyHiddenCardsTotal: normallyHidden.length,
    };
  }, [debugShowAllIndexedCards, dislikeUsers, favoriteUsers, filters, isIndexedDebugTestUser, renderedCards, roleIndexSets, viewMode, visibleUsers]);

  useEffect(() => {
    if (!debugHiddenStats) return;
    console.info('[Matching][debugShowAllIndexedCardsEnabled]', debugHiddenStats);
  }, [debugHiddenStats]);

  useEffect(() => {
    writeMatchingDebugLog('matching:filterPipelineSummary', {
      viewMode,
      ownerId,
      batchId: debugFilterPipelineDiagnostics.batchId,
      pageIdsCount: matchingLastCardsDebugStatsRef.current?.sourceCardsCount || 0,
      fetchedPageCardsCount: matchingLastCardsDebugStatsRef.current?.emittedCardsCount || 0,
      pageCardsAfterFiltersCount: matchingLastCardsDebugStatsRef.current?.filteredCardsCount || 0,
      totalLoadedIdsCount: debugFilterPipelineDiagnostics.loadedIdsCount,
      totalLoadedCardsCount: debugFilterPipelineDiagnostics.loadedCardsCount,
      totalFilteredUsersLength: debugFilterPipelineDiagnostics.filteredUsersLength,
      totalRenderedLength: debugFilterPipelineDiagnostics.renderedCardsCount,
      visibleCardIdsCount: debugFilterPipelineDiagnostics.visibleCardIdsCount,
      missingFromRenderedCount: debugFilterPipelineDiagnostics.missingFromRenderedCount,
      filteredOutByReason: debugFilterPipelineDiagnostics.filteredOutByReason,
    });
    writeMatchingDebugLog('matching:filteredOutCards', {
      batchId: debugFilterPipelineDiagnostics.batchId,
      count: debugFilterPipelineDiagnostics.filteredOutCards.length,
      cards: debugFilterPipelineDiagnostics.filteredOutCards.slice(0, 50),
      truncated: debugFilterPipelineDiagnostics.filteredOutCards.length > 50,
    });
    writeMatchingDebugLog('matching:finalRenderedDiff', {
      loadedIdsCount: debugFilterPipelineDiagnostics.loadedIdsCount,
      renderedIdsCount: debugFilterPipelineDiagnostics.renderedIdsCount,
      missingFromRenderedCount: debugFilterPipelineDiagnostics.missingFromRenderedCount,
      missingFromRendered: debugFilterPipelineDiagnostics.missingFromRendered.slice(0, 50),
      truncated: debugFilterPipelineDiagnostics.missingFromRendered.length > 50,
    });
    if (debugFilterPipelineDiagnostics.loadedIdsCount !== renderedCardsLength) {
      writeMatchingDebugLog('matching:loadedRenderedMismatch', {
        loadedIdsCount: debugFilterPipelineDiagnostics.loadedIdsCount,
        renderedLength: renderedCardsLength,
        missingCount: Math.max(0, debugFilterPipelineDiagnostics.loadedIdsCount - renderedCardsLength),
        viewMode,
        filtersSignature: JSON.stringify(getActiveMatchingFiltersDebug(filters)),
        hasMore,
        lastKey,
      });
    }
  }, [debugFilterPipelineDiagnostics, filteredUsers.length, filters, hasMore, lastKey, ownerId, renderedCardsLength, viewMode, visibleUsers.length]);

  useEffect(() => {
    if (viewMode !== 'favorites' && viewMode !== 'dislikes') return;

    debugReactionFlowLog('render:visible-filtered-rendered', {
      viewMode,
      loading,
      loadingRef: loadingRef.current,
      hasMore,
      reactionIds: summarizeIdsForDebug(Object.keys(normalizeReactionMap(viewMode === 'favorites' ? favoriteUsers : dislikeUsers))),
      users: summarizeUsersForReactionDebug(users),
      additionalAccessUsers: summarizeUsersForReactionDebug(additionalAccessUsers),
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
    additionalAccessUsers,
    dislikeUsers,
    favoriteUsers,
    filteredUsers,
    filters,
    reactionTabUsers,
    hasMore,
    loading,
    reactionPaginationByType,
    renderedCards,
    sharedReactionCandidateUsers,
    users,
    viewMode,
    visibleUsers,
  ]);

  const detailIndex = detailOpen && feedSource.length ? activeProfileIndex : null;
  const activeProfile = detailIndex === null ? null : (feedSource[detailIndex] || null);

  // Проєкція `matchingCards` несе рівно те, що видно в рядку стрічки. Розгорнутий
  // рядок і шар деталей показують більше — освіту, зовнішність, контакти — тож
  // повна анкета читається саме там: одна картка на дотик читача замість
  // сорока наперед.
  const [fullProfileByUserId, setFullProfileByUserId] = useState({});
  const fullProfileRequestsRef = useRef(new Set());

  const ensureFullProfile = React.useCallback(user => {
    const userId = user?.userId;
    if (!userId) return Promise.resolve();
    // Читач сам попросив саме цю картку — відкрив її, розгорнув рядок або
    // натиснув трубку. Питання «чи лежить тут моє доповнення» коштує тут один
    // вузол на дотик, і поставити його треба незалежно від переліку власних
    // доповнень: перелік живе в `multiData/editsByEditor`, правила на який
    // викочуються руками, тож на чужому пристрої (або поки їх не викотили) він
    // мовчить — і дописаний телефон не з'являвся ніде, крім самої форми
    // доповнення. Стрічка перелік і далі питає: там рядків сотні, і читати
    // вузол на кожен з них — рівно те, від чого її відмивали.
    ensureOwnOverlayRef.current(userId);
    if (!isMatchingSummaryCard(user)) return Promise.resolve();
    if (fullProfileRequestsRef.current.has(userId)) return Promise.resolve();
    fullProfileRequestsRef.current.add(userId);

    // Картку, яку вже відкривали, читати вдруге нема за чим: повна анкета
    // лежить у кеші й живе там ті самі шість годин, що й решта. Раніше сюди
    // йшов безумовний `fetchUsersByIds`, тож кожне відкриття тієї самої анкети
    // — після перезавантаження вкладки, після повернення з іншого екрана —
    // коштувало чотири вузли плюс рівень доступу плюс дві мапи `multiData`.
    //
    // Кеш береться лише там, де він мав право бути повним: читачеві, чиє право
    // на контакти тримається на `feedDate`, їх у кеш не кладуть, і віддати таку
    // анкету означало б, що телефон зникає з другого відкриття
    // (`getCompleteCachedProfile`).
    const cached = getCompleteCachedProfile(userId);
    if (cached) {
      setFullProfileByUserId(previous => ({ ...previous, [userId]: cached }));
      return Promise.resolve();
    }

    return fetchUsersByIds([userId])
      .then(hydrated => {
        const profile = hydrated?.[userId];
        if (!profile) return;
        updateCard(userId, profile);
        setFullProfileByUserId(previous => ({ ...previous, [userId]: profile }));
      })
      .catch(error => {
        fullProfileRequestsRef.current.delete(userId);
        console.error('[Matching] Failed to hydrate full profile', { userId, error });
      });
  }, []);

  const withLazyPhotos = React.useCallback(user => {
    if (!user?.userId) return user;
    const fullProfile = fullProfileByUserId[user.userId];
    const cachedPhotos = photoCacheByUserId[user.userId];
    if (!fullProfile && !cachedPhotos) return user;
    // Проєкція перекривається анкетою, а не навпаки: анкета свіжіша й повніша.
    const merged = fullProfile ? { ...user, ...fullProfile } : { ...user };

    // Анкета з `fetchUsersByIds` приходить із порожнім `photos` — фото до неї
    // йдуть окремо. Порожній список не має стирати аватар, який проєкція вже
    // принесла, інакше картинка блимне і зникне на час догідратації.
    const resolvedPhotos = cachedPhotos
      || (Array.isArray(merged.photos) && merged.photos.length ? merged.photos : null)
      || (Array.isArray(user.photos) && user.photos.length ? user.photos : null);
    if (resolvedPhotos) {
      merged.photos = resolvedPhotos;
      merged.__photosHydrated = Boolean(cachedPhotos) || (!fullProfile && user.__photosHydrated === true);
    }
    return merged;
  }, [fullProfileByUserId, photoCacheByUserId]);

  const activeProfileWithLazyPhotos = withOwnEdits(withLazyPhotos(activeProfile));

  useEffect(() => {
    if (activeProfile) ensureFullProfile(activeProfile);
  }, [activeProfile, ensureFullProfile]);

  // Розгортання рядка приходить із самим лише userId, а шукати за ним картку
  // треба в актуальній стрічці — без того, щоб перестворювати обробник на
  // кожній її зміні.
  const feedSourceRef = useRef(feedSource);
  useEffect(() => { feedSourceRef.current = feedSource; }, [feedSource]);

  // Rows carry an avatar, so the feed hydrates photos for everything it renders;
  // the detail layer only ever needs the current card and the next one.
  //
  // Три речі роблять це дешевим. Перше: картка з `matchingCards` приносить
  // аватар із собою і сюди взагалі не потрапляє. Друге: URL, порахований у
  // попередній сесії, береться з localStorage — без жодного запиту в Storage.
  // Третє: результати збираються в пачку і лягають одним `setState`. Раніше
  // кожне фото робило власний, тож стрічка з 60 рядків перемальовувалась 60
  // разів поспіль — і щоразу цілком, бо `feedRows` перебудовував усі обʼєкти.
  useEffect(() => {
    const pool = detailOpen
      ? [feedSource[activeProfileIndex], feedSource[activeProfileIndex + 1]]
      : feedSource.slice(0, FEED_PHOTO_HYDRATION_LIMIT);
    // Аватар проєкції — це одне фото, і рядку стрічки його досить. Шар деталей
    // гортає всі фото, тож картка, яку відкрили (а отже, догідратували повною
    // анкетою), потребує повного набору попри свій `__photosHydrated`.
    const needsPhotos = user => {
      if (!user?.userId || photoCacheByUserId[user.userId]) return false;
      if (!user.__photosHydrated) return true;
      return isMatchingSummaryCard(user) && Boolean(fullProfileByUserId[user.userId]);
    };
    const candidates = pool.filter(needsPhotos);
    if (!candidates.length) return undefined;

    const cachedUrls = getCachedPhotoUrlsMap(candidates.map(user => user.userId));
    const pending = candidates.filter(user => !cachedUrls[user.userId]);
    if (Object.keys(cachedUrls).length) {
      incrementMatchingLoadStat('photoUrlCacheHits', Object.keys(cachedUrls).length);
      setPhotoCacheByUserId(prev => ({ ...cachedUrls, ...prev }));
    }
    if (!pending.length) return undefined;

    let cancelled = false;
    const resolved = {};
    Promise.all(pending.map(user => (
      // Анкета вже в руках, коли картка гідрована повністю: `knownPhotos` знімає
      // друге читання того самого вузла заради поля `photos`.
      lazyLoadProfilePhotos(user.userId, {
        knownPhotos: !isMatchingSummaryCard(user) && Array.isArray(user.photos) ? user.photos : null,
      })
        .then(photos => {
          const urls = Array.isArray(photos) ? photos : [];
          resolved[user.userId] = urls;
          setCachedPhotoUrls(user.userId, urls);
          incrementMatchingLoadStat('photoLazyLoadProfiles');
        })
        .catch(() => {
          resolved[user.userId] = [];
        })
    ))).then(() => {
      if (cancelled || !Object.keys(resolved).length) return;
      setPhotoCacheByUserId(prev => ({ ...prev, ...resolved }));
      const stats = typeof window !== 'undefined' ? window.matchingLoadStats : null;
      if (stats && typeof console.table === 'function') console.table([stats]);
    });

    return () => {
      cancelled = true;
    };
  }, [activeProfileIndex, detailOpen, feedSource, fullProfileByUserId, photoCacheByUserId]);

  useEffect(() => {
    if (activeProfile?.userId) {
      void loadCommentsFor([activeProfile], { activeOnly: true });
    }
  }, [activeProfile, loadCommentsFor]);

  useEffect(() => {
    if (detailOpen || !feedSource.length) return;
    void loadCommentsFor(feedSource.slice(0, FEED_PHOTO_HYDRATION_LIMIT), { activeOnly: false });
  }, [detailOpen, feedSource, loadCommentsFor]);

  useEffect(() => {
    setActiveProfileIndex(index => {
      if (feedSource.length === 0) return 0;
      return Math.min(index, feedSource.length - 1);
    });
  }, [feedSource.length]);

  useEffect(() => {
    setActiveProfileIndex(0);
  }, [
    searchTab,
    reactionPaginationByType.favorites.ids,
    reactionPaginationByType.dislikes.ids,
    viewMode,
  ]);

  const additionalFiltersDebugSignatureRef = useRef('');
  useEffect(() => {
    if (!parsedAdditionalAccessRules.length) return;
    if (!shouldDebugAdditionalMatching(ownerId)) return;

    const first10FilteredUserIds = filteredUsers.map(user => user.userId).filter(Boolean).slice(0, 10);
    const signature = JSON.stringify({
      ownerId,
      beforeFilters: visibleUsers.length,
      afterFilters: filteredUsers.length,
      activeFilters: getActiveMatchingFiltersDebug(filters),
      first10FilteredUserIds,
    });
    if (additionalFiltersDebugSignatureRef.current === signature) return;
    additionalFiltersDebugSignatureRef.current = signature;

    debugAdditionalToast(ownerId, 'after UI filters', {
      beforeFilters: visibleUsers.length,
      afterFilters: filteredUsers.length,
      activeFilters: getActiveMatchingFiltersDebug(filters),
      first10FilteredUserIds,
    });
  }, [filteredUsers, filters, ownerId, parsedAdditionalAccessRules.length, visibleUsers]);

  const runAutoLoadMore = React.useCallback((signature, payload) => {
    const canPageDeck = hasMoreRef.current || (
      viewModeRef.current === 'default' && additionalHasMoreRef.current
    );
    const commonDebug = {
      matchingDebugVersion: MATCHING_DEBUG_VERSION,
      signature,
      payload,
      hasMore: hasMoreRef.current,
      loading: loadingStateRef.current,
      loadingRefCurrent: loadingRef.current,
      emptyAttempts: emptyAutoLoadMoreAttemptsRef.current,
      maxEmptyAttempts: MATCHING_MAX_EMPTY_AUTO_LOAD_MORE_ATTEMPTS,
    };
    if (emptyAutoLoadMoreAttemptsRef.current >= MATCHING_MAX_EMPTY_AUTO_LOAD_MORE_ATTEMPTS) {
      console.log('[Matching][autoLoadMore] blocked', { ...commonDebug, stopReason: 'blocked-max-empty-attempts' });
      return;
    }
    const forceRefillBecauseVisibleBufferLow = Boolean(
      payload?.targetVisibleCount > payload?.currentVisibleCount && canPageDeck
    );
    if (autoLoadMoreSignatureRef.current === signature && !forceRefillBecauseVisibleBufferLow) {
      console.log('[Matching][autoLoadMore] blocked', { ...commonDebug, stopReason: 'blocked-duplicate-signature' });
      return;
    }
    const now = Date.now();
    const elapsedMs = now - autoLoadMoreLastRunRef.current;
    if (elapsedMs < MATCHING_AUTO_LOAD_MORE_COOLDOWN_MS && !forceRefillBecauseVisibleBufferLow) {
      const retryAfterMs = Math.max(0, MATCHING_AUTO_LOAD_MORE_COOLDOWN_MS - elapsedMs);
      console.log('[Matching][autoLoadMore] blocked', {
        ...commonDebug,
        cooldownMs: MATCHING_AUTO_LOAD_MORE_COOLDOWN_MS,
        elapsedMs,
        retryAfterMs,
        stopReason: 'blocked-cooldown',
      });
      if (!autoLoadMoreCooldownRetryTimerRef.current && canPageDeck) {
        autoLoadMoreCooldownRetryTimerRef.current = setTimeout(() => {
          autoLoadMoreCooldownRetryTimerRef.current = null;
          runAutoLoadMore(signature, payload);
        }, retryAfterMs);
      }
      return;
    }

    if (autoLoadMoreCooldownRetryTimerRef.current) {
      clearTimeout(autoLoadMoreCooldownRetryTimerRef.current);
      autoLoadMoreCooldownRetryTimerRef.current = null;
    }
    if (forceRefillBecauseVisibleBufferLow) {
      console.log('[Matching][autoLoadMore] forceRefillBecauseVisibleBufferLow', { ...commonDebug, refillBlockedReason: 'forceRefillBecauseVisibleBufferLow' });
    }
    console.log('[Matching][autoLoadMore] trigger', commonDebug);
    autoLoadMoreSignatureRef.current = signature;
    autoLoadMoreLastRunRef.current = now;
    const countAutoLoadMoreAttempt = visibleAdded => {
      if (visibleAdded > 0) {
        emptyAutoLoadMoreAttemptsRef.current = 0;
      } else {
        emptyAutoLoadMoreAttemptsRef.current += 1;
        incrementMatchingLoadStat('emptyLoadMoreAttempts');
      }
    };
    Promise.resolve(loadMore(payload)).then(addedCount => {
      const visibleAdded = Math.max(0, Number(addedCount) || 0);
      incrementMatchingLoadStat('visibleCardsAdded', visibleAdded);
      // Сторінка джерела могла прийти повністю відфільтрованою. Кажемо про це
      // вголос: мовчазний відлік, після якого нічого не змінюється, читається як
      // зламана сторінка, а не як «під ці фільтри більше нічого не підійшло».
      setLastLoadAddedNothing(visibleAdded === 0);
      countAutoLoadMoreAttempt(visibleAdded);
      const stats = typeof window !== 'undefined' ? window.matchingLoadStats : null;
      if (stats && typeof console.table === 'function') console.table([stats]);
    }).catch(error => {
      // Відмова сторінки — теж витрачена спроба. Поки її ніхто не ловив,
      // `loadMore` віддавав відмову назовні, лічильник порожніх спроб не
      // рухався, і стеля, яка стереже самохідний цикл, не спрацьовувала
      // ніколи: одна помилка бази перетворювала довантаження на нескінченний
      // цикл запитів. Причину показує вже той, хто вантажив.
      console.warn('[Matching][autoLoadMore] load failed', error);
      countAutoLoadMoreAttempt(0);
    });
  }, [loadMore]);

  const triggerEndOfDeckLoad = React.useCallback((reason = 'navigate-forward', { limit = MATCHING_REFILL_LIMIT } = {}) => {
    // Видача вже вся в руках: наступна порція — це зсув вікна показу, а не
    // сторінка з бекенду. Ціна порції тут — гідратація фото, коментарів і
    // анкети рівно для того, що зʼявилось на екрані.
    if (viewMode === 'search') {
      const step = Math.max(1, Number(limit) || MATCHING_THROTTLED_LOAD_BATCH);
      setSearchRevealCount(current => Math.min(current + step, searchRevealTargetRef.current));
      return;
    }
    if (viewMode !== 'default' && viewMode !== 'favorites' && viewMode !== 'dislikes') return;

    const sourceNextOffset = viewMode === 'favorites' || viewMode === 'dislikes'
      ? (reactionPaginationByType[viewMode] || buildEmptyReactionPagination()).nextOffset
      : undefined;
    const sourceCursorSignature = stableAdditionalSignature(
      sourceNextOffset !== undefined && sourceNextOffset !== null
        ? { type: 'sourceNextOffset', value: sourceNextOffset }
        : { type: 'lastKey', value: lastKey ?? null }
    );
    const triggerSignature = stableAdditionalSignature({
      type: 'end-of-deck-navigation',
      reason,
      viewMode,
      sourceCursorSignature,
      publicCardsLength,
      activeProfileIndex,
      filtersSignature: stableAdditionalSignature(filtersRef.current || {}),
      loadedIdsCount: loadedIdsRef.current?.size || 0,
    });

    console.log('[Matching][endOfDeckLoad] requested', {
      reason,
      publicCardsLength,
      activeProfileIndex,
      hasMore: Boolean(hasMoreRef.current),
      loadingRefCurrent: Boolean(loadingRef.current),
      sourceNextOffset,
      lastKey,
    });

    // Ціль на дві картки вище за поточну довжину — це те, що вмикає
    // `forceRefillBecauseVisibleBufferLow` у `runAutoLoadMore`: без нього
    // черговий цикл відліку впирався б у guard за однаковим підписом.
    const visibleBuffer = Math.max(1, Math.min(MATCHING_VISIBLE_BUFFER, Number(limit) || MATCHING_VISIBLE_BUFFER));
    runAutoLoadMore(`end-of-deck:${triggerSignature}`, {
      currentVisibleCount: publicCardsLength,
      targetVisibleCount: publicCardsLength + visibleBuffer,
      limit,
    });
  }, [
    activeProfileIndex,
    lastKey,
    reactionPaginationByType,
    publicCardsLength,
    runAutoLoadMore,
    viewMode,
  ]);

  // Spec §7: paging the detail layer walks `filtered[detailIndex ± 1]` and nothing
  // else - no fetch, no request for the card by id. It stops at both ends with a
  // short bounce instead of wrapping around. The feed's own sentinel is what
  // extends the deck, so this path deliberately never triggers a load.
  const [detailBounce, setDetailBounce] = useState(0);
  const navigateActiveProfile = React.useCallback((step) => {
    if (feedSource.length === 0) {
      setActiveProfileIndex(0);
      return;
    }

    const nextIndex = Math.max(0, Math.min(feedSource.length - 1, activeProfileIndex + step));
    if (nextIndex === activeProfileIndex) {
      setDetailBounce(step > 0 ? 1 : -1);
      return;
    }

    setActiveProfileIndex(nextIndex);
  }, [activeProfileIndex, feedSource.length]);

  useEffect(() => {
    if (!detailBounce) return undefined;
    const timer = setTimeout(() => setDetailBounce(0), 220);
    return () => clearTimeout(timer);
  }, [detailBounce]);

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

  useEffect(() => {
    if (!detailOpen) return undefined;
    const handleEscape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setDetailOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [detailOpen]);

  useEffect(() => {
    writeMatchingDebugLog('autoLoadEffect:evaluated', {
      ownerId,
      viewMode,
      filteredUsersLength: filteredUsers.length,
      hasMore,
      loading,
      loadingRefCurrent: loadingRef.current,
      lastKey,
      additionalNextOffset,
    });
      if (viewMode !== 'default' && viewMode !== 'favorites' && viewMode !== 'dislikes') return;
    // Для не-адміна догортання належить відліку: одна порція — один жест.
    //
    // Ця дозаправка живе власним життям: вона перезапускається на кожну зміну
    // `filteredUsers` і вважає приводом уже те, що фільтри зрізали пару карток —
    // а зрізають вони їх щоразу. Виходив самохідний потік, який ішов повз відлік
    // і зводив нанівець усю паузу. Лишаємо її тільки на випадок, коли на екрані
    // взагалі порожньо: тоді читачеві нема чого гортати і нема чим завести відлік.
    if (isThrottledFeedPaging && filteredUsers.length > 0) {
      console.log('[Matching][refillEffect] blocked', { refillBlockedReason: 'throttled-paging-owned-by-countdown' });
      return;
    }
    const isReactionMode = viewMode === 'favorites' || viewMode === 'dislikes';
    const reactionPipelineReady = isReactionMode ? Boolean(reactionPipelineReadyByType[viewMode]) : true;
    const reactionPagination = isReactionMode ? (reactionPaginationByType[viewMode] || buildEmptyReactionPagination()) : buildEmptyReactionPagination();
    const paginationInitialized = !isReactionMode || reactionPagination.ids.length > 0 || reactionPagination.accessSnapshotKey !== '';
    if (isReactionMode && !reactionPipelineReady) {
      console.log('[Matching][refillEffect] blocked', {
        refillBlockedReason: 'reaction-pipeline-not-ready',
        reactionPipelineReady,
        paginationInitialized,
        paginationIdsCount: reactionPagination.ids.length,
      });
      return;
    }
    if (loadingRef.current || loadingStateRef.current) {
      console.log('[Matching][refillEffect] blocked', {
        refillBlockedReason: 'blocked-loading',
        loadingRefCurrent: loadingRef.current,
        loading,
        reactionPipelineReady,
        paginationInitialized,
      });
      return;
    }
    const canRefillDeck = hasMore || (viewMode === 'default' && additionalHasMore);
    if (!canRefillDeck) {
      console.log('[Matching][refillEffect] blocked', { refillBlockedReason: 'blocked-no-hasMore', reactionPipelineReady, paginationInitialized });
      return;
    }
    const renderedLength = renderedCardsLength;
    const filteredLength = filteredUsers.length;
    const loadedIdsCount = loadedIdsRef.current?.size || 0;
    const missingFromRenderedCount = Math.max(0, loadedIdsCount - renderedLength);
    const filteredOutCount = Math.max(0, loadedIdsCount - filteredLength);
    const loadedRenderedMismatch = missingFromRenderedCount > 0;
    const targetVisibleCount = viewMode === 'default' ? INITIAL_LOAD : MATCHING_VISIBLE_BUFFER;
    const enoughVisibleCards = filteredLength >= targetVisibleCount;
    const shouldRefill = !enoughVisibleCards || (hasMore && (loadedRenderedMismatch || filteredOutCount >= MATCHING_VISIBLE_BUFFER));
    const blockedReason = shouldRefill ? '' : 'blocked-visible-buffer-satisfied';

    writeMatchingDebugLog('matching:refillDecision', {
      renderedLength,
      filteredLength,
      loadedIdsCount,
      missingFromRenderedCount,
      hasMore,
      lastKey,
      visibleBuffer: MATCHING_VISIBLE_BUFFER,
      targetVisibleCount,
      shouldRefill,
      blockedReason,
    });

    if (!shouldRefill) {
      console.log('[Matching][refillEffect] blocked', {
        stopReason: blockedReason,
        filteredLength,
        renderedLength,
        loadedIdsCount,
        missingFromRenderedCount,
        visibleBuffer: MATCHING_VISIBLE_BUFFER,
        targetVisibleCount,
      });
      return;
    }

    const signature = stableAdditionalSignature({
      type: 'refill',
      viewMode,
      length: filteredUsers.length,
      lastKey,
      additionalNextOffset,
      filters,
      filtersSignature: stableAdditionalSignature(filters),
      loadedIdsCount: loadedIdsRef.current?.size || 0,
    });
    runAutoLoadMore(signature, {
      currentVisibleCount: filteredLength,
      targetVisibleCount,
      limit: MATCHING_REFILL_LIMIT,
    });
  }, [additionalHasMore, additionalNextOffset, filteredUsers.length, filters, hasMore, isThrottledFeedPaging, lastKey, loading, ownerId, reactionPaginationByType, reactionPipelineReadyByType, renderedCardsLength, runAutoLoadMore, viewMode]);

  useEffect(() => {
    writeMatchingDebugLog('lastCardObserver:mounted', { ownerId, viewMode: viewModeRef.current });
  }, [ownerId]);
  const lastCardVisibilityLogSignatureRef = useRef('');
  useEffect(() => {
    if (loading) return;
    lastCardInFlightTriggerSignatureRef.current = '';
    lastCardLoadTriggerSignatureRef.current = '';
  }, [loading]);

  useEffect(() => () => {
    if (autoLoadMoreCooldownRetryTimerRef.current) {
      clearTimeout(autoLoadMoreCooldownRetryTimerRef.current);
      autoLoadMoreCooldownRetryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    lastCardLoadTriggerSignatureRef.current = '';
  }, [lastKey, renderedCardsLength, loadedIdsRef.current?.size]);
  useEffect(() => {
    if (viewMode !== 'default' && viewMode !== 'favorites' && viewMode !== 'dislikes') return;
    if (renderedCardsLength < 1) return;
    // Другий самохідний шлях повз відлік: на стрічці з однієї картки активний
    // індекс одразу дорівнює останньому, і вона вантажить сама. Для не-адміна
    // це робота відліку.
    if (isThrottledFeedPaging) return;

    const lastRenderedIndex = renderedCardsLength - 1;
    const activeRenderedIndex = activeProfileIndex;
    if (activeRenderedIndex < lastRenderedIndex) return;

    const reactionPagination = reactionPaginationByType[viewMode] || buildEmptyReactionPagination();
    const sourceNextOffset = viewMode === 'favorites' || viewMode === 'dislikes'
      ? reactionPagination.nextOffset
      : undefined;
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
      sourceCursorSignature,
      viewMode,
    });
    const triggerSignature = stableAdditionalSignature({
      paginationSignature,
      renderedLength: renderedCardsLength,
      activeRenderedIndex,
      triggerIndex: lastRenderedIndex,
      triggerUserId: lastRenderedCardUserId || '',
      filtersSignature: stableAdditionalSignature(filtersRef.current || {}),
      loadedIdsCount: loadedIdsRef.current?.size || 0,
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

    const previousTriggerSignature = lastCardLoadTriggerSignatureRef.current || null;
    const inFlightTriggerSignature = lastCardInFlightTriggerSignatureRef.current || null;

    if (!sourceHasMore || loadingRefCurrent || loading) {
      console.log('[Matching][lastCardTrigger] blocked', {
        stopReason: !sourceHasMore ? 'blocked-no-hasMore' : 'blocked-loading',
        previousTriggerSignature,
        currentTriggerSignature: triggerSignature,
        hasMore: sourceHasMore,
        loadingMoreRef: loadingRefCurrent,
        loading,
        lastKey,
        renderedLength: renderedCardsLength,
        loadedIdsCount: loadedIdsRef.current?.size || 0,
      });
      return;
    }

    if (loadingRefCurrent && inFlightTriggerSignature && inFlightTriggerSignature === triggerSignature) {
      console.log('[Matching][lastCardTrigger] blocked', {
        stopReason: 'blocked-duplicate-trigger-signature',
        previousTriggerSignature,
        currentTriggerSignature: triggerSignature,
        hasMore: sourceHasMore,
        loadingMoreRef: loadingRefCurrent,
        lastKey,
        renderedLength: renderedCardsLength,
        loadedIdsCount: loadedIdsRef.current?.size || 0,
      });
      return;
    }

    lastCardLoadTriggerSignatureRef.current = triggerSignature;
    lastCardInFlightTriggerSignatureRef.current = triggerSignature;
    console.log('[Matching][lastCardTrigger] allowed', {
      previousTriggerSignature,
      currentTriggerSignature: triggerSignature,
      hasMore: sourceHasMore,
      loadingMoreRef: loadingRefCurrent,
      lastKey,
      renderedLength: renderedCardsLength,
      loadedIdsCount: loadedIdsRef.current?.size || 0,
    });

    runAutoLoadMore(`last-card:${triggerSignature}`, {
      currentVisibleCount: publicCardsLength,
      targetVisibleCount: MATCHING_VISIBLE_BUFFER,
      limit: MATCHING_REFILL_LIMIT,
    });
  }, [
    activeProfileIndex,
    additionalNextOffset,
    hasMore,
    isThrottledFeedPaging,
    lastKey,
    runAutoLoadMore,
    loading,
    reactionPaginationByType,
    renderedCards,
    renderedCardsLength,
    publicCardsLength,
    viewMode,
  ]);
  useEffect(() => {
    setBackendDownloadToastsEnabled(downloadSizeToastsEnabled);
  }, [downloadSizeToastsEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!Array.isArray(window.__MATCHING_DEBUG_LOGS)) window.__MATCHING_DEBUG_LOGS = [];
      window.__MATCHING_DEBUG_LOG_MODE = matchingDebugLogMode;
    }
    writeMatchingDebugLog('matching:mounted', {
      ownerId,
      initialLogMode: matchingDebugLogMode,
      url: typeof window !== 'undefined' ? window.location?.href || '' : '',
    });
    writeMatchingDebugLog('matching:debug-build-active', {
      matchingDebugVersion: MATCHING_DEBUG_VERSION,
      initialLogMode: matchingDebugLogMode,
    });
  }, [matchingDebugLogMode, ownerId]);

  useEffect(() => {
    writeMatchingDebugLog('loadMore:function-ready', {
      ownerId,
      viewMode: viewModeRef.current,
    });
  }, [loadMore, ownerId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__MATCHING_DEBUG_LOG_MODE = matchingDebugLogMode;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MATCHING_DEBUG_LOG_MODE_KEY, matchingDebugLogMode);
    }
  }, [matchingDebugLogMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleMatchingDebugLogModeChange = event => {
      const nextMode = event?.detail?.mode === 'file' ? 'file' : 'console';
      setMatchingDebugLogMode(nextMode);
    };

    const handleMatchingDebugLogModeStorage = event => {
      if (event.key !== MATCHING_DEBUG_LOG_MODE_KEY) return;
      setMatchingDebugLogMode(event.newValue === 'file' ? 'file' : 'console');
    };

    window.addEventListener('matchingDebugLogModeChange', handleMatchingDebugLogModeChange);
    window.addEventListener('storage', handleMatchingDebugLogModeStorage);

    return () => {
      window.removeEventListener('matchingDebugLogModeChange', handleMatchingDebugLogModeChange);
      window.removeEventListener('storage', handleMatchingDebugLogModeStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MATCHING_DATA_SOURCE_MODE_KEY, matchingDataSourceMode);
    writeMatchingDebugLog('matchingDataSourceModeChanged', {
      ownerId,
      mode: matchingDataSourceMode,
    });
  }, [matchingDataSourceMode, ownerId]);

  useEffect(() => {
    if (typeof console === 'undefined') return undefined;

    const enableIntercept = () => {
      if (consoleInterceptEnabledRef.current) return;
      const methods = ['log', 'info', 'warn', 'error', 'debug'];
      originalConsoleMethodsRef.current = methods.reduce((acc, methodName) => {
        acc[methodName] = console[methodName]?.bind(console);
        return acc;
      }, {});

      methods.forEach(methodName => {
        const originalMethod = originalConsoleMethodsRef.current?.[methodName];
        if (typeof originalMethod !== 'function') return;
        console[methodName] = (...args) => {
          if (isMatchingDebugFileMode()) {
            writeMatchingDebugLog(`console:${methodName}`, {
              ownerId,
              viewMode: viewModeRef.current,
                      args: args.map(serializeConsoleArg),
            });
          }
          originalMethod(...args);
        };
      });
      consoleInterceptEnabledRef.current = true;
    };

    const disableIntercept = () => {
      if (!consoleInterceptEnabledRef.current) return;
      const methods = ['log', 'info', 'warn', 'error', 'debug'];
      methods.forEach(methodName => {
        const originalMethod = originalConsoleMethodsRef.current?.[methodName];
        if (typeof originalMethod === 'function') {
          console[methodName] = originalMethod;
        }
      });
      originalConsoleMethodsRef.current = null;
      consoleInterceptEnabledRef.current = false;
    };

    if (matchingDebugLogMode === 'file') {
      enableIntercept();
    } else {
      disableIntercept();
    }

    return () => {
      disableIntercept();
    };
  }, [matchingDebugLogMode, ownerId]);

  const handleDownloadSizeToastsToggle = () => {
    setDownloadSizeToastsEnabled(prev => !prev);
  };

  const showBackendTrafficToggle = ownerId === BACKEND_TRAFFIC_TRACKING_TEST_UID;

  // Spec §3: the feed's chips are the collection picker - a single choice, with
  // counts read straight off the already-loaded cache (§10), never re-queried.
  // The app has three collections; the spec's "✕" and "Приховані" name the same
  // one here, so it renders once.
  /**
   * Набране як заготовка нової картки.
   *
   * Поле вибирає той самий розпізнавач, що й пошук (`detectSearchParams`): він
   * уміє і телефон, і нікнейм, і посилання, а те, чого не розпізнав, називає
   * імʼям — тож поле в заготовці завжди те саме, у яке потім ляже значення.
   *
   * Контакт, за яким пошук уже показав чужу картку, у нову не підставляється:
   * він зайнятий, і перше ж автозбереження впало б на `DUPLICATE_PROFILE`. Про
   * це заготовка каже прямо, а не мовчки відкриває порожню форму.
   */
  const queryDraft = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return null;

    const detected = detectSearchParams(trimmed);
    const field = detected?.key || 'name';
    const value = detected?.value || trimmed;
    const label = getFieldLabel(pickerFields.find(item => item?.name === field), language) || uiText('Запит', language);
    const claimsIdentity = field !== 'name' && field !== 'surname' && field !== 'userId';
    const taken = claimsIdentity && visibleUsers.length > 0;

    return {
      field,
      value,
      label,
      note: taken
        ? uiText('Це значення вже стоїть у знайденій картці — нова відкриється без нього', language)
        : '',
    };
  }, [language, searchQuery, visibleUsers.length]);

  const handleCreateFromQuery = React.useCallback(() => {
    saveScrollPosition();
    navigate('/matching/create-profile', {
      state: {
        createFromQuery: searchQuery.trim(),
        queryMatchedCards: visibleUsers.length,
        returnTo: buildMatchingSearchPath(searchQuery),
      },
    });
    // saveScrollPosition reads a ref and never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, searchQuery, visibleUsers.length]);

  const searchChips = useMemo(() => [
    {
      key: 'results',
      label: uiText('Знайдено', language),
      title: uiText('Результати пошуку', language),
      // Уся видача, а не її вікно показу: «Знайдено 2» на чотирьохстах
      // знайдених було б відповіддю не на те питання.
      count: searchRefinedUsers.length,
      onSelect: () => setSearchTab('results'),
    },
    {
      key: 'create',
      label: uiText('Створити нову', language),
      title: uiText('Створити картку з цього запиту', language),
      // Чіп несе намір, а не адресу екрана пошуку. Раніше він вів на
      // `create-profile` із самим лише `state.query`, якого той екран не
      // читав, — і читач, який щойно переглянув видачу, потрапляв у другий
      // пошук за тим самим набраним, тільки з іншою розкладкою відповіді.
      // Тепер запит їде разом із тим, що вже відомо про видачу, і форма нової
      // картки відкривається одразу — тим самим шляхом, що й заготовка першим
      // рядком видачі.
      onSelect: handleCreateFromQuery,
    },
    {
      key: 'similar',
      label: uiText('Схожі', language),
      title: uiText('Схожі з локального кешу', language),
      count: similarUsers.length,
      onSelect: () => setSearchTab('similar'),
    },
  ], [handleCreateFromQuery, language, searchRefinedUsers.length, similarUsers.length]);

  // Згорнутий ряд показує три чіпи, решта ховається за «+N». Але «+N» тепер
  // розгортає ряд на місці, а не веде в шухляду фільтрів: читач питає «що це за
  // фільтри», і відповідь на це — самі підписи, а не форма, де їх треба шукати
  // заново. Розгорнутий ряд переноситься на кілька рядків і нічого не обрізає.
  const filterChips = useMemo(() => buildMatchingFilterChips(filters, language), [filters, language]);
  const [showAllFilterChips, setShowAllFilterChips] = useState(false);
  const visibleFilterChips = showAllFilterChips ? filterChips : filterChips.slice(0, MAX_FILTER_CHIPS);
  const hiddenFilterChipCount = filterChips.length - visibleFilterChips.length;
  const emptyFilterGroup = filterChips.find(chip => chip.danger) || null;

  // Розгорнутий ряд, з якого зняли фільтри, не має лишатись розгорнутим назавжди.
  useEffect(() => {
    if (filterChips.length > MAX_FILTER_CHIPS) return;
    setShowAllFilterChips(false);
  }, [filterChips.length]);

  const resetFilterGroup = React.useCallback(filterName => {
    setFilterGroupReset(previous => ({ token: previous.token + 1, name: filterName }));
  }, []);

  /**
   * Значення дофільтра у стрічці не зберігається окремо — воно виводиться з
   * фільтрів.
   *
   * Інакше рядок і шухляда розійшлися б від першого дотику до другої: читач
   * зняв би групу в шухляді, а чіп і далі казав би «лише 31–33». «Рівно одна
   * увімкнена опція групи» і є тим станом, який рядок уміє показати; будь-який
   * інший — це вже не уточнення, і рядок чесно показує себе порожнім.
   */
  const feedRefineValue = useMemo(() => {
    const spec = getRefineKeySpec(refineKey);
    if (!spec.filterName) return null;
    const group = filters?.[spec.filterName];
    if (!group || typeof group !== 'object') return null;
    const enabled = Object.keys(group).filter(option => group[option]);
    return enabled.length === 1 ? enabled[0] : null;
  }, [filters, refineKey]);

  const refineActiveValue = isSearching ? searchRefineValue : feedRefineValue;

  const handleRefineKeyChange = React.useCallback(nextKey => {
    const previous = getRefineKeySpec(refineKey);
    setRefineKey(nextKey);
    setSearchRefineValue(null);
    setSearchRevealCount(MATCHING_FIRST_PAGE_BATCH);
    // Ключ змінився — попереднє звуження знімається разом з ним, інакше
    // стрічка лишилась би відфільтрованою тим, чого рядок уже не показує.
    if (!isSearching && previous.filterName) resetFilterGroup(previous.filterName);
  }, [isSearching, refineKey, resetFilterGroup]);

  const handleRefineSelect = React.useCallback(value => {
    if (isSearching) {
      setSearchRefineValue(value);
      // Уточнення відкриває перший екран заново: звужена видача — це новий
      // перший результат, а не продовження попереднього. Набір, менший за
      // сторінку, від цього показується цілком — чекати десять секунд заради
      // третьої з трьох означало б притишувати те, за що пошук уже заплатив.
      setSearchRevealCount(MATCHING_FIRST_PAGE_BATCH);
      return;
    }
    const spec = getRefineKeySpec(refineKey);
    if (!spec.filterName) return;
    if (!value) {
      resetFilterGroup(spec.filterName);
      return;
    }
    // У стрічці тап пише в ту саму групу, яку відкриває шухляда: жодного нового
    // шляху читання: план будує наявний планувальник, і виходить він
    // найдешевшим — `include`.
    setFilterGroupSelect(previous => ({ token: previous.token + 1, name: spec.filterName, value }));
  }, [isSearching, refineKey, resetFilterGroup]);

  /*
   * Коли рядок уточнення на екрані.
   *
   * У видачі пошуку — на довгій: десять знайдених видно й так, а рядок над
   * ними лише забирає висоту.
   *
   * У стрічці — щойно в ній є перша картка. Поріг у 24 стояв і тут, але стрічка
   * віддає першу сторінку по десять: рядок не зʼявлявся взагалі, доки читач не
   * прогорне вниз, підвантажить другу сторінку й **повернеться вгору**. Тобто
   * інструмент, яким звужують видачу, знаходився випадково — і саме тоді, коли
   * звужувати вже пізно.
   *
   * Смикання, від якого стеріг поріг, від цього не повертається: рядок
   * зʼявляється один раз, з першою карткою, і далі лишається на місці.
   */
  const showRefineBar = Boolean(refineActiveValue) || (
    isSearching
      ? searchRefinedUsers.length >= REFINE_MIN_RESULTS
      : viewMode === 'default' && visibleUsers.length > 0
  );

  // Ключ без індексу `searchKey` у стрічці не пропонується: там ключ мусить
  // називати кандидатів, а не проріджувати завантажене.
  useEffect(() => {
    if (isSearching || isRefineKeyAvailableInFeed(refineKey)) return;
    setRefineKey(DEFAULT_REFINE_KEY);
  }, [isSearching, refineKey]);

  const collectionChips = useMemo(() => [
    {
      key: 'default',
      label: uiText('Усі', language),
      title: uiText('До загального списку', language),
      count: viewMode === 'default' ? filteredUsers.length : users.length,
      onSelect: handleDefaultModeClick,
    },
    {
      key: 'favorites',
      label: '♥',
      title: uiText('Показати обране', language),
      count: Object.keys(favoriteUsers || {}).length,
      onSelect: handleFavoriteModeClick,
    },
    {
      key: 'dislikes',
      label: uiText('Приховані', language),
      title: uiText('Показати приховані', language),
      count: Object.keys(dislikeUsers || {}).length,
      onSelect: handleDislikeModeClick,
    },
  ], [
    dislikeUsers,
    favoriteUsers,
    filteredUsers.length,
    language,
    handleDefaultModeClick,
    handleDislikeModeClick,
    handleFavoriteModeClick,
    users.length,
    viewMode,
  ]);

  // Spec §5: the metrics a filter narrowed on lead the row's metrics line, so the
  // numbers the reader is scanning for sit in the same place on every row.
  const priorityMetricKeys = useMemo(() => {
    const keys = [];
    const isChanged = groupName => {
      const current = filters?.[groupName];
      const defaults = matchingDefaultFilters?.[groupName];
      if (!current || !defaults) return false;
      return Object.keys(defaults).some(option => Boolean(current[option]) !== Boolean(defaults[option]));
    };
    if (isChanged('bmi')) keys.push('bmi', 'hw');
    if (isChanged('bloodGroup') || isChanged('rh')) keys.push('blood');
    if (isChanged('maritalStatus')) keys.push('marital');
    return keys;
  }, [filters, matchingDefaultFilters]);

  const openDetailFor = React.useCallback(user => {
    // Урізана проєкція теж відкривається. Раніше — ні: рядок списку показує все,
    // на що читач має право, і відкривати нібито не було чого. Але плитка
    // галереї показує менше за рядок (ані локації, ані публічних коментарів),
    // тож дотик до неї не робив рівно нічого — картка виглядала зламаною. Шар
    // деталей малює те саме, що й проєкція: більше в ньому взятись нема звідки.
    const index = feedSource.findIndex(candidate => candidate?.userId === user?.userId);
    if (index === -1) return;
    feedScrollTopRef.current = window.scrollY;
    // Відкрита картка — і є те місце, куди читач схоче повернутись. Якір
    // ставиться тут, а не в момент переходу: з відкритої картки можна піти
    // далі (олівець, редагування анкети), і тоді сторінка розмонтується вже
    // з неї.
    lastSeenCardIdRef.current = user?.userId || '';
    setActiveProfileIndex(index);
    setDetailOpen(true);
  }, [feedSource]);

  const closeDetail = React.useCallback(() => {
    setDetailOpen(false);
  }, []);

  // Opening pushes one history entry; Android's Back (and the browser's) pops
  // it, which is what actually closes the layer. Closing from the UI goes
  // through history.back() so the entry never outlives the layer.
  const detailHistoryStateRef = useRef(false);
  useEffect(() => {
    if (!detailOpen) return undefined;
    window.history.pushState({ matchingDetail: true }, '');
    detailHistoryStateRef.current = true;
    const handlePopState = () => {
      detailHistoryStateRef.current = false;
      setDetailOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Only pop the entry we pushed. If the card navigated somewhere (the admin
      // edit route), history has already moved on and a back() here would undo
      // that navigation instead of closing anything.
      if (detailHistoryStateRef.current && window.history.state?.matchingDetail) {
        detailHistoryStateRef.current = false;
        window.history.back();
        return;
      }
      detailHistoryStateRef.current = false;
    };
  }, [detailOpen]);

  // The layer covers the viewport, so the page behind it must not scroll with it.
  useEffect(() => {
    if (!detailOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [detailOpen]);

  // Spec §7: the feed comes back to the exact row the reader left from. The feed
  // never unmounted, but locking the body's scroll can still move it, so the
  // position saved on open is put back once the layer is gone.
  useLayoutEffect(() => {
    if (detailOpen) return;
    const savedTop = feedScrollTopRef.current;
    const anchorId = lastSeenCardIdRef.current;
    if (!savedTop && !anchorId) return;
    requestAnimationFrame(() => {
      // Рядок тієї самої картки — точніше за піксель: поки шар був відкритий,
      // у стрічку могла долягти чергова порція, а в рядках — догідратуватись
      // фото, і висота списку над збереженою позицією вже інша.
      const anchor = findCardNodeById(anchorId);
      if (anchor) {
        anchor.scrollIntoView({ block: 'center' });
        return;
      }
      if (savedTop) window.scrollTo(0, savedTop);
    });
  }, [detailOpen]);

  const handleToggleRowExpand = React.useCallback(userId => {
    setExpandedRowIds(previous => {
      const next = new Set(previous);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
        ensureFullProfile(feedSourceRef.current.find(candidate => candidate?.userId === userId));
      }
      return next;
    });
  }, [ensureFullProfile]);

  const [rowContactsLoading, setRowContactsLoading] = useState({});

  const handleRequestRowContacts = React.useCallback(user => {
    const userId = user?.userId;
    if (!userId) return;
    setRowContactsLoading(previous => ({ ...previous, [userId]: true }));
    Promise.resolve(ensureFullProfile(user)).finally(() => {
      setRowContactsLoading(previous => {
        const next = { ...previous };
        delete next[userId];
        return next;
      });
    });
  }, [ensureFullProfile]);

  /**
   * Власна нотатка, збережена просто з рядка стрічки.
   *
   * Той самий запис, що й у відкритій картці (`multiData/comments/{owner}`), і
   * той самий локальний кеш — інакше нотатка, написана в списку, зникала б при
   * відкритті картки й навпаки.
   */
  const handleRowCommentSave = React.useCallback(async (user, value) => {
    const cardId = user?.userId;
    if (!cardId || !ownerId || !auth.currentUser) return;
    const text = String(value ?? '');
    commentsRef.current = { ...commentsRef.current, [cardId]: text };
    setComments(prev => ({ ...prev, [cardId]: text }));
    try {
      const res = await saveMyCardComment(cardId, text, ownerId);
      dispatchedCommentSaveRef.current = { cardId, text };
      setLocalComment(ownerId, cardId, text, res?.lastAction);
      dispatchedCommentSaveRef.current = null;
    } catch (error) {
      dispatchedCommentSaveRef.current = null;
      const details = error?.message || String(error);
      toast.error(uiText('Не вдалося зберегти коментар: {details}', language, { details }));
    }
  }, [language, ownerId]);

  const handleRowContactsOpened = React.useCallback(user => {
    if (!user?.userId || !ownerId) return;
    const trackKey = `${ownerId}:${user.userId}`;
    if (rowContactViewKeysRef.current.has(trackKey)) return;
    rowContactViewKeysRef.current.add(trackKey);
    void addContactViewUser(user.userId, ownerId);
  }, [ownerId]);

  // Доповнення картки — це не редагування анкети, і кнопка ця не адмінська:
  // адмін пише в саму картку (олівцем, `/edit`), а решта читачів складають
  // власний оверлей у формі створення — інакше в рядку стояли б дві кнопки з
  // однаковим написом і різним наслідком.
  // Картку туди не передаємо — там її прочитає та сама воронка
  // (`readProfileFromNodes`), що й вирішує, скільки полів цьому читачеві видно.
  const handleRowEnrichProfile = React.useCallback(user => {
    if (!user?.userId) return;
    lastSeenCardIdRef.current = user.userId;
    saveScrollPosition();
    // Адреса видачі їде разом із наміром: закрита форма повертає рівно до тих
    // самих знайдених карток, а не на порожній екран пошуку.
    const returnTo = buildMatchingSearchPath(searchQuery);
    if (user.__profileMutationOperation === 'create') {
      navigate(`/matching/create-profile?cardId=${encodeURIComponent(user.userId)}`, { state: { returnTo } });
      return;
    }
    navigate('/matching/create-profile', { state: { enrichCardId: user.userId, returnTo } });
    // saveScrollPosition reads a ref and never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, searchQuery]);

  const handleRowEditProfile = React.useCallback(user => {
    lastSeenCardIdRef.current = user?.userId || '';
    saveScrollPosition();
    navigate(`/edit/${user.userId}`, { state: user });
    // saveScrollPosition reads a ref and never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const toggleRowFavorite = React.useCallback(user => {
    if (!user?.userId) return;
    rememberReactedCard(user.userId);
    const canonicalUser = feedSourceWithoutOwnEdits.find(candidate => candidate?.userId === user.userId);
    void toggleFavoriteUser({
      userId: user.userId,
      // Реакція пише картку в загальний кеш. Приватний оверлей існує лише для
      // показу його автору й не має переживати відхилення правки в цьому кеші.
      userData: canonicalUser ? withLazyPhotos(canonicalUser) : { userId: user.userId },
      favoriteUsers,
      setFavoriteUsers,
      ownFavoriteUsers,
      setOwnFavoriteUsers,
      dislikeUsers,
      setDislikeUsers,
      ownDislikeUsers,
      setOwnDislikeUsers,
      multiDataOwnerId: ownerId,
    });
  }, [dislikeUsers, favoriteUsers, feedSourceWithoutOwnEdits, ownDislikeUsers, ownFavoriteUsers, ownerId, rememberReactedCard, withLazyPhotos]);

  const resolveEmptyFeedMessage = () => {
    // An empty group is a different problem from "nothing matched", and saying so
    // is the difference between the reader fixing it and giving up (spec §3).
    if (emptyFilterGroup) return uiText('Група «{group}» порожня — увімкніть хоча б один діапазон', language, { group: emptyFilterGroup.groupLabel });
    // Стрічка, з якої фільтри прибрали все, — теж окрема причина, і мовчати про
    // неї найдорожче: екран каже «немає профілів» там, де насправді «є, але не
    // показані». Пошуку це вже не стосується — його видачу чіпи не звужують.
    const isReactionTab = viewMode === 'favorites' || viewMode === 'dislikes';
    if (!isReactionTab && !isSearching && visibleUsers.length > 0) {
      return uiText('Фільтри приховали всі завантажені профілі ({count})', language, { count: visibleUsers.length });
    }
    // Уточнення переживає запит, тож воно ж може виявитись єдиною причиною
    // порожнього екрана на видачі, де насправді знайшлося чотириста. Це рівно
    // той випадок, заради якого уточнення колись скидали на кожному пошуку:
    // мовчазне «Немає доступних профілів» читалось би як «не знайшов». Тепер
    // порожня видача називає причину — і чіп поруч знімає її одним тапом.
    if (isSearching && searchRefineValue && visibleUsers.length > 0) {
      const spec = getRefineKeySpec(refineKey);
      const label = spec.buckets?.find(bucket => bucket.value === searchRefineValue)?.label
        || searchRefineValue;
      return uiText('Уточнення «{spec} · {label}» не лишило нічого зі знайдених ({count})', language, {
        spec: spec.label,
        label,
        count: visibleUsers.length,
      });
    }
    // Донорці стрічка показує самих контрагентів, і на порожньому екрані про це
    // треба сказати вголос: інакше «немає доступних профілів» читається як
    // «застосунок порожній», хоча анкети є — просто не для цієї ролі. Пошук при
    // цьому працює, і рядок про це нагадує.
    //
    // Умови «щось таки завантажилось» тут немає навмисно: картки колег
    // відсіюються вже на сторінці джерела (`fetchChunk`), щоб не гортати за
    // читачку те, чого вона не побачить, — тож `users` у неї буває порожній
    // саме тоді, коли пояснення й потрібне.
    if (!isReactionTab && !isSearching && isDonorViewer(currentUserRole)) {
      return uiText('У стрічці немає анкет агенцій, клінік чи батьків — інших вона донорці не показує. Конкретну людину можна знайти пошуком', language);
    }
    return uiText('Немає доступних профілів', language);
  };
  const emptyFeedMessage = resolveEmptyFeedMessage();

  // The feed pages itself: a sentinel under the last row asks for the next page
  // as it scrolls into view. It routes through the same end-of-deck loader the
  // card deck used, so the existing in-flight guards, cooldown and empty-page
  // backoff still apply - this is only a new trigger, not a second load path.
  const feedSentinelRef = useRef(null);
  const endOfDeckLoadRef = useRef(triggerEndOfDeckLoad);
  useEffect(() => { endOfDeckLoadRef.current = triggerEndOfDeckLoad; }, [triggerEndOfDeckLoad]);

  const [feedEndVisible, setFeedEndVisible] = useState(false);
  useEffect(() => {
    const node = feedSentinelRef.current;
    if (!node || detailIndex !== null || !deckHasMore) {
      setFeedEndVisible(false);
      return undefined;
    }
    // Адмінський шлях знімає спостерігача на час завантаження; шлях з відліком
    // тримає його завжди, бо відлік має знати про видимість і поки триває
    // завантаження — інакше після кожної порції він би не перезапустився.
    if (!isThrottledFeedPaging && loading) return undefined;
    const observer = new IntersectionObserver(entries => {
      const isVisible = entries.some(entry => entry.isIntersecting);
      setFeedEndVisible(isVisible);
      if (isThrottledFeedPaging || !isVisible) return;
      endOfDeckLoadRef.current('feed-sentinel');
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [deckHasMore, detailIndex, filteredUsers.length, isThrottledFeedPaging, loading]);

  // Прокрутка донизу — це ще й повторна спроба для адміна.
  //
  // Сторінка джерела може прийти повністю відфільтрованою: `loadMore` віддає нуль
  // карток, хоча `hasMore` лишається. Кінець списку при цьому вже видно, тож
  // нової події перетину не буде — спостерігач мовчить, і стрічка стоїть, доки
  // читач не перезавантажить сторінку. Саме на це й скаржились.
  //
  // Жест витрачається: одна прокрутка донизу — одна спроба.
  useEffect(() => {
    if (isThrottledFeedPaging || !scrolledDownSinceLoad) return;
    if (!feedEndVisible || !deckHasMore || loading || detailIndex !== null) return;
    scrolledDownSinceLoadRef.current = false;
    setScrolledDownSinceLoad(false);
    endOfDeckLoadRef.current('feed-scroll');
  }, [deckHasMore, detailIndex, feedEndVisible, isThrottledFeedPaging, loading, scrolledDownSinceLoad]);

  // Кінець стрічки видно — але цього замало. Порція карток коштує один жест:
  // поки читач не прокрутив донизу, відлік не заводиться, і кінець списку показує
  // не таймер, а запрошення прокрутити далі.
  //
  // Раніше відлік перезапускався сам після кожної порції, тож достатньо було
  // залишити вкладку в кінці списку — і картки їхали нескінченно, без жодної
  // участі читача. Саме від цього стеля й мала захищати.
  const canOfferMoreFeedCards = Boolean(
    isThrottledFeedPaging &&
    !throttledCycle &&
    feedEndVisible &&
    deckHasMore &&
    !loading &&
    !loadError &&
    detailIndex === null
  );
  const showFeedLoadCountdown = canOfferMoreFeedCards && scrolledDownSinceLoad;
  const showFeedLoadPrompt = canOfferMoreFeedCards && !scrolledDownSinceLoad;

  // Підсумок живе кілька секунд і зникає сам: це відповідь на щойно зроблений
  // жест, а не постійний напис у кінці списку.
  useEffect(() => {
    if (!lastBatchSummary) return undefined;
    const timer = setTimeout(() => setLastBatchSummary(null), MATCHING_BATCH_SUMMARY_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [lastBatchSummary]);

  const feedBatchSummaryText = lastBatchSummary && !throttledCycle && !loading
    ? (lastBatchSummary.added > 0
      ? uiText('Додано {added} {cards} — вони в кінці списку', language, {
        added: lastBatchSummary.added,
        cards: pluralizeCards(lastBatchSummary.added, language),
      })
      : uiText('Порція не дала нових карток — під ці фільтри більше нічого не підійшло', language))
    : '';
  // Окремим рядком підсумок показується лише там, де запрошення немає: інакше
  // два написи про одне й те саме стояли б один під одним.
  const showStandaloneBatchSummary = Boolean(feedBatchSummaryText) && !showFeedLoadPrompt && detailIndex === null;

  // Жест витрачено: наступна порція вимагатиме нового. Знімаємо прапорець ще до
  // запиту, інакше відлік перезапустився б сам, поки картки їдуть.
  const disarmFeedPaging = React.useCallback(() => {
    scrolledDownSinceLoadRef.current = false;
    setScrolledDownSinceLoad(false);
  }, []);

  const handleThrottledFeedLoad = React.useCallback(() => {
    disarmFeedPaging();
    setLastBatchSummary(null);
    setThrottledCycle({
      target: publicCardsLengthRef.current + MATCHING_THROTTLED_LOAD_BATCH,
      startPagedCardsLength: pagedCardsLengthRef.current,
      startPublicCardsLength: publicCardsLengthRef.current,
      attempts: 1,
    });
    endOfDeckLoadRef.current('feed-countdown', { limit: MATCHING_THROTTLED_LOAD_BATCH });
  }, [disarmFeedPaging]);

  // Відлік обіцяє дві картки, а не дві спроби.
  //
  // `loadMore` рахує те, що віддало джерело, а на екран воно потрапляє вже після
  // фільтрів показу — з двох знайдених могла лишитись одна, і ряд галереї виходив
  // напівпорожній. Тож цикл добирає, доки не набереться обіцяне: без нового
  // відліку, без нового жесту і зі стелею на спроби, щоб не перетворитись на той
  // самий потік, від якого пауза й захищає.
  useEffect(() => {
    if (!isThrottledFeedPaging || !throttledCycle || loading) return;
    if (
      publicCardsLength >= throttledCycle.target ||
      pagedCardsLength - throttledCycle.startPagedCardsLength >= MATCHING_THROTTLED_LOAD_BATCH ||
      (!hasMore && !additionalHasMore) ||
      throttledCycle.attempts >= MATCHING_THROTTLED_LOAD_MAX_ATTEMPTS
    ) {
      // Цикл закінчився — і мусить сказати, чим саме. Нуль так само вартий
      // рядка, як і двійка: «під ці фільтри більше нічого не підійшло» — це
      // відповідь, а мовчазний кінець списку — ні.
      setLastBatchSummary({
        added: Math.max(0, publicCardsLength - throttledCycle.startPublicCardsLength),
        at: Date.now(),
      });
      setThrottledCycle(null);
      return;
    }
    setThrottledCycle({ ...throttledCycle, attempts: throttledCycle.attempts + 1 });
    endOfDeckLoadRef.current('feed-countdown-topup', {
      limit: Math.max(1, MATCHING_THROTTLED_LOAD_BATCH - (pagedCardsLength - throttledCycle.startPagedCardsLength)),
    });
  }, [additionalHasMore, hasMore, isThrottledFeedPaging, loading, pagedCardsLength, publicCardsLength, throttledCycle]);

  // Стрічка може виявитись коротшою за екран — тоді крутити нема чого, і жест
  // лишається недосяжним. Дотик робить те саме, що прокрутка.
  const handleArmFeedPaging = React.useCallback(() => {
    emptyAutoLoadMoreAttemptsRef.current = 0;
    setLastLoadAddedNothing(false);
    scrolledDownSinceLoadRef.current = true;
    setScrolledDownSinceLoad(true);
  }, []);

  // Коментарі читає лише відкрита анкета — там блок видно одразу, тож питати
  // його на місці нема сенсу.
  //
  // Стрічка не читає нічого. Раніше вона брала коментарі наперед для цілої
  // першої сторінки списку — запит на кожне відкриття стрічки заради блока, під
  // яким у більшості анкет порожньо. Тепер у рядку стоїть кнопка
  // «Перевірити наявність відгуків» (`reviewsAction` у ряду рішень), і читання
  // коштує рівно стільки разів, скільки її натиснули. Поле для власного
  // відгуку при цьому стоїть відкритим і читань не потребує — воно пише.
  const requestPublicComments = React.useCallback(profileId => {
    const id = String(profileId || '').trim();
    if (!id || publicCommentsRequestedRef.current.has(id)) return;
    publicCommentsRequestedRef.current.add(id);
    setPublicCommentsLoading(previous => ({ ...previous, [id]: true }));
    fetchPublicProfileComments([id])
      .then(result => {
        // Порожня відповідь — теж відповідь: без неї кнопка лишалась би на
        // місці, і людина тиснула б її знову за тим самим порожнім списком.
        setPublicComments(previous => ({ ...previous, [id]: result?.[id] || [] }));
      })
      .catch(error => {
        publicCommentsRequestedRef.current.delete(id);
        console.error('[Matching] Failed to load public comments', error);
      })
      .finally(() => setPublicCommentsLoading(previous => {
        const next = { ...previous };
        delete next[id];
        return next;
      }));
  }, []);

  useEffect(() => {
    if (!ownerId || !detailOpen) return;
    requestPublicComments(activeProfile?.userId);
  }, [activeProfile?.userId, detailOpen, ownerId, requestPublicComments]);

  /**
   * Усе, чого ряду рішень треба знати про відгуки цієї картки.
   *
   * Значок у ряду каже, скільки їх, і сам починає читання; вміст приїжджає
   * окремим слотом. Сама пам'ять таба лишається тут, у стрічки: рядок свого
   * «вже просили» не тримає навмисно — читання, яке впало, мусить бути можливо
   * повторити (`requestPublicComments` знімає позначку саме на помилці).
   */
  const buildRowReviewsAction = React.useCallback(profileId => ({
    count: (publicComments[profileId] || EMPTY_PUBLIC_COMMENTS).length,
    loading: Boolean(publicCommentsLoading[profileId]),
    // Чи відповідь узагалі приїхала. Порожня доріжка сама по собі про це вже
    // не каже: поле для власного відгуку стоїть у ній завжди, тож «нічого не
    // прочитали» і «прочитали, відгуків немає» виглядали б однаково.
    loaded: Boolean(publicComments[profileId]),
    onRequest: requestPublicComments,
  }), [publicComments, publicCommentsLoading, requestPublicComments]);

  const handleCreatePublicComment = React.useCallback(async (profileId, text) => {
    const created = await addPublicProfileComment({ profileId, text, authorName: viewerName });
    setPublicComments(previous => ({
      ...previous,
      [profileId]: [...(previous[profileId] || []), created],
    }));
  }, [viewerName]);

  const handleUpdatePublicComment = React.useCallback(async (profileId, commentId, text) => {
    const updated = await updatePublicProfileComment({ profileId, commentId, text });
    setPublicComments(previous => {
      const current = previous[profileId] || [];
      const next = updated
        ? current.map(comment => (comment.id === commentId
          ? { ...comment, text: updated.text, updatedAt: updated.updatedAt }
          : comment))
        : current.filter(comment => comment.id !== commentId);
      return { ...previous, [profileId]: next };
    });
  }, []);

  // Публічний запис про третю особу мусить мати кому зняти: автор прибирає
  // власний, адмін — будь-який.
  const handleDeletePublicComment = React.useCallback(async (profileId, commentId) => {
    await deletePublicProfileComment({ profileId, commentId });
    setPublicComments(previous => ({
      ...previous,
      [profileId]: (previous[profileId] || []).filter(comment => comment.id !== commentId),
    }));
  }, []);

  /**
   * Слот відгуків — один на всі списки й на обидві розкладки.
   *
   * Вміст той самий і в деці, і в плитці галереї, і серед прихованих: відгук
   * про людину не залежить від того, з якого списку на неї дивляться.
   * Збирався він досі просто в розмітці стрічки, тож список прихованих
   * показати його не міг узагалі — там рядок не отримував ані слота, ані
   * значка.
   *
   * Це той самий блок, що й у відкритій анкеті: поле для власного відгуку
   * стоїть у ньому завжди, а прочитані чужі приїжджають у `comments`, щойно
   * їх попросили значком у ряду рішень. Окремого «гейта», який до читання
   * показував замість поля напис, більше немає — написати відгук не мусить
   * починатися з читання чужих.
   */
  const buildRowReviewsSlot = React.useCallback(profileId => (
    <PublicCommentBlock
      flush
      profileId={profileId}
      backendHref={publicCommentsBackendHref(profileId)}
      comments={publicComments[profileId] || EMPTY_PUBLIC_COMMENTS}
      viewerId={auth.currentUser?.uid || ''}
      canModerate={isAdmin}
      onCreate={handleCreatePublicComment}
      onUpdate={handleUpdatePublicComment}
      onDelete={handleDeletePublicComment}
    />
  ), [
    handleCreatePublicComment,
    handleDeletePublicComment,
    handleUpdatePublicComment,
    isAdmin,
    publicComments,
    publicCommentsBackendHref,
  ]);

  /**
   * Усе, що рядок прихованої картки вміє понад «повернути».
   *
   * Контакти, відгуки, олівець і «в обране» — ті самі дії й ті самі сховища,
   * що й у стрічці: рядок один на два списки, тож і рішення в ньому мусять
   * бути одні. Межа приватності при цьому питається так само поіменно
   * (`canOfferProfileContacts`) — прихованість картки прав на контакти не
   * додає й не віднімає.
   *
   * «В обране» стоїть у парі з «повернути» навмисно: лайк прихованої анкети
   * і є її поверненням — реакція знімає дизлайк, — тож два боки одного вибору
   * лишаються в одній рамці, як серце з хрестиком у стрічці.
   */
  const buildHiddenRowExtras = React.useCallback(user => ({
    onEnrich: !isAdmin && access.canCreateProfiles ? handleRowEnrichProfile : undefined,
    onRequestContacts: handleRequestRowContacts,
    canViewContacts: canOfferProfileContacts({
      card: user,
      viewerId: ownerId,
      accessLevel: currentAccessLevel,
    }),
    contactsLoading: Boolean(rowContactsLoading[user.userId]),
    reviewsAction: buildRowReviewsAction(user.userId),
    reviewsSlot: buildRowReviewsSlot(user.userId),
    secondaryAction: {
      icon: favoriteUsers[user.userId] ? <FaHeart size={13} /> : <FaRegHeart size={13} />,
      title: uiText('В обране', language),
      accent: true,
      active: Boolean(favoriteUsers[user.userId]),
      onClick: toggleRowFavorite,
    },
  }), [
    access.canCreateProfiles,
    buildRowReviewsAction,
    buildRowReviewsSlot,
    currentAccessLevel,
    favoriteUsers,
    handleRequestRowContacts,
    handleRowEnrichProfile,
    isAdmin,
    language,
    ownerId,
    rowContactsLoading,
    toggleRowFavorite,
  ]);

  useEffect(() => {
    if (!diagnosticsEnabled || !isAdmin || diagnosticsModule) return;
    let active = true;
    import('./MatchingDiagnostics')
      .then(module => { if (active) setDiagnosticsModule(module); })
      .catch(error => console.error('[Matching] Failed to load diagnostics', error));
    return () => { active = false; };
  }, [diagnosticsEnabled, diagnosticsModule, isAdmin]);

  const showDiagnostics = diagnosticsEnabled && isAdmin && Boolean(diagnosticsModule);

  const diagnosticsPhoneIndex = useMemo(
    () => (showDiagnostics ? diagnosticsModule.buildPhoneIndex(filteredUsers) : null),
    [diagnosticsModule, filteredUsers, showDiagnostics],
  );

  // A row that the UI filters would reject but that still reached the list means
  // the filtering pipeline let it through - worth flagging as a bug, not as data.
  // Крім пошуку: там чіпи не застосовуються навмисно, тож кожен результат
  // «не проходить фільтр» за визначенням, і позначати це як помилку означало б
  // світити діагностикою на кожен запит.
  const diagnosticsFilterMisses = useMemo(() => {
    if (!showDiagnostics || viewMode === 'search') return null;
    const misses = new Set();
    filteredUsers.forEach(user => {
      if (!user?.userId) return;
      const kept = applyMatchingUiFiltersToUsers({
        users: [user],
        filters,
        filterMainFn: filterMain,
        favoriteUsers,
        dislikeUsers,
        excludeReactionUsers: false,
        roleIndexSets,
        viewMode,
      });
      if (!kept.length) misses.add(user.userId);
    });
    return misses;
  }, [
    dislikeUsers,
    favoriteUsers,
    filteredUsers,
    filters,
    roleIndexSets,
    showDiagnostics,
    viewMode,
  ]);

  const renderDiagnosticsFor = React.useCallback(user => {
    if (!showDiagnostics) return undefined;
    return (
      <React.Suspense fallback={null}>
        <MatchingDiagnostics
          user={user}
          phoneIndex={diagnosticsPhoneIndex}
          failsActiveFilter={Boolean(diagnosticsFilterMisses?.has(user?.userId))}
        />
      </React.Suspense>
    );
  }, [diagnosticsFilterMisses, diagnosticsPhoneIndex, showDiagnostics]);

  const toggleRowHidden = React.useCallback(user => {
    if (!user?.userId) return;
    rememberReactedCard(user.userId);
    const canonicalUser = feedSourceWithoutOwnEdits.find(candidate => candidate?.userId === user.userId);
    void toggleDislikeUser({
      userId: user.userId,
      userData: canonicalUser ? withLazyPhotos(canonicalUser) : { userId: user.userId },
      dislikeUsers,
      setDislikeUsers,
      ownDislikeUsers,
      setOwnDislikeUsers,
      favoriteUsers,
      setFavoriteUsers,
      ownFavoriteUsers,
      setOwnFavoriteUsers,
      multiDataOwnerId: ownerId,
    });
  }, [dislikeUsers, favoriteUsers, feedSourceWithoutOwnEdits, ownDislikeUsers, ownFavoriteUsers, ownerId, rememberReactedCard, withLazyPhotos]);

  /**
   * Шар доповнення накладається ще раз — уже поверх догідратованої анкети.
   *
   * `withLazyPhotos` накриває картку повною анкетою (`{ ...user, ...fullProfile }`),
   * а та приїжджає з бази такою, якою її бачать усі: без дописаного читачем
   * телефону і з тим самим хибним контактом, якого він у себе прибрав. Тож
   * після злиття шар кладеться вдруге — накладання ідемпотентне: додане вже
   * на місці, прибране знімається знову.
   */
  const feedRows = useMemo(
    () => feedSource.map(user => withOwnEdits(withLazyPhotos(user))),
    [feedSource, withLazyPhotos, withOwnEdits],
  );

  /**
   * Власні нотатки — для всіх показаних карток, а не для самої активної.
   *
   * Поле нотатки стоїть відкритим у кожній картці обох розкладок, тож порожнім
   * воно має бути тільки там, де нотатки справді немає: інакше читач дописував
   * би поверх власного запису, якого не бачить. Ціна при цьому не росте з
   * кількістю карток — від восьми `fetchUserComments` читає піддерево власника
   * одним запитом і кешує його (`docs/matching-feed-traffic.md`), тож плитка
   * галереї коштує рівно стільки ж, скільки список.
   */
  useEffect(() => {
    if (!feedRows.length) return;
    void loadCommentsFor(feedRows, { activeOnly: false });
  }, [feedRows, loadCommentsFor]);

  /**
   * Дві колонки галереї — за висотою, а не через одну.
   *
   * Плитка з фото важить утричі більше за плитку без нього, тож поділ парних і
   * непарних розводив колонки: одна закінчувалась на середині екрана, а картки
   * другої йшли далі стовпчиком, з порожнечею збоку. Висота не міряється, а
   * оцінюється з того, що плитка справді малює (`splitIntoBalancedColumns`).
   */
  const galleryColumns = useMemo(
    () => splitIntoBalancedColumns(feedRows, user => estimateGalleryTileHeight({
      hasPhoto: getProfilePhotos(user).length > 0,
      // Рівно ті рядки, які малює плитка: імʼя, рядок ролі й локації та до двох
      // рядків метрик. Рахуються вони наявністю полів, а не збиранням фактів:
      // будувати вузли ста карток заради оцінки висоти дорожче за саму сітку.
      textLines: 1
        + (getProfileRole(user) || getProfileLocation(user) ? 1 : 0)
        + (user?.height || user?.weight || user?.bmi || user?.rh ? 1 : 0)
        + (user?.ownKids || user?.maritalStatus || user?.csection || user?.cSection ? 1 : 0),
      hasActions: !user?.__limitedProfile,
      // Плашка нотаток стоїть у кожній повній плитці — і важить вона більше за
      // будь-який окремий рядок тексту.
      hasNotes: !user?.__limitedProfile,
    })),
    [feedRows],
  );

  // Кнопка називає те, куди веде, а не те, де стоїмо: так один значок
  // перебирає обидві розкладки, і читач бачить наступну наперед.
  const nextViewLayout = nextMatchingViewLayout(viewLayout);
  const nextViewLayoutLabel = uiText(MATCHING_VIEW_LAYOUT_LABELS[nextViewLayout], language);
  const nextViewLayoutIcon = nextViewLayout === 'list' ? <FaListUl /> : <FaThLarge />;

  const matchingMenuActions = [
    {
      key: 'viewLayout',
      label: nextViewLayoutLabel,
      description: uiText('Перемкнути вигляд стрічки', language),
      icon: nextViewLayoutIcon,
      onClick: toggleViewLayout,
    },
    ...(isAdmin ? [{
      key: 'diagnostics',
      label: uiText('Діагностика', language),
      description: uiText('Показати проблеми в даних анкет', language),
      icon: <FaStethoscope />,
      active: diagnosticsEnabled,
      onClick: () => setDiagnosticsEnabled(current => !current),
    }] : []),
    {
      key: 'refreshCache',
      label: uiText('Оновити кеш', language),
      description: uiText('Скинути фільтри й перезавантажити анкети', language),
      icon: <FaSyncAlt />,
      onClick: resetFiltersAndCache,
    },
  ];

  const dotsMenu = () => (
    <ProfileDotsMenu
      navigate={navigate}
      isAdmin={isAdmin}
      access={access}
      onExit={handleExit}
      onSelect={() => setShowInfoModal(false)}
      beforeNavigate={saveScrollPosition}
      extraActions={matchingMenuActions}
      extraActionsLabel="Matching"
    />
  );

  return (
    <>
      {showFilters && <FilterOverlay show={showFilters} onClick={() => setShowFilters(false)} />}
      <FilterContainer
        show={showFilters}
        $themeMode={themeMode}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="matching-filter-title"
      >
        <FilterDrawerHeader>
          <FilterDrawerTitle>
            <FilterDrawerHeading id="matching-filter-title">{uiText('Фільтри matching', language)}</FilterDrawerHeading>
            <FilterDrawerSubtitle>{filterDrawerSubtitle}</FilterDrawerSubtitle>
          </FilterDrawerTitle>
          <FilterDrawerClose
            type="button"
            aria-label={uiText('Закрити фільтри', language)}
            title={uiText('Закрити фільтри', language)}
            onClick={() => setShowFilters(false)}
          >
            <FaTimes />
          </FilterDrawerClose>
        </FilterDrawerHeader>
        <FilterDrawerBody>
          <FilterPanel
            mode="matching"
            hideUserId
            hideCommentLength
            onChange={handleFiltersChange}
            resetToken={filterResetToken}
            groupResetToken={filterGroupReset.token}
            groupResetName={filterGroupReset.name}
            groupSelectToken={filterGroupSelect.token}
            groupSelectName={filterGroupSelect.name}
            groupSelectValue={filterGroupSelect.value}
            nonAdminAllActive={!isAdmin}
          />
        </FilterDrawerBody>
        <FilterDrawerFooter>
          <FilterResetButton type="button" onClick={resetFiltersAndCache}>
            Скинути фільтри й оновити кеш
          </FilterResetButton>
          <FilterApplyButton type="button" onClick={applyDraftFilters}>
            Показати {draftFilteredCount}
          </FilterApplyButton>
        </FilterDrawerFooter>
      </FilterContainer>
      <Container $themeMode={themeMode}>
        <InnerContainer>
          <MatchingTopBar>
            <SearchField>
              <FaSearch aria-hidden="true" />
              <SearchBar
                searchFunc={searchUsers}
                search={searchQuery}
                setSearch={setSearchQuery}
                debounceMs={MATCHING_SEARCH_DEBOUNCE_MS}
                setUsers={handleMatchingSearchResults}
                setState={handleMatchingSearchStateStatus}
                setUserNotFound={handleMatchingSearchNotFound}
                wrapperStyle={{ width: '100%', margin: 0, border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' }}
                leftIcon={null}
                placeholder={uiText('Пошук', language)}
                inputAriaLabel={uiText('Пошук профілів', language)}
                storageKey={SEARCH_KEY}
                onSearchKey={handleMatchingSearchKey}
                onSearchExecuted={handleMatchingSearchExecuted}
                onSearchCommitted={handleMatchingSearchCommitted}
                onSearchError={handleMatchingSearchError}
                onClear={handleSearchCleared}
                enabledSearchKeys={MATCHING_SEARCH_BAR_ENABLED_KEYS}
                searchOptions={{
                  searchIdPrefixes: MATCHING_SEARCH_ID_PREFIXES,
                  enabledSearchKeys: MATCHING_SEARCH_BAR_ENABLED_KEYS,
                  cacheScope: { collections: ['users'] },
                  limitedFields: !hasFullProfileAccess,
                  // Видача малюється карткою; анкета читається на дотик, коли
                  // картку відкрили (`ensureFullProfile`). Див. `addCardHit`.
                  cardsOnly: true,
                }}
              />
            </SearchField>
            <TopActions>
              <TopActionGroup aria-label={uiText('Фільтри matching', language)}>
                <ActionButton
                  type="button"
                  onClick={() => setShowFilters(s => !s)}
                  $active={showFilters || activeFilterGroupCount > 0}
                  aria-label={uiText(showFilters ? 'Закрити фільтри' : 'Відкрити фільтри', language)}
                  title={uiText(showFilters ? 'Закрити фільтри' : 'Відкрити фільтри', language)}
                >
                  <FaFilter />
                  {activeFilterGroupCount > 0 && <ActionBadge>{activeFilterGroupCount}</ActionBadge>}
                </ActionButton>
              </TopActionGroup>
              {(showBackendTrafficToggle || isIndexedDebugTestUser) && (
                <TopActionGroup aria-label={uiText('Адміністративні дії matching', language)}>
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
                {isIndexedDebugTestUser && (
                  <BackendTrafficToggleButton
                    type="button"
                    $active={debugShowAllIndexedCards}
                    aria-pressed={debugShowAllIndexedCards}
                    title="Show filtered cards"
                    aria-label="Show filtered cards"
                    onClick={() => {
                      const next = !debugShowAllIndexedCards;
                      setDebugShowAllIndexedCards(next);
                      localStorage.setItem(MATCHING_DEBUG_SHOW_ALL_INDEXED_CARDS_KEY, next ? 'true' : 'false');
                      console.info('[Matching][debugShowAllIndexedCardsChanged]', { enabled: next });
                    }}
                  >
                    🪲
                    <BackendTrafficToggleStatus>{debugShowAllIndexedCards ? 'ALL' : 'NORMAL'}</BackendTrafficToggleStatus>
                  </BackendTrafficToggleButton>
                )}
                </TopActionGroup>
              )}
              {/* The "⋮" menu never shares a button group with the page's other action buttons -
                  it sits on its own, right after them, not inside a TopActionGroup pill. */}
              <ActionButton
                type="button"
                aria-label={uiText('Відкрити меню профілю', language)}
                title={uiText('Відкрити меню профілю', language)}
                onClick={() => setShowInfoModal('dotsMenu')}
              >
                <FaEllipsisV />
              </ActionButton>
            </TopActions>
          </MatchingTopBar>
          {matchingSearchStatus && (
            <MatchingSearchStatusMessage aria-live="polite">
              {matchingSearchStatus}
            </MatchingSearchStatusMessage>
          )}
          <ChipsRow role="group" aria-label={uiText(isSearching ? 'Результати пошуку' : 'Колекції matching', language)}>
            <ChipsGroup>
              {(isSearching ? searchChips : collectionChips).map(chip => {
                const active = isSearching ? searchTab === chip.key : viewMode === chip.key;
                return (
                  <Chip
                    key={chip.key}
                    type="button"
                    $active={active}
                    aria-pressed={active}
                    disabled={!isSearching && !ownerId}
                    onClick={chip.onSelect}
                    title={chip.title}
                  >
                    <span>{chip.label}</span>
                    {chip.count !== undefined && <ChipCount>{chip.count}</ChipCount>}
                  </Chip>
                );
              })}
              {visibleFilterChips.map(chip => (
                <Chip
                  key={chip.filterName}
                  type="button"
                  $active
                  $danger={chip.danger}
                  title={uiText('{text} — повернути групу в дефолт', language, { text: chip.text })}
                  onClick={() => resetFilterGroup(chip.filterName)}
                >
                  <span>{chip.text}</span>
                  <ChipRemove aria-hidden="true">✕</ChipRemove>
                </Chip>
              ))}
              {hiddenFilterChipCount > 0 && (
                <Chip
                  type="button"
                  aria-expanded={false}
                  title={uiText('Показати ще {count} активних фільтрів', language, { count: hiddenFilterChipCount })}
                  onClick={() => setShowAllFilterChips(true)}
                >
                  <span>+{hiddenFilterChipCount}</span>
                </Chip>
              )}
              {showAllFilterChips && filterChips.length > MAX_FILTER_CHIPS && (
                <Chip
                  type="button"
                  aria-expanded
                  title={uiText('Згорнути список активних фільтрів', language)}
                  onClick={() => setShowAllFilterChips(false)}
                >
                  <span>{uiText('Згорнути', language)}</span>
                </Chip>
              )}
            </ChipsGroup>
            <LayoutToggleButton
              type="button"
              onClick={toggleViewLayout}
              aria-label={nextViewLayoutLabel}
              title={nextViewLayoutLabel}
            >
              {nextViewLayoutIcon}
            </LayoutToggleButton>
          </ChipsRow>
          {showRefineBar && (
            <SearchRefineBar
              users={visibleUsers}
              activeKey={refineKey}
              activeValue={refineActiveValue}
              shownCount={isSearching ? filteredUsers.length : undefined}
              onChangeKey={handleRefineKeyChange}
              onSelectValue={handleRefineSelect}
              keysAvailableInFeedOnly={!isSearching}
              // У стрічці числа рахуються по завантаженому, а не по всій базі —
              // і рядок каже це прямо, а не вдає точність, якої не має.
              scanNote={isSearching ? '' : uiText('серед завантажених', language)}
            />
          )}
          {/* «Owner not found» стояло тут англійським рядком у коді й нічого
              читачеві не пояснювало: незалогінений бачив цей напис під вічним
              скелетоном і не мав звідси жодного виходу. Порожній `ownerId`
              означає «сесії немає» — і каже про це словом, з кнопкою на вхід;
              `null` означає «ще питаємо Firebase». */}
          {/* `as="div"`, бо всередині кнопка: `OwnerStatusMessage` — це `p`, а
              браузер розриває абзац на першому ж блоковому нащадку, і кнопка
              поїхала б з-під власного тексту. */}
          {!ownerId && (
            <OwnerStatusMessage as="div">
              {ownerId === '' ? (
                <>
                  <div>{uiText('Щоб бачити анкети, увійдіть у застосунок', language)}</div>
                  <ActionButton
                    type="button"
                    onClick={() => navigate(LOGIN_ROUTE, { state: { returnTo: buildReturnToFromLocation(routeLocation) } })}
                    aria-label={uiText('Увійти', language)}
                  >
                    {uiText('Увійти', language)}
                  </ActionButton>
                </>
              ) : uiText('Перевіряємо сесію…', language)}
            </OwnerStatusMessage>
          )}

          {viewMode === 'dislikes' && viewLayout === 'list' ? (
            <MatchingHiddenList
              ownerId={ownerId}
              // Ті самі догідратовані рядки, що й у стрічці: без повної анкети
              // кнопці контактів у прихованому рядку не було б що показати, а
              // власне доповнення не лягло б на картку.
              users={feedRows}
              hasMore={hasMore}
              loading={loading}
              loadMore={loadMore}
              dislikeUsers={dislikeUsers}
              setDislikeUsers={setDislikeUsers}
              ownDislikeUsers={ownDislikeUsers}
              setOwnDislikeUsers={setOwnDislikeUsers}
              isAdmin={isAdmin}
              onGoToFeed={handleDefaultModeClick}
              onEditProfile={handleRowEditProfile}
              onOpenProfile={openDetailFor}
              buildRowExtras={buildHiddenRowExtras}
            />
          ) : (
            <FeedWrap>
              {/* Перший рядок видачі — сама відповідь «такої ще немає»: набране
                  вже розкладене в поле картки, і кнопка веде просто у форму з
                  ним. Доти ця відповідь жила чіпом над видачею, тобто там, де
                  її читають фільтром, а в яке поле ляже набране, читач бачив
                  аж у формі. */}
              {isSearching && queryDraft && access.canCreateProfiles && (
                <QueryDraftCard data-testid="query-draft-card">
                  <QueryDraftBody>
                    <QueryDraftLabel>{queryDraft.label}</QueryDraftLabel>
                    <QueryDraftValue>{queryDraft.value}</QueryDraftValue>
                    {queryDraft.note && <QueryDraftNote>{queryDraft.note}</QueryDraftNote>}
                  </QueryDraftBody>
                  <QueryDraftButton
                    type="button"
                    onClick={handleCreateFromQuery}
                    title={uiText('Створити картку з набраного', language)}
                  >
                    Створити
                  </QueryDraftButton>
                </QueryDraftCard>
              )}
              {feedRows.length > 0 && viewLayout === 'gallery' && (
                <GalleryGrid $restoringScroll={scrollRestorePending}>
                  {galleryColumns.map((columnRows, columnIndex) => (
                    <GalleryColumn key={`gallery-column-${columnIndex}`}>
                      {columnRows
                        .map(user => (
                          <GalleryCard
                            key={user.userId}
                            user={user}
                            isAdmin={isAdmin}
                            isFavorite={Boolean(favoriteUsers[user.userId])}
                            isHidden={Boolean(dislikeUsers[user.userId])}
                            onOpen={openDetailFor}
                            onToggleFavorite={toggleRowFavorite}
                            onToggleHidden={toggleRowHidden}
                            onTogglePublish={togglePublish}
                            onEnrich={!isAdmin && access.canCreateProfiles ? handleRowEnrichProfile : undefined}
                            clientComment={comments[user.userId] || ''}
                            onCommentSave={handleRowCommentSave}
                            reviewsSlot={buildRowReviewsSlot(user.userId)}
                            reviewsAction={buildRowReviewsAction(user.userId)}
                            diagnosticsSlot={renderDiagnosticsFor(user)}
                          />
                        ))}
                    </GalleryColumn>
                  ))}
                </GalleryGrid>
              )}
              {feedRows.length > 0 && viewLayout === 'list' && (
                <FeedList $restoringScroll={scrollRestorePending}>
                  {feedRows.map(user => (
                    <ProfileRow
                      key={user.userId}
                      user={user}
                      isAdmin={isAdmin}
                      onTogglePublish={togglePublish}
                      expanded={expandedRowIds.has(user.userId)}
                      onToggleExpand={handleToggleRowExpand}
                      onOpen={openDetailFor}
                      onEditProfile={handleRowEditProfile}
                      onContactsOpened={handleRowContactsOpened}
                      onRequestContacts={handleRequestRowContacts}
                      canViewContacts={canOfferProfileContacts({
                        card: user,
                        viewerId: ownerId,
                        accessLevel: currentAccessLevel,
                      })}
                      contactsLoading={Boolean(rowContactsLoading[user.userId])}
                      priorityMetricKeys={priorityMetricKeys}
                      onSwipeRight={toggleRowFavorite}
                      onSwipeLeft={toggleRowHidden}
                      diagnosticsSlot={renderDiagnosticsFor(user)}
                      onEnrich={!isAdmin && access.canCreateProfiles ? handleRowEnrichProfile : undefined}
                      clientComment={comments[user.userId] || ''}
                      onCommentSave={handleRowCommentSave}
                      reviewsSlot={buildRowReviewsSlot(user.userId)}
                      reviewsAction={buildRowReviewsAction(user.userId)}
                      primaryAction={{
                        icon: favoriteUsers[user.userId] ? <FaHeart size={13} /> : <FaRegHeart size={13} />,
                        title: uiText('В обране', language),
                        accent: true,
                        active: Boolean(favoriteUsers[user.userId]),
                        onClick: toggleRowFavorite,
                      }}
                      secondaryAction={{
                        icon: dislikeUsers[user.userId] ? <FaUndoAlt size={13} /> : <FaTimes size={14} />,
                        title: uiText(dislikeUsers[user.userId] ? 'Повернути зі схованих' : 'Приховати', language),
                        active: Boolean(dislikeUsers[user.userId]),
                        onClick: toggleRowHidden,
                      }}
                    />
                  ))}
                </FeedList>
              )}
              {loading && feedRows.length === 0 && <MatchingSkeleton />}
              {!loading && feedRows.length === 0 && !loadError && (
                <FeedNotice>{emptyFeedMessage}</FeedNotice>
              )}
              {loadError && feedRows.length === 0 && (
                <FeedNotice role="alert">
                  <div>{uiText('Не вдалося завантажити профілі.', language)}</div>
                  <div>{loadError.userMessage}</div>
                  <ActionButton type="button" onClick={reloadDefault} aria-label={uiText('Повторити завантаження', language)}>
                    Спробувати ще раз
                  </ActionButton>
                </FeedNotice>
              )}
              {showStandaloneBatchSummary && (
                <FeedCountdown data-testid="feed-batch-summary">
                  <FeedCountdownHint>{feedBatchSummaryText}</FeedCountdownHint>
                </FeedCountdown>
              )}
              {showFeedLoadPrompt && (
                <FeedCountdown>
                  <FeedLoadPromptButton type="button" onClick={handleArmFeedPaging}>
                    {uiText('Показати ще {count}', language, { count: MATCHING_THROTTLED_LOAD_BATCH })}
                  </FeedLoadPromptButton>
                  {/* Підсумок щойно завершеної порції говорить із того самого
                      місця, де стоїть наступний жест: спершу «що приїхало», і
                      лише коли сказати нема чого — звична підказка. */}
                  <FeedCountdownHint data-testid={feedBatchSummaryText ? 'feed-batch-summary' : undefined}>
                    {feedBatchSummaryText || (lastLoadAddedNothing
                      ? uiText('Минула порція не дала нових карток — під ці фільтри більше нічого не підійшло', language)
                      : uiText('Прокрутіть донизу, щоб запустити відлік', language))}
                  </FeedCountdownHint>
                </FeedCountdown>
              )}
              {showFeedLoadCountdown && (
                <FeedLoadCountdown
                  durationMs={MATCHING_THROTTLED_LOAD_DELAY_MS}
                  batchSize={MATCHING_THROTTLED_LOAD_BATCH}
                  cycleKey={publicCardsLength}
                  onElapsed={handleThrottledFeedLoad}
                />
              )}
              {/* Між нулем відліку і новими картками кінець списку інакше порожній,
                  і пауза читалась би як «зламалось». */}
              {isThrottledFeedPaging && loading && renderedCardsLength > 0 && (
                <FeedCountdown>
                  <FeedCountdownHint>{uiText('Завантажую…', language)}</FeedCountdownHint>
                </FeedCountdown>
              )}
              <FeedSentinel ref={feedSentinelRef} />
            </FeedWrap>
          )}

          {/* Spec §7: a layer over the feed. The feed keeps its DOM and its
              scroll position underneath, so closing costs no reload. */}
          {detailIndex !== null && (
          <DetailLayer
            $themeMode={themeMode}
            $bounce={detailBounce}
            role="dialog"
            aria-modal="true"
            aria-label={uiText('Профіль', language)}
          >
            <DetailInner>
              <DetailBar>
                <DetailCloseButton
                  type="button"
                  onClick={closeDetail}
                  aria-label={uiText('Закрити профіль', language)}
                  title={uiText('Закрити профіль', language)}
                >
                  <FaChevronLeft />
                </DetailCloseButton>
                <DetailPosition aria-live="polite">
                  {detailIndex + 1} / {feedSource.length}
                </DetailPosition>
              </DetailBar>
          <Grid>
            {activeProfileWithLazyPhotos ? (() => {
              const user = activeProfileWithLazyPhotos;
              const canonicalUser = feedSourceWithoutOwnEdits.find(candidate => candidate?.userId === user.userId);
              const canonicalUserData = canonicalUser ? withLazyPhotos(canonicalUser) : { userId: user.userId };
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
                      aria-label="Previous profile" title={uiText('Попередній профіль', language)}
                    >
                      <FaChevronLeft />
                    </ModernDesktopNavButton>
                    <ModernDesktopNavButton
                      type="button"
                      $side="right"
                      onClick={e => { e.stopPropagation(); navigateActiveProfile(1); }}
                      disabled={activeProfileIndex >= filteredUsers.length - 1 && (!hasMore || loading)}
                      aria-label="Next profile" title={uiText('Наступний профіль', language)}
                    >
                      <FaChevronRight />
                    </ModernDesktopNavButton>
                    <SwipeableCard
                      user={user}
                      canonicalUserData={canonicalUserData}
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
                      onReacted={rememberReactedCard}
                      togglePublish={togglePublish}
                      multiDataOwnerId={ownerId}
                      onNavigate={navigateActiveProfile}
                      commentValue={comments[user.userId] || ''}
                      sharedCommentTexts={sharedComments[user.userId] || []}
                      onCommentChange={val => {
                        commentsRef.current = { ...commentsRef.current, [user.userId]: val };
                        setComments(prev => ({ ...prev, [user.userId]: val }));
                      }}
                      publicCommentSlot={(
                        <PublicCommentBlock
                          flush
                          profileId={user.userId}
                          backendHref={publicCommentsBackendHref(user.userId)}
                          comments={publicComments[user.userId] || EMPTY_PUBLIC_COMMENTS}
                          viewerId={auth.currentUser?.uid || ''}
                          canModerate={isAdmin}
                          onCreate={handleCreatePublicComment}
                          onUpdate={handleUpdatePublicComment}
                          onDelete={handleDeletePublicComment}
                        />
                      )}
                      onCommentBlur={async () => {
                        if (auth.currentUser) {
                          const text = comments[user.userId] || '';
                          try {
                            const res = await saveMyCardComment(user.userId, text, ownerId);
                            dispatchedCommentSaveRef.current = { cardId: user.userId, text };
                            setLocalComment(ownerId, user.userId, text, res?.lastAction);
                            dispatchedCommentSaveRef.current = null;
                          } catch (error) {
                            dispatchedCommentSaveRef.current = null;
                            const details = error?.message || String(error);
                            toast.error(uiText('Не вдалося зберегти коментар: {details}', language, { details }));
                          }
                        }
                      }}
                      onAdminEdit={() => {
                        lastSeenCardIdRef.current = user.userId || '';
                        saveScrollPosition();
                        navigate(`/edit/${user.userId}`, { state: user });
                      }}
                      onEnrich={!isAdmin && access.canCreateProfiles ? handleRowEnrichProfile : undefined}
                      showDebugRejectReasons={debugShowAllIndexedCards && isIndexedDebugTestUser}
                      debugFilteredOutReason={(() => {
                        const canShowDebug = getCanShowMatchingUserDebug(user, { isAdmin });
                        const reasonFromPipeline = debugFilteredOutReasonById.get(user?.userId) || '';
                        if (!canShowDebug.canShow) return 'blocked_by_canShowMatchingUser';
                        if (reasonFromPipeline === 'excluded_by_ui_filter') {
                          const failedFilters = debugUiFilterFailedFiltersById.get(user?.userId) || '';
                          return failedFilters ? 'blocked_by_ui_filter' : 'blocked_by_final_render_guard';
                        }
                        return reasonFromPipeline;
                      })()}
                      debugRejectReasons={[]}
                      debugUiFilterSummary={getMatchingUiFilterDebugSummary(filters)}
                      debugUiFilterFailedFilters={debugUiFilterFailedFiltersById.get(user?.userId) || ''}
                      debugCardDiagnostics={(() => {
                        const oldDiagnostics = debugCardDiagnosticsById.get(user?.userId) || null;
                        const canShowDebug = getCanShowMatchingUserDebug(user, { isAdmin });
                        return {
                          ...(oldDiagnostics && typeof oldDiagnostics === 'object' ? oldDiagnostics : {}),
                          excludedFunction: canShowDebug.excludedFunction,
                          excludedCondition: canShowDebug.excludedCondition,
                          exactReason: canShowDebug.exactReason,
                          excludedAtStage: canShowDebug.excludedAtStage,
                        };
                      })()}
                    />
                  </CardWrapper>
                </CardContainer>
              );
            })() : loadError ? (
              <OwnerStatusMessage role="alert">
                <div>{uiText('Не вдалося завантажити профілі.', language)}</div>
                <div>{loadError.userMessage}</div>
                <div>{uiText('Етап:', language)} {loadError.requestLabel}</div>
                <details>
                  <summary>{uiText('Технічні деталі', language)}</summary>
                  <div>{uiText('Етап:', language)} {loadError.requestLabel}</div>
                  <div>{uiText('Код:', language)} {loadError.code}</div>
                  <div>{uiText('Тип:', language)} {loadError.name}</div>
                  <div>{uiText('Повідомлення:', language)} {loadError.message}</div>
                  <div>{uiText('Спроба:', language)} {loadError.requestId}</div>
                  <div>{uiText('Мережа:', language)} {loadError.online === false ? 'offline' : 'online'}</div>
                  <div>{uiText('Час:', language)} {loadError.timestamp}</div>
                  <div>
                    Trace: {(loadError.trace || initialLoadTrace).map(item => `${item.stage} ${item.status === 'completed' ? '✓' : item.status === 'failed' ? '✕' : '…'}`).join(' → ') || uiText('немає подій', language)}
                  </div>
                  <ActionButton
                    type="button"
                    onClick={async () => {
                      try {
                        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
                        await navigator.clipboard.writeText(JSON.stringify(loadError, null, 2));
                        toast.success(uiText('Діагностику скопійовано', language));
                      } catch {
                        toast.error(uiText('Не вдалося скопіювати діагностику', language));
                      }
                    }}
                    aria-label={uiText('Копіювати діагностику', language)}
                  >
                    Копіювати діагностику
                  </ActionButton>
                </details>
                <ActionButton type="button" onClick={reloadDefault} aria-label={uiText('Повторити завантаження', language)}>
                  Спробувати ще раз
                </ActionButton>
              </OwnerStatusMessage>
            ) : loading ? (
              <MatchingSkeleton />
            ) : (
              <OwnerStatusMessage>{emptyFeedMessage}</OwnerStatusMessage>
            )}
          </Grid>
            </DetailInner>
          </DetailLayer>
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
