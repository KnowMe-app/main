// "Expected expenses" is a billing forecast for a whole surrogacy program: pick a budget/packages
// program once, and its payment schedule (budget/technical.paymentSchedules) is turned into a
// series of groups - one future invoice per scheduled payment, in the same order as the schedule.
// The package is only ever referenced by id (its own default payment schedule is already attached
// to it in the catalog, so no separate paymentScheduleId is stored here).
//
// Each group is nothing more than a list of service rows (the same catalog-item / custom /
// percent-of-package entries used everywhere else in the invoice builder - see
// invoiceCatalogUtils.js). There is no separate "scheduled amount" field: a group's total is
// simply the sum of its rows, and the row that carries the bulk of a payment is normally a
// percent-of-package entry (e.g. "20% of the package price"), so the euro amount recalculates
// automatically whenever the package price changes instead of going stale. Admins can freely add,
// edit, or remove any row - catalog-linked, custom, or percent - on any group.
//
// The whole plan is stored as invoiceBuilder/expectedExpenses - a single object, not a list of
// documents - so it lives right next to the rest of the invoice-builder JSON on the backend. A
// group's title/date/stage is never stored on the group itself - it's read from the package's
// payment schedule by index (mirrors the schedule 1:1) - but the plan does cache the resolved
// title on each milestone at build time (same "frozen snapshot" convention the rest of the
// invoice builder uses for a package entry's children), so rendering never depends on the
// schedule still existing unchanged in the catalog.

import {
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  createEntryId,
  makeCatalogItemEntry,
  makeCustomEntry,
  makePercentOfPackageEntry,
  normalizeServiceEntries,
  resolveServiceRow,
  setEntryField,
} from './invoiceCatalogUtils';
import { resolveProgramPaymentSchedule } from './budgetCatalogUtils';

// --- Building a plan from a chosen catalog package + its payment schedule ------------------------------------------------------

// The package overview only ever lists service names (its listed price already covers all of
// them) - no per-item prices are stored or shown.
export const buildPackageOverviewChildren = pkg => (Array.isArray(pkg?.children) ? pkg.children : [])
  .map(catalogId => makeCatalogItemEntry(catalogId));

// A schedule payment's euro amount is only ever used once, to seed a percent-of-package row (e.g.
// a 8772 EUR first payment on a 40000 EUR package becomes "21.93% of the package") - from then on
// that row is a normal, independently editable service row like any other.
const buildGroupFromSchedulePayment = (pkg, payment) => {
  const listedPrice = Number(pkg?.listedPrice) || 0;
  const amount = Number(payment?.amount) || 0;
  if (!listedPrice || !amount) return [];
  const percent = Math.round((amount / listedPrice) * 10000) / 100;
  return [makePercentOfPackageEntry(pkg?.id, percent, { expectedExpenseRole: 'scheduled' })];
};

// A package needs a resolved, positive listed price before a plan can be built from it - otherwise
// every percent-of-package row would divide by zero. Throws instead of silently building an empty plan.
export const getExpectedExpensesPackagePrice = pkg => {
  const packagePrice = Number(pkg?.listedPrice);
  if (!Number.isFinite(packagePrice) || packagePrice <= 0) {
    throw new Error('Expected expenses require a resolved positive package price.');
  }
  return packagePrice;
};

export const buildMilestonesFromSchedule = (pkg, schedule, { taxPercent = 0 } = {}) =>
  (Array.isArray(schedule?.payments) ? schedule.payments : []).map((payment, index) => ({
    id: createEntryId(),
    title: payment?.title || `Payment ${index + 1}`,
    taxPercent,
    // The first milestone doubles as the "introducing the program" invoice: it shows the full
    // package overview (included services + the whole schedule) instead of just its own line.
    showPackageOverview: index === 0,
    services: buildGroupFromSchedulePayment(pkg, payment),
  }));

