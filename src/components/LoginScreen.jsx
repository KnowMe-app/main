import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaUser, FaLock, FaEye, FaEyeSlash, FaGlobe, FaChevronDown, FaTelegramPlane } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { auth, fetchUserById, hasAccountRegistration } from './config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, fetchSignInMethodsForEmail, signInWithCustomToken } from 'firebase/auth';
import { getCurrentDate } from './foramtDate';
import { useLocation, useNavigate } from 'react-router-dom';
import { authNotifications } from './authNotifications';
import {
  buildAuthLoginPayload,
  buildAuthProfilePayload,
  buildAuthSessionPayload,
  markAuthSession,
  MY_PROFILE_ROUTE,
  normalizeAuthEmail,
  persistAccountProfile,
} from './authProfilePersistence';
import { readReturnToFromState } from 'utils/authRedirect';
import { requestPasswordResetEmail, requestVerificationEmail } from 'utils/emailVerification';
import { PROFILE_ROLE_OPTIONS } from 'utils/profileRoleOptions';
import { APP_LANGUAGES, getLanguageNativeName } from 'utils/locales';
import { uiText } from 'utils/uiTranslations';
import { useAppSettings } from '../hooks/useAppSettings';
import {
  buildTelegramLoginLink,
  buildTelegramProfileData,
  clearTelegramLoginAttempt,
  createTelegramLoginNonce,
  isTelegramLoginAvailable,
  pollTelegramLogin,
  readTelegramLoginAttempt,
  saveTelegramLoginAttempt,
  TELEGRAM_LOGIN_STORAGE_KEY,
  TELEGRAM_LOGIN_TTL_MS,
  TELEGRAM_POLL_INTERVAL_MS,
} from 'utils/telegramAuth';

const MATCHING_ROUTE = '/matching';

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
  /* Рівне тло без помаранчевої плями в куті — як на решті екранів. */
  background: var(--bg);
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

/*
 * Вибір мови — над карткою входу, праворуч.
 *
 * Меню «⋮», де мова живе в застосунку, до входу недоступне, а людина, яка не
 * читає українською, мусить зрозуміти форму ще до того, як увійде. Тут
 * пігулка з назвою поточної мови її ж мовою, а під нею — рідний `select`:
 * сім варіантів телефон покаже своїм списком, і стрілки клавіатури працюють
 * без власної логіки. Вибір той самий, що й у меню (`appLanguage`), тож
 * після входу застосунок відкривається вже обраною мовою.
 */
const LanguageRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const LanguagePill = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--km-fill);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  svg { color: var(--muted); flex: 0 0 auto; }
  &:focus-within { box-shadow: 0 0 0 3px var(--km-accent-ring); }

  select {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
    font-size: 16px;
  }
`;

const LoginCard = styled.div`
  width: 100%;
  box-sizing: border-box;
  padding: 22px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: var(--shadow);
`;

const BrandBlock = styled.div`
  text-align: center;
  margin-bottom: 20px;
`;

const WelcomeText = styled.h1`
  margin: 0;
  color: var(--text);
  font-size: clamp(26px, 8vw, 32px);
  font-weight: 600;
  letter-spacing: -0.02em;
`;

const WelcomeAccent = styled.span`
  color: var(--accent);
`;

const WelcomeDescription = styled.p`
  margin: 10px auto 0;
  max-width: 340px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--muted);
`;

const InputDiv = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  margin-top: 14px;
  padding: 0 14px;
  min-height: 60px;
  /* Заливка замість рамки — як поля решти застосунку; рамка на фокусі. */
  background: ${({ $active }) => ($active ? 'var(--card)' : 'var(--km-fill)')};
  border: 1.5px solid ${({ $active }) => ($active ? 'var(--accent)' : 'transparent')};
  border-radius: 12px;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  box-shadow: ${({ $active }) => ($active ? '0 0 0 3px var(--km-accent-ring)' : 'none')};
`;

const FieldIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  color: var(--muted);
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
  font-weight: 600;
  /* Пласка кнопка акцентного кольору: на градієнті до світлого помаранчевого
     білий напис праворуч мав контраст нижче за 3:1. */
  background: ${({ disabled }) => (disabled ? 'var(--border)' : 'var(--accent)')};
  transition: transform 0.18s ease, filter 0.18s ease;

  &:hover {
    filter: ${({ disabled }) => (disabled ? 'none' : 'brightness(1.06)')};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px var(--km-accent-ring);
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
  background: var(--km-fill);
  border: 0;
  border-radius: 12px;
`;

const CheckboxLabel = styled.label`
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
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

// Підпис звичайним реченням, як решта підписів застосунку: великі літери
// («ХТО ВИ?») читались вигуком.
const RoleTitle = styled.legend`
  margin-bottom: 8px;
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
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
  border: 1px solid ${({ $selected }) => ($selected ? 'var(--accent)' : 'var(--border)')};
  border-radius: 12px;
  background: ${({ $selected }) => ($selected ? 'var(--accent-light)' : 'var(--card)')};
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease;

  &:hover {
    border-color: var(--accent);
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
  font-size: 15px;
  font-weight: 600;
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
  border-radius: 12px;
  background: var(--km-fill);
`;

const ModeTab = styled.button`
  border: none;
  border-radius: 9px;
  min-height: 40px;
  padding: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--card)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--text)' : 'var(--muted)')};
  box-shadow: ${({ $active }) => ($active ? '0 1px 2px rgba(28, 27, 26, 0.12)' : 'none')};

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const RoleDescription = styled.span`
  color: var(--muted);
  font-size: 13px;
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
  font-weight: 700;
  cursor: pointer;
`;

const PasswordToggle = styled.button`
  border: none;
  background: transparent;
  padding: 8px;
  margin-right: -6px;
  display: inline-flex;
  align-items: center;
  color: var(--muted);
  cursor: pointer;
`;

const ForgotRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  font-size: 13px;
`;

const LoginTermsNote = styled.p`
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
`;

const TermsButton = styled.button`
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  padding: 0;
  cursor: pointer;
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

/*
 * Вхід через Telegram — головна кнопка форми (на прохання власниці продукту:
 * для донорок і СМ телефон — це Telegram, а пошта — ділове листування).
 * Колір — Telegram, затемнений до контрасту з білим понад 4:1; пошта
 * лишається запасом під посиланням «Немає Telegram?».
 */
const TelegramButton = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  margin-top: 18px;
  padding: 16px;
  border-radius: var(--radius);
  background: #1f7ab8;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: filter 0.18s ease, transform 0.18s ease;

  svg { flex: 0 0 auto; }
  &:hover { filter: brightness(1.08); }
  &:active { transform: scale(0.99); }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px rgba(31, 122, 184, 0.35);
  }
`;

const TelegramHint = styled.p`
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
`;

const TelegramWaiting = styled.div`
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--km-fill);
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;

  strong { display: block; margin-bottom: 4px; font-size: 14px; }
`;

const TelegramWaitingActions = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
`;

const EmailToggleRow = styled.p`
  margin: 16px 0 0;
  text-align: center;
  font-size: 14px;
`;

const OrDivider = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  color: var(--muted);
  font-size: 12px;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
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
// Скільки форма входу чекає на анкету, щоб вирішити, куди вести
// (`resolveLandingRoute`).
const LANDING_ROUTE_TIMEOUT_MS = 4000;

export const LoginScreen = ({ setIsLoggedIn, authStatus = 'pending' }) => {
  const { language, setLanguage } = useAppSettings();
  const tr = (text, vars) => uiText(text, language, vars);
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
  // Вхід чи реєстрація, які веде сама форма. Firebase каже «увійшов» уже на
  // `createUserWithEmailAndPassword`, тобто до запису анкети, і ефект нижче
  // відвозив людину в «Мій профіль» посеред реєстрації: той читав ще порожню
  // картку, не знаходив ролі й показував «Донор ооцитів» замість обраної
  // агенції (`mergeLoadedProfileData` ставить `ed` за замовчуванням), а
  // перше ж збереження поля могло записати цю роль у базу. Поки форма працює,
  // переводить на профіль вона сама — після запису (`navigateAfterAuth`).
  const authFlowInProgressRef = useRef(false);
  const navigatedAfterAuthRef = useRef(false);

  // Пароль видно на прохання: набраний на телефоні наосліп, він найчастіше й
  // «невірний».
  const [showPassword, setShowPassword] = useState(false);

  // Telegram — основний вхід; пошта розгортається посиланням «Немає
  // Telegram?». Без налаштованого бота форма поштова, як і була.
  const telegramAvailable = isTelegramLoginAvailable();
  const [emailFormOpen, setEmailFormOpen] = useState(!telegramAvailable);
  const showEmailForm = !telegramAvailable || emailFormOpen;
  // `nonce` готовий ще до дотику: посилання на бота — звичайний `<a href>`.
  const [telegramNonce, setTelegramNonce] = useState(() => (telegramAvailable ? createTelegramLoginNonce() : ''));
  // Спроба, що чекає на номер у боті. Переживає перезавантаження вкладки.
  const [telegramAttempt, setTelegramAttempt] = useState(() => (telegramAvailable ? readTelegramLoginAttempt() : null));
  // Новий акаунт з Telegram, якому ще треба обрати роль (вхід почали з
  // вкладки «Увійти», де ролі не питають).
  const [telegramSignup, setTelegramSignup] = useState(null);
  // Бот отримав номер і показав людині код. Без коду функція токена не дає:
  // посилання на бота може підсунути чужа людина, і тоді номер ділила б
  // жертва, а сесію забирав би той, хто посилання згенерував.
  const [telegramCodeRequested, setTelegramCodeRequested] = useState(false);
  const telegramAttemptRef = useRef(telegramAttempt);
  telegramAttemptRef.current = telegramAttempt;
  const [telegramCode, setTelegramCode] = useState('');

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

  /**
   * Куди вести після входу: опублікована анкета — у стрічку, решта — у «Мій
   * профіль».
   *
   * Кожен вхід вів у «Мій профіль», і агенція, яка повертається гортати
   * анкети, щоразу тиснула ще й «Пошук анкет». Профіль потрібен тому, хто
   * ще не опублікувався, — йому туди й далі. Анкету читає той самий
   * `fetchUserById`, що й вхід у `App` (читання ділиться), тож це не зайвий
   * круг до бази.
   */
  //
  // Чекати на анкету довше за `LANDING_ROUTE_TIMEOUT_MS` форма не має права:
  // читання бази без звʼязку не падає, а висить (а `fetchUserById` ще й лістить
  // фото в Storage), і вхід, який уже відбувся, стояв під спінером без кінця.
  // Не встигли — «Мій профіль»: він малюється з памʼяті пристрою.
  const resolveLandingRoute = async uid => {
    if (!uid) return MY_PROFILE_ROUTE;
    let timer = null;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(MY_PROFILE_ROUTE), LANDING_ROUTE_TIMEOUT_MS);
    });
    const read = fetchUserById(uid)
      .then(profile => (profile?.publish === true ? MATCHING_ROUTE : MY_PROFILE_ROUTE))
      .catch(() => MY_PROFILE_ROUTE);
    try {
      return await Promise.race([read, timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  const navigateAfterAuth = async ({ registered = false } = {}) => {
    navigatedAfterAuthRef.current = true;
    const target = returnTo || (registered ? MY_PROFILE_ROUTE : await resolveLandingRoute(auth.currentUser?.uid));
    navigate(target, { replace: true });
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

      // Вхід — це сесія Firebase, а не запис дати входу: ні відмова бази на
      // `lastLogin`, ні її мовчання не мусять не пускати людину в застосунок.
      // Тому запис іде у фоні: запис RTDB чекає підтвердження сервера, і без
      // звʼязку з базою (мобільна мережа, сокет, що не піднявся) `await` тут
      // тримав форму під спінером без кінця — хоч Firebase уже сказав «увійшов».
      void persistAccountProfile(userCredential.user.uid, uploadedInfo, 'update').catch(error => {
        console.warn('[login] не вдалося записати дату входу', error);
      });

      markAuthSession({ email, userId: userCredential.user.uid });
      setIsLoggedIn(true);
      await navigateAfterAuth();
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

      // Лист підтвердження не тримає реєстрацію. Поки тут стояв `await`,
      // відмова Firebase (надто часті листи) кидала всю реєстрацію в `catch`:
      // акаунт уже існував, а анкета не записувалась, і людина бачила
      // «помилку входу». Лист — брендований KnowMe, а коли функція не
      // відповіла, — стандартний Firebase (`utils/emailVerification`).
      requestVerificationEmail(userCredential.user, { auth, language, role: selectedRole }).catch(error => {
        console.warn('Verification email was not sent:', error?.code || error);
      });
      await persistAccountProfile(userCredential.user.uid, uploadedInfo, 'set');

      markAuthSession({ email, userId: userCredential.user.uid });
      setIsLoggedIn(true);
      await navigateAfterAuth({ registered: true });
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

  /**
   * Лист для зміни пароля.
   *
   * Відновлення не було взагалі: хто забув пароль, втрачав анкету, а
   * реєструвався вдруге — на іншу пошту, тобто дублем. Відповідь однакова для
   * відомої й невідомої пошти: Firebase із захистом від перебору сам не каже,
   * чи є акаунт, і форма теж не має цього розкривати.
   */
  const handlePasswordReset = async () => {
    const normalizedEmail = normalizeAuthEmail(state.email);
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      authNotifications.resetEmailRequired();
      return;
    }
    setIsLoading(true);
    try {
      // Брендований лист KnowMe мовою інтерфейсу; коли функція не відповіла —
      // стандартний лист Firebase тією ж мовою (`utils/emailVerification`).
      await requestPasswordResetEmail(normalizedEmail, { auth, language });
      authNotifications.passwordResetSent(normalizedEmail);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        authNotifications.passwordResetSent(normalizedEmail);
      } else if (error.code === 'auth/too-many-requests') {
        authNotifications.tooManyRequests();
      } else if (error.code === 'auth/invalid-email') {
        authNotifications.invalidEmail();
      } else {
        console.error('Error sending password reset:', error);
        authNotifications.genericAuthError();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetTelegramAttempt = () => {
    setTelegramCodeRequested(false);
    setTelegramCode('');
    clearTelegramLoginAttempt();
    setTelegramAttempt(null);
    setTelegramNonce(createTelegramLoginNonce());
  };

  // Дотик до «Увійти через Telegram». Посилання відкривається саме (`href`),
  // тут лише перевірка реєстрації й запам'ятована спроба.
  const handleTelegramClick = event => {
    if (isRegisterMode && !isChecked) {
      event.preventDefault();
      authNotifications.termsRequired();
      return;
    }
    if (isRegisterMode && !selectedRole) {
      event.preventDefault();
      authNotifications.registrationRoleRequired();
      return;
    }
    const attempt = { nonce: telegramNonce, startedAt: Date.now(), role: isRegisterMode ? selectedRole : '' };
    saveTelegramLoginAttempt(attempt);
    setTelegramAttempt(attempt);
  };

  // Анкета нового акаунта з Telegram: підтверджений номер, нік і імʼя з
  // Telegram, роль — з форми. Пошти немає: людина без неї й реєструвалась.
  const finishTelegramRegistration = async (uid, profileData, role) => {
    const uploadedInfo = {
      ...profileData,
      areTermsConfirmed: todayDays,
      registrationDate: todayDays,
      ...buildAuthSessionPayload({ todayDays, todayDash }),
      userId: uid,
      userRole: role,
    };
    try {
      await persistAccountProfile(uid, uploadedInfo, 'set');
    } catch (error) {
      console.error('[telegram] не вдалося записати анкету', error);
    }
    markAuthSession({ email: '', userId: uid });
    setIsLoggedIn(true);
    await navigateAfterAuth({ registered: true });
    authFlowInProgressRef.current = false;
  };

  const completeTelegramAuth = async (result, attempt) => {
    authFlowInProgressRef.current = true;
    setIsLoading(true);
    resetTelegramAttempt();
    try {
      const credential = await signInWithCustomToken(auth, result.token);
      const uid = credential.user.uid;
      const profileData = buildTelegramProfileData(result.profile);
      // «Новий» для бота — акаунт Firebase, щойно заведений. Але бот заводить
      // його ще до коду, і спроба, що зірвалась після цього, лишала акаунт без
      // анкети: наступний вхід ішов як звичайний, і номер, яким людина
      // поділилась, не потрапляв нікуди. Тож реєстрацію доводить анкета, а не
      // бот. Збій читання — звичайний вхід: краще не дописати анкету, ніж
      // спитати роль у того, хто давно її обрав.
      const needsRegistration = result.isNew || !(await hasAccountRegistration(uid).catch(() => true));
      if (needsRegistration) {
        if (!attempt.role) {
          // Межа входу не відвозить звідси, поки роль не обрано:
          // `authFlowInProgressRef` лишається піднятим.
          setTelegramSignup({ uid, profileData });
          return;
        }
        await finishTelegramRegistration(uid, profileData, attempt.role);
        return;
      }
      // Як і вхід поштою: дата входу пишеться у фоні й вхід не тримає.
      void persistAccountProfile(uid, { ...buildAuthSessionPayload({ todayDays, todayDash }), userId: uid }, 'update').catch(error => {
        console.warn('[telegram] не вдалося записати дату входу', error);
      });
      markAuthSession({ email: '', userId: uid });
      setIsLoggedIn(true);
      await navigateAfterAuth();
      authFlowInProgressRef.current = false;
    } catch (error) {
      authFlowInProgressRef.current = false;
      console.error('[telegram] вхід не вдався', error);
      toast.error(tr('Не вдалося увійти через Telegram. Спробуйте ще раз або увійдіть поштою'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegramCodeSubmit = async event => {
    event?.preventDefault?.();
    const attempt = telegramAttempt;
    const code = telegramCode.replace(/\D/g, '');
    if (!attempt) return;
    if (code.length !== 6) {
      toast.error(tr('Введіть шість цифр коду з Telegram'));
      return;
    }
    setIsLoading(true);
    try {
      const result = await pollTelegramLogin(auth.app, attempt.nonce, code);
      if (result?.status === 'ready' && result.token) {
        await completeTelegramAuth(result, attempt);
        return;
      }
      if (result?.status === 'wrong-code') {
        setTelegramCode('');
        toast.error(tr('Невірний код. Залишилось спроб: {count}', { count: result.attemptsLeft }));
        return;
      }
      resetTelegramAttempt();
      toast.error(tr('Час на вхід через Telegram минув. Спробуйте ще раз'));
    } catch (error) {
      console.error('[telegram] код не перевірено', error);
      toast.error(tr('Не вдалося увійти через Telegram. Спробуйте ще раз або увійдіть поштою'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegramSignupContinue = async () => {
    if (!telegramSignup) return;
    if (!isChecked) {
      authNotifications.termsRequired();
      return;
    }
    if (!selectedRole) {
      authNotifications.registrationRoleRequired();
      return;
    }
    setIsLoading(true);
    try {
      await finishTelegramRegistration(telegramSignup.uid, telegramSignup.profileData, selectedRole);
    } finally {
      setIsLoading(false);
    }
  };

  // Спроба спільна для вкладок (`localStorage`): кнопка бота відкриває сайт
  // новою вкладкою, і та, що відкрилась, підхоплює спробу. Вкладка, у якій
  // вхід почали, — навпаки: коли спробу завершили чи скасували деінде, вона
  // мовчки її відпускає, а не опитує зниклий запис до тоста «час минув».
  useEffect(() => {
    if (!telegramAvailable) return undefined;
    const handleStorage = event => {
      if (event.key !== TELEGRAM_LOGIN_STORAGE_KEY) return;
      const shared = readTelegramLoginAttempt();
      if (telegramAttemptRef.current?.nonce === shared?.nonce) return;
      setTelegramCodeRequested(false);
      setTelegramAttempt(shared);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [telegramAvailable]);

  // Поки людина в боті, форма питає функцію, чи номер уже прийшов. Фонова
  // вкладка не питає (на телефоні вона й так заморожена), а повернення до неї
  // питає одразу — вхід завершується тієї ж миті, як людина повернулась.
  useEffect(() => {
    if (!telegramAttempt || telegramCodeRequested) return undefined;
    let cancelled = false;
    let busy = false;
    const tick = async () => {
      if (cancelled || busy || document.visibilityState === 'hidden') return;
      if (Date.now() - telegramAttempt.startedAt > TELEGRAM_LOGIN_TTL_MS) {
        resetTelegramAttempt();
        toast.error(tr('Час на вхід через Telegram минув. Спробуйте ще раз'));
        return;
      }
      busy = true;
      try {
        const result = await pollTelegramLogin(auth.app, telegramAttempt.nonce);
        if (cancelled) return;
        if (result?.status === 'code-required') {
          cancelled = true;
          setTelegramCodeRequested(true);
        } else if (result?.status === 'expired' || result?.status === 'invalid') {
          resetTelegramAttempt();
          toast.error(tr('Час на вхід через Telegram минув. Спробуйте ще раз'));
        }
      } catch (error) {
        // Мережа чи нерозгорнута функція — пробуємо далі до кінця строку.
        console.warn('[telegram] перевірка входу не вдалася', error?.code || error);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, TELEGRAM_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
    // Обробники читають лише стан форми на момент відповіді.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramAttempt, telegramCodeRequested]);

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

    // Згоду дають раз — створюючи акаунт. На кожному вході галочка лише
    // заважала: вхід без неї зупинявся тостом, хоч згоду вже дано.
    if (isRegisterMode && !isChecked) {
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
    authFlowInProgressRef.current = true;
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
      authFlowInProgressRef.current = false;
      setIsLoading(false);
      // Акаунт створено, а запис анкети впав: ефект нижче цей момент
      // пропустив, тож відвозимо звідси тут, як і було до гарда.
      if (auth.currentUser && !navigatedAfterAuthRef.current) void navigateAfterAuth({ registered: isRegisterMode });
    }
  };

  // Читача, який уже увійшов, форма входу не показує — але питає про це саме
  // Firebase, а не позначку в `localStorage`. Поки питали позначку, вкладка з
  // протухлою сесією їхала звідси на захищений екран, той вертав її назад сюди,
  // і людина бачила два редиректи по колу замість форми.
  useEffect(() => {
    if (authStatus !== 'in' || authFlowInProgressRef.current) return undefined;
    setIsLoggedIn(true);
    let cancelled = false;
    (returnTo ? Promise.resolve(returnTo) : resolveLandingRoute(auth.currentUser?.uid)).then(target => {
      if (!cancelled) navigate(target, { replace: true });
    });
    return () => { cancelled = true; };
    // resolveLandingRoute reads only the auth user and a shared fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, navigate, returnTo, setIsLoggedIn]);

  return (
    <Container>
      {isLoading && (
        <LoadingOverlay>
          <Spinner />
        </LoadingOverlay>
      )}
      <InnerContainer>
        <LanguageRow>
          <LanguagePill title={language === 'en' ? 'Language' : `${tr('Мова')} · Language`}>
            <FaGlobe aria-hidden="true" />
            <span lang={language}>{getLanguageNativeName(language)}</span>
            <FaChevronDown size={10} aria-hidden="true" />
            <select
              data-testid="login-language"
              aria-label={language === 'en' ? 'Language' : `${tr('Мова')} · Language`}
              value={language}
              onChange={event => setLanguage(event.target.value)}
            >
              {APP_LANGUAGES.map(item => (
                <option key={item.code} value={item.code} lang={item.code}>{item.nativeName}</option>
              ))}
            </select>
          </LanguagePill>
        </LanguageRow>
        <LoginCard>
          <BrandBlock>
            <WelcomeText>KnowMe<WelcomeAccent>.</WelcomeAccent></WelcomeText>
            <WelcomeDescription>{tr('Знайомтеся з донорками, батьками та агенціями. Зберігайте анкети й знаходьте тих, хто вам підходить.')}</WelcomeDescription>
          </BrandBlock>

          {telegramSignup ? (
            <>
              <RoleHint>{tr('Майже готово: оберіть, хто ви')}</RoleHint>
              <RoleBlock>
                <RoleTitle>{tr('Хто ви?')}</RoleTitle>
                <RoleHint>{tr('Від ролі залежить, які поля покаже анкета й кого ви побачите у стрічці. Змінити її можна будь-коли в «Моєму профілі».')}</RoleHint>
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
                        <RoleName>{tr(option.label)}</RoleName>
                        {ROLE_DESCRIPTIONS[option.value] && <RoleDescription>{tr(ROLE_DESCRIPTIONS[option.value])}</RoleDescription>}
                      </RoleText>
                    </RoleOption>
                  ))}
                </RoleGrid>
              </RoleBlock>
              <CheckboxContainer>
                <CustomCheckbox id="login-terms" type="checkbox" checked={isChecked} onChange={handleCheckboxChange} />
                <CheckboxLabel htmlFor="login-terms">
                  {tr('Я погоджуюся з Угодою користувача та надаю згоду на обробку моїх персональних даних відповідно до Політики конфіденційності.')}
                </CheckboxLabel>
                <TermsButton type="button" onClick={handleTermsClick}>{tr('Умови')}</TermsButton>
              </CheckboxContainer>
              <SubmitButton type="button" onClick={handleTelegramSignupContinue} disabled={isLoading}>
                {tr(isLoading ? 'Зачекайте…' : 'Продовжити')}
              </SubmitButton>
            </>
          ) : (
          <>
          <ModeTabs role="tablist" aria-label={tr('Вхід або реєстрація')}>
            <ModeTab type="button" role="tab" aria-selected={!isRegisterMode} $active={!isRegisterMode} onClick={() => setAuthMode('login')}>
              {tr('Увійти')}
            </ModeTab>
            <ModeTab
              type="button"
              role="tab"
              aria-selected={isRegisterMode}
              $active={isRegisterMode}
              onClick={() => { setAuthMode('register'); setLoginFailedUnknownEmail(false); }}
            >
              {tr('Створити акаунт')}
            </ModeTab>
          </ModeTabs>
          {isRegisterMode && (
            <RoleBlock>
              <RoleTitle>{tr('Хто ви?')}</RoleTitle>
              <RoleHint>{tr('Від ролі залежить, які поля покаже анкета й кого ви побачите у стрічці. Змінити її можна будь-коли в «Моєму профілі».')}</RoleHint>
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
                      <RoleName>{tr(option.label)}</RoleName>
                      {ROLE_DESCRIPTIONS[option.value] && <RoleDescription>{tr(ROLE_DESCRIPTIONS[option.value])}</RoleDescription>}
                    </RoleText>
                  </RoleOption>
                ))}
              </RoleGrid>
            </RoleBlock>
          )}
          {isRegisterMode && (
            <CheckboxContainer>
              <CustomCheckbox id="login-terms" type="checkbox" checked={isChecked} onChange={handleCheckboxChange} />
              <CheckboxLabel htmlFor="login-terms">
                {tr('Я погоджуюся з Угодою користувача та надаю згоду на обробку моїх персональних даних відповідно до Політики конфіденційності.')}
              </CheckboxLabel>
              <TermsButton type="button" onClick={handleTermsClick}>{tr('Умови')}</TermsButton>
            </CheckboxContainer>
          )}

          {telegramAvailable && (
            <>
              <TelegramButton
                href={buildTelegramLoginLink(telegramNonce)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleTelegramClick}
                data-testid="login-telegram"
              >
                <FaTelegramPlane size={20} aria-hidden="true" />
                {tr(isRegisterMode ? 'Зареєструватися через Telegram' : 'Увійти через Telegram')}
              </TelegramButton>
              {telegramAttempt && telegramCodeRequested ? (
                <TelegramWaiting as="form" aria-live="polite" onSubmit={handleTelegramCodeSubmit}>
                  <strong>{tr('Введіть код із Telegram')}</strong>
                  {tr('Бот надіслав вам шість цифр. Нікому їх не повідомляйте.')}
                  <InputDiv $active>
                    <InputField
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      name="telegramCode"
                      data-testid="login-telegram-code"
                      maxLength={7}
                      value={telegramCode}
                      onChange={event => setTelegramCode(event.target.value.replace(/[^\d ]/g, ''))}
                      aria-label={tr('Код із Telegram')}
                      style={{ padding: '16px 0', textAlign: 'center', fontSize: 22, letterSpacing: '0.3em' }}
                      autoFocus
                    />
                  </InputDiv>
                  <SubmitButton type="submit" disabled={isLoading}>{tr(isLoading ? 'Зачекайте…' : 'Увійти')}</SubmitButton>
                  <TelegramWaitingActions>
                    <LinkButton type="button" onClick={resetTelegramAttempt}>{tr('Скасувати вхід')}</LinkButton>
                  </TelegramWaitingActions>
                </TelegramWaiting>
              ) : telegramAttempt ? (
                <TelegramWaiting aria-live="polite">
                  <strong>{tr('Чекаємо на номер у Telegram…')}</strong>
                  {tr('Відкрийте бота KnowMe й натисніть «Поділитися номером». Бот надішле код для входу.')}
                  <TelegramWaitingActions>
                    <LinkButton as="a" href={buildTelegramLoginLink(telegramAttempt.nonce)} target="_blank" rel="noopener noreferrer">
                      {tr('Відкрити Telegram ще раз')}
                    </LinkButton>
                    <LinkButton type="button" onClick={resetTelegramAttempt}>{tr('Скасувати вхід')}</LinkButton>
                  </TelegramWaitingActions>
                </TelegramWaiting>
              ) : (
                <TelegramHint>{tr('Без пароля й пошти: бот попросить поділитися номером телефону.')}</TelegramHint>
              )}
            </>
          )}
          {telegramAvailable && !emailFormOpen && (
            <EmailToggleRow>
              <LinkButton type="button" onClick={() => setEmailFormOpen(true)} data-testid="login-email-toggle">
                {tr(isRegisterMode ? 'Немає Telegram? Зареєструватися поштою' : 'Немає Telegram? Увійти поштою')}
              </LinkButton>
            </EmailToggleRow>
          )}

          {showEmailForm && (
          <>
          {telegramAvailable && <OrDivider>{tr('або поштою')}</OrDivider>}
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
            <Label htmlFor="login-email">{tr('Поштова скринька')}</Label>
          </InputDiv>

          <InputDiv $active={focused === 'password' || Boolean(state.password)}>
            <FieldIcon><FaLock /></FieldIcon>
            <InputField
              type={showPassword ? 'text' : 'password'}
              id="login-password"
              name="password"
              placeholder=""
              value={state.password}
              onChange={handleChange}
              onFocus={() => handleFocus('password')}
              onBlur={handleBlur}
              autoComplete="current-password"
            />
            <Label htmlFor="login-password">{tr('Пароль')}</Label>
            <PasswordToggle
              type="button"
              onClick={() => setShowPassword(value => !value)}
              aria-label={tr(showPassword ? 'Сховати пароль' : 'Показати пароль')}
              aria-pressed={showPassword}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </PasswordToggle>
          </InputDiv>
          {!isRegisterMode && (
            <ForgotRow>
              <LinkButton type="button" onClick={handlePasswordReset} disabled={isLoading}>
                {tr('Забули пароль?')}
              </LinkButton>
            </ForgotRow>
          )}
          <SubmitButton type="button" onClick={handleAuth} disabled={isLoading}>
            {tr(isLoading ? 'Зачекайте…' : (isRegisterMode ? 'Створити акаунт' : 'Увійти'))}
          </SubmitButton>
          </>
          )}
          {!isRegisterMode && (
            <LoginTermsNote>
              {/* Посилання стоїть там, де його ставить переклад: у німецькій
                  чи японській після нього ще йде частина речення. */}
              {(() => {
                const [before, after = ''] = tr('Входячи, ви погоджуєтесь з {link}.').split('{link}');
                return <>{before}<LinkButton type="button" onClick={handleTermsClick}>{tr('Угодою користувача')}</LinkButton>{after}</>;
              })()}
            </LoginTermsNote>
          )}
          {!isRegisterMode && loginFailedUnknownEmail && (
            <LoginHint aria-live="polite">
              {tr('Акаунта з такою поштою немає.')}{' '}
              <LinkButton type="button" onClick={() => { setAuthMode('register'); setLoginFailedUnknownEmail(false); }}>
                {tr('Створити акаунт')}
              </LinkButton>
            </LoginHint>
          )}
          </>
          )}
        </LoginCard>
      </InnerContainer>
    </Container>
  );
};
