// Сповіщення адміна: акаунти, які людина видалила сама, і база ще не
// очищена.
//
// Видалення йде двома кроками (`utils/accountDeletion`). Людина видаляє лише
// свій акаунт входу й ховає анкету (`feedDate: false`) — і на цьому все, що
// від неї треба. Сама картка, індекси, чужі реакції й позначки, фото й
// чернетки лишаються, доки їх не прибере адмін: очищення пише в дані
// багатьох людей, тож іде не мовчки з дотику користувача, а під наглядом.
//
// Тому сповіщення горить, поки черга не порожня, і гасне лише після
// **чистого** прогону: функція знімає запис з черги тільки тоді, коли жоден
// крок не впав, а збій лишає запис з переліком кроків — повтор безпечний.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import styled from 'styled-components';

import { getRoleLabel } from './profileLayoutConfig';
import { auth } from './config';
import { removeCard } from 'utils/cardIndex';
import {
  listPendingAccountDeletions,
  purgeDeletedAccount,
  summarizePurgeCounts,
} from 'utils/accountDeletion';
import { ToolButton, ToolCount } from './AddNewProfileAdminPanel.styled';

const Banner = styled.section`
  margin: 0 0 12px;
  border: 1px solid var(--km-danger-border, #e7b4b4);
  border-radius: var(--km-radius, 12px);
  background: var(--km-danger-bg, #fdf1f1);
  color: var(--km-text);
  overflow: hidden;
`;

const BannerHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 700;
  color: var(--km-danger, #b3261e);
`;

const BannerNote = styled.p`
  margin: 0;
  padding: 0 12px 10px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--km-muted-text, #62665f);
`;

const Item = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 12px;
  border-top: 1px solid var(--km-danger-border, #e7b4b4);
  background: var(--km-card, #fff);
`;

const ItemText = styled.div`
  flex: 1 1 220px;
  min-width: 0;
`;

const ItemName = styled.div`
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
`;

const ItemMeta = styled.div`
  margin-top: 2px;
  font-size: 12px;
  color: var(--km-muted-text, #62665f);
  overflow-wrap: anywhere;
`;

const ItemWarning = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: var(--km-danger, #b3261e);
`;

const Uid = styled.code`
  font-size: 11px;
`;

const QuietLine = styled.p`
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--km-muted-text, #62665f);
`;

// Друге натискання мусить прийти невдовзі після першого: «Підтвердити»,
// що висить на екрані годину, — це вже не підтвердження.
const CONFIRM_WINDOW_MS = 6000;

// Назви кроків очищення (`functions/accountDeletion.js`) — словами, бо звіт
// читає адмін, а не розробник.
const PURGE_STEP_LABELS = Object.freeze({
  auth: 'акаунт входу',
  drafts: 'чернетки',
  searchId: 'пошуковий індекс',
  searchKey: 'індекс фільтрів',
  searchKeySets: 'зрізи доступу',
  identityClaims: 'заявки на унікальність',
  favorites: 'чужі вподобання',
  dislikes: 'чужі «не цікаво»',
  getInTouch: 'дати дзвінка',
  writer: 'позначки автора',
  comments: 'памʼятки',
  contactViews: 'лічильники контактів',
  stimulation: 'стимуляція',
  stimulationSchedule: 'графіки стимуляції',
  stimulationShortcuts: 'ярлики стимуляції',
  flow: 'Flow',
  likedAudience: '«лише для вподобаних»',
  edits: 'доповнення',
  editsByEditor: 'переліки доповнень',
  editsHistory: 'журнал правок',
  publicComments: 'публічні відгуки',
  sharedAccess: 'спільний доступ',
  telegram: 'привʼязка Telegram',
  profileShares: 'посилання на анкету',
  nodes: 'вузли анкети',
  storage: 'фото',
  legacyDocs: 'копії в Firestore',
  queue: 'запис у черзі',
});

export const describePurgeSteps = steps => (steps || [])
  .map(step => PURGE_STEP_LABELS[step] || step)
  .join(', ');

const formatDate = timestamp => {
  if (!timestamp) return '';
  try {
    return new Date(Number(timestamp)).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
  } catch (error) {
    return '';
  }
};

const describeRoles = role => String(role || '')
  .split(',')
  .map(code => code.trim())
  .filter(Boolean)
  .map(code => getRoleLabel(code, 'uk') || code)
  .join(', ');

export const AccountDeletionQueue = () => {
  const [items, setItems] = useState([]);
  const [canPurge, setCanPurge] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busyUid, setBusyUid] = useState('');
  const [confirmUid, setConfirmUid] = useState('');
  const confirmTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const result = await listPendingAccountDeletions({ auth });
    if (!mountedRef.current) return;
    setItems(result.items);
    setCanPurge(result.canPurge);
    setLoadError(result.error);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    // Повернення на вкладку перечитує чергу: людина могла видалити акаунт,
    // поки адмінка стояла відкритою, а сповіщення мусить про це сказати.
    const onFocus = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('focus', onFocus);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', onFocus);
      clearTimeout(confirmTimerRef.current);
    };
  }, [load]);

  const handlePurge = async uid => {
    if (busyUid) return;
    if (confirmUid !== uid) {
      setConfirmUid(uid);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmUid(''), CONFIRM_WINDOW_MS);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmUid('');
    setBusyUid(uid);
    const result = await purgeDeletedAccount({ auth, uid });
    if (!mountedRef.current) return;
    setBusyUid('');
    if (result.error) {
      toast.error(`Не вдалося запустити очищення (${result.error}). Функцію purgeDeletedAccount розгорнуто?`);
      return;
    }
    removeCard(uid);
    if (result.complete) {
      toast.success(`Базу очищено: знято ${summarizePurgeCounts(result.counts)} записів.`);
      setItems(prev => prev.filter(item => item.uid !== uid));
    } else {
      toast.error(`Очищено частково — не вдалося: ${describePurgeSteps(result.failed)}. Запис лишився в черзі, повторіть.`);
    }
    load();
  };

  if (loadError) {
    return (
      <QuietLine data-testid="account-deletions-error">
        Не вдалося перевірити видалені акаунти ({loadError}).{' '}
        <ToolButton type="button" onClick={load}>Повторити</ToolButton>
      </QuietLine>
    );
  }
  if (!items.length) return null;

  return (
    <Banner data-testid="account-deletions" role="status">
      <BannerHead>
        Видалені акаунти чекають очищення бази
        <ToolCount>{items.length}</ToolCount>
      </BannerHead>
      <BannerNote>
        Людина видалила свій акаунт: вхід уже неможливий, анкету знято зі стрічки. Лишилось
        прибрати саму картку й усі її звʼязки — реакції й позначки інших, індекси пошуку,
        відгуки, доповнення, фото й чернетки.
        {!canPurge && ' Очищення запускає повний адмін.'}
      </BannerNote>
      {items.map(item => {
        const busy = busyUid === item.uid;
        const confirming = confirmUid === item.uid;
        const roles = describeRoles(item.role);
        return (
          <Item key={item.uid} data-testid="account-deletion-item">
            <ItemText>
              <ItemName>{item.name || (item.hasCard ? 'Без імені' : 'Картки вже немає')}</ItemName>
              <ItemMeta>
                {[roles, item.requestedAt ? `видалено ${formatDate(item.requestedAt)}` : ''].filter(Boolean).join(' · ')}
                {' · '}
                <Uid>{item.uid}</Uid>
              </ItemMeta>
              {!item.authDeletedAt && (
                <ItemWarning>Акаунт входу ще не видалено — очищення видалить і його.</ItemWarning>
              )}
              {item.lastPurge?.failed?.length > 0 && (
                <ItemWarning>
                  Попереднє очищення ({formatDate(item.lastPurge.at)}) не вдалося: {describePurgeSteps(item.lastPurge.failed)}.
                </ItemWarning>
              )}
            </ItemText>
            {canPurge && (
              <ToolButton
                type="button"
                $tone="danger"
                disabled={Boolean(busyUid)}
                onClick={() => handlePurge(item.uid)}
                data-testid="account-deletion-purge"
              >
                {busy ? 'Очищаємо…' : confirming ? 'Точно очистити? Натисніть ще раз' : 'Очистити базу'}
              </ToolButton>
            )}
          </Item>
        );
      })}
    </Banner>
  );
};

export default AccountDeletionQueue;
