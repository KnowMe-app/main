import {
  applyPaymentPurposePlaceholders,
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  generateInvoiceIdentifiers,
  getActiveBeneficiary,
  getTodayYmd,
  makeCatalogServiceEntry,
  makeCustomServiceEntry,
  isInvoiceDataShape,
  normalizeInvoiceData,
  parseServiceEntry,
  reorderBeneficiaryIds,
  reorderRecentServices,
  resolveInvoiceServiceRows,
  resolveServiceRow,
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

  it('parses catalog-referenced service rows ("idNN")', () => {
    expect(parseServiceEntry('id15')).toEqual({ isCatalog: true, catalogId: '15' });
  });

  it('parses custom "Name || Price" service rows', () => {
    expect(parseServiceEntry('Deposit for transportation of SM || 300')).toEqual({
      isCatalog: false,
      name: 'Deposit for transportation of SM',
      price: 300,
    });
  });

  it('round-trips catalog and custom service entries', () => {
    expect(makeCatalogServiceEntry('15')).toBe('id15');
    expect(makeCustomServiceEntry('Extra fee', 50)).toBe('Extra fee || 50');
  });

  it('resolves a catalog service row against the budget catalog', () => {
    const catalogItemsById = new Map([['15', { id: '15', name: 'Scheduled payment', price: 3000 }]]);
    expect(resolveServiceRow('id15', catalogItemsById)).toEqual({
      key: 'id15', isCatalog: true, catalogId: '15', missing: false, name: 'Scheduled payment', description: '', price: 3000,
    });
  });



  it('resolves catalog invoice rows with budget display conversion and formula rates', () => {
    const catalogItemsById = new Map([
      ['22', { id: '22', name: 'USD compensation', price: 23000 }],
      ['30', { id: '30', name: 'Formula price', price: '=USD/EUR*100' }],
    ]);
    expect(resolveServiceRow('id22', catalogItemsById).price).toBeCloseTo(21160);
    expect(resolveServiceRow('id30', catalogItemsById, { rates: { usd: 40, eur: 50 } }).price).toBeCloseTo(80);
  });

  it('flags a catalog reference that no longer exists', () => {
    const row = resolveServiceRow('id999', new Map());
    expect(row.missing).toBe(true);
  });

  it('computes subtotal and tax-inclusive total from resolved rows', () => {
    const catalogItemsById = new Map([['15', { id: '15', name: 'Scheduled payment', price: 3000 }]]);
    const rows = resolveInvoiceServiceRows(
      ['id15', 'Deposit for transportation of SM || 300', 'Deposit for medical expenses of SM || 300'],
      catalogItemsById,
    );
    const subtotal = computeInvoiceSubtotal(rows);
    expect(subtotal).toBe(3600);
    expect(computeInvoiceTotal(subtotal, 14)).toBeCloseTo(4104);
  });

  it('moves used services to the front of recentServices, deduped', () => {
    const recentServices = ['id1', 'id2', 'id3'];
    const invoiceServices = ['id3', 'id2'];
    expect(reorderRecentServices(recentServices, invoiceServices)).toEqual(['id3', 'id2', 'id1']);
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
