import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { FiCheck, FiCopy, FiExternalLink, FiLink, FiShare2 } from 'react-icons/fi';
import ProfileRow from './ProfileRow';
import { MatchingThemeScope } from './Matching.styled';
import {
  PROFILE_SHARE_ERRORS,
  createProfileShare,
  readOwnProfileShareSlots,
  refreshProfileShare,
  removeExpiredProfileShares,
  revokeProfileShare,
} from './profileShareRemote';
import { useAppSettings } from '../hooks/useAppSettings';
import { getDateTimeFormat } from '../utils/locales';
import { resolveProfileLanguage } from '../utils/profileTexts';
import {
  DEFAULT_PROFILE_SHARE_EXPIRY_DAYS,
  DEFAULT_PROFILE_SHARE_OPTIONS,
  PROFILE_SHARE_EXPIRY_DAYS,
  PROFILE_SHARE_SLOT_COUNT,
  buildProfileShareCard,
  buildProfileShareUrl,
  canShareProfileCard,
  expandProfileShareCard,
  listShareableProfileRoles,
  selectProfileSharePhotos,
} from '../utils/profileShare';
import { uiText } from '../utils/uiTranslations';
import { revealCss } from '../styles/revealAnimation';

/*
 * «Поділитися анкетою» — посилання на знімок анкети для людини без акаунта
 * (`utils/profileShare`, сторінка `SharedProfilePage`).
 *
 * Що видно за посиланням, власниця вирішує тут, групами; контакти вимкнені
 * за замовчуванням, а дати народження в знімку немає зовсім. Посилання живе
 * у своєму слоті (їх п'ять), має строк і відкликається одним дотиком.
 *
 * Знімок оновлюється сам після кожного збереження анкети (`refreshRef`):
 * застаріла анкета за посиланням гірша за жодну. Тим самим налаштуванням, яке
 * обрала власниця, — нове поле в групі, яку вона ввімкнула, туди потрапить,
 * а група, яку вимкнула, — ні.
 *
 * Перелік посилань читається не на відкритті сторінки (там кожне читання
 * пораховане), а коли блок зʼявився на екрані чи анкету вперше збережено.
 */

const Wrap = styled.section`
  margin: 0 var(--page-gutter) 24px;
  padding: 18px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
`;

const Head = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  > b { font-size: 17px; font-weight: 700; color: var(--text); }
  > span { font-size: 13px; line-height: 1.45; color: var(--muted); }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  margin-top: 14px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  background: var(--km-accent);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &:disabled { opacity: 0.55; cursor: default; }
`;

const GhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: var(--km-fill);
  color: ${({ $danger }) => ($danger ? 'var(--km-danger, #c62828)' : 'var(--text)')};
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;

  &:disabled { opacity: 0.55; cursor: default; }
`;

const Hint = styled.p`
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--muted);
`;

const List = styled.ul`
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
`;

const Row = styled.li`
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: var(--bg, var(--km-bg));
  border: 1px solid ${({ $fresh }) => ($fresh ? 'var(--km-accent)' : 'var(--border)')};
`;

const RowMeta = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;

  > b { font-size: 15px; font-weight: 600; color: var(--text); }
  > span { font-size: 13px; color: var(--muted); }
`;

const RowUrl = styled.code`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--muted);
`;

const ConfirmText = styled.span`
  align-self: center;
  font-size: 14px;
  color: var(--text);
`;

const RowActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Composer = styled.div`
  ${revealCss}
  display: grid;
  gap: 16px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
`;

const FieldLabel = styled.div`
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--muted);
`;

// «Одне з кількох» — доріжка з білим вибраним сегментом, як у колекціях
// стрічки й перемикачі анкет у прев'ю.
const Track = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--km-fill);
`;

const Segment = styled.button`
  flex: 1 1 auto;
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: ${({ $active }) => ($active ? 'var(--card, var(--km-card))' : 'transparent')};
  box-shadow: ${({ $active }) => ($active ? '0 1px 2px rgba(28, 27, 26, 0.12)' : 'none')};
  color: ${({ $active }) => ($active ? 'var(--text)' : 'var(--muted)')};
  font: inherit;
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

// Вибраний чіп — суцільна заливка акцентом з білим текстом і галочкою.
const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-fill)')};
  color: ${({ $active }) => ($active ? '#fff' : 'var(--text)')};
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
`;

