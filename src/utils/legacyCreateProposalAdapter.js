import {
  acceptCreateProfileMutation,
  deleteCreateProfileMutation,
  loadAllCreateProfileMutations,
  loadOwnProfileMutations,
  loadProfileMutation,
  loadProfileMutationHistory,
  rejectCreateProfileMutation,
  saveCreateProfileMutation,
} from './profileMutations';
import { readLegacyCreateProposal } from './profileProposalLegacyRecords';

const invalidDraft = () => Object.assign(new Error('INVALID_DRAFT'), { code: 'INVALID_DRAFT' });

// RTDB не зберігає порожні гілки. Масив і об'єкт з числовими ключами
// описують ті самі дочірні записи, тож для порівняння лишаємо лише ці ключі.
const normalizeData = value => {
  if (value == null) return undefined;
  if (typeof value !== 'object') return value;
  const entries = Object.entries(value)
    .map(([field, item]) => [field, normalizeData(item)])
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
};

const get = async ({ cardId, createdBy }) => {
  const record = await loadProfileMutation(createdBy, cardId);
  if (!record) return null;
  const proposal = readLegacyCreateProposal(record, { creatorUid: createdBy, cardId });
  if (!proposal) throw invalidDraft();
  return { proposal, record };
};

const list = async ({ actorUid, createdBy, review }) => {
  const owner = createdBy || actorUid;
  const records = review
    ? await loadAllCreateProfileMutations()
    : await loadOwnProfileMutations(owner, { includeAccepted: true });
  return records
    .filter(record => !review || !createdBy || record.createdBy === createdBy)
    .map(record => readLegacyCreateProposal(record, review ? undefined : { creatorUid: owner }))
    .filter(Boolean);
};

const save = async (proposal, { current, actorUid }) => {
  const record = await saveCreateProfileMutation({
    cardId: proposal.reservedCardId,
    creatorUid: proposal.createdBy,
    actorUid,
    data: proposal.data,
    expectedCurrent: current?.record ?? null,
    proposalId: current ? current.record.proposalId : proposal.id,
    proposalRevision: proposal.revision,
  });
  const saved = readLegacyCreateProposal(record, { creatorUid: proposal.createdBy, cardId: proposal.reservedCardId });
  if (!saved) throw invalidDraft();
  return saved;
};

const remove = async ({ record, proposal }) => {
  const result = await deleteCreateProfileMutation({
    cardId: proposal.reservedCardId,
    creatorUid: proposal.createdBy,
    expectedCurrent: record,
  });
  if (result.failures.length) {
    throw Object.assign(new Error('PARTIAL_WRITE'), { code: 'PARTIAL_WRITE', ...result });
  }
};

const review = async ({ action, expected, expectedRevision, finalData }, { locator, read, compareExpected }) => {
  const current = await read();
  if (!current) throw Object.assign(new Error('DRAFT_NOT_FOUND'), { code: 'DRAFT_NOT_FOUND' });
  const acceptedRetry = action === 'accept' && current.proposal.status === 'accepted';
  if (!acceptedRetry) {
    compareExpected(current, expected);
    if (current.proposal.status !== 'pendingReview') {
      throw Object.assign(new Error('REVISION_CONFLICT'), { code: 'REVISION_CONFLICT' });
    }
  }
  const options = {
    cardId: locator.cardId,
    creatorUid: locator.createdBy,
    expectedRevision: expected?.revision ?? expectedRevision,
    expectedCurrent: current.record,
  };
  return action === 'accept'
    ? acceptCreateProfileMutation({ ...options, finalData })
    : rejectCreateProfileMutation(options);
};

export const legacyCreateProposalAdapter = {
  get,
  list,
  save,
  remove,
  review,
  normalizeData,
  history: ({ cardId }) => loadProfileMutationHistory(cardId),
};
