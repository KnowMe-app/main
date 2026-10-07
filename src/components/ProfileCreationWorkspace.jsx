import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { FiChevronDown, FiClock, FiFolder, FiPlus, FiSave, FiSearch, FiUsers, FiX } from 'react-icons/fi';
import { FaHeart, FaRegHeart, FaTimes, FaUndoAlt } from 'react-icons/fa';

import {
  addMatchingSearchQuery,
  addPublicProfileComment,
  auth,
  deletePublicProfileComment,
  fetchDislikeUsers,
  fetchFavoriteUsers,
  fetchPublicProfileComments,
  fetchUserById,
  fetchUserComments,
  fetchUsersByIds,
  readProfileFromNodes,
  searchUsersOnly,
  updatePublicProfileComment,
} from './config';
import { getFieldLabel, getFieldPlaceholder, getOptionLabel, getOptionValue, pickerFields } from './formFields';
import { listOfferedOptions } from '../utils/offeredOptions';
// Сірі «Україна», «Київська», «Київ» у порожніх полях чернетки читались як
// уже введене — приклад підписується прикладом, як у «Моєму профілі».
import { asExamplePlaceholder } from '../utils/examplePlaceholder';
import SearchBar, { detectSearchParams } from './SearchBar';
import { getCurrentValue, hasCurrentValue } from './getCurrentValue';
import { hasFilledProfileDraftData } from '../utils/profileDraftContent';
import { CONTACT_FIELDS, isHiddenTelegramValue } from './contactMethods';
import { listProfileRoles } from '../utils/matchingPeerVisibility';
import { fieldAcceptsMultipleValues } from 'utils/profileFieldRows';
import { usePrimaryNavigationSlot } from './PrimaryNavigationSlot';
import InfoModal, {
  ModalActionRow,
  ModalDangerButton,
  ModalGhostButton,
  ModalText,
  ModalTitle,
} from './InfoModal';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import ProfileRow, { PublicCommentBlock, ReviewsStateNote, describeReviewsState } from './ProfileRow';
import { MatchingThemeScope, NoteClearButton, NoteFieldRow, NoteLane, NoteLaneHead, NoteLanes } from './Matching.styled';
import { NOTE_TEXT_LINE_HEIGHT, NOTE_TEXT_SIZE } from './noteTypography';
import { useAutoResize } from '../hooks/useAutoResize';
import { profileUiText } from 'utils/profileTexts';
import { useAppSettings } from '../hooks/useAppSettings';
import { uiText } from 'utils/uiTranslations';
import { formatDateTime } from 'utils/formatDateTime';
import { FieldComment } from './smallCard/FieldComment';
import { formatDate, formatDateToDisplay, formatDateToServer } from './inputValidations';
import { PROFILE_DATE_FIELDS } from '../utils/profileDate';
import { toggleFavoriteUser } from './smallCard/btnFavorite';
import { toggleDislikeUser } from './smallCard/btnDislike';
import { resolveAccess } from 'utils/accessLevel';
import { getSearchIdIndexedFields } from 'utils/searchKeyUtils';
import { findMatchingProfileMutations } from 'utils/profileCreationSearch';
import { buildMatchingSearchPath, MATCHING_PATH, readStoredMatchingSearchQuery } from 'utils/matchingSearchLocation';
import { canGoBackInHistory, goBackOrTo } from 'utils/appBackNavigation';
import { getProfileAge, getProfileLocation, getProfilePhotos, getProfileRole, getRoleCode, getRoleLabel } from './profileLayoutConfig';
import { normalizeProfileFieldInput } from '../utils/profileNormalization';
import {
  applyOverlayToCard,
  applyOverlaysToCard,
  getStackedCardViews,
  buildOverlayFromDraft,
  getOverlayHistoryForCard,
  getOverlaysForCard,
  purgeOverlayHistoryEntries,
  clearCardOverlays,
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
  deleteCreateProfileMutation,
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
  padding: 16px 20px max(80px, env(safe-area-inset-bottom));
  /* На телефоні бічний відступ — як у стрічці пошуку (10 px): з 20 px
     картки й форма тут ставали вужчими за ті самі картки в стрічці. */
  @media (max-width: 600px) { padding-left: 10px; padding-right: 10px; }
  background: var(--km-bg);
  color: var(--km-text);
  font-family: var(--km-font);
  box-sizing: border-box;
`;
const Shell = styled.div`max-width: 920px; margin: 0 auto;`;
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
// Видалення чернетки стоїть поруч зі збереженням, але тоном сказано, що воно
// незворотне: «зберегти» робить із чернетки картку, «видалити» зносить її з
// усіх колекцій та індексів, і сплутати їх не можна.
const DeleteDraftButton = styled(Button)`
  border-color: var(--km-danger-border);
  background: var(--km-danger-bg);
  color: var(--km-danger);

  &:hover:not(:disabled) { border-color: var(--km-danger); }
  &:focus-visible { outline-color: rgba(180, 35, 24, 0.24); border-color: var(--km-danger); }
`;
// «Закрити» внизу форми не стало: вихід — це жест «назад», а не кнопка серед
// дій анкети. Доти їх було два з різним наслідком — кнопка вела до видачі
// пошуку, апаратна кнопка телефона поверталась на порожній екран майстерні.
// Тепер обидва знімають один і той самий запис історії (`goBackOrTo`), а
// стрілка в шапці — це рівно той візуал, що вже стоїть у шарі деталей стрічки.
// Картка — та сама, що в «Моєму профілі» (\`Card\` там): без рамки, з тінню й
// радіусом \`--km-radius\`, 16 px між картками.
const Card = styled.section`padding:18px; margin:0 0 16px; border:0; border-radius:var(--km-radius); background:var(--km-card); box-shadow:var(--km-shadow);`;
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
// Екран питає рівно одне — чи є вже така людина, — тож на ньому стоїть рядок
// пошуку й один рядок пояснення. Технічні деталі («пошук виконується за
// ключами…»), памʼятки про чернетки й три різні підказки під кнопкою жили тут
// раніше: разом вони з'їдали перший екран, а відповідали на питання, якого
// читач не ставив.
const SearchSection = styled.section`
  padding:20px; margin-bottom:18px; border:1px solid var(--km-border); border-radius:24px; background:var(--km-card);
  box-shadow:var(--km-shadow), inset 0 1px 0 rgba(255,255,255,.04);
  > div[style] { min-height:58px !important; margin:0 !important; padding:10px 16px !important; border-radius:17px !important; background:color-mix(in srgb, var(--km-bg) 62%, var(--km-card)) !important; }
  > div[style]:hover { border-color:color-mix(in srgb, var(--km-accent) 45%, var(--km-border)); }
  textarea { font-size:16px; line-height:1.4; }
  @media (max-width:600px) { padding:18px 16px; }
`;
const TechnicalMeta = styled(Meta)`font-size:12px; code { color:var(--km-text); }`;
const SearchHint = styled(Meta)`font-size:13px; margin:12px 2px 0;`;

// --- Видача пошуку ---------------------------------------------------------
// Розкладка та сама, що й у стрічці: спершу заготовка нової картки з набраного,
// далі знайдені картки й чернетки. Читач приходить сюди тим самим жестом і
// дістає ту саму відповідь, лише на екрані власних карток.
const QueryDraftCard = styled.div`
  display:flex; align-items:center; gap:10px; margin:0 0 10px; padding:12px 14px; box-sizing:border-box;
  border:1px dashed color-mix(in srgb, var(--km-accent) 55%, transparent); border-radius:16px; background:var(--km-card);
`;
const QueryDraftBody = styled.div`flex:1 1 auto; min-width:0; display:grid; gap:2px;`;
const QueryDraftLabel = styled.span`font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--km-muted);`;
const QueryDraftValue = styled.span`font-size:15px; font-weight:700; line-height:1.3; color:var(--km-text); overflow-wrap:anywhere;`;
const QueryDraftNote = styled.span`font-size:12px; line-height:1.4; color:var(--km-muted);`;
const QueryDraftButton = styled.button`
  flex:0 0 auto; display:inline-flex; align-items:center; gap:6px; min-height:36px; padding:7px 14px;
  border:1px solid var(--km-accent); border-radius:12px; background:transparent; color:var(--km-accent);
  font:700 13px/1 var(--km-font); white-space:nowrap; cursor:pointer;
  &:hover:not(:disabled) { background:var(--km-accent-light); }
  &:focus-visible { outline:2px solid var(--km-accent); outline-offset:2px; }
  &:disabled { opacity:.45; cursor:not-allowed; }
`;
// Рядок видачі — картка людини: ініціал, імʼя, факти про неї й одна дія.
const ResultCard = styled.div`
  display:flex; align-items:center; gap:12px; margin:0 0 10px; padding:12px 14px; box-sizing:border-box;
  border:1px solid var(--km-border); border-radius:16px; background:var(--km-card);
  @media (max-width:400px) { flex-wrap:wrap; > button { width:100%; } }
`;
const ResultAvatar = styled.span`
  width:42px; height:42px; flex:0 0 42px; display:grid; place-items:center; border-radius:14px; overflow:hidden;
  background:var(--km-accent-light); color:var(--km-accent); font:800 17px/1 var(--km-font);
  img { width:100%; height:100%; object-fit:cover; }
`;
const ResultBody = styled.div`flex:1 1 auto; min-width:0; display:grid; gap:3px;`;
const ResultName = styled.span`font-size:15.5px; font-weight:700; line-height:1.3; color:var(--km-text); overflow-wrap:anywhere;`;
const ResultMeta = styled.span`font-size:12.5px; line-height:1.4; color:var(--km-muted); overflow-wrap:anywhere;`;
const ResultAction = styled(QueryDraftButton)`border-color:var(--km-border); color:var(--km-text);
  &:hover:not(:disabled) { border-color:var(--km-accent); color:var(--km-accent); }
`;
const ResultsSection = styled.section`margin-bottom:26px;`;
const DisclosureToggle = styled.button`
  display:inline-flex; align-items:center; gap:6px; margin:10px 0 2px; padding:0; border:none; background:transparent;
  color:var(--km-muted); font:700 12px/1 var(--km-font); cursor:pointer;
  svg:last-child { transition: transform 180ms ease; }
  &:hover { color:var(--km-accent); }
  &:focus-visible { outline:2px solid var(--km-accent); outline-offset:3px; border-radius:4px; }
`;
/*
 * Секції форми — ті самі, що в «Моєму профілі»: картка без рамки з тінню й
 * радіусом \`--km-radius\`, заголовок смугою на тлі сторінки з рискою під нею,
 * поля з відступом 18 px. Тут стояли свої числа (відступ 22 px, радіус 24 px,
 * заголовок 16.5 px жирністю 800, жирний текст у полях), і форма доповнення
 * виглядала окремо скопійованим екраном, а не частиною застосунку.
 */
const FormSectionCard = styled(Card)`
  padding:0 18px; border:0; border-radius:var(--km-radius); overflow:hidden; margin:0 0 16px;
`;
const FormSectionTitle = styled.h3`
  margin:0 -18px; padding:14px 18px; border-bottom:1px solid var(--km-border); background:var(--km-bg);
  font-size:14px; font-weight:600; line-height:1.3; letter-spacing:0;
`;
const FieldRow = styled.div`
  padding:14px 0; border-bottom:1px solid var(--km-border);
  &:last-child { border-bottom:none; }
  /* Поле всередині доріжки нотатки: підпис уже стоїть над ним, і власного
     відступу воно не додає — інакше два сусідні порожні поля стояли б на
     різній висоті від своїх підписів. */
  ${({ $bare }) => ($bare ? 'padding:0; border-bottom:none;' : '')}
  ${({ $pending }) => ($pending ? `
    margin:0 -10px; padding-left:10px; padding-right:10px; border-radius:14px;
    background:color-mix(in srgb, var(--km-accent) 5%, transparent);
    box-shadow:inset 3px 0 0 var(--km-accent);
  ` : '')}