const PreviewToggle = styled.button`
  justify-self: start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--km-accent-text, var(--km-accent));
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
`;

const PreviewFrame = styled(MatchingThemeScope)`
  max-width: 460px;
  width: 100%;
  margin: 0 auto;
  border-radius: 18px;
`;

const ComposerActions = styled.div`
  display: grid;
  gap: 8px;

  > ${PrimaryButton} { margin-top: 0; }
`;

const GROUP_LABELS = [
  ['location', 'Місто'],
  ['body', 'Параметри й зовнішність'],
  ['family', 'Пологи й сімейний стан'],
  ['about', 'Про себе й робота'],
  ['contacts', 'Контакти'],
];

const PHOTO_LABELS = [['all', 'Усі фото'], ['main', 'Лише головне'], ['none', 'Без фото']];
const SURNAME_LABELS = [['initial', 'Ініціал'], ['full', 'Повністю'], ['none', 'Не показувати']];
const EXPIRY_LABELS = { 7: '7 днів', 30: '30 днів', 90: '90 днів', 0: 'Поки не відкличу' };
const ROLE_LABELS = { ed: 'Анкета донора', sm: 'Анкета сурогатної мами' };

const formatShareDate = (value, language) => getDateTimeFormat(
  resolveProfileLanguage(language),
  { day: 'numeric', month: 'short', year: 'numeric' },
).format(new Date(value));

const REFRESH_DELAY_MS = 2500;
const PREVIEW_PROGRAMS_CONTEXT = Object.freeze({ viewerType: '', facts: null });

