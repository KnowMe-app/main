import React, { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
// import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import { auth, fetchNewUsersCollectionInRTDB, fetchUserData } from './config';
import { makeUploadedInfo } from './makeUploadedInfo';
import { updateDataInRealtimeDB } from './config';
import { pickerFields } from './formFields';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import InfoModal from './InfoModal';
import { VerifyEmail } from './VerifyEmail';

import { color } from './styles';
import { inputUpdateValue } from './inputUpdatedValue';

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
      if (fieldName === 'vk') return /^\d+$/.test(value) || value === '' ? "'id'" : "''";
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
  const [state, setState] = useState({
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
  });
  const [focused, setFocused] = useState(null);
  console.log('focused :>> ', focused);
  const navigate = useNavigate();

  // // Перенаправляємо на іншу сторінку
  // useEffect(() => {
  //     const loggedIn = localStorage.getItem('isLoggedIn');
  //     if (!isLoggedIn && !loggedIn) {
  //       navigate('/login');
  //     } else {
  //       setIsLoggedIn(true);
  //       navigate('/add');
  //     }
  //     // eslint-disable-next-line
  //   }, []);

  ////////////////////GPS

  useEffect(() => {
    // Перевіряємо, чи підтримується API геолокації
    if (navigator.geolocation) {
      // Отримуємо координати
      navigator.geolocation.getCurrentPosition(
        position => {
          // Успішний результат
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          console.log(`Latitude: ${latitude}, Longitude: ${longitude}`);

          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
            .then(response => response.json())
            .then(data => {
              const address = data.address;
              const street = address.road || '';
              const city = address.city || address.town || address.village || '';
              const state = address.state || '';
              const country = address.country || '';
              console.log(`Street: ${street}, City: ${city}, State: ${state}, Country: ${country}`);
              setState(prevState => ({ ...prevState, city, street, state, country }));
            })
            .catch(error => console.error('Error:', error));
        },
        error => {
          // Обробка помилок
          console.error('Error getting location', error);
        }
      );
    } else {
      console.log('Geolocation is not supported by this browser.');
    }
  }, []); // Порожній масив залежностей

  ////////////////////GPS

  const handleFocus = name => {
    setFocused(name);
  };
  const handleBlur = () => {
    setFocused(null);
    handleSubmit();
  };
  const handleSubmit = async () => {
    const { existingData } = await fetchUserData(state.userId);
    const uploadedInfo = makeUploadedInfo(existingData, state);
    await updateDataInRealtimeDB(state.userId, uploadedInfo);
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

  // зберігаємо дані при завантаженні сторінки
  const fetchData = async user => {
    // console.log('fetchData :>> ');
    // const user = auth.currentUser;
    // console.log('user :>> ', user.uid);
    if (user && user.uid) {
      console.log('111 :>> ');
      //   const data = await fetchNewUsersCollectionInRTDB(state.newData);
      //   console.log('data!!!!!!!!!! :>> ', data);

      //   const existingData = data.existingData || {};

      //   const processedData = Object.keys(existingData).reduce((acc, key) => {
      //     const value = existingData[key];
      //     if (key === 'photos' && Array.isArray(value)) {
      //       // Зберегти лише останні 9 значень
      //       acc[key] = value.slice(-9);
      //     } else {
      //       acc[key] = Array.isArray(value) ? value[value.length - 1] : value;
      //     }
      //     return acc;
      //   }, {});

      //   console.log('processedData :>> ', processedData);
      //   setState(prevState => ({
      //     ...prevState, // Зберегти попередні значення
      //     ...processedData,
      //     userId: user.uid, // Оновити значення з отриманих даних
      //   }));
    }
  };

  // зберігаємо дані при завантаженні сторінки
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        console.log('User is logged in: ', user.uid);
        fetchData(user);
      } else {
        console.log('No user is logged in.');
      }
    });

    // Clean up the subscription on component unmount
    return () => unsubscribe();
  }, []);

  // useEffect(() => {
  //   fetchData();
  // }, []);

  //   useEffect(() => {
  //     // console.log('state :>> ', state);
  //     handleSubmit();
  //     // eslint-disable-next-line
  //   }, [state.publish]);

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

  const handleClear = fieldName => {
    setState(prevState => ({ ...prevState, newData: '' }));
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

  const writeData = async () => {
    const parseFacebookId = url => {
  // Регулярний вираз для витягування ID з URL Facebook
  const facebookRegex = /facebook\.com\/(?:.*\/)?(\d+)/;
  const match = url.match(facebookRegex);

  // Якщо знайдено ID у URL
  if (match && match[1]) {
    return match[1]; // Повертає ID
  }

 // Якщо URL - це 15 цифр або 14 цифр
 const numberRegex = /^\d{14,15}$/; // Зміна на 14-15 цифр
  if (numberRegex.test(url)) {
    return url; // Якщо це 14-15 цифр, повертаємо це значення
  }

    // Регулярний вираз для витягування ніка з URL Facebook
    const facebookUsernameRegex = /facebook\.com\/([^/?]+)/;
    const matchUsername = url.match(facebookUsernameRegex);
  
    // Якщо знайдено нік у URL
    if (matchUsername && matchUsername[1]) {
      return matchUsername[1]; // Повертає нік
    }

  return null; // Повертає null, якщо ID не знайдено
    };

    const parseInstagramId = (url) => {
      const instagramRegex = /instagram\.com\/([^/?]+)/;
      const match = url.match(instagramRegex);
      
      if (match && match[1]) {
        return match[1]; // Повертає username, якщо знайдено
      }
      return null; // Повертає null, якщо username не знайдено
    };

    const parsePhoneNumber = (phone) => {
    // Видалення пробілів, дужок, тире і знаку плюс
    const cleanedPhone = phone.replace(/[\s()\-+]/g, '');

    // Якщо номер не починається з '+38', '38' або '0'
    if (!cleanedPhone.startsWith('38') && !cleanedPhone.startsWith('0') && !cleanedPhone.startsWith('+38')) {
      return cleanedPhone; // Повертаємо очищений номер без змін
    }
  
    // Якщо номер починається з '0', замінюємо його на '38'
    if (cleanedPhone.startsWith('0')) {
      return '38' + cleanedPhone.slice(0); // Додаємо код країни, прибираючи '0'
    }
  
    return cleanedPhone; // Повертаємо номер, якщо він починається з '38' або '+38'
  };

    // Функція для парсінга TikTok
    const parseTikTokLink = (url) => {
      // Якщо URL містить "tiktok"
      const tiktokRegex = /tiktok\.com\/(?:.*\/)?([a-zA-Z0-9._-]+)/; // Регулярний вираз для ID TikTok
      const match = url.match(tiktokRegex);
      if (match) {
        return match[1]; // Повертає ID
      }
      console.log('url0 :>> ',url );
    // Якщо це одне слово (тільки букви, цифри, дефіси та крапки)
    const simpleWordRegex = /^[a-zA-Z0-9._-а-яА-ЯёЁ]+$/; // Дозволяємо літери, цифри, дефіси, крапки та підкреслення
    console.log('url1 :>> ',url );
    if (simpleWordRegex.test(url)) {
      console.log('url2 :>> ', url);
      return url; // Повертає слово
      
    }
      if (simpleWordRegex.test(url)) {
        return url; // Повертає слово
      }
      return null; // Повертає null, якщо не знайдено
    };

    const inputData = state.newData;

    // 1. Перевіряємо, чи це Facebook URL
    console.log('inputData :>> ', inputData);
  const facebookId = parseFacebookId(inputData);
  console.log('facebookId :>> ', facebookId);
  if (facebookId) {
    const result = { facebook: facebookId };
    const res = await fetchNewUsersCollectionInRTDB(result);
    console.log('Facebook ID:', res[0]);
    return;
  }

  // 2. Перевіряємо, чи це Instagram URL
  const instagramId = parseInstagramId(inputData);
  if (instagramId) {
    const result = { instagram: instagramId };
    const res = await fetchNewUsersCollectionInRTDB(result);
    console.log('Instagram Username:', res[0]);
    return;
  }

        // 4. Перевірка на TikTok
        const tiktokId = parseTikTokLink(inputData);
        if (tiktokId) {
          const result = { tiktok: tiktokId };
          const res = await fetchNewUsersCollectionInRTDB(result);
            console.log('TikTok ID:', res[0]);
            return;
        }

    // 3. Перевіряємо, чи це Номер телфону
    const phoneNumber = parsePhoneNumber(inputData);
    if (phoneNumber) {
      const result = { phone: phoneNumber };
      const res = await fetchNewUsersCollectionInRTDB(result);
      console.log('Phone number:', res[0]);
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
          <InputFieldContainer value={state.newData}>
            <InputField
              as={'textarea'}
              inputMode={'text'}
              value={state.newData}
              onChange={e => {
                const value = e?.target?.value;
                // if (state[field.name]!=='No' && state[field.name]!=='Yes') {
                setState(prevState => ({ ...prevState, newData: value }));
              }}
              onFocus={() => {}}
              onBlur={() => {
                writeData();
              }}
            />
            {state.newData && <ClearButton onClick={() => handleClear(state.newData)}>&times; {/* HTML-символ для хрестика */}</ClearButton>}
          </InputFieldContainer>
        </InputDiv>

        {pickerFields.map(field => {
          // console.log('field.options:', field.options);

          return (
            <PickerContainer>
              <InputDiv key={field.name}>
                <InputFieldContainer fieldName={field.name} value={state[field.name]}>
                  <InputField
                    fieldName={field.name}
                    as={field.name === 'moreInfo_main' && 'textarea'}
                    inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                    name={field.name}
                    value={state[field.name]}
                    onChange={e => {
                      const value = e?.target?.value;
                      const updatedValue = inputUpdateValue(value, field);
                      // if (state[field.name]!=='No' && state[field.name]!=='Yes') {
                      setState(prevState => ({ ...prevState, [field.name]: updatedValue }));
                      // } else {
                      // handleChange(field.name, value || '');
                      // }
                    }}
                    onFocus={() => {
                      if (field.options === undefined) {
                        console.log('field.options === undefined :>> ');
                        handleFocus(field.name);
                      } else if (state[field.name] !== '' && state[field.name] !== undefined) {
                        console.log('state[field.name] :>> ', state[field.name]);
                        console.log('field.options !== ');
                        handleFocus(field.name);
                      } else {
                        // handleOpenModal(field.name);
                        // setShowInfoModal('pickerOptions');
                      }
                    }}
                    // placeholder={field.placeholder} // Обов'язково для псевдокласу :placeholder-shown
                    onBlur={() => handleBlur(field.name)}
                  />
                  {state[field.name] && <ClearButton onClick={() => handleClear(field.name)}>&times; {/* HTML-символ для хрестика */}</ClearButton>}
                </InputFieldContainer>

                <Hint fieldName={field.name} isActive={state[field.name]}>
                  {field.ukrainian || field.placeholder}
                </Hint>
                <Placeholder isActive={state[field.name]}>{field.ukrainianHint}</Placeholder>
              </InputDiv>
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
