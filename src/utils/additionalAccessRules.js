import { utilCalculateAge } from 'components/smallCard/utilCalculateAge';

const GROUP_KEYS = ['1', '2', '3', '4'];

const defaultAllowed = keys =>
  keys.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});

const normalizeLineKey = key =>
  String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

const parseRulesLines = raw =>
  String(raw || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [left, ...rest] = line.split(':');
      if (!left || rest.length === 0) return null;
      return {
        key: normalizeLineKey(left),
        value: rest.join(':').trim(),
      };
    })
    .filter(Boolean);

const parseTokens = value =>
  String(value || '')
    .split(',')
    .map(token => token.trim())
    .filter(Boolean);

const ageToBucket = age => {
  if (!Number.isFinite(age) || age < 0) return 'other';
  if (age <= 25) return 'le25';
  if (age <= 30) return '26_30';
  if (age <= 33) return '31_33';
  if (age <= 36) return '34_36';
  if (age <= 42) return '37_42';
  return '43_plus';
};

const normalizeBlood = value =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

const parseBloodFromRuleToken = token => {
  const normalized = normalizeBlood(token);
  if (!normalized) return null;

  if (normalized === '+' || normalized === '-') {
    return { groups: [...GROUP_KEYS], rhs: [normalized] };
  }

  const match = normalized.match(/^([1-4])([+-])?$/);
  if (!match) return null;

  const [, group, rh] = match;
  return {
    groups: [group],
    rhs: rh ? [rh] : ['+', '-'],
  };
};

const parseBloodFromUser = value => {
  const normalized = normalizeBlood(value);
  if (!normalized) return { group: 'other', rh: 'other' };

  const match = normalized.match(/^([1-4])([+-])$/);
  if (!match) return { group: 'other', rh: 'other' };

  return { group: match[1], rh: match[2] };
};

const normalizeMarital = value => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['+', 'yes', 'так', 'заміжня', 'married'].includes(normalized)) return 'married';
  if (['-', 'no', 'ні', 'незаміжня', 'unmarried', 'single'].includes(normalized)) return 'unmarried';
  return 'other';
};

const parseCsectionCount = value => {
  if (Array.isArray(value)) {
    const numericValues = value
      .map(item => Number.parseInt(String(item), 10))
      .filter(num => Number.isFinite(num));
    if (numericValues.length) {
      return Math.max(...numericValues);
    }
  }

  const match = String(value || '').match(/\d+/);
  if (match) return Number.parseInt(match[0], 10);
  return null;
};

export const ADDITIONAL_ACCESS_TEMPLATE = `age: 21,22,23\nblood: 1+,2,-\nmaritalStatus: +,-\ncsection: 2+`;

export const parseAdditionalAccessRules = raw => {
  const lines = parseRulesLines(raw);
  if (!lines.length) return null;

  const result = {};

  lines.forEach(({ key, value }) => {
    const tokens = parseTokens(value);
    if (!tokens.length) return;

    if (key === 'age') {
      const allowedAges = new Set(
        tokens
          .map(token => Number.parseInt(token, 10))
          .filter(num => Number.isFinite(num) && num >= 0)
      );
      if (allowedAges.size) {
        result.age = allowedAges;
      }
      return;
    }

    if (key === 'blood') {
      const groups = new Set();
      const rhs = new Set();
      tokens.forEach(token => {
        const parsed = parseBloodFromRuleToken(token);
        if (!parsed) return;
        parsed.groups.forEach(group => groups.add(group));
        parsed.rhs.forEach(rh => rhs.add(rh));
      });

      if (groups.size || rhs.size) {
        result.blood = {
          groups,
          rhs,
        };
      }
      return;
    }

    if (key === 'maritalstatus') {
      const allowed = new Set(tokens.map(token => normalizeMarital(token)).filter(Boolean));
      if (allowed.size) {
        result.maritalStatus = allowed;
      }
      return;
    }

    if (key === 'csection') {
      const rule = tokens[0];
      if (!rule) return;
      const atLeastMatch = rule.match(/^(\d+)\+$/);
      if (atLeastMatch) {
        result.csection = { mode: 'atLeast', value: Number.parseInt(atLeastMatch[1], 10) };
        return;
      }

      const exact = Number.parseInt(rule, 10);
      if (Number.isFinite(exact)) {
        result.csection = { mode: 'exact', value: exact };
      }
    }
  });

  return Object.keys(result).length ? result : null;
};

export const isUserAllowedByAdditionalAccess = (user, parsedRules) => {
  if (!parsedRules) return true;

  if (parsedRules.age) {
    const age = utilCalculateAge(user?.birth);
    if (!Number.isFinite(age) || !parsedRules.age.has(age)) {
      return false;
    }
  }

  if (parsedRules.blood) {
    const blood = parseBloodFromUser(user?.blood);
    const groupOk = parsedRules.blood.groups.size === 0 || parsedRules.blood.groups.has(blood.group);
    const rhOk = parsedRules.blood.rhs.size === 0 || parsedRules.blood.rhs.has(blood.rh);

    if (!groupOk || !rhOk) {
      return false;
    }
  }

  if (parsedRules.maritalStatus) {
    const marital = normalizeMarital(user?.maritalStatus);
    if (!parsedRules.maritalStatus.has(marital)) {
      return false;
    }
  }

  if (parsedRules.csection) {
    const csectionCount = parseCsectionCount(user?.csection);
    if (!Number.isFinite(csectionCount)) {
      return false;
    }

    if (parsedRules.csection.mode === 'atLeast' && csectionCount < parsedRules.csection.value) {
      return false;
    }

    if (parsedRules.csection.mode === 'exact' && csectionCount !== parsedRules.csection.value) {
      return false;
    }
  }

  return true;
};

export const filterUsersByAdditionalAccess = (usersMap, parsedRules) => {
  if (!parsedRules || !usersMap || typeof usersMap !== 'object') return usersMap || {};

  return Object.fromEntries(
    Object.entries(usersMap).filter(([, user]) => isUserAllowedByAdditionalAccess(user, parsedRules))
  );
};

export const createAllFalseFilterGroup = keys =>
  keys.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

export const defaultAdditionalAccessFilterState = {
  age: defaultAllowed(['le25', '26_30', '31_33', '34_36', '37_42', '43_plus', 'other', 'empty']),
  bloodGroup: defaultAllowed(['1', '2', '3', '4', 'other', 'empty']),
  rh: defaultAllowed(['+', '-', 'other', 'empty']),
  maritalStatus: defaultAllowed(['married', 'unmarried', 'other', 'empty']),
  csection: defaultAllowed(['cs2plus', 'cs1', 'cs0', 'other', 'no']),
};

export const ageBucketFromAge = ageToBucket;