const MyProfileShareBlock = ({ uid, getProfile, profile, roles = [], selectedRole = '', language }, ref) => {
  const { themeMode } = useAppSettings();
  const [shares, setShares] = useState(null);
  const [composer, setComposer] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [freshToken, setFreshToken] = useState('');
  const [copiedToken, setCopiedToken] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState('');
  const sharesRef = useRef(null);
  const loadPromiseRef = useRef(null);
  const wrapRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const refreshChainRef = useRef(Promise.resolve());
  const scheduleRefreshRef = useRef(() => {});

  const shareableRoles = useMemo(
    () => listShareableProfileRoles({ role: roles }, selectedRole),
    [roles, selectedRole],
  );

  const applyShares = useCallback(next => {
    sharesRef.current = next;
    setShares(next);
  }, []);

  // Перелік — раз на сторінку, і лише коли він справді потрібен.
  const ensureLoaded = useCallback(() => {
    if (!uid) return Promise.resolve([]);
    if (!loadPromiseRef.current) {
      loadPromiseRef.current = readOwnProfileShareSlots(uid)
        .then(slots => removeExpiredProfileShares({ uid, shares: slots }))
        .then(list => {
          applyShares(list);
          // Анкету могли змінити й поза цією сторінкою (адмін, інший
          // пристрій, фото): прочитаний перелік одразу звіряється з нею.
          if (list.length) scheduleRefreshRef.current();
          return list;
        })
        .catch(error => {
          // Правил під слоти ще не викотили — посилань немає, і створити
          // їх теж не вийде; про це скаже спроба створити.
          console.warn('[profileShare] перелік посилань не прочитано', error);
          loadPromiseRef.current = null;
          applyShares([]);
          return [];
        });
    }
    return loadPromiseRef.current;
  }, [applyShares, uid]);

  useEffect(() => {
    loadPromiseRef.current = null;
    sharesRef.current = null;
    setShares(null);
  }, [uid]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!uid || !node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      ensureLoaded();
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        ensureLoaded();
      }
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ensureLoaded, uid, shareableRoles.length]);

  const runRefresh = useCallback(() => {
    refreshChainRef.current = refreshChainRef.current
      .catch(() => undefined)
      .then(async () => {
        await ensureLoaded();
        // Поточний перелік, а не прочитаний на початку: посилання, створене в
        // цій же вкладці, теж мусить оновлюватись.
        if (!(sharesRef.current || []).length) return;
        const current = getProfile();
        const next = [];
        for (const share of sharesRef.current || []) {
          try {
            const result = await refreshProfileShare({ uid, profile: current, share });
            if (!result.removed) next.push(result.share);
          } catch (error) {
            console.warn('[profileShare] посилання не оновлено', error);
            next.push(share);
          }
        }
        applyShares(next);
      });
    return refreshChainRef.current;
  }, [applyShares, ensureLoaded, getProfile, uid]);

  // «Очистити анкету» й «Очистити дані ролі»: посилання на стерте не живе.
  const revokeShares = useCallback(({ role = '' } = {}) => {
    refreshChainRef.current = refreshChainRef.current
      .catch(() => undefined)
      .then(async () => {
        await ensureLoaded();
        const next = [];
        for (const share of sharesRef.current || []) {
          if (role && share.role !== role) {
            next.push(share);
            continue;
          }
          try {
            await revokeProfileShare({ uid, share });
          } catch (error) {
            console.warn('[profileShare] посилання не відкликано', error);
            next.push(share);
          }
        }
        applyShares(next);
      });
    return refreshChainRef.current;
  }, [applyShares, ensureLoaded, uid]);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(runRefresh, REFRESH_DELAY_MS);
  }, [runRefresh]);

  // «Мій профіль» кличе це після кожного вдалого збереження анкети.
  useImperativeHandle(ref, () => ({
    profileSaved: ({ onlyIfLoaded = false } = {}) => {
      if (onlyIfLoaded && !loadPromiseRef.current) return;
      scheduleRefresh();
    },
    revokeShares,
  }), [revokeShares, scheduleRefresh]);

  useEffect(() => {
    scheduleRefreshRef.current = scheduleRefresh;
  }, [scheduleRefresh]);

  useEffect(() => () => clearTimeout(refreshTimerRef.current), []);

  const previewCard = useMemo(() => {
    if (!composer || !profile) return null;
    return buildProfileShareCard(profile, {
      role: composer.role,
      options: composer.options,
      photos: selectProfileSharePhotos(profile, composer.options),
    });
  }, [composer, profile]);
  const previewUser = useMemo(() => (previewCard ? expandProfileShareCard(previewCard) : null), [previewCard]);

  if (!uid || !shareableRoles.length) return null;

  const slotsFull = (shares?.length || 0) >= PROFILE_SHARE_SLOT_COUNT;
  const nameMissing = !canShareProfileCard(buildProfileShareCard(profile || {}, { role: shareableRoles[0] }));

  const openComposer = () => {
    ensureLoaded();
    setShowPreview(false);
    setComposer({
      role: shareableRoles[0],
      options: { ...DEFAULT_PROFILE_SHARE_OPTIONS },
      expiryDays: DEFAULT_PROFILE_SHARE_EXPIRY_DAYS,
    });
  };

  const setOption = (key, value) => setComposer(previous => ({
    ...previous,
    options: { ...previous.options, [key]: value },
  }));

  const copyUrl = async share => {
    const url = buildProfileShareUrl(share.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(share.token);
      toast.success(uiText('Посилання скопійовано', language), { id: 'profile-share-copied' });
    } catch (error) {
      // Без доступу до буфера посилання лишається видно в рядку — його можна
      // виділити й скопіювати руками.
      toast(url, { id: 'profile-share-copied' });
    }
  };

  const shareUrl = async share => {
    try {
      await navigator.share({ title: `${uiText('Анкета', language)} · KnowMe`, url: buildProfileShareUrl(share.token) });
    } catch (error) {
      if (error?.name !== 'AbortError') copyUrl(share);
    }
  };

  const create = async () => {
    if (!composer || busy) return;
    setBusy(true);
    try {
      const list = await ensureLoaded();
      const result = await createProfileShare({
        uid,
        profile: getProfile(),
        role: composer.role,
        options: composer.options,
        expiryDays: composer.expiryDays,
        slots: list,
      });
      applyShares([result.share, ...(sharesRef.current || [])]);
      setFreshToken(result.share.token);
      setComposer(null);
      toast.success(uiText('Посилання створено', language), { id: 'profile-share-created' });
      if (result.photosSkipped) {
        toast(uiText('Фото не скопіювались ({count}) — посилання створено без них.', language, { count: result.photosSkipped }), { id: 'profile-share-photos' });
      }
    } catch (error) {
      console.warn('[profileShare] посилання не створено', error);
      const message = error?.code === PROFILE_SHARE_ERRORS.rulesMissing
        ? 'Посилання ще не можна створити: на сервері не оновлено правила бази.'
        : error?.code === PROFILE_SHARE_ERRORS.slotsFull
          ? 'Усі {count} посилань зайняті — відкличте одне, щоб створити нове.'
          : error?.code === PROFILE_SHARE_ERRORS.incomplete
            ? 'Щоб поділитися анкетою, вкажіть імʼя.'
            : 'Не вдалося створити посилання';
      toast.error(uiText(message, language, { count: PROFILE_SHARE_SLOT_COUNT }), { id: 'profile-share-error' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async share => {
    setBusy(true);
    try {
      await revokeProfileShare({ uid, share });
      applyShares((sharesRef.current || []).filter(item => item.token !== share.token));
      toast.success(uiText('Посилання відкликано', language), { id: 'profile-share-revoked' });
    } catch (error) {
      console.warn('[profileShare] посилання не відкликано', error);
      toast.error(uiText('Не вдалося відкликати посилання', language), { id: 'profile-share-error' });
    } finally {
      setBusy(false);
      setConfirmRevoke('');
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Wrap ref={wrapRef} data-testid="share-card">
      <Head>
        <b>{uiText('Поділитися анкетою', language)}</b>
        <span>
          {uiText('Посилання для людини без акаунта в KnowMe: вона побачить анкету так само, як у стрічці, своєю мовою. Що в ній видно, вирішуєте ви, а відкликати посилання можна будь-коли.', language)}
        </span>
      </Head>

      {shares?.length ? (
        <List>
          {shares.map(share => {
            const url = buildProfileShareUrl(share.token);
            const contactsNote = share.options.contacts ? 'з контактами' : 'без контактів';
            return (
              <Row key={share.token} $fresh={share.token === freshToken} data-testid="share-row">
                <RowMeta>
                  <b>{uiText(ROLE_LABELS[share.role] || 'Анкета', language)} · {uiText(contactsNote, language)}</b>
                  <span>
                    {uiText('Створено {date}', language, { date: formatShareDate(share.createdAt, language) })}
                    {' · '}
                    {share.expiresAt
                      ? uiText('діє до {date}', language, { date: formatShareDate(share.expiresAt, language) })
                      : uiText('без строку', language)}
                  </span>
                  <RowUrl title={url}>{url}</RowUrl>
                </RowMeta>
                {confirmRevoke === share.token ? (
                  <RowActions>
                    <ConfirmText>{uiText('Відкликати посилання?', language)}</ConfirmText>
                    <GhostButton type="button" $danger disabled={busy} onClick={() => revoke(share)}>
                      {uiText('Так, відкликати', language)}
                    </GhostButton>
                    <GhostButton type="button" disabled={busy} onClick={() => setConfirmRevoke('')}>
                      {uiText('Ні', language)}
                    </GhostButton>
                  </RowActions>
                ) : (
                  <RowActions>
                    <GhostButton type="button" onClick={() => copyUrl(share)}>
                      {copiedToken === share.token ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                      {uiText(copiedToken === share.token ? 'Скопійовано' : 'Скопіювати', language)}
                    </GhostButton>
                    {canNativeShare ? (
                      <GhostButton type="button" onClick={() => shareUrl(share)}>
                        <FiShare2 aria-hidden="true" />
                        {uiText('Поділитися', language)}
                      </GhostButton>
                    ) : null}
                    <GhostButton as="a" href={url} target="_blank" rel="noopener noreferrer">
                      <FiExternalLink aria-hidden="true" />
                      {uiText('Відкрити', language)}
                    </GhostButton>
                    <GhostButton type="button" $danger onClick={() => setConfirmRevoke(share.token)}>
                      {uiText('Відкликати', language)}
                    </GhostButton>
                  </RowActions>
                )}
              </Row>
            );
          })}
        </List>
      ) : null}

      {composer ? (
        <Composer data-testid="share-composer">
          {shareableRoles.length > 1 ? (
            <div>
              <FieldLabel>{uiText('Яку анкету', language)}</FieldLabel>
              <Track role="radiogroup">
                {shareableRoles.map(role => (
                  <Segment key={role} type="button" role="radio" aria-checked={composer.role === role} $active={composer.role === role} onClick={() => setComposer(previous => ({ ...previous, role }))}>
                    {uiText(ROLE_LABELS[role], language)}
                  </Segment>
                ))}
              </Track>
            </div>
          ) : null}

          <div>
            <FieldLabel>{uiText('Фото', language)}</FieldLabel>
            <Track role="radiogroup">
              {PHOTO_LABELS.map(([value, label]) => (
                <Segment key={value} type="button" role="radio" aria-checked={composer.options.photos === value} $active={composer.options.photos === value} onClick={() => setOption('photos', value)}>
                  {uiText(label, language)}
                </Segment>
              ))}
            </Track>
          </div>

          <div>
            <FieldLabel>{uiText('Прізвище', language)}</FieldLabel>
            <Track role="radiogroup">
              {SURNAME_LABELS.map(([value, label]) => (
                <Segment key={value} type="button" role="radio" aria-checked={composer.options.surname === value} $active={composer.options.surname === value} onClick={() => setOption('surname', value)}>
                  {uiText(label, language)}
                </Segment>
              ))}
            </Track>
          </div>

          <div>
            <FieldLabel>{uiText('Що показати', language)}</FieldLabel>
            <Chips>
              {GROUP_LABELS.map(([key, label]) => (
                <Chip
                  key={key}
                  type="button"
                  aria-pressed={composer.options[key]}
                  $active={composer.options[key]}
                  data-testid={`share-group-${key}`}
                  onClick={() => setOption(key, !composer.options[key])}
                >
                  {composer.options[key] ? <FiCheck aria-hidden="true" /> : null}
                  {uiText(label, language)}
                </Chip>
              ))}
            </Chips>
            <Hint>
              {uiText('Імʼя, вік і роль видно завжди. Дати народження в посиланні немає — лише вік.', language)}
              {composer.options.contacts ? ` ${uiText('Телефон і месенджери побачить кожен, кому перешлють посилання.', language)}` : ''}
            </Hint>
          </div>

          <div>
            <FieldLabel>{uiText('Строк дії', language)}</FieldLabel>
            <Track role="radiogroup">
              {PROFILE_SHARE_EXPIRY_DAYS.map(days => (
                <Segment key={days} type="button" role="radio" aria-checked={composer.expiryDays === days} $active={composer.expiryDays === days} onClick={() => setComposer(previous => ({ ...previous, expiryDays: days }))}>
                  {uiText(EXPIRY_LABELS[days], language)}
                </Segment>
              ))}
            </Track>
          </div>

          <PreviewToggle type="button" aria-expanded={showPreview} onClick={() => setShowPreview(previous => !previous)}>
            {uiText(showPreview ? 'Сховати перегляд' : 'Як побачать за посиланням', language)}
          </PreviewToggle>
          {showPreview && previewUser ? (
            <PreviewFrame $themeMode={themeMode} data-testid="share-preview">
              <ProfileRow
                user={previewUser}
                programsContext={PREVIEW_PROGRAMS_CONTEXT}
                preview
                canViewContacts={false}
                expanded={previewExpanded}
                onToggleExpand={() => setPreviewExpanded(previous => !previous)}
              />
            </PreviewFrame>
          ) : null}

          <ComposerActions>
            <Hint style={{ margin: 0 }}>
              {uiText('Посилання показує анкету такою, як зараз, і оновлюється разом з нею.', language)}
            </Hint>
            <PrimaryButton type="button" disabled={busy || slotsFull} onClick={create} data-testid="share-create">
              <FiLink aria-hidden="true" />
              {uiText(busy ? 'Створюємо…' : 'Створити посилання', language)}
            </PrimaryButton>
            <GhostButton type="button" disabled={busy} onClick={() => setComposer(null)}>
              {uiText('Відмінити', language)}
            </GhostButton>
          </ComposerActions>
        </Composer>
      ) : (
        <>
          <PrimaryButton
            type="button"
            disabled={nameMissing || slotsFull}
            onClick={openComposer}
            data-testid="share-open"
          >
            <FiLink aria-hidden="true" />
            {uiText(shares?.length ? 'Нове посилання' : 'Створити посилання', language)}
          </PrimaryButton>
          {nameMissing ? <Hint>{uiText('Щоб поділитися анкетою, вкажіть імʼя.', language)}</Hint> : null}
          {slotsFull ? <Hint>{uiText('Усі {count} посилань зайняті — відкличте одне, щоб створити нове.', language, { count: PROFILE_SHARE_SLOT_COUNT })}</Hint> : null}
        </>
      )}
    </Wrap>
  );
};

export const MyProfileShare = React.forwardRef(MyProfileShareBlock);

export default MyProfileShare;
