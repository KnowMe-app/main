// Shared helpers for the admin invoice builder (InvoiceBuilderPage + InvoicePdfDocument).
//
// invoiceServices / recentServices rows are stored as plain strings:
//   "id15"                              -> a service from the main budget catalog (budget/items), by id
//   "Deposit for transportation of SM || 300" -> a custom one-off service, "Name || Price"
// "||" is used instead of "-" as the separator so it never collides with a dash inside a name.

import { resolveBudgetPriceAmount } from './budgetCatalogUtils';

const SERVICE_PRICE_SEPARATOR = '||';
const CATALOG_ID_PREFIX = 'id';

const pad2 = value => String(value).padStart(2, '0');

export const normalizeInvoiceData = raw => ({
  beneficiaries: Array.isArray(raw?.beneficiaries) ? raw.beneficiaries : [],
  beneficiaryIds: Array.isArray(raw?.beneficiaryIds) ? raw.beneficiaryIds.map(String) : [],
  customers: Array.isArray(raw?.customers) ? raw.customers : [],
  recentServices: Array.isArray(raw?.recentServices) ? raw.recentServices : [],
  invoiceServices: Array.isArray(raw?.invoiceServices) ? raw.invoiceServices : [],
  notes: Array.isArray(raw?.notes) ? raw.notes : [],
  taxPercent: Number.isFinite(Number(raw?.taxPercent)) ? Number(raw.taxPercent) : 0,
});

// The active beneficiary is always the first id in beneficiaryIds.
export const getActiveBeneficiary = data => {
  const activeId = data?.beneficiaryIds?.[0];
  const beneficiaries = Array.isArray(data?.beneficiaries) ? data.beneficiaries : [];
  return beneficiaries.find(beneficiary => String(beneficiary.id) === String(activeId)) || beneficiaries[0] || null;
};

// Brings a beneficiary id to the front of beneficiaryIds without touching the
// beneficiaries array order.
export const reorderBeneficiaryIds = (beneficiaryIds, activeId) => {
  const id = String(activeId);
  const rest = (Array.isArray(beneficiaryIds) ? beneficiaryIds : []).filter(existing => String(existing) !== id);
  return [id, ...rest];
};

export const makeCatalogServiceEntry = catalogId => `${CATALOG_ID_PREFIX}${catalogId}`;

export const makeCustomServiceEntry = (name, price) => `${String(name || '').trim()} ${SERVICE_PRICE_SEPARATOR} ${price}`;

// Splits a stored service row into either a catalog reference or a custom name/price pair.
export const parseServiceEntry = entry => {
  const text = String(entry ?? '').trim();
  if (text.includes(SERVICE_PRICE_SEPARATOR)) {
    const [namePart, ...priceParts] = text.split(SERVICE_PRICE_SEPARATOR);
    const priceText = priceParts.join(SERVICE_PRICE_SEPARATOR).trim();
    const price = Number(priceText.replace(',', '.'));
    return {
      isCatalog: false,
      name: namePart.trim(),
      price: Number.isFinite(price) ? price : 0,
    };
  }
  const catalogMatch = /^id(.+)$/i.exec(text);
  if (catalogMatch) {
    return { isCatalog: true, catalogId: catalogMatch[1] };
  }
  return { isCatalog: false, name: text, price: 0 };
};

// Resolves a stored service row to its display name + EUR price, looking up
// catalog references in the budget catalog (budget/items, keyed by id).
export const resolveServiceRow = (entry, catalogItemsById) => {
  const parsed = parseServiceEntry(entry);
  if (parsed.isCatalog) {
    const item = catalogItemsById?.get?.(String(parsed.catalogId));
    if (!item) {
      return {
        key: entry, isCatalog: true, catalogId: parsed.catalogId, missing: true, name: `Unknown catalog service (id${parsed.catalogId})`, price: 0,
      };
    }
    const amount = resolveBudgetPriceAmount(item.price, { itemsById: catalogItemsById });
    return {
      key: entry,
      isCatalog: true,
      catalogId: parsed.catalogId,
      missing: false,
      name: item.name || `id${parsed.catalogId}`,
      description: item.description || '',
      price: amount == null ? 0 : amount,
    };
  }
  return {
    key: entry, isCatalog: false, missing: false, name: parsed.name, price: parsed.price,
  };
};

export const resolveInvoiceServiceRows = (invoiceServices, catalogItemsById) =>
  (Array.isArray(invoiceServices) ? invoiceServices : []).map(entry => resolveServiceRow(entry, catalogItemsById));

export const computeInvoiceSubtotal = rows => rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);

export const computeInvoiceTotal = (subtotal, taxPercent) => subtotal * (1 + (Number(taxPercent) || 0) / 100);

// After an invoice is generated, its services move to the front of recentServices
// (same order, deduped) so they're the first quick-pick choices next time.
export const reorderRecentServices = (recentServices, invoiceServices) => {
  const seen = new Set();
  const used = [];
  (Array.isArray(invoiceServices) ? invoiceServices : []).forEach(entry => {
    if (!entry || seen.has(entry)) return;
    seen.add(entry);
    used.push(entry);
  });
  const rest = (Array.isArray(recentServices) ? recentServices : []).filter(entry => !seen.has(entry));
  return [...used, ...rest];
};

export const buildPayerName = customers =>
  (Array.isArray(customers) ? customers : [])
    .map(customer => String(customer?.name || '').trim())
    .filter(Boolean)
    .join(' and ');

export const buildPayerLocation = customers => {
  const addresses = (Array.isArray(customers) ? customers : [])
    .map(customer => String(customer?.address || '').trim())
    .filter(Boolean);
  return [...new Set(addresses)].join('; ');
};

export const buildCaseTitle = customers => {
  const payerName = buildPayerName(customers);
  return payerName ? `Case of ${payerName}` : 'Case';
};

export const formatInvoiceNumberDate = date => `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;

export const formatInvoicePurposeDate = date => `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;

// Invoice number/date are never stored - they're derived from the chosen invoice
// date at generation time (number uses "/", the purpose placeholder uses ".").
export const generateInvoiceIdentifiers = dateInput => {
  const date = dateInput instanceof Date ? dateInput : new Date(`${dateInput}T00:00:00`);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    invoiceNumber: formatInvoiceNumberDate(safeDate),
    invoiceDate: formatInvoicePurposeDate(safeDate),
  };
};

export const applyPaymentPurposePlaceholders = (template, { invoiceNumber, invoiceDate }) =>
  String(template || '')
    .replaceAll('{invoiceNumber}', invoiceNumber || '')
    .replaceAll('{invoiceDate}', invoiceDate || '');

export const getTodayYmd = () => new Date().toISOString().slice(0, 10);
