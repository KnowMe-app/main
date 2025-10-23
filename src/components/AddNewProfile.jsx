import React, { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import styled from 'styled-components';
// import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import {
  auth,
  fetchNewUsersCollectionInRTDB,
  // fetchUserData,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
  fetchPaginatedNewUsers,
  fetchAllFilteredUsers,
  fetchFavoriteUsers,
  fetchFavoriteUsersData,
  fetchCycleUsersData,
  removeKeyFromFirebase,
  // fetchListOfUsers,
  makeNewUser,
  // removeSearchId,
  // createSearchIdsForAllUsers,
  createSearchIdsInCollection,
  fetchUserById,
  loadDuplicateUsers,
  removeCardAndSearchId,
  fetchAllUsersFromRTDB,
  fetchTotalNewUsersCount,
  fetchFilteredUsersByPage,
  indexLastLogin,
  addStimulationShortcutId,
  removeStimulationShortcutId,
  replaceStimulationShortcutIds,
} from './config';
import { makeUploadedInfo } from './makeUploadedInfo';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import InfoModal from './InfoModal';
import { VerifyEmail } from './VerifyEmail';

import { color, coloredCard } from './styles';
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
import { getDislikes, syncDislikes } from 'utils/dislikesStorage';
import { passesReactionFilter } from 'utils/reactionCategory';
import {
  setIdsForQuery,
  getIdsByQuery,
  getCard,
  normalizeQueryKey,
} from 'utils/cardIndex';
import {
  getStimulationShortcutCards,
  getStoredStimulationShortcutIds,
  setStoredStimulationShortcutIds,
  addStoredStimulationShortcutId,
  removeStoredStimulationShortcutId,
} from 'utils/stimulationShortcutStorage';
// import ExcelToJson from './ExcelToJson';
import { saveToContact } from './ExportContact';
import { renderTopBlock } from './smallCard/renderTopBlock';
import StimulationSchedule from './StimulationSchedule';
import { ReactComponent as BabyIcon } from 'assets/icons/baby.svg';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';
// import { UploadJson } from './topBtns/uploadNewJSON';
import { btnExportUsers } from './topBtns/btnExportUsers';
import { btnMerge } from './smallCard/btnMerge';
import FilterPanel from './FilterPanel';
import SearchBar from './SearchBar';
import { Pagination } from './Pagination';
import { ProfileForm, getFieldsToRender } from './ProfileForm';
import { PAGE_SIZE, database } from './config';
import { onValue, ref } from 'firebase/database';
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

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 5px;
  background-color: #f5f5f5;

  @media (max-width: 768px) {
    // Медіа-запит для пристроїв з шириною екрану до 768px
    padding: 0;
  }
  /* max-width: 450px; */

  /* maxWidth:  */
  /* height: 100vh; */
`;

const InnerContainer = styled.div`
  max-width: 450px;
  width: 100%;
  box-sizing: border-box;
  background-color: #f0f0f0;
  padding: 20px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;

  @media (max-width: 768px) {
    // Медіа-запит для пристроїв з шириною екрану до 768px
    background-color: #f5f5f5;
    box-shadow: 0 4px 8px #f5f5f5;
    border-radius: 0;
  }
`;

const DotsButton = styled.button`
  /* position: absolute; */
  /* top: 8px; */
  /* right: 8px; */
  margin-top: -10px;
  margin-bottom: 10px;

  width: 40px;
  height: 40px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding-bottom: 20;
  margin-left: auto;
  align-items: center;
  justify-content: center;
  display: flex;
`;


export const SubmitButton = styled.button`
  /* margin-top: 20px; */
  padding: 10px 20px;
  /* background-color: #4caf50; */
  color: black;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  align-self: flex-start;
  border-bottom: 1px solid #ddd; /* Лінія між елементами */
  width: 100%;
  transition: background-color 0.3s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: #f5f5f5; /* Легкий фон при наведенні */
  }
`;

export const ExitButton = styled(SubmitButton)`
  background: none; /* Прибирає будь-які стилі фону */
  border-bottom: none; /* Прибирає горизонтальну полосу */
  transition: background-color 0.3s ease;
  &:hover {
    background-color: #f5f5f5; /* Легкий фон при наведенні */
  }
`;

const TopButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
  width: 35px; /* Встановіть ширину, яка визначатиме розмір кнопки */
  height: 35px; /* Встановіть висоту, яка повинна дорівнювати ширині */
  padding: 3px; /* Видаліть внутрішні відступи */
  border: none;
  background-color: ${color.accent5};
  color: white;
  border-radius: 50px;
  cursor: pointer;
  font-size: 12px;
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.3s ease,
    box-shadow 0.3s ease;
  margin-right: 10px;

  &:hover {
    background-color: ${color.accent}; /* Колір кнопки при наведенні */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); /* Тінь при наведенні */
  }

  &:active {
    transform: scale(0.98); /* Легкий ефект при натисканні */
  }
`;

const ButtonsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;




