import { formatDateAndFormula } from '../inputValidations';

describe('formatDateAndFormula weeks', () => {
  it('converts "22т" to date 22 weeks ago', () => {
    const today = new Date();
    const expected = new Date(today);
    expected.setDate(expected.getDate() - 22 * 7);
    const expectedStr = expected.toISOString().split('T')[0];
    expect(formatDateAndFormula('22т')).toBe(expectedStr);
  });

  it('converts "22w" to date 22 weeks ago', () => {
    const today = new Date();
    const expected = new Date(today);
    expected.setDate(expected.getDate() - 22 * 7);
    const expectedStr = expected.toISOString().split('T')[0];
    expect(formatDateAndFormula('22w')).toBe(expectedStr);
  });
});
