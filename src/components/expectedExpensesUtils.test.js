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
  buildInitialPaymentOfferPlan,
  applyExpectedExpensesTemplate,
  extractExpectedExpensesTemplate,
  linkEntryToCatalog,
  listScheduledRowIncludedServices,
  resolveDefaultExpectedExpensesTemplate,
  resolveExpectedExpensesSchedule,
  resolveExpectedExpensesTemplateKey,
  resolveInitialPaymentOffer,
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

  // ps-6 (Special Offer — Programme Fee): 4 payments of { percent: 25 } instead of { amount }.
  it('builds milestones from a percent-based schedule (ps-6 format), same as an amount-based one', () => {
    const specialOfferPkg = { id: '7', name: 'Special Offer — Programme Fee', listedPrice: 29700, currency: 'EUR', children: [] };
    const percentSchedule = {
      id: 'ps-6',
      payments: [
        { percent: 25, title: 'On confirmation of pregnancy by ultrasound' },
        { percent: 25, title: 'Milestone 2' },
        { percent: 25, title: 'Milestone 3' },
        { percent: 25, title: 'Milestone 4' },
      ],
    };
    const plan = buildExpectedExpensesPlan(specialOfferPkg, percentSchedule);
    expect(plan.milestones).toHaveLength(4);
    plan.milestones.forEach(milestone => {
      expect(milestone.services[0]).toMatchObject({ kind: 'percent', packageId: '7', percent: 25 });
    });
    expect(computeMilestonesTotal(
      plan.milestones, new Map(), { packagesById: new Map([['7', specialOfferPkg]]) },
    )).toBe(7425 * 4);
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

  it('migrates a legacy milestone with a frozen scheduledAmount into a fixed custom row, independent of the live package', () => {
    const legacy = {
      packageId: '3',
      packageSnapshot: { name: 'IVF+ED+SM', listedPrice: 40000, currency: 'EUR', children: [] },
      milestones: [
        { id: 'm1', title: 'To start the program', scheduledAmount: 8000, taxPercent: 14, showPackageOverview: true, additionalServices: [] },
      ],
    };
    const normalized = normalizeExpectedExpensesData(legacy);
    expect(normalized.milestones[0].services).toEqual([
      { id: normalized.milestones[0].services[0].id, kind: 'custom', name: 'Scheduled payment (To start the program)', price: 8000 },
    ]);
    // The amount survives even if the package that used to price it no longer exists in the
    // catalog - a percent-of-package row would have resolved to 0 in that case instead.
    expect(computeMilestonesTotal(normalized.milestones, new Map(), { packagesById: new Map() })).toBe(8000);
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

    it('reports a missing schedule instead of persisting an empty plan when the package has none', () => {
      const catalogWithoutSchedule = { packages: [{ id: '1', name: 'IVF+ED+SM', listedPrice: 40000, currency: 'EUR', children: ['1', '2'] }] };
      const { plan, missingPackage, missingSchedule } = buildExpectedExpensesPlanFromRawGroups(rawGroups, { catalog: catalogWithoutSchedule });
      expect(missingPackage).toBe(false);
      expect(missingSchedule).toBe(true);
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

// A package with no payment schedule used to be refused outright on the Expected expenses tab.
describe('resolveExpectedExpensesSchedule', () => {
  const pkg = { id: 'p6', name: 'One-off consultation', listedPrice: 7580, children: [] };

  it('falls back to one 100% milestone for a package without a schedule', () => {
    const schedule = resolveExpectedExpensesSchedule({ technical: { paymentSchedules: [] } }, pkg);
    const plan = buildExpectedExpensesPlan(pkg, schedule);
    expect(plan.milestones).toHaveLength(1);
    expect(plan.milestones[0].title).toBe('One-off consultation');
    expect(plan.milestones[0].services[0]).toMatchObject({ kind: 'percent', packageId: 'p6', percent: 100 });
  });

  it('keeps the catalog schedule when the package has one', () => {
    const own = { id: 'ps-1', payments: [{ title: 'A', amount: 100 }, { title: 'B', amount: 200 }] };
    const schedule = resolveExpectedExpensesSchedule({ technical: { paymentSchedules: [own] } }, { ...pkg, paymentScheduleId: 'ps-1' });
    expect(schedule).toBe(own);
  });
});

// Bug report (06.11): Initial Payment is billed first and separately, then the Programme Fee follows
// its own 4-payment schedule - picking either package must build that 5-step plan.
describe('resolveInitialPaymentOffer / buildInitialPaymentOfferPlan', () => {
  const catalog = {
    packages: [
      { id: 3, name: 'IVF + ED + SM', listedPrice: 46000, children: [1, 2], paymentScheduleId: 'ps-3' },
      { id: 6, name: 'Special Offer - Initial Payment', listedPrice: 8300, hidden: true, children: [1, 2, 4] },
      { id: 7, name: 'Special Offer - Programme Fee', listedPrice: 29700, hidden: true, children: [4, 18], paymentScheduleId: 'ps-6' },
    ],
    technical: {
      paymentSchedules: [
        { id: 'ps-3', payments: [{ amount: 16000, title: 'To start the program' }, { amount: 30000, title: 'Later' }] },
        { id: 'ps-6', payments: [
          { percent: 25, title: 'On confirmation of pregnancy by ultrasound' },
          { percent: 25, title: 'On the 12th week of pregnancy' },
          { percent: 25, title: 'On the 18th week of pregnancy' },
          { percent: 25, title: 'On the 36th week of pregnancy' },
        ] },
      ],
    },
  };

  it.each([6, 7])('builds initial payment + 4 programme payments when package %s is picked', id => {
    const pkg = catalog.packages.find(candidate => candidate.id === id);
    const offer = resolveInitialPaymentOffer(catalog, pkg);
    expect(offer).toMatchObject({ name: 'Special Offer', initialTitle: 'Initial Payment' });
    const plan = buildInitialPaymentOfferPlan(offer, { packageId: id, taxPercent: 14 });
    expect(plan.packageId).toBe(String(id));
    expect(plan.packageSnapshot).toMatchObject({ name: 'Special Offer', listedPrice: 38000 });
    expect(plan.packageSnapshot.children.map(entry => String(entry.catalogId))).toEqual(['1', '2', '4', '18']);
    expect(plan.milestones.map(milestone => milestone.title)).toEqual([
      'Initial Payment',
      'On confirmation of pregnancy by ultrasound',
      'On the 12th week of pregnancy',
      'On the 18th week of pregnancy',
      'On the 36th week of pregnancy',
    ]);
    expect(plan.milestones[0].services[0]).toMatchObject({ kind: 'percent', packageId: '6', percent: 100 });
    plan.milestones.slice(1).forEach(milestone => {
      expect(milestone.services[0]).toMatchObject({ kind: 'percent', packageId: '7', percent: 25 });
      expect(milestone.showPackageOverview).toBe(false);
    });
    expect(computeMilestonesPackageSharePercent(plan.milestones, plan.packageId, id === 6 ? 8300 : 29700)).toBe(100);
  });

  it('leaves ordinary packages alone', () => {
    expect(resolveInitialPaymentOffer(catalog, catalog.packages[0])).toBeNull();
  });
});

// 06.11: the typical extras of each milestone (SM deposits, apartment, C-section...) live in a
// package template instead of being retyped on every plan.
describe('expected expenses package templates', () => {
  const catalog = {
    packages: [
      { id: 6, name: 'Special Offer - Initial Payment', listedPrice: 8300, children: [] },
      { id: 7, name: 'Special Offer - Programme Fee', listedPrice: 29700, children: [], paymentScheduleId: 'ps-6' },
    ],
    technical: { paymentSchedules: [{ id: 'ps-6', payments: [25, 25, 25, 25].map((percent, index) => ({ percent, title: `P${index + 1}` })) }] },
  };

  it('keys both halves of the offer by the Initial Payment package', () => {
    expect(resolveExpectedExpensesTemplateKey(catalog, catalog.packages[0])).toBe('6');
    expect(resolveExpectedExpensesTemplateKey(catalog, catalog.packages[1])).toBe('6');
  });

  it('applies the bundled Special Offer sample milestone by milestone', () => {
    const offer = resolveInitialPaymentOffer(catalog, catalog.packages[1]);
    const plan = buildInitialPaymentOfferPlan(offer, { packageId: 7 });
    const milestones = applyExpectedExpensesTemplate(plan.milestones, resolveDefaultExpectedExpensesTemplate(plan.packageSnapshot.name));
    expect(milestones.map(milestone => milestone.services.length)).toEqual([1, 3, 4, 5, 6]);
    expect(milestones[1].services[1]).toMatchObject({ kind: 'custom', name: 'Deposit for transportation of SM', price: 300 });
    expect(milestones[4].services.find(entry => entry.name === 'Deposit for the C-section')).toMatchObject({ price: 2700 });
    // Positions that exist in the price list come from it, so their price is the price list's.
    expect(milestones[2].services[3]).toMatchObject({ kind: 'item', catalogId: '40' });
    expect(milestones[3].services[3]).toMatchObject({ kind: 'custom', name: 'Apartment for SM till delivery (3 months)', price: 1800 });
    expect(milestones[4].services[4]).toMatchObject({ kind: 'item', catalogId: '66' });
    const ids = milestones.flatMap(milestone => milestone.services.map(entry => entry.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('extracts only the extras, without ids, so the template round-trips', () => {
    const plan = {
      packageSnapshot: { name: 'Special Offer' },
      milestones: [{
        id: 'm1',
        title: 'P1',
        services: [
          { id: 'a', kind: 'percent', packageId: '7', percent: 25, expectedExpenseRole: 'scheduled' },
          { id: 'b', kind: 'custom', name: 'Deposit', price: 300 },
        ],
      }],
    };
    const template = extractExpectedExpensesTemplate(plan);
    expect(template).toEqual({ name: 'Special Offer', milestones: [{ title: 'P1', services: [{ kind: 'custom', name: 'Deposit', price: 300 }] }] });
  });
});

describe('linkEntryToCatalog', () => {
  const catalogItems = [{ id: 66, name: 'Newborn baby items', price: 150 }];

  it('turns a custom row named like a price-list position into that position', () => {
    expect(linkEntryToCatalog({ id: 'x', kind: 'custom', name: ' newborn  BABY items', price: 99 }, catalogItems))
      .toEqual({ id: 'x', kind: 'item', catalogId: '66' });
  });

  it('leaves other rows alone', () => {
    const entry = { id: 'y', kind: 'custom', name: 'Deposit for the C-section', price: 2700 };
    expect(linkEntryToCatalog(entry, catalogItems)).toBe(entry);
  });
});

// 06.11: the Initial Payment block of the PDF said only "Scheduled payment" - the client could not
// see what the 8,300 EUR pays for.
describe('listScheduledRowIncludedServices', () => {
  const catalogItemsById = new Map([['1', { id: 1, name: 'Program coordination and support' }], ['11', { id: 11, name: 'Embryo storage for 1 year' }]]);
  const priceContext = { packagesById: new Map([['6', { id: 6, name: 'Special Offer - Initial Payment', children: [1, 11] }], ['7', { id: 7, children: [1] }]]) };

  it('lists the package services under a payment that buys the whole package', () => {
    const row = { kind: 'percent', packageId: '6', percent: 100, expectedExpenseRole: 'scheduled' };
    expect(listScheduledRowIncludedServices(row, catalogItemsById, priceContext)).toEqual(['Program coordination and support', 'Embryo storage for 1 year']);
  });

  it('lists nothing under a share of the programme', () => {
    const row = { kind: 'percent', packageId: '7', percent: 25, expectedExpenseRole: 'scheduled' };
    expect(listScheduledRowIncludedServices(row, catalogItemsById, priceContext)).toEqual([]);
  });
});
