import { get, ref, remove, update } from 'firebase/database';
import {
  createAgeSearchKeyIndexInCollection,
  createContactSearchKeyIndexInCollection,
  createCsectionSearchKeyIndexInCollection,
  createFieldCountSearchKeyIndexInCollection,
  createImtHeightWeightSearchKeyIndexInCollection,
  createMaritalStatusSearchKeyIndexInCollection,
  createReactionSearchKeyIndexInCollection,
  createRoleSearchKeyIndexInCollection,
  createSearchKeyIndexInCollection,
  createUserIdSearchKeyIndexInCollection,
  database,
} from 'components/config';
import { encodeKey } from './searchIndexCandidates';
import {
  isUserAllowedByAnyAdditionalAccessRule,
  parseAdditionalAccessRuleGroups,
  resolveAdditionalAccessSearchKeyBuckets,
} from './additionalAccessRules';

export const SEARCH_KEY_SETS_ROOT = 'searchKeySets';
const SET_KEY_INDEX_SEPARATOR = '_';
const FORBIDDEN_RTDB_SEGMENT_CHARS = ['.', '#', '$', '/', '[', ']'];

const normalizePathSegment = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const hasForbiddenChars = FORBIDDEN_RTDB_SEGMENT_CHARS.some(char => raw.includes(char));
  return hasForbiddenChars ? encodeKey(raw) : raw;
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

const parseRawRulesToSetEntries = rawRules => {
  if (Array.isArray(rawRules)) {
    return rawRules
      .map((item, index) => ({
        text: String(item || '').trim(),
        inputIndex: index + 1,
      }))
      .filter(entry => Boolean(entry.text));
  }

  return String(rawRules || '')
    .split(/\r?\n\s*\r?\n+/)
    .map((item, index) => ({
      text: item.trim(),
      inputIndex: index + 1,
    }))
    .filter(entry => Boolean(entry.text));
};

const hashRuleText = rulesText => {
  const source = String(rulesText || '').trim();
  if (!source) return '';

  let hash = 5381;
  for (let idx = 0; idx < source.length; idx += 1) {
    hash = (hash * 33) ^ source.charCodeAt(idx);
  }

  return Math.abs(hash >>> 0).toString(36);
};

export const makeAdditionalRulesSetKey = (rawRules, accessUserId = '') => {
  const normalizedOwnerId = String(accessUserId || '').trim();
  if (!normalizedOwnerId) return '';

  const rulesText = String(rawRules || '').trim();
  if (!rulesText) return '';
  const rulesHash = hashRuleText(rulesText);
  if (!rulesHash) return '';

  return `${normalizedOwnerId}${SET_KEY_INDEX_SEPARATOR}${rulesHash}`;
};

