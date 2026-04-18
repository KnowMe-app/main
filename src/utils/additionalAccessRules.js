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
  if (!normalized) return { group: 'empty', rh: 'empty', bucket: 'no' };

  const fullMatch = normalized.match(/^([1-4])([+-])$/);
  if (fullMatch) {
    return { group: fullMatch[1], rh: fullMatch[2], bucket: `${fullMatch[1]}${fullMatch[2]}` };
  }

  const groupOnlyMatch = normalized.match(/^([1-4])$/);
  if (groupOnlyMatch) {
    return { group: groupOnlyMatch[1], rh: 'empty', bucket: groupOnlyMatch[1] };
  }

  if (normalized === '+') return { group: 'other', rh: '+', bucket: '+' };
  if (normalized === '-') return { group: 'other', rh: '-', bucket: '-' };

  return { group: 'other', rh: 'other', bucket: '?' };
};

const normalizeMarital = value => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'empty';
  if (['+', 'yes', 'так', 'заміжня', 'married'].includes(normalized)) return 'married';
  if (['-', 'no', 'ні', 'незаміжня', 'unmarried', 'single'].includes(normalized)) return 'unmarried';
  return 'other';
};

const parseMaritalRuleToken = token => {
  const normalized = String(token || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === '?') return 'other';
  if (['no', 'empty'].includes(normalized)) return 'empty';
  return normalizeMarital(normalized);
};

const AGE_BUCKET_KEYS = new Set(['le25', '26_30', '31_33', '34_36', '37_42', '43_plus', 'other']);
const BLOOD_BUCKET_KEYS = new Set(['1+', '1-', '1', '2+', '2-', '2', '3+', '3-', '3', '4+', '4-', '4', '?', 'no']);
const CSECTION_BUCKET_KEYS = new Set(['cs2plus', 'cs1', 'cs0', 'other', 'no']);

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

export const ADDITIONAL_ACCESS_TEMPLATE = `age: le25,26_30,31_33,34_36,37_42,43_plus,other
blood: 1+,1-,1,2+,2-,2,3+,3-,3,4+,4-,4,?,no
maritalStatus: +,-,?,no
csection: cs2plus,cs1,cs0,other,no
contact: vk,instagram,facebook,phone,telegram,telegram2,tiktok,email
role: ed,sm,ag,ip,cl,?,no
userId: vk,aa,ab,long,mid,other
imt: le28,29_31,32_35,36_plus,?,no
ageBirthDate: d_2001-01-30,?,no
reaction: d_2026-04-18,99,?,no
height: 170,165.5,?,no
weight: 55,60.5,?,no`;


const normalizeCsectionRuleBucket = value => {
  if (value === null || value === undefined) return 'no';

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return 'no';
  const token = normalized.replace(/[.,;:!?]+$/g, '');

  if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(token)) return 'cs1';
  if (token === '+' || token === 'plus') return 'cs1';
  if (token === '++' || token === '+++') return 'cs2plus';
  if (/^[+-]?\d+$/.test(token)) {
    const parsedInt = Number.parseInt(token, 10);
    if (parsedInt === 1) return 'cs1';
    if (parsedInt === 2 || parsedInt === 3) return 'cs2plus';
  }

  if (['-', 'no', 'ні', 'minus'].includes(token)) return 'cs0';
  return 'other';
};

