import React, { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
import { FaUser, FaLock } from 'react-icons/fa';
import { auth, updateDataInFiresoreDB, updateDataInRealtimeDB } from './config';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth';
import { getCurrentDate } from './foramtDate';
import { useNavigate } from 'react-router-dom';

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
  width: 300px;
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
      font-size: 14px;
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

export const LoginScreen = ({isLoggedIn, setIsLoggedIn}) => {
  const [state, setState] = useState({
    email: '',
    password: '',
  });

  const [focused, setFocused] = useState({
    email: false,
    password: false,
  });

  const navigate = useNavigate();

  useEffect(() => {
    const checkAutofill = () => {
      setFocused({
        email: document.querySelector('input[name="email"]').value !== '',
        password: document.querySelector('input[name="password"]').value !== '',
      });
    };

    checkAutofill();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setState((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleFocus = (name) => {
    setFocused(name);
  };

  const handleBlur = () => {
    setFocused(null);
  };

  const handleLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, state.email, state.password);

      const uploadedInfo = { 
        // email: state.email,
        // areTermsConfirmed: todayDays,
        // registrationDate: todayDays,
        lastLogin: todayDays,
        // userId: userCredential.user.uid,
        
    };

        await sendEmailVerification(userCredential.user);
        await updateDataInRealtimeDB(userCredential.user.uid, uploadedInfo);
        await updateDataInFiresoreDB(userCredential.user.uid, uploadedInfo, 'set');

        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', state.email); 

      setIsLoggedIn(true);
      navigate('/submit');
      console.log('User signed in:', userCredential.user);
    } catch (error) {
      console.error('Error signing in:', error);
    }
}

const {todayDays} = getCurrentDate()

const handleRegistration = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, state.email, state.password);
      console.log('User registered in:', userCredential.user);

      const uploadedInfo = { 
        email: state.email,
        areTermsConfirmed: todayDays,
        registrationDate: todayDays,
        lastLogin: todayDays,
        userId: userCredential.user.uid,
        
    };

        await sendEmailVerification(userCredential.user);
        await updateDataInRealtimeDB(userCredential.user.uid, uploadedInfo);
        await updateDataInFiresoreDB(userCredential.user.uid, uploadedInfo, 'set');

        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', state.email); 

        setIsLoggedIn(true);
        navigate('/submit');

    } catch (error) {
      console.error('Error signing in:', error); 
    }
}

const handleAuth = async () => {
  try {
    const signInMethods = await fetchSignInMethodsForEmail(auth, state.email);
    if (signInMethods.length > 0) {
      await handleLogin();
    } else {
      await handleRegistration();
    }
  } catch (error) {
    console.error('Error in authentication process:', error);
  }
};

// useEffect(() => {
//   const loggedIn = localStorage.getItem('isLoggedIn');
//   if(!isLoggedIn && !loggedIn){
//     navigate('/login');  
//   } else {
//       setIsLoggedIn(true);
//       navigate('/submit');
//     }
  

// },[]);

  return (
    <Container>
      <InputDiv>
        <FaUser style={{ marginRight: '10px', color: 'orange' }} />
        <InputField
          type="text"
          name="email"
          placeholder=""
          value={state.email}
          onChange={handleChange}
          onFocus={() => handleFocus('email')}
          onBlur={handleBlur}

        />
        <Label isActive={focused === 'email' || state.email}>
          Поштова скринька
        </Label>
      </InputDiv>
      <InputDiv>
        <FaLock style={{ marginRight: '10px', color: 'orange' }} />
        <InputField
          type="password"
          name="password"
          placeholder=""
          value={state.password}
          onChange={handleChange}
          onFocus={() => handleFocus('password')}
          onBlur={handleBlur}
          autoComplete="new-password"
        />
        <Label isActive={focused === 'password' || state.password}>
          Пароль
        </Label>
      </InputDiv>
      <SubmitButton onClick={handleAuth}>Вхід / Реєстрація</SubmitButton>
      {/* <SubmitButton onClick={handleLogin}>Вхід</SubmitButton> */}
      {/* <SubmitButton onClick={handleRegistration}>Реєстрація</SubmitButton> */}
    </Container>
  );
};