`;
const FieldLabel = styled.div`font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:var(--km-muted); margin-bottom:6px;`;
// The right-hand padding leaves room for the clear "×" that sits inside the
// box (see InlineClearButton), the way My Profile's fields do it.
const FieldInput = styled.input`
  width:100%; box-sizing:border-box; background:var(--km-bg); border:1.5px solid var(--km-border); border-radius:10px;
  padding:10px 38px 10px 14px; font:400 16px/1.3 var(--km-font); color:var(--km-text); outline:none;
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
  width:42px; height:42px; flex:0 0 42px; display:grid; place-items:center; padding:0;
  border:1px solid var(--km-border); border-radius:10px; background:var(--km-card); cursor:pointer;
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
  width:100%; box-sizing:border-box; min-height:90px; background:var(--km-bg); border:1.5px solid var(--km-border); border-radius:10px;
  padding:10px 38px 10px 14px; font:400 16px/1.4 var(--km-font); color:var(--km-text); outline:none; resize:vertical;
  transition:border-color 150ms ease, box-shadow 150ms ease;
  &:focus { border-color:var(--km-accent); box-shadow:0 0 0 3px var(--km-accent-ring); }
`;
const FieldChipRow = styled.div`display:flex; flex-wrap:wrap; gap:6px;`;
const FieldChip = styled.button`
  padding:6px 13px; border-radius:99px; font-size:13px; font-weight:400; cursor:pointer;
  border:1.5px solid ${({ $selected }) => ($selected ? 'var(--km-accent)' : 'var(--km-border)')};
  background: ${({ $selected }) => ($selected ? 'var(--km-accent-light)' : 'var(--km-card)')};
  color: ${({ $selected }) => ($selected ? 'var(--km-accent)' : 'var(--km-muted)')};
`;
const NotesCard = styled(Card)`display:grid; gap:10px;`;
/*
 * Обидві доріжки нотаток — текст без рамки поля, як у стрічці й у відкритій
 * картці.
 *
 * Приватну памʼятку малює чужий компонент (`FieldComment`) з голою
 * `textarea`, а публічний відгук нової чернетки — поле форми. Раніше ця
 * оболонка приводила обидва до вигляду сусідніх інпутів (заокруглена
 * заливка, рамка), і пара нотаток у формі виглядала інакше, ніж та сама пара
 * в стрічці: там це просто набраний текст. Тепер навпаки — поле знімає з
 * себе все, крім тексту й плейсхолдера.
 */
const NoteFieldShell = styled.div`
  textarea {
    display:block; width:100%; box-sizing:border-box; min-height:0;
    margin:0; padding:2px 0 4px; border:0; border-radius:0; background:transparent;
    font:inherit; font-size:${NOTE_TEXT_SIZE}; line-height:${NOTE_TEXT_LINE_HEIGHT}; color:var(--km-text);
    outline:none; resize:none; overflow:hidden;
  }
  textarea::placeholder { color:var(--km-muted); opacity:.75; }
`;
/*
 * Публічний відгук нової чернетки — те саме голе поле, що й памʼятка під ним.
 * Картки ще немає, тож і підписаних відгуків під нею бути не може: відгук тут
 * — це поле анкети `publicComment`, і хрестик знімає саме його.
 */
const PlainNoteField = ({ value, placeholder, onChange, onBlur, onClear, clearLabel }) => {
  const ref = useRef(null);
  const autoResize = useAutoResize(ref, value);
  return <NoteFieldRow>
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={event => {
        onChange(event.target.value);
        autoResize(event.target);
      }}
      onBlur={onBlur}
    />
    {value && <NoteClearButton type="button" aria-label={clearLabel} title={clearLabel} onMouseDown={event => event.preventDefault()} onClick={onClear}>×</NoteClearButton>}
  </NoteFieldRow>;
};
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
/*
 * Угорі форми — та сама картка стрічки, що й угорі «Мого профілю»
 * (`ProfileRow` з `preview`): фото на всю ширину, імʼя, смуга показників,
 * факти й рядок контактів.
 *
 * Тут була своя шапка — аватар 56 px і імʼя шрифтом 20–24 px, — і на телефоні
 * «Рога Надія Сергіївна, 33» розсипалось на три рядки, а сама шапка виглядала
 * незалежною копією, а не тією карткою, яку читач щойно бачив у стрічці. Та
 * сама картка знімає обидві біди: вона вже вміщає імʼя в рядок і вже однакова
 * скрізь. Палітру стрічки поза нею оголошує `MatchingThemeScope`.
 */
const DraftPreview = styled(MatchingThemeScope)`
  max-width:460px; margin:0 auto 16px; border-radius:18px;
`;

// Two controls per proposal, both icons, both on the right of its value:
//   "×" (inside the box)  - delete the edit and every memo about it, whether it
//                           proposed a new value, a replacement or a removal;
//   💾 (next to the box)  - save it into the draft.
// The box itself stays editable, so correcting the format here and saving
// stores exactly what is in it - "редакція означає, що приймаємо саме
// відредагований формат".
const PendingFieldEdit = ({ row, label, authorName, disabled, onSave, onDelete, onOpenAuthor }) => {
  const { language } = useAppSettings();
  const [value, setValue] = useState(row.value);
  const isRemoval = row.sourceKind === 'removed' || row.kind === 'removed';

  useEffect(() => setValue(row.value), [row.value]);

  const isEdited = !isRemoval && value.trim() !== row.value;

  return <EditCard $kind={row.kind}>
    {row.previousValue ? <EditHead>
      <EditWas>{uiText('замість', language)} <s>{row.previousValue}</s></EditWas>
    </EditHead> : null}
    <EditControl>
      <InputShell>
        <EditValueInput
          value={value}
          $kind={row.kind}
          readOnly={isRemoval}
          aria-label={uiText('{label}: запропоноване значення', language, { label })}
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
          title={uiText('Видалити правку — не залишиться ні в анкеті, ні в історії', language)}
          aria-label={uiText('Видалити правку: {label}', language, { label })}
          onMouseDown={event => event.preventDefault()}
          onClick={onDelete}
        ><FiX size={16} aria-hidden="true" /></InlineClearButton>
      </InputShell>
      <FieldActionButton
        type="button"
        $tone="accept"
        disabled={disabled}
        title={uiText(isEdited ? 'Зберегти виправлене значення' : 'Зберегти правку в анкету', language)}
        aria-label={uiText('Зберегти правку: {label}', language, { label })}
        onClick={() => onSave(value)}
      ><FiSave aria-hidden="true" /></FieldActionButton>
    </EditControl>
    <EditMeta>
      {row.editorUserId
        ? <AuthorLink type="button" onClick={onOpenAuthor}>{authorName}</AuthorLink>
        : <span>{authorName}</span>}
      {row.updatedAt ? <span>· {formatDateTime(row.updatedAt, language)}</span> : null}
    </EditMeta>
    {isEdited && <EditHint>{uiText('Буде збережено виправлене значення: {value}', language, { value: value.trim() || '—' })}</EditHint>}
  </EditCard>;
};

export const HistoricalFieldEdit = ({ row, label, authorName, disabled, onRestore, onDelete, onOpenAuthor }) => {
  const { language } = useAppSettings();
  const [value, setValue] = useState(row.value);
  const currentKind = row.currentKind || row.kind;

  useEffect(() => setValue(row.value), [row.value]);

  return <VersionRow $kind={currentKind} data-testid={`history-value-${row.value}`}>
    <EditControl>
      <InputShell>
        <EditValueInput
          value={value}
          $kind={currentKind}
          aria-label={uiText('{label}: значення з історії', language, { label })}
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
          title={uiText('Видалити запис з історії', language)}
          aria-label={uiText('Видалити з історії: {value}', language, { value: row.value })}
          onMouseDown={event => event.preventDefault()}
          onClick={onDelete}
        ><FiX size={16} aria-hidden="true" /></InlineClearButton>
      </InputShell>
      <FieldActionButton
        type="button"
        $tone="restore"
        disabled={disabled || !value.trim()}
        title={uiText('Зберегти цю редакцію в анкету', language)}
        aria-label={uiText('Зберегти редакцію в анкету: {value}', language, { value: row.value })}
        onClick={() => onRestore(value)}
      ><FiSave aria-hidden="true" /></FieldActionButton>
    </EditControl>
    <VersionMeta>
      <span>{row.at ? formatDateTime(row.at, language) : '—'}</span>
      <span>·</span>
      {row.editorUserId
        ? <AuthorLink type="button" onClick={onOpenAuthor}>{authorName}</AuthorLink>
        : <span>{authorName}</span>}
    </VersionMeta>
  </VersionRow>;
};
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
// Перелік ключів більше не показується на екрані — читачеві він нічого не
// пояснював, — але пошук і далі ходить рівно по них.
const PROFILE_SEARCH_OPTIONS = { searchIdPrefixes: PROFILE_SEARCH_ID_PREFIXES };
// Той самий такт, що й у стрічці: видача приїжджає сама, за мить після того,
// як набирати перестали. Без цього рядок чекав на Enter або вихід із поля —
// і екран мовчав у відповідь на набране, хоч поруч у стрічці той самий рядок
// відповідав одразу.
const PROFILE_SEARCH_DEBOUNCE_MS = 250;

// Deliberately minimal: just enough to identify who this is and how to reach
// them, plus one public note. Everything else pickerFields knows about
// (medical, appearance, lifestyle...) belongs to the full profile, filled in
// later - not to this quick intake form.
// По батькові — у спільному `pickerFields` його немає (лише в адмінському
// `pickerFieldsExtended`, малими літерами), тож форма має власний опис поля.
const PATRONYMIC_FIELD = { name: 'fathersname', label: 'По батькові', ukrainian: 'По батькові', placeholder: 'Олександрівна', svg: 'no' };

const CREATE_FORM_SECTIONS = [
  { key: 'personal', title: '👤 ПІБ і дата народження', fields: ['surname', 'name', 'fathersname', 'birth'] },
  { key: 'location', title: '📍 Локація', fields: ['country', 'region', 'city'] },
  // VK тут немає: мережа заблокована в Україні з 2017 року, і поле для неї у
  // формі читалось як знак, чий це застосунок. Уже записані значення лишаються
  // в картці й знаходяться пошуком — прибрано саме запрошення їх вводити.
  { key: 'contacts', title: '📱 Контакти', fields: ['phone', 'email', 'telegram', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube'] },
  { key: 'comment', title: '💬 Публічний коментар', fields: ['publicComment'] },
];

/**
 * Канал звʼязку, який у картці є, а рядка в анкеті не має.
 *
 * Верхній блок показує **всі** контакти картки, а форма — лише перелічені
 * вище, тож збережений Viber (чи будь-який інший канал поза списком) було
 * видно вгорі й ніде не можна було виправити: контакт наче є, а поля для
 * нього немає. Такі канали дописуються в кінець блока контактів — по рядку на
 * той, що в цій картці справді заповнений.
 */
/*
 * Контакти за роллю картки — те саме правило, що й у «Моєму профілі»
 * (`PERSON_HIDDEN_SOCIAL_FIELDS`): донорці й СМ без ролі організації TikTok,
 * Twitter, LinkedIn і YouTube не пропонуються — їх шукають за телефоном,
 * Telegram та Instagram, і порожній LinkedIn у доповненні донорки лише
 * запрошував вписати те, чого в неї немає. Уже записане значення поле
 * лишає: інакше його не було б де виправити. Картка без ролі бачить усі.
 */
const PERSON_HIDDEN_CONTACT_FIELDS = new Set(['tiktok', 'twitter', 'linkedin', 'youtube']);

export const isContactFieldOfferedForCard = (fieldName, card) => {
  if (!PERSON_HIDDEN_CONTACT_FIELDS.has(fieldName)) return true;
  if (hasCurrentValue(card?.[fieldName])) return true;
  const roles = listProfileRoles(card);
  const isPerson = roles.some(role => role === 'ed' || role === 'sm');
  const isOrganisation = roles.some(role => role === 'ag' || role === 'cl');
  return !isPerson || isOrganisation;
};

export const collectExtraContactFields = card => CONTACT_FIELDS
  .filter(fieldName => !CREATE_FORM_SECTION_FIELDS.has(fieldName) && hasCurrentValue(card?.[fieldName]));

// A draft opened by somebody who is neither its author nor an admin. Those
// two write into the draft itself; everyone else contributes through their
// own overlay.
const isSharedDraft = (mutation, viewerUid, isAdmin) => Boolean(
  mutation?.createdBy && viewerUid && mutation.createdBy !== viewerUid && !isAdmin
);

const CREATE_FORM_SECTION_FIELDS = new Set(CREATE_FORM_SECTIONS.flatMap(section => section.fields));
const FORM_FIELD_NAMES = CREATE_FORM_SECTION_FIELDS;

// Підпис людини — це поточне значення поля, а не вся його історія. Масив у полі
// анкети тримає версії, і поточна серед них остання (`getCurrentValue`), тож
// зведене «Віолетта,Василіса Б.» читалось як дві людини в одному рядку.
// Історію видно тому, хто редагує поле, — у самій формі, а не в заголовку.
export const describeProfileName = (...values) => values
  .map(value => String(getCurrentValue(value) ?? '').trim())
  .filter(Boolean)
  .join(' ');

// Поля, які претендують на зайнятість контакту (`claimProfileIdentities` бере
// все індексоване, крім імені та прізвища). Підставляти таке значення в НОВУ
// картку, коли пошук уже показав чужу з цим самим контактом, означає завести
// дубль, який база все одно відхилить, — і показати людині відмову замість
// форми. Імʼя та прізвище підставляються завжди: вони нічого не займають.
const IDENTITY_CLAIMING_PREFILL_FIELDS = new Set(
  [...PROFILE_SEARCH_PREFILL_FIELDS].filter(field => field !== 'name' && field !== 'surname')
);

// Що читач бачить у формі доповнення: рівно поточні значення тих полів картки,
// які ця форма показує. Масив у канонічній картці є історією версій, а не
// переліком контактів; останній порожній елемент означає видалене поле.
// Номер у полі — суцільним рядком, без пробілів: у базі він лежить по-різному
// («380 50 111 22 33» поруч із «380501112233»), а читають і звіряють його
// однаково. Нормалізується і підставлене, і база порівняння
// (`buildOverlayPrefill` дає обидва), тож прибрані пробіли правкою не стають.
const compactPhoneInput = value => (typeof value === 'string' ? value.replace(/\s+/g, '') : value);

//
// Telegram з приставкою «УК СМ» — робоча позначка адміна, а не контакт людини
// (`isHiddenTelegramValue`): показ контактів її вже відсіює, а форма
// доповнення підставляла в поле, і читач бачив «УК СМ Жанна …» як Telegram
// донорки. Поле тоді лишається порожнім — Telegram з номера дають кнопки біля
// телефону. Знімається воно і з бази порівняння, тож порожнє поле не стає
// «стиранням». Адмінові позначка лишається: це його ж робочий запис.
export const buildOverlayPrefill = (canonical, cardUserId, { keepAdminTelegram = false } = {}) => [
  ...CREATE_FORM_SECTIONS.flatMap(section => section.fields),
  // Канали звʼязку, яких у переліку секцій немає, підставляються так само:
  // інакше рядок для такого контакту порівнював би введене з порожнечею і
  // вважав би підставлене значення правкою читача.
  ...collectExtraContactFields(canonical),
]
  .reduce((result, fieldName) => {
    const value = getCurrentValue(canonical?.[fieldName]);
    if (value === null || value === undefined || String(value).trim() === '') return result;
    if (fieldName === 'telegram' && !keepAdminTelegram && isHiddenTelegramValue(value)) return result;
    result[fieldName] = fieldName === 'phone' ? compactPhoneInput(value) : value;
    return result;
  }, { userId: cardUserId });

/**
 * Рядок видачі — картка людини, а не сирий id.
 *
 * Доти знайдене показувалось як імʼя плюс `userId` під ним: id нічого не каже
 * про людину, а факти, за якими картку впізнають у стрічці (роль, вік,
 * локація, фото), не показувались узагалі — тож два однойменні результати були
 * нерозрізненні. Розкладка тут та сама, що й у рядку стрічки, аби знайдене
 * виглядало однаково, звідки б його не відкрили.
 */
const ProfileResultCard = ({ card, name, note, status, statusVariant, actionLabel, onAction }) => {
  const { language } = useAppSettings();
  const facts = [
    getRoleCode(getProfileRole(card)) ? getRoleLabel(getProfileRole(card), language) : '',
    getProfileAge(card) ? String(getProfileAge(card)) : '',
    getProfileLocation(card),
  ].filter(Boolean).join(' · ');
  const photo = getProfilePhotos(card)[0] || '';
  return <ResultCard>
    <ResultAvatar>
      {photo ? <img src={photo} alt="" /> : (String(name || '').trim()[0] || '?').toUpperCase()}
    </ResultAvatar>
    <ResultBody>
      <ResultName>{name}</ResultName>
      {facts ? <ResultMeta>{facts}</ResultMeta> : null}
      {note ? <ResultMeta>{uiText(note, language)}</ResultMeta> : null}
      {status ? <span><Status $variant={statusVariant}>{uiText(status, language)}</Status></span> : null}
    </ResultBody>
    <ResultAction type="button" onClick={onAction}>{uiText(actionLabel, language)}</ResultAction>
  </ResultCard>;
};

/**
 * Картка стрічки з даних форми чи чернетки. Сире поле анкети — це **вся
 * історія** значень, і стерте значення (`['nick', '']`) стояло б живим
 * контактом, тож контакти лягають поточними значеннями (`getCurrentValue`), як
 * і всюди на показі; перелік із них складає той самий `getContactEntries`, що
 * й у рядку стрічки. Без імені картка мовчала б порожнім рядком, тож
 * безіменна дістає `fallbackName`.
 */
const buildDraftPreviewCard = (source, fallbackName) => {
  const card = { ...(source || {}), __allPhotosLoaded: true };
  CONTACT_FIELDS.forEach(fieldName => {
    const value = getCurrentValue(card[fieldName]);
    if (value === null || value === undefined || String(value).trim() === '') delete card[fieldName];
    else card[fieldName] = value;
  });
  if (!describeProfileName(card.surname, card.name)) card.name = fallbackName;
  return card;
};

const currentNoteText = value => String(getCurrentValue(value) ?? '').trim();

const DraftListItem = styled(MatchingThemeScope)`
  display:block; max-width:460px; margin:0 auto 14px; border-radius:18px; cursor:pointer;
  &:focus-visible { outline:2px solid var(--km-accent); outline-offset:3px; }
