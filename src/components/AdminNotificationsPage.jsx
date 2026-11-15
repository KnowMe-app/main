import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styled, { css } from 'styled-components';
import toast from 'react-hot-toast';
import { get, limitToLast, orderByChild, query, ref, serverTimestamp, set } from 'firebase/database';
import { FaBell, FaTelegramPlane, FaMobileAlt, FaMoon, FaCheck, FaChartLine } from 'react-icons/fa';
import { auth, database } from './config';
import PageNavMenu from './PageNavMenu';
import BrandLoader from './BrandLoader';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_EVENT_BY_KEY,
  NOTIFICATION_FREQUENCIES,
  NOTIFICATION_GROUPS,
  NOTIFICATION_PRESETS,
  describeActivityDetail,
  describeActivityPerson,
  matchPreset,
  normalizeNotificationSettings,
} from '../utils/adminNotificationCatalog';
import { describeTestOutcomes, fetchAdminNotificationStatus, sendAdminTestNotification, sendAdminWeeklyReport } from '../utils/adminNotifications';
import {
  describePushError,
  disablePushNotifications,
  enablePushNotifications,
  isPushEnabledOnDevice,
  readPushAvailability,
} from './pushNotificationsRemote';

/**
 * «Сповіщення» адміна (`/notifications`): що надсилати, як часто й куди, плюс
 * журнал останніх подій. Події збирає й шле `functions/adminActivity.js`,
 * налаштування лежать у `adminNotificationSettings/{uid}`. Звичайні
 * користувачі сповіщень не отримують.
 *
 * Зберігається одразу на кожну зміну: окремої кнопки «Зберегти», яку легко
 * забути, тут немає. Поки налаштувань у базі немає, сервер не шле нічого —
 * сторінка показує рекомендовані й просить їх увімкнути.
 */

const JOURNAL_LIMIT = 150;
const JOURNAL_SHOWN = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

const formatTime = timestamp => {
  const date = new Date(timestamp);
  const today = new Date();
  const time = date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return time;
  return `${date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })} ${time}`;
};

