import { normalizeProfileRole } from './profileRole';

describe('normalizeProfileRole', () => {
  it.each([
    ['egg donor', 'ed'],
    ['egg_donor', 'ed'],
    ['surrogate mother', 'sm'],
    ['surrogate_mother', 'sm'],
    ['agency', 'ag'],
    ['intended parents', 'ip'],
    ['intended_parent', 'ip'],
    ['client', 'cl'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeProfileRole(value)).toBe(expected);
  });

  it.each(['constructor', 'toString', '__proto__'])('rejects inherited property %s', value => {
    expect(normalizeProfileRole(value)).toBe('');
  });
});
