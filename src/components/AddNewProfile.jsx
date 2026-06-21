import React, { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import * as XLSX from 'xlsx';
// import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import {
  auth,
  fetchNewUsersCollectionInRTDB,
  // fetchUserData,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
  fetchPaginatedNewUsers,
  fetchFavoriteUsers,
  fetchFavoriteUsersData,
  fetchDislikeUsers,
  fetchDislikeUsersData,
  fetchCycleUsersData,
  // fetchListOfUsers,
  makeNewUser,
  // removeSearchId,
  // createSearchIdsForAllUsers,
  fetchUserById,
  loadDuplicateUsers,
  removeCardAndSearchId,
  fetchAllUsersFromRTDB,
  fetchFilteredUsersByPage,
  indexLastLogin,
  fetchUsersByLastActionPaged,
  addStimulationShortcutId,
  removeStimulationShortcutId,
  replaceStimulationShortcutIds,
  fetchStimulationShortcutIds,
  filterMain,
  syncUserSearchIdIndex,
  syncUserSearchKeyIndex,
  createSelectedSearchKeyIndexesInCollection,
  buildSearchIdIndexPayloadFromCollections,
  buildSearchKeyIndexPayloadFromCollections,
  fetchUsersBySearchKeyBloodPaged,
  fetchUsersByIds,
} from './config';
import { fetchUsersBySearchKeyGitNewPaged } from './gitNewLoad';
import {
  AddNewProfileOfflineLoadControls,
  OFFLINE_LOAD_FILTER,
  OFFLINE_LOAD_MODE,
  loadMoreUsersOfline as loadMoreUsersOflineMode,
} from './AddNewProfileOfflineLoad';
import { makeUploadedInfo } from './makeUploadedInfo';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveAccess } from 'utils/accessLevel';
import { normalizePhoneState } from './inputValidations';
import { buildOverlayFromDraft, getCanonicalCard, saveOverlayForUserCard } from 'utils/multiAccountEdits';
import InfoModal from './InfoModal';

import { color, coloredCard, uiTokens } from './styles';
import { ProfileDotsMenu } from './ProfileDotsMenu';
//import { formatPhoneNumber } from './inputValidations';
import { UsersList } from './UsersList';
import {
  getFavorites,
  syncFavorites,
  cacheFavoriteUsers,
  getFavoriteCards,
} from 'utils/favoritesStorage';
import { getLoad2Cards, cacheLoad2Users } from 'utils/load2Storage';
import { cacheDplUsers, getDplCards } from 'utils/dplStorage';
import {
  getDislikes,
  syncDislikes,
  cacheDislikedUsers,
  getDislikedCards,
} from 'utils/dislikesStorage';
import { passesReactionFilter } from 'utils/reactionCategory';
import {
  setIdsForQuery,
  getIdsByQuery,
  getCard,
  getCardsByIds,
  loadCards,
  normalizeQueryKey,
  serializeQueryFilters,
} from 'utils/cardIndex';
import {
  getStoredStimulationShortcutIds,
  setStoredStimulationShortcutIds,
  addStoredStimulationShortcutId,
  removeStoredStimulationShortcutId,
} from 'utils/stimulationShortcutStorage';
// import ExcelToJson from './ExcelToJson';
import { saveToContact, saveToContactCsv } from './ExportContact';
import { renderTopBlock } from './smallCard/renderTopBlock';
import StimulationSchedule from './StimulationSchedule';
import { ReactComponent as BabyIcon } from 'assets/icons/baby.svg';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';
// import { UploadJson } from './topBtns/uploadNewJSON';
import { btnMerge } from './smallCard/btnMerge';
import FilterPanel, { getInitialFilters } from './FilterPanel';
import SearchBar, { detectSearchParams, getSearchCacheKeyForParams } from './SearchBar';
import { Pagination } from './Pagination';
import { ProfileForm, getFieldsToRender } from './ProfileForm';
import {
  isUsersAllowedField,
  pickUsersAllowedFields,
  sanitizeNewUsersPayload,
  sanitizeTechnicalPayload,
} from './formFields';
import { PAGE_SIZE, database } from './config';
import { get as firebaseGet, push, ref } from 'firebase/database';
import {
  getBackendDownloadToastsEnabled,
  setBackendDownloadToastsEnabled,
  withAdminDownloadToast,
} from 'utils/backendDownloadToast';
import {
  clearOfflineCollections,
  loadOfflineCollections,
  saveOfflineCollection,
} from 'utils/offlineCollectionsStorage';
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
  formatDateAndFormula,
  formatDateToDisplay,
  formatDateToServer,
} from 'components/inputValidations';
import { normalizeLastAction } from 'utils/normalizeLastAction';
import { sortUsersByStimulationSchedule } from 'utils/stimulationScheduleSort';
import { convertDriveLinkToImage } from 'utils/convertDriveLinkToImage';
import { rebuildAllNewUsersFilterSetIndexes } from 'utils/newUsersFilterSetsIndex';
import {
  LAST_ACTION2_FILTER,
  LAST_ACTION2_FILTER_STORAGE_KEY,
  LAST_ACTION2_SORT_MODE,
  LastAction2SortModeButton,
  createInitialLA2State,
  getLA2AcceptedOrder,
  loadMoreUsersLastAction2 as loadMoreUsersLastAction2Mode,
  resetLA2StateRef,
  restoreLA2State,
  serializeLA2State,
} from './LastAction2Mode';

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
  color: #333;
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
  border-top: 1px solid #eee;
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
  background: #fff;
  border: 1px solid #e7e7e7;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`;

const MatchingMiniCardShell = styled.div`
  position: relative;
  width: 100%;
  min-height: 180px;
  background: #f3f3f3;
  cursor: pointer;
`;

const MatchingMiniReactionBadge = styled.div`
  font-size: 12px;
  line-height: 1.2;
  color: #4a4a4a;
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
  color: #888;
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
  background-color: #f0f0f0;
  padding: 16px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;

  @media (max-width: 768px) {
    // Медіа-запит для пристроїв з шириною екрану до 768px
    background-color: ${uiTokens.colors.pageBg};
    box-shadow: 0 4px 8px #f5f5f5;
    border-radius: 0;
    padding: 0;
  }
`;

const DotsButton = styled.button`
  margin: 0;
  width: 40px;
  height: 40px;
  background: none;
  border: 1px solid transparent;
  border-radius: 12px;
  font-size: 22px;
  line-height: 1;
  color: ${color.accent5};
  cursor: pointer;
  padding: 0;
  margin-left: auto;
  align-items: center;
  justify-content: center;
  display: flex;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;

  &:hover {
    background-color: ${color.paleAccent2};
    border-color: ${color.paleAccent5};
    color: ${color.accent};
  }
`;


export const SubmitButton = styled.button`
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

export const ExitButton = styled(SubmitButton)`
  background: #fff;
  color: ${color.accent3};
  border-color: ${color.gray};

  &:hover {
    background-color: ${color.paleAccent2};
  }
`;

const TopButtons = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
`;

const EditActionButton = styled.button`
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid transparent;
  background: none;
  color: ${color.accent5};
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
    background-color: ${color.paleAccent2};
    border-color: ${color.paleAccent5};
    color: ${color.accent};
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
  color: ${({ $active }) => ($active ? color.accent : color.accent5)};
  background-color: ${({ $active }) => ($active ? color.paleAccent2 : 'transparent')};
  border-color: ${({ $active }) => ($active ? color.paleAccent5 : 'transparent')};
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


const Button = styled.button`
  padding: 0 12px;
  height: 30px;
  border: 1.5px solid #e5e5e5;
  background: #fff;
  color: #444;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.15s;

  &:hover {
    background: #FFF3E0;
    border-color: #FF8C00;
    color: #CC5500;
  }

  &:active {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }
`;

const LONG_PRESS_MS = 600;

const ButtonsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  margin: 8px 0;
`;

const SortModeContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 8px 0;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
`;

const LoadControlsContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const LoadControlsHeader = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const GearButton = styled(Button)`
  width: 30px;
  padding: 0;
  font-size: 15px;
`;

const LoadOptionsPopover = styled.div`
  width: 100%;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 8px;
`;

const SortModeTitle = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-right: 4px;
`;

const SortModeLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #444;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1.5px solid transparent;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  input[type='radio'] {
    display: none;
  }

  &:has(input:checked) {
    background: #FFF3E0;
    border-color: #FF8C00;
    color: #CC5500;
    font-weight: 600;
  }

  &:hover:not(:has(input:checked)) {
    background: #f5f5f5;
    border-color: #ddd;
  }
`;





const SearchScopeContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
`;

const SearchScopeBlock = styled.div`
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 8px 12px 10px;
`;

const SearchScopeBlockTitle = styled.div`
  font-size: 10px;
  font-weight: 700;
  color: #aaa;
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

const SearchScopeItems = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const SearchScopeDivider = styled.hr`
  flex-basis: 100%;
  border: 0;
  border-top: 1px solid #e8e8e8;
  margin: 4px 0;
`;

const SearchScopeLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #1f1f1f;
`;

const SearchScopeLabelTextGroup = styled.span`
  display: inline-flex;
  flex-direction: column;
  line-height: 1.2;
`;

const ScopeChip = styled.button`
  padding: 3px 9px;
  border-radius: 20px;
  border: 1.5px solid ${({ $active }) => ($active ? '#FF8C00' : '#e0e0e0')};
  background: ${({ $active }) => ($active ? '#FFF3E0' : '#fafafa')};
  color: ${({ $active }) => ($active ? '#CC5500' : '#666')};
  font-size: 12px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  line-height: 1.5;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
  display: inline-flex;
  align-items: center;

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }

  &:hover:not(:disabled) {
    border-color: #FF8C00;
    color: #CC5500;
  }
`;

const ToggleSearchScopeButton = styled.button`
  border: 1px solid #c8d0ff;
  border-radius: 6px;
  background: #f3f5ff;
  color: #2f4db9;
  font-size: 11px;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: #e9edff;
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
  border: 1.5px solid ${({ $active }) => ($active ? '#FF8C00' : '#d5d5d5')};
  border-radius: 8px;
  background: ${({ $active }) => ($active ? '#FFF3E0' : '#fff')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#CC5500' : '#666')};
  flex-shrink: 0;
  transition: border-color 0.15s, background 0.15s, color 0.15s;

  &:hover {
    border-color: #FF8C00;
    color: #CC5500;
    background: #FFF3E0;
  }
`;

const IndexModal = styled.div`
  width: 100%;
  margin: 6px 0 10px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
`;

const IndexModalList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 10px;
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
  background: #fff;
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
  color: #555;
  font-size: 13px;
`;

const SaveModalSection = styled.div`
  padding: 10px 0;
  border-top: 1px solid #eee;
`;

const SaveModalSectionTitle = styled.div`
  margin-bottom: 8px;
  font-weight: 700;
  color: #333;
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
  color: #666;
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
  border: 1px solid #ffd39a;
  border-radius: 8px;
  background: #fff8ef;
  color: #5d3b00;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: #fff3e0;
    border-color: #ff8c00;
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
const MATCHING_DEBUG_LOG_MODE_KEY = 'matchingDebugLogMode';
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

const countLoadFilterDrop = (acc, reason) => {
  if (!reason) return acc;
  acc[reason] = (acc[reason] || 0) + 1;
  return acc;
};

const isFutureGetInTouchDate = value => {
  const normalized = String(value ?? '').trim();
  if (['', '2099-99-99', '9999-99-99', '99.99.2099', '99.99.9999'].includes(normalized)) return false;

  const today = new Date().toISOString().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized > today;

  const dottedMatch = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!dottedMatch) return false;

  const [, day, month, year] = dottedMatch;
  return `${year}-${month}-${day}` > today;
};

const removeUserIdFromQuery = (queryKey, userId) => {
  if (!queryKey || !userId) return false;

  const existingIds = getIdsByQuery(queryKey);
  const nextIds = existingIds.filter(id => id !== userId);
  if (nextIds.length === existingIds.length) return false;

  setIdsForQuery(queryKey, nextIds);
  return true;
};

const filterGitNewVisibleUsers = (queryKey, usersObj = {}) => {
  const normalizedUsers = usersObj && typeof usersObj === 'object' ? usersObj : {};
  const droppedIds = [];

  const visibleUsers = Object.entries(normalizedUsers).reduce((acc, [id, user]) => {
    const userId = user?.userId || id;
    if (!userId) return acc;

    if (isFutureGetInTouchDate(user?.getInTouch)) {
      droppedIds.push(userId);
      return acc;
    }

    acc[userId] = { ...user, userId };
    return acc;
  }, {});

  if (droppedIds.length > 0) {
    const droppedSet = new Set(droppedIds);
    const existingIds = getIdsByQuery(queryKey);
    const nextIds = existingIds.filter(id => !droppedSet.has(id));
    if (nextIds.length !== existingIds.length) setIdsForQuery(queryKey, nextIds);
  }

  return { visibleUsers, droppedIds };
};

