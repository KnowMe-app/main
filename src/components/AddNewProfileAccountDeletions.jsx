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
//
// Очищення — два етапи, і другий без першого недоступний: спершу **аналіз**
// (той самий прохід сервера без жодного запису), і адмін очима бачить, з яких
// колекцій і які саме шляхи буде знято, скільки фото, чи лишився акаунт
// входу; лише тоді кнопка «Видалити» стає доступною. Видалення рахує все
// заново на сервері — між аналізом і дотиком база могла змінитись, тож план
// — це те, що побачив адмін, а не обіцянка, яку сервер виконує дослівно.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import styled from 'styled-components';

import { getRoleLabel } from './profileLayoutConfig';
import { auth } from './config';
import { removeCard } from 'utils/cardIndex';
import {
  analyzeDeletedAccount,
  groupPurgePlan,
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

const PlanBox = styled.div`
  flex: 1 1 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--km-fill, #f4f2ee);
  font-size: 13px;
`;

const PlanTitle = styled.div`
  font-weight: 700;
  margin-bottom: 6px;
`;

const PlanLine = styled.div`
  margin: 2px 0;
  overflow-wrap: anywhere;
`;

const PlanGroup = styled.details`
  margin: 4px 0;
  border-top: 1px solid var(--km-border, #e8e5e0);
  padding-top: 4px;

  summary {
    cursor: pointer;
    overflow-wrap: anywhere;
  }
`;

const PlanPaths = styled.ul`
  margin: 4px 0 0;
  padding-left: 18px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const KeptNote = styled.span`
  font-family: var(--km-font, inherit);
  color: var(--km-muted-text, #62665f);
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

// Колекції бази словами — поруч із сирим шляхом, який адмін упізнає в консолі.
const COLLECTION_LABELS = Object.freeze({
  matchingCards: 'картка стрічки',
  profileDetails: 'анкета',
  profileContacts: 'контакти',
  profileWorkflow: 'робочі поля',
  profileTechnical: 'службові поля',
  searchId: 'пошуковий індекс',
  searchKey: 'індекс фільтрів',
  searchKeySets: 'зрізи доступу',
  comments: 'публічні відгуки',
  replies: 'відповіді на відгуки',
  profileShares: 'посилання на анкету',
  telegramAccounts: 'привʼязка Telegram',
  users: 'legacy-копія анкети',
  usersIndex: 'legacy-індекс',
  emailVerificationSends: 'ліміти листів',
  'multiData/favorites': 'вподобання',
  'multiData/dislikes': '«не цікаво»',
  'multiData/getInTouch': 'дати дзвінка',
  'multiData/writer': 'позначки автора',
  'multiData/comments': 'памʼятки',
  'multiData/contactViews': 'лічильники контактів',
  'multiData/stimulation': 'стимуляція',
  'multiData/stimulationSchedule': 'графіки стимуляції',
  'multiData/stimulationShortcuts': 'ярлики стимуляції',
  'multiData/flow': 'Flow',
  'multiData/likedAudience': '«лише для вподобаних»',
  'multiData/searchQueries': 'історія пошуку',
  'multiData/programs': 'програми',
  'multiData/profileShareSlots': 'слоти посилань',
  'multiData/profileMutations': 'чернетки',
  'multiData/profileMutationOwners': 'автори чернеток',
  'multiData/profileMutationHistory': 'журнал чернеток',
  'multiData/profileIdentityClaims': 'заявки на унікальність',
  'multiData/edits': 'доповнення',
  'multiData/editsByEditor': 'переліки доповнень',
  'multiData/editsHistory': 'журнал правок',
});

const formatKept = value => {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
};

const pluralFiles = count => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} файлів`;
  if (last === 1) return `${count} файл`;
  if (last >= 2 && last <= 4) return `${count} файли`;
  return `${count} файлів`;
};

export const PurgePlanView = ({ plan, failed }) => {
  const { collections, truncated, total } = groupPurgePlan(plan);
  const storage = Array.isArray(plan?.storage) ? plan.storage : [];
  const legacyDocs = Array.isArray(plan?.legacyDocs) ? plan.legacyDocs : [];
  const nothing = !total && !storage.length && !legacyDocs.length && !plan?.authExists;
  return (
    <PlanBox data-testid="account-deletion-plan">
      <PlanTitle>
        Аналіз: буде видалено {total} записів бази
        {storage.length > 0 && ` і фото в ${storage.length} теках`}
      </PlanTitle>
      <PlanLine>
        Акаунт входу: {plan?.authExists ? 'ще існує — буде видалено' : 'уже видалено'}
      </PlanLine>
      {nothing && <PlanLine>Даних про цей акаунт у базі вже немає — лишилось зняти запис із черги.</PlanLine>}
      {collections.map(group => (
        <PlanGroup key={group.collection} data-testid="account-deletion-plan-collection">
          <summary>
            <b>{group.collection}</b>
            {COLLECTION_LABELS[group.collection] ? ` — ${COLLECTION_LABELS[group.collection]}` : ''}
            {' · '}{group.count}
          </summary>
          <PlanPaths>
            {group.items.map(item => (
              <li key={item.path}>
                {item.path}
                {item.kept !== undefined && (
                  <KeptNote> — лишиться: {formatKept(item.kept)}</KeptNote>
                )}
              </li>
            ))}
          </PlanPaths>
        </PlanGroup>
      ))}
      {truncated.map(entry => (
        <PlanLine key={entry.step}>
          {describePurgeSteps([entry.step])}: показано {entry.shown} з {entry.count} шляхів.
        </PlanLine>
      ))}
      {storage.map(entry => (
        <PlanLine key={entry.prefix}>
          Storage <code>{entry.prefix}</code> — {entry.files == null ? 'кількість файлів невідома' : pluralFiles(entry.files)}
        </PlanLine>
      ))}
      {legacyDocs.map(path => (
        <PlanLine key={path}>Firestore <code>{path}</code></PlanLine>
      ))}
      {failed?.length > 0 && (
        <ItemWarning>
          Не вдалося проаналізувати: {describePurgeSteps(failed)}. Видалення ці кроки спробує знову.
        </ItemWarning>
      )}
    </PlanBox>
  );
};

export const AccountDeletionQueue = () => {
  const [items, setItems] = useState([]);
  const [canPurge, setCanPurge] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busyUid, setBusyUid] = useState('');
  const [busyKind, setBusyKind] = useState('');
  const [confirmUid, setConfirmUid] = useState('');
  // Плани аналізу за uid: кнопка «Видалити» зʼявляється лише під планом.
  const [plans, setPlans] = useState({});
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

  const handleAnalyze = async uid => {
    if (busyUid) return;
    setBusyUid(uid);
    setBusyKind('analyze');
    const result = await analyzeDeletedAccount({ auth, uid });
    if (!mountedRef.current) return;
    setBusyUid('');
    setBusyKind('');
    if (result.error || !result.plan) {
      toast.error(`Не вдалося проаналізувати (${result.error || 'немає плану'}). Функцію purgeDeletedAccount розгорнуто?`);
      return;
    }
    setPlans(prev => ({ ...prev, [uid]: { plan: result.plan, failed: result.failed } }));
  };

  const handlePurge = async uid => {
    if (busyUid || !plans[uid]) return;
    if (confirmUid !== uid) {
      setConfirmUid(uid);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmUid(''), CONFIRM_WINDOW_MS);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmUid('');
    setBusyUid(uid);
    setBusyKind('purge');
    const result = await purgeDeletedAccount({ auth, uid });
    if (!mountedRef.current) return;
    setBusyUid('');
    setBusyKind('');
    if (result.error) {
      toast.error(`Не вдалося запустити очищення (${result.error}). Функцію purgeDeletedAccount розгорнуто?`);
      return;
    }
    removeCard(uid);
    // Після видалення план застарів у будь-якому разі: повтор після збою
    // мусить знову пройти через аналіз.
    setPlans(prev => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
    if (result.complete) {
      toast.success(`Базу очищено: знято ${summarizePurgeCounts(result.counts)} записів.`);
      setItems(prev => prev.filter(item => item.uid !== uid));
    } else {
      toast.error(`Очищено частково — не вдалося: ${describePurgeSteps(result.failed)}. Запис лишився в черзі, проаналізуйте й повторіть.`);
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
        прибрати саму картку й усі її звʼязки. Спершу «Проаналізувати» — побачите, з яких
        колекцій і що саме буде видалено; лише тоді стане доступне видалення.
        {!canPurge && ' Видалення запускає повний адмін.'}
      </BannerNote>
      {items.map(item => {
        const busy = busyUid === item.uid;
        const confirming = confirmUid === item.uid;
        const roles = describeRoles(item.role);
        const analysis = plans[item.uid];
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
            <Actions>
              <ToolButton
                type="button"
                disabled={Boolean(busyUid)}
                onClick={() => handleAnalyze(item.uid)}
                data-testid="account-deletion-analyze"
              >
                {busy && busyKind === 'analyze' ? 'Аналізуємо…' : analysis ? 'Проаналізувати знову' : 'Проаналізувати'}
              </ToolButton>
              {canPurge && analysis && (
                <ToolButton
                  type="button"
                  $tone="danger"
                  disabled={Boolean(busyUid)}
                  onClick={() => handlePurge(item.uid)}
                  data-testid="account-deletion-purge"
                >
                  {busy && busyKind === 'purge' ? 'Видаляємо…' : confirming ? 'Точно видалити? Натисніть ще раз' : 'Видалити все це'}
                </ToolButton>
              )}
            </Actions>
            {analysis && <PurgePlanView plan={analysis.plan} failed={analysis.failed} />}
          </Item>
        );
      })}
    </Banner>
  );
};

export default AccountDeletionQueue;
