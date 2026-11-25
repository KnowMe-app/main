import { get, ref } from 'firebase/database';

import { database, fetchProfileDraftById } from 'components/config';
import { createProfileProposalAdapter } from './createProfileProposalAdapter';

import { isAdminUid } from './accessLevel';
import {
  getOverlayHistoryForCard,
  getOwnOverlayCardIndex,
  readOverlayRecord,
  readOverlayRecordsForReview,
  removeOverlayForUserCard,
  saveOverlayForUserCard,
  settleOverlayValueForCard,
} from './multiAccountEdits';
import { INDEXABLE_DRAFT_STATUSES } from './profileDraftIndexing';
import { isPlainObject } from './profileFieldChanges';
import { PROFILE_NODES } from './profileNodeSchema';
import { approveOverlayValue } from './profileOverlayReview';
import { readLegacyUpdateProposal } from './profileProposalLegacyRecords';

const adapterError = code => Object.assign(new Error(code), { code });

const getDraft = async ({ cardId, createdBy }) => {
  const record = await readOverlayRecord({ cardUserId: cardId, editorUserId: createdBy });
  if (record === null) return null;

  const proposal = readLegacyUpdateProposal(record, { cardId, editorUid: createdBy });
  if (!proposal) throw adapterError('INVALID_DRAFT');
  return { proposal, record };
};

const list = async ({ actorUid, createdBy, review }) => {
  if (review) {
    const cards = await readOverlayRecordsForReview();
    return Object.entries(cards).flatMap(([cardId, editors]) => (
      Object.entries(editors || {})
        .filter(([editorId]) => !createdBy || editorId === createdBy)
        .map(([editorId, record]) => readLegacyUpdateProposal(record, { cardId, editorUid: editorId }))
        .filter(Boolean)
    ));
  }

  const editorId = createdBy || actorUid;
  const { cardUserIds } = await getOwnOverlayCardIndex(editorId, { throwOnError: true });
  const records = await Promise.all(cardUserIds.map(cardId => getDraft({ cardId, createdBy: editorId })));
  return records.filter(Boolean).map(({ proposal }) => proposal);
};

const canUseLegacyDraftTarget = current => (
  current?.proposal?.legacy?.source === 'edits' || current?.record?.proposal?.legacyDraftTarget === true
);

const canonicalBodyNodes = Object.values(PROFILE_NODES).filter(node => node !== PROFILE_NODES.matchingCards);
const isProfileNode = snapshot => snapshot.exists() && isPlainObject(snapshot.val());

const checkTarget = async (proposal, { current, actorUid } = {}) => {
  const cardId = proposal.targetCardId;
  if (!cardId) throw adapterError('INVALID_DRAFT');
  const readNode = node => get(ref(database, `${node}/${cardId}`));
  if (isProfileNode(await readNode(PROFILE_NODES.matchingCards))) return;

  if (actorUid === cardId || isAdminUid(actorUid)) {
    const body = await Promise.all(canonicalBodyNodes.map(readNode));
    if (body.some(isProfileNode)) return;
  }

  if (canUseLegacyDraftTarget(current) || proposal.targetCreateProposalId) {
    const target = await fetchProfileDraftById(cardId);
    if (
      target?.userId === cardId && target.__profileMutationOperation === 'create'
      && INDEXABLE_DRAFT_STATUSES.has(target.__profileMutationStatus)
    ) {
      if (canUseLegacyDraftTarget(current)) return;
      const createdBy = target.__profileMutationCreatedBy;
      const parent = createdBy && await createProfileProposalAdapter.get({ cardId, createdBy });
      if (parent?.proposal.id === proposal.targetCreateProposalId) return;
    }
  }
  throw adapterError('TARGET_NOT_FOUND');
};

const save = async (proposal, { current, actorUid } = {}) => {
  if (
    proposal?.operation !== 'update' || !isPlainObject(proposal.changes)
    || typeof proposal.id !== 'string' || !proposal.id.trim()
    || !Number.isSafeInteger(proposal.revision) || proposal.revision < 1
  ) throw adapterError('INVALID_DRAFT');

  const { targetCardId, createdBy, changes, id, createdAt, updatedAt, revision } = proposal;
  const replacements = Object.fromEntries(
    Object.entries(changes).flatMap(([field, change]) => (
      change.replacements ? [[field, change.replacements]] : []
    )),
  );
  const record = await saveOverlayForUserCard({
    cardUserId: targetCardId,
    editorUserId: createdBy,
    fields: changes,
    expectedCurrent: current?.record ?? null,
    actorUid,
    updatedAt,
    proposal: {
      id,
      createdAt: createdAt ?? null,
      revision,
      baseCardRevision: proposal.baseCardRevision ?? null,
      originalValues: JSON.stringify(proposal.originalValues ?? {}),
      replacements: JSON.stringify(replacements),
      ...(proposal.targetCreateProposalId && { targetCreateProposalId: proposal.targetCreateProposalId }),
      ...(canUseLegacyDraftTarget(current) && { legacyDraftTarget: true }),
    },
  });
  const saved = readLegacyUpdateProposal(record, { cardId: targetCardId, editorUid: createdBy });
  if (!saved) throw adapterError('PARTIAL_WRITE');
  return saved;
};

const remove = ({ proposal, record }) => {
  if (!record) throw adapterError('INVALID_DRAFT');
  return removeOverlayForUserCard({
    cardUserId: proposal.targetCardId,
    editorUserId: proposal.createdBy,
    expectedCurrent: record,
  });
};

const history = async ({ cardId, createdBy }) => {
  const entries = await getOverlayHistoryForCard(cardId);
  return entries.filter(entry => entry.editorUserId === createdBy);
};

const review = async (decision, { locator }) => {
  const { fieldName, value, expectedCurrent, expectedDraft, acceptedValue, replacement, action } = decision;
  if (!fieldName || !isPlainObject(expectedCurrent)) throw adapterError('REVISION_CONFLICT');
  const data = {
    cardUserId: locator.cardId, editorUserId: locator.createdBy,
    fieldName, value, expectedCurrent, expectedDraft, acceptedValue, replacement,
  };
  const result = action === 'accept'
    ? await approveOverlayValue(data)
    : await settleOverlayValueForCard({ ...data, action: 'discard' });
  if (!result) throw adapterError('REVISION_CONFLICT');
  return result;
};

export const updateProfileProposalAdapter = { get: getDraft, list, save, remove, review, history, checkTarget };
