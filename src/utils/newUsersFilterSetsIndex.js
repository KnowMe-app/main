import { endAt, get, orderByKey, query, ref, remove, startAt, update } from 'firebase/database';
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
  getCachedSearchKeyPayload,
  saveCachedAdditionalRulesSetIndex,
} from './searchKeyCache';

export const SEARCH_KEY_SETS_ROOT = 'searchKeySets';
const SET_KEY_INDEX_SEPARATOR = '_';
const FORBIDDEN_RTDB_SEGMENT_CHARS = ['.', '#', '$', '/', '[', ']'];
const AGE_INDEX_NAME = 'age';
const AGE_DATE_PREFIX = 'd_';

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

const toIsoDate = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const subtractYears = (date, years) => {
  const shifted = new Date(date);
  shifted.setFullYear(shifted.getFullYear() - years);
  return shifted;
};

const shiftDays = (date, days) => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
};

const getBirthDateRangeByAge = ({ minAge, maxAge, today = new Date() }) => {
  let startDate = null;
  let endDate = null;

  if (Number.isFinite(maxAge)) {
    startDate = shiftDays(subtractYears(today, maxAge + 1), 1);
  }
  if (Number.isFinite(minAge)) {
    endDate = subtractYears(today, minAge);
  }

  if (!startDate) startDate = new Date(1900, 0, 1);
  if (!endDate) endDate = today;
  if (startDate > endDate) return null;

  return {
    startKey: `${AGE_DATE_PREFIX}${toIsoDate(startDate)}`,
    endKey: `${AGE_DATE_PREFIX}${toIsoDate(endDate)}`,
  };
};

