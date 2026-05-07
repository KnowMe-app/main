export const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

export const getSubmittedSearchIndexKeys = (indexedKeys = [], nextData = {}) =>
  indexedKeys.filter(key => hasOwn(nextData, key));
