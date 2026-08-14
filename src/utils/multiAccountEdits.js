import { get as firebaseGet, push, ref as ref2, remove, set, update } from 'firebase/database';
import { withAdminDownloadToast } from 'utils/backendDownloadToast';
import { isLongFormatUserId, mergeUserCollectionData } from 'utils/mergeUserCollections';

import { database } from 'components/config';

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'multiAccountEdits',
    path: args[0],
  });

const EDITS_ROOT = 'multiData/edits';
// Append-only journal of every overlay change ever written for a card. The
// overlay node itself only ever holds an editor's *current* delta (each save
// rewrites it), so without this log an earlier edit is unrecoverable the
// moment its author edits the same field again. Only admins read it - other
// editors see the stacked result, never who changed what or what came before.
const EDITS_HISTORY_ROOT = 'multiData/editsHistory';
// A durable roster of everybody who has ever edited a card. The overlay node
// is emptied as soon as an edit is settled - and its journal entries are
// purged with it - so by the time the card is published there is nothing left
// to tell who worked on it. Those editors must keep access to the card they
// helped build, so their ids are recorded here once and never removed.
const EDITS_CONTRIBUTORS_ROOT = 'multiData/editsContributors';
const TECHNICAL_FIELD_NAMES = new Set(['lastAction', 'cachedAt', 'cacheVersion']);

const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);

const normalizeArray = value => {
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

const uniq = values => Array.from(new Set(values));

const areArraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
};

const shouldSkipField = key => key === 'userId' || key === 'photos';

const normalizeCardKey = value => String(value || '').trim();
const shouldDropOverlayByFieldNames = fieldNames => {
  if (!Array.isArray(fieldNames) || !fieldNames.length) return true;
  return fieldNames.every(fieldName => TECHNICAL_FIELD_NAMES.has(fieldName));
};

const cleanupOverlayIfOnlyTechnicalFields = async ({ editorUserId, cardUserId }) => {
  if (!editorUserId || !cardUserId) return;

  const editorRef = ref2(database, `${EDITS_ROOT}/${cardUserId}/${editorUserId}`);
  const fieldsSnapshot = await get(ref2(database, `${EDITS_ROOT}/${cardUserId}/${editorUserId}/fields`));
  if (!fieldsSnapshot?.exists?.()) {
    await remove(editorRef);
    return;
  }

  const fieldNames = Object.keys(fieldsSnapshot.val() || {});
  if (shouldDropOverlayByFieldNames(fieldNames)) {
    await remove(editorRef);
  }
};

const normalizeEditorNode = (overlay, cardUserId, editorUserId) => {
  if (!isPlainObject(overlay) || !isPlainObject(overlay.fields)) return null;

  return {
    fields: overlay.fields,
    updatedAt: overlay.updatedAt || null,
    cardUserId: overlay.cardUserId || cardUserId,
    editorUserId: overlay.editorUserId || editorUserId,
  };
};

export const getCanonicalCard = async cardUserId => {
  if (isLongFormatUserId(cardUserId)) {
    const usersSnapshot = await get(ref2(database, `users/${cardUserId}`));
    if (usersSnapshot.exists()) {
      return {
        userId: cardUserId,
        ...mergeUserCollectionData(usersSnapshot.val(), {}),
      };
    }

    const newUsersSnapshot = await get(ref2(database, `newUsers/${cardUserId}`));
    return {
      userId: cardUserId,
      ...mergeUserCollectionData({}, newUsersSnapshot.exists() ? newUsersSnapshot.val() : {}),
    };
  }

  const [newUsersSnapshot, usersSnapshot] = await Promise.all([
    get(ref2(database, `newUsers/${cardUserId}`)),
    get(ref2(database, `users/${cardUserId}`)),
  ]);

  const newUsersData = newUsersSnapshot.exists() ? newUsersSnapshot.val() : {};
  const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};

  return {
    userId: cardUserId,
    ...mergeUserCollectionData(usersData, newUsersData),
  };
};

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

