import {
  collectFormulaReferencedItemIds,
  computePackageChildrenTotal,
  describeBudgetPriceFormula,
  formatMoney,
  getExpensePriceLabel,
  getItemDisplayAmount,
  normalizeBudgetPriceInput,
  normalizeCatalog,
  normalizeClientNotes,
  resolveBudgetPriceAmount,
  USD_TO_EUR_RATE,
} from './budgetCatalogUtils';

describe('budgetCatalogUtils', () => {
  it('converts USD-based items to EUR for display', () => {
    const item = { id: 22, price: 23000 };
    expect(getItemDisplayAmount(item)).toBeCloseTo(23000 * USD_TO_EUR_RATE);
  });

  it('keeps EUR items unchanged', () => {
    expect(getItemDisplayAmount({ id: 1, price: 5000 })).toBe(5000);
  });

  it('only prefixes "from" when the stored price says so, never by item id', () => {
    expect(getExpensePriceLabel({ id: 32, price: 100 })).toBe('100 EUR');
    expect(getExpensePriceLabel({ id: 1, price: 5000 })).toBe('5,000 EUR');
  });

  it('formats money with thousands separators', () => {
    expect(formatMoney(40000)).toBe('40,000 EUR');
    expect(formatMoney('not-a-number')).toBe('— EUR');
  });

  it('normalizes grouped client notes objects', () => {
    const notes = normalizeClientNotes({
      programMilestones: ['First note', ''],
      surrogateMotherExpenses: ['Second note'],
      broken: 'not-an-array',
    });
    expect(notes).toEqual({
      programMilestones: ['First note'],
      surrogateMotherExpenses: ['Second note'],
    });
  });

  it('normalizes legacy array client notes into the general group', () => {
    expect(normalizeClientNotes(['A note'])).toEqual({ general: ['A note'] });
    expect(normalizeClientNotes(null)).toEqual({});
  });

  it('resolves "=" price formulas with the EUR rate', () => {
    const context = { rates: { eur: 46, usd: 42 } };
    expect(resolveBudgetPriceAmount('=23000/EUR', context)).toBeCloseTo(500);
    expect(resolveBudgetPriceAmount('=23000/EUR', {})).toBeNull();
    expect(resolveBudgetPriceAmount(5000)).toBe(5000);
    expect(resolveBudgetPriceAmount('from 250')).toBe(250);
  });

  it('resolves item references (sub-services) inside formulas', () => {
    const itemsById = new Map([
      ['14', { id: 14, name: 'Medication', price: 100 }],
      ['15', { id: 15, name: 'Screening', price: '=60/EUR' }],
    ]);
    const context = { itemsById, rates: { eur: 2 } };
    expect(resolveBudgetPriceAmount('=(id14+id15*3)/EUR', context)).toBeCloseTo(95);
  });

  it('returns null for circular item references', () => {
    const itemsById = new Map([
      ['1', { id: 1, price: '=id2' }],
      ['2', { id: 2, price: '=id1' }],
    ]);
    expect(resolveBudgetPriceAmount('=id1', { itemsById, rates: {} })).toBeNull();
  });

  it('prefixes items with "from" stored in the price', () => {
    expect(getExpensePriceLabel({ id: 1, price: 'from 250' })).toBe('from 250 EUR');
    expect(getItemDisplayAmount({ id: 1, price: 'from 250' })).toBe(250);
  });

  it('keeps plain numbers numeric and formulas as strings on save', () => {
    expect(normalizeBudgetPriceInput('250')).toBe(250);
    expect(normalizeBudgetPriceInput(' 250,5 ')).toBe(250.5);
    expect(normalizeBudgetPriceInput('=23000/EUR')).toBe('=23000/EUR');
    expect(normalizeBudgetPriceInput('from 250')).toBe('from 250');
    expect(normalizeBudgetPriceInput('')).toBe('');
  });

  it('collects sub-service ids referenced from price formulas', () => {
    const catalog = {
      items: [
        { id: 1, price: '=(id14+id15*3)/EUR' },
        { id: 14, price: 100 },
        { id: 15, price: 30 },
      ],
      packages: [{ id: 'p1', listedPrice: '=id16*2' }],
    };
    expect([...collectFormulaReferencedItemIds(catalog)].sort()).toEqual(['14', '15', '16']);
  });

  it('describes formulas with service names and the computed total', () => {
    const itemsById = new Map([
      ['14', { id: 14, name: 'Medication', price: 100 }],
      ['15', { id: 15, name: 'Screening', price: 30 }],
    ]);
    const context = { itemsById, rates: { eur: 2 } };
    const description = describeBudgetPriceFormula('=(id14+id15*3)/EUR', context);
    expect(description).toContain('Medication [100]');
    expect(description).toContain('Screening [30]');
    expect(description).toContain('EUR 2');
    expect(description).toContain('= 95');
    expect(describeBudgetPriceFormula(500, context)).toBe('');
  });

  it('sums resolved prices of package children', () => {
    const itemsById = new Map([
      ['1', { id: 1, price: 100 }],
      ['2', { id: 2, price: '=40/EUR' }],
    ]);
    const context = { itemsById, rates: { eur: 2 } };
    const summary = computePackageChildrenTotal({ children: [1, 2, 99] }, context);
    expect(summary.total).toBeCloseTo(120);
    expect(summary.count).toBe(3);
    expect(summary.resolvedCount).toBe(2);
  });

  it('normalizes a full catalog with grouped client notes', () => {
    const catalog = normalizeCatalog({
      packages: [{ id: 1 }],
      items: [{ id: 1 }],
      clientNotes: { programMilestones: ['Note'] },
      technical: { wireTransferSurchargeRate: 0.14 },
    });
    expect(catalog.packages).toHaveLength(1);
    expect(catalog.clientNotes.programMilestones).toEqual(['Note']);
    expect(catalog.technical.wireTransferSurchargeRate).toBe(0.14);
  });
});
