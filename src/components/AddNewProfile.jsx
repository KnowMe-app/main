import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import styled, { css } from 'styled-components';
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
  // removeSpecificSearchId,
} from './config';
import { makeUploadedInfo } from './makeUploadedInfo';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
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

const PickerContainer = styled.div`
  display: flex;
  /* flex-direction: column; */
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  box-sizing: border-box; /* Додано */
  @media (max-width: 768px) {
    // Медіа-запит для пристроїв з шириною екрану до 768px
    background-color: #f5f5f5;
  }
`;

const InputDiv = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  margin: 10px 0;
  padding: 10px;
  background-color: #fff;
  border: 1px solid #ccc;
  border-radius: 5px;

  box-sizing: border-box;
  flex: 1 1 auto; /* Дозволяє займати доступне місце і стискатись */
  min-width: 0; /* Запобігає переповненню при додаванні кнопок */
  height: auto;
`;

// Стиль для інпутів
const InputField = styled.input`
  border: none;
  outline: none;
  flex: 1;
  align-items: center;
  /* padding-left: 10px; */
  padding-left: ${({ fieldName, value }) => {
    if (fieldName === 'phone') return '20px';
    if (fieldName === 'telegram' || fieldName === 'instagram' || fieldName === 'tiktok') return '25px';
    if (fieldName === 'facebook') return /^\d+$/.test(value) ? '20px' : '25px';
    if (fieldName === 'vk') return /^\d+$/.test(value) || value === '' ? '23px' : '10px';
    return '10px'; // Значення за замовчуванням
  }};
  max-width: 100%;
  min-width: 0; /* Дозволяє інпуту зменшуватися до нуля */
  pointer-events: auto;
  height: 100%;
  resize: vertical;
  /* box-sizing: border-box; */
  /* min-width:  100px; */

  /* Додати placeholder стилі для роботи з лейблом */
  &::placeholder {
    color: transparent; /* Ховаємо текст placeholder */
  }
`;

const Hint = styled.label`
  position: absolute;
  /* padding-left: 10px; */
  padding-left: ${({ fieldName, isActive }) => {
    if (fieldName === 'phone') return '20px';
    if (fieldName === 'telegram' || fieldName === 'facebook' || fieldName === 'instagram' || fieldName === 'tiktok') return '25px';
    if (fieldName === 'vk') return '23px';
    return '10px'; // Значення за замовчуванням
  }};
  /* left: 30px; */
  /* top: 50%; */
  /* transform: translateY(-50%); */
  display: flex;
  align-items: center;

  transition: all 0.3s ease;
  color: gray;
  pointer-events: none;
  display: flex;
  align-items: center; /* Вирівнює по вертикалі */
  gap: 8px; /* Відстань між іконкою і текстом, змініть за потреби */

  ${({ isActive }) =>
    isActive &&
    css`
      display: none;
      /* left: 10px;
      top: 0;
      transform: translateY(-100%);
      font-size: 12px;
      color: orange; */
    `}
`;

const Placeholder = styled.label`
  position: absolute;
  padding-left: 10px;
  /* left: 30px; */
  top: 0;
  transform: translateY(-100%);
  transition: all 0.3s ease;
  color: gray;
  pointer-events: none;
  display: flex;
  align-items: center; /* Вирівнює по вертикалі */
  gap: 8px; /* Відстань між іконкою і текстом, змініть за потреби */
  font-size: 12px;

  ${({ isActive }) =>
    isActive &&
    css`
      left: 10px;
      top: 0;
      transform: translateY(-100%);
      font-size: 12px;
      color: orange;
    `}
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

const InputFieldContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  /* width: 100%; */
  height: 100%; /* Дозволяє розтягувати висоту по висоті контейнера */
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0; /* Дозволяє контейнеру звужуватись разом з інпутом */
  height: auto; /* Дозволяє висоті адаптуватися до вмісту */

  &::before {
    content: ${({ fieldName, value }) => {
      if (fieldName === 'phone') return "'+'";
      if (fieldName === 'telegram' || fieldName === 'instagram' || fieldName === 'tiktok') return "'@'";
      if (fieldName === 'facebook') return /^\d+$/.test(value) ? "'='" : "'@'";
      if (fieldName === 'vk') return /^\d+$/.test(value) || value === '' || value === undefined ? "'id'" : "''";
      return "''";
    }};
    position: absolute;
    left: 10px;
    /* top: 50%; */
    /* transform: ${({ fieldName, value }) =>
      fieldName === 'phone' || fieldName === 'vk' || (fieldName === 'facebook' && /^\d+$/.test(value)) ? 'translateY(-45%)' : 'translateY(-45%)'}; */
    display: flex;
    align-items: center;
    color: ${({ value }) => (value ? '#000' : 'gray')}; // Чорний, якщо є значення; сірий, якщо порожньо
    font-size: 16px;
    text-align: center;
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 0px;
  display: flex;
  align-items: center;
  justify-content: center;

  background: none;
  /* background: green; */
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 18px;
  width: 35px;
  height: 35px;

  &:hover {
    color: black;
  }
`;

const DelKeyValueBTN = styled.button`
  position: absolute;
  right: 45px;
  display: flex;
  align-items: center;
  justify-content: center;

  background: none;
  border: none;
  cursor: pointer;
  color: red;
  font-size: 18px;
  width: 35px;
  height: 35px;

  &:hover {
    color: black;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
  /* margin-top: 10px; Відступ між інпутом і кнопками */
  /* width: 100%; */
  margin-left: 8px;
  /* width: 100%;  */
  box-sizing: border-box;
`;

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

export const AddNewProfile = ({ isLoggedIn, setIsLoggedIn }) => {
  // const initialState = {
  //   name: '',
  //   surname: '',
  //   email: '',
  //   phone: '',
  //   telegram: '',
  //   facebook: '',
  //   instagram: '',
  //   tiktok: '',
  //   vk: '',
  //   userId: '',
  //   publish: false,
  // };

  const [userNotFound, setUserNotFound] = useState(false); // Стан для зберігання останнього ключа

  const [search, setSearch] = useState('');

  const [state, setState] = useState({});
  const isEditingRef = useRef(false);

  const [searchKeyValuePair, setSearchKeyValuePair] = useState(null);
  const [filters, setFilters] = useState({});
  // const [addUser, setAddUser] = useState(null);
  // const [focused, setFocused] = useState(null);
  // console.log('focused :>> ', focused);
  const navigate = useNavigate();

  // const handleFocus = name => {
  //   setFocused(name);
  // };
  const handleBlur = () => {
    // setFocused(null);
    handleSubmit();
  };

  // const findNestedArrays = (data, parentKey = '') => {
  //   const nestedArrays = {};

  //   Object.keys(data).forEach(key => {
  //     const currentKey = parentKey ? `${parentKey}.${key}` : key;

  //     if (Array.isArray(data[key])) {
  //       // Якщо елемент масиву також є масивом, то це вкладений масив
  //       if (data[key].some(item => Array.isArray(item))) {
  //         nestedArrays[currentKey] = data[key];
  //         console.log(`Знайдено вкладений масив в ключі '${currentKey}':`, data[key]);
  //       }
  //     } else if (typeof data[key] === 'object' && data[key] !== null) {
  //       // Рекурсивно перевіряємо вкладені об'єкти
  //       Object.assign(nestedArrays, findNestedArrays(data[key], currentKey));
  //     }
  //   });

  //   return nestedArrays;
  // };

  const handleSubmit = async (newState, overwrite, delCondition, makeIndex) => {
    const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
    const commonFields = ['lastAction'];
    // const userId = newState.userId || state.user
    // Формуємо поточну дату у форматі дд.мм.рррр
    const formatDate = date => {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0'); // місяці від 0 до 11
      const yyyy = date.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };
    const currentDate = formatDate(new Date());

    // Додаємо значення до lastAction
    const updatedState = newState ? { ...newState, lastAction: currentDate } : { ...state, lastAction: currentDate };

    if (updatedState?.userId?.length > 20) {
      // if (newState) {
      // console.error('dddd-remove row');

      // console.log('newState',newState);
      // if ([field.name]==='facebook'){
      // await removeSpecificSearchId(keyValue, newState.userId)
      // }

      // const { existingData } = await fetchUserData(updatedState.userId);

      // console.log('existingData1 :>> ', existingData);
      const { existingData } = await fetchUserById(updatedState.userId);
      // console.log('existingData2 :>> ', existingData2);

      // Фільтруємо ключі, щоб видалити зайві поля
      const cleanedState = Object.fromEntries(
        Object.entries(updatedState).filter(([key]) => commonFields.includes(key) || !fieldsForNewUsersOnly.includes(key))
      );

      const uploadedInfo = makeUploadedInfo(existingData, cleanedState, overwrite);
      // console.log('uploadedInfo!!!!!!!!!!!!!!!!!!!!!!!!!!!', uploadedInfo);
      // const nestedArrays = findNestedArrays(uploadedInfo);
      // console.log('Всі вкладені масиви:', nestedArrays);

      if (!makeIndex) {
        // console.log('Update all database :>> ');
        await updateDataInRealtimeDB(updatedState.userId, uploadedInfo, 'update');
        await updateDataInFiresoreDB(updatedState.userId, uploadedInfo, 'check', delCondition);
      }
      // if (newState._test_getInTouch) {
      // console.log('Updating state._test_getInTouch...');
      // Фільтруємо ключі, щоб видалити зайві поля
      const cleanedStateForNewUsers = Object.fromEntries(Object.entries(updatedState).filter(([key]) => [...fieldsForNewUsersOnly, ...contacts].includes(key)));

      await updateDataInNewUsersRTDB(updatedState.userId, cleanedStateForNewUsers, 'update');
      // }

      // }
      // else {
      //   console.error('ffff-modify/create row');

      //     const { existingData } = await fetchUserData(state.userId);
      //     // console.log('existingData :>> ', existingData.name);
      //     const uploadedInfo = makeUploadedInfo(existingData, state, overwrite);
      //     // console.log('state :>> ', state.name);
      //     // console.log('uploadedInfo :>> ', uploadedInfo.name);

      //     const nestedArrays = findNestedArrays(uploadedInfo);
      //     console.log('Всі вкладені масиви:', nestedArrays);
      //     await updateDataInRealtimeDB(state.userId, uploadedInfo, 'update');
      //     await updateDataInFiresoreDB(state.userId, uploadedInfo, 'check');

      // }
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
      // Перевірка, чи є значення масивом
      const isArray = Array.isArray(prevState[fieldName]);
      let newValue;
      let removedValue;

      if (isArray) {
        // Якщо значення є масивом, фільтруємо масив, щоб видалити елемент за індексом
        const filteredArray = prevState[fieldName].filter((_, i) => i !== idx);
        removedValue = prevState[fieldName][idx];

        // Якщо після фільтрації залишається лише одне значення, зберігаємо його як ключ-значення
        newValue = filteredArray.length === 1 ? filteredArray[0] : filteredArray;
      } else {
        // Якщо значення не є масивом, видаляємо його
        removedValue = prevState[fieldName];
        newValue = '';
      }

      // Створюємо новий стан
      const newState = {
        ...prevState,
        [fieldName]: newValue,
      };

      console.log('newState', newState);

      // Викликаємо сабміт після оновлення стейту
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
    localStorage.setItem('userFilters', JSON.stringify(filters));
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


  const handleAddUser = async () => {
    await makeNewUser(searchKeyValuePair);
    setUserNotFound(false);
  };
  const dotsMenu = () => {
    return (
      <>
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
        // await removeSearchId(state.userId); // Виклик функції для видалення
        await removeCardAndSearchId(state.userId); // Виклик функції для видалення
        setUsers(prevUsers => {
          const updatedUsers = { ...prevUsers };
          delete updatedUsers[state.userId]; // Видалення користувача за userId
          return updatedUsers; // Повертаємо оновлений об'єкт користувачів
        });
        setShowInfoModal(null); // Close modal after deletion
        console.log(`User ${state.userId} deleted.`);
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    };

    return (
      <>
        <p>Видалити профіль?</p>
        <SubmitButton onClick={handleRemoveUser}>Видалити</SubmitButton>
        <SubmitButton onClick={() => setShowInfoModal(null)}>Відмінити</SubmitButton>
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
            <FilterPanel onChange={setFilters} />
            <div>
              {userNotFound && <Button onClick={handleAddUser}>+</Button>}
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
            </div>
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
