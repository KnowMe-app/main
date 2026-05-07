export const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const getExplicitlyDeletedKeys = deletedKeys => {
  if (!deletedKeys) return [];

  if (Array.isArray(deletedKeys)) {
    return deletedKeys;
  }

  if (typeof deletedKeys === 'object') {
    return Object.keys(deletedKeys);
  }

  return [];
};

export const getSubmittedSearchIndexKeys = (indexedKeys = [], nextData = {}, deletedKeys = []) => {
  const explicitlyDeletedKeys = new Set(getExplicitlyDeletedKeys(deletedKeys));

  return indexedKeys.filter(key => hasOwn(nextData, key) || explicitlyDeletedKeys.has(key));
};
