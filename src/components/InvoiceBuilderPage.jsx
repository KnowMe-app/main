import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, set } from 'firebase/database';
import {
  FaBoxOpen,
  FaChevronDown,
  FaChevronUp,
  FaCopy,
  FaFilePdf,
  FaLayerGroup,
  FaPlus,
  FaSave,
  FaSyncAlt,
  FaTrash,
  FaUndoAlt,
  FaUpload,
} from 'react-icons/fa';
import { saveAs } from 'file-saver';
import designTokens from '../data/designTokens.json';
import { auth, database, fetchNbuUahExchangeRatesByDate } from './config';
import { setPdfAgencyConfig } from './pdfTheme';
import { formatEuroSmart, getItemDisplayAmount, getSortedPackages, isFromPricedItem, parseBudgetPriceValue, resolveBudgetPriceAmount, resolvePaymentAmount, resolveProgramPaymentSchedule, roundToCents } from './budgetCatalogUtils';
import { useAutoResize } from '../hooks/useAutoResize';
import { isInvoiceBuilderUid } from 'utils/accessLevel';
import PageNavMenu from './PageNavMenu';
import {
  addCatalogChildToPackage,
  addCustomChildToPackage,
  applyPaymentPurposePlaceholders,
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  buildUkrcomFileName,
  cloneEntryWithNewId,
  computeInvoiceAmountDue,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  convertAmountToEur,
  createEntryId,
  dedupePackageEntries,
  formatInvoicePurposeDate,
  generateInvoiceIdentifiers,
  getActiveBeneficiary,
  getEntryIdentityKey,
  getTodayYmd,
  isInvoiceDataShape,
  makeCatalogItemEntry,
  makeCatalogPackageEntry,
  makeCustomEntry,
  makeCustomPackageEntry,
  makeIssuedInvoiceRecord,
  makePercentOfPackageEntry,
  movePackageChild,
  normalizeInvoiceData,
  parseCustomPriceInput,
  parsePercentOrAmountInput,
  parseReceivedOnYmd,
  removePackageChild,
  reorderBeneficiaryIds,
  reorderPayerCaseIds,
  reorderRecentServices,
  resetItemEntryOverrides,
  resetPackageEntryToCatalog,
  resolveIssuedInvoicePaymentStatus,
  removeRecentEntry,
  resolveInvoiceServiceRows,
  resolveServiceRow,
  setEntryField,
  setPackageSchedule,
  touchRecentEntry,
  updatePackageChildField,
  upsertRecentEntry,
} from './invoiceCatalogUtils';
import {
  addMilestoneService,
  buildExpectedExpensesPlan,
  buildExpectedExpensesPlanFromRawGroups,
  buildMilestonesFromSchedule,
  computeMilestoneAmountDue,
  computeMilestoneSubtotal,
  computeMilestonesPackageSharePercent,
  computeMilestonesTotal,
  getExpectedExpensesPackagePrice,
  isExpectedExpensesShape,
  isRawExpectedExpensesGroups,
  normalizeExpectedExpensesData,
  removeMilestoneService,
  resolveMilestoneServiceRows,
  serializeExpectedExpensesData,
  setMilestoneField,
  updateMilestoneServiceField,
} from './expectedExpensesUtils';

const INVOICE_DATA_PATH = 'invoiceBuilder';
const CATALOG_ITEMS_PATH = 'budget/items';
const CATALOG_PACKAGES_PATH = 'budget/packages';
const CATALOG_TECHNICAL_PATH = 'budget/technical';
const EXPECTED_EXPENSES_PATH = 'invoiceBuilder/expectedExpenses';

const toArray = value => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
};

// A dynamic chunk that fails to load almost always means the deployed app was updated after this
// tab was opened - the previous build's hashed chunk files are gone from the server, so webpack's
// "Loading chunk NNN failed" is really "this page is stale". Detect it so the toast can say the
// actual fix (refresh) instead of surfacing the cryptic chunk error.
const isStaleChunkError = error => /loading (?:css )?chunk|chunkloaderror/i.test(`${error?.name || ''} ${error?.message || ''}`);
const STALE_APP_MESSAGE = 'The app has been updated since this page was opened. Refresh the page and try again.';

const emptyBeneficiary = () => ({
  id: `beneficiary-${Date.now()}`,
  title: 'New beneficiary',
  address: '',
  iban: '',
  bankName: '',
  swiftCode: '',
  paymentPurpose: '',
});

// --- Layout shell ------------------------------------------------------

// Scoped to this page only (never touches the app-wide :root tokens in index.css): the Invoice
// Builder is one of the UKRCOM client-facing documents, so it reads the same paper/bronze palette
// as the PDFs (src/data/designTokens.json) instead of KnowMe's orange brand accent. Because these
// are the same custom-property names the rest of the file's styled-components already reference
// (var(--km-accent), var(--km-card), ...), redefining them here on the page root is enough to
// retint the whole subtree - no call site below needs to change.
const Page = styled.main`
  --km-bg: #EFE9DD;
  --km-card: ${designTokens.color.paper};
  --km-text: ${designTokens.color.docInk};
  --km-muted: ${designTokens.color.inkSoft};
  --km-border: ${designTokens.color.docLine};
  --km-accent: ${designTokens.color.bronze};
  --km-accent-mid: #C6A671;
  --km-accent-light: rgba(162, 121, 63, 0.12);
  --km-danger: #B3523F;
  --km-danger-border: rgba(179, 82, 63, 0.35);
  --km-font: 'Inter', sans-serif;
  --km-font-display: 'Fraunces', serif;

  min-height: 100vh;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 16px 12px 72px;
  font-family: var(--km-font);
  font-size: 13px;
`;

const Shell = styled.div`
  width: min(100%, 880px);
  margin: 0 auto;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  @media (max-width: 560px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const Eyebrow = styled.div`
  color: var(--km-accent);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  margin-bottom: 2px;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  font-family: var(--km-font-display);
  font-size: clamp(20px, 4vw, 27px);
  line-height: 1.05;
  letter-spacing: -0.02em;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;

  @media (max-width: 560px) {
    width: 100%;
    justify-content: flex-start;
  }
`;

const MiniButton = styled.button`
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 6px;
  min-height: 30px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.55 : 1)};
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;

  &:hover:not(:disabled) {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }
`;

const PrimaryMiniButton = styled(MiniButton)`
  border: none;
  color: #fff;
  background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%);

  &:hover:not(:disabled) {
    color: #fff;
    filter: brightness(1.05);
  }
`;

const SmallButton = styled(MiniButton)`
  min-height: 24px;
  padding: 3px 9px;
  font-size: 10.5px;
  border-radius: 5px;
`;

const DangerButton = styled(SmallButton)`
  border-color: var(--km-danger-border);
  color: var(--km-danger);

  &:hover:not(:disabled) {
    border-color: var(--km-danger);
    color: var(--km-danger);
  }
`;

// A SmallButton that is really a native <select> (stretched invisibly across it, same trick as
// PackageSwitchButton) - used for pick-one actions like "Copy from payer" so the option list
// opens as a normal picker while the control still reads as a button.
const SmallButtonSelect = styled(SmallButton).attrs({ as: 'span' })`
  position: relative;

  select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
`;

// $dense shrinks the button footprint (package-card header cluster wants less height, a package
// child row's footer cluster wants less width) without touching every other IconButton on the page.
const iconButtonBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ $dense }) => ($dense ? '18px' : '20px')};
  height: ${({ $dense }) => ($dense ? '18px' : '20px')};
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--km-muted);
  font-size: ${({ $dense }) => ($dense ? '9px' : '10.5px')};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.3 : 1)};
  transition: color 0.15s ease, background 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--km-accent-light);
    color: var(--km-accent);
  }
`;

const IconButton = styled.button`${iconButtonBase}`;

const IconDangerButton = styled.button`
  ${iconButtonBase}
  &:hover:not(:disabled) {
    background: rgba(179, 82, 63, 0.12);
    color: var(--km-danger);
  }
`;

const Panel = styled.section`
  margin-top: 10px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-card);
  padding: 12px 14px;
`;

const PanelHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
`;

const H2 = styled.h2`
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--km-muted);
`;

const PanelNote = styled.p`
  margin: -2px 0 8px;
  color: var(--km-muted);
  font-size: 11.5px;
  line-height: 1.4;
`;

const StateCard = styled.div`
  padding: 20px;
  border-radius: 10px;
  background: var(--km-card);
  border: 1px solid var(--km-border);
  color: var(--km-muted);
  font-size: 13px;
`;

// --- Compact collapsed row (Beneficiary / Payer) ------------------------------------------------------
//
// These change rarely, so by default they're a single clickable summary line - the full form only
// mounts once the admin asks for it, instead of permanently occupying screen space.

const CompactSection = styled.div`
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-bg);
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: ${({ $expanded }) => ($expanded ? '8px' : 0)};
`;

const CompactInfo = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

const CompactLabel = styled.div`
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--km-accent);
`;

const CompactValue = styled.div`
  margin-top: 2px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--km-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CompactChevron = styled.span`
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--km-accent);
`;

// --- Plain, borderless "editable text" fields ------------------------------------------------------
//
// No boxes, no visible borders: a field reads as plain text until you hover/focus it, at which
// point a soft accent wash + underline appear. Every text field auto-grows vertically with its
// content (useAutoResize) instead of clipping or scrolling.

const FieldRow = styled.div`
  display: flex;
  align-items: ${({ $align }) => $align || 'flex-start'};
  gap: 8px;
  padding: 5px 0;

  & + & {
    border-top: 1px solid var(--km-border);
  }
`;

const FieldTag = styled.span`
  flex: 0 0 auto;
  width: 128px;
  padding-top: 6px;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--km-muted);

  @media (max-width: 560px) {
    width: 84px;
  }
`;

// A label-on-top, full-width-value-below layout for long free-text fields (Purpose of the
// payment, Notes, ...) - side-by-side FieldRow/FieldTag squeezes long text into a narrow right
// column and forces the label to wrap too, which reads badly once the value runs past a few words.
const StackedFieldRow = styled.div`
  padding: 5px 0;

  & + & {
    border-top: 1px solid var(--km-border);
  }
`;

// Groups one payer/customer's fields together (name/address, each its own StackedFieldRow) with a
// heavier separator between customers than the light one between fields of the same customer.
// Indented to match the collapsed compact row's own inner padding (CompactSection) above it, so
// the Name/Address text lines up with the summary text instead of sitting flush against the panel
// edge, a step to the left of everything above it.
const CustomerBlock = styled.div`
  padding: 8px 10px 8px 12px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-bg);

  & + & {
    margin-top: 8px;
  }
`;

const StackedFieldHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
`;

// Raw template / resolved preview switch (documentsBuilder's own Template/Data toggle, unified
// here) - lets the admin see the {{invoiceNumber}}/{{invoiceDate}} placeholders exactly as typed,
// or what they currently resolve to, without needing a separate preview field elsewhere.
const ModeToggleGroup = styled.div`
  display: inline-flex;
  border: 1px solid var(--km-border);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
`;

const ModeToggleOption = styled.button`
  border: none;
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-text)')};
  padding: 4px 8px;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;

  & + & {
    border-left: 1px solid var(--km-border);
  }
`;

// The resolved-preview side of the toggle - read-only (the template in Template mode is the only
// place this is edited), styled a step quieter than the editable textarea so it reads as a preview.
const PurposePreview = styled.div`
  width: 100%;
  min-height: 1.4em;
  padding: 4px 2px;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--km-text);
  white-space: pre-wrap;
  word-break: break-word;
`;

// One shared line-height every element of a row (index number, name, price, % sign, EUR chip,
// arrows, trash icon) aligns to - the single-baseline rule of design-tasks §1. Everything below
// that sits on a row either uses this line-height directly or centers itself inside it.
const ROW_LINE_HEIGHT = '20px';

// The one "plain editable text" field style (design-tasks §1): no box, border, background, or
// focus ring - ever, not even while focused - a single line of text tall, auto-growing only as
// its content wraps (useAutoResize). Font, padding, and line-height are normalized here so an
// input, plain text, and "text styled as input" on the same row all share one baseline instead of
// each carrying its own padding. ($bare predates this - every field is bare now; the prop is
// still accepted so call sites don't have to change.)
const plainFieldStyle = css`
  /* flex-basis 0 (not auto): with width 100% below, an auto basis makes the field demand the
     whole row, wrapping the price/arrows/trash onto their own line - the multi-line row bug
     (design-tasks-3 §3). Basis 0 + grow shares the row instead, exactly like PlainSelect. */
  flex: 1 1 0%;
  min-width: 0;
  display: block;
  /* A textarea without an explicit width falls back to its intrinsic cols-based size (~half a
     panel) the moment it renders - which is exactly the "description shrinks on focus" bug when
     a collapsed full-width toggle flips into the editing textarea. Full width in block contexts;
     in a flex row the flex-basis above decides the actual share. */
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--km-text);
  font-family: inherit;
  font-size: ${({ $size }) => $size || '13px'};
  font-weight: ${({ $weight }) => $weight || '600'};
  line-height: ${ROW_LINE_HEIGHT};
  padding: 0 2px;
  margin: 0;
  resize: none;
  overflow: hidden;

  &::placeholder {
    color: var(--km-muted);
    font-weight: 500;
    opacity: 0.8;
  }

  &:hover,
  &:focus {
    outline: none;
    background: transparent;
    box-shadow: none;
  }
`;

const PlainTextBase = styled.textarea`
  ${plainFieldStyle}
`;

const PlainPriceBase = styled.textarea.attrs({ wrap: 'off' })`
  ${plainFieldStyle}
  flex: 0 0 auto;
  width: ${({ $width }) => $width || '92px'};
  text-align: right;
  font-weight: 800;
  color: var(--km-accent);
  white-space: nowrap;
  overflow-x: auto;

  /* Every amount/price input hugs its content (design-tasks-4 §5): ~3 digits wide when short,
     growing fluidly as more digits are typed. field-sizing does the measuring natively; browsers
     without it keep the fixed fallback width above. */
  @supports (field-sizing: content) {
    field-sizing: content;
    width: auto;
    min-width: 3ch;
    max-width: 132px;
  }
`;

const PlainSelect = styled.select`
  /* flex-basis 0 (not auto) and width 100%: a select's intrinsic width is its longest option
     text, which for package names is wider than a phone screen - left as the basis it either
     wraps the whole row or stretches the page container sideways. Basis 0 + grow shares the row
     in flex contexts; width 100% covers block contexts. The browser ellipsizes the selected
     option to whatever width results. */
  flex: 1 1 0%;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  border: none;
  background: transparent;
  color: var(--km-text);
  font-family: inherit;
  font-size: ${({ $size }) => $size || '13px'};
  font-weight: 700;
  line-height: ${ROW_LINE_HEIGHT};
  padding: 0 2px;
  cursor: pointer;
  text-overflow: ellipsis;

  &:hover,
  &:focus {
    outline: none;
    background: transparent;
  }
`;

// Wraps a textarea with useAutoResize so it grows with its content instead of clipping/scrolling.
const AutoTextArea = React.forwardRef(({ as: Component = PlainTextBase, value, ...rest }, forwardedRef) => {
  const localRef = useRef(null);
  const autoResize = useAutoResize(localRef, value);
  return (
    <Component
      ref={node => {
        localRef.current = node;
        autoResize(node);
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      rows={1}
      value={value}
      {...rest}
    />
  );
});
AutoTextArea.displayName = 'AutoTextArea';

// Keeps a locally-editable draft of one field, resynced from the resolved value whenever it
// changes elsewhere - unless the field currently has focus (so an in-progress keystroke never
// gets clobbered by a re-render triggered by an unrelated commit).
const useFieldDraft = externalValue => {
  const [draft, setDraft] = useState(externalValue ?? '');
  const editingRef = useRef(false);
  useEffect(() => {
    if (!editingRef.current) setDraft(externalValue ?? '');
  }, [externalValue]);
  return [draft, setDraft, editingRef];
};

// Batch 12 §1: one numeric "plain editable text" field for a block-spacing value - a lighter
// version of the Documents Builder's Format panel, spacing-between-blocks only. A blank field
// clears the override and falls back to the document's own tuned default (shown as the
// placeholder), it is never coerced to 0.
const SpacingField = ({ label, value, placeholder, onCommit }) => {
  const [draft, setDraft, editingRef] = useFieldDraft(value === undefined || value === null ? '' : String(value));
  return (
    <FieldRow $align="center">
      <FieldTag>{label}</FieldTag>
      <AutoTextArea
        as={PlainPriceBase}
        $width="56px"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        aria-label={label}
        onFocus={() => { editingRef.current = true; }}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          editingRef.current = false;
          const trimmed = draft.trim();
          if (trimmed === '') { onCommit(undefined); return; }
          const parsed = Number(trimmed.replace(',', '.'));
          onCommit(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
    </FieldRow>
  );
};

const formatEuroPreview = formatEuroSmart;

const getFormulaAwarePriceDraft = row => {
  const rawPrice = row?.priceInput || row?.priceLabel || String(roundToCents(row?.price) ?? '');
  const displayPrice = row?.priceInput ? String(roundToCents(row?.price) ?? '') : rawPrice;
  return { rawPrice, displayPrice };
};

// --- Service line item (top-level custom/catalog row, or a row nested inside a package) ------------------------------------------------------

const LineCard = styled.div`
  padding: 4px 0 6px;
  border-top: 1px solid var(--km-border);

  &:first-child {
    border-top: 0;
  }
`;

// nowrap is the single-row guarantee (design-tasks-3 §3): numbering, name, amount, arrows, and
// trash always share one line. The name field is the only flexible element - long names wrap
// vertically inside it instead of pushing the amount/actions onto their own line.
const LineMainRow = styled.div`
  display: flex;
  align-items: flex-start;
  flex-wrap: nowrap;
  gap: 6px;
`;

const RowIndex = styled.span`
  flex: 0 0 auto;
  width: 16px;
  line-height: ${ROW_LINE_HEIGHT};
  font-size: 10.5px;
  font-weight: 700;
  color: var(--km-muted);
  text-align: center;
`;

const RowActions = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  gap: ${({ $dense }) => ($dense ? '0' : '1px')};
`;

const CustomizedTag = styled.span`
  flex: 0 0 auto;
  align-self: flex-start;
  margin-top: 2px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--km-accent);
  background: var(--km-accent-light);
  border-radius: 5px;
  padding: 2px 7px;
  line-height: 12px;
  white-space: nowrap;
`;

const MissingTag = styled(CustomizedTag)`
  color: var(--km-danger);
  background: rgba(179, 82, 63, 0.1);
`;

// A description field is rarely needed (the catalog already carries the full text for most
// rows) - it stays collapsed to a single truncated line until the admin clicks to edit it,
// instead of permanently showing an "Add description..." textarea on every row.
// Same font-size/padding/line-height as the AutoTextArea it flips into on click (plainFieldStyle,
// $size="11.5px") - otherwise the collapsed line sits at a different height/position than the
// textarea that replaces it, and the row visibly jumps sideways/up-down right when you click in.
const DescriptionToggle = styled.button`
  display: block;
  width: 100%;
  max-width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--km-muted);
  font-family: inherit;
  font-size: 11.5px;
  font-style: ${({ $hasValue }) => ($hasValue ? 'normal' : 'italic')};
  line-height: ${ROW_LINE_HEIGHT};
  text-align: left;
  padding: 0 2px;
  margin: 0;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    color: var(--km-accent);
  }
`;

// The unit that follows a percent/amount value ("%", "EUR") - same line-height as everything else
// on the row so it sits on the shared baseline (design-tasks §2).
const UnitSign = styled.span`
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 700;
  line-height: ${ROW_LINE_HEIGHT};
  color: var(--km-muted);
`;

