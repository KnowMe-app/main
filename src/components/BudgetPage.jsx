import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, remove, set, update } from 'firebase/database';
import { FaCheck, FaChevronDown, FaChevronUp, FaExternalLinkAlt, FaFilePdf, FaPen, FaPlus, FaTimes, FaTrash, FaUpload } from 'react-icons/fa';
import { auth, database } from './config';
import { isAdminUid } from 'utils/accessLevel';

const USD_ITEM_IDS = new Set([
  'sm-program-compensation',
  'surrogate-mother-compensation',
  'sm-compensation',
]);
const USD_TO_EUR_RATE = 0.92;
const INCLUDED_PREVIEW_LIMIT = 6;
const POPULAR_PACKAGE_ID = '3';
const POPULAR_PACKAGE_BADGE = 'Most popular';
const BUDGET_EDIT_MODE_STORAGE_KEY = 'budget:edit-mode';
const GUARANTEED_PACKAGE_IDS = new Set(['4', '5']);
const FROM_PRICE_ITEM_IDS = new Set(['43', '49', '54', '61', '63', '64', '65']);
const FALLBACK_FIREBASE_PROJECT_ID = 'webringitapp';
const BUDGET_COLLECTION_LABELS = {
  packages: 'program',
  items: 'expense',
};
const CATEGORY_LABELS = {
  coordination: 'Coordination & Documents',
  surrogateMother: 'Surrogate Mother',
  eggDonor: 'Egg Donor',
  ivf: 'IVF & Embryology',
  pregnancyAndDiagnostics: 'Pregnancy & Diagnostics',
  deliveryAndNewborn: 'Delivery & Newborn',
  legalAndRegistration: 'Legal & Registration',
  insurance: 'Insurance',
};

const formatMoney = (value, currency = 'EUR') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `— ${currency || 'EUR'}`;
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)} ${currency || 'EUR'}`;
};

const formatEuroAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '€—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const normalizeCatalog = catalog => ({
  packages: Array.isArray(catalog?.packages) ? catalog.packages : [],
  items: Array.isArray(catalog?.items) ? catalog.items : [],
  clientNotes: Array.isArray(catalog?.clientNotes) ? catalog.clientNotes : [],
  technical: catalog?.technical && typeof catalog.technical === 'object' ? catalog.technical : {},
});

const getFirebaseConsoleProjectId = () =>
  process.env.REACT_APP_PROJECT_ID || FALLBACK_FIREBASE_PROJECT_ID;

const getFirebaseRealtimeDatabaseName = () => {
  const fallbackProjectId = getFirebaseConsoleProjectId();
  const databaseUrl = process.env.REACT_APP_DATABASE_URL || '';

  try {
    const { hostname } = new URL(databaseUrl);
    return hostname.split('.')[0] || `${fallbackProjectId}-default-rtdb`;
  } catch (error) {
    return `${fallbackProjectId}-default-rtdb`;
  }
};

const buildBudgetBackendUrl = (collection, index) => {
  if (!collection || index < 0) return '';

  const projectId = getFirebaseConsoleProjectId();
  const databaseName = getFirebaseRealtimeDatabaseName();
  const encodedPath = ['budget', collection, String(index)]
    .map(segment => `~2F${encodeURIComponent(segment)}`)
    .join('');

  return `https://console.firebase.google.com/u/0/project/${projectId}/database/${databaseName}/data/${encodedPath}`;
};

const getNextBudgetRecordId = records => {
  const lastRecord = [...records].reverse().find(record => Number.isFinite(Number(record?.id)));
  return String((lastRecord ? Number(lastRecord.id) : 0) + 1);
};

const validateCatalog = catalog => {
  if (!catalog || typeof catalog !== 'object') return 'Budget JSON must be an object.';
  if (!Array.isArray(catalog.packages)) return 'Budget JSON must include packages[].';
  if (!Array.isArray(catalog.items)) return 'Budget JSON must include items[].';
  return '';
};

const getItemDisplayAmount = item => {
  const basePrice = Number(item?.price);
  if (!Number.isFinite(basePrice)) return null;
  const isUsd = USD_ITEM_IDS.has(String(item?.id || '').trim());
  return isUsd ? basePrice * USD_TO_EUR_RATE : basePrice;
};

const getItemDisplayPrice = item => {
  const amount = getItemDisplayAmount(item);
  return amount === null ? formatMoney(item?.price, 'EUR') : formatMoney(amount, 'EUR');
};

const getExpensePriceLabel = item => {
  const prefix = FROM_PRICE_ITEM_IDS.has(String(item?.id)) ? 'from ' : '';
  return `${prefix}${getItemDisplayPrice(item)}`;
};

const getCategoryLabel = category => {
  const key = String(category || 'Other');
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase()) || 'Other';
};

const getCategoryMinimumPrice = items => {
  const amounts = items.map(getItemDisplayAmount).filter(amount => Number.isFinite(amount));
  if (!amounts.length) return '';
  return `from ${formatMoney(Math.min(...amounts), 'EUR')}`;
};

const Page = styled.main`
  min-height: 100vh;
  background: linear-gradient(180deg, #fbf4eb 0%, #f7efe4 44%, #fffaf4 100%);
  color: #2f2923;
  padding: 22px 14px 96px;
  font-family: 'DM Sans', 'Inter', Arial, sans-serif;
`;

const Shell = styled.div`
  width: min(100%, 1120px);
  margin: 0 auto;
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;

  @media (max-width: 640px) {
    flex-direction: column;
  }
`;

const Eyebrow = styled.div`
  color: #9a6b48;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  margin-bottom: 8px;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(30px, 7vw, 54px);
  line-height: 0.98;
  letter-spacing: -0.055em;
`;

const Subtitle = styled.p`
  max-width: 720px;
  margin: 12px 0 0;
  color: #6f6359;
  font-size: 16px;
  line-height: 1.62;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 640px) {
    width: 100%;
    justify-content: stretch;
  }
`;

