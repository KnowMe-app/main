import { get, ref, remove, set } from 'firebase/database';
import { database } from 'components/config';
import {
  isUserAllowedByAnyAdditionalAccessRule,
  parseAdditionalAccessRuleGroups,
  resolveAdditionalAccessSearchKeyBuckets,
} from './additionalAccessRules';

const SEARCH_KEY_ROOT = 'searchKey';
const SET_KEY_MAX_LENGTH = 512;

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

const hashRulesText = value => {
  const input = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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

  const baseKey = `set_${groupTokens.join('__or__')}`;
  if (baseKey.length <= SET_KEY_MAX_LENGTH) {
    return baseKey;
  }

  return `set_h_${hashRulesText(rulesText)}`;
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

  await set(ref(database, `${SEARCH_KEY_ROOT}/${setKey}`), {
    setKey,
    rulesText,
    updatedAt: new Date().toISOString(),
    userIds,
  });

  return { setKey, userIds: Object.keys(userIds) };
};

export const getIndexedNewUsersIdsByRules = async ({ rawRules }) => {
  const setKey = makeAdditionalRulesSetKey(rawRules);
  if (!setKey) return null;

  const setSnap = await get(ref(database, `${SEARCH_KEY_ROOT}/${setKey}`));
  if (!setSnap.exists()) return null;

  const payload = setSnap.val() || {};
  const userIds = Object.keys(payload.userIds || {});
  return { setKey, userIds };
};

export const rebuildAllNewUsersFilterSetIndexes = async () => {
  const [usersSnap, newUsersSnap, searchKeySnap] = await Promise.all([
    get(ref(database, 'users')),
    get(ref(database, 'newUsers')),
    get(ref(database, SEARCH_KEY_ROOT)),
  ]);

  const usersMap = usersSnap.exists() ? usersSnap.val() || {} : {};
  const newUsersMap = newUsersSnap.exists() ? newUsersSnap.val() || {} : {};
  const searchKeyMap = searchKeySnap.exists() ? searchKeySnap.val() || {} : {};

  const oldSetKeys = Object.keys(searchKeyMap).filter(key => String(key).startsWith('set_'));
  await Promise.all(oldSetKeys.map(key => remove(ref(database, `${SEARCH_KEY_ROOT}/${key}`))));

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