export const saveOverlayForUserCard = async ({ editorUserId, cardUserId, fields }) => {
  if (!editorUserId || !cardUserId) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const cardRef = ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`);
  const sanitized = Object.entries(fields || {}).reduce((acc, [fieldName, change]) => {
    if (!isPlainObject(change)) return acc;

    if ('from' in change || 'to' in change) {
      const from = change.from ?? '';
      const to = change.to ?? '';
      if (from === to) return acc;
      acc[fieldName] = { from, to };
      return acc;
    }

    const added = uniq(normalizeArray(change.added));
    const removed = uniq(normalizeArray(change.removed));
    if (!added.length && !removed.length) return acc;

    acc[fieldName] = {
      ...(added.length ? { added } : {}),
      ...(removed.length ? { removed } : {}),
    };

    return acc;
  }, {});

  if (shouldDropOverlayByFieldNames(Object.keys(sanitized))) {
    await remove(cardRef);
    return;
  }

  let previousFields = null;
  try {
    const previousSnapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields`));
    previousFields = previousSnapshot?.exists?.() ? previousSnapshot.val() : null;
  } catch {
    previousFields = null;
  }

  await set(cardRef, { fields: sanitized, updatedAt: Date.now(), cardUserId: normalizedCardId, editorUserId });

  await rememberCardContributor({ cardUserId: normalizedCardId, editorUserId });

  await appendOverlayHistory({
    cardUserId: normalizedCardId,
    editorUserId,
    action: 'edit',
    fields: diffOverlayFields(previousFields, sanitized),
  });
};

// Best-effort by design, like the journal: an editor's save must not fail
// because the roster could not be written.
export const rememberCardContributor = async ({ cardUserId, editorUserId }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !editorUserId) return false;

  try {
    await update(ref2(database, `${EDITS_CONTRIBUTORS_ROOT}/${normalizedCardId}`), {
      [editorUserId]: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn('[multiAccountEdits] failed to remember card contributor', error);
    return false;
  }
};

// Everybody who should keep access to the card once it is published: the
// roster above, plus whoever still has an unsettled overlay on it (a card
// edited before the roster existed has only the latter).
export const getCardContributorIds = async cardUserId => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return [];

  const contributors = new Set();

  try {
    const snapshot = await get(ref2(database, `${EDITS_CONTRIBUTORS_ROOT}/${normalizedCardId}`));
    if (snapshot?.exists?.()) Object.keys(snapshot.val() || {}).forEach(editorUserId => contributors.add(editorUserId));
  } catch (error) {
    console.warn('[multiAccountEdits] contributors roster unavailable', error);
  }

  try {
    Object.keys(await getOverlaysForCard(normalizedCardId)).forEach(editorUserId => contributors.add(editorUserId));
  } catch (error) {
    console.warn('[multiAccountEdits] pending overlays unavailable', error);
  }

  return Array.from(contributors).filter(Boolean);
};

export const getOverlayForUserCard = async ({ editorUserId, cardUserId }) => {
  if (!cardUserId) return null;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return null;

  if (editorUserId) {
    const directSnapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`));
    if (directSnapshot.exists()) {
      const normalized = normalizeEditorNode(directSnapshot.val(), normalizedCardId, editorUserId);
      if (normalized) return normalized;
    }
  }

  const overlaysByEditor = await getOverlaysForCard(cardUserId);
  if (!Object.keys(overlaysByEditor).length) return null;

  if (editorUserId && overlaysByEditor[editorUserId]) {
    return overlaysByEditor[editorUserId];
  }

  return Object.values(overlaysByEditor)[0] || null;
};

export const getOverlaysForCard = async cardUserId => {
  if (!cardUserId) return {};
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return {};

  const snapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}`));
  if (!snapshot.exists()) return {};

  const result = {};
  const overlays = snapshot.val();
  Object.entries(overlays).forEach(([editorUserId, overlay]) => {
    const normalized = normalizeEditorNode(overlay, normalizedCardId, editorUserId);
    if (!normalized) return;
    result[editorUserId] = normalized;
  });

  return result;
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

// Every editor's overlay is a delta against the card as that editor saw it,
// so the order they get replayed in decides the visible value of a field two
// people touched. Oldest first, i.e. the most recent editor's value wins -
// that is exactly the "останні правки" everybody (admin or not) is shown.
// updatedAt can be missing on legacy nodes and can tie when two saves land in
// the same millisecond; editorUserId breaks the tie so every client composes
// the same card instead of flip-flopping between renders.
export const sortOverlaysByAppliedOrder = (overlaysByEditor = {}) =>
  Object.entries(overlaysByEditor || {})
    .filter(([, overlay]) => isPlainObject(overlay))
    .map(([editorUserId, overlay]) => ({ ...overlay, editorUserId: overlay.editorUserId || editorUserId }))
    .sort((a, b) => {
      const byUpdatedAt = Number(a.updatedAt || 0) - Number(b.updatedAt || 0);
      if (byUpdatedAt !== 0) return byUpdatedAt;
      return String(a.editorUserId).localeCompare(String(b.editorUserId));
    });

