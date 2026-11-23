export const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);

export const normalizeArray = value => {
  if (Array.isArray(value)) {
    // Empty rows are a form affordance, not card data. A cleared value is
    // represented by `removed` against the canonical array and preserved in
    // editsHistory, rather than by adding an empty historical value.
    return value.filter(item => item !== undefined && item !== null && item !== '');
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
};

export const uniq = values => Array.from(new Set(values));

const shouldSkipField = key => key === 'userId' || key === 'photos';

export const buildOverlayFromDraft = (canonical, draft) => {
  if (!draft || typeof draft !== 'object') return {};

  const overlayFields = {};
  const keys = new Set([...Object.keys(canonical || {}), ...Object.keys(draft || {})]);

  keys.forEach(key => {
    if (shouldSkipField(key)) return;

    const mainValue = canonical?.[key];
    const draftValue = draft?.[key];

    if (Array.isArray(mainValue) || Array.isArray(draftValue)) {
      const mainArray = uniq(normalizeArray(mainValue));
      const draftArray = uniq(normalizeArray(draftValue));
      const added = draftArray.filter(item => !mainArray.includes(item));
      const removed = mainArray.filter(item => !draftArray.includes(item));
      if (added.length || removed.length) {
        overlayFields[key] = {
          ...(added.length ? { added } : {}),
          ...(removed.length ? { removed } : {}),
        };
      }
      return;
    }

    const safeMain = mainValue ?? '';
    const safeDraft = draftValue ?? '';

    if (safeMain !== safeDraft) {
      overlayFields[key] = { from: safeMain, to: safeDraft };
    }
  });

  return overlayFields;
};

// Older overlays were written with `add` where the current shape uses
// `added`. Normalizing here keeps every reader (stacking, previews, accept)
// working off one shape instead of each re-implementing the alias.
export const normalizeOverlayFields = fields => {
  if (!isPlainObject(fields)) return {};

  return Object.entries(fields).reduce((acc, [fieldName, change]) => {
    if (!isPlainObject(change)) return acc;

    if ('add' in change && !('added' in change)) {
      const { add, ...rest } = change;
      acc[fieldName] = { ...rest, added: add };
      return acc;
    }

    // Заміна, у якої хоч один бік — список (так шар писали до розкладу
    // масивів на `added`/`removed`), — це різниця двох наборів. Інакше
    // `String(['A', 'B'])` давав одну пропозицію «A,B»: адмін бачив два номери
    // склеєними в одному полі, а «ОК» записав би їх в анкету одним рядком.
    if (('to' in change || 'from' in change) && (Array.isArray(change.to) || Array.isArray(change.from))) {
      const toItems = uniq(normalizeArray(change.to).map(item => String(item ?? '').trim()).filter(Boolean));
      const fromItems = uniq(normalizeArray(change.from).map(item => String(item ?? '').trim()).filter(Boolean));
      const added = toItems.filter(item => !fromItems.includes(item));
      const removed = fromItems.filter(item => !toItems.includes(item));
      if (!added.length && !removed.length) return acc;
      acc[fieldName] = {
        ...(added.length ? { added } : {}),
        ...(removed.length ? { removed } : {}),
      };
      return acc;
    }

    acc[fieldName] = change;
    return acc;
  }, {});
};

export const applyOverlayToCard = (canonical, overlayFields = {}) => {
  const merged = { ...(canonical || {}) };

  Object.entries(normalizeOverlayFields(overlayFields)).forEach(([fieldName, change]) => {
    if (!isPlainObject(change)) return;

    if ('to' in change) {
      merged[fieldName] = change.to ?? '';
      return;
    }

    const base = uniq(normalizeArray(merged[fieldName]));
    const removed = uniq(normalizeArray(change.removed));
    const added = uniq(normalizeArray(change.added));

    const next = base.filter(item => !removed.includes(item));
    added.forEach(item => {
      if (!next.includes(item)) next.push(item);
    });

    if (next.length === 0) {
      delete merged[fieldName];
    } else if (next.length === 1) {
      merged[fieldName] = next[0];
    } else {
      merged[fieldName] = next;
    }
  });

  return merged;
};
