import { normalizeProfileRole, normalizeRoleSearchKeyIndexValue } from './profileRole';

describe('normalizeProfileRole', () => {
  it.each(['sm', 'surrogate mother', 'surrogate_mother'])(
    'normalizes the surrogate role alias %s for display and search indexing',
    role => {
      expect(normalizeProfileRole(role)).toBe('sm');
    }
  );

  it('normalizes surrounding whitespace and letter case', () => {
    expect(normalizeProfileRole(' Surrogate Mother ')).toBe('sm');
  });

  it('returns an empty value for missing and unknown roles', () => {
    expect(normalizeProfileRole()).toBe('');
    expect(normalizeProfileRole('unknown')).toBe('');
  });
});

describe('normalizeRoleSearchKeyIndexValue', () => {
  it.each(['sm', 'surrogate mother', 'surrogate_mother'])(
    'indexes the surrogate role alias %s in the sm bucket',
    role => {
      expect(normalizeRoleSearchKeyIndexValue(role, null)).toBe('sm');
    }
  );

  it('uses a recognized userRole when role is unknown', () => {
    expect(normalizeRoleSearchKeyIndexValue('unknown', 'surrogate_mother')).toBe('sm');
  });
});
