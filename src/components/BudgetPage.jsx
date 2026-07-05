import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, remove, set, update } from 'firebase/database';
import { FaCheck, FaChevronDown, FaChevronUp, FaFilePdf, FaTimes, FaUpload } from 'react-icons/fa';
import { database } from './config';

const USD_ITEM_IDS = new Set([
  'sm-program-compensation',
  'surrogate-mother-compensation',
  'sm-compensation',
]);
const USD_TO_EUR_RATE = 0.92;
const INCLUDED_PREVIEW_LIMIT = 6;
const POPULAR_PACKAGE_ID = '3';
const POPULAR_PACKAGE_BADGE = 'Most popular';
const GUARANTEED_PACKAGE_IDS = new Set(['4', '5']);
const FROM_PRICE_ITEM_IDS = new Set(['43', '49', '54', '61', '63', '64', '65']);
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

const normalizeCatalog = catalog => ({
  packages: Array.isArray(catalog?.packages) ? catalog.packages : [],
  items: Array.isArray(catalog?.items) ? catalog.items : [],
  clientNotes: Array.isArray(catalog?.clientNotes) ? catalog.clientNotes : [],
  technical: catalog?.technical && typeof catalog.technical === 'object' ? catalog.technical : {},
});

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

const Section = styled.section`
  margin-top: 28px;
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
  padding: 22px;
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
  margin: 0 0 12px;
  color: #7a4c2f;
  font-size: clamp(32px, 8vw, 46px);
  font-weight: 900;
  letter-spacing: -0.06em;
`;

const Description = styled.p`
  margin: 0;
  color: #6d6259;
  font-size: 15px;
  line-height: 1.56;
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
  padding: 17px 18px;
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
  padding: 13px 0;
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
  margin: 5px 0 0;
  color: #7e7369;
  font-size: 13px;
  line-height: 1.45;
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

const EditableField = styled.label`
  display: grid;
  gap: 5px;
  margin-top: 9px;
  color: #7b6553;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const EditInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dfcdbc;
  border-radius: 12px;
  background: rgba(255, 250, 244, 0.92);
  color: #382d24;
  padding: 10px 11px;
  font-size: 14px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: normal;
`;

const EditTextarea = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dfcdbc;
  border-radius: 12px;
  background: rgba(255, 250, 244, 0.92);
  color: #382d24;
  min-height: 74px;
  padding: 10px 11px;
  font-size: 14px;
  line-height: 1.45;
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

const BudgetPage = () => {
  const [catalog, setCatalog] = useState(() => normalizeCatalog(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openPrograms, setOpenPrograms] = useState({});
  const [openDetails, setOpenDetails] = useState({});
  const [openCategories, setOpenCategories] = useState({});
  const [expandedIncluded, setExpandedIncluded] = useState({});
  const [query, setQuery] = useState('');
  const [showStickyContact, setShowStickyContact] = useState(false);
  const fileInputRef = useRef(null);
  const isAdminUploadVisible = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('admin') === '1';

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

  const sortedPackages = useMemo(() => {
    return [...catalog.packages].sort((a, b) => Number(a.listedPrice || 0) - Number(b.listedPrice || 0));
  }, [catalog.packages]);

  const groupedExpenses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.items.reduce((groups, item) => {
      const searchableText = `${item.name || ''} ${item.description || ''} ${item.internalNote || ''}`.toLowerCase();
      if (normalizedQuery && !searchableText.includes(normalizedQuery)) return groups;
      const category = item.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
      return groups;
    }, {});
  }, [catalog.items, query]);

  const handleUploadClick = () => fileInputRef.current?.click();

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

  const renderEditableFields = (collection, record, priceField = 'price') => (
    <>
      <EditableField>
        Name
        <EditInput
          value={record.name || ''}
          onChange={event => handleCatalogFieldChange(collection, record.id, 'name', event.target.value)}
          onBlur={event => persistCatalogRecordField(collection, record.id, 'name', event.target.value)}
        />
      </EditableField>
      <EditableField>
        Description
        <EditTextarea
          value={record.description || ''}
          onChange={event => handleCatalogFieldChange(collection, record.id, 'description', event.target.value)}
          onBlur={event => persistCatalogRecordField(collection, record.id, 'description', event.target.value)}
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
    </>
  );

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
            {isAdminUploadVisible ? (
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
            <Section aria-labelledby="budget-programs-title">
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
                    ? program.children.map(id => itemsById.get(String(id))).filter(Boolean)
                    : [];
                  const includedExpanded = Boolean(expandedIncluded[program.id]);
                  const visibleIncludedItems = includedExpanded
                    ? includedItems
                    : includedItems.slice(0, INCLUDED_PREVIEW_LIMIT);
                  return (
                    <ProgramCard key={program.id} $guaranteed={isGuaranteed}>
                      {isPopular ? <Badge>{POPULAR_PACKAGE_BADGE}</Badge> : null}
                      {isGuaranteed ? <ProgramMeta>Guaranteed program</ProgramMeta> : null}
                      <ProgramName>{program.name}</ProgramName>
                      <Price>{formatMoney(program.listedPrice, program.currency || 'EUR')}</Price>
                      {program.description ? <Description>{program.description}</Description> : null}
                      {renderInternalNote('packages', program)}
                      {renderEditableFields('packages', program, 'listedPrice')}
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
                                      {detailOpen ? <Muted>{item.description}</Muted> : null}
                                      <DetailButton type="button" onClick={() => toggleDetail(item.id)}>
                                        {detailOpen ? 'Hide details' : 'Show details'}
                                      </DetailButton>
                                    </>
                                  ) : null}
                                  {renderInternalNote('items', item)}
                                  {renderEditableFields('items', item)}
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

            <Section aria-labelledby="budget-expenses-title">
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
                      <AccordionHeader type="button" onClick={() => toggleCategory(category)} aria-expanded={isOpen}>
                        <span>{getCategoryLabel(category)} {minimumPrice ? <Count>{minimumPrice}</Count> : null}</span>
                        {isOpen ? <FaChevronUp /> : <FaChevronDown />}
                      </AccordionHeader>
                      {isOpen ? (
                        <ExpenseRows>
                          {items.map(item => (
                            <ExpenseRow key={item.id}>
                              <ExpenseTop>
                                <ExpenseName>{item.name}</ExpenseName>
                                <ExpensePrice>{getExpensePriceLabel(item)}</ExpensePrice>
                              </ExpenseTop>
                              {item.description ? <Muted>{item.description}</Muted> : null}
                              {item.extraUnit && item.extraUnitPrice ? (
                                <Muted>Additional {item.extraUnit}: {formatMoney(item.extraUnitPrice, 'EUR')}</Muted>
                              ) : null}
                              {renderInternalNote('items', item)}
                              {renderEditableFields('items', item)}
                            </ExpenseRow>
                          ))}
                        </ExpenseRows>
                      ) : null}
                    </Accordion>
                  );
                })}
              </AccordionList>
            </Section>

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
