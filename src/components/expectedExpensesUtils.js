// "Expected expenses" is a billing forecast for a whole surrogacy program: pick a budget/packages
// program once, and its payment schedule (budget/technical.paymentSchedules) is turned into a
// series of milestones - one future invoice per scheduled payment. Each milestone's amount is
// calculated automatically from the schedule, and stays a plain editable number from then on (the
// plan is its own frozen copy, same as a package entry's children on a regular invoice - it does
// not keep re-syncing with the shared catalog). Admins can attach extra one-off services (custom
// or catalog-linked, e.g. the recurring SM transportation/medical deposits) to any milestone.
//
// The whole plan is stored as invoiceBuilder/expectedExpenses - a single object, not a list of
// documents - so it lives right next to the rest of the invoice-builder JSON on the backend.

import {
  createEntryId,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  makeCatalogItemEntry,
  normalizeServiceEntries,
  resolveServiceRow,
  setEntryField,
} from './invoiceCatalogUtils';

// --- Building a plan from a chosen catalog package + its payment schedule ------------------------------------------------------

// The package overview only ever lists service names (its listed price already covers all of
// them) - no per-item prices are stored or shown.
export const buildPackageOverviewChildren = pkg => (Array.isArray(pkg?.children) ? pkg.children : [])
  .map(catalogId => makeCatalogItemEntry(catalogId));

export const buildMilestonesFromSchedule = (schedule, { taxPercent = 0 } = {}) =>
  (Array.isArray(schedule?.payments) ? schedule.payments : []).map((payment, index) => ({
    id: createEntryId(),
    title: payment?.title || `Payment ${index + 1}`,
    scheduledAmount: Number(payment?.amount) || 0,
    taxPercent,
    // The first milestone doubles as the "introducing the program" invoice: it shows the full
    // package overview (included services + the whole schedule) instead of just its own line.
    showPackageOverview: index === 0,
    additionalServices: [],
  }));

export const buildExpectedExpensesPlan = (pkg, schedule, { taxPercent = 0 } = {}) => ({
  packageId: String(pkg?.id ?? ''),
  packageSnapshot: {
    name: pkg?.name || '',
    description: pkg?.description || '',
    listedPrice: Number(pkg?.listedPrice) || 0,
    currency: pkg?.currency || 'EUR',
    children: buildPackageOverviewChildren(pkg),
  },
  milestones: buildMilestonesFromSchedule(schedule, { taxPercent }),
});

// --- Normalization (defensive parsing of whatever's stored on the backend) ------------------------------------------------------

export const normalizeExpectedExpensesMilestone = raw => ({
  id: raw?.id || createEntryId(),
  title: raw?.title || '',
  scheduledAmount: Number(raw?.scheduledAmount) || 0,
  taxPercent: Number.isFinite(Number(raw?.taxPercent)) ? Number(raw.taxPercent) : 0,
  showPackageOverview: Boolean(raw?.showPackageOverview),
  additionalServices: normalizeServiceEntries(raw?.additionalServices),
});

export const normalizeExpectedExpensesData = raw => {
  if (!raw || typeof raw !== 'object') return null;
  return {
    packageId: String(raw.packageId ?? ''),
    packageSnapshot: {
      name: raw.packageSnapshot?.name || '',
      description: raw.packageSnapshot?.description || '',
      listedPrice: Number(raw.packageSnapshot?.listedPrice) || 0,
      currency: raw.packageSnapshot?.currency || 'EUR',
      children: normalizeServiceEntries(raw.packageSnapshot?.children),
    },
    milestones: Array.isArray(raw.milestones) ? raw.milestones.map(normalizeExpectedExpensesMilestone) : [],
  };
};

// Loose validation for an uploaded expected-expenses JSON, before normalizeExpectedExpensesData
// fills in any missing pieces - mirrors isInvoiceDataShape's role for the main invoice JSON.
export const isExpectedExpensesShape = raw => Boolean(
  raw
  && typeof raw === 'object'
  && !Array.isArray(raw)
  && raw.packageSnapshot
  && typeof raw.packageSnapshot === 'object'
  && Array.isArray(raw.milestones),
);

// --- Editing ------------------------------------------------------------

export const setMilestoneField = (milestone, field, value) => {
  if (field === 'scheduledAmount' || field === 'taxPercent') {
    const numeric = Number(String(value).replace(',', '.'));
    return { ...milestone, [field]: Number.isFinite(numeric) ? numeric : 0 };
  }
  return { ...milestone, [field]: value };
};

export const addMilestoneAdditionalService = (milestone, entry) => ({
  ...milestone,
  additionalServices: [...(milestone.additionalServices || []), entry],
});

export const removeMilestoneAdditionalService = (milestone, entryId) => ({
  ...milestone,
  additionalServices: (milestone.additionalServices || []).filter(entry => entry.id !== entryId),
});

export const updateMilestoneAdditionalServiceField = (milestone, entryId, field, value) => ({
  ...milestone,
  additionalServices: (milestone.additionalServices || [])
    .map(entry => (entry.id === entryId ? setEntryField(entry, field, value) : entry)),
});

// --- Resolving for display/PDF ------------------------------------------------------

export const resolvePackageOverviewRows = (children, catalogItemsById, priceContext = {}) =>
  (Array.isArray(children) ? children : []).map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

export const resolveMilestoneAdditionalRows = (milestone, catalogItemsById, priceContext = {}) =>
  (Array.isArray(milestone?.additionalServices) ? milestone.additionalServices : [])
    .map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

export const computeMilestoneSubtotal = (milestone, additionalRows) =>
  (Number(milestone?.scheduledAmount) || 0) + computeInvoiceSubtotal(additionalRows);

export const computeMilestoneAmountDue = (subtotal, taxPercent) => computeInvoiceTotal(subtotal, taxPercent);

// Sum of every milestone's scheduled amount - shown next to the package's listed price so a
// mismatched schedule (edited milestones that no longer add up to the program price) is obvious.
export const computeMilestonesScheduledTotal = milestones =>
  (Array.isArray(milestones) ? milestones : []).reduce((sum, milestone) => sum + (Number(milestone?.scheduledAmount) || 0), 0);
