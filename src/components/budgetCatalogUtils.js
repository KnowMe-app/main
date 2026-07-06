// Shared helpers for the budget catalog: used by BudgetPage (screen) and BudgetPdfDocument (export).

export const USD_ITEM_IDS = new Set([
  '22',
  'sm-program-compensation',
  'surrogate-mother-compensation',
  'sm-compensation',
]);
export const USD_TO_EUR_RATE = 0.92;
// Items whose catalog price is the lower bound of a range (or a base price with add-ons).
export const FROM_PRICE_ITEM_IDS = new Set(['32', '43', '49', '54', '61', '63', '64', '65']);
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

const CLIENT_NOTE_GROUP_LABELS = {
  programMilestones: 'Milestones for the intended parents',
  surrogateMotherExpenses: "Surrogate mother's expenses",
  general: 'Client notes',
};

const prettifyKey = key => String(key || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[-_]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

export const formatMoney = (value, currency = 'EUR') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `— ${currency || 'EUR'}`;
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)} ${currency || 'EUR'}`;
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

export const getItemDisplayAmount = item => {
  const basePrice = Number(item?.price);
  if (!Number.isFinite(basePrice)) return null;
  const isUsd = USD_ITEM_IDS.has(String(item?.id || '').trim());
  return isUsd ? basePrice * USD_TO_EUR_RATE : basePrice;
};

export const getItemDisplayPrice = item => {
  const amount = getItemDisplayAmount(item);
  return amount === null ? formatMoney(item?.price, 'EUR') : formatMoney(amount, 'EUR');
};

export const getExpensePriceLabel = item => {
  const prefix = FROM_PRICE_ITEM_IDS.has(String(item?.id)) ? 'from ' : '';
  return `${prefix}${getItemDisplayPrice(item)}`;
};

export const getCategoryLabel = category => {
  const key = String(category || 'Other');
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return prettifyKey(key) || 'Other';
};

export const getCategoryMinimumPrice = items => {
  const amounts = items.map(getItemDisplayAmount).filter(amount => Number.isFinite(amount));
  if (!amounts.length) return '';
  return `from ${formatMoney(Math.min(...amounts), 'EUR')}`;
};

export const getVisibleSortedPackages = catalog =>
  (Array.isArray(catalog?.packages) ? catalog.packages : [])
    .filter(program => !program.hidden)
    .sort((a, b) => Number(a.listedPrice || 0) - Number(b.listedPrice || 0));

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
