export const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

export const isAdminUid = uid => !!uid && ADMIN_UIDS.includes(uid);

const normalize = level =>
  String(level || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .replace(/&/g, 'and');

export const canAccessMatchingByLevel = accessLevel => {
  const level = normalize(accessLevel);
  if (!level) return false;
  return level.includes('matching:view') || level.includes('matching:viewandwrite') || level.includes('matchingandaddnewprofile:view') || level.includes('matchingandaddnewprofile:viewandwrite') || level.includes('matching+addnewprofile:view') || level.includes('matching+addnewprofile:viewandwrite');
};

export const canAccessAddByLevel = accessLevel => {
  const level = normalize(accessLevel);
  if (!level) return false;
  return level.includes('matchingandaddnewprofile:view') || level.includes('matchingandaddnewprofile:viewandwrite') || level.includes('matching+addnewprofile:view') || level.includes('matching+addnewprofile:viewandwrite');
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
