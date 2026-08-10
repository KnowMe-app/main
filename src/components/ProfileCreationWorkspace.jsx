import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { FiArrowRight, FiChevronDown, FiFolder, FiInfo, FiPlus, FiSearch } from 'react-icons/fi';

import { auth, fetchUserById, searchUsersOnly } from './config';
import { ProfileForm } from './ProfileForm';
import { pickerFields } from './formFields';
import SearchBar, { detectSearchParams } from './SearchBar';
import { resolveAccess } from 'utils/accessLevel';
import { getSearchIdIndexedFields } from 'utils/searchKeyUtils';
import {
  acceptCreateProfileMutation,
  getEffectiveProfile,
  loadAllCreateProfileMutations,
  loadOwnProfileMutations,
  rejectCreateProfileMutation,
  reserveProfileCardId,
  saveCreateProfileMutation,
} from 'utils/profileMutations';

const Page = styled.main`
  min-height: 100vh;
  padding: 32px 20px max(80px, env(safe-area-inset-bottom));
  background: var(--km-bg);
  color: var(--km-text);
  font-family: var(--km-font);
  box-sizing: border-box;
`;
const Shell = styled.div`max-width: 920px; margin: 0 auto;`;
const Header = styled.header`
  display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:8px 20px; align-items:start; margin-bottom:28px;
  @media (max-width: 380px) { grid-template-columns:1fr; }
`;
const HeaderCopy = styled.div`min-width:0;`;
const Title = styled.h1`
  margin:0; font-size:clamp(28px, 7vw, 32px); line-height:1.12; font-weight:750; letter-spacing:-.025em;
`;
const Button = styled.button`
  min-height:48px; border: 1px solid var(--km-border); border-radius: 16px; padding: 10px 17px;
  background: ${({ $primary }) => ($primary ? 'var(--km-accent)' : 'var(--km-card)')};
  color: ${({ $primary }) => ($primary ? '#fff' : 'var(--km-text)')}; cursor:pointer; font:700 15px/1 var(--km-font);
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  transition:transform 180ms ease, background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  &:hover:not(:disabled) { border-color:var(--km-accent); }
  &:focus-visible { outline:3px solid var(--km-accent-ring); outline-offset:2px; border-color:var(--km-accent); }
  &:active:not(:disabled) { transform:translateY(1px); }
  &:disabled { background:color-mix(in srgb, var(--km-muted) 16%, var(--km-card)); color:var(--km-muted); box-shadow:none; cursor:not-allowed; }
  @media (prefers-reduced-motion: reduce) { transition:none; }
`;
const MatchingButton = styled(Button)`
  grid-column:2; grid-row:1; white-space:nowrap; background:color-mix(in srgb, var(--km-card) 88%, var(--km-muted));
  svg { color:var(--km-accent); }
  @media (max-width:380px) { grid-column:1; grid-row:auto; justify-self:start; margin-top:8px; }
`;
const SaveButton = styled(Button)`
  background: linear-gradient(135deg, #E8791A 0%, #F5A24B 100%);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 10px 24px var(--km-accent-ring);
`;
const AcceptButton = styled(Button)`
  background: linear-gradient(135deg, #2E9B55 0%, #57C27D 100%);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 10px 24px rgba(46, 155, 85, .25);
`;
const RejectButton = styled(Button)`
  background: var(--km-danger-bg);
  border-color: var(--km-danger-border);
  color: var(--km-danger);
`;
const GhostButton = styled(Button)`
  background: transparent;
  border-color: transparent;
  color: var(--km-muted);
  box-shadow: none;
  &:hover:not(:disabled) { background: color-mix(in srgb, var(--km-muted) 12%, transparent); border-color: var(--km-border); }
`;
const Card = styled.section`padding:20px; margin:12px 0; border:1px solid var(--km-border); border-radius:20px; background:var(--km-card); box-shadow:var(--km-shadow);`;
const Actions = styled.div`display:flex; flex-wrap:wrap; gap:8px; margin-top:16px;`;
const Meta = styled.p`margin:6px 0; color:var(--km-muted); font-size:14px; line-height:1.45; overflow-wrap:anywhere;`;
const Status = styled.span`
  display:inline-block; padding:4px 9px; border-radius:999px; font-size:12px; font-weight:800;
  background: ${({ $variant }) => ($variant === 'private' ? 'color-mix(in srgb, var(--km-muted) 16%, var(--km-card))' : 'var(--km-accent-light)')};
  color: ${({ $variant }) => ($variant === 'private' ? 'var(--km-muted)' : 'var(--km-accent)')};
`;
const HeaderMeta = styled(Meta)`grid-column:1 / -1; margin:0; max-width:650px; font-size:16px;`;
const SearchSection = styled.section`
  padding:24px; margin-bottom:30px; border:1px solid var(--km-border); border-radius:24px; background:var(--km-card);
  box-shadow:var(--km-shadow), inset 0 1px 0 rgba(255,255,255,.04);
  h2 { margin:0; font-size:clamp(23px, 6vw, 26px); line-height:1.2; letter-spacing:-.015em; }
  > ${Meta}:first-of-type { max-width:650px; margin-top:8px; font-size:16px; }
  > div[style] { min-height:58px !important; margin:20px 0 12px !important; padding:10px 16px !important; border-radius:17px !important; background:color-mix(in srgb, var(--km-bg) 62%, var(--km-card)) !important; }
  > div[style]:hover { border-color:color-mix(in srgb, var(--km-accent) 45%, var(--km-border)); }
  textarea { font-size:16px; line-height:1.4; }
  ${Actions} ${Button} { min-height:56px; min-width:220px; box-shadow:0 8px 20px var(--km-accent-ring); }
  ${Actions} ${Button}:disabled { box-shadow:none; }
  @media (max-width:600px) { padding:22px 20px; ${Actions} ${Button} { width:100%; } }
`;
const TechnicalMeta = styled(Meta)`font-size:12px; opacity:.82; code { color:var(--km-text); }`;
const DisclosureToggle = styled.button`
  display:inline-flex; align-items:center; gap:6px; margin:10px 0 2px; padding:0; border:none; background:transparent;
  color:var(--km-muted); font:700 12px/1 var(--km-font); cursor:pointer;
  svg:last-child { transition: transform 180ms ease; }
  &:hover { color:var(--km-accent); }
  &:focus-visible { outline:2px solid var(--km-accent); outline-offset:3px; border-radius:4px; }
`;
const ProgressRow = styled.div`display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px; color:var(--km-muted);`;
const ProgressTrack = styled.div`height:5px; background:var(--km-border); border-radius:99px; overflow:hidden; margin-bottom:18px;`;
const ProgressFill = styled.div`
  height:100%; border-radius:99px; transition:width 250ms ease;
  background: linear-gradient(90deg, var(--km-accent) 0%, var(--km-accent-mid) 100%);
  width: ${({ $pct }) => $pct}%;
`;
const SearchResult = styled.div`display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 0; border-top:1px solid var(--km-border); min-width:0; > span:first-child { min-width:0; overflow-wrap:anywhere; }`;
const SectionHeader = styled.div`display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 2px 12px; color:var(--km-muted); font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;`;
const Count = styled.span`min-width:28px; height:28px; padding:0 9px; display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; border-radius:999px; background:color-mix(in srgb, var(--km-muted) 14%, var(--km-card)); color:var(--km-text); letter-spacing:0;`;
const EmptyState = styled(Card)`min-height:170px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:7px; margin:0;`;
const EmptyIcon = styled.span`width:44px; height:44px; display:grid; place-items:center; margin-bottom:5px; border-radius:14px; background:var(--km-accent-light); color:var(--km-accent); font-size:21px;`;
const EmptyTitle = styled.p`font-size:19px; line-height:1.3; font-weight:650;`;
const ProfileCard = styled(Card)`
  margin:0 0 14px; padding:18px 20px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px 18px; align-items:center;
  h2 { margin:5px 0 0; font-size:19px; line-height:1.25; overflow-wrap:anywhere; }
  ${Button} { grid-column:2; grid-row:1 / span 2; }
  @media (max-width:520px) { grid-template-columns:1fr; ${Button} { grid-column:1; grid-row:auto; width:100%; } }
`;
const PROFILE_SEARCH_PREFILL_FIELDS = new Set(['name', 'surname', 'phone', 'email', 'telegram', 'instagram', 'facebook', 'tiktok']);
const PROFILE_SEARCH_ID_PREFIXES = getSearchIdIndexedFields();
const PROFILE_SEARCH_KEYS = ['userId', ...PROFILE_SEARCH_ID_PREFIXES];
const PROFILE_SEARCH_OPTIONS = { searchIdPrefixes: PROFILE_SEARCH_ID_PREFIXES };

