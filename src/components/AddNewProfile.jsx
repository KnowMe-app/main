import React, { useEffect, useRef, useState } from 'react';
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
  createIndexesSequentiallyInCollection,
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

  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(location.search);
    const urlSearch = params.get('search');
    if (urlSearch) return urlSearch;
    return localStorage.getItem('searchQuery') || '';
  });

  const [state, setState] = useState({});
  const isEditingRef = useRef(false);

  const [searchKeyValuePair, setSearchKeyValuePair] = useState(null);
  const [filters, setFilters] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const isAdmin = auth.currentUser?.uid === process.env.REACT_APP_USER1;

  const handleBlur = () => {
    handleSubmit();
  };

  const handleSubmit = async (newState, overwrite, delCondition, makeIndex) => {
    const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
    const commonFields = ['lastAction', 'lastLogin2'];

    const formatDate = date => {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };
    const currentDate = formatDate(new Date());

    const updatedState = newState ? { ...newState, lastAction: currentDate } : { ...state, lastAction: currentDate };

    if (updatedState?.userId?.length > 20) {
      const { existingData } = await fetchUserById(updatedState.userId);

      const cleanedState = Object.fromEntries(
        Object.entries(updatedState).filter(([key]) => commonFields.includes(key) || !fieldsForNewUsersOnly.includes(key))
      );

      const uploadedInfo = makeUploadedInfo(existingData, cleanedState, overwrite);

      if (!makeIndex) {
        await updateDataInRealtimeDB(updatedState.userId, uploadedInfo, 'update');
        await updateDataInFiresoreDB(updatedState.userId, uploadedInfo, 'check', delCondition);
      }

      const cleanedStateForNewUsers = Object.fromEntries(
        Object.entries(updatedState).filter(([key]) => [...fieldsForNewUsersOnly, ...contacts].includes(key))
      );

      await updateDataInNewUsersRTDB(updatedState.userId, cleanedStateForNewUsers, 'update');
    } else {
      console.log('kkkkkkkkkk :>> ');
      if (newState) {
        await updateDataInNewUsersRTDB(state.userId, newState, 'update');
      } else {
        await updateDataInNewUsersRTDB(state.userId, state, 'update');
      }
    }
  };

  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
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
      let removedValue;

      if (isArray) {
        const filteredArray = prevState[fieldName].filter((_, i) => i !== idx);
        removedValue = prevState[fieldName][idx];

        // Прибираємо порожні значення, щоб визначити, чи залишились валідні дані
        const cleanedArray = filteredArray.filter(item => item !== '');

        if (cleanedArray.length === 0) {
          const { [fieldName]: _, ...rest } = prevState;
          removeKeyFromFirebase(fieldName, prevState[fieldName], prevState.userId);
          return rest;
        }

        const newValue = cleanedArray.length === 1 ? cleanedArray[0] : cleanedArray;
        const newState = { ...prevState, [fieldName]: newValue };
        handleSubmit(newState, 'overwrite', { [fieldName]: removedValue });
        return newState;
      } else {
        removedValue = prevState[fieldName];
        const newState = { ...prevState, [fieldName]: '' };
        handleSubmit(newState, 'overwrite', { [fieldName]: removedValue });
        return newState;
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

      // console.log('Видалили ключ з локального стану:', fieldName);
      // console.log('newState:', newState);

      // Встановлюємо значення 'del_key' для видалення
      //  newState[fieldName] = 'del_key';

      console.log(`Поле "${fieldName}" позначено для видалення`);

      // Видалення ключа з Firebase
      removeKeyFromFirebase(fieldName, deletedValue, prevState.userId);

      return newState; // Повертаємо оновлений стан
    });
  };

  const [isEmailVerified, setIsEmailVerified] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user && user.emailVerified) {
        setIsEmailVerified(true);
      } else {
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
  const [currentFilter, setCurrentFilter] = useState(null);
  const [dateOffset, setDateOffset] = useState(0);
  const [dateOffset2, setDateOffset2] = useState(0);
  const [favoriteUsersData, setFavoriteUsersData] = useState({});

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

  const ownerId = auth.currentUser?.uid;

  useEffect(() => {
    if (!ownerId) return;

    const favRef = ref(database, `multiData/favorites/${ownerId}`);
    const unsubscribe = onValue(favRef, snap => {
      setFavoriteUsersData(snap.exists() ? snap.val() : {});
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
    if (currentFilter) {
      if (currentFilter === 'DATE2') {
        loadMoreUsers2();
      } else {
        loadMoreUsers(currentFilter);
      }
    }
    // loadMoreUsers depends on many state values, so we skip it from the deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentFilter]);


  const [adding, setAdding] = useState(false);

  const handleAddUser = async () => {
    setAdding(true);
    const newUser = await makeNewUser(searchKeyValuePair);
    setState(newUser);
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
        await removeCardAndSearchId(state.userId);
        setUsers(prevUsers => {
          const updatedUsers = { ...prevUsers };
          delete updatedUsers[state.userId];
          return updatedUsers;
        });
        const res = await fetchNewUsersCollectionInRTDB({ name: '' });
        if (res) setUsers(res);
        setSearch('');
        setState({});
        setShowInfoModal(null);
        console.log(`User ${state.userId} deleted.`);
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
            <SubmitButton onClick={() => setShowInfoModal(null)}>Відмінити</SubmitButton>
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
    let fav = favoriteUsersData;
    if (currentFilters.favorite?.favOnly && Object.keys(fav).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
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
      const newUsers = Object.entries(res.users).reduce((acc, [userId, user]) => {
        // Перевірка наявності поля userId, щоб уникнути помилок
        // console.log('3333 :>> ');
        if (user.userId) {
          acc[user.userId] = user; // Додаємо користувача до об'єкта
        } else {
          acc[userId] = user; // Якщо немає userId, використовуйте ключ об'єкта
        }
        return acc;
      }, {});

      // Оновлюємо стан користувачів
      // Оновлюємо стан користувачів
      setUsers(prevUsers => mergeWithoutOverwrite(prevUsers, newUsers)); // Додаємо нових користувачів до попередніх без перезапису
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
    let fav = favoriteUsersData;
    if (currentFilters.favorite?.favOnly && Object.keys(fav).length === 0) {
      fav = await fetchFavoriteUsers(auth.currentUser.uid);
      setFavoriteUsersData(fav);
    }

    if (isEditingRef.current) return { count: 0, hasMore };

    const res = await fetchFilteredUsersByPage(
      dateOffset2,
      undefined,
      undefined,
      currentFilters,
      fav,
      undefined,
      partial => {
        if (!isEditingRef.current) {
          setUsers(prev => mergeWithoutOverwrite(prev, partial));
        }
      }
    );
    if (res && Object.keys(res.users).length > 0) {
      if (!isEditingRef.current) {
        setUsers(prev => mergeWithoutOverwrite(prev, res.users));
      }
      setDateOffset2(res.lastKey);
      setHasMore(res.hasMore);
      const count = Object.keys(res.users).length;
      return { count, hasMore: res.hasMore };
    }
    setHasMore(false);
    return { count: 0, hasMore: false };
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
    const favIds = await fetchFavoriteUsers(owner);
    setFavoriteUsersData(favIds);
    const loaded = await fetchFavoriteUsersData(owner);
    setUsers(loaded);
    setHasMore(false);
    setLastKey(null);
    setCurrentPage(1);
    setTotalCount(Object.keys(loaded).length);
  };

  const [duplicates, setDuplicates] = useState('');

  const searchDuplicates = async () => {
    const { mergedUsers, totalDuplicates } = await loadDuplicateUsers();
    // console.log('res :>> ', res);
    setUsers(prevUsers => ({ ...prevUsers, ...mergedUsers }));
    setDuplicates(totalDuplicates);
    // console.log('res!!!!!!!! :>> ', res.length);
  };

  const handleInfo = async () => {
    const count = await fetchTotalNewUsersCount();
    alert(`Total cards in newUsers: ${count}`);
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

  const indexData = async () => {
    const collections = ['newUsers', 'users'];
    for (const col of collections) {
      await createIndexesSequentiallyInCollection(col);
    }
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
    return Object.keys(users);
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
          <DotsButton
            onClick={() => {
              setShowInfoModal('dotsMenu');
            }}
          >
            ⋮
          </DotsButton>
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
            setState({});
            setSearchKeyValuePair(null);
          }}
        />
        {state.userId ? (
          <>
            <div style={{ ...coloredCard() }}>
              {renderTopBlock(
                state,
                setUsers,
                setShowInfoModal,
                setState,
                false,
                favoriteUsersData,
                setFavoriteUsersData,
                currentFilter,
                isDateInRange,
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
              <Button
                onClick={() => {
                  setUsers({});
                  setLastKey(null);
                  setHasMore(true);
                  setCurrentPage(1);
                  setCurrentFilter('DATE');
                  setDateOffset(0);
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
                  loadMoreUsers2();
                }}
              >
                Load2
              </Button>
              <Button onClick={loadFavoriteUsers}>❤</Button>
              <Button onClick={indexData}>IndData</Button>
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
                  setUsers={setUsers}
                  setSearch={setSearch}
                  setState={setState}
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
