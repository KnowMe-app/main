import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { FiChevronDown, FiClock, FiFolder, FiInfo, FiPlus, FiSave, FiSearch, FiUsers, FiX } from 'react-icons/fi';

import { addMatchingSearchQuery, auth, fetchUserById, fetchUsersByIds, searchUsersOnly } from './config';
import { getFieldLabel, getFieldPlaceholder, getOptionLabel, getOptionValue, pickerFieldsExtended } from './formFields';
import SearchBar, { detectSearchParams } from './SearchBar';
import PageNavMenu from './PageNavMenu';
import { fieldContacts } from './smallCard/fieldContacts';
import { resolveAccess } from 'utils/accessLevel';
import { getSearchIdIndexedFields } from 'utils/searchKeyUtils';
import { findMatchingProfileMutations } from 'utils/profileCreationSearch';
import {
  applyOverlayToCard,
  applyOverlaysToCard,
  buildOverlayFromDraft,
  getOverlayHistoryForCard,
  getOverlaysForCard,
  purgeOverlayHistoryEntries,
  saveOverlayForUserCard,
  settleOverlayFieldValue,
} from 'utils/multiAccountEdits';
import {
  buildFieldVersionHistory,
  buildPendingFieldEdits,
  dropVersionsPresentIn,
  splitOverlayChangeValue,
  withEditedValue,
} from 'utils/draftFieldEdits';
import {
  acceptCreateProfileMutation,
  getEffectiveProfile,
  loadAllCreateProfileMutations,
  loadOwnProfileMutations,
  loadProfileMutationHistory,
  purgeProfileMutationHistoryValue,
  loadSharedProfileMutations,
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
// Same title row as every other page's header (AdminPageHeader / KmTopbar):
// title on the left, the "⋮" page switcher pinned to the right, one row at any
// width - never the left-of-title placement this page used to have.
const Header = styled.header`
  display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:28px;
`;
const HeaderCopy = styled.div`min-width:0;`;
const Title = styled.h1`
  margin:0; font-size:clamp(28px, 7vw, 34px); line-height:1.1; font-weight:800; letter-spacing:-.03em;
`;
const Button = styled.button`
  box-sizing: border-box;
  min-height:50px; border: 1px solid var(--km-border); border-radius: 16px; padding: 12px 19px;
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
const SaveButton = styled(Button)`
  background: linear-gradient(135deg, #E8791A 0%, #F5A24B 100%);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 10px 24px var(--km-accent-ring);
`;
const GhostButton = styled(Button)`
  background: transparent;
  border-color: transparent;
  color: var(--km-muted);
  box-shadow: none;
  &:hover:not(:disabled) { background: color-mix(in srgb, var(--km-muted) 12%, transparent); border-color: var(--km-border); }
`;
const Card = styled.section`padding:20px; margin:12px 0; border:1px solid var(--km-border); border-radius:22px; background:var(--km-card); box-shadow:var(--km-shadow);`;
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
const SearchSection = styled.section`
  padding:24px; margin-bottom:30px; border:1px solid var(--km-border); border-radius:24px; background:var(--km-card);
  box-shadow:var(--km-shadow), inset 0 1px 0 rgba(255,255,255,.04);
  > div[style] { min-height:58px !important; margin:0 0 12px !important; padding:10px 16px !important; border-radius:17px !important; background:color-mix(in srgb, var(--km-bg) 62%, var(--km-card)) !important; }
  > div[style]:hover { border-color:color-mix(in srgb, var(--km-accent) 45%, var(--km-border)); }
  textarea { font-size:16px; line-height:1.4; }
  ${Actions} ${Button} { min-height:56px; min-width:220px; box-shadow:0 8px 20px var(--km-accent-ring); }
  ${Actions} ${Button}:disabled { box-shadow:none; }
  @media (max-width:600px) { padding:22px 20px; ${Actions} ${Button} { width:100%; } }
`;
const TechnicalMeta = styled(Meta)`font-size:12px; code { color:var(--km-text); }`;
const SearchHint = styled(Meta)`font-style:italic; font-size:13px; margin:0 0 14px;`;
const DisclosureToggle = styled.button`
  display:inline-flex; align-items:center; gap:6px; margin:10px 0 2px; padding:0; border:none; background:transparent;
  color:var(--km-muted); font:700 12px/1 var(--km-font); cursor:pointer;
  svg:last-child { transition: transform 180ms ease; }
  &:hover { color:var(--km-accent); }
  &:focus-visible { outline:2px solid var(--km-accent); outline-offset:3px; border-radius:4px; }
`;
const PersonalDraftMeta = styled.div`display:grid; gap:10px;`;
const ProgressRow = styled.div`display:flex; justify-content:space-between; gap:12px; color:var(--km-muted); font-size:12px;`;
const ProgressTrack = styled.div`height:6px; overflow:hidden; border-radius:999px; background:var(--km-border);`;
const ProgressFill = styled.div`
  width:${({ $pct }) => Math.max(0, Math.min(100, Number($pct) || 0))}%; height:100%;
  border-radius:inherit; background:var(--km-accent); transition:width 180ms ease;
`;
const FormSectionCard = styled(Card)`padding:22px 22px 20px; border-radius:24px;`;
const FormSectionTitle = styled.h3`margin:0 0 14px; font-size:16.5px; font-weight:800; letter-spacing:-.015em;`;
const FieldRow = styled.div`
  padding:13px 0; border-bottom:1px solid var(--km-border);
  &:last-child { border-bottom:none; }
  ${({ $pending }) => ($pending ? `
    margin:0 -10px; padding-left:10px; padding-right:10px; border-radius:14px;
    background:color-mix(in srgb, var(--km-accent) 5%, transparent);
    box-shadow:inset 3px 0 0 var(--km-accent);
  ` : '')}
`;
const FieldLabel = styled.div`font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--km-muted); margin-bottom:8px;`;
// The right-hand padding leaves room for the clear "×" that sits inside the
// box (see InlineClearButton), the way My Profile's fields do it.
const FieldInput = styled.input`
  width:100%; box-sizing:border-box; background:var(--km-bg); border:1.5px solid var(--km-border); border-radius:14px;
  padding:13px 40px 13px 16px; font:600 15.5px/1.3 var(--km-font); color:var(--km-text); outline:none;
  transition:border-color 150ms ease, box-shadow 150ms ease;
  &:focus { border-color:var(--km-accent); box-shadow:0 0 0 3px var(--km-accent-ring); }
`;
const FieldControls = styled.div`display:grid; gap:8px;`;
const FieldControl = styled.div`display:flex; align-items:center; gap:8px; min-width:0;`;
// Wraps a single input so the "×" can be positioned inside it; the framed
// button next to the wrapper is the "+" that adds another row.
const InputShell = styled.div`position:relative; display:flex; flex:1 1 auto; min-width:0;`;
const InlineClearButton = styled.button`
  position:absolute; top:50%; right:8px; transform:translateY(-50%);
  width:26px; height:26px; display:grid; place-items:center; padding:0;
  border:none; border-radius:50%; background:transparent; color:var(--km-muted); cursor:pointer;
  &:hover:not(:disabled) { color:var(--km-accent); }
  &:focus-visible { outline:2px solid var(--km-accent); outline-offset:2px; }
  &:disabled { opacity:.45; cursor:not-allowed; }
`;
const ACTION_TONES = {
  accept: { color: '#2e9b55', background: 'rgba(46,155,85,.12)' },
  reject: { color: 'var(--km-muted)', background: 'color-mix(in srgb, var(--km-muted) 12%, transparent)' },
  remove: { color: '#d94b4b', background: 'rgba(217,75,75,.12)' },
  restore: { color: 'var(--km-accent)', background: 'var(--km-accent-light)' },
};
const FieldActionButton = styled.button`
  width:40px; height:40px; flex:0 0 40px; display:grid; place-items:center; padding:0;
  border:1px solid var(--km-border); border-radius:12px; background:var(--km-card); cursor:pointer;
  color:${({ $tone }) => (ACTION_TONES[$tone]?.color || 'var(--km-muted)')};
  &:hover:not(:disabled) {
    border-color:currentColor;
    color:${({ $tone }) => (ACTION_TONES[$tone]?.color || 'var(--km-accent)')};
    background:${({ $tone }) => (ACTION_TONES[$tone]?.background || 'var(--km-accent-light)')};
  }
  &:focus-visible { outline:3px solid var(--km-accent-ring); outline-offset:2px; }
  &:disabled { opacity:.45; cursor:not-allowed; }
`;
const AddValueButton = styled(FieldActionButton)`color:var(--km-accent);`;
const FieldTextArea = styled.textarea`
  width:100%; box-sizing:border-box; min-height:90px; background:var(--km-bg); border:1.5px solid var(--km-border); border-radius:14px;
  padding:13px 40px 13px 16px; font:600 15.5px/1.4 var(--km-font); color:var(--km-text); outline:none; resize:vertical;
  transition:border-color 150ms ease, box-shadow 150ms ease;
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
const AuthorLink = styled.button`
  padding:0; border:0; background:none; color:var(--km-accent); font:inherit; text-decoration:underline; cursor:pointer;
`;

// --- Inline change timeline -------------------------------------------------
// Every proposal and every superseded value is rendered inside the
// questionnaire, in the row of the field it belongs to, newest first: the
// value the card holds now, then pending proposals and superseded versions.
// No word labels ("додано" / "видалено") any more: what a proposal is, is said
// by its colour, and what to do with it is said by the two icons next to its
// value - a diskette that saves it into the card and a "×" that deletes the
// edit together with every trace of it in the backend.
const EDIT_TONES = {
  added: { color: '#2e9b55', background: 'rgba(46,155,85,.08)' },
  replaced: { color: '#2e9b55', background: 'rgba(46,155,85,.08)' },
  removed: { color: '#d94b4b', background: 'rgba(217,75,75,.08)' },
};
const toneOf = kind => EDIT_TONES[kind] || EDIT_TONES.added;
const FieldTimeline = styled.div`
  display:grid; width:100%; min-width:0; gap:8px;
  margin:${({ $before }) => ($before ? '0 0 10px' : '10px 0 0')};
`;
const VersionRow = styled.div`
  display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 10px; align-items:center;
  padding:7px 11px; border:1.5px solid ${({ $kind }) => toneOf($kind).color}; border-radius:12px;
  background:${({ $kind }) => toneOf($kind).background}; overflow-wrap:anywhere;
`;
const VersionMeta = styled.div`grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:3px 9px; font-size:11px; color:var(--km-muted);`;
const EditCard = styled.div`
  display:grid; gap:7px; padding:10px 11px; border-radius:14px; overflow-wrap:anywhere;
  border:1.5px solid ${({ $kind }) => toneOf($kind).color};
  background:${({ $kind }) => toneOf($kind).background};
`;
const EditHead = styled.div`display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:11px;`;
const EditWas = styled.span`color:var(--km-muted); font-size:11px; s { opacity:.75; }`;
const EditControl = styled.div`display:flex; align-items:center; gap:8px; min-width:0;`;
const EditValueInput = styled(FieldInput)`
  border-color:${({ $kind }) => toneOf($kind).color};
  background:var(--km-card);
  text-decoration:${({ $kind }) => ($kind === 'removed' ? 'line-through' : 'none')};
`;
const EditMeta = styled.div`display:flex; flex-wrap:wrap; gap:3px 9px; font-size:11px; color:var(--km-muted);`;
const EditHint = styled.div`font-size:11px; font-weight:700; color:var(--km-accent);`;
const DraftHeaderCard = styled(Card)`display:grid; gap:10px; margin:0 0 14px;`;
const DraftBadges = styled.div`display:flex; flex-wrap:wrap; align-items:center; gap:8px;`;
const DraftName = styled.h2`margin:0; font-size:clamp(20px, 5.5vw, 24px); line-height:1.2; overflow-wrap:anywhere;`;
const DraftContacts = styled.div`
  display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; font-size:14px; line-height:1.5;
  color:var(--km-text); a { color:inherit; }
`;

// Two controls per proposal, both icons, both on the right of its value:
//   "×" (inside the box)  - delete the edit and every memo about it, whether it
//                           proposed a new value, a replacement or a removal;
//   💾 (next to the box)  - save it into the draft.
// The box itself stays editable, so correcting the format here and saving
// stores exactly what is in it - "редакція означає, що приймаємо саме
// відредагований формат".
const PendingFieldEdit = ({ row, label, authorName, disabled, onSave, onDelete, onOpenAuthor }) => {
  const [value, setValue] = useState(row.value);
  const isRemoval = row.sourceKind === 'removed' || row.kind === 'removed';

  useEffect(() => setValue(row.value), [row.value]);

  const isEdited = !isRemoval && value.trim() !== row.value;

  return <EditCard $kind={row.kind}>
    {row.previousValue ? <EditHead>
      <EditWas>замість <s>{row.previousValue}</s></EditWas>
    </EditHead> : null}
    <EditControl>
      <InputShell>
        <EditValueInput
          value={value}
          $kind={row.kind}
          readOnly={isRemoval}
          aria-label={`${label}: запропоноване значення`}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            onSave(value);
          }}
        />
        <InlineClearButton
          type="button"
          disabled={disabled}
          title="Видалити правку — не залишиться ні в анкеті, ні в історії"
          aria-label={`Видалити правку: ${label}`}
          onMouseDown={event => event.preventDefault()}
          onClick={onDelete}
        ><FiX size={16} aria-hidden="true" /></InlineClearButton>
      </InputShell>
      <FieldActionButton
        type="button"
        $tone="accept"
        disabled={disabled}
        title={isEdited ? 'Зберегти виправлене значення' : 'Зберегти правку в анкету'}
        aria-label={`Зберегти правку: ${label}`}
        onClick={() => onSave(value)}
      ><FiSave aria-hidden="true" /></FieldActionButton>
    </EditControl>
    <EditMeta>
      {row.editorUserId
        ? <AuthorLink type="button" onClick={onOpenAuthor}>{authorName}</AuthorLink>
        : <span>{authorName}</span>}
      {row.updatedAt ? <span>· {new Date(row.updatedAt).toLocaleString('uk-UA')}</span> : null}
    </EditMeta>
    {isEdited && <EditHint>Буде збережено виправлене значення: {value.trim() || '—'}</EditHint>}
  </EditCard>;
};

