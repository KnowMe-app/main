import {
  ADMIN_UIDS,
  INVOICE_BUILDER_UIDS,
  canAccessMatchingByRole,
  resolveAccess,
} from './accessLevel';

describe('accessLevel', () => {
  it('grants matching access to non-ed roles', () => {
    expect(canAccessMatchingByRole({ userRole: 'ag' })).toBe(true);
    expect(canAccessMatchingByRole({ userRole: ' ip ' })).toBe(true);
    expect(canAccessMatchingByRole({ role: 'sm' })).toBe(true);
  });

  it('does not grant automatic matching access to ed or empty roles', () => {
    expect(canAccessMatchingByRole({ userRole: 'ed' })).toBe(false);
    expect(canAccessMatchingByRole({ userRole: ' ED ' })).toBe(false);
    expect(canAccessMatchingByRole({ userRole: '' })).toBe(false);
  });

  it('keeps explicit matching accessLevel access for ed users', () => {
    expect(resolveAccess({ uid: 'viewer', accessLevel: '', userRole: 'ed' }).canAccessMatching).toBe(false);
    expect(resolveAccess({ uid: 'viewer', accessLevel: 'matching', userRole: 'ed' }).canAccessMatching).toBe(true);
  });

  it('keeps admin access independent of role', () => {
    expect(resolveAccess({ uid: ADMIN_UIDS[0], accessLevel: '', userRole: 'ed' })).toEqual({
      isAdmin: true,
      canAccessMatching: true,
      canAccessAdd: true,
      canAccessInvoices: true,
    });
  });

  it('does not grant add access from role-only matching access', () => {
    expect(resolveAccess({ uid: 'viewer', accessLevel: '', userRole: 'ag' })).toEqual({
      isAdmin: false,
      canAccessMatching: true,
      canAccessAdd: false,
      canAccessInvoices: false,
    });
  });

  it('grants invoice builder access without full admin rights', () => {
    const access = resolveAccess({ uid: INVOICE_BUILDER_UIDS[0], accessLevel: '', userRole: '' });
    expect(access.canAccessInvoices).toBe(true);
    expect(access.isAdmin).toBe(false);
    expect(access.canAccessAdd).toBe(false);
  });
});
