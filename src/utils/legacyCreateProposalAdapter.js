import {
  deleteCreateProfileMutation,
  loadAllCreateProfileMutations,
  loadOwnProfileMutations,
  loadProfileMutation,
  loadProfileMutationHistory,
  saveCreateProfileMutation,
} from './profileMutations';
import { normalizeLegacyCreateProposal } from './profileProposals';

const normalize = (record, location) => {
  const proposal = normalizeLegacyCreateProposal(record, location);
  if (!proposal) return null;
  if (typeof record.proposalId === 'string' && record.proposalId.trim()) proposal.id = record.proposalId;
  if (record.duplicateConflicts?.length) {
    Object.defineProperty(proposal, 'duplicateConflicts', { value: record.duplicateConflicts });
  }
  return proposal;
};

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
  const proposal = normalize(record, { creatorUid: createdBy, cardId });
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
    .map(record => normalize(record, review ? undefined : { creatorUid: owner }))
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
  const saved = normalize(record, { creatorUid: proposal.createdBy, cardId: proposal.reservedCardId });
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

export const legacyCreateProposalAdapter = {
  get,
  list,
  save,
  remove,
  normalizeData,
  history: ({ cardId }) => loadProfileMutationHistory(cardId),
};