const SoftButton = styled.button`
  border: 1px solid ${({ $danger }) => ($danger ? '#d9b0a2' : '#dfcdbc')};
  background: ${({ disabled }) => (disabled ? 'rgba(255,255,255,0.5)' : '#fffaf4')};
  color: ${({ $danger }) => ($danger ? '#8d4a36' : '#5c4939')};
  border-radius: 999px;
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.72 : 1)};

  @media (max-width: 640px) {
    flex: 1 1 100%;
  }
`;


const DangerButton = styled(SoftButton)`
  border-color: #d9b0a2;
  color: #8d4a36;
`;

const InlineActionRow = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const BackendIdButton = styled.button`
  border: 1px solid #dfcdbc;
  border-radius: 9px;
  background: rgba(255, 250, 244, 0.92);
  color: #67462f;
  min-height: 34px;
  padding: 7px 9px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 900;
  text-align: left;
  cursor: pointer;
`;

const HiddenBadge = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-top: 7px;
  border-radius: 999px;
  background: #f3ded8;
  color: #8d4a36;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
`;

const EditPanel = styled.div`
  margin-top: 16px;
  border: 1px solid rgba(140, 101, 70, 0.16);
  border-radius: 22px;
  background: rgba(255, 250, 244, 0.78);
  padding: 16px;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(42, 32, 25, 0.46);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const ConfirmModal = styled.div`
  width: min(100%, 440px);
  border-radius: 24px;
  background: #fffaf4;
  box-shadow: 0 24px 70px rgba(42, 32, 25, 0.24);
  padding: 22px;
  color: #382d24;
`;

const ModalTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 22px;
`;

const ModalText = styled.p`
  margin: 0 0 16px;
  color: #6f6359;
  line-height: 1.5;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
`;

const Section = styled.section`
  margin-top: ${({ $compact }) => ($compact ? '22px' : '28px')};
`;

const SectionHeading = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
`;

const H2 = styled.h2`
  margin: 0;
  font-size: 25px;
  letter-spacing: -0.035em;
`;

const SectionNote = styled.p`
  margin: 4px 0 0;
  color: #76685d;
  font-size: 14px;
  line-height: 1.5;
`;

const ProgramsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(286px, 1fr));
  gap: 16px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const ProgramCard = styled.article`
  position: relative;
  border: 1px solid ${({ $guaranteed }) => ($guaranteed ? 'rgba(175, 126, 51, 0.46)' : 'rgba(140, 101, 70, 0.16)')};
  border-radius: 28px;
  background: ${({ $guaranteed }) => ($guaranteed ? 'rgba(255, 248, 235, 0.96)' : 'rgba(255, 250, 244, 0.92)')};
  box-shadow: 0 24px 70px rgba(89, 63, 40, 0.09);
  padding: ${({ $compact }) => ($compact ? '17px' : '22px')};
`;

const Badge = styled.span`
  position: absolute;
  top: 18px;
  right: 18px;
  border-radius: 999px;
  background: #efe0ca;
  color: #6c472f;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.04em;
  padding: 6px 9px;
  text-transform: uppercase;
`;

const ProgramMeta = styled.div`
  color: #9b6b2e;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.1em;
  margin: 0 0 8px;
  text-transform: uppercase;
`;

const ProgramName = styled.h3`
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 1.16;
  letter-spacing: -0.035em;
`;

const Price = styled.div`
  margin: 0 0 ${({ $compact }) => ($compact ? '8px' : '12px')};
  color: #7a4c2f;
  font-size: ${({ $compact }) => ($compact ? 'clamp(27px, 7vw, 38px)' : 'clamp(32px, 8vw, 46px)')};
  font-weight: 900;
  letter-spacing: -0.06em;
`;

const Description = styled.p`
  margin: 0;
  color: #6d6259;
  font-size: ${({ $compact }) => ($compact ? '14px' : '15px')};
  line-height: ${({ $compact }) => ($compact ? 1.42 : 1.56)};
`;

const PaymentScheduleCard = styled.section`
  margin-top: 14px;
  border: 1px solid rgba(140, 101, 70, 0.16);
  border-radius: 18px;
  background: rgba(250, 241, 229, 0.72);
  padding: 13px;
`;

const PaymentScheduleTitle = styled.h4`
  margin: 0 0 10px;
  color: #4d392b;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.01em;
`;

const PaymentScheduleList = styled.div`
  display: grid;
  gap: 8px;
`;

const PaymentScheduleRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  border-top: 1px solid rgba(140, 101, 70, 0.12);
  padding-top: 8px;

  &:first-child {
    border-top: 0;
    padding-top: 0;
  }
`;

const PaymentScheduleLabel = styled.span`
  min-width: 0;
  color: #5f5148;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const PaymentScheduleAmount = styled.span`
  color: #65432d;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
  text-align: right;
  white-space: nowrap;
`;

const PaymentScheduleEditor = styled.div`
  margin-top: 10px;
  display: grid;
  gap: 10px;
`;

const PaymentEditorRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(92px, 126px) auto;
  gap: 7px;
  align-items: end;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const PaymentEditorActions = styled.div`
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
`;

const Toggle = styled.button`
  width: 100%;
  border: 0;
  background: #f1e4d6;
  color: #553c2b;
  border-radius: 16px;
  margin: 18px 0 0;
  padding: 12px 14px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
`;

const IncludedList = styled.div`
  margin-top: 14px;
  display: grid;
  gap: 10px;
`;

const IncludedItem = styled.div`
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 10px;
  color: #4b4139;
  font-size: 14px;
  line-height: 1.45;

  strong {
    display: block;
  }
`;

const CheckIcon = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #dcc4a8;
  color: #4d3320;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  margin-top: 1px;
`;

const DetailButton = styled.button`
  border: 0;
  background: transparent;
  color: #8a5c3f;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 5px 0;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
`;

const CTA = styled.button`
  width: 100%;
  border: 0;
  border-radius: 18px;
  background: #3f2f26;
  color: #fff8ef;
  margin-top: 18px;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 900;
  cursor: pointer;
`;

