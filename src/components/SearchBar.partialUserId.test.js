import { parseExplicitSearchKeyCandidate, parsePartialUserIdPrefix, resolveExecutionPlan } from './SearchBar';

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

describe('parseExplicitSearchKeyCandidate', () => {
  it('treats a bare value as valid when telegram key is selected explicitly', () => {
    expect(parseExplicitSearchKeyCandidate('telegram', 'Anna_Smile0808')).toBe('Anna_Smile0808');
    expect(parseExplicitSearchKeyCandidate('telegram', ' @Anna_Smile0808 ')).toBe('Anna_Smile0808');
  });

  it('keeps labeled telegram parsing working before falling back to raw key normalization', () => {
    expect(parseExplicitSearchKeyCandidate('telegram', 'telegram: Anna_Smile0808')).toBe('Anna_Smile0808');
  });
});

describe('resolveExecutionPlan', () => {
  it('checks every selected key as primary without fallback keys', () => {
    expect(resolveExecutionPlan({
      allKeys: ['telegram', 'phone', 'email'],
      selectedKeys: ['telegram', 'phone'],
      detectedKey: 'telegram',
      rawQuery: 'Anna_Smile0808',
    })).toEqual({
      primaryKeys: ['telegram', 'phone'],
      fallbackKeys: [],
    });
  });

  it('checks every available key when no explicit key subset is selected', () => {
    expect(resolveExecutionPlan({
      allKeys: ['telegram', 'phone', 'email'],
      selectedKeys: [],
      detectedKey: 'telegram',
      rawQuery: 'Anna_Smile0808',
    })).toEqual({
      primaryKeys: ['telegram', 'phone', 'email'],
      fallbackKeys: [],
    });
  });
});
