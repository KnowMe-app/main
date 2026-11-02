import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  onAuthStateChanged,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { MdLockReset, MdMarkEmailRead, MdOutlineLinkOff, MdRefresh } from 'react-icons/md';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { auth } from './config';
import { hasStoredLanguagePreference, useAppSettings } from '../hooks/useAppSettings';
import { isSupportedLanguage } from '../utils/locales';
import { uiText } from '../utils/uiTranslations';
import { requestVerificationEmail } from '../utils/emailVerification';

/*
 * Сторінка, на яку ведуть посилання з листів Firebase Auth: підтвердження
 * пошти (`verifyEmail`), зміна пароля (`resetPassword`), повернення й
 * підтвердження нової адреси (`recoverEmail`, `verifyAndChangeEmail`).
 *
 * Доти кнопка з листа вела на сіру сторінку Firebase
 * (`webringitapp.firebaseapp.com/__/auth/action`) англійською — з неї людина
 * не мала куди йти далі. Власний лист KnowMe (`functions/index.js`) веде сюди
 * завжди; стандартні листи Firebase — коли в консолі (Authentication →
 * Templates → «Customize action URL») стоїть `https://knowme.pp.ua/auth/action`.
 * Тоді сюди ж приходить і «Забули пароль?», тому зміну пароля сторінка теж
 * уміє — інакше та адреса в консолі зламала б відновлення пароля.
 *
 * Сторінка публічна: людина відкриває лист на телефоні, де ще не входила.
 * Бази вона не читає взагалі — лише Firebase Auth з одноразовим кодом з
 * адреси. Межу входу решти застосунку це не зрушує (`App.routeGuards.test`).
 */

// Код одноразовий, а ефект у режимі розробки React запускає двічі: друге
// `applyActionCode` на вже використаному коді відповідало б «посилання не
// діє» поверх щойно підтвердженої пошти. Тож результат ділиться за кодом.
const actionResults = new Map();
const runOnce = (key, task) => {
  if (!actionResults.has(key)) actionResults.set(key, task());
  return actionResults.get(key);
};
export const resetAuthActionResultsForTests = () => actionResults.clear();

const EXPIRED_CODES = new Set(['auth/invalid-action-code', 'auth/expired-action-code']);
const MIN_PASSWORD_LENGTH = 6;

/** Перша відповідь Firebase про сесію: до неї `auth.currentUser` ще порожній. */
const waitForAuthUser = () =>
  new Promise(resolve => {
    let answered = false;
    let unsubscribe = null;
    unsubscribe = onAuthStateChanged(auth, user => {
      answered = true;
      if (unsubscribe) unsubscribe();
      resolve(user || null);
    });
    if (answered && unsubscribe) unsubscribe();
  });

/** Свіжий стан пошти користувача, який уже увійшов на цьому пристрої. */
const reloadSignedInUser = async () => {
  const user = await waitForAuthUser();
  if (!user) return null;
  try {
    await user.reload();
  } catch (error) {
    // Без мережі лишаємо те, що знаємо.
  }
  return auth.currentUser || user;
};

const verifyEmailAction = async oobCode => {
  // «Уже підтверджено» кажемо лише про акаунт, на який веде саме це посилання:
  // увімкнений `emailVerified` іншого акаунта цього браузера про код не каже
  // нічого, і прострочене посилання чужої пошти виглядало б успіхом.
  let targetEmail = '';
  try {
    const info = await checkActionCode(auth, oobCode);
    targetEmail = info?.data?.email || '';
    await applyActionCode(auth, oobCode);
    const user = await reloadSignedInUser();
    return { status: 'verified', email: targetEmail || user?.email || '', signedIn: Boolean(user) };
  } catch (error) {
    const user = await reloadSignedInUser();
    const sameAccount = Boolean(
      targetEmail && user?.email && user.email.toLowerCase() === targetEmail.toLowerCase(),
    );
    if (sameAccount && user.emailVerified) {
      return { status: 'alreadyVerified', email: user.email || '', signedIn: true };
    }
    if (EXPIRED_CODES.has(error?.code)) {
      return { status: 'expired', email: targetEmail || '', signedIn: Boolean(user) };
    }
    return { status: 'failed', signedIn: Boolean(user), code: error?.code || '' };
  }
};

