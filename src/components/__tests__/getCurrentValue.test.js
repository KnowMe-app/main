import { getCurrentValue } from '../getCurrentValue';

describe('getCurrentValue', () => {
  it('returns last non-empty value from array', () => {
    const arr = [undefined, null, '', 'first', 'second'];
    expect(getCurrentValue(arr)).toBe('second');
  });

  it('returns last non-empty value from object', () => {
    const obj = { a: '', b: null, c: 'value' };
    expect(getCurrentValue(obj)).toBe('value');
  });

  it('handles nested structures', () => {
    const nested = [null, { a: '', b: ['', 'deep'] }];
    expect(getCurrentValue(nested)).toBe('deep');
  });
});