`;

/*
 * Чернетка в списку — та сама картка стрічки, що й шапка відкритої чернетки
 * (`ProfileRow` з `preview`), і відкривається дотиком до неї самої.
 *
 * Тут був свій рядок: плитка з ініціалом замість фото, дата «Оновлено …» і
 * кнопка «Відкрити». Плитка обіцяла фото, якого в чернетці немає й додати
 * нікуди, дата нічого не казала про людину, а кнопка дублювала дотик. Чіп
 * стану («Спільна чернетка», «Приватна», «Опубліковано») пішов слідом. Фото
 * картка показує лише тоді, коли воно справді є (доповнена наявна картка).
 */
const DraftListCard = ({ mutation, fallbackName, privateNote, onOpen }) => {
  const { language, themeMode } = useAppSettings();
  const card = useMemo(
    () => buildDraftPreviewCard({ ...(mutation.data || {}), userId: mutation.cardId }, fallbackName),
    [fallbackName, mutation.cardId, mutation.data],
  );
  const previewNotes = useMemo(() => ({
    publicText: currentNoteText(mutation.data?.publicComment),
    privateText: String(privateNote || '').trim(),
  }), [mutation.data?.publicComment, privateNote]);
  const name = describeProfileName(card.name, card.surname);
  return <DraftListItem
    $themeMode={themeMode}
    role="button"
    tabIndex={0}
    data-testid="draft-list-card"
    aria-label={uiText('Відкрити: {name}', language, { name })}
    onClick={onOpen}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onOpen();
    }}
  >
    <ProfileRow user={card} preview isAdmin={false} expanded={false} previewNotes={previewNotes} />
  </DraftListItem>;
};

const ClearDraftConfirm = ({ busy, language, onCancel, onConfirm }) => <>
  <ModalTitle>{uiText('Очистити всі поля?', language)}</ModalTitle>
  <ModalText>
    {uiText(
      'Усі поля чернетки стануть порожніми, і картку більше ніхто не побачить.',
      language,
    )}
  </ModalText>
  <ModalActionRow>
    <ModalGhostButton type="button" disabled={busy} onClick={onCancel}>
      {uiText('Відмінити', language)}
    </ModalGhostButton>
    <ModalDangerButton type="button" disabled={busy} onClick={onConfirm}>
      {uiText(busy ? 'Очищення…' : 'Очистити', language)}
    </ModalDangerButton>
  </ModalActionRow>
</>;

const describeAuthor = (authorId, authors) => {
  const author = authors?.[authorId] || {};
  return [author.name, author.surname].filter(Boolean).join(' ') || authorId || '—';
};

export const ProfileCreationWorkspace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Підписи контактів у шапці — тією ж мовою, що й решта анкети; тема — та
  // сама, що й у стрічці, інакше картка-шапка малювалась би темною палітрою.
  const { language, themeMode } = useAppSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [uid, setUid] = useState('');
  const [access, setAccess] = useState(null);
  const [mutations, setMutations] = useState([]);
  // Усе, що цей читач тут завів, — разом із уже прийнятими картками. Черга
  // адміна й пошук по чернетках беруть `mutations` (неприйняті), а список
  // «Створені мною» — саме це.
  const [ownCreatedCards, setOwnCreatedCards] = useState([]);
  const [sharedMutations, setSharedMutations] = useState([]);
  const [draft, setDraft] = useState(null);
  const [activeMutation, setActiveMutation] = useState(null);
  const [draftOverlays, setDraftOverlays] = useState({});
  const [draftHistory, setDraftHistory] = useState([]);
  const [historyAuthors, setHistoryAuthors] = useState({});
  const [showDraftHistory, setShowDraftHistory] = useState(false);
  const [overlayTarget, setOverlayTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false);
  const [confirmClearDraft, setConfirmClearDraft] = useState(false);
  const [clearingDraft, setClearingDraft] = useState(false);
  // Вміст модалки «Очистити все» — стабільний компонент, а не стрілка в JSX:
  // стрілка — новий тип на кожен рендер, і React перемонтовував кнопку щоразу,
  // коли сторінка оновлювала стан, тож натиск міг влучити у вже зняту кнопку.
  // Свіжі пропси він бере з ref, який оновлюється кожен рендер.
  const clearConfirmPropsRef = useRef({});
  const [ClearConfirmContent] = useState(() => () => <ClearDraftConfirm {...clearConfirmPropsRef.current} />);
  const [favoriteUsers, setFavoriteUsers] = useState({});
  const [dislikeUsers, setDislikeUsers] = useState({});
  // Публічні відгуки картки, яку доповнюють. Це інше сховище, ніж поле
  // `publicComment` анкети: відгук підписаний автором і лежить у
  // `comments/{cardId}`. Форма доповнення про них мовчала взагалі — людина
  // дописувала картку, не бачачи, що про цю людину вже написали, — хоча в
  // стрічці й у відкритій картці та сама доріжка їх показує.
  const [publicComments, setPublicComments] = useState([]);
  // Чи відповідь про відгуки взагалі приїхала. Порожній список сам по собі про
  // це не каже: «читаємо», «не змогли прочитати» й «прочитали, відгуків
  // немає» виглядали б однаково — порожньою доріжкою під полем запису.
  const [publicCommentsState, setPublicCommentsState] = useState({ loading: false, loaded: false });
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
    if (resolvedAccess.isAdmin) {
      setMutations(sortByRecency(await loadAllCreateProfileMutations()));
      // loadAllCreateProfileMutations already returns every author's drafts.
      setOwnCreatedCards([]);
      setSharedMutations([]);
      return;
    }

    // Один запит на обидва списки: прийняті картки потрібні лише списку
    // «Створені мною», а чернетки — і йому, і пошуку по власних чернетках.
    const items = sortByRecency(await loadOwnProfileMutations(userId, { includeAccepted: true }));
    setOwnCreatedCards(items);
    setMutations(items.filter(item => item.status !== 'accepted'));

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
    // Адреса форми — це та сама сторінка, а не новий крок: запис в історії
    // кладе ефект нижче, один на відкриту форму, і саме його знімає «назад».
    setSearchParams({ cardId: mutation.cardId }, { replace: true });
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
    setUid(user.uid);
    accessRef.current = resolved;
    setAccess(resolved);
    await refresh(user.uid, resolved);
  }), [navigate, refresh]);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    Promise.all([fetchFavoriteUsers(uid), fetchDislikeUsers(uid)]).then(([favorites, dislikes]) => {
      if (cancelled) return;
      setFavoriteUsers(favorites || {});
      setDislikeUsers(dislikes || {});
    });
    return () => { cancelled = true; };
  }, [uid]);

  /**
   * Відгуки картки, яку доповнюють, приїжджають разом з нею.
   *
   * Доріжка публічних нотаток у формі стоїть та сама, що в стрічці й у
   * відкритій картці, а показувала вона лише поле анкети `publicComment` —
   * тобто мовчала про все, що про цю людину вже написали інші. Дописувати
   * картку, не бачачи чужих відгуків, означає дописувати наосліп: рівно те, від
   * чого форму й відмивали, коли вона перестала бути порожньою.
   *
   * Читання одне на відкриту форму: картка тут одна, а не список.
   */
  useEffect(() => {
    const cardId = overlayTarget?.userId;
    if (!cardId) {
      setPublicComments([]);
      setPublicCommentsState({ loading: false, loaded: false });
      return undefined;
    }
    let cancelled = false;
    setPublicCommentsState({ loading: true, loaded: false });
    fetchPublicProfileComments([cardId])
      .then(byProfile => {
        if (cancelled) return;
        setPublicComments(byProfile?.[cardId] || []);
        setPublicCommentsState({ loading: false, loaded: true });
      })
      .catch(error => {
        // Відгуки — доповнення до форми, а не її умова: відмова читання не має
        // коштувати самої форми, тож вона лишається в консолі. А от мовчати про
        // неї на екрані не можна: порожня доріжка інакше означала б «відгуків
        // немає» там, де їх просто не прочитали.
        if (!cancelled) setPublicCommentsState({ loading: false, loaded: false });
        console.warn('[ProfileCreationWorkspace] public comments unavailable', error);
      });
    return () => { cancelled = true; };
  }, [overlayTarget?.userId]);

  const handleCreatePublicComment = useCallback(async (profileId, text) => {
    // Відгук анонімний: імені автора він не несе ні на екрані, ні в базі.
    // Лишається `authorId` — його вимагають правила, щоб автор міг свій
    // відгук правити й знімати, — але імʼя під відгуком більше не пишеться.
    const created = await addPublicProfileComment({ profileId, text });
    setPublicComments(previous => [...previous, created]);
  }, []);

  const handleUpdatePublicComment = useCallback(async (profileId, commentId, text) => {
    const updated = await updatePublicProfileComment({ profileId, commentId, text });
    setPublicComments(previous => (updated
      ? previous.map(comment => (comment.id === commentId
        ? { ...comment, text: updated.text, updatedAt: updated.updatedAt }
        : comment))
      : previous.filter(comment => comment.id !== commentId)));
  }, []);

  const handleDeletePublicComment = useCallback(async (profileId, commentId) => {
    await deletePublicProfileComment({ profileId, commentId });
    setPublicComments(previous => previous.filter(comment => comment.id !== commentId));
  }, []);

  useEffect(() => {
    const requestedCardId = searchParams.get('cardId');
    if (!requestedCardId) return;
    const mutation = [...mutations, ...sharedMutations].find(item => item.cardId === requestedCardId);
    if (mutation && activeMutation?.cardId !== mutation.cardId) {
      openMutation(mutation);
    }
  }, [activeMutation?.cardId, mutations, sharedMutations, searchParams, openMutation]);

  const startNew = (queryText, { allowContactPrefill = true } = {}) => {
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
    // Набране приходить або з рядка цього екрана, або з наміру, з яким сюди
    // прийшли зі стрічки, — і другий випадок трапляється раніше, ніж рядок
    // встигає щось показати.
    const detected = detectSearchParams(typeof queryText === 'string' ? queryText : search);
    const mayPrefillDetectedField = PROFILE_SEARCH_PREFILL_FIELDS.has(detected?.key)
      && (allowContactPrefill || !IDENTITY_CLAIMING_PREFILL_FIELDS.has(detected.key));
    const initialSearchData = mayPrefillDetectedField && detected?.value
      ? { [detected.key]: detected.value }
      : {};
    const nextDraft = { userId: cardId, ...initialSearchData };
    draftRef.current = nextDraft;
    persistedDraftRef.current = nextDraft;
    resetDraftOverlayState(nextDraft);
    setDraft(nextDraft);
    setSearchParams({ cardId }, { replace: true });
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
    setSearchLoading(false);
    setSearchNotFound(false);
    setSearchFailed(false);
  };

  // A search can legitimately match several drafts at once - several people
  // named "Марія", for instance - so every match is offered, not just the
  // first one found.
  const matchingOwnDrafts = useMemo(() => (
    searchExecuted ? findMatchingProfileMutations(mutations, detectSearchParams(search))
      .filter(mutation => hasFilledProfileDraftData(mutation.data)) : []
  ), [mutations, search, searchExecuted]);

  // The same contact can already sit in a draft somebody else started. That
  // draft is editable by this user too, so offer it instead of letting them
  // create a second card for the same person.
  const matchingSharedDrafts = useMemo(() => (
    searchExecuted ? findMatchingProfileMutations(sharedMutations, detectSearchParams(search))
      .filter(mutation => hasFilledProfileDraftData(mutation.data)) : []
  ), [search, searchExecuted, sharedMutations]);

  // Памʼятки читача до карток списку: картка чернетки показує записане про
  // людину так само, як рядок стрічки, — доріжкою під карткою. Один запит на
  // список (`fetchUserComments` бере піддерево власника, коли карток багато),
  // і лише поки форма закрита: відкрита чернетка читає свою памʼятку сама.
  const [draftListNotes, setDraftListNotes] = useState({});
  // Очищена чернетка («Очистити все») у списку не стоїть: показати в ній
  // нічого, а авторка сама сказала, що тут нікого немає. Прийнята картка
  // лишається — її анкета живе вже не в чернетці.
  const visibleOwnCards = useMemo(() => ownCreatedCards.filter(mutation => (
    mutation.status === 'accepted' || hasFilledProfileDraftData(mutation.data)
  )), [ownCreatedCards]);
  const draftListIds = useMemo(() => [...new Set([
    ...visibleOwnCards, ...matchingOwnDrafts, ...matchingSharedDrafts,
  ].map(mutation => mutation?.cardId).filter(Boolean))].sort().join(','), [matchingOwnDrafts, matchingSharedDrafts, visibleOwnCards]);
  useEffect(() => {
    if (!uid || !draftListIds || draft) return undefined;
    let active = true;
    Promise.resolve()
      .then(() => fetchUserComments(uid, draftListIds.split(',')))
      .catch(() => ({}))
      .then(comments => {
        if (!active) return;
        setDraftListNotes(Object.fromEntries(Object.entries(comments || {})
          .map(([cardId, comment]) => [cardId, comment?.text || ''])));
      });
    return () => { active = false; };
  }, [draft, draftListIds, uid]);

  // Чи показав пошук хоч щось: знайдену картку або чернетку. Від цього
  // залежить не право створити нову, а підпис кнопки й те, чи підставляти в
  // нову картку набраний контакт (він може бути вже зайнятий знайденою).
  const hasExistingMatches = searchResults.length > 0
    || matchingOwnDrafts.length > 0
    || matchingSharedDrafts.length > 0;

  /**
   * Перший рядок видачі — заготовка нової картки, рівно як у стрічці.
   *
   * Поле вибирає той самий розпізнавач, що й пошук (`detectSearchParams`), тож
   * читач бачить, куди ляже набране, ще до того, як відкриє форму. Раніше
   * відповідь «такої ще немає» жила кнопкою під трьома абзацами підказок у
   * кінці екрана — тобто там, куди треба було доскролити.
   *
   * Контакт, за яким пошук уже показав чужу картку, у нову не підставляється:
   * він зайнятий, і перше ж автозбереження впало б на `DUPLICATE_PROFILE`.
   */
  const queryDraft = useMemo(() => {
    const trimmed = search.trim();
    if (!trimmed) return null;
    const detected = detectSearchParams(trimmed);
    const field = detected?.key || 'name';
    const value = detected?.value || trimmed;
    const claimsIdentity = field !== 'name' && field !== 'surname' && field !== 'userId';
    // Поле, якого немає в `pickerFields` (наприклад, `userId`), підпису не має —
    // і питати його в `getFieldLabel` нічим.
    const fieldDefinition = pickerFields.find(item => item?.name === field);
    return {
      field,
      value,
      label: (fieldDefinition && getFieldLabel(fieldDefinition, language)) || uiText('Запит', language),
      note: claimsIdentity && hasExistingMatches
        ? uiText('Це значення вже стоїть у знайденій картці — нова відкриється без нього', language)
        : '',
    };
  }, [hasExistingMatches, language, search]);

  /**
   * Закрита форма повертає туди, звідки її відкрили.
   *
   * Відкривають її з двох місць, і «назад» мусить розрізняти їх. З рядка видачі
   * пошуку у стрічці — тоді закриття веде назад до тих самих знайдених карток,
   * уже з дописаним: доти воно лишало читача на власному екрані пошуку
   * майстерні, і той самий запит довелось би набирати вдруге. А зі списку
   * власних карток на цьому ж екрані — тоді форма є шаром над списком, і
   * закриття вертає до списку, а не виштовхує у стрічку.
   *
   * Адреса приходить у намірі (`state.returnTo`); після перезавантаження
   * сторінки наміру вже немає, тож запит береться з того ж сховища, з якого
   * його читає сам рядок пошуку.
   */
  const openerPath = () => (
    location.state?.returnTo || entryReturnToRef.current || buildMatchingSearchPath(readStoredMatchingSearchQuery())
  );

  // Чи відкрили форму з іншого екрана. Ознак дві, і обидві ставить вхід: намір
  // зі стрічки (`enrichCardId`/`createFromQuery`, він же відновлюється з адреси
  // після перезавантаження) і адреса повернення, що приїхала разом із ним.
  //
  // Самого наміру мало: власну чернетку стрічка відкриває просто адресою
  // `?cardId=…`, наміру в ній немає — і закриття такої форми висаджувало читача
  // на список власних карток замість видачі, з якої він її й відкрив.
  const openedFromAnotherScreen = () => (
    entryIntentRef.current || Boolean(location.state?.returnTo || entryReturnToRef.current)
  );

  const closeEditor = () => {
    // `replace` тут навмисний: запис історії, яким відкрилась форма, уже знято
    // (див. ефект нижче), і цей перехід стає на його місце замість того, щоб
    // дописати ще один крок «назад» у нікуди.
    if (!accessRef.current?.isAdmin && openedFromAnotherScreen()) {
      navigate(openerPath(), { replace: true });
      return;
    }
    // Черга адміна й список власних карток живуть на цьому ж екрані, тож для
    // них «назад» — це повернутись до списку, а не піти зі сторінки.
    setDraft(null);
    setActiveMutation(null);
    activeMutationRef.current = null;
    setOverlayTarget(null);
    resetDraftOverlayState(null);
    setSearchParams({}, { replace: true });
    // The list cards (name, status, revision, updatedAt) were snapshotted
    // when the workspace loaded and never touched again - saves made while
    // the editor was open only updated the open draft's own refs. Without
    // this, closing the editor leaves the queue showing pre-edit data until
    // a full page reload re-runs the auth effect.
    if (uid && accessRef.current) refresh(uid, accessRef.current);
  };

  // Стрілка в шапці й апаратна кнопка «назад» мусять дати один наслідок, тож
  // стрілка форму не закриває — вона знімає той самий запис історії, який
  // поклало відкриття форми, і закриває форму вже `popstate`. Це рівно той
  // механізм, яким закривається шар деталей у стрічці; доти тут була кнопка
  // «Закрити» внизу екрана, а апаратна кнопка тим часом вела кудись інде.
  const formHistoryStateRef = useRef(false);
  const closeEditorRef = useRef(() => {});
  closeEditorRef.current = closeEditor;
  const requestCloseEditor = () => {
    if (formHistoryStateRef.current && typeof window !== 'undefined' && window.history.state?.profileCreationForm) {
      formHistoryStateRef.current = false;
      window.history.back();
      return;
    }
    closeEditor();
  };

  // Вихід із акаунта живе в тому ж меню, що й на решті сторінок анкет, тож і
  // робить те саме: знімає ознаки сесії й веде на власну анкету.
  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('ownerId');
      navigate('/my-profile');
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Відкрита форма кладе в історію рівно один запис; апаратна кнопка «назад»
  // (і «назад» браузера) його знімає — саме це й закриває форму.
  const formOpen = Boolean(draft) || overlayLoading;
  useEffect(() => {
    if (!formOpen) return undefined;
    window.history.pushState({ profileCreationForm: true }, '');
    formHistoryStateRef.current = true;
    const handlePopState = () => {
      formHistoryStateRef.current = false;
      closeEditorRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Знімаємо лише той запис, який поклали самі. Якщо форма пішла кудись
      // навігацією (закриття у стрічку, перехід до автора), історія вже
      // рушила далі, і `back()` тут скасував би саме той перехід.
      if (formHistoryStateRef.current && window.history.state?.profileCreationForm) {
        formHistoryStateRef.current = false;
        window.history.back();
      }
      formHistoryStateRef.current = false;
    };
    // closeEditorRef завжди тримає свіжу функцію — ефект лишається на один
    // цикл «форма відкрита / закрита».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen]);

  /**
   * Форма доповнення знайденої картки.
   *
   * Порожньою вона була навмисно — щоб жодне значення картки не поїхало назад
   * у базу як «правка» читача. Але доповнювати наосліп нічого: людина не
   * бачила, який номер у картці вже є, і дописувала той самий. Тепер форма
   * показує картку, а «правкою» стає лише різниця: писач порівнює введене з
   * канонічним значенням (`buildOverlayFromDraft`), тож підставлене й не
   * змінене не дає жодного поля оверлея.
   *
   * Картку для цього читаємо — тією самою воронкою, що й усюди
   * (`readProfileFromNodes`): саме вона й вирішує, скільки полів цьому
   * читачеві видно, і показувати більше за неї форма не вміє. Читання
   * коштує один круг на натиснуту кнопку, а не на картку в списку.
   */
  const startExistingProfileOverlay = async profile => {
    if (!profile?.userId) return;

    setActiveMutation(null);
    setOverlayLoading(true);
    setSearchParams({ cardId: profile.userId, overlay: '1' }, { replace: true });
    let canonical = profile;
    try {
      const full = await readProfileFromNodes(profile.userId, { includeWorkflow: false });
      if (full) canonical = { ...profile, ...full };
    } catch (error) {
      // Відмова означає лише «більше не видно» — форма відкривається з тим,
      // що вже принесла видача пошуку.
      console.warn('[ProfileCreationWorkspace] canonical card unavailable', error);
    }
    const canonicalPrefill = buildOverlayPrefill(canonical, profile.userId, {
      keepAdminTelegram: Boolean(accessRef.current?.isAdmin),
    });
    let overlays = {};
    try {
      overlays = await getOverlaysForCard(profile.userId);
    } catch (error) {
      console.warn('[ProfileCreationWorkspace] existing overlay unavailable', error);
    }
    const { stacked, baseWithoutOwnOverlay } = getStackedCardViews({
      canonical: canonicalPrefill,
      overlaysByEditor: overlays,
      editorUserId: uid,
    });
    // `canonical` — це база для порівняння правок, і в ній лише поля форми:
    // все, чого форма не показує, не має права поїхати в оверлей. Але верхньому
    // блоку потрібна сама картка — роль, вік, локація, фото, — тож вона їде
    // поруч і використовується лише на показ.
    setOverlayTarget({ userId: profile.userId, canonical: baseWithoutOwnOverlay, card: canonical });
    const nextDraft = stacked;
    persistedDraftRef.current = nextDraft;
    draftRef.current = nextDraft;
    resetDraftOverlayState(null);
    setDraft(nextDraft);
    setOverlayLoading(false);
  };

  /**
   * Намір, з яким сюди прийшли зі стрічки, виконується одразу.
   *
   * Обидві кнопки там уже знають, чого хоче читач: «Доповнити дані» — цю
   * картку, «Створити нову» — картку з набраного. Екран пошуку між ними й
   * відповіддю був зайвим кроком, ще й з іншою розкладкою тієї самої видачі:
   * читач шукав удруге те, що щойно знайшов.
   *
   * Намір виконується один раз на вхід — інакше закрита форма відкривалась би
   * знову від кожного перемальовування.
   */
  const entryIntentRef = useRef(false);
  // Намір читається один раз, а `state` слідом стирається (інакше закрита форма
  // відкривалась би знову) — тож адресу повернення треба запамʼятати тут.
  const entryReturnToRef = useRef('');
  useEffect(() => {
    if (!uid || !access || entryIntentRef.current) return;
    const intent = location.state || {};
    if (typeof intent.returnTo === 'string' && intent.returnTo) entryReturnToRef.current = intent.returnTo;
    // Адреса форми доповнення теж є наміром: `?cardId=...&overlay=1` вона
    // ставила собі сама, але після оновлення сторінки ніхто її не читав — і
    // замість відкритої форми людина діставала екран пошуку.
    const reopenedOverlayCardId = searchParams.get('overlay') === '1' ? searchParams.get('cardId') : '';
    const enrichCardId = intent.enrichCardId || reopenedOverlayCardId;
    if (enrichCardId) {
      entryIntentRef.current = true;
      void startExistingProfileOverlay({ userId: enrichCardId });
      return;
    }
    if (typeof intent.createFromQuery === 'string' && intent.createFromQuery.trim()) {
      entryIntentRef.current = true;
      navigate(`${location.pathname}${location.search || ''}`, { replace: true, state: null });
      if (searchParams.get('cardId')) return;
      // Контакт, за яким стрічка вже показала чужу картку, у нову не
      // підставляється: він зайнятий, і база відхилила б збереження ще до
      // того, як людина щось допише.
      startNew(intent.createFromQuery.trim(), { allowContactPrefill: !intent.queryMatchedCards });
    }
    // startNew / startExistingProfileOverlay перестворюються щорендеру, а намір
    // і так виконується рівно раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, location.state, searchParams, uid]);

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

  // Етапи й цілі збереження — теж напис на екрані, тож ідуть мовою інтерфейсу.
  const safeSaveStageNames = {
    'identity-claim': 'перевірка унікальності',
    'search-id-index': 'індекс ідентифікаторів',
    'search-key-index': 'пошуковий індекс',
    'mutation-transition': 'перехід публікації',
    'publication-update': 'фінальний запис картки',
    'matching-card-index': 'картка стрічки',
    'profile-mutation': 'збереження чернетки',
    'identity-claim-or-mutation': 'збереження чернетки',
  };

  const safeSaveTargetNames = {
    'profile-nodes': 'запис вузлів анкети',
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
    const stage = uiText(safeSaveStageNames[error?.profileSaveStage] || 'невідомий етап', language);
    const targets = (error?.profileSaveTargets || [])
      .map(target => safeSaveTargetNames[target])
      .filter(Boolean)
      .map(target => uiText(target, language))
      .join(' + ');
    const recovery = error?.profileSaveRecovered === true
      ? uiText('Чернетку повернено в режим редагування — можна повторити.', language)
      : error?.profileSaveRecovered === false
        ? uiText('Не вдалося автоматично розблокувати чернетку. Оновіть сторінку.', language)
        : '';
    toast.error(
      <div>
        <div style={{ fontWeight: 700 }}>{fallbackMessage}</div>
        {detail ? <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>{stage}: {detail}</div> : null}
        {targets ? <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>{uiText('Перевірте rules для: {targets}.', language, { targets })}</div> : null}
        {recovery ? <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>{recovery}</div> : null}
      </div>,
      { duration: 8000 },
    );
  };

  const describeSaveError = error => uiText(error?.message === 'REVISION_CONFLICT'
    ? 'Профіль уже змінено. Оновіть сторінку.'
    : error?.message === 'DUPLICATE_PROFILE' ? 'Профіль з такими контактами вже існує або очікує перевірки.' : 'Не вдалося зберегти профіль', language);

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
    //
    // Дата набирається крапками, а в базу їде в `РРРР-ММ-ДД` — той самий
    // розподіл, що й в анкеті адміна (`PROFILE_DATE_FIELDS`). Недонабрана
    // дата лишається як є: переставляти в ній нема чого.
    const dated = PROFILE_DATE_FIELDS.has(fieldName)
      ? values.map(item => (typeof item === 'string' ? formatDateToServer(item) : item))
      : values;
    // Країна, область, місто й зріст — канонічним виглядом, як у «Моєму
    // профілі» (`normalizeProfileFieldInput`). Лише у власній чернетці: у
    // доповненні нормалізоване «Украина» → «Україна» відрізнялось би від
    // канонічного значення й лягало б у шар правкою, якої читач не робив.
    const normalized = overlayTarget
      ? dated
      : dated.map(item => (typeof item === 'string' ? normalizeProfileFieldInput(fieldName, item) : item));
    const compacted = fieldName === 'phone' ? normalized.map(compactPhoneInput) : normalized;
    const nextValues = compacted.length ? [...compacted] : [''];
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
      toast.success(uiText('Значення видалено з усієї історії', language));
    } catch (error) {
      reportSaveError(error, uiText('Не вдалося видалити запис з історії', language));
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
    uiText('Правку збережено: {label}', language, { label }),
    uiText('Не вдалося зберегти правку', language),
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
    uiText('Правку видалено: {label}', language, { label }),
    uiText('Не вдалося видалити правку', language),
  );

  // "Зберегти чернетку" is the one action that turns the accepted base draft
  // into a real card in the profile nodes. Pending editor overlays stay
  // pending: publishing must neither apply nor remove them.
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
      toast.success(uiText('Чернетку збережено як картку — вона у вузлах анкети і проіндексована', language));
      closeEditor();
      await refresh(uid, access);
    } catch (error) {
      // acceptCreateProfileMutation labels every expected phase. Keep an
      // allow-listed fallback for an unexpected publication failure too.
      if (publishing && !error.profileSaveStage) error.profileSaveStage = 'publication-update';
      reportSaveError(error, error?.message === 'REVISION_CONFLICT'
        ? uiText('Автор уже оновив чернетку. Перевірте нову версію.', language)
        : uiText('Не вдалося зберегти чернетку як картку', language));
    } finally { setSaving(false); }
  };

  /**
   * Очистити все — кожне заповнене поле стає порожнім рядком.
   *
   * Це не видалення: чернетка лишається на місці одним збереженням, тож
   * журнал правок (`profileMutationHistory`) записує кожне стерте значення, і
   * адмін бачить, що тут було. Збереження синхронізує `searchId` і заявки на
   * унікальність, тому звільнені контакти можна одразу використати в іншій
   * картці. Масив лишається масивом з порожнім хвостом —
   * так само, як його стирає хрестик у полі.
   */
  async function clearAllDraftFields() {
    const current = draftRef.current || {};
    const nextDraft = Object.entries(current).reduce((result, [fieldName, value]) => {
      if (fieldName === 'userId' || fieldName.startsWith('__') || !hasCurrentValue(value)) return result;
      result[fieldName] = Array.isArray(value) ? [''] : '';
      return result;
    }, { ...current });
    setClearingDraft(true);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    try {
      await persistDraft(nextDraft);
      const cardId = activeMutationRef.current?.cardId;
      // This is a reset of a live draft, not deletion of the card. Remove only
      // pending values and keep history/contributors available to admins.
      if (cardId) await clearCardOverlays(cardId);
      draftOverlaysRef.current = {};
      stackedDraftRef.current = draftBaseRef.current || nextDraft;
      setDraftOverlays({});
      setConfirmClearDraft(false);
      toast.success(uiText('Усі поля очищено', language));
    } catch (error) {
      reportSaveError(error, describeSaveError(error));
    } finally {
      setClearingDraft(false);
    }
  }
  clearConfirmPropsRef.current = {
    busy: clearingDraft,
    language,
    onCancel: () => setConfirmClearDraft(false),
    onConfirm: () => { void clearAllDraftFields(); },
  };

  /**
   * Видалити чернетку начисто.
   *
   * «Відхилити» повертає чернетку авторові — це відповідь на «ще не готова».
   * А дублеві, тестовій і випадково збереженій порожнечі місця немає взагалі,
   * і доти прибрати їх з черги було нічим: чернетка не зникає сама ніколи.
   * Зносить її `deleteCreateProfileMutation` — разом із заявками на
   * унікальність, записами в `searchId`, шарами доповнень, відгуками й
   * вузлами анкети, якщо чернетку вже публікували. Що саме не доїхало, звіт
   * називає поіменно: «видалено» на половині слідів гірше за чесну відмову.
   */
  const deleteDraft = async () => {
    const current = activeMutationRef.current;
    if (!current?.cardId) return;
    setDeletingDraft(true);
    try {
      const { failures } = await deleteCreateProfileMutation({
        cardId: current.cardId,
        creatorUid: current.createdBy,
      });
      setConfirmDeleteDraft(false);
      if (failures.length) {
        toast.error(uiText('Чернетку видалено не повністю: {steps}', language, {
          steps: failures.map(failure => failure.step).join(', '),
        }));
      } else {
        toast.success(uiText('Чернетку видалено з усіх колекцій та індексів', language));
      }
      closeEditor();
      await refresh(uid, access);
    } catch (error) {
      console.error('[ProfileCreationWorkspace] draft deletion failed', error);
      toast.error(uiText('Не вдалося видалити чернетку', language));
    } finally {
      setDeletingDraft(false);
    }
  };

  const fieldsMap = useMemo(() => new Map([...pickerFields, PATRONYMIC_FIELD].map(field => [field.name, field])), []);

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

  const renderCreateField = (fieldName, { allowUnknown = false, hideLabel = false, placeholder } = {}) => {
    // A field with edits but no entry in the create catalogue still has to be
    // reviewable, so those fall back to a plain text row named after the field.
    const field = fieldsMap.get(fieldName) || (allowUnknown ? { name: fieldName } : null);
    if (!field) return null;
    const value = draft?.[fieldName] || '';
    const isTextArea = fieldName === 'moreInfo_main' || fieldName === 'publicComment';
    const isDateField = PROFILE_DATE_FIELDS.has(fieldName);
    // «+» відкриває рядок під **наступну версію** поля («телефон був той, став
    // цей»). У коментаря версій не буває: він один, його розширюють або
    // звужують, правлячи той самий текст. Дописаний другий рядок поїхав би в
    // базу другою версією, а показувалась би скрізь сама лише остання — тобто
    // перша половина відгуку мовчки зникла б з усіх екранів. Правило тут те
    // саме, що й у формі анкети (`fieldAcceptsMultipleValues`).
    const canAddAnotherValue = fieldAcceptsMultipleValues(fieldName);
    // «+» — лише біля останнього заповненого значення. Біля кожного поля він
    // стояв і порожнім: двадцять оранжевих «+» на екрані, і людина тиснула
    // його замість того, щоб виправити саме поле, — а до порожнього поля другу
    // версію додавати нема чого.
    const fieldRowValues = toFieldValues(value);
    const offersAnotherValue = (index, item) => index === fieldRowValues.length - 1 && String(item ?? '').trim() !== '';
    // Хрестик у порожньому полі нічого не стирає — лише обіцяє дію й робить
    // порожню форму схожою на заповнену. Лишається він хіба на зайвому
    // порожньому рядку, доданому «+»: інакше прибрати цей рядок було б нічим.
    const offersClear = item => String(item ?? '').trim() !== '' || fieldRowValues.length > 1;
    const label = getFieldLabel(field, language) || fieldName;
    const currentValues = toFieldValues(value).map(item => String(item ?? '').trim()).filter(Boolean);

    return <FieldRow key={fieldName} $pending={Boolean(pendingFieldEdits[fieldName]?.length)} $bare={hideLabel}>
      {!hideLabel && <FieldLabel>{label}</FieldLabel>}
      {listOfferedOptions(field.options, value).length > 0 ? (
        <FieldChipRow>
          {listOfferedOptions(field.options, value).map(option => {
            const optionValue = getOptionValue(option);
            const selected = String(value) === String(optionValue);
            return <FieldChip
              key={`${fieldName}-${optionValue}`}
              type="button"
              $selected={selected}
              onClick={() => commitFieldValue(fieldName, selected ? '' : optionValue)}
            >
              {getOptionLabel(option, language)}
            </FieldChip>;
          })}
        </FieldChipRow>
      ) : isTextArea ? (
        <FieldControls>
          {toFieldValues(value).map((item, index) => <FieldControl key={`${fieldName}-${index}`}>
            <InputShell>
              <FieldTextArea
                value={item}
                placeholder={placeholder ?? asExamplePlaceholder(getFieldPlaceholder(field, language), language)}
                onChange={e => updateDraftFieldItem(fieldName, index, e.target.value)}
                onBlur={() => commitDraftFieldItems(fieldName, toFieldValues(draftRef.current?.[fieldName]))}
              />
              {offersClear(item) && <InlineClearButton type="button" aria-label={uiText('Очистити {label}', language, { label })} title={uiText('Очистити рядок', language)} onMouseDown={e => e.preventDefault()} onClick={() => clearDraftFieldItem(fieldName, index)}><FiX size={16} aria-hidden="true" /></InlineClearButton>}
            </InputShell>
            {canAddAnotherValue && offersAnotherValue(index, item) && <AddValueButton type="button" aria-label={uiText('Додати ще одне значення: {label}', language, { label })} title={uiText('Додати ще один рядок', language)} onClick={() => appendDraftFieldItem(fieldName)}><FiPlus aria-hidden="true" /></AddValueButton>}
          </FieldControl>)}
        </FieldControls>
      ) : (
        <FieldControls>
          {toFieldValues(value).map((item, index) => <FieldControl key={`${fieldName}-${index}`}>
            <InputShell>
              <FieldInput
                // Дату людина бачить і набирає як `дд.мм.рррр`, хоч лежить вона
                // в `РРРР-ММ-ДД`: показувати ISO — це дата задом наперед.
                value={isDateField ? formatDateToDisplay(item) : item}
                inputMode={isDateField ? 'numeric' : undefined}
                placeholder={placeholder ?? (isDateField ? uiText('дд.мм.рррр', language) : asExamplePlaceholder(getFieldPlaceholder(field, language), language))}
                onChange={e => updateDraftFieldItem(
                  fieldName,
                  index,
                  isDateField ? formatDate(e.target.value, true) : e.target.value,
                )}
                onBlur={() => commitDraftFieldItems(fieldName, toFieldValues(draftRef.current?.[fieldName]))}
              />
              {offersClear(item) && <InlineClearButton type="button" aria-label={uiText('Очистити {label}', language, { label })} title={uiText('Очистити рядок', language)} onMouseDown={e => e.preventDefault()} onClick={() => clearDraftFieldItem(fieldName, index)}><FiX size={16} aria-hidden="true" /></InlineClearButton>}
            </InputShell>
            {canAddAnotherValue && offersAnotherValue(index, item) && <AddValueButton type="button" aria-label={uiText('Додати ще одне значення: {label}', language, { label })} title={uiText('Додати ще один рядок', language)} onClick={() => appendDraftFieldItem(fieldName)}><FiPlus aria-hidden="true" /></AddValueButton>}
          </FieldControl>)}
        </FieldControls>
      )}
      {renderFieldTimeline(fieldName, currentValues, label)}
    </FieldRow>;
  };

  /**
   * Картка, яку показує шапка, — канонічна плюс те, що вже набрали: та сама
   * людина, якою її бачать у стрічці, лише з правками цієї форми.
   */
  const summaryCard = useMemo(
    () => ({ ...(overlayTarget?.card || overlayTarget?.canonical || {}), ...(draft || {}) }),
    [draft, overlayTarget],
  );
  // Контакти шапки — рівно ті, що стоять у полях форми нижче: поточні
  // значення, а не історія (TikTok, стертий у полі, вгорі стояв би живим).
  // Шапка — картка стрічки (`ProfileRow`) з поточних значень полів
  // (`buildDraftPreviewCard`). Нова називається «Новий профіль», а знайдена
  // без імені — «Картка без імені»: «Новий профіль» над чужою карткою брехав би.
  const previewCard = useMemo(
    () => buildDraftPreviewCard(summaryCard, uiText(overlayTarget ? 'Картка без імені' : 'Новий профіль', language)),
    [language, overlayTarget, summaryCard],
  );
  // Канали, які в картці є, а рядка в анкеті не мають, дописуються в кінець
  // блока контактів — інакше виправити їх немає де.
  const extraContactFields = useMemo(() => collectExtraContactFields(draft), [draft]);

  // Окремого рядка з назвою екрана, стрілкою й «⋮» тут більше немає: усе це
  // стоїть у рядку спільної навігації (`PrimaryNavigation`). Назва екрана
  // повторювала підсвічену над нею вкладку, тож відкрите тепер називає сама
  // вкладка — «Доповнення» над чужою карткою, «Чернетка» над власною, — а
  // «Мої картки» лишаються для списку.
  //
  // Стрілка веде туди ж, куди апаратна кнопка телефона: у формі — назад до
  // того, з чого її відкрили, у списку — на попередній екран, коли він є.
  const editorOpen = Boolean(draft || overlayLoading);
  usePrimaryNavigationSlot({
    onBack: editorOpen
      ? requestCloseEditor
      : (canGoBackInHistory() ? () => goBackOrTo(navigate, MATCHING_PATH) : undefined),
    workspaceLabel: overlayTarget ? 'overlay' : (draft ? 'draft' : ''),
    // Меню те саме, що й на решті сторінок анкет: воно знає права читача і не
    // пропонує йому екранів, куди `App` його все одно не пустить.
    renderMenu: access ? ({ close }) => (
      <ProfileDotsMenu
        navigate={navigate}
        isAdmin={access.isAdmin}
        access={access}
        onExit={handleExit}
        onSelect={close}
        omitPrimaryDestinations
      />
    ) : undefined,
  });
  if (!access) return <Page><Shell>{uiText('Завантаження…', language)}</Shell></Page>;
  // Під карткою-шапкою лишається власна плашка лише тоді, коли їй є що сказати:
  // стан і службові дані чернетки, заповненість і реакція. Над доповненням
  // знайденої картки цього нічого немає — там стоїть сама картка.
  //
  // Заповненості («Заповнено анкету, 18%») тут більше немає: картка-шапка
  // вище й так показує, що заповнено, а смужка з відсотком лише займала
  // перший екран. Реакції стоять рядом рішень самої картки, як у стрічці.
  const hasDraftHeaderExtras = editingSharedDraft || (!overlayTarget && (
    activeMutation?.status === 'private'
    || (reviewingAsAdmin && pendingEditsCount > 0)
    || access.isAdmin
  ));
  // Рішення про власну збережену чернетку — та сама пара, що й у рядку
  // стрічки (хрестик ліворуч, серце праворуч, у спільній рамці). Доти тут
  // стояли окремі круглі кнопки іншого вигляду під смужкою заповненості.
  const canReactToDraft = !access.isAdmin && !overlayTarget && !editingSharedDraft && Boolean(activeMutation?.updatedAt);
  const draftReactionId = activeMutation?.cardId;
  const draftDisliked = Boolean(draftReactionId && dislikeUsers[draftReactionId]);
  const draftLiked = Boolean(draftReactionId && favoriteUsers[draftReactionId]);
  const reactionArgs = {
    userId: draftReactionId,
    userData: null,
    cacheUserData: false,
    favoriteUsers,
    setFavoriteUsers,
    dislikeUsers,
    setDislikeUsers,
  };
  const draftPrimaryAction = canReactToDraft ? {
    icon: draftDisliked ? <FaUndoAlt size={13} /> : <FaTimes size={14} />,
    title: uiText(draftDisliked ? 'Повернути в «Усі»' : 'Не цікаво', language),
    active: draftDisliked,
    onClick: () => { void toggleDislikeUser(reactionArgs); },
  } : undefined;
  const draftSecondaryAction = canReactToDraft ? {
    icon: draftLiked ? <FaHeart size={13} /> : <FaRegHeart size={13} />,
    title: uiText('В обране', language),
    accent: true,
    active: draftLiked,
    onClick: () => { void toggleFavoriteUser(reactionArgs); },
  } : undefined;

  return <Page><Shell>
    {draft ? <>
      <DraftPreview $themeMode={themeMode} data-testid="draft-card-preview">
        <ProfileRow
          user={previewCard}
          preview
          isAdmin={false}
          expanded={false}
          primaryAction={draftPrimaryAction}
          secondaryAction={draftSecondaryAction}
        />
      </DraftPreview>
      {hasDraftHeaderExtras && <DraftHeaderCard>
        {/* Стан чернетки — це те, що з нею буде далі, і сказати його є кому лише
            там, де воно щось означає: у власній чернетці й у черзі адміна.
            Над доповненням знайденої картки стояв підпис «Власні дані», який не
            називав ані людини, ані стану, — і разом з памʼяткою про те, як
            влаштований оверлей, з'їдав увесь перший екран форми. */}
        {/* «Очікує підтвердження» звідси пішло: воно обіцяло гейт, якого немає.
            Заведена картка вже лежить у пошуку — її знаходять, читають і
            пишуть під нею публічні відгуки, — тож чіп над нею казав авторові,
            що його робота кудись не доїхала, і тим єдиним, що стояло першим
            рядком чернетки, був цей неправдивий стан. Лишились ті два підписи,
            які справді щось міняють для того, хто дивиться: спільна чернетка
            (правки бачить наступний редактор) і приватна картка. */}
        {!overlayTarget && (editingSharedDraft || activeMutation.status === 'private'
          || (reviewingAsAdmin && pendingEditsCount > 0)) && <DraftBadges>
          {editingSharedDraft && <Status $variant="overlay">{uiText('Спільна чернетка', language)}</Status>}
          {!editingSharedDraft && activeMutation.status === 'private'
            && <Status $variant="private">{uiText('Приватний', language)}</Status>}
          {reviewingAsAdmin && pendingEditsCount > 0 && <Status $variant="overlay">{uiText('{count} непідтверджених правок', language, { count: pendingEditsCount })}</Status>}
        </DraftBadges>}
        {!overlayTarget && access.isAdmin && <>
          <TechnicalMeta>
            cardId: <code>{activeMutation.cardId}</code> · revision: {activeMutation.revision || 0}
            {activeMutation.updatedAt ? ` · ${uiText('Оновлено:', language)} ${formatDateTime(activeMutation.updatedAt, language)}` : ''}
          </TechnicalMeta>
          {activeMutation.createdBy && <TechnicalMeta>
            {uiText('Автор:', language)}{' '}
            <AuthorLink type="button" onClick={() => navigate(`/edit/${activeMutation.createdBy}`)}>
              {describeAuthor(activeMutation.createdBy, historyAuthors)}
            </AuthorLink>
          </TechnicalMeta>}
        </>}
        {editingSharedDraft && <Meta>{uiText(
          'Ви бачите останні дані цієї чернетки — правки всіх редакторів накладені одна на одну. '
          + 'Ваші зміни зберігаються окремо, у вашому оверлеї, і стають видимими наступному редактору. '
          + 'Рішення про те, які правки залишити, ухвалює адміністратор.',
          language
        )}</Meta>}
      </DraftHeaderCard>}
      {reviewingAsAdmin && (pendingEditsCount > 0 || draftHistory.length > 0) && <ReviewCard>
        <SectionHeader>
          <span>{uiText('Правки редакторів', language)}</span>
          <Count aria-label={uiText('{count} правок', language, { count: pendingEditsCount })}>{pendingEditsCount}</Count>
        </SectionHeader>
        <Meta>{uiText(pendingEditsCount === 0
          ? 'Немає непідтверджених правок — усі зміни вже опрацьовано.'
          : 'Кожну зміну показано біля її поля: актуальне значення розташоване вгорі, а попередні — нижче, від найновішого до оригінального. Неприйняті зміни не потраплять у профіль і залишаться в черзі.', language)}</Meta>
        <DisclosureToggle
          type="button"
          aria-expanded={showDraftHistory}
          onClick={() => setShowDraftHistory(previous => !previous)}
        >
          <FiClock aria-hidden="true" /> {uiText('Історія правок ({count})', language, { count: draftHistory.length })}
          <FiChevronDown aria-hidden="true" style={{ transform: showDraftHistory ? 'rotate(180deg)' : 'none' }} />
        </DisclosureToggle>
        {showDraftHistory && <Meta>
          {uiText(draftHistory.length === 0
            ? 'Історія порожня.'
            : 'Для кожного поля показано окреме дерево: актуальне значення вгорі, оригінальне — внизу.', language)}
        </Meta>}
      </ReviewCard>}
      {CREATE_FORM_SECTIONS.filter(section => section.key !== 'comment').map(section => (
        <FormSectionCard key={section.key}>
          <FormSectionTitle>{uiText(section.title, language)}</FormSectionTitle>
          {section.fields
            .filter(fieldName => section.key !== 'contacts' || isContactFieldOfferedForCard(fieldName, summaryCard))
            .map(fieldName => renderCreateField(fieldName))}
          {section.key === 'contacts' && extraContactFields.map(fieldName => (
            renderCreateField(fieldName, { allowUnknown: true })
          ))}
        </FormSectionCard>
      ))}
      {/* Публічна нотатка й приватна — пара, і стоять вони парою.
          Досі це були два різні місця екрана: публічний коментар — останньою
          секцією форми, приватна нотатка — у шапці (а в доповненні картки ще
          й окремою плашкою «Ваш коментар»), тож два записи про ту саму людину
          читались як дві незвʼязані речі, та ще й іншою розкладкою, ніж у
          стрічці й у відкритій картці. Тут та сама пара доріжок, що й там:
          публічне зверху (відгук читають), власне знизу (нотатку пишуть), з
          тими самими підписами й плейсхолдерами. */}
      <NotesCard>
        <NoteLanes>
          <NoteLane $public>
            <NoteLaneHead>
              <b>{profileUiText('publicComment', language)}</b>
            </NoteLaneHead>
            {/* У доповненні знайденої картки доріжка показує те саме, що
                показує вона ж у стрічці й у відкритій картці: підписані
                автором відгуки з `comments/{cardId}`.
                **Поля анкети `publicComment` під ними більше немає.** Воно
                стояло там разом із доріжкою, і та сама публічна нотатка
                писалась на екрані двічі: спершу підписаним відгуком, а одразу
                під ним — порожнім полем із тим самим підписом і тим самим
                плейсхолдером. Два поля під одним заголовком «Публічна
                нотатка» не пояснюють, чим вони різні, і людина дописувала те
                саме двічі. Лишився підписаний відгук — його видно всім
                екранам застосунку, тоді як поле анкети видно самій анкеті.
                У новій чернетці картки ще немає, тож і відгуків бути не може:
                там лишається саме поле. */}
            {overlayTarget ? (
              <>
                <PublicCommentBlock
                  flush
                  // Відгуки цієї картки форма читає сама, щойно відкрилась,
                  // тож кликати «перевірити їх наявність» тут нема чого.
                  preloaded
                  profileId={overlayTarget.userId}
                  comments={publicComments}
                  viewerId={uid}
                  canModerate={Boolean(access?.isAdmin)}
                  onCreate={handleCreatePublicComment}
                  onUpdate={handleUpdatePublicComment}
                  onDelete={handleDeletePublicComment}
                />
                <ReviewsStateNote>
                  {describeReviewsState({
                    requested: true,
                    loading: publicCommentsState.loading,
                    loaded: publicCommentsState.loaded,
                    count: publicComments.length,
                  }, language)}
                </ReviewsStateNote>
              </>
            ) : fieldsMap.has('publicComment') && (() => {
              const publicValues = toFieldValues(draft?.publicComment);
              const lastIndex = publicValues.length - 1;
              return <NoteFieldShell>
                <PlainNoteField
                  value={String(publicValues[lastIndex] ?? '')}
                  placeholder={profileUiText('publicCommentPlaceholderPlain', language)}
                  onChange={value => updateDraftFieldItem('publicComment', lastIndex, value)}
                  onBlur={() => commitDraftFieldItems('publicComment', toFieldValues(draftRef.current?.publicComment))}
                  onClear={() => clearDraftFieldItem('publicComment', lastIndex)}
                  clearLabel={uiText('Видалити коментар', language)}
                />
                {renderFieldTimeline(
                  'publicComment',
                  publicValues.map(item => String(item ?? '').trim()).filter(Boolean),
                  profileUiText('publicComment', language),
                )}
              </NoteFieldShell>;
            })()}
          </NoteLane>
          <NoteLane>
            <NoteLaneHead>
              <b>{profileUiText('personalNote', language)}</b>
            </NoteLaneHead>
            <NoteFieldShell>
              <FieldComment
                ClearButton={NoteClearButton}
                userData={{ ...draft, userId: overlayTarget ? overlayTarget.userId : (draft.userId || activeMutation.cardId) }}
                placeholder={profileUiText('personalNotePlaceholder', language)}
                onLegacyCommentMigrated={() => commitFieldValue('myComment', '')}
              />
            </NoteFieldShell>
          </NoteLane>
        </NoteLanes>
      </NotesCard>
      {extraEditedFields.length > 0 && <FormSectionCard>
        <FormSectionTitle>{uiText('🗂 Інші поля з правками', language)}</FormSectionTitle>
        {extraEditedFields.map(fieldName => renderCreateField(fieldName, { allowUnknown: true }))}
      </FormSectionCard>}
      {/* «Очистити все» — останнім у формі й лише над власною чернеткою (чи
          над будь-якою — для адміна). Над доповненням знайденої картки його
          немає: там «порожньо» означало б запропонувати стерти чужу анкету. */}
      {!overlayTarget && !editingSharedDraft && hasFilledProfileDraftData(draft) && <Card>
        <DeleteDraftButton
          type="button"
          data-testid="clear-draft-button"
          disabled={saving || deletingDraft || clearingDraft}
          onClick={() => setConfirmClearDraft(true)}
        >
          {uiText(clearingDraft ? 'Очищення…' : 'Очистити все', language)}
        </DeleteDraftButton>
      </Card>}
      {confirmClearDraft && <InfoModal
        onClose={() => { if (!clearingDraft) setConfirmClearDraft(false); }}
        text="delConfirm"
        DelConfirm={ClearConfirmContent}
      />}
      {/* Every field already saves itself on blur, so the old Зберегти /
          Прийняти / Відхилити row said nothing about what actually happened.
          What is left is the one step that is not automatic: turning the
          finished draft into a card. «Закрити» звідси пішло до стрілки в
          шапці: вихід — це жест «назад», а не дія серед дій анкети. */}
      {!overlayTarget && access.isAdmin && activeMutation.revision > 0 && <Card>
        <Actions>
          <SaveButton disabled={saving || deletingDraft} onClick={saveDraftAsCard}>
            {uiText(saving ? 'Збереження…' : 'Зберегти чернетку', language)}
          </SaveButton>
          {/* Друга відповідь черги: цій чернетці жити не треба. Питання
              підтвердження стоїть окремою модалкою — дія незворотна й
              торкається не одного вузла. */}
          <DeleteDraftButton
            disabled={saving || deletingDraft}
            onClick={() => setConfirmDeleteDraft(true)}
          >
            {uiText(deletingDraft ? 'Видалення…' : 'Видалити чернетку', language)}
          </DeleteDraftButton>
        </Actions>
      </Card>}
      {confirmDeleteDraft && <InfoModal
        onClose={() => { if (!deletingDraft) setConfirmDeleteDraft(false); }}
        text="delConfirm"
        DelConfirm={() => (
          <>
            <ModalTitle>{uiText('Видалити чернетку?', language)}</ModalTitle>
            <ModalText>
              {uiText(
                'Чернетку буде знято з усіх колекцій та індексів — разом із заявками на унікальність, '
                + 'записами в пошуку, доповненнями інших редакторів і публічними відгуками. '
                + 'Цю дію не можна скасувати.',
                language,
              )}
            </ModalText>
            <ModalActionRow>
              <ModalGhostButton
                type="button"
                disabled={deletingDraft}
                onClick={() => setConfirmDeleteDraft(false)}
              >
                {uiText('Відмінити', language)}
              </ModalGhostButton>
              <ModalDangerButton type="button" disabled={deletingDraft} onClick={deleteDraft}>
                {uiText(deletingDraft ? 'Видалення…' : 'Видалити', language)}
              </ModalDangerButton>
            </ModalActionRow>
          </>
        )}
      />}
    </> : overlayLoading ? <Card><Meta>{uiText('Відкриваємо картку…', language)}</Meta></Card> : <>
      {!access.isAdmin && <>
        {/* Екран питає одне — чи є вже така людина, — і має для цього один
            рядок і один рядок пояснення. Розкривний перелік пошукових ключів,
            памʼятка про чернетки й три підказки під кнопкою жили тут раніше:
            разом вони з'їдали перший екран, відповідаючи на питання, якого
            ніхто не ставив. */}
        <SearchSection aria-label={uiText('Пошук анкети', language)}>
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
              setSearchLoading(true);
              setSearchFailed(false);
            }}
            onSearchSettled={() => setSearchLoading(false)}
            // Історію пише лише завершений пошук, а не прогони на паузах у наборі.
            onSearchCommitted={value => addMatchingSearchQuery(value)}
            onSearchError={() => {
              setSearchFailed(true);
              setSearchNotFound(false);
            }}
            onClear={() => {
              setSearchResults([]);
              setSearchNotFound(false);
              setSearchExecuted(false);
              setSearchLoading(false);
              setSearchFailed(false);
            }}
            storageKey="profileCreationSearchQuery"
            searchOptions={PROFILE_SEARCH_OPTIONS}
            debounceMs={PROFILE_SEARCH_DEBOUNCE_MS}
            wrapperStyle={{ width: '100%' }}
            leftIcon={<FiSearch size={21} aria-hidden="true" />}
            placeholder={uiText('Телефон, email, нік або посилання', language)}
            inputAriaLabel={uiText('Пошук анкети', language)}
          />
          <SearchHint>{uiText(
            'Почніть із відомого контакту людини — телефона, пошти, ніка чи посилання на соцмережу. '
            + 'Перевіримо, чи така анкета вже існує.',
            language
          )}</SearchHint>
        </SearchSection>
        {searchExecuted ? <ResultsSection aria-label={uiText('Результати пошуку', language)}>
          {/* Перший рядок видачі — заготовка нової картки, як і у стрічці:
              набране вже розкладене в поле, і кнопка веде просто у форму з ним. */}
          {queryDraft && <QueryDraftCard data-testid="query-draft-card">
            <QueryDraftBody>
              <QueryDraftLabel>{queryDraft.label}</QueryDraftLabel>
              <QueryDraftValue>{queryDraft.value}</QueryDraftValue>
              {queryDraft.note && <QueryDraftNote>{queryDraft.note}</QueryDraftNote>}
            </QueryDraftBody>
            {/* Знайдене не замикає створення: кнопка була вимкнена, щойно пошук
                хоч щось показав, — і людина, якій жодна зі знайдених карток не
                підходила, лишалась без виходу. Дубль стереже зайнятість контакту
                в базі (`DUPLICATE_PROFILE`), а не вимкнена кнопка. */}
            <QueryDraftButton
              type="button"
              disabled={!search.trim() || !searchExecuted || searchLoading || searchFailed}
              onClick={() => startNew(search, { allowContactPrefill: !hasExistingMatches })}
            >
              <FiPlus size={16} aria-hidden="true" /> {uiText(hasExistingMatches ? 'Створити нову' : 'Створити', language)}
            </QueryDraftButton>
          </QueryDraftCard>}
          {searchLoading && <Meta>{uiText('Шукаємо…', language)}</Meta>}
          {searchFailed && <Meta>{uiText('Не вдалося виконати пошук. Спробуйте ще раз.', language)}</Meta>}
          {searchResults.map(profile => <ProfileResultCard
            key={profile.userId}
            card={profile}
            name={describeProfileName(profile.name, profile.surname) || uiText('Профіль знайдено', language)}
            status="Вже існує"
            actionLabel="Доповнити дані"
            onAction={() => startExistingProfileOverlay(profile)}
          />)}
          {matchingOwnDrafts.map(mutation => <DraftListCard
            key={mutation.cardId}
            mutation={mutation}
            fallbackName={uiText('Ваша чернетка', language)}
            privateNote={draftListNotes[mutation.cardId]}
            onOpen={() => openMutation(mutation)}
          />)}
          {matchingSharedDrafts.map(mutation => <DraftListCard
            key={mutation.cardId}
            mutation={mutation}
            fallbackName={uiText('Спільна чернетка', language)}
            privateNote={draftListNotes[mutation.cardId]}
            onOpen={() => openMutation(mutation)}
          />)}
          {!searchLoading && !searchFailed && !hasExistingMatches && searchNotFound
            && <Meta>{uiText('Такої анкети ще немає — заведіть її першим рядком.', language)}</Meta>}
        </ResultsSection> : <>
          {/* Порожній рядок пошуку — це не порожній екран: назва обіцяє власні
              картки, і вони тут і лежать, разом із уже прийнятими. */}
          <SectionHeader>
            <span>{uiText('Мої картки', language)}</span>
            <Count aria-label={uiText('{count} карток', language, { count: visibleOwnCards.length })}>{visibleOwnCards.length}</Count>
          </SectionHeader>
          {visibleOwnCards.length === 0 ? <EmptyState>
            <EmptyIcon><FiFolder aria-hidden="true" /></EmptyIcon>
            <EmptyTitle>{uiText('Ви ще не завели жодної картки.', language)}</EmptyTitle>
            <Meta>{uiText('Почніть із контакту: пошук покаже, чи є така людина в базі, а перший рядок видачі заведе нову картку.', language)}</Meta>
          </EmptyState> : visibleOwnCards.map(mutation => {
            const published = mutation.status === 'accepted';
            // Ні стану («Спільна чернетка», «Приватна», «Опубліковано»), ні
            // дати «Оновлено …» над карткою немає: про людину вони не кажуть
            // нічого, а картка в списку — та сама, що в стрічці.
            return <DraftListCard
              key={mutation.cardId}
              mutation={mutation}
              fallbackName={uiText('Без імені', language)}
              privateNote={draftListNotes[mutation.cardId]}
              onOpen={() => (published
                ? startExistingProfileOverlay({ userId: mutation.cardId })
                : openMutation(mutation))}
            />;
          })}
        </>}
      </>}
      {access.isAdmin && <>
        <SectionHeader>
          <span>{uiText('Черга на перевірку', language)}</span>
          <Count aria-label={uiText('{count} карток', language, { count: mutations.length })}>{mutations.length}</Count>
        </SectionHeader>
        {mutations.length === 0 && <EmptyState>
          <EmptyIcon><FiFolder aria-hidden="true" /></EmptyIcon>
          <EmptyTitle>{uiText('Нових профілів поки немає.', language)}</EmptyTitle>
          <Meta>{uiText('Нові картки від користувачів з’являться тут.', language)}</Meta>
        </EmptyState>}
        {mutations.map(mutation => <ProfileCard key={mutation.cardId}>
          <div>
            <Status $variant={mutation.status === 'private' ? 'private' : 'pending'}>
              {uiText(mutation.status === 'private' ? 'Приватний' : 'Очікує підтвердження', language)}
            </Status>
            <h2>{[mutation.data?.name, mutation.data?.surname].filter(Boolean).join(' ') || uiText('Новий профіль', language)}</h2>
            <Meta>{uiText('Автор:', language)} {mutation.createdBy}</Meta>
            <Meta>
              {uiText('Оновлено:', language)} {mutation.updatedAt ? formatDateTime(mutation.updatedAt, language) : '—'} · revision {mutation.revision}
            </Meta>
          </div>
          <Button onClick={() => openMutation(mutation)}>{uiText('Відкрити профіль', language)}</Button>
        </ProfileCard>)}
        {sharedMutations.length > 0 && <>
          <SectionHeader>
            <span>{uiText('Спільні чернетки', language)}</span>
            <Count aria-label={uiText('{count} спільних чернеток', language, { count: sharedMutations.length })}>{sharedMutations.length}</Count>
          </SectionHeader>
          {sharedMutations.map(mutation => <ProfileCard key={mutation.cardId}>
            <div>
              <Status $variant="overlay">{uiText('Спільна чернетка', language)}</Status>
              <h2>{[mutation.data?.name, mutation.data?.surname].filter(Boolean).join(' ') || uiText('Новий профіль', language)}</h2>
              <Meta>
                {uiText('Оновлено:', language)} {mutation.updatedAt ? formatDateTime(mutation.updatedAt, language) : '—'}
              </Meta>
            </div>
            <Button onClick={() => openMutation(mutation)}><FiUsers aria-hidden="true" /> {uiText('Додати свої правки', language)}</Button>
          </ProfileCard>)}
        </>}
      </>}
    </>}
  </Shell></Page>;
};

export default ProfileCreationWorkspace;
