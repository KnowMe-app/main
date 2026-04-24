import { get, ref, remove, update } from 'firebase/database';
import { database } from 'components/config';
import {
  isUserAllowedByAnyAdditionalAccessRule,
  parseAdditionalAccessRuleGroups,
  resolveAdditionalAccessSearchKeyBuckets,
} from './additionalAccessRules';

export const SEARCH_KEY_SETS_ROOT = 'searchKeySets';
const SET_KEY_INDEX_SEPARATOR = '_';

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

export const makeAdditionalRulesSetKey = (rawRules, accessUserId = '', setIndex = 1) => {
  const normalizedOwnerId = String(accessUserId || '').trim();
  if (!normalizedOwnerId) return '';

  const normalizedSetIndex = Number.isFinite(Number(setIndex)) ? Math.max(1, Number(setIndex)) : 1;
  const rulesSetKey = makeRulesOnlySetKey(rawRules);
  if (!rulesSetKey) return '';
  return `${encodeSetKeyPayload(normalizedOwnerId)}${SET_KEY_INDEX_SEPARATOR}${normalizedSetIndex}${SET_KEY_INDEX_SEPARATOR}${rulesSetKey}`;
};

export const decodeAdditionalRulesSetKey = encodedSetKey => {
  const raw = String(encodedSetKey || '');
  const [ownerToken = '', setIndexToken = '', ...rest] = raw.split(SET_KEY_INDEX_SEPARATOR);
  const rulesSetKey = rest.join(SET_KEY_INDEX_SEPARATOR);
  if (!ownerToken || !rulesSetKey) return '';
  const decodedOwner = decodeSetKeyPayload(ownerToken);
  const numericIndex = Number.parseInt(setIndexToken, 10);
  const normalizedSetIndex = Number.isFinite(numericIndex) && numericIndex > 0 ? numericIndex : 1;
  return `${decodedOwner}${SET_KEY_INDEX_SEPARATOR}${normalizedSetIndex}${SET_KEY_INDEX_SEPARATOR}${rulesSetKey}`;
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
    .map((setText, index) => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (parsedRuleGroups.length === 0) return null;
      const rulesOnlySetKey = makeRulesOnlySetKey(setText);
      if (!rulesOnlySetKey) return null;
      const ownerSetKey = `${encodeSetKeyPayload(normalizedAccessUserId)}${SET_KEY_INDEX_SEPARATOR}${index + 1}`;
      return {
        setKey: ownerSetKey,
        valueKey: rulesOnlySetKey,
        userIds: mapMatchingIdsByRules(sourceNewUsers, parsedRuleGroups),
      };
    })
    .filter(Boolean);

  const rootSnap = await get(ref(database, SEARCH_KEY_SETS_ROOT));
  const rootMap = rootSnap.exists() ? rootSnap.val() || {} : {};
  const ownerPrefix = `${encodeSetKeyPayload(normalizedAccessUserId)}${SET_KEY_INDEX_SEPARATOR}`;
  const existingSetKeys = Object.keys(rootMap).filter(setKey => setKey.startsWith(ownerPrefix));
  const nextSetKeys = new Set(nextSetPayloads.map(item => item.setKey));
  const nextValueKeysBySetKey = new Map(nextSetPayloads.map(item => [item.setKey, item.valueKey]));

  // Ключ набору має формат: $ownerUserId_$inputIndex
  // searchKeySets/$ownerUserId_$inputIndex/$valueKey/$newUserId = true
  const writes = {};

  existingSetKeys.forEach(setKey => {
    if (!nextSetKeys.has(setKey)) {
      writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}`] = null;
      return;
    }

    const setPayload = rootMap?.[setKey];
    if (!setPayload || typeof setPayload !== 'object') return;

    const expectedValueKey = nextValueKeysBySetKey.get(setKey);
    Object.keys(setPayload).forEach(valueKey => {
      if (valueKey !== expectedValueKey) {
        writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}/${valueKey}`] = null;
      }
    });
  });

  nextSetPayloads.forEach(({ setKey, valueKey, userIds }) => {
    writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}/${valueKey}`] = userIds;
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
  const ownerPrefix = `${encodeSetKeyPayload(normalizedAccessUserId)}${SET_KEY_INDEX_SEPARATOR}`;
  const setEntries = ruleSetTexts
    .map((setText, index) => {
      const valueKey = makeRulesOnlySetKey(setText);
      if (!valueKey) return null;
      const setKey = `${ownerPrefix}${index + 1}`;
      return { setKey, valueKey, path: `${SEARCH_KEY_SETS_ROOT}/${setKey}/${valueKey}` };
    })
    .filter(Boolean);
  if (!setEntries.length) return null;

  const snapshots = await Promise.all(
    setEntries.map(entry => get(ref(database, entry.path)))
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

  return {
    setKeys: setEntries.map(entry => `${entry.setKey}/${entry.valueKey}`),
    userIds: [...userIds],
    ownerId: normalizedAccessUserId,
  };
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
