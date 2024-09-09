import React, { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
// import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import { auth, fetchUserData } from './config';
import { makeUploadedInfo } from './makeUploadedInfo';
import { updateDataInFiresoreDB, updateDataInRealtimeDB } from './config';
import { pickerFields } from './formFields';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import InfoModal from './InfoModal';
import Photos from './Photos';
import { VerifyEmail } from './VerifyEmail';

import { color } from './styles';


const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background-color: #f0f0f0;
  /* max-width: 450px; */

  /* maxWidth:  */
  /* height: 100vh; */
`;

const DotsButton = styled.button`
  /* position: absolute; */
  /* top: 8px; */
  /* right: 8px; */
  width: 40px;
  height: 40px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding-bottom: 20;
  margin-left: auto;

`;

const PickerContainer = styled.div`
  display: flex;
  /* flex-direction: column; */
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  width: ${({ width }) => width || '360px'};
  box-sizing: border-box; /* Додано */
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
  width: ${({ width }) => width || '360px'};
  box-sizing: border-box;
  flex-grow: 1;
  height: auto;
  /* flex-direction: column; */

  /* position: relative;
  display: flex;

  margin-bottom: 16px; */
  /* width: '300px'; */
`;

// Стиль для інпутів
const InputField = styled.input`
  border: none;
  outline: none;
  flex: 1;
  padding-left: 10px;
  pointer-events: auto;
  height: 100%;
  resize: vertical;
  box-sizing: border-box;

  /* Додати placeholder стилі для роботи з лейблом */
  &::placeholder {
    color: transparent; /* Ховаємо текст placeholder */
  }
`;

const Hint = styled.label`
  position: absolute;
  padding-left: 10px;
  /* left: 30px; */
  top: 50%;
  transform: translateY(-50%);
  transition: all 0.3s ease;
  color: gray;
  pointer-events: none;
  display: flex;
  align-items: center; /* Вирівнює по вертикалі */
  gap: 8px; /* Відстань між іконкою і текстом, змініть за потреби */

  ${({ isActive }) =>
    isActive &&
    css`
    display:none;
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
  width: 100%;
  height: 100%; /* Дозволяє розтягувати висоту по висоті контейнера */
  box-sizing: border-box;
  flex-grow: 1;
  height: auto; /* Дозволяє висоті адаптуватися до вмісту */
`;

const ClearButton = styled.button`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
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
  flex: 1; /* Займає однаковий простір у групі кнопок */

  &:hover {
    background-color: ${color.accent};
  }
`;

export const ProfileScreen = ({ isLoggedIn, setIsLoggedIn }) => {
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
    pub: false,
  });
  const [focused, setFocused] = useState(null);
  console.log('focused :>> ', focused);
  const navigate = useNavigate();

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
    await updateDataInFiresoreDB(state.userId, uploadedInfo, 'check');
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
    setState(prevState => ({ ...prevState, pub: true }));
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
      const data = await fetchUserData(user.uid);
      const existingData = data.existingData || {};

      const processedData = Object.keys(existingData).reduce((acc, key) => {
        const value = existingData[key];
        if (key === 'photos' && Array.isArray(value)) {
          // Зберегти лише останні 9 значень
          acc[key] = value.slice(-9);
        } else {
          acc[key] = Array.isArray(value) ? value[value.length - 1] : value;
        }
        return acc;
      }, {});

      console.log('processedData :>> ', processedData);
      setState(prevState => ({
        ...prevState, // Зберегти попередні значення
        ...processedData,
        userId: user.uid, // Оновити значення з отриманих даних
      }));
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

  // Перенаправляємо на іншу сторінку
  useEffect(() => {
    const loggedIn = localStorage.getItem('isLoggedIn');
    if (!isLoggedIn && !loggedIn) {
      navigate('/login');
    } else {
      setIsLoggedIn(true);
      navigate('/profile');
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    console.log('state :>> ', state);
    handleSubmit();
    // eslint-disable-next-line
  }, [state]);

  const [selectedField, setSelectedField] = useState(null);
  // const [state, setState] = useState({ eyeColor: '', hairColor: '' });

  const handleOpenModal = fieldName => {
    setSelectedField(fieldName);
    // setIsModalOpen(true);
  };

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
    setState(prevState => ({ ...prevState, [fieldName]: '' }));
  };

  const dotsMenu = () => {
    return(
<>
{!state.pub && <SubmitButton onClick={handlePublic}>Опублікувати</SubmitButton>}
      <SubmitButton onClick={() => setShowInfoModal('delProfile')}>Видалити анкету</SubmitButton>
      <SubmitButton onClick={() => setShowInfoModal('viewProfile')}>Переглянути анкету</SubmitButton>
      <VerifyEmail/>
      <ExitButton  onClick={handleExit}>Exit</ExitButton ></>
    )
  };

  return (
    <Container>
      <DotsButton onClick={()=>{setShowInfoModal('dotsMenu')}} >⋮</DotsButton>
      <Photos state={state} setState={setState} />

      {pickerFields.map(field => {
        // console.log('field.options:', field.options);

        return (
          <PickerContainer>
            <InputDiv key={field.name}>
              <InputFieldContainer>
                <InputField
                  as={field.name === 'moreInfo_main' && 'textarea'}
                  name={field.name}
                  value={state[field.name]}
                  onChange={e => {
                    const value = e?.target?.value;
                    // if (state[field.name]!=='No' && state[field.name]!=='Yes') {
                    setState(prevState => ({ ...prevState, [field.name]: value }));
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
                      handleOpenModal(field.name);
                      setShowInfoModal('pickerOptions');
                    }
                  }}
                  // placeholder={field.placeholder} // Обов'язково для псевдокласу :placeholder-shown
                  onBlur={() => handleBlur(field.name)}
                />
                {state[field.name] && <ClearButton onClick={() => handleClear(field.name)}>&times; {/* HTML-символ для хрестика */}</ClearButton>}
              </InputFieldContainer>

              <Hint isActive={state[field.name]}>
      {field.ukrainian || field.placeholder}
   </Hint>
   <Placeholder isActive={state[field.name]}>
      {field.ukrainianHint}
   </Placeholder>





            </InputDiv>
            {Array.isArray(field.options) && field.options.length === 2 && (
              <ButtonGroup>
                <Button
                  onClick={() => {
                    setState(prevState => ({ ...prevState, [field.name]: 'Yes' }));
                    handleBlur(field.name);
                  }}
                >
                  Yes
                </Button>
                <Button
                  onClick={() => {
                    setState(prevState => ({ ...prevState, [field.name]: 'No' }));
                    handleBlur(field.name);
                  }}
                >
                  No
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

export default ProfileScreen;
