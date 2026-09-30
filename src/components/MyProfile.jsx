import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiX } from 'react-icons/fi';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import styled, { css, keyframes } from 'styled-components';
import {
  auth,
  fetchProfileCardRole,
  fetchUserData,
  normalizeStoredDates,
  syncUserSearchIdIndex,
  updateProfileRole,
} from './config';
import { pickerFields, getFieldLabel, getFieldPlaceholder, getOptionLabel, getOptionValue } from './formFields';
import { makeUploadedInfo } from './makeUploadedInfo';
import { inputUpdateValue } from './inputUpdatedValue';
import { normalizeProfileFieldInput } from '../utils/profileNormalization';
import { PROFILE_ROLE_OPTIONS } from '../utils/profileRoleOptions';
import { listViewerRoles, resolveViewerCurrentRole } from '../utils/matchingPeerVisibility';
import { parseHiddenRoles } from '../utils/matchingCardIndex';
import { formatDateToDisplay, normalizePhoneValue } from './inputValidations';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import Photos from './Photos';
import InfoModal, {
  ModalActionRow,
  ModalDangerButton,
  ModalGhostButton,
  ModalText,
  ModalTitle,
} from './InfoModal';
import { uiText } from 'utils/uiTranslations';
import { isSearchIdIndexedField } from 'utils/searchKeyUtils';
import { useAppSettings } from 'hooks/useAppSettings';
import { resolveAccess } from 'utils/accessLevel';
import { getCurrentDate } from './foramtDate';
import { authNotifications } from './authNotifications';
import {
  buildAuthProfilePayload,
  buildAuthSessionPayload,
  markAuthSession,
  MY_PROFILE_DRAFT_STORAGE_KEY,
  persistUserWithFallback,
} from './authProfilePersistence';
import toast from 'react-hot-toast';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import { KnowMeBrand } from './styles/knowme';
import { resolveMyProfileFieldText, resolveMyProfileSectionTitle } from '../utils/myProfileRoleTexts';
import { ProgramsEditor } from './programs/ProgramsEditor';
import { ParentProfileFields } from './programs/RoleProfileFields';
import { useProgramDisplayCurrency, useProgramRates } from '../hooks/useProgramRates';
import {
  loadOwnPrograms,
  peekOwnPrograms,
  retryPendingPrograms,
  saveCardPrograms,
  useProgramsVersion,
} from '../utils/programsStore';
import { loadProgramTerms, rememberProgramTerms } from './programs/programsRemote';
import { listPrograms, listProgramBonuses, listProgramPayments } from '../utils/donorPrograms';
import { MyProfileCardPreview } from './MyProfileCardPreview';

const Page = styled.div`
  /* Локальні псевдоніми з глобальних KnowMe-токенів: сторінка автоматично підтримує світлу/темну тему. */
  --accent: var(--km-accent);
  --accent-light: var(--km-accent-light);
  --accent-mid: var(--km-accent-mid);
  --bg: var(--km-bg);
  --card: var(--km-card);
  --text: var(--km-text);
  --muted: var(--km-muted);
  --border: var(--km-border);
  --radius: var(--km-radius);
  --shadow: var(--km-shadow);
  font-family: var(--km-font);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
`;
const Topbar = styled.div`
  background: var(--card);
  border-bottom: 1px solid var(--border);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;
// Назву застосунку на ширшому за 600 px екрані вже несе спільна навігація
// (`PrimaryNavigation`), тож тут вона стояла другою, просто під першою. На
// телефоні навігація свою назву ховає — там ця лишається єдиною.
const TopbarBrand = styled.div`
  @media (min-width: 601px) {
    display: none;
  }
`;
const TopbarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
`;
// Шапка з назвою й меню «⋮» їде з рештою сторінки, а прогрес із вкладками
// розділів лишається вгорі (`StickyProgress`): це єдиний орієнтир у довгій
// анкеті — скільки заповнено і в якому розділі людина зараз. Коли прогрес
// поїхав разом зі шапкою, вкладки зникали на першому ж екрані прокрутки, і
// до іншого розділу лишалось гортати навмання.
const HeaderPanel = styled.div`
  background: var(--card);
`;
// Липкий блок стоїть сусідом `HeaderPanel`, а не всередині нього: `sticky`
// тримається лише в межах свого батька, і в шапці він відлипав би, щойно
// шапка сама виїхала за екран.
const StickyProgress = styled.div`
  position: sticky;
  top: env(safe-area-inset-top, 0px);
  z-index: 20;
  background: var(--card);
  border-bottom: 1px solid var(--border);
`;
const CONTENT_SECTION_TOP_GAP = 18;
// Наскільки вище за верх розділу зупиняється scrollToSection() і де scroll-spy
// вважає розділ активним. До цього відступу додається висота липкого блоку
// прогресу (`getStickyOffset`): інакше розділ ставав би під нього.
const SECTION_SCROLL_GAP = CONTENT_SECTION_TOP_GAP;
const SCROLL_ACTIVE_SECTION_GAP = 16;
const PROGRAMMATIC_SCROLL_FALLBACK_MS = 900;
const ProgressWrap = styled.div`padding: 16px 20px 0;`;
const Tabs = styled.div`padding:14px 20px;display:flex;gap:8px;overflow:auto;`;
const Tab = styled.button`
  flex-shrink: 0; padding: 6px 14px; border-radius: 99px; font-size: 13px; font-weight: 500;
  border: 1.5px solid ${({ $complete, $active }) => ($complete ? '#2E9B55' : $active ? 'var(--accent)' : 'var(--border)')};
  background: ${({ $active, $complete }) => ($active ? 'var(--accent)' : $complete ? '#EBF8EF' : 'var(--card)')};
  color: ${({ $active, $complete }) => ($active ? '#fff' : $complete ? '#2E9B55' : 'var(--muted)')};
`;
const Card = styled.div`
  margin: 0 20px 16px;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  scroll-margin-top: ${CONTENT_SECTION_TOP_GAP}px;
`;
const FirstContentCard = styled(Card)`margin-top: ${CONTENT_SECTION_TOP_GAP}px;`;
const Header = styled.div`display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border);background:var(--bg);`;
const FieldGroup = styled.div`padding:0 18px;`;
const Field = styled.div`padding:14px 0;border-bottom:1px solid var(--border); &:last-child{border-bottom:none;}`;
const Label = styled.div`font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:6px;`;
const Input = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 10px 38px 10px 14px;
  outline: none;
  &:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(232, 121, 26, .12); }
  ${({ $missing }) => $missing && `
    border-color: #D44;
    box-shadow: 0 0 0 3px rgba(221, 68, 68, .1);
  `}
`;
const TextArea = styled.textarea`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 10px 38px 10px 14px;
  outline: none;
  min-height: 90px;
  ${({ $missing }) => $missing && `
    border-color: #D44;
    box-shadow: 0 0 0 3px rgba(221, 68, 68, .1);
  `}
`;
const FieldControl = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
`;
const ClearFieldButton = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
`;
const ChipRow = styled.div`display:flex;flex-wrap:wrap;gap:6px;`;
const Chip = styled.button`
  padding: 6px 13px; border-radius: 99px; font-size: 13px; border: 1.5px solid ${({ selected }) => (selected ? 'var(--accent)' : 'var(--border)')};
  background: ${({ selected }) => (selected ? 'var(--accent-light)' : 'var(--card)')}; color: ${({ selected }) => (selected ? 'var(--accent)' : 'var(--muted)')};
  ${({ $missing }) => $missing && `
    border-color: #D44;
    box-shadow: 0 0 0 3px rgba(221, 68, 68, .1);
  `}
`;
const SubmitWrap = styled.div`padding:20px;`;
// Роль — перше рішення в анкеті: від неї залежить, які поля взагалі показувати.
// Тому вона стоїть над формою окремим рядом, а не полем усередині секції.
const RoleCard = styled.div`
  margin: ${CONTENT_SECTION_TOP_GAP}px 20px 16px;
  padding: 14px 18px;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
`;
const RoleCardTitle = styled.div`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .6px;
  color: var(--muted);
  margin-bottom: 10px;
`;
const RoleOptions = styled.div`display:flex;flex-wrap:wrap;gap:8px;`;
const RoleOption = styled.button`
  flex: 0 0 auto;
  padding: 7px 14px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1.5px solid ${({ $active }) => ($active ? 'var(--accent)' : 'var(--border)')};
  background: ${({ $active }) => ($active ? 'var(--accent)' : 'var(--card)')};
  color: ${({ $active }) => ($active ? '#fff' : 'var(--muted)')};
`;
const RoleHint = styled.p`margin:10px 0 0;font-size:11px;line-height:1.5;color:var(--muted);`;
const RoleVisibilityList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
`;
const RoleVisibilityRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: ${({ $hidden }) => ($hidden ? 'var(--muted)' : 'var(--text)')};

  b { font-weight: 600; }
`;
const RoleVisibilityButton = styled.button`
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;

  &:disabled { opacity: .45; cursor: default; }