const emailChangeAction = async (oobCode, mode) => {
  try {
    const info = await checkActionCode(auth, oobCode);
    await applyActionCode(auth, oobCode);
    const email = mode === 'recoverEmail' ? info?.data?.email : info?.data?.email || info?.data?.previousEmail;
    return { status: mode === 'recoverEmail' ? 'emailRestored' : 'emailChanged', email: email || '' };
  } catch (error) {
    return { status: EXPIRED_CODES.has(error?.code) ? 'linkExpired' : 'failed', code: error?.code || '' };
  }
};

const resetCheckAction = async oobCode => {
  try {
    const email = await verifyPasswordResetCode(auth, oobCode);
    return { status: 'resetForm', email: email || '' };
  } catch (error) {
    return { status: EXPIRED_CODES.has(error?.code) ? 'resetExpired' : 'failed', code: error?.code || '' };
  }
};

const SUPPORTED_MODES = new Set(['verifyEmail', 'resetPassword', 'recoverEmail', 'verifyAndChangeEmail']);

const resolveAction = (mode, oobCode) => {
  if (!oobCode || !SUPPORTED_MODES.has(mode)) return () => Promise.resolve({ status: 'invalid' });
  if (mode === 'verifyEmail') return () => verifyEmailAction(oobCode);
  if (mode === 'resetPassword') return () => resetCheckAction(oobCode);
  return () => emailChangeAction(oobCode, mode);
};

