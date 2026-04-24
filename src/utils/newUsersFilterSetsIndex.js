import { get, ref, remove, update } from 'firebase/database';
import { database } from 'components/config';
import {
  isUserAllowedByAnyAdditionalAccessRule,
  parseAdditionalAccessRuleGroups,
  resolveAdditionalAccessSearchKeyBuckets,
} from './additionalAccessRules';

export const SEARCH_KEY_SETS_ROOT = 'searchKeySets';
const SET_KEY_INDEX_SEPARATOR = '_';

const encodeSetKeyPayload = value => encodeURIComponent(String(value || '')).replace(/_/g, '%5F');
const decodeSetKeyPayload = value => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
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

export const makeAdditionalRulesSetKey = (rawRules, accessUserId = '', setIndex = 1) => {
  const normalizedOwnerId = String(accessUserId || '').trim();
  if (!normalizedOwnerId) return '';

  const normalizedSetIndex = Number.isFinite(Number(setIndex)) ? Math.max(1, Number(setIndex)) : 1;
  const rulesText = String(rawRules || '').trim();
  if (!rulesText) return '';
  return `${encodeSetKeyPayload(normalizedOwnerId)}${SET_KEY_INDEX_SEPARATOR}${normalizedSetIndex}`;
};

export const decodeAdditionalRulesSetKey = encodedSetKey => {
  const raw = String(encodedSetKey || '');
  const [ownerToken = '', setIndexToken = ''] = raw.split(SET_KEY_INDEX_SEPARATOR);
  if (!ownerToken) return '';
  const decodedOwner = decodeSetKeyPayload(ownerToken);
  const numericIndex = Number.parseInt(setIndexToken, 10);
  const normalizedSetIndex = Number.isFinite(numericIndex) && numericIndex > 0 ? numericIndex : 1;
  return `${decodedOwner}${SET_KEY_INDEX_SEPARATOR}${normalizedSetIndex}`;
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

      const bucketMap = resolveAdditionalAccessSearchKeyBuckets(parsedRuleGroups);
      const indexBuckets = Object.entries(bucketMap || {}).reduce((acc, [indexName, rawValues]) => {
        const values = [...new Set((Array.isArray(rawValues) ? rawValues : [...(rawValues || [])]).filter(Boolean))];
        if (values.length) acc[indexName] = values;
        return acc;
      }, {});

      if (Object.keys(indexBuckets).length === 0) return null;

      const ownerSetKey = `${encodeSetKeyPayload(normalizedAccessUserId)}${SET_KEY_INDEX_SEPARATOR}${index + 1}`;
      return {
        setKey: ownerSetKey,
        indexBuckets,
        userIds: mapMatchingIdsByRules(sourceNewUsers, parsedRuleGroups),
      };
    })
    .filter(Boolean);

  const rootSnap = await get(ref(database, SEARCH_KEY_SETS_ROOT));
  const rootMap = rootSnap.exists() ? rootSnap.val() || {} : {};
  const ownerPrefix = `${encodeSetKeyPayload(normalizedAccessUserId)}${SET_KEY_INDEX_SEPARATOR}`;
  const existingSetKeys = Object.keys(rootMap).filter(setKey => setKey.startsWith(ownerPrefix));
  const nextSetKeys = new Set(nextSetPayloads.map(item => item.setKey));

  // Ключ набору має формат: $ownerUserId_$inputIndex
  // searchKeySets/$ownerUserId_$inputIndex/$indexName/$value/$newUserId = true
  const writes = {};

  existingSetKeys.forEach(setKey => {
    if (!nextSetKeys.has(setKey)) {
      writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}`] = null;
      return;
    }

    const setPayload = rootMap?.[setKey];
    if (!setPayload || typeof setPayload !== 'object') return;

    const expectedIndexes = nextSetPayloads.find(item => item.setKey === setKey)?.indexBuckets || {};
    Object.keys(setPayload).forEach(indexName => {
      const expectedValues = new Set(expectedIndexes[indexName] || []);
      if (!expectedValues.size) {
        writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}/${indexName}`] = null;
        return;
      }

      const indexPayload = setPayload[indexName];
      if (!indexPayload || typeof indexPayload !== 'object') return;
      Object.keys(indexPayload).forEach(valueKey => {
        if (!expectedValues.has(valueKey)) {
          writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}/${indexName}/${valueKey}`] = null;
        }
      });
    });
  });

  nextSetPayloads.forEach(({ setKey, indexBuckets, userIds }) => {
    Object.entries(indexBuckets).forEach(([indexName, values]) => {
      values.forEach(value => {
        writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}/${indexName}/${value}`] = userIds;
      });
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
  const ownerPrefix = `${encodeSetKeyPayload(normalizedAccessUserId)}${SET_KEY_INDEX_SEPARATOR}`;
  const setEntries = ruleSetTexts
    .map((setText, index) => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (!parsedRuleGroups.length) return null;
      const bucketMap = resolveAdditionalAccessSearchKeyBuckets(parsedRuleGroups);
      const indexBuckets = Object.entries(bucketMap || {}).reduce((acc, [indexName, rawValues]) => {
        const values = [...new Set((Array.isArray(rawValues) ? rawValues : [...(rawValues || [])]).filter(Boolean))];
        if (values.length) acc[indexName] = values;
        return acc;
      }, {});
      if (!Object.keys(indexBuckets).length) return null;

      const setKey = `${ownerPrefix}${index + 1}`;
      const paths = Object.entries(indexBuckets).flatMap(([indexName, values]) =>
        values.map(value => `${SEARCH_KEY_SETS_ROOT}/${setKey}/${indexName}/${value}`)
      );
      return { setKey, paths };
    })
    .filter(Boolean);
  if (!setEntries.length) return null;

  const snapshotsBySet = await Promise.all(
    setEntries.map(async entry => {
      const snapshots = await Promise.all(entry.paths.map(path => get(ref(database, path))));
      return { setKey: entry.setKey, paths: entry.paths, snapshots };
    })
  );

  if (snapshotsBySet.some(item => item.snapshots.some(snapshot => !snapshot.exists()))) {
    return null;
  }

  const userIds = new Set();
  snapshotsBySet.forEach(item => {
    item.snapshots.forEach(snapshot => {
      Object.keys(snapshot.val() || {}).forEach(userId => {
        if (userId) userIds.add(userId);
      });
    });
  });

  return {
    setKeys: snapshotsBySet.flatMap(item => item.paths),
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
