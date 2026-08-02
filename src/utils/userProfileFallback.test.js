import {
  isFullProfileFallbackData,
  isLegacyFullProfileFallbackData,
  markFullProfileFallback,
} from './userProfileFallback';

describe('user profile fallback recognition', () => {
  it('recognizes explicitly marked fallbacks', () => {
    expect(isFullProfileFallbackData(markFullProfileFallback({ email: 'user@example.com' }))).toBe(true);
  });

  it('recognizes rollout-era full profiles but rejects session-only metadata', () => {
    expect(isLegacyFullProfileFallbackData({ email: 'user@example.com', lastLogin2: '2026-08-02' })).toBe(true);
    expect(isLegacyFullProfileFallbackData({ lastLogin: '02.08.2026', lastLogin2: '2026-08-02' })).toBe(false);
  });
});