const buildPackageSnapshot = pkg => ({
  name: pkg?.name || '',
  description: pkg?.description || '',
  listedPrice: Number(pkg?.listedPrice) || 0,
  currency: pkg?.currency || 'EUR',
  children: buildPackageOverviewChildren(pkg),
});

export const buildExpectedExpensesPlan = (pkg, schedule, { taxPercent = 0 } = {}) => ({
  packageId: String(pkg?.id ?? ''),
  packageSnapshot: buildPackageSnapshot(pkg),
  milestones: buildMilestonesFromSchedule(pkg, schedule, { taxPercent }),
});

// --- Building a plan from a raw "expectedExpenses" upload -----------------------------------------------------------------------
//
// The lean upload shape (see the invoice-builder JSON upload) is just an array of groups, each
// group an array of legacy-style service strings ("id32", "Custom name || 300", "id1 || 20%"),
// lined up 1:1 with the chosen package's default payment schedule. There is no packageId field in
// that shape - the package is implied by the "idX || Y%" rows inside the groups, since every such
// row already names the package it's a share of.

export const isRawExpectedExpensesGroups = raw => Array.isArray(raw) && raw.every(group => Array.isArray(group));

// A freshly uploaded array-of-groups plan has no way to mark which row is "the" auto-generated
// schedule row - by convention it's always the first percent-of-package row of each group (see the
// module docstring), so it's safe to tag unconditionally here. This is only ever run once, at
// upload time - an already-saved plan's milestones are never re-guessed like this on load, since by
// then a user may have deliberately removed the scheduled row and kept only a manual one; that
// ambiguous case is resolved by recalculateExpectedExpensesSchedule (InvoiceBuilderPage.jsx) instead.
export const markLegacyScheduledRow = (services, packageId) => {
  const rows = Array.isArray(services) ? services : [];
  if (!rows.length || rows.some(entry => entry?.expectedExpenseRole)) return rows;
  const [first, ...rest] = rows;
  if (first?.kind !== 'percent' || String(first.packageId) !== String(packageId)) return rows;
  return [{ ...first, expectedExpenseRole: 'scheduled' }, ...rest];
};

// Finds the package id referenced by the first percent-of-package row across all groups.
export const inferPackageIdFromRawGroups = rawGroups => {
  for (const group of (Array.isArray(rawGroups) ? rawGroups : [])) {
    for (const row of (Array.isArray(group) ? group : [])) {
      if (typeof row !== 'string') continue;
      const match = /^\s*id(.+?)\s*\|\|\s*\d+(?:[.,]\d+)?\s*%\s*$/i.exec(row);
      if (match) return match[1];
    }
    for (const entry of (Array.isArray(group) ? group : [])) {
      if (entry && typeof entry === 'object' && entry.kind === 'percent' && entry.packageId) return String(entry.packageId);
    }
  }
  return '';
};

// Builds a full plan from raw groups + the loaded budget catalog. Returns `missingPackage: true`
// when no package could be resolved (nothing is built in that case), and `droppedGroupsCount` for
// any groups beyond the schedule's own step count (they're dropped rather than silently merged).
export const buildExpectedExpensesPlanFromRawGroups = (rawGroups, { catalog, taxPercent = 0, packageId: explicitPackageId } = {}) => {
  const groups = (Array.isArray(rawGroups) ? rawGroups : []).map(normalizeServiceEntries);
  const packageId = String(explicitPackageId || inferPackageIdFromRawGroups(rawGroups) || '');
  const packages = Array.isArray(catalog?.packages) ? catalog.packages : [];
  const pkg = packages.find(candidate => String(candidate.id) === packageId) || null;
  const schedule = pkg ? resolveProgramPaymentSchedule(catalog, pkg) : null;
  const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];

  const milestones = payments.map((payment, index) => ({
    id: createEntryId(),
    title: payment?.title || `Payment ${index + 1}`,
    taxPercent,
    showPackageOverview: index === 0,
    services: markLegacyScheduledRow(groups[index] || [], packageId),
  }));

  return {
    plan: pkg ? { packageId, packageSnapshot: buildPackageSnapshot(pkg), milestones } : null,
    missingPackage: !pkg,
    droppedGroupsCount: Math.max(0, groups.length - payments.length),
  };
};

