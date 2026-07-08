import {
  addMilestoneService,
  buildExpectedExpensesPlan,
  buildExpectedExpensesPlanFromRawGroups,
  computeMilestoneAmountDue,
  computeMilestoneSubtotal,
  computeMilestonesPackageSharePercent,
  computeMilestonesTotal,
  inferPackageIdFromRawGroups,
  isExpectedExpensesShape,
  isRawExpectedExpensesGroups,
  normalizeExpectedExpensesData,
  removeMilestoneService,
  resolveMilestoneServiceRows,
  resolvePackageOverviewRows,
  serializeExpectedExpensesData,
  setMilestoneField,
  updateMilestoneServiceField,
} from './expectedExpensesUtils';
import expectedExpensesSeed from '../data/expectedExpensesSeed.json';
import { makeCustomEntry } from './invoiceCatalogUtils';

const pkg = {
  id: '3',
  name: 'IVF+ED+SM',
  listedPrice: 40000,
  currency: 'EUR',
  children: [1, 2, 3],
};

const schedule = {
  id: 'ps-3',
  payments: [
    { title: 'To start the program', amount: 8000 },
    { title: 'To start stimulation of a SM', amount: 6000 },
    { title: 'In a week before embryo transfer', amount: 3000 },
    { title: 'After confirmation of pregnancy by ultrasound', amount: 4000 },
    { title: 'On the 12th week of pregnancy', amount: 6000 },
    { title: 'On the 18th week of pregnancy', amount: 6000 },
    { title: 'On the 36th week of pregnancy', amount: 7000 },
  ],
};

