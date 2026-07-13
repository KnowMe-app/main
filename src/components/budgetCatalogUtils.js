// Shared helpers for the budget catalog: used by BudgetPage (screen) and BudgetPdfDocument (export).

import {
  evaluateBudgetPriceFormula,
  extractBudgetFormulaItemIds,
  isBudgetPriceFormula,
  stripBudgetFormulaPrefix,
} from 'utils/budgetPriceFormula';

export const USD_ITEM_IDS = new Set([
  '22',
  'sm-program-compensation',
  'surrogate-mother-compensation',
  'sm-compensation',
]);
export const USD_TO_EUR_RATE = 0.92;
export const KNOWN_CLIENT_NOTE_GROUPS = ['programMilestones', 'surrogateMotherExpenses'];

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

export const KNOWN_CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

const CLIENT_NOTE_GROUP_LABELS = {
  programMilestones: 'Milestones for the intended parents',
  surrogateMotherExpenses: "Surrogate mother's expenses",
  general: 'Client notes',
};

const FROM_PREFIX_REGEX = /^from\s*/i;
const PLAIN_NUMBER_REGEX = /^[-+]?\d+(?:[.,]\d+)?$/;

const prettifyKey = key => String(key || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[-_]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

// The one money format every UKRCOM document (Budget/Invoice/Payment Details/Expected Expenses)
// and the admin screens use (spec §4): tabular tens/hundreds/thousands with a comma, no copies
// past the decimal for round sums, and exactly two decimals only when the amount genuinely
// carries cents - never silently rounded away.
export const formatMoney = (value, currency = 'EUR') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `— ${currency || 'EUR'}`;
  const rounded = Math.round(amount * 100) / 100;
  const isInteger = Number.isInteger(rounded);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: isInteger ? 0 : 2,
  }).format(rounded);
  return `${formatted} ${currency || 'EUR'}`;
};

export const formatEuroAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '€—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Same rounding rule as formatMoney (2 decimals only when the amount genuinely carries cents),
// but with a "€" symbol instead of a trailing currency code - the admin-UI-facing counterpart
// used across the Invoice Builder (never a bare .toFixed(2), which leaks float noise and drops
// the thousands separator).
export const formatEuroSmart = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '€—';
  const rounded = Math.round(amount * 100) / 100;
  const isInteger = Number.isInteger(rounded);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: isInteger ? 0 : 2,
  }).format(rounded);
};

// Splits a stored price into its "from" flag and the remaining expression
// (a plain number, or a "=..." formula).
export const parseBudgetPriceValue = raw => {
  if (typeof raw === 'number') {
    return { isFrom: false, expression: String(raw), isFormula: false, isEmpty: !Number.isFinite(raw) };
  }
  const text = String(raw ?? '').trim();
  if (!text) return { isFrom: false, expression: '', isFormula: false, isEmpty: true };
  const isFrom = FROM_PREFIX_REGEX.test(text);
  const expression = text.replace(FROM_PREFIX_REGEX, '').trim();
  return { isFrom, expression, isFormula: isBudgetPriceFormula(expression), isEmpty: !expression };
};

// Keeps plain numbers numeric on the backend; formulas and "from ..." strings stay as-is.
export const normalizeBudgetPriceInput = raw => {
  const text = String(raw ?? '').trim();
  if (text === '') return '';
  if (PLAIN_NUMBER_REGEX.test(text)) {
    const numeric = Number(text.replace(',', '.'));
    if (Number.isFinite(numeric)) return roundToCents(numeric);
  }
  return text;
};

// Rounds to the nearest cent - the one point every price resolution path (plain numbers, NBU-rate
// formulas, USD conversion) funnels through, so float noise from division/multiplication never
// reaches a display or a further computation (spec: single shared rounding function, applied
// everywhere a computed amount is produced, not just at the final formatMoney/formatEuroSmart call).
export const roundToCents = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : amount;
};

