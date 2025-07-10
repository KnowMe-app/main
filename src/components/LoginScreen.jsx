import { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
import { FaUser, FaLock } from 'react-icons/fa';
import { auth, updateDataInFiresoreDB, updateDataInRealtimeDB } from './config';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth';
import { getCurrentDate } from './foramtDate';
import { useNavigate } from 'react-router-dom';
import { color } from './styles';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background-color: #f0f0f0;
  height: 100vh;
`;

const InnerContainer = styled.div`
  max-width: 450px;
  width: 100%;
  background-color: #f0f0f0;
  padding: 20px;
  /* box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); */
  /* border-radius: 8px; */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const InputDiv = styled.div`
  display: inline-block;
  vertical-align: middle;
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
      font-size: 12px;
      color: orange;
    `}
`;

const SubmitButton = styled.button`
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 5px auto 0 auto;
  color: ${({ disabled }) => (disabled ? '#b0b0b0' : 'white')};
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  padding: 10px 20px;
  background-color: ${({ disabled }) => (disabled ? '#d0d0d0' : color.accent5)}; /* Сірий для вимкненої кнопки, синій для активної */
  text-align: center;
  font-weight: bold;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    background-color: ${({ disabled }) => (disabled ? '#d0d0d0' : color.accent5)}; /* Темніший відтінок для активної кнопки */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &:active {
    background-color: ${({ disabled }) => (disabled ? '#d0d0d0' : color.accent5)}; /* Ще темніший відтінок для натискання */
    transform: scale(0.98);
  }
`;

// Стилі для чекбоксу
const CheckboxContainer = styled.div`
  margin-top: 10px;
  margin-bottom: 10px;
  display: flex;
  align-items: center; /* Центрує по вертикалі */
  justify-content: center; /* Центрує по горизонталі */
  width: auto;
`;

const CheckboxLabel = styled.label`
  font-size: 12px;

  /* font-weight: bold; */
  color: #333;
  cursor: pointer;
  display: inline-block;
  vertical-align: middle;
  max-width: 300px;
  transition: color 0.3s ease, box-shadow 0.3s ease;
  &:hover {
    color: ${color.accent5}; /* Зміна кольору при наведенні */
  }
`;

const TermsButton = styled.button`
  background-color: ${color.oppositeAccent};
  border: 1px solid ${color.gray};
  border-radius: 4px;
  padding: 2px 6px;
  margin-left: 8px;
  font-size: 12px;
  cursor: pointer;
  color: ${color.accent5};

  &:hover {
    background-color: ${color.paleAccent5};
  }
`;

const CustomCheckbox = styled.input`
  appearance: none; /* Сховати стандартний чекбокс */
  width: 15px; /* Розмір чекбоксу */
  height: 15px;
  border: 2px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s ease, border-color 0.3s ease;
  box-sizing: border-box;
  flex-shrink: 0;

  /* Стиль для відміченого чекбоксу */
  &:checked {
    background-color: ${color.accent5}; /* Колір заповнення для відміченого чекбоксу */
    border-color: ${color.accent5};
  }

  /* Стиль для чекбоксу при наведенні */
  &:hover {
    border-color: ${color.accent};
  }
`;

const WelcomeText = styled.h1`
  font-weight: bold;
  text-align: center;
  margin: 20px 0;
  color: ${color.accent5};
  /* font-size: 24px; */
`;

export const LoginScreen = ({ isLoggedIn, setIsLoggedIn }) => {
  const [isChecked, setIsChecked] = useState(false);

  const handleCheckboxChange = () => {
    setIsChecked(!isChecked);
  };

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

  const handleChange = e => {
    const { name, value } = e.target;
    setState(prevState => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleFocus = name => {
    setFocused(name);
  };

  const handleBlur = () => {
    setFocused(null);
  };

  const handleLabelClick = () => {
    navigate('/policy'); // Перехід на сторінку політики конфіденційності
  };

  const handleTermsClick = () => {
    navigate('/policy');
  };

  const handleLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, state.email, state.password);
      const uploadedInfo = {
        areTermsConfirmed: todayDays,
        lastLogin: todayDays,
        email: state.email,
        userId: userCredential.user.uid,
        userRole: 'ed',
      };

      await updateDataInRealtimeDB(userCredential.user.uid, uploadedInfo, 'update');
      await updateDataInFiresoreDB(userCredential.user.uid, uploadedInfo, 'update');

      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userEmail', state.email);

      setIsLoggedIn(true);
      navigate('/my-profile');
      console.log('User signed in:', userCredential.user);
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  const { todayDays } = getCurrentDate();

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
        userRole: 'ed',
      };

      await sendEmailVerification(userCredential.user);
      await updateDataInRealtimeDB(userCredential.user.uid, uploadedInfo);
      await updateDataInFiresoreDB(userCredential.user.uid, uploadedInfo, 'set');

      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userEmail', state.email);

      setIsLoggedIn(true);
      navigate('/my-profile');
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

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

  useEffect(() => {
    const loggedIn = localStorage.getItem('isLoggedIn');
    if (!isLoggedIn && !loggedIn) {
      navigate('/my-profile');
    } else {
      setIsLoggedIn(true);
      navigate('/my-profile');
    }
    // eslint-disable-next-line
  }, []);

  return (
    <Container>
      <InnerContainer>
        <WelcomeText>KnowMe: Egg Donor</WelcomeText>
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
          <Label isActive={focused === 'email' || state.email}>Поштова скринька</Label>
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
          <Label isActive={focused === 'password' || state.password}>Пароль</Label>
        </InputDiv>

        {/* Чекбокс з умовою для активації кнопки */}
        <CheckboxContainer style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
          <CustomCheckbox type="checkbox" checked={isChecked} onChange={handleCheckboxChange} style={{ marginRight: '10px' }} />
          <CheckboxLabel onClick={handleLabelClick}>
            Я погоджуюся з Угодою користувача та надаю згоду на обробку моїх персональних даних та вчинення пов’язаних з цим дій відповідно до розділу Політики
            конфіденційності Угодои користувача
          </CheckboxLabel>
          <TermsButton onClick={handleTermsClick}>Умови</TermsButton>
        </CheckboxContainer>

        {/* Кнопка стане активною лише коли галочка натиснута */}
        <SubmitButton onClick={handleAuth} disabled={!isChecked}>
          Вхід / Реєстрація
        </SubmitButton>

        {/* <SubmitButton onClick={handleLogin}>Вхід</SubmitButton> */}
        {/* <SubmitButton onClick={handleRegistration}>Реєстрація</SubmitButton> */}
      </InnerContainer>
    </Container>
  );
};
