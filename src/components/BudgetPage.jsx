import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, remove, set, update } from 'firebase/database';
import { FaArrowDown, FaArrowUp, FaCheck, FaChevronDown, FaChevronUp, FaExternalLinkAlt, FaFilePdf, FaPen, FaPlus, FaRedo, FaTimes, FaTrash, FaUndo, FaUpload } from 'react-icons/fa';
import { saveAs } from 'file-saver';
import { auth, database, fetchNbuUahExchangeRatesByDate } from './config';
import { isAdminUid } from 'utils/accessLevel';
import {
  collectFormulaReferencedItemIds,
  computePackageChildrenTotal,
  describeBudgetPriceFormula,
  formatEuroAmount,
  formatMoney,
  getCategoryLabel,
  getClientNoteGroupLabel,
  getExpensePriceLabel,
  normalizeBudgetPriceInput,
  normalizeCatalog,
  parseBudgetPriceValue,
  resolveBudgetPriceAmount,
  resolvePaymentAmount,
  roundToCents,
  KNOWN_CATEGORY_KEYS,
  KNOWN_CLIENT_NOTE_GROUPS,
} from './budgetCatalogUtils';
import { setPdfAgencyConfig } from './pdfTheme';

const INCLUDED_PREVIEW_LIMIT = 6;
const POPULAR_PACKAGE_ID = '3';
const POPULAR_PACKAGE_BADGE = 'Most popular';
const BUDGET_EDIT_MODE_STORAGE_KEY = 'budget:edit-mode';
const GUARANTEED_PACKAGE_IDS = new Set(['4', '5']);
const FALLBACK_FIREBASE_PROJECT_ID = 'webringitapp';
const BUDGET_COLLECTION_LABELS = {
  packages: 'program',
  items: 'expense',
};
const UKRCOM_MARKER = 'REPRODUCTIVE AGENCY "UKRCOM"';
const CUSTOM_CATEGORY_OPTION = '__custom__';

const getTodayYmd = () => new Date().toISOString().slice(0, 10);

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

const Page = styled.main`
  min-height: 100vh;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 22px 14px 96px;
  font-family: var(--km-font);
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
  color: var(--km-accent);
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

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;

  @media (max-width: 640px) {
    width: 100%;
    justify-content: flex-start;
  }
`;

const SoftButton = styled.button`
  border: 1px solid ${({ $danger }) => ($danger ? 'var(--km-danger-border)' : 'var(--km-border)')};
  background: ${({ disabled }) => (disabled ? 'rgba(255, 255, 255, 0.55)' : 'var(--km-card)')};
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-text)')};
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
  border-color: var(--km-danger-border);
  color: var(--km-danger);
`;

const MiniButton = styled.button`
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 8px;
  min-height: 30px;
  padding: 4px 10px;
  font-size: 11.5px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const MiniDangerButton = styled(MiniButton)`
  border-color: var(--km-danger-border);
  color: var(--km-danger);
`;

const InlineActionRow = styled.div`
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const BackendIdButton = styled.button`
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--km-accent);
  min-height: 20px;
  padding: 1px 2px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  font-size: 12px;
  font-weight: 900;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--km-accent-light);
  }
`;

const HiddenBadge = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: 999px;
  background: var(--km-danger-bg);
  color: var(--km-danger);
  padding: 4px 7px;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
`;

const EditPanel = styled.div`
  margin-top: 16px;
  border: 1px solid var(--km-border);
  border-radius: 22px;
  background: var(--km-card);
  padding: 16px;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(20, 16, 12, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const ConfirmModal = styled.div`
  width: min(100%, 440px);
  max-height: min(85vh, 640px);
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  background: var(--km-card);
  box-shadow: 0 24px 70px rgba(20, 16, 12, 0.24);
  padding: 22px;
  color: var(--km-text);
  overflow: hidden;
`;

const ModalTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 22px;
  flex: 0 0 auto;
`;

const ModalText = styled.p`
  margin: 0 0 16px;
  color: var(--km-muted);
  line-height: 1.5;
  flex: 0 0 auto;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  flex: 0 0 auto;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--km-border);
`;

const ModalScrollArea = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0 -6px;
  padding: 0 6px;
`;

const ServicePickerList = styled.div`
  display: grid;
  gap: 8px;
`;

const ServicePickerButton = styled(MiniButton)`
  justify-content: flex-start;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  min-height: 38px;
  font-size: 13px;
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
  color: var(--km-muted);
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
  border: 1px solid ${({ $guaranteed }) => ($guaranteed ? 'rgba(232, 121, 26, 0.45)' : 'var(--km-border)')};
  border-radius: 28px;
  background: ${({ $guaranteed }) => ($guaranteed ? '#FFF8EF' : 'var(--km-card)')};
  box-shadow: 0 24px 70px rgba(26, 26, 26, 0.07);
  padding: ${({ $compact }) => ($compact ? '17px' : '22px')};
`;

const Badge = styled.span`
  position: absolute;
  top: 18px;
  right: 18px;
  border-radius: 999px;
  background: var(--km-accent-light);
  color: var(--km-accent);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.04em;
  padding: 6px 9px;
  text-transform: uppercase;
`;

const ProgramMeta = styled.div`
  color: var(--km-accent);
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
  color: var(--km-accent);
  font-size: ${({ $compact }) => ($compact ? 'clamp(27px, 7vw, 38px)' : 'clamp(32px, 8vw, 46px)')};
  font-weight: 900;
  letter-spacing: -0.06em;
`;

const Description = styled.p`
  margin: 0;
  color: var(--km-muted);
  font-size: ${({ $compact }) => ($compact ? '14px' : '15px')};
  line-height: ${({ $compact }) => ($compact ? 1.42 : 1.56)};
`;

const PaymentScheduleCard = styled.section`
  margin-top: 14px;
  border: 1px solid var(--km-border);
  border-radius: 18px;
  background: rgba(250, 241, 229, 0.72);
  padding: 13px;
`;

const PaymentScheduleTitle = styled.h4`
  margin: 0 0 10px;
  color: var(--km-text);
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.01em;
`;

const PaymentScheduleEditorHeader = styled.button`
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--km-text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 0;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.01em;
  text-align: left;
  cursor: pointer;
`;

const PaymentScheduleEditorHeaderText = styled.span`
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
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
  border-top: 1px solid var(--km-border);
  padding-top: 8px;

  &:first-child {
    border-top: 0;
    padding-top: 0;
  }
`;

const PaymentScheduleLabel = styled.span`
  min-width: 0;
  color: var(--km-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const PaymentScheduleAmount = styled.span`
  color: var(--km-accent);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
  text-align: right;
  white-space: nowrap;
