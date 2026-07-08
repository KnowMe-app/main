import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, set } from 'firebase/database';
import { FaFilePdf, FaPlus, FaTrash, FaUpload } from 'react-icons/fa';
import { saveAs } from 'file-saver';
import { auth, database, fetchNbuUahExchangeRatesByDate } from './config';
import { parseBudgetPriceValue } from './budgetCatalogUtils';
import { isAdminUid } from 'utils/accessLevel';
import {
  applyPaymentPurposePlaceholders,
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  generateInvoiceIdentifiers,
  getActiveBeneficiary,
  getTodayYmd,
  makeCatalogServiceEntry,
  makeCustomServiceEntry,
  isInvoiceDataShape,
  normalizeInvoiceData,
  parseServiceEntry,
  reorderBeneficiaryIds,
  reorderRecentServices,
  resolveInvoiceServiceRows,
  resolveServiceRow,
} from './invoiceCatalogUtils';

const INVOICE_DATA_PATH = 'invoiceBuilder';
const CATALOG_ITEMS_PATH = 'budget/items';

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

const Page = styled.main`
  min-height: 100vh;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 22px 14px 96px;
  font-family: var(--km-font);
`;

const Shell = styled.div`
  width: min(100%, 980px);
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
  font-size: clamp(28px, 6vw, 44px);
  line-height: 0.98;
  letter-spacing: -0.05em;
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

const MiniButton = styled.button`
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 999px;
  min-height: 38px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.55 : 1)};
`;

const SmallButton = styled(MiniButton)`
  min-height: 28px;
  padding: 4px 10px;
  font-size: 11.5px;
`;

const DangerButton = styled(SmallButton)`
  border-color: var(--km-danger-border);
  color: var(--km-danger);
`;

const Panel = styled.section`
  margin-top: 18px;
  border: 1px solid var(--km-border);
  border-radius: 22px;
  background: var(--km-card);
  padding: 18px;
`;

const PanelHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
`;

const H2 = styled.h2`
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.02em;
`;

const PanelNote = styled.p`
  margin: -6px 0 12px;
  color: var(--km-muted);
  font-size: 12.5px;
  line-height: 1.5;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
`;

const FieldLabel = styled.label`
  display: grid;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  color: var(--km-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const Input = styled.input`
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 9px 10px;
  font-size: 13.5px;
  font-weight: 600;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--km-accent-light);
  }
`;

const Textarea = styled.textarea`
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 9px 10px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
  resize: vertical;
  min-height: 60px;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--km-accent-light);
  }
`;

const Select = styled.select`
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 9px 10px;
  font-size: 13.5px;
  font-weight: 700;
`;

const RowList = styled.div`
  display: grid;
  gap: 8px;
`;

const CustomerRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const ServiceRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px auto;
  gap: 8px;
  align-items: center;
  border-top: 1px solid var(--km-border);
  padding-top: 8px;

  &:first-child {
    border-top: 0;
    padding-top: 0;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const AddRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px auto;
  gap: 8px;
  align-items: center;
  margin-top: 12px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
`;

const Chip = styled.button`
  border: 1px dashed var(--km-border);
  background: var(--km-bg);
  color: var(--km-text);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
`;

const CatalogPickerList = styled.div`
  margin-top: 10px;
  max-height: 220px;
  overflow-y: auto;
  display: grid;
  gap: 6px;
`;

const CatalogPickerButton = styled.button`
  border: 1px solid var(--km-border);
  background: var(--km-bg);
  color: var(--km-text);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12.5px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 8px;
`;

const SummaryGrid = styled.div`
  display: grid;
  gap: 6px;
  font-size: 13.5px;
`;

const SummaryLine = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;

  &:last-child {
    border-top: 1px solid var(--km-border);
    margin-top: 4px;
    padding-top: 8px;
    font-weight: 900;
    color: var(--km-accent);
  }
`;

const StateCard = styled.div`
  padding: 28px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--km-muted);