// Stacks every editor's overlay onto the canonical card, in save order.
// `excludeEditorUserId` produces the card as it looks *without* one editor's
// own delta - that is the baseline their next save has to be diffed against,
// so their overlay keeps holding only their own changes instead of absorbing
// everyone else's into it.
export const applyOverlaysToCard = (canonical, overlaysByEditor = {}, { excludeEditorUserId } = {}) =>
  sortOverlaysByAppliedOrder(overlaysByEditor)
    .filter(overlay => !excludeEditorUserId || overlay.editorUserId !== excludeEditorUserId)
    .reduce((card, overlay) => applyOverlayToCard(card, overlay.fields || {}), { ...(canonical || {}) });

// One call for the two views an editor screen needs at the same time:
// what to render (everything stacked) and what to diff the next save against
// (everything stacked except this editor's own overlay).
export const getStackedCardViews = ({ canonical, overlaysByEditor = {}, editorUserId } = {}) => ({
  stacked: applyOverlaysToCard(canonical, overlaysByEditor),
  baseWithoutOwnOverlay: applyOverlaysToCard(canonical, overlaysByEditor, {
    excludeEditorUserId: editorUserId,
  }),
});

// The set of fields any editor currently has a pending change on, so a card
// can mark them without disclosing who changed them.
export const getStackedOverlayFieldNames = (overlaysByEditor = {}) => {
  const fieldNames = new Set();
  sortOverlaysByAppliedOrder(overlaysByEditor).forEach(overlay => {
    Object.keys(overlay?.fields || {}).forEach(fieldName => {
      if (!TECHNICAL_FIELD_NAMES.has(fieldName)) fieldNames.add(fieldName);
    });
  });
  return Array.from(fieldNames);
};

const buildHistoryEntries = ({ cardUserId, editorUserId, action, fields, at }) =>
  Object.entries(fields || {}).reduce((acc, [fieldName, change]) => {
    if (!isPlainObject(change)) return acc;
    if (TECHNICAL_FIELD_NAMES.has(fieldName)) return acc;
    acc.push({ cardUserId, editorUserId, action, fieldName, change, at });
    return acc;
  }, []);

// Best-effort by design: the journal is an admin-only audit trail, so a
// failure to append it (rules not deployed yet, offline, ...) must never turn
// a successful edit into a failed one for the editor who made it.
export const appendOverlayHistory = async ({ cardUserId, editorUserId, action = 'edit', fields }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return [];

  const at = Date.now();
  const entries = buildHistoryEntries({
    cardUserId: normalizedCardId,
    editorUserId: editorUserId || '',
    action,
    fields,
    at,
  });
  if (!entries.length) return [];

  try {
    const historyRef = ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}`);
    const updates = entries.reduce((acc, entry) => {
      const key = push(historyRef).key;
      if (key) acc[key] = entry;
      return acc;
    }, {});

    if (Object.keys(updates).length) {
      await update(historyRef, updates);
    }
  } catch (error) {
    console.warn('[multiAccountEdits] failed to append overlay history', error);
  }

  return entries;
};

// Every value a change mentions, whatever shape it was stored in. Used to
// match a settled edit against the journal entries that describe it.
const changeValueList = change => {
  if (!isPlainObject(change)) return [];

  const values = [];
  if ('from' in change || 'to' in change) values.push(change.from, change.to);
  values.push(...normalizeArray(change.added ?? change.add), ...normalizeArray(change.removed));

  return uniq(values.map(value => String(value ?? '').trim()).filter(Boolean));
};

// A settled edit must leave nothing behind: once a value has been saved into
// the card or thrown away, the journal entries that only described that value
// are deleted too, so the review queue never grows a tail of memos about work
// that is already done. Entries with no values of their own (`discarded`
// markers) are always dropped - they are pure bookkeeping.
export const purgeOverlayHistoryEntries = async ({ cardUserId, editorUserId, fieldName, values = [] }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !fieldName) return 0;

  const settledValues = new Set(values.map(value => String(value ?? '').trim()).filter(Boolean));

  try {
    const historyRef = ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}`);
    const snapshot = await get(historyRef);
    if (!snapshot?.exists?.()) return 0;

    const updates = Object.entries(snapshot.val() || {}).reduce((acc, [entryId, entry]) => {
      if (!isPlainObject(entry) || entry.fieldName !== fieldName) return acc;
      if (editorUserId && entry.editorUserId && entry.editorUserId !== editorUserId) return acc;

      const entryValues = changeValueList(entry.change);
      if (settledValues.size && entryValues.length && !entryValues.some(value => settledValues.has(value))) return acc;

      acc[entryId] = null;
      return acc;
    }, {});

    if (Object.keys(updates).length) await update(historyRef, updates);
    return Object.keys(updates).length;
  } catch (error) {
    console.warn('[multiAccountEdits] failed to purge overlay history', error);
    return 0;
  }
};

