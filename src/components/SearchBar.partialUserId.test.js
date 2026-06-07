import { parsePartialUserIdPrefix } from './SearchBar';

describe('parsePartialUserIdPrefix', () => {
  it('allows exact-case catalog key prefixes for users/newUsers userId search', () => {
    expect(parsePartialUserIdPrefix('IORgRD')).toBe('IORgRD');
    expect(parsePartialUserIdPrefix('  AbC_123-XYZ  ')).toBe('AbC_123-XYZ');
  });

  it('keeps existing known userId prefixes working', () => {
    expect(parsePartialUserIdPrefix('AA1')).toBe('AA1');
    expect(parsePartialUserIdPrefix('-ab')).toBe('-ab');
  });

  it('does not treat phones, emails, urls, or too-short prefixes as catalog prefixes', () => {
    expect(parsePartialUserIdPrefix('380501234567')).toBeNull();
    expect(parsePartialUserIdPrefix('test@example.com')).toBeNull();
    expect(parsePartialUserIdPrefix('https://example.com/id')).toBeNull();
    expect(parsePartialUserIdPrefix('AB')).toBeNull();
  });
});
