import { encodeSeekingRoles, parseSeekingRoles, toggleSeekingRole } from '../donorPrograms';
import { buildMatchingCardProjection, legacySeekingRole, normalizeSeekingRole } from '../matchingCardIndex';

describe('кого шукають біологічні батьки — набір', () => {
  it('старе «Обох» читається як донорка й СМ, незнайоме відкидається', () => {
    expect(parseSeekingRoles('both')).toEqual(['ed', 'sm']);
    expect(parseSeekingRoles('cl, ed,anyone')).toEqual(['ed', 'cl']);
    expect(parseSeekingRoles('')).toEqual([]);
  });

  it('донорка й СМ пишуться старими словами — їх приймає й невикочене правило', () => {
    expect(encodeSeekingRoles(['sm', 'ed'])).toBe('both');
    expect(encodeSeekingRoles(['ed'])).toBe('ed');
    expect(encodeSeekingRoles(['ag', 'ed', 'cl'])).toBe('ed,ag,cl');
    expect(toggleSeekingRole('both', 'ag')).toBe('ed,sm,ag');
    expect(toggleSeekingRole('ed,ag', 'ag')).toBe('ed');
    expect(toggleSeekingRole('ag', 'ag')).toBe('');
  });

  it('картка несе набір, а запасне значення — лише донорку й СМ', () => {
    expect(normalizeSeekingRole('ed,ag')).toBe('ed,ag');
    expect(legacySeekingRole('ed,sm,ag')).toBe('both');
    expect(legacySeekingRole('ag,cl')).toBe('');
    expect(buildMatchingCardProjection('u1', { seeking: 'ag,cl', userRole: 'ip' }).seekingRole).toBe('ag,cl');
  });
});