export const HistoricalFieldEdit = ({ row, label, authorName, disabled, onRestore, onDelete, onOpenAuthor }) => {
  const [value, setValue] = useState(row.value);
  const currentKind = row.currentKind || row.kind;

  useEffect(() => setValue(row.value), [row.value]);

  return <VersionRow $kind={currentKind} data-testid={`history-value-${row.value}`}>
    <EditControl>
      <InputShell>
        <EditValueInput
          value={value}
          $kind={currentKind}
          aria-label={`${label}: значення з історії`}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            onRestore(value);
          }}
        />
        <InlineClearButton
          type="button"
          disabled={disabled}
          title="Видалити запис з історії"
          aria-label={`Видалити з історії: ${row.value}`}
          onMouseDown={event => event.preventDefault()}
          onClick={onDelete}
        ><FiX size={16} aria-hidden="true" /></InlineClearButton>
      </InputShell>
      <FieldActionButton
        type="button"
        $tone="restore"
        disabled={disabled || !value.trim()}
        title="Зберегти цю редакцію в анкету"
        aria-label={`Зберегти редакцію в анкету: ${row.value}`}
        onClick={() => onRestore(value)}
      ><FiSave aria-hidden="true" /></FieldActionButton>
    </EditControl>
    <VersionMeta>
      <span>{row.at ? new Date(row.at).toLocaleString('uk-UA') : '—'}</span>
      <span>·</span>
      {row.editorUserId
        ? <AuthorLink type="button" onClick={onOpenAuthor}>{authorName}</AuthorLink>
        : <span>{authorName}</span>}
    </VersionMeta>
  </VersionRow>;
};
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

