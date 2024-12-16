import React, { useEffect, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
// import Photos from './Photos';
// import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import {
  auth,
  fetchNewUsersCollectionInRTDB,
  // fetchUserData,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
  fetchPaginatedNewUsers,
  removeKeyFromFirebase,
  // fetchListOfUsers,
  makeNewUser,
  // removeSearchId,
  // createSearchIdsForAllUsers,
  createSearchIdsInCollection,
  fetchUserById,
  loadDuplicateUsers,
  removeCardAndSearchId,
  // removeSpecificSearchId,
} from './config';
import { makeUploadedInfo } from './makeUploadedInfo';
import { pickerFieldsExtended as pickerFields } from './formFields';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import InfoModal from './InfoModal';
import { VerifyEmail } from './VerifyEmail';

import { color, coloredCard } from './styles';
import { inputUpdateValue } from './inputUpdatedValue';
import { formatPhoneNumber } from './inputValidations';
import {renderTopBlock, UsersList} from './UsersList';
import ExcelToJson from './ExcelToJson';
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
  width: 97%;
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
  flex-grow: 1;
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
    // if (fieldName === 'vk') return /^\d+$/.test(value) || value === '' ? '23px' : '10px';
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
    // if (fieldName === 'vk') return '23px';
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
  flex-grow: 1;
  height: auto; /* Дозволяє висоті адаптуватися до вмісту */

  &::before {
    content: ${({ fieldName, value }) => {
      if (fieldName === 'phone') return "'+'";
      if (fieldName === 'telegram' || fieldName === 'instagram' || fieldName === 'tiktok') return "'@'";
      if (fieldName === 'facebook') return /^\d+$/.test(value) ? "'='" : "'@'";
      // if (fieldName === 'vk') return /^\d+$/.test(value) || value === '' || value === undefined ? "'id'" : "''";
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
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
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

  const [state, setState] = useState({});

  const [search, setSearch] = useState(null);
  const [searchKeyValuePair, setSearchKeyValuePair] = useState(null);
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
      navigate('/login');
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

      const deletedValue = newState[fieldName]

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

  // useEffect(() => {
  //   console.log('state2 :>> ', state);
  //     }, [state]);

  // useEffect для скидання значень при зміні search
  useEffect(() => {
    // setState({});
    // Скинути значення стану для pickerFields
    // setState(prevState => {
    //   const updatedState = {};
    //   // Проходимося по всіх ключах в попередньому стані
    //   Object.keys(prevState).forEach(key => {
    //     updatedState[key] = ''; // Скидаємо значення до ''
    //   });
    //   return updatedState; // Повертаємо новий стан
    // });
  }, [search]); // Виконується при зміні search

  const handleAddUser = async () => {
    const res = await makeNewUser(searchKeyValuePair);
    setUserNotFound(false);
    setState(res);
    setSearchKeyValuePair({});
  };

  const processUserSearch = async (platform, parseFunction, inputData) => {
    setUsers({}); // Скидаємо попередній стан користувачів
    const id = parseFunction(inputData); // Парсимо ID
  
    if (id) {
      const result = { [platform]: id };
      console.log(`${platform} ID:`, id);

      console.log('objeresultct!!!!! :>> ', result);
  
      setSearchKeyValuePair(result); // Задаємо ключ пошуку
      const res = await fetchNewUsersCollectionInRTDB(result); // Пошук у базі
      console.log('res :>> ', res);
  
      if (!res || Object.keys(res).length === 0) {
        // Якщо результат пустий
        console.log(`Користувача не знайдено в ${platform}`);
        setUserNotFound(true);
      } else {
        // Якщо користувач знайдений
        setUserNotFound(false);
  
        if ('userId' in res) {
          // Якщо в респонсі є ключ `userId`, використовуємо `setState`
          setState(res);
          console.log(`Користувача знайдено в ${platform}:`, res);
        } else {
          // Якщо ключа `userId` немає, використовуємо `setUsers`
          setUsers(res);
          console.log(`Знайдено користувачів у ${platform}:`, res);
        }
      }
      return true; // Повертаємо true, якщо обробка завершена
    }
  
    return false; // Повертаємо false, якщо ID не знайдено
  };
  

  const writeData = async () => {
    setUserNotFound(false);
    setState({});
    // const res = await aiHandler(search)

    const parseFacebookId = url => {
      // Перевіряємо, чи є параметр id в URL (наприклад, profile.php?id=100018808396245)
      const idParamRegex = /[?&]id=(\d+)/;
      const matchIdParam = url.match(idParamRegex);

      // Якщо знаходимо id в параметрах URL
      if (matchIdParam && matchIdParam[1]) {
        return matchIdParam[1]; // Повертаємо ID
      }

      // Регулярний вираз для витягування ID з URL Facebook
      const facebookRegex = /facebook\.com\/(?:.*\/)?(\d+)/;
      const match = url.match(facebookRegex);

      // Якщо знайдено ID у URL
      if (match && match[1]) {
        return match[1]; // Повертаємо ID
      }

      // Якщо URL - це 15 цифр або 14 цифр
      const numberRegex = /^\d{14,15}$/; // Перевірка на 14-15 цифр
      if (numberRegex.test(url)) {
        return url; // Якщо це 14-15 цифр, повертаємо це значення
      }

      // Регулярний вираз для витягування ніка з URL Facebook
      const facebookUsernameRegex = /facebook\.com\/([^/?]+)/;
      const matchUsername = url.match(facebookUsernameRegex);

      // Якщо знайдено нік у URL
      if (matchUsername && matchUsername[1]) {
        return matchUsername[1]; // Повертаємо нік
      }

      // Регулярний вираз для обробки форматів на кшталт "facebook monkey", "fb monkey", тощо
      const pattern = /(?:facebook|fb|фейсбук|фб)\s*:?\s*(\w+)/i;
      const matchTextFormat = url.match(pattern);

      // Якщо знайдено ID або нік у текстовому форматі
      if (matchTextFormat && matchTextFormat[1]) {
        return matchTextFormat[1]; // Повертаємо ID або нік
      }

      return null; // Повертаємо null, якщо ID не знайдено
    };

    const parseInstagramId = input => {
      // Перевіряємо, чи це URL Instagram
      console.log('111 :>> ');
      if (typeof input === 'string' && input.includes('instagram')) {
        const instagramRegex = /instagram\.com\/(?:p\/|stories\/|explore\/)?([^/?#]+)/;
        const match = input.match(instagramRegex);

        // Якщо знайдено username в URL
        if (match && match[1]) {
          return match[1]; // Повертає username
        }
      }

      // Регулярний вираз для витягування username з рядків у форматі "inst monkey", "inst: monkey", тощо
      // const pattern = /(?:inst(?:agram)?\s*:?\s*|\s*instagram\s*:?\s*|\s*in\s*:?\s*|\s*i\s*:?\s*|\s*інст\s*:?\s*|\s*ін\s*:?\s*|\s*і\s*:?\s*|\s*інстаграм\s*:?\s*)(\w+)/i;
      // const pattern = /(?:\binst(?:agram)?\s*:?\s*|\binstagram\s*:?\s*|\bін\s*:?\s*|\bin\s*:?\s*|\bінст\s*:?\s*|\bінстаграм\s*:?\s*)(\w+)/i;
      // const pattern = /(?:\binst(?:agram)?\s*:?\s*|\binstagram\s*:?\s*|\bін\s*:?\s*|\bin\s*:?\s*|\bінст\s*:?\s*|\bінстаграм\s*:?\s*)([a-zA-Z0-9._]+)/i;
      // const pattern = /(?:\binst(?:agram)?\s+|\binstagram\s+|\bін(?:ст|стаграм)?\s+)([a-zA-Z0-9._]+)/i;
      const pattern = /(?:\binst(?:agram)?\s*:?\s+|\binstagram\s*:?\s+|\bін(?:ст|стаграм)?\s*:?\s+|\bin\s*:?\s+)([a-zA-Z0-9._]+)/i;
  
      const match = input.match(pattern);

      // Якщо знайдено username в рядку
      if (match && match[1]) {
        // console.log('match :>> ', match); // Дебаг: покаже всі метчі
        return match[1];
      }
      console.log('333 :>> ');

      return null; // Повертає null, якщо username не знайдено
    };

    const parsePhoneNumber = phone => {
      // Видалення пробілів, дужок, тире і знаку плюс
      const cleanedPhone = phone.replace(/[\s()\-+]/g, ''); // Очищення номера

      // Перевірка, чи номер містить принаймні 10 цифр
      const digitCount = (cleanedPhone.match(/\d/g) || []).length;
      if (digitCount < 10) {
        return; // Вихід, якщо менше 10 цифр
      }

      // Якщо номер починається з '0', замінюємо його на '+38'
      if (cleanedPhone.startsWith('0')) {
        return '380' + cleanedPhone.slice(1); // Заміна '0' на '38'
      }

      // Якщо номер починається з '('
      if (cleanedPhone.startsWith('(')) {
        const numberAfterCleaning = cleanedPhone.slice(1); // Очищаємо '('
        const cleanedAfterParenthesis = numberAfterCleaning.replace(/[\s()\-+]/g, ''); // Очищаємо решту
        if (/^\d{10}$/.test(cleanedAfterParenthesis)) {
          return '38' + cleanedAfterParenthesis.slice(1); // Заміна '0' на '38'
        }
      }

      // Якщо номер починається з '+'
      if (cleanedPhone.startsWith('38')) {
        return cleanedPhone; // Повертаємо номер без змін
      }

      // Якщо жодне з правил не відпрацювало, просто закінчуємо функцію
      return; // Нічого не повертаємо
    };

    const parseEmail = email => {
      // Видалення пробілів з початку і кінця та приведення до нижнього регістру
      const cleanedEmail = email.trim().toLowerCase();

      // Перевірка базової структури email-адреси
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanedEmail)) {
        return; // Вихід, якщо адреса не відповідає базовій структурі email
      }

      // Перевірка наявності домену
      const domain = cleanedEmail.split('@')[1];
      if (!domain || !domain.includes('.')) {
        return; // Вихід, якщо домен некоректний
      }

      // Якщо всі перевірки пройдено, повертаємо очищену email-адресу
      return cleanedEmail;
    };

    // Функція для парсінга TikTok
    const parseTikTokLink = url => {
      // Регулярний вираз для перевірки різних форматів, таких як "tik tok", "tiktok:", "tt", "ТТ:", і т.д.
      const tiktokVariationsRegex = /(?:тікток|tiktok|tt|тт)[:\s]*([a-zA-Z0-9._-]+)/i;

      // Якщо URL містить "tiktok"
      const tiktokRegex = /tiktok\.com\/(?:.*\/)?([a-zA-Z0-9._-]+)/; // Регулярний вираз для ID TikTok
      const match = url.match(tiktokRegex);

      if (match && match[1]) {
        return match[1]; // Повертає ID з URL TikTok
      }

      // Якщо рядок містить варіацію "tiktok", "tik tok", "тікток", "tt", "ТТ" і т.д.
      const variationMatch = url.match(tiktokVariationsRegex);
      if (variationMatch && variationMatch[1]) {
        return variationMatch[1]; // Повертає ID або username після "tiktok", "tik tok", "tt", "ТТ" тощо
      }

      // // Якщо це одне слово (тільки букви, цифри, дефіси та крапки)
      // const simpleWordRegex = /^[a-zA-Z0-9._-а-яА-ЯёЁ]+$/; // Дозволяємо літери, цифри, дефіси, крапки та підкреслення
      // if (simpleWordRegex.test(url)) {
      //   return url; // Повертає слово, якщо воно відповідає критеріям
      // }

      return null; // Повертає null, якщо нічого не знайдено
    };

    const parseUserId = input => {
      // Правило 1: Перевірка, чи рядок має 20 символів і починається з '-'
      if (typeof input === 'string' && input.length === 20 && input.startsWith('-')) {
        return input; // Повертає userId
      }

      // Правило 2: Перевірка, чи рядок містить лише цифри та латинські букви і має 28 символів
      const alphanumericPattern = /^[a-zA-Z0-9]{28}$/;
      if (alphanumericPattern.test(input)) {
        return input; // Повертає userId
      }

      // Правило 3: Витягування id за допомогою регулярного виразу
      // const pattern = /(?:\bId\s*:?\s*:?\s*)(\w+)/i; 
      const pattern = /(?:\bId\s*[:\s]+\s*)(\w+)/i; // додав обов"язкову двокрапку після id
      const match = input.match(pattern);

      // Якщо знайдено username в рядку
      if (match && match[1]) {
        console.log('match :>> ', match);
        return match[1]; // Повертає username
      }

      console.log('333 :>> ');
      return null; // Повертає null, якщо username не знайдено
    };

    const parseTelegramId = input => {
      // Перевірка URL формату (наприклад, t.me/account)
      const urlPattern = /t\.me\/([^/?#]+)/;
      const urlMatch = input.match(urlPattern);

      if (urlMatch && urlMatch[1]) {
        return urlMatch[1]; // Повертає username з URL
      }

      // Перевірка формату з @ (наприклад, @account)
      const atPattern = /^@(\w+)/;
      const atMatch = input.match(atPattern);

      if (atMatch && atMatch[1]) {
        return atMatch[1]; // Повертає username з формату @username
      }

      // Перевірка текстових варіацій (наприклад, "телеграм account", "teleg: account", "t: account")
      const textPattern = /(?:телеграм|телега|teleg|t(?=\s|:)|т(?=\s|:))\s*:?\s*([a-zA-Z0-9._]+)/i;

      const textMatch = input.match(textPattern);

      if (textMatch && textMatch[1]) {
        return textMatch[1]; // Повертає username з текстового формату
      }
console.log('parseTelegramId!!!!!!!!!!!!!! :>> ', );
      // Якщо нічого не знайдено, повертає null
      return null;
    };

    const parseOtherContact = input => {
        return input; // Повертаємо номер без змін
    };

    if (await processUserSearch('facebook', parseFacebookId, search)) return;
    if (await processUserSearch('instagram', parseInstagramId, search)) return;
    if (await processUserSearch('telegram', parseTelegramId, search)) return;
    if (await processUserSearch('userId', parseUserId, search)) return;
    if (await processUserSearch('email', parseEmail, search)) return;
    if (await processUserSearch('tiktok', parseTikTokLink, search)) return;
    if (await processUserSearch('phone', parsePhoneNumber, search)) return;
    if (await processUserSearch('other', parseOtherContact, search)) return;

    console.log('Not a valid Facebook URL, Phone Number, or Instagram URL.');
  };

  const dotsMenu = () => {
    return (
      <>
        <SubmitButton onClick={() => setShowInfoModal('delProfile')}>Видалити анкету</SubmitButton>
        <SubmitButton onClick={() => setShowInfoModal('viewProfile')}>Переглянути анкету</SubmitButton>
        {!isEmailVerified && <VerifyEmail />}
        <ExitButton onClick={handleExit}>Exit</ExitButton>
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

  const [users, setUsers] = useState({});
  const [hasMore, setHasMore] = useState(true); // Стан для перевірки, чи є ще користувачі
  const [lastKey, setLastKey] = useState(null); // Стан для зберігання останнього ключа

  const loadMoreUsers = async () => {
    const res = await fetchPaginatedNewUsers(lastKey);
    // console.log('res :>> ', res);
    // Перевіряємо, чи є користувачі у відповіді
    if (res && typeof res.users === 'object' && Object.keys(res.users).length > 0) {
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

      console.log('newUsers :>> ', newUsers);

      // Оновлюємо стан користувачів
      setUsers(prevUsers => ({ ...prevUsers, ...newUsers })); // Додаємо нових користувачів до попередніх
      setLastKey(res.lastKey); // Оновлюємо lastKey для наступного запиту
      setHasMore(res.hasMore); // Оновлюємо hasMore
    } else {
      setHasMore(false); // Якщо немає більше користувачів, оновлюємо hasMore
    }
  };

  const searchDuplicates = async () => {
    const res = await loadDuplicateUsers();
    setUsers(prevUsers => ({ ...prevUsers, ...res }));
    // console.log('res :>> ', res);

  };

  const makeIndex = async () => {
    await createSearchIdsInCollection('newUsers');
    await createSearchIdsInCollection('users');

    // const res = await fetchListOfUsers();
    // res.forEach(async userId => {
    //   const result = { userId: userId };
    //   const res = await fetchNewUsersCollectionInRTDB(result);
    //   console.log('res :>> ', res);
    //   handleSubmit(res, false, false, true);
    //   // writeData(userId); // Викликаємо writeData() для кожного ID
    // });
  };

  const priorityOrder = ['birth','name', 'surname', 'fathersname', 'phone', 'facebook', 'instagram', 'telegram', 'tiktok',  'region', 'city', 'height', 'weight', 'blood', 'maritalStatus', 'ownKids', 'csection', 'lastDelivery', 'role'];
  const additionalFields = Object.keys(state).filter(
    key => !pickerFields.some(field => field.name === key) && key !== 'attitude' && key !== 'whiteList' && key !== 'blackList'
  );

  // console.log('additionalFields :>> ', additionalFields);

  // Об'єднуємо `pickerFields` та додаткові ключі
  // Об'єднуємо `pickerFields` та додаткові ключі
  const fieldsToRender = [
    ...pickerFields,
    ...additionalFields.map(key => ({
      name: key,
      placeholder: key,
      ukrainianHint: key,
    })),
  ];

  const sortedFieldsToRender = [
    ...priorityOrder
      .map(key => fieldsToRender.find(field => field.name === key))
      .filter(Boolean),
    ...fieldsToRender.filter(field => !priorityOrder.includes(field.name)),
  ];

  // const fieldsToRender = [
  //   ...pickerFields,

  // ];

  //////////// висота text area
  const textareaRef = useRef(null);

  const autoResize = textarea => {
    textarea.style.height = 'auto'; // Скидаємо висоту
    textarea.style.height = `${textarea.scrollHeight}px`; // Встановлюємо нову висоту
  };

  useEffect(() => {
    if (textareaRef.current) {
      autoResize(textareaRef.current); // Встановлюємо висоту після завантаження
    }
  }, [state.myComment]); // Виконується при завантаженні та зміні коментаря


  return (
    <Container>
      <InnerContainer>
        <DotsButton
          onClick={() => {
            setShowInfoModal('dotsMenu');
          }}
        >
          ⋮
        </DotsButton>
        {/* {search && !userNotFound && <Photos state={state} setState={setState} />} */}

        <InputDiv>
          <InputFieldContainer value={search}>
            <InputField
              as={'textarea'}
              inputMode={'text'}
              value={search || ''}
              onChange={e => {
                const value = e?.target?.value;
                // if (state[field.name]!=='No' && state[field.name]!=='Yes') {
                // setState(initialState)
                // setSearch(value);
                // .replace(/\s+$/, '') — замінює всі пробіли в кінці рядка на порожній рядок, ефективно видаляючи їх.
                // setSearch(value.replace(/\s+$/, ''));
                setSearch(value);
                // setState();
              }}
              onFocus={() => {}}
              onBlur={() => {
                // setState();
                writeData();
              }}
            />
            {search && (
              <ClearButton
                onClick={() => {
                  setSearch('');
                  setUserNotFound(false);
                }}
              >
                &times; {/* HTML-символ для хрестика */}
              </ClearButton>
            )}
          </InputFieldContainer>
        </InputDiv>

        {search && state.userId ? (
          <>
<div style={{...coloredCard()}}>
    {renderTopBlock(state, setState, setShowInfoModal, true, )}
  </div>
          
          {sortedFieldsToRender
          .filter(field => !['myComment', 'getInTouch', 'writer'].includes(field.name)) // Фільтруємо поле myComment
          .map((field, index) => {
            // console.log('field:', field);
            // console.log('state[field.name] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!:>> ', state[field.name]);

            return (
              <PickerContainer key={index}>
                {Array.isArray(state[field.name]) ? (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                    {state[field.name].map((value, idx) => {
                      // console.log('state[field.name] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!:>> ', state[field.name]);

                      return (
                        <InputDiv key={`${field.name}-${idx}`}>
                          <InputFieldContainer fieldName={`${field.name}-${idx}`} value={value}>
                            <InputField
                              fieldName={`${field.name}-${idx}`}
                              as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                              ref={field.name === 'myComment' ? textareaRef : null}
                              inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                              name={`${field.name}-${idx}`}
                              // value={value || ''}
                              value={field.name === 'phone' ? formatPhoneNumber(value || '') : value || ''}
                              onChange={e => {
                                // const updatedValue = inputUpdateValue(e?.target?.value, field);
                                field.name === 'myComment' && autoResize(e.target);
                                const updatedValue = field.name === 'telegram' 
                                  ? e?.target?.value // Без inputUpdateValue для 'telegram'
                                  : inputUpdateValue(e?.target?.value, field);
                                setState(prevState => ({
                                  ...prevState,
                                  [field.name]: prevState[field.name].map((item, i) => (i === idx ? updatedValue : item)),
                                }));
                              }}
                              onBlur={() => handleBlur(`${field.name}-${idx}`)}
                            />
                            {(value || value === '') && (
                              <ClearButton
                                onClick={() => {
                                  handleClear(field.name, idx);
                                }}
                              >
                                &times;
                              </ClearButton>
                            )}
                          </InputFieldContainer>

                          <Hint fieldName={field.name} isActive={value}>
                            {field.ukrainian || field.placeholder}
                          </Hint>
                          <Placeholder isActive={value}>{field.ukrainianHint}</Placeholder>
                        </InputDiv>
                      );
                    })}
                  </div>
                ) : (
                  <InputDiv>
                    <InputFieldContainer fieldName={field.name} value={state[field.name]}>
                      <InputField
                        fieldName={field.name}
                        as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                        ref={field.name === 'myComment' ? textareaRef : null}
                        inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                        name={field.name}
                        // value={state[field.name] || ''}
                        value={field.name === 'phone' ? formatPhoneNumber(state[field.name] || '') : state[field.name] || ''}
                        onChange={e => {
                          field.name === 'myComment' && autoResize(e.target);
                          let value = e?.target?.value;
                          // Якщо ім'я поля - 'publish', перетворюємо значення в булеве
                          if (field.name === 'publish') {
                            value = value.toLowerCase() === 'true'; // true, якщо значення 'true', інакше false
                          } else if (field.name === 'telgram') {
                            value = e?.target?.value
                          } else {
                            // value = inputUpdateValue(value, field); // Оновлення значення для інших полів
                          }

                          setState(prevState => ({
                            ...prevState,
                            [field.name]: Array.isArray(prevState[field.name]) ? [value, ...(prevState[field.name].slice(1) || [])] : value,
                          }));
                        }}
                        // onBlur={() => handleBlur(field.name)}
                        onBlur={() => handleSubmit(state, 'overwrite')}
                      />
                      {state[field.name] && <ClearButton onClick={() => handleClear(field.name)}>&times;</ClearButton>}
                      {state[field.name] && <DelKeyValueBTN onClick={() => handleDelKeyValue(field.name)}>del</DelKeyValueBTN>}
                    </InputFieldContainer>

                    <Hint fieldName={field.name} isActive={state[field.name]}>
                      {field.ukrainian || field.placeholder}
                    </Hint>
                    <Placeholder isActive={state[field.name]}>{field.ukrainianHint}</Placeholder>
                  </InputDiv>
                )}

                {/* Додати новий інпут до масиву */}

                {state[field.name] &&
                  (Array.isArray(state[field.name]) ? state[field.name].length === 0 || state[field.name][state[field.name].length - 1] !== '' : true) &&
                  ((Array.isArray(field.options) && field.options.length !== 2) || !Array.isArray(field.options)) && (
                    <Button
                      style={{
                        display: Array.isArray(state[field.name]) ? 'block' : 'inline-block',
                        alignSelf: Array.isArray(state[field.name]) ? 'flex-end' : 'auto',
                        marginBottom: Array.isArray(state[field.name]) ? '14px' : '0',
                        marginLeft: '10px',
                      }}
                      onClick={() => {
                        setState(prevState => ({
                          ...prevState,
                          [field.name]:
                            Array.isArray(prevState[field.name]) && prevState[field.name].length > 0
                              ? [...prevState[field.name], ''] // Додати новий пустий елемент до масиву
                              : [prevState[field.name], ''],
                        }));
                      }}
                    >
                      +
                    </Button>
                  )}

                {Array.isArray(field.options) && field.options.length === 2 && (
                  <ButtonGroup>
                    <Button
                      onClick={() => {
                        setState(prevState => {
                          const newState = {
                            ...prevState,
                            [field.name]: 'Yes',
                          };
                          handleSubmit(newState, 'overwrite');
                          return newState;
                        });
                      }}
                    >
                      Так
                    </Button>
                    <Button
                      onClick={() => {
                        setState(prevState => {
                          const newState = {
                            ...prevState,
                            [field.name]: 'No',
                          };
                          handleSubmit(newState, 'overwrite');
                          return newState;
                        });
                      }}
                    >
                      Ні
                    </Button>
                    <Button
                      onClick={() => {
                        setState(prevState => {
                          const newState = {
                            ...prevState,
                            [field.name]: 'Other',
                          };
                          handleSubmit(newState, 'overwrite');
                          handleBlur(field.name);
                          return newState;
                        });
                      }}
                    >
                      Інше
                    </Button>
                  </ButtonGroup>
                )}
              </PickerContainer>
            );
          })}</>
        ) : (
          <div>
            {search && users && !userNotFound ? (
              <p style={{ textAlign: 'center', color: 'black' }}>Знайдено {users.length} користувачів.</p>
            ) : userNotFound ? (
              <p style={{ textAlign: 'center', color: 'black' }}>No result</p>
            ) : null}
            <div>
              {userNotFound && <Button onClick={handleAddUser}>Add user</Button>}
              {hasMore && <Button onClick={loadMoreUsers}>Load Cards</Button>}
              {hasMore && <Button onClick={makeIndex}>Make index</Button>}
              {<Button onClick={searchDuplicates}>Duplicates</Button>}
              <ExcelToJson/>
            </div>
            {!userNotFound && <UsersList setShowInfoModal ={setShowInfoModal} users={users} setUsers={setUsers} setSearch={setSearch} setState={setState} />}{' '}
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
        />
      )}
    </Container>
  );
};

export default AddNewProfile;
