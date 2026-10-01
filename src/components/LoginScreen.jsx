import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { FaUser, FaLock } from 'react-icons/fa';
import { auth } from './config';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth';
import { getCurrentDate } from './foramtDate';
import { useLocation, useNavigate } from 'react-router-dom';
import { authNotifications } from './authNotifications';
import {
  buildAuthLoginPayload,
  buildAuthProfilePayload,
  markAuthSession,
  MY_PROFILE_ROUTE,
  normalizeAuthEmail,
  persistUserWithFallback,
} from './authProfilePersistence';
import { readReturnToFromState } from 'utils/authRedirect';
import { PROFILE_ROLE_OPTIONS } from 'utils/profileRoleOptions';

// Що кожна роль дає в застосунку — одним рядком під назвою. Без пояснення
// пʼять однакових радіокнопок не казали, чим вони відрізняються.
const ROLE_DESCRIPTIONS = Object.freeze({
  ed: 'Вас знаходять агенції, клініки й батьки',
  sm: 'Коротка анкета: здоровʼя, пологи, умови програми',
  ip: 'Шукаєте донорку, сурогатну маму чи агенцію',
  ag: 'Програми й виплати, пошук кандидаток',
  cl: 'Програми й контакти клініки',
});

const Container = styled.div`
  --accent: var(--km-accent);
  --accent-light: var(--km-accent-light);
  --accent-mid: var(--km-accent-mid);
  --bg: var(--km-bg);
  --card: var(--km-card);
  --text: var(--km-text);
  --muted: var(--km-muted);
  --border: var(--km-border);
  --radius: var(--km-radius);
  --shadow: var(--km-shadow);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background:
    radial-gradient(circle at top left, rgba(232, 121, 26, 0.12), transparent 30%),
    var(--bg);
  color: var(--text);
  font-family: var(--km-font);
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

const WelcomeDescription = styled.p`
  margin: 12px auto 0;
  max-width: 340px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--muted);
`;

const InputDiv = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  margin-top: 14px;
  padding: 0 14px;
  min-height: 60px;
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
  padding: 26px 0 8px;
`;

const Label = styled.label`
  position: absolute;
  left: 44px;
  top: 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;

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
  background: ${({ disabled }) => (disabled ? 'var(--border)' : 'linear-gradient(135deg, var(--accent) 0%, var(--accent-mid) 100%)')};
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

const RoleHint = styled.p`
  margin: 0 0 10px;
  color: var(--text-muted, var(--text));
  font-size: 13px;
  line-height: 1.4;
`;

// Вхід і реєстрація — дві вкладки, а не одна кнопка «Вхід / Реєстрація».
// Досі ролі зʼявлялись лише після невдалої спроби з новою поштою, разом із
// тостом «Акаунта ще немає», — тобто перший крок новачка виглядав як помилка,
// а одруківка в пошті наявного акаунта вела в другу реєстрацію.
const ModeTabs = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  margin-bottom: 16px;
  border-radius: 14px;
  background: var(--accent-light);
`;

