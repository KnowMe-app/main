import React, { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import * as XLSX from 'xlsx';
// import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import {
  auth,
  searchUsersCollectionInRTDB,
  updateProfileNodesInRTDB,
  updateDataInRealtimeDB,
  fetchFavoriteUsers,
  fetchDislikeUsers,
  isReactionPermissionDeniedError,
  fetchCycleUsersData,
  // fetchListOfUsers,
  makeNewUser,
  // removeSearchId,
  // createSearchIdsForAllUsers,
  fetchUserById,
  fetchAllSearchQueryOwners,
  removeMatchingSearchQuery,
  loadDuplicateUsers,
  removeCardAndSearchId,
  fetchAllUsersFromRTDB,
  addStimulationShortcutId,
  removeStimulationShortcutId,
  replaceStimulationShortcutIds,
  fetchStimulationShortcutIds,
  filterMain,
  pruneSearchIdValues,
  syncUserSearchIdIndex,
  syncUserSearchKeyIndex,
  createMatchingCardsIndex,
  backfillProfileDraftOwners,
  backfillMatchingCardPublicReviewFlags,
  backfillMatchingCardBlood,
  backfillAvatarCacheControl,
  backfillFeedPhotoThumbs,
  createSelectedSearchKeyIndexes,
  buildSearchIdIndexPayloadFromCollections,
  buildSearchKeyIndexPayloadFromCollections,
  createCardListBackendAdapters,
  lazyLoadProfilePhotos,
  addMatchingSearchQuery,
  saveMyCardComment,
} from './config';
import { CardListQueryControls } from './CardListQueryControls';
import {
  CARD_LIST_FILTER,
  CARD_LIST_PRIMARY_PRESETS,
  DEFAULT_CARD_LIST_QUERY,
  buildCardListQueryKey,
  cardListKeepsValue,
  describeCardListQuery,
  findCardListPreset,
  getCardListField,
  normalizeCardListQuery,
  queryFromLegacyListState,
} from 'utils/cardListQuery';
import { describeCardListStats, loadCardListPage, restoreCardListState } from 'utils/cardListEngine';
import {
  BucketChip,
  BucketGrid,
  CheckGroup,
  CheckGroupNote,
  CheckGroupTitle,
  CheckHint,
  CheckRow,
  ConsoleBody,
  ConsoleChevron,
  ConsoleHeader,
  ConsoleHint,
  ConsolePanel,
  ConsoleTitle,
  StepButton,
  StepHint,
  ModalTitleRow,
  ToolButton,
  ToolCount,
  ToolDrawer,
  ToolDrawerNote,
  ToolDrawerTitle,
  ToolGroup,
  ToolGroupNote,
  ToolGroupTitle,
  ListPanel,
  CollectionRow,
  CollectionChip,
  EmptySearchResult,
  StimulationRow,
  StimulationLabel,
  ToolRow,
} from './AddNewProfileAdminPanel.styled';
import { OverlayReviewQueue } from './AddNewProfileOverlayReview';
import { makeUploadedInfo } from './makeUploadedInfo';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { readStoredCanCreateProfiles, resolveAccess } from 'utils/accessLevel';
// Batch 26 §8: тумблер стрілок «перейти до вузла в Firebase». Ключ спільний з тими,
// хто ці стрілки показує, — див. `utils/backendLinksMode`.
import { PROFILE_FORM_EXTENDED_MODE_KEY, readBackendLinksEnabled } from 'utils/backendLinksMode';
import { describePublicReviewFlagBackfill } from 'utils/publicReviewFlagBackfillReport';
import { describeMatchingCardBloodBackfill } from 'utils/matchingCardBloodBackfillReport';
import { describeAvatarCacheControlBackfill, describeFeedPhotoThumbsBackfill } from 'utils/photoBackfillReport';
import { normalizePhoneState } from './inputValidations';
import { openComparedCard as openComparedCardNavigation, restoreComparedCard } from './comparedCardNavigation';
import { buildOverlayFromDraft, getCanonicalCard, saveOverlayForUserCard } from 'utils/multiAccountEdits';
import InfoModal, { ModalTitle, ModalText, ModalActionRow, ModalDangerButton, ModalGhostButton } from './InfoModal';

import { color, coloredCard, uiTokens } from './styles';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import { KmIconButton } from './styles/knowme';
//import { formatPhoneNumber } from './inputValidations';
import { UsersList } from './UsersList';
import {
  getFavorites,
  syncFavorites,
} from 'utils/favoritesStorage';
import { cacheDplUsers, getDplCards } from 'utils/dplStorage';
import {
  getDislikes,
  syncDislikes,
} from 'utils/dislikesStorage';
import { REACTION_FILTER_OPTIONS } from 'utils/reactionCategory';
import {
  setIdsForQuery,
  setQueryPagination,
  getQueryEntry,
  getCard,
  getCardsByIds,
  loadCards,
  normalizeQueryKey,
  serializeQueryFilters,
  TTL_MS as CARD_CACHE_TTL_MS,
} from 'utils/cardIndex';
import {
  getStoredStimulationShortcutIds,
  setStoredStimulationShortcutIds,
  addStoredStimulationShortcutId,
  removeStoredStimulationShortcutId,
} from 'utils/stimulationShortcutStorage';
// import ExcelToJson from './ExcelToJson';
import { saveToContact, saveToContactCsv } from './ExportContact';
import { TopBlock } from './smallCard/renderTopBlock';
import StimulationSchedule from './StimulationSchedule';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';
// import { UploadJson } from './topBtns/uploadNewJSON';
import { btnMerge } from './smallCard/btnMerge';
import FilterPanel, { getInitialFilters } from './FilterPanel';
import SearchBar, { detectSearchParams, getSearchCacheKeyForParams } from './SearchBar';
import { Pagination } from './Pagination';
import { ProfileForm, getFieldsToRender } from './ProfileForm';
import {
  sanitizeTechnicalPayload,
} from './formFields';
import { PAGE_SIZE, database } from './config';
import { CONTACT_LINK_BUILDERS } from './contactMethods';
import { get as firebaseGet, ref } from 'firebase/database';
import {
  getBackendDownloadToastsEnabled,
  setBackendDownloadToastsEnabled,
  withAdminDownloadToast,
} from 'utils/backendDownloadToast';
import { purgeLegacyOfflineUsersCopy } from 'utils/legacyOfflineUsersPurge';
// import JsonToExcelButton from './topBtns/btnJsonToExcel';
// import { aiHandler } from './aiHandler';
import {
  setFavoriteIds,
  clearAllCardsCache,
  updateCachedUser,
  getCacheKey,
} from 'utils/cache';
import { updateCard, saveCard } from 'utils/cardsStorage';
import {
  fetchProfileRecordById,
  getDraftRecordCreator,
  isDraftProfileRecord,
  rememberDraftRecordRevision,
  saveDraftProfileRecord,
} from 'utils/profileRecordSource';
import {
  formatDateAndFormula,
  formatDateToDisplay,
  formatDateToServer,
} from 'components/inputValidations';
import { sortUsersByStimulationSchedule } from 'utils/stimulationScheduleSort';
import { convertDriveLinkToImage } from 'utils/convertDriveLinkToImage';
import { rebuildAllFilterSetIndexes } from 'utils/filterSetsIndex';
import { buildMatchingCardsPayloadFromCollections } from 'utils/matchingCardIndex';
import {
  LEGACY_IMPORT_COMMENT_OWNER_ID,
  LEGACY_IMPORT_ID_PREFIXES,
  migrateLegacyImportCommentsToPublic,
} from 'utils/legacyImportCommentMigration';
import {
  PROFILE_NODE_NAMES,
  mergeProfileNodeCollections,
  describeLocalIndexingSources,
} from 'utils/profileNodeCollections';
import {
  PROFILE_DRAFTS_INDEX_NODE,
  collectDraftProfilesForIndexing,
} from 'utils/profileDraftIndexing';
import { buildFullCardKeyMap } from 'utils/cardKeyMap';

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'AddNewProfile',
    path: args[0],
  });

const getLocalStorageCardsDebugSnapshot = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    return loadCards();
  } catch (error) {
    return {
      parseError: error?.message || String(error),
      raw: localStorage.getItem('cards'),
    };
  }
};

const logRenderSource = (source, card) => {
  if (!card?.userId) return;
  console.log('[RENDER SOURCE]', source, card.userId, card.getInTouch);
};

const hasProfilePhotos = card => {
  if (!card) return false;
  if (Array.isArray(card.photos)) return card.photos.some(Boolean);
  if (card.photos && typeof card.photos === 'object') return Object.values(card.photos).some(Boolean);
  return Boolean(
    card.photoURL ||
      card.photoUrl ||
      card.mainPhoto ||
      card.userPhoto ||
      card.avatar ||
      card.photo ||
      card.image ||
      card.picture
  );
};

const normalizeTruthyMap = value =>
  Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => Boolean(item)),
  );

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 5px;
  background-color: ${uiTokens.colors.pageBg};

  @media (max-width: 768px) {
    // Медіа-запит для пристроїв з шириною екрану до 768px
    padding: 10px;
  }
  /* max-width: 560px; */

  /* maxWidth:  */
  /* height: 100vh; */
`;

const MoreActionsInfo = styled.p`
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--km-text);
`;

const MoreActionsCommandButton = styled.button`
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 2px solid
    ${({ $tone }) =>
      $tone === 'like'
        ? color.reactionLike
        : $tone === 'dislike'
          ? color.reactionDislike
          : color.reactionIdleBorder};
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === 'like'
      ? color.reactionLikeBg
      : $tone === 'dislike'
        ? color.reactionDislikeBg
        : color.accent5};
  cursor: pointer;
  font-size: 14px;
  color: ${({ $tone }) =>
    $tone === 'like'
      ? color.reactionLike
      : $tone === 'dislike'
        ? color.reactionDislike
        : color.reactionIdleIcon};
  font-weight: 600;
  transition: transform 0.15s ease, filter 0.15s ease;

  &:hover {
    filter: brightness(0.97);
  }

  &:active {
    transform: scale(0.98);
  }
`;

const MatchingMiniList = styled.div`
  max-height: 50vh;
  overflow: auto;
  margin-top: 8px;
  border-top: 1px solid var(--km-border);
  padding-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  > p {
    grid-column: 1 / -1;
  }
`;

const MatchingMiniCard = styled.div`
  border-radius: 12px;
  overflow: hidden;
  background: var(--km-card);
  border: 1px solid var(--km-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`;

const MatchingMiniCardShell = styled.div`
  position: relative;
  width: 100%;
  min-height: 180px;
  background: var(--km-border);
  cursor: pointer;
`;

const MatchingMiniReactionBadge = styled.div`
  font-size: 12px;
  line-height: 1.2;
  color: var(--km-muted);
  padding: 8px 10px 0;
`;

const MatchingMiniMainPhoto = styled.img`
  width: 100%;
  height: 180px;
  object-fit: cover;
  display: block;
`;

const MatchingMiniFallback = styled.div`
  width: 100%;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--km-muted);
  font-size: 13px;
`;

const MatchingMiniOverlay = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.05));
  color: #fff;
`;

const MatchingMiniName = styled.div`
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
`;

const MatchingMiniMeta = styled.div`
  font-size: 12px;
  opacity: 0.92;
  margin-top: 2px;
`;

const InnerContainer = styled.div`
  max-width: 560px;
  width: 100%;
  box-sizing: border-box;
  background-color: var(--km-card);
  padding: 16px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;

  @media (max-width: 768px) {
    // Медіа-запит для пристроїв з шириною екрану до 768px
    background-color: ${uiTokens.colors.pageBg};
    box-shadow: 0 4px 8px var(--km-border);
    border-radius: 0;
    padding: 0;
  }
`;


export const SubmitButton = styled.button`
  padding: 11px 14px;
  color: var(--km-text);
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  align-self: flex-start;
  width: 100%;
  text-align: left;
  background: var(--km-card);
  box-shadow: inset 0 -1px 0 var(--km-border);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: var(--km-accent-light);
    border-color: var(--km-accent-mid);
    transform: translateY(-1px);
  }
`;

export const ExitButton = styled(SubmitButton)`
  background: var(--km-card);
  color: var(--km-accent);
  border-color: var(--km-border);

  &:hover {
    background-color: var(--km-accent-light);
  }
`;

// The "⋮" menu stays on this same row as the other action buttons (never its own row), but as
// its own flex item pushed to the far right by justify-content: space-between - so it reads as
// separate from the button group on the left instead of sharing its cluster.
const TopButtons = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  background: var(--km-card);
  padding: 6px 0;

  @media (max-width: 768px) {
    background: ${uiTokens.colors.pageBg};
  }
`;

const TopButtonsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
`;

const EditActionButton = styled.button`
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid transparent;
  background: none;
  color: var(--km-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;

  &:hover {
    background-color: var(--km-accent-light);
    border-color: var(--km-accent-mid);
    color: var(--km-accent);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }
`;

const EditActionIcon = styled.svg`
  width: 20px;
  height: 20px;
`;

const DownloadSizeToastToggleButton = styled(EditActionButton)`
  width: auto;
  min-width: 40px;
  padding: 0 10px;
  gap: 6px;
  color: var(--km-accent);
  background-color: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'transparent')};
  border-color: ${({ $active }) => ($active ? 'var(--km-accent-mid)' : 'transparent')};
  font-size: 13px;
  font-weight: 700;
`;

const DownloadSizeToastStatus = styled.span`
  font-size: 11px;
  font-weight: 700;
`;

// const iconMap = {
//   user: <FaUser style={{ color: 'orange' }} />,
//   mail: <FaMailBulk style={{ color: 'orange' }} />,
//   phone: <FaPhone style={{ color: 'orange' }} />,
//   'telegram-plane': <FaTelegramPlane style={{ color: 'orange' }} />,
//   'facebook-f': <FaFacebookF style={{ color: 'orange' }} />,
//   instagram: <FaInstagram style={{ color: 'orange' }} />,
//   vk: <FaVk style={{ color: 'orange' }} />,
// };



const LONG_PRESS_MS = 600;

// Добірка, яка не гортає колекцію, а відповідає на окреме адмінське питання:
// `OVERLAY_REVIEW` показує не список анкет, а чергу доповнень (власний
// компонент), тож у пагінацію й у завантажувачі він не заходить зовсім.
// Стрічка й обрані колись теж були окремими добірками зі своїми
// завантажувачами — тепер це запити «Списку» (`utils/cardListQuery`).
const OVERLAY_REVIEW_FILTER = 'OVERLAY_REVIEW';

// Роботи індексації, згруповані за тим, **що вони роблять**, а не за тим, коли
// їх дописали. Локальні читають вибрані JSON-файли й лишають результат у
// браузері; бекендні переписують вузол на всю колекцію, і саме тому стоять
// окремо й під власним підписом.
const INDEX_JOB_GROUPS = [
  {
    id: 'local',
    title: 'Локально, з JSON',
    note: 'нічого не пише в базу',
    jobs: [
      {
        key: 'searchLocalIdAndKey',
        label: 'searchId + searchKey',
        hint: 'з обраних файлів вузлів анкет',
      },
      {
        key: 'searchLocalImtHeightWeight',
        label: 'imt + height + weight',
        hint: 'з обраних файлів вузлів анкет',
      },
    ],
  },
  {
    id: 'backend',
    title: 'На бекенді',
    note: 'переписує вузол цілком',
    jobs: [
      {
        key: 'searchKeyUsersAll',
        label: 'Усі searchKey для users',
        hint: '→ searchKey/users',
      },
      {
        key: 'searchKeySetReindex',
        label: 'Набори фільтрів searchKeySet',
        hint: 'перебудувати з нуля',
      },
      {
        key: 'stimulationShortcuts',
        label: 'Ярлики стимуляції',
        hint: '',
      },
      {
        // Чернетка пише свою пару сама, на збереженні. Ця робота потрібна
        // рівно для тих, що заведені до появи мапи: без пари знайдену чужу
        // чернетку відкриває самий лише службовий читач.
        key: 'profileMutationOwners',
        label: 'Автори чернеток',
        hint: '→ multiData/profileMutationOwners',
      },
      {
        // Разова робота: `hasPublicReview` пишуть самі писачі коментарів, але
        // лише на нове створення чи зняття відгуку — цей чекбокс наздоганяє
        // картки, чиї відгуки вже лежали в comments/{id} до появи прапорця.
        // TODO: прибрати після одного запуску в проді.
        key: 'matchingCardPublicComments',
        label: 'Публічні коментарі',
        hint: '→ matchingCards/{id}/hasPublicReview',
      },
      {
        // Разова робота: повну групу крові картка отримує сама на збереженні
        // анкети, а опубліковані раніше лишились із самим резусом («Rh+»).
        // Пише лише опублікованим — неопублікованій вона не належить.
        key: 'matchingCardBlood',
        label: 'Група крові в картках',
        hint: '→ matchingCards/{id}/blood',
      },
      {
        // Разова робота: нові фото кладуться з річним кешем браузера, а старі
        // віддавались з `max-age=0` і качались заново на кожне перезавантаження
        // стрічки. Пише метадані файлів — потрібен повний адмін.
        key: 'photoCacheControl',
        label: 'Кеш фото на рік',
        hint: '→ Storage avatar/** cacheControl',
      },
      {
        // Разова робота: мініатюри головних фото для стрічки
        // (`utils/photoThumbs`). Нове фото отримує її саме на завантаженні.
        key: 'feedPhotoThumbs',
        label: 'Мініатюри фото в стрічці',
        hint: '→ avatar/{id}/thumbs, matchingCards/{id}/avatar',
      },
    ],
  },
];

// Стан «Інструментів» памʼятає браузер. Ключ новий, а не старий
// `addAdminConsoleOpen`: там панель несла й добірки, тож стояла розгорнутою
// майже в усіх, а тепер у ній лише рідкісне й небезпечне — і стартує вона
// згорнутою.
const ADMIN_CONSOLE_OPEN_KEY = 'addAdminToolsOpen';

// Запит «Списку» — поле, напрямок, період і «без значення»
// (`utils/cardListQuery`), памʼятає браузер. Старі режими (`loadSortMode`) у
// браузері не зберігались зовсім, лише в знімку «назад до списку», і звідти їх
// переводить `queryFromLegacyListState`.
const CARD_LIST_QUERY_STORAGE_KEY = 'addCardListQuery';

const readStoredCardListQuery = () => {
  try {
    const raw = localStorage.getItem(CARD_LIST_QUERY_STORAGE_KEY);
    return normalizeCardListQuery(raw ? JSON.parse(raw) : DEFAULT_CARD_LIST_QUERY);
  } catch (error) {
    return normalizeCardListQuery(DEFAULT_CARD_LIST_QUERY);
  }
};

// Добірки, якими «Список» колись перемикався між режимами, — у знімках
// попереднього списку, збережених до появи двигуна. Усі вони тепер один
// список, а що саме в ньому — каже запит (`queryFromLegacyListState`).
const LEGACY_LIST_FILTERS = new Set([
  'DATE2', 'DATE2.1', 'GITnew', 'LAST_ACTION', 'LAST_ACTION2', 'OFFLINE', 'OFLINE', 'FEED_DATE', 'FAVORITE',
]);

// Добірки поза «Списком»: їх підсвічує власна кнопка, а не запит.
const CARD_COLLECTION_LABELS = {
  CYCLE_FAVORITE: 'цикл',
  [OVERLAY_REVIEW_FILTER]: 'черга доповнень',
};


const SearchScopeContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
`;

const SearchScopeBlock = styled.div`
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: 10px;
  padding: 8px 12px 10px;
`;

const SearchScopeBlockTitle = styled.div`
  font-size: 10px;
  font-weight: 700;
  color: var(--km-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
`;

const SearchScopeBlockHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

// Доріжка з білим вибраним сегментом — той самий вибір «одне з кількох», що й
// на решті екранів (колекції стрічки, тема, вхід/реєстрація).
const DepthTrack = styled.div`
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--km-fill, var(--km-bg));
`;

const DepthSegment = styled.button`
  flex: 1;
  min-height: 32px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--km-card)' : 'transparent')};
  box-shadow: ${({ $active }) => ($active ? '0 1px 2px rgba(0, 0, 0, 0.12)' : 'none')};
  color: ${({ $active, $danger }) => {
    if ($active && $danger) return 'var(--km-danger)';
    return $active ? 'var(--km-text)' : 'var(--km-muted)';
  }};
  font-family: inherit;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  white-space: nowrap;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }
`;

const DepthHint = styled.p`
  display: block;
  margin: 6px 2px 0;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-muted)')};
`;

const SearchFiltersToggle = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--km-border);
  font-size: 13px;
  color: var(--km-text);
  cursor: pointer;

  input[type='checkbox'] {
    margin-top: 3px;
    flex-shrink: 0;
    accent-color: var(--km-accent);
  }

  ${DepthHint} {
    margin: 2px 0 0;
  }
`;

const SearchBarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SearchSettingsButton = styled.button`
  width: 38px;
  height: 38px;
  border: 1.5px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-border)')};
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'var(--km-card)')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-muted)')};
  flex-shrink: 0;
  transition: border-color 0.15s, background 0.15s, color 0.15s;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
    background: var(--km-accent-light);
  }
`;



const LocalIndexOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
`;

const LocalIndexModal = styled.div`
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: var(--km-card);
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.2);
`;

const LocalIndexActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
`;

const SaveModalTitle = styled.h3`
  margin: 0 0 8px;
`;

const SaveModalHint = styled.p`
  margin: 0 0 12px;
  color: var(--km-muted);
  font-size: 13px;
`;

const SaveModalSection = styled.div`
  padding: 10px 0;
  border-top: 1px solid var(--km-border);
`;

/* Запити читача під його карткою: список того, що він шукав. Кожен рядок —
   кнопка, бо натискання повторює той самий пошук, а поруч із номером стоять
   ті самі три канали, якими з нього й пишуть. */
const SearcherQueries = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px 10px;
  background: var(--km-card);
  border-radius: 0 0 10px 10px;
`;

const SearcherQueriesTitle = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--km-muted);
`;

const SearcherQueryRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const SearcherQueryButton = styled.button`
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  padding: 4px 8px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: transparent;
  color: var(--km-text);
  font-size: 13px;
  cursor: pointer;
  overflow-wrap: anywhere;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }
`;

const SearcherQueryLink = styled.a`
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--km-accent);
  text-decoration: none;
`;

const SearcherQueryMeta = styled.span`
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--km-muted);
`;

const SearcherQueryRemoveButton = styled.button`
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--km-muted);
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--km-danger, #c62828);
    background: var(--km-hover, rgba(0, 0, 0, 0.06));
  }
`;

const SaveModalSectionTitle = styled.div`
  margin-bottom: 8px;
  font-weight: 700;
  color: var(--km-text);
`;

const SaveModalRadioRow = styled.label`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 8px;
  cursor: pointer;
`;

const SaveModalComment = styled.span`
  display: block;
  color: var(--km-muted);
  font-size: 12px;
  line-height: 1.35;
`;

const SaveModalActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SaveModalActionButton = styled.button`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--km-accent-mid);
  border-radius: 8px;
  background: var(--km-accent-light);
  color: var(--km-accent);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--km-accent-light);
    border-color: var(--km-accent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SaveModalActionTitle = styled.strong`
  display: block;
  margin-bottom: 3px;
