import React, { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
// import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import {
  auth,
  fetchNewUsersCollectionInRTDB,
  // fetchUserData,
  updateDataInNewUsersRTDB,
} from './config';
// import { makeUploadedInfo } from './makeUploadedInfo';
// import { updateDataInRealtimeDB } from './config';
import { pickerFields } from './formFields';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import InfoModal from './InfoModal';
import { VerifyEmail } from './VerifyEmail';

import { color } from './styles';
import { inputUpdateValue } from './inputUpdatedValue';
import { formatPhoneNumber } from './inputValidations';
// import { aiHandler } from './aiHandler';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 10px;
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
    if (fieldName === 'telegram' || fieldName === 'instagram') return '25px';
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
    if (fieldName === 'telegram' || fieldName === 'facebook' || fieldName === 'instagram') return '25px';
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

  &:hover {
    background-color: #f5f5f5; /* Легкий фон при наведенні */
  }
`;

const PublishButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 5px auto 0 auto;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  padding: 10px 20px;
  background-color: ${color.accent5};
  text-align: center;
  font-weight: bold;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    background-color: ${color.accent};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: scale(0.98);
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
      if (fieldName === 'telegram' || fieldName === 'instagram') return "'@'";
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
  right: 10px;
  display: flex;
  align-items: center;

  background: none;
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 18px;

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

  &:hover {
    background-color: ${color.accent}; /* Колір кнопки при наведенні */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); /* Тінь при наведенні */
  }

  &:active {
    transform: scale(0.98); /* Легкий ефект при натисканні */
  }
`;