const AdminNotificationsPage = () => {
  const uid = auth.currentUser?.uid || '';
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('');
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [pushAvailability, setPushAvailability] = useState('off');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [journal, setJournal] = useState(null);
  const [journalError, setJournalError] = useState(false);
  const saveSeqRef = useRef(0);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    get(ref(database, `adminNotificationSettings/${uid}`))
      .then(snapshot => {
        if (cancelled) return;
        const stored = normalizeNotificationSettings(snapshot.val());
        setSettings(stored || DEFAULT_NOTIFICATION_SETTINGS());
        setSaved(Boolean(stored));
      })
      .catch(() => { if (!cancelled) setSettings(DEFAULT_NOTIFICATION_SETTINGS()); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetchAdminNotificationStatus(auth)
      .then(result => { if (!cancelled) setStatus(result); })
      .catch(() => { if (!cancelled) setStatusError(true); });
    readPushAvailability()
      .then(availability => {
        if (cancelled) return;
        setPushAvailability(availability);
        setPushEnabled(isPushEnabledOnDevice(uid));
      })
      .catch(() => {});
    get(query(ref(database, 'adminActivity/events'), orderByChild('t'), limitToLast(JOURNAL_LIMIT)))
      .then(snapshot => {
        if (cancelled) return;
        const rows = [];
        snapshot.forEach(child => { rows.push({ id: child.key, ...child.val() }); });
        setJournal(rows.reverse());
      })
      .catch(() => { if (!cancelled) setJournalError(true); });
    return () => { cancelled = true; };
  }, [uid]);

  const persist = useCallback(async next => {
    setSettings(next);
    const seq = saveSeqRef.current + 1;
    saveSeqRef.current = seq;
    setSaveState('saving');
    try {
      await set(ref(database, `adminNotificationSettings/${uid}`), {
        events: next.events,
        channels: next.channels,
        quietHours: next.quietHours,
        weeklyReport: next.weeklyReport,
        updatedAt: serverTimestamp(),
      });
      if (saveSeqRef.current === seq) { setSaveState('saved'); setSaved(true); }
    } catch (error) {
      console.warn('[admin-notifications] save failed', error);
      if (saveSeqRef.current === seq) setSaveState('error');
      toast.error('Не вдалося зберегти налаштування сповіщень');
    }
  }, [uid]);

  const setFrequency = (key, frequency) => persist({ ...settings, events: { ...settings.events, [key]: frequency } });
  const setChannel = (channel, value) => persist({ ...settings, channels: { ...settings.channels, [channel]: value } });
  // «Вимкнути все» обіцяє лише журнал — тож гасить і тижневий звіт.
  const applyPreset = preset => persist({
    ...settings,
    events: preset.build(),
    ...(preset.key === 'none' ? { weeklyReport: false } : {}),
  });

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disablePushNotifications(uid);
        setPushEnabled(false);
      } else {
        const permission = await enablePushNotifications(uid);
        setPushEnabled(permission === 'granted');
        if (permission === 'denied') setPushAvailability('denied');
        if (permission === 'granted' && !settings.channels.push) await setChannel('push', true);
      }
      fetchAdminNotificationStatus(auth).then(setStatus).catch(() => {});
    } catch (error) {
      console.warn('[admin-notifications] push toggle failed', error);
      toast.error(describePushError(error), { duration: 12000 });
    } finally {
      setPushBusy(false);
    }
  };

  const sendTest = async () => {
    if (testBusy) return;
    setTestBusy(true);
    try {
      const result = await sendAdminTestNotification(auth);
      toast(describeTestOutcomes(result.outcomes).join('\n'), { icon: '🔔', duration: 6000 });
    } catch (error) {
      toast.error('Тест не надіслано — функції ще не розгорнуто або немає звʼязку');
    } finally {
      setTestBusy(false);
    }
  };

  const sendWeekly = async () => {
    if (weeklyBusy) return;
    setWeeklyBusy(true);
    try {
      const result = await sendAdminWeeklyReport(auth);
      toast(describeTestOutcomes(result.outcomes).join('\n'), { icon: '📈', duration: 6000 });
    } catch (error) {
      toast.error('Звіт не надіслано — функції ще не розгорнуто або немає звʼязку');
    } finally {
      setWeeklyBusy(false);
    }
  };

  const activePreset = useMemo(() => (settings ? matchPreset(settings.events) : ''), [settings]);
  const daySummary = useMemo(() => {
    if (!journal) return [];
    const since = Date.now() - DAY_MS;
    const counts = {};
    journal.filter(event => event.t >= since).forEach(event => { counts[event.type] = (counts[event.type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [journal]);
  const enabledCount = settings ? Object.values(settings.events).filter(value => value !== 'off').length : 0;

  if (loading || !settings) {
    return <Page><BrandLoader size="screen" /></Page>;
  }

  const noChannel = !settings.channels.telegram && !settings.channels.push;

  return (
    <Page data-testid="admin-notifications-page">
      <Header>
        <div>
          <Title><FaBell aria-hidden="true" /> Сповіщення</Title>
          <Subtitle>Що роблять користувачі — вам у Telegram чи на телефон. Інші користувачі сповіщень не отримують.</Subtitle>
        </div>
        <PageNavMenu />
      </Header>

      {!saved ? (
        <Banner data-testid="admin-notifications-unsaved">
          <div>
            <b>Сповіщення ще не ввімкнено.</b> Поки налаштування не збережено, сервер нічого не надсилає — лише веде журнал нижче.
          </div>
          <PrimaryButton type="button" onClick={() => persist(settings)}>Увімкнути рекомендовані</PrimaryButton>
        </Banner>
      ) : null}
      {status && status.receivesActivity === false ? (
        <Banner $tone="muted">Цей акаунт — тестовий інспектор: налаштування зберігаються, але сповіщень про реальних людей він не отримує.</Banner>
      ) : null}

      <Section>
        <SectionTitle>Куди надсилати</SectionTitle>
        <ChannelRow>
          <ChannelIcon $color="#229ED9"><FaTelegramPlane /></ChannelIcon>
          <ChannelBody>
            <b>Telegram</b>
            <Muted>
              {statusError ? 'Стан не прочитано — функції ще не розгорнуто?' : null}
              {status?.telegramLinked ? 'Привʼязано — повідомлення надсилає бот KnowMe.' : null}
              {status && !status.telegramLinked ? (
                <>Telegram не привʼязано. Привʼяжіть у <Link to="/my-profile">«Моєму профілі»</Link> → «Вхід через Telegram».</>
              ) : null}
            </Muted>
          </ChannelBody>
          <Switch
            type="button"
            role="switch"
            aria-checked={settings.channels.telegram}
            aria-label="Telegram"
            $on={settings.channels.telegram}
            onClick={() => setChannel('telegram', !settings.channels.telegram)}
          />
        </ChannelRow>
        <ChannelRow>
          <ChannelIcon $color="var(--km-accent)"><FaMobileAlt /></ChannelIcon>
          <ChannelBody>
            <b>Push на телефон чи комп’ютер</b>
            <Muted>
              {status ? `Пристроїв з дозволом: ${status.pushDevices}. ` : ''}
              {pushAvailability === 'off' ? 'Цей браузер push не підтримує (або це не прод-збірка).' : null}
              {pushAvailability === 'ios-install' ? 'На iPhone — лише з KnowMe на початковому екрані: «Поділитися» → «На початковий екран».' : null}
              {pushAvailability === 'denied' && !pushEnabled ? 'Сповіщення заблоковано в налаштуваннях браузера для цього сайту.' : null}
            </Muted>
            {['default', 'granted', 'denied'].includes(pushAvailability) && !(pushAvailability === 'denied' && !pushEnabled) ? (
              <LinkButton type="button" onClick={togglePush} disabled={pushBusy} data-testid="admin-push-toggle">
                {pushEnabled ? 'Вимкнути на цьому пристрої' : 'Увімкнути на цьому пристрої'}
              </LinkButton>
            ) : null}
          </ChannelBody>
          <Switch
            type="button"
            role="switch"
            aria-checked={settings.channels.push}
            aria-label="Push"
            $on={settings.channels.push}
            onClick={() => setChannel('push', !settings.channels.push)}
          />
        </ChannelRow>
        <ChannelRow>
          <ChannelIcon $color="#6B5BD2"><FaMoon /></ChannelIcon>
          <ChannelBody>
            <b>Тихі години 22:00–08:00</b>
            <Muted>Уночі Telegram приходить без звуку, а push не надсилається зовсім.</Muted>
          </ChannelBody>
          <Switch
            type="button"
            role="switch"
            aria-checked={settings.quietHours}
            aria-label="Тихі години"
            $on={settings.quietHours}
            onClick={() => persist({ ...settings, quietHours: !settings.quietHours })}
          />
        </ChannelRow>
        <TestRow>
          <SecondaryButton type="button" onClick={sendTest} disabled={testBusy || noChannel} data-testid="admin-notifications-test">
            {testBusy ? 'Надсилаю…' : 'Надіслати тестове'}
          </SecondaryButton>
          {noChannel ? <Muted>Увімкніть хоча б один канал.</Muted> : null}
        </TestRow>
      </Section>

      <Section>
        <SectionTitle>Тижневий звіт</SectionTitle>
        <ChannelRow>
          <ChannelIcon $color="#2E9B55"><FaChartLine /></ChannelIcon>
          <ChannelBody>
            <b>Щопонеділка після 9:00</b>
            <Muted>
              Підсумок тижня проти попереднього: нові й опубліковані анкети, лайки, контакти, відгуки,
              скільки людей діяли, кому найбільше інтересу й що шукали.
            </Muted>
          </ChannelBody>
          <Switch
            type="button"
            role="switch"
            aria-checked={settings.weeklyReport}
            aria-label="Тижневий звіт"
            $on={settings.weeklyReport}
            onClick={() => persist({ ...settings, weeklyReport: !settings.weeklyReport })}
            data-testid="admin-weekly-toggle"
          />
        </ChannelRow>
        <TestRow>
          <SecondaryButton type="button" onClick={sendWeekly} disabled={weeklyBusy || noChannel} data-testid="admin-weekly-now">
            {weeklyBusy ? 'Надсилаю…' : 'Надіслати звіт за 7 днів зараз'}
          </SecondaryButton>
        </TestRow>
      </Section>

      <Section>
        <SectionTitle>Що надсилати й як часто</SectionTitle>
        <Muted>
          «Одразу» — окремим повідомленням. «Щогодини» й «Раз на день» — одним зведенням
          (щоденне — після 9:00). Увімкнено видів: {enabledCount} з {Object.keys(settings.events).length}.
        </Muted>
        <Presets role="group" aria-label="Готові набори">
          {NOTIFICATION_PRESETS.map(preset => (
            <PresetButton
              key={preset.key}
              type="button"
              $active={activePreset === preset.key}
              onClick={() => applyPreset(preset)}
              title={preset.description}
            >
              {activePreset === preset.key ? <FaCheck aria-hidden="true" /> : null}
              <span>
                <b>{preset.label}</b>
                <small>{preset.description}</small>
              </span>
            </PresetButton>
          ))}
        </Presets>

        {NOTIFICATION_GROUPS.map(group => (
          <Group key={group.key}>
            <GroupTitle>{group.title}</GroupTitle>
            <GroupDescription>{group.description}</GroupDescription>
            {group.events.map(event => (
              <EventRow key={event.key} data-testid={`admin-event-${event.key}`}>
                <EventText>
                  <b><span aria-hidden="true">{event.emoji}</span> {event.label}</b>
                  <small>{event.description}</small>
                </EventText>
                <Segmented role="radiogroup" aria-label={event.label}>
                  {NOTIFICATION_FREQUENCIES.map(freq => {
                    const checked = settings.events[event.key] === freq.key;
                    return (
                      <Segment
                        key={freq.key}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        title={freq.hint + (event.defaultFrequency === freq.key ? ' · рекомендовано' : '')}
                        $active={checked}
                        $recommended={event.defaultFrequency === freq.key}
                        onClick={() => setFrequency(event.key, freq.key)}
                      >
                        {freq.label}
                      </Segment>
                    );
                  })}
                </Segmented>
              </EventRow>
            ))}
          </Group>
        ))}
        <SaveLine aria-live="polite">
          {saveState === 'saving' ? 'Зберігаю…' : null}
          {saveState === 'saved' ? 'Збережено. Зміни діють протягом хвилини.' : null}
          {saveState === 'error' ? 'Не збережено — перевірте звʼязок.' : null}
        </SaveLine>
      </Section>

      <Section>
        <SectionTitle>Останні події</SectionTitle>
        {journalError ? <Muted>Журнал не прочитано.</Muted> : null}
        {!journal && !journalError ? <BrandLoader size="inline" /> : null}
        {journal && daySummary.length ? (
          <Summary aria-label="За останні 24 години">
            {daySummary.map(([type, count]) => (
              <SummaryChip key={type}>
                {NOTIFICATION_EVENT_BY_KEY[type]?.emoji} {NOTIFICATION_EVENT_BY_KEY[type]?.label || type}: <b>{count}</b>
              </SummaryChip>
            ))}
          </Summary>
        ) : null}
        {journal && !journal.length ? (
          <Muted>Подій ще немає. Журнал почне наповнюватись після деплою функцій — кожна дія користувачів лягає сюди, навіть коли сповіщення вимкнено.</Muted>
        ) : null}
        {journal && journal.length ? (
          <Journal>
            {journal.slice(0, JOURNAL_SHOWN).map(event => {
              const def = NOTIFICATION_EVENT_BY_KEY[event.type];
              const who = describeActivityPerson(event.actorInfo) || 'користувач';
              const whom = event.card && event.card !== event.actor ? describeActivityPerson(event.cardInfo) || 'картка' : '';
              const detail = describeActivityDetail(event);
              return (
                <JournalRow key={event.id}>
                  <JournalTime>{formatTime(event.t)}</JournalTime>
                  <JournalBody>
                    <b>{def?.emoji} {def?.label || event.type}</b>
                    <span>
                      {who}{whom ? ` → ${whom}` : ''}{detail ? ` · ${detail}` : ''}
                    </span>
                  </JournalBody>
                  {event.card && event.type !== 'account_deleted' ? (
                    <JournalLink to={`/edit/${encodeURIComponent(event.card)}`}>Відкрити</JournalLink>
                  ) : null}
                </JournalRow>
              );
            })}
          </Journal>
        ) : null}
      </Section>

      <Section $soft>
        <SectionTitle>Як цим користуватись</SectionTitle>
        <Tips>
          <li><b>Почніть з «Рекомендовано».</b> Одразу приходить лише рідкісне й важливе, решта — зведеннями, щоб телефон не дзвонив на кожен лайк.</li>
          <li><b>Дивіться на воронку:</b> нові анкети → опубліковані → лайки → дотики до контактів. Де люди відпадають — там варто покращувати.</li>
          <li><b>Дизлайки й приховування</b> однієї анкети — сигнал написати людині й допомогти з анкетою.</li>
          <li><b>Пошук</b> показує, чого шукають і не знаходять. Номери телефонів у повідомленнях скорочено до 4 цифр.</li>
          <li>Ваші власні дії, дії інспектора й тестових акаунтів сюди не потрапляють.</li>
        </Tips>
      </Section>
    </Page>
  );
};

export default AdminNotificationsPage;

// --- стилі ---------------------------------------------------------------

const Page = styled.main`
  min-height: 100vh;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 16px 16px 96px;
  box-sizing: border-box;

  > * { max-width: 760px; margin-left: auto; margin-right: auto; }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
`;

const Title = styled.h1`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 6px;
  font-size: 24px;
  font-weight: 700;
  font-family: var(--km-font-display, inherit);

  svg { color: var(--km-accent); font-size: 20px; }
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--km-muted);
`;

const Banner = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  justify-content: space-between;
  padding: 14px 16px;
  margin-bottom: 12px;
  border-radius: var(--km-radius);
  font-size: 14px;
  line-height: 1.45;
  ${({ $tone }) => ($tone === 'muted'
    ? css`background: var(--km-fill); color: var(--km-muted);`
    : css`background: var(--km-accent-light); color: var(--km-accent-text);`)}
`;

const Section = styled.section`
  background: ${({ $soft }) => ($soft ? 'var(--km-fill)' : 'var(--km-card)')};
  border: 1px solid ${({ $soft }) => ($soft ? 'transparent' : 'var(--km-border)')};
  border-radius: var(--km-radius-lg, 18px);
  padding: 18px;
  margin-bottom: 14px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 700;
`;

const Muted = styled.p`
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--km-muted);

  a { color: var(--km-accent-text); }
`;

const ChannelRow = styled.div`
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--km-border);

  &:first-of-type { border-top: none; padding-top: 4px; }
`;

const ChannelIcon = styled.span`
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--km-fill);
  color: ${({ $color }) => $color};
  font-size: 17px;
`;

const ChannelBody = styled.div`
  min-width: 0;
  font-size: 15px;
`;

const Switch = styled.button`
  position: relative;
  width: 46px;
  height: 28px;
  border: none;
  border-radius: 99px;
  cursor: pointer;
  background: ${({ $on }) => ($on ? 'var(--km-accent)' : 'var(--km-border)')};
  transition: background 0.15s ease;
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${({ $on }) => ($on ? '21px' : '3px')};
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: left 0.15s ease;
  }

  &:focus-visible { outline: 2px solid var(--km-accent-ring); outline-offset: 2px; }
