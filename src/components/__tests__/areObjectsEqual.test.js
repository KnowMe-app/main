import { areObjectsEqual } from '../areObjectsEqual';

describe('areObjectsEqual', () => {
  it('returns true for equal objects', () => {
    expect(areObjectsEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('ignores statusDate differences', () => {
    expect(
      areObjectsEqual({ a: 1, statusDate: '2024-01-01' }, { a: 1 })
    ).toBe(true);
    expect(
      areObjectsEqual({ a: 1 }, { a: 1, statusDate: '2024-01-02' })
    ).toBe(true);
  });

  it('returns false for different values', () => {
    expect(areObjectsEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it('compares nested objects', () => {
    expect(
      areObjectsEqual({ a: { b: 2 }, c: 3 }, { a: { b: 2 }, c: 3 })
    ).toBe(true);
    expect(
      areObjectsEqual({ a: { b: 2 }, c: 3 }, { a: { b: 4 }, c: 3 })
    ).toBe(false);
  });
});

