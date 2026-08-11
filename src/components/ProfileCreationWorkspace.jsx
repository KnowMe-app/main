import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { FiArrowRight, FiCheck, FiChevronDown, FiFolder, FiInfo, FiPlus, FiSearch, FiUsers, FiX } from 'react-icons/fi';

import { auth, fetchUserById, searchUsersOnly } from './config';
import { getFieldLabel, getFieldPlaceholder, getOptionLabel, getOptionValue, pickerFields } from './formFields';
import SearchBar, { detectSearchParams } from './SearchBar';
import { resolveAccess } from 'utils/accessLevel';
import { getSearchIdIndexedFields } from 'utils/searchKeyUtils';
import { findMatchingProfileMutation } from 'utils/profileCreationSearch';
import {
  applyOverlayToCard,
  applyOverlaysToCard,
  buildOverlayFromDraft,
  getOverlayHistoryForCard,
  getOverlaysForCard,
  normalizeOverlayFields,
  patchOverlayField,
  removeAllOverlaysForCard,
  saveOverlayForUserCard,
  sortOverlaysByAppliedOrder,
} from 'utils/multiAccountEdits';
import {
  acceptCreateProfileMutation,
  getEffectiveProfile,
  loadAllCreateProfileMutations,
  loadOwnProfileMutations,
  loadSharedProfileMutations,
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
  box-sizing: border-box;
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
const STATUS_VARIANT_BACKGROUND = {
  private: 'color-mix(in srgb, var(--km-muted) 16%, var(--km-card))',
  overlay: 'color-mix(in srgb, var(--km-accent-mid) 22%, var(--km-card))',
};
const STATUS_VARIANT_COLOR = {
  private: 'var(--km-muted)',
  overlay: 'var(--km-accent-mid)',
};
const Status = styled.span`
  display:inline-block; padding:4px 9px; border-radius:999px; font-size:12px; font-weight:800;
  background: ${({ $variant }) => STATUS_VARIANT_BACKGROUND[$variant] || 'var(--km-accent-light)'};
  color: ${({ $variant }) => STATUS_VARIANT_COLOR[$variant] || 'var(--km-accent)'};
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
const TechnicalMeta = styled(Meta)`font-size:12px; code { color:var(--km-text); }`;
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
const FormSectionCard = styled(Card)`padding:18px 20px;`;
const FormSectionTitle = styled.h3`margin:0 0 6px; font-size:15px; font-weight:750; letter-spacing:-.01em;`;
const FieldRow = styled.div`padding:12px 0; border-bottom:1px solid var(--km-border); &:last-child { border-bottom:none; }`;
const FieldLabel = styled.div`font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:var(--km-muted); margin-bottom:6px;`;
const FieldInput = styled.input`
  width:100%; box-sizing:border-box; background:var(--km-bg); border:1.5px solid var(--km-border); border-radius:10px;
  padding:10px 14px; font:500 15px/1.3 var(--km-font); color:var(--km-text); outline:none;
  &:focus { border-color:var(--km-accent); box-shadow:0 0 0 3px var(--km-accent-ring); }
`;
const FieldControls = styled.div`display:grid; gap:8px;`;
const FieldControl = styled.div`display:flex; align-items:center; gap:8px; min-width:0;`;
const FieldActionButton = styled.button`
  width:40px; height:40px; flex:0 0 40px; display:grid; place-items:center; padding:0;
  border:1px solid var(--km-border); border-radius:12px; background:var(--km-card); color:var(--km-muted); cursor:pointer;
  &:hover { border-color:var(--km-accent); color:var(--km-accent); background:var(--km-accent-light); }
  &:focus-visible { outline:3px solid var(--km-accent-ring); outline-offset:2px; }
`;
const AddValueButton = styled(FieldActionButton)`margin-top:8px; color:var(--km-accent);`;
const FieldTextArea = styled.textarea`
  width:100%; box-sizing:border-box; min-height:90px; background:var(--km-bg); border:1.5px solid var(--km-border); border-radius:10px;
  padding:10px 14px; font:500 15px/1.4 var(--km-font); color:var(--km-text); outline:none; resize:vertical;
  &:focus { border-color:var(--km-accent); box-shadow:0 0 0 3px var(--km-accent-ring); }
`;
const FieldChipRow = styled.div`display:flex; flex-wrap:wrap; gap:6px;`;
const FieldChip = styled.button`
  padding:6px 13px; border-radius:99px; font-size:13px; font-weight:600; cursor:pointer;
  border:1.5px solid ${({ $selected }) => ($selected ? 'var(--km-accent)' : 'var(--km-border)')};
  background: ${({ $selected }) => ($selected ? 'var(--km-accent-light)' : 'var(--km-card)')};
  color: ${({ $selected }) => ($selected ? 'var(--km-accent)' : 'var(--km-muted)')};
`;
const CommentCard = styled(Card)`background:color-mix(in srgb, var(--km-accent) 6%, var(--km-card));`;
const ReviewCard = styled(Card)`background:color-mix(in srgb, var(--km-accent-mid) 8%, var(--km-card));`;
const ReviewRow = styled.div`
  display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 12px; align-items:center;
  padding:10px 0; border-top:1px solid var(--km-border);
  &:first-of-type { border-top:none; }
  @media (max-width:520px) { grid-template-columns:1fr; }
`;
const ReviewChange = styled.div`font-size:14px; line-height:1.4; overflow-wrap:anywhere;`;
const ReviewActionsRow = styled.div`display:flex; gap:6px; justify-self:end;`;
const HistoryRow = styled.div`
  display:flex; flex-wrap:wrap; gap:4px 10px; padding:7px 0; font-size:12px; color:var(--km-muted);
  border-top:1px dashed var(--km-border); overflow-wrap:anywhere;
  &:first-of-type { border-top:none; }
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

// Same field catalogue and grouping as MyProfile.jsx's own questionnaire -
// pickerFields only, never pickerFieldsExtended's technical additions
// (userId, role, lastAction, lastLogin2, publish, getInTouch). Those describe
// system/runtime state a not-yet-accepted (or not-even-loaded, for an
// overlay) card doesn't have yet, not data a creator or editor submits.
const CREATE_FORM_SECTIONS = [
  { key: 'personal', title: '👤 Особисті дані', fields: ['name', 'surname', 'birth', 'country', 'region', 'city', 'maritalStatus'] },
  { key: 'contacts', title: '📱 Контакти', fields: ['email', 'phone', 'telegram', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'vk'] },
  { key: 'medical', title: '🏥 Медична інформація', fields: ['height', 'weight', 'blood', 'surgeries', 'chronicDiseases', 'allergy', 'ownKids', 'lastDelivery', 'csection', 'experience', 'surrogacyExperience', 'reward'] },
  { key: 'appearance', title: '✨ Зовнішність', fields: ['eyeColor', 'hairColor', 'hairStructure', 'bodyType', 'faceShape', 'noseShape', 'lipsShape', 'chin', 'clothingSize', 'shoeSize', 'breastSize', 'glasses', 'race'] },
  { key: 'lifestyle', title: '🌿 Спосіб життя', fields: ['smoking', 'alcohol', 'sport', 'hobbies', 'education', 'profession', 'twinsInFamily', 'moreInfo_main', 'surrogacyProgramInterest'] },
];

// A draft opened by somebody who is neither its author nor an admin. Those
// two write into the draft itself; everyone else contributes through their
// own overlay.
const isSharedDraft = (mutation, viewerUid, isAdmin) => Boolean(
  mutation?.createdBy && viewerUid && mutation.createdBy !== viewerUid && !isAdmin
);

const formatOverlayValue = value => {
  if (Array.isArray(value)) {
    const parts = value.map(item => String(item ?? '').trim()).filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  }
  const text = String(value ?? '').trim();
  return text || '—';
};

const describeOverlayChange = change => {
  if (!change || typeof change !== 'object') return '';
  if (change.discarded) return 'правку знято';
  if ('to' in change || 'from' in change) {
    return `${formatOverlayValue(change.from)} → ${formatOverlayValue(change.to)}`;
  }
  return [
    change.added?.length ? `+ ${formatOverlayValue(change.added)}` : '',
    change.removed?.length ? `− ${formatOverlayValue(change.removed)}` : '',
  ].filter(Boolean).join(' · ');
};

const OVERLAY_HISTORY_ACTION_LABELS = {
  edit: 'правка',
  accept: 'прийнято',
  discard: 'видалено',
};

export const ProfileCreationWorkspace = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [uid, setUid] = useState('');
  const [access, setAccess] = useState(null);
  const [mutations, setMutations] = useState([]);
  const [sharedMutations, setSharedMutations] = useState([]);
  const [draft, setDraft] = useState(null);
  const [activeMutation, setActiveMutation] = useState(null);
  const [draftOverlays, setDraftOverlays] = useState({});
  const [draftHistory, setDraftHistory] = useState([]);
  const [showDraftHistory, setShowDraftHistory] = useState(false);
  const [overlayTarget, setOverlayTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [showSearchKeysDetail, setShowSearchKeysDetail] = useState(false);
  const draftRef = useRef(draft);
  const persistedDraftRef = useRef(draft);
  // The draft as its author stored it, before anybody's overlay is replayed
  // onto it. Own/admin saves are written against this, never against the
  // stacked view, so another editor's pending value is never silently
  // promoted into the draft itself.
  const draftBaseRef = useRef(null);
  // What the editor is currently looking at: draftBase + every overlay, in
  // save order. A shared-draft save is diffed against this (minus the
  // editor's own overlay) to work out what *they* changed.
  const stackedDraftRef = useRef(null);
  const draftOverlaysRef = useRef({});
  const accessRef = useRef(null);

  const sortByRecency = items => (
    [...items].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  );

  const refresh = useCallback(async (userId, resolvedAccess) => {
    const items = resolvedAccess.isAdmin
      ? await loadAllCreateProfileMutations()
      : await loadOwnProfileMutations(userId);
    setMutations(sortByRecency(items));

    if (resolvedAccess.isAdmin) {
      // loadAllCreateProfileMutations already returns every author's drafts.
      setSharedMutations([]);
      return;
    }

    // Drafts of other users are a widened read that the backend rules still
    // have to allow; until they do, a denial must leave the user's own
    // workspace fully usable instead of blanking the page.
    try {
      setSharedMutations(sortByRecency(await loadSharedProfileMutations(userId)));
    } catch (error) {
      console.warn('[ProfileCreationWorkspace] shared drafts unavailable', error);
      setSharedMutations([]);
    }
  }, []);

  const resetDraftOverlayState = useCallback(nextBase => {
    draftBaseRef.current = nextBase || null;
    stackedDraftRef.current = nextBase || null;
    draftOverlaysRef.current = {};
    setDraftOverlays({});
    setDraftHistory([]);
    setShowDraftHistory(false);
  }, []);

  // Re-reads the pending overlays for the open draft and rebuilds the view
  // from them: the author's data with every editor's overlay replayed on top
  // in save order. That stacked card is what every editor sees, so the values
  // on screen are always the draft's latest state, whoever last touched them.
  const refreshDraftOverlays = useCallback(async () => {
    const current = activeMutationRef.current;
    if (!current?.cardId) return;

    const base = draftBaseRef.current
      || getEffectiveProfile({ mutation: current })
      || { userId: current.cardId };

    let overlays = {};
    try {
      overlays = await getOverlaysForCard(current.cardId);
    } catch (error) {
      console.warn('[ProfileCreationWorkspace] draft overlays unavailable', error);
    }

    const stacked = applyOverlaysToCard(base, overlays);
    draftBaseRef.current = base;
    draftOverlaysRef.current = overlays;
    stackedDraftRef.current = stacked;
    draftRef.current = stacked;
    persistedDraftRef.current = stacked;
    setDraftOverlays(overlays);
    setDraft(stacked);

    // The journal of superseded edits is an admin tool. Other editors see
    // the stacked result only - never who changed a value, nor what it was
    // before them.
    if (!accessRef.current?.isAdmin) {
      setDraftHistory([]);
      return;
    }

    try {
      setDraftHistory(await getOverlayHistoryForCard(current.cardId));
    } catch (error) {
      console.warn('[ProfileCreationWorkspace] draft history unavailable', error);
      setDraftHistory([]);
    }
  }, []);

  const openMutation = useCallback(async mutation => {
    if (!mutation?.cardId) return;

    setOverlayTarget(null);
    activeMutationRef.current = mutation;
    setActiveMutation(mutation);
    setShowDraftHistory(false);
    draftBaseRef.current = getEffectiveProfile({ mutation }) || { userId: mutation.cardId };
    setSearchParams({ cardId: mutation.cardId });
    await refreshDraftOverlays();
  }, [refreshDraftOverlays, setSearchParams]);

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
    accessRef.current = resolved;
    setAccess(resolved);
    await refresh(user.uid, resolved);
  }), [navigate, refresh]);

  useEffect(() => {
    const requestedCardId = searchParams.get('cardId');
    if (!requestedCardId) return;
    const mutation = [...mutations, ...sharedMutations].find(item => item.cardId === requestedCardId);
    if (mutation && activeMutation?.cardId !== mutation.cardId) {
      openMutation(mutation);
    }
  }, [activeMutation?.cardId, mutations, sharedMutations, searchParams, openMutation]);

  const startNew = () => {
    const cardId = reserveProfileCardId();
    setActiveMutation({ cardId, revision: 0, status: 'pendingReview', createdBy: uid });
    setOverlayTarget(null);
    const detected = detectSearchParams(search);
    const initialSearchData = PROFILE_SEARCH_PREFILL_FIELDS.has(detected?.key) && detected?.value
      ? { [detected.key]: detected.value }
      : {};
    const nextDraft = { userId: cardId, ...initialSearchData };
    persistedDraftRef.current = nextDraft;
    resetDraftOverlayState(nextDraft);
    setDraft(nextDraft);
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

  const matchingOwnDraft = useMemo(() => (
    searchExecuted ? findMatchingProfileMutation(mutations, detectSearchParams(search)) : null
  ), [mutations, search, searchExecuted]);

  // The same contact can already sit in a draft somebody else started. That
  // draft is editable by this user too, so offer it instead of letting them
  // create a second card for the same person.
  const matchingSharedDraft = useMemo(() => (
    searchExecuted && !matchingOwnDraft
      ? findMatchingProfileMutation(sharedMutations, detectSearchParams(search))
      : null
  ), [matchingOwnDraft, search, searchExecuted, sharedMutations]);

  const closeEditor = () => {
    setDraft(null);
    setActiveMutation(null);
    setOverlayTarget(null);
    resetDraftOverlayState(null);
    setSearchParams({});
  };

  const startExistingProfileOverlay = profile => {
    if (!profile?.userId) return;

    // Deliberately start with an empty form instead of copying the search result.
    // Every value entered here is private data owned by the current editor and is
    // persisted as an overlay, never as a replacement for the canonical card.
    setActiveMutation(null);
    setOverlayTarget({ userId: profile.userId, canonical: profile });
    const nextDraft = { userId: profile.userId, myComment: '' };
    persistedDraftRef.current = nextDraft;
    resetDraftOverlayState(null);
    setDraft(nextDraft);
    setSearchParams({ cardId: profile.userId, overlay: '1' });
  };

  // Kept in sync via effects below so the async save path always reads the
  // latest values instead of a stale closure captured at render time.
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const activeMutationRef = useRef(activeMutation);
  useEffect(() => { activeMutationRef.current = activeMutation; }, [activeMutation]);
  // Chains saves so two rapid blurs (or a blur racing the Save button) apply
  // in order against the revision the previous one actually committed,
  // instead of two saves reading the same stale revision and one of them
  // failing with a false REVISION_CONFLICT.
  const saveQueueRef = useRef(Promise.resolve());

  // A bare "Не вдалося зберегти" hides exactly the information needed to
  // tell "rules not deployed yet for this path" apart from "network hiccup"
  // apart from an actual conflict - surface the raw error too.
  const reportSaveError = (error, fallbackMessage) => {
    console.error('[ProfileCreationWorkspace] save failed', {
      stage: error?.profileSaveStage || 'unknown',
      uid: auth.currentUser?.uid,
      code: error?.code,
      error,
    });
    const detail = error?.code || error?.message || '';
    const stage = error?.profileSaveStage;
    toast.error(
      <div>
        <div style={{ fontWeight: 700 }}>{fallbackMessage}</div>
        {detail ? <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>{stage ? `${stage}: ` : ''}{detail}</div> : null}
      </div>,
      { duration: 8000 },
    );
  };

  const describeSaveError = error => (error?.message === 'REVISION_CONFLICT'
    ? 'Профіль уже змінено. Оновіть сторінку.'
    : error?.message === 'DUPLICATE_PROFILE' ? 'Профіль з такими контактами вже існує або очікує перевірки.' : 'Не вдалося зберегти профіль');

  const persistDraft = useCallback(nextDraft => {
    const run = async () => {
      if (overlayTarget) {
        const canonical = overlayTarget.canonical || { userId: overlayTarget.userId };
        // Compare only fields the editor actually touched. Missing fields in
        // this deliberately blank form must never become removal operations.
        const touchedCanonical = Object.keys(nextDraft || {}).reduce((result, fieldName) => {
          if (Object.prototype.hasOwnProperty.call(canonical, fieldName)) result[fieldName] = canonical[fieldName];
          return result;
        }, { userId: overlayTarget.userId });
        const additiveDraft = Object.entries(nextDraft || {}).reduce((result, [fieldName, value]) => {
          if (fieldName === 'userId' || !Object.prototype.hasOwnProperty.call(touchedCanonical, fieldName)) {
            result[fieldName] = value;
            return result;
          }
          const canonicalValues = Array.isArray(touchedCanonical[fieldName])
            ? touchedCanonical[fieldName]
            : [touchedCanonical[fieldName]];
          const enteredValues = Array.isArray(value) ? value : [value];
          result[fieldName] = [...canonicalValues, ...enteredValues];
          return result;
        }, {});
        const overlayFields = buildOverlayFromDraft(touchedCanonical, additiveDraft);
        await saveOverlayForUserCard({
          editorUserId: uid,
          cardUserId: overlayTarget.userId,
          fields: overlayFields,
        });
        persistedDraftRef.current = nextDraft;
        return null;
      }
      const current = activeMutationRef.current;
      const base = draftBaseRef.current || getEffectiveProfile({ mutation: current }) || { userId: current.cardId };
      const overlays = draftOverlaysRef.current || {};

      // Somebody else's draft: nothing this editor types may touch the
      // author's node. Their whole delta - added values, cleared contacts,
      // everything - is stored as their own overlay, diffed against the card
      // as it looks with the *other* editors' overlays already applied, so it
      // never absorbs (or credits them with) another editor's change.
      if (isSharedDraft(current, uid, accessRef.current?.isAdmin)) {
        const baseWithoutOwnOverlay = applyOverlaysToCard(base, overlays, { excludeEditorUserId: uid });
        await saveOverlayForUserCard({
          editorUserId: uid,
          cardUserId: current.cardId,
          fields: buildOverlayFromDraft(baseWithoutOwnOverlay, nextDraft),
        });

        let refreshedOverlays = overlays;
        try {
          refreshedOverlays = await getOverlaysForCard(current.cardId);
        } catch (error) {
          console.warn('[ProfileCreationWorkspace] draft overlays unavailable after save', error);
        }
        draftOverlaysRef.current = refreshedOverlays;
        stackedDraftRef.current = applyOverlaysToCard(base, refreshedOverlays);
        setDraftOverlays(refreshedOverlays);
        persistedDraftRef.current = nextDraft;
        return null;
      }

      // The author (or an admin) writes into the draft itself. What they see
      // is the stacked card, so saving it verbatim would quietly promote
      // every pending overlay into the draft - only an explicit accept may do
      // that. Persist just the delta this save introduced on top of what was
      // on screen, applied to the author's own data.
      const stacked = stackedDraftRef.current || applyOverlaysToCard(base, overlays);
      const hasPendingOverlays = Object.keys(overlays).length > 0;
      const nextData = hasPendingOverlays
        ? applyOverlayToCard(base, buildOverlayFromDraft(stacked, nextDraft))
        : nextDraft;

      let saved;
      try {
        saved = await saveCreateProfileMutation({
          cardId: current.cardId,
          creatorUid: current.createdBy || uid,
          actorUid: uid,
          data: nextData,
          expectedRevision: current.revision,
        });
      } catch (error) {
        if (!error.profileSaveStage) error.profileSaveStage = 'identity-claim-or-mutation';
        throw error;
      }
      activeMutationRef.current = saved;
      draftBaseRef.current = saved?.data || nextData;
      stackedDraftRef.current = applyOverlaysToCard(draftBaseRef.current, overlays);
      persistedDraftRef.current = nextDraft;
      setActiveMutation(saved);
      return saved;
    };

    const queued = saveQueueRef.current.catch(() => {}).then(run);
    saveQueueRef.current = queued.catch(() => {});
    return queued;
  }, [overlayTarget, uid]);

  // Fires on every field blur/chip click - the primary save path now, so a
  // draft is never lost by someone filling the form and never pressing the
  // button below.
  const commitFieldValue = (fieldName, value) => {
    const nextDraft = { ...(draftRef.current || {}), [fieldName]: value };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    persistDraft(nextDraft).catch(error => reportSaveError(error, describeSaveError(error)));
  };

  const toFieldValues = value => Array.isArray(value) ? value : [value ?? ''];
  const mergeFieldHistory = (fieldName, nextValues) => {
    const previousValues = toFieldValues(persistedDraftRef.current?.[fieldName]).filter((value, index, values) => (
      value !== '' || index < values.length - 1
    ));
    const values = [...previousValues];
    nextValues.forEach(value => {
      if (value === '' || !values.includes(value)) values.push(value);
    });
    return values.length ? values : [''];
  };

  const updateDraftFieldItem = (fieldName, index, value) => {
    const values = toFieldValues(draftRef.current?.[fieldName]);
    values[index] = value;
    const nextDraft = { ...(draftRef.current || {}), [fieldName]: values };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const commitDraftFieldItems = (fieldName, values) => {
    const nextValues = mergeFieldHistory(fieldName, values);
    commitFieldValue(fieldName, nextValues);
  };

  const appendDraftFieldItem = fieldName => {
    const values = [...toFieldValues(draftRef.current?.[fieldName]), ''];
    const nextDraft = { ...(draftRef.current || {}), [fieldName]: values };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const clearDraftFieldItem = (fieldName, index) => {
    const values = toFieldValues(draftRef.current?.[fieldName]);
    values[index] = '';
    commitDraftFieldItems(fieldName, values);
  };

  const editingSharedDraft = isSharedDraft(activeMutation, uid, access?.isAdmin);

  const save = async () => {
    setSaving(true);
    try {
      await persistDraft(draftRef.current);
      if (overlayTarget) {
        toast.success('Власні дані та коментар збережено');
        closeEditor();
      } else if (editingSharedDraft) {
        toast.success('Ваші правки збережено. Їх побачить кожен, хто відкриє цю чернетку.');
        await refresh(uid, access);
      } else {
        toast.success('Профіль збережено й надіслано на перевірку');
        await refresh(uid, access);
      }
    } catch (error) {
      reportSaveError(error, describeSaveError(error));
    } finally {
      setSaving(false);
    }
  };

  // --- Admin review of the pending overlays on the open draft ----------------
  // Accepting writes the change into the author's draft data and clears it
  // from the queue; discarding drops it without touching the draft. Either
  // way the journal keeps the record.
  const persistDraftData = async nextData => {
    const current = activeMutationRef.current;
    const saved = await saveCreateProfileMutation({
      cardId: current.cardId,
      creatorUid: current.createdBy || uid,
      actorUid: uid,
      data: nextData,
      expectedRevision: current.revision,
    });
    activeMutationRef.current = saved;
    draftBaseRef.current = saved?.data || nextData;
    setActiveMutation(saved);
    return saved;
  };

  const runOverlayReviewAction = async (action, successMessage, failureMessage) => {
    setSaving(true);
    try {
      await action();
      await refreshDraftOverlays();
      toast.success(successMessage);
    } catch (error) {
      reportSaveError(error, failureMessage);
    } finally {
      setSaving(false);
    }
  };

  const acceptOverlayChange = (editorUserId, fieldName, change) => runOverlayReviewAction(
    async () => {
      await persistDraftData(applyOverlayToCard(draftBaseRef.current || {}, { [fieldName]: change }));
      await patchOverlayField({
        editorUserId,
        cardUserId: activeMutationRef.current.cardId,
        fieldName,
        change: null,
        historyAction: 'accept',
      });
    },
    `Правку прийнято: ${fieldName}`,
    'Не вдалося прийняти правку',
  );

  const discardOverlayChange = (editorUserId, fieldName) => runOverlayReviewAction(
    () => patchOverlayField({
      editorUserId,
      cardUserId: activeMutationRef.current.cardId,
      fieldName,
      change: null,
      historyAction: 'discard',
    }),
    `Правку видалено: ${fieldName}`,
    'Не вдалося видалити правку',
  );

  const acceptAllOverlayChanges = () => runOverlayReviewAction(
    async () => {
      await persistDraftData(applyOverlaysToCard(draftBaseRef.current || {}, draftOverlaysRef.current || {}));
      await removeAllOverlaysForCard(activeMutationRef.current.cardId, { historyAction: 'accept' });
    },
    'Усі правки прийнято',
    'Не вдалося прийняти правки',
  );

  const discardAllOverlayChanges = () => runOverlayReviewAction(
    () => removeAllOverlaysForCard(activeMutationRef.current.cardId, { historyAction: 'discard' }),
    'Усі правки видалено',
    'Не вдалося видалити правки',
  );

  const accept = async () => {
    setSaving(true);
    try {
      await acceptCreateProfileMutation({ cardId: activeMutation.cardId, creatorUid: activeMutation.createdBy, expectedRevision: activeMutation.revision, finalData: draft });
      toast.success('Профіль прийнято');
      closeEditor();
      await refresh(uid, access);
    } catch (error) {
      reportSaveError(error, error?.message === 'REVISION_CONFLICT' ? 'Автор уже оновив профіль. Перевірте нову версію.' : 'Не вдалося прийняти профіль');
    } finally { setSaving(false); }
  };

  const reject = async () => {
    setSaving(true);
    try {
      await rejectCreateProfileMutation({ cardId: activeMutation.cardId, creatorUid: activeMutation.createdBy, expectedRevision: activeMutation.revision });
      toast.success('Профіль залишено приватним');
      closeEditor();
      await refresh(uid, access);
    } catch (error) {
      reportSaveError(error, 'Не вдалося відхилити профіль');
    } finally { setSaving(false); }
  };

  const fieldsMap = useMemo(() => new Map(pickerFields.map(field => [field.name, field])), []);

  // One row per (editor, field) still pending on the open draft, in the order
  // the overlays are replayed - so the row that decides a field's visible
  // value is the last one listed for that field.
  const overlayReviewRows = useMemo(() => sortOverlaysByAppliedOrder(draftOverlays).flatMap(overlay => (
    Object.entries(normalizeOverlayFields(overlay.fields)).map(([fieldName, change]) => ({
      key: `${overlay.editorUserId}-${fieldName}`,
      editorUserId: overlay.editorUserId,
      updatedAt: overlay.updatedAt,
      fieldName,
      change,
    }))
  )), [draftOverlays]);

  const updateDraftField = (fieldName, value) => setDraft(previous => ({ ...(previous || {}), [fieldName]: value }));

  const renderCreateField = fieldName => {
    const field = fieldsMap.get(fieldName);
    if (!field) return null;
    const value = draft?.[fieldName] || '';
    const isTextArea = fieldName === 'moreInfo_main';

    return <FieldRow key={fieldName}>
      <FieldLabel>{getFieldLabel(field)}</FieldLabel>
      {Array.isArray(field.options) && field.options.length > 0 ? (
        <FieldChipRow>
          {field.options.map(option => {
            const optionValue = getOptionValue(option);
            const selected = String(value) === String(optionValue);
            return <FieldChip
              key={`${fieldName}-${optionValue}`}
              type="button"
              $selected={selected}
              onClick={() => commitFieldValue(fieldName, selected ? '' : optionValue)}
            >
              {getOptionLabel(option)}
            </FieldChip>;
          })}
        </FieldChipRow>
      ) : isTextArea ? (
        <FieldControls>
          {toFieldValues(value).map((item, index) => <FieldControl key={`${fieldName}-${index}`}>
            <FieldTextArea
              value={item}
              placeholder={getFieldPlaceholder(field)}
              onChange={e => updateDraftFieldItem(fieldName, index, e.target.value)}
              onBlur={() => commitDraftFieldItems(fieldName, toFieldValues(draftRef.current?.[fieldName]))}
            />
            <FieldActionButton type="button" aria-label={`Очистити ${getFieldLabel(field)}`} title="Очистити рядок" onMouseDown={e => e.preventDefault()} onClick={() => clearDraftFieldItem(fieldName, index)}><FiX aria-hidden="true" /></FieldActionButton>
          </FieldControl>)}
          <AddValueButton type="button" aria-label={`Додати ще одне значення: ${getFieldLabel(field)}`} title="Додати ще один рядок" onClick={() => appendDraftFieldItem(fieldName)}><FiPlus aria-hidden="true" /></AddValueButton>
        </FieldControls>
      ) : (
        <FieldControls>
          {toFieldValues(value).map((item, index) => <FieldControl key={`${fieldName}-${index}`}>
            <FieldInput
              value={item}
              placeholder={getFieldPlaceholder(field)}
              onChange={e => updateDraftFieldItem(fieldName, index, e.target.value)}
              onBlur={() => commitDraftFieldItems(fieldName, toFieldValues(draftRef.current?.[fieldName]))}
            />
            <FieldActionButton type="button" aria-label={`Очистити ${getFieldLabel(field)}`} title="Очистити рядок" onMouseDown={e => e.preventDefault()} onClick={() => clearDraftFieldItem(fieldName, index)}><FiX aria-hidden="true" /></FieldActionButton>
          </FieldControl>)}
          <AddValueButton type="button" aria-label={`Додати ще одне значення: ${getFieldLabel(field)}`} title="Додати ще один рядок" onClick={() => appendDraftFieldItem(fieldName)}><FiPlus aria-hidden="true" /></AddValueButton>
        </FieldControls>
      )}
    </FieldRow>;
  };

  const draftFilledPct = useMemo(() => {
    if (!draft) return 0;
    const fieldNames = pickerFields.map(field => field.name);
    const filledCount = fieldNames.filter(name => toFieldValues(draft[name]).some(value => String(value || '').trim() !== '')).length;
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
    {draft ? <>
      <Card>
        <Status $variant={overlayTarget || editingSharedDraft ? 'overlay' : activeMutation.status === 'private' ? 'private' : 'pending'}>
          {overlayTarget ? 'Власні дані' : editingSharedDraft ? 'Спільна чернетка' : activeMutation.status === 'private' ? 'Приватний' : 'Очікує підтвердження'}
        </Status>
        {overlayTarget
          ? <Meta>Дані буде збережено як ваш оверлей для {overlayTarget.userId}. Оригінальна картка не завантажується і не змінюється.</Meta>
          : access.isAdmin
            ? <TechnicalMeta>cardId: <code>{activeMutation.cardId}</code> · revision: {activeMutation.revision || 0}</TechnicalMeta>
            : <Meta>Чернетка{activeMutation.updatedAt ? ` · оновлено ${new Date(activeMutation.updatedAt).toLocaleString('uk-UA')}` : ''}</Meta>}
        {editingSharedDraft && <Meta>
          Ви бачите останні дані цієї чернетки — правки всіх редакторів накладені одна на одну.
          Ваші зміни зберігаються окремо, у вашому оверлеї, і стають видимими наступному редактору.
          Рішення про те, які правки залишити, ухвалює адміністратор.
        </Meta>}
        {!access.isAdmin && !overlayTarget && <>
          <ProgressRow>
            <span>Заповнено анкету</span>
            <span style={{ color: 'var(--km-accent)', fontWeight: 700 }}>{draftFilledPct}%</span>
          </ProgressRow>
          <ProgressTrack><ProgressFill $pct={draftFilledPct} /></ProgressTrack>
        </>}
      </Card>
      {!overlayTarget && access.isAdmin && (overlayReviewRows.length > 0 || draftHistory.length > 0) && <ReviewCard>
        <SectionHeader>
          <span>Правки редакторів</span>
          <Count aria-label={`${overlayReviewRows.length} правок`}>{overlayReviewRows.length}</Count>
        </SectionHeader>
        {overlayReviewRows.length === 0
          ? <Meta>Немає непідтверджених правок — усі зміни вже опрацьовано.</Meta>
          : overlayReviewRows.map(row => <ReviewRow key={row.key}>
            <ReviewChange>
              <FieldLabel>{getFieldLabel(fieldsMap.get(row.fieldName)) || row.fieldName}</FieldLabel>
              <div>{describeOverlayChange(row.change)}</div>
              <TechnicalMeta>
                {row.editorUserId}{row.updatedAt ? ` · ${new Date(row.updatedAt).toLocaleString('uk-UA')}` : ''}
              </TechnicalMeta>
            </ReviewChange>
            <ReviewActionsRow>
              <FieldActionButton
                type="button"
                disabled={saving}
                title="Прийняти цю правку"
                aria-label={`Прийняти правку по полю ${row.fieldName}`}
                onClick={() => acceptOverlayChange(row.editorUserId, row.fieldName, row.change)}
              ><FiCheck aria-hidden="true" /></FieldActionButton>
              <FieldActionButton
                type="button"
                disabled={saving}
                title="Видалити цю правку"
                aria-label={`Видалити правку по полю ${row.fieldName}`}
                onClick={() => discardOverlayChange(row.editorUserId, row.fieldName)}
              ><FiX aria-hidden="true" /></FieldActionButton>
            </ReviewActionsRow>
          </ReviewRow>)}
        {overlayReviewRows.length > 0 && <Actions>
          <AcceptButton disabled={saving} onClick={acceptAllOverlayChanges}>Прийняти всі</AcceptButton>
          <RejectButton disabled={saving} onClick={discardAllOverlayChanges}>Видалити всі</RejectButton>
        </Actions>}
        <DisclosureToggle
          type="button"
          aria-expanded={showDraftHistory}
          onClick={() => setShowDraftHistory(previous => !previous)}
        >
          <FiInfo aria-hidden="true" /> Історія правок ({draftHistory.length})
          <FiChevronDown aria-hidden="true" style={{ transform: showDraftHistory ? 'rotate(180deg)' : 'none' }} />
        </DisclosureToggle>
        {showDraftHistory && (draftHistory.length === 0
          ? <Meta>Історія порожня.</Meta>
          : draftHistory.map(entry => <HistoryRow key={entry.entryId}>
            <span>{entry.at ? new Date(entry.at).toLocaleString('uk-UA') : '—'}</span>
            <span>· {OVERLAY_HISTORY_ACTION_LABELS[entry.action] || entry.action}</span>
            <span>· {entry.fieldName}: {describeOverlayChange(entry.change)}</span>
            <span>· {entry.editorUserId}</span>
          </HistoryRow>))}
      </ReviewCard>}
      {overlayTarget && <CommentCard>
        <FieldLabel>Ваш коментар</FieldLabel>
        <FieldTextArea
          value={draft?.myComment || ''}
          placeholder="Що варто знати адміністратору про цей профіль"
          onChange={e => updateDraftField('myComment', e.target.value)}
          onBlur={e => commitFieldValue('myComment', e.target.value)}
        />
      </CommentCard>}
      {CREATE_FORM_SECTIONS.map(section => (
        <FormSectionCard key={section.key}>
          <FormSectionTitle>{section.title}</FormSectionTitle>
          {section.fields.map(renderCreateField)}
        </FormSectionCard>
      ))}
      <Card>
        <Actions>
          <SaveButton disabled={saving} onClick={save}>{saving ? 'Збереження…' : 'Зберегти'}</SaveButton>
          {!overlayTarget && access.isAdmin && activeMutation.revision > 0 && <AcceptButton disabled={saving} onClick={accept}>Прийняти</AcceptButton>}
          {!overlayTarget && access.isAdmin && activeMutation.revision > 0 && <RejectButton disabled={saving} onClick={reject}>Відхилити</RejectButton>}
          <GhostButton disabled={saving} onClick={closeEditor}>Закрити</GhostButton>
        </Actions>
      </Card>
    </> : <>
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
          <span>
            <Status>Вже існує</Status>
            <Button onClick={() => startExistingProfileOverlay(profile)}>Додати власні дані</Button>
          </span>
        </SearchResult>)}
        {matchingOwnDraft ? <SearchResult>
          <span>
            <strong>{[matchingOwnDraft.data?.name, matchingOwnDraft.data?.surname].filter(Boolean).join(' ') || 'Ваша чернетка'}</strong>
            <Meta>Цей контакт уже є у вашій картці, що очікує перевірки.</Meta>
          </span>
          <Button onClick={() => openMutation(matchingOwnDraft)}>Відкрити чернетку</Button>
        </SearchResult> : null}
        {matchingSharedDraft ? <SearchResult>
          <span>
            <strong>{[matchingSharedDraft.data?.name, matchingSharedDraft.data?.surname].filter(Boolean).join(' ') || 'Спільна чернетка'}</strong>
            <Meta>Цей контакт уже є у спільній чернетці. Відкрийте її та додайте свої правки.</Meta>
          </span>
          <Button onClick={() => openMutation(matchingSharedDraft)}>Відкрити чернетку</Button>
        </SearchResult> : null}
        {searchExecuted && searchNotFound && !matchingOwnDraft && !matchingSharedDraft && <Meta>Профіль не знайдено. Можна створити нову приватну картку.</Meta>}
        {searchExecuted && searchFailed && <Meta>Не вдалося виконати пошук. Спробуйте ще раз.</Meta>}
        <Actions>
          <Button
            $primary
            disabled={!search.trim() || !searchExecuted || !searchNotFound || searchFailed || searchResults.length > 0 || Boolean(matchingOwnDraft) || Boolean(matchingSharedDraft)}
            onClick={startNew}
          >
            <FiPlus size={20} aria-hidden="true" /> Додати профіль
          </Button>
        </Actions>
      </SearchSection>}
      <SectionHeader>
        <span>{access.isAdmin ? 'Черга на перевірку' : 'Ваші картки'}</span>
        <Count aria-label={`${mutations.length} карток`}>{mutations.length}</Count>
      </SectionHeader>
      {mutations.length === 0 && <EmptyState>
        <EmptyIcon><FiFolder aria-hidden="true" /></EmptyIcon>
        <EmptyTitle>Нових профілів поки немає.</EmptyTitle>
        <Meta>{access.isAdmin ? 'Нові картки від користувачів з’являться тут.' : 'Створені вами картки з’являться тут.'}</Meta>
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
      {sharedMutations.length > 0 && <>
        <SectionHeader>
          <span>Спільні чернетки</span>
          <Count aria-label={`${sharedMutations.length} спільних чернеток`}>{sharedMutations.length}</Count>
        </SectionHeader>
        {sharedMutations.map(mutation => <ProfileCard key={mutation.cardId}>
          <div>
            <Status $variant="overlay">Спільна чернетка</Status>
            <h2>{[mutation.data?.name, mutation.data?.surname].filter(Boolean).join(' ') || 'Новий профіль'}</h2>
            <Meta>
              Оновлено: {mutation.updatedAt ? new Date(mutation.updatedAt).toLocaleString('uk-UA') : '—'}
            </Meta>
          </div>
          <Button onClick={() => openMutation(mutation)}><FiUsers aria-hidden="true" /> Додати свої правки</Button>
        </ProfileCard>)}
      </>}
    </>}
  </Shell></Page>;
};

export default ProfileCreationWorkspace;
