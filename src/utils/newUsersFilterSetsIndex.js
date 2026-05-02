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
  parseAdditionalAccessRuleGroups,
  resolveAdditionalAccessSearchKeyBuckets,
} from './additionalAccessRules';
import {
  getCachedAdditionalRulesSetIndex,
  peekCachedSearchKeyPayload,
  saveCachedAdditionalRulesSetIndex,
} from './searchKeyCache';

export const SEARCH_KEY_SETS_ROOT = 'searchKeySets';
const SET_KEY_INDEX_SEPARATOR = '_';
const FORBIDDEN_RTDB_SEGMENT_CHARS = ['.', '#', '$', '/', '[', ']'];


const AGE_SEARCH_KEY_VALUE_PATTERN = /^d_\d{4}-\d{2}-\d{2}$/;

const normalizeAgeSearchKeyValue = value => {
  const normalized = normalizePathSegment(value);
  if (!normalized) return '';
  if (normalized === '?' || normalized === 'no') return normalized;
  return AGE_SEARCH_KEY_VALUE_PATTERN.test(normalized) ? normalized : '';
};

const normalizePathSegment = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const hasForbiddenChars = FORBIDDEN_RTDB_SEGMENT_CHARS.some(char => raw.includes(char));
  return hasForbiddenChars ? encodeKey(raw) : raw;
};