const AccordionList = styled.div`
  display: grid;
  gap: 12px;
`;

const Accordion = styled.div`
  overflow: hidden;
  border: 1px solid rgba(140, 101, 70, 0.16);
  border-radius: 22px;
  background: rgba(255, 250, 244, 0.78);
`;

const AccordionHeader = styled.button`
  width: 100%;
  border: 0;
  background: transparent;
  color: #33291f;
  padding: ${({ $compact }) => ($compact ? '13px 16px' : '17px 18px')};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 17px;
  font-weight: 900;
  text-align: left;
  cursor: pointer;
`;

const Count = styled.span`
  color: #9a836f;
  font-size: 12px;
  font-weight: 800;
`;

const ShowMoreButton = styled.button`
  border: 1px solid rgba(140, 101, 70, 0.18);
  border-radius: 14px;
  background: rgba(255, 250, 244, 0.72);
  color: #67462f;
  min-height: 44px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
`;

const ExpenseRows = styled.div`
  border-top: 1px solid rgba(140, 101, 70, 0.13);
  padding: 2px 18px 10px;
`;

const ExpenseRow = styled.div`
  padding: ${({ $compact }) => ($compact ? '9px 0' : '13px 0')};
  border-bottom: 1px solid rgba(140, 101, 70, 0.1);

  &:last-child {
    border-bottom: 0;
  }
`;

const ExpenseTop = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  align-items: baseline;
`;

const ExpenseName = styled.div`
  font-size: 15px;
  font-weight: 850;
  line-height: 1.35;
`;

const ExpensePrice = styled.div`
  color: #69462f;
  font-size: 15px;
  font-weight: 900;
  white-space: nowrap;
`;

const Muted = styled.p`
  margin: ${({ $compact }) => ($compact ? '3px 0 0' : '5px 0 0')};
  color: #7e7369;
  font-size: ${({ $compact }) => ($compact ? '12px' : '13px')};
  line-height: ${({ $compact }) => ($compact ? 1.35 : 1.45)};
`;

const InternalNote = styled.div`
  margin-top: 8px;
  border: 1px solid rgba(185, 28, 28, 0.28);
  border-radius: 12px;
  background: rgba(254, 226, 226, 0.64);
  color: #991b1b;
  display: grid;
  grid-template-columns: 1fr 44px;
  gap: 8px;
  align-items: center;
  padding: 8px 0 8px 10px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
`;

const IconButton = styled.button`
  border: 0;
  background: transparent;
  color: inherit;
  min-height: 44px;
  min-width: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;

const EditableGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(92px, 132px);
  gap: 7px;
  margin-top: 7px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const AddRecordGrid = styled(EditableGrid)`
  margin-top: 12px;
`;

const EditableField = styled.label`
  display: grid;
  gap: 3px;
  color: #7b6553;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const EditableDescriptionField = styled(EditableField)`
  grid-column: 1 / -1;
`;


const EditInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dfcdbc;
  border-radius: 9px;
  background: rgba(255, 250, 244, 0.92);
  color: #382d24;
  padding: 7px 9px;
  font-size: 13px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: normal;
`;

const EditTextarea = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dfcdbc;
  border-radius: 9px;
  background: rgba(255, 250, 244, 0.92);
  color: #382d24;
  min-height: 48px;
  padding: 7px 9px;
  font-size: 13px;
  line-height: 1.32;
  resize: vertical;
  text-transform: none;
  letter-spacing: normal;
`;

const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dfcdbc;
  border-radius: 18px;
  background: #fffaf4;
  color: #382d24;
  padding: 13px 15px;
  font-size: 15px;
  margin-bottom: 14px;
`;

const NoteList = styled.ul`
  margin: 12px 0 0;
  padding: 18px 20px 18px 34px;
  border-radius: 22px;
  background: rgba(255, 250, 244, 0.72);
  color: #66594f;
  line-height: 1.55;
`;

const StateCard = styled.div`
  padding: 28px;
  border-radius: 24px;
  background: rgba(255, 250, 244, 0.82);
  color: #6d6259;
`;

