import React, { useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { FaGoogle, FaEnvelope } from 'react-icons/fa';
import { EmailAuthProvider, GoogleAuthProvider, linkWithCredential, linkWithPopup } from 'firebase/auth';
import { uiText } from 'utils/uiTranslations';
import { createGoogleAuthProvider, isGoogleSignInCancelled } from 'utils/googleAuth';
import { mergeAccountWithCredential } from 'utils/accountLinks';

/**
 * «Способи входу» у «Моєму профілі»: Google і пошта з паролем на тому самому
 * акаунті (`linkWithPopup` / `linkWithCredential` — один uid, кілька способів).
 *
 * Спосіб, що вже відкриває **інший** акаунт KnowMe (людина колись зайшла
 * через Google і завела ще один), Firebase не привʼязує
 * (`credential-already-in-use`). Тоді картка пропонує обʼєднати: людина
 * підтверджує, застосунок входить у той акаунт окремим екземпляром Auth
 * (`mergeAccountWithCredential`), і сервер доливає його дані сюди, а сам
 * акаунт робить другорядним — вхід у нього перемикає на цей
 * (`functions/accountMerge.js`). Telegram привʼязує `TelegramLinkCard`.
 */
const ALREADY_IN_USE = ['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/account-exists-with-different-credential'];
const WRONG_PASSWORD = ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'];

const SignInMethodsCard = ({ auth, language, onMerged }) => {
  const user = auth?.currentUser || null;
  const t = (text, vars) => uiText(text, language, vars);
  const providers = (user?.providerData || []).map(provider => provider?.providerId);
  const [googleLinked, setGoogleLinked] = useState(providers.includes('google.com'));
  const [passwordLinked, setPasswordLinked] = useState(providers.includes('password'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Спосіб, що належить іншому акаунту: чекає на «Обʼєднати».
  const [pendingMerge, setPendingMerge] = useState(null);

  if (!user) return null;

  const offerMerge = (credential, method) => {
    if (!credential) {
      toast.error(t('Цей спосіб входу вже відкриває інший акаунт KnowMe. Увійдіть у нього й привʼяжіть звідти.'));
      return;
    }
    setPendingMerge({ credential, method });
  };

  const linkGoogle = async () => {
    setBusy(true);
    try {
      await linkWithPopup(user, createGoogleAuthProvider());
      setGoogleLinked(true);
      toast.success(t('Google привʼязано. Тепер «Увійти через Google» відкриває цей акаунт.'));
    } catch (error) {
      if (isGoogleSignInCancelled(error)) return;
      if (error?.code === 'auth/provider-already-linked') {
        setGoogleLinked(true);
      } else if (ALREADY_IN_USE.includes(error?.code)) {
        offerMerge(GoogleAuthProvider.credentialFromError(error), 'google');
      } else if (error?.code === 'auth/requires-recent-login') {
        toast.error(t('Щоб привʼязати новий спосіб входу, вийдіть і увійдіть знову'));
      } else {
        console.error('[accounts] Google не привʼязано', error);
        toast.error(t('Не вдалося привʼязати Google. Спробуйте ще раз'));
      }
    } finally {
      setBusy(false);
    }
  };

  const linkEmail = async event => {
    event?.preventDefault?.();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 6) {
      toast.error(t('Введіть пошту й пароль від 6 символів'));
      return;
    }
    const credential = EmailAuthProvider.credential(normalizedEmail, password);
    setBusy(true);
    try {
      await linkWithCredential(user, credential);
      setPasswordLinked(true);
      setEmailFormOpen(false);
      setPassword('');
      toast.success(t('Вхід поштою додано. Тепер пошта й пароль відкривають цей акаунт.'));
    } catch (error) {
      if (ALREADY_IN_USE.includes(error?.code)) {
        // Пароль від того акаунта людина щойно ввела — він і є доказом.
        offerMerge(credential, 'email');
      } else if (error?.code === 'auth/weak-password') {
        toast.error(t('Пароль надто простий: потрібно щонайменше 6 символів'));
      } else if (error?.code === 'auth/invalid-email') {
        toast.error(t('Перевірте адресу пошти'));
      } else if (error?.code === 'auth/requires-recent-login') {
        toast.error(t('Щоб привʼязати новий спосіб входу, вийдіть і увійдіть знову'));
      } else {
        console.error('[accounts] пошту не привʼязано', error);
        toast.error(t('Не вдалося додати вхід поштою. Спробуйте ще раз'));
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmMerge = async () => {
    const pending = pendingMerge;
    if (!pending) return;
    setBusy(true);
    try {
      const result = await mergeAccountWithCredential(auth, pending.credential, { language });
      setPendingMerge(null);
      if (result?.status === 'merged' || result?.status === 'already-merged') {
        if (pending.method === 'google') setGoogleLinked(true);
        else setPasswordLinked(true);
        toast.success(t('Акаунти обʼєднано: дані того акаунта перенесено сюди, а вхід у нього відкриває цей.'));
        if (onMerged) await Promise.resolve(onMerged(user.uid)).catch(() => {});
        return;
      }
      toast.error(t('Ці акаунти обʼєднати не можна. Напишіть адміністратору.'));
    } catch (error) {
      if (WRONG_PASSWORD.includes(error?.code)) {
        toast.error(t('Невірний пароль від того акаунта'));
      } else if (error?.details?.reason === 'recent-login' || error?.code === 'auth/user-token-expired') {
        toast.error(t('Увійдіть у той акаунт ще раз і повторіть'));
      } else {
        console.error('[accounts] акаунти не обʼєднано', error);
        toast.error(t('Не вдалося обʼєднати акаунти. Спробуйте ще раз'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="sign-in-methods-card">
      <Title>{t('Способи входу')}</Title>
      <Text>{t('Усі способи входу відкривають один акаунт — цей.')}</Text>

      {pendingMerge ? (
        <MergeBox data-testid="account-merge-confirm">
          <Text>
            {t(pendingMerge.method === 'google'
              ? 'Цей Google уже відкриває інший акаунт KnowMe. Обʼєднати його з цим? Анкета, Flow, реакції й памʼятки того акаунта доллються туди, де тут порожньо, а вхід через Google відкриватиме цей акаунт.'
              : 'Ця пошта вже відкриває інший акаунт KnowMe. Обʼєднати його з цим? Анкета, Flow, реакції й памʼятки того акаунта доллються туди, де тут порожньо, а вхід поштою відкриватиме цей акаунт.')}
          </Text>
          <Actions>
            <Primary type="button" onClick={confirmMerge} disabled={busy}>{t(busy ? 'Зачекайте…' : 'Обʼєднати')}</Primary>
            <Link type="button" onClick={() => setPendingMerge(null)} disabled={busy}>{t('Не обʼєднувати')}</Link>
          </Actions>
        </MergeBox>
      ) : null}

      <Row>
        <FaGoogle aria-hidden="true" />
        <RowLabel>Google</RowLabel>
        {googleLinked ? (
          <Status>{t('Підключено')}</Status>
        ) : (
          <Link type="button" onClick={linkGoogle} disabled={busy} data-testid="link-google">{t('Привʼязати')}</Link>
        )}
      </Row>

      <Row>
        <FaEnvelope aria-hidden="true" />
        <RowLabel>{t('Пошта й пароль')}</RowLabel>
        {passwordLinked ? (
          <Status>{t('Підключено')}</Status>
        ) : (
          <Link type="button" onClick={() => setEmailFormOpen(open => !open)} disabled={busy} data-testid="link-email-toggle">
            {t('Додати')}
          </Link>
        )}
      </Row>
      {!passwordLinked && emailFormOpen ? (
        <form onSubmit={linkEmail} data-testid="link-email-form">
          <Input
            type="email"
            autoComplete="email"
            placeholder={t('Пошта')}
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder={t('Пароль')}
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          <Actions>
            <Primary type="submit" disabled={busy}>{t(busy ? 'Зачекайте…' : 'Додати вхід поштою')}</Primary>
          </Actions>
        </form>
      ) : null}
    </Card>
  );
};

const Card = styled.div`
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: var(--km-radius, 14px);
  background: var(--km-fill, #f1ede8);
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Title = styled.strong`
  font-size: 15px;
`;

const Text = styled.p`
  margin: 0;
  font-size: 13px;
  color: var(--km-muted-text, inherit);
`;

const MergeBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--km-surface, #fff);
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  font-size: 14px;
`;

const RowLabel = styled.span`
  flex: 1;
`;

const Status = styled.span`
  color: var(--km-success-text, #247645);
  font-weight: 600;
  font-size: 13px;
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 10px 12px;
  font-size: 15px;
  border: none;
  border-radius: 10px;
  background: var(--km-surface, #fff);
  color: inherit;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
`;

const Primary = styled.button`
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  background: var(--km-action, #B5530D);
  color: var(--km-on-accent, #fff);
  font-weight: 700;
`;

const Link = styled.button`
  border: none;
  background: none;
  padding: 0;
  color: var(--km-accent-text, #9A470A);
  font-weight: 600;
  cursor: pointer;
`;

export default SignInMethodsCard;
