import { get, ref, remove, update } from 'firebase/database';
import { database } from 'components/config';
import {
  isUserAllowedByAnyAdditionalAccessRule,
  parseAdditionalAccessRuleGroups,
  resolveAdditionalAccessSearchKeyBuckets,
} from './additionalAccessRules';

export const SEARCH_KEY_SETS_ROOT = 'searchKeySets';

const sanitizeToken = value =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_+\-?]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

const encodeSetKeyPayload = value => encodeURIComponent(String(value || '')).replace(/_/g, '%5F');
const decodeSetKeyPayload = value => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
};

const FILTER_KEY_SHORT_CODES = {
  age: 'a',
  csection: 'c',
  bloodGroup: 'bg',
  rh: 'rh',
  maritalStatus: 'ms',
  imt: 'i',
  role: 'r',
  contact: 'ct',
  userId: 'u',
  reaction: 're',
  height: 'h',
  weight: 'w',
  ageBirthDate: 'bd',
};

const buildGroupToken = parsedRules => {
  const bucketMap = resolveAdditionalAccessSearchKeyBuckets(parsedRules);
  const parts = Object.keys(bucketMap || {})
    .sort()
    .map(filterKey => {
      const values = Array.isArray(bucketMap[filterKey])
        ? bucketMap[filterKey]
        : [...(bucketMap[filterKey] || [])];
      const uniqueValues = [...new Set(values.map(sanitizeToken).filter(Boolean))].sort();
      if (!uniqueValues.length) return '';
      const shortFilterKey = FILTER_KEY_SHORT_CODES[filterKey] || sanitizeToken(filterKey);
      return `${shortFilterKey}_${uniqueValues.join('-')}`;
    })
    .filter(Boolean);

  return parts.join('__');
};

const splitRawRulesToSetTexts = rawRules => {
  if (Array.isArray(rawRules)) {
    return rawRules.map(item => String(item || '').trim()).filter(Boolean);
  }

  return String(rawRules || '')
    .split(/\r?\n\s*\r?\n+/)
    .map(item => item.trim())
    .filter(Boolean);
};

const makeRulesOnlySetKey = rawRules => {
  const rulesText = String(rawRules || '').trim();
  const parsedGroups = parseAdditionalAccessRuleGroups(rulesText);
  if (!parsedGroups.length) return '';

  const groupTokens = parsedGroups
    .map(buildGroupToken)
    .filter(Boolean)
    .sort();

  if (!groupTokens.length) return '';

  const payload = groupTokens.join('__or__');
  return `set_${encodeSetKeyPayload(payload)}`;
};

export const makeAdditionalRulesSetKey = (rawRules, accessUserId = '') => {
  const normalizedOwnerId = String(accessUserId || '').trim();
  if (!normalizedOwnerId) return '';

  const rulesSetKey = makeRulesOnlySetKey(rawRules);
  if (!rulesSetKey) return '';
  return `${encodeSetKeyPayload(normalizedOwnerId)}_${rulesSetKey}`;
};

export const decodeAdditionalRulesSetKey = encodedSetKey => {
  const raw = String(encodedSetKey || '');
  const [ownerToken = '', ...rest] = raw.split('_');
  const rulesSetKey = rest.join('_');
  if (!ownerToken || !rulesSetKey) return '';
  return `${decodeSetKeyPayload(ownerToken)}_${rulesSetKey}`;
};

const mapMatchingIdsByRules = (newUsersData, parsedRuleGroups) => {
  const ids = {};
  Object.entries(newUsersData || {}).forEach(([userId, userData]) => {
    const row = { userId, ...(userData && typeof userData === 'object' ? userData : {}) };
    if (isUserAllowedByAnyAdditionalAccessRule(row, parsedRuleGroups)) {
      ids[userId] = true;
    }
  });
  return ids;
};

