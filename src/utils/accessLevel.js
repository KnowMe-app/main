export const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

export const isAdminUid = uid => !!uid && ADMIN_UIDS.includes(uid);

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

export const resolveAccess = ({ uid, accessLevel, role, userRole } = {}) => {
  const isAdmin = isAdminUid(uid);
  const canAccessMatching = isAdmin || canAccessMatchingByLevel(accessLevel) || canAccessMatchingByRole({ role, userRole });
  const canAccessAdd = isAdmin || canAccessAddByLevel(accessLevel);

  return {
    isAdmin,
    canAccessMatching,
    canAccessAdd,
  };
};
