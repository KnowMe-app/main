import React, { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import { auth, deletePhotos, fetchUserData, getUrlofUploadedAvatar } from './config';
import { makeUploadedInfo } from './makeUploadedInfo';
import { updateDataInFiresoreDB, updateDataInRealtimeDB } from './config';
import { fieldsMain, pickerFields } from './formFields';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';

// import { getStorage,} from 'firebase/storage';
// import { getFirestore, doc, updateDoc } from 'firebase/firestore';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background-color: #f0f0f0;
  
  /* maxWidth:  */
  /* height: 100vh; */
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
  width: ${({ width }) => width || '300px'};
  /* width: '300px'; */
`;

// Стиль для інпутів
const InputField = styled.input`
  border: none;
  outline: none;
  flex: 1;
  padding-left: 10px;
  pointer-events: auto;
  
  /* Додати placeholder стилі для роботи з лейблом */
  &::placeholder {
    color: transparent; /* Ховаємо текст placeholder */
  }
`;

const Label = styled.label`
  position: absolute;
  left: 30px;
  top: 50%;
  transform: translateY(-50%);
  transition: all 0.3s ease;
  color: gray;
  pointer-events: none;

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

const SubmitButton = styled.button`
  margin-top: 20px;
  padding: 10px 20px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;

  &:hover {
    background-color: #45a049;
  }
`;

const iconMap = {
  user: <FaUser style={{ color: 'orange' }} />,
  mail: <FaMailBulk style={{ color: 'orange' }} />,
  phone: <FaPhone style={{ color: 'orange' }} />,
  'telegram-plane': <FaTelegramPlane style={{ color: 'orange' }} />,
  'facebook-f': <FaFacebookF style={{ color: 'orange' }} />,
  instagram: <FaInstagram style={{ color: 'orange' }} />,
  vk: <FaVk style={{ color: 'orange' }} />,
};

const InputFieldContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
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


export const ProfileScreen = ({ isLoggedIn, setIsLoggedIn }) => {
  const [state, setState] = useState({name: '', surname: '', email: '', phone: '', telegram: '', facebook: '', instagram: '', vk: '', userId: ''});
  const [focused, setFocused] = useState(null);
  const navigate = useNavigate();

  const handleChange = e => {const { name, value } = e.target; setState(prevState => ({...prevState, [name]: value,}))};
  const handleFocus = name => {setFocused(name);};
  const handleBlur = () => {setFocused(null); handleSubmit();};
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

  const handleDeletePhoto = async (photoUrl) => {
    // Фільтруємо фото, щоб видалити обране
    const newPhotos = state.photos.filter(url => url !== photoUrl);
  
    try {
      // Видаляємо фото з Firebase Storage
      await deletePhotos(state.userId, [photoUrl]);
  
      // Оновлюємо стейт
      setState(prevState => ({
        ...prevState,
        photos: newPhotos
      }));
  
      // Можливо, оновити дані в базі даних тут
      await updateDataInRealtimeDB(state.userId, { photos: newPhotos });
      await updateDataInFiresoreDB(state.userId, { photos: newPhotos }, 'check');
  
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  };


  // зберігаємо дані при завантаженні сторінки
  const fetchData = async (user) => {
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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
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
    console.log('state.photos :>> ', state.photos);
    handleSubmit();
    // eslint-disable-next-line
  }, [state]);

  const addPhoto = async event => {
    const photoArray = Array.from(event.target.files);
    console.log('state.userId in addPhoto :>> ', state.userId);

    try {
      // Завантажуємо фото на сервер і отримуємо URL
      const newUrls = await Promise.all(
        photoArray.map(photo => getUrlofUploadedAvatar(photo, state.userId))
      );

      console.log('newUrls in addPhoto :>> ', newUrls);

      setState(prevState => ({
        ...prevState,
        photos: [...(prevState.photos || []), ...newUrls],
      }));

      // Оновлюємо базу даних з новими URL
      // await updateDataInRealtimeDB(state.userId, state);
      // await updateDataInFiresoreDB(state.userId, state, 'check');

      // handleSubmit()

      // Оновлюємо стан з новими URL
      // setPhotoUrls(prevUrls => [...prevUrls, ...newUrls]);
    } catch (error) {
      console.error('Error uploading photos:', error);
    } finally {
      // Очищення стейту після завантаження
      // setSelectedFiles([]);
    }
  };


  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState(null);
  // const [state, setState] = useState({ eyeColor: '', hairColor: '' });

  const handleOpenModal = (fieldName) => {
    setSelectedField(fieldName);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedField(null);
  };

  const handleSelectOption = (option) => {
    if (selectedField) {
      const newValue = option.placeholder === 'Clear' ? '' : option.placeholder;

    setState(prevState => ({ ...prevState, [selectedField]: newValue }));
      
    }
    handleCloseModal();
  };

  const handleClear = (fieldName) => {
    setState(prevState => ({ ...prevState, [fieldName]: '' }));
  };

  return (
    <Container>
      {/* <div>
        <input type="file" multiple accept="image/*" onChange={addPhoto} />
        <div>
          {state.photos && state.photos.length > 0 ? (
            state.photos.map((url, index) => (
              <img key={index} src={url} alt={`user avatar ${index}`} style={{ width: '100px', height: '100px', margin: '5px' }} />
            ))
          ) : (
            <p>No photos available</p>
          )}
        </div>
      </div> */}


    <div style={{ paddingBottom: '10px', maxWidth: '400px' }}> {/* Додаємо відступ знизу, щоб кнопка не перекривала фото */}
      {/* Відображення завантажених фото */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center', // Вирівнювання фото по центру
        gap: '10px', // Відстань між фото
        // marginTop: '10px' // Відступ від фото до кнопки
      }}>
        {state.photos && state.photos.length > 0 ? (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', alignItems: 'center' }}>
    {state.photos.map((url, index) => (
      <div key={index} style={{ width: '100px', height: '100px', position: 'relative' }}>
        <img src={url} alt={`user avatar ${index}`} style={{ objectFit: 'cover', width: '100%', height: '100%', display: 'block' }} />
        <button
          onClick={() => handleDeletePhoto(url)}
          style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            backgroundColor: 'red',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>
    ))}
  </div>
) : (
  <p>Додайте свої фото, максимум 9 шт</p>
)}
      </div>
      
      {/* Кнопка для вибору файлів */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px'  }}>
        <label htmlFor="file-upload" style={{
          display: 'inline-block',
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          borderRadius: '5px',
          cursor: 'pointer',
          textAlign: 'center',
          fontSize: '16px',
          fontWeight: 'bold'
        }}>
          Додати фото
          <input
            id="file-upload"
            type="file"
            multiple
            accept="image/*"
            onChange={addPhoto}
            style={{ display: 'none' }} // Ховаємо справжній input
          />
        </label>
      </div>
    </div>

      {fieldsMain.map(field => (
        <InputDiv key={field.name} width={field.width}>
          {iconMap[field.svg]}
          <InputFieldContainer>
          <InputField
            name={field.name}
            // placeholder=""
            value={state[field.name]}
            onChange={handleChange}
            onFocus={() => handleFocus(field.name)}
            onBlur={handleBlur}
          />
          {state[field.name] && (
        <ClearButton onClick={() => handleClear(field.name)}>
          &times; {/* HTML-символ для хрестика */}
        </ClearButton>
      )}</InputFieldContainer>
          <Label isActive={focused === field.name || state[field.name]}>{field.ukrainianHint || field.hint || field.placeholder}</Label>
        </InputDiv>
      ))}
      {/* {pickerFields.map(field => (
        <InputDiv key={field.name} width={field.width}>
          {iconMap[field.svg]}
          <InputField
            name={field.name}
            // placeholder=""
            value={state[field.name]}
            onChange={handleChange}
            onFocus={() => handleFocus(field.name)}
            onBlur={handleBlur}
          />
          <Label isActive={focused === field.name || state[field.name]}>{field.ukrainianHint || field.hint || field.placeholder}</Label>
        </InputDiv>
      ))} */}

<div>
{pickerFields.map(field => (
  <InputDiv key={field.name}>
    {iconMap[field.svg]}
    <InputFieldContainer>
      <InputField
        name={field.name}
        value={state[field.name]}
        onFocus={() => handleOpenModal(field.name)}
        onChange={(e) => handleChange(field.name, e.target.value)}
        placeholder={field.placeholder} // Обов'язково для псевдокласу :placeholder-shown
        onBlur={() => handleBlur(field.name)}
      />
      {state[field.name] && (
        <ClearButton onClick={() => handleClear(field.name)}>
          &times; {/* HTML-символ для хрестика */}
        </ClearButton>
      )}
    </InputFieldContainer>
    <Label isActive={state[field.name]}>
      {field.ukrainianHint || field.hint || field.placeholder}
    </Label>
  </InputDiv>
))}
      {isModalOpen && selectedField && (
        <Modal
          options={pickerFields.find(field => field.name === selectedField).options}
          onClose={handleCloseModal}
          onSelect={handleSelectOption}
        />
      )}
    </div>


      <SubmitButton onClick={handleSubmit}>Опублікувати</SubmitButton>
      <SubmitButton onClick={handleSubmit}>Подивитись / Видалити анкету</SubmitButton>
      <SubmitButton onClick={handleExit}>Exit</SubmitButton>
    </Container>
  );
};

export default ProfileScreen;
