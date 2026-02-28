import { isSingleUserPayload } from './ExportContact';

describe('isSingleUserPayload', () => {
  it('returns true for a single user object without name', () => {
    expect(isSingleUserPayload({ userId: 'u1', phone: '380001112233' })).toBe(true);
  });

  it('returns false for users dictionary payload', () => {
    expect(
      isSingleUserPayload({
        u1: { userId: 'u1', phone: '380001112233' },
        u2: { userId: 'u2', phone: '380004445566' },
      }),
    ).toBe(false);
  });
});