// --- Normalization (defensive parsing of whatever's stored on the backend) ------------------------------------------------------

// Old persisted milestones may still carry a frozen `scheduledAmount` number (and/or the old
// `additionalServices` field name) from before groups became plain row lists - migrate it into an
// equivalent percent-of-package row (or a plain custom row, if the package price isn't known) so
// the euro total is preserved instead of silently dropped.
export const normalizeExpectedExpensesMilestone = (raw, { packageId = '', listedPrice = 0 } = {}) => {
  const hasOwnServices = Array.isArray(raw?.services);
  const services = normalizeServiceEntries(raw?.services ?? raw?.additionalServices);
  const legacyAmount = Number(raw?.scheduledAmount);
  const migratedServices = !hasOwnServices && Number.isFinite(legacyAmount) && legacyAmount !== 0
    ? [
      listedPrice
        ? makePercentOfPackageEntry(packageId, Math.round((legacyAmount / listedPrice) * 10000) / 100, { expectedExpenseRole: 'scheduled' })
        : makeCustomEntry({ name: raw?.title ? `Scheduled payment (${raw.title})` : 'Scheduled payment', price: legacyAmount }),
      ...services,
    ]
    : services;

  return {
    id: raw?.id || createEntryId(),
    title: raw?.title || '',
    taxPercent: Number.isFinite(Number(raw?.taxPercent)) ? Number(raw.taxPercent) : 0,
    showPackageOverview: Boolean(raw?.showPackageOverview),
    services: migratedServices,
  };
};

export const normalizeExpectedExpensesData = raw => {
  if (!raw || typeof raw !== 'object') return null;
  const packageId = String(raw.packageId ?? '');
  const listedPrice = Number(raw.packageSnapshot?.listedPrice) || 0;
  return {
    packageId,
    packageSnapshot: {
      name: raw.packageSnapshot?.name || '',
      description: raw.packageSnapshot?.description || '',
      listedPrice,
      currency: raw.packageSnapshot?.currency || 'EUR',
      children: normalizeServiceEntries(raw.packageSnapshot?.children),
    },
    milestones: Array.isArray(raw.milestones)
      ? raw.milestones.map(milestone => normalizeExpectedExpensesMilestone(milestone, { packageId, listedPrice }))
      : [],
  };
};

// Loose validation for an uploaded, already-normalized expected-expenses JSON, before
// normalizeExpectedExpensesData fills in any missing pieces - mirrors isInvoiceDataShape's role
// for the main invoice JSON. A raw array-of-groups upload is validated separately, with
// isRawExpectedExpensesGroups, since it has no packageSnapshot/milestones wrapper of its own.
export const isExpectedExpensesShape = raw => Boolean(
  raw
  && typeof raw === 'object'
  && !Array.isArray(raw)
  && raw.packageId !== undefined
  && Array.isArray(raw.milestones)
);

// The compact form persisted to invoiceBuilder/expectedExpenses: every editable field a milestone
// can carry (title/tax/overview/services), with no resolved amounts - the inverse of
// normalizeExpectedExpensesData, so persistExpectedExpenses can round-trip through it.
export const serializeExpectedExpensesData = plan => (plan ? {
  packageId: String(plan.packageId ?? ''),
  packageSnapshot: {
    name: plan.packageSnapshot?.name || '',
    description: plan.packageSnapshot?.description || '',
    listedPrice: Number(plan.packageSnapshot?.listedPrice) || 0,
    currency: plan.packageSnapshot?.currency || 'EUR',
    children: normalizeServiceEntries(plan.packageSnapshot?.children),
  },
  milestones: (Array.isArray(plan.milestones) ? plan.milestones : []).map(milestone => ({
    id: milestone.id || createEntryId(),
    title: milestone.title || '',
    taxPercent: Number(milestone.taxPercent) || 0,
    showPackageOverview: Boolean(milestone.showPackageOverview),
    services: normalizeServiceEntries(milestone.services),
  })),
} : null);