// A "% of package" row is the invoice's scheduled share of the programme fee, so it reads as
// "Scheduled payment" - the same one-style line a normal service item uses (design-tasks §3) -
// unless the package is still choosable, in which case the package selector doubles as the name.
// Its one value field accepts a percent or an absolute euro amount interchangeably (design-tasks
// §1: "25" -> 25%, "10000" -> 10,000 EUR), with the equivalent in the other unit shown as a chip.
const PercentShareRow = ({
  row,
  index,
  isChild,
  catalogPackages,
  lockPackage = false,
  onCommit,
  onRemove,
  removeTitle,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}) => {
  const isAmountMode = row.amount != null;
  const committedValue = String((isAmountMode ? row.amount : row.percent) ?? '');
  const [valueDraft, setValueDraft, valueEditingRef] = useFieldDraft(committedValue);

  return (
    <LineCard>
      <LineMainRow>
        <RowIndex>{index + 1}</RowIndex>
        {lockPackage ? (
          <span
            title="This invoice's package is fixed at the top - see the Package field above"
            style={{
              flex: '1 1 auto', minWidth: 0, padding: '0 2px', fontWeight: 700, fontSize: isChild ? '12.5px' : '13px', lineHeight: ROW_LINE_HEIGHT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            Scheduled payment
          </span>
        ) : (
          <PlainSelect
            $size={isChild ? '12.5px' : '13px'}
            aria-label="Package this share is calculated from"
            value={row.packageId}
            onChange={event => onCommit('packageId', event.target.value)}
          >
            {!catalogPackages.some(pkg => String(pkg.id) === String(row.packageId)) ? (
              <option value={row.packageId}>{`Package ${row.packageId}`}</option>
            ) : null}
            {catalogPackages.map(pkg => (
              <option key={pkg.id} value={pkg.id}>{pkg.hidden ? `${pkg.name} (Special offer)` : pkg.name}</option>
            ))}
          </PlainSelect>
        )}
        <AutoTextArea
          as={PlainPriceBase}
          $size={isChild ? '12.5px' : '13px'}
          $width="52px"
          inputMode="decimal"
          value={valueDraft}
          placeholder="0"
          aria-label="Percent of package price, or an absolute EUR amount"
          onFocus={() => { valueEditingRef.current = true; }}
          onChange={event => setValueDraft(event.target.value)}
          onBlur={() => {
            valueEditingRef.current = false;
            if (valueDraft !== committedValue) onCommit('percent', valueDraft);
          }}
        />
        <UnitSign>{isAmountMode ? 'EUR' : '%'}</UnitSign>
        {isAmountMode ? (
          <CustomizedTag title="Share of the package's price this amount corresponds to">≈ {row.percent}%</CustomizedTag>
        ) : (
          <CustomizedTag title="Recalculated live from the package's price">≈ {formatEuroPreview(row.price)}</CustomizedTag>
        )}
        {row.missing ? <MissingTag title="This catalog package no longer exists">Missing</MissingTag> : null}
        <RowActions $dense={isChild}>
          {onMoveUp ? (
            <IconButton $dense={isChild} type="button" onClick={onMoveUp} disabled={!canMoveUp} title="Move up" aria-label="Move up">
              <FaChevronUp />
            </IconButton>
          ) : null}
          {onMoveDown ? (
            <IconButton $dense={isChild} type="button" onClick={onMoveDown} disabled={!canMoveDown} title="Move down" aria-label="Move down">
              <FaChevronDown />
            </IconButton>
          ) : null}
          <IconDangerButton $dense={isChild} type="button" onClick={onRemove} title={removeTitle} aria-label={removeTitle}>
            <FaTrash />
          </IconDangerButton>
        </RowActions>
      </LineMainRow>
    </LineCard>
  );
};

const ServiceLineRow = ({
  row,
  index,
  isChild = false,
  catalogPackages = [],
  lockPackage = false,
  onCommit,
  onRemove,
  removeTitle = 'Remove',
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onReset,
}) => {
  const [nameDraft, setNameDraft, nameEditingRef] = useFieldDraft(row.name);
  const [descriptionDraft, setDescriptionDraft, descriptionEditingRef] = useFieldDraft(row.description);
  const { rawPrice, displayPrice } = getFormulaAwarePriceDraft(row);
  const [priceDraft, setPriceDraft, priceEditingRef] = useFieldDraft(displayPrice);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  if (row.kind === 'percent') {
    return (
      <PercentShareRow
        row={row}
        index={index}
        isChild={isChild}
        catalogPackages={catalogPackages}
        lockPackage={lockPackage}
        onCommit={onCommit}
        onRemove={onRemove}
        removeTitle={removeTitle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
      />
    );
  }

  return (
    <LineCard>
      <LineMainRow>
        <RowIndex>{index + 1}</RowIndex>
        <AutoTextArea
          $bare
          $size={isChild ? '12.5px' : '13px'}
          $weight="700"
          value={nameDraft}
          placeholder="Service name"
          aria-label="Service name"
          onFocus={() => { nameEditingRef.current = true; }}
          onChange={event => setNameDraft(event.target.value)}
          onBlur={() => {
            nameEditingRef.current = false;
            if (nameDraft !== (row.name ?? '')) onCommit('name', nameDraft);
          }}
        />
        <AutoTextArea
          as={PlainPriceBase}
          $bare
          $size={isChild ? '12.5px' : '13px'}
          $width={isChild ? '56px' : '64px'}
          value={priceDraft}
          placeholder="100"
          aria-label="Price (EUR)"
          onFocus={() => {
            priceEditingRef.current = true;
            setPriceDraft(rawPrice);
          }}
          onChange={event => setPriceDraft(event.target.value)}
          onBlur={() => {
            priceEditingRef.current = false;
            if (priceDraft !== rawPrice) onCommit('price', priceDraft);
            setPriceDraft(priceDraft !== rawPrice ? priceDraft : displayPrice);
          }}
        />
        {row.missing ? <MissingTag title="This catalog reference no longer exists">Missing</MissingTag> : null}
        {onReset ? (
          <IconButton $dense={isChild} type="button" onClick={onReset} title="Revert to the catalog value" aria-label="Revert to catalog value">
            <FaUndoAlt />
          </IconButton>
        ) : null}
        <RowActions $dense={isChild}>
          {onMoveUp ? (
            <IconButton $dense={isChild} type="button" onClick={onMoveUp} disabled={!canMoveUp} title="Move up" aria-label="Move up">
              <FaChevronUp />
            </IconButton>
          ) : null}
          {onMoveDown ? (
            <IconButton $dense={isChild} type="button" onClick={onMoveDown} disabled={!canMoveDown} title="Move down" aria-label="Move down">
              <FaChevronDown />
            </IconButton>
          ) : null}
          <IconDangerButton $dense={isChild} type="button" onClick={onRemove} title={removeTitle} aria-label={removeTitle}>
            <FaTrash />
          </IconDangerButton>
        </RowActions>
      </LineMainRow>
      {descriptionOpen ? (
        <AutoTextArea
          $size="11.5px"
          $weight="500"
          style={{ color: 'var(--km-muted)' }}
          value={descriptionDraft}
          placeholder="Add description…"
          aria-label="Description"
          autoFocus
          onFocus={() => { descriptionEditingRef.current = true; }}
          onChange={event => setDescriptionDraft(event.target.value)}
          onBlur={() => {
            descriptionEditingRef.current = false;
            if (descriptionDraft !== (row.description ?? '')) onCommit('description', descriptionDraft);
            setDescriptionOpen(false);
          }}
        />
      ) : (
        <DescriptionToggle type="button" $hasValue={Boolean(row.description)} onClick={() => setDescriptionOpen(true)}>
          {row.description || '+ Add description'}
        </DescriptionToggle>
      )}
    </LineCard>
  );
};

// --- Package group (a whole budget/packages program, editable/removable per line) ------------------------------------------------------

// Same border/radius/background as every other sub-block on the page (CompactSection,
// CustomerBlock, MilestoneDetails) - one block style, not a differently-tinted card per feature.
const PackageCard = styled.div`
  margin-top: 10px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-bg);
  padding: 8px 10px 10px;

  &:first-child {
    margin-top: 0;
  }
`;

const PackageHeaderRow = styled(LineMainRow)`
  align-items: flex-start;
`;

const PackageIcon = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 7px;
  background: var(--km-card);
  color: var(--km-accent);
  font-size: 11px;
`;

// The package checkbox row (design-tasks-2 §2): the name truncates instead of ever running into
// the switch button at the end of the row, and the checkbox's own hit-area is just the checkbox.
const PackageToggleName = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: ${ROW_LINE_HEIGHT};
`;

// The "switch package from catalog" action, as a real tappable button at the end of the package
// name row (design-tasks-2 §2) - visually a bordered chevron button, functionally still a native
// <select> (stretched invisibly across the button) so the catalog list opens as a normal picker.
const PackageSwitchButton = styled.span`
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 24px;
  border: 1px solid var(--km-border);
  border-radius: 6px;
  background: var(--km-card);
  color: var(--km-accent);
  font-size: 10.5px;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: var(--km-accent);
  }

  select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
`;

const PackageChildren = styled.div`
  margin: 6px 0 4px 28px;
  border-radius: 6px;
  background: var(--km-card);
  padding: 0 8px;

  @media (max-width: 560px) {
    margin-left: 10px;
  }
`;

// $indent lines the add-controls up with a package card's children column; everywhere else they
// sit flush with the panel's own rows.
const PackageAddRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 6px 0 0 ${({ $indent }) => ($indent ? '28px' : 0)};

  @media (max-width: 560px) {
    margin-left: ${({ $indent }) => ($indent ? '10px' : 0)};
  }
`;

// Same plain-text look as every other field (design-tasks §1) - the flex bases are the only
// thing these add.
const PackageQuickField = styled(PlainTextBase)`
  flex: 1 1 140px;
`;

const PackageQuickPrice = styled(PlainPriceBase)`
  flex: 0 0 76px;

  /* The fixed flex-basis above would defeat the content-hugging width (design-tasks-4 §5). */
  @supports (field-sizing: content) {
    flex: 0 0 auto;
  }
`;

const InlinePickerBox = styled.div`
  margin: 6px 0 0 ${({ $indent }) => ($indent ? '28px' : 0)};

  @media (max-width: 560px) {
    margin-left: ${({ $indent }) => ($indent ? '10px' : 0)};
  }
`;

const CatalogSearchField = styled(PlainTextBase)`
  background: var(--km-card);
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
`;

const CatalogPickerList = styled.div`
  max-height: 190px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
`;

const CatalogPickerButton = styled.button`
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 8px;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }
`;

// The catalog price shown next to each service in the picker (design-tasks-7 §6) - the same
// accent/weight the row's own price field uses once the service is added, so the admin can pick
// the right service at a glance without adding it first.
const PickerPriceTag = styled.span`
  flex: 0 0 auto;
  align-self: center;
  font-weight: 800;
  color: var(--km-accent);
  white-space: nowrap;
`;

// A package hidden from the public Program Budget PDF (a manually-offered "special offer") is
// still pickable here - this badge is the only thing telling the admin it's not one of the
// public programs.
const SpecialOfferBadge = styled.span`
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  border-radius: 5px;
  background: var(--km-accent-light);
  color: var(--km-accent);
  padding: 2px 7px;
  margin-left: 6px;
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
`;

const CatalogTabs = styled.div`
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: var(--km-bg);
  border: 1px solid var(--km-border);
`;

const CatalogTabButton = styled.button`
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#fff' : 'var(--km-muted)')};
  background: ${({ $active }) => ($active ? 'linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%)' : 'transparent')};
`;

// The one "add a line" control cluster (design-tasks-2 §7), rendered identically wherever lines
// can be added - a package's children, an Expected Expenses milestone, and Other Expenses:
// name + price + Add on the first row, "+ From catalog" (and any caller-specific extras, e.g.
// "+ % From package") below, with the inline catalog picker underneath when open. When
// `catalogPackages`/`onAddCatalogPackagePercent` are provided the picker also offers the
// "% of package" tab (Other Expenses).
const CustomLineAdder = ({
  catalogItems,
  excludeCatalogIds,
  onAddCustom,
  onAddCatalogItem,
  catalogPackages = null,
  onAddCatalogPackagePercent,
  extraButtons = null,
  indent = false,
  addOnBlur = false,
  priceContext = null,
}) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [pickerTab, setPickerTab] = useState('items');

  // Never capped: the picker must offer the complete backend catalog (design-tasks-7 §7) - the
  // list box scrolls, and the search field is the tool for narrowing it down, so truncating here
  // silently hides real services.
  const availableItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalogItems
      .filter(item => !excludeCatalogIds.has(String(item.id)))
      .filter(item => !normalizedQuery || String(item.name || '').toLowerCase().includes(normalizedQuery));
  }, [catalogItems, excludeCatalogIds, query]);

  // "from"-priced catalog services keep their prefix so the picker never presents a minimum as
  // the fixed price. No resolvable amount (formula waiting on NBU rates) shows nothing rather
  // than a misleading €0.
  const itemPriceLabel = item => {
    if (!priceContext) return '';
    const amount = getItemDisplayAmount(item, priceContext);
    if (amount == null) return '';
    return `${isFromPricedItem(item) ? 'from ' : ''}${formatEuroPreview(amount)}`;
  };

  const availablePackages = useMemo(() => {
    if (!catalogPackages) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return catalogPackages.filter(pkg => !normalizedQuery || String(pkg.name || '').toLowerCase().includes(normalizedQuery));
  }, [catalogPackages, query]);

  const handleAddCustom = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Enter a name for the new service.');
      return;
    }
    onAddCustom({ name: trimmedName, ...parseCustomPriceInput(price) });
    setName('');
    setPrice('');
  };

  const closePicker = () => {
    setShowPicker(false);
    setQuery('');
  };

  return (
    <>
      <div
        onBlur={addOnBlur ? event => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          if (name.trim()) handleAddCustom();
        } : undefined}
      >
        <PackageAddRow $indent={indent}>
          <PackageQuickField
            rows={1}
            placeholder="Add a custom line…"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <PackageQuickPrice
            rows={1}
            placeholder="100"
            aria-label="New custom line price"
            value={price}
            onChange={event => setPrice(event.target.value)}
          />
          <SmallButton type="button" onClick={handleAddCustom}><FaPlus /> Add</SmallButton>
        </PackageAddRow>
        <PackageAddRow $indent={indent}>
          <SmallButton type="button" onClick={() => (showPicker ? closePicker() : setShowPicker(true))}>
            <FaPlus /> From catalog
          </SmallButton>
          {extraButtons}
        </PackageAddRow>
      </div>
      {showPicker ? (
        <InlinePickerBox $indent={indent}>
          {catalogPackages ? (
            <CatalogTabs>
              <CatalogTabButton type="button" $active={pickerTab === 'items'} onClick={() => setPickerTab('items')}>
                Services
              </CatalogTabButton>
              <CatalogTabButton type="button" $active={pickerTab === 'packages'} onClick={() => setPickerTab('packages')}>
                % of package
              </CatalogTabButton>
            </CatalogTabs>
          ) : null}
          <CatalogSearchField
            rows={1}
            placeholder={pickerTab === 'packages' ? 'Search catalog packages…' : 'Search catalog services…'}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <CatalogPickerList>
            {pickerTab === 'packages' ? (
              <>
                {availablePackages.map(pkg => (
                  <CatalogPickerButton
                    key={pkg.id}
                    type="button"
                    onClick={() => { onAddCatalogPackagePercent(pkg); closePicker(); }}
                    title="Bill only a share of this package's price (e.g. one Payment Schedule milestone) - the whole package itself is chosen in the Package panel above"
                  >
                    <span><FaLayerGroup style={{ marginRight: 6 }} />{pkg.name}{pkg.hidden ? <SpecialOfferBadge>Special offer</SpecialOfferBadge> : null}</span>
                  </CatalogPickerButton>
                ))}
                {!availablePackages.length ? <PanelNote style={{ margin: 0 }}>No matching catalog packages.</PanelNote> : null}
              </>
            ) : (
              <>
                {availableItems.map(item => {
                  const priceLabel = itemPriceLabel(item);
                  return (
                    <CatalogPickerButton key={item.id} type="button" onClick={() => { onAddCatalogItem(item.id); closePicker(); }}>
                      <span>{item.name}</span>
                      {priceLabel ? <PickerPriceTag>{priceLabel}</PickerPriceTag> : null}
                    </CatalogPickerButton>
                  );
                })}
                {!availableItems.length ? <PanelNote style={{ margin: 0 }}>No matching catalog services.</PanelNote> : null}
              </>
            )}
          </CatalogPickerList>
        </InlinePickerBox>
      ) : null}
    </>
  );
};

const PackageEntryCard = ({
  row,
  catalogItems,
  onCommitField,
  onRemove,
  onReset,
  onCommitChildField,
  onResetChildField,
  onRemoveChild,
  onMoveChild,
  onAddCustomChild,
  onAddCatalogChild,
}) => {
  const [nameDraft, setNameDraft, nameEditingRef] = useFieldDraft(row.name);
  const [descriptionDraft, setDescriptionDraft, descriptionEditingRef] = useFieldDraft(row.description);
  const { rawPrice, displayPrice } = getFormulaAwarePriceDraft(row);
  const [priceDraft, setPriceDraft, priceEditingRef] = useFieldDraft(displayPrice);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const childCatalogIds = useMemo(
    () => new Set(row.children.filter(child => child.kind === 'item').map(child => String(child.catalogId))),
    [row.children],
  );

  return (
    <PackageCard>
      <PackageHeaderRow>
        <PackageIcon><FaBoxOpen /></PackageIcon>
        {/* Same size/weight as a normal service line's name (design-tasks §2): the package name
            must never render differently here than a line item does in Invoice Services. */}
        <AutoTextArea
          $weight="700"
          value={nameDraft}
          placeholder="Package name"
          aria-label="Package name"
          onFocus={() => { nameEditingRef.current = true; }}
          onChange={event => setNameDraft(event.target.value)}
          onBlur={() => {
            nameEditingRef.current = false;
            if (nameDraft !== (row.name ?? '')) onCommitField('name', nameDraft);
          }}
        />
        <AutoTextArea
          as={PlainPriceBase}
          $width="64px"
          inputMode="decimal"
          value={priceDraft}
          placeholder="0"
          aria-label="Package price (EUR)"
          onFocus={() => {
            priceEditingRef.current = true;
            setPriceDraft(rawPrice);
          }}
          onChange={event => setPriceDraft(event.target.value)}
          onBlur={() => {
            priceEditingRef.current = false;
            if (priceDraft !== rawPrice) onCommitField('price', priceDraft);
            setPriceDraft(priceDraft !== rawPrice ? priceDraft : displayPrice);
          }}
        />
        {row.hasPriceOverride ? (
          <CustomizedTag title="Real total of the services below">Σ {formatEuroPreview(row.childrenTotal)}</CustomizedTag>
        ) : null}
        {row.isCustomized ? (
          <CustomizedTag title={row.catalogId ? 'No longer matches the shared budget package' : 'Not in the Budget catalog - saved entirely on this invoice'}>
            Custom package
          </CustomizedTag>
        ) : null}
        {onReset ? (
          <IconButton $dense type="button" onClick={onReset} title="Revert to the catalog package" aria-label="Revert to catalog package">
            <FaUndoAlt />
          </IconButton>
        ) : null}
        <RowActions $dense>
          <IconDangerButton $dense type="button" onClick={onRemove} title="Remove package" aria-label="Remove package">
            <FaTrash />
          </IconDangerButton>
        </RowActions>
      </PackageHeaderRow>
      {descriptionOpen ? (
        <AutoTextArea
          $size="11.5px"
          $weight="500"
          style={{ color: 'var(--km-muted)', marginLeft: 28, width: 'calc(100% - 28px)' }}
          value={descriptionDraft}
          placeholder="Add description…"
          aria-label="Package description"
          autoFocus
          onFocus={() => { descriptionEditingRef.current = true; }}
          onChange={event => setDescriptionDraft(event.target.value)}
          onBlur={() => {
            descriptionEditingRef.current = false;
            if (descriptionDraft !== (row.description ?? '')) onCommitField('description', descriptionDraft);
            setDescriptionOpen(false);
          }}
        />
      ) : (
        <DescriptionToggle
          type="button"
          $hasValue={Boolean(row.description)}
          style={{ marginLeft: 28, width: 'calc(100% - 28px)' }}
          onClick={() => setDescriptionOpen(true)}
        >
          {row.description || '+ Add description'}
        </DescriptionToggle>
      )}

      <PackageChildren>
        {row.children.map((child, childIndex) => (
          <ServiceLineRow
            key={child.key}
            row={child}
            index={childIndex}
            isChild
            removeTitle="Remove from package"
            onCommit={(field, value) => onCommitChildField(child.id, field, value)}
            onRemove={() => onRemoveChild(child.id)}
            onMoveUp={() => onMoveChild(child.id, -1)}
            onMoveDown={() => onMoveChild(child.id, 1)}
            canMoveUp={childIndex > 0}
            canMoveDown={childIndex < row.children.length - 1}
            onReset={child.kind === 'item' && child.isCustomized ? () => onResetChildField(child.id) : undefined}
          />
        ))}
        {!row.children.length ? <PanelNote style={{ margin: '8px 0' }}>No services in this package.</PanelNote> : null}
      </PackageChildren>

      <CustomLineAdder
        indent
        catalogItems={catalogItems}
        excludeCatalogIds={childCatalogIds}
        onAddCustom={onAddCustomChild}
        onAddCatalogItem={onAddCatalogChild}
      />
    </PackageCard>
  );
};

// --- Package payment schedule (round7 spec C.2) ------------------------------------------------------
//
// One editable {title, amount} row of the package's Payment Schedule, shown/edited only while the
// "Payment schedule" checkbox is on (InvoiceBuilderPage) - the same draft/commit-on-blur pattern
// every other row in this file uses.

const ScheduleRow = ({ row, index, onCommit, onRemove }) => {
  const [titleDraft, setTitleDraft, titleEditingRef] = useFieldDraft(row.title);
  // row.amount == null means "not yet resolved" (e.g. a formula price waiting on NBU rates) -
  // roundToCents(null) coerces to 0, so the null check must happen before calling it, not after.
  const [amountDraft, setAmountDraft, amountEditingRef] = useFieldDraft(row.amount != null ? String(roundToCents(row.amount)) : '');

  return (
    <LineCard>
      <LineMainRow>
        <RowIndex>{index + 1}</RowIndex>
        <AutoTextArea
          value={titleDraft}
          placeholder="Payment title"
          aria-label="Payment title"
          onFocus={() => { titleEditingRef.current = true; }}
          onChange={event => setTitleDraft(event.target.value)}
          onBlur={() => {
            titleEditingRef.current = false;
            if (titleDraft !== (row.title ?? '')) onCommit(index, 'title', titleDraft);
          }}
        />
        <AutoTextArea
          as={PlainPriceBase}
          $width="88px"
          inputMode="decimal"
          value={amountDraft}
          placeholder="0"
          aria-label="Payment amount (EUR)"
          onFocus={() => { amountEditingRef.current = true; }}
          onChange={event => setAmountDraft(event.target.value)}
          onBlur={() => {
            amountEditingRef.current = false;
            const original = row.amount != null ? String(roundToCents(row.amount)) : '';
            if (amountDraft !== original) onCommit(index, 'amount', amountDraft);
          }}
        />
        <IconDangerButton type="button" onClick={() => onRemove(index)} title="Remove payment" aria-label="Remove payment">
          <FaTrash />
        </IconDangerButton>
      </LineMainRow>
    </LineCard>
  );
};

// --- Expected expenses milestone (one payment-schedule entry -> one future invoice) ------------------------------------------------------
//
// Rendered as a native <details>/<summary> so it's collapsed by default and keeps its own
// open/closed state across re-renders without React needing to track it: the summary shows only
// the number, title, item count and Amount Due (spec 2.2) - the editable title/tax/items only
// mount inside the body, once expanded.

const MilestoneDetails = styled.details`
  margin-top: 10px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-bg);
  overflow: hidden;

  &:first-of-type {
    margin-top: 0;
  }

  &[open] {
    border-color: var(--km-accent);
  }
`;

const MilestoneSummary = styled.summary`
  list-style: none;
  cursor: pointer;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  &::-webkit-details-marker {
    display: none;
  }
`;

const MilestoneSummaryLeft = styled.div`
  display: flex;
  align-items: baseline;
  gap: 9px;
  min-width: 0;
`;

const MilestoneNum = styled.span`
  flex: 0 0 auto;
  font-family: var(--km-font-display);
  font-size: 12.5px;
  color: var(--km-accent);
`;

const MilestoneTitleText = styled.span`
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MilestoneCount = styled.span`
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--km-muted);
`;

const MilestoneSummaryRight = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const MilestoneDue = styled.span`
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const MilestoneChevron = styled.span`
  color: var(--km-accent);
  font-size: 11px;
  transition: transform 0.15s ease;

  ${MilestoneDetails}[open] & {
    transform: rotate(90deg);
  }
`;

const MilestoneBody = styled.div`
  padding: 0 12px 10px;
  border-top: 1px solid var(--km-border);
`;

const MilestoneCheckboxRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 8px;
`;

const MilestoneCard = ({
  index,
  milestone,
  serviceRows,
  subtotal,
  amountDue,
  catalogItems,
  catalogPackages,
  onCommitField,
  onCommitServiceField,
  onRemoveService,
  onResetService,
  onAddCustomService,
  onAddCatalogService,
}) => {
  const [taxDraft, setTaxDraft, taxEditingRef] = useFieldDraft(String(milestone.taxPercent ?? ''));

  const usedCatalogIds = useMemo(
    () => new Set(serviceRows.filter(row => row.kind === 'item').map(row => String(row.catalogId))),
    [serviceRows],
  );

  return (
    <MilestoneDetails>
      <MilestoneSummary>
        <MilestoneSummaryLeft>
          <MilestoneNum>{String(index + 1).padStart(2, '0')}</MilestoneNum>
          <MilestoneTitleText title={milestone.title}>{milestone.title || 'Untitled milestone'}</MilestoneTitleText>
          <MilestoneCount>{serviceRows.length} item{serviceRows.length === 1 ? '' : 's'}</MilestoneCount>
        </MilestoneSummaryLeft>
        <MilestoneSummaryRight>
          <MilestoneDue>{formatEuroPreview(amountDue)}</MilestoneDue>
          <MilestoneChevron>›</MilestoneChevron>
        </MilestoneSummaryRight>
      </MilestoneSummary>

      <MilestoneBody>
        <FieldRow $align="center">
          <FieldTag>Tax (%)</FieldTag>
          <AutoTextArea
            as={PlainPriceBase}
            $width="48px"
            inputMode="decimal"
            value={taxDraft}
            placeholder="0"
            aria-label="Tax percent"
            onFocus={() => { taxEditingRef.current = true; }}
            onChange={event => setTaxDraft(event.target.value)}
            onBlur={() => { taxEditingRef.current = false; onCommitField('taxPercent', taxDraft); }}
          />
        </FieldRow>
        <MilestoneCheckboxRow>
          <CustomizedTag title="Sum of this milestone's rows">Subtotal: {formatEuroPreview(subtotal)}</CustomizedTag>
          <CustomizedTag title="Subtotal + tax">Due: {formatEuroPreview(amountDue)}</CustomizedTag>
        </MilestoneCheckboxRow>

        <PackageChildren>
          {serviceRows.map((row, rowIndex) => (
            <ServiceLineRow
              key={row.key}
              row={row}
              index={rowIndex}
              isChild
              lockPackage
              catalogPackages={catalogPackages}
              onCommit={(field, value) => onCommitServiceField(row.id, field, value)}
              onRemove={() => onRemoveService(row.id)}
              onReset={row.kind === 'item' && row.isCustomized ? () => onResetService(row.id) : undefined}
            />
          ))}
          {!serviceRows.length ? <PanelNote style={{ margin: '8px 0' }}>No services on this milestone yet.</PanelNote> : null}
        </PackageChildren>

        <CustomLineAdder
          indent
          catalogItems={catalogItems}
          excludeCatalogIds={usedCatalogIds}
          onAddCustom={onAddCustomService}
          onAddCatalogItem={onAddCatalogService}
        />
      </MilestoneBody>
    </MilestoneDetails>
  );
};

// --- Issued invoices (design-tasks-3 §7) ------------------------------------------------------
//
// One previously-generated invoice, rendered read-only in the same collapsed-details style as an
// Expected Expenses milestone: date, number, and amount on the summary line; the frozen service
// rows and totals inside. The only editable parts are the admin's own payment-received tracking
// (plain-text fields, same style as every other input) and the Reissue action.

const ReadOnlyRowName = styled.span`
  flex: 1 1 0%;
  min-width: 0;
  padding: 0 2px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: ${ROW_LINE_HEIGHT};
`;

const ReadOnlyRowPrice = styled.span`
  flex: 0 0 auto;
  padding: 0 2px;
  font-size: 12.5px;
  font-weight: 800;
  line-height: ${ROW_LINE_HEIGHT};
  color: var(--km-accent);
  white-space: nowrap;
`;

const ISSUED_INVOICE_CURRENCIES = ['EUR', 'USD', 'UAH', 'GBP'];

// Header-amount color by payment status (design-tasks-4 §4): green once fully received,
// yellow while only part of the amount has landed.
const PAYMENT_STATUS_COLORS = {
  full: '#3E7C4F',
  partial: '#C08A2D',
};

const IssuedInvoiceCard = ({ record, exchangeRates, onCommitPayment, onReissue, onDelete }) => {
  const [receivedDraft, setReceivedDraft, receivedEditingRef] = useFieldDraft(record.payment.receivedOn);
  const [amountDraft, setAmountDraft, amountEditingRef] = useFieldDraft(record.payment.amount);

  // One package header line above the payment lines, never a numbered/priced row of its own
  // (design-tasks-4 §3) - and legacy records that accumulated duplicate package rows collapse
  // to that single header. The scheduled "% of package" line reads as "Scheduled payment".
  const packageHeaderRow = record.rows.find(row => row.kind === 'package') || null;
  const lineRows = record.rows.filter(row => row.kind !== 'package');

  // A non-EUR receipt shows its EUR equivalent at the NBU rate for the day it landed
  // (design-tasks-4 §6), falling back to the invoice-date rates already loaded by the page while
  // the received-on date is missing/unparseable or its archive lookup fails.
  const paymentCurrency = record.payment.currency || 'EUR';
  const receivedAmountNumber = Number(String(record.payment.amount ?? '').replace(',', '.'));
  const needsEurConversion = paymentCurrency !== 'EUR' && Number.isFinite(receivedAmountNumber) && receivedAmountNumber > 0;
  const receivedOnYmd = parseReceivedOnYmd(record.payment.receivedOn);
  const [receivedDateRates, setReceivedDateRates] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setReceivedDateRates(null);
    if (!needsEurConversion || !receivedOnYmd) return undefined;
    fetchNbuUahExchangeRatesByDate(receivedOnYmd)
      .then(rates => { if (!cancelled && rates) setReceivedDateRates(rates); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [needsEurConversion, receivedOnYmd]);
  const conversionRates = receivedDateRates || exchangeRates;
  const receivedEurAmount = needsEurConversion
    ? convertAmountToEur(receivedAmountNumber, paymentCurrency, conversionRates)
    : null;
  const paymentStatus = resolveIssuedInvoicePaymentStatus(record, conversionRates);

  return (
    <MilestoneDetails>
      <MilestoneSummary>
        <MilestoneSummaryLeft>
          <MilestoneNum>{record.invoiceDate}</MilestoneNum>
          <MilestoneTitleText title={`Invoice No. ${record.invoiceNumber}`}>{`Invoice No. ${record.invoiceNumber}`}</MilestoneTitleText>
          <MilestoneCount>{lineRows.length} item{lineRows.length === 1 ? '' : 's'}</MilestoneCount>
        </MilestoneSummaryLeft>
        <MilestoneSummaryRight>
          <MilestoneDue style={PAYMENT_STATUS_COLORS[paymentStatus] ? { color: PAYMENT_STATUS_COLORS[paymentStatus] } : undefined}>
            {formatEuroPreview(record.amountDue)}
          </MilestoneDue>
          <MilestoneChevron>›</MilestoneChevron>
        </MilestoneSummaryRight>
      </MilestoneSummary>

      <MilestoneBody>
        <PackageChildren>
          {packageHeaderRow ? (
            <LineCard>
              <LineMainRow>
                <ReadOnlyRowName style={{ fontWeight: 800 }} title="Programme package">{packageHeaderRow.name}</ReadOnlyRowName>
              </LineMainRow>
            </LineCard>
          ) : null}
          {lineRows.map((row, index) => (
            <LineCard key={`${record.id}-row-${index}`}>
              <LineMainRow>
                <RowIndex>{index + 1}</RowIndex>
                <ReadOnlyRowName>{row.kind === 'percent' ? 'Scheduled payment' : row.name}</ReadOnlyRowName>
                <ReadOnlyRowPrice>{row.priceLabel || formatEuroPreview(row.price)}</ReadOnlyRowPrice>
              </LineMainRow>
            </LineCard>
          ))}
          {!lineRows.length && !packageHeaderRow ? <PanelNote style={{ margin: '8px 0' }}>No services recorded.</PanelNote> : null}
        </PackageChildren>
        <MilestoneCheckboxRow>
          <CustomizedTag title="Tax rate billed on this invoice">Tax: {record.taxPercent}%</CustomizedTag>
          <CustomizedTag title="Final amount including taxes">Due: {formatEuroPreview(record.amountDue)}</CustomizedTag>
        </MilestoneCheckboxRow>

        <FieldRow $align="center">
          <FieldTag>Payment received</FieldTag>
          <AutoTextArea
            $size="12.5px"
            value={receivedDraft}
            placeholder={formatInvoicePurposeDate(new Date())}
            aria-label="Payment received on"
            onFocus={() => { receivedEditingRef.current = true; }}
            onChange={event => setReceivedDraft(event.target.value)}
            onBlur={() => {
              receivedEditingRef.current = false;
              if (receivedDraft !== (record.payment.receivedOn ?? '')) onCommitPayment('receivedOn', receivedDraft);
            }}
          />
          <AutoTextArea
            as={PlainPriceBase}
            $size="12.5px"
            $width="72px"
            inputMode="decimal"
            value={amountDraft}
            placeholder="0"
            aria-label="Amount received"
            onFocus={() => { amountEditingRef.current = true; }}
            onChange={event => setAmountDraft(event.target.value)}
            onBlur={() => {
              amountEditingRef.current = false;
              if (amountDraft !== (record.payment.amount ?? '')) onCommitPayment('amount', amountDraft);
            }}
          />
          <PlainSelect
            style={{ flex: '0 0 auto', width: 'auto' }}
            aria-label="Currency of the received amount"
            value={record.payment.currency || 'EUR'}
            onChange={event => onCommitPayment('currency', event.target.value)}
          >
            {ISSUED_INVOICE_CURRENCIES.map(currency => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </PlainSelect>
        </FieldRow>
        {needsEurConversion ? (
          <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--km-muted)', padding: '0 2px' }}>
            {receivedEurAmount != null
              ? `≈ ${formatEuroPreview(receivedEurAmount)} at the NBU rate`
              : 'NBU rate unavailable for this currency/date'}
          </div>
        ) : null}

        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <SmallButton
            type="button"
            onClick={onReissue}
            title="Move this invoice's contents back into the editor; the editor's current content drops into Recent"
          >
            <FaSyncAlt /> Reissue invoice
          </SmallButton>
          <DangerButton
            type="button"
            onClick={onDelete}
            title="Delete this invoice from Issued Invoices"
          >
            <FaTrash /> Delete
          </DangerButton>
        </div>
      </MilestoneBody>
    </MilestoneDetails>
  );
};

// --- Summary ------------------------------------------------------

const SummaryGrid = styled.div`
  display: grid;
  gap: 4px;
  font-size: 12.5px;
`;

const SummaryLine = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 0;

  &:last-child {
    border-top: 1px solid var(--km-border);
    margin-top: 3px;
    padding-top: 6px;
    font-weight: 900;
    color: var(--km-accent);
  }
`;

// Shared "recent list" chip shape (round4 #6): one click-to-apply button plus one small delete
// button, used identically for recent services/packages, recent payment schedules, and recent tax
// rates - the same save/display/delete pattern rendered three times instead of three UIs.
const ChipContainer = styled.div`
  display: inline-flex;
  align-items: stretch;
  gap: 1px;
  border: 1px dashed var(--km-border);
  background: var(--km-bg);
  /* Same soft corner as every other block on the page (design-tasks-3 §4) - the old pill shape
     (999px) rounded so far in that multi-line chip text ran past the oval's edges. */
  border-radius: 8px;
  padding: 2px 3px 2px 8px;

  &:hover {
    border-color: var(--km-accent);
  }
`;

const ChipButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: none;
  background: transparent;
  color: var(--km-text);
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  padding: 4px 0;
  cursor: pointer;

  &:hover {
    color: var(--km-accent);
  }
`;

// Small-print composition line under a package chip's name (round4 #3.1) - e.g. the services
// included in a saved custom package, so the admin can tell packages apart without expanding one.
const ChipComposition = styled.span`
  font-size: 9px;
  font-weight: 500;
  color: var(--km-muted);
  margin-top: 1px;
  /* Two lines at most - the full composition can run to a whole paragraph for a big package,
     which turned each chip into a text block instead of a compact quick-pick. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ChipDeleteButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--km-muted);
  font-size: 8.5px;
  cursor: pointer;

  &:hover {
    background: var(--km-danger-border);
    color: var(--km-danger);
  }
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
`;

const InvoiceBuilderPage = ({ isAdmin = false }) => {
  const isInvoiceAdmin = Boolean(isAdmin) || isInvoiceBuilderUid(auth.currentUser?.uid) || (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('admin') === '1');

  const [data, setData] = useState(() => normalizeInvoiceData(null));
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogPackages, setCatalogPackages] = useState([]);
  const [catalogTechnical, setCatalogTechnical] = useState({});
  const [expectedExpenses, setExpectedExpenses] = useState(null);
  const [exchangeRates, setExchangeRates] = useState(null);
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingExpectedExpenses, setIsGeneratingExpectedExpenses] = useState(false);
  const [generatePaymentDetails, setGeneratePaymentDetails] = useState(true);
  const [invoiceDateInput, setInvoiceDateInput] = useState(getTodayYmd());
  // Optional invoice due date (design-tasks-8 §7). Empty (the default) renders the invoice's
  // "Payable upon receipt" line instead of a concrete date - same session-local lifecycle as
  // invoiceDateInput above.
  const [dueDateInput, setDueDateInput] = useState('');
  const [newCustomPackageName, setNewCustomPackageName] = useState('');
  const [showExpectedExpensesPicker, setShowExpectedExpensesPicker] = useState(false);
  const [showCustomSchedulePicker, setShowCustomSchedulePicker] = useState(false);
  const [customPlanPackageName, setCustomPlanPackageName] = useState('');
  const [customPlanPackagePrice, setCustomPlanPackagePrice] = useState('');
  const [customScheduleRows, setCustomScheduleRows] = useState([{ title: '', amount: '' }]);
  const [beneficiaryExpanded, setBeneficiaryExpanded] = useState(false);
  // Raw template vs resolved-preview switch for the beneficiary's payment purpose (documentsBuilder's
  // Template/Data toggle, unified here) - 'template' edits the raw {{invoiceNumber}}/{{invoiceDate}}
  // text, 'data' previews what it currently resolves to.
  const [paymentPurposeViewMode, setPaymentPurposeViewMode] = useState('template');
  const [payerExpanded, setPayerExpanded] = useState(false);
  const [issuedInvoicesOpen, setIssuedInvoicesOpen] = useState(false);
  // Batch 12 §1: a lighter version of the Documents Builder's Format panel - spacing between
  // document blocks only, nothing else (fonts/margins stay fixed). Session-local, not persisted:
  // an unset field falls back to the document's own tuned default (see InvoicePdfDocument /
  // ExpectedExpensesPdfDocument), so leaving this panel untouched never changes existing output.
  const [invoiceSpacing, setInvoiceSpacing] = useState({});
  const [invoiceSpacingExpanded, setInvoiceSpacingExpanded] = useState(false);
  const [expectedExpensesSpacing, setExpectedExpensesSpacing] = useState({});
  const [expectedExpensesSpacingExpanded, setExpectedExpensesSpacingExpanded] = useState(false);
  // round7 spec D: Expected Expenses is a standalone section of the Builder, not a step inside the
  // regular invoice-creation flow - a top-level tab keeps the two entirely separate on screen.
  const [activeTab, setActiveTab] = useState('invoice');
  const fileInputRef = useRef(null);
  const expectedExpensesFileInputRef = useRef(null);

  const loadInvoiceData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invoiceSnapshot, itemsSnapshot, packagesSnapshot, technicalSnapshot, expectedExpensesSnapshot] = await Promise.all([
        get(ref(database, INVOICE_DATA_PATH)),
        get(ref(database, CATALOG_ITEMS_PATH)),
        get(ref(database, CATALOG_PACKAGES_PATH)),
        get(ref(database, CATALOG_TECHNICAL_PATH)),
        get(ref(database, EXPECTED_EXPENSES_PATH)),
      ]);
      setData(normalizeInvoiceData(invoiceSnapshot.exists() ? invoiceSnapshot.val() : null));
      setCatalogItems(toArray(itemsSnapshot.exists() ? itemsSnapshot.val() : []));
      setCatalogPackages(toArray(packagesSnapshot.exists() ? packagesSnapshot.val() : []));
      const technicalValue = technicalSnapshot.exists() ? technicalSnapshot.val() : {};
      setCatalogTechnical(technicalValue);
      // Agency identity (wordmark/footer of every generated PDF) is backend data, shared with the
      // other documents through pdfTheme's config store.
      setPdfAgencyConfig(technicalValue?.agency);
      setExpectedExpenses(normalizeExpectedExpensesData(expectedExpensesSnapshot.exists() ? expectedExpensesSnapshot.val() : null));
    } catch (loadError) {
      console.error('Unable to load invoice builder data', loadError);
      setError('Invoice data is not available right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoiceData();
  }, [loadInvoiceData]);

  // Warm the lazy PDF chunks the moment the page opens. Each deployment deletes the previous
  // build's hashed chunk files, so a tab opened before a deploy can no longer fetch them at
  // "Generate PDF" time ("Loading chunk NNN failed") - fetching them up front, while this page's
  // own build is still live, keeps generation working for the whole session. Failures are
  // ignored: generation itself retries and reports properly.
  useEffect(() => {
    import('@react-pdf/renderer').catch(() => {});
    import('./InvoicePdfDocument').catch(() => {});
    import('./PaymentDetailsPdfDocument').catch(() => {});
    import('./ExpectedExpensesPdfDocument').catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ratesDate = invoiceDateInput || getTodayYmd();
    setExchangeRatesLoading(true);
    setExchangeRatesError('');
    setExchangeRates(null);
    fetchNbuUahExchangeRatesByDate(ratesDate)
      .then(rates => {
        if (cancelled) return;
        if (rates) {
          setExchangeRates(rates);
        } else {
          setExchangeRatesError(`NBU exchange rates are not available for ${ratesDate}.`);
        }
      })
      .catch(ratesError => {
        if (cancelled) return;
        console.error(`Unable to load NBU exchange rates for invoice catalog formulas on ${ratesDate}`, ratesError);
        setExchangeRatesError(`NBU exchange rates are not available for ${ratesDate}.`);
      })
      .finally(() => {
        if (!cancelled) setExchangeRatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceDateInput]);

  const catalogItemsById = useMemo(() => new Map(catalogItems.map(item => [String(item.id), item])), [catalogItems]);
  const catalogPackagesById = useMemo(() => new Map(catalogPackages.map(pkg => [String(pkg.id), pkg])), [catalogPackages]);

  const activeBeneficiary = useMemo(() => getActiveBeneficiary(data), [data]);

  // A 'percent' row's price formula lives on the *package* it shares (pkg.listedPrice), not on the
  // row itself - same pending/error treatment as a formula-priced catalog item, otherwise a package
  // invoice or expected-expenses plan can be generated with every package-share row silently priced
  // at 0 while the NBU rates are still loading.
  const entryReferencesFormulaItem = useCallback(entry => {
    if (!entry) return false;
    if (entry.kind === 'package') return (entry.children || []).some(entryReferencesFormulaItem);
    if (entry.kind === 'percent') {
      const pkg = catalogPackagesById.get(String(entry.packageId));
      return parseBudgetPriceValue(pkg?.listedPrice).isFormula;
    }
    if (entry.kind !== 'item') return false;
    const item = catalogItemsById.get(String(entry.catalogId));
    return parseBudgetPriceValue(item?.price).isFormula;
  }, [catalogItemsById, catalogPackagesById]);

  const hasFormulaInvoiceService = useMemo(
    () => data.invoiceServices.some(entryReferencesFormulaItem),
    [data.invoiceServices, entryReferencesFormulaItem],
  );

  const isFormulaRatePending = hasFormulaInvoiceService && exchangeRatesLoading;
  const formulaRateError = hasFormulaInvoiceService ? exchangeRatesError : '';
  const isGenerateDisabled = loading || Boolean(error) || isGenerating || isFormulaRatePending || Boolean(formulaRateError);

  const hasFormulaExpectedExpensesService = useMemo(
    () => (expectedExpenses?.milestones || []).some(milestone => (milestone.services || []).some(entryReferencesFormulaItem)),
    [expectedExpenses, entryReferencesFormulaItem],
  );
  const isExpectedExpensesFormulaRatePending = hasFormulaExpectedExpensesService && exchangeRatesLoading;
  const expectedExpensesFormulaRateError = hasFormulaExpectedExpensesService ? exchangeRatesError : '';
  const isExpectedExpensesGenerateDisabled = isGeneratingExpectedExpenses
    || isExpectedExpensesFormulaRatePending
    || Boolean(expectedExpensesFormulaRateError);

  const priceContext = useMemo(
    () => ({
      itemsById: catalogItemsById,
      rates: exchangeRates,
      packagesById: catalogPackagesById,
      // Read by resolvePackageEntrySchedule (invoiceCatalogUtils) to resolve a package row's live
      // Payment Schedule from the catalog - the same budget/technical record Program Budget/
      // Expected Expenses read it from.
      technical: catalogTechnical,
      resolvePackagePrice: pkg => resolveBudgetPriceAmount(pkg?.listedPrice, { itemsById: catalogItemsById, rates: exchangeRates, packagesById: catalogPackagesById }),
    }),
    [catalogItemsById, exchangeRates, catalogPackagesById, catalogTechnical],
  );

  const invoiceServiceRows = useMemo(
    () => resolveInvoiceServiceRows(data.invoiceServices, catalogItemsById, priceContext),
    [data.invoiceServices, catalogItemsById, priceContext],
  );

  // round7 spec C: the invoice's package is no longer just another "Invoice services" row - the
  // Builder surfaces at most one at a time, in its own "Package & PDF components" panel.
  const packageRow = useMemo(
    () => invoiceServiceRows.find(row => row.kind === 'package') || null,
    [invoiceServiceRows],
  );

  // A catalog-backed package's schedule only ever renders inside its own PackageBlock in the PDF
  // (round8 spec B), so it has nothing to attach to once that block is hidden by the Package
  // checkbox. A custom package's block always stays visible (it's a real billed line, not a
  // reference block - see computeInvoiceSubtotal), so its schedule checkbox stays enabled.
  const scheduleCheckboxDisabled = !packageRow || (!data.includePackageInPdf && Boolean(packageRow.catalogId));

  // "% of package" only makes sense once a catalog-linked package is already part of this invoice -
  // it's a share of that package's price, not a standalone add option (spec item C).
  const percentSharePackage = packageRow && packageRow.catalogId ? packageRow : null;

  // The flat "Invoice services" list (item/custom/percent rows) - the package itself is rendered
  // separately, in its own panel (round7 spec C).
  const serviceLineRows = useMemo(
    () => invoiceServiceRows.filter(row => row.kind !== 'package'),
    [invoiceServiceRows],
  );

  const subtotal = useMemo(() => computeInvoiceSubtotal(invoiceServiceRows), [invoiceServiceRows]);
  const total = useMemo(() => computeInvoiceTotal(subtotal, data.taxPercent), [subtotal, data.taxPercent]);
  const amountDue = useMemo(() => computeInvoiceAmountDue(total, data.debtOrDeposit), [total, data.debtOrDeposit]);

  const { invoiceNumber, invoiceDate } = useMemo(() => generateInvoiceIdentifiers(invoiceDateInput), [invoiceDateInput]);

  // Resolved live from the beneficiary's own payment-purpose template (Beneficiary panel) - no
  // separate per-invoice override; editing the template there is the only place this is edited.
  const purposeOfPayment = useMemo(
    () => applyPaymentPurposePlaceholders(activeBeneficiary?.paymentPurpose, { invoiceNumber, invoiceDate }),
    [activeBeneficiary, invoiceNumber, invoiceDate],
  );

  const payerName = useMemo(() => buildPayerName(data.customers), [data.customers]);
  const payerLocation = useMemo(() => buildPayerLocation(data.customers), [data.customers]);
  const caseTitle = useMemo(() => buildCaseTitle(data.customers), [data.customers]);
  const activePayerCaseId = data.payerCaseIds[0];

  // Issued invoices are stored once, flat, newest first - the section only ever shows the active
  // payer's own history (design-tasks-3 §7).
  const payerIssuedInvoices = useMemo(
    () => data.issuedInvoices.filter(record => String(record.payerCaseId) === String(activePayerCaseId)),
    [data.issuedInvoices, activePayerCaseId],
  );

  // Other payers whose saved package/services can be copied into this invoice (design-tasks-3 §6).
  const copySourcePayerCases = useMemo(
    () => data.payerCases.filter(payerCase => String(payerCase.id) !== String(activePayerCaseId)
      && Array.isArray(payerCase.savedServices) && payerCase.savedServices.length),
    [data.payerCases, activePayerCaseId],
  );

  // recentServices is already ordered most-recently-used first (reorderRecentServices) - so
  // deduping here by keeping only the first occurrence of each identity naturally keeps the
  // newest copy of any repeat and drops the older, stale ones from the chip row.
  const recentServiceSuggestions = useMemo(() => {
    const used = new Set(data.invoiceServices.map(getEntryIdentityKey));
    const seen = new Set();
    const deduped = [];
    for (const entry of data.recentServices) {
      const key = getEntryIdentityKey(entry);
      if (used.has(key) || seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }
    return deduped.slice(0, 8);
  }, [data.recentServices, data.invoiceServices]);

  const usedCatalogItemIds = useMemo(() => new Set(
    data.invoiceServices.filter(entry => entry.kind === 'item').map(entry => String(entry.catalogId)),
  ), [data.invoiceServices]);

  const usedCatalogPackageIds = useMemo(() => new Set(
    data.invoiceServices.filter(entry => entry.kind === 'package').map(entry => String(entry.catalogId)),
  ), [data.invoiceServices]);

  // Hidden ("special offer") packages are excluded from the public Program Budget PDF but must
  // stay pickable here - an admin selects them deliberately, they're just not advertised.
  const visibleCatalogPackages = useMemo(
    () => getSortedPackages({ packages: catalogPackages }, priceContext),
    [catalogPackages, priceContext],
  );

  // Offered by the "% of package" picker tab in Other Expenses - percent shares can repeat, only
  // a package already added whole (the Package panel) is excluded.
  const availablePercentPackages = useMemo(
    () => visibleCatalogPackages.filter(pkg => !usedCatalogPackageIds.has(String(pkg.id))),
    [visibleCatalogPackages, usedCatalogPackageIds],
  );

  const defaultExpectedExpensesTaxPercent = Number.isFinite(Number(catalogTechnical?.wireTransferSurchargeRate))
    ? Math.round(Number(catalogTechnical.wireTransferSurchargeRate) * 10000) / 100
    : (Number(data.taxPercent) || 0);

  const expectedExpensesView = useMemo(() => {
    if (!expectedExpenses) return null;
    const pkg = catalogPackagesById.get(String(expectedExpenses.packageId)) || expectedExpenses.packageSnapshot || null;
    const shouldCheckPackageSharePercent = Boolean(expectedExpenses.packageId);
    const packagePrice = resolveBudgetPriceAmount(pkg?.listedPrice, priceContext)
      ?? (Number(expectedExpenses.packageSnapshot?.listedPrice) || null);
    const milestoneRows = expectedExpenses.milestones.map(milestone => {
      const serviceRows = resolveMilestoneServiceRows(milestone, catalogItemsById, priceContext);
      const subtotal = computeMilestoneSubtotal(serviceRows);
      const amountDue = computeMilestoneAmountDue(subtotal, milestone.taxPercent);
      return { milestone, serviceRows, subtotal, amountDue };
    });
    // One plan-wide tax rate (design-tasks §4): shown as a single value only while every milestone
    // agrees; mixed per-milestone rates read as blank until re-applied.
    const taxValues = expectedExpenses.milestones.map(milestone => Number(milestone.taxPercent) || 0);
    const sharedTaxPercent = taxValues.length && taxValues.every(value => value === taxValues[0])
      ? String(taxValues[0])
      : '';
    return {
      pkg,
      milestoneRows,
      sharedTaxPercent,
      totalPlanned: computeMilestonesTotal(expectedExpenses.milestones, catalogItemsById, priceContext),
      packageSharePercent: shouldCheckPackageSharePercent
        ? computeMilestonesPackageSharePercent(expectedExpenses.milestones, expectedExpenses.packageId, packagePrice)
        : null,
      shouldCheckPackageSharePercent,
    };
  }, [expectedExpenses, catalogItemsById, catalogPackagesById, priceContext]);

  // Draft for the plan-wide Expected Expenses tax field (design-tasks §4) - resynced from the
  // shared per-milestone value whenever the milestones change elsewhere.
  const [expectedExpensesTaxDraft, setExpectedExpensesTaxDraft, expectedExpensesTaxEditingRef] = useFieldDraft(
    expectedExpensesView?.sharedTaxPercent ?? '',
  );

  const persistPath = async (path, value, successMessage) => {
    try {
      await set(ref(database, path), value);
      if (successMessage) toast.success(successMessage);
    } catch (saveError) {
      console.error(`Unable to save ${path}`, saveError);
      toast.error('Unable to save. Reloading latest data.');
      loadInvoiceData();
    }
  };

  // Beneficiaries ------------------------------------------------------------

  const handleSelectBeneficiary = async id => {
    if (String(id) === String(data.beneficiaryIds[0])) return;
    const nextIds = reorderBeneficiaryIds(data.beneficiaryIds, id);
    setData(current => ({ ...current, beneficiaryIds: nextIds }));
    await persistPath(`${INVOICE_DATA_PATH}/beneficiaryIds`, nextIds, 'Active beneficiary updated.');
  };

  const updateActiveBeneficiaryField = (field, value) => {
    setData(current => {
      const activeId = current.beneficiaryIds[0];
      return {
        ...current,
        beneficiaries: current.beneficiaries.map(beneficiary => (String(beneficiary.id) === String(activeId)
          ? { ...beneficiary, [field]: value }
          : beneficiary)),
      };
    });
  };

  const persistActiveBeneficiaryField = async (field, value) => {
    const activeId = data.beneficiaryIds[0];
    const index = data.beneficiaries.findIndex(beneficiary => String(beneficiary.id) === String(activeId));
    if (index === -1) return;
    await persistPath(`${INVOICE_DATA_PATH}/beneficiaries/${index}/${field}`, value, 'Beneficiary updated.');
  };

  const addBeneficiary = async () => {
    const nextBeneficiary = emptyBeneficiary();
    const nextBeneficiaries = [...data.beneficiaries, nextBeneficiary];
    const nextIds = reorderBeneficiaryIds(data.beneficiaryIds, nextBeneficiary.id);
    setData(current => ({ ...current, beneficiaries: nextBeneficiaries, beneficiaryIds: nextIds }));
    try {
      await Promise.all([
        set(ref(database, `${INVOICE_DATA_PATH}/beneficiaries`), nextBeneficiaries),
        set(ref(database, `${INVOICE_DATA_PATH}/beneficiaryIds`), nextIds),
      ]);
      toast.success('Beneficiary added.');
    } catch (saveError) {
      console.error('Unable to add beneficiary', saveError);
      toast.error('Unable to add beneficiary.');
      loadInvoiceData();
    }
  };

  const deleteActiveBeneficiary = async () => {
    if (!activeBeneficiary) return;
    if (data.beneficiaries.length <= 1) {
      toast.error('At least one beneficiary is required.');
      return;
    }
    if (typeof window !== 'undefined' && !window.confirm(`Delete beneficiary "${activeBeneficiary.title || activeBeneficiary.id}"?`)) return;
    const nextBeneficiaries = data.beneficiaries.filter(beneficiary => String(beneficiary.id) !== String(activeBeneficiary.id));
    const nextIds = data.beneficiaryIds.filter(id => String(id) !== String(activeBeneficiary.id));
    setData(current => ({ ...current, beneficiaries: nextBeneficiaries, beneficiaryIds: nextIds }));
    try {
      await Promise.all([
        set(ref(database, `${INVOICE_DATA_PATH}/beneficiaries`), nextBeneficiaries),
        set(ref(database, `${INVOICE_DATA_PATH}/beneficiaryIds`), nextIds),
      ]);
      toast.success('Beneficiary deleted.');
    } catch (saveError) {
      console.error('Unable to delete beneficiary', saveError);
      toast.error('Unable to delete beneficiary.');
      loadInvoiceData();
    }
  };

  // Customers / payer cases ------------------------------------------------------------
  // One invoice belongs to one case/payer: `data.customers` is always a mirror of the active
  // payer case (data.payerCases[i] where payerCases[i].id === payerCaseIds[0]). Editing customers
  // writes through to that active case. Switching or starting a case never merges customers from
  // different cases into one payer - it replaces the active case outright (see startNewPayerCase/
  // selectPayerCase below), while still keeping every previously-used case saved for reuse.

  // Keeps `customers` (the convenience mirror every PDF/export/display site reads) and the active
  // entry inside `payerCases` in sync with each other.
  const withActiveCaseCustomers = (current, nextCustomers) => ({
    ...current,
    customers: nextCustomers,
    payerCases: current.payerCases.map(payerCase => (String(payerCase.id) === String(current.payerCaseIds[0])
      ? { ...payerCase, customers: nextCustomers }
      : payerCase)),
  });

  const persistPayerCases = async (nextPayerCases, nextPayerCaseIds, successMessage) => {
    try {
      await Promise.all([
        set(ref(database, `${INVOICE_DATA_PATH}/payerCases`), nextPayerCases),
        set(ref(database, `${INVOICE_DATA_PATH}/payerCaseIds`), nextPayerCaseIds),
      ]);
      if (successMessage) toast.success(successMessage);
    } catch (saveError) {
      console.error('Unable to save payer cases', saveError);
      toast.error('Unable to save. Reloading latest data.');
      loadInvoiceData();
    }
  };

  const updateCustomerField = (index, field, value) => {
    setData(current => {
      const nextCustomers = current.customers.map((customer, customerIndex) => (customerIndex === index
        ? { ...customer, [field]: value }
        : customer));
      return withActiveCaseCustomers(current, nextCustomers);
    });
  };

  const persistCustomers = async (nextCustomers, successMessage) => {
    const nextPayerCases = data.payerCases.map(payerCase => (String(payerCase.id) === String(data.payerCaseIds[0])
      ? { ...payerCase, customers: nextCustomers }
      : payerCase));
    await persistPayerCases(nextPayerCases, data.payerCaseIds, successMessage);
  };

  // Adds a co-payer within the CURRENT case (e.g. a couple) - it never creates a new case.
  const addCustomer = () => {
    const nextCustomers = [...data.customers, { name: '', address: '' }];
    setData(current => withActiveCaseCustomers(current, nextCustomers));
    persistCustomers(nextCustomers, 'Customer added.');
  };

  const removeCustomer = index => {
    const nextCustomers = data.customers.filter((customer, customerIndex) => customerIndex !== index);
    setData(current => withActiveCaseCustomers(current, nextCustomers));
    persistCustomers(nextCustomers, 'Customer removed.');
  };

  // Starts a brand-new case: the active payer switches to a blank customer, while every
  // previously-used case (and its customers) stays saved in payerCases for later reuse - this is
  // the "select a new client replaces the previous selection" fix (P0, round4 #1).
  const startNewPayerCase = async () => {
    const nextCase = { id: createEntryId(), customers: [{ name: '', address: '' }] };
    const nextPayerCases = [...data.payerCases, nextCase];
    const nextPayerCaseIds = reorderPayerCaseIds(data.payerCaseIds, nextCase.id);
    setData(current => ({ ...current, payerCases: nextPayerCases, payerCaseIds: nextPayerCaseIds, customers: nextCase.customers }));
    await persistPayerCases(nextPayerCases, nextPayerCaseIds, 'New case started.');
  };

  // Switches the active case without touching any case's saved customers - most-recently-selected
  // case is brought to the front, so it's offered first the next time this list is shown.
  const selectPayerCase = async id => {
    if (String(id) === String(data.payerCaseIds[0])) return;
    const nextPayerCaseIds = reorderPayerCaseIds(data.payerCaseIds, id);
    const nextCase = data.payerCases.find(payerCase => String(payerCase.id) === String(id));
    setData(current => ({ ...current, payerCaseIds: nextPayerCaseIds, customers: nextCase?.customers || [] }));
    await persistPayerCases(data.payerCases, nextPayerCaseIds, 'Active case switched.');
  };

  const deleteActivePayerCase = async () => {
    if (data.payerCases.length <= 1) {
      toast.error('At least one case is required.');
      return;
    }
    const activeId = data.payerCaseIds[0];
    if (typeof window !== 'undefined' && !window.confirm(`Delete case "${payerName || activeId}" from history?`)) return;
    const nextPayerCases = data.payerCases.filter(payerCase => String(payerCase.id) !== String(activeId));
    const nextPayerCaseIds = data.payerCaseIds.filter(id => String(id) !== String(activeId));
    const nextActiveCase = nextPayerCases.find(payerCase => String(payerCase.id) === String(nextPayerCaseIds[0])) || nextPayerCases[0];
    setData(current => ({
      ...current,
      payerCases: nextPayerCases,
      payerCaseIds: nextPayerCaseIds,
      customers: nextActiveCase?.customers || [],
    }));
    await persistPayerCases(nextPayerCases, nextPayerCaseIds, 'Case deleted.');
  };

  // Invoice services ------------------------------------------------------------

  const persistInvoiceServices = (nextInvoiceServices, successMessage) => {
    setData(current => ({ ...current, invoiceServices: nextInvoiceServices }));
    persistPath(`${INVOICE_DATA_PATH}/invoiceServices`, nextInvoiceServices, successMessage);
  };

  // Saves the current package + one-off services onto the active payer case itself
  // (design-tasks-3 §5) - a deliberate snapshot tied to this payer, not the live editor state.
  const saveServicesForPayer = async () => {
    if (!data.invoiceServices.length) {
      toast.error('Nothing to save - the invoice has no package or services yet.');
      return;
    }
    const nextPayerCases = data.payerCases.map(payerCase => (String(payerCase.id) === String(activePayerCaseId)
      ? { ...payerCase, savedServices: data.invoiceServices }
      : payerCase));
    setData(current => ({ ...current, payerCases: nextPayerCases }));
    await persistPath(`${INVOICE_DATA_PATH}/payerCases`, nextPayerCases, 'Package & services saved for this payer.');
  };

  // Copies another payer's saved package/services into this invoice (design-tasks-3 §6), replacing
  // the editor's current content - entries are cloned with fresh ids so the two payers' saved
  // sets never share rows.
  const copyServicesFromPayer = payerCaseId => {
    const source = data.payerCases.find(payerCase => String(payerCase.id) === String(payerCaseId));
    if (!source || !Array.isArray(source.savedServices) || !source.savedServices.length) return;
    const sourceName = buildPayerName(source.customers) || `Case ${source.id}`;
    if (data.invoiceServices.length && typeof window !== 'undefined'
      && !window.confirm(`Replace the current package & services with the ones saved for "${sourceName}"?`)) return;
    persistInvoiceServices(source.savedServices.map(cloneEntryWithNewId), `Copied package & services from ${sourceName}.`);
  };

  // Issued invoices (design-tasks-3 §7) ------------------------------------------------------------

  const persistIssuedInvoices = (nextIssuedInvoices, successMessage) => {
    setData(current => ({ ...current, issuedInvoices: nextIssuedInvoices }));
    persistPath(`${INVOICE_DATA_PATH}/issuedInvoices`, nextIssuedInvoices, successMessage);
  };

  const commitIssuedInvoicePayment = (invoiceId, field, value) => {
    const nextIssuedInvoices = data.issuedInvoices.map(record => (String(record.id) === String(invoiceId)
      ? { ...record, payment: { ...record.payment, [field]: value } }
      : record));
    persistIssuedInvoices(nextIssuedInvoices, 'Payment record updated.');
  };

  // Removes one entry from the Issued Invoices history (design-tasks-4 §2). Payment tracking
  // lives on the record itself, so this drops it too - hence the confirm.
  const deleteIssuedInvoice = record => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete invoice No. ${record.invoiceNumber} from Issued Invoices?`)) return;
    persistIssuedInvoices(
      data.issuedInvoices.filter(existing => String(existing.id) !== String(record.id)),
      'Issued invoice deleted.',
    );
  };

  // The Reissue flow (design-tasks-3 §7): the issued invoice's contents move back into the active
  // editor, and whatever the editor held drops into "Recent (click to add)" - then the admin edits
  // and hits Generate PDF, which records the reissued version as a new issued invoice below.
  const reissueInvoice = record => {
    const nextRecentServices = reorderRecentServices(data.recentServices, data.invoiceServices);
    // Records saved while duplicate package rows could still accumulate reissue as one package,
    // not several invisible copies (design-tasks-4 §3).
    const nextInvoiceServices = dedupePackageEntries(record.entries).map(cloneEntryWithNewId);
    setData(current => ({ ...current, recentServices: nextRecentServices, invoiceServices: nextInvoiceServices }));
    persistPath(`${INVOICE_DATA_PATH}/recentServices`, nextRecentServices);
    persistPath(`${INVOICE_DATA_PATH}/invoiceServices`, nextInvoiceServices, 'Invoice moved back to the editor - edit and Generate PDF to reissue.');
    // A reissued package must land visible in the Package panel, not behind an unchecked box -
    // same rule as activating a package from Recent.
    if (!data.includePackageInPdf && nextInvoiceServices.some(entry => entry.kind === 'package')) {
      setIncludePackageInPdf(true);
    }
  };

  const commitTopLevelField = (id, field, value) => {
    const next = data.invoiceServices.map(entry => (entry.id === id ? setEntryField(entry, field, value) : entry));
    persistInvoiceServices(next, 'Service updated.');
  };

  const removeTopLevelEntry = id => {
    persistInvoiceServices(data.invoiceServices.filter(entry => entry.id !== id), 'Service removed.');
  };

  const moveTopLevelEntry = (id, offset) => {
    const index = data.invoiceServices.findIndex(entry => entry.id === id);
    if (index === -1) return;
    // The package row is no longer rendered inside Invoice Services (round7 spec C) and must never
    // be an invisible "neighbor" a service row silently swaps places with - skip over it (if one
    // sits in between) when looking for the next/previous *visible* row to swap with.
    const step = offset > 0 ? 1 : -1;
    let targetIndex = index + step;
    while (targetIndex >= 0 && targetIndex < data.invoiceServices.length && data.invoiceServices[targetIndex].kind === 'package') {
      targetIndex += step;
    }
    if (targetIndex < 0 || targetIndex >= data.invoiceServices.length) return;
    const next = [...data.invoiceServices];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    persistInvoiceServices(next, 'Service order updated.');
  };

  const resetTopLevelEntry = id => {
    const next = data.invoiceServices.map(entry => {
      if (entry.id !== id) return entry;
      if (entry.kind === 'item') return resetItemEntryOverrides(entry);
      if (entry.kind === 'package') return resetPackageEntryToCatalog(entry, catalogPackagesById.get(String(entry.catalogId)));
      return entry;
    });
    persistInvoiceServices(next, 'Reverted to catalog values.');
  };

  const addEntryToInvoice = (entry, successMessage) => {
    // A "% of package" row represents one milestone of a payment schedule, not a single
    // conceptual line - a schedule can legitimately have two equal-percent steps (e.g. two 25%
    // installments), so unlike every other entry kind it must never be deduped by its resolved
    // value alone.
    if (entry?.kind !== 'percent') {
      const identity = getEntryIdentityKey(entry);
      if (data.invoiceServices.some(existing => getEntryIdentityKey(existing) === identity)) {
        toast.error('This is already on the invoice.');
        return;
      }
    }
    persistInvoiceServices([...data.invoiceServices, entry], successMessage);
  };

  const addCatalogServiceEntry = catalogId => {
    addEntryToInvoice(makeCatalogItemEntry(catalogId), 'Service added.');
  };

  const addCatalogPackageEntry = pkg => {
    addEntryToInvoice(makeCatalogPackageEntry(pkg), 'Package added.');
  };

  // The Package panel's programme selector (design-tasks §2): swaps the invoice's package for a
  // different catalog programme in place - the fresh entry drops any per-invoice customisation of
  // the old one, exactly like removing the package and adding the new one, but in a single step.
  const replacePackageEntry = pkg => {
    const currentPackageEntry = data.invoiceServices.find(entry => entry.kind === 'package');
    const oldPackageId = currentPackageEntry?.catalogId;
    const newPackageId = String(pkg?.id ?? '');
    const next = data.invoiceServices.map(entry => {
      if (entry.kind === 'package') return makeCatalogPackageEntry(pkg);
      if (entry.kind === 'percent' && oldPackageId && String(entry.packageId) === String(oldPackageId)) {
        return { ...entry, packageId: newPackageId };
      }
      return entry;
    });
    persistInvoiceServices(next, 'Package switched.');
  };

  const addCustomServiceEntry = fields => {
    addEntryToInvoice(makeCustomEntry(fields), 'Service added.');
  };

  // A package with no Budget catalog entry - it can't reference the catalog because there is
  // nothing there to reference, so it's saved fully on this invoice (P0, round4 #2). Its price
  // starts at 0/sum-of-children; the admin fills in children (custom or catalog-linked) and/or a
  // price override on the resulting package card, same as any catalog-sourced package.
  const addCustomPackageEntry = () => {
    const name = newCustomPackageName.trim();
    if (!name) {
      toast.error('Enter a name for the new package.');
      return;
    }
    addEntryToInvoice(makeCustomPackageEntry({ name }), 'Custom package added.');
    setNewCustomPackageName('');
  };

  // Never defaults to 0% or 100% - that's just swapping one wrong constant for another. The
  // starting value is the package's next unused Payment Schedule milestone (so a first "% of
  // package" row on a fresh invoice matches what the catalog actually expects to be billed at
  // this stage); once every schedule step already has a row, it falls back to whatever share of
  // the package price is still unbilled.
  const addPercentServiceEntry = packageId => {
    const pkg = catalogPackagesById.get(String(packageId));
    const schedule = pkg ? resolveProgramPaymentSchedule({ technical: catalogTechnical }, pkg) : null;
    const listedPriceAmount = pkg ? resolveBudgetPriceAmount(pkg.listedPrice, priceContext) : null;
    const existingPercentRows = data.invoiceServices.filter(
      entry => entry.kind === 'percent' && String(entry.packageId) === String(packageId),
    );
    const getEntrySharePercent = entry => {
      if (entry.amount != null && listedPriceAmount) {
        return Math.round(((Number(entry.amount) || 0) / listedPriceAmount) * 1e6) / 1e4;
      }
      return Number(entry.percent) || 0;
    };
    const usedPercentTotal = existingPercentRows.reduce((sum, entry) => sum + getEntrySharePercent(entry), 0);
    const nextPayment = schedule?.payments?.[existingPercentRows.length];
    const nextPaymentAmount = nextPayment ? resolvePaymentAmount(nextPayment, listedPriceAmount) : null;
    const defaultPercent = (nextPaymentAmount != null && listedPriceAmount)
      ? Math.round((nextPaymentAmount / listedPriceAmount) * 1e6) / 1e4
      : Math.max(0, Math.round((100 - usedPercentTotal) * 100) / 100);
    addEntryToInvoice(makePercentOfPackageEntry(packageId, defaultPercent), 'Service added.');
  };

  // Clicking a Recent package while another package is active swaps them (design-tasks-2 §5): the
  // clicked one becomes the invoice's package and the previously-active one drops back into
  // Recent - never a silent no-op append behind the single package the panel shows.
  const addRecentServiceEntry = entry => {
    const clone = cloneEntryWithNewId(entry);
    if (clone.kind === 'package') {
      const existingPackage = data.invoiceServices.find(existing => existing.kind === 'package');
      if (existingPackage) {
        if (getEntryIdentityKey(existingPackage) === getEntryIdentityKey(clone)) {
          toast.error('This is already on the invoice.');
          return;
        }
        const nextRecentServices = upsertRecentEntry(data.recentServices, existingPackage);
        setData(current => ({ ...current, recentServices: nextRecentServices }));
        persistPath(`${INVOICE_DATA_PATH}/recentServices`, nextRecentServices);
        persistInvoiceServices(
          data.invoiceServices.map(existing => (existing.kind === 'package' ? clone : existing)),
          'Package switched.',
        );
      } else {
        addEntryToInvoice(clone, 'Package added.');
      }
      // The panel only shows the package while its PDF checkbox is on - activating a package
      // from Recent must make it visible, not drop it into a hidden panel.
      if (!data.includePackageInPdf) setIncludePackageInPdf(true);
      return;
    }
    addEntryToInvoice(clone, 'Service added.');
  };

  // round4 #3.2 (and, by the shared mechanism, #6): a trash icon on a recent entry removes just
  // that one record from the backend list - it never touches the current invoice's own services.
  const removeRecentServiceEntry = entryId => {
    const nextRecentServices = data.recentServices.filter(entry => String(entry.id) !== String(entryId));
    setData(current => ({ ...current, recentServices: nextRecentServices }));
    persistPath(`${INVOICE_DATA_PATH}/recentServices`, nextRecentServices, 'Removed from recent.');
  };

  // Package children ------------------------------------------------------------

  const commitPackageChildField = (packageId, childId, field, value) => {
    const next = data.invoiceServices.map(entry => (entry.id === packageId
      ? updatePackageChildField(entry, childId, field, value)
      : entry));
    persistInvoiceServices(next, 'Package updated.');
  };

  const resetPackageChildEntry = (packageId, childId) => {
    const next = data.invoiceServices.map(entry => {
      if (entry.id !== packageId) return entry;
      const children = (entry.children || []).map(child => (child.id === childId ? resetItemEntryOverrides(child) : child));
      return { ...entry, children, customized: true };
    });
    persistInvoiceServices(next, 'Reverted to catalog values.');
  };

  const removePackageChildEntry = (packageId, childId) => {
    const next = data.invoiceServices.map(entry => (entry.id === packageId ? removePackageChild(entry, childId) : entry));
    persistInvoiceServices(next, 'Service removed from package.');
  };

  const movePackageChildEntry = (packageId, childId, offset) => {
    const next = data.invoiceServices.map(entry => (entry.id === packageId ? movePackageChild(entry, childId, offset) : entry));
    persistInvoiceServices(next, 'Package order updated.');
  };

  const addCustomChildEntry = (packageId, fields) => {
    const next = data.invoiceServices.map(entry => (entry.id === packageId ? addCustomChildToPackage(entry, fields) : entry));
    persistInvoiceServices(next, 'Service added to package.');
  };

  const addCatalogChildEntry = (packageId, catalogId) => {
    const next = data.invoiceServices.map(entry => (entry.id === packageId ? addCatalogChildToPackage(entry, catalogId) : entry));
    persistInvoiceServices(next, 'Service added to package.');
  };

  // Package & PDF components ------------------------------------------------------------
  // round7 spec C: which optional PDF components (the package block, its payment schedule, the
  // Payment Details document) are included is decided here, independent of the invoice's flat
  // service breakdown - a checkbox both gates PDF inclusion and shows/hides that component's own
  // editing area (spec C.2).

  const setIncludePackageInPdf = value => {
    // The Payment schedule table only ever renders inside a catalog-backed package's own block
    // (InvoicePdfDocument's PackageBlock) - hiding that block also silently drops its schedule
    // from the PDF, so clear the schedule checkbox along with it instead of leaving it checked
    // but with nothing left to render. A custom package's block stays visible regardless of this
    // checkbox (it's a real billed line, not a reference block - see computeInvoiceSubtotal), so
    // its schedule is unaffected.
    const alsoHidesSchedule = !value && Boolean(packageRow?.catalogId) && data.includeScheduleInPdf;
    setData(current => ({
      ...current,
      includePackageInPdf: value,
      ...(alsoHidesSchedule ? { includeScheduleInPdf: false } : {}),
    }));
    persistPath(`${INVOICE_DATA_PATH}/includePackageInPdf`, value);
    if (alsoHidesSchedule) persistPath(`${INVOICE_DATA_PATH}/includeScheduleInPdf`, false);
  };

  const setIncludeScheduleInPdf = value => {
    setData(current => ({ ...current, includeScheduleInPdf: value }));
    persistPath(`${INVOICE_DATA_PATH}/includeScheduleInPdf`, value);
  };

  const commitPackageSchedule = (packageId, schedule) => {
    const next = data.invoiceServices.map(entry => (entry.id === packageId ? setPackageSchedule(entry, schedule) : entry));
    persistInvoiceServices(next, 'Payment schedule updated.');
  };

  // The first edit "materializes" whatever schedule is currently showing (live from the catalog, or
  // an existing override) into a fresh per-invoice override, then applies the one field edit on top.
  // The amount field remains EUR-first: bare values and explicit EUR values are stored as fixed
  // amounts, while an explicit percent (for example "25%") is resolved against the package price once,
  // at commit time, since a schedule override stores plain euro amounts.
  const updateScheduleRow = (rowIndex, field, value) => {
    if (!packageRow) return;
    const resolveAmount = raw => {
      const text = String(raw ?? '').trim();
      if (/%/.test(text)) {
        const { percent } = parsePercentOrAmountInput(text);
        return roundToCents(((Number(packageRow.price) || 0) * percent) / 100) || 0;
      }
      const normalized = text.replace(/€|eur/gi, '').replace(/\s+/g, '');
      const numericText = /,\d{3}(?:\D|$)/.test(normalized) ? normalized.replace(/,/g, '') : normalized.replace(',', '.');
      const amount = Number(numericText);
      return Number.isFinite(amount) ? amount : 0;
    };
    const rows = packageRow.scheduleRows.map((row, index) => (index === rowIndex
      ? { ...row, [field]: field === 'amount' ? resolveAmount(value) : value }
      : row));
    commitPackageSchedule(packageRow.id, rows);
  };

  const addScheduleRow = () => {
    if (!packageRow) return;
    commitPackageSchedule(packageRow.id, [...packageRow.scheduleRows, { title: '', amount: 0 }]);
  };

  const removeScheduleRow = rowIndex => {
    if (!packageRow) return;
    commitPackageSchedule(packageRow.id, packageRow.scheduleRows.filter((_, index) => index !== rowIndex));
  };

  // Lets the admin pick a different named schedule out of the full catalog (round8 spec B),
  // instead of only ever inheriting the one schedule this package happens to be linked to.
  // Percent-based steps are resolved against the package's own listed price, same as the
  // catalog-derived schedule this replaces.
  const applyCatalogPaymentSchedule = scheduleId => {
    if (!packageRow) return;
    const schedule = (catalogTechnical.paymentSchedules || []).find(candidate => String(candidate.id) === String(scheduleId));
    if (!schedule) return;
    const pkg = catalogPackagesById.get(String(packageRow.catalogId));
    const listedPriceAmount = pkg ? resolveBudgetPriceAmount(pkg.listedPrice, priceContext) : null;
    // Scaled to the package's own billed price (priceOverride included) the same way the live
    // catalog-derived schedule already is in resolvePackageEntrySchedule - otherwise applying a
    // catalog schedule to a package billed above/below its listed price would make the schedule
    // total drift from "Total programme fee".
    const billedPrice = Number(packageRow.price) || 0;
    const scale = listedPriceAmount ? billedPrice / listedPriceAmount : 1;
    const rows = (schedule.payments || []).map(payment => {
      const amount = resolvePaymentAmount(payment, listedPriceAmount);
      return { title: payment.title || '', amount: amount == null ? null : roundToCents(amount * scale) };
    });
    commitPackageSchedule(packageRow.id, rows);
  };

  // Expected expenses ------------------------------------------------------------
  // A whole program's billing forecast: one milestone per payment-schedule entry, auto-computed
  // from the chosen budget/packages program, stored as its own object at invoiceBuilder/expectedExpenses.

  const persistExpectedExpenses = (nextPlan, successMessage) => {
    setExpectedExpenses(nextPlan);
    persistPath(EXPECTED_EXPENSES_PATH, serializeExpectedExpensesData(nextPlan), successMessage);
  };

  const getResolvedExpectedExpensesPackage = pkg => {
    const resolvedPrice = resolveBudgetPriceAmount(pkg.listedPrice, priceContext);
    if (resolvedPrice == null) {
      toast.error('Wait until the package price formula resolves before creating expected expenses.');
      return null;
    }
    try {
      getExpectedExpensesPackagePrice({ ...pkg, listedPrice: resolvedPrice });
    } catch (error) {
      toast.error('Expected expenses require a resolved positive package price.');
      return null;
    }
    return { ...pkg, listedPrice: resolvedPrice };
  };

  const createExpectedExpensesPlan = pkg => {
    const schedule = resolveProgramPaymentSchedule({ technical: catalogTechnical }, pkg);
    if (!schedule || !Array.isArray(schedule.payments) || !schedule.payments.length) {
      toast.error('This package has no payment schedule in the catalog.');
      return;
    }
    const resolvedPackage = getResolvedExpectedExpensesPackage(pkg);
    if (!resolvedPackage) return;
    const plan = buildExpectedExpensesPlan(resolvedPackage, schedule, { taxPercent: defaultExpectedExpensesTaxPercent });
    persistExpectedExpenses(plan, 'Expected expenses template created.');
    setShowExpectedExpensesPicker(false);
  };

  // round4 #4: a custom package has no catalog payment schedule to build from, so the admin builds
  // one by hand (title + amount rows) instead. Each row becomes a fixed custom line on its own
  // milestone (never a "% of package" row - there is no catalog package price for that percent to
  // track live against), matching round4 #2's "stored fully on the invoice" rule for custom packages.
  const addCustomScheduleRow = () => setCustomScheduleRows(rows => [...rows, { title: '', amount: '' }]);

  const removeCustomScheduleRow = index => setCustomScheduleRows(rows => (rows.length > 1
    ? rows.filter((row, rowIndex) => rowIndex !== index)
    : rows));

  const updateCustomScheduleRow = (index, field, value) => setCustomScheduleRows(rows => rows.map(
    (row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row),
  ));

  // Loads a saved schedule (round4 #4's "recent" list) back into the editable rows, most-recently-
  // used first thanks to touchRecentEntry bringing it to the front of recentPaymentSchedules.
  const loadRecentSchedule = scheduleEntry => {
    const payments = Array.isArray(scheduleEntry.payments) ? scheduleEntry.payments : [];
    setCustomScheduleRows(payments.map(payment => ({ title: payment.title, amount: String(payment.amount) })));
    setCustomPlanPackageName(current => current || scheduleEntry.name || '');
    const savedPrice = Number(scheduleEntry.price);
    const derivedPrice = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const nextPrice = Number.isFinite(savedPrice) && savedPrice > 0 ? savedPrice : derivedPrice;
    setCustomPlanPackagePrice(nextPrice > 0 ? String(nextPrice) : '');
    const nextRecentPaymentSchedules = touchRecentEntry(data.recentPaymentSchedules, scheduleEntry.id);
    setData(current => ({ ...current, recentPaymentSchedules: nextRecentPaymentSchedules }));
    persistPath(`${INVOICE_DATA_PATH}/recentPaymentSchedules`, nextRecentPaymentSchedules);
  };

  const removeRecentSchedule = scheduleId => {
    const nextRecentPaymentSchedules = removeRecentEntry(data.recentPaymentSchedules, scheduleId);
    setData(current => ({ ...current, recentPaymentSchedules: nextRecentPaymentSchedules }));
    persistPath(`${INVOICE_DATA_PATH}/recentPaymentSchedules`, nextRecentPaymentSchedules, 'Removed from recent.');
  };

  const createExpectedExpensesPlanFromCustomSchedule = () => {
    const name = customPlanPackageName.trim();
    const price = Number(String(customPlanPackagePrice).replace(',', '.'));
    const payments = customScheduleRows
      .map(row => ({ title: row.title.trim(), amount: Number(String(row.amount).replace(',', '.')) }))
      .filter(payment => payment.title && Number.isFinite(payment.amount) && payment.amount > 0);
    if (!name) {
      toast.error('Enter a package name.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a positive package price.');
      return;
    }
    if (!payments.length) {
      toast.error('Add at least one payment schedule row (title + amount).');
      return;
    }
    const milestones = payments.map((payment, index) => ({
      id: createEntryId(),
      title: payment.title,
      taxPercent: defaultExpectedExpensesTaxPercent,
      showPackageOverview: index === 0,
      services: [makeCustomEntry({ name: payment.title, price: payment.amount })],
    }));
    const plan = {
      packageId: '',
      packageSnapshot: { name, description: '', listedPrice: price, currency: 'EUR', children: [] },
      milestones,
    };
    persistExpectedExpenses(plan, 'Expected expenses template created from custom schedule.');

    const scheduleEntry = { id: createEntryId(), name, price, payments };
    const nextRecentPaymentSchedules = upsertRecentEntry(data.recentPaymentSchedules, scheduleEntry);
    setData(current => ({ ...current, recentPaymentSchedules: nextRecentPaymentSchedules }));
    persistPath(`${INVOICE_DATA_PATH}/recentPaymentSchedules`, nextRecentPaymentSchedules);

    setShowCustomSchedulePicker(false);
    setCustomPlanPackageName('');
    setCustomPlanPackagePrice('');
    setCustomScheduleRows([{ title: '', amount: '' }]);
  };

  // Shared by "Recalculate" (the package's own catalog schedule) and the payment-schedule selector
  // (any named schedule from the catalog - design-tasks §4): rebuilds the milestones from the given
  // schedule while keeping each milestone's extra services, tax rate, and overview flag.
  const rebuildExpectedExpensesFromSchedule = (schedule, successMessage) => {
    if (!expectedExpenses) return;
    const pkg = catalogPackagesById.get(String(expectedExpenses.packageId));
    if (!pkg) {
      toast.error('The original package is no longer in the catalog.');
      return;
    }
    if (!schedule || !Array.isArray(schedule.payments) || !schedule.payments.length) {
      toast.error('This package has no payment schedule in the catalog.');
      return;
    }
    // Resolved (and validated positive) the same way a brand-new plan is - an unresolved formula
    // price must never silently fall back to the raw "=..." string, which would zero out every
    // freshly-rebuilt percent-of-package row below.
    const resolvedPackage = getResolvedExpectedExpensesPackage(pkg);
    if (!resolvedPackage) return;
    if (typeof window !== 'undefined' && !window.confirm(
      'Recalculate milestones from this schedule? Titles reset to the schedule and the package-share row is recomputed; extra services on each milestone are kept.',
    )) return;
    const freshMilestones = buildMilestonesFromSchedule(resolvedPackage, schedule, { taxPercent: defaultExpectedExpensesTaxPercent });
    // A milestone saved before expectedExpenseRole existed has no explicit marker on its scheduled
    // row, so it can't be told apart from a manually-added percent-of-package row by itself. Only
    // guess when EVERY existing milestone's first row looks like that same unmarked pattern - one
    // manual row surrounded by otherwise-fresh milestones is left alone instead of being swallowed
    // as if it were the old scheduled amount. Evaluated over the existing milestones (not the fresh
    // ones), so a schedule that grew a new step doesn't silently defeat this check.
    const packageId = String(expectedExpenses.packageId ?? '');
    const isUnmarkedPackagePercent = entry => entry?.kind === 'percent'
      && !entry.expectedExpenseRole
      && String(entry.packageId) === packageId;
    const existingMilestones = expectedExpenses.milestones || [];
    const hasLegacyScheduledRows = existingMilestones.length > 0
      && existingMilestones.every(milestone => isUnmarkedPackagePercent((milestone.services || [])[0]));
    const nextMilestones = freshMilestones.map((milestone, index) => {
      const previous = existingMilestones[index];
      const previousExtras = (previous?.services || []).filter((entry, entryIndex) => (
        entry?.expectedExpenseRole !== 'scheduled'
        && !(hasLegacyScheduledRows && entryIndex === 0 && isUnmarkedPackagePercent(entry))
      ));
      return {
        ...milestone,
        services: [...milestone.services, ...previousExtras],
        taxPercent: previous?.taxPercent ?? milestone.taxPercent,
        showPackageOverview: previous?.showPackageOverview ?? milestone.showPackageOverview,
      };
    });
    persistExpectedExpenses({
      ...expectedExpenses,
      packageSnapshot: {
        ...expectedExpenses.packageSnapshot,
        listedPrice: resolvedPackage.listedPrice,
      },
      milestones: nextMilestones,
    }, successMessage);
  };

  const recalculateExpectedExpensesSchedule = () => {
    if (!expectedExpenses) return;
    const pkg = catalogPackagesById.get(String(expectedExpenses.packageId));
    if (!pkg) {
      toast.error('The original package is no longer in the catalog.');
      return;
    }
    const schedule = resolveProgramPaymentSchedule({ technical: catalogTechnical }, pkg);
    rebuildExpectedExpensesFromSchedule(schedule, 'Schedule recalculated.');
  };

  // Payment-schedule selector (design-tasks §4): applies any named schedule from the catalog to
  // the plan, same pattern as the Package panel's schedule selector.
  const applyExpectedExpensesSchedule = scheduleId => {
    const schedule = (catalogTechnical.paymentSchedules || []).find(candidate => String(candidate.id) === String(scheduleId));
    if (!schedule) return;
    rebuildExpectedExpensesFromSchedule(schedule, 'Payment schedule applied.');
  };

  // Package selector (design-tasks §4): switching programme rebuilds the whole plan from the new
  // package's own catalog schedule - the same flow as picking a package for a brand-new plan.
  const switchExpectedExpensesPackage = packageId => {
    const pkg = catalogPackagesById.get(String(packageId));
    if (!pkg || String(pkg.id) === String(expectedExpenses?.packageId)) return;
    if (typeof window !== 'undefined' && !window.confirm(
      `Switch the plan to "${pkg.name}"? Milestones are rebuilt from that package's payment schedule.`,
    )) return;
    createExpectedExpensesPlan(pkg);
  };

  // Plan-wide tax rate (design-tasks §4) - one value applied to every milestone, joining the same
  // recent-rates quick-pick list the invoice Summary tax uses.
  const applyExpectedExpensesTaxPercent = value => {
    if (!expectedExpenses) return;
    const numeric = Number(String(value).replace(',', '.')) || 0;
    const nextMilestones = expectedExpenses.milestones.map(milestone => ({ ...milestone, taxPercent: numeric }));
    persistExpectedExpensesMilestones(nextMilestones, 'Tax updated for all milestones.');
    if (numeric <= 0) return;
    const existing = data.recentTaxRates.find(rate => Number(rate.value) === numeric);
    const nextRecentTaxRates = existing
      ? touchRecentEntry(data.recentTaxRates, existing.id)
      : upsertRecentEntry(data.recentTaxRates, { id: createEntryId(), value: numeric });
    setData(current => ({ ...current, recentTaxRates: nextRecentTaxRates }));
    persistPath(`${INVOICE_DATA_PATH}/recentTaxRates`, nextRecentTaxRates);
  };

  const deleteExpectedExpensesPlan = () => {
    if (typeof window !== 'undefined' && !window.confirm('Delete the whole expected expenses template?')) return;
    persistExpectedExpenses(null, 'Expected expenses template deleted.');
  };

  const persistExpectedExpensesMilestones = (nextMilestones, successMessage) => {
    persistExpectedExpenses({ ...expectedExpenses, milestones: nextMilestones }, successMessage);
  };

  const commitMilestoneField = (milestoneId, field, value) => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id === milestoneId
      ? setMilestoneField(milestone, field, value)
      : milestone));
    persistExpectedExpensesMilestones(nextMilestones, 'Milestone updated.');
  };

  const commitMilestoneServiceField = (milestoneId, entryId, field, value) => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id === milestoneId
      ? updateMilestoneServiceField(milestone, entryId, field, value)
      : milestone));
    persistExpectedExpensesMilestones(nextMilestones, 'Service updated.');
  };

  const resetMilestoneServiceEntry = (milestoneId, entryId) => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id !== milestoneId ? milestone : {
      ...milestone,
      services: milestone.services.map(entry => (entry.id === entryId ? resetItemEntryOverrides(entry) : entry)),
    }));
    persistExpectedExpensesMilestones(nextMilestones, 'Reverted to catalog values.');
  };

  const removeMilestoneServiceEntry = (milestoneId, entryId) => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id === milestoneId
      ? removeMilestoneService(milestone, entryId)
      : milestone));
    persistExpectedExpensesMilestones(nextMilestones, 'Service removed.');
  };

  const addMilestoneCustomService = (milestoneId, fields) => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id === milestoneId
      ? addMilestoneService(milestone, makeCustomEntry(fields))
      : milestone));
    persistExpectedExpensesMilestones(nextMilestones, 'Service added.');
  };

  const addMilestoneCatalogService = (milestoneId, catalogId) => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id === milestoneId
      ? addMilestoneService(milestone, makeCatalogItemEntry(catalogId))
      : milestone));
    persistExpectedExpensesMilestones(nextMilestones, 'Service added.');
  };

  const handleGenerateExpectedExpensesPdf = async () => {
    if (!expectedExpenses || !expectedExpensesView?.milestoneRows?.length) {
      toast.error('Choose a package to build the plan first.');
      return;
    }
    if (!data.customers.length) {
      toast.error('Add at least one customer first.');
      return;
    }
    if (isExpectedExpensesFormulaRatePending) {
      toast.error('Wait until the package price formula resolves before generating the PDF.');
      return;
    }
    if (expectedExpensesFormulaRateError) {
      toast.error('Exchange rates failed to load - cannot resolve the package price formula.');
      return;
    }
    if (isGeneratingExpectedExpenses) return;
    setIsGeneratingExpectedExpenses(true);
    try {
      const [{ pdf }, { default: ExpectedExpensesPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./ExpectedExpensesPdfDocument'),
      ]);
      const documentProps = {
        plan: expectedExpenses,
        customers: data.customers,
        catalogItemsById,
        priceContext,
        planDate: new Date(`${invoiceDateInput || getTodayYmd()}T00:00:00`),
        spacing: expectedExpensesSpacing,
      };
      let blob;
      try {
        blob = await pdf(React.createElement(ExpectedExpensesPdfDocument, documentProps)).toBlob();
      } catch (firstAttemptError) {
        console.error('Expected expenses PDF generation failed on first attempt, retrying', firstAttemptError);
        blob = await pdf(React.createElement(ExpectedExpensesPdfDocument, documentProps)).toBlob();
      }
      saveAs(blob, buildUkrcomFileName('ExpectedExpenses', data.customers, invoiceDateInput));
      toast.success('Expected expenses PDF generated.');
    } catch (generateError) {
      console.error('Unable to generate expected expenses PDF', generateError);
      toast.error(isStaleChunkError(generateError) ? STALE_APP_MESSAGE : 'Unable to generate expected expenses PDF.');
    } finally {
      setIsGeneratingExpectedExpenses(false);
    }
  };

  // Notes ------------------------------------------------------------

  const persistNotes = async (nextNotes, successMessage) => {
    await persistPath(`${INVOICE_DATA_PATH}/notes`, nextNotes, successMessage);
  };

  const updateNote = (index, value) => {
    setData(current => ({
      ...current,
      notes: current.notes.map((note, noteIndex) => (noteIndex === index ? value : note)),
    }));
  };

  const commitNote = () => persistNotes(data.notes, 'Notes updated.');

  const addNote = () => {
    const nextNotes = [...data.notes, ''];
    setData(current => ({ ...current, notes: nextNotes }));
    persistNotes(nextNotes, 'Note added.');
  };

  const removeNote = index => {
    const nextNotes = data.notes.filter((note, noteIndex) => noteIndex !== index);
    setData(current => ({ ...current, notes: nextNotes }));
    persistNotes(nextNotes, 'Note removed.');
  };

  // Tax ------------------------------------------------------------

  const updateTaxPercent = value => {
    setData(current => ({ ...current, taxPercent: value }));
  };

  const commitTaxPercent = () => {
    // Accepts both "8.5" and "8,5" (round4 #5) - comma and period both read as the decimal
    // separator, always stored as a single plain number.
    const value = Number(String(data.taxPercent).replace(',', '.')) || 0;
    setData(current => ({ ...current, taxPercent: value }));
    persistPath(`${INVOICE_DATA_PATH}/taxPercent`, value, 'Tax updated.');
    // 0% is the untouched default, not a deliberately "applied" rate - only genuinely used rates
    // join the recent list, and re-applying an already-saved one just bumps it instead of
    // duplicating it.
    if (value <= 0) return;
    const existing = data.recentTaxRates.find(rate => Number(rate.value) === value);
    const nextRecentTaxRates = existing
      ? touchRecentEntry(data.recentTaxRates, existing.id)
      : upsertRecentEntry(data.recentTaxRates, { id: createEntryId(), value });
    setData(current => ({ ...current, recentTaxRates: nextRecentTaxRates }));
    persistPath(`${INVOICE_DATA_PATH}/recentTaxRates`, nextRecentTaxRates);
  };

  // Applies a saved rate (round4 #5's "last selected as default" - here, a one-click quick-pick
  // rather than a silent auto-fill, so it never overwrites a rate someone is mid-typing).
  const applyRecentTaxRate = rate => {
    setData(current => ({ ...current, taxPercent: rate.value, recentTaxRates: touchRecentEntry(current.recentTaxRates, rate.id) }));
    persistPath(`${INVOICE_DATA_PATH}/taxPercent`, rate.value);
    persistPath(`${INVOICE_DATA_PATH}/recentTaxRates`, touchRecentEntry(data.recentTaxRates, rate.id));
  };

  const removeRecentTaxRate = rateId => {
    const nextRecentTaxRates = removeRecentEntry(data.recentTaxRates, rateId);
    setData(current => ({ ...current, recentTaxRates: nextRecentTaxRates }));
    persistPath(`${INVOICE_DATA_PATH}/recentTaxRates`, nextRecentTaxRates, 'Removed from recent.');
  };

  // Debt / deposit of the previous payment ------------------------------------------------------

  const updateDebtOrDeposit = value => {
    setData(current => ({ ...current, debtOrDeposit: value }));
  };

  const commitDebtOrDeposit = () => {
    const value = Number(String(data.debtOrDeposit).replace(',', '.')) || 0;
    setData(current => ({ ...current, debtOrDeposit: value }));
    persistPath(`${INVOICE_DATA_PATH}/debtOrDeposit`, value, 'Debt/deposit updated.');
  };

  // Upload seed JSON ------------------------------------------------------------

  const handleUploadClick = () => fileInputRef.current?.click();

  // Shared by both upload buttons: accepts either the lean array-of-groups shape (lined up 1:1
  // with the chosen package's default payment schedule - the package itself is inferred from the
  // "idX || Y%" rows inside the groups) or an already-normalized { packageId, packageSnapshot,
  // milestones } plan. Returns the persisted plan, or null if nothing could be built/persisted
  // (a toast has already explained why).
  const uploadExpectedExpenses = async rawExpectedExpenses => {
    let nextPlan;
    if (isRawExpectedExpensesGroups(rawExpectedExpenses)) {
      const { plan, missingPackage, missingSchedule, droppedGroupsCount } = buildExpectedExpensesPlanFromRawGroups(rawExpectedExpenses, {
        catalog: { packages: catalogPackages, technical: catalogTechnical },
        taxPercent: defaultExpectedExpensesTaxPercent,
      });
      if (missingPackage) {
        toast.error('Expected expenses: none of the groups reference a catalog package ("idX || Y%") - nothing was imported.');
        return null;
      }
      if (missingSchedule) {
        toast.error('This package has no payment schedule in the catalog.');
        return null;
      }
      if (droppedGroupsCount) {
        toast.error(`Expected expenses: ${droppedGroupsCount} extra group(s) beyond the package's payment schedule were ignored.`);
      }
      nextPlan = plan;
    } else if (isExpectedExpensesShape(rawExpectedExpenses)) {
      nextPlan = normalizeExpectedExpensesData(rawExpectedExpenses);
    } else {
      return null;
    }
    await set(ref(database, EXPECTED_EXPENSES_PATH), nextPlan);
    setExpectedExpenses(nextPlan);
    return nextPlan;
  };

  const handleFileChange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isInvoiceDataShape(parsed)) {
        toast.error('Upload an invoice-builder JSON with beneficiaries, customers, services, and notes.');
        return;
      }
      const uploadedData = normalizeInvoiceData(parsed);
      // Preserve every payer case stored in the uploaded file, but clone their ids before
      // appending them to local history so an imported backup never collides with existing
      // cases (for example another file that still uses the legacy id). The uploaded active
      // case stays active after import by reordering the combined id list around its clone.
      const uploadedActiveCaseId = uploadedData.payerCaseIds[0];
      const uploadedCases = uploadedData.payerCases.map(payerCase => ({
        id: createEntryId(),
        customers: payerCase.customers,
        sourceId: payerCase.id,
      }));
      const uploadedActiveCase = uploadedCases.find(payerCase => String(payerCase.sourceId) === String(uploadedActiveCaseId))
        || uploadedCases[0];
      const nextPayerCases = [
        ...data.payerCases,
        ...uploadedCases.map(({ sourceId, ...payerCase }) => payerCase),
      ];
      const nextPayerCaseIds = reorderPayerCaseIds(
        [...data.payerCaseIds, ...uploadedCases.map(payerCase => payerCase.id)],
        uploadedActiveCase.id,
      );
      const nextData = {
        ...uploadedData,
        payerCases: nextPayerCases,
        payerCaseIds: nextPayerCaseIds,
        customers: uploadedActiveCase.customers,
        // The issued-invoices history is backend truth, never part of the uploaded template -
        // keep the local record instead of blanking it until the next reload.
        issuedInvoices: data.issuedInvoices,
      };
      await Promise.all([
        set(ref(database, `${INVOICE_DATA_PATH}/beneficiaries`), nextData.beneficiaries),
        set(ref(database, `${INVOICE_DATA_PATH}/beneficiaryIds`), nextData.beneficiaryIds),
        set(ref(database, `${INVOICE_DATA_PATH}/payerCases`), nextData.payerCases),
        set(ref(database, `${INVOICE_DATA_PATH}/payerCaseIds`), nextData.payerCaseIds),
        set(ref(database, `${INVOICE_DATA_PATH}/recentServices`), nextData.recentServices),
        set(ref(database, `${INVOICE_DATA_PATH}/invoiceServices`), nextData.invoiceServices),
        set(ref(database, `${INVOICE_DATA_PATH}/notes`), nextData.notes),
        set(ref(database, `${INVOICE_DATA_PATH}/taxPercent`), nextData.taxPercent),
      ]);
      setData(nextData);
      // The combined invoice-template upload (beneficiaries/customers/services/notes) may also
      // carry an `expectedExpenses` field - build/persist that plan too, in the same upload.
      if (parsed.expectedExpenses !== undefined) {
        await uploadExpectedExpenses(parsed.expectedExpenses);
      }
      toast.success('Invoice JSON uploaded to backend.');
    } catch (uploadError) {
      console.error('Unable to upload invoice JSON', uploadError);
      toast.error('Unable to upload invoice JSON.');
    }
  };

  // Upload a standalone expected-expenses JSON (see src/data/expectedExpensesSeed.json for the
  // normalized shape, or the invoice-template upload for the lean array-of-groups shape) straight
  // into invoiceBuilder/expectedExpenses, replacing any existing plan.
  const handleExpectedExpensesUploadClick = () => expectedExpensesFileInputRef.current?.click();

  const handleExpectedExpensesFileChange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.expectedExpenses !== undefined
        ? parsed.expectedExpenses
        : parsed;
      const nextPlan = await uploadExpectedExpenses(source);
      if (!nextPlan) {
        toast.error('Upload an expected-expenses JSON: either { packageSnapshot, milestones }, or an array of groups.');
        return;
      }
      toast.success('Expected expenses JSON uploaded to backend.');
    } catch (uploadError) {
      console.error('Unable to upload expected expenses JSON', uploadError);
      toast.error('Unable to upload expected expenses JSON.');
    }
  };

  // Generate PDF ------------------------------------------------------------

  const handleGeneratePdf = async () => {
    if (!activeBeneficiary) {
      toast.error('Add a beneficiary first.');
      return;
    }
    if (!data.customers.length) {
      toast.error('Add at least one customer first.');
      return;
    }
    if (!data.invoiceServices.length) {
      toast.error('Add at least one service first.');
      return;
    }
    if (isGenerating) return;
    if (isFormulaRatePending) {
      toast.error('Wait until NBU exchange rates load for formula-priced services.');
      return;
    }
    if (formulaRateError) {
      toast.error(formulaRateError);
      return;
    }
    setIsGenerating(true);
    try {
      const importPromises = [
        import('@react-pdf/renderer'),
        import('./InvoicePdfDocument'),
      ];
      if (generatePaymentDetails) importPromises.push(import('./PaymentDetailsPdfDocument'));
      const [{ pdf }, { default: InvoicePdfDocument }, paymentDetailsModule] = await Promise.all(importPromises);

      const invoiceDisplayDate = new Date(`${invoiceDateInput || getTodayYmd()}T00:00:00`);
      const documentProps = {
        customers: data.customers,
        invoiceServices: data.invoiceServices,
        catalogItemsById,
        priceContext,
        notes: data.notes,
        taxPercent: data.taxPercent,
        debtOrDeposit: data.debtOrDeposit,
        invoiceNumber,
        invoiceDisplayDate,
        dueDate: dueDateInput ? new Date(`${dueDateInput}T00:00:00`) : null,
        generatePaymentDetails,
        includePackageInPdf: data.includePackageInPdf,
        includeScheduleInPdf: data.includeScheduleInPdf,
        spacing: invoiceSpacing,
      };

      // @react-pdf/renderer's WASM layout engine can still be warming up on the
      // very first call after a fresh page load, which fails intermittently -
      // one silent retry clears that without bothering the admin.
      let blob;
      try {
        blob = await pdf(React.createElement(InvoicePdfDocument, documentProps)).toBlob();
      } catch (firstAttemptError) {
        console.error('Invoice PDF generation failed on first attempt, retrying', firstAttemptError);
        blob = await pdf(React.createElement(InvoicePdfDocument, documentProps)).toBlob();
      }
      saveAs(blob, `invoice-${invoiceNumber.replace(/\//g, '-')}.pdf`);

      // Payment Details is always its own file now, generated together with the Invoice so its
      // amount due is guaranteed to stay in sync (spec §3) - never a second page of the invoice.
      if (generatePaymentDetails && paymentDetailsModule) {
        const PaymentDetailsPdfDocument = paymentDetailsModule.default;
        const paymentDetailsProps = {
          beneficiary: activeBeneficiary,
          customers: data.customers,
          invoiceNumber,
          purposeOfPayment,
          amountDue,
        };
        let paymentDetailsBlob;
        try {
          paymentDetailsBlob = await pdf(React.createElement(PaymentDetailsPdfDocument, paymentDetailsProps)).toBlob();
        } catch (firstAttemptError) {
          console.error('Payment details PDF generation failed on first attempt, retrying', firstAttemptError);
          paymentDetailsBlob = await pdf(React.createElement(PaymentDetailsPdfDocument, paymentDetailsProps)).toBlob();
        }
        saveAs(paymentDetailsBlob, buildUkrcomFileName('PaymentDetails', data.customers, invoiceDateInput));
      }

      const nextRecentServices = reorderRecentServices(data.recentServices, data.invoiceServices);

      // Record the generated invoice in the payer's Issued Invoices history (design-tasks-3 §7):
      // display rows/totals are frozen as billed (never re-resolved against the live catalog),
      // the raw entries ride along so Reissue can put them back into the editor.
      const issuedRecord = makeIssuedInvoiceRecord({
        payerCaseId: activePayerCaseId,
        invoiceNumber,
        invoiceDate: invoiceDateInput || getTodayYmd(),
        rows: invoiceServiceRows.map(row => ({
          name: row.name, price: row.price, priceLabel: row.priceLabel, kind: row.kind,
        })),
        entries: data.invoiceServices,
        taxPercent: data.taxPercent,
        debtOrDeposit: data.debtOrDeposit,
        amountDue,
      });
      const nextIssuedInvoices = [issuedRecord, ...data.issuedInvoices];
      setData(current => ({ ...current, recentServices: nextRecentServices, issuedInvoices: nextIssuedInvoices }));
      await Promise.all([
        persistPath(`${INVOICE_DATA_PATH}/recentServices`, nextRecentServices),
        persistPath(`${INVOICE_DATA_PATH}/issuedInvoices`, nextIssuedInvoices),
      ]);

      toast.success(generatePaymentDetails ? 'Invoice and payment details PDFs generated.' : 'Invoice PDF generated.');
    } catch (generateError) {
      console.error('Unable to generate invoice PDF', generateError);
      if (isStaleChunkError(generateError)) {
        toast.error(STALE_APP_MESSAGE);
      } else {
        const reason = generateError?.message ? `: ${generateError.message}` : '';
        toast.error(`Unable to generate invoice PDF${reason}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isInvoiceAdmin) {
    return (
      <Page>
        <Shell>
          <StateCard>This page is only available to admins.</StateCard>
        </Shell>
      </Page>
    );
  }

  return (
    <Page>
      <Shell>
        <Header>
          <div>
            <Eyebrow>Admin only</Eyebrow>
            <Title>Invoice Builder</Title>
          </div>
          <HeaderActions>
            <PageNavMenu />
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {activeTab === 'invoice' ? (
              <>
                <MiniButton type="button" onClick={handleUploadClick} title="Upload an invoice JSON to the backend (an expectedExpenses array of groups is picked up too)">
                  <FaUpload /> Upload JSON
                </MiniButton>
                <PrimaryMiniButton
                  type="button"
                  onClick={handleGeneratePdf}
                  disabled={isGenerateDisabled}
                  title="Generate and download the invoice PDF"
                >
                  <FaFilePdf /> {isGenerating ? 'Generating…' : 'Generate PDF'}
                </PrimaryMiniButton>
              </>
            ) : null}
          </HeaderActions>
        </Header>

        {loading ? <StateCard>Loading invoice data…</StateCard> : null}
        {!loading && error ? <StateCard>{error}</StateCard> : null}
        {!loading && !error && activeTab === 'invoice' && isFormulaRatePending ? <StateCard>Loading NBU exchange rates for formula-priced services…</StateCard> : null}
        {!loading && !error && activeTab === 'invoice' && formulaRateError ? <StateCard>{formulaRateError}</StateCard> : null}

        {!loading && !error ? (
          <>
            {/* round7 spec D: Expected Expenses is a standalone section, structurally separate from
                the regular invoice-creation flow below - never a step inside the same scroll. */}
            <CatalogTabs>
              <CatalogTabButton type="button" $active={activeTab === 'invoice'} onClick={() => setActiveTab('invoice')}>
                Invoice
              </CatalogTabButton>
              <CatalogTabButton type="button" $active={activeTab === 'expected-expenses'} onClick={() => setActiveTab('expected-expenses')}>
                Expected expenses
              </CatalogTabButton>
            </CatalogTabs>

            {activeTab === 'invoice' ? (
              <>
            <Panel>
              <CompactSection
                $expanded={beneficiaryExpanded}
                onClick={() => setBeneficiaryExpanded(current => !current)}
                role="button"
                aria-expanded={beneficiaryExpanded}
              >
                <CompactInfo>
                  <CompactLabel>Beneficiary</CompactLabel>
                  <CompactValue>
                    {[activeBeneficiary?.title, activeBeneficiary?.bankName].filter(Boolean).join(' · ') || 'No beneficiary yet'}
                  </CompactValue>
                </CompactInfo>
                <CompactChevron>{beneficiaryExpanded ? 'Hide ›' : 'Edit ›'}</CompactChevron>
              </CompactSection>
              {beneficiaryExpanded ? (
                <>
                  <PanelHeading>
                    <H2>Beneficiary</H2>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <SmallButton type="button" onClick={addBeneficiary}><FaPlus /> Add</SmallButton>
                      <DangerButton type="button" onClick={deleteActiveBeneficiary}><FaTrash /> Delete</DangerButton>
                    </div>
                  </PanelHeading>
                  <FieldRow>
                    <FieldTag>Active</FieldTag>
                    <PlainSelect value={activeBeneficiary?.id || ''} onChange={event => handleSelectBeneficiary(event.target.value)}>
                      {data.beneficiaries.map(beneficiary => (
                        <option key={beneficiary.id} value={beneficiary.id}>{beneficiary.title || beneficiary.id}</option>
                      ))}
                    </PlainSelect>
                  </FieldRow>
                  {activeBeneficiary ? (
                    <>
                      <StackedFieldRow>
                        <AutoTextArea
                          $bare
                          style={{ width: '100%' }}
                          placeholder="Title"
                          value={activeBeneficiary.title || ''}
                          aria-label="Title"
                          onChange={event => updateActiveBeneficiaryField('title', event.target.value)}
                          onBlur={event => persistActiveBeneficiaryField('title', event.target.value)}
                        />
                      </StackedFieldRow>
                      <StackedFieldRow>
                        <AutoTextArea
                          $bare
                          style={{ width: '100%' }}
                          placeholder="Address"
                          value={activeBeneficiary.address || ''}
                          aria-label="Address"
                          onChange={event => updateActiveBeneficiaryField('address', event.target.value)}
                          onBlur={event => persistActiveBeneficiaryField('address', event.target.value)}
                        />
                      </StackedFieldRow>
                      <StackedFieldRow>
                        <AutoTextArea
                          $bare
                          style={{ width: '100%' }}
                          placeholder="IBAN"
                          value={activeBeneficiary.iban || ''}
                          aria-label="IBAN"
                          onChange={event => updateActiveBeneficiaryField('iban', event.target.value)}
                          onBlur={event => persistActiveBeneficiaryField('iban', event.target.value)}
                        />
                      </StackedFieldRow>
                      <StackedFieldRow>
                        <AutoTextArea
                          $bare
                          style={{ width: '100%' }}
                          placeholder="Bank name"
                          value={activeBeneficiary.bankName || ''}
                          aria-label="Bank name"
                          onChange={event => updateActiveBeneficiaryField('bankName', event.target.value)}
                          onBlur={event => persistActiveBeneficiaryField('bankName', event.target.value)}
                        />
                      </StackedFieldRow>
                      <StackedFieldRow>
                        <AutoTextArea
                          $bare
                          style={{ width: '100%' }}
                          placeholder="SWIFT code"
                          value={activeBeneficiary.swiftCode || ''}
                          aria-label="SWIFT code"
                          onChange={event => updateActiveBeneficiaryField('swiftCode', event.target.value)}
                          onBlur={event => persistActiveBeneficiaryField('swiftCode', event.target.value)}
                        />
                      </StackedFieldRow>
                      <StackedFieldRow>
                        <StackedFieldHeader>
                          <ModeToggleGroup>
                            <ModeToggleOption
                              type="button"
                              $active={paymentPurposeViewMode === 'template'}
                              onClick={() => setPaymentPurposeViewMode('template')}
                              title="Edit the raw template, with {{invoiceNumber}}/{{invoiceDate}} placeholders"
                            >
                              Template
                            </ModeToggleOption>
                            <ModeToggleOption
                              type="button"
                              $active={paymentPurposeViewMode === 'data'}
                              onClick={() => setPaymentPurposeViewMode('data')}
                              title="Preview what the placeholders currently resolve to"
                            >
                              Data
                            </ModeToggleOption>
                          </ModeToggleGroup>
                        </StackedFieldHeader>
                        {paymentPurposeViewMode === 'template' ? (
                          <AutoTextArea
                            $bare
                            style={{ width: '100%' }}
                            value={activeBeneficiary.paymentPurpose || ''}
                            placeholder="Payment purpose - {{invoiceNumber}} and {{invoiceDate}} are filled in automatically"
                            aria-label="Payment purpose"
                            onChange={event => updateActiveBeneficiaryField('paymentPurpose', event.target.value)}
                            onBlur={event => persistActiveBeneficiaryField('paymentPurpose', event.target.value)}
                          />
                        ) : (
                          <PurposePreview aria-label="Payment purpose (resolved preview)">
                            {purposeOfPayment || 'Nothing to preview yet - write a payment purpose template first.'}
                          </PurposePreview>
                        )}
                      </StackedFieldRow>
                    </>
                  ) : null}
                </>
              ) : null}
            </Panel>

            <Panel>
              <CompactSection
                $expanded={payerExpanded}
                onClick={() => setPayerExpanded(current => !current)}
                role="button"
                aria-expanded={payerExpanded}
              >
                <CompactInfo>
                  <CompactLabel>Payer</CompactLabel>
                  <CompactValue>{[payerName, payerLocation].filter(Boolean).join(' · ') || 'No payer yet'}</CompactValue>
                </CompactInfo>
                <CompactChevron>{payerExpanded ? 'Hide ›' : 'Edit ›'}</CompactChevron>
              </CompactSection>
              {payerExpanded ? (
                <>
                  <PanelHeading>
                    <H2>Payer (customers)</H2>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <SmallButton type="button" onClick={addCustomer}><FaPlus /> Add customer</SmallButton>
                      <SmallButton type="button" onClick={startNewPayerCase}><FaPlus /> New case</SmallButton>
                      <DangerButton type="button" onClick={deleteActivePayerCase}><FaTrash /> Delete case</DangerButton>
                    </div>
                  </PanelHeading>
                  <FieldRow>
                    <FieldTag>Active case</FieldTag>
                    <PlainSelect value={activePayerCaseId || ''} onChange={event => selectPayerCase(event.target.value)}>
                      {data.payerCaseIds.map(id => {
                        const payerCase = data.payerCases.find(candidate => String(candidate.id) === String(id));
                        if (!payerCase) return null;
                        return (
                          <option key={id} value={id}>{buildPayerName(payerCase.customers) || `Case ${id}`}</option>
                        );
                      })}
                    </PlainSelect>
                  </FieldRow>
                  <PanelNote>{`Payer: ${payerName || '—'} · ${caseTitle}`}</PanelNote>
                  {data.customers.map((customer, index) => (
                    <CustomerBlock key={`customer-${index}`}>
                      <StackedFieldHeader>
                        <IconDangerButton type="button" onClick={() => removeCustomer(index)} title="Remove customer" aria-label="Remove customer" style={{ marginLeft: 'auto' }}>
                          <FaTrash />
                        </IconDangerButton>
                      </StackedFieldHeader>
                      <StackedFieldRow>
                        <AutoTextArea
                          $bare
                          style={{ width: '100%' }}
                          placeholder="Name"
                          value={customer.name || ''}
                          aria-label={`Customer ${index + 1} name`}
                          onChange={event => updateCustomerField(index, 'name', event.target.value)}
                          onBlur={() => persistCustomers(data.customers, 'Customer updated.')}
                        />
                      </StackedFieldRow>
                      <StackedFieldRow>
                        <AutoTextArea
                          $bare
                          style={{ width: '100%' }}
                          placeholder="Address / country"
                          value={customer.address || ''}
                          aria-label={`Customer ${index + 1} address`}
                          onChange={event => updateCustomerField(index, 'address', event.target.value)}
                          onBlur={() => persistCustomers(data.customers, 'Customer updated.')}
                        />
                      </StackedFieldRow>
                    </CustomerBlock>
                  ))}
                </>
              ) : null}
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Package & PDF components</H2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <SmallButton
                    type="button"
                    onClick={saveServicesForPayer}
                    title="Save the current package & services on the backend, tied to this payer"
                  >
                    <FaSave /> Save for payer
                  </SmallButton>
                  {copySourcePayerCases.length ? (
                    <SmallButtonSelect title="Copy the package & services saved for another payer">
                      <FaCopy /> Copy from payer
                      <select
                        aria-label="Copy package & services from another payer"
                        value=""
                        onChange={event => { if (event.target.value) copyServicesFromPayer(event.target.value); }}
                      >
                        <option value="">Copy from payer…</option>
                        {copySourcePayerCases.map(payerCase => (
                          <option key={payerCase.id} value={payerCase.id}>
                            {buildPayerName(payerCase.customers) || `Case ${payerCase.id}`}
                          </option>
                        ))}
                      </select>
                    </SmallButtonSelect>
                  ) : null}
                </div>
              </PanelHeading>

              <FieldRow $align="center">
                {/* The label wraps only the checkbox (design-tasks-2 §2): clicking the package
                    name or anywhere else on the row must never toggle PDF inclusion. */}
                <label style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    aria-label="Include the package in the PDF"
                    checked={data.includePackageInPdf}
                    onChange={event => setIncludePackageInPdf(event.target.checked)}
                  />
                </label>
                <PackageToggleName title={packageRow?.name || 'Package'}>
                  {packageRow?.name || 'Package'}
                </PackageToggleName>
                {data.includePackageInPdf && packageRow ? (
                  /* Switch-package action (design-tasks-2 §2): a real button at the end of the
                     name row; picking a different programme replaces the current package
                     outright, same as removing it and adding the new one in a single step. */
                  <PackageSwitchButton title="Switch package from catalog">
                    <FaChevronDown aria-hidden />
                    <select
                      aria-label="Switch package from catalog"
                      value=""
                      onChange={event => {
                        const pkg = visibleCatalogPackages.find(candidate => String(candidate.id) === event.target.value);
                        if (pkg) replacePackageEntry(pkg);
                      }}
                    >
                      <option value="">Switch package from catalog…</option>
                      {visibleCatalogPackages
                        .filter(pkg => String(pkg.id) !== String(packageRow.catalogId))
                        .map(pkg => (
                          <option key={pkg.id} value={pkg.id}>{pkg.hidden ? `${pkg.name} (Special offer)` : pkg.name}</option>
                        ))}
                    </select>
                  </PackageSwitchButton>
                ) : null}
              </FieldRow>

              {data.includePackageInPdf ? (
                packageRow ? (
                  <>
                  <PackageEntryCard
                    row={packageRow}
                    catalogItems={catalogItems}
                    onCommitField={(field, value) => commitTopLevelField(packageRow.id, field, value)}
                    onRemove={() => removeTopLevelEntry(packageRow.id)}
                    onReset={packageRow.catalogId && packageRow.isCustomized ? () => resetTopLevelEntry(packageRow.id) : undefined}
                    onCommitChildField={(childId, field, value) => commitPackageChildField(packageRow.id, childId, field, value)}
                    onResetChildField={childId => resetPackageChildEntry(packageRow.id, childId)}
                    onRemoveChild={childId => removePackageChildEntry(packageRow.id, childId)}
                    onMoveChild={(childId, offset) => movePackageChildEntry(packageRow.id, childId, offset)}
                    onAddCustomChild={fields => addCustomChildEntry(packageRow.id, fields)}
                    onAddCatalogChild={catalogId => addCatalogChildEntry(packageRow.id, catalogId)}
                  />
                  {/* A catalog package's price is normally a reference figure only (the actual
                      charge is a separate "% of package" row in Other expenses) - but some
                      packages (e.g. a lump-sum "Initial payment" special offer) already *are*
                      the whole charge, with no percent row to carry it. This checkbox bills the
                      package's own price directly instead of requiring one. A custom package
                      (no catalogId) is always billed already, so it never needs this toggle. */}
                  {packageRow.catalogId ? (
                    <FieldRow $align="center" style={{ marginTop: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(packageRow.billDirectly)}
                          onChange={event => commitTopLevelField(packageRow.id, 'billDirectly', event.target.checked)}
                        />
                        <span>Bill package price on this invoice</span>
                      </label>
                    </FieldRow>
                  ) : null}
                  </>
                ) : (
                  <>
                    <FieldRow $align="center" style={{ marginTop: 8 }}>
                      <PlainTextBase
                        rows={1}
                        placeholder="New custom package name"
                        value={newCustomPackageName}
                        onChange={event => setNewCustomPackageName(event.target.value)}
                      />
                      <SmallButton
                        type="button"
                        title="A package with no Budget catalog entry - saved fully on this invoice"
                        onClick={addCustomPackageEntry}
                      >
                        <FaLayerGroup /> Add custom package
                      </SmallButton>
                    </FieldRow>
                    <div style={{ marginTop: 8 }}>
                      <PlainSelect
                        aria-label="Choose package from catalog"
                        value=""
                        onChange={event => {
                          const pkg = visibleCatalogPackages.find(candidate => String(candidate.id) === event.target.value);
                          if (pkg) addCatalogPackageEntry(pkg);
                        }}
                      >
                        <option value="">Choose package from catalog…</option>
                        {visibleCatalogPackages.map(pkg => (
                          <option key={pkg.id} value={pkg.id}>{pkg.hidden ? `${pkg.name} (Special offer)` : pkg.name}</option>
                        ))}
                      </PlainSelect>
                      {!visibleCatalogPackages.length ? <PanelNote style={{ margin: '8px 0 0' }}>No packages in the catalog.</PanelNote> : null}
                    </div>
                  </>
                )
              ) : null}

              <FieldRow $align="center" style={{ marginTop: 10 }}>
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: scheduleCheckboxDisabled ? 'not-allowed' : 'pointer', opacity: scheduleCheckboxDisabled ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={data.includeScheduleInPdf}
                    disabled={scheduleCheckboxDisabled}
                    onChange={event => setIncludeScheduleInPdf(event.target.checked)}
                  />
                  <span>Payment schedule</span>
                </label>
              </FieldRow>

              {data.includeScheduleInPdf && packageRow ? (
                <div style={{ marginTop: 4 }}>
                  {(catalogTechnical.paymentSchedules || []).length ? (
                    <PlainSelect
                      aria-label="Apply a payment schedule from the catalog"
                      value=""
                      onChange={event => { if (event.target.value) applyCatalogPaymentSchedule(event.target.value); }}
                      style={{ marginBottom: 8 }}
                    >
                      <option value="">Apply schedule from catalog…</option>
                      {catalogTechnical.paymentSchedules.map(schedule => (
                        <option key={schedule.id} value={schedule.id}>
                          {`${schedule.id} (${(schedule.payments || []).length} payment${(schedule.payments || []).length === 1 ? '' : 's'})`}
                        </option>
                      ))}
                    </PlainSelect>
                  ) : null}
                  {packageRow.scheduleRows.map((row, index) => (
                    <ScheduleRow key={row.key} row={row} index={index} onCommit={updateScheduleRow} onRemove={removeScheduleRow} />
                  ))}
                  {!packageRow.scheduleRows.length ? <PanelNote style={{ margin: '8px 0' }}>No payments yet.</PanelNote> : null}
                  <SmallButton type="button" style={{ marginTop: 6 }} onClick={addScheduleRow}>
                    <FaPlus /> Add payment
                  </SmallButton>
                </div>
              ) : null}

              <FieldRow $align="center" style={{ marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={generatePaymentDetails}
                    onChange={event => setGeneratePaymentDetails(event.target.checked)}
                  />
                  <span>Payment details (separate PDF)</span>
                </label>
              </FieldRow>
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Other expenses</H2>
              </PanelHeading>

              {/* Same row component and sizing as a package item row in Package & PDF components
                  (design-tasks-2 §6): custom lines, catalog items, and "% of package" shares all
                  read as one list style. */}
              {serviceLineRows.map((row, index) => (
                <ServiceLineRow
                  key={row.key}
                  row={row}
                  index={index}
                  isChild
                  catalogPackages={visibleCatalogPackages}
                  onCommit={(field, value) => commitTopLevelField(row.id, field, value)}
                  onRemove={() => removeTopLevelEntry(row.id)}
                  onMoveUp={() => moveTopLevelEntry(row.id, -1)}
                  onMoveDown={() => moveTopLevelEntry(row.id, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < serviceLineRows.length - 1}
                  onReset={row.kind === 'item' && row.isCustomized ? () => resetTopLevelEntry(row.id) : undefined}
                />
              ))}
              {!serviceLineRows.length ? <PanelNote style={{ margin: 0 }}>No other expenses on this invoice yet.</PanelNote> : null}

              <div style={{ marginTop: 8 }}>
                <CustomLineAdder
                  addOnBlur
                  catalogItems={catalogItems}
                  excludeCatalogIds={usedCatalogItemIds}
                  priceContext={priceContext}
                  onAddCustom={addCustomServiceEntry}
                  onAddCatalogItem={addCatalogServiceEntry}
                  catalogPackages={availablePercentPackages}
                  onAddCatalogPackagePercent={pkg => addPercentServiceEntry(pkg.id)}
                  extraButtons={percentSharePackage ? (
                    <SmallButton
                      type="button"
                      title="Add a share of this invoice's package price (e.g. 20%)"
                      onClick={() => addPercentServiceEntry(percentSharePackage.catalogId)}
                    >
                      <FaPlus /> % From package
                    </SmallButton>
                  ) : null}
                />
              </div>

              {recentServiceSuggestions.length ? (
                <>
                  <PanelNote style={{ marginTop: 14, marginBottom: 4 }}>Recent (click to add)</PanelNote>
                  <ChipRow>
                    {recentServiceSuggestions.map(entry => {
                      const resolved = resolveServiceRow(entry, catalogItemsById, priceContext);
                      // Small-print composition line so a saved custom package can be told apart
                      // from another without expanding it (round4 #3.1).
                      const composition = entry.kind === 'package'
                        ? (resolved.children || []).map(child => child.name).filter(Boolean).join(', ')
                        : '';
                      return (
                        <ChipContainer key={entry.id}>
                          <ChipButton type="button" onClick={() => addRecentServiceEntry(entry)}>
                            <span>
                              {entry.kind === 'package' ? <FaLayerGroup style={{ marginRight: 4 }} /> : null}
                              {resolved.name} · {formatEuroPreview(resolved.price)}
                            </span>
                            {composition ? <ChipComposition>{composition}</ChipComposition> : null}
                          </ChipButton>
                          <ChipDeleteButton
                            type="button"
                            onClick={() => removeRecentServiceEntry(entry.id)}
                            title="Remove from recent"
                            aria-label="Remove from recent"
                          >
                            <FaTrash />
                          </ChipDeleteButton>
                        </ChipContainer>
                      );
                    })}
                  </ChipRow>
                </>
              ) : null}
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Summary</H2>
              </PanelHeading>
              <FieldRow>
                <FieldTag>Invoice date</FieldTag>
                <input
                  type="date"
                  value={invoiceDateInput}
                  onChange={event => setInvoiceDateInput(event.target.value)}
                  style={{
                    flex: '0 0 auto', border: 'none', background: 'transparent', color: 'var(--km-text)', font: 'inherit', fontWeight: 700, padding: '5px 6px', borderRadius: 6,
                  }}
                />
              </FieldRow>
              <FieldRow>
                <FieldTag title="Shown in the invoice's Amount Due block. Leave empty for 'Payable upon receipt'.">Due date</FieldTag>
                <input
                  type="date"
                  value={dueDateInput}
                  onChange={event => setDueDateInput(event.target.value)}
                  aria-label="Due date (empty = payable upon receipt)"
                  style={{
                    flex: '0 0 auto', border: 'none', background: 'transparent', color: 'var(--km-text)', font: 'inherit', fontWeight: 700, padding: '5px 6px', borderRadius: 6,
                  }}
                />
              </FieldRow>
              <FieldRow>
                <FieldTag>Taxes (%)</FieldTag>
                <PlainPriceBase
                  rows={1}
                  inputMode="decimal"
                  aria-label="Taxes (%)"
                  value={data.taxPercent}
                  onChange={event => updateTaxPercent(event.target.value)}
                  onBlur={commitTaxPercent}
                  style={{ flex: '0 0 auto' }}
                />
              </FieldRow>
              {data.recentTaxRates.length ? (
                <ChipRow style={{ marginTop: 0, marginBottom: 8 }}>
                  {data.recentTaxRates.map(rate => (
                    <ChipContainer key={rate.id}>
                      <ChipButton type="button" onClick={() => applyRecentTaxRate(rate)}>
                        <span>{rate.value}%</span>
                      </ChipButton>
                      <ChipDeleteButton
                        type="button"
                        onClick={() => removeRecentTaxRate(rate.id)}
                        title="Remove this rate from recent"
                        aria-label="Remove this rate from recent"
                      >
                        <FaTrash />
                      </ChipDeleteButton>
                    </ChipContainer>
                  ))}
                </ChipRow>
              ) : null}
              <FieldRow>
                <FieldTag title="Applied after tax. Positive = debt owed from before, negative = deposit/credit.">Debt/Deposit</FieldTag>
                <PlainPriceBase
                  rows={1}
                  inputMode="decimal"
                  value={data.debtOrDeposit}
                  onChange={event => updateDebtOrDeposit(event.target.value)}
                  onBlur={commitDebtOrDeposit}
                  style={{ flex: '0 0 auto' }}
                />
              </FieldRow>
              <SummaryGrid style={{ marginTop: 10 }}>
                <SummaryLine><span>Subtotal</span><span>{formatEuroPreview(subtotal)}</span></SummaryLine>
                {data.debtOrDeposit ? (
                  <SummaryLine>
                    <span>{data.debtOrDeposit > 0 ? 'Debt of the previous payment' : 'Deposit of the previous payment'}</span>
                    <span>{`${data.debtOrDeposit > 0 ? '+' : '-'}${formatEuroPreview(Math.abs(data.debtOrDeposit))}`}</span>
                  </SummaryLine>
                ) : null}
                <SummaryLine><span>Amount to be paid</span><span>{formatEuroPreview(amountDue)}</span></SummaryLine>
              </SummaryGrid>
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Notes</H2>
                <SmallButton type="button" onClick={addNote}><FaPlus /> Add note</SmallButton>
              </PanelHeading>
              {data.notes.map((note, index) => (
                <StackedFieldRow key={`note-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AutoTextArea
                    $bare
                    style={{ width: '100%' }}
                    value={note}
                    aria-label={`Note ${index + 1}`}
                    onChange={event => updateNote(index, event.target.value)}
                    onBlur={commitNote}
                  />
                  <IconDangerButton type="button" onClick={() => removeNote(index)} title="Remove note" aria-label="Remove note">
                    <FaTrash />
                  </IconDangerButton>
                </StackedFieldRow>
              ))}
              {!data.notes.length ? <PanelNote style={{ margin: 0 }}>No notes yet.</PanelNote> : null}
            </Panel>

            {/* Spacing (batch 12 §1): a lighter version of the Documents Builder's Format panel -
                only the vertical gap between blocks (header/Breakdown/Amount due) is tunable here;
                fonts, margins and everything else on the branded Invoice PDF stay fixed. */}
            <Panel>
              <CompactSection
                $expanded={invoiceSpacingExpanded}
                onClick={() => setInvoiceSpacingExpanded(current => !current)}
                role="button"
                aria-expanded={invoiceSpacingExpanded}
              >
                <CompactInfo>
                  <CompactLabel>Spacing</CompactLabel>
                  <CompactValue>
                    {Object.values(invoiceSpacing).some(value => value !== undefined) ? 'Custom block spacing' : 'Default block spacing'}
                  </CompactValue>
                </CompactInfo>
                <CompactChevron>{invoiceSpacingExpanded ? 'Hide ›' : 'Edit ›'}</CompactChevron>
              </CompactSection>
              {invoiceSpacingExpanded ? (
                <>
                  <PanelHeading>
                    <H2>Spacing</H2>
                  </PanelHeading>
                  <SpacingField
                    label="Above Breakdown (pt)"
                    value={invoiceSpacing.aboveBreakdown}
                    placeholder="auto"
                    onCommit={value => setInvoiceSpacing(current => ({ ...current, aboveBreakdown: value }))}
                  />
                  <SpacingField
                    label="Above Amount due (pt)"
                    value={invoiceSpacing.aboveAmountDue}
                    placeholder="20"
                    onCommit={value => setInvoiceSpacing(current => ({ ...current, aboveAmountDue: value }))}
                  />
                </>
              ) : null}
            </Panel>

            {/* Issued Invoices (design-tasks-3 §7): a click-to-reveal block at the bottom of the
                page - the same collapsed-summary pattern Beneficiary/Payer use - listing every
                invoice ever generated for the active payer, read-only, newest first. */}
            <Panel>
              <CompactSection
                $expanded={issuedInvoicesOpen}
                onClick={() => setIssuedInvoicesOpen(current => !current)}
                role="button"
                aria-expanded={issuedInvoicesOpen}
              >
                <CompactInfo>
                  <CompactLabel>Issued invoices</CompactLabel>
                  <CompactValue>
                    {payerIssuedInvoices.length
                      ? `${payerIssuedInvoices.length} invoice${payerIssuedInvoices.length === 1 ? '' : 's'} · ${payerName || 'this payer'}`
                      : 'No invoices issued for this payer yet'}
                  </CompactValue>
                </CompactInfo>
                <CompactChevron>{issuedInvoicesOpen ? 'Hide ›' : 'Show ›'}</CompactChevron>
              </CompactSection>
              {issuedInvoicesOpen ? (
                <>
                  {payerIssuedInvoices.map(record => (
                    <IssuedInvoiceCard
                      key={record.id}
                      record={record}
                      exchangeRates={exchangeRates}
                      onCommitPayment={(field, value) => commitIssuedInvoicePayment(record.id, field, value)}
                      onReissue={() => reissueInvoice(record)}
                      onDelete={() => deleteIssuedInvoice(record)}
                    />
                  ))}
                  {!payerIssuedInvoices.length ? <PanelNote style={{ margin: 0 }}>No invoices issued for this payer yet.</PanelNote> : null}
                </>
              ) : null}
            </Panel>
              </>
            ) : null}

            {activeTab === 'expected-expenses' ? (
              <>
            <Panel>
              <PanelHeading>
                <H2>Expected expenses</H2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    ref={expectedExpensesFileInputRef}
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={handleExpectedExpensesFileChange}
                  />
                  <SmallButton
                    type="button"
                    onClick={handleExpectedExpensesUploadClick}
                    title="Upload an expected-expenses JSON: { packageSnapshot, milestones } or an array of groups lined up with the package's schedule"
                  >
                    <FaUpload /> Upload JSON
                  </SmallButton>
                  {expectedExpenses ? (
                    <>
                      {expectedExpenses.packageId ? (
                        <SmallButton type="button" onClick={recalculateExpectedExpensesSchedule}>
                          <FaSyncAlt /> Recalculate
                        </SmallButton>
                      ) : null}
                      <PrimaryMiniButton
                        type="button"
                        onClick={handleGenerateExpectedExpensesPdf}
                        disabled={isExpectedExpensesGenerateDisabled}
                        title={isExpectedExpensesFormulaRatePending
                          ? 'Waiting for the package price formula to resolve…'
                          : 'Generate the full payment-schedule forecast PDF'}
                      >
                        <FaFilePdf /> {isGeneratingExpectedExpenses ? 'Generating…' : 'Generate PDF'}
                      </PrimaryMiniButton>
                      <DangerButton type="button" onClick={deleteExpectedExpensesPlan}><FaTrash /> Delete plan</DangerButton>
                    </>
                  ) : null}
                </div>
              </PanelHeading>
              {!expectedExpenses ? (
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <SmallButton type="button" onClick={() => setShowExpectedExpensesPicker(current => !current)}>
                      <FaLayerGroup /> {showExpectedExpensesPicker ? 'Hide packages' : 'Choose a package'}
                    </SmallButton>
                    <SmallButton type="button" onClick={() => setShowCustomSchedulePicker(current => !current)}>
                      <FaLayerGroup /> {showCustomSchedulePicker ? 'Hide custom schedule' : 'Custom package/schedule'}
                    </SmallButton>
                  </div>
                  {showExpectedExpensesPicker ? (
                    <CatalogPickerList style={{ marginTop: 8 }}>
                      {visibleCatalogPackages.map(pkg => (
                        <CatalogPickerButton key={pkg.id} type="button" onClick={() => createExpectedExpensesPlan(pkg)}>
                          <span><FaLayerGroup style={{ marginRight: 6 }} />{pkg.name}{pkg.hidden ? <SpecialOfferBadge>Special offer</SpecialOfferBadge> : null}</span>
                          <span>{formatEuroPreview(resolveBudgetPriceAmount(pkg.listedPrice, priceContext) ?? pkg.listedPrice)}</span>
                        </CatalogPickerButton>
                      ))}
                      {!visibleCatalogPackages.length ? <PanelNote style={{ margin: 0 }}>No packages in the catalog.</PanelNote> : null}
                    </CatalogPickerList>
                  ) : null}
                  {showCustomSchedulePicker ? (
                    <div style={{ marginTop: 8 }}>
                      <FieldRow $align="center">
                        <PlainTextBase
                          rows={1}
                          placeholder="Package name"
                          value={customPlanPackageName}
                          onChange={event => setCustomPlanPackageName(event.target.value)}
                        />
                        <PlainPriceBase
                          rows={1}
                          placeholder="Total price"
                          inputMode="decimal"
                          value={customPlanPackagePrice}
                          onChange={event => setCustomPlanPackagePrice(event.target.value)}
                        />
                      </FieldRow>
                      {customScheduleRows.map((row, index) => (
                        <FieldRow key={`schedule-row-${index}`} $align="center">
                          <PlainTextBase
                            rows={1}
                            placeholder="Payment title"
                            value={row.title}
                            onChange={event => updateCustomScheduleRow(index, 'title', event.target.value)}
                          />
                          <PlainPriceBase
                            rows={1}
                            placeholder="Amount"
                            inputMode="decimal"
                            value={row.amount}
                            onChange={event => updateCustomScheduleRow(index, 'amount', event.target.value)}
                          />
                          <IconDangerButton
                            type="button"
                            onClick={() => removeCustomScheduleRow(index)}
                            title="Remove this row"
                            aria-label="Remove this row"
                          >
                            <FaTrash />
                          </IconDangerButton>
                        </FieldRow>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <SmallButton type="button" onClick={addCustomScheduleRow}><FaPlus /> Add row</SmallButton>
                        <PrimaryMiniButton type="button" onClick={createExpectedExpensesPlanFromCustomSchedule}>
                          Create plan
                        </PrimaryMiniButton>
                      </div>
                      {data.recentPaymentSchedules.length ? (
                        <>
                          <PanelNote style={{ marginTop: 14, marginBottom: 4 }}>Recent schedules (click to load)</PanelNote>
                          <ChipRow>
                            {data.recentPaymentSchedules.map(scheduleEntry => (
                              <ChipContainer key={scheduleEntry.id}>
                                <ChipButton type="button" onClick={() => loadRecentSchedule(scheduleEntry)}>
                                  <span>{scheduleEntry.name || 'Custom schedule'}</span>
                                  <ChipComposition>{scheduleEntry.payments.map(payment => payment.title).join(', ')}</ChipComposition>
                                </ChipButton>
                                <ChipDeleteButton
                                  type="button"
                                  onClick={() => removeRecentSchedule(scheduleEntry.id)}
                                  title="Remove this schedule from recent"
                                  aria-label="Remove this schedule from recent"
                                >
                                  <FaTrash />
                                </ChipDeleteButton>
                              </ChipContainer>
                            ))}
                          </ChipRow>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <FieldRow $align="center">
                    <FieldTag>Package</FieldTag>
                    {expectedExpenses.packageId ? (
                      <PlainSelect
                        aria-label="Switch the plan to a different package"
                        value={String(expectedExpenses.packageId)}
                        onChange={event => switchExpectedExpensesPackage(event.target.value)}
                      >
                        {!visibleCatalogPackages.some(pkg => String(pkg.id) === String(expectedExpenses.packageId)) ? (
                          <option value={String(expectedExpenses.packageId)}>
                            {expectedExpensesView?.pkg?.name || `Package ${expectedExpenses.packageId}`}
                          </option>
                        ) : null}
                        {visibleCatalogPackages.map(pkg => (
                          <option key={pkg.id} value={pkg.id}>{pkg.hidden ? `${pkg.name} (Special offer)` : pkg.name}</option>
                        ))}
                      </PlainSelect>
                    ) : (
                      <div style={{ flex: 1, padding: '0 2px', fontWeight: 700, lineHeight: '20px' }}>{expectedExpensesView?.pkg?.name || expectedExpenses.packageId}</div>
                    )}
                    <span style={{ fontWeight: 800, color: 'var(--km-accent)', padding: '0 2px', lineHeight: '20px' }}>
                      {formatEuroPreview(resolveBudgetPriceAmount(expectedExpensesView?.pkg?.listedPrice, priceContext) ?? expectedExpensesView?.pkg?.listedPrice)}
                    </span>
                  </FieldRow>
                  {expectedExpenses.packageId && (catalogTechnical.paymentSchedules || []).length ? (
                    <FieldRow $align="center">
                      <FieldTag>Payment schedule</FieldTag>
                      <PlainSelect
                        aria-label="Apply a payment schedule from the catalog"
                        value=""
                        onChange={event => { if (event.target.value) applyExpectedExpensesSchedule(event.target.value); }}
                      >
                        <option value="">Apply schedule from catalog…</option>
                        {catalogTechnical.paymentSchedules.map(schedule => (
                          <option key={schedule.id} value={schedule.id}>
                            {`${schedule.id} (${(schedule.payments || []).length} payment${(schedule.payments || []).length === 1 ? '' : 's'})`}
                          </option>
                        ))}
                      </PlainSelect>
                    </FieldRow>
                  ) : null}
                  <FieldRow $align="center">
                    <FieldTag>Tax (%)</FieldTag>
                    <AutoTextArea
                      as={PlainPriceBase}
                      $width="48px"
                      inputMode="decimal"
                      value={expectedExpensesTaxDraft}
                      placeholder="0"
                      aria-label="Tax percent for all milestones"
                      onFocus={() => { expectedExpensesTaxEditingRef.current = true; }}
                      onChange={event => setExpectedExpensesTaxDraft(event.target.value)}
                      onBlur={() => {
                        expectedExpensesTaxEditingRef.current = false;
                        if (expectedExpensesTaxDraft !== (expectedExpensesView?.sharedTaxPercent ?? '')) {
                          applyExpectedExpensesTaxPercent(expectedExpensesTaxDraft);
                        }
                      }}
                    />
                  </FieldRow>
                  {data.recentTaxRates.length ? (
                    <ChipRow style={{ marginTop: 0, marginBottom: 8 }}>
                      {data.recentTaxRates.map(rate => (
                        <ChipContainer key={rate.id}>
                          <ChipButton type="button" onClick={() => applyExpectedExpensesTaxPercent(rate.value)}>
                            <span>{rate.value}%</span>
                          </ChipButton>
                          <ChipDeleteButton
                            type="button"
                            onClick={() => removeRecentTaxRate(rate.id)}
                            title="Remove this rate from recent"
                            aria-label="Remove this rate from recent"
                          >
                            <FaTrash />
                          </ChipDeleteButton>
                        </ChipContainer>
                      ))}
                    </ChipRow>
                  ) : null}
                  {expectedExpensesView?.shouldCheckPackageSharePercent && Math.round(expectedExpensesView.packageSharePercent * 100) / 100 !== 100 ? (
                    <PanelNote style={{ color: 'var(--km-danger)' }}>
                      The percent-of-package rows add up to {expectedExpensesView.packageSharePercent}% of the package price, not 100%.
                    </PanelNote>
                  ) : null}
                  <PanelNote>
                    Plan totals {formatEuroPreview(expectedExpensesView?.totalPlanned)} across all milestones (package share + extras).
                  </PanelNote>

                  {expectedExpensesView?.milestoneRows.map(({ milestone, serviceRows, subtotal, amountDue }, index) => (
                    <MilestoneCard
                      key={`${expectedExpenses.packageId}-${index}`}
                      index={index}
                      milestone={milestone}
                      serviceRows={serviceRows}
                      subtotal={subtotal}
                      amountDue={amountDue}
                      catalogItems={catalogItems}
                      catalogPackages={visibleCatalogPackages}
                      onCommitField={(field, value) => commitMilestoneField(milestone.id, field, value)}
                      onCommitServiceField={(entryId, field, value) => commitMilestoneServiceField(milestone.id, entryId, field, value)}
                      onRemoveService={entryId => removeMilestoneServiceEntry(milestone.id, entryId)}
                      onResetService={entryId => resetMilestoneServiceEntry(milestone.id, entryId)}
                      onAddCustomService={fields => addMilestoneCustomService(milestone.id, fields)}
                      onAddCatalogService={catalogId => addMilestoneCatalogService(milestone.id, catalogId)}
                    />
                  ))}
                </>
              )}
            </Panel>

            {/* Spacing (batch 12 §1): same lighter Format-panel pattern as the Invoice tab - only
                the gap between programme sections/payments blocks is tunable, everything else on
                the branded Expected Expenses PDF stays fixed. */}
            <Panel>
              <CompactSection
                $expanded={expectedExpensesSpacingExpanded}
                onClick={() => setExpectedExpensesSpacingExpanded(current => !current)}
                role="button"
                aria-expanded={expectedExpensesSpacingExpanded}
              >
                <CompactInfo>
                  <CompactLabel>Spacing</CompactLabel>
                  <CompactValue>
                    {Object.values(expectedExpensesSpacing).some(value => value !== undefined) ? 'Custom block spacing' : 'Default block spacing'}
                  </CompactValue>
                </CompactInfo>
                <CompactChevron>{expectedExpensesSpacingExpanded ? 'Hide ›' : 'Edit ›'}</CompactChevron>
              </CompactSection>
              {expectedExpensesSpacingExpanded ? (
                <>
                  <PanelHeading>
                    <H2>Spacing</H2>
                  </PanelHeading>
                  <SpacingField
                    label="Above included services (pt)"
                    value={expectedExpensesSpacing.aboveIncludedServices}
                    placeholder="26"
                    onCommit={value => setExpectedExpensesSpacing(current => ({ ...current, aboveIncludedServices: value }))}
                  />
                  <SpacingField
                    label="Above payment schedule (pt)"
                    value={expectedExpensesSpacing.abovePaymentSchedule}
                    placeholder="23"
                    onCommit={value => setExpectedExpensesSpacing(current => ({ ...current, abovePaymentSchedule: value }))}
                  />
                  <SpacingField
                    label="Above payments (pt)"
                    value={expectedExpensesSpacing.abovePayments}
                    placeholder="22"
                    onCommit={value => setExpectedExpensesSpacing(current => ({ ...current, abovePayments: value }))}
                  />
                  <SpacingField
                    label="Between payments (pt)"
                    value={expectedExpensesSpacing.betweenPayments}
                    placeholder="10"
                    onCommit={value => setExpectedExpensesSpacing(current => ({ ...current, betweenPayments: value }))}
                  />
                </>
              ) : null}
            </Panel>
              </>
            ) : null}
          </>
        ) : null}
      </Shell>
    </Page>
  );
};

export default InvoiceBuilderPage;
