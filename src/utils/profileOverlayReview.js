import { get, onValue, ref, runTransaction, serverTimestamp, update } from 'firebase/database';
import {
  auth, database, normalizeStoredDates, syncMatchingCardIndex, syncUserSearchIdIndex, syncUserSearchKeyIndex,
} from 'components/config';
import { canGrantProfilePrivileges } from './accessLevel';
import { buildMatchingCardProjection, MATCHING_CARD_REVISION_FIELD } from './matchingCardIndex';
import {
  claimOverlayValueForReview, getCanonicalCard, releaseOverlayValueReview,
  settleOverlayValueForCard, splitOverlayReviewChange,
} from './multiAccountEdits';
import { applyOverlayToCard, normalizeArray } from './profileFieldChanges';
import { loadProfileMutation, saveCreateProfileMutation } from './profileMutations';
import {
  MATCHING_CARD_DERIVED_FIELDS, MATCHING_CARD_MIRRORED_FIELDS, PROFILE_NODES,
  resolveCanonicalFieldName, resolveFieldOwnerNode,
} from './profileNodeSchema';
import { areProposalValuesEqual } from './profileProposals';
import { createEditorSnapshot } from './profileProposalEditor';
import { normalizePhoneForStorage } from './profileValueNormalization';

const fail = code => Object.assign(new Error(code), { code });
const same = (left, right) => areProposalValuesEqual(left ?? null, right ?? null);

const selectApproval = (record, fieldName, value, acceptedValue, replacement) => {
  const { settledChange, replacement: pair } = splitOverlayReviewChange(record, fieldName, value, replacement);
  if (!settledChange) throw fail('REVISION_CONFLICT');

  const selectedValue = pair && acceptedValue === value ? pair.to : acceptedValue;
  const reviewedValue = fieldName === 'phone' ? normalizePhoneForStorage(selectedValue) : selectedValue;
  if ((fieldName === 'phone' && acceptedValue && !reviewedValue)
    || (pair && (reviewedValue == null || reviewedValue === ''))) throw fail('INVALID_DRAFT');
  let change = settledChange;
  if ('to' in change && change.to !== '') change = { ...change, to: reviewedValue };
  if (change.added) change = { ...change, added: [reviewedValue] };
  return { change, replacement: pair };
};

export const selectOverlayApprovalChange = (record, fieldName, value, acceptedValue = value, replacement) => (
  selectApproval(record, fieldName, value, acceptedValue, replacement).change
);

const readOriginal = (record, fieldName, change, observed) => {
  let original;
  try { original = JSON.parse(record.proposal?.originalValues || '{}')[fieldName]; }
  catch { throw fail('INVALID_DRAFT'); }
  if (original) return original.present ? original.value ?? null : null;
  if ('from' in change) return change.from === '' && observed == null ? null : change.from;
  return observed;
};

const applyField = (fieldName, value, change) => {
  if (change.to === '') return null;
  const baseValues = normalizeArray(value);
  const matchBaseValues = items => items.map(item => (
    baseValues.find(base => areProposalValuesEqual(base, item)) ?? item
  ));
  const resolved = {
    ...change,
    ...(change.added && { added: matchBaseValues(change.added) }),
    ...(change.removed && { removed: matchBaseValues(change.removed) }),
  };
  return applyOverlayToCard({ [fieldName]: value }, { [fieldName]: resolved })[fieldName] ?? null;
};

const canAppendToCurrent = (change, original, observed) => {
  if (!change.added?.length || change.removed?.length) return false;
  const current = normalizeArray(observed);
  return normalizeArray(original).every(value => current.some(item => same(item, value)));
};

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

export const approveOverlayValue = async ({
  cardUserId, editorUserId, fieldName, value, acceptedValue = value, replacement,
  expectedCurrent, expectedDraft,
}) => {
  const actorUid = auth.currentUser?.uid;
  if (!canGrantProfilePrivileges(actorUid)) throw fail('PERMISSION_DENIED');
  const selection = selectApproval(expectedCurrent, fieldName, value, acceptedValue, replacement);
  const { change } = selection;
  const canonical = await getCanonicalCard(cardUserId);
  if (Object.keys(canonical || {}).length <= 1) throw fail('TARGET_NOT_FOUND');
  const isDraft = canonical.__profileMutationOperation === 'create';
  const creatorUid = isDraft ? canonical.__profileMutationCreatedBy : '';
  let draft = isDraft ? await loadProfileMutation(creatorUid, cardUserId) : null;
  // Коментарі й позначки з розгорнутої картки належать читачеві. Беремо
  // вихідну чернетку й перевіряємо її повний знімок в транзакції.
  if (isDraft && (!draft || !['private', 'pendingReview', 'publishing'].includes(draft.status)
    || Number(draft.revision) !== Number(canonical.__profileMutationRevision))) throw fail('REVISION_CONFLICT');
  if (expectedDraft && (!draft || !areProposalValuesEqual(createEditorSnapshot(draft), expectedDraft))) {
    throw fail('REVISION_CONFLICT');
  }
  const primary = resolveCanonicalFieldName(fieldName);
  const node = resolveFieldOwnerNode(fieldName);
  if (!isDraft && !node) throw fail('INVALID_DRAFT');

  const fieldRef = isDraft ? null : ref(database, `${node}/${cardUserId}/${primary}`);
  const observed = isDraft ? draft.data?.[fieldName] ?? null : (await get(fieldRef)).val();
  const original = readOriginal(expectedCurrent, fieldName, change, observed);
  const applyTo = base => {
    const value = normalizeStoredDates({ [primary]: applyField(fieldName, base, change) })[primary] ?? null;
    if (node !== PROFILE_NODES.matchingCards || value === null || isDraft) return value;
    return buildMatchingCardProjection(cardUserId, { ...canonical, [primary]: value })?.[primary] ?? null;
  };
  let previous = original;
  let desired = applyTo(original);
  if (!same(observed, original) && !same(observed, desired)) {
    // Інший дописувач міг уже додати свій номер до тих самих вихідних значень.
    // Порівнюємо з новим знімком лише для додавання, яке збереже їх усі.
    if (!canAppendToCurrent(change, original, observed)) throw fail('REVISION_CONFLICT');
    previous = observed;
    desired = applyTo(observed);
  }

  const locator = {
    cardUserId, editorUserId, fieldName, value,
    ...(selection.replacement && { replacement: selection.replacement }),
  };
  const claimed = await claimOverlayValueForReview({ ...locator, acceptedValue, expectedCurrent });
  let fieldApplied = false;
  try {
    if (isDraft) {
      if (!same(observed, desired)) {
        const data = { ...draft.data };
        if (desired === null) delete data[fieldName];
        else data[fieldName] = desired;
        draft = await saveCreateProfileMutation({
          cardId: cardUserId, creatorUid, actorUid, data, expectedCurrent: draft, skipRevisionHistory: true,
        });
      }
      fieldApplied = true;
    } else {
      await writeField(fieldRef, previous, desired);
      fieldApplied = true;
      await syncUserSearchIdIndex(cardUserId, { [fieldName]: previous }, { [fieldName]: desired });
      await syncFieldProjection(cardUserId, fieldName, primary, { ...canonical, [primary]: previous });
    }
    const settled = await settleOverlayValueForCard({
      ...locator, action: 'accept', acceptedValue, expectedCurrent: claimed,
      acceptedOriginal: desired === null ? { present: false } : { present: true, value: desired },
    });
    if (!settled) throw fail('REVISION_CONFLICT');
    return { value: desired, remainingOverlay: settled.remainingOverlay, ...(draft && { draft }) };
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