// --- Editing ------------------------------------------------------------

export const setMilestoneField = (milestone, field, value) => {
  if (field === 'taxPercent') {
    const numeric = Number(String(value).replace(',', '.'));
    return { ...milestone, taxPercent: Number.isFinite(numeric) ? numeric : 0 };
  }
  return { ...milestone, [field]: value };
};

export const addMilestoneService = (milestone, entry) => ({
  ...milestone,
  services: [...(milestone.services || []), entry],
});

export const removeMilestoneService = (milestone, entryId) => ({
  ...milestone,
  services: (milestone.services || []).filter(entry => entry.id !== entryId),
});

export const updateMilestoneServiceField = (milestone, entryId, field, value) => ({
  ...milestone,
  services: (milestone.services || [])
    .map(entry => (entry.id === entryId ? setEntryField(entry, field, value) : entry)),
});

// --- Resolving for display/PDF ------------------------------------------------------

export const resolvePackageOverviewRows = (children, catalogItemsById, priceContext = {}) =>
  (Array.isArray(children) ? children : []).map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

export const resolveMilestoneServiceRows = (milestone, catalogItemsById, priceContext = {}) =>
  (Array.isArray(milestone?.services) ? milestone.services : [])
    .map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

export const computeMilestoneSubtotal = rows => computeInvoiceSubtotal(rows);

export const computeMilestoneAmountDue = (subtotal, taxPercent) => computeInvoiceTotal(subtotal, taxPercent);

export const resolveExpectedExpenseRows = (group, catalogItemsById, priceContext = {}) =>
  (Array.isArray(group) ? group : []).map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

// Splits a milestone's resolved rows into the one auto-generated "share of the programme fee" row
// (expectedExpenseRole === 'scheduled') and every other row (SM deposits, catalog add-ons, gifts,
// ...) - the Expected Expenses PDF shows the scheduled share as "N% of programme fee" and every
// other row as a plain compact line (spec §1.2).
export const splitScheduledRows = rows => {
  const list = Array.isArray(rows) ? rows : [];
  return {
    scheduledRows: list.filter(row => row.expectedExpenseRole === 'scheduled'),
    additionalRows: list.filter(row => row.expectedExpenseRole !== 'scheduled'),
  };
};

// Sum of every milestone's resolved total (percent-of-package rows resolved to euros, plus every
// catalog/custom extra) - the actual amount the whole plan bills for.
export const computeMilestonesTotal = (milestones, catalogItemsById, priceContext = {}) =>
  (Array.isArray(milestones) ? milestones : []).reduce((sum, milestone) => sum
    + computeMilestoneSubtotal(resolveMilestoneServiceRows(milestone, catalogItemsById, priceContext)), 0);

// Sum of only the percent-of-package rows that share the plan's own package id, in percent (not
// euros) - the sanity check for "does the schedule breakdown still cover the whole package price".
// Kept separate from computeMilestonesTotal because that one also includes one-off extras (SM
// deposits, gifts, ...), which are expected to push the real bill above the package price.
export const computeMilestonesPackageSharePercent = (milestones, packageId) =>
  (Array.isArray(milestones) ? milestones : []).reduce((sum, milestone) => sum
    + (Array.isArray(milestone.services) ? milestone.services : [])
      .filter(entry => entry?.kind === 'percent' && String(entry.packageId) === String(packageId))
      .reduce((entrySum, entry) => entrySum + (Number(entry.percent) || 0), 0), 0);