// Admin-only. Newest first, because the review UI reads top-down.
export const getOverlayHistoryForCard = async cardUserId => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return [];

  const snapshot = await get(ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}`));
  if (!snapshot?.exists?.()) return [];

  return Object.entries(snapshot.val() || {})
    .filter(([, entry]) => isPlainObject(entry))
    .map(([entryId, entry]) => ({
      entryId,
      backendEntryId: entryId,
      historySource: 'overlay',
      ...entry,
    }))
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
};

// Removes one journal row without touching the editor's current overlay. This
// is used by the admin's historical timeline, where the proposal has already
// been superseded and only the durable memo remains.
export const removeOverlayHistoryEntry = async ({ cardUserId, entryId }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  const normalizedEntryId = normalizeCardKey(entryId);
  if (!normalizedCardId || !normalizedEntryId) return;

  await remove(ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}/${normalizedEntryId}`));
};

// Only the fields whose stored change actually differs from what is already
// there - a blur that re-saves an unchanged overlay must not add a journal
// entry for every field the editor once touched.
const diffOverlayFields = (previousFields, nextFields) => {
  const previous = normalizeOverlayFields(previousFields);
  const next = normalizeOverlayFields(nextFields);

  return Object.entries(next).reduce((acc, [fieldName, change]) => {
    if (JSON.stringify(previous[fieldName]) === JSON.stringify(change)) return acc;
    acc[fieldName] = change;
    return acc;
  }, {});
};

export const removeOverlayForUserCard = async ({ editorUserId, cardUserId }) => {
  if (!editorUserId || !cardUserId) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  await remove(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`));
};

export const acceptOverlayForUserCard = async ({
  editorUserId,
  cardUserId,
  persistCard,
}) => {
  const overlay = await getOverlayForUserCard({ editorUserId, cardUserId });
  if (!overlay?.fields) return null;

  const canonical = await getCanonicalCard(cardUserId);
  const merged = applyOverlayToCard(canonical, overlay.fields);

  await persistCard(merged);
  await appendOverlayHistory({
    cardUserId,
    editorUserId: overlay.editorUserId || editorUserId,
    action: 'accept',
    fields: overlay.fields,
  });
  await removeOverlayForUserCard({ editorUserId, cardUserId });

  return { canonical, merged, overlay };
};

export const getOtherEditorsChangedFields = (overlaysByEditor = {}, currentEditorUserId) => {
  const fields = new Set();
  Object.entries(overlaysByEditor).forEach(([editorId, overlay]) => {
    if (editorId === currentEditorUserId) return;
    Object.keys(overlay?.fields || {}).forEach(fieldName => fields.add(fieldName));
  });
  return Array.from(fields);
};

export const formatOverlayPreview = ({ fieldName, change, canonicalValue }) => {
  if (change?.to !== undefined || change?.from !== undefined) {
    return {
      fieldName,
      oldValue: change.from ?? canonicalValue ?? '',
      newValue: change.to ?? '',
    };
  }

  const mainArray = uniq(normalizeArray(canonicalValue));
  const removed = uniq(normalizeArray(change?.removed));
  const added = uniq(normalizeArray(change?.added));
  const nextArray = mainArray.filter(item => !removed.includes(item));
  added.forEach(item => {
    if (!nextArray.includes(item)) nextArray.push(item);
  });

  if (areArraysEqual(mainArray, nextArray)) {
    return null;
  }

  return {
    fieldName,
    oldValue: mainArray,
    newValue: nextArray,
  };
};

export const patchOverlayField = async ({ editorUserId, cardUserId, fieldName, change, historyAction }) => {
  if (!editorUserId || !cardUserId || !fieldName) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const path = `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields/${fieldName}`;
  if (!change || (!change.to && !change.from && !change.added && !change.removed)) {
    await remove(ref2(database, path));
    await cleanupOverlayIfOnlyTechnicalFields({ editorUserId, cardUserId: normalizedCardId });
    await appendOverlayHistory({
      cardUserId: normalizedCardId,
      editorUserId,
      action: historyAction || 'discard',
      fields: { [fieldName]: { discarded: true } },
    });
    return;
  }

  await update(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields`), {
    [fieldName]: change,
  });
  await cleanupOverlayIfOnlyTechnicalFields({ editorUserId, cardUserId: normalizedCardId });
  await appendOverlayHistory({
    cardUserId: normalizedCardId,
    editorUserId,
    action: historyAction || 'edit',
    fields: { [fieldName]: change },
  });
};