`;

const PaymentScheduleTotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #D8D8CE;
  margin-top: 10px;
  padding-top: 8px;
  color: var(--km-text);
  font-size: 13px;
  font-weight: 900;
`;

const PaymentScheduleEditor = styled.div`
  margin-top: 8px;
  display: grid;
  gap: 7px;
`;

const PaymentEditorRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(76px, 96px) auto;
  gap: 6px;
  align-items: end;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const PaymentEditorActions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const Toggle = styled.button`
  width: 100%;
  border: 0;
  background: var(--km-accent-light);
  color: var(--km-text);
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
  color: var(--km-text);
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
  background: var(--km-accent-light);
  color: var(--km-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  margin-top: 1px;
`;

const DetailButton = styled.button`
  border: 0;
  background: transparent;
  color: var(--km-accent);
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
  border-radius: var(--km-radius);
  background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%);
  color: #fff;
  margin-top: 18px;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 900;
  cursor: pointer;
  transition: box-shadow 0.18s ease, transform 0.18s ease, filter 0.18s ease;

  &:hover {
    filter: brightness(1.05);
    box-shadow: 0 8px 22px rgba(232, 121, 26, 0.28);
  }

  &:active {
    transform: scale(0.99);
  }
`;

const AccordionList = styled.div`
  display: grid;
  gap: 12px;
`;

const Accordion = styled.div`
  overflow: hidden;
  border: 1px solid var(--km-border);
  border-radius: 22px;
  background: var(--km-card);
`;

const AccordionHeader = styled.button`
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--km-text);
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
  color: var(--km-muted);
  font-size: 12px;
  font-weight: 800;
`;

const ShowMoreButton = styled.button`
  border: 1px solid var(--km-border);
  border-radius: 14px;
  background: var(--km-card);
  color: var(--km-accent);
  min-height: 44px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
`;

const ExpenseRows = styled.div`
  border-top: 1px solid var(--km-border);
  padding: 2px 18px 10px;
`;

const ExpenseRow = styled.div`
  padding: ${({ $compact }) => ($compact ? '9px 0' : '13px 0')};
  border-bottom: 1px solid var(--km-border);

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
  color: var(--km-accent);
  font-size: 15px;
  font-weight: 900;
  white-space: nowrap;
`;

const Muted = styled.p`
  margin: ${({ $compact }) => ($compact ? '3px 0 0' : '5px 0 0')};
  color: var(--km-muted);
  font-size: ${({ $compact }) => ($compact ? '12px' : '13px')};
  line-height: ${({ $compact }) => ($compact ? 1.35 : 1.45)};
`;

const InternalNote = styled.div`
  margin-top: 6px;
  border: 1px solid rgba(185, 28, 28, 0.28);
  border-radius: 10px;
  background: rgba(254, 226, 226, 0.64);
  color: #991b1b;
  display: grid;
  grid-template-columns: 1fr 32px;
  gap: 6px;
  align-items: center;
  padding: 5px 0 5px 8px;
  font-size: 11.5px;
  font-weight: 800;
  line-height: 1.35;
`;

const InternalNoteInput = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  min-height: 28px;
  padding: 2px 0;
  resize: vertical;
`;

const IconButton = styled.button`
  border: 0;
  background: transparent;
  color: inherit;
  min-height: 30px;
  min-width: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;

const EditableGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px 8px;
  align-items: flex-end;
  margin-top: 5px;
`;

const AddRecordGrid = styled(EditableGrid)`
  margin-top: 12px;
`;

const EditableField = styled.label`
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1 1 150px;
`;

// Compact edit mode: label sits next to its value on one line instead of stacked above it.
const FieldLabel = styled.span`
  flex: 0 0 auto;
  color: var(--km-muted);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const EditableIdField = styled(EditableField)`
  flex: 0 0 auto;
`;

const EditablePriceField = styled(EditableField)`
  flex: 0 1 92px;
`;

const EditableDescriptionField = styled(EditableField)`
  flex: 1 1 100%;
`;


// Edit-mode inputs stay inputs, but render as plain text to keep edit mode compact.
const EditInput = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--km-text);
  min-height: 20px;
  padding: 1px 2px;
  font-size: 12.5px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: normal;

  &:hover {
    background: var(--km-accent-light);
  }

  &:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: inset 0 0 0 1px var(--km-border);
  }
`;

const EditTextarea = styled.textarea`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--km-text);
  min-height: 20px;
  padding: 1px 2px;
  font-size: 12.5px;
  line-height: 1.32;
  resize: vertical;
  text-transform: none;
  letter-spacing: normal;

  &:hover {
    background: var(--km-accent-light);
  }

  &:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: inset 0 0 0 1px var(--km-border);
  }
`;

const EditSelect = styled.select`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--km-text);
  min-height: 20px;
  padding: 1px 2px;
  font-size: 12.5px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: normal;
  cursor: pointer;

  &:hover {
    background: var(--km-accent-light);
  }

  &:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: inset 0 0 0 1px var(--km-border);
  }
`;

const PriceComputedBadge = styled.span`
  margin-left: 6px;
  color: ${({ $over }) => ($over ? '#b91c1c' : '#15803d')};
  font-size: 10px;
  font-weight: 900;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
`;

const ScheduleDiffBadge = styled.span`
  margin-left: 8px;
  color: ${({ $over }) => ($over ? '#b91c1c' : '#15803d')};
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
`;

const FormulaDebugNote = styled.div`
  flex: 1 1 100%;
  color: var(--km-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
  line-height: 1.3;
  overflow-wrap: anywhere;
`;

// Inline name+price editor: replaces the read-mode heading in place, no separate labeled fields below.
const InlineEditRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

const InlinePriceWrap = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
`;

const NameEditInput = styled(EditInput)`
  flex: 1 1 160px;
  font-weight: 850;
  font-size: ${({ $size }) => $size || '15px'};
`;

const PriceEditInput = styled(EditInput)`
  flex: 0 0 auto;
  width: ${({ $width }) => $width || '96px'};
  text-align: right;
  color: var(--km-accent);
  font-weight: 900;
  font-size: ${({ $size }) => $size || '15px'};
`;

const DescriptionEditInput = styled(EditTextarea)`
  display: block;
  flex: 1 1 100%;
  width: 100%;
  color: var(--km-muted);
  font-size: ${({ $size }) => $size || '13px'};
  line-height: 1.45;
`;

const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--km-border);
  border-radius: 18px;
  background: var(--km-card);
  color: var(--km-text);
  padding: 13px 15px;
  font-size: 15px;
  margin-bottom: 14px;
