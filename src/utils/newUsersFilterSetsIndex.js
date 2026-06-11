import { endAt, get as firebaseGet, orderByKey, query, ref, remove, set, startAt, update } from 'firebase/database';
import { withAdminDownloadToast } from 'utils/backendDownloadToast';

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
  FIELD_COUNT_SEARCH_KEY_INDEX_NAME,
  collectFieldCountIdsFromIndexNode,
  hasFieldCountRangeBuckets,
} from './fieldCountBuckets';
import {
  getCachedSearchKeyPayload,
  peekCachedSearchKeyPayload,
  saveCachedAdditionalRulesSetIndex,
} from './searchKeyCache';

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'newUsersFilterSetsIndex',
    path: args[0],
  });

export const SEARCH_KEY_SETS_ROOT = 'searchKeySets';
const SET_KEY_INDEX_SEPARATOR = '_';
export const INVALID_SETKEY_OWNER_PREFIX = 'INVALID_SETKEY_OWNER_PREFIX';
const FORBIDDEN_RTDB_SEGMENT_CHARS = ['.', '#', '$', '/', '[', ']'];
const LARGE_AGE_RANGE_IDS_WARNING_THRESHOLD = 2000;

const SEARCH_KEY_SET_KEYS_OBJECT_FIELDS = [
  'searchKeySetsOfExactUser',
  'searchKeySetKeys',
  'searchKeySets',
  'additionalSearchKeySetKeys',
  'additionalAccessKeySets',
  'additionalAccessSearchKeySets',
  'keySets',
];


const normalizePathSegment = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const hasForbiddenChars = FORBIDDEN_RTDB_SEGMENT_CHARS.some(char => raw.includes(char));
  return hasForbiddenChars ? encodeKey(raw) : raw;
};