const StickyContact = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  min-height: 64px;
  padding: 8px 14px calc(8px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: rgba(255, 250, 244, 0.82);
  border-top: 1px solid rgba(140, 101, 70, 0.16);
  backdrop-filter: blur(12px);
`;

const StickyContactInner = styled.div`
  width: min(100%, 1120px);
  margin: 0 auto;
`;

const StickyButton = styled(CTA)`
  margin-top: 0;
  min-height: 48px;
  padding: 12px 16px;
`;

const BudgetPage = ({ isAdmin = false }) => {
  const [catalog, setCatalog] = useState(() => normalizeCatalog(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openPrograms, setOpenPrograms] = useState({});
  const [openDetails, setOpenDetails] = useState({});
  const [openCategories, setOpenCategories] = useState({});
  const [expandedIncluded, setExpandedIncluded] = useState({});
  const [query, setQuery] = useState('');
  const [showStickyContact, setShowStickyContact] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [newItem, setNewItem] = useState(() => ({ name: '', price: '', description: '', category: 'Other' }));
  const fileInputRef = useRef(null);
  const isBudgetAdmin = Boolean(isAdmin) || isAdminUid(auth.currentUser?.uid) || (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('admin') === '1');
  const [isEditMode, setIsEditMode] = useState(() => {
    if (!isBudgetAdmin || typeof window === 'undefined') return false;
    return window.localStorage.getItem(BUDGET_EDIT_MODE_STORAGE_KEY) === '1';
  });

  const loadBudget = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snapshot = await get(ref(database, 'budget'));
      const value = snapshot.exists() ? snapshot.val() : null;
      setCatalog(normalizeCatalog(value));
    } catch (loadError) {
      console.error('Unable to load budget catalog', loadError);
      setError('Budget catalog is not available right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  useEffect(() => {
    const handleScroll = () => {
      setShowStickyContact(window.scrollY > window.innerHeight);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const itemsById = useMemo(() => {
    return new Map(catalog.items.map(item => [String(item.id), item]));
  }, [catalog.items]);

  const paymentScheduleById = useMemo(() => {
    const schedules = Array.isArray(catalog.technical?.paymentSchedules)
      ? catalog.technical.paymentSchedules
      : [];
    return new Map(schedules.map(schedule => [String(schedule.id), schedule]));
  }, [catalog.technical]);

  const sortedPackages = useMemo(() => {
    return catalog.packages
      .filter(program => isEditMode || !program.hidden)
      .sort((a, b) => Number(a.listedPrice || 0) - Number(b.listedPrice || 0));
  }, [catalog.packages, isEditMode]);

  const includedItemIds = useMemo(() => {
    return sortedPackages.reduce((ids, program) => {
      if (Array.isArray(program.children)) {
        program.children.forEach(id => ids.add(String(id)));
      }
      return ids;
    }, new Set());
  }, [sortedPackages]);

  const groupedExpenses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.items.reduce((groups, item) => {
      if (!isEditMode && item.hidden) return groups;
      const itemId = String(item.id);
      if (includedItemIds.has(itemId)) return groups;
      const searchableText = `${item.name || ''} ${item.description || ''} ${isEditMode ? item.internalNote || '' : ''}`.toLowerCase();
      if (normalizedQuery && !searchableText.includes(normalizedQuery)) return groups;
      const category = item.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
      return groups;
    }, {});
  }, [catalog.items, includedItemIds, query, isEditMode]);

  useEffect(() => {
    if (isBudgetAdmin) return;
    setIsEditMode(false);
  }, [isBudgetAdmin]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const toggleEditMode = () => {
    if (!isBudgetAdmin) return;
    setIsEditMode(current => {
      const next = !current;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(BUDGET_EDIT_MODE_STORAGE_KEY, next ? '1' : '0');
      }
      return next;
    });
  };

  const handleBudgetFileChange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validationError = validateCatalog(parsed);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      await set(ref(database, 'budget'), parsed);
      setCatalog(normalizeCatalog(parsed));
      toast.success('Budget JSON uploaded to backend.');
    } catch (uploadError) {
      console.error('Unable to upload budget catalog', uploadError);
      toast.error('Unable to upload budget JSON.');
    }
  };

  const toggleProgram = id => setOpenPrograms(current => ({ ...current, [id]: !current[id] }));
  const toggleDetail = id => setOpenDetails(current => ({ ...current, [id]: !current[id] }));
  const toggleCategory = category => setOpenCategories(current => ({ ...current, [category]: !current[category] }));
  const toggleIncluded = id => setExpandedIncluded(current => ({ ...current, [id]: !current[id] }));

  const updateCatalogRecord = (collection, recordId, changes) => {
    setCatalog(current => ({
      ...current,
      [collection]: current[collection].map(record => (
        String(record.id) === String(recordId) ? { ...record, ...changes } : record
      )),
    }));
  };

  const persistCatalogRecordField = async (collection, recordId, field, value) => {
    const index = catalog[collection].findIndex(record => String(record.id) === String(recordId));
    if (index === -1) return;
    const numericFields = new Set(['price', 'listedPrice', 'extraUnitPrice']);
    const nextValue = numericFields.has(field) && value !== '' ? Number(value) : value;
    updateCatalogRecord(collection, recordId, { [field]: nextValue });
    try {
      await update(ref(database, `budget/${collection}/${index}`), { [field]: nextValue });
      toast.success('Budget field updated.');
    } catch (saveError) {
      console.error('Unable to update budget field', saveError);
      toast.error('Unable to update budget field.');
      loadBudget();
    }
  };

  const handleCatalogFieldChange = (collection, recordId, field, value) => {
    updateCatalogRecord(collection, recordId, { [field]: value });
  };

  const openBudgetBackendRecord = (collection, recordId) => {
    const index = catalog[collection].findIndex(record => String(record.id) === String(recordId));
    const url = buildBudgetBackendUrl(collection, index);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const persistCatalogRecordHidden = async (collection, recordId, hidden) => {
    const index = catalog[collection].findIndex(record => String(record.id) === String(recordId));
    if (index === -1) return;
    updateCatalogRecord(collection, recordId, { hidden });
    try {
      await update(ref(database, `budget/${collection}/${index}`), { hidden });
      toast.success(hidden ? 'Budget item hidden.' : 'Budget item is visible.');
    } catch (saveError) {
      console.error('Unable to update budget item visibility', saveError);
      toast.error('Unable to update budget item visibility.');
      loadBudget();
    }
  };

  const handleNewItemChange = (field, value) => {
    setNewItem(current => ({ ...current, [field]: value }));
  };

  const createBudgetItem = async () => {
    const name = newItem.name.trim();
    if (!name) {
      toast.error('Enter a name for the new budget item.');
      return;
    }

    const price = Number(newItem.price);
    if (newItem.price === '' || !Number.isFinite(price)) {
      toast.error('Enter a valid price for the new budget item.');
      return;
    }

    const nextRecord = {
      id: getNextBudgetRecordId(catalog.items),
      name,
      price,
      description: newItem.description.trim(),
      category: newItem.category.trim() || 'Other',
    };
    const nextItems = [...catalog.items, nextRecord];
    setCatalog(current => ({ ...current, items: nextItems }));
    try {
      await set(ref(database, `budget/items/${nextItems.length - 1}`), nextRecord);
      setNewItem({ name: '', price: '', description: '', category: 'Other' });
      setOpenCategories(current => ({ ...current, [nextRecord.category]: true }));
      toast.success('Budget item created.');
    } catch (saveError) {
      console.error('Unable to create budget item', saveError);
      toast.error('Unable to create budget item.');
      loadBudget();
    }
  };

  const confirmDeleteBudgetRecord = async () => {
    if (!deleteTarget) return;
    const { collection, recordId } = deleteTarget;
    const records = catalog[collection] || [];
    const record = records.find(item => String(item.id) === String(recordId));
    if (!record) {
      setDeleteTarget(null);
      return;
    }

    const nextRecords = records.filter(item => String(item.id) !== String(recordId));
    const nextPackages = collection === 'items'
      ? catalog.packages.map(program => (Array.isArray(program.children)
        ? { ...program, children: program.children.filter(id => String(id) !== String(recordId)) }
        : program))
      : catalog.packages;
    setCatalog(current => ({
      ...current,
      [collection]: nextRecords,
      ...(collection === 'items' ? { packages: nextPackages } : {}),
    }));
    setDeleteTarget(null);
    try {
      await set(ref(database, `budget/${collection}`), nextRecords);
      if (collection === 'items') {
        await set(ref(database, 'budget/packages'), nextPackages);
      }
      toast.success('Budget item deleted from backend.');
    } catch (saveError) {
      console.error('Unable to delete budget item', saveError);
      toast.error('Unable to delete budget item.');
      loadBudget();
    }
  };

  const resolveProgramPaymentSchedule = program => {
    const scheduleId = program?.paymentScheduleId;
    if (scheduleId) return paymentScheduleById.get(String(scheduleId)) || null;
    return program?.paymentSchedule && typeof program.paymentSchedule === 'object'
      ? program.paymentSchedule
      : null;
  };

  const persistTechnicalPaymentSchedules = async (nextSchedules, successMessage = 'Payment schedule updated.') => {
    setCatalog(current => ({
      ...current,
      technical: {
        ...current.technical,
        paymentSchedules: nextSchedules,
      },
    }));
    try {
      await set(ref(database, 'budget/technical/paymentSchedules'), nextSchedules);
      toast.success(successMessage);
    } catch (saveError) {
      console.error('Unable to update payment schedule', saveError);
      toast.error('Unable to update payment schedule.');
      loadBudget();
    }
  };

  const persistProgramPaymentScheduleId = async (programId, scheduleId) => {
    const packageIndex = catalog.packages.findIndex(record => String(record.id) === String(programId));
    if (packageIndex === -1) return;
    updateCatalogRecord('packages', programId, { paymentScheduleId: scheduleId });
    try {
      await update(ref(database, `budget/packages/${packageIndex}`), { paymentScheduleId: scheduleId });
      toast.success('Program payment schedule linked.');
    } catch (saveError) {
      console.error('Unable to link payment schedule', saveError);
      toast.error('Unable to link payment schedule.');
      loadBudget();
    }
  };

  const updatePaymentSchedule = async (scheduleId, updater, successMessage) => {
    const schedules = Array.isArray(catalog.technical?.paymentSchedules)
      ? catalog.technical.paymentSchedules
      : [];
    const scheduleIndex = schedules.findIndex(schedule => String(schedule.id) === String(scheduleId));
    if (scheduleIndex === -1) return;
    const currentSchedule = schedules[scheduleIndex];
    const nextSchedule = updater({
      ...currentSchedule,
      payments: Array.isArray(currentSchedule.payments) ? currentSchedule.payments : [],
    });
    const nextSchedules = schedules.map((schedule, index) => (index === scheduleIndex ? nextSchedule : schedule));
    await persistTechnicalPaymentSchedules(nextSchedules, successMessage);
  };

  const createProgramPaymentSchedule = async program => {
    const schedules = Array.isArray(catalog.technical?.paymentSchedules)
      ? catalog.technical.paymentSchedules
      : [];
    const nextId = `ps-${program.id}`;
    const uniqueId = schedules.some(schedule => String(schedule.id) === nextId)
      ? `ps-${program.id}-${Date.now()}`
      : nextId;
    const nextSchedule = { id: uniqueId, payments: [] };
    await persistTechnicalPaymentSchedules([...schedules, nextSchedule], 'Payment schedule created.');
    await persistProgramPaymentScheduleId(program.id, uniqueId);
  };

  const deleteProgramPaymentSchedule = async program => {
    const scheduleId = program.paymentScheduleId;
    if (!scheduleId) return;
    const schedules = Array.isArray(catalog.technical?.paymentSchedules)
      ? catalog.technical.paymentSchedules
      : [];
    const nextSchedules = schedules.filter(schedule => String(schedule.id) !== String(scheduleId));
    const packageIndex = catalog.packages.findIndex(record => String(record.id) === String(program.id));
    setCatalog(current => ({
      ...current,
      packages: current.packages.map(record => (String(record.id) === String(program.id)
        ? { ...record, paymentScheduleId: '' }
        : record)),
      technical: { ...current.technical, paymentSchedules: nextSchedules },
    }));
    try {
      await set(ref(database, 'budget/technical/paymentSchedules'), nextSchedules);
      if (packageIndex !== -1) {
        await remove(ref(database, `budget/packages/${packageIndex}/paymentScheduleId`));
      }
      toast.success('Payment schedule deleted.');
    } catch (saveError) {
      console.error('Unable to delete payment schedule', saveError);
      toast.error('Unable to delete payment schedule.');
      loadBudget();
    }
  };

  const updatePaymentScheduleId = (oldScheduleId, nextScheduleId) => {
    const normalizedId = nextScheduleId.trim();
    if (!normalizedId || normalizedId === String(oldScheduleId)) return;
    updatePaymentSchedule(oldScheduleId, schedule => ({ ...schedule, id: normalizedId }), 'Payment schedule ID updated.');
    catalog.packages
      .filter(program => String(program.paymentScheduleId) === String(oldScheduleId))
      .forEach(program => persistProgramPaymentScheduleId(program.id, normalizedId));
  };

  const updatePayment = (scheduleId, paymentIndex, field, value) => {
    updatePaymentSchedule(scheduleId, schedule => ({
      ...schedule,
      payments: schedule.payments.map((payment, index) => (index === paymentIndex
        ? { ...payment, [field]: field === 'amount' ? Number(value) : value }
        : payment)),
    }), 'Payment updated.');
  };

  const addPayment = (scheduleId, insertAfterIndex = -1) => {
    updatePaymentSchedule(scheduleId, schedule => {
      const nextPayment = { title: '', amount: 0 };
      const insertIndex = Math.max(0, Math.min(schedule.payments.length, insertAfterIndex + 1));
      return {
        ...schedule,
        payments: [
          ...schedule.payments.slice(0, insertIndex),
          nextPayment,
          ...schedule.payments.slice(insertIndex),
        ],
      };
    }, 'Payment added.');
  };

  const deletePayment = (scheduleId, paymentIndex) => {
    updatePaymentSchedule(scheduleId, schedule => ({
      ...schedule,
      payments: schedule.payments.filter((payment, index) => index !== paymentIndex),
    }), 'Payment deleted.');
  };

  const renderPaymentSchedule = schedule => {
    const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];
    if (!payments.length) return null;

    return (
      <PaymentScheduleCard aria-label="Payment schedule">
        <PaymentScheduleTitle>Payment schedule</PaymentScheduleTitle>
        <PaymentScheduleList>
          {payments.map((payment, index) => (
            <PaymentScheduleRow key={`${schedule.id || 'payment'}-${index}`}>
              <PaymentScheduleLabel>{payment.title}</PaymentScheduleLabel>
              <PaymentScheduleAmount>{formatEuroAmount(payment.amount)}</PaymentScheduleAmount>
            </PaymentScheduleRow>
          ))}
        </PaymentScheduleList>
      </PaymentScheduleCard>
    );
  };

  const renderPaymentScheduleEditor = (program, schedule) => {
    if (!isEditMode) return null;
    if (!schedule) {
      return (
        <PaymentScheduleCard>
          <PaymentScheduleTitle>Payment schedule</PaymentScheduleTitle>
          <SoftButton type="button" onClick={() => createProgramPaymentSchedule(program)}>
            <FaPlus /> Create payment schedule
          </SoftButton>
        </PaymentScheduleCard>
      );
    }

    const payments = Array.isArray(schedule.payments) ? schedule.payments : [];

    return (
      <PaymentScheduleCard>
        <PaymentScheduleTitle>Payment schedule editor</PaymentScheduleTitle>
        <PaymentScheduleEditor>
          <EditableField>
            Schedule ID
            <EditInput
              defaultValue={schedule.id || ''}
              onBlur={event => updatePaymentScheduleId(schedule.id, event.target.value)}
            />
          </EditableField>
          {payments.map((payment, index) => (
            <PaymentEditorRow key={`${schedule.id}-editor-${index}`}>
              <EditableField>
                Title
                <EditInput
                  defaultValue={payment.title || ''}
                  onBlur={event => updatePayment(schedule.id, index, 'title', event.target.value)}
                />
              </EditableField>
              <EditableField>
                Amount
                <EditInput
                  type="number"
                  inputMode="decimal"
                  defaultValue={payment.amount ?? ''}
                  onBlur={event => updatePayment(schedule.id, index, 'amount', event.target.value)}
                />
              </EditableField>
              <PaymentEditorActions>
                <SoftButton type="button" onClick={() => addPayment(schedule.id, index)}>
                  <FaPlus /> After
                </SoftButton>
                <DangerButton type="button" onClick={() => deletePayment(schedule.id, index)}>
                  <FaTrash />
                </DangerButton>
              </PaymentEditorActions>
            </PaymentEditorRow>
          ))}
          <PaymentEditorActions>
            <SoftButton type="button" onClick={() => addPayment(schedule.id, payments.length - 1)}>
              <FaPlus /> {payments.length ? 'Add payment' : 'Add first payment'}
            </SoftButton>
            <DangerButton type="button" onClick={() => deleteProgramPaymentSchedule(program)}>
              <FaTrash /> Delete schedule
            </DangerButton>
          </PaymentEditorActions>
        </PaymentScheduleEditor>
      </PaymentScheduleCard>
    );
  };

  const removeInternalNote = async (collection, recordId) => {
    const index = catalog[collection].findIndex(record => String(record.id) === String(recordId));
    if (index === -1) return;
    updateCatalogRecord(collection, recordId, { internalNote: undefined });
    try {
      await remove(ref(database, `budget/${collection}/${index}/internalNote`));
      toast.success('Internal note removed.');
    } catch (saveError) {
      console.error('Unable to remove internal note', saveError);
      toast.error('Unable to remove internal note.');
      loadBudget();
    }
  };

  const scrollToContact = () => {
    const target = document.getElementById('contact') || document.querySelector('[data-contact-section]');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.location.hash = 'contact';
  };

  const renderInternalNote = (collection, record) => (
    record.internalNote ? (
      <InternalNote>
        <span>{record.internalNote}</span>
        <IconButton
          type="button"
          aria-label="Remove internal note"
          onClick={() => removeInternalNote(collection, record.id)}
        >
          <FaTimes />
        </IconButton>
      </InternalNote>
    ) : null
  );

  const renderEditableFields = (collection, record, priceField = 'price') => {
    const recordIndex = catalog[collection].findIndex(item => String(item.id) === String(record.id));
    const collectionLabel = BUDGET_COLLECTION_LABELS[collection] || 'item';

    return (
      <EditableGrid>
        <EditableField>
          ID
          <BackendIdButton
            type="button"
            disabled={recordIndex === -1}
            title="Open this budget record in Firebase"
            onClick={() => openBudgetBackendRecord(collection, record.id)}
          >
            <span>{record.id}</span>
            <FaExternalLinkAlt size={12} />
          </BackendIdButton>
        </EditableField>
        <EditableField>
          Name
          <EditInput
            value={record.name || ''}
            onChange={event => handleCatalogFieldChange(collection, record.id, 'name', event.target.value)}
            onBlur={event => persistCatalogRecordField(collection, record.id, 'name', event.target.value)}
          />
        </EditableField>
        <EditableField>
          Price
          <EditInput
            type="number"
            inputMode="decimal"
            value={record[priceField] ?? ''}
            onChange={event => handleCatalogFieldChange(collection, record.id, priceField, event.target.value)}
            onBlur={event => persistCatalogRecordField(collection, record.id, priceField, event.target.value)}
          />
        </EditableField>
        {collection === 'items' ? (
          <EditableField>
            Category
            <EditInput
              value={categoryDrafts[String(record.id)] ?? record.category ?? ''}
              onChange={event => setCategoryDrafts(current => ({
                ...current,
                [String(record.id)]: event.target.value,
              }))}
              onBlur={event => {
                const nextCategory = event.target.value;
                setCategoryDrafts(current => {
                  const nextDrafts = { ...current };
                  delete nextDrafts[String(record.id)];
                  return nextDrafts;
                });
                persistCatalogRecordField(collection, record.id, 'category', nextCategory);
              }}
            />
          </EditableField>
        ) : null}
        <EditableDescriptionField>
          Description
          <EditTextarea
            value={record.description || ''}
            onChange={event => handleCatalogFieldChange(collection, record.id, 'description', event.target.value)}
            onBlur={event => persistCatalogRecordField(collection, record.id, 'description', event.target.value)}
          />
        </EditableDescriptionField>
        <InlineActionRow>
          <SoftButton
            type="button"
            onClick={() => persistCatalogRecordHidden(collection, record.id, !record.hidden)}
          >
            {record.hidden ? `Show ${collectionLabel}` : `Hide ${collectionLabel}`}
          </SoftButton>
          <DangerButton
            type="button"
            onClick={() => setDeleteTarget({ collection, recordId: record.id, name: record.name || record.id })}
          >
            <FaTrash /> Delete from backend
          </DangerButton>
        </InlineActionRow>
        {record.hidden ? <HiddenBadge>Hidden from clients</HiddenBadge> : null}
      </EditableGrid>
    );
  };

  return (
    <Page>
      <Shell>
        <Header>
          <div>
            <Eyebrow>Private client budget</Eyebrow>
            <Title>Program Budget</Title>
            <Subtitle>
              A clear overview of surrogacy program packages and optional expenses, prepared for international intended parents with transparent inclusions and calm, private presentation.
            </Subtitle>
          </div>
          <HeaderActions>
            <SoftButton type="button" disabled title="PDF export will be added in the next step">
              <FaFilePdf /> Export as PDF
            </SoftButton>
            {isBudgetAdmin ? (
              <SoftButton
                type="button"
                onClick={toggleEditMode}
                aria-pressed={isEditMode}
                title={isEditMode ? 'Preview budget as a client' : 'Edit budget'}
              >
                <FaPen /> {isEditMode ? 'Preview mode' : 'Edit budget'}
              </SoftButton>
            ) : null}
            {isBudgetAdmin && isEditMode ? (
              <>
                {/* Temporary migration button. Remove after the budget catalog has been uploaded to the backend. */}
                <SoftButton type="button" onClick={handleUploadClick} $danger>
                  <FaUpload /> Upload budget JSON to backend
                </SoftButton>
                <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleBudgetFileChange} />
              </>
            ) : null}
          </HeaderActions>
        </Header>

        {loading ? <StateCard>Loading budget catalog…</StateCard> : null}
        {!loading && error ? <StateCard>{error}</StateCard> : null}

        {!loading && !error ? (
          <>
            <Section aria-labelledby="budget-programs-title" $compact={!isEditMode}>
              <SectionHeading>
                <div>
                  <H2 id="budget-programs-title">Programs</H2>
                  <SectionNote>Core program packages are ordered from essential to premium.</SectionNote>
                </div>
              </SectionHeading>
              <ProgramsGrid>
                {sortedPackages.map(program => {
                  const isOpen = Boolean(openPrograms[program.id]);
                  const isPopular = String(program.id) === POPULAR_PACKAGE_ID;
                  const isGuaranteed = GUARANTEED_PACKAGE_IDS.has(String(program.id));
                  const includedItems = Array.isArray(program.children)
                    ? program.children
                      .map(id => itemsById.get(String(id)))
                      .filter(item => item && (isEditMode || !item.hidden))
                    : [];
                  const includedExpanded = Boolean(expandedIncluded[program.id]);
                  const visibleIncludedItems = includedExpanded
                    ? includedItems
                    : includedItems.slice(0, INCLUDED_PREVIEW_LIMIT);
                  return (
                    <ProgramCard key={program.id} $guaranteed={isGuaranteed} $compact={!isEditMode}>
                      {isPopular ? <Badge>{POPULAR_PACKAGE_BADGE}</Badge> : null}
                      {isGuaranteed ? <ProgramMeta>Guaranteed program</ProgramMeta> : null}
                      <ProgramName>{program.name}</ProgramName>
                      <Price $compact={!isEditMode}>{formatMoney(program.listedPrice, program.currency || 'EUR')}</Price>
                      {program.description ? <Description $compact={!isEditMode}>{program.description}</Description> : null}
                      {isEditMode ? renderInternalNote('packages', program) : null}
                      {isEditMode ? renderEditableFields('packages', program, 'listedPrice') : null}
                      {!isEditMode ? renderPaymentSchedule(resolveProgramPaymentSchedule(program)) : null}
                      {renderPaymentScheduleEditor(program, resolveProgramPaymentSchedule(program))}
                      <Toggle type="button" onClick={() => toggleProgram(program.id)} aria-expanded={isOpen}>
                        <span>What's included</span>
                        {isOpen ? <FaChevronUp /> : <FaChevronDown />}
                      </Toggle>
                      {isOpen ? (
                        <IncludedList>
                          {visibleIncludedItems.map(item => {
                            const detailOpen = Boolean(openDetails[item.id]);
                            return (
                              <IncludedItem key={item.id}>
                                <CheckIcon><FaCheck /></CheckIcon>
                                <div>
                                  <strong>{item.name}</strong>
                                  {item.description ? (
                                    <>
                                      {detailOpen ? <Muted $compact={!isEditMode}>{item.description}</Muted> : null}
                                      <DetailButton type="button" onClick={() => toggleDetail(item.id)}>
                                        {detailOpen ? 'Hide details' : 'Show details'}
                                      </DetailButton>
                                    </>
                                  ) : null}
                                  {isEditMode ? renderInternalNote('items', item) : null}
                                  {isEditMode ? renderEditableFields('items', item) : null}
                                </div>
                              </IncludedItem>
                            );
                          })}
                          {includedItems.length > INCLUDED_PREVIEW_LIMIT ? (
                            <ShowMoreButton type="button" onClick={() => toggleIncluded(program.id)}>
                              {includedExpanded
                                ? 'Show fewer included services'
                                : `Show all ${includedItems.length} included services`}
                            </ShowMoreButton>
                          ) : null}
                        </IncludedList>
                      ) : null}
                      <CTA type="button">Request this program</CTA>
                    </ProgramCard>
                  );
                })}
              </ProgramsGrid>
            </Section>

            <Section aria-labelledby="budget-expenses-title" $compact={!isEditMode}>
              <SectionHeading>
                <div>
                  <H2 id="budget-expenses-title">Other expenses</H2>
                  <SectionNote>Additional expenses are grouped by service category and collapsed for a softer first view.</SectionNote>
                </div>
              </SectionHeading>
              <SearchInput
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search additional services..."
                aria-label="Search additional services"
              />
              <AccordionList>
                {Object.entries(groupedExpenses).map(([category, items]) => {
                  const isOpen = Boolean(openCategories[category]);
                  const minimumPrice = getCategoryMinimumPrice(items);
                  return (
                    <Accordion key={category}>
                      <AccordionHeader type="button" onClick={() => toggleCategory(category)} aria-expanded={isOpen} $compact={!isEditMode}>
                        <span>{getCategoryLabel(category)} {minimumPrice ? <Count>{minimumPrice}</Count> : null}</span>
                        {isOpen ? <FaChevronUp /> : <FaChevronDown />}
                      </AccordionHeader>
                      {isOpen ? (
                        <ExpenseRows>
                          {items.map(item => (
                            <ExpenseRow key={item.id} $compact={!isEditMode}>
                              <ExpenseTop>
                                <ExpenseName>{item.name}</ExpenseName>
                                <ExpensePrice>{getExpensePriceLabel(item)}</ExpensePrice>
                              </ExpenseTop>
                              {item.description ? <Muted $compact={!isEditMode}>{item.description}</Muted> : null}
                              {item.extraUnit && item.extraUnitPrice ? (
                                <Muted $compact={!isEditMode}>Additional {item.extraUnit}: {formatMoney(item.extraUnitPrice, 'EUR')}</Muted>
                              ) : null}
                              {isEditMode ? renderInternalNote('items', item) : null}
                              {isEditMode ? renderEditableFields('items', item) : null}
                            </ExpenseRow>
                          ))}
                        </ExpenseRows>
                      ) : null}
                    </Accordion>
                  );
                })}
              </AccordionList>
            </Section>

            {isEditMode ? (
              <Section aria-labelledby="budget-create-item-title">
                <EditPanel>
                  <H2 id="budget-create-item-title">Create new expense</H2>
                  <SectionNote>New records are saved to the backend with the next id after the last budget item.</SectionNote>
                  <AddRecordGrid>
                    <EditableField>
                      ID
                      <EditInput value={getNextBudgetRecordId(catalog.items)} readOnly />
                    </EditableField>
                    <EditableField>
                      Name
                      <EditInput
                        value={newItem.name}
                        onChange={event => handleNewItemChange('name', event.target.value)}
                        placeholder="New service name"
                      />
                    </EditableField>
                    <EditableField>
                      Price
                      <EditInput
                        type="number"
                        inputMode="decimal"
                        value={newItem.price}
                        onChange={event => handleNewItemChange('price', event.target.value)}
                        placeholder="0"
                      />
                    </EditableField>
                    <EditableField>
                      Category
                      <EditInput
                        value={newItem.category}
                        onChange={event => handleNewItemChange('category', event.target.value)}
                        placeholder="Other"
                      />
                    </EditableField>
                    <EditableDescriptionField>
                      Description
                      <EditTextarea
                        value={newItem.description}
                        onChange={event => handleNewItemChange('description', event.target.value)}
                        placeholder="Description for clients"
                      />
                    </EditableDescriptionField>
                    <InlineActionRow>
                      <SoftButton type="button" onClick={createBudgetItem}>
                        <FaPlus /> Create and save to backend
                      </SoftButton>
                    </InlineActionRow>
                  </AddRecordGrid>
                </EditPanel>
              </Section>
            ) : null}

            {catalog.clientNotes.length ? (
              <Section aria-labelledby="budget-notes-title">
                <H2 id="budget-notes-title">Client notes</H2>
                <NoteList>
                  {catalog.clientNotes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
                </NoteList>
              </Section>
            ) : null}
          </>
        ) : null}
      </Shell>
      {deleteTarget ? (
        <ModalBackdrop role="presentation" onMouseDown={() => setDeleteTarget(null)}>
          <ConfirmModal role="dialog" aria-modal="true" aria-labelledby="budget-delete-title" onMouseDown={event => event.stopPropagation()}>
            <ModalTitle id="budget-delete-title">Delete budget item?</ModalTitle>
            <ModalText>
              This will permanently delete “{deleteTarget.name}” from the backend. Use hide if you only need to remove it from client display.
            </ModalText>
            <ModalActions>
              <SoftButton type="button" onClick={() => setDeleteTarget(null)}>Cancel</SoftButton>
              <DangerButton type="button" onClick={confirmDeleteBudgetRecord}>
                <FaTrash /> Delete from backend
              </DangerButton>
            </ModalActions>
          </ConfirmModal>
        </ModalBackdrop>
      ) : null}
      {showStickyContact ? (
        <StickyContact>
          <StickyContactInner>
            <StickyButton type="button" onClick={scrollToContact}>Contact us</StickyButton>
          </StickyContactInner>
        </StickyContact>
      ) : null}
    </Page>
  );
};

export default BudgetPage;
