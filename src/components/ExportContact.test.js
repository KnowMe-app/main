import { isSingleUserPayload, makeVCard } from './ExportContact';

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


describe('makeVCard contact name', () => {
  it('keeps structured markers before phone when personal name is missing', () => {
    const vCard = makeVCard({
      userId: 'u1',
      phone: '380971840661',
      birth: '02.10.1988',
      blood: '-',
      csection: '1',
      height: '160',
      weight: '90',
      maritalStatus: 'так',
    });

    expect(vCard).toMatch(/FN;CHARSET=UTF-8:КМСД \d+ рк- кс1 імт35\.2 заміжня 380971840661/);
  });
});