`;
// Межа між двома анкетами однієї людини: друга стоїть під першою, і без
// підпису її розділи читались би як продовження першої.
const AnketaDivider = styled.div`
  margin: 28px 20px 10px;
  padding-top: 14px;
  border-top: 2px solid var(--border);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .4px;
  text-transform: uppercase;
  color: var(--muted);

  b { color: ${({ $hidden }) => ($hidden ? 'var(--muted)' : 'var(--text)')}; }
`;
const PhotoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: ${({ $isFirstContent }) => ($isFirstContent ? `${CONTENT_SECTION_TOP_GAP}px` : '0')} 20px 20px;
  padding: 18px;
  background: var(--card);
  border-radius: var(--radius);
  border: 1.5px dashed var(--border);
  box-shadow: var(--shadow);
  min-width: 0;
  scroll-margin-top: ${CONTENT_SECTION_TOP_GAP}px;
`;
const SubmitBtn = styled.button`width:100%;padding:16px;background:linear-gradient(135deg,#E8791A 0%,#F5A24B 100%);color:#fff;border:none;border-radius:var(--radius);font-size:16px;font-weight:700;`;
const CustomOptionWrap = styled.div`margin-top:10px;`;
const DotsButton = styled.button`
  display:flex;align-items:center;justify-content:center;
  width:34px;height:34px;border-radius:10px;border:1px solid var(--border);
  background:var(--card);cursor:pointer;font-size:22px;line-height:1;color:var(--muted);
  transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease, color .18s ease;

  &:hover {
    background: var(--accent-light);
    border-color: var(--accent);
    color: var(--accent);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(232, 121, 26, .16);
  }

  &:active {
    transform: scale(.98);
  }
`;

const AuthCard = styled(FirstContentCard)``;
const hintPulse = keyframes`
  0%, 100% { transform: translateX(0) scale(1); }
  25% { transform: translateX(-2px) scale(1.02); }
  50% { transform: translateX(2px) scale(1.03); }
  75% { transform: translateX(-1px) scale(1.02); }
`;
const StatusBadge = styled.button`
  border: none;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 99px;
  background: ${({ $published }) => ($published ? '#EBF8EF' : '#FEE9E9')};
  color: ${({ $published }) => ($published ? '#2E9B55' : '#D44')};
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
`;
const HighlightableLabel = styled(Label)`
  display: inline-block;
  ${({ $active }) => $active && css`
    color: var(--accent);
    animation: ${hintPulse} .45s ease-in-out;
  `}
`;

const AuthIntro = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
`;
const AuthField = styled(Field)`
  ${({ $missing }) => $missing && `
    ${Input} {
      border-color: #D44;
      box-shadow: 0 0 0 3px rgba(221, 68, 68, .1);
    }
  `}
`;
const PasswordToggleButton = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;

  &:hover {
    color: var(--text);
  }
`;
const TermsRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 0;
  border-radius: 12px;
  ${({ $missing, $active }) => ($missing || $active) && css`
    margin: 8px 0;
    padding: 14px 12px;
    background: rgba(221, 68, 68, .06);
    box-shadow: 0 0 0 3px rgba(221, 68, 68, .1);
    animation: ${hintPulse} .45s ease-in-out;
  `}
`;
const TermsCheckbox = styled.input`
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: var(--accent);
  flex-shrink: 0;
  ${({ $missing, $active }) => ($missing || $active) && `
    outline: 2px solid #D44;
    outline-offset: 2px;
  `}
`;
const TermsText = styled.div`
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
`;
const TermsButton = styled.button`
  border: none;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  padding: 0;
  cursor: pointer;
`;
const AuthActionButton = styled(SubmitBtn)`
  margin: 4px 0 20px;
  ${({ $active }) => $active && css`
    animation: ${hintPulse} .45s ease-in-out;
    box-shadow: 0 0 0 4px rgba(232, 121, 26, .16);
  `}
