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
  getActivePayerCase,
  getEntryIdentityKey,
  getTodayYmd,
  isEntryCustomized,
  isInvoiceDataShape,
  makeCatalogItemEntry,
  makeCatalogPackageEntry,
  makeCustomEntry,
  makeCustomPackageEntry,
  makePercentOfPackageEntry,
  movePackageChild,
  normalizeInvoiceData,
  normalizeServiceEntry,
  parseLegacyServiceString,
  removePackageChild,
  removeRecentEntry,
  reorderBeneficiaryIds,
  reorderPayerCaseIds,
  reorderRecentServices,
  resetItemEntryOverrides,
  resetPackageEntryToCatalog,
  resolveInvoiceServiceRows,
  resolveServiceRow,
  setEntryField,
  shouldRenderPackageDetail,
  touchRecentEntry,
  updatePackageChildField,
  upsertRecentEntry,
} from './invoiceCatalogUtils';

describe('invoiceCatalogUtils', () => {
  it('normalizes a partial/empty document into the full shape', () => {
    const data = normalizeInvoiceData(null);
    expect(data).toEqual({
      beneficiaries: [],
      beneficiaryIds: [],
      payerCases: [{ id: 'legacy', customers: [] }],
      payerCaseIds: ['legacy'],
      customers: [],
      recentServices: [],
      invoiceServices: [],
      recentPaymentSchedules: [],
      recentTaxRates: [],
      notes: [],
      taxPercent: 0,
      debtOrDeposit: 0,
      paymentPurposeOverride: '',
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

  describe('payer cases (P0: selecting a new client replaces, never merges, the active payer)', () => {
    it('migrates a legacy flat customers array into a single payer case', () => {
      const data = normalizeInvoiceData({ customers: [{ name: 'Amny Athamny', address: 'Netherlands' }] });
      expect(data.payerCases).toEqual([{ id: 'legacy', customers: [{ name: 'Amny Athamny', address: 'Netherlands' }] }]);
      expect(data.payerCaseIds).toEqual(['legacy']);
      expect(data.customers).toEqual([{ name: 'Amny Athamny', address: 'Netherlands' }]);
    });

    it('picks the active case customers from the first payerCaseId, mirrored onto data.customers', () => {
      const data = normalizeInvoiceData({
        payerCases: [
          { id: 'case-1', customers: [{ name: 'Kyogoku', address: 'Japan' }] },
          { id: 'case-2', customers: [{ name: 'Amny Athamny', address: 'Netherlands' }, { name: 'Fons Mitchell Drost', address: 'Netherlands' }] },
        ],
        payerCaseIds: ['case-2', 'case-1'],
      });
      expect(getActivePayerCase(data).id).toBe('case-2');
      expect(data.customers).toEqual([
        { name: 'Amny Athamny', address: 'Netherlands' },
        { name: 'Fons Mitchell Drost', address: 'Netherlands' },
      ]);
    });

    it('reorders payerCaseIds without touching any case\'s stored customers', () => {
      expect(reorderPayerCaseIds(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
      expect(reorderPayerCaseIds(['a', 'b'], 'a')).toEqual(['a', 'b']);
    });
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

  // P0 (round4 #2): a package with no Budget catalog entry can't reference the catalog - it must
  // be saved fully on the invoice itself (name + children + price), never depend on a catalog
  // lookup succeeding.
  describe('custom packages (no Budget catalog entry)', () => {
    it('creates a self-contained package entry with an empty catalogId, pre-flagged customized', () => {
      const pkg = makeCustomPackageEntry({ name: 'Bespoke programme' });
      expect(pkg).toMatchObject({ kind: 'package', catalogId: '', customized: true, name: 'Bespoke programme', children: [] });
    });

    it('never reports a custom package as "missing" - it was never meant to match a catalog entry', () => {
      const pkg = makeCustomPackageEntry({ name: 'Bespoke programme' });
      const row = resolveServiceRow(pkg, new Map(), { packagesById: new Map() });
      expect(row.missing).toBe(false);
      expect(row.isCustomized).toBe(true);
      expect(row.name).toBe('Bespoke programme');
    });

    it('bills the sum of its own children when no price override is set', () => {
      const catalogItemsById = new Map([['1', { id: '1', name: 'Consult', price: 100 }]]);
      const withChild = addCustomChildToPackage(makeCustomPackageEntry({ name: 'Bespoke' }), { name: 'Extra', price: 50 });
      const withCatalogChild = addCatalogChildToPackage(withChild, '1');
      const row = resolveServiceRow(withCatalogChild, catalogItemsById, { itemsById: catalogItemsById, packagesById: new Map() });
      expect(row.children).toHaveLength(2);
      expect(row.price).toBe(150);
    });

    it('two different custom packages never collide on the same identity key', () => {
      const a = makeCustomPackageEntry({ name: 'Package A' });
      const b = makeCustomPackageEntry({ name: 'Package B' });
      expect(getEntryIdentityKey(a)).not.toBe(getEntryIdentityKey(b));
    });

    it('leaves a custom package untouched when "reset to catalog" is attempted (no catalog entry to revert to)', () => {
      const pkg = addCustomChildToPackage(makeCustomPackageEntry({ name: 'Bespoke' }), { name: 'Extra', price: 50 });
      const reverted = resetPackageEntryToCatalog(pkg, undefined);
      expect(reverted).toBe(pkg);
    });
  });

  describe('hidden/special-offer packages render full detail on the Invoice (round6 #1)', () => {
    it('flags a package row as isHiddenCatalog when its catalog package is hidden', () => {
      const packagesById = new Map([['p6', { id: 'p6', name: 'Special Offer', hidden: true, children: ['1'] }]]);
      const row = resolveServiceRow(makeCatalogPackageEntry({ id: 'p6', children: ['1'] }), new Map(), { packagesById });
      expect(row.isHiddenCatalog).toBe(true);
      expect(row.isCustomized).toBe(false);
    });

    it('left on "auto", renders full detail for a hidden package but only a Budget reference for a standard one', () => {
      const packagesById = new Map([
        ['hidden-1', { id: 'hidden-1', name: 'Special Offer', hidden: true, children: ['1'] }],
        ['standard-1', { id: 'standard-1', name: 'Programme', children: ['1'] }],
      ]);
      const hiddenRow = resolveServiceRow(makeCatalogPackageEntry({ id: 'hidden-1', children: ['1'] }), new Map(), { packagesById });
      const standardRow = resolveServiceRow(makeCatalogPackageEntry({ id: 'standard-1', children: ['1'] }), new Map(), { packagesById });
      expect(shouldRenderPackageDetail(hiddenRow)).toBe(true);
      expect(shouldRenderPackageDetail(standardRow)).toBe(false);
    });

    it('an explicit detailMode override always wins over the auto default', () => {
      const packagesById = new Map([
        ['hidden-1', { id: 'hidden-1', name: 'Special Offer', hidden: true, children: ['1'] }],
        ['standard-1', { id: 'standard-1', name: 'Programme', children: ['1'] }],
      ]);
      const hiddenEntry = setEntryField(makeCatalogPackageEntry({ id: 'hidden-1', children: ['1'] }), 'detailMode', 'reference');
      const standardEntry = setEntryField(makeCatalogPackageEntry({ id: 'standard-1', children: ['1'] }), 'detailMode', 'full');
      const hiddenRow = resolveServiceRow(hiddenEntry, new Map(), { packagesById });
      const standardRow = resolveServiceRow(standardEntry, new Map(), { packagesById });
      expect(shouldRenderPackageDetail(hiddenRow)).toBe(false);
      expect(shouldRenderPackageDetail(standardRow)).toBe(true);
      // Setting detailMode is a display choice, not a content edit - it must never flip `customized`.
      expect(hiddenEntry.customized).toBeUndefined();
      expect(standardEntry.customized).toBeUndefined();
    });

    it('a custom (self-contained) package always renders full detail regardless of detailMode', () => {
      const row = resolveServiceRow(makeCustomPackageEntry({ name: 'Bespoke' }), new Map(), { packagesById: new Map() });
      expect(shouldRenderPackageDetail(row)).toBe(true);
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
      expect(resolveServiceRow(makeCatalogItemEntry('22'), catalogItemsById).price).toBe(21160);
      expect(resolveServiceRow(makeCatalogItemEntry('30'), catalogItemsById, { rates: { usd: 40, eur: 50 } }).price).toBe(80);
    });

    // P0 bug repro: "Compensation to surrogate mother for the program" is a USD-priced catalog item
    // (surrogate-mother-compensation is in budgetCatalogUtils.USD_ITEM_IDS) - its price must resolve
    // to an exact cents amount (e.g. via a plain Number equality check), never a float like
    // 18514.292958... leaking through to the invoice row / price input.
    it('never leaks float noise for a USD-priced surrogate-mother-compensation row', () => {
      const catalogItemsById = new Map([
        ['surrogate-mother-compensation', { id: 'surrogate-mother-compensation', name: 'Compensation to surrogate mother for the program', price: 20124.23 }],
      ]);
      const row = resolveServiceRow(makeCatalogItemEntry('surrogate-mother-compensation'), catalogItemsById);
      expect(row.price).toBe(Math.round(row.price * 100) / 100);
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

    it('defaults an unoverridden package row to its catalog listed price, not the sum of its children', () => {
      const catalogItemsById = new Map([
        ['1', { id: '1', name: 'Consultation', price: 300 }],
        ['2', { id: '2', name: 'Legal support', price: 700 }],
      ]);
      // The catalog's own listed price (40000) deliberately doesn't match the sum of these two
      // sample children (1000) - childrenTotal is only a reference figure for the admin to check
      // budget coverage, it must never itself be billed unless the price is explicitly overridden.
      const packagesById = new Map([['p1', { id: 'p1', name: 'Full program', listedPrice: 40000, children: ['1', '2'] }]]);
      const pkg = makeCatalogPackageEntry({ id: 'p1', children: ['1', '2'] });

      const row = resolveServiceRow(pkg, catalogItemsById, { packagesById });
      expect(row.price).toBe(40000);
      expect(row.childrenTotal).toBe(1000);
      expect(row.hasPriceOverride).toBe(false);
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

    it('rounds a percent-of-package price to the cent instead of leaking float noise (P0 bug)', () => {
      const packagesById = new Map([['1', { id: '1', name: 'IVF+ED+SM', listedPrice: 12345.67 }]]);
      const entry = makePercentOfPackageEntry('1', 34.129);
      const row = resolveServiceRow(entry, new Map(), { packagesById });
      // Unrounded this would be 12345.67 * 34.129 / 100 = 4213.4537143 (float noise), a value
      // that renders as an unbounded string of digits instead of a clean currency amount.
      expect(row.price).toBe(4213.45);
      expect(Number(row.price.toFixed(10))).toBe(row.price);
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

    // Catalog package rows are reference blocks (Payment Schedule mirrors the catalog programme for
    // context, like Budget) - their own prices must never be billed into this invoice's Subtotal,
    // only the other rows actually invoiced alongside them (custom/catalog items, or a % share) are.
    it('excludes a package row\'s own price from the subtotal, billing only the invoice\'s other rows', () => {
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
      expect(subtotal).toBe(3300);
      expect(computeInvoiceTotal(subtotal, 14)).toBeCloseTo(3762);
    });

    it('still bills a "% of package" row even though the package row itself is reference-only', () => {
      const packagesById = new Map([['p1', { id: 'p1', name: 'Full program', listedPrice: 40000, children: ['1'] }]]);
      const catalogItemsById = new Map([['1', { id: '1', name: 'Consultation', price: 300 }]]);
      const invoiceServices = [
        makeCatalogPackageEntry({ id: 'p1', children: ['1'] }),
        makePercentOfPackageEntry('p1', 20),
        makeCustomEntry({ name: 'Deposit', price: 300 }),
      ];
      const rows = resolveInvoiceServiceRows(invoiceServices, catalogItemsById, { packagesById });
      const subtotal = computeInvoiceSubtotal(rows);
      // 20% of 40000 (8000) + the 300 deposit - the package's own 40000 reference price is excluded.
      expect(subtotal).toBe(8300);
    });

    it('includes a custom package row in the subtotal because there is no catalog share row', () => {
      const catalogItemsById = new Map([['1', { id: '1', name: 'Consultation', price: 300 }]]);
      const customPackage = addCatalogChildToPackage(makeCustomPackageEntry({ name: 'From-scratch package' }), '1');
      const rows = resolveInvoiceServiceRows([customPackage], catalogItemsById);
      expect(rows[0]).toMatchObject({ kind: 'package', catalogId: '', price: 300, childrenTotal: 300 });
      expect(computeInvoiceSubtotal(rows)).toBe(300);
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

  // round4 #6: one shared save/display/delete pattern for both recent payment schedules and
  // recent tax rates, instead of two separate ad hoc systems.
  describe('shared recent-list mechanism (payment schedules, tax rates)', () => {
    it('adds a new entry to the front, and re-adding an existing id moves it to the front instead of duplicating', () => {
      const a = { id: 'a', value: 14 };
      const b = { id: 'b', value: 20 };
      const withBoth = upsertRecentEntry(upsertRecentEntry([], a), b);
      expect(withBoth).toEqual([b, a]);
      expect(upsertRecentEntry(withBoth, a)).toEqual([a, b]);
    });

    it('touches an existing entry by id to the front without needing the full object again', () => {
      const a = { id: 'a', value: 14 };
      const b = { id: 'b', value: 20 };
      expect(touchRecentEntry([a, b], 'b')).toEqual([b, a]);
      expect(touchRecentEntry([a, b], 'missing')).toEqual([a, b]);
    });

    it('removes an entry by id, leaving the rest untouched', () => {
      const a = { id: 'a', value: 14 };
      const b = { id: 'b', value: 20 };
      expect(removeRecentEntry([a, b], 'a')).toEqual([b]);
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