`;

const buttonBase = css`
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled { opacity: 0.55; cursor: default; }
`;

const PrimaryButton = styled.button`
  ${buttonBase}
  border: none;
  background: var(--km-accent);
  color: var(--km-on-accent, #fff);
`;

const SecondaryButton = styled.button`
  ${buttonBase}
  border: 1.5px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
`;

const LinkButton = styled.button`
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--km-accent-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;

  &:disabled { opacity: 0.55; }
`;

const TestRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--km-border);
`;

const Presets = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  margin: 14px 0 6px;
`;

const PresetButton = styled.button`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  text-align: left;
  border-radius: 12px;
  cursor: pointer;
  border: 1.5px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'transparent')};
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'var(--km-fill)')};
  color: var(--km-text);

  svg { margin-top: 3px; color: var(--km-accent); flex-shrink: 0; }
  span { display: flex; flex-direction: column; gap: 2px; }
  b { font-size: 14px; }
  small { font-size: 12px; color: var(--km-muted); line-height: 1.35; }
`;

const Group = styled.div`
  margin-top: 18px;
`;

const GroupTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 700;
`;

const GroupDescription = styled.p`
  margin: 2px 0 6px;
  font-size: 13px;
  color: var(--km-muted);
`;

const EventRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 12px 0;
  border-top: 1px solid var(--km-border);