const normalizeSearchKeySetKey = value =>
  normalizePathSegment(String(value || '').trim().replace(/^\/?searchKeySets\//, ''));

const inFlightRangeQueries = new Map();

const isAgeBucket = value => /^d_\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const getAgeRangeBounds = values => {
  const dates = [...new Set((Array.isArray(values) ? values : []).map(v => String(v || '').trim()).filter(isAgeBucket))].sort();
  if (!dates.length) return null;
  return { startKey: dates[0], endKey: dates[dates.length - 1] };
};

const getSearchKeySetInputIndex = (setKey, accessUserId = '') => {
  const normalizedOwnerId = String(accessUserId || '').trim();
  const normalizedSetKey = normalizeSearchKeySetKey(setKey);
  const ownerPrefix = normalizedOwnerId ? `${normalizedOwnerId}${SET_KEY_INDEX_SEPARATOR}` : '';
  if (!normalizedSetKey || !ownerPrefix || !normalizedSetKey.startsWith(ownerPrefix)) return null;

  const rawIndex = normalizedSetKey.slice(ownerPrefix.length);
  const numericIndex = Number(rawIndex);
  return Number.isInteger(numericIndex) && numericIndex > 0 ? numericIndex : null;
};

export const normalizeSearchKeySetKeys = rawKeys => {
  const collect = value => {
    if (!value) return [];

    if (typeof value === 'string') {
      return value
        .split(/[\n,;\s]+/)
        .map(normalizeSearchKeySetKey)
        .filter(Boolean);
    }

    if (Array.isArray(value)) {
      return value.flatMap(collect);
    }

    if (typeof value === 'object') {
      const nestedFieldValues = SEARCH_KEY_SET_KEYS_OBJECT_FIELDS
        .filter(fieldName => Object.prototype.hasOwnProperty.call(value, fieldName))
        .flatMap(fieldName => collect(value[fieldName]));
      if (nestedFieldValues.length) return nestedFieldValues;

      return Object.entries(value).flatMap(([key, valueByKey]) => {
        if (valueByKey === true) return collect(key);
        if (!valueByKey) return [];
        if (typeof valueByKey === 'object' && !Array.isArray(valueByKey)) return collect(key);
        return collect(valueByKey);
      });
    }

    return [];
  };

  return [...new Set(collect(rawKeys))];
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

const collectUniqueUserIds = tree => {
  const ids = new Set();

  Object.values(tree || {}).forEach(fieldMap => {
    Object.values(fieldMap || {}).forEach(bucketMap => {
      Object.keys(bucketMap || {}).forEach(userId => {
        if (userId) ids.add(userId);
      });
    });
  });

  return ids;
};

const countBuckets = tree => Object.values(tree || {}).reduce((sum, fieldMap) => {
  return sum + Object.keys(fieldMap || {}).length;
}, 0);

const countRecords = tree => Object.values(tree || {}).reduce((total, fieldMap) => {
  return total + Object.values(fieldMap || {}).reduce((fieldTotal, bucketMap) => {
    return fieldTotal + Object.keys(bucketMap || {}).length;
  }, 0);
}, 0);

const intersectUserIdSets = userIdSets => {
  const sets = (Array.isArray(userIdSets) ? userIdSets : [])
    .filter(setValue => setValue instanceof Set);
  if (!sets.length) return new Set();

  const [smallestSet, ...remainingSets] = [...sets].sort((a, b) => a.size - b.size);
  return new Set(
    [...smallestSet].filter(userId => remainingSets.every(setValue => setValue.has(userId)))
  );
};

const collectSearchKeyUserIdsForBuckets = (searchKeyFile, indexName, values) => {
  const ids = new Set();
  const normalizedIndexName = normalizePathSegment(indexName);
  const indexNode = searchKeyFile?.[normalizedIndexName];
  if (!normalizedIndexName || !indexNode || typeof indexNode !== 'object' || Array.isArray(indexNode)) return ids;

  const normalizedValues = [
    ...new Set((Array.isArray(values) ? values : [...(values || [])]).map(normalizePathSegment).filter(Boolean)),
  ];

  normalizedValues.forEach(value => {
    const usersMap = indexNode?.[value];
    if (!usersMap || typeof usersMap !== 'object' || Array.isArray(usersMap)) return;
    Object.keys(usersMap).forEach(userId => {
      if (userId) ids.add(userId);
    });
  });

  return ids;
};

const buildSearchKeySetFromAllowedUsers = (searchKey, finalAllowedUserIds) => {
  const result = {};

  if (!searchKey || !finalAllowedUserIds || finalAllowedUserIds.size === 0) {
    return result;
  }

  Object.entries(searchKey).forEach(([fieldName, fieldBuckets]) => {
    if (fieldName === 'imt') return;
    if (!fieldBuckets || typeof fieldBuckets !== 'object' || Array.isArray(fieldBuckets)) return;

    Object.entries(fieldBuckets).forEach(([bucketName, bucketUsers]) => {
      if (!bucketUsers || typeof bucketUsers !== 'object' || Array.isArray(bucketUsers)) return;

      Object.keys(bucketUsers).forEach(userId => {
        if (!finalAllowedUserIds.has(userId)) return;

        if (!result[fieldName]) result[fieldName] = {};
        if (!result[fieldName][bucketName]) result[fieldName][bucketName] = {};
        result[fieldName][bucketName][userId] = true;
      });
    });
  });

  return result;
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

export const resolveImtTokensFromExactMetrics = (heightValue, weightValue) => {
  const normalizedHeight = String(heightValue ?? '').trim();
  const normalizedWeight = String(weightValue ?? '').trim();
  if (!normalizedHeight || !normalizedWeight) return [];
  if (normalizedHeight === 'no' || normalizedWeight === 'no') return ['no'];
  if (normalizedHeight === '?' || normalizedWeight === '?') return ['?'];

  const height = Number.parseFloat(normalizedHeight.replace(',', '.'));
  const weight = Number.parseFloat(normalizedWeight.replace(',', '.'));
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return ['?'];

  const bmi = weight / Math.pow(height / 100, 2);
  if (!Number.isFinite(bmi) || bmi <= 0) return ['?'];

  if (bmi < 29) return ['le28'];
  if (bmi >= 29 && bmi <= 31) return ['29_31'];
  if (bmi >= 32 && bmi <= 35) return ['32_35'];
  if (bmi >= 36) return ['36_plus'];
  return ['?'];
};

const normalizeBucketValues = values => [
  ...new Set((Array.isArray(values) ? values : [...(values || [])]).map(normalizePathSegment).filter(Boolean)),
];

const hasBucketValues = values =>
  (values instanceof Set && values.size > 0) ||
  (Array.isArray(values) && values.length > 0);

export const prepareAdditionalAccessBucketMapForSearchKey = bucketMap => {
  if (!bucketMap || typeof bucketMap !== 'object') {
    return { bucketMap: {}, hasImtFilter: false, imtValues: [], skippedDerivedMetricBuckets: false };
  }

  const imtValues = normalizeBucketValues(bucketMap.imt || []);
  const hasImtFilter = imtValues.length > 0;
  const nextBucketMap = { ...bucketMap };
  let skippedDerivedMetricBuckets = false;

  if (hasImtFilter) {
    ['height', 'weight'].forEach(metricKey => {
      const metricValues = normalizeBucketValues(nextBucketMap[metricKey] || []);
      if (!metricValues.length) return;

      const derivedMetricBuckets = new Set(METRIC_BUCKETS_BY_INDEX[metricKey] || []);
      const realSearchKeyValues = metricValues.filter(value => !derivedMetricBuckets.has(value));
      if (realSearchKeyValues.length !== metricValues.length) {
        skippedDerivedMetricBuckets = true;
      }

      if (realSearchKeyValues.length) {
        nextBucketMap[metricKey] = new Set(realSearchKeyValues);
      } else {
        delete nextBucketMap[metricKey];
      }
    });
  }

  return { bucketMap: nextBucketMap, hasImtFilter, imtValues, skippedDerivedMetricBuckets };
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
  const rawBucketMap = mergeSearchKeyBuckets(parsedRuleGroups);
  let bucketMapWithFallbackImt = rawBucketMap;

  const existingImt = rawBucketMap?.imt;
  const hasExistingImt = hasBucketValues(existingImt);

  if (!hasExistingImt && rawText) {
    const imtLineMatch = String(rawText).match(/(?:^|\n)\s*imt\s*:\s*([^\n]+)/i);
    if (imtLineMatch) {
      const imtTokens = imtLineMatch[1].split(',').map(t => t.trim()).filter(Boolean);
      if (imtTokens.length > 0) {
        bucketMapWithFallbackImt = {
          ...rawBucketMap,
          imt: new Set(imtTokens),
        };
      }
    }
  }

  const {
    bucketMap,
    hasImtFilter,
    imtValues,
    skippedDerivedMetricBuckets,
  } = prepareAdditionalAccessBucketMapForSearchKey(bucketMapWithFallbackImt);

  const filterUserIdsByImtBuckets = candidateUserIds => {
    if (!hasImtFilter) return [...candidateUserIds];

    return [...candidateUserIds].filter(userId => {
      const imtTokens = resolveImtTokensFromExactMetrics(heightByUserId[userId], weightByUserId[userId]);
      return imtTokens.some(token => imtValues.includes(token));
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
  const prefilterUserIdsSet = new Set(normalizedUserIds.filter(Boolean));
  const activeRuleUserIdSets = [];
  const ruleAllowedCounts = {};

  if (prefilterUserIdsSet.size > 0) {
    activeRuleUserIdSets.push(prefilterUserIdsSet);
    ruleAllowedCounts.prefilter = prefilterUserIdsSet.size;
  }

  Object.entries(bucketMap || {}).forEach(([indexName, values]) => {
    const normalizedIndexName = normalizePathSegment(indexName);
    if (!normalizedIndexName || normalizedIndexName === 'users' || normalizedIndexName === 'imt') return;

    const normalizedValues = [
      ...new Set((Array.isArray(values) ? values : [...(values || [])]).map(normalizePathSegment).filter(Boolean)),
    ];
    if (!normalizedValues.length) return;

    const fieldAllowedUserIds = collectSearchKeyUserIdsForBuckets(
      searchKeyFile,
      normalizedIndexName,
      normalizedValues
    );
    activeRuleUserIdSets.push(fieldAllowedUserIds);
    ruleAllowedCounts[normalizedIndexName] = fieldAllowedUserIds.size;
  });

  if (hasImtFilter) {
    const imtAllowedUserIdsSet = new Set(imtAllowedUserIds.filter(Boolean));
    activeRuleUserIdSets.push(imtAllowedUserIdsSet);
    ruleAllowedCounts.imt = imtAllowedUserIdsSet.size;
  }

  const finalAllowedUserIds = activeRuleUserIdSets.length
    ? intersectUserIdSets(activeRuleUserIdSets)
    : prefilterUserIdsSet;
  const allowedUserIdsForWrites = [...finalAllowedUserIds];
  const normalizedAllowedIds = finalAllowedUserIds;

  const filteredSearchKeySet = buildSearchKeySetFromAllowedUsers(searchKeyFile, normalizedAllowedIds);
  const payloadUserIds = collectUniqueUserIds(filteredSearchKeySet);
  const payloadBuckets = countBuckets(filteredSearchKeySet);
  const copiedUserRecords = countRecords(filteredSearchKeySet);

  const writes = {};
  const copiedFields = new Set(Object.keys(filteredSearchKeySet || {}));
  const copiedBuckets = new Set();
  const copiedByField = {};
  const skippedFields = Object.prototype.hasOwnProperty.call(searchKeyFile || {}, 'imt') ? ['imt'] : [];

  Object.entries(filteredSearchKeySet || {}).forEach(([indexName, bucketsMap]) => {
    if (!copiedByField[indexName]) copiedByField[indexName] = { buckets: 0, records: 0 };
    Object.entries(bucketsMap || {}).forEach(([bucketValue, usersMap]) => {
      const path = `${normalizedRootPath}/${indexName}/${bucketValue}`;
      writes[path] = usersMap;
      copiedBuckets.add(path);
      copiedByField[indexName].buckets += 1;
      copiedByField[indexName].records += Object.keys(usersMap || {}).length;
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
      const tokens = resolveImtTokensFromExactMetrics(heightByUserId[userId], weightByUserId[userId]);
      return tokens.some(token => ['le28', '29_31', '32_35', '36_plus'].includes(token));
    }).length;
    const usersWithUnknownHeightWeight = imtCandidateUserIds.filter(userId => {
      const heightValue = String(heightByUserId[userId] ?? '').trim();
      const weightValue = String(weightByUserId[userId] ?? '').trim();
      return ['?', 'no'].includes(heightValue) || ['?', 'no'].includes(weightValue);
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
        usersWithUnknownHeightWeight,
        imtSelectedTokens: imtValues,
        imtAllowedCount: hasImtFilter ? imtAllowedUserIds.length : null,
        ageAllowedCount: ruleAllowedCounts.age ?? null,
        finalAllowedCount: finalAllowedUserIds.size,
        payloadUsers: payloadUserIds.size,
        allowedUserIdsCount: allowedUserIdsForWrites.length,
        allowedUserIdsPreview: allowedUserIdsForWrites.slice(0, 5),
        copiedFieldsCount: copiedFields.size,
        totalCopiedBuckets: copiedBuckets.size,
        totalCopiedUserRecords: copiedUserRecords,
        bucketsWritten: Object.keys(writes).length,
        hasImtBucketWrites: Object.keys(writes).some(path => String(path).includes('/imt/')),
        skippedDerivedMetricBuckets,
        usersWritten: writtenUserIds.size,
        writtenHeightUsers: writtenHeightUsers.size,
        writtenWeightUsers: writtenWeightUsers.size,
        finalSearchKeySetFields: [...new Set(Object.keys(writes).map(path => String(path).split('/').slice(-2, -1)[0]))],
        finalRecordsCount: copiedUserRecords,
        samplePaths: Object.keys(writes)
          .filter(path => path.includes('/height/') || path.includes('/weight/'))
          .slice(0, 10),
      });

  }

  return {
    writes,
    finalAllowedUserIds,
    debugInfo: {
      selectedRules: parsedRuleGroups,
      allowedUserIdsCount: allowedUserIdsForWrites.length,
      finalAllowedCount: finalAllowedUserIds.size,
      imtAllowedCount: hasImtFilter ? imtAllowedUserIds.length : null,
      ageAllowedCount: ruleAllowedCounts.age ?? null,
      ruleAllowedCounts,
      payloadUsers: payloadUserIds.size,
      payloadBuckets,
      payloadRecords: copiedUserRecords,
      allowedSample: [...normalizedAllowedIds].slice(0, 10),
      searchKeyFields: Object.keys(searchKeyFile || {}),
      skippedFields,
      copiedByField,
      copiedRecords: copiedUserRecords,
      copiedBuckets: copiedBuckets.size,
      filteredFields: [...copiedFields],
      hasImtFilter,
      imtValues,
      skippedDerivedMetricBuckets,
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
    const { writes: ruleBucketWrites, debugInfo, finalAllowedUserIds } = buildRuleBucketWrites({
      rootPath,
      parsedRuleGroups,
      userIds: Object.keys(userIds || {}),
      searchKeyFile,
      rawText,
    });
    const saveAllowedUserIds = finalAllowedUserIds instanceof Set
      ? finalAllowedUserIds
      : new Set(Object.keys(userIds || {}).filter(Boolean));

    const filteredSearchKeySet = buildSearchKeySetFromAllowedUsers(
      searchKeyFile,
      saveAllowedUserIds
    );
    const debugFilteredFields = Object.keys(filteredSearchKeySet || {});
    const payloadUserIds = collectUniqueUserIds(filteredSearchKeySet || {});
    const debugRecordsCount = countRecords(filteredSearchKeySet || {});
    const debugBucketsCount = countBuckets(filteredSearchKeySet || {});
    const finalAllowedCount = saveAllowedUserIds.size;

    debug.sets.push({
      setKey,
      matchedUserIdsCount: Object.keys(userIds || {}).length,
      parsedRuleGroupsCount: Array.isArray(parsedRuleGroups) ? parsedRuleGroups.length : 0,
      bucketWritesCount: debugBucketsCount,
      bucketPathsPreview: Object.entries(filteredSearchKeySet || {})
        .flatMap(([fieldName, bucketsMap]) => Object.keys(bucketsMap || {}).map(bucketName => `${fieldName}/${bucketName}`))
        .slice(0, 12),
      debugInfo: {
        ...(debugInfo || {}),
        finalAllowedCount,
        payloadUsers: payloadUserIds.size,
        payloadBuckets: debugBucketsCount,
        payloadRecords: debugRecordsCount,
      },
    });

    console.log('[searchKeySets][debug] build result', {
      setKey,
      legacyRuleBucketWritesPaths: Object.keys(ruleBucketWrites),
      payloadBucketsCount: debugBucketsCount,
      filteredFields: debugFilteredFields,
      bucketsCount: debugBucketsCount,
      recordsCount: debugRecordsCount,
      payloadUsers: payloadUserIds.size,
      finalAllowedCount,
      source: 'searchKeyFile+finalAllowedUserIds',
    });

    if (payloadUserIds.size === 0 || debugRecordsCount === 0) {
      console.error('[searchKeySets] EMPTY PAYLOAD', {
        finalAllowedCount,
        searchKeyFields: Object.keys(searchKeyFile || {}),
        payloadUserIds: payloadUserIds.size,
        payloadRecords: debugRecordsCount,
        payloadBuckets: debugBucketsCount,
      });

      const error = new Error(
        `filteredSearchKeySet empty: matched=${finalAllowedCount}, payloadUsers=${payloadUserIds.size}, records=${debugRecordsCount}`
      );
      error.code = 'EMPTY_FILTERED_SEARCHKEY_SET';
      throw error;
    }

    if (payloadUserIds.size !== finalAllowedCount) {
      console.error('Mismatch before save', {
        uiAvailableCount: finalAllowedCount,
        finalAllowedCount,
        payloadUsers: payloadUserIds.size,
        selectedRules: debugInfo?.selectedRules,
        imtAllowedCount: debugInfo?.imtAllowedCount,
        ageAllowedCount: debugInfo?.ageAllowedCount,
      });

      const error = new Error(`Mismatch before save: final=${finalAllowedCount}, payload=${payloadUserIds.size}`);
      error.code = 'SEARCH_KEY_SET_PAYLOAD_MISMATCH';
      throw error;
    }

    console.log('WRITE PAYLOAD:', {
      setId: setKey,
      hasPayload: !!filteredSearchKeySet,
      fields: Object.keys(filteredSearchKeySet),
      payloadUsers: payloadUserIds.size,
      totalRecords: debugRecordsCount,
    });

    debug.backendRequests.push({
      type: 'set',
      path: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
      payload: filteredSearchKeySet,
    });
    debug.lastSetDebug = {
      ...(debugInfo || {}),
      filteredFields: Object.keys(filteredSearchKeySet || {}),
      finalAllowedCount,
      payloadUsers: payloadUserIds.size,
      payloadBuckets: debugBucketsCount,
      payloadRecords: debugRecordsCount,
      backendRequests: debug.backendRequests,
      setKey,
    };
    console.log('backendRequests:', debug.backendRequests);

    const writesCountForSet = debugBucketsCount;
    bucketWritesCount += writesCountForSet;
    console.info('[searchKeySets] Firebase write start', {
      path: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
      setKey,
      writesCount: writesCountForSet,
      payloadUsers: payloadUserIds.size,
      payloadRecords: debugRecordsCount,
    });
    // eslint-disable-next-line no-await-in-loop
    await set(ref(database, `${SEARCH_KEY_SETS_ROOT}/${setKey}`), filteredSearchKeySet);
    console.info('[searchKeySets] Firebase write success', {
      path: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
      setKey,
    });
  }

  const aggregatedUserIds = [
    ...new Set(
      debug.backendRequests
        .filter(item => item?.type === 'set')
        .flatMap(item => [...collectUniqueUserIds(item?.payload || {})])
    ),
  ];
  return {
    setKeys: [...nextSetKeys],
    userIds: aggregatedUserIds,
    ownerId: normalizedAccessUserId,
    writesCount: Object.keys(writes).length + nextSetPayloads.length,
    bucketWritesCount,
    debug,
  };
};

export const checkReactionNewUsersMembership = async ({
  candidateUserIds,
  searchKeySetKeys,
  debugMatchingFlow = false,
  debugToast,
}) => {
  const normalizedCandidateIds = [
    ...new Set(
      (Array.isArray(candidateUserIds) ? candidateUserIds : [...(candidateUserIds || [])])
        .map(userId => String(userId || '').trim())
        .filter(Boolean)
    ),
  ];
  const normalizedSetKeys = normalizeSearchKeySetKeys(searchKeySetKeys);
  const emitDebug = (message, data = {}) => {
    if (!debugMatchingFlow) return;

    console.info('[checkReactionNewUsersMembership]', message, data);
    if (typeof debugToast === 'function') {
      debugToast(`reactionMembership: ${message}`, data);
    }
  };

  if (!normalizedCandidateIds.length || !normalizedSetKeys.length) {
    emitDebug('skip empty input', {
      candidateCount: normalizedCandidateIds.length,
      setKeysCount: normalizedSetKeys.length,
    });
    return { userIds: [], setKeys: normalizedSetKeys, readPaths: [], checkedCount: 0 };
  }

  const allowedIds = new Set();
  const readPaths = [];
  const membershipChecks = [];

  normalizedSetKeys.forEach(setKey => {
    normalizedCandidateIds.forEach(candidateId => {
      if (allowedIds.has(candidateId)) return;
      const path = `${SEARCH_KEY_SETS_ROOT}/${setKey}/userId/id/${normalizePathSegment(candidateId)}`;
      readPaths.push(path);
      membershipChecks.push({ setKey, candidateId, path });
    });
  });

  emitDebug('start direct membership check', {
    candidateCount: normalizedCandidateIds.length,
    setKeysCount: normalizedSetKeys.length,
    plannedReads: membershipChecks.length,
  });

  const concurrency = 20;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, membershipChecks.length) }, async () => {
    while (cursor < membershipChecks.length) {
      const check = membershipChecks[cursor];
      cursor += 1;
      if (allowedIds.has(check.candidateId)) continue;

      try {
        // eslint-disable-next-line no-await-in-loop
        const payload = await getCachedSearchKeyPayload(check.path, async () => {
          const snapshot = await get(ref(database, check.path));
          return {
            exists: snapshot.exists(),
            value: snapshot.exists() ? snapshot.val() : null,
          };
        });
        if (payload?.exists) {
          allowedIds.add(check.candidateId);
        }
      } catch (error) {
        console.warn('[checkReactionNewUsersMembership] direct membership read failed; treating candidate as blocked', {
          path: check.path,
          setKey: check.setKey,
          candidateId: check.candidateId,
          error: error?.message || String(error),
        });
      }
    }
  });

  await Promise.all(workers);

  const userIds = normalizedCandidateIds.filter(candidateId => allowedIds.has(candidateId));
  emitDebug('direct membership result', {
    candidateCount: normalizedCandidateIds.length,
    allowedCount: userIds.length,
    blockedCount: normalizedCandidateIds.length - userIds.length,
    setKeysCount: normalizedSetKeys.length,
    readCount: readPaths.length,
  });

  return {
    userIds,
    setKeys: normalizedSetKeys,
    readPaths,
    checkedCount: membershipChecks.length,
  };
};

export const getIndexedNewUsersIdsByRules = async ({
  rawRules,
  accessUserId,
  searchKeySetKeys = [],
  searchKeySetsOfExactUser,
  fetchMissingBuckets = false,
  requireSearchKeySetKeys = true,
  resultOffset = 0,
  resultLimit = 100,
  additionalFilterBucketGroups = [],
  excludedUserIds = [],
  candidateUserIds = null,
  debugMatchingFlow = false,
  debugToast,
}) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  const emitDebug = (message, data = {}) => {
    if (!debugMatchingFlow) return;

    console.info('[getIndexedNewUsersIdsByRules][additionalNewUsers]', message, data);
    if (typeof debugToast === 'function') {
      debugToast(`getIndexed: ${message}`, data);
    }
  };

  const emitAccessScopeEmpty = (reason, data = {}) => {
    const payload = { reason, ...data };
    console.info('[searchKeySets][additionalNewUsers] access scope empty', payload);
    emitDebug('access scope empty', payload);
  };

  if (!normalizedAccessUserId) return null;

  const ownerPrefix = `${normalizedAccessUserId}${SET_KEY_INDEX_SEPARATOR}`;
  const rawExplicitSetKeys = normalizeSearchKeySetKeys(
    searchKeySetsOfExactUser !== undefined ? searchKeySetsOfExactUser : searchKeySetKeys
  );
  const invalidExplicitSetKeys = rawExplicitSetKeys.filter(setKey => !setKey.startsWith(ownerPrefix));
  const explicitSetKeys = rawExplicitSetKeys.filter(setKey => setKey.startsWith(ownerPrefix));
  if (invalidExplicitSetKeys.length > 0) {
    emitAccessScopeEmpty(INVALID_SETKEY_OWNER_PREFIX, {
      accessUserId: normalizedAccessUserId,
      ownerPrefix,
      invalidSetKeys: invalidExplicitSetKeys,
    });
  }
  emitDebug('normalized searchKeySetsOfExactUser', {
    accessUserId: normalizedAccessUserId,
    searchKeySetsOfExactUser: explicitSetKeys,
    invalidSetKeys: invalidExplicitSetKeys,
  });

  if (requireSearchKeySetKeys && explicitSetKeys.length === 0) {
    emitAccessScopeEmpty('no searchKeySets data', {
      accessUserId: normalizedAccessUserId,
      searchKeySetKeys: explicitSetKeys,
    });
    return {
      setKeys: [],
      userIds: [],
      ownerId: normalizedAccessUserId,
      nextOffset: Math.max(0, Number(resultOffset) || 0),
      hasMore: false,
      reason: 'no searchKeySets data',
    };
  }

  const ruleSetEntries = parseRawRulesToSetEntries(rawRules);
  const ruleBucketEntries = ruleSetEntries
    .map(({ text: setText, inputIndex }) => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(setText);
      if (!parsedRuleGroups.length) return null;

      const bucketMap = mergeSearchKeyBuckets(parsedRuleGroups);
      const { bucketMap: preparedBucketMap } = prepareAdditionalAccessBucketMapForSearchKey(bucketMap);
      const indexBuckets = Object.entries(preparedBucketMap || {}).reduce((acc, [indexName, rawValues]) => {
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

      const defaultSetKey = makeAdditionalRulesSetKey(setText, normalizedAccessUserId, inputIndex);
      if (!defaultSetKey && explicitSetKeys.length === 0) return null;
      return { defaultSetKey, inputIndex, indexBuckets };
    })
    .filter(Boolean);

  emitDebug('parsed rule buckets', {
    ruleSetCount: ruleSetEntries.length,
    bucketSetCount: ruleBucketEntries.length,
    ruleBuckets: ruleBucketEntries.map(entry => ({
      setKey: entry.defaultSetKey,
      inputIndex: entry.inputIndex,
      indexBuckets: entry.indexBuckets,
    })),
  });

  const setEntries = ruleBucketEntries.flatMap(entry => {
    const setKeys = explicitSetKeys.length
      ? explicitSetKeys.filter(setKey => getSearchKeySetInputIndex(setKey, normalizedAccessUserId) === entry.inputIndex)
      : [entry.defaultSetKey];

    return [...new Set(setKeys.filter(Boolean))].map(setKey => ({
      setKey,
      inputIndex: entry.inputIndex,
      indexBuckets: entry.indexBuckets,
      additionalFilterBucketGroups,
    }));
  });

  if (!setEntries.length) {
    emitAccessScopeEmpty('access scope empty', {
      accessUserId: normalizedAccessUserId,
      searchKeySetKeys: explicitSetKeys,
      ruleBucketEntriesCount: ruleBucketEntries.length,
    });
    emitDebug('final userIds before pagination', { userIds: [], count: 0 });
    emitDebug('returned userIds after pagination', { userIds: [], count: 0, offset: resultOffset, limit: resultLimit });
    return { setKeys: [], userIds: [], ownerId: normalizedAccessUserId };
  }

  const readBucketPayload = async path => {
    const cached = peekCachedSearchKeyPayload(path);
    if (cached && typeof cached.exists === 'boolean') {
      emitDebug('cache hit', { path, exists: cached.exists });
      return cached;
    }

    emitDebug('cache miss', { path });

    try {
      const payload = await getCachedSearchKeyPayload(path, async () => {
        const snapshot = await get(ref(database, path));
        return {
          exists: snapshot.exists(),
          value: snapshot.exists() ? snapshot.val() || {} : null,
        };
      });

      if (payload && typeof payload.exists === 'boolean') return payload;
      return { exists: false, value: null };
    } catch (error) {
      console.warn('[searchKeySets] Failed to read bucket; treating as empty without searchKey fallback', {
        path,
        fetchMissingBuckets,
        error,
      });
      emitDebug('Firebase bucket read error', {
        path,
        fetchMissingBuckets,
        error: error?.message || String(error),
      });
      return { exists: false, value: null };
    }
  };

  const readAgeRangePayload = async ({ setKey, startKey, endKey }) => {
    const basePath = `${SEARCH_KEY_SETS_ROOT}/${setKey}/age`;
    const rangeCachePath = `${basePath}|startAt=${startKey}|endAt=${endKey}`;
    const cached = peekCachedSearchKeyPayload(rangeCachePath);
    if (cached && typeof cached.exists === 'boolean') return cached;

    if (inFlightRangeQueries.has(rangeCachePath)) return inFlightRangeQueries.get(rangeCachePath);

    const promise = getCachedSearchKeyPayload(rangeCachePath, async () => {
      const ageRef = ref(database, basePath);
      const snapshot = await get(query(ageRef, orderByKey(), startAt(startKey), endAt(endKey)));
      return {
        exists: snapshot.exists(),
        value: snapshot.exists() ? snapshot.val() || {} : null,
      };
    }).finally(() => {
      inFlightRangeQueries.delete(rangeCachePath);
    });

    inFlightRangeQueries.set(rangeCachePath, promise);
    return promise;
  };

  const setsMap = {};
  const resultPaths = [];
  const matchedUserIds = new Set();
  const safeResultOffset = Math.max(0, Number(resultOffset) || 0);
  const numericResultLimit = Number(resultLimit);
  const safeResultLimit = Number.isFinite(numericResultLimit)
    ? Math.max(0, numericResultLimit)
    : 100;

  for (const entry of setEntries) {
    const filterSets = [];
    let existingBucketsForSet = 0;
    let emptyBucketsForSet = 0;
    let missingBucketsForSet = 0;

    const bucketGroups = [
      ...Object.entries(entry.indexBuckets).map(([indexName, values]) => ({ indexName, values })),
      ...(Array.isArray(entry.additionalFilterBucketGroups) ? entry.additionalFilterBucketGroups : []),
    ].filter(group => {
      if (group && typeof group === 'object' && Object.prototype.hasOwnProperty.call(group, 'groupActive')) {
        if (!group.groupActive || group.allSelected) {
          emitDebug('additionalMatching: indexed filter skipped because neutral/inactive', {
            setKey: entry.setKey,
            indexName: group?.indexName,
            groupName: group?.groupName || group?.indexName || '',
            selectedValues: Array.isArray(group?.selectedValues) ? group.selectedValues : [],
            allSelected: Boolean(group?.allSelected),
            groupActive: Boolean(group?.groupActive),
            source: group?.source || 'searchKeySets/keySet',
            reason: 'all options selected or group inactive',
          });
          return false;
        }
      }
      const normalizedValues = Array.isArray(group?.values) ? group.values.filter(Boolean) : [];
      if (normalizedValues.length > 0) return true;
      emitDebug('additionalMatching: indexed filter skipped because inactive', {
        setKey: entry.setKey,
        indexName: group?.indexName,
        groupName: group?.groupName || group?.indexName || '',
        selectedValues: Array.isArray(group?.selectedValues) ? group.selectedValues : [],
        allSelected: Boolean(group?.allSelected),
        groupActive: Boolean(group?.groupActive),
        source: group?.source || 'searchKeySets/keySet',
        stage: 'before_bucket_generation',
      });
      return false;
    });

    for (const { indexName, values } of bucketGroups) {
      const normalizedValues = Array.isArray(values) ? values.filter(Boolean) : [];
      const idsForFilter = new Set();
      const ageRange = indexName === 'age' ? getAgeRangeBounds(normalizedValues) : null;
      if (indexName === 'age' && !ageRange) {
        emitDebug('additionalMatching: age filter skipped because inactive', { setKey: entry.setKey });
        continue;
      }

      if (indexName === 'age' && ageRange) {
        const path = `${SEARCH_KEY_SETS_ROOT}/${entry.setKey}/age`;
        resultPaths.push(`${path}|startAt=${ageRange.startKey}|endAt=${ageRange.endKey}`);
        emitDebug('additionalMatching: age DOB range lookup', {
          setKey: entry.setKey,
          path,
          startAt: ageRange.startKey,
          endAt: ageRange.endKey,
        });
        // eslint-disable-next-line no-await-in-loop
        const queryStartAtMs = Date.now();
        const payload = await readAgeRangePayload({ setKey: entry.setKey, startKey: ageRange.startKey, endKey: ageRange.endKey });
        const queryDurationMs = Date.now() - queryStartAtMs;
        const flattenStartAtMs = Date.now();
        const rangeValue = payload?.exists && payload.value && typeof payload.value === 'object' ? payload.value : {};
        const dateBuckets = Object.entries(rangeValue);
        if (payload?.exists) existingBucketsForSet += 1; else missingBucketsForSet += 1;
        dateBuckets.forEach(([dateKey, bucket]) => {
          if (!setsMap[entry.setKey]) setsMap[entry.setKey] = {};
          if (!setsMap[entry.setKey].age) setsMap[entry.setKey].age = {};
          setsMap[entry.setKey].age[dateKey] = bucket;
          Object.keys(bucket || {}).forEach(userId => userId && idsForFilter.add(userId));
        });
        const flattenDurationMs = Date.now() - flattenStartAtMs;
        const idsBeforePreciseFilter = idsForFilter.size;
        if (idsBeforePreciseFilter > LARGE_AGE_RANGE_IDS_WARNING_THRESHOLD) {
          console.warn('additionalMatching: unusually large DOB range result', {
            setKey: entry.setKey,
            startAt: ageRange.startKey,
            endAt: ageRange.endKey,
            idsBeforePreciseFilter,
          });
        }
        emitDebug('additionalMatching: age DOB range lookup metrics', {
          setKey: entry.setKey,
          startAt: ageRange.startKey,
          endAt: ageRange.endKey,
          queryStartAt: queryStartAtMs,
          queryDurationMs,
          flattenDurationMs,
          preciseFilterDurationMs: null,
          idsBeforePreciseFilter,
          idsAfterPreciseFilter: null,
        });
      } else if (indexName === FIELD_COUNT_SEARCH_KEY_INDEX_NAME && hasFieldCountRangeBuckets(normalizedValues)) {
        const path = `${SEARCH_KEY_SETS_ROOT}/${entry.setKey}/${indexName}`;
        resultPaths.push(`${path}|fieldCountRanges=${normalizedValues.join(',')}`);
        emitDebug('additionalMatching: field-count range lookup', {
          setKey: entry.setKey,
          path,
          ranges: normalizedValues,
        });
        // eslint-disable-next-line no-await-in-loop
        const payload = await readBucketPayload(path);
        const fieldsIndexValue = payload?.exists && payload.value && typeof payload.value === 'object'
          ? payload.value
          : {};
        const fieldCountIds = collectFieldCountIdsFromIndexNode(fieldsIndexValue, normalizedValues);
        fieldCountIds.forEach(userId => idsForFilter.add(userId));

        if (payload?.exists) {
          existingBucketsForSet += 1;
          if (fieldCountIds.size === 0) emptyBucketsForSet += 1;
        } else {
          missingBucketsForSet += 1;
        }

        if (!setsMap[entry.setKey]) setsMap[entry.setKey] = {};
        setsMap[entry.setKey][indexName] = fieldsIndexValue;
      } else for (const value of normalizedValues) {
        const path = `${SEARCH_KEY_SETS_ROOT}/${entry.setKey}/${indexName}/${value}`;
        resultPaths.push(path);
        emitDebug('reading Firebase path', { path, setKey: entry.setKey, indexName, value });

        // eslint-disable-next-line no-await-in-loop
        const payload = await readBucketPayload(path);
        const bucketValue = payload?.exists && payload.value && typeof payload.value === 'object'
          ? payload.value
          : {};
        const bucketIdsCount = Object.keys(bucketValue).filter(Boolean).length;

        if (payload?.exists) {
          existingBucketsForSet += 1;
          if (bucketIdsCount === 0) emptyBucketsForSet += 1;
        } else {
          missingBucketsForSet += 1;
        }

        if (!setsMap[entry.setKey]) setsMap[entry.setKey] = {};
        if (!setsMap[entry.setKey][indexName]) setsMap[entry.setKey][indexName] = {};
        setsMap[entry.setKey][indexName][value] = bucketValue;

        Object.keys(bucketValue).sort((a, b) => a.localeCompare(b)).forEach(userId => { if (userId) idsForFilter.add(userId); });
      }

      // OR between bucket values for the same indexName, AND between different indexName fields.
      filterSets.push(idsForFilter);
    }

    if (!filterSets.length || filterSets.some(set => set.size === 0)) {
      // Empty or missing searchKeySets buckets mean this rule set allows no cards.
      // Do not fallback to searchKey/searchKeyFile/newUsers scans.
      const reason = existingBucketsForSet === 0
        ? 'missing setKey'
        : emptyBucketsForSet > 0 || missingBucketsForSet > 0
          ? 'empty bucket'
          : 'access scope empty';
      emitAccessScopeEmpty(reason, {
        setKey: entry.setKey,
        existingBuckets: existingBucketsForSet,
        emptyBuckets: emptyBucketsForSet,
        missingBuckets: missingBucketsForSet,
        filters: filterSets.map(set => set.size),
      });
      continue;
    }

    const [firstSet, ...restSets] = [...filterSets].sort((a, b) => a.size - b.size);
    [...firstSet]
      .sort((a, b) => a.localeCompare(b))
      .forEach(userId => {
        if (restSets.every(set => set.has(userId))) matchedUserIds.add(userId);
      });
  }

  const candidateUserIdsSet = Array.isArray(candidateUserIds) || candidateUserIds instanceof Set
    ? new Set((Array.isArray(candidateUserIds) ? candidateUserIds : [...candidateUserIds]).filter(Boolean))
    : null;

  if (candidateUserIdsSet?.size > 0 && explicitSetKeys.length > 0) {
    const missingCandidateIds = new Set([...candidateUserIdsSet].filter(userId => !matchedUserIds.has(userId)));
    const membershipPaths = [];

    for (const setKey of explicitSetKeys) {
      if (missingCandidateIds.size === 0) break;

      const cachedUserIdBucket = setsMap?.[setKey]?.userId?.id;
      const membershipBucket = cachedUserIdBucket && typeof cachedUserIdBucket === 'object'
        ? cachedUserIdBucket
        : null;
      let bucketValue = membershipBucket;

      if (!bucketValue) {
        const path = `${SEARCH_KEY_SETS_ROOT}/${setKey}/userId/id`;
        membershipPaths.push(path);
        resultPaths.push(path);
        emitDebug('reading candidate membership path', { path, setKey, candidateCount: missingCandidateIds.size });

        // eslint-disable-next-line no-await-in-loop
        const payload = await readBucketPayload(path);
        bucketValue = payload?.exists && payload.value && typeof payload.value === 'object'
          ? payload.value
          : {};

        if (!setsMap[setKey]) setsMap[setKey] = {};
        if (!setsMap[setKey].userId) setsMap[setKey].userId = {};
        setsMap[setKey].userId.id = bucketValue;
      }

      [...missingCandidateIds].forEach(userId => {
        if (!Object.prototype.hasOwnProperty.call(bucketValue || {}, userId)) return;
        matchedUserIds.add(userId);
        missingCandidateIds.delete(userId);
      });

      if (missingCandidateIds.size > 0) {
        emitDebug('skipping candidate membership root fallback', {
          setKey,
          candidateCount: missingCandidateIds.size,
          skippedPath: `${SEARCH_KEY_SETS_ROOT}/${setKey}`,
        });
      }
    }

    emitDebug('candidate membership result', {
      candidateCount: candidateUserIdsSet.size,
      matchedCandidateCount: [...candidateUserIdsSet].filter(userId => matchedUserIds.has(userId)).length,
      missingCandidateIds: [...missingCandidateIds],
      membershipPaths,
    });
  }

  if (matchedUserIds.size === 0) {
    emitAccessScopeEmpty('access scope empty', {
      accessUserId: normalizedAccessUserId,
      setKeys: setEntries.map(entry => entry.setKey),
      readPaths: resultPaths,
    });
  }

  const excludedUserIdsSet = new Set((Array.isArray(excludedUserIds) ? excludedUserIds : [...(excludedUserIds || [])]).filter(Boolean));
  const finalUserIds = [...matchedUserIds].filter(userId => (
    !excludedUserIdsSet.has(userId) && (!candidateUserIdsSet || candidateUserIdsSet.has(userId))
  ));
  emitDebug('final userIds before pagination', {
    userIds: finalUserIds,
    count: finalUserIds.length,
    excludedCount: excludedUserIdsSet.size,
    candidateCount: candidateUserIdsSet?.size || 0,
  });

  const pageUserIds = finalUserIds.slice(
    safeResultOffset,
    safeResultOffset + safeResultLimit
  );
  const nextOffset = safeResultOffset + pageUserIds.length;
  const hasMore = nextOffset < finalUserIds.length;

  emitDebug('returned userIds after pagination', {
    userIds: pageUserIds,
    count: pageUserIds.length,
    offset: safeResultOffset,
    limit: safeResultLimit,
    nextOffset,
    hasMore,
  });

  saveCachedAdditionalRulesSetIndex({
    rawRules,
    accessUserId: normalizedAccessUserId,
    setsMap,
  });

  return {
    setKeys: resultPaths,
    userIds: pageUserIds,
    ownerId: normalizedAccessUserId,
    nextOffset,
    hasMore,
  };
};

const getMatchedUserIdsFromSearchKey = async parsedRuleGroups => {
  const groups = Array.isArray(parsedRuleGroups) ? parsedRuleGroups : [parsedRuleGroups];
  const matchedIds = new Set();

  for (const parsedRules of groups) {
    const { bucketMap, hasImtFilter, imtValues } = prepareAdditionalAccessBucketMapForSearchKey(
      resolveAdditionalAccessSearchKeyBuckets(parsedRules)
    );
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
      if (!normalizedSets.length) {
        const metricUserIds = new Set([
          ...Object.keys(heightByUserId || {}),
          ...Object.keys(weightByUserId || {}),
        ]);
        groupMatchedIds = [...metricUserIds];
      }
      groupMatchedIds = groupMatchedIds.filter(userId => {
        const imtBuckets = resolveImtTokensFromExactMetrics(heightByUserId[userId], weightByUserId[userId]);
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
