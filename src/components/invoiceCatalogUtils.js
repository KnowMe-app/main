// Shared helpers for the admin invoice builder (InvoiceBuilderPage + InvoicePdfDocument).
//
// invoiceServices / recentServices rows are stored as small JSON objects (an "entry"):
//   { id, kind: 'item', catalogId }                 -> a live reference to a budget/items row
//   { id, kind: 'item', catalogId, customized: true, name?, description?, price? }
//                                                     -> the same reference, but with one or more
//                                                        fields pinned to a local value instead of
//                                                        following the shared budget catalog
//   { id, kind: 'custom', name, price, description? } -> a one-off line with no catalog link
//     (price may be paired with a non-numeric `priceLabel`, e.g. "GIFT", for a free-text amount)
//   { id, kind: 'package', catalogId, children: [...] } -> a whole budget/packages program, its
//                                                        line items copied in as child entries
//                                                        (each child is itself an 'item' or 'custom'
//                                                        entry). Editing/removing/reordering a
//                                                        child, or renaming the package, flips
//                                                        `customized: true` on the package.
//   { id, kind: 'percent', packageId, percent }        -> a share of a budget/packages program's
//                                                        listed price (e.g. "20% of package 1").
//                                                        The euro amount is never stored - it's
//                                                        recalculated from the package's live/
//                                                        resolved price every time it's resolved.
//
// Older data may still contain plain strings ("id15", "Name || Price", "id1 || 20%") -
// normalizeServiceEntry upgrades those to the object shape on load, so the rest of the app only
// ever sees objects.

import {
  getItemDisplayAmount, parseBudgetPriceValue, resolveBudgetPriceAmount, resolvePaymentAmount, resolveProgramPaymentSchedule,
} from './budgetCatalogUtils';

const SERVICE_PRICE_SEPARATOR = '||';
const CATALOG_ID_PREFIX = 'id';

const pad2 = value => String(value).padStart(2, '0');

const toNumber = value => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

// Every computed euro amount is rounded to the cent the moment it's derived (not only when it's
// formatted for display) - otherwise floating-point multiplication/division (percent-of-package
// shares, formula-priced catalog items) leaks 12+ digits of noise into the stored/rendered price.
const roundMoney = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

