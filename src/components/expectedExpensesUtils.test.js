import {
  addMilestoneAdditionalService,
  buildExpectedExpensesPlan,
  computeMilestoneAmountDue,
  computeMilestoneSubtotal,
  computeMilestonesScheduledTotal,
  normalizeExpectedExpensesData,
  removeMilestoneAdditionalService,
  resolveMilestoneAdditionalRows,
  resolvePackageOverviewRows,
  setMilestoneField,
  updateMilestoneAdditionalServiceField,
} from './expectedExpensesUtils';
import { makeCustomEntry } from './invoiceCatalogUtils';

const pkg = {
  id: '3',
  name: 'IVF+ED+SM',
  description: 'For cases where embryos need to be created using donor oocytes.',
  listedPrice: 40000,
  currency: 'EUR',
  children: [1, 2, 3],
};

const schedule = {
  id: 'ps-3',
  payments: [
    { title: 'To start the program', amount: 8772 },
    { title: 'To start stimulation of a SM', amount: 6228 },
    { title: 'In a week before embryo transfer', amount: 3000 },
    { title: 'After confirmation of pregnancy by ultrasound', amount: 4000 },
    { title: 'On the 12th week of pregnancy', amount: 6000 },
    { title: 'On the 18th week of pregnancy', amount: 6000 },
    { title: 'On the 36th week of pregnancy', amount: 6000 },
  ],
};

describe('expectedExpensesUtils', () => {
  it('builds a plan whose milestones mirror the schedule, first one flagged as the package overview', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    expect(plan.packageId).toBe('3');
    expect(plan.packageSnapshot).toMatchObject({ name: 'IVF+ED+SM', listedPrice: 40000, currency: 'EUR' });
    expect(plan.packageSnapshot.children).toEqual([
      { id: plan.packageSnapshot.children[0].id, kind: 'item', catalogId: '1' },
      { id: plan.packageSnapshot.children[1].id, kind: 'item', catalogId: '2' },
      { id: plan.packageSnapshot.children[2].id, kind: 'item', catalogId: '3' },
    ]);

    expect(plan.milestones).toHaveLength(7);
    expect(plan.milestones[0]).toMatchObject({ title: 'To start the program', scheduledAmount: 8772, taxPercent: 14, showPackageOverview: true });
    expect(plan.milestones[1]).toMatchObject({ title: 'To start stimulation of a SM', scheduledAmount: 6228, showPackageOverview: false });
  });

  it('sums the milestones back up to the package listed price', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule);
    expect(computeMilestonesScheduledTotal(plan.milestones)).toBe(40000);
  });

  it('round-trips through normalization, assigning ids where missing', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    const normalized = normalizeExpectedExpensesData(JSON.parse(JSON.stringify(plan)));
    expect(normalized).toEqual(plan);
    expect(normalizeExpectedExpensesData(null)).toBeNull();
  });

  it('edits a milestone field, parsing numeric fields and leaving text fields as-is', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    const edited = setMilestoneField(plan.milestones[1], 'scheduledAmount', '6 500,50'.replace(' ', ''));
    expect(edited.scheduledAmount).toBe(6500.5);
    expect(setMilestoneField(plan.milestones[1], 'title', 'Renamed step').title).toBe('Renamed step');
  });

  it('adds, edits, and removes an additional service on a milestone', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    const deposit = makeCustomEntry({ name: 'Deposit for transportation of SM', price: 300 });
    let milestone = addMilestoneAdditionalService(plan.milestones[1], deposit);
    expect(milestone.additionalServices).toHaveLength(1);

    milestone = updateMilestoneAdditionalServiceField(milestone, deposit.id, 'price', '350');
    expect(milestone.additionalServices[0].price).toBe(350);

    milestone = removeMilestoneAdditionalService(milestone, deposit.id);
    expect(milestone.additionalServices).toHaveLength(0);
  });

  it('computes the amount due for a milestone exactly like the "To start the program" sample invoice (8772 taxed at 14%)', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    const catalogItemsById = new Map();
    const additionalRows = resolveMilestoneAdditionalRows(plan.milestones[0], catalogItemsById);
    const subtotal = computeMilestoneSubtotal(plan.milestones[0], additionalRows);
    expect(subtotal).toBe(8772);
    expect(computeMilestoneAmountDue(subtotal, plan.milestones[0].taxPercent)).toBeCloseTo(10000.08);
  });

  it('adds extra services into the amount due, matching the Mullins sample (13000 scheduled + 2500 PGS, taxed at 13%)', () => {
    const plan = buildExpectedExpensesPlan(
      { ...pkg, listedPrice: 41500 },
      { payments: [{ title: 'To start the program', amount: 13000 }] },
      { taxPercent: 13 },
    );
    const pgs = makeCustomEntry({ name: 'PGS of 24 chromosomes', price: 2500 });
    const milestone = addMilestoneAdditionalService(plan.milestones[0], pgs);
    const catalogItemsById = new Map();
    const additionalRows = resolveMilestoneAdditionalRows(milestone, catalogItemsById);
    const subtotal = computeMilestoneSubtotal(milestone, additionalRows);
    expect(subtotal).toBe(15500);
    expect(computeMilestoneAmountDue(subtotal, milestone.taxPercent)).toBeCloseTo(17515);
  });

  it('resolves package overview rows by name, without prices, following the catalog', () => {
    const catalogItemsById = new Map([
      ['1', { id: '1', name: 'Program coordination and support', price: 5000 }],
      ['2', { id: '2', name: 'Surrogacy document preparation', price: 350 }],
    ]);
    const plan = buildExpectedExpensesPlan(pkg, schedule);
    const rows = resolvePackageOverviewRows(plan.packageSnapshot.children.slice(0, 2), catalogItemsById);
    expect(rows.map(row => row.name)).toEqual(['Program coordination and support', 'Surrogacy document preparation']);
  });
});
