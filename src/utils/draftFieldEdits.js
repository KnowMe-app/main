// A value-level view of what editors proposed for a draft, grouped by the
// field each proposal touches. The review UI renders every proposal inside the
// questionnaire, right under the field that owns it, instead of in a separate
// list far away from the data it changes - so this module turns the two
// backend shapes (pending overlays and the change journal) into one flat row
// per value, ordered oldest first.

import { normalizeOverlayFields, sortOverlaysByAppliedOrder } from './multiAccountEdits';

const hasKey = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const toValues = value => (Array.isArray(value) ? value : [value])
  .map(item => String(item ?? '').trim())
  .filter(Boolean);

const uniq = values => Array.from(new Set(values));

const buildArrayChange = (added, removed) => (added.length || removed.length
  ? {
    ...(added.length ? { added } : {}),
    ...(removed.length ? { removed } : {}),
  }
  : null);

// One row per value inside a single overlay/journal change:
//   { from: 'Ім'я6', to: 'Ім'я7' } -> заміна Ім'я7 (було Ім'я6)
//   { from: 'Київ', to: '' }       -> пропозиція видалити Київ
//   { added: [a, b], removed: [c] } -> два додані значення і одне видалене
export const buildChangeValueRows = change => {
  if (!change || typeof change !== 'object' || change.discarded) return [];

  if (hasKey(change, 'to') || hasKey(change, 'from')) {
    const [nextValue] = toValues(change.to);
    const [previousValue] = toValues(change.from);
    if (nextValue) return [{ kind: 'replaced', value: nextValue, previousValue: previousValue || '' }];
    if (previousValue) return [{ kind: 'removed', value: previousValue, previousValue: '' }];
    return [];
  }

  const added = uniq(toValues(change.added ?? change.add));
  const removed = uniq(toValues(change.removed));

  return [
    ...added.map(value => ({ kind: 'added', value, previousValue: '' })),
    ...removed.filter(value => !added.includes(value)).map(value => ({ kind: 'removed', value, previousValue: '' })),
  ];
};

// Pending proposals per field. Overlays are replayed oldest first, so the rows
// of a field read as a timeline: the last one is the newest proposal.
export const buildPendingFieldEdits = (overlaysByEditor = {}) => sortOverlaysByAppliedOrder(overlaysByEditor)
  .reduce((result, overlay) => {
    Object.entries(normalizeOverlayFields(overlay.fields)).forEach(([fieldName, change]) => {
      buildChangeValueRows(change).forEach(row => {
        if (!result[fieldName]) result[fieldName] = [];
        result[fieldName].push({
          key: `${overlay.editorUserId}::${fieldName}::${row.kind}::${row.value}`,
          fieldName,
          change,
          editorUserId: overlay.editorUserId,
          updatedAt: Number(overlay.updatedAt) || 0,
          ...row,
        });
      });
    });
    return result;
  }, {});

// Already processed versions per field, oldest first. Repeats of the same
// value are dropped: a field that was re-saved unchanged has one version, not
// one per save.
export const buildFieldVersionHistory = (entries = []) => {
  const seen = {};

  return [...entries]
    .sort((a, b) => Number(a.at || 0) - Number(b.at || 0))
    .reduce((result, entry) => {
      const fieldName = entry?.fieldName;
      if (!fieldName) return result;

      buildChangeValueRows(entry.change).forEach((row, index) => {
        const signature = `${row.kind}::${row.value}`;
        if (!seen[fieldName]) seen[fieldName] = new Set();
        if (seen[fieldName].has(signature)) return;
        seen[fieldName].add(signature);

        if (!result[fieldName]) result[fieldName] = [];
        result[fieldName].push({
          key: `${entry.entryId || `${fieldName}-${entry.at}`}-${index}`,
          fieldName,
          at: Number(entry.at) || 0,
          action: entry.action || 'edit',
          revision: entry.revision,
          editorUserId: entry.editorUserId || entry.actorUid || entry.createdBy || '',
          backendEntryId: entry.backendEntryId || entry.entryId || '',
          historySource: entry.historySource || 'overlay',
          ...row,
        });
      });

      return result;
    }, {});
};

// Versions the field already shows - as its current value or as a pending
// proposal - are not history, they are the present. Hiding them keeps the
// timeline to what was actually superseded.
export const dropVersionsPresentIn = (versionRows = [], values = []) => {
  const present = new Set(values.map(value => String(value ?? '').trim()).filter(Boolean));
  return versionRows.filter(row => !present.has(row.value));
};

// Splits an editor's change into the part being settled now (one value) and
// the part that stays pending. Accepting one of three added phone numbers must
// not silently drop the other two.
export const splitOverlayChangeValue = (change, row) => {
  if (!change || typeof change !== 'object' || !row) return { settled: null, remaining: null };

  if (hasKey(change, 'to') || hasKey(change, 'from')) {
    return { settled: { from: change.from ?? '', to: change.to ?? '' }, remaining: null };
  }

  const added = uniq(toValues(change.added ?? change.add));
  const removed = uniq(toValues(change.removed));

  if (row.kind === 'removed') {
    return {
      settled: { removed: [row.value] },
      remaining: buildArrayChange(added, removed.filter(value => value !== row.value)),
    };
  }

  return {
    settled: { added: [row.value] },
    remaining: buildArrayChange(added.filter(value => value !== row.value), removed),
  };
};

// Accepting a corrected value: the admin fixed the format in place, so what
// lands on the card is what they typed, not what the editor proposed.
export const withEditedValue = (settled, row, editedValue) => {
  const value = String(editedValue ?? '').trim();
  if (!settled || !value || value === row?.value) return settled;

  if (hasKey(settled, 'to')) return { from: settled.from ?? '', to: value };
  if (settled.added) return { added: [value] };

  return settled;
};

// "Видалити" on a proposal means the value must not be on the card at all -
// neither the proposed one nor the one it was about to replace.
export const buildRemovalChange = row => ({
  removed: uniq([row?.value, row?.previousValue].map(value => String(value ?? '').trim()).filter(Boolean)),
});
