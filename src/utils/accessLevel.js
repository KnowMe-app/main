export const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

export const isAdminUid = uid => !!uid && ADMIN_UIDS.includes(uid);

const normalize = level =>
  String(level || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .replace(/&/g, 'and');

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

export const canAccessAddByLevel = accessLevel => {
  const { hasAdd } = parseAccessLevel(accessLevel);
  return hasAdd;
};

export const resolveAccess = ({ uid, accessLevel }) => {
  const isAdmin = isAdminUid(uid);
  const canAccessMatching = isAdmin || canAccessMatchingByLevel(accessLevel);
  const canAccessAdd = isAdmin || canAccessAddByLevel(accessLevel);

  return {
    isAdmin,
    canAccessMatching,
    canAccessAdd,
  };
};