describe('expectedExpensesUtils', () => {
  it('builds a compact template with one service group per schedule payment', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    expect(plan.packageId).toBe('3');
    expect(plan.packageSnapshot).toMatchObject({ name: 'IVF+ED+SM', listedPrice: 40000, currency: 'EUR' });
    expect(plan.packageSnapshot.children).toEqual([
      { id: plan.packageSnapshot.children[0].id, kind: 'item', catalogId: '1' },
      { id: plan.packageSnapshot.children[1].id, kind: 'item', catalogId: '2' },
      { id: plan.packageSnapshot.children[2].id, kind: 'item', catalogId: '3' },
    ]);

    expect(plan.milestones).toHaveLength(7);
    expect(plan.milestones[0]).toMatchObject({ title: 'To start the program', taxPercent: 14, showPackageOverview: true });
    expect(plan.milestones[0].services).toEqual([
      { id: plan.milestones[0].services[0].id, kind: 'percent', packageId: '3', percent: 20, expectedExpenseRole: 'scheduled' },
    ]);
    expect(plan.milestones[1]).toMatchObject({ title: 'To start stimulation of a SM', showPackageOverview: false });
    expect(plan.milestones[1].services[0]).toMatchObject({ kind: 'percent', packageId: '3', percent: 15 });
  });

  it('never stores a euro amount on a milestone - the percent-of-package row recalculates it', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule);
    expect(computeMilestonesTotal(plan.milestones, new Map(), { packagesById: new Map([['3', pkg]]) })).toBe(40000);

    const bumped = { ...pkg, listedPrice: 80000 };
    expect(computeMilestonesTotal(plan.milestones, new Map(), { packagesById: new Map([['3', bumped]]) })).toBe(80000);
  });

  it('sums the percent-of-package rows back up to 100% of the schedule', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule);
    expect(computeMilestonesPackageSharePercent(plan.milestones, plan.packageId)).toBe(100);
  });

  it('round-trips through serialization/normalization and supports legacy string rows', () => {
    const rawCatalog = {
      packages: [{ id: '3', name: 'IVF+ED+SM', listedPrice: 40000, currency: 'EUR', children: [], paymentScheduleId: 'ps-3' }],
      technical: { paymentSchedules: [{ id: 'ps-3', payments: [{ title: 'To start the program', amount: 8000 }] }] },
    };
    const { plan } = buildExpectedExpensesPlanFromRawGroups(
      [['id3 || 20%', 'Deposit for transportation of SM || 300', 'id32']],
      { catalog: rawCatalog },
    );
    expect(plan.packageId).toBe('3');
    expect(plan.milestones[0].services).toMatchObject([
      { kind: 'percent', packageId: '3', percent: 20, expectedExpenseRole: 'scheduled' },
      { kind: 'custom', name: 'Deposit for transportation of SM', price: 300 },
      { kind: 'item', catalogId: '32' },
    ]);

    const renormalized = normalizeExpectedExpensesData(serializeExpectedExpensesData(plan));
    expect(renormalized.packageId).toBe(plan.packageId);
    expect(renormalized.milestones[0].services).toMatchObject(plan.milestones[0].services);
    expect(normalizeExpectedExpensesData(null)).toBeNull();
    expect(serializeExpectedExpensesData(null)).toBeNull();
  });

  it('migrates a legacy milestone with a frozen scheduledAmount into an equivalent percent-of-package row', () => {
    const legacy = {
      packageId: '3',
      packageSnapshot: { name: 'IVF+ED+SM', listedPrice: 40000, currency: 'EUR', children: [] },
      milestones: [
        { id: 'm1', title: 'To start the program', scheduledAmount: 8000, taxPercent: 14, showPackageOverview: true, additionalServices: [] },
      ],
    };
    const normalized = normalizeExpectedExpensesData(legacy);
    expect(normalized.milestones[0].services).toEqual([
      { id: normalized.milestones[0].services[0].id, kind: 'percent', packageId: '3', percent: 20, expectedExpenseRole: 'scheduled' },
    ]);
    expect(computeMilestonesTotal(normalized.milestones, new Map(), { packagesById: new Map([['3', pkg]]) })).toBe(8000);
  });

  it('edits a milestone field, parsing the numeric taxPercent and leaving text fields as-is', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    const edited = setMilestoneField(plan.milestones[1], 'taxPercent', '6,5');
    expect(edited.taxPercent).toBe(6.5);
    expect(setMilestoneField(plan.milestones[1], 'title', 'Renamed step').title).toBe('Renamed step');
  });

  it('adds, edits, and removes a service on a milestone', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    const deposit = makeCustomEntry({ name: 'Deposit for transportation of SM', price: 300 });
    let milestone = addMilestoneService(plan.milestones[1], deposit);
    expect(milestone.services).toHaveLength(2);

    milestone = updateMilestoneServiceField(milestone, deposit.id, 'price', '350');
    expect(milestone.services.find(entry => entry.id === deposit.id).price).toBe(350);

    milestone = removeMilestoneService(milestone, deposit.id);
    expect(milestone.services).toHaveLength(1);
  });

  it('computes the amount due for a milestone from its resolved rows (percent share + tax)', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
    const packagesById = new Map([['3', pkg]]);
    const rows = resolveMilestoneServiceRows(plan.milestones[0], new Map(), { packagesById });
    const subtotal = computeMilestoneSubtotal(rows);
    expect(subtotal).toBe(8000);
    expect(computeMilestoneAmountDue(subtotal, plan.milestones[0].taxPercent)).toBeCloseTo(9120);
  });

  it('adds extra services into the amount due on top of the percent-of-package share', () => {
    const plan = buildExpectedExpensesPlan({ ...pkg, listedPrice: 40000 }, { payments: [{ title: 'To start the program', amount: 13000 }] }, { taxPercent: 13 });
    const pgs = makeCustomEntry({ name: 'PGS of 24 chromosomes', price: 2500 });
    const milestone = addMilestoneService(plan.milestones[0], pgs);
    const packagesById = new Map([['3', { ...pkg, listedPrice: 40000 }]]);
    const rows = resolveMilestoneServiceRows(milestone, new Map(), { packagesById });
    const subtotal = computeMilestoneSubtotal(rows);
    expect(subtotal).toBeCloseTo(15500);
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

  describe('isExpectedExpensesShape', () => {
    it('accepts a plan-shaped object and rejects anything else', () => {
      const plan = buildExpectedExpensesPlan(pkg, schedule, { taxPercent: 14 });
      expect(isExpectedExpensesShape(plan)).toBe(true);
      expect(isExpectedExpensesShape(null)).toBe(false);
      expect(isExpectedExpensesShape({})).toBe(false);
      expect(isExpectedExpensesShape({ packageSnapshot: {}, milestones: 'nope' })).toBe(false);
    });
  });

  describe('raw group upload (array of arrays of legacy service strings)', () => {
    const rawGroups = [
      ['id1 || 20%', 'Deposit for transportation of SM || 300', 'Deposit for medical expenses of SM || 300'],
      ['id1 || 10%', 'Deposit for transportation of SM || 300'],
      ['id1 || 15%', 'id32', 'Deposit for medical expenses of SM || 300'],
    ];
    const rawCatalog = {
      packages: [{ id: '1', name: 'IVF+ED+SM', listedPrice: 40000, currency: 'EUR', children: ['1', '2'] }],
      technical: { paymentSchedules: [{ id: 'ps-1', payments: schedule.payments.slice(0, 4) }] },
    };
    const rawCatalogWithLink = {
      ...rawCatalog,
      packages: [{ ...rawCatalog.packages[0], paymentScheduleId: 'ps-1' }],
    };

    it('detects the raw array-of-groups shape', () => {
      expect(isRawExpectedExpensesGroups(rawGroups)).toBe(true);
      expect(isRawExpectedExpensesGroups({})).toBe(false);
      expect(isRawExpectedExpensesGroups([['ok'], 'nope'])).toBe(false);
    });

    it('infers the package id from the first percent-of-package row', () => {
      expect(inferPackageIdFromRawGroups(rawGroups)).toBe('1');
      expect(inferPackageIdFromRawGroups([['Just a custom || 300']])).toBe('');
    });

    it('builds a plan by lining groups up with the package\'s default schedule, index by index', () => {
      const { plan, missingPackage, droppedGroupsCount } = buildExpectedExpensesPlanFromRawGroups(rawGroups, { catalog: rawCatalogWithLink, taxPercent: 14 });
      expect(missingPackage).toBe(false);
      expect(droppedGroupsCount).toBe(0);
      expect(plan.packageId).toBe('1');
      expect(plan.milestones).toHaveLength(4);
      expect(plan.milestones[0].showPackageOverview).toBe(true);
      expect(plan.milestones[0].services).toHaveLength(3);
      expect(plan.milestones[0].services[0]).toMatchObject({ kind: 'percent', packageId: '1', percent: 20 });
      // The schedule has 4 steps but only 3 groups were uploaded - the last step is left empty
      // instead of breaking.
      expect(plan.milestones[3].services).toEqual([]);
    });

    it('drops groups beyond the schedule\'s step count and reports how many', () => {
      const shortSchedule = { ...rawCatalogWithLink, technical: { paymentSchedules: [{ id: 'ps-1', payments: schedule.payments.slice(0, 2) }] } };
      const { plan, droppedGroupsCount } = buildExpectedExpensesPlanFromRawGroups(rawGroups, { catalog: shortSchedule });
      expect(plan.milestones).toHaveLength(2);
      expect(droppedGroupsCount).toBe(1);
    });

    it('reports a missing package instead of guessing when no percent row names one', () => {
      const { plan, missingPackage } = buildExpectedExpensesPlanFromRawGroups([['Custom line || 300']], { catalog: rawCatalogWithLink });
      expect(missingPackage).toBe(true);
      expect(plan).toBeNull();
    });
  });

  describe('expectedExpensesSeed.json', () => {
    it('is a valid, normalizable expected-expenses plan whose percent shares add up to 100%', () => {
      expect(isExpectedExpensesShape(expectedExpensesSeed)).toBe(true);
      const normalized = normalizeExpectedExpensesData(expectedExpensesSeed);
      expect(normalized.packageId).toBe('3');
      expect(normalized.milestones).toHaveLength(6);
      expect(computeMilestonesPackageSharePercent(normalized.milestones, normalized.packageId)).toBe(100);
      expect(computeMilestonesTotal(normalized.milestones, new Map(), { packagesById: new Map([['3', normalized.packageSnapshot]]) }))
        .toBeGreaterThan(normalized.packageSnapshot.listedPrice);
      expect(normalized.milestones[0].showPackageOverview).toBe(true);
      expect(normalized.milestones.slice(1).every(milestone => !milestone.showPackageOverview)).toBe(true);
      const giftRow = normalized.milestones[5].services.find(entry => entry.priceLabel === 'GIFT');
      expect(giftRow).toMatchObject({ price: 0, priceLabel: 'GIFT' });
    });
  });
});