// Resolves a stored price to a EUR number: plain numbers pass through, formulas
// are evaluated with the NBU rates and idNN references to other items.
export const resolveBudgetPriceAmount = (raw, context = {}, seenIds = new Set()) => {
  const parsed = parseBudgetPriceValue(raw);
  if (parsed.isEmpty) return null;
  if (!parsed.isFormula) {
    const numeric = Number(parsed.expression.replace(',', '.'));
    return Number.isFinite(numeric) ? roundToCents(numeric) : null;
  }
  const { itemsById, rates } = context;
  try {
    return roundToCents(evaluateBudgetPriceFormula(parsed.expression, name => {
      const lower = String(name).toLowerCase();
      if (lower === 'eur') return rates?.eur;
      if (lower === 'usd') return rates?.usd;
      const idMatch = /^id(\d+)$/.exec(lower);
      if (!idMatch) return NaN;
      const itemId = idMatch[1];
      if (seenIds.has(itemId)) return NaN;
      const item = itemsById?.get?.(itemId);
      if (!item) return NaN;
      const nextSeen = new Set(seenIds);
      nextSeen.add(itemId);
      const amount = resolveBudgetPriceAmount(item.price, context, nextSeen);
      return amount == null ? NaN : amount;
    }));
  } catch (error) {
    return null;
  }
};

const formatShortAmount = value => {
  if (!Number.isFinite(value)) return '?';
  return String(Math.round(value * 100) / 100);
};

// Debug line for edit mode: the formula with idNN replaced by service names
// (with their resolved amounts) plus the computed total.
export const describeBudgetPriceFormula = (raw, context = {}) => {
  const parsed = parseBudgetPriceValue(raw);
  if (!parsed.isFormula) return '';
  const { itemsById, rates } = context;
  const readable = stripBudgetFormulaPrefix(parsed.expression)
    .replace(/\bid(\d+)\b/gi, (match, itemId) => {
      const item = itemsById?.get?.(String(itemId));
      if (!item) return `id${itemId}?`;
      const amount = resolveBudgetPriceAmount(item.price, context);
      return `${item.name || `id${itemId}`} [${formatShortAmount(amount == null ? NaN : amount)}]`;
    })
    .replace(/\bEUR\b/g, `EUR ${formatShortAmount(Number(rates?.eur))}`)
    .replace(/\bUSD\b/g, `USD ${formatShortAmount(Number(rates?.usd))}`);
  const total = resolveBudgetPriceAmount(raw, context);
  return `${readable} = ${formatShortAmount(total == null ? NaN : total)}`;
};

// IDs of items referenced from price formulas (sub-services). They are already
// part of another service/package price, so clients should not see them twice.
export const collectFormulaReferencedItemIds = catalog => {
  const ids = new Set();
  const scan = value => {
    const parsed = parseBudgetPriceValue(value);
    if (!parsed.isFormula) return;
    extractBudgetFormulaItemIds(parsed.expression).forEach(id => ids.add(String(id)));
  };
  (Array.isArray(catalog?.items) ? catalog.items : []).forEach(item => scan(item?.price));
  (Array.isArray(catalog?.packages) ? catalog.packages : []).forEach(program => scan(program?.listedPrice));
  return ids;
};

export const normalizeClientNotes = value => {
  if (Array.isArray(value)) {
    const notes = value.filter(note => typeof note === 'string' && note.trim());
    return notes.length ? { general: notes } : {};
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((groups, [key, notes]) => {
      if (Array.isArray(notes)) {
        const list = notes.filter(note => typeof note === 'string' && note.trim());
        if (list.length) groups[key] = list;
      }
      return groups;
    }, {});
  }
  return {};
};

export const normalizeCatalog = catalog => ({
  packages: Array.isArray(catalog?.packages) ? catalog.packages : [],
  items: Array.isArray(catalog?.items) ? catalog.items : [],
  clientNotes: normalizeClientNotes(catalog?.clientNotes),
  technical: catalog?.technical && typeof catalog.technical === 'object' ? catalog.technical : {},
});

