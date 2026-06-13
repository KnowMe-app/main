import { resolveEqualToSearchKeys } from './searchKeyCheckboxFilters';

describe('resolveEqualToSearchKeys', () => {
  it('keeps equalTo searches scoped to explicitly selected keys', () => {
    expect(resolveEqualToSearchKeys(['createdAt'])).toEqual(['createdAt']);
  });

  it('does not fall back to every equalTo key for an explicit empty selection', () => {
    expect(resolveEqualToSearchKeys([])).toEqual([]);
    expect(resolveEqualToSearchKeys(['unknownKey'])).toEqual([]);
  });

  it('keeps the legacy all-keys fallback only when no explicit key list is provided', () => {
    expect(resolveEqualToSearchKeys()).toEqual(expect.arrayContaining(['createdAt', 'getInTouch']));
  });
});