const mergeSearchKeyBuckets = parsedRuleGroups => {
  const groups = Array.isArray(parsedRuleGroups) ? parsedRuleGroups : [parsedRuleGroups];
  return groups.reduce((acc, rules) => {
    const bucketMap = resolveAdditionalAccessSearchKeyBuckets(rules);
    Object.entries(bucketMap || {}).forEach(([indexName, rawValues]) => {
      const nextValues = Array.isArray(rawValues) ? rawValues : [...(rawValues || [])];
      if (!nextValues.length) return;
      if (!acc[indexName]) {
        acc[indexName] = new Set();
      }
      nextValues.forEach(value => {
        if (value !== undefined && value !== null && String(value).trim()) {
          acc[indexName].add(value);
        }
      });
    });
    return acc;
  }, {});
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

export const makeAdditionalRulesSetKey = (rawRules, accessUserId = '', setIndex = 1) => {
  const normalizedOwnerId = String(accessUserId || '').trim();
  if (!normalizedOwnerId) return '';

  const normalizedSetIndex = Number.isFinite(Number(setIndex)) ? Math.max(1, Number(setIndex)) : 1;
  const rulesText = String(rawRules || '').trim();
  if (!rulesText) return '';
  return `${normalizedOwnerId}${SET_KEY_INDEX_SEPARATOR}${normalizedSetIndex}`;
};

export const decodeAdditionalRulesSetKey = encodedSetKey => {
  const raw = String(encodedSetKey || '').trim();
  if (!raw) return '';

  const separatorIndex = raw.lastIndexOf(SET_KEY_INDEX_SEPARATOR);
  if (separatorIndex <= 0) return '';

  const ownerId = raw.slice(0, separatorIndex);
  const setIndexToken = raw.slice(separatorIndex + 1);
  const numericIndex = Number.parseInt(setIndexToken, 10);
  const normalizedSetIndex = Number.isFinite(numericIndex) && numericIndex > 0 ? numericIndex : 1;

  if (!ownerId) return '';
  return `${ownerId}${SET_KEY_INDEX_SEPARATOR}${normalizedSetIndex}`;
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


const buildAgeKeysByUserIdFromSearchKey = async (userIds, searchKeyFile = null) => {
  const normalizedIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  if (normalizedIds.length === 0) return {};

  const normalizedSearchKeyFile =
    searchKeyFile && typeof searchKeyFile === 'object' && !Array.isArray(searchKeyFile)
      ? searchKeyFile
      : null;
  const ageIndex =
    normalizedSearchKeyFile && typeof normalizedSearchKeyFile?.age === 'object'
      ? normalizedSearchKeyFile.age
      : null;

  if (!ageIndex || typeof ageIndex !== 'object') return {};

  const pending = new Set(normalizedIds);
  const ageKeysByUserId = {};

  Object.entries(ageIndex).forEach(([ageKey, usersMap]) => {
    if (!(usersMap && typeof usersMap === 'object')) return;
    if (pending.size === 0) return;

    Object.keys(usersMap).forEach(userId => {
      if (!pending.has(userId)) return;
      ageKeysByUserId[userId] = ageKey;
      pending.delete(userId);
    });
  });

  return ageKeysByUserId;
};



const getSearchKeyBucketUsers = (searchKeyFile, indexName, value) => {
  const source = searchKeyFile && typeof searchKeyFile === 'object' && !Array.isArray(searchKeyFile) ? searchKeyFile : null;
  if (!source) return null;
  const indexNode = source?.[indexName];
  if (!indexNode || typeof indexNode !== 'object') return null;
  const bucketNode = indexNode?.[value];
  if (!bucketNode || typeof bucketNode !== 'object') return null;
  return new Set(Object.keys(bucketNode).filter(Boolean));
};

const buildSanitizedBucketUsersMap = ({ searchKeyFile, indexName, values, allowedUserIds }) => {
  const normalizedAllowedIds = new Set((Array.isArray(allowedUserIds) ? allowedUserIds : []).filter(Boolean));
  if (!searchKeyFile || normalizedAllowedIds.size === 0) return {};

  return (Array.isArray(values) ? values : []).reduce((acc, value) => {
    const bucketUsers = getSearchKeyBucketUsers(searchKeyFile, indexName, value);
    if (!(bucketUsers instanceof Set) || bucketUsers.size === 0) return acc;
    const filtered = [...bucketUsers].filter(userId => normalizedAllowedIds.has(userId));
    if (filtered.length) {
      acc[value] = filtered;
    }
    return acc;
  }, {});
};

const buildMetricBucketsForAllowedUsers = ({ searchKeyFile, indexName, allowedUserIds }) => {
  const normalizedAllowedIds = new Set((Array.isArray(allowedUserIds) ? allowedUserIds : []).filter(Boolean));
  if (!searchKeyFile || normalizedAllowedIds.size === 0) return {};

  const indexNode = searchKeyFile?.[indexName];
  if (!indexNode || typeof indexNode !== 'object') return {};

  return Object.entries(indexNode).reduce((acc, [bucketValue, usersMap]) => {
    if (!usersMap || typeof usersMap !== 'object') return acc;
    const filteredUserIds = Object.keys(usersMap).filter(userId => normalizedAllowedIds.has(userId));
    if (filteredUserIds.length > 0) {
      acc[bucketValue] = filteredUserIds;
    }
    return acc;
  }, {});
};

const buildRuleBucketWrites = ({ rootPath, parsedRuleGroups, userIds, searchKeyFile = null }) => {
  const normalizedRootPath = String(rootPath || '').trim();
  if (!normalizedRootPath) return {};
  if (!searchKeyFile || typeof searchKeyFile !== 'object' || Array.isArray(searchKeyFile)) return {};

  const normalizedUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  const bucketMap = mergeSearchKeyBuckets(parsedRuleGroups);
  const hasImtFilter = (() => {
    const imtValues = bucketMap?.imt;
    if (imtValues instanceof Set) return imtValues.size > 0;
    if (Array.isArray(imtValues)) return imtValues.length > 0;
    return false;
  })();

  const writes = Object.entries(bucketMap || {}).reduce((accWrites, [indexName, rawValues]) => {
    const normalizedIndexName = normalizePathSegment(indexName);
    if (!normalizedIndexName) return accWrites;

    if (normalizedIndexName === 'age') {
      const allowedAgeValues = (Array.isArray(rawValues) ? rawValues : [...(rawValues || [])])
        .map(value => normalizeAgeSearchKeyValue(value))
        .filter(Boolean);
      const sanitized = buildSanitizedBucketUsersMap({
        searchKeyFile,
        indexName: normalizedIndexName,
        values: allowedAgeValues,
        allowedUserIds: normalizedUserIds,
      });
      Object.entries(sanitized).forEach(([ageValue, targetUserIds]) => {
        const path = `${normalizedRootPath}/${normalizedIndexName}/${ageValue}`;
        accWrites[path] = targetUserIds.reduce((result, userId) => {
          result[userId] = true;
          return result;
        }, {});
      });
      return accWrites;
    }

    const values = [
      ...new Set(
        (Array.isArray(rawValues) ? rawValues : [...(rawValues || [])])
          .map(normalizePathSegment)
          .filter(Boolean)
      ),
    ];
    if (!values.length) return accWrites;

    const sanitized = buildSanitizedBucketUsersMap({
      searchKeyFile,
      indexName: normalizedIndexName,
      values,
      allowedUserIds: normalizedUserIds,
    });
    Object.entries(sanitized).forEach(([value, targetUserIds]) => {
      const path = `${normalizedRootPath}/${normalizedIndexName}/${value}`;
      accWrites[path] = targetUserIds.reduce((result, userId) => {
        result[userId] = true;
        return result;
      }, {});
    });
    return accWrites;
  }, {});

  if (hasImtFilter) {
    ['height', 'weight'].forEach(metricIndexName => {
      const metricBuckets = buildMetricBucketsForAllowedUsers({
        searchKeyFile,
        indexName: metricIndexName,
        allowedUserIds: normalizedUserIds,
      });
      Object.entries(metricBuckets).forEach(([bucketValue, targetUserIds]) => {
        const path = `${normalizedRootPath}/${metricIndexName}/${bucketValue}`;
        writes[path] = targetUserIds.reduce((result, userId) => {
          result[userId] = true;
          return result;
        }, {});
      });
    });
  }

  return writes;
};

export const buildSearchKeySetIndexFromMatchedUsers = async ({
  rawRules,
  accessUserId,
  matchedUserIdsBySetKey = null,
  searchKeyFile = null,
}) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;

  const ruleSetEntries = parseRawRulesToSetEntries(rawRules);
  const setPayloads = ruleSetEntries
    .map(({ text: setText, inputIndex }) => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (parsedRuleGroups.length === 0) return null;

      const setKey = makeAdditionalRulesSetKey(setText, normalizedAccessUserId, inputIndex);
      if (!setKey) return null;

      const prefilteredIds = matchedUserIdsBySetKey?.[setKey];
      if (!Array.isArray(prefilteredIds)) {
        return {
          setKey,
          userIds: [],
          parsedRuleGroups,
          missingSearchKeyIndex: true,
        };
      }

      const userIds = [...new Set(prefilteredIds.filter(Boolean))];
      return { setKey, userIds, parsedRuleGroups };
    })
    .filter(Boolean);

  if (setPayloads.some(item => item.missingSearchKeyIndex)) {
    const error = new Error('Missing searchKey index for one or more additional access rule sets');
    error.code = 'MISSING_SEARCHKEY_INDEX';
    throw error;
  }

  const allUserIds = [...new Set(setPayloads.flatMap(item => item.userIds || []).filter(Boolean))];
  const ageKeysByUserId = await buildAgeKeysByUserIdFromSearchKey(allUserIds, searchKeyFile);

  for (const setPayload of setPayloads) {
    // eslint-disable-next-line no-await-in-loop
    await remove(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setPayload.setKey}`));

    if (setPayload.userIds.length === 0) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const options = {
      rootPath: `${SEARCH_KEY_SETS_ROOT}/${setPayload.setKey}`,
    };
    const ruleBucketWrites = buildRuleBucketWrites({
      rootPath: options.rootPath,
      parsedRuleGroups: setPayload.parsedRuleGroups,
      userIds: setPayload.userIds,
      ageKeysByUserId,
      searchKeyFile,
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
  accessUserId,
  matchedUserIdsBySetKey = null,
  searchKeyFile = null,
}) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;
  if (!searchKeyFile || typeof searchKeyFile !== 'object' || Array.isArray(searchKeyFile)) {
    const error = new Error('Missing local searchKey file for additional access rule set indexing');
    error.code = 'MISSING_SEARCHKEY_FILE';
    throw error;
  }

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
          : null;
      if (!userIds) {
        return {
          setKey: ownerSetKey,
          userIds: null,
          parsedRuleGroups,
          missingSearchKeyIndex: true,
        };
      }

      return {
        setKey: ownerSetKey,
        userIds,
        parsedRuleGroups,
      };
    })
    .filter(Boolean);
  if (nextSetPayloads.some(item => item.missingSearchKeyIndex)) {
    const error = new Error('Missing searchKey index for one or more additional access rule sets');
    error.code = 'MISSING_SEARCHKEY_INDEX';
    throw error;
  }

  const rootSnap = await get(ref(database, SEARCH_KEY_SETS_ROOT));
  const rootMap = rootSnap.exists() ? rootSnap.val() || {} : {};
  const ownerPrefix = `${normalizedAccessUserId}${SET_KEY_INDEX_SEPARATOR}`;
  const existingSetKeys = Object.keys(rootMap).filter(setKey => setKey.startsWith(ownerPrefix));
  const nextSetKeys = new Set(nextSetPayloads.map(item => item.setKey));

  const writes = {};
  let bucketWritesCount = 0;
  const debug = {
    removedSetKeys: [],
    sets: [],
  };
  existingSetKeys.forEach(setKey => {
    if (!nextSetKeys.has(setKey)) {
      writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}`] = null;
      debug.removedSetKeys.push(setKey);
    }
  });
  if (Object.keys(writes).length > 0) {
    await update(ref(database), writes);
  }

  for (const { setKey, userIds, parsedRuleGroups } of nextSetPayloads) {
    // eslint-disable-next-line no-await-in-loop
    await remove(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setKey}`));

    const rootPath = `${SEARCH_KEY_SETS_ROOT}/${setKey}`;
    const ruleBucketWrites = buildRuleBucketWrites({
      rootPath,
      parsedRuleGroups,
      userIds: Object.keys(userIds || {}),
      searchKeyFile,
    });
    debug.sets.push({
      setKey,
      matchedUserIdsCount: Object.keys(userIds || {}).length,
      parsedRuleGroupsCount: Array.isArray(parsedRuleGroups) ? parsedRuleGroups.length : 0,
      bucketWritesCount: Object.keys(ruleBucketWrites).length,
      bucketPathsPreview: Object.keys(ruleBucketWrites).slice(0, 12),
    });

    if (Object.keys(ruleBucketWrites).length) {
      bucketWritesCount += Object.keys(ruleBucketWrites).length;
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
    bucketWritesCount,
    debug,
  };
};

export const getIndexedNewUsersIdsByRules = async ({ rawRules, accessUserId }) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;

  const cachedIndexedSet = getCachedAdditionalRulesSetIndex({
    rawRules,
    accessUserId: normalizedAccessUserId,
  });

  const ruleSetEntries = parseRawRulesToSetEntries(rawRules);
  const setEntries = ruleSetEntries
    .map(({ text: setText, inputIndex }) => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (!parsedRuleGroups.length) return null;
      const bucketMap = mergeSearchKeyBuckets(parsedRuleGroups);
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
      return { setKey, paths, indexBuckets };
    })
    .filter(Boolean);
  if (!setEntries.length) return null;

  const buildIndexedResultFromSetsMap = setsMap => {
    if (!setsMap || typeof setsMap !== 'object') return null;

    const userIds = new Set();
    const setKeys = [];
    for (const entry of setEntries) {
      const setNode = setsMap?.[entry.setKey];
      if (!setNode || typeof setNode !== 'object') return null;

      Object.entries(entry.indexBuckets).forEach(([indexName, values]) => {
        values.forEach(value => {
          const bucketValue = setNode?.[indexName]?.[value];
          if (!bucketValue || typeof bucketValue !== 'object') {
            throw new Error('MISSING_BUCKET');
          }
          setKeys.push(`${SEARCH_KEY_SETS_ROOT}/${entry.setKey}/${indexName}/${value}`);
          Object.keys(bucketValue).forEach(userId => {
            if (userId) userIds.add(userId);
          });
        });
      });
    }

    return {
      setKeys,
      userIds: [...userIds],
      ownerId: normalizedAccessUserId,
    };
  };

  if (cachedIndexedSet) {
    try {
      const cachedResult = buildIndexedResultFromSetsMap(cachedIndexedSet);
      if (cachedResult) return cachedResult;
    } catch {
      // ignore malformed or incomplete cache and fallback to searchKey cache payload lookup
    }
  }

  const payloadsBySet = await Promise.all(
    setEntries.map(async entry => {
      const payloads = await Promise.all(
        entry.paths.map(path => Promise.resolve(peekCachedSearchKeyPayload(path)))
      );
      return { setKey: entry.setKey, paths: entry.paths, payloads };
    })
  );

  const hasMissingSetPayloads = payloadsBySet.some(item => item.payloads.some(payload => !payload?.exists));
  if (hasMissingSetPayloads) {
    const fallbackSearchKeyPayloads = await Promise.all(
      setEntries.map(async entry => {
        const paths = Object.entries(entry.indexBuckets).flatMap(([indexName, values]) =>
          values.map(value => `searchKey/${indexName}/${value}`)
        );
        const payloads = await Promise.all(
          paths.map(path => Promise.resolve(peekCachedSearchKeyPayload(path)))
        );
        return { paths, payloads };
      })
    );

    if (fallbackSearchKeyPayloads.some(item => item.payloads.some(payload => !payload?.exists))) {
      return null;
    }

    const userIds = new Set();
    fallbackSearchKeyPayloads.forEach(item => {
      item.payloads.forEach(payload => {
        Object.keys(payload?.value || {}).forEach(userId => {
          if (userId) userIds.add(userId);
        });
      });
    });

    return {
      setKeys: fallbackSearchKeyPayloads.flatMap(item => item.paths),
      userIds: [...userIds],
      ownerId: normalizedAccessUserId,
    };
  }

  const userIds = new Set();
  const setsMap = {};
  payloadsBySet.forEach(item => {
    setsMap[item.setKey] = setsMap[item.setKey] && typeof setsMap[item.setKey] === 'object'
      ? setsMap[item.setKey]
      : {};
    item.payloads.forEach(payload => {
      Object.keys(payload?.value || {}).forEach(userId => {
        if (userId) userIds.add(userId);
      });
    });
    item.paths.forEach((path, pathIndex) => {
      const [, setKey, indexName, value] = String(path).split('/');
      if (!setKey || !indexName || !value) return;
      const payloadValue = item.payloads[pathIndex]?.value;
      if (!payloadValue || typeof payloadValue !== 'object') return;
      if (!setsMap[setKey][indexName] || typeof setsMap[setKey][indexName] !== 'object') {
        setsMap[setKey][indexName] = {};
      }
      setsMap[setKey][indexName][value] = payloadValue;
    });
  });

  const result = {
    setKeys: payloadsBySet.flatMap(item => item.paths),
    userIds: [...userIds],
    ownerId: normalizedAccessUserId,
  };
  saveCachedAdditionalRulesSetIndex({
    rawRules,
    accessUserId: normalizedAccessUserId,
    setsMap,
  });
  return result;
};

const getMatchedUserIdsFromSearchKey = async parsedRuleGroups => {
  const groups = Array.isArray(parsedRuleGroups) ? parsedRuleGroups : [parsedRuleGroups];
  const matchedIds = new Set();

  for (const parsedRules of groups) {
    const bucketMap = resolveAdditionalAccessSearchKeyBuckets(parsedRules);
    const activeSources = Object.entries(bucketMap || {}).reduce((acc, [indexName, rawValues]) => {
      const normalizedIndexName = normalizePathSegment(indexName);
      if (!normalizedIndexName) return acc;

      const values = [
        ...new Set(
          (Array.isArray(rawValues) ? rawValues : [...(rawValues || [])])
            .map(normalizePathSegment)
            .filter(Boolean)
        ),
      ];
      if (!values.length) return acc;

      acc.push({ indexName: normalizedIndexName, values });
      return acc;
    }, []);

    if (!activeSources.length) continue;

    // eslint-disable-next-line no-await-in-loop
    const sourceIdSets = await Promise.all(
      activeSources.map(async ({ indexName, values }) => {
        const paths = values.map(value => `searchKey/${indexName}/${value}`);
        const payloads = await Promise.all(
          paths.map(path => Promise.resolve(peekCachedSearchKeyPayload(path)))
        );

        const idsBySource = new Set();
        payloads.forEach(payload => {
          if (!payload?.exists || !payload.value || typeof payload.value !== 'object') return;
          Object.keys(payload.value).forEach(userId => {
            if (userId) idsBySource.add(userId);
          });
        });
        return idsBySource;
      })
    );

    const normalizedSets = sourceIdSets.filter(set => set instanceof Set);
    if (!normalizedSets.length || normalizedSets.some(set => set.size === 0)) continue;

    const [firstSet, ...restSets] = normalizedSets;
    [...firstSet]
      .filter(userId => restSets.every(set => set.has(userId)))
      .forEach(userId => matchedIds.add(userId));
  }

  return [...matchedIds];
};

export const rebuildAllNewUsersFilterSetIndexes = async () => {
  const [usersSnap, searchKeySetSnap] = await Promise.all([
    get(ref(database, 'users')),
    get(ref(database, SEARCH_KEY_SETS_ROOT)),
  ]);

  const usersMap = usersSnap.exists() ? usersSnap.val() || {} : {};
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
    // 1) формуємо попередньо відфільтрований набір userIds із searchKey buckets для кожного setKey
    // 2) записуємо searchKeySets з урахуванням цих наборів
    const matchedUserIdsBySetKey = {};
    const ruleEntries = parseRawRulesToSetEntries(rawRules);
    ruleEntries.forEach(({ text: setText, inputIndex }) => {
      const setKey = makeAdditionalRulesSetKey(setText, userId, inputIndex);
      if (!setKey) return;
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (!parsedRuleGroups.length) return;

      matchedUserIdsBySetKey[setKey] = [];
    });

    for (const { text: setText, inputIndex } of ruleEntries) {
      const setKey = makeAdditionalRulesSetKey(setText, userId, inputIndex);
      if (!setKey) continue;
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (!parsedRuleGroups.length) continue;

      // eslint-disable-next-line no-await-in-loop
      matchedUserIdsBySetKey[setKey] = await getMatchedUserIdsFromSearchKey(parsedRuleGroups);
    }

    const indexed = await buildNewUsersFilterSetIndex({
      rawRules,
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
