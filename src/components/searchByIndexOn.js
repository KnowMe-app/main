const normalizeIndexOnList = rawIndexes => {
  if (!rawIndexes) return [];

  const fields = new Set();

  if (Array.isArray(rawIndexes)) {
    rawIndexes.forEach(field => {
      if (typeof field === 'string') {
        const trimmed = field.trim();
        if (trimmed) fields.add(trimmed);
      }
    });
  } else if (typeof rawIndexes === 'string') {
    rawIndexes
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .forEach(item => fields.add(item));
  } else if (typeof rawIndexes === 'object') {
    Object.entries(rawIndexes).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) fields.add(trimmed);
      } else if (value) {
        fields.add(key);
      }
    });
  }

  return [...fields];
};

const getValueForPath = (data, path) => {
  if (!path) return undefined;
  return path.split('/').reduce((acc, segment) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[segment];
  }, data);
};

const valueMatchesSearchTerm = (value, normalizedTerm) => {
  if (value === null || value === undefined) return false;

  if (typeof value === 'string') {
    return value.trim().toLowerCase().includes(normalizedTerm);
  }

  if (typeof value === 'number') {
    return String(value).toLowerCase().includes(normalizedTerm);
  }

  if (Array.isArray(value)) {
    return value.some(item => valueMatchesSearchTerm(item, normalizedTerm));
  }

  if (typeof value === 'object') {
    return Object.values(value).some(item => valueMatchesSearchTerm(item, normalizedTerm));
  }

  return false;
};

const formatSearchForIndexedField = (fieldPath, searchValue) => {
  if (typeof searchValue !== 'string') return null;
  const trimmedSearch = searchValue.trim();
  if (!trimmedSearch) return null;

  const fieldName = fieldPath.includes('/') ? fieldPath.split('/').pop() : fieldPath;

  if (fieldName === 'name' || fieldName === 'surname') {
    return trimmedSearch.charAt(0).toUpperCase() + trimmedSearch.slice(1).toLowerCase();
  }

  return trimmedSearch.toLowerCase();
};

export const searchByIndexOn = async ({
  searchValue,
  uniqueUserIds,
  users,
  searchCollections,
  database,
  addUserToResults,
  isDev = false,
  ref2,
  get,
  query,
  orderByChild,
  startAt,
  endAt,
}) => {
  if (typeof searchValue !== 'string') return;
  const trimmedSearch = searchValue.trim();
  if (!trimmedSearch) return;

  const normalizedTerm = trimmedSearch.toLowerCase();

  for (const collection of searchCollections) {
    let indexedFields = [];

    try {
      const indexRef = ref2(database, `indexOn/${collection}`);
      const indexSnapshot = await get(indexRef);
      if (!indexSnapshot.exists()) continue;
      indexedFields = normalizeIndexOnList(indexSnapshot.val());
    } catch (error) {
      if (isDev) console.error(`searchByIndexOn → failed to load index metadata for ${collection}:`, error);
      continue;
    }

    if (indexedFields.length === 0) continue;

    const searchPromises = indexedFields.map(async fieldPath => {
      const formattedSearchValue = formatSearchForIndexedField(fieldPath, trimmedSearch);
      if (!formattedSearchValue) return;

      try {
        const snapshot = await get(
          query(
            ref2(database, collection),
            orderByChild(fieldPath),
            startAt(formattedSearchValue),
            endAt(`${formattedSearchValue}\uf8ff`)
          )
        );

        if (!snapshot.exists()) return;

        const promises = [];

        snapshot.forEach(userSnapshot => {
          const userId = userSnapshot.key;
          if (uniqueUserIds.has(userId)) return;

          const candidateValue = getValueForPath(userSnapshot.val(), fieldPath);
          if (!valueMatchesSearchTerm(candidateValue, normalizedTerm)) return;

          uniqueUserIds.add(userId);
          promises.push(addUserToResults(userId, users));
        });

        await Promise.all(promises);
      } catch (error) {
        if (isDev) console.error(`searchByIndexOn → error querying ${collection}.${fieldPath}:`, error);
      }
    });

    await Promise.all(searchPromises);
  }
};