const buildAgeRangeDescriptors = parsedRuleGroups => {
  const rules = Array.isArray(parsedRuleGroups) ? parsedRuleGroups : [];
  const descriptors = [];

  rules.forEach(parsedRules => {
    if (!parsedRules || typeof parsedRules !== 'object') return;

    if (parsedRules.age instanceof Set && parsedRules.age.size > 0) {
      [...parsedRules.age]
        .filter(age => Number.isFinite(age) && age >= 18)
        .forEach(age => descriptors.push({ minAge: age, maxAge: age }));
    }

    if (parsedRules.age42plus) descriptors.push({ minAge: 42 });
    if (parsedRules.ageUnknown) descriptors.push({ token: '?' });
    if (parsedRules.ageNo) descriptors.push({ token: 'no' });
  });

  return descriptors;
};

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
  matchedUserIdsBySetKey = null,
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
  accessUserId,
  matchedUserIdsBySetKey = null,
}) => {
  const normalizedAccessUserId = String(accessUserId || '').trim();
  if (!normalizedAccessUserId) return null;

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

    const rootPath = `${SEARCH_KEY_SETS_ROOT}/${setKey}`;
    const ruleBucketWrites = buildRuleBucketWrites({
      rootPath,
      parsedRuleGroups,
      userIds: Object.keys(userIds || {}),
    });

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

  const cachedIndexedSet = getCachedAdditionalRulesSetIndex({
    rawRules,
    accessUserId: normalizedAccessUserId,
  });

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
      return { setKey, paths, indexBuckets, parsedRuleGroups };
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
      // ignore malformed or incomplete cache and fallback to backend
    }
  }

  const payloadsBySet = await Promise.all(
    setEntries.map(async entry => {
      const payloads = await Promise.all(
        entry.paths.map(path =>
          getCachedSearchKeyPayload(path, async () => {
            const snapshot = await get(ref(database, path));
            return {
              exists: snapshot.exists(),
              value: snapshot.exists() ? snapshot.val() || {} : null,
            };
          })
        )
      );
      return { setKey: entry.setKey, paths: entry.paths, payloads };
    })
  );

  const hasMissingSetPayloads = payloadsBySet.some(item => item.payloads.some(payload => !payload?.exists));
  if (hasMissingSetPayloads) {
    const fallbackSearchKeyPayloads = await Promise.all(
      setEntries.map(async entry => {
        const ageRangeDescriptors = buildAgeRangeDescriptors(entry.parsedRuleGroups);
        const genericPaths = Object.entries(entry.indexBuckets)
          .filter(([indexName]) => indexName !== AGE_INDEX_NAME)
          .flatMap(([indexName, values]) => values.map(value => `searchKey/${indexName}/${value}`));
        const ageTokenPaths = ageRangeDescriptors
          .filter(descriptor => descriptor.token === '?' || descriptor.token === 'no')
          .map(descriptor => `searchKey/${AGE_INDEX_NAME}/${descriptor.token}`);

        const paths = [...new Set([...genericPaths, ...ageTokenPaths])];
        const ageRanges = ageRangeDescriptors
          .filter(descriptor => Number.isFinite(descriptor.minAge) || Number.isFinite(descriptor.maxAge))
          .map(descriptor => getBirthDateRangeByAge(descriptor))
          .filter(Boolean);
        const uniqueAgeRanges = [...new Map(
          ageRanges.map(range => [`${range.startKey}_${range.endKey}`, range])
        ).values()];

        const pathPayloads = await Promise.all(
          paths.map(path =>
            getCachedSearchKeyPayload(path, async () => {
              const snapshot = await get(ref(database, path));
              return {
                exists: snapshot.exists(),
                value: snapshot.exists() ? snapshot.val() || {} : null,
              };
            })
          )
        );
        const rangePayloads = await Promise.all(
          uniqueAgeRanges.map(async range => {
            const cachePath = `searchKey/${AGE_INDEX_NAME}/__range__/${range.startKey}_${range.endKey}`;
            const payload = await getCachedSearchKeyPayload(cachePath, async () => {
              const snapshot = await get(
                query(ref(database, `searchKey/${AGE_INDEX_NAME}`), orderByKey(), startAt(range.startKey), endAt(range.endKey))
              );
              return {
                exists: snapshot.exists(),
                value: snapshot.exists() ? snapshot.val() || {} : null,
              };
            });
            return { ...range, payload };
          })
        );
        return { paths, pathPayloads, rangePayloads };
      })
    );

    const indexNames = [...new Set(setEntries.flatMap(entry => Object.keys(entry.indexBuckets || {})))];
    const indexRootPayloads = await Promise.all(
      indexNames.map(indexName =>
        getCachedSearchKeyPayload(`searchKey/${indexName}`, async () => {
          const snapshot = await get(ref(database, `searchKey/${indexName}`));
          return {
            exists: snapshot.exists(),
            value: snapshot.exists() ? snapshot.val() || {} : null,
          };
        })
      )
    );
    const hasMissingIndexRoot = indexRootPayloads.some(payload => !payload?.exists);
    if (hasMissingIndexRoot) {
      return null;
    }

    const userIds = new Set();
    fallbackSearchKeyPayloads.forEach(item => {
      item.pathPayloads.forEach(payload => {
        Object.keys(payload?.value || {}).forEach(userId => {
          if (userId) userIds.add(userId);
        });
      });
      item.rangePayloads.forEach(rangePayload => {
        Object.values(rangePayload?.payload?.value || {}).forEach(bucketMap => {
          if (!bucketMap || typeof bucketMap !== 'object') return;
          Object.keys(bucketMap).forEach(userId => {
            if (userId) userIds.add(userId);
          });
        });
      });
    });

    return {
      setKeys: fallbackSearchKeyPayloads.flatMap(item => [
        ...item.paths,
        ...item.rangePayloads.map(rangePayload => `searchKey/${AGE_INDEX_NAME}/${rangePayload.startKey}..${rangePayload.endKey}`),
      ]),
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
  const bucketMap = resolveAdditionalAccessSearchKeyBuckets(parsedRuleGroups);
  const paths = Object.entries(bucketMap || {}).flatMap(([indexName, rawValues]) => {
    const normalizedIndexName = normalizePathSegment(indexName);
    if (!normalizedIndexName) return [];

    const values = [
      ...new Set(
        (Array.isArray(rawValues) ? rawValues : [...(rawValues || [])])
          .map(normalizePathSegment)
          .filter(Boolean)
      ),
    ];
    return values.map(value => `searchKey/${normalizedIndexName}/${value}`);
  });

  if (!paths.length) return [];

  const snapshots = await Promise.all(
    paths.map(path =>
      getCachedSearchKeyPayload(path, async () => {
        const snapshot = await get(ref(database, path));
        return {
          exists: snapshot.exists(),
          value: snapshot.exists() ? snapshot.val() || {} : null,
        };
      })
    )
  );

  const ids = new Set();
  snapshots.forEach(payload => {
    if (!payload?.exists || !payload.value || typeof payload.value !== 'object') return;
    Object.keys(payload.value).forEach(userId => {
      if (userId) ids.add(userId);
    });
  });
  return [...ids];
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
