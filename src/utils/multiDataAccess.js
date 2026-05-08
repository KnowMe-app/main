export const MULTI_DATA_ACCESS_FIELD = 'multiDataAccessUserIds';

export const parseMultiDataAccessUserIds = value => {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => enabled !== false && enabled !== null && enabled !== undefined)
      .map(([key, item]) => {
        const objectValue = typeof item === 'string' ? item : key;
        return String(objectValue || '').trim();
      })
      .filter(Boolean);
  }

  return String(value || '')
    .split(/[\s,;]+/)
    .map(item => item.trim())
    .filter(Boolean);
};

export const resolveMatchingMultiDataOwnerIds = ({ viewerId, profile } = {}) => {
  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) return [];

  const accessIds = parseMultiDataAccessUserIds(profile?.[MULTI_DATA_ACCESS_FIELD]);
  return [...new Set([normalizedViewerId, ...accessIds].filter(Boolean))];
};
