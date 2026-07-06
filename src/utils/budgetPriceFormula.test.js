import {
  evaluateBudgetPriceFormula,
  extractBudgetFormulaItemIds,
  isBudgetPriceFormula,
  stripBudgetFormulaPrefix,
} from './budgetPriceFormula';

describe('budgetPriceFormula', () => {
  it('detects formulas by the "=" prefix', () => {
    expect(isBudgetPriceFormula('=23000/EUR')).toBe(true);
    expect(isBudgetPriceFormula('  =1+2')).toBe(true);
    expect(isBudgetPriceFormula('23000')).toBe(false);
    expect(isBudgetPriceFormula(23000)).toBe(false);
  });

  it('strips the formula prefix', () => {
    expect(stripBudgetFormulaPrefix('=1+2')).toBe('1+2');
    expect(stripBudgetFormulaPrefix('1+2')).toBe('1+2');
  });

  it('evaluates arithmetic with +, -, *, / and parentheses', () => {
    expect(evaluateBudgetPriceFormula('=2+3*4')).toBe(14);
    expect(evaluateBudgetPriceFormula('=(2+3)*4')).toBe(20);
    expect(evaluateBudgetPriceFormula('=10-4/2')).toBe(8);
    expect(evaluateBudgetPriceFormula('=-5+10')).toBe(5);
  });

  it('resolves currency identifiers through the resolver', () => {
    const resolve = name => (name.toLowerCase() === 'eur' ? 46 : NaN);
    expect(evaluateBudgetPriceFormula('=23000/EUR', resolve)).toBeCloseTo(500);
  });

  it('resolves item references through the resolver', () => {
    const values = { id14: 100, id15: 30, eur: 2 };
    const resolve = name => values[name.toLowerCase()] ?? values[name] ?? NaN;
    expect(evaluateBudgetPriceFormula('=(id14+id15*3)/EUR', resolve)).toBeCloseTo(95);
  });

  it('throws for unresolved identifiers, bad syntax and division by zero', () => {
    expect(() => evaluateBudgetPriceFormula('=1/EUR')).toThrow();
    expect(() => evaluateBudgetPriceFormula('=1+')).toThrow();
    expect(() => evaluateBudgetPriceFormula('=1/0')).toThrow();
    expect(() => evaluateBudgetPriceFormula('=')).toThrow();
  });

  it('extracts referenced item ids from a formula', () => {
    expect(extractBudgetFormulaItemIds('=(id14+id15*3)/EUR')).toEqual(['14', '15']);
    expect(extractBudgetFormulaItemIds('=100/EUR')).toEqual([]);
  });
});