// Deliberately minimal: just enough to identify who this is and how to reach
// them, plus one public note. Everything else pickerFields knows about
// (medical, appearance, lifestyle...) belongs to the full profile, filled in
// later - not to this quick intake form.
const CREATE_FORM_SECTIONS = [
  { key: 'role', title: '🎭 Роль', fields: ['role'] },
  { key: 'personal', title: '👤 ПІБ і дата народження', fields: ['surname', 'name', 'fathersname', 'birth'] },
  { key: 'location', title: '📍 Локація', fields: ['country', 'region', 'city'] },
  { key: 'contacts', title: '📱 Контакти', fields: ['phone', 'email', 'telegram', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'vk'] },
];

// A draft opened by somebody who is neither its author nor an admin. Those
// two write into the draft itself; everyone else contributes through their
// own overlay.
const isSharedDraft = (mutation, viewerUid, isAdmin) => Boolean(
  mutation?.createdBy && viewerUid && mutation.createdBy !== viewerUid && !isAdmin
);

const FORM_FIELD_NAMES = new Set(CREATE_FORM_SECTIONS.flatMap(section => section.fields));

const describeAuthor = (authorId, authors) => {
  const author = authors?.[authorId] || {};
  return [author.name, author.surname].filter(Boolean).join(' ') || authorId || '—';
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
  const [historyAuthors, setHistoryAuthors] = useState({});
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
    // An admin reviews the author's own data with every pending edit shown
    // inline, next to the field it changes - so their form holds the base
    // card. Every other editor keeps working on the stacked card.
    const visible = accessRef.current?.isAdmin ? base : stacked;
    draftRef.current = visible;
    persistedDraftRef.current = visible;
    setDraftOverlays(overlays);
    setDraft(visible);

    // The journal of superseded edits is an admin tool. Other editors see
    // the stacked result only - never who changed a value, nor what it was
    // before them.
    if (!accessRef.current?.isAdmin) {
      setDraftHistory([]);
      return;
    }

    try {
      const [overlayHistory, revisionHistory] = await Promise.all([
        getOverlayHistoryForCard(current.cardId),
        loadProfileMutationHistory(current.cardId),
      ]);
      setDraftHistory([...overlayHistory, ...revisionHistory]
        .sort((a, b) => Number(b.at || 0) - Number(a.at || 0)));
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
    // reserveProfileCardId only allocates a key locally - nothing is written
    // to the backend yet. Without an immediate save below, a draft that is
    // never blurred (the user creates it and navigates away) would vanish
    // completely: it never reaches profileMutations, so it cannot even show
    // up in "Ваші картки" or a later search.
    const mutation = { cardId, revision: 0, status: 'pendingReview', createdBy: uid };
    activeMutationRef.current = mutation;
    setActiveMutation(mutation);
    setOverlayTarget(null);
    const detected = detectSearchParams(search);
    const initialSearchData = PROFILE_SEARCH_PREFILL_FIELDS.has(detected?.key) && detected?.value
      ? { [detected.key]: detected.value }
      : {};
    const nextDraft = { userId: cardId, ...initialSearchData };
    draftRef.current = nextDraft;
    persistedDraftRef.current = nextDraft;
    resetDraftOverlayState(nextDraft);
    setDraft(nextDraft);
    setSearchParams({ cardId });
    persistDraft(nextDraft).catch(error => reportSaveError(error, describeSaveError(error)));
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

  // A search can legitimately match several drafts at once - several people
  // named "Марія", for instance - so every match is offered, not just the
  // first one found.
  const matchingOwnDrafts = useMemo(() => (
    searchExecuted ? findMatchingProfileMutations(mutations, detectSearchParams(search)) : []
  ), [mutations, search, searchExecuted]);

  // The same contact can already sit in a draft somebody else started. That
  // draft is editable by this user too, so offer it instead of letting them
  // create a second card for the same person.
  const matchingSharedDrafts = useMemo(() => (
    searchExecuted ? findMatchingProfileMutations(sharedMutations, detectSearchParams(search)) : []
  ), [search, searchExecuted, sharedMutations]);

  const closeEditor = () => {
    setDraft(null);
    setActiveMutation(null);
    setOverlayTarget(null);
    resetDraftOverlayState(null);
    setSearchParams({});
    // The list cards (name, status, revision, updatedAt) were snapshotted
    // when the workspace loaded and never touched again - saves made while
    // the editor was open only updated the open draft's own refs. Without
    // this, closing the editor leaves the queue showing pre-edit data until
    // a full page reload re-runs the auth effect.
    if (uid && accessRef.current) refresh(uid, accessRef.current);
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

  const safeSaveStageNames = {
    'identity-claim': 'перевірка унікальності',
    'search-id-index': 'індекс ідентифікаторів',
    'search-key-index': 'пошуковий індекс',
    'mutation-transition': 'перехід публікації',
    'publication-update': 'фінальний запис картки',
    'profile-mutation': 'збереження чернетки',
    'identity-claim-or-mutation': 'збереження чернетки',
  };

  const safeSaveTargetNames = {
    'users-card': 'запис users/{cardId}',
    'mutation-status': 'статус profileMutations',
  };

  const safeSaveErrorCode = error => {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toUpperCase();
    if (code.includes('PERMISSION_DENIED') || code.includes('PERMISSION-DENIED')
      || message.includes('PERMISSION_DENIED') || message.includes('PERMISSION DENIED')) {
      return 'PERMISSION_DENIED';
    }
    if (message === 'REVISION_CONFLICT' || message === 'DUPLICATE_PROFILE') return message;
    return '';
  };

  // Only render allow-listed diagnostics. Firebase messages can contain full
  // database paths and submitted contact values, which must stay out of toasts.
  const reportSaveError = (error, fallbackMessage) => {
    console.error('[ProfileCreationWorkspace] save failed', {
      stage: error?.profileSaveStage || 'unknown',
      uid: auth.currentUser?.uid,
      code: error?.code,
      error,
    });
    const detail = safeSaveErrorCode(error);
    const stage = safeSaveStageNames[error?.profileSaveStage] || 'невідомий етап';
    const targets = (error?.profileSaveTargets || [])
      .map(target => safeSaveTargetNames[target])
      .filter(Boolean)
      .join(' + ');
    const recovery = error?.profileSaveRecovered === true
      ? 'Чернетку повернено в режим редагування — можна повторити.'
      : error?.profileSaveRecovered === false
        ? 'Не вдалося автоматично розблокувати чернетку. Оновіть сторінку.'
        : '';
    toast.error(
      <div>
        <div style={{ fontWeight: 700 }}>{fallbackMessage}</div>
        {detail ? <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>{stage}: {detail}</div> : null}
        {targets ? <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Перевірте rules для: {targets}.</div> : null}
        {recovery ? <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>{recovery}</div> : null}
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

      // The author (or an admin) writes into the draft itself. The author sees
      // the stacked card, so saving it verbatim would quietly promote every
      // pending overlay into the draft - only an explicit accept may do that.
      // Persist just the delta this save introduced on top of what was on
      // screen, applied to the author's own data. An admin's form already
      // holds that base data, so it is saved as it is.
      const stacked = stackedDraftRef.current || applyOverlaysToCard(base, overlays);
      const hasPendingOverlays = Object.keys(overlays).length > 0;
      const nextData = hasPendingOverlays && !accessRef.current?.isAdmin
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
    return persistDraft(nextDraft).catch(error => reportSaveError(error, describeSaveError(error)));
  };

  const toFieldValues = value => Array.isArray(value) ? value : [value ?? ''];
  const updateDraftFieldItem = (fieldName, index, value) => {
    const values = toFieldValues(draftRef.current?.[fieldName]);
    values[index] = value;
    const nextDraft = { ...(draftRef.current || {}), [fieldName]: values };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const commitDraftFieldItems = (fieldName, values) => {
    // The form is the source of truth for its current rows. Superseded values
    // belong in the overlay journal, not back in the editor-visible draft.
    const nextValues = values.length ? [...values] : [''];
    return commitFieldValue(fieldName, nextValues);
  };

  // A superseded value from the timeline goes back into the field as an extra
  // row, next to whatever is there now - restoring must never silently drop
  // the current value.
  const purgeFieldVersionEverywhere = async (row, values) => {
    const cardId = activeMutationRef.current?.cardId;
    if (!cardId) return;
    await Promise.all([
      purgeOverlayHistoryEntries({ cardUserId: cardId, fieldName: row.fieldName, values }),
      purgeProfileMutationHistoryValue({ cardId, fieldName: row.fieldName, values }),
    ]);
    const matchedValues = new Set(values.map(value => String(value ?? '').trim()).filter(Boolean));
    setDraftHistory(previous => previous.filter(entry => {
      if (entry.fieldName !== row.fieldName) return true;
      const entryValues = Object.values(buildFieldVersionHistory([entry]))
        .flat()
        .map(version => String(version.value ?? '').trim());
      return !entryValues.some(value => matchedValues.has(value));
    }));
  };

  const restoreFieldVersion = async (row, editedValue = row.value) => {
    const normalizedValue = String(editedValue ?? '').trim();
    if (!normalizedValue) return;
    const values = toFieldValues(draftRef.current?.[row.fieldName])
      .map(value => String(value ?? '').trim())
      .filter(Boolean);
    if (!values.includes(normalizedValue)) {
      await commitDraftFieldItems(row.fieldName, [...values, normalizedValue]);
    }
    await purgeFieldVersionEverywhere(row, [row.value, normalizedValue]);
  };

  const deleteFieldVersion = async row => {
    const current = activeMutationRef.current;
    if (!current?.cardId || !row?.backendEntryId) return;

    setSaving(true);
    try {
      await purgeFieldVersionEverywhere(row, [row.value]);
      toast.success('Значення видалено з усієї історії');
    } catch (error) {
      reportSaveError(error, 'Не вдалося видалити запис з історії');
    } finally {
      setSaving(false);
    }
  };

  const appendDraftFieldItem = fieldName => {
    const values = [...toFieldValues(draftRef.current?.[fieldName]), ''];
    const nextDraft = { ...(draftRef.current || {}), [fieldName]: values };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const clearDraftFieldItem = (fieldName, index) => {
    const currentValues = toFieldValues(draftRef.current?.[fieldName]);
    const values = currentValues.length > 1
      ? currentValues.filter((_, itemIndex) => itemIndex !== index)
      : [''];
    commitDraftFieldItems(fieldName, values);
  };

  const editingSharedDraft = isSharedDraft(activeMutation, uid, access?.isAdmin);

  // --- Admin review of the pending overlays on the open draft ----------------
  // Two decisions per proposed value, and both clear the backend behind them -
  // a settled edit leaves neither a pending overlay nor a journal memo:
  //   зберегти - the value (or the admin's corrected version of it) is applied
  //              to the draft, whether the proposal added, replaced or removed
  //              it, and leaves the queue;
  //   видалити - the proposal is dropped, the draft is untouched.
  const persistDraftData = async (nextData, { skipRevisionHistory = false } = {}) => {
    const current = activeMutationRef.current;
    const saved = await saveCreateProfileMutation({
      cardId: current.cardId,
      creatorUid: current.createdBy || uid,
      actorUid: uid,
      data: nextData,
      expectedRevision: current.revision,
      skipRevisionHistory,
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

  // purgeHistory drops the journal entries about the settled value instead of
  // adding one more - the whole point of the two buttons is that a processed
  // edit stops existing in the backend.
  const settleFieldEdit = (row, { settledChange, remainingChange, historyAction }) => settleOverlayFieldValue({
    editorUserId: row.editorUserId,
    cardUserId: activeMutationRef.current.cardId,
    fieldName: row.fieldName,
    settledChange,
    remainingChange,
    historyAction,
    purgeHistory: true,
  });

  const saveFieldEdit = (row, editedValue, label) => runOverlayReviewAction(
    async () => {
      const { settled, remaining } = splitOverlayChangeValue(row.change, row);
      const acceptedChange = withEditedValue(settled, row, editedValue);
      await persistDraftData(
        applyOverlayToCard(draftBaseRef.current || {}, { [row.fieldName]: acceptedChange }),
        { skipRevisionHistory: true },
      );
      await settleFieldEdit(row, {
        settledChange: acceptedChange,
        remainingChange: remaining,
        historyAction: 'accept',
      });
    },
    `Правку збережено: ${label}`,
    'Не вдалося зберегти правку',
  );

  const deleteFieldEdit = (row, label) => runOverlayReviewAction(
    async () => {
      const { settled, remaining } = splitOverlayChangeValue(row.change, row);
      await settleFieldEdit(row, {
        settledChange: settled,
        remainingChange: remaining,
        historyAction: 'discard',
      });
    },
    `Правку видалено: ${label}`,
    'Не вдалося видалити правку',
  );

  // "Зберегти чернетку" is the one action that turns the accepted base draft
  // into a real users card. Pending editor overlays stay pending: publishing
  // must neither apply nor remove them.
  const saveDraftAsCard = async () => {
    setSaving(true);
    let publishing = false;
    try {
      // Clicking the button blurs the focused field. That blur queues an
      // autosave which increments the revision, so publishing must wait for
      // it and then read the refs updated by that save. Using render-state
      // here produced a false REVISION_CONFLICT against our own autosave.
      await saveQueueRef.current;
      publishing = true;
      const current = activeMutationRef.current;
      await acceptCreateProfileMutation({
        cardId: current.cardId,
        creatorUid: current.createdBy,
        expectedRevision: current.revision,
        // The base contains the author's/admin's accepted data only. The
        // visible stacked draft may also contain unaccepted editor overlays.
        finalData: draftBaseRef.current || current.data,
      });
      toast.success('Чернетку збережено як картку — вона в users і проіндексована');
      closeEditor();
      await refresh(uid, access);
    } catch (error) {
      // acceptCreateProfileMutation labels every expected phase. Keep an
      // allow-listed fallback for an unexpected publication failure too.
      if (publishing && !error.profileSaveStage) error.profileSaveStage = 'publication-update';
      reportSaveError(error, error?.message === 'REVISION_CONFLICT'
        ? 'Автор уже оновив чернетку. Перевірте нову версію.'
        : 'Не вдалося зберегти чернетку як картку');
    } finally { setSaving(false); }
  };

  const fieldsMap = useMemo(() => (
    new Map(pickerFieldsExtended.map(field => [field.name, field]))
  ), []);
  const draftFilledPct = useMemo(() => {
    const filledFields = [...FORM_FIELD_NAMES].filter(fieldName => (
      toFieldValues(draft?.[fieldName]).some(value => String(value ?? '').trim())
    )).length;
    return Math.round((filledFields / FORM_FIELD_NAMES.size) * 100);
  }, [draft]);

  // Every pending proposal and every superseded value, keyed by the field it
  // belongs to, so the questionnaire can render each of them in place instead
  // of collecting them in a list of their own.
  const reviewingAsAdmin = Boolean(access?.isAdmin) && !overlayTarget;
  const pendingFieldEdits = useMemo(() => (
    reviewingAsAdmin ? buildPendingFieldEdits(draftOverlays) : {}
  ), [draftOverlays, reviewingAsAdmin]);
  const fieldVersionHistory = useMemo(() => (
    reviewingAsAdmin ? buildFieldVersionHistory(draftHistory) : {}
  ), [draftHistory, reviewingAsAdmin]);
  const pendingEditsCount = useMemo(() => (
    Object.values(pendingFieldEdits).reduce((total, rows) => total + rows.length, 0)
  ), [pendingFieldEdits]);
  // Edits can touch a field the create questionnaire has no row for. Those get
  // their own section at the end, so no proposal is invisible to the reviewer.
  const extraEditedFields = useMemo(() => Array.from(new Set([
    ...Object.keys(pendingFieldEdits),
    ...Object.keys(fieldVersionHistory),
  ])).filter(fieldName => fieldName && fieldName !== 'userId' && !FORM_FIELD_NAMES.has(fieldName)),
  [fieldVersionHistory, pendingFieldEdits]);

  useEffect(() => {
    if (!access?.isAdmin) {
      setHistoryAuthors({});
      return;
    }
    // Everyone whose name the review shows: the draft's author, whoever has a
    // proposal pending, and whoever appears in the journal.
    const ids = Array.from(new Set([
      activeMutation?.createdBy,
      ...draftHistory.map(entry => entry.editorUserId || entry.actorUserId || entry.createdBy),
      ...Object.keys(draftOverlays),
    ].filter(Boolean)));
    if (!ids.length) {
      setHistoryAuthors({});
      return;
    }
    let active = true;
    fetchUsersByIds(ids).then(users => {
      if (active) setHistoryAuthors(users || {});
    }).catch(error => console.warn('[ProfileCreationWorkspace] history authors unavailable', error));
    return () => { active = false; };
  }, [access?.isAdmin, activeMutation?.createdBy, draftHistory, draftOverlays]);

  const updateDraftField = (fieldName, value) => setDraft(previous => ({ ...(previous || {}), [fieldName]: value }));

  // One chronological tree per field. The current value remains above it; all
  // changes follow newest first, leaving the original value at the bottom.
  const renderFieldTimeline = (fieldName, currentValues, label) => {
    // Keep one field-level fallback timeline below all input controls. Besides
    // keeping the layout vertical, this deliberately avoids dropping array
    // additions, stacked replacements, and option history that cannot be
    // matched to exactly one current input branch.
    const pendingValues = (pendingFieldEdits[fieldName] || []).map(row => row.value);
    const versions = showDraftHistory
      ? dropVersionsPresentIn(fieldVersionHistory[fieldName] || [], [...currentValues, ...pendingValues])
      : [];
    const rows = [
      ...(pendingFieldEdits[fieldName] || []).map(row => ({ ...row, timelineType: 'pending' })),
      ...versions.map(row => ({ ...row, timelineType: 'history' })),
    ].sort((a, b) => Number(b.updatedAt || b.at || 0) - Number(a.updatedAt || a.at || 0));
    if (!rows.length) return null;

    return <FieldTimeline>
      {rows.map(row => row.timelineType === 'pending'
        ? <PendingFieldEdit
          key={`pending-${row.key}`}
          row={row}
          label={label}
          disabled={saving}
          authorName={describeAuthor(row.editorUserId, historyAuthors)}
          onSave={editedValue => saveFieldEdit(row, editedValue, label)}
          onDelete={() => deleteFieldEdit(row, label)}
          onOpenAuthor={() => navigate(`/edit/${row.editorUserId}`)}
        />
        : <HistoricalFieldEdit
          key={`history-${row.key}`}
          row={row}
          label={label}
          authorName={describeAuthor(row.editorUserId, historyAuthors)}
          disabled={saving}
          onRestore={value => restoreFieldVersion(row, value)}
          onDelete={() => deleteFieldVersion(row)}
          onOpenAuthor={() => navigate(`/edit/${row.editorUserId}`)}
        />)}
    </FieldTimeline>;
  };

  const renderCreateField = (fieldName, { allowUnknown = false } = {}) => {
    // A field with edits but no entry in the create catalogue still has to be
    // reviewable, so those fall back to a plain text row named after the field.
    const field = fieldsMap.get(fieldName) || (allowUnknown ? { name: fieldName } : null);
    if (!field) return null;
    const value = draft?.[fieldName] || '';
    const isTextArea = fieldName === 'moreInfo_main' || fieldName === 'publicComment';
    const label = getFieldLabel(field) || fieldName;
    const currentValues = toFieldValues(value).map(item => String(item ?? '').trim()).filter(Boolean);

    return <FieldRow key={fieldName} $pending={Boolean(pendingFieldEdits[fieldName]?.length)}>
      <FieldLabel>{label}</FieldLabel>
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
            <InputShell>
              <FieldTextArea
                value={item}
                placeholder={getFieldPlaceholder(field)}
                onChange={e => updateDraftFieldItem(fieldName, index, e.target.value)}
                onBlur={() => commitDraftFieldItems(fieldName, toFieldValues(draftRef.current?.[fieldName]))}
              />
              <InlineClearButton type="button" aria-label={`Очистити ${getFieldLabel(field)}`} title="Очистити рядок" onMouseDown={e => e.preventDefault()} onClick={() => clearDraftFieldItem(fieldName, index)}><FiX size={16} aria-hidden="true" /></InlineClearButton>
            </InputShell>
            <AddValueButton type="button" aria-label={`Додати ще одне значення: ${getFieldLabel(field)}`} title="Додати ще один рядок" onClick={() => appendDraftFieldItem(fieldName)}><FiPlus aria-hidden="true" /></AddValueButton>
          </FieldControl>)}
        </FieldControls>
      ) : (
        <FieldControls>
          {toFieldValues(value).map((item, index) => <FieldControl key={`${fieldName}-${index}`}>
            <InputShell>
              <FieldInput
                value={item}
                placeholder={getFieldPlaceholder(field)}
                onChange={e => updateDraftFieldItem(fieldName, index, e.target.value)}
                onBlur={() => commitDraftFieldItems(fieldName, toFieldValues(draftRef.current?.[fieldName]))}
              />
              <InlineClearButton type="button" aria-label={`Очистити ${getFieldLabel(field)}`} title="Очистити рядок" onMouseDown={e => e.preventDefault()} onClick={() => clearDraftFieldItem(fieldName, index)}><FiX size={16} aria-hidden="true" /></InlineClearButton>
            </InputShell>
            <AddValueButton type="button" aria-label={`Додати ще одне значення: ${getFieldLabel(field)}`} title="Додати ще один рядок" onClick={() => appendDraftFieldItem(fieldName)}><FiPlus aria-hidden="true" /></AddValueButton>
          </FieldControl>)}
        </FieldControls>
      )}
      {renderFieldTimeline(fieldName, currentValues, label)}
    </FieldRow>;
  };

  const draftName = useMemo(() => (
    [draft?.surname, draft?.name, draft?.fathersname]
      .flatMap(value => toFieldValues(value))
      .map(value => String(value ?? '').trim())
      .filter(Boolean)
      .join(' ') || 'Новий профіль'
  ), [draft]);
  const draftRole = draft?.role || draft?.userRole || '';

  const heading = useMemo(() => access?.isAdmin ? 'Нові профілі' : 'Шукаємо профіль', [access]);
  if (!access) return <Page><Shell>Завантаження…</Shell></Page>;

  return <Page><Shell>
    <Header>
      <HeaderCopy><Title>{heading}</Title></HeaderCopy>
      <PageNavMenu />
    </Header>
    {draft ? <>
      <DraftHeaderCard>
        <DraftBadges>
          {!overlayTarget && <Status $variant={editingSharedDraft ? 'overlay' : activeMutation.status === 'private' ? 'private' : 'pending'}>
            {editingSharedDraft ? 'Спільна чернетка' : activeMutation.status === 'private' ? 'Приватний' : 'Очікує підтвердження'}
          </Status>}
          {draftRole && <Status $variant="private">{draftRole}</Status>}
          {reviewingAsAdmin && pendingEditsCount > 0 && <Status $variant="overlay">{pendingEditsCount} непідтверджених правок</Status>}
        </DraftBadges>
        {!overlayTarget && <DraftName>{draftName}</DraftName>}
        {!overlayTarget && access.isAdmin && <>
          <TechnicalMeta>
            cardId: <code>{activeMutation.cardId}</code> · revision: {activeMutation.revision || 0}
            {activeMutation.updatedAt ? ` · оновлено ${new Date(activeMutation.updatedAt).toLocaleString('uk-UA')}` : ''}
          </TechnicalMeta>
          {activeMutation.createdBy && <TechnicalMeta>
            Автор:{' '}
            <AuthorLink type="button" onClick={() => navigate(`/edit/${activeMutation.createdBy}`)}>
              {describeAuthor(activeMutation.createdBy, historyAuthors)}
            </AuthorLink>
          </TechnicalMeta>}
          <DraftContacts>{fieldContacts(draft)}</DraftContacts>
        </>}
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
          {!editingSharedDraft && activeMutation.updatedAt && <PersonalDraftMeta>
            <FieldLabel>Публічний коментар</FieldLabel>
            <FieldTextArea
              value={draft?.publicComment || ''}
              placeholder="будьте толерантні"
              onChange={e => updateDraftField('publicComment', e.target.value)}
              onBlur={e => commitFieldValue('publicComment', e.target.value)}
            />
          </PersonalDraftMeta>}
        </>}
      </DraftHeaderCard>
      {reviewingAsAdmin && (pendingEditsCount > 0 || draftHistory.length > 0) && <ReviewCard>
        <SectionHeader>
          <span>Правки редакторів</span>
          <Count aria-label={`${pendingEditsCount} правок`}>{pendingEditsCount}</Count>
        </SectionHeader>
        <Meta>{pendingEditsCount === 0
          ? 'Немає непідтверджених правок — усі зміни вже опрацьовано.'
          : 'Кожну зміну показано біля її поля: актуальне значення розташоване вгорі, а попередні — нижче, від найновішого до оригінального. Неприйняті зміни не потраплять у профіль і залишаться в черзі.'}</Meta>
        <DisclosureToggle
          type="button"
          aria-expanded={showDraftHistory}
          onClick={() => setShowDraftHistory(previous => !previous)}
        >
          <FiClock aria-hidden="true" /> Історія правок ({draftHistory.length})
          <FiChevronDown aria-hidden="true" style={{ transform: showDraftHistory ? 'rotate(180deg)' : 'none' }} />
        </DisclosureToggle>
        {showDraftHistory && <Meta>
          {draftHistory.length === 0
            ? 'Історія порожня.'
            : 'Для кожного поля показано окреме дерево: актуальне значення вгорі, оригінальне — внизу.'}
        </Meta>}
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
          {section.fields.map(fieldName => renderCreateField(fieldName))}
        </FormSectionCard>
      ))}
      {extraEditedFields.length > 0 && <FormSectionCard>
        <FormSectionTitle>🗂 Інші поля з правками</FormSectionTitle>
        {extraEditedFields.map(fieldName => renderCreateField(fieldName, { allowUnknown: true }))}
      </FormSectionCard>}
      {/* Every field already saves itself on blur, so the old Зберегти /
          Прийняти / Відхилити row said nothing about what actually happened.
          What is left is the one step that is not automatic: turning the
          finished draft into a card. */}
      <Card>
        <Actions>
          {!overlayTarget && access.isAdmin && activeMutation.revision > 0 && (
            <SaveButton disabled={saving} onClick={saveDraftAsCard}>
              {saving ? 'Збереження…' : 'Зберегти чернетку'}
            </SaveButton>
          )}
          <GhostButton disabled={saving} onClick={closeEditor}>Закрити</GhostButton>
        </Actions>
      </Card>
    </> : <>
      {!access.isAdmin && <SearchSection aria-label="Пошук профілю">
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
          onSearchExecuted={value => {
            setSearchExecuted(true);
            setSearchFailed(false);
            addMatchingSearchQuery(value);
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
        <SearchHint>
          Шукайте за ім’ям, прізвищем, телефоном, email або посиланням на соцмережі — Telegram, Instagram, Facebook, TikTok, VK та інші.
        </SearchHint>
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
          ))}. Шукає одразу серед опублікованих карток (searchId) і серед чернеток, які ще не прийняв адміністратор.
        </TechnicalMeta>}
        {searchResults.map(profile => <SearchResult key={profile.userId}>
          <span><strong>{[profile.name, profile.surname].filter(Boolean).join(' ') || 'Профіль знайдено'}</strong><Meta>{profile.userId}</Meta></span>
          <span>
            <Status>Вже існує</Status>
            <Button onClick={() => startExistingProfileOverlay(profile)}>Додати власні дані</Button>
          </span>
        </SearchResult>)}
        {matchingOwnDrafts.map(mutation => <SearchResult key={mutation.cardId}>
          <span>
            <strong>{[mutation.data?.name, mutation.data?.surname].filter(Boolean).join(' ') || 'Ваша чернетка'}</strong>
            <Meta>Цей контакт уже є у вашій картці, що очікує перевірки.</Meta>
          </span>
          <Button onClick={() => openMutation(mutation)}>Відкрити чернетку</Button>
        </SearchResult>)}
        {matchingSharedDrafts.map(mutation => <SearchResult key={mutation.cardId}>
          <span>
            <strong>{[mutation.data?.name, mutation.data?.surname].filter(Boolean).join(' ') || 'Спільна чернетка'}</strong>
            <Meta>Цей контакт уже є у спільній чернетці. Відкрийте її та додайте свої правки.</Meta>
          </span>
          <Button onClick={() => openMutation(mutation)}>Відкрити чернетку</Button>
        </SearchResult>)}
        {searchExecuted && searchNotFound && matchingOwnDrafts.length === 0 && matchingSharedDrafts.length === 0 && <Meta>Профіль не знайдено. Можна створити нову приватну картку.</Meta>}
        {searchExecuted && searchFailed && <Meta>Не вдалося виконати пошук. Спробуйте ще раз.</Meta>}
        <Actions>
          <Button
            $primary
            disabled={!search.trim() || !searchExecuted || !searchNotFound || searchFailed || searchResults.length > 0 || matchingOwnDrafts.length > 0 || matchingSharedDrafts.length > 0}
            onClick={startNew}
          >
            <FiPlus size={20} aria-hidden="true" /> Додати профіль
          </Button>
        </Actions>
      </SearchSection>}
      {access.isAdmin && <>
        <SectionHeader>
          <span>Черга на перевірку</span>
          <Count aria-label={`${mutations.length} карток`}>{mutations.length}</Count>
        </SectionHeader>
        {mutations.length === 0 && <EmptyState>
          <EmptyIcon><FiFolder aria-hidden="true" /></EmptyIcon>
          <EmptyTitle>Нових профілів поки немає.</EmptyTitle>
          <Meta>Нові картки від користувачів з’являться тут.</Meta>
        </EmptyState>}
        {mutations.map(mutation => <ProfileCard key={mutation.cardId}>
          <div>
            <Status $variant={mutation.status === 'private' ? 'private' : 'pending'}>
              {mutation.status === 'private' ? 'Приватний' : 'Очікує підтвердження'}
            </Status>
            <h2>{[mutation.data?.name, mutation.data?.surname].filter(Boolean).join(' ') || 'Новий профіль'}</h2>
            <Meta>Автор: {mutation.createdBy}</Meta>
            <Meta>
              Оновлено: {mutation.updatedAt ? new Date(mutation.updatedAt).toLocaleString('uk-UA') : '—'} · revision {mutation.revision}
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
    </>}
  </Shell></Page>;
};

export default ProfileCreationWorkspace;
