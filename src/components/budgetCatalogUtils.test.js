import {
  formatMoney,
  getExpensePriceLabel,
  getItemDisplayAmount,
  normalizeCatalog,
  normalizeClientNotes,
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

  it('prefixes range-based items with "from"', () => {
    expect(getExpensePriceLabel({ id: 32, price: 100 })).toBe('from 100 EUR');
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
