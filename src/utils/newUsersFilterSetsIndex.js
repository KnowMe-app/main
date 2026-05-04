import { get, ref, remove, set, update } from 'firebase/database';
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

const METRIC_BUCKETS_BY_INDEX = {
  height: ['lt163', '163_176', '177_180', '181_plus', '?', 'no'],
  weight: ['lt55', '55_69', '70_84', '85_plus', '?', 'no'],
};

const HEIGHT_BUCKET_RANGES = {
  lt163: { min: 120, max: 162.99 },
  '163_176': { min: 163, max: 176 },
  '177_180': { min: 177, max: 180 },
  '181_plus': { min: 181, max: 230 },
};

const WEIGHT_BUCKET_RANGES = {
  lt55: { min: 30, max: 54.99 },
  '55_69': { min: 55, max: 69 },
  '70_84': { min: 70, max: 84 },
  '85_plus': { min: 85, max: 220 },
};

const IMT_BUCKET_RANGES = {
  le28: { min: -Infinity, max: 28 },
  '29_31': { min: 29, max: 31 },
  '32_35': { min: 32, max: 35 },
  '36_plus': { min: 36, max: Infinity },
};

const countRecords = node => {
  if (!node || typeof node !== 'object') return 0;
  return Object.values(node).reduce((total, value) => {
    if (!value || typeof value !== 'object') return total;
    return total + Object.keys(value).length;
  }, 0);
};

export const collectMetricBucketsByUserId = searchKeyFile => {
  const heightIndex = searchKeyFile?.height && typeof searchKeyFile.height === 'object' ? searchKeyFile.height : {};
  const weightIndex = searchKeyFile?.weight && typeof searchKeyFile.weight === 'object' ? searchKeyFile.weight : {};
  const heightByUserId = {};
  const weightByUserId = {};

  Object.entries(heightIndex).forEach(([bucket, usersMap]) => {
    if (!usersMap || typeof usersMap !== 'object') return;
    Object.keys(usersMap).forEach(userId => {
      if (userId && !heightByUserId[userId]) heightByUserId[userId] = bucket;
    });
  });

  Object.entries(weightIndex).forEach(([bucket, usersMap]) => {
    if (!usersMap || typeof usersMap !== 'object') return;
    Object.keys(usersMap).forEach(userId => {
      if (userId && !weightByUserId[userId]) weightByUserId[userId] = bucket;
    });
  });

  return { heightByUserId, weightByUserId };
};

export const resolveImtBucketsFromMetricBuckets = (heightBucket, weightBucket) => {
  if (!heightBucket || !weightBucket) return [];
  if (heightBucket === 'no' || weightBucket === 'no') return ['no'];
  if (heightBucket === '?' || weightBucket === '?') return ['?'];
  const hr = HEIGHT_BUCKET_RANGES[heightBucket];
  const wr = WEIGHT_BUCKET_RANGES[weightBucket];
  if (!hr || !wr) return ['?'];
  const minBmi = wr.min / ((hr.max / 100) ** 2);
  const maxBmi = wr.max / ((hr.min / 100) ** 2);
  return Object.entries(IMT_BUCKET_RANGES)
    .filter(([, range]) => !(maxBmi < range.min || minBmi > range.max))
    .map(([bucket]) => bucket);
};

