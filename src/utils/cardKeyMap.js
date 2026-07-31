const isObject = value => value !== null && typeof value === 'object';

const collectPaths = (value, paths, parentPath = '') => {
  if (Array.isArray(value)) {
    if (parentPath) paths.add(parentPath);
    value.forEach(item => collectPaths(item, paths, parentPath ? `${parentPath}[]` : '[]'));
    return;
  }

  if (!isObject(value)) return;

  Object.entries(value).forEach(([key, nestedValue]) => {
    const path = parentPath ? `${parentPath}.${key}` : key;
    paths.add(path);
    collectPaths(nestedValue, paths, path);
  });
};

// Builds one schema catalogue from every card in the supplied collections.
// Per-collection lists make it possible to see where a field was discovered,
// while `keys` is the complete potential-user map across all sources.
export const buildFullCardKeyMap = (collections = {}) => {
  const allPaths = new Set();
  const keysByCollection = {};
  const cardsByCollection = {};

  Object.entries(collections).forEach(([collectionName, collection]) => {
    if (!isObject(collection)) return;

    const collectionPaths = new Set();
    const cards = Object.values(collection);
    cards.forEach(card => collectPaths(card, collectionPaths));
    collectionPaths.forEach(path => allPaths.add(path));

    keysByCollection[collectionName] = Array.from(collectionPaths).sort((a, b) => a.localeCompare(b, 'uk'));
    cardsByCollection[collectionName] = cards.length;
  });

  return {
    totalCards: Object.values(cardsByCollection).reduce((total, count) => total + count, 0),
    totalKeys: allPaths.size,
    cardsByCollection,
    keysByCollection,
    keys: Array.from(allPaths).sort((a, b) => a.localeCompare(b, 'uk')),
  };
};
