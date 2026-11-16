import {
  ADMIN_UIDS,
  INVOICE_BUILDER_UIDS,
  SCREEN_ACCESS_OPTIONS,
  canAccessMatchingByRole,
  clearStoredAccessRights,
  encodeScreenAccess,
  parseScreenAccess,
  persistScreenAccess,
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
      canCreateProfiles: true,
      canAccessFlow: true,
    });
  });

  it('does not grant add access from role-only matching access', () => {
    expect(resolveAccess({ uid: 'viewer', accessLevel: '', userRole: 'ag' })).toEqual({
      isAdmin: false,
      canAccessMatching: true,
      canAccessAdd: false,
      canAccessInvoices: false,
      canCreateProfiles: false,
      canAccessFlow: false,
    });
  });

  it('grants invoice builder access without full admin rights', () => {
    const access = resolveAccess({ uid: INVOICE_BUILDER_UIDS[0], accessLevel: '', userRole: '' });
    expect(access.canAccessInvoices).toBe(true);
    expect(access.isAdmin).toBe(false);
    expect(access.canAccessAdd).toBe(false);
  });

  it('grants profile creation only through its explicit permission', () => {
    expect(resolveAccess({ uid: 'viewer', canCreateProfiles: true }).canCreateProfiles).toBe(true);
    expect(resolveAccess({ uid: 'viewer', accessLevel: 'matching add' }).canCreateProfiles).toBe(false);
  });
});

describe('права видають лише два адміни', () => {
  // eslint-disable-next-line global-require
  const { PRIVILEGED_PROFILE_FIELDS, stripPrivilegedProfileFields, canGrantProfilePrivileges, READONLY_ADMIN_UIDS } = require('./accessLevel');
  const fs = require('fs');
  const path = require('path');
  const payload = { name: 'Оксана', lastLogin: '2026-10-16', accessLevel: 'matching:view', canCreateProfiles: true, multiDataSourceUserIds: { x: true } };

  it('знімає поля прав із запису не-адміна, решту лишає', () => {
    expect(stripPrivilegedProfileFields(payload, 'ordinaryUid')).toEqual({ name: 'Оксана', lastLogin: '2026-10-16' });
    expect(stripPrivilegedProfileFields(payload, '')).toEqual({ name: 'Оксана', lastLogin: '2026-10-16' });
    expect(PRIVILEGED_PROFILE_FIELDS).toEqual(['accessLevel', 'canCreateProfiles', 'multiDataSourceUserIds', 'screenAccess']);
  });

  it('адмінові лишає все, інспекторові на читання — ні', () => {
    ADMIN_UIDS.forEach(uid => {
      expect(canGrantProfilePrivileges(uid)).toBe(true);
      expect(stripPrivilegedProfileFields(payload, uid)).toBe(payload);
    });
    READONLY_ADMIN_UIDS.forEach(uid => expect(canGrantProfilePrivileges(uid)).toBe(false));
  });

  it('обидва писачі анкети в RTDB знімають права з запису не-адміна', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'config.js'), 'utf8');
    expect(source.split('const cleanedUploadedInfo = stripPrivilegedProfileFields(').length - 1).toBe(2);
  });

  it('правила бази дають змінювати права лише цим двом адмінам', () => {
    const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'database.rules.json'), 'utf8')).rules;
    const admins = ADMIN_UIDS.map(uid => `auth.uid == '${uid}'`).join(' || ');
    expect(rules.users).toBeUndefined();
    ['profileTechnical'].forEach(root => {
      const node = rules[root].$uid;
      expect(node.accessLevel['.validate']).toBe(`${admins} || (data.exists() && newData.val() == data.val())`);
      expect(node.canCreateProfiles['.validate']).toBe(`${admins} || (data.exists() && newData.val() == data.val())`);
      expect(node.multiDataSourceUserIds.$sourceUserId['.validate']).toBe(`${admins} || (data.exists() && newData.val() == data.val())`);
    });
  });

  it('screenAccess — теж лише адмінське право в правилах, і лише коди екранів', () => {
    const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'database.rules.json'), 'utf8')).rules;
    const admins = ADMIN_UIDS.map(uid => `auth.uid == '${uid}'`).join(' || ');
    const validate = rules.profileTechnical.$uid.screenAccess['.validate'];
    expect(validate.startsWith(`(${admins} || (data.exists() && newData.val() == data.val()))`)).toBe(true);
    expect(validate).toContain('newData.isString()');
  });
});

describe('додаткові екрани (screenAccess)', () => {
  afterEach(() => localStorage.clear());

  it('відкриває Flow лише тим, кому його видав адмін', () => {
    expect(resolveAccess({ uid: 'viewer', screenAccess: '' }).canAccessFlow).toBe(false);
    expect(resolveAccess({ uid: 'viewer', screenAccess: 'flow' }).canAccessFlow).toBe(true);
    expect(resolveAccess({ uid: 'viewer', screenAccess: 'Flow, budget' }).canAccessFlow).toBe(true);
    expect(resolveAccess({ uid: 'viewer', screenAccess: 'workflow' }).canAccessFlow).toBe(false);
    expect(resolveAccess({ uid: ADMIN_UIDS[0], screenAccess: '' }).canAccessFlow).toBe(true);
    // Самого лише рівня доступу матчингу для Flow мало.
    expect(resolveAccess({ uid: 'viewer', accessLevel: 'add+matching:view&write', screenAccess: '' }).canAccessFlow).toBe(false);
  });

  it('без явного значення бере збережене при вході — як меню на чужих сторінках', () => {
    persistScreenAccess('flow');
    expect(resolveAccess({ uid: 'viewer' }).canAccessFlow).toBe(true);
    clearStoredAccessRights();
    expect(resolveAccess({ uid: 'viewer' }).canAccessFlow).toBe(false);
  });

  it('пише лише відомі коди, в сталому порядку', () => {
    expect(parseScreenAccess('flow,unknown,FLOW')).toEqual(['flow']);
    expect(encodeScreenAccess(['flow', 'flow'])).toBe('flow');
    expect(encodeScreenAccess([])).toBe('');
    expect(SCREEN_ACCESS_OPTIONS.map(option => option.path)).toContain('/flow');
  });

  it('перший екран: Flow — не-адмінові з відкритим Flow, адмінові — ні', () => {
    // eslint-disable-next-line global-require
    const { resolveFlowHomeRoute } = require('./accessLevel');
    expect(resolveFlowHomeRoute(resolveAccess({ uid: 'viewer', screenAccess: 'flow' }))).toBe('/flow');
    expect(resolveFlowHomeRoute(resolveAccess({ uid: 'viewer', screenAccess: '' }))).toBeNull();
    expect(resolveFlowHomeRoute(resolveAccess({ uid: ADMIN_UIDS[0], screenAccess: 'flow' }))).toBeNull();
    expect(resolveFlowHomeRoute(null)).toBeNull();
  });
});