const ModeTab = styled.button`
  border: none;
  border-radius: 11px;
  padding: 10px 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--card)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--text)' : 'var(--muted)')};
  box-shadow: ${({ $active }) => ($active ? '0 1px 4px rgba(60, 30, 10, 0.12)' : 'none')};

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const RoleDescription = styled.span`
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.35;
`;

const LoginHint = styled.p`
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
`;

const LinkButton = styled.button`
  border: none;
  background: transparent;
  padding: 0;
  color: var(--accent);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
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
  background: color-mix(in srgb, var(--bg) 80%, transparent);
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
  border: 4px solid var(--accent-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

// `authStatus` за замовчуванням — `'pending'`, а не `'in'`: «не сказали» мусить
// означати «нічого не робимо». Значення `'in'` тут відсилало б читача геть з
// форми входу в того, хто змонтував її без цього пропа.
export const LoginScreen = ({ setIsLoggedIn, authStatus = 'pending' }) => {
  const [isChecked, setIsChecked] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  // Роль питається лише на вкладці «Створити акаунт». Досі її вимагали на
  // кожному вході й записували в анкету — тобто вхід переписував роль, обрану
  // в «Моєму профілі» (`buildAuthLoginPayload`).
  const [authMode, setAuthMode] = useState('login');
  const isRegisterMode = authMode === 'register';
  // Вхід не вдався, а акаунта з такою поштою перевірка не знає — під кнопкою
  // з'являється пропозиція створити його (а не мовчазний «невірний пароль»).
  const [loginFailedUnknownEmail, setLoginFailedUnknownEmail] = useState(false);
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
  const location = useLocation();
  // Адреса, з якої читача сюди привела межа входу. Посилання зазвичай ведуть
  // усередину застосунку, і після входу людина мусить опинитись там, куди їй
  // надіслали, а не в «Моєму профілі» з пошуком наосліп.
  const returnTo = readReturnToFromState(location.state);

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
    // Інша пошта — інше питання «чи є такий акаунт»: підказка про попередню
    // до неї не належить.
    if (name === 'email') setLoginFailedUnknownEmail(false);
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
    navigate(returnTo || MY_PROFILE_ROUTE, { replace: true });
  };

  const handleLogin = async email => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, state.password);
      const uploadedInfo = buildAuthLoginPayload({
        email,
        userId: userCredential.user.uid,
        todayDays,
        todayDash,
      });

      await persistUserWithFallback(userCredential.user.uid, uploadedInfo, 'update');

      markAuthSession({ email, userId: userCredential.user.uid });
      setIsLoggedIn(true);
      navigateAfterAuth();
      console.log('User signed in:', userCredential.user);
      return true;
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
        authNotifications.wrongPassword();
      } else {
        console.error('Error signing in:', error);
        authNotifications.genericAuthError();
      }
      return false;
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
      if (error.code === 'auth/email-already-in-use') {
        // `fetchSignInMethodsForEmail` мовчить, коли в проєкті ввімкнено
        // захист від перебору пошт, — тоді наявний акаунт виглядає як новий.
        // Реєструвати його вдруге нема чого: це вхід.
        await handleLogin(email);
      } else if (error.code === 'auth/weak-password') {
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

    if (!isChecked) {
      authNotifications.termsRequired();
      return;
    }

    setState(prevState => ({
      ...prevState,
      email: normalizedEmail,
    }));

    if (isRegisterMode && !selectedRole) {
      authNotifications.registrationRoleRequired();
      return;
    }

    setIsLoading(true);
    setLoginFailedUnknownEmail(false);
    try {
      if (isRegisterMode) {
        // Наявний акаунт тут не реєструється вдруге: `email-already-in-use`
        // веде у вхід (`handleRegistration`).
        await handleRegistration(normalizedEmail);
      } else {
        const signedIn = await handleLogin(normalizedEmail);
        if (!signedIn) {
          // Вкладка «Увійти» нікого не реєструє. Якщо пошту не впізнано,
          // під кнопкою стає пропозиція створити акаунт. Із захистом від
          // перебору пошт перевірка мовчить і про наявні — тоді лишається
          // сам «невірний пароль», а не хибна пропозиція реєстрації.
          const signInMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail).catch(() => null);
          if (Array.isArray(signInMethods) && signInMethods.length === 0) setLoginFailedUnknownEmail(true);
        }
      }
    } catch (error) {
      console.error('Error in authentication process:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Читача, який уже увійшов, форма входу не показує — але питає про це саме
  // Firebase, а не позначку в `localStorage`. Поки питали позначку, вкладка з
  // протухлою сесією їхала звідси на захищений екран, той вертав її назад сюди,
  // і людина бачила два редиректи по колу замість форми.
  useEffect(() => {
    if (authStatus !== 'in') return;
    setIsLoggedIn(true);
    navigate(returnTo || MY_PROFILE_ROUTE, { replace: true });
  }, [authStatus, navigate, returnTo, setIsLoggedIn]);

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
            <WelcomeDescription>Знайомтеся з донорками, батьками та агенціями. Зберігайте анкети й знаходьте тих, хто вам підходить.</WelcomeDescription>
          </BrandBlock>

          <ModeTabs role="tablist" aria-label="Вхід або реєстрація">
            <ModeTab type="button" role="tab" aria-selected={!isRegisterMode} $active={!isRegisterMode} onClick={() => setAuthMode('login')}>
              Увійти
            </ModeTab>
            <ModeTab
              type="button"
              role="tab"
              aria-selected={isRegisterMode}
              $active={isRegisterMode}
              onClick={() => { setAuthMode('register'); setLoginFailedUnknownEmail(false); }}
            >
              Створити акаунт
            </ModeTab>
          </ModeTabs>

          <InputDiv $active={focused === 'email' || Boolean(state.email)}>
            <FieldIcon><FaUser /></FieldIcon>
            <InputField
              type="email"
              id="login-email"
              name="email"
              placeholder=""
              value={state.email}
              onChange={handleChange}
              onFocus={() => handleFocus('email')}
              onBlur={handleBlur}
              autoComplete="email"
            />
            <Label htmlFor="login-email">Поштова скринька</Label>
          </InputDiv>

          <InputDiv $active={focused === 'password' || Boolean(state.password)}>
            <FieldIcon><FaLock /></FieldIcon>
            <InputField
              type="password"
              id="login-password"
              name="password"
              placeholder=""
              value={state.password}
              onChange={handleChange}
              onFocus={() => handleFocus('password')}
              onBlur={handleBlur}
              autoComplete="current-password"
            />
            <Label htmlFor="login-password">Пароль</Label>
          </InputDiv>

          {isRegisterMode && (
            <RoleBlock>
              <RoleTitle>Хто ви?</RoleTitle>
              <RoleHint>Від ролі залежить, які поля покаже анкета й кого ви побачите у стрічці. Змінити її можна будь-коли в «Моєму профілі».</RoleHint>
              <RoleGrid>
                {PROFILE_ROLE_OPTIONS.map(option => (
                  <RoleOption key={option.value} $selected={selectedRole === option.value}>
                    <RoleRadio
                      type="radio"
                      name="userRole"
                      value={option.value}
                      checked={selectedRole === option.value}
                      onChange={e => setSelectedRole(e.target.value)}
                    />
                    <RoleText>
                      <RoleName>{option.label}</RoleName>
                      {ROLE_DESCRIPTIONS[option.value] && <RoleDescription>{ROLE_DESCRIPTIONS[option.value]}</RoleDescription>}
                    </RoleText>
                  </RoleOption>
                ))}
              </RoleGrid>
            </RoleBlock>
          )}

          <CheckboxContainer>
            <CustomCheckbox id="login-terms" type="checkbox" checked={isChecked} onChange={handleCheckboxChange} />
            <CheckboxLabel htmlFor="login-terms">
              Я погоджуюся з Угодою користувача та надаю згоду на обробку моїх персональних даних відповідно до Політики конфіденційності.
            </CheckboxLabel>
            <TermsButton type="button" onClick={handleTermsClick}>Умови</TermsButton>
          </CheckboxContainer>

          <SubmitButton type="button" onClick={handleAuth} disabled={isLoading}>
            {isLoading ? 'Зачекайте…' : (isRegisterMode ? 'Створити акаунт' : 'Увійти')}
          </SubmitButton>
          {!isRegisterMode && loginFailedUnknownEmail && (
            <LoginHint aria-live="polite">
              Акаунта з такою поштою немає.{' '}
              <LinkButton type="button" onClick={() => { setAuthMode('register'); setLoginFailedUnknownEmail(false); }}>
                Створити акаунт
              </LinkButton>
            </LoginHint>
          )}
        </LoginCard>
      </InnerContainer>
    </Container>
  );
};
