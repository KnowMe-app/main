import { createCache } from 'hooks/cardsCache';

const { loadCache, saveCache } = createCache('searchKey');

const normalizePath = path =>
  String(path || '')
    .trim()
    .replace(/^\/+/, '');


export const peekCachedSearchKeyPayload = path => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return null;

  const cached = loadCache(normalizedPath);
  if (cached && typeof cached.exists === 'boolean') {
    return cached;
  }

  return null;
};

export const getCachedSearchKeyPayload = async (path, loader) => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath || typeof loader !== 'function') return null;

  const cached = loadCache(normalizedPath);
  if (cached && typeof cached.exists === 'boolean') {
    return cached;
  }

  const loaded = await loader();
  if (!loaded || typeof loaded.exists !== 'boolean') return null;

  saveCache(normalizedPath, loaded);
  return loaded;
};

const normalizeRulesText = rawRules =>
  String(rawRules || '')
    .replace(/\r\n/g, '\n')
    .trim();

export const buildAdditionalRulesCacheKey = ({ rawRules, accessUserId }) => {
  const normalizedRules = normalizeRulesText(rawRules);
  const normalizedAccessUserId = String(accessUserId || '').trim() || 'anonymous';
  if (!normalizedRules) return null;
  return `additionalRulesPreview:${normalizedAccessUserId}:${encodeURIComponent(normalizedRules)}`;
};

export const getCachedAdditionalRulesPreview = ({ rawRules, accessUserId }) => {
  const cacheKey = buildAdditionalRulesCacheKey({ rawRules, accessUserId });
  if (!cacheKey) return null;
  const cached = loadCache(cacheKey);
  if (!cached || typeof cached !== 'object') return null;

  const userIds = Array.isArray(cached.userIds) ? cached.userIds.filter(Boolean) : [];
  const count = Number.isFinite(cached.count) ? cached.count : userIds.length;
  return {
    count,
    userIds,
  };
};

export const saveCachedAdditionalRulesPreview = ({ rawRules, accessUserId, count, userIds }) => {
  const cacheKey = buildAdditionalRulesCacheKey({ rawRules, accessUserId });
  if (!cacheKey) return;

  const normalizedIds = Array.isArray(userIds) ? [...new Set(userIds.filter(Boolean))] : [];
  const normalizedCount = Number.isFinite(count) ? count : normalizedIds.length;

  saveCache(cacheKey, {
    count: normalizedCount,
    userIds: normalizedIds,
  });
};

export const buildAdditionalRulesSetIndexCacheKey = ({ rawRules, accessUserId }) => {
  const normalizedRules = normalizeRulesText(rawRules);
  const normalizedAccessUserId = String(accessUserId || '').trim() || 'anonymous';
  if (!normalizedRules) return null;
  return `additionalRulesSetIndex:${normalizedAccessUserId}:${encodeURIComponent(normalizedRules)}`;
};

export const getCachedAdditionalRulesSetIndex = ({ rawRules, accessUserId }) => {
  const cacheKey = buildAdditionalRulesSetIndexCacheKey({ rawRules, accessUserId });
  if (!cacheKey) return null;

  const cached = loadCache(cacheKey);
  if (!cached || typeof cached !== 'object') return null;
  return cached;
};

export const saveCachedAdditionalRulesSetIndex = ({ rawRules, accessUserId, setsMap }) => {
  const cacheKey = buildAdditionalRulesSetIndexCacheKey({ rawRules, accessUserId });
  if (!cacheKey) return;

  if (!setsMap || typeof setsMap !== 'object' || Array.isArray(setsMap)) return;
  if (Object.keys(setsMap).length === 0) return;
  saveCache(cacheKey, setsMap);
};