export const AddNewProfile = ({ isLoggedIn, setIsLoggedIn }) => {

  const location = useLocation();
  const lastUrlUserIdRef = useRef(new URLSearchParams(location.search).get('userId'));

  const [userNotFound, setUserNotFound] = useState(false);

  const SEARCH_KEY = 'addSearchQuery';
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('search')) {
      return params.get('search') || '';
    }
    const urlUserId = params.get('userId');
    if (urlUserId) return urlUserId;
    return localStorage.getItem(SEARCH_KEY) || '';
  });
  const [searchBarQueryActive, setSearchBarQueryActive] = useState(false);
  const [lastSearchBarQuery, setLastSearchBarQuery] = useState('');

  const [state, setState] = useState(() => {
    const params = new URLSearchParams(location.search);
    const urlUserId = params.get('userId');
    return urlUserId ? { userId: urlUserId } : {};
  });
  const isEditingRef = useRef(false);

  const [searchKeyValuePair, setSearchKeyValuePair] = useState(null);
  const [filters, setFilters] = useState({});
  const filtersRef = useRef(filters);
  const hasInitializedFiltersRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userIdToDelete, setUserIdToDelete] = useState(null);
  const navigate = useNavigate();
  const isAdmin = auth.currentUser?.uid === process.env.REACT_APP_USER1;
  const [stimulationScheduleProfiles, setStimulationScheduleProfiles] = useState([]);
  const [stimulationShortcutIds, setStimulationShortcutIdsState] = useState(() =>
    getStoredStimulationShortcutIds(),
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('search') || params.has('userId')) {
      return;
    }
    const storedSearch = localStorage.getItem(SEARCH_KEY);
    if (storedSearch) {
      setSearch(storedSearch);
    }
  }, [location.search]);

  const handleBlur = () => {
    handleSubmit();
  };

  const handleSubmit = async (newState, overwrite, delCondition, makeIndex) => {
    const fieldsForNewUsersOnly = ['role', 'lastCycle', 'myComment', 'writer', 'cycleStatus', 'stimulationSchedule'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
    const commonFields = ['lastAction', 'lastLogin2', 'getInTouch', 'lastDelivery', 'ownKids', 'cycleStatus', 'stimulationSchedule'];

    const now = Date.now();
    const baseState = newState ? { ...newState } : { ...state };
    const updatedState = { ...baseState, lastAction: now };

    const formattedLastDelivery = formatDateToServer(
      formatDateAndFormula(updatedState.lastDelivery)
    );

    const syncedState = { ...updatedState };

    if (formattedLastDelivery) {
      syncedState.lastDelivery = formattedLastDelivery;
    } else {
      delete syncedState.lastDelivery;
    }

    // Optimistically update local cache and UI state before syncing with server
    setState(syncedState);
    const removeKeys = delCondition ? Object.keys(delCondition) : [];
    updateCachedUser(syncedState, { removeKeys });
    cacheFetchedUsers({ [syncedState.userId]: syncedState }, cacheLoad2Users, filters);
    setUsers(prev => ({ ...prev, [syncedState.userId]: syncedState }));

    if (syncedState?.userId?.length > 20) {
      const { existingData } = await fetchUserById(syncedState.userId);

      const cleanedState = Object.fromEntries(
        Object.entries(syncedState).filter(([key]) => commonFields.includes(key) || !fieldsForNewUsersOnly.includes(key))
      );

      const uploadedInfo = makeUploadedInfo(existingData, cleanedState, overwrite);

      if (!makeIndex) {
        await Promise.all([
          updateDataInRealtimeDB(syncedState.userId, uploadedInfo, 'update'),
          updateDataInFiresoreDB(syncedState.userId, uploadedInfo, 'check', delCondition),
        ]);
      }

      const cleanedStateForNewUsers = Object.fromEntries(
        Object.entries(syncedState).filter(([key]) =>
          [...fieldsForNewUsersOnly, ...contacts, 'getInTouch', 'lastDelivery', 'ownKids'].includes(key)
        )
      );

      await updateDataInNewUsersRTDB(
        syncedState.userId,
        cleanedStateForNewUsers,
        'update'
      );
    } else {
      if (newState) {
        const newStateWithDelivery = { ...newState };

        if (formattedLastDelivery) {
          newStateWithDelivery.lastDelivery = formattedLastDelivery;
        } else {
          delete newStateWithDelivery.lastDelivery;
        }
        await updateDataInNewUsersRTDB(
          syncedState.userId,
          newStateWithDelivery,
          'update'
        );
      } else {
        await updateDataInNewUsersRTDB(syncedState.userId, syncedState, 'update');
      }
    }

    try {
      const serverData = await fetchUserById(syncedState.userId);
      const serverLast = normalizeLastAction(serverData?.lastAction);
      if (serverLast && serverLast > syncedState.lastAction) {
        const formattedServer = {
          ...serverData,
          lastAction: serverLast,
          lastDelivery: formatDateToDisplay(serverData.lastDelivery),
          cycleStatus: serverData.cycleStatus || 'menstruation',
        };
        updateCachedUser(formattedServer);
        cacheFetchedUsers(
          { [formattedServer.userId]: formattedServer },
          cacheLoad2Users,
          filters,
        );
        setUsers(prev => ({ ...prev, [formattedServer.userId]: formattedServer }));
        setState(formattedServer);
      }
    } catch {
      // ignore fetch errors
    }
  };

  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('ownerId');
      setState({});
      setIsLoggedIn(false);
      setShowInfoModal(false);
      navigate('/my-profile');
      await signOut(auth);
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
      const newState = { ...prevState };
      let removedValue;

      if (isArray) {
        const filteredArray = prevState[fieldName].filter((_, i) => i !== idx);
        removedValue = prevState[fieldName][idx];

        if (filteredArray.length === 0 || (filteredArray.length === 1 && filteredArray[0] === '')) {
          const deletedValue = prevState[fieldName];
          delete newState[fieldName];
          removeKeyFromFirebase(fieldName, deletedValue, prevState.userId);
        } else if (filteredArray.length === 1) {
          newState[fieldName] = filteredArray[0];
        } else {
          newState[fieldName] = filteredArray;
        }
      } else {
        removedValue = prevState[fieldName];
        const deletedValue = prevState[fieldName];
        delete newState[fieldName];
        removeKeyFromFirebase(fieldName, deletedValue, prevState.userId);
      }

      handleSubmit(newState, 'overwrite', { [fieldName]: removedValue });
      return newState;
    });
  };

  const handleDelKeyValue = fieldName => {
    setState(prevState => {
      // Створюємо копію попереднього стану
      const newState = { ...prevState };

      const deletedValue = newState[fieldName];

      // Видаляємо ключ з нового стану
      delete newState[fieldName];

      // console.log('Видалили ключ з локального стану:', fieldName);
      // console.log('newState:', newState);

      // Встановлюємо значення 'del_key' для видалення
      //  newState[fieldName] = 'del_key';

      console.log(`Поле "${fieldName}" позначено для видалення`);

      // Видалення ключа з Firebase
      removeKeyFromFirebase(fieldName, deletedValue, prevState.userId);

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
    console.log('state2!!!!!!!!!! :>> ', state);
  }, [state]);

  useEffect(() => {
    isEditingRef.current = !!state.userId;
  }, [state.userId]);


  const [users, setUsers] = useState({});
  const [hasMore, setHasMore] = useState(true); // Стан для перевірки, чи є ще користувачі
  const [lastKey, setLastKey] = useState(null); // Стан для зберігання останнього ключа
  const [lastKey3, setLastKey3] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentFilter, setCurrentFilter] = useState('');
  const [dateOffset, setDateOffset] = useState(0);
  const [dateOffset2, setDateOffset2] = useState(0);
  const initialFav = getFavorites();
  const [favoriteUsersData, setFavoriteUsersData] = useState(initialFav);
  const initialDis = getDislikes();
  const [dislikeUsersData, setDislikeUsersData] = useState(initialDis);
  const [, setCacheCount] = useState(0);
  const [, setBackendCount] = useState(0);
  const [profileSource, setProfileSource] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlUserId = params.get('userId');
    const hasSearchParam = params.has('search');
    const urlSearchValue = hasSearchParam ? params.get('search') || '' : null;

    if (hasSearchParam) {
      setSearch(prev => (prev === urlSearchValue ? prev : urlSearchValue));
    } else if (urlUserId) {
      setSearch(prev => (prev ? prev : urlUserId));
    }

    if (urlUserId) {
      if (lastUrlUserIdRef.current !== urlUserId) {
        lastUrlUserIdRef.current = urlUserId;
        setProfileSource('');
        setState(prev => (prev?.userId === urlUserId ? prev : { userId: urlUserId }));
      }
    } else {
      lastUrlUserIdRef.current = null;
    }
  }, [location.search, setSearch, setState]);

  useEffect(() => {
    const normalized = (search || '').trim();
    if (!normalized) {
      if (lastSearchBarQuery !== '') {
        setLastSearchBarQuery('');
      }
      if (searchBarQueryActive) {
        setSearchBarQueryActive(false);
      }
      return;
    }
    if (normalized !== lastSearchBarQuery && searchBarQueryActive) {
      setSearchBarQueryActive(false);
    }
  }, [search, lastSearchBarQuery, searchBarQueryActive]);

  const handleSearchExecuted = useCallback(value => {
    const normalized = (value || '').trim();
    setSearchBarQueryActive(Boolean(normalized));
    setLastSearchBarQuery(normalized);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentUserId = params.get('userId');

    if (state.userId) {
      if (currentUserId !== state.userId) {
        params.set('userId', state.userId);
        const nextSearch = params.toString();
        const nextSearchString = nextSearch ? `?${nextSearch}` : '';
        if (nextSearchString !== location.search) {
          navigate({ pathname: location.pathname, search: nextSearchString }, { replace: true });
        }
      }
    } else if (currentUserId) {
      params.delete('userId');
      const nextSearch = params.toString();
      const nextSearchString = nextSearch ? `?${nextSearch}` : '';
      if (nextSearchString !== location.search) {
        navigate({ pathname: location.pathname, search: nextSearchString }, { replace: true });
      }
    }
  }, [state.userId, location.pathname, location.search, navigate]);

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

    filtersRef.current = nextValue;
    setSearchLoading(true);
    setHasSearched(true);
    setTotalCount(0);
    setFilters(nextValue);
  }, [setFilters, setHasSearched, setSearchLoading, setTotalCount]);

  useEffect(() => {
    if (!state.userId) return;

    if (Object.keys(state).length > 1) {
      if (!profileSource) {
        setProfileSource('cache');
      }
      return;
    }

    const cached = getCard(state.userId);
    if (cached) {
      setState(cached);
      setProfileSource('cache');
    } else {
      setProfileSource('loading');
      (async () => {
        try {
          const data = await fetchUserById(state.userId);
          if (data) {
            updateCard(state.userId, data);
            setState(data);
          }
        } catch (error) {
          toast.error(error.message);
        } finally {
          setProfileSource('backend');
        }
      })();
    }
  }, [state, profileSource, setState]);

  useEffect(() => {
    if (!state.userId) setProfileSource('');
  }, [state.userId]);

  const cacheFetchedUsers = useCallback(
    (usersObj, cacheFn, currentFilters = filters) => {
      cacheFn(usersObj, currentFilters);
    },
    [filters]
  );

  const buildQueryKey = (mode, currentFilters = {}, term = '') =>
    normalizeQueryKey(
      `${mode || 'all'}:${term || ''}:${JSON.stringify(currentFilters)}`,
    );

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const isDateInRange = dateStr => {
    const dates = Object.values(users)
      .map(u => u.getInTouch)
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

  const refreshStimulationShortcuts = useCallback(async () => {
    try {
      const { cards } = await getStimulationShortcutCards(id => fetchUserById(id));
      const ids = getStoredStimulationShortcutIds();
      if (!isMountedRef.current) return;
      setStimulationShortcutIdsState(ids);
      if (!Array.isArray(cards) || cards.length === 0) {
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
      refreshStimulationShortcuts();
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

      try {
        const fresh = await fetchUserById(id);
        if (fresh) {
          updateCard(id, fresh);
          setState(fresh);
          return;
        }
      } catch (error) {
        console.error('Failed to fetch profile for stimulation shortcut', error);
      }

      const fallback =
        (typeof userData === 'object' && userData?.userId ? userData : null) ||
        getCard(id) ||
        { userId: id };
      saveCard(fallback);
      setState(fallback);
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

  useEffect(() => {
    if (!ownerId) return;

    const shortcutsRef = ref(database, `multiData/stimulationShortcuts/${ownerId}`);
    const unsubscribe = onValue(shortcutsRef, snapshot => {
      const data = snapshot.exists() ? snapshot.val() : {};
      const ids = Object.keys(data).filter(Boolean);
      setStoredStimulationShortcutIds(ids);
      setStimulationShortcutIdsState(ids);
      refreshStimulationShortcuts();
    });

    return () => unsubscribe();
  }, [ownerId, refreshStimulationShortcuts]);

  useEffect(() => {
    if (!ownerId) return;

    const disRef = ref(database, `multiData/dislikes/${ownerId}`);
    const unsubscribe = onValue(disRef, snap => {
      const data = snap.exists() ? snap.val() : {};
      setDislikeUsersData(data);
      syncDislikes(data);
    });

    return () => unsubscribe();
  }, [ownerId]);

  useEffect(() => {
    localStorage.setItem('addFilters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    setUsers({});
    setLastKey(null);
    setLastKey3(null);
    setHasMore(true);
    setTotalCount(0);
    setCurrentPage(1);
    setCacheCount(0);
    setBackendCount(0);

    if (!currentFilter) {
      setSearchLoading(false);
      setHasSearched(false);
      return;
    }

    setSearchLoading(true);
    setHasSearched(true);

    if (currentFilter === 'DATE2') {
      loadMoreUsers2()
        .then(({ cacheCount, backendCount }) => {
          setCacheCount(cacheCount);
          setBackendCount(backendCount);
        })
        .finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === 'DATE3') {
      const queryKey = buildQueryKey('DATE3', filters, search);
      const ids = getIdsByQuery(queryKey);
      const cards = ids.map(id => getCard(id)).filter(Boolean);
      if (cards.length > 0) {
        const cachedUsers = cards.reduce((acc, u) => {
          acc[u.userId] = u;
          return acc;
        }, {});
        setUsers(cachedUsers);
        setTotalCount(ids.length);
        setCacheCount(cards.length);
        setBackendCount(0);
        setSearchLoading(false);
      } else {
        loadMoreUsers3()
          .then(({ cacheCount, backendCount }) => {
            setCacheCount(cacheCount);
            setBackendCount(backendCount);
          })
          .finally(() => setSearchLoading(false));
      }
      return;
    }

    if (currentFilter === 'FAVORITE') {
      loadFavoriteUsers().finally(() => setSearchLoading(false));
      return;
    }

    if (currentFilter === 'CYCLE_FAVORITE') {
      loadCycleFavorites().finally(() => setSearchLoading(false));
      return;
    }

    const queryKey = buildQueryKey(currentFilter, filters, search);
    const ids = getIdsByQuery(queryKey);
    const cards = ids.map(id => getCard(id)).filter(Boolean);
    if (cards.length > 0) {
      const cachedUsers = cards.reduce((acc, u) => {
        acc[u.userId] = u;
        return acc;
      }, {});
      setUsers(cachedUsers);
      setTotalCount(ids.length);
      setCacheCount(cards.length);
      setBackendCount(0);
      setSearchLoading(false);
    } else {
      loadMoreUsers(currentFilter)
        .then(({ cacheCount, backendCount }) => {
          setCacheCount(cacheCount);
          setBackendCount(backendCount);
        })
        .finally(() => setSearchLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentFilter, search]);


  const [adding, setAdding] = useState(false);

  const handleAddUser = async () => {
    setAdding(true);
    try {
      const rawSearch = search || '';
      const hasSearchText = rawSearch.trim().length > 0;

      if (!hasSearchText && searchKeyValuePair) {
        setSearchKeyValuePair(null);
      }

      const newProfile = await makeNewUser(
        hasSearchText ? searchKeyValuePair : null,
        rawSearch,
      );
      updateCachedUser(newProfile);
      cacheFetchedUsers(
        { [newProfile.userId]: newProfile },
        cacheLoad2Users,
        filters,
      );
      setUsers(prev => ({ ...prev, [newProfile.userId]: newProfile }));
      setState(newProfile);
      setUserNotFound(false);
    } finally {
      setAdding(false);
    }
  };
  const dotsMenu = () => {
    return (
      <>
        {isAdmin && (
          <>
            <SubmitButton onClick={() => navigate('/my-profile')}>my-profile</SubmitButton>
            <SubmitButton onClick={() => navigate('/add')}>add</SubmitButton>
            <SubmitButton onClick={() => navigate('/matching')}>matching</SubmitButton>
          </>
        )}
        <SubmitButton onClick={() => setShowInfoModal('delProfile')}>Видалити анкету</SubmitButton>
        <SubmitButton onClick={() => setShowInfoModal('viewProfile')}>Переглянути анкету</SubmitButton>
        {!isEmailVerified && <VerifyEmail />}
        {isLoggedIn && <ExitButton onClick={handleExit}>Exit</ExitButton>}
      </>
    );
  };

  const delConfirm = () => {
    // console.log('state :>> ', state);
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
        const res = await fetchNewUsersCollectionInRTDB({ name: '' });
        if (res) {
          cacheFetchedUsers(res, cacheLoad2Users);
          setUsers(res);
        }
        setSearch('');
        setState({});
        setShowInfoModal(null);
        setUserIdToDelete(null);
        console.log(`User ${id} deleted.`);
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
  const compareCards = () => {
    return (
      <>
        <p>Порівняти</p>
        {/* <p>{compare}</p> */}
        <div dangerouslySetInnerHTML={{ __html: compare }} />
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


  const loadMoreUsers = async (filterForload, currentFilters = filters) => {
    console.log('loadMoreUsers called with', {
      filterForload,
      lastKey,
      currentFilters,
    });
    const includeSpecialFutureDates = searchBarQueryActive;
    if (isEditingRef.current) return { count: 0, hasMore };
    const param = filterForload === 'DATE' ? dateOffset : lastKey;
    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }
    const res = await fetchPaginatedNewUsers(
      param,
      filterForload,
      currentFilters,
      fav,
      {
        includeSpecialFutureDates,
        dislikedUsers: dislikeUsersData,
      },
    );
    // console.log('res :>> ', res);
    // Перевіряємо, чи є користувачі у відповіді
    if (res && typeof res.users === 'object' && Object.keys(res.users).length > 0) {
      if (res.totalCount !== undefined) {
        setTotalCount(res.totalCount);
      }
      // console.log('222 :>> ');
      // console.log('res.users :>> ', res.users);

      // Використовуємо Object.entries для обробки res.users
      const newUsers = Object.entries(res.users)
        .filter(([id]) => !currentFilters.favorite?.favOnly || fav[id])
        .reduce((acc, [userId, user]) => {
        // Перевірка наявності поля userId, щоб уникнути помилок
        // console.log('3333 :>> ');
        if (user.userId) {
          acc[user.userId] = user; // Додаємо користувача до об'єкта
        } else {
          acc[userId] = user; // Якщо немає userId, використовуйте ключ об'єкта
        }
        return acc;
      }, {});
      cacheFetchedUsers(newUsers, cacheLoad2Users, currentFilters);

      // Оновлюємо стан користувачів
      setUsers(prevUsers => mergeWithoutOverwrite(prevUsers, newUsers));
      const queryKey = buildQueryKey(filterForload, currentFilters, search);
      const existingIds = getIdsByQuery(queryKey);
      setIdsForQuery(queryKey, [
        ...new Set([...existingIds, ...Object.keys(newUsers)]),
      ]);
      if (filterForload === 'DATE') {
        setDateOffset(prev => prev + PAGE_SIZE);
        setHasMore(res.hasMore);
      } else {
        setLastKey(res.lastKey); // Оновлюємо lastKey для наступного запиту
        setHasMore(res.hasMore); // Оновлюємо hasMore
      }
      const backendCount = Object.keys(newUsers).length;
      console.log('loaded users count', backendCount);
      console.log('next lastKey', res.lastKey);
      return { cacheCount: 0, backendCount, hasMore: res.hasMore };
    } else {
      setHasMore(false); // Якщо немає більше користувачів, оновлюємо hasMore
      return { cacheCount: 0, backendCount: 0, hasMore: false };
    }
  };

  const loadMoreUsers2 = async (currentFilters = filters) => {
    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }

    if (isEditingRef.current)
      return { cacheCount: 0, backendCount: 0, hasMore };

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
    const filteredArr = cachedArr.filter(
      u =>
        isValid(u.getInTouch) &&
        (!currentFilters.favorite?.favOnly || fav[u.userId]) &&
        passesReactionFilter(u, currentFilters?.reaction, fav, dislikeUsersData),
    );

    let offset = dateOffset2;

    const slice = filteredArr.slice(offset, offset + PAGE_SIZE);
    if (slice.length > 0) {
      const cachedUsers = slice.reduce((acc, u) => {
        acc[u.userId] = u;
        return acc;
      }, {});
      cacheFetchedUsers(cachedUsers, cacheLoad2Users, currentFilters);
      if (!isEditingRef.current) {
        setUsers(prev => mergeWithoutOverwrite(prev, cachedUsers));
      }
      offset += slice.length;
      if (fromCache) cacheCount += slice.length;
      else backendCount += slice.length;
    }

    let more = filteredArr.length > offset;

    if (!more && slice.length < PAGE_SIZE) {
      const res = await fetchFilteredUsersByPage(
        offset,
        undefined,
        undefined,
        currentFilters,
        fav,
        dislikeUsersData,
        undefined,
        partial => {
          const filteredPartial = currentFilters.favorite?.favOnly
            ? Object.fromEntries(Object.entries(partial).filter(([id]) => fav[id]))
            : partial;
          cacheFetchedUsers(filteredPartial, cacheLoad2Users, currentFilters);
          if (!isEditingRef.current) {
            setUsers(prev => mergeWithoutOverwrite(prev, filteredPartial));
          }
          backendCount += Object.keys(filteredPartial).length;
        },
      );
      if (res && Object.keys(res.users).length > 0) {
        const filteredUsers = currentFilters.favorite?.favOnly
          ? Object.fromEntries(Object.entries(res.users).filter(([id]) => fav[id]))
          : res.users;
        cacheFetchedUsers(filteredUsers, cacheLoad2Users, currentFilters);
        if (!isEditingRef.current) {
          setUsers(prev => mergeWithoutOverwrite(prev, filteredUsers));
        }
        offset = res.lastKey;
        more = res.hasMore;
        backendCount += Object.keys(filteredUsers).length;
      } else {
        more = false;
      }
    }

    setDateOffset2(offset);
    setHasMore(more);
    return { cacheCount, backendCount, hasMore: more };
  };

  const loadMoreUsers3 = async (currentFilters = filters) => {
    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }

    if (isEditingRef.current)
      return { cacheCount: 0, backendCount: 0, hasMore };

    const includeSpecialFutureDates = searchBarQueryActive;
    let backendCount = 0;
    const aggregatedUsers = {};
    let nextKey = lastKey3;
    let more = true;
    let totalWasSet = false;

    while (backendCount < PAGE_SIZE && more) {
      const res = await fetchPaginatedNewUsers(
        nextKey,
        'DATE3',
        currentFilters,
        fav,
        {
          includeSpecialFutureDates,
          skipGetInTouchFilter: true,
          dislikedUsers: dislikeUsersData,
        },
      );

      if (!res || !res.users) {
        more = false;
        nextKey = res?.lastKey ?? null;
        break;
      }

      if (!totalWasSet && res.totalCount !== undefined) {
        setTotalCount(res.totalCount);
        totalWasSet = true;
      }

      const entries = Object.entries(res.users);

      if (entries.length === 0) {
        nextKey = res.lastKey ?? null;
        more = !!res.hasMore && nextKey !== null;
        if (!more) break;
        // продовжуємо завантаження, бо фільтри відсікли весь блок
        // eslint-disable-next-line no-continue
        continue;
      }

      const normalized = entries.reduce((acc, [userId, user]) => {
        const targetId = user.userId || userId;
        if (!aggregatedUsers[targetId]) {
          acc[targetId] = { ...user, userId: targetId };
        }
        return acc;
      }, {});

      const chunkKeys = Object.keys(normalized);
      chunkKeys.forEach(id => {
        if (!aggregatedUsers[id]) {
          aggregatedUsers[id] = normalized[id];
        }
      });
      backendCount += chunkKeys.length;

      nextKey = res.lastKey ?? null;
      more = !!res.hasMore && nextKey !== null;

      if (!more) break;
    }

    if (backendCount > 0) {
      cacheFetchedUsers(aggregatedUsers, cacheLoad2Users, currentFilters);
      if (!isEditingRef.current) {
        setUsers(prev => mergeWithoutOverwrite(prev, aggregatedUsers));
      }
      const queryKey = buildQueryKey('DATE3', currentFilters, search);
      const existingIds = getIdsByQuery(queryKey);
      setIdsForQuery(queryKey, [
        ...new Set([...existingIds, ...Object.keys(aggregatedUsers)]),
      ]);
    } else if (!more) {
      setTotalCount(prev => prev || 0);
    }

    setLastKey3(nextKey);
    setHasMore(more);

    return { cacheCount: 0, backendCount, hasMore: more };
  };


  const handlePageChange = async page => {
    const needed = page * PAGE_SIZE;
    let loaded = Object.keys(users).length;
    let more = hasMore;
    let cacheLoaded = 0;
    let backendLoaded = 0;

    while (more && loaded < needed) {
      const { cacheCount, backendCount, hasMore: nextMore } =
        currentFilter === 'DATE2'
          ? await loadMoreUsers2()
          : currentFilter === 'DATE3'
          ? await loadMoreUsers3()
          : await loadMoreUsers(currentFilter);
      cacheLoaded += cacheCount;
      backendLoaded += backendCount;
      loaded += cacheCount + backendCount;
      more = nextMore;
    }
    setCacheCount(cacheLoaded);
    setBackendCount(backendLoaded);
    setCurrentPage(page);
  };

  const exportFilteredUsers = async () => {
    const noFilters = !filters || Object.values(filters).every(value => value === 'off');

    let fav = favoriteUsersData;
    if (filters.favorite?.favOnly && Object.keys(fav).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
    }

    const allUsers = noFilters
      ? await fetchAllUsersFromRTDB()
      : await fetchAllFilteredUsers(undefined, filters, fav, {
          includeSpecialFutureDates: true,
          dislikedUsers: dislikeUsersData,
        });

    saveToContact(allUsers);
  };

  const saveAllContacts = async () => {
    const res = await fetchAllUsersFromRTDB();
    saveToContact(res);
  };

  const fetchAndMergeFavoriteUsers = async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return null;

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

    const favUsers = await fetchFavoriteUsersData(owner);
    Object.entries(favUsers).forEach(([id, user]) => {
      favIds[id] = true;
      if (id && !loaded[id]) {
        loaded[id] = user;
        backendCount += 1;
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
  };

  const loadFavoriteUsers = async () => {
    const result = await fetchAndMergeFavoriteUsers();
    if (!result) return;
    const { loaded, normalizedFavs, cacheCount, backendCount } = result;

    const sortedUsers = Object.keys(normalizedFavs)
      .map(id => loaded[id])
      .filter(Boolean)
      .sort((a, b) => compareUsersByGetInTouch(a, b));

    const sorted = sortedUsers.reduce((acc, user) => {
      acc[user.userId] = user;
      return acc;
    }, {});
    const total = sortedUsers.length;
    setUsers(sorted);
    setHasMore(false);
    setLastKey(null);
    setCurrentPage(1);
    setTotalCount(total);
    setCacheCount(cacheCount);
    setBackendCount(backendCount);
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

    cacheFetchedUsers(cycleUsers, cacheLoad2Users, filters);
    setUsers(sorted);
    setHasMore(false);
    setLastKey(null);
    setCurrentPage(1);
    setTotalCount(sortedUsers.length);
    setCacheCount(0);
    setBackendCount(sortedUsers.length);
  };

  const indexStimulationShortcuts = useCallback(async () => {
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
  }, [isDuplicateView, state.userId]);

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

  const handleInfo = async () => {
    const count = await fetchTotalNewUsersCount();
    alert(`Total cards in newUsers: ${count}`);
  };

  const handleClearCache = () => {
    clearAllCardsCache();
    localStorage.removeItem('addFilters');
    toast.success('Cache cleared');
  };

  const makeIndex = async () => {
    toast.loading('Indexing newUsers 0%', { id: 'index-progress' });
    await createSearchIdsInCollection('newUsers', progress => {
      toast.loading(`Indexing newUsers ${progress}%`, { id: 'index-progress' });
    });
    toast.loading('Indexing users 0%', { id: 'index-progress' });
    await createSearchIdsInCollection('users', progress => {
      toast.loading(`Indexing users ${progress}%`, { id: 'index-progress' });
    });
    toast.success('Indexing finished', { id: 'index-progress' });

    // const res = await fetchListOfUsers();
    // res.forEach(async userId => {
    //   const result = { userId: userId };
    //   const res = await fetchNewUsersCollectionInRTDB(result);
    //   console.log('res :>> ', res);
    //   handleSubmit(res, false, false, true);
    //   // writeData(userId); // Викликаємо writeData() для кожного ID
    // });
  };

  const indexLastLoginHandler = async () => {
    toast.loading('Indexing lastLogin2 0%', { id: 'index-lastlogin-progress' });
    await indexLastLogin(progress => {
      toast.loading(`Indexing lastLogin2 ${progress}%`, {
        id: 'index-lastlogin-progress',
      });
    });
    toast.success('lastLogin2 indexed', { id: 'index-lastlogin-progress' });
  };

  const fieldsToRender = getFieldsToRender(state);

  const effectiveCycleStatus = getEffectiveCycleStatus(state);
  const scheduleUserData = state
    ? { ...state, cycleStatus: effectiveCycleStatus ?? state.cycleStatus }
    : state;
  const shouldShowSchedule = ['stimulation', 'pregnant'].includes(effectiveCycleStatus);


  // const fieldsToRender = [
  //   ...pickerFields,

  // ];


  const shouldPaginate =
    currentFilter !== 'FAVORITE' && currentFilter !== 'CYCLE_FAVORITE';
  const totalPages = shouldPaginate ? Math.ceil(totalCount / PAGE_SIZE) || 1 : 1;
  const getSortedIds = () => {
    const ids = Object.keys(users);
    if (isDuplicateView || currentFilter === 'CYCLE_FAVORITE') {
      return ids;
    }
    return ids.sort((a, b) =>
      compareUsersByGetInTouch(users[a] || {}, users[b] || {}),
    );
  };

  const sortedIds = getSortedIds();
  const displayedUserIds = shouldPaginate
    ? sortedIds.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : sortedIds;
  const paginatedUsers = displayedUserIds.reduce((acc, id) => {
    acc[id] = users[id];
    return acc;
  }, {});

  return (
    <Container>
      <InnerContainer>
        {isLoggedIn && (
          <TopButtons>
            <DotsButton
              style={{ marginLeft: 0 }}
              onClick={() => {
                setShowInfoModal('dotsMenu');
              }}
            >
              ⋮
            </DotsButton>
          </TopButtons>
        )}

        <SearchBar
          searchFunc={fetchNewUsersCollectionInRTDB}
          search={search}
          setSearch={value => {
            setSearchLoading(true);
            setHasSearched(true);
            setTotalCount(0);
            setSearch(value);
          }}
          setUsers={setUsers}
          setState={setState}
          setUserNotFound={setUserNotFound}
          onSearchKey={setSearchKeyValuePair}
          onSearchExecuted={handleSearchExecuted}
          onClear={() => {
            localStorage.removeItem(SEARCH_KEY);
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
        />
        {state.userId ? (
          <>
            <div style={{ ...coloredCard(), marginBottom: '8px' }}>
              {renderTopBlock(
                state,
                setUsers,
                setShowInfoModal,
                setState,
                setUserIdToDelete,
                false,
                favoriteUsersData,
                setFavoriteUsersData,
                dislikeUsersData,
                setDislikeUsersData,
                currentFilter,
                isDateInRange,
                openMedicationsModal,
              )}
            </div>
            {shouldShowSchedule && state && (
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
            />
          </>
        ) : (
          <div>
            {(searchLoading || hasSearched) && !userNotFound && (
              <p style={{ textAlign: 'center', color: 'black' }}>
                Знайдено {searchLoading ? <span className="spinner" /> : totalCount} користувачів.
              </p>
            )}
            {userNotFound && hasSearched && (
              <p style={{ textAlign: 'center', color: 'black' }}>No result</p>
            )}
            <FilterPanel onChange={handleFilterChange} storageKey="addFilters" />
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
              <Button onClick={handleInfo}>Info</Button>
              <Button onClick={handleClearCache}>ClearCache</Button>
              {stimulationScheduleProfiles.map(user => (
                <Button
                  key={`schedule-${user.userId}`}
                  onClick={() => handleOpenScheduleProfile(user)}
                  title={user?.surname || ''}
                >
                  {getSurnameLabel(user)}
                </Button>
              ))}
              <Button
                onClick={async () => {
                  setUsers({});
                  setLastKey(null);
                  setHasMore(true);
                  setCurrentPage(1);
                  setCurrentFilter('DATE');
                  setDateOffset(0);
                  setDuplicates('');
                  setIsDuplicateView(false);
                  const { cacheCount, backendCount } = await loadMoreUsers('DATE');
                  setCacheCount(cacheCount);
                  setBackendCount(backendCount);
                }}
              >
                Load
              </Button>
              <Button
                onClick={async () => {
                  setUsers({});
                  setHasMore(true);
                  setCurrentPage(1);
                  setCurrentFilter('DATE2');
                  setDateOffset2(0);
                  setDuplicates('');
                  setIsDuplicateView(false);
                  const { cacheCount, backendCount } = await loadMoreUsers2();
                  setCacheCount(cacheCount);
                  setBackendCount(backendCount);
                }}
              >
                Load2
              </Button>
              <Button
                onClick={async () => {
                  setUsers({});
                  setHasMore(true);
                  setCurrentPage(1);
                  setCurrentFilter('DATE3');
                  setLastKey3(null);
                  setDuplicates('');
                  setIsDuplicateView(false);
                  const { cacheCount, backendCount } = await loadMoreUsers3();
                  setCacheCount(cacheCount);
                  setBackendCount(backendCount);
                }}
              >
                Load3
              </Button>
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
              <Button onClick={indexLastLoginHandler}>indexLastLogin</Button>
              <Button
                onClick={indexStimulationShortcuts}
                title="Індексація ярликів стимуляції"
              >
                IdxSC
              </Button>
              <Button onClick={makeIndex}>Index</Button>
              {<Button onClick={searchDuplicates}>DPL</Button>}
              {
                <Button
                  onClick={() => {
                    btnMerge(users, setUsers, setDuplicates);
                  }}
                >
                  Merg
                </Button>
              }
              {btnExportUsers(exportFilteredUsers)}
              <Button onClick={saveAllContacts}> S_All</Button>

              {/* <ExcelToJson/> */}
              {/* <UploadJson/> */}
              {/* <JsonToExcelButton/> */}
              {/* {users && <div>Знайдено {Object.keys(users).length}</div>} */}
            </ButtonsContainer>
            {!userNotFound && (
              <>
                <UsersList
                  setCompare={setCompare}
                  setShowInfoModal={setShowInfoModal}
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
        />
      )}
    </Container>
  );
};

export default AddNewProfile;
