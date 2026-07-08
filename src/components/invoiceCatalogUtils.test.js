import {
  addCatalogChildToPackage,
  addCustomChildToPackage,
  applyPaymentPurposePlaceholders,
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  cloneEntryWithNewId,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  generateInvoiceIdentifiers,
  getActiveBeneficiary,
  getEntryIdentityKey,
  getTodayYmd,
  isEntryCustomized,
  isInvoiceDataShape,
  makeCatalogItemEntry,
  makeCatalogPackageEntry,
  makeCustomEntry,
  makePercentOfPackageEntry,
  movePackageChild,
  normalizeInvoiceData,
  normalizeServiceEntry,
  parseLegacyServiceString,
  removePackageChild,
  reorderBeneficiaryIds,
  reorderRecentServices,
  resetItemEntryOverrides,
  resetPackageEntryToCatalog,
  resolveInvoiceServiceRows,
  resolveServiceRow,
  setEntryField,
  updatePackageChildField,
} from './invoiceCatalogUtils';

describe('invoiceCatalogUtils', () => {
  it('normalizes a partial/empty document into the full shape', () => {
    const data = normalizeInvoiceData(null);
    expect(data).toEqual({
      beneficiaries: [],
      beneficiaryIds: [],
      customers: [],
      recentServices: [],
      invoiceServices: [],
      notes: [],
      taxPercent: 0,
    });
  });

  it('validates the invoice upload shape before normalization can empty missing collections', () => {
    expect(isInvoiceDataShape({})).toBe(false);
    expect(isInvoiceDataShape({ items: [] })).toBe(false);
    expect(isInvoiceDataShape({
      beneficiaries: [],
      beneficiaryIds: [],
      customers: [],
      recentServices: [],
      invoiceServices: [],
      notes: [],
      taxPercent: 0,
    })).toBe(true);
  });

  it('picks the active beneficiary from the first beneficiaryId', () => {
    const data = normalizeInvoiceData({
      beneficiaries: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
      beneficiaryIds: ['b', 'a'],
    });
    expect(getActiveBeneficiary(data)).toEqual({ id: 'b', title: 'B' });
  });

  it('reorders beneficiaryIds without touching the beneficiaries array', () => {
    expect(reorderBeneficiaryIds(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    expect(reorderBeneficiaryIds(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  describe('legacy string upgrade', () => {
    it('parses catalog-referenced legacy rows ("idNN")', () => {
      expect(parseLegacyServiceString('id15')).toEqual({ kind: 'item', catalogId: '15' });
    });

    it('parses legacy "Name || Price" rows as custom', () => {
      expect(parseLegacyServiceString('Deposit for transportation of SM || 300')).toEqual({
        kind: 'custom', name: 'Deposit for transportation of SM', price: 300,
      });
    });

    it('parses legacy "idX || Y%" rows as a share of that package\'s price', () => {
      expect(parseLegacyServiceString('id1 || 20%')).toEqual({ kind: 'percent', packageId: '1', percent: 20 });
      expect(parseLegacyServiceString('id1 || 12.5%')).toEqual({ kind: 'percent', packageId: '1', percent: 12.5 });
    });

    it('parses a non-numeric, non-percent price as a free-text price label', () => {
      expect(parseLegacyServiceString('Standard service until 6 months after delivery || GIFT')).toEqual({
        kind: 'custom', name: 'Standard service until 6 months after delivery', price: 0, priceLabel: 'GIFT',
      });
    });

    it('upgrades a legacy string into the canonical object entry', () => {
      const item = normalizeServiceEntry('id15');
      expect(item.kind).toBe('item');
      expect(item.catalogId).toBe('15');
      expect(typeof item.id).toBe('string');

      const custom = normalizeServiceEntry('Extra fee || 50');
      expect(custom.kind).toBe('custom');
      expect(custom.name).toBe('Extra fee');
      expect(custom.price).toBe(50);
    });

    it('normalizes a whole invoiceServices/recentServices array from a legacy upload', () => {
      const data = normalizeInvoiceData({
        beneficiaries: [], beneficiaryIds: [], customers: [], notes: [],
        recentServices: ['id15'],
        invoiceServices: ['id15', 'Deposit for transportation of SM || 300', 'id1 || 20%'],
      });
      expect(data.invoiceServices).toHaveLength(3);
      expect(data.invoiceServices[0]).toMatchObject({ kind: 'item', catalogId: '15' });
      expect(data.invoiceServices[1]).toMatchObject({ kind: 'custom', name: 'Deposit for transportation of SM', price: 300 });
      expect(data.invoiceServices[2]).toMatchObject({ kind: 'percent', packageId: '1', percent: 20 });
    });

    it('is idempotent on an already-normalized entry (keeps its id)', () => {
      const entry = makeCatalogItemEntry('15');
      expect(normalizeServiceEntry(entry)).toEqual(entry);
    });
  });

  describe('entry constructors and cloning', () => {
    it('builds catalog item / custom / package entries with stable, unique ids', () => {
      const item = makeCatalogItemEntry('15');
      expect(item).toMatchObject({ kind: 'item', catalogId: '15' });

      const custom = makeCustomEntry({ name: 'Extra fee', price: 50 });
      expect(custom).toMatchObject({ kind: 'custom', name: 'Extra fee', price: 50 });

      const pkg = makeCatalogPackageEntry({ id: 'full-program', children: ['1', '2'] });
      expect(pkg.kind).toBe('package');
      expect(pkg.catalogId).toBe('full-program');
      expect(pkg.children).toEqual([
        { id: pkg.children[0].id, kind: 'item', catalogId: '1' },
        { id: pkg.children[1].id, kind: 'item', catalogId: '2' },
      ]);
    });

    it('clones an entry (and a package entry deeply) with fresh ids', () => {
      const pkg = makeCatalogPackageEntry({ id: 'p1', children: ['1', '2'] });
      const clone = cloneEntryWithNewId(pkg);
      expect(clone.id).not.toBe(pkg.id);
      expect(clone.children[0].id).not.toBe(pkg.children[0].id);
      expect(clone.children[1].id).not.toBe(pkg.children[1].id);
      expect(clone.catalogId).toBe(pkg.catalogId);
    });
  });

  describe('editing overrides without touching the catalog', () => {
    it('overrides one field of a catalog item and flags it customized, keeping the catalog link', () => {
      const item = makeCatalogItemEntry('15');
      const priced = setEntryField(item, 'price', '450,50');
      expect(priced).toMatchObject({ kind: 'item', catalogId: '15', price: 450.5, customized: true });
      expect(isEntryCustomized(priced)).toBe(true);
      // Name was never touched, so it still isn't stored locally (keeps following the catalog).
      expect(priced.name).toBeUndefined();
    });

    it('reverts an overridden item back to a plain catalog reference', () => {
      const item = makeCatalogItemEntry('15');
      const overridden = setEntryField(item, 'name', 'Renamed for this invoice');
      expect(resetItemEntryOverrides(overridden)).toEqual({ id: item.id, kind: 'item', catalogId: '15' });
    });

    it('a custom entry is always considered customized', () => {
      expect(isEntryCustomized(makeCustomEntry({ name: 'X', price: 1 }))).toBe(true);
    });

    it('overrides a package price and flags it customized, without touching its children', () => {
      const pkg = makeCatalogPackageEntry({ id: 'p1', children: ['1'] });
      const overridden = setEntryField(pkg, 'price', '999');
      expect(overridden.priceOverride).toBe(999);
      expect(overridden.customized).toBe(true);
      expect(overridden.children).toEqual(pkg.children);
    });
  });

  describe('package children (add/edit/remove/reorder -> customized)', () => {
    const basePackage = () => makeCatalogPackageEntry({ id: 'p1', children: ['1', '2'] });

    it('removing a child flags the package as customized', () => {
      const pkg = basePackage();
      const [firstChild] = pkg.children;
      const next = removePackageChild(pkg, firstChild.id);
      expect(next.children).toHaveLength(1);
      expect(next.customized).toBe(true);
    });

    it('editing a child field flags both the child and the package as customized', () => {
      const pkg = basePackage();
      const [firstChild] = pkg.children;
      const next = updatePackageChildField(pkg, firstChild.id, 'price', '120');
      expect(next.customized).toBe(true);
      expect(next.children[0]).toMatchObject({ price: 120, customized: true });
      expect(next.children[1]).toEqual(pkg.children[1]);
    });

    it('reorders two children by id', () => {
      const pkg = basePackage();
      const [firstChild, secondChild] = pkg.children;
      const next = movePackageChild(pkg, firstChild.id, 1);
      expect(next.children.map(child => child.id)).toEqual([secondChild.id, firstChild.id]);
    });

    it('adds a custom line and a catalog item into a package, both flagging it customized', () => {
      const pkg = basePackage();
      const withCustom = addCustomChildToPackage(pkg, { name: 'Extra', price: 10 });
      expect(withCustom.children).toHaveLength(3);
      expect(withCustom.customized).toBe(true);

      const withCatalogChild = addCatalogChildToPackage(withCustom, '3');
      expect(withCatalogChild.children).toHaveLength(4);
      // Adding an item already present is a no-op.
      expect(addCatalogChildToPackage(withCatalogChild, '3').children).toHaveLength(4);
    });

    it('reverts a customized package back to a fresh catalog snapshot', () => {
      const pkg = basePackage();
      const edited = removePackageChild(setEntryField(pkg, 'name', 'Renamed'), pkg.children[0].id);
      const reverted = resetPackageEntryToCatalog(edited, { id: 'p1', children: ['1', '2'] });
      expect(reverted.id).toBe(pkg.id);
      expect(reverted.customized).toBeUndefined();
      expect(reverted.children.map(child => child.catalogId)).toEqual(['1', '2']);
    });
  });

  describe('resolving entries to display rows', () => {
    it('resolves a catalog item row against the budget catalog', () => {
      const catalogItemsById = new Map([['15', { id: '15', name: 'Scheduled payment', price: 3000, description: 'Milestone 1' }]]);
      const row = resolveServiceRow(makeCatalogItemEntry('15'), catalogItemsById);
      expect(row).toMatchObject({
        kind: 'item', catalogId: '15', missing: false, isCustomized: false, name: 'Scheduled payment', description: 'Milestone 1', price: 3000,
      });
    });

    it('an overridden price wins over the catalog price, but the name keeps following the catalog', () => {
      const catalogItemsById = new Map([['15', { id: '15', name: 'Scheduled payment', price: 3000 }]]);
      const entry = setEntryField(makeCatalogItemEntry('15'), 'price', 3500);
      const row = resolveServiceRow(entry, catalogItemsById);
      expect(row.name).toBe('Scheduled payment');
      expect(row.price).toBe(3500);
      expect(row.isCustomized).toBe(true);
    });

    it('resolves catalog rows with USD conversion and formula rates', () => {
      const catalogItemsById = new Map([
        ['22', { id: '22', name: 'USD compensation', price: 23000 }],
        ['30', { id: '30', name: 'Formula price', price: '=USD/EUR*100' }],
      ]);
      expect(resolveServiceRow(makeCatalogItemEntry('22'), catalogItemsById).price).toBeCloseTo(21160);
      expect(resolveServiceRow(makeCatalogItemEntry('30'), catalogItemsById, { rates: { usd: 40, eur: 50 } }).price).toBeCloseTo(80);
    });

    it('flags a catalog reference that no longer exists', () => {
      expect(resolveServiceRow(makeCatalogItemEntry('999'), new Map()).missing).toBe(true);
    });

    it('resolves a package row as the sum of its resolved children, with a name that follows the catalog until overridden', () => {
      const catalogItemsById = new Map([
        ['1', { id: '1', name: 'Consultation', price: 300 }],
        ['2', { id: '2', name: 'Legal support', price: 700 }],
      ]);
      const packagesById = new Map([['p1', { id: 'p1', name: 'Full program', children: ['1', '2'] }]]);
      const pkg = makeCatalogPackageEntry({ id: 'p1', children: ['1', '2'] });

      const row = resolveServiceRow(pkg, catalogItemsById, { packagesById });
      expect(row.name).toBe('Full program');
      expect(row.price).toBe(1000);
      expect(row.children).toHaveLength(2);
      expect(row.isCustomized).toBe(false);

      const renamed = setEntryField(pkg, 'name', 'Custom bundle for Amny');
      expect(resolveServiceRow(renamed, catalogItemsById, { packagesById }).name).toBe('Custom bundle for Amny');
    });

    it('an explicit package price override replaces the children total, which is still exposed for reference', () => {
      const catalogItemsById = new Map([['1', { id: '1', name: 'Consultation', price: 300 }]]);
      const pkg = setEntryField(makeCatalogPackageEntry({ id: 'p1', children: ['1'] }), 'price', 250);
      const row = resolveServiceRow(pkg, catalogItemsById);
      expect(row.price).toBe(250);
      expect(row.childrenTotal).toBe(300);
      expect(row.hasPriceOverride).toBe(true);
    });

    it('resolves a percent-of-package row from the package\'s live listed price, never storing the euro amount', () => {
      const packagesById = new Map([['1', { id: '1', name: 'IVF+ED+SM', listedPrice: 40000 }]]);
      const entry = makePercentOfPackageEntry('1', 20);
      const row = resolveServiceRow(entry, new Map(), { packagesById });
      expect(row).toMatchObject({ kind: 'percent', packageId: '1', percent: 20, missing: false, price: 8000 });
      expect(row.name).toBe('20% of IVF+ED+SM');

      // Bumping the package price recalculates the row automatically - no stored amount to go stale.
      const bumped = new Map([['1', { id: '1', name: 'IVF+ED+SM', listedPrice: 50000 }]]);
      expect(resolveServiceRow(entry, new Map(), { packagesById: bumped }).price).toBe(10000);
    });

    it('flags a percent-of-package row whose package no longer exists', () => {
      const row = resolveServiceRow(makePercentOfPackageEntry('999', 20), new Map(), { packagesById: new Map() });
      expect(row.missing).toBe(true);
      expect(row.price).toBe(0);
    });

    it('edits the percent and target package of a percent-of-package entry', () => {
      const entry = makePercentOfPackageEntry('1', 20);
      expect(setEntryField(entry, 'percent', '15,5').percent).toBe(15.5);
      expect(setEntryField(entry, 'packageId', '2').packageId).toBe('2');
    });

    it('editing a custom row\'s price with non-numeric text sets a free-text priceLabel instead of coercing to 0', () => {
      const entry = makeCustomEntry({ name: 'Post-delivery support', price: 500 });
      const gifted = setEntryField(entry, 'price', 'GIFT');
      expect(gifted).toMatchObject({ price: 0, priceLabel: 'GIFT' });
      // Typing a real number back in clears the label again.
      expect(setEntryField(gifted, 'price', '650')).toMatchObject({ price: 650 });
      expect(setEntryField(gifted, 'price', '650').priceLabel).toBeUndefined();
    });

    it('carries a free-text priceLabel (e.g. "GIFT") through resolution instead of a euro amount', () => {
      const entry = makeCustomEntry({ name: 'Post-delivery support', priceLabel: 'GIFT' });
      expect(entry.price).toBe(0);
      const row = resolveServiceRow(entry, new Map());
      expect(row.priceLabel).toBe('GIFT');
      expect(row.price).toBe(0);
    });

    it('computes subtotal/total without double-counting package children', () => {
      const catalogItemsById = new Map([
        ['15', { id: '15', name: 'Scheduled payment', price: 3000 }],
        ['1', { id: '1', name: 'Consultation', price: 300 }],
      ]);
      const invoiceServices = [
        makeCatalogItemEntry('15'),
        makeCatalogPackageEntry({ id: 'p1', children: ['1'] }),
        makeCustomEntry({ name: 'Extra fee', price: 300 }),
      ];
      const rows = resolveInvoiceServiceRows(invoiceServices, catalogItemsById);
      const subtotal = computeInvoiceSubtotal(rows);
      expect(subtotal).toBe(3600);
      expect(computeInvoiceTotal(subtotal, 14)).toBeCloseTo(4104);
    });
  });

  describe('identity keys and recent services', () => {
    it('gives catalog/package/custom entries a stable identity independent of their id', () => {
      expect(getEntryIdentityKey(makeCatalogItemEntry('15'))).toBe('item:15');
      expect(getEntryIdentityKey(makeCatalogPackageEntry({ id: 'p1', children: [] }))).toBe('package:p1');
      expect(getEntryIdentityKey(makeCustomEntry({ name: 'Extra', price: 50 })))
        .toBe(getEntryIdentityKey(makeCustomEntry({ name: 'Extra', price: 50 })));
      expect(getEntryIdentityKey(makePercentOfPackageEntry('1', 20))).toBe('percent:1:20');
    });

    it('moves used services to the front of recentServices, deduped by identity', () => {
      const recentServices = [makeCatalogItemEntry('1'), makeCatalogItemEntry('2'), makeCatalogItemEntry('3')];
      const invoiceServices = [makeCatalogItemEntry('3'), makeCatalogItemEntry('2')];
      const reordered = reorderRecentServices(recentServices, invoiceServices);
      expect(reordered.map(entry => entry.catalogId)).toEqual(['3', '2', '1']);
    });
  });

  it('builds the payer name and "Case of ..." title from customers', () => {
    const customers = [{ name: 'Amny Athamny', address: 'Netherlands' }, { name: 'Fons Mitchell Drost', address: 'Netherlands' }];
    expect(buildPayerName(customers)).toBe('Amny Athamny and Fons Mitchell Drost');
    expect(buildCaseTitle(customers)).toBe('Case of Amny Athamny and Fons Mitchell Drost');
    expect(buildPayerLocation(customers)).toBe('Netherlands');
  });

  it('generates invoice number ("/") and purpose date (".") from a date', () => {
    expect(generateInvoiceIdentifiers('2026-05-23')).toEqual({
      invoiceNumber: '23/05/2026',
      invoiceDate: '23.05.2026',
    });
  });

  it('uses local date components for the default invoice date', () => {
    const RealDate = Date;
    const fixed = new RealDate('2026-05-24T06:30:00.000Z');
    global.Date = class extends RealDate {
      constructor(...args) {
        super(...(args.length === 0 ? [fixed.getTime()] : args));
      }
      getFullYear() { return this.getTime() === fixed.getTime() ? 2026 : super.getFullYear(); }
      getMonth() { return this.getTime() === fixed.getTime() ? 4 : super.getMonth(); }
      getDate() { return this.getTime() === fixed.getTime() ? 23 : super.getDate(); }
      static now() { return fixed.getTime(); }
      static parse(value) { return RealDate.parse(value); }
      static UTC(...args) { return RealDate.UTC(...args); }
    };
    try {
      expect(getTodayYmd()).toBe('2026-05-23');
    } finally {
      global.Date = RealDate;
    }
  });

  it('fills invoiceNumber/invoiceDate placeholders into the payment purpose', () => {
    const template = 'Payment by the invoice № {invoiceNumber} of {invoiceDate} without VAT.';
    expect(applyPaymentPurposePlaceholders(template, { invoiceNumber: '23/05/2026', invoiceDate: '23.05.2026' }))
      .toBe('Payment by the invoice № 23/05/2026 of 23.05.2026 without VAT.');
  });
});