export const buildNewUsersFilterSetIndex = async ({ rawRules, newUsersData = null, accessUserId }) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;

  const sourceNewUsers =
    newUsersData && typeof newUsersData === 'object'
      ? newUsersData
      : (await get(ref(database, 'newUsers'))).val() || {};

  const ruleSetTexts = splitRawRulesToSetTexts(rawRules);
  const nextSetPayloads = ruleSetTexts
    .map(setText => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (parsedRuleGroups.length === 0) return null;
      const rulesOnlySetKey = makeRulesOnlySetKey(setText);
      if (!rulesOnlySetKey) return null;
      return {
        setKey: rulesOnlySetKey,
        userIds: mapMatchingIdsByRules(sourceNewUsers, parsedRuleGroups),
      };
    })
    .filter(Boolean);

  const rootSnap = await get(ref(database, SEARCH_KEY_SETS_ROOT));
  const rootMap = rootSnap.exists() ? rootSnap.val() || {} : {};
  const ownerPrefix = `${encodeSetKeyPayload(normalizedAccessUserId)}_`;
  const existingSetKeys = Object.keys(rootMap).filter(setKey => setKey.startsWith(ownerPrefix));
  const nextSetKeys = new Set(
    nextSetPayloads.map(item => `${ownerPrefix}${item.setKey}`)
  );

  // Ключ набору має формат: $ownerUserId_$setKey
  // searchKeySets/$ownerUserId_$setKey/$newUserId = true
  const writes = {};

  existingSetKeys.forEach(setKey => {
    if (!nextSetKeys.has(setKey)) {
      writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}`] = null;
    }
  });

  nextSetPayloads.forEach(({ setKey: rulesSetKey, userIds }) => {
    const setKey = `${ownerPrefix}${rulesSetKey}`;
    writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}`] = null;
    Object.keys(userIds).forEach(userId => {
      writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}/${userId}`] = true;
    });
  });

  if (Object.keys(writes).length > 0) {
    await update(ref(database), writes);
  }

  const aggregatedUserIds = [...new Set(nextSetPayloads.flatMap(item => Object.keys(item.userIds)))];
  return {
    setKeys: [...nextSetKeys],
    userIds: aggregatedUserIds,
    ownerId: normalizedAccessUserId,
  };
};

export const getIndexedNewUsersIdsByRules = async ({ rawRules, accessUserId }) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;

  const ruleSetTexts = splitRawRulesToSetTexts(rawRules);
  const ownerPrefix = `${encodeSetKeyPayload(normalizedAccessUserId)}_`;
  const setKeys = ruleSetTexts
    .map(makeRulesOnlySetKey)
    .filter(Boolean)
    .map(setKey => `${ownerPrefix}${setKey}`);
  if (!setKeys.length) return null;

  const snapshots = await Promise.all(
    setKeys.map(setKey => get(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setKey}`)))
  );

  if (snapshots.some(snapshot => !snapshot.exists())) {
    return null;
  }

  const userIds = new Set();
  snapshots.forEach(snapshot => {
    Object.keys(snapshot.val() || {}).forEach(userId => {
      if (userId) userIds.add(userId);
    });
  });

  return { setKeys, userIds: [...userIds], ownerId: normalizedAccessUserId };
};

export const rebuildAllNewUsersFilterSetIndexes = async () => {
  const [usersSnap, newUsersSnap, searchKeySetSnap] = await Promise.all([
    get(ref(database, 'users')),
    get(ref(database, 'newUsers')),
    get(ref(database, SEARCH_KEY_SETS_ROOT)),
  ]);

  const usersMap = usersSnap.exists() ? usersSnap.val() || {} : {};
  const newUsersMap = newUsersSnap.exists() ? newUsersSnap.val() || {} : {};
  const searchKeySetMap = searchKeySetSnap.exists() ? searchKeySetSnap.val() || {} : {};
  await Promise.all(Object.keys(searchKeySetMap).map(key => remove(ref(database, `${SEARCH_KEY_SETS_ROOT}/${key}`))));

  let totalRuleSets = 0;
  let indexedSets = 0;

  for (const [userId, user] of Object.entries(usersMap)) {
    const rawRules = user?.additionalAccessRules;
    const setTexts = splitRawRulesToSetTexts(rawRules);
    if (!setTexts.length) {
      continue;
    }

    totalRuleSets += setTexts.length;
    const indexed = await buildNewUsersFilterSetIndex({
      rawRules,
      newUsersData: newUsersMap,
      accessUserId: userId,
    });
    if (indexed?.setKeys?.length) indexedSets += indexed.setKeys.length;
  }

  return {
    totalRuleSets,
    indexedRuleSets: indexedSets,
  };
};
