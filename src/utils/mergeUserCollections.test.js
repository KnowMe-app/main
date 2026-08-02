import { isLongFormatUserId, mergeUserCollectionData, mergeUserFieldValue } from './mergeUserCollections';

describe('isLongFormatUserId', () => {
  it('treats ids longer than 20 chars as long-format (Firebase-Auth UIDs)', () => {
    expect(isLongFormatUserId('Oghb1LphfASVOY3b6JO1Ov4CDyD2')).toBe(true);
  });

  it('treats exactly 20-char ids (Firebase push ids) as short-format', () => {
    expect(isLongFormatUserId('a'.repeat(20))).toBe(false);
  });

  it('treats catalog-style ids as short-format', () => {
    expect(isLongFormatUserId('TG0016')).toBe(false);
  });

  it('treats missing/empty ids as short-format', () => {
    expect(isLongFormatUserId(undefined)).toBe(false);
    expect(isLongFormatUserId(null)).toBe(false);
    expect(isLongFormatUserId('')).toBe(false);
  });
});

describe('mergeUserCollectionData (regression, unchanged behavior)', () => {
  it('still merges per-field with primary (users) taking precedence', () => {
    expect(mergeUserCollectionData({ name: 'A' }, { name: 'B', extra: 'C' })).toEqual({
      name: 'A',
      extra: 'C',
    });
  });

  it('still keeps mergeUserFieldValue exported for existing callers', () => {
    expect(mergeUserFieldValue(undefined, 'x')).toBe('x');
  });
});