const appendGitNewUsersToQuery = (queryKey, usersObj = {}) => {
  const normalizedUsers = usersObj && typeof usersObj === 'object' ? usersObj : {};
  const existingIds = getIdsByQuery(queryKey);
  const nextIds = [...existingIds];

  Object.entries(normalizedUsers).forEach(([id, user]) => {
    const userId = user?.userId || id;
    if (!userId) return;
    if (!nextIds.includes(userId)) nextIds.push(userId);
  });

  if (nextIds.length !== existingIds.length) {
    setIdsForQuery(queryKey, nextIds);
  }

  return normalizedUsers;
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
    dataSource: card.__sourceCollection || card.dataSource || null,
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

const EXCEL_COMMENTS_OWNER_ID = 'stFMfZ8CqQX05L8vK9Yse6FdYIh1';

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

  const LOAD_SORT_MODES = {
    GIT: 'GIT',
    GIT_NEW: 'GITnew',
    LAST_ACTION: 'LA',
    LAST_ACTION2: LAST_ACTION2_SORT_MODE,
    NO_GIT: 'NoGIT',
    SEARCH_ID_KEY_ONLY: 'SearchIdKeyOnly',
    OFLINE: OFFLINE_LOAD_MODE,
  };
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
  ];

  const location = useLocation();
  const initialAccess = resolveAccess({
    uid: auth.currentUser?.uid,
    accessLevel: localStorage.getItem('accessLevel'),
  });

  const [userNotFound, setUserNotFound] = useState(false);

  const SEARCH_KEY = 'addSearchQuery';
  const SEARCH_OPTIONS_STORAGE_KEY = 'addSearchOptions';
  const SEARCH_RESULT_FILTERS_STORAGE_KEY = 'addSearchResultFiltersEnabled';
  const INDEX_SELECTION_STORAGE_KEY = 'addIndexSelectionOptions';
  const EDIT_PROFILE_USER_ID_KEY = 'addNewProfileEditUserId';
  const PREVIOUS_LIST_STATE_KEY = 'addNewProfilePreviousListState';
  const defaultSelectedIndexJobs = {
    lastLogin: true,
    stimulationShortcuts: true,
    searchKeyUsersAll: false,
    searchKeySetReindex: false,
    searchLocalIdAndKey: false,
    searchLocalImtHeightWeight: false,
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
  const [matchingDebugLogMode, setMatchingDebugLogMode] = useState(() => (
    typeof localStorage !== 'undefined' && localStorage.getItem(MATCHING_DEBUG_LOG_MODE_KEY) === 'file'
      ? 'file'
      : 'console'
  ));
  const excelImportInputRef = useRef(null);
  const [showSearchKeyIndexPanel, setShowSearchKeyIndexPanel] = useState(false);
  const [showLocalIndexModal, setShowLocalIndexModal] = useState(false);
  const [pendingLocalIndexTypes, setPendingLocalIndexTypes] = useState([]);
  const [pendingLocalUsersData, setPendingLocalUsersData] = useState(null);
  const [pendingLocalNewUsersData, setPendingLocalNewUsersData] = useState(null);
  const [exportDataSource, setExportDataSource] = useState('server');
  const [exportOnlyPhonesStartingWith38, setExportOnlyPhonesStartingWith38] = useState(false);
  const [contactExportFormat, setContactExportFormat] = useState('vcf');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [localExportUsersData, setLocalExportUsersData] = useState(null);
  const [localExportNewUsersData, setLocalExportNewUsersData] = useState(null);
  const [isOfflineCollectionsRestoring, setIsOfflineCollectionsRestoring] = useState(true);
  const localUsersFileInputRef = useRef(null);
  const localNewUsersFileInputRef = useRef(null);
  const localExportUsersFileInputRef = useRef(null);
  const localExportNewUsersFileInputRef = useRef(null);
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


  const SEARCH_SCOPE_BLOCKS = [
    {
      id: 'id-search',
      title: 'Пошук по ID',
      options: [
        { key: 'searchId', label: 'searchId (точний)' },
        { key: 'useResultFilters', label: 'фільтри', isFilterToggle: true },
        { key: 'equalToAllCards', label: 'equalTo по всіх карточках (за поточним ключем)' },
        { key: 'searchKey', label: 'searchKey bucket/date' },
        { key: 'partialUserId', label: 'userId (частковий збіг)' },
      ],
    },
    {
      id: 'search-keys',
      title: 'Пошук в searchId / equalTo',
      options: [
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
      ],
    },
  ];

  const SEARCH_KEY_OPTIONS = SEARCH_SCOPE_BLOCKS.find(block => block.id === 'search-keys')?.options || [];
  const TOGGLEABLE_SEARCH_KEYS = [
    'searchId',
    'equalToAllCards',
    'searchKey',
    'partialUserId',
    ...SEARCH_KEY_OPTIONS.map(option => option.key),
  ];
  const CONTACT_SEARCH_KEYS = ['phone', 'telegram', 'instagram', 'ameblo', 'facebook', 'email', 'vk', 'tiktok', 'linkedin', 'youtube', 'twitter', 'line', 'otherLink', 'other'];

  const defaultEnabledSearchKeys = SEARCH_SCOPE_BLOCKS.flatMap(block => block.options).reduce(
    (acc, option) => {
      // equalTo-пошук має вмикатись тільки явним чекбоксом користувача.
      // Раніше через дефолт `true` для всіх ключів цей режим запускався неочікувано.
      acc[option.key] = option.key !== 'equalToAllCards' && option.key !== 'searchKey';
      return acc;
    },
    {},
  );

  const [enabledSearchKeys, setEnabledSearchKeys] = useState(() => {
    const storedRaw = localStorage.getItem(SEARCH_OPTIONS_STORAGE_KEY);
    if (!storedRaw) return defaultEnabledSearchKeys;

    try {
      const parsed = JSON.parse(storedRaw);
      if (!parsed || typeof parsed !== 'object') return defaultEnabledSearchKeys;

      return Object.keys(defaultEnabledSearchKeys).reduce((acc, key) => {
      acc[key] = typeof parsed[key] === 'boolean' ? parsed[key] : defaultEnabledSearchKeys[key];
      return acc;
    }, {});
    } catch (error) {
      console.warn('[AddNewProfile] Failed to parse search options from localStorage', error);
      return defaultEnabledSearchKeys;
    }
  });

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

  const handleSearchScopeChange = (key, disabled = false) => {
    if (disabled) return;
    if (key === 'useResultFilters') {
      setUseSearchResultFilters(prev => !prev);
      return;
    }
    setEnabledSearchKeys(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const areAllSearchScopesEnabled = TOGGLEABLE_SEARCH_KEYS.every(key => Boolean(enabledSearchKeys[key]));

  const toggleAllSearchScopes = () => {
    setEnabledSearchKeys(prev => {
      const shouldEnableAll = TOGGLEABLE_SEARCH_KEYS.some(key => !prev[key]);
      const next = { ...prev };

      TOGGLEABLE_SEARCH_KEYS.forEach(key => {
        next[key] = shouldEnableAll;
      });

      return next;
    });
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
  const skipNextReloadRef = useRef(false);
  const searchKeyCoverageRef = useRef({});
  const loadDebugLogsRef = useRef([]);
  const renderCacheHydrationIdsRef = useRef(new Set());
  const hasInitializedFiltersRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userIdToDelete, setUserIdToDelete] = useState(null);
  const navigate = useNavigate();
  const access = resolveAccess({ uid: auth.currentUser?.uid, accessLevel: state.accessLevel || localStorage.getItem('accessLevel') });
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

  const downloadMatchingDebugLogs = useCallback(() => {
    if (typeof window === 'undefined') return 0;

    const logs = Array.isArray(window.__MATCHING_DEBUG_LOGS)
      ? window.__MATCHING_DEBUG_LOGS
      : [];

    downloadJsonFile(`matching-debug-${buildJsonDownloadStamp()}.json`, {
      userAgent: window.navigator?.userAgent || '',
      url: window.location?.href || '',
      timestamp: new Date().toISOString(),
      logsCount: logs.length,
      logs,
    });

    return logs.length;
  }, [downloadJsonFile]);

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
        const commentsOwnerRef = ref(database, `multiData/comments/${EXCEL_COMMENTS_OWNER_ID}`);

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

          const commentId = push(commentsOwnerRef).key || `comment-${userId}`;

          commentsJson[EXCEL_COMMENTS_OWNER_ID][commentId] = {
            authorId: EXCEL_COMMENTS_OWNER_ID,
            cardId: userId,
            lastAction: todayTimestamp,
            text: commentText,
          };

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

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const handleBlur = () => {
    setState(prevState => {
      const normalizedState = normalizePhoneState(prevState);
      handleSubmit(normalizedState);
      return normalizedState;
    });
  };

  const hideFutureGitNewCardAndLoadNext = submittedState => {
    const userId = submittedState?.userId;
    if (currentFilter !== 'GITnew' || !userId || !isFutureGetInTouchDate(submittedState.getInTouch)) {
      return false;
    }

    const queryKey = buildListQueryKey('GITnew', filters);
    removeUserIdFromQuery(queryKey, userId);
    setUsers(prevUsers => {
      if (!prevUsers || !prevUsers[userId]) return prevUsers;
      const { [userId]: _hiddenUser, ...restUsers } = prevUsers;
      return restUsers;
    });

    appendLoadDebugLog('handleSubmit:gitNew-hide-future-getInTouch', {
      queryKey,
      userId,
      getInTouch: submittedState.getInTouch,
      currentPage,
    });

    ensureGitNewLoadedCount(Math.max(PAGE_SIZE, currentPage * PAGE_SIZE), filters, {
      forceVisibleUpdate: true,
    }).catch(error => {
      appendLoadDebugLog('handleSubmit:gitNew-load-next-error', {
        queryKey,
        userId,
        message: error?.message || String(error),
      });
    });

    return true;
  };

  const hideOflineCardAndLoadNext = submittedState => {
    const userId = submittedState?.userId;
    if (currentFilter !== OFFLINE_LOAD_FILTER || !userId) {
      return false;
    }

    const queryKey = buildListQueryKey(OFFLINE_LOAD_FILTER, filters);
    removeUserIdFromQuery(queryKey, userId);
    setUsers(prevUsers => {
      if (!prevUsers || !prevUsers[userId]) return prevUsers;
      const { [userId]: _hiddenUser, ...restUsers } = prevUsers;
      return restUsers;
    });

    appendLoadDebugLog('handleSubmit:ofline-remove-from-query-and-refill', {
      queryKey,
      userId,
      currentPage,
    });

    loadMoreUsersOfline(filters, {
      targetLoadedCount: PAGE_SIZE,
      forceVisibleUpdate: true,
    }).catch(error => {
      appendLoadDebugLog('handleSubmit:ofline-load-next-error', {
        queryKey,
        userId,
        message: error?.message || String(error),
      });
    });

    return true;
  };

  const refillGitAfterGetInTouchChange = (submittedState, previousData = null) => {
    if (currentFilter !== 'DATE2' || !submittedState?.userId) return;
    if (previousData && previousData.getInTouch === submittedState.getInTouch) return;

    const willHideSubmittedCard = isFutureGetInTouchDate(submittedState.getInTouch);
    if (willHideSubmittedCard) {
      setUsers(prevUsers => {
        if (!prevUsers || !prevUsers[submittedState.userId]) return prevUsers;
        const { [submittedState.userId]: _hiddenUser, ...restUsers } = prevUsers;
        return restUsers;
      });
    }

    const visibleCount = Math.max(0, countObjectKeys(users) - (willHideSubmittedCard && users?.[submittedState.userId] ? 1 : 0));
    if (visibleCount >= PAGE_SIZE || !hasMore) return;

    appendLoadDebugLog('handleSubmit:git-refill-after-getInTouch-change', {
      userId: submittedState.userId,
      previousGetInTouch: previousData?.getInTouch ?? null,
      nextGetInTouch: submittedState.getInTouch ?? null,
      visibleCount,
      targetVisibleCount: PAGE_SIZE,
      hasMore,
    });

    Promise.resolve(loadMoreUsers2(filters)).catch(error => {
      appendLoadDebugLog('handleSubmit:git-refill-after-getInTouch-error', {
        userId: submittedState.userId,
        message: error?.message || String(error),
      });
    });
  };

  const handleSubmit = async (newState, overwrite, delCondition, makeIndex) => {
    const now = Date.now();
    const baseState = normalizePhoneState(newState ? { ...newState } : { ...state });
    const updatedState = { ...baseState, lastAction: now };
    const saveRequestId = profileSaveRequestRef.current + 1;
    profileSaveRequestRef.current = saveRequestId;

    const formattedLastDelivery = formatDateToServer(
      formatDateAndFormula(updatedState.lastDelivery)
    );

    const syncedState = { ...updatedState };

    if (formattedLastDelivery) {
      syncedState.lastDelivery = formattedLastDelivery;
    } else {
      delete syncedState.lastDelivery;
    }

    registerHistorySnapshot(syncedState);

    try {
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

      // Optimistically update the only full-card cache and UI state before syncing with server.
      const removeKeys = delCondition ? Object.keys(delCondition) : [];
      const optimisticCard = updateCachedUser(syncedState, { removeKeys }) || syncedState;
      const localSaveVersion = profileSnapshotVersionRef.current + 1;
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
      cacheFetchedUsers({ [syncedState.userId]: optimisticCard }, cacheLoad2Users, filters);
      const gitNewCardHidden = hideFutureGitNewCardAndLoadNext(optimisticCard);
      const oflineCardHidden = hideOflineCardAndLoadNext(optimisticCard);
      if (!gitNewCardHidden && !oflineCardHidden) {
        setUsers(prev => ({ ...prev, [syncedState.userId]: optimisticCard }));
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
          const isUsersCollectionId = syncedState.userId.length > 20;
          const searchKeySyncTasks = [
            syncUserSearchKeyIndex(syncedState.userId, existingData || {}, syncedState),
          ];
          if (isUsersCollectionId) {
            searchKeySyncTasks.push(
              syncUserSearchKeyIndex(syncedState.userId, existingData || {}, syncedState, {
                rootPath: 'searchKey/users',
              })
            );
          }

          await Promise.all([
            syncUserSearchIdIndex(syncedState.userId, existingData || {}, syncedState),
            ...searchKeySyncTasks,
          ]);
        } catch (indexError) {
          const details = indexError?.message || String(indexError);
          console.error('Submit: search index sync failed, continuing with save', indexError);
          toast.error(`Індексація не виконана (${details}), продовжуємо збереження`);
        }
      }
      refillGitAfterGetInTouchChange(optimisticCard, existingData);

      console.log('[SAVE] userId:', syncedState.userId);

      if (syncedState?.userId?.length > 20) {

        const cleanedState = sanitizeTechnicalPayload(pickUsersAllowedFields(syncedState));
        if (delCondition) {
          Object.keys(delCondition).forEach(key => {
            if (key !== 'userId' && isUsersAllowedField(key)) {
              delete cleanedState[key];
            }
          });
        }

        const sanitizedExistingData = sanitizeTechnicalPayload(pickUsersAllowedFields(existingData || {}));
        if (delCondition) {
          Object.keys(delCondition).forEach(key => {
            if (key !== 'userId' && isUsersAllowedField(key)) {
              delete sanitizedExistingData[key];
            }
          });
        }

        const uploadedInfo = makeUploadedInfo(sanitizedExistingData, cleanedState, overwrite);
        if (delCondition) {
          Object.keys(delCondition).forEach(key => {
            if (isUsersAllowedField(key)) {
              uploadedInfo[key] = null;
            }
          });
        }

        if (!makeIndex) {
          console.log('[SAVE] payload to firebase:', uploadedInfo);
          await Promise.all([
            updateDataInRealtimeDB(syncedState.userId, uploadedInfo, 'update'),
            updateDataInFiresoreDB(syncedState.userId, uploadedInfo, 'check', delCondition),
          ]);
        }

      } else {
        if (newState) {
          const newStateWithDelivery = sanitizeNewUsersPayload({ ...syncedState });

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
          await updateDataInNewUsersRTDB(
            syncedState.userId,
            newStateWithDelivery,
            'update'
          );
        } else {
          const cleanedNewUsersState = sanitizeNewUsersPayload(syncedState);
          console.log('[SAVE] payload to firebase:', cleanedNewUsersState);
          await updateDataInNewUsersRTDB(syncedState.userId, cleanedNewUsersState, 'update');
        }
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

      const savedCachedCard = updateCachedUser(syncedState, { removeKeys }) || syncedState;
      cacheFetchedUsers({ [syncedState.userId]: savedCachedCard }, cacheLoad2Users, filters);
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

  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('myProfileDraft');
      localStorage.removeItem('ownerId');
      setState({});
      setIsLoggedIn(false);
      setShowInfoModal(false);
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

  const handleClear = (fieldName, idx) => {
    setState(prevState => {
      const isArray = Array.isArray(prevState[fieldName]);
      const applyDelLikeRemoval = deletedValue => {
        const nextState = { ...prevState };
        delete nextState[fieldName];
        handleSubmit(nextState, 'overwrite', { [fieldName]: deletedValue });
        return nextState;
      };

      const newState = { ...prevState };

      if (isArray) {
        const filteredArray = prevState[fieldName].filter((_, i) => i !== idx);
        const removedValue = prevState[fieldName][idx];
        const normalizedFilteredArray = filteredArray.filter(
          value => !(typeof value === 'string' && value.trim() === '')
        );

        if (normalizedFilteredArray.length === 0) {
          return applyDelLikeRemoval(removedValue);
        } else if (normalizedFilteredArray.length === 1) {
          newState[fieldName] = normalizedFilteredArray[0];
        } else {
          newState[fieldName] = normalizedFilteredArray;
        }
        handleSubmit(newState, 'overwrite');
        return newState;
      } else {
        const removedValue = prevState[fieldName];
        return applyDelLikeRemoval(removedValue);
      }
    });
  };

  const handleDelKeyValue = fieldName => {
    setState(prevState => {
      // Створюємо копію попереднього стану
      const newState = { ...prevState };

      const deletedValue = newState[fieldName];

      // Видаляємо ключ з нового стану
      delete newState[fieldName];


      // Встановлюємо значення 'del_key' для видалення
      //  newState[fieldName] = 'del_key';

      handleSubmit(newState, 'overwrite', { [fieldName]: deletedValue });
      return newState; // Повертаємо оновлений стан
    });
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
  const [hasMore, setHasMore] = useState(true); // Стан для перевірки, чи є ще користувачі
  const [lastKey, setLastKey] = useState(null); // Стан для зберігання останнього ключа
  const [lastKey21, setLastKey21] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentFilter, setCurrentFilter] = useState('');
  const [loadSortMode, setLoadSortMode] = useState(LOAD_SORT_MODES.GIT_NEW);
  const [isLoadOptionsOpen, setIsLoadOptionsOpen] = useState(false);
  const [loadRequestId, setLoadRequestId] = useState(0);
  const [dateOffset2, setDateOffset2] = useState(0);
  const [dateOffset21, setDateOffset21] = useState(0);
  const [dateOffsetLA, setDateOffsetLA] = useState(0);
  const la2StateRef = useRef(createInitialLA2State());
  const initialFav = getFavorites();
  const [favoriteUsersData, setFavoriteUsersData] = useState(initialFav);
  const initialDis = getDislikes();
  const [dislikeUsersData, setDislikeUsersData] = useState(initialDis);
  const [, setCacheCount] = useState(0);
  const [, setBackendCount] = useState(0);
  const gitNewPendingLoadsRef = useRef({});
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

    downloadJsonFile(`load-debug-${buildJsonDownloadStamp()}.json`, {
      userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent || '' : '',
      url: typeof window !== 'undefined' ? window.location?.href || '' : '',
      timestamp: new Date().toISOString(),
      currentFilter,
      loadSortMode,
      search,
      searchBarQueryActive,
      hasMore,
      lastKey,
      lastKey21,
      dateOffset2,
      dateOffset21,
      dateOffsetLA,
      usersCount: countObjectKeys(users),
      filters: summarizeLoadFiltersForLog(filters),
      logsCount: logs.length,
      logs,
    });

    toast.success(`Load log збережено (${logs.length})`);
    return logs.length;
  }, [
    currentFilter,
    dateOffset2,
    dateOffset21,
    dateOffsetLA,
    downloadJsonFile,
    filters,
    hasMore,
    lastKey,
    lastKey21,
    loadSortMode,
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

    const snapshot = {
      userIds,
      currentFilter,
      currentPage,
      hasMore,
      lastKey: lastKey ?? null,
      lastKey21: lastKey21 ?? null,
      dateOffset2,
      dateOffset21,
      dateOffsetLA,
      la2State: currentFilter === LAST_ACTION2_FILTER ? serializeLA2State(la2StateRef.current) : undefined,
      loadSortMode,
      search,
      hasSearched,
    };

    logProfileRestoreStep('previous-list:snapshot-save', {
      openingUserId: state.userId,
      userIdsCount: userIds.length,
      currentFilter,
      currentPage,
      hasMore,
      loadSortMode,
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
    lastKey,
    lastKey21,
    dateOffset2,
    dateOffset21,
    dateOffsetLA,
    loadSortMode,
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
  }, [canAccessAdd, location.pathname, location.search, navigate, state.userId]);

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

    const isSearchKeyMode = loadSortMode === 'SearchIdKeyOnly';
    const canInstantlyFilterInSearchKeyMode =
      isSearchKeyMode && currentFilter === 'DATE2.1' && Object.keys(users || {}).length > 0;

    if (canInstantlyFilterInSearchKeyMode) {
      const groups = ['bloodGroup', 'rh', 'maritalStatus'];
      const hasExpandedGroup = groups.some(group => {
        const prevGroup = prevValue[group] || {};
        const nextGroup = nextValue[group] || {};
        const options = new Set([...Object.keys(prevGroup), ...Object.keys(nextGroup)]);
        return Array.from(options).some(
          key => prevGroup[key] === false && nextGroup[key] === true,
        );
      });

      if (!hasExpandedGroup) {
        const filteredUsers = filterMain(
          Object.entries(users || {}),
          'DATE2.1',
          nextValue,
          favoriteUsersData,
          dislikeUsersData,
          { requireCurrentOrPastGetInTouch: isSearchKeyMode },
        ).reduce((acc, [, user]) => {
          if (user?.userId) {
            acc[user.userId] = user;
          }
          return acc;
        }, {});

        skipNextReloadRef.current = true;
        filtersRef.current = nextValue;
        setFilters(nextValue);
        setUsers(filteredUsers);
        setCurrentPage(1);
        setSearchLoading(false);
        setHasSearched(true);
        return;
      }
    }

    if (currentFilter === LAST_ACTION2_FILTER) {
      filtersRef.current = nextValue;
      setUsers({});
      setCurrentPage(1);
      setHasMore(true);
      setSearchLoading(true);
      setHasSearched(true);
      resetLA2StateRef(la2StateRef);
      setFilters(nextValue);
      return;
    }

    if (currentFilter === 'LAST_ACTION') {
      filtersRef.current = nextValue;
      setUsers({});
      setCurrentPage(1);
      setHasMore(true);
      setDateOffsetLA(0);
      setSearchLoading(true);
      setHasSearched(true);
      setFilters(nextValue);
      return;
    }

    filtersRef.current = nextValue;
    setSearchLoading(true);
    setHasSearched(true);
    setFilters(nextValue);
  }, [
    currentFilter,
    setDateOffsetLA,
    dislikeUsersData,
    favoriteUsersData,
    loadSortMode,
    setCurrentPage,
    setFilters,
    setHasSearched,
    setSearchLoading,
    setUsers,
    users,
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
          const data = await fetchUserById(activeUserId);
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
    if (!searchBarQueryActive) return;
    if (searchLoading) {
      setSearchLoading(false);
    }
  }, [
    searchBarQueryActive,
    searchLoading,
    setSearchLoading,
  ]);

  const cacheFetchedUsers = useCallback(
    (usersObj, cacheFn, currentFilters = filters) => {
      cacheFn(usersObj, currentFilters);
    },
    [filters]
  );

  const buildQueryKey = (mode, currentFilters = {}, term = '') =>
    normalizeQueryKey(
      `${mode || 'all'}:${term || ''}:${serializeQueryFilters(currentFilters)}`,
    );
  const buildListQueryKey = (mode, currentFilters = {}) => buildQueryKey(mode, currentFilters, '');

  const resolveFilterByLoadSortMode = mode => {
    switch (mode) {
      case LOAD_SORT_MODES.LAST_ACTION:
        return 'LAST_ACTION';
      case LOAD_SORT_MODES.LAST_ACTION2:
        return LAST_ACTION2_FILTER;
      case LOAD_SORT_MODES.GIT_NEW:
        return 'GITnew';
      case LOAD_SORT_MODES.NO_GIT:
      case LOAD_SORT_MODES.SEARCH_ID_KEY_ONLY:
        return 'DATE2.1';
      case LOAD_SORT_MODES.OFLINE:
        return OFFLINE_LOAD_FILTER;
      case LOAD_SORT_MODES.GIT:
      default:
        return 'DATE2';
    }
  };

  const filterStorageKey =
    loadSortMode === LOAD_SORT_MODES.LAST_ACTION
      ? 'addFiltersLA'
      : loadSortMode === LOAD_SORT_MODES.LAST_ACTION2
      ? LAST_ACTION2_FILTER_STORAGE_KEY
      : 'addFilters';

  const gitNewMode = loadSortMode === LOAD_SORT_MODES.GIT_NEW;
  const offlineLoadMode = loadSortMode === LOAD_SORT_MODES.OFLINE;
  const searchIdAndSearchKeyOnlyMode = loadSortMode === LOAD_SORT_MODES.SEARCH_ID_KEY_ONLY || gitNewMode;

  const effectiveEnabledSearchKeys = searchIdAndSearchKeyOnlyMode
    ? {
        ...enabledSearchKeys,
        searchId: true,
        equalToAllCards: true,
        searchKey: true,
        // Не вимикаємо partialUserId примусово: якщо чекбокс увімкнений,
        // користувач очікує пошук по ключах users/newUsers.
        partialUserId: enabledSearchKeys.partialUserId,
      }
    : enabledSearchKeys;

  const handleLoadSortModeChange = useCallback(mode => {
    setLoadSortMode(mode);
  }, []);

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const isDateInRange = dateStr => {
    const currentCardsById = loadCards();
    const dates = Object.keys(users || {})
      .map(id => (currentCardsById[id] || users[id])?.getInTouch)
      .filter(d => dateRegex.test(d));
    if (dates.length === 0) return true;
    dates.sort();
    const min = dates[0];
    const max = dates[dates.length - 1];
    return dateStr >= min && dateStr <= max;
  };

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

  const getSearchKeyReactionSortDirection = useCallback(reactionFilters => {
    if (!searchIdAndSearchKeyOnlyMode || !reactionFilters || typeof reactionFilters !== 'object') {
      return null;
    }

    const hasExplicitReactionSelection = Object.values(reactionFilters).some(value => value === false);
    if (!hasExplicitReactionSelection) {
      return null;
    }

    const selectedKeys = Object.entries(reactionFilters)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key);

    if (selectedKeys.length !== 1) {
      return null;
    }

    if (selectedKeys[0] === 'pastGetInTouch') {
      return 'desc';
    }

    if (selectedKeys[0] === 'futureGetInTouch') {
      return 'asc';
    }

    return null;
  }, [searchIdAndSearchKeyOnlyMode]);

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

  const handleOpenScheduleProfile = useCallback(
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
        caller: 'handleOpenScheduleProfile',
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

  useEffect(() => {
    if (skipNextReloadRef.current) {
      appendLoadDebugLog('reload-effect:skip-next-reload', {
        currentFilter,
        loadSortMode,
        search,
        filters: summarizeLoadFiltersForLog(filters),
      });
      skipNextReloadRef.current = false;
      return;
    }

    appendLoadDebugLog('reload-effect:start', {
      currentFilter,
      loadSortMode,
      search,
      searchBarQueryActive,
      searchListIsolated,
      filters: summarizeLoadFiltersForLog(filters),
      previousUsersCount: countObjectKeys(users),
      hasMore,
      lastKey,
      lastKey21,
      dateOffset2,
      dateOffset21,
      dateOffsetLA,
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
      setCacheCount(0);
      setBackendCount(0);
      setSearchLoading(false);
      setHasSearched(Boolean((search || lastSearchBarQuery || '').trim()));
      return;
    }

    setUsers({});
    setLastKey(null);
    setLastKey21(null);
    setHasMore(true);
    setCurrentPage(1);
    setCacheCount(0);
    setBackendCount(0);
    setDateOffsetLA(0);
    setDateOffset21(0);

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

    if (currentFilter === 'DATE2') {
      appendLoadDebugLog('reload-effect:branch', { branch: 'DATE2', loader: 'loadMoreUsers2' });
      loadMoreUsers2()
        .then(({ cacheCount, backendCount }) => {
          setCacheCount(cacheCount);
          setBackendCount(backendCount);
        })
        .catch(error => {
          appendLoadDebugLog('reload-effect:DATE2-error', {
            message: error?.message || String(error),
            stack: error?.stack || null,
          });
          setCacheCount(0);
          setBackendCount(0);
        })
        .finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === OFFLINE_LOAD_FILTER) {
      appendLoadDebugLog('reload-effect:branch', { branch: OFFLINE_LOAD_FILTER, loader: 'loadMoreUsersOfline' });
      loadMoreUsersOfline(filters, { reset: true })
        .then(({ cacheCount, backendCount, ignored }) => {
          if (ignored) return;
          setCacheCount(cacheCount);
          setBackendCount(backendCount);
        })
        .finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === 'GITnew') {
      appendLoadDebugLog('reload-effect:branch', { branch: 'GITnew', loader: 'loadMoreUsersGitNew' });
      loadMoreUsersGitNew()
        .then(({ cacheCount, backendCount, ignored }) => {
          if (ignored) return;
          setCacheCount(cacheCount);
          setBackendCount(backendCount);

          const loadedFromCacheOnly = Number(backendCount) === 0 && Number(cacheCount) >= PAGE_SIZE;
          if (loadedFromCacheOnly) {
            appendLoadDebugLog('reload-effect:gitNew-prefetch-skipped', {
              reason: 'first page already loaded from cache',
              cacheCount,
              backendCount,
              threshold: PAGE_SIZE,
            });
            return;
          }

          ensureGitNewLoadedCount(PAGE_SIZE * 3, filters).catch(error => {
            appendLoadDebugLog('reload-effect:gitNew-prefetch-error', {
              message: error?.message || String(error),
            });
          });
        })
        .finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === 'DATE2.1') {
      appendLoadDebugLog('reload-effect:branch', {
        branch: 'DATE2.1',
        searchIdAndSearchKeyOnlyMode,
      });
      const queryKey = buildListQueryKey('DATE2.1', filters);
      const ids = getIdsByQuery(queryKey);
      const cachedCards = ids.map(id => getCard(id)).filter(Boolean);
      if (cachedCards.length > 0 || (ids.length === 0 && searchKeyCoverageRef.current[serializeQueryFilters(filters)])) {
        const cachedUsers = filterMain(
          cachedCards.map(user => [user.userId, user]),
          'DATE2.1',
          filters,
          favoriteUsersData,
          dislikeUsersData,
          { requireCurrentOrPastGetInTouch: searchIdAndSearchKeyOnlyMode },
        ).reduce((acc, [, user]) => {
          acc[user.userId] = user;
          return acc;
        }, {});
        const cachedUserIds = Object.keys(cachedUsers);
        appendLoadDebugLog('date2.1:cache-hit-or-covered', {
          queryKey,
          idsCount: ids.length,
          cachedCardsCount: cachedCards.length,
          filteredCachedCardsCount: cachedUserIds.length,
          coverage: Boolean(searchKeyCoverageRef.current[serializeQueryFilters(filters)]),
          zeroReason: cachedUserIds.length === 0 ? 'filterMain removed all users from cached query' : null,
        });
        setUsers(cachedUsers);
        setCacheCount(cachedUserIds.length);
        setBackendCount(0);
        setSearchLoading(false);
        setHasMore(false);
        return;
      }

      if (searchIdAndSearchKeyOnlyMode) {
        const baseFilters = {};
        const baseKey = buildListQueryKey('DATE2.1', baseFilters);
        const baseCovered = Boolean(searchKeyCoverageRef.current[serializeQueryFilters(baseFilters)]);
        if (baseCovered) {
          const baseIds = getIdsByQuery(baseKey);
          const baseCards = baseIds.map(id => getCard(id)).filter(Boolean);
          const derivedUsers = filterMain(
            baseCards.map(user => [user.userId, user]),
            'DATE2.1',
            filters,
            favoriteUsersData,
            dislikeUsersData,
            { requireCurrentOrPastGetInTouch: true },
          ).reduce((acc, [, user]) => {
            acc[user.userId] = user;
            return acc;
          }, {});
          const derivedIds = Object.keys(derivedUsers);
          appendLoadDebugLog('date2.1:derived-from-base-cache', {
            baseKey,
            baseIdsCount: baseIds.length,
            baseCardsCount: baseCards.length,
            derivedIdsCount: derivedIds.length,
            zeroReason: derivedIds.length === 0 ? 'filterMain removed all users from covered base cache' : null,
          });
          setIdsForQuery(queryKey, derivedIds);
          setUsers(derivedUsers);
          setCacheCount(derivedIds.length);
          setBackendCount(0);
          setSearchLoading(false);
          setHasMore(false);
          return;
        }
      }

      const loadPromise = searchIdAndSearchKeyOnlyMode
        ? loadMoreUsersSearchKey()
        : loadMoreUsers21();
      loadPromise
        .then(({ cacheCount, backendCount, ignored }) => {
          if (ignored) return;
          setCacheCount(cacheCount);
          setBackendCount(backendCount);
        })
        .finally(() => setSearchLoading(false));
      return;
    }
    if (currentFilter === 'LAST_ACTION') {
      appendLoadDebugLog('reload-effect:branch', { branch: 'LAST_ACTION', loader: 'loadMoreUsersLastAction' });
      loadMoreUsersLastAction()
        .then(({ cacheCount, backendCount }) => {
          setCacheCount(cacheCount);
          setBackendCount(backendCount);
        })
        .finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === LAST_ACTION2_FILTER) {
      appendLoadDebugLog('reload-effect:branch', { branch: LAST_ACTION2_FILTER, loader: 'loadMoreUsersLastAction2' });
      loadMoreUsersLastAction2()
        .then(({ cacheCount, backendCount }) => {
          setCacheCount(cacheCount);
          setBackendCount(backendCount);
        })
        .finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === 'FAVORITE') {
      appendLoadDebugLog('reload-effect:branch', { branch: 'FAVORITE', loader: 'loadFavoriteUsers' });
      loadFavoriteUsers().finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === 'CYCLE_FAVORITE') {
      appendLoadDebugLog('reload-effect:branch', { branch: 'CYCLE_FAVORITE', loader: 'loadCycleFavorites' });
      loadCycleFavorites().finally(() => setSearchLoading(false));
      return;
    }

    const queryKey = buildListQueryKey(currentFilter, filters);
    const ids = getIdsByQuery(queryKey);
    const cards = ids.map(id => getCard(id)).filter(Boolean);
    if (cards.length > 0) {
      appendLoadDebugLog('generic:query-cache-hit', {
        queryKey,
        idsCount: ids.length,
        cardsCount: cards.length,
      });
      const cachedUsers = cards.reduce((acc, u) => {
        acc[u.userId] = u;
        return acc;
      }, {});
      setUsers(cachedUsers);
      setCacheCount(cards.length);
      setBackendCount(0);
      setSearchLoading(false);
    } else {
      appendLoadDebugLog('generic:query-cache-miss', {
        queryKey,
        idsCount: ids.length,
        cardsCount: cards.length,
        loader: 'loadMoreUsers',
      });
      loadMoreUsers(currentFilter)
        .then(({ cacheCount, backendCount }) => {
          setCacheCount(cacheCount);
          setBackendCount(backendCount);
        })
        .finally(() => setSearchLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentFilter, search, loadRequestId, searchIdAndSearchKeyOnlyMode, searchListIsolated]);


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
            enabledSearchKeys: effectiveEnabledSearchKeys,
            cacheScope: { collections: ['newUsers', 'users'] },
          });
          setIdsForQuery(profileSearchCacheKey, [newProfile.userId]);
        }
      }
      cacheFetchedUsers(
        { [newProfile.userId]: newProfile },
        cacheLoad2Users,
        filters,
      );
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
      onViewProfile={() => setShowInfoModal('viewProfile')}
      onExit={handleExit}
      onSelect={() => setShowInfoModal(false)}
    />
  );

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
        navigate('/add');
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
            <p>Видалити профіль?</p>
            <SubmitButton onClick={handleRemoveUser}>Видалити</SubmitButton>
            <SubmitButton onClick={handleCloseModal}>Відмінити</SubmitButton>
          </>
        )}
      </>
    );
  };

  const [compare, setCompare] = useState('');
  const [moreActionsState, setMoreActionsState] = useState({
    user: null,
    cards: [],
    loading: false,
    showLikeDislikeCards: false,
  });
  const moreActionsReturnStateRef = useRef(null);
  const shouldReturnToMoreActionsRef = useRef(false);
  const compareCards = () => {
    return (
      <>
        <p>Порівняти</p>
        {/* <p>{compare}</p> */}
        <div dangerouslySetInnerHTML={{ __html: compare }} />
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
    });
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

    setMoreActionsState(prev => ({ ...prev, loading: true, showLikeDislikeCards: true }));

    try {
      const ownerId = moreActionsState.user.userId;
      const [likesMap, dislikesMap] = await Promise.all([
        fetchFavoriteUsersData(ownerId),
        fetchDislikeUsersData(ownerId),
      ]);

      const merged = {};
      Object.values(likesMap || {}).forEach(item => {
        if (item?.userId) merged[item.userId] = { ...item, _reactionType: 'Like' };
      });
      Object.values(dislikesMap || {}).forEach(item => {
        if (item?.userId) {
          const existing = merged[item.userId];
          merged[item.userId] = {
            ...item,
            _reactionType: existing?._reactionType ? `${existing._reactionType}/Dislike` : 'Dislike',
          };
        }
      });

      const sortedCards = Object.values(merged).sort((a, b) => (b.lastLogin2 || '').localeCompare(a.lastLogin2 || ''));

      setMoreActionsState(prev => ({
        ...prev,
        cards: sortedCards,
      }));
    } catch (error) {
      console.error('Unable to load Like/Dislike cards for user:', error);
      toast.error('Не вдалося завантажити Like/Dislike');
      setMoreActionsState(prev => ({ ...prev, showLikeDislikeCards: false }));
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
            {moreActionsState.cards.length === 0 ? (
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


  const loadMoreUsersLastAction2 = (currentFilters = filters) =>
    loadMoreUsersLastAction2Mode({
      la2StateRef,
      currentFilters,
      currentPage,
      hasMore,
      isEditingRef,
      fetchUserById,
      mergeWithoutOverwrite,
      cacheFetchedUsers,
      setUsers,
      setHasMore,
    });

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


  const loadMoreUsers = async (filterForload, currentFilters = filters) => {
    const includeSpecialFutureDates = searchBarQueryActive;
    appendLoadDebugLog('loadMoreUsers:start', {
      filterForload,
      param: lastKey,
      includeSpecialFutureDates,
      filters: summarizeLoadFiltersForLog(currentFilters),
      hasMore,
    });
    if (isEditingRef.current) {
      appendLoadDebugLog('loadMoreUsers:return-zero', {
        reason: 'isEditingRef.current is true',
        filterForload,
      });
      return { count: 0, hasMore };
    }
    const param = lastKey;
    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    let dislikedUsersMap = Object.fromEntries(
      Object.entries(getDislikes()).filter(([, v]) => v),
    );
    const reactionFilters = currentFilters?.reaction;
    const hasExplicitReactionSelection =
      reactionFilters && Object.values(reactionFilters).some(value => value === false);
    const ownerUid = auth.currentUser?.uid || ownerId;
    if (hasExplicitReactionSelection && ownerUid) {
      if (reactionFilters.like && Object.keys(fav).length === 0) {
        fav = await fetchFavoriteUsers(ownerUid);
        setFavoriteUsersData(fav);
        syncFavorites(fav);
      }
      if (reactionFilters.dislike && Object.keys(dislikedUsersMap).length === 0) {
        dislikedUsersMap = await fetchDislikeUsers(ownerUid);
        setDislikeUsersData(dislikedUsersMap);
        syncDislikes(dislikedUsersMap);
      }
    }
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0 && ownerUid) {
      fav = await fetchFavoriteUsers(ownerUid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }
    appendLoadDebugLog('loadMoreUsers:maps-ready', {
      favoritesCount: countObjectKeys(fav),
      dislikesCount: countObjectKeys(dislikedUsersMap),
      favoriteOnly: Boolean(currentFilters.favorite?.favOnly),
      hasExplicitReactionSelection,
    });

    const res = await fetchPaginatedNewUsers(
      param,
      filterForload,
      currentFilters,
      fav,
      {
        includeSpecialFutureDates,
        dislikedUsers: dislikedUsersMap,
      },
    );
    const rawUsersEntries = res && typeof res.users === 'object' ? Object.entries(res.users) : [];
    appendLoadDebugLog('loadMoreUsers:backend-response', {
      hasResponse: Boolean(res),
      rawUsersCount: rawUsersEntries.length,
      lastKey: res?.lastKey ?? null,
      hasMore: Boolean(res?.hasMore),
      zeroReason: rawUsersEntries.length === 0 ? 'backend returned empty res.users' : null,
    });

    // Перевіряємо, чи є користувачі у відповіді
    if (rawUsersEntries.length > 0) {
      const dropReasons = {};

      // Використовуємо Object.entries для обробки res.users
      const newUsers = rawUsersEntries
        .filter(([id]) => {
          const keep = !currentFilters.favorite?.favOnly || fav[id];
          if (!keep) countLoadFilterDrop(dropReasons, 'favoriteOnly');
          return keep;
        })
        .reduce((acc, [userId, user]) => {
        // Перевірка наявності поля userId, щоб уникнути помилок
        if (user.userId) {
          acc[user.userId] = user; // Додаємо користувача до об'єкта
        } else {
          acc[userId] = user; // Якщо немає userId, використовуйте ключ об'єкта
        }
        return acc;
      }, {});
      cacheFetchedUsers(newUsers, cacheLoad2Users, currentFilters);

      // Оновлюємо стан користувачів
      if (canApplyLoadResultsToUsers()) {
        setUsers(prevUsers => mergeWithoutOverwrite(prevUsers, newUsers));
      }
      const queryKey = buildListQueryKey(filterForload, currentFilters);
      const existingIds = getIdsByQuery(queryKey);
      setIdsForQuery(queryKey, [
        ...new Set([...existingIds, ...Object.keys(newUsers)]),
      ]);
      setLastKey(res.lastKey); // Оновлюємо lastKey для наступного запиту
      setHasMore(res.hasMore); // Оновлюємо hasMore
      const backendCount = Object.keys(newUsers).length;
      appendLoadDebugLog('loadMoreUsers:result', {
        rawUsersCount: rawUsersEntries.length,
        backendCount,
        dropReasons,
        nextLastKey: res.lastKey ?? null,
        hasMore: Boolean(res.hasMore),
        zeroReason: backendCount === 0 ? 'all backend users were removed by current filters' : null,
      });
      return { cacheCount: 0, backendCount, hasMore: res.hasMore };
    } else {
      setHasMore(false); // Якщо немає більше користувачів, оновлюємо hasMore
      appendLoadDebugLog('loadMoreUsers:return-zero', {
        reason: 'backend response has no users',
        filterForload,
        param,
        hasResponse: Boolean(res),
        lastKey: res?.lastKey ?? null,
        hasMore: Boolean(res?.hasMore),
      });
      return { cacheCount: 0, backendCount: 0, hasMore: false };
    }
  };

  const loadMoreUsersGitSimple = async (currentFilters = filters) => {
    appendLoadDebugLog('loadMoreUsersGitSimple:start', {
      queryMode: 'DATE2',
      dateOffset2,
      pageSize: PAGE_SIZE,
      hasMore,
      filters: summarizeLoadFiltersForLog(currentFilters),
    });

    if (isEditingRef.current) {
      appendLoadDebugLog('loadMoreUsersGitSimple:return-zero', {
        reason: 'isEditingRef.current is true',
      });
      return { cacheCount: 0, backendCount: 0, hasMore };
    }

    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    let dislikedUsersMap = Object.fromEntries(
      Object.entries(getDislikes()).filter(([, v]) => v),
    );
    const reactionFilters = currentFilters?.reaction;
    const hasExplicitReactionSelection =
      reactionFilters && Object.values(reactionFilters).some(value => value === false);
    const ownerUid = auth.currentUser?.uid || ownerId;

    if (hasExplicitReactionSelection && ownerUid) {
      if (reactionFilters.like && Object.keys(fav).length === 0) {
        fav = await fetchFavoriteUsers(ownerUid);
        setFavoriteUsersData(fav);
        syncFavorites(fav);
      }
      if (reactionFilters.dislike && Object.keys(dislikedUsersMap).length === 0) {
        dislikedUsersMap = await fetchDislikeUsers(ownerUid);
        setDislikeUsersData(dislikedUsersMap);
        syncDislikes(dislikedUsersMap);
      }
    }
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0 && ownerUid) {
      fav = await fetchFavoriteUsers(ownerUid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }

    const loadedIds = [];
    const loadDropReasons = {};
    appendLoadDebugLog('loadMoreUsersGitSimple:before-fetchFilteredUsersByPage', {
      queryMode: 'DATE2',
      dateOffset2,
      pageSize: PAGE_SIZE,
      filters: summarizeLoadFiltersForLog(currentFilters),
    });
    let res;
    try {
      res = await fetchFilteredUsersByPage(
        dateOffset2,
        undefined,
        id => fetchUserById(id),
        currentFilters,
        fav,
        dislikedUsersMap,
        filterMain,
        partial => {
          const normalizedPartial = Object.entries(partial || {}).reduce((acc, [id, user]) => {
            const userId = user?.userId || id;
            if (!userId) return acc;
            acc[userId] = { ...user, userId };
            return acc;
          }, {});
          const partialIds = Object.keys(normalizedPartial);
          if (!partialIds.length) {
            appendLoadDebugLog('loadMoreUsersGitSimple:progress-empty', {
              queryMode: 'DATE2',
              reason: 'onProgress received no visible users after filterMain',
              dateOffset2,
              targetVisibleCount: PAGE_SIZE,
            });
            return;
          }
          cacheFetchedUsers(normalizedPartial, cacheLoad2Users, currentFilters);
          if (canApplyLoadResultsToUsers()) {
            setUsers(prev => mergeWithoutOverwrite(prev, normalizedPartial));
          } else {
            appendLoadDebugLog('loadMoreUsersGitSimple:apply-blocked', {
              queryMode: 'DATE2',
              isEditing: isEditingRef.current,
              searchListIsolated: searchListIsolationRef.current,
              usersToApply: partialIds.length,
              source: 'progress',
            });
          }
          partialIds.forEach(id => {
            if (!loadedIds.includes(id)) loadedIds.push(id);
          });
          appendLoadDebugLog('loadMoreUsersGitSimple:progress', {
            queryMode: 'DATE2',
            partialCount: partialIds.length,
            loadedIdsCount: loadedIds.length,
            targetVisibleCount: PAGE_SIZE,
          });
        },
        {
          debugLog: (step, payload) => appendLoadDebugLog(step, payload),
        },
      );
      appendLoadDebugLog('loadMoreUsersGitSimple:after-fetchFilteredUsersByPage', {
        queryMode: 'DATE2',
        hasResponse: Boolean(res),
        rawUsersCount: countObjectKeys(res?.users || {}),
        lastKey: res?.lastKey ?? null,
        hasMore: Boolean(res?.hasMore),
      });
    } catch (error) {
      appendLoadDebugLog('loadMoreUsersGitSimple:error', {
        queryMode: 'DATE2',
        message: error?.message || String(error),
        stack: error?.stack || null,
      });
      throw error;
    }

    const backendEntries = Object.entries(res?.users || {});
    const normalizedUsers = backendEntries.reduce((acc, [id, user]) => {
      const userId = user?.userId || id;
      if (!userId) {
        countLoadFilterDrop(loadDropReasons, 'missingUserId');
        return acc;
      }
      acc[userId] = { ...user, userId };
      return acc;
    }, {});
    const backendIds = Object.keys(normalizedUsers);

    cacheFetchedUsers(normalizedUsers, cacheLoad2Users, currentFilters);
    if (canApplyLoadResultsToUsers()) {
      setUsers(prev => mergeWithoutOverwrite(prev, normalizedUsers));
    } else if (backendIds.length) {
      appendLoadDebugLog('loadMoreUsersGitSimple:apply-blocked', {
        queryMode: 'DATE2',
        isEditing: isEditingRef.current,
        searchListIsolated: searchListIsolationRef.current,
        usersToApply: backendIds.length,
        source: 'result',
      });
    }
    backendIds.forEach(id => {
      if (!loadedIds.includes(id)) loadedIds.push(id);
    });

    const nextOffset = Number.isFinite(Number(res?.lastKey)) ? Number(res.lastKey) : dateOffset2 + backendIds.length;
    const nextHasMore = Boolean(res?.hasMore);
    setDateOffset2(nextOffset);
    setHasMore(nextHasMore);

    const queryKey = buildListQueryKey('DATE2', currentFilters);
    const existingIds = getIdsByQuery(queryKey);
    setIdsForQuery(queryKey, [...new Set([...existingIds, ...loadedIds])]);

    appendLoadDebugLog('loadMoreUsersGitSimple:result', {
      queryMode: 'DATE2',
      rawUsersCount: backendEntries.length,
      backendCount: backendIds.length,
      loadedIdsCount: loadedIds.length,
      previousOffset: dateOffset2,
      nextOffset,
      hasMore: nextHasMore,
      targetVisibleCount: PAGE_SIZE,
      stopReason: backendIds.length >= PAGE_SIZE
        ? 'target-visible-reached'
        : nextHasMore
          ? 'partial-page-backend-has-more'
          : 'backend-exhausted',
      dropReasons: loadDropReasons,
      zeroReason: backendIds.length === 0 ? 'backend getInTouch scan produced no accepted users' : null,
    });

    return { cacheCount: 0, backendCount: backendIds.length, hasMore: nextHasMore };
  };

  const loadMoreUsers2 = async (currentFilters = filters) => loadMoreUsersGitSimple(currentFilters);

  const loadMoreUsers21 = async (currentFilters = filters) => {
    return loadMoreUsers2Base(currentFilters, {
      validateGetInTouchDate: false,
      useDateByDateBackendFetch: false,
      queryMode: 'DATE2.1',
    });
  };

  const loadMoreUsersGitNew = async (currentFilters = filters, { targetLoadedCount = PAGE_SIZE, background = false, forceVisibleUpdate = false } = {}) => {
    const filtersKey = serializeQueryFilters(currentFilters);
    const activeFiltersKey = () => serializeQueryFilters(filtersRef.current);
    const queryKey = buildListQueryKey('GITnew', currentFilters);
    const requestedCount = Math.max(PAGE_SIZE, Number(targetLoadedCount) || PAGE_SIZE);
    const cachedIds = getIdsByQuery(queryKey);
    const cachedCards = cachedIds.map(id => getCard(id)).filter(Boolean);
    const { visibleUsers: visibleCachedCards, droppedIds: droppedCachedIds } = filterGitNewVisibleUsers(
      queryKey,
      cachedCards.reduce((acc, user) => {
        if (user?.userId) acc[user.userId] = user;
        return acc;
      }, {}),
    );
    const visibleCachedUsers = Object.values(visibleCachedCards);

    if (visibleCachedUsers.length >= requestedCount || (!hasMore && visibleCachedUsers.length > 0)) {
      const cachedUsers = visibleCachedUsers.slice(0, requestedCount).reduce((acc, user) => {
        acc[user.userId] = user;
        return acc;
      }, {});
      if (!searchListIsolationRef.current && (!isEditingRef.current || forceVisibleUpdate)) setUsers(prev => mergeWithoutOverwrite(prev, cachedUsers));
      appendLoadDebugLog('loadMoreUsersGitNew:query-cache-hit', {
        queryKey,
        cachedIdsCount: cachedIds.length,
        cachedCardsCount: cachedCards.length,
        visibleCachedCardsCount: visibleCachedUsers.length,
        droppedFutureGetInTouchCount: droppedCachedIds.length,
        requestedCount,
        hasMore,
        forceVisibleUpdate,
      });
      return {
        cacheCount: Object.keys(cachedUsers).length,
        backendCount: 0,
        hasMore,
      };
    }

    if (gitNewPendingLoadsRef.current[queryKey]) {
      appendLoadDebugLog('loadMoreUsersGitNew:reuse-pending', {
        queryKey,
        requestedCount,
        cachedIdsCount: cachedIds.length,
        forceVisibleUpdate,
      });

      if (!forceVisibleUpdate) return gitNewPendingLoadsRef.current[queryKey];

      return gitNewPendingLoadsRef.current[queryKey].then(result => {
        const pendingIds = getIdsByQuery(queryKey);
        const pendingCards = pendingIds.map(id => getCard(id)).filter(Boolean);
        const { visibleUsers } = filterGitNewVisibleUsers(
          queryKey,
          pendingCards.reduce((acc, user) => {
            if (user?.userId) acc[user.userId] = user;
            return acc;
          }, {}),
        );
        const visibleSlice = Object.values(visibleUsers).slice(0, requestedCount).reduce((acc, user) => {
          acc[user.userId] = user;
          return acc;
        }, {});
        if (!searchListIsolationRef.current && (!isEditingRef.current || forceVisibleUpdate)) {
          setUsers(prev => mergeWithoutOverwrite(prev, visibleSlice));
        }
        return result;
      });
    }

    const cursor = lastKey21 ?? dateOffset21;
    const beforeIds = getIdsByQuery(queryKey);
    appendLoadDebugLog('loadMoreUsersGitNew:start', {
      queryKey,
      cursor,
      limit: PAGE_SIZE,
      requestedCount,
      background,
      forceVisibleUpdate,
      cachedIdsCount: beforeIds.length,
      filters: summarizeLoadFiltersForLog(currentFilters),
    });

    gitNewPendingLoadsRef.current[queryKey] = fetchUsersBySearchKeyGitNewPaged({
      filterSettings: currentFilters,
      offset: cursor,
      limit: PAGE_SIZE,
      favoritesMap: favoriteUsersData,
      dislikedMap: dislikeUsersData,
      debug: (step, payload) => appendLoadDebugLog(step, payload),
      onProgress: partialUsers => {
        if (filtersKey !== activeFiltersKey()) return;
        const normalizedPartialUsers = appendGitNewUsersToQuery(queryKey, partialUsers);
        const { visibleUsers: visiblePartialUsers, droppedIds: droppedPartialIds } = filterGitNewVisibleUsers(
          queryKey,
          normalizedPartialUsers,
        );
        cacheFetchedUsers(visiblePartialUsers, cacheLoad2Users, currentFilters);
        if (!searchListIsolationRef.current && (!isEditingRef.current || forceVisibleUpdate)) {
          setUsers(prev => mergeWithoutOverwrite(prev, visiblePartialUsers));
        }
        appendLoadDebugLog('loadMoreUsersGitNew:progress', {
          queryKey,
          partialCount: countObjectKeys(visiblePartialUsers),
          droppedFutureGetInTouchCount: droppedPartialIds.length,
          queryIdsCount: getIdsByQuery(queryKey).length,
          requestedCount,
          forceVisibleUpdate,
        });
      },
    })
      .then(res => {
        if (filtersKey !== activeFiltersKey()) {
          return { cacheCount: 0, backendCount: 0, hasMore, ignored: true };
        }

        const normalizedUsers = appendGitNewUsersToQuery(queryKey, res?.users || {});
        const { visibleUsers, droppedIds } = filterGitNewVisibleUsers(queryKey, normalizedUsers);
        cacheFetchedUsers(visibleUsers, cacheLoad2Users, currentFilters);
        if (!searchListIsolationRef.current && (!isEditingRef.current || forceVisibleUpdate)) setUsers(prev => mergeWithoutOverwrite(prev, visibleUsers));

        const afterIds = getIdsByQuery(queryKey);
        const backendCount = Math.max(0, afterIds.length - beforeIds.length);
        setLastKey21(res?.lastKey ?? null);
        setDateOffset21(res?.lastKey ?? 0);
        setHasMore(Boolean(res?.hasMore));
        appendLoadDebugLog('loadMoreUsersGitNew:result', {
          queryKey,
          backendCount,
          usersCount: countObjectKeys(visibleUsers),
          droppedFutureGetInTouchCount: droppedIds.length,
          queryIdsCount: afterIds.length,
          loadedIdsCount: Array.isArray(res?.loadedIds) ? res.loadedIds.length : 0,
          nextCursor: res?.lastKey ?? null,
          hasMore: Boolean(res?.hasMore),
          background,
          forceVisibleUpdate,
        });
        return { cacheCount: 0, backendCount, hasMore: Boolean(res?.hasMore) };
      })
      .finally(() => {
        delete gitNewPendingLoadsRef.current[queryKey];
      });

    return gitNewPendingLoadsRef.current[queryKey];
  };

  const loadMoreUsersSearchKey = async (currentFilters = filters) => {
    appendLoadDebugLog('loadMoreUsersSearchKey:start', {
      offset: lastKey21 ?? dateOffset21,
      limit: PAGE_SIZE,
      filters: summarizeLoadFiltersForLog(currentFilters),
      hasMore,
    });
    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    let dislikedUsersMap = Object.fromEntries(
      Object.entries(getDislikes()).filter(([, v]) => v),
    );
    const reactionFilters = currentFilters?.reaction;
    const hasExplicitReactionSelection =
      reactionFilters && Object.values(reactionFilters).some(value => value === false);
    const ownerUid = auth.currentUser?.uid || ownerId;
    if (hasExplicitReactionSelection && ownerUid) {
      if (reactionFilters.like && Object.keys(fav).length === 0) {
        fav = await fetchFavoriteUsers(ownerUid);
        setFavoriteUsersData(fav);
        syncFavorites(fav);
      }
      if (reactionFilters.dislike && Object.keys(dislikedUsersMap).length === 0) {
        dislikedUsersMap = await fetchDislikeUsers(ownerUid);
        setDislikeUsersData(dislikedUsersMap);
        syncDislikes(dislikedUsersMap);
      }
    }
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0 && ownerUid) {
      fav = await fetchFavoriteUsers(ownerUid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }

    if (isSingleReactionSelection(currentFilters?.reaction, 'dislike')) {
      appendLoadDebugLog('loadMoreUsersSearchKey:delegate-disliked-cards', {
        reason: 'single dislike reaction selection',
      });
      return showDislikedCards();
    }

    if (isEditingRef.current) {
      appendLoadDebugLog('loadMoreUsersSearchKey:return-zero', {
        reason: 'isEditingRef.current is true',
      });
      return { cacheCount: 0, backendCount: 0, hasMore };
    }

    appendLoadDebugLog('loadMoreUsersSearchKey:maps-ready', {
      favoritesCount: countObjectKeys(fav),
      dislikesCount: countObjectKeys(dislikedUsersMap),
      favoriteOnly: Boolean(currentFilters.favorite?.favOnly),
      hasExplicitReactionSelection,
    });

    const fetchOffset = lastKey21 ?? dateOffset21;
    const fetchLimit = PAGE_SIZE;
    const filtersKey = serializeQueryFilters(currentFilters);
    let res;

    appendLoadDebugLog('loadMoreUsersSearchKey:before-fetchUsersBySearchKeyBloodPaged', {
      offset: fetchOffset,
      limit: fetchLimit,
      hasMore,
      filters: summarizeLoadFiltersForLog(currentFilters),
      filtersKey,
      search,
      dateOffset21,
      lastKey21,
    });

    try {
      res = await fetchUsersBySearchKeyBloodPaged({
        filterSettings: currentFilters,
        offset: fetchOffset,
        limit: fetchLimit,
        favoritesMap: fav,
        dislikedMap: dislikedUsersMap,
        debug: (step, payload) => appendLoadDebugLog(step, payload),
        onProgress: partial => {
          if (filtersKey !== serializeQueryFilters(filtersRef.current)) return;
          cacheFetchedUsers(partial, cacheLoad2Users, currentFilters);
          if (canApplyLoadResultsToUsers()) {
            setUsers(prev => mergeWithoutOverwrite(prev, partial));
          }
        },
      });

      const responseUsers = res?.users || {};
      const responseUserIds = Object.entries(responseUsers).map(([id, user]) => user?.userId || id);
      appendLoadDebugLog('loadMoreUsersSearchKey:after-fetchUsersBySearchKeyBloodPaged', {
        hasResponse: Boolean(res),
        rawUsersCount: Object.keys(responseUsers).length,
        usersCount: Object.keys(responseUsers).length,
        loadedIdsCount: Array.isArray(res?.loadedIds) ? res.loadedIds.length : 0,
        loadedIdsSample: Array.isArray(res?.loadedIds) ? res.loadedIds.slice(0, 10) : [],
        usersIdsSample: responseUserIds.slice(0, 10),
        lastKey: res?.lastKey ?? null,
        hasMore: Boolean(res?.hasMore),
        fullResponseKeys: res && typeof res === 'object' ? Object.keys(res) : [],
      });
    } catch (error) {
      appendLoadDebugLog('loadMoreUsersSearchKey:error-fetchUsersBySearchKeyBloodPaged', {
        message: error?.message || String(error),
        stack: error?.stack || null,
        name: error?.name || null,
        filters: summarizeLoadFiltersForLog(currentFilters),
        currentFilters: summarizeLoadFiltersForLog(currentFilters),
        offset: fetchOffset,
        limit: fetchLimit,
      });
      throw error;
    }

    if (filtersKey !== serializeQueryFilters(filtersRef.current)) {
      appendLoadDebugLog('loadMoreUsersSearchKey:ignore-stale-response', {
        requestFiltersKey: filtersKey,
        activeFiltersKey: serializeQueryFilters(filtersRef.current),
      });
      return { cacheCount: 0, backendCount: 0, hasMore, ignored: true };
    }

    const searchKeyRawEntries = Object.entries(res?.users || {});
    const searchKeyDropReasons = {};
    appendLoadDebugLog('loadMoreUsersSearchKey:backend-response', {
      rawUsersCount: searchKeyRawEntries.length,
      lastKey: res?.lastKey ?? null,
      hasMore: Boolean(res?.hasMore),
      zeroReason: searchKeyRawEntries.length === 0 ? 'searchKey backend returned empty users' : null,
    });

    const normalizedUsers = searchKeyRawEntries.reduce((acc, [id, user]) => {
      const targetId = user?.userId || id;
      if (!targetId || !user) {
        countLoadFilterDrop(searchKeyDropReasons, 'invalidUser');
        return acc;
      }
      // fetchUsersBySearchKeyBloodPaged вже повертає картки після filterMain.
      // Не запускаємо повторно ту саму перевірку для кожної картки у UI.
      acc[targetId] = { ...user, userId: targetId };
      return acc;
    }, {});

    cacheFetchedUsers(normalizedUsers, cacheLoad2Users, currentFilters);
    if (canApplyLoadResultsToUsers()) {
      setUsers(prev => mergeWithoutOverwrite(prev, normalizedUsers));
    }

    const queryKey = buildListQueryKey('DATE2.1', currentFilters);
    const existingIds = getIdsByQuery(queryKey);
    setIdsForQuery(queryKey, [...new Set([...existingIds, ...Object.keys(normalizedUsers)])]);

    const backendCount = Object.keys(normalizedUsers).length;
    appendLoadDebugLog('loadMoreUsersSearchKey:result', {
      rawUsersCount: searchKeyRawEntries.length,
      backendCount,
      dropReasons: searchKeyDropReasons,
      nextLastKey: res?.lastKey ?? null,
      hasMore: Boolean(res?.hasMore),
      zeroReason: backendCount === 0
        ? searchKeyRawEntries.length === 0
          ? 'backend returned 0 users'
          : 'all searchKey backend users were removed by filters'
        : null,
    });
    setLastKey21(res?.lastKey ?? null);
    setDateOffset21(prev => prev + backendCount);
    setHasMore(Boolean(res?.hasMore));
    if (res?.hasMore === false) {
      searchKeyCoverageRef.current[filtersKey] = true;
    }

    return { cacheCount: 0, backendCount, hasMore: Boolean(res?.hasMore) };
  };

  const loadMoreUsers2Base = async (
    currentFilters = filters,
    {
      validateGetInTouchDate = true,
      useDateByDateBackendFetch = true,
      queryMode = 'DATE2',
    } = {},
  ) => {
    appendLoadDebugLog('loadMoreUsers2Base:start', {
      queryMode,
      validateGetInTouchDate,
      useDateByDateBackendFetch,
      dateOffset2,
      dateOffset21,
      lastKey21,
      hasMore,
      filters: summarizeLoadFiltersForLog(currentFilters),
    });
    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    let dislikedUsersMap = Object.fromEntries(
      Object.entries(getDislikes()).filter(([, v]) => v),
    );
    const reactionFilters = currentFilters?.reaction;
    const hasExplicitReactionSelection =
      reactionFilters && Object.values(reactionFilters).some(value => value === false);
    const ownerUid = auth.currentUser?.uid || ownerId;
    if (hasExplicitReactionSelection && ownerUid) {
      if (reactionFilters.like && Object.keys(fav).length === 0) {
        fav = await fetchFavoriteUsers(ownerUid);
        setFavoriteUsersData(fav);
        syncFavorites(fav);
      }
      if (reactionFilters.dislike && Object.keys(dislikedUsersMap).length === 0) {
        dislikedUsersMap = await fetchDislikeUsers(ownerUid);
        setDislikeUsersData(dislikedUsersMap);
        syncDislikes(dislikedUsersMap);
      }
    }
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0 && ownerUid) {
      fav = await fetchFavoriteUsers(ownerUid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }

    if (isEditingRef.current) {
      appendLoadDebugLog('loadMoreUsers2Base:return-zero', {
        queryMode,
        reason: 'isEditingRef.current is true',
      });
      return { cacheCount: 0, backendCount: 0, hasMore };
    }

    appendLoadDebugLog('loadMoreUsers2Base:maps-ready', {
      queryMode,
      favoritesCount: countObjectKeys(fav),
      dislikesCount: countObjectKeys(dislikedUsersMap),
      favoriteOnly: Boolean(currentFilters.favorite?.favOnly),
      hasExplicitReactionSelection,
    });


    const { cards: cachedArr, fromCache } = await getLoad2Cards(
      currentFilters,
      id => fetchUserById(id),
    );
    let cacheCount = 0;
    let backendCount = 0;

    const today = new Date().toISOString().split('T')[0];
    const isValid = d => {
      if (!d) return true;
      if (d === '2099-99-99' || d === '9999-99-99') {
        return true;
      }
      return !/^\d{4}-\d{2}-\d{2}$/.test(d) || d <= today;
    };
    const cacheDropReasons = {};
    const filteredArr = cachedArr.filter(u => {
      if (validateGetInTouchDate && !isValid(u.getInTouch)) {
        countLoadFilterDrop(cacheDropReasons, 'getInTouch');
        return false;
      }
      if (currentFilters.favorite?.favOnly && !fav[u.userId]) {
        countLoadFilterDrop(cacheDropReasons, 'favoriteOnly');
        return false;
      }
      if (!passesReactionFilter(u, currentFilters?.reaction, fav, dislikedUsersMap)) {
        countLoadFilterDrop(cacheDropReasons, 'reaction');
        return false;
      }
      return true;
    });

    let offset = useDateByDateBackendFetch ? dateOffset2 : dateOffset21;
    appendLoadDebugLog('loadMoreUsers2Base:cache-filtered', {
      queryMode,
      fromCache,
      cachedCount: cachedArr.length,
      filteredCount: filteredArr.length,
      offset,
      pageSize: PAGE_SIZE,
      dropReasons: cacheDropReasons,
      zeroReason: filteredArr.length === 0 && cachedArr.length > 0 ? 'cache users were removed by filters' : null,
    });
    const loadedIds = [];

    const slice = filteredArr.slice(offset, offset + PAGE_SIZE);
    appendLoadDebugLog('loadMoreUsers2Base:cache-slice', {
      queryMode,
      offset,
      sliceCount: slice.length,
      filteredCount: filteredArr.length,
      zeroReason: slice.length === 0 && filteredArr.length > 0 ? 'offset is outside filtered cache range' : null,
    });
    if (slice.length > 0) {
      const cachedUsers = slice.reduce((acc, u) => {
        acc[u.userId] = u;
        return acc;
      }, {});
      cacheFetchedUsers(cachedUsers, cacheLoad2Users, currentFilters);
      if (canApplyLoadResultsToUsers()) {
        setUsers(prev => mergeWithoutOverwrite(prev, cachedUsers));
      }
      loadedIds.push(...Object.keys(cachedUsers));
      offset += slice.length;
      if (fromCache) cacheCount += slice.length;
      else backendCount += slice.length;
    }

    let more = filteredArr.length > offset;

    if (!more && slice.length < PAGE_SIZE) {
      if (useDateByDateBackendFetch) {
        appendLoadDebugLog('loadMoreUsers2Base:backend-fetch-filtered-page:start', {
          queryMode,
          offset,
          reason: 'cache does not have enough users for requested page',
        });
        const res = await fetchFilteredUsersByPage(
          offset,
          undefined,
          undefined,
          currentFilters,
          fav,
          dislikedUsersMap,
          undefined,
          partial => {
            const filteredPartial = currentFilters.favorite?.favOnly
              ? Object.fromEntries(Object.entries(partial).filter(([id]) => fav[id]))
              : partial;
            cacheFetchedUsers(filteredPartial, cacheLoad2Users, currentFilters);
            if (canApplyLoadResultsToUsers()) {
              setUsers(prev => mergeWithoutOverwrite(prev, filteredPartial));
            }
            loadedIds.push(...Object.keys(filteredPartial));
            backendCount += Object.keys(filteredPartial).length;
          },
        );

        const backendEntries = Object.entries(res?.users || {});
        appendLoadDebugLog('loadMoreUsers2Base:backend-fetch-filtered-page:response', {
          queryMode,
          rawUsersCount: backendEntries.length,
          lastKey: res?.lastKey ?? null,
          hasMore: Boolean(res?.hasMore),
          zeroReason: backendEntries.length === 0 ? 'fetchFilteredUsersByPage returned empty users' : null,
        });

        if (backendEntries.length > 0) {
          const normalizedUsers = backendEntries.reduce((acc, [userId, user]) => {
            const targetId = user.userId || userId;
            acc[targetId] = { ...user, userId: targetId };
            return acc;
          }, {});

          const backendDropReasons = {};
          const filteredUsers = Object.fromEntries(
            Object.entries(normalizedUsers).filter(([, user]) => {
              if (currentFilters.favorite?.favOnly && !fav[user.userId]) {
                countLoadFilterDrop(backendDropReasons, 'favoriteOnly');
                return false;
              }
              if (validateGetInTouchDate && !isValid(user.getInTouch)) {
                countLoadFilterDrop(backendDropReasons, 'getInTouch');
                return false;
              }
              const keepByReaction = passesReactionFilter(
                user,
                currentFilters?.reaction,
                fav,
                dislikedUsersMap,
              );
              if (!keepByReaction) countLoadFilterDrop(backendDropReasons, 'reaction');
              return keepByReaction;
            }),
          );

          appendLoadDebugLog('loadMoreUsers2Base:backend-fetch-filtered-page:filtered', {
            queryMode,
            rawUsersCount: backendEntries.length,
            filteredCount: countObjectKeys(filteredUsers),
            dropReasons: backendDropReasons,
            zeroReason: countObjectKeys(filteredUsers) === 0 ? 'all fetchFilteredUsersByPage users were removed by filters' : null,
          });

          cacheFetchedUsers(filteredUsers, cacheLoad2Users, currentFilters);
          if (canApplyLoadResultsToUsers()) {
            setUsers(prev => mergeWithoutOverwrite(prev, filteredUsers));
          }
          loadedIds.push(...Object.keys(filteredUsers));
          offset = res.lastKey;
          more = !!res.hasMore;
          backendCount += Object.keys(filteredUsers).length;
        } else {
          more = false;
        }
      } else {
        let nextKey = lastKey21;
        let loadedForPage = slice.length;
        let backendHasMore = true;

        while (loadedForPage < PAGE_SIZE && backendHasMore) {
          appendLoadDebugLog('loadMoreUsers2Base:backend-loop:start', {
            queryMode,
            nextKey,
            loadedForPage,
            pageSize: PAGE_SIZE,
          });
          const res = await fetchPaginatedNewUsers(
            nextKey,
            'DATE3',
            currentFilters,
            fav,
            {
              skipGetInTouchFilter: true,
              dislikedUsers: dislikedUsersMap,
            },
          );

          if (!res || !res.users) {
            appendLoadDebugLog('loadMoreUsers2Base:backend-loop:empty-response', {
              queryMode,
              nextKey,
              hasResponse: Boolean(res),
              responseLastKey: res?.lastKey ?? null,
            });
            backendHasMore = false;
            nextKey = res?.lastKey ?? null;
            break;
          }

          const loopBackendEntries = Object.entries(res.users);
          appendLoadDebugLog('loadMoreUsers2Base:backend-loop:response', {
            queryMode,
            rawUsersCount: loopBackendEntries.length,
            responseLastKey: res.lastKey ?? null,
            responseHasMore: Boolean(res.hasMore),
          });

          const normalizedUsers = loopBackendEntries.reduce((acc, [userId, user]) => {
            const targetId = user.userId || userId;
            acc[targetId] = { ...user, userId: targetId };
            return acc;
          }, {});

          const loopDropReasons = {};
          const filteredUsers = Object.fromEntries(
            Object.entries(normalizedUsers).filter(([, user]) => {
              if (currentFilters.favorite?.favOnly && !fav[user.userId]) {
                countLoadFilterDrop(loopDropReasons, 'favoriteOnly');
                return false;
              }
              if (validateGetInTouchDate && !isValid(user.getInTouch)) {
                countLoadFilterDrop(loopDropReasons, 'getInTouch');
                return false;
              }
              const keepByReaction = passesReactionFilter(
                user,
                currentFilters?.reaction,
                fav,
                dislikedUsersMap,
              );
              if (!keepByReaction) countLoadFilterDrop(loopDropReasons, 'reaction');
              return keepByReaction;
            }),
          );

          const filteredIds = Object.keys(filteredUsers);
          appendLoadDebugLog('loadMoreUsers2Base:backend-loop:filtered', {
            queryMode,
            rawUsersCount: loopBackendEntries.length,
            filteredCount: filteredIds.length,
            dropReasons: loopDropReasons,
            zeroReason: filteredIds.length === 0 ? 'all fetchPaginatedNewUsers DATE3 users were removed by filters' : null,
          });


          if (filteredIds.length > 0) {
            cacheFetchedUsers(filteredUsers, cacheLoad2Users, currentFilters);
            if (canApplyLoadResultsToUsers()) {
              setUsers(prev => mergeWithoutOverwrite(prev, filteredUsers));
            }
            loadedIds.push(...filteredIds);
            backendCount += filteredIds.length;
            loadedForPage += filteredIds.length;
            offset += filteredIds.length;
          }

          nextKey = res.lastKey ?? null;
          backendHasMore = !!res.hasMore && nextKey !== null;
        }

        more = backendHasMore;
        setLastKey21(nextKey);
      }
    }

    if (useDateByDateBackendFetch) {
      setDateOffset2(offset);
    } else {
      setDateOffset21(offset);
    }
    setHasMore(more);
    appendLoadDebugLog('loadMoreUsers2Base:result', {
      queryMode,
      cacheCount,
      backendCount,
      loadedIdsCount: loadedIds.length,
      offset,
      hasMore: more,
      zeroReason: loadedIds.length === 0
        ? 'cache slice and backend fetch produced no accepted users'
        : null,
    });
    const queryKey = buildListQueryKey(queryMode, currentFilters);
    const existingIds = getIdsByQuery(queryKey);
    setIdsForQuery(queryKey, [...new Set([...existingIds, ...loadedIds])]);
    return { cacheCount, backendCount, hasMore: more };
  };

  const loadMoreUsersOfline = async (currentFilters = filters, options = {}) => loadMoreUsersOflineMode({
    currentFilters,
    ...options,
    pageSize: PAGE_SIZE,
    hasMore,
    buildListQueryKey,
    serializeQueryFilters,
    getActiveFiltersKey: () => serializeQueryFilters(filtersRef.current),
    getMergedUsersFromLocalExportCollections,
    filterMain,
    favoriteUsersData,
    dislikeUsersData,
    fetchUsersByIds,
    cacheFetchedUsers,
    cacheLoad2Users,
    setIdsForQuery,
    canApplyLoadResultsToUsers,
    setUsers,
    mergeWithoutOverwrite,
    setDateOffset21,
    setHasMore,
    appendLoadDebugLog,
    summarizeLoadFiltersForLog,
    toast,
  });

  const loadMoreUsersLastAction = async (currentFilters = filters) => {
    appendLoadDebugLog('loadMoreUsersLastAction:start', {
      dateOffsetLA,
      hasMore,
      filters: summarizeLoadFiltersForLog(currentFilters),
    });
    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    let dislikedUsersMap = Object.fromEntries(
      Object.entries(getDislikes()).filter(([, v]) => v),
    );
    const reactionFilters = currentFilters?.reaction;
    const hasExplicitReactionSelection =
      reactionFilters && Object.values(reactionFilters).some(value => value === false);
    const ownerUid = auth.currentUser?.uid || ownerId;
    if (hasExplicitReactionSelection && ownerUid) {
      if (reactionFilters.like && Object.keys(fav).length === 0) {
        fav = await fetchFavoriteUsers(ownerUid);
        setFavoriteUsersData(fav);
        syncFavorites(fav);
      }
      if (reactionFilters.dislike && Object.keys(dislikedUsersMap).length === 0) {
        dislikedUsersMap = await fetchDislikeUsers(ownerUid);
        setDislikeUsersData(dislikedUsersMap);
        syncDislikes(dislikedUsersMap);
      }
    }
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0 && ownerUid) {
      fav = await fetchFavoriteUsers(ownerUid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }

    if (isEditingRef.current) {
      appendLoadDebugLog('loadMoreUsersLastAction:return-zero', {
        reason: 'isEditingRef.current is true',
      });
      return { cacheCount: 0, backendCount: 0, hasMore };
    }

    appendLoadDebugLog('loadMoreUsersLastAction:maps-ready', {
      favoritesCount: countObjectKeys(fav),
      dislikesCount: countObjectKeys(dislikedUsersMap),
      favoriteOnly: Boolean(currentFilters.favorite?.favOnly),
      hasExplicitReactionSelection,
    });


    const { cards: cachedArr, fromCache } = await getLoad2Cards(
      currentFilters,
      id => fetchUserById(id),
    );
    const sortedCachedArr = [...cachedArr].sort(
      (a, b) => normalizeLastAction(b?.lastAction) - normalizeLastAction(a?.lastAction),
    );

    let cacheCount = 0;
    let backendCount = 0;

    const slice = sortedCachedArr.slice(dateOffsetLA, dateOffsetLA + PAGE_SIZE);
    appendLoadDebugLog('loadMoreUsersLastAction:cache-slice', {
      fromCache,
      cachedCount: cachedArr.length,
      sortedCachedCount: sortedCachedArr.length,
      dateOffsetLA,
      sliceCount: slice.length,
      zeroReason: slice.length === 0 && sortedCachedArr.length > 0 ? 'dateOffsetLA is outside sorted cache range' : null,
    });
    if (slice.length > 0) {
      const cachedUsers = slice.reduce((acc, user) => {
        acc[user.userId] = user;
        return acc;
      }, {});

      cacheFetchedUsers(cachedUsers, cacheLoad2Users, currentFilters);
      if (canApplyLoadResultsToUsers()) {
        setUsers(prev => mergeWithoutOverwrite(prev, cachedUsers));
      }
      if (fromCache) cacheCount += slice.length;
      else backendCount += slice.length;
    }

    const hasCachedMore = sortedCachedArr.length > dateOffsetLA + slice.length;
    if (slice.length === PAGE_SIZE || hasCachedMore) {
      const nextOffset = dateOffsetLA + slice.length;
      setDateOffsetLA(nextOffset);
      setHasMore(hasCachedMore);
      appendLoadDebugLog('loadMoreUsersLastAction:result-from-cache', {
        cacheCount,
        backendCount,
        hasMore: hasCachedMore,
        nextOffset,
      });
      return { cacheCount, backendCount, hasMore: hasCachedMore };
    }

    const backendOffset = dateOffsetLA + slice.length;
    const loadLastActionFilteredPage = async ({
      targetCount = PAGE_SIZE,
      startOffset = backendOffset,
      startDateOffsetLA = backendOffset,
    }) => {
      const collected = {};
      let cursor = Number.isFinite(startOffset) ? startOffset : 0;
      let dateOffset = Number.isFinite(startDateOffsetLA) ? startDateOffsetLA : cursor;
      let hasMoreLA = true;
      let guard = 0;

      while (Object.keys(collected).length < targetCount && hasMoreLA && guard < 200) {
        guard += 1;
        // В LAST_ACTION завжди тягнемо RAW batch без checkbox-фільтрів, а потім фільтруємо локально.
        // eslint-disable-next-line no-await-in-loop
        const rawBatch = await fetchUsersByLastActionPaged(
          cursor,
          PAGE_SIZE,
          undefined,
          id => fetchUserById(id),
          {},
          fav,
          dislikedUsersMap,
          filterMain
        );
        const rawEntries = Object.entries(rawBatch?.users || {});
        const filteredEntries = filterMain(
          rawEntries,
          'LAST_ACTION',
          currentFilters,
          fav,
          dislikedUsersMap,
        );

        filteredEntries.forEach(([id, user]) => {
          if (!collected[id]) {
            collected[id] = user;
          }
        });

        const nextCursor = Number.isFinite(rawBatch?.lastKey) ? rawBatch.lastKey : cursor + rawEntries.length;
        cursor = nextCursor;
        dateOffset = nextCursor;
        hasMoreLA = Boolean(rawBatch?.hasMore);

        appendLoadDebugLog('loadMoreUsersLastAction:checkbox-batch', {
          rawUsersCount: rawEntries.length,
          filteredCount: filteredEntries.length,
          hasMore: hasMoreLA,
          cursor,
          dateOffset,
          lastKey: rawBatch?.lastKey ?? null,
          visibleCount: Object.keys(collected).length,
          zeroReason: rawEntries.length > 0 && filteredEntries.length === 0 ? 'filterMain removed LAST_ACTION batch' : null,
        });
        const debugMessage = `[LA][checkbox] raw=${rawEntries.length}, filtered=${filteredEntries.length}, next=${hasMoreLA}, cursor=${cursor}, dateOffset=${dateOffset}, lastKey=${rawBatch?.lastKey ?? 'n/a'}, visible=${Object.keys(collected).length}`;
        console.info(debugMessage);
        toast(debugMessage, { duration: 1800 });

        if (rawEntries.length === 0 && !hasMoreLA) break;
      }

      return { users: collected, cursor, dateOffsetLA: dateOffset, hasMore: hasMoreLA };
    };

    const hasCheckboxFilters = Object.values(currentFilters || {}).some(value => {
      if (!value || value === 'off') return false;
      if (typeof value === 'object') return Object.values(value).some(Boolean);
      return true;
    });
    const res = hasCheckboxFilters
      ? await loadLastActionFilteredPage({
          targetCount: PAGE_SIZE,
          startOffset: backendOffset,
          startDateOffsetLA: backendOffset,
        })
      : await fetchUsersByLastActionPaged(
          backendOffset,
          PAGE_SIZE,
          undefined,
          id => fetchUserById(id),
          currentFilters,
          fav,
          dislikedUsersMap,
          filterMain
        );

    const lastActionRawCount = countObjectKeys(res?.users);
    appendLoadDebugLog('loadMoreUsersLastAction:backend-response', {
      hasCheckboxFilters,
      backendOffset,
      rawUsersCount: lastActionRawCount,
      lastKey: res?.lastKey ?? null,
      dateOffsetLA: res?.dateOffsetLA ?? null,
      hasMore: Boolean(res?.hasMore),
      zeroReason: lastActionRawCount === 0 ? 'LAST_ACTION backend returned empty users' : null,
    });

    if (res && Object.keys(res.users || {}).length > 0) {
      const filteredUsers = currentFilters.favorite?.favOnly
        ? Object.fromEntries(Object.entries(res.users).filter(([id]) => fav[id]))
        : res.users;
      cacheFetchedUsers(filteredUsers, cacheLoad2Users, currentFilters);
      if (canApplyLoadResultsToUsers()) {
        setUsers(prev => mergeWithoutOverwrite(prev, filteredUsers));
      }
      const nextOffset = Number.isFinite(res.dateOffsetLA) ? res.dateOffsetLA : res.lastKey;
      setDateOffsetLA(nextOffset);
      setHasMore(res.hasMore);
      backendCount += Object.keys(filteredUsers).length;
      appendLoadDebugLog('loadMoreUsersLastAction:result', {
        rawUsersCount: lastActionRawCount,
        filteredCount: countObjectKeys(filteredUsers),
        cacheCount,
        backendCount,
        hasMore: Boolean(res.hasMore),
        zeroReason: countObjectKeys(filteredUsers) === 0 ? 'favoriteOnly removed all LAST_ACTION users' : null,
      });
      return { cacheCount, backendCount, hasMore: res.hasMore };
    }

    setHasMore(false);
    appendLoadDebugLog('loadMoreUsersLastAction:return-zero', {
      reason: 'cache and backend produced no users',
      sliceCount: slice.length,
      backendOffset,
      lastActionRawCount,
    });
    if (slice.length > 0) {
      setDateOffsetLA(prev => prev + slice.length);
    }
    return { cacheCount, backendCount, hasMore: false };
  };

  const getGitNewQueryCardsCount = (currentFilters = filters) => {
    const queryKey = buildListQueryKey('GITnew', currentFilters);
    const cards = getIdsByQuery(queryKey).map(id => getCard(id)).filter(Boolean);
    const { visibleUsers } = filterGitNewVisibleUsers(
      queryKey,
      cards.reduce((acc, user) => {
        if (user?.userId) acc[user.userId] = user;
        return acc;
      }, {}),
    );

    return Object.keys(visibleUsers).length;
  };

  const ensureGitNewLoadedCount = async (needed, currentFilters = filters, options = {}) => {
    let more = hasMore;
    let previousCardsCount = getGitNewQueryCardsCount(currentFilters);

    while (more && previousCardsCount < needed) {
      const result = await loadMoreUsersGitNew(currentFilters, { targetLoadedCount: needed, background: true, ...options });
      if (result?.ignored) return result;

      const nextCardsCount = getGitNewQueryCardsCount(currentFilters);
      more = Boolean(result?.hasMore);
      if (nextCardsCount <= previousCardsCount) break;
      previousCardsCount = nextCardsCount;
    }

    return { hasMore: more };
  };

  const handlePageChange = async page => {
    const needed = page * PAGE_SIZE;
    let loaded = Object.keys(users).length;
    let more = hasMore;
    let cacheLoaded = 0;
    let backendLoaded = 0;

    if (currentFilter === 'GITnew') {
      setCurrentPage(page);
      setCacheCount(0);
      setBackendCount(0);
      if (more && loaded < needed) {
        ensureGitNewLoadedCount(needed, filters)
          .then(({ ignored } = {}) => {
            if (!ignored) {
              appendLoadDebugLog('handlePageChange:gitNew-background-loaded', { page, needed });
            }
          })
          .catch(error => {
            appendLoadDebugLog('handlePageChange:gitNew-background-error', {
              page,
              needed,
              message: error?.message || String(error),
            });
          });
      }
      return;
    }

    while (more && loaded < needed) {
      const { cacheCount, backendCount, hasMore: nextMore, ignored } =
        currentFilter === 'DATE2'
          ? await loadMoreUsers2()
          : currentFilter === 'GITnew'
          ? await loadMoreUsersGitNew()
          : currentFilter === 'DATE2.1'
          ? searchIdAndSearchKeyOnlyMode
            ? await loadMoreUsersSearchKey()
            : await loadMoreUsers21()
          : currentFilter === OFFLINE_LOAD_FILTER
          ? await loadMoreUsersOfline()
          : currentFilter === 'LAST_ACTION'
          ? await loadMoreUsersLastAction()
          : currentFilter === LAST_ACTION2_FILTER
          ? await loadMoreUsersLastAction2()
          : await loadMoreUsers(currentFilter);
      if (ignored) return;
      cacheLoaded += cacheCount;
      backendLoaded += backendCount;
      loaded += cacheCount + backendCount;
      more = nextMore;
      if (cacheCount + backendCount === 0 && nextMore) {
        more = false;
      }
    }
    setCacheCount(cacheLoaded);
    setBackendCount(backendLoaded);
    setCurrentPage(page);
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

  const getMergedUsersFromLocalExportCollections = useCallback(() => {
    if (!localExportUsersData || !localExportNewUsersData) return null;
    const usersData = localExportUsersData || {};
    const newUsersData = localExportNewUsersData || {};
    const allUserIds = new Set([...Object.keys(newUsersData), ...Object.keys(usersData)]);
    const allUsersArray = Array.from(allUserIds).map(userId => {
      const newUserRaw = newUsersData[userId] || {};
      return [
        userId,
        {
          userId,
          ...(usersData[userId] || {}),
          ...newUserRaw,
        },
      ];
    });
    return Object.fromEntries(allUsersArray);
  }, [localExportNewUsersData, localExportUsersData]);

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
      loadedUsers = getMergedUsersFromLocalExportCollections();
      if (!loadedUsers) {
        toast.error('Оберіть локальні users.json та newUsers.json для експорту');
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
    getMergedUsersFromLocalExportCollections,
    hasPhoneStartingWith38,
  ]);

  const saveAllContacts = async () => {
    const res = await getExportContactsBySource({}, favoriteUsersData);
    if (!res) return;
    saveContactsBySelectedFormat(res);
  };

  const fetchAndMergeFavoriteUsers = useCallback(async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return null;

    await loadFavoriteIdsOnce(owner);

    const { cards: cachedArr, fromCache } = await getFavoriteCards(
      id => fetchUserById(id),
    );
    let cacheCount = fromCache ? cachedArr.length : 0;
    let backendCount = fromCache ? 0 : cachedArr.length;

    const loaded = cachedArr.reduce((acc, user) => {
      if (user?.userId) {
        acc[user.userId] = user;
      }
      return acc;
    }, {});

    const favIds = getFavorites();
    const favoriteQueryIds = getIdsByQuery('favorite');

    favoriteQueryIds.forEach(id => {
      if (id) {
        favIds[id] = true;
      }
    });

    const normalizedFavs = Object.fromEntries(
      Object.entries(favIds).filter(([, value]) => value),
    );

    syncFavorites(normalizedFavs);
    setFavoriteUsersData(normalizedFavs);
    setFavoriteIds(normalizedFavs);

    cacheFetchedUsers(loaded, cacheFavoriteUsers);
    setIdsForQuery('favorite', Object.keys(normalizedFavs));

    return { loaded, normalizedFavs, cacheCount, backendCount };
  }, [cacheFetchedUsers, loadFavoriteIdsOnce, setFavoriteUsersData]);

  const resetReactionUsersState = useCallback(() => {
    setUsers({});
    setHasMore(false);
    setLastKey(null);
    setCurrentPage(1);
    setCacheCount(0);
    setBackendCount(0);

    return { users: {}, ids: [], cacheCount: 0, backendCount: 0 };
  }, []);

  const presentReactionUsers = useCallback(
    ({
      loadedUsers = {},
      reactionIds = {},
      favoritesMap = {},
      dislikedMap = {},
      cacheCount = 0,
      backendCount = 0,
    }) => {
      const sortedUsers = Object.keys(reactionIds)
        .map(id => loadedUsers[id])
        .filter(Boolean)
        .sort((a, b) => compareUsersByGetInTouch(a, b));

      const filterMode = currentFilter || 'DATE2';
      const filteredUsers = filterMain(
        sortedUsers.map(user => [user.userId, user]),
        filterMode,
        filters,
        favoritesMap,
        dislikedMap,
      ).map(([, user]) => user);

      const normalized = filteredUsers.reduce((acc, user) => {
        acc[user.userId] = user;
        return acc;
      }, {});

      const ids = filteredUsers.map(user => user.userId);

      setUsers(normalized);
      setHasMore(false);
      setLastKey(null);
      setCurrentPage(1);
      setCacheCount(cacheCount);
      setBackendCount(backendCount);

      return { users: normalized, ids, cacheCount, backendCount };
    }, [
      compareUsersByGetInTouch,
      currentFilter,
      filters,
      setBackendCount,
      setCacheCount,
      setCurrentPage,
      setHasMore,
      setLastKey,
      setUsers,
    ],
  );

  const showFavoriteCards = useCallback(async () => {
    const result = await fetchAndMergeFavoriteUsers();
    if (!result) {
      return resetReactionUsersState();
    }

    const { loaded, normalizedFavs, cacheCount, backendCount } = result;

    return presentReactionUsers({
      loadedUsers: loaded,
      reactionIds: normalizedFavs,
      favoritesMap: { ...favoriteUsersData, ...normalizedFavs },
      dislikedMap: { ...dislikeUsersData },
      cacheCount,
      backendCount,
    });
  }, [
    fetchAndMergeFavoriteUsers,
    presentReactionUsers,
    favoriteUsersData,
    dislikeUsersData,
    resetReactionUsersState,
  ]);

  const loadFavoriteUsers = async () => showFavoriteCards();

  const fetchAndMergeDislikedUsers = useCallback(async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return null;

    await loadDislikeIdsOnce(owner);

    const { cards: cachedArr, fromCache } = await getDislikedCards(
      id => fetchUserById(id),
    );
    let cacheCount = fromCache ? cachedArr.length : 0;
    let backendCount = fromCache ? 0 : cachedArr.length;

    const loaded = cachedArr.reduce((acc, user) => {
      if (user?.userId) {
        acc[user.userId] = user;
      }
      return acc;
    }, {});

    const dislikedIds = getDislikes();
    const dislikedUsers = await fetchDislikeUsersData(owner);
    Object.entries(dislikedUsers).forEach(([id, user]) => {
      dislikedIds[id] = true;
      if (id && !loaded[id]) {
        loaded[id] = user;
        backendCount += 1;
      }
    });

    const normalizedDislikes = Object.fromEntries(
      Object.entries(dislikedIds).filter(([, value]) => value),
    );

    syncDislikes(normalizedDislikes);
    setDislikeUsersData(normalizedDislikes);

    cacheFetchedUsers(loaded, cacheDislikedUsers);
    setIdsForQuery('dislike', Object.keys(normalizedDislikes));

    return { loaded, normalizedDislikes, cacheCount, backendCount };
  }, [cacheFetchedUsers, loadDislikeIdsOnce, setDislikeUsersData]);

  const isSingleReactionSelection = useCallback((reactionFilters, targetKey) => {
    if (!reactionFilters || typeof reactionFilters !== 'object') return false;
    const selectedKeys = Object.entries(reactionFilters)
      .filter(([, value]) => value)
      .map(([key]) => key);
    return selectedKeys.length === 1 && selectedKeys[0] === targetKey;
  }, []);

  const showDislikedCards = useCallback(async () => {
    const result = await fetchAndMergeDislikedUsers();
    if (!result) {
      return resetReactionUsersState();
    }

    const { loaded, normalizedDislikes, cacheCount, backendCount } = result;

    return presentReactionUsers({
      loadedUsers: loaded,
      reactionIds: normalizedDislikes,
      favoritesMap: { ...favoriteUsersData },
      dislikedMap: { ...dislikeUsersData, ...normalizedDislikes },
      cacheCount,
      backendCount,
    });
  }, [
    dislikeUsersData,
    favoriteUsersData,
    fetchAndMergeDislikedUsers,
    presentReactionUsers,
    resetReactionUsersState,
  ]);



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

    cacheFetchedUsers(cycleUsers, cacheLoad2Users, filters);
    setUsers(sorted);
    setHasMore(false);
    setLastKey(null);
    setCurrentPage(1);
    setCacheCount(0);
    setBackendCount(sortedUsers.length);
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
    cacheFetchedUsers(mergedUsers, cacheDplUsers);
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
    setLastKey(null);
    setLastKey21(null);
    setSearchBarQueryActive(false);
    setLastSearchBarQuery('');
    setCacheCount(0);
    setBackendCount(0);
    setDuplicates('');
    setIsDuplicateView(false);
    searchListIsolationRef.current = false;
    renderCacheHydrationIdsRef.current = new Set();
    setSearchBarResetVersion(version => version + 1);
    toast.success('Cache cleared');
  };

  const runLastLoginIndexing = async () => {
    toast.loading('Indexing lastLogin2 0%', { id: 'index-lastlogin-progress' });
    await indexLastLogin(progress => {
      toast.loading(`Indexing lastLogin2 ${progress}%`, {
        id: 'index-lastlogin-progress',
      });
    });
    toast.success('lastLogin2 indexed', { id: 'index-lastlogin-progress' });
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

  const runLocalSearchIndexesWithCollections = useCallback(
    async ({ usersData, newUsersData, indexTypes }) => {
      const collectionsMap = {
        users: usersData || {},
        newUsers: newUsersData || {},
      };

      const searchIdPayload = buildSearchIdIndexPayloadFromCollections(collectionsMap);
      const searchKeyPayload = buildSearchKeyIndexPayloadFromCollections(collectionsMap, indexTypes);

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadJsonFile(`searchId-index-${stamp}.json`, searchIdPayload);
      downloadJsonFile(`searchKey-index-${stamp}.json`, searchKeyPayload);
    },
    [downloadJsonFile],
  );

  const openLocalIndexModal = useCallback(indexTypes => {
    setPendingLocalIndexTypes(indexTypes);
    setPendingLocalUsersData(null);
    setPendingLocalNewUsersData(null);
    setShowLocalIndexModal(true);
  }, []);

  const handleDownloadCollectionsForLocalIndex = useCallback(async () => {
    const toastId = 'download-local-index-collections';
    toast.loading('Завантаження users та newUsers...', { id: toastId });
    try {
      const [usersData, newUsersData] = await Promise.all([
        get(ref(database, 'users')).then(snapshot => (snapshot.exists() ? snapshot.val() || {} : {})),
        get(ref(database, 'newUsers')).then(snapshot => (snapshot.exists() ? snapshot.val() || {} : {})),
      ]);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadJsonFile(`users-${stamp}.json`, usersData || {});
      downloadJsonFile(`newUsers-${stamp}.json`, newUsersData || {});
      toast.success('Колекції users/newUsers завантажено', { id: toastId });
    } catch (error) {
      toast.error(`Не вдалося завантажити колекції: ${error?.message || 'невідома помилка'}`, { id: toastId });
    }
  }, [downloadJsonFile]);

  const handlePickUsersFileForLocalIndex = useCallback(() => {
    if (localUsersFileInputRef.current) {
      localUsersFileInputRef.current.value = '';
      localUsersFileInputRef.current.click();
    }
  }, []);

  const handlePickNewUsersFileForLocalIndex = useCallback(() => {
    if (localNewUsersFileInputRef.current) {
      localNewUsersFileInputRef.current.value = '';
      localNewUsersFileInputRef.current.click();
    }
  }, []);

  const handleLocalCollectionFileSelected = useCallback(async (event, collection) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object') {
        toast.error(`Некоректний JSON для ${collection}`);
        return;
      }

      if (collection === 'users') {
        setPendingLocalUsersData(parsed);
      } else {
        setPendingLocalNewUsersData(parsed);
      }
      toast.success(`Файл ${collection}.json прочитано`);
    } catch (error) {
      toast.error(`Не вдалося прочитати ${collection}.json: ${error?.message || 'невідома помилка'}`);
    }
  }, []);

  const handlePickUsersFileForLocalExport = useCallback(() => {
    if (localExportUsersFileInputRef.current) {
      localExportUsersFileInputRef.current.value = '';
      localExportUsersFileInputRef.current.click();
    }
  }, []);

  const handlePickNewUsersFileForLocalExport = useCallback(() => {
    if (localExportNewUsersFileInputRef.current) {
      localExportNewUsersFileInputRef.current.value = '';
      localExportNewUsersFileInputRef.current.click();
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    loadOfflineCollections()
      .then(({ users: savedUsers, newUsers: savedNewUsers }) => {
        if (isCancelled) return;

        if (savedUsers) setLocalExportUsersData(savedUsers);
        if (savedNewUsers) setLocalExportNewUsersData(savedNewUsers);

        if (savedUsers || savedNewUsers) {
          toast.success('Offline-файли відновлено зі сховища браузера');
        }
      })
      .catch(error => {
        console.warn('[AddNewProfile] Failed to restore offline collections from IndexedDB', error);
      })
      .finally(() => {
        if (!isCancelled) setIsOfflineCollectionsRestoring(false);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleLocalExportCollectionFileSelected = useCallback(async (event, collection) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object') {
        toast.error(`Некоректний JSON для ${collection}`);
        return;
      }
      if (collection === 'users') {
        setLocalExportUsersData(parsed);
      } else {
        setLocalExportNewUsersData(parsed);
      }
      await saveOfflineCollection(collection, parsed);
      toast.success(`Локальний файл для експорту ${collection}.json прочитано`);
    } catch (error) {
      toast.error(`Не вдалося прочитати ${collection}.json: ${error?.message || 'невідома помилка'}`);
    }
  }, []);

  const handleClearSavedOfflineCollections = useCallback(async () => {
    try {
      await clearOfflineCollections();
      setLocalExportUsersData(null);
      setLocalExportNewUsersData(null);
      toast.success('Збережені offline-файли очищено');
    } catch (error) {
      toast.error(`Не вдалося очистити offline-файли: ${error?.message || 'невідома помилка'}`);
    }
  }, []);

  const handleApplyLocalIndexing = useCallback(async () => {
    if (!pendingLocalUsersData || !pendingLocalNewUsersData) {
      toast.error('Спочатку оберіть обидва локальні файли: users.json і newUsers.json');
      return;
    }

    const toastId = 'local-index-build';
    toast.loading('Формуємо локальні JSON індекси searchId/searchKey...', { id: toastId });
    try {
      await runLocalSearchIndexesWithCollections({
        usersData: pendingLocalUsersData,
        newUsersData: pendingLocalNewUsersData,
        indexTypes: pendingLocalIndexTypes,
      });
      toast.success('Локальні JSON індекси завантажено на пристрій', { id: toastId });
      setShowLocalIndexModal(false);
    } catch (error) {
      toast.error(`Помилка локальної індексації: ${error?.message || 'невідома помилка'}`, { id: toastId });
    }
  }, [pendingLocalNewUsersData, pendingLocalUsersData, pendingLocalIndexTypes, runLocalSearchIndexesWithCollections]);

  const buildFullKeySetFromCollections = useCallback(() => {
    if (!pendingLocalUsersData || !pendingLocalNewUsersData) {
      toast.error('Спочатку оберіть обидва локальні файли: users.json і newUsers.json');
      return;
    }

    const keySet = new Set();
    const addKeysDeep = (value, parentKey = '') => {
      if (Array.isArray(value)) {
        if (parentKey) keySet.add(parentKey);
        value.forEach(item => addKeysDeep(item, parentKey ? `${parentKey}[]` : '[]'));
        return;
      }

      if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, nestedValue]) => {
          const path = parentKey ? `${parentKey}.${key}` : key;
          keySet.add(path);
          addKeysDeep(nestedValue, path);
        });
      }
    };

    [pendingLocalUsersData, pendingLocalNewUsersData].forEach(collection => {
      Object.values(collection || {}).forEach(card => addKeysDeep(card));
    });

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const keys = Array.from(keySet).sort((a, b) => a.localeCompare(b, 'uk'));
    downloadJsonFile(`full-card-keys-${stamp}.json`, {
      createdAt: new Date().toISOString(),
      totalKeys: keys.length,
      keys,
    });
    toast.success(`Згенеровано файл з повним набором ключів (${keys.length})`);
  }, [downloadJsonFile, pendingLocalNewUsersData, pendingLocalUsersData]);

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
      !selectedIndexJobs.lastLogin &&
      !selectedIndexJobs.stimulationShortcuts &&
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
      if (selectedIndexJobs.lastLogin) {
        await runLastLoginIndexing();
      }

      if (selectedIndexJobs.stimulationShortcuts) {
        await runStimulationShortcutIndexing();
      }

      if (selectedIndexJobs.searchKeySetReindex) {
        const toastId = 'index-searchkey-set-reindex-progress';
        toast.loading('Перебудова searchKeySet наборів фільтрів...', { id: toastId });
        const stats = await rebuildAllNewUsersFilterSetIndexes();
        toast.success(
          `searchKeySet оновлено: ${stats.indexedRuleSets}/${stats.totalRuleSets} наборів.`,
          { id: toastId },
        );
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
            ? 'Indexing searchKey/users selected indexes...'
            : 'Indexing searchKey/users all indexes...',
          { id: toastId },
        );
        await createSelectedSearchKeyIndexesInCollection(
          'users',
          indexTypesForUsers,
          (progress, meta) => {
            const indexLabel = meta?.indexType || '';
            const indexNumber = meta?.indexNumber || 1;
            const totalIndexes = meta?.totalIndexes || indexTypesForUsers.length;
            toast.loading(
              `Indexing searchKey/users/${indexLabel} ${progress}% (${indexNumber}/${totalIndexes})`,
              { id: toastId },
            );
          },
          { rootPath: 'searchKey/users' },
        );
        toast.success(
          selectedIndexTypes.length
            ? 'Обрані searchKey/users індекси для users побудовано'
            : 'Всі searchKey/users індекси для users побудовано',
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
      const formatProgressMessage = (collection, progress, meta) => {
        const indexLabel = meta?.indexType || '';
        const indexNumber = meta?.indexNumber || 1;
        const totalIndexes = meta?.totalIndexes || selectedIndexTypes.length;
        return `Indexing ${collection}/${indexLabel} ${progress}% (${indexNumber}/${totalIndexes})`;
      };

      toast.loading('Indexing searchKey indexes...', { id: toastId });
      await createSelectedSearchKeyIndexesInCollection('newUsers', selectedIndexTypes, (progress, meta) => {
        toast.loading(formatProgressMessage('newUsers', progress, meta), { id: toastId });
      });

      await createSelectedSearchKeyIndexesInCollection('users', selectedIndexTypes, (progress, meta) => {
        toast.loading(formatProgressMessage('users', progress, meta), { id: toastId });
      });

      toast.success('Обрані searchKey індекси побудовано', { id: toastId });
    } catch (error) {
      console.error('[AddNewProfile] Indexing failed', error);
      toast.error(`Помилка індексації: ${error?.message || 'невідома помилка'}`);
    }
  };

  useEffect(() => {
    if (!searchIdAndSearchKeyOnlyMode) {
      setShowSearchKeyIndexPanel(false);
    }
  }, [searchIdAndSearchKeyOnlyMode]);

  useEffect(() => {
    setBackendDownloadToastsEnabled(downloadSizeToastsEnabled);
  }, [downloadSizeToastsEnabled]);

  const handleDownloadSizeToastsToggle = () => {
    setDownloadSizeToastsEnabled(prev => !prev);
  };
  const handleMatchingDebugLogModeToggle = () => {
    const nextMode = matchingDebugLogMode === 'file' ? 'console' : 'file';
    const downloadedLogsCount = matchingDebugLogMode === 'file'
      ? downloadMatchingDebugLogs()
      : null;

    if (typeof window !== 'undefined') {
      window.__MATCHING_DEBUG_LOG_MODE = nextMode;
      if (nextMode === 'file') window.__MATCHING_DEBUG_LOGS = [];
      window.dispatchEvent(new CustomEvent('matchingDebugLogModeChange', {
        detail: { mode: nextMode },
      }));
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MATCHING_DEBUG_LOG_MODE_KEY, nextMode);
    }

    setMatchingDebugLogMode(nextMode);
    toast.success(
      nextMode === 'file'
        ? 'Режим file-логів Matching увімкнено.'
        : `Режим console-логів Matching увімкнено. Log-файл завантажено (${downloadedLogsCount || 0}).`
    );
  };

  const fieldsToRender = getFieldsToRender(state);

  const effectiveCycleStatus = getEffectiveCycleStatus(state);
  const scheduleUserData = state;
  const shouldShowSchedule = ['stimulation', 'pregnant'].includes(effectiveCycleStatus);
  const [isStimulationScheduleVisible, setIsStimulationScheduleVisible] = useState(true);

  useEffect(() => {
    setIsStimulationScheduleVisible(true);
  }, [state?.userId, shouldShowSchedule]);


  // const fieldsToRender = [
  //   ...pickerFields,

  // ];


  const shouldPaginate = searchBarQueryActive
    ? Object.keys(users || {}).length > PAGE_SIZE
    : currentFilter !== 'FAVORITE' && currentFilter !== 'CYCLE_FAVORITE';
  const getSortedIds = () => {
    const ids = Object.keys(users);
    const currentCardsById = loadCards();
    const getVisibleCard = id => currentCardsById[id] || users[id] || {};
    if (isDuplicateView || currentFilter === 'CYCLE_FAVORITE') {
      return ids;
    }

    if (currentFilter === LAST_ACTION2_FILTER) {
      const acceptedOrder = getLA2AcceptedOrder(la2StateRef);
      return ids.sort((a, b) => acceptedOrder.indexOf(a) - acceptedOrder.indexOf(b));
    }

    if (currentFilter === 'LAST_ACTION') {
      return ids.sort((a, b) => {
        const left = normalizeLastAction(getVisibleCard(a)?.lastAction) || 0;
        const right = normalizeLastAction(getVisibleCard(b)?.lastAction) || 0;
        return right - left;
      });
    }

    const reactionSortDirection = getSearchKeyReactionSortDirection(filters?.reaction);
    if (reactionSortDirection) {
      return ids.sort((a, b) => {
        const left = getVisibleCard(a)?.getInTouch || '';
        const right = getVisibleCard(b)?.getInTouch || '';
        return reactionSortDirection === 'desc'
          ? right.localeCompare(left)
          : left.localeCompare(right);
      });
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
    if (isDuplicateView) return cards;
    if (searchBarQueryActive && !useSearchResultFilters) return cards;

    return filterMain(
      cards.map(card => [card.userId, card]),
      currentFilter,
      filters,
      favoriteUsersData,
      dislikeUsersData,
      { requireCurrentOrPastGetInTouch: searchIdAndSearchKeyOnlyMode && currentFilter === 'DATE2.1' },
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
  console.log('[RENDER] visible cards:', Object.values(paginatedUsers).map(c => ({
    userId: c.userId,
    getInTouch: c.getInTouch,
    lastAction: c.lastAction,
    cachedAt: c.cachedAt,
    fromRenderFallback: !cachedPaginatedUsers[c.userId],
  })));

  const handleLoadUsers = () => {
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
    setUsers({});
    setHasMore(true);
    setCurrentPage(1);
    setLastKey(null);
    setDateOffset2(0);
    setDateOffset21(0);
    setDateOffsetLA(0);
    resetLA2StateRef(la2StateRef);
    setLastKey21(null);
    setDuplicates('');
    setIsDuplicateView(false);

    const nextFilter = resolveFilterByLoadSortMode(loadSortMode);
    appendLoadDebugLog('manual-load:click', {
      nextFilter,
      loadSortMode,
      search,
      filters: summarizeLoadFiltersForLog(filters),
      previousUsersCount: countObjectKeys(users),
    });
    setCurrentFilter(nextFilter);
    setLoadRequestId(prev => prev + 1);
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
      loadSortMode: snapshot.loadSortMode || 'GITnew',
      hasSearched: Boolean(snapshot.hasSearched),
    });

    if (Object.keys(restoredUsers).length) {
      setUsers(restoredUsers);
      setHasSearched(true);
      setUserNotFound(false);
    }

    setCurrentFilter(snapshot.currentFilter || '');
    setCurrentPage(snapshot.currentPage || 1);
    setHasMore(typeof snapshot.hasMore === 'boolean' ? snapshot.hasMore : true);
    setLastKey(snapshot.lastKey ?? null);
    setLastKey21(snapshot.lastKey21 ?? null);
    setDateOffset2(snapshot.dateOffset2 || 0);
    setDateOffset21(snapshot.dateOffset21 || 0);
    setDateOffsetLA(snapshot.dateOffsetLA || 0);
    if (snapshot.la2State) {
      la2StateRef.current = restoreLA2State(snapshot.la2State);
    }
    setLoadSortMode(snapshot.loadSortMode || 'GITnew');
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
            {isAdmin && (
              <DownloadSizeToastToggleButton
                type="button"
                $active={matchingDebugLogMode === 'file'}
                aria-pressed={matchingDebugLogMode === 'file'}
                title={matchingDebugLogMode === 'file' ? 'Перемкнути логи Matching у консоль' : 'Перемкнути логи Matching у файл'}
                aria-label={matchingDebugLogMode === 'file' ? 'Перемкнути логи Matching у консоль' : 'Перемкнути логи Matching у файл'}
                onClick={handleMatchingDebugLogModeToggle}
              >
                🧾
                <DownloadSizeToastStatus>{matchingDebugLogMode === 'file' ? 'FILE' : 'LOG'}</DownloadSizeToastStatus>
              </DownloadSizeToastToggleButton>
            )}
            <DotsButton
              aria-label="Відкрити меню профілю"
              onClick={() => {
                setShowInfoModal('dotsMenu');
              }}
            >
              ⋮
            </DotsButton>
          </TopButtons>
        )}

        <SearchBarRow>
          <SearchBar
            key={`add-search-${searchBarResetVersion}`}
            searchFunc={fetchNewUsersCollectionInRTDB}
            search={search}
            setSearch={value => {
              setSearch(value);
            }}
            setUsers={setUsers}
            setState={setState}
            setUserNotFound={setUserNotFound}
            onSearchKey={setSearchKeyValuePair}
            onSearchExecuted={handleSearchExecuted}
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
            enabledSearchKeys={effectiveEnabledSearchKeys}
            searchOptions={{
              searchIdPrefixes: selectedSearchIdPrefixes,
              equalToKeys: selectedEqualToKeys,
              searchKeyFields: selectedSearchKeyFields,
              autoOtherFallback: shouldAutoRunOtherFallback,
              enabledSearchKeys: effectiveEnabledSearchKeys,
              cacheScope: { collections: ['newUsers', 'users'] },
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
            {SEARCH_SCOPE_BLOCKS.map(block => (
              <SearchScopeBlock key={block.id}>
                <SearchScopeBlockHeader>
                  <SearchScopeBlockTitle>{block.title}</SearchScopeBlockTitle>
                  {block.id === 'id-search' && (
                    <ToggleSearchScopeButton type="button" onClick={toggleAllSearchScopes}>
                      {areAllSearchScopesEnabled ? 'Вимкнути всі' : 'Увімкнути всі'}
                    </ToggleSearchScopeButton>
                  )}
                </SearchScopeBlockHeader>
                <SearchScopeItems>
                  {(() => {
                    const options = block.id === 'search-keys'
                      ? [...block.options.filter(option => !option.isDate), ...block.options.filter(option => option.isDate)]
                      : block.options;
                    const hasDateOptions = block.id === 'search-keys' && options.some(option => option.isDate);

                    return options.map((option, index) => {
                      const isSearchModeOption = block.id === 'search-keys';
                      const searchIdModeOnly = enabledSearchKeys.searchId && !enabledSearchKeys.equalToAllCards && !enabledSearchKeys.searchKey;
                      const equalToModeOnly = enabledSearchKeys.equalToAllCards && !enabledSearchKeys.searchId && !enabledSearchKeys.searchKey;
                      const searchKeyModeOnly = enabledSearchKeys.searchKey && !enabledSearchKeys.searchId && !enabledSearchKeys.equalToAllCards;
                      const disabled = isSearchModeOption && (
                        (searchIdModeOnly && !option.supportsSearchId) ||
                        (equalToModeOnly && !option.supportsEqualTo) ||
                        (searchKeyModeOnly && !option.supportsSearchKey)
                      );

                      const isFirstDateOption = option.isDate && options[index - 1] && !options[index - 1].isDate;

                      return (
                        <React.Fragment key={option.key}>
                          {hasDateOptions && isFirstDateOption && <SearchScopeDivider />}
                          <ScopeChip
                            type="button"
                            $active={option.isFilterToggle ? useSearchResultFilters : Boolean(enabledSearchKeys[option.key])}
                            aria-pressed={option.isFilterToggle ? useSearchResultFilters : Boolean(enabledSearchKeys[option.key])}
                            disabled={disabled}
                            onClick={() => handleSearchScopeChange(option.key, disabled)}
                          >
                            {option.isFilterToggle
                              ? `фільтри ${useSearchResultFilters ? 'ON' : 'OFF'}`
                              : option.label}
                          </ScopeChip>
                        </React.Fragment>
                      );
                    });
                  })()}
                </SearchScopeItems>
              </SearchScopeBlock>
            ))}
          </SearchScopeContainer>
        )}
        {isResolvingEditMode ? null : state.userId ? (
          <>
            <div style={{ ...coloredCard(), marginBottom: '8px' }}>
              {renderTopBlock({
                userData: state,
                setUsers,
                setShowInfoModal,
                setState,
                setUserIdToDelete,
                isFromListOfUsers: false,
                favoriteUsers: favoriteUsersData,
                setFavoriteUsers: setFavoriteUsersData,
                dislikeUsers: dislikeUsersData,
                setDislikeUsers: setDislikeUsersData,
                currentFilter,
                isDateInRange,
                onOpenMedications: openMedicationsModal,
                topBlueAction: {
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
                },
                overlayFieldAdditions: {},
                onSubmitHistorySnapshot: handleTopBlockSubmitHistorySnapshot,
                stimulationScheduleToggle: shouldShowSchedule
                  ? {
                      visible: isStimulationScheduleVisible,
                      onToggle: () => setIsStimulationScheduleVisible(prev => !prev),
                    }
                  : null,
              })}
            </div>
            {shouldShowSchedule && isStimulationScheduleVisible && state && (
              <div style={{ ...coloredCard(), marginBottom: '8px' }}>
              <StimulationSchedule
                userData={scheduleUserData}
                setUsers={setUsers}
                setState={setState}
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
            />
          </>
        ) : (
          <div>
            {(searchLoading || hasSearched) && !userNotFound && (
              <p style={{ textAlign: 'center', color: 'black' }}>
                Знайдено{' '}
                {searchLoading ? (
                  <span className="spinner" />
                ) : (
                  renderVisibleIds.length
                )}{' '}
                карток.
              </p>
            )}
            {userNotFound && hasSearched && (
              <p style={{ textAlign: 'center', color: 'black' }}>No result</p>
            )}
            <ButtonsContainer>
              {userNotFound && (
                <Button onClick={handleAddUser} disabled={adding}>
                  {adding ? (
                    <span className="spinner" />
                  ) : (
                    '+'
                  )}
                </Button>
              )}
              <Button onClick={handleInfo} {...createLongPressHandlers('Показує кількість завантажених карток')}>
                Info
              </Button>
              <Button onClick={handleClearCache} {...createLongPressHandlers('Очищає локальний кеш карток')}>
                ClearCache
              </Button>
              {stimulationScheduleProfiles.map(user => (
                <Button
                  key={`schedule-${user.userId}`}
                  onClick={() => handleOpenScheduleProfile(user)}
                  title={user?.surname || ''}
                >
                  {getSurnameLabel(user)}
                </Button>
              ))}
              <LoadControlsContainer>
                <LoadControlsHeader>
                  <Button onClick={handleLoadUsers} {...createLongPressHandlers('Завантажує список анкет за поточними фільтрами')}>
                    Load
                  </Button>
                  <GearButton
                    type="button"
                    onClick={() => setIsLoadOptionsOpen(prev => !prev)}
                    aria-label="Показати налаштування load"
                    aria-expanded={isLoadOptionsOpen}
                    title="Налаштування load"
                  >
                    ⚙
                  </GearButton>
                  <GearButton
                    type="button"
                    onClick={downloadLoadDebugLogs}
                    aria-label="Зберегти load debug log у файл"
                    title="Зберегти load debug log у файл"
                  >
                    🧾
                  </GearButton>
                </LoadControlsHeader>
                {isLoadOptionsOpen && (
                  <LoadOptionsPopover>
                    <SortModeContainer>
                      <SortModeTitle>Сортування</SortModeTitle>
                      <SortModeLabel>
                        <input
                          type="radio"
                          name="load-sort-mode"
                          value={LOAD_SORT_MODES.GIT}
                          checked={loadSortMode === LOAD_SORT_MODES.GIT}
                          onChange={event => handleLoadSortModeChange(event.target.value)}
                        />
                        GIT
                      </SortModeLabel>
                      <SortModeLabel>
                        <input
                          type="radio"
                          name="load-sort-mode"
                          value={LOAD_SORT_MODES.GIT_NEW}
                          checked={loadSortMode === LOAD_SORT_MODES.GIT_NEW}
                          onChange={event => handleLoadSortModeChange(event.target.value)}
                        />
                        GITnew
                      </SortModeLabel>
                      <SortModeLabel>
                        <input
                          type="radio"
                          name="load-sort-mode"
                          value={LOAD_SORT_MODES.LAST_ACTION}
                          checked={loadSortMode === LOAD_SORT_MODES.LAST_ACTION}
                          onChange={event => handleLoadSortModeChange(event.target.value)}
                        />
                        LA
                      </SortModeLabel>
                      <LastAction2SortModeButton
                        SortModeLabel={SortModeLabel}
                        loadSortMode={loadSortMode}
                        onChange={handleLoadSortModeChange}
                      />
                      <SortModeLabel>
                        <input
                          type="radio"
                          name="load-sort-mode"
                          value={LOAD_SORT_MODES.NO_GIT}
                          checked={loadSortMode === LOAD_SORT_MODES.NO_GIT}
                          onChange={event => handleLoadSortModeChange(event.target.value)}
                        />
                        NoGIT
                      </SortModeLabel>
                      <SortModeLabel>
                        <input
                          type="radio"
                          name="load-sort-mode"
                          value={LOAD_SORT_MODES.SEARCH_ID_KEY_ONLY}
                          checked={loadSortMode === LOAD_SORT_MODES.SEARCH_ID_KEY_ONLY}
                          onChange={event => handleLoadSortModeChange(event.target.value)}
                        />
                        NoGIT+IdKey
                      </SortModeLabel>
                      <AddNewProfileOfflineLoadControls
                        SortModeLabel={SortModeLabel}
                        LocalIndexActions={LocalIndexActions}
                        loadSortMode={loadSortMode}
                        onModeChange={handleLoadSortModeChange}
                        onPickUsersFile={handlePickUsersFileForLocalExport}
                        onPickNewUsersFile={handlePickNewUsersFileForLocalExport}
                        onClearSavedFiles={handleClearSavedOfflineCollections}
                        hasUsersFile={Boolean(localExportUsersData)}
                        hasNewUsersFile={Boolean(localExportNewUsersData)}
                      />
                    </SortModeContainer>
                    <FilterPanel
                      key={filterStorageKey}
                      onChange={handleFilterChange}
                      storageKey={filterStorageKey}
                      bloodSearchKeyMode={searchIdAndSearchKeyOnlyMode || offlineLoadMode}
                      allowedFilterNames={(searchIdAndSearchKeyOnlyMode || offlineLoadMode) ? ['bloodGroup', 'rh', 'maritalStatus', 'contact', 'age', 'imt', 'height', 'role', 'userId', 'fields', 'csection', 'reaction', 'getInTouch'] : undefined}
                    />
                  </LoadOptionsPopover>
                )}
              </LoadControlsContainer>
              <Button
                onClick={() => {
                  setCurrentFilter('FAVORITE');
                  setDuplicates('');
                  setIsDuplicateView(false);
                }}
              >
                ❤
              </Button>
              <Button
                onClick={() => {
                  setCurrentFilter('CYCLE_FAVORITE');
                  setDuplicates('');
                  setIsDuplicateView(false);
                }}
                aria-label="Cycle favorites"
              >
                <BabyIcon style={{ width: '100%', height: '100%' }} />
              </Button>
              {searchIdAndSearchKeyOnlyMode && (
                <>
                  <Button
                    onClick={() => setShowSearchKeyIndexPanel(prev => !prev)}
                    title="Меню індексації"
                  >
                    Індекси
                  </Button>
                </>
              )}
              {<Button onClick={searchDuplicates} {...createLongPressHandlers('Шукає дублікати карток')}>DPL</Button>}
              <Button
                onClick={() => setShowSaveModal(true)}
                {...createLongPressHandlers('Відкриває меню з варіантами збереження контактів')}
              >
                Save
              </Button>
              {
                <Button
                  onClick={() => {
                    btnMerge(users, setUsers, setDuplicates);
                  }}
                  {...createLongPressHandlers('Об’єднує знайдені дублікати в локальному списку')}
                >
                  Merg
                </Button>
              }
              <input
                ref={excelImportInputRef}
                type="file"
                accept=".xls,.xlsx"
                style={{ display: 'none' }}
                onChange={handleExcelProfilesUpload}
              />
              <input
                ref={localExportUsersFileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={event => handleLocalExportCollectionFileSelected(event, 'users')}
              />
              <input
                ref={localExportNewUsersFileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={event => handleLocalExportCollectionFileSelected(event, 'newUsers')}
              />
              <Button
                onClick={() => excelImportInputRef.current?.click()}
                disabled={isExcelImporting}
                title="Імпорт Excel в 3 JSON"
                {...createLongPressHandlers('Імпортує Excel і конвертує в JSON формати')}
              >
                {isExcelImporting ? '...' : 'XLSX'}
              </Button>

              {/* <ExcelToJson/> */}
              {/* <UploadJson/> */}
              {/* <JsonToExcelButton/> */}
              {/* {users && <div>Знайдено {Object.keys(users).length}</div>} */}
            </ButtonsContainer>
            {searchIdAndSearchKeyOnlyMode && showSearchKeyIndexPanel && (
              <IndexModal>
                <IndexModalList>
                  <SearchScopeLabel>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIndexJobs.lastLogin)}
                      onChange={() => toggleIndexJobSelection('lastLogin')}
                    />
                    <SearchScopeLabelTextGroup>
                      <span>Індексувати lastLogin</span>
                    </SearchScopeLabelTextGroup>
                  </SearchScopeLabel>
                  <SearchScopeLabel>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIndexJobs.stimulationShortcuts)}
                      onChange={() => toggleIndexJobSelection('stimulationShortcuts')}
                    />
                    <SearchScopeLabelTextGroup>
                      <span>Індексувати ярлики стимуляції</span>
                    </SearchScopeLabelTextGroup>
                  </SearchScopeLabel>
                  <SearchScopeLabel>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIndexJobs.searchLocalIdAndKey)}
                      onChange={() => toggleIndexJobSelection('searchLocalIdAndKey')}
                    />
                    <SearchScopeLabelTextGroup>
                      <span>Локальна індексація searchId+searchKey (через JSON)</span>
                    </SearchScopeLabelTextGroup>
                  </SearchScopeLabel>
                  <SearchScopeLabel>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIndexJobs.searchLocalImtHeightWeight)}
                      onChange={() => toggleIndexJobSelection('searchLocalImtHeightWeight')}
                    />
                    <SearchScopeLabelTextGroup>
                      <span>Локальна індексація imt+height+weight (users + newUsers JSON)</span>
                    </SearchScopeLabelTextGroup>
                  </SearchScopeLabel>
                  <SearchScopeLabel>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIndexJobs.searchKeyUsersAll)}
                      onChange={() => toggleIndexJobSelection('searchKeyUsersAll')}
                    />
                    <SearchScopeLabelTextGroup>
                      <span>Всі searchKey індекси лише для users → searchKey/users</span>
                    </SearchScopeLabelTextGroup>
                  </SearchScopeLabel>
                  <SearchScopeLabel>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIndexJobs.searchKeySetReindex)}
                      onChange={() => toggleIndexJobSelection('searchKeySetReindex')}
                    />
                    <SearchScopeLabelTextGroup>
                      <span>Перебудувати searchKeySet набори фільтрів</span>
                    </SearchScopeLabelTextGroup>
                  </SearchScopeLabel>
                  {SEARCH_KEY_INDEX_OPTIONS.map(option => (
                    <SearchScopeLabel key={option.key}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedSearchKeyIndexes[option.key])}
                        onChange={() => toggleSearchKeyIndexSelection(option.key)}
                      />
                      <SearchScopeLabelTextGroup>
                        <span>{option.label}</span>
                      </SearchScopeLabelTextGroup>
                    </SearchScopeLabel>
                  ))}
                </IndexModalList>
                <Button onClick={runSelectedIndexes} title="Запустити індексацію обраних чекбоксів">
                  Індексувати обране
                </Button>
              </IndexModal>
            )}
            {!userNotFound && (
              <>
                <UsersList
                  setCompare={setCompare}
                  setShowInfoModal={setShowInfoModal}
                  onOpenMoreActions={openMoreActionsModal}
                  users={paginatedUsers}
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
                  <SaveModalComment>Читає всю актуальну колекцію users + newUsers напряму з Firebase/Realtime Database, без Local Storage.</SaveModalComment>
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
                  <SaveModalComment>Бере дані з обраних локальних JSON-файлів users та newUsers і мержить їх по userId.</SaveModalComment>
                </span>
              </SaveModalRadioRow>
              {exportDataSource === 'local' && (
                <LocalIndexActions>
                  <button type="button" onClick={handlePickUsersFileForLocalExport}>
                    Обрати users.json {localExportUsersData ? '✅' : ''}
                  </button>
                  <button type="button" onClick={handlePickNewUsersFileForLocalExport}>
                    Обрати newUsers.json {localExportNewUsersData ? '✅' : ''}
                  </button>
                  {(localExportUsersData || localExportNewUsersData) && (
                    <button type="button" onClick={handleClearSavedOfflineCollections}>
                      Очистити збережені offline-файли
                    </button>
                  )}
                  {isOfflineCollectionsRestoring && (
                    <SaveModalComment>Перевіряємо збережені offline-файли...</SaveModalComment>
                  )}
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
            <h3>Локальна індексація searchId / searchKey</h3>
            <p>1) Викачайте users та newUsers. 2) Оберіть ці файли локально. 3) Створіть JSON індекси.</p>
            <LocalIndexActions>
              <button type="button" onClick={handleDownloadCollectionsForLocalIndex}>
                1) Викачати колекції users + newUsers
              </button>
              <button type="button" onClick={handlePickUsersFileForLocalIndex}>
                2) Обрати users.json {pendingLocalUsersData ? '✅' : ''}
              </button>
              <button type="button" onClick={handlePickNewUsersFileForLocalIndex}>
                3) Обрати newUsers.json {pendingLocalNewUsersData ? '✅' : ''}
              </button>
              <button type="button" onClick={handleApplyLocalIndexing}>
                4) Побудувати і скачати JSON індекси searchId/searchKey
              </button>
              <button type="button" onClick={buildFullKeySetFromCollections}>
                5) Сформувати JSON з повним набором ключів карток
              </button>
              <button type="button" onClick={() => setShowLocalIndexModal(false)}>
                Скасувати
              </button>
            </LocalIndexActions>
            <input
              ref={localUsersFileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={event => handleLocalCollectionFileSelected(event, 'users')}
            />
            <input
              ref={localNewUsersFileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={event => handleLocalCollectionFileSelected(event, 'newUsers')}
            />
          </LocalIndexModal>
        </LocalIndexOverlay>
      )}
    </Container>
  );
};

export default AddNewProfile;
