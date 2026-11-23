import { get, onValue, ref, runTransaction, serverTimestamp, update } from 'firebase/database';
import {
  auth, database, normalizeStoredDates, syncMatchingCardIndex, syncUserSearchIdIndex, syncUserSearchKeyIndex,
} from 'components/config';
import { canGrantProfilePrivileges } from './accessLevel';
import { buildMatchingCardProjection, MATCHING_CARD_REVISION_FIELD } from './matchingCardIndex';
import {
  claimOverlayValueForReview, getCanonicalCard, releaseOverlayValueReview,
  settleOverlayValueForCard, splitOverlayChangeByValue,
} from './multiAccountEdits';
import { persistCanonicalCard } from './persistCanonicalCard';
import { applyOverlayToCard, normalizeOverlayFields } from './profileFieldChanges';
import {
  MATCHING_CARD_DERIVED_FIELDS, MATCHING_CARD_MIRRORED_FIELDS, PROFILE_NODES,
  resolveCanonicalFieldName, resolveFieldOwnerNode,
} from './profileNodeSchema';
import { areProposalValuesEqual } from './profileProposals';
import { isDraftProfileRecord } from './profileRecordSource';
import { normalizePhoneForStorage } from './profileValueNormalization';

const fail = code => Object.assign(new Error(code), { code });
const same = (left, right) => areProposalValuesEqual(left ?? null, right ?? null);

export const selectOverlayApprovalChange = (record, fieldName, value, acceptedValue = value) => {
  const change = normalizeOverlayFields(record?.fields)[fieldName];
  if (!change) throw fail('REVISION_CONFLICT');
  const { settledChange } = splitOverlayChangeByValue(change, value);
  if (!settledChange) throw fail('REVISION_CONFLICT');

  const reviewedValue = fieldName === 'phone' ? normalizePhoneForStorage(acceptedValue) : acceptedValue;
  if (fieldName === 'phone' && acceptedValue && !reviewedValue) throw fail('INVALID_DRAFT');
  if ('to' in settledChange) return {
    ...settledChange, to: settledChange.to === '' ? '' : reviewedValue,
  };
  return settledChange.added ? { ...settledChange, added: [reviewedValue] } : settledChange;
};

const readOriginal = (record, fieldName, change, observed) => {
  let original;
  try { original = JSON.parse(record.proposal?.originalValues || '{}')[fieldName]; }
  catch { throw fail('INVALID_DRAFT'); }
  if (original) return original.present ? original.value ?? null : null;
  if ('from' in change) return change.from === '' && observed == null ? null : change.from;
  return observed;
};

const applyField = (fieldName, value, change) => (
  change.to === '' ? null : applyOverlayToCard({ [fieldName]: value }, { [fieldName]: change })[fieldName] ?? null
);

const writeField = async (fieldRef, original, desired) => {
  let unsubscribe;
  try {
    await new Promise((resolve, reject) => { unsubscribe = onValue(fieldRef, resolve, reject); });
    const result = await runTransaction(fieldRef, current => {
      // Навіть повтор підтверджує значення на сервері. Інакше локальний
      // кеш міг би підтвердити прийняття поверх свіжішої зміни.
      if (same(current, original) || same(current, desired)) return desired;
      return undefined;
    }, { applyLocally: false });
    if (!result.committed) throw fail('REVISION_CONFLICT');
  } finally {
    unsubscribe?.();
  }
};

