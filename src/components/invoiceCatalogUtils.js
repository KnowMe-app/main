// Shared helpers for the admin invoice builder (InvoiceBuilderPage + InvoicePdfDocument).
//
// invoiceServices / recentServices rows are stored as small JSON objects (an "entry"):
//   { id, kind: 'item', catalogId }                 -> a live reference to a budget/items row
//   { id, kind: 'item', catalogId, customized: true, name?, description?, price? }
//                                                     -> the same reference, but with one or more
//                                                        fields pinned to a local value instead of
//                                                        following the shared budget catalog
//   { id, kind: 'custom', name, price, description? } -> a one-off line with no catalog link
//   { id, kind: 'package', catalogId, children: [...] } -> a whole budget/packages program, its
//                                                        line items copied in as child entries
//                                                        (each child is itself an 'item' or 'custom'
//                                                        entry). Editing/removing/reordering a
//                                                        child, or renaming the package, flips
//                                                        `customized: true` on the package.
//
// Older data may still contain plain strings ("id15", "Name || Price") - normalizeServiceEntry
// upgrades those to the object shape on load, so the rest of the app only ever sees objects.

import { getItemDisplayAmount } from './budgetCatalogUtils';

const SERVICE_PRICE_SEPARATOR = '||';
const CATALOG_ID_PREFIX = 'id';

const pad2 = value => String(value).padStart(2, '0');

