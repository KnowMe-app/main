import { createCache } from 'hooks/cardsCache';

const { loadCache, saveCache } = createCache('searchKey');

const normalizePath = path =>
  String(path || '')
    .trim()
    .replace(/^\/+/, '');

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