export const parseAdditionalAccessRules = raw => {
  const lines = parseRulesLines(raw);
  if (!lines.length) return null;

  const result = {};

  lines.forEach(({ key, value }) => {
    const tokens = parseTokens(value);
    if (!tokens.length) return;

    if (key === 'age') {
      const allowedAges = new Set();
      const allowedAgeBuckets = new Set();

      tokens.forEach(token => {
        const normalizedToken = String(token || '').trim().toLowerCase();
        if (AGE_BUCKET_KEYS.has(normalizedToken)) {
          allowedAgeBuckets.add(normalizedToken);
          return;
        }

        const parsedAge = Number.parseInt(normalizedToken, 10);
        if (Number.isFinite(parsedAge) && parsedAge >= 0) {
          allowedAges.add(parsedAge);
        }
      });

      if (allowedAges.size) {
        result.age = allowedAges;
      }

      if (allowedAgeBuckets.size) {
        result.ageBuckets = allowedAgeBuckets;
      }
      return;
    }

    if (key === 'blood') {
      const groups = new Set();
      const rhs = new Set();
      const buckets = new Set();
      tokens.forEach(token => {
        const normalizedToken = String(token || '').trim().toLowerCase();
        if (BLOOD_BUCKET_KEYS.has(normalizedToken)) {
          buckets.add(normalizedToken);
        }

        const parsed = parseBloodFromRuleToken(token);
        if (!parsed) return;
        parsed.groups.forEach(group => groups.add(group));
        parsed.rhs.forEach(rh => rhs.add(rh));
      });

      if (groups.size || rhs.size || buckets.size) {
        result.blood = {
          groups,
          rhs,
          buckets,
        };
      }
      return;
    }

    if (key === 'maritalstatus') {
      const allowed = new Set(tokens.map(token => parseMaritalRuleToken(token)).filter(Boolean));
      if (allowed.size) {
        result.maritalStatus = allowed;
      }
      return;
    }

    if (key === 'csection') {
      const csectionBuckets = new Set(
        tokens
          .map(token => String(token || '').trim().toLowerCase())
          .filter(token => CSECTION_BUCKET_KEYS.has(token))
      );

      if (csectionBuckets.size > 0) {
        result.csectionBuckets = csectionBuckets;
      }

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

  if (parsedRules.age || parsedRules.ageBuckets) {
    const age = utilCalculateAge(user?.birth);
    if (!Number.isFinite(age)) {
      if (parsedRules.age || (parsedRules.ageBuckets && !parsedRules.ageBuckets.has('other'))) {
        return false;
      }
    } else {
      const byAge = !parsedRules.age || parsedRules.age.has(age);
      const ageBucket = ageToBucket(age);
      const byBucket = !parsedRules.ageBuckets || parsedRules.ageBuckets.has(ageBucket);
      if (!byAge && !byBucket) {
        return false;
      }
    }
  }

  if (parsedRules.blood) {
    const blood = parseBloodFromUser(user?.blood);
    const bucketOk = !parsedRules.blood.buckets || parsedRules.blood.buckets.size === 0 || parsedRules.blood.buckets.has(blood.bucket);
    const groupOk = parsedRules.blood.groups.size === 0 || parsedRules.blood.groups.has(blood.group);
    const rhOk = parsedRules.blood.rhs.size === 0 || parsedRules.blood.rhs.has(blood.rh);

    if (!bucketOk && (!groupOk || !rhOk)) {
      return false;
    }
  }

  if (parsedRules.maritalStatus) {
    const marital = normalizeMarital(user?.maritalStatus);
    if (!parsedRules.maritalStatus.has(marital)) {
      return false;
    }
  }

  if (parsedRules.csectionBuckets && parsedRules.csectionBuckets.size > 0) {
    const csectionBucket = normalizeCsectionRuleBucket(user?.csection);
    if (!parsedRules.csectionBuckets.has(csectionBucket)) {
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

const ALL_BLOOD_GROUPS = ['1', '2', '3', '4'];

const uniq = values => [...new Set((values || []).filter(Boolean))];

const resolveBloodSearchKeyBuckets = parsedRules => {
  if (!parsedRules?.blood) return [];

  if (parsedRules.blood.buckets?.size) {
    return uniq([...parsedRules.blood.buckets]);
  }

  const groups = parsedRules.blood.groups?.size
    ? [...parsedRules.blood.groups]
    : [...ALL_BLOOD_GROUPS];
  const rhs = parsedRules.blood.rhs?.size
    ? [...parsedRules.blood.rhs]
    : ['+', '-'];

  const buckets = [];
  groups.forEach(group => {
    rhs.forEach(rh => {
      if (/^[1-4]$/.test(String(group)) && ['+', '-'].includes(String(rh))) {
        buckets.push(`${group}${rh}`);
      }
    });
  });

  return uniq(buckets);
};

const resolveMaritalStatusSearchKeyBuckets = parsedRules => {
  if (!parsedRules?.maritalStatus) return [];

  const buckets = [];
  if (parsedRules.maritalStatus.has('married')) buckets.push('+');
  if (parsedRules.maritalStatus.has('unmarried')) buckets.push('-');
  if (parsedRules.maritalStatus.has('other')) {
    buckets.push('?');
  }
  if (parsedRules.maritalStatus.has('empty')) {
    buckets.push('no');
  }

  return uniq(buckets);
};

const resolveCsectionSearchKeyBuckets = parsedRules => {
  if (parsedRules?.csectionBuckets?.size) {
    return uniq([...parsedRules.csectionBuckets]);
  }

  if (!parsedRules?.csection) return [];

  const { mode, value } = parsedRules.csection;
  if (!Number.isFinite(value)) return [];

  if (mode === 'exact') {
    if (value <= 0) return ['cs0'];
    if (value === 1) return ['cs1'];
    if (value === 2 || value === 3) return ['cs2plus'];
    return ['cs2plus', 'other'];
  }

  if (mode === 'atLeast') {
    if (value <= 0) return ['cs0', 'cs1', 'cs2plus', 'other'];
    if (value === 1) return ['cs1', 'cs2plus'];
    return ['cs2plus'];
  }

  return [];
};

const resolveAgeSearchKeyBuckets = parsedRules => {
  const directBuckets = parsedRules?.ageBuckets ? [...parsedRules.ageBuckets] : [];
  const numericBuckets = parsedRules?.age
    ? [...parsedRules.age]
      .filter(age => Number.isFinite(age) && age >= 0)
      .map(age => ageToBucket(age))
    : [];

  return uniq([...directBuckets, ...numericBuckets]);
};

export const resolveAdditionalAccessSearchKeyBuckets = parsedRules => ({
  blood: resolveBloodSearchKeyBuckets(parsedRules),
  maritalStatus: resolveMaritalStatusSearchKeyBuckets(parsedRules),
  csection: resolveCsectionSearchKeyBuckets(parsedRules),
  age: resolveAgeSearchKeyBuckets(parsedRules),
});

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