export const AuthActionPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language, setLanguage } = useAppSettings();
  const tr = useCallback((text, vars) => uiText(text, language, vars), [language]);

  const mode = searchParams.get('mode') || '';
  const oobCode = searchParams.get('oobCode') || '';
  const [state, setState] = useState({ status: 'working' });
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);

  // Мова з листа (`?lang=`) — лише коли людина на цьому пристрої її ще не
  // обирала: посилання часто відкривають там, де застосунку ще не було.
  useEffect(() => {
    const requested = searchParams.get('lang');
    if (isSupportedLanguage(requested) && requested !== language && !hasStoredLanguagePreference()) {
      setLanguage(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setState({ status: 'working' });
    runOnce(`${mode}:${oobCode}:${attempt}`, resolveAction(mode, oobCode)).then(result => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, [mode, oobCode, attempt]);

  useEffect(() => {
    if (state.status === 'resetForm' && passwordRef.current) passwordRef.current.focus();
  }, [state.status]);

  const goToLogin = () => navigate('/login', { replace: true });
  const goToProfile = () => navigate('/my-profile', { replace: true });

  const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user) {
      goToLogin();
      return;
    }
    setBusy(true);
    try {
      await requestVerificationEmail(user, { auth, language });
      setState(prev => ({ ...prev, status: 'resent', email: user.email || prev.email }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        notice: error?.code === 'auth/too-many-requests'
          ? tr('Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз')
          : tr('Лист не надіслано. Перевірте звʼязок і спробуйте ще раз.'),
      }));
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async event => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(tr('Пароль має містити щонайменше 6 символів'));
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setPassword('');
      setState(prev => ({ ...prev, status: 'resetDone' }));
    } catch (error) {
      if (error?.code === 'auth/weak-password') {
        setFormError(tr('Пароль має містити щонайменше 6 символів'));
      } else if (EXPIRED_CODES.has(error?.code)) {
        setState(prev => ({ ...prev, status: 'resetExpired' }));
      } else {
        setFormError(tr('Не вдалося змінити пароль. Спробуйте ще раз.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const view = (() => {
    switch (state.status) {
      case 'working':
        return {
          tone: 'neutral',
          icon: <MdRefresh />,
          title: mode === 'verifyEmail' ? tr('Підтверджуємо пошту…') : tr('Перевіряємо посилання…'),
        };
      case 'verified':
        return {
          tone: 'success',
          icon: <MdMarkEmailRead />,
          title: tr('Пошту підтверджено'),
          text: state.email
            ? tr('Адресу {email} привʼязано до акаунта. Якщо забудете пароль, лист для відновлення прийде сюди.', { email: state.email })
            : '',
          primary: state.signedIn ? [tr('Перейти до анкети'), goToProfile] : [tr('Увійти'), goToLogin],
        };
      case 'alreadyVerified':
        return {
          tone: 'success',
          icon: <MdMarkEmailRead />,
          title: tr('Пошту вже підтверджено'),
          primary: [tr('Перейти до анкети'), goToProfile],
        };
      case 'expired':
        return {
          tone: 'neutral',
          icon: <MdOutlineLinkOff />,
          title: tr('Посилання вже не діє'),
          text: state.signedIn
            ? tr('Його вже використали або воно застаріло. Надішліть собі новий лист.')
            : tr('Увійдіть в акаунт, і новий лист можна буде надіслати з меню ⋮ → «{menu}».', { menu: tr('Підтвердити email') }),
          primary: state.signedIn ? [tr('Надіслати новий лист'), resendVerification] : [tr('Увійти'), goToLogin],
        };
      case 'resent':
        return {
          tone: 'success',
          icon: <MdMarkEmailRead />,
          title: tr('Перевірте пошту'),
          text: tr('Новий лист надіслано на {email}. Перевірте й «Спам».', { email: state.email }),
        };
      case 'resetForm':
        return {
          tone: 'accent',
          icon: <MdLockReset />,
          title: tr('Новий пароль'),
          text: state.email ? tr('Для акаунта {email}', { email: state.email }) : '',
          form: true,
        };
      case 'resetDone':
        return {
          tone: 'success',
          icon: <MdLockReset />,
          title: tr('Пароль змінено'),
          text: tr('Тепер увійдіть з новим паролем.'),
          primary: [tr('Увійти'), goToLogin],
        };
      case 'resetExpired':
        return {
          tone: 'neutral',
          icon: <MdOutlineLinkOff />,
          title: tr('Посилання для зміни пароля вже не діє'),
          text: tr('Попросіть новий лист на екрані входу: «{link}».', { link: tr('Забули пароль?') }),
          primary: [tr('Увійти'), goToLogin],
        };
      case 'emailRestored':
        return {
          tone: 'success',
          icon: <MdMarkEmailRead />,
          title: tr('Адресу пошти повернуто'),
          text: state.email
            ? tr('Акаунт знову привʼязано до {email}. Якщо пошту змінювали не ви, змініть пароль.', { email: state.email })
            : '',
          primary: [tr('Увійти'), goToLogin],
        };
      case 'emailChanged':
        return {
          tone: 'success',
          icon: <MdMarkEmailRead />,
          title: tr('Нову адресу пошти підтверджено'),
          text: state.email ? tr('Тепер акаунт привʼязано до {email}.', { email: state.email }) : '',
          primary: [tr('Увійти'), goToLogin],
        };
      case 'linkExpired':
        return {
          tone: 'neutral',
          icon: <MdOutlineLinkOff />,
          title: tr('Посилання вже не діє'),
          primary: [tr('Увійти'), goToLogin],
        };
      case 'invalid':
        return {
          tone: 'neutral',
          icon: <MdOutlineLinkOff />,
          title: tr('Посилання неповне'),
          text: tr('Відкрийте посилання з листа ще раз: схоже, частина адреси загубилась.'),
          primary: [tr('Увійти'), goToLogin],
        };
      default:
        return {
          tone: 'neutral',
          icon: <MdOutlineLinkOff />,
          title: tr('Не вдалося перевірити посилання'),
          text: tr('Перевірте звʼязок і спробуйте ще раз.'),
          primary: [tr('Спробувати ще раз'), () => setAttempt(value => value + 1)],
        };
    }
  })();

  return (
    <Page data-testid="auth-action-page" data-status={state.status}>
      <Brand aria-label="KnowMe">
        KnowMe<span>.</span>
      </Brand>
      <Card role="status" aria-live="polite" aria-busy={state.status === 'working'}>
        <Badge $tone={view.tone} aria-hidden="true" $spin={state.status === 'working'}>
          {view.icon}
        </Badge>
        <Title>{view.title}</Title>
        {view.text && <Text>{view.text}</Text>}

        {view.form && (
          <Form onSubmit={submitNewPassword} noValidate>
            <FieldLabel htmlFor="auth-action-password">{tr('Новий пароль')}</FieldLabel>
            <PasswordRow>
              <PasswordInput
                id="auth-action-password"
                ref={passwordRef}
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? 'auth-action-password-error' : undefined}
              />
              <EyeButton
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? tr('Сховати пароль') : tr('Показати пароль')}
                title={showPassword ? tr('Сховати пароль') : tr('Показати пароль')}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </EyeButton>
            </PasswordRow>
            {formError && <FormError id="auth-action-password-error" role="alert">{formError}</FormError>}
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? tr('Зачекайте…') : tr('Зберегти пароль')}
            </PrimaryButton>
          </Form>
        )}

        {state.notice && <FormError role="alert">{state.notice}</FormError>}

        {view.primary && (
          <PrimaryButton type="button" onClick={view.primary[1]} disabled={busy}>
            {busy ? tr('Зачекайте…') : view.primary[0]}
          </PrimaryButton>
        )}
      </Card>
    </Page>
  );
};

