// Expected expenses is a template for future invoices tied to a chosen budget/packages program.
// Stored JSON is intentionally small: { packageId, expectedExpenses }, where expectedExpenses is
// an array of service-line groups. Group #0 belongs to payment schedule step #0, group #1 to step
// #1, etc. Schedule titles/amount metadata stay in the budget catalog; service-line strings/objects
// use the same normalization as invoiceServices/recentServices, including "id1 || 20%" package
// percentage rows that calculate from the current package price at render time.

import {
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  makePackagePercentEntry,
  normalizeServiceEntries,
  resolveServiceRow,
  setEntryField,
} from './invoiceCatalogUtils';

export const normalizeExpectedExpensesGroups = groups => (Array.isArray(groups) ? groups.map(normalizeServiceEntries) : []);

export const buildExpectedExpensesGroupsFromSchedule = (schedule, pkg) => {
  const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];
  const packagePrice = Number(pkg?.listedPrice) || 0;
  return payments.map(payment => {
    const amount = Number(payment?.amount) || 0;
    const percent = packagePrice ? (amount / packagePrice) * 100 : 0;
    return [makePackagePercentEntry({ catalogId: pkg?.id ?? '', percent })];
  });
};

export const buildExpectedExpensesPlan = (pkg, schedule) => ({
  packageId: String(pkg?.id ?? ''),
  expectedExpenses: buildExpectedExpensesGroupsFromSchedule(schedule, pkg),
});

export const normalizeExpectedExpensesData = raw => {
  if (!raw || typeof raw !== 'object') return null;

  // Backward compatibility: old plans stored frozen milestones with additionalServices.
  if (Array.isArray(raw.milestones)) {
    return {
      packageId: String(raw.packageId ?? ''),
      expectedExpenses: raw.milestones.map(milestone => normalizeServiceEntries([
        ...(Number(milestone?.scheduledAmount) ? [
          makePackagePercentEntry({
            catalogId: raw.packageId ?? '',
            percent: Number(raw?.packageSnapshot?.listedPrice) ? (Number(milestone.scheduledAmount) / Number(raw.packageSnapshot.listedPrice)) * 100 : 0,
          }),
        ] : []),
        ...(Array.isArray(milestone?.additionalServices) ? milestone.additionalServices : []),
      ])),
      ...(Array.isArray(raw.notes) ? { notes: raw.notes } : {}),
    };
  }

  return {
    packageId: String(raw.packageId ?? ''),
    expectedExpenses: normalizeExpectedExpensesGroups(raw.expectedExpenses),
    ...(Array.isArray(raw.notes) ? { notes: raw.notes } : {}),
  };
};

export const isExpectedExpensesShape = raw => Boolean(
  raw
  && typeof raw === 'object'
  && !Array.isArray(raw)
  && raw.packageId !== undefined
  && (Array.isArray(raw.expectedExpenses) || Array.isArray(raw.milestones))
);

export const getExpectedExpensesValidation = (plan, schedule) => {
  const groupCount = Array.isArray(plan?.expectedExpenses) ? plan.expectedExpenses.length : 0;
  const paymentCount = Array.isArray(schedule?.payments) ? schedule.payments.length : 0;
  if (groupCount > paymentCount) return `Expected expenses has ${groupCount} groups but the package schedule has only ${paymentCount} steps. Extra groups are not used.`;
  return '';
};

export const updateExpectedExpenseServiceField = (plan, groupIndex, entryId, field, value) => ({
  ...plan,
  expectedExpenses: (plan.expectedExpenses || []).map((group, index) => (index === groupIndex
    ? group.map(entry => (entry.id === entryId ? setEntryField(entry, field, value) : entry))
    : group)),
});

export const addExpectedExpenseService = (plan, groupIndex, entry) => {
  const groups = [...(plan.expectedExpenses || [])];
  while (groups.length <= groupIndex) groups.push([]);
  groups[groupIndex] = [...groups[groupIndex], entry];
  return { ...plan, expectedExpenses: groups };
};

export const removeExpectedExpenseService = (plan, groupIndex, entryId) => ({
  ...plan,
  expectedExpenses: (plan.expectedExpenses || []).map((group, index) => (index === groupIndex
    ? group.filter(entry => entry.id !== entryId)
    : group)),
});

export const resetExpectedExpenseService = (plan, groupIndex, entryId) => ({
  ...plan,
  expectedExpenses: (plan.expectedExpenses || []).map((group, index) => (index === groupIndex
    ? group.map(entry => (entry.id === entryId && entry.kind === 'item' ? { id: entry.id, kind: 'item', catalogId: entry.catalogId } : entry))
    : group)),
});

export const resolveExpectedExpenseRows = (group, catalogItemsById, priceContext = {}) =>
  (Array.isArray(group) ? group : []).map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

export const computeExpectedExpenseSubtotal = rows => computeInvoiceSubtotal(rows);
export const computeExpectedExpenseAmountDue = (subtotal, taxPercent) => computeInvoiceTotal(subtotal, taxPercent);