const toNumber = value => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const createEntryId = () => `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const normalizeInvoiceData = raw => ({
  beneficiaries: Array.isArray(raw?.beneficiaries) ? raw.beneficiaries : [],
  beneficiaryIds: Array.isArray(raw?.beneficiaryIds) ? raw.beneficiaryIds.map(String) : [],
  customers: Array.isArray(raw?.customers) ? raw.customers : [],
  recentServices: normalizeServiceEntries(raw?.recentServices),
  invoiceServices: normalizeServiceEntries(raw?.invoiceServices),
  notes: Array.isArray(raw?.notes) ? raw.notes : [],
  taxPercent: Number.isFinite(Number(raw?.taxPercent)) ? Number(raw.taxPercent) : 0,
});

export const isInvoiceDataShape = raw => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return ['beneficiaries', 'beneficiaryIds', 'customers', 'recentServices', 'invoiceServices', 'notes']
    .every(field => Array.isArray(raw[field]))
    && (raw.taxPercent === undefined || Number.isFinite(Number(raw.taxPercent)));
};

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

// --- Entry constructors ------------------------------------------------------

export const makeCatalogItemEntry = (catalogId, { id } = {}) => ({
  id: id || createEntryId(),
  kind: 'item',
  catalogId: String(catalogId),
});

export const makeCustomEntry = ({ name = '', price = 0, description = '' } = {}, { id } = {}) => ({
  id: id || createEntryId(),
  kind: 'custom',
  name: String(name || '').trim(),
  price: toNumber(price),
  ...(String(description || '').trim() ? { description: String(description).trim() } : {}),
});

// pkg: a budget/packages record ({ id, children: [itemId, ...] }). Its children are copied in as
// plain catalog-item entries - editing/removing any of them below marks the package as customized.
export const makeCatalogPackageEntry = (pkg, { id } = {}) => ({
  id: id || createEntryId(),
  kind: 'package',
  catalogId: String(pkg?.id ?? ''),
  children: (Array.isArray(pkg?.children) ? pkg.children : []).map(childId => makeCatalogItemEntry(childId)),
});

// Deep-clones an entry (and, for packages, its children) with fresh ids - used whenever a
// recent/suggested entry is re-added, so two invoice rows never share a React key.
export const cloneEntryWithNewId = entry => {
  if (!entry || typeof entry !== 'object') return entry;
  const clone = { ...entry, id: createEntryId() };
  if (entry.kind === 'package') {
    clone.children = (Array.isArray(entry.children) ? entry.children : []).map(cloneEntryWithNewId);
  }
  return clone;
};

// --- Legacy string parsing / normalization ------------------------------------------------------

// "id15" -> catalog reference · "Name || Price" -> a custom one-off line.
export const parseLegacyServiceString = raw => {
  const text = String(raw ?? '').trim();
  if (text.includes(SERVICE_PRICE_SEPARATOR)) {
    const [namePart, ...priceParts] = text.split(SERVICE_PRICE_SEPARATOR);
    return { kind: 'custom', name: namePart.trim(), price: toNumber(priceParts.join(SERVICE_PRICE_SEPARATOR)) };
  }
  const catalogMatch = new RegExp(`^${CATALOG_ID_PREFIX}(.+)$`, 'i').exec(text);
  if (catalogMatch) return { kind: 'item', catalogId: catalogMatch[1] };
  return { kind: 'custom', name: text, price: 0 };
};

// Upgrades a raw stored row (legacy string, or an already-object entry that may be missing an id
// or have stale shape) into the canonical entry object. Idempotent.
export const normalizeServiceEntry = raw => {
  if (typeof raw === 'string') {
    const parsed = parseLegacyServiceString(raw);
    return parsed.kind === 'item' ? makeCatalogItemEntry(parsed.catalogId) : makeCustomEntry(parsed);
  }
  if (!raw || typeof raw !== 'object') return makeCustomEntry({});

  const id = raw.id || createEntryId();

  if (raw.kind === 'package') {
    return {
      id,
      kind: 'package',
      catalogId: String(raw.catalogId ?? ''),
      ...(raw.customized ? { customized: true } : {}),
      ...(raw.name !== undefined ? { name: raw.name } : {}),
      ...(raw.description !== undefined ? { description: raw.description } : {}),
      ...(raw.priceOverride !== undefined && raw.priceOverride !== null && raw.priceOverride !== ''
        ? { priceOverride: toNumber(raw.priceOverride) }
        : {}),
      children: normalizeServiceEntries(raw.children),
    };
  }

  if (raw.kind === 'custom') {
    return {
      id,
      kind: 'custom',
      name: raw.name || '',
      price: toNumber(raw.price),
      ...(raw.description ? { description: raw.description } : {}),
    };
  }

  // Default / kind === 'item'.
  return {
    id,
    kind: 'item',
    catalogId: String(raw.catalogId ?? ''),
    ...(raw.customized ? { customized: true } : {}),
    ...(raw.name !== undefined ? { name: raw.name } : {}),
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    ...(raw.price !== undefined && raw.price !== null && raw.price !== '' ? { price: toNumber(raw.price) } : {}),
  };
};

export const normalizeServiceEntries = list => (Array.isArray(list) ? list.map(normalizeServiceEntry) : []);

// --- Editing ------------------------------------------------------------

// Applies a local override for one field of an entry, without ever touching the shared budget
// catalog. On catalog-linked entries (kind 'item'/'package') this flips `customized: true`; on
// packages only name/description/price (stored as priceOverride) are settable this way, since a
// package's own line items are edited individually via the package-children helpers below.
export const setEntryField = (entry, field, value) => {
  if (!entry) return entry;
  if (entry.kind === 'custom') {
    return { ...entry, [field]: field === 'price' ? toNumber(value) : value };
  }
  if (entry.kind === 'package') {
    if (field === 'price') return { ...entry, priceOverride: toNumber(value), customized: true };
    if (field === 'name' || field === 'description') return { ...entry, [field]: value, customized: true };
    return entry;
  }
  return { ...entry, [field]: field === 'price' ? toNumber(value) : value, customized: true };
};

// Drops all local overrides on a catalog-item entry, reverting it to a plain live reference.
export const resetItemEntryOverrides = entry => (entry?.kind === 'item'
  ? { id: entry.id, kind: 'item', catalogId: entry.catalogId }
  : entry);

// Reverts a package entry back to a fresh snapshot of the given budget/packages record, dropping
// every local override and child edit.
export const resetPackageEntryToCatalog = (entry, pkg) => (entry?.kind === 'package'
  ? makeCatalogPackageEntry(pkg, { id: entry.id })
  : entry);

export const updatePackageChildField = (entry, childId, field, value) => {
  if (entry?.kind !== 'package') return entry;
  const children = (entry.children || []).map(child => (child.id === childId ? setEntryField(child, field, value) : child));
  return { ...entry, children, customized: true };
};

export const removePackageChild = (entry, childId) => {
  if (entry?.kind !== 'package') return entry;
  return { ...entry, children: (entry.children || []).filter(child => child.id !== childId), customized: true };
};

export const movePackageChild = (entry, childId, offset) => {
  if (entry?.kind !== 'package') return entry;
  const children = [...(entry.children || [])];
  const index = children.findIndex(child => child.id === childId);
  const targetIndex = index + offset;
  if (index === -1 || targetIndex < 0 || targetIndex >= children.length) return entry;
  [children[index], children[targetIndex]] = [children[targetIndex], children[index]];
  return { ...entry, children, customized: true };
};

export const addCustomChildToPackage = (entry, fields) => {
  if (entry?.kind !== 'package') return entry;
  return { ...entry, children: [...(entry.children || []), makeCustomEntry(fields)], customized: true };
};

export const addCatalogChildToPackage = (entry, catalogId) => {
  if (entry?.kind !== 'package') return entry;
  const alreadyIncluded = (entry.children || []).some(child => child.kind === 'item' && String(child.catalogId) === String(catalogId));
  if (alreadyIncluded) return entry;
  return { ...entry, children: [...(entry.children || []), makeCatalogItemEntry(catalogId)], customized: true };
};

// --- Queries ------------------------------------------------------------

export const isEntryCustomized = entry => (entry?.kind === 'custom' ? true : Boolean(entry?.customized));

// A stable identity for an entry, ignoring its id - used to dedupe "recent services" chips and to
// stop the same catalog item/package being added to the invoice twice.
export const getEntryIdentityKey = entry => {
  if (!entry) return '';
  if (entry.kind === 'package') return `package:${entry.catalogId}`;
  if (entry.kind === 'item') return `item:${entry.catalogId}`;
  return `custom:${entry.name || ''}:${entry.price || 0}:${entry.description || ''}`;
};

// --- Resolving entries to display rows ------------------------------------------------------

// priceContext: { itemsById, rates, packagesById } - the same itemsById/rates shape
// BudgetPdfDocument/BudgetPage use to resolve formula prices against NBU exchange rates, plus an
// optional packagesById map (budget/packages, keyed by id) so an un-renamed package entry keeps
// following its catalog name/description the same way an un-edited item entry does. A package's
// `children` are always a frozen snapshot taken when it was added - they never live-track the
// catalog, since that's the whole point of pinning a specific set of services to an invoice.
export const resolveServiceRow = (entry, catalogItemsById, priceContext = {}) => {
  if (entry?.kind === 'package') {
    const pkg = priceContext.packagesById?.get?.(String(entry.catalogId));
    const children = Array.isArray(entry.children) ? entry.children : [];
    const resolvedChildren = children.map(child => resolveServiceRow(child, catalogItemsById, priceContext));
    const childrenTotal = resolvedChildren.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
    const hasPriceOverride = entry.priceOverride !== undefined && entry.priceOverride !== null;
    return {
      key: entry.id,
      id: entry.id,
      kind: 'package',
      catalogId: entry.catalogId,
      missing: !pkg,
      isCustomized: Boolean(entry.customized),
      name: entry.name ?? pkg?.name ?? `Package ${entry.catalogId}`,
      description: entry.description ?? pkg?.description ?? '',
      price: hasPriceOverride ? Number(entry.priceOverride) || 0 : childrenTotal,
      childrenTotal,
      hasPriceOverride,
      children: resolvedChildren,
    };
  }

  if (entry?.kind === 'custom') {
    return {
      key: entry.id,
      id: entry.id,
      kind: 'custom',
      missing: false,
      isCustomized: true,
      name: entry.name || '',
      description: entry.description || '',
      price: Number(entry.price) || 0,
    };
  }

  const catalogId = entry?.catalogId;
  const item = catalogItemsById?.get?.(String(catalogId));
  const catalogAmount = item ? getItemDisplayAmount(item, { ...priceContext, itemsById: catalogItemsById }) : null;
  return {
    key: entry?.id,
    id: entry?.id,
    kind: 'item',
    catalogId,
    missing: !item,
    isCustomized: Boolean(entry?.customized),
    name: entry?.name ?? item?.name ?? `Unknown catalog service (id${catalogId})`,
    description: entry?.description ?? item?.description ?? '',
    price: entry?.price ?? (catalogAmount == null ? 0 : catalogAmount),
  };
};

export const resolveInvoiceServiceRows = (invoiceServices, catalogItemsById, priceContext = {}) =>
  (Array.isArray(invoiceServices) ? invoiceServices : []).map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

// Subtotal only walks top-level rows: a package row's price already sums its children, so nested
// children are never double-counted.
export const computeInvoiceSubtotal = rows => rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);

export const computeInvoiceTotal = (subtotal, taxPercent) => subtotal * (1 + (Number(taxPercent) || 0) / 100);

// After an invoice is generated, its top-level services move to the front of recentServices (same
// order, deduped by identity) so they're the first quick-pick choices next time.
export const reorderRecentServices = (recentServices, invoiceServices) => {
  const seen = new Set();
  const used = [];
  (Array.isArray(invoiceServices) ? invoiceServices : []).forEach(entry => {
    const key = getEntryIdentityKey(entry);
    if (!key || seen.has(key)) return;
    seen.add(key);
    used.push(entry);
  });
  const rest = (Array.isArray(recentServices) ? recentServices : []).filter(entry => !seen.has(getEntryIdentityKey(entry)));
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

export const getTodayYmd = () => {
  const today = new Date();
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
};
