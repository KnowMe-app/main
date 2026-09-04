const PROFILE_ROLE_ALIASES = Object.freeze(Object.assign(Object.create(null), {
  ed: 'ed',
  donor: 'ed',
  'до': 'ed',
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
}));

export const normalizeProfileRole = value => {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROFILE_ROLE_ALIASES, key)
    ? PROFILE_ROLE_ALIASES[key]
    : '';
};