`;

const formatEuroPreview = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `€${amount.toFixed(2)}` : '€—';
};

const InvoiceBuilderPage = ({ isAdmin = false }) => {
  const isInvoiceAdmin = Boolean(isAdmin) || isAdminUid(auth.currentUser?.uid) || (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('admin') === '1');

  const [data, setData] = useState(() => normalizeInvoiceData(null));
  const [catalogItems, setCatalogItems] = useState([]);
  const [exchangeRates, setExchangeRates] = useState(null);
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [invoiceDateInput, setInvoiceDateInput] = useState(getTodayYmd());
  const [newCustomServiceName, setNewCustomServiceName] = useState('');
  const [newCustomServicePrice, setNewCustomServicePrice] = useState('');
  const [invoiceServicePriceDrafts, setInvoiceServicePriceDrafts] = useState({});
  const [catalogQuery, setCatalogQuery] = useState('');
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const fileInputRef = useRef(null);

  const loadInvoiceData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invoiceSnapshot, catalogSnapshot] = await Promise.all([
        get(ref(database, INVOICE_DATA_PATH)),
        get(ref(database, CATALOG_ITEMS_PATH)),
      ]);
      setData(normalizeInvoiceData(invoiceSnapshot.exists() ? invoiceSnapshot.val() : null));
      setCatalogItems(toArray(catalogSnapshot.exists() ? catalogSnapshot.val() : []));
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

  const activeBeneficiary = useMemo(() => getActiveBeneficiary(data), [data]);

  const hasFormulaInvoiceService = useMemo(() => data.invoiceServices.some(entry => {
    const parsed = parseServiceEntry(entry);
    if (!parsed.isCatalog) return false;
    const item = catalogItemsById.get(String(parsed.catalogId));
    return parseBudgetPriceValue(item?.price).isFormula;
  }), [data.invoiceServices, catalogItemsById]);

  const isFormulaRatePending = hasFormulaInvoiceService && exchangeRatesLoading;
  const formulaRateError = hasFormulaInvoiceService ? exchangeRatesError : '';
  const isGenerateDisabled = loading || Boolean(error) || isGenerating || isFormulaRatePending || Boolean(formulaRateError);

  const priceContext = useMemo(
    () => ({ itemsById: catalogItemsById, rates: exchangeRates }),
    [catalogItemsById, exchangeRates],
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
    const used = new Set(data.invoiceServices);
    return data.recentServices.filter(entry => !used.has(entry)).slice(0, 8);
  }, [data.recentServices, data.invoiceServices]);

  const filteredCatalogItems = useMemo(() => {
    const usedCatalogIds = new Set(
      data.invoiceServices
        .map(entry => parseServiceEntry(entry))
        .filter(parsed => parsed.isCatalog)
        .map(parsed => String(parsed.catalogId)),
    );
    const normalizedQuery = catalogQuery.trim().toLowerCase();
    return catalogItems
      .filter(item => !usedCatalogIds.has(String(item.id)))
      .filter(item => !normalizedQuery || String(item.name || '').toLowerCase().includes(normalizedQuery))
      .slice(0, 30);
  }, [catalogItems, data.invoiceServices, catalogQuery]);

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

  const persistInvoiceServices = async (nextInvoiceServices, successMessage) => {
    await persistPath(`${INVOICE_DATA_PATH}/invoiceServices`, nextInvoiceServices, successMessage);
  };

  // Editing name/price of a row (catalog-linked or custom) always writes it back
  // as a plain "Name || Price" row - a catalog reference only makes sense while
  // it still mirrors the catalog, so editing it detaches it into its own copy.
  const updateInvoiceServiceRow = (index, field, value) => {
    setData(current => {
      const entries = [...current.invoiceServices];
      const resolved = resolveServiceRow(entries[index], catalogItemsById, priceContext);
      const nextName = field === 'name' ? value : resolved.name;
      const nextPrice = field === 'price' ? (Number(String(value).replace(',', '.')) || 0) : resolved.price;
      entries[index] = makeCustomServiceEntry(nextName, nextPrice);
      return { ...current, invoiceServices: entries };
    });
  };

  const commitInvoiceServiceRow = index => {
    const draft = invoiceServicePriceDrafts[index];
    if (draft === undefined) {
      persistInvoiceServices(data.invoiceServices, 'Service updated.');
      return;
    }

    const entries = [...data.invoiceServices];
    const resolved = resolveServiceRow(entries[index], catalogItemsById, priceContext);
    const parsedPrice = Number(String(draft).replace(',', '.'));
    entries[index] = makeCustomServiceEntry(resolved.name, Number.isFinite(parsedPrice) ? parsedPrice : 0);
    setData(current => ({ ...current, invoiceServices: entries }));
    setInvoiceServicePriceDrafts(current => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    persistInvoiceServices(entries, 'Service updated.');
  };

  const removeInvoiceServiceRow = index => {
    const nextInvoiceServices = data.invoiceServices.filter((entry, entryIndex) => entryIndex !== index);
    setData(current => ({ ...current, invoiceServices: nextInvoiceServices }));
    persistInvoiceServices(nextInvoiceServices, 'Service removed.');
  };

  const addServiceEntry = entry => {
    if (data.invoiceServices.includes(entry)) {
      toast.error('This service is already on the invoice.');
      return;
    }
    const nextInvoiceServices = [...data.invoiceServices, entry];
    setData(current => ({ ...current, invoiceServices: nextInvoiceServices }));
    persistInvoiceServices(nextInvoiceServices, 'Service added.');
  };

  const addCatalogServiceEntry = catalogId => {
    addServiceEntry(makeCatalogServiceEntry(catalogId));
    setShowCatalogPicker(false);
    setCatalogQuery('');
  };

  const addCustomServiceEntry = () => {
    const name = newCustomServiceName.trim();
    const price = Number(newCustomServicePrice.replace(',', '.'));
    if (!name) {
      toast.error('Enter a name for the new service.');
      return;
    }
    if (!Number.isFinite(price)) {
      toast.error('Enter a valid price for the new service.');
      return;
    }
    addServiceEntry(makeCustomServiceEntry(name, price));
    setNewCustomServiceName('');
    setNewCustomServicePrice('');
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
      toast.success('Invoice JSON uploaded to backend.');
    } catch (uploadError) {
      console.error('Unable to upload invoice JSON', uploadError);
      toast.error('Unable to upload invoice JSON.');
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
      const blob = await pdf(React.createElement(InvoicePdfDocument, {
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
      })).toBlob();
      saveAs(blob, `invoice-${invoiceNumber.replace(/\//g, '-')}.pdf`);

      const nextRecentServices = reorderRecentServices(data.recentServices, data.invoiceServices);
      setData(current => ({ ...current, recentServices: nextRecentServices }));
      await persistPath(`${INVOICE_DATA_PATH}/recentServices`, nextRecentServices);

      toast.success('Invoice PDF generated.');
    } catch (generateError) {
      console.error('Unable to generate invoice PDF', generateError);
      toast.error('Unable to generate invoice PDF.');
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
            <MiniButton type="button" onClick={handleUploadClick} title="Upload an invoice JSON to the backend">
              <FaUpload /> Upload JSON
            </MiniButton>
            <MiniButton
              type="button"
              onClick={handleGeneratePdf}
              disabled={isGenerateDisabled}
              title="Generate and download the invoice PDF"
            >
              <FaFilePdf /> {isGenerating ? 'Generating…' : 'Generate PDF'}
            </MiniButton>
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
                <div style={{ display: 'flex', gap: 8 }}>
                  <SmallButton type="button" onClick={addBeneficiary}><FaPlus /> Add</SmallButton>
                  <DangerButton type="button" onClick={deleteActiveBeneficiary}><FaTrash /> Delete</DangerButton>
                </div>
              </PanelHeading>
              <FieldGrid style={{ marginBottom: 10 }}>
                <FieldLabel>
                  Active beneficiary
                  <Select value={activeBeneficiary?.id || ''} onChange={event => handleSelectBeneficiary(event.target.value)}>
                    {data.beneficiaries.map(beneficiary => (
                      <option key={beneficiary.id} value={beneficiary.id}>{beneficiary.title || beneficiary.id}</option>
                    ))}
                  </Select>
                </FieldLabel>
              </FieldGrid>
              {activeBeneficiary ? (
                <FieldGrid>
                  <FieldLabel>
                    Title
                    <Input
                      value={activeBeneficiary.title || ''}
                      onChange={event => updateActiveBeneficiaryField('title', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('title', event.target.value)}
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Address
                    <Input
                      value={activeBeneficiary.address || ''}
                      onChange={event => updateActiveBeneficiaryField('address', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('address', event.target.value)}
                    />
                  </FieldLabel>
                  <FieldLabel>
                    IBAN
                    <Input
                      value={activeBeneficiary.iban || ''}
                      onChange={event => updateActiveBeneficiaryField('iban', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('iban', event.target.value)}
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Bank name
                    <Input
                      value={activeBeneficiary.bankName || ''}
                      onChange={event => updateActiveBeneficiaryField('bankName', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('bankName', event.target.value)}
                    />
                  </FieldLabel>
                  <FieldLabel>
                    SWIFT code
                    <Input
                      value={activeBeneficiary.swiftCode || ''}
                      onChange={event => updateActiveBeneficiaryField('swiftCode', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('swiftCode', event.target.value)}
                    />
                  </FieldLabel>
                  <FieldLabel style={{ gridColumn: '1 / -1' }}>
                    Payment purpose ({'{invoiceNumber}'} and {'{invoiceDate}'} are filled in automatically)
                    <Textarea
                      value={activeBeneficiary.paymentPurpose || ''}
                      onChange={event => updateActiveBeneficiaryField('paymentPurpose', event.target.value)}
                      onBlur={event => persistActiveBeneficiaryField('paymentPurpose', event.target.value)}
                    />
                  </FieldLabel>
                </FieldGrid>
              ) : null}
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Payer (customers)</H2>
                <SmallButton type="button" onClick={addCustomer}><FaPlus /> Add customer</SmallButton>
              </PanelHeading>
              <PanelNote>{`Payer: ${payerName || '—'} · ${caseTitle}`}</PanelNote>
              <RowList>
                {data.customers.map((customer, index) => (
                  <CustomerRow key={`customer-${index}`}>
                    <Input
                      placeholder="Name"
                      value={customer.name || ''}
                      onChange={event => updateCustomerField(index, 'name', event.target.value)}
                      onBlur={() => persistCustomers(data.customers, 'Customer updated.')}
                    />
                    <Input
                      placeholder="Address / country"
                      value={customer.address || ''}
                      onChange={event => updateCustomerField(index, 'address', event.target.value)}
                      onBlur={() => persistCustomers(data.customers, 'Customer updated.')}
                    />
                    <DangerButton type="button" onClick={() => removeCustomer(index)}><FaTrash /></DangerButton>
                  </CustomerRow>
                ))}
              </RowList>
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Invoice services</H2>
              </PanelHeading>
              <RowList>
                {invoiceServiceRows.map((row, index) => (
                  <ServiceRow key={`${row.key}-${index}`}>
                    <Input
                      value={row.name}
                      onChange={event => updateInvoiceServiceRow(index, 'name', event.target.value)}
                      onBlur={() => commitInvoiceServiceRow(index)}
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={invoiceServicePriceDrafts[index] ?? row.price}
                      onChange={event => setInvoiceServicePriceDrafts(current => ({ ...current, [index]: event.target.value }))}
                      onBlur={() => commitInvoiceServiceRow(index)}
                    />
                    <DangerButton type="button" onClick={() => removeInvoiceServiceRow(index)}><FaTrash /></DangerButton>
                  </ServiceRow>
                ))}
                {!invoiceServiceRows.length ? <PanelNote style={{ margin: 0 }}>No services on this invoice yet.</PanelNote> : null}
              </RowList>

              {recentServiceSuggestions.length ? (
                <>
                  <PanelNote style={{ marginTop: 14, marginBottom: 4 }}>Recent services (click to add)</PanelNote>
                  <ChipRow>
                    {recentServiceSuggestions.map(entry => {
                      const resolved = resolveServiceRow(entry, catalogItemsById, priceContext);
                      return (
                        <Chip key={entry} type="button" onClick={() => addServiceEntry(entry)}>
                          {resolved.name} · {formatEuroPreview(resolved.price)}
                        </Chip>
                      );
                    })}
                  </ChipRow>
                </>
              ) : null}

              <AddRow>
                <Input
                  placeholder="New custom service name"
                  value={newCustomServiceName}
                  onChange={event => setNewCustomServiceName(event.target.value)}
                />
                <Input
                  placeholder="Price"
                  type="text"
                  inputMode="decimal"
                  value={newCustomServicePrice}
                  onChange={event => setNewCustomServicePrice(event.target.value)}
                />
                <SmallButton type="button" onClick={addCustomServiceEntry}><FaPlus /> Add</SmallButton>
              </AddRow>

              <div style={{ marginTop: 10 }}>
                <SmallButton type="button" onClick={() => setShowCatalogPicker(current => !current)}>
                  <FaPlus /> {showCatalogPicker ? 'Hide catalog' : 'Add from services catalog'}
                </SmallButton>
                {showCatalogPicker ? (
                  <>
                    <Input
                      style={{ marginTop: 8 }}
                      placeholder="Search catalog services…"
                      value={catalogQuery}
                      onChange={event => setCatalogQuery(event.target.value)}
                    />
                    <CatalogPickerList>
                      {filteredCatalogItems.map(item => (
                        <CatalogPickerButton key={item.id} type="button" onClick={() => addCatalogServiceEntry(item.id)}>
                          <span>{item.name}</span>
                        </CatalogPickerButton>
                      ))}
                      {!filteredCatalogItems.length ? <PanelNote style={{ margin: 0 }}>No matching catalog services.</PanelNote> : null}
                    </CatalogPickerList>
                  </>
                ) : null}
              </div>
            </Panel>

            <Panel>
              <PanelHeading>
                <H2>Summary</H2>
              </PanelHeading>
              <FieldGrid style={{ marginBottom: 12 }}>
                <FieldLabel>
                  Invoice date
                  <Input
                    type="date"
                    value={invoiceDateInput}
                    onChange={event => setInvoiceDateInput(event.target.value)}
                  />
                </FieldLabel>
                <FieldLabel>
                  Taxes (%)
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={data.taxPercent}
                    onChange={event => updateTaxPercent(event.target.value)}
                    onBlur={commitTaxPercent}
                  />
                </FieldLabel>
              </FieldGrid>
              <SummaryGrid>
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
              <RowList>
                {data.notes.map((note, index) => (
                  <CustomerRow key={`note-${index}`} style={{ gridTemplateColumns: '1fr auto' }}>
                    <Textarea
                      value={note}
                      onChange={event => updateNote(index, event.target.value)}
                      onBlur={commitNote}
                    />
                    <DangerButton type="button" onClick={() => removeNote(index)}><FaTrash /></DangerButton>
                  </CustomerRow>
                ))}
                {!data.notes.length ? <PanelNote style={{ margin: 0 }}>No notes yet.</PanelNote> : null}
              </RowList>
            </Panel>
          </>
        ) : null}
      </Shell>
    </Page>
  );
};

export default InvoiceBuilderPage;