`;

const NotesGrid = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const NoteCard = styled.div`
  border: 1px solid var(--km-border);
  border-radius: 22px;
  background: var(--km-card);
  padding: 18px 20px;
`;

const NoteCardTitle = styled.h3`
  margin: 0 0 10px;
  font-size: 16px;
  letter-spacing: -0.02em;
  color: var(--km-text);
`;

const NoteList = styled.ul`
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 7px;
  color: var(--km-muted);
  font-size: 14px;
  line-height: 1.55;
`;

const NotesEditorGroup = styled.div`
  display: grid;
  gap: 6px;
`;

const NoteEditorRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 6px;
  align-items: start;
  color: var(--km-danger);
`;

const StateCard = styled.div`
  padding: 28px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--km-muted);
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
  background: rgba(255, 255, 255, 0.86);
  border-top: 1px solid var(--km-border);
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
  const [insertChildTarget, setInsertChildTarget] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [exchangeRates, setExchangeRates] = useState(null);
  const [focusedPriceKey, setFocusedPriceKey] = useState('');
  const [newItem, setNewItem] = useState(() => ({
    name: '',
    price: '',
    description: '',
    category: 'Other',
    customCategory: '',
  }));
  const [collapsedScheduleEditors, setCollapsedScheduleEditors] = useState({});
  const fileInputRef = useRef(null);
  const isBudgetAdmin = Boolean(isAdmin) || isAdminUid(auth.currentUser?.uid) || (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('admin') === '1');
  const [isEditMode, setIsEditMode] = useState(() => {
    if (!isBudgetAdmin || typeof window === 'undefined') return false;
    return window.localStorage.getItem(BUDGET_EDIT_MODE_STORAGE_KEY) === '1';
  });

  // Undo/redo for edit mode: mirrors the change history pattern used in the profile
  // editor (AddNewProfile) — every persisted catalog change is snapshotted so it can
  // be stepped back through (and forward again), rewriting the backend each time.
  const cloneCatalogSnapshot = useCallback(snapshot => JSON.parse(JSON.stringify(snapshot || {})), []);
  const catalogHistoryRef = useRef({ loaded: false, current: null, undoStack: [], redoStack: [] });
  const historyNavigationRef = useRef(false);
  // Reloading from the backend (initial load, or a reload after a failed save) replaces
  // the whole catalog — that is not a user edit, so it must not become an undo entry.
  const historyLoadRef = useRef(false);
  const [, setHistoryVersion] = useState(0);

  const loadBudget = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snapshot = await get(ref(database, 'budget'));
      const value = snapshot.exists() ? snapshot.val() : null;
      historyLoadRef.current = true;
      setCatalog(normalizeCatalog(value));
      // Agency identity (wordmark/footer of every generated PDF) is backend data, shared with the
      // other documents through pdfTheme's config store.
      setPdfAgencyConfig(value?.technical?.agency);
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
    const history = catalogHistoryRef.current;
    if (!history.loaded) {
      catalogHistoryRef.current = { loaded: true, current: cloneCatalogSnapshot(catalog), undoStack: [], redoStack: [] };
      historyLoadRef.current = false;
      setHistoryVersion(version => version + 1);
      return;
    }
    if (historyNavigationRef.current || historyLoadRef.current) {
      history.current = cloneCatalogSnapshot(catalog);
      historyNavigationRef.current = false;
      historyLoadRef.current = false;
      return;
    }
    if (JSON.stringify(history.current) === JSON.stringify(catalog)) return;
    history.undoStack.push(history.current);
    history.redoStack = [];
    history.current = cloneCatalogSnapshot(catalog);
    setHistoryVersion(version => version + 1);
  }, [catalog, cloneCatalogSnapshot]);

  useEffect(() => {
    let cancelled = false;
    // The official NBU rate powers "=" price formulas: when the rate changes,
    // resolved prices change with it.
    fetchNbuUahExchangeRatesByDate(getTodayYmd())
      .then(rates => {
        if (!cancelled && rates) setExchangeRates(rates);
      })
      .catch(ratesError => {
        console.error('Unable to load NBU exchange rates for budget formulas', ratesError);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const priceContext = useMemo(
    () => ({ itemsById, rates: exchangeRates }),
    [itemsById, exchangeRates],
  );

  const formulaReferencedItemIds = useMemo(
    () => collectFormulaReferencedItemIds(catalog),
    [catalog],
  );

  const categoryOptions = useMemo(() => {
    const keys = [...KNOWN_CATEGORY_KEYS];
    catalog.items.forEach(item => {
      const category = String(item?.category || '').trim();
      if (category && !keys.includes(category)) keys.push(category);
    });
    if (!keys.includes('Other')) keys.push('Other');
    return keys;
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
      .sort((a, b) => (resolveBudgetPriceAmount(a.listedPrice, priceContext) || 0)
        - (resolveBudgetPriceAmount(b.listedPrice, priceContext) || 0));
  }, [catalog.packages, isEditMode, priceContext]);

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
      // Sub-services referenced from price formulas are already part of another
      // service/package price, so clients never see them as separate rows.
      if (!isEditMode && formulaReferencedItemIds.has(itemId)) return groups;
      const searchableText = `${item.name || ''} ${item.description || ''} ${isEditMode ? item.internalNote || '' : ''}`.toLowerCase();
      if (normalizedQuery && !searchableText.includes(normalizedQuery)) return groups;
      const category = item.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
      return groups;
    }, {});
  }, [catalog.items, includedItemIds, formulaReferencedItemIds, query, isEditMode]);

  const noteGroupKeys = useMemo(() => {
    const keys = [...KNOWN_CLIENT_NOTE_GROUPS];
    Object.keys(catalog.clientNotes || {}).forEach(key => {
      if (!keys.includes(key)) keys.push(key);
    });
    return keys;
  }, [catalog.clientNotes]);

  const visibleNoteGroups = useMemo(() => noteGroupKeys
    .map(key => [key, (catalog.clientNotes?.[key] || []).filter(note => String(note).trim())])
    .filter(([, notes]) => notes.length), [noteGroupKeys, catalog.clientNotes]);

  useEffect(() => {
    if (isBudgetAdmin) return;
    setIsEditMode(false);
  }, [isBudgetAdmin]);

  // Prevents the background page from scrolling behind an open modal while the
  // wheel/touch scroll is over the modal itself.
  useEffect(() => {
    if (!insertChildTarget && !deleteTarget) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [insertChildTarget, deleteTarget]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleExportPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      // Load the PDF renderer lazily so it stays out of the main bundle.
      const [{ pdf }, { default: BudgetPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./BudgetPdfDocument'),
      ]);
      const blob = await pdf(React.createElement(BudgetPdfDocument, { catalog, rates: exchangeRates })).toBlob();
      saveAs(blob, `program-budget-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Budget PDF exported.');
    } catch (exportError) {
      console.error('Unable to export budget PDF', exportError);
      toast.error('Unable to export budget PDF.');
    } finally {
      setIsExporting(false);
    }
  };

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

  const persistCatalogSnapshot = async snapshot => {
    await Promise.all([
      set(ref(database, 'budget/packages'), snapshot.packages || []),
      set(ref(database, 'budget/items'), snapshot.items || []),
      set(ref(database, 'budget/technical'), snapshot.technical || {}),
      set(ref(database, 'budget/clientNotes'), snapshot.clientNotes || {}),
    ]);
  };

  const handleUndoBudgetChanges = async () => {
    const history = catalogHistoryRef.current;
    if (!history.undoStack.length) return;
    const previous = history.undoStack.pop();
    history.redoStack.push(history.current);
    history.current = previous;
    historyNavigationRef.current = true;
    setCatalog(cloneCatalogSnapshot(previous));
    setHistoryVersion(version => version + 1);
    try {
      await persistCatalogSnapshot(previous);
      toast.success('Last change undone.');
    } catch (saveError) {
      console.error('Unable to undo budget change', saveError);
      toast.error('Unable to undo budget change.');
      loadBudget();
    }
  };

  const handleRedoBudgetChanges = async () => {
    const history = catalogHistoryRef.current;
    if (!history.redoStack.length) return;
    const next = history.redoStack.pop();
    history.undoStack.push(history.current);
    history.current = next;
    historyNavigationRef.current = true;
    setCatalog(cloneCatalogSnapshot(next));
    setHistoryVersion(version => version + 1);
    try {
      await persistCatalogSnapshot(next);
      toast.success('Change restored.');
    } catch (saveError) {
      console.error('Unable to redo budget change', saveError);
      toast.error('Unable to redo budget change.');
      loadBudget();
    }
  };

  const canUndoBudgetChanges = catalogHistoryRef.current.undoStack.length > 0;
  const canRedoBudgetChanges = catalogHistoryRef.current.redoStack.length > 0;

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
  // Schedule editors default to collapsed (unset key === collapsed), so the toggle must
  // flip against that default rather than blindly negating an undefined value.
  const toggleScheduleEditorCollapsed = id => setCollapsedScheduleEditors(current => {
    const isCurrentlyCollapsed = current[id] !== false;
    return { ...current, [id]: !isCurrentlyCollapsed };
  });

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
    // Price fields accept "=" formulas and "from ..." values, stored as strings.
    const nextValue = numericFields.has(field) ? normalizeBudgetPriceInput(value) : value;
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

  const persistProgramChildren = async (programId, nextChildren, successMessage = 'Package services updated.') => {
    const packageIndex = catalog.packages.findIndex(record => String(record.id) === String(programId));
    if (packageIndex === -1) return;
    setCatalog(current => ({
      ...current,
      packages: current.packages.map(record => (String(record.id) === String(programId)
        ? { ...record, children: nextChildren }
        : record)),
    }));
    try {
      await update(ref(database, `budget/packages/${packageIndex}`), { children: nextChildren });
      toast.success(successMessage);
    } catch (saveError) {
      console.error('Unable to update package services', saveError);
      toast.error('Unable to update package services.');
      loadBudget();
    }
  };

  const removeProgramChild = (program, itemId) => {
    const nextChildren = (Array.isArray(program.children) ? program.children : [])
      .filter(id => String(id) !== String(itemId));
    persistProgramChildren(program.id, nextChildren, 'Service removed from package.');
  };

  const moveProgramChild = (program, index, direction) => {
    const children = Array.isArray(program.children) ? program.children : [];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= children.length) return;
    const nextChildren = [...children];
    [nextChildren[index], nextChildren[targetIndex]] = [nextChildren[targetIndex], nextChildren[index]];
    persistProgramChildren(program.id, nextChildren, 'Service order updated.');
  };

  const insertProgramChild = itemId => {
    if (!insertChildTarget) return;
    const program = catalog.packages.find(record => String(record.id) === String(insertChildTarget.programId));
    if (!program) {
      setInsertChildTarget(null);
      return;
    }
    const children = Array.isArray(program.children) ? program.children : [];
    const normalizedItemId = String(itemId);
    if (children.some(id => String(id) === normalizedItemId)) {
      toast.error('This service is already included in the package.');
      return;
    }
    const insertIndex = Math.max(0, Math.min(children.length, insertChildTarget.insertIndex));
    const nextChildren = [
      ...children.slice(0, insertIndex),
      normalizedItemId,
      ...children.slice(insertIndex),
    ];
    setInsertChildTarget(null);
    persistProgramChildren(program.id, nextChildren, 'Service added to package.');
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

    const price = normalizeBudgetPriceInput(newItem.price);
    const parsedPrice = parseBudgetPriceValue(price);
    if (parsedPrice.isEmpty) {
      toast.error('Enter a price, "from" price or "=" formula for the new budget item.');
      return;
    }
    if (!parsedPrice.isFormula && !Number.isFinite(Number(parsedPrice.expression.replace(',', '.')))) {
      toast.error('Enter a valid price for the new budget item.');
      return;
    }

    const category = newItem.category === CUSTOM_CATEGORY_OPTION
      ? newItem.customCategory.trim() || 'Other'
      : newItem.category.trim() || 'Other';

    const nextRecord = {
      id: getNextBudgetRecordId(catalog.items),
      name,
      price,
      description: newItem.description.trim(),
      category,
    };
    const nextItems = [...catalog.items, nextRecord];
    setCatalog(current => ({ ...current, items: nextItems }));
    try {
      await set(ref(database, `budget/items/${nextItems.length - 1}`), nextRecord);
      setNewItem({ name: '', price: '', description: '', category: 'Other', customCategory: '' });
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
        ? { ...payment, [field]: field === 'amount' ? roundToCents(Number(value)) : value }
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

  const renderPaymentSchedule = (schedule, program) => {
    const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];
    if (!payments.length) return null;
    const packagePrice = resolveBudgetPriceAmount(program?.listedPrice, priceContext);
    const total = payments.reduce((sum, payment) => sum + (resolvePaymentAmount(payment, packagePrice) || 0), 0);

    return (
      <PaymentScheduleCard aria-label="Payment schedule">
        <PaymentScheduleTitle>Payment schedule</PaymentScheduleTitle>
        <PaymentScheduleList>
          {payments.map((payment, index) => (
            <PaymentScheduleRow key={`${schedule.id || 'payment'}-${index}`}>
              <PaymentScheduleLabel>{`${index + 1}. ${payment.title || ''}`}</PaymentScheduleLabel>
              <PaymentScheduleAmount>{formatEuroAmount(resolvePaymentAmount(payment, packagePrice))}</PaymentScheduleAmount>
            </PaymentScheduleRow>
          ))}
        </PaymentScheduleList>
        <PaymentScheduleTotalRow>
          <span>Total</span>
          <span>{formatEuroAmount(total)}</span>
        </PaymentScheduleTotalRow>
      </PaymentScheduleCard>
    );
  };

  const renderPaymentScheduleEditor = (program, schedule) => {
    if (!isEditMode) return null;
    if (!schedule) {
      return (
        <PaymentScheduleCard>
          <PaymentScheduleTitle>Payment schedule</PaymentScheduleTitle>
          <MiniButton type="button" onClick={() => createProgramPaymentSchedule(program)}>
            <FaPlus /> Create payment schedule
          </MiniButton>
        </PaymentScheduleCard>
      );
    }

    const payments = Array.isArray(schedule.payments) ? schedule.payments : [];
    const packagePrice = resolveBudgetPriceAmount(program.listedPrice, priceContext);
    const scheduleTotal = payments.reduce((sum, payment) => sum + (resolvePaymentAmount(payment, packagePrice) || 0), 0);
    // Collapsed by default so an edit screen full of programs stays scannable.
    const isCollapsed = collapsedScheduleEditors[program.id] !== false;

    return (
      <PaymentScheduleCard>
        <PaymentScheduleEditorHeader
          type="button"
          onClick={() => toggleScheduleEditorCollapsed(program.id)}
          aria-expanded={!isCollapsed}
        >
          <PaymentScheduleEditorHeaderText>
            Payment schedule editor
            {packagePrice != null ? (
              <ScheduleDiffBadge
                $over={packagePrice > scheduleTotal}
                title="Package price vs payment schedule total"
              >
                {formatEuroAmount(packagePrice)} vs {formatEuroAmount(scheduleTotal)}
              </ScheduleDiffBadge>
            ) : null}
          </PaymentScheduleEditorHeaderText>
          {isCollapsed ? <FaChevronDown /> : <FaChevronUp />}
        </PaymentScheduleEditorHeader>
        {isCollapsed ? null : (
          <PaymentScheduleEditor>
            <EditableField>
              <FieldLabel>Schedule ID</FieldLabel>
              <EditInput
                defaultValue={schedule.id || ''}
                onBlur={event => updatePaymentScheduleId(schedule.id, event.target.value)}
              />
            </EditableField>
            {payments.map((payment, index) => (
              <PaymentEditorRow key={`${schedule.id}-editor-${index}`}>
                <EditableField>
                  <FieldLabel>Title</FieldLabel>
                  <EditInput
                    defaultValue={payment.title || ''}
                    onBlur={event => updatePayment(schedule.id, index, 'title', event.target.value)}
                  />
                </EditableField>
                <EditableField>
                  <FieldLabel>Amount</FieldLabel>
                  {payment.amount == null && payment.percent != null ? (
                    // Percent-based payment (e.g. ps-6): shown read-only here - editing it as a raw
                    // amount would silently overwrite `percent` with a frozen euro figure on blur,
                    // which defeats the point of a percent-of-listed-price schedule step.
                    <PaymentScheduleAmount title="Percent-based payment - edit the percent in the catalog JSON">
                      {`${payment.percent}% (${formatEuroAmount(resolvePaymentAmount(payment, packagePrice))})`}
                    </PaymentScheduleAmount>
                  ) : (
                    <EditInput
                      type="number"
                      inputMode="decimal"
                      defaultValue={payment.amount != null ? roundToCents(payment.amount) : ''}
                      onBlur={event => updatePayment(schedule.id, index, 'amount', event.target.value)}
                    />
                  )}
                </EditableField>
                <PaymentEditorActions>
                  <MiniButton type="button" title="Insert payment after this one" onClick={() => addPayment(schedule.id, index)}>
                    <FaPlus />
                  </MiniButton>
                  <MiniDangerButton type="button" title="Delete this payment" onClick={() => deletePayment(schedule.id, index)}>
                    <FaTrash />
                  </MiniDangerButton>
                  {index === payments.length - 1 ? (
                    <MiniDangerButton type="button" title="Delete the whole schedule" onClick={() => deleteProgramPaymentSchedule(program)}>
                      <FaTrash /> Schedule
                    </MiniDangerButton>
                  ) : null}
                </PaymentEditorActions>
              </PaymentEditorRow>
            ))}
            {payments.length ? null : (
              <PaymentEditorActions>
                <MiniButton type="button" onClick={() => addPayment(schedule.id, -1)}>
                  <FaPlus /> Add first payment
                </MiniButton>
                <MiniDangerButton type="button" onClick={() => deleteProgramPaymentSchedule(program)}>
                  <FaTrash /> Delete schedule
                </MiniDangerButton>
              </PaymentEditorActions>
            )}
          </PaymentScheduleEditor>
        )}
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

  const persistClientNotes = async (nextNotes, successMessage = 'Client notes updated.') => {
    setCatalog(current => ({ ...current, clientNotes: nextNotes }));
    try {
      await set(ref(database, 'budget/clientNotes'), nextNotes);
      toast.success(successMessage);
    } catch (saveError) {
      console.error('Unable to update client notes', saveError);
      toast.error('Unable to update client notes.');
      loadBudget();
    }
  };

  const updateClientNote = (groupKey, noteIndex, value) => {
    const groups = catalog.clientNotes || {};
    const notes = Array.isArray(groups[groupKey]) ? [...groups[groupKey]] : [];
    if (String(notes[noteIndex] ?? '') === value) return;
    notes[noteIndex] = value;
    persistClientNotes({ ...groups, [groupKey]: notes });
  };

  const addClientNote = groupKey => {
    const groups = catalog.clientNotes || {};
    const notes = Array.isArray(groups[groupKey]) ? [...groups[groupKey], ''] : [''];
    persistClientNotes({ ...groups, [groupKey]: notes }, 'Note added.');
  };

  const deleteClientNote = (groupKey, noteIndex) => {
    const groups = catalog.clientNotes || {};
    const notes = (Array.isArray(groups[groupKey]) ? groups[groupKey] : []).filter((note, index) => index !== noteIndex);
    const nextGroups = { ...groups };
    if (notes.length) {
      nextGroups[groupKey] = notes;
    } else {
      delete nextGroups[groupKey];
    }
    persistClientNotes(nextGroups, 'Note deleted.');
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
        <InternalNoteInput
          defaultValue={record.internalNote}
          aria-label="Internal note"
          onBlur={event => {
            if (event.target.value === record.internalNote) return;
            persistCatalogRecordField(collection, record.id, 'internalNote', event.target.value);
          }}
        />
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

  // Focused price inputs show the raw stored value (e.g. "=23000/EUR"),
  // blurred ones show the resolved, rounded-to-cents amount - for a plain number too, not only a
  // formula, so a legacy value with float noise (e.g. from before rounding was applied on save)
  // never leaks its raw decimals into the field once it's blurred.
  const getPriceInputDisplayValue = rawValue => {
    const parsed = parseBudgetPriceValue(rawValue);
    if (parsed.isEmpty) return rawValue ?? '';
    const amount = resolveBudgetPriceAmount(rawValue, priceContext);
    if (amount == null) return String(rawValue);
    return `${parsed.isFrom ? 'from ' : ''}${amount}`;
  };

  // Name, price and description are edited in place (see renderInlineRecordEditor) at their
  // normal read-mode position, so this grid only carries the fields that have no such spot.
  const renderEditableFields = (collection, record, options = {}) => {
    const recordIndex = catalog[collection].findIndex(item => String(item.id) === String(record.id));
    const collectionLabel = BUDGET_COLLECTION_LABELS[collection] || 'item';
    const { programChildContext = null } = options;

    return (
      <EditableGrid>
        <EditableIdField>
          <FieldLabel>ID</FieldLabel>
          <BackendIdButton
            type="button"
            disabled={recordIndex === -1}
            title="Open this budget record in Firebase"
            onClick={() => openBudgetBackendRecord(collection, record.id)}
          >
            <span>{record.id}</span>
            <FaExternalLinkAlt size={12} />
          </BackendIdButton>
        </EditableIdField>
        {collection === 'items' ? (
          <EditableField>
            <FieldLabel>Category</FieldLabel>
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
        <InlineActionRow>
          <MiniButton
            type="button"
            onClick={() => persistCatalogRecordHidden(collection, record.id, !record.hidden)}
          >
            {record.hidden ? `Show ${collectionLabel}` : `Hide ${collectionLabel}`}
          </MiniButton>
          {programChildContext ? (
            <>
              <MiniButton
                type="button"
                title="Move service up"
                aria-label="Move service up"
                disabled={programChildContext.index <= 0}
                onClick={() => moveProgramChild(programChildContext.program, programChildContext.index, -1)}
              >
                <FaArrowUp />
              </MiniButton>
              <MiniButton
                type="button"
                title="Move service down"
                aria-label="Move service down"
                disabled={programChildContext.index >= programChildContext.count - 1}
                onClick={() => moveProgramChild(programChildContext.program, programChildContext.index, 1)}
              >
                <FaArrowDown />
              </MiniButton>
              <MiniButton
                type="button"
                title="Insert service after this one"
                aria-label="Insert service after this one"
                onClick={() => setInsertChildTarget({
                  programId: programChildContext.program.id,
                  insertIndex: programChildContext.index + 1,
                })}
              >
                <FaPlus />
              </MiniButton>
              <MiniDangerButton
                type="button"
                title="Remove this service from the package"
                onClick={() => removeProgramChild(programChildContext.program, record.id)}
              >
                <FaTrash /> Delete
              </MiniDangerButton>
            </>
          ) : (
            <MiniDangerButton
              type="button"
              onClick={() => setDeleteTarget({ collection, recordId: record.id, name: record.name || record.id })}
            >
              <FaTrash /> Delete
            </MiniDangerButton>
          )}
          {record.hidden ? <HiddenBadge>Hidden from clients</HiddenBadge> : null}
        </InlineActionRow>
      </EditableGrid>
    );
  };

  // Inline replacement for the read-mode name/price/description: no separate labels,
  // no duplicate fields further down — it lives exactly where the static text used to be.
  const renderInlineRecordEditor = (collection, record, options = {}) => {
    const {
      priceField = 'price',
      nameSize,
      priceSize,
      priceWidth,
      descriptionSize,
      showChildrenTotal = false,
    } = options;
    const priceKey = `${collection}:${record.id}`;
    const rawPrice = record[priceField] ?? '';
    const isPriceFocused = focusedPriceKey === priceKey;
    const formulaDebug = describeBudgetPriceFormula(rawPrice, priceContext);
    const resolvedRecordPrice = resolveBudgetPriceAmount(rawPrice, priceContext);
    const childrenTotal = showChildrenTotal ? computePackageChildrenTotal(record, priceContext) : null;

    return (
      <>
        <InlineEditRow>
          <NameEditInput
            $size={nameSize}
            value={record.name || ''}
            placeholder="Name"
            aria-label="Name"
            onChange={event => handleCatalogFieldChange(collection, record.id, 'name', event.target.value)}
            onBlur={event => persistCatalogRecordField(collection, record.id, 'name', event.target.value)}
          />
          <InlinePriceWrap>
            <PriceEditInput
              $size={priceSize}
              $width={priceWidth}
              type="text"
              value={isPriceFocused ? String(rawPrice) : getPriceInputDisplayValue(rawPrice)}
              placeholder="0, from 0, =0/EUR"
              aria-label="Price"
              onFocus={() => setFocusedPriceKey(priceKey)}
              onChange={event => handleCatalogFieldChange(collection, record.id, priceField, event.target.value)}
              onBlur={event => {
                setFocusedPriceKey('');
                persistCatalogRecordField(collection, record.id, priceField, event.target.value);
              }}
            />
            {childrenTotal && childrenTotal.count ? (
              <PriceComputedBadge
                $over={resolvedRecordPrice != null && childrenTotal.total > resolvedRecordPrice}
                title="Real cost of the included services"
              >
                Σ {formatEuroAmount(childrenTotal.total)}
              </PriceComputedBadge>
            ) : null}
          </InlinePriceWrap>
        </InlineEditRow>
        {formulaDebug ? <FormulaDebugNote title="Price formula">{formulaDebug}</FormulaDebugNote> : null}
        <DescriptionEditInput
          $size={descriptionSize}
          value={record.description || ''}
          placeholder="Description for clients"
          aria-label="Description"
          onChange={event => handleCatalogFieldChange(collection, record.id, 'description', event.target.value)}
          onBlur={event => persistCatalogRecordField(collection, record.id, 'description', event.target.value)}
        />
      </>
    );
  };

  return (
    <Page>
      <Shell>
        <Header>
          <div>
            <Eyebrow>{(catalog.technical?.agency?.name || UKRCOM_MARKER).toUpperCase()}</Eyebrow>
            <Title>Program Budget</Title>
          </div>
          <HeaderActions>
            <MiniButton
              type="button"
              onClick={handleExportPdf}
              disabled={loading || Boolean(error) || isExporting}
              title="Download the client budget as a PDF"
            >
              <FaFilePdf /> {isExporting ? 'Preparing…' : 'Export PDF'}
            </MiniButton>
            {isBudgetAdmin ? (
              <MiniButton
                type="button"
                onClick={toggleEditMode}
                aria-pressed={isEditMode}
                title={isEditMode ? 'Preview budget as a client' : 'Edit budget'}
              >
                <FaPen /> {isEditMode ? 'Preview' : 'Edit'}
              </MiniButton>
            ) : null}
            {isBudgetAdmin && isEditMode ? (
              <>
                <MiniButton
                  type="button"
                  onClick={handleUndoBudgetChanges}
                  disabled={!canUndoBudgetChanges}
                  title="Undo the last change"
                >
                  <FaUndo />
                </MiniButton>
                <MiniButton
                  type="button"
                  onClick={handleRedoBudgetChanges}
                  disabled={!canRedoBudgetChanges}
                  title="Redo the change"
                >
                  <FaRedo />
                </MiniButton>
                {/* Temporary migration button. Remove after the budget catalog has been uploaded to the backend. */}
                <MiniDangerButton type="button" onClick={handleUploadClick}>
                  <FaUpload /> Upload JSON
                </MiniDangerButton>
                <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleBudgetFileChange} />
              </>
            ) : null}
          </HeaderActions>
        </Header>

        {loading ? <StateCard>Loading budget catalog…</StateCard> : null}
        {!loading && error ? <StateCard>{error}</StateCard> : null}

        {!loading && !error ? (
          <>
            <Section aria-label="Programs" $compact={!isEditMode}>
              <ProgramsGrid>
                {sortedPackages.map(program => {
                  const isOpen = Boolean(openPrograms[program.id]);
                  const isPopular = String(program.id) === POPULAR_PACKAGE_ID;
                  const isGuaranteed = GUARANTEED_PACKAGE_IDS.has(String(program.id));
                  const includedItems = Array.isArray(program.children)
                    ? program.children
                      .map((id, childIndex) => ({ item: itemsById.get(String(id)), childIndex }))
                      .filter(({ item }) => item && (isEditMode || !item.hidden))
                    : [];
                  const includedExpanded = Boolean(expandedIncluded[program.id]);
                  const visibleIncludedItems = includedExpanded
                    ? includedItems
                    : includedItems.slice(0, INCLUDED_PREVIEW_LIMIT);
                  return (
                    <ProgramCard key={program.id} $guaranteed={isGuaranteed} $compact={!isEditMode}>
                      {isPopular ? <Badge>{POPULAR_PACKAGE_BADGE}</Badge> : null}
                      {isGuaranteed ? <ProgramMeta>Guaranteed program</ProgramMeta> : null}
                      {isEditMode ? (
                        renderInlineRecordEditor('packages', program, {
                          priceField: 'listedPrice',
                          nameSize: '20px',
                          priceSize: '22px',
                          priceWidth: '130px',
                          descriptionSize: '14px',
                          showChildrenTotal: true,
                        })
                      ) : (
                        <>
                          <ProgramName>{program.name}</ProgramName>
                          <Price $compact={!isEditMode}>
                            {formatMoney(
                              resolveBudgetPriceAmount(program.listedPrice, priceContext) ?? program.listedPrice,
                              program.currency || 'EUR',
                            )}
                          </Price>
                          {program.description ? <Description $compact={!isEditMode}>{program.description}</Description> : null}
                        </>
                      )}
                      {isEditMode ? renderInternalNote('packages', program) : null}
                      {isEditMode ? renderEditableFields('packages', program) : null}
                      {!isEditMode ? renderPaymentSchedule(resolveProgramPaymentSchedule(program), program) : null}
                      {renderPaymentScheduleEditor(program, resolveProgramPaymentSchedule(program))}
                      <Toggle type="button" onClick={() => toggleProgram(program.id)} aria-expanded={isOpen}>
                        <span>What's included</span>
                        {isOpen ? <FaChevronUp /> : <FaChevronDown />}
                      </Toggle>
                      {isOpen ? (
                        <IncludedList>
                          {visibleIncludedItems.map(({ item, childIndex }) => {
                            const detailOpen = Boolean(openDetails[item.id]);
                            return (
                              <IncludedItem key={item.id}>
                                <CheckIcon><FaCheck /></CheckIcon>
                                <div>
                                  {isEditMode ? (
                                    renderInlineRecordEditor('items', item, {
                                      nameSize: '14px',
                                      priceSize: '13px',
                                      priceWidth: '84px',
                                      descriptionSize: '12.5px',
                                    })
                                  ) : (
                                    <>
                                      <strong>{item.name}</strong>
                                      {item.description ? (
                                        <>
                                          {detailOpen ? <Muted $compact={!isEditMode}>{item.description}</Muted> : null}
                                          <DetailButton type="button" onClick={() => toggleDetail(item.id)}>
                                            {detailOpen ? 'Hide details' : 'Show details'}
                                          </DetailButton>
                                        </>
                                      ) : null}
                                    </>
                                  )}
                                  {isEditMode ? renderInternalNote('items', item) : null}
                                  {isEditMode ? renderEditableFields('items', item, {
                                    programChildContext: {
                                      program,
                                      index: childIndex,
                                      count: Array.isArray(program.children) ? program.children.length : 0,
                                    },
                                  }) : null}
                                </div>
                              </IncludedItem>
                            );
                          })}
                          {isEditMode ? (
                            <MiniButton
                              type="button"
                              onClick={() => setInsertChildTarget({
                                programId: program.id,
                                insertIndex: Array.isArray(program.children) ? program.children.length : 0,
                              })}
                            >
                              <FaPlus /> Add service to package
                            </MiniButton>
                          ) : null}
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
                  return (
                    <Accordion key={category}>
                      <AccordionHeader type="button" onClick={() => toggleCategory(category)} aria-expanded={isOpen} $compact={!isEditMode}>
                        <span>{getCategoryLabel(category)} <Count>{items.length} {items.length === 1 ? 'service' : 'services'}</Count></span>
                        {isOpen ? <FaChevronUp /> : <FaChevronDown />}
                      </AccordionHeader>
                      {isOpen ? (
                        <ExpenseRows>
                          {items.map(item => (
                            <ExpenseRow key={item.id} $compact={!isEditMode}>
                              {isEditMode ? (
                                renderInlineRecordEditor('items', item, {
                                  nameSize: '15px',
                                  priceSize: '15px',
                                  priceWidth: '96px',
                                  descriptionSize: '13px',
                                })
                              ) : (
                                <>
                                  <ExpenseTop>
                                    <ExpenseName>{item.name}</ExpenseName>
                                    <ExpensePrice>{getExpensePriceLabel(item, priceContext)}</ExpensePrice>
                                  </ExpenseTop>
                                  {item.description ? <Muted $compact={!isEditMode}>{item.description}</Muted> : null}
                                </>
                              )}
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
                    <EditableIdField>
                      <FieldLabel>ID</FieldLabel>
                      <EditInput value={getNextBudgetRecordId(catalog.items)} readOnly />
                    </EditableIdField>
                    <EditableField>
                      <FieldLabel>Name</FieldLabel>
                      <EditInput
                        value={newItem.name}
                        onChange={event => handleNewItemChange('name', event.target.value)}
                        placeholder="New service name"
                      />
                    </EditableField>
                    <EditablePriceField style={{ flexBasis: '150px' }}>
                      <FieldLabel>Price</FieldLabel>
                      <EditInput
                        type="text"
                        value={focusedPriceKey === 'new-item'
                          ? newItem.price
                          : getPriceInputDisplayValue(newItem.price)}
                        onFocus={() => setFocusedPriceKey('new-item')}
                        onChange={event => handleNewItemChange('price', event.target.value)}
                        onBlur={() => setFocusedPriceKey('')}
                        placeholder="0, from 0, =0/EUR"
                      />
                    </EditablePriceField>
                    {describeBudgetPriceFormula(newItem.price, priceContext) ? (
                      <FormulaDebugNote title="Price formula">
                        {describeBudgetPriceFormula(newItem.price, priceContext)}
                      </FormulaDebugNote>
                    ) : null}
                    <EditableField>
                      <FieldLabel>Category</FieldLabel>
                      <EditSelect
                        value={newItem.category}
                        onChange={event => handleNewItemChange('category', event.target.value)}
                        aria-label="Category for the new budget item"
                      >
                        {categoryOptions.map(key => (
                          <option key={key} value={key}>{getCategoryLabel(key)}</option>
                        ))}
                        <option value={CUSTOM_CATEGORY_OPTION}>Custom category…</option>
                      </EditSelect>
                    </EditableField>
                    {newItem.category === CUSTOM_CATEGORY_OPTION ? (
                      <EditableField>
                        <FieldLabel>Custom category</FieldLabel>
                        <EditInput
                          value={newItem.customCategory}
                          onChange={event => handleNewItemChange('customCategory', event.target.value)}
                          placeholder="New category name"
                        />
                      </EditableField>
                    ) : null}
                    <EditableDescriptionField>
                      <FieldLabel>Description</FieldLabel>
                      <EditTextarea
                        value={newItem.description}
                        onChange={event => handleNewItemChange('description', event.target.value)}
                        placeholder="Description for clients"
                      />
                    </EditableDescriptionField>
                    <InlineActionRow>
                      <MiniButton type="button" onClick={createBudgetItem}>
                        <FaPlus /> Create and save to backend
                      </MiniButton>
                    </InlineActionRow>
                  </AddRecordGrid>
                </EditPanel>
              </Section>
            ) : null}

            {visibleNoteGroups.length || isEditMode ? (
              <Section aria-labelledby="budget-notes-title">
                <SectionHeading>
                  <div>
                    <H2 id="budget-notes-title">Good to know</H2>
                  </div>
                </SectionHeading>
                {isEditMode ? (
                  <NotesGrid>
                    {noteGroupKeys.map(groupKey => {
                      const notes = Array.isArray(catalog.clientNotes?.[groupKey]) ? catalog.clientNotes[groupKey] : [];
                      return (
                        <NoteCard key={groupKey}>
                          <NoteCardTitle>{getClientNoteGroupLabel(groupKey)}</NoteCardTitle>
                          <NotesEditorGroup>
                            {notes.map((note, index) => (
                              <NoteEditorRow key={`${groupKey}-${index}-${note}`}>
                                <EditTextarea
                                  defaultValue={note}
                                  aria-label={`${getClientNoteGroupLabel(groupKey)} note ${index + 1}`}
                                  onBlur={event => updateClientNote(groupKey, index, event.target.value)}
                                />
                                <IconButton
                                  type="button"
                                  aria-label="Delete note"
                                  onClick={() => deleteClientNote(groupKey, index)}
                                >
                                  <FaTrash />
                                </IconButton>
                              </NoteEditorRow>
                            ))}
                            <div>
                              <MiniButton type="button" onClick={() => addClientNote(groupKey)}>
                                <FaPlus /> Add note
                              </MiniButton>
                            </div>
                          </NotesEditorGroup>
                        </NoteCard>
                      );
                    })}
                  </NotesGrid>
                ) : (
                  <NotesGrid>
                    {visibleNoteGroups.map(([groupKey, notes]) => (
                      <NoteCard key={groupKey}>
                        <NoteCardTitle>{getClientNoteGroupLabel(groupKey)}</NoteCardTitle>
                        <NoteList>
                          {notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
                        </NoteList>
                      </NoteCard>
                    ))}
                  </NotesGrid>
                )}
              </Section>
            ) : null}
          </>
        ) : null}
      </Shell>
      {insertChildTarget ? (() => {
        const program = catalog.packages.find(record => String(record.id) === String(insertChildTarget.programId));
        const children = Array.isArray(program?.children) ? program.children : [];
        const availableItems = catalog.items.filter(item => !children.some(id => String(id) === String(item.id)));
        return (
          <ModalBackdrop role="presentation" onMouseDown={() => setInsertChildTarget(null)}>
            <ConfirmModal
              role="dialog"
              aria-modal="true"
              aria-labelledby="budget-insert-child-title"
              onMouseDown={event => event.stopPropagation()}
            >
              <ModalTitle id="budget-insert-child-title">Add service to package</ModalTitle>
              <ModalText>Choose a service to insert in the selected position.</ModalText>
              {availableItems.length ? (
                <ModalScrollArea>
                  <ServicePickerList>
                    {availableItems.map(item => (
                      <ServicePickerButton
                        type="button"
                        key={item.id}
                        onClick={() => insertProgramChild(item.id)}
                      >
                        <FaPlus /> {item.name || `Service ${item.id}`}
                      </ServicePickerButton>
                    ))}
                  </ServicePickerList>
                </ModalScrollArea>
              ) : <ModalText>All available services are already included in this package.</ModalText>}
              <ModalActions>
                <SoftButton type="button" onClick={() => setInsertChildTarget(null)}>Cancel</SoftButton>
              </ModalActions>
            </ConfirmModal>
          </ModalBackdrop>
        );
      })() : null}
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
