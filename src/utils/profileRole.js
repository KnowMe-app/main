const PROFILE_ROLE_ALIASES = {
  ed: 'ed',
  'egg donor': 'ed',
  egg_donor: 'ed',
  sm: 'sm',
  'surrogate mother': 'sm',
  surrogate_mother: 'sm',
  ag: 'ag',
  agency: 'ag',
  ip: 'ip',
  'intended parents': 'ip',
  intended_parent: 'ip',
  pp: 'pp',
  cl: 'cl',
  client: 'cl',
};

export const normalizeProfileRole = value => (
  PROFILE_ROLE_ALIASES[String(value || '').trim().toLowerCase()] || ''
);

export const normalizeRoleSearchKeyIndexValue = (roleValue, userRoleValue) => {
  const normalizeSingleRole = value => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return normalizeProfileRole(normalized) || '?';
  };

  const normalizedRole = normalizeSingleRole(roleValue);
  if (normalizedRole && normalizedRole !== '?') return normalizedRole;

  const normalizedUserRole = normalizeSingleRole(userRoleValue);
  if (normalizedUserRole && normalizedUserRole !== '?') return normalizedUserRole;

  if (normalizedRole === '?' || normalizedUserRole === '?') return '?';
  return 'no';
};