`;


const PROFILE_RESTORE_LOG_PREFIX = '[ProfileRestore]';
const LOAD_DEBUG_LOG_PREFIX = '[AddNewProfileLoad]';
const CONTACT_EXPORT_LOG_PREFIX = '[ContactsExport]';
const CONTACT_EXPORT_DEBUG_USER_ID = '-Ots_t0kim8mWxe7BT_P';
const LOAD_DEBUG_LOG_MAX_ENTRIES = 1000;

const countObjectKeys = value =>
  value && typeof value === 'object' ? Object.keys(value).length : 0;

const summarizeLoadFiltersForLog = filters => ({
  keys: filters && typeof filters === 'object' ? Object.keys(filters) : [],
  favoriteOnly: Boolean(filters?.favorite?.favOnly),
  reaction: filters?.reaction || null,
  raw: filters || {},
});

// Ключ кешу переліку «Списку»: власник, запит, фільтри й сьогоднішня дата.
// Дата — бо «кому дзвонити» щодня інший: учорашній перелік, піднятий з кешу,
// ховав би тих, кому дзвонити сьогодні.
const toLocalIsoDate = () => {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const buildCardListSessionKey = (ownerUid, cardListQuery, filters) => normalizeQueryKey(
  `cardlist:${ownerUid || 'anon'}:${buildCardListQueryKey(cardListQuery)}:${serializeQueryFilters(filters || {})}:${toLocalIsoDate()}`,
);

// Анкета, щойно збережена чи прочитана тут, лягає в кеш карток поверх того,
// що там уже лежить: з нього «Список» і «назад до списку» піднімають картки
// без круга до бази.
const rememberCardsInCache = usersObj => {
  const existing = loadCards();
  Object.entries(usersObj || {}).forEach(([id, data]) => {
    if (!id || !data) return;
    updateCard(id, existing[id] ? { ...existing[id], ...data } : data);
  });
};

const getProfileRestoreTimestamp = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.round(performance.now());
  }
  return Date.now();
};

const buildJsonDownloadStamp = () => {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};

const summarizeProfileCardForLog = card => {
  if (!card || typeof card !== 'object') {
    return { hasCard: false };
  }

  const keys = Object.keys(card);
  return {
    hasCard: true,
    userId: card.userId || '',
    keysCount: keys.length,
    keys,
    cachedAt: card.cachedAt || null,
    updatedAt: card.updatedAt || card.lastUpdated || null,
    dataSource: card.dataSource || null,
  };
};

const PROFILE_RESTORE_DEBUG_STEPS = new Set([
  'init-state:cache-hit',
  'init-state:cache-miss-placeholder',
  'url-sync:blocked-no-access',
  'profile-data:cache-hit-hydrate-state',
  'profile-data:cache-miss-fetch-backend-start',
  'profile-data:backend-hit-update-cache-and-state',
  'profile-data:backend-empty',
  'profile-data:backend-error',
  'previous-list:snapshot-save',
  'previous-list:restore-start',
  'previous-list:restore-no-snapshot-clear-state',
  'previous-list:restore-users-from-cache',
  'previous-list:restore-complete-clear-profile-state',
  'add-user:start',
  'add-user:created-profile',
  'add-user:set-state-open-profile-form',
  'add-user:finish',
]);

const logProfileRestoreStep = (step, payload = {}) => {
  if (!PROFILE_RESTORE_DEBUG_STEPS.has(step)) return;

  console.log(PROFILE_RESTORE_LOG_PREFIX, step, {
    at: getProfileRestoreTimestamp(),
    ...payload,
  });
};

// Власник, під яким імпорт з таблиці складає нотатки й дизлайки. Значення живе
// поруч із міграцією імпортованих коментарів (`legacyImportCommentMigration`):
// саме в цьому піддереві вона потім шукає відгуки, які імпорт поклав у приватні
// нотатки, тож два різні рядки тут означали б тихо порожню міграцію.
const EXCEL_COMMENTS_OWNER_ID = LEGACY_IMPORT_COMMENT_OWNER_ID;

const extractSurnameAndName = fullName => {
  const value = String(fullName ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!value) {
    return { surname: '', name: '' };
  }

  const [surname = '', name = ''] = value.split(' ');
  return { surname, name };
};

const normalizeExcelPhone = rawPhone => {
  const normalized = normalizePhoneState({ phone: rawPhone });
  let phone = normalized?.phone;

  if (phone === undefined || phone === null) {
    return '';
  }

  if (Array.isArray(phone)) {
    return phone[0] || '';
  }

  phone = String(phone).trim();

  if (/^\d{9}$/.test(phone)) {
    return `380${phone}`;
  }

  return phone;
};

const normalizeDeletedKeys = (...sources) => {
  const deleted = new Set();

  sources.forEach(source => {
    if (!source) return;

    if (Array.isArray(source)) {
      source.forEach(key => {
        if (key && key !== 'userId') deleted.add(String(key));
      });
      return;
    }

    if (source instanceof Set) {
      source.forEach(key => {
        if (key && key !== 'userId') deleted.add(String(key));
      });
      return;
    }

    if (typeof source === 'object') {
      Object.keys(source).forEach(key => {
        if (key && key !== 'userId') deleted.add(String(key));
      });
    }
  });

  return [...deleted];
};

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const applyDeletedKeysToPayload = (payload, deletedKeys = []) => {
  deletedKeys.forEach(key => {
    if (key && key !== 'userId') {
      payload[key] = null;
    }
  });

  return payload;
};

export const AddNewProfile = ({ isLoggedIn, setIsLoggedIn }) => {
  const cloneProfileState = useCallback(profileState => JSON.parse(JSON.stringify(profileState || {})), []);
  const toComparableHistoryState = useCallback(profileState => {
    if (!profileState || typeof profileState !== 'object') return {};
    const comparable = { ...profileState };
    delete comparable.lastAction;
    return comparable;
  }, []);
  const areHistorySnapshotsEqual = useCallback(
    (left, right) => JSON.stringify(toComparableHistoryState(left)) === JSON.stringify(toComparableHistoryState(right)),
    [toComparableHistoryState],
  );
  const registerHistorySnapshot = useCallback(
    snapshotState => {
      if (!snapshotState?.userId) return;

      const history = editHistoryRef.current;

      if (history.userId !== snapshotState.userId) {
        editHistoryRef.current = {
          userId: snapshotState.userId,
          current: cloneProfileState(snapshotState),
          undoStack: [],
          redoStack: [],
        };
        historyNavigationRef.current = false;
        setHistoryVersion(prev => prev + 1);
      } else if (!history.current) {
        history.current = cloneProfileState(snapshotState);
        historyNavigationRef.current = false;
        setHistoryVersion(prev => prev + 1);
      } else if (!areHistorySnapshotsEqual(history.current, snapshotState)) {
        if (!historyNavigationRef.current) {
          history.undoStack.push(cloneProfileState(history.current));
          history.redoStack = [];
          setHistoryVersion(prev => prev + 1);
        }
        history.current = cloneProfileState(snapshotState);
        historyNavigationRef.current = false;
      } else if (historyNavigationRef.current) {
        historyNavigationRef.current = false;
      }
    },
    [areHistorySnapshotsEqual, cloneProfileState],
  );

  const SEARCH_KEY_INDEX_OPTIONS = [
    { key: 'blood', label: 'blood' },
    { key: 'maritalStatus', label: 'maritalStatus' },
    { key: 'csection', label: 'csection' },
    { key: 'contact', label: 'contact' },
    { key: 'role', label: 'role' },
    { key: 'userId', label: 'userId' },
    { key: 'age', label: 'age' },
    { key: 'imtHeightWeight', label: 'imt+height+weight' },
    { key: 'reaction', label: 'reaction' },
    { key: 'fieldCount', label: 'fields' },
    { key: 'lastAction', label: 'lastAction' },
    { key: 'getInTouch', label: 'getInTouch' },
    { key: 'bmi', label: 'bmi' },
    { key: 'country', label: 'country' },
  ];

  const location = useLocation();
  const initialAccess = resolveAccess({
    uid: auth.currentUser?.uid,
    accessLevel: localStorage.getItem('accessLevel'),
    canCreateProfiles: readStoredCanCreateProfiles(),
  });

  const [userNotFound, setUserNotFound] = useState(false);

  const SEARCH_KEY = 'addSearchQuery';
  const SEARCH_OPTIONS_STORAGE_KEY = 'addSearchOptions';
  const SEARCH_RESULT_FILTERS_STORAGE_KEY = 'addSearchResultFiltersEnabled';
  const INDEX_SELECTION_STORAGE_KEY = 'addIndexSelectionOptions';
  const EDIT_PROFILE_USER_ID_KEY = 'addNewProfileEditUserId';
  const PREVIOUS_LIST_STATE_KEY = 'addNewProfilePreviousListState';
  const defaultSelectedIndexJobs = {
    stimulationShortcuts: true,
    searchKeyUsersAll: false,
    searchKeySetReindex: false,
    searchLocalIdAndKey: false,
    searchLocalImtHeightWeight: false,
    matchingCardBlood: false,
    photoCacheControl: false,
    feedPhotoThumbs: false,
  };
  const defaultSelectedSearchKeyIndexes = SEARCH_KEY_INDEX_OPTIONS.reduce((acc, option) => {
    acc[option.key] = true;
    return acc;
  }, {});
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('search')) {
      return params.get('search') || '';
    }
    const urlUserId = params.get('userId');
    if (urlUserId) return urlUserId;
    const persistedEditUserId = localStorage.getItem(EDIT_PROFILE_USER_ID_KEY) || '';
    if (persistedEditUserId) return persistedEditUserId;
    return '';
  });
  const [searchBarQueryActive, setSearchBarQueryActive] = useState(false);
  const [lastSearchBarQuery, setLastSearchBarQuery] = useState('');
  const [searchBarResetVersion, setSearchBarResetVersion] = useState(0);
  const searchListIsolationRef = useRef(Boolean((search || '').trim()));
  const [isExcelImporting, setIsExcelImporting] = useState(false);
  const [downloadSizeToastsEnabled, setDownloadSizeToastsEnabled] = useState(() => getBackendDownloadToastsEnabled());
  const [extendedMode, setExtendedMode] = useState(readBackendLinksEnabled);
  const excelImportInputRef = useRef(null);
  const [showSearchKeyIndexPanel, setShowSearchKeyIndexPanel] = useState(false);
  const [showLocalIndexModal, setShowLocalIndexModal] = useState(false);
  const [pendingLocalIndexTypes, setPendingLocalIndexTypes] = useState([]);
  const [exportDataSource, setExportDataSource] = useState('server');
  const [exportOnlyPhonesStartingWith38, setExportOnlyPhonesStartingWith38] = useState(false);
  const [contactExportFormat, setContactExportFormat] = useState('vcf');
  const [showSaveModal, setShowSaveModal] = useState(false);
  /**
   * Локально завантажені вузли нової колекції.
   *
   * Індексація має два входи, і другий існує не для зручності: читання всієї
   * бази — це десятки мегабайтів і хвилини, а з телефона ще й трафік. Тут
   * лежать ті самі вузли, тільки прочитані з файлів.
   */
  const [localNodeFiles, setLocalNodeFiles] = useState({});
  const [localDraftProfiles, setLocalDraftProfiles] = useState({});
  const localNodeFilesInputRef = useRef(null);
  const [selectedIndexJobs, setSelectedIndexJobs] = useState(() => {
    const storedRaw = localStorage.getItem(INDEX_SELECTION_STORAGE_KEY);
    if (!storedRaw) return defaultSelectedIndexJobs;

    try {
      const parsed = JSON.parse(storedRaw);
      const parsedIndexJobs = parsed?.selectedIndexJobs;
      if (!parsedIndexJobs || typeof parsedIndexJobs !== 'object') return defaultSelectedIndexJobs;

      return Object.keys(defaultSelectedIndexJobs).reduce((acc, key) => {
        acc[key] = typeof parsedIndexJobs[key] === 'boolean' ? parsedIndexJobs[key] : defaultSelectedIndexJobs[key];
        return acc;
      }, {});
    } catch (error) {
      console.warn('[AddNewProfile] Failed to parse index selection options from localStorage', error);
      return defaultSelectedIndexJobs;
    }
  });
  const [selectedSearchKeyIndexes, setSelectedSearchKeyIndexes] = useState(() => {
    const storedRaw = localStorage.getItem(INDEX_SELECTION_STORAGE_KEY);
    if (!storedRaw) return defaultSelectedSearchKeyIndexes;

    try {
      const parsed = JSON.parse(storedRaw);
      const parsedSearchKeyIndexes = parsed?.selectedSearchKeyIndexes;
      if (!parsedSearchKeyIndexes || typeof parsedSearchKeyIndexes !== 'object') return defaultSelectedSearchKeyIndexes;

      return Object.keys(defaultSelectedSearchKeyIndexes).reduce((acc, key) => {
        acc[key] =
          typeof parsedSearchKeyIndexes[key] === 'boolean'
            ? parsedSearchKeyIndexes[key]
            : defaultSelectedSearchKeyIndexes[key];
        return acc;
      }, {});
    } catch (error) {
      console.warn('[AddNewProfile] Failed to parse index selection options from localStorage', error);
      return defaultSelectedSearchKeyIndexes;
    }
  });


  // Поля, за якими шукає `SearchBar`. Обирати їх чіпами більше не треба: ключ
  // `searchId` — саме значення, поле лежить у записі, а нормалізацію набраного
  // вибирає розпізнане поле (`searchIdDetectedField`). Тут стояло два десятки
  // чіпів (`phone`, `ameblo`, `otherLink`, `lastLogin2`…), і вимкнений чіп лише
  // ховав знайдене — запит однаково читав той самий один ключ. Тож поля тепер
  // увімкнені завжди, а адмін обирає не «де», а «як глибоко» шукати.
  const SEARCH_KEY_OPTIONS = [
    { key: 'phone', label: 'phone', supportsSearchId: true, supportsEqualTo: true },
    { key: 'telegram', label: 'telegram', supportsSearchId: true, supportsEqualTo: true },
    { key: 'instagram', label: 'instagram', supportsSearchId: true, supportsEqualTo: true },
    { key: 'ameblo', label: 'ameblo', supportsSearchId: true, supportsEqualTo: true },
    { key: 'facebook', label: 'facebook', supportsSearchId: true, supportsEqualTo: true },
    { key: 'email', label: 'email', supportsSearchId: true, supportsEqualTo: true },
    { key: 'vk', label: 'vk', supportsSearchId: true, supportsEqualTo: true },
    { key: 'tiktok', label: 'tiktok', supportsSearchId: true, supportsEqualTo: true },
    { key: 'linkedin', label: 'linkedin', supportsSearchId: true, supportsEqualTo: true },
    { key: 'youtube', label: 'youtube', supportsSearchId: true, supportsEqualTo: true },
    { key: 'twitter', label: 'twitter', supportsSearchId: true, supportsEqualTo: true },
    { key: 'line', label: 'line', supportsSearchId: true, supportsEqualTo: true },
    { key: 'otherLink', label: 'otherLink', supportsSearchId: true, supportsEqualTo: true },
    { key: 'other', label: 'other', supportsSearchId: true, supportsEqualTo: true },
    { key: 'myComment', label: 'myComment', supportsSearchId: false, supportsEqualTo: true },
    { key: 'name', label: 'name', supportsSearchId: true, supportsEqualTo: true },
    { key: 'surname', label: 'surname', supportsSearchId: true, supportsEqualTo: true },
    { key: 'cycleStatus', label: 'cycleStatus', supportsSearchId: false, supportsEqualTo: true },
    { key: 'getInTouch', label: 'getInTouch', supportsSearchId: false, supportsEqualTo: true, supportsSearchKey: true, isDate: true },
    { key: 'lastAction', label: 'lastAction', supportsSearchId: false, supportsEqualTo: true, supportsSearchKey: true, isDate: true },
    { key: 'lastLogin2', label: 'lastLogin2', supportsSearchId: false, supportsEqualTo: true, isDate: true },
    { key: 'createdAt', label: 'createdAt', supportsSearchId: false, supportsEqualTo: true, isDate: true },
    { key: 'lastCycle', label: 'lastCycle', supportsSearchId: false, supportsEqualTo: true, isDate: true },
    { key: 'lastLogin', label: 'lastLogin', supportsSearchId: false, supportsEqualTo: true, isDate: true },
  ];
  const CONTACT_SEARCH_KEYS = ['phone', 'telegram', 'instagram', 'ameblo', 'facebook', 'email', 'vk', 'tiktok', 'linkedin', 'youtube', 'twitter', 'line', 'otherLink', 'other'];

  // Глибина пошуку — три сходинки за ціною, і кожна містить попередню. Шість
  // незалежних перемикачів режимів давали комбінації, у яких частина полів
  // ставала недоступною, і пояснити, чому пошук «не знаходить», міг лише автор.
  // equalTo й contains по всіх картках вмикались тільки явним вибором і далі
  // вмикаються тільки ним: раніше дефолт `true` ганяв зайві запити до Firebase.
  const SEARCH_DEPTH_MODES = [
    {
      key: 'exact',
      label: 'Точно',
      hint: 'Індекс searchId і частина ID картки — поле розпізнається саме, один запит.',
    },
    {
      key: 'date',
      label: '+ дати',
      hint: 'Ще й набрана дата: «кому дзвонити» (getInTouch) і остання дія (lastAction) з індексу searchKey.',
    },
    {
      key: 'full',
      label: 'Повний перебір',
      hint: 'Ще й equalTo та «містить» по всіх картках. Читає всю базу — лише коли індекс не знаходить.',
      danger: true,
    },
  ];
  const SEARCH_DEPTH_FLAGS = {
    exact: { searchId: true, partialUserId: true, searchKey: false, equalToAllCards: false, broadTextSearch: false },
    date: { searchId: true, partialUserId: true, searchKey: true, equalToAllCards: false, broadTextSearch: false },
    full: { searchId: true, partialUserId: true, searchKey: true, equalToAllCards: true, broadTextSearch: true },
  };
  const buildEnabledSearchKeys = depth => ({
    ...SEARCH_KEY_OPTIONS.reduce((acc, option) => {
      acc[option.key] = true;
      return acc;
    }, {}),
    ...(SEARCH_DEPTH_FLAGS[depth] || SEARCH_DEPTH_FLAGS.exact),
  });
  // Збережені раніше перемикачі читаються як найближча сходинка: що було
  // увімкнено з дорогого, те й лишається.
  const resolveSearchDepth = flags => {
    if (flags?.equalToAllCards || flags?.broadTextSearch) return 'full';
    if (flags?.searchKey) return 'date';
    return 'exact';
  };

  const [enabledSearchKeys, setEnabledSearchKeys] = useState(() => {
    const storedRaw = localStorage.getItem(SEARCH_OPTIONS_STORAGE_KEY);
    if (!storedRaw) return buildEnabledSearchKeys('exact');

    try {
      const parsed = JSON.parse(storedRaw);
      if (!parsed || typeof parsed !== 'object') return buildEnabledSearchKeys('exact');
      return buildEnabledSearchKeys(resolveSearchDepth(parsed));
    } catch (error) {
      console.warn('[AddNewProfile] Failed to parse search options from localStorage', error);
      return buildEnabledSearchKeys('exact');
    }
  });
  const searchDepth = resolveSearchDepth(enabledSearchKeys);
  const activeSearchDepthMode =
    SEARCH_DEPTH_MODES.find(mode => mode.key === searchDepth) || SEARCH_DEPTH_MODES[0];

  const [showSearchOptions, setShowSearchOptions] = useState(false);
  const [useSearchResultFilters, setUseSearchResultFilters] = useState(() => {
    const storedRaw = localStorage.getItem(SEARCH_RESULT_FILTERS_STORAGE_KEY);
    return storedRaw === null ? true : storedRaw !== 'false';
  });

  const selectedSearchIdPrefixes = SEARCH_KEY_OPTIONS
    .filter(option => option.supportsSearchId && enabledSearchKeys[option.key])
    .map(option => option.label);

  const selectedEqualToKeys = SEARCH_KEY_OPTIONS
    .filter(option => option.supportsEqualTo && enabledSearchKeys[option.key])
    .map(option => option.label);

  const selectedSearchKeyFields = SEARCH_KEY_OPTIONS
    .filter(option => option.supportsSearchKey && enabledSearchKeys[option.key])
    .map(option => option.label);

  const enabledContactSearchCount = CONTACT_SEARCH_KEYS.filter(key => enabledSearchKeys[key]).length;
  const shouldAutoRunOtherFallback =
    enabledContactSearchCount === 0 || enabledContactSearchCount === CONTACT_SEARCH_KEYS.length;

  const handleSearchDepthChange = depth => {
    setEnabledSearchKeys(buildEnabledSearchKeys(depth));
  };

  useEffect(() => {
    localStorage.setItem(SEARCH_OPTIONS_STORAGE_KEY, JSON.stringify(enabledSearchKeys));
  }, [enabledSearchKeys]);

  useEffect(() => {
    localStorage.setItem(SEARCH_RESULT_FILTERS_STORAGE_KEY, String(useSearchResultFilters));
  }, [SEARCH_RESULT_FILTERS_STORAGE_KEY, useSearchResultFilters]);

  useEffect(() => {
    localStorage.setItem(
      INDEX_SELECTION_STORAGE_KEY,
      JSON.stringify({
        selectedIndexJobs,
        selectedSearchKeyIndexes,
      }),
    );
  }, [INDEX_SELECTION_STORAGE_KEY, selectedIndexJobs, selectedSearchKeyIndexes]);

  const [state, setRawState] = useState(() => {
    const params = new URLSearchParams(location.search);
    const restoredUserIdFromUrl = params.get('userId') || '';
    const restoredUserIdFromCache = localStorage.getItem(EDIT_PROFILE_USER_ID_KEY) || '';
    const restoredUserId = initialAccess.canAccessAdd
      ? (restoredUserIdFromUrl || restoredUserIdFromCache)
      : '';

    logProfileRestoreStep('init-state:resolve-user-id', {
      restoredUserId,
      restoredUserIdFromUrl,
      restoredUserIdFromCache,
      canAccessAdd: initialAccess.canAccessAdd,
      locationSearch: location.search,
    });

    if (!restoredUserId) {
      logProfileRestoreStep('init-state:empty');
      return {};
    }

    const cachedCard = getCard(restoredUserId);
    if (cachedCard) {
      logProfileRestoreStep('init-state:cache-hit', {
        restoredUserId,
        card: summarizeProfileCardForLog(cachedCard),
      });
      return cachedCard;
    }

    logProfileRestoreStep('init-state:cache-miss-placeholder', { restoredUserId });
    return { userId: restoredUserId };
  });
  const profileSnapshotVersionRef = useRef(0);
  const profileSaveRequestRef = useRef(0);
  const profileFetchRequestRef = useRef(0);
  const backendInitialLoadUserIdsRef = useRef(new Set());
  const latestProfileSnapshotRef = useRef(state);
  // Deletion handlers below must read/write this synchronously (plain JS,
  // never inside a setState updater function) instead of capturing a value
  // out of a functional setState callback: React only runs that callback
  // synchronously via an internal, unguaranteed "eager state" optimization,
  // which stops applying once another update is already pending on this
  // fiber - easily true here since handleSubmit immediately does its own
  // setState right after. `latestProfileSnapshotRef` above doesn't help
  // either, since it's only ever written from inside that same kind of
  // functional updater (see the setState wrapper below).
  const liveFieldsRef = useRef(state);
  // Accumulated, not-yet-confirmed deleted field names for the currently
  // open profile - lets a queued write reinforce an earlier, still-in-flight
  // deletion even if this call's own delCondition is a different field.
  const pendingDeletedKeysRef = useRef(new Set());
  // Serializes the actual backend writes so they land in submission order,
  // regardless of how fast each call's own fetch/merge happens to resolve.
  const syncQueueRef = useRef(Promise.resolve());
  const logProfileSnapshotUpdate = useCallback((source, payload = {}) => {
    const entry = {
      source,
      timestamp: new Date().toISOString(),
      at: getProfileRestoreTimestamp(),
      version: profileSnapshotVersionRef.current,
      ...payload,
    };
    console.log('[ProfileSnapshotDebug][AddNewProfile]', entry);
    return entry;
  }, []);
  const setState = useCallback((updater, debug = {}) => {
    setRawState(prevState => {
      const nextState = typeof updater === 'function' ? updater(prevState) : updater;
      const prevUserId = String(prevState?.userId || '');
      const nextUserId = String(nextState?.userId || '');
      const changed = nextState !== prevState;

      if (changed) {
        profileSnapshotVersionRef.current += 1;
        latestProfileSnapshotRef.current = nextState || {};
      }

      logProfileSnapshotUpdate(debug.source || 'setState', {
        caller: debug.caller || 'AddNewProfile.setState',
        applied: changed,
        reason: changed ? debug.reason || 'local-snapshot-updated' : debug.reason || 'unchanged',
        prevUserId,
        nextUserId,
        keysCount: nextState && typeof nextState === 'object' ? Object.keys(nextState).length : 0,
      });

      return nextState;
    });
  }, [logProfileSnapshotUpdate]);
  const [, setHistoryVersion] = useState(0);
  const editHistoryRef = useRef({
    userId: null,
    current: null,
    undoStack: [],
    redoStack: [],
  });
  const historyNavigationRef = useRef(false);
  const isEditingRef = useRef(false);
  const previousListStateRef = useRef(null);
  const skipInitialEmptyUrlProfileClearRef = useRef(
    initialAccess.canAccessAdd &&
      !new URLSearchParams(location.search).has('userId') &&
      !new URLSearchParams(location.search).has('search') &&
      Boolean(localStorage.getItem(EDIT_PROFILE_USER_ID_KEY)),
  );

  const [searchKeyValuePair, setSearchKeyValuePair] = useState(null);
  const [filters, setFilters] = useState(() => getInitialFilters({ storageKey: 'addFilters' }));
  const filtersRef = useRef(filters);
  const loadDebugLogsRef = useRef([]);
  const renderCacheHydrationIdsRef = useRef(new Set());
  const hasInitializedFiltersRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userIdToDelete, setUserIdToDelete] = useState(null);
  const navigate = useNavigate();
  const comparisonReturnRef = useRef(null);
  const comparisonScrollRef = useRef(0);
  const access = resolveAccess({
    uid: auth.currentUser?.uid,
    accessLevel: state.accessLevel || localStorage.getItem('accessLevel'),
    canCreateProfiles: readStoredCanCreateProfiles(),
  });
  const isAdmin = access.isAdmin;
  const canAccessAdd = access.canAccessAdd;
  const [stimulationScheduleProfiles, setStimulationScheduleProfiles] = useState([]);
  const [stimulationShortcutIds, setStimulationShortcutIdsState] = useState(() =>
    getStoredStimulationShortcutIds(),
  );

  const downloadJsonFile = useCallback((filename, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, []);

  const appendLoadDebugLog = useCallback((step, payload = {}) => {
    const entry = {
      id: loadDebugLogsRef.current.length + 1,
      timestamp: new Date().toISOString(),
      at: getProfileRestoreTimestamp(),
      step,
      ...payload,
    };

    loadDebugLogsRef.current = [
      ...loadDebugLogsRef.current,
      entry,
    ].slice(-LOAD_DEBUG_LOG_MAX_ENTRIES);

    if (typeof window !== 'undefined') {
      window.__ADD_NEW_PROFILE_LOAD_DEBUG_LOGS = loadDebugLogsRef.current;
    }

    console.log(LOAD_DEBUG_LOG_PREFIX, step, entry);
    return entry;
  }, []);

  const handleExcelProfilesUpload = useCallback(
    async event => {
      const file = event.target.files?.[0];
      event.target.value = '';

      if (!file) return;

      setIsExcelImporting(true);

      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames?.[0];

        if (!firstSheetName) {
          toast.error('Не знайдено аркуш в Excel файлі');
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          defval: '',
        });

        const dataRows = rows.slice(2);
        const usersJson = {};
        const commentsJson = { [EXCEL_COMMENTS_OWNER_ID]: {} };
        const dislikesJson = { [EXCEL_COMMENTS_OWNER_ID]: {} };
        const todayTimestamp = Date.now();

        dataRows.forEach((row, index) => {
          const rowArray = Array.isArray(row) ? row : [];
          const fullName = rowArray[0];
          const commentText = String(rowArray[1] ?? '').trim();
          const phoneRaw = rowArray[2];
          const { surname, name } = extractSurnameAndName(fullName);
          const phone = normalizeExcelPhone(phoneRaw);
          const userId = `ID${String(index + 1).padStart(4, '0')}`;

          usersJson[userId] = {
            userId,
            role: 'ed',
            createdAt2: todayTimestamp,
            ...(surname ? { surname } : {}),
            ...(name ? { name } : {}),
            ...(phone ? { phone } : {}),
          };

          if (commentText) {
            commentsJson[EXCEL_COMMENTS_OWNER_ID][userId] = {
              text: commentText,
              updatedAt: todayTimestamp,
            };
          }

          dislikesJson[EXCEL_COMMENTS_OWNER_ID][userId] = true;
        });

        downloadJsonFile('users-cards.json', usersJson);
        downloadJsonFile('users-comments.json', commentsJson);
        downloadJsonFile('users-dislikes.json', dislikesJson);
        toast.success(`Готово: ${dataRows.length} рядків оброблено`);
      } catch (error) {
        console.error('[AddNewProfile] Excel import failed', error);
        toast.error('Помилка при обробці Excel');
      } finally {
        setIsExcelImporting(false);
      }
    },
    [downloadJsonFile],
  );

  const isMountedRef = useRef(true);
  const scheduleShortcutPresenceRef = useRef({ userId: null, hasSchedule: null });
  const hasStimulationScheduleKey = state.userId
    ? Object.prototype.hasOwnProperty.call(state, 'stimulationSchedule')
    : false;

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // `true` ставиться на кожному монтуванні, а не лише початковим значенням:
  // `StrictMode` у розробці монтує ефекти двічі, і після першого прибирання
  // ref лишався `false` назавжди — у dev мовчки не працювало все, що на нього
  // спирається (ярлики стимуляції, мапи реакцій, «Список»).
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleBlur = name => {
    const baseFieldName = String(name || '').replace(/-\d+$/, '');
    setState(prevState => {
      const normalizedState = normalizePhoneState(prevState);
      handleSubmit(normalizedState, baseFieldName);
      return normalizedState;
    });
  };

  /*
   * Картка, яка після збереження більше не належить «Списку» (адмін поставив
   * дату дзвінка в майбутнє, а список — «кому дзвонити»), іде зі списку
   * одразу, а на її місце довантажується наступна. Так робив лише GITnew, а
   * GIT і офлайн-режим — кожен своєю гілкою; тепер правило одне на будь-який
   * запит, і належність рахує той самий `cardListKeepsValue`, за яким двигун
   * цей список і збирав. Форма править дату дзвінка — її й питаємо: для
   * запиту за іншим полем вона нічого не міняє.
   */
  const hideCardLeavingListAndLoadNext = submittedState => {
    const userId = submittedState?.userId;
    if (currentFilter !== CARD_LIST_FILTER || !userId) return false;
    if (!(cardListRef.current.state?.order || []).includes(userId)) return false;
    if (cardListKeepsValue(cardListQuery, 'getInTouch', submittedState.getInTouch)) return false;

    forgetCardListId(userId);
    setUsers(prevUsers => {
      if (!prevUsers || !prevUsers[userId]) return prevUsers;
      const { [userId]: _hiddenUser, ...restUsers } = prevUsers;
      return restUsers;
    });

    appendLoadDebugLog('handleSubmit:card-list-hide-and-refill', {
      userId,
      getInTouch: submittedState.getInTouch ?? null,
      query: describeCardListQuery(cardListQuery),
      currentPage,
    });

    ensureCardListLoaded(Math.max(PAGE_SIZE, currentPage * PAGE_SIZE), { whileEditing: true }).catch(error => {
      appendLoadDebugLog('handleSubmit:card-list-refill-error', {
        userId,
        message: error?.message || String(error),
      });
    });

    return true;
  };

  // The actual network write, run one at a time (see enqueueProfileSync)
  // rather than concurrently: several rapid deletions used to each do their
  // own unserialized fetch+merge+write, so whichever finished last could
  // resurrect fields a faster-finishing sibling call had already deleted,
  // regardless of the order the user actually clicked delete in.
  async function remoteUpdate({
    syncedState,
    overwrite,
    delCondition,
    deletedKeys,
    removedIndexValues,
    optimisticCard,
    hasNewState,
    formattedLastDelivery,
  }) {
    if (!isAdmin) {
      if (!syncedState?.userId) {
        toast.error('Немає userId для збереження правки');
        return;
      }

      const canonical = await getCanonicalCard(syncedState.userId);
      const overlayFields = buildOverlayFromDraft(canonical, syncedState);
      await saveOverlayForUserCard({
        editorUserId: auth.currentUser?.uid,
        cardUserId: syncedState.userId,
        fields: overlayFields,
      });
      return;
    }

    // Чернетка пишеться в себе саму — у дані й журнал правок
    // (`profileMutationHistory`), а не у вузли готової анкети: тих у неї
    // немає, і запис туди заводив поруч із чернеткою другу картку, а сама
    // чернетка правки адміна не бачила. Індекс чернетки веде
    // `saveCreateProfileMutation`; `searchKey` належить стрічці.
    if (isDraftProfileRecord(syncedState)) {
      if (Object.prototype.hasOwnProperty.call(syncedState, 'myComment') || deletedKeys.includes('myComment')) {
        await saveMyCardComment(
          syncedState.userId,
          deletedKeys.includes('myComment') ? '' : syncedState.myComment,
          auth.currentUser?.uid,
        );
      }
      await saveDraftProfileRecord({
        submitted: syncedState,
        deletedKeys,
        actorUid: auth.currentUser?.uid,
      });
      return;
    }

    let existingData = null;
    if (syncedState?.userId) {
      try {
        existingData = await fetchUserById(syncedState.userId);
      } catch (fetchError) {
        const details = fetchError?.message || String(fetchError);
        console.error('Submit: failed to fetch existing user before save', fetchError);
        toast.error(`Збереження: не вдалося прочитати поточні дані (${details})`);
        existingData = null;
      }
    }

    if (syncedState?.userId) {
      try {
        // The index root follows the id format; writing a profile into both roots
        // is what left account ids scattered across the shared card index.
        // syncUserSearchKeyIndex resolves the root from the id.
        // `deletedKeys` — четвертим аргументом, як і в `EditProfile`: без нього
        // `syncUserSearchIdIndex` не знімає нічого взагалі (знімати вона вміє
        // лише те, що прийшло сюди), і стертий контакт лишався в `searchId`
        // назавжди. Для анкети акаунта (довгий id) це був єдиний шанс:
        // `updateDataInRealtimeDB` індексу не чіпає.
        await Promise.all([
          syncUserSearchIdIndex(syncedState.userId, existingData || {}, syncedState, deletedKeys),
          syncUserSearchKeyIndex(syncedState.userId, existingData || {}, syncedState),
        ]);
      } catch (indexError) {
        const details = indexError?.message || String(indexError);
        console.error('Submit: search index sync failed, continuing with save', indexError);
        toast.error(`Індексація не виконана (${details}), продовжуємо збереження`);
      }
    }

    console.log('[SAVE] userId:', syncedState.userId);

    // A submit whose sole purpose is deleting field(s) gets a minimal,
    // targeted null-only payload instead of going through makeUploadedInfo's
    // full-profile merge. That merge rebuilds the payload from a
    // locally-captured snapshot merged against a freshly fetched server
    // copy — when several deletions fire in quick succession, a later
    // call's merge could re-include a field an earlier, still-in-flight
    // call already deleted, resurrecting it. A payload containing nothing
    // but explicit nulls for the accumulated deletedKeys (so an earlier,
    // not-yet-confirmed deletion gets reinforced too) can never resurrect
    // anything, because it never carries any other field's value.
    const deleteOnlyKeys = delCondition
      ? (deletedKeys || []).filter(key => key && key !== 'userId')
      : [];
    const isDeleteOnlySubmit = deleteOnlyKeys.length > 0;

    if (syncedState?.userId?.length > 20) {

      if (isDeleteOnlySubmit) {
        // Жодного відбору за назвою ключа: анкету акаунта пише
        // `updateDataInRealtimeDB` у вузли цілком, тож і знімається там усе.
        const deletePayload = { lastAction: syncedState.lastAction };
        deleteOnlyKeys.forEach(key => {
          deletePayload[key] = null;
        });

        console.log('[SAVE] payload to firebase:', deletePayload);
        await updateDataInRealtimeDB(syncedState.userId, deletePayload, 'update');
      } else {
        const cleanedState = sanitizeTechnicalPayload(syncedState);
        if (delCondition) {
          Object.keys(delCondition).forEach(key => {
            if (key !== 'userId') {
              delete cleanedState[key];
            }
          });
        }

        const sanitizedExistingData = sanitizeTechnicalPayload(existingData || {});
        if (delCondition) {
          Object.keys(delCondition).forEach(key => {
            if (key !== 'userId') {
              delete sanitizedExistingData[key];
            }
          });
        }

        const uploadedInfo = applyDeletedKeysToPayload(
          makeUploadedInfo(sanitizedExistingData, cleanedState, overwrite),
          deletedKeys
        );
        if (delCondition) {
          Object.keys(delCondition).forEach(key => {
            uploadedInfo[key] = null;
          });
        }

        console.log('[SAVE] payload to firebase:', uploadedInfo);
        await updateDataInRealtimeDB(syncedState.userId, uploadedInfo, 'update');
      }

    } else {
      if (isDeleteOnlySubmit) {
        const deletePayload = { lastAction: syncedState.lastAction };
        deleteOnlyKeys.forEach(key => {
          deletePayload[key] = null;
        });
        console.log('[SAVE] payload to firebase:', deletePayload);
        await updateProfileNodesInRTDB(syncedState.userId, deletePayload, 'update');
      } else if (hasNewState) {
        const newStateWithDelivery = applyDeletedKeysToPayload(
          sanitizeTechnicalPayload({ ...syncedState }),
          deletedKeys
        );

        if (formattedLastDelivery) {
          newStateWithDelivery.lastDelivery = formattedLastDelivery;
        } else {
          delete newStateWithDelivery.lastDelivery;
        }
        if (delCondition) {
          Object.keys(delCondition).forEach(key => {
            newStateWithDelivery[key] = null;
          });
        }
        console.log('[SAVE] payload to firebase:', newStateWithDelivery);
        await updateProfileNodesInRTDB(
          syncedState.userId,
          newStateWithDelivery,
          'update'
        );
      } else {
        const cleanedState = applyDeletedKeysToPayload(
          sanitizeTechnicalPayload(syncedState),
          deletedKeys
        );
        console.log('[SAVE] payload to firebase:', cleanedState);
        await updateProfileNodesInRTDB(syncedState.userId, cleanedState, 'update');
      }
    }

    // Після запису, а не до: писачі вище дописують у `searchId` усе, що є в
    // payload, і прибране значення довелось би знімати двічі.
    if (syncedState?.userId && removedIndexValues) {
      await pruneSearchIdValues(syncedState.userId, removedIndexValues, syncedState);
    }
  }

  // Chains every write onto the same promise so they execute strictly in
  // submission order, regardless of how fast each call's own fetch/merge
  // happens to resolve - the actual fix for the deletion-order race.
  const enqueueProfileSync = params => {
    const {
      syncedState,
      localCardState = syncedState,
      saveRequestId,
      localSaveVersion,
      removeKeys,
      deletedKeys,
    } = params;

    const runSync = async () => {
      try {
        await remoteUpdate(params);

        if (!isAdmin) {
          return;
        }

        console.log('[LS cards before]', getLocalStorageCardsDebugSnapshot());
        const currentUserId = String((latestProfileSnapshotRef.current || {}).userId || '');
        const isStaleSaveResponse =
          profileSaveRequestRef.current !== saveRequestId ||
          profileSnapshotVersionRef.current !== localSaveVersion ||
          currentUserId !== String(syncedState.userId || '');

        if (isStaleSaveResponse) {
          logProfileSnapshotUpdate('saveResponse', {
            caller: 'handleSubmit:finish',
            requestId: saveRequestId,
            userId: syncedState.userId,
            localSaveVersion,
            currentVersion: profileSnapshotVersionRef.current,
            currentUserId,
            applied: false,
            reason: 'stale-save-response-local-snapshot-is-newer',
          });
          return;
        }

        deletedKeys.forEach(key => pendingDeletedKeysRef.current.delete(key));

        const savedCachedCard = updateCachedUser(localCardState, { removeKeys }) || localCardState;
        rememberCardsInCache({ [syncedState.userId]: savedCachedCard });
        liveFieldsRef.current = savedCachedCard;
        setState(savedCachedCard, {
          source: 'saveResponse',
          caller: 'handleSubmit:finish',
          reason: 'background-save-confirmed-current-snapshot',
        });
        setUsers(prev => {
          if (!prev || !Object.prototype.hasOwnProperty.call(prev, syncedState.userId)) {
            return prev;
          }
          return { ...prev, [syncedState.userId]: savedCachedCard };
        });
        console.log('[LS cards after]', getLocalStorageCardsDebugSnapshot());
      } catch (submitError) {
        const details = submitError?.message || String(submitError);
        console.error('Submit failed', submitError);
        toast.error(`Збереження не виконано: ${details}`);
      }
    };

    const queuedSync = syncQueueRef.current
      .catch(error => {
        console.error('Previous profile sync failed', error);
      })
      .then(runSync);

    syncQueueRef.current = queuedSync.catch(() => {});
    return queuedSync;
  };

  const handleSubmit = (newState, overwrite, delCondition, removedIndexValues) => {
    const now = Date.now();
    const baseState = normalizePhoneState(newState ? { ...newState } : { ...state });
    const updatedState = { ...baseState, lastAction: now };
    const saveRequestId = profileSaveRequestRef.current + 1;
    profileSaveRequestRef.current = saveRequestId;

    const formattedLastDelivery = formatDateToServer(
      formatDateAndFormula(updatedState.lastDelivery)
    );

    // Cards opened from the Like/Dislike list contain local display metadata.
    // Strip it before the state enters any save path (including user edit overlays).
    const syncedState = sanitizeTechnicalPayload(updatedState);
    const localCardState = { ...syncedState };

    // The singular `photo` field is legacy backend data, but TopBlock still
    // displays it. Keep it local so optimistic and save-confirmed state do not
    // blank legacy-only profiles after the backend payload is sanitized.
    if (hasOwn(updatedState, 'photo')) {
      localCardState.photo = updatedState.photo;
    }

    if (formattedLastDelivery) {
      syncedState.lastDelivery = formattedLastDelivery;
      localCardState.lastDelivery = formattedLastDelivery;
    } else {
      delete syncedState.lastDelivery;
      delete localCardState.lastDelivery;
    }

    registerHistorySnapshot(syncedState);

    const hasNewState = Boolean(newState);

    if (!isAdmin) {
      return enqueueProfileSync({
        syncedState,
        overwrite,
        delCondition,
        deletedKeys: [],
        optimisticCard: localCardState,
        localCardState,
        removeKeys: [],
        hasNewState,
        formattedLastDelivery,
      });
    }

    // Optimistically update the only full-card cache and UI state before syncing with server.
    const removeKeys = normalizeDeletedKeys(delCondition);
    pendingDeletedKeysRef.current.forEach(key => {
      if (hasOwn(syncedState, key) && !removeKeys.includes(key)) {
        pendingDeletedKeysRef.current.delete(key);
      }
    });
    removeKeys.forEach(key => pendingDeletedKeysRef.current.add(key));
    const deletedKeys = normalizeDeletedKeys(pendingDeletedKeysRef.current, removeKeys);

    const optimisticCard = updateCachedUser(localCardState, { removeKeys }) || localCardState;
    const localSaveVersion = profileSnapshotVersionRef.current + 1;
    liveFieldsRef.current = optimisticCard;
    setState(optimisticCard, {
      source: 'userChange',
      caller: 'handleSubmit:optimistic-update',
      reason: 'optimistic-local-save-start',
    });
    logProfileSnapshotUpdate('saveResponse', {
      caller: 'handleSubmit:start',
      requestId: saveRequestId,
      userId: syncedState.userId,
      applied: true,
      reason: 'background-save-started-local-is-source-of-truth',
    });
    rememberCardsInCache({ [syncedState.userId]: optimisticCard });
    const cardLeftList = hideCardLeavingListAndLoadNext(optimisticCard);
    if (!cardLeftList) {
      setUsers(prev => ({ ...prev, [syncedState.userId]: optimisticCard }));
    }

    return enqueueProfileSync({
      syncedState,
      overwrite,
      delCondition,
      deletedKeys,
      removedIndexValues,
      optimisticCard,
      localCardState,
      removeKeys,
      saveRequestId,
      localSaveVersion,
      hasNewState,
      formattedLastDelivery,
    });
  };

  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('myProfileDraft');
      localStorage.removeItem('ownerId');
      setState({});
      setIsLoggedIn(false);
      setShowInfoModal(false);
      await purgeLegacyOfflineUsersCopy();
      await signOut(auth);
      navigate('/my-profile');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) {
      handleCloseModal();
    }
  };

  const [selectedField, setSelectedField] = useState(null);
  // const [state, setState] = useState({ eyeColor: '', hairColor: '' });

  // const handleOpenModal = fieldName => {
  //   setSelectedField(fieldName);
  //   // setIsModalOpen(true);
  // };

  const [showInfoModal, setShowInfoModal] = useState(false);
  const ownerId = auth.currentUser?.uid;

  // Позначку `writer` кожна картка списку читає точково
  // (`readProfileFromNodes` → `readOwnerValueForProfile`). Тут стояло
  // читання мапи власника цілком (~160 КБ в адміна на кожне відкриття
  // картотеки) — заради старої, перевернутої форми запису, яку точкове
  // читання не бачить. Усі записи переведено в нову форму, тож мапа більше
  // не читається.

  useEffect(() => {
    const logged = localStorage.getItem('isLoggedIn');
    if (!isLoggedIn && logged) {
      setIsLoggedIn(true);
    }
  }, [isLoggedIn, setIsLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      setShowInfoModal(false);
    }
  }, [isLoggedIn]);

  const openMedicationsModal = useCallback(
    user => {
      if (!user?.userId) return;
      if (!ownerId) {
        toast.error('Увійдіть, щоб працювати з ліками');
        return;
      }

      const labelParts = [user.name, user.surname].filter(Boolean);
      const label = labelParts.join(' ');

      const params = new URLSearchParams(location.search);
      params.set('userId', user.userId);

      navigate(`/medications/${user.userId}`, {
        state: {
          label,
          from: {
            pathname: location.pathname,
            search: `?${params.toString()}`,
          },
          user,
        },
      });
    },
    [navigate, ownerId, location.pathname, location.search],
  );

  const handleCloseModal = () => {
    setSelectedField(null);
    setShowInfoModal(false);
    setUserIdToDelete(null);
  };

  const handleSelectOption = option => {
    if (selectedField) {
      const newValue = option.placeholder === 'Clear' ? '' : option.placeholder;

      setState(prevState => ({ ...prevState, [selectedField]: newValue }));
    }
    handleCloseModal();
  };

  // const handleClearValue = (fieldName, index) => {
  //   setState(prevState => ({ ...prevState, [fieldName]: '' }));
  // };

  // Reads/writes liveFieldsRef with plain synchronous JS instead of
  // capturing a value out of a setState functional updater: React only runs
  // that updater synchronously via an internal, unguaranteed "eager state"
  // optimization, which stops applying once another update is already
  // pending on this fiber - easily true here since handleSubmit immediately
  // does its own setState right after. Reading/writing a ref has no such
  // scheduling ambiguity, so each rapid click deterministically builds on
  // the previous click's result.
  const handleClear = (fieldName, idx) => {
    const prevState = liveFieldsRef.current;
    const isArray = Array.isArray(prevState[fieldName]);
    const newState = { ...prevState };
    let delCondition;
    // Значення, яке прибрали, лишивши поле живим. `delCondition` тут не
    // годиться: він зносить поле цілком (`payload[key] = null`), а решта
    // версій чинні. Індекс же мусить про це дізнатись — інакше ✕ на одній
    // версії правив анкету, а пошук за прибраним номером і далі приводив сюди.
    let removedIndexValues;

    if (isArray) {
      const filteredArray = prevState[fieldName].filter((_, i) => i !== idx);
      const removedValue = prevState[fieldName][idx];
      const normalizedFilteredArray = filteredArray.filter(
        value => !(typeof value === 'string' && value.trim() === '')
      );

      if (normalizedFilteredArray.length === 0) {
        delete newState[fieldName];
        delCondition = { [fieldName]: removedValue };
      } else if (normalizedFilteredArray.length === 1) {
        newState[fieldName] = normalizedFilteredArray[0];
        removedIndexValues = { [fieldName]: [removedValue] };
      } else {
        newState[fieldName] = normalizedFilteredArray;
        removedIndexValues = { [fieldName]: [removedValue] };
      }
    } else {
      const removedValue = prevState[fieldName];
      delete newState[fieldName];
      delCondition = { [fieldName]: removedValue };
    }

    liveFieldsRef.current = newState;
    setState(newState);

    if (delCondition) {
      pendingDeletedKeysRef.current.add(fieldName);
    }
    handleSubmit(newState, 'overwrite', delCondition, removedIndexValues);
  };

  const handleDelKeyValue = fieldName => {
    const prevState = liveFieldsRef.current;
    const newState = { ...prevState };
    const deletedValue = newState[fieldName];
    delete newState[fieldName];

    liveFieldsRef.current = newState;
    setState(newState);

    pendingDeletedKeysRef.current.add(fieldName);
    handleSubmit(newState, 'overwrite', { [fieldName]: deletedValue });
  };

  const [isEmailVerified, setIsEmailVerified] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user && user.emailVerified) {
        localStorage.setItem('ownerId', user.uid);
        setIsEmailVerified(true);
      } else {
        localStorage.removeItem('ownerId');
        setIsEmailVerified(false);
      }
    });

    // Відписка від прослуховування при демонтажі компонента
    return () => unsubscribe();
  }, []);

  // useEffect(() => {
  //   // Рендеринг картки при зміні стану state
  //   if (state && state.userId) {
  //     console.log('state updated:', state); // Перевірка оновленого стану
  //   }
  // }, [state]);

  useEffect(() => {
    isEditingRef.current = !!state.userId;
  }, [state.userId]);
  const stateUserIdRef = useRef(state.userId || '');
  const stateRef = useRef(state);

  useEffect(() => {
    stateUserIdRef.current = state.userId || '';
    stateRef.current = state;
    latestProfileSnapshotRef.current = state;
  }, [state]);

  const [users, setUsers] = useState({});
  const [listPhotoCacheByUserId, setListPhotoCacheByUserId] = useState({});
  const [hasMore, setHasMore] = useState(true); // Стан для перевірки, чи є ще користувачі
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentFilter, setCurrentFilter] = useState('');
  // Що показує «Список» — запит: поле, напрямок, період, «без значення»
  // (`utils/cardListQuery`), а не режим.
  const [cardListQuery, setCardListQuery] = useState(readStoredCardListQuery);
  const cardListQueryKey = buildCardListQueryKey(cardListQuery);
  const [cardListStatsText, setCardListStatsText] = useState('');
  const [isLoadOptionsOpen, setIsLoadOptionsOpen] = useState(false);
  const [isListFiltersOpen, setIsListFiltersOpen] = useState(false);
  const [isAdminConsoleOpen, setIsAdminConsoleOpen] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_CONSOLE_OPEN_KEY) === 'true';
    } catch (error) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_CONSOLE_OPEN_KEY, isAdminConsoleOpen ? 'true' : 'false');
    } catch (error) {
      // Памʼять браузера може бути закрита — панель просто відкриється знову.
    }
  }, [isAdminConsoleOpen]);
  const [loadRequestId, setLoadRequestId] = useState(0);
  // Сеанс двигуна «Списку»: ключ (власник, запит, фільтри, день), стан потоків
  // з курсорами й порядком і запит до бази, що триває. Живе в ref, а не в
  // стані: ефект перезавантаження читає стан зі старого замикання, а курсор
  // мусить бути саме останнім — інакше перша сторінка почалася б із середини.
  const cardListRef = useRef({ key: '', state: null, pending: null });
  // Порядок, у якому двигун прийняв картки, — він і є порядок показу
  // (`getSortedIds`): сторінка N на екрані — це рівно сторінка N з бази.
  const cardListOrderRef = useRef([]);
  // «Оновити» (і повторний дотик до відкритого списку) читає і перелік, і
  // анкети з бази, повз обидва кеші.
  const forceCardListRefreshRef = useRef(false);
  const cardListQueryRef = useRef(cardListQuery);
  cardListQueryRef.current = cardListQuery;
  const initialFav = getFavorites();
  const [favoriteUsersData, setFavoriteUsersData] = useState(initialFav);
  const initialDis = getDislikes();
  const [dislikeUsersData, setDislikeUsersData] = useState(initialDis);
  const [profileSource, setProfileSource] = useState('');
  const profileSourceRef = useRef(profileSource);
  const [isResolvingEditMode, setIsResolvingEditMode] = useState(false);
  const searchListIsolated =
    Boolean((search || '').trim()) ||
    searchBarQueryActive ||
    Boolean((lastSearchBarQuery || '').trim());

  useEffect(() => {
    searchListIsolationRef.current = searchListIsolated;
  }, [searchListIsolated]);

  const canApplyLoadResultsToUsers = () =>
    !isEditingRef.current && !searchListIsolationRef.current;

  const downloadLoadDebugLogs = useCallback(() => {
    const logs = loadDebugLogsRef.current || [];
    const cardListSession = cardListRef.current;

    downloadJsonFile(`load-debug-${buildJsonDownloadStamp()}.json`, {
      userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent || '' : '',
      url: typeof window !== 'undefined' ? window.location?.href || '' : '',
      timestamp: new Date().toISOString(),
      currentFilter,
      cardListQuery,
      cardListSession: {
        key: cardListSession.key,
        order: cardListSession.state?.order?.length || 0,
        streamIndex: cardListSession.state?.streamIndex ?? null,
        streams: cardListSession.state?.streams || {},
      },
      search,
      searchBarQueryActive,
      hasMore,
      usersCount: countObjectKeys(users),
      filters: summarizeLoadFiltersForLog(filters),
      logsCount: logs.length,
      logs,
    });

    toast.success(`Load log збережено (${logs.length})`);
    return logs.length;
  }, [
    cardListQuery,
    currentFilter,
    downloadJsonFile,
    filters,
    hasMore,
    search,
    searchBarQueryActive,
    users,
  ]);

  useEffect(() => {
    profileSourceRef.current = profileSource;
  }, [profileSource]);

  useEffect(() => {
    const enteringEditMode = Boolean(state.userId) && !isEditingRef.current;
    if (!enteringEditMode) {
      return;
    }

    const userIds = Object.keys(users || {});
    if (!userIds.length) {
      return;
    }

    // Знімок несе стан двигуна (курсори й порядок), а не курсори кожного
    // режиму окремо: «назад до списку» продовжує гортати рівно звідти, де
    // список зупинився.
    const snapshot = {
      userIds,
      currentFilter,
      currentPage,
      hasMore,
      cardListQuery,
      cardListKey: cardListRef.current.key || '',
      cardListState: currentFilter === CARD_LIST_FILTER ? cardListRef.current.state : null,
      search,
      hasSearched,
    };

    logProfileRestoreStep('previous-list:snapshot-save', {
      openingUserId: state.userId,
      userIdsCount: userIds.length,
      currentFilter,
      currentPage,
      hasMore,
      cardListQuery: describeCardListQuery(cardListQuery),
      hasSearched,
      search,
    });

    previousListStateRef.current = snapshot;
    localStorage.setItem(PREVIOUS_LIST_STATE_KEY, JSON.stringify(snapshot));
  }, [
    state.userId,
    users,
    currentFilter,
    currentPage,
    hasMore,
    cardListQuery,
    search,
    hasSearched,
  ]);


  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlUserId = params.get('userId');
    const hasSearchParam = params.has('search');
    const urlSearchValue = hasSearchParam ? params.get('search') || '' : null;

    const shouldPreserveInitialEmptyUrlProfile =
      !urlUserId &&
      !hasSearchParam &&
      stateUserIdRef.current &&
      skipInitialEmptyUrlProfileClearRef.current;

    if (hasSearchParam) {
      setSearch(prev => (prev === urlSearchValue ? prev : urlSearchValue));
    } else if (urlUserId && canAccessAdd) {
      setSearch(prev => (prev ? prev : urlUserId));
    } else if (!urlUserId && !shouldPreserveInitialEmptyUrlProfile) {
      setSearch(prev => (prev ? '' : prev));
    }

    if (urlUserId) {
      if (!canAccessAdd) {
        logProfileRestoreStep('url-sync:blocked-no-access', { urlUserId, locationSearch: location.search });
        setIsResolvingEditMode(false);
        return;
      }

      const shouldResolveUrlUser = !stateUserIdRef.current || stateUserIdRef.current !== urlUserId;
      setIsResolvingEditMode(shouldResolveUrlUser);

      if (shouldResolveUrlUser) {
        setProfileSource('');
        setState(prev => (prev?.userId === urlUserId ? prev : { userId: urlUserId }));
      }
      return;
    }
    if (!hasSearchParam && stateUserIdRef.current) {
      if (shouldPreserveInitialEmptyUrlProfile) {
        skipInitialEmptyUrlProfileClearRef.current = false;
        setIsResolvingEditMode(false);
        return;
      }

      setState({});
    }
    setIsResolvingEditMode(false);
  }, [canAccessAdd, location.search, setSearch, setState]);

  useEffect(() => {
    if (state.userId) {
      setIsResolvingEditMode(false);
    }
  }, [state.userId]);

  useEffect(() => {
    if (!canAccessAdd) return;

    const params = new URLSearchParams(location.search);
    const currentUserIdInUrl = params.get('userId') || '';
    const activeUserId = String(state.userId || '').trim();

    // Back has reached the list entry; do not replace it with the card URL
    // before the comparison restoration effect clears the active card.
    if (comparisonReturnRef.current?.key === location.key && !currentUserIdInUrl) return;

    if (activeUserId) {
      if (currentUserIdInUrl === activeUserId) return;
      logProfileRestoreStep('url-sync:write-user-id', {
        activeUserId,
        previousUrlUserId: currentUserIdInUrl,
        locationSearch: location.search,
      });
      params.set('userId', activeUserId);
      navigate(
        { pathname: location.pathname, search: `?${params.toString()}` },
        { replace: true }
      );
      return;
    }

    if (!currentUserIdInUrl) return;
    logProfileRestoreStep('url-sync:remove-user-id', {
      previousUrlUserId: currentUserIdInUrl,
      locationSearch: location.search,
    });
    params.delete('userId');
    const nextSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
      { replace: true }
    );
  }, [canAccessAdd, location.key, location.pathname, location.search, navigate, state.userId]);

  useEffect(() => {
    const normalized = (search || '').trim();
    if (!normalized) {
      searchListIsolationRef.current = false;
      if (lastSearchBarQuery !== '') {
        setLastSearchBarQuery('');
      }
      if (searchBarQueryActive) {
        setSearchBarQueryActive(false);
      }
      return;
    }
    searchListIsolationRef.current = true;
    if (normalized !== lastSearchBarQuery && searchBarQueryActive) {
      setSearchBarQueryActive(false);
    }
  }, [search, lastSearchBarQuery, searchBarQueryActive]);

  const handleSearchExecuted = useCallback(value => {
    const normalized = (value || '').trim();
    if (!normalized) {
      searchListIsolationRef.current = false;
      setSearchLoading(false);
      setHasSearched(false);
      setCurrentPage(1);
      setSearchBarQueryActive(false);
      setLastSearchBarQuery('');
      return;
    }
    searchListIsolationRef.current = true;
    setSearchLoading(true);
    setHasSearched(true);
    setCurrentPage(1);
    setUsers({});
    setHasMore(false);
    setSearchBarQueryActive(true);
    setLastSearchBarQuery(normalized);
  }, [
    setSearchLoading,
    setHasSearched,
    setCurrentPage,
    setUsers,
    setHasMore,
    setSearchBarQueryActive,
    setLastSearchBarQuery,
  ]);

  // Історію пише лише завершений пошук: прогони на паузах у наборі тексту
  // лишили б у базі ланцюг початків одного слова.
  const handleSearchCommitted = useCallback(value => {
    addMatchingSearchQuery(value);
  }, []);

  const handleFilterChange = useCallback(nextFilters => {
    const nextValue = nextFilters ?? {};
    const prevValue = filtersRef.current ?? {};

    if (!hasInitializedFiltersRef.current) {
      hasInitializedFiltersRef.current = true;
      filtersRef.current = nextValue;
      setFilters(nextValue);
      return;
    }

    const prevSerialized = JSON.stringify(prevValue);
    const nextSerialized = JSON.stringify(nextValue);

    if (prevSerialized === nextSerialized) {
      filtersRef.current = nextValue;
      return;
    }

    // Тут стояли три окремі гілки — миттєве звуження для «NoGIT + індекс»,
    // скидання курсора LA і стану LA2. Двигун один, тож і реакція на фільтри
    // одна: показані картки звужує сам показ (`filterRenderCards`) ще до
    // відповіді бази, а список перезбирає ефект перезавантаження.
    filtersRef.current = nextValue;
    setSearchLoading(true);
    setHasSearched(true);
    setFilters(nextValue);
  }, [
    setFilters,
    setHasSearched,
    setSearchLoading,
  ]);

  useEffect(() => {
    const currentState = stateRef.current || {};
    const currentProfileSource = profileSourceRef.current || '';
    const activeUserId = String(currentState.userId || '').trim();
    if (!activeUserId) {
      return;
    }

    const requestId = profileFetchRequestRef.current + 1;
    profileFetchRequestRef.current = requestId;
    const startedVersion = profileSnapshotVersionRef.current;
    logProfileRestoreStep('profile-data:effect-start', {
      requestId,
      userId: activeUserId,
      profileSource: currentProfileSource,
      stateKeysCount: Object.keys(currentState).length,
    });

    // Чернетка у формі — це знімок, узятий з видачі пошуку чи з кеша карток,
    // а автор править її далі. Перечитується вона за власною адресою
    // (`multiData/profileMutations/{автор}/{картка}`, один точковий запит), і
    // новіша ревізія заміняє знімок — доки адмін сам нічого не змінив.
    // Вузли готової анкети тут питати нема чого: у чернетки їх немає, і
    // відповідь «порожньо» лишала б на екрані старе.
    const revalidateDraftRecord = base => {
      rememberDraftRecordRevision(base);
      fetchProfileRecordById(activeUserId, { prefer: 'draft', creatorUid: getDraftRecordCreator(base) })
        .then(fresh => {
          const latestState = latestProfileSnapshotRef.current || {};
          if (
            !fresh
            || profileFetchRequestRef.current !== requestId
            || String(latestState.userId || '').trim() !== activeUserId
            || profileSnapshotVersionRef.current !== startedVersion
          ) return;
          const sameRevision = isDraftProfileRecord(fresh)
            && Number(fresh.__profileMutationRevision) === Number(base.__profileMutationRevision);
          if (sameRevision) return;
          const freshProfile = { ...fresh, userId: activeUserId };
          rememberDraftRecordRevision(freshProfile);
          updateCard(activeUserId, freshProfile);
          logRenderSource('backend', freshProfile);
          setState(freshProfile, {
            source: 'backend',
            caller: 'profile-data:draft-revalidate',
            reason: 'draft-record-newer-than-snapshot',
          });
          setProfileSource('backend');
        })
        .catch(error => {
          console.warn('[AddNewProfile] draft record revalidation failed', error);
        });
    };

    if (Object.keys(currentState).length > 1) {
      if (!currentProfileSource) {
        logProfileRestoreStep('profile-data:state-already-hydrated-set-cache-source', {
          requestId,
          userId: activeUserId,
          state: summarizeProfileCardForLog(currentState),
        });
        logRenderSource('state', currentState);
        setProfileSource('cache');
      } else {
        logProfileRestoreStep('profile-data:state-already-hydrated-skip', {
          requestId,
          userId: activeUserId,
          profileSource: currentProfileSource,
          state: summarizeProfileCardForLog(currentState),
        });
        logRenderSource(currentProfileSource || 'state', currentState);
      }
      if (isDraftProfileRecord(currentState)) revalidateDraftRecord(currentState);
      return;
    }

    const cached = getCard(activeUserId);
    if (cached) {
      logProfileRestoreStep('profile-data:cache-hit-hydrate-state', {
        requestId,
        userId: activeUserId,
        cached: summarizeProfileCardForLog(cached),
      });
      const cachedProfile = { ...cached, userId: cached.userId || activeUserId };
      logRenderSource('cache', cachedProfile);
      setState(cachedProfile, {
        source: 'localStorage',
        caller: 'profile-data:cache-hit-hydrate-state',
        reason: 'initial-hydration-from-local-cache',
      });
      setProfileSource('cache');
      if (isDraftProfileRecord(cachedProfile)) revalidateDraftRecord(cachedProfile);
    } else {
      if (backendInitialLoadUserIdsRef.current.has(activeUserId)) {
        logProfileSnapshotUpdate('backend', {
          caller: 'profile-data:cache-miss-fetch-backend-start',
          requestId,
          userId: activeUserId,
          applied: false,
          reason: 'backend-initial-load-already-attempted',
        });
        setProfileSource('local');
        return;
      }
      backendInitialLoadUserIdsRef.current.add(activeUserId);
      logProfileRestoreStep('profile-data:cache-miss-fetch-backend-start', {
        requestId,
        userId: activeUserId,
        startedVersion,
      });
      setProfileSource('loading');
      (async () => {
        try {
          // Вузли готової анкети, а коли їх немає — чернетка з цим id.
          const data = await fetchProfileRecordById(activeUserId);
          if (data) {
            const latestState = latestProfileSnapshotRef.current || {};
            const latestUserId = String(latestState.userId || '').trim();
            const isStaleResponse =
              profileFetchRequestRef.current !== requestId ||
              latestUserId !== activeUserId ||
              profileSnapshotVersionRef.current !== startedVersion ||
              Object.keys(latestState).length > 1;

            if (isStaleResponse) {
              logProfileSnapshotUpdate('backend', {
                caller: 'profile-data:backend-hit-update-cache-and-state',
                requestId,
                userId: activeUserId,
                startedVersion,
                currentVersion: profileSnapshotVersionRef.current,
                latestUserId,
                applied: false,
                reason: 'stale-backend-response-local-snapshot-is-newer',
              });
              return;
            }

            logProfileRestoreStep('profile-data:backend-hit-update-cache-and-state', {
              requestId,
              userId: activeUserId,
              backend: summarizeProfileCardForLog(data),
            });
            updateCard(activeUserId, data);
            const backendProfile = { ...data, userId: data.userId || activeUserId };
            rememberDraftRecordRevision(backendProfile);
            logRenderSource('backend', backendProfile);
            setState(backendProfile, {
              source: 'backend',
              caller: 'profile-data:backend-hit-update-cache-and-state',
              reason: 'initial-hydration-from-backend',
            });
          } else {
            backendInitialLoadUserIdsRef.current.delete(activeUserId);
            logProfileRestoreStep('profile-data:backend-empty', {
              requestId,
              userId: activeUserId,
            });
          }
        } catch (error) {
          backendInitialLoadUserIdsRef.current.delete(activeUserId);
          logProfileRestoreStep('profile-data:backend-error', {
            requestId,
            userId: activeUserId,
            message: error?.message || String(error),
          });
          toast.error(error.message);
        } finally {
          logProfileRestoreStep('profile-data:backend-finish-set-source', {
            requestId,
            userId: activeUserId,
          });
          if (profileFetchRequestRef.current === requestId && profileSnapshotVersionRef.current === startedVersion) {
            setProfileSource('backend');
          }
        }
      })();
    }
  }, [logProfileSnapshotUpdate, state.userId, setState]);

  useEffect(() => {
    if (!state.userId) setProfileSource('');
  }, [state.userId]);

  useEffect(() => {
    if (state?.userId) {
      localStorage.setItem(EDIT_PROFILE_USER_ID_KEY, state.userId);
      return;
    }

    localStorage.removeItem(EDIT_PROFILE_USER_ID_KEY);
  }, [state?.userId, EDIT_PROFILE_USER_ID_KEY]);

  useEffect(() => {
    liveFieldsRef.current = state;
  }, [state]);

  // AddNewProfile is a single persistent instance that can switch which
  // profile is "open" (state.userId) without unmounting - clear accumulated
  // not-yet-confirmed deletions from the previous profile so they can never
  // leak into a different profile's delete-only payload.
  useEffect(() => {
    pendingDeletedKeysRef.current.clear();
  }, [state.userId]);

  useEffect(() => {
    if (!searchBarQueryActive) return;
    if (searchLoading) {
      setSearchLoading(false);
    }
  }, [
    searchBarQueryActive,
    searchLoading,
    setSearchLoading,
  ]);

  // Чи лишається картка в списку з такою датою дзвінка. Передається карткам
  // списку (`UsersList` → `smallCard/actions`): картка, якій щойно поставили
  // дату поза запитом, зникає з-під пальця анімацією, а не висить до
  // перезавантаження. Доти так поводився лише GIT, і межею там був діапазон
  // дат завантажених карток, а не склад списку.
  const isDateInRange = dateStr => cardListKeepsValue(cardListQuery, 'getInTouch', dateStr);

  const getInTouchSortValue = useCallback(d => {
    const today = new Date().toISOString().split('T')[0];
    if (d === '2099-99-99' || d === '9999-99-99') return { priority: 5 };
    if (d == null) return { priority: 4 };
    if (d === '') return { priority: 3 };
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (d === today) return { priority: 0, value: d };
      if (d < today) return { priority: 1, value: d };
      return { priority: 2, value: d };
    }
    return { priority: 2, value: d };
  }, []);

  const compareUsersByGetInTouch = useCallback((a, b) => {
    const av = getInTouchSortValue(a.getInTouch);
    const bv = getInTouchSortValue(b.getInTouch);
    if (av.priority !== bv.priority) return av.priority - bv.priority;
    if (av.priority === 1) return bv.value.localeCompare(av.value);
    if (av.priority === 2) return (av.value || '').localeCompare(bv.value || '');
    return 0;
  }, [getInTouchSortValue]);


  const refreshStimulationShortcuts = useCallback(async (providedIds = null) => {
    try {
      const rawIds = Array.isArray(providedIds) ? providedIds : getStoredStimulationShortcutIds();
      const ids = Array.from(new Set((rawIds || []).filter(Boolean).map(String)));
      if (!isMountedRef.current) return;
      setStimulationShortcutIdsState(ids);
      if (ids.length === 0) {
        setStimulationScheduleProfiles([]);
        return;
      }

      const cards = (
        await Promise.all(
          ids.map(async id => {
            const cached = getCard(id);
            if (cached) return cached;

            const fresh = await fetchUserById(id);
            if (!fresh) return null;

            updateCard(id, fresh);
            return { ...fresh, userId: id };
          }),
        )
      ).filter(Boolean);

      if (cards.length === 0) {
        setStimulationScheduleProfiles([]);
        return;
      }

      const annotated = sortUsersByStimulationSchedule(cards, {
        fallbackComparator: compareUsersByGetInTouch,
      });
      const sorted = annotated
        .map(item => item?.user)
        .filter(Boolean)
        .slice(0, 10);
      if (!isMountedRef.current) return;
      setStimulationScheduleProfiles(sorted);
    } catch (error) {
      console.error('Failed to refresh stimulation shortcuts', error);
      if (!isMountedRef.current) return;
      setStimulationScheduleProfiles([]);
    }
  }, [compareUsersByGetInTouch, isMountedRef]);

  const updateStimulationShortcutMembership = useCallback(
    (userId, hasSchedule) => {
      if (!userId) return;
      const id = String(userId);
      const currentIds = new Set(stimulationShortcutIds.map(String));

      if (hasSchedule && currentIds.has(id)) {
        return;
      }

      if (!hasSchedule && !currentIds.has(id)) {
        return;
      }

      if (hasSchedule) {
        addStoredStimulationShortcutId(id);
        if (isMountedRef.current) {
          currentIds.add(id);
          setStimulationShortcutIdsState(Array.from(currentIds));
        }
        if (ownerId) {
          Promise.resolve(addStimulationShortcutId(ownerId, id)).catch(() => {});
        }
      } else {
        removeStoredStimulationShortcutId(id);
        if (isMountedRef.current) {
          currentIds.delete(id);
          setStimulationShortcutIdsState(Array.from(currentIds));
        }
        if (ownerId) {
          Promise.resolve(removeStimulationShortcutId(ownerId, id)).catch(() => {});
        }
      }
      refreshStimulationShortcuts(Array.from(currentIds));
    },
    [ownerId, refreshStimulationShortcuts, isMountedRef, stimulationShortcutIds],
  );

  const getSurnameLabel = useCallback(user => {
    let rawSurname = null;
    if (Array.isArray(user?.surname)) {
      const surnames = user.surname;
      rawSurname = surnames.length ? surnames[surnames.length - 1] : null;
    } else {
      rawSurname = user?.surname ?? null;
    }

    const surname = typeof rawSurname === 'string' ? rawSurname.trim() : '';
    if (!surname) return '??';
    return surname.slice(0, 2).toUpperCase();
  }, []);

  const handleOpenProfileById = useCallback(
    async userData => {
      const id =
        typeof userData === 'string' || typeof userData === 'number'
          ? String(userData)
          : String(userData?.userId || '');
      if (!id) return;

      setSearch(id);
      const cacheKey = getCacheKey('search', normalizeQueryKey(`userId=${id}`));
      setIdsForQuery(cacheKey, [id]);

      const fallback =
        (typeof userData === 'object' && userData?.userId ? userData : null) ||
        getCard(id) ||
        { userId: id };
      saveCard(fallback);
      setState(fallback, {
        source: getCard(id) ? 'localStorage' : 'userChange',
        caller: 'handleOpenProfileById',
        reason: 'open-profile-local-first',
      });
    },
    [setSearch, setState],
  );

  useEffect(() => {
    refreshStimulationShortcuts();
  }, [refreshStimulationShortcuts]);

  useEffect(() => {
    if (!state.userId) return;
    const hasSchedule = hasStimulationScheduleKey;
    const prev = scheduleShortcutPresenceRef.current;
    if (prev.userId === state.userId && prev.hasSchedule === hasSchedule) {
      return;
    }
    scheduleShortcutPresenceRef.current = { userId: state.userId, hasSchedule };
    updateStimulationShortcutMembership(state.userId, hasSchedule);
  }, [state.userId, hasStimulationScheduleKey, updateStimulationShortcutMembership]);

  useEffect(() => {
    setFavoriteIds(initialFav);
  }, [initialFav]);

  const loadStimulationShortcutsOnce = useCallback(async () => {
    if (!ownerId) return [];

    const ids = await fetchStimulationShortcutIds(ownerId);
    if (!isMountedRef.current) return ids;

    setStoredStimulationShortcutIds(ids);
    setStimulationShortcutIdsState(ids);
    refreshStimulationShortcuts(ids);
    return ids;
  }, [ownerId, refreshStimulationShortcuts, isMountedRef]);

  const loadFavoriteIdsOnce = useCallback(async (targetOwnerId = ownerId) => {
    if (!targetOwnerId) return {};

    const favorites = await fetchFavoriteUsers(targetOwnerId);
    const normalizedFavorites = normalizeTruthyMap(favorites);
    if (!isMountedRef.current) return normalizedFavorites;

    setFavoriteUsersData(normalizedFavorites);
    syncFavorites(normalizedFavorites);
    setFavoriteIds(normalizedFavorites);
    return normalizedFavorites;
  }, [ownerId, isMountedRef]);

  const loadDislikeIdsOnce = useCallback(async (targetOwnerId = ownerId) => {
    if (!targetOwnerId) return {};

    const dislikes = await fetchDislikeUsers(targetOwnerId);
    const normalizedDislikes = normalizeTruthyMap(dislikes);
    if (!isMountedRef.current) return normalizedDislikes;

    setDislikeUsersData(normalizedDislikes);
    syncDislikes(normalizedDislikes);
    return normalizedDislikes;
  }, [ownerId, isMountedRef]);

  useEffect(() => {
    loadStimulationShortcutsOnce();
  }, [loadStimulationShortcutsOnce]);

  useEffect(() => {
    loadFavoriteIdsOnce();
  }, [loadFavoriteIdsOnce]);

  useEffect(() => {
    loadDislikeIdsOnce();
  }, [loadDislikeIdsOnce]);

  // ---------------------------------------------------------------------------
  // «Список» — один двигун на будь-який запит (`utils/cardListEngine`).
  //
  // Тут стояли сім завантажувачів (GIT, GITnew, NoGIT, «NoGIT + індекс», LA,
  // LA2, офлайн) і ще два окремі — стрічка й обрані, кожен зі своїм курсором,
  // кешем і обробкою сторінок, і кожна зміна в одному розходилась з рештою.
  // Тепер екран лише тримає сеанс двигуна (`cardListRef`), кладе прийняте в
  // `users` і памʼятає перелік у кеші запитів, а що саме читати — каже запит:
  // поле, напрямок, період і «без значення».
  // ---------------------------------------------------------------------------

  const resolveCardListOwnerUid = () => auth.currentUser?.uid || ownerId || '';

  // Мапи реакцій потрібні фільтру реакцій, «тільки обрані» і самим спискам
  // «Обрані» та «Не цікаві» (там вони і є перелік); поки вони не приїхали з
  // входу на екран, їх дочитують тут.
  const resolveCardListReactionMaps = async (currentFilters, cardListQueryValue) => {
    let favoritesMap = favoriteUsersData || {};
    let dislikedMap = dislikeUsersData || {};
    const reaction = currentFilters?.reaction;
    const listField = getCardListField(cardListQueryValue?.field).key;
    const needsFavorites = listField === 'favorite' || Boolean(currentFilters?.favorite?.favOnly)
      || Boolean(reaction && Object.values(reaction).some(value => value === false));
    const needsDislikes = listField === 'dislike'
      || Boolean(reaction && Object.values(reaction).some(value => value === false));
    if (needsFavorites && !Object.keys(favoritesMap).length) favoritesMap = await loadFavoriteIdsOnce();
    if (needsDislikes && !Object.keys(dislikedMap).length) dislikedMap = await loadDislikeIdsOnce();
    return { favoritesMap, dislikedMap };
  };

  const persistCardListSession = session => {
    if (!session?.key || !session.state) return;
    // Перелік — окремо, стан потоків — поруч, без того самого переліку вдруге.
    setIdsForQuery(session.key, session.state.order);
    setQueryPagination(session.key, { engineState: { ...session.state, order: undefined } });
  };

  /*
   * Перелік, зібраний за останні шість годин тим самим запитом і фільтрами,
   * піднімається з кешу без жодного запиту: анкети — з кешу карток, курсори —
   * зі стану двигуна, тож наступна сторінка продовжує гортати базу рівно
   * звідти, де перелік зупинився. Бракує в кеші бодай однієї анкети — перелік
   * збирається заново: дірка в середині списку гірша за круг до бази.
   */
  const restoreCardListFromCache = (sessionKey, cardListQueryValue) => {
    const entry = getQueryEntry(sessionKey);
    if (!entry?.cachedAt || Date.now() - entry.cachedAt > CARD_CACHE_TTL_MS) return null;
    const engineState = entry.pagination?.engineState;
    if (!engineState) return null;
    const state = restoreCardListState({ ...engineState, order: entry.ids }, cardListQueryValue);
    if (!state || !state.order.length) return null;

    const usersMap = {};
    for (const id of state.order) {
      const card = getCard(id);
      if (!card) return null;
      usersMap[id] = { ...card, userId: card.userId || id };
    }
    // Картка, якій тут же поставили дату поза запитом, у кеші вже нова — і в
    // піднятий перелік не повертається.
    const order = state.order.filter(id => cardListKeepsValue(cardListQueryValue, 'getInTouch', usersMap[id].getInTouch));
    return {
      state: { ...state, order },
      usersMap: Object.fromEntries(order.map(id => [id, usersMap[id]])),
    };
  };

  const describeCardListStream = (streamKey, cardListQueryValue) => {
    const field = getCardListField(cardListQueryValue?.field);
    return streamKey === 'missing' ? `${field.label}: ${field.missingLabel}` : field.label;
  };

  // `whileEditing` — для догортання на місце картки, яка щойно пішла зі
  // списку з відкритої форми (`hideCardLeavingListAndLoadNext`): решта
  // завантажень, поки картка відкрита, не йде — список під формою не видно, а
  // прийняте без показу розійшлося б зі знімком «назад до списку».
  const loadMoreCardList = async ({
    reset = false,
    limit = PAGE_SIZE,
    forceFresh = false,
    background = false,
    whileEditing = false,
  } = {}) => {
    if (isEditingRef.current && !whileEditing) return { hasMore, ignored: true };
    const listQuery = cardListQueryRef.current;
    const currentFilters = filtersRef.current || {};
    const sessionKey = buildCardListSessionKey(resolveCardListOwnerUid(), listQuery, currentFilters);
    let session = cardListRef.current;

    if (reset || session.key !== sessionKey) {
      session = { key: sessionKey, state: null, pending: null, fresh: forceFresh };
      cardListRef.current = session;
      if (!forceFresh) {
        const restored = restoreCardListFromCache(sessionKey, listQuery);
        if (restored) {
          session.state = restored.state;
          cardListOrderRef.current = restored.state.order;
          if (canApplyLoadResultsToUsers()) setUsers(restored.usersMap);
          setHasMore(restored.state.hasMore);
          setCardListStatsText(`з кешу переліку: ${restored.state.order.length} у списку · 0 запитів до бази`);
          appendLoadDebugLog('cardList:restored-from-cache', {
            sessionKey,
            query: describeCardListQuery(listQuery),
            ids: restored.state.order.length,
            hasMore: restored.state.hasMore,
          });
          return { hasMore: restored.state.hasMore };
        }
      }
    }

    if (session.pending) {
      await session.pending.catch(() => null);
      if (cardListRef.current !== session) return { hasMore, ignored: true };
    }

    const isFirstPage = !session.state;
    const baseOrder = session.state?.order || [];
    const run = (async () => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const { favoritesMap, dislikedMap } = await resolveCardListReactionMaps(currentFilters, listQuery);
      const adapters = createCardListBackendAdapters({ filters: currentFilters, favoritesMap, dislikedMap });
      const isStale = () => cardListRef.current !== session || !isMountedRef.current;
      const toUsersMap = list => list.reduce((acc, user) => {
        if (user?.userId) acc[user.userId] = user;
        return acc;
      }, {});

      // Перша сторінка нового сеансу *замінює* показане, і лише тоді, коли
      // вже є що показати: до того на екрані лишається попередній список,
      // звужений новими фільтрами ще до відповіді (`filterRenderCards`), а не
      // порожнеча зі скелетоном.
      let replaced = false;
      const mayApplyUsers = () => !searchListIsolationRef.current && (whileEditing || !isEditingRef.current);
      const applyUsers = list => {
        if (isStale() || !mayApplyUsers()) return;
        const map = toUsersMap(list);
        if (isFirstPage && !replaced) {
          replaced = true;
          setUsers(map);
        } else {
          setUsers(prev => mergeWithoutOverwrite(prev, map));
        }
      };

      const result = await loadCardListPage({
        query: listQuery,
        state: session.state,
        limit,
        adapters,
        // «Оновити» читає анкети з бази лише для першої сторінки сеансу:
        // далі гортання йде звичайним шляхом, спершу з кешу.
        cacheFirst: !(session.fresh && isFirstPage),
        isStale,
        onProgress: list => {
          cardListOrderRef.current = [...baseOrder, ...list.map(user => user.userId)];
          applyUsers(list);
        },
      });
      if (result.ignored || isStale()) return { hasMore, ignored: true };

      session.state = result.state;
      cardListOrderRef.current = result.state.order;
      if (isFirstPage && !replaced) {
        replaced = true;
        if (mayApplyUsers()) setUsers(toUsersMap(result.users));
      } else {
        applyUsers(result.users);
      }
      setHasMore(result.hasMore);
      persistCardListSession(session);

      result.errors.forEach(error => {
        toast.error(
          `«${describeCardListStream(error.stream, listQuery)}» недоступне: ${error.code || error.message}`,
          { id: `card-list-${error.stream}` },
        );
      });

      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
      const statsText = describeCardListStats(result.stats, { ms: elapsed });
      setCardListStatsText(background ? `наперед: ${statsText}` : statsText);
      appendLoadDebugLog('cardList:page', {
        sessionKey,
        query: describeCardListQuery(listQuery),
        limit,
        background,
        stats: result.stats,
        hasMore: result.hasMore,
        errors: result.errors,
        elapsedMs: Math.round(elapsed),
      });
      return { hasMore: result.hasMore };
    })();

    session.pending = run;
    const clearPending = () => {
      if (session.pending === run) session.pending = null;
    };
    run.then(clearPending, clearPending);
    return run;
  };

  /*
   * Догорнути список до `targetCount` карток. Сторінка двигуна може віддати
   * менше, ніж просили (вузький фільтр за межею кругів), тож тут кілька
   * спроб — але не без кінця: дві поспіль без жодної нової картки зупиняють
   * догортання, а «далі» лишається за адміном.
   */
  const ensureCardListLoaded = async (targetCount, { background = false, whileEditing = false } = {}) => {
    let emptyCalls = 0;
    let last = { hasMore };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const session = cardListRef.current;
      const loaded = session.state?.order?.length || 0;
      if (session.state && (!session.state.hasMore || loaded >= targetCount)) {
        return { hasMore: session.state.hasMore };
      }
      // eslint-disable-next-line no-await-in-loop
      last = await loadMoreCardList({ limit: Math.max(1, targetCount - loaded), background, whileEditing });
      if (last?.ignored) return last;
      const after = cardListRef.current.state?.order?.length || 0;
      if (after <= loaded) {
        emptyCalls += 1;
        if (emptyCalls >= 2) break;
      } else {
        emptyCalls = 0;
      }
    }
    return last;
  };

  // Наступна сторінка — наперед, у фоні: перехід на неї показує готове, а
  // ціна — рівно одна сторінка, а не весь список.
  const prefetchCardListPage = page => {
    ensureCardListLoaded((page + 1) * PAGE_SIZE, { background: true }).catch(error => {
      appendLoadDebugLog('cardList:prefetch-error', { page, message: error?.message || String(error) });
    });
  };

  // Картка пішла зі списку (дата поза запитом) — і з переліку сеансу, і з
  // кешу переліку: інакше «назад до списку» чи перезавантаження повернули б її.
  const forgetCardListId = userId => {
    const session = cardListRef.current;
    if (!session.state) return;
    session.state = { ...session.state, order: session.state.order.filter(id => id !== userId) };
    cardListOrderRef.current = session.state.order;
    persistCardListSession(session);
  };

  /*
   * Картка, якій у самому списку поставили дату поза запитом, згасає
   * анімацією (`_pendingRemove`, див. `smallCard/actions`) і зникає з `users`
   * сама (`UsersList`). Тут вона йде й з переліку сеансу, а на її місце
   * догортається наступна, — але лише *після* згасання: забута раніше, вона
   * стрибнула б у кінець списку посеред анімації.
   */
  const leavingCardIdsRef = useRef(new Set());
  useEffect(() => {
    const leaving = leavingCardIdsRef.current;
    if (currentFilter !== CARD_LIST_FILTER) {
      leaving.clear();
      return;
    }
    Object.values(users || {}).forEach(user => {
      if (user?._pendingRemove && user.userId) leaving.add(String(user.userId));
    });
    const gone = [...leaving].filter(id => !users?.[id]);
    if (!gone.length) return;
    gone.forEach(id => {
      leaving.delete(id);
      forgetCardListId(id);
    });
    appendLoadDebugLog('cardList:card-left-list', { ids: gone, currentPage });
    ensureCardListLoaded(Math.max(PAGE_SIZE, currentPage * PAGE_SIZE)).catch(error => {
      appendLoadDebugLog('cardList:refill-error', { message: error?.message || String(error) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, currentFilter]);

  useEffect(() => {
    appendLoadDebugLog('reload-effect:start', {
      currentFilter,
      cardListQuery: describeCardListQuery(cardListQueryRef.current),
      search,
      searchBarQueryActive,
      searchListIsolated,
      filters: summarizeLoadFiltersForLog(filters),
      previousUsersCount: countObjectKeys(users),
      hasMore,
    });

    if (searchListIsolated) {
      appendLoadDebugLog('reload-effect:skip-search-list-isolated', {
        reason: 'SearchBar owns the visible users list while search text is active',
        currentFilter,
        search,
        lastSearchBarQuery,
        searchBarQueryActive,
      });
      setCurrentPage(1);
      setHasMore(false);
      setSearchLoading(false);
      setHasSearched(Boolean((search || lastSearchBarQuery || '').trim()));
      return;
    }

    // «Список» показаного не стирає: його перша сторінка замінить список сама,
    // щойно буде що показати (див. `loadMoreCardList`). Решта добірок
    // починають з порожнього, як і раніше.
    const isCardList = currentFilter === CARD_LIST_FILTER;
    if (!isCardList) setUsers({});
    setHasMore(true);
    setCurrentPage(1);

    if (!currentFilter) {
      appendLoadDebugLog('reload-effect:stop-empty-current-filter', {
        reason: 'currentFilter is empty, load is not started',
      });
      setSearchLoading(false);
      setHasSearched(false);
      return;
    }

    setSearchLoading(true);
    setHasSearched(true);

    if (isCardList) {
      const forceFresh = forceCardListRefreshRef.current;
      forceCardListRefreshRef.current = false;
      appendLoadDebugLog('reload-effect:branch', {
        branch: CARD_LIST_FILTER,
        loader: 'loadMoreCardList',
        query: describeCardListQuery(cardListQueryRef.current),
        forceFresh,
      });
      loadMoreCardList({ reset: true, forceFresh })
        .then(result => {
          if (result?.ignored) return;
          if (result.hasMore) prefetchCardListPage(1);
        })
        .catch(error => {
          appendLoadDebugLog('reload-effect:card-list-error', {
            message: error?.message || String(error),
            stack: error?.stack || null,
          });
          toast.error(`Список не завантажився: ${error?.code || error?.message || 'unknown'}`);
        })
        .finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === OVERLAY_REVIEW_FILTER) {
      // Черга доповнень читає базу сама (`OverlayReviewQueue`) і списку анкет
      // не наповнює: тут лишається тільки зняти скелетон списку, інакше екран
      // показував би вічне «Знайдено …» над чергою.
      appendLoadDebugLog('reload-effect:branch', { branch: OVERLAY_REVIEW_FILTER, loader: 'OverlayReviewQueue' });
      setUsers({});
      setHasMore(false);
      setSearchLoading(false);
      return;
    }

    if (currentFilter === 'CYCLE_FAVORITE') {
      appendLoadDebugLog('reload-effect:branch', { branch: 'CYCLE_FAVORITE', loader: 'loadCycleFavorites' });
      loadCycleFavorites().finally(() => setSearchLoading(false));
      return;
    }

    // Невідома добірка (знімок старої версії екрана) нічого не вантажить:
    // такі знімки переводить у «Список» `handleBackToPreviousList`.
    appendLoadDebugLog('reload-effect:unknown-filter', { currentFilter });
    setSearchLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentFilter, search, loadRequestId, cardListQueryKey, searchListIsolated]);


  const [adding, setAdding] = useState(false);

  const handleAddUser = async () => {
    logProfileRestoreStep('add-user:start', {
      search,
      hasSearchKeyValuePair: Boolean(searchKeyValuePair),
    });
    setAdding(true);
    try {
      const rawSearch = search || '';
      const hasSearchText = rawSearch.trim().length > 0;
      const detectedSearchParams = hasSearchText
        ? detectSearchParams(rawSearch)
        : null;

      const shouldUseDetectedContactParams =
        CONTACT_SEARCH_KEYS.includes(detectedSearchParams?.key) &&
        detectedSearchParams?.value;
      const normalizedSearchKeyValuePair = shouldUseDetectedContactParams
        ? { [detectedSearchParams.key]: detectedSearchParams.value }
        : searchKeyValuePair?.searchId && detectedSearchParams?.key && detectedSearchParams?.value
          ? { [detectedSearchParams.key]: detectedSearchParams.value }
          : searchKeyValuePair;

      if (!hasSearchText && searchKeyValuePair) {
        setSearchKeyValuePair(null);
      }

      const newProfile = await makeNewUser(
        hasSearchText ? normalizedSearchKeyValuePair : null,
        rawSearch,
      );
      logProfileRestoreStep('add-user:created-profile', {
        newProfile: summarizeProfileCardForLog(newProfile),
        hasSearchText,
        normalizedSearchKeyValuePair,
      });
      updateCachedUser(newProfile);
      if (normalizedSearchKeyValuePair && newProfile?.userId) {
        const [cacheKeyName, cacheValue] = Object.entries(normalizedSearchKeyValuePair)[0] || [];
        if (cacheKeyName && cacheValue) {
          const profileSearchCacheKey = getSearchCacheKeyForParams(cacheKeyName, cacheValue, {
            searchIdPrefixes: selectedSearchIdPrefixes,
            equalToKeys: selectedEqualToKeys,
            searchKeyFields: selectedSearchKeyFields,
            enabledSearchKeys,
          });
          setIdsForQuery(profileSearchCacheKey, [newProfile.userId]);
        }
      }
      rememberCardsInCache({ [newProfile.userId]: newProfile });
      setUsers(prev => ({ ...prev, [newProfile.userId]: newProfile }));
      logProfileRestoreStep('add-user:set-state-open-profile-form', {
        userId: newProfile.userId,
      });
      setState(newProfile);
      setUserNotFound(false);
    } finally {
      logProfileRestoreStep('add-user:finish', { search });
      setAdding(false);
    }
  };
  const dotsMenu = () => (
    <ProfileDotsMenu
      navigate={navigate}
      isAdmin={isAdmin}
      access={access}
      isEmailVerified={isEmailVerified}
      showVerifyEmail
      isSessionActive={isLoggedIn}
      onDeleteProfile={() => setShowInfoModal('delProfile')}
      onExit={handleExit}
      onSelect={() => setShowInfoModal(false)}
    />
  );

  // Картку, відкриту олівцем зі стрічки, після видалення повертаємо туди ж
  // (позначку ставить `handleRowEditProfile` у `Matching`).
  const readReturnAfterDelete = id => {
    try {
      const raw = sessionStorage.getItem('addNewProfile:returnAfterDelete');
      sessionStorage.removeItem('addNewProfile:returnAfterDelete');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.userId === id ? parsed.path : '';
    } catch {
      return '';
    }
  };

  const delConfirm = () => {
    const handleRemoveUser = async () => {
      try {
        setIsDeleting(true);
        const id = userIdToDelete || state.userId;
        if (!id) return;
        await removeCardAndSearchId(id);
        setUsers(prevUsers => {
          const updatedUsers = { ...prevUsers };
          delete updatedUsers[id];
          return updatedUsers;
        });
        // Не виконуємо повторне завантаження всіх карток після видалення:
        // пошук з порожнім значенням запускає надто важкий запит і може
        // залишати користувача на нескінченному спінері на мобільних.
        setSearch('');
        setState({});
        setShowInfoModal(null);
        setUserIdToDelete(null);
        navigate(readReturnAfterDelete(id) || '/add');
      } catch (error) {
        console.error('Error deleting user:', error);
      } finally {
        setIsDeleting(false);
      }
    };

    return (
      <>
        {isDeleting ? (
          <span className="spinner" />
        ) : (
          <>
            <ModalTitle>Видалити профіль?</ModalTitle>
            <ModalText>Цю дію не можна скасувати.</ModalText>
            <ModalActionRow>
              <ModalGhostButton type="button" onClick={handleCloseModal}>Відмінити</ModalGhostButton>
              <ModalDangerButton type="button" onClick={handleRemoveUser}>Видалити</ModalDangerButton>
            </ModalActionRow>
          </>
        )}
      </>
    );
  };

  const [compare, setCompare] = useState('');
  const openComparedCard = (userId, refresh) => openComparedCardNavigation({
    userId, refresh, fetchUserById, toast, comparisonReturnRef, location,
    search, setState, setShowInfoModal, navigate,
  });

  useEffect(() => restoreComparedCard({
    comparisonReturnRef, location, setState, setSearch, setShowInfoModal, toast,
  }), [location, setState, setSearch]);
  const [moreActionsState, setMoreActionsState] = useState({
    user: null,
    cards: [],
    loading: false,
    showLikeDislikeCards: false,
    // Причина порожнечі: без неї відмова в правах виглядала точнісінько як
    // «реакцій немає».
    error: '',
  });
  const moreActionsReturnStateRef = useRef(null);
  const shouldReturnToMoreActionsRef = useRef(false);
  const compareCards = () => {
    return (
      <>
        <p>Порівняти</p>
        {/* <p>{compare}</p> */}
        {typeof compare === 'string'
          ? <div dangerouslySetInnerHTML={{ __html: compare }} />
          : compare}
      </>
    );
  };

  const openMoreActionsModal = async userData => {
    const user = userData || null;
    setShowInfoModal('moreActions');
    setMoreActionsState({
      user,
      cards: [],
      loading: false,
      showLikeDislikeCards: false,
      error: '',
    });
  };

  const loadLikeDislikeBatch = async reactions => {
    const loaded = await Promise.all(reactions.map(async ({ id, type }) => {
      const user = getCard(id) || await fetchUserById(id).catch(() => null);
      return user ? { ...user, userId: user.userId || id, _reactionType: type } : null;
    }));
    return loaded.filter(Boolean);
  };

  const loadMoreLikeDislikeCards = async () => {
    const pending = moreActionsState.pendingReactions || [];
    if (!pending.length || moreActionsState.loadingMore) return;
    setMoreActionsState(prev => ({ ...prev, loadingMore: true }));
    const batch = await loadLikeDislikeBatch(pending.slice(0, PAGE_SIZE));
    setMoreActionsState(prev => ({
      ...prev,
      loadingMore: false,
      cards: [...prev.cards, ...batch],
      pendingReactions: (prev.pendingReactions || []).slice(PAGE_SIZE),
    }));
  };

  const toggleLikeDislikeCards = async () => {
    if (!moreActionsState.user?.userId) return;

    if (moreActionsState.showLikeDislikeCards) {
      setMoreActionsState(prev => ({ ...prev, showLikeDislikeCards: false }));
      return;
    }

    if (moreActionsState.cards.length > 0) {
      setMoreActionsState(prev => ({ ...prev, showLikeDislikeCards: true }));
      return;
    }

    setMoreActionsState(prev => ({ ...prev, loading: true, showLikeDislikeCards: true, error: '' }));

    try {
      const ownerId = moreActionsState.user.userId;
      // `rethrow` тут обовʼязковий: реакції належать власниці картки, і відмова
      // в правах на її вузол — не порожній список, а окрема відповідь.
      //
      // З бази — самі мапи id, а анкети порціями (`loadMoreLikeDislikeCards`):
      // доти тут читались повні анкети всіх реакцій людини одразу.
      const [likesMap, dislikesMap] = await Promise.all([
        fetchFavoriteUsers(ownerId, { rethrow: true }),
        fetchDislikeUsers(ownerId, { rethrow: true }),
      ]);

      const reactionTypes = {};
      const reactionAt = {};
      Object.entries(likesMap || {}).forEach(([id, value]) => {
        if (!value) return;
        reactionTypes[id] = 'Like';
        reactionAt[id] = Number(value) || 0;
      });
      Object.entries(dislikesMap || {}).forEach(([id, value]) => {
        if (!value) return;
        reactionTypes[id] = reactionTypes[id] ? `${reactionTypes[id]}/Dislike` : 'Dislike';
        reactionAt[id] = Math.max(reactionAt[id] || 0, Number(value) || 0);
      });
      const pendingReactions = Object.keys(reactionTypes)
        .sort((left, right) => reactionAt[right] - reactionAt[left])
        .map(id => ({ id, type: reactionTypes[id] }));

      const firstBatch = await loadLikeDislikeBatch(pendingReactions.slice(0, PAGE_SIZE));
      setMoreActionsState(prev => ({
        ...prev,
        cards: firstBatch,
        pendingReactions: pendingReactions.slice(PAGE_SIZE),
      }));
    } catch (error) {
      console.error('Unable to load Like/Dislike cards for user:', error);
      const message = isReactionPermissionDeniedError(error)
        ? 'Немає прав на читання реакцій цієї анкети'
        : 'Не вдалося завантажити Like/Dislike';
      toast.error(message);
      setMoreActionsState(prev => ({ ...prev, cards: [], error: message }));
    } finally {
      setMoreActionsState(prev => ({ ...prev, loading: false }));
    }
  };

  const moreActions = () => {
    const user = moreActionsState.user;
    if (!user) return null;

    return (
      <>
        <MoreActionsInfo>
          Останній логін: <strong>{formatDateToDisplay(user.lastLogin2) || user.lastLogin2 || 'немає даних'}</strong>
        </MoreActionsInfo>

        <MoreActionsCommandButton
          $tone="like"
          onClick={() => {
            saveToContact(user);
          }}
        >
          save
        </MoreActionsCommandButton>

        <MoreActionsCommandButton onClick={toggleLikeDislikeCards}>Like/Dislike</MoreActionsCommandButton>

        {moreActionsState.loading && <p>Завантаження...</p>}

        {moreActionsState.showLikeDislikeCards && !moreActionsState.loading && (
          <MatchingMiniList>
            {moreActionsState.error ? (
              <p>{moreActionsState.error}</p>
            ) : moreActionsState.cards.length === 0 ? (
              <p>Список порожній</p>
            ) : (
              moreActionsState.cards.map(card => (
                <MatchingMiniCard key={card.userId}>
                  <MatchingMiniReactionBadge>Reaction: {card._reactionType}</MatchingMiniReactionBadge>
                  <MatchingMiniCardShell
                    onClick={() => {
                      moreActionsReturnStateRef.current = {
                        ...moreActionsState,
                        loading: false,
                        showLikeDislikeCards: true,
                      };
                      shouldReturnToMoreActionsRef.current = true;
                      window.history.pushState({ moreActionsDetails: true }, '');
                      setState(card);
                      setShowInfoModal(false);
                    }}
                  >
                    {(() => {
                      const photos = (Array.isArray(card.photos) ? card.photos : [card.photos])
                        .filter(Boolean)
                        .map(convertDriveLinkToImage);
                      const fullName = [card.name, card.surname]
                        .filter(Boolean)
                        .map(part => String(part).trim())
                        .join(' ');
                      const city = String(card.city || '').trim();

                      return (
                        <>
                          {photos[0] ? (
                            <MatchingMiniMainPhoto src={photos[0]} alt={fullName || 'Фото'} loading="lazy" />
                          ) : (
                            <MatchingMiniFallback>Без фото</MatchingMiniFallback>
                          )}
                          <MatchingMiniOverlay>
                            <MatchingMiniName>{fullName || card.userId || 'Без імені'}</MatchingMiniName>
                            <MatchingMiniMeta>
                              {[city, card.userId].filter(Boolean).join(' · ')}
                            </MatchingMiniMeta>
                          </MatchingMiniOverlay>
                        </>
                      );
                    })()}
                  </MatchingMiniCardShell>
                </MatchingMiniCard>
              ))
            )}
            {!moreActionsState.error && (moreActionsState.pendingReactions || []).length > 0 ? (
              <MoreActionsCommandButton type="button" onClick={loadMoreLikeDislikeCards} disabled={moreActionsState.loadingMore}>
                {moreActionsState.loadingMore
                  ? 'Завантаження...'
                  : `Показати ще (${moreActionsState.pendingReactions.length})`}
              </MoreActionsCommandButton>
            ) : null}
          </MatchingMiniList>
        )}
      </>
    );
  };

  const mergeWithoutOverwrite = (prev, additions) => {
    const merged = { ...prev };
    Object.entries(additions).forEach(([id, data]) => {
      if (!merged[id]) merged[id] = data;
    });
    return merged;
  };


  useEffect(() => {
    const handleMoreActionsBackNavigation = () => {
      if (!shouldReturnToMoreActionsRef.current) return;
      if (!state.userId) return;

      const returnState = moreActionsReturnStateRef.current;
      if (!returnState?.user?.userId) return;

      shouldReturnToMoreActionsRef.current = false;
      setState({});
      setMoreActionsState({
        ...returnState,
        loading: false,
        showLikeDislikeCards: true,
      });
      setShowInfoModal('moreActions');
    };

    window.addEventListener('popstate', handleMoreActionsBackNavigation);
    return () => {
      window.removeEventListener('popstate', handleMoreActionsBackNavigation);
    };
  }, [state.userId, setState]);


  const handlePageChange = async page => {
    // «Список» перемикає сторінку одразу: що вже прийнято, видно без
    // чекання, а бракуюче двигун догортає у фоні — і ще одну сторінку
    // наперед. Решта добірок (цикл, дублікати) приходить цілою, і сторінка
    // там — лише зріз показаного.
    setCurrentPage(page);
    if (currentFilter !== CARD_LIST_FILTER) return;
    ensureCardListLoaded(page * PAGE_SIZE)
      .then(result => {
        if (result?.ignored) return;
        appendLoadDebugLog('handlePageChange:card-list-loaded', { page, hasMore: result?.hasMore });
        if (result?.hasMore) prefetchCardListPage(page);
      })
      .catch(error => {
        appendLoadDebugLog('handlePageChange:card-list-error', {
          page,
          message: error?.message || String(error),
        });
      });
  };

  const saveContactsBySelectedFormat = useCallback((contacts, format = contactExportFormat) => {
    if (!contacts) return;

    if (format === 'csv') {
      saveToContactCsv(contacts);
      return;
    }

    saveToContact(contacts);
  }, [contactExportFormat]);

  const exportFilteredUsers = async () => {
    let fav = favoriteUsersData;
    if (filters.favorite?.favOnly && Object.keys(fav).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
    }

    const allUsers = await getExportContactsBySource(filters, fav);
    if (!allUsers) return;

    saveContactsBySelectedFormat(allUsers);
  };

  /**
   * Анкети з локально обраних файлів вузлів — для офлайн-режиму й локального
   * експорту контактів. Зводить їх той самий `mergeProfileNodeCollections`, що й
   * локальна індексація: три входи з одних файлів мусять бачити ті самі анкети.
   * Тут колись лежав обраний `users.json`, але з колекцією `users` застосунок
   * більше не працює.
   */
  const getLocalNodeProfiles = useCallback(() => {
    if (!PROFILE_NODE_NAMES.some(node => Object.keys(localNodeFiles[node] || {}).length)) return null;
    return mergeProfileNodeCollections(localNodeFiles).profiles;
  }, [localNodeFiles]);

  const hasPhoneStartingWith38 = useCallback(user => {
    const phones = Array.isArray(user?.phone) ? user.phone : [user?.phone];

    return phones.some(phone => {
      const normalizedPhone = String(phone || '')
        .trim()
        .replace(/^\+/, '')
        .replace(/[\s()-]/g, '');

      return normalizedPhone.startsWith('38');
    });
  }, []);

  const getExportContactsBySource = useCallback(async (filtersToApply, favoriteUsersMap) => {
    const source = exportDataSource === 'local' ? 'local' : 'backend';
    let loadedUsers = null;

    if (source === 'local') {
      loadedUsers = getLocalNodeProfiles();
      if (!loadedUsers) {
        toast.error('Оберіть файли вузлів анкет для експорту');
        return null;
      }
    } else {
      // Backend export навмисно читає RTDB напряму й не бере дані з Local Storage.
      loadedUsers = await fetchAllUsersFromRTDB();
    }

    if (!loadedUsers) return null;

    const loadedEntries = Object.entries(loadedUsers);
    const targetExportDecision = {
      userId: CONTACT_EXPORT_DEBUG_USER_ID,
      seenInSource: false,
      filterDecision: null,
    };
    const filteredEntries = filterMain(
      loadedEntries,
      undefined,
      filtersToApply || {},
      favoriteUsersMap,
      dislikeUsersData,
      {
        debugUserId: CONTACT_EXPORT_DEBUG_USER_ID,
        debugLog: (step, payload = {}) => {
          if (payload.userId !== CONTACT_EXPORT_DEBUG_USER_ID) return;
          const getPassed = filterName => (
            payload.reasons && Object.prototype.hasOwnProperty.call(payload.reasons, filterName)
              ? payload.reasons[filterName].passed
              : null
          );

          targetExportDecision.seenInSource = true;
          targetExportDecision.filterDecision = {
            step,
            userId: payload.userId,
            role: payload.role,
            userRole: payload.userRole,
            passedRoleFilter: getPassed('role') ?? getPassed('userRole'),
            passedContactFilter: getPassed('contact'),
            passedUserIdFilter: getPassed('userId'),
            reasons: payload.reasons || {},
          };
        },
      },
    );
    const entriesAfterSpecialFilters = exportOnlyPhonesStartingWith38
      ? filteredEntries.filter(([, user]) => hasPhoneStartingWith38(user))
      : filteredEntries;
    const includedTargetEntry = entriesAfterSpecialFilters.find(
      ([id, user]) => id === CONTACT_EXPORT_DEBUG_USER_ID || user?.userId === CONTACT_EXPORT_DEBUG_USER_ID
    );
    targetExportDecision.includedInExport = Boolean(includedTargetEntry);
    targetExportDecision.passedPhone38Filter = exportOnlyPhonesStartingWith38
      ? Boolean(includedTargetEntry)
      : null;

    const debugInfo = {
      source,
      totalLoaded: loadedEntries.length,
      afterFilters: filteredEntries.length,
      afterPhone38Filter: entriesAfterSpecialFilters.length,
      finalExportedCount: entriesAfterSpecialFilters.length,
      truncatedTo5000: false,
      filesWillBeSplit: entriesAfterSpecialFilters.length > 5000,
      specialFilters: {
        phoneStartsWith38: exportOnlyPhonesStartingWith38,
      },
      filters: filtersToApply || {},
      targetExportDecision,
    };

    console.log(CONTACT_EXPORT_LOG_PREFIX, debugInfo);

    return Object.fromEntries(entriesAfterSpecialFilters);
  }, [
    dislikeUsersData,
    exportDataSource,
    exportOnlyPhonesStartingWith38,
    getLocalNodeProfiles,
    hasPhoneStartingWith38,
  ]);

  const saveAllContacts = async () => {
    const res = await getExportContactsBySource({}, favoriteUsersData);
    if (!res) return;
    saveContactsBySelectedFormat(res);
  };





  const loadCycleFavorites = async () => {
    const cycleUsers = await fetchCycleUsersData(['stimulation', 'pregnant']);
    const relevantUsers = Object.values(cycleUsers).filter(user => {
      if (!user) return false;
      const status = getEffectiveCycleStatus(user);
      const hasStimulationSchedule = user.stimulationSchedule !== undefined;
      return hasStimulationSchedule && (status === 'stimulation' || status === 'pregnant');
    });

    const annotated = sortUsersByStimulationSchedule(relevantUsers, {
      fallbackComparator: compareUsersByGetInTouch,
    });
    const sortedUsers = annotated.map(item => item.user).filter(Boolean);

    const sorted = sortedUsers.reduce((acc, user) => {
      acc[user.userId] = user;
      return acc;
    }, {});

    rememberCardsInCache(cycleUsers);
    setUsers(sorted);
    setHasMore(false);
    setCurrentPage(1);
  };

  const runStimulationShortcutIndexing = useCallback(async () => {
    if (!ownerId) {
      toast.error('Unable to create stimulation shortcuts without owner');
      return;
    }

    const toastId = 'index-stimulation-shortcuts';
    toast.loading('Creating stimulation shortcuts...', { id: toastId });

    try {
      const cycleUsers = await fetchCycleUsersData(['stimulation', 'pregnant']);
      const relevantUsers = Object.values(cycleUsers).filter(user => {
        if (!user) return false;
        const status = getEffectiveCycleStatus(user);
        const hasSchedule = user.stimulationSchedule !== undefined;
        return hasSchedule && (status === 'stimulation' || status === 'pregnant');
      });

      const annotated = sortUsersByStimulationSchedule(relevantUsers, {
        fallbackComparator: compareUsersByGetInTouch,
      });

      const shortcutIds = annotated
        .map(item => item?.user?.userId)
        .filter(Boolean)
        .map(String);

      await replaceStimulationShortcutIds(ownerId, shortcutIds);
      setStoredStimulationShortcutIds(shortcutIds);

      if (isMountedRef.current) {
        setStimulationShortcutIdsState(shortcutIds);
      }

      await refreshStimulationShortcuts();

      toast.success(`Created ${shortcutIds.length} stimulation shortcuts`, {
        id: toastId,
      });
    } catch (error) {
      console.error('Failed to index stimulation shortcuts', error);
      toast.error('Failed to create stimulation shortcuts', { id: toastId });
      const detailedMessage =
        (error && typeof error === 'object' && 'message' in error && error.message) ||
        (typeof error === 'string' ? error : null);

      if (error?.code) {
        toast.error(`Error code: ${error.code}`);
      }

      if (detailedMessage) {
        toast.error(`Error details: ${detailedMessage}`);
      }
    }
  }, [
    ownerId,
    compareUsersByGetInTouch,
    refreshStimulationShortcuts,
    setStimulationShortcutIdsState,
  ]);

  const [, setDuplicates] = useState('');
  const [isDuplicateView, setIsDuplicateView] = useState(false);
  /**
   * «Хто що шукав» — картки читачів разом з їхніми запитами.
   *
   * Запит людини лежить у `multiData/searchQueries/{читач}` і досі був видний
   * лише їй самій — підказкою при наборі. Адмінці ж він каже те, чого не каже
   * жодна анкета: кого ця людина шукала й чого не знайшла. Тому тут і картка
   * читача, і його запити під нею: натиснув запит — той самий пошук
   * повторився, і видно, що бачив він.
   *
   * Читання службове й дороге (вузол цілком), тож воно робиться на явне
   * натискання, а не при відкритті екрана.
   */
  const [searchQueriesByOwner, setSearchQueriesByOwner] = useState({});
  const [isLoadingSearchers, setIsLoadingSearchers] = useState(false);
  const [isSearchersView, setIsSearchersView] = useState(false);
  const [deletingSearcherQuery, setDeletingSearcherQuery] = useState('');
  const searchersRequestRef = useRef(0);

  const SEARCHERS_LIMIT = 60;

  const handleShowSearchers = async () => {
    const requestId = searchersRequestRef.current + 1;
    searchersRequestRef.current = requestId;
    setIsLoadingSearchers(true);
    const toastId = 'searchers-load';
    toast.loading('Читаємо, хто що шукав…', { id: toastId });
    try {
      const owners = (await fetchAllSearchQueryOwners()).slice(0, SEARCHERS_LIMIT);
      if (!owners.length) {
        toast('Записів пошуку ще немає', { id: toastId });
        return;
      }

      // Анкети читаються по одній на читача — їх десятки, а не сотні, і це
      // явна дія адміна, а не фонове довантаження.
      const profiles = await Promise.all(owners.map(async owner => {
        const profile = await fetchUserById(owner.ownerId).catch(() => null);
        return [owner.ownerId, profile || { userId: owner.ownerId }];
      }));

      if (searchersRequestRef.current !== requestId) return;

      setSearchQueriesByOwner(Object.fromEntries(owners.map(owner => [owner.ownerId, owner.queries])));
      setUsers(Object.fromEntries(profiles));
      setIsSearchersView(true);
      setIsDuplicateView(false);
      setUserNotFound(false);
      setHasMore(false);
      setCurrentPage(1);
      toast.success(`Читачів із запитами: ${owners.length}`, { id: toastId });
    } catch (error) {
      console.error('[searchers] не вдалося прочитати історію пошуку', error);
      toast.error(`Не вдалося прочитати історію пошуку: ${error?.code || error?.message || 'помилка'}`, { id: toastId });
    } finally {
      if (searchersRequestRef.current === requestId) setIsLoadingSearchers(false);
    }
  };

  // Наступний пошук чи фільтр — це вже інше питання, тож перелік читачів іде
  // з екрана разом з ним.
  useEffect(() => {
    searchersRequestRef.current += 1;
    setIsLoadingSearchers(false);
    setIsSearchersView(false);
  }, [search, currentFilter]);

  const applySearcherQuery = value => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) return;
    setSearch(normalizedValue);
    localStorage.setItem(SEARCH_KEY, normalizedValue);
    // Той самий шлях, яким пошук іде з рядка: перемонтований `SearchBar`
    // виконує набране на старті сам (`suppressInitialSearchExecution`).
    setSearchBarResetVersion(version => version + 1);
  };

  const handleRemoveSearcherQuery = async (ownerId, row) => {
    const queryId = row?.queryId;
    if (!ownerId || !queryId) return;

    const pendingKey = `${ownerId}/${queryId}`;
    setDeletingSearcherQuery(pendingKey);
    try {
      const removed = await removeMatchingSearchQuery({ ownerId, queryId });
      if (!removed) throw new Error('Запит не видалено');

      setSearchQueriesByOwner(previous => {
        const remaining = (previous[ownerId] || []).filter(query => query.queryId !== queryId);
        if (!remaining.length) {
          const { [ownerId]: _removedOwner, ...rest } = previous;
          return rest;
        }
        return { ...previous, [ownerId]: remaining };
      });
      setUsers(previous => {
        const remainingQueries = (searchQueriesByOwner[ownerId] || []).filter(query => query.queryId !== queryId);
        if (remainingQueries.length) return previous;
        const { [ownerId]: _removedOwner, ...rest } = previous;
        return rest;
      });
    } catch (error) {
      toast.error(`Не вдалося видалити пошуковий запит: ${error?.code || error?.message || 'помилка'}`);
    } finally {
      setDeletingSearcherQuery(current => current === pendingKey ? '' : current);
    }
  };

  const renderSearcherFooter = ownerId => {
    const queries = searchQueriesByOwner[ownerId];
    if (!isSearchersView || !queries?.length) return null;

    return (
      <SearcherQueries>
        <SearcherQueriesTitle>Шукали ({queries.length})</SearcherQueriesTitle>
        {queries.map(row => {
          // Номер тут — це не текст, а контакт: поруч із ним стоять ті самі
          // три канали, якими з нього й пишуть.
          const detected = detectSearchParams(row.query);
          const detectedPhone = detected?.key === 'phone' ? detected.value : '';
          const phone = String(detectedPhone || '').replace(/\D/g, '').length >= 10
            ? detectedPhone
            : '';
          return (
            <SearcherQueryRow key={`${ownerId}-${row.query}`}>
              <SearcherQueryButton
                type="button"
                title="Повторити цей пошук"
                onClick={() => applySearcherQuery(row.query)}
              >
                {row.query}
              </SearcherQueryButton>
              {phone && (
                <>
                  <SearcherQueryLink href={CONTACT_LINK_BUILDERS.telegramFromPhone(`+${phone}`)} target="_blank" rel="noopener noreferrer" title="Telegram">TG</SearcherQueryLink>
                  <SearcherQueryLink href={CONTACT_LINK_BUILDERS.viberFromPhone(phone)} target="_blank" rel="noopener noreferrer" title="Viber">VB</SearcherQueryLink>
                  <SearcherQueryLink href={CONTACT_LINK_BUILDERS.whatsappFromPhone(phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp">WA</SearcherQueryLink>
                </>
              )}
              {row.count > 1 && <SearcherQueryMeta>×{row.count}</SearcherQueryMeta>}
              <SearcherQueryRemoveButton
                type="button"
                aria-label={`Видалити пошуковий запит: ${row.query}`}
                title="Видалити пошуковий запит із бекенду"
                disabled={deletingSearcherQuery === `${ownerId}/${row.queryId}`}
                onClick={event => {
                  event.stopPropagation();
                  handleRemoveSearcherQuery(ownerId, row);
                }}
              >
                &times;
              </SearcherQueryRemoveButton>
            </SearcherQueryRow>
          );
        })}
      </SearcherQueries>
    );
  };

  useEffect(() => {
    let backendDupData;
    const verifyDuplicate = async id => {
      if (!backendDupData) {
        backendDupData = await loadDuplicateUsers();
      }
      return backendDupData?.mergedUsers?.[id] || null;
    };

    (async () => {
      const { cards: cached } = await getDplCards(verifyDuplicate);
      if (cached.length > 0) {
        const merged = cached.reduce((acc, user) => {
          acc[user.userId] = user;
          return acc;
        }, {});
        setUsers(prev => ({ ...prev, ...merged }));
        setDuplicates(
          backendDupData?.totalDuplicates || Math.floor(cached.length / 2),
        );
        setIsDuplicateView(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (isDuplicateView && state.userId) {
      if (comparisonReturnRef.current) return undefined;
      const currentId = state.userId;
      const handlePopState = () => {
        setState({});
        const el = document.getElementById(currentId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };

      window.history.pushState({ duplicateEdit: true }, '');
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isDuplicateView, setState, state.userId]);

  const searchDuplicates = async () => {
    const { cards: cached } = await getDplCards();
    if (cached.length > 0) {
      const merged = cached.reduce((acc, user) => {
        acc[user.userId] = user;
        return acc;
      }, {});
      setUsers(prev => ({ ...prev, ...merged }));
      setDuplicates(Math.floor(cached.length / 2));
      setIsDuplicateView(true);
      return;
    }
    const { mergedUsers, totalDuplicates } = await loadDuplicateUsers();
    cacheDplUsers(mergedUsers);
    setUsers(prevUsers => ({ ...prevUsers, ...mergedUsers }));
    setDuplicates(totalDuplicates);
    setIsDuplicateView(true);
  };

  const handleInfo = () => {
    alert(`Loaded cards: ${Object.keys(users || {}).length}`);
  };

  const handleClearCache = () => {
    clearAllCardsCache();
    localStorage.removeItem(SEARCH_KEY);
    setSearch('');
    setUsers({});
    setFavoriteUsersData({});
    setDislikeUsersData({});
    setSearchKeyValuePair(null);
    setSearchLoading(false);
    setHasSearched(false);
    setUserNotFound(false);
    setHasMore(true);
    setCurrentPage(1);
    setSearchBarQueryActive(false);
    setLastSearchBarQuery('');
    setDuplicates('');
    setIsDuplicateView(false);
    searchListIsolationRef.current = false;
    renderCacheHydrationIdsRef.current = new Set();
    setSearchBarResetVersion(version => version + 1);
    toast.success('Cache cleared');
  };

  const toggleSearchKeyIndexSelection = indexKey => {
    setSelectedSearchKeyIndexes(prev => ({
      ...prev,
      [indexKey]: !prev[indexKey],
    }));
  };

  const toggleIndexJobSelection = jobKey => {
    setSelectedIndexJobs(prev => ({
      ...prev,
      [jobKey]: !prev[jobKey],
    }));
  };

  /**
   * Локальна індексація — та сама робота, що й на бекенді, тільки без бекенду.
   *
   * Анкети збираються тим самим `mergeProfileNodeCollections`, яким їх збирає
   * серверний шлях. Це не охайність, а вимога: якби збірки розійшлись, індекс,
   * зібраний локально, відрізнявся б від серверного — і побачити це можна було
   * б хіба що по дірках у пошуку.
   */
  const runLocalSearchIndexesWithCollections = useCallback(
    async ({ nodeFiles, draftsData, indexTypes }) => {
      const { profiles, stats } = mergeProfileNodeCollections(nodeFiles || {});

      // Колекція у вебі одна, тож і мапа одна: розділення на деки прибрано.
      const collectionsMap = { profiles };

      // Чернетки йдуть лише в `searchId`. У `searchKey` їм не місце: за тими
      // бакетами будується стрічка, а чернетка в стрічку не потрапляє — і
      // перебудова індексу не той шлях, яким вона б туди потрапила вперше.
      const drafts = draftsData && Object.keys(draftsData).length ? draftsData : null;
      const searchIdPayload = buildSearchIdIndexPayloadFromCollections(
        drafts ? { ...collectionsMap, drafts } : collectionsMap,
      );
      const searchKeyPayload = buildSearchKeyIndexPayloadFromCollections(collectionsMap, indexTypes);

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadJsonFile(`searchId-index-${stamp}.json`, searchIdPayload);
      downloadJsonFile(`searchKey-index-${stamp}.json`, searchKeyPayload);
      return { ...stats, drafts: drafts ? Object.keys(drafts).length : 0 };
    },
    [downloadJsonFile],
  );

  /**
   * Відкриває ту саму модалку без вибору типів індексу: вхід із кнопки «Картки»
   * веде до збірки `matchingCards`, а не до індексів `searchId`/`searchKey`.
   */
  const openMatchingCardsModal = useCallback(() => {
    setShowLocalIndexModal(true);
  }, []);

  const openLocalIndexModal = useCallback(indexTypes => {
    setPendingLocalIndexTypes(indexTypes);
    setShowLocalIndexModal(true);
  }, []);

  /**
   * Викачати нові вузли, щоб індексувати з них локально.
   *
   * Два входи індексації мусять давати однакові анкети, а джерело істини —
   * вузли. Без цієї кнопки локальний шлях не мав би з чого збиратись: колекцію
   * `users`, з якої він збирався колись, застосунок більше не знає.
   *
   * Кожен вузол — окремий файл, бо назад вони теж заливаються поокремо, кожен
   * у свій шлях.
   */
  const handleDownloadProfileNodesForLocalIndex = useCallback(async () => {
    const toastId = 'download-local-index-nodes';
    toast.loading('Завантаження вузлів анкет...', { id: toastId });
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const loaded = await Promise.all(PROFILE_NODE_NAMES.map(async node => {
        const snapshot = await get(ref(database, node));
        const value = snapshot.exists() ? snapshot.val() || {} : {};
        downloadJsonFile(`${node}-${stamp}.json`, value);
        return [node, Object.keys(value).length];
      }));

      // Чернетки лежать не у вузлах анкет, а в `multiData/profileMutations` —
      // і без них локально зібраний `searchId` знищив би записи, якими
      // чернетки боронять себе від дубля.
      const draftsSnapshot = await get(ref(database, PROFILE_DRAFTS_INDEX_NODE));
      const drafts = draftsSnapshot.exists()
        ? collectDraftProfilesForIndexing(draftsSnapshot.val())
        : {};
      downloadJsonFile(`profileMutations-${stamp}.json`, drafts);
      loaded.push(['чернетки', Object.keys(drafts).length]);

      toast.success(
        `Вузли завантажено — ${loaded.map(([node, count]) => `${node}: ${count}`).join(', ')}`,
        { id: toastId, duration: 8000 },
      );
    } catch (error) {
      toast.error(`Не вдалося завантажити вузли: ${error?.message || 'невідома помилка'}`, { id: toastId });
    }
  }, [downloadJsonFile]);

  /**
   * Кожен файл сам себе називає: `matchingCards.json`, `profileDetails.json`
   * і так далі — рівно ті імена, під якими їх віддає кнопка «Викачати вузли
   * анкет». Тож замість пʼяти окремих кнопок один вибір із кількох файлів, а
   * розкладає їх ім'я файлу.
   */
  const handleLocalNodeFilesSelected = useCallback(async event => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;

    const next = {};
    const nextDrafts = {};
    const unknown = [];

    await Promise.all(files.map(async file => {
      // Чернетки — окремий файл і окреме призначення: вони йдуть тільки в
      // `searchId`, тож у мапу вузлів анкет не потрапляють.
      const isDraftsFile = file.name.includes('profileMutations');
      const node = isDraftsFile ? null : PROFILE_NODE_NAMES.find(name => file.name.includes(name));
      if (!node && !isDraftsFile) {
        unknown.push(file.name);
        return;
      }
      try {
        const parsed = JSON.parse(await file.text());
        if (isDraftsFile) {
          // Файл може бути і вже зведеною мапою чернеток, і сирим вузлом
          // `{хто завів: {id: мутація}}` — другий зводиться тим самим кодом,
          // що й на бекенді.
          const isRawMutations = Object.values(parsed || {}).some(value =>
            value && typeof value === 'object' && Object.values(value).some(item => item?.operation));
          Object.assign(nextDrafts, isRawMutations ? collectDraftProfilesForIndexing(parsed) : parsed);
          return;
        }
        // Файл може бути і вмістом вузла, і експортом із обгорткою.
        next[node] = parsed?.[node] && typeof parsed[node] === 'object' ? parsed[node] : parsed;
      } catch (error) {
        unknown.push(`${file.name} (не JSON)`);
      }
    }));

    if (Object.keys(nextDrafts).length) {
      setLocalDraftProfiles(current => ({ ...current, ...nextDrafts }));
      toast.success(`Прочитано чернеток: ${Object.keys(nextDrafts).length}`);
    }

    if (Object.keys(next).length) {
      setLocalNodeFiles(current => ({ ...current, ...next }));
      toast.success(`Прочитано вузли: ${Object.keys(next).join(', ')}`);
    }
    if (unknown.length) {
      toast.error(`Не впізнано за назвою: ${unknown.join(', ')}`);
    }
  }, []);

  // Що саме зараз завантажено — і чи варте воно індексації. Мовчати не можна:
  // людина натисне кнопку, отримає файл, заллє його — і зламає пошук, не
  // побачивши жодної помилки.
  const localIndexSources = describeLocalIndexingSources(localNodeFiles);

  const handlePickLocalNodeFiles = useCallback(() => {
    if (localNodeFilesInputRef.current) {
      localNodeFilesInputRef.current.value = '';
      localNodeFilesInputRef.current.click();
    }
  }, []);

  // Копію `users.json`, яку офлайн-режим колись клав у IndexedDB, прибираємо
  // одразу на відкритті екрана, а не лише на виході: це вся колекція з
  // контактами, і читати її вже нікому (`purgeLegacyOfflineUsersCopy`).
  useEffect(() => {
    purgeLegacyOfflineUsersCopy();
  }, []);

  const handleApplyLocalIndexing = useCallback(async () => {
    // Досить будь-якого вузла: контакти, скажімо, живуть самі в `profileContacts`.
    if (!localIndexSources.isUsable) {
      toast.error('Спочатку оберіть файли вузлів');
      return;
    }

    const toastId = 'local-index-build';
    toast.loading('Формуємо локальні JSON індекси searchId/searchKey...', { id: toastId });
    try {
      const stats = await runLocalSearchIndexesWithCollections({
        nodeFiles: localNodeFiles,
        draftsData: localDraftProfiles,
        indexTypes: pendingLocalIndexTypes,
      });
      console.info('[localIndex] зібрано анкет', stats);
      toast.success(
        `Локальні JSON індекси завантажено: анкет ${stats.total}`
          + (stats.drafts ? `, чернеток ${stats.drafts}` : ''),
        { id: toastId, duration: 8000 },
      );
      setShowLocalIndexModal(false);
    } catch (error) {
      toast.error(`Помилка локальної індексації: ${error?.message || 'невідома помилка'}`, { id: toastId });
    }
  }, [
    localIndexSources.isUsable,
    pendingLocalIndexTypes,
    localNodeFiles,
    localDraftProfiles,
    runLocalSearchIndexesWithCollections,
  ]);

  const buildFullKeySetFromCollections = useCallback(() => {
    if (!localIndexSources.isUsable) {
      toast.error('Спочатку оберіть файли вузлів');
      return;
    }

    // Карта ключів будується по тих самих анкетах, що й індекси — зведених
    // тим самим `mergeProfileNodeCollections`.
    const { profiles } = mergeProfileNodeCollections(localNodeFiles);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const keyMap = buildFullCardKeyMap({ profiles });
    downloadJsonFile(`full-card-keys-${stamp}.json`, {
      createdAt: new Date().toISOString(),
      ...keyMap,
    });
    toast.success(`Знайдено ${keyMap.totalKeys} ключів у ${keyMap.totalCards} картках`);
  }, [
    downloadJsonFile,
    localIndexSources.isUsable,
    localNodeFiles,
  ]);

  const longPressTimerRef = useRef(null);
  const showButtonHint = useCallback(helpText => {
    if (!helpText) return;
    toast(helpText, { icon: 'ℹ️', duration: 3500 });
  }, []);

  const createLongPressHandlers = useCallback(
    helpText => ({
      onContextMenu: event => {
        event.preventDefault();
        showButtonHint(helpText);
      },
      onTouchStart: () => {
        longPressTimerRef.current = setTimeout(() => showButtonHint(helpText), LONG_PRESS_MS);
      },
      onTouchEnd: () => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      },
      onMouseDown: () => {
        longPressTimerRef.current = setTimeout(() => showButtonHint(helpText), LONG_PRESS_MS);
      },
      onMouseUp: () => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      },
      onMouseLeave: () => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      },
    }),
    [showButtonHint],
  );

  const runSelectedIndexes = async () => {
    const selectedIndexTypes = SEARCH_KEY_INDEX_OPTIONS.filter(option => selectedSearchKeyIndexes[option.key]).map(
      option => option.key,
    );

    if (
      !selectedIndexJobs.stimulationShortcuts &&
      !selectedIndexJobs.profileMutationOwners &&
      !selectedIndexJobs.matchingCardPublicComments &&
      !selectedIndexJobs.matchingCardBlood &&
      !selectedIndexJobs.photoCacheControl &&
      !selectedIndexJobs.feedPhotoThumbs &&
      !selectedIndexJobs.searchKeyUsersAll &&
      !selectedIndexJobs.searchKeySetReindex &&
      !selectedIndexJobs.searchLocalIdAndKey &&
      !selectedIndexJobs.searchLocalImtHeightWeight &&
      !selectedIndexTypes.length
    ) {
      toast.error('Оберіть хоча б один індекс для запуску');
      return;
    }

    try {
      if (selectedIndexJobs.stimulationShortcuts) {
        await runStimulationShortcutIndexing();
      }

      if (selectedIndexJobs.searchKeySetReindex) {
        const toastId = 'index-searchkey-set-reindex-progress';
        toast.loading('Перебудова searchKeySet наборів фільтрів...', { id: toastId });
        const stats = await rebuildAllFilterSetIndexes({
          onProgress: (stage, payload) => {
            if (stage === 'searchKey') {
              toast.loading(`Читаємо searchKey ${payload?.percent || 0}%${payload?.indexName ? ` (${payload.indexName})` : ''}...`, { id: toastId });
              return;
            }
            if (stage === 'owners') {
              toast.loading('Шукаємо власників правил доступу...', { id: toastId });
              return;
            }
            toast.loading(
              `Перебудова наборів ${payload?.percent || 0}% (${payload?.processed || 0}/${payload?.total || 0})`,
              { id: toastId },
            );
          },
        });
        const failed = stats.errors?.length ? `, помилок: ${stats.errors.length}` : '';
        toast.success(
          `searchKeySet оновлено: ${stats.indexedRuleSets}/${stats.totalRuleSets} наборів${failed}.`,
          { id: toastId },
        );
      }

      if (selectedIndexJobs.profileMutationOwners) {
        const toastId = 'index-profile-mutation-owners-progress';
        toast.loading('Дописуємо авторів чернеток...', { id: toastId });
        const written = await backfillProfileDraftOwners();
        toast.success(
          written
            ? `Авторів дописано: ${written}`
            : 'Усі чернетки вже мають автора',
          { id: toastId },
        );
      }

      if (selectedIndexJobs.matchingCardPublicComments) {
        const toastId = 'index-matching-card-public-comments-progress';
        toast.loading('Дописуємо hasPublicReview за наявними відгуками...', { id: toastId });
        const report = await backfillMatchingCardPublicReviewFlags();
        const { tone, message } = describePublicReviewFlagBackfill(report);
        if (tone === 'error') {
          console.error('[AddNewProfile] hasPublicReview backfill failures', report);
          toast.error(message, { id: toastId, duration: 20000 });
        } else {
          toast.success(message, { id: toastId, duration: 10000 });
        }
      }

      if (selectedIndexJobs.matchingCardBlood) {
        const toastId = 'index-matching-card-blood-progress';
        toast.loading('Дописуємо групу крові в опубліковані картки...', { id: toastId });
        const report = await backfillMatchingCardBlood();
        const { tone, message } = describeMatchingCardBloodBackfill(report);
        if (tone === 'error') {
          console.error('[AddNewProfile] blood backfill failures', report);
          toast.error(message, { id: toastId, duration: 20000 });
        } else {
          toast.success(message, { id: toastId, duration: 10000 });
        }
      }

      if (selectedIndexJobs.photoCacheControl) {
        const toastId = 'index-photo-cache-control-progress';
        toast.loading('Ставимо фото кеш браузера на рік...', { id: toastId });
        const report = await backfillAvatarCacheControl({
          onProgress: ({ done, total }) => toast.loading(`Кеш фото: анкет ${done}/${total}...`, { id: toastId }),
        });
        const { tone, message } = describeAvatarCacheControlBackfill(report);
        if (tone === 'error') {
          console.error('[AddNewProfile] photo cache-control backfill failures', report);
          toast.error(message, { id: toastId, duration: 20000 });
        } else {
          toast.success(message, { id: toastId, duration: 10000 });
        }
      }

      if (selectedIndexJobs.feedPhotoThumbs) {
        const toastId = 'index-feed-photo-thumbs-progress';
        toast.loading('Робимо мініатюри головних фото...', { id: toastId });
        const report = await backfillFeedPhotoThumbs({
          onProgress: ({ done, total }) => toast.loading(`Мініатюри фото: ${done}/${total}...`, { id: toastId }),
        });
        const { tone, message } = describeFeedPhotoThumbsBackfill(report);
        if (tone === 'error') {
          console.error('[AddNewProfile] feed photo thumbs backfill failures', report);
          toast.error(message, { id: toastId, duration: 20000 });
        } else if (tone === 'warning') {
          // Биті посилання на фото — не збій роботи, але id карток треба
          // встигнути прочитати.
          console.warn('[AddNewProfile] feed photo thumbs: photos missing in Storage', report.missing);
          toast(message, { id: toastId, icon: '⚠️', duration: 20000 });
        } else {
          toast.success(message, { id: toastId, duration: 10000 });
        }
      }

      if (selectedIndexJobs.searchLocalIdAndKey) {
        openLocalIndexModal(selectedIndexTypes.length ? selectedIndexTypes : SEARCH_KEY_INDEX_OPTIONS.map(option => option.key));
        return;
      }

      if (selectedIndexJobs.searchLocalImtHeightWeight) {
        openLocalIndexModal(['imtHeightWeight']);
        return;
      }

      if (selectedIndexJobs.searchKeyUsersAll) {
        const toastId = 'index-searchkey-users-all-progress';
        const allSearchKeyIndexTypes = SEARCH_KEY_INDEX_OPTIONS.map(option => option.key);
        const indexTypesForUsers = selectedIndexTypes.length ? selectedIndexTypes : allSearchKeyIndexTypes;
        toast.loading(
          selectedIndexTypes.length
            ? 'Indexing searchKey selected indexes...'
            : 'Indexing searchKey all indexes...',
          { id: toastId },
        );
        await createSelectedSearchKeyIndexes(
          indexTypesForUsers,
          (progress, meta) => {
            const indexLabel = meta?.indexType || '';
            const indexNumber = meta?.indexNumber || 1;
            const totalIndexes = meta?.totalIndexes || indexTypesForUsers.length;
            toast.loading(
              `Indexing searchKey/${indexLabel} ${progress}% (${indexNumber}/${totalIndexes})`,
              { id: toastId },
            );
          },
        );
        toast.success(
          selectedIndexTypes.length
            ? 'Обрані searchKey індекси побудовано'
            : 'Всі searchKey індекси побудовано',
          { id: toastId },
        );
      }

      if (!selectedIndexTypes.length) {
        return;
      }

      if (selectedIndexJobs.searchKeyUsersAll) {
        return;
      }

      const toastId = 'index-searchkey-selected-progress';
      const formatProgressMessage = (progress, meta) => {
        const indexLabel = meta?.indexType || '';
        const indexNumber = meta?.indexNumber || 1;
        const totalIndexes = meta?.totalIndexes || selectedIndexTypes.length;
        return `Indexing searchKey/${indexLabel} ${progress}% (${indexNumber}/${totalIndexes})`;
      };

      // Один прогін на всю колекцію. Раніше їх було два — по одному «на
      // колекцію», — і обидва читали ті самі вузли й писали в той самий індекс.
      // Корінь під кожен запис вибирає сам будівник, за форматом id.
      toast.loading('Indexing searchKey indexes...', { id: toastId });
      await createSelectedSearchKeyIndexes(selectedIndexTypes, (progress, meta) => {
        toast.loading(formatProgressMessage(progress, meta), { id: toastId });
      });

      toast.success('Обрані searchKey індекси побудовано', { id: toastId });
    } catch (error) {
      console.error('[AddNewProfile] Indexing failed', error);
      toast.error(`Помилка індексації: ${error?.message || 'невідома помилка'}`);
    }
  };

  /**
   * Разова побудова урізаних карток стрічки для обох колекцій.
   *
   * Далі вони тримаються актуальними самі — писачі анкет оновлюють проєкцію на
   * кожному збереженні. Ця кнопка потрібна для анкет, які з моменту появи
   * проєкції ще жодного разу не зберігали, і як спосіб перебудувати вузол з
   * нуля, якщо схема змінилась.
   */
  const [isMatchingCardsIndexing, setIsMatchingCardsIndexing] = useState(false);

  /**
   * Офлайн-збірка вузла `matchingCards` з локальних копій колекцій.
   *
   * Швидший шлях і, з телефона, єдиний практичний: побудова на бекенді — це
   * тисячі дрібних записів по мобільній мережі. Тут не робиться жодного запиту:
   * файл збирається з уже викачаних локальних файлів, а в базу потрапляє одним
   * ручним імпортом у вузол `matchingCards`.
   */
  const handleBuildLocalMatchingCards = useCallback(() => {
    if (!localIndexSources.isUsable) {
      toast.error('Спершу оберіть файли вузлів');
      return;
    }

    // Картки збираються з тих самих зведених анкет, що й індекси: два входи
    // індексації мусять давати однаковий результат, інакше локальна збірка
    // тихо розійдеться з бекендовою.
    const { profiles } = mergeProfileNodeCollections(localNodeFiles);

    const { payload, stats } = buildMatchingCardsPayloadFromCollections({ profiles });

    if (!stats.written) {
      toast.error('У обраних файлах немає карток для побудови');
      return;
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadJsonFile(`matchingCards-${stamp}.json`, payload);
    toast.success(
      `matchingCards.json зібрано: ${stats.written} карток, з них з фото ${stats.withAvatar}, `
        + `у стрічку потрапляють ${stats.inFeed}.\n`
        + 'Імпортуйте файл у вузол matchingCards.',
      { duration: 8000 },
    );
  }, [
    downloadJsonFile,
    localIndexSources.isUsable,
    localNodeFiles,
  ]);

  const handleBuildMatchingCards = async () => {
    if (!isAdmin || isMatchingCardsIndexing) return;

    // Лістинг Storage — найдовша частина роботи (один рекурсивний обхід на
    // анкету без поля `photos`), тож вибір лишається за адміном.
    const includeStorageAvatars = window.confirm(
      'Шукати аватари у Storage для анкет без поля photos?\n\n' +
        'OK — повільніше, але картки в стрічці будуть з фото.\n' +
        'Скасувати — швидка побудова лише з даних анкет.',
    );

    const toastId = 'index-matching-cards-progress';
    setIsMatchingCardsIndexing(true);
    toast.loading('Побудова карток стрічки...', { id: toastId });
    try {
      // Один прогін: колекція у вебі одна, і перебудова накриває її цілком.
      const stats = await createMatchingCardsIndex(
        (progress, meta) => {
          toast.loading(
            `Побудова карток стрічки: ${progress}% (${meta?.processed || 0}/${meta?.total || 0})`,
            { id: toastId },
          );
        },
        { includeStorageAvatars },
      );
      toast.success(`Картки стрічки побудовано — ${stats.written}/${stats.total}`, { id: toastId });
    } catch (error) {
      console.error('[AddNewProfile] matchingCards indexing failed', error);
      toast.error(`Помилка побудови карток стрічки: ${error?.message || 'невідома помилка'}`, {
        id: toastId,
        // Пояснення про правила довше за рядок — інакше воно зникне недочитаним.
        duration: error?.code === 'MATCHING_CARDS_PERMISSION_DENIED' ? 15000 : 6000,
      });
    } finally {
      setIsMatchingCardsIndexing(false);
    }
  };

  /**
   * Перенос відгуків імпортованих карток з приватних нотаток у публічні.
   *
   * Картки з id виду `TG0001` і `ID0001` завели імпортом з таблиці, і текст
   * відгуку поїхав разом з анкетою — але поїхав у `multiData/comments`, тобто в
   * особисту нотатку того, хто імпортував. Насправді це відгук агенції про
   * донорку: бачити його мусить кожен, хто відкриє анкету. Розбір, що саме
   * переносити і від чийого імені, — у `utils/legacyImportCommentMigration`;
   * тут лише кнопка, підтвердження і звіт.
   *
   * Кнопка на партію, а не одна на всі: партії заводили різними імпортами й
   * переносять їх теж поодинці — щоб побачити результат на одній, перш ніж
   * чіпати другу.
   */
  const [migratingCommentsPrefix, setMigratingCommentsPrefix] = useState('');

  const handleMigrateLegacyComments = async prefix => {
    if (!isAdmin || migratingCommentsPrefix) return;

    if (!window.confirm(
      `Перенести коментарі карток ${prefix}… у публічні відгуки?\n\n`
        + 'Автором стане той, хто записаний у полі writer; повторний запуск нічого не дублює.',
    )) return;

    // Перенести чи скопіювати — питання не про дані, а про довіру до одного
    // прогону: приватний оригінал прибирається лише після вдалого публічного
    // запису, але побачити результат перед прибиранням — законне бажання.
    const removePrivate = window.confirm(
      'Прибрати приватні коментарі після переносу?\n\n'
        + 'OK — перенести (приватна нотатка зникає).\n'
        + 'Скасувати — скопіювати (нотатка лишається на місці).',
    );

    const toastId = 'migrate-legacy-comments-progress';
    setMigratingCommentsPrefix(prefix);
    toast.loading(`Перенос коментарів ${prefix}-карток...`, { id: toastId });
    try {
      const stats = await migrateLegacyImportCommentsToPublic({
        prefix,
        removePrivate,
        // Нотатка без позначки `writer` нічим не доводить, що вона з імпорту, а
        // не особиста, — і мовчки публікувати таку не можна. Але й мовчки
        // відкидати теж: партія з таблиці `writer` не отримує взагалі, тож
        // гейт означав би «ця кнопка ніколи нічого не перенесе». Тому питаємо,
        // показуючи самі тексти: рішення тут саме про них.
        confirmMissingWriter: ({ count, samples }) => window.confirm(
          `У ${count} карток ${prefix}… немає позначки writer — довести, що це відгук `
            + 'агенції, а не Ваша особиста нотатка, нема чим.\n\n'
            + 'Опублікувати їх? Ці тексти побачить кожен користувач бази:\n\n'
            + samples
              .map(({ profileId, text }) => `• ${profileId}: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`)
              .join('\n')
            + (count > samples.length ? `\n…і ще ${count - samples.length}` : ''),
        ),
        onProgress: ({ processed, total }) => {
          toast.loading(`Перенос коментарів ${prefix}-карток: ${processed}/${total}`, { id: toastId });
        },
      });

      const details = [
        `перенесено ${stats.written}/${stats.total}`,
        stats.alreadyPublic ? `вже були публічними: ${stats.alreadyPublic}` : '',
        removePrivate ? `прибрано приватних: ${stats.removed}` : 'приватні нотатки лишились',
        stats.failed ? `не вдалося: ${stats.failed}` : '',
      ].filter(Boolean).join(', ');

      if (stats.failed || stats.unreadableOwnerIds.length) {
        console.error('[AddNewProfile] legacy comments migration failures', stats.failures);
        // Звіт «перенесено 0/1» без причини не каже нічого, а причина майже
        // завжди одна й та сама — правила бази ще не викочені, бо CI їх не
        // викочує. Тому вона названа прямо в тості, разом з командою.
        const reason = stats.unreadableOwnerIds.length
          ? `Не прочитано власників: ${stats.unreadableOwnerIds.join(', ')}. Їхні записи не змінено.`
          : stats.permissionDenied
          ? 'База відмовила (PERMISSION_DENIED): правила ще не викочені — npx firebase deploy --only database'
          // Картку теж називаємо: коли з пачки падає одна, шукати її очима по
          // всій партії — це та сама робота, що вже зроблена тут.
          : stats.failures[0]
          ? `${stats.failures[0].profileId}: ${stats.failures[0].message}`
          : '';
        toast.error(`Перенос завершено з помилками — ${details}.\n${reason}`.trim(), {
          id: toastId,
          duration: stats.permissionDenied ? 20000 : 12000,
        });
      } else if (!stats.total && !stats.alreadyPublic) {
        // «Не знайдено» — це неправда, коли картки знайшлись і відсіялись:
        // 25 нотаток, кожна пропущена через відсутній `writer`, виглядали як
        // порожня база, і розбиратись довелось не звіту, а людині.
        const skippedText = [
          stats.unverified ? `без позначки writer — ${stats.unverified}` : '',
          stats.skipped?.emptyText ? `порожніх — ${stats.skipped.emptyText}` : '',
        ].filter(Boolean).join(', ');
        toast.success(
          `Нічого не перенесено. Карток ${prefix}… з нотатками: ${stats.profileIds.length}`
            + (skippedText ? `; пропущено: ${skippedText}` : ''),
          { id: toastId, duration: 10000 },
        );
      } else toast.success(`Коментарі перенесено — ${details}`, { id: toastId, duration: 8000 });

      console.log('[AddNewProfile] legacy comments migration', stats);
    } catch (error) {
      console.error('[AddNewProfile] legacy comments migration failed', error);
      toast.error(`Помилка переносу коментарів: ${error?.message || 'невідома помилка'}`, {
        id: toastId,
        duration: 10000,
      });
    } finally {
      setMigratingCommentsPrefix('');
    }
  };

  useEffect(() => {
    setBackendDownloadToastsEnabled(downloadSizeToastsEnabled);
  }, [downloadSizeToastsEnabled]);

  const handleDownloadSizeToastsToggle = () => {
    setDownloadSizeToastsEnabled(prev => !prev);
  };
  const handleExtendedModeToggle = () => {
    setExtendedMode(prev => {
      const next = !prev;
      if (typeof localStorage !== 'undefined') localStorage.setItem(PROFILE_FORM_EXTENDED_MODE_KEY, String(next));
      return next;
    });
  };

  const fieldsToRender = getFieldsToRender(state);

  const effectiveCycleStatus = getEffectiveCycleStatus(state);
  const scheduleUserData = state;
  const shouldShowSchedule = ['stimulation', 'pregnant'].includes(effectiveCycleStatus);
  const [isStimulationScheduleVisible, setIsStimulationScheduleVisible] = useState(false);

  useEffect(() => {
    setIsStimulationScheduleVisible(false);
  }, [state?.userId, shouldShowSchedule]);


  // const fieldsToRender = [
  //   ...pickerFields,

  // ];


  const shouldPaginate = searchBarQueryActive
    ? Object.keys(users || {}).length > PAGE_SIZE
    : currentFilter !== 'CYCLE_FAVORITE';
  // Видача зі списку анкет JSON — це групи «анкета з файлу → знайдене», і
  // порядок у них і є зміст: сортувалка картотеки розносила картку з файлу й
  // її знахідки по різних місцях, а ⇄ порівнювала сусідів із чужих груп.
  const isJsonProfileListView = Object.values(users || {}).some(user => user?._jsonGroup !== undefined);
  const getSortedIds = () => {
    const ids = Object.keys(users);
    const currentCardsById = loadCards();
    const getVisibleCard = id => currentCardsById[id] || users[id] || {};
    if (isDuplicateView || isSearchersView || isJsonProfileListView || currentFilter === 'CYCLE_FAVORITE') {
      return ids;
    }

    // «Список» показує картки рівно в тому порядку, в якому їх прийняв
    // двигун: сторінка на екрані — це сторінка з бази, за яким полем її не
    // впорядкуй. Доти показ пересортовував завантажене за `getInTouch`, і в
    // GIT, що вантажив від найдавніших дат, кожна дописана сторінка лягала
    // *над* показаною, а стрічка й обрані втрачали власний порядок.
    // Картка поза порядком (щойно відкрита з пошуку) стає в кінець.
    if (currentFilter === CARD_LIST_FILTER) {
      const position = new Map(cardListOrderRef.current.map((id, index) => [id, index]));
      const rank = id => (position.has(id) ? position.get(id) : Number.MAX_SAFE_INTEGER);
      return ids.sort((a, b) => rank(a) - rank(b));
    }

    return ids.sort((a, b) => compareUsersByGetInTouch(getVisibleCard(a), getVisibleCard(b)));
  };

  const sortedIds = getSortedIds();
  const {
    cardsById: renderCardsById,
    queryIds: sortedQueryIds,
    visibleCards: sortedCardsFromCache,
  } = getCardsByIds(sortedIds);
  const sortedCachedCardsById = sortedCardsFromCache.reduce((acc, card) => {
    if (card?.userId) acc[card.userId] = card;
    return acc;
  }, {});
  const getRenderCardById = id => {
    const cachedCard = sortedCachedCardsById[id];
    const currentUser = users[id];
    const mergedCard = currentUser
      ? {
        ...(cachedCard || {}),
        ...currentUser,
        userId: currentUser.userId || cachedCard?.userId || id,
      }
      : cachedCard;

    return mergedCard?.userId ? mergedCard : null;
  };
  const filterRenderCards = cards => {
    // Перелік читачів — це відповідь на питання «хто що шукав», а не зріз
    // стрічки: фільтри картотеки його не звужують.
    if (isDuplicateView || isSearchersView || isJsonProfileListView) return cards;
    if (searchBarQueryActive && !useSearchResultFilters) return cards;

    // Стани позначки (кому дзвонити, заплановані…) тримає план двигуна, а не
    // показ: тут лише фільтри панелі, щоб звуження було видно одразу, ще до
    // відповіді бази.
    return filterMain(
      cards.map(card => [card.userId, card]),
      currentFilter,
      filters,
      favoriteUsersData,
      dislikeUsersData,
    ).map(([, card]) => card);
  };
  const renderSourceCards = sortedIds
    .map(getRenderCardById)
    .filter(Boolean);
  const searchBarContactsForExport = searchBarQueryActive ? renderSourceCards : [];
  const searchBarContactsExportCount = searchBarContactsForExport.length;
  const renderVisibleCards = filterRenderCards(renderSourceCards);

  const saveSearchBarContacts = () => {
    if (searchBarContactsExportCount === 0) {
      toast.error('Немає знайдених SearchBar карток для експорту');
      return;
    }

    const contactsById = searchBarContactsForExport.reduce((acc, card, index) => {
      const userId = card?.userId || card?.id || `search-result-${index}`;
      acc[userId] = { ...card, userId };
      return acc;
    }, {});

    saveContactsBySelectedFormat(contactsById);
  };
  const renderVisibleIds = renderVisibleCards.map(card => card.userId);
  const loadedPages = Math.ceil(renderVisibleIds.length / PAGE_SIZE) || 1;
  const totalPages = shouldPaginate ? Math.max(loadedPages, hasMore ? currentPage + 1 : currentPage) : 1;
  const displayedUserIds = shouldPaginate
    ? renderVisibleIds.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : renderVisibleIds;
  const { visibleCards: paginatedVisibleCards } = getCardsByIds(displayedUserIds);
  const cachedPaginatedUsers = paginatedVisibleCards.reduce((acc, card) => {
    acc[card.userId] = card;
    return acc;
  }, {});
  const displayedUserIdsKey = displayedUserIds.join('|');
  const paginatedUsers = displayedUserIds.reduce((acc, id) => {
    const cachedCard = cachedPaginatedUsers[id];
    const currentUser = users[id];
    const fallbackCard = renderVisibleCards.find(card => card.userId === id);
    const mergedCard = currentUser
      ? {
        ...(fallbackCard || cachedCard || {}),
        ...currentUser,
        userId: currentUser.userId || fallbackCard?.userId || cachedCard?.userId || id,
      }
      : fallbackCard || cachedCard;

    if (mergedCard) acc[id] = mergedCard;
    return acc;
  }, {});
  const paginatedUsersWithPhotos = displayedUserIds.reduce((acc, id) => {
    const user = paginatedUsers[id];
    if (!user) return acc;

    const cachedPhotos = listPhotoCacheByUserId[id];
    acc[id] = cachedPhotos
      ? {
        ...user,
        photos: cachedPhotos,
        __photosHydrated: true,
      }
      : user;
    return acc;
  }, {});

  // Фото картки списку питаються **раз** на картку. Ефект залежить від
  // `paginatedUsers` — нового обʼєкта на кожен рендер, — і кожне оновлення
  // списку (а «Список» приходить порціями) запускав ті самі лістинги
  // Storage й читання `profileDetails/{id}/photos` заново: прапорець
  // `cancelled` лише ігнорував відповідь, а не скасовував запит. На двадцяти
  // показаних картках це було по шість читань фото на кожну.
  const listPhotoRequestedRef = useRef(new Set());
  useEffect(() => {
    const visibleIds = displayedUserIdsKey.split('|').filter(Boolean);
    const idsToLoad = visibleIds.filter(id => {
      const user = paginatedUsers[id];
      if (!user?.userId) return false;
      if (hasProfilePhotos(user)) return false;
      if (user.__photosHydrated === true) return false;
      if (listPhotoRequestedRef.current.has(id)) return false;
      return !listPhotoCacheByUserId[id];
    });

    if (idsToLoad.length === 0) return;
    idsToLoad.forEach(id => listPhotoRequestedRef.current.add(id));

    Promise.all(
      idsToLoad.map(async id => {
        const photos = await lazyLoadProfilePhotos(id);
        return [id, Array.isArray(photos) ? photos : []];
      }),
    )
      .then(entries => {
        if (!isMountedRef.current) return;
        setListPhotoCacheByUserId(prev => {
          const next = { ...prev };
          entries.forEach(([id, photos]) => {
            next[id] = photos;
          });
          return next;
        });
      })
      .catch(error => {
        // Невдале читання можна повторити: картка знову стане кандидатом.
        idsToLoad.forEach(id => listPhotoRequestedRef.current.delete(id));
        console.error('[RENDER] failed to lazy load list photos', {
          ids: idsToLoad,
          message: error?.message || String(error),
        });
      });
  }, [displayedUserIdsKey, listPhotoCacheByUserId, paginatedUsers]);

  useEffect(() => {
    const idsToHydrate = displayedUserIdsKey.split('|').filter(id => {
      if (!id) return false;
      if (getCard(id)) return false;
      return !renderCacheHydrationIdsRef.current.has(id);
    });

    if (idsToHydrate.length === 0) return undefined;

    let cancelled = false;
    idsToHydrate.forEach(id => renderCacheHydrationIdsRef.current.add(id));

    Promise.all(
      idsToHydrate.map(async id => {
        const fresh = await fetchUserById(id);
        if (!fresh) return null;

        const hydratedCard = updateCachedUser({ ...fresh, userId: id }) || { ...fresh, userId: id };
        return [id, hydratedCard];
      }),
    )
      .then(entries => {
        if (cancelled) return;

        const hydratedUsers = entries.reduce((acc, entry) => {
          if (!entry) return acc;
          const [id, card] = entry;
          if (card?.userId) acc[id] = card;
          return acc;
        }, {});

        if (Object.keys(hydratedUsers).length > 0) {
          setUsers(prev => ({ ...prev, ...hydratedUsers }));
        }
      })
      .catch(error => {
        console.error('[RENDER] failed to hydrate missing cache cards', {
          ids: idsToHydrate,
          message: error?.message || String(error),
        });
      })
      .finally(() => {
        idsToHydrate.forEach(id => renderCacheHydrationIdsRef.current.delete(id));
      });

    return () => {
      cancelled = true;
    };
  }, [displayedUserIdsKey]);

  console.log('[CACHE] cards source:', renderCardsById);
  console.log('[QUERIES] ids:', sortedQueryIds);
  console.log('[RENDER] visible cards:', Object.values(paginatedUsersWithPhotos).map(c => ({
    userId: c.userId,
    getInTouch: c.getInTouch,
    lastAction: c.lastAction,
    cachedAt: c.cachedAt,
    fromRenderFallback: !cachedPaginatedUsers[c.userId],
  })));

  /**
   * Відкрити добірку — тобто список, зібраний не фільтрами панелі, а самим
   * питанням: обрані, цикл, черга доповнень, стрічка.
   *
   * Кнопки цих добірок раніше ставили `currentFilter` кожна по-своєму й забували
   * то курсор, то перегляд дублікатів — і друга добірка поспіль показувала хвіст
   * першої. Скидання тут одне на всіх.
   */
  const describeAdminConsoleState = () => 'дублікати, імпорт і експорт, кеш, обслуговування бази';

  // «Список» — це добірка за замовчуванням: усе, що не окрема добірка, гортає
  // список за обраним запитом. Чіп підсвічує готовий запит, якому відповідає
  // відкритий список; свій запит (зібраний у «Сортуванні») стоїть окремим чіпом.
  const isCardListActive =
    !CARD_COLLECTION_LABELS[currentFilter] && !isSearchersView && !isDuplicateView;
  const activeCardListPreset = findCardListPreset(cardListQuery);

  const selectedIndexCount =
    Object.values(selectedIndexJobs || {}).filter(Boolean).length
    + Object.values(selectedSearchKeyIndexes || {}).filter(Boolean).length;

  const openCardCollection = nextFilter => {
    searchListIsolationRef.current = false;
    setSearch('');
    setSearchBarQueryActive(false);
    setLastSearchBarQuery('');
    setUserNotFound(false);
    setUsers({});
    setHasMore(true);
    setCurrentPage(1);
    setDuplicates('');
    setIsDuplicateView(false);
    setCurrentFilter(nextFilter);
  };

  /*
   * Відкрити «Список» за запитом — готовим (чіп), зібраним у «Сортуванні» чи
   * тим самим, що вже відкритий.
   *
   * Той самий запит на відкритому списку — це «оновити»: перелік і анкети
   * читаються з бази заново, повз обидва кеші, а показаний список стоїть на
   * екрані, доки нова перша сторінка його не замінить. Інший запит — це інший
   * список: показане зникає одразу, а перелік, зібраний тим самим запитом і
   * фільтрами за останні шість годин, піднімається з кешу без жодного запиту.
   */
  const openCardList = (nextQuery = cardListQueryRef.current, { refresh = false } = {}) => {
    const normalized = normalizeCardListQuery(nextQuery);
    const isRefresh = refresh || (
      currentFilter === CARD_LIST_FILTER
      && !searchListIsolationRef.current
      && buildCardListQueryKey(normalized) === buildCardListQueryKey(cardListQueryRef.current)
    );

    searchListIsolationRef.current = false;
    setSearch('');
    if (location.search) {
      const params = new URLSearchParams(location.search);
      params.delete('search');
      const nextSearch = params.toString();
      navigate(
        { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
        { replace: true },
      );
    }
    setSearchBarQueryActive(false);
    setLastSearchBarQuery('');
    setUserNotFound(false);
    if (!isRefresh) {
      setUsers({});
      cardListOrderRef.current = [];
    }
    setHasMore(true);
    setCurrentPage(1);
    setDuplicates('');
    setIsDuplicateView(false);

    cardListQueryRef.current = normalized;
    setCardListQuery(normalized);
    try {
      localStorage.setItem(CARD_LIST_QUERY_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      // Памʼять браузера закрита — запит діятиме до перезавантаження.
    }
    forceCardListRefreshRef.current = isRefresh;
    cardListRef.current = { key: '', state: null, pending: null };

    appendLoadDebugLog('card-list:open', {
      query: describeCardListQuery(normalized),
      refresh: isRefresh,
      search,
      filters: summarizeLoadFiltersForLog(filters),
      previousUsersCount: countObjectKeys(users),
    });
    setCurrentFilter(CARD_LIST_FILTER);
    setLoadRequestId(prev => prev + 1);
  };

  // Зміна в «Сортуванні» збирає список заново сама: окремої кнопки
  // «застосувати» немає. Дотик до вже обраного варіанта нічого не міняє — це
  // не «оновити», для того є окрема кнопка.
  const handleCardListQueryChange = nextQuery => {
    const normalized = normalizeCardListQuery(nextQuery);
    if (
      currentFilter === CARD_LIST_FILTER
      && buildCardListQueryKey(normalized) === buildCardListQueryKey(cardListQueryRef.current)
    ) return;
    openCardList(normalized);
  };

  const handleBackToPreviousList = useCallback(() => {
    logProfileRestoreStep('previous-list:restore-start', {
      activeUserId: state?.userId || '',
      hasMemorySnapshot: Boolean(previousListStateRef.current),
      hasPersistedSnapshot: Boolean(localStorage.getItem(PREVIOUS_LIST_STATE_KEY)),
      locationSearch: location.search,
    });

    if (location.search.includes('userId=')) {
      navigate({ pathname: location.pathname, search: '' }, { replace: true });
    }

    const persistedRaw = localStorage.getItem(PREVIOUS_LIST_STATE_KEY);
    const persisted =
      !previousListStateRef.current && persistedRaw
        ? (() => {
            try {
              return JSON.parse(persistedRaw);
            } catch (error) {
              console.warn('[AddNewProfile] Failed to parse previous list snapshot', error);
              return null;
            }
          })()
        : null;
    const snapshot = previousListStateRef.current || persisted;

    if (!snapshot) {
      logProfileRestoreStep('previous-list:restore-no-snapshot-clear-state', {
        activeUserId: state?.userId || '',
      });
      setState({});
      return;
    }

    const missingCachedUserIds = [];
    const restoredUsers = (snapshot.userIds || []).reduce((acc, userId) => {
      if (!userId) return acc;
      const cachedUser = getCard(userId);
      if (cachedUser) {
        acc[userId] = cachedUser;
      } else {
        missingCachedUserIds.push(userId);
      }
      return acc;
    }, {});

    logProfileRestoreStep('previous-list:restore-users-from-cache', {
      snapshotUserIdsCount: (snapshot.userIds || []).length,
      restoredUsersCount: Object.keys(restoredUsers).length,
      missingCachedUserIds,
      currentFilter: snapshot.currentFilter || '',
      currentPage: snapshot.currentPage || 1,
      cardListQuery: snapshot.cardListQuery ? describeCardListQuery(snapshot.cardListQuery) : snapshot.loadSortMode || '',
      hasSearched: Boolean(snapshot.hasSearched),
    });

    if (Object.keys(restoredUsers).length) {
      setUsers(restoredUsers);
      setHasSearched(true);
      setUserNotFound(false);
    }

    // Знімки, збережені до двигуна, несуть режим (`loadSortMode`) і добірку
    // режиму (`DATE2`, `GITnew`, `FEED_DATE`, `FAVORITE`…): обидва
    // переводяться в «Список» з відповідним запитом, інакше «назад до списку»
    // відкрив би порожнечу.
    const isLegacyListSnapshot = LEGACY_LIST_FILTERS.has(snapshot.currentFilter || '');
    const restoredCurrentFilter = isLegacyListSnapshot ? CARD_LIST_FILTER : snapshot.currentFilter || '';
    const restoredQuery = snapshot.cardListQuery
      ? normalizeCardListQuery(snapshot.cardListQuery)
      : queryFromLegacyListState({ loadSortMode: snapshot.loadSortMode, currentFilter: snapshot.currentFilter });

    setCurrentFilter(restoredCurrentFilter);
    setCurrentPage(snapshot.currentPage || 1);
    setHasMore(typeof snapshot.hasMore === 'boolean' ? snapshot.hasMore : true);
    if (restoredCurrentFilter === CARD_LIST_FILTER) {
      const listQuery = restoredQuery || cardListQueryRef.current;
      const restoredState = restoreCardListState(snapshot.cardListState, listQuery);
      if (restoredState && snapshot.cardListKey) {
        // Сеанс двигуна вертається разом зі списком: наступна сторінка
        // продовжує гортати базу з того самого курсора.
        cardListRef.current = { key: snapshot.cardListKey, state: restoredState, pending: null };
        cardListOrderRef.current = restoredState.order;
      } else {
        cardListOrderRef.current = (snapshot.userIds || []).filter(Boolean);
      }
      if (restoredQuery && buildCardListQueryKey(restoredQuery) !== buildCardListQueryKey(cardListQueryRef.current)) {
        cardListQueryRef.current = restoredQuery;
        setCardListQuery(restoredQuery);
      }
    }
    setSearch(snapshot.search || '');
    setHasSearched(Boolean(snapshot.hasSearched) || Object.keys(restoredUsers).length > 0);
    logProfileRestoreStep('previous-list:restore-complete-clear-profile-state', {
      activeUserId: state?.userId || '',
      restoredUsersCount: Object.keys(restoredUsers).length,
    });
    setState({});
  }, [location.pathname, location.search, navigate, setSearch, setState, state?.userId]);

  useEffect(() => {
    if (!state?.userId) {
      editHistoryRef.current = {
        userId: null,
        current: null,
        undoStack: [],
        redoStack: [],
      };
      setHistoryVersion(prev => prev + 1);
      return;
    }

    const history = editHistoryRef.current;

    if (history.userId !== state.userId) {
      editHistoryRef.current = {
        userId: state.userId,
        current: cloneProfileState(state),
        undoStack: [],
        redoStack: [],
      };
      setHistoryVersion(prev => prev + 1);
      return;
    }

    if (!history.current) {
      history.current = cloneProfileState(state);
      setHistoryVersion(prev => prev + 1);
    }
  }, [cloneProfileState, state]);

  const handleTopBlockSubmitHistorySnapshot = useCallback(
    submittedState => {
      if (!submittedState || typeof submittedState !== 'object') return;
      registerHistorySnapshot(submittedState);
    },
    [registerHistorySnapshot],
  );

  const handleUndoProfileChanges = async () => {
    if (!state?.userId) return;
    const history = editHistoryRef.current;
    if (!history.undoStack.length) return;

    const previous = history.undoStack.pop();
    history.redoStack.push(cloneProfileState(history.current));
    history.current = cloneProfileState(previous);
    historyNavigationRef.current = true;
    setState(previous);
    setUsers(prev => ({ ...prev, [previous.userId]: previous }));
    setHistoryVersion(prev => prev + 1);
    await handleSubmit(previous);
  };

  const handleRedoProfileChanges = async () => {
    if (!state?.userId) return;
    const history = editHistoryRef.current;
    if (!history.redoStack.length) return;

    const next = history.redoStack.pop();
    history.undoStack.push(cloneProfileState(history.current));
    history.current = cloneProfileState(next);
    historyNavigationRef.current = true;
    setState(next);
    setUsers(prev => ({ ...prev, [next.userId]: next }));
    setHistoryVersion(prev => prev + 1);
    await handleSubmit(next);
  };

  const canUndoChanges = Boolean(state?.userId) && editHistoryRef.current.undoStack.length > 0;
  const canRedoChanges = Boolean(state?.userId) && editHistoryRef.current.redoStack.length > 0;
  return (
    <Container>
      <InnerContainer>
        {isLoggedIn && (
          <TopButtons>
            <TopButtonsGroup>
            {state.userId && (
              <>
                <EditActionButton
                  type="button"
                  onClick={handleUndoProfileChanges}
                  title="Відмінити останню зміну"
                  aria-label="Відмінити останню зміну"
                  disabled={!canUndoChanges}
                >
                  <EditActionIcon viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M9 7L5 11L9 15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6 11H14C17.314 11 20 13.686 20 17"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </EditActionIcon>
                </EditActionButton>
                <EditActionButton
                  type="button"
                  onClick={handleRedoProfileChanges}
                  title="Відмінити відміну"
                  aria-label="Повернути зміну"
                  disabled={!canRedoChanges}
                >
                  <EditActionIcon viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M15 7L19 11L15 15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M18 11H10C6.686 11 4 13.686 4 17"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </EditActionIcon>
                </EditActionButton>
              </>
            )}
            <DownloadSizeToastToggleButton
              type="button"
              $active={extendedMode}
              aria-pressed={extendedMode}
              title={extendedMode ? 'Сховати стрілки переходу до backend на полях' : 'Показати стрілки переходу до backend на полях'}
              aria-label={extendedMode ? 'Сховати стрілки переходу до backend на полях' : 'Показати стрілки переходу до backend на полях'}
              onClick={handleExtendedModeToggle}
            >
              🧭
              <DownloadSizeToastStatus>{extendedMode ? 'EXT' : 'STD'}</DownloadSizeToastStatus>
            </DownloadSizeToastToggleButton>
            <DownloadSizeToastToggleButton
              type="button"
              $active={downloadSizeToastsEnabled}
              aria-pressed={downloadSizeToastsEnabled}
              title={
                downloadSizeToastsEnabled
                  ? 'Вимкнути тости щодо розміру завантаження файлів'
                  : 'Увімкнути тости щодо розміру завантаження файлів'
              }
              aria-label={
                downloadSizeToastsEnabled
                  ? 'Вимкнути тости щодо розміру завантаження файлів'
                  : 'Увімкнути тости щодо розміру завантаження файлів'
              }
              onClick={handleDownloadSizeToastsToggle}
            >
              📦
              <DownloadSizeToastStatus>{downloadSizeToastsEnabled ? 'ON' : 'OFF'}</DownloadSizeToastStatus>
            </DownloadSizeToastToggleButton>
            </TopButtonsGroup>
            <KmIconButton
              type="button"
              aria-label="Відкрити меню профілю"
              onClick={() => {
                setShowInfoModal('dotsMenu');
              }}
            >
              ⋮
            </KmIconButton>
          </TopButtons>
        )}

        <SearchBarRow>
          <SearchBar
            key={`add-search-${searchBarResetVersion}`}
            searchFunc={searchUsersCollectionInRTDB}
            allowJsonProfileList
            search={search}
            setSearch={value => {
              setSearch(value);
            }}
            setUsers={setUsers}
            setState={setState}
            setUserNotFound={setUserNotFound}
            onSearchKey={setSearchKeyValuePair}
            onSearchExecuted={handleSearchExecuted}
            onSearchCommitted={handleSearchCommitted}
            onClear={() => {
              // Не чистимо localStorage тут: SearchBar сам синхронізує query key,
              // а налаштування варіантів пошуку (addSearchOptions) мають зберігатися.
              if (location.search) {
                navigate({ pathname: location.pathname, search: '' }, { replace: true });
              }
              setState({});
              setSearchKeyValuePair(null);
              // У режимі перегляду дублікатів зберігаємо поточний список
              if (!isDuplicateView) {
                setUsers({});
              }
              setUserNotFound(false);
              setSearchBarQueryActive(false);
              setLastSearchBarQuery('');
            }}
            storageKey={SEARCH_KEY}
            filters={filters}
            filterForload={currentFilter}
            favoriteUsers={favoriteUsersData}
            dislikeUsers={dislikeUsersData}
            enabledSearchKeys={enabledSearchKeys}
            searchOptions={{
              searchIdPrefixes: selectedSearchIdPrefixes,
              equalToKeys: selectedEqualToKeys,
              searchKeyFields: selectedSearchKeyFields,
              autoOtherFallback: shouldAutoRunOtherFallback,
              enabledSearchKeys,
            }}
            searchHistoryLimit={15}
            suppressInitialSearchExecution={Boolean(
              state.userId &&
                search &&
                String(search).trim() === String(state.userId).trim(),
            )}
          />
          <SearchSettingsButton
            type="button"
            aria-label="Налаштування пошуку"
            title="Показати/сховати варіанти пошуку"
            $active={showSearchOptions}
            onClick={() => setShowSearchOptions(prev => !prev)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.22.52.73.86 1.3.99H21a2 2 0 1 1 0 4h-.3c-.57.13-1.08.47-1.3 1.01z" />
            </svg>
          </SearchSettingsButton>
        </SearchBarRow>

        {showSearchOptions && (
          <SearchScopeContainer>
            <SearchScopeBlock>
              <SearchScopeBlockHeader>
                <SearchScopeBlockTitle>Як глибоко шукати</SearchScopeBlockTitle>
              </SearchScopeBlockHeader>
              <DepthTrack role="radiogroup" aria-label="Глибина пошуку">
                {SEARCH_DEPTH_MODES.map(mode => (
                  <DepthSegment
                    key={mode.key}
                    type="button"
                    role="radio"
                    aria-checked={searchDepth === mode.key}
                    $active={searchDepth === mode.key}
                    $danger={mode.danger}
                    onClick={() => handleSearchDepthChange(mode.key)}
                  >
                    {mode.label}
                  </DepthSegment>
                ))}
              </DepthTrack>
              <DepthHint $danger={activeSearchDepthMode.danger}>{activeSearchDepthMode.hint}</DepthHint>
              <SearchFiltersToggle>
                <input
                  type="checkbox"
                  checked={useSearchResultFilters}
                  onChange={() => setUseSearchResultFilters(prev => !prev)}
                />
                <span>
                  Звужувати видачу фільтрами списку
                  <DepthHint as="span">
                    {useSearchResultFilters
                      ? 'Знайдене, що не проходить фільтри, не показується.'
                      : 'Показується все знайдене, фільтри ігноруються.'}
                  </DepthHint>
                </span>
              </SearchFiltersToggle>
            </SearchScopeBlock>
          </SearchScopeContainer>
        )}
        {isResolvingEditMode ? null : state.userId ? (
          <>
            <div style={{ ...coloredCard(), marginBottom: '8px' }}>
              <TopBlock
                userData={state}
                setUsers={setUsers}
                setShowInfoModal={setShowInfoModal}
                setState={setState}
                setUserIdToDelete={setUserIdToDelete}
                isFromListOfUsers={false}
                extendedMode={extendedMode}
                favoriteUsers={favoriteUsersData}
                setFavoriteUsers={setFavoriteUsersData}
                dislikeUsers={dislikeUsersData}
                setDislikeUsers={setDislikeUsersData}
                currentFilter={currentFilter}
                isDateInRange={isDateInRange}
                onOpenMedications={openMedicationsModal}
                topBlueAction={{
                  onClick: handleBackToPreviousList,
                  title: 'Назад до попереднього списку',
                  ariaLabel: 'Назад до попереднього списку',
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M11 7L6 12L11 17"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6 12H18"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ),
                }}
                overlayFieldAdditions={{}}
                onSubmitHistorySnapshot={handleTopBlockSubmitHistorySnapshot}
                stimulationScheduleToggle={shouldShowSchedule
                  ? {
                      visible: isStimulationScheduleVisible,
                      onToggle: () => setIsStimulationScheduleVisible(prev => !prev),
                    }
                  : null}
              />
            </div>
            {shouldShowSchedule && isStimulationScheduleVisible && state && (
              <div style={{ ...coloredCard(), marginBottom: '8px' }}>
              <StimulationSchedule
                userData={scheduleUserData}
                setUsers={setUsers}
                setState={setState}
                onPersistProfileUpdate={isDraftProfileRecord(scheduleUserData)
                  ? (updates, removedKeys = []) => {
                      const next = { ...scheduleUserData, ...updates };
                      removedKeys.forEach(key => delete next[key]);
                      return handleSubmit(next, 'overwrite', removedKeys);
                    }
                  : undefined}
                onLastCyclePersisted={({ lastCycle, lastDelivery, needsSync }) => {
                    if (!needsSync) return;
                    const targetUserId = scheduleUserData?.userId;
                    if (!targetUserId) return;
                    const updates = {};
                    if (lastCycle) updates.lastCycle = lastCycle;
                    if (lastDelivery) updates.lastDelivery = lastDelivery;
                    if (!Object.keys(updates).length) return;
                    if (typeof setState === 'function') {
                      setState(prev => {
                        if (!prev || prev.userId !== targetUserId) return prev;
                        return { ...prev, ...updates };
                      });
                    }
                    if (typeof setUsers === 'function') {
                      setUsers(prev => {
                        if (!prev) return prev;
                        if (Array.isArray(prev)) {
                          return prev.map(item =>
                            item?.userId === targetUserId ? { ...item, ...updates } : item,
                          );
                        }
                        if (typeof prev === 'object') {
                          const current = prev[targetUserId];
                          if (!current) return prev;
                          return {
                            ...prev,
                            [targetUserId]: {
                              ...current,
                              ...updates,
                            },
                          };
                        }
                        return prev;
                      });
                    }
                  }}
                />
              </div>
            )}

            <ProfileForm
              state={state}
              setState={setState}
              handleBlur={handleBlur}
              handleSubmit={handleSubmit}
              handleClear={handleClear}
              handleDelKeyValue={handleDelKeyValue}
              dataSource={profileSource}
              isAdmin={isAdmin}
              extendedMode={extendedMode}
            />
          </>
        ) : (
          <div>
            {/*
              Черга доповнень рахує себе сама й показує свій лічильник: «Знайдено
              0 карток» над нею означало б, що доповнень немає, тоді як список
              анкет тут просто не наповнюється.
            */}
            {(searchLoading || hasSearched) && !userNotFound && currentFilter !== OVERLAY_REVIEW_FILTER && (
              <p style={{ textAlign: 'center', color: 'var(--km-text)' }}>
                Знайдено{' '}
                {searchLoading ? (
                  <span className="spinner" />
                ) : (
                  renderVisibleIds.length
                )}{' '}
                карток.
              </p>
            )}
            {userNotFound && (
              <EmptySearchResult>
                {hasSearched && <span>Нічого не знайдено.</span>}
                <ToolButton
                  type="button"
                  $tone="primary"
                  onClick={handleAddUser}
                  disabled={adding}
                  title="Завести картку з набраного в пошуку"
                >
                  {adding ? <span className="spinner" /> : '+ Створити картку'}
                </ToolButton>
              </EmptySearchResult>
            )}
            {/*
              Що показати — щоденна робота адміна, тож добірки стоять на виду, а
              не в панелі, яку треба розгортати. Поруч — лише сортування й фільтри
              самого списку; рідкісне й небезпечне пішло в «Інструменти» нижче.
            */}
            <ListPanel>
              <CollectionRow role="group" aria-label="Що показати">
                {/* Готові запити «Списку» — один двигун, різні поля
                    (`utils/cardListQuery`). Повторний дотик до відкритого — «оновити». */}
                {CARD_LIST_PRIMARY_PRESETS.map(preset => {
                  const active = isCardListActive && currentFilter === CARD_LIST_FILTER
                    && activeCardListPreset?.key === preset.key;
                  return (
                    <CollectionChip
                      key={preset.key}
                      type="button"
                      $active={active}
                      aria-pressed={active}
                      onClick={() => openCardList(preset.query)}
                      title={active ? 'Відкрито · ще дотик — оновити з бази' : describeCardListQuery(preset.query)}
                    >
                      {preset.label}
                    </CollectionChip>
                  );
                })}
                {currentFilter === CARD_LIST_FILTER && isCardListActive && !activeCardListPreset?.primary && (
                  <CollectionChip
                    type="button"
                    $active
                    aria-pressed
                    onClick={() => openCardList(cardListQuery)}
                    title="Свій запит із «Сортування» · ще дотик — оновити з бази"
                  >
                    {describeCardListQuery(cardListQuery)}
                  </CollectionChip>
                )}
                <CollectionChip
                  type="button"
                  $active={currentFilter === 'CYCLE_FAVORITE'}
                  aria-pressed={currentFilter === 'CYCLE_FAVORITE'}
                  onClick={() => openCardCollection('CYCLE_FAVORITE')}
                  aria-label="Cycle favorites"
                  title="Анкети в стимуляції та вагітності"
                >
                  Цикл
                </CollectionChip>
                {isAdmin && (
                  <CollectionChip
                    type="button"
                    $active={currentFilter === OVERLAY_REVIEW_FILTER}
                    aria-pressed={currentFilter === OVERLAY_REVIEW_FILTER}
                    onClick={() => openCardCollection(OVERLAY_REVIEW_FILTER)}
                    title="Усі картки, у які читачі дописали дані й це ще ніхто не розсудив"
                    {...createLongPressHandlers(
                      'Черга доповнень: кожне дописане значення окремо, з кнопками «прийняти» і «видалити»',
                    )}
                  >
                    Доповнення
                  </CollectionChip>
                )}
                {isAdmin && (
                  <CollectionChip
                    type="button"
                    $active={isSearchersView}
                    aria-pressed={isSearchersView}
                    onClick={handleShowSearchers}
                    disabled={isLoadingSearchers}
                    title="Показати картки тих, хто шукав, разом з їхніми запитами"
                    {...createLongPressHandlers(
                      'Читає multiData/searchQueries і малює картки читачів; під карткою — їхні запити, '
                        + 'натискання повторює той самий пошук',
                    )}
                  >
                    {isLoadingSearchers ? '...' : 'Хто шукав'}
                  </CollectionChip>
                )}
              </CollectionRow>
              <ToolRow>
                <ToolButton
                  type="button"
                  $active={isLoadOptionsOpen}
                  onClick={() => setIsLoadOptionsOpen(prev => !prev)}
                  aria-expanded={isLoadOptionsOpen}
                  title="За яким полем, у якому порядку й за який період збирається «Список»"
                >
                  Сортування: {describeCardListQuery(cardListQuery)} ▾
                </ToolButton>
                <ToolButton
                  type="button"
                  $active={isListFiltersOpen}
                  onClick={() => setIsListFiltersOpen(prev => !prev)}
                  aria-expanded={isListFiltersOpen}
                  title="Фільтри списку: група крові, вік, роль, реакції…"
                >
                  Фільтри ▾
                </ToolButton>
                {currentFilter === CARD_LIST_FILTER && isCardListActive && (
                  <ToolButton
                    type="button"
                    onClick={() => openCardList(cardListQuery, { refresh: true })}
                    title="Перечитати перелік і анкети з бази, повз кеш"
                  >
                    ↻ Оновити
                  </ToolButton>
                )}
              </ToolRow>
              {isLoadOptionsOpen && (
                <ToolDrawer>
                  <CardListQueryControls
                    query={cardListQuery}
                    onChange={handleCardListQueryChange}
                    statsText={cardListStatsText}
                  />
                </ToolDrawer>
              )}
              {isListFiltersOpen && (
                <ToolDrawer>
                  {/* Фільтри одні на будь-який запит: окремі сховища під LA й LA2
                      і урізаний перелік груп під «індексні» режими пішли разом
                      із режимами. Варіанти «no» (порожньо) лишились — їх знає і
                      `filterMain`, і індекс. */}
                  <FilterPanel
                    onChange={handleFilterChange}
                    storageKey="addFilters"
                    bloodSearchKeyMode
                    reactionFilterOptions={REACTION_FILTER_OPTIONS}
                  />
                </ToolDrawer>
              )}
              {stimulationScheduleProfiles.length > 0 && (
                <StimulationRow>
                  <StimulationLabel>У стимуляції:</StimulationLabel>
                  {stimulationScheduleProfiles.map(user => (
                    <ToolButton
                      key={`schedule-${user.userId}`}
                      type="button"
                      onClick={() => handleOpenProfileById(user)}
                      title={user?.surname || ''}
                    >
                      {getSurnameLabel(user)}
                    </ToolButton>
                  ))}
                </StimulationRow>
              )}
            </ListPanel>
            <ConsolePanel>
              <ConsoleHeader
                type="button"
                $open={isAdminConsoleOpen}
                aria-expanded={isAdminConsoleOpen}
                onClick={() => setIsAdminConsoleOpen(prev => !prev)}
              >
                <ConsoleTitle>Інструменти</ConsoleTitle>
                <ConsoleHint>{describeAdminConsoleState()}</ConsoleHint>
                <ConsoleChevron $open={isAdminConsoleOpen} aria-hidden="true">▼</ConsoleChevron>
              </ConsoleHeader>
              {isAdminConsoleOpen && (
                <ConsoleBody>
                  <ToolGroup>
                    <ToolGroupTitle>
                      Дублікати
                      <ToolGroupNote>пошук і злиття у завантаженому списку</ToolGroupNote>
                    </ToolGroupTitle>
                    <ToolRow>
                      <ToolButton
                        type="button"
                        $active={isDuplicateView}
                        onClick={searchDuplicates}
                        {...createLongPressHandlers('Шукає дублікати карток')}
                      >
                        Знайти дублікати
                      </ToolButton>
                      <ToolButton
                        type="button"
                        onClick={() => {
                          btnMerge(users, setUsers, setDuplicates);
                        }}
                        {...createLongPressHandlers('Об’єднує знайдені дублікати в локальному списку')}
                      >
                        Об’єднати
                      </ToolButton>
                    </ToolRow>
                  </ToolGroup>
                  <ToolGroup>
                    <ToolGroupTitle>
                      Дані
                      <ToolGroupNote>імпорт і експорт</ToolGroupNote>
                    </ToolGroupTitle>
                    <ToolRow>
                      <ToolButton
                        type="button"
                        onClick={() => setShowSaveModal(true)}
                        {...createLongPressHandlers('Відкриває меню з варіантами збереження контактів')}
                      >
                        Зберегти контакти
                      </ToolButton>
                      <ToolButton
                        type="button"
                        onClick={() => excelImportInputRef.current?.click()}
                        disabled={isExcelImporting}
                        title="Імпорт Excel в 3 JSON"
                        {...createLongPressHandlers('Імпортує Excel і конвертує в JSON формати')}
                      >
                        {isExcelImporting ? '...' : 'Імпорт XLSX'}
                      </ToolButton>
                    </ToolRow>
                  </ToolGroup>
                  <ToolGroup>
                    <ToolGroupTitle>
                      Сервіс
                      <ToolGroupNote>кеш браузера, без бекенду</ToolGroupNote>
                    </ToolGroupTitle>
                    <ToolRow>
                      <ToolButton
                        type="button"
                        onClick={handleInfo}
                        {...createLongPressHandlers('Показує кількість завантажених карток')}
                      >
                        Інфо
                      </ToolButton>
                      <ToolButton
                        type="button"
                        onClick={handleClearCache}
                        {...createLongPressHandlers('Очищає локальний кеш карток')}
                      >
                        Очистити кеш
                      </ToolButton>
                      <ToolButton
                        type="button"
                        onClick={downloadLoadDebugLogs}
                        title="Зберегти load debug log у файл"
                      >
                        Лог завантаження
                      </ToolButton>
                    </ToolRow>
                  </ToolGroup>
                  {/* Панель індексації була видна лише в режимах GITnew і «NoGIT +
                      індекс» — випадкова звʼязка: індекси не залежать від того,
                      як гортається «Список». Тепер вона є завжди, як і була в
                      режимі за замовчуванням. */}
                  <ToolGroup>
                    <ToolGroupTitle $danger>
                      Обслуговування бази
                      <ToolGroupNote>перебудова індексів і разові міграції — пишуть у базу цілим вузлом</ToolGroupNote>
                    </ToolGroupTitle>
                    <ToolRow>
                      <ToolButton
                        type="button"
                        $active={showSearchKeyIndexPanel}
                        aria-expanded={showSearchKeyIndexPanel}
                        onClick={() => setShowSearchKeyIndexPanel(prev => !prev)}
                        title="Меню індексації"
                      >
                        Індекси ▾
                      </ToolButton>
                      {isAdmin && (
                        <ToolButton
                          type="button"
                          $tone="danger"
                          onClick={openMatchingCardsModal}
                          disabled={isMatchingCardsIndexing}
                          title="Зібрати урізані картки matchingCards для швидкої стрічки матчингу"
                          {...createLongPressHandlers('Збирає matchingCards.json локально для ручного імпорту — або будує вузол одразу на бекенді')}
                        >
                          {isMatchingCardsIndexing ? '...' : 'Картки стрічки'}
                        </ToolButton>
                      )}
                      {isAdmin && LEGACY_IMPORT_ID_PREFIXES.map(prefix => (
                        <ToolButton
                          key={`migrate-comments-${prefix}`}
                          type="button"
                          $tone="danger"
                          onClick={() => handleMigrateLegacyComments(prefix)}
                          disabled={Boolean(migratingCommentsPrefix)}
                          title={`Перенести коментарі карток ${prefix}… у публічні відгуки`}
                          {...createLongPressHandlers(
                            `Переносить приватні коментарі карток ${prefix}… у публічні відгуки: `
                              + 'автор — з поля writer, текст лишається той самий',
                          )}
                        >
                          {migratingCommentsPrefix === prefix ? '...' : `Коментарі ${prefix}… у відгуки`}
                        </ToolButton>
                      ))}
                    </ToolRow>
                    {showSearchKeyIndexPanel && (
                      <ToolDrawer>
                        <ToolDrawerNote>
                          Обране нижче запускається однією кнопкою. Локальні роботи читають
                          вибрані JSON-файли й нічого не пишуть у базу; бекендні переписують
                          вузол цілком.
                        </ToolDrawerNote>

                        {INDEX_JOB_GROUPS.map(group => (
                          <CheckGroup key={group.id}>
                            <CheckGroupTitle>
                              {group.title}
                              <CheckGroupNote>{group.note}</CheckGroupNote>
                            </CheckGroupTitle>
                            {group.jobs.map(job => (
                              <CheckRow key={job.key}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedIndexJobs[job.key])}
                                  onChange={() => toggleIndexJobSelection(job.key)}
                                />
                                <span>
                                  {job.label}
                                  {job.hint && <CheckHint>{job.hint}</CheckHint>}
                                </span>
                              </CheckRow>
                            ))}
                          </CheckGroup>
                        ))}

                        <CheckGroup>
                          <CheckGroupTitle>
                            Бакети searchKey
                            <CheckGroupNote>по одному вузлу на фільтр</CheckGroupNote>
                          </CheckGroupTitle>
                          <BucketGrid>
                            {SEARCH_KEY_INDEX_OPTIONS.map(option => (
                              <BucketChip
                                key={option.key}
                                type="button"
                                $active={Boolean(selectedSearchKeyIndexes[option.key])}
                                aria-pressed={Boolean(selectedSearchKeyIndexes[option.key])}
                                onClick={() => toggleSearchKeyIndexSelection(option.key)}
                              >
                                {option.label}
                              </BucketChip>
                            ))}
                          </BucketGrid>
                        </CheckGroup>

                        <ToolRow style={{ marginTop: '10px' }}>
                          <ToolButton
                            type="button"
                            $tone="danger"
                            onClick={runSelectedIndexes}
                            title="Запустити індексацію обраних чекбоксів"
                          >
                            Індексувати обране
                            {selectedIndexCount > 0 && <ToolCount>{selectedIndexCount}</ToolCount>}
                          </ToolButton>
                        </ToolRow>
                      </ToolDrawer>
                    )}
                  </ToolGroup>
                </ConsoleBody>
              )}
            </ConsolePanel>
            <input
              ref={excelImportInputRef}
              type="file"
              accept=".xls,.xlsx"
              style={{ display: 'none' }}
              onChange={handleExcelProfilesUpload}
            />
            <input
              ref={localNodeFilesInputRef}
              type="file"
              accept="application/json,.json"
              multiple
              style={{ display: 'none' }}
              onChange={handleLocalNodeFilesSelected}
            />
            {currentFilter === OVERLAY_REVIEW_FILTER && (
              <OverlayReviewQueue onOpenCard={handleOpenProfileById} />
            )}
            {currentFilter === CARD_LIST_FILTER && !searchListIsolated && !searchLoading && !hasMore
              && countObjectKeys(users) === 0 && (
              // Порожній список мусить сказати, що він порожній і чому: голе
              // місце під панеллю читалось як «ще вантажиться».
              <EmptySearchResult data-testid="card-list-empty">
                <span>
                  «{describeCardListQuery(cardListQuery)}» — карток немає. Інше поле чи період — у «Сортуванні»,
                  звуження — у «Фільтрах».
                </span>
              </EmptySearchResult>
            )}
            {!userNotFound && currentFilter !== OVERLAY_REVIEW_FILTER && (
              <>
                <UsersList
                  setCompare={value => {
                    if (value === null) comparisonScrollRef.current = 0;
                    setCompare(value);
                  }}
                  onOpenComparedCard={openComparedCard}
                  setShowInfoModal={setShowInfoModal}
                  onOpenMoreActions={openMoreActionsModal}
                  users={paginatedUsersWithPhotos}
                  onOpenMedications={openMedicationsModal}
                  favoriteUsers={favoriteUsersData}
                  setFavoriteUsers={setFavoriteUsersData}
                  dislikeUsers={dislikeUsersData}
                  setDislikeUsers={setDislikeUsersData}
                  setUsers={setUsers}
                  setSearch={setSearch}
                  setState={setState}
                setUserIdToDelete={setUserIdToDelete}
                currentFilter={currentFilter}
                isDateInRange={isDateInRange}
                renderCardFooter={renderSearcherFooter}
              />
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
              </>
            )}
            {/* Передача користувачів у UsersList */}
          </div>
        )}
      </InnerContainer>

      {showInfoModal && (
        <InfoModal
          onClose={handleOverlayClick}
          options={fieldsToRender.find(field => field.name === selectedField)?.options}
          onSelect={handleSelectOption}
          text={showInfoModal}
          Context={dotsMenu}
          DelConfirm={delConfirm}
          CompareCards={compareCards}
          comparisonScrollRef={comparisonScrollRef}
          MoreActions={moreActions}
        />
      )}
      {showSaveModal && (
        <LocalIndexOverlay onClick={() => setShowSaveModal(false)}>
          <LocalIndexModal onClick={event => event.stopPropagation()}>
            <SaveModalTitle>Save контакти</SaveModalTitle>
            <SaveModalHint>Оберіть джерело, додаткові обмеження та формат файлу.</SaveModalHint>

            <SaveModalSection>
              <SaveModalSectionTitle>Джерело даних</SaveModalSectionTitle>
              <SaveModalRadioRow>
                <input
                  type="radio"
                  checked={exportDataSource !== 'local'}
                  onChange={() => setExportDataSource('server')}
                />
                <span>
                  Backend
                  <SaveModalComment>Читає всі анкети з вузлів Realtime Database напряму, без Local Storage.</SaveModalComment>
                </span>
              </SaveModalRadioRow>
              <SaveModalRadioRow>
                <input
                  type="radio"
                  checked={exportDataSource === 'local'}
                  onChange={() => setExportDataSource('local')}
                />
                <span>
                  Local files
                  <SaveModalComment>Бере анкети з обраних файлів вузлів (matchingCards, profileDetails, …).</SaveModalComment>
                </span>
              </SaveModalRadioRow>
              {exportDataSource === 'local' && (
                <LocalIndexActions>
                  <button type="button" onClick={handlePickLocalNodeFiles}>
                    Обрати файли вузлів {localIndexSources.loadedNodes.length
                      ? `✅ ${localIndexSources.loadedNodes.join(', ')}`
                      : '(matchingCards, profileDetails, …)'}
                  </button>
                </LocalIndexActions>
              )}
            </SaveModalSection>

            <SaveModalSection>
              <SaveModalSectionTitle>Спеціальні фільтри</SaveModalSectionTitle>
              <SaveModalRadioRow>
                <input
                  type="checkbox"
                  checked={exportOnlyPhonesStartingWith38}
                  onChange={event => setExportOnlyPhonesStartingWith38(event.target.checked)}
                />
                <span>
                  Тільки телефони з 38
                  <SaveModalComment>Додатково залишає в експорті лише картки, у яких хоча б один номер телефону після очищення починається з 38.</SaveModalComment>
                </span>
              </SaveModalRadioRow>
            </SaveModalSection>

            <SaveModalSection>
              <SaveModalSectionTitle>Формат збереження</SaveModalSectionTitle>
              <SaveModalRadioRow>
                <input
                  type="radio"
                  name="contactExportFormat"
                  value="vcf"
                  checked={contactExportFormat === 'vcf'}
                  onChange={() => setContactExportFormat('vcf')}
                />
                <span>
                  VCF
                  <SaveModalComment>Файл контактів для імпорту в телефон, address book або інші застосунки контактів.</SaveModalComment>
                </span>
              </SaveModalRadioRow>
              <SaveModalRadioRow>
                <input
                  type="radio"
                  name="contactExportFormat"
                  value="csv"
                  checked={contactExportFormat === 'csv'}
                  onChange={() => setContactExportFormat('csv')}
                />
                <span>
                  CSV
                  <SaveModalComment>Табличний файл для Excel, Google Sheets або ручної перевірки контактів.</SaveModalComment>
                </span>
              </SaveModalRadioRow>
            </SaveModalSection>

            <SaveModalSection>
              <SaveModalSectionTitle>Варіанти збереження</SaveModalSectionTitle>
              <SaveModalActions>
                <SaveModalActionButton type="button" onClick={exportFilteredUsers}>
                  <SaveModalActionTitle>З активними фільтрами</SaveModalActionTitle>
                  <SaveModalComment>Бере всю вибрану backend/local колекцію, застосовує активні чекбокси панелі фільтрів і зберігає у форматі, вибраному вище. Файли діляться максимум по 5000 контактів.</SaveModalComment>
                </SaveModalActionButton>
                <SaveModalActionButton
                  type="button"
                  onClick={saveSearchBarContacts}
                  disabled={searchBarContactsExportCount === 0}
                >
                  <SaveModalActionTitle>SearchBar contacts</SaveModalActionTitle>
                  <SaveModalComment>Експортує картки з останнього SearchBar запиту: {searchBarContactsExportCount}. Це вже знайдений SearchBar набір, а не backend/local вибір джерела; формат VCF/CSV береться з блоку вище. Використовує повний результат пошуку, а не тільки поточні {PAGE_SIZE} карток на екрані.</SaveModalComment>
                </SaveModalActionButton>
                <SaveModalActionButton type="button" onClick={saveAllContacts}>
                  <SaveModalActionTitle>Вся колекція</SaveModalActionTitle>
                  <SaveModalComment>Ігнорує активні фільтри панелі й експортує всю вибрану backend/local колекцію у форматі, вибраному вище.</SaveModalComment>
                </SaveModalActionButton>
                <SaveModalActionButton type="button" onClick={() => setShowSaveModal(false)}>
                  <SaveModalActionTitle>Закрити</SaveModalActionTitle>
                  <SaveModalComment>Не створює файл і повертає до AddNewProfile.</SaveModalComment>
                </SaveModalActionButton>
              </SaveModalActions>
            </SaveModalSection>
          </LocalIndexModal>
        </LocalIndexOverlay>
      )}
      {showLocalIndexModal && (
        <LocalIndexOverlay onClick={() => setShowLocalIndexModal(false)}>
          <LocalIndexModal onClick={event => event.stopPropagation()}>
            <ModalTitleRow>Локальна індексація</ModalTitleRow>
            <ToolDrawerNote>
              Той самий індекс, що й на бекенді, тільки зібраний у браузері з уже викачаних
              файлів. Бекенд при цьому читається один раз, а не на кожну перебудову, і жоден
              крок нижче в базу не пише — готовий JSON заливається вручну.
            </ToolDrawerNote>

            <ToolDrawerTitle>Джерела</ToolDrawerTitle>
            <LocalIndexActions>
              <StepButton type="button" onClick={handleDownloadProfileNodesForLocalIndex}>
                1 · Викачати вузли анкет
                <StepHint>matchingCards, profileDetails, … і чернетки</StepHint>
              </StepButton>
              <StepButton type="button" onClick={handlePickLocalNodeFiles}>
                2 · Обрати файли вузлів
                <StepHint>
                  {localIndexSources.loadedNodes.length
                    ? `✅ ${localIndexSources.loadedNodes.join(', ')}`
                    : 'файли ще не обрані'}
                  {Object.keys(localDraftProfiles).length
                    ? ` + чернетки (${Object.keys(localDraftProfiles).length})`
                    : ''}
                </StepHint>
              </StepButton>
            </LocalIndexActions>

            <ToolDrawerTitle>Збірка</ToolDrawerTitle>
            <LocalIndexActions>
              <StepButton type="button" onClick={handleBuildLocalMatchingCards}>
                3 · Зібрати matchingCards.json
                <StepHint>далі — ручний імпорт у вузол matchingCards</StepHint>
              </StepButton>
              <StepButton type="button" onClick={handleApplyLocalIndexing}>
                4 · Побудувати JSON індексів searchId / searchKey
                <StepHint>файли качаються в браузер</StepHint>
              </StepButton>
              <StepButton type="button" onClick={buildFullKeySetFromCollections}>
                5 · Повна карта ключів
                <StepHint>перебирає всі картки й показує, які ключі взагалі є</StepHint>
              </StepButton>
              {isAdmin && (
                <StepButton
                  type="button"
                  onClick={handleBuildMatchingCards}
                  disabled={isMatchingCardsIndexing}
                >
                  {isMatchingCardsIndexing ? 'Будуємо…' : 'Або: побудувати matchingCards одразу на бекенді'}
                  <StepHint>повільно: один рекурсивний обхід Storage на анкету</StepHint>
                </StepButton>
              )}
            </LocalIndexActions>

            <ToolDrawerNote>
              Офлайн-збірка не ходить у Storage, тож аватар беруть лише анкети з полем
              <code> photos</code>.
            </ToolDrawerNote>

            <ToolRow>
              <ToolButton type="button" onClick={() => setShowLocalIndexModal(false)}>
                Закрити
              </ToolButton>
            </ToolRow>

          </LocalIndexModal>
        </LocalIndexOverlay>
      )}
    </Container>
  );
};

export default AddNewProfile;