export const decodeAdditionalRulesSetKey = encodedSetKey => {
  const raw = String(encodedSetKey || '').trim();
  if (!raw) return '';

  const separatorIndex = raw.lastIndexOf(SET_KEY_INDEX_SEPARATOR);
  if (separatorIndex <= 0) return '';

  const ownerId = raw.slice(0, separatorIndex);
  if (!ownerId) return '';
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

const buildUserIdsMapFromList = userIds =>
  (Array.isArray(userIds) ? userIds : [])
    .filter(Boolean)
    .reduce((acc, userId) => {
      acc[userId] = true;
      return acc;
    }, {});

const SEARCH_KEY_SET_BUILDERS = [
  createSearchKeyIndexInCollection,
  createMaritalStatusSearchKeyIndexInCollection,
  createCsectionSearchKeyIndexInCollection,
  createContactSearchKeyIndexInCollection,
  createRoleSearchKeyIndexInCollection,
  createUserIdSearchKeyIndexInCollection,
  createAgeSearchKeyIndexInCollection,
  createImtHeightWeightSearchKeyIndexInCollection,
  createReactionSearchKeyIndexInCollection,
  createFieldCountSearchKeyIndexInCollection,
];

const pickUsersByIds = (usersMap, ids = []) =>
  ids.reduce((acc, userId) => {
    if (!userId) return acc;
    acc[userId] = usersMap?.[userId] && typeof usersMap[userId] === 'object' ? usersMap[userId] : {};
    return acc;
  }, {});

const buildRuleBucketWrites = ({ rootPath, parsedRuleGroups, userIds }) => {
  const normalizedRootPath = String(rootPath || '').trim();
  if (!normalizedRootPath) return {};

  const normalizedUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  const bucketMap = resolveAdditionalAccessSearchKeyBuckets(parsedRuleGroups);

  return Object.entries(bucketMap || {}).reduce((writes, [indexName, rawValues]) => {
    const normalizedIndexName = normalizePathSegment(indexName);
    if (!normalizedIndexName) return writes;

    const values = [
      ...new Set(
        (Array.isArray(rawValues) ? rawValues : [...(rawValues || [])])
          .map(normalizePathSegment)
          .filter(Boolean)
      ),
    ];
    if (!values.length) return writes;

    values.forEach(value => {
      const path = `${normalizedRootPath}/${normalizedIndexName}/${value}`;
      writes[path] = normalizedUserIds.reduce((acc, userId) => {
        acc[userId] = true;
        return acc;
      }, {});
    });

    return writes;
  }, {});
};

export const buildSearchKeySetIndexFromMatchedUsers = async ({
  rawRules,
  accessUserId,
  newUsersData = null,
  matchedUserIdsBySetKey = null,
}) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;

  const sourceNewUsers =
    newUsersData && typeof newUsersData === 'object'
      ? newUsersData
      : (await get(ref(database, 'newUsers'))).val() || {};

  const ruleSetEntries = parseRawRulesToSetEntries(rawRules);
  const setPayloads = ruleSetEntries
    .map(({ text: setText, inputIndex }) => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (parsedRuleGroups.length === 0) return null;

      const setKey = makeAdditionalRulesSetKey(setText, normalizedAccessUserId, inputIndex);
      if (!setKey) return null;

      const userIds = Array.isArray(matchedUserIdsBySetKey?.[setKey])
        ? [...new Set(matchedUserIdsBySetKey[setKey].filter(Boolean))]
        : Object.keys(mapMatchingIdsByRules(sourceNewUsers, parsedRuleGroups));

      return { setKey, userIds, parsedRuleGroups };
    })
    .filter(Boolean);

  for (const setPayload of setPayloads) {
    // eslint-disable-next-line no-await-in-loop
    await remove(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setPayload.setKey}`));

    if (setPayload.userIds.length === 0) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const usersData = pickUsersByIds(sourceNewUsers, setPayload.userIds);
    const options = {
      usersData,
      rootPath: `${SEARCH_KEY_SETS_ROOT}/${setPayload.setKey}`,
    };
    const ruleBucketWrites = buildRuleBucketWrites({
      rootPath: options.rootPath,
      parsedRuleGroups: setPayload.parsedRuleGroups,
      userIds: setPayload.userIds,
    });

    // eslint-disable-next-line no-await-in-loop
    for (const builder of SEARCH_KEY_SET_BUILDERS) {
      // eslint-disable-next-line no-await-in-loop
      await builder('newUsers', undefined, options);
    }

    if (Object.keys(ruleBucketWrites).length) {
      // eslint-disable-next-line no-await-in-loop
      await update(ref(database), ruleBucketWrites);
    }
  }

  return {
    setKeys: setPayloads.map(item => item.setKey),
    userIds: [...new Set(setPayloads.flatMap(item => item.userIds))],
    ownerId: normalizedAccessUserId,
  };
};

export const buildNewUsersFilterSetIndex = async ({
  rawRules,
  newUsersData = null,
  accessUserId,
  matchedUserIdsBySetKey = null,
}) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;

  const sourceNewUsers =
    newUsersData && typeof newUsersData === 'object'
      ? newUsersData
      : (await get(ref(database, 'newUsers'))).val() || {};

  const ruleSetEntries = parseRawRulesToSetEntries(rawRules);
  const nextSetPayloads = ruleSetEntries
    .map(({ text: setText, inputIndex }) => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (parsedRuleGroups.length === 0) return null;

      const ownerSetKey = makeAdditionalRulesSetKey(setText, normalizedAccessUserId, inputIndex);
      if (!ownerSetKey) return null;
      const prefilteredIds = matchedUserIdsBySetKey?.[ownerSetKey];
      const userIds =
        Array.isArray(prefilteredIds)
          ? buildUserIdsMapFromList(prefilteredIds)
          : mapMatchingIdsByRules(sourceNewUsers, parsedRuleGroups);

      return {
        setKey: ownerSetKey,
        userIds,
        parsedRuleGroups,
      };
    })
    .filter(Boolean);

  const rootSnap = await get(ref(database, SEARCH_KEY_SETS_ROOT));
  const rootMap = rootSnap.exists() ? rootSnap.val() || {} : {};
  const ownerPrefix = `${normalizedAccessUserId}${SET_KEY_INDEX_SEPARATOR}`;
  const existingSetKeys = Object.keys(rootMap).filter(setKey => setKey.startsWith(ownerPrefix));
  const nextSetKeys = new Set(nextSetPayloads.map(item => item.setKey));

  const writes = {};
  existingSetKeys.forEach(setKey => {
    if (!nextSetKeys.has(setKey)) {
      writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}`] = null;
    }
  });
  if (Object.keys(writes).length > 0) {
    await update(ref(database), writes);
  }

  for (const { setKey, userIds, parsedRuleGroups } of nextSetPayloads) {
    // eslint-disable-next-line no-await-in-loop
    await remove(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setKey}`));

    const pickedUsers = pickUsersByIds(sourceNewUsers, Object.keys(userIds || {}));
    const options = {
      usersData: pickedUsers,
      rootPath: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
    };
    const ruleBucketWrites = buildRuleBucketWrites({
      rootPath: options.rootPath,
      parsedRuleGroups,
      userIds: Object.keys(userIds || {}),
    });

    // eslint-disable-next-line no-await-in-loop
    for (const builder of SEARCH_KEY_SET_BUILDERS) {
      // eslint-disable-next-line no-await-in-loop
      await builder('newUsers', undefined, options);
    }

    if (Object.keys(ruleBucketWrites).length) {
      // eslint-disable-next-line no-await-in-loop
      await update(ref(database), ruleBucketWrites);
    }
  }

  const aggregatedUserIds = [...new Set(nextSetPayloads.flatMap(item => Object.keys(item.userIds)))];
  return {
    setKeys: [...nextSetKeys],
    userIds: aggregatedUserIds,
    ownerId: normalizedAccessUserId,
    writesCount: Object.keys(writes).length + nextSetPayloads.length,
  };
};

export const getIndexedNewUsersIdsByRules = async ({ rawRules, accessUserId }) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;

  const ruleSetEntries = parseRawRulesToSetEntries(rawRules);
  const setEntries = ruleSetEntries
    .map(({ text: setText, inputIndex }) => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (!parsedRuleGroups.length) return null;
      const bucketMap = resolveAdditionalAccessSearchKeyBuckets(parsedRuleGroups);
      const indexBuckets = Object.entries(bucketMap || {}).reduce((acc, [indexName, rawValues]) => {
        const normalizedIndexName = normalizePathSegment(indexName);
        if (!normalizedIndexName) return acc;
        const values = [
          ...new Set(
            (Array.isArray(rawValues) ? rawValues : [...(rawValues || [])])
              .map(normalizePathSegment)
              .filter(Boolean)
          ),
        ];
        if (values.length) acc[normalizedIndexName] = values;
        return acc;
      }, {});
      if (!Object.keys(indexBuckets).length) return null;

      const setKey = makeAdditionalRulesSetKey(setText, normalizedAccessUserId, inputIndex);
      if (!setKey) return null;
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

    // Подвійна послідовна індексація:
    // 1) формуємо попередньо відфільтрований набір newUsers для кожного setKey (як у модалці "Додаткові правила доступу")
    // 2) записуємо searchKeySets з урахуванням цих наборів
    const matchedUserIdsBySetKey = {};
    const ruleEntries = parseRawRulesToSetEntries(rawRules);
    ruleEntries.forEach(({ text: setText, inputIndex }) => {
      const setKey = makeAdditionalRulesSetKey(setText, userId, inputIndex);
      if (!setKey) return;
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (!parsedRuleGroups.length) return;

      const matchedUserIds = Object.entries(newUsersMap)
        .filter(([newUserId, newUserData]) =>
          isUserAllowedByAnyAdditionalAccessRule(
            { userId: newUserId, ...(newUserData && typeof newUserData === 'object' ? newUserData : {}) },
            parsedRuleGroups
          )
        )
        .map(([newUserId]) => newUserId);
      matchedUserIdsBySetKey[setKey] = matchedUserIds;
    });

    const indexed = await buildNewUsersFilterSetIndex({
      rawRules,
      newUsersData: newUsersMap,
      accessUserId: userId,
      matchedUserIdsBySetKey,
    });
    if (indexed?.setKeys?.length) indexedSets += indexed.setKeys.length;
  }

  return {
    totalRuleSets,
    indexedRuleSets: indexedSets,
  };
};
