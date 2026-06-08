import {
  evaluateFlowAmountFormula,
  formatFlowAmountResult,
  resolveFlowAmountInput,
} from './flowAmountFormula';

describe('flowAmountFormula', () => {
  it('keeps a plain negative amount as a debt value', () => {
    expect(resolveFlowAmountInput('-125,50')).toBe('-125.50');
  });

  it('calculates formulas with addition, subtraction, multiplication, division and parentheses', () => {
    expect(resolveFlowAmountInput('=(100-25)*2/3')).toBe('50');
  });

  it('supports postfix percent values in formulas', () => {
    expect(evaluateFlowAmountFormula('=20%')).toBeCloseTo(0.2);
    expect(resolveFlowAmountInput('=100+20%')).toBe('100.2');
  });

  it('supports unary minus and localized operators', () => {
    expect(resolveFlowAmountInput('=-(100+20)')).toBe('-120');
    expect(resolveFlowAmountInput('=10×5÷2')).toBe('25');
  });

  it('rounds final flow amounts to two decimal places without trailing zeroes', () => {
    expect(formatFlowAmountResult(10 / 3)).toBe('3.33');
    expect(formatFlowAmountResult(-0)).toBe('0');
  });

  it('rejects invalid formulas', () => {
    expect(() => resolveFlowAmountInput('=100/0')).toThrow('division by zero');
    expect(() => resolveFlowAmountInput('=100+abc')).toThrow('unsupported characters');
  });
});
