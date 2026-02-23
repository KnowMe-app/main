import { get, ref as ref2, remove, set, update } from 'firebase/database';
import { database } from 'components/config';

const EDITS_ROOT = 'multiData/edits';

const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);

const normalizeArray = value => {
  if (Array.isArray(value)) {
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
const normalizeCardKeyForCompare = value => normalizeCardKey(value).toLowerCase();

const looksLikeOverlayRecord = value => isPlainObject(value) && isPlainObject(value.fields);

const flattenOverlayCandidates = (node, depth = 0) => {
  if (!isPlainObject(node) || depth > 4) return [];

  const direct = Object.values(node).filter(looksLikeOverlayRecord);
  const nested = Object.values(node)
    .filter(value => isPlainObject(value) && !looksLikeOverlayRecord(value))
    .flatMap(value => flattenOverlayCandidates(value, depth + 1));

  return [...direct, ...nested];
};

const findMatchingCardKey = (editorCards, cardUserId) => {
  if (!editorCards || typeof editorCards !== 'object') return null;

  const normalizedCardId = normalizeCardKeyForCompare(cardUserId);
  if (!normalizedCardId) return null;

  return Object.keys(editorCards).find(key => normalizeCardKeyForCompare(key) === normalizedCardId) || null;
};

export const resolveOverlayRecordByCardId = (editorCards, cardUserId) => {
  if (!editorCards || typeof editorCards !== 'object') return null;

  const normalizedCardId = normalizeCardKeyForCompare(cardUserId);
  if (!normalizedCardId) return null;

  const direct = editorCards[cardUserId] || editorCards[normalizeCardKey(cardUserId)] || editorCards[normalizedCardId];
  if (direct?.fields) return direct;

  const rootDirect = looksLikeOverlayRecord(editorCards) ? editorCards : null;
  if (rootDirect) {
    const overlayCardId = normalizeCardKeyForCompare(rootDirect.cardUserId);
    if (!overlayCardId || overlayCardId === normalizedCardId) {
      return rootDirect;
    }
  }

  const matchedKey = findMatchingCardKey(editorCards, cardUserId);
  if (matchedKey && editorCards[matchedKey]?.fields) {
    return editorCards[matchedKey];
  }

  if (matchedKey && editorCards[matchedKey] && typeof editorCards[matchedKey] === 'object') {
    const nested = editorCards[matchedKey][cardUserId]
      || editorCards[matchedKey][normalizeCardKey(cardUserId)]
      || editorCards[matchedKey][normalizedCardId]
      || editorCards[matchedKey][matchedKey]
      || null;
    if (nested?.fields) return nested;
  }

  const candidates = flattenOverlayCandidates(editorCards);
  const byCardId = candidates.find(candidate => {
    const candidateCardId = normalizeCardKeyForCompare(candidate?.cardUserId);
    return candidateCardId && candidateCardId === normalizedCardId;
  });
  if (byCardId) return byCardId;

  if (candidates.length === 1) return candidates[0];

  return null;
};

export const getCanonicalCard = async cardUserId => {
  const [newUsersSnapshot, usersSnapshot] = await Promise.all([
    get(ref2(database, `newUsers/${cardUserId}`)),
    get(ref2(database, `users/${cardUserId}`)),
  ]);

  const newUsersData = newUsersSnapshot.exists() ? newUsersSnapshot.val() : {};
  const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};

  return {
    userId: cardUserId,
    ...usersData,
    ...newUsersData,
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

  const cardRef = ref2(database, `${EDITS_ROOT}/${editorUserId}/${normalizedCardId}`);
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

  if (!Object.keys(sanitized).length) {
    await remove(cardRef);
    return;
  }

  await set(cardRef, { fields: sanitized, updatedAt: Date.now(), cardUserId: normalizedCardId, editorUserId });
};

export const getOverlayForUserCard = async ({ editorUserId, cardUserId }) => {
  if (!editorUserId || !cardUserId) return null;

  const editorSnapshot = await get(ref2(database, `${EDITS_ROOT}/${editorUserId}`));
  if (editorSnapshot.exists()) {
    const directOverlay = resolveOverlayRecordByCardId(editorSnapshot.val(), cardUserId);
    if (directOverlay?.fields) {
      return directOverlay;
    }
  }

  const allSnapshot = await get(ref2(database, EDITS_ROOT));
  if (!allSnapshot.exists()) return null;

  const all = allSnapshot.val();
  for (const [, editorCards] of Object.entries(all)) {
    const overlay = resolveOverlayRecordByCardId(editorCards, cardUserId);
    if (overlay?.fields) {
      return overlay;
    }
  }

  return null;
};

export const getOverlaysForCard = async cardUserId => {
  if (!cardUserId) return {};
  const snapshot = await get(ref2(database, EDITS_ROOT));
  if (!snapshot.exists()) return {};

  const result = {};
  const all = snapshot.val();
  Object.entries(all).forEach(([editorUserId, editorCards]) => {
    const overlay = resolveOverlayRecordByCardId(editorCards, cardUserId);
    if (overlay?.fields) {
      result[editorUserId] = overlay;
    }
  });

  return result;
};

export const applyOverlayToCard = (canonical, overlayFields = {}) => {
  const merged = { ...(canonical || {}) };

  Object.entries(overlayFields).forEach(([fieldName, change]) => {
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

export const removeOverlayForUserCard = async ({ editorUserId, cardUserId }) => {
  if (!editorUserId || !cardUserId) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const editorSnapshot = await get(ref2(database, `${EDITS_ROOT}/${editorUserId}`));
  if (!editorSnapshot.exists()) return;

  const editorCards = editorSnapshot.val();
  const matchedKey = findMatchingCardKey(editorCards, normalizedCardId) || normalizedCardId;
  await remove(ref2(database, `${EDITS_ROOT}/${editorUserId}/${matchedKey}`));
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

export const patchOverlayField = async ({ editorUserId, cardUserId, fieldName, change }) => {
  if (!editorUserId || !cardUserId || !fieldName) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const editorSnapshot = await get(ref2(database, `${EDITS_ROOT}/${editorUserId}`));
  const matchedKey = editorSnapshot.exists()
    ? findMatchingCardKey(editorSnapshot.val(), normalizedCardId) || normalizedCardId
    : normalizedCardId;

  const path = `${EDITS_ROOT}/${editorUserId}/${matchedKey}/fields/${fieldName}`;
  if (!change || (!change.to && !change.from && !change.added && !change.removed)) {
    await remove(ref2(database, path));
    return;
  }

  await update(ref2(database, `${EDITS_ROOT}/${editorUserId}/${matchedKey}/fields`), {
    [fieldName]: change,
  });
};
