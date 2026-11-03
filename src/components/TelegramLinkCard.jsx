import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { FaTelegramPlane } from 'react-icons/fa';
import { uiText } from 'utils/uiTranslations';
import {
  buildTelegramLoginLink,
  callTelegramLink,
  clearTelegramLinkAttempt,
  createTelegramLoginNonce,
  isTelegramLoginAvailable,
  readTelegramLinkAttempt,
  saveTelegramLinkAttempt,
} from 'utils/telegramAuth';

/**
 * «Вхід через Telegram» у «Моєму профілі» — привʼязка Telegram до акаунта з
 * поштою. Показується лише акаунту з паролем: акаунт, заведений ботом, уже
 * привʼязаний. Спроба лежить у `localStorage`, бо кнопка бота «Повернутися в
 * KnowMe» відкриває сторінку новою вкладкою.
 */
const TelegramLinkCard = ({ auth, language }) => {
  const user = auth?.currentUser || null;
  const uid = user?.uid || '';
  const hasPassword = Boolean(user?.providerData?.some(provider => provider?.providerId === 'password'));
  const [attempt, setAttempt] = useState(() => (uid ? readTelegramLinkAttempt(uid) : null));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState(false);
  const t = (text, vars) => uiText(text, language, vars);

  useEffect(() => {
    if (uid) setAttempt(readTelegramLinkAttempt(uid));
  }, [uid]);

  if (!uid || !hasPassword || !isTelegramLoginAvailable()) return null;

  const reset = () => {
    clearTelegramLinkAttempt();
    setAttempt(null);
    setCode('');
  };

  const submit = async (event, typed = code) => {
    event?.preventDefault?.();
    const digits = String(typed).replace(/\D/g, '');
    if (!attempt) return;
    if (digits.length !== 6) {
      toast.error(t('Введіть шість цифр коду з Telegram'));
      return;
    }
    setBusy(true);
    try {
      const result = await callTelegramLink(auth.app, attempt.nonce, digits);
      if (result?.status === 'linked') {
        reset();
        setLinked(true);
        toast.success(t('Telegram привʼязано. Тепер «Увійти через Telegram» відкриває цей акаунт.'));
        return;
      }
      if (result?.status === 'wrong-code') {
        setCode('');
        toast.error(t('Невірний код. Залишилось спроб: {count}', { count: result.attemptsLeft }));
        return;
      }
      if (result?.status === 'pending') {
        toast.error(t('Спершу поділіться номером у боті, потім введіть код'));
        return;
      }
      reset();
      toast.error(t('Час на привʼязку минув. Спробуйте ще раз'));
    } catch (error) {
      console.error('[telegram] привʼязку не завершено', error);
      toast.error(t('Не вдалося привʼязати Telegram. Спробуйте ще раз'));
    } finally {
      setBusy(false);
    }
  };

  const change = value => {
    const cleaned = String(value).replace(/[^\d ]/g, '');
    setCode(cleaned);
    if (cleaned.replace(/\D/g, '').length === 6 && !busy) submit(null, cleaned);
  };

  const paste = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.error(t('Не вдалося прочитати буфер обміну. Введіть код вручну'));
      return;
    }
    const match = /(?:^|\D)(\d{3}\s?\d{3})(?!\d)/.exec(String(text || ''));
    if (!match) {
      toast.error(t('У буфері немає коду. Торкніться коду в Telegram, щоб скопіювати його'));
      return;
    }
    change(match[1].replace(/\D/g, ''));
  };

  return (
    <Card data-testid="telegram-link-card">
      <Title><FaTelegramPlane aria-hidden="true" /> {t('Вхід через Telegram')}</Title>
      {linked ? (
        <Text>{t('Telegram привʼязано. Тепер «Увійти через Telegram» відкриває цей акаунт.')}</Text>
      ) : attempt ? (
        <form onSubmit={submit}>
          <Text>{t('Відкрийте бота, поділіться номером і введіть код, який він надішле.')}</Text>
          <CodeInput
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={event => change(event.target.value)}
            aria-label={t('Код із Telegram')}
            data-testid="telegram-link-code"
          />
          <Actions>
            <Primary type="submit" disabled={busy}>{t(busy ? 'Зачекайте…' : 'Підтвердити')}</Primary>
            {typeof navigator !== 'undefined' && navigator.clipboard?.readText ? (
              <Link type="button" onClick={paste} disabled={busy}>{t('Вставити код')}</Link>
            ) : null}
            <Link as="a" href={buildTelegramLoginLink(attempt.nonce)} target="_blank" rel="noopener noreferrer">
              {t('Відкрити Telegram ще раз')}
            </Link>
            <Link type="button" onClick={reset}>{t('Скасувати привʼязку')}</Link>
          </Actions>
        </form>
      ) : (
        <>
          <Text>{t('Привʼяжіть Telegram, і «Увійти через Telegram» відкриватиме цей акаунт. Пошта лишається.')}</Text>
          <TelegramStart
            data-testid="telegram-link-start"
            onClick={event => {
              // Посилання з новим nonce: його ще немає в href до дотику, тож
              // перехід робимо самі, синхронно в обробнику дотику.
              event.preventDefault();
              const nonce = createTelegramLoginNonce();
              const next = { nonce, uid, startedAt: Date.now() };
              saveTelegramLinkAttempt(next);
              setAttempt(next);
              setLinked(false);
              callTelegramLink(auth.app, nonce)
                .catch(error => console.warn('[telegram] привʼязку не розпочато', error?.code || error))
                .finally(() => { window.location.href = buildTelegramLoginLink(nonce); });
            }}
            href="#telegram-link"
          >
            <FaTelegramPlane aria-hidden="true" /> {t('Привʼязати Telegram')}
          </TelegramStart>
        </>
      )}
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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
`;

const Text = styled.p`
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--km-muted-text, inherit);
`;

const CodeInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  font-size: 22px;
  letter-spacing: 0.3em;
  text-align: center;
  border: 1px solid var(--km-border, #ccc);
  border-radius: 10px;
  background: var(--km-surface, #fff);
  color: inherit;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-top: 10px;
`;

const Primary = styled.button`
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  background: var(--km-accent, #c9600f);
  color: var(--km-on-accent, #fff);
  font-weight: 700;
`;

const Link = styled.button`
  border: none;
  background: none;
  padding: 0;
  color: var(--km-accent, #c9600f);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
`;

const TelegramStart = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 10px;
  background: #2481cc;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
`;

export default TelegramLinkCard;