const hasOverlayChangeValues = change => Boolean(
  change && (change.to || change.from || change.added?.length || change.removed?.length)
);

// Settles one *value* of an editor's field change - accept or discard - and
// leaves the rest of that field's change pending. Accepting one of three
// proposed phone numbers must not throw the other two away, so the caller
// passes what it settled and what remains; the journal records only the
// settled part, under the action that settled it.
//
// `purgeHistory` inverts that last part: instead of writing one more journal
// entry, the entries about the settled value are deleted. That is what the
// review UI's save/delete buttons use - a settled edit disappears from the
// backend completely rather than turning into another line of history.
export const settleOverlayFieldValue = async ({
  editorUserId,
  cardUserId,
  fieldName,
  settledChange,
  remainingChange,
  historyAction = 'discard',
  purgeHistory = false,
}) => {
  if (!editorUserId || !cardUserId || !fieldName) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const fieldsPath = `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields`;

  if (hasOverlayChangeValues(remainingChange)) {
    await update(ref2(database, fieldsPath), { [fieldName]: remainingChange });
  } else {
    await remove(ref2(database, `${fieldsPath}/${fieldName}`));
  }

  await cleanupOverlayIfOnlyTechnicalFields({ editorUserId, cardUserId: normalizedCardId });

  if (purgeHistory) {
    await purgeOverlayHistoryEntries({
      cardUserId: normalizedCardId,
      editorUserId,
      fieldName,
      values: changeValueList(settledChange),
    });
    return;
  }

  await appendOverlayHistory({
    cardUserId: normalizedCardId,
    editorUserId,
    action: historyAction,
    fields: { [fieldName]: settledChange || { discarded: true } },
  });
};

// ---------------------------------------------------------------------------
// Admin review operations. An admin is the only role that can turn a pending
// overlay into canonical data, and the only one who gets to see the journal
// these write into.
// ---------------------------------------------------------------------------

// Accept a single field from a single editor: the rest of that editor's
// overlay - and every other editor's - stays pending.
export const acceptOverlayFieldForUserCard = async ({
  editorUserId,
  cardUserId,
  fieldName,
  persistCard,
}) => {
  if (!editorUserId || !cardUserId || !fieldName) return null;

  const overlays = await getOverlaysForCard(cardUserId);
  const change = normalizeOverlayFields(overlays?.[editorUserId]?.fields)[fieldName];
  if (!change) return null;

  const canonical = await getCanonicalCard(cardUserId);
  const merged = applyOverlayToCard(canonical, { [fieldName]: change });

  await persistCard(merged);
  await patchOverlayField({
    editorUserId,
    cardUserId,
    fieldName,
    change: null,
    historyAction: 'accept',
  });

  return { canonical, merged, change };
};

// Accept everything pending on the card at once: the stacked result is
// exactly what every editor already sees, so accepting it changes nothing
// visually - it just makes those values canonical and clears the queue.
export const acceptAllOverlaysForCard = async ({ cardUserId, persistCard }) => {
  const overlays = await getOverlaysForCard(cardUserId);
  const orderedOverlays = sortOverlaysByAppliedOrder(overlays);
  if (!orderedOverlays.length) return null;

  const canonical = await getCanonicalCard(cardUserId);
  const merged = applyOverlaysToCard(canonical, overlays);

  await persistCard(merged);
  await removeAllOverlaysForCard(cardUserId, { historyAction: 'accept' });

  return { canonical, merged, overlays };
};

// Clears the whole queue for a card in one write. `historyAction` records
// why: 'accept' when the values were just written to the card, 'discard'
// when the admin threw them away.
export const removeAllOverlaysForCard = async (cardUserId, { historyAction = 'discard' } = {}) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return null;

  const overlays = await getOverlaysForCard(normalizedCardId);
  const orderedOverlays = sortOverlaysByAppliedOrder(overlays);
  if (!orderedOverlays.length) return null;

  for (const overlay of orderedOverlays) {
    if (historyAction === 'accept') {
      // Accepted values are canonical now. Remove their earlier audit rows
      // instead of adding another permanent "accept" row to the journal.
      for (const [fieldName, change] of Object.entries(overlay.fields || {})) {
        await purgeOverlayHistoryEntries({
          cardUserId: normalizedCardId,
          editorUserId: overlay.editorUserId,
          fieldName,
          values: changeValueList(change),
        });
      }
      continue;
    }
    await appendOverlayHistory({
      cardUserId: normalizedCardId,
      editorUserId: overlay.editorUserId,
      action: historyAction,
      fields: overlay.fields,
    });
  }

  await remove(ref2(database, `${EDITS_ROOT}/${normalizedCardId}`));

  return { overlays };
};