const augmentBucketsWithImtMetricWrappers = bucketMap => {
  if (!bucketMap || typeof bucketMap !== 'object') return bucketMap;

  const imtBuckets = bucketMap.imt;
  const hasImtBuckets =
    (imtBuckets instanceof Set && imtBuckets.size > 0) ||
    (Array.isArray(imtBuckets) && imtBuckets.length > 0);

  if (!hasImtBuckets) return bucketMap;

  const nextBucketMap = { ...bucketMap };
  ['height', 'weight'].forEach(metricKey => {
    const existing = nextBucketMap[metricKey];
    const hasExisting =
      (existing instanceof Set && existing.size > 0) ||
      (Array.isArray(existing) && existing.length > 0);
    if (hasExisting) return;
    nextBucketMap[metricKey] = new Set(METRIC_BUCKETS_BY_INDEX[metricKey]);
  });

  return nextBucketMap;
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


const buildRuleBucketWrites = ({ rootPath, parsedRuleGroups, userIds, searchKeyFile = null, rawText = '' }) => {
  const normalizedRootPath = String(rootPath || '').trim();
  if (!normalizedRootPath) return { writes: {}, debugInfo: null };
  if (!searchKeyFile || typeof searchKeyFile !== 'object' || Array.isArray(searchKeyFile)) return { writes: {}, debugInfo: null };

  const normalizedUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  const baseBucketMap = augmentBucketsWithImtMetricWrappers(mergeSearchKeyBuckets(parsedRuleGroups));

  const existingImt = baseBucketMap?.imt;
  const hasExistingImt =
    (existingImt instanceof Set && existingImt.size > 0) ||
    (Array.isArray(existingImt) && existingImt.length > 0);

  let bucketMap = baseBucketMap;
  if (!hasExistingImt && rawText) {
    const imtLineMatch = String(rawText).match(/(?:^|\n)\s*imt\s*:\s*([^\n]+)/i);
    if (imtLineMatch) {
      const imtTokens = imtLineMatch[1].split(',').map(t => t.trim()).filter(Boolean);
      if (imtTokens.length > 0) {
        bucketMap = {
          ...baseBucketMap,
          imt: new Set(imtTokens),
          height: (baseBucketMap.height instanceof Set && baseBucketMap.height.size > 0)
            ? baseBucketMap.height
            : new Set(METRIC_BUCKETS_BY_INDEX.height),
          weight: (baseBucketMap.weight instanceof Set && baseBucketMap.weight.size > 0)
            ? baseBucketMap.weight
            : new Set(METRIC_BUCKETS_BY_INDEX.weight),
        };
      }
    }
  }

  const imtValuesRaw = bucketMap?.imt;
  const imtValues = [
    ...new Set((Array.isArray(imtValuesRaw) ? imtValuesRaw : [...(imtValuesRaw || [])]).map(normalizePathSegment)),
  ];
  const hasImtFilter = imtValues.length > 0;

  const filterUserIdsByImtBuckets = candidateUserIds => {
    if (!hasImtFilter) return [...candidateUserIds];
    const { heightByUserId, weightByUserId } = collectMetricBucketsByUserId(searchKeyFile);

    return [...candidateUserIds].filter(userId => {
      const imtBuckets = resolveImtBucketsFromMetricBuckets(heightByUserId[userId], weightByUserId[userId]);
      return imtBuckets.some(bucket => imtValues.includes(bucket));
    });
  };

  const { heightByUserId, weightByUserId } = collectMetricBucketsByUserId(searchKeyFile);

  const resolveImtCandidateUserIds = () => {
    if (!hasImtFilter) return normalizedUserIds;

    // IMT-фільтр має стартувати з усіх userId, які присутні в height (включно з ?, no і числовими bucket-ами).
    const heightUserIds = Object.keys(heightByUserId || {});
    return [...new Set(heightUserIds.filter(Boolean))];
  };

  const imtCandidateUserIds = resolveImtCandidateUserIds();
  const imtAllowedUserIds = hasImtFilter ? filterUserIdsByImtBuckets(imtCandidateUserIds) : normalizedUserIds;
  const allowedUserIdsForWrites = hasImtFilter
    ? imtAllowedUserIds
    : normalizedUserIds;
  const normalizedAllowedIds = new Set(allowedUserIdsForWrites.filter(Boolean));

  const writes = {};
  const copiedFields = new Set();
  const copiedBuckets = new Set();
  let copiedUserRecords = 0;

  const copiedByField = {};
  const skippedFields = [];
  Object.entries(searchKeyFile || {}).forEach(([indexName, bucketsMap]) => {
    const normalizedIndexName = normalizePathSegment(indexName);
    if (!normalizedIndexName || normalizedIndexName === 'users') return;
    if (normalizedIndexName === 'imt') {
      skippedFields.push('imt');
      return;
    }
    if (!bucketsMap || typeof bucketsMap !== 'object' || Array.isArray(bucketsMap)) return;
    if (!copiedByField[normalizedIndexName]) copiedByField[normalizedIndexName] = { buckets: 0, records: 0 };

    Object.entries(bucketsMap).forEach(([bucketValue, usersMap]) => {
      if (!usersMap || typeof usersMap !== 'object' || Array.isArray(usersMap)) return;
      const filteredUserIds = Object.keys(usersMap).filter(userId => (
        Boolean(userId) && normalizedAllowedIds.has(userId)
      ));
      if (!filteredUserIds.length) return;

      const path = `${normalizedRootPath}/${normalizedIndexName}/${normalizePathSegment(bucketValue)}`;
      writes[path] = filteredUserIds.reduce((result, userId) => {
        result[userId] = true;
        return result;
      }, {});
      copiedFields.add(normalizedIndexName);
      copiedBuckets.add(path);
      copiedUserRecords += filteredUserIds.length;
      copiedByField[normalizedIndexName].buckets += 1;
      copiedByField[normalizedIndexName].records += filteredUserIds.length;
    });
  });

  if (hasImtFilter) {

    const writtenUserIds = new Set();
    Object.values(writes).forEach(usersMap => {
      Object.keys(usersMap || {}).forEach(userId => {
        if (userId) writtenUserIds.add(userId);
      });
    });

    const usersWithWeight = imtCandidateUserIds.filter(userId => Boolean(weightByUserId[userId])).length;
    const usersWithValidImt = imtCandidateUserIds.filter(userId => {
      const buckets = resolveImtBucketsFromMetricBuckets(heightByUserId[userId], weightByUserId[userId]);
      return buckets.some(bucket => ['le28', '29_31', '32_35', '36_plus'].includes(bucket));
    }).length;
    const usersInLe28 = imtCandidateUserIds.filter(userId => {
      const buckets = resolveImtBucketsFromMetricBuckets(heightByUserId[userId], weightByUserId[userId]);
      return buckets.includes('le28');
    }).length;
      const writtenHeightUsers = new Set();
      const writtenWeightUsers = new Set();
    Object.entries(writes).forEach(([path, usersMap]) => {
      const parts = String(path).split('/');
      const metric = parts[parts.length - 2];
      Object.keys(usersMap || {}).forEach(userId => {
        if (!userId) return;
        if (metric === 'height') writtenHeightUsers.add(userId);
        if (metric === 'weight') writtenWeightUsers.add(userId);
      });
    });

      console.info('[searchKeySets][IMT] Diagnostics', {
        rootPath: normalizedRootPath,
        selectedRules: parsedRuleGroups,
        heightUsers: Object.keys(heightByUserId || {}).length,
        usersWithWeight,
        usersWithValidImt,
        usersInLe28,
        imtSelectedTokens: imtValues,
        allowedUserIdsCount: allowedUserIdsForWrites.length,
        copiedFieldsCount: copiedFields.size,
        totalCopiedBuckets: copiedBuckets.size,
        totalCopiedUserRecords: copiedUserRecords,
        bucketsWritten: Object.keys(writes).length,
        hasImtBucketWrites: Object.keys(writes).some(path => String(path).includes('/imt/')),
        usersWritten: writtenUserIds.size,
        writtenHeightUsers: writtenHeightUsers.size,
        writtenWeightUsers: writtenWeightUsers.size,
        samplePaths: Object.keys(writes)
          .filter(path => path.includes('/height/') || path.includes('/weight/'))
          .slice(0, 10),
      });

    const heightBucketsCount = Object.keys(writes).filter(path => path.includes('/height/')).length;
    const weightBucketsCount = Object.keys(writes).filter(path => path.includes('/weight/')).length;
    if (allowedUserIdsForWrites.length > 0 && copiedUserRecords === 0) {
      throw new Error('Allowed users знайдені, але buckets не сформовані');
    }
    if (allowedUserIdsForWrites.length > 0 && (heightBucketsCount === 0 || weightBucketsCount === 0)) {
      throw new Error('Allowed users знайдені, але buckets height/weight не сформовані');
    }
  }

  return {
    writes,
    debugInfo: {
      selectedRules: parsedRuleGroups,
      allowedUserIdsCount: allowedUserIdsForWrites.length,
      allowedSample: [...normalizedAllowedIds].slice(0, 10),
      searchKeyFields: Object.keys(searchKeyFile || {}),
      skippedFields,
      copiedByField,
      copiedRecords: copiedUserRecords,
      copiedBuckets: copiedBuckets.size,
      filteredFields: [...copiedFields],
      hasImtFilter,
      imtValues,
    },
  };
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
    const { writes: ruleBucketWrites } = buildRuleBucketWrites({
      rootPath: options.rootPath,
      parsedRuleGroups: setPayload.parsedRuleGroups,
      userIds: setPayload.userIds,
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
        rawText: setText,
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
    backendRequests: [],
  };
  existingSetKeys.forEach(setKey => {
    if (!nextSetKeys.has(setKey)) {
      writes[`${SEARCH_KEY_SETS_ROOT}/${setKey}`] = null;
      debug.removedSetKeys.push(setKey);
    }
  });
  if (Object.keys(writes).length > 0) {
    debug.backendRequests.push({
      type: 'update',
      path: '/',
      payload: { ...writes },
    });
    await update(ref(database), writes);
  }

  for (const { setKey, userIds, parsedRuleGroups, rawText } of nextSetPayloads) {
    // eslint-disable-next-line no-await-in-loop
    debug.backendRequests.push({
      type: 'remove',
      path: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
      payload: null,
    });
    await remove(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setKey}`));

    const rootPath = `${SEARCH_KEY_SETS_ROOT}/${setKey}`;
    const { writes: ruleBucketWrites, debugInfo } = buildRuleBucketWrites({
      rootPath,
      parsedRuleGroups,
      userIds: Object.keys(userIds || {}),
      searchKeyFile,
      rawText,
    });
    debug.sets.push({
      setKey,
      matchedUserIdsCount: Object.keys(userIds || {}).length,
      parsedRuleGroupsCount: Array.isArray(parsedRuleGroups) ? parsedRuleGroups.length : 0,
      bucketWritesCount: Object.keys(ruleBucketWrites).length,
      bucketPathsPreview: Object.keys(ruleBucketWrites).slice(0, 12),
      debugInfo,
    });

    const filteredSearchKeySet = Object.entries(ruleBucketWrites).reduce((acc, [path, payload]) => {
      const prefix = `${SEARCH_KEY_SETS_ROOT}/${setKey}/`;
      if (!path.startsWith(prefix) || payload == null) return acc;
      const relativePath = path.slice(prefix.length);
      const [indexName, bucketName, userId] = relativePath.split('/');
      if (!indexName || !bucketName || !userId) return acc;
      if (!acc[indexName]) acc[indexName] = {};
      if (!acc[indexName][bucketName]) acc[indexName][bucketName] = {};
      acc[indexName][bucketName][userId] = payload;
      return acc;
    }, {});

    if (!filteredSearchKeySet || Object.keys(filteredSearchKeySet).length === 0) {
      const error = new Error('filteredSearchKeySet empty — nothing to save');
      error.code = 'EMPTY_FILTERED_SEARCHKEY_SET';
      throw error;
    }

    console.log('WRITE PAYLOAD:', {
      setId: setKey,
      hasPayload: !!filteredSearchKeySet,
      fields: Object.keys(filteredSearchKeySet),
      totalRecords: countRecords(filteredSearchKeySet),
    });

    debug.backendRequests.push({
      type: 'set',
      path: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
      payload: filteredSearchKeySet,
    });
    debug.lastSetDebug = {
      ...(debugInfo || {}),
      filteredFields: Object.keys(filteredSearchKeySet || {}),
      backendRequests: debug.backendRequests,
      setKey,
    };
    console.log('backendRequests:', debug.backendRequests);

    const writesCountForSet = Object.keys(ruleBucketWrites).length;
    bucketWritesCount += writesCountForSet;
    console.info('[searchKeySets] Firebase write start', {
      path: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
      setKey,
      writesCount: writesCountForSet,
    });
    // eslint-disable-next-line no-await-in-loop
    await set(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setKey}`), filteredSearchKeySet);
    console.info('[searchKeySets] Firebase write success', {
      path: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
      setKey,
    });
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
      const bucketMap = augmentBucketsWithImtMetricWrappers(mergeSearchKeyBuckets(parsedRuleGroups));
      const indexBuckets = Object.entries(bucketMap || {}).reduce((acc, [indexName, rawValues]) => {
        const normalizedIndexName = normalizePathSegment(indexName);
        if (!normalizedIndexName) return acc;
        if (normalizedIndexName === 'imt' || normalizedIndexName === 'users') return acc;
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
    const bucketMap = augmentBucketsWithImtMetricWrappers(resolveAdditionalAccessSearchKeyBuckets(parsedRules));
    const imtValuesRaw = bucketMap?.imt;
    const imtValues = [
      ...new Set((Array.isArray(imtValuesRaw) ? imtValuesRaw : [...(imtValuesRaw || [])]).map(normalizePathSegment)),
    ];
    const hasImtFilter = imtValues.length > 0;
    const activeSources = Object.entries(bucketMap || {}).reduce((acc, [indexName, rawValues]) => {
      const normalizedIndexName = normalizePathSegment(indexName);
      if (!normalizedIndexName) return acc;
      if (normalizedIndexName === 'imt' || normalizedIndexName === 'users') return acc;

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

    if (!activeSources.length && !hasImtFilter) continue;

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
    if (!hasImtFilter && normalizedSets.some(set => set.size === 0)) continue;

    let groupMatchedIds = [];
    if (normalizedSets.length) {
      const [firstSet, ...restSets] = normalizedSets;
      groupMatchedIds = [...firstSet].filter(userId => restSets.every(set => set.has(userId)));
    }

    if (hasImtFilter) {
      const [heightPayload, weightPayload] = await Promise.all([
        Promise.resolve(peekCachedSearchKeyPayload('searchKey/height')),
        Promise.resolve(peekCachedSearchKeyPayload('searchKey/weight')),
      ]);
      const metricSearchKeyFile = {
        height: heightPayload?.exists && typeof heightPayload?.value === 'object' ? heightPayload.value : {},
        weight: weightPayload?.exists && typeof weightPayload?.value === 'object' ? weightPayload.value : {},
      };
      const { heightByUserId, weightByUserId } = collectMetricBucketsByUserId(metricSearchKeyFile);
      if (!groupMatchedIds.length) {
        const metricUserIds = new Set([
          ...Object.keys(heightByUserId || {}),
          ...Object.keys(weightByUserId || {}),
        ]);
        groupMatchedIds = [...metricUserIds];
      }
      groupMatchedIds = groupMatchedIds.filter(userId => {
        const imtBuckets = resolveImtBucketsFromMetricBuckets(heightByUserId[userId], weightByUserId[userId]);
        return imtBuckets.some(bucket => imtValues.includes(bucket));
      });
    }

    if (!groupMatchedIds.length) continue;

    groupMatchedIds.forEach(userId => matchedIds.add(userId));
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
