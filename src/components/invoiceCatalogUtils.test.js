import {
  applyPaymentPurposePlaceholders,
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  generateInvoiceIdentifiers,
  getActiveBeneficiary,
  makeCatalogServiceEntry,
  makeCustomServiceEntry,
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

  it('fills invoiceNumber/invoiceDate placeholders into the payment purpose', () => {
    const template = 'Payment by the invoice № {invoiceNumber} of {invoiceDate} without VAT.';
    expect(applyPaymentPurposePlaceholders(template, { invoiceNumber: '23/05/2026', invoiceDate: '23.05.2026' }))
      .toBe('Payment by the invoice № 23/05/2026 of 23.05.2026 without VAT.');
  });
});