export default AuthActionPage;

const Page = styled.main`
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: max(20px, env(safe-area-inset-top, 0px)) 16px 40px;
  background: var(--km-bg, #FAF9F7);
  color: var(--km-text, #1A1A1A);
  font-family: var(--km-font, inherit);
`;

const Brand = styled.div`
  align-self: center;
  width: 100%;
  max-width: 420px;
  font-family: var(--km-font-display, inherit);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;

  span { color: var(--km-accent, #C9600F); }
`;

const Card = styled.section`
  width: 100%;
  max-width: 420px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  margin-top: min(12vh, 96px);
  padding: 28px 22px 22px;
  border: 1px solid var(--km-border, #E8E5E0);
  border-radius: var(--km-radius-lg, 18px);
  background: var(--km-card, #FFFFFF);
  box-shadow: var(--km-shadow);
`;

const BADGE_TONES = {
  success: ['var(--km-success-bg, #EBF8EF)', 'var(--km-success, #2E9B55)'],
  accent: ['var(--km-accent-light, #FCEBDC)', 'var(--km-accent, #C9600F)'],
  neutral: ['var(--km-fill, #F0EDE8)', 'var(--km-muted, #62665F)'],
};

const Badge = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 26px;
  background: ${({ $tone }) => (BADGE_TONES[$tone] || BADGE_TONES.neutral)[0]};
  color: ${({ $tone }) => (BADGE_TONES[$tone] || BADGE_TONES.neutral)[1]};

  svg { animation: ${({ $spin }) => ($spin ? 'km-auth-action-spin 1.1s linear infinite' : 'none')}; }

  @keyframes km-auth-action-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { svg { animation: none; } }
`;

const Title = styled.h1`
  margin: 0;
  font-family: var(--km-font-display, inherit);
  font-size: 22px;
  line-height: 1.25;
  font-weight: 700;
  text-wrap: balance;
`;

const Text = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--km-muted, #62665F);
  overflow-wrap: anywhere;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FieldLabel = styled.label`
  font-size: 13px;
  color: var(--km-muted, #62665F);
`;

const PasswordRow = styled.div`
  position: relative;
  display: flex;
`;

const PasswordInput = styled.input`
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  height: 48px;
  padding: 0 48px 0 14px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--km-fill, #F0EDE8);
  color: inherit;
  font: inherit;
  font-size: 16px;

  &:focus {
    outline: none;
    border-color: var(--km-accent, #C9600F);
    box-shadow: 0 0 0 3px var(--km-accent-ring, rgba(201, 96, 15, 0.18));
  }
`;

const EyeButton = styled.button`
  position: absolute;
  top: 0;
  right: 0;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--km-muted, #62665F);
  cursor: pointer;
`;

const FormError = styled.p`
  margin: 0;
  font-size: 14px;
  color: var(--km-danger, #B42318);
`;

const PrimaryButton = styled.button`
  margin-top: 6px;
  min-height: 48px;
  padding: 12px 16px;
  border: 0;
  border-radius: 12px;
  background: var(--km-accent, #C9600F);
  color: var(--km-on-accent, #FFFFFF);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;

  &:disabled { opacity: 0.6; cursor: default; }
  &:focus-visible { outline: 2px solid var(--km-accent, #C9600F); outline-offset: 2px; }
`;
