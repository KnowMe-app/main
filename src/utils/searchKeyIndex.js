const EXCLUDED_FIELD_NAMES = new Set(['age']);

const isDateLikeField = fieldName => /date|birth|login|action/i.test(fieldName || '');

const sanitizeIndexToken = value =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.#$[\]/]/g, '_');

const normalizeDateValue = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const ddmmyyyy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const iso = new Date(trimmed);
  if (!Number.isNaN(iso.getTime())) {
    return iso.toISOString().slice(0, 10);
  }

  return null;
};

const normalizeFieldValue = (fieldName, value) => {
  if (value === undefined || value === null) return null;

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (isDateLikeField(fieldName)) {
    const normalizedDate = normalizeDateValue(value);
    if (normalizedDate) return normalizedDate;
  }

  const normalized = sanitizeIndexToken(value);
  return normalized || null;
};

const normalizeIndexName = pathParts =>
  pathParts
    .join('_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const collectFieldEntries = (value, path = [], entries = []) => {
  if (value === undefined || value === null) return entries;

  if (Array.isArray(value)) {
    value.forEach(item => collectFieldEntries(item, path, entries));
    return entries;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, nestedValue]) => {
      if (EXCLUDED_FIELD_NAMES.has(key)) return;
      collectFieldEntries(nestedValue, [...path, key], entries);
    });
    return entries;
  }

  const indexName = normalizeIndexName(path);
  if (!indexName || EXCLUDED_FIELD_NAMES.has(indexName)) return entries;

  const normalizedValue = normalizeFieldValue(path[path.length - 1], value);
  if (!normalizedValue) return entries;

  entries.push({ indexName, value: normalizedValue });
  return entries;
};

const getSingleIndexMap = card => {
  const entries = collectFieldEntries(card);
  const map = {};

  entries.forEach(entry => {
    if (!map[entry.indexName]) {
      map[entry.indexName] = new Set();
    }
    map[entry.indexName].add(entry.value);
  });

  return map;
};

export const buildSearchKeys = card => {
  const singleIndexMap = getSingleIndexMap(card || {});
  const result = {};

  Object.entries(singleIndexMap).forEach(([indexName, values]) => {
    result[indexName] = [...values];
  });

  return result;
};

const indexMapToPathSet = (userId, indexMap) => {
  const pathSet = new Set();

  Object.entries(indexMap).forEach(([indexName, values]) => {
    values.forEach(value => {
      pathSet.add(`searchKey/${indexName}/${value}/${userId}`);
    });
  });

  return pathSet;
};

export const buildUpdateMap = (userId, newData, oldData = {}) => {
  if (!userId) {
    return {};
  }

  const nextPathSet = indexMapToPathSet(userId, buildSearchKeys(newData || {}));
  const prevPathSet = indexMapToPathSet(userId, buildSearchKeys(oldData || {}));

  const updates = {};

  prevPathSet.forEach(path => {
    if (!nextPathSet.has(path)) {
      updates[path] = null;
    }
  });

  nextPathSet.forEach(path => {
    updates[path] = true;
  });

  return updates;
};
