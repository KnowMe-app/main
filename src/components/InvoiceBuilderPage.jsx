import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, set } from 'firebase/database';
import {
  FaBoxOpen,
  FaChevronDown,
  FaChevronUp,
  FaFilePdf,
  FaLayerGroup,
  FaPlus,
  FaSyncAlt,
  FaTrash,
  FaUndoAlt,
  FaUpload,
} from 'react-icons/fa';
import { saveAs } from 'file-saver';
import { auth, database, fetchNbuUahExchangeRatesByDate } from './config';
import PdfPagePreviewStrip from './PdfPagePreviewStrip';
import { getVisibleSortedPackages, parseBudgetPriceValue, resolveBudgetPriceAmount, resolveProgramPaymentSchedule } from './budgetCatalogUtils';
import { useAutoResize } from '../hooks/useAutoResize';
import { isAdminUid } from 'utils/accessLevel';
import {
  addCatalogChildToPackage,
  addCustomChildToPackage,
  applyPaymentPurposePlaceholders,
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  cloneEntryWithNewId,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  generateInvoiceIdentifiers,
  getActiveBeneficiary,
  getEntryIdentityKey,
  getTodayYmd,
  isInvoiceDataShape,
  makeCatalogItemEntry,
  makeCatalogPackageEntry,
  makeCustomEntry,
  makePercentOfPackageEntry,
  movePackageChild,
  normalizeInvoiceData,
  parseCustomPriceInput,
  removePackageChild,
  reorderBeneficiaryIds,
  reorderRecentServices,
  resetItemEntryOverrides,
  resetPackageEntryToCatalog,
  resolveInvoiceServiceRows,
  resolveServiceRow,
  setEntryField,
  updatePackageChildField,
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
  isExpectedExpensesShape,
  isRawExpectedExpensesGroups,
  normalizeExpectedExpensesData,
  removeMilestoneService,
  resolveMilestoneServiceRows,
  resolvePackageOverviewRows,
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

const Page = styled.main`
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
  border-radius: 10px;
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
  border-radius: 7px;
`;

const DangerButton = styled(SmallButton)`
  border-color: var(--km-danger-border);
  color: var(--km-danger);

  &:hover:not(:disabled) {
    border-color: var(--km-danger);
    color: var(--km-danger);
  }
`;

const iconButtonBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--km-muted);
  font-size: 10.5px;
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
    background: rgba(180, 35, 24, 0.12);
    color: var(--km-danger);
  }
`;

const Panel = styled.section`
  margin-top: 10px;
  border: 1px solid var(--km-border);
  border-radius: 16px;
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
  border-radius: 16px;
  background: var(--km-card);
  border: 1px solid var(--km-border);
  color: var(--km-muted);
  font-size: 13px;
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

const plainFieldStyle = css`
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--km-text);
  font-family: inherit;
  font-size: ${({ $size }) => $size || '13px'};
  font-weight: ${({ $weight }) => $weight || '600'};
  line-height: 1.45;
  padding: 5px 6px;
  margin: 0;
  resize: none;
  overflow: hidden;

  &::placeholder {
    color: var(--km-muted);
    font-weight: 500;
    opacity: 0.8;
  }

  &:hover {
    background: var(--km-accent-light);
  }

  &:focus {
    outline: none;
    background: var(--km-accent-light);
    box-shadow: inset 0 0 0 1px var(--km-accent-mid);
  }
`;

const PlainTextBase = styled.textarea`
  ${plainFieldStyle}
`;

const PlainPriceBase = styled.textarea`
  ${plainFieldStyle}
  flex: 0 0 auto;
  width: ${({ $width }) => $width || '92px'};
  text-align: right;
  font-weight: 800;
  color: var(--km-accent);
`;

const PlainSelect = styled.select`
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--km-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 6px;
  cursor: pointer;

  &:hover,
  &:focus {
    outline: none;
    background: var(--km-accent-light);
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

const formatEuroPreview = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `€${amount.toFixed(2)}` : '€—';
};

// --- Service line item (top-level custom/catalog row, or a row nested inside a package) ------------------------------------------------------

const LineCard = styled.div`
  padding: 4px 0 6px;
  border-top: 1px solid var(--km-border);

  &:first-child {
    border-top: 0;
  }
`;

const LineMainRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
`;

const RowIndex = styled.span`
  flex: 0 0 auto;
  width: 16px;
  padding-top: 7px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--km-muted);
  text-align: center;
`;

const RowActions = styled.div`
  flex: 0 0 auto;
  display: flex;
  gap: 1px;
  padding-top: 2px;
`;

const CustomizedTag = styled.span`
  flex: 0 0 auto;
  align-self: center;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--km-accent);
  background: var(--km-accent-light);
  border-radius: 999px;
  padding: 2px 7px;
  white-space: nowrap;
`;

const MissingTag = styled(CustomizedTag)`
  color: var(--km-danger);
  background: rgba(180, 35, 24, 0.1);
`;

