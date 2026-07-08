import {
  addExpectedExpenseService,
  buildExpectedExpensesPlan,
  computeExpectedExpenseAmountDue,
  computeExpectedExpenseSubtotal,
  getExpectedExpensesValidation,
  isExpectedExpensesShape,
  normalizeExpectedExpensesData,
  removeExpectedExpenseService,
  resolveExpectedExpenseRows,
  updateExpectedExpenseServiceField,
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
    { title: 'To start the program', amount: 8772 },
    { title: 'To start stimulation of a SM', amount: 6228 },
    { title: 'In a week before embryo transfer', amount: 3000 },
  ],
};

const priceContext = {
  packagesById: new Map([['3', pkg]]),
  resolvePackagePrice: packageRow => Number(packageRow?.listedPrice) || 0,
};

describe('expectedExpensesUtils', () => {
  it('builds a compact template with one service group per schedule payment', () => {
    const plan = buildExpectedExpensesPlan(pkg, schedule);
    expect(plan.packageId).toBe('3');
    expect(plan.expectedExpenses).toHaveLength(3);
    expect(plan.expectedExpenses[0][0]).toMatchObject({ kind: 'packagePercent', catalogId: '3' });
    expect(plan.expectedExpenses[0][0].percent).toBeCloseTo(21.93, 2);
  });

  it('round-trips through normalization and supports legacy string rows', () => {
    const normalized = normalizeExpectedExpensesData({
      packageId: '3',
      expectedExpenses: [['id3 || 20%', 'Deposit for transportation of SM || 300', 'id32']],
    });
    expect(normalized.packageId).toBe('3');
    expect(normalized.expectedExpenses[0]).toMatchObject([
      { kind: 'packagePercent', catalogId: '3', percent: 20 },
      { kind: 'custom', name: 'Deposit for transportation of SM', price: 300 },
      { kind: 'item', catalogId: '32' },
    ]);
    expect(normalizeExpectedExpensesData(null)).toBeNull();
  });

  it('adds, edits, removes, resolves, and totals expected service rows', () => {
    let plan = buildExpectedExpensesPlan(pkg, schedule);
    const deposit = makeCustomEntry({ name: 'Deposit for transportation of SM', price: 300 });
    plan = addExpectedExpenseService(plan, 0, deposit);
    plan = updateExpectedExpenseServiceField(plan, 0, deposit.id, 'price', '350');
    expect(plan.expectedExpenses[0].find(row => row.id === deposit.id).price).toBe(350);

    const rows = resolveExpectedExpenseRows(plan.expectedExpenses[0], new Map(), priceContext);
    const subtotal = computeExpectedExpenseSubtotal(rows);
    expect(subtotal).toBeCloseTo(9122);
    expect(computeExpectedExpenseAmountDue(subtotal, 14)).toBeCloseTo(10399.08);

    plan = removeExpectedExpenseService(plan, 0, deposit.id);
    expect(plan.expectedExpenses[0]).toHaveLength(1);
  });

  it('validates extra groups against the schedule length', () => {
    const plan = { packageId: '3', expectedExpenses: [[], [], [], []] };
    expect(getExpectedExpensesValidation(plan, schedule)).toContain('4 groups');
    expect(getExpectedExpensesValidation({ packageId: '3', expectedExpenses: [[]] }, schedule)).toBe('');
  });

  it('accepts new templates and legacy milestone plans', () => {
    expect(isExpectedExpensesShape(buildExpectedExpensesPlan(pkg, schedule))).toBe(true);
    expect(isExpectedExpensesShape({ packageId: '3', milestones: [] })).toBe(true);
    expect(isExpectedExpensesShape({})).toBe(false);
  });

  describe('expectedExpensesSeed.json', () => {
    it('is a valid, normalizable expected-expenses template', () => {
      expect(isExpectedExpensesShape(expectedExpensesSeed)).toBe(true);
      const normalized = normalizeExpectedExpensesData(expectedExpensesSeed);
      expect(normalized.packageId).toBe('3');
      expect(normalized.expectedExpenses).toHaveLength(6);
      expect(normalized.expectedExpenses[0][0]).toMatchObject({ kind: 'packagePercent', catalogId: '3' });
    });
  });
});
