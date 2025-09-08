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
  // removeSpecificSearchId,
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
import {
  setIdsForQuery,
  getIdsByQuery,
  getCard,
  normalizeQueryKey,
} from 'utils/cardIndex';
// import ExcelToJson from './ExcelToJson';
import { saveToContact } from './ExportContact';
import { renderTopBlock } from './smallCard/renderTopBlock';
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
} from 'utils/cache';
import {
  formatDateAndFormula,
  formatDateToDisplay,
  formatDateToServer,
} from 'components/inputValidations';

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

  const [userNotFound, setUserNotFound] = useState(false);

  const SEARCH_KEY = 'addSearchQuery';
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(location.search);
    const urlSearch = params.get('search');
    if (urlSearch) return urlSearch;
    return localStorage.getItem(SEARCH_KEY) || '';
  });

  const [state, setState] = useState({});
  const isEditingRef = useRef(false);

  const [searchKeyValuePair, setSearchKeyValuePair] = useState(null);
  const [filters, setFilters] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [userIdToDelete, setUserIdToDelete] = useState(null);
  const navigate = useNavigate();
  const isAdmin = auth.currentUser?.uid === process.env.REACT_APP_USER1;

  useEffect(() => {
    const storedSearch = localStorage.getItem(SEARCH_KEY);
    if (storedSearch) {
      setSearch(storedSearch);
    }
  }, []); // run once

  const handleBlur = () => {
    handleSubmit();
  };

  const handleSubmit = async (newState, overwrite, delCondition, makeIndex) => {
    const fieldsForNewUsersOnly = ['role', 'lastCycle', 'myComment', 'writer'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
    const commonFields = ['lastAction', 'lastLogin2', 'getInTouch', 'lastDelivery', 'ownKids'];

    const formatDate = date => {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };
    const currentDate = formatDate(new Date());
    const now = Date.now();
    const baseState = newState ? { ...newState } : { ...state };
    const updatedState = { ...baseState, lastAction: currentDate, updatedAt: now };

    // Optimistically update local cache and UI state before syncing with server
    setState(updatedState);
    const removeKeys = delCondition ? Object.keys(delCondition) : [];
    updateCachedUser(updatedState, { removeKeys });
    cacheFetchedUsers({ [updatedState.userId]: updatedState }, cacheLoad2Users, filters);
    setUsers(prev => ({ ...prev, [updatedState.userId]: updatedState }));

    const syncedState = {
      ...updatedState,
      lastDelivery: formatDateToServer(
        formatDateAndFormula(updatedState.lastDelivery)
      ),
    };

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

      await updateDataInNewUsersRTDB(syncedState.userId, cleanedStateForNewUsers, 'update');
    } else {
      if (newState) {
        await updateDataInNewUsersRTDB(
          syncedState.userId,
          { ...newState, lastDelivery: syncedState.lastDelivery },
          'update',
        );
      } else {
        await updateDataInNewUsersRTDB(syncedState.userId, syncedState, 'update');
      }
    }

    try {
      const serverData = await fetchUserById(syncedState.userId);
      if (serverData?.updatedAt && serverData.updatedAt > syncedState.updatedAt) {
        const formattedServer = {
          ...serverData,
          lastDelivery: formatDateToDisplay(serverData.lastDelivery),
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

  const handleCloseModal = () => {
    // setIsModalOpen(false);
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
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentFilter, setCurrentFilter] = useState('');
  const [dateOffset, setDateOffset] = useState(0);
  const [dateOffset2, setDateOffset2] = useState(0);
  const initialFav = getFavorites();
  const [favoriteUsersData, setFavoriteUsersData] = useState(initialFav);
  const initialDis = getDislikes();
  const [dislikeUsersData, setDislikeUsersData] = useState(initialDis);
  const [isToastOn, setIsToastOn] = useState(false);

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

  const getInTouchSortValue = d => {
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
  };

  const compareUsersByGetInTouch = (a, b) => {
    const av = getInTouchSortValue(a.getInTouch);
    const bv = getInTouchSortValue(b.getInTouch);
    if (av.priority !== bv.priority) return av.priority - bv.priority;
    if (av.priority === 1) return bv.value.localeCompare(av.value);
    if (av.priority === 2) return (av.value || '').localeCompare(bv.value || '');
    return 0;
  };

  const ownerId = auth.currentUser?.uid;

  useEffect(() => {
    setFavoriteIds(initialFav);
  }, [initialFav]);

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
    setHasMore(true);
    setTotalCount(0);
    setCurrentPage(1);

    if (!currentFilter) return;

    if (currentFilter === 'DATE2') {
      loadMoreUsers2();
      return;
    }

    if (currentFilter === 'FAVORITE') {
      loadFavoriteUsers();
      return;
    }

    const queryKey = buildQueryKey(currentFilter, filters, search);
    const ids = getIdsByQuery(queryKey);
    const cards = ids.map(id => getCard(id)).filter(Boolean);
    if (cards.length > 0) {
      const cachedUsers = cards.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {});
      setUsers(cachedUsers);
      setTotalCount(ids.length);
    } else {
      loadMoreUsers(currentFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentFilter, search]);


  const [adding, setAdding] = useState(false);

  const handleAddUser = async () => {
    setAdding(true);
    const newProfile = await makeNewUser(searchKeyValuePair);
    updateCachedUser(newProfile);
    cacheFetchedUsers({ [newProfile.userId]: newProfile }, cacheLoad2Users, filters);
    setUsers(prev => ({ ...prev, [newProfile.userId]: newProfile }));
    setState(newProfile);
    setUserNotFound(false);
    setAdding(false);
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
    if (isEditingRef.current) return { count: 0, hasMore };
    const param = filterForload === 'DATE' ? dateOffset : lastKey;
    let favRaw = getFavorites();
    let fav = Object.fromEntries(Object.entries(favRaw).filter(([, v]) => v));
    if (currentFilters.favorite?.favOnly && Object.keys(favRaw).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
      syncFavorites(fav);
    }
    const res = await fetchPaginatedNewUsers(param, filterForload, currentFilters, fav);
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
      const count = Object.keys(newUsers).length;
      console.log('loaded users count', count);
      console.log('next lastKey', res.lastKey);
      return { count, hasMore: res.hasMore };
    } else {
      setHasMore(false); // Якщо немає більше користувачів, оновлюємо hasMore
      return { count: 0, hasMore: false };
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

    if (isEditingRef.current) return { count: 0, hasMore };

    const cachedArr = await getLoad2Cards(currentFilters, id => fetchUserById(id));
    const today = new Date().toISOString().split('T')[0];
    const isValid = d => {
      if (!d) return true;
      if (d === '2099-99-99' || d === '9999-99-99') return false;
      return !/^\d{4}-\d{2}-\d{2}$/.test(d) || d <= today;
    };
    const filteredArr = cachedArr.filter(
      u => isValid(u.getInTouch) && (!currentFilters.favorite?.favOnly || fav[u.id]),
    );

    let offset = dateOffset2;
    let count = 0;

    const slice = filteredArr.slice(offset, offset + PAGE_SIZE);
    if (slice.length > 0) {
      const cachedUsers = slice.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {});
      cacheFetchedUsers(cachedUsers, cacheLoad2Users, currentFilters);
      if (!isEditingRef.current) {
        setUsers(prev => mergeWithoutOverwrite(prev, cachedUsers));
      }
      offset += slice.length;
      count += slice.length;
    }

    let more = filteredArr.length > offset;

    if (!more && slice.length < PAGE_SIZE) {
      const res = await fetchFilteredUsersByPage(
        offset,
        undefined,
        undefined,
        currentFilters,
        fav,
        undefined,
        partial => {
          const filteredPartial = currentFilters.favorite?.favOnly
            ? Object.fromEntries(Object.entries(partial).filter(([id]) => fav[id]))
            : partial;
          cacheFetchedUsers(filteredPartial, cacheLoad2Users, currentFilters);
          if (!isEditingRef.current) {
            setUsers(prev => mergeWithoutOverwrite(prev, filteredPartial));
          }
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
        count += Object.keys(filteredUsers).length;
      } else {
        more = false;
      }
    }

    setDateOffset2(offset);
    setHasMore(more);
    return { count, hasMore: more };
  };


  const handlePageChange = async page => {
    const needed = page * PAGE_SIZE;
    let loaded = Object.keys(users).length;
    let more = hasMore;

    while (more && loaded < needed) {
      const { count, hasMore: nextMore } =
        currentFilter === 'DATE2'
          ? await loadMoreUsers2()
          : await loadMoreUsers(currentFilter);
      loaded += count;
      more = nextMore;
    }
    setCurrentPage(page);
  };

  const exportFilteredUsers = async () => {
    const noFilters = !filters || Object.values(filters).every(value => value === 'off');

    let fav = favoriteUsersData;
    if (filters.favorite?.favOnly && Object.keys(fav).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
    }

    const allUsers = noFilters ? await fetchAllUsersFromRTDB() : await fetchAllFilteredUsers(undefined, filters, fav);

    saveToContact(allUsers);
  };

  const saveAllContacts = async () => {
    const res = await fetchAllUsersFromRTDB();
    saveToContact(res);
  };

  const loadFavoriteUsers = async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;

    const existingIds = getIdsByQuery('favorite');
    if (existingIds.length > 0) {
      const favMap = getFavorites();
      setFavoriteUsersData(favMap);
      setFavoriteIds(favMap);
      syncFavorites(favMap);
      const loadedArr = await getFavoriteCards(id => fetchUserById(id));
      const sorted = loadedArr
        .sort((a, b) => compareUsersByGetInTouch(a, b))
        .reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});
      const total = Object.keys(sorted).length;
      cacheFetchedUsers(sorted, cacheFavoriteUsers);
      setUsers(sorted);
      setHasMore(false);
      setLastKey(null);
      setCurrentPage(1);
      setTotalCount(total);
      return;
    }

    const favUsers = await fetchFavoriteUsersData(owner);
    const favIds = Object.keys(favUsers).reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {});
    syncFavorites(favIds);
    setFavoriteUsersData(favIds);
    setFavoriteIds(favIds);
    cacheFavoriteUsers(favUsers);
    setIdsForQuery('favorite', Object.keys(favIds));
    const loadedArr = await getFavoriteCards(id => fetchUserById(id));
    const sorted = loadedArr
      .sort((a, b) => compareUsersByGetInTouch(a, b))
      .reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});
    const total = Object.keys(sorted).length;
    cacheFetchedUsers(sorted, cacheFavoriteUsers);
    setUsers(sorted);
    setHasMore(false);
    setLastKey(null);
    setCurrentPage(1);
    setTotalCount(total);
  };

  const [duplicates, setDuplicates] = useState('');
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
      const cached = await getDplCards(verifyDuplicate);
      if (cached.length > 0) {
        const merged = cached.reduce((acc, user) => {
          acc[user.id] = user;
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
    const cached = await getDplCards();
    if (cached.length > 0) {
      const merged = cached.reduce((acc, user) => {
        acc[user.id] = user;
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


  // const fieldsToRender = [
  //   ...pickerFields,

  // ];


  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const getSortedIds = () => {
    const ids = Object.keys(users);
    if (isDuplicateView) {
      return ids;
    }
    return ids.sort((a, b) =>
      compareUsersByGetInTouch(users[a] || {}, users[b] || {}),
    );
  };

  const displayedUserIds = getSortedIds().slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
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
          setSearch={setSearch}
          setUsers={setUsers}
          setState={setState}
          setUserNotFound={setUserNotFound}
          onSearchKey={setSearchKeyValuePair}
          onClear={() => {
            localStorage.removeItem(SEARCH_KEY);
            setState({});
            setSearchKeyValuePair(null);
            // У режимі перегляду дублікатів зберігаємо поточний список
            if (!isDuplicateView) {
              setUsers({});
            }
            setUserNotFound(false);
          }}
          storageKey={SEARCH_KEY}
        />
        {state.userId ? (
          <>
            <div style={{ ...coloredCard() }}>
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
                isToastOn,
                setIsToastOn,
              )}
            </div>

            <ProfileForm
              state={state}
              setState={setState}
              handleBlur={handleBlur}
              handleSubmit={handleSubmit}
              handleClear={handleClear}
              handleDelKeyValue={handleDelKeyValue}
            />
          </>
        ) : (
          <div>
            {users && !userNotFound ? (
              <p style={{ textAlign: 'center', color: 'black' }}>Знайдено {totalCount} користувачів.</p>
            ) : userNotFound ? (
              <p style={{ textAlign: 'center', color: 'black' }}>No result</p>
            ) : Object.keys(users).length > 1 ? (
              <p style={{ textAlign: 'center', color: 'black' }}>
                {totalCount} користувачів
                {duplicates ? ` з (${duplicates})` : ''}
              </p>
            ) : null}
            <FilterPanel onChange={setFilters} storageKey="addFilters" />
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
              <Button
                onClick={() => {
                  setUsers({});
                  setLastKey(null);
                  setHasMore(true);
                  setCurrentPage(1);
                  setCurrentFilter('DATE');
                  setDateOffset(0);
                  setDuplicates('');
                  setIsDuplicateView(false);
                  loadMoreUsers('DATE');
                }}
              >
                Load
              </Button>
              <Button
                onClick={() => {
                  setUsers({});
                  setHasMore(true);
                  setCurrentPage(1);
                  setCurrentFilter('DATE2');
                  setDateOffset2(0);
                  setDuplicates('');
                  setIsDuplicateView(false);
                  loadMoreUsers2();
                }}
              >
                Load2
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
              <Button onClick={indexLastLoginHandler}>indexLastLogin</Button>
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