`;

const baseSections = [
  { key: 'personal', title: '👤 Особисті дані', fields: ['name', 'surname', 'phone', 'birth', 'country', 'region', 'city', 'maritalStatus'] },
  { key: 'medical', title: '🏥 Медична інформація', fields: ['height', 'weight', 'blood', 'surgeries', 'chronicDiseases', 'allergy', 'surrogacyExperience', 'ownKids', 'lastDelivery', 'csection', 'reward'] },
  { key: 'appearance', title: '✨ Зовнішність', fields: ['eyeColor', 'hairColor', 'hairStructure', 'bodyType', 'faceShape', 'noseShape', 'lipsShape', 'chin', 'clothingSize', 'shoeSize', 'breastSize', 'glasses', 'race'] },
  // VK прибрано: мережа заблокована в Україні з 2017 року, і поле для неї в
  // анкеті читалось як знак, чий це застосунок. Уже записане значення з
  // анкети не зникає — його просто більше не пропонують вводити.
  //
  // Сайт — теж тут: окремий блок «Послуги й досвід», де він стояв, прибрано
  // (його не заповнював ніхто), а сайт — такий самий спосіб знайти людину,
  // як і сторінка в мережі. Показується він лише агенції й клініці.
  { key: 'social', title: '📱 Соцмережі', fields: ['telegram', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'website'] },
  { key: 'lifestyle', title: '🌿 Спосіб життя', fields: ['smoking', 'alcohol', 'sport', 'education', 'profession', 'hobbies', 'twinsInFamily', 'moreInfo_main', 'surrogacyProgramInterest'] },
];

const MY_PROFILE_DATE_FIELDS = new Set(['birth', 'lastDelivery']);

// Поля-обʼєкти розділів батьків (`roleSections`). Програм тут немає: вони
// лежать окремо (`utils/programsStore`), а не в анкеті.
const OBJECT_PROFILE_FIELDS = new Set(['parentPreferences']);

const visibleNonDonorFields = new Set(['name','surname','email','phone','telegram','facebook','instagram','tiktok','country','region','city','moreInfo_main','website']);

// Сайт — лише агенції й клініці: донорці це поле тільки знижувало б відсоток
// заповненості.
const ORGANISATION_ONLY_FIELDS = new Set(['website']);
const PERSON_ROLES = ['ed', 'sm'];
const ORGANISATION_ROLES = ['ag', 'cl'];
const KNOWN_ROLES = new Set(PROFILE_ROLE_OPTIONS.map(option => option.value));

// Поля «Мого профілю», яких немає в спільному `pickerFields`: той перелік
// малює десяток інших екранів, і чіпати його заради одного поля не можна.
const MY_PROFILE_EXTRA_FIELDS = [
  { name: 'website', label: 'Сайт', ukrainian: 'Сайт', placeholder: 'https://', svg: 'no' },
];

/**
 * Ролі анкети по порядку, основна — остання (так її читає стрічка,
 * `resolveViewerCurrentRole`).
 *
 * Картка не несе сховану роль (`hiddenRoles`), тож ролі з картки
 * доповнюються схованими. Порядок береться з анкети, коли вона каже про ті
 * самі ролі: інакше, сховавши основну роль, людина бачила б, як основною
 * стає друга.
 */
export const resolveMyProfileRoles = ({ cardRole, storedRole, hiddenRoles }) => {
  const fromCard = listViewerRoles(cardRole).filter(role => KNOWN_ROLES.has(role));
  const hidden = parseHiddenRoles(hiddenRoles).filter(role => KNOWN_ROLES.has(role));
  const combined = [...hidden.filter(role => !fromCard.includes(role)), ...fromCard];
  const stored = [...new Set(listViewerRoles(storedRole).filter(role => KNOWN_ROLES.has(role)))];
  if (stored.length === combined.length && stored.every(role => combined.includes(role))) return stored;
  return [...new Set(combined)];
};

/**
 * Чого «очистити все» не чіпає.
 *
 * Пошта — це логін, а не поле анкети: стерши її, людина втратила б вхід у
 * власний профіль, і «очистити» перетворилось би на «видалити акаунт», якого
 * ніхто не просив. Пароль і `userId` тут узагалі не поля форми, а роль
 * зберігається окремим шляхом (`updateProfileRole`) і порожнім рядком не
 * буває.
 */
const CLEAR_ALL_PROTECTED_FIELDS = new Set([
  'email',
  'password',
  'userId',
  'userRole',
  'role',
  'publish',
  'accessLevel',
]);

// Ким людина заявляє себе в матчингу — той самий перелік, що й на реєстрації
// (`utils/profileRoleOptions`).
const MY_PROFILE_ROLE_OPTIONS = PROFILE_ROLE_OPTIONS;
const readMyProfileDraft = () => {
  const savedDraft = localStorage.getItem(MY_PROFILE_DRAFT_STORAGE_KEY);
  if (!savedDraft) return null;

  try {
    const parsedDraft = JSON.parse(savedDraft);
    if (!parsedDraft || typeof parsedDraft !== 'object' || Array.isArray(parsedDraft)) {
      return null;
    }

    const { password: _password, userId: _userId, publish: _publish, ...draftFields } = parsedDraft;
    return { ...draftFields, password: '' };
  } catch (error) {
    console.warn('Failed to load MyProfile draft.', error);
    localStorage.removeItem(MY_PROFILE_DRAFT_STORAGE_KEY);
    return null;
  }
};

const buildMyProfileDraft = profileState => {
  const { password: _password, userId: _userId, publish: _publish, ...draftState } = profileState || {};
  return draftState;
};

const getStoredAuthenticatedOwnerId = () => (
  localStorage.getItem('isLoggedIn') === 'true' ? localStorage.getItem('ownerId') || '' : ''
);

export const MyProfile = () => {
  // «Мій профіль» — той самий набір полів, що й картка в матчингу, тож і мова
  // в нього та сама: підписи, чіпи варіантів, заголовки блоків і тости.
  const { language } = useAppSettings();
  const [state, setState] = useState(() => readMyProfileDraft() || {});
  const navigate = useNavigate();
  const currentUid = auth.currentUser?.uid || getStoredAuthenticatedOwnerId();
  const access = resolveAccess({
    uid: currentUid,
    accessLevel: state.accessLevel || localStorage.getItem('accessLevel'),
    canCreateProfiles: state.canCreateProfiles === true,
  });
  const isAdmin = access.isAdmin;
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isClearingProfile, setIsClearingProfile] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [userId, setUserId] = useState('');
  const [activeTab, setActiveTab] = useState('auth');
  const [customOptionMode, setCustomOptionMode] = useState({});
  const [missing, setMissing] = useState({});
  const [hasAgreed, setHasAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authHintStep, setAuthHintStep] = useState('');
  // Ролі анкети, основна — остання. Порожньо — анкета ще не прочитана,
  // і роль бере `state.userRole`.
  const [profileRoles, setProfileRoles] = useState([]);
  const [programTerms, setProgramTerms] = useState(null);
  const sectionRefs = useRef({});
  const tabsRef = useRef(null);
  const stickyProgressRef = useRef(null);
  const tabRefs = useRef({});
  const isManualScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const latestFetchUidRef = useRef('');
  const activeAuthUidRef = useRef('');
  const authSessionGenerationRef = useRef(0);
  const saveQueueRef = useRef(Promise.resolve());
  const stateRef = useRef(state);
  const editedFieldsRef = useRef(new Set());
  const authHintTimersRef = useRef([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const resetAuthenticatedProfileState = useCallback(() => {
    authSessionGenerationRef.current += 1;
    latestFetchUidRef.current = '';
    activeAuthUidRef.current = '';
    saveQueueRef.current = Promise.resolve();
    editedFieldsRef.current = new Set();
    stateRef.current = {};
    setState({});
    setUserId('');
    setMissing({});
    setHasAgreed(false);
  }, []);

  const restoreLocalDraft = useCallback(() => {
    if (userId || stateRef.current.userId) return;

    const localDraft = readMyProfileDraft();
    if (!localDraft) return;

    setState(prevState => {
      if (prevState.userId) return prevState;
      const nextState = { ...prevState, ...localDraft, password: prevState.password || '' };
      stateRef.current = nextState;
      return nextState;
    });
  }, [userId]);

  useEffect(() => {
    restoreLocalDraft();
  }, [restoreLocalDraft]);

  useEffect(() => {
    window.addEventListener('focus', restoreLocalDraft);
    window.addEventListener('pageshow', restoreLocalDraft);

    return () => {
      window.removeEventListener('focus', restoreLocalDraft);
      window.removeEventListener('pageshow', restoreLocalDraft);
    };
  }, [restoreLocalDraft]);

  useEffect(() => {
    if (userId || state.userId) return;

    localStorage.setItem(MY_PROFILE_DRAFT_STORAGE_KEY, JSON.stringify(buildMyProfileDraft(state)));
  }, [state, userId]);

  useEffect(() => () => {
    authHintTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    if (programmaticScrollTimeoutRef.current) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
    }
    if (scrollFrameRef.current) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }
  }, []);

  const normalizeProfileData = useCallback((data = {}) => Object.entries(data).reduce((acc, [key, value]) => {
    if (key === 'password') {
      return acc;
    }

    if (key === 'photos' && Array.isArray(value)) {
      acc[key] = value;
      return acc;
    }

    const current = Array.isArray(value)
      ? (value.length > 0 ? value[value.length - 1] : '')
      : value;
    // У базі дата лежить як `РРРР-ММ-ДД`, а поле просить `дд.мм.рррр` — і
    // саме в ньому людина її вводила. Показувати ISO означало б і збивати
    // людину з пантелику, і віддавати в розбір поля формат, якого воно не чекає.
    acc[key] = MY_PROFILE_DATE_FIELDS.has(key) && typeof current === 'string'
      ? formatDateToDisplay(current)
      : current;
    return acc;
  }, {}), []);

  const mergeLoadedProfileData = useCallback((loadedData, uid) => {
    setState(prevState => {
      const protectedFields = editedFieldsRef.current;
      const nextState = { userRole: 'ed', ...loadedData, userId: uid };

      protectedFields.forEach(fieldName => {
        if (Object.prototype.hasOwnProperty.call(prevState, fieldName)) {
          nextState[fieldName] = prevState[fieldName];
        }
      });

      stateRef.current = nextState;
      return nextState;
    });
  }, []);

  const loadAuthenticatedProfile = useCallback(async (uid, shouldApply = () => true) => {
    latestFetchUidRef.current = uid;
    setUserId(uid);

    try {
      const [{ existingData }, cardRole] = await Promise.all([
        fetchUserData(uid),
        fetchProfileCardRole(uid).catch(() => null),
      ]);

      if (!shouldApply() || latestFetchUidRef.current !== uid) {
        return false;
      }

      // Роль показуємо ту саму, за якою гортає стрічка, — з картки. Firestore
      // тримав роль з останнього входу, і форма її й показувала, хоч людина
      // обирала іншу тут же, у «Хто ви».
      const loadedProfile = normalizeProfileData(existingData || {});
      const currentCardRole = resolveViewerCurrentRole(cardRole);
      const roles = resolveMyProfileRoles({
        cardRole,
        storedRole: existingData?.userRole,
        hiddenRoles: existingData?.hiddenRoles,
      });
      setProfileRoles(roles);
      const primaryRole = roles[roles.length - 1] || currentCardRole;
      if (primaryRole) {
        loadedProfile.userRole = primaryRole;
        loadedProfile.role = primaryRole;
      }
      mergeLoadedProfileData(loadedProfile, uid);
      return true;
    } catch (error) {
      console.warn('Failed to load MyProfile profile data.', error);
      if (!shouldApply() || latestFetchUidRef.current !== uid) {
        return false;
      }
      setUserId('');
      restoreLocalDraft();
      return false;
    }
  }, [mergeLoadedProfileData, normalizeProfileData, restoreLocalDraft]);

  // Країна, область, місто й зріст приводяться до канонічного вигляду саме
  // тут, на blur, а не під час набору: «Кие» — це ще не «Київ». Інакше в базу
  // йшло, як набрали, — «Украина», «Днепропетровская», зріст у футах, — і
  // стрічка потім показувала це як є (`utils/profileNormalization`).
  const normalizeFieldValue = (name, value, field) => (
    name === 'phone'
      ? normalizePhoneValue(value)
      : normalizeProfileFieldInput(name, inputUpdateValue(value, field))
  );

  const updateFieldValue = (name, value, field) => {
    // Keep a phone number exactly as entered until blur so incomplete prefixes
    // such as `00` are not rewritten before the user can finish typing them.
    const updatedValue = name === 'phone' ? value : inputUpdateValue(value, field);
    editedFieldsRef.current.add(name);
    setMissing(prev => ({ ...prev, [name]: false }));

    setState(prevState => {
      const nextState = {
        ...prevState,
        [name]: updatedValue,
      };

      stateRef.current = nextState;
      return nextState;
    });
  };

  const saveFieldValue = (name, value, field) => {
    const updatedValue = normalizeFieldValue(name, value, field);
    editedFieldsRef.current.add(name);
    setMissing(prev => ({ ...prev, [name]: false }));

    const nextState = {
      ...stateRef.current,
      [name]: updatedValue,
    };

    stateRef.current = nextState;
    setState(nextState);
    // Індексується кожне поле, яке в `searchId` взагалі живе, а не сам лише
    // телефон. Умова була саме про телефон — і анкета з прізвищем, поштою чи
    // телеграмом, набраними тут, за ними не знаходилась: поза цією гілкою
    // `syncUserSearchIdIndex` з «Мого профілю» не викликається ніде, а
    // `updateDataInRealtimeDB` індексу не чіпає взагалі.
    triggerAutosave(nextState, { searchIdFields: isSearchIdIndexedField(name) ? [name] : [] });
  };

  const clearFieldValue = (name, field) => {
    saveFieldValue(name, '', field);
  };

  const normalizedRole = String(state.userRole || state.role || '').trim().toLowerCase();
  const selectedRole = MY_PROFILE_ROLE_OPTIONS.some(option => option.value === normalizedRole)
    ? normalizedRole
    : 'ed';
  // Ролей буває дві: донорка, яка ще й підбирає донорок як агентка. Основна
  // — та, під якою людина гортає стрічку; друга додає свою анкету під першою.
  const rolesList = useMemo(() => {
    const list = profileRoles.length ? profileRoles.filter(role => role !== selectedRole) : [];
    return [...list, selectedRole];
  }, [profileRoles, selectedRole]);
  const secondaryRole = rolesList.length > 1 ? rolesList[0] : '';
  const personRole = rolesList.find(role => PERSON_ROLES.includes(role)) || '';
  const organisationRole = rolesList.find(role => ORGANISATION_ROLES.includes(role)) || '';
  const isDonorRole = Boolean(personRole) || !normalizedRole || ['donor', 'до'].includes(normalizedRole);
  // Заголовки спільних розділів говорять мовою анкети, якій ці поля належать:
  // у донорки, яка ще й агентка, «Особисті дані» — її, а не агенції.
  const sectionTitleRole = personRole || selectedRole;
  const hiddenRoles = useMemo(() => parseHiddenRoles(state.hiddenRoles), [state.hiddenRoles]);

  /**
   * Змінити роль анкети.
   *
   * Роль — не звичайне поле форми: від неї залежить, які поля анкета взагалі
   * показує, і живе вона в картці стрічки, а не в тілі анкети. Тому вона й
   * зберігається окремим шляхом (`updateProfileRole`), який пише обидва
   * написання (`userRole` і `role`) і пересуває анкету в бакеті фільтра.
   * Автозбереження форми цього не вміє: воно лише додало б нове значення до
   * старого, і анкета лишилась би ще й у попередній ролі.
   */
  const writeProfileRoles = useCallback(async (roles, primaryRole) => {
    const targetUserId = userId || stateRef.current?.userId;
    editedFieldsRef.current.add('userRole');
    setProfileRoles(roles);
    setState(prevState => {
      const nextState = { ...prevState, userRole: primaryRole, role: primaryRole };
      stateRef.current = nextState;
      return nextState;
    });

    // Поки анкети ще немає в базі (реєстрацію не підтвердили), роль лишається в
    // чернетці — вона поїде разом з анкетою при першому збереженні.
    if (!targetUserId) return;

    try {
      await updateProfileRole(targetUserId, roles);
    } catch (error) {
      console.warn('Failed to change profile role.', error);
      toast.error(uiText('Не вдалося змінити роль — спробуйте ще раз', language));
    }
  }, [language, userId]);

  const changeUserRole = useCallback(async nextRole => {
    const role = String(nextRole || '').trim().toLowerCase();
    if (!role || role === normalizedRole) return;
    // Друга роль лишається другою; якщо основною стала саме вона — друга
    // знімається, а не дублює основну.
    const roles = [...rolesList.slice(0, -1).filter(item => item !== role), role];
    await writeProfileRoles(roles, role);
  }, [normalizedRole, rolesList, writeProfileRoles]);

  const changeSecondaryRole = useCallback(async nextRole => {
    const role = String(nextRole || '').trim().toLowerCase();
    if (role === selectedRole || role === secondaryRole) return;
    const roles = role ? [role, selectedRole] : [selectedRole];
    // Роль, якої більше немає, не лишається й серед схованих.
    const stillHidden = hiddenRoles.filter(item => roles.includes(item));
    if (stillHidden.length !== hiddenRoles.length) saveRoleField('hiddenRoles', stillHidden.join(','));
    await writeProfileRoles(roles, selectedRole);
  }, [hiddenRoles, secondaryRole, selectedRole, writeProfileRoles]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Сховати одну з двох анкет — скажімо, агентську, поки набору немає, — не
   * знімаючи з публікації другу. Картка стрічки сховану роль не несе
   * (`buildMatchingCardProjection`). Сховати єдину видиму роль тут не можна:
   * для цього є «Зняти з публікації».
   */
  const toggleRoleHidden = role => {
    const next = hiddenRoles.includes(role)
      ? hiddenRoles.filter(item => item !== role)
      : [...hiddenRoles, role];
    if (rolesList.every(item => next.includes(item))) return;
    saveRoleField('hiddenRoles', next.join(','));
  };
  const isProfileAccessConfirmed = Boolean(userId || state.userId);
  const sections = useMemo(() => baseSections.map(section => {
    if (section.key !== 'personal' || !isProfileAccessConfirmed || section.fields.includes('email')) {
      return section;
    }

    const fields = [...section.fields];
    fields.splice(2, 0, 'email');
    return { ...section, fields };
  }), [isProfileAccessConfirmed]);
  // Назву розділу бере роль (`resolveMyProfileSectionTitle`): агенція бачить
  // «Агенція» й «Про агенцію», а не «Особисті дані» й «Спосіб життя».
  // Агенція й клініка мають ще розділ програм, а біологічні батьки — «кого
  // шукаєте». Розділ основної ролі стоїть одразу після «Особистих даних», бо
  // саме за ним її й знаходять у стрічці; розділ другої ролі — окремою
  // анкетою під першою (`anketaRole`). Малює їх не `renderField`, а свій
  // компонент (`custom`): програма — це запис із десятком полів, а не одне
  // поле форми.
  //
  // «Послуги й досвід» тут був і пішов: його не заповнював ніхто, а сайт з
  // нього переїхав у «Соцмережі».
  const roleSectionsFor = useCallback(role => {
    if (ORGANISATION_ROLES.includes(role)) {
      return [{ key: 'programs', title: '💶 Програми', fields: ['programs'], custom: 'programs' }];
    }
    if (role === 'ip') {
      return [{ key: 'search', title: '🔎 Кого шукаєте', fields: ['seeking', 'programLocation', 'parentVia'], custom: 'parents' }];
    }
    return [];
  }, []);
  const roleSections = useMemo(() => roleSectionsFor(selectedRole), [roleSectionsFor, selectedRole]);
  const secondaryRoleSections = useMemo(() => (secondaryRole
    ? roleSectionsFor(secondaryRole)
      .filter(section => !roleSections.some(item => item.key === section.key))
      .map((section, index) => (index === 0 ? { ...section, anketaRole: secondaryRole } : section))
    : []), [roleSections, roleSectionsFor, secondaryRole]);
  const visibleSections = useMemo(() => {
    const base = sections
      .map(section => ({
        ...section,
        title: resolveMyProfileSectionTitle(section.key, sectionTitleRole, section.title),
        fields: section.fields
          .filter(name => isDonorRole || visibleNonDonorFields.has(name))
          .filter(name => organisationRole || !ORGANISATION_ONLY_FIELDS.has(name)),
      }))
      .filter(section => section.fields.length > 0);
    const personalIndex = base.findIndex(section => section.key === 'personal');
    return [
      ...base.slice(0, personalIndex + 1),
      ...roleSections,
      ...base.slice(personalIndex + 1),
      ...secondaryRoleSections,
    ];
  }, [isDonorRole, organisationRole, roleSections, secondaryRoleSections, sectionTitleRole, sections]);
  const programRates = useProgramRates(Boolean(organisationRole));
  const [programDisplayCurrency, setProgramDisplayCurrency] = useProgramDisplayCurrency();

  // Програми — не поле анкети: вони лежать у `multiData/programs/{uid}`, і
  // «Мій профіль» бере їх так само, як стрічка, — спершу з браузера.
  const programsVersion = useProgramsVersion();
  const programsOwnerId = userId || state.userId || '';
  const ownProgramsEntry = useMemo(
    () => (programsOwnerId ? peekOwnPrograms(programsOwnerId) : null),
    [programsOwnerId, programsVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ownPrograms = ownProgramsEntry?.items || null;
  const ownVisiblePrograms = useMemo(() => listPrograms(ownPrograms), [ownPrograms]);
  const ownProgramsCount = useMemo(() => listPrograms(ownPrograms, { includeHidden: true }).length, [ownPrograms]);

  useEffect(() => {
    if (!programsOwnerId || !organisationRole) return undefined;
    let cancelled = false;
    (async () => {
      // Не збережене минулого разу (відмова бази, закрита вкладка) —
      // спершу дописується, і лише тоді база може щось перебити.
      await retryPendingPrograms(programsOwnerId).catch(error => {
        console.warn('[programs] програми з цього браузера досі не в базі', error);
      });
      const loaded = await loadOwnPrograms(programsOwnerId);
      if (cancelled) return;
      // Перша версія клала програми в анкету. Знайдені там переносяться в
      // окремий вузол — і з анкети знімаються лише після вдалого запису.
      const legacy = stateRef.current?.programs;
      if (!loaded && legacy && typeof legacy === 'object' && Object.keys(legacy).length) {
        try {
          await saveCardPrograms(programsOwnerId, legacy);
          if (!cancelled) saveRoleField('programs', null);
        } catch (error) {
          console.warn('[programs] не вдалося перенести програми з анкети', error);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [organisationRole, programsOwnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!organisationRole || programTerms) return;
    loadProgramTerms().then(setProgramTerms);
  }, [organisationRole, programTerms]);

  const saveOwnPrograms = useCallback(record => {
    const targetUserId = userId || stateRef.current?.userId;
    if (!targetUserId) return;
    const list = listPrograms(record, { includeHidden: true });
    saveCardPrograms(targetUserId, record || {})
      .then(() => Promise.all([
        rememberProgramTerms('payment', list.flatMap(program => listProgramPayments(program).filter(item => item.key.startsWith('other-')).map(item => item.label))),
        rememberProgramTerms('bonus', list.flatMap(program => listProgramBonuses(program).filter(item => item.key.startsWith('bonus-')).map(item => item.label))),
      ]))
      .catch(error => {
        console.warn('[programs] програми не збереглись у базі', error);
        toast.error(uiText('Програми поки лише в цьому браузері — збережемо, коли база відповість', language), { id: 'programs-save-failed' });
      });
  }, [language, userId]);
  const firstSectionKey = visibleSections[0]?.key || 'personal';
  const navSections = useMemo(() => [
    ...(!isProfileAccessConfirmed ? [{ key: 'auth', title: '🔐 Доступ до анкети', fields: ['email', 'password', 'terms'], isVirtual: true }] : []),
    { key: 'photo', title: '📷 Фото', fields: ['photos'], isVirtual: true },
    ...visibleSections,
  ], [isProfileAccessConfirmed, visibleSections]);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user?.uid) {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('ownerId');
        resetAuthenticatedProfileState();
        restoreLocalDraft();
        return;
      }

      const uid = user.uid;
      const hasLocalProfileState = Object.keys(stateRef.current || {}).length > 0;
      if (activeAuthUidRef.current !== uid && (activeAuthUidRef.current || hasLocalProfileState)) {
        resetAuthenticatedProfileState();
      }
      activeAuthUidRef.current = uid;
      await loadAuthenticatedProfile(uid, () => isMounted);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [loadAuthenticatedProfile, resetAuthenticatedProfileState, restoreLocalDraft]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setIsEmailVerified(Boolean(user?.emailVerified));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (state.areTermsConfirmed && !hasAgreed) {
      setHasAgreed(true);
    }
  }, [state.areTermsConfirmed, hasAgreed]);

  const handleExit = async () => {
    await saveQueueRef.current.catch(error => {
      console.warn('Failed to finish MyProfile autosave before logout.', error);
    });
    resetAuthenticatedProfileState();
    await signOut(auth);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('ownerId');
    navigate('/');
  };

  const dotsMenu = () => (
    <ProfileDotsMenu
      navigate={navigate}
      isAdmin={isAdmin}
      access={access}
      isEmailVerified={isEmailVerified}
      showVerifyEmail
      isSessionActive={isProfileAccessConfirmed}
      onExit={handleExit}
      // «Видалити анкету» стоїть у меню всюди, де є анкета (`ProfileScreen`,
      // `MyProfileOld`, `AddNewProfile`), і саме тут його не передавали — тож
      // `ProfileDotsMenu` цілу секцію «Анкета» не малював. Видалення профілю —
      // це лист на пошту з темою «Видаліть мою анкету» (`delProfile` в
      // `InfoModal`): акаунт і сліди в чужих списках знімає людина, а не
      // кнопка.
      onDeleteProfile={() => setShowInfoModal('delProfile')}
      onSelect={() => setShowInfoModal(false)}
      // «Очистити все» стояло кнопкою просто під «Опублікувати» — незворотна
      // дія поруч із головною, на відстані одного промаху пальцем. Тепер вона
      // тут, поруч із «Видалити анкету», і так само питає підтвердження.
      onClearProfile={isProfileAccessConfirmed ? () => setShowInfoModal('delConfirm') : undefined}
    />
  );

  const fieldsMap = useMemo(() => new Map([...pickerFields, ...MY_PROFILE_EXTRA_FIELDS].map(field => [field.name, field])), []);
  // Програми заповнені, коли вони є в сховищі, а не в анкеті.
  const isFieldFilled = useCallback(name => (name === 'programs'
    ? ownProgramsCount > 0
    : String(state[name] || '').trim() !== ''), [ownProgramsCount, state]);
  // Лічильник «3 з 8» поруч із відсотком: самі «8%» не казали, скільки
  // лишилось, а людина з чотирма фото й поштою не розуміла, звідки така цифра.
  const filledStats = useMemo(() => {
    const keys = visibleSections.flatMap(s => s.fields);
    const filled = keys.filter(isFieldFilled).length;
    return { filled, total: keys.length };
  }, [isFieldFilled, visibleSections]);
  const filledPct = filledStats.total ? Math.round((filledStats.filled / filledStats.total) * 100) : 0;


  const sectionProgress = useMemo(() => visibleSections.reduce((acc, section) => {
    const filled = section.fields.filter(isFieldFilled).length;
    const total = section.fields.length;
    acc[section.key] = {
      filled,
      total,
      complete: total > 0 && filled === total,
      progress: total > 0 ? Math.round((filled / total) * 100) : 0,
    };
    return acc;
  }, {}), [isFieldFilled, visibleSections]);


  const getSectionEntries = useCallback(() => navSections
    .map(section => ({ key: section.key, node: sectionRefs.current[section.key] }))
    .filter(item => Boolean(item.node)), [navSections]);

  // Висота міряється щоразу, а не один раз: блок переноситься на два рядки
  // вкладок на вузькому екрані й міняє висоту разом із поворотом телефона.
  const getStickyOffset = useCallback(
    () => stickyProgressRef.current?.getBoundingClientRect().height || 0,
    [],
  );

  const getSectionTargetTop = useCallback((sectionEl) => {
    const sectionTop = sectionEl.getBoundingClientRect().top + window.scrollY;
    return Math.max(0, Math.round(sectionTop - getStickyOffset() - SECTION_SCROLL_GAP));
  }, [getStickyOffset]);

  const getActiveSectionKeyByScroll = useCallback(() => {
    const entries = getSectionEntries();
    if (entries.length === 0) return '';

    const activationLine = window.scrollY + getStickyOffset() + SECTION_SCROLL_GAP + SCROLL_ACTIVE_SECTION_GAP;
    let activeKey = entries[0].key;

    entries.forEach(({ key, node }) => {
      const sectionTop = node.getBoundingClientRect().top + window.scrollY;
      if (sectionTop <= activationLine) {
        activeKey = key;
      }
    });

    return activeKey;
  }, [getSectionEntries, getStickyOffset]);

  const finishProgrammaticScroll = useCallback(() => {
    isManualScrollRef.current = false;
    if (programmaticScrollTimeoutRef.current) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
      programmaticScrollTimeoutRef.current = null;
    }
  }, []);

  const scrollToSection = useCallback((sectionKey) => {
    const sectionEl = sectionRefs.current[sectionKey];
    setActiveTab(sectionKey);
    if (!sectionEl) return;

    isManualScrollRef.current = true;

    if (programmaticScrollTimeoutRef.current) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
    }

    const targetTop = getSectionTargetTop(sectionEl);
    window.scrollTo({ top: targetTop, behavior: 'smooth' });

    programmaticScrollTimeoutRef.current = window.setTimeout(() => {
      finishProgrammaticScroll();
    }, PROGRAMMATIC_SCROLL_FALLBACK_MS);
  }, [finishProgrammaticScroll, getSectionTargetTop]);

  useEffect(() => {
    const handleScroll = () => {
      if (scrollFrameRef.current) return;

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;

        if (isManualScrollRef.current) {
          const activeSectionEl = sectionRefs.current[activeTab];
          if (activeSectionEl && Math.abs(window.scrollY - getSectionTargetTop(activeSectionEl)) <= 2) {
            finishProgrammaticScroll();
          }
          return;
        }

        const nextActiveKey = getActiveSectionKeyByScroll();
        if (nextActiveKey) {
          setActiveTab(prev => (prev === nextActiveKey ? prev : nextActiveKey));
        }
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [activeTab, finishProgrammaticScroll, getActiveSectionKeyByScroll, getSectionTargetTop]);


  useEffect(() => {
    if (navSections.some(section => section.key === activeTab)) return;
    setActiveTab(firstSectionKey);
  }, [activeTab, firstSectionKey, navSections]);


  useEffect(() => {
    const tabsEl = tabsRef.current;
    const activeTabEl = tabRefs.current[activeTab];

    if (!tabsEl || !activeTabEl) return;

    const tabsRect = tabsEl.getBoundingClientRect();
    const activeTabRect = activeTabEl.getBoundingClientRect();
    const targetLeft = tabsEl.scrollLeft
      + activeTabRect.left
      - tabsRect.left
      - ((tabsRect.width - activeTabRect.width) / 2);

    tabsEl.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [activeTab]);

  const handleAuthBadgeClick = () => {
    if (isProfileAccessConfirmed) return;

    authHintTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    scrollToSection('auth');
    const sequence = ['email', 'password', 'terms', 'submit'];
    setAuthHintStep('');
    authHintTimersRef.current = sequence.flatMap((step, index) => ([
      window.setTimeout(() => setAuthHintStep(step), 60 + index * 520),
      window.setTimeout(() => setAuthHintStep(''), 460 + index * 520),
    ]));
  };

  const isValidEmail = email => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
  };

  const persistUserProfile = persistUserWithFallback;

  const handleAuthConfirm = async () => {
    const currentState = stateRef.current || {};
    const normalizedEmail = String(currentState.email || '').trim();
    const password = String(currentState.password || '');
    const miss = {};

    if (!normalizedEmail) {
      miss.email = true;
      authNotifications.emailRequired();
    } else if (!isValidEmail(normalizedEmail)) {
      miss.email = true;
      authNotifications.invalidEmail();
    }

    if (!password.trim()) {
      miss.password = true;
      authNotifications.passwordRequired();
    }

    if (!hasAgreed) {
      miss.terms = true;
      authNotifications.termsRequired();
    }

    setMissing(miss);

    if (Object.keys(miss).length) return;

    try {
      const { todayDays, todayDash } = getCurrentDate();
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      let userCredential;
      let uploadedInfo;
      let authenticatedProfileLoaded = true;
      const { password: _password, userId: _userId, ...draftProfileData } = stateRef.current;

      if (methods.length > 0) {
        userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        resetAuthenticatedProfileState();
        activeAuthUidRef.current = userCredential.user.uid;
        latestFetchUidRef.current = userCredential.user.uid;
        setUserId(userCredential.user.uid);
        uploadedInfo = buildAuthSessionPayload({ todayDays, todayDash });
        await persistUserProfile(userCredential.user.uid, uploadedInfo, 'update');
        authenticatedProfileLoaded = await loadAuthenticatedProfile(userCredential.user.uid);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await sendEmailVerification(userCredential.user);
        uploadedInfo = buildAuthProfilePayload({
          email: normalizedEmail,
          userId: userCredential.user.uid,
          todayDays,
          todayDash,
          isRegistration: true,
          extraProfileData: draftProfileData,
        });
        await persistUserProfile(userCredential.user.uid, uploadedInfo, 'set');
      }

      markAuthSession({ email: normalizedEmail, userId: userCredential.user.uid });

      setHasAgreed(true);
      if (authenticatedProfileLoaded) {
        setUserId(userCredential.user.uid);
      }
      setMissing({});
      if (methods.length === 0) {
        const nextState = {
          ...stateRef.current,
          ...uploadedInfo,
          password: stateRef.current.password,
        };
        stateRef.current = nextState;
        setState(nextState);
      }
    } catch (error) {
      const errorCode = String(error?.code || '');

      if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        setMissing(prev => ({ ...prev, password: true }));
        authNotifications.wrongPassword();
      } else if (errorCode === 'auth/invalid-email') {
        setMissing(prev => ({ ...prev, email: true }));
        authNotifications.invalidEmail();
      } else if (errorCode === 'auth/weak-password') {
        setMissing(prev => ({ ...prev, password: true }));
        authNotifications.weakPassword();
      } else {
        console.error('auth error', error);
        authNotifications.genericAuthError();
      }
    }
  };

  const saveState = (nextState, { directFields = [], searchIdFields = [] } = {}) => {
    const targetUserId = userId || nextState?.userId || stateRef.current.userId;
    if (!targetUserId) return Promise.resolve();
    const sessionGeneration = authSessionGenerationRef.current;

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (
          authSessionGenerationRef.current !== sessionGeneration ||
          auth.currentUser?.uid !== targetUserId
        ) return;
        const { existingData } = await fetchUserData(targetUserId);
        if (
          authSessionGenerationRef.current !== sessionGeneration ||
          auth.currentUser?.uid !== targetUserId
        ) return;
        const { password: _password, ...profileData } = nextState;
        // Дата у формі — `дд.мм.рррр`, у базі — `РРРР-ММ-ДД`. Порівнювати їх
        // у `makeUploadedInfo` без зведення до одного написання означало
        // бачити «нове значення» там, де людина нічого не міняла: після
        // першого ж автозбереження будь-якого поля `birth` щойно створеного
        // акаунта ставав масивом `['1993-04-15', '1993-04-15']`, і картка
        // показувала нерозібрану дату замість віку.
        const normalizedProfileData = normalizeStoredDates({
          ...profileData,
          userRole: profileData.userRole || 'ed',
        });
        const uploadedInfo = makeUploadedInfo(existingData, normalizedProfileData);
        directFields.forEach(field => {
          if (Object.prototype.hasOwnProperty.call(normalizedProfileData, field)) {
            uploadedInfo[field] = normalizedProfileData[field];
          }
        });
        delete uploadedInfo.password;
        if (searchIdFields.length > 0) {
          await syncUserSearchIdIndex(targetUserId, existingData, uploadedInfo, searchIdFields);
        }
        await persistUserProfile(targetUserId, uploadedInfo, 'check');
      });

    return saveQueueRef.current;
  };

  // Поля нових розділів пишуться напряму (`directFields`): програми й
  // побажання — обʼєкти, а `makeUploadedInfo` зводить значення до історії
  // версій, яка для них нічого не означає.
  const saveRoleField = (name, value) => {
    const nextState = { ...stateRef.current, [name]: value };
    stateRef.current = nextState;
    setState(nextState);
    triggerAutosave(nextState, { directFields: [name] });
  };

  const triggerAutosave = (nextState, options) => {
    saveState(nextState, options).catch(error => {
      console.warn('Autosave failed in MyProfile.', error);
    });
  };

  const getSectionKeyByField = fieldName => visibleSections.find(section => section.fields.includes(fieldName))?.key || 'personal';

  const validateRequiredProfileFields = () => {
    const currentState = stateRef.current || {};
    const miss = {};
    const missingFieldNames = visibleSections
      .flatMap(section => section.fields)
      .filter(fieldName => String(currentState[fieldName] || '').trim() === '');

    missingFieldNames.forEach(fieldName => {
      miss[fieldName] = true;
    });

    setMissing(prev => ({ ...prev, ...miss }));

    if (!missingFieldNames.length) return true;

    const firstMissingField = missingFieldNames[0];
    const firstMissingFieldLabel = getFieldLabel(fieldsMap.get(firstMissingField), language) || firstMissingField;
    toast.error(uiText('Заповніть обов’язкове поле: {label}', language, { label: firstMissingFieldLabel }));
    scrollToSection(getSectionKeyByField(firstMissingField));
    return false;
  };

  const publishProfile = async () => {
    if (!isProfileAccessConfirmed) {
      await handleAuthConfirm();
      if (!stateRef.current.userId && !userId) {
        return;
      }
    }

    if (!validateRequiredProfileFields()) {
      return;
    }

    const nextState = { ...stateRef.current, publish: true };
    stateRef.current = nextState;
    setState(nextState);

    try {
      await saveState(nextState, { directFields: ['publish'] });
      localStorage.removeItem(MY_PROFILE_DRAFT_STORAGE_KEY);
      toast.success(uiText('Анкету опубліковано', language));
    } catch (error) {
      console.error('publish error', error);
      toast.error(uiText('Не вдалося опублікувати анкету. Спробуйте ще раз', language));
    }
  };

  // «Приховати» — це два записи, а не один: `publish: false` в анкеті і
  // `feedDate: false` у картці стрічки. Другий іде сам, разом зі збереженням:
  // `publish` потрапляє в `directFields`, тобто доїжджає до писача навіть
  // будучи `false`, а той перебудовує проєкцію (`buildMatchingCardProjection`),
  // де знятій публікації відповідає саме `false`.
  //
  // Чому `false`, а не видалення ключа: «сховали» і «ще не публікували» — різні
  // стани. Обидва поза стрічкою, але пошук показує друге і мовчить про перше,
  // тож стерти позначку означало б повернути сховану анкету у видачу.
  const hideProfile = async () => {
    const nextState = { ...stateRef.current, publish: false };
    stateRef.current = nextState;
    setState(nextState);

    try {
      await saveState(nextState, { directFields: ['publish'] });
      toast.success(uiText('Анкету знято з публікації', language));
    } catch (error) {
      console.error('hide profile error', error);
      toast.error(uiText('Не вдалося зняти анкету з публікації. Спробуйте ще раз', language));
    }
  };

  /**
   * «Очистити все» — це стирання полів, а не видалення анкети.
   *
   * Видалення профілю робить пошта (пункт меню «Видалити анкету»): акаунт,
   * реакції й сліди в чужих списках знімає людина, а не кнопка. А тут відповідь
   * на інше питання — «я більше не хочу, щоб про мене це знали»: поля
   * забиваються порожніми рядками, і анкета йде зі стрічки.
   *
   * Порожній рядок їде звичайним шляхом збереження, **без** `directFields`:
   * саме так `makeUploadedInfo` дописує його останньою версією поля
   * (`['Оксана', '']`) — тобто позначкою стирання, яку розуміють і картка
   * стрічки, і відкрита анкета. Прямий запис поклав би туди сам рядок і
   * загубив би історію, якої людина не просила знищувати.
   *
   * `publish` навпаки лишається прямим: `false` мусить доїхати до писача, бо
   * саме він перебудовує проєкцію, де знятій публікації відповідає `feedDate:
   * false` (див. `hideProfile`).
   */
  const clearProfileFields = async () => {
    const currentState = stateRef.current || {};
    const clearableFields = visibleSections
      .flatMap(section => section.fields)
      .filter(name => !CLEAR_ALL_PROTECTED_FIELDS.has(name) && name !== 'programs')
      .filter(name => String(currentState[name] ?? '').trim() !== '');

    setIsClearingProfile(true);
    const nextState = { ...currentState, publish: false };
    // Побажання батьків — обʼєкт, а не поле з історією версій:
    // порожній рядок у них не «позначка стирання», а битий запис. Вони
    // знімаються цілком (`null`) і напряму, як і `publish`.
    const objectFields = clearableFields.filter(name => OBJECT_PROFILE_FIELDS.has(name));
    clearableFields.forEach(name => { nextState[name] = OBJECT_PROFILE_FIELDS.has(name) ? null : ''; });
    stateRef.current = nextState;
    setState(nextState);

    try {
      await saveState(nextState, { directFields: ['publish', ...objectFields] });
      // Програми лежать окремо від анкети, тож і знімаються окремо.
      if (ownProgramsCount && programsOwnerId) await saveCardPrograms(programsOwnerId, {});
      localStorage.removeItem(MY_PROFILE_DRAFT_STORAGE_KEY);
      setShowInfoModal(false);
      toast.success(uiText('Анкету очищено й знято з публікації', language));
    } catch (error) {
      console.error('clear profile error', error);
      toast.error(uiText('Не вдалося очистити анкету. Спробуйте ще раз', language));
    } finally {
      setIsClearingProfile(false);
    }
  };

  const renderField = (name) => {
    const field = fieldsMap.get(name);
    if (!field) return null;
    const roleText = resolveMyProfileFieldText(name, sectionTitleRole);
    const fieldPlaceholder = roleText.placeholder ? uiText(roleText.placeholder, language) : getFieldPlaceholder(field, language);
    const val = state[name] || '';
    const isTextArea = name === 'moreInfo_main';
    const isAppearanceField = sections.find(section => section.key === 'appearance')?.fields.includes(name);
    const optionValues = Array.isArray(field.options) ? field.options.map(getOptionValue).map(String) : [];
    const optionLabels = Array.isArray(field.options) ? field.options.map(getOptionLabel).map(String) : [];
    const isYesNoField = optionValues.includes('No')
      && optionValues.includes('Yes')
      && optionLabels.includes('Ні')
      && optionLabels.includes('Так');
    const canUseCustomOption = isAppearanceField || isYesNoField || name === 'csection';
    const customSelected = canUseCustomOption
      && (Boolean(customOptionMode[name]) || (String(val).trim() !== '' && !optionValues.includes(String(val))));

    return <Field key={name}>
      <Label>{roleText.label ? uiText(roleText.label, language) : getFieldLabel(field, language)}</Label>
      {Array.isArray(field.options) && field.options.length > 0 ? (
        <>
          <ChipRow>
            {field.options.map(option => {
              const optionValue = getOptionValue(option);
              const selected = String(val) === String(optionValue);
              return <Chip
                key={`${name}-${optionValue}`}
                selected={selected}
                $missing={missing[name]}
                onClick={() => {
                  setCustomOptionMode(prev => ({ ...prev, [name]: false }));
                  const isSelected = String(state[name] || '') === String(optionValue);
                  const nextState = { ...stateRef.current, [name]: isSelected ? '' : optionValue };
                  editedFieldsRef.current.add(name);
                  setMissing(prev => ({ ...prev, [name]: false }));
                  stateRef.current = nextState;
                  setState(nextState);
                  triggerAutosave(nextState);
                }}
                type="button"
              >
                {getOptionLabel(option, language)}
              </Chip>;
            })}
            {canUseCustomOption ? (
              <Chip
                key={`${name}-custom-option`}
                selected={customSelected}
                onClick={() => {
                  setCustomOptionMode(prev => ({ ...prev, [name]: true }));
                  if (!customSelected) {
                    updateFieldValue(name, '', field);
                  }
                }}
                type="button"
              >
                {uiText('Свій варіант', language)}
              </Chip>
            ) : null}
          </ChipRow>
          {canUseCustomOption && customSelected ? (
            <CustomOptionWrap>
              <FieldControl>
                <Input
                  value={val}
                  $missing={missing[name]}
                  placeholder={uiText('Введіть свій варіант', language)}
                  onChange={e => updateFieldValue(name, e.target.value, field)}
                  onBlur={e => saveFieldValue(name, e.target.value, field)}
                />
                {val ? (
                  <ClearFieldButton
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => clearFieldValue(name, field)}
                    aria-label={uiText('Очистити поле', language)}
                  >
                    <FiX size={16} />
                  </ClearFieldButton>
                ) : null}
              </FieldControl>
            </CustomOptionWrap>
          ) : null}
        </>
      ) : isTextArea ? (
        <FieldControl>
          <TextArea
            value={val}
            $missing={missing[name]}
            placeholder={fieldPlaceholder}
            onChange={e => updateFieldValue(name, e.target.value, field)}
            onBlur={e => saveFieldValue(name, e.target.value, field)}
          />
          {val ? (
            <ClearFieldButton
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => clearFieldValue(name, field)}
              aria-label={uiText('Очистити поле', language)}
            >
              <FiX size={16} />
            </ClearFieldButton>
          ) : null}
        </FieldControl>
      ) : (
        <FieldControl>
          <Input
            value={val}
            $missing={missing[name]}
            placeholder={fieldPlaceholder}
            onChange={e => updateFieldValue(name, e.target.value, field)}
            onBlur={e => saveFieldValue(name, e.target.value, field)}
          />
          {val ? (
            <ClearFieldButton
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => clearFieldValue(name, field)}
              aria-label={uiText('Очистити поле', language)}
            >
              <FiX size={16} />
            </ClearFieldButton>
          ) : null}
        </FieldControl>
      )}
    </Field>;
  };

  // Прев'ю картки — та сама картка стрічки (`ProfileRow`), зібрана з
  // набраного тут. Зʼявляється, коли набрано бодай щось: порожня картка з
  // ініціалами нічого не показує. Сховані ролі картка не несе, як і в стрічці.
  const previewRoles = rolesList.filter(role => !hiddenRoles.includes(role));
  const showCardPreview = filledStats.filled >= 2 || (Array.isArray(state.photos) && state.photos.length > 0);
  const previewCard = {
    ...state,
    userId: programsOwnerId || 'my-profile-preview',
    userRole: previewRoles.length > 1 ? previewRoles : previewRoles[0] || selectedRole,
    role: previewRoles.length > 1 ? previewRoles : previewRoles[0] || selectedRole,
    photos: Array.isArray(state.photos) ? state.photos : [],
    programs: previewRoles.some(role => ORGANISATION_ROLES.includes(role)) ? (ownVisiblePrograms.length ? ownPrograms : null) : null,
  };
  delete previewCard.password;

  return <Page>
    <HeaderPanel>
      <Topbar>
        <TopbarBrand><KnowMeBrand /></TopbarBrand>
        <TopbarActions>
          <StatusBadge
            type="button"
            $clickable={!isProfileAccessConfirmed}
            $published={state.publish === true}
            onClick={handleAuthBadgeClick}
          >
            ● {isProfileAccessConfirmed
              ? uiText(state.publish === true ? 'Опублікована' : 'Не опублікована', language)
              : uiText('Логін не відбувся', language)}
          </StatusBadge>
          <DotsButton type='button' aria-label={uiText('Відкрити меню профілю', language)} onClick={() => setShowInfoModal('dotsMenu')}>⋮</DotsButton>
        </TopbarActions>
      </Topbar>
    </HeaderPanel>

    <StickyProgress ref={stickyProgressRef}>
      <ProgressWrap>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{uiText('Заповнено {filled} з {total}', language, filledStats)}</span>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{filledPct}%</span>
      </div>
      <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
        <div style={{ width: `${filledPct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-mid) 100%)' }} />
      </div>
    </ProgressWrap>

      <Tabs ref={tabsRef}>
        {navSections.map(s => {
          const info = s.key === 'photo'
            ? { complete: Array.isArray(state.photos) && state.photos.length > 0 }
            : sectionProgress[s.key] || {};
          return <Tab
            key={s.key}
            ref={node => { tabRefs.current[s.key] = node; }}
            $active={activeTab === s.key}
            $complete={Boolean(info.complete)}
            type="button"
            onClick={() => scrollToSection(s.key)}
          >
            {s.title}
          </Tab>;
        })}
      </Tabs>
    </StickyProgress>

    {!isProfileAccessConfirmed && <AuthCard ref={node => { sectionRefs.current.auth = node; }}>
      <Header>
        <div>🔐</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{uiText('Доступ до анкети', language)}</div>
      </Header>
      <FieldGroup>
        <Field>
          <AuthIntro>
            Введіть email і пароль, щоб продовжити заповнення анкети. Якщо акаунт уже існує — ми виконаємо вхід, якщо ні — створимо профіль донора.
          </AuthIntro>
        </Field>
        <AuthField $missing={missing.email}>
          <HighlightableLabel $active={authHintStep === 'email'}>Email</HighlightableLabel>
          <FieldControl>
            <Input
              type="email"
              name="email"
              value={state.email || ''}
              placeholder={uiText('Введіть емейл', language)}
              autoComplete="email"
              onChange={e => {
                const value = e.target.value;
                editedFieldsRef.current.add('email');
                setMissing(prev => ({ ...prev, email: false }));
                setState(prevState => {
                  const nextState = { ...prevState, email: value };
                  stateRef.current = nextState;
                  return nextState;
                });
              }}
            />
            {state.email ? (
              <ClearFieldButton
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  editedFieldsRef.current.add('email');
                  setState(prevState => {
                    const nextState = { ...prevState, email: '' };
                    stateRef.current = nextState;
                    return nextState;
                  });
                }}
                aria-label={uiText('Очистити email', language)}
              >
                <FiX size={16} />
              </ClearFieldButton>
            ) : null}
          </FieldControl>
        </AuthField>
        <AuthField $missing={missing.password}>
          <HighlightableLabel $active={authHintStep === 'password'}>Password</HighlightableLabel>
          <FieldControl>
            <Input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={state.password || ''}
              placeholder={uiText('Придумайте / введіть пароль', language)}
              autoComplete="new-password"
              onChange={e => {
                const value = e.target.value;
                setMissing(prev => ({ ...prev, password: false }));
                setState(prevState => {
                  const nextState = { ...prevState, password: value };
                  stateRef.current = nextState;
                  return nextState;
                });
              }}
            />
            <PasswordToggleButton type="button" onClick={() => setShowPassword(prev => !prev)} aria-label={uiText(showPassword ? 'Приховати пароль' : 'Показати пароль', language)}>
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </PasswordToggleButton>
          </FieldControl>
        </AuthField>
        <TermsRow $missing={missing.terms} $active={authHintStep === 'terms'}>
          <TermsCheckbox
            id="my-profile-terms"
            type="checkbox"
            checked={hasAgreed}
            $missing={missing.terms}
            $active={authHintStep === 'terms'}
            onChange={e => {
              setHasAgreed(e.target.checked);
              setMissing(prev => ({ ...prev, terms: false }));
            }}
          />
          <TermsText>
            <label htmlFor="my-profile-terms">{uiText('Я підтверджую згоду з умовами програми. ', language)}</label>
            <TermsButton type="button" onClick={() => navigate('/policy')}>{uiText('Умови', language)}</TermsButton>
          </TermsText>
        </TermsRow>
        <AuthActionButton type="button" $active={authHintStep === 'submit'} onClick={handleAuthConfirm}>{uiText('Підтвердити і продовжити', language)}</AuthActionButton>
      </FieldGroup>
    </AuthCard>}

    <RoleCard>
      <RoleCardTitle>{uiText('Хто ви', language)}</RoleCardTitle>
      <RoleOptions>
        {MY_PROFILE_ROLE_OPTIONS.map(option => (
          <RoleOption
            key={option.value}
            type="button"
            $active={selectedRole === option.value}
            aria-pressed={selectedRole === option.value}
            onClick={() => changeUserRole(option.value)}
          >
            {uiText(option.label, language)}
          </RoleOption>
        ))}
      </RoleOptions>
      <RoleHint>{uiText('Роль вирішує, які поля показує анкета і в якій вкладці її шукають. Змінити її можна будь-коли.', language)}</RoleHint>

      <RoleCardTitle style={{ marginTop: 16 }}>{uiText('Ще одна роль', language)}</RoleCardTitle>
      <RoleOptions>
        <RoleOption type="button" $active={!secondaryRole} aria-pressed={!secondaryRole} onClick={() => changeSecondaryRole('')}>
          {uiText('Немає', language)}
        </RoleOption>
        {MY_PROFILE_ROLE_OPTIONS.filter(option => option.value !== selectedRole).map(option => (
          <RoleOption
            key={option.value}
            type="button"
            $active={secondaryRole === option.value}
            aria-pressed={secondaryRole === option.value}
            onClick={() => changeSecondaryRole(option.value)}
          >
            {uiText(option.label, language)}
          </RoleOption>
        ))}
      </RoleOptions>
      <RoleHint>{uiText('Наприклад, донорка, яка ще й підбирає донорок як агентка. Друга анкета стоїть під першою.', language)}</RoleHint>

      {rolesList.length > 1 ? (
        <RoleVisibilityList>
          {rolesList.map(role => {
            const hidden = hiddenRoles.includes(role);
            const lastVisible = !hidden && rolesList.filter(item => !hiddenRoles.includes(item)).length === 1;
            const label = MY_PROFILE_ROLE_OPTIONS.find(option => option.value === role)?.label || role;
            return (
              <RoleVisibilityRow key={role} $hidden={hidden}>
                <span>
                  <b>{uiText(label, language)}</b>
                  {' · '}
                  {uiText(hidden ? 'анкету сховано' : 'анкету видно в стрічці', language)}
                </span>
                <RoleVisibilityButton
                  type="button"
                  disabled={lastVisible}
                  title={lastVisible ? uiText('Щоб сховати всю анкету — «Зняти з публікації»', language) : undefined}
                  onClick={() => toggleRoleHidden(role)}
                >
                  {uiText(hidden ? 'Показати' : 'Сховати', language)}
                </RoleVisibilityButton>
              </RoleVisibilityRow>
            );
          })}
        </RoleVisibilityList>
      ) : null}
    </RoleCard>

    {showCardPreview ? (
      <MyProfileCardPreview
        card={previewCard}
        language={language}
        rates={programRates}
        displayCurrency={programDisplayCurrency}
        onDisplayCurrencyChange={setProgramDisplayCurrency}
      />
    ) : null}

    <PhotoSection ref={node => { sectionRefs.current.photo = node; }} $isFirstContent={isProfileAccessConfirmed}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{uiText('Додайте до 5 фото. Перше — головне', language)}</p>
      <Photos
        state={{ ...state, userId }}
        setState={next => {
          setState(prevState => {
            const nextState = typeof next === 'function' ? next(prevState) : next;
            stateRef.current = nextState;
            return nextState;
          });
        }}
        uploadInputId="my-profile-photo-upload"
        compact
        maxPhotos={5}
      />
    </PhotoSection>


    {visibleSections.map(section => {
      const SectionCard = !isProfileAccessConfirmed && section.key === firstSectionKey ? FirstContentCard : Card;
      const anketaLabel = section.anketaRole
        ? MY_PROFILE_ROLE_OPTIONS.find(option => option.value === section.anketaRole)?.label || section.anketaRole
        : '';
      return (
      <React.Fragment key={section.key}>
      {anketaLabel ? (
        <AnketaDivider $hidden={hiddenRoles.includes(section.anketaRole)}>
          {uiText('Друга анкета', language)}: <b>{uiText(anketaLabel, language)}</b>
          {hiddenRoles.includes(section.anketaRole) ? <span> · {uiText('анкету сховано', language)}</span> : null}
        </AnketaDivider>
      ) : null}
      <SectionCard ref={node => { sectionRefs.current[section.key] = node; }}>
        <Header>
          <div>{uiText(section.title, language).split(' ')[0]}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{uiText(section.title, language).replace(/^\S+\s/, '')}</div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: sectionProgress[section.key]?.complete ? '#2E9B55' : 'var(--muted)', background: sectionProgress[section.key]?.complete ? '#EBF8EF' : 'var(--border)', padding: '2px 8px', borderRadius: 99 }}>
            {sectionProgress[section.key]?.filled || 0}/{sectionProgress[section.key]?.total || section.fields.length}
          </div>
        </Header>
        <FieldGroup>
          {section.custom === 'programs' ? (
            <ProgramsEditor
              programs={ownPrograms}
              onSave={saveOwnPrograms}
              language={language}
              rates={programRates}
              suggestions={programTerms}
            />
          ) : null}
          {section.custom === 'parents' ? <ParentProfileFields state={state} onCommit={saveRoleField} language={language} /> : null}
          {!section.custom ? section.fields.map(renderField) : null}
        </FieldGroup>
      </SectionCard>
      </React.Fragment>
      );
    })}



    {showInfoModal && (
      <InfoModal
        onClose={() => { if (!isClearingProfile) setShowInfoModal(false); }}
        text={showInfoModal}
        Context={dotsMenu}
        DelConfirm={() => (
          <>
            <ModalTitle>{uiText('Очистити анкету?', language)}</ModalTitle>
            <ModalText>
              {uiText(
                'Усі заповнені поля стануть порожніми, а анкету буде знято з публікації. '
                + 'Пошта й доступ до акаунта лишаються.',
                language,
              )}
            </ModalText>
            <ModalActionRow>
              <ModalGhostButton
                type="button"
                disabled={isClearingProfile}
                onClick={() => setShowInfoModal(false)}
              >
                {uiText('Відмінити', language)}
              </ModalGhostButton>
              <ModalDangerButton type="button" disabled={isClearingProfile} onClick={clearProfileFields}>
                {uiText(isClearingProfile ? 'Очищення…' : 'Очистити все', language)}
              </ModalDangerButton>
            </ModalActionRow>
          </>
        )}
      />
    )}

    <SubmitWrap>
      <SubmitBtn type="button" onClick={state.publish ? hideProfile : publishProfile}>
        {uiText(state.publish ? 'Зняти з публікації' : 'Опублікувати анкету', language)}
      </SubmitBtn>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>{uiText('Зняти анкету з публікації, очистити чи видалити її можна будь-коли в меню ⋮.', language)}</p>
    </SubmitWrap>
  </Page>;
};
