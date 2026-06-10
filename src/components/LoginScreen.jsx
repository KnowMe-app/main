import { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
import { FaUser, FaLock } from 'react-icons/fa';
import { auth } from './config';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth';
import { getCurrentDate } from './foramtDate';
import { useNavigate } from 'react-router-dom';
import { authNotifications } from './authNotifications';
import {
  buildAuthProfilePayload,
  markAuthSession,
  MY_PROFILE_NEW_ROUTE,
  normalizeAuthEmail,
  persistUserWithFallback,
} from './authProfilePersistence';

const Container = styled.div`
  --accent: #E8791A;
  --accent-light: #FFF0E0;
  --accent-mid: #F5A24B;
  --bg: #FAFAF8;
  --card: #FFFFFF;
  --text: #1A1A1A;
  --muted: #7A7A72;
  --border: #E8E8E2;
  --radius: 14px;
  --shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background:
    radial-gradient(circle at top left, rgba(232, 121, 26, 0.12), transparent 30%),
    var(--bg);
  color: var(--text);
  font-family: 'DM Sans', sans-serif;
  box-sizing: border-box;
`;

const InnerContainer = styled.div`
  width: min(100%, 460px);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const LoginCard = styled.div`
  width: 100%;
  box-sizing: border-box;
  padding: 22px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: var(--shadow);
`;

const BrandBlock = styled.div`
  text-align: center;
  margin-bottom: 20px;
`;

const WelcomeText = styled.h1`
  margin: 0;
  color: var(--text);
  font-size: clamp(26px, 8vw, 34px);
  font-weight: 900;
  letter-spacing: -0.04em;
`;

const WelcomeAccent = styled.span`
  color: var(--accent);
`;

const IntroText = styled.p`
  margin: 8px auto 0;
  max-width: 320px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
`;

const InputDiv = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  margin-top: 14px;
  padding: 0 14px;
  min-height: 48px;
  background: var(--bg);
  border: 1.5px solid ${({ $active }) => ($active ? 'var(--accent)' : 'var(--border)')};
  border-radius: 12px;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  box-shadow: ${({ $active }) => ($active ? '0 0 0 3px rgba(232, 121, 26, .12)' : 'none')};
`;

const FieldIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  color: var(--accent);
`;

const InputField = styled.input`
  min-width: 0;
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  padding: 18px 0 6px;
`;

const Label = styled.label`
  position: absolute;
  left: 44px;
  top: 50%;
  transform: translateY(-50%);
  transition: all 0.2s ease;
  color: var(--muted);
  font-size: 14px;
  pointer-events: none;

  ${({ isActive }) =>
    isActive &&
    css`
      top: 8px;
      transform: translateY(0);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
    `}
`;

const SubmitButton = styled.button`
  width: 100%;
  margin-top: 18px;
  padding: 16px;
  color: #fff;
  border: none;
  border-radius: var(--radius);
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  font-size: 16px;
  font-weight: 800;
  background: ${({ disabled }) => (disabled ? '#c9c9c2' : 'linear-gradient(135deg, #E8791A 0%, #F5A24B 100%)')};
  box-shadow: ${({ disabled }) => (disabled ? 'none' : '0 10px 24px rgba(232, 121, 26, 0.22)')};
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;

  &:hover {
    filter: ${({ disabled }) => (disabled ? 'none' : 'brightness(1.02)')};
    box-shadow: ${({ disabled }) => (disabled ? 'none' : '0 14px 30px rgba(232, 121, 26, 0.28)')};
    transform: ${({ disabled }) => (disabled ? 'none' : 'translateY(-1px)')};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px rgba(232, 121, 26, .18);
  }

  &:active {
    transform: ${({ disabled }) => (disabled ? 'none' : 'scale(0.99)')};
  }
`;

const CheckboxContainer = styled.div`
  margin-top: 14px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
`;

const CheckboxLabel = styled.label`
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.45;

  &:hover {
    color: var(--accent);
  }
`;

const RoleBlock = styled.fieldset`
  width: 100%;
  margin: 16px 0 0;
  padding: 0;
  border: none;
`;

const RoleTitle = styled.legend`
  margin-bottom: 8px;
  color: var(--text);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const RoleGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
`;

const RoleOption = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1.5px solid ${({ $selected }) => ($selected ? 'var(--accent)' : 'var(--border)')};
  border-radius: 14px;
  background: ${({ $selected }) => ($selected ? 'var(--accent-light)' : 'var(--card)')};
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--accent-mid);
  }
`;

const RoleRadio = styled.input`
  margin-top: 2px;
  accent-color: var(--accent);
`;

const RoleText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RoleName = styled.span`
  color: var(--text);
  font-size: 14px;
  font-weight: 800;
`;

const RoleHint = styled.span`
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
`;

const TermsButton = styled.button`
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  padding: 0;
  cursor: pointer;
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const CustomCheckbox = styled.input`
  width: 18px;
  height: 18px;
  margin: 1px 0 0;
  accent-color: var(--accent);
  flex-shrink: 0;
`;

const LoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(250, 250, 248, 0.78);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  pointer-events: all;
`;

const Spinner = styled.div`
  width: 44px;
  height: 44px;
  border: 4px solid #f2ded0;
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const LoginScreen = ({ isLoggedIn, setIsLoggedIn }) => {
  const [isChecked, setIsChecked] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckboxChange = () => {
    setIsChecked(!isChecked);
  };

  const [state, setState] = useState({
    email: '',
    password: '',
  });

  const [focused, setFocused] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const checkAutofill = () => {
      setFocused({
        email: document.querySelector('input[name="email"]')?.value !== '',
        password: document.querySelector('input[name="password"]')?.value !== '',
      });
    };

    checkAutofill();
    const timer = setTimeout(checkAutofill, 500);
    return () => clearTimeout(timer);
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

  const handleTermsClick = () => {
    navigate('/policy');
  };

  const { todayDays, todayDash } = getCurrentDate();

  const navigateAfterAuth = () => {
    navigate(MY_PROFILE_NEW_ROUTE);
  };

  const handleLogin = async email => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, state.password);
      const uploadedInfo = buildAuthProfilePayload({
        email,
        userId: userCredential.user.uid,
        userRole: selectedRole,
        todayDays,
        todayDash,
      });

      await persistUserWithFallback(userCredential.user.uid, uploadedInfo, 'update');

      markAuthSession({ email, userId: userCredential.user.uid });
      setIsLoggedIn(true);
      navigateAfterAuth();
      console.log('User signed in:', userCredential.user);
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        authNotifications.wrongPassword();
      } else {
        console.error('Error signing in:', error);
        authNotifications.genericAuthError();
      }
    }
  };

  const handleRegistration = async email => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, state.password);
      console.log('User registered in:', userCredential.user);

      const uploadedInfo = buildAuthProfilePayload({
        email,
        userId: userCredential.user.uid,
        userRole: selectedRole,
        todayDays,
        todayDash,
        isRegistration: true,
      });

      await sendEmailVerification(userCredential.user);
      await persistUserWithFallback(userCredential.user.uid, uploadedInfo, 'set');

      markAuthSession({ email, userId: userCredential.user.uid });
      setIsLoggedIn(true);
      navigateAfterAuth();
    } catch (error) {
      if (error.code === 'auth/weak-password') {
        authNotifications.weakPassword();
      } else {
        console.error('Error signing in:', error);
        authNotifications.genericAuthError();
      }
    }
  };

  const handleAuth = async () => {
    const hasEmailTrailingSpace = /\s$/.test(state.email);
    const normalizedEmail = normalizeAuthEmail(state.email);

    if (!normalizedEmail) {
      authNotifications.emailRequired();
      return;
    }

    if (hasEmailTrailingSpace) {
      authNotifications.emailTrailingSpace();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      authNotifications.invalidEmail();
      return;
    }

    if (!state.password) {
      authNotifications.passwordRequired();
      return;
    }

    if (!selectedRole) {
      authNotifications.roleRequired();
      return;
    }

    if (!isChecked) {
      authNotifications.termsRequired();
      return;
    }

    setState(prevState => ({
      ...prevState,
      email: normalizedEmail,
    }));

    setIsLoading(true);
    try {
      const signInMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      if (signInMethods.length > 0) {
        await handleLogin(normalizedEmail);
      } else {
        await handleRegistration(normalizedEmail);
      }
    } catch (error) {
      console.error('Error in authentication process:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn || loggedIn) {
      setIsLoggedIn(true);
      navigate(MY_PROFILE_NEW_ROUTE);
    }
    // eslint-disable-next-line
  }, []);

  return (
    <Container>
      {isLoading && (
        <LoadingOverlay>
          <Spinner />
        </LoadingOverlay>
      )}
      <InnerContainer>
        <LoginCard>
          <BrandBlock>
            <WelcomeText>KnowMe<WelcomeAccent>.</WelcomeAccent></WelcomeText>
            <IntroText>Загальний вхід для донорів, агентств і команди. Оберіть роль — ми відкриємо відповідний формат анкети.</IntroText>
          </BrandBlock>

          <InputDiv $active={focused === 'email' || Boolean(state.email)}>
            <FieldIcon><FaUser /></FieldIcon>
            <InputField
              type="email"
              name="email"
              placeholder=""
              value={state.email}
              onChange={handleChange}
              onFocus={() => handleFocus('email')}
              onBlur={handleBlur}
              autoComplete="email"
            />
            <Label isActive={focused === 'email' || state.email}>Поштова скринька</Label>
          </InputDiv>

          <InputDiv $active={focused === 'password' || Boolean(state.password)}>
            <FieldIcon><FaLock /></FieldIcon>
            <InputField
              type="password"
              name="password"
              placeholder=""
              value={state.password}
              onChange={handleChange}
              onFocus={() => handleFocus('password')}
              onBlur={handleBlur}
              autoComplete="current-password"
            />
            <Label isActive={focused === 'password' || state.password}>Пароль</Label>
          </InputDiv>

          <RoleBlock>
            <RoleTitle>Оберіть роль</RoleTitle>
            <RoleGrid>
              <RoleOption $selected={selectedRole === 'ed'}>
                <RoleRadio type="radio" name="userRole" value="ed" checked={selectedRole === 'ed'} onChange={e => setSelectedRole(e.target.value)} />
                <RoleText>
                  <RoleName>Я донор яйцеклітин</RoleName>
                  <RoleHint>Перейти до нової анкети з полегшеним сценарієм заповнення.</RoleHint>
                </RoleText>
              </RoleOption>
              <RoleOption $selected={selectedRole === 'ag'}>
                <RoleRadio type="radio" name="userRole" value="ag" checked={selectedRole === 'ag'} onChange={e => setSelectedRole(e.target.value)} />
                <RoleText>
                  <RoleName>Ми агентство і шукаємо ДО</RoleName>
                  <RoleHint>Зберегти роль агентства та працювати з доступним набором полів.</RoleHint>
                </RoleText>
              </RoleOption>
            </RoleGrid>
          </RoleBlock>

          <CheckboxContainer>
            <CustomCheckbox id="login-terms" type="checkbox" checked={isChecked} onChange={handleCheckboxChange} />
            <CheckboxLabel htmlFor="login-terms">
              Я погоджуюся з Угодою користувача та надаю згоду на обробку моїх персональних даних відповідно до Політики конфіденційності.
            </CheckboxLabel>
            <TermsButton type="button" onClick={handleTermsClick}>Умови</TermsButton>
          </CheckboxContainer>

          <SubmitButton type="button" onClick={handleAuth} disabled={isLoading}>
            {isLoading ? 'Зачекайте…' : 'Вхід / Реєстрація'}
          </SubmitButton>
        </LoginCard>
      </InnerContainer>
    </Container>
  );
};