export const createEntryId = () => `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

// Splits a manually-typed price field into a numeric price or a free-text priceLabel (e.g.
// "GIFT") - the interactive-editing counterpart of parseLegacyServiceString's price handling.
export const parseCustomPriceInput = raw => {
  const text = String(raw ?? '').trim();
  if (!text || PLAIN_NUMBER_STRING_REGEX.test(text)) return { price: toNumber(text), priceLabel: '' };
  if (isPriceFormulaInput(text)) return { price: text, priceLabel: '' };
  return { price: 0, priceLabel: text };
};

// One field accepts either a percent or an absolute euro amount interchangeably (design-tasks §1):
// "25" or "25%" reads as 25% of the package price; "10000", "€10,000" or "10000 EUR" reads as a
// fixed 10,000 EUR amount. An explicit % / € / EUR marker always wins; a bare number splits on the
// only unambiguous boundary available - a percent share can't exceed 100.
// A "=..." formula works here too (design-tasks-7 §5) - same engine as every other price field:
// it's evaluated first, then the computed number goes through the same percent-vs-amount split
// (e.g. "=500/1,16" -> 431.03, over 100, so a fixed EUR amount).
export const parsePercentOrAmountInput = raw => {
  const text = String(raw ?? '').trim();
  if (!text) return { percent: 0 };
  if (isPriceFormulaInput(text)) {
    const computed = resolveBudgetPriceAmount(text);
    if (computed == null) return { percent: 0 };
    return computed > 100 ? { amount: computed } : { percent: computed };
  }
  const hasPercentMark = /%/.test(text);
  const hasCurrencyMark = /€|eur/i.test(text);
  const cleaned = text.replace(/%|€|eur/gi, '').replace(/\s+/g, '');
  // "10,000" uses the comma as a thousands separator; "8,5" uses it as a decimal one.
  const normalized = /,\d{3}(?:\D|$)/.test(cleaned) ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return { percent: 0 };
  if (hasPercentMark) return { percent: numeric };
  if (hasCurrencyMark || numeric > 100) return { amount: numeric };
  return { percent: numeric };
};

// One invoice belongs to one case/payer: payerCases is a catalog of every payer/case ever used
// (each a group of one-or-more customers, e.g. a couple), payerCaseIds orders them with the
// active case first - the same "catalog + activate by reordering ids" pattern beneficiaries use.
// `customers` stays in the normalized shape too, always mirroring the active case, so every other
// read site (PDF generation, exports, buildPayerName/buildCaseTitle) keeps reading `data.customers`
// unchanged; only the handful of mutation sites need to know payerCases/payerCaseIds exist.
const normalizePayerCases = raw => {
  const legacyCustomers = Array.isArray(raw?.customers) ? raw.customers : [];
  const rawPayerCases = Array.isArray(raw?.payerCases) ? raw.payerCases : [];
  const payerCases = rawPayerCases.length
    ? rawPayerCases.map(payerCase => ({
      id: String(payerCase?.id ?? createEntryId()),
      customers: Array.isArray(payerCase?.customers) ? payerCase.customers : [],
      // The payer's saved package + one-off services (design-tasks-3 §5): a deliberate snapshot
      // the admin took with "Save for payer", kept on the case itself so it survives switching
      // cases and can be copied to another payer (§6). Absent until the admin saves one.
      ...(Array.isArray(payerCase?.savedServices)
        ? { savedServices: normalizeServiceEntries(payerCase.savedServices) }
        : {}),
    }))
    : [{ id: 'legacy', customers: legacyCustomers }];
  const knownIds = payerCases.map(payerCase => payerCase.id);
  const rawIds = (Array.isArray(raw?.payerCaseIds) ? raw.payerCaseIds : []).map(String).filter(id => knownIds.includes(id));
  const payerCaseIds = [...rawIds, ...knownIds.filter(id => !rawIds.includes(id))];
  return { payerCases, payerCaseIds };
};

// A catalog-backed package may appear at most once on an invoice (the Builder only ever surfaces
// the first package row, and the PDF caps catalog packages at one) - but data saved before that
// restructure could carry the same package several times, each copy invisible and uneditable.
// Duplicates are dropped on load so they can't leak into issued-invoice snapshots (design-tasks-4
// §3). Only same-catalog package copies are deduped: 'percent' rows legitimately repeat (two equal
// installments), and custom packages are distinct by construction.
export const dedupePackageEntries = entries => {
  const seenPackageIds = new Set();
  return (Array.isArray(entries) ? entries : []).filter(entry => {
    if (entry?.kind !== 'package' || !entry.catalogId) return true;
    const key = String(entry.catalogId);
    if (seenPackageIds.has(key)) return false;
    seenPackageIds.add(key);
    return true;
  });
};

export const normalizeInvoiceData = raw => {
  const { payerCases, payerCaseIds } = normalizePayerCases(raw);
  const activeCase = payerCases.find(payerCase => String(payerCase.id) === String(payerCaseIds[0])) || payerCases[0];
  return {
    beneficiaries: Array.isArray(raw?.beneficiaries) ? raw.beneficiaries : [],
    beneficiaryIds: Array.isArray(raw?.beneficiaryIds) ? raw.beneficiaryIds.map(String) : [],
    payerCases,
    payerCaseIds,
    customers: activeCase?.customers || [],
    recentServices: normalizeServiceEntries(raw?.recentServices),
    invoiceServices: dedupePackageEntries(normalizeServiceEntries(raw?.invoiceServices)),
    // Which optional components the generated Invoice PDF includes (round7 spec C.1) - each is
    // independently toggled, editable in the Builder while on, and takes no space in the PDF (or
    // the Builder's own editing area) while off. Defaults to "on" so an admin who never touches
    // these checkboxes gets the same complete PDF as before this panel existed.
    includePackageInPdf: raw?.includePackageInPdf !== undefined ? Boolean(raw.includePackageInPdf) : true,
    includeScheduleInPdf: raw?.includeScheduleInPdf !== undefined ? Boolean(raw.includeScheduleInPdf) : true,
    // Every payment schedule an admin has ever built for a custom package (round4 #4), most
    // recently used first - offered when a package has no catalog schedule to fall back on.
    recentPaymentSchedules: Array.isArray(raw?.recentPaymentSchedules)
      ? raw.recentPaymentSchedules.filter(schedule => schedule && typeof schedule === 'object')
      : [],
    // Every tax rate an admin has ever applied (round4 #5), most recently used first.
    recentTaxRates: Array.isArray(raw?.recentTaxRates)
      ? raw.recentTaxRates.filter(rate => rate && typeof rate === 'object' && Number.isFinite(Number(rate.value)))
      : [],
    notes: Array.isArray(raw?.notes) ? raw.notes : [],
    taxPercent: Number.isFinite(Number(raw?.taxPercent)) ? Number(raw.taxPercent) : 0,
    // A signed carry-over from the client's previous payment, settled after tax (never itself
    // taxed): positive = the client still owes a debt from before, negative = they're sitting on a
    // deposit/credit. Zero (the default) means "nothing to carry over" and is never rendered.
    debtOrDeposit: Number.isFinite(Number(raw?.debtOrDeposit)) ? Number(raw.debtOrDeposit) : 0,
    // Empty string (the default) means "keep auto-generating it from the beneficiary's template" -
    // any other value is an admin edit for this invoice only and wins over the auto-generated text.
    paymentPurposeOverride: typeof raw?.paymentPurposeOverride === 'string' ? raw.paymentPurposeOverride : '',
    // Every invoice ever generated (design-tasks-3 §7), newest first - each a frozen snapshot of
    // what was billed (display rows + totals never re-resolve against the live catalog) plus the
    // raw entries, kept so "Reissue" can put them back into the editor.
    issuedInvoices: normalizeIssuedInvoices(raw?.issuedInvoices),
  };
};

// --- Issued invoices (design-tasks-3 §7) ------------------------------------------------------

// One generated invoice, recorded at "Generate PDF" time. `rows` is the frozen display snapshot
// (name/price as billed - a static record, deliberately not re-resolved against the live catalog);
// `entries` is the raw editable form of the same services, kept only so the Reissue flow can move
// them back into the active editor. `payment` is the admin's own receipt tracking - the currency
// defaults to EUR whenever none was chosen.
export const normalizeIssuedInvoice = raw => ({
  id: raw?.id || createEntryId(),
  payerCaseId: String(raw?.payerCaseId ?? ''),
  invoiceNumber: String(raw?.invoiceNumber || ''),
  invoiceDate: String(raw?.invoiceDate || ''),
  rows: (Array.isArray(raw?.rows) ? raw.rows : []).map(row => ({
    name: String(row?.name || ''),
    price: roundMoney(row?.price),
    ...(row?.priceLabel ? { priceLabel: String(row.priceLabel) } : {}),
    ...(row?.kind ? { kind: String(row.kind) } : {}),
  })),
  entries: normalizeServiceEntries(raw?.entries),
  taxPercent: toNumber(raw?.taxPercent),
  debtOrDeposit: toNumber(raw?.debtOrDeposit),
  amountDue: roundMoney(raw?.amountDue),
  payment: {
    receivedOn: typeof raw?.payment?.receivedOn === 'string' ? raw.payment.receivedOn : '',
    amount: raw?.payment?.amount == null ? '' : String(raw.payment.amount),
    currency: String(raw?.payment?.currency || '').trim() || 'EUR',
  },
});

export const normalizeIssuedInvoices = list => (Array.isArray(list) ? list.map(normalizeIssuedInvoice) : []);

export const makeIssuedInvoiceRecord = ({
  payerCaseId, invoiceNumber, invoiceDate, rows, entries, taxPercent, debtOrDeposit, amountDue,
} = {}) => normalizeIssuedInvoice({
  id: createEntryId(), payerCaseId, invoiceNumber, invoiceDate, rows, entries, taxPercent, debtOrDeposit, amountDue,
});

// "30.01.2026" (the format the Payment Received field suggests) or "2026-01-30" -> "2026-01-30",
// so the NBU archive rates for the day the payment landed can be looked up. Anything else
// (free text, a partial date) resolves to '' - callers fall back to the invoice-date rates.
export const parseReceivedOnYmd = raw => {
  const text = String(raw ?? '').trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoMatch) return text;
  const dottedMatch = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
  if (dottedMatch) return `${dottedMatch[3]}-${pad2(dottedMatch[2])}-${pad2(dottedMatch[1])}`;
  return '';
};

// Converts a received amount to EUR through the NBU UAH cross-rates ({ usd, eur } = UAH per unit,
// the same shape fetchNbuUahExchangeRatesByDate returns and formula pricing already consumes).
// Returns null when the rates don't cover the currency (e.g. GBP) or haven't loaded.
export const convertAmountToEur = (amount, currency, rates) => {
  const numeric = Number(String(amount ?? '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return null;
  const code = String(currency || 'EUR').trim().toUpperCase();
  if (code === 'EUR') return roundMoney(numeric);
  const eurToUah = Number(rates?.eur);
  if (!Number.isFinite(eurToUah) || eurToUah <= 0) return null;
  if (code === 'UAH') return roundMoney(numeric / eurToUah);
  const currencyToUah = Number(rates?.[code.toLowerCase()]);
  if (!Number.isFinite(currencyToUah) || currencyToUah <= 0) return null;
  return roundMoney((numeric * currencyToUah) / eurToUah);
};

// Payment-status color coding for an issued invoice's header amount (design-tasks-4 §4):
// 'full' once the received amount covers the Amount Due, 'partial' while something (but not
// everything) has landed, 'none' otherwise. A non-EUR receipt is compared through its EUR
// equivalent; if the rates can't resolve it, any positive amount reads as 'partial' - never
// 'full' on an unverifiable figure.
export const resolveIssuedInvoicePaymentStatus = (record, rates) => {
  const numeric = Number(String(record?.payment?.amount ?? '').replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric <= 0) return 'none';
  const eurAmount = convertAmountToEur(numeric, record?.payment?.currency, rates);
  if (eurAmount != null && eurAmount >= (Number(record?.amountDue) || 0) - 0.01) return 'full';
  return 'partial';
};

export const isInvoiceDataShape = raw => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return ['beneficiaries', 'beneficiaryIds', 'customers', 'recentServices', 'invoiceServices', 'notes']
    .every(field => Array.isArray(raw[field]))
    && (raw.taxPercent === undefined || Number.isFinite(Number(raw.taxPercent)))
    && (raw.debtOrDeposit === undefined || Number.isFinite(Number(raw.debtOrDeposit)));
};

// The active beneficiary is always the first id in beneficiaryIds.
export const getActiveBeneficiary = data => {
  const activeId = data?.beneficiaryIds?.[0];
  const beneficiaries = Array.isArray(data?.beneficiaries) ? data.beneficiaries : [];
  return beneficiaries.find(beneficiary => String(beneficiary.id) === String(activeId)) || beneficiaries[0] || null;
};

// Brings an id to the front of an id-ordering array without touching the underlying catalog's
// order - shared by beneficiaries (reorderBeneficiaryIds) and payer cases (reorderPayerCaseIds).
const reorderIdsToFront = (ids, activeId) => {
  const id = String(activeId);
  const rest = (Array.isArray(ids) ? ids : []).filter(existing => String(existing) !== id);
  return [id, ...rest];
};

export const reorderBeneficiaryIds = (beneficiaryIds, activeId) => reorderIdsToFront(beneficiaryIds, activeId);

// The active payer case is always the first id in payerCaseIds (same pattern as beneficiaries).
export const getActivePayerCase = data => {
  const activeId = data?.payerCaseIds?.[0];
  const payerCases = Array.isArray(data?.payerCases) ? data.payerCases : [];
  return payerCases.find(payerCase => String(payerCase.id) === String(activeId)) || payerCases[0] || null;
};

export const reorderPayerCaseIds = (payerCaseIds, activeId) => reorderIdsToFront(payerCaseIds, activeId);

// --- Entry constructors ------------------------------------------------------

export const makeCatalogItemEntry = (catalogId, { id } = {}) => ({
  id: id || createEntryId(),
  kind: 'item',
  catalogId: String(catalogId),
});

export const makeCustomEntry = ({ name = '', price = 0, description = '', priceLabel = '' } = {}, { id } = {}) => ({
  id: id || createEntryId(),
  kind: 'custom',
  name: String(name || '').trim(),
  price: isPriceFormulaInput(price) ? String(price).trim() : toNumber(price),
  ...(String(description || '').trim() ? { description: String(description).trim() } : {}),
  ...(String(priceLabel || '').trim() ? { priceLabel: String(priceLabel).trim() } : {}),
});

// A share of a budget/packages program's listed price, e.g. "20% of package 1". The euro amount
// is intentionally never stored - resolveServiceRow recalculates it from the package's price.
// The one exception is an admin who typed an absolute euro figure instead of a percent (design-
// tasks §1: "25" reads as 25%, "10000" as 10,000 EUR) - that fixed `amount` is stored as typed and
// wins over `percent` when the row is priced, so what they entered is exactly what gets billed.
// `expectedExpenseRole: 'scheduled'` marks the one row that was auto-generated from the package's
// payment schedule (as opposed to one an admin added by hand) - see recalculateExpectedExpensesSchedule
// in InvoiceBuilderPage.jsx, which only ever replaces rows carrying that marker.
export const makePercentOfPackageEntry = (packageId, percent, { id, expectedExpenseRole, amount } = {}) => ({
  id: id || createEntryId(),
  kind: 'percent',
  packageId: String(packageId ?? ''),
  percent: toNumber(percent),
  ...(amount != null && amount !== '' && Number.isFinite(Number(amount)) ? { amount: toNumber(amount) } : {}),
  ...(expectedExpenseRole ? { expectedExpenseRole } : {}),
});

export const makePackagePercentEntry = ({ catalogId = '', percent = 0 } = {}, { id } = {}) => ({
  id: id || createEntryId(),
  kind: 'packagePercent',
  catalogId: String(catalogId),
  percent: toNumber(percent),
});

// pkg: a budget/packages record ({ id, children: [itemId, ...] }). Its children are copied in as
// plain catalog-item entries - editing/removing any of them below marks the package as customized.
export const makeCatalogPackageEntry = (pkg, { id } = {}) => ({
  id: id || createEntryId(),
  kind: 'package',
  catalogId: String(pkg?.id ?? ''),
  children: (Array.isArray(pkg?.children) ? pkg.children : []).map(childId => makeCatalogItemEntry(childId)),
});

// A package that has no Budget catalog entry at all (catalogId '') - it can't reference the
// catalog because there is nothing there to reference, so its name/children/price are the
// invoice's own record from the moment it's created. `customized: true` is what makes
// resolveServiceRow/PDF rendering treat it as fully self-contained rather than "missing from the
// catalog": see resolveServiceRow's `missing` flag below and InvoicePdfDocument's PackageBlock,
// which renders a customized package's included services/schedule inline instead of pointing at
// the Budget (there being no Budget entry to point at).
export const makeCustomPackageEntry = ({ name = '' } = {}, { id } = {}) => ({
  id: id || createEntryId(),
  kind: 'package',
  catalogId: '',
  customized: true,
  name: String(name || '').trim() || 'Custom package',
  children: [],
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

const CATALOG_ID_REGEX = new RegExp(`^${CATALOG_ID_PREFIX}(.+)$`, 'i');
const PERCENT_VALUE_REGEX = /^(\d+(?:[.,]\d+)?)\s*%$/;
const PLAIN_NUMBER_STRING_REGEX = /^[-+]?\d+(?:[.,]\d+)?$/;
const isPriceFormulaInput = value => parseBudgetPriceValue(value).isFormula;

// "id15" -> catalog reference · "Name || Price" -> a custom one-off line ·
// "id1 || 20%" -> a share of that catalog package's listed price ·
// "Name || GIFT" (or any other non-numeric, non-percent price) -> a custom line with a free-text
// price label instead of a euro amount.
export const parseLegacyServiceString = raw => {
  const text = String(raw ?? '').trim();
  if (text.includes(SERVICE_PRICE_SEPARATOR)) {
    const [namePart, ...priceParts] = text.split(SERVICE_PRICE_SEPARATOR);
    const trimmedName = namePart.trim();
    const pricePart = priceParts.join(SERVICE_PRICE_SEPARATOR).trim();
    const percentMatch = PERCENT_VALUE_REGEX.exec(pricePart);
    const packageIdMatch = CATALOG_ID_REGEX.exec(trimmedName);
    if (percentMatch && packageIdMatch) {
      return { kind: 'percent', packageId: packageIdMatch[1], percent: toNumber(percentMatch[1]) };
    }
    if (pricePart && !PLAIN_NUMBER_STRING_REGEX.test(pricePart) && !isPriceFormulaInput(pricePart)) {
      return { kind: 'custom', name: trimmedName, price: 0, priceLabel: pricePart };
    }
    return { kind: 'custom', name: trimmedName, price: isPriceFormulaInput(pricePart) ? pricePart : toNumber(pricePart) };
  }
  const catalogMatch = CATALOG_ID_REGEX.exec(text);
  if (catalogMatch) return { kind: 'item', catalogId: catalogMatch[1] };
  return { kind: 'custom', name: text, price: 0 };
};

// Upgrades a raw stored row (legacy string, or an already-object entry that may be missing an id
// or have stale shape) into the canonical entry object. Idempotent.
export const normalizeServiceEntry = raw => {
  if (typeof raw === 'string') {
    const parsed = parseLegacyServiceString(raw);
    if (parsed.kind === 'item') return makeCatalogItemEntry(parsed.catalogId);
    if (parsed.kind === 'percent') return makePercentOfPackageEntry(parsed.packageId, parsed.percent);
    return makeCustomEntry(parsed);
  }
  if (!raw || typeof raw !== 'object') return makeCustomEntry({});

  const id = raw.id || createEntryId();

  if (raw.kind === 'percent') {
    return makePercentOfPackageEntry(raw.packageId, raw.percent, { id, expectedExpenseRole: raw.expectedExpenseRole, amount: raw.amount });
  }

  if (raw.kind === 'package') {
    return {
      id,
      kind: 'package',
      catalogId: String(raw.catalogId ?? ''),
      ...(raw.customized ? { customized: true } : {}),
      ...(raw.name !== undefined ? { name: raw.name } : {}),
      ...(raw.description !== undefined ? { description: raw.description } : {}),
      ...(raw.priceOverride !== undefined && raw.priceOverride !== null && raw.priceOverride !== ''
        ? { priceOverride: isPriceFormulaInput(raw.priceOverride) ? String(raw.priceOverride).trim() : toNumber(raw.priceOverride) }
        : {}),
      ...(raw.billDirectly ? { billDirectly: true } : {}),
      // A per-invoice override of the package's payment schedule (round7 spec C.2) - absent until
      // an admin edits it in the Builder, at which point it freezes the schedule shown/billed on
      // this invoice instead of continuing to track the catalog's live payment schedule.
      ...(Array.isArray(raw.schedule)
        ? {
          schedule: raw.schedule.map(payment => ({
            title: String(payment?.title || ''),
            amount: payment?.amount == null ? null : toNumber(payment.amount),
          })),
        }
        : {}),
      children: normalizeServiceEntries(raw.children),
    };
  }

  if (raw.kind === 'packagePercent') {
    return {
      ...makePackagePercentEntry({ catalogId: raw.catalogId, percent: raw.percent }, { id }),
      ...(raw.expectedExpenseRole ? { expectedExpenseRole: raw.expectedExpenseRole } : {}),
    };
  }

  if (raw.kind === 'custom') {
    return {
      id,
      kind: 'custom',
      name: raw.name || '',
      price: isPriceFormulaInput(raw.price) ? String(raw.price).trim() : toNumber(raw.price),
      ...(raw.description ? { description: raw.description } : {}),
      ...(raw.priceLabel ? { priceLabel: raw.priceLabel } : {}),
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
    ...(raw.price !== undefined && raw.price !== null && raw.price !== ''
        ? { price: isPriceFormulaInput(raw.price) ? String(raw.price).trim() : toNumber(raw.price) }
        : {}),
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
    if (field === 'price') {
      const text = String(value ?? '').trim();
      const { priceLabel, ...rest } = entry;
      if (!text || PLAIN_NUMBER_STRING_REGEX.test(text)) return { ...rest, price: toNumber(text) };
      if (isPriceFormulaInput(text)) return { ...rest, price: text };
      // A non-numeric price (e.g. "GIFT") is kept as a free-text label instead of being coerced to 0.
      return { ...rest, price: 0, priceLabel: text };
    }
    return { ...entry, [field]: value };
  }
  if (entry.kind === 'percent') {
    if (field === 'percent') {
      // The one editable value field accepts a percent OR an absolute euro amount (design-tasks
      // §1) - whichever the admin typed is what gets stored, never a silent conversion.
      const { percent, amount } = parsePercentOrAmountInput(value);
      const { amount: previousAmount, ...rest } = entry;
      if (amount != null) return { ...rest, percent: 0, amount: toNumber(amount) };
      return { ...rest, percent: toNumber(percent) };
    }
    if (field === 'packageId') return { ...entry, packageId: String(value ?? '') };
    return entry;
  }
  if (entry.kind === 'packagePercent') {
    if (field === 'percent' || field === 'price') return { ...entry, percent: toNumber(value) };
    if (field === 'catalogId') return { ...entry, catalogId: String(value) };
    return entry;
  }
  if (entry.kind === 'package') {
    if (field === 'price') {
      const text = String(value ?? '').trim();
      return { ...entry, priceOverride: isPriceFormulaInput(text) ? text : toNumber(text), customized: true };
    }
    if (field === 'name' || field === 'description') return { ...entry, [field]: value, customized: true };
    // A billing preference, not a content override - toggling it never marks the package
    // "customized" (that flag drives the PDF's "customised programme details" note and the
    // catalog Reset button, neither of which applies here).
    if (field === 'billDirectly') return { ...entry, billDirectly: Boolean(value) };
    return entry;
  }
  return {
    ...entry,
    [field]: field === 'price'
      ? (isPriceFormulaInput(value) ? String(value).trim() : toNumber(value))
      : value,
    customized: true,
  };
};

// Drops all local overrides on a catalog-item entry, reverting it to a plain live reference.
export const resetItemEntryOverrides = entry => (entry?.kind === 'item'
  ? { id: entry.id, kind: 'item', catalogId: entry.catalogId }
  : entry);

// Reverts a package entry back to a fresh snapshot of the given budget/packages record, dropping
// every local override and child edit. A custom package (no catalogId, so no `pkg` to revert to)
// is left untouched - there is nothing in the Budget to revert it to without destroying its only
// copy of its own name/children.
export const resetPackageEntryToCatalog = (entry, pkg) => (entry?.kind === 'package' && pkg
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

// Freezes a per-invoice override of the package's payment schedule (round7 spec C.2): once set, it
// wins over the catalog's live payment schedule in resolvePackageEntrySchedule below - a rendering/
// billing choice for this one invoice, not a content edit, so it never flips `customized` (which
// means "no longer matches the catalog package's actual line items").
export const setPackageSchedule = (entry, schedule) => (entry?.kind === 'package'
  ? {
    ...entry,
    // An unresolved (null) amount is kept null rather than coerced through toNumber - otherwise
    // editing just one field of a schedule still showing an unresolved catalog price (e.g. its
    // title) would silently freeze every other row's amount at 0 the moment it's materialized
    // into this per-invoice override.
    schedule: (Array.isArray(schedule) ? schedule : []).map(payment => ({
      title: String(payment?.title || ''),
      amount: payment?.amount == null ? null : toNumber(payment.amount),
    })),
  }
  : entry);

// --- Queries ------------------------------------------------------------

export const isEntryCustomized = entry => (entry?.kind === 'custom' ? true : Boolean(entry?.customized));

// A stable identity for an entry, ignoring its id - used to dedupe "recent services" chips and to
// stop the same catalog item/package being added to the invoice twice.
export const getEntryIdentityKey = entry => {
  if (!entry) return '';
  // A custom package (catalogId '') has no shared catalog identity to dedupe against - two
  // different custom packages must never collide on `package:` and get treated as duplicates.
  if (entry.kind === 'package') return entry.catalogId ? `package:${entry.catalogId}` : `package:custom:${entry.id}`;
  if (entry.kind === 'packagePercent') return `package-percent:${entry.catalogId}:${entry.percent || 0}`;
  if (entry.kind === 'item') return `item:${entry.catalogId}`;
  if (entry.kind === 'percent') {
    return entry.amount != null
      ? `percent:${entry.packageId}:eur${entry.amount}`
      : `percent:${entry.packageId}:${entry.percent}`;
  }
  return `custom:${entry.name || ''}:${entry.price || 0}:${entry.description || ''}`;
};

// --- Resolving entries to display rows ------------------------------------------------------

// priceContext: { itemsById, rates, packagesById } - the same itemsById/rates shape
// BudgetPdfDocument/BudgetPage use to resolve formula prices against NBU exchange rates, plus an
// optional packagesById map (budget/packages, keyed by id) so an un-renamed package entry keeps
// following its catalog name/description the same way an un-edited item entry does. A package's
// `children` are always a frozen snapshot taken when it was added - they never live-track the
// catalog, since that's the whole point of pinning a specific set of services to an invoice.
const formatPercentValue = percent => (Number.isInteger(percent) ? String(percent) : String(Math.round(percent * 100) / 100));

// The payment schedule shown/edited for a package row on this invoice (round7 spec C.2): an
// explicit per-invoice `entry.schedule` (set via setPackageSchedule, once an admin edits it) always
// wins; otherwise it's derived live from the catalog package's own payment schedule, scaled to
// match a price override the same way the package's own billed price already is. priceContext may
// carry `technical` (budget/technical, for catalog.paymentSchedules lookups) alongside the usual
// itemsById/rates/packagesById.
export const resolvePackageEntrySchedule = (entry, listedPriceAmount, billedPrice, priceContext = {}) => {
  if (entry?.kind !== 'package') return [];
  if (Array.isArray(entry.schedule)) {
    return entry.schedule.map((payment, index) => ({
      key: `${entry.id}-schedule-${index}`,
      title: payment.title || `Payment ${index + 1}`,
      // Left unresolved (null) rather than zeroed - see the amount==null branch below, which
      // is where an unresolved amount first reaches a stored per-invoice schedule.
      amount: payment.amount == null ? null : roundMoney(payment.amount),
    }));
  }
  const pkg = priceContext.packagesById?.get?.(String(entry.catalogId));
  if (!pkg) return [];
  const catalogSchedule = resolveProgramPaymentSchedule({ technical: priceContext.technical }, pkg);
  const payments = Array.isArray(catalogSchedule?.payments) ? catalogSchedule.payments : [];
  if (!payments.length) return [];
  const scale = listedPriceAmount ? (Number(billedPrice) || 0) / listedPriceAmount : 1;
  return payments.map((payment, index) => {
    const amount = resolvePaymentAmount(payment, listedPriceAmount);
    return {
      key: `${entry.id}-schedule-${index}`,
      title: payment.title || `Payment ${index + 1}`,
      // A percent-based payment with no resolvable listed price (e.g. a formula-priced package
      // while NBU rates are missing) has no real amount yet - stays null (rendered as "-") rather
      // than a misleading €0, until the price resolves.
      amount: amount == null ? null : roundMoney(amount * scale),
    };
  });
};

export const resolveServiceRow = (entry, catalogItemsById, priceContext = {}) => {
  if (entry?.kind === 'percent') {
    const pkg = priceContext.packagesById?.get?.(String(entry.packageId));
    const packageAmount = pkg
      ? resolveBudgetPriceAmount(pkg.listedPrice, { ...priceContext, itemsById: catalogItemsById })
      : null;
    // A fixed euro `amount` (typed instead of a percent - design-tasks §1) wins over `percent`:
    // the row bills exactly that amount, and the percent becomes the derived, display-only figure.
    const hasFixedAmount = entry.amount != null && entry.amount !== '' && Number.isFinite(Number(entry.amount));
    const fixedAmount = hasFixedAmount ? roundMoney(entry.amount) : null;
    const percent = hasFixedAmount
      ? (packageAmount ? Math.round((fixedAmount / packageAmount) * 1e6) / 1e4 : 0)
      : (Number(entry.percent) || 0);
    const price = hasFixedAmount
      ? fixedAmount
      : (packageAmount == null ? 0 : roundMoney((packageAmount * percent) / 100));
    const packageName = pkg?.name ?? `Package ${entry.packageId}`;
    return {
      key: entry.id,
      id: entry.id,
      kind: 'percent',
      packageId: entry.packageId,
      percent,
      ...(hasFixedAmount ? { amount: fixedAmount } : {}),
      missing: !pkg,
      isCustomized: false,
      name: hasFixedAmount
        ? `${fixedAmount} EUR of ${packageName}`
        : `${formatPercentValue(percent)}% of ${packageName}`,
      description: '',
      price,
      ...(entry.expectedExpenseRole ? { expectedExpenseRole: entry.expectedExpenseRole } : {}),
    };
  }

  if (entry?.kind === 'package') {
    const pkg = priceContext.packagesById?.get?.(String(entry.catalogId));
    const children = Array.isArray(entry.children) ? entry.children : [];
    const resolvedChildren = children.map(child => resolveServiceRow(child, catalogItemsById, priceContext));
    const childrenTotal = roundMoney(resolvedChildren.reduce((sum, row) => sum + (Number(row.price) || 0), 0));
    const hasPriceOverride = entry.priceOverride !== undefined && entry.priceOverride !== null && entry.priceOverride !== '';
    // The billed price is the package's own listed price (a deliberately curated catalog figure),
    // not the sum of whatever line items happen to be attached - that sum is only a reference for
    // the admin to sanity-check budget coverage (see childrenTotal below), and is only ever billed
    // when the package's listed price can't be resolved at all.
    const listedPriceAmount = pkg
      ? resolveBudgetPriceAmount(pkg.listedPrice, { ...priceContext, itemsById: catalogItemsById })
      : null;
    const defaultPrice = listedPriceAmount == null ? childrenTotal : roundMoney(listedPriceAmount);
    return {
      key: entry.id,
      id: entry.id,
      kind: 'package',
      catalogId: entry.catalogId,
      // A package with no catalogId was never meant to reference the catalog (see
      // makeCustomPackageEntry) - only flag "missing" when a catalogId was set but no longer
      // resolves, never for a package that's custom by design.
      missing: Boolean(entry.catalogId) && !pkg,
      isCustomized: Boolean(entry.customized),
      // A "hidden" catalog package (a manually-offered special offer) has no public Budget document
      // of its own - there is nothing for the Invoice's "see your Budget" reference sentence to
      // point at, so PackageBlock must fall back to rendering the full details inline instead.
      isHiddenCatalog: Boolean(pkg?.hidden),
      name: entry.name ?? pkg?.name ?? `Package ${entry.catalogId}`,
      description: entry.description ?? pkg?.description ?? '',
      price: hasPriceOverride
        ? roundMoney(resolveBudgetPriceAmount(entry.priceOverride, { ...priceContext, itemsById: catalogItemsById }) ?? entry.priceOverride)
        : defaultPrice,
      billDirectly: Boolean(entry.billDirectly),
      childrenTotal,
      hasPriceOverride,
      ...((hasPriceOverride && isPriceFormulaInput(entry.priceOverride))
        ? { priceInput: String(entry.priceOverride).trim() }
        : (!hasPriceOverride && isPriceFormulaInput(pkg?.listedPrice) ? { priceInput: String(pkg.listedPrice).trim() } : {})),
      children: resolvedChildren,
      scheduleRows: resolvePackageEntrySchedule(
        entry,
        listedPriceAmount,
        hasPriceOverride
          ? roundMoney(resolveBudgetPriceAmount(entry.priceOverride, { ...priceContext, itemsById: catalogItemsById }) ?? entry.priceOverride)
          : defaultPrice,
        { ...priceContext, itemsById: catalogItemsById },
      ),
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
      price: roundMoney(resolveBudgetPriceAmount(entry.price, { ...priceContext, itemsById: catalogItemsById }) ?? entry.price),
      ...(isPriceFormulaInput(entry.price) ? { priceInput: String(entry.price).trim() } : {}),
      ...(entry.priceLabel ? { priceLabel: entry.priceLabel } : {}),
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
    price: entry?.price !== undefined && entry?.price !== null
      ? roundMoney(resolveBudgetPriceAmount(entry.price, { ...priceContext, itemsById: catalogItemsById }) ?? entry.price)
      : roundMoney(catalogAmount),
    ...(isPriceFormulaInput(entry?.price) ? { priceInput: String(entry.price).trim() } : {}),
  };
};

export const resolveInvoiceServiceRows = (invoiceServices, catalogItemsById, priceContext = {}) =>
  (Array.isArray(invoiceServices) ? invoiceServices : []).map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

// An invoice bills for a whole programme milestone (a package row, or a percent-of-package share of
// one) as soon as any top-level row is tied to a budget/packages program - that's what makes it a
// "Programme Milestone Invoice" rather than a plain "Service Invoice" for a handful of one-off
// services/points (spec's document-type taxonomy, Type A vs Type B). Never hardcoded - always
// derived from what's actually on the invoice.
export const resolveInvoiceDocType = rows => ((Array.isArray(rows) ? rows : [])
  .some(row => row?.kind === 'package' || row?.kind === 'percent') ? 'programme_milestone' : 'service');

// A catalog-backed top-level 'package' row is never billed by its own price - it's a
// reference block (its included-services list and Payment Schedule mirror the catalog
// programme for context, same as Budget) - unless the admin has explicitly flagged it
// `billDirectly` (the "Bill package price" checkbox), for a package that already *is* the
// invoice's whole charge (e.g. a lump-sum "Initial payment" catalog package) with no separate
// "% of package" row to carry the amount. Custom packages have no catalog payment-share row to
// bill alongside them, so their resolved price (children total or override) is always a real
// invoice line and must stay in totals regardless of that flag.
export const computeInvoiceSubtotal = rows => rows
  .filter(row => row?.kind !== 'package' || !row.catalogId || row.billDirectly)
  .reduce((sum, row) => sum + (Number(row.price) || 0), 0);

export const computeInvoiceTotal = (subtotal, taxPercent) => subtotal * (1 + (Number(taxPercent) || 0) / 100);

// Applied after tax, never before it - a debt/deposit carried over from a previous payment is
// already-settled money, not a taxable service, so it never goes through computeInvoiceTotal's
// tax multiplier the way a service row would.
export const computeInvoiceAmountDue = (total, debtOrDeposit) => total + (Number(debtOrDeposit) || 0);

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

// The shared "recent list" mechanism (round4 #6): every recent list beyond recentServices (custom
// payment schedules, tax rates) is a plain array of objects with a stable `id`, offered most-
// recently-used first - one save/display/delete pattern reused for both, instead of building two
// separate ad hoc systems.
export const upsertRecentEntry = (list, entry) => {
  const rest = (Array.isArray(list) ? list : []).filter(existing => String(existing?.id) !== String(entry?.id));
  return [entry, ...rest];
};

// Re-applies an already-saved entry (found by id) to the front of the list, without creating a
// duplicate copy - used when picking an existing recent schedule/tax rate rather than a new one.
export const touchRecentEntry = (list, id) => {
  const items = Array.isArray(list) ? list : [];
  const found = items.find(entry => String(entry?.id) === String(id));
  return found ? upsertRecentEntry(items, found) : items;
};

export const removeRecentEntry = (list, id) =>
  (Array.isArray(list) ? list : []).filter(entry => String(entry?.id) !== String(id));

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

// The first customer's surname (last whitespace-separated token of their name) - used to build the
// `UKRCOM-{DocType}-{ClientLastName}-YYYY-MM-DD.pdf` filenames every generated document shares.
export const buildClientLastName = customers => {
  const firstName = String((Array.isArray(customers) ? customers : [])[0]?.name || '').trim();
  if (!firstName) return 'Client';
  const tokens = firstName.split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] || 'Client';
};

// `UKRCOM-{DocType}-{ClientLastName}-YYYY-MM-DD.pdf`, filesystem-safe (spec §1.1/§2/§3).
export const buildUkrcomFileName = (docType, customers, dateYmd) => {
  const lastName = buildClientLastName(customers).replace(/[^a-z0-9]+/gi, '');
  const datePart = String(dateYmd || getTodayYmd());
  return `UKRCOM-${docType}-${lastName}-${datePart}.pdf`;
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
