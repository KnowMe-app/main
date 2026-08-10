import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import styled from 'styled-components';

import { auth, fetchUserById, searchUsersOnly } from './config';
import { ProfileForm } from './ProfileForm';
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
  padding: 24px 12px 64px;
  background: var(--km-bg);
  color: var(--km-text);
`;
const Shell = styled.div`max-width: 920px; margin: 0 auto;`;
const Header = styled.header`display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px;`;
const Title = styled.h1`margin:0; font-size:24px;`;
const Button = styled.button`
  border: 1px solid var(--km-border); border-radius: 12px; padding: 10px 16px;
  background: ${({ $primary }) => ($primary ? 'var(--km-accent)' : 'var(--km-card)')};
  color: ${({ $primary }) => ($primary ? '#fff' : 'var(--km-text)')}; cursor:pointer; font-weight:700;
  &:disabled { opacity:.55; cursor:not-allowed; }
`;
const Card = styled.section`padding:18px; margin:12px 0; border:1px solid var(--km-border); border-radius:16px; background:var(--km-card);`;
const Actions = styled.div`display:flex; flex-wrap:wrap; gap:8px; margin-top:16px;`;
const Meta = styled.p`margin:6px 0; color:var(--km-muted); font-size:13px;`;
const Status = styled.span`display:inline-block; padding:4px 9px; border-radius:999px; background:var(--km-accent-light); color:var(--km-accent); font-size:12px; font-weight:800;`;
const SearchSection = styled.section`padding:16px; margin-bottom:18px; border:1px solid var(--km-border); border-radius:16px; background:var(--km-card);`;
const SearchResult = styled.div`display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid var(--km-border);`;
const PROFILE_SEARCH_PREFILL_FIELDS = new Set(['name', 'surname', 'phone', 'email', 'telegram', 'instagram', 'facebook', 'tiktok']);
const PROFILE_SEARCH_KEYS = ['userId', ...getSearchIdIndexedFields()];

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

  const heading = useMemo(() => access?.isAdmin ? 'Нові профілі' : 'Мої нові профілі', [access]);
  if (!access) return <Page><Shell>Завантаження…</Shell></Page>;

  return <Page><Shell>
    <Header><div><Title>{heading}</Title><Meta>Картки зберігаються приватно до рішення адміністратора.</Meta></div><Button onClick={() => navigate('/matching')}>Matching</Button></Header>
    {draft ? <Card>
      <Status>{activeMutation.status === 'private' ? 'Приватний' : 'Очікує підтвердження'}</Status>
      <Meta>cardId: {activeMutation.cardId} · revision: {activeMutation.revision || 0}</Meta>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
        <ProfileForm state={draft} setState={setDraft} handleBlur={() => {}} handleSubmit={nextDraft => setDraft(nextDraft)} handleClear={clearField} handleDelKeyValue={deleteFieldValue} isAdmin={access.isAdmin} extendedMode={false} />
      </fieldset>
      <Actions>
        <Button $primary disabled={saving} onClick={save}>{saving ? 'Збереження…' : 'Зберегти'}</Button>
        {access.isAdmin && activeMutation.revision > 0 && <Button $primary disabled={saving} onClick={accept}>Accept</Button>}
        {access.isAdmin && activeMutation.revision > 0 && <Button disabled={saving} onClick={reject}>Reject / Leave private</Button>}
        <Button disabled={saving} onClick={closeEditor}>Закрити</Button>
      </Actions>
    </Card> : <>
      {!access.isAdmin && <SearchSection aria-label="Пошук профілю перед створенням">
        <h2>Знайти або додати картку</h2>
        <Meta>Спочатку перевірте, чи профіль уже існує. Використовується той самий пошук, що й у Matching.</Meta>
        <Meta>
          Пошук карток виконується за ключами: {PROFILE_SEARCH_KEYS.map((key, index) => (
            <React.Fragment key={key}>
              {index > 0 ? ', ' : ''}<code>{key}</code>
            </React.Fragment>
          ))}.
        </Meta>
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
          wrapperStyle={{ width: '100%' }}
          leftIcon="🔍"
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
            + Додати профіль
          </Button>
        </Actions>
      </SearchSection>}
      {mutations.length === 0 && <Card>Нових профілів поки немає.</Card>}
      {mutations.map(mutation => <Card key={mutation.cardId}>
        <Status>{mutation.status === 'private' ? 'Приватний' : 'Очікує підтвердження'}</Status>
        <h2>{[mutation.data?.name, mutation.data?.surname].filter(Boolean).join(' ') || 'Новий профіль'}</h2>
        <Meta>Автор: {mutation.createdBy}</Meta><Meta>Оновлено: {mutation.updatedAt ? new Date(mutation.updatedAt).toLocaleString('uk-UA') : '—'} · revision {mutation.revision}</Meta>
        <Button onClick={() => openMutation(mutation)}>Відкрити профіль</Button>
      </Card>)}
    </>}
  </Shell></Page>;
};

export default ProfileCreationWorkspace;