`;

const EventText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 240px;
  min-width: 0;

  b { font-size: 14px; font-weight: 600; }
  small { font-size: 12.5px; line-height: 1.4; color: var(--km-muted); }
`;

const Segmented = styled.div`
  display: inline-flex;
  padding: 3px;
  border-radius: 12px;
  background: var(--km-fill);
  flex: 0 0 auto;

  @media (max-width: 480px) {
    display: flex;
    width: 100%;
  }
`;

const Segment = styled.button`
  position: relative;
  flex: 1 1 0;
  min-height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 9px;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  white-space: nowrap;
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--km-card)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--km-text)' : 'var(--km-muted)')};
  box-shadow: ${({ $active }) => ($active ? '0 1px 3px rgba(0, 0, 0, 0.12)' : 'none')};

  /* Рекомендована частота — цяткою акценту, щоб видно було без наведення. */
  ${({ $recommended }) => $recommended && css`
    &::after {
      content: '';
      position: absolute;
      top: 4px;
      right: 4px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--km-accent);
    }
  `}

  &:focus-visible { outline: 2px solid var(--km-accent-ring); outline-offset: 1px; }
`;

const SaveLine = styled.p`
  min-height: 18px;
  margin: 12px 0 0;
  font-size: 12.5px;
  color: var(--km-muted);
`;

const Summary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
`;

const SummaryChip = styled.span`
  padding: 4px 10px;
  border-radius: 99px;
  background: var(--km-fill);
  font-size: 12.5px;

  b { font-weight: 700; }
`;

const Journal = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const JournalRow = styled.li`
  display: grid;
  grid-template-columns: 74px 1fr auto;
  gap: 10px;
  align-items: baseline;
  padding: 9px 0;
  border-top: 1px solid var(--km-border);

  &:first-child { border-top: none; }
`;

const JournalTime = styled.span`
  font-size: 12px;
  color: var(--km-muted);
  font-variant-numeric: tabular-nums;
`;

const JournalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 13.5px;

  span { color: var(--km-muted); overflow-wrap: anywhere; }
`;

const JournalLink = styled(Link)`
  font-size: 12.5px;
  font-weight: 600;
  color: var(--km-accent-text);
  white-space: nowrap;
`;

const Tips = styled.ul`
  margin: 0;
  padding-left: 18px;
  font-size: 13.5px;
  line-height: 1.5;

  li + li { margin-top: 6px; }
`;