const syncFieldProjection = async (cardId, fieldName, primaryField, previousCard) => {
  const matchingRef = ref(database, `${PROFILE_NODES.matchingCards}/${cardId}`);
  const existing = (await get(matchingRef)).val();
  const latest = await getCanonicalCard(cardId);
  if (!existing) {
    if (await syncMatchingCardIndex(cardId, latest, { bumpRevision: true, onlyIfMissing: true }) === null) {
      throw fail('PARTIAL_WRITE');
    }
  } else {
    const projection = buildMatchingCardProjection(cardId, latest, { existingCard: existing, avatar: existing.avatar });
    const fields = Object.entries(MATCHING_CARD_DERIVED_FIELDS)
      .filter(([, sources]) => sources.includes(fieldName) || sources.includes(primaryField))
      .map(([key]) => key);
    if (MATCHING_CARD_MIRRORED_FIELDS.includes(primaryField)) fields.push(primaryField);

    // Пишемо лише похідні цього поля, щоб зберегти паралельні зміни інших полів.
    await update(matchingRef, {
      ...Object.fromEntries(fields.filter(key => projection?.[key] !== existing[key])
        .map(key => [key, projection?.[key] ?? null])),
      [MATCHING_CARD_REVISION_FIELD]: serverTimestamp(),
    });
  }
  await syncUserSearchKeyIndex(cardId, previousCard, latest);
};

export const approveOverlayValue = async ({ cardUserId, editorUserId, fieldName, value, acceptedValue = value, expectedCurrent }) => {
  if (!canGrantProfilePrivileges(auth.currentUser?.uid)) throw fail('PERMISSION_DENIED');
  const change = selectOverlayApprovalChange(expectedCurrent, fieldName, value, acceptedValue);
  const canonical = await getCanonicalCard(cardUserId);
  if (Object.keys(canonical || {}).length <= 1) throw fail('TARGET_NOT_FOUND');
  const isDraft = isDraftProfileRecord(canonical);
  const primary = resolveCanonicalFieldName(fieldName);
  const node = resolveFieldOwnerNode(fieldName);
  if (!isDraft && !node) throw fail('INVALID_DRAFT');

  const fieldRef = isDraft ? null : ref(database, `${node}/${cardUserId}/${primary}`);
  const observed = isDraft ? canonical[fieldName] ?? null : (await get(fieldRef)).val();
  const original = readOriginal(expectedCurrent, fieldName, change, observed);
  let desired = normalizeStoredDates({ [primary]: applyField(fieldName, original, change) })[primary] ?? null;
  if (node === PROFILE_NODES.matchingCards && desired !== null && !isDraft) {
    desired = buildMatchingCardProjection(cardUserId, { ...canonical, [primary]: desired })?.[primary] ?? null;
  }
  if (!same(observed, original) && !same(observed, desired)) throw fail('REVISION_CONFLICT');

  const locator = { cardUserId, editorUserId, fieldName, value };
  const claimed = await claimOverlayValueForReview({ ...locator, acceptedValue, expectedCurrent });
  let fieldApplied = false;
  try {
    if (isDraft) {
      if (!same(observed, desired)) await persistCanonicalCard({ ...canonical, [fieldName]: desired });
      fieldApplied = true;
    } else {
      await writeField(fieldRef, original, desired);
      fieldApplied = true;
      await syncUserSearchIdIndex(cardUserId, { [fieldName]: original }, { [fieldName]: desired });
      await syncFieldProjection(cardUserId, fieldName, primary, { ...canonical, [primary]: original });
    }
    const settled = await settleOverlayValueForCard({
      ...locator, action: 'accept', acceptedValue, expectedCurrent: claimed,
      acceptedOriginal: desired === null ? { present: false } : { present: true, value: desired },
    });
    if (!settled) throw fail('REVISION_CONFLICT');
    return { value: desired, remainingOverlay: settled.remainingOverlay };
  } catch (error) {
    if (!fieldApplied && ['REVISION_CONFLICT', 'DRAFT_CHANGED_ELSEWHERE'].includes(error?.code)) {
      await releaseOverlayValueReview({ ...locator, claimed }).catch(() => {});
    }
    if (fieldApplied && error?.code !== 'PARTIAL_WRITE') {
      throw Object.assign(fail('PARTIAL_WRITE'), { cause: error });
    }
    throw error;
  }
};