// A "% of package" row has no name/description of its own (it's derived: "20% of IVF+ED+SM") -
// what's editable is the percent value and which catalog package it's a share of.
const PercentShareRow = ({
  row,
  index,
  isChild,
  catalogPackages,
  onCommit,
  onRemove,
  removeTitle,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}) => {
  const [percentDraft, setPercentDraft, percentEditingRef] = useFieldDraft(String(row.percent ?? ''));

  return (
    <LineCard>
      <LineMainRow>
        <RowIndex>{index + 1}</RowIndex>
        <PlainSelect
          aria-label="Package this share is calculated from"
          value={row.packageId}
          onChange={event => onCommit('packageId', event.target.value)}
        >
          {!catalogPackages.some(pkg => String(pkg.id) === String(row.packageId)) ? (
            <option value={row.packageId}>{`Package ${row.packageId}`}</option>
          ) : null}
          {catalogPackages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
        </PlainSelect>
        <AutoTextArea
          as={PlainPriceBase}
          $size={isChild ? '12.5px' : '13px'}
          $width="52px"
          inputMode="decimal"
          value={percentDraft}
          placeholder="0"
          aria-label="Percent of package price"
          onFocus={() => { percentEditingRef.current = true; }}
          onChange={event => setPercentDraft(event.target.value)}
          onBlur={() => { percentEditingRef.current = false; onCommit('percent', percentDraft); }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--km-muted)' }}>%</span>
        <CustomizedTag title="Recalculated live from the package's price">≈ {formatEuroPreview(row.price)}</CustomizedTag>
        {row.missing ? <MissingTag title="This catalog package no longer exists">Missing</MissingTag> : null}
        <RowActions>
          {onMoveUp ? (
            <IconButton type="button" onClick={onMoveUp} disabled={!canMoveUp} title="Move up" aria-label="Move up">
              <FaChevronUp />
            </IconButton>
          ) : null}
          {onMoveDown ? (
            <IconButton type="button" onClick={onMoveDown} disabled={!canMoveDown} title="Move down" aria-label="Move down">
              <FaChevronDown />
            </IconButton>
          ) : null}
          <IconDangerButton type="button" onClick={onRemove} title={removeTitle} aria-label={removeTitle}>
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
  const [priceDraft, setPriceDraft, priceEditingRef] = useFieldDraft(row.priceLabel || String(row.price ?? ''));

  if (row.kind === 'percent') {
    return (
      <PercentShareRow
        row={row}
        index={index}
        isChild={isChild}
        catalogPackages={catalogPackages}
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
          $size={isChild ? '12.5px' : '13px'}
          $weight="700"
          value={nameDraft}
          placeholder="Service name"
          aria-label="Service name"
          onFocus={() => { nameEditingRef.current = true; }}
          onChange={event => setNameDraft(event.target.value)}
          onBlur={() => { nameEditingRef.current = false; onCommit('name', nameDraft); }}
        />
        <AutoTextArea
          as={PlainPriceBase}
          $size={isChild ? '12.5px' : '13px'}
          $width={isChild ? '76px' : '88px'}
          value={priceDraft}
          placeholder="0 or GIFT"
          aria-label="Price (EUR)"
          onFocus={() => { priceEditingRef.current = true; }}
          onChange={event => setPriceDraft(event.target.value)}
          onBlur={() => { priceEditingRef.current = false; onCommit('price', priceDraft); }}
        />
        {row.isCustomized ? <CustomizedTag title="Overridden for this invoice only - the shared budget is unchanged">Custom</CustomizedTag> : null}
        {row.missing ? <MissingTag title="This catalog reference no longer exists">Missing</MissingTag> : null}
        {onReset ? (
          <IconButton type="button" onClick={onReset} title="Revert to the catalog value" aria-label="Revert to catalog value">
            <FaUndoAlt />
          </IconButton>
        ) : null}
        <RowActions>
          {onMoveUp ? (
            <IconButton type="button" onClick={onMoveUp} disabled={!canMoveUp} title="Move up" aria-label="Move up">
              <FaChevronUp />
            </IconButton>
          ) : null}
          {onMoveDown ? (
            <IconButton type="button" onClick={onMoveDown} disabled={!canMoveDown} title="Move down" aria-label="Move down">
              <FaChevronDown />
            </IconButton>
          ) : null}
          <IconDangerButton type="button" onClick={onRemove} title={removeTitle} aria-label={removeTitle}>
            <FaTrash />
          </IconDangerButton>
        </RowActions>
      </LineMainRow>
      <AutoTextArea
        $size="11.5px"
        $weight="500"
        style={{ color: 'var(--km-muted)' }}
        value={descriptionDraft}
        placeholder="Add description…"
        aria-label="Description"
        onFocus={() => { descriptionEditingRef.current = true; }}
        onChange={event => setDescriptionDraft(event.target.value)}
        onBlur={() => { descriptionEditingRef.current = false; onCommit('description', descriptionDraft); }}
      />
    </LineCard>
  );
};

// --- Package group (a whole budget/packages program, editable/removable per line) ------------------------------------------------------

const PackageCard = styled.div`
  margin-top: 10px;
  border: 1px solid var(--km-border);
  border-radius: 12px;
  background: var(--km-accent-light);
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
  width: 22px;
  height: 22px;
  margin-top: 3px;
  border-radius: 7px;
  background: var(--km-card);
  color: var(--km-accent);
  font-size: 11px;
`;

const PackageChildren = styled.div`
  margin: 6px 0 4px 28px;
  border-radius: 10px;
  background: var(--km-card);
  padding: 0 8px;

  @media (max-width: 560px) {
    margin-left: 10px;
  }
`;

const PackageAddRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 6px 0 0 28px;

  @media (max-width: 560px) {
    margin-left: 10px;
  }
`;

const PackageQuickField = styled(PlainTextBase)`
  flex: 1 1 140px;
  background: var(--km-card);
  border-radius: 8px;
  padding: 5px 8px;
`;

const PackageQuickPrice = styled(PlainPriceBase)`
  flex: 0 0 76px;
  background: var(--km-card);
  border-radius: 8px;
  padding: 5px 8px;
`;

const InlinePickerBox = styled.div`
  margin: 6px 0 0 28px;

  @media (max-width: 560px) {
    margin-left: 10px;
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

const CatalogTabs = styled.div`
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  margin-bottom: 8px;
  border-radius: 999px;
  background: var(--km-bg);
  border: 1px solid var(--km-border);
`;

const CatalogTabButton = styled.button`
  border: none;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#fff' : 'var(--km-muted)')};
  background: ${({ $active }) => ($active ? 'linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%)' : 'transparent')};
`;

const PackageEntryCard = ({
  row,
  index,
  canMoveUp,
  canMoveDown,
  catalogItems,
  onCommitField,
  onRemove,
  onMoveUp,
  onMoveDown,
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
  const [priceDraft, setPriceDraft, priceEditingRef] = useFieldDraft(String(row.price ?? ''));
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const childCatalogIds = useMemo(
    () => new Set(row.children.filter(child => child.kind === 'item').map(child => String(child.catalogId))),
    [row.children],
  );

  const availableItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalogItems
      .filter(item => !childCatalogIds.has(String(item.id)))
      .filter(item => !normalizedQuery || String(item.name || '').toLowerCase().includes(normalizedQuery))
      .slice(0, 30);
  }, [catalogItems, childCatalogIds, query]);

  const handleAddCustom = () => {
    const name = customName.trim();
    if (!name) {
      toast.error('Enter a name for the new service.');
      return;
    }
    onAddCustomChild({ name, ...parseCustomPriceInput(customPrice) });
    setCustomName('');
    setCustomPrice('');
  };

  return (
    <PackageCard>
      <PackageHeaderRow>
        <PackageIcon><FaBoxOpen /></PackageIcon>
        <RowIndex>{index + 1}</RowIndex>
        <AutoTextArea
          $size="13.5px"
          $weight="800"
          value={nameDraft}
          placeholder="Package name"
          aria-label="Package name"
          onFocus={() => { nameEditingRef.current = true; }}
          onChange={event => setNameDraft(event.target.value)}
          onBlur={() => { nameEditingRef.current = false; onCommitField('name', nameDraft); }}
        />
        <AutoTextArea
          as={PlainPriceBase}
          $width="92px"
          inputMode="decimal"
          value={priceDraft}
          placeholder="0"
          aria-label="Package price (EUR)"
          onFocus={() => { priceEditingRef.current = true; }}
          onChange={event => setPriceDraft(event.target.value)}
          onBlur={() => { priceEditingRef.current = false; onCommitField('price', priceDraft); }}
        />
        {row.hasPriceOverride ? (
          <CustomizedTag title="Real total of the services below">Σ {formatEuroPreview(row.childrenTotal)}</CustomizedTag>
        ) : null}
        {row.isCustomized ? <CustomizedTag title="No longer matches the shared budget package">Custom package</CustomizedTag> : null}
        {onReset ? (
          <IconButton type="button" onClick={onReset} title="Revert to the catalog package" aria-label="Revert to catalog package">
            <FaUndoAlt />
          </IconButton>
        ) : null}
        <RowActions>
          <IconButton type="button" onClick={onMoveUp} disabled={!canMoveUp} title="Move up" aria-label="Move package up">
            <FaChevronUp />
          </IconButton>
          <IconButton type="button" onClick={onMoveDown} disabled={!canMoveDown} title="Move down" aria-label="Move package down">
            <FaChevronDown />
          </IconButton>
          <IconDangerButton type="button" onClick={onRemove} title="Remove package" aria-label="Remove package">
            <FaTrash />
          </IconDangerButton>
        </RowActions>
      </PackageHeaderRow>
      <AutoTextArea
        $size="11.5px"
        $weight="500"
        style={{ color: 'var(--km-muted)', marginLeft: 28 }}
        value={descriptionDraft}
        placeholder="Add description…"
        aria-label="Package description"
        onFocus={() => { descriptionEditingRef.current = true; }}
        onChange={event => setDescriptionDraft(event.target.value)}
        onBlur={() => { descriptionEditingRef.current = false; onCommitField('description', descriptionDraft); }}
      />

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

      <PackageAddRow>
        <PackageQuickField
          rows={1}
          placeholder="Add a custom line to this package…"
          value={customName}
          onChange={event => setCustomName(event.target.value)}
        />
        <PackageQuickPrice
          rows={1}
          placeholder="Price or GIFT"
          value={customPrice}
          onChange={event => setCustomPrice(event.target.value)}
        />
        <SmallButton type="button" onClick={handleAddCustom}><FaPlus /> Add</SmallButton>
        <SmallButton type="button" onClick={() => setShowPicker(current => !current)}>
          <FaPlus /> {showPicker ? 'Hide catalog' : 'From catalog'}
        </SmallButton>
      </PackageAddRow>

      {showPicker ? (
        <InlinePickerBox>
          <CatalogSearchField
            rows={1}
            placeholder="Search catalog services…"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <CatalogPickerList>
            {availableItems.map(item => (
              <CatalogPickerButton key={item.id} type="button" onClick={() => { onAddCatalogChild(item.id); setShowPicker(false); setQuery(''); }}>
                <span>{item.name}</span>
              </CatalogPickerButton>
            ))}
            {!availableItems.length ? <PanelNote style={{ margin: 0 }}>No matching catalog services.</PanelNote> : null}
          </CatalogPickerList>
        </InlinePickerBox>
      ) : null}
    </PackageCard>
  );
};

// --- Expected expenses milestone (one payment-schedule entry -> one future invoice) ------------------------------------------------------

const MilestoneCheckboxRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 2px 0 0 28px;
  font-size: 11px;
  font-weight: 700;
  color: var(--km-muted);

  @media (max-width: 560px) {
    margin-left: 10px;
  }
`;

const MilestoneCheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
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
  onToggleOverview,
  onCommitServiceField,
  onRemoveService,
  onResetService,
  onAddCustomService,
  onAddCatalogService,
  onAddPercentService,
}) => {
  const [titleDraft, setTitleDraft, titleEditingRef] = useFieldDraft(milestone.title);
  const [taxDraft, setTaxDraft, taxEditingRef] = useFieldDraft(String(milestone.taxPercent ?? ''));
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const usedCatalogIds = useMemo(
    () => new Set(serviceRows.filter(row => row.kind === 'item').map(row => String(row.catalogId))),
    [serviceRows],
  );

  const availableItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalogItems
      .filter(item => !usedCatalogIds.has(String(item.id)))
      .filter(item => !normalizedQuery || String(item.name || '').toLowerCase().includes(normalizedQuery))
      .slice(0, 30);
  }, [catalogItems, usedCatalogIds, query]);

  const handleAddCustom = () => {
    const name = customName.trim();
    if (!name) {
      toast.error('Enter a name for the new service.');
      return;
    }
    onAddCustomService({ name, ...parseCustomPriceInput(customPrice) });
    setCustomName('');
    setCustomPrice('');
  };

  return (
    <PackageCard>
      <PackageHeaderRow>
        <RowIndex>{index + 1}</RowIndex>
        <AutoTextArea
          $size="13.5px"
          $weight="800"
          value={titleDraft}
          placeholder="Milestone title"
          aria-label="Milestone title"
          onFocus={() => { titleEditingRef.current = true; }}
          onChange={event => setTitleDraft(event.target.value)}
          onBlur={() => { titleEditingRef.current = false; onCommitField('title', titleDraft); }}
        />
        <AutoTextArea
          as={PlainPriceBase}
          $width="48px"
          inputMode="decimal"
          value={taxDraft}
          placeholder="%"
          title="Tax (%)"
          aria-label="Tax percent"
          onFocus={() => { taxEditingRef.current = true; }}
          onChange={event => setTaxDraft(event.target.value)}
          onBlur={() => { taxEditingRef.current = false; onCommitField('taxPercent', taxDraft); }}
        />
      </PackageHeaderRow>
      <MilestoneCheckboxRow>
        <MilestoneCheckboxLabel>
          <input type="checkbox" checked={Boolean(milestone.showPackageOverview)} onChange={onToggleOverview} />
          Show full package overview on this invoice
        </MilestoneCheckboxLabel>
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
            catalogPackages={catalogPackages}
            onCommit={(field, value) => onCommitServiceField(row.id, field, value)}
            onRemove={() => onRemoveService(row.id)}
            onReset={row.kind === 'item' && row.isCustomized ? () => onResetService(row.id) : undefined}
          />
        ))}
        {!serviceRows.length ? <PanelNote style={{ margin: '8px 0' }}>No services on this milestone yet.</PanelNote> : null}
      </PackageChildren>

      <PackageAddRow>
        <PackageQuickField
          rows={1}
          placeholder="Add a custom line to this invoice…"
          value={customName}
          onChange={event => setCustomName(event.target.value)}
        />
        <PackageQuickPrice
          rows={1}
          placeholder="Price or GIFT"
          value={customPrice}
          onChange={event => setCustomPrice(event.target.value)}
        />
        <SmallButton type="button" onClick={handleAddCustom}><FaPlus /> Add</SmallButton>
        <SmallButton type="button" onClick={() => setShowPicker(current => !current)}>
          <FaPlus /> {showPicker ? 'Hide catalog' : 'From catalog'}
        </SmallButton>
        <SmallButton type="button" onClick={onAddPercentService} title="Add a share of the package price (e.g. 20%)">
          <FaPlus /> % of package
        </SmallButton>
      </PackageAddRow>

      {showPicker ? (
        <InlinePickerBox>
          <CatalogSearchField
            rows={1}
            placeholder="Search catalog services…"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <CatalogPickerList>
            {availableItems.map(item => (
              <CatalogPickerButton key={item.id} type="button" onClick={() => { onAddCatalogService(item.id); setShowPicker(false); setQuery(''); }}>
                <span>{item.name}</span>
              </CatalogPickerButton>
            ))}
            {!availableItems.length ? <PanelNote style={{ margin: 0 }}>No matching catalog services.</PanelNote> : null}
          </CatalogPickerList>
        </InlinePickerBox>
      ) : null}
    </PackageCard>
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

const Chip = styled.button`
  border: 1px dashed var(--km-border);
  background: var(--km-bg);
  color: var(--km-text);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
`;

const InvoiceBuilderPage = ({ isAdmin = false }) => {
  const isInvoiceAdmin = Boolean(isAdmin) || isAdminUid(auth.currentUser?.uid) || (typeof window !== 'undefined'
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
  const [invoiceDateInput, setInvoiceDateInput] = useState(getTodayYmd());
  const [newCustomServiceName, setNewCustomServiceName] = useState('');
  const [newCustomServicePrice, setNewCustomServicePrice] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [catalogTab, setCatalogTab] = useState('items');
  const [showExpectedExpensesPicker, setShowExpectedExpensesPicker] = useState(false);
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
      setCatalogTechnical(technicalSnapshot.exists() ? technicalSnapshot.val() : {});
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

  const entryReferencesFormulaItem = useCallback(entry => {
    if (!entry) return false;
    if (entry.kind === 'package') return (entry.children || []).some(entryReferencesFormulaItem);
    if (entry.kind !== 'item') return false;
    const item = catalogItemsById.get(String(entry.catalogId));
    return parseBudgetPriceValue(item?.price).isFormula;
  }, [catalogItemsById]);

  const hasFormulaInvoiceService = useMemo(
    () => data.invoiceServices.some(entryReferencesFormulaItem),
    [data.invoiceServices, entryReferencesFormulaItem],
  );

  const isFormulaRatePending = hasFormulaInvoiceService && exchangeRatesLoading;
  const formulaRateError = hasFormulaInvoiceService ? exchangeRatesError : '';
  const isGenerateDisabled = loading || Boolean(error) || isGenerating || isFormulaRatePending || Boolean(formulaRateError);

  const priceContext = useMemo(
    () => ({ itemsById: catalogItemsById, rates: exchangeRates, packagesById: catalogPackagesById }),
    [catalogItemsById, exchangeRates, catalogPackagesById],
  );

  const invoiceServiceRows = useMemo(
    () => resolveInvoiceServiceRows(data.invoiceServices, catalogItemsById, priceContext),
    [data.invoiceServices, catalogItemsById, priceContext],
  );

  const subtotal = useMemo(() => computeInvoiceSubtotal(invoiceServiceRows), [invoiceServiceRows]);
  const total = useMemo(() => computeInvoiceTotal(subtotal, data.taxPercent), [subtotal, data.taxPercent]);

  const { invoiceNumber, invoiceDate } = useMemo(() => generateInvoiceIdentifiers(invoiceDateInput), [invoiceDateInput]);

  const purposeOfPayment = useMemo(
    () => applyPaymentPurposePlaceholders(activeBeneficiary?.paymentPurpose, { invoiceNumber, invoiceDate }),
    [activeBeneficiary, invoiceNumber, invoiceDate],
  );

  const payerName = useMemo(() => buildPayerName(data.customers), [data.customers]);
  const payerLocation = useMemo(() => buildPayerLocation(data.customers), [data.customers]);
  const caseTitle = useMemo(() => buildCaseTitle(data.customers), [data.customers]);

  const recentServiceSuggestions = useMemo(() => {
    const used = new Set(data.invoiceServices.map(getEntryIdentityKey));
    return data.recentServices.filter(entry => !used.has(getEntryIdentityKey(entry))).slice(0, 8);
  }, [data.recentServices, data.invoiceServices]);

  const usedCatalogItemIds = useMemo(() => new Set(
    data.invoiceServices.filter(entry => entry.kind === 'item').map(entry => String(entry.catalogId)),
  ), [data.invoiceServices]);

  const usedCatalogPackageIds = useMemo(() => new Set(
    data.invoiceServices.filter(entry => entry.kind === 'package').map(entry => String(entry.catalogId)),
  ), [data.invoiceServices]);

  const filteredCatalogItems = useMemo(() => {
    const normalizedQuery = catalogQuery.trim().toLowerCase();
    return catalogItems
      .filter(item => !usedCatalogItemIds.has(String(item.id)))
      .filter(item => !normalizedQuery || String(item.name || '').toLowerCase().includes(normalizedQuery))
      .slice(0, 30);
  }, [catalogItems, usedCatalogItemIds, catalogQuery]);

  const visibleCatalogPackages = useMemo(
    () => getVisibleSortedPackages({ packages: catalogPackages }, priceContext),
    [catalogPackages, priceContext],
  );

  const filteredCatalogPackages = useMemo(() => {
    const normalizedQuery = catalogQuery.trim().toLowerCase();
    return visibleCatalogPackages
      .filter(pkg => !usedCatalogPackageIds.has(String(pkg.id)))
      .filter(pkg => !normalizedQuery || String(pkg.name || '').toLowerCase().includes(normalizedQuery));
  }, [visibleCatalogPackages, usedCatalogPackageIds, catalogQuery]);

  const expectedExpensesView = useMemo(() => {
    if (!expectedExpenses) return null;
    const overviewRows = resolvePackageOverviewRows(expectedExpenses.packageSnapshot.children, catalogItemsById, priceContext);
    const milestoneRows = expectedExpenses.milestones.map(milestone => {
      const serviceRows = resolveMilestoneServiceRows(milestone, catalogItemsById, priceContext);
      const subtotal = computeMilestoneSubtotal(serviceRows);
      const amountDue = computeMilestoneAmountDue(subtotal, milestone.taxPercent);
      return { milestone, serviceRows, subtotal, amountDue };
    });
    return {
      overviewRows,
      milestoneRows,
      totalPlanned: computeMilestonesTotal(expectedExpenses.milestones, catalogItemsById, priceContext),
      packageSharePercent: computeMilestonesPackageSharePercent(expectedExpenses.milestones, expectedExpenses.packageId),
    };
  }, [expectedExpenses, catalogItemsById, priceContext]);

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

  // Customers ------------------------------------------------------------

  const updateCustomerField = (index, field, value) => {
    setData(current => ({
      ...current,
      customers: current.customers.map((customer, customerIndex) => (customerIndex === index
        ? { ...customer, [field]: value }
        : customer)),
    }));
  };

  const persistCustomers = async (nextCustomers, successMessage) => {
    await persistPath(`${INVOICE_DATA_PATH}/customers`, nextCustomers, successMessage);
  };

  const addCustomer = () => {
    const nextCustomers = [...data.customers, { name: '', address: '' }];
    setData(current => ({ ...current, customers: nextCustomers }));
    persistCustomers(nextCustomers, 'Customer added.');
  };

  const removeCustomer = index => {
    const nextCustomers = data.customers.filter((customer, customerIndex) => customerIndex !== index);
    setData(current => ({ ...current, customers: nextCustomers }));
    persistCustomers(nextCustomers, 'Customer removed.');
  };

  // Invoice services ------------------------------------------------------------

  const persistInvoiceServices = (nextInvoiceServices, successMessage) => {
    setData(current => ({ ...current, invoiceServices: nextInvoiceServices }));
    persistPath(`${INVOICE_DATA_PATH}/invoiceServices`, nextInvoiceServices, successMessage);
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
    const targetIndex = index + offset;
    if (index === -1 || targetIndex < 0 || targetIndex >= data.invoiceServices.length) return;
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
    const identity = getEntryIdentityKey(entry);
    if (data.invoiceServices.some(existing => getEntryIdentityKey(existing) === identity)) {
      toast.error('This is already on the invoice.');
      return;
    }
    persistInvoiceServices([...data.invoiceServices, entry], successMessage);
  };

  const addCatalogServiceEntry = catalogId => {
    addEntryToInvoice(makeCatalogItemEntry(catalogId), 'Service added.');
    setShowCatalogPicker(false);
    setCatalogQuery('');
  };

  const addCatalogPackageEntry = pkg => {
    addEntryToInvoice(makeCatalogPackageEntry(pkg), 'Package added.');
    setShowCatalogPicker(false);
    setCatalogQuery('');
  };

  const addCustomServiceEntry = () => {
    const name = newCustomServiceName.trim();
    if (!name) {
      toast.error('Enter a name for the new service.');
      return;
    }
    addEntryToInvoice(makeCustomEntry({ name, ...parseCustomPriceInput(newCustomServicePrice) }), 'Service added.');
    setNewCustomServiceName('');
    setNewCustomServicePrice('');
  };

  const addPercentServiceEntry = packageId => {
    addEntryToInvoice(makePercentOfPackageEntry(packageId, 0), 'Service added.');
  };

  const addRecentServiceEntry = entry => addEntryToInvoice(cloneEntryWithNewId(entry), 'Service added.');

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

  // Expected expenses ------------------------------------------------------------
  // A whole program's billing forecast: one milestone per payment-schedule entry, auto-computed
  // from the chosen budget/packages program, stored as its own object at invoiceBuilder/expectedExpenses.

  const defaultExpectedExpensesTaxPercent = Number.isFinite(Number(catalogTechnical?.wireTransferSurchargeRate))
    ? Math.round(Number(catalogTechnical.wireTransferSurchargeRate) * 10000) / 100
    : (Number(data.taxPercent) || 0);

  const persistExpectedExpenses = (nextPlan, successMessage) => {
    setExpectedExpenses(nextPlan);
    persistPath(EXPECTED_EXPENSES_PATH, nextPlan, successMessage);
  };

  const persistExpectedExpensesMilestones = (nextMilestones, successMessage) => {
    persistExpectedExpenses({ ...expectedExpenses, milestones: nextMilestones }, successMessage);
  };

  const createExpectedExpensesPlan = pkg => {
    const schedule = resolveProgramPaymentSchedule({ technical: catalogTechnical }, pkg);
    if (!schedule || !Array.isArray(schedule.payments) || !schedule.payments.length) {
      toast.error('This package has no payment schedule in the catalog.');
      return;
    }
    const resolvedPackage = { ...pkg, listedPrice: resolveBudgetPriceAmount(pkg.listedPrice, priceContext) ?? pkg.listedPrice };
    const plan = buildExpectedExpensesPlan(resolvedPackage, schedule, { taxPercent: defaultExpectedExpensesTaxPercent });
    persistExpectedExpenses(plan, 'Expected expenses plan created.');
    setShowExpectedExpensesPicker(false);
  };

  const recalculateExpectedExpensesSchedule = () => {
    if (!expectedExpenses) return;
    const pkg = catalogPackagesById.get(String(expectedExpenses.packageId));
    if (!pkg) {
      toast.error('The original package is no longer in the catalog.');
      return;
    }
    const schedule = resolveProgramPaymentSchedule({ technical: catalogTechnical }, pkg);
    if (!schedule || !Array.isArray(schedule.payments) || !schedule.payments.length) {
      toast.error('This package has no payment schedule in the catalog.');
      return;
    }
    if (typeof window !== 'undefined' && !window.confirm(
      'Recalculate milestones from the catalog schedule? Titles reset to the catalog and the package-share row is recomputed; extra services on each milestone are kept.',
    )) return;
    const resolvedPackage = { ...pkg, listedPrice: resolveBudgetPriceAmount(pkg.listedPrice, priceContext) ?? pkg.listedPrice };
    const freshMilestones = buildMilestonesFromSchedule(resolvedPackage, schedule, { taxPercent: defaultExpectedExpensesTaxPercent });
    const nextMilestones = freshMilestones.map((milestone, index) => {
      const previous = expectedExpenses.milestones[index];
      const previousExtras = (previous?.services || []).filter(entry => entry.kind !== 'percent' || String(entry.packageId) !== String(expectedExpenses.packageId));
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
        listedPrice: resolveBudgetPriceAmount(pkg.listedPrice, priceContext) ?? Number(pkg.listedPrice) ?? 0,
      },
      milestones: nextMilestones,
    }, 'Schedule recalculated.');
  };

  const deleteExpectedExpensesPlan = () => {
    if (typeof window !== 'undefined' && !window.confirm('Delete the whole expected expenses plan?')) return;
    persistExpectedExpenses(null, 'Expected expenses plan deleted.');
  };

  const commitMilestoneField = (milestoneId, field, value) => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id === milestoneId
      ? setMilestoneField(milestone, field, value)
      : milestone));
    persistExpectedExpensesMilestones(nextMilestones, 'Milestone updated.');
  };

  const toggleMilestoneOverview = milestoneId => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id === milestoneId
      ? { ...milestone, showPackageOverview: !milestone.showPackageOverview }
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

  const addMilestonePercentService = milestoneId => {
    const nextMilestones = expectedExpenses.milestones.map(milestone => (milestone.id === milestoneId
      ? addMilestoneService(milestone, makePercentOfPackageEntry(expectedExpenses.packageId, 0))
      : milestone));
    persistExpectedExpensesMilestones(nextMilestones, 'Service added.');
  };

  const handleGenerateExpectedExpensesPdf = async () => {
    if (!expectedExpenses || !expectedExpenses.milestones.length) {
      toast.error('Choose a package to build the plan first.');
      return;
    }
    if (!data.customers.length) {
      toast.error('Add at least one customer first.');
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
      };
      let blob;
      try {
        blob = await pdf(React.createElement(ExpectedExpensesPdfDocument, documentProps)).toBlob();
      } catch (firstAttemptError) {
        console.error('Expected expenses PDF generation failed on first attempt, retrying', firstAttemptError);
        blob = await pdf(React.createElement(ExpectedExpensesPdfDocument, documentProps)).toBlob();
      }
      saveAs(blob, `expected-expenses-${(caseTitle || 'plan').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
      toast.success('Expected expenses PDF generated.');
    } catch (generateError) {
      console.error('Unable to generate expected expenses PDF', generateError);
      toast.error('Unable to generate expected expenses PDF.');
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
    const value = Number(String(data.taxPercent).replace(',', '.')) || 0;
    setData(current => ({ ...current, taxPercent: value }));
    persistPath(`${INVOICE_DATA_PATH}/taxPercent`, value, 'Tax updated.');
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
      const { plan, missingPackage, droppedGroupsCount } = buildExpectedExpensesPlanFromRawGroups(rawExpectedExpenses, {
        catalog: { packages: catalogPackages, technical: catalogTechnical },
        taxPercent: defaultExpectedExpensesTaxPercent,
      });
      if (missingPackage) {
        toast.error('Expected expenses: none of the groups reference a catalog package ("idX || Y%") - nothing was imported.');
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
      const nextData = normalizeInvoiceData(parsed);
      await Promise.all([
        set(ref(database, `${INVOICE_DATA_PATH}/beneficiaries`), nextData.beneficiaries),
        set(ref(database, `${INVOICE_DATA_PATH}/beneficiaryIds`), nextData.beneficiaryIds),
        set(ref(database, `${INVOICE_DATA_PATH}/customers`), nextData.customers),
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
      const [{ pdf }, { default: InvoicePdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./InvoicePdfDocument'),
      ]);
      const documentProps = {
        beneficiary: activeBeneficiary,
        customers: data.customers,
        invoiceServices: data.invoiceServices,
        catalogItemsById,
        priceContext,
        notes: data.notes,
        taxPercent: data.taxPercent,
        invoiceNumber,
        invoiceDate,
        purposeOfPayment,
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

      const nextRecentServices = reorderRecentServices(data.recentServices, data.invoiceServices);
      setData(current => ({ ...current, recentServices: nextRecentServices }));
      await persistPath(`${INVOICE_DATA_PATH}/recentServices`, nextRecentServices);

      toast.success('Invoice PDF generated.');
    } catch (generateError) {
      console.error('Unable to generate invoice PDF', generateError);
      const reason = generateError?.message ? `: ${generateError.message}` : '';
      toast.error(`Unable to generate invoice PDF${reason}`);
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
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
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
          </HeaderActions>
        </Header>

        {loading ? <StateCard>Loading invoice data…</StateCard> : null}
        {!loading && error ? <StateCard>{error}</StateCard> : null}
        {!loading && !error && isFormulaRatePending ? <StateCard>Loading NBU exchange rates for formula-priced services…</StateCard> : null}
        {!loading && !error && formulaRateError ? <StateCard>{formulaRateError}</StateCard> : null}

        {!loading && !error ? (
          <>
            <Panel>
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
                  <FieldRow>
                    <FieldTag>Title</FieldTag>
                    <AutoTextArea
                      value={activeBeneficiary.title || ''}
                      onChange={event => updateActiveBeneficiaryField('title', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('title', event.target.value)}
                    />
                  </FieldRow>
                  <FieldRow>
                    <FieldTag>Address</FieldTag>
                    <AutoTextArea
                      value={activeBeneficiary.address || ''}
                      onChange={event => updateActiveBeneficiaryField('address', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('address', event.target.value)}
                    />
                  </FieldRow>
                  <FieldRow>
                    <FieldTag>IBAN</FieldTag>
                    <AutoTextArea
                      value={activeBeneficiary.iban || ''}
                      onChange={event => updateActiveBeneficiaryField('iban', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('iban', event.target.value)}
                    />
                  </FieldRow>
                  <FieldRow>
                    <FieldTag>Bank name</FieldTag>
                    <AutoTextArea
                      value={activeBeneficiary.bankName || ''}
                      onChange={event => updateActiveBeneficiaryField('bankName', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('bankName', event.target.value)}
                    />
                  </FieldRow>
                  <FieldRow>
                    <FieldTag>SWIFT code</FieldTag>
                    <AutoTextArea
                      value={activeBeneficiary.swiftCode || ''}
                      onChange={event => updateActiveBeneficiaryField('swiftCode', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('swiftCode', event.target.value)}
                    />
                  </FieldRow>
                  <FieldRow>
                    <FieldTag>Payment purpose</FieldTag>
                    <AutoTextArea
                      value={activeBeneficiary.paymentPurpose || ''}
                      placeholder="{invoiceNumber} and {invoiceDate} are filled in automatically"
                      onChange={event => updateActiveBeneficiaryField('paymentPurpose', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('paymentPurpose', event.target.value)}
                    />
                  </FieldRow>
                </>
              ) : null}
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Payer (customers)</H2>
                <SmallButton type="button" onClick={addCustomer}><FaPlus /> Add customer</SmallButton>
              </PanelHeading>
              <PanelNote>{`Payer: ${payerName || '—'} · ${caseTitle}`}</PanelNote>
              {data.customers.map((customer, index) => (
                <FieldRow key={`customer-${index}`}>
                  <FieldTag>Customer {index + 1}</FieldTag>
                  <AutoTextArea
                    placeholder="Name"
                    value={customer.name || ''}
                    onChange={event => updateCustomerField(index, 'name', event.target.value)}
                    onBlur={() => persistCustomers(data.customers, 'Customer updated.')}
                  />
                  <AutoTextArea
                    placeholder="Address / country"
                    value={customer.address || ''}
                    onChange={event => updateCustomerField(index, 'address', event.target.value)}
                    onBlur={() => persistCustomers(data.customers, 'Customer updated.')}
                  />
                  <IconDangerButton type="button" onClick={() => removeCustomer(index)} title="Remove customer" aria-label="Remove customer">
                    <FaTrash />
                  </IconDangerButton>
                </FieldRow>
              ))}
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Invoice services</H2>
              </PanelHeading>

              {invoiceServiceRows.map((row, index) => (row.kind === 'package' ? (
                <PackageEntryCard
                  key={row.key}
                  row={row}
                  index={index}
                  canMoveUp={index > 0}
                  canMoveDown={index < invoiceServiceRows.length - 1}
                  catalogItems={catalogItems}
                  onCommitField={(field, value) => commitTopLevelField(row.id, field, value)}
                  onRemove={() => removeTopLevelEntry(row.id)}
                  onMoveUp={() => moveTopLevelEntry(row.id, -1)}
                  onMoveDown={() => moveTopLevelEntry(row.id, 1)}
                  onReset={row.isCustomized ? () => resetTopLevelEntry(row.id) : undefined}
                  onCommitChildField={(childId, field, value) => commitPackageChildField(row.id, childId, field, value)}
                  onResetChildField={childId => resetPackageChildEntry(row.id, childId)}
                  onRemoveChild={childId => removePackageChildEntry(row.id, childId)}
                  onMoveChild={(childId, offset) => movePackageChildEntry(row.id, childId, offset)}
                  onAddCustomChild={fields => addCustomChildEntry(row.id, fields)}
                  onAddCatalogChild={catalogId => addCatalogChildEntry(row.id, catalogId)}
                />
              ) : (
                <ServiceLineRow
                  key={row.key}
                  row={row}
                  index={index}
                  catalogPackages={visibleCatalogPackages}
                  onCommit={(field, value) => commitTopLevelField(row.id, field, value)}
                  onRemove={() => removeTopLevelEntry(row.id)}
                  onMoveUp={() => moveTopLevelEntry(row.id, -1)}
                  onMoveDown={() => moveTopLevelEntry(row.id, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < invoiceServiceRows.length - 1}
                  onReset={row.kind === 'item' && row.isCustomized ? () => resetTopLevelEntry(row.id) : undefined}
                />
              )))}
              {!invoiceServiceRows.length ? <PanelNote style={{ margin: 0 }}>No services on this invoice yet.</PanelNote> : null}

              {recentServiceSuggestions.length ? (
                <>
                  <PanelNote style={{ marginTop: 14, marginBottom: 4 }}>Recent (click to add)</PanelNote>
                  <ChipRow>
                    {recentServiceSuggestions.map(entry => {
                      const resolved = resolveServiceRow(entry, catalogItemsById, priceContext);
                      return (
                        <Chip key={entry.id} type="button" onClick={() => addRecentServiceEntry(entry)}>
                          {entry.kind === 'package' ? <FaLayerGroup style={{ marginRight: 4 }} /> : null}
                          {resolved.name} · {formatEuroPreview(resolved.price)}
                        </Chip>
                      );
                    })}
                  </ChipRow>
                </>
              ) : null}

              <FieldRow $align="center" style={{ marginTop: 14 }}>
                <FieldTag>Add custom</FieldTag>
                <PlainTextBase
                  rows={1}
                  placeholder="New custom service name"
                  value={newCustomServiceName}
                  onChange={event => setNewCustomServiceName(event.target.value)}
                />
                <PlainPriceBase
                  rows={1}
                  placeholder="Price or GIFT"
                  value={newCustomServicePrice}
                  onChange={event => setNewCustomServicePrice(event.target.value)}
                />
                <SmallButton type="button" onClick={addCustomServiceEntry}><FaPlus /> Add</SmallButton>
                <SmallButton
                  type="button"
                  title="Add a share of a catalog package's price (e.g. 20%)"
                  onClick={() => (visibleCatalogPackages.length
                    ? addPercentServiceEntry(visibleCatalogPackages[0].id)
                    : toast.error('No packages in the catalog yet.'))}
                >
                  <FaPlus /> % of package
                </SmallButton>
              </FieldRow>

              <div style={{ marginTop: 8 }}>
                <SmallButton type="button" onClick={() => setShowCatalogPicker(current => !current)}>
                  <FaPlus /> {showCatalogPicker ? 'Hide catalog' : 'Add from catalog'}
                </SmallButton>
                {showCatalogPicker ? (
                  <div style={{ marginTop: 8 }}>
                    <CatalogTabs>
                      <CatalogTabButton type="button" $active={catalogTab === 'items'} onClick={() => setCatalogTab('items')}>
                        Services
                      </CatalogTabButton>
                      <CatalogTabButton type="button" $active={catalogTab === 'packages'} onClick={() => setCatalogTab('packages')}>
                        Packages
                      </CatalogTabButton>
                    </CatalogTabs>
                    <CatalogSearchField
                      rows={1}
                      placeholder={catalogTab === 'items' ? 'Search catalog services…' : 'Search catalog packages…'}
                      value={catalogQuery}
                      onChange={event => setCatalogQuery(event.target.value)}
                    />
                    <CatalogPickerList>
                      {catalogTab === 'items' ? filteredCatalogItems.map(item => (
                        <CatalogPickerButton key={item.id} type="button" onClick={() => addCatalogServiceEntry(item.id)}>
                          <span>{item.name}</span>
                        </CatalogPickerButton>
                      )) : filteredCatalogPackages.map(pkg => (
                        <CatalogPickerButton key={pkg.id} type="button" onClick={() => addCatalogPackageEntry(pkg)}>
                          <span><FaLayerGroup style={{ marginRight: 6 }} />{pkg.name}</span>
                        </CatalogPickerButton>
                      ))}
                      {catalogTab === 'items' && !filteredCatalogItems.length ? <PanelNote style={{ margin: 0 }}>No matching catalog services.</PanelNote> : null}
                      {catalogTab === 'packages' && !filteredCatalogPackages.length ? <PanelNote style={{ margin: 0 }}>No matching catalog packages.</PanelNote> : null}
                    </CatalogPickerList>
                  </div>
                ) : null}
              </div>
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
                <FieldTag>Taxes (%)</FieldTag>
                <PlainPriceBase
                  rows={1}
                  inputMode="decimal"
                  value={data.taxPercent}
                  onChange={event => updateTaxPercent(event.target.value)}
                  onBlur={commitTaxPercent}
                  style={{ flex: '0 0 auto' }}
                />
              </FieldRow>
              <SummaryGrid style={{ marginTop: 10 }}>
                <SummaryLine><span>Invoice number</span><span>{invoiceNumber}</span></SummaryLine>
                <SummaryLine><span>Purpose of the payment</span><span style={{ textAlign: 'right', maxWidth: 420 }}>{purposeOfPayment || '—'}</span></SummaryLine>
                <SummaryLine><span>Location</span><span>{payerLocation || '—'}</span></SummaryLine>
                <SummaryLine><span>Subtotal</span><span>{formatEuroPreview(subtotal)}</span></SummaryLine>
                <SummaryLine><span>Amount to be paid</span><span>{formatEuroPreview(total)}</span></SummaryLine>
              </SummaryGrid>
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Notes</H2>
                <SmallButton type="button" onClick={addNote}><FaPlus /> Add note</SmallButton>
              </PanelHeading>
              {data.notes.map((note, index) => (
                <FieldRow key={`note-${index}`}>
                  <FieldTag>Note {index + 1}</FieldTag>
                  <AutoTextArea
                    value={note}
                    onChange={event => updateNote(index, event.target.value)}
                    onBlur={commitNote}
                  />
                  <IconDangerButton type="button" onClick={() => removeNote(index)} title="Remove note" aria-label="Remove note">
                    <FaTrash />
                  </IconDangerButton>
                </FieldRow>
              ))}
              {!data.notes.length ? <PanelNote style={{ margin: 0 }}>No notes yet.</PanelNote> : null}
            </Panel>

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
                      <SmallButton type="button" onClick={recalculateExpectedExpensesSchedule}>
                        <FaSyncAlt /> Recalculate
                      </SmallButton>
                      <PrimaryMiniButton
                        type="button"
                        onClick={handleGenerateExpectedExpensesPdf}
                        disabled={isGeneratingExpectedExpenses}
                        title="Generate the full payment-schedule forecast PDF"
                      >
                        <FaFilePdf /> {isGeneratingExpectedExpenses ? 'Generating…' : 'Generate PDF'}
                      </PrimaryMiniButton>
                      <DangerButton type="button" onClick={deleteExpectedExpensesPlan}><FaTrash /> Delete plan</DangerButton>
                    </>
                  ) : null}
                </div>
              </PanelHeading>
              <PanelNote>
                Pick a program package to auto-build a full billing forecast: one milestone per scheduled payment
                (amount calculated automatically from the catalog), each editable, with room for extra one-off
                services. The first milestone doubles as the program-introduction invoice (included services,
                no per-item price, plus the whole schedule).
              </PanelNote>

              {!expectedExpenses ? (
                <div>
                  <SmallButton type="button" onClick={() => setShowExpectedExpensesPicker(current => !current)}>
                    <FaLayerGroup /> {showExpectedExpensesPicker ? 'Hide packages' : 'Choose a package'}
                  </SmallButton>
                  {showExpectedExpensesPicker ? (
                    <CatalogPickerList style={{ marginTop: 8 }}>
                      {visibleCatalogPackages.map(pkg => (
                        <CatalogPickerButton key={pkg.id} type="button" onClick={() => createExpectedExpensesPlan(pkg)}>
                          <span><FaLayerGroup style={{ marginRight: 6 }} />{pkg.name}</span>
                          <span>{formatEuroPreview(resolveBudgetPriceAmount(pkg.listedPrice, priceContext) ?? pkg.listedPrice)}</span>
                        </CatalogPickerButton>
                      ))}
                      {!visibleCatalogPackages.length ? <PanelNote style={{ margin: 0 }}>No packages in the catalog.</PanelNote> : null}
                    </CatalogPickerList>
                  ) : null}
                </div>
              ) : (
                <>
                  <FieldRow $align="center">
                    <FieldTag>Package</FieldTag>
                    <div style={{ flex: 1, padding: '5px 6px', fontWeight: 700 }}>{expectedExpenses.packageSnapshot.name}</div>
                    <span style={{ fontWeight: 800, color: 'var(--km-accent)', padding: '5px 6px' }}>
                      {formatEuroPreview(expectedExpenses.packageSnapshot.listedPrice)}
                    </span>
                  </FieldRow>
                  {expectedExpensesView && Math.round(expectedExpensesView.packageSharePercent * 100) / 100 !== 100 ? (
                    <PanelNote style={{ color: 'var(--km-danger)' }}>
                      The percent-of-package rows add up to {expectedExpensesView.packageSharePercent}% of the package price, not 100%.
                    </PanelNote>
                  ) : null}
                  <PanelNote>
                    Plan totals {formatEuroPreview(expectedExpensesView?.totalPlanned)} across all milestones (package share + extras).
                  </PanelNote>

                  {expectedExpensesView?.milestoneRows.map(({ milestone, serviceRows, subtotal, amountDue }, index) => (
                    <MilestoneCard
                      key={milestone.id}
                      index={index}
                      milestone={milestone}
                      serviceRows={serviceRows}
                      subtotal={subtotal}
                      amountDue={amountDue}
                      catalogItems={catalogItems}
                      catalogPackages={visibleCatalogPackages}
                      onCommitField={(field, value) => commitMilestoneField(milestone.id, field, value)}
                      onToggleOverview={() => toggleMilestoneOverview(milestone.id)}
                      onCommitServiceField={(entryId, field, value) => commitMilestoneServiceField(milestone.id, entryId, field, value)}
                      onRemoveService={entryId => removeMilestoneServiceEntry(milestone.id, entryId)}
                      onResetService={entryId => resetMilestoneServiceEntry(milestone.id, entryId)}
                      onAddCustomService={fields => addMilestoneCustomService(milestone.id, fields)}
                      onAddCatalogService={catalogId => addMilestoneCatalogService(milestone.id, catalogId)}
                      onAddPercentService={() => addMilestonePercentService(milestone.id)}
                    />
                  ))}
                </>
              )}
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>PDF preview</H2>
              </PanelHeading>
              <PanelNote>
                Scaled-down mock-ups of the pages "Generate PDF" would produce, built from the same rows and totals -
                a quick way to spot a too-long name or a lopsided total before generating the real file.
              </PanelNote>
              <PdfPagePreviewStrip
                title="Invoice"
                emptyMessage="Add services to preview the invoice PDF."
                pages={invoiceServiceRows.length ? [{
                  key: 'invoice',
                  label: `Invoice ${invoiceNumber}`,
                  subtitle: caseTitle,
                  rows: invoiceServiceRows,
                  subtotal,
                  taxPercent: data.taxPercent,
                  total,
                }] : []}
              />
              <div style={{ marginTop: 14 }}>
                <PdfPagePreviewStrip
                  title="Expected expenses"
                  emptyMessage="Choose a package to preview the expected-expenses PDF."
                  pages={(expectedExpensesView?.milestoneRows || []).map(({ milestone, serviceRows, subtotal: milestoneSubtotal, amountDue }, index) => ({
                    key: milestone.id,
                    label: `#${index + 1} ${milestone.title}`,
                    badge: milestone.showPackageOverview ? 'Overview' : null,
                    rows: serviceRows,
                    subtotal: milestoneSubtotal,
                    taxPercent: milestone.taxPercent,
                    total: amountDue,
                  }))}
                />
              </div>
            </Panel>
          </>
        ) : null}
      </Shell>
    </Page>
  );
};

export default InvoiceBuilderPage;
