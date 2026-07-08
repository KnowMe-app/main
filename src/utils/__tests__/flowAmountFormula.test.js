import { evaluateFlowAmountFormula } from '../flowAmountFormula';

describe('evaluateFlowAmountFormula', () => {
  it('adds percent-only sums as decimal rates before multiplication', () => {
    expect(evaluateFlowAmountFormula('=100*(6%+1%)')).toBeCloseTo(7);
    expect(evaluateFlowAmountFormula('=100*(6%-1%)')).toBeCloseTo(5);
  });

  it('keeps percent adjustment behavior for non-percent left operands', () => {
    expect(evaluateFlowAmountFormula('=100+6%')).toBeCloseTo(106);
  });
});