export const ProfileCreationWorkspace = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [uid, setUid] = useState('');
  const [access, setAccess] = useState(null);
  const [mutations, setMutations] = useState([]);
  const [draft, setDraft] = useState(null);
  const [activeMutation, setActiveMutation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [showSearchKeysDetail, setShowSearchKeysDetail] = useState(false);

  const refresh = useCallback(async (userId, resolvedAccess) => {
    const items = resolvedAccess.isAdmin
      ? await loadAllCreateProfileMutations()
      : await loadOwnProfileMutations(userId);
    setMutations(items.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));
  }, []);

  useEffect(() => onAuthStateChanged(auth, async user => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    const profile = await fetchUserById(user.uid);
    const resolved = resolveAccess({
      uid: user.uid,
      accessLevel: profile?.accessLevel,
      userRole: profile?.userRole || profile?.role,
      canCreateProfiles: profile?.canCreateProfiles,
    });
    if (!resolved.canCreateProfiles) {
      navigate('/matching', { replace: true });
      return;
    }
    setUid(user.uid);
    setAccess(resolved);
    await refresh(user.uid, resolved);
  }), [navigate, refresh]);

  useEffect(() => {
    const requestedCardId = searchParams.get('cardId');
    if (!requestedCardId || !mutations.length) return;
    const mutation = mutations.find(item => item.cardId === requestedCardId);
    if (mutation && activeMutation?.cardId !== mutation.cardId) {
      setActiveMutation(mutation);
      setDraft(getEffectiveProfile({ mutation }));
    }
  }, [activeMutation?.cardId, mutations, searchParams]);

  const startNew = () => {
    const cardId = reserveProfileCardId();
    setActiveMutation({ cardId, revision: 0, status: 'pendingReview', createdBy: uid });
    const detected = detectSearchParams(search);
    const initialSearchData = PROFILE_SEARCH_PREFILL_FIELDS.has(detected?.key) && detected?.value
      ? { [detected.key]: detected.value }
      : {};
    setDraft({ userId: cardId, ...initialSearchData });
    setSearchParams({ cardId });
  };

  const applySearchUsers = value => {
    const cards = Array.isArray(value)
      ? value
      : Object.values(value && typeof value === 'object' ? value : {});
    setSearchResults(cards.filter(card => card?.userId));
  };

  const applySearchState = value => {
    if (value?.userId) setSearchResults([value]);
  };

  const updateSearch = value => {
    setSearch(previous => typeof value === 'function' ? value(previous) : value);
    setSearchResults([]);
    setSearchExecuted(false);
    setSearchNotFound(false);
    setSearchFailed(false);
  };

  const openMutation = mutation => {
    setActiveMutation(mutation);
    setDraft(getEffectiveProfile({ mutation }));
    setSearchParams({ cardId: mutation.cardId });
  };

  const closeEditor = () => {
    setDraft(null);
    setActiveMutation(null);
    setSearchParams({});
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveCreateProfileMutation({
        cardId: activeMutation.cardId,
        creatorUid: activeMutation.createdBy || uid,
        data: draft,
        expectedRevision: activeMutation.revision,
      });
      toast.success('Профіль збережено й надіслано на перевірку');
      setActiveMutation(saved);
      await refresh(uid, access);
    } catch (error) {
      toast.error(error?.message === 'REVISION_CONFLICT'
        ? 'Профіль уже змінено. Оновіть сторінку.'
        : error?.message === 'DUPLICATE_PROFILE' ? 'Профіль з такими контактами вже існує або очікує перевірки.' : 'Не вдалося зберегти профіль');
    } finally {
      setSaving(false);
    }
  };

  const accept = async () => {
    setSaving(true);
    try {
      await acceptCreateProfileMutation({ cardId: activeMutation.cardId, expectedRevision: activeMutation.revision, finalData: draft });
      toast.success('Профіль прийнято');
      closeEditor();
      await refresh(uid, access);
    } catch (error) {
      toast.error(error?.message === 'REVISION_CONFLICT' ? 'Автор уже оновив профіль. Перевірте нову версію.' : 'Не вдалося прийняти профіль');
    } finally { setSaving(false); }
  };

  const reject = async () => {
    setSaving(true);
    try {
      await rejectCreateProfileMutation({ cardId: activeMutation.cardId, expectedRevision: activeMutation.revision });
      toast.success('Профіль залишено приватним');
      closeEditor();
      await refresh(uid, access);
    } finally { setSaving(false); }
  };

  const clearField = (fieldName, index) => setDraft(previous => {
    const next = { ...(previous || {}) };
    if (Number.isInteger(index) && Array.isArray(next[fieldName])) {
      const values = [...next[fieldName]];
      values.splice(index, 1);
      if (values.length) next[fieldName] = values;
      else delete next[fieldName];
      return next;
    }
    delete next[fieldName];
    return next;
  });

  const deleteFieldValue = fieldName => setDraft(previous => {
    const next = { ...(previous || {}) };
    delete next[fieldName];
    return next;
  });

  const draftFilledPct = useMemo(() => {
    if (!draft) return 0;
    const fieldNames = pickerFields.map(field => field.name);
    const filledCount = fieldNames.filter(name => String(draft[name] || '').trim() !== '').length;
    return fieldNames.length ? Math.round((filledCount / fieldNames.length) * 100) : 0;
  }, [draft]);

  const heading = useMemo(() => access?.isAdmin ? 'Нові профілі' : 'Мої нові профілі', [access]);
  if (!access) return <Page><Shell>Завантаження…</Shell></Page>;

  return <Page><Shell>
    <Header>
      <HeaderCopy><Title>{heading}</Title></HeaderCopy>
      <MatchingButton onClick={() => navigate('/matching')}>Matching <FiArrowRight aria-hidden="true" /></MatchingButton>
      <HeaderMeta>Картки зберігаються приватно до рішення адміністратора.</HeaderMeta>
    </Header>
    {draft ? <Card>
      <Status $variant={activeMutation.status === 'private' ? 'private' : 'pending'}>
        {activeMutation.status === 'private' ? 'Приватний' : 'Очікує підтвердження'}
      </Status>
      {access.isAdmin
        ? <TechnicalMeta>cardId: <code>{activeMutation.cardId}</code> · revision: {activeMutation.revision || 0}</TechnicalMeta>
        : <Meta>Чернетка{activeMutation.updatedAt ? ` · оновлено ${new Date(activeMutation.updatedAt).toLocaleString('uk-UA')}` : ''}</Meta>}
      {!access.isAdmin && <>
        <ProgressRow>
          <span>Заповнено анкету</span>
          <span style={{ color: 'var(--km-accent)', fontWeight: 700 }}>{draftFilledPct}%</span>
        </ProgressRow>
        <ProgressTrack><ProgressFill $pct={draftFilledPct} /></ProgressTrack>
      </>}
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
        <ProfileForm state={draft} setState={setDraft} handleBlur={() => {}} handleSubmit={nextDraft => setDraft(nextDraft)} handleClear={clearField} handleDelKeyValue={deleteFieldValue} isAdmin={access.isAdmin} extendedMode={false} />
      </fieldset>
      <Actions>
        <SaveButton disabled={saving} onClick={save}>{saving ? 'Збереження…' : 'Зберегти'}</SaveButton>
        {access.isAdmin && activeMutation.revision > 0 && <AcceptButton disabled={saving} onClick={accept}>Прийняти</AcceptButton>}
        {access.isAdmin && activeMutation.revision > 0 && <RejectButton disabled={saving} onClick={reject}>Відхилити</RejectButton>}
        <GhostButton disabled={saving} onClick={closeEditor}>Закрити</GhostButton>
      </Actions>
    </Card> : <>
      {!access.isAdmin && <SearchSection aria-label="Пошук профілю перед створенням">
        <h2>Знайти або додати картку</h2>
        <Meta>Спочатку перевірте, чи профіль уже існує. Використовується той самий пошук, що й у Matching.</Meta>
        <DisclosureToggle
          type="button"
          aria-expanded={showSearchKeysDetail}
          onClick={() => setShowSearchKeysDetail(previous => !previous)}
        >
          <FiInfo aria-hidden="true" /> Технічні деталі пошуку
          <FiChevronDown aria-hidden="true" style={{ transform: showSearchKeysDetail ? 'rotate(180deg)' : 'none' }} />
        </DisclosureToggle>
        {showSearchKeysDetail && <TechnicalMeta>
          Пошук карток виконується за ключами: {PROFILE_SEARCH_KEYS.map((key, index) => (
            <React.Fragment key={key}>
              {index > 0 ? ', ' : ''}<code>{key}</code>
            </React.Fragment>
          ))}.
        </TechnicalMeta>}
        <SearchBar
          searchFunc={searchUsersOnly}
          search={search}
          setSearch={updateSearch}
          setUsers={applySearchUsers}
          setState={applySearchState}
          setUserNotFound={value => {
            setSearchNotFound(Boolean(value));
            if (value) setSearchResults([]);
          }}
          onSearchExecuted={() => {
            setSearchExecuted(true);
            setSearchFailed(false);
          }}
          onSearchError={() => {
            setSearchFailed(true);
            setSearchNotFound(false);
          }}
          onClear={() => {
            setSearchResults([]);
            setSearchNotFound(false);
            setSearchExecuted(false);
            setSearchFailed(false);
          }}
          storageKey="profileCreationSearchQuery"
          searchOptions={PROFILE_SEARCH_OPTIONS}
          wrapperStyle={{ width: '100%' }}
          leftIcon={<FiSearch size={21} aria-hidden="true" />}
          placeholder="Пошук профілю"
          inputAriaLabel="Пошук профілю"
        />
        {searchResults.map(profile => <SearchResult key={profile.userId}>
          <span><strong>{[profile.name, profile.surname].filter(Boolean).join(' ') || 'Профіль знайдено'}</strong><Meta>{profile.userId}</Meta></span>
          <Status>Вже існує</Status>
        </SearchResult>)}
        {searchExecuted && searchNotFound && <Meta>Профіль не знайдено. Можна створити нову приватну картку.</Meta>}
        {searchExecuted && searchFailed && <Meta>Не вдалося виконати пошук. Спробуйте ще раз.</Meta>}
        <Actions>
          <Button
            $primary
            disabled={!search.trim() || !searchExecuted || !searchNotFound || searchFailed || searchResults.length > 0}
            onClick={startNew}
          >
            <FiPlus size={20} aria-hidden="true" /> Додати профіль
          </Button>
        </Actions>
      </SearchSection>}
      <SectionHeader><span>Ваші картки</span><Count aria-label={`${mutations.length} карток`}>{mutations.length}</Count></SectionHeader>
      {mutations.length === 0 && <EmptyState>
        <EmptyIcon><FiFolder aria-hidden="true" /></EmptyIcon>
        <EmptyTitle>Нових профілів поки немає.</EmptyTitle>
        <Meta>Створені вами картки з’являться тут.</Meta>
      </EmptyState>}
      {mutations.map(mutation => <ProfileCard key={mutation.cardId}>
        <div>
          <Status $variant={mutation.status === 'private' ? 'private' : 'pending'}>
            {mutation.status === 'private' ? 'Приватний' : 'Очікує підтвердження'}
          </Status>
          <h2>{[mutation.data?.name, mutation.data?.surname].filter(Boolean).join(' ') || 'Новий профіль'}</h2>
          {access.isAdmin && <Meta>Автор: {mutation.createdBy}</Meta>}
          <Meta>
            Оновлено: {mutation.updatedAt ? new Date(mutation.updatedAt).toLocaleString('uk-UA') : '—'}
            {access.isAdmin ? ` · revision ${mutation.revision}` : ''}
          </Meta>
        </div>
        <Button onClick={() => openMutation(mutation)}>Відкрити профіль</Button>
      </ProfileCard>)}
    </>}
  </Shell></Page>;
};

export default ProfileCreationWorkspace;
