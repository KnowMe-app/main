import { get, ref, remove, update } from 'firebase/database';
import { database } from 'components/config';
import {
  isUserAllowedByAnyAdditionalAccessRule,
  parseAdditionalAccessRuleGroups,
  resolveAdditionalAccessSearchKeyBuckets,
} from './additionalAccessRules';

const SEARCH_KEY_SETS_ROOT = 'searchKeySets';

const toStableRulesText = raw =>
  Array.isArray(raw)
    ? raw.map(item => String(item || '').trim()).filter(Boolean).join('\n\n')
    : String(raw || '').trim();

const sanitizeToken = value =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_+\-?]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

const encodeSetKeyPayload = value => encodeURIComponent(String(value || ''));
const decodeSetKeyPayload = value => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
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
      return `${sanitizeToken(filterKey)}_${uniqueValues.join('-')}`;
    })
    .filter(Boolean);

  return parts.join('__');
};

export const makeAdditionalRulesSetKey = rawRules => {
  const rulesText = toStableRulesText(rawRules);
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

export const decodeAdditionalRulesSetKey = setKey => {
  const raw = String(setKey || '');
  if (raw.startsWith('set_')) {
    return decodeSetKeyPayload(raw.slice('set_'.length));
  }
  return raw;
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

export const buildNewUsersFilterSetIndex = async ({ rawRules, newUsersData = null }) => {
  const rulesText = toStableRulesText(rawRules);
  const parsedRuleGroups = parseAdditionalAccessRuleGroups(rulesText);
  if (parsedRuleGroups.length === 0) return null;

  const setKey = makeAdditionalRulesSetKey(rulesText);
  if (!setKey) return null;

  const sourceNewUsers =
    newUsersData && typeof newUsersData === 'object'
      ? newUsersData
      : (await get(ref(database, 'newUsers'))).val() || {};

  const userIds = mapMatchingIdsByRules(sourceNewUsers, parsedRuleGroups);

  // Під RTDB rules виду:
  // searchKeySets/$setKey/$userId { ".write": ..., ".validate": "newData.val() === true || newData.val() === null" }
  // не можна надійно робити set() на рівень /$setKey з об'єктом.
  // Тому пишемо кожен userId окремим child-update.
  const writes = Object.keys(userIds).reduce((acc, userId) => {
    acc[`${SEARCH_KEY_SETS_ROOT}/${setKey}/${userId}`] = true;
    return acc;
  }, {});

  if (Object.keys(writes).length > 0) {
    await update(ref(database), writes);
  }

  return { setKey, userIds: Object.keys(userIds) };
};

export const getIndexedNewUsersIdsByRules = async ({ rawRules }) => {
  const setKey = makeAdditionalRulesSetKey(rawRules);
  if (!setKey) return null;

  const newSetSnap = await get(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setKey}`));

  if (newSetSnap.exists()) {
    const payload = newSetSnap.val() || {};
    return { setKey, userIds: Object.keys(payload || {}) };
  }
  return null;
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

  const oldSetKeysInDedicatedRoot = Object.keys(searchKeySetMap).filter(key => String(key).startsWith('set_'));
  await Promise.all(oldSetKeysInDedicatedRoot.map(key => remove(ref(database, `${SEARCH_KEY_SETS_ROOT}/${key}`))));

  const allRules = Object.values(usersMap)
    .map(user => user?.additionalAccessRules)
    .filter(rawRules =>
      Array.isArray(rawRules)
        ? rawRules.some(item => String(item || '').trim())
        : String(rawRules || '').trim() !== ''
    );

  const uniqueRulesMap = new Map();
  allRules.forEach(rawRules => {
    const setKey = makeAdditionalRulesSetKey(rawRules);
    if (setKey) uniqueRulesMap.set(setKey, rawRules);
  });

  let indexedSets = 0;
  for (const rawRules of uniqueRulesMap.values()) {
    const indexed = await buildNewUsersFilterSetIndex({
      rawRules,
      newUsersData: newUsersMap,
    });
    if (indexed?.setKey) indexedSets += 1;
  }

  return {
    totalRuleSets: uniqueRulesMap.size,
    indexedRuleSets: indexedSets,
  };
};
