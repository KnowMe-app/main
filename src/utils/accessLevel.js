export const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

export const isAdminUid = uid => !!uid && ADMIN_UIDS.includes(uid);

// UIDs granted Invoice Builder access without full admin rights.
export const INVOICE_BUILDER_UIDS = ['S0VhDLCYjuTFDNLalRa85u7fPcg2'];

export const isInvoiceBuilderUid = uid => !!uid && (isAdminUid(uid) || INVOICE_BUILDER_UIDS.includes(uid));

const normalize = level =>
  String(level || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .replace(/&/g, 'and');

export const normalizeRole = role => String(role || '').trim().toLowerCase();

export const isNonEdRole = role => {
  const normalizedRole = normalizeRole(role);
  return Boolean(normalizedRole) && normalizedRole !== 'ed';
};

const parseAccessLevel = accessLevel => {
  const level = normalize(accessLevel);
  if (!level) {
    return { hasMatching: false, hasAdd: false };
  }

  const hasMatching = level.includes('matching');
  const hasAdd = level.includes('add') || level.includes('addnewprofile');

  return { hasMatching, hasAdd };
};

export const canAccessMatchingByLevel = accessLevel => {
  const { hasMatching } = parseAccessLevel(accessLevel);
  return hasMatching;
};

export const canAccessMatchingByRole = ({ role, userRole } = {}) => isNonEdRole(userRole || role);

export const canAccessAddByLevel = accessLevel => {
  const { hasAdd } = parseAccessLevel(accessLevel);
  return hasAdd;
};

export const ACCESS_LEVEL_STORAGE_KEY = 'accessLevel';

/**
 * Рівень доступу, збережений при вході.
 *
 * `null` — це не «немає прав», а «застосунок ще не знає»: ключ зникає на виході
 * і зʼявляється назад лише після того, як прочитано власну анкету. Різниця між
 * ним і порожнім рядком (звичайний користувач без жодного рівня) важлива для
 * тих, хто вирішує за цим значенням, що показувати.
 */
export const readStoredAccessLevel = () => (
  typeof localStorage !== 'undefined' ? localStorage.getItem(ACCESS_LEVEL_STORAGE_KEY) : null
);

export const CAN_CREATE_PROFILES_STORAGE_KEY = 'canCreateProfiles';

export const readStoredCanCreateProfiles = () => (
  typeof localStorage !== 'undefined'
  && localStorage.getItem(CAN_CREATE_PROFILES_STORAGE_KEY) === 'true'
);

export const persistCanCreateProfiles = canCreateProfiles => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CAN_CREATE_PROFILES_STORAGE_KEY, String(canCreateProfiles === true));
  }
};

export const clearStoredAccessRights = () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CAN_CREATE_PROFILES_STORAGE_KEY);
  }
};

export const resolveAccess = ({ uid, accessLevel, role, userRole, canCreateProfiles = false } = {}) => {
  const isAdmin = isAdminUid(uid);
  const canAccessMatching = isAdmin || canAccessMatchingByLevel(accessLevel) || canAccessMatchingByRole({ role, userRole });
  const canAccessAdd = isAdmin || canAccessAddByLevel(accessLevel);
  const canAccessInvoices = isInvoiceBuilderUid(uid);
  const canCreateProfilesResolved = isAdmin || canCreateProfiles === true;

  return {
    isAdmin,
    canAccessMatching,
    canAccessAdd,
    canAccessInvoices,
    canCreateProfiles: canCreateProfilesResolved,
  };
};
