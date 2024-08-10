import React, { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import { auth, fetchUserData } from './config';
import { makeUploadedInfo } from './makeUploadedInfo';
import { updateDataInFiresoreDB, updateDataInRealtimeDB, getUrlofUploadedAvatar } from './config';
import {fieldsMain} from './formFields';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

import { getStorage,} from 'firebase/storage';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';


const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background-color: #f0f0f0;
  height: 100vh;
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

const InputField = styled.input`
  border: none;
  outline: none;
  flex: 1;
  padding-left: 10px;
  pointer-events: auto;
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

export const ProfileScreen = ({isLoggedIn, setIsLoggedIn}) => {
  const [state, setState] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '',
    telegram: '',
    facebook: '',
    instagram: '',
    vk: '',
  });

  const navigate = useNavigate();

  const [focused, setFocused] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setState((prevState) => ({
      ...prevState,
      [name]: value,
    }));
    console.log('handleChange :>> ', state);
  };

  const handleFocus = (name) => {
    setFocused(name);
    console.log('handleFocus');
  };

  const handleBlur = () => {
    setFocused(null);
    handleSubmit()
    console.log('handleBlur');
  };

  const handleSubmit = async () => {
    console.log('state :>> ', state);

    const { existingData } = await fetchUserData(state.userId);
    
    const uploadedInfo = makeUploadedInfo(existingData, state);

        await updateDataInRealtimeDB(state.userId, uploadedInfo);
        await updateDataInFiresoreDB(state.userId, uploadedInfo, 'check');
  };

  const fetchData = async () => {
    const user = auth.currentUser;
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
      
      setState((prevState) => ({
        ...prevState, // Зберегти попередні значення
        ...processedData,
        userId:user.uid  // Оновити значення з отриманих даних
      }));
      // setState('');
    }
  };

  useEffect( () => {
   fetchData();
  },[]);



  useEffect(() => {
    const loggedIn = localStorage.getItem('isLoggedIn');


    if(!isLoggedIn && !loggedIn){
      navigate('/login');  
    } else {
        setIsLoggedIn(true);
        navigate('/profile');
      }
    // eslint-disable-next-line
  },[]);

  const handleExit = async () => {
    try {
      console.log('handleExit');
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      setState('')
      setIsLoggedIn(false); 
      navigate('/login'); 
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

////////////////////////////photo
// const [selectedFiles, setSelectedFiles] = useState([]);

// const [previewUrls, setPreviewUrls] = useState([]);

  const addPhoto = async (event) => {
    // const photoArray = Array.from(event.target.files);
    // const existingUrls = Array.isArray(state.photos) ? [...state.photos] : state.photos ? [state.photos] : [];
    // // const addedUrls = photoArray.map(file => URL.createObjectURL(file));


    // // console.log('addedUrls',addedUrls);
    // // console.log('existingUrls',existingUrls);
    // const remainingSlots = 9 - existingUrls.length;

    // // if (existingUrls.length + photoArray.length > 9) {
    // //   console.log('Забагато фото');
    // //   return; // Вийти, якщо більше фото, ніж дозволено
    // // }

    // const trimmedFiles =photoArray.slice(0, remainingSlots);

    // // Генеруємо URL для прев'ю
    // const newPreviewUrls = trimmedFiles.map(file => URL.createObjectURL(file));
    
    // // Об'єднуємо нові та існуючі URL
    // const newExistingUrls = Array.isArray(state.photos) ? [...state.photos] : [];
    // const addedUrls = newExistingUrls.concat(newPreviewUrls);

    // console.log('selectedFiles',selectedFiles);

    // setSelectedFiles(prevFiles => [...prevFiles, ...trimmedFiles]);
    // setPreviewUrls(addedUrls);

    // try {
    //   // Отримуємо URL для завантажених фото
    //   const newUrl = await Promise.all(
    //     trimmedFiles.map(async (photo) => {
    //       const url = await getUrlofUploadedAvatar(photo, state.userId);
    //       return url;
    //     })
    //   );
    //   existingUrls.push(...newUrl);


    //     await updateDataInRealtimeDB(state.userId, {photos:existingUrls});
    //     await updateDataInFiresoreDB(state.userId, {photos:existingUrls}, 'check');

    //     setState((prevState) => ({
    //       ...prevState, // Зберегти попередні значення
    //       photos: existingUrls,
    //     }));

    // } catch (error) {
    //   console.error('Error uploading photos:', error);
    // } finally {
    //   // Очищення стейту після завантаження
    //   setSelectedFiles([]);
    // }
  };

  // useEffect( () => {
  //   console.log('previewUrls.photos',previewUrls);
  //  },[previewUrls]);

  // useEffect(() => {
  //   // Очищення URL після використання
  //   return () => {
  //     previewUrls.forEach(url => URL.revokeObjectURL(url));
  //   };
  // }, [previewUrls]);

  return (
    <Container>

{/* <div>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={addPhoto}
        />
        <div>
          {previewUrls.map((url, index) => (
            <img key={index} src={url} alt={`Preview ${index}`} style={{ width: '100px', height: '100px', margin: '5px' }} />
          ))}
        </div>
      </div> */}


      {fieldsMain.map((field) => (
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
          <Label isActive={focused === field.name || state[field.name]}>
            {field.ukrainianHint || field.hint || field.placeholder}
          </Label>
        </InputDiv>
      ))}
       <SubmitButton onClick={handleSubmit}>Submit</SubmitButton>
       <SubmitButton onClick={handleExit}>Exit</SubmitButton>
    </Container>
  );
};

export default ProfileScreen;