export const AddNewProfile = ({ isLoggedIn, setIsLoggedIn }) => {



  const initialState = {
    name: '',
    surname: '',
    email: '',
    phone: '',
    telegram: '',
    facebook: '',
    instagram: '',
    vk: '',
    userId: '',
    publish: false,
  };

  const [state, setState] = useState(initialState);

  const [search, setSearch] = useState(null);
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
  const handleSubmit = async (newState) => {
    // const { existingData } = await fetchUserData(state.userId);
    // const uploadedInfo = makeUploadedInfo(existingData, state);
    if (newState){
      await updateDataInNewUsersRTDB(state.userId, newState, 'update');
    } else {await updateDataInNewUsersRTDB(state.userId, state, 'update');}
    
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

  const handlePublic = () => {
    setState(prevState => ({ ...prevState, publish: true }));
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

  const handleClear = (fieldName, index) => {
    setState(prevState => ({ ...prevState, [fieldName]: '' }));
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

  useEffect(() => {
    // console.log('state :>> ', state);
    // handleSubmit()
  }, [state]);

  // useEffect(() => {
  //   console.log('state2 :>> ', state);
  //     }, [search]);

  // useEffect для скидання значень при зміні search
  useEffect(() => {
    // Скинути значення стану для pickerFields
    setState(prevState => {
      const updatedState = {};
      // Проходимося по всіх ключах в попередньому стані
      Object.keys(prevState).forEach(key => {
        updatedState[key] = ''; // Скидаємо значення до ''
      });
      return updatedState; // Повертаємо новий стан
    });
  }, [search]); // Виконується при зміні search

  const writeData = async () => {
    setState({});
    // const res = await aiHandler(search)
    // console.log('res :>> ', res);

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

      return null; // Повертаємо null, якщо ID не знайдено
    };

    const parseInstagramId = input => {
      // Перевіряємо, чи це URL Instagram
      if (typeof input === 'string' && input.includes('instagram')) {
        const instagramRegex = /instagram\.com\/(?:p\/|stories\/|explore\/)?([^/?#]+)/;
        const match = input.match(instagramRegex);
    
        // Якщо знайдено username в URL
        if (match && match[1]) {
          return match[1]; // Повертає username
        }
      }
    
      // Регулярний вираз для витягування username з рядків у форматі "inst monkey", "inst: monkey", тощо
      const pattern = /(?:inst(?:agram)?\s*:?\s*|\s*instagram\s*:?\s*|\s*in\s*:?\s*|\s*i\s*:?\s*|\s*інст\s*:?\s*|\s*ін\s*:?\s*|\s*і\s*:?\s*|\s*інстаграм\s*:?\s*)(\w+)/i;
      const match = input.match(pattern);
    
      // Якщо знайдено username в рядку
      if (match && match[1]) {
        return match[1]; // Повертає username
      }
    
      return null; // Повертає null, якщо username не знайдено
    };

    const parsePhoneNumber = (phone) => {
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

    // Функція для парсінга TikTok
    // const parseTikTokLink = url => {
    //   // Якщо URL містить "tiktok"
    //   const tiktokRegex = /tiktok\.com\/(?:.*\/)?([a-zA-Z0-9._-]+)/; // Регулярний вираз для ID TikTok
    //   const match = url.match(tiktokRegex);
    //   if (match) {
    //     return match[1]; // Повертає ID
    //   }
    //   console.log('url0 :>> ', url);
    //   // Якщо це одне слово (тільки букви, цифри, дефіси та крапки)
    //   const simpleWordRegex = /^[a-zA-Z0-9._-а-яА-ЯёЁ]+$/; // Дозволяємо літери, цифри, дефіси, крапки та підкреслення
    //   console.log('url1 :>> ', url);
    //   if (simpleWordRegex.test(url)) {
    //     console.log('url2 :>> ', url);
    //     return url; // Повертає слово
    //   }
    //   if (simpleWordRegex.test(url)) {
    //     return url; // Повертає слово
    //   }
    //   return null; // Повертає null, якщо не знайдено
    // };

    const inputData = search;

    // 1. Перевіряємо, чи це Facebook URL
    console.log('inputData :>> ', inputData);
    const facebookId = parseFacebookId(inputData);
    console.log('facebook :>> ', facebookId);
    if (facebookId) {
      const result = { facebook: facebookId };
      const res = await fetchNewUsersCollectionInRTDB(result);
      console.log('res :>> ', res);
      // setState('')
      // setSearch('')
      setState(res);
      // setUserId()

      console.log('Facebook ID:', res);
      return;
    }

    // 2. Перевіряємо, чи це Instagram URL
    const instagramId = parseInstagramId(inputData);
    if (instagramId) {
      const result = { instagram: instagramId };
      const res = await fetchNewUsersCollectionInRTDB(result);
      setState(res);
      // console.log('Instagram Username:', res[0]);
      return;
    }

    // 4. Перевірка на TikTok
    // const tiktokId = parseTikTokLink(inputData);
    // if (tiktokId) {
    //   const result = { tiktok: tiktokId };
    //   const res = await fetchNewUsersCollectionInRTDB(result);
    //   setState(res);
      // console.log('TikTok ID:', res[0]);
    //   return;
    // }

    // 3. Перевіряємо, чи це Номер телфону
    const phoneNumber = parsePhoneNumber(inputData);
    if (phoneNumber) {
      const result = { phone: phoneNumber };
      const res = await fetchNewUsersCollectionInRTDB(result);
      setState(res);
      // console.log('Phone number:', res[0]);
      return;
    }

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
        {/* <Photos state={state} setState={setState} /> */}

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
                setSearch(value);
                // setState();
              }}
              onFocus={() => {}}
              onBlur={() => {
                // setState();
                writeData();
              }}
            />
            {search && <ClearButton onClick={() => setSearch('')}>&times; {/* HTML-символ для хрестика */}</ClearButton>}
          </InputFieldContainer>
        </InputDiv>

        {pickerFields.map((field, index) => {
          // console.log('field.options:', field.options);
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
                            as={field.name === 'moreInfo_main' && 'textarea'}
                            inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                            name={`${field.name}-${idx}`}
                            // value={value || ''}
                            value={field.name === 'phone' ? formatPhoneNumber(value || '') : value || ''}
                            onChange={e => {
                              const updatedValue = inputUpdateValue(e?.target?.value, field);
                              setState(prevState => ({
                                ...prevState,
                                [field.name]: prevState[field.name].map((item, i) => (i === idx ? updatedValue : item)),
                              }));
                            }}
                            onBlur={() => handleBlur(`${field.name}-${idx}`)}
                          />
                          {(value || value ==='') && (
                            <ClearButton
                            onClick={() => {
                              setState(prevState => {
                                // Фільтруємо масив, щоб видалити елемент за індексом
                                const filteredArray = prevState[field.name].filter((_, i) => i !== idx);
                                
                                // Якщо масив має лише одне значення, зберігаємо його як ключ-значення
                                const newValue = filteredArray.length === 1 ? filteredArray[0] : filteredArray;
                          
                                const newState = {
                                  ...prevState,
                                  [field.name]: newValue,
                                };
                          
                                // Викликаємо сабміт після оновлення стейту
                                handleSubmit(newState);
                                return newState;
                              });
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
                      as={field.name === 'moreInfo_main' && 'textarea'}
                      inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                      name={field.name}
                      // value={state[field.name] || ''}
                      value={field.name === 'phone' ? formatPhoneNumber(state[field.name] || '') : state[field.name] || ''}
                      onChange={e => {
                        const value = e?.target?.value;
                        const updatedValue = inputUpdateValue(value, field);
                        setState(prevState => ({
                          ...prevState,
                          [field.name]: Array.isArray(prevState[field.name]) ? [updatedValue, ...(prevState[field.name].slice(1) || [])] : updatedValue,
                        }));
                      }}
                      onBlur={() => handleBlur(field.name)}
                    />
                    {state[field.name] && <ClearButton onClick={() => handleClear(field.name)}>&times;</ClearButton>}
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
                        [field.name]: (Array.isArray(prevState[field.name]) && prevState[field.name].length > 0) 
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
                      setState(prevState => ({ ...prevState, [field.name]: 'Yes' }));
                      handleBlur(field.name);
                    }}
                  >
                    Так
                  </Button>
                  <Button
                    onClick={() => {
                      setState(prevState => ({ ...prevState, [field.name]: 'No' }));
                      handleBlur(field.name);
                    }}
                  >
                    Ні
                  </Button>
                  <Button
                    onClick={() => {
                      setState(prevState => ({ ...prevState, [field.name]: 'Other' }));
                      handleBlur(field.name);
                    }}
                  >
                    Інше
                  </Button>
                </ButtonGroup>
              )}
            </PickerContainer>
          );
        })}

        {!state.publish && <PublishButton onClick={handlePublic}>Опублікувати</PublishButton>}
      </InnerContainer>

      {showInfoModal && (
        <InfoModal
          onClose={handleOverlayClick}
          options={pickerFields.find(field => field.name === selectedField)?.options}
          onSelect={handleSelectOption}
          text={showInfoModal}
          Context={dotsMenu}
        />
      )}
    </Container>
  );
};

export default AddNewProfile;
