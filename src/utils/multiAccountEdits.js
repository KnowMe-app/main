const isStringLike = value =>
  typeof value === 'string' || value === null || value === undefined;

const normalizeString = value => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
};

const normalizeArray = value => {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item !== undefined && item !== null);
};

export const buildFieldEdit = (fromValue, toValue) => {
  if (Array.isArray(fromValue) || Array.isArray(toValue)) {
    const fromArr = normalizeArray(fromValue);
    const toArr = normalizeArray(toValue);

    const fromSet = new Set(fromArr);
    const toSet = new Set(toArr);

    const added = toArr.filter(item => !fromSet.has(item));
    const removed = fromArr.filter(item => !toSet.has(item));

    if (!added.length && !removed.length) return null;

    const payload = {};
    if (added.length) payload.added = added;
    if (removed.length) payload.removed = removed;
    return payload;
  }

  if (!isStringLike(fromValue) && !isStringLike(toValue)) {
    return null;
  }

  const from = normalizeString(fromValue);
  const to = normalizeString(toValue);

  if (from === to) return null;

  return { from, to };
};

export const buildEditsOverlay = (mainCard = {}, updatedCard = {}) => {
  const fields = {};
  const keys = new Set([...Object.keys(mainCard || {}), ...Object.keys(updatedCard || {})]);

  keys.forEach(fieldName => {
    if (fieldName === 'userId') return;
    const fieldEdit = buildFieldEdit(mainCard[fieldName], updatedCard[fieldName]);
    if (fieldEdit) {
      fields[fieldName] = fieldEdit;
    }
  });

  return fields;
};

export const applyEditsOverlayToCard = (mainCard = {}, overlayFields = {}) => {
  const merged = { ...mainCard };

  Object.entries(overlayFields || {}).forEach(([fieldName, change]) => {
    if (!change || typeof change !== 'object') return;

    if (Object.prototype.hasOwnProperty.call(change, 'to')) {
      merged[fieldName] = change.to;
      return;
    }

    if (Object.prototype.hasOwnProperty.call(change, 'added') || Object.prototype.hasOwnProperty.call(change, 'removed')) {
      const mainArr = normalizeArray(mainCard[fieldName]);
      const removed = new Set(normalizeArray(change.removed));
      const added = normalizeArray(change.added);

      const base = mainArr.filter(item => !removed.has(item));
      const baseSet = new Set(base);
      added.forEach(item => {
        if (!baseSet.has(item)) {
          base.push(item);
          baseSet.add(item);
        }
      });

      merged[fieldName] = base;
    }
  });

  return merged;
};
