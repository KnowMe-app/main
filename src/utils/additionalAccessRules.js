import { utilCalculateAge } from 'components/smallCard/utilCalculateAge';
import { utilCalculateIMT } from 'components/smallCard/utilCalculateIMT';

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

const toIsoDate = date =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;

const getBirthDateBucketsForAge = age => {
  if (!Number.isFinite(age) || age < 0) return [];

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(todayUtc);
  start.setUTCFullYear(start.getUTCFullYear() - (age + 1));
  start.setUTCDate(start.getUTCDate() + 1);

  const end = new Date(todayUtc);
  end.setUTCFullYear(end.getUTCFullYear() - age);

  const buckets = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    buckets.push(`d_${toIsoDate(cursor)}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
};

const ageToBucket = age => {
  if (!Number.isFinite(age) || age < 0) return 'other';
  if (age <= 21) return 'le21';
  if (age <= 25) return '22_25';
  if (age <= 30) return '26_30';
  if (age <= 35) return '31_35';
  if (age <= 38) return '36_38';
  if (age <= 41) return '39_41';
  return '42_plus';
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

const AGE_BUCKET_KEYS = new Set([
  'le21',
  '22_25',
  '26_30',
  '31_35',
  '36_38',
  '39_41',
  '42_plus',
  'le25',
  '31_33',
  '34_36',
  '37_42',
  '43_plus',
  'other',
]);
const BLOOD_BUCKET_KEYS = new Set(['1+', '1-', '1', '2+', '2-', '2', '3+', '3-', '3', '4+', '4-', '4', '?', 'no']);
const CSECTION_BUCKET_KEYS = new Set(['cs2plus', 'cs1', 'cs0', 'other', 'no']);

const ADDITIONAL_ACCESS_KEY_ALIASES = {
  'вік': 'age',
  age: 'age',
  blood: 'blood',
  кров: 'bloodGroup',
  'групакрові': 'bloodGroup',
  bloodgroup: 'bloodGroup',
  rh: 'rh',
  'резус': 'rh',
  maritalstatus: 'maritalStatus',
  'сімейнийстан': 'maritalStatus',
  csection: 'csection',
  'кс': 'csection',
  imt: 'imt',
  'імт': 'imt',
  role: 'role',
  contact: 'contact',
  userid: 'userId',
  reaction: 'reaction',
  height: 'height',
  weight: 'weight',
  agebirthdate: 'ageBirthDate',
};

export const ADDITIONAL_ACCESS_FILTER_OPTIONS = {
  age: ['le21', '22_25', '26_30', '31_35', '36_38', '39_41', '42_plus', '?', 'no'],
  csection: ['cs2plus', 'cs1', 'cs0', '?', 'no'],
  bloodGroup: ['1', '2', '3', '4', '?', 'no'],
  rh: ['+', '-', '?', 'no'],
  maritalStatus: ['+', '-', '?', 'no'],
  imt: ['le28', '29_31', '32_35', '36_plus', '?', 'no'],
  role: ['ed', 'sm', 'ag', 'ip', 'cl', '?', 'no'],
  contact: ['vk', 'instagram', 'facebook', 'phone', 'telegram', 'telegram2', 'tiktok', 'linkedin', 'youtube', 'email'],
  userId: ['vk', 'aa', 'ab', 'id', 'long', 'mid', 'other'],
  reaction: ['past', 'future', '99', '?', 'no'],
  height: ['lt163', '163_176', '177_180', '181_plus', '?', 'no'],
  weight: ['lt55', '55_69', '70_84', '85_plus', '?', 'no'],
  ageBirthDate: ['d_2001-01-30', '?', 'no'],
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

export const ADDITIONAL_ACCESS_TEMPLATE = `age: 18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42_plus,?,no
blood: 1+,1-,1,2+,2-,2,3+,3-,3,4+,4-,4,?,no
maritalStatus: +,-,?,no
csection: cs2plus,cs1,cs0,other,no
contact: vk,instagram,facebook,phone,telegram,telegram2,tiktok,linkedin,youtube,email
role: ed,sm,ag,ip,cl,?,no
userId: vk,aa,ab,id,long,mid,other
imt: le28,29_31,32_35,36_plus,?,no
ageBirthDate: d_2001-01-30,?,no
reaction: d_2026-04-18,99,?,no
height: 170,165.5,?,no
weight: 55,60.5,?,no`;

const normalizeRuleKey = key => ADDITIONAL_ACCESS_KEY_ALIASES[key] || key;

const toRoleBucket = user => {
  const normalize = value => String(value || '').trim().toLowerCase();
  const rawRole = normalize(user?.role);
  const rawUserRole = normalize(user?.userRole);
  const value = rawRole || rawUserRole;
  if (['ed', 'sm', 'ag', 'ip', 'cl'].includes(value)) return value;
  if (!value) return 'no';
  return '?';
};

const toUserIdBuckets = userId => {
  const normalized = String(userId || '').trim().toLowerCase();
  if (!normalized) return ['other'];
  const buckets = [];
  if (normalized.startsWith('vk')) buckets.push('vk');
  if (normalized.startsWith('aa')) buckets.push('aa');
  if (normalized.startsWith('ab')) buckets.push('ab');
  if (normalized.startsWith('id')) buckets.push('id');
  if (normalized.length > 20) buckets.push('long');
  if (normalized.length > 8 && normalized.length <= 20) buckets.push('mid');
  if (!buckets.length) buckets.push('other');
  return buckets;
};

const toImtBucket = user => {
  const explicitImt = Number.parseFloat(String(user?.imt ?? '').trim().replace(',', '.'));
  let imtValue = Number.isFinite(explicitImt) && explicitImt > 0 ? explicitImt : null;
  if (!Number.isFinite(imtValue)) {
    const calculated = utilCalculateIMT(
      Number.parseFloat(String(user?.weight ?? '').trim().replace(',', '.')),
      Number.parseFloat(String(user?.height ?? '').trim().replace(',', '.'))
    );
    if (Number.isFinite(calculated) && calculated > 0) {
      imtValue = calculated;
    }
  }
  if (!Number.isFinite(imtValue) || imtValue <= 0) {
    const hasAny = String(user?.imt ?? '').trim() || String(user?.weight ?? '').trim() || String(user?.height ?? '').trim();
    return hasAny ? '?' : 'no';
  }
  const rounded = Math.round(imtValue);
  if (rounded <= 28) return 'le28';
  if (rounded <= 31) return '29_31';
  if (rounded <= 35) return '32_35';
  return '36_plus';
};

const toMetricBucket = (value, ranges) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return 'no';
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return '?';
  return ranges(parsed);
};

const toContactBuckets = user => {
  const keys = ['vk', 'instagram', 'facebook', 'phone', 'telegram', 'telegram2', 'tiktok', 'linkedin', 'youtube', 'email'];
  return keys.filter(key => String(user?.[key] || '').trim() !== '');
};

const normalizeBirthToIsoBucket = birth => {
  const raw = String(birth || '').trim();
  if (!raw) return 'no';
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return '?';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return '?';
  }
  return `d_${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getUserBucketsByRuleKey = (user, key) => {
  if (key === 'bloodGroup') {
    const blood = parseBloodFromUser(user?.blood);
    if (['1', '2', '3', '4'].includes(blood.group)) return [blood.group];
    if (blood.group === 'empty') return ['no'];
    return ['?'];
  }
  if (key === 'rh') {
    const blood = parseBloodFromUser(user?.blood);
    if (blood.rh === '+' || blood.rh === '-') return [blood.rh];
    if (blood.rh === 'empty') return ['no'];
    return ['?'];
  }
  if (key === 'maritalStatus') {
    const marital = normalizeMarital(user?.maritalStatus);
    if (marital === 'married') return ['+'];
    if (marital === 'unmarried') return ['-'];
    if (marital === 'empty') return ['no'];
    return ['?'];
  }
  if (key === 'role') {
    return [toRoleBucket(user)];
  }
  if (key === 'contact') {
    return toContactBuckets(user);
  }
  if (key === 'userId') {
    return toUserIdBuckets(user?.userId);
  }
  if (key === 'imt') {
    return [toImtBucket(user)];
  }
  if (key === 'height') {
    return [
      toMetricBucket(user?.height, metric => {
        if (metric < 163) return 'lt163';
        if (metric <= 176) return '163_176';
        if (metric <= 180) return '177_180';
        return '181_plus';
      }),
    ];
  }
  if (key === 'weight') {
    return [
      toMetricBucket(user?.weight, metric => {
        if (metric < 55) return 'lt55';
        if (metric <= 69) return '55_69';
        if (metric <= 84) return '70_84';
        return '85_plus';
      }),
    ];
  }
  if (key === 'ageBirthDate') {
    return [normalizeBirthToIsoBucket(user?.birth)];
  }
  if (key === 'reaction') {
    const reaction = String(user?.reaction || '').trim().toLowerCase();
    if (!reaction) return ['no'];
    if (reaction === '99') return ['99'];
    if (reaction === '?') return ['?'];
    if (reaction.includes('past')) return ['past'];
    if (reaction.includes('future')) return ['future'];
    return [reaction];
  }
  return [];
};


const normalizeSingleCsectionRuleBucket = value => {
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

const normalizeCsectionRuleBucket = value => {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .filter(item => item !== null && item !== undefined && String(item).trim() !== '')
      .map(item => normalizeSingleCsectionRuleBucket(item));

    if (normalizedItems.length === 0) return 'no';
    if (normalizedItems.includes('cs2plus')) return 'cs2plus';
    if (normalizedItems.includes('cs1')) return 'cs1';
    if (normalizedItems.includes('cs0')) return 'cs0';
    if (normalizedItems.includes('no')) return 'no';
    return 'other';
  }

  return normalizeSingleCsectionRuleBucket(value);
};

export const parseAdditionalAccessRules = raw => {
  const lines = parseRulesLines(raw);
  if (!lines.length) return null;

  const result = {};

  lines.forEach(({ key, value }) => {
    const tokens = parseTokens(value);
    if (!tokens.length) return;

    const normalizedKey = normalizeRuleKey(key);

    if (normalizedKey === 'age') {
      const allowedAges = new Set();
      let allow42Plus = false;
      let allowUnknownAge = false;
      let allowMissingAge = false;

      const addAgeRange = (from, to) => {
        for (let age = from; age <= to; age += 1) {
          allowedAges.add(age);
        }
      };

      tokens.forEach(token => {
        const normalizedToken = String(token || '').trim().toLowerCase();
        if (normalizedToken === 'le21') {
          addAgeRange(18, 21);
          return;
        }
        if (normalizedToken === '22_25') {
          addAgeRange(22, 25);
          return;
        }
        if (normalizedToken === '26_30') {
          addAgeRange(26, 30);
          return;
        }
        if (normalizedToken === '31_35') {
          addAgeRange(31, 35);
          return;
        }
        if (normalizedToken === '36_38') {
          addAgeRange(36, 38);
          return;
        }
        if (normalizedToken === '39_41') {
          addAgeRange(39, 41);
          return;
        }
        if (normalizedToken === '42_plus') {
          allow42Plus = true;
          return;
        }
        if (normalizedToken === '43_plus') {
          allow42Plus = true;
          return;
        }
        if (normalizedToken === 'le25') {
          addAgeRange(18, 25);
          return;
        }
        if (normalizedToken === '31_33') {
          addAgeRange(31, 33);
          return;
        }
        if (normalizedToken === '34_36') {
          addAgeRange(34, 36);
          return;
        }
        if (normalizedToken === '37_42') {
          addAgeRange(37, 42);
          return;
        }
        if (normalizedToken === 'no') {
          allowMissingAge = true;
          return;
        }
        if (normalizedToken === '?') {
          allowUnknownAge = true;
          return;
        }
        if (AGE_BUCKET_KEYS.has(normalizedToken)) return;

        const rangeMatch = normalizedToken.match(/^(\d{1,3})\s*[_-]\s*(\d{1,3})$/);
        if (rangeMatch) {
          const rangeStart = Number.parseInt(rangeMatch[1], 10);
          const rangeEnd = Number.parseInt(rangeMatch[2], 10);
          if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
            const from = Math.max(18, Math.min(rangeStart, rangeEnd));
            const to = Math.max(rangeStart, rangeEnd);
            addAgeRange(from, to);
            if (to >= 42) allow42Plus = true;
          }
          return;
        }

        const parsedAge = Number.parseInt(normalizedToken, 10);
        if (Number.isFinite(parsedAge) && parsedAge >= 18) {
          allowedAges.add(parsedAge);
          if (parsedAge >= 42) allow42Plus = true;
        }
      });

      if (allowedAges.size) {
        result.age = allowedAges;
      }

      if (allow42Plus) result.age42plus = true;
      if (allowUnknownAge) result.ageUnknown = true;
      if (allowMissingAge) result.ageNo = true;
      return;
    }

    if (normalizedKey === 'blood') {
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

    if (normalizedKey === 'maritalStatus') {
      const allowed = new Set(tokens.map(token => parseMaritalRuleToken(token)).filter(Boolean));
      if (allowed.size) {
        result.maritalStatus = allowed;
      }
      return;
    }

    if (normalizedKey === 'csection') {
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

    if ([
      'bloodGroup',
      'rh',
      'role',
      'contact',
      'userId',
      'imt',
      'reaction',
      'height',
      'weight',
      'ageBirthDate',
    ].includes(normalizedKey)) {
      const normalizedTokens = new Set(tokens.map(token => String(token || '').trim().toLowerCase()).filter(Boolean));
      if (normalizedTokens.size > 0) {
        if (!result.generic) result.generic = {};
        result.generic[normalizedKey] = normalizedTokens;
      }
    }
  });

  return Object.keys(result).length ? result : null;
};

export const parseAdditionalAccessRuleGroups = raw => {
  const groupsFromArray = Array.isArray(raw)
    ? raw
      .map(item => String(item || '').trim())
      .filter(Boolean)
    : String(raw || '')
      .split(/\r?\n\s*\r?\n+/)
      .map(group => group.trim())
      .filter(Boolean);

  if (!groupsFromArray.length) return [];

  return groupsFromArray
    .map(group => parseAdditionalAccessRules(group))
    .filter(Boolean);
};

export const isUserAllowedByAdditionalAccess = (user, parsedRules) => {
  if (!parsedRules) return true;

  if (parsedRules.age || parsedRules.age42plus || parsedRules.ageUnknown || parsedRules.ageNo) {
    const birthRaw = String(user?.birth || '').trim();
    const age = utilCalculateAge(birthRaw);
    if (!Number.isFinite(age)) {
      if (!birthRaw && parsedRules.ageNo) {
        // allowed by explicit "no"
      } else if (birthRaw && parsedRules.ageUnknown) {
        // allowed by explicit "?"
      } else {
        return false;
      }
    } else if (!parsedRules.age?.has(age) && !(parsedRules.age42plus && age >= 42)) {
      return false;
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

  if (parsedRules.generic && typeof parsedRules.generic === 'object') {
    const genericKeys = Object.keys(parsedRules.generic);
    for (const key of genericKeys) {
      const allowed = parsedRules.generic[key];
      if (!(allowed instanceof Set) || allowed.size === 0) continue;
      const userBuckets = getUserBucketsByRuleKey(user, key);
      if (!Array.isArray(userBuckets) || userBuckets.length === 0) continue;
      const isMatched = userBuckets.some(bucket => allowed.has(String(bucket || '').trim().toLowerCase()));
      if (!isMatched) {
        return false;
      }
    }
  }

  return true;
};

export const isUserAllowedByAnyAdditionalAccessRule = (user, parsedRuleGroups) => {
  if (!Array.isArray(parsedRuleGroups) || parsedRuleGroups.length === 0) return true;
  return parsedRuleGroups.some(rule => isUserAllowedByAdditionalAccess(user, rule));
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

const resolveBloodBucketsFromGenericRules = parsedRules => {
  const generic = parsedRules?.generic;
  if (!generic || typeof generic !== 'object') return [];

  const rhSet = generic.rh instanceof Set ? generic.rh : new Set();
  const bloodGroupSet = generic.bloodGroup instanceof Set ? generic.bloodGroup : new Set();
  if (rhSet.size === 0 && bloodGroupSet.size === 0) return [];

  const normalizedRh = [...rhSet].map(item => String(item || '').trim().toLowerCase());
  const normalizedGroups = [...bloodGroupSet].map(item => String(item || '').trim().toLowerCase());

  const hasRhPlus = normalizedRh.includes('+');
  const hasRhMinus = normalizedRh.includes('-');
  const hasRhUnknown = normalizedRh.includes('?');
  const hasRhNo = normalizedRh.includes('no');
  const selectedGroups = normalizedGroups.filter(group => /^[1-4]$/.test(group));
  const hasGroupUnknown = normalizedGroups.includes('?');
  const hasGroupNo = normalizedGroups.includes('no');

  const buckets = [];
  const groupsForRh = selectedGroups.length ? selectedGroups : ALL_BLOOD_GROUPS;
  if (hasRhPlus) {
    groupsForRh.forEach(group => buckets.push(`${group}+`));
    if (!selectedGroups.length || hasGroupUnknown) buckets.push('+');
  }
  if (hasRhMinus) {
    groupsForRh.forEach(group => buckets.push(`${group}-`));
    if (!selectedGroups.length || hasGroupUnknown) buckets.push('-');
  }

  if ((hasRhPlus || hasRhMinus) && hasGroupNo) {
    buckets.push('no');
  }

  if (selectedGroups.length) {
    const includeGroupOnly = rhSet.size === 0 || hasRhNo || hasRhUnknown;
    if (includeGroupOnly) buckets.push(...selectedGroups);
  }

  if (hasGroupUnknown) {
    if (hasRhPlus) buckets.push('+');
    if (hasRhMinus) buckets.push('-');
    if (hasRhUnknown || rhSet.size === 0) buckets.push('?');
  }

  if (hasRhUnknown && (selectedGroups.length === 0 || hasGroupUnknown)) {
    buckets.push('?');
  }

  if (hasRhNo && (selectedGroups.length === 0 || hasGroupNo)) {
    buckets.push('no');
  }

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
  const normalizedAges = parsedRules?.age
    ? [...parsedRules.age].filter(age => Number.isFinite(age) && age >= 18)
    : [];

  const exactBirthDateBuckets = normalizedAges.flatMap(age => getBirthDateBucketsForAge(age));

  // Legacy age index compatibility:
  // older datasets can be indexed by raw age tokens ("18", "19", ...)
  // and by grouped buckets ("le21", "22_25", ...), not only by birth-date keys.
  const legacyAgeBuckets = normalizedAges.map(age => String(age));
  normalizedAges.forEach(age => {
    legacyAgeBuckets.push(ageToBucket(age));
  });

  const extraBuckets = [];
  if (parsedRules?.age42plus) {
    extraBuckets.push(
      ...Array.from({ length: 70 }, (_, idx) => idx + 42).flatMap(age => getBirthDateBucketsForAge(age))
    );
  }
  if (parsedRules?.ageUnknown) {
    extraBuckets.push('?');
  }
  if (parsedRules?.ageNo) {
    extraBuckets.push('no');
  }

  return uniq([...exactBirthDateBuckets, ...legacyAgeBuckets, ...extraBuckets]);
};

export const resolveAdditionalAccessSearchKeyBuckets = parsedRules => ({
  blood: uniq([...resolveBloodSearchKeyBuckets(parsedRules), ...resolveBloodBucketsFromGenericRules(parsedRules)]),
  maritalStatus: resolveMaritalStatusSearchKeyBuckets(parsedRules),
  csection: resolveCsectionSearchKeyBuckets(parsedRules),
  age: resolveAgeSearchKeyBuckets(parsedRules),
  ...(parsedRules?.generic || {}),
});

export const createAllFalseFilterGroup = keys =>
  keys.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

export const defaultAdditionalAccessFilterState = {
  age: defaultAllowed(['le21', '22_25', '26_30', '31_35', '36_38', '39_41', '42_plus', 'other', 'empty']),
  bloodGroup: defaultAllowed(['1', '2', '3', '4', 'other', 'empty']),
  rh: defaultAllowed(['+', '-', 'other', 'empty']),
  maritalStatus: defaultAllowed(['married', 'unmarried', 'other', 'empty']),
  csection: defaultAllowed(['cs2plus', 'cs1', 'cs0', 'other', 'no']),
};

export const ageBucketFromAge = ageToBucket;