export const getClientNoteGroupLabel = key =>
  CLIENT_NOTE_GROUP_LABELS[key] || prettifyKey(key) || 'Client notes';

export const getItemDisplayAmount = (item, context = {}) => {
  const basePrice = resolveBudgetPriceAmount(item?.price, context);
  if (basePrice == null) return null;
  const isUsd = USD_ITEM_IDS.has(String(item?.id || '').trim());
  return isUsd ? roundToCents(basePrice * USD_TO_EUR_RATE) : basePrice;
};

export const getItemDisplayPrice = (item, context = {}) => {
  const amount = getItemDisplayAmount(item, context);
  return amount === null ? formatMoney(item?.price, 'EUR') : formatMoney(amount, 'EUR');
};

// Only the actual stored price decides the "from" prefix — never hardcode it per item id.
export const isFromPricedItem = item => parseBudgetPriceValue(item?.price).isFrom;

export const getExpensePriceLabel = (item, context = {}) => {
  const prefix = isFromPricedItem(item) ? 'from ' : '';
  return `${prefix}${getItemDisplayPrice(item, context)}`;
};

// Real cost of a package: the sum of its included services (sub-service
// formulas resolved). Used as the margin marker next to the package price.
export const computePackageChildrenTotal = (program, context = {}) => {
  const children = Array.isArray(program?.children) ? program.children : [];
  let total = 0;
  let resolvedCount = 0;
  children.forEach(id => {
    const item = context.itemsById?.get?.(String(id));
    const amount = item ? getItemDisplayAmount(item, context) : null;
    if (amount != null) {
      total += amount;
      resolvedCount += 1;
    }
  });
  return { total, count: children.length, resolvedCount };
};

export const getCategoryLabel = category => {
  const key = String(category || 'Other');
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return prettifyKey(key) || 'Other';
};

export const getVisibleSortedPackages = (catalog, context = {}) =>
  (Array.isArray(catalog?.packages) ? catalog.packages : [])
    .filter(program => !program.hidden)
    .sort((a, b) => (resolveBudgetPriceAmount(a.listedPrice, context) || 0)
      - (resolveBudgetPriceAmount(b.listedPrice, context) || 0));

// Every package, hidden ones included, sorted by price - for admin-facing pickers (Invoice
// Builder, Expected Expenses) where a "special offer" package must stay selectable even though
// it's deliberately kept out of the public Program Budget PDF (getVisibleSortedPackages above).
export const getSortedPackages = (catalog, context = {}) =>
  (Array.isArray(catalog?.packages) ? catalog.packages : [])
    .slice()
    .sort((a, b) => (resolveBudgetPriceAmount(a.listedPrice, context) || 0)
      - (resolveBudgetPriceAmount(b.listedPrice, context) || 0));

export const resolveProgramPaymentSchedule = (catalog, program) => {
  const schedules = Array.isArray(catalog?.technical?.paymentSchedules)
    ? catalog.technical.paymentSchedules
    : [];
  if (program?.paymentScheduleId) {
    return schedules.find(schedule => String(schedule.id) === String(program.paymentScheduleId)) || null;
  }
  return program?.paymentSchedule && typeof program.paymentSchedule === 'object'
    ? program.paymentSchedule
    : null;
};

// A payment-schedule entry is either a fixed euro amount ({ amount }, ps-1..ps-5) or a share of
// the package's listed price ({ percent }, ps-6 onwards) - every reader of `paymentSchedules`
// (Budget/Invoice/Expected Expenses) funnels through here instead of reading `payment.amount`
// directly, so the two formats can freely coexist in the same schedule.
export const resolvePaymentAmount = (payment, listedPrice) => {
  if (payment?.amount != null && Number.isFinite(Number(payment.amount))) return roundToCents(Number(payment.amount));
  if (Number.isFinite(Number(payment?.percent)) && listedPrice != null && Number.isFinite(Number(listedPrice))) {
    return roundToCents((Number(listedPrice) * Number(payment.percent)) / 100);
  }
  return null;
};